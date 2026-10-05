"use client";
import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatFileSize } from "@/lib/watermark";

export function PdfUploader({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  function selectFile(candidate?: File) {
    if (!candidate) return;
    if (
      !/\.pdf$/i.test(candidate.name) ||
      (candidate.type && candidate.type !== "application/pdf")
    ) {
      setError("Format file tidak didukung. Pilih file PDF.");
      onChange(null);
      return;
    }
    if (candidate.size === 0) {
      setError("File PDF kosong. Pilih file lain.");
      onChange(null);
      return;
    }
    setError("");
    onChange(candidate);
  }
  return (
    <div className="uploader-wrap">
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".pdf,application/pdf"
        aria-label="Pilih file PDF"
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div
        className={`upload-zone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length > 1) {
            setError("Pilih satu file PDF.");
            onChange(null);
          } else selectFile(event.dataTransfer.files[0]);
        }}
      >
        {file ? (
          <>
            <span className="file-icon">
              <Icon name="file" size={22} />
            </span>
            <div className="file-details">
              <strong title={file.name}>{file.name}</strong>
              <span>{formatFileSize(file.size)}</span>
            </div>
            <button
              type="button"
              className="button-subtle"
              onClick={() => input.current?.click()}
            >
              Ganti file
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Hapus file PDF"
              onClick={() => {
                onChange(null);
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
            onClick={() => input.current?.click()}
          >
            <span className="upload-icon">
              <Icon name="upload" size={24} />
            </span>
            <strong>Tarik file PDF ke sini</strong>
            <span>
              atau <b>pilih file</b> dari perangkat
            </span>
            <small>Format PDF</small>
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
