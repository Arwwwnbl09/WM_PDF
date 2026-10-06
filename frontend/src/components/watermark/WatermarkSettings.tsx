import { Icon } from "@/components/ui/Icon";
import type { ReactNode } from "react";
import { useState } from "react";
import { NumberField } from "@/components/ui/NumberField";
import { ColorPicker } from "./ColorPicker";
import { PositionSelector } from "./PositionSelector";
import { outputQualities } from "@/lib/watermark";
import {
  fonts,
  type WatermarkConfig,
  type WatermarkFont,
  type OutputQuality,
} from "@/types/watermark";
interface Props {
  config: WatermarkConfig;
  onChange: (config: WatermarkConfig) => void;
  onQualityChange: (quality: OutputQuality) => void;
  hasFile: boolean;
  onProcess: () => void;
  canProcess: boolean;
  isProcessing: boolean;
  onColorEdit: (valid: boolean) => void;
  onReset: () => void;
  result: ReactNode;
  onDraftEdit: () => void;
  onDraftValidityChange?: (valid: boolean) => void;
  locked?: boolean;
  filename?: string;
  filenameField?: ReactNode;
}
export function WatermarkSettings({
  config,
  onChange,
  onQualityChange,
  hasFile,
  onProcess,
  canProcess,
  isProcessing,
  onColorEdit,
  onReset,
  result,
  onDraftEdit,
  onDraftValidityChange,
  locked = false,
  filename,
  filenameField,
}: Props) {
  const [invalidDrafts, setInvalidDrafts] = useState<string[]>([]);
  function draftValidity(key: string, valid: boolean) {
    if (!valid) onDraftEdit();
    const next = valid
      ? invalidDrafts.filter((item) => item !== key)
      : [...invalidDrafts.filter((item) => item !== key), key];
    setInvalidDrafts(next);
    onDraftValidityChange?.(
      !next.some((item) => item === "fontSize" || config.type === "repeated"),
    );
  }
  function update<K extends keyof WatermarkConfig>(
    key: K,
    value: WatermarkConfig[K],
  ) {
    onChange({ ...config, [key]: value });
  }
  return (
    <section className="card settings-card" aria-labelledby="settings-title">
      <div className="card-heading">
        <span className="heading-icon">
          <Icon name="sliders" />
        </span>
        <div>
          <h2 id="settings-title">Pengaturan watermark</h2>
          <p>Atur teks, posisi, dan warna watermark.</p>
          {filename && (
            <p className="settings-filename" title={filename}>
              {filename}
            </p>
          )}
        </div>
      </div>
      <fieldset
        className="settings-body"
        disabled={locked}
        aria-label="Pengaturan file terpilih"
      >
        <div>
          <label className="field-label" htmlFor="watermark-text">
            Teks watermark
          </label>
          <input
            id="watermark-text"
            value={config.text}
            maxLength={256}
            placeholder="Masukkan teks watermark"
            onChange={(event) => update("text", event.target.value)}
          />
        </div>
        <div className="field-pair font-row">
          <div>
            <label className="field-label" htmlFor="watermark-font">
              Jenis huruf
            </label>
            <select
              id="watermark-font"
              value={config.font}
              onChange={(event) =>
                update("font", event.target.value as WatermarkFont)
              }
            >
              {fonts.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>
          <NumberField
            id="font-size"
            onDraftValidity={(valid) => draftValidity("fontSize", valid)}
            label="Ukuran huruf"
            value={config.fontSize}
            min={8}
            max={200}
            unit="pt"
            onChange={(value) => update("fontSize", value)}
          />
        </div>
        <p className="field-hint font-note">
          Tampilan huruf pada hasil PDF dapat sedikit berbeda dari pratinjau.
        </p>
        <PositionSelector
          value={config.position}
          onChange={(value) => update("position", value)}
        />
        <div>
          <div className="range-heading">
            <label className="field-label" htmlFor="watermark-angle">
              Rotasi
            </label>
            <div className="angle-number">
              <input
                aria-label="Rotasi dalam derajat"
                type="number"
                min={-180}
                max={180}
                value={config.angle}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isFinite(value))
                    update("angle", Math.min(180, Math.max(-180, value)));
                }}
              />
              <span>°</span>
            </div>
          </div>
          <input
            id="watermark-angle"
            aria-valuetext={`${config.angle} derajat`}
            type="range"
            min={-180}
            max={180}
            value={config.angle}
            onChange={(event) => update("angle", Number(event.target.value))}
          />
          <div className="range-labels">
            <span>−180°</span>
            <span>0°</span>
            <span>180°</span>
          </div>
        </div>
        <div className="field-pair color-opacity">
          <ColorPicker
            onEdit={onColorEdit}
            value={config.color}
            onChange={(value) => update("color", value)}
          />
          <div>
            <div className="range-heading">
              <label className="field-label" htmlFor="watermark-opacity">
                Kepekatan
              </label>
              <output htmlFor="watermark-opacity">
                {Math.round(config.opacity * 100)}%
              </output>
            </div>
            <input
              id="watermark-opacity"
              aria-valuetext={`${Math.round(config.opacity * 100)}%`}
              type="range"
              min={0}
              max={100}
              value={Math.round(config.opacity * 100)}
              onChange={(event) =>
                update("opacity", Number(event.target.value) / 100)
              }
            />
            <div className="range-labels">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
        <fieldset>
          <legend className="field-label">Pola watermark</legend>
          <div className="type-selector">
            {(["single", "repeated"] as const).map((type) => (
              <button
                type="button"
                key={type}
                aria-pressed={config.type === type}
                onClick={() => update("type", type)}
                className={config.type === type ? "selected" : ""}
              >
                <span className={`type-symbol ${type}`} aria-hidden="true">
                  {type === "single" ? "A" : "A A"}
                </span>
                {type === "single" ? "Tunggal" : "Berulang"}
                {config.type === type && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
        </fieldset>
        <div
          className={`spacing-section ${config.type === "single" ? "is-disabled" : ""}`}
        >
          <div className="field-pair">
            <NumberField
              id="space-x"
              onDraftValidity={(valid) => draftValidity("spaceX", valid)}
              label="Jarak horizontal"
              value={config.spaceX}
              min={0}
              max={200}
              unit="mm"
              disabled={config.type === "single"}
              onChange={(value) => update("spaceX", value)}
            />
            <NumberField
              id="space-y"
              onDraftValidity={(valid) => draftValidity("spaceY", valid)}
              label="Jarak vertikal"
              value={config.spaceY}
              min={0}
              max={200}
              unit="mm"
              disabled={config.type === "single"}
              onChange={(value) => update("spaceY", value)}
            />
          </div>
          <p className="field-hint">Jarak antarwatermark pada pola berulang.</p>
        </div>
      </fieldset>
      <div className="settings-footer">
        <div className="output-quality">
          <label className="field-label" htmlFor="output-quality">
            Kualitas PDF
          </label>
          <select
            id="output-quality"
            disabled={isProcessing}
            value={config.outputQuality}
            aria-describedby="output-quality-help"
            onChange={(event) =>
              onQualityChange(event.target.value as OutputQuality)
            }
          >
            {Object.entries(outputQualities).map(([value, option]) => (
              <option key={value} value={value}>
                {option.label}
              </option>
            ))}
          </select>
          <p id="output-quality-help">
            {outputQualities[config.outputQuality].description} Berlaku untuk
            semua PDF dalam daftar.
          </p>
        </div>
        {filenameField}
        <button
          type="button"
          className="process-button"
          disabled={
            !canProcess ||
            invalidDrafts.some(
              (key) => key === "fontSize" || config.type === "repeated",
            )
          }
          aria-busy={isProcessing}
          onClick={onProcess}
        >
          <Icon name="lock" size={18} />
          {isProcessing ? "Memproses PDF..." : "Proses PDF"}
          <Icon name="arrow" size={18} />
        </button>
        <p>
          {hasFile
            ? "Isi teks watermark sebelum memproses PDF."
            : "Pilih PDF dan tunggu pratinjau selesai dimuat."}
        </p>
        {result}
        <button
          type="button"
          className="button-subtle reset-button"
          onClick={onReset}
        >
          Atur ulang
        </button>
      </div>
    </section>
  );
}
