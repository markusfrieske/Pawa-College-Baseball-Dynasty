/**
 * Recruiting Balance V2 — Canonical rules module.
 *
 * All cap values, formulas, and profile shapes live here.
 * Routes, simulation, and React components must import from this file.
 * No cap value may be hard-coded elsewhere.
 */

import { SEASON_MAX_WEEKS } from "./phase";

export type RecruitingBalanceVersion = 1 | 2;

export type RecruitingActionType =
  | "email"
  | "phone"
  | "offer"
  | "visit"
  | "head_coach_visit";

export interface RecruitingBalanceProfile {
  version: RecruitingBalanceVersion;
  recruitPoolPerTeam: number;
  minRecruitPool: number;
  targetMin: number;
  targetMax: number;
  targetBase: number;
  targetsPerPlannedCommit: number;
  oversignAllowance: number;
  contactSeasonBase: number;
  scoutSeasonBase: number;
  visitCombinedCap: number;
  campusVisitCap: number;
  headCoachVisitCap: number;
  actionCosts: Record<RecruitingActionType, number>;
  recruitNilPriceIndex: number;
  nilFloor: number;
  nilEnvelopeShares: {
    recruiting: number;
    retention: number;
    walkons: number;
  };
}

const CONTACT_SEASON_BASE: Record<string, number> = {
  short: 160,
  standard: 160,
  medium: 175,
  long: 190,
  full_season: 190,
};

const SCOUT_SEASON_BASE: Record<string, number> = {
  short: 100,
  standard: 100,
  medium: 105,
  long: 120,
  full_season: 114,
};

export const ARCHETYPE_SEASON_CONTACT_BONUS: Record<string, number> = {
  "Scout Master": 20,
  "Dealmaker": 20,
  "Pure CEO": 10,
  "Player's Coach": 0,
  "Balanced": 0,
  "Academic Dean": 0,
  "Tactician": -10,
  "Old School": -20,
};

export const ARCHETYPE_SEASON_SCOUT_BONUS: Record<string, number> = {
  "Scout Master": 20,
  "Academic Dean": 10,
  "Player's Coach": 5,
  "Tactician": 5,
  "Balanced": 0,
  "Pure CEO": 0,
  "Dealmaker": -5,
  "Old School": -5,
};

const V2_ACTION_COSTS: Record<RecruitingActionType, number> = {
  email: 1,
  phone: 2,
  offer: 2,
  visit: 4,
  head_coach_visit: 5,
};

const V2_BASE_PROFILE: Omit<
  RecruitingBalanceProfile,
  "contactSeasonBase" | "scoutSeasonBase" | "visitCombinedCap" | "campusVisitCap" | "headCoachVisitCap"
> = {
  version: 2,
  recruitPoolPerTeam: 7.25,
  minRecruitPool: 30,
  targetMin: 18,
  targetMax: 28,
  targetBase: 12,
  targetsPerPlannedCommit: 2,
  oversignAllowance: 2,
  actionCosts: V2_ACTION_COSTS,
  recruitNilPriceIndex: 0.75,
  nilFloor: 750_000,
  nilEnvelopeShares: { recruiting: 0.65, retention: 0.25, walkons: 0.10 },
};

export function getRecruitingBalanceProfile(
  seasonLength: string | null | undefined,
  dynastyPreset?: string | null
): RecruitingBalanceProfile {
  const sl = seasonLength ?? "standard";
  const isFullSeason = dynastyPreset === "full_season";
  return {
    ...V2_BASE_PROFILE,
    contactSeasonBase: CONTACT_SEASON_BASE[sl] ?? 160,
    scoutSeasonBase: SCOUT_SEASON_BASE[sl] ?? 100,
    visitCombinedCap: isFullSeason ? 14 : 12,
    campusVisitCap: isFullSeason ? 10 : 9,
    headCoachVisitCap: isFullSeason ? 5 : 4,
  };
}

/**
 * Total recruiting turns for a season.
 * recruitingTurns = 1 preseason + regularSeasonWeeks + 4 offseason recruiting phases
 */
export function getRecruitingTurnCount(seasonLength: string | null | undefined): number {
  const regularWeeks = SEASON_MAX_WEEKS[seasonLength ?? "standard"] ?? 5;
  return 1 + regularWeeks + 4;
}

/**
 * Zero-based index of the current recruiting turn.
 * Preseason = 0, regular season week 1 = 1, ..., OffseasonRecruiting4 = totalTurns-1
 */
export function getRecruitingTurnIndex(
  phase: string,
  week: number,
  seasonLength: string | null | undefined
): number {
  const regularWeeks = SEASON_MAX_WEEKS[seasonLength ?? "standard"] ?? 5;
  if (phase === "preseason") return 0;
  if (phase === "regular_season") return Math.min(week, regularWeeks);
  if (phase === "offseason_recruiting_1") return regularWeeks + 1;
  if (phase === "offseason_recruiting_2") return regularWeeks + 2;
  if (phase === "offseason_recruiting_3") return regularWeeks + 3;
  if (phase === "offseason_recruiting_4") return regularWeeks + 4;
  // Spring training and later non-recruiting phases: return last known regular index
  if (phase === "spring_training") return 0;
  return regularWeeks + 4; // fallback to last turn
}

/**
 * Distribute a seasonal budget across turns deterministically.
 * First (seasonBudget % totalTurns) turns get one extra point.
 * Guarantees: sum of all turn caps === seasonBudget.
 */
export function getTurnBudgetCap(
  seasonBudget: number,
  totalTurns: number,
  currentTurnIndex: number
): number {
  if (totalTurns <= 0) return Math.max(4, seasonBudget);
  const base = Math.floor(seasonBudget / totalTurns);
  const extra = seasonBudget % totalTurns;
  return base + (currentTurnIndex < extra ? 1 : 0);
}

export interface SeasonalBudgetInput {
  seasonLength: string | null | undefined;
  dynastyPreset?: string | null;
  avgRecruitSkill: number;
  avgScoutSkill: number;
  archetype: string;
  hasQuickStudy: boolean;
  currentPhase: string;
  currentWeek: number;
}

export function getSeasonContactBudget(
  profile: RecruitingBalanceProfile,
  avgRecruitSkill: number,
  archetype: string
): number {
  const archetypeBonus = ARCHETYPE_SEASON_CONTACT_BONUS[archetype] ?? 0;
  return Math.max(8, profile.contactSeasonBase + 8 * (avgRecruitSkill - 1) + archetypeBonus);
}

export function getSeasonScoutBudget(
  profile: RecruitingBalanceProfile,
  avgScoutSkill: number,
  archetype: string,
  hasQuickStudy: boolean
): number {
  const archetypeBonus = ARCHETYPE_SEASON_SCOUT_BONUS[archetype] ?? 0;
  return Math.max(4, profile.scoutSeasonBase + 6 * (avgScoutSkill - 1) + archetypeBonus + (hasQuickStudy ? 15 : 0));
}

export function getTurnContactCap(input: SeasonalBudgetInput): number {
  const profile = getRecruitingBalanceProfile(input.seasonLength, input.dynastyPreset);
  const seasonBudget = getSeasonContactBudget(profile, input.avgRecruitSkill, input.archetype);
  const totalTurns = getRecruitingTurnCount(input.seasonLength);
  const turnIndex = getRecruitingTurnIndex(input.currentPhase, input.currentWeek, input.seasonLength);
  return Math.max(4, getTurnBudgetCap(seasonBudget, totalTurns, turnIndex));
}

export function getTurnScoutCap(input: SeasonalBudgetInput): number {
  const profile = getRecruitingBalanceProfile(input.seasonLength, input.dynastyPreset);
  const seasonBudget = getSeasonScoutBudget(profile, input.avgScoutSkill, input.archetype, input.hasQuickStudy);
  const totalTurns = getRecruitingTurnCount(input.seasonLength);
  const turnIndex = getRecruitingTurnIndex(input.currentPhase, input.currentWeek, input.seasonLength);
  return Math.max(4, getTurnBudgetCap(seasonBudget, totalTurns, turnIndex));
}

/**
 * V2 recruit pool size formula.
 * max(minPool, ceil(teamCount × 7.25))
 *
 * Examples: 4→30, 10→73, 14→102, 20→145, 149→1081
 */
export function computeRecruitPoolSizeV2(teamCount: number): number {
  return Math.max(30, Math.ceil(teamCount * 7.25));
}

/**
 * Dynamic target-board cap based on planned class size.
 * targetCap = clamp(targetBase + targetsPerPlannedCommit × plannedClassSize, targetMin, targetMax)
 */
export function getTargetCap(plannedClassSize: number, profile: RecruitingBalanceProfile): number {
  const raw = profile.targetBase + profile.targetsPerPlannedCommit * plannedClassSize;
  return Math.max(profile.targetMin, Math.min(profile.targetMax, raw));
}

export interface ClassCapacityInput {
  rosterSize: number;
  seniorsCount: number;
  confirmedExits?: number;
  expectedDraftExits?: number;
  expectedPortalExits?: number;
  oversignAllowance?: number;
}

export interface ClassCapacityResult {
  confirmedOpenings: number;
  projectedOpenings: number;
  hardCommitCap: number;
}

export function getClassCapacity(input: ClassCapacityInput): ClassCapacityResult {
  const {
    rosterSize,
    seniorsCount,
    confirmedExits = 0,
    expectedDraftExits = 0,
    expectedPortalExits = 0,
    oversignAllowance = 2,
  } = input;
  const returningRoster = rosterSize - seniorsCount - confirmedExits;
  const confirmedOpenings = Math.max(0, 25 - returningRoster);
  const projected = confirmedOpenings + expectedDraftExits + expectedPortalExits;
  const projectedOpenings = Math.max(confirmedOpenings, Math.min(projected, confirmedOpenings + 10));
  const hardCommitCap = confirmedOpenings + oversignAllowance;
  return { confirmedOpenings, projectedOpenings, hardCommitCap };
}

export interface RecruitingEconomy {
  balanceVersion: 2;
  recruitingTurnIndex: number;
  recruitingTurnsTotal: number;
  targets: { used: number; cap: number };
  commits: {
    signed: number;
    confirmedOpenings: number;
    projectedOpenings: number;
    hardCap: number;
    oversignAllowance: number;
  };
  contactPoints: { spent: number; cap: number; seasonBudget: number };
  scoutPoints: { spent: number; cap: number; seasonBudget: number };
  visits: {
    totalUsed: number;
    totalCap: number;
    campusUsed: number;
    campusCap: number;
    headCoachUsed: number;
    headCoachCap: number;
  };
  nil: {
    budget: number;
    spent: number;
    remaining: number;
    recruitingAllocated: number;
    recruitingCommitted: number;
    recruitingRemaining: number;
    retentionReserved: number;
    walkonReserved: number;
  };
}
