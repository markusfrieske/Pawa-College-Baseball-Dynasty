/**
 * cleanup-test-leagues.ts
 *
 * On-demand cleanup of stale E2E-test and abandoned guest leagues, plus every
 * row that depends on them (teams, players, recruits, games, stats, etc).
 *
 * This is a TARGETED delete (never TRUNCATE) — real user leagues are left
 * untouched. Safe to re-run at any time; it's a no-op if nothing is stale.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-leagues.ts              # deletes stale leagues
 *   npx tsx scripts/cleanup-test-leagues.ts --dry-run     # reports only
 *   npx tsx scripts/cleanup-test-leagues.ts --test-hours=1 --guest-days=3
 */
import { pool } from "../server/db";
import { cleanupStaleLeagues } from "../server/lib/cleanupStaleLeagues";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const testHoursArg = args.find((a) => a.startsWith("--test-hours="));
  const guestDaysArg = args.find((a) => a.startsWith("--guest-days="));
  const testDataMaxAgeHours = testHoursArg ? Number(testHoursArg.split("=")[1]) : undefined;
  const guestMaxAgeDays = guestDaysArg ? Number(guestDaysArg.split("=")[1]) : undefined;

  console.log(`Scanning for stale test/guest leagues${dryRun ? " (dry run)" : ""}...`);

  const result = await cleanupStaleLeagues(pool, {
    dryRun,
    testDataMaxAgeHours,
    guestMaxAgeDays,
  });

  if (result.leagueCount === 0) {
    console.log("✓ No stale leagues found. Nothing to clean up.");
  } else if (dryRun) {
    console.log(`Would delete ${result.leagueCount} league(s) and ${result.teamCount} team(s):`);
    for (const id of result.leagueIds) console.log(`  - ${id}`);
  } else {
    console.log(`✓ Deleted ${result.leagueCount} stale league(s) and ${result.teamCount} team(s), plus all dependent rows.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("cleanup-test-leagues failed:", err);
  process.exit(1);
});
