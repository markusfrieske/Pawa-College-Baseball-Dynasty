import { pool } from "../db";

export interface RecruitingActionParams {
  actionType: string;
  recruitId: string;
  teamId: string;
  leagueId: string;
  coachId: string | null;
  week: number;
  season: number;
  interestGain: number;
  hasOffer?: boolean;
  cost: number;
  maxAllowed: number;
  notes: string;
  isAutoPilot?: boolean;
}

export interface RecruitingActionResult {
  success: boolean;
  alreadyDone: boolean;
  spendFailed: boolean;
}

/**
 * Unified transactional recruiting action executor — used by BOTH human routes and CPU simulation.
 *
 * All mutations run in a single DB transaction to prevent partial state corruption and
 * double-spend under concurrent requests. The lock order is deterministic:
 *
 *   1. INSERT action log (ON CONFLICT DO NOTHING against the partial unique indexes
 *      uq_action_log_weekly  — one phone/email per recruit per week
 *      uq_action_log_seasonal — one visit/hcv/offer per recruit per season
 *      If 0 rows inserted the action already happened): ROLLBACK, return alreadyDone.
 *      This is the idempotency gate — no pre-read needed in the route.
 *
 *   2. Atomic action-budget spend (the "NIL actions budget" for non-signing actions):
 *        UPDATE coaches
 *          SET recruit_actions_used = recruit_actions_used + cost
 *          WHERE id = coachId AND recruit_actions_used + cost <= maxAllowed
 *      If 0 rows updated (budget exhausted concurrently): ROLLBACK, return spendFailed.
 *      The ROLLBACK also reverts the action log insert so the slot stays available for retry.
 *      This is a guarded read-modify-write — never a plain read → check → write.
 *
 *   3. UPSERT recruiting_interests (create or increment interest_level, set has_offer).
 *   4. UPDATE recruit_top_schools accumulated_interest.
 *   5. COMMIT.
 *
 * Pass coachId=null for CPU simulation teams that track budget via a local variable.
 * Budget enforcement is the caller's responsibility when coachId is null.
 */
export async function executeRecruitingAction(
  params: RecruitingActionParams,
): Promise<RecruitingActionResult> {
  const {
    actionType, recruitId, teamId, leagueId, coachId,
    week, season, interestGain, hasOffer, cost, maxAllowed, notes, isAutoPilot,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const logInsert = await client.query<{ id: string }>(
      `INSERT INTO recruiting_actions_log
         (id, recruit_id, team_id, league_id, week, season, action_type, interest_change, notes, is_auto_pilot)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [recruitId, teamId, leagueId, week, season, actionType, interestGain, notes ?? null, isAutoPilot ?? false],
    );

    if ((logInsert.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { success: false, alreadyDone: true, spendFailed: false };
    }

    if (coachId) {
      const spendResult = await client.query(
        `UPDATE coaches
         SET recruit_actions_used = recruit_actions_used + $1
         WHERE id = $2 AND recruit_actions_used + $1 <= $3`,
        [cost, coachId, maxAllowed],
      );
      if ((spendResult.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return { success: false, alreadyDone: false, spendFailed: true };
      }
    }

    await client.query(
      `INSERT INTO recruiting_interests
         (id, recruit_id, team_id, interest_level, has_offer)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (recruit_id, team_id) DO UPDATE SET
         interest_level = LEAST(100, recruiting_interests.interest_level + EXCLUDED.interest_level),
         has_offer = recruiting_interests.has_offer OR EXCLUDED.has_offer`,
      [recruitId, teamId, interestGain, hasOffer ?? false],
    );

    await client.query(
      `UPDATE recruit_top_schools
       SET accumulated_interest = COALESCE(accumulated_interest, 0) + $1
       WHERE recruit_id = $2 AND team_id = $3`,
      [interestGain, recruitId, teamId],
    );

    await client.query("COMMIT");
    return { success: true, alreadyDone: false, spendFailed: false };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore secondary error */ }
    throw err;
  } finally {
    client.release();
  }
}
