import { test, expect, type Page } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";

async function ready(page: Page) {
  await page.route("**/api/pdf/process", (route) =>
    route.fulfill({
      contentType: "application/pdf",
      body: pdfFixture(1),
    }),
  );
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "document.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await expect(
    page.getByRole("button", { name: "Proses PDF", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Simpan ulang" }),
  ).toBeVisible();
  await expect(
    page.getByText("PDF berhasil diamankan", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Nama file PDF")).toHaveCount(0);
}

test("automatic download keeps the exact processed PDF with no extra click", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  let downloads = 0;
  page.on("download", () => downloads++);
  const pending = page.waitForEvent("download");
  await ready(page);
  const save = page.getByRole("button", { name: "Simpan ulang" });
  const download = await pending;
  expect(downloads).toBe(1);
  expect(download.suggestedFilename()).toBe("document_secured.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(pdfFixture(1));
  await expect(page.getByText("Unduhan dimulai", { exact: false })).toHaveCount(
    0,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByLabel("Teks watermark", { exact: true })
    .fill("New watermark");
  await expect(save).toHaveCount(0);
});

test("one save click opens the picker directly and writes the processed PDF", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      saveCheck: { options: null, bytes: [], closed: false },
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options: unknown) => {
        const check = (
          window as unknown as {
            saveCheck: { options: unknown; bytes: number[]; closed: boolean };
          }
        ).saveCheck;
        check.options = options;
        return {
          createWritable: async () => ({
            write: async (blob: Blob) => {
              check.bytes = Array.from(
                new Uint8Array(await blob.arrayBuffer()),
              );
            },
            close: async () => {
              check.closed = true;
            },
          }),
        };
      },
    });
  });
  await ready(page);
  await page.getByRole("button", { name: "Simpan ulang" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { saveCheck: { closed: boolean } }).saveCheck
            .closed,
      ),
    )
    .toBe(true);
  const check = await page.evaluate(
    () =>
      (
        window as unknown as {
          saveCheck: {
            options: { suggestedName: string };
            bytes: number[];
            closed: boolean;
          };
        }
      ).saveCheck,
  );
  expect(check.options.suggestedName).toBe("document_secured.pdf");
  expect(Buffer.from(check.bytes)).toEqual(pdfFixture(1));
  expect(check.closed).toBe(true);
});

test("cancel and disk failure preserve the result without another automatic download", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, { saveAttempts: 0, saveAborted: false });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => {
        const check = window as unknown as {
          saveAttempts: number;
          saveAborted: boolean;
        };
        if (++check.saveAttempts === 1)
          throw new DOMException("Cancelled", "AbortError");
        return {
          createWritable: async () => ({
            write: async () => {
              throw new Error("PRIVATE disk path");
            },
            abort: async () => {
              check.saveAborted = true;
            },
          }),
        };
      },
    });
  });
  let downloads = 0;
  page.on("download", () => downloads++);
  await ready(page);
  const save = page.getByRole("button", { name: "Simpan ulang" });
  await save.click();
  await expect(
    page.getByText("Penyimpanan dibatalkan", { exact: false }),
  ).toHaveCount(0);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator(".save-error[role=alert]")).toContainText(
    "PDF belum tersimpan",
  );
  await expect(page.locator(".save-error[role=alert]")).not.toContainText(
    "PRIVATE",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { saveAborted: boolean }).saveAborted,
    ),
  ).toBe(true);
  await expect(save).toBeEnabled();
  expect(downloads).toBe(1);
});

test("99 percent waits for the valid PDF and starts exactly one automatic download", async ({
  page,
}) => {
  let finish: (() => void) | undefined;
  let downloads = 0;
  let pickerCalls = 0;
  page.on("download", () => downloads++);
  await page.exposeFunction("pickerCalled", () => pickerCalls++);
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: async () => {
        await (
          window as unknown as { pickerCalled: () => Promise<void> }
        ).pickerCalled();
        throw new DOMException("User gesture needed", "SecurityError");
      },
      configurable: true,
    }),
  );
  await page.route("**/api/pdf/progress/*", (route) =>
    route.fulfill({ json: { percentage: 99 } }),
  );
  await page.route("**/api/pdf/process", async (route) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route.fulfill({
      contentType: "application/pdf",
      body: pdfFixture(1),
    });
  });
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "automatic.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "99",
  );
  expect(downloads).toBe(0);
  const pending = page.waitForEvent("download");
  finish!();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("automatic_secured.pdf");
  await expect(
    page.getByRole("button", { name: "Simpan ulang" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(650);
  expect(downloads).toBe(1);
  expect(pickerCalls).toBe(0);
  await page.getByRole("button", { name: "Atur ulang", exact: true }).click();
  expect(downloads).toBe(1);
});
