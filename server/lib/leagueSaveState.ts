import { pool } from "../db";
import { invalidateLeague } from "../cache";

const SNAPSHOT_VERSION = 1;
const MAX_SAVE_STATES_PER_LEAGUE = 10;

export type SaveStateTrigger =
  | "manual"
  | "pre_advance"
  | "pre_force_advance"
  | "pre_restore";

export interface SaveStateMeta {
  id: string;
  leagueId: string;
  season: number;
  week: number;
  phase: string;
  label: string;
  trigger: SaveStateTrigger;
  createdByUserId: string | null;
  restoredAt: string | null;
  restoredByUserId: string | null;
  createdAt: string;
  rowCounts: Record<string, number>;
}

function rowToMeta(row: any): SaveStateMeta {
  // row_counts is computed in SQL via jsonb_each — already a parsed object
  const rc = row.row_counts ?? {};
  const rowCounts: Record<string, number> = {};
  for (const [key, val] of Object.entries(rc)) {
    if (typeof val === "number") rowCounts[key] = val;
  }
  return {
    id: row.id,
    leagueId: row.league_id,
    season: row.season,
    week: row.week,
    phase: row.phase,
    label: row.label,
    trigger: row.trigger as SaveStateTrigger,
    createdByUserId: row.created_by_user_id ?? null,
    restoredAt: row.restored_at ? new Date(row.restored_at).toISOString() : null,
    restoredByUserId: row.restored_by_user_id ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    rowCounts,
  };
}

async function buildSnapshot(client: any, leagueId: string): Promise<Record<string, any>> {
  const q = async (sql: string, params: any[] = []): Promise<any[]> => {
    const r = await client.query(sql, params);
    return r.rows;
  };

  const [
    leagueRows,
    conferences,
    teams,
    coaches,
    scouts,
    recruits,
    games,
    standings,
    auditLogs,
    leagueInvites,
    dynastyNews,
    leagueEvents,
    nilSeasonEarnings,
    advanceDigests,
    recruitingActionsLog,
    walkonPool,
    recruitingClassSnapshots,
    playerHistory,
    playerSeasonStats,
    coachSeasonHistory,
    storylineRecruits,
    playerPromises,
  ] = await Promise.all([
    q(`SELECT * FROM leagues WHERE id = $1`, [leagueId]),
    q(`SELECT * FROM conferences WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM teams WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM coaches WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM scouts WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM recruits WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM games WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM standings WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM audit_logs WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM league_invites WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM dynasty_news WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM league_events WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM nil_season_earnings WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM advance_digests WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM recruiting_actions_log WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM walkon_pool WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM recruiting_class_snapshots WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM player_history WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM player_season_stats WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM coach_season_history WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM storyline_recruits WHERE league_id = $1`, [leagueId]),
    q(`SELECT * FROM player_promises WHERE league_id = $1`, [leagueId]),
  ]);

  const [
    players,
    recruitingInterests,
    recruitTopSchools,
    walkonBids,
    transferPortalInterests,
    gameReports,
    gameReportImages,
    gameReportCorrections,
    storylineEvents,
    storylineVotes,
  ] = await Promise.all([
    q(`SELECT p.* FROM players p JOIN teams t ON p.team_id = t.id WHERE t.league_id = $1`, [leagueId]),
    q(`SELECT ri.* FROM recruiting_interests ri JOIN recruits r ON ri.recruit_id = r.id WHERE r.league_id = $1`, [leagueId]),
    q(`SELECT rts.* FROM recruit_top_schools rts JOIN recruits r ON rts.recruit_id = r.id WHERE r.league_id = $1`, [leagueId]),
    q(`SELECT wb.* FROM walkon_bids wb WHERE wb.league_id = $1`, [leagueId]),
    q(`SELECT tpi.* FROM transfer_portal_interests tpi JOIN teams t ON tpi.team_id = t.id WHERE t.league_id = $1`, [leagueId]),
    q(`SELECT gr.* FROM game_reports gr WHERE gr.league_id = $1`, [leagueId]),
    q(`SELECT gri.* FROM game_report_images gri WHERE gri.league_id = $1`, [leagueId]),
    q(`SELECT grc.* FROM game_report_corrections grc WHERE grc.league_id = $1`, [leagueId]),
    q(`SELECT se.* FROM storyline_events se WHERE se.league_id = $1`, [leagueId]),
    q(`SELECT sv.* FROM storyline_votes sv JOIN storyline_events se ON sv.event_id = se.id WHERE se.league_id = $1`, [leagueId]),
  ]);

  return {
    version: SNAPSHOT_VERSION,
    capturedAt: new Date().toISOString(),
    league: leagueRows[0] ?? null,
    conferences,
    teams,
    coaches,
    scouts,
    players,
    recruits,
    recruitingInterests,
    recruitTopSchools,
    recruitingActionsLog,
    walkonPool,
    walkonBids,
    transferPortalInterests,
    games,
    gameReports,
    gameReportImages,
    gameReportCorrections,
    standings,
    playerSeasonStats,
    playerHistory,
    playerPromises,
    recruitingClassSnapshots,
    coachSeasonHistory,
    storylineRecruits,
    storylineEvents,
    storylineVotes,
    dynastyNews,
    leagueEvents,
    leagueInvites,
    auditLogs,
    nilSeasonEarnings,
    advanceDigests,
  };
}

/**
 * Delete all league-scoped data in FK-safe order.
 * Does NOT touch league_save_states — callers manage that separately
 * so that save state rows can survive a restore.
 */
async function deleteLeagueData(client: any, leagueId: string): Promise<void> {
  const exec = (sql: string, params: any[] = []) => client.query(sql, params);

  // Children of game_reports
  await exec(`DELETE FROM game_report_corrections WHERE league_id = $1`, [leagueId]);
  // Children of storyline_events
  await exec(`
    DELETE FROM storyline_votes
    WHERE event_id IN (SELECT id FROM storyline_events WHERE league_id = $1)
  `, [leagueId]);
  await exec(`DELETE FROM game_report_images WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM game_reports WHERE league_id = $1`, [leagueId]);
  // storyline_events.storyline_recruit_id → storyline_recruits; delete events before recruits
  await exec(`DELETE FROM storyline_events WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM storyline_recruits WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM walkon_bids WHERE league_id = $1`, [leagueId]);
  await exec(`
    DELETE FROM transfer_portal_interests
    WHERE team_id IN (SELECT id FROM teams WHERE league_id = $1)
  `, [leagueId]);
  // player_promises.player_id → players; delete before players
  await exec(`DELETE FROM player_promises WHERE league_id = $1`, [leagueId]);
  await exec(`
    DELETE FROM recruit_top_schools
    WHERE recruit_id IN (SELECT id FROM recruits WHERE league_id = $1)
  `, [leagueId]);
  await exec(`
    DELETE FROM recruiting_interests
    WHERE recruit_id IN (SELECT id FROM recruits WHERE league_id = $1)
  `, [leagueId]);
  await exec(`DELETE FROM advance_digests WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM nil_season_earnings WHERE league_id = $1`, [leagueId]);
  // coach_season_history.coach_id → coaches; delete before coaches
  await exec(`DELETE FROM coach_season_history WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM recruiting_class_snapshots WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM recruiting_actions_log WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM walkon_pool WHERE league_id = $1`, [leagueId]);
  // player_season_stats and player_history before players
  await exec(`DELETE FROM player_season_stats WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM player_history WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM dynasty_news WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM league_events WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM league_invites WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM audit_logs WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM standings WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM games WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM recruits WHERE league_id = $1`, [leagueId]);
  await exec(`
    DELETE FROM players
    WHERE team_id IN (SELECT id FROM teams WHERE league_id = $1)
  `, [leagueId]);
  await exec(`DELETE FROM scouts WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM coaches WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM teams WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM conferences WHERE league_id = $1`, [leagueId]);
  // league_save_states.league_id → leagues (RESTRICT by default).
  // The caller must DELETE from league_save_states BEFORE calling this function
  // so the FK is clear by the time we reach this delete.
  await exec(`DELETE FROM leagues WHERE id = $1`, [leagueId]);
}

async function reinsertLeagueData(client: any, snapshot: Record<string, any>): Promise<void> {
  const ins = async (table: string, rows: any[]) => {
    if (!rows || rows.length === 0) return;
    await client.query(
      `INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
      [JSON.stringify(rows)]
    );
  };

  const leagueRow = snapshot.league;
  if (leagueRow) {
    await client.query(
      `INSERT INTO leagues SELECT * FROM jsonb_populate_record(NULL::leagues, $1::jsonb)`,
      [JSON.stringify(leagueRow)]
    );
  }

  // Insert in FK-safe order: parents before children
  await ins("conferences", snapshot.conferences);
  await ins("teams", snapshot.teams);
  await ins("coaches", snapshot.coaches);
  await ins("scouts", snapshot.scouts);
  // players.team_id → teams
  await ins("players", snapshot.players);
  // recruits must exist before recruiting_interests, recruit_top_schools, recruiting_actions_log
  await ins("recruits", snapshot.recruits);
  // games must exist before game_reports, game_report_images, game_report_corrections, standings
  await ins("games", snapshot.games);
  await ins("standings", snapshot.standings);
  await ins("game_reports", snapshot.gameReports);
  // game_report_images.game_id → games
  await ins("game_report_images", snapshot.gameReportImages);
  // game_report_corrections.game_report_id → game_reports
  await ins("game_report_corrections", snapshot.gameReportCorrections);
  // recruiting_interests: recruit_id → recruits, team_id → teams
  await ins("recruiting_interests", snapshot.recruitingInterests);
  await ins("recruit_top_schools", snapshot.recruitTopSchools);
  await ins("recruiting_actions_log", snapshot.recruitingActionsLog);
  // walkon_pool before walkon_bids (walkon_bids.walkon_pool_id → walkon_pool)
  await ins("walkon_pool", snapshot.walkonPool);
  await ins("walkon_bids", snapshot.walkonBids);
  // transfer_portal_interests: player_id → players, team_id → teams
  await ins("transfer_portal_interests", snapshot.transferPortalInterests);
  // player_season_stats and player_history: no hard player FK (departed players ok)
  await ins("player_season_stats", snapshot.playerSeasonStats);
  await ins("player_history", snapshot.playerHistory);
  // player_promises.player_id → players
  await ins("player_promises", snapshot.playerPromises);
  // recruiting_class_snapshots.team_id → teams
  await ins("recruiting_class_snapshots", snapshot.recruitingClassSnapshots);
  // coach_season_history.coach_id → coaches
  await ins("coach_season_history", snapshot.coachSeasonHistory);
  // storyline_recruits before storyline_events (events.storyline_recruit_id → storyline_recruits)
  await ins("storyline_recruits", snapshot.storylineRecruits);
  await ins("storyline_events", snapshot.storylineEvents);
  // storyline_votes: event_id → storyline_events, team_id → teams
  await ins("storyline_votes", snapshot.storylineVotes);
  await ins("dynasty_news", snapshot.dynastyNews);
  await ins("league_events", snapshot.leagueEvents);
  await ins("league_invites", snapshot.leagueInvites);
  await ins("audit_logs", snapshot.auditLogs);
  await ins("nil_season_earnings", snapshot.nilSeasonEarnings);
  await ins("advance_digests", snapshot.advanceDigests);
}

export async function captureLeagueSaveState(
  leagueId: string,
  trigger: SaveStateTrigger,
  label: string,
  createdByUserId?: string
): Promise<string> {
  const client = await pool.connect();
  try {
    const snapshot = await buildSnapshot(client, leagueId);
    const leagueRow = snapshot.league;
    if (!leagueRow) throw new Error(`League ${leagueId} not found`);

    const result = await client.query(
      `INSERT INTO league_save_states
         (league_id, season, week, phase, label, trigger, created_by_user_id, snapshot_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        leagueId,
        leagueRow.current_season ?? 1,
        leagueRow.current_week ?? 1,
        leagueRow.current_phase ?? "preseason",
        label,
        trigger,
        createdByUserId ?? null,
        JSON.stringify(snapshot),
      ]
    );
    const newId = result.rows[0].id as string;

    // Prune to MAX_SAVE_STATES_PER_LEAGUE, keeping the newest
    await client.query(
      `DELETE FROM league_save_states
       WHERE league_id = $1
         AND id NOT IN (
           SELECT id FROM league_save_states
           WHERE league_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         )`,
      [leagueId, MAX_SAVE_STATES_PER_LEAGUE]
    );

    return newId;
  } finally {
    client.release();
  }
}

/**
 * List save states for a league.
 * Uses a SQL jsonb_each subquery so we never transfer snapshot blobs over the wire —
 * only row counts per table are returned, not the full snapshot_data.
 */
export async function listLeagueSaveStates(leagueId: string): Promise<SaveStateMeta[]> {
  const result = await pool.query(
    `SELECT
       id, league_id, season, week, phase, label, trigger,
       created_by_user_id, restored_at, restored_by_user_id, created_at,
       (
         SELECT coalesce(
           jsonb_object_agg(key, jsonb_array_length(value)),
           '{}'::jsonb
         )
         FROM jsonb_each(snapshot_data)
         WHERE jsonb_typeof(value) = 'array'
       ) AS row_counts
     FROM league_save_states
     WHERE league_id = $1
     ORDER BY created_at DESC`,
    [leagueId]
  );
  return result.rows.map(rowToMeta);
}

export async function restoreLeagueSaveState(
  saveStateId: string,
  leagueId: string,
  restoredByUserId?: string
): Promise<void> {
  // 1. Fetch the target save state (we need the full snapshot_data for restore)
  const { rows: targetRows } = await pool.query(
    `SELECT * FROM league_save_states WHERE id = $1 AND league_id = $2`,
    [saveStateId, leagueId]
  );
  if (!targetRows.length) throw new Error("Save state not found");
  const targetState = targetRows[0];
  const snapshot = targetState.snapshot_data as Record<string, any>;

  // 2. Create a pre-restore auto-backup BEFORE touching any league data.
  //    This happens outside the restore transaction so it's committed even if restore fails.
  await captureLeagueSaveState(
    leagueId,
    "pre_restore",
    `Auto-backup before restore to "${targetState.label}"`,
    restoredByUserId
  );

  // 3. Load ALL existing save state rows (including snapshot_data blobs) into memory.
  //    We must do this because the restore transaction will:
  //      a) DELETE FROM league_save_states WHERE league_id = $1  (to unblock the FK)
  //      b) DELETE FROM leagues WHERE id = $1                    (FK-clear now)
  //      c) Reinsert leagues + all league data from snapshot
  //      d) Reinsert all save state rows back with original IDs
  //    Without step (a), deleteLeagueData's final DELETE FROM leagues fails because
  //    league_save_states.league_id REFERENCES leagues(id) is RESTRICT by default.
  const { rows: allSaveStateRows } = await pool.query(
    `SELECT * FROM league_save_states WHERE league_id = $1`,
    [leagueId]
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 3a. Delete all save states for this league so the leagues FK is clear
    await client.query(
      `DELETE FROM league_save_states WHERE league_id = $1`,
      [leagueId]
    );

    // 3b. Delete all other league data and the leagues row itself
    await deleteLeagueData(client, leagueId);

    // 3c. Reinsert all league data from the snapshot
    await reinsertLeagueData(client, snapshot);

    // 3d. Reinsert all save state rows back (preserving IDs and snapshots)
    if (allSaveStateRows.length > 0) {
      await client.query(
        `INSERT INTO league_save_states
         SELECT * FROM jsonb_populate_recordset(NULL::league_save_states, $1::jsonb)`,
        [JSON.stringify(allSaveStateRows)]
      );
    }

    // 3e. Mark the target save state as restored
    await client.query(
      `UPDATE league_save_states
       SET restored_at = now(), restored_by_user_id = $1
       WHERE id = $2`,
      [restoredByUserId ?? null, saveStateId]
    );

    await client.query("COMMIT");
    invalidateLeague(leagueId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
