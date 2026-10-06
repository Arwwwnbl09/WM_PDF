import type { PdfEntry } from "@/types/pdf";
import type { ProcessingState } from "@/lib/pdf/usePdfProcessing";
import { formatFileSize } from "@/lib/watermark";
import { Icon } from "@/components/ui/Icon";
import { PdfDownload } from "./PdfDownload";
import { PdfFilenameField } from "./PdfFilenameField";
import { inspectOutputName, outputName } from "@/lib/pdf/filename";

export function PdfQueue({
  entries,
  selectedId,
  states,
  isProcessing,
  canProcess,
  onSelect,
  onTextChange,
  onRemove,
  onDuplicate,
  onProcess,
  onFilenameChange,
}: {
  entries: PdfEntry[];
  selectedId: string | null;
  states: Record<string, ProcessingState>;
  isProcessing: boolean;
  canProcess: boolean;
  onSelect: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onProcess: () => void;
  onFilenameChange: (id: string, value: string) => void;
}) {
  const remaining = entries.filter(
    (entry) => states[entry.id]?.status !== "success",
  ).length;
  return (
    <section className="card pdf-queue" aria-labelledby="queue-title">
      <div className="queue-heading">
        <div>
          <h2 id="queue-title">Daftar PDF ({entries.length})</h2>
          <p>
            Isi teks setiap file. Pilih nama file untuk melihat pratinjau dan
            pengaturannya.
          </p>
        </div>
        <button
          type="button"
          className="process-button"
          disabled={!canProcess}
          onClick={onProcess}
        >
          {isProcessing
            ? "Memproses..."
            : remaining === 0
              ? "Semua PDF selesai"
              : `${remaining === entries.length ? "Proses semua" : "Proses sisa"} (${remaining} PDF)`}
        </button>
      </div>
      <ol className="queue-list">
        {entries.map((entry, index) => {
          const state = states[entry.id];
          const name = entry.displayName ?? entry.file.name;
          const output = outputName(
            entry,
            state?.status === "success" ? state.result.filename : undefined,
          );
          const parsedName = inspectOutputName(output);
          const status =
            state?.status === "success"
              ? "Selesai"
              : state?.status === "error"
                ? "Gagal"
                : state?.status === "processing"
                  ? `Memproses ${state.percentage}%`
                  : state?.status === "queued"
                    ? "Menunggu"
                    : "Belum diproses";
          return (
            <li
              key={entry.id}
              className={`queue-item ${selectedId === entry.id ? "is-selected" : ""}`}
            >
              <div className="queue-file-row">
                <button
                  type="button"
                  className="queue-select"
                  aria-pressed={selectedId === entry.id}
                  aria-label={`Atur ${index + 1}: ${name}`}
                  onClick={() => onSelect(entry.id)}
                >
                  <span className="queue-number">{index + 1}</span>
                  <span className="queue-file-info">
                    <strong title={name}>{name}</strong>
                    <small>{formatFileSize(entry.file.size)}</small>
                  </span>
                </button>
                <span
                  className={`queue-status status-${state?.status ?? "idle"}`}
                  role="status"
                >
                  {status}
                </span>
                <button
                  type="button"
                  className="button-subtle queue-copy"
                  disabled={isProcessing}
                  aria-label={`Buat salinan ${index + 1}: ${name}`}
                  onClick={() => onDuplicate(entry.id)}
                >
                  Salin
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={isProcessing}
                  aria-label={`Hapus ${index + 1}: ${name}`}
                  onClick={() => onRemove(entry.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <label className="field-label" htmlFor={`queue-text-${entry.id}`}>
                Teks watermark
              </label>
              <input
                id={`queue-text-${entry.id}`}
                aria-label={`Teks watermark untuk file ${index + 1}`}
                value={entry.config.text}
                maxLength={256}
                disabled={isProcessing}
                placeholder="Masukkan teks watermark"
                onChange={(event) => onTextChange(entry.id, event.target.value)}
              />
              {state?.status === "error" && (
                <p role="alert" className="error-text">
                  {state.message}
                </p>
              )}
              <PdfFilenameField
                id={`output-name-${entry.id}`}
                value={output}
                accessibleLabel={`Nama file hasil untuk file ${index + 1}`}
                disabled={isProcessing}
                onChange={(value) => onFilenameChange(entry.id, value)}
              />
              {state?.status === "success" && (
                <PdfDownload
                  key={state.result.url}
                  {...state.result}
                  filename={parsedName.filename ?? state.result.filename}
                  disabled={Boolean(parsedName.error)}
                  label="Simpan PDF"
                  accessibleLabel={`Simpan PDF ${index + 1}: ${name}`}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="queue-note">
        Setiap hasil diunduh otomatis setelah selesai. Jika browser meminta izin
        unduhan beberapa file, pilih Izinkan. Tombol Simpan PDF tersedia untuk
        menyimpan ulang.
      </p>
      {entries.some((entry) => !entry.config.text.trim()) && (
        <p className="error-text queue-note">
          Isi teks watermark pada setiap file sebelum memproses semuanya.
        </p>
      )}
    </section>
  );
}
