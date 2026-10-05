"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { WatermarkOverlay } from "@/components/watermark/WatermarkOverlay";
import type { WatermarkConfig } from "@/types/watermark";
import {
  CSS_PIXELS_PER_POINT,
  type PreviewSize,
} from "@/lib/watermark/preview";
import { pdfErrorMessage } from "@/lib/pdf/client";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  availableWidth: number;
  config: WatermarkConfig;
  onReady: (ready: boolean) => void;
}
export function PdfPage({
  pdf,
  pageNumber,
  zoom,
  availableWidth,
  config,
  onReady,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PreviewSize | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let renderTask: RenderTask | undefined;
    let page: PDFPageProxy | undefined;
    const container = host.current;
    async function render() {
      try {
        page = await pdf.getPage(pageNumber);
        if (disposed) {
          page.cleanup();
          return;
        }
        const base = page.getViewport({ scale: CSS_PIXELS_PER_POINT });
        const scale =
          zoom * Math.min(1, Math.max(1, availableWidth - 52) / base.width);
        const viewport = page.getViewport({
          scale: CSS_PIXELS_PER_POINT * scale,
        });
        const canvas = document.createElement("canvas");
        // Bound backing memory for unusually large pages while preserving CSS geometry.
        const resolution = Math.min(
          window.devicePixelRatio || 1,
          2,
          8192 / Math.max(viewport.width, viewport.height),
          Math.sqrt(16000000 / (viewport.width * viewport.height)),
        );
        canvas.width = Math.max(1, Math.floor(viewport.width * resolution));
        canvas.height = Math.max(1, Math.floor(viewport.height * resolution));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute("aria-label", `Halaman PDF ${pageNumber}`);
        renderTask = page.render({
          canvas,
          viewport,
          transform: [resolution, 0, 0, resolution, 0, 0],
        });
        await renderTask.promise;
        if (disposed) return;
        container?.replaceChildren(canvas);
        setSize({ width: base.width, height: base.height });
        setDisplayScale(scale);
        onReady(true);
      } catch (cause) {
        if (!disposed) {
          setError(pdfErrorMessage(cause));
          onReady(false);
        }
      }
    }
    void render();
    return () => {
      disposed = true;
      renderTask?.cancel();
      // Wait for cancellation before releasing page resources.
      if (renderTask)
        void renderTask.promise
          .catch(() => undefined)
          .then(() => page?.cleanup());
      else page?.cleanup();
      container?.replaceChildren();
    };
  }, [pdf, pageNumber, zoom, availableWidth, onReady]);
  return (
    <div className="pdf-render-stage" aria-busy={!size && !error}>
      {!size && !error && (
        <p className="pdf-loading" role="status">
          Memuat halaman PDF...
        </p>
      )}
      {error && (
        <p className="pdf-error" role="alert">
          {error}
        </p>
      )}
      <div
        className="real-pdf-page"
        style={
          size
            ? {
                width: size.width * displayScale,
                height: size.height * displayScale,
              }
            : { display: "none" }
        }
      >
        <div ref={host} className="pdf-canvas-host" />
        {size && (
          <WatermarkOverlay config={config} size={size} scale={displayScale} />
        )}
      </div>
    </div>
  );
}
