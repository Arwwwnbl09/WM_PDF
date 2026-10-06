import type { WatermarkConfig } from "./watermark";

export interface PdfEntry {
  id: string;
  file: File;
  displayName?: string;
  outputFilename?: string;
  config: WatermarkConfig;
  colorValid: boolean;
  draftValid: boolean;
}
