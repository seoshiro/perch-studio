import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  retries: 0,
  timeout: 45000,
  use: {
    baseURL: process.env.LIVE_URL || "http://127.0.0.1:5418",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CI
      ? { args: ["--enable-unsafe-swiftshader"] }
      : {
          executablePath:
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
        },
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: process.env.LIVE_URL
    ? undefined
    : {
        command: "node scripts/serve.mjs",
        url: "http://127.0.0.1:5418",
        reuseExistingServer: !process.env.CI,
      },
});
