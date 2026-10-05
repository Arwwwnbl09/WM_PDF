import { test, expect } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { statSync } from "node:fs";

test("real API compresses all four qualities and downloads raster pages at the selected resolution", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "quality-check.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(2, true),
  });
  const sizes: number[] = [];
  for (const [quality, dpi] of [
    ["compact", 150],
    ["economy", 100],
    ["balanced", 150],
    ["high", 300],
  ] as const) {
    await page.getByLabel("Kualitas PDF").selectOption(quality);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
    const download = await pending;
    const path = resolve("test-results", `quality-${quality}.pdf`);
    await download.saveAs(path);
    execFileSync(resolve("backend/.venv/Scripts/python.exe"), [
      resolve("backend/scripts/verify_download.py"),
      path,
      "2",
      String(dpi),
    ]);
    sizes.push(statSync(path).size);
    if (quality === "balanced") {
      await page.screenshot({
        path: "test-results/compression-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "test-results/compression-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
  }
  expect(sizes[0]).toBeLessThan(sizes[2]);
  expect(sizes[1]).toBeLessThan(sizes[2]);
  expect(sizes[2]).toBeLessThan(sizes[3]);
});

test("quality is sent to API, success stays minimal and changes require reprocessing", async ({
  page,
}) => {
  let quality = "";
  await page.route("**/api/pdf/process", async (route) => {
    const body = route.request().postDataBuffer()!.toString();
    quality = JSON.parse(body.match(/\{"text"[^\r\n]+\}/)![0]).outputQuality;
    await route.fulfill({
      contentType: "application/pdf",
      body: pdfFixture(1),
    });
  });
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "quality.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  const select = page.getByLabel("Kualitas PDF");
  await expect(select.locator("option")).toHaveCount(4);
  await expect(select.locator("option")).toHaveText([
    "Ringan & jelas",
    "Hemat",
    "Seimbang",
    "Tinggi",
  ]);
  await expect(select).toHaveValue("compact");
  const process = page.getByRole("button", {
    name: "Proses PDF",
    exact: true,
  });
  await expect(process).toBeEnabled();
  const preview = page.locator(".single-mark");
  const bounds = () =>
    preview.evaluate((mark) => {
      const rect = mark.getBoundingClientRect();
      const sheet = mark.closest(".real-pdf-page")!.getBoundingClientRect();
      return [
        rect.left - sheet.left,
        rect.top - sheet.top,
        rect.width,
        rect.height,
      ];
    });
  const initial = await bounds();
  for (const value of ["compact", "balanced", "economy", "high"]) {
    await select.selectOption(value);
    await expect(
      page.getByRole("button", { name: "Simpan ulang" }),
    ).toHaveCount(0);
    await process.click();
    await expect(
      page.getByRole("button", { name: "Simpan ulang" }),
    ).toBeVisible();
    expect(quality).toBe(value);
    await expect(
      page.getByText("PDF berhasil diamankan", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Nama file PDF")).toHaveCount(0);
    const current = await bounds();
    current.forEach((value, index) =>
      expect(value).toBeCloseTo(initial[index], 3),
    );
  }
  await select.selectOption("economy");
  await expect(page.getByLabel("Nama file PDF")).toHaveCount(0);
  await page.getByRole("button", { name: "Atur ulang", exact: true }).click();
  await expect(select).toHaveValue("compact");
  await expect(process).toBeDisabled();
});

test("light and clear PDF stays readable through PDF.js on every page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Kualitas PDF").selectOption("compact");
  await expect(page.getByLabel("Kualitas PDF")).toHaveValue("compact");
  await expect(page.getByLabel("Kualitas PDF")).toContainText("Ringan & jelas");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "indexed-preview.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(2, true),
  });
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  const download = await pending;
  const path = resolve("test-results", "indexed-preview-secured.pdf");
  await download.saveAs(path);
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles(path);
  await expect(page.locator(".file-details")).toContainText(
    "indexed-preview-secured.pdf",
  );
  await expect(page.getByText("Halaman 1 / 2", { exact: true })).toBeVisible();
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await expect(page.getByText("Halaman 2 / 2", { exact: true })).toBeVisible();
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    await page
      .locator(".pdf-canvas-host canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let index = 0; index < pixels.length; index += 4)
          if (pixels[index] < 100 && pixels[index + 1] < 180) ink++;
        return ink;
      }),
  ).toBeGreaterThan(1000);
  await expect(page.locator(".pdf-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
