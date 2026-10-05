export const positions = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export const fonts = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Courier",
  "Georgia",
] as const;
export type WatermarkPosition = (typeof positions)[number];
export const positionLabels: Record<WatermarkPosition, string> = {
  "top-left": "Atas kiri",
  "top-center": "Atas tengah",
  "top-right": "Atas kanan",
  "middle-left": "Tengah kiri",
  "middle-center": "Tengah",
  "middle-right": "Tengah kanan",
  "bottom-left": "Bawah kiri",
  "bottom-center": "Bawah tengah",
  "bottom-right": "Bawah kanan",
};
export type WatermarkFont = (typeof fonts)[number];
export type WatermarkType = "single" | "repeated";
export type OutputQuality = "compact" | "economy" | "balanced" | "high";
export interface WatermarkConfig {
  text: string;
  font: WatermarkFont;
  fontSize: number;
  position: WatermarkPosition;
  angle: number;
  color: string;
  opacity: number;
  type: WatermarkType;
  spaceX: number;
  spaceY: number;
  outputQuality: OutputQuality;
}
