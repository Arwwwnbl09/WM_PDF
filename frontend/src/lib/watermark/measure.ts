import type { PreviewSize } from "./preview";

// Measure browser glyph pixels only for preview layout; never used as PDF output.
export function rotatedInkBounds(
  text: string,
  fontSize: number,
  fontFamily: string,
  angle: number,
  size: PreviewSize,
  left: number,
  ascent: number,
) {
  const radians = (-angle * Math.PI) / 180;
  const width =
    Math.abs(size.width * Math.cos(radians)) +
    Math.abs(size.height * Math.sin(radians));
  const height =
    Math.abs(size.width * Math.sin(radians)) +
    Math.abs(size.height * Math.cos(radians));
  const scale = Math.min(
    1,
    4092 / Math.max(1, width, height),
    Math.sqrt(1000000 / Math.max(1, width * height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale) + 4;
  canvas.height = Math.ceil(height * scale) + 4;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { width, height, offsetX: 0, offsetY: 0 };
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(radians);
  context.font = `${fontSize * scale}px ${fontFamily}`;
  context.fillText(
    text,
    (left - size.width / 2) * scale,
    (ascent - size.height / 2) * scale,
  );
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width,
    minY = canvas.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  if (maxX < minX) return { width, height, offsetX: 0, offsetY: 0 };
  return {
    width: (maxX - minX + 1) / scale,
    height: (maxY - minY + 1) / scale,
    offsetX: ((minX + maxX + 1) / 2 - canvas.width / 2) / scale,
    offsetY: ((minY + maxY + 1) / 2 - canvas.height / 2) / scale,
  };
}
