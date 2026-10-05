import type { WatermarkConfig } from "@/types/watermark";
export const defaultWatermark: WatermarkConfig = {
  text: "CONFIDENTIAL",
  font: "Arial",
  fontSize: 32,
  position: "middle-center",
  angle: 45,
  color: "#E64610",
  opacity: 0.4,
  type: "single",
  spaceX: 20,
  spaceY: 20,
  outputQuality: "compact",
};
export const outputQualities = {
  compact: {
    label: "Ringan & jelas",
    description:
      "Mengurangi ukuran file sambil menjaga ketajaman teks dan tabel. Foto dapat membuat hasil lebih besar.",
  },
  economy: {
    label: "Hemat",
    description:
      "Ukuran file lebih kecil. Teks kecil dan gambar dapat kurang tajam.",
  },
  balanced: {
    label: "Seimbang",
    description:
      "Kualitas gambar dan ukuran file seimbang untuk dokumen sehari-hari.",
  },
  high: {
    label: "Tinggi",
    description:
      "Detail lebih tajam untuk teks kecil dan cetak. Ukuran file lebih besar.",
  },
} as const;
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export function formatFileSize(bytes: number): string {
  return bytes < 1048576
    ? `${(bytes / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} KB`
    : `${(bytes / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MB`;
}
