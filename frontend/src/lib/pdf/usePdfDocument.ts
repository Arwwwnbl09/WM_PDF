"use client";
import { useEffect, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { loadLocalPdf, pdfErrorMessage } from "./client";

// The owner is keyed per selected file, so state and navigation reset together.
export function usePdfDocument(file: File) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    async function load() {
      try {
        if (!file.size) throw new Error("Empty PDF");
        loadingTask = await loadLocalPdf(url);
        if (disposed) {
          await loadingTask.destroy();
          return;
        }
        const pdf = await loadingTask.promise;
        if (!disposed) setDocument(pdf);
      } catch (cause) {
        if (!disposed) setError(pdfErrorMessage(cause));
      }
    }
    void load();
    return () => {
      disposed = true;
      // destroy releases the worker, document buffers, and pending requests.
      if (loadingTask) void loadingTask.destroy().catch(() => undefined);
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return { document, error };
}
