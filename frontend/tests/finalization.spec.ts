import { test, expect, type Page } from "@playwright/test";
import { pdfFixture } from "./pdf-fixture";

const processButton = (page: Page) =>
  page.getByRole("button", { name: "Proses PDF", exact: true });
async function upload(page: Page) {
  await page.getByLabel("Pilih file PDF", { exact: true }).setInputFiles({
    name: "audit.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(1),
  });
  await expect(processButton(page)).toBeEnabled();
}

test("drag/drop, multi-file rejection and keyboard accessibility", async ({
  page,
}) => {
  await page.goto("/");
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
    Array.from(pdfFixture(3)),
  );
  await page
    .locator(".upload-zone")
    .dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator(".upload-zone")).toHaveClass(/is-dragging/);
  await page
    .locator(".upload-zone")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByText("Halaman 1 / 3", { exact: true })).toBeVisible();
  await expect(processButton(page)).toBeEnabled();
  const position = page.getByRole("button", {
    name: "Bawah kanan",
    exact: true,
  });
  await position.focus();
  await page.keyboard.press("Enter");
  await expect(position).toHaveAttribute("aria-pressed", "true");
  await expect(position).toHaveAttribute("title", "Bawah kanan");
  await expect(position).toHaveCSS("outline-style", "solid");
  await page.locator("#watermark-opacity").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#watermark-opacity")).toHaveAttribute(
    "aria-valuetext",
    "41%",
  );
  const multiple = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    for (const name of ["first.pdf", "second.pdf"])
      data.items.add(new File(["%PDF-"], name, { type: "application/pdf" }));
    return data;
  });
  await page
    .locator(".upload-zone")
    .dispatchEvent("drop", { dataTransfer: multiple });
  await expect(page.locator(".error-text[role=alert]")).toContainText(
    "Pilih satu file PDF",
  );
  await expect(processButton(page)).toBeDisabled();
  await expect(page.locator("canvas")).toHaveCount(0);
  await transfer.dispose();
  await multiple.dispose();
});

test("fonts, color endpoints, long text, extreme sizes/angles and spacing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await upload(page);
  for (const [font, family] of [
    ["Arial", "Arial"],
    ["Helvetica", "Arial"],
    ["Times New Roman", "Times New Roman"],
    ["Courier", "Courier New"],
    ["Georgia", "Georgia"],
  ]) {
    await page.getByLabel("Jenis huruf", { exact: true }).selectOption(font);
    await expect(page.locator(".single-mark")).toHaveCSS(
      "font-family",
      new RegExp(family),
    );
  }
  for (const hex of ["#000000", "#FFFFFF", "#FF0000", "#4287F5"]) {
    await page.getByLabel("Warna", { exact: true }).fill(hex);
    await expect(page.getByLabel("Pilih warna watermark")).toHaveValue(
      hex.toLowerCase(),
    );
  }
  // Native color-input changes use exactly the same controlled state as HEX input.
  await page
    .getByLabel("Pilih warna watermark")
    .evaluate((input: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "#4287f5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(page.getByLabel("Warna", { exact: true })).toHaveValue(
    "#4287F5",
  );
  await page
    .getByLabel("Teks watermark", { exact: true })
    .fill("CONFIDENTIAL - INTERNAL DOCUMENT - ARWIN NABIEL");
  await page.getByLabel("Ukuran huruf").fill("200");
  await page.getByLabel("Ukuran huruf").blur();
  for (const angle of ["-180", "180", "45"]) {
    await page.getByLabel("Rotasi dalam derajat").fill(angle);
    const mark = page.locator(".single-mark");
    await expect(mark).toBeVisible();
    const bounds = (await mark.boundingBox())!,
      sheet = (await page.locator(".real-pdf-page").boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(sheet.x - 8);
    expect(bounds.y).toBeGreaterThanOrEqual(sheet.y - 8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      sheet.x + sheet.width + 8,
    );
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      sheet.y + sheet.height + 8,
    );
  }
  for (const opacity of ["0", "100"]) {
    await page.locator("#watermark-opacity").fill(opacity);
    await expect(page.locator(".single-mark")).toHaveCSS(
      "opacity",
      String(Number(opacity) / 100),
    );
  }
  await page.getByRole("button", { name: "Berulang" }).click();
  await page.getByLabel("Ukuran huruf").fill("8");
  await page.getByLabel("Ukuran huruf").blur();
  for (const spacing of ["0", "200"]) {
    await page.getByLabel("Jarak horizontal").fill(spacing);
    await page.getByLabel("Jarak horizontal").blur();
    await page.getByLabel("Jarak vertikal").fill(spacing);
    await page.getByLabel("Jarak vertikal").blur();
    await expect(page.locator(".repeated-mark").first()).toBeAttached();
    expect(await page.locator(".repeated-mark").count()).toBeLessThanOrEqual(
      20000,
    );
  }
  await page.getByLabel("Jarak horizontal").fill("");
  await expect(processButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Tunggal", exact: true }).click();
  await expect(page.getByLabel("Jarak horizontal")).toBeDisabled();
  await expect(processButton(page)).toBeEnabled();
  expect(errors).toEqual([]);
});

test("interrupted PDF response has a safe download error", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).endsWith("/api/pdf/process"))
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(
                  new Error("PRIVATE_INTERNAL_PATH /tmp/secret"),
                );
              },
            }),
            { headers: { "Content-Type": "application/pdf" } },
          ),
        );
      return original(input, init);
    };
  });
  await page.goto("/");
  await upload(page);
  await processButton(page).click();
  await expect(page.locator(".processing-result[role=alert]")).toContainText(
    "Koneksi ke server terputus saat menerima PDF.",
  );
  await expect(
    page.locator(".processing-result[role=alert]"),
  ).not.toContainText("PRIVATE_INTERNAL");
  await expect(page.getByRole("button", { name: "Simpan ulang" })).toHaveCount(
    0,
  );
});

test("safe Content-Disposition filename and responsive result", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  await upload(page);
  await page.route("**/api/pdf/process", (route) =>
    route.fulfill({
      contentType: "application/pdf",
      headers: {
        "Content-Disposition":
          "attachment; filename*=UTF-8''..%2F..%2Freport%20final.pdf",
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Access-Control-Allow-Origin": "http://localhost:3101",
      },
      body: pdfFixture(1),
    }),
  );
  const pending = page.waitForEvent("download");
  await processButton(page).click();
  await expect(
    page.getByRole("button", { name: "Simpan ulang" }),
  ).toBeVisible();
  expect((await pending).suggestedFilename()).toBe("report_final.pdf");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator("canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const button = (await page
      .getByRole("button", { name: "Simpan ulang" })
      .boundingBox())!;
    expect(button.x).toBeGreaterThanOrEqual(0);
    expect(button.x + button.width).toBeLessThanOrEqual(width);
  }
});
