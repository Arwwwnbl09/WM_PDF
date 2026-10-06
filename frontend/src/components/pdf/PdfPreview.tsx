"use client";
import dynamic from "next/dynamic";
import { Icon } from "@/components/ui/Icon";
import type { WatermarkConfig } from "@/types/watermark";

const PdfDocumentPreview = dynamic(() => import("./PdfDocumentPreview"), {
  ssr: false,
  loading: () => (
    <p className="pdf-loading" role="status">
      Memuat PDF...
    </p>
  ),
});

export function PdfPreview({
  config,
  file,
  filename,
  revision,
  onValidated,
}: {
  config: WatermarkConfig;
  file: File | null;
  filename?: string;
  revision: number;
  onValidated: (file: File | null) => void;
}) {
  return (
    <section className="card preview-card" aria-labelledby="preview-title">
      <div className="card-heading">
        <span className="heading-icon">
          <Icon name="eye" />
        </span>
        <div>
          <h2 id="preview-title">Pratinjau dokumen</h2>
          <p>Periksa watermark sebelum PDF diproses.</p>
        </div>
        <span className="live-badge">
          <i />
          Pratinjau
        </span>
      </div>
      <div className="preview-toolbar">
        <span className="preview-file">
          <Icon name="file" size={15} />
          <span title={filename ?? file?.name}>
            {filename ?? file?.name ?? "Belum ada PDF"}
          </span>
        </span>
      </div>
      {file ? (
        <PdfDocumentPreview
          key={revision}
          file={file}
          config={config}
          onValidated={onValidated}
        />
      ) : (
        <div className="pdf-empty-state">
          <Icon name="file" size={42} />
          <strong>Belum ada PDF</strong>
          <p>Pilih file PDF untuk mulai mengatur watermark.</p>
        </div>
      )}
      <div className="preview-footer">
        <span className="sample-badge">PRATINJAU</span>
        <p>File asli tidak berubah. Watermark diterapkan saat PDF diproses.</p>
      </div>
    </section>
  );
}
