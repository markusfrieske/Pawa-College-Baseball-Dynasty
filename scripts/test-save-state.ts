/**
 * test-save-state.ts — Smoke test for the league save state / restore system.
 *
 * Scenario:
 *   1. Create minimal test data: user → league → conference → 2 teams → game → standings → player_season_stats
 *   2. Capture a save state (manual trigger)
 *   3. Mutate the league week/phase and child rows (game score, standings wins, stat HR count)
 *   4. Verify mutations are visible in the DB
 *   5. Restore the save state
 *   6. Assert all rows returned to pre-mutation values
 *   7. Assert save state rows SURVIVED the restore (verifies Bug-1 fix)
 *   8. Cleanup: delete all test rows
 *
 * Run: npx tsx scripts/test-save-state.ts
 */

import { pool } from "../server/db";
import {
  captureLeagueSaveState,
  listLeagueSaveStates,
  restoreLeagueSaveState,
} from "../server/lib/leagueSaveState";

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${label} (${JSON.stringify(actual)})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function q(sql: string, params: unknown[] = []): Promise<any[]> {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function q1(sql: string, params: unknown[] = []): Promise<any> {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}

// ── setup ────────────────────────────────────────────────────────────────────

async function createTestFixture(): Promise<{
  userId: string;
  leagueId: string;
  conferenceId: string;
  teamAId: string;
  teamBId: string;
  gameId: string;
  standingsId: string;
  statsId: string;
}> {
  // User (commissioner)
  const userId = `test-ss-${Date.now()}`;
  await q(
    `INSERT INTO users (id, email, password) VALUES ($1, $2, 'test')`,
    [userId, `save-state-test-${userId}@example.invalid`]
  );

  // League — week 1, preseason
  const leagueRow = await q1(
    `INSERT INTO leagues (name, commissioner_id, is_test_data, current_week, current_phase, current_season)
     VALUES ('SaveStateTestLeague', $1, true, 1, 'preseason', 1)
     RETURNING id`,
    [userId]
  );
  const leagueId = leagueRow.id as string;

  // Conference
  const confRow = await q1(
    `INSERT INTO conferences (league_id, name) VALUES ($1, 'Test Conference') RETURNING id`,
    [leagueId]
  );
  const conferenceId = confRow.id as string;

  // Two teams
  const teamA = await q1(
    `INSERT INTO teams (league_id, conference_id, name, mascot, abbreviation, city, state)
     VALUES ($1, $2, 'Alpha University', 'Eagles', 'ALP', 'Alphaville', 'TX')
     RETURNING id`,
    [leagueId, conferenceId]
  );
  const teamB = await q1(
    `INSERT INTO teams (league_id, conference_id, name, mascot, abbreviation, city, state)
     VALUES ($1, $2, 'Beta College', 'Bears', 'BET', 'Betaburg', 'TX')
     RETURNING id`,
    [leagueId, conferenceId]
  );
  const teamAId = teamA.id as string;
  const teamBId = teamB.id as string;

  // Game (unplayed: no score, not complete)
  const gameRow = await q1(
    `INSERT INTO games (league_id, season, week, home_team_id, away_team_id, is_complete, phase)
     VALUES ($1, 1, 1, $2, $3, false, 'regular')
     RETURNING id`,
    [leagueId, teamAId, teamBId]
  );
  const gameId = gameRow.id as string;

  // Standings for teamA — 0-0 to start
  const standingsRow = await q1(
    `INSERT INTO standings (league_id, team_id, season, wins, losses)
     VALUES ($1, $2, 1, 0, 0)
     RETURNING id`,
    [leagueId, teamAId]
  );
  const standingsId = standingsRow.id as string;

  // Player season stats for a fictional player — 0 HR to start
  // (player_id has no FK constraint in player_season_stats, so synthetic IDs are fine)
  const statsRow = await q1(
    `INSERT INTO player_season_stats (league_id, player_id, player_name, team_id, season, position, games, ab, hr)
     VALUES ($1, 'fake-player-1', 'Joe Test', $2, 1, 'OF', 0, 0, 0)
     RETURNING id`,
    [leagueId, teamAId]
  );
  const statsId = statsRow.id as string;

  return { userId, leagueId, conferenceId, teamAId, teamBId, gameId, standingsId, statsId };
}

// ── cleanup ───────────────────────────────────────────────────────────────────

async function cleanup(leagueId: string, userId: string): Promise<void> {
  // save states first (FK to leagues)
  await q(`DELETE FROM league_save_states WHERE league_id = $1`, [leagueId]);
  // child tables in FK-safe order before league deletion
  await q(`DELETE FROM player_season_stats WHERE league_id = $1`, [leagueId]);
  await q(`DELETE FROM standings WHERE league_id = $1`, [leagueId]);
  await q(`DELETE FROM games WHERE league_id = $1`, [leagueId]);
  await q(`DELETE FROM teams WHERE league_id = $1`, [leagueId]);
  await q(`DELETE FROM conferences WHERE league_id = $1`, [leagueId]);
  await q(`DELETE FROM leagues WHERE id = $1`, [leagueId]);
  await q(`DELETE FROM users WHERE id = $1`, [userId]);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Save State Smoke Test ===\n");

  let leagueId = "";
  let userId = "";

  try {
    // 1. Create test fixture
    console.log("1. Creating test fixture...");
    const fix = await createTestFixture();
    leagueId = fix.leagueId;
    userId = fix.userId;
    console.log(`   leagueId=${leagueId}`);
    console.log(`   gameId=${fix.gameId}  standingsId=${fix.standingsId}  statsId=${fix.statsId}\n`);

    // 2. Capture save state
    console.log("2. Capturing save state...");
    const saveStateId = await captureLeagueSaveState(
      leagueId,
      "manual",
      "Pre-mutation checkpoint",
      userId
    );
    console.log(`   saveStateId=${saveStateId}\n`);

    // 3. Mutate league + child rows
    console.log("3. Mutating league rows...");
    await q(`UPDATE leagues SET current_week = 5, current_phase = 'regular_season' WHERE id = $1`, [leagueId]);
    await q(`UPDATE games SET home_score = 7, away_score = 3, is_complete = true WHERE id = $1`, [fix.gameId]);
    await q(`UPDATE standings SET wins = 10, losses = 2 WHERE id = $1`, [fix.standingsId]);
    await q(`UPDATE player_season_stats SET hr = 50, games = 40 WHERE id = $1`, [fix.statsId]);
    console.log(`   Applied mutations\n`);

    // 4. Verify mutations are visible
    console.log("4. Verifying mutations...");
    const mutLeague = await q1(`SELECT current_week, current_phase FROM leagues WHERE id = $1`, [leagueId]);
    assertEqual(mutLeague.current_week, 5, "league.current_week mutated to 5");
    assertEqual(mutLeague.current_phase, "regular_season", "league.current_phase mutated to regular_season");
    const mutGame = await q1(`SELECT home_score, is_complete FROM games WHERE id = $1`, [fix.gameId]);
    assertEqual(mutGame.home_score, 7, "game.home_score mutated to 7");
    assertEqual(mutGame.is_complete, true, "game.is_complete mutated to true");
    const mutStandings = await q1(`SELECT wins FROM standings WHERE id = $1`, [fix.standingsId]);
    assertEqual(mutStandings.wins, 10, "standings.wins mutated to 10");
    const mutStats = await q1(`SELECT hr, games FROM player_season_stats WHERE id = $1`, [fix.statsId]);
    assertEqual(mutStats.hr, 50, "player_season_stats.hr mutated to 50");
    console.log("");

    // 5. Restore the save state
    console.log("5. Restoring save state...");
    await restoreLeagueSaveState(saveStateId, leagueId, userId);
    console.log(`   Restore complete\n`);

    // 6. Verify rows returned to pre-mutation values
    console.log("6. Verifying restore...");
    const resLeague = await q1(`SELECT current_week, current_phase FROM leagues WHERE id = $1`, [leagueId]);
    assert(resLeague !== null, "league row exists after restore");
    assertEqual(resLeague?.current_week, 1, "league.current_week restored to 1");
    assertEqual(resLeague?.current_phase, "preseason", "league.current_phase restored to preseason");

    const resGame = await q1(`SELECT home_score, is_complete FROM games WHERE id = $1`, [fix.gameId]);
    assert(resGame !== null, "game row exists after restore");
    assertEqual(resGame?.home_score, null, "game.home_score restored to null");
    assertEqual(resGame?.is_complete, false, "game.is_complete restored to false");

    const resStandings = await q1(`SELECT wins FROM standings WHERE id = $1`, [fix.standingsId]);
    assert(resStandings !== null, "standings row exists after restore");
    assertEqual(resStandings?.wins, 0, "standings.wins restored to 0");

    const resStats = await q1(`SELECT hr, games FROM player_season_stats WHERE id = $1`, [fix.statsId]);
    assert(resStats !== null, "player_season_stats row exists after restore");
    assertEqual(resStats?.hr, 0, "player_season_stats.hr restored to 0");
    assertEqual(resStats?.games, 0, "player_season_stats.games restored to 0");
    console.log("");

    // 7. Verify save state rows survived the restore
    //    (Bug 1 fix: league_save_states rows must not be destroyed during restore)
    console.log("7. Verifying save states survived restore...");
    const saveStateRows = await listLeagueSaveStates(leagueId);
    // restoreLeagueSaveState creates a pre_restore auto-backup before restoring,
    // so we should have at least 2 rows: the original manual save + the auto-backup.
    assert(saveStateRows.length >= 2, `at least 2 save state rows survived (found ${saveStateRows.length})`);

    // The original manual save state still exists
    const original = saveStateRows.find((s) => s.id === saveStateId);
    assert(original !== undefined, "original save state row still present by id");
    // It was marked as restored
    assert(original?.restoredAt !== null, "original save state has restored_at timestamp");

    // The pre_restore auto-backup was created
    const autoBackup = saveStateRows.find((s) => s.trigger === "pre_restore");
    assert(autoBackup !== undefined, "pre_restore auto-backup row exists");
    console.log("");

    // 8. Verify listLeagueSaveStates does not expose snapshot_data blobs
    //    (Bug 2 fix: only row counts returned, not raw JSONB)
    console.log("8. Verifying list response shape (no snapshot blob)...");
    const firstState = saveStateRows[0];
    assert(!("snapshot_data" in firstState), "snapshot_data not present in list response");
    assert(typeof firstState.rowCounts === "object", "rowCounts object present in list response");
    // "league" is a single object in the snapshot (not an array), so it's excluded from rowCounts.
    // Check array-typed tables instead.
    const gamesCount = firstState.rowCounts["games"];
    assertEqual(gamesCount, 1, "rowCounts.games = 1");
    const standingsCount = firstState.rowCounts["standings"];
    assertEqual(standingsCount, 1, "rowCounts.standings = 1");
    console.log("");

  } finally {
    // Always cleanup test data
    if (leagueId) {
      console.log("9. Cleaning up test data...");
      try {
        await cleanup(leagueId, userId);
        console.log("   Cleaned up\n");
      } catch (cleanupErr) {
        console.error("   Cleanup error (non-fatal):", cleanupErr);
      }
    }
    await pool.end();
  }

  // Summary
  const total = passed + failed;
  console.log("=".repeat(40));
  if (failed === 0) {
    console.log(`✓ All ${total} assertions passed.`);
  } else {
    console.error(`✗ ${failed} / ${total} assertions FAILED.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
