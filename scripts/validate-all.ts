/**
 * validate-all — runs every roster validator in sequence and fails fast on
 * the first error.  Exits 0 only when all checks pass.
 *
 * Validators are auto-discovered: any scripts/validate-*.ts file (excluding
 * this file itself) is picked up automatically when it is created.
 * Files run in alphabetical order.
 *
 * Adding a new validator: just create scripts/validate-<name>.ts — it will
 * be included automatically on the next run.
 */

import { spawnSync } from "child_process";
import { readdirSync } from "fs";
import { resolve, join } from "path";

const scriptDir = join(process.cwd(), "scripts");
const tsxCli = resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");

// Auto-discover every validate-*.ts except this file
const VALIDATORS = readdirSync(scriptDir)
  .filter(f => /^validate-.+\.ts$/.test(f) && f !== "validate-all.ts")
  .sort()
  .map(f => ({
    label: f.replace(/\.ts$/, ""),
    script: `scripts/${f}`,
  }));

const divider = "─".repeat(60);
let allPassed = true;

console.log(`\nRunning ${VALIDATORS.length} roster validators...\n`);

for (const { label, script } of VALIDATORS) {
  console.log(`${divider}`);
  console.log(`▶  ${label}`);
  console.log(`${divider}`);

  const result = spawnSync(
    process.execPath,
    [tsxCli, resolve(script)],
    { stdio: "inherit", encoding: "utf8" }
  );

  if (result.status !== 0) {
    console.error(`\n✗  ${label} FAILED (exit ${result.status ?? "signal"})\n`);
    allPassed = false;
    break;
  }

  console.log(`\n✓  ${label} passed\n`);
}

console.log(divider);

if (allPassed) {
  console.log("✓  All validators passed.");
  process.exit(0);
} else {
  console.error("✗  Validation failed — fix the errors above before merging.");
  process.exit(1);
}
