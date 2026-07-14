/**
 * Integration test: schedule regenerate/publish invariants.
 *
 * Verifies three properties using a real full_season league (if present):
 *   (a) previewFullSeasonSchedule is read-only — no games/audit rows added
 *   (b) publishFullSeasonSchedule only deletes isComplete=false regular games
 *       (completed games survive)
 *   (c) scheduleVersion increments and an audit_log row is written on every publish
 *
 * If no full_season league exists the script exits 0 with a SKIP notice.
 * Run with: npx tsx scripts/test-schedule-publish.ts
 */

import { pool } from "../server/db";
import { previewFullSeasonSchedule, publishFullSeasonSchedule } from "../server/services/schedule/createScheduleForSeason";

// ─── helpers ─────────────────────────────────────────────────────────────────

let failed = false;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failed = true;
  } else {
    console.log(`  PASS: ${msg}`);
  }
}

async function countRows(table: string, where: string, params: unknown[]): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*) AS cnt FROM ${table} WHERE ${where}`, params);
  return Number(rows[0].cnt);
}

// ─── find a test league ───────────────────────────────────────────────────────

async function findFullSeasonLeague(): Promise<{ id: string; currentSeason: number; scheduleVersion: number } | null> {
  const { rows } = await pool.query(
    `SELECT id, COALESCE(current_season, 1) AS current_season,
            COALESCE(schedule_version, 0) AS schedule_version
     FROM leagues
     WHERE dynasty_preset = 'full_season'
     ORDER BY created_at DESC
     LIMIT 1`
  );
  if (!rows.length) return null;
  return {
    id: rows[0].id as string,
    currentSeason: Number(rows[0].current_season),
    scheduleVersion: Number(rows[0].schedule_version),
  };
}

// ─── Test A: preview is read-only ────────────────────────────────────────────

async function testPreviewIsReadOnly(leagueId: string, season: number) {
  console.log("\n[A] previewFullSeasonSchedule is read-only");

  const gamesBefore  = await countRows("games",      "league_id = $1 AND season = $2 AND phase = 'regular'", [leagueId, season]);
  const auditBefore  = await countRows("audit_logs", "league_id = $1", [leagueId]);

  const preview = await previewFullSeasonSchedule(leagueId, season);

  const gamesAfter   = await countRows("games",      "league_id = $1 AND season = $2 AND phase = 'regular'", [leagueId, season]);
  const auditAfter   = await countRows("audit_logs", "league_id = $1", [leagueId]);

  assert(preview.totalGames > 0,         `preview returned ${preview.totalGames} games`);
  assert(preview.validationErrors.length === 0, `preview has 0 validation errors`);
  assert(gamesAfter  === gamesBefore,    `games table unchanged (${gamesBefore} → ${gamesAfter})`);
  assert(auditAfter  === auditBefore,    `audit_logs unchanged (${auditBefore} → ${auditAfter})`);
}

// ─── Test B + C: publish invariants ──────────────────────────────────────────

async function testPublishInvariants(leagueId: string, season: number, versionBefore: number) {
  console.log("\n[B+C] publishFullSeasonSchedule invariants");

  const completedBefore = await countRows(
    "games",
    "league_id = $1 AND season = $2 AND phase = 'regular' AND is_complete = true",
    [leagueId, season]
  );
  const auditBefore = await countRows(
    "audit_logs",
    "league_id = $1 AND action IN ('schedule_published','schedule_republished')",
    [leagueId]
  );

  console.log(`  League ${leagueId}  season=${season}  scheduleVersion=${versionBefore}  completedGames=${completedBefore}`);

  const gamesWritten = await publishFullSeasonSchedule(leagueId, season);
  assert(gamesWritten > 0, `publish wrote ${gamesWritten} new games`);

  // [B] Completed games must survive.
  const completedAfter = await countRows(
    "games",
    "league_id = $1 AND season = $2 AND phase = 'regular' AND is_complete = true",
    [leagueId, season]
  );
  assert(
    completedAfter === completedBefore,
    `completed games unchanged (${completedBefore} → ${completedAfter})`
  );

  // [C1] scheduleVersion must have incremented by exactly 1.
  const { rows } = await pool.query("SELECT COALESCE(schedule_version,0) AS v FROM leagues WHERE id = $1", [leagueId]);
  const versionAfter = Number(rows[0].v);
  assert(
    versionAfter === versionBefore + 1,
    `scheduleVersion incremented (${versionBefore} → ${versionAfter})`
  );

  // [C2] Audit row must have been written.
  const auditAfter = await countRows(
    "audit_logs",
    "league_id = $1 AND action IN ('schedule_published','schedule_republished')",
    [leagueId]
  );
  assert(
    auditAfter === auditBefore + 1,
    `audit_log row written (${auditBefore} → ${auditAfter})`
  );
}

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
  try {
    const league = await findFullSeasonLeague();
    if (!league) {
      console.log("\nSKIP: no full_season league found in DB.");
      console.log("Create a full_season dynasty and re-run to exercise all invariants.\n");
      process.exit(0);
    }

    await testPreviewIsReadOnly(league.id, league.currentSeason);
    await testPublishInvariants(league.id, league.currentSeason, league.scheduleVersion);

    if (failed) {
      console.error("\nOne or more assertions FAILED.\n");
      process.exit(1);
    }
    console.log("\nAll schedule-publish invariant tests PASSED.\n");
  } catch (err) {
    console.error("Unexpected error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
