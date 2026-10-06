"use client";
import { inspectOutputName } from "@/lib/pdf/filename";

export function PdfFilenameField({
  id,
  value,
  onChange,
  disabled = false,
  accessibleLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  accessibleLabel?: string;
}) {
  const parsed = inspectOutputName(value);
  return (
    <div className="pdf-filename-field">
      <label className="field-label" htmlFor={id}>
        Nama file hasil
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={150}
        spellCheck={false}
        aria-label={accessibleLabel}
        disabled={disabled}
        aria-invalid={Boolean(parsed.error)}
        aria-describedby={parsed.error ? `${id}-error` : `${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (parsed.filename && parsed.filename !== value)
            onChange(parsed.filename);
        }}
      />
      {parsed.error ? (
        <p id={`${id}-error`} className="error-text">
          {parsed.error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="field-hint">
          Akhiran .pdf ditambahkan otomatis.
        </p>
      )}
    </div>
  );
}
