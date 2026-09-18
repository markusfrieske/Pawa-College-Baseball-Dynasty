import { pool } from "../db";
import { withOwnedAdvanceLock } from "./advance-execution";

type SourceState = { id: string; currentPhase: string; currentWeek: number; currentSeason: number };
type UnfinishedAdvance = {
  id: string; status: string; from_phase: string; from_week: number; from_season: number;
  checkpoints: unknown; expired: boolean;
};
export class AdvanceRecoveryRequired extends Error {
  constructor(public operationId: string) {
    super("An interrupted advance needs reconciliation before this league can continue. Its operation history and current results have been preserved.");
  }
}
export class AdvanceOperationBusy extends Error {
  constructor(message = "An advance operation is still active or its failure has not been recorded. Retry after its lease expires.") { super(message); }
}

const stages = new Set(["initializing", "cpu_recruiting", "storylines", "recruit_stages", "reset_actions", "game_simulation", "phase_transition"]);
function completedStages(row: UnfinishedAdvance): Set<string> {
  const value = row.checkpoints;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdvanceRecoveryRequired(row.id);
  const completed = new Set<string>();
  for (const [name, checkpoint] of Object.entries(value)) {
    if (!stages.has(name) || !checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)
      || typeof checkpoint.pct !== "number" || !Number.isFinite(checkpoint.pct) || checkpoint.pct < 0 || checkpoint.pct > 100) {
      throw new AdvanceRecoveryRequired(row.id);
    }
    if (checkpoint.pct === 100) completed.add(name);
  }
  // A completed transition should have changed the source state. Reusing this
  // checkpoint against the unchanged source could skip the entire next step.
  if (completed.has("phase_transition")) throw new AdvanceRecoveryRequired(row.id);
  return completed;
}

/** Read-only persistent containment. A changed source is not an automatic resume. */
export async function inspectAdvanceRecovery(league: SourceState) {
  const { rows } = await pool.query<UnfinishedAdvance>(
    `SELECT a.id,a.status,a.from_phase,a.from_week,a.from_season,a.checkpoints,
            a.lease_expires_at < now() AS expired
       FROM league_advances a
      WHERE a.league_id=$1 AND a.status IN ('running','failed')
        AND NOT EXISTS (
          SELECT 1 FROM league_advances c WHERE c.league_id=a.league_id
            AND c.status='complete' AND c.from_phase=a.from_phase
            AND c.from_week=a.from_week AND c.from_season=a.from_season
            AND c.created_at > a.created_at
        )
      ORDER BY a.created_at DESC,a.id DESC`, [league.id]);
  let resume: { id: string; status: string; stages: Set<string>; checkpoints: unknown } | undefined;
  const observedCompletions: Array<{ id: string; stages: Set<string> }> = [];
  for (const row of rows) {
    if (row.status === "running" && !row.expired) throw new AdvanceOperationBusy();
    if (row.from_phase !== league.currentPhase || row.from_week !== league.currentWeek || row.from_season !== league.currentSeason) {
      throw new AdvanceRecoveryRequired(row.id);
    }
    const done = completedStages(row);
    observedCompletions.push({ id: row.id, stages: done });
    if (row.status === "running") {
      if (resume?.status === "running") throw new AdvanceRecoveryRequired(row.id);
      resume = { id: row.id, status: row.status, stages: done, checkpoints: row.checkpoints };
    } else if (!resume) {
      resume = { id: row.id, status: row.status, stages: done, checkpoints: row.checkpoints };
    }
  }
  // Older failed attempts may predate inherited checkpoints. Never silently
  // discard their completed work or guess that merging their effects is safe.
  for (const observed of observedCompletions) {
    if ([...observed.stages].some(stage => !resume?.stages.has(stage))) throw new AdvanceRecoveryRequired(observed.id);
  }
  return resume;
}

/** Retire and inherit in one commit, so another interruption loses no evidence. */
export async function beginAdvanceOperation(league: SourceState, id: string, owner: string,
  resume: Awaited<ReturnType<typeof inspectAdvanceRecovery>>) {
  await withOwnedAdvanceLock(league.id, owner, async client => {
    if (resume) {
      const retired = await client.query(
        `UPDATE league_advances SET status='failed',
            error_message=CASE WHEN status='running' THEN 'Resumed by a matching source-state advance' ELSE error_message END,updated_at=now()
          WHERE id=$1 AND league_id=$2 AND status=$7 AND (status='failed' OR lease_expires_at < now())
            AND from_phase=$3 AND from_week=$4 AND from_season=$5 AND checkpoints=$6::jsonb`,
        [resume.id,league.id,league.currentPhase,league.currentWeek,league.currentSeason,JSON.stringify(resume.checkpoints),resume.status]);
      if (retired.rowCount !== 1) throw new AdvanceOperationBusy();
    }
    await client.query(
      `INSERT INTO league_advances(id,league_id,status,from_phase,from_week,from_season,checkpoints,locked_by,lease_expires_at)
       VALUES($1,$2,'running',$3,$4,$5,$6::jsonb,$7,now()+interval '15 minutes')`,
      [id,league.id,league.currentPhase,league.currentWeek,league.currentSeason,JSON.stringify(resume?.checkpoints ?? {}),owner]);
  });
}
