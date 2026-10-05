"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePdfDocument } from "@/lib/pdf/usePdfDocument";
import type { WatermarkConfig } from "@/types/watermark";
import { PdfToolbar } from "./PdfToolbar";
import { PdfPage } from "./PdfPage";

export default function PdfDocumentPreview({
  file,
  config,
  onValidated,
}: {
  file: File;
  config: WatermarkConfig;
  onValidated: (file: File | null) => void;
}) {
  const { document, error } = usePdfDocument(file);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const onReady = useCallback(
    (ready: boolean) => onValidated(ready ? file : null),
    [file, onValidated],
  );
  return (
    <div ref={containerRef}>
      {error ? (
        <div className="pdf-error" role="alert">
          {error}
        </div>
      ) : !document ? (
        <p className="pdf-loading" role="status">
          Memuat PDF...
        </p>
      ) : (
        <>
          <PdfToolbar
            page={page}
            total={document.numPages}
            zoom={zoom}
            onPage={setPage}
            onZoom={setZoom}
          />
          <div className="pdf-scroll-area">
            {availableWidth > 0 && (
              <PdfPage
                key={`${page}:${zoom}:${availableWidth}`}
                pdf={document}
                pageNumber={page}
                zoom={zoom}
                availableWidth={availableWidth}
                config={config}
                onReady={onReady}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
