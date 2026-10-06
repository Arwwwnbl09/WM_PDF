"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { PdfUploader } from "@/components/pdf/PdfUploader";
import { PdfPreview } from "@/components/pdf/PdfPreview";
import { PdfQueue } from "@/components/pdf/PdfQueue";
import { WatermarkSettings } from "@/components/watermark/WatermarkSettings";
import { Icon } from "@/components/ui/Icon";
import { defaultWatermark } from "@/lib/watermark";
import type { OutputQuality, WatermarkConfig } from "@/types/watermark";
import type { PdfEntry } from "@/types/pdf";
import { usePdfProcessing } from "@/lib/pdf/usePdfProcessing";
import { ProcessingResult } from "@/components/pdf/ProcessingResult";
import { secureFilename } from "@/lib/api/pdf";
import { inspectOutputName, outputName } from "@/lib/pdf/filename";
import { PdfFilenameField } from "@/components/pdf/PdfFilenameField";

export default function Home() {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validFile, setValidFile] = useState<File | null>(null);
  const [revision, setRevision] = useState(0);
  const [emptyConfig, setEmptyConfig] = useState<WatermarkConfig>({
    ...defaultWatermark,
  });
  const [resetRevision, setResetRevision] = useState(0);
  const nextId = useRef(0);
  const copyCounts = useRef(new Map<File, number>());
  const processing = usePdfProcessing();
  const active = entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const config = {
    ...(active?.config ?? emptyConfig),
    outputQuality: emptyConfig.outputQuality,
  };
  const isProcessing = processing.run !== null;
  const multiple = entries.length > 1;
  function nameFor(entry: PdfEntry) {
    const state = processing.states[entry.id];
    return outputName(
      entry,
      state?.status === "success" ? state.result.filename : undefined,
    );
  }
  const ready = (entry: PdfEntry) =>
    Boolean(
      entry.config.text.trim() &&
      entry.colorValid &&
      entry.draftValid &&
      !inspectOutputName(nameFor(entry)).error,
    );
  const canProcess = Boolean(
    active && validFile === active.file && ready(active) && !isProcessing,
  );
  const pending = entries.filter(
    (entry) => processing.states[entry.id]?.status !== "success",
  );
  const canProcessAll =
    !isProcessing && pending.length > 0 && pending.every(ready);

  function select(id: string) {
    if (id === active?.id) return;
    // Changing files discards unfinished input drafts, while retaining committed settings.
    if (active)
      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === active.id
            ? { ...entry, colorValid: true, draftValid: true }
            : entry,
        ),
      );
    setSelectedId(id);
    setValidFile(null);
    setRevision((value) => value + 1);
  }
  function updateEntry(id: string, changes: Partial<PdfEntry>) {
    processing.invalidate(id);
    setEntries((previous) =>
      previous.map((entry) =>
        entry.id === id ? { ...entry, ...changes } : entry,
      ),
    );
  }
  function rename(id: string, value: string) {
    if (isProcessing) return;
    // Renaming changes only the next save, so the processed PDF remains usable.
    setEntries((previous) =>
      previous.map((entry) =>
        entry.id === id ? { ...entry, outputFilename: value } : entry,
      ),
    );
  }
  function changeQuality(outputQuality: OutputQuality) {
    if (isProcessing || outputQuality === emptyConfig.outputQuality) return;
    processing.invalidate();
    setEmptyConfig((previous) => ({ ...previous, outputQuality }));
    setEntries((previous) =>
      previous.map((entry) => ({
        ...entry,
        config: { ...entry.config, outputQuality },
      })),
    );
  }
  function processingJob(entry: PdfEntry) {
    return {
      ...entry,
      config: { ...entry.config, outputQuality: emptyConfig.outputQuality },
      outputFilename:
        entry.outputFilename === undefined
          ? undefined
          : (inspectOutputName(entry.outputFilename).filename ?? undefined),
    };
  }
  function changeFiles(files: File[], append = false) {
    if (isProcessing) return;
    if (append && !files.length) return;
    const added = files.map((file) => ({
      id: `pdf-${++nextId.current}`,
      file,
      config: { ...config },
      colorValid: true,
      draftValid: true,
    }));
    if (append) {
      setEntries((previous) => [...previous, ...added]);
    } else {
      processing.invalidate();
      copyCounts.current.clear();
      setEntries(added);
      setSelectedId(added[0]?.id ?? null);
      setValidFile(null);
      setRevision((value) => value + 1);
    }
  }
  function remove(id: string) {
    if (isProcessing) return;
    processing.invalidate(id);
    const next = entries.filter((entry) => entry.id !== id);
    const removed = entries.find((entry) => entry.id === id);
    if (removed && !next.some((entry) => entry.file === removed.file))
      copyCounts.current.delete(removed.file);
    setEntries(next);
    if (id === active?.id) {
      setSelectedId(next[0]?.id ?? null);
      setValidFile(null);
      setRevision((value) => value + 1);
    }
  }
  function duplicate(id: string) {
    if (isProcessing) return;
    const source = entries.find((entry) => entry.id === id);
    if (!source) return;
    const number = (copyCounts.current.get(source.file) ?? 0) + 1;
    copyCounts.current.set(source.file, number);
    const copy: PdfEntry = {
      id: `pdf-${++nextId.current}`,
      file: source.file,
      displayName: `${source.file.name} (salinan ${number})`,
      outputFilename: secureFilename(source.file.name).replace(
        /\.pdf$/i,
        `_salinan_${number}.pdf`,
      ),
      config: {
        ...source.config,
        text: "",
        outputQuality: emptyConfig.outputQuality,
      },
      colorValid: true,
      draftValid: true,
    };
    setEntries((previous) => [
      ...previous.map((entry) =>
        entry.id === active?.id
          ? { ...entry, colorValid: true, draftValid: true }
          : entry,
      ),
      copy,
    ]);
    setSelectedId(copy.id);
    setValidFile(null);
    setRevision((value) => value + 1);
  }
  function reset() {
    processing.invalidate();
    copyCounts.current.clear();
    setEntries([]);
    setSelectedId(null);
    setValidFile(null);
    setEmptyConfig({ ...defaultWatermark });
    setRevision((value) => value + 1);
    setResetRevision((value) => value + 1);
  }
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link
            className="brand"
            href="/"
            aria-label="Secure PDF Watermark beranda"
          >
            <span className="brand-icon">
              <Icon name="shield" size={23} />
            </span>
            <span>
              Secure<span className="brand-light">PDF</span>
            </span>
          </Link>
        </div>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow">WATERMARK PDF</div>
            <h1>
              Secure PDF Watermark<span>.</span>
            </h1>
            <p>
              Tambahkan watermark ke seluruh halaman PDF. Teks dapat berbeda
              untuk setiap file.
            </p>
          </div>
        </div>
        <div className="workspace-grid">
          <div className="preview-column">
            <PdfUploader
              key={resetRevision}
              file={active?.file ?? null}
              displayName={active?.displayName}
              count={entries.length}
              disabled={isProcessing}
              onChange={changeFiles}
              onDuplicate={() => {
                if (active) duplicate(active.id);
              }}
            />
            {multiple && (
              <PdfQueue
                entries={entries}
                selectedId={active?.id ?? null}
                states={processing.states}
                isProcessing={isProcessing}
                canProcess={canProcessAll}
                onSelect={select}
                onRemove={remove}
                onDuplicate={duplicate}
                onFilenameChange={rename}
                onTextChange={(id, text) => {
                  const entry = entries.find((entry) => entry.id === id);
                  if (entry)
                    updateEntry(id, { config: { ...entry.config, text } });
                }}
                onProcess={() => {
                  if (canProcessAll)
                    void processing.processBatch(pending.map(processingJob));
                }}
              />
            )}
            <PdfPreview
              config={config}
              file={active?.file ?? null}
              filename={active?.displayName}
              revision={revision}
              onValidated={setValidFile}
            />
            <div className="local-note">
              <Icon name="shield" size={17} />
              <p>
                PDF dikirim ke server setelah Anda menekan Proses PDF atau
                Proses semua. File sementara dihapus setelah proses selesai.
              </p>
            </div>
          </div>
          <WatermarkSettings
            key={`${resetRevision}:${active?.id ?? "empty"}`}
            config={config}
            onQualityChange={changeQuality}
            filename={
              multiple ? (active?.displayName ?? active?.file.name) : undefined
            }
            onChange={(value) => {
              if (active) updateEntry(active.id, { config: value });
              else setEmptyConfig(value);
            }}
            hasFile={Boolean(active && validFile === active.file)}
            canProcess={canProcess}
            isProcessing={isProcessing}
            locked={multiple && isProcessing}
            filenameField={
              active && !multiple ? (
                <PdfFilenameField
                  id={`output-name-${active.id}`}
                  value={nameFor(active)}
                  disabled={isProcessing}
                  onChange={(value) => rename(active.id, value)}
                />
              ) : undefined
            }
            onColorEdit={(valid) => {
              if (active) updateEntry(active.id, { colorValid: valid });
            }}
            onDraftValidityChange={(valid) => {
              if (active)
                setEntries((previous) =>
                  previous.map((entry) =>
                    entry.id === active.id
                      ? { ...entry, draftValid: valid }
                      : entry,
                  ),
                );
            }}
            onProcess={() => {
              if (canProcess && active)
                void processing.processBatch([processingJob(active)]);
            }}
            onReset={reset}
            onDraftEdit={() => {
              if (active) processing.invalidate(active.id);
            }}
            result={
              <ProcessingResult
                filename={
                  active
                    ? (inspectOutputName(nameFor(active)).filename ?? undefined)
                    : undefined
                }
                canSave={Boolean(
                  active && !inspectOutputName(nameFor(active)).error,
                )}
                state={
                  processing.run
                    ? {
                        status: "processing",
                        percentage: processing.run.percentage,
                      }
                    : multiple
                      ? { status: "idle" }
                      : (active && processing.states[active.id]) || {
                          status: "idle",
                        }
                }
                detail={
                  multiple && processing.run
                    ? `File ${processing.run.index} / ${processing.run.total} · ${processing.run.filename}`
                    : undefined
                }
                onCancel={processing.stop}
              />
            }
          />
        </div>
        <footer className="site-footer">
          <span>Secure PDF Watermark</span>
        </footer>
      </main>
    </>
  );
}
