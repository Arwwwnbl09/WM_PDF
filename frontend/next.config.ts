import type { NextConfig } from "next";

function apiBase(value: string, variable: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} must be an absolute HTTP(S) backend URL.`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      `${variable} must be an HTTP(S) backend URL without credentials, query, or fragment.`,
    );
  return url;
}

const onVercel = process.env.VERCEL === "1";
const publicApi = process.env.NEXT_PUBLIC_API_URL?.trim();
const directBackend = publicApi
  ? apiBase(publicApi, "NEXT_PUBLIC_API_URL")
  : undefined;

if (onVercel && directBackend) {
  const host = directBackend.hostname;
  if (
    directBackend.protocol !== "https:" ||
    /^(localhost|.+\.localhost|.+\.local|\[::1\]|\[::\])$|^(0|127|10|192\.168|169\.254|172\.(1[6-9]|2\d|3[01]))\./i.test(
      host,
    )
  )
    throw new Error(
      "NEXT_PUBLIC_API_URL on Vercel must use the public HTTPS address of your Python backend, not localhost or a private network address.",
    );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.25.32.1", "127.0.0.1"],
  // Rasterizing large documents can take longer than the default 30 seconds.
  experimental: {
    proxyTimeout: 30 * 60 * 1000,
    // Match the backend's 50 MiB file limit plus multipart overhead.
    proxyClientMaxBodySize: "51mb",
  },
  async rewrites() {
    // Services routes /api/pdf at the deployment root. Standalone frontends
    // use NEXT_PUBLIC_API_URL to call an external backend directly.
    if (onVercel) return [];
    const backend = apiBase(
      process.env.PDF_API_URL?.trim() || "http://127.0.0.1:8000",
      "PDF_API_URL",
    );
    return [
      {
        source: "/api/pdf/:path*",
        destination: `${backend.origin}${backend.pathname.replace(/\/+$/, "")}/api/pdf/:path*`,
      },
    ];
  },
};

export default nextConfig;
