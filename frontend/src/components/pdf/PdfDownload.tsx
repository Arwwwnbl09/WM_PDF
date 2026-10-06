"use client";

import { useRef, useState } from "react";
import { downloadPdf } from "@/lib/pdf/download";

interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption: boolean;
  }) => Promise<{
    createWritable: () => Promise<FileSystemWritableFileStream>;
  }>;
}

export function PdfDownload({
  blob,
  url,
  filename,
  label = "Simpan ulang",
  accessibleLabel,
  disabled = false,
}: {
  blob: Blob;
  url: string;
  filename: string;
  label?: string;
  accessibleLabel?: string;
  disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);

  async function save() {
    if (busy.current || disabled) return;
    busy.current = true;
    setSaving(true);
    setError("");
    let stream: FileSystemWritableFileStream | undefined;
    try {
      const pickerWindow = window as SavePickerWindow;
      if (pickerWindow.showSaveFilePicker) {
        const handle = await pickerWindow.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "Dokumen PDF",
              accept: { "application/pdf": [".pdf"] },
            },
          ],
          excludeAcceptAllOption: true,
        });
        stream = await handle.createWritable();
        await stream.write(blob);
        await stream.close();
        stream = undefined;
      } else {
        downloadPdf(url, filename);
      }
    } catch (cause) {
      if (stream) await stream.abort().catch(() => {});
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError("PDF belum tersimpan. Pilih folder lain dan coba lagi.");
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button-subtle download-button"
        disabled={saving || disabled}
        aria-busy={saving}
        aria-label={accessibleLabel}
        onClick={() => void save()}
      >
        {saving ? "Menyimpan PDF..." : label}
      </button>
      {error && (
        <p role="alert" className="save-error">
          {error}
        </p>
      )}
    </>
  );
}
