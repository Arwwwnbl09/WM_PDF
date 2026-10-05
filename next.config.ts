import type { NextConfig } from "next";

const backend = new URL(
  process.env.PDF_API_URL?.trim() || "http://127.0.0.1:8000",
);
if (
  !["http:", "https:"].includes(backend.protocol) ||
  backend.username ||
  backend.password ||
  backend.search ||
  backend.hash
)
  throw new Error("PDF_API_URL must be an HTTP(S) backend URL.");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.25.32.1", "127.0.0.1"],
  // Rasterizing large documents can take longer than the default 30 seconds.
  experimental: {
    proxyTimeout: 30 * 60 * 1000,
    // Match the backend's 50 MiB file limit plus multipart overhead.
    proxyClientMaxBodySize: "51mb",
  },
  async rewrites() {
    return [
      {
        source: "/api/pdf/:path*",
        destination: `${backend.origin}${backend.pathname.replace(/\/+$/, "")}/api/pdf/:path*`,
      },
    ];
  },
};

export default nextConfig;
