/**
 * Shared helpers, middleware, and schemas used across route modules.
 *
 * Extracted from the monolithic server/routes.ts so that each domain
 * route module can import what it needs without duplication.
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getPersonalityForArchetype, getTraitBadgesForArchetype, getPhilosophyForArchetype, evaluateMilestones } from "@shared/coachTraits";
import { storage } from "./storage";
import type { Player } from "@shared/schema";
import type { CoachSeasonHistory } from "@shared/schema";

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────

declare module "express-session" {
  interface SessionData {
    userId?: string;
    isGuest?: boolean;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId && !req.session.isGuest) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export function hasCommissionerAccess(
  league: { commissionerId: string; coCommissionerIds?: unknown },
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  if (league.commissionerId === userId) return true;
  const coIds = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
  return coIds.includes(userId);
}

/**
 * Resolve the team for a given user session WITHOUT falling back to the first
 * non-CPU team.  In a multiplayer league every coach owns exactly one team;
 * using a CPU fallback routes unmatched requests to the wrong team and
 * corrupts cross-team data.
 *
 * Returns { userCoach: undefined, userTeam: undefined } when no coach is
 * found for the user (or the coach has no team), so callers can return 400.
 */
export function resolveUserTeam<
  C extends { userId?: string | null; teamId?: string | null },
  T extends { id: string },
>(
  coaches: C[],
  teams: T[],
  userId: string | undefined,
): { userCoach: C | undefined; userTeam: T | undefined } {
  const userCoach = userId ? coaches.find(c => c.userId === userId) : undefined;
  const userTeam = userCoach?.teamId ? teams.find(t => t.id === userCoach.teamId) : undefined;
  return { userCoach, userTeam };
}

// Only the commissioner (or a co-commissioner) or a coach involved in the game
// (home/away) may view an uploaded box-score screenshot for that game.
export async function canAccessGameReportImage(
  leagueId: string,
  gameId: string,
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const league = await storage.getLeague(leagueId);
  if (!league) return false;
  if (hasCommissionerAccess(league, userId)) return true;
  const game = await storage.getGame(gameId);
  if (!game || game.leagueId !== leagueId) return false;
  const coaches = await storage.getCoachesByLeague(leagueId);
  const coach = coaches.find((c: any) => c.userId === userId);
  if (!coach) return false;
  // Completed games: any league member can view evidence screenshots (evidence vault).
  // Incomplete/pending games: only the two involved coaches.
  if (game.isComplete) return true;
  return !!(coach.teamId && (coach.teamId === game.homeTeamId || coach.teamId === game.awayTeamId));
}

// ── CONSTANTS ────────────────────────────────────────────────────────────────

export const SALT_ROUNDS = 10;

// ── INPUT SCHEMAS ─────────────────────────────────────────────────────────────

export const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const leagueCreateSchema = z.object({
  name: z.string().min(1).max(100),
  maxTeams: z.number().min(6).max(64).optional(),
  cpuDifficulty: z.enum(["beginner", "high_school", "all_american", "elite"]).optional(),
  conferenceCount: z.number().min(2).max(4).optional(),
  selectedConferences: z.array(z.string()).min(1).max(4).optional(),
  seasonLength: z.enum(["short", "medium", "standard", "long"]).optional(),
  progressionEnabled: z.boolean().optional(),
});

export const gameScoreSchema = z.object({
  homeScore: z.number().min(0),
  awayScore: z.number().min(0),
});

export const setupSchema = z.object({
  teamId: z.string().min(1),
  coach: z.object({
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    archetype: z.enum(["Balanced", "Pure CEO", "Player's Coach", "Tactician", "Old School", "Scout Master", "Academic Dean", "Dealmaker"]).optional(),
    skinTone: z.string().optional(),
    hairColor: z.string().optional(),
    hairStyle: z.string().optional(),
  }),
});

export const settingsSchema = z.object({
  auditLogPublic: z.boolean().optional(),
  cpuDifficulty: z.enum(["beginner", "high_school", "all_american", "elite"]).optional(),
  cpuRecruitingAggression: z.number().int().min(1).max(5).optional(),
  emailDigestsEnabled: z.boolean().optional(),
  showReadyNamesToAll: z.boolean().optional(),
});

// ── PRESENCE TRACKER ─────────────────────────────────────────────────────────

export const presenceMap = new Map<string, number>();
const PRESENCE_TTL_MS = 2 * 60 * 1000;

export function prunePresence() {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [token, ts] of Array.from(presenceMap)) {
    if (ts < cutoff) presenceMap.delete(token);
  }
}

export function getOnlineCount(): number {
  prunePresence();
  return presenceMap.size;
}

// ── PER-LEAGUE ADVANCE LOCK ───────────────────────────────────────────────────
// Prevents the advance endpoint from being executed concurrently for the same
// league (double-click / network-retry protection).

export const advancingLeagues = new Set<string>();

// ── POTENTIAL GRADE → NUMBER ──────────────────────────────────────────────────

export function potentialGradeToNumber(grade: string): number {
  const map: Record<string, number> = {
    "F": 51, "D-": 55, "D": 59, "D+": 63,
    "C-": 67, "C": 71, "C+": 75,
    "B-": 79, "B": 83, "B+": 87,
    "A-": 91, "A": 95, "A+": 98,
  };
  return map[grade] ?? 71;
}

// ── AUTO-ASSIGN LINEUP ────────────────────────────────────────────────────────

export async function autoAssignLineup(teamPlayers: Player[], teamId: string): Promise<void> {
  const PITCHER_POSITIONS = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"];
  const OF_POSITIONS = ["LF", "CF", "RF"];
  const positionPlayers = teamPlayers.filter(p => !PITCHER_POSITIONS.includes(p.position));
  const pitchers = teamPlayers.filter(p => PITCHER_POSITIONS.includes(p.position));

  const positionSlots = ["C", "1B", "2B", "SS", "3B", "CF", "RF", "LF"];
  const starters: Player[] = [];
  const starterLineupPositions = new Map<string, string>();
  const usedIds = new Set<string>();

  const defScore = (pos: string, p: Player): number => {
    const ovr = p.overall || 0;
    switch (pos) {
      case "CF": return (p.speed || 0) * 0.5 + (p.fielding || 0) * 0.5;
      case "RF": return (p.arm || 0);
      case "SS": return (p.fielding || 0) * 0.5 + (p.arm || 0) * 0.5;
      case "3B": return (p.arm || 0) * 0.4 + (p.fielding || 0) * 0.35 + ovr * 0.25;
      case "2B": return (p.fielding || 0) * 0.5 + (p.speed || 0) * 0.3 + ovr * 0.2;
      default:   return ovr;
    }
  };

  for (const pos of positionSlots) {
    let candidates: Player[];
    if (OF_POSITIONS.includes(pos)) {
      candidates = positionPlayers.filter(p => (OF_POSITIONS.includes(p.position) || p.position === "OF") && !usedIds.has(p.id));
    } else {
      candidates = positionPlayers.filter(p => p.position === pos && !usedIds.has(p.id));
    }
    candidates.sort((a, b) => defScore(pos, b) - defScore(pos, a));
    if (candidates.length > 0) {
      starters.push(candidates[0]);
      usedIds.add(candidates[0].id);
      starterLineupPositions.set(candidates[0].id, pos);
    }
  }

  if (starters.length < 9) {
    const dhCandidates = positionPlayers
      .filter(p => !usedIds.has(p.id))
      .sort((a, b) => (b.overall || 0) - (a.overall || 0));
    if (dhCandidates.length > 0) {
      starters.push(dhCandidates[0]);
      usedIds.add(dhCandidates[0].id);
      starterLineupPositions.set(dhCandidates[0].id, "DH");
    }
  }

  const remaining = [...starters];

  const pickBest = (scoreFn: (p: Player) => number): Player => {
    remaining.sort((a, b) => scoreFn(b) - scoreFn(a));
    return remaining.shift()!;
  };
  const pickWorst = (scoreFn: (p: Player) => number): Player => {
    remaining.sort((a, b) => scoreFn(a) - scoreFn(b));
    return remaining.shift()!;
  };

  const slotAssignments: Player[] = [];
  const bestHitterFn = (p: Player) => (p.hitForAvg || 0) * 0.40 + (p.power || 0) * 0.35 + (p.speed || 0) * 0.15 + (p.clutch || 0) * 0.10;
  const offensiveFn  = (p: Player) => (p.hitForAvg || 0) * 0.40 + (p.power || 0) * 0.35 + (p.speed || 0) * 0.15 + (p.clutch || 0) * 0.10;

  slotAssignments[1] = pickBest(bestHitterFn);
  slotAssignments[2] = pickBest(bestHitterFn);
  slotAssignments[0] = pickBest(p => (p.speed || 0) * 0.45 + (p.hitForAvg || 0) * 0.45 + (p.clutch || 0) * 0.10);
  slotAssignments[3] = pickBest(p => (p.power || 0) * 0.55 + (p.clutch || 0) * 0.30 + (p.hitForAvg || 0) * 0.15);
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) * 0.35 + (p.power || 0) * 0.40 + (p.clutch || 0) * 0.15 + (p.speed || 0) * 0.10));
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) * 0.35 + (p.power || 0) * 0.40 + (p.clutch || 0) * 0.15 + (p.speed || 0) * 0.10));
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) * 0.50 + (p.power || 0) * 0.30 + (p.speed || 0) * 0.20));
  slotAssignments.push(pickWorst(offensiveFn));
  slotAssignments.push(pickBest(p => (p.speed || 0) * 0.50 + (p.hitForAvg || 0) * 0.40 + (p.clutch || 0) * 0.10));

  const hitterUpdates = positionPlayers.map(p => {
    const slot = slotAssignments.indexOf(p);
    const lineupPos = starterLineupPositions.get(p.id) ?? null;
    return slot !== -1
      ? { id: p.id, data: { battingOrder: slot + 1, lineupPosition: lineupPos } }
      : { id: p.id, data: { battingOrder: null, lineupPosition: null } };
  });

  const weekendStarterScore = (p: Player) => (p.overall || 0) * 0.70 + (p.stamina || 0) * 0.30;
  const midweekStarterScore = (p: Player) => (p.overall || 0) * 0.85 + (p.potential || 0) * 0.15;

  const pitcherPool = [...pitchers];
  const assignedPitcherIds = new Set<string>();

  const pickPitcher = (scoreFn: (p: Player) => number): Player | null => {
    const pool = pitcherPool.filter(p => !assignedPitcherIds.has(p.id));
    if (pool.length === 0) return null;
    pool.sort((a, b) => scoreFn(b) - scoreFn(a));
    const picked = pool[0];
    assignedPitcherIds.add(picked.id);
    return picked;
  };

  const roleMap = new Map<string, string>();

  const fri = pickPitcher(weekendStarterScore);
  if (fri) roleMap.set(fri.id, "FRI");
  const sat = pickPitcher(weekendStarterScore);
  if (sat) roleMap.set(sat.id, "SAT");
  const sun = pickPitcher(weekendStarterScore);
  if (sun) roleMap.set(sun.id, "SUN");
  const mid = pickPitcher(midweekStarterScore);
  if (mid) roleMap.set(mid.id, "MID");
  const cp = pickPitcher(p => (p.velocity || 0) + (p.control || 0) - (p.stamina || 0) * 0.5);
  if (cp) roleMap.set(cp.id, "CP");
  const su = pickPitcher(p => (p.stuff || 0));
  if (su) roleMap.set(su.id, "SU");

  const bullpenRoles = ["MR1", "MR2", "MR3", "LRP"];
  const remainingBullpen = pitcherPool
    .filter(p => !assignedPitcherIds.has(p.id))
    .sort((a, b) => (b.overall || 0) - (a.overall || 0));
  for (let i = 0; i < remainingBullpen.length; i++) {
    const role = bullpenRoles[i] ?? null;
    if (role !== null) roleMap.set(remainingBullpen[i].id, role);
  }

  const pitcherUpdates = pitchers.map(p => ({
    id: p.id,
    data: { pitchingRole: roleMap.get(p.id) ?? null },
  }));

  await storage.batchUpdatePlayersLineup([...hitterUpdates, ...pitcherUpdates]);
}

// ── COACH TRAITS AUTO-ASSIGN ──────────────────────────────────────────────────

export async function ensureCoachTraits(
  coach: {
    id: string; archetype: string; leagueId: string; teamId?: string | null;
    personality?: string | null; traitBadges?: string[] | null;
    coachingPhilosophy?: {statement: string; importance: string}[] | null;
    careerMilestones?: {id: string; season: number}[] | null;
    careerWins: number; careerLosses: number; level: number;
    confChampionships: number; cwsAppearances: number; nationalChampionships: number;
    allAmericans: number; draftPicks: number;
  },
  currentSeason?: number,
) {
  const updates: Record<string, unknown> = {};
  if (!coach.personality) {
    updates.personality = getPersonalityForArchetype(coach.archetype).id;
  }
  if (!coach.traitBadges || (coach.traitBadges as string[]).length === 0) {
    updates.traitBadges = getTraitBadgesForArchetype(coach.archetype);
  }
  if (!coach.coachingPhilosophy || (coach.coachingPhilosophy as unknown[]).length === 0) {
    updates.coachingPhilosophy = getPhilosophyForArchetype(coach.archetype);
  }

  if (currentSeason != null) {
    let recruitingStats = { totalSigned: 0, threeStars: 0, fourStars: 0, fiveStars: 0, blueChipsSigned: 0 };
    try {
      if (coach.teamId) {
        const snaps = await storage.getRecruitingClassSnapshotsAllSeasons(coach.leagueId);
        const teamSnaps = snaps.filter(s => s.teamId === coach.teamId);
        recruitingStats = {
          totalSigned: teamSnaps.reduce((s, sn) => s + sn.totalCommits, 0),
          threeStars: teamSnaps.reduce((s, sn) => s + sn.threeStars, 0),
          fourStars: teamSnaps.reduce((s, sn) => s + sn.fourStars, 0),
          fiveStars: teamSnaps.reduce((s, sn) => s + sn.fiveStars, 0),
          blueChipsSigned: 0,
        };
        const allRecruits = await storage.getRecruitsByLeague(coach.leagueId);
        recruitingStats.blueChipsSigned = allRecruits.filter(
          r => r.signedTeamId === coach.teamId && r.isBlueChip === true && r.starRating === 5
        ).length;
      }
    } catch (err) {
      console.error("[ensureCoachTraits] Failed to load recruiting stats for milestones:", err);
    }

    const coachHistory = await storage.getCoachSeasonHistory(coach.id).catch((err: unknown) => {
      console.error("[ensureCoachTraits] Failed to load season history for coach", coach.id, ":", err);
      return [] as CoachSeasonHistory[];
    });
    const seasonsCoached = coachHistory.length;
    const bestSeasonWins = coachHistory.reduce((max, h) => Math.max(max, h.wins), 0);

    const currentMilestones = coach.careerMilestones ?? [];
    const earnedMilestones = evaluateMilestones(
      { ...coach, careerMilestones: currentMilestones, seasonsCoached, bestSeasonWins },
      recruitingStats,
      currentSeason,
    );
    if (earnedMilestones.length > currentMilestones.length) {
      updates.careerMilestones = earnedMilestones;
    }
  }

  if (Object.keys(updates).length > 0) {
    await storage.updateCoach(coach.id, updates as Parameters<typeof storage.updateCoach>[1]);
  }
}


// ── Retention bonus based on coach philosophy ───────────────────────────────
export function calculatePhilosophyRetentionBonus(coach: any): number {
  const philosophy = Array.isArray(coach?.coachingPhilosophy)
    ? (coach.coachingPhilosophy as { statement: string; importance: string }[])
    : [];
  if (philosophy.length === 0) return 0;

  const importanceScale: Record<string, number> = { extremely: 1.0, very: 0.67, somewhat: 0.33 };
  let bonus = 0;

  for (const { statement, importance } of philosophy) {
    const scale = importanceScale[importance] ?? 0.33;
    switch (statement) {
      case "Build Team Chemistry":
        // Team cohesion creates stronger program bonds — players less likely to transfer
        bonus += 0.08 * scale;
        break;
      case "Positive Culture":
        // Positive environment improves player satisfaction and reduces portal departures
        bonus += 0.08 * scale;
        break;
      case "Graduation Rate Matters":
        // Players feel invested in their academic journey — academic loyalty bonus
        bonus += 0.08 * scale;
        break;
      case "Earn Everything":
        // Meritocracy culture: players who earn their spot are more committed to the program
        bonus += 0.05 * scale;
        break;
      case "Player Development First":
        // Players see tangible improvement — development pathway keeps them around
        bonus += 0.05 * scale;
        break;
      case "Trust the Process":
        // Players who bought in are deeply loyal to the system
        bonus += 0.04 * scale;
        break;
      case "Play the Right Way":
        // Culture of discipline and values creates loyalty among like-minded players
        bonus += 0.04 * scale;
        break;
    }
  }

  return Math.min(0.15, bonus); // Cap at +15pp total retention bonus
}

// ── SIGNING INTEREST THRESHOLD ───────────────────────────────────────────────
// Shared by the manual /sign endpoint (recruiting.ts) and the signing-day
// auto-commit logic (updateRecruitStages in league-mgmt.ts) so both paths use
// an identical star/blue-chip/storyline/prestige-adjusted threshold. Keeping
// this in one place prevents the two signing paths from drifting apart.
export function calculateSignInterestThreshold(
  starRating: number,
  isBlueChip: boolean,
  isStoryline: boolean,
  signingTeamPrestige: number,
): number {
  const storylineInterestBonus = isStoryline ? 10 : 0;
  const prestigeThresholdReduction = signingTeamPrestige >= 9 ? 5 : signingTeamPrestige >= 8 ? 3 : 0;
  return Math.max(
    55,
    (isBlueChip ? 90 : starRating >= 5 ? 85 : starRating >= 4 ? 75 : 65) +
      storylineInterestBonus -
      prestigeThresholdReduction,
  );
}

// Recruit stages eligible for manual/auto signing — a recruit must have
// progressed at least to "top3" before any team (with an offer + sufficient
// interest) can close the deal. Guards against instant-signing a recruit who
// hasn't shown real commitment signals yet.
export const SIGNABLE_STAGES = new Set(["top3", "verbal"]);

// Calculate proximity bonus based on recruit home state vs team state.
// Optional `team` param: national brands (prestige 8+ AND/OR stadium 8+) compress the
// out-of-region/out-of-state penalty — recruits across the country already know them.
