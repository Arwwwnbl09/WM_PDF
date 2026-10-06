import {
  test,
  expect,
  type Page,
  type Request,
  type Download,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pdfFixture } from "./pdf-fixture";
import { backendPython, verifyDownloadScript } from "./backend-tools";

const files = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `document-${index + 1}.pdf`,
    mimeType: "application/pdf",
    buffer: pdfFixture(index + 1),
  }));
function job(request: Request) {
  const body = request.postDataBuffer()!.toString();
  return {
    filename: body.match(/filename="([^"]+)"/)![1],
    config: JSON.parse(body.match(/name="config"\r\n\r\n([^\r]+)/)![1]),
    id: body.match(/name="progressId"\r\n\r\n([^\r]+)/)![1],
  };
}
async function upload(page: Page, count = 5) {
  await page.goto("/");
  await page
    .getByLabel("Pilih file PDF", { exact: true })
    .setInputFiles(files(count));
  await expect(page.locator(".queue-item")).toHaveCount(count);
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  for (let index = 1; index <= count; index++)
    await page
      .getByLabel(`Teks watermark untuk file ${index}`, { exact: true })
      .fill(`UNTUK DIVISI ${index}`);
}
async function disablePicker(page: Page) {
  await page.evaluate(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
}

test("five files retain independent settings and process sequentially; failed file can be retried", async ({
  page,
}) => {
  const calls: ReturnType<typeof job>[] = [];
  let active = 0,
    maximum = 0,
    automaticDownloads = 0;
  page.on("download", () => automaticDownloads++);
  await page.route("**/api/pdf/progress/*", (route) =>
    route.fulfill({ json: { percentage: 50 } }),
  );
  await page.route("**/api/pdf/process", async (route) => {
    const data = job(route.request());
    calls.push(data);
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 100));
    active--;
    if (data.filename === "document-3.pdf" && calls.length === 3) {
      await route.fulfill({
        status: 422,
        json: { detail: "PDF rusak. Pilih file lain." },
      });
    } else {
      const index = Number(data.filename.match(/\d+/)![0]);
      await route.fulfill({
        contentType: "application/pdf",
        body: pdfFixture(index),
      });
    }
  });
  await upload(page);
  await page
    .getByRole("button", { name: "Atur 2: document-2.pdf", exact: true })
    .click();
  await expect(page.getByLabel("Teks watermark", { exact: true })).toHaveValue(
    "UNTUK DIVISI 2",
  );
  await page.getByLabel("Kualitas PDF", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Atas kiri", exact: true }).click();
  await page
    .getByRole("button", { name: "Atur 1: document-1.pdf", exact: true })
    .click();
  await expect(page.getByLabel("Kualitas PDF", { exact: true })).toHaveValue(
    "high",
  );
  await expect(page.locator(".single-mark")).toHaveText("UNTUK DIVISI 1");
  await page
    .getByRole("button", { name: "Atur 2: document-2.pdf", exact: true })
    .click();
  await expect(page.getByLabel("Kualitas PDF", { exact: true })).toHaveValue(
    "high",
  );
  await page
    .getByRole("button", { name: "Proses semua (5 PDF)", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(4);
  await expect(page.locator(".queue-item").nth(2)).toContainText("PDF rusak");
  expect(calls.map((data) => data.config.text)).toEqual(
    Array.from({ length: 5 }, (_, index) => `UNTUK DIVISI ${index + 1}`),
  );
  expect(calls[1].config.outputQuality).toBe("high");
  expect(calls.every((data) => data.config.outputQuality === "high")).toBe(
    true,
  );
  expect(calls[1].config.position).toBe("top-left");
  expect(maximum).toBe(1);
  await expect.poll(() => automaticDownloads).toBe(4);
  await page
    .getByRole("button", { name: "Proses sisa (1 PDF)", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(5);
  expect(calls.map((data) => data.filename)).toEqual([
    ...files(5).map((file) => file.name),
    "document-3.pdf",
  ]);
  expect(new Set(calls.map((data) => data.id)).size).toBe(6);
  await expect.poll(() => automaticDownloads).toBe(5);
  await disablePicker(page);
  for (let index = 1; index <= 5; index++) {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: `Simpan PDF ${index}: document-${index}.pdf`,
        exact: true,
      })
      .click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`document-${index}_secured.pdf`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(pdfFixture(index));
  }
  await page
    .getByLabel("Teks watermark untuk file 2", { exact: true })
    .fill("REVISI DIVISI 2");
  await expect(page.locator(".status-success")).toHaveCount(4);
  await expect(
    page.getByRole("button", {
      name: "Simpan PDF 1: document-1.pdf",
      exact: true,
    }),
  ).toBeVisible();
});

test("cancel stops pending uploads, retains completed PDFs and ignores late responses before retry", async ({
  page,
}) => {
  const calls: ReturnType<typeof job>[] = [];
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  let finishOld: (() => void) | undefined;
  await page.route("**/api/pdf/cancel/*", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/api/pdf/progress/*", (route) =>
    route.fulfill({ json: { percentage: 50 } }),
  );
  await page.route("**/api/pdf/process", async (route) => {
    calls.push(job(route.request()));
    if (calls.length === 2)
      await new Promise<void>((resolve) => {
        finishOld = resolve;
      });
    await route
      .fulfill({ contentType: "application/pdf", body: pdfFixture(1) })
      .catch(() => {});
  });
  await upload(page, 3);
  await page
    .getByRole("button", { name: "Proses semua (3 PDF)", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(1);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "50",
  );
  await expect(page.locator(".batch-progress-detail")).toContainText(
    "File 2 / 3",
  );
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  expect(calls).toHaveLength(2);
  await expect.poll(() => downloads).toEqual(["document-1_secured.pdf"]);
  finishOld!();
  await page
    .getByRole("button", { name: "Proses sisa (2 PDF)", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(3);
  expect(calls.map((data) => data.filename)).toEqual([
    "document-1.pdf",
    "document-2.pdf",
    "document-2.pdf",
    "document-3.pdf",
  ]);
  expect(new Set(calls.map((data) => data.id)).size).toBe(4);
  await expect
    .poll(() => downloads)
    .toEqual([
      "document-1_secured.pdf",
      "document-2_secured.pdf",
      "document-3_secured.pdf",
    ]);
});

test("drop accepts multiple PDFs, append and removal preserve other texts, blank text blocks batch, mobile stays within viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".upload-zone").evaluate(
    (element, data) => {
      const transfer = new DataTransfer();
      data.forEach((file) =>
        transfer.items.add(
          new File([new Uint8Array(file.bytes)], file.name, {
            type: file.type,
          }),
        ),
      );
      element.dispatchEvent(
        new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
      );
    },
    [
      ...files(2).map((file) => ({
        name: file.name,
        type: file.mimeType,
        bytes: [...file.buffer],
      })),
      { name: "notes.txt", type: "text/plain", bytes: [65] },
    ],
  );
  await expect(page.locator(".queue-item")).toHaveCount(2);
  await expect(
    page.getByText("Format file tidak didukung. Pilih file PDF.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Teks watermark untuk file 1", { exact: true })
    .fill("KANTOR PUSAT");
  await page
    .getByLabel("Tambah file PDF", { exact: true })
    .setInputFiles(files(3));
  await expect(page.locator(".queue-item")).toHaveCount(5);
  await expect(
    page.getByLabel("Teks watermark untuk file 1", { exact: true }),
  ).toHaveValue("KANTOR PUSAT");
  await page
    .getByLabel("Teks watermark untuk file 5", { exact: true })
    .fill(" ");
  await expect(
    page.getByRole("button", { name: "Proses semua (5 PDF)", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Hapus 5: document-3.pdf", exact: true })
    .click();
  await expect(page.locator(".queue-item")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Proses semua (4 PDF)", exact: true }),
  ).toBeEnabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".single-mark")).toHaveText("KANTOR PUSAT");
  await page.screenshot({
    path: "test-results/batch-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".single-mark")).toBeVisible();
  await page.screenshot({
    path: "test-results/batch-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Atur ulang", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("real backend: processing all automatically downloads five watermarked PDFs with all pages", async ({
  page,
}) => {
  test.setTimeout(120000);
  const requests: ReturnType<typeof job>[] = [];
  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  await page.route("**/api/pdf/process", async (route) => {
    if (route.request().method() === "POST")
      requests.push(job(route.request()));
    await route.continue();
  });
  await upload(page);
  for (let index = 1; index <= 5; index++) {
    await page
      .getByRole("button", {
        name: `Atur ${index}: document-${index}.pdf`,
        exact: true,
      })
      .click();
    await page.getByLabel("Warna", { exact: true }).fill("#C82CC8");
  }
  await page
    .getByRole("button", { name: "Proses semua (5 PDF)", exact: true })
    .click();
  await expect(page.locator(".status-success")).toHaveCount(5, {
    timeout: 60000,
  });
  expect(requests.map((data) => data.config.text)).toEqual(
    Array.from({ length: 5 }, (_, index) => `UNTUK DIVISI ${index + 1}`),
  );
  await expect.poll(() => downloads.length).toBe(5);
  for (let index = 1; index <= 5; index++) {
    const download = downloads[index - 1];
    expect(download.suggestedFilename()).toBe(`document-${index}_secured.pdf`);
    const path = resolve("test-results", `batch-real-${index}.pdf`);
    await download.saveAs(path);
    const result = JSON.parse(
      execFileSync(backendPython, [verifyDownloadScript, path, String(index)], {
        encoding: "utf8",
      }),
    );
    expect(result.pages).toBe(index);
    expect(result.bounds.every(Boolean)).toBe(true);
  }
});
