/**
 * calibrate-team-ovr-by-rpi.ts
 *
 * Adjusts every team's player OVRs in the database so the roster average
 * matches the 2026 NCAA RPI rank order.
 *
 * Usage:
 *   npx tsx scripts/calibrate-team-ovr-by-rpi.ts           # live run
 *   npx tsx scripts/calibrate-team-ovr-by-rpi.ts --dry-run # preview only
 */

import { calibrateRpiOvr, getTargetOvr } from "../server/calibrateRpiOvr";

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
  console.log("[calibrate-rpi] DRY RUN — no database writes will be made.\n");
}

async function main() {
  console.log("[calibrate-rpi] Starting RPI OVR calibration…");
  console.time("[calibrate-rpi] total");

  const summary = await calibrateRpiOvr(DRY_RUN);

  console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║                 RPI OVR CALIBRATION SUMMARY                             ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");
  console.log(`  Leagues processed : ${summary.leaguesProcessed}`);
  console.log(`  Teams processed   : ${summary.teamsProcessed}`);
  console.log(`  Teams skipped     : ${summary.teamsSkipped}`);
  console.log(`  Players updated   : ${DRY_RUN ? "(dry run)" : summary.playersUpdated}`);
  console.log();

  if (summary.results.length === 0) {
    console.log("  (no results — is the database populated?)");
    process.exit(0);
  }

  // Sort results by rpiRank for display
  const sorted = [...summary.results].sort((a, b) => a.rpiRank - b.rpiRank);

  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const lpad = (s: string | number, n: number) => String(s).padStart(n);

  console.log(
    pad("Team", 28) +
    lpad("RPI", 5) +
    lpad("Target", 8) +
    lpad("Old avg", 9) +
    lpad("New avg", 9) +
    lpad("Delta", 7) +
    lpad("Adj", 5),
  );
  console.log("─".repeat(71));

  for (const r of sorted) {
    const delta = r.newAvgOvr - r.oldAvgOvr;
    const deltaStr = (delta >= 0 ? "+" : "") + delta;
    console.log(
      pad(r.teamName, 28) +
      lpad(r.rpiRank, 5) +
      lpad(r.targetAvgOvr, 8) +
      lpad(r.oldAvgOvr, 9) +
      lpad(r.newAvgOvr, 9) +
      lpad(deltaStr, 7) +
      lpad(r.playersAdjusted, 5),
    );
  }

  console.log("─".repeat(71));
  console.log();
  console.timeEnd("[calibrate-rpi] total");

  if (DRY_RUN) {
    console.log("\n[calibrate-rpi] DRY RUN complete — re-run without --dry-run to apply.");
  } else {
    console.log("[calibrate-rpi] Calibration applied to database successfully.");
  }
}

main().catch((err) => {
  console.error("[calibrate-rpi] Fatal error:", err);
  process.exit(1);
});
