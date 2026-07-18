import { test, expect } from "@playwright/test";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolve } from "path";

const execFileAsync = promisify(execFile);
const tsxCli = resolve("node_modules/tsx/dist/cli.mjs");

async function runScript(script: string, args: string[] = []) {
  return execFileAsync(process.execPath, [tsxCli, script, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_URL: process.env.APP_URL ?? "http://localhost:5000",
    },
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

test.describe("14-human reported launch profile", () => {
  test.slow();

  test("creates, claims, starts, and certifies exactly 14 human teams", async () => {
    test.skip(!process.env.DATABASE_URL || !process.env.SESSION_SECRET, "Requires disposable DB and session secret");
    await runScript("scripts/seed-14-coach-league.ts", ["--cleanup"]);
    try {
      const { stdout, stderr } = await runScript("scripts/seed-14-coach-league.ts");
      expect(stderr, `seed stderr:\n${stderr}`).not.toContain("FATAL");
      const leagueId = stdout.match(/League ID\s*:\s*([0-9a-f-]+)/i)?.[1];
      expect(leagueId, `Could not read league ID from:\n${stdout}`).toBeTruthy();

      const invariant = await runScript("scripts/verify-db-invariants.ts", [leagueId!]);
      expect(invariant.stdout).toContain("All invariant checks passed");
      expect(invariant.stderr).not.toContain("FAIL [");
    } finally {
      await runScript("scripts/seed-14-coach-league.ts", ["--cleanup"]);
    }
  });
});
