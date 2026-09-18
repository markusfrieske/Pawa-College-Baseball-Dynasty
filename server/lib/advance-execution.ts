import { createRecruitStageStore } from "./recruit-stage-store";
import { runRecruitStageProgression } from "./recruit-stage-progression";
import type { PoolClient } from "pg";
import { pool } from "../db";

export type AdvanceExecutionIdentity = Readonly<{ leagueId: string; operationId: string; token: string }>;

export class AdvanceExecutionLost extends Error {
  constructor() {
    super("Advance execution ownership expired or was superseded. Refresh the league status before retrying.");
    this.name = "AdvanceExecutionLost";
  }
}

/** Serialize metadata with lease takeover. Always lock the league row before the operation. */
export async function withOwnedAdvanceLock<T>(leagueId: string, token: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let originalDeadline: string;
  const assertLive = async () => {
    const owned = await client.query(
      "SELECT 1 FROM league_advance_locks WHERE league_id=$1 AND locked_by=$2 AND lease_expires_at > clock_timestamp()",
      [leagueId, token]);
    if (owned.rowCount !== 1) throw new AdvanceExecutionLost();
    const original = await client.query("SELECT $1::timestamptz > clock_timestamp() AS live", [originalDeadline]);
    if (!original.rows[0].live) throw new AdvanceExecutionLost();
  };
  try {
    await client.query("BEGIN");
    // Check time only AFTER the possibly blocking row lock has been acquired.
    const locked = await client.query<{ deadline: string }>("SELECT lease_expires_at::text AS deadline FROM league_advance_locks WHERE league_id=$1 FOR UPDATE", [leagueId]);
    if (locked.rowCount !== 1) throw new AdvanceExecutionLost();
    originalDeadline = locked.rows[0].deadline;
    await assertLive();
    const result = await action(client);
    // A slow checkpoint/trigger must not commit after its lease expired while it ran.
    await assertLive();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

const stageNames = new Set(["initializing", "cpu_recruiting", "storylines", "recruit_stages", "offseason_recruit_stages", "reset_actions", "game_simulation", "phase_transition"]);

/** Metadata and explicitly migrated stages only; other gameplay effects remain outside this fence. */
export function createAdvanceExecution(identity: AdvanceExecutionIdentity) {
  const { leagueId, operationId, token } = Object.freeze({ ...identity });
  const withOperation = async (action: (client: PoolClient) => Promise<void>) => withOwnedAdvanceLock(leagueId, token, async client => {
    const op = await client.query<{ deadline: string }>(
      "SELECT lease_expires_at::text AS deadline FROM league_advances WHERE id=$1 AND league_id=$2 AND locked_by=$3 AND status='running' FOR UPDATE",
      [operationId, leagueId, token]);
    if (op.rowCount !== 1) throw new AdvanceExecutionLost();
    const assertOriginalDeadline = async () => {
      const live = await client.query("SELECT $1::timestamptz > clock_timestamp() AS live", [op.rows[0].deadline]);
      if (!live.rows[0].live) throw new AdvanceExecutionLost();
    };
    await assertOriginalDeadline();
    await action(client);
    // Check the captured deadline, including for heartbeat: refreshed expiry
    // must not hide that the original lease expired during a slow SQL write.
    await assertOriginalDeadline();
  });
  const mutate = async (setSql: string, extra: unknown[] = []) => withOperation(async client => {
    const updated = await client.query(
      `UPDATE league_advances SET ${setSql},updated_at=clock_timestamp()
       WHERE id=$1 AND league_id=$2 AND locked_by=$3 AND status='running'
         AND lease_expires_at > clock_timestamp()`,
      [operationId, leagueId, token, ...extra]);
    if (updated.rowCount !== 1) throw new AdvanceExecutionLost();
  });
  return Object.freeze({
    checkpoint: async (stage: string, pct: number) => {
      if (!stageNames.has(stage) || !Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("Invalid advance checkpoint");
      await mutate("checkpoints=checkpoints || $4::jsonb", [JSON.stringify({ [stage]: { pct, at: new Date().toISOString() } })]);
    },
    complete: () => mutate("status='complete'"),
    fail: (message: string) => mutate("status='failed',error_message=$4", [message]),
    progressRecruitStages: (week: number, stage: "recruit_stages" | "offseason_recruit_stages" = "recruit_stages") => withOperation(async client => {
      const source = await client.query(
        "SELECT l.current_phase,l.current_week,l.current_season,a.from_phase,a.from_week,a.from_season,a.checkpoints FROM leagues l JOIN league_advances a ON a.league_id=l.id WHERE l.id=$1 AND a.id=$2 FOR UPDATE OF l", [leagueId,operationId]);
      const state = source.rows[0];
      if (!state || state.current_phase !== state.from_phase || state.current_week !== state.from_week || state.current_season !== state.from_season) throw new AdvanceExecutionLost();
      const initial = stage === "recruit_stages" && week === state.from_week + 1;
      const offseason = stage === "offseason_recruit_stages" && week === state.from_week && /^offseason_recruiting_[1-4]$/.test(state.from_phase);
      if (!initial && !offseason) throw new AdvanceExecutionLost();
      if (state.checkpoints?.[stage]?.pct === 100) return;
      await runRecruitStageProgression(leagueId, week, await createRecruitStageStore(client,leagueId), true);
      const checkpoint = await client.query(
        "UPDATE league_advances SET checkpoints=checkpoints || jsonb_build_object($2::text,jsonb_build_object('pct',100,'at',clock_timestamp())),updated_at=clock_timestamp() WHERE id=$1", [operationId,stage]);
      if (checkpoint.rowCount !== 1) throw new AdvanceExecutionLost();
    }),
    resetWeeklyActions: () => withOperation(async client => {
      // Lock the source state before touching coaches. The execution may not
      // apply an old week's reset to a league whose phase/week/season changed.
      const source = await client.query(
        `SELECT l.current_phase,l.current_week,l.current_season,a.from_phase,a.from_week,a.from_season,a.checkpoints
         FROM leagues l JOIN league_advances a ON a.league_id=l.id
         WHERE l.id=$1 AND a.id=$2 FOR UPDATE OF l`, [leagueId,operationId]);
      const state = source.rows[0];
      if (!state || state.current_phase !== state.from_phase || state.current_week !== state.from_week || state.current_season !== state.from_season) {
        throw new AdvanceExecutionLost();
      }
      if (state.checkpoints?.reset_actions?.pct === 100) return;
      await client.query(
        "UPDATE coaches SET scout_actions_used=0,recruit_actions_used=0,is_ready=false WHERE league_id=$1",
        [leagueId]);
      const checkpoint = await client.query(
        `UPDATE league_advances SET checkpoints=checkpoints || jsonb_build_object('reset_actions',
           jsonb_build_object('pct',100,'at',clock_timestamp())),updated_at=clock_timestamp() WHERE id=$1`,
        [operationId]);
      if (checkpoint.rowCount !== 1) throw new AdvanceExecutionLost();
    }),
    heartbeat: () => withOperation(async client => {
      const renewed = await client.query(
        `UPDATE league_advances SET lease_expires_at=clock_timestamp()+interval '15 minutes',updated_at=clock_timestamp()
         WHERE id=$1 AND league_id=$2 AND locked_by=$3 AND status='running' AND lease_expires_at > clock_timestamp()`,
        [operationId,leagueId,token]);
      if (renewed.rowCount !== 1) throw new AdvanceExecutionLost();
      const renewedLock = await client.query(
        "UPDATE league_advance_locks SET locked_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '15 minutes' WHERE league_id=$1 AND locked_by=$2 AND lease_expires_at > clock_timestamp()",
        [leagueId,token]);
      if (renewedLock.rowCount !== 1) throw new AdvanceExecutionLost();
    }),
  });
}
