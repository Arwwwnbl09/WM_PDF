import {
  positions,
  positionLabels,
  type WatermarkPosition,
} from "@/types/watermark";
export function PositionSelector({
  value,
  onChange,
}: {
  value: WatermarkPosition;
  onChange: (value: WatermarkPosition) => void;
}) {
  return (
    <fieldset>
      <legend className="field-label">Posisi watermark</legend>
      <div className="position-row">
        <div className="position-grid" aria-label="Pilih posisi watermark">
          {positions.map((position) => (
            <button
              key={position}
              type="button"
              aria-label={positionLabels[position]}
              title={positionLabels[position]}
              aria-pressed={value === position}
              className={value === position ? "selected" : ""}
              onClick={() => onChange(position)}
            >
              <span />
            </button>
          ))}
        </div>
        <div className="position-description">
          <strong>{positionLabels[value]}</strong>
          <span>Pilih salah satu dari 9 posisi.</span>
        </div>
      </div>
    </fieldset>
  );
}
