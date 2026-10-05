"use client";
import { useState } from "react";
import { clamp } from "@/lib/watermark";
interface Props {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onDraftValidity?: (valid: boolean) => void;
}
export function NumberField({
  id,
  label,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
  onDraftValidity,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="number-field">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={1}
          disabled={disabled}
          value={draft ?? value}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            onDraftValidity?.(raw !== "" && Number.isFinite(Number(raw)));
            if (raw !== "" && Number.isFinite(Number(raw)))
              onChange(clamp(Math.round(Number(raw)), min, max));
          }}
          onBlur={() => {
            setDraft(null);
            onDraftValidity?.(true);
          }}
        />
        {unit && <span>{unit}</span>}
      </div>
    </div>
  );
}
