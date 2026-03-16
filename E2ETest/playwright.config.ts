import { defineConfig, devices } from "@playwright/test";

const BASE_URL =
  process.env.BASE_URL ??
  "https://gray-pebble-030ae3b10.1.azurestaticapps.net";

const API_BASE =
  process.env.API_BASE ??
  "https://bizroom-backend-gqfjg4e6bwdvhyfn.centralus-01.azurewebsites.net";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./reports/test-results",

  // Global timeout: generous for AI responses
  timeout: 120_000,
  expect: { timeout: 30_000 },

  fullyParallel: false, // Sequential — tests share meeting state
  retries: 1,
  workers: 1,

  reporter: [
    ["html", { outputFolder: "./reports", open: "never" }],
    ["list"],
  ],

  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "local-chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: false,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],

  // Expose API_BASE as env for helpers
  ...(API_BASE ? {} : {}), // placeholder — accessed via process.env
});

export { BASE_URL, API_BASE };
