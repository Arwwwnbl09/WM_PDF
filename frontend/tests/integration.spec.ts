import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pdfFixture } from "./pdf-fixture";
import { backendPython, verifyDownloadScript } from "./backend-tools";

const positionLabels: Record<string, string> = {
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

async function upload(page: Page, pages = 1) {
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "document.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(pages, pages > 1),
  });
  await expect(page.locator(".pdf-canvas-host canvas")).toBeVisible();
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
async function processAndDownload(page: Page, filename: string) {
  await page.evaluate(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Memproses PDF..." }),
  ).toBeDisabled();
  const link = page.getByRole("button", { name: "Simpan ulang" });
  await expect(link).toBeVisible({ timeout: 60000 });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("document_secured.pdf");
  const path = resolve("test-results", filename);
  await download.saveAs(path);
  return path;
}
function verify(path: string, pages: number) {
  return JSON.parse(
    execFileSync(backendPython, [verifyDownloadScript, path, String(pages)], {
      encoding: "utf8",
    }),
  ) as { pages: number; bounds: ([number, number, number, number] | null)[] };
}

test("real API: all nine positions, color, opacity, PDF pixels and manual download", async ({
  page,
}) => {
  test.setTimeout(180000);
  let requests = 0,
    downloads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/pdf/process")) {
      requests++;
      expect(request.headers()["content-type"]).toContain(
        "multipart/form-data; boundary=",
      );
    }
  });
  page.on("download", () => downloads++);
  await page.goto("/");
  await page.addStyleTag({ content: ".pdf-scroll-area { max-height: none; }" });
  await upload(page);
  await page.getByLabel("Warna", { exact: true }).fill("#C82CC8");
  for (const vertical of ["top", "middle", "bottom"])
    for (const horizontal of ["left", "center", "right"]) {
      const position = `${vertical}-${horizontal}`;
      await page
        .getByRole("button", { name: positionLabels[position], exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Simpan ulang" }),
      ).toHaveCount(0);
      const mark = (await page.locator(".single-mark").boundingBox())!;
      const sheet = (await page.locator(".real-pdf-page").boundingBox())!;
      const previewCenter = {
        x: (mark.x + mark.width / 2 - sheet.x) / (sheet.width / 595),
        y: (mark.y + mark.height / 2 - sheet.y) / (sheet.height / 842),
      };
      const path = await processAndDownload(page, `${position}.pdf`);
      const result = verify(path, 1);
      expect(result.bounds[0]).not.toBeNull();
      const [left, top, right, bottom] = result.bounds[0]!;
      const cx = (left + right) / 2,
        cy = (top + bottom) / 2;
      expect(Math.abs(previewCenter.x - cx)).toBeLessThan(6);
      expect(Math.abs(previewCenter.y - cy)).toBeLessThan(6);
      expect(
        horizontal === "left"
          ? cx < 595 / 2
          : horizontal === "right"
            ? cx > 595 / 2
            : Math.abs(cx - 595 / 2) < 2,
      ).toBe(true);
      expect(
        vertical === "top"
          ? cy < 842 / 2
          : vertical === "bottom"
            ? cy > 842 / 2
            : Math.abs(cy - 842 / 2) < 2,
      ).toBe(true);
      if (position === "middle-center") {
        await page
          .locator(".real-pdf-page")
          .screenshot({ path: "test-results/preview-single.png" });
        await page
          .getByLabel("Pilih file PDF", { exact: true })
          .setInputFiles(path);
        await page.getByLabel("Teks watermark", { exact: true }).fill("");
        await expect(page.locator(".pdf-canvas-host canvas")).toBeVisible();
        await page
          .locator(".real-pdf-page")
          .screenshot({ path: "test-results/final-single.png" });
        await upload(page);
        await page
          .getByLabel("Teks watermark", { exact: true })
          .fill("CONFIDENTIAL");
      }
    }
  expect(requests).toBe(9);
  expect(downloads).toBe(9);
});

test("real API: multipage repeated, spacing, font, angle and opacity", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.addStyleTag({ content: ".pdf-scroll-area { max-height: none; }" });
  await upload(page, 3);
  await page.getByLabel("Teks watermark", { exact: true }).fill("INTERNAL");
  await page.getByLabel("Jenis huruf", { exact: true }).selectOption("Georgia");
  await page.getByLabel("Ukuran huruf").fill("24");
  await page.getByLabel("Ukuran huruf").blur();
  await page.getByLabel("Warna", { exact: true }).fill("#C82CC8");
  await page.getByLabel("Rotasi dalam derajat").fill("-30");
  await page.getByRole("button", { name: "Berulang" }).click();
  await page.getByLabel("Jarak horizontal").fill("30");
  await page.getByLabel("Jarak horizontal").blur();
  await page.getByLabel("Jarak vertikal").fill("45");
  await page.getByLabel("Jarak vertikal").blur();
  for (const opacity of ["40", "80"]) {
    await page.locator("#watermark-opacity").fill(opacity);
    await page
      .locator(".real-pdf-page")
      .screenshot({ path: `test-results/preview-repeated-${opacity}.png` });
    const path = await processAndDownload(page, `repeated-${opacity}.pdf`);
    const result = verify(path, 3);
    expect(result.bounds.every(Boolean)).toBe(true);
    await page
      .getByLabel("Pilih file PDF", { exact: true })
      .setInputFiles(path);
    await page.getByLabel("Teks watermark", { exact: true }).fill("");
    await expect(page.locator(".pdf-canvas-host canvas")).toBeVisible();
    await page
      .locator(".real-pdf-page")
      .screenshot({ path: `test-results/final-repeated-${opacity}.png` });
    for (let index = 2; index <= 3; index++) {
      await page.getByRole("button", { name: "Halaman berikutnya" }).click();
      await expect(page.locator("canvas")).toHaveAttribute(
        "aria-label",
        `Halaman PDF ${index}`,
      );
    }
    await upload(page, 3);
    await page.getByLabel("Teks watermark", { exact: true }).fill("INTERNAL");
  }
});

test("result cleanup, all configuration invalidation, reset, duplicate and stale requests", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const tracked = window as unknown as {
      revoked: string[];
      created: string[];
    };
    tracked.revoked = [];
    tracked.created = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      tracked.created.push(url);
      return url;
    };
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      tracked.revoked.push(url);
      revoke(url);
    };
  });
  await page.goto("/");
  await upload(page);
  await page.route("**/api/pdf/process", (route) =>
    route.fulfill({ contentType: "application/pdf", body: pdfFixture(1) }),
  );
  const changes = [
    () => page.getByLabel("Teks watermark", { exact: true }).fill("UPDATED"),
    () =>
      page
        .getByLabel("Jenis huruf", { exact: true })
        .selectOption("Times New Roman"),
    () => page.getByLabel("Ukuran huruf").fill("36"),
    () => page.getByRole("button", { name: "Atas kiri", exact: true }).click(),
    () => page.getByLabel("Rotasi dalam derajat").fill("20"),
    () => page.getByLabel("Warna", { exact: true }).fill("#4287F5"),
    () => page.locator("#watermark-opacity").fill("60"),
    () => page.getByRole("button", { name: "Berulang" }).click(),
    () => page.getByLabel("Jarak horizontal").fill("60"),
    () => page.getByLabel("Jarak vertikal").fill("70"),
    () => upload(page),
    () => page.getByLabel("Warna", { exact: true }).fill("#bad"),
  ];
  for (const change of changes) {
    await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
    const link = page.getByRole("button", { name: "Simpan ulang" });
    await expect(link).toBeVisible();
    const url = await page.evaluate(() => {
      const created = (window as unknown as { created: string[] }).created;
      return created[created.length - 1];
    });
    await change();
    await expect(link).toHaveCount(0);
    expect(
      await page.evaluate(
        (url) =>
          (window as unknown as { revoked: string[] }).revoked.includes(url!),
        url,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Atur ulang", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByLabel("Teks watermark", { exact: true })).toHaveValue(
    "CONFIDENTIAL",
  );
  await expect(page.getByLabel("Warna", { exact: true })).toHaveValue(
    "#E64610",
  );
  await upload(page);
  await page.unroute("**/api/pdf/process");
  let calls = 0;
  await page.route("**/api/pdf/process", async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route
      .fulfill({ contentType: "application/pdf", body: pdfFixture(1) })
      .catch(() => {});
  });
  await page
    .getByRole("button", { name: "Proses PDF", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect.poll(() => calls).toBe(1);
  await page
    .getByLabel("Teks watermark", { exact: true })
    .fill("CHANGED WHILE PROCESSING");
  await page.waitForTimeout(900);
  await expect(page.getByRole("button", { name: "Simpan ulang" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".processing-result[role=alert]")).toHaveCount(0);
});

test("API errors, 413, page limit, password, invalid success response and retry", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  for (const [status, body, contentType, expected] of [
    [
      413,
      "{}",
      "application/json",
      "Ukuran PDF melebihi batas yang diizinkan.",
    ],
    [
      422,
      JSON.stringify({
        detail: "PDF memiliki terlalu banyak halaman untuk diproses.",
      }),
      "application/json",
      "PDF memiliki terlalu banyak halaman",
    ],
    [
      422,
      JSON.stringify({ detail: "Password protected" }),
      "application/json",
      "PDF dilindungi kata sandi dan belum dapat diproses.",
    ],
    [
      500,
      "<html>Error</html>",
      "text/html",
      "Gagal memproses PDF. Silakan coba lagi.",
    ],
    [
      200,
      "{}",
      "application/json",
      "Server tidak mengembalikan PDF yang valid.",
    ],
    [
      200,
      "",
      "application/pdf",
      "Server mengembalikan PDF kosong atau tidak valid.",
    ],
  ] as const) {
    await page.route("**/api/pdf/process", (route) =>
      route.fulfill({ status, body, contentType }),
    );
    await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
    await expect(page.locator(".processing-result[role=alert]")).toContainText(
      expected,
    );
    await expect(
      page.getByRole("button", { name: "Simpan ulang" }),
    ).toHaveCount(0);
    await page.unroute("**/api/pdf/process");
  }
  await page.getByLabel("Teks watermark", { exact: true }).fill("   ");
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeDisabled();
});

test("backend offline gives readable network error", async ({ page }) => {
  test.skip(
    process.env.TEST_BACKEND_OFFLINE !== "1",
    "Run separately with backend stopped.",
  );
  await page.goto("/");
  await upload(page);
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  await expect(page.locator(".processing-result[role=alert]")).toContainText(
    "Server pemrosesan PDF tidak dapat dihubungi. Coba lagi.",
  );
});

test("password PDF is rejected in preview without any request", async ({
  page,
}) => {
  const buffer = execFileSync(backendPython, [
    "-c",
    "import pymupdf,sys; d=pymupdf.open(); d.new_page(); sys.stdout.buffer.write(d.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,owner_pw='owner',user_pw='secret')); d.close()",
  ]);
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/pdf/process")) requests++;
  });
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "password.pdf",
    mimeType: "application/pdf",
    buffer,
  });
  await expect(page.locator(".pdf-error")).toContainText(
    "PDF dilindungi kata sandi dan belum dapat diproses.",
  );
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeDisabled();
  expect(requests).toBe(0);
});

test("mobile success, safe fallback filename and invalid numeric draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await upload(page);
  await page.route("**/api/pdf/process", (route) =>
    route.fulfill({ contentType: "application/pdf", body: pdfFixture(1) }),
  );
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  const link = page.getByRole("button", { name: "Simpan ulang" });
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-result.png",
    fullPage: true,
  });
  await page.getByLabel("Ukuran huruf").fill("");
  await expect(link).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Ukuran huruf").blur();
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeEnabled();
});
