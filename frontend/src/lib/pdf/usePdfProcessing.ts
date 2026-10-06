"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelPdf, pdfProgress, processPdf } from "@/lib/api/pdf";
import type { ProcessedPdf } from "@/lib/api/pdf";
import type { WatermarkConfig } from "@/types/watermark";
import { downloadPdf } from "./download";
import { createProgressId } from "./progressId";

export type ProcessingState =
  | { status: "idle" }
  | { status: "queued" }
  | { status: "processing"; percentage: number }
  | { status: "success"; result: ProcessedPdf & { url: string } }
  | { status: "error"; message: string };

export interface PdfJob {
  id: string;
  file: File;
  displayName?: string;
  outputFilename?: string;
  config: WatermarkConfig;
}

export interface ProcessingRun {
  total: number;
  index: number;
  filename: string;
  percentage: number;
}

export function usePdfProcessing() {
  const [states, setStates] = useState<Record<string, ProcessingState>>({});
  const [run, setRun] = useState<ProcessingRun | null>(null);
  const request = useRef<{
    controller: AbortController;
    progressId?: string;
  } | null>(null);
  const cancellation = useRef<Promise<void>>(Promise.resolve());
  const resultUrls = useRef(new Map<string, string>());
  const generation = useRef(0);

  const cancelRequest = useCallback(() => {
    generation.current++;
    const active = request.current;
    active?.controller.abort();
    if (active?.progressId) {
      const id = active.progressId;
      cancellation.current = cancellation.current
        .then(() => cancelPdf(id))
        .catch(() => {
          // A failed connection is reported by the next processing request.
        });
    }
    request.current = null;
  }, []);

  const releaseResult = useCallback((id: string) => {
    const url = resultUrls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    resultUrls.current.delete(id);
  }, []);

  const stop = useCallback(() => {
    cancelRequest();
    setRun(null);
    setStates((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([id, state]) => [
          id,
          state.status === "processing" || state.status === "queued"
            ? { status: "idle" }
            : state,
        ]),
      ),
    );
  }, [cancelRequest]);

  const invalidate = useCallback(
    (id?: string) => {
      stop();
      if (id) releaseResult(id);
      else for (const key of resultUrls.current.keys()) releaseResult(key);
      setStates((previous) => {
        if (!id) return {};
        const next = { ...previous };
        delete next[id];
        return next;
      });
    },
    [stop, releaseResult],
  );

  useEffect(() => {
    const urls = resultUrls.current;
    return () => {
      cancelRequest();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, [cancelRequest]);

  const processBatch = useCallback(
    async (inputJobs: PdfJob[]) => {
      if (request.current || !inputJobs.length) return;
      // Freeze each file's settings before the first upload starts.
      const jobs = inputJobs.map((job) => ({
        ...job,
        config: { ...job.config },
      }));
      const token = ++generation.current;
      const controller = new AbortController();
      const active: { controller: AbortController; progressId?: string } = {
        controller,
      };
      request.current = active;
      for (const job of jobs) releaseResult(job.id);
      setStates((previous) => ({
        ...previous,
        ...Object.fromEntries(jobs.map(({ id }) => [id, { status: "queued" }])),
      }));
      setRun({
        total: jobs.length,
        index: 1,
        filename: jobs[0].displayName ?? jobs[0].file.name,
        percentage: 0,
      });
      const current = () =>
        generation.current === token && !controller.signal.aborted;
      try {
        // Wait until cancellation has released the previous backend worker.
        await cancellation.current;
        if (!current()) return;
        for (const [index, job] of jobs.entries()) {
          if (!current()) return;
          let timer: ReturnType<typeof setInterval> | undefined;
          let percentage = 0;
          let finished = false;
          const updateProgress = (value: number) => {
            if (!current() || finished) return;
            percentage = Math.max(percentage, Math.min(99, value));
            setStates((previous) => ({
              ...previous,
              [job.id]: { status: "processing", percentage },
            }));
            setRun({
              total: jobs.length,
              index: index + 1,
              filename: job.displayName ?? job.file.name,
              percentage: Math.floor((index * 100 + percentage) / jobs.length),
            });
          };
          updateProgress(0);
          try {
            const progressId = createProgressId();
            active.progressId = progressId;
            let polling = false;
            timer = setInterval(async () => {
              if (polling || !current()) return;
              polling = true;
              try {
                const value = await pdfProgress(progressId, controller.signal);
                if (value !== undefined) updateProgress(value);
              } finally {
                polling = false;
              }
            }, 500);
            const processed = await processPdf(
              job.file,
              job.config,
              controller.signal,
              progressId,
            );
            if (!current()) return;
            const result = {
              ...processed,
              filename: job.outputFilename ?? processed.filename,
            };
            const url = URL.createObjectURL(result.blob);
            resultUrls.current.set(job.id, url);
            setStates((previous) => ({
              ...previous,
              [job.id]: { status: "success", result: { ...result, url } },
            }));
            try {
              downloadPdf(url, result.filename);
            } catch {
              // The result remains available through the manual save action.
            }
          } catch (error) {
            if (!current()) return;
            setStates((previous) => ({
              ...previous,
              [job.id]: {
                status: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Gagal memproses PDF. Silakan coba lagi.",
              },
            }));
          } finally {
            finished = true;
            clearInterval(timer);
            active.progressId = undefined;
          }
        }
      } finally {
        if (request.current === active) request.current = null;
        if (current()) setRun(null);
      }
    },
    [releaseResult],
  );
  return { states, run, processBatch, invalidate, stop };
}
