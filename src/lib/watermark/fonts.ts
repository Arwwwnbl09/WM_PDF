import type { WatermarkFont } from "@/types/watermark";

// Match the backend's font fallback order where fonts are installed.
export const fontFamilies: Record<WatermarkFont, string> = {
  Arial: 'Arial, Helvetica, "Liberation Sans", "DejaVu Sans", sans-serif',
  Helvetica: 'Arial, Helvetica, "Liberation Sans", "DejaVu Sans", sans-serif',
  "Times New Roman":
    '"Times New Roman", "Liberation Serif", "DejaVu Serif", serif',
  Courier:
    '"Courier New", Courier, "Liberation Mono", "DejaVu Sans Mono", monospace',
  Georgia: 'Georgia, "DejaVu Serif", "Liberation Serif", serif',
};
