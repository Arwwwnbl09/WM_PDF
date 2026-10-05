interface Props {
  page: number;
  total: number;
  zoom: number;
  onPage: (page: number) => void;
  onZoom: (zoom: number) => void;
}
export function PdfToolbar({ page, total, zoom, onPage, onZoom }: Props) {
  return (
    <div className="pdf-navigation" aria-label="Navigasi PDF">
      <div>
        <button
          type="button"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ‹
        </button>
        <span aria-live="polite">
          Halaman {page} / {total}
        </span>
        <button
          type="button"
          aria-label="Halaman berikutnya"
          disabled={page >= total}
          onClick={() => onPage(page + 1)}
        >
          ›
        </button>
      </div>
      <div>
        <button
          type="button"
          aria-label="Perkecil"
          title="Perkecil pratinjau"
          disabled={zoom <= 0.5}
          onClick={() => onZoom(Math.max(0.5, zoom - 0.25))}
        >
          −
        </button>
        <output
          aria-label="Ukuran tampilan"
          title="100% menyesuaikan lebar pratinjau"
        >
          {Math.round(zoom * 100)}%
        </output>
        <button
          type="button"
          aria-label="Perbesar"
          title="Perbesar pratinjau"
          disabled={zoom >= 2}
          onClick={() => onZoom(Math.min(2, zoom + 0.25))}
        >
          +
        </button>
      </div>
    </div>
  );
}
