/**
 * Simulation routes — play-by-play, advance-week, and quick-sim shortcuts.
 *
 * Extracted from server/routes.ts as part of the domain route module refactor.
 * Helper functions (simulateGameWithRosters, simulateGame, generateBoxScore, etc.)
 * live at module scope and are used by all route handlers in registerSimulationRoutes.
 */

import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { getRandomAbilities, getAbilitiesForPosition, calculateOVR, getStarRatingFromOVR, enforceGoldOvrGate } from "@shared/abilities";
import { getPotentialRange, getProgressionZone, rollWeightedPotential, getPotentialGrade } from "@shared/potential";
import { getActionPointCost } from "@shared/stateDistance";
import { executeRecruitingAction } from "../services/recruitingActionService";
import { getPersonalityForArchetype, getTraitBadgesForArchetype, getPhilosophyForArchetype, evaluateMilestones } from "@shared/coachTraits";
import { CONFERENCE_TIER_NIL, DEFAULT_CONFERENCE_NIL } from "@shared/nilConfig";
import type { Player, Recruit, TransferPortalInterest, Game, LastSeasonStats, AdvanceDigestCategories } from "@shared/schema";
import { assignTrajectory } from "@shared/trajectory";
import { getRecruitPoolSize } from "../utils";
import { getRecruitingPitch } from "@shared/programIdentity";
import { validateAndNormalizeRecruitingClass, ClassValidationError } from "../lib/validateRecruitingClass";
import { replaceLeagueRecruitingClass } from "../lib/replaceLeagueRecruitingClass";
import { finalizeAdvanceDigestSafe } from "../digest-engine";
import { captureLeagueSaveState } from "../lib/leagueSaveState";
import { getAdvancePreflight } from "../lib/advancePreflight";
import { cacheGet, cacheSet, leagueCacheKey, invalidateLeague } from "../cache";
import { evaluatePlayerPromises, processOffseasonDepartures, finalizeDeparturesInternal } from "../offseason-helpers";
import { awardPostseasonXp } from "../game-finalizer";
import {
  generateGameNewsArticles,
  generateCWSChampionNewsArticle,
  generateRecruitCommitNewsArticle,
  generateDraftDeclarationNewsArticle,
  generateTransferPortalNewsArticle,
  generateSeasonPreviewNewsArticle,
  generateConferenceUpdateNews,
  generateDeparturesSummaryNews,
} from "../news-engine";
import { getRealRosters } from "../realRostersLoader";
import { NATIONAL_RANKS, TOTAL_NATIONAL_TEAMS } from "../rosterScaleFactors";
import { generateRecruitClass, selectTools, genToolAttr, sampleNormalSpeed, sampleNormalVelocity, HITTER_TOOL_GROUPS, PITCHER_TOOL_GROUPS, pickHandedness } from "../recruit-generator";
import { normalizeCommonAbilities } from "../normalizeCommonAbilities";
import { validateLeagueRosters, checkTeamRosterStructure } from "../rosterValidation";
import { sendWeeklyDigests } from "../digestEmail";
import { pool, db } from "../db";
import { randomUUID } from "crypto";
import { sql as drizzleSql } from "drizzle-orm";
import { coaches as coachesTable } from "@shared/schema";
import { calibrateRpiOvr } from "../calibrateRpiOvr";
import { resolveRecruitSigningWinner } from "../signing-resolver";
import { assignPitcherArchetype, generateArchetypePitchMix, qualityTierFromOvr, noPitches } from "../pitchMixHelpers";
import { GAME_TYPE_TO_DAY, ipToOuts, computeWeeklyAvailability, computePitcherAvailability, ALL_GAME_DAYS, type GameDay } from "@shared/pitcherRest";
import { generateAndResolveStorylineEvents, resolveAllPendingStorylineEvents, initializeStorylineRecruits, catchUpAndResolveStorylineArcs } from "../storyline-routes";
import { createScheduleForSeason } from "../services/schedule/createScheduleForSeason";
import {
  generateSchedule,
  generateRecruits,
  generateCpuCoaches,
  getTeamsForConference,
  generateExhibitionGames,
  getAttributesToRevealCount,
  getAttributesToReveal,
  generatePlayersForTeam,
  generateTopSchoolsForLeague,
} from "../recruit-engine";
import {
  updatePitcherRestFromBox,
  accumulatePlayerStats,
  updateStandingsForGame,
  computeLegacyScore,
} from "../game-engine";
import { finalizeGame, finalizeGameAtomic, flushCoachXp, batchFinalizeGames, type CoachXpDelta } from "../game-finalizer";
import {
  requireAuth,
  hasCommissionerAccess,
  acquireAdvanceLock,
  releaseAdvanceLock,
  potentialGradeToNumber,
  autoAssignLineup,
  ensureCoachTraits,
  calculatePhilosophyRetentionBonus,
} from "../route-helpers";
import { updateRecruitStages } from "./league-mgmt";
import { selectAndSeedNationalField, generateFSSuperRegionals, advanceFSSRBracket, initializeFSCWSBrackets, advanceFSCWSBracket } from "../services/postseason";
import { runV3SeasonDevelopment } from "../services/playerDevelopment/runSeasonDevelopment";
import { migrateLeagueToV3 } from "../services/playerDevelopment/migrateToV3";
import { assignArchetype } from "../services/playerDevelopment/assignArchetype";
import { buildDevelopmentCaps } from "../services/playerDevelopment/buildCaps";
import { buildDevelopmentSeed } from "@shared/seededRng";
import { computePositionTargetsFromDepartures, derivePitcherRatioFromTargets, computePoolSizeFromDepartures } from "../services/recruitPoolPlanner";
import { Phase, getSeasonMaxWeeks, RECRUITING_ACTIVE_PHASES as _PHASE_RECRUITING_ACTIVE, STORYLINE_ACTIVE_PHASES as _PHASE_STORYLINE_ACTIVE, OFFSEASON_RECRUITING_PHASES as _PHASE_OFFSEASON_REC } from "@shared/phase";
import { getTurnContactCap, getTurnScoutCap, getRecruitingBalanceProfile, getRecruitingTurnIndex } from "@shared/recruitingBalance";

// ── Shared recruiting math helpers (mirrors recruiting.ts — keep in sync) ────
// Extracted so simulation.ts CPU recruiter uses the identical math as the
// human endpoint without creating a circular import.

let _simSanityClippedCount = 0;

function simAssertInterestGainSane(actionType: string, interestGain: number, baseGain: number) {
  const expectedMin = Math.ceil(baseGain * 0.4);
  const expectedMax = Math.ceil(baseGain * 5.0);
  if (interestGain < expectedMin || interestGain > expectedMax) {
    _simSanityClippedCount++;
    console.warn(
      `[recruiting-sanity][sim] ${actionType}: interestGain=${interestGain} outside [${expectedMin},${expectedMax}] (base=${baseGain}) — cumulative clips: ${_simSanityClippedCount}`,
    );
  }
}

function simNormalizeAttrBonus(attr: number): number {
  const clamped = Math.max(1, Math.min(10, attr));
  return 0.75 + clamped * 0.05;
}

function simCalculatePriorityBonus(pitchTopic: string, recruit: any, _team: any): { bonus: number; matchLevel: string } {
  const priorityMap: Record<string, string> = {
    proximity: recruit.proximityPriority,
    reputation: recruit.reputationPriority,
    playingTime: recruit.playingTimePriority,
    academics: recruit.academicsPriority,
    prestige: recruit.prestigePriority,
    facilities: recruit.facilitiesPriority,
    collegeLife: (recruit as any).collegeLifePriority || "Somewhat",
  };
  const priorityValue = priorityMap[pitchTopic] || "Somewhat";
  const priorityMultipliers: Record<string, number> = {
    "Not Important": 0.5,
    "Somewhat": 1.0,
    "Very": 1.5,
    "Extremely": 2.0,
  };
  return { bonus: priorityMultipliers[priorityValue] || 1.0, matchLevel: priorityValue };
}

function simCalculateSchoolBonus(pitchTopic: string, team: any): number {
  const attributeMap: Record<string, number> = {
    proximity: 1.0,
    reputation: simNormalizeAttrBonus(team.prestige || 5),
    playingTime: 1.0,
    academics: simNormalizeAttrBonus(team.academics || 5),
    prestige: simNormalizeAttrBonus(team.prestige || 5),
    facilities: simNormalizeAttrBonus(team.facilities || 5),
    collegeLife: simNormalizeAttrBonus(team.collegeLife || 5),
  };
  const topicBonus = attributeMap[pitchTopic] || 1.0;
  const overallQuality = ((team.prestige || 5) + (team.facilities || 5) + (team.academics || 5) + (team.collegeLife || 5)) / 40;
  const rankBoost = typeof team.recruitingRankBoost === "number" ? team.recruitingRankBoost : 0;
  const qualityModifier = 0.9 + (overallQuality * 0.2) + rankBoost;
  return topicBonus * qualityModifier;
}

function simCalculateProximityBonus(recruitState: string, teamState: string, team?: any): number {
  if (recruitState === teamState) return 1.5;
  const regions: Record<string, string[]> = {
    southeast: ["FL","GA","AL","SC","NC","TN","MS","LA"],
    southwest: ["TX","AZ","NM","OK"],
    midwest: ["OH","IN","IL","MI","WI","MN","IA","MO","NE","KS"],
    northeast: ["NY","PA","NJ","MA","CT","MD","VA"],
    west: ["CA","WA","OR","CO","UT","NV"],
  };
  let recruitRegion = "";
  let teamRegion = "";
  for (const [region, states] of Object.entries(regions)) {
    if (states.includes(recruitState)) recruitRegion = region;
    if (states.includes(teamState)) teamRegion = region;
  }
  const rawBonus = (recruitRegion && recruitRegion === teamRegion) ? 1.2 : 1.0;
  if (team) {
    const brandScore = Math.max(team.prestige || 5, team.stadium || 5);
    if (brandScore >= 8) {
      return Math.min(1.45, rawBonus + (brandScore >= 9 ? 0.10 : 0.07));
    }
  }
  return rawBonus;
}

const SIM_ARCHETYPE_INTEREST_MULTIPLIERS: Record<string, number> = {
  "Pure CEO": 1.15, "Dealmaker": 1.12, "Player's Coach": 1.10,
  "Scout Master": 1.08, "Balanced": 1.0, "Academic Dean": 1.0,
  "Tactician": 0.95, "Old School": 0.90,
};
const SIM_ARCHETYPE_PITCHER_BONUS: Record<string, number> = {
  "Tactician": 1.20, "Old School": 1.15, "Scout Master": 1.05,
  "Balanced": 1.0, "Pure CEO": 1.0, "Dealmaker": 1.0,
  "Player's Coach": 1.0, "Academic Dean": 1.0,
};
const SIM_ARCHETYPE_HITTER_BONUS: Record<string, number> = {
  "Player's Coach": 1.20, "Dealmaker": 1.10, "Scout Master": 1.05,
  "Balanced": 1.0, "Pure CEO": 1.0, "Tactician": 1.0,
  "Old School": 1.0, "Academic Dean": 1.0,
};

function simCalculatePhilosophyBonus(coach: any, recruit: any, actionType: string, team?: any): number {
  const philosophy = Array.isArray(coach?.coachingPhilosophy)
    ? (coach.coachingPhilosophy as { statement: string; importance: string }[])
    : [];
  if (philosophy.length === 0) return 0;
  const importanceScale: Record<string, number> = { extremely: 1.0, very: 0.67, somewhat: 0.33 };
  const PITCHER_POSITIONS = ["P","SP","RP","CL","CP","LHP","RHP"];
  const isPitcher = PITCHER_POSITIONS.includes(recruit.position || "");
  const STAGE_ORDER = ["open","top8","top5","top3","verbal","signed"];
  const stageIndex = STAGE_ORDER.indexOf((recruit.stage || "open").toLowerCase());
  const stars = recruit.starRating || 2;
  const isBlueChip = !!recruit.isBlueChip;
  const academicsPriority = recruit.academicsPriority || "Somewhat";
  const reputationPriority = recruit.reputationPriority || "Somewhat";
  const highAcademics = academicsPriority === "Very" || academicsPriority === "Extremely";
  const highReputation = reputationPriority === "Very" || reputationPriority === "Extremely";
  const recruitState = recruit.homeState || "";
  const teamState = team?.state || "";
  const sameState = !!recruitState && recruitState === teamState;
  const regions: string[][] = [
    ["FL","GA","AL","SC","NC","TN","MS","LA"],
    ["TX","AZ","NM","OK"],
    ["OH","IN","IL","MI","WI","MN","IA","MO","NE","KS"],
    ["NY","PA","NJ","MA","CT","MD","VA"],
    ["CA","WA","OR","CO","UT","NV"],
  ];
  const rr = regions.find(r => r.includes(recruitState));
  const tr = regions.find(r => r.includes(teamState));
  const sameRegion = !sameState && !!(rr && tr && rr === tr);
  const isEmail = actionType === "email";
  const isPhone = actionType === "phone";
  const isEmailPhone = isEmail || isPhone;
  const isVisit = actionType === "visit" || actionType === "campus_visit";
  const isHCVisit = actionType === "head_coach_visit" || actionType === "hc_visit";
  const isOffer = actionType === "offer";
  let total = 0;
  for (const { statement, importance } of philosophy) {
    const scale = importanceScale[importance] ?? 0.33;
    let base = 0;
    switch (statement) {
      case "Recruit for the Long Term": if (isEmailPhone && stageIndex <= 2) base = 0.10; break;
      case "Build Team Chemistry": if (isVisit) base = 0.12; break;
      case "Play Small Ball": base = 0.04; break;
      case "Win Now": if (isOffer) base = 0.14; break;
      case "Elite Program Standards": if (isVisit) base = 0.12; break;
      case "Build a National Brand": base = sameState ? 0.02 : 0.07; break;
      case "Player Development First": if (isEmailPhone) base = highReputation ? 0.14 : 0.06; break;
      case "Positive Culture": if (isVisit) base = 0.12; else if (isEmailPhone) base = 0.04; break;
      case "Trust the Process": if ((isEmailPhone || isOffer) && stageIndex >= 2) base = 0.07; break;
      case "Pitching Wins Championships": if (isHCVisit && isPitcher) base = 0.14; break;
      case "Game Management Mastery": if (isHCVisit) base = 0.12; break;
      case "Exploit Every Matchup": if (isEmailPhone) base = 0.05; break;
      case "Play the Right Way": if (sameState) base = 0.14; else if (sameRegion) base = 0.07; break;
      case "Defense and Pitching": if (isPhone && isPitcher) base = 0.12; break;
      case "Earn Everything": if (isHCVisit || isVisit) base = 0.07; break;
      case "Scouting Advantage": if (isEmailPhone) base = 0.04; break;
      case "Find Hidden Gems": if (isEmailPhone && stars <= 2) base = 0.05; break;
      case "Build Through Recruiting": if (isEmailPhone) base = 0.05; break;
      case "Academic Excellence": if (highAcademics) base = 0.14; break;
      case "Graduation Rate Matters": if (isVisit) base = 0.12; break;
      case "Character Counts": if (isEmailPhone && highAcademics) base = 0.08; break;
      case "Land the Blue Chips": if (isOffer && (stars >= 4 || isBlueChip)) base = 0.14; break;
      case "NIL Budget Mastery":
        if (isOffer) {
          const nilBudget = team?.nilBudget || 0;
          const nilSpent = team?.nilSpent || 0;
          const nilRatio = nilBudget > 0 ? Math.max(0, (nilBudget - nilSpent) / nilBudget) : 0.5;
          base = 0.06 + nilRatio * 0.12;
        }
        break;
      case "Close Every Deal": if (stageIndex >= 3) base = 0.07; break;
    }
    total += base * scale;
  }
  return total;
}

function simCalculateIdentityRecruitingBonus(coach: any, recruit: any, actionType: string): number {
  if (!coach?.recruitingPitch) return 0;
  const pitch = getRecruitingPitch(coach.recruitingPitch);
  if (!pitch) return 0;
  const BASE = 0.05;
  const isEmail = actionType === "email";
  const isPhone = actionType === "phone";
  const isVisit = actionType === "visit" || actionType === "campus_visit";
  const isOffer = actionType === "offer";
  const isHCVisit = actionType === "head_coach_visit" || actionType === "hc_visit";
  const highImportance = (v: string | undefined) => v === "Very" || v === "Extremely";
  switch (pitch.id) {
    case "development": if ((isEmail || isPhone) && highImportance(recruit.playerDevelopmentPriority)) return BASE; break;
    case "playing_time": if ((isVisit || isOffer || isHCVisit) && highImportance(recruit.playingTimePriority)) return BASE; break;
    case "prestige": if ((isOffer || isHCVisit) && highImportance(recruit.reputationPriority)) return BASE; break;
    case "academics": if ((isEmail || isVisit) && highImportance(recruit.academicsPriority)) return BASE; break;
    case "campus_life": if (isVisit && highImportance(recruit.collegeLifePriority)) return BASE; break;
    case "pro_path": if ((isOffer || isHCVisit) && (recruit.starRating >= 4 || recruit.isBlueChip)) return BASE; break;
  }
  return 0;
}

function simCalculateCoachBonus(coach: any, recruit: any, actionType: string, team?: any): number {
  if (!coach) return 1.0;
  const isPitcher = recruit.position === "P";
  const baseSkill = isPitcher ? (coach.pitchingRecruitingSkill || 1) : (coach.hittingRecruitingSkill || 1);
  const skillBonus = 1.0 + (baseSkill - 1) * 0.05;
  const archetypeBonus = SIM_ARCHETYPE_INTEREST_MULTIPLIERS[coach.archetype] || 1.0;
  const positionBonus = isPitcher
    ? (SIM_ARCHETYPE_PITCHER_BONUS[coach.archetype] || 1.0)
    : (SIM_ARCHETYPE_HITTER_BONUS[coach.archetype] || 1.0);
  const philosophyAddon = simCalculatePhilosophyBonus(coach, recruit, actionType, team);
  const identityAddon = simCalculateIdentityRecruitingBonus(coach, recruit, actionType);
  return skillBonus * archetypeBonus * positionBonus + philosophyAddon + identityAddon;
}

function computePrestigeBandMod(recruit: any, team: any): number {
  if (recruit.recruitType !== "TRANSFER") return 1.0;
  const op = recruit.originPrestige;
  if (op == null) return 1.0;
  const tp = team.prestige || 5;
  if (tp > op + 2) return 1.15;
  if (tp < op - 2) return 0.6;
  return 1.0;
}

function computePlayingTimeMod(recruit: any, teamPlayers: any[]): number {
  if (recruit.recruitType !== "TRANSFER") return 1.0;
  const recruitOvr = recruit.overall || 0;
  const PITCHER_POSITIONS = ["P","SP","RP","CL","CP","LHP","RHP"];
  const isPitcher = PITCHER_POSITIONS.includes(recruit.position);
  if (isPitcher) {
    const pitchersAbove = teamPlayers.filter(
      p => PITCHER_POSITIONS.includes(p.position) && (p.overall || 0) > recruitOvr
    ).length;
    return pitchersAbove >= 5 ? 0.5 : 1.0;
  } else {
    return teamPlayers.filter(p => p.position === recruit.position && (p.overall || 0) > recruitOvr).length > 0 ? 0.5 : 1.0;
  }
}

function computeEmailGain(recruit: any, team: any, coach: any, topic: string) {
  const baseGain = 3 + Math.floor(Math.random() * 5);
  const { bonus: priorityBonus, matchLevel } = simCalculatePriorityBonus(topic, recruit, team);
  const schoolBonus = simCalculateSchoolBonus(topic, team);
  const coachBonus = simCalculateCoachBonus(coach, recruit, "email", team);
  const proximityBonus = topic === "proximity" ? simCalculateProximityBonus(recruit.homeState, team.state, team) : 1.0;
  const totalMultiplier = Math.min(4.5, priorityBonus * schoolBonus * coachBonus * proximityBonus);
  const baseFinalGain = Math.max(1, Math.round(baseGain * totalMultiplier));
  const perkMultiplier = (coach?.perks as Record<string, boolean> | null)?.rec_hustler ? 1.08 : 1.0;
  const interestGain = Math.max(1, Math.round(baseFinalGain * perkMultiplier));
  return { baseGain, interestGain, matchLevel, totalMultiplier };
}

function computePhoneGain(recruit: any, team: any, coach: any, topics: string[]) {
  let totalInterestGain = 0;
  const pitchResults: { topic: string; gain: number; matchLevel: string }[] = [];
  for (const topic of topics) {
    const baseGain = 3 + Math.floor(Math.random() * 7);
    const { bonus: priorityBonus, matchLevel } = simCalculatePriorityBonus(topic, recruit, team);
    const schoolBonus = simCalculateSchoolBonus(topic, team);
    const coachBonus = simCalculateCoachBonus(coach, recruit, "phone", team);
    const proximityBonus = topic === "proximity" ? simCalculateProximityBonus(recruit.homeState, team.state, team) : 1.0;
    const topicMultiplier = Math.min(4.5, priorityBonus * schoolBonus * coachBonus * proximityBonus);
    const baseTopicGain = Math.max(1, Math.round(baseGain * topicMultiplier));
    const phonePerkMult = (coach?.perks as Record<string, boolean> | null)?.rec_hustler ? 1.08 : 1.0;
    const gain = Math.max(1, Math.round(baseTopicGain * phonePerkMult));
    simAssertInterestGainSane(`phone:${topic}`, gain, baseGain);
    totalInterestGain += gain;
    pitchResults.push({ topic, gain, matchLevel });
  }
  return { totalInterestGain, pitchResults };
}

function computeVisitGain(recruit: any, team: any, coach: any) {
  const baseGain = 20 + Math.floor(Math.random() * 16);
  const facilitiesBonus = simNormalizeAttrBonus(team.facilities || 5);
  const academicsBonus  = simNormalizeAttrBonus(team.academics  || 5);
  const prestigeBonus   = simNormalizeAttrBonus(team.prestige   || 5);
  const collegeLifeBonus = simNormalizeAttrBonus(team.collegeLife || 5);
  const schoolAttrBonus = (facilitiesBonus + academicsBonus + prestigeBonus + collegeLifeBonus) / 4;
  const coachBonus = simCalculateCoachBonus(coach, recruit, "visit", team);
  const { bonus: priorityBonus } = simCalculatePriorityBonus("facilities", recruit, team);
  const proximityBonus = simCalculateProximityBonus(recruit.homeState, team.state, team);
  const totalMultiplier = Math.min(3.0, schoolAttrBonus * coachBonus * priorityBonus * proximityBonus);
  const baseVisitGain = Math.max(5, Math.round(baseGain * totalMultiplier));
  const visitPerkMult = (coach?.perks as Record<string, boolean> | null)?.rec_campus_closer ? 1.15 : 1.0;
  const interestGain = Math.max(5, Math.round(baseVisitGain * visitPerkMult));
  return { baseGain, interestGain, totalMultiplier };
}

function computeOfferGain(recruit: any, team: any, coach: any) {
  const baseGain = 15 + Math.floor(Math.random() * 10);
  const prestigeBonus = simNormalizeAttrBonus(team.prestige || 5);
  const coachBonus = simCalculateCoachBonus(coach, recruit, "offer", team);
  const { bonus: priorityBonus } = simCalculatePriorityBonus("playingTime", recruit, team);
  const totalMultiplier = Math.min(3.0, prestigeBonus * coachBonus * priorityBonus);
  const interestGain = Math.max(2, Math.round(baseGain * totalMultiplier));
  return { baseGain, interestGain };
}

function assertInterestGainSane(actionType: string, interestGain: number, baseGain: number) {
  simAssertInterestGainSane(actionType, interestGain, baseGain);
}

// ============ ADVANCE PROGRESS STORE ============
// In-memory map: leagueId -> { stage, pct, updatedAt }
const advanceProgress = new Map<string, { stage: string; pct: number; updatedAt: number }>();

// Per-league checkpoint writers registered by the advance route so that
// setAdvanceProgress calls inside advanceLeagueStep persist to league_advances.
// This provides per-substep checkpointing without modifying the advance engine.
const advanceCheckpointWriters = new Map<string, (step: string, pct: number) => void>();

function setAdvanceProgress(leagueId: string, stage: string, pct: number) {
  advanceProgress.set(leagueId, { stage, pct, updatedAt: Date.now() });
  advanceCheckpointWriters.get(leagueId)?.(stage, pct);
}

function clearAdvanceProgress(leagueId: string) {
  advanceProgress.delete(leagueId);
  advanceCheckpointWriters.delete(leagueId);
}


// ── Game simulation helpers (module scope) ──────────────────────────────────

// ============ GAME SIMULATION FUNCTION ============
function simulateGameWithRosters(
  homePlayers: Player[], awayPlayers: Player[], gameType?: string | null,
  homeStadium?: number, awayStadium?: number,
  pitcherFatigueIn?: { home: Record<string, number>; away: Record<string, number> },
  homePhilosophy?: string, awayPhilosophy?: string,
  currentWeek?: number | null,
): { homeScore: number; awayScore: number; boxScore: string; homePitcherPitches: Record<string, number>; awayPitcherPitches: Record<string, number> } {

  const gameTypeToRole: Record<string, string> = { friday: "FRI", saturday: "SAT", sunday: "SUN", midweek: "MID" };
  const starterRoles = ["FRI", "SAT", "SUN", "MID"];
  const gameSlotForRest = gameType ? (GAME_TYPE_TO_DAY[gameType] ?? null) : null;

  function pitcherIsAvailable(p: Player): boolean {
    if (!gameSlotForRest || currentWeek == null) return true;
    return computePitcherAvailability(
      p.lastPitchedOuts ?? 0,
      p.lastPitchedWeek ?? null,
      (p.lastPitchedDay ?? null) as GameDay | null,
      p.stamina ?? 60,
      currentWeek,
      gameSlotForRest,
    ).available;
  }

  function findStartingPitcher(players: Player[]): Player | undefined {
    const pitchers = [...players.filter(p => p.position === "P")].sort((a, b) => (b.overall || 0) - (a.overall || 0));
    const targetRole = gameType ? gameTypeToRole[gameType] : null;
    // Priority: (1) exact-role + rested, (2) any starter + rested, (3) exact-role fallback, (4) any starter fallback, (5) anyone
    let sp = targetRole ? pitchers.find(p => p.pitchingRole === targetRole && pitcherIsAvailable(p)) : undefined;
    if (!sp) sp = pitchers.find(p => starterRoles.includes(p.pitchingRole || "") && pitcherIsAvailable(p));
    if (!sp && targetRole) sp = pitchers.find(p => p.pitchingRole === targetRole);
    if (!sp) sp = pitchers.find(p => starterRoles.includes(p.pitchingRole || ""));
    if (!sp) sp = pitchers[0];
    return sp;
  }

  const homeSP = findStartingPitcher(homePlayers);
  const awaySP = findStartingPitcher(awayPlayers);

  // SP pitching quality: (velocity + control + stuff) / 3, normalized around 50
  const spQuality = (sp: Player | undefined) =>
    sp ? ((sp.velocity || 50) + (sp.control || 50) + (sp.stuff || 50)) / 3 : 50;
  const homeSpQ = spQuality(homeSP);
  const awaySpQ = spQuality(awaySP);

  // Strong SP suppresses opponent runs (elite SP at 75+ quality = ~1.25 fewer runs)
  const homeSpSuppression = (homeSpQ - 50) / 20 * 1.25;
  const awaySpSuppression = (awaySpQ - 50) / 20 * 1.25;

  // Platoon bonus: left-handed SP vs a predominantly right-handed lineup
  const platoonBonus = (spHand: string, batters: Player[]): number => {
    if (spHand !== "L") return 0;
    const rhb = batters.filter(p => p.position !== "P" && (p.batHand || "R") !== "L");
    if (rhb.length === 0) return 0;
    const avgVsLHP = rhb.reduce((s, p) => s + (p.vsLHP || 50), 0) / rhb.length;
    // Above-average vsLHP (>50) reduces the platoon penalty; below = more suppression
    return (avgVsLHP - 50) / 100 * 0.4;
  };
  const homeSpHand = homeSP?.throwHand || "R";
  const awaySpHand = awaySP?.throwHand || "R";

  // Offensive lineup strength (position players only)
  const offPos = (pl: Player[]) => pl.filter(p => p.position !== "P");
  const homeOff = offPos(homePlayers);
  const awayOff = offPos(awayPlayers);
  const homeOffStr = homeOff.length > 0 ? homeOff.reduce((s, p) => s + (p.overall || 300), 0) / homeOff.length : 300;
  const awayOffStr = awayOff.length > 0 ? awayOff.reduce((s, p) => s + (p.overall || 300), 0) / awayOff.length : 300;
  const offDiff = (homeOffStr - awayOffStr) / 300;

  // Stadium park factor: rating 1-10, 5 = neutral; each point = ±0.07 runs
  const homePark = ((homeStadium ?? 5) - 5) * 0.07;

  // Bullpen fatigue: heavy recent usage degrades reliever effectiveness → extra runs for opponent
  const relieverRolesFatigue = ["LRP", "MR", "MR1", "MR2", "MR3", "SU", "CP"];
  const calcBullpenFatiguePenalty = (players: Player[], fatigueMap: Record<string, number>) => {
    const relievers = players.filter(p => p.position === "P" && relieverRolesFatigue.includes(p.pitchingRole || ""));
    if (relievers.length === 0) return 0;
    const totalFatigue = relievers.reduce((s, p) => s + (fatigueMap[p.id] || 0), 0);
    const avgFatigue = totalFatigue / relievers.length;
    return Math.min(0.80, avgFatigue / 100 * 0.80); // max +0.80 runs to opponent
  };
  const homeBullpenFatigued = calcBullpenFatiguePenalty(homePlayers, pitcherFatigueIn?.home || {});
  const awayBullpenFatigued = calcBullpenFatiguePenalty(awayPlayers, pitcherFatigueIn?.away || {});

  // Philosophy strategy: modifies offDiff multiplier and expected run baseline
  // aggressive → more talent-based variance (±15%); conservative → tighter games (±5%)
  // small_ball → lower scoring (-0.8); power_ball → higher scoring (+0.8)
  // "small_ball_coaching:{scale}:{strategy}" prefix = coaching philosophy "Play Small Ball" active.
  // scale is 1.0 (extremely), 0.67 (very), or 0.33 (somewhat) — importance-scaled magnitude.
  const parseGamePhilosophy = (p?: string): { strategy: string; coachSmallBallScale: number } => {
    if (!p) return { strategy: "balanced", coachSmallBallScale: 0 };
    if (p.startsWith("small_ball_coaching:")) {
      const rest = p.slice("small_ball_coaching:".length);
      const colonIdx = rest.indexOf(":");
      if (colonIdx !== -1) {
        const scale = parseFloat(rest.slice(0, colonIdx)) || 0;
        const strategy = rest.slice(colonIdx + 1);
        return { strategy, coachSmallBallScale: scale };
      }
      // Legacy format (no scale): treat as full-scale
      return { strategy: rest, coachSmallBallScale: 1.0 };
    }
    return { strategy: p, coachSmallBallScale: 0 };
  };
  const { strategy: homeStrategy, coachSmallBallScale: homeSmallBallScale } = parseGamePhilosophy(homePhilosophy);
  const { strategy: awayStrategy, coachSmallBallScale: awaySmallBallScale } = parseGamePhilosophy(awayPhilosophy);
  const philosophyDiffMult = (() => {
    if (homeStrategy === "aggressive" || awayStrategy === "aggressive") return 1.15;
    if (homeStrategy === "conservative" || awayStrategy === "conservative") return 0.85;
    return 1.0;
  })();
  // "Play Small Ball" coaching philosophy: up to +0.35 run execution bonus, scaled by importance.
  // extremely=+0.35, very=+0.23, somewhat=+0.12 — small-ball execution improves win% vs
  // similarly-rated opponents through manufacturing runs and tight defense.
  const homeRunAdj = (homeStrategy === "power_ball" ? 0.8 : homeStrategy === "small_ball" ? -0.8 : 0)
    + homeSmallBallScale * 0.35;
  const awayRunAdj = (awayStrategy === "power_ball" ? 0.8 : awayStrategy === "small_ball" ? -0.8 : 0)
    + awaySmallBallScale * 0.35;
  const adjOffDiff = offDiff * philosophyDiffMult;

  const homeAdv = 0.25;
  let homeExpected = 5.75
    + adjOffDiff * 4.0
    + homeAdv
    - awaySpSuppression
    + platoonBonus(awaySpHand, homePlayers)
    + homePark
    + awayBullpenFatigued    // fatigued away bullpen gives up more home runs
    + homeRunAdj;

  let awayExpected = 5.75
    - adjOffDiff * 4.0
    - homeSpSuppression
    + platoonBonus(homeSpHand, awayPlayers)
    + homePark * 0.5
    + homeBullpenFatigued    // fatigued home bullpen gives up more away runs
    + awayRunAdj;

  homeExpected = Math.max(1.0, Math.min(13, homeExpected));
  awayExpected = Math.max(1.0, Math.min(13, awayExpected));

  function poissonSample(lambda: number): number {
    let L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  let homeScore = poissonSample(homeExpected);
  let awayScore = poissonSample(awayExpected);
  homeScore = Math.max(0, Math.min(20, homeScore));
  awayScore = Math.max(0, Math.min(20, awayScore));
  if (homeScore === awayScore) {
    if (Math.random() > 0.5) homeScore++; else awayScore++;
  }

  const boxScoreObj = generateBoxScore(homeScore, awayScore, homePlayers, awayPlayers, gameType, homeStadium);

  // Extract reliever pitch counts from box score for next-game fatigue tracking
  const extractPitcherPitches = (pitching: Array<{ playerId: string; totalPitches: number }>, spId: string | undefined) => {
    const usage: Record<string, number> = {};
    for (const p of pitching) {
      if (p.playerId && !p.playerId.startsWith("fake_") && p.playerId !== spId) {
        usage[p.playerId] = (usage[p.playerId] || 0) + (p.totalPitches || 0);
      }
    }
    return usage;
  };
  const homePitcherPitches = extractPitcherPitches(boxScoreObj.home.pitching || [], homeSP?.id);
  const awayPitcherPitches = extractPitcherPitches(boxScoreObj.away.pitching || [], awaySP?.id);

  return { homeScore, awayScore, boxScore: JSON.stringify(boxScoreObj), homePitcherPitches, awayPitcherPitches };
}

// Build a philosophy string for a coach — encodes "Play Small Ball" importance scale.
// Returns undefined if coach has no relevant philosophy.
function buildCoachPhilosophyString(coach: any): string | undefined {
  const gameStrategy = coach?.gamePhilosophyStrategy ?? "balanced";
  const sbEntry = Array.isArray(coach?.coachingPhilosophy)
    ? (coach.coachingPhilosophy as { statement: string; importance: string }[]).find(p => p.statement === "Play Small Ball")
    : undefined;
  const importanceToScale: Record<string, number> = { extremely: 1.0, very: 0.67, somewhat: 0.33 };
  const sbScale = sbEntry ? (importanceToScale[sbEntry.importance] ?? 0) : 0;
  return sbScale > 0 ? `small_ball_coaching:${sbScale}:${gameStrategy}` : gameStrategy;
}

// Philosophy map cache per league per sim-batch (avoids repeated DB round-trips)
const _philosophyMapCache = new Map<string, Map<string, string>>();

async function getPhilosophyMapForLeague(leagueId: string): Promise<Map<string, string>> {
  if (_philosophyMapCache.has(leagueId)) return _philosophyMapCache.get(leagueId)!;
  const coaches = await storage.getCoachesByLeague(leagueId);
  const map = new Map<string, string>();
  for (const c of coaches) {
    if (c.teamId) map.set(c.teamId, buildCoachPhilosophyString(c) ?? "balanced");
  }
  _philosophyMapCache.set(leagueId, map);
  // Evict after 30s to avoid stale data across long sim sessions
  setTimeout(() => _philosophyMapCache.delete(leagueId), 30_000);
  return map;
}

async function simulateGame(homeTeamId: string, awayTeamId: string, gameType?: string | null, homePhilosophy?: string, awayPhilosophy?: string, currentWeek?: number | null): Promise<{ homeScore: number; awayScore: number; boxScore: string }> {
  const [homePlayers, awayPlayers, homeTeam, awayTeam] = await Promise.all([
    storage.getPlayersByTeam(homeTeamId),
    storage.getPlayersByTeam(awayTeamId),
    storage.getTeam(homeTeamId),
    storage.getTeam(awayTeamId),
  ]);
  // Auto-derive philosophy from coaches when not explicitly provided
  if (homePhilosophy == null || awayPhilosophy == null) {
    const leagueId = homeTeam?.leagueId ?? awayTeam?.leagueId;
    if (leagueId) {
      const philMap = await getPhilosophyMapForLeague(leagueId);
      homePhilosophy = homePhilosophy ?? philMap.get(homeTeamId) ?? "balanced";
      awayPhilosophy = awayPhilosophy ?? philMap.get(awayTeamId) ?? "balanced";
    }
  }
  const result = simulateGameWithRosters(homePlayers, awayPlayers, gameType, homeTeam?.stadium, awayTeam?.stadium, undefined, homePhilosophy, awayPhilosophy, currentWeek);
  return { homeScore: result.homeScore, awayScore: result.awayScore, boxScore: result.boxScore };
}

function generateBoxScore(homeScore: number, awayScore: number, homePlayers: Player[], awayPlayers: Player[], gameType?: string | null, homeStadium?: number) {
  function distributeRuns(totalRuns: number, numInnings: number): number[] {
    const innings = new Array(numInnings).fill(0);
    for (let i = 0; i < totalRuns; i++) {
      const weights = innings.map((_, idx) => idx < 2 ? 0.8 : idx >= numInnings - 3 ? 1.3 : 1.0);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalWeight, cumulative = 0;
      for (let j = 0; j < numInnings; j++) {
        cumulative += weights[j];
        if (r <= cumulative) { innings[j]++; break; }
      }
    }
    return innings;
  }

  const numInnings = 9;
  const homeInnings = distributeRuns(homeScore, numInnings);
  const awayInnings = distributeRuns(awayScore, numInnings);
  const innings: number[][] = [];
  for (let i = 0; i < numInnings; i++) {
    innings.push([awayInnings[i], homeInnings[i]]);
  }

  function generateTeamStats(players: Player[], teamScore: number, isHome: boolean) {
    const positionPlayers = players.filter(p => p.position !== "P");
    const pitchers = players.filter(p => p.position === "P");

    interface BatterLine {
      name: string; position: string; playerId: string; ab: number; r: number; h: number;
      doubles: number; triples: number; hr: number; rbi: number;
      bb: number; hbp: number; so: number; sb: number; cs: number; avg: string;
      exitVelo: number; barrels: number; hardHits: number; ballsInPlay: number;
      putouts: number; assists: number; fieldingErrors: number; totalChances: number;
    }

    const battingLineup: BatterLine[] = [];
    const positionOrder = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];

    let selectedBatters: { id: string; firstName: string; lastName: string; position: string; contact: number; power: number; speed: number; fielding: number }[] = [];
    const used = new Set<string>();

    const lineupPlayers = positionPlayers
      .filter(p => p.battingOrder != null && p.battingOrder >= 1 && p.battingOrder <= 9)
      .sort((a, b) => (a.battingOrder || 0) - (b.battingOrder || 0));

    if (lineupPlayers.length >= 7) {
      for (const p of lineupPlayers) {
        used.add(p.id);
        selectedBatters.push({
          id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position,
          contact: p.hitForAvg || 50, power: p.power || 50, speed: p.speed || 50, fielding: p.fielding || 50,
        });
      }
    } else {
      for (const pos of positionOrder) {
        const p = positionPlayers.find(pl => pl.position === pos && !used.has(pl.id));
        if (p) {
          used.add(p.id);
          selectedBatters.push({
            id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position,
            contact: p.hitForAvg || 50, power: p.power || 50, speed: p.speed || 50, fielding: p.fielding || 50,
          });
        }
      }
    }

    for (const p of positionPlayers) {
      if (selectedBatters.length >= 9) break;
      if (!used.has(p.id)) {
        used.add(p.id);
        selectedBatters.push({
          id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position === "P" ? "DH" : p.position,
          contact: p.hitForAvg || 50, power: p.power || 50, speed: p.speed || 50, fielding: p.fielding || 50,
        });
      }
    }
    if (selectedBatters.length < 9 && pitchers.length > 0) {
      const bp = pitchers[0];
      selectedBatters.push({
        id: bp.id, firstName: bp.firstName, lastName: bp.lastName, position: "P",
        contact: bp.hitForAvg || 25, power: bp.power || 20, speed: bp.speed || 40, fielding: bp.fielding || 50,
      });
    }
    while (selectedBatters.length < 9) {
      const fakeNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez"];
      const fakeFirst = ["Jake", "Mike", "Chris", "Tyler", "Matt", "Ryan", "Josh", "Nick", "Ben"];
      const idx = selectedBatters.length;
      selectedBatters.push({
        id: "fake_" + idx, firstName: fakeFirst[idx % fakeFirst.length],
        lastName: fakeNames[idx % fakeNames.length],
        position: positionOrder[idx] || "DH",
        contact: 50, power: 40, speed: 50, fielding: 50,
      });
    }

    const teamHits = Math.max(teamScore, Math.round(teamScore * 1.5 + Math.random() * 3 + 2));
    let hitsLeft = teamHits;
    let runsLeft = teamScore;
    let rbiLeft = teamScore;

    for (let i = 0; i < selectedBatters.length; i++) {
      const batter = selectedBatters[i];
      const lineupSlot = i;
      const ab = lineupSlot < 3 ? (3 + Math.floor(Math.random() * 2) + (Math.random() < 0.3 ? 1 : 0))
        : lineupSlot < 6 ? (3 + Math.floor(Math.random() * 2))
        : (2 + Math.floor(Math.random() * 2) + (Math.random() < 0.2 ? 1 : 0));

      const soChance = Math.max(0.12, 0.38 - batter.contact / 290);
      let so = 0;
      for (let j = 0; j < ab; j++) {
        if (Math.random() < soChance) so++;
      }

      const nonKAB = ab - so;
      const contactFactor = Math.min(0.46, Math.max(0.22, batter.contact / 210 + 0.04));
      let h = 0;
      if (i === selectedBatters.length - 1) {
        const maxLastBatterHits = Math.min(nonKAB, Math.ceil(nonKAB * contactFactor * 1.5));
        h = Math.min(maxLastBatterHits, Math.max(0, hitsLeft));
      } else {
        for (let j = 0; j < nonKAB; j++) {
          if (hitsLeft > 0 && Math.random() < contactFactor) { h++; hitsLeft--; }
        }
      }

      let doubles = 0, triples = 0, hr = 0;
      const powerFactor = batter.power / 100;
      // Park factor: high stadium rating boosts HR (hitter-friendly), low suppresses
      const stadiumHRMult = 1 + ((homeStadium ?? 5) - 5) * 0.04;
      // HR per hit: cubic curve aligns with play-by-play hrChance at same power levels.
      // Effective HR/AB ≈ rawHR × contactFactor: 99 Power ≈ 10%, 60 Power ≈ 2-4%, 30 Power < 1%.
      let rawHR = (0.28 * Math.pow(powerFactor, 3) + 0.005) * stadiumHRMult;
      let rawTriples = 0.006 * powerFactor + 0.005;
      let rawDoubles = 0.22 * powerFactor + 0.08;
      const rawTotal = rawHR + rawTriples + rawDoubles;
      const maxXBH = 0.55;
      if (rawTotal > maxXBH) {
        const scale = maxXBH / rawTotal;
        rawHR *= scale;
        rawTriples *= scale;
        rawDoubles *= scale;
      }
      for (let j = 0; j < h; j++) {
        const roll = Math.random();
        if (roll < rawHR) { hr++; }
        else if (roll < rawHR + rawTriples) { triples++; }
        else if (roll < rawHR + rawTriples + rawDoubles) { doubles++; }
      }

      const bbChance = 0.025 + (batter.contact / 950);
      let bb = 0;
      for (let j = 0; j < ab; j++) {
        if (Math.random() < bbChance) bb++;
      }

      const hbp = Math.random() < 0.03 ? 1 : 0;

      const speedFactor = batter.speed / 100;
      const sbChance = speedFactor * speedFactor * 0.35;
      const sb = Math.random() < sbChance ? (Math.random() < speedFactor * 0.35 ? 2 : 1) : 0;

      const cs = sb > 0 && Math.random() < 0.28 ? 1 : 0;

      const pwrPct = batter.power / 100;
      const baseExitVelo = 78 + pwrPct * 22;
      const exitVelo = Math.round((baseExitVelo + (Math.random() - 0.5) * 6) * 10) / 10;

      const bip = Math.max(0, ab - so);

      const barrelRate = 0.01 + Math.pow(pwrPct, 1.5) * 0.18;
      const barrelCount = Math.floor(bip * barrelRate + (Math.random() < 0.5 ? 1 : 0));

      const hardHitRate = 0.15 + pwrPct * 0.30;
      const hardHitCount = Math.max(barrelCount, Math.floor(bip * hardHitRate));

      const fieldingFactor = batter.fielding / 100;
      const poBase = batter.position === "1B" ? 8 : batter.position === "C" ? 6 : 
        ["LF","CF","RF"].includes(batter.position) ? 2 : 3;
      const putoutsCount = Math.max(0, Math.floor(poBase * (0.5 + fieldingFactor * 0.8) + (Math.random() - 0.5) * 2));
      const assistsCount = ["P","C","SS","2B","3B"].includes(batter.position) ? 
        Math.max(0, Math.floor(2 * (0.3 + fieldingFactor * 0.7) + (Math.random() - 0.5) * 2)) : 
        Math.random() < 0.15 ? 1 : 0;
      const feCount = Math.random() < (0.12 - fieldingFactor * 0.10) ? 1 : 0;
      const tcCount = putoutsCount + assistsCount + feCount;

      let r = 0;
      if (runsLeft > 0) {
        const runChance = h > 0 ? 0.35 : 0.15;
        if (Math.random() < runChance) { r = 1; runsLeft--; }
        if (hr > 0 && runsLeft > 0) { r = 1; runsLeft--; }
      }

      let rbi = 0;
      if (rbiLeft > 0 && (h > 0 || bb > 0)) {
        if (hr > 0) {
          rbi = Math.min(rbiLeft, 1 + Math.floor(Math.random() * 3));
        } else if (doubles > 0 || triples > 0) {
          rbi = Math.min(rbiLeft, 1 + (Math.random() < 0.3 ? 1 : 0));
        } else if (h > 0) {
          rbi = Math.min(rbiLeft, Math.random() < 0.35 ? 1 : 0);
        } else {
          rbi = Math.min(rbiLeft, Math.random() < 0.1 ? 1 : 0);
        }
        rbiLeft -= rbi;
      }

      const avg = ab > 0 ? (h / ab).toFixed(3) : ".000";

      battingLineup.push({
        name: `${batter.firstName[0]}. ${batter.lastName}`,
        position: batter.position,
        playerId: batter.id, ab, r, h, doubles, triples, hr, rbi, bb, hbp, so, sb, cs,
        exitVelo, barrels: barrelCount, hardHits: hardHitCount,
        ballsInPlay: bip, putouts: putoutsCount, assists: assistsCount,
        fieldingErrors: feCount, totalChances: tcCount,
        avg: avg.startsWith("0") ? avg.substring(1) : avg,
      });
    }

    if (runsLeft > 0) {
      const hitters = battingLineup.filter(b => b.h > 0);
      for (let i = 0; runsLeft > 0; i++) {
        const target = hitters.length > 0 ? hitters[i % hitters.length] : battingLineup[i % battingLineup.length];
        target.r++;
        runsLeft--;
      }
    }
    if (rbiLeft > 0) {
      const hitters = battingLineup.filter(b => b.h > 0);
      for (let i = 0; rbiLeft > 0; i++) {
        const target = hitters.length > 0 ? hitters[i % hitters.length] : battingLineup[i % battingLineup.length];
        target.rbi++;
        rbiLeft--;
      }
    }

    const totalR = battingLineup.reduce((s, b) => s + b.r, 0);
    if (totalR > teamScore) {
      let excess = totalR - teamScore;
      for (let i = battingLineup.length - 1; i >= 0 && excess > 0; i--) {
        const remove = Math.min(battingLineup[i].r, excess);
        battingLineup[i].r -= remove;
        excess -= remove;
      }
    }

    interface PitcherLine {
      name: string; playerId: string; ip: string; h: number; r: number; er: number;
      bb: number; so: number; hr: number; era: string;
      totalPitches: number; whiffs: number; spinRate: number;
    }

    const pitchingStaff: PitcherLine[] = [];
    let selectedPitchers: { id: string; firstName: string; lastName: string; control: number; velocity: number; stuff: number }[] = [];

    const gameTypeToRole: Record<string, string> = {
      "friday": "FRI", "saturday": "SAT", "sunday": "SUN", "midweek": "MID",
    };
    const starterRoles = ["FRI", "SAT", "SUN", "MID"];
    const relieverRoles = ["LRP", "MR", "MR1", "MR2", "MR3", "SU", "CP"];

    const targetRole = gameType ? gameTypeToRole[gameType] : null;
    let starter = targetRole
      ? pitchers.find(p => p.pitchingRole === targetRole)
      : null;
    if (!starter) {
      starter = pitchers.find(p => starterRoles.includes(p.pitchingRole || "")) || null;
    }
    const relievers = pitchers.filter(p => relieverRoles.includes(p.pitchingRole || ""));

    if (starter) {
      selectedPitchers.push({
        id: starter.id, firstName: starter.firstName, lastName: starter.lastName,
        control: starter.control || 50, velocity: starter.velocity || 50, stuff: starter.stuff || 50,
      });
      const numRelievers = Math.min(relievers.length, Math.floor(Math.random() * 3));
      for (let i = 0; i < numRelievers; i++) {
        selectedPitchers.push({
          id: relievers[i].id, firstName: relievers[i].firstName, lastName: relievers[i].lastName,
          control: relievers[i].control || 50, velocity: relievers[i].velocity || 50, stuff: relievers[i].stuff || 50,
        });
      }
    } else {
      const numPitchers = Math.min(Math.max(pitchers.length, 1), 1 + Math.floor(Math.random() * 3));
      for (let i = 0; i < numPitchers && i < pitchers.length; i++) {
        selectedPitchers.push({
          id: pitchers[i].id, firstName: pitchers[i].firstName, lastName: pitchers[i].lastName,
          control: pitchers[i].control || 50, velocity: pitchers[i].velocity || 50, stuff: pitchers[i].stuff || 50,
        });
      }
    }
    while (selectedPitchers.length === 0) {
      selectedPitchers.push({ id: "fake_p", firstName: "John", lastName: "Doe", control: 50, velocity: 50, stuff: 50 });
    }

    let inningsLeft = 9;
    const opponentScore = isHome ? awayScore : homeScore;
    let opponentRunsLeft = opponentScore;
    const opponentHitsTotal = Math.max(opponentScore, Math.round(opponentScore * 1.5 + Math.random() * 3 + 2));
    let opponentHitsLeft = opponentHitsTotal;
    let opponentHrLeft = Math.floor(opponentHitsTotal * 0.08 + Math.random() * 1.5);

    for (let i = 0; i < selectedPitchers.length; i++) {
      const pitcher = selectedPitchers[i];
      const isLast = i === selectedPitchers.length - 1;
      let fullInnings: number;
      if (isLast) {
        fullInnings = Math.max(1, inningsLeft);
      } else {
        fullInnings = Math.max(1, Math.floor(inningsLeft / (selectedPitchers.length - i)) + (Math.random() > 0.5 ? 1 : -1));
        fullInnings = Math.min(fullInnings, inningsLeft - (selectedPitchers.length - i - 1));
      }
      inningsLeft -= fullInnings;

      const outs = Math.floor(Math.random() * 3);
      const ipStr = outs > 0 ? `${fullInnings}.${outs}` : `${fullInnings}.0`;
      const ipDecimal = fullInnings + outs / 3;

      const controlFactor = pitcher.control / 100;
      const velocityFactor = pitcher.velocity / 100;
      const stuffFactor = pitcher.stuff / 100;

      let pHits: number;
      if (isLast) {
        pHits = Math.max(0, opponentHitsLeft);
      } else {
        const hitsPerInning = 1.15 - controlFactor * 0.25 - stuffFactor * 0.15;
        pHits = Math.max(0, Math.round(fullInnings * hitsPerInning + (Math.random() - 0.5) * 2));
        opponentHitsLeft -= pHits;
      }

      let pRuns: number;
      if (isLast) {
        pRuns = opponentRunsLeft;
      } else {
        const runFactor = 1.0 - (controlFactor + stuffFactor + velocityFactor) / 6;
        pRuns = Math.min(opponentRunsLeft, Math.floor(Math.random() * Math.max(1, Math.ceil(fullInnings * (0.3 + runFactor * 0.5)))));
        opponentRunsLeft -= pRuns;
      }

      const er = Math.max(0, pRuns - (Math.random() < 0.12 ? 1 : 0));

      const bbRate = Math.max(0.3, 5.0 - controlFactor * 4.5);
      const pBB = Math.max(0, Math.round(ipDecimal * bbRate / 9 + (Math.random() - 0.5)));

      const soRate = 3 + velocityFactor * 6 + stuffFactor * 5;
      const pSO = Math.max(0, Math.round(ipDecimal * soRate / 9 + (Math.random() - 0.5) * 2));

      let pHR: number;
      if (isLast) {
        pHR = Math.max(0, opponentHrLeft);
      } else {
        const hrPerInning = 0.08 + (1 - stuffFactor) * 0.12;
        pHR = 0;
        for (let inn = 0; inn < fullInnings && opponentHrLeft > 0; inn++) {
          if (Math.random() < hrPerInning) { pHR++; opponentHrLeft--; }
        }
      }

      const era = ipDecimal > 0 ? ((er * 9) / ipDecimal).toFixed(2) : "0.00";

      const pitchesPerInning = 14 + Math.floor((1 - controlFactor * 0.3) * 8 + Math.random() * 4);
      const totalPitchCount = Math.round(ipDecimal * pitchesPerInning);
      const whiffRate = 0.10 + velocityFactor * 0.18 + stuffFactor * 0.14;
      const whiffCount = Math.floor(totalPitchCount * whiffRate * 0.3);
      const baseSpinRate = 1700 + stuffFactor * 1000;
      const spinRateValue = Math.round(baseSpinRate + (Math.random() - 0.5) * 200);

      pitchingStaff.push({
        name: `${pitcher.firstName[0]}. ${pitcher.lastName}`,
        playerId: pitcher.id, ip: ipStr, h: pHits, r: pRuns, er, bb: pBB, so: pSO, hr: pHR, era,
        totalPitches: totalPitchCount, whiffs: whiffCount, spinRate: spinRateValue,
      });
    }

    const errors = Math.random() < 0.4 ? (Math.random() < 0.3 ? 2 : 1) : 0;

    const totals = {
      ab: battingLineup.reduce((s, b) => s + b.ab, 0),
      r: teamScore,
      h: battingLineup.reduce((s, b) => s + b.h, 0),
      doubles: battingLineup.reduce((s, b) => s + b.doubles, 0),
      triples: battingLineup.reduce((s, b) => s + b.triples, 0),
      hr: battingLineup.reduce((s, b) => s + b.hr, 0),
      rbi: battingLineup.reduce((s, b) => s + b.rbi, 0),
      bb: battingLineup.reduce((s, b) => s + b.bb, 0),
      hbp: battingLineup.reduce((s, b) => s + b.hbp, 0),
      so: battingLineup.reduce((s, b) => s + b.so, 0),
      sb: battingLineup.reduce((s, b) => s + b.sb, 0),
      cs: battingLineup.reduce((s, b) => s + b.cs, 0),
      exitVeloTotal: battingLineup.reduce((s, b) => s + b.exitVelo, 0),
      barrels: battingLineup.reduce((s, b) => s + b.barrels, 0),
      hardHits: battingLineup.reduce((s, b) => s + b.hardHits, 0),
      ballsInPlay: battingLineup.reduce((s, b) => s + b.ballsInPlay, 0),
      putouts: battingLineup.reduce((s, b) => s + b.putouts, 0),
      assists: battingLineup.reduce((s, b) => s + b.assists, 0),
      fieldingErrors: battingLineup.reduce((s, b) => s + b.fieldingErrors, 0),
      totalChances: battingLineup.reduce((s, b) => s + b.totalChances, 0),
    };

    return { batting: battingLineup, pitching: pitchingStaff, totals, errors };
  }

  const home = generateTeamStats(homePlayers, homeScore, true);
  const away = generateTeamStats(awayPlayers, awayScore, false);

  return { innings, home, away };
}

// accumulatePlayerStats and computeLegacyScore are now imported from game-engine.ts.

// ============ ALL-AMERICAN SELECTIONS COUNTER ============
// Returns a Map<teamId, selectionCount> counting All-American + All-Conference
// selections using the exact same positional slot logic as the Awards tab.
async function countAllAmericanSelectionsForLeague(leagueId: string): Promise<Map<string, number>> {
  const fieldingSlots = ["C", "1B", "2B", "SS", "3B", "OF", "OF", "OF"];
  const pitcherSlots = ["SP", "SP", "SP", "R", "CL"];
  const slots = [...fieldingSlots, ...pitcherSlots, "DH"];

  function selectTeamIds(pool: { id: string; overall: number; position: string; teamId: string }[]): string[] {
    const selected: string[] = [];
    const used = new Set<string>();
    const pitchers = pool.filter(p => p.position === "P").sort((a, b) => (b.overall || 0) - (a.overall || 0));
    let pIdx = 0;
    for (const slot of slots) {
      if (slot === "SP" || slot === "R" || slot === "CL") {
        while (pIdx < pitchers.length && used.has(pitchers[pIdx].id)) pIdx++;
        if (pIdx < pitchers.length) { used.add(pitchers[pIdx].id); selected.push(pitchers[pIdx].teamId); pIdx++; }
      } else if (slot === "DH") {
        const cands = pool.filter(p => p.position !== "P" && !used.has(p.id)).sort((a, b) => (b.overall || 0) - (a.overall || 0));
        if (cands.length > 0) { used.add(cands[0].id); selected.push(cands[0].teamId); }
      } else {
        const cands = pool.filter(p => p.position === slot && !used.has(p.id)).sort((a, b) => (b.overall || 0) - (a.overall || 0));
        if (cands.length > 0) { used.add(cands[0].id); selected.push(cands[0].teamId); }
      }
    }
    return selected;
  }

  const allTeams = await storage.getTeamsByLeague(leagueId);
  const allConfs = await storage.getConferencesByLeague(leagueId);
  const allPool: { id: string; overall: number; position: string; teamId: string }[] = [];
  for (const t of allTeams) {
    const roster = await storage.getPlayersByTeam(t.id);
    for (const p of roster) allPool.push({ id: p.id, overall: p.overall, position: p.position, teamId: p.teamId });
  }

  const teamCounts = new Map<string, number>();
  const inc = (tId: string) => teamCounts.set(tId, (teamCounts.get(tId) || 0) + 1);

  // All-American team (league-wide)
  for (const tId of selectTeamIds(allPool)) inc(tId);

  // All-Conference team per conference (matching Awards tab)
  for (const conf of allConfs) {
    const confTeamIds = new Set(allTeams.filter(t => t.conferenceId === conf.id).map(t => t.id));
    const confPool = allPool.filter(p => confTeamIds.has(p.teamId));
    for (const tId of selectTeamIds(confPool)) inc(tId);
  }

  return teamCounts;
}

// updateStandingsForGame is now imported from game-engine.ts.

// ============ CONFERENCE CHAMPIONSHIP GENERATION ============
async function generateConferenceChampionships(leagueId: string, season: number) {
  const confs = await storage.getConferencesByLeague(leagueId);
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  const standingsList = await storage.getStandingsByLeague(leagueId, season);

  // Idempotency: fetch existing CC games once and skip any conference that
  // already has a game to avoid duplicate championship games on retry.
  const allGames = await storage.getGamesByLeague(leagueId);
  const existingCCByConf = new Set<string>();
  for (const g of allGames) {
    if (g.phase === "conference_championship" && g.season === season) {
      const homeConf = leagueTeams.find(t => t.id === g.homeTeamId)?.conferenceId;
      if (homeConf) existingCCByConf.add(homeConf);
    }
  }

  for (const conf of confs) {
    // Skip if this conference already has a championship game for this season.
    if (existingCCByConf.has(conf.id)) continue;

    const confTeams = leagueTeams.filter(t => t.conferenceId === conf.id);
    if (confTeams.length < 2) continue;
    
    const confStandings = confTeams.map(t => {
      const s = standingsList.find(st => st.teamId === t.id);
      const confWins = s?.conferenceWins || 0;
      const confLosses = s?.conferenceLosses || 0;
      const confTotal = confWins + confLosses;
      const confWinPct = confTotal > 0 ? confWins / confTotal : 0;
      return { team: t, wins: s?.wins || 0, losses: s?.losses || 0, confWins, confLosses, confWinPct };
    }).sort((a, b) =>
      b.confWinPct - a.confWinPct ||
      (b.confWins - b.confLosses) - (a.confWins - a.confLosses) ||
      b.wins - a.wins ||
      // Stable final tiebreaker: team id (lexicographic) so concurrent
      // requests always produce identical home/away assignment.
      a.team.id.localeCompare(b.team.id)
    );

    // Use ON CONFLICT DO NOTHING so that concurrent advance requests (both
    // pass the existingCCByConf read-check simultaneously) produce exactly
    // one CC game per conference — the unique index idx_games_cc_league_season_home
    // enforces the DB-level constraint.
    await pool.query(
      `INSERT INTO games
         (id, league_id, season, week, home_team_id, away_team_id, phase,
          is_complete, is_conference, is_manually_reported)
       VALUES (gen_random_uuid(), $1, $2, 0, $3, $4, 'conference_championship',
               false, false, false)
       ON CONFLICT DO NOTHING`,
      [leagueId, season, confStandings[0].team.id, confStandings[1].team.id],
    );
  }
}

// ============ BRACKET SEEDING HELPERS ============

// Assigns seeds to bracket sides using standard NCAA interleaving.
// Seeds grouped in pairs: odd-numbered groups assign pos-0→A, pos-1→B;
// even-numbered groups assign pos-0→B, pos-1→A.
// Result: seeds 1,4,5,8,9,12 → A; seeds 2,3,6,7,10,11 → B (for 12 teams).
function getSideForSeed(seed: number, _n: number): string {
  const group = Math.ceil(seed / 2);
  const posInGroup = (seed - 1) % 2;
  return (group % 2 === 1) === (posInGroup === 0) ? "A" : "B";
}

// Build the canonical seeded team list used by both bracket generation and advancement.
// Conference champions (identified from completed conf_championship games) get seeds 1..numConfs,
// ordered by regular-season win%. Remaining teams are seeded by win% for positions numConfs+1..N.
function buildSeededTeams(
  leagueTeams: { id: string }[],
  standingsList: { teamId: string; wins: number; losses: number; runsScored: number }[],
  confChampionIds: Set<string>
) {
  const winPct = (w: number, l: number) => (w + l) > 0 ? w / (w + l) : 0;
  const withRecord = leagueTeams.map(t => {
    const s = standingsList.find(st => st.teamId === t.id);
    return { team: t as any, wins: s?.wins || 0, losses: s?.losses || 0, runsScored: s?.runsScored || 0 };
  }).sort((a, b) => {
    const pctDiff = winPct(b.wins, b.losses) - winPct(a.wins, a.losses);
    if (Math.abs(pctDiff) > 1e-9) return pctDiff;
    return b.runsScored - a.runsScored;
  });
  // Conf champions first (ordered by win%), then at-large (ordered by win%)
  const confChamps = withRecord.filter(t => confChampionIds.has(t.team.id));
  const atLarge  = withRecord.filter(t => !confChampionIds.has(t.team.id));
  return [...confChamps, ...atLarge];
}

// ============ SUPER REGIONAL BRACKET GENERATION (16-Team Double Elimination) ============
// #1 seed receives a WBR1 bye. All other seeds are paired highest-vs-lowest.
// bracketType="winners" / "losers" distinguishes WB and LB games.
// bracketRound encodes a shared "stage" so WB and LB games at the same stage
// are simulated together in one advance call:
//   Stage 1 (bracketRound=1): WBR1
//   Stage 2 (bracketRound=2): WBR2 + LBR1
//   Stage 3 (bracketRound=3): WBR3 + LBR2
//   Stage 4 (bracketRound=4): WBR4/WB Final + LBR3
//   Stage 5 (bracketRound=5): LBR4 crossover (LBR3 winners vs WBR3 losers)
//   Stage 6 (bracketRound=6): LBR5
//   Stage 7 (bracketRound=7): LBR6 (LBR5 winner vs WBR4 loser) → LB champion
//   Done: champion1 = WBR4 winner, champion2 = LBR6 winner → advance to CWS
async function generateSuperRegionalBracket(leagueId: string, season: number) {
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  const standingsList = await storage.getStandingsByLeague(leagueId, season);
  const allGames = await storage.getGamesByLeague(leagueId);

  const confChampGames = allGames.filter(
    g => g.phase === "conference_championship" && g.season === season && g.isComplete
  );
  const confChampionIds = new Set(confChampGames.map(g => getGameWinner(g)));
  const allSeeded = buildSeededTeams(leagueTeams, standingsList, confChampionIds);
  // SR field: take top 16 (conference champions first, then at-large by win%)
  // This prevents every team in a 149-team league entering the bracket.
  const seededTeams = allSeeded.slice(0, Math.min(16, allSeeded.length));
  const N = seededTeams.length;
  if (N < 2) return;

  // WBR1: pair seed 2 vs seed N, seed 3 vs seed (N-1), ... seed #1 gets bye.
  let lo = 2, hi = N;
  while (lo < hi) {
    await storage.createGame({
      leagueId, season, week: 0,
      homeTeamId: seededTeams[lo - 1].team.id,
      awayTeamId: seededTeams[hi - 1].team.id,
      phase: "super_regionals", bracketType: "winners", bracketRound: 1,
    });
    lo++; hi--;
  }
}

// Pair teams by bracket seeding: best vs worst, 2nd-best vs 2nd-worst, etc.
function bracketPair(teams: string[], getTeamSeed: (id: string) => number): [string, string][] {
  const sorted = [...teams].sort((a, b) => getTeamSeed(a) - getTeamSeed(b));
  const pairs: [string, string][] = [];
  let bpLo = 0, bpHi = sorted.length - 1;
  while (bpLo < bpHi) {
    pairs.push([sorted[bpLo], sorted[bpHi]]);
    bpLo++; bpHi--;
  }
  return pairs;
}

// Double-elimination state machine: inspects all completed SR games and creates
// next-stage games when the current stage is finished.
// Returns { done: true, champion1, champion2 } when WB champion and LB champion
// are both determined (they advance to the CWS best-of-3 as the two finalists).
async function processDoubleElim(
  leagueId: string,
  season: number,
  srGames: Game[],
  seededTeams: { team: { id: string } }[],
  getTeamSeed: (id: string) => number
): Promise<{ done: boolean; champion1?: string; champion2?: string }> {
  const wbG = (round: number) => srGames.filter(g => g.bracketType === "winners" && (g.bracketRound ?? 0) === round);
  const lbG = (round: number) => srGames.filter(g => g.bracketType === "losers"  && (g.bracketRound ?? 0) === round);
  // vacuously true for empty arrays — allows small brackets to skip empty stages
  const allDone = (gs: Game[]) => gs.every(g => g.isComplete);
  const exists  = (gs: Game[]) => gs.length > 0;

  // All existing SR games must be complete before we can advance.
  if (srGames.some(g => !g.isComplete)) return { done: false };

  // ── Stage 1 complete → create Stage 2 (WBR2 + LBR1) ──────────────────────
  const wb1 = wbG(1);
  if (exists(wb1) && allDone(wb1) && !exists(wbG(2)) && !exists(lbG(2))) {
    const wb1Winners = wb1.map(g => getGameWinner(g));
    const wb1Losers  = wb1.map(g => getGameLoser(g)).sort((a, b) => getTeamSeed(a) - getTeamSeed(b));
    const topSeed    = seededTeams[0].team.id;

    // WBR2: #1 seed + WBR1 winners, paired by bracket seeding
    const wbr2Teams = [topSeed, ...wb1Winners];
    for (const [a, b] of bracketPair(wbr2Teams, getTeamSeed)) {
      await storage.createGame({
        leagueId, season, week: 0, homeTeamId: a, awayTeamId: b,
        phase: "super_regionals", bracketType: "winners", bracketRound: 2,
      });
    }

    // LBR1: best-seeded WBR1 loser gets bye; rest pair up
    const lbr1Bye     = wb1Losers[0];
    const lbr1Playing = wb1Losers.slice(1);
    for (const [a, b] of bracketPair(lbr1Playing, getTeamSeed)) {
      await storage.createGame({
        leagueId, season, week: 0, homeTeamId: a, awayTeamId: b,
        phase: "super_regionals", bracketType: "losers", bracketRound: 2,
      });
    }
    void lbr1Bye; // bye team advances to LBR2 automatically (detected in Stage 3)
    return { done: false };
  }

  // ── Stage 2 complete → create Stage 3 (WBR3 + LBR2) ─────────────────────
  const wb2 = wbG(2);
  const lb1 = lbG(2);
  // allDone(lb1) is vacuously true when lb1=[] (small bracket: all WBR1 losers got LBR1 bye)
  if (exists(wb2) && allDone(wb2) && allDone(lb1) && !exists(wbG(3)) && !exists(lbG(3))) {
    // WBR3: WBR2 winners, paired by seeding (may produce 0 pairs for 3-team bracket)
    const wbr3Teams = wb2.map(g => getGameWinner(g));
    for (const [a, b] of bracketPair(wbr3Teams, getTeamSeed)) {
      await storage.createGame({
        leagueId, season, week: 0, homeTeamId: a, awayTeamId: b,
        phase: "super_regionals", bracketType: "winners", bracketRound: 3,
      });
    }

    // LBR2 crossover: LBR1 survivors (LBR1 winners + LBR1 bye) vs WBR2 losers
    const lbr1PlayedTeams = new Set([...lb1.flatMap(g => [g.homeTeamId, g.awayTeamId])]);
    const wb1ForLb = srGames.filter(g => g.bracketType === "winners" && (g.bracketRound ?? 0) === 1 && g.isComplete);
    const lbr1ByeTeam = wb1ForLb.map(g => getGameLoser(g)).find(id => !lbr1PlayedTeams.has(id));

    const lbr1Winners   = lb1.map(g => getGameWinner(g));
    const lbr1Survivors = (lbr1ByeTeam ? [...lbr1Winners, lbr1ByeTeam] : lbr1Winners)
      .sort((a, b) => getTeamSeed(a) - getTeamSeed(b));
    const wbr2Losers    = wb2.map(g => getGameLoser(g)).sort((a, b) => getTeamSeed(a) - getTeamSeed(b));

    // Crossover: best survivor vs worst WB loser, etc.
    for (let i = 0; i < lbr1Survivors.length && i < wbr2Losers.length; i++) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: lbr1Survivors[i],
        awayTeamId: wbr2Losers[wbr2Losers.length - 1 - i],
        phase: "super_regionals", bracketType: "losers", bracketRound: 3,
      });
    }
    return { done: false };
  }

  // ── Stage 3 complete → create Stage 4 (WBR4/WB Final + LBR3) ────────────
  // wb3 may be empty for small brackets (WBChamp already decided from WBR2)
  const wb3 = wbG(3);
  const lb2 = lbG(3);
  if (allDone(wb3) && exists(lb2) && allDone(lb2) && !exists(wbG(4)) && !exists(lbG(4))) {
    // WBR4 (WB Final): only created if wb3 has 2+ games producing 2 winners to match
    const wb3Winners = wb3.map(g => getGameWinner(g)).sort((a, b) => getTeamSeed(a) - getTeamSeed(b));
    if (wb3Winners.length >= 2) {
      const [wbFinA, wbFinB] = wb3Winners;
      await storage.createGame({
        leagueId, season, week: 0, homeTeamId: wbFinA, awayTeamId: wbFinB,
        phase: "super_regionals", bracketType: "winners", bracketRound: 4,
      });
    }
    // If wb3 is empty, WBChamp is already decided (wb2 winner); skip WBR4

    // LBR3: LBR2 winners, paired by seeding
    const lbr3Teams = lb2.map(g => getGameWinner(g));
    for (const [a, b] of bracketPair(lbr3Teams, getTeamSeed)) {
      await storage.createGame({
        leagueId, season, week: 0, homeTeamId: a, awayTeamId: b,
        phase: "super_regionals", bracketType: "losers", bracketRound: 4,
      });
    }
    return { done: false };
  }

  // ── Stage 4 complete → create Stage 5 (LBR4 crossover) ──────────────────
  // lb3 may be empty for small brackets (LBChamp decided from lb2 winner)
  const wb4 = wbG(4);
  const lb3 = lbG(4);
  if (allDone(wb4) && allDone(lb3) && !exists(lbG(5))) {
    // LBR4: LBR3 winners vs WBR3 losers (crossover) — skip if either side is empty
    const lb3Winners = lb3.map(g => getGameWinner(g)).sort((a, b) => getTeamSeed(a) - getTeamSeed(b));
    const wb3Losers  = wb3.map(g => getGameLoser(g)).sort((a, b) => getTeamSeed(a) - getTeamSeed(b));
    let lbr4Created = 0;
    for (let i = 0; i < lb3Winners.length && i < wb3Losers.length; i++) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: lb3Winners[i],
        awayTeamId: wb3Losers[wb3Losers.length - 1 - i],
        phase: "super_regionals", bracketType: "losers", bracketRound: 5,
      });
      lbr4Created++;
    }
    // Only return early if we created games; otherwise fall through to Grand Final setup
    if (lbr4Created > 0) return { done: false };
  }

  // ── Stage 5 complete → create Stage 6 (LBR5) ─────────────────────────────
  const lb4 = lbG(5);
  if (exists(lb4) && allDone(lb4) && !exists(lbG(6))) {
    const lb4Winners = lb4.map(g => getGameWinner(g)).sort((a, b) => getTeamSeed(a) - getTeamSeed(b));
    if (lb4Winners.length >= 2) {
      await storage.createGame({
        leagueId, season, week: 0, homeTeamId: lb4Winners[0], awayTeamId: lb4Winners[lb4Winners.length - 1],
        phase: "super_regionals", bracketType: "losers", bracketRound: 6,
      });
      return { done: false };
    }
    // Only 1 LBR4 winner → they are the LB champion; fall through to Grand Final setup
  }

  // ── Stage 6 complete → create Stage 7 (LBR6: LBR5 winner vs WBR4 loser) ──
  const lb5 = lbG(6);
  if (exists(lb5) && allDone(lb5) && exists(wb4) && allDone(wb4) && !exists(lbG(7))) {
    const lb5Winner = getGameWinner(lb5[0]);
    const wb4Loser  = getGameLoser(wb4[0]);
    await storage.createGame({
      leagueId, season, week: 0, homeTeamId: lb5Winner, awayTeamId: wb4Loser,
      phase: "super_regionals", bracketType: "losers", bracketRound: 7,
    });
    return { done: false };
  }

  // ── Both WB and LB complete → advance to CWS directly ───────────────────
  // No SR grand-final game is created.  WBChamp and LBChamp meet in the
  // CWS best-of-3 — that IS the grand final.
  const allWbGames = srGames.filter(g => g.bracketType === "winners");
  const allLbGames = srGames.filter(g => g.bracketType === "losers");
  if (exists(allWbGames) && exists(allLbGames) && allDone(allWbGames) && allDone(allLbGames)) {
    const wbLastRound = Math.max(...allWbGames.map(g => g.bracketRound ?? 0));
    const lbLastRound = Math.max(...allLbGames.map(g => g.bracketRound ?? 0));
    const wbFinalGame = allWbGames.find(g => (g.bracketRound ?? 0) === wbLastRound);
    const lbFinalGame = allLbGames.find(g => (g.bracketRound ?? 0) === lbLastRound);
    if (wbFinalGame && lbFinalGame) {
      const wbChamp = getGameWinner(wbFinalGame);
      const lbChamp = getGameWinner(lbFinalGame);
      if (wbChamp && lbChamp) {
        return { done: true, champion1: wbChamp, champion2: lbChamp };
      }
    }
  }

  return { done: false };
}

// ============ ADVANCE SUPER REGIONALS ============
async function advanceSuperRegionals(leagueId: string, season: number): Promise<{ done: boolean; champion1?: string; champion2?: string }> {
  const allGames = await storage.getGamesByLeague(leagueId);
  let srGames = allGames.filter(g => g.phase === "super_regionals" && g.season === season);
  const srTeams = await storage.getTeamsByLeague(leagueId);

  const standingsList = await storage.getStandingsByLeague(leagueId, season);
  const confChampGames = allGames.filter(
    g => g.phase === "conference_championship" && g.season === season && g.isComplete
  );
  const confChampionIds = new Set(confChampGames.map(g => getGameWinner(g)));
  const seededTeams = buildSeededTeams(srTeams, standingsList, confChampionIds);
  const getTeamSeed = (id: string) => {
    const idx = seededTeams.findIndex(t => t.team.id === id);
    return idx >= 0 ? idx + 1 : 999;
  };

  // Strip stale grand_final / grand_final_reset rows produced by old code paths.
  // WBChamp and LBChamp are now derived directly from the winners/losers bracket.
  const isBracketGame = (g: { bracketType?: string | null }) =>
    g.bracketType !== "grand_final" && g.bracketType !== "grand_final_reset";

  // Simulate the current stage (all incomplete games at the earliest bracketRound)
  const incompleteGames = srGames.filter(g => !g.isComplete && isBracketGame(g));
  if (incompleteGames.length > 0) {
    const minRound = Math.min(...incompleteGames.map(g => g.bracketRound ?? 0));
    const gamesToSimulate = incompleteGames.filter(g => (g.bracketRound ?? 0) === minRound);

    const postseasonRotation = ["friday", "saturday", "sunday"];
    const _srSimStart = Date.now();
    const srSimResults = await Promise.all(gamesToSimulate.map(async (game, gi) => {
      const psGameType = game.gameType || postseasonRotation[gi % 3];
      const result = await simulateGame(game.homeTeamId, game.awayTeamId, psGameType, undefined, undefined, game.week);
      return { game, result };
    }));
    await batchFinalizeGames(srSimResults, leagueId, season, new Map<string, CoachXpDelta>(), srTeams, undefined, { skipStandings: true, skipCoachXp: true });
    console.log(`[advance-perf] super-regionals-sim: ${Date.now() - _srSimStart}ms`);
  }

  // Re-fetch after simulation, then advance the double-elim state machine.
  // Filter out any stale grand_final/grand_final_reset rows before passing in.
  srGames = (await storage.getGamesByLeague(leagueId))
    .filter(g => g.phase === "super_regionals" && g.season === season);

  return processDoubleElim(leagueId, season, srGames.filter(isBracketGame), seededTeams, getTeamSeed);
}

function getGameWinner(game: Game): string {
  return (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.homeTeamId : game.awayTeamId;
}

function getGameLoser(game: Game): string {
  return (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.awayTeamId : game.homeTeamId;
}


// ============ ADVANCE CWS (BEST OF 3) ============
async function advanceCWS(leagueId: string, season: number): Promise<{ done: boolean; champion?: string; runnerUp?: string }> {
  const allGames = await storage.getGamesByLeague(leagueId);
  const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season);
  const cwsTeams = await storage.getTeamsByLeague(leagueId);
  
  const incompleteGames = cwsGames.filter(g => !g.isComplete);
  const cwsRotation = ["friday", "saturday", "sunday"];
  const _cwsSimStart = Date.now();
  // CWS results intentionally do NOT update standings — postseason games must not
  // mutate the regular-season win/loss records that bracket seeding depends on.
  const cwsSimResults = await Promise.all(incompleteGames.map(async (game, gi) => {
    const cwsGameType = game.gameType || cwsRotation[gi % 3];
    const result = await simulateGame(game.homeTeamId, game.awayTeamId, cwsGameType, undefined, undefined, game.week);
    return { game, result };
  }));
  await batchFinalizeGames(cwsSimResults, leagueId, season, new Map<string, CoachXpDelta>(), cwsTeams, undefined, { skipStandings: true, skipCoachXp: true });
  console.log(`[advance-perf] cws-sim: ${Date.now() - _cwsSimStart}ms`);
  
  const updatedGames = await storage.getGamesByLeague(leagueId);
  const completedCWS = updatedGames.filter(g => g.phase === "cws" && g.season === season && g.isComplete);
  
  const winsMap: Record<string, number> = {};
  let team1 = "", team2 = "";
  for (const g of completedCWS) {
    if (!team1) team1 = g.homeTeamId;
    if (!team2) team2 = g.homeTeamId === team1 ? g.awayTeamId : g.homeTeamId;
    const winner = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    winsMap[winner] = (winsMap[winner] || 0) + 1;
  }
  
  if ((winsMap[team1] || 0) >= 2) {
    return { done: true, champion: team1, runnerUp: team2 };
  }
  if ((winsMap[team2] || 0) >= 2) {
    return { done: true, champion: team2, runnerUp: team1 };
  }
  
  const gameNumber = completedCWS.length + 1;
  const homeTeam = gameNumber % 2 === 1 ? team1 : team2;
  const awayTeam = homeTeam === team1 ? team2 : team1;
  
  await storage.createGame({
    leagueId,
    season,
    week: 0,
    homeTeamId: homeTeam,
    awayTeamId: awayTeam,
    phase: "cws",
  });
  
  return { done: false };
}

// ============ SEASON TRANSITION FUNCTION ============

// ============ PLAYER PROGRESSION ============
function getOvrDeltaFromPotential(potential: number): number {
  const grade = getPotentialGrade(potential);
  switch (grade) {
    case "A+": return 40 + Math.floor(Math.random() * 11);
    case "A":  return 25 + Math.floor(Math.random() * 11);
    case "A-": return 20 + Math.floor(Math.random() * 11);
    case "B+": return 15 + Math.floor(Math.random() * 11);
    case "B":  return 10 + Math.floor(Math.random() * 11);
    case "B-": return 10 + Math.floor(Math.random() * 6);
    case "C+": return 3 + Math.floor(Math.random() * 6);
    case "C":  return -2 + Math.floor(Math.random() * 5);
    case "C-": return -5 + Math.floor(Math.random() * 6);
    case "D+": return -(5 + Math.floor(Math.random() * 6));
    case "D":  return -(10 + Math.floor(Math.random() * 11));
    case "D-": return -(15 + Math.floor(Math.random() * 11));
    case "F":  return -(25 + Math.floor(Math.random() * 16));
    default:   return 0;
  }
}

async function applyPlayerProgression(leagueId: string) {
  const league = await storage.getLeague(leagueId);
  const teams = await storage.getTeamsByLeague(leagueId);

  // Hard guard: when progression is off, make zero database writes — no attribute
  // changes, no progressionDeltas cleared or set for any player of any eligibility.
  // This is the only gate; nothing below runs when progressionEnabled = false.
  // Single league-wide query instead of N per-team queries — critical for 149-team leagues
  // with 3,700+ players. Group into per-team arrays via Map for O(1) roster lookup below.
  const allPlayersLeague = await storage.getPlayersByLeague(leagueId);
  const _playersByTeamId = new Map<string, typeof allPlayersLeague>();
  for (const p of allPlayersLeague) {
    const arr = _playersByTeamId.get(p.teamId) ?? [];
    arr.push(p);
    _playersByTeamId.set(p.teamId, arr);
  }
  const allRosters = teams.map(t => _playersByTeamId.get(t.id) ?? []);
  const totalPlayerCount = allPlayersLeague.length;
  console.log(`[progression-guard] League ${leagueId} — progressionEnabled=${league?.progressionEnabled ?? false}, ${totalPlayerCount} players across ${teams.length} teams`);
  if (!league?.progressionEnabled) return { progressed: 0 };

  // ── V3 migration (must run BEFORE the legacy loop) ──────────────────────────
  // Promote any V1 players to V3 FIRST so the legacy loop below sees them as V3
  // and skips them. Without this, a V1 player would go through the legacy loop,
  // then get migrated, then get processed again by the V3 engine — double
  // progression in a single offseason.
  const v1PreCount = allPlayersLeague.filter(p => (p.developmentModelVersion ?? 1) !== 3).length;
  if (v1PreCount > 0) {
    console.log(`[v3-migrate] Promoting ${v1PreCount} V1 players to V3 in league ${leagueId}…`);
    const migResult = await migrateLeagueToV3(storage as any, leagueId, allPlayersLeague);
    console.log(`[v3-migrate] Done — migrated=${migResult.migrated} skipped=${migResult.skipped} errors=${migResult.errors}`);
    // Re-fetch updated players so the legacy loop + V3 engine both see the
    // updated developmentModelVersion = 3 flag.
    const refreshed = await storage.getPlayersByLeague(leagueId);
    allPlayersLeague.length = 0;
    for (const p of refreshed) allPlayersLeague.push(p);
    // Rebuild team roster index with fresh data
    for (const [, arr] of _playersByTeamId) arr.length = 0;
    for (const p of allPlayersLeague) {
      const arr = _playersByTeamId.get(p.teamId) ?? [];
      arr.push(p);
      _playersByTeamId.set(p.teamId, arr);
    }
    for (let i = 0; i < teams.length; i++) {
      allRosters[i] = _playersByTeamId.get(teams[i].id) ?? [];
    }
  }

  let progressed = 0;

  // trajectory is intentionally excluded — it is a hit-type profile, not a developable skill,
  // and must not be changed by the progression system.
  const attrFields = [
    "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
    "velocity", "control", "stamina", "stuff",
  ] as const;
  const commonFields = [
    "clutch", "vsLHP", "grit", "stealing", "running", "throwing",
    "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
  ] as const;

  const gradeStats: Record<string, { count: number; totalDelta: number; gainers: number; decliners: number }> = {};

  // Batch containers: compute all progression in memory, then write in parallel chunks
  // to avoid N sequential DB round-trips (critical for large full-season leagues with 3,700+ players).
  const progressionWrites: Array<{ id: string; updates: Record<string, any> }> = [];
  const ovrStatWrites: Array<{ playerId: string; ovr: number }> = [];
  const seniorClears: string[] = [];

  for (let ti = 0; ti < teams.length; ti++) {
    const team = teams[ti];
    const roster = allRosters[ti]; // reuse pre-fetched roster — no extra DB round-trip per team
    for (const player of roster) {
      // V3 players are handled by the V3 engine after this loop — skip here
      if ((player as any).developmentModelVersion === 3) continue;
      if (player.potential == null) continue;

      // Seniors graduate without a progression delta — collect for batch clear
      if ((player as any).eligibility === "SR") {
        if ((player as any).progressionDeltas != null) {
          seniorClears.push(player.id);
        }
        continue;
      }

      const targetOvrDelta = getOvrDeltaFromPotential(player.potential);

      // Growth is driven purely by potential (via getOvrDeltaFromPotential) and team
      // facilities. No coach abilities, archetypes, badges, philosophies, skill-tree
      // levels, or player intangibles (workEthicScore / coachability) affect this value.
      // Facilities development rate: elite training facilities accelerate player growth.
      // Facilities 7+ → +5-15% to positive deltas; no effect on decline.
      const facilitiesDevelMult = targetOvrDelta >= 0
        ? (team.facilities >= 9 ? 1.15 : team.facilities >= 8 ? 1.10 : team.facilities >= 7 ? 1.05 : 1.0)
        : 1.0;
      const scaledDelta = targetOvrDelta * facilitiesDevelMult;

      // Baseline OVR computed from current attributes (before any updates).
      // Using this instead of player.overall for the delta eliminates formula-drift
      // contamination — if weights changed since the last save, the baseline
      // correctly reflects what the current formula would produce for these attrs.
      const baselineOvr = calculateOVR(player as any);

      const updates: Record<string, any> = {};
      const deltas: Record<string, number> = {};

      const presentAttrFields = attrFields.filter(f => (player as any)[f] != null);
      const presentCommonFields = commonFields.filter(f => (player as any)[f] != null);
      const totalFields = presentAttrFields.length + presentCommonFields.length;
      if (totalFields === 0) continue;

      // Divide by 5 (not 10) to produce per-attribute deltas that, when passed through
      // the weighted OVR formula (pitchers: core×0.85 + field×0.20 + common×0.25;
      // hitters: hitCore×0.75 + hitCommon×0.22), actually produce OVR changes close to
      // the targetOvrDelta from getOvrDeltaFromPotential().
      //
      // Old divisor of 10 was calibrated as if OVR = simple average of all attributes,
      // but the real formula weights attrs differently and excludes irrelevant attrs per
      // position (e.g. velocity/control don't count for hitter OVR). At divisor 10,
      // A+ players only gained ~22 OVR/season instead of the intended 40-50.
      const targetAvgAttrDelta = scaledDelta / 5;

      const rawAttrDeltas: number[] = [];
      for (const attr of presentAttrFields) {
        rawAttrDeltas.push(targetAvgAttrDelta + (Math.random() - 0.5) * 3);
      }
      if (rawAttrDeltas.length > 0) {
        const rawAvg = rawAttrDeltas.reduce((s, d) => s + d, 0) / rawAttrDeltas.length;
        const correction = targetAvgAttrDelta - rawAvg;
        for (let k = 0; k < rawAttrDeltas.length; k++) {
          rawAttrDeltas[k] += correction;
        }
      }

      for (let k = 0; k < presentAttrFields.length; k++) {
        const attr = presentAttrFields[k];
        const val = (player as any)[attr] as number;
        const delta = Math.round(rawAttrDeltas[k]);
        const newVal = Math.max(1, Math.min(100, val + delta));
        updates[attr] = newVal;
        const actualDelta = newVal - val;
        if (actualDelta !== 0) deltas[attr] = actualDelta;
      }

      for (const attr of presentCommonFields) {
        const val = (player as any)[attr] as number;
        // Halve noise for improving players — reduces the chance a capped attr's
        // small negative variance drags OVR below baseline for A/B potential players.
        const variance = (Math.random() - 0.5) * (targetOvrDelta > 0 ? 1.5 : 3);
        const delta = Math.round(targetAvgAttrDelta * 0.8 + variance);
        const newVal = Math.max(1, Math.min(100, val + delta));
        updates[attr] = newVal;
        const actualDelta = newVal - val;
        if (actualDelta !== 0) deltas[attr] = actualDelta;
      }

      const updatedPlayerData = { ...player } as any;
      for (const [key, val] of Object.entries(updates)) {
        updatedPlayerData[key] = val;
      }
      const rawNewOverall = calculateOVR(updatedPlayerData);

      // Apply OVR floor based on potential grade.
      // A/B grades: OVR must never drop (design intent: positive potential = positive growth).
      // C+: allow at most a 2-point drop (plateau zone, tiny regression ok).
      const potGradeForFloor = getPotentialGrade(player.potential);
      let newOverall = rawNewOverall;
      if (["A+", "A", "A-", "B+", "B", "B-"].includes(potGradeForFloor)) {
        newOverall = Math.max(baselineOvr, rawNewOverall);
      } else if (potGradeForFloor === "C+") {
        newOverall = Math.max(baselineOvr - 2, rawNewOverall);
      }

      updates["overall"] = newOverall;
      // Delta relative to baseline (not stored overall) — eliminates formula-drift noise.
      const ovrDelta = newOverall - baselineOvr;
      if (ovrDelta !== 0) deltas["overall"] = ovrDelta;

      updates["starRating"] = getStarRatingFromOVR(newOverall);
      updates["progressionDeltas"] = Object.keys(deltas).length > 0 ? deltas : null;

      progressionWrites.push({ id: player.id, updates });
      progressed++;

      if (newOverall) {
        ovrStatWrites.push({ playerId: player.id, ovr: newOverall });
      }

      // Accumulate per-potential-grade OVR changes for the verification summary log.
      const potGrade = getPotentialGrade(player.potential);
      if (!gradeStats[potGrade]) gradeStats[potGrade] = { count: 0, totalDelta: 0, gainers: 0, decliners: 0 };
      gradeStats[potGrade].count++;
      gradeStats[potGrade].totalDelta += ovrDelta;
      if (ovrDelta > 0) gradeStats[potGrade].gainers++;
      else if (ovrDelta < 0) gradeStats[potGrade].decliners++;
    }
  }

  // Write all updates in parallel chunks of 50 — avoids sequential round-trips while
  // keeping chunk size small enough not to overwhelm the DB connection pool.
  const PROG_CHUNK = 50;
  for (let i = 0; i < seniorClears.length; i += PROG_CHUNK) {
    await Promise.all(seniorClears.slice(i, i + PROG_CHUNK).map(id =>
      storage.updatePlayer(id, { progressionDeltas: null } as any)
    ));
  }
  for (let i = 0; i < progressionWrites.length; i += PROG_CHUNK) {
    await Promise.all(progressionWrites.slice(i, i + PROG_CHUNK).map(u =>
      storage.updatePlayer(u.id, u.updates)
    ));
  }
  for (let i = 0; i < ovrStatWrites.length; i += PROG_CHUNK) {
    await Promise.all(ovrStatWrites.slice(i, i + PROG_CHUNK).map(u =>
      storage.setPlayerSeasonStatsOvr(u.playerId, leagueId, league!.currentSeason, u.ovr)
    ));
  }

  // ── V3 engine ──────────────────────────────────────────────────────────
  // Migration already ran at the top of this function (before the legacy loop)
  // so allPlayersLeague is already fully V3 at this point.
  // Run V3 archetype-aware development for any players with developmentModelVersion=3.
  const v3Result = await runV3SeasonDevelopment(
    storage as any,
    leagueId,
    league?.currentSeason ?? 1,
    teams,
    allPlayersLeague,
  );
  if (v3Result.progressed > 0) {
    console.log(`[progression-v3] ${v3Result.progressed} players developed, ${v3Result.skipped} skipped, ${v3Result.errors} errors`);
    progressed += v3Result.progressed;
  }

  // Log a verification summary so it's easy to confirm potential tiers are differentiated.
  const gradeOrder = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
  const summaryLines = gradeOrder
    .filter(g => gradeStats[g]?.count > 0)
    .map(g => {
      const s = gradeStats[g];
      const avg = (s.totalDelta / s.count).toFixed(1);
      return `${g}: n=${s.count} avgOVR=${Number(avg) > 0 ? "+" : ""}${avg} (↑${s.gainers} ↓${s.decliners})`;
    });
  console.log(`[Progression] League ${leagueId} — per-grade OVR summary:\n  ${summaryLines.join("\n  ")}`);

  return { progressed };
}

// ============ PROMISE EVALUATION ============
async function runCpuTransferPortalRecruiting(leagueId: string) {
  const teams = await storage.getTeamsByLeague(leagueId);
  // Auto-pilot human teams behave like CPU for transfer portal recruiting too
  const cpuTeams = teams.filter(t => t.isCpu || t.isAutoPilot);
  
  // Get all transfer portal players
  const allPlayers: any[] = [];
  for (const team of teams) {
    const roster = await storage.getPlayersByTeam(team.id);
    const portalPlayers = roster.filter(p => p.inTransferPortal);
    allPlayers.push(...portalPlayers.map(p => ({ ...p, currentTeam: team })));
  }
  
  if (allPlayers.length === 0 || cpuTeams.length === 0) return;
  
  // Each CPU team tries to sign 0-2 transfer portal players per round
  for (const team of cpuTeams) {
    const signsThisRound = Math.floor(Math.random() * 3); // 0, 1, or 2
    if (signsThisRound === 0) continue;
    
    const roster = await storage.getPlayersByTeam(team.id);
    const positionCounts: Record<string, number> = {};
    for (const p of roster) {
      positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
    }
    
    // Find portal players from other teams, sorted by group need + OVR
    const candidates = allPlayers
      .filter(p => p.currentTeam.id !== team.id && p.inTransferPortal)
      .map(p => ({
        player: p,
        score: rosterGroupNeedBonus(p.position, positionCounts) + (p.overall || 300) / 100 + Math.random() * 5,
      }))
      .sort((a, b) => b.score - a.score);
    
    for (let i = 0; i < Math.min(signsThisRound, candidates.length); i++) {
      const { player } = candidates[i];
      // Transfer player to CPU team
      await storage.updatePlayer(player.id, {
        teamId: team.id,
        inTransferPortal: false,
      });
      // Remove from allPlayers so another team can't sign them
      const idx = allPlayers.findIndex(p => p.id === player.id);
      if (idx >= 0) allPlayers.splice(idx, 1);
    }
  }
}

const walkonFirstNames = ["James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles","Christopher","Daniel","Matthew","Anthony","Mark","Donald","Steven","Paul","Andrew","Joshua","Kenneth","Kevin","Brian","George","Timothy","Ronald","Edward","Jason","Jeffrey","Ryan","Jacob","Gary","Nicholas","Eric","Jonathan","Patrick","Tyler","Brandon","Justin","Ethan","Nathan","Connor","Mason","Caleb","Dylan","Austin","Hunter","Chase","Logan","Cole"];
const walkonLastNames = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Hill","Green","Adams","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts","Gomez","Phillips","Evans"];

async function generateWalkonPool(leagueId: string) {
  await storage.deleteWalkonsByLeague(leagueId);
  
  const allRecruits = await storage.getRecruitsByLeague(leagueId);
  const unsignedRecruits = allRecruits.filter(r => !r.signedTeamId);
  
  for (const recruit of unsignedRecruits) {
    await storage.createWalkon({
      leagueId,
      firstName: recruit.firstName,
      lastName: recruit.lastName,
      position: recruit.position,
      throwHand: recruit.throwHand || "R",
      batHand: recruit.batHand || "R",
      homeState: recruit.homeState,
      hometown: recruit.hometown,
      eligibility: recruit.recruitYear || "FR",
      overall: recruit.overall,
      starRating: recruit.starRating,
      hitForAvg: recruit.hitForAvg ?? 50,
      power: recruit.power ?? 50,
      speed: recruit.speed ?? 50,
      arm: recruit.arm ?? 50,
      fielding: recruit.fielding ?? 50,
      errorResistance: recruit.errorResistance ?? 50,
      clutch: recruit.clutch ?? 50,
      vsLHP: recruit.vsLHP ?? 50,
      grit: recruit.grit ?? 50,
      stealing: recruit.stealing ?? 50,
      running: recruit.running ?? 50,
      throwing: recruit.throwing ?? 50,
      recovery: recruit.recovery ?? 50,
      catcherAbility: recruit.catcherAbility ?? 50,
      velocity: recruit.velocity ?? 50,
      control: recruit.control ?? 50,
      stamina: recruit.stamina ?? 50,
      stuff: recruit.stuff ?? 50,
      wRISP: recruit.wRISP ?? 50,
      vsLefty: recruit.vsLefty ?? 50,
      poise: recruit.poise ?? 50,
      heater: recruit.heater ?? 50,
      agile: recruit.agile ?? 50,
      abilities: recruit.abilities || [],
      potential: recruit.potential ?? null,
      isGenerated: false,
      sourceRecruitId: recruit.id,
      skinTone: recruit.skinTone || "light",
      hairColor: recruit.hairColor || "brown",
      hairStyle: recruit.hairStyle || "short",
      headwear: recruit.headwear || "cap",
    });
  }
  
  // Use "OF" for all outfield fillers — it matches the position stored on real roster
  // players and on CPU-signed recruits.  "LF"/"CF"/"RF" would be invisible to both the
  // roster validator (OUTFIELD_POSITIONS = {"OF","LF","CF","RF"}) and the bidder which
  // now looks for "OF".  We generate 3× as many "OF" fillers to match the previous
  // total pool depth (was 3 separate positions × TARGET_PER_POS each).
  const positionsToFill = ["P", "C", "1B", "2B", "SS", "3B", "OF"];
  const pool = await storage.getWalkonsByLeague(leagueId);
  const posCounts: Record<string, number> = {};
  for (const p of pool) {
    // Count LF/CF/RF under "OF" for compatibility with older pool entries
    const normPos = ["LF", "CF", "RF"].includes(p.position) ? "OF" : p.position;
    posCounts[normPos] = (posCounts[normPos] || 0) + 1;
  }
  
  // Scale filler per position to league size. Formula: max(4, round(12 × (recruitCount / 80))).
  const allLeagueTeamsWo = await storage.getTeamsByLeague(leagueId);
  const _walkonLeague = await storage.getLeague(leagueId);
  const expectedRecruitCount = getRecruitPoolSize(allLeagueTeamsWo.length, _walkonLeague?.dynastyPreset);
  const TARGET_PER_POS = Math.max(4, Math.round(12 * (expectedRecruitCount / 80)));
  // OF gets 3× the base target to compensate for collapsing LF/CF/RF into one slot.
  const targetForPos = (pos: string) => pos === "OF" ? TARGET_PER_POS * 3 : TARGET_PER_POS;
  const fillerStates = ["TX", "CA", "FL", "GA", "NC", "AL", "SC", "LA", "AZ", "OH"];
  const fillerTowns = ["Springfield", "Franklin", "Clinton", "Madison", "Georgetown", "Salem", "Greenville", "Bristol", "Fairview", "Chester"];
  
  // College Life walk-on quality: high-CL programs attract more walk-ons who actually WANT
  // to be there — the campus experience draws better athletes even without scholarships.
  const leagueTeamsForCL = allLeagueTeamsWo;
  const avgLeagueCL = leagueTeamsForCL.length > 0
    ? leagueTeamsForCL.reduce((s, t) => s + (t.collegeLife || 5), 0) / leagueTeamsForCL.length
    : 5;
  // At avg CL 7+, filler walk-ons have a slightly better attribute floor (24–50 vs 20–46)
  const walkonAttrFloor = avgLeagueCL >= 7 ? 24 : 20;
  const walkonAttrRange = avgLeagueCL >= 7 ? 27 : 26;

  for (const pos of positionsToFill) {
    const current = posCounts[pos] || 0;
    const needed = Math.max(0, targetForPos(pos) - current);
    
    for (let i = 0; i < needed; i++) {
      const isPitcher = pos === "P";
      const randAttr = () => walkonAttrFloor + Math.floor(Math.random() * walkonAttrRange);
      const attrs: any = {
        position: pos,
        hitForAvg: randAttr(), power: randAttr(), speed: sampleNormalSpeed(),
        arm: randAttr(), fielding: randAttr(), errorResistance: randAttr(),
        clutch: randAttr(), vsLHP: randAttr(), grit: randAttr(),
        stealing: randAttr(), running: randAttr(), throwing: randAttr(),
        recovery: randAttr(), catcherAbility: pos === "C" ? randAttr() : 20,
        velocity: isPitcher ? randAttr() : 20, control: isPitcher ? randAttr() : 20,
        stamina: isPitcher ? randAttr() : 20, stuff: isPitcher ? randAttr() : 20,
        wRISP: randAttr(), vsLefty: randAttr(), poise: randAttr(),
        heater: randAttr(), agile: randAttr(),
        abilities: [],
      };
      
      const overall = calculateOVR(attrs);
      const starRating = getStarRatingFromOVR(overall);
      const firstName = walkonFirstNames[Math.floor(Math.random() * walkonFirstNames.length)];
      const lastName = walkonLastNames[Math.floor(Math.random() * walkonLastNames.length)];
      const homeState = fillerStates[Math.floor(Math.random() * fillerStates.length)];
      const hometown = fillerTowns[Math.floor(Math.random() * fillerTowns.length)];
      
      const potential = 50 + Math.floor(Math.random() * 24);
      
      await storage.createWalkon({
        leagueId,
        firstName,
        lastName,
        position: pos,
        ...pickHandedness(pos),
        homeState,
        hometown,
        eligibility: "FR",
        overall,
        starRating,
        ...attrs,
        potential,
        isGenerated: true,
        skinTone: ["light", "medium", "dark", "tan"][Math.floor(Math.random() * 4)],
        hairColor: ["brown", "black", "blonde", "red"][Math.floor(Math.random() * 4)],
        hairStyle: ["short", "buzz", "medium"][Math.floor(Math.random() * 3)],
        headwear: "cap",
      });
    }
  }
}

// Place bids for a team (used by both CPU-only and fast-forward paths).
// difficultyMult controls the randomness ceiling for bid amounts:
//   beginner=0.3, high_school=0.7, all_american=1.2, elite=2.0
async function placeCpuWalkonBids(
  leagueId: string,
  team: { id: string; name: string; nilBudget: number; nilSpent: number },
  difficultyMult: number,
) {
  const roster = await storage.getPlayersByTeam(team.id);
  const positionCounts: Record<string, number> = {};
  for (const p of roster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;

  const slotsNeeded = Math.max(0, 25 - roster.length);
  if (slotsNeeded === 0) return;

  const pool = await storage.getWalkonsByLeague(leagueId);
  // Use "OF" (not LF/CF/RF) — walk-on pool fillers are generated as "OF" and
  // CPU-signed recruits converted to players also carry "OF" from the recruit generator.
  const allPositions = ["P", "C", "1B", "2B", "SS", "3B", "OF"];
  // Build list of (walkon, positionPriority) sorted by group need then OVR
  const desired: (typeof pool)[number][] = [];
  const usedIds = new Set<string>();

  for (let pass = 0; pass < slotsNeeded; pass++) {
    // Sort positions by group need bonus (descending) so the most under-staffed
    // group is always filled first.  Falls back to raw count as secondary sort.
    const posNeeds = allPositions
      .map(pos => ({ pos, need: rosterGroupNeedBonus(pos, positionCounts), count: positionCounts[pos] || 0 }))
      .sort((a, b) => b.need !== a.need ? b.need - a.need : a.count - b.count);
    let picked = false;
    for (const need of posNeeds) {
      const candidates = pool
        .filter(w => {
          // Treat LF/CF/RF walk-ons as "OF" for matching purposes
          const wp = ["LF", "CF", "RF"].includes(w.position) ? "OF" : w.position;
          return wp === need.pos && !usedIds.has(w.id);
        })
        .sort((a, b) => (b.overall || 0) - (a.overall || 0));
      if (candidates.length > 0) {
        desired.push(candidates[0]);
        usedIds.add(candidates[0].id);
        // Track under the canonical position ("OF") so the need score stays accurate
        const trackPos = ["LF", "CF", "RF"].includes(candidates[0].position) ? "OF" : candidates[0].position;
        positionCounts[trackPos] = (positionCounts[trackPos] || 0) + 1;
        picked = true;
        break;
      }
    }
    if (!picked) {
      const fallback = pool.filter(w => !usedIds.has(w.id)).sort((a, b) => (b.overall || 0) - (a.overall || 0));
      if (fallback.length > 0) {
        desired.push(fallback[0]);
        usedIds.add(fallback[0].id);
        const trackPos = ["LF", "CF", "RF"].includes(fallback[0].position) ? "OF" : fallback[0].position;
        positionCounts[trackPos] = (positionCounts[trackPos] || 0) + 1;
      } else {
        break;
      }
    }
  }

  // Place bids — compute bid amounts based on OVR and difficulty.
  // bid = random value in [floor, floor + floor*difficultyMult], then clamped
  // to min(40% remainingNil, remainingNil).
  // Note: when 40% of remainingNil < floor, the cap dominates and the bid
  // can fall below the OVR-based floor — this is intentional (CPU won't
  // overcommit its budget just to meet a floor).
  let remainingNil = team.nilBudget - team.nilSpent;
  for (const walkon of desired) {
    if (remainingNil <= 0) break;
    const ovr = walkon.overall || 200;
    const floor = Math.max(5000, ovr * 400);
    const spread = floor * difficultyMult;
    const raw = floor + Math.floor(Math.random() * spread);
    const cap = Math.floor(remainingNil * 0.40);
    const bidAmount = Math.min(raw, cap, remainingNil);
    if (bidAmount <= 0) continue;
    try {
      await storage.upsertWalkonBid(leagueId, walkon.id, team.id, bidAmount);
      remainingNil -= bidAmount;
    } catch (e) {
      console.error(`[CPU bid] Failed to place bid for team ${team.id} on walkon ${walkon.id}:`, e);
    }
  }
}

async function processAllTeamWalkons(leagueId: string) {
  const teams = await storage.getTeamsByLeague(leagueId);
  const MAX_ROSTER = 25;
  const currentLeagueData = await storage.getLeague(leagueId);
  const currentSeason = currentLeagueData?.currentSeason || 1;
  const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };
  const difficulty = currentLeagueData?.cpuDifficulty || "high_school";
  // Elite walk-on bid multiplier reduced 2.0→1.3: CPU should win bids via position-gap targeting,
  // not by throwing money indiscriminately. All_American also slightly reduced for consistency.
  const difficultyMults: Record<string, number> = { beginner: 0.3, high_school: 0.7, all_american: 1.0, elite: 1.3 };
  const diffMult = difficultyMults[difficulty] ?? 0.7;

  const allCoachesWo = await storage.getCoachesByLeague(leagueId);

  // rosterStrategy position priority maps
  // Players in "keep" positions are last to be cut; others are cut first.
  const rosterStrategyKeepPositions: Record<string, string[]> = {
    pitching_first: ["P"],
    contact_hitting: ["SS", "2B", "OF", "C"],
    power_hitting: ["1B", "3B", "OF", "DH"],
    speed_defense: ["CF", "OF", "SS", "2B"],
    balanced: [],
  };

  // Clear any previous bids for this league
  await storage.deleteWalkonBidsByLeague(leagueId);

  for (const team of teams) {
    let roster = await storage.getPlayersByTeam(team.id);
    const teamCoachWo = allCoachesWo.find(c => c.teamId === team.id);
    const rosterStrat = (teamCoachWo as any)?.rosterStrategy ?? "balanced";
    const keepPositions = rosterStrategyKeepPositions[rosterStrat] || [];

    // Cut over-limit players (all teams in fast-forward)
    if (roster.length > MAX_ROSTER) {
      const posCounts: Record<string, number> = {};
      for (const p of roster) posCounts[p.position] = (posCounts[p.position] || 0) + 1;
      // Sort: players in keep positions are cut last; among others, cut weakest overall first
      const cuttable = roster.filter(p => (posCounts[p.position] || 0) > 1)
        .sort((a, b) => {
          const aKeep = keepPositions.includes(a.position) ? 1 : 0;
          const bKeep = keepPositions.includes(b.position) ? 1 : 0;
          if (aKeep !== bKeep) return aKeep - bKeep; // non-keep positions cut first
          return (a.overall || 0) - (b.overall || 0); // weakest first within same priority
        });
      let toCut = roster.length - MAX_ROSTER;
      for (const player of cuttable) {
        if (toCut <= 0) break;
        if ((posCounts[player.position] || 0) > 1) {
          await storage.createPlayerHistory({
            leagueId, teamId: team.id,
            firstName: player.firstName, lastName: player.lastName,
            position: player.position, finalEligibility: player.eligibility,
            overall: player.overall, starRating: player.starRating,
            signingOvr: player.signingOvr ?? player.overall, departureType: "cut_juco",
            ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
            departedSeason: currentSeason, seasonsPlayed: eligMap[player.eligibility] || 1,
            abilities: player.abilities || [], homeState: player.homeState, hometown: player.hometown,
            sourcePlayerId: player.id,
          });
          await storage.deletePlayer(player.id);
          posCounts[player.position]--;
          toCut--;
        }
      }
      roster = await storage.getPlayersByTeam(team.id);
    }

    // All teams in fast-forward place bids (treated as CPU)
    await placeCpuWalkonBids(leagueId, team, diffMult);
  }
}

async function processCpuWalkons(leagueId: string) {
  const teams = await storage.getTeamsByLeague(leagueId);
  const MAX_ROSTER = 25;
  const currentLeagueData = await storage.getLeague(leagueId);
  const currentSeason = currentLeagueData?.currentSeason || 1;
  const difficulty = currentLeagueData?.cpuDifficulty || "high_school";
  // Mirrors processAllTeamWalkons: elite reduced 2.0→1.3, all_american reduced 1.2→1.0.
  const difficultyMults: Record<string, number> = { beginner: 0.3, high_school: 0.7, all_american: 1.0, elite: 1.3 };
  const diffMult = difficultyMults[difficulty] ?? 0.7;
  const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };

  for (const team of teams) {
    // Auto-pilot human teams get the same CPU walk-on management
    if (!team.isCpu && !team.isAutoPilot) continue;
    
    let roster = await storage.getPlayersByTeam(team.id);
    
    if (roster.length > MAX_ROSTER) {
      const positionCounts: Record<string, number> = {};
      for (const p of roster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
      
      const cuttable = roster.filter(p => (positionCounts[p.position] || 0) > 1)
        .sort((a, b) => (a.overall || 0) - (b.overall || 0));
      
      let toCut = roster.length - MAX_ROSTER;
      
      for (const player of cuttable) {
        if (toCut <= 0) break;
        if ((positionCounts[player.position] || 0) > 1) {
          await storage.createPlayerHistory({
            leagueId,
            teamId: team.id,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            finalEligibility: player.eligibility,
            overall: player.overall,
            starRating: player.starRating,
            signingOvr: player.signingOvr ?? player.overall,
            departureType: "cut_juco",
            ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
            departedSeason: currentSeason,
            seasonsPlayed: eligMap[player.eligibility] || 1,
            abilities: player.abilities || [],
            homeState: player.homeState,
            hometown: player.hometown,
            sourcePlayerId: player.id,
          });
          await storage.deletePlayer(player.id);
          positionCounts[player.position]--;
          toCut--;
        }
      }
      
      roster = await storage.getPlayersByTeam(team.id);
    }
    
    // Place bids for this CPU team using difficulty-scaled amounts
    await placeCpuWalkonBids(leagueId, team, diffMult);
  }
}

// ── Recruiting Evaluator helpers ────────────────────────────────────────────
function computeRecruitingGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C-";
  if (score >= 50) return "D";
  return "F";
}

interface ScoredRecruit {
  id: string;
  overall: number;
  starRating: number | null;
  position: string;
  isBlueChip: boolean | null;
  isGenerationalGem: boolean | null;
}
interface TeamCommitEntry {
  teamId: string;
  commits: ScoredRecruit[];
  prestige: number;
}

async function computeRecruitingScore(
  teamId: string,
  leagueId: string,
  season: number,
  teamCommits: ScoredRecruit[],
  allTeamCommits: TeamCommitEntry[],
  teamPrestige: number,
  seasonRecruitIds: Set<string>,
): Promise<{ score: number; grade: string; breakdown: Record<string, number> }> {
  const numTeams = allTeamCommits.length;

  // 1. Class Quality (20%): team avg OVR relative to league range
  const teamAvgOvr = teamCommits.length > 0
    ? teamCommits.reduce((s, r) => s + r.overall, 0) / teamCommits.length
    : 150;
  const allAvgOvrs = allTeamCommits.filter(t => t.commits.length > 0)
    .map(t => t.commits.reduce((s, r) => s + r.overall, 0) / t.commits.length);
  const leagueBestAvg = allAvgOvrs.length > 0 ? Math.max(...allAvgOvrs) : 300;
  const leagueWorstAvg = allAvgOvrs.length > 0 ? Math.min(...allAvgOvrs) : 150;
  const classQualityScore = (leagueBestAvg > leagueWorstAvg)
    ? Math.min(100, Math.max(0, Math.round(((teamAvgOvr - leagueWorstAvg) / (leagueBestAvg - leagueWorstAvg)) * 100)))
    : (teamCommits.length > 0 ? 50 : 0);

  // 2. Class Rank (15%): rank by classic class score formula
  const allScores = allTeamCommits.map(t => {
    const c = t.commits;
    if (c.length === 0) return { teamId: t.teamId, score: 0 };
    const avgStar = c.reduce((a, r) => a + (r.starRating ?? 3), 0) / c.length;
    const avgOvr = c.reduce((a, r) => a + r.overall, 0) / c.length;
    const fiveStars = c.filter(r => r.starRating === 5).length;
    const fourStars = c.filter(r => (r.starRating ?? 0) >= 4).length;
    return { teamId: t.teamId, score: (avgStar * 20) + (avgOvr / 50) + (fiveStars * 15) + (fourStars * 5) + (c.length * 3) };
  }).sort((a, b) => b.score - a.score);
  const myRank = allScores.findIndex(e => e.teamId === teamId) + 1;
  const classRankScore = numTeams <= 1 ? 50 : Math.round((1 - (myRank - 1) / (numTeams - 1)) * 100);

  // 3. Hit Rate (15%): targeted recruits in this season's class who actually signed with this team
  const teamInterests = await storage.getRecruitingInterestsByTeam(teamId);
  const targeted = teamInterests.filter(i => i.isTargeted && seasonRecruitIds.has(i.recruitId));
  const signedTargeted = targeted.filter(i => teamCommits.some(c => c.id === i.recruitId));
  const hitRate = targeted.length > 0 ? signedTargeted.length / targeted.length : (teamCommits.length > 0 ? 0.25 : 0);
  const hitRateScore = Math.min(100, Math.round(hitRate * 100));

  // 4. Star Efficiency (15%): punching above/below prestige weight
  const expectedAvgStar = Math.max(1, Math.min(5, teamPrestige / 2));
  const actualAvgStar = teamCommits.length > 0
    ? teamCommits.reduce((s, r) => s + (r.starRating ?? 3), 0) / teamCommits.length
    : expectedAvgStar;
  const starEffScore = Math.min(100, Math.max(0, Math.round(50 + (actualAvgStar - expectedAvgStar) * 15)));

  // 5. Positional Balance (10%): unique positions covered (P, C, 1B…)
  const positionsSet = new Set<string>();
  for (const r of teamCommits) {
    positionsSet.add(["SP","RP","CL","LHP","RHP"].includes(r.position) ? "P" : r.position);
  }
  const posBalanceScore = teamCommits.length > 0 ? Math.min(100, Math.round((positionsSet.size / 9) * 100)) : 0;

  // 6. Blue Chip Haul (10%): blue chips vs league max
  const blueChipsSigned = teamCommits.filter(r => r.isBlueChip).length;
  const maxBlueChips = Math.max(...allTeamCommits.map(t => t.commits.filter(r => r.isBlueChip).length), 1);
  const blueChipScore = Math.min(100, Math.round((blueChipsSigned / maxBlueChips) * 100));

  // 7. Action Efficiency (10%): commits per non-scout action
  const actionsLog = await storage.getRecruitingActionsLogByTeam(teamId, leagueId);
  const nonScoutActions = actionsLog.filter(a => a.season === season && a.actionType !== "scout");
  const recruitsPerAction = nonScoutActions.length > 0 ? teamCommits.length / nonScoutActions.length : (teamCommits.length > 0 ? 0.3 : 0);
  const actionEffScore = Math.min(100, Math.round(recruitsPerAction * 200));

  // 8. Gem Detection (5%): signed a generational gem
  const gemScore = teamCommits.some(r => r.isGenerationalGem) ? 100 : 0;

  const breakdown: Record<string, number> = {
    classQuality: classQualityScore,
    classRank: classRankScore,
    hitRate: hitRateScore,
    starEfficiency: starEffScore,
    positionalBalance: posBalanceScore,
    blueChipHaul: blueChipScore,
    actionEfficiency: actionEffScore,
    gemDetection: gemScore,
  };

  const score = Math.round(
    breakdown.classQuality * 0.20 +
    breakdown.classRank * 0.15 +
    breakdown.hitRate * 0.15 +
    breakdown.starEfficiency * 0.15 +
    breakdown.positionalBalance * 0.10 +
    breakdown.blueChipHaul * 0.10 +
    breakdown.actionEfficiency * 0.10 +
    breakdown.gemDetection * 0.05,
  );

  return { score, grade: computeRecruitingGrade(score), breakdown };
}
// ────────────────────────────────────────────────────────────────────────────

// Group-aware position need scoring for CPU roster-fill sweeps.
// Returns a bonus that is proportional to how many MORE players the team
// needs in the position's group to reach the target roster shape
// (10P / 2C / 6 INF / 6 OF).  Replaces the old `< 2 ? 10 : 0` heuristic
// that stopped prioritising pitchers once a team had 2.
const ROSTER_GROUP_TARGETS = { pitcher: 10, catcher: 2, infield: 6, outfield: 6 };
const ROSTER_PITCHER_POS = new Set(["P", "SP", "RP", "CP"]);
const ROSTER_CATCHER_POS = new Set(["C"]);
const ROSTER_INFIELD_POS = new Set(["1B", "2B", "SS", "3B", "DH", "INF"]);
const ROSTER_OUTFIELD_POS = new Set(["OF", "LF", "CF", "RF"]);

function rosterGroupNeedBonus(
  position: string,
  positionCounts: Record<string, number>,
): number {
  let groupCount = 0;
  let target = 0;
  if (ROSTER_PITCHER_POS.has(position)) {
    target = ROSTER_GROUP_TARGETS.pitcher;
    for (const [p, cnt] of Object.entries(positionCounts)) {
      if (ROSTER_PITCHER_POS.has(p)) groupCount += cnt;
    }
  } else if (ROSTER_CATCHER_POS.has(position)) {
    target = ROSTER_GROUP_TARGETS.catcher;
    for (const [p, cnt] of Object.entries(positionCounts)) {
      if (ROSTER_CATCHER_POS.has(p)) groupCount += cnt;
    }
  } else if (ROSTER_INFIELD_POS.has(position)) {
    target = ROSTER_GROUP_TARGETS.infield;
    for (const [p, cnt] of Object.entries(positionCounts)) {
      if (ROSTER_INFIELD_POS.has(p)) groupCount += cnt;
    }
  } else if (ROSTER_OUTFIELD_POS.has(position)) {
    target = ROSTER_GROUP_TARGETS.outfield;
    for (const [p, cnt] of Object.entries(positionCounts)) {
      if (ROSTER_OUTFIELD_POS.has(p)) groupCount += cnt;
    }
  }
  return Math.max(0, target - groupCount) * 50;
}

async function finalizeSigningDay(leagueId: string, completedSeason: number) {
  console.log(`[finalizeSigningDay] Starting for league ${leagueId}, season ${completedSeason}`);
  const progressionResult = await applyPlayerProgression(leagueId);
  console.log(`[finalizeSigningDay] Progression complete: ${progressionResult.progressed} players`);

  const teams = await storage.getTeamsByLeague(leagueId);
  let totalRecruitsAdded = 0;
  let totalTransferred = 0;

  // Pre-load all recruiting interests for the league in one query — avoids N per-recruit
  // fetches in the interest-based auto-commit loop (critical for ~1,081 recruit pools).
  const allLeagueInterests = await storage.getRecruitingInterestsByLeague(leagueId);
  const interestsByRecruit = new Map<string, typeof allLeagueInterests>();
  for (const interest of allLeagueInterests) {
    const arr = interestsByRecruit.get(interest.recruitId) ?? [];
    arr.push(interest);
    interestsByRecruit.set(interest.recruitId, arr);
  }

  // Pre-load all roster players for the league in one query — avoids N per-team fetches
  // in the CPU fill/dynamic/sweep loops (critical for 149-team full-season leagues).
  const preloadedRosterPlayers = await storage.getPlayersByTeamIds(teams.map(t => t.id));
  const playersByTeam = new Map<string, typeof preloadedRosterPlayers>();
  for (const player of preloadedRosterPlayers) {
    const arr = playersByTeam.get(player.teamId) ?? [];
    arr.push(player);
    playersByTeam.set(player.teamId, arr);
  }

  // NIL budget tracking — accumulate locally per envelope, persist at the end
  // sdCanAfford/sdChargeNil gate on the recruiting envelope (65% alloc) not total budget
  const nilRecSpentAccum = new Map<string, number>(teams.map(t => [t.id, t.nilRecruitingSpent || 0]));
  const nilRecAllocMap = new Map<string, number>(teams.map(t => [t.id, (t.nilRecruitingAlloc ?? t.nilBudget) || 0]));
  const sdCanAfford = (teamId: string, cost: number) =>
    (nilRecAllocMap.get(teamId) || 0) - (nilRecSpentAccum.get(teamId) || 0) >= cost;
  const sdChargeNil = (teamId: string, cost: number) =>
    nilRecSpentAccum.set(teamId, (nilRecSpentAccum.get(teamId) || 0) + cost);

  const MIN_ROSTER = 22;
  const SD_CHUNK = 50; // chunk size for all parallel batch flushes in signing day

  // ── STEP 1: Interest-based auto-commit (runs FIRST) ──────────────────────
  // Commit undecided recruits to their highest-interest team that has an offer
  // BEFORE any CPU fill sweeps run.  This guarantees that human coaches who
  // earned top interest and extended a scholarship offer actually receive that
  // recruit — CPU MIN_ROSTER / dynamic class sweeps only operate on the
  // remaining unsigned pool afterwards.
  {
    const undecidedForInterest = (await storage.getRecruitsByLeague(leagueId)).filter(
      r => !r.signedTeamId && ["verbal", "top3", "top5", "top8", "open"].includes(r.stage || "")
    );
    // ── Batch: collect all step-1 signings in memory, flush to DB in parallel chunks ──
    const step1Batch: Array<{ id: string; teamId: string }> = [];
    for (const recruit of undecidedForInterest) {
      try {
        const interests = interestsByRecruit.get(recruit.id) ?? [];
        // Canonical resolver: only award to teams with offer + threshold met + NIL budget.
        // No fallback to no-offer teams — a team that never extended a scholarship cannot win.
        const recruitNilCost = recruit.nilCost || 0;
        const teamMapForSd = new Map(teams.map(t => [t.id, t]));
        const resolution = resolveRecruitSigningWinner(
          {
            id: recruit.id,
            starRating: (recruit as any).starRating ?? (recruit as any).starRank ?? 3,
            isBlueChip: (recruit as any).isBlueChip,
            nilCost: recruitNilCost,
            recruitType: (recruit as any).recruitType,
          },
          interests,
          teamMapForSd,
          sdCanAfford,
        );
        if (resolution.winnerTeamId) {
          sdChargeNil(resolution.winnerTeamId, recruitNilCost);
          step1Batch.push({ id: recruit.id, teamId: resolution.winnerTeamId });
        }
      } catch (e) {
        console.error(`[finalizeSigningDay] Failed to auto-commit recruit ${recruit.id}:`, e);
      }
    }
    // Flush step-1 signings in parallel chunks before step-2 reads the DB
    for (let i = 0; i < step1Batch.length; i += SD_CHUNK) {
      await Promise.all(step1Batch.slice(i, i + SD_CHUNK).map(s =>
        storage.updateRecruit(s.id, { signedTeamId: s.teamId })
      ));
    }
    if (undecidedForInterest.length > 0) {
      console.log(`[finalizeSigningDay] Auto-committed ${step1Batch.length} undecided recruits based on interest`);
    }
  }

  // ── STEP 2: CPU MIN_ROSTER fill sweep ────────────────────────────────────
  // Fetch fresh recruit data AFTER the interest pass so the unsigned pool only
  // contains recruits nobody claimed via interest — preventing CPU teams from
  // stealing recruits that were already "promised" to a human coach.
  const cpuTeamsNeedingRecruits: Array<{ team: typeof teams[0]; needed: number; positionCounts: Record<string, number> }> = [];
  const allRecruitsPreCheck = await storage.getRecruitsByLeague(leagueId);

  for (const team of teams) {
    // Auto-pilot human teams get the same CPU minimum-roster auto-fill
    if (!team.isCpu && !team.isAutoPilot) continue;
    const currentRoster = playersByTeam.get(team.id) ?? [];
    const alreadySignedCount = allRecruitsPreCheck.filter(r => r.signedTeamId === team.id).length;
    const projectedSize = currentRoster.length + alreadySignedCount;
    if (projectedSize <= MIN_ROSTER) {
      const positionCounts: Record<string, number> = {};
      for (const p of currentRoster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
      // Include already-signed recruits so the need score reflects the full projected roster
      for (const r of allRecruitsPreCheck.filter(r2 => r2.signedTeamId === team.id)) {
        positionCounts[r.position] = (positionCounts[r.position] || 0) + 1;
      }
      cpuTeamsNeedingRecruits.push({ team, needed: MIN_ROSTER - projectedSize, positionCounts });
    }
  }

  if (cpuTeamsNeedingRecruits.length > 0) {
    const unsignedPool = allRecruitsPreCheck.filter(r => !r.signedTeamId);
    const claimed = new Set<string>();
    // ── Batch: collect step-2 signings in memory, flush before step-3 DB read ──
    const step2Batch: Array<{ id: string; teamId: string; firstName: string; lastName: string; position: string; starRating: number }> = [];
    let anyAssigned = true;
    while (anyAssigned) {
      anyAssigned = false;
      for (const entry of cpuTeamsNeedingRecruits) {
        if (entry.needed <= 0) continue;
        const available = unsignedPool
          .filter(r => !claimed.has(r.id))
          .filter(r => sdCanAfford(entry.team.id, r.nilCost || 0));
        if (available.length === 0) continue;
        const best = available.sort((a, b) => {
          const aNeed = rosterGroupNeedBonus(a.position, entry.positionCounts);
          const bNeed = rosterGroupNeedBonus(b.position, entry.positionCounts);
          const primary = (bNeed + (b.overall || 0)) - (aNeed + (a.overall || 0));
          // tiebreak: prefer cheaper recruit (next cheapest option on the board)
          return primary !== 0 ? primary : (a.nilCost || 0) - (b.nilCost || 0);
        })[0];
        if (best) {
          sdChargeNil(entry.team.id, best.nilCost || 0);
          step2Batch.push({ id: best.id, teamId: entry.team.id, firstName: best.firstName, lastName: best.lastName, position: best.position, starRating: best.starRating ?? 0 });
          claimed.add(best.id);
          entry.positionCounts[best.position] = (entry.positionCounts[best.position] || 0) + 1;
          entry.needed--;
          anyAssigned = true;
        }
      }
    }
    // Flush step-2 signings in parallel chunks of 50, then emit league events
    for (let i = 0; i < step2Batch.length; i += SD_CHUNK) {
      await Promise.all(step2Batch.slice(i, i + SD_CHUNK).map(s =>
        storage.updateRecruit(s.id, { signedTeamId: s.teamId })
      ));
    }
    // Emit SIGNING events (non-fatal, fire-and-forget per batch)
    const teamMapForEvents = new Map(teams.map(t => [t.id, t]));
    for (const s of step2Batch) {
      const t = teamMapForEvents.get(s.teamId);
      if (!t) continue;
      storage.createLeagueEvent({
        leagueId, teamId: t.id, teamName: t.name,
        teamAbbreviation: t.abbreviation || t.name.slice(0, 4).toUpperCase(),
        eventType: "SIGNING",
        description: `${t.name} signed ${s.firstName} ${s.lastName} (${s.position}, ${s.starRating}★) — CPU auto-signed`,
        season: completedSeason, week: 0,
      }).catch(() => {/* non-fatal */});
    }
  }

  // ── CPU dynamic class guarantee ───────────────────────────────────────────
  // Replace the old hard MIN_CLASS = 3 with a per-team target derived from
  // how many roster spots the team needs to fill up to MAX_ROSTER (25).
  // Ensures teams with large graduating classes aren't left short.
  {
    const MAX_ROSTER = 25;
    const MIN_CLASS_FLOOR = 6; // always guarantee at least 6 commits
    const allAfterAutoCommit = await storage.getRecruitsByLeague(leagueId);
    const remainingPool = allAfterAutoCommit.filter(r => !r.signedTeamId);
    const poolClaimed = new Set<string>();

    for (const team of teams) {
      if (!team.isCpu && !team.isAutoPilot) continue;
      const currentRoster = playersByTeam.get(team.id) ?? [];
      const signedCount = allAfterAutoCommit.filter(r => r.signedTeamId === team.id).length;
      // Dynamic target: fill to MAX_ROSTER — do NOT apply MIN_CLASS_FLOOR here because
      // it can push the final count above 25 when the existing roster is large.
      const slotsAvailable = Math.max(0, MAX_ROSTER - currentRoster.length);
      const classTarget = slotsAvailable;
      if (signedCount >= classTarget) continue;

      const needed = classTarget - signedCount;
      const positionCounts: Record<string, number> = {};
      for (const p of currentRoster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
      // Include already-signed recruits from steps 1-2 so the need score reflects the full projected roster
      for (const r of allAfterAutoCommit.filter(r2 => r2.signedTeamId === team.id)) {
        positionCounts[r.position] = (positionCounts[r.position] || 0) + 1;
      }

      // ── Batch: collect step-3 signings per team, flush to DB after each team's loop ──
      const step3TeamBatch: Array<{ id: string; firstName: string; lastName: string; position: string; starRating: number }> = [];
      let filled = 0;
      while (filled < needed) {
        const available = remainingPool
          .filter(r => !poolClaimed.has(r.id))
          .filter(r => sdCanAfford(team.id, r.nilCost || 0));
        if (available.length === 0) break;
        const best = available.sort((a, b) => {
          const aNeed = rosterGroupNeedBonus(a.position, positionCounts);
          const bNeed = rosterGroupNeedBonus(b.position, positionCounts);
          const primary = (bNeed + (b.overall || 0)) - (aNeed + (a.overall || 0));
          // tiebreak: prefer cheaper recruit (next cheapest option on the board)
          return primary !== 0 ? primary : (a.nilCost || 0) - (b.nilCost || 0);
        })[0];
        if (!best) break;
        sdChargeNil(team.id, best.nilCost || 0);
        step3TeamBatch.push({ id: best.id, firstName: best.firstName, lastName: best.lastName, position: best.position, starRating: best.starRating ?? 0 });
        poolClaimed.add(best.id);
        positionCounts[best.position] = (positionCounts[best.position] || 0) + 1;
        filled++;
      }
      // Flush this team's step-3 signings in parallel chunks
      for (let i = 0; i < step3TeamBatch.length; i += SD_CHUNK) {
        await Promise.all(step3TeamBatch.slice(i, i + SD_CHUNK).map(s =>
          storage.updateRecruit(s.id, { signedTeamId: team.id })
        ));
      }
      // Emit SIGNING events (non-fatal, fire-and-forget)
      for (const s of step3TeamBatch) {
        storage.createLeagueEvent({
          leagueId, teamId: team.id, teamName: team.name,
          teamAbbreviation: team.abbreviation || team.name.slice(0, 4).toUpperCase(),
          eventType: "SIGNING",
          description: `${team.name} signed ${s.firstName} ${s.lastName} (${s.position}, ${s.starRating}★) — CPU auto-signed`,
          season: completedSeason, week: 0,
        }).catch(() => {/* non-fatal */});
      }
      if (filled > 0) {
        console.log(`[finalizeSigningDay] CPU dynamic class: added ${filled} commit(s) to ${team.name} (had ${signedCount}, target ${classTarget})`);
      }
    }
  }

  // ── Final full-sweep: place ALL remaining unsigned recruits ───────────────
  // Distributes any still-unsigned recruits (including zero-interest ones) to
  // CPU teams that still have room below MAX_ROSTER. Runs round-robin ordered
  // by roster need so the most under-staffed teams get first pick each round.
  {
    const MAX_ROSTER = 25;
    const afterDynamic = await storage.getRecruitsByLeague(leagueId);
    const sweepPool = afterDynamic.filter(r => !r.signedTeamId);

    if (sweepPool.length > 0) {
      // Build per-team state: only CPU/auto-pilot teams with available slots
      type SweepEntry = {
        team: typeof teams[0];
        slotsLeft: number;
        positionCounts: Record<string, number>;
      };
      const sweepEntries: SweepEntry[] = [];
      for (const team of teams) {
        if (!team.isCpu && !team.isAutoPilot) continue;
        const currentRoster = playersByTeam.get(team.id) ?? [];
        const signedCount = afterDynamic.filter(r => r.signedTeamId === team.id).length;
        const projectedSize = currentRoster.length + signedCount;
        const slotsLeft = Math.max(0, MAX_ROSTER - projectedSize);
        if (slotsLeft <= 0) continue;
        const positionCounts: Record<string, number> = {};
        for (const p of currentRoster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        // Include already-signed recruits from all prior steps so need score is accurate
        for (const r of afterDynamic.filter(r2 => r2.signedTeamId === team.id)) {
          positionCounts[r.position] = (positionCounts[r.position] || 0) + 1;
        }
        sweepEntries.push({ team, slotsLeft, positionCounts });
      }

      if (sweepEntries.length > 0) {
        // Sort most-needy teams first each round
        sweepEntries.sort((a, b) => b.slotsLeft - a.slotsLeft);
        const sweepClaimed = new Set<string>();
        // ── Batch: collect all step-4 (sweep) signings; flush to DB after the round-robin ──
        const step4Batch: Array<{ id: string; teamId: string; firstName: string; lastName: string; position: string; starRating: number }> = [];
        let anyPlaced = true;
        let sweepTotal = 0;

        while (anyPlaced) {
          anyPlaced = false;
          for (const entry of sweepEntries) {
            if (entry.slotsLeft <= 0) continue;
            const available = sweepPool
              .filter(r => !sweepClaimed.has(r.id))
              .filter(r => sdCanAfford(entry.team.id, r.nilCost || 0));
            if (available.length === 0) continue;
            const best = available.sort((a, b) => {
              const aNeed = rosterGroupNeedBonus(a.position, entry.positionCounts);
              const bNeed = rosterGroupNeedBonus(b.position, entry.positionCounts);
              const primary = (bNeed + (b.overall || 0)) - (aNeed + (a.overall || 0));
              // tiebreak: prefer cheaper recruit (next cheapest option on the board)
              return primary !== 0 ? primary : (a.nilCost || 0) - (b.nilCost || 0);
            })[0];
            if (!best) break;
            sdChargeNil(entry.team.id, best.nilCost || 0);
            step4Batch.push({ id: best.id, teamId: entry.team.id, firstName: best.firstName, lastName: best.lastName, position: best.position, starRating: best.starRating ?? 0 });
            sweepClaimed.add(best.id);
            entry.positionCounts[best.position] = (entry.positionCounts[best.position] || 0) + 1;
            entry.slotsLeft--;
            anyPlaced = true;
            sweepTotal++;
          }
        }
        if (sweepTotal > 0) {
          console.log(`[finalizeSigningDay] Full-sweep: placed ${sweepTotal} additional unsigned recruit(s) with CPU teams`);
        }
        // Flush step-4 (sweep) signings in parallel chunks of 50
        for (let i = 0; i < step4Batch.length; i += SD_CHUNK) {
          await Promise.all(step4Batch.slice(i, i + SD_CHUNK).map(s =>
            storage.updateRecruit(s.id, { signedTeamId: s.teamId })
          ));
        }
        // Emit SIGNING events (non-fatal, fire-and-forget)
        const teamMapForSweep = new Map(teams.map(t => [t.id, t]));
        for (const s of step4Batch) {
          const t = teamMapForSweep.get(s.teamId);
          if (!t) continue;
          storage.createLeagueEvent({
            leagueId, teamId: t.id, teamName: t.name,
            teamAbbreviation: t.abbreviation || t.name.slice(0, 4).toUpperCase(),
            eventType: "SIGNING",
            description: `${t.name} signed ${s.firstName} ${s.lastName} (${s.position}, ${s.starRating}★) — CPU auto-signed`,
            season: completedSeason, week: 0,
          }).catch(() => {/* non-fatal */});
        }
      }

      const stillUnsigned = (await storage.getRecruitsByLeague(leagueId)).filter(r => !r.signedTeamId).length;
      console.log(`[finalizeSigningDay] After full-sweep: ${stillUnsigned} recruits remain unsigned`);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // NOTE: signingDayRevealed is NOT set here anymore.
  // The attr/common-ability holdback (40%/50%) stays in place until coaches watch the Signing Day screen.
  // The reveal screen calls POST /api/leagues/:id/signing-day-reveal/complete to lift it.

  // Persist accumulated NIL recruiting-envelope spending back to each team
  for (const [teamId, recSpent] of nilRecSpentAccum) {
    const team = teams.find(t => t.id === teamId);
    if (team && recSpent !== (team.nilRecruitingSpent || 0)) {
      const totalSpent = (team.nilSpent || 0) + (recSpent - (team.nilRecruitingSpent || 0));
      await storage.updateTeam(teamId, { nilRecruitingSpent: recSpent, nilSpent: totalSpent });
    }
  }

  // Snapshot class rankings before recruits are converted to players
  try {
    const snapRecruits = await storage.getRecruitsByLeague(leagueId);
    const snapByTeam = teams.map(team => {
      const teamCommits = snapRecruits.filter(r => r.signedTeamId === team.id);
      const avgStarRating = teamCommits.length > 0 ? teamCommits.reduce((s, r) => s + (r.starRating || 3), 0) / teamCommits.length : 0;
      const avgOverall = teamCommits.length > 0 ? teamCommits.reduce((s, r) => s + (r.overall || 300), 0) / teamCommits.length : 0;
      const fiveStars = teamCommits.filter(r => r.starRating === 5).length;
      const fourStars = teamCommits.filter(r => r.starRating >= 4).length;
      const threeStars = teamCommits.filter(r => r.starRating === 3).length;
      const twoStars = teamCommits.filter(r => r.starRating === 2).length;
      const oneStars = teamCommits.filter(r => r.starRating === 1).length;
      const classScore = teamCommits.length > 0
        ? (avgStarRating * 20) + (avgOverall / 50) + (fiveStars * 15) + (fourStars * 5) + (teamCommits.length * 3)
        : 0;
      return { team, teamCommits, avgStarRating, avgOverall, fiveStars, fourStars, threeStars, twoStars, oneStars, classScore };
    }).sort((a, b) => b.classScore - a.classScore);

    let snapRank = 1;
    for (const entry of snapByTeam) {
      if (entry.teamCommits.length > 0) {
        const topRecruit = entry.teamCommits.reduce((best: Recruit, r: Recruit) =>
          (r.overall ?? 0) > (best.overall ?? 0) ? r : best
        , entry.teamCommits[0]);
        await storage.createRecruitingClassSnapshot({
          leagueId,
          season: completedSeason,
          teamId: entry.team.id,
          classRank: snapRank++,
          classScore: entry.classScore,
          totalCommits: entry.teamCommits.length,
          fiveStars: entry.fiveStars,
          fourStars: entry.fourStars,
          threeStars: entry.threeStars,
          twoStars: entry.twoStars,
          oneStars: entry.oneStars,
          avgOverall: entry.avgOverall,
          avgStarRating: entry.avgStarRating,
          topRecruitName: topRecruit ? `${topRecruit.firstName} ${topRecruit.lastName}` : null,
          topRecruitOvr: topRecruit?.overall ?? null,
          topRecruitStars: topRecruit?.starRating ?? null,
        });
      }
    }
    console.log(`[finalizeSigningDay] Snapshotted class rankings for season ${completedSeason}`);
  } catch (snapErr) {
    console.error("[finalizeSigningDay] Failed to snapshot class rankings:", snapErr);
  }

  // Record per-coach season history
  try {
    const allCoaches = await storage.getCoachesByLeague(leagueId);
    const snapRecruits2 = await storage.getRecruitsByLeague(leagueId);
    const leagueTeamsForHistory = await storage.getTeamsByLeague(leagueId);

    // Determine postseason result for each team using already-snapshotted data
    const seasonStandings = await storage.getStandingsByLeague(leagueId, completedSeason);
    const allGames = await storage.getGamesByLeague(leagueId);
    const seasonGames = allGames.filter(g => g.season === completedSeason && g.isComplete);

    const cwsWinnerTeamId = (() => {
      const cwsGames = seasonGames.filter(g => g.phase === "cws");
      if (cwsGames.length === 0) return null;
      const last = cwsGames[cwsGames.length - 1];
      if (last.homeScore == null || last.awayScore == null) return null;
      return last.homeScore > last.awayScore ? last.homeTeamId : last.awayTeamId;
    })();

    // Getting postseason participation per team
    const cwsTeamIds = new Set(seasonGames.filter(g => g.phase === "cws").flatMap(g => [g.homeTeamId, g.awayTeamId]));
    const srTeamIds = new Set(seasonGames.filter(g => g.phase === "super_regionals").flatMap(g => [g.homeTeamId, g.awayTeamId]));
    const ccTeamIds = new Set(seasonGames.filter(g => g.phase === "conference_championship").flatMap(g => [g.homeTeamId, g.awayTeamId]));

    for (const coach of allCoaches) {
      if (!coach.teamId) continue;
      const team = leagueTeamsForHistory.find(t => t.id === coach.teamId);
      if (!team) continue;
      const st = seasonStandings.find(s => s.teamId === coach.teamId);
      const wins = st?.wins ?? 0;
      const losses = st?.losses ?? 0;
      const confWins = st?.conferenceWins ?? 0;
      const confLosses = st?.conferenceLosses ?? 0;

      let phaseResult = "regular_season";
      if (cwsWinnerTeamId === coach.teamId) phaseResult = "national_champion";
      else if (cwsTeamIds.has(coach.teamId ?? "")) phaseResult = "cws";
      else if (srTeamIds.has(coach.teamId ?? "")) phaseResult = "super_regionals";
      else if (ccTeamIds.has(coach.teamId ?? "")) phaseResult = "conf_championship";

      const teamCommits = snapRecruits2.filter(r => r.signedTeamId === coach.teamId);
      const topRecruit = teamCommits.length > 0
        ? teamCommits.reduce((best, r) => ((r.overall ?? 0) > (best.overall ?? 0) ? r : best), teamCommits[0])
        : null;
      const classScore = teamCommits.length > 0
        ? (teamCommits.reduce((s, r) => s + (r.starRating || 3), 0) / teamCommits.length * 20)
          + (teamCommits.reduce((s, r) => s + (r.overall || 300), 0) / teamCommits.length / 50)
          + (teamCommits.filter(r => r.starRating === 5).length * 15)
          + (teamCommits.filter(r => r.starRating >= 4).length * 5)
          + (teamCommits.length * 3)
        : 0;

      // Rank: compute one class score per team and sort
      const allTeamScores = teams.map(t => {
        const commits = snapRecruits2.filter(r => r.signedTeamId === t.id);
        if (commits.length === 0) return { teamId: t.id, score: 0 };
        const avgStar = commits.reduce((a, b) => a + (b.starRating || 3), 0) / commits.length;
        const avgOvr = commits.reduce((a, b) => a + (b.overall || 300), 0) / commits.length;
        const fiveStars = commits.filter(r => r.starRating === 5).length;
        const fourStars = commits.filter(r => r.starRating >= 4).length;
        const score = (avgStar * 20) + (avgOvr / 50) + (fiveStars * 15) + (fourStars * 5) + (commits.length * 3);
        return { teamId: t.id, score };
      }).sort((a, b) => b.score - a.score);
      const classRank = allTeamScores.findIndex(e => e.teamId === coach.teamId) + 1;

      const classStarAvg = teamCommits.length > 0
        ? teamCommits.reduce((s, r) => s + (r.starRating || 3), 0) / teamCommits.length
        : null;

      // Compute recruiting evaluator score for this coach's season
      const allTeamCommitsForScore: TeamCommitEntry[] = leagueTeamsForHistory.map(t => ({
        teamId: t.id,
        commits: snapRecruits2.filter(r => r.signedTeamId === t.id).map(r => ({
          id: r.id,
          overall: r.overall ?? 300,
          starRating: r.starRating ?? null,
          position: r.position,
          isBlueChip: r.isBlueChip ?? null,
          isGenerationalGem: r.isGenerationalGem ?? null,
        })),
        prestige: t.prestige ?? 5,
      }));
      const seasonRecruitIds = new Set(snapRecruits2.map(r => r.id));
      const typedTeamCommits: ScoredRecruit[] = teamCommits.map(r => ({
        id: r.id,
        overall: r.overall ?? 300,
        starRating: r.starRating ?? null,
        position: r.position,
        isBlueChip: r.isBlueChip ?? null,
        isGenerationalGem: r.isGenerationalGem ?? null,
      }));

      // Explicit null — only set score/grade/breakdown if computation succeeds
      let recruitingScore: number | null = null;
      let recruitingGrade: string | null = null;
      let recruitingBreakdown: Record<string, number> | null = null;
      try {
        const result = await computeRecruitingScore(
          coach.teamId!,
          leagueId,
          completedSeason,
          typedTeamCommits,
          allTeamCommitsForScore,
          team.prestige ?? 5,
          seasonRecruitIds,
        );
        recruitingScore = result.score;
        recruitingGrade = result.grade;
        recruitingBreakdown = result.breakdown;
      } catch (scoreErr) {
        console.error("[finalizeSigningDay] Could not compute recruiting score for coach", coach.id, "— stored as null:", scoreErr);
        // Leave as null — explicit unscored state, not a misleading default F/0
      }

      await storage.upsertCoachSeasonHistory({
        coachId: coach.id,
        leagueId,
        season: completedSeason,
        wins,
        losses,
        confWins,
        confLosses,
        phaseResult,
        classRank: classRank > 0 ? classRank : null,
        classScore: classScore > 0 ? classScore : null,
        classStarAvg,
        totalSigned: teamCommits.length,
        topRecruitName: topRecruit ? `${topRecruit.firstName} ${topRecruit.lastName}` : null,
        topRecruitOvr: topRecruit?.overall ?? null,
        topRecruitStars: topRecruit?.starRating ?? null,
        teamId: coach.teamId ?? null,
        teamName: team.name,
        teamAbbr: team.abbreviation,
        recruitingScore,
        recruitingGrade,
        recruitingBreakdown,
      });

      // Also refresh milestones after recording season
      try { await ensureCoachTraits(coach, completedSeason); } catch (traitErr) {
        console.error("[finalizeSigningDay] ensureCoachTraits failed for coach", coach.id, ":", traitErr);
      }
    }
    console.log(`[finalizeSigningDay] Recorded season history for ${allCoaches.length} coaches`);

    // Integrity check: log any active coaches that ended up with a null score this season
    const postScoreHistory = await storage.getCoachSeasonHistoryByLeague(leagueId);
    const unscoredThisSeason = allCoaches.filter(c => c.teamId && !postScoreHistory.some(
      h => h.coachId === c.id && h.season === completedSeason && h.recruitingScore != null,
    ));
    if (unscoredThisSeason.length > 0) {
      console.warn(`[finalizeSigningDay] ${unscoredThisSeason.length} coach(es) received no recruiting score this season:`, unscoredThisSeason.map(c => c.id));
    }

    // Update career recruiting scores for all coaches — rolling weighted average + milestone bonuses
    // Fetch league history once and reuse across all coaches to avoid O(coaches × seasons) DB calls
    const allLeagueHistoryForCareer = await storage.getCoachSeasonHistoryByLeague(leagueId);
    for (const coach of allCoaches) {
      if (!coach.teamId) continue;
      try {
        const scoredSeasons = allLeagueHistoryForCareer
          .filter(h => h.coachId === coach.id && h.leagueId === leagueId && h.recruitingScore != null)
          .sort((a, b) => a.season - b.season);
        if (scoredSeasons.length === 0) continue;
        const N = scoredSeasons.length;
        // Rolling weighted average: more recent seasons get higher weight (1.0 → 2.0)
        let weightSum = 0;
        let weightedScoreSum = 0;
        scoredSeasons.forEach((h, idx) => {
          const weight = 1.0 + (N > 1 ? idx / (N - 1) : 0);
          weightedScoreSum += (h.recruitingScore || 0) * weight;
          weightSum += weight;
        });
        const rollingAvg = weightedScoreSum / weightSum;
        // Milestone bonuses (capped at 5 total) — use already-fetched league history
        let milestoneBonus = 0;
        for (const h of scoredSeasons) {
          const seasonRanked = allLeagueHistoryForCareer
            .filter(x => x.season === h.season && x.recruitingScore != null)
            .sort((a, b) => (b.recruitingScore ?? 0) - (a.recruitingScore ?? 0));
          const seasonBest = seasonRanked[0];
          if (seasonBest?.coachId === coach.id) {
            milestoneBonus += 1.5; // Recruiter of Year
          } else {
            const rank = seasonRanked.findIndex(x => x.coachId === coach.id);
            if (rank >= 0 && rank < 3) milestoneBonus += 0.5; // top-3 finish
          }
          const breakdown = h.recruitingBreakdown as Record<string, number> | null;
          if (breakdown?.gemDetection === 100) milestoneBonus += 0.5; // gem signed
        }
        milestoneBonus = Math.min(5, milestoneBonus);
        const careerScore = Math.min(100, rollingAvg + milestoneBonus);
        await storage.updateCoach(coach.id, { careerRecruitingScore: Math.round(careerScore * 10) / 10 });
      } catch (careerErr) {
        console.error("[finalizeSigningDay] Failed to update career recruiting score for coach", coach.id, ":", careerErr);
      }
    }

    // Persist Recruiter of the Year award to league_events (idempotent: skip if already written this season)
    try {
      const updatedHistory = await storage.getCoachSeasonHistoryByLeague(leagueId);
      const thisSeasonHistory = updatedHistory
        .filter(h => h.season === completedSeason && h.recruitingScore != null)
        .sort((a, b) => (b.recruitingScore ?? 0) - (a.recruitingScore ?? 0));
      if (thisSeasonHistory.length > 0) {
        const winner = thisSeasonHistory[0];
        const winnerCoach = allCoaches.find(c => c.id === winner.coachId);
        const winnerTeam = leagueTeamsForHistory.find(t => t.id === winner.teamId);
        if (winnerCoach && winnerTeam) {
          // Idempotency guard: query exactly this season's AWARD events — deterministic, no window cap
          const seasonAwards = await storage.getLeagueEventsBySeason(leagueId, completedSeason, "AWARD");
          const royAlreadyWritten = seasonAwards.some(
            e => e.description?.includes("Recruiter of the Year"),
          );
          if (!royAlreadyWritten) {
            await storage.createLeagueEvent({
              leagueId,
              teamId: winnerTeam.id,
              teamName: winnerTeam.name,
              teamAbbreviation: winnerTeam.abbreviation,
              teamPrimaryColor: winnerTeam.primaryColor ?? null,
              eventType: "AWARD",
              description: `${winnerCoach.firstName} ${winnerCoach.lastName} (${winnerTeam.name}) wins Recruiter of the Year with a ${winner.recruitingGrade} recruiting class (${winner.recruitingScore?.toFixed(1)}/100) — Season ${completedSeason}.`,
              season: completedSeason,
              week: 0,
            });
          } else {
            console.log(`[finalizeSigningDay] ROY award already persisted for season ${completedSeason}, skipping.`);
          }
        }
      }
    } catch (awardErr) {
      console.error("[finalizeSigningDay] Failed to persist Recruiter of Year award:", awardErr);
    }
  } catch (histErr) {
    console.error("[finalizeSigningDay] Failed to record coach season history:", histErr);
  }

  // Update national ranks based on season performance
  try {
    const rankTeams = await storage.getTeamsByLeague(leagueId);
    const rankStandings = await storage.getStandingsByLeague(leagueId, completedSeason);
    const rankGames = (await storage.getGamesByLeague(leagueId)).filter(g => g.season === completedSeason && g.isComplete);

    const rankCwsWinner = (() => {
      const cwsGames = rankGames.filter(g => g.phase === "cws");
      if (cwsGames.length === 0) return null;
      // Sort deterministically: highest bracketRound first, then highest week, then latest id
      const sorted = [...cwsGames].sort((a, b) => {
        if ((b.bracketRound ?? 0) !== (a.bracketRound ?? 0)) return (b.bracketRound ?? 0) - (a.bracketRound ?? 0);
        if (b.week !== a.week) return b.week - a.week;
        return b.id.localeCompare(a.id);
      });
      const last = sorted[0];
      if (last.homeScore == null || last.awayScore == null) return null;
      return last.homeScore > last.awayScore ? last.homeTeamId : last.awayTeamId;
    })();
    const rankCwsIds = new Set(rankGames.filter(g => g.phase === "cws").flatMap(g => [g.homeTeamId, g.awayTeamId]));
    const rankSrIds = new Set(rankGames.filter(g => g.phase === "super_regionals").flatMap(g => [g.homeTeamId, g.awayTeamId]));
    const rankCcIds = new Set(rankGames.filter(g => g.phase === "conference_championship").flatMap(g => [g.homeTeamId, g.awayTeamId]));

    for (const team of rankTeams) {
      const st = rankStandings.find(s => s.teamId === team.id);
      const wins = st?.wins ?? 0;
      const losses = st?.losses ?? 0;
      const total = wins + losses;
      if (total === 0) continue;

      const winRate = wins / total;

      // Adjustment: positive means rank improves (number goes down)
      let adj = (winRate - 0.5) * 24; // -12 to +12 based on win rate

      // Postseason bonuses
      if (rankCwsWinner === team.id) adj += 15;
      else if (rankCwsIds.has(team.id)) adj += 10;
      else if (rankSrIds.has(team.id)) adj += 5;
      else if (rankCcIds.has(team.id)) adj += 3;

      // Stadium postseason recruiting bump: elite venue exposure during postseason
      // amplifies recruiting rank boost — big crowds + live TV showcase the program.
      // Only applies when the team actually hosted / played postseason games.
      const playedPostseason = rankCwsIds.has(team.id) || rankSrIds.has(team.id) || rankCcIds.has(team.id) || rankCwsWinner === team.id;
      if (playedPostseason && (team.stadium || 5) >= 8) adj += 3;
      else if (playedPostseason && (team.stadium || 5) >= 7) adj += 1;

      // Clamp max shift to ±15 per season
      adj = Math.max(-15, Math.min(15, adj));

      const currentRank = team.nationalRank ?? TOTAL_NATIONAL_TEAMS;
      const newRank = Math.max(1, Math.min(TOTAL_NATIONAL_TEAMS, currentRank - Math.round(adj)));

      // Rising-program recruiting boost: teams that improved 10+ spots get a
      // temporary schoolBonus modifier for the upcoming recruiting season.
      // +0.05 for 10-19 spots improved, +0.10 for 20+ spots improved.
      // Boost decays to 0 if rank stalls or falls.
      const rankImprovement = currentRank - newRank; // positive = improved
      let recruitingRankBoost = 0;
      if (rankImprovement >= 20) recruitingRankBoost = 0.10;
      else if (rankImprovement >= 10) recruitingRankBoost = 0.05;

      const updatePayload: Record<string, any> = {
        prevNationalRank: currentRank,
        recruitingRankBoost,
      };
      if (newRank !== currentRank) {
        updatePayload.nationalRank = newRank;
      }
      await storage.updateTeam(team.id, updatePayload);
      if (newRank !== currentRank) {
        console.log(`[finalizeSigningDay] National rank update: ${team.name} ${currentRank} → ${newRank} (adj=${Math.round(adj)}, winRate=${winRate.toFixed(2)}, rankBoost=${recruitingRankBoost})`);
      }
    }
    console.log(`[finalizeSigningDay] National ranks updated for season ${completedSeason}`);
  } catch (rankErr) {
    console.error("[finalizeSigningDay] Failed to update national ranks:", rankErr);
  }

  console.log(`[finalizeSigningDay] Processing ${teams.length} teams for transfers/eligibility/recruits`);
  for (const team of teams) {
    const roster = await storage.getPlayersByTeam(team.id);
    const remainingPortal = roster.filter(p => p.inTransferPortal);
    for (const player of remainingPortal) {
      const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };

      const recruits = await storage.getRecruitsByLeague(leagueId);
      const wasSignedAsRecruit = recruits.some(r => r.sourcePlayerId === player.id && r.signedTeamId);

      await storage.createPlayerHistory({
        leagueId,
        teamId: team.id,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        finalEligibility: player.eligibility,
        overall: player.overall,
        starRating: player.starRating,
        signingOvr: player.signingOvr ?? player.overall,
        ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
        departureType: wasSignedAsRecruit ? "transfer_signed" : "transfer_juco",
        departedSeason: completedSeason,
        seasonsPlayed: eligMap[player.eligibility] || 1,
        abilities: player.abilities || [],
        homeState: player.homeState,
        hometown: player.hometown,
        sourcePlayerId: player.id,
      });

      if (!wasSignedAsRecruit) {
        const jucoEligMap: Record<string, string> = { "FR": "SO", "SO": "JR", "JR": "SR" };
        const newElig = jucoEligMap[player.eligibility] || player.eligibility;
        if (newElig !== "SR") {
          const transferRecruit = recruits.find(r => r.sourcePlayerId === player.id);
          await storage.createWalkon({
            leagueId,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            throwHand: player.throwHand || "R",
            batHand: player.batHand || "R",
            homeState: player.homeState || "TX",
            hometown: player.hometown || "Unknown",
            eligibility: player.eligibility,
            overall: player.overall,
            starRating: player.starRating,
            hitForAvg: player.hitForAvg || 50,
            power: player.power || 50,
            speed: player.speed || 50,
            arm: player.arm || 50,
            fielding: player.fielding || 50,
            errorResistance: player.errorResistance || 50,
            clutch: player.clutch || 50,
            vsLHP: player.vsLHP || 50,
            grit: player.grit || 50,
            stealing: player.stealing || 50,
            running: player.running || 50,
            throwing: player.throwing || 50,
            recovery: player.recovery || 50,
            catcherAbility: player.catcherAbility || 50,
            velocity: player.velocity || 50,
            control: player.control || 50,
            stamina: player.stamina || 50,
            stuff: player.stuff || 50,
            wRISP: player.wRISP || 50,
            vsLefty: player.vsLefty || 50,
            poise: player.poise || 50,
            heater: player.heater || 50,
            agile: player.agile || 50,
            abilities: player.abilities || [],
            potential: player.potential ?? null,
            isGenerated: false,
            skinTone: player.skinTone || "light",
            hairColor: player.hairColor || "brown",
            hairStyle: player.hairStyle || "short",
            headwear: player.headwear || "cap",
            sourceRecruitId: transferRecruit?.id ?? null,
          });
        }
      }

      await storage.deletePlayer(player.id);
      totalTransferred++;
    }

    const remainingPlayers = await storage.getPlayersByTeam(team.id);
    for (const player of remainingPlayers) {
      const eligProgression: Record<string, string> = {
        "FR": "SO",
        "SO": "JR",
        "JR": "SR",
        "RS": "SR",
      };
      const newEligibility = eligProgression[player.eligibility];
      if (newEligibility) {
        await storage.updatePlayer(player.id, {
          eligibility: newEligibility,
          declaredForDraft: false,
          inTransferPortal: false,
        });
      }
    }

    const recruits = await storage.getRecruitsByLeague(leagueId);
    const signedRecruits = recruits.filter(r => r.signedTeamId === team.id);

    // Dedup guard: build a name-key set from current roster so re-running
    // this function (double-advance, retry) cannot insert the same player twice.
    const existingAfterElig = await storage.getPlayersByTeam(team.id);
    const existingNameKeys = new Set(existingAfterElig.map(p => `${p.firstName}|${p.lastName}`));
    const insertedThisPass = new Set<string>();

    for (const recruit of signedRecruits) {
      const nameKey = `${recruit.firstName}|${recruit.lastName}`;
      if (existingNameKeys.has(nameKey) || insertedThisPass.has(nameKey)) {
        console.warn(`[finalizeSigningDay] Skipping duplicate player ${recruit.firstName} ${recruit.lastName} on team ${team.name}`);
        continue;
      }
      insertedThisPass.add(nameKey);
      const jerseyNumber = 1 + Math.floor(Math.random() * 99);
      const recruitElig = recruit.recruitType === "TRANSFER" ? (recruit.recruitYear || "SO") : "FR";
      const finalElig = recruit.recruitType === "JUCO" ? (recruit.recruitYear || "FR") : recruitElig;
      await storage.createPlayer({
        teamId: team.id,
        firstName: recruit.firstName,
        lastName: recruit.lastName,
        position: recruit.position,
        eligibility: finalElig,
        throwHand: recruit.throwHand || "R",
        batHand: recruit.batHand || "R",
        homeState: recruit.homeState,
        hometown: recruit.hometown,
        jerseyNumber,
        overall: recruit.overall,
        starRating: recruit.starRating,
        hitForAvg: recruit.hitForAvg || 50,
        power: recruit.power || 50,
        speed: recruit.speed || 50,
        arm: recruit.arm || 50,
        fielding: recruit.fielding || 50,
        errorResistance: recruit.errorResistance || 50,
        clutch: recruit.clutch || 50,
        vsLHP: recruit.vsLHP || 50,
        grit: recruit.grit || 50,
        stealing: recruit.stealing || 50,
        running: recruit.running || 50,
        throwing: recruit.throwing || 50,
        recovery: recruit.recovery || 50,
        catcherAbility: recruit.catcherAbility || 50,
        velocity: recruit.velocity || 50,
        control: recruit.control || 50,
        stamina: recruit.stamina || 50,
        stuff: recruit.stuff || 50,
        wRISP: recruit.wRISP || 50,
        vsLefty: recruit.vsLefty || 50,
        poise: recruit.poise || 50,
        heater: recruit.heater || 50,
        agile: recruit.agile || 50,
        pitchFB: recruit.pitchFB ?? 1,
        pitch2S: recruit.pitch2S ?? 0,
        pitchSL: recruit.pitchSL ?? 0,
        pitchCB: recruit.pitchCB ?? 0,
        pitchCH: recruit.pitchCH ?? 0,
        pitchCT: recruit.pitchCT ?? 0,
        pitchSNK: recruit.pitchSNK ?? 0,
        pitchVSL: recruit.pitchVSL ?? 0,
        pitchSPL: (recruit as any).pitchSPL ?? 0,
        pitchFK:  (recruit as any).pitchFK  ?? 0,
        pitchSFF: (recruit as any).pitchSFF ?? 0,
        pitchSHU: (recruit as any).pitchSHU ?? 0,
        pitchCCH: (recruit as any).pitchCCH ?? 0,
        pitchHSL: (recruit as any).pitchHSL ?? 0,
        pitchSWP: (recruit as any).pitchSWP ?? 0,
        pitchKN:  (recruit as any).pitchKN  ?? 0,
        pitchSCB: (recruit as any).pitchSCB ?? 0,
        pitchPCB: (recruit as any).pitchPCB ?? 0,
        abilities: recruit.abilities || [],
        trajectory: (recruit as any).trajectory ?? 2,
        tools: recruit.tools || [],
        workEthicScore: recruit.workEthicScore ?? 70,
        coachability: recruit.coachability ?? 70,
        skinTone: recruit.skinTone || "light",
        hairColor: recruit.hairColor || "brown",
        hairStyle: recruit.hairStyle || "short",
        headwear: (recruit as any).headwear || "cap",
        facialHair: (recruit as any).facialHair || "none",
        eyeStyle: (recruit as any).eyeStyle || "standard",
        eyebrowStyle: (recruit as any).eyebrowStyle || "flat",
        mouthStyle: (recruit as any).mouthStyle || "neutral",
        eyeBlack: (recruit as any).eyeBlack || false,
        potential: recruit.potential ?? null,
        // V3: new signed players use the archetype-aware development engine
        developmentModelVersion: 3,
        playArchetypeId: assignArchetype(recruit.position, recruit as any),
      });
      totalRecruitsAdded++;
    }
  }

  // #87 — surface roster violations in the activity feed so coaches see them, not just server logs
  const signingDayValidation = await validateLeagueRosters(
    leagueId,
    (id) => storage.getTeamsByLeague(id),
    (teamId) => storage.getPlayersByTeam(teamId),
    "post-signing-day"
  );
  if (signingDayValidation.violations > 0) {
    try {
      await storage.createLeagueEvent({
        leagueId,
        eventType: "PHASE_CHANGE",
        description: `⚠ Roster check: ${signingDayValidation.violations} structure violation(s) detected across ${signingDayValidation.teamsChecked} teams after Signing Day. Check server logs for details.`,
        season: completedSeason,
        week: 0,
      });
    } catch (e) { console.error("[finalizeSigningDay] Failed to create violation event:", e); }
  }

  return {
    recruitsAdded: totalRecruitsAdded,
    transferred: totalTransferred,
    playersProgressed: progressionResult.progressed,
    rosterViolations: signingDayValidation.violations,
  };
}

// CONFERENCE_TIER_NIL and DEFAULT_CONFERENCE_NIL are imported at the top of this file from "@shared/nilConfig"

async function computeSeasonNilBudget(leagueId: string, completedSeason: number): Promise<void> {
  const newSeason = completedSeason + 1;
  const [teams, conferences, allCoachHistory, recruitingSnapshots] = await Promise.all([
    storage.getTeamsByLeague(leagueId),
    storage.getConferencesByLeague(leagueId),
    storage.getCoachSeasonHistoryByLeague(leagueId),
    storage.getRecruitingClassSnapshotsByLeague(leagueId, completedSeason),
  ]);
  // Load rosters once for all teams (used to compute planned class size for class-need adjustment)
  const allRosters = await storage.getPlayersByTeamIds(teams.map(t => t.id));
  const rosterByTeam = new Map<string, typeof allRosters>();
  for (const p of allRosters) {
    if (!rosterByTeam.has(p.teamId)) rosterByTeam.set(p.teamId, []);
    rosterByTeam.get(p.teamId)!.push(p);
  }

  const confById = new Map(conferences.map(c => [c.id, c]));
  const totalTeams = teams.length;

  // Prior-season coach history keyed by teamId
  const coachHistoryByTeam = new Map<string, import("@shared/schema").CoachSeasonHistory>();
  for (const h of allCoachHistory) {
    if (h.season === completedSeason && h.teamId) {
      coachHistoryByTeam.set(h.teamId, h);
    }
  }

  // Recruiting class rank keyed by teamId
  const classRankByTeam = new Map<string, number>();
  const validSnapshots = recruitingSnapshots.filter(s => s.classRank > 0);
  for (const s of validSnapshots) {
    classRankByTeam.set(s.teamId, s.classRank);
  }

  // Prior-season prestige baseline keyed by teamId
  const priorNilRows = await storage.getNilEarningsByLeague(leagueId, completedSeason);
  const priorPrestigeByTeam = new Map<string, number>();
  for (const row of priorNilRows) {
    if (row.category === "prestige_baseline") {
      const match = row.description.match(/prestige:(\d+)/);
      if (match) priorPrestigeByTeam.set(row.teamId, parseInt(match[1], 10));
    }
  }

  for (const team of teams) {
    const conf = team.conferenceId ? confById.get(team.conferenceId) : undefined;
    const confName = conf?.name ?? "";
    const conferenceTierBase = CONFERENCE_TIER_NIL[confName] ?? DEFAULT_CONFERENCE_NIL;

    // ── V2 NIL blend formula ────────────────────────────────────────────────
    // nilBaseline: persisted on first reset; blended 60/40 with conference tier
    // each subsequent season to preserve program identity while allowing drift.
    const nilBaseline = team.nilBaseline ?? team.nilBudget ?? conferenceTierBase;

    // Class-need adjustment: teams with more open spots earn extra NIL capacity.
    // plannedClassSize = max open roster spots based on departing seniors.
    const teamRoster = rosterByTeam.get(team.id) ?? [];
    const seniorsLeaving = teamRoster.filter(p => p.eligibility === "SR" && !p.retentionStatus).length;
    const portalLeaving = teamRoster.filter(p => p.inTransferPortal).length;
    const pendingDepartures = teamRoster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained").length;
    const totalLeaving = Math.max(seniorsLeaving, pendingDepartures) + portalLeaving;
    const returningRoster = Math.max(0, teamRoster.length - totalLeaving);
    const plannedClassSize = Math.max(0, 25 - returningRoster);
    const classNeedAdjustment = Math.max(-225_000, Math.min(225_000, (plannedClassSize - 6) * 75_000));

    const blendedBase = Math.round(0.60 * nilBaseline + 0.40 * conferenceTierBase + classNeedAdjustment);
    const baseNil = Math.max(750_000, blendedBase);

    const earnings: Array<{ category: string; amount: number; description: string }> = [];

    earnings.push({ category: "base", amount: baseNil, description: `${confName || "Unknown"} conference base allocation (blended)` });

    // ── Recruiting class rank bonus
    const classRank = classRankByTeam.get(team.id);
    if (classRank != null && totalTeams > 0) {
      const pctile = classRank / totalTeams;
      if (pctile <= 0.10) {
        earnings.push({ category: "recruiting_top10", amount: 400_000, description: "Top 10% recruiting class" });
      } else if (pctile <= 0.25) {
        earnings.push({ category: "recruiting_top25", amount: 200_000, description: "Top 25% recruiting class" });
      } else if (pctile <= 0.50) {
        earnings.push({ category: "recruiting_top50", amount: 100_000, description: "Top 50% recruiting class" });
      }
    }

    // ── Postseason bonuses (exclusive tiers — award only for that exact achievement level)
    const history = coachHistoryByTeam.get(team.id);
    if (history) {
      const pr = history.phaseResult;
      // CWS appearance (best result was making or winning the CWS)
      if (pr === "national_champion" || pr === "cws") {
        earnings.push({ category: "cws_appearance", amount: 750_000, description: "College World Series appearance" });
      }
      // Super Regionals (best result was reaching Super Regionals, but not advancing to CWS)
      if (pr === "super_regionals") {
        earnings.push({ category: "super_regionals", amount: 400_000, description: "Super Regionals appearance" });
      }
      // Conference Championship (best result was winning the conference title, did not advance further)
      if (pr === "conf_championship") {
        earnings.push({ category: "conf_championship", amount: 200_000, description: "Conference Championship win" });
      }

      // ── Win percentage bonus
      const totalGames = (history.wins || 0) + (history.losses || 0);
      if (totalGames > 0) {
        const winPct = history.wins / totalGames;
        if (winPct >= 0.700) {
          earnings.push({ category: "win_pct_700", amount: 150_000, description: ".700+ win percentage" });
        } else if (winPct >= 0.600) {
          earnings.push({ category: "win_pct_600", amount: 75_000, description: ".600+ win percentage" });
        }
      }
    }

    // ── Coach level milestones (one-time)
    const coach = await storage.getCoachByTeam(team.id);
    if (coach) {
      const level = coach.level || 1;
      const milestones = [
        { level: 15, category: "coach_level_15", amount: 150_000, description: "Coach reached Level 15" },
        { level: 10, category: "coach_level_10", amount: 100_000, description: "Coach reached Level 10" },
        { level: 5, category: "coach_level_5", amount: 50_000, description: "Coach reached Level 5" },
      ];
      for (const m of milestones) {
        if (level >= m.level) {
          const alreadyAwarded = await storage.hasNilEarningCategory(leagueId, team.id, m.category);
          if (!alreadyAwarded) {
            earnings.push({ category: m.category, amount: m.amount, description: m.description });
          }
        }
      }
    }

    // ── Prestige growth bonus
    const priorPrestige = priorPrestigeByTeam.get(team.id);
    if (priorPrestige != null && team.prestige > priorPrestige) {
      earnings.push({ category: "prestige_growth", amount: 50_000, description: `Prestige increased from ${priorPrestige} to ${team.prestige}` });
    }

    // ── Insert all earnings rows for the new season
    // onConflictDoNothing in storage already handles the unique constraint;
    // no try/catch needed — unexpected DB errors should bubble up to fail the transition.
    for (const e of earnings) {
      await storage.createNilSeasonEarning({
        leagueId,
        teamId: team.id,
        season: newSeason,
        category: e.category,
        amount: e.amount,
        description: e.description,
      });
    }

    // ── Record prestige baseline for next season (idempotent via onConflictDoNothing)
    await storage.createNilSeasonEarning({
      leagueId,
      teamId: team.id,
      season: newSeason,
      category: "prestige_baseline",
      amount: 0,
      description: `prestige:${team.prestige}`,
    });

    // ── Reset nilBudget and nilSpent; initialize envelopes and persist baseline
    const totalNil = earnings.reduce((s, e) => s + e.amount, 0);
    const recruitingAlloc = Math.round(totalNil * 0.65);
    const retentionReserve = Math.round(totalNil * 0.25);
    const walkonReserve = totalNil - recruitingAlloc - retentionReserve;
    const teamUpdate: Partial<import("@shared/schema").Team> = {
      nilBudget: totalNil,
      nilSpent: 0,
      nilRecruitingAlloc: recruitingAlloc,
      nilRetentionReserve: retentionReserve,
      nilWalkonReserve: walkonReserve,
      nilRecruitingSpent: 0,
      nilRetentionSpent: 0,
      nilWalkonSpent: 0,
    };
    // Persist nilBaseline on first reset (never overwritten after initial set)
    if (!team.nilBaseline) {
      teamUpdate.nilBaseline = team.nilBudget ?? conferenceTierBase;
    }
    await storage.updateTeam(team.id, teamUpdate);

    console.log(`[NIL] Season ${newSeason} | Team ${team.abbreviation}: blended base $${(baseNil / 1000).toFixed(0)}K + bonuses $${((totalNil - baseNil) / 1000).toFixed(0)}K = $${(totalNil / 1000).toFixed(0)}K total | envelopes: rec=$${(recruitingAlloc / 1000).toFixed(0)}K ret=$${(retentionReserve / 1000).toFixed(0)}K wk=$${(walkonReserve / 1000).toFixed(0)}K`);
  }
}

async function finalizeWalkonsPhase(leagueId: string, completedSeason: number, skipRecruitGeneration = false) {
  const teams = await storage.getTeamsByLeague(leagueId);
  const teamMap = new Map(teams.map(t => [t.id, t]));
  let totalWalkonsAdded = 0;

  // ── Auction resolution ──────────────────────────────────────────────────────
  // For each walkon in the pool, resolve all submitted bids into a winner.
  // Vickrey pricing: winner pays second-highest bid + 1 (or their full bid if uncontested).
  const allBids = await storage.getWalkonBidsByLeague(leagueId);
  const bidsByWalkon = new Map<string, (typeof allBids)>();
  for (const bid of allBids) {
    if (!bidsByWalkon.has(bid.walkonPoolId)) bidsByWalkon.set(bid.walkonPoolId, []);
    bidsByWalkon.get(bid.walkonPoolId)!.push(bid);
  }

  const walkons = await storage.getWalkonsByLeague(leagueId);

  // Track auction results for the summary returned to the advance endpoint.
  // keyed by teamId → array of outcomes for that team
  const auctionResultsByTeam = new Map<string, Array<{
    walkonId: string;
    firstName: string;
    lastName: string;
    position: string;
    overall: number;
    won: boolean;
    pricePaid: number;
    winnerTeamName: string | null;
    yourBid: number;
  }>>();

  // ── Pure Vickrey sealed-bid auction ─────────────────────────────────────────
  // For each walk-on independently: highest bid wins; winner pays
  // second-highest submitted bid + $1 (or their own bid if uncontested).
  // Roster cap is enforced at bid-submission time (max active bids ≤ open
  // roster slots), so no cap adjustments are needed here.

  for (const walkon of walkons) {
    // Tie-break: equal bids resolved by submission time (earlier createdAt wins).
    // Documented rule: "first to submit a tied bid wins."
    // Fallback to id lexical order for any rows with identical createdAt timestamps.
    const bids = (bidsByWalkon.get(walkon.id) || []).sort((a, b) => {
      if (b.bidAmount !== a.bidAmount) return b.bidAmount - a.bidAmount;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA !== tB ? tA - tB : a.id.localeCompare(b.id);
    });
    if (bids.length === 0) continue;

    const winner = bids[0];
    const secondBidAmt = bids[1]?.bidAmount ?? 0;
    // Vickrey price: second-highest submitted bid + 1, clamped to winner's bid
    const pricePaid = Math.min(winner.bidAmount, bids.length > 1 ? secondBidAmt + 1 : winner.bidAmount);

    // Mark awarded
    await storage.updateWalkon(walkon.id, {
      signedTeamId: winner.teamId,
      signedTeamName: teamMap.get(winner.teamId)?.name || null,
      awardedTeamId: winner.teamId,
      awardedTeamName: teamMap.get(winner.teamId)?.name || null,
      awardedPrice: pricePaid,
    });

    // Deduct NIL from winner — charges the walkon envelope
    const winnerTeam = teamMap.get(winner.teamId);
    if (winnerTeam) {
      const newNilSpent = (winnerTeam.nilSpent || 0) + pricePaid;
      const newWalkonSpent = (winnerTeam.nilWalkonSpent || 0) + pricePaid;
      await storage.updateTeam(winnerTeam.id, { nilSpent: newNilSpent, nilWalkonSpent: newWalkonSpent });
      winnerTeam.nilSpent = newNilSpent;
      winnerTeam.nilWalkonSpent = newWalkonSpent;
    }

    // Record outcomes for all bidding teams
    const winnerName = teamMap.get(winner.teamId)?.name || null;
    for (const bid of bids) {
      if (!auctionResultsByTeam.has(bid.teamId)) auctionResultsByTeam.set(bid.teamId, []);
      auctionResultsByTeam.get(bid.teamId)!.push({
        walkonId: walkon.id,
        firstName: walkon.firstName,
        lastName: walkon.lastName,
        position: walkon.position,
        overall: walkon.overall,
        won: bid.teamId === winner.teamId,
        pricePaid,
        winnerTeamName: bid.teamId === winner.teamId ? null : winnerName,
        yourBid: bid.bidAmount,
      });
    }
    console.log(`[Auction] ${walkon.firstName} ${walkon.lastName} (${walkon.position}) → ${winnerName} paid $${pricePaid.toLocaleString()} (${bids.length} bid${bids.length > 1 ? "s" : ""})`);
  }

  // Reload walkons with awarded data for the player creation loop
  const updatedWalkons = await storage.getWalkonsByLeague(leagueId);

  for (const team of teams) {
    const signedWalkons = updatedWalkons.filter(w => w.signedTeamId === team.id);

    // Dedup guard: finalizeSigningDay already ran and added signed recruits.
    // Guard against re-insertion if this function is called a second time.
    const existingWalkonPlayers = await storage.getPlayersByTeam(team.id);
    const existingWalkonNameKeys = new Set(existingWalkonPlayers.map(p => `${p.firstName}|${p.lastName}`));
    const insertedThisWalkonPass = new Set<string>();

    for (const walkon of signedWalkons) {
      const walkonNameKey = `${walkon.firstName}|${walkon.lastName}`;
      if (existingWalkonNameKeys.has(walkonNameKey) || insertedThisWalkonPass.has(walkonNameKey)) {
        console.warn(`[finalizeWalkonsPhase] Skipping duplicate player ${walkon.firstName} ${walkon.lastName} on team ${team.id}`);
        continue;
      }
      insertedThisWalkonPass.add(walkonNameKey);
      const jerseyNumber = 1 + Math.floor(Math.random() * 99);
      await storage.createPlayer({
        teamId: team.id,
        firstName: walkon.firstName,
        lastName: walkon.lastName,
        position: walkon.position,
        eligibility: walkon.eligibility || "FR",
        throwHand: walkon.throwHand || "R",
        batHand: walkon.batHand || "R",
        homeState: walkon.homeState,
        hometown: walkon.hometown,
        jerseyNumber,
        overall: walkon.overall,
        starRating: walkon.starRating,
        hitForAvg: walkon.hitForAvg || 50,
        power: walkon.power || 50,
        speed: walkon.speed || 50,
        arm: walkon.arm || 50,
        fielding: walkon.fielding || 50,
        errorResistance: walkon.errorResistance || 50,
        clutch: walkon.clutch || 50,
        vsLHP: walkon.vsLHP || 50,
        grit: walkon.grit || 50,
        stealing: walkon.stealing || 50,
        running: walkon.running || 50,
        throwing: walkon.throwing || 50,
        recovery: walkon.recovery || 50,
        catcherAbility: walkon.catcherAbility || 50,
        velocity: walkon.velocity || 50,
        control: walkon.control || 50,
        stamina: walkon.stamina || 50,
        stuff: walkon.stuff || 50,
        wRISP: walkon.wRISP || 50,
        vsLefty: walkon.vsLefty || 50,
        poise: walkon.poise || 50,
        heater: walkon.heater || 50,
        agile: walkon.agile || 50,
        abilities: walkon.abilities || [],
        trajectory: (walkon as any).trajectory ?? 2,
        tools: (walkon as any).tools || [],
        workEthicScore: (walkon as any).workEthicScore ?? 70,
        coachability: (walkon as any).coachability ?? 70,
        skinTone: walkon.skinTone || "light",
        hairColor: walkon.hairColor || "brown",
        hairStyle: walkon.hairStyle || "short",
        headwear: walkon.headwear || "cap",
        potential: walkon.potential ?? null,
        developmentModelVersion: 3,
        playArchetypeId: assignArchetype(walkon.position, walkon as any),
      });
      totalWalkonsAdded++;
    }
  }

  const unsignedRealWalkons = updatedWalkons.filter(w => !w.signedTeamId && !w.isGenerated);

  // Collect scouting/interest data for JUCO-bound walk-ons before deletion.
  // Walk-ons that came from unsigned transfer portal players carry a sourceRecruitId
  // pointing to their TRANSFER recruit row from the previous recruiting season.
  // We snapshot those interests now so they can be re-attached to the new JUCO recruit.
  const walkonInterestMap = new Map<string, import("@shared/schema").RecruitingInterest[]>();
  for (const walkon of unsignedRealWalkons) {
    if (walkon.sourceRecruitId) {
      try {
        const priorInterests = await storage.getRecruitingInterestsByRecruit(walkon.sourceRecruitId);
        if (priorInterests.length > 0) {
          walkonInterestMap.set(walkon.id, priorInterests);
        }
      } catch (e) {
        console.error(`[JUCO carryover] Failed to fetch interests for walkon ${walkon.id}:`, e);
      }
    }
  }

  // Persist auction results to league before walkons are deleted so all coaches
  // can retrieve their outcomes via GET /walkons/auction-results even after the phase advances.
  await storage.updateLeague(leagueId, {
    lastWalkonAuction: JSON.stringify(Object.fromEntries(auctionResultsByTeam)),
  });

  // Write activity feed event per human team so coaches can see their auction
  // summary in the News/Activity tab even if they missed the live resolution.
  for (const team of teams) {
    if (team.isCpu) continue;
    const teamResults = auctionResultsByTeam.get(team.id) ?? [];
    const signed = teamResults.filter(r => r.won).length;
    const outbid = teamResults.filter(r => !r.won).length;

    let description: string;
    if (teamResults.length === 0) {
      description = `${team.name} did not place any bids in the walk-on auction.`;
    } else {
      const parts: string[] = [];
      if (signed > 0) parts.push(`signed ${signed} walk-on${signed !== 1 ? "s" : ""}`);
      if (outbid > 0) parts.push(`were outbid on ${outbid} player${outbid !== 1 ? "s" : ""}`);
      description = `Walk-on auction results for ${team.name}: ${parts.join(" and ")}.`;
    }

    try {
      await storage.createLeagueEvent({
        leagueId,
        teamId: team.id,
        teamName: team.name,
        teamAbbreviation: team.abbreviation,
        eventType: "WALKON",
        description,
        season: completedSeason,
        week: 99,
        metadata: {
          signed,
          outbid,
          results: teamResults,
        },
      });
    } catch (err) {
      console.error(`[finalizeWalkonsPhase] Failed to write activity event for team ${team.id}:`, err);
    }
  }

  await storage.deleteWalkonsByLeague(leagueId);

  await storage.deleteRecruitsByLeague(leagueId);

  // Scale recruit class to league size, gated by dynasty preset.
  // full_season leagues use the departure-based pool-size formula (open slots + 20%
  // buffer, floored by minimumNationalBoard) so the class reflects actual roster demand.
  // Non-full_season leagues use the backward-compatible linear formula (≤80).
  const _walkonsLeague = await storage.getLeague(leagueId);
  // Fetch a fresh roster snapshot for pool sizing and position targets.
  // preloadedRosterPlayers belongs to finalizeSigningDay's scope and is not available here.
  const walkonsRosterSnapshot = await storage.getPlayersByTeamIds(teams.map(t => t.id));
  let recruitCount: number;
  if (_walkonsLeague?.dynastyPreset === "full_season") {
    // Departure-based formula: open slots (SR + JR × 1.2 buffer) floored by minimumNationalBoard.
    recruitCount = computePoolSizeFromDepartures(walkonsRosterSnapshot, teams.length);
    console.log(`[finalizeWalkonsPhase] Departure-based pool size: ${recruitCount} (teams=${teams.length})`);
  } else {
    recruitCount = getRecruitPoolSize(teams.length, _walkonsLeague?.dynastyPreset);
  }

  // ── Departure-based position-demand planning ──────────────────────────────
  // posTargets.{P, C, IF, OF} reflect actual vacated slots (SR + JR departures + 20%
  // buffer), giving the generator exact group quotas instead of a static ratio.
  let nextClassPitcherRatio: number | undefined;
  let nextClassPosGroupWeights: { C?: number; IF?: number; OF?: number } | undefined;
  try {
    const posTargets = computePositionTargetsFromDepartures(walkonsRosterSnapshot, recruitCount);
    nextClassPitcherRatio = derivePitcherRatioFromTargets(posTargets, recruitCount);
    // Non-pitcher group weights drive pre-assigned deterministic position quotas.
    if (posTargets.C || posTargets.IF || posTargets.OF) {
      nextClassPosGroupWeights = { C: posTargets.C, IF: posTargets.IF, OF: posTargets.OF };
    }
    console.log(`[finalizeWalkonsPhase] Position targets: P=${posTargets.P} C=${posTargets.C} IF=${posTargets.IF} OF=${posTargets.OF} | pitcherRatio=${nextClassPitcherRatio.toFixed(3)} (pool=${recruitCount})`);
  } catch (plannerErr) {
    console.warn("[finalizeWalkonsPhase] Pool planner failed (non-fatal) — using default split:", plannerErr);
  }

  // ── Generate the next recruit class (skip when a staged class will replace it) ──
  // When skipRecruitGeneration is true the caller has a commissioner-selected saved
  // class queued for the upcoming season. Generating here and then immediately
  // replacing the pool in replaceLeagueRecruitingClass is wasteful and initializes
  // storylines twice — skip it and let the caller call replaceLeagueRecruitingClass.
  if (!skipRecruitGeneration) {
    // Pass completedSeason + 1 so storyline recruits are keyed to the UPCOMING season,
    // not the season that just ended (the DB counter is bumped after this function returns).
    const newClassOpts: { pitcherRatio?: number; positionGroupWeights?: { C?: number; IF?: number; OF?: number } } = {};
    if (nextClassPitcherRatio != null) newClassOpts.pitcherRatio = nextClassPitcherRatio;
    if (nextClassPosGroupWeights) newClassOpts.positionGroupWeights = nextClassPosGroupWeights;
    const newClassVintage = await generateRecruits(leagueId, recruitCount, false, completedSeason + 1, Object.keys(newClassOpts).length > 0 ? newClassOpts : undefined);
    if (newClassVintage) {
      await storage.updateLeague(leagueId, { currentClassVintage: newClassVintage });
    }
  } else {
    console.log(`[finalizeWalkonsPhase] Skipping generateRecruits — staged class will be applied by caller (pool=${recruitCount})`);
  }

  let jucoRecruitsCreated = 0;
  for (const walkon of unsignedRealWalkons) {
    try {
      const jucoEligMap: Record<string, string> = { "FR": "SO", "SO": "JR", "JR": "SR" };
      const newElig = jucoEligMap[walkon.eligibility || "FR"] || walkon.eligibility;
      if (newElig === "SR") continue;

      const jucoAttrBoost = () => 1 + Math.floor(Math.random() * 3);
      const boostedHitForAvg = Math.min(100, (walkon.hitForAvg || 50) + jucoAttrBoost());
      const boostedPower = Math.min(100, (walkon.power || 50) + jucoAttrBoost());
      const boostedSpeed = Math.min(100, (walkon.speed || 50) + jucoAttrBoost());
      const boostedArm = Math.min(100, (walkon.arm || 50) + jucoAttrBoost());
      const boostedFielding = Math.min(100, (walkon.fielding || 50) + jucoAttrBoost());
      const boostedErrorResistance = Math.min(100, (walkon.errorResistance || 50) + jucoAttrBoost());
      const boostedVelocity = Math.min(100, (walkon.velocity || 50) + jucoAttrBoost());
      const boostedControl = Math.min(100, (walkon.control || 50) + jucoAttrBoost());
      const boostedStamina = Math.min(100, (walkon.stamina || 50) + jucoAttrBoost());
      const boostedStuff = Math.min(100, (walkon.stuff || 50) + jucoAttrBoost());

      const jucoData = {
        hitForAvg: boostedHitForAvg, power: boostedPower, speed: boostedSpeed,
        arm: boostedArm, fielding: boostedFielding, errorResistance: boostedErrorResistance,
        velocity: boostedVelocity, control: boostedControl, stamina: boostedStamina, stuff: boostedStuff,
        clutch: walkon.clutch, vsLHP: walkon.vsLHP, grit: walkon.grit, stealing: walkon.stealing,
        running: walkon.running, throwing: walkon.throwing, recovery: walkon.recovery,
        wRISP: walkon.wRISP, vsLefty: walkon.vsLefty, poise: walkon.poise,
        heater: walkon.heater, agile: walkon.agile,
        abilities: walkon.abilities as string[] || [],
      };
      const boostedOverall = calculateOVR(jucoData);
      const walkonStarRating = getStarRatingFromOVR(boostedOverall);

      const currentRecruits = await storage.getRecruitsByLeague(leagueId);
      const classRank = currentRecruits.filter(r => (r.overall || 0) >= boostedOverall).length + 1;
      const posRecruits = currentRecruits.filter(r => r.position === walkon.position);
      // positionRank is display-based: rank among same-position recruits by
      // displayed starRating, not true OVR.
      const posRank = posRecruits.filter(r => (r.starRating || 0) > walkonStarRating).length + 1;

      const jucoRecruit = await storage.createRecruit({
        leagueId,
        firstName: walkon.firstName,
        lastName: walkon.lastName,
        position: walkon.position,
        throwHand: walkon.throwHand || "R",
        batHand: walkon.batHand || "R",
        homeState: walkon.homeState || "TX",
        hometown: walkon.hometown || "Unknown",
        starRank: walkonStarRating,
        classRank,
        positionRank: posRank,
        recruitType: "JUCO",
        recruitYear: newElig,
        overall: boostedOverall,
        starRating: walkonStarRating,
        hitForAvg: boostedHitForAvg,
        power: boostedPower,
        speed: boostedSpeed,
        arm: boostedArm,
        fielding: boostedFielding,
        errorResistance: boostedErrorResistance,
        clutch: walkon.clutch ?? 50,
        vsLHP: walkon.vsLHP ?? 50,
        grit: walkon.grit ?? 50,
        stealing: walkon.stealing ?? 50,
        running: walkon.running ?? 50,
        throwing: walkon.throwing ?? 50,
        recovery: walkon.recovery ?? 50,
        catcherAbility: walkon.catcherAbility ?? 50,
        velocity: boostedVelocity,
        control: boostedControl,
        stamina: boostedStamina,
        stuff: boostedStuff,
        wRISP: walkon.wRISP ?? 50,
        vsLefty: walkon.vsLefty ?? 50,
        poise: walkon.poise ?? 50,
        heater: walkon.heater ?? 50,
        agile: walkon.agile ?? 50,
        abilities: walkon.abilities || [],
        skinTone: walkon.skinTone || "light",
        hairColor: walkon.hairColor || "brown",
        hairStyle: walkon.hairStyle || "short",
        headwear: walkon.headwear || "cap",
        potential: walkon.potential ?? 60,
        nilCost: (function() {
          const sr = getStarRatingFromOVR(boostedOverall);
          const ranges: [number, number][] = [[5000,25000],[25000,75000],[75000,200000],[200000,500000],[500000,1000000]];
          const [mn, mx] = ranges[Math.min(4, Math.max(0, sr - 1))];
          return Math.floor(mn + Math.random() * (mx - mn));
        })(),
        trajectory: ["P","SP","RP","CP"].includes(walkon.position) ? 2 : assignTrajectory(boostedPower, boostedSpeed, boostedHitForAvg),
        sourcePlayerId: null,
        fromTeamName: null,
      });

      // Carry over scouting progress and interest from the prior TRANSFER recruiting season.
      // scoutPercentage is reduced to reflect the offseason gap; coaches at 65%+ retain
      // meaningful partial credit, lower scouts get a smaller but non-zero head start.
      const priorInterests = walkonInterestMap.get(walkon.id);
      if (priorInterests && priorInterests.length > 0) {
        let carryoverErrors = 0;
        for (const prior of priorInterests) {
          try {
            let carriedScout: number;
            if (prior.scoutPercentage >= 65) {
              carriedScout = Math.round(prior.scoutPercentage * 0.55);
            } else if (prior.scoutPercentage >= 40) {
              carriedScout = Math.round(prior.scoutPercentage * 0.40);
            } else {
              carriedScout = Math.round(prior.scoutPercentage * 0.25);
            }
            carriedScout = Math.max(0, Math.min(99, carriedScout));

            // Trim revealedAttributes proportionally to the carried scout percentage
            // so it stays consistent with how deep the scout actually is.
            const priorAttrs = prior.revealedAttributes || [];
            let carriedAttrs: string[];
            if (prior.scoutPercentage > 0 && priorAttrs.length > 0) {
              const ratio = carriedScout / prior.scoutPercentage;
              const keepCount = Math.max(0, Math.round(priorAttrs.length * ratio));
              carriedAttrs = priorAttrs.slice(0, keepCount);
            } else {
              carriedAttrs = [];
            }

            // Scale revealed abilities count proportionally as well
            const carriedAbilitiesCount = prior.scoutPercentage > 0
              ? Math.max(0, Math.round(prior.revealedAbilitiesCount * (carriedScout / prior.scoutPercentage)))
              : 0;

            await storage.createRecruitingInterest({
              recruitId: jucoRecruit.id,
              teamId: prior.teamId,
              interestLevel: prior.interestLevel,
              scoutPercentage: carriedScout,
              isTargeted: false,
              hasOffer: false,
              revealedAttributes: carriedAttrs,
              minOverall: prior.minOverall,
              maxOverall: prior.maxOverall,
              minStar: prior.minStar,
              maxStar: prior.maxStar,
              revealedAbilitiesCount: carriedAbilitiesCount,
              notes: prior.notes ?? null,
              boardRank: null,
            });
          } catch (e) {
            carryoverErrors++;
            console.error(`[JUCO carryover] Failed to copy interest for team ${prior.teamId} to JUCO recruit ${jucoRecruit.id}:`, e);
          }
        }
        if (carryoverErrors > 0) {
          console.warn(`[JUCO carryover] WARNING: ${carryoverErrors}/${priorInterests.length} interest row(s) failed to copy for JUCO recruit ${walkon.firstName} ${walkon.lastName} — some scouting progress may be lost`);
        } else {
          console.log(`[JUCO carryover] Carried ${priorInterests.length} interest(s) to JUCO recruit ${walkon.firstName} ${walkon.lastName}`);
        }
      }

      jucoRecruitsCreated++;
    } catch (e) {
      console.error(`Failed to create JUCO recruit for ${walkon.firstName} ${walkon.lastName}:`, e);
    }
  }
  console.log(`JUCO recruits: ${unsignedRealWalkons.length} unsigned walk-ons, ${jucoRecruitsCreated} JUCO recruits created`);

  await generateTopSchoolsForLeague(leagueId);

  const existingStandings = await storage.getStandingsByLeague(leagueId, completedSeason + 1);
  if (existingStandings.length === 0) {
    for (const team of teams) {
      await storage.createStandings({
        leagueId,
        teamId: team.id,
        season: completedSeason + 1,
      });
    }
  }

  await createScheduleForSeason(leagueId, completedSeason + 1);
  if (_walkonsLeague?.dynastyPreset !== "full_season") {
    await generateExhibitionGames(leagueId, completedSeason + 1);
  }

  await validateLeagueRosters(
    leagueId,
    (id) => storage.getTeamsByLeague(id),
    (teamId) => storage.getPlayersByTeam(teamId),
    "post-walkons"
  );

  // Post-transition roster oversize check — catches any duplicate-player fallout
  // before the new season begins. Threshold is 35 (well above the 25-player cap) to
  // avoid false positives while still catching catastrophic double-inserts.
  {
    const OVERSIZE_THRESHOLD = 35;
    const teamsPostWalkons = await storage.getTeamsByLeague(leagueId);
    const oversized: string[] = [];
    for (const t of teamsPostWalkons) {
      const roster = await storage.getPlayersByTeam(t.id);
      if (roster.length > OVERSIZE_THRESHOLD) {
        oversized.push(`${t.name} (${roster.length} players)`);
        console.error(`[finalizeWalkonsPhase] ROSTER_OVERSIZE: ${t.name} has ${roster.length} players — possible duplicate inserts`);
      }
    }
    if (oversized.length > 0) {
      try {
        await storage.createLeagueEvent({
          leagueId,
          eventType: "PHASE_CHANGE",
          description: `⚠ ROSTER OVERSIZE after walk-ons: ${oversized.join(", ")} exceeded ${OVERSIZE_THRESHOLD} players. Commissioner can run the dedup-rosters tool to clean up.`,
          season: completedSeason,
          week: 0,
        });
      } catch (e) { /* non-fatal */ }
    }
  }

  // Reset captain designations for the new season; CPU teams auto-assign to top players
  try {
    const leaguePlayers = await storage.getPlayersByLeague(leagueId);
    await Promise.all(leaguePlayers.map(p =>
      (p.captainRole ? storage.updatePlayer(p.id, { captainRole: null, captainSeason: null }) : Promise.resolve())
    ));
    const pitcherPositions = new Set(["P", "SP", "RP", "CP"]);
    for (const team of teams) {
      if (!team.isCpu) continue;
      const roster = await storage.getPlayersByTeam(team.id);
      const pitchers = roster.filter(p => pitcherPositions.has(p.position)).sort((a, b) => (b.overall || 0) - (a.overall || 0));
      const fielders = roster.filter(p => !pitcherPositions.has(p.position)).sort((a, b) => (b.overall || 0) - (a.overall || 0));
      if (pitchers[0]) await storage.updatePlayer(pitchers[0].id, { captainRole: "pitcher_captain", captainSeason: completedSeason + 1 });
      if (fielders[0]) await storage.updatePlayer(fielders[0].id, { captainRole: "fielder_captain", captainSeason: completedSeason + 1 });
    }
    console.log(`[captain-reset] Season ${completedSeason + 1}: captains cleared for ${leaguePlayers.length} players; CPU teams auto-assigned`);
  } catch (captainErr) {
    console.error("[captain-reset] Error resetting captains:", captainErr);
  }

  // Compute NIL budgets for the new season — failure is intentionally non-silent
  await computeSeasonNilBudget(leagueId, completedSeason);
  console.log(`[NIL] Season ${completedSeason + 1} budgets computed for league ${leagueId}`);

  // Apply program attribute evolution — non-fatal, logged
  try {
    await applyProgramAttributeEvolution(leagueId, completedSeason);
    console.log(`[attr-evolution] Season ${completedSeason} attribute updates applied for league ${leagueId}`);
  } catch (evoErr) {
    console.error("[attr-evolution] Failed to apply program attribute evolution:", evoErr);
  }

  // ── Roster health enforcement ─────────────────────────────────────────────
  // After the walk-on phase, every team must have at least MIN_ROSTER_HEALTH
  // players so games can be simulated. This catches edge cases (e.g. large
  // full-season leagues where the walk-on pool ran dry before every team
  // filled). Teams that are still under the floor get synthetic 0-1★ filler
  // walk-ons generated inline (same as the walk-on pool fillers).
  try {
    // Minimum roster floor raised to 22 so all game slots can be filled.
    // Position depth minimums: 3 P, 1 C, 3 IF (1B+2B+3B+SS), 2 OF (LF+CF+RF).
    const MIN_ROSTER_HEALTH = 22;
    const MIN_DEPTH: Record<string, number> = { P: 3, C: 1, IF: 3, OF: 2 };
    const allTeamsPostWalkon = await storage.getTeamsByLeague(leagueId);
    const healthEvents: Array<{ teamId: string; teamName: string; before: number; added: number }> = [];
    for (const team of allTeamsPostWalkon) {
      const finalRoster = await storage.getPlayersByTeam(team.id);
      const positionCounts: Record<string, number> = {};
      for (const p of finalRoster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;

      // Compute position group depths
      // OF, LF, CF, RF all count as outfield — the walk-on system normalizes LF/CF/RF → OF
      const pDepth  = positionCounts["P"]  || 0;
      const cDepth  = positionCounts["C"]  || 0;
      const ifDepth = (positionCounts["1B"] || 0) + (positionCounts["2B"] || 0) + (positionCounts["3B"] || 0) + (positionCounts["SS"] || 0);
      const ofDepth = (positionCounts["OF"] || 0) + (positionCounts["LF"] || 0) + (positionCounts["CF"] || 0) + (positionCounts["RF"] || 0);

      // Determine positions needed to meet depth floors
      const depthGaps: string[] = [];
      for (let i = pDepth;  i < MIN_DEPTH.P;  i++) depthGaps.push("P");
      for (let i = cDepth;  i < MIN_DEPTH.C;  i++) depthGaps.push("C");
      for (let i = ifDepth; i < MIN_DEPTH.IF; i++) depthGaps.push("2B");
      for (let i = ofDepth; i < MIN_DEPTH.OF; i++) depthGaps.push("OF");

      // Total fillers = max(roster-floor deficit, depth-gap count), hard-capped at 25-player max
      const rosterDeficit = MIN_ROSTER_HEALTH - finalRoster.length;
      const rosterCap = 25 - finalRoster.length; // never push above 25
      const positions = ["C", "1B", "2B", "3B", "SS", "OF", "P"];
      const fillerPositions: string[] = [...depthGaps];

      // Fill remaining roster spots (if any) with most-needed positions
      const totalFillers = Math.min(rosterCap, Math.max(rosterDeficit, depthGaps.length));
      if (totalFillers <= 0) continue;

      // Recount including already-queued depth-gap fillers
      const enriched = { ...positionCounts };
      for (const p of fillerPositions) enriched[p] = (enriched[p] || 0) + 1;
      while (fillerPositions.length < totalFillers) {
        const pos = positions.slice().sort((a, b) => (enriched[a] || 0) - (enriched[b] || 0))[0];
        fillerPositions.push(pos);
        enriched[pos] = (enriched[pos] || 0) + 1;
      }

      const beforeCount = finalRoster.length;
      console.warn(`[finalizeWalkonsPhase] ROSTER_HEALTH: ${team.name} has ${beforeCount} players (p=${pDepth} c=${cDepth} if=${ifDepth} of=${ofDepth}) — adding ${fillerPositions.length} filler(s)`);

      for (let d = 0; d < fillerPositions.length; d++) {
        const pos = fillerPositions[d];
        const fillerAttrs = 20 + Math.floor(Math.random() * 25);
        await storage.createPlayer({
          teamId: team.id,
          firstName: "Walk",
          lastName: `On-${d + 1}`,
          position: pos,
          eligibility: "FR",
          overall: fillerAttrs + 100,
          potential: 200,
          batHand: "R",
          throwHand: "R",
          hometown: "Walk-On",
          homeState: "NA",
          jerseyNumber: 90 + d,
          abilities: [],
          hitForAvg: fillerAttrs, power: fillerAttrs, speed: fillerAttrs,
          fielding: fillerAttrs, arm: fillerAttrs, errorResistance: fillerAttrs,
          velocity: fillerAttrs, stuff: fillerAttrs, control: fillerAttrs,
          stamina: pos === "P" ? fillerAttrs : 0,
        });
      }
      healthEvents.push({ teamId: team.id, teamName: team.name, before: beforeCount, added: fillerPositions.length });
    }
    // Emit a single ROSTER_HEALTH league event summarising all teams that needed fillers
    if (healthEvents.length > 0) {
      const summary = healthEvents.map(e => `${e.teamName} (${e.before}→${e.before + e.added})`).join(", ");
      await storage.createLeagueEvent({
        leagueId,
        teamId: null as any,
        teamName: "League",
        teamAbbreviation: "LG",
        eventType: "WALKON",
        description: `Roster health enforced for ${healthEvents.length} team(s): ${summary}`,
        season: completedSeason,
        week: 0,
      });
    }
    console.log(`[finalizeWalkonsPhase] Roster health check complete — ${healthEvents.length} team(s) received fillers`);
  } catch (rosterHealthErr) {
    console.error("[finalizeWalkonsPhase] Roster health enforcement error (non-fatal):", rosterHealthErr);
  }

  // Reset coach isReady for all human coaches now that the phase is preseason.
  // finalizeWalkonsPhase transitions the league to preseason, so the readiness
  // gate needs a clean slate — otherwise coaches start the preseason already-ready
  // or with a stale flag from a prior phase.
  try {
    const humanTeams = teams.filter(t => !t.isCpu && !t.isAutoPilot);
    const humanTeamIds = new Set(humanTeams.map(t => t.id));
    const allLeagueCoaches = await storage.getCoachesByLeague(leagueId);
    const humanCoaches = allLeagueCoaches.filter(c => c.teamId && humanTeamIds.has(c.teamId));
    await Promise.all(humanCoaches.map(c => storage.updateCoach(c.id, { isReady: false })));
    console.log(`[finalizeWalkonsPhase] Reset isReady=false for ${humanCoaches.length} coach(es) entering preseason`);
  } catch (readyResetErr) {
    console.error("[finalizeWalkonsPhase] Failed to reset coach isReady:", readyResetErr);
  }

  return {
    walkonsAdded: totalWalkonsAdded,
    newRecruits: recruitCount,
    auctionResultsByTeam: Object.fromEntries(auctionResultsByTeam),
  };
}

// ── Program Attribute Evolution ──────────────────────────────────────────────
// Runs once per season (at the end of finalizeWalkonsPhase) and mutates each
// team's prestige/facilities/academics/stadium/collegeLife values based on
// their just-completed season performance, recruiting class rank, and player retention.
// Previous values are preserved in prev_* columns so the UI can display deltas.
// Baseline columns anchor real-team attributes so dynasties don't permanently drift.
async function applyProgramAttributeEvolution(leagueId: string, completedSeason: number) {
  const teams = await storage.getTeamsByLeague(leagueId);
  const allTeamCount = teams.length;

  // ─ Data sources ──────────────────────────────────────────────────────────
  const [seasonStandings, classSnapshots, allGames, allRecruits, leagueHistory] = await Promise.all([
    storage.getStandingsByLeague(leagueId, completedSeason),
    storage.getRecruitingClassSnapshotsByLeague(leagueId, completedSeason),
    storage.getGamesByLeague(leagueId),
    storage.getRecruitsByLeague(leagueId),
    storage.getPlayerHistoryByLeague(leagueId),
  ]);

  const seasonGames = allGames.filter(g => g.season === completedSeason && g.isComplete);

  // ── CWS champion ──────────────────────────────────────────────────────────
  const cwsTeamIds = new Set(seasonGames.filter(g => g.phase === "cws").flatMap(g => [g.homeTeamId, g.awayTeamId]));
  const cwsWinsByTeam = new Map<string, number>();
  for (const g of seasonGames.filter(g => g.phase === "cws")) {
    if (g.homeScore == null || g.awayScore == null) continue;
    const winnerId = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
    cwsWinsByTeam.set(winnerId, (cwsWinsByTeam.get(winnerId) ?? 0) + 1);
  }
  const cwsChampionId = [...cwsWinsByTeam.entries()].find(([, w]) => w >= 2)?.[0] ?? null;

  // ── Conference champions (won conf championship game) ─────────────────────
  const confChampIds = new Set<string>();
  for (const g of seasonGames.filter(g => g.phase === "conference_championship")) {
    if (g.homeScore == null || g.awayScore == null) continue;
    confChampIds.add(g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId);
  }

  // ── Class rank snapshot lookup by teamId (rank 1 = best) ─────────────────
  const classRankByTeam = new Map<string, number>();
  for (const snap of classSnapshots) {
    classRankByTeam.set(snap.teamId, snap.classRank);
  }

  // ── Conference standings grouping for conference finish ───────────────────
  const teamConfMap = new Map<string, string>(); // teamId → confId
  for (const t of teams) if (t.conferenceId) teamConfMap.set(t.id, t.conferenceId);

  const confStandingsMap = new Map<string, typeof seasonStandings>(); // confId → sorted standings
  for (const s of seasonStandings) {
    const confId = teamConfMap.get(s.teamId);
    if (!confId) continue;
    if (!confStandingsMap.has(confId)) confStandingsMap.set(confId, []);
    confStandingsMap.get(confId)!.push(s);
  }
  for (const arr of confStandingsMap.values()) {
    arr.sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (a.losses ?? 0) - (b.losses ?? 0));
  }

  const clamp = (v: number, lo = 1, hi = 10) => Math.max(lo, Math.min(hi, Math.round(v)));

  for (const team of teams) {
    // ── Conference finish ────────────────────────────────────────────────────
    const confId = teamConfMap.get(team.id);
    const confArr = confId ? (confStandingsMap.get(confId) ?? []) : [];
    const confSize = confArr.length;
    const confRank = confArr.findIndex(s => s.teamId === team.id) + 1; // 1-indexed, 0 = not found

    // ── Signed recruits & departures ─────────────────────────────────────────
    const signedRecruits = allRecruits.filter(r => r.signedTeamId === team.id);
    const signedCount = signedRecruits.length;
    const teamDepartures = leagueHistory.filter(
      h => h.teamId === team.id && h.departedSeason === completedSeason
    );
    const transferOuts = teamDepartures.filter(h => h.departureType === "transfer_portal").length;
    const totalDepartures = teamDepartures.length;

    // ── PRESTIGE ─────────────────────────────────────────────────────────────
    // Spec: +2 CWS champion; +1 CWS or won conference; 0 top half; -1 bottom half; -2 last place.
    // Soft-pull ±0.25/season toward prestige_baseline (≈ 1 step every 4 seasons).
    let prestigeDelta = 0;
    let prestigeReason = "";
    if (cwsChampionId === team.id) {
      prestigeDelta = 2; prestigeReason = "CWS champion";
    } else if (cwsTeamIds.has(team.id)) {
      prestigeDelta = 1; prestigeReason = "CWS appearance";
    } else if (confChampIds.has(team.id)) {
      prestigeDelta = 1; prestigeReason = "Won conference championship";
    } else if (confRank > 0 && confSize > 0) {
      if (confRank === confSize) {
        prestigeDelta = -2; prestigeReason = "Last place in conference";
      } else if (confRank > confSize / 2) {
        prestigeDelta = -1; prestigeReason = "Bottom half of conference";
      } else {
        prestigeDelta = 0; prestigeReason = "Top half of conference";
      }
    } else {
      prestigeDelta = -1; prestigeReason = "No postseason";
    }
    // Baseline soft-pull (every 4 seasons)
    const prestigeBaseline = team.prestigeBaseline ?? team.prestige;
    if (completedSeason % 4 === 0 && team.prestige !== prestigeBaseline) {
      prestigeDelta += team.prestige < prestigeBaseline ? 1 : -1;
      prestigeReason += prestigeReason ? "; baseline drift" : "Baseline drift";
    }

    // ── FACILITIES ───────────────────────────────────────────────────────────
    // Spec: +1 top 25%; 0 top 50%; -1 bottom 50%. Soft-pull toward baseline.
    const classRank = classRankByTeam.get(team.id) ?? null;
    const top25Threshold = Math.ceil(allTeamCount * 0.25);
    const top50Threshold = Math.ceil(allTeamCount * 0.5);
    let facilitiesDelta = 0;
    let facilitiesReason = "";
    if (classRank !== null) {
      if (classRank <= top25Threshold) {
        facilitiesDelta = 1; facilitiesReason = "Top-25% recruiting class";
      } else if (classRank <= top50Threshold) {
        facilitiesDelta = 0; facilitiesReason = "Top-50% recruiting class";
      } else {
        facilitiesDelta = -1; facilitiesReason = "Bottom-50% recruiting class";
      }
    }
    const facilitiesBaseline = team.facilitiesBaseline ?? team.facilities;
    if (completedSeason % 4 === 0 && team.facilities !== facilitiesBaseline) {
      facilitiesDelta += team.facilities < facilitiesBaseline ? 1 : -1;
    }

    // ── ACADEMICS ────────────────────────────────────────────────────────────
    // Spec: +1 if ≥40% signed recruits had Academic top priority AND <3 transferred out;
    //       -1 if ≥5 transferred out.
    let academicsDelta = 0;
    let academicsReason = "";
    const academicTopPriorityCount = signedRecruits.filter(
      r => r.academicsPriority === "Very Important" || r.academicsPriority === "Extremely Important"
    ).length;
    const academicPct = signedCount > 0 ? academicTopPriorityCount / signedCount : 0;
    if (academicPct >= 0.4 && transferOuts < 3) {
      academicsDelta = 1; academicsReason = "40%+ academic-priority recruits, low transfer rate";
    } else if (transferOuts >= 5) {
      academicsDelta = -1; academicsReason = "High transfer-out rate (5+ players)";
    }

    // ── STADIUM ──────────────────────────────────────────────────────────────
    // Spec: +1 if prestige ≥ stadium for 2 consecutive seasons (using prev_prestige);
    //       -1 if prestige < stadium for 2 consecutive seasons; else 0.
    let stadiumDelta = 0;
    let stadiumReason = "";
    const prevPrestige = team.prevPrestige ?? team.prestige; // prev_prestige = last season's prestige
    const thisSznAbove = team.prestige >= team.stadium;
    const lastSznAbove = prevPrestige >= team.stadium;
    if (thisSznAbove && lastSznAbove) {
      stadiumDelta = 1; stadiumReason = "Prestige sustained above stadium level for 2 seasons";
    } else if (!thisSznAbove && !lastSznAbove) {
      stadiumDelta = -1; stadiumReason = "Prestige sustained below stadium level for 2 seasons";
    }

    // ── COLLEGE LIFE ─────────────────────────────────────────────────────────
    // Spec: +1 if ≥30% of signed class was 1–2★ AND retention >80%;
    //       -1 if retention <60% OR class entirely 4–5★.
    let collegeLifeDelta = 0;
    let collegeLifeReason = "";
    const lowStarCount = signedRecruits.filter(r => (r.starRating ?? 3) <= 2).length;
    const lowStarPct = signedCount > 0 ? lowStarCount / signedCount : 0;
    const retentionRate = 1 - totalDepartures / 25; // approx: 25-man roster before departures
    const allHighStar = signedCount > 0 && signedRecruits.every(r => (r.starRating ?? 3) >= 4);
    if (lowStarPct >= 0.3 && retentionRate > 0.8) {
      collegeLifeDelta = 1; collegeLifeReason = "30%+ lower-star recruits signed, high retention";
    } else if (retentionRate < 0.6 || allHighStar) {
      collegeLifeDelta = -1;
      collegeLifeReason = retentionRate < 0.6 ? "Poor roster retention" : "Recruiting class entirely 4–5★";
    }

    // ── Compute new values ───────────────────────────────────────────────────
    const newPrestige    = clamp(team.prestige    + prestigeDelta);
    const newFacilities  = clamp(team.facilities  + facilitiesDelta);
    const newAcademics   = clamp(team.academics   + academicsDelta);
    const newStadium     = clamp(team.stadium     + stadiumDelta);
    const newCollegeLife = clamp(team.collegeLife + collegeLifeDelta);

    // Always update prev_* and baselines (idempotent; baselines seeded on first run)
    await storage.updateTeam(team.id, {
      prestigeBaseline:    team.prestigeBaseline   ?? team.prestige,
      facilitiesBaseline:  team.facilitiesBaseline ?? team.facilities,
      academicsBaseline:   team.academicsBaseline  ?? team.academics,
      stadiumBaseline:     team.stadiumBaseline     ?? team.stadium,
      collegeLifeBaseline: team.collegeLifeBaseline ?? team.collegeLife,
      prevPrestige:    team.prestige,
      prevFacilities:  team.facilities,
      prevAcademics:   team.academics,
      prevStadium:     team.stadium,
      prevCollegeLife: team.collegeLife,
      prestige:    newPrestige,
      facilities:  newFacilities,
      academics:   newAcademics,
      stadium:     newStadium,
      collegeLife: newCollegeLife,
    });

    // ── Emit event with structured per-attribute reason strings ───────────────
    type AttrChange = { attr: string; label: string; prev: number; curr: number; delta: number; reason: string };
    const changeList: AttrChange[] = [];
    if (newPrestige    !== team.prestige)    changeList.push({ attr: "prestige",    label: "Prestige",     prev: team.prestige,    curr: newPrestige,    delta: newPrestige - team.prestige,       reason: prestigeReason });
    if (newFacilities  !== team.facilities)  changeList.push({ attr: "facilities",  label: "Facilities",   prev: team.facilities,  curr: newFacilities,  delta: newFacilities - team.facilities,   reason: facilitiesReason });
    if (newAcademics   !== team.academics)   changeList.push({ attr: "academics",   label: "Academics",    prev: team.academics,   curr: newAcademics,   delta: newAcademics - team.academics,     reason: academicsReason });
    if (newStadium     !== team.stadium)     changeList.push({ attr: "stadium",     label: "Stadium",      prev: team.stadium,     curr: newStadium,     delta: newStadium - team.stadium,         reason: stadiumReason });
    if (newCollegeLife !== team.collegeLife) changeList.push({ attr: "collegeLife", label: "College Life", prev: team.collegeLife, curr: newCollegeLife, delta: newCollegeLife - team.collegeLife, reason: collegeLifeReason });

    if (changeList.length > 0) {
      const desc = changeList
        .map(c => `${team.name} ${c.label} ${c.delta > 0 ? "▲" : "▼"}${Math.abs(c.delta)} — ${c.reason}`)
        .join("; ");
      try {
        await storage.createLeagueEvent({
          leagueId,
          teamId: team.id,
          eventType: "PROGRAM_ATTR_CHANGE",
          description: desc,
          season: completedSeason,
          week: 0,
          metadata: { teamId: team.id, changes: changeList },
        });
      } catch (_) { /* non-fatal */ }
    }
  }
}

async function performSeasonTransition(leagueId: string, completedSeason: number) {
  const signingResult = await finalizeSigningDay(leagueId, completedSeason);
  const walkonResult = await finalizeWalkonsPhase(leagueId, completedSeason);

  return {
    transferred: signingResult.transferred,
    recruitsAdded: signingResult.recruitsAdded + walkonResult.walkonsAdded,
    newRecruits: walkonResult.newRecruits,
    playersProgressed: signingResult.playersProgressed,
    auctionResultsByTeam: walkonResult.auctionResultsByTeam,
  };
}

// ============ ADMIN: DEDUP ROSTERS ============
// Commissioner-only endpoint. Scans every team for players with the same
// firstName+lastName and removes the duplicate with the higher (later-inserted) id,
// preserving the original. Safe to call multiple times (idempotent).

// ── CPU recruiting helper (module scope) ────────────────────────────────────

async function runCpuRecruiting(leagueId: string, week: number, season: number, includeAllTeams = false, forcedHumanTeamIds: Set<string> = new Set()) {
  const league = await storage.getLeague(leagueId);
  const leagueDifficulty = league?.cpuDifficulty || "high_school";
  
  // CPU difficulty balance (V2):
  //   Auto-pilot and force-advanced human teams always use all_american difficulty,
  //   regardless of the league's CPU difficulty setting.
  //   V2: gainMultiplier and difficultyStretch removed.  Difficulty only affects
  //   decisions — topic quality, offer/visit thresholds, warmup gates, noise level.
  //   Action budget comes from getTurnContactCap() — identical formula to human routes.
  const difficultyConfig: Record<string, { targetingBonus: number; offerThreshold: number; visitThreshold: number; hcvThreshold: number; positionNeedWeight: number; requireWarmup: boolean; competitionAware: boolean }> = {
    beginner:     { targetingBonus: 0,  offerThreshold: 25, visitThreshold: 45, hcvThreshold: 60, positionNeedWeight: 5,  requireWarmup: false, competitionAware: false },
    high_school:  { targetingBonus: 5,  offerThreshold: 15, visitThreshold: 35, hcvThreshold: 50, positionNeedWeight: 12, requireWarmup: false, competitionAware: false },
    all_american: { targetingBonus: 10, offerThreshold: 10, visitThreshold: 25, hcvThreshold: 40, positionNeedWeight: 22, requireWarmup: true,  competitionAware: true  },
    elite:        { targetingBonus: 15, offerThreshold: 5,  visitThreshold: 20, hcvThreshold: 35, positionNeedWeight: 30, requireWarmup: true,  competitionAware: true  },
  };

  const aggression = Math.max(1, Math.min(5, league?.cpuRecruitingAggression ?? 3));
  const aggressionOffset = (3 - aggression) * 5;

  const buildConfig = (diff: string) => {
    const base = difficultyConfig[diff] || difficultyConfig.high_school;
    return {
      ...base,
      offerThreshold: Math.max(0, base.offerThreshold + aggressionOffset),
      visitThreshold: Math.max(0, base.visitThreshold + aggressionOffset),
    };
  };
  
  const teams = await storage.getTeamsByLeague(leagueId);
  // CPU teams + auto-pilot human teams always run. Forced human teams also run for fill-in.
  // Deadline-forced teams (human coaches auto-readied by deadline) also get CPU actions.
  const cpuTeams = includeAllTeams
    ? teams
    : teams.filter(t => t.isCpu || t.isAutoPilot || forcedHumanTeamIds.has(t.id));
  const recruits = await storage.getRecruitsByLeague(leagueId);
  const unsignedRecruits = recruits.filter(r => !r.signedTeamId);
  
  if (unsignedRecruits.length === 0 || cpuTeams.length === 0) return;
  
  const allCoaches = await storage.getCoachesByLeague(leagueId);

  // Storyline recruits get visible interest fluctuation (±15% volatility swing per action)
  const storylineRows = league ? await storage.getStorylineRecruitsByLeague(leagueId, league.currentSeason) : [];
  const storylineRecruitIds = new Set(storylineRows.map(sl => sl.recruitId));

  // Always fetch league interests — auto-pilot/forced teams use all_american (competitionAware=true)
  const allLeagueInterestsForCpu = await storage.getRecruitingInterestsByLeague(leagueId);

  console.time("[advance-perf] cpu-recruiting-teams");
  await Promise.all(cpuTeams.map(async (team) => {
    const teamCoach = allCoaches.find(c => c.teamId === team.id);

    // Auto-pilot and force-advanced teams use all_american difficulty (just below elite)
    // regardless of the league's CPU difficulty setting.
    const isSpecialHandling = team.isAutoPilot || forcedHumanTeamIds.has(team.id);
    const teamDifficulty = isSpecialHandling ? "all_american" : leagueDifficulty;
    const config = buildConfig(teamDifficulty);

    // V2: derive contact cap from the canonical balance module — same formula as human routes.
    // Difficulty affects decisions (topic quality, offer timing, warmup gates), not resource volume.
    const avgRecruitSkill = Math.floor(
      ((teamCoach?.pitchingRecruitingSkill || 1) + (teamCoach?.hittingRecruitingSkill || 1)) / 2
    );
    const avgScoutSkill = Math.floor(
      ((teamCoach?.scoutingSkill || 1) + (teamCoach?.evaluationSkill || 1)) / 2
    );
    const cpuArchetype = (teamCoach?.archetype as string | undefined) || "Balanced";
    const cpuHasQuickStudy = !!(teamCoach?.perks as Record<string, boolean> | null)?.scout_quick_study;
    const budgetInput = {
      seasonLength: league?.seasonLength,
      dynastyPreset: league?.dynastyPreset,
      avgRecruitSkill,
      avgScoutSkill,
      archetype: cpuArchetype,
      hasQuickStudy: cpuHasQuickStudy,
      currentPhase: league?.currentPhase || "regular_season",
      currentWeek: week,
    };
    const actionsBudget = getTurnContactCap(budgetInput);
    const scoutBudget = getTurnScoutCap(budgetInput);
    if (process.env.NODE_ENV !== "production") {
      // Cap-parity assertion: CPU and a human coach with identical inputs (same skill/archetype/phase/week)
      // must receive the same contact and scout caps from the canonical balance module.
      console.log(
        `[cap-parity][${team.isCpu ? "cpu" : "autopilot"}] ${team.name}` +
        ` contact=${actionsBudget} scout=${scoutBudget}` +
        ` avgRecruit=${avgRecruitSkill} avgScout=${avgScoutSkill} arch=${cpuArchetype}` +
        ` phase=${league?.currentPhase} wk=${week}` +
        ` — human with same inputs yields identical caps`
      );
    }

    // Per-team action summary for auto-pilot log (populated if isSpecialHandling)
    const actionSummary = { emails: 0, phones: 0, visits: 0, hcVisits: 0, offers: 0, scoutingDone: 0, recruitsTargeted: [] as { name: string; position: string; stars: number; action: string }[] };
    
    const [teamInterests, roster, teamActionsLog] = await Promise.all([
      storage.getRecruitingInterestsByTeam(team.id),
      storage.getPlayersByTeam(team.id),
      storage.getRecruitingActionsLogByTeam(team.id, leagueId),
    ]);
    
    // Per-recruit weekly cap tracker (mirrors human path: 1 phone & 1 email per recruit per week)
    const weeklyActionKey = (recruitId: string, type: string) => `${recruitId}:${type}`;
    const weeklyActionsThisWeek = new Set<string>();
    for (const a of teamActionsLog) {
      if (a.week === week && a.season === season) {
        weeklyActionsThisWeek.add(weeklyActionKey(a.recruitId, a.actionType));
      }
    }
    
    const positionCounts: Record<string, number> = {};
    for (const player of roster) {
      positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;
    }
    
    // Read coach strategy for geography and style targeting
    const geoStrategy = (teamCoach as any)?.recruitingGeographyStrategy ?? "national";
    const styleStrategy = (teamCoach as any)?.recruitingStyleStrategy ?? "best_available";

    // Build a per-recruit interest count map for competition awareness (AA/Elite only).
    // Key = recruitId, value = number of OTHER teams with interest >= 20.
    // Uses snapshot fetched once outside the team loop to avoid N redundant DB queries.
    const rivalCountByRecruit = new Map<string, number>();
    if (config.competitionAware) {
      for (const ri of allLeagueInterestsForCpu) {
        if (ri.teamId !== team.id && (ri.interestLevel || 0) >= 20) {
          rivalCountByRecruit.set(ri.recruitId, (rivalCountByRecruit.get(ri.recruitId) || 0) + 1);
        }
      }
    }

    const sortedRecruits = unsignedRecruits
      .map(r => {
        const interest = teamInterests.find(i => i.recruitId === r.id);
        const prestigeMatch = Math.abs((team.prestige || 5) - (r.starRating || 3) * 2);

        // Position-need scoring — weight scales with difficulty so higher tiers fill gaps more intentionally.
        // Beginner barely notices gaps; Elite strongly prefers recruits who plug roster holes.
        const posCount = positionCounts[r.position] || 0;
        const positionNeed = posCount < 2
          ? config.positionNeedWeight
          : posCount < 3
            ? Math.round(config.positionNeedWeight * 0.4)
            : 0;

        const currentInterest = interest?.interestLevel || 0;
        const offerBonus = interest?.hasOffer ? 20 : 0;

        // Competition awareness (AA/Elite only): if rivals are heavily invested,
        // escalate scoring to fight for the recruit; if already outgunned (3+ rivals),
        // slightly deprioritize and redirect budget to winnable targets.
        let competitionBonus = 0;
        if (config.competitionAware) {
          const rivals = rivalCountByRecruit.get(r.id) || 0;
          if (rivals === 0) competitionBonus = 8;          // uncontested — good target
          else if (rivals <= 2) competitionBonus = 3;      // light competition — still worthwhile
          else if (rivals <= 4) competitionBonus = -5;     // crowded — deprioritize slightly
          else competitionBonus = -14;                     // heavily contested — redirect budget
        }

        // Geography strategy: bonus for recruits from targeted state(s)
        let geoBonus = 0;
        const rState = r.homeState || "";
        if (geoStrategy === "texas" && rState === "TX") geoBonus = 18;
        else if (geoStrategy === "california" && rState === "CA") geoBonus = 18;
        else if (geoStrategy === "florida" && rState === "FL") geoBonus = 18;
        else if (geoStrategy === "local_regional") {
          if (rState === team.state) geoBonus = 15;
          else {
            const westStates = ["CA","OR","WA","NV","AZ","UT","CO","ID","MT","WY","NM","AK","HI"];
            const southStates = ["TX","FL","GA","AL","MS","LA","AR","TN","SC","NC","KY","VA","WV","OK"];
            const midwestStates = ["IL","OH","IN","MI","WI","MN","IA","MO","ND","SD","NE","KS"];
            const northeast = ["NY","PA","NJ","MA","CT","RI","NH","VT","ME","MD","DE","DC"];
            const inRegion = (states: string[]) => states.includes(rState) && states.includes(team.state || "");
            if (inRegion(westStates) || inRegion(southStates) || inRegion(midwestStates) || inRegion(northeast)) geoBonus = 8;
          }
        }

        // Hidden-info rule: compute visible OVR from scouted midpoint + difficulty noise.
        // CPU must never sort/prioritize recruits using unrevealed r.overall or r.potential.
        // If scouted ≥10%: midpoint = (scoutedMin + scoutedMax) / 2
        // Otherwise: estimate from starRating band (star × 100 = band floor).
        // Noise: ±15 beginner, ±10 high_school, ±5 elite/all_american — simulates imperfect scouting.
        const scoutPct = interest?.scoutPercentage ?? 0;
        const hasPartialScout = scoutPct >= 10 && interest?.minOverall != null && interest?.maxOverall != null;
        const midpointOvr = hasPartialScout
          ? ((interest!.minOverall! + interest!.maxOverall!) / 2)
          : (r.starRating || 3) * 100;
        const noiseRange = teamDifficulty === "beginner" ? 15 : teamDifficulty === "high_school" ? 10 : 5;
        const visibleOvr = midpointOvr + (Math.random() * noiseRange * 2 - noiseRange);

        // Recruiting style strategy: bonus for preferred recruit profiles
        let styleBonus = 0;
        const stars = r.starRating || 3;
        if (styleStrategy === "top_prospects" && stars >= 4) styleBonus = 12;
        else if (styleStrategy === "high_potential") {
          // Use visibleOvr: above the star band (e.g. 4★ starts at 400) signals above-band potential.
          // Also use revealed potential if scouted to ≥50% (fog lifted at half-scouting).
          const aboveBand = visibleOvr > (stars * 100);
          const potRevealed = scoutPct >= 50 && (String(r.potential) === "A" || String(r.potential) === "B" || String(r.potential) === "B+");
          if (aboveBand || potRevealed) styleBonus = 10;
        }
        else if (styleStrategy === "all_in_few") {
          // Heavy interest bonus — go deep on already-engaged recruits
          styleBonus = Math.min(15, currentInterest * 0.2);
        }

        // Beginner adds more noise so it acts less rationally
        const noise = teamDifficulty === "beginner" ? Math.random() * 18 : Math.random() * 5;

        return { 
          recruit: r, 
          interest,
          score: currentInterest * 3 + offerBonus + positionNeed - Math.min(5, prestigeMatch) + config.targetingBonus + geoBonus + styleBonus + competitionBonus + noise,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Focus on top N recruits per week. Going deeper on fewer targets ensures
    // recruits actually reach signing thresholds (60–65% interest) within the
    // 4-week recruiting window rather than spreading actions thin across all 80.
    // Scale with difficulty so high-budget elite CPU can reach more recruits.
    // Strategy: spread_wide increases targets; all_in_few reduces to focus depth.
    let MAX_WEEKLY_TARGETS = { beginner: 12, high_school: 16, all_american: 20, elite: 24 }[teamDifficulty] ?? 16;
    if (styleStrategy === "spread_wide") MAX_WEEKLY_TARGETS = Math.min(30, MAX_WEEKLY_TARGETS + 8);
    else if (styleStrategy === "all_in_few") MAX_WEEKLY_TARGETS = Math.max(6, MAX_WEEKLY_TARGETS - 6);
    const focusedRecruits = sortedRecruits.slice(0, MAX_WEEKLY_TARGETS);
    
    // Pick the recruit's strongest priority topic so CPU benefits from
    // priority/school/proximity multipliers the way humans do.
    function pickBestTopic(recruit: any): string {
      const topicCandidates = ["reputation", "academics", "prestige", "facilities", "playingTime", "proximity"];
      const ranked = topicCandidates
        .map(t => ({ t, level: simCalculatePriorityBonus(t, recruit, team).matchLevel }))
        .sort((a, b) => {
          const order = { Extremely: 4, Very: 3, Somewhat: 2, "Not Important": 1 } as Record<string, number>;
          return (order[b.level] || 0) - (order[a.level] || 0);
        });
      return ranked[0]?.t || "reputation";
    }
    
    // Collect alert entries for this team (populated if auto-pilot or deadline-forced)
    const teamAlertEntries: Array<{
      recruitName: string; recruitStars: number; action: string;
      interestGain: number; week: number; season: number; isDeadlineForced: boolean;
    }> = [];
    const isDeadlineForced = forcedHumanTeamIds.has(team.id) && !team.isAutoPilot;

    const profile = getRecruitingBalanceProfile(league?.seasonLength, league?.dynastyPreset);
    let cpuSeasonCampusVisitsUsed = teamActionsLog.filter(a =>
      a.season === season && (a.actionType === "visit" || a.actionType === "campus_visit")
    ).length;
    let cpuSeasonHcVisitsUsed = teamActionsLog.filter(a =>
      a.season === season && a.actionType === "head_coach_visit"
    ).length;
    let cpuSeasonVisitsUsed = cpuSeasonCampusVisitsUsed + cpuSeasonHcVisitsUsed;
    let pointsSpent = 0;
    for (let i = 0; i < focusedRecruits.length && pointsSpent < actionsBudget; i++) {
      const { recruit, interest } = focusedRecruits[i];
      const remaining = actionsBudget - pointsSpent;
      
      // Action sequencing intelligence:
      // - Count how many prior interactions (email/phone) this team has had with recruit this dynasty.
      // - At AA/Elite (requireWarmup=true), CPU must warm up with at least 1 prior interaction before
      //   committing a visit slot, and at least 2 before extending an offer — preventing cold-offer spam.
      // - At Beginner/HS, actions are chosen more randomly (no warmup gate).
      const priorInteractions = teamActionsLog.filter(
        a => a.recruitId === recruit.id && (a.actionType === "email" || a.actionType === "phone")
      ).length;
      const hasVisited = teamActionsLog.some(a => a.recruitId === recruit.id && a.actionType === "visit");
      const currentInterestLevel = interest?.interestLevel || 0;

      const candidateActions: string[] = [];
      if (!weeklyActionsThisWeek.has(weeklyActionKey(recruit.id, "email"))) candidateActions.push("email");
      if (!weeklyActionsThisWeek.has(weeklyActionKey(recruit.id, "phone"))) candidateActions.push("phone", "phone");

      // Offer: must clear interest threshold. At AA/Elite, also require ≥2 warmup interactions
      // so CPU doesn't scatter cold offers across the board on week 1.
      const offerWarmupMet = !config.requireWarmup || priorInteractions >= 2;
      if (currentInterestLevel > config.offerThreshold && !interest?.hasOffer && offerWarmupMet) {
        candidateActions.push("offer", "offer");
      }

      // Visit: must clear interest threshold. At AA/Elite, require ≥1 warmup interaction
      // before burning the one-time visit slot on a cold prospect.
      // Also enforce the 20-visit season cap (campus + head coach combined).
      const visitWarmupMet = !config.requireWarmup || priorInteractions >= 1;
      const visitCost = getActionPointCost("visit", team.state, recruit.homeState);
      if (cpuSeasonCampusVisitsUsed < profile.campusVisitCap && cpuSeasonVisitsUsed < profile.visitCombinedCap
          && currentInterestLevel > config.visitThreshold && visitCost <= remaining
          && !hasVisited && visitWarmupMet) {
        candidateActions.push("visit", "visit");
      }
      const hasHcVisited = teamActionsLog.some(a => a.recruitId === recruit.id && a.actionType === "head_coach_visit");
      const hcvWarmupMet = !config.requireWarmup || priorInteractions >= 2;
      const hcvCost = getActionPointCost("head_coach_visit", team.state, recruit.homeState);
      if (cpuSeasonHcVisitsUsed < profile.headCoachVisitCap && cpuSeasonVisitsUsed < profile.visitCombinedCap
          && currentInterestLevel > config.hcvThreshold && hcvCost <= remaining
          && !hasHcVisited && hcvWarmupMet) {
        candidateActions.push("head_coach_visit");
      }
      if (candidateActions.length === 0) continue;
      
      const actionType = candidateActions[Math.floor(Math.random() * candidateActions.length)];
      const cost = getActionPointCost(actionType, team.state, recruit.homeState);
      if (cost > remaining) continue; // budget enforcement before execution
      
      // Use the SAME helper as the human path so multipliers match exactly.
      // For TRANSFER recruits, apply prestige-band and playing-time modifiers (same as human path).
      const cpuPrestigeBandMod = computePrestigeBandMod(recruit, team);
      const cpuPlayingTimeMod = computePlayingTimeMod(recruit, roster);
      let baseGain = 0;
      let interestGain = 0;
      if (actionType === "email") {
        const topic = pickBestTopic(recruit);
        const r = computeEmailGain(recruit, team, teamCoach, topic);
        const topicMod = topic === "prestige" ? cpuPrestigeBandMod : topic === "playingTime" ? cpuPlayingTimeMod : 1.0;
        baseGain = r.baseGain;
        interestGain = Math.round(r.interestGain * topicMod);
      } else if (actionType === "phone") {
        // Mirror human multi-topic phone (1-2 topics for CPU)
        const topicSet = [pickBestTopic(recruit)];
        if (Math.random() < 0.5) topicSet.push("reputation");
        const r = computePhoneGain(recruit, team, teamCoach, topicSet);
        // Apply per-topic transfer modifiers then sum
        const adjustedGain = r.pitchResults.reduce((s, pr) => {
          const mod = pr.topic === "prestige" ? cpuPrestigeBandMod : pr.topic === "playingTime" ? cpuPlayingTimeMod : 1.0;
          return s + Math.max(1, Math.round(pr.gain * mod));
        }, 0);
        baseGain = 6 * topicSet.length;
        interestGain = adjustedGain;
      } else if (actionType === "visit") {
        const r = computeVisitGain(recruit, team, teamCoach);
        baseGain = r.baseGain;
        interestGain = r.interestGain;
      } else if (actionType === "head_coach_visit") {
        // HCV: prestige-driven gain (same multiplier stack as human path: prestige × coach × priority)
        const prestigeBonus = simNormalizeAttrBonus(team.prestige || 5);
        const coachBonus = simCalculateCoachBonus(teamCoach, recruit, "head_coach_visit", team);
        const { bonus: priorityBonus } = simCalculatePriorityBonus("prestige", recruit, team);
        baseGain = 20 + Math.floor(Math.random() * 16);
        const totalMultiplier = Math.min(3.0, prestigeBonus * coachBonus * priorityBonus);
        interestGain = Math.max(5, Math.round(baseGain * totalMultiplier));
      } else { // offer
        const r = computeOfferGain(recruit, team, teamCoach);
        baseGain = r.baseGain;
        interestGain = Math.round(r.interestGain * cpuPlayingTimeMod);
      }
      // Storyline recruits: apply ±15% interest volatility for dramatic swings
      if (storylineRecruitIds.has(recruit.id)) {
        const swing = (Math.random() * 0.30) - 0.15; // -15% to +15%
        interestGain = Math.max(0, Math.round(interestGain * (1 + swing)));
      }
      assertInterestGainSane(`cpu_${actionType}`, interestGain, baseGain);
      weeklyActionsThisWeek.add(weeklyActionKey(recruit.id, actionType));
      if (actionType === "visit" || actionType === "campus_visit") {
        cpuSeasonCampusVisitsUsed++;
        cpuSeasonVisitsUsed++;
      } else if (actionType === "head_coach_visit") {
        cpuSeasonHcVisitsUsed++;
        cpuSeasonVisitsUsed++;
      }
      pointsSpent += cost;

      // Accumulate action summary for auto-pilot / force-advanced log
      if (isSpecialHandling) {
        if (actionType === "email") actionSummary.emails++;
        else if (actionType === "phone") actionSummary.phones++;
        else if (actionType === "visit") actionSummary.visits++;
        else if (actionType === "head_coach_visit") actionSummary.hcVisits++;
        else if (actionType === "offer") actionSummary.offers++;
        actionSummary.recruitsTargeted.push({
          name: `${recruit.firstName || ""} ${recruit.lastName || ""}`.trim() || "Unknown",
          position: recruit.position || "?",
          stars: recruit.starRating || 3,
          action: actionType,
        });
      }
      
      const isForced = forcedHumanTeamIds.has(team.id);
      const isAlertableAction = team.isAutoPilot || isDeadlineForced;
      // CPU budget is enforced via the local `remaining` variable before this point.
      // Pass coachId=null so the service skips atomicSpendRecruitPoints; CPU spend
      // is tracked locally and written to the ledger below. The service still handles
      // the idempotency gate (log), interest update, and top-schools update in the
      // correct order (log first, then side-effects).
      await executeRecruitingAction({
        actionType,
        recruitId: recruit.id,
        teamId: team.id,
        leagueId,
        coachId: null,
        week,
        season,
        interestGain,
        hasOffer: actionType === "offer",
        cost,
        maxAllowed: actionsBudget,
        notes: team.isAutoPilot
          ? `CPU (Auto-Pilot) ${actionType}`
          : isForced
            ? `CPU (Fill-In) ${actionType}`
            : `CPU ${actionType} action`,
        isAutoPilot: team.isAutoPilot || isForced,
      });

      // Collect alert entry for coach notification (auto-pilot or deadline-forced)
      if (isAlertableAction) {
        teamAlertEntries.push({
          recruitName: `${recruit.firstName} ${recruit.lastName}`,
          recruitStars: recruit.starRating ?? 3,
          action: actionType,
          interestGain,
          week,
          season,
          isDeadlineForced,
        });
      }
    }

    // V2: write contact points spent to ledger so auto-pilot/deadline-fill coaches see
    // accurate remaining budget when they regain control next turn.
    // Handles both existing rows (updates spent) and missing rows (creates with initial spend).
    if (isSpecialHandling && pointsSpent > 0 && league) {
      try {
        const turnIdx = getRecruitingTurnIndex(league.currentPhase, week, league.seasonLength);
        if (turnIdx >= 0) {
          const existingLedger = await storage.getTeamRecruitingLedger(leagueId, team.id, season, turnIdx);
          const prevSpent = existingLedger?.contactSpent ?? 0;
          const capValue = existingLedger?.contactCap ?? actionsBudget;
          await storage.upsertTeamRecruitingLedger({
            leagueId,
            teamId: team.id,
            season,
            recruitingTurnIndex: turnIdx,
            contactCap: capValue,
            contactSpent: Math.min(capValue, prevSpent + pointsSpent),
            scoutCap: existingLedger?.scoutCap ?? scoutBudget,
            scoutSpent: existingLedger?.scoutSpent ?? 0,
            targetsCap: existingLedger?.targetsCap ?? profile.targetBase,
            visitsCombinedCap: profile.visitCombinedCap,
            campusVisitCap: profile.campusVisitCap,
            headCoachVisitCap: profile.headCoachVisitCap,
            rulesVersion: 2,
          });
        }
      } catch (ledgerErr) {
        console.warn("[cpu-recruiting] Failed to charge ledger:", ledgerErr);
      }
    }

    // Store alert entries on the coach so they see what CPU did on their next login
    if (teamAlertEntries.length > 0 && teamCoach) {
      const existingAlert = (teamCoach.autoPilotPendingAlert as any[] | null) ?? [];
      await storage.updateCoach(teamCoach.id, {
        autoPilotPendingAlert: [...existingAlert, ...teamAlertEntries] as any,
      });
    }

    // Append log entry for auto-pilot / force-advanced teams if any actions were taken
    if (isSpecialHandling && actionSummary.recruitsTargeted.length > 0) {
      try {
        const currentTeam = await storage.getTeam(team.id);
        const existingLog: import("@shared/schema").AutoPilotLogEntry[] =
          (currentTeam?.autoPilotActionLog as import("@shared/schema").AutoPilotLogEntry[] | null) ?? [];
        const newEntry: import("@shared/schema").AutoPilotLogEntry = {
          week,
          season,
          isForced: forcedHumanTeamIds.has(team.id),
          summary: actionSummary,
        };
        // Keep last 20 entries max to avoid bloat
        const updatedLog = [...existingLog, newEntry].slice(-20);
        await storage.updateTeam(team.id, { autoPilotActionLog: updatedLog } as any);
      } catch (logErr) {
        console.error("[auto-pilot-log] Failed to append log entry:", logErr);
      }
    }
  }));
  console.timeEnd("[advance-perf] cpu-recruiting-teams");
}


export { simulateGame };

// ─── Authoritative Advance Engine ──────────────────────────────────────────────
// advanceLeagueStep and simulateUntil live here (not in a separate file) so they
// can call the private helpers defined above without circular imports. The service
// facade at server/services/advance/ re-exports these symbols.

export class AdvancePreconditionError extends Error {
  constructor(public readonly statusCode: number, public readonly body: Record<string, unknown>) {
    super(String(body.message ?? "Precondition failed"));
    this.name = "AdvancePreconditionError";
  }
}

export type AdvanceStepResult = { data: Record<string, unknown> };

/**
 * advanceLeagueStep — single authoritative advance of one league step.
 *
 * Handles every phase: regular-season weeks, preseason, postseason (conf-champ →
 * SR → CWS) and all offseason sub-phases (departures → recruiting × 4 →
 * signing-day → walkons → preseason). All side-effects (standings, stats,
 * recruiting, coach XP, news, storylines, digests) run inside this function so
 * that every entry point produces identical results.
 *
 * Throws AdvancePreconditionError for 4xx conditions (coaches not ready, etc.).
 * In `mode: "fast"` human-readiness gates and interactive-review steps are
 * bypassed so simulateUntil can loop without waiting for human input.
 */
/**
 * Returns true when a substep should be skipped because it already completed
 * in a prior (crashed) advance run, based on the persisted checkpoint set.
 *
 * Stage names passed here must match the keys emitted by setAdvanceProgress()
 * so the checkpoint reader and the skip-gate agree on the same identifiers.
 */
function stageAlreadyDone(name: string, done: Set<string> | undefined): boolean {
  if (!done || !done.has(name)) return false;
  console.log(`[advance-resume] Skipping stage "${name}" — already completed in prior advance run.`);
  return true;
}

export async function advanceLeagueStep(
  leagueId: string,
  actorUserId: string,
  opts: {
    mode?: "interactive" | "fast";
    savedRecruitingClassId?: string;
    /** Stage names (matching setAdvanceProgress keys) that completed in a prior crashed run. */
    completedStages?: Set<string>;
  } = {}
): Promise<AdvanceStepResult> {
  const { mode = "interactive", savedRecruitingClassId, completedStages } = opts;
  const fast = mode === "fast";

  const league = await storage.getLeague(leagueId);
  if (!league) throw new Error("League not found");

  const currentWeek = league.currentWeek;
  const nextWeek = currentWeek + 1;

  // ── Digest window + power rankings snapshot ─────────────────────────────
  const digestWindowStart = league.lastDigestAt ? new Date(league.lastDigestAt) : new Date();
  let digestPrevPowerRankings: Array<{ teamId: string; rank: number }> | null = null;
  try {
    const snapshot = await storage.computeLeaguePowerRankings(leagueId);
    digestPrevPowerRankings = snapshot;
    await storage.updateLeague(leagueId, { prevPowerRankings: snapshot } as any);
  } catch (snapErr) { console.error("[power-rankings-snapshot] Failed:", snapErr); }

  // ── Top schools interest snapshot (interactive, recruiting phases) ───────
  const recruitingActivePhases = ["recruiting", "preseason", "spring_training", "regular_season"];
  if (!fast && recruitingActivePhases.includes(league.currentPhase)) {
    try { await storage.snapshotTopSchoolsInterestForLeague(leagueId); }
    catch (snapErr) { console.error("[top-schools-snapshot] Failed:", snapErr); }
  }

  // ── Deadline auto-ready (interactive only) ──────────────────────────────
  const deadlineForcedTeamIds = new Set<string>();
  if (!fast && league.phaseDeadline && new Date(league.phaseDeadline) <= new Date()) {
    const allLeagueCoaches = await storage.getCoachesByLeague(leagueId);
    const allLeagueTeams = await storage.getTeamsByLeague(leagueId);
    const humanTeamIds = new Set(allLeagueTeams.filter(t => !t.isCpu && !t.isAutoPilot).map(t => t.id));
    const nonReadyHumanCoaches = allLeagueCoaches.filter(c => c.teamId && humanTeamIds.has(c.teamId) && !c.isReady);
    if (nonReadyHumanCoaches.length > 0) {
      await Promise.all(nonReadyHumanCoaches.map(c => storage.updateCoach(c.id, { isReady: true })));
      for (const c of nonReadyHumanCoaches) { if (c.teamId) deadlineForcedTeamIds.add(c.teamId); }
      if (league.currentPhase === Phase.OffseasonWalkons) {
        const teamsToUnblock = allLeagueTeams.filter(t => deadlineForcedTeamIds.has(t.id) && !t.walkonReady);
        if (teamsToUnblock.length > 0) await Promise.all(teamsToUnblock.map(t => storage.updateTeam(t.id, { walkonReady: true })));
      }
      const dlRecruitingPhases = ["recruiting", "preseason", "regular_season"];
      if (dlRecruitingPhases.includes(league.currentPhase)) {
        const nonAutoPilotForcedIds = new Set(nonReadyHumanCoaches.filter(c => { const t = allLeagueTeams.find(t => t.id === c.teamId); return t && !t.isAutoPilot; }).map(c => c.teamId!));
        if (nonAutoPilotForcedIds.size > 0) {
          await runCpuRecruiting(leagueId, currentWeek, league.currentSeason, false, nonAutoPilotForcedIds)
            .catch(e => console.error("[deadline-cpu-fill]", e));
        }
      }
      try { await storage.createLeagueEvent({ leagueId, eventType: "PHASE_CHANGE", description: `Deadline passed — ${nonReadyHumanCoaches.length} coach${nonReadyHumanCoaches.length !== 1 ? "es" : ""} auto-advanced.`, season: league.currentSeason, week: currentWeek }); }
      catch (e) { console.error("Deadline auto-ready feed error:", e); }
    }
  }

  // ── Human readiness gate (interactive, preseason/spring/regular only) ───
  if (!fast) {
    const readinessGatedPhases = ["preseason", "spring_training", "regular_season"];
    if (readinessGatedPhases.includes(league.currentPhase)) {
      const deadlinePassed = league.phaseDeadline && new Date(league.phaseDeadline) <= new Date();
      if (!deadlinePassed) {
        const gateCoaches = await storage.getCoachesByLeague(leagueId);
        const gateTeams = await storage.getTeamsByLeague(leagueId);
        const humanGateTeams = gateTeams.filter(t => !t.isCpu && !t.isAutoPilot);
        const humanTeamIdSet = new Set(humanGateTeams.map(t => t.id));
        const notReadyCoaches = gateCoaches.filter(c => c.teamId && humanTeamIdSet.has(c.teamId) && !c.isReady);
        if (notReadyCoaches.length > 0) {
          const notReadyTeamIds = new Set(notReadyCoaches.map(c => c.teamId!));
          const waitingTeams = humanGateTeams.filter(t => notReadyTeamIds.has(t.id)).map(t => t.name);
          const readyCount = humanGateTeams.length - waitingTeams.length;
          throw new AdvancePreconditionError(400, {
            message: `Not all coaches have marked ready. ${readyCount}/${humanGateTeams.length} ready. Waiting on: ${waitingTeams.join(", ")}`,
            readyCount, totalHumanTeams: humanGateTeams.length, waitingOn: waitingTeams,
          });
        }
      }
    }
  }

  // ── Season week count ───────────────────────────────────────────────────
  const maxWeeks = getSeasonMaxWeeks(league.seasonLength);

  // ── CPU recruiting (preseason/spring/regular only) ──────────────────────
  // Guarded: skip if this stage already completed in a prior (crashed) advance run.
  if (
    ["recruiting", "preseason", "regular_season"].includes(league.currentPhase) &&
    !stageAlreadyDone("cpu_recruiting", completedStages)
  ) {
    console.time("[advance-perf] cpu-recruiting");
    await runCpuRecruiting(leagueId, currentWeek, league.currentSeason, false, deadlineForcedTeamIds);
    console.timeEnd("[advance-perf] cpu-recruiting");
    setAdvanceProgress(leagueId, "cpu_recruiting", 100);
  }

  // ── Storyline events ────────────────────────────────────────────────────
  const storylinePhases = ["recruiting", "preseason", "spring_training", "regular_season", "conference_championship", "super_regionals", "cws"];
  if (storylinePhases.includes(league.currentPhase) && !stageAlreadyDone("storylines", completedStages)) {
    try {
      const existingStorylines = await storage.getStorylineRecruitsByLeague(leagueId, league.currentSeason);
      if (existingStorylines.length === 0) {
        const existingRecruits = await storage.getRecruitsByLeague(leagueId);
        if (existingRecruits.length > 0) {
          console.log(`[storylines] self-heal: no storyline recruits found for league ${leagueId} season ${league.currentSeason}, initializing now`);
          await initializeStorylineRecruits(leagueId, league.currentSeason, false, currentWeek);
        }
      }
      await generateAndResolveStorylineEvents(leagueId, league.currentSeason, nextWeek, league.seasonLength ?? "standard", maxWeeks, league.currentPhase);
    } catch (err) { console.error("[storylines] Failed to generate/resolve storyline events:", err); }
    setAdvanceProgress(leagueId, "storylines", 100);
  }

  // ── Recruit stage progression ───────────────────────────────────────────
  if (!stageAlreadyDone("recruit_stages", completedStages)) {
    console.time("[advance-perf] recruit-stages");
    await updateRecruitStages(leagueId, nextWeek);
    console.timeEnd("[advance-perf] recruit-stages");
    setAdvanceProgress(leagueId, "recruit_stages", 100);
  }

  // ── Reset weekly actions ────────────────────────────────────────────────
  // Note: reset_actions is intentionally NOT skipped on resume — clearing
  // scoutActionsUsed/recruitActionsUsed/isReady is idempotent and safe to re-apply.
  const coaches = await storage.getCoachesByLeague(leagueId);
  if (!stageAlreadyDone("reset_actions", completedStages)) {
    await Promise.all(coaches.map(coach => storage.updateCoach(coach.id, { scoutActionsUsed: 0, recruitActionsUsed: 0, isReady: false })));
    setAdvanceProgress(leagueId, "reset_actions", 100);
  }

  // ── Game simulation setup ───────────────────────────────────────────────
  // The game_simulation stage is the most expensive and the most important to
  // checkpoint correctly.  On resume, if games were already simulated (stored
  // as isComplete in the DB), the incompleteGames filter will naturally return
  // an empty list — so even without the stageAlreadyDone guard the sim is
  // effectively idempotent.  The guard provides the fast-path skip for the
  // overhead of loading season games and running the filter.
  const advanceWallStart = Date.now();
  const seasonGames = await storage.getGamesByLeagueSeason(leagueId, league.currentSeason);
  const isPostseasonPhase = ["conference_championship", "super_regionals", "cws"].includes(league.currentPhase);

  // Skip regular game simulation during preseason (only exhibition games run), postseason phases, or reported-mode leagues.
  const incompleteGames = (isPostseasonPhase || league.currentPhase === "preseason" || league.gameMode === "reported") ? [] : seasonGames.filter(g =>
    g.week === currentWeek && g.phase === "regular" && !g.isComplete
  );
  const leagueTeamsForSim = await storage.getTeamsByLeague(leagueId);
  const priorCompletedGames = (await storage.getGamesByLeague(leagueId)).filter(g => g.isComplete);

  setAdvanceProgress(leagueId, "game_simulation", 10);
  console.time("[advance-perf] game-sim");
  const gameResults = stageAlreadyDone("game_simulation", completedStages) ? [] : await Promise.all(incompleteGames.map(async (game) => {
    const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType, undefined, undefined, game.week);
    return { game, result };
  }));
  console.timeEnd("[advance-perf] game-sim");

  // Exhibition games (preseason / spring_training)
  const exhibitionGameResults: Array<{ game: (typeof seasonGames)[0]; result: { homeScore: number; awayScore: number; boxScore: string } }> = [];
  if (league.currentPhase === "preseason" || league.currentPhase === "spring_training") {
    const pendingExhibGames = seasonGames.filter(g => g.phase === "exhibition" && !g.isComplete);
    if (pendingExhibGames.length > 0) {
      await Promise.all(pendingExhibGames.map(async (game) => {
        const result = await simulateGame(game.homeTeamId, game.awayTeamId, "exhibition", undefined, undefined, game.week);
        await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, isComplete: true, boxScore: result.boxScore });
        exhibitionGameResults.push({ game, result });
      }));
      console.log(`[exhibition] Simulated ${pendingExhibGames.length} exhibition games for league ${leagueId}`);
    }
  }

  // Build userTeamGame (interactive only)
  const simUserCoach = fast ? null : coaches.find((c: any) => c.userId === actorUserId);
  const simUserTeamId = simUserCoach?.teamId;
  let userTeamGame: Record<string, unknown> | undefined;
  if (!fast && simUserTeamId && gameResults.length > 0) {
    const userGame = gameResults.find(({ game }) => game.homeTeamId === simUserTeamId || game.awayTeamId === simUserTeamId);
    if (userGame) {
      try {
        const box = JSON.parse(userGame.result.boxScore);
        const homeTeamObj = leagueTeamsForSim.find((t: any) => t.id === userGame.game.homeTeamId);
        const awayTeamObj = leagueTeamsForSim.find((t: any) => t.id === userGame.game.awayTeamId);
        userTeamGame = {
          homeTeam: homeTeamObj?.name ?? "Home", awayTeam: awayTeamObj?.name ?? "Away",
          homeAbbr: homeTeamObj?.abbreviation ?? "HME", awayAbbr: awayTeamObj?.abbreviation ?? "AWY",
          homeScore: userGame.result.homeScore, awayScore: userGame.result.awayScore,
          inningScores: box.innings ?? [],
          homeHits: box.home?.totals?.h ?? 0, awayHits: box.away?.totals?.h ?? 0,
          homeErrors: box.home?.errors ?? 0, awayErrors: box.away?.errors ?? 0,
          isHome: userGame.game.homeTeamId === simUserTeamId,
          homeColor: homeTeamObj?.primaryColor ?? "#FFD700", awayColor: awayTeamObj?.primaryColor ?? "#7eb8f7",
        };
      } catch { /* non-critical */ }
    }
  }

  const coachXpAccum = new Map<string, CoachXpDelta>();

  // Batch-finalize regular season games
  console.time("[advance-perf] standings-and-stats");
  await batchFinalizeGames(gameResults, leagueId, league.currentSeason, coachXpAccum, leagueTeamsForSim, coaches);
  await Promise.all(exhibitionGameResults.map(async ({ game, result }) => {
    try {
      const box = JSON.parse(result.boxScore);
      await finalizeGameAtomic(game, result.homeScore, result.awayScore, box, leagueId, { coachXpAccum, leagueTeams: leagueTeamsForSim, skipLeagueEvent: true, skipCacheInvalidation: true, finalizer: "advance-exhibition" });
    } catch (e) { console.error("[advance-week] exhibition finalizer error:", e); }
  }));
  console.timeEnd("[advance-perf] standings-and-stats");
  // Mark game simulation + persistence as complete AFTER batchFinalizeGames commits
  // all game results, standings, and stats to the DB.  This is the correct point
  // to write a pct=100 checkpoint — any crash after this line has persisted all
  // game-sim side-effects, so a resume can safely skip this stage.
  setAdvanceProgress(leagueId, "game_simulation", 100);

  const advanceWallMs = Date.now() - advanceWallStart;
  if (advanceWallMs > 10_000) {
    console.warn(`[advance-perf] SLOW ADVANCE: ${gameResults.length} games took ${advanceWallMs}ms (>10s) for league ${leagueId}`);
  } else {
    console.log(`[advance-perf] Advance complete: ${gameResults.length} games in ${advanceWallMs}ms for league ${leagueId}`);
  }

  await flushCoachXp(coachXpAccum, coaches);

  // ── News + activity feed (fire-and-forget) ──────────────────────────────
  if (incompleteGames.length > 0) {
    const completedThisWeek = gameResults.map(gr => ({ ...gr.game, homeScore: gr.result.homeScore, awayScore: gr.result.awayScore, isComplete: true, boxScore: gr.result.boxScore }));
    generateGameNewsArticles(leagueId, completedThisWeek, leagueTeamsForSim, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("News generation error:", e));
    if (currentWeek % 3 === 0) generateConferenceUpdateNews(leagueId, leagueTeamsForSim, league.currentSeason, currentWeek).catch(e => console.error("Conference news error:", e));
    try {
      const humanTeamIdsSet = new Set(leagueTeamsForSim.filter(t => !t.isCpu).map(t => t.id));
      const feedEvents: any[] = [];
      for (const { game, result } of gameResults) {
        const homeTeamFeed = leagueTeamsForSim.find(t => t.id === game.homeTeamId);
        const awayTeamFeed = leagueTeamsForSim.find(t => t.id === game.awayTeamId);
        if (!homeTeamFeed || !awayTeamFeed) continue;
        const homeWon = result.homeScore > result.awayScore;
        const winner = homeWon ? homeTeamFeed : awayTeamFeed;
        const loser = homeWon ? awayTeamFeed : homeTeamFeed;
        const winScore = homeWon ? result.homeScore : result.awayScore;
        const lossScore = homeWon ? result.awayScore : result.homeScore;
        const isRivalry = humanTeamIdsSet.has(homeTeamFeed.id) && humanTeamIdsSet.has(awayTeamFeed.id);
        let description = `${winner.abbreviation} def. ${loser.abbreviation} ${winScore}-${lossScore}${game.isConference ? " (Conf)" : ""}`;
        if (isRivalry) {
          const h2hPrior = priorCompletedGames.filter(g => (g.homeTeamId === homeTeamFeed.id && g.awayTeamId === awayTeamFeed.id) || (g.homeTeamId === awayTeamFeed.id && g.awayTeamId === homeTeamFeed.id));
          const winnerPriorWins = h2hPrior.filter(g => (g.homeTeamId === winner.id && (g.homeScore ?? 0) > (g.awayScore ?? 0)) || (g.awayTeamId === winner.id && (g.awayScore ?? 0) > (g.homeScore ?? 0))).length;
          const loserPriorWins = h2hPrior.length - winnerPriorWins;
          const winnerNewWins = winnerPriorWins + 1;
          const margin = winScore - lossScore;
          const resultFlair = margin === 1 ? "edges" : margin <= 3 ? "defeats" : "handles";
          description = `RIVALRY: ${winner.abbreviation} ${resultFlair} ${loser.abbreviation} ${winScore}-${lossScore}${game.isConference ? " (Conf)" : ""} — Series ${winnerNewWins}-${loserPriorWins} ${winner.abbreviation}`;
        }
        feedEvents.push({ leagueId, teamId: winner.id, teamName: winner.name, teamAbbreviation: winner.abbreviation, teamPrimaryColor: winner.primaryColor ?? null, eventType: isRivalry ? "RIVALRY_RESULT" : "GAME_RESULT", description, season: league.currentSeason, week: currentWeek });
      }
      Promise.all(feedEvents.map(ev => storage.createLeagueEvent(ev))).catch(e => console.error("Game feed event error:", e));
    } catch (e) { console.error("Game feed event error:", e); }
  }

  // ── POSTSEASON ──────────────────────────────────────────────────────────
  if (isPostseasonPhase) {
    if (league.currentPhase === "conference_championship") {
      const confGames = (await storage.getGamesByLeague(leagueId)).filter(g => g.phase === "conference_championship" && g.season === league.currentSeason && !g.isComplete);
      console.time("[advance-perf] conf-champ-games");
      const confGameResults = await Promise.all(confGames.map(async (game) => {
        const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType || "friday", undefined, undefined, game.week);
        return { game, result };
      }));
      await batchFinalizeGames(confGameResults, leagueId, league.currentSeason, coachXpAccum, leagueTeamsForSim, coaches, league.dynastyPreset === "full_season" ? { skipStandings: true } : undefined);
      console.timeEnd("[advance-perf] conf-champ-games");

      if (!fast && simUserTeamId && !userTeamGame) {
        const userCcResult = confGameResults.find(({ game }) => game.homeTeamId === simUserTeamId || game.awayTeamId === simUserTeamId);
        if (userCcResult) {
          try {
            const ccBox = JSON.parse(userCcResult.result.boxScore);
            const ccHt = leagueTeamsForSim.find((t: any) => t.id === userCcResult.game.homeTeamId);
            const ccAt = leagueTeamsForSim.find((t: any) => t.id === userCcResult.game.awayTeamId);
            userTeamGame = { homeTeam: ccHt?.name ?? "Home", awayTeam: ccAt?.name ?? "Away", homeAbbr: ccHt?.abbreviation ?? "HME", awayAbbr: ccAt?.abbreviation ?? "AWY", homeScore: userCcResult.result.homeScore, awayScore: userCcResult.result.awayScore, inningScores: ccBox.innings ?? [], homeHits: ccBox.home?.totals?.h ?? 0, awayHits: ccBox.away?.totals?.h ?? 0, homeErrors: ccBox.home?.errors ?? 0, awayErrors: ccBox.away?.errors ?? 0, isHome: userCcResult.game.homeTeamId === simUserTeamId, homeColor: ccHt?.primaryColor ?? "#FFD700", awayColor: ccAt?.primaryColor ?? "#7eb8f7" };
          } catch { /* non-critical */ }
        }
      }
      try {
        const postTeams = await storage.getTeamsByLeague(leagueId);
        const completedConf = (await storage.getGamesByLeague(leagueId)).filter(g => g.phase === "conference_championship" && g.season === league.currentSeason && g.isComplete);
        await generateGameNewsArticles(leagueId, completedConf, postTeams, league.currentSeason, currentWeek, "conference_championship");
        for (const cg of completedConf) {
          const homeWon = (cg.homeScore ?? 0) > (cg.awayScore ?? 0);
          const champId = homeWon ? cg.homeTeamId : cg.awayTeamId;
          const champT = leagueTeamsForSim.find(t => t.id === champId);
          if (champT) await storage.createLeagueEvent({ leagueId, teamId: champT.id, teamName: champT.name, teamAbbreviation: champT.abbreviation, teamPrimaryColor: champT.primaryColor ?? null, eventType: "AWARD", description: `${champT.name} wins the Conference Championship! Season ${league.currentSeason}.`, season: league.currentSeason, week: currentWeek });
        }
      } catch (e) { console.error("Postseason news error:", e); }
      try {
        const finalConfGames = (await storage.getGamesByLeague(leagueId)).filter(g => g.phase === "conference_championship" && g.season === league.currentSeason && g.isComplete);
        for (const cg of finalConfGames) {
          const homeWonCg = (cg.homeScore ?? 0) > (cg.awayScore ?? 0);
          const champTeamId = homeWonCg ? cg.homeTeamId : cg.awayTeamId;
          const champTeamForCoach = leagueTeamsForSim.find(t => t.id === champTeamId);
          if (champTeamForCoach?.coachId) {
            const champCoach = await storage.getCoach(champTeamForCoach.coachId);
            if (champCoach) {
              const newCC = champCoach.confChampionships + 1;
              await storage.updateCoach(champCoach.id, { confChampionships: newCC, legacyScore: computeLegacyScore({ ...champCoach, confChampionships: newCC }) });
              await awardPostseasonXp(champCoach.id, "conf_champ");
            }
          }
        }
      } catch (e) { console.error("Conf champ coach stats error:", e); }
      if (league.dynastyPreset === "full_season") {
        // Hard precondition: every conference must have a completed CC game
        // before we seed the national field.  Without this check a partial
        // advance (e.g. network retry that only ran some CC sims) would silently
        // seed incorrect brackets.
        const allConfsForFS = await storage.getConferencesByLeague(leagueId);
        const allGamesSnap = await storage.getGamesByLeague(leagueId);
        const completedCCConfs = new Set<string>();
        for (const g of allGamesSnap) {
          if (g.phase === "conference_championship" && g.season === league.currentSeason && g.isComplete) {
            const homeConf = leagueTeamsForSim.find((t: any) => t.id === g.homeTeamId)?.conferenceId;
            if (homeConf) completedCCConfs.add(homeConf);
          }
        }
        const missingCC = allConfsForFS.filter(c => !completedCCConfs.has(c.id));
        if (missingCC.length > 0) {
          throw new Error(
            `Cannot advance: conference championship not complete for: ` +
            `${missingCC.map(c => c.name).join(", ")}. Simulate all CC games first.`
          );
        }
        await selectAndSeedNationalField(leagueId, league.currentSeason);
        await generateFSSuperRegionals(leagueId, league.currentSeason);
      } else {
        await generateSuperRegionalBracket(leagueId, league.currentSeason);
      }
      // Phase flip is the final atomic step — persisted only after all CC side-effects complete.
      setAdvanceProgress(leagueId, "phase_transition", 100);
      const ccUpdatedLeague = await storage.updateLeague(league.id, { currentPhase: Phase.SuperRegionals, currentWeek: nextWeek });
      await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Conference Championships Complete", details: "Conference championship games have been played. Super Regionals begin!" });
      sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] conf-champ hook:", e));
      return { data: { ...ccUpdatedLeague, userTeamGame } };
    }

    if (league.currentPhase === "super_regionals") {
      const srPreSnap = (!fast && simUserTeamId) ? (await storage.getGamesByLeague(leagueId)).filter((g: any) => g.phase === "super_regionals" && g.season === league.currentSeason && !g.isComplete && (g.homeTeamId === simUserTeamId || g.awayTeamId === simUserTeamId)).map((g: any) => g.id) : [] as string[];
      let srResult: { done: boolean; champion1?: string; champion2?: string; allWinners?: string[]; isFSResult?: boolean };
      if (league.dynastyPreset === "full_season") {
        const fsIncompleteSR = (await storage.getGamesByLeague(leagueId)).filter((g: any) => g.phase === "super_regionals" && g.season === league.currentSeason && !g.isComplete);
        if (fsIncompleteSR.length > 0) {
          const fsSimResultsSR = await Promise.all(fsIncompleteSR.map(async (game: any) => { const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType || "friday", undefined, undefined, game.week); return { game, result }; }));
          await batchFinalizeGames(fsSimResultsSR, leagueId, league.currentSeason, coachXpAccum, leagueTeamsForSim, coaches, { skipStandings: true });
        }
        const bracketResult = await advanceFSSRBracket(leagueId, league.currentSeason);
        srResult = { done: bracketResult.done, champion1: bracketResult.winners[0], champion2: bracketResult.winners[1], allWinners: bracketResult.winners, isFSResult: true };
      } else {
        srResult = await advanceSuperRegionals(leagueId, league.currentSeason);
      }
      if (!fast && srPreSnap.length > 0 && !userTeamGame) {
        try {
          const srAllGames = await storage.getGamesByLeague(leagueId);
          const srDoneGame = (srAllGames as any[]).find((g: any) => srPreSnap.includes(g.id) && g.isComplete);
          if (srDoneGame) {
            const srBox = JSON.parse(srDoneGame.boxScore ?? "{}");
            const srHt = leagueTeamsForSim.find((t: any) => t.id === srDoneGame.homeTeamId);
            const srAt = leagueTeamsForSim.find((t: any) => t.id === srDoneGame.awayTeamId);
            userTeamGame = { homeTeam: srHt?.name ?? "Home", awayTeam: srAt?.name ?? "Away", homeAbbr: srHt?.abbreviation ?? "HME", awayAbbr: srAt?.abbreviation ?? "AWY", homeScore: srDoneGame.homeScore ?? 0, awayScore: srDoneGame.awayScore ?? 0, inningScores: srBox.innings ?? [], homeHits: srBox.home?.totals?.h ?? 0, awayHits: srBox.away?.totals?.h ?? 0, homeErrors: srBox.home?.errors ?? 0, awayErrors: srBox.away?.errors ?? 0, isHome: srDoneGame.homeTeamId === simUserTeamId, homeColor: srHt?.primaryColor ?? "#FFD700", awayColor: srAt?.primaryColor ?? "#7eb8f7" };
          }
        } catch { /* non-critical */ }
      }
      if (srResult.done && !srResult.champion1) {
        try { const diagGames = await storage.getGamesByLeague(leagueId); const diagSR = diagGames.filter((g: any) => g.phase === "super_regionals" && g.season === league.currentSeason); console.warn(`[postseason-skip] SR done but no champion — league=${leagueId} season=${league.currentSeason} srGameCount=${diagSR.length} srResult=${JSON.stringify(srResult)}`); } catch { /* diagnostic */ }
        try { const swept = await catchUpAndResolveStorylineArcs(leagueId, league.currentSeason, league.currentWeek ?? 1); if (swept > 0) console.log(`[storylines] sr→offseason catch-up resolved ${swept} arc events`); } catch (e) { console.warn("[storylines] sr→offseason catch-up failed:", e); }
        // Phase flip is the final atomic step — persisted only after all SR-skip side-effects complete.
        setAdvanceProgress(leagueId, "phase_transition", 100);
        const srSkipLeague = await storage.updateLeague(league.id, { currentPhase: Phase.OffseasonDepartures, currentWeek: nextWeek, currentClassVintage: null });
        await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Postseason Skipped", details: "Not enough teams for postseason bracket." });
        try { await evaluatePlayerPromises(leagueId, league.currentSeason); const depResult = await processOffseasonDepartures(leagueId, league.currentSeason); await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Offseason: Departures Phase", details: `${depResult.graduated} graduating, ${depResult.draftDeclared} draft eligible, ${depResult.transferPortal} considering transfer.` }); generateDeparturesSummaryNews(leagueId, league.currentSeason, depResult.graduated, depResult.draftDeclared, depResult.transferPortal).catch(e => console.error("Departures news error (sr-skip):", e)); } catch (e) { console.error("SR-skip departure processing error:", e); }
        sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] sr-skipped hook:", e));
        return { data: { ...srSkipLeague, userTeamGame } };
      }
      if (srResult.done && srResult.isFSResult && (srResult.allWinners?.length ?? 0) > 0) {
        const allWinnersFS = srResult.allWinners ?? [];
        const entriesFS = await storage.getPostseasonEntriesByLeague(leagueId, league.currentSeason);
        const cwsOrderedFS = allWinnersFS.map(tId => ({ tId, seed: entriesFS.find(e => e.teamId === tId)?.nationalSeed ?? 99 })).sort((a, b) => a.seed - b.seed).map(x => x.tId);
        const preInitCWSGamesFS = (await storage.getGamesByLeague(leagueId)).filter((g: any) => g.phase === "cws" && g.season === league.currentSeason);
        const cwsAlreadyInitFS = preInitCWSGamesFS.length > 0;
        await initializeFSCWSBrackets(leagueId, league.currentSeason, cwsOrderedFS);
        if (!cwsAlreadyInitFS) { try { for (const cwsTeamId of allWinnersFS) { const cwsTeamEntry = leagueTeamsForSim.find(t => t.id === cwsTeamId); if (cwsTeamEntry?.coachId) { const cwsCoach = await storage.getCoach(cwsTeamEntry.coachId); if (cwsCoach) { const newCwsApp = cwsCoach.cwsAppearances + 1; await storage.updateCoach(cwsCoach.id, { cwsAppearances: newCwsApp, legacyScore: computeLegacyScore({ ...cwsCoach, cwsAppearances: newCwsApp }) }); await awardPostseasonXp(cwsCoach.id, "cws_appearance"); } } } } catch (e) { console.error("CWS appearances coach stats error:", e); } }
        // Phase flip is the final atomic step — persisted only after all FS-SR side-effects complete.
        setAdvanceProgress(leagueId, "phase_transition", 100);
        const srFSLeague = await storage.updateLeague(league.id, { currentPhase: Phase.CWS, currentWeek: nextWeek });
        await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Super Regionals Complete", details: `${allWinnersFS.length} teams advance to the College World Series!` });
        sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] sr-complete hook:", e));
        return { data: { ...srFSLeague, userTeamGame } };
      }
      if (srResult.done && !srResult.isFSResult && srResult.champion1 && srResult.champion2) {
        await storage.createGame({ leagueId, season: league.currentSeason, week: 0, homeTeamId: srResult.champion1, awayTeamId: srResult.champion2, phase: "cws" });
        try { for (const cwsTeamId of [srResult.champion1, srResult.champion2]) { const cwsTeamEntry = leagueTeamsForSim.find(t => t.id === cwsTeamId); if (cwsTeamEntry?.coachId) { const cwsCoach = await storage.getCoach(cwsTeamEntry.coachId); if (cwsCoach) { const newCwsApp = cwsCoach.cwsAppearances + 1; await storage.updateCoach(cwsCoach.id, { cwsAppearances: newCwsApp, legacyScore: computeLegacyScore({ ...cwsCoach, cwsAppearances: newCwsApp }) }); await awardPostseasonXp(cwsCoach.id, "cws_appearance"); } } } } catch (e) { console.error("CWS appearances coach stats error:", e); }
        // Phase flip is the final atomic step — persisted only after all std-SR side-effects complete.
        setAdvanceProgress(leagueId, "phase_transition", 100);
        const srStdLeague = await storage.updateLeague(league.id, { currentPhase: Phase.CWS, currentWeek: nextWeek });
        await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Super Regionals Complete", details: "The final two teams advance to the College World Series!" });
        sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] sr-complete hook:", e));
        return { data: { ...srStdLeague, userTeamGame } };
      }
      await storage.updateLeague(league.id, { currentWeek: nextWeek });
      await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Super Regionals Round Complete", details: "A round of the Super Regionals has been completed." });
      const srRoundLeague = await storage.getLeague(leagueId);
      sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] sr-round hook:", e));
      return { data: { ...srRoundLeague, userTeamGame } };
    }

    if (league.currentPhase === "cws") {
      const cwsPreSnap = (!fast && simUserTeamId) ? (await storage.getGamesByLeague(leagueId)).filter((g: any) => g.phase === "cws" && g.season === league.currentSeason && !g.isComplete && (g.homeTeamId === simUserTeamId || g.awayTeamId === simUserTeamId)).map((g: any) => g.id) : [] as string[];
      let cwsResult: { done: boolean; champion?: string; runnerUp?: string };
      if (league.dynastyPreset === "full_season") {
        const fsIncompleteCWS = (await storage.getGamesByLeague(leagueId)).filter((g: any) => g.phase === "cws" && g.season === league.currentSeason && !g.isComplete);
        if (fsIncompleteCWS.length > 0) { const fsSimResultsCWS = await Promise.all(fsIncompleteCWS.map(async (game: any) => { const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType || "friday", undefined, undefined, game.week); return { game, result }; })); await batchFinalizeGames(fsSimResultsCWS, leagueId, league.currentSeason, coachXpAccum, leagueTeamsForSim, coaches, { skipStandings: true }); }
        cwsResult = await advanceFSCWSBracket(leagueId, league.currentSeason);
      } else {
        cwsResult = await advanceCWS(leagueId, league.currentSeason);
      }
      if (!fast && cwsPreSnap.length > 0 && !userTeamGame) {
        try {
          const cwsAllGames = await storage.getGamesByLeague(leagueId);
          const cwsDoneGame = (cwsAllGames as any[]).find((g: any) => cwsPreSnap.includes(g.id) && g.isComplete);
          if (cwsDoneGame) { const cwsBox = JSON.parse(cwsDoneGame.boxScore ?? "{}"); const cwsHt = leagueTeamsForSim.find((t: any) => t.id === cwsDoneGame.homeTeamId); const cwsAt = leagueTeamsForSim.find((t: any) => t.id === cwsDoneGame.awayTeamId); userTeamGame = { homeTeam: cwsHt?.name ?? "Home", awayTeam: cwsAt?.name ?? "Away", homeAbbr: cwsHt?.abbreviation ?? "HME", awayAbbr: cwsAt?.abbreviation ?? "AWY", homeScore: cwsDoneGame.homeScore ?? 0, awayScore: cwsDoneGame.awayScore ?? 0, inningScores: cwsBox.innings ?? [], homeHits: cwsBox.home?.totals?.h ?? 0, awayHits: cwsBox.away?.totals?.h ?? 0, homeErrors: cwsBox.home?.errors ?? 0, awayErrors: cwsBox.away?.errors ?? 0, isHome: cwsDoneGame.homeTeamId === simUserTeamId, homeColor: cwsHt?.primaryColor ?? "#FFD700", awayColor: cwsAt?.primaryColor ?? "#7eb8f7" }; }
        } catch { /* non-critical */ }
      }
      if (cwsResult.done && cwsResult.champion) {
        const cwsLeagueTeams = await storage.getTeamsByLeague(leagueId);
        const champTeam = cwsLeagueTeams.find(t => t.id === cwsResult.champion);
        const runnerUpTeam = cwsLeagueTeams.find(t => t.id === cwsResult.runnerUp);
        try { if (champTeam?.coachId) { const champCoach = await storage.getCoach(champTeam.coachId); if (champCoach) { const newNatl = champCoach.nationalChampionships + 1; await storage.updateCoach(champCoach.id, { nationalChampionships: newNatl, legacyScore: computeLegacyScore({ ...champCoach, nationalChampionships: newNatl }) }); await awardPostseasonXp(champCoach.id, "cws_win"); } } } catch (e) { console.error("National championship coach stats error:", e); }
        try { const aaSelections = await countAllAmericanSelectionsForLeague(leagueId); await Promise.all([...aaSelections.entries()].map(async ([tId, aaCount]) => { const aaTeamEntry = cwsLeagueTeams.find(t => t.id === tId); if (!aaTeamEntry?.coachId) return; const aaCoach = await storage.getCoach(aaTeamEntry.coachId); if (!aaCoach) return; const newAAs = aaCoach.allAmericans + aaCount; await storage.updateCoach(aaCoach.id, { allAmericans: newAAs, legacyScore: computeLegacyScore({ ...aaCoach, allAmericans: newAAs }) }); })); } catch (e) { console.error("All-Americans coach stats error:", e); }
        try { const swept = await catchUpAndResolveStorylineArcs(leagueId, league.currentSeason, league.currentWeek ?? 1); if (swept > 0) console.log(`[storylines] cws→offseason catch-up resolved ${swept} arc events`); } catch (e) { console.warn("[storylines] cws→offseason catch-up failed:", e); }
        // Phase flip is the final atomic step — persisted only after all CWS side-effects complete.
        setAdvanceProgress(leagueId, "phase_transition", 100);
        const cwsChampLeague = await storage.updateLeague(league.id, { currentPhase: Phase.OffseasonDepartures, currentWeek: nextWeek, currentClassVintage: null });
        await storage.createAuditLog({ leagueId, userId: actorUserId, action: "CWS Champion Crowned!", details: `${champTeam?.name || "Unknown"} wins the College World Series over ${runnerUpTeam?.name || "Unknown"}!` });
        if (champTeam && runnerUpTeam) {
          try { await generateCWSChampionNewsArticle(leagueId, champTeam, runnerUpTeam, league.currentSeason); await storage.createLeagueEvent({ leagueId, teamId: champTeam.id, teamName: champTeam.name, teamAbbreviation: champTeam.abbreviation, eventType: "AWARD", description: `${champTeam.name} wins the College World Series! Season ${league.currentSeason} National Champions.`, season: league.currentSeason, week: nextWeek }); } catch (e) { console.error("CWS news generation error:", e); }
        }
        try {
          const cwsAllPlayers = await storage.getPlayersByLeague(leagueId);
          const allSeasonPlayers: { player: any; team: any }[] = [];
          for (const t of cwsLeagueTeams) { for (const p of cwsAllPlayers.filter(p => p.teamId === t.id)) allSeasonPlayers.push({ player: p, team: t }); }
          const byOVR = (a: any, b: any) => b.player.overall - a.player.overall;
          for (const { entry, label } of [{ entry: allSeasonPlayers.filter(x => x.player.position !== "P").sort(byOVR)[0], label: "Season MVP" }, { entry: allSeasonPlayers.filter(x => x.player.position === "P").sort(byOVR)[0], label: "Pitcher of the Year" }, { entry: allSeasonPlayers.filter(x => x.player.eligibility === "FR").sort(byOVR)[0], label: "Freshman of the Year" }]) {
            if (!entry) continue;
            await storage.createLeagueEvent({ leagueId, teamId: entry.team.id, teamName: entry.team.name, teamAbbreviation: entry.team.abbreviation, eventType: "AWARD", description: `${entry.player.firstName} ${entry.player.lastName} (${entry.team.abbreviation}) named Season ${league.currentSeason} ${label}.`, season: league.currentSeason, week: nextWeek });
          }
        } catch (e) { console.error("Season award event error:", e); }
        try {
          const promiseResult = await evaluatePlayerPromises(leagueId, league.currentSeason);
          if (promiseResult.broken > 0) await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Promise Evaluation", details: `${promiseResult.evaluated} promises evaluated: ${promiseResult.met} met, ${promiseResult.broken} broken.` });
          const depResult = await processOffseasonDepartures(leagueId, league.currentSeason);
          await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Offseason: Departures Phase", details: `${depResult.graduated} graduating, ${depResult.draftDeclared} draft eligible, ${depResult.transferPortal} considering transfer. Review departures before finalizing.` });
          generateDeparturesSummaryNews(leagueId, league.currentSeason, depResult.graduated, depResult.draftDeclared, depResult.transferPortal).catch(e => console.error("Departures news error:", e));
        } catch (e) { console.error("Auto-process departures error:", e); }
        sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] cws-champion hook:", e));
        return { data: { ...cwsChampLeague, cwsChampion: cwsResult.champion, cwsRunnerUp: cwsResult.runnerUp, userTeamGame } };
      }
      await storage.updateLeague(league.id, { currentWeek: nextWeek });
      await storage.createAuditLog({ leagueId, userId: actorUserId, action: "CWS Game Complete", details: "A game of the College World Series has been played." });
      const cwsRoundLeague = await storage.getLeague(leagueId);
      sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] cws-round hook:", e));
      return { data: { ...cwsRoundLeague, userTeamGame } };
    }
  } // end isPostseasonPhase

  // ── OFFSEASON ───────────────────────────────────────────────────────────
  const offseasonPhaseList = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];

  if (league.currentPhase === "offseason_departures") {
    try { const swept = await resolveAllPendingStorylineEvents(leagueId, league.currentSeason, league.currentWeek ?? 1); if (swept > 0) console.log(`[storylines] offseason_departures safety sweep resolved ${swept} pending arc events`); } catch (sweepErr) { console.warn("[storylines] offseason_departures safety sweep failed:", sweepErr); }
    const existingPending = await storage.getPendingDeparturesByLeague(leagueId);
    const hasValidDepartures = existingPending.some(p => p.departureType === "graduated" || p.departureType === "draft");
    if (!hasValidDepartures) {
      const promiseResult = await evaluatePlayerPromises(leagueId, league.currentSeason);
      if (promiseResult.broken > 0) await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Promise Evaluation", details: `${promiseResult.evaluated} promises evaluated: ${promiseResult.met} met, ${promiseResult.broken} broken.` });
      const departureResult = await processOffseasonDepartures(leagueId, league.currentSeason);
      await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Offseason: Departures Phase", details: `${departureResult.graduated} graduating, ${departureResult.draftDeclared} draft eligible, ${departureResult.transferPortal} considering transfer. Review departures before finalizing.` });
      generateDeparturesSummaryNews(leagueId, league.currentSeason, departureResult.graduated, departureResult.draftDeclared, departureResult.transferPortal).catch(e => console.error("Departures news error:", e));
      if (fast) {
        // Auto-finalize in fast mode — skip interactive review step
        const leagueForFin = await storage.getLeague(leagueId);
        if (leagueForFin) {
          const finalizeResult = await finalizeDeparturesInternal(leagueId, leagueForFin);
          const leagueTeams = await storage.getTeamsByLeague(leagueId);
          await Promise.all(leagueTeams.filter(t => t.departuresFinalized).map(t => storage.updateTeam(t.id, { departuresFinalized: false })));
          sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] departures-finalized hook:", e));
          return { data: { ...finalizeResult.updatedLeague, departed: { graduated: finalizeResult.graduated, drafted: finalizeResult.drafted, transferred: finalizeResult.transferred } } };
        }
      }
      return { data: { ...league, currentPhase: "offseason_departures", departures: departureResult, needsDepartureReview: true } };
    } else {
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const humanTeams = leagueTeams.filter(t => !t.isCpu && !t.isAutoPilot);
      const allReady = fast || humanTeams.every(t => t.departuresFinalized);
      if (!allReady) {
        const readyCount = humanTeams.filter(t => t.departuresFinalized).length;
        const notReadyTeams = humanTeams.filter(t => !t.departuresFinalized).map(t => t.name);
        throw new AdvancePreconditionError(400, { message: `Not all coaches have finalized departures. ${readyCount}/${humanTeams.length} ready. Waiting on: ${notReadyTeams.join(", ")}`, readyCount, totalHumanTeams: humanTeams.length, waitingOn: notReadyTeams });
      }
      const finalizeResult = await finalizeDeparturesInternal(leagueId, league);
      await Promise.all(leagueTeams.filter(t => t.departuresFinalized).map(t => storage.updateTeam(t.id, { departuresFinalized: false })));
      await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Departures Finalized", details: `${finalizeResult.graduated} graduated, ${finalizeResult.drafted} entered MLB draft, ${finalizeResult.transferred} entered transfer portal.` });
      sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] departures-finalized hook:", e));
      return { data: { ...finalizeResult.updatedLeague, departed: { graduated: finalizeResult.graduated, drafted: finalizeResult.drafted, transferred: finalizeResult.transferred } } };
    }
  }

  if (["offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4"].includes(league.currentPhase)) {
    await Promise.all([runCpuRecruiting(leagueId, league.currentWeek, league.currentSeason), runCpuTransferPortalRecruiting(leagueId)]);
    await updateRecruitStages(leagueId, league.currentWeek);
    const phaseIndex = offseasonPhaseList.indexOf(league.currentPhase);
    const nextPhase = offseasonPhaseList[phaseIndex + 1];
    // Phase flip is the final atomic step — persisted only after all offseason-recruiting side-effects complete.
    setAdvanceProgress(leagueId, "phase_transition", 100);
    const offRecLeague = await storage.updateLeague(league.id, { currentPhase: nextPhase, currentWeek: nextWeek });
    await storage.createAuditLog({ leagueId, userId: actorUserId, action: `Offseason Recruiting Week ${phaseIndex}`, details: `Offseason recruiting week ${phaseIndex} complete. CPU teams continue recruiting.` });
    sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] offseason-recruiting hook:", e));
    return { data: offRecLeague as Record<string, unknown> };
  }

  if (league.currentPhase === "offseason_signing_day") {
    const signingResult = await finalizeSigningDay(leagueId, league.currentSeason);
    await generateWalkonPool(leagueId);
    await processCpuWalkons(leagueId);
    const allTeamsSD = await storage.getTeamsByLeague(leagueId);
    await Promise.all(allTeamsSD.map(team => storage.updateTeam(team.id, { walkonReady: !!(team.isCpu || team.isAutoPilot) })));
    // Phase flip is the final atomic step — persisted only after signing day side-effects complete.
    setAdvanceProgress(leagueId, "phase_transition", 100);
    const sdLeague = await storage.updateLeague(league.id, { currentPhase: Phase.OffseasonWalkons, lastWalkonAuction: null });
    await storage.createAuditLog({ leagueId: league.id, userId: actorUserId, action: "Walk-On Phase Started", details: `Signing day complete. ${signingResult.recruitsAdded} recruits joined rosters. Teams can now make cuts and sign walk-ons.` });
    try { await storage.createLeagueEvent({ leagueId: league.id, eventType: "PHASE_CHANGE", description: `Signing Day complete — ${signingResult.recruitsAdded} recruits joined rosters league-wide`, season: league.currentSeason, week: league.currentWeek }); } catch (e) { console.error("League event error:", e); }
    return { data: sdLeague as Record<string, unknown> };
  }

  if (league.currentPhase === "offseason_walkons") {
    const allTeamsWO = await storage.getTeamsByLeague(leagueId);
    const allWOReady = fast || allTeamsWO.every(t => t.walkonReady);
    if (!allWOReady) {
      const notReadyWO = allTeamsWO.filter(t => !t.walkonReady).map(t => t.name);
      throw new AdvancePreconditionError(400, { message: `Not all teams have marked ready in the walk-on phase. Waiting on: ${notReadyWO.join(", ")}`, waitingOn: notReadyWO });
    }
    // Interactive: prompt commissioner to select a saved class if any exist
    let resolvedClassId = savedRecruitingClassId ?? "auto";
    if (!fast && !savedRecruitingClassId) {
      const userSavedClasses = actorUserId ? await storage.getSavedRecruitingClassesByUser(actorUserId) : [];
      if (userSavedClasses.length > 0) {
        return { data: { needs_class_selection: true, savedClasses: userSavedClasses.map(c => ({ id: c.id, name: c.name, recruitCount: c.recruitCount, createdAt: c.createdAt })), currentSeason: league.currentSeason } };
      }
    }
    let validatedAdvanceClass: ReturnType<typeof validateAndNormalizeRecruitingClass> | null = null;
    let savedClassName: string | null = null;
    if (!fast && resolvedClassId !== "auto") {
      const savedClass = await storage.getSavedRecruitingClass(String(resolvedClassId));
      if (!savedClass) throw new AdvancePreconditionError(404, { message: "Saved recruiting class not found." });
      if (savedClass.userId && savedClass.userId !== actorUserId) throw new AdvancePreconditionError(403, { message: "You do not own this saved recruiting class." });
      try { validatedAdvanceClass = validateAndNormalizeRecruitingClass(savedClass.classData as unknown); }
      catch (e) { if (e instanceof ClassValidationError) throw new AdvancePreconditionError(400, { message: `Saved class is invalid: ${(e as ClassValidationError).message}` }); throw e; }
      savedClassName = savedClass.name;
    }
    if (fast) await Promise.all(allTeamsWO.filter(t => !t.walkonReady).map(t => storage.updateTeam(t.id, { walkonReady: true })));
    // Skip generateRecruits inside finalizeWalkonsPhase when a staged class is
    // queued — avoid generating a class that will be immediately replaced and
    // running storyline init twice.
    const hasStagedClass = validatedAdvanceClass !== null && savedClassName !== null;
    const walkonResult = await finalizeWalkonsPhase(leagueId, league.currentSeason, hasStagedClass);
    if (hasStagedClass) {
      await replaceLeagueRecruitingClass({ leagueId, season: league.currentSeason + 1, recruits: validatedAdvanceClass!.recruits.map((r: any) => ({ ...r, leagueId })), vintage: null, initStorylines: true, saveState: { trigger: "pre_restore", label: `Pre-advance-class "${savedClassName}" (season ${league.currentSeason + 1})`, userId: actorUserId }, audit: { userId: actorUserId ?? "system", action: "Recruiting Class Loaded (Season Advance)", details: `Commissioner applied saved class "${savedClassName}" (${validatedAdvanceClass!.recruitCount} recruits) for season ${league.currentSeason + 1}` } });
      walkonResult.newRecruits = validatedAdvanceClass!.recruitCount;
    }
    // Phase flip is the final atomic step — persisted only after walk-on phase side-effects complete.
    setAdvanceProgress(leagueId, "phase_transition", 100);
    const woLeague = await storage.updateLeague(league.id, { currentWeek: 1, currentSeason: league.currentSeason + 1, currentPhase: Phase.Preseason });
    // Visit count sanity check (fire-and-forget)
    (async () => { try { const newSeason = league.currentSeason + 1; const teamsForCheck = await storage.getTeamsByLeague(leagueId); const violations: string[] = []; for (const t of teamsForCheck) { const vc = await storage.getSeasonVisitCount(t.id, leagueId, newSeason); if (vc.total > 0) violations.push(`${t.name}(${vc.campusVisits}cv+${vc.hcVisits}hcv)`); } if (violations.length > 0) console.warn(`[visit-count-sanity] WARN league=${leagueId} season=${newSeason} — ${violations.length} team(s) already have visit rows: ${violations.join(", ")}`); } catch (sanityErr) { console.warn("[visit-count-sanity] check failed:", sanityErr); } })();
    try {
      const [allTeamsForLineup, allPlayersForLineup] = await Promise.all([storage.getTeamsByLeague(leagueId), storage.getPlayersByLeague(leagueId)]);
      const lineupPlayersByTeam = new Map<string, typeof allPlayersForLineup>();
      for (const p of allPlayersForLineup) { if (!lineupPlayersByTeam.has(p.teamId)) lineupPlayersByTeam.set(p.teamId, []); lineupPlayersByTeam.get(p.teamId)!.push(p); }
      await Promise.all(allTeamsForLineup.filter(t => t.isCpu).map(t => autoAssignLineup(lineupPlayersByTeam.get(t.id) ?? [], t.id)));
    } catch (e) { console.error("CPU auto-lineup error:", e); }
    await storage.createAuditLog({ leagueId: league.id, userId: actorUserId, action: "Season Advanced", details: `Season ${league.currentSeason} ended. ${walkonResult.walkonsAdded} walk-ons joined, ${walkonResult.newRecruits} new recruits generated. Now Season ${league.currentSeason + 1}.` });
    storage.getTeamsByLeague(leagueId).then(previewTeams => generateSeasonPreviewNewsArticle(leagueId, previewTeams, league.currentSeason + 1)).catch(e => console.error("Season preview news error:", e));
    return { data: { ...woLeague, seasonTransition: walkonResult } };
  }

  // Legacy "offseason" phase — backward compat
  if (league.currentPhase === "offseason") {
    setAdvanceProgress(leagueId, "phase_transition", 100);
    const offLegacyLeague = await storage.updateLeague(league.id, { currentPhase: Phase.OffseasonDepartures, currentClassVintage: null });
    return { data: offLegacyLeague as Record<string, unknown> };
  }

  // ── Regular-season / preseason week advance ─────────────────────────────
  if (nextWeek > maxWeeks) {
    try { const swept = await resolveAllPendingStorylineEvents(leagueId, league.currentSeason, nextWeek + 9999); if (swept > 0) console.log(`[storylines] pre-postseason sweep: resolved ${swept} residual arc event(s) for league ${leagueId}`); } catch (e) { console.error("[storylines] pre-postseason sweep error:", e); }
    await generateConferenceChampionships(leagueId, league.currentSeason);
    try { await storage.resetPitcherRestForLeague(leagueId); console.log(`[pitcher-rest] Reset pitcher rest for all players in league ${leagueId} (advancing to week ${nextWeek}, conference_championship)`); } catch (restErr) { console.error("[pitcher-rest] Failed to reset pitcher rest:", restErr); }
    // Phase flip is the final atomic step — persisted only after all EOS side-effects complete.
    setAdvanceProgress(leagueId, "phase_transition", 100);
    const eosLeague = await storage.updateLeague(league.id, { currentPhase: Phase.ConferenceChampionship, currentWeek: nextWeek });
    await storage.createAuditLog({ leagueId, userId: actorUserId, action: "Regular Season Complete", details: "The regular season is over! Conference Championships begin." });
    try { await storage.createLeagueEvent({ leagueId, eventType: "PHASE_CHANGE", description: `Regular season complete — Conference Championships begin (Season ${league.currentSeason})`, season: league.currentSeason, week: nextWeek }); } catch (e) { console.error("League event error:", e); }
    sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] end-of-regular-season hook:", e));
    return { data: { ...eosLeague, userTeamGame } };
  }

  const newPhase =
    (league.currentPhase === Phase.Preseason || league.currentPhase === Phase.SpringTraining) && nextWeek >= 2
      ? Phase.RegularSeason
      : league.currentPhase;
  if (newPhase === Phase.RegularSeason && (league.currentPhase === Phase.Preseason || league.currentPhase === Phase.SpringTraining)) {
    await storage.clearProgressionDeltasForLeague(leagueId);
    console.log(`[Progression] Cleared progression deltas for league ${leagueId} (${league.currentPhase} -> regular_season)`);
    try { await storage.createLeagueEvent({ leagueId, eventType: "PHASE_CHANGE", description: `Regular season underway — Season ${league.currentSeason} begins!`, season: league.currentSeason, week: nextWeek }); } catch (e) { console.error("League event error:", e); }
  }
  try { await storage.resetPitcherRestForLeague(leagueId); console.log(`[pitcher-rest] Reset pitcher rest for all players in league ${leagueId} (advancing to week ${nextWeek})`); } catch (restErr) { console.error("[pitcher-rest] Failed to reset pitcher rest:", restErr); }
  const newPhaseWeek = (newPhase === Phase.RegularSeason && (league.currentPhase === Phase.Preseason || league.currentPhase === Phase.SpringTraining)) ? 1 : nextWeek;
  // Phase flip is the final atomic step — persisted only after all weekly-advance side-effects complete.
  setAdvanceProgress(leagueId, "phase_transition", 100);
  const updatedLeague = await storage.updateLeague(league.id, { currentWeek: newPhaseWeek, currentPhase: newPhase, phaseDeadline: null });
  await storage.createAuditLog({ leagueId: league.id, userId: actorUserId, action: "Week Advanced", details: `Advanced to Week ${nextWeek}` });
  sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase).catch(e => console.error("[digest] advance hook:", e));
  finalizeAdvanceDigestSafe({ leagueId, windowStart: digestWindowStart, season: league.currentSeason, weeks: [currentWeek], phase: league.currentPhase, prevPowerRankings: digestPrevPowerRankings });
  return { data: { ...updatedLeague, userTeamGame } };
}

/**
 * simulateUntil — fast-forward loop that calls advanceLeagueStep in fast mode
 * until the predicate returns true or maxIterations is reached.
 * All human-readiness gates are bypassed. actorUserId is used for audit logs.
 */
export async function simulateUntil(
  leagueId: string,
  actorUserId: string,
  predicate: (league: Record<string, unknown>) => boolean,
  { maxIterations = 200 }: { maxIterations?: number } = {}
): Promise<{ league: Record<string, unknown>; steps: number }> {
  let steps = 0;
  while (steps < maxIterations) {
    steps++;
    const { data } = await advanceLeagueStep(leagueId, actorUserId, { mode: "fast" });
    if (predicate(data)) return { league: data, steps };
  }
  throw new Error(`simulateUntil: max iterations (${maxIterations}) exceeded for league ${leagueId}`);
}

export function registerSimulationRoutes(app: Express): void {
  // ============ PLAY-BY-PLAY SIMULATION ============
  // Feature-flagged: set PBP_ENABLED=true (exact string) in the environment to enable.
  // Returns 404 (not 403) when disabled so clients treat it as a missing feature
  // rather than an auth failure.
  app.post("/api/leagues/:id/games/:gameId/play-by-play", requireAuth, async (req, res) => {
    if (process.env.PBP_ENABLED !== "true") {
      return res.status(404).json({ message: "Play-by-play is not available in this league." });
    }
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const game = await storage.getGame(gameId);
      if (!game || game.leagueId !== leagueId) {
        return res.status(404).json({ message: "Game not found" });
      }
      if (game.isComplete) {
        return res.status(400).json({ message: "Game is already complete" });
      }

      if (game.isConference && game.week && game.gameType) {
        const gameTypeOrder = ["friday", "saturday", "sunday"];
        const currentIdx = gameTypeOrder.indexOf(game.gameType);
        if (currentIdx > 0) {
          const allGames = await storage.getGamesByLeagueSeason(leagueId, game.season || 1);
          const seriesGames = allGames.filter(g =>
            g.week === game.week &&
            g.isConference &&
            ((g.homeTeamId === game.homeTeamId && g.awayTeamId === game.awayTeamId) ||
             (g.homeTeamId === game.awayTeamId && g.awayTeamId === game.homeTeamId))
          );
          for (let i = 0; i < currentIdx; i++) {
            const priorGame = seriesGames.find(g => g.gameType === gameTypeOrder[i]);
            if (priorGame && !priorGame.isComplete) {
              return res.status(400).json({ message: `Game ${i + 1} of this series must be completed first` });
            }
          }
        }
      }

      const homeTeam = await storage.getTeam(game.homeTeamId);
      const awayTeam = await storage.getTeam(game.awayTeamId);
      if (!homeTeam || !awayTeam) {
        return res.status(404).json({ message: "Teams not found" });
      }

      const homePlayers = await storage.getPlayersByTeam(game.homeTeamId);
      const awayPlayers = await storage.getPlayersByTeam(game.awayTeamId);

      function buildLineup(players: Player[], opposingSpHand?: string) {
        const positionPlayers = players.filter(p => p.position !== "P");
        const pitchers = players.filter(p => p.position === "P");
        const selected: Player[] = [];
        const used = new Set<string>();
        const playerDisplayPos = new Map<string, string>();

        // ── Infield selection with attribute composites ──────────────────────
        const pickForPos = (pos: string, scoreFn: (p: Player) => number) => {
          const candidates = positionPlayers.filter(p => p.position === pos && !used.has(p.id));
          if (candidates.length === 0) return;
          candidates.sort((a, b) => scoreFn(b) - scoreFn(a));
          selected.push(candidates[0]);
          used.add(candidates[0].id);
          playerDisplayPos.set(candidates[0].id, pos);
        };

        pickForPos("C",  p => (p.overall || 0));
        pickForPos("1B", p => (p.overall || 0));
        pickForPos("2B", p => (p.fielding || 0) * 0.5 + (p.speed || 0) * 0.3 + (p.overall || 0) * 0.2);
        pickForPos("3B", p => (p.arm || 0) * 0.4 + (p.fielding || 0) * 0.35 + (p.overall || 0) * 0.25);
        pickForPos("SS", p => (p.fielding || 0) * 0.5 + (p.arm || 0) * 0.5);

        // ── Outfield: CF (speed+fielding) → RF (arm) → LF (bat-first) ───────
        // Include all OF-eligible labels (LF, CF, RF, and generic OF)
        const ofCandidates = positionPlayers.filter(p => (p.position === "OF" || p.position === "LF" || p.position === "CF" || p.position === "RF") && !used.has(p.id));
        if (ofCandidates.length > 0) {
          ofCandidates.sort((a, b) => ((b.speed || 0) * 0.5 + (b.fielding || 0) * 0.5) - ((a.speed || 0) * 0.5 + (a.fielding || 0) * 0.5));
          const cf = ofCandidates.shift()!;
          selected.push(cf); used.add(cf.id); playerDisplayPos.set(cf.id, "CF");
        }
        if (ofCandidates.length > 0) {
          ofCandidates.sort((a, b) => (b.arm || 0) - (a.arm || 0));
          const rf = ofCandidates.shift()!;
          selected.push(rf); used.add(rf.id); playerDisplayPos.set(rf.id, "RF");
        }
        if (ofCandidates.length > 0) {
          ofCandidates.sort((a, b) => ((b.hitForAvg || 0) + (b.power || 0)) - ((a.hitForAvg || 0) + (a.power || 0)));
          const lf = ofCandidates.shift()!;
          selected.push(lf); used.add(lf.id); playerDisplayPos.set(lf.id, "LF");
        }

        const remaining = positionPlayers.filter(p => !used.has(p.id));
        remaining.sort((a, b) => ((b.hitForAvg || 0) + (b.power || 0)) - ((a.hitForAvg || 0) + (a.power || 0)));
        while (selected.length < 9 && remaining.length > 0) {
          const p = remaining.shift()!;
          selected.push(p);
          used.add(p.id);
        }

        while (selected.length < 9 && pitchers.length > 0) {
          const p = pitchers.shift()!;
          if (!used.has(p.id)) {
            selected.push(p);
            used.add(p.id);
          }
        }

        // ── Batting order construction (modern philosophy) ──────────────────
        // Platoon: reward vsLHP for RHBs/SHBs when facing a LH starter
        const platoonOBPBonus = (p: Player) =>
          opposingSpHand === "L" && (p.batHand || "R") !== "L"
            ? (p.vsLHP || 50) * 0.25 : 0;

        const leadoffScore    = (p: Player) => (p.speed || 0) * 0.45 + (p.hitForAvg || 0) * 0.45 + (p.clutch || 0) * 0.10 + platoonOBPBonus(p) * 0.5;
        const bestHitterScore = (p: Player) => (p.hitForAvg || 0) * 0.40 + (p.power || 0) * 0.35 + (p.speed || 0) * 0.15 + (p.clutch || 0) * 0.10 + platoonOBPBonus(p) * 0.5;
        const cleanupScore    = (p: Player) => (p.power || 0) * 0.55 + (p.clutch || 0) * 0.30 + (p.hitForAvg || 0) * 0.15 + platoonOBPBonus(p) * 0.5;
        const balancedScore   = (p: Player) => (p.hitForAvg || 0) * 0.35 + (p.power || 0) * 0.40 + (p.clutch || 0) * 0.15 + (p.speed || 0) * 0.10 + platoonOBPBonus(p) * 0.3;
        const slot7Score      = (p: Player) => (p.hitForAvg || 0) * 0.50 + (p.power || 0) * 0.30 + (p.speed || 0) * 0.20;
        const offensiveScore  = (p: Player) => (p.hitForAvg || 0) * 0.40 + (p.power || 0) * 0.35 + (p.speed || 0) * 0.15 + (p.clutch || 0) * 0.10;
        const slot9Score      = (p: Player) => (p.speed || 0) * 0.50 + (p.hitForAvg || 0) * 0.40 + (p.clutch || 0) * 0.10;

        const ordered: (Player | null)[] = new Array(9).fill(null);
        const slotted = new Set<string>();
        const pickSlot = (scoreFn: (p: Player) => number, worst = false) => {
          const avail = selected.filter(p => !slotted.has(p.id));
          if (avail.length === 0) return null;
          avail.sort((a, b) => worst ? scoreFn(a) - scoreFn(b) : scoreFn(b) - scoreFn(a));
          slotted.add(avail[0].id);
          return avail[0];
        };

        ordered[1] = pickSlot(bestHitterScore);        // 2-hole: best hitter (assigned first)
        ordered[2] = pickSlot(bestHitterScore);        // 3-hole: second-best bat
        ordered[0] = pickSlot(leadoffScore);           // leadoff: from remaining
        ordered[3] = pickSlot(cleanupScore);           // 4-hole: cleanup
        ordered[4] = pickSlot(balancedScore);           // 5-hole: balanced (matches slots 5–6 spec)
        ordered[8] = pickSlot(slot9Score);             // 9-hole: second leadoff
        ordered[7] = pickSlot(offensiveScore, true);   // 8-hole: weakest bat
        ordered[6] = pickSlot(slot7Score);             // 7-hole
        for (let slot = 5; slot < 9; slot++) { if (!ordered[slot]) ordered[slot] = pickSlot(balancedScore); }
        for (let slot = 0; slot < 9; slot++) { if (!ordered[slot]) ordered[slot] = pickSlot(offensiveScore); }

        const lineup = (ordered as Player[]).map((p, i) => {
          const displayPos = playerDisplayPos.get(p?.id) || p?.position || "DH";
          return {
            playerId: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            position: displayPos,
            order: i + 1,
            contact: p.hitForAvg || 50,
            power: p.power || 50,
            speed: p.speed || 50,
            fielding: p.fielding || 50,
            vsLHP: p.vsLHP || 50,
            clutch: p.clutch || 50,
            stealing: p.stealing || 50,
            batHand: p.batHand || "R",
            skinTone: p.skinTone || "light",
            hairColor: p.hairColor || "brown",
            hairStyle: p.hairStyle || "short",
            headwear: p.headwear || "cap",
            overall: p.overall || 300,
            abilities: p.abilities || [],
            trajectory: p.trajectory ?? 2,
          };
        });

        const fakeFirst = ["Jake", "Mike", "Chris", "Tyler", "Matt", "Ryan", "Josh", "Nick", "Ben"];
        const fakeLast = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez"];
        while (lineup.length < 9) {
          const idx = lineup.length;
          lineup.push({
            playerId: "fake_" + idx,
            firstName: fakeFirst[idx % fakeFirst.length],
            lastName: fakeLast[idx % fakeLast.length],
            position: "DH",
            order: lineup.length + 1,
            contact: 50, power: 40, speed: 50, fielding: 50,
            vsLHP: 50, clutch: 50, stealing: 40, batHand: "R" as string,
            skinTone: "light",
            hairColor: "brown",
            hairStyle: "short",
            headwear: "cap",
            overall: 300,
            abilities: [] as string[],
            trajectory: 2,
          });
        }

        return lineup;
      }

      interface PitcherRef {
        playerId: string;
        firstName: string;
        lastName: string;
        stuff: number;
        control: number;
        velocity: number;
        stamina: number;
        throwHand: string;
        wRISP: number;
        pitchingRole: string;
        skinTone: string;
        hairColor: string;
        hairStyle: string;
        headwear: string;
        overall: number;
        abilities: string[];
      }

      function toPitcherRef(p: Player): PitcherRef {
        return {
          playerId: p.id, firstName: p.firstName, lastName: p.lastName,
          stuff: p.stuff || 50, control: p.control || 50, velocity: p.velocity || 50,
          stamina: p.stamina || 60,
          throwHand: p.throwHand || "R",
          wRISP: p.wRISP || 50,
          pitchingRole: p.pitchingRole || "",
          skinTone: p.skinTone || "light",
          hairColor: p.hairColor || "brown",
          hairStyle: p.hairStyle || "short",
          headwear: p.headwear || "cap",
          overall: p.overall || 300,
          abilities: p.abilities || [],
        };
      }

      function pickPitchingStaff(players: Player[], gameType: string | null | undefined, currentWeek?: number | null) {
        const pitchers = players.filter(p => p.position === "P");
        // For fallback selection, score pitchers by the same philosophy as autoAssignLineup:
        // weekend slots (Fri/Sat/Sun) reward stamina; midweek slots are stamina-neutral with upside lean.
        const isWeekendSlot = gameType === "friday" || gameType === "saturday" || gameType === "sunday";
        const isMidweekSlot = gameType === "midweek";
        pitchers.sort((a, b) => {
          const score = (p: Player) => isWeekendSlot
            ? (p.overall || 0) * 0.70 + (p.stamina || 0) * 0.30
            : isMidweekSlot
            ? (p.overall || 0) * 0.85 + (p.potential || 0) * 0.15
            : (p.overall || 0);
          return score(b) - score(a);
        });

        const gameTypeToRole: Record<string, string> = {
          "friday": "FRI", "saturday": "SAT", "sunday": "SUN", "midweek": "MID",
        };
        const starterRoles = ["FRI", "SAT", "SUN", "MID"];
        const relieverRoles = ["LRP", "MR", "MR1", "MR2", "MR3", "SU", "CP"];

        const gameSlot = gameType ? (GAME_TYPE_TO_DAY[gameType] ?? null) : null;

        const isAvailable = (p: Player): boolean => {
          if (!gameSlot || currentWeek == null) return true;
          const avail = computePitcherAvailability(
            p.lastPitchedOuts ?? 0,
            p.lastPitchedWeek ?? null,
            (p.lastPitchedDay ?? null) as GameDay | null,
            p.stamina ?? 60,
            currentWeek,
            gameSlot,
          );
          return avail.available;
        };

        const targetRole = gameType ? gameTypeToRole[gameType] : null;

        // Priority: (1) exact-role + rested, (2) any starter + rested, (3) exact-role fallback, (4) any starter fallback, (5) anyone
        let starter: Player | null = null;
        if (targetRole) {
          starter = pitchers.find(p => p.pitchingRole === targetRole && isAvailable(p)) || null;
        }
        if (!starter) {
          starter = pitchers.find(p => starterRoles.includes(p.pitchingRole || "") && isAvailable(p)) || null;
        }
        if (!starter && targetRole) {
          starter = pitchers.find(p => p.pitchingRole === targetRole) || null;
        }
        if (!starter) {
          starter = pitchers.find(p => starterRoles.includes(p.pitchingRole || "")) || null;
        }
        if (!starter) {
          starter = pitchers[0] || players.sort((a, b) => (b.overall || 0) - (a.overall || 0))[0];
        }

        let bullpen = pitchers
          .filter(p => p.id !== starter!.id && relieverRoles.includes(p.pitchingRole || ""))
          .sort((a, b) => {
            const roleOrder = ["CP", "SU", "MR", "MR1", "MR2", "MR3", "LRP"];
            return roleOrder.indexOf(a.pitchingRole || "") - roleOrder.indexOf(b.pitchingRole || "");
          });
        if (bullpen.length === 0) {
          bullpen = pitchers.filter(p => p.id !== starter!.id).slice(0, 4);
        }
        bullpen = bullpen.slice(0, 4);

        return {
          starter: toPitcherRef(starter!),
          bullpen: bullpen.map(p => toPitcherRef(p)),
        };
      }

      // Compute staffs first so we know SP throwHand for platoon-aware lineup construction
      const homeStaff = pickPitchingStaff(homePlayers, game.gameType, game.week);
      const awayStaff = pickPitchingStaff(awayPlayers, game.gameType, game.week);
      const homePitcher = homeStaff.starter;
      const awayPitcher = awayStaff.starter;
      const homeLineup = buildLineup(homePlayers, awayStaff.starter.throwHand);
      const awayLineup = buildLineup(awayPlayers, homeStaff.starter.throwHand);

      let currentHomePitcher = homeStaff.starter;
      let currentAwayPitcher = awayStaff.starter;
      let homeBullpenIdx = 0;
      let awayBullpenIdx = 0;
      let homePitchCount = 0;
      let awayPitchCount = 0;

      const avgFielding = (players: Player[]) => {
        const fielders = players.filter(p => p.position !== "P");
        if (fielders.length === 0) return 50;
        return fielders.reduce((s, p) => s + (p.fielding || 50), 0) / fielders.length;
      };
      const homeFielding = avgFielding(homePlayers);
      const awayFielding = avgFielding(awayPlayers);

      const batterStats: Record<string, { ab: number; r: number; h: number; doubles: number; triples: number; hr: number; rbi: number; bb: number; so: number }> = {};
      const pitcherStats: Record<string, { outs: number; h: number; r: number; er: number; bb: number; so: number }> = {};

      for (const b of [...homeLineup, ...awayLineup]) {
        batterStats[b.playerId] = { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 };
      }
      for (const p of [homeStaff.starter, ...homeStaff.bullpen, awayStaff.starter, ...awayStaff.bullpen]) {
        pitcherStats[p.playerId] = { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };
      }

      let homeBatterIndex = 0;
      let awayBatterIndex = 0;
      let totalHomeScore = 0;
      let totalAwayScore = 0;

      interface AtBatResult {
        batterIndex: number;
        batterName: string;
        pitchSequence: string[];
        result: string;
        description: string;
        runnersAfter: [boolean, boolean, boolean];
        runsScored: number;
        outs: number;
      }

      interface HalfInningResult {
        atBats: AtBatResult[];
        runs: number;
        hits: number;
        errors: number;
      }

      interface InningResult {
        inning: number;
        topHalf: HalfInningResult;
        bottomHalf: HalfInningResult;
      }

      const innings: InningResult[] = [];

      const locations = ["to left field", "to center field", "to right field", "up the middle", "down the line", "to the gap"];
      const groundLocations = ["to shortstop", "to second base", "to third base", "to first base", "to the pitcher"];

      function generatePitchSequence(
        pitcherControl: number, pitcherStuff: number,
        batterContact: number, result: string
      ): string[] {
        const sequence: string[] = [];
        let balls = 0;
        let strikes = 0;

        const strikeProb = 0.45 + (pitcherControl / 100) * 0.2 - (batterContact / 100) * 0.1;
        const foulProb = 0.25 + (batterContact / 100) * 0.1;

        if (result === "hbp") {
          const pitchCount = Math.floor(Math.random() * 3);
          for (let i = 0; i < pitchCount; i++) {
            if (Math.random() < strikeProb) {
              if (strikes < 2) { sequence.push("strike"); strikes++; }
              else { sequence.push("foul"); }
            } else {
              if (balls < 3) { sequence.push("ball"); balls++; }
            }
          }
          sequence.push("hit_by_pitch");
          return sequence;
        }

        if (result === "walk") {
          while (balls < 4) {
            if (balls === 3 && strikes < 2) {
              sequence.push("ball");
              balls++;
            } else if (Math.random() < 0.4) {
              if (strikes < 2) { sequence.push("strike"); strikes++; }
              else { sequence.push("foul"); }
            } else {
              sequence.push("ball"); balls++;
            }
          }
          return sequence;
        }

        if (result === "strikeout") {
          while (strikes < 3) {
            if (Math.random() < 0.35 && balls < 3) {
              sequence.push("ball"); balls++;
            } else if (strikes === 2 && Math.random() < foulProb) {
              sequence.push("foul");
            } else {
              sequence.push("strike"); strikes++;
            }
          }
          return sequence;
        }

        const maxPitches = 2 + Math.floor(Math.random() * 5);
        for (let i = 0; i < maxPitches; i++) {
          if (balls >= 3 && strikes >= 2) break;
          const throwStrike = Math.random() < strikeProb;
          if (throwStrike) {
            if (strikes < 2) { sequence.push("strike"); strikes++; }
            else { sequence.push("foul"); }
          } else {
            if (balls < 3) { sequence.push("ball"); balls++; }
          }
        }
        sequence.push("in_play");
        return sequence;
      }

      function simulateHalfInning(
        battingLineup: typeof homeLineup,
        pitcherState: { current: PitcherRef; pitchCount: number; bullpen: PitcherRef[]; bullpenIdx: number },
        batterIndexRef: { value: number },
        defFielding: number,
        isHome: boolean,
        inning: number = 1,
        battingTeamScore: number = 0,
        pitchingTeamScore: number = 0,
        manfredRunner: string | null = null,
      ): HalfInningResult {
        let outs = 0;
        let runs = 0;
        let hits = 0;
        let errors = 0;
        let bases: [string | null, string | null, string | null] = [null, null, null];
        const atBats: AtBatResult[] = [];

        // College baseball extra-inning rule: Manfred runner starts on 2nd
        if (manfredRunner) {
          bases[1] = manfredRunner;
          atBats.push({
            batterIndex: -1,
            batterName: battingLineup.find(b => b.playerId === manfredRunner)
              ? `${battingLineup.find(b => b.playerId === manfredRunner)!.firstName[0]}. ${battingLineup.find(b => b.playerId === manfredRunner)!.lastName}`
              : "Runner",
            pitchSequence: [],
            result: "runner_placed",
            description: `Automatic runner placed on second base to start the inning`,
            runnersAfter: [false, true, false],
            runsScored: 0,
            outs: 0,
          });
        }

        // Quick-lookup map for steal attempts (need runner's stealing/speed attrs)
        const lineupMap = new Map(battingLineup.map(p => [p.playerId, p]));

        // Score-state bullpen: enter inning with CP (save sit) or SU (setup) if appropriate
        const leadMargin = pitchingTeamScore - battingTeamScore;
        const isSaveSituation = inning >= 9 && leadMargin >= 1 && leadMargin <= 3;
        const isSetupSituation = inning === 8 && leadMargin >= 1 && leadMargin <= 3;

        if ((isSaveSituation || isSetupSituation) && pitcherState.bullpenIdx < pitcherState.bullpen.length) {
          const targetRole = isSaveSituation ? "CP" : "SU";
          const roleIdx = pitcherState.bullpen.findIndex(
            (p, i) => i >= pitcherState.bullpenIdx && p.pitchingRole === targetRole
          );
          if (roleIdx >= 0) {
            const incoming = pitcherState.bullpen[roleIdx];
            const outgoing = pitcherState.current;
            pitcherState.current = incoming;
            pitcherState.bullpenIdx = roleIdx + 1;
            pitcherState.pitchCount = 0;
            const situationLabel = isSaveSituation ? "save situation" : "setup situation";
            atBats.push({
              batterIndex: -1,
              batterName: "",
              pitchSequence: [],
              result: "pitching_change",
              description: `Pitching change — ${incoming.firstName[0]}. ${incoming.lastName} enters for ${outgoing.firstName[0]}. ${outgoing.lastName} (${situationLabel})`,
              runnersAfter: [bases[0] !== null, bases[1] !== null, bases[2] !== null],
              runsScored: 0,
              outs,
            });
          }
        }

        while (outs < 3) {
          const batterIdx = batterIndexRef.value % 9;
          const batter = battingLineup[batterIdx];
          batterIndexRef.value++;

          const fieldingAvg = defFielding;
          const bnEarly = `${batter.firstName[0]}. ${batter.lastName}`;

          const fatigueFactor = pitcherState.pitchCount > pitcherState.current.stamina * 0.8
            ? Math.max(0.7, 1 - (pitcherState.pitchCount - pitcherState.current.stamina * 0.8) / 100)
            : 1;
          const stuff = pitcherState.current.stuff * fatigueFactor;
          const control = pitcherState.current.control * fatigueFactor;
          const velocity = pitcherState.current.velocity;

          // ── Intentional walk: dangerous batter, first base open, runners in scoring pos, late ──
          const isBatterDangerous = (batter.clutch + batter.contact) > 155;
          const runnersInScoringPos = bases[1] !== null || bases[2] !== null;
          if (isBatterDangerous && bases[0] === null && runnersInScoringPos && inning >= 8 && Math.random() < 0.38) {
            bases[0] = batter.playerId;
            atBats.push({
              batterIndex: batterIdx,
              batterName: `${batter.firstName} ${batter.lastName}`,
              pitchSequence: [],
              result: "intentional_walk",
              description: `${bnEarly} intentionally walked`,
              runnersAfter: [true, bases[1] !== null, bases[2] !== null],
              runsScored: 0,
              outs,
            });
            continue;
          }

          // Platoon split: batter's vsLHP boosts contact/power when facing a lefty pitcher
          const pHand = pitcherState.current.throwHand;
          const bHand = batter.batHand || "R";
          let platoonMult = 1.0;
          if (pHand === "L" && bHand !== "L") {
            // RHB or SHB vs LHP: vsLHP determines how well batter handles lefties
            platoonMult = 1 + (batter.vsLHP - 50) / 300; // ±0.167 at extremes
          } else if (pHand === "R" && bHand === "L") {
            // LHB vs RHP: slight natural advantage
            platoonMult = 1.04;
          }

          // Clutch / RISP: runners on base amplify batter's clutch and pitcher's wRISP
          const runnersOn = bases.filter(b => b !== null).length;
          const isRISP = bases[1] !== null || bases[2] !== null;
          const clutchBoost = isRISP ? (batter.clutch - 50) / 400 : 0;    // ±0.125
          const wRISPSuppress = isRISP ? (pitcherState.current.wRISP - 50) / 400 : 0; // ±0.125

          const rawContact = batter.contact * platoonMult * (1 + clutchBoost - wRISPSuppress);
          const rawPower = batter.power * platoonMult * (1 + clutchBoost * 0.5);
          const contact = Math.max(10, Math.min(99, rawContact));
          const power = Math.max(10, Math.min(99, rawPower));
          const speed = batter.speed;

          // ── Sac bunt: runner on 1st only, 0 outs, late game, close, slots 7-9 ──
          const pId0 = pitcherState.current.playerId;
          if (!pitcherStats[pId0]) pitcherStats[pId0] = { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };
          const isBuntSituation = outs === 0 && bases[0] !== null && bases[1] === null &&
            inning >= 7 && Math.abs(battingTeamScore - pitchingTeamScore) <= 2 && batterIdx >= 6;
          if (isBuntSituation && Math.random() < 0.40) {
            bases[1] = bases[0];
            bases[0] = null;
            outs = Math.min(3, outs + 1);
            pitcherStats[pId0].outs++;
            atBats.push({
              batterIndex: batterIdx,
              batterName: `${batter.firstName} ${batter.lastName}`,
              pitchSequence: ["ball", "foul", "foul"],
              result: "sacrifice_bunt",
              description: `${bnEarly} lays down a sacrifice bunt, advancing the runner to second`,
              runnersAfter: [false, true, bases[2] !== null],
              runsScored: 0,
              outs,
            });
            continue;
          }

          const contactNorm = contact / 100;
          const powerNorm = power / 100;
          const speedNorm = speed / 100;
          const stuffNorm = stuff / 100;
          const controlNorm = control / 100;
          const velocityNorm = velocity / 100;
          const fieldNorm = fieldingAvg / 100;

          let strikeoutChance = Math.max(0.10, 0.20 + stuffNorm * 0.12 + velocityNorm * 0.05 - contactNorm * 0.15);
          const walkChance = Math.max(0.03, 0.08 - controlNorm * 0.05 + contactNorm * 0.02);
          const hbpChance = 0.008;
          const errorChance = Math.max(0.005, 0.025 - fieldNorm * 0.02);

          let hitChance = Math.max(0.06, 0.14 + contactNorm * 0.08 - stuffNorm * 0.04 - velocityNorm * 0.03);

          // HR formula calibrated so 99 Power ≈ 10-12% HR/AB, 60 Power ≈ 2-4%, 30 Power < 1%.
          // Cubic curve concentrates HR gains at elite power, matching real-baseball distribution.
          // Stuff suppression is intentionally small (-0.015 max) so it's meaningful but not dominant.
          // "Contact Hitter" special ability currently applies no HR penalty in sim (intentional).
          let hrChance = Math.max(0.005, 0.007 + Math.pow(powerNorm, 3) * 0.11 - stuffNorm * 0.015);
          let tripleChance = Math.max(0.002, 0.004 + speedNorm * 0.006);
          let doubleChance = Math.max(0.01, 0.035 + powerNorm * 0.02 - stuffNorm * 0.01);

          // Trajectory: reshape hit-type mix (GB/LD/Gap/FB) without changing total event probability
          const traj = (batter as any).trajectory ?? 2;
          if (traj !== 2) {
            const origSum = strikeoutChance + hrChance + tripleChance + doubleChance + hitChance;
            if (traj === 1) { // GB: fewer HRs and Ks, more contact
              hrChance *= 0.4;
              strikeoutChance *= 0.75;
            } else if (traj === 3) { // Gap: more XBH, fewer HRs and singles
              doubleChance *= 1.5;
              tripleChance *= 1.4;
              hrChance *= 0.75;
              hitChance *= 0.85;
            } else if (traj === 4) { // FB: more HRs and Ks, fewer singles
              hrChance *= 1.6;
              strikeoutChance *= 1.25;
              hitChance *= 0.7;
            }
            const newSum = strikeoutChance + hrChance + tripleChance + doubleChance + hitChance;
            if (newSum > 0) {
              const scale = origSum / newSum;
              strikeoutChance *= scale;
              hrChance *= scale;
              tripleChance *= scale;
              doubleChance *= scale;
              hitChance *= scale;
            }
          }

          const dpChance = (bases[0] !== null && outs < 2)
            ? Math.max(0.03, 0.10 - speedNorm * 0.05)
            : 0;
          const sacFlyChance = (bases[2] !== null && outs < 2) ? 0.04 : 0;
          const fcChance = runnersOn > 0 ? 0.03 : 0;

          const roll = Math.random();
          let cumulative = 0;
          let result: string;
          let runsScored = 0;
          let isHit = false;
          let isOut = false;
          let outsAdded = 0;

          cumulative += strikeoutChance;
          if (roll < cumulative) {
            result = "strikeout";
            isOut = true;
            outsAdded = 1;
          } else {
            cumulative += walkChance;
            if (roll < cumulative) {
              result = "walk";
            } else {
              cumulative += hbpChance;
              if (roll < cumulative) {
                result = "hbp";
              } else {
                cumulative += errorChance;
                if (roll < cumulative) {
                  result = "error";
                } else {
                  cumulative += hrChance;
                  if (roll < cumulative) {
                    result = "homerun";
                    isHit = true;
                  } else {
                    cumulative += tripleChance;
                    if (roll < cumulative) {
                      result = "triple";
                      isHit = true;
                    } else {
                      cumulative += doubleChance;
                      if (roll < cumulative) {
                        result = "double";
                        isHit = true;
                      } else {
                        cumulative += hitChance;
                        if (roll < cumulative) {
                          result = "single";
                          isHit = true;
                        } else {
                          cumulative += dpChance;
                          if (roll < cumulative) {
                            result = "double_play";
                            isOut = true;
                            outsAdded = 2;
                          } else {
                            cumulative += sacFlyChance;
                            if (roll < cumulative) {
                              result = "sacrifice_fly";
                              isOut = true;
                              outsAdded = 1;
                            } else {
                              cumulative += fcChance;
                              if (roll < cumulative) {
                                result = "fielders_choice";
                                isOut = true;
                                outsAdded = 1;
                              } else {
                                const outRoll = Math.random();
                                // Trajectory shifts out-type distribution
                                // traj1=GB: more groundouts; traj3=Gap: more lineouts; traj4=FB: more flyouts/popouts
                                const gndCut = traj === 1 ? 0.65 : traj === 3 ? 0.35 : traj === 4 ? 0.20 : 0.45;
                                const flyCut = traj === 1 ? 0.83 : traj === 3 ? 0.72 : traj === 4 ? 0.72 : 0.80;
                                const lnoCut = traj === 1 ? 0.95 : traj === 3 ? 0.92 : traj === 4 ? 0.82 : 0.92;
                                if (outRoll < gndCut) result = "groundout";
                                else if (outRoll < flyCut) result = "flyout";
                                else if (outRoll < lnoCut) result = "lineout";
                                else result = "popout";
                                isOut = true;
                                outsAdded = 1;
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          result = result!;

          const bId = batter.playerId;

          switch (result) {
            case "homerun": {
              for (const baseRunner of bases) {
                if (baseRunner && batterStats[baseRunner]) {
                  batterStats[baseRunner].r++;
                }
              }
              if (batterStats[bId]) batterStats[bId].r++;
              runsScored = 1 + bases.filter(b => b !== null).length;
              bases = [null, null, null];
              break;
            }
            case "triple": {
              for (const baseRunner of bases) {
                if (baseRunner && batterStats[baseRunner]) {
                  batterStats[baseRunner].r++;
                }
              }
              runsScored = bases.filter(b => b !== null).length;
              bases = [null, null, bId];
              break;
            }
            case "double": {
              runsScored = 0;
              if (bases[2] && batterStats[bases[2]]) { batterStats[bases[2]].r++; runsScored++; }
              if (bases[1] && batterStats[bases[1]]) { batterStats[bases[1]].r++; runsScored++; }
              let firstAdvanced = false;
              if (bases[0]) {
                if (Math.random() < 0.5 + speedNorm * 0.3) {
                  if (batterStats[bases[0]]) batterStats[bases[0]].r++;
                  runsScored++;
                  firstAdvanced = true;
                }
              }
              bases = [null, bId, bases[0] && !firstAdvanced ? bases[0] : null];
              break;
            }
            case "single": {
              runsScored = 0;
              if (bases[2] && batterStats[bases[2]]) { batterStats[bases[2]].r++; runsScored++; }
              let secondScored = false;
              if (bases[1]) {
                if (Math.random() < 0.4 + speedNorm * 0.2) {
                  if (batterStats[bases[1]]) batterStats[bases[1]].r++;
                  runsScored++;
                  secondScored = true;
                }
              }
              const newThird = bases[1] && !secondScored ? bases[1] : null;
              const newSecond = bases[0] || null;
              bases = [bId, newSecond, newThird];
              break;
            }
            case "walk":
            case "hbp": {
              if (bases[0] && bases[1] && bases[2]) {
                if (batterStats[bases[2]]) batterStats[bases[2]].r++;
                runsScored = 1;
              }
              if (bases[0] && bases[1]) {
                bases[2] = bases[1];
              }
              if (bases[0]) {
                bases[1] = bases[0];
              }
              bases[0] = bId;
              break;
            }
            case "error": {
              runsScored = 0;
              if (bases[2]) {
                if (batterStats[bases[2]]) batterStats[bases[2]].r++;
                runsScored++;
              }
              const errNewThird = bases[1] || null;
              const errNewSecond = bases[0] || null;
              bases = [bId, errNewSecond, errNewThird];
              errors++;
              break;
            }
            case "sacrifice_fly": {
              if (bases[2]) {
                if (batterStats[bases[2]]) batterStats[bases[2]].r++;
                runsScored = 1;
                bases[2] = null;
              }
              break;
            }
            case "fielders_choice": {
              runsScored = 0;
              if (bases[2] && outs < 2) {
                if (batterStats[bases[2]]) batterStats[bases[2]].r++;
                runsScored = 1;
              }
              const fcThird = bases[1] || null;
              const fcSecond = bases[0] || null;
              bases = [bId, fcSecond, fcThird];
              if (bases[2] && Math.random() < 0.5) bases[2] = null;
              else if (bases[1] && bases[1] !== bId) bases[1] = null;
              break;
            }
            case "double_play": {
              runsScored = 0;
              if (bases[2] && outs < 2) {
                if (batterStats[bases[2]]) batterStats[bases[2]].r++;
                runsScored = 1;
                bases[2] = null;
              }
              bases[0] = null;
              if (bases[1] && Math.random() < 0.3) bases[1] = null;
              break;
            }
            default:
              break;
          }

          if (isOut) {
            outs = Math.min(3, outs + outsAdded);
          }

          if (isHit) hits++;
          runs += runsScored;

          const pId = pitcherState.current.playerId;

          if (!batterStats[bId]) batterStats[bId] = { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 };
          if (!pitcherStats[pId]) pitcherStats[pId] = { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };

          if (result !== "walk" && result !== "hbp" && result !== "sacrifice_fly") {
            batterStats[bId].ab++;
          }
          if (isHit) batterStats[bId].h++;
          if (result === "double") batterStats[bId].doubles++;
          if (result === "triple") batterStats[bId].triples++;
          if (result === "homerun") batterStats[bId].hr++;
          if (result === "walk") batterStats[bId].bb++;
          if (result === "strikeout") batterStats[bId].so++;
          batterStats[bId].rbi += runsScored;

          if (isHit) pitcherStats[pId].h++;
          if (result === "strikeout") pitcherStats[pId].so++;
          if (result === "walk") pitcherStats[pId].bb++;
          pitcherStats[pId].r += runsScored;
          pitcherStats[pId].er += runsScored;
          if (isOut) pitcherStats[pId].outs += outsAdded;

          const bn = `${batter.firstName[0]}. ${batter.lastName}`;
          const loc = locations[Math.floor(Math.random() * locations.length)];
          const gLoc = groundLocations[Math.floor(Math.random() * groundLocations.length)];
          const isLateGame = inning >= 7;
          const isCloseGame = Math.abs(battingTeamScore - pitchingTeamScore) <= 2;
          const isClutchMoment = isLateGame && isCloseGame && isRISP;
          let description = "";
          switch (result) {
            case "strikeout": description = `${bn} strikes out${isClutchMoment ? " looking" : ""}`; break;
            case "walk": description = isRISP ? `${bn} walks, loading the bases` : `${bn} walks`; break;
            case "hbp": description = `${bn} hit by pitch`; break;
            case "single": {
              const qualifier = isClutchMoment && runsScored > 0 ? " clutch" : "";
              description = `${bn} hits a${qualifier} single ${loc}`;
              break;
            }
            case "double": {
              description = `${bn} doubles ${loc}`;
              break;
            }
            case "triple": description = `${bn} triples ${loc}`; break;
            case "homerun": {
              if (runsScored >= 4) description = `${bn} hits a grand slam!`;
              else if (runsScored > 1) description = `${bn} hits a ${runsScored}-run home run!`;
              else if (isCloseGame && isLateGame) description = `${bn} hits a go-ahead solo home run!`;
              else description = `${bn} hits a solo home run!`;
              break;
            }
            case "groundout": description = `${bn} grounds out ${gLoc}`; break;
            case "flyout": description = `${bn} flies out ${loc}`; break;
            case "lineout": description = `${bn} lines out ${loc}`; break;
            case "popout": description = `${bn} pops out to the infield`; break;
            case "error": description = `${bn} reaches on an error`; break;
            case "fielders_choice": description = `${bn} reaches on fielder's choice`; break;
            case "sacrifice_fly": description = `${bn} hits a sacrifice fly ${loc}`; break;
            case "double_play": description = `${bn} grounds into a double play`; break;
          }
          if (runsScored === 1 && result !== "homerun") {
            const scorerBase = bases[2] !== null ? "third" : bases[1] !== null ? "second" : "first";
            description += `. Run scores from ${scorerBase}`;
          } else if (runsScored > 1 && result !== "homerun") {
            description += `. ${runsScored} runs score`;
          }

          const pitchSequence = generatePitchSequence(
            control,
            stuff,
            contact, result
          );

          atBats.push({
            batterIndex: batterIdx,
            batterName: `${batter.firstName} ${batter.lastName}`,
            pitchSequence,
            result,
            description,
            runnersAfter: [bases[0] !== null, bases[1] !== null, bases[2] !== null] as [boolean, boolean, boolean],
            runsScored,
            outs,
          });

          pitcherState.pitchCount += pitchSequence.length;

          // Stolen base attempt: runner on 1st with fewer than 2 outs
          if (outs < 2 && bases[0] !== null && bases[1] === null) {
            const runner = lineupMap.get(bases[0]);
            if (runner) {
              const stealAttemptProb = Math.max(0, (runner.stealing - 45) / 100) * 0.28;
              if (Math.random() < stealAttemptProb) {
                const successProb = Math.max(0.25, Math.min(0.88,
                  0.60 + (runner.stealing - velocity) / 200
                ));
                const rn = `${runner.firstName[0]}. ${runner.lastName}`;
                if (Math.random() < successProb) {
                  bases[1] = bases[0];
                  bases[0] = null;
                  atBats.push({
                    batterIndex: -1,
                    batterName: `${runner.firstName} ${runner.lastName}`,
                    pitchSequence: [],
                    result: "stolen_base",
                    description: `${rn} steals second base`,
                    runnersAfter: [false, true, bases[2] !== null],
                    runsScored: 0,
                    outs,
                  });
                } else {
                  bases[0] = null;
                  outs = Math.min(3, outs + 1);
                  atBats.push({
                    batterIndex: -1,
                    batterName: `${runner.firstName} ${runner.lastName}`,
                    pitchSequence: [],
                    result: "caught_stealing",
                    description: `${rn} caught stealing`,
                    runnersAfter: [false, bases[1] !== null, bases[2] !== null],
                    runsScored: 0,
                    outs,
                  });
                }
              }
            }
          }

          // ── Wild pitch / passed ball: advances all runners one base ──────────
          if (outs < 3) {
            const hasRunners = bases[0] !== null || bases[1] !== null || bases[2] !== null;
            const wpProb = hasRunners ? Math.max(0, (56 - control) / 650) : 0;
            if (Math.random() < wpProb) {
              const pIdWP = pitcherState.current.playerId;
              let wpRuns = 0;
              if (bases[2] !== null) {
                if (batterStats[bases[2]]) batterStats[bases[2]].r++;
                if (!pitcherStats[pIdWP]) pitcherStats[pIdWP] = { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };
                pitcherStats[pIdWP].r++;
                pitcherStats[pIdWP].er++;
                wpRuns++;
                runs++;
                bases[2] = null;
              }
              bases[2] = bases[1];
              bases[1] = bases[0];
              bases[0] = null;
              const isWP = Math.random() < 0.70;
              const wpDesc = wpRuns > 0
                ? `${isWP ? "Wild pitch" : "Passed ball"} — runner scores from third!`
                : `${isWP ? "Wild pitch" : "Passed ball"} — runner(s) advance`;
              atBats.push({
                batterIndex: -1,
                batterName: "",
                pitchSequence: [],
                result: isWP ? "wild_pitch" : "passed_ball",
                description: wpDesc,
                runnersAfter: [bases[0] !== null, bases[1] !== null, bases[2] !== null],
                runsScored: wpRuns,
                outs,
              });
            }
          }

          const maxPitches = Math.floor(pitcherState.current.stamina * 1.2) + 20;
          if (pitcherState.pitchCount > maxPitches && pitcherState.bullpenIdx < pitcherState.bullpen.length) {
            const outgoing = pitcherState.current;
            pitcherState.current = pitcherState.bullpen[pitcherState.bullpenIdx];
            pitcherState.bullpenIdx++;
            pitcherState.pitchCount = 0;
            const incoming = pitcherState.current;
            atBats.push({
              batterIndex: -1,
              batterName: "",
              pitchSequence: [],
              result: "pitching_change",
              description: `Pitching change — ${incoming.firstName[0]}. ${incoming.lastName} enters for ${outgoing.firstName[0]}. ${outgoing.lastName}`,
              runnersAfter: [bases[0] !== null, bases[1] !== null, bases[2] !== null],
              runsScored: 0,
              outs,
            });
          }
        }

        return { atBats, runs, hits, errors };
      }

      const homeIdx = { value: 0 };
      const awayIdx = { value: 0 };

      const homePitcherState = { current: currentHomePitcher, pitchCount: homePitchCount, bullpen: homeStaff.bullpen, bullpenIdx: homeBullpenIdx };
      const awayPitcherState = { current: currentAwayPitcher, pitchCount: awayPitchCount, bullpen: awayStaff.bullpen, bullpenIdx: awayBullpenIdx };

      for (let inn = 1; inn <= 9; inn++) {
        const topHalf = simulateHalfInning(awayLineup, homePitcherState, awayIdx, homeFielding, false, inn, totalAwayScore, totalHomeScore);
        totalAwayScore += topHalf.runs;

        let bottomHalf: HalfInningResult;
        if (inn === 9 && totalHomeScore > totalAwayScore) {
          bottomHalf = { atBats: [], runs: 0, hits: 0, errors: 0 };
        } else {
          bottomHalf = simulateHalfInning(homeLineup, awayPitcherState, homeIdx, awayFielding, true, inn, totalHomeScore, totalAwayScore);
          totalHomeScore += bottomHalf.runs;
        }

        innings.push({ inning: inn, topHalf, bottomHalf });
      }

      let extraInning = 10;
      while (totalHomeScore === totalAwayScore && extraInning <= 12) {
        // College baseball: automatic runner on 2nd to start each extra inning
        const awayManfredIdx = ((awayIdx.value - 1) % 9 + 9) % 9;
        const homeManfredIdx = ((homeIdx.value - 1) % 9 + 9) % 9;

        const topHalf = simulateHalfInning(awayLineup, homePitcherState, awayIdx, homeFielding, false, extraInning, totalAwayScore, totalHomeScore, awayLineup[awayManfredIdx].playerId);
        totalAwayScore += topHalf.runs;

        const bottomHalf = simulateHalfInning(homeLineup, awayPitcherState, homeIdx, awayFielding, true, extraInning, totalHomeScore, totalAwayScore, homeLineup[homeManfredIdx].playerId);
        totalHomeScore += bottomHalf.runs;

        innings.push({ inning: extraInning, topHalf, bottomHalf });
        extraInning++;
      }

      if (totalHomeScore === totalAwayScore) {
        if (Math.random() > 0.5) totalHomeScore++;
        else totalAwayScore++;
        const lastInning = innings[innings.length - 1];
        if (totalHomeScore > totalAwayScore) {
          lastInning.bottomHalf.runs++;
          const bIdx = homeIdx.value % 9;
          const winBatter = homeLineup[bIdx];
          if (batterStats[winBatter.playerId]) batterStats[winBatter.playerId].r++;
          lastInning.bottomHalf.atBats.push({
            batterIndex: bIdx,
            batterName: `${winBatter.firstName} ${winBatter.lastName}`,
            pitchSequence: ["ball", "strike", "in_play"],
            result: "single",
            description: `${winBatter.firstName[0]}. ${winBatter.lastName} singles to win the game!`,
            runnersAfter: [true, false, false],
            runsScored: 1,
            outs: lastInning.bottomHalf.atBats.length > 0 ? lastInning.bottomHalf.atBats[lastInning.bottomHalf.atBats.length - 1].outs : 0,
          });
          lastInning.bottomHalf.hits++;
        } else {
          lastInning.topHalf.runs++;
          const bIdx = awayIdx.value % 9;
          const winBatter = awayLineup[bIdx];
          if (batterStats[winBatter.playerId]) batterStats[winBatter.playerId].r++;
          lastInning.topHalf.atBats.push({
            batterIndex: bIdx,
            batterName: `${winBatter.firstName} ${winBatter.lastName}`,
            pitchSequence: ["strike", "ball", "in_play"],
            result: "single",
            description: `${winBatter.firstName[0]}. ${winBatter.lastName} singles to break the tie!`,
            runnersAfter: [true, false, false],
            runsScored: 1,
            outs: lastInning.topHalf.atBats.length > 0 ? lastInning.topHalf.atBats[lastInning.topHalf.atBats.length - 1].outs : 0,
          });
          lastInning.topHalf.hits++;
        }
      }

      const outsToIP = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

      const homeBatting = homeLineup.map(b => {
        const st = batterStats[b.playerId] || { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 };
        return {
          playerId: b.playerId,
          name: `${b.firstName[0]}. ${b.lastName}`,
          position: b.position,
          ...st,
          avg: st.ab > 0 ? (st.h / st.ab).toFixed(3) : ".000",
        };
      });

      const awayBatting = awayLineup.map(b => {
        const st = batterStats[b.playerId] || { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 };
        return {
          playerId: b.playerId,
          name: `${b.firstName[0]}. ${b.lastName}`,
          position: b.position,
          ...st,
          avg: st.ab > 0 ? (st.h / st.ab).toFixed(3) : ".000",
        };
      });

      const allHomePitchers = [homeStaff.starter, ...homeStaff.bullpen];
      const allAwayPitchers = [awayStaff.starter, ...awayStaff.bullpen];

      const homePitching = allHomePitchers
        .filter(p => {
          const st = pitcherStats[p.playerId];
          return st && (st.outs > 0 || st.h > 0 || st.bb > 0 || st.so > 0 || st.r > 0);
        })
        .map(p => {
          const st = pitcherStats[p.playerId] || { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };
          return {
            playerId: p.playerId,
            name: `${p.firstName[0]}. ${p.lastName}`,
            ip: outsToIP(st.outs),
            h: st.h, r: st.r, er: st.er, bb: st.bb, so: st.so,
            era: st.outs > 0 ? ((st.er * 27) / st.outs).toFixed(2) : "0.00",
          };
        });

      const awayPitching = allAwayPitchers
        .filter(p => {
          const st = pitcherStats[p.playerId];
          return st && (st.outs > 0 || st.h > 0 || st.bb > 0 || st.so > 0 || st.r > 0);
        })
        .map(p => {
          const st = pitcherStats[p.playerId] || { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };
          return {
            playerId: p.playerId,
            name: `${p.firstName[0]}. ${p.lastName}`,
            ip: outsToIP(st.outs),
            h: st.h, r: st.r, er: st.er, bb: st.bb, so: st.so,
            era: st.outs > 0 ? ((st.er * 27) / st.outs).toFixed(2) : "0.00",
          };
        });

      if (homePitching.length === 0) {
        const st = pitcherStats[homePitcher.playerId] || { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };
        homePitching.push({
          playerId: homePitcher.playerId, name: `${homePitcher.firstName[0]}. ${homePitcher.lastName}`,
          ip: outsToIP(st.outs), h: st.h, r: st.r, er: st.er, bb: st.bb, so: st.so,
          era: st.outs > 0 ? ((st.er * 27) / st.outs).toFixed(2) : "0.00",
        });
      }
      if (awayPitching.length === 0) {
        const st = pitcherStats[awayPitcher.playerId] || { outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 };
        awayPitching.push({
          playerId: awayPitcher.playerId, name: `${awayPitcher.firstName[0]}. ${awayPitcher.lastName}`,
          ip: outsToIP(st.outs), h: st.h, r: st.r, er: st.er, bb: st.bb, so: st.so,
          era: st.outs > 0 ? ((st.er * 27) / st.outs).toFixed(2) : "0.00",
        });
      }

      const [leagueStandings, seasonStats, allConferences] = await Promise.all([
        storage.getStandingsByLeague(leagueId, game.season || 1),
        storage.getPlayerSeasonStatsBySeason(leagueId, game.season || 1),
        storage.getConferencesByLeague(leagueId),
      ]);

      const homeStanding = leagueStandings.find(s => s.teamId === homeTeam.id);
      const awayStanding = leagueStandings.find(s => s.teamId === awayTeam.id);

      const homeConf = allConferences.find(c => c.id === homeTeam.conferenceId);
      const awayConf = allConferences.find(c => c.id === awayTeam.conferenceId);

      // Build conference standings for home team's conference
      const allTeams = await storage.getTeamsByLeague(leagueId);
      const homeConfTeamIds = allTeams.filter(t => t.conferenceId === homeTeam.conferenceId).map(t => t.id);
      const confStandings = leagueStandings
        .filter(s => homeConfTeamIds.includes(s.teamId))
        .map(s => {
          const team = allTeams.find(t => t.id === s.teamId);
          return {
            teamId: s.teamId,
            abbreviation: team?.abbreviation || "???",
            name: team?.name || "Unknown",
            wins: s.wins,
            losses: s.losses,
            confWins: s.conferenceWins,
            confLosses: s.conferenceLosses,
          };
        })
        .sort((a, b) => b.confWins - a.confWins || a.confLosses - b.confLosses || b.wins - a.wins);

      // Build season stats lookup for all lineup players + pitchers
      const allPlayerIds = new Set([
        ...homeLineup.map(p => p.playerId),
        ...awayLineup.map(p => p.playerId),
        homePitcher.playerId,
        awayPitcher.playerId,
        ...homeStaff.bullpen.map(p => p.playerId),
        ...awayStaff.bullpen.map(p => p.playerId),
      ]);
      const playerSeasonStatsMap: Record<string, any> = {};
      for (const stat of seasonStats) {
        if (allPlayerIds.has(stat.playerId)) {
          const avg = stat.ab > 0 ? (stat.h / stat.ab).toFixed(3) : ".000";
          const era = stat.ipOuts > 0 ? ((stat.pEr * 27) / stat.ipOuts).toFixed(2) : "0.00";
          playerSeasonStatsMap[stat.playerId] = {
            games: stat.games,
            ab: stat.ab, h: stat.h, hr: stat.hr, rbi: stat.rbi, bb: stat.bb, so: stat.so, r: stat.r,
            avg,
            pitchingGames: stat.pitchingGames,
            wins: stat.wins, losses: stat.losses,
            ipOuts: stat.ipOuts, pHits: stat.pHits, pEr: stat.pEr, pBb: stat.pBb, pSo: stat.pSo,
            era,
          };
        }
      }

      const gameTypeLabel: Record<string, string> = {
        friday: "Game 1 - Friday",
        saturday: "Game 2 - Saturday",
        sunday: "Game 3 - Sunday",
      };

      res.json({
        homeTeam: { id: homeTeam.id, name: homeTeam.name, abbreviation: homeTeam.abbreviation, primaryColor: homeTeam.primaryColor, secondaryColor: homeTeam.secondaryColor, mascot: homeTeam.mascot },
        awayTeam: { id: awayTeam.id, name: awayTeam.name, abbreviation: awayTeam.abbreviation, primaryColor: awayTeam.primaryColor, secondaryColor: awayTeam.secondaryColor, mascot: awayTeam.mascot },
        homeLineup,
        awayLineup,
        homePitcher: { ...homePitcher, stamina: homePitcher.stamina },
        awayPitcher: { ...awayPitcher, stamina: awayPitcher.stamina },
        innings,
        finalScore: { home: totalHomeScore, away: totalAwayScore },
        homeBatting,
        awayBatting,
        homePitching,
        awayPitching,
        gameInfo: {
          week: game.week,
          season: game.season || 1,
          gameType: game.gameType,
          gameTypeLabel: game.gameType ? gameTypeLabel[game.gameType] || game.gameType : "Non-Conference",
          isConference: game.isConference,
          phase: game.phase,
          venue: `${homeTeam.name} Field`,
        },
        teamRecords: {
          home: { wins: homeStanding?.wins || 0, losses: homeStanding?.losses || 0, confWins: homeStanding?.conferenceWins || 0, confLosses: homeStanding?.conferenceLosses || 0 },
          away: { wins: awayStanding?.wins || 0, losses: awayStanding?.losses || 0, confWins: awayStanding?.conferenceWins || 0, confLosses: awayStanding?.conferenceLosses || 0 },
        },
        conferenceInfo: {
          homeName: homeConf?.name || "",
          awayName: awayConf?.name || "",
        },
        conferenceStandings: confStandings,
        playerSeasonStats: playerSeasonStatsMap,
      });
    } catch (error) {
      console.error("Play-by-play simulation failed:", error);
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: "Play-by-play simulation failed", detail: errMsg });
    }
  });

  // ============ FINALIZE PLAY-BY-PLAY ============
  app.post("/api/leagues/:id/games/:gameId/finalize-play-by-play", requireAuth, async (req, res) => {
    if (process.env.PBP_ENABLED !== "true") {
      return res.status(404).json({ message: "Play-by-play is not available in this league." });
    }
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const game = await storage.getGame(gameId);
      if (!game || game.leagueId !== leagueId) {
        return res.status(404).json({ message: "Game not found" });
      }
      if (game.isComplete) {
        return res.status(400).json({ message: "Game is already complete" });
      }

      const { homeScore, awayScore, homeBatting, awayBatting, homePitching, awayPitching, innings } = req.body;

      if (homeScore == null || awayScore == null) {
        return res.status(400).json({ message: "Missing score data" });
      }

      const boxScore = {
        innings: innings || [],
        home: {
          batting: (homeBatting || []).map((b: any) => ({
            name: b.name, position: b.position, playerId: b.playerId,
            ab: b.ab || 0, r: b.r || 0, h: b.h || 0, doubles: b.doubles || 0, triples: b.triples || 0,
            hr: b.hr || 0, rbi: b.rbi || 0, bb: b.bb || 0, hbp: 0, so: b.so || 0, sb: 0, cs: 0,
            exitVelo: 0, barrels: 0, hardHits: 0, ballsInPlay: Math.max(0, (b.ab || 0) - (b.so || 0)),
            putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0,
            avg: b.avg || ".000",
          })),
          pitching: (homePitching || []).map((p: any) => ({
            name: p.name, playerId: p.playerId,
            ip: p.ip || "0.0", h: p.h || 0, r: p.r || 0, er: p.er || 0,
            bb: p.bb || 0, so: p.so || 0, hr: 0, era: p.era || "0.00",
            totalPitches: 0, whiffs: 0, spinRate: 0,
          })),
          totals: {
            ab: (homeBatting || []).reduce((s: number, b: any) => s + (b.ab || 0), 0),
            r: homeScore,
            h: (homeBatting || []).reduce((s: number, b: any) => s + (b.h || 0), 0),
            doubles: (homeBatting || []).reduce((s: number, b: any) => s + (b.doubles || 0), 0),
            triples: (homeBatting || []).reduce((s: number, b: any) => s + (b.triples || 0), 0),
            hr: (homeBatting || []).reduce((s: number, b: any) => s + (b.hr || 0), 0),
            rbi: (homeBatting || []).reduce((s: number, b: any) => s + (b.rbi || 0), 0),
            bb: (homeBatting || []).reduce((s: number, b: any) => s + (b.bb || 0), 0),
            hbp: 0, so: (homeBatting || []).reduce((s: number, b: any) => s + (b.so || 0), 0),
            sb: 0, cs: 0,
            exitVeloTotal: 0, barrels: 0, hardHits: 0, ballsInPlay: 0,
            putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0,
          },
          errors: 0,
        },
        away: {
          batting: (awayBatting || []).map((b: any) => ({
            name: b.name, position: b.position, playerId: b.playerId,
            ab: b.ab || 0, r: b.r || 0, h: b.h || 0, doubles: b.doubles || 0, triples: b.triples || 0,
            hr: b.hr || 0, rbi: b.rbi || 0, bb: b.bb || 0, hbp: 0, so: b.so || 0, sb: 0, cs: 0,
            exitVelo: 0, barrels: 0, hardHits: 0, ballsInPlay: Math.max(0, (b.ab || 0) - (b.so || 0)),
            putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0,
            avg: b.avg || ".000",
          })),
          pitching: (awayPitching || []).map((p: any) => ({
            name: p.name, playerId: p.playerId,
            ip: p.ip || "0.0", h: p.h || 0, r: p.r || 0, er: p.er || 0,
            bb: p.bb || 0, so: p.so || 0, hr: 0, era: p.era || "0.00",
            totalPitches: 0, whiffs: 0, spinRate: 0,
          })),
          totals: {
            ab: (awayBatting || []).reduce((s: number, b: any) => s + (b.ab || 0), 0),
            r: awayScore,
            h: (awayBatting || []).reduce((s: number, b: any) => s + (b.h || 0), 0),
            doubles: (awayBatting || []).reduce((s: number, b: any) => s + (b.doubles || 0), 0),
            triples: (awayBatting || []).reduce((s: number, b: any) => s + (b.triples || 0), 0),
            hr: (awayBatting || []).reduce((s: number, b: any) => s + (b.hr || 0), 0),
            rbi: (awayBatting || []).reduce((s: number, b: any) => s + (b.rbi || 0), 0),
            bb: (awayBatting || []).reduce((s: number, b: any) => s + (b.bb || 0), 0),
            hbp: 0, so: (awayBatting || []).reduce((s: number, b: any) => s + (b.so || 0), 0),
            sb: 0, cs: 0,
            exitVeloTotal: 0, barrels: 0, hardHits: 0, ballsInPlay: 0,
            putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0,
          },
          errors: 0,
        },
      };

      await finalizeGameAtomic(game, homeScore, awayScore, boxScore, leagueId, { finalizer: "play-by-play" });

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Play-by-Play Game Completed",
        details: `Final: ${awayScore} - ${homeScore}`,
      });

      res.json({ success: true, homeScore, awayScore });
    } catch (error) {
      console.error("Finalize play-by-play failed:", error);
      res.status(500).json({ message: "Finalize play-by-play failed" });
    }
  });

  // Commissioner routes
  app.get("/api/leagues/:id/commissioner", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      // Only commissioners and co-commissioners can access commissioner data
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can access this page" });
      }

      const cacheKey = leagueCacheKey(league.id, "commissioner");
      const cached = cacheGet(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const allCoaches = await storage.getCoachesByLeague(league.id);
      const [auditLogsData, leagueTeams, invites] = await Promise.all([
        storage.getAuditLogsByLeague(league.id),
        storage.getTeamsByLeague(league.id),
        storage.getLeagueInvitesByLeague(league.id),
      ]);
      const coaches = allCoaches;
      const humanTeams = leagueTeams.filter(t => !t.isCpu);
      const humanTeamIds = new Set(humanTeams.map(t => t.id));

      const isDeparturesPhase = league.currentPhase === "offseason_departures";
      const isWalkonsPhase = league.currentPhase === "offseason_walkons";
      const teamById = new Map(leagueTeams.map(t => [t.id, t]));

      const readyCoaches = coaches
        .filter(c => c.teamId && humanTeamIds.has(c.teamId))
        .filter(c => {
          if (isDeparturesPhase) return teamById.get(c.teamId!)?.departuresFinalized ?? false;
          if (isWalkonsPhase) return teamById.get(c.teamId!)?.walkonReady ?? false;
          return c.isReady ?? false;
        })
        .map(c => c.id);

      // Build human coaches list for delegation UI
      const humanCoachEntries = coaches.filter(c => c.userId && c.teamId && humanTeamIds.has(c.teamId));
      const userIds = humanCoachEntries.map(c => c.userId!).filter(Boolean);
      const userLookups = await Promise.all(userIds.map(uid => storage.getUser(uid)));
      const userMap = new Map(userLookups.filter(Boolean).map(u => [u!.id, u!]));
      const humanCoaches = humanCoachEntries.map(c => {
        const coachTeam = c.teamId ? teamById.get(c.teamId) : undefined;
        return {
          coachId: c.id,
          userId: c.userId!,
          firstName: c.firstName,
          lastName: c.lastName,
          email: userMap.get(c.userId!)?.email ?? "",
          teamId: c.teamId ?? null,
          teamName: coachTeam?.name ?? null,
          abbreviation: coachTeam?.abbreviation ?? null,
          isAutoPilot: coachTeam?.isAutoPilot ?? false,
          archetype: c.archetype,
        };
      });

      // Compute per-team roster sizes and flag any oversized rosters (>35 = catastrophic
      // double-insert threshold set in finalizeWalkonsPhase). Surface to commissioner UI
      // so they can spot and fix duplicate-player issues without digging through logs.
      const playerCountMap = await storage.getPlayerCountsByLeague(league.id);
      const rosterSizes = leagueTeams.map(t => ({ id: t.id, name: t.name, count: playerCountMap.get(t.id) ?? 0 }));
      const oversizedTeams = rosterSizes
        .filter(r => r.count > 35)
        .map(r => `${r.name} (${r.count} players)`);

      const payload = {
        league,
        auditLogs: auditLogsData,
        readyCoaches,
        totalCoaches: humanTeams.length,
        invites,
        humanCoaches,
        oversizedTeams,
      };

      cacheSet(cacheKey, payload, 30_000);
      res.json(payload);
    } catch (error) {
      console.error("Failed to fetch commissioner data:", error);
      res.status(500).json({ message: "Failed to fetch commissioner data" });
    }
  });

  // ============ AUTO-PILOT TOGGLE ============
  app.patch("/api/leagues/:id/teams/:teamId/autopilot", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can toggle auto-pilot" });
      }

      const team = await storage.getTeam(req.params.teamId as string);
      if (!team || team.leagueId !== league.id) {
        return res.status(404).json({ message: "Team not found in this league" });
      }
      if (team.isCpu) {
        return res.status(400).json({ message: "Team is already CPU-controlled" });
      }

      // Cannot set auto-pilot on the commissioner's own team
      const allCoaches = await storage.getCoachesByLeague(league.id);
      const teamCoach = allCoaches.find(c => c.teamId === team.id);
      if (teamCoach?.userId === league.commissionerId) {
        return res.status(400).json({ message: "Cannot put the commissioner's own team on auto-pilot" });
      }

      const newState = !team.isAutoPilot;
      await storage.updateTeam(team.id, { isAutoPilot: newState });

      const coachName = teamCoach ? `${teamCoach.firstName} ${teamCoach.lastName}` : "Unknown coach";
      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId!,
        action: newState ? "Auto-Pilot Enabled" : "Auto-Pilot Disabled",
        details: `${coachName} (${team.name}) was ${newState ? "placed on" : "removed from"} auto-pilot by the commissioner. ${newState ? "CPU will manage their team until disabled." : "Coach has regained full control."}`,
      });

      invalidateLeague(league.id);
      return res.json({ success: true, isAutoPilot: newState, teamId: team.id });
    } catch (error) {
      console.error("Failed to toggle auto-pilot:", error);
      return res.status(500).json({ message: "Failed to toggle auto-pilot" });
    }
  });

  // ============ AUTO-PILOT ACTION LOG ============
  // Returns the CPU action log for the current user's team in this league.
  app.get("/api/leagues/:id/my-team/auto-pilot-log", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(league.id);
      const myCoach = coaches.find(c => c.userId === req.session.userId);
      if (!myCoach?.teamId) return res.json({ log: [] });

      const team = await storage.getTeam(myCoach.teamId);
      const log = (team?.autoPilotActionLog as import("@shared/schema").AutoPilotLogEntry[] | null) ?? [];
      return res.json({ log });
    } catch (error) {
      console.error("Failed to fetch auto-pilot log:", error);
      return res.status(500).json({ message: "Failed to fetch auto-pilot log" });
    }
  });

  // Dismisses the auto-pilot log for the current user's team by marking all entries as read (does NOT delete history).
  app.post("/api/leagues/:id/my-team/auto-pilot-log/dismiss", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(league.id);
      const myCoach = coaches.find(c => c.userId === req.session.userId);
      if (!myCoach?.teamId) return res.json({ success: true });

      const team = await storage.getTeam(myCoach.teamId);
      const existingLog: import("@shared/schema").AutoPilotLogEntry[] =
        (team?.autoPilotActionLog as import("@shared/schema").AutoPilotLogEntry[] | null) ?? [];
      const markedRead = existingLog.map(entry => ({ ...entry, read: true }));
      await storage.updateTeam(myCoach.teamId, { autoPilotActionLog: markedRead } as any);
      return res.json({ success: true });
    } catch (error) {
      console.error("Failed to dismiss auto-pilot log:", error);
      return res.status(500).json({ message: "Failed to dismiss auto-pilot log" });
    }
  });

  // ============ CLEAR AUTO-PILOT PENDING ALERT ============
  app.post("/api/leagues/:id/recruiting/clear-autopilot-alert", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      const coaches = await storage.getCoachesByLeague(league.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach) return res.status(404).json({ message: "Coach not found" });
      await storage.updateCoach(userCoach.id, { autoPilotPendingAlert: [] as any });
      return res.json({ success: true });
    } catch (error) {
      console.error("Failed to clear auto-pilot alert:", error);
      return res.status(500).json({ message: "Failed to clear auto-pilot alert" });
    }
  });

  app.get("/api/leagues/:id/advance-progress", requireAuth, async (req, res) => {
    const entry = advanceProgress.get(req.params.id as string);
    if (!entry) {
      return res.json({ active: false, stage: "idle", pct: 0 });
    }
    // Auto-expire stale entries (>60s) so clients don't hang
    if (Date.now() - entry.updatedAt > 60_000) {
      advanceProgress.delete(req.params.id as string);
      return res.json({ active: false, stage: "idle", pct: 0 });
    }
    return res.json({ active: true, stage: entry.stage, pct: entry.pct });
  });

  // ============ V3 MIGRATION (commissioner tool) ============
  // Allows a commissioner to manually trigger the V3 player migration during the
  // offseason — useful when the automatic in-progression migration hasn't run yet
  // or when the commissioner wants to preview archetype assignments before the
  // first offseason advance.
  app.post("/api/leagues/:id/admin/migrate-to-v3", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can trigger the V3 migration" });
      }

      const players = await storage.getPlayersByLeague(league.id);
      const v1Count = players.filter(p => (p as any).developmentModelVersion !== 3).length;

      if (v1Count === 0) {
        return res.json({ message: "All players are already on V3", migrated: 0, skipped: 0, errors: 0 });
      }

      const result = await migrateLeagueToV3(storage as any, league.id, players as any);

      console.log(`[v3-migrate-manual] League ${league.id} — migrated=${result.migrated} skipped=${result.skipped} errors=${result.errors}`);
      return res.json({
        message: `Migration complete. ${result.migrated} players promoted to V3.`,
        ...result,
      });
    } catch (err) {
      console.error("V3 migration error:", err);
      return res.status(500).json({ message: "Migration failed" });
    }
  });

  // ============ FORCE ADVANCE ============
  app.post("/api/leagues/:id/force-advance", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can force-advance" });
      }

      // In reported-game mode the same advance gate applies even for force-advance:
      // unreported games must be resolved before phase can move forward.
      // Fail-CLOSED: if preflight cannot be computed, refuse to advance rather than
      // silently bypassing the gate.  An empty catch here would allow force-advance
      // to proceed even when the preflight service is broken, undermining phase integrity.
      if (league.gameMode === "reported") {
        let pf;
        try {
          pf = await getAdvancePreflight(league.id);
        } catch (pfErr) {
          return res.status(500).json({
            message: "Preflight check failed — cannot force-advance",
            detail: String(pfErr),
          });
        }
        if (!pf.canAdvance) {
          return res.status(409).json({
            message: `Cannot force-advance: ${pf.blockers.length} game(s) require final reports.`,
            blockers: pf.blockers,
          });
        }
      }

      const allCoaches = await storage.getCoachesByLeague(league.id);
      const allTeams = await storage.getTeamsByLeague(league.id);
      // Human teams that are NOT on auto-pilot (auto-pilot teams are already treated as CPU-ready)
      const humanNonAutoPilotTeams = allTeams.filter(t => !t.isCpu && !t.isAutoPilot);
      const humanTeamIdSet = new Set(humanNonAutoPilotTeams.map(t => t.id));
      const notReadyCoaches = allCoaches.filter(c => c.teamId && humanTeamIdSet.has(c.teamId) && !c.isReady);

      const forcedAuditParts: string[] = [];

      // Force-mark all non-ready coaches as ready (works for regular season and recruiting phases)
      if (notReadyCoaches.length > 0) {
        await Promise.all(notReadyCoaches.map(c => storage.updateCoach(c.id, { isReady: true })));
        forcedAuditParts.push(`${notReadyCoaches.length} coach${notReadyCoaches.length !== 1 ? "es" : ""} marked ready: ${notReadyCoaches.map(c => `${c.firstName} ${c.lastName}`).join(", ")}`);

        // CPU fill-in: run recruiting at all_american difficulty for force-advanced human teams
        // during recruiting-relevant phases so their week isn't wasted.
        const recruitingPhases = ["recruiting", "preseason", "regular_season"];
        if (recruitingPhases.includes(league.currentPhase)) {
          const forcedTeamIds = new Set(notReadyCoaches.map(c => c.teamId!).filter(Boolean));
          if (forcedTeamIds.size > 0) {
            await runCpuRecruiting(league.id, league.currentWeek ?? 1, league.currentSeason, false, forcedTeamIds)
              .catch(e => console.error("[force-advance-cpu-fill] Error running CPU fill-in:", e));
          }
        }
      }

      // For walk-on phase, force walkonReady on all non-ready non-auto-pilot human teams
      if (league.currentPhase === "offseason_walkons") {
        const notWalkonReady = humanNonAutoPilotTeams.filter(t => !t.walkonReady);
        if (notWalkonReady.length > 0) {
          await Promise.all(notWalkonReady.map(t => storage.updateTeam(t.id, { walkonReady: true })));
          forcedAuditParts.push(`${notWalkonReady.length} team${notWalkonReady.length !== 1 ? "s" : ""} forced ready for walk-on phase`);
        }
      }

      // For departures phase, force departuresFinalized on all non-ready non-auto-pilot human teams
      if (league.currentPhase === "offseason_departures") {
        const notDepartureReady = humanNonAutoPilotTeams.filter(t => !t.departuresFinalized);
        if (notDepartureReady.length > 0) {
          await Promise.all(notDepartureReady.map(t => storage.updateTeam(t.id, { departuresFinalized: true })));
          forcedAuditParts.push(`${notDepartureReady.length} team${notDepartureReady.length !== 1 ? "s" : ""} forced ready for departures phase`);
        }
      }

      // Always audit-log force-advance, even when nothing was pending
      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId!,
        action: "Force Advance",
        details: forcedAuditParts.length > 0
          ? `Commissioner force-advanced the phase. ${forcedAuditParts.join("; ")}.`
          : `Commissioner force-advanced the phase (all coaches were already ready).`,
      });

      // Now call the normal advance endpoint logic by forwarding internally
      // We do this by making the advance call with forced readiness already set
      // Simply redirect to the advance route by calling it programmatically:
      req.url = `/api/leagues/${league.id}/advance`;
      return res.redirect(307, `/api/leagues/${league.id}/advance`);
    } catch (error) {
      console.error("Failed to force-advance:", error);
      return res.status(500).json({ message: "Failed to force-advance" });
    }
  });

  // ── Advance preflight check (commissioner, reported-mode leagues) ────────────
  // Returns the same blocker list that /advance uses internally, so the UI can
  // display per-game links before the commissioner clicks Advance.
  app.get("/api/leagues/:id/advance/preflight", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const result = await getAdvancePreflight(league.id);
      return res.json(result);
    } catch (e: any) {
      console.error("[advance-preflight] error:", e);
      return res.status(500).json({ message: "Preflight check failed", detail: e?.message || String(e) });
    }
  });

  // ── Clear stuck advance (commissioner recovery) ───────────────────────────────
  // Clears an orphaned advance lock (left by a crashed process) so a new advance
  // can start.  Also marks any league_advances rows with an expired lease as failed.
  // The commissioner can call this after the server recovers from a crash.
  app.post("/api/leagues/:id/advance/clear-stuck", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const leagueId = league.id;

      // Safety check: reject if there is a RECENT (non-expired) lock — the advance
      // may still be actively running.  Only locks older than 15 minutes (the lease
      // window) are considered orphaned by a crashed process.
      const activeLock = await pool.query<{ locked_at: string }>(
        `SELECT locked_at FROM league_advance_locks
          WHERE league_id = $1 AND locked_at >= now() - interval '15 minutes'`,
        [leagueId],
      );
      if ((activeLock.rowCount ?? 0) > 0) {
        return res.status(409).json({
          message: "An advance may be actively running (lock is recent — acquired within the last 15 minutes). Wait until the advance completes, or until 15 minutes have elapsed since the lock was acquired, before clearing.",
          activeLockSince: activeLock.rows[0]?.locked_at,
        });
      }

      // Delete orphaned advance lock (lock older than 15 min → safe to remove)
      const lockDel = await pool.query(
        `DELETE FROM league_advance_locks
          WHERE league_id = $1 AND locked_at < now() - interval '15 minutes'
          RETURNING league_id`,
        [leagueId],
      );

      // Mark any expired running ops as failed
      const opUpd = await pool.query(
        `UPDATE league_advances
            SET status = 'failed', error_message = 'Cleared by commissioner (stuck recovery)', updated_at = now()
          WHERE league_id = $1 AND status = 'running' AND lease_expires_at < now()
          RETURNING id`,
        [leagueId],
      );

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId!,
        action: "Clear Stuck Advance",
        details: `Lock cleared: ${lockDel.rowCount ?? 0}. Stale ops marked failed: ${opUpd.rowCount ?? 0}.`,
      });

      return res.json({
        locksCleared: lockDel.rowCount ?? 0,
        staleOpsMarkedFailed: opUpd.rowCount ?? 0,
      });
    } catch (e: any) {
      console.error("[clear-stuck] error:", e);
      return res.status(500).json({ message: "Failed to clear stuck advance", detail: e?.message || String(e) });
    }
  });

  // ── Check for active or recently stuck advance operations ────────────────────
  app.get("/api/leagues/:id/advance/status", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const { rows } = await pool.query<{
        id: string; status: string; from_phase: string; from_week: number;
        from_season: number; lease_expires_at: string; created_at: string;
      }>(
        `SELECT id, status, from_phase, from_week, from_season, lease_expires_at, created_at
           FROM league_advances
          WHERE league_id = $1
          ORDER BY created_at DESC
          LIMIT 5`,
        [req.params.id],
      );
      const { rows: lockRows } = await pool.query<{ locked_at: string }>(
        `SELECT locked_at FROM league_advance_locks WHERE league_id = $1`,
        [req.params.id],
      );
      return res.json({
        recentOps: rows,
        hasActiveLock: lockRows.length > 0,
        activeLockSince: lockRows[0]?.locked_at ?? null,
      });
    } catch (e: any) {
      return res.status(500).json({ message: "Failed to fetch advance status" });
    }
  });

  app.post("/api/leagues/:id/advance", requireAuth, async (req, res) => {
    let advOpId: string | null = null;
    // Tracks whether the catch block has already set the op to 'failed' so the
    // res.on("finish") handler never races it back to 'complete'.
    let advOpFailed = false;
    // Heartbeat timer — keeps the lease alive for long advances (renews every 5 min).
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can advance the league" });
      }

      const leagueId = league.id;
      const currentWeek = league.currentWeek;
      const nextWeek = currentWeek + 1;

      // ── Idempotency gate ──────────────────────────────────────────────────────
      // If a completed advance op already exists for this exact (from_phase, from_week,
      // from_season) triple, return success immediately without re-running — so a
      // duplicate POST from a slow client gets the same result as the original call.
      const existingComplete = await pool.query<{ id: string }>(
        `SELECT id FROM league_advances
          WHERE league_id = $1
            AND status    = 'complete'
            AND from_phase = $2
            AND from_week  = $3
            AND from_season = $4
          LIMIT 1`,
        [leagueId, league.currentPhase, currentWeek, league.currentSeason],
      );
      if ((existingComplete.rowCount ?? 0) > 0) {
        // Advance already happened — return the current state of the league as the result.
        const freshLeague = await storage.getLeague(leagueId);
        return res.json({ idempotent: true, data: freshLeague });
      }

      // ── Reported-mode preflight: checked BEFORE acquiring any lock ───────────
      // This gate must run before any DB mutation (including lock-table writes) so
      // that a blocked advance truly makes zero DB changes.  Both the lock-acquire
      // and the league_advances insert happen only after this check passes.
      if (league.gameMode === "reported") {
        let earlyPreflight;
        try {
          earlyPreflight = await getAdvancePreflight(leagueId);
        } catch (pfErr) {
          return res.status(500).json({ message: "Preflight check failed", detail: String(pfErr) });
        }
        if (!earlyPreflight.canAdvance) {
          return res.status(409).json({
            message: `Cannot advance: ${earlyPreflight.blockers.length} game(s) require final reports before advancing.`,
            blockers: earlyPreflight.blockers,
          });
        }
      }

      // ── Concurrent-advance serialization ─────────────────────────────────────
      // If another advance is in-flight for this league, WAIT for it to complete
      // rather than immediately returning 409.  This gives concurrent callers the
      // same final result class as the original caller (idempotent semantics).
      //
      // After the in-flight op resolves, we re-check the idempotency gate:
      //   - If the first advance SUCCEEDED → a 'complete' row exists → return 200.
      //   - If the first advance FAILED (e.g. reported-mode 409 preflight) → no
      //     complete row → fall through and re-run full advance logic, which will
      //     hit the same preflight/readiness gate and return the same 409.
      //
      // We never blindly return 200 after waiting; the outcome is always determined
      // by re-running the decision logic rather than by absence of a running row.
      const CONCURRENT_POLL_INTERVAL_MS = 3_000;
      const CONCURRENT_TIMEOUT_MS = 90_000;
      let locked = await acquireAdvanceLock(leagueId);
      if (!locked) {
        const waitStart = Date.now();
        while (Date.now() - waitStart < CONCURRENT_TIMEOUT_MS) {
          await new Promise(r => setTimeout(r, CONCURRENT_POLL_INTERVAL_MS));
          const stillRunning = await pool.query<{ status: string }>(
            `SELECT status FROM league_advances
              WHERE league_id = $1 AND status = 'running'
              LIMIT 1`,
            [leagueId],
          );
          if ((stillRunning.rowCount ?? 0) === 0) {
            // In-flight advance has resolved.
            // Re-run the idempotency gate: if a 'complete' row now exists for this
            // exact league state, the first advance succeeded — return same result.
            const recheck = await pool.query<{ id: string }>(
              `SELECT id FROM league_advances
                WHERE league_id  = $1
                  AND status     = 'complete'
                  AND from_phase = $2
                  AND from_week  = $3
                  AND from_season = $4
                LIMIT 1`,
              [leagueId, league.currentPhase, currentWeek, league.currentSeason],
            );
            if ((recheck.rowCount ?? 0) > 0) {
              const freshLeague = await storage.getLeague(leagueId);
              return res.json({ idempotent: true, data: freshLeague });
            }
            // No complete row — the first advance failed or was blocked (e.g. a
            // reported-mode preflight 409).  Acquire the lock and re-run full advance
            // logic so this caller gets the exact same outcome as the original.
            locked = await acquireAdvanceLock(leagueId);
            break;
          }
        }
        if (!locked) {
          // Either timed out, or the in-flight op resolved but the lock re-acquire
          // failed (another request slipped in).  Advise the client to retry.
          return res.status(409).json({ message: "League advance in progress and timed out. Please retry." });
        }
      }

      // ── Reported-mode game gate ────────────────────────────────────────────────
      // In reported-game leagues every human-vs-human game for the current week
      // must have an accepted report before the week can advance.
      if (league.gameMode === "reported") {
        let preflight;
        try {
          preflight = await getAdvancePreflight(leagueId);
        } catch (pfErr) {
          releaseAdvanceLock(leagueId);
          return res.status(500).json({ message: "Preflight check failed", detail: String(pfErr) });
        }
        if (!preflight.canAdvance) {
          releaseAdvanceLock(leagueId);
          return res.status(409).json({
            message: `Cannot advance: ${preflight.blockers.length} game(s) require final reports before advancing.`,
            blockers: preflight.blockers,
          });
        }
      }

      // ── Stale-op recovery: detect crashed/abandoned advances ──────────────────
      // If a prior 'running' op for this league has an expired lease, it was left
      // behind by a server crash or forced kill mid-advance.  Extract its persisted
      // checkpoints so the resumed advance can skip stages that already completed.
      // Then mark the stale op 'failed' (with a "recovered" note) before inserting
      // the new op so the DB doesn't have two concurrent 'running' rows.
      let priorCompletedStages = new Set<string>();
      try {
        const staleOp = await pool.query<{ id: string; checkpoints: Record<string, { pct: number }> }>(
          `SELECT id, checkpoints FROM league_advances
            WHERE league_id = $1
              AND status    = 'running'
              AND lease_expires_at < now()
            ORDER BY created_at DESC
            LIMIT 1`,
          [leagueId],
        );
        if ((staleOp.rowCount ?? 0) > 0) {
          const row = staleOp.rows[0];
          const checkpointObj: Record<string, { pct: number }> = row.checkpoints ?? {};
          // A completed stage is any checkpoint entry where pct === 100.
          priorCompletedStages = new Set(
            Object.entries(checkpointObj)
              .filter(([, v]) => v.pct >= 100)
              .map(([k]) => k)
          );
          console.warn(
            `[league-advances] Stale op ${row.id} recovered for league ${leagueId}. ` +
            `Completed stages from prior run: [${[...priorCompletedStages].join(", ")}].`
          );
          await pool.query(
            `UPDATE league_advances
                SET status = 'failed',
                    error_message = 'Recovered by subsequent advance attempt',
                    updated_at = now()
              WHERE id = $1`,
            [row.id],
          );
        }
      } catch (staleErr) {
        // Non-fatal — proceed without resume data if stale-op query fails.
        console.error("[league-advances] Stale-op recovery query failed (non-fatal):", staleErr);
      }

      // ── Durable operation tracking ─────────────────────────────────────────────
      // Insert a league_advances row so a crashed-server scenario is visible to the
      // commissioner via GET /advance/status.  This is FATAL — if we can't persist
      // the op record, we cannot guarantee exactly-one semantics, so we refuse to proceed.
      advOpId = randomUUID();
      try {
        await pool.query(
          `INSERT INTO league_advances
             (id, league_id, status, from_phase, from_week, from_season, locked_by, lease_expires_at)
           VALUES ($1, $2, 'running', $3, $4, $5, $6, now() + interval '15 minutes')`,
          [advOpId, leagueId, league.currentPhase, currentWeek, league.currentSeason, advOpId],
        );
      } catch (opInsertErr) {
        console.error("[league-advances] FATAL: Failed to insert op record:", opInsertErr);
        releaseAdvanceLock(leagueId);
        return res.status(500).json({ message: "Failed to create advance operation record. Please try again." });
      }

      // Start a heartbeat that renews the lease every 30 seconds so a slow advance
      // cannot be incorrectly declared abandoned by the clear-stuck endpoint, while
      // also allowing relatively fast abandoned-op detection (lease = 15 min window).
      heartbeatTimer = setInterval(() => {
        if (!advOpId) return;
        pool.query(
          `UPDATE league_advances
              SET lease_expires_at = now() + interval '15 minutes', updated_at = now()
            WHERE id = $1 AND status = 'running'`,
          [advOpId],
        ).catch(e => console.error("[league-advances] Heartbeat renewal failed:", e));
      }, 30_000);

      // Invalidate server cache immediately so data doesn't serve stale content after advance
      invalidateLeague(leagueId);

      // Auto-save before advance so commissioner can roll back if needed
      try {
        await captureLeagueSaveState(
          leagueId,
          "pre_advance",
          `Auto-save: S${league.currentSeason} W${currentWeek} (${league.currentPhase})`,
          req.session.userId
        );
      } catch (saveErr) {
        console.error("[pre-advance-save] Failed to create save state (non-fatal):", saveErr);
      }

      setAdvanceProgress(leagueId, "initializing", 5);

      // Register per-substep checkpoint writer.
      // Every setAdvanceProgress() call inside advanceLeagueStep will invoke this,
      // persisting the stage name and completion % to league_advances.checkpoints so
      // crash recovery tooling can identify exactly where an interrupted advance stopped.
      if (advOpId) {
        const opId = advOpId;
        advanceCheckpointWriters.set(leagueId, (step: string, pct: number) => {
          pool.query(
            `UPDATE league_advances
                SET checkpoints = checkpoints || $2::jsonb, updated_at = now()
              WHERE id = $1 AND status = 'running'`,
            [opId, JSON.stringify({ [step]: { pct, at: new Date().toISOString() } })],
          ).catch(e => console.error(`[league-advances] Checkpoint write failed (${step}):`, e));
        });
      }

      // Auto-clear progress, lock, and heartbeat once the response is fully sent.
      // Only mark 'complete' if the catch block did NOT already mark it 'failed'
      // (advOpFailed is set synchronously before any async DB update in catch).
      res.on("finish", () => {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        clearAdvanceProgress(leagueId);
        releaseAdvanceLock(leagueId);
        if (advOpId && !advOpFailed) {
          pool.query(
            `UPDATE league_advances SET status = 'complete', updated_at = now() WHERE id = $1 AND status = 'running'`,
            [advOpId],
          ).catch(e => console.error("[league-advances] Failed to mark complete:", e));
        }
      });

      // ── Delegate all business logic to the unified advance engine ──────────
      // Pass priorCompletedStages so the engine can skip substeps that already
      // ran in a previous (crashed) advance attempt for this league state.
      const { data } = await advanceLeagueStep(leagueId, req.session.userId!, {
        savedRecruitingClassId: req.body?.savedRecruitingClassId,
        completedStages: priorCompletedStages.size > 0 ? priorCompletedStages : undefined,
      });
      res.json(data);
    } catch (e: any) {
      if (e instanceof AdvancePreconditionError) {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        releaseAdvanceLock(req.params.id as string);
        // Set flag synchronously BEFORE the async DB update so the finish handler
        // (which fires when res.status().json() is sent) never overwrites 'failed' with 'complete'.
        advOpFailed = true;
        if (advOpId) {
          pool.query(
            `UPDATE league_advances SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1 AND status = 'running'`,
            [advOpId, e?.message || "AdvancePreconditionError"],
          ).catch(() => {});
        }
        if (!res.headersSent) return res.status(e.statusCode).json(e.body);
        return;
      }
      console.error("Failed to advance week:", e);
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      releaseAdvanceLock(req.params.id as string);
      advOpFailed = true;
      if (advOpId) {
        pool.query(
          `UPDATE league_advances SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1 AND status = 'running'`,
          [advOpId, e?.message || String(e)],
        ).catch(() => {});
      }
      if (!res.headersSent) res.status(500).json({ message: "Failed to advance week", detail: e?.message || String(e) });
    }
  });

  // Sim to Offseason - advances through regular season + postseason, stops at offseason_departures.
  // Note: advanceLeagueStep returns currentPhase="offseason_departures" when CWS (or SR-skip)
  // transitions out — the predicate catches that result before any departure auto-finalization
  // would occur on a subsequent call.
  app.post("/api/leagues/:id/sim-to-offseason", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can sim the full season." });
      }
      // Reported-mode: quick-sim inherits the same blocking gate as normal advance.
      // Fail-CLOSED: if preflight throws, refuse to sim rather than bypassing the gate.
      if (league.gameMode === "reported") {
        let pf;
        try {
          pf = await getAdvancePreflight(leagueId);
        } catch (pfErr) {
          return res.status(500).json({ message: "Preflight check failed — cannot quick-sim", detail: String(pfErr) });
        }
        if (!pf.canAdvance) {
          return res.status(409).json({ message: `Cannot quick-sim: ${pf.blockers.length} game(s) require final reports.`, blockers: pf.blockers });
        }
      }
      // Only callable from in-season or postseason phases (not already in offseason)
      const inSeasonPhases: string[] = [Phase.Preseason, Phase.SpringTraining, Phase.RegularSeason, Phase.ConferenceChampionship, Phase.SuperRegionals, Phase.CWS];
      if (!inSeasonPhases.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Can only sim to offseason from an in-season phase." });
      }
      const startSeason = league.currentSeason;
      const { league: finalLeague, steps } = await simulateUntil(
        leagueId, req.session.userId!,
        // Primary: stop as soon as the CWS/SR-skip step returns offseason_departures.
        // Safety net: stop if season increments (handles edge cases like postseason skip).
        d => (d.currentPhase as string) === Phase.OffseasonDepartures || (d.currentSeason as number) > startSeason,
      );
      await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Sim to Offseason", details: `Fast-forwarded ${steps} steps to ${finalLeague.currentPhase}.` });
      res.json(finalLeague);
    } catch (error) {
      console.error("Failed to sim to offseason:", error);
      res.status(500).json({ message: "Failed to sim to offseason" });
    }
  });

  app.post("/api/leagues/:id/sim-to-signing-day", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can sim the offseason." });
      }
      if (league.gameMode === "reported") {
        let pf;
        try {
          pf = await getAdvancePreflight(leagueId);
        } catch (pfErr) {
          return res.status(500).json({ message: "Preflight check failed — cannot quick-sim", detail: String(pfErr) });
        }
        if (!pf.canAdvance) return res.status(409).json({ message: `Cannot quick-sim: ${pf.blockers.length} game(s) require final reports.`, blockers: pf.blockers });
      }
      const offseasonPhases: string[] = [Phase.OffseasonDepartures, Phase.OffseasonRecruiting1, Phase.OffseasonRecruiting2, Phase.OffseasonRecruiting3, Phase.OffseasonRecruiting4, Phase.OffseasonSigningDay, Phase.OffseasonWalkons];
      if (!offseasonPhases.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Can only sim to signing day during offseason phases." });
      }
      const startSeason = league.currentSeason;
      const { league: finalLeague, steps } = await simulateUntil(
        leagueId, req.session.userId!,
        d => (d.currentPhase as string) === Phase.Preseason && (d.currentSeason as number) > startSeason,
      );
      await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Sim to Signing Day", details: `Fast-forwarded ${steps} steps to preseason season ${finalLeague.currentSeason}.` });
      res.json({ ...finalLeague, seasonTransition: (finalLeague as any).seasonTransition });
    } catch (error) {
      console.error("Failed to sim to signing day:", error);
      res.status(500).json({ message: "Failed to sim to signing day" });
    }
  });

  // Sim Full Season - advances from any phase all the way to preseason of the next season.
  app.post("/api/leagues/:id/sim-full-season", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can simulate a full season." });
      }
      const startSeason = league.currentSeason;
      const { league: finalLeague, steps } = await simulateUntil(
        leagueId, req.session.userId!,
        d => (d.currentPhase as string) === Phase.Preseason && (d.currentSeason as number) > startSeason,
      );
      await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Sim Full Season", details: `Simulated ${steps} advances. Now season ${finalLeague.currentSeason}, phase ${finalLeague.currentPhase}.` });
      res.json({ ...finalLeague, simSummary: {} });
    } catch (error) {
      console.error("Failed to sim full season:", error);
      res.status(500).json({ message: "Failed to simulate full season" });
    }
  });

  // Sim to Postseason - stops at conference_championship.
  app.post("/api/leagues/:id/sim-to-postseason", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can sim." });
      }
      if (league.gameMode === "reported") {
        let pf;
        try {
          pf = await getAdvancePreflight(leagueId);
        } catch (pfErr) {
          return res.status(500).json({ message: "Preflight check failed — cannot quick-sim", detail: String(pfErr) });
        }
        if (!pf.canAdvance) return res.status(409).json({ message: `Cannot quick-sim: ${pf.blockers.length} game(s) require final reports.`, blockers: pf.blockers });
      }
      const preseasonPhases: string[] = [Phase.Preseason, Phase.SpringTraining, Phase.RegularSeason];
      if (!preseasonPhases.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Can only sim to postseason during the regular season." });
      }
      const { league: finalLeague, steps } = await simulateUntil(
        leagueId, req.session.userId!,
        d => (d.currentPhase as string) === Phase.ConferenceChampionship,
      );
      await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Sim to Postseason", details: `Simulated ${steps} advances to ${finalLeague.currentPhase}.` });
      res.json({ ...finalLeague, simSummary: {} });
    } catch (error) {
      console.error("Failed to sim to postseason:", error);
      res.status(500).json({ message: "Failed to sim to postseason" });
    }
  });

  // Sim to CWS - advances through regular season + conference championships + super regionals, stops at CWS.
  app.post("/api/leagues/:id/sim-to-cws", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can sim." });
      }
      const preCwsPhases: string[] = [Phase.Preseason, Phase.SpringTraining, Phase.RegularSeason, Phase.ConferenceChampionship, Phase.SuperRegionals];
      if (!preCwsPhases.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Can only sim to CWS before the College World Series." });
      }
      const { league: finalLeague, steps } = await simulateUntil(
        leagueId, req.session.userId!,
        d => (d.currentPhase as string) === Phase.CWS,
      );
      await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Sim to CWS", details: `Simulated ${steps} advances to ${finalLeague.currentPhase}.` });
      res.json({ ...finalLeague, simSummary: {} });
    } catch (error) {
      console.error("Failed to sim to CWS:", error);
      res.status(500).json({ message: "Failed to sim to CWS" });
    }
  });
  app.post("/api/leagues/:id/admin/dedup-rosters", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }

      const leagueTeams = await storage.getTeamsByLeague(league.id);
      let totalRemoved = 0;
      const log: string[] = [];

      // Pre-load season stats for the entire league so we can prefer
      // the player that has accumulated stats (they are the "original").
      // Both duplicates were typically created in the same transition so
      // usually neither will have stats — in that case we fall back to
      // the player referenced by player_history, or finally keep
      // the one encountered first by the DB (arbitrary but deterministic).
      const allStats = await storage.getAllPlayerSeasonStatsByLeague(league.id);
      const playerIdsWithStats = new Set(allStats.map(s => s.playerId));

      for (const team of leagueTeams) {
        const roster = await storage.getPlayersByTeam(team.id);
        // Sort so players WITH stats come first (they are the "original").
        // Ties broken by UUID lexical order for determinism.
        const sorted = roster.slice().sort((a, b) => {
          const aHasStats = playerIdsWithStats.has(a.id) ? 0 : 1;
          const bHasStats = playerIdsWithStats.has(b.id) ? 0 : 1;
          if (aHasStats !== bHasStats) return aHasStats - bHasStats;
          return a.id.localeCompare(b.id);
        });
        const seen = new Map<string, string>(); // nameKey → kept player id
        for (const player of sorted) {
          const key = `${player.firstName}|${player.lastName}`;
          if (seen.has(key)) {
            await storage.deletePlayer(player.id);
            const msg = `Removed duplicate ${player.firstName} ${player.lastName} (id=${player.id}) from ${team.name}`;
            log.push(msg);
            console.log(`[dedup-rosters] ${msg}`);
            totalRemoved++;
          } else {
            seen.set(key, player.id);
          }
        }
      }

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId!,
        action: "Admin: Dedup Rosters",
        details: `Removed ${totalRemoved} duplicate player row(s). ${log.join("; ")}`,
      });

      res.json({ removed: totalRemoved, log });
    } catch (error) {
      console.error("Failed to dedup rosters:", error);
      res.status(500).json({ message: "Failed to dedup rosters" });
    }
  });



  // Explicit season advance endpoint
  app.post("/api/leagues/:id/advance-season", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only commissioner can advance the season" });
      }
      
      const offseasonPhaseList = ["offseason", "offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
      if (!offseasonPhaseList.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Season can only be advanced during offseason phase" });
      }
      
      invalidateLeague(league.id);
      const transitionResult = await performSeasonTransition(league.id, league.currentSeason);
      
      const updatedLeague = await storage.updateLeague(league.id, {
        currentWeek: 1,
        currentSeason: league.currentSeason + 1,
        currentPhase: "preseason",
      });

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Season Advanced",
        details: `Season ${league.currentSeason} ended. ${transitionResult.recruitsAdded} recruits joined rosters, ${transitionResult.newRecruits} new recruits generated.`,
      });

      res.json({ ...updatedLeague, seasonTransition: transitionResult });
    } catch (error) {
      console.error("Failed to advance season:", error);
      res.status(500).json({ message: "Failed to advance season" });
    }
  });


  // ============ CPU RECRUITING AI FUNCTION ============
  // forcedHumanTeamIds: non-auto-pilot human teams that were force-advanced by the commissioner
  // and should have CPU recruiting run for them at all_american difficulty.
}
