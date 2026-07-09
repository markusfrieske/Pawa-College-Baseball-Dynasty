/**
 * scripts/verify-storyline-health.ts
 *
 * Offline batch audit of storyline health for all active leagues.
 * Connects directly to the database (via DATABASE_URL) and calls checkStorylineHealth
 * for each league that has recruits in the current season.
 *
 * Usage:
 *   npx tsx scripts/verify-storyline-health.ts
 *   npx tsx scripts/verify-storyline-health.ts --league <leagueId>
 *   npx tsx scripts/verify-storyline-health.ts --fix-stale    (resolve stale events via fallback)
 *
 * Exit codes:
 *   0 — all leagues healthy (or no issues of severity "error")
 *   1 — one or more leagues have errors
 */

import { db } from "../server/db";
import { checkStorylineHealth } from "../server/lib/storylineHealth";
import { storage } from "../server/storage";
import { leagues } from "@shared/schema";

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const targetLeagueId = (() => {
  const idx = args.indexOf("--league");
  return idx !== -1 ? args[idx + 1] : null;
})();
const fixStale = args.includes("--fix-stale");

// ── Helpers ────────────────────────────────────────────────────────────────────
function severity(s: "error" | "warning" | "info"): string {
  if (s === "error")   return "  [ERROR]  ";
  if (s === "warning") return "  [WARN]   ";
  return "  [INFO]   ";
}

function printReport(report: Awaited<ReturnType<typeof checkStorylineHealth>>): void {
  const statusLine = report.healthy ? "HEALTHY" : "UNHEALTHY";
  console.log(`\nLeague ${report.leagueId} — Season ${report.season} — Week ${report.currentWeek} — ${statusLine}`);
  console.log(`  Summary: ${report.summary.storylineCount} storylines | ${report.summary.recruitCount} recruits | ${report.summary.unresolvedEvents} unresolved events | ${report.summary.staleEvents} stale`);

  if (report.issues.length === 0) {
    console.log("  No issues detected.");
  } else {
    for (const issue of report.issues) {
      console.log(`${severity(issue.severity)}${issue.code}: ${issue.message}`);
      if (issue.detail) console.log(`             ${issue.detail}`);
      if (issue.repairAction) console.log(`             Repair: ${issue.repairAction}`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("=== Storyline Health Audit ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  if (fixStale) console.log("Mode: --fix-stale enabled (stale events will be resolved via deterministic fallback)");

  let allLeagues: typeof leagues.$inferSelect[];
  try {
    allLeagues = await db.select().from(leagues);
  } catch (err) {
    console.error("Failed to fetch leagues:", err);
    process.exit(1);
  }

  if (targetLeagueId) {
    allLeagues = allLeagues.filter(l => l.id === targetLeagueId);
    if (allLeagues.length === 0) {
      console.error(`No league found with id: ${targetLeagueId}`);
      process.exit(1);
    }
  }

  if (allLeagues.length === 0) {
    console.log("No leagues found.");
    process.exit(0);
  }

  let anyError = false;
  let totalIssues = 0;
  let leaguesChecked = 0;

  for (const league of allLeagues) {
    // Skip leagues with no recruits (e.g., newly created, no class generated)
    let recruits: unknown[];
    try {
      recruits = await storage.getRecruitsByLeague(league.id);
    } catch {
      recruits = [];
    }
    if (recruits.length === 0) continue;

    leaguesChecked++;

    let report: Awaited<ReturnType<typeof checkStorylineHealth>>;
    try {
      report = await checkStorylineHealth(league.id, league.currentSeason, league.currentWeek);
    } catch (err) {
      console.error(`\nFailed to check health for league ${league.id}:`, err);
      anyError = true;
      continue;
    }

    printReport(report);
    totalIssues += report.issues.length;
    if (!report.healthy) anyError = true;

    // --fix-stale: resolve stale events using the deterministic fallback
    if (fixStale) {
      const staleIssue = report.issues.find(i => i.code === "STALE_UNRESOLVED_EVENTS");
      if (staleIssue) {
        try {
          const { catchUpAndResolveStorylineArcs } = await import("../server/storyline-routes");
          const resolved = await catchUpAndResolveStorylineArcs(league.id, league.currentSeason, league.currentWeek);
          console.log(`  [FIX] Resolved ${resolved} stale event(s) via deterministic fallback for league ${league.id}`);
        } catch (err) {
          console.error(`  [FIX] Failed to resolve stale events for league ${league.id}:`, err);
        }
      }
    }
  }

  console.log(`\n=== Audit Complete ===`);
  console.log(`Leagues checked: ${leaguesChecked} / ${allLeagues.length}`);
  console.log(`Total issues:    ${totalIssues}`);
  console.log(`Overall status:  ${anyError ? "UNHEALTHY — one or more errors detected" : "HEALTHY"}`);

  process.exit(anyError ? 1 : 0);
}

main().catch(err => {
  console.error("Unhandled error in verify-storyline-health:", err);
  process.exit(1);
});
