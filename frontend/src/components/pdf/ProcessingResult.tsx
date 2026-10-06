import type { ProcessingState } from "@/lib/pdf/usePdfProcessing";
import { PdfDownload } from "./PdfDownload";

export function ProcessingResult({
  state,
  onCancel,
  detail,
  filename,
  canSave = true,
}: {
  state: ProcessingState;
  onCancel: () => void;
  detail?: string;
  filename?: string;
  canSave?: boolean;
}) {
  if (state.status === "idle" || state.status === "queued") return null;
  if (state.status === "error")
    return (
      <div className="processing-result result-error" role="alert">
        <strong>PDF gagal diproses</strong>
        <p>{state.message}</p>
      </div>
    );
  if (state.status === "processing")
    return (
      <div className="processing-progress">
        <div
          className="progress-circle"
          role="progressbar"
          aria-label="Progres PDF"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={state.percentage}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="progress-track" cx="50" cy="50" r="43" />
            <circle
              className="progress-value"
              cx="50"
              cy="50"
              r="43"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={100 - state.percentage}
            />
          </svg>
          <span>{state.percentage}%</span>
        </div>
        <div className="progress-caption">processed</div>
        {detail && <p className="batch-progress-detail">{detail}</p>}
        <button type="button" className="button-subtle" onClick={onCancel}>
          Batalkan
        </button>
      </div>
    );
  return (
    <PdfDownload
      key={state.result.url}
      {...state.result}
      filename={filename ?? state.result.filename}
      disabled={!canSave}
    />
  );
}
