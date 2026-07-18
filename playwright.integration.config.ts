import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Database/API tests that historically lived under tests/unit. They must run
 * with the application server and a migrated test database, so keep them out
 * of the fast, database-free unit stage while still enforcing them at release.
 */
export default defineConfig({
  ...baseConfig,
  testDir: "./tests/unit",
  testMatch: [
    "gameReportAccess.test.ts",
    "storylineAccess.test.ts",
    "recruit-signing-integrity.test.ts",
    "recruitingClassCreator.test.ts",
  ],
});
