/**
 * watch-validators — watches all roster and ability source files and re-runs
 * every validator automatically when any of them change.
 *
 * Start with:  npx tsx scripts/watch-validators.ts
 * (or via the "watch-validators" Replit workflow)
 */

import { watchFile } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";

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
  "server/aacRosters.ts",
  "server/wccRosters.ts",
  "server/mwcRosters.ts",
  "server/pac12Rosters.ts",
  "server/sunBeltRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
  "server/realRosters.ts",
  "shared/abilities.ts",
];

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function runValidators(changedFile: string) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (running) return;
    running = true;
    console.log(`\n[watch-validators] Change detected: ${changedFile}`);
    console.log("[watch-validators] Running all validators...\n");

    const result = spawnSync("npx", ["tsx", "scripts/validate-all.ts"], {
      stdio: "inherit",
      encoding: "utf8",
    });

    if (result.status !== 0) {
      console.error("\n[watch-validators] ✗  Validation failed — fix errors above.\n");
    } else {
      console.log("\n[watch-validators] ✓  All validators passed.\n");
    }
    running = false;
  }, 1200);
}

for (const file of ROSTER_FILES) {
  const absPath = resolve(file);
  watchFile(absPath, { interval: 2000 }, (curr, prev) => {
    if (curr.mtime.getTime() !== prev.mtime.getTime()) {
      runValidators(file);
    }
  });
}

console.log(`[watch-validators] Watching ${ROSTER_FILES.length} roster/ability files.`);
console.log("[watch-validators] Edit any roster file to trigger automatic validation.\n");

// Keep the process alive
setInterval(() => {}, 30000);
