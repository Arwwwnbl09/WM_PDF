import { test, expect, type Page } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";

async function upload(page: Page) {
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "document.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeEnabled();
}

test("custom name is used for automatic download and native save; renaming retains the processed bytes", async ({
  page,
}) => {
  let requests = 0,
    downloads = 0;
  await page.addInitScript(() => {
    Object.assign(window, {
      saveCheck: { name: "", bytes: [] as number[], closed: false },
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options: { suggestedName: string }) => {
        const check = (
          window as unknown as {
            saveCheck: { name: string; bytes: number[]; closed: boolean };
          }
        ).saveCheck;
        check.name = options.suggestedName;
        return {
          createWritable: async () => ({
            write: async (blob: Blob) => {
              check.bytes = [...new Uint8Array(await blob.arrayBuffer())];
            },
            close: async () => {
              check.closed = true;
            },
          }),
        };
      },
    });
  });
  page.on("download", () => downloads++);
  await page.route("**/api/pdf/process", (route) => {
    requests++;
    return route.fulfill({
      contentType: "application/pdf",
      body: pdfFixture(1),
      headers: {
        "Content-Disposition": 'attachment; filename="server-name.pdf"',
      },
    });
  });
  await upload(page);
  const field = page.getByLabel("Nama file hasil", { exact: true });
  await expect(field).toHaveValue("document_secured.pdf");
  await field.fill("Dokumen Teknik – Divisi A");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("Dokumen Teknik – Divisi A.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(pdfFixture(1));
  await expect(
    page.getByRole("button", { name: "Simpan ulang", exact: true }),
  ).toBeVisible();
  await field.fill("Revisi Kantor.pdf.pdf");
  await page.getByRole("button", { name: "Simpan ulang", exact: true }).click();
  await expect(field).toHaveValue("Revisi Kantor.pdf");
  const saved = await page.evaluate(
    () =>
      (
        window as unknown as {
          saveCheck: { name: string; bytes: number[]; closed: boolean };
        }
      ).saveCheck,
  );
  expect(saved.name).toBe("Revisi Kantor.pdf");
  expect(saved.closed).toBe(true);
  expect(Buffer.from(saved.bytes)).toEqual(pdfFixture(1));
  expect(requests).toBe(1);
  expect(downloads).toBe(1);
});

test("each copy keeps its own filename; invalid names block processing and saving without deleting results", async ({
  page,
}) => {
  let requests = 0;
  const automaticNames: string[] = [];
  page.on("download", (download) =>
    automaticNames.push(download.suggestedFilename()),
  );
  let finishFirst: (() => void) | undefined;
  await page.route("**/api/pdf/process", async (route) => {
    requests++;
    if (requests === 1)
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    await route.fulfill({
      contentType: "application/pdf",
      body: pdfFixture(1),
    });
  });
  await upload(page);
  await page
    .getByLabel("Nama file hasil", { exact: true })
    .fill("Kantor Pusat");
  await page.getByRole("button", { name: "Buat salinan", exact: true }).click();
  await page
    .getByLabel("Teks watermark", { exact: true })
    .fill("UNTUK CABANG JAKARTA");
  await page.getByRole("button", { name: "Buat salinan", exact: true }).click();
  await page
    .getByLabel("Teks watermark", { exact: true })
    .fill("UNTUK CABANG SURABAYA");
  const field = (index: number) =>
    page.getByLabel(`Nama file hasil untuk file ${index}`, { exact: true });
  await expect(field(1)).toHaveValue("Kantor Pusat.pdf");
  await field(2).fill("Cabang Jakarta.pdf");
  await field(3).fill("");
  const process = page.getByRole("button", {
    name: "Proses semua (3 PDF)",
    exact: true,
  });
  await expect(process).toBeDisabled();
  await expect(
    page.getByText("Isi nama file hasil.", { exact: true }),
  ).toBeVisible();
  for (const invalid of [
    "../laporan",
    "C:\\hasil.pdf",
    "CON",
    "nama|file",
    ".pdf",
  ]) {
    await field(3).fill(invalid);
    await expect(field(3)).toHaveAttribute("aria-invalid", "true");
    await expect(process).toBeDisabled();
  }
  expect(requests).toBe(0);
  await field(3).fill("Cabang Surabaya.PDF");
  await process.click();
  await expect(field(1)).toBeDisabled();
  await expect(field(2)).toBeDisabled();
  await expect(field(3)).toBeDisabled();
  await expect.poll(() => typeof finishFirst).toBe("function");
  finishFirst!();
  await expect(page.locator(".status-success")).toHaveCount(3);
  await page.evaluate(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  const names = [
    "document.pdf",
    "document.pdf (salinan 1)",
    "document.pdf (salinan 2)",
  ];
  const expected = [
    "Kantor Pusat.pdf",
    "Cabang Jakarta.pdf",
    "Cabang Surabaya.pdf",
  ];
  await expect.poll(() => automaticNames).toEqual(expected);
  for (let index = 0; index < 3; index++) {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: `Simpan PDF ${index + 1}: ${names[index]}`,
        exact: true,
      })
      .click();
    expect((await pending).suggestedFilename()).toBe(expected[index]);
  }
  const save = page.getByRole("button", {
    name: "Simpan PDF 2: document.pdf (salinan 1)",
    exact: true,
  });
  await field(2).fill("");
  await expect(save).toBeDisabled();
  await expect(page.locator(".status-success")).toHaveCount(3);
  await field(2).fill("Revisi Cabang Jakarta");
  const pending = page.waitForEvent("download");
  await save.click();
  expect((await pending).suggestedFilename()).toBe("Revisi Cabang Jakarta.pdf");
  expect(requests).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".pdf-queue")
    .screenshot({ path: "test-results/filename-queue-mobile.png" });
});
