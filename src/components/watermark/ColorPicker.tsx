"use client";
import { useState } from "react";
export function ColorPicker({
  value,
  onChange,
  onEdit,
}: {
  value: string;
  onChange: (color: string) => void;
  onEdit: (valid: boolean) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayed = draft ?? value;
  const valid = /^#[0-9a-f]{6}$/i.test(displayed);
  return (
    <div>
      <label className="field-label" htmlFor="watermark-hex">
        Warna
      </label>
      <div className="color-field">
        <input
          type="color"
          aria-label="Pilih warna watermark"
          value={value}
          onChange={(event) => {
            setDraft(null);
            onEdit(true);
            onChange(event.target.value.toUpperCase());
          }}
        />
        <input
          id="watermark-hex"
          type="text"
          value={displayed}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          aria-describedby={!valid ? "color-error" : undefined}
          onChange={(event) => {
            const hex = event.target.value;
            setDraft(hex);
            onEdit(/^#[0-9a-f]{6}$/i.test(hex));
            if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toUpperCase());
          }}
        />
      </div>
      {!valid && (
        <p id="color-error" className="error-text">
          Masukkan kode warna enam digit, misalnya #4287F5.
        </p>
      )}
    </div>
  );
}
