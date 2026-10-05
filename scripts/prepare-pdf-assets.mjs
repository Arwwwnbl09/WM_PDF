import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules/pdfjs-dist");
const target = join(root, "public/pdfjs");
await mkdir(target, { recursive: true });
await cp(
  join(source, "build/pdf.worker.min.mjs"),
  join(target, "pdf.worker.min.mjs"),
);
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(join(source, folder), join(target, folder), { recursive: true });
}
console.log("PDF.js worker, CMaps, fonts, and WASM prepared locally.");
