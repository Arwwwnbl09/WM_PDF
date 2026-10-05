import { test, expect } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";

const busyMessage =
  "Server sedang memproses PDF lain. Silakan coba kembali sebentar lagi.";

for (const response of [
  {
    name: "private backend address rejected by hosting provider",
    status: 404,
    contentType: "text/plain; charset=utf-8",
    body: "The page could not be found\n\nDNS_HOSTNAME_RESOLVED_PRIVATE\n\niad1::test-request\n",
    message:
      "Server pemrosesan PDF belum tersambung. Hubungi pengelola aplikasi.",
  },
  {
    name: "missing processing service",
    status: 404,
    contentType: "text/html",
    body: "<html><body><h1>404: NOT_FOUND</h1><p>iad1::test-request</p></body></html>",
    message:
      "Layanan pemrosesan PDF tidak tersedia. Hubungi pengelola aplikasi.",
  },
  {
    name: "unreachable gateway backend",
    status: 502,
    contentType: "text/html",
    body: "<html><body>502 Bad Gateway: PRIVATE_INTERNAL_PATH /tmp/backend</body></html>",
    message:
      "Server pemrosesan PDF tidak dapat dihubungi. Coba lagi beberapa saat lagi.",
  },
  {
    name: "gateway timeout",
    status: 504,
    contentType: "text/plain",
    body: "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT\n\niad1::test-request\n",
    message: "Server pemrosesan PDF terlalu lama merespons. Coba lagi.",
  },
  {
    name: "unknown provider failure",
    status: 500,
    contentType: "text/html",
    body: "<html><body>PRIVATE_INTERNAL_PATH /tmp/provider-error iad1::test-request</body></html>",
    message: "Gagal memproses PDF. Silakan coba lagi.",
  },
  {
    name: "FastAPI busy detail remains available",
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ detail: busyMessage }),
    message: busyMessage,
  },
]) {
  test(`hosting errors: ${response.name}`, async ({ page }) => {
    let requests = 0;
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.route("**/api/pdf/process", (route) => {
      requests++;
      return route.fulfill({
        status: response.status,
        contentType: response.contentType,
        body: response.body,
      });
    });
    await page.goto("/");
    await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
      name: "hosting-check.pdf",
      mimeType: "application/pdf",
      buffer: pdfFixture(1),
    });
    const process = page.getByRole("button", {
      name: "Proses PDF",
      exact: true,
    });
    await expect(process).toBeEnabled();
    await process.click();
    const error = page.locator(".processing-result[role=alert]");
    await expect(error.locator("p")).toHaveText(response.message);
    await expect(error).not.toContainText(
      /DNS_HOSTNAME_RESOLVED_PRIVATE|PRIVATE_INTERNAL_PATH|iad1::|FUNCTION_INVOCATION_TIMEOUT|<html>/,
    );
    await expect(process).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Simpan ulang" }),
    ).toHaveCount(0);
    expect(requests).toBe(1);
    expect(downloads).toBe(0);
  });
}
