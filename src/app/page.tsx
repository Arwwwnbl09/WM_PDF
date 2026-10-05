"use client";
import { useState } from "react";
import Link from "next/link";
import { PdfUploader } from "@/components/pdf/PdfUploader";
import { PdfPreview } from "@/components/pdf/PdfPreview";
import { WatermarkSettings } from "@/components/watermark/WatermarkSettings";
import { Icon } from "@/components/ui/Icon";
import { defaultWatermark } from "@/lib/watermark";
import type { WatermarkConfig } from "@/types/watermark";
import { usePdfProcessing } from "@/lib/pdf/usePdfProcessing";
import { ProcessingResult } from "@/components/pdf/ProcessingResult";
export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [validFile, setValidFile] = useState<File | null>(null);
  const [revision, setRevision] = useState(0);
  const [config, setConfig] = useState<WatermarkConfig>(defaultWatermark);
  const [resetRevision, setResetRevision] = useState(0);
  const [colorValid, setColorValid] = useState(true);
  const processing = usePdfProcessing();
  const canProcess = Boolean(
    file &&
    validFile === file &&
    config.text.trim() &&
    colorValid &&
    processing.state.status !== "processing",
  );
  function reset() {
    processing.invalidate();
    setFile(null);
    setValidFile(null);
    setConfig({ ...defaultWatermark });
    setColorValid(true);
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
            <p>Tambahkan watermark ke seluruh halaman PDF.</p>
          </div>
        </div>
        <div className="workspace-grid">
          <div className="preview-column">
            <PdfUploader
              key={resetRevision}
              file={file}
              onChange={(value) => {
                setFile(value);
                setValidFile(null);
                setRevision((previous) => previous + 1);
                processing.invalidate();
              }}
            />
            <PdfPreview
              config={config}
              file={file}
              revision={revision}
              onValidated={setValidFile}
            />
            <div className="local-note">
              <Icon name="shield" size={17} />
              <p>
                PDF dikirim ke server setelah Anda menekan Proses PDF. File
                sementara dihapus setelah proses selesai.
              </p>
            </div>
          </div>
          <WatermarkSettings
            key={resetRevision}
            config={config}
            onChange={(value) => {
              setConfig(value);
              processing.invalidate();
            }}
            hasFile={Boolean(file && validFile === file)}
            canProcess={canProcess}
            isProcessing={processing.state.status === "processing"}
            onColorEdit={(valid) => {
              setColorValid(valid);
              processing.invalidate();
            }}
            onProcess={() => {
              if (canProcess && file) void processing.process(file, config);
            }}
            onReset={reset}
            onDraftEdit={processing.invalidate}
            result={
              <ProcessingResult
                state={processing.state}
                onCancel={processing.invalidate}
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
