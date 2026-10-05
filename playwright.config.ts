import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.LAN_TEST_URL || "http://localhost:3101",
    browserName: "chromium",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  webServer: process.env.LAN_TEST_URL
    ? undefined
    : {
        command: "npm run start -- --port 3101",
        url: "http://localhost:3101",
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
