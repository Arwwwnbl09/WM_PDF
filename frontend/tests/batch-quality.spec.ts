import { test, expect } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";

test("one quality applies to four PDFs, appended files and copies while each watermark remains independent", async ({
  page,
}) => {
  const configs: {
    outputQuality: string;
    text: string;
    position: string;
    color: string;
  }[] = [];
  let finishFirst: (() => void) | undefined;
  await page.route("**/api/pdf/process", async (route) => {
    const body = route.request().postDataBuffer()!.toString();
    configs.push(JSON.parse(body.match(/name="config"\r\n\r\n([^\r]+)/)![1]));
    if (configs.length === 1)
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    await route.fulfill({
      contentType: "application/pdf",
      body: pdfFixture(1),
    });
  });
  await page.goto("/");
  const quality = page.getByLabel("Kualitas PDF", { exact: true });
  await quality.selectOption("balanced");
  const files = Array.from({ length: 5 }, (_, index) => ({
    name: `document-${index + 1}.pdf`,
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  }));
  await page
    .getByLabel("Pilih file PDF", { exact: true })
    .setInputFiles(files.slice(0, 4));
  for (let index = 1; index <= 4; index++) {
    await page
      .getByLabel(`Teks watermark untuk file ${index}`, { exact: true })
      .fill(`DIVISI ${index}`);
    await page
      .getByRole("button", {
        name: `Atur ${index}: document-${index}.pdf`,
        exact: true,
      })
      .click();
    await expect(quality).toHaveValue("balanced");
    if (index === 2) {
      await page
        .getByRole("button", { name: "Atas kiri", exact: true })
        .click();
      await page.getByLabel("Warna", { exact: true }).fill("#2169A6");
    }
  }
  await page
    .getByRole("button", { name: "Proses semua (4 PDF)", exact: true })
    .click();
  await expect.poll(() => typeof finishFirst).toBe("function");
  await expect(quality).toBeDisabled();
  finishFirst!();
  await expect(page.locator(".status-success")).toHaveCount(4);
  expect(configs.map((config) => config.outputQuality)).toEqual(
    Array(4).fill("balanced"),
  );
  expect(configs.map((config) => config.text)).toEqual([
    "DIVISI 1",
    "DIVISI 2",
    "DIVISI 3",
    "DIVISI 4",
  ]);
  expect(configs[1].position).toBe("top-left");
  expect(configs[0].position).toBe("middle-center");
  expect(configs[1].color).toBe("#2169A6");
  await quality.selectOption("balanced");
  await expect(page.locator(".status-success")).toHaveCount(4);

  await page
    .getByLabel("Tambah file PDF", { exact: true })
    .setInputFiles(files[4]);
  await page
    .getByLabel("Teks watermark untuk file 5", { exact: true })
    .fill("DIVISI 5");
  await page
    .getByRole("button", { name: "Atur 5: document-5.pdf", exact: true })
    .click();
  await expect(quality).toHaveValue("balanced");
  await page
    .getByRole("button", {
      name: "Buat salinan 1: document-1.pdf",
      exact: true,
    })
    .click();
  await page.getByLabel("Teks watermark", { exact: true }).fill("DIVISI 6");
  await expect(quality).toHaveValue("balanced");
  await quality.selectOption("economy");
  await expect(page.locator(".status-success")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Atur 2: document-2.pdf", exact: true })
    .click();
  await expect(quality).toHaveValue("economy");
  await expect(page.getByLabel("Warna", { exact: true })).toHaveValue(
    "#2169A6",
  );
  await expect(page.getByLabel("Teks watermark", { exact: true })).toHaveValue(
    "DIVISI 2",
  );
  await page
    .getByRole("button", { name: "Proses semua (6 PDF)", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(6);
  expect(configs.slice(4).map((config) => config.outputQuality)).toEqual(
    Array(6).fill("economy"),
  );
  expect(configs.slice(4).map((config) => config.text)).toEqual(
    Array.from({ length: 6 }, (_, index) => `DIVISI ${index + 1}`),
  );
  expect(configs[5].position).toBe("top-left");
  expect(configs[5].color).toBe("#2169A6");
  await page.getByRole("button", { name: "Atur ulang", exact: true }).click();
  await expect(quality).toHaveValue("compact");
  await expect(page.locator(".queue-item")).toHaveCount(0);
});
