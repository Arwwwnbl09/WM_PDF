import { apiUrl } from "./config";
import type { OutputQuality, WatermarkConfig } from "@/types/watermark";

export interface ProcessedPdf {
  blob: Blob;
  filename: string;
  inputBytes: number;
  outputQuality: OutputQuality;
}
const fallback = "Gagal memproses PDF. Silakan coba lagi.";

export async function cancelPdf(id: string): Promise<void> {
  // This request must survive aborting the upload and leaving the page.
  const response = await fetch(apiUrl(`/api/pdf/cancel/${id}`), {
    method: "POST",
    credentials: "omit",
    keepalive: true,
  });
  if (!response.ok) throw new Error("Pembatalan proses PDF gagal.");
}

export async function pdfProgress(
  id: string,
  signal: AbortSignal,
): Promise<number | undefined> {
  try {
    const response = await fetch(apiUrl(`/api/pdf/progress/${id}`), {
      signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) return;
    const data: unknown = await response.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "percentage" in data &&
      typeof data.percentage === "number" &&
      Number.isInteger(data.percentage) &&
      data.percentage >= 0 &&
      data.percentage <= 100
    )
      return data.percentage;
  } catch {
    /* A missed update does not interrupt PDF processing. */
  }
}

export function secureFilename(original: string): string {
  const leaf = original.split(/[\\/]/).pop() ?? "document";
  const stem =
    leaf
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 120) || "document";
  return `${stem}_secured.pdf`;
}

function responseFilename(header: string | null, original: string): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = header?.match(/filename="([^"]+)"|filename=([^;]+)/i);
  let candidate = plain?.[1] ?? plain?.[2];
  if (encoded) {
    try {
      candidate = decodeURIComponent(encoded);
    } catch {
      /* Fall back to plain filename. */
    }
  }
  if (!candidate) return secureFilename(original);
  const leaf = candidate.trim().split(/[\\/]/).pop() ?? "";
  if (!/\.pdf$/i.test(leaf)) return secureFilename(original);
  const safe = leaf
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 160);
  return safe && /\.pdf$/i.test(safe) ? safe : secureFilename(original);
}

export async function processPdf(
  file: File,
  config: WatermarkConfig,
  signal?: AbortSignal,
  progressId?: string,
): Promise<ProcessedPdf> {
  const url = apiUrl("/api/pdf/process");
  const body = new FormData();
  body.append("file", file);
  body.append("config", JSON.stringify(config));
  if (progressId) body.append("progressId", progressId);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      body,
      signal,
      credentials: "omit",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Server pemrosesan PDF tidak dapat dihubungi. Coba lagi.");
  }
  if (!response.ok) {
    if (response.status === 413)
      throw new Error("Ukuran PDF melebihi batas yang diizinkan.");
    let message = fallback;
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof payload.detail === "string" &&
        payload.detail.trim()
      )
        message = payload.detail;
    } catch {
      /* Non-JSON errors use the user-facing fallback. */
    }
    if (/password|kata sandi/i.test(message))
      message = "PDF dilindungi kata sandi dan belum dapat diproses.";
    throw new Error(message);
  }
  if (
    response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/pdf"
  )
    throw new Error(
      "Server tidak mengembalikan PDF yang valid. Silakan coba lagi.",
    );
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "Koneksi ke server terputus saat menerima PDF. Silakan coba lagi.",
    );
  }
  if (!blob.size || (await blob.slice(0, 5).text()) !== "%PDF-")
    throw new Error(
      "Server mengembalikan PDF kosong atau tidak valid. Silakan coba lagi.",
    );
  return {
    blob,
    inputBytes: file.size,
    outputQuality: config.outputQuality,
    filename: responseFilename(
      response.headers.get("Content-Disposition"),
      file.name,
    ),
  };
}
