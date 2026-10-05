import { test, expect } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";

test("same-origin proxy accepts PDF uploads larger than its default 10 MiB buffer", async ({
  request,
}) => {
  const response = await request.post("/api/pdf/process", {
    multipart: {
      file: {
        name: "large-upload.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.concat([
          pdfFixture(1),
          Buffer.alloc(11 * 1024 * 1024, 32),
        ]),
      },
      config: JSON.stringify({ text: "LAN TEST", outputQuality: "economy" }),
    },
    timeout: 20000,
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("file picker, drag-and-drop and processing work without secure-context UUIDs", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (init?.body instanceof FormData)
        document.documentElement.dataset.progressId = String(
          init.body.get("progressId"),
        );
      return fetch(input, init);
    };
  });
  await page.goto("/");
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  if (process.env.LAN_TEST_URL)
    expect(await page.evaluate(() => isSecureContext)).toBe(false);

  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator(".upload-trigger").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "picked.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await expect(page.locator(".file-details")).toContainText("picked.pdf");
  await expect(page.locator(".pdf-canvas-host canvas")).toBeVisible();

  const transfer = await page.evaluateHandle(
    (bytes) => {
      const data = new DataTransfer();
      data.items.add(
        new File([Uint8Array.from(bytes)], "dropped.pdf", {
          type: "application/pdf",
        }),
      );
      return data;
    },
    Array.from(pdfFixture(2, true)),
  );
  try {
    await page.locator(".upload-zone").dispatchEvent("dragover", {
      dataTransfer: transfer,
    });
    await expect(page.locator(".upload-zone")).toHaveClass(/is-dragging/);
    await page.locator(".upload-zone").dispatchEvent("drop", {
      dataTransfer: transfer,
    });
  } finally {
    await transfer.dispose();
  }
  await expect(page.locator(".file-details")).toContainText("dropped.pdf");
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".upload-zone")).not.toHaveClass(/is-dragging/);

  const requestPromise = page.waitForRequest((request) =>
    request.url().endsWith("/api/pdf/process"),
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  const request = await requestPromise;
  const download = await downloadPromise;
  expect(new URL(request.url()).origin).toBe(new URL(baseURL!).origin);
  await expect(page.locator("html")).toHaveAttribute(
    "data-progress-id",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(download.suggestedFilename()).toBe("dropped_secured.pdf");
  expect(await download.failure()).toBeNull();
  await expect(
    page.getByRole("button", { name: "Simpan ulang" }),
  ).toBeVisible();
  await expect(
    page.getByText("PDF gagal diproses", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("real worker can be cancelled and immediately restarted without randomUUID", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  let downloads = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("download", () => downloads++);
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    const ids: string[] = [];
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (init?.body instanceof FormData) {
        ids.push(String(init.body.get("progressId")));
        document.documentElement.dataset.progressIds = JSON.stringify(ids);
      }
      return fetch(input, init);
    };
  });
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "cancel-retry.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(60, true),
  });
  const process = page.getByRole("button", {
    name: "Proses PDF",
    exact: true,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await process.click();
    await expect
      .poll(async () =>
        Number(
          await page.getByRole("progressbar").getAttribute("aria-valuenow"),
        ),
      )
      .toBeGreaterThanOrEqual(5);
    const stopped = page.waitForResponse((response) =>
      response.url().includes("/api/pdf/cancel/"),
    );
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    if (attempt === 1) await process.click();
    expect((await stopped).status()).toBe(204);
  }
  await expect(page.getByRole("button", { name: "Simpan ulang" })).toBeVisible({
    timeout: 30000,
  });
  await expect.poll(() => downloads).toBe(1);
  const ids: string[] = await page.evaluate(() =>
    JSON.parse(document.documentElement.dataset.progressIds!),
  );
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(3);
  await expect(
    page.getByText("PDF gagal diproses", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
