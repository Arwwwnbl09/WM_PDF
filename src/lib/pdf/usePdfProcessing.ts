"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelPdf,
  pdfProgress,
  processPdf,
  type ProcessedPdf,
} from "@/lib/api/pdf";
import type { WatermarkConfig } from "@/types/watermark";
import { downloadPdf } from "./download";
import { createProgressId } from "./progressId";

export type ProcessingState =
  | { status: "idle" }
  | { status: "processing"; percentage: number }
  | { status: "success"; result: ProcessedPdf & { url: string } }
  | { status: "error"; message: string };

export function usePdfProcessing() {
  const [state, setState] = useState<ProcessingState>({ status: "idle" });
  const request = useRef<{
    controller: AbortController;
    progressId?: string;
  } | null>(null);
  const cancellation = useRef<Promise<void>>(Promise.resolve());
  const resultUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const cleanup = useCallback(() => {
    generation.current++;
    const active = request.current;
    active?.controller.abort();
    if (active?.progressId) {
      const id = active.progressId;
      cancellation.current = cancellation.current
        .then(() => cancelPdf(id))
        .catch(() => {
          // An unavailable server is reported by the next processing request.
        });
    }
    request.current = null;
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null;
  }, []);
  const invalidate = useCallback(() => {
    cleanup();
    setState({ status: "idle" });
  }, [cleanup]);
  useEffect(() => cleanup, [cleanup]);

  const process = useCallback(
    async (file: File, config: WatermarkConfig) => {
      if (request.current) return;
      cleanup();
      const token = generation.current;
      const controller = new AbortController();
      const active: { controller: AbortController; progressId?: string } = {
        controller,
      };
      request.current = active;
      setState({ status: "processing", percentage: 0 });
      let timer: ReturnType<typeof setInterval> | undefined;
      try {
        // Cancel releases the old worker before a replacement upload starts.
        await cancellation.current;
        if (generation.current !== token || controller.signal.aborted) return;
        const progressId = createProgressId();
        active.progressId = progressId;
        let polling = false;
        timer = setInterval(async () => {
          if (polling || controller.signal.aborted) return;
          polling = true;
          try {
            const percentage = await pdfProgress(progressId, controller.signal);
            if (
              percentage === undefined ||
              generation.current !== token ||
              controller.signal.aborted
            )
              return;
            setState((previous) =>
              previous.status === "processing"
                ? {
                    status: "processing",
                    percentage: Math.max(
                      previous.percentage,
                      Math.min(99, percentage),
                    ),
                  }
                : previous,
            );
          } finally {
            polling = false;
          }
        }, 500);
        const result = await processPdf(
          file,
          config,
          controller.signal,
          progressId,
        );
        if (generation.current !== token || controller.signal.aborted) return;
        const url = URL.createObjectURL(result.blob);
        resultUrl.current = url;
        setState({ status: "success", result: { ...result, url } });
        try {
          // Start once, after the PDF is received and validated. Browser settings
          // decide whether to open Save As; native pickers need a fresh click.
          downloadPdf(url, result.filename);
        } catch {
          // Keep the valid result available through the manual retry action.
        }
      } catch (error) {
        if (generation.current !== token || controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Gagal memproses PDF. Silakan coba lagi.",
        });
      } finally {
        clearInterval(timer);
        if (request.current === active) request.current = null;
      }
    },
    [cleanup],
  );
  return { state, process, invalidate };
}
