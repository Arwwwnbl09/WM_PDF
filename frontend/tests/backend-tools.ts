import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendDirectory = fileURLToPath(
  new URL("../../backend/", import.meta.url),
);

export const backendPython = resolve(
  backendDirectory,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
export const verifyDownloadScript = resolve(
  backendDirectory,
  "scripts/verify_download.py",
);
