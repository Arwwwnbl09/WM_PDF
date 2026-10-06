import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pdfFixture } from "./pdf-fixture";
import { backendPython, verifyDownloadScript } from "./backend-tools";

async function upload(page: Page, pages = 1) {
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "source.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(pages),
  });
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeEnabled();
}
async function downloadFrom(page: Page, label: string) {
  await page.evaluate(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  return pending;
}

test("real backend: upload once, create two independent copies and save three uniquely named watermarked PDFs", async ({
  page,
}) => {
  test.setTimeout(90000);
  const requests: {
    filename: string;
    text: string;
    id: string;
    body: string;
  }[] = [];
  await page.route("**/api/pdf/process", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataBuffer()!.toString();
      const config = JSON.parse(
        body.match(/name="config"\r\n\r\n([^\r]+)/)![1],
      );
      requests.push({
        filename: body.match(/filename="([^"]+)"/)![1],
        text: config.text,
        id: body.match(/name="progressId"\r\n\r\n([^\r]+)/)![1],
        body,
      });
    }
    await route.continue();
  });
  await upload(page, 3);
  await page.getByLabel("Teks watermark", { exact: true }).fill("DIVISI SATU");
  await page.getByLabel("Warna", { exact: true }).fill("#C82CC8");
  await page.getByLabel("Rotasi dalam derajat").fill("0");
  await page.getByRole("button", { name: "Buat salinan", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(2);
  await expect(page.getByLabel("Teks watermark", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Warna", { exact: true })).toHaveValue(
    "#C82CC8",
  );
  await expect(
    page.getByRole("button", { name: "Proses semua (2 PDF)", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Teks watermark", { exact: true }).fill("DIVISI DUA");
  await page.getByRole("button", { name: "Atas kiri", exact: true }).click();
  await page
    .getByRole("button", { name: "Buat salinan 1: source.pdf", exact: true })
    .click();
  await expect(page.locator(".queue-item")).toHaveCount(3);
  await page.getByLabel("Teks watermark", { exact: true }).fill("DIVISI TIGA");
  await page.getByRole("button", { name: "Bawah kanan", exact: true }).click();
  await page
    .getByRole("button", { name: "Atur 1: source.pdf", exact: true })
    .click();
  await expect(page.locator(".single-mark")).toHaveText("DIVISI SATU");
  await expect(
    page.getByRole("button", { name: "Tengah", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", {
      name: "Atur 2: source.pdf (salinan 1)",
      exact: true,
    })
    .click();
  await expect(page.locator(".single-mark")).toHaveText("DIVISI DUA");
  await expect(
    page.getByRole("button", { name: "Atas kiri", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(requests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Proses semua (3 PDF)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Buat salinan", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".status-success")).toHaveCount(3, {
    timeout: 45000,
  });
  expect(requests.map((request) => request.text)).toEqual([
    "DIVISI SATU",
    "DIVISI DUA",
    "DIVISI TIGA",
  ]);
  expect(
    requests.every(
      (request) =>
        request.filename === "source.pdf" &&
        request.body.includes(pdfFixture(3).toString()),
    ),
  ).toBe(true);
  expect(new Set(requests.map((request) => request.id)).size).toBe(3);
  const names = [
    "source.pdf",
    "source.pdf (salinan 1)",
    "source.pdf (salinan 2)",
  ];
  for (let index = 0; index < 3; index++) {
    const download = await downloadFrom(
      page,
      `Simpan PDF ${index + 1}: ${names[index]}`,
    );
    expect(download.suggestedFilename()).toBe(
      index === 0
        ? "source_secured.pdf"
        : `source_secured_salinan_${index}.pdf`,
    );
    const path = resolve("test-results", `copy-real-${index}.pdf`);
    await download.saveAs(path);
    const result = JSON.parse(
      execFileSync(backendPython, [verifyDownloadScript, path, "3"], {
        encoding: "utf8",
      }),
    );
    expect(result.pages).toBe(3);
    expect(result.bounds.every(Boolean)).toBe(true);
    for (const [left, top, right, bottom] of result.bounds) {
      const x = (left + right) / 2,
        y = (top + bottom) / 2;
      if (index === 0) {
        expect(Math.abs(x - 595 / 2)).toBeLessThan(3);
        expect(Math.abs(y - 842 / 2)).toBeLessThan(3);
      }
      if (index === 1) {
        expect(x).toBeLessThan(595 / 2);
        expect(y).toBeLessThan(842 / 2);
      }
      if (index === 2) {
        expect(x).toBeGreaterThan(595 / 2);
        expect(y).toBeGreaterThan(842 / 2);
      }
    }
  }
});

test("copying completed PDFs retains their results, uses fresh names after removal and fits mobile layouts", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/pdf/process", (route) => {
    calls++;
    return route.fulfill({
      contentType: "application/pdf",
      body: pdfFixture(1),
    });
  });
  await upload(page);
  await page
    .getByLabel("Teks watermark", { exact: true })
    .fill("UNTUK KANTOR PUSAT");
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Simpan ulang", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Buat salinan", exact: true }).click();
  await expect(page.locator(".status-success")).toHaveCount(1);
  await expect(
    page.getByLabel("Teks watermark untuk file 1", { exact: true }),
  ).toHaveValue("UNTUK KANTOR PUSAT");
  await page.getByLabel("Teks watermark", { exact: true }).fill("UNTUK CABANG");
  await page
    .getByRole("button", { name: "Proses sisa (1 PDF)", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(2);
  expect(calls).toBe(2);
  await page
    .getByRole("button", {
      name: "Buat salinan 2: source.pdf (salinan 1)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Atur 3: source.pdf (salinan 2)",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".status-success")).toHaveCount(2);
  await page
    .getByRole("button", {
      name: "Hapus 3: source.pdf (salinan 2)",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Buat salinan 1: source.pdf", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Atur 3: source.pdf (salinan 3)",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Teks watermark", { exact: true })
    .fill("UNTUK DIVISI LAIN");
  for (const width of [320, 390, 768, 1000, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.screenshot({
    path: "test-results/copies-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Proses sisa (1 PDF)", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(3);
  const download = await downloadFrom(
    page,
    "Simpan PDF 3: source.pdf (salinan 3)",
  );
  expect(download.suggestedFilename()).toBe("source_secured_salinan_3.pdf");
  await page
    .getByRole("button", { name: "Hapus 1: source.pdf", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(2);
  const retained = await downloadFrom(
    page,
    "Simpan PDF 1: source.pdf (salinan 1)",
  );
  expect(retained.suggestedFilename()).toBe("source_secured_salinan_1.pdf");
});
