import type { IStorage } from "../storage";

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
 * Ordering contract (prevents partial mutations under concurrent requests):
 *   1. Insert action log (ON CONFLICT DO NOTHING — idempotency gate).
 *   2. Return early if duplicate (already done this turn).
 *   3. Atomic spend via UPDATE WHERE (budget enforced before any interest change).
 *      If spend fails (concurrent over-budget race), no interest side-effects have occurred.
 *   4. Update recruiting interest (create or increment).
 *   5. Update top-school accumulated interest.
 *
 * Pass coachId=null for CPU simulation teams that manage budget via a local variable instead
 * of per-action atomicSpend; budget enforcement is the caller's responsibility in that case.
 */
export async function executeRecruitingAction(
  params: RecruitingActionParams,
  storage: IStorage,
): Promise<RecruitingActionResult> {
  const {
    actionType, recruitId, teamId, leagueId, coachId,
    week, season, interestGain, hasOffer, cost, maxAllowed, notes, isAutoPilot,
  } = params;

  const logged = await storage.createRecruitingAction({
    recruitId,
    teamId,
    leagueId,
    week,
    season,
    actionType,
    interestChange: interestGain,
    notes,
    ...(isAutoPilot !== undefined ? { isAutoPilot } : {}),
  });

  if (!logged) {
    return { success: false, alreadyDone: true, spendFailed: false };
  }

  if (coachId) {
    const spent = await storage.atomicSpendRecruitPoints(coachId, cost, maxAllowed);
    if (!spent) {
      return { success: false, alreadyDone: false, spendFailed: true };
    }
  }

  let interest = await storage.getRecruitingInterest(recruitId, teamId);
  if (!interest) {
    await storage.createRecruitingInterest({
      recruitId,
      teamId,
      interestLevel: interestGain,
      ...(hasOffer ? { hasOffer: true } : {}),
    });
  } else {
    await storage.updateRecruitingInterest(interest.id, {
      interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
      ...(hasOffer ? { hasOffer: true } : {}),
    });
  }

  const topSchools = await storage.getRecruitTopSchools(recruitId);
  const teamTopSchool = topSchools.find(ts => ts.teamId === teamId);
  if (teamTopSchool) {
    await storage.updateRecruitTopSchool(teamTopSchool.id, {
      accumulatedInterest: (teamTopSchool.accumulatedInterest || 0) + interestGain,
    });
  }

  return { success: true, alreadyDone: false, spendFailed: false };
}
