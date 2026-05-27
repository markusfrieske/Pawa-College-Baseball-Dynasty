/**
 * repair-hitter-corruption.ts
 *
 * Fixes lines corrupted by the off-by-one bug in calibrate-hitter-attrs.ts.
 *
 * Corrupted format (the leading comma + wrong labels):
 *   , power: A, speed: B, arm: C, fielding: D, errorResistance: EundefinedF
 *
 * A-F ARE the correct new values (newHFA, newPW, newSP, newAR, newFI, newER)
 * printed under wrong labels due to group index being off by 1.
 *
 * Fixed format:
 *   hitForAvg: A, power: B, speed: C, arm: D, fielding: E, errorResistance: F
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

const ROSTER_FILES = [
  "server/secBatch1.ts",
  "server/secBatch2.ts",
  "server/secBatch3.ts",
  "server/accRostersBatch1.ts",
  "server/accRostersBatch2.ts",
  "server/accRostersBatch3.ts",
  "server/bigTenBatch1.ts",
  "server/bigTenBatch2.ts",
  "server/bigTenBatch3.ts",
  "server/big12Rosters.ts",
];

// Matches the corrupted attr sequence:
//   , power: A, speed: B, arm: C, fielding: D, errorResistance: EundefinedF
// The leading comma is consumed so we can prepend hitForAvg: A in the replacement.
const CORRUPT_RE = /,\s*power:\s*(\d+),\s*speed:\s*(\d+),\s*arm:\s*(\d+),\s*fielding:\s*(\d+),\s*errorResistance:\s*(\d+)undefined(\d+)/g;

let totalFixed = 0;

for (const relPath of ROSTER_FILES) {
  const filePath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) continue;

  const original = fs.readFileSync(filePath, "utf8");
  const matches = [...original.matchAll(CORRUPT_RE)];
  if (matches.length === 0) continue;

  const fixed = original.replace(CORRUPT_RE, (_match, A, B, C, D, E, F) => {
    // A = newHFA, B = newPW, C = newSP, D = newAR, E = newFI, F = newER
    return `hitForAvg: ${A}, power: ${B}, speed: ${C}, arm: ${D}, fielding: ${E}, errorResistance: ${F}`;
  });

  console.log(`  ${DRY_RUN ? "[DRY]" : "✅"} Fixed ${matches.length} corruption(s) in: ${relPath}`);
  if (!DRY_RUN) {
    fs.writeFileSync(filePath, fixed, "utf8");
  }
  totalFixed += matches.length;
}

console.log(`\nTotal corruptions repaired: ${totalFixed}`);
if (DRY_RUN) console.log("[DRY RUN] No files written.");
