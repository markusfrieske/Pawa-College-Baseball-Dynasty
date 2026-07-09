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
  const sd = row.snapshot_data || {};
  const rowCounts: Record<string, number> = {};
  for (const key of Object.keys(sd)) {
    if (Array.isArray(sd[key])) rowCounts[key] = (sd[key] as any[]).length;
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

async function deleteLeagueData(client: any, leagueId: string): Promise<void> {
  const exec = (sql: string, params: any[] = []) => client.query(sql, params);

  await exec(`DELETE FROM game_report_corrections WHERE league_id = $1`, [leagueId]);
  await exec(`
    DELETE FROM storyline_votes
    WHERE event_id IN (SELECT id FROM storyline_events WHERE league_id = $1)
  `, [leagueId]);
  await exec(`DELETE FROM game_report_images WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM game_reports WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM storyline_events WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM storyline_recruits WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM walkon_bids WHERE league_id = $1`, [leagueId]);
  await exec(`
    DELETE FROM transfer_portal_interests
    WHERE team_id IN (SELECT id FROM teams WHERE league_id = $1)
  `, [leagueId]);
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
  await exec(`DELETE FROM coach_season_history WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM recruiting_class_snapshots WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM recruiting_actions_log WHERE league_id = $1`, [leagueId]);
  await exec(`DELETE FROM walkon_pool WHERE league_id = $1`, [leagueId]);
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
  await exec(`DELETE FROM leagues WHERE id = $1`, [leagueId]);
}

function bulkInsertSql(tableName: string, rows: any[]): string | null {
  if (!rows || rows.length === 0) return null;
  return `
    INSERT INTO ${tableName}
    SELECT * FROM jsonb_populate_recordset(NULL::${tableName}, $1::jsonb)
  `;
}

async function reinsertLeagueData(client: any, snapshot: Record<string, any>): Promise<void> {
  const ins = async (table: string, rows: any[]) => {
    if (!rows || rows.length === 0) return;
    const sql = bulkInsertSql(table, rows);
    if (sql) await client.query(sql, [JSON.stringify(rows)]);
  };

  const leagueRow = snapshot.league;
  if (leagueRow) {
    await client.query(
      `INSERT INTO leagues SELECT * FROM jsonb_populate_record(NULL::leagues, $1::jsonb)`,
      [JSON.stringify(leagueRow)]
    );
  }

  await ins("conferences", snapshot.conferences);
  await ins("teams", snapshot.teams);
  await ins("coaches", snapshot.coaches);
  await ins("scouts", snapshot.scouts);
  await ins("players", snapshot.players);
  await ins("recruits", snapshot.recruits);
  await ins("games", snapshot.games);
  await ins("standings", snapshot.standings);
  await ins("game_reports", snapshot.gameReports);
  await ins("game_report_images", snapshot.gameReportImages);
  await ins("game_report_corrections", snapshot.gameReportCorrections);
  await ins("recruiting_interests", snapshot.recruitingInterests);
  await ins("recruit_top_schools", snapshot.recruitTopSchools);
  await ins("recruiting_actions_log", snapshot.recruitingActionsLog);
  await ins("walkon_pool", snapshot.walkonPool);
  await ins("walkon_bids", snapshot.walkonBids);
  await ins("transfer_portal_interests", snapshot.transferPortalInterests);
  await ins("player_season_stats", snapshot.playerSeasonStats);
  await ins("player_history", snapshot.playerHistory);
  await ins("player_promises", snapshot.playerPromises);
  await ins("recruiting_class_snapshots", snapshot.recruitingClassSnapshots);
  await ins("coach_season_history", snapshot.coachSeasonHistory);
  await ins("storyline_recruits", snapshot.storylineRecruits);
  await ins("storyline_events", snapshot.storylineEvents);
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

export async function listLeagueSaveStates(leagueId: string): Promise<SaveStateMeta[]> {
  const result = await pool.query(
    `SELECT id, league_id, season, week, phase, label, trigger,
            created_by_user_id, restored_at, restored_by_user_id, created_at,
            snapshot_data
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
  const { rows } = await pool.query(
    `SELECT * FROM league_save_states WHERE id = $1 AND league_id = $2`,
    [saveStateId, leagueId]
  );
  if (!rows.length) throw new Error("Save state not found");
  const saveState = rows[0];
  const snapshot = saveState.snapshot_data as Record<string, any>;

  await captureLeagueSaveState(
    leagueId,
    "pre_restore",
    `Auto-backup before restore to "${saveState.label}"`,
    restoredByUserId
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await deleteLeagueData(client, leagueId);
    await reinsertLeagueData(client, snapshot);
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
