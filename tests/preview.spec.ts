import { test, expect } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";

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

test("PDF asli, navigasi, pengaturan realtime, repeated, posisi, dan zoom", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const process = page.getByRole("button", { name: "Proses PDF" });
  await expect(process).toBeDisabled();
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "single.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  const canvas = page.locator(".pdf-canvas-host canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByText("Halaman 1 / 1", { exact: true })).toBeVisible();
  // Ensure a real page was drawn, rather than an empty canvas or mock.
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) => {
      const pixels = element
        .getContext("2d")!
        .getImageData(0, 0, element.width, element.height).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] < 100 && pixels[i + 1] < 180 && pixels[i + 3] > 0)
          colored++;
      return colored;
    }),
  ).toBeGreaterThan(1000);
  await expect(process).toBeEnabled();
  await page.getByLabel("Teks watermark", { exact: true }).fill("ARWIN NABIEL");
  const mark = page.locator(".single-mark");
  await expect(mark).toHaveText("ARWIN NABIEL");
  await page.getByLabel("Warna", { exact: true }).fill("#4287F5");
  await expect(mark).toHaveCSS("color", "rgb(66, 135, 245)");
  await page.locator("#watermark-opacity").fill("80");
  await expect(mark).toHaveCSS("opacity", "0.8");
  await page.getByLabel("Rotasi dalam derajat").fill("-45");
  await expect(mark).toHaveAttribute("style", /rotate\(45deg\)/);
  await page.getByLabel("Jenis huruf", { exact: true }).selectOption("Georgia");
  await expect(mark).toHaveCSS("font-family", /Georgia/);
  await page.getByLabel("Ukuran huruf").fill("40");
  await page.getByLabel("Ukuran huruf").blur();
  await expect(mark).toHaveCSS("font-size", "53.3333px");
  for (const vertical of ["top", "middle", "bottom"]) {
    for (const horizontal of ["left", "center", "right"]) {
      await page
        .getByRole("button", {
          name: positionLabels[`${vertical}-${horizontal}`],
          exact: true,
        })
        .click();
      await expect
        .poll(async () => {
          const bounds = await mark.boundingBox();
          const sheet = await page.locator(".real-pdf-page").boundingBox();
          if (!bounds || !sheet) return false;
          const cx = bounds.x + bounds.width / 2 - sheet.x;
          const cy = bounds.y + bounds.height / 2 - sheet.y;
          const within =
            bounds.x >= sheet.x - 1 &&
            bounds.y >= sheet.y - 1 &&
            bounds.x + bounds.width <= sheet.x + sheet.width + 1 &&
            bounds.y + bounds.height <= sheet.y + sheet.height + 1;
          const xCorrect =
            horizontal === "left"
              ? cx < sheet.width / 2
              : horizontal === "right"
                ? cx > sheet.width / 2
                : Math.abs(cx - sheet.width / 2) < 6;
          const yCorrect =
            vertical === "top"
              ? cy < sheet.height / 2
              : vertical === "bottom"
                ? cy > sheet.height / 2
                : Math.abs(cy - sheet.height / 2) < 6;
          return within && xCorrect && yCorrect;
        })
        .toBe(true);
    }
  }
  await page.getByRole("button", { name: "Berulang", exact: false }).click();
  const repeated = page.locator(".repeated-mark");
  await expect.poll(() => repeated.count()).toBeGreaterThan(10);
  const initialCount = await repeated.count();
  await page.getByLabel("Jarak horizontal").fill("90");
  await page.getByLabel("Jarak horizontal").blur();
  await page.getByLabel("Jarak vertikal").fill("90");
  await page.getByLabel("Jarak vertikal").blur();
  await expect.poll(() => repeated.count()).toBeLessThan(initialCount);
  const before = await page.locator(".real-pdf-page").boundingBox();
  const count = await repeated.count();
  await page.getByRole("button", { name: "Perbesar" }).click();
  await expect(page.getByLabel("Ukuran tampilan")).toHaveText("125%");
  await expect(canvas).toBeVisible();
  const after = await page.locator(".real-pdf-page").boundingBox();
  expect(after!.width / before!.width).toBeCloseTo(1.25, 2);
  expect(after!.height / before!.height).toBeCloseTo(1.25, 2);
  expect(await repeated.count()).toBe(count);
  const sync = await page.locator(".watermark-layer").evaluate((element) => ({
    baseWidth: parseFloat((element as HTMLElement).style.width),
    displayedWidth: element.getBoundingClientRect().width,
  }));
  expect(sync.displayedWidth).toBeCloseTo(after!.width, 1);
  await page.getByRole("button", { name: "Perkecil" }).click();
  await expect(page.getByLabel("Ukuran tampilan")).toHaveText("100%");
  await expect(canvas).toBeVisible();
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "multi.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(3, true),
  });
  await expect(page.getByText("Halaman 1 / 3", { exact: true })).toBeVisible();
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await expect(canvas).toHaveAttribute("aria-label", "Halaman PDF 2");
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await expect(canvas).toHaveAttribute("aria-label", "Halaman PDF 3");
  const landscape = await page.locator(".real-pdf-page").boundingBox();
  expect(landscape!.width).toBeGreaterThan(landscape!.height);
  await page.getByRole("button", { name: "Halaman sebelumnya" }).click();
  await expect(canvas).toHaveAttribute("aria-label", "Halaman PDF 2");
  await expect(repeated.first()).toHaveText("ARWIN NABIEL");
  await expect(process).toBeEnabled();
  await page.screenshot({
    path: "test-results/desktop-preview.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("error, penggantian file, rapid navigation, cleanup object URL", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const tracked = window as unknown as {
      createdUrls: string[];
      revokedUrls: string[];
    };
    tracked.createdUrls = [];
    tracked.revokedUrls = [];
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      tracked.createdUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      tracked.revokedUrls.push(url);
      revoke(url);
    };
  });
  await page.goto("/");
  const upload = page.getByLabel("Pilih file PDF", { exact: true });
  await upload.setInputFiles({
    name: "corrupt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.locator(".pdf-error")).toContainText("PDF rusak");
  await expect(page.getByRole("button", { name: "Proses PDF" })).toBeDisabled();
  await upload.setInputFiles({
    name: "empty.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(0),
  });
  await expect(
    page.getByText("File PDF kosong. Pilih file lain."),
  ).toBeVisible();
  await upload.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("notes"),
  });
  await expect(
    page.getByText("Format file tidak didukung. Pilih file PDF."),
  ).toBeVisible();
  await upload.setInputFiles({
    name: "good.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(3),
  });
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await page.getByRole("button", { name: "Perbesar" }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "Halaman PDF 3",
  );
  await upload.setInputFiles({
    name: "replacement.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await expect(page.getByText("Halaman 1 / 1", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ukuran tampilan")).toHaveText("100%");
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Hapus file PDF" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const tracked = window as unknown as {
          createdUrls: string[];
          revokedUrls: string[];
        };
        return tracked.createdUrls.every((url) =>
          tracked.revokedUrls.includes(url),
        );
      }),
    )
    .toBe(true);
});

test("mobile: halaman dan zoom tetap di dalam container scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "mobile.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".single-mark")).toBeInViewport();
  const baseWidth = (await page.locator(".real-pdf-page").boundingBox())!.width;
  await page.getByRole("button", { name: "Perbesar" }).click();
  await expect(page.getByLabel("Ukuran tampilan")).toHaveText("125%");
  await expect
    .poll(
      async () =>
        (await page.locator(".real-pdf-page").boundingBox())?.width ?? 0,
    )
    .toBeGreaterThan(baseWidth * 1.2);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const preview = await page.locator(".preview-card").boundingBox();
  const settings = await page.locator(".settings-card").boundingBox();
  expect(settings!.y).toBeGreaterThan(preview!.y + preview!.height);
  await page.screenshot({
    path: "test-results/mobile-preview.png",
    fullPage: true,
  });
});
