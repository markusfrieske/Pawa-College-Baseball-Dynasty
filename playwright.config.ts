import { defineConfig, devices } from "@playwright/test";
import { existsSync, readdirSync } from "fs";

function findPlaywrightChromium(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  try {
    const entries = readdirSync(base);
    for (const entry of entries) {
      if (entry.startsWith("chromium-")) {
        const candidate = `${base}/${entry}/chrome-linux/chrome`;
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {}
  return undefined;
}

const executablePath = findPlaywrightChromium();

export default defineConfig({
  testDir: "./tests",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5000",
    reuseExistingServer: true,
    timeout: 120_000,
  },

  use: {
    baseURL: "http://localhost:5000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    launchOptions: {
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
      ],
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
