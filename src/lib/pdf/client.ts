import type { PDFDocumentLoadingTask } from "pdfjs-dist";

// Import inside an effect: PDF.js browser APIs are never evaluated during SSR.
export async function loadLocalPdf(
  url: string,
): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs.getDocument({
    url,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
  });
}

export function pdfErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException")
    return "PDF dilindungi kata sandi dan belum dapat diproses.";
  if (name === "InvalidPDFException")
    return "PDF rusak atau formatnya tidak valid. Silakan pilih PDF lain.";
  return "PDF tidak dapat ditampilkan. Pilih file lain atau coba lagi.";
}
