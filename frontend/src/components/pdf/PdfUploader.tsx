"use client";
import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatFileSize } from "@/lib/watermark";

export function PdfUploader({
  file,
  onChange,
  count = file ? 1 : 0,
  disabled = false,
  displayName,
  onDuplicate,
}: {
  file: File | null;
  onChange: (files: File[], append?: boolean) => void;
  count?: number;
  disabled?: boolean;
  displayName?: string;
  onDuplicate: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const additionalInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  function selectFiles(candidates: FileList | null, append = false) {
    if (!candidates?.length || disabled) return;
    const accepted: File[] = [];
    const errors = new Set<string>();
    for (const candidate of Array.from(candidates)) {
      if (
        !/\.pdf$/i.test(candidate.name) ||
        (candidate.type && candidate.type !== "application/pdf")
      ) {
        errors.add("Format file tidak didukung. Pilih file PDF.");
      } else if (candidate.size === 0) {
        errors.add("File PDF kosong. Pilih file lain.");
      } else accepted.push(candidate);
    }
    setError([...errors].join(" "));
    onChange(accepted, append);
  }
  return (
    <div className="uploader-wrap">
      <input
        ref={input}
        className="sr-only"
        type="file"
        multiple
        disabled={disabled}
        accept=".pdf,application/pdf"
        aria-label="Pilih file PDF"
        onChange={(event) => {
          selectFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={additionalInput}
        className="sr-only"
        type="file"
        multiple
        disabled={disabled}
        accept=".pdf,application/pdf"
        aria-label="Tambah file PDF"
        onChange={(event) => {
          selectFiles(event.target.files, true);
          event.target.value = "";
        }}
      />
      <div
        className={`upload-zone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          selectFiles(event.dataTransfer.files, count > 0);
        }}
      >
        {file ? (
          <>
            <span className="file-icon">
              <Icon name="file" size={22} />
            </span>
            <div className="file-details">
              <strong title={displayName ?? file.name}>
                {displayName ?? file.name}
              </strong>
              <span>
                {count > 1 ? `${count} PDF dipilih` : formatFileSize(file.size)}
              </span>
            </div>
            <button
              type="button"
              className="button-subtle"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              {count > 1 ? "Ganti semua" : "Ganti file"}
            </button>
            <button
              type="button"
              className="button-subtle"
              disabled={disabled}
              onClick={() => additionalInput.current?.click()}
            >
              Tambah PDF
            </button>
            <button
              type="button"
              className="button-subtle"
              disabled={disabled}
              onClick={onDuplicate}
              title="Tambahkan salinan PDF ini ke daftar"
            >
              Buat salinan
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={count > 1 ? "Hapus semua PDF" : "Hapus file PDF"}
              title={count > 1 ? "Hapus semua PDF" : "Hapus file PDF"}
              disabled={disabled}
              onClick={() => {
                onChange([]);
                setError("");
              }}
            >
              <Icon name="close" size={18} />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="upload-trigger"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <span className="upload-icon">
              <Icon name="upload" size={24} />
            </span>
            <strong>Tarik file PDF ke sini</strong>
            <span>
              atau <b>pilih file</b> dari perangkat
            </span>
            <small>Format PDF · Bisa pilih beberapa file sekaligus</small>
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
