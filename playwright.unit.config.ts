import { defineConfig } from "@playwright/test";

/**
 * Pure unit tests. These do not start the HTTP server or require a database.
 * Keeping this separate from the browser/API suite makes the first release-gate
 * stage fast and portable on Windows, Linux, and Replit.
 */
export default defineConfig({
  testDir: "./tests/unit",
  testMatch: [
    "rosterHelpers.test.ts",
    "leagueViewHelpers.test.ts",
    "ocrBattingMerge.test.ts",
    "recruitingUtils.test.ts",
    "phaseHelpers.test.ts",
    "storyline-health.test.ts",
    "classEnvelopeStoryPlan.test.ts",
  ],
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: "list",
});
