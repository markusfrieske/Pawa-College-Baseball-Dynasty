/**
 * validate-all — runs every roster validator in sequence and fails fast on
 * the first error.  Exits 0 only when all checks pass.
 *
 * Validators run in this order:
 *   1. validate-abilities      — ability names, position fit, required fields
 *   2. validate-pitch-mix      — pitch-mix field ranges
 *   3. validate-roster-structure — roster size, FR count, position-group counts
 *   4. validate-duplicates     — same-team duplicate player names
 *   5. validate-attributes     — attribute/position consistency (pitcher vs fielder attrs)
 *
 * Adding a new validator: append its script path to the VALIDATORS array below.
 */

import { spawnSync } from "child_process";
import { resolve } from "path";

const VALIDATORS = [
  { label: "validate-abilities",        script: "scripts/validate-abilities.ts" },
  { label: "validate-pitch-mix",        script: "scripts/validate-pitch-mix.ts" },
  { label: "validate-roster-structure", script: "scripts/validate-roster-structure.ts" },
  { label: "validate-duplicates",       script: "scripts/validate-duplicates.ts" },
  { label: "validate-attributes",       script: "scripts/validate-attributes.ts" },
];

const divider = "─".repeat(60);
let allPassed = true;

console.log(`\nRunning ${VALIDATORS.length} roster validators...\n`);

for (const { label, script } of VALIDATORS) {
  console.log(`${divider}`);
  console.log(`▶  ${label}`);
  console.log(`${divider}`);

  const result = spawnSync(
    "npx",
    ["tsx", resolve(script)],
    { stdio: "inherit", encoding: "utf8" }
  );

  if (result.status !== 0) {
    console.error(`\n✗  ${label} FAILED (exit ${result.status ?? "signal"})\n`);
    allPassed = false;
    break; // fail fast
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
