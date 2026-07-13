import {
  getRecruitingBalanceProfile,
  getRecruitingTurnCount,
  getRecruitingTurnIndex,
  getSeasonContactBudget,
  getSeasonScoutBudget,
  getTargetCap,
  type RecruitingEconomy,
} from "@shared/recruitingBalance";
import type { League } from "@shared/schema";

export interface EconomyInput {
  league: Pick<League, "seasonLength" | "dynastyPreset" | "currentPhase" | "currentWeek">;
  coach?: {
    pitchingRecruitingSkill?: number | null;
    hittingRecruitingSkill?: number | null;
    scoutingSkill?: number | null;
    evaluationSkill?: number | null;
    archetype?: string | null;
    perks?: Record<string, boolean> | null;
  } | null;
  team?: {
    nilBudget?: number | null;
  } | null;
  targetsUsed: number;
  commitsData: {
    signed: number;
    confirmedOpenings: number;
    projectedOpenings: number;
  };
  contactSpent: number;
  contactCap: number;
  scoutSpent: number;
  scoutCap: number;
  seasonVisitCount: { total: number; campusVisits: number; hcVisits: number };
}

export function computeRecruitingEconomy(input: EconomyInput): RecruitingEconomy {
  const { league, coach, team, targetsUsed, commitsData, contactSpent, contactCap, scoutSpent, scoutCap, seasonVisitCount } = input;

  const profile = getRecruitingBalanceProfile(league.seasonLength, league.dynastyPreset);
  const turnIndex = getRecruitingTurnIndex(league.currentPhase, league.currentWeek, league.seasonLength);
  const turnCount = getRecruitingTurnCount(league.seasonLength);

  const avgRecruitSkill = Math.floor(
    ((coach?.pitchingRecruitingSkill || 1) + (coach?.hittingRecruitingSkill || 1)) / 2
  );
  const avgScoutSkill = Math.floor(
    ((coach?.scoutingSkill || 1) + (coach?.evaluationSkill || 1)) / 2
  );
  const archetype = coach?.archetype || "Balanced";
  const hasQuickStudy = !!(coach?.perks as Record<string, boolean> | null)?.scout_quick_study;

  const seasonContactBudget = getSeasonContactBudget(profile, avgRecruitSkill, archetype);
  const seasonScoutBudget = getSeasonScoutBudget(profile, avgScoutSkill, archetype, hasQuickStudy);

  const targetCap = getTargetCap(commitsData.projectedOpenings, profile);
  const nilBudget = team?.nilBudget || 0;

  return {
    balanceVersion: 2,
    recruitingTurnIndex: turnIndex,
    recruitingTurnsTotal: turnCount,
    targets: { used: targetsUsed, cap: targetCap },
    commits: {
      signed: commitsData.signed,
      confirmedOpenings: commitsData.confirmedOpenings,
      projectedOpenings: commitsData.projectedOpenings,
      hardCap: 25,
      oversignAllowance: profile.oversignAllowance,
    },
    contactPoints: { spent: contactSpent, cap: contactCap, seasonBudget: seasonContactBudget },
    scoutPoints: { spent: scoutSpent, cap: scoutCap, seasonBudget: seasonScoutBudget },
    visits: {
      totalUsed: seasonVisitCount.total,
      totalCap: profile.visitCombinedCap,
      campusUsed: seasonVisitCount.campusVisits,
      campusCap: profile.campusVisitCap,
      headCoachUsed: seasonVisitCount.hcVisits,
      headCoachCap: profile.headCoachVisitCap,
    },
    nil: {
      budget: nilBudget,
      spent: 0,
      remaining: nilBudget,
      recruitingAllocated: 0,
      recruitingCommitted: 0,
      recruitingRemaining: nilBudget,
      retentionReserved: 0,
      walkonReserved: 0,
    },
  };
}
