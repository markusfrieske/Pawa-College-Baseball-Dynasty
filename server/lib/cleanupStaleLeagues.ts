/**
 * cleanupStaleLeagues.ts
 *
 * Reusable, targeted deletion of stale/abandoned leagues (test-runner leagues
 * and inactive guest-created leagues) plus every row that references them.
 *
 * IMPORTANT: this does NOT use TRUNCATE CASCADE. Real user leagues coexist in
 * this database at all times, so deletes are always scoped to an explicit set
 * of league ids, deleted in FK-safe (children-before-parents) order.
 *
 * Used by:
 *   - scripts/cleanup-test-leagues.ts (on-demand / cron-style manual run)
 *   - server/index.ts startup job (automatic daily prune, date-guarded)
 */
import type { Pool } from "pg";

export interface CleanupOptions {
  /** Delete isTestData leagues older than this many hours. Default 6. */
  testDataMaxAgeHours?: number;
  /** Delete guest-owned leagues older than this many days. Default 7. */
  guestMaxAgeDays?: number;
  /** If true, only report what would be deleted without deleting anything. */
  dryRun?: boolean;
}

export interface CleanupResult {
  leagueIds: string[];
  leagueCount: number;
  teamCount: number;
  dryRun: boolean;
}

/**
 * Finds and deletes stale test/guest leagues and all dependent rows.
 * Safe to call repeatedly (idempotent — no-op if nothing matches).
 */
export async function cleanupStaleLeagues(
  pool: Pool,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const testDataMaxAgeHours = options.testDataMaxAgeHours ?? 6;
  const guestMaxAgeDays = options.guestMaxAgeDays ?? 7;
  const dryRun = options.dryRun ?? false;

  const client = await pool.connect();
  try {
    // 1. Find target league ids: explicitly-flagged test data OR guest-owned
    //    leagues that have gone stale.
    const { rows: targetRows } = await client.query<{ id: string }>(
      `SELECT id FROM leagues
       WHERE (is_test_data = true AND created_at < now() - $1::interval)
          OR (commissioner_id IN (
                SELECT id FROM users WHERE email LIKE 'guest-%@guest.local'
              ) AND created_at < now() - $2::interval)`,
      [`${testDataMaxAgeHours} hours`, `${guestMaxAgeDays} days`]
    );
    const leagueIds = targetRows.map((r) => r.id);

    if (leagueIds.length === 0) {
      return { leagueIds: [], leagueCount: 0, teamCount: 0, dryRun };
    }

    const { rows: teamRows } = await client.query<{ id: string }>(
      `SELECT id FROM teams WHERE league_id = ANY($1::varchar[])`,
      [leagueIds]
    );
    const teamIds = teamRows.map((r) => r.id);

    if (dryRun) {
      return { leagueIds, leagueCount: leagueIds.length, teamCount: teamIds.length, dryRun: true };
    }

    await client.query("BEGIN");
    try {
      // 2. Leaf tables scoped only by team_id (no league_id column of their own).
      //    player_promises must come before players (player_promises.player_id → players.id).
      if (teamIds.length > 0) {
        await client.query(`DELETE FROM transfer_portal_interests WHERE team_id = ANY($1::varchar[])`, [teamIds]);
        await client.query(`DELETE FROM recruiting_interests WHERE team_id = ANY($1::varchar[])`, [teamIds]);
        await client.query(`DELETE FROM recruit_top_schools WHERE team_id = ANY($1::varchar[])`, [teamIds]);
        await client.query(`DELETE FROM storyline_votes WHERE team_id = ANY($1::varchar[])`, [teamIds]);
        // player_promises.player_id → players.id: must be before players
        await client.query(`DELETE FROM player_promises WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
        await client.query(`DELETE FROM players WHERE team_id = ANY($1::varchar[])`, [teamIds]);
      }

      // 3. Tables that reference other league-scoped tables (must go before
      //    their referenced table is deleted).
      //    game_report_corrections refs game_reports.id AND games.id — must precede both.
      await client.query(`DELETE FROM game_report_corrections WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      //    game_report_images refs games.id — must precede games.
      await client.query(`DELETE FROM game_report_images WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM game_reports WHERE league_id = ANY($1::varchar[])`, [leagueIds]); // -> games
      // storyline_events.storyline_recruit_id FK means events must be deleted
      // before storyline_recruits (storyline_votes already deleted above by team_id).
      await client.query(`DELETE FROM storyline_events WHERE league_id = ANY($1::varchar[])`, [leagueIds]); // -> storyline_recruits
      await client.query(`DELETE FROM storyline_recruits WHERE league_id = ANY($1::varchar[])`, [leagueIds]); // -> recruits
      await client.query(`DELETE FROM coach_season_history WHERE league_id = ANY($1::varchar[])`, [leagueIds]); // -> coaches
      await client.query(`DELETE FROM recruiting_actions_log WHERE league_id = ANY($1::varchar[])`, [leagueIds]); // -> recruits, teams

      // 4. Remaining tables directly scoped by league_id, referencing teams/games.
      await client.query(`DELETE FROM nil_season_earnings WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM recruiting_class_snapshots WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM player_history WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM player_season_stats WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM league_invites WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM league_events WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM standings WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      // game_recaps.game_id FK must be deleted before games.
      await client.query(`DELETE FROM game_recaps WHERE game_id IN (SELECT id FROM games WHERE league_id = ANY($1::varchar[]))`, [leagueIds]);
      await client.query(`DELETE FROM games WHERE league_id = ANY($1::varchar[])`, [leagueIds]); // after game_reports, game_recaps, game_report_corrections, game_report_images
      await client.query(`DELETE FROM walkon_bids WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM walkon_pool WHERE league_id = ANY($1::varchar[])`, [leagueIds]); // signed_team_id -> teams
      await client.query(`DELETE FROM scouts WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      // coach_messages refs leagues + teams; coach_rivalries refs coaches + leagues.
      // Both must precede coaches (step 6) and leagues (step 7).
      await client.query(`DELETE FROM coach_messages WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM coach_rivalries WHERE league_id = ANY($1::varchar[])`, [leagueIds]);

      // 5. Recruits (after everything referencing recruit_id is gone).
      //    storyline_events was already deleted in step 3 (before storyline_recruits).
      await client.query(`DELETE FROM recruits WHERE league_id = ANY($1::varchar[])`, [leagueIds]); // signed_team_id -> teams
      await client.query(`DELETE FROM dynasty_news WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM audit_logs WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM advance_digests WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      // These tables reference leagues only (via league_id) — must precede leagues deletion.
      await client.query(`DELETE FROM league_news_posts WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM league_save_states WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM ticker_reads WHERE league_id = ANY($1::varchar[])`, [leagueIds]);

      // 6. Coaches (after coach_season_history/coach_rivalries/coach_messages are gone),
      //    then teams (after every table referencing team_id is gone), then conferences.
      await client.query(`DELETE FROM coaches WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM teams WHERE league_id = ANY($1::varchar[])`, [leagueIds]);
      await client.query(`DELETE FROM conferences WHERE league_id = ANY($1::varchar[])`, [leagueIds]);

      // 7. Finally, the leagues themselves.
      await client.query(`DELETE FROM leagues WHERE id = ANY($1::varchar[])`, [leagueIds]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    return { leagueIds, leagueCount: leagueIds.length, teamCount: teamIds.length, dryRun: false };
  } finally {
    client.release();
  }
}
