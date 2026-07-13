import {
  getRecruitingBalanceProfile,
  getRecruitingTurnCount,
  getRecruitingTurnIndex,
  getSeasonContactBudget,
  getSeasonScoutBudget,
  getTargetCap,
  type RecruitingEconomy,
} from "@shared/recruitingBalance";
import type { League, InsertTeamRecruitingLedger, TeamRecruitingLedger } from "@shared/schema";
import type { IStorage } from "../storage";

export interface EconomyInput {
  league: Pick<League, "id" | "seasonLength" | "dynastyPreset" | "currentPhase" | "currentWeek" | "currentSeason">;
  coach?: {
    teamId?: string | null;
    pitchingRecruitingSkill?: number | null;
    hittingRecruitingSkill?: number | null;
    scoutingSkill?: number | null;
    evaluationSkill?: number | null;
    archetype?: string | null;
    perks?: Record<string, boolean> | null;
  } | null;
  team?: {
    id?: string | null;
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

function buildLedgerRecord(
  input: EconomyInput,
  profile: ReturnType<typeof getRecruitingBalanceProfile>,
  turnIndex: number,
  seasonContactCap: number,
  seasonScoutCap: number,
  targetCap: number,
): InsertTeamRecruitingLedger {
  const totalTurns = getRecruitingTurnCount(input.league.seasonLength);
  const perTurnContact = Math.floor(seasonContactCap / Math.max(1, totalTurns));
  const perTurnScout = Math.floor(seasonScoutCap / Math.max(1, totalTurns));
  return {
    leagueId: input.league.id,
    teamId: input.team?.id ?? input.coach?.teamId ?? "",
    season: input.league.currentSeason,
    recruitingTurnIndex: turnIndex,
    contactCap: perTurnContact,
    contactSpent: 0,
    scoutCap: perTurnScout,
    scoutSpent: 0,
    targetsCap: targetCap,
    visitsCombinedCap: profile.visitCombinedCap,
    campusVisitCap: profile.campusVisitCap,
    headCoachVisitCap: profile.headCoachVisitCap,
    rulesVersion: 2,
  };
}

export async function computeRecruitingEconomyWithLedger(
  input: EconomyInput,
  storage: IStorage,
): Promise<{ economy: RecruitingEconomy; ledger: TeamRecruitingLedger | undefined }> {
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
  const teamId = team?.id ?? coach?.teamId ?? "";

  let ledger: TeamRecruitingLedger | undefined;
  if (teamId && league.id && turnIndex >= 0) {
    ledger = await storage.getTeamRecruitingLedger(league.id, teamId, league.currentSeason, turnIndex);
    if (!ledger) {
      ledger = await storage.upsertTeamRecruitingLedger(
        buildLedgerRecord(input, profile, turnIndex, seasonContactBudget, seasonScoutBudget, targetCap)
      );
    }
  }

  const economy: RecruitingEconomy = {
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

  return { economy, ledger };
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
