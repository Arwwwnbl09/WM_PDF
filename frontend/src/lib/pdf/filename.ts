import { secureFilename } from "@/lib/api/pdf";

export function outputName(
  entry: { file: { name: string }; outputFilename?: string },
  resultFilename?: string,
): string {
  return (
    entry.outputFilename ?? resultFilename ?? secureFilename(entry.file.name)
  );
}

export function inspectOutputName(
  value: string,
): { filename: string; error: null } | { filename: null; error: string } {
  const raw = value.trim().normalize("NFC");
  if (
    Array.from(raw).some(
      (char) =>
        char.charCodeAt(0) < 32 ||
        char.charCodeAt(0) === 127 ||
        '<>:"/\\|?*'.includes(char),
    )
  )
    return {
      filename: null,
      error: 'Nama file tidak boleh berisi karakter / \\ : * ? " < > |.',
    };
  const stem = raw.replace(/(?:\.pdf)+$/i, "").replace(/[. ]+$/, "");
  if (!stem) return { filename: null, error: "Isi nama file hasil." };
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))
    return {
      filename: null,
      error: "Nama ini tidak dapat digunakan. Pilih nama lain.",
    };
  const filename = stem + ".pdf";
  if (filename.length > 150)
    return {
      filename: null,
      error: "Nama file maksimal 150 karakter, termasuk .pdf.",
    };
  return { filename, error: null };
}
