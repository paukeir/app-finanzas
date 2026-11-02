import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const system =
  process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    launchOptions: system ? { executablePath: system } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node server.mjs",
    env: { PORT: "5174" },
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
  },
});
