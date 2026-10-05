import { test, expect } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";

test("real PDF worker reports page progress to the circle", async ({
  page,
}) => {
  const updates: number[] = [];
  page.on("response", async (response) => {
    if (
      response.url().includes("/api/pdf/progress/") &&
      response.status() === 200
    ) {
      const data = await response.json().catch(() => null);
      if (data) updates.push(data.percentage);
    }
  });
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "progress-real.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(12, true),
  });
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  await expect
    .poll(() => updates.some((value) => value > 0 && value < 100), {
      timeout: 30000,
    })
    .toBe(true);
  await expect(page.getByRole("button", { name: "Simpan ulang" })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("circle follows actual progress, stays monotonic and disappears after success", async ({
  page,
}) => {
  let percentage = 0;
  let finish: (() => void) | undefined;
  await page.route("**/api/pdf/process", async (route) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route.fulfill({
      contentType: "application/pdf",
      body: pdfFixture(1),
    });
  });
  await page.route("**/api/pdf/progress/*", (route) =>
    route.fulfill({ json: { percentage } }),
  );
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "progress.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  const circle = page.getByRole("progressbar", { name: "Progres PDF" });
  await expect(circle).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByText("processed", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Securing your PDF...", { exact: true }),
  ).toHaveCount(0);
  percentage = 42;
  await expect(circle).toHaveAttribute("aria-valuenow", "42");
  await expect(circle).toContainText("42%");
  percentage = 12;
  await page.waitForTimeout(650);
  await expect(circle).toHaveAttribute("aria-valuenow", "42");
  percentage = 100;
  await expect(circle).toHaveAttribute("aria-valuenow", "99");
  await page
    .locator(".processing-progress")
    .screenshot({ path: "test-results/progress-circle.png" });
  finish!();
  await expect(
    page.getByRole("button", { name: "Simpan ulang" }),
  ).toBeVisible();
  await expect(circle).toHaveCount(0);
});

test("cancel removes the circle and discards the old result", async ({
  page,
}) => {
  let downloads = 0;
  page.on("download", () => downloads++);
  let finish: (() => void) | undefined;
  await page.route("**/api/pdf/process", async (route) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route
      .fulfill({ contentType: "application/pdf", body: pdfFixture(1) })
      .catch(() => {});
  });
  await page.route("**/api/pdf/progress/*", (route) =>
    route.fulfill({ json: { percentage: 50 } }),
  );
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "progress.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await page.getByRole("button", { name: "Proses PDF", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "50",
  );
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  finish!();
  await page.waitForTimeout(650);
  await expect(page.getByRole("button", { name: "Simpan ulang" })).toHaveCount(
    0,
  );
  expect(downloads).toBe(0);
});

test("retry waits for cancellation, creates a new ID and ignores the old result", async ({
  page,
}) => {
  const ids: string[] = [];
  const finishes: (() => void)[] = [];
  let finishCancellation: (() => void) | undefined;
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.route("**/api/pdf/process", async (route) => {
    const body = route.request().postDataBuffer()!.toString();
    ids.push(body.match(/name="progressId"\r\n\r\n([^\r]+)/)![1]);
    await new Promise<void>((resolve) => finishes.push(resolve));
    await route
      .fulfill({ contentType: "application/pdf", body: pdfFixture(1) })
      .catch(() => {});
  });
  await page.route("**/api/pdf/progress/*", (route) =>
    route.fulfill({
      json: { percentage: route.request().url().endsWith(ids[0]) ? 5 : 7 },
    }),
  );
  await page.route("**/api/pdf/cancel/*", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().url()).toContain(ids[0]);
    await new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    await route.fulfill({ status: 204 });
  });
  await page.goto("/");
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "retry.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await expect(page.locator(".pdf-render-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  // A broken UUID implementation must never be called by processing or retry.
  await page.evaluate(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: () => {
        throw new Error("crypto.randomUUID is not a function");
      },
      configurable: true,
    });
  });
  const process = page.getByRole("button", {
    name: "Proses PDF",
    exact: true,
  });
  const circle = page.getByRole("progressbar");
  await process.click();
  await expect(circle).toHaveAttribute("aria-valuenow", "5");
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await expect(circle).toHaveCount(0);
  await process.click();
  await expect.poll(() => typeof finishCancellation).toBe("function");
  await expect(circle).toHaveAttribute("aria-valuenow", "0");
  expect(ids).toHaveLength(1);
  finishCancellation!();
  await expect.poll(() => ids.length).toBe(2);
  expect(new Set(ids).size).toBe(2);
  for (const id of ids)
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  finishes[0]();
  await expect(circle).toHaveAttribute("aria-valuenow", "7");
  expect(downloads).toBe(0);
  await expect(page.getByRole("button", { name: "Simpan ulang" })).toHaveCount(
    0,
  );
  finishes[1]();
  await expect(
    page.getByRole("button", { name: "Simpan ulang" }),
  ).toBeVisible();
  await expect.poll(() => downloads).toBe(1);
  await expect(
    page.getByText("PDF gagal diproses", { exact: true }),
  ).toHaveCount(0);
});
