import type { Express, Request, Response, NextFunction } from "express";
import { resolveUserTeam } from "./route-helpers";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerStorylineRoutes, initializeStorylineRecruits, generateAndResolveStorylineEvents, resolveAllPendingStorylineEvents } from "./storyline-routes";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";
import { z } from "zod";
import { randomUUID } from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { getRandomAbilities, getAbilitiesForPosition, calculateOVR, getStarRatingFromOVR, enforceGoldOvrGate } from "@shared/abilities";
import { FULL_SEASON_TOTAL, FULL_SEASON_CONF_NAMES, FULL_SEASON_RULES, CONF_SIZE_MAP, CONFERENCE_CATALOG } from "@shared/catalog";
import { FULL_SEASON_RULES_SNAPSHOT, leagueRulesSnapshotSchema } from "@shared/leagueRules";
import { getPotentialRange, getProgressionZone, rollWeightedPotential, getPotentialGrade } from "@shared/potential";
import { getActionPointCost } from "@shared/stateDistance";
import { getPersonalityForArchetype, getTraitBadgesForArchetype, getPhilosophyForArchetype, evaluateMilestones } from "@shared/coachTraits";
import { CONFERENCE_TIER_NIL, DEFAULT_CONFERENCE_NIL } from "@shared/nilConfig";
import type { Player, Recruit, TransferPortalInterest, Game, InsertPlayerSeasonStats, GameReport, LastSeasonStats, AdvanceDigestCategories } from "@shared/schema";
import { getRecruitPoolSize } from "./utils";
import { cacheGet, cacheSet, leagueCacheKey, invalidateLeague } from "./cache";
import { evaluatePlayerPromises, processOffseasonDepartures, finalizeDeparturesInternal } from "./offseason-helpers";
import {
  generateGameNewsArticles,
  generateCWSChampionNewsArticle,
  generateRecruitCommitNewsArticle,
  generateDraftDeclarationNewsArticle,
  generateTransferPortalNewsArticle,
  generateSeasonPreviewNewsArticle,
  generateConferenceUpdateNews,
  generateDeparturesSummaryNews,
} from "./news-engine";
import { getRealRosters } from "./realRostersLoader";
import { checkTeamRosterStructure } from "./rosterValidation";
import { NATIONAL_RANKS, TOTAL_NATIONAL_TEAMS } from "./rosterScaleFactors";
import { sendWeeklyDigests, verifyUnsubToken } from "./digestEmail";
import { pool, db } from "./db";
import { checkMigrationVersion } from "./lib/runMigrations";
import { sql as drizzleSql } from "drizzle-orm";
import { coaches as coachesTable } from "@shared/schema";

// ── Domain route modules ─────────────────────────────────────────────────────
import { registerAuthRoutes } from "./routes/auth";
import { registerGameRoutes } from "./routes/games";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerInviteRoutes } from "./routes/invites";
import { registerSavedRoutes } from "./routes/saved";
import { registerClassProjectRoutes } from "./routes/class-projects";
import { registerAiClassJobRoutes } from "./routes/aiClassJobs";
import { registerStatsRoutes } from "./routes/stats";
import { registerRecruitingRoutes } from "./routes/recruiting";
import { registerDeparturesRoutes } from "./routes/departures";
import { registerWalkonRoutes } from "./routes/walkons";
import { registerPostseasonRoutes } from "./routes/postseason";
import { registerLeagueMgmtRoutes } from "./routes/league-mgmt";
import { registerRosterRoutes } from "./routes/roster";
import { registerSimulationRoutes, simulateGame } from "./routes/simulation";
import { registerSaveStateRoutes } from "./routes/saveStates";
import { registerWarRoomRoutes } from "./routes/war-room";
import { registerTickerRoutes } from "./routes/ticker";
import { registerCoachMessageRoutes } from "./routes/coach-messages";
import { registerRivalryRoutes } from "./routes/rivalries";
import { registerNewsRoutes } from "./routes/news";
import { registerIdentityRoutes } from "./routes/identity";
import { registerEditorRoutes } from "./routes/editor";
import { createScheduleForSeason, previewFullSeasonSchedule, publishFullSeasonSchedule } from "./services/schedule/createScheduleForSeason";
import {
  generateSchedule,
  generateRecruits,
  generateCpuCoaches,
  getTeamsForConference,
  generateExhibitionGames,
  getAttributesToRevealCount,
  getAttributesToReveal,
  generatePlayersForTeam,
} from "./recruit-engine";

function potentialGradeToNumber(grade: string): number {
  const map: Record<string, number> = {
    "F": 51, "D-": 55, "D": 59, "D+": 63,
    "C-": 67, "C": 71, "C+": 75,
    "B-": 79, "B": 83, "B+": 87,
    "A-": 91, "A": 95, "A+": 98,
  };
  return map[grade] ?? 71;
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    isGuest?: boolean;
  }
}

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const leagueCreateSchema = z.object({
  name: z.string().min(1).max(100),
  maxTeams: z.number().min(6).max(149).optional(),
  cpuDifficulty: z.enum(["beginner", "high_school", "all_american", "elite"]).optional(),
  conferenceCount: z.number().min(2).max(12).optional(),
  selectedConferences: z.array(z.string()).min(1).max(12).optional(),
  seasonLength: z.enum(["short", "medium", "standard", "long", "full_season"]).optional(),
  progressionEnabled: z.boolean().optional(),
  isTestData: z.boolean().optional(),
  gameMode: z.enum(["simulated", "reported"]).optional(),
  preset: z.enum(["custom", "full_season"]).optional(),
});

const gameScoreSchema = z.object({
  homeScore: z.number().min(0),
  awayScore: z.number().min(0),
});

const setupSchema = z.object({
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

const settingsSchema = z.object({
  auditLogPublic: z.boolean().optional(),
  cpuDifficulty: z.enum(["beginner", "high_school", "all_american", "elite"]).optional(),
  cpuRecruitingAggression: z.number().int().min(1).max(5).optional(),
  emailDigestsEnabled: z.boolean().optional(),
  showReadyNamesToAll: z.boolean().optional(),
});

const SALT_ROUNDS = 10;

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId && !req.session.isGuest) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

function hasCommissionerAccess(
  league: { commissionerId: string; coCommissionerIds?: unknown },
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  if (league.commissionerId === userId) return true;
  const coIds = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
  return coIds.includes(userId);
}

async function autoAssignLineup(storage: any, teamPlayers: Player[], teamId: string): Promise<void> {
  const PITCHER_POSITIONS = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"];
  const OF_POSITIONS = ["LF", "CF", "RF"];
  const positionPlayers = teamPlayers.filter(p => !PITCHER_POSITIONS.includes(p.position));
  const pitchers = teamPlayers.filter(p => PITCHER_POSITIONS.includes(p.position));

  // ── STEP 1: pick one starter per defensive position ──────────────────────
  // OF assignment order: CF (speed+fielding) → RF (arm) → LF (bat-first corner).
  // Infield: SS/3B/2B use attribute composites; C/1B retain overall-based selection.
  const positionSlots = ["C", "1B", "2B", "SS", "3B", "CF", "RF", "LF"];
  const starters: Player[] = [];
  const starterLineupPositions = new Map<string, string>(); // playerId → defensive position
  const usedIds = new Set<string>();

  const defScore = (pos: string, p: Player): number => {
    const ovr = p.overall || 0;
    switch (pos) {
      case "CF": return (p.speed || 0) * 0.5 + (p.fielding || 0) * 0.5;
      case "RF": return (p.arm || 0);
      case "SS": return (p.fielding || 0) * 0.5 + (p.arm || 0) * 0.5;
      case "3B": return (p.arm || 0) * 0.4 + (p.fielding || 0) * 0.35 + ovr * 0.25;
      case "2B": return (p.fielding || 0) * 0.5 + (p.speed || 0) * 0.3 + ovr * 0.2;
      default:   return ovr; // C, 1B, LF (bat-first corner)
    }
  };

  for (const pos of positionSlots) {
    let candidates: Player[];
    if (OF_POSITIONS.includes(pos)) {
      // All OF-eligible labels (LF, CF, RF, OF) compete for each outfield slot
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

  // Fill 9th spot (DH) with the best remaining position player
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

  // ── STEP 2: assign batting order slots using baseball-role logic ──────────
  // Each slot greedily picks the best match from a remaining pool to avoid
  // double-assigning the same player.

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

  // Slot 2 — Best hitter FIRST (modern "best hitter bats second" — must be selected before leadoff)
  slotAssignments[1] = pickBest(bestHitterFn);

  // Slot 3 — Second-best bat (same composite as slot 2, from remaining after slot 2 is pulled)
  slotAssignments[2] = pickBest(bestHitterFn);

  // Slot 1 — Leadoff: speed + contact + clutch (from remaining, so the best composite bat stays at 2)
  slotAssignments[0] = pickBest(p => (p.speed || 0) * 0.45 + (p.hitForAvg || 0) * 0.45 + (p.clutch || 0) * 0.10);

  // Slot 4 — Cleanup: power + clutch heavy
  slotAssignments[3] = pickBest(p => (p.power || 0) * 0.55 + (p.clutch || 0) * 0.30 + (p.hitForAvg || 0) * 0.15);

  // Slot 5 — Balanced
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) * 0.35 + (p.power || 0) * 0.40 + (p.clutch || 0) * 0.15 + (p.speed || 0) * 0.10));

  // Slot 6 — Balanced
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) * 0.35 + (p.power || 0) * 0.40 + (p.clutch || 0) * 0.15 + (p.speed || 0) * 0.10));

  // Slot 7 — Contact-leaning
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) * 0.50 + (p.power || 0) * 0.30 + (p.speed || 0) * 0.20));

  // Slot 8 — Defensive specialist / weakest offensive bat
  slotAssignments.push(pickWorst(offensiveFn));

  // Slot 9 — Second leadoff: speed + contact + clutch
  slotAssignments.push(pickBest(p => (p.speed || 0) * 0.50 + (p.hitForAvg || 0) * 0.40 + (p.clutch || 0) * 0.10));

  // Collect batting order / lineup position updates for batch write
  const hitterUpdates = positionPlayers.map(p => {
    const slot = slotAssignments.indexOf(p);
    const lineupPos = starterLineupPositions.get(p.id) ?? null;
    return slot !== -1
      ? { id: p.id, data: { battingOrder: slot + 1, lineupPosition: lineupPos } }
      : { id: p.id, data: { battingOrder: null, lineupPosition: null } };
  });

  // ── STEP 3: assign pitching roles ─────────────────────────────────────────
  // Weekend starters (FRI/SAT/SUN): overall * 0.70 + stamina * 0.30
  // Midweek starter (MID): overall * 0.85 + potential * 0.15 (stamina-neutral, rewards upside)
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

  // FRI — highest stamina-weighted starter
  const fri = pickPitcher(weekendStarterScore);
  if (fri) roleMap.set(fri.id, "FRI");

  // SAT — second stamina-weighted starter
  const sat = pickPitcher(weekendStarterScore);
  if (sat) roleMap.set(sat.id, "SAT");

  // SUN — third stamina-weighted starter
  const sun = pickPitcher(weekendStarterScore);
  if (sun) roleMap.set(sun.id, "SUN");

  // MID — stamina-neutral: best overall + potential (developing arm can slot here)
  const mid = pickPitcher(midweekStarterScore);
  if (mid) roleMap.set(mid.id, "MID");

  // CP — Closer: low stamina + high velocity/control; score = (velocity + control) - stamina * 0.5
  const cp = pickPitcher(p => (p.velocity || 0) + (p.control || 0) - (p.stamina || 0) * 0.5);
  if (cp) roleMap.set(cp.id, "CP");

  // SU — Setup: highest stuff (specialty pitches)
  const su = pickPitcher(p => (p.stuff || 0));
  if (su) roleMap.set(su.id, "SU");

  // Remaining → MR1, MR2, MR3, LRP in overall order
  const bullpenRoles = ["MR1", "MR2", "MR3", "LRP"];
  const remainingBullpen = pitcherPool
    .filter(p => !assignedPitcherIds.has(p.id))
    .sort((a, b) => (b.overall || 0) - (a.overall || 0));
  for (let i = 0; i < remainingBullpen.length; i++) {
    const role = bullpenRoles[i] ?? null;
    if (role !== null) roleMap.set(remainingBullpen[i].id, role);
  }

  // Collect pitcher role updates, then flush all writes in one batch
  const pitcherUpdates = pitchers.map(p => ({
    id: p.id,
    data: { pitchingRole: roleMap.get(p.id) ?? null },
  }));

  await storage.batchUpdatePlayersLineup([...hitterUpdates, ...pitcherUpdates]);
}

// ============ COACH TRAITS AUTO-ASSIGN HELPER (module-scope so generateCpuCoaches can call it) ============
async function ensureCoachTraits(
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

  // Milestone evaluation is expensive (needs season history + recruiting snapshots + league read).
  // Only run it at explicit phase boundaries where currentSeason is provided — not on profile GETs.
  // Phase hooks (finalizeSigningDay, coach creation) always pass currentSeason.
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

    // Compute seasonsCoached and bestSeasonWins from history for accurate milestone evaluation
    const coachHistory = await storage.getCoachSeasonHistory(coach.id).catch((err: unknown) => {
      console.error("[ensureCoachTraits] Failed to load season history for coach", coach.id, ":", err);
      return [] as import("../shared/schema").CoachSeasonHistory[];
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

// Per-league lock: prevents the advance endpoint from being executed
// concurrently for the same league (double-click / network retry protection).
const advancingLeagues = new Set<string>();

// ── IN-MEMORY PRESENCE TRACKER ───────────────────────────────────────────────
// Maps anonymous client token → last-seen timestamp (ms).
// No DB storage required; resets on server restart (that's fine).
const presenceMap = new Map<string, number>();
const PRESENCE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function prunePresence() {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [token, ts] of presenceMap) {
    if (ts < cutoff) presenceMap.delete(token);
  }
}

function getOnlineCount(): number {
  prunePresence();
  return presenceMap.size;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.set("trust proxy", 1);

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          mediaSrc: ["'self'", "blob:"],
          objectSrc: ["'none'"],
          frameSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // ── Validate SESSION_SECRET ────────────────────────────────────────────────
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    console.error(
      "[startup] FATAL: SESSION_SECRET environment variable is missing or too short " +
      "(minimum 32 characters). The server cannot start without a stable session secret."
    );
    process.exit(1);
  }

  // Ensure the connect-pg-simple session table exists before any request
  // arrives. createTableIfMissing fires lazily on first store access, which
  // can race with the very first login attempt.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session (
      sid varchar NOT NULL COLLATE "default" PRIMARY KEY,
      sess json NOT NULL,
      expire timestamp(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);
  `);

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // ── Health endpoints (before auth middleware) ──────────────────────────────
  app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
    } catch (err) {
      console.error("[health/ready] DB check failed:", err);
      return res.status(503).json({ status: "not ready", error: "Database unavailable" });
    }
    const migrationsOk = await checkMigrationVersion(pool);
    if (!migrationsOk) {
      return res.status(503).json({ status: "not ready", error: "Pending migrations" });
    }
    res.status(200).json({ status: "ready" });
  });


  // ── Domain route modules ─────────────────────────────────────────────────
  // These handle auth, games/reports, invites, and saved-data endpoints.
  // Extracted from this file to keep registerRoutes manageable.
  registerAuthRoutes(app);
  registerGameRoutes(app);
  registerInviteRoutes(app);
  registerSavedRoutes(app);
  registerClassProjectRoutes(app);
  registerAiClassJobRoutes(app);
  registerStatsRoutes(app);
  registerRecruitingRoutes(app);
  registerDeparturesRoutes(app);
  registerWalkonRoutes(app);
  registerPostseasonRoutes(app);
  registerLeagueMgmtRoutes(app, (...args: Parameters<typeof simulateGame>) => simulateGame(...args));
  registerRosterRoutes(app);
  registerSimulationRoutes(app);
  registerSaveStateRoutes(app);
  registerWarRoomRoutes(app);
  registerTickerRoutes(app);
  registerCoachMessageRoutes(app);
  registerRivalryRoutes(app);
  registerNewsRoutes(app);
  registerIdentityRoutes(app);
  registerEditorRoutes(app);
  registerObjectStorageRoutes(app);

  // ── Catalog ───────────────────────────────────────────────────────────────
  // Public read — no auth required, catalog is static metadata.
  app.get("/api/catalog", async (_req, res) => {
    const conferences = CONFERENCE_CATALOG.map(c => ({
      id:   c.name,
      name: c.name,
      size: c.size,
    }));
    res.json({
      conferences,
      totalTeams: FULL_SEASON_TOTAL,
      catalogVersion: FULL_SEASON_RULES.catalogVersion,
    });
  });

  // League routes
  app.get("/api/leagues", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const userLeagues = await storage.getLeaguesByUser(userId);
      
      // Batch-fetch all teams and coaches across all leagues in 2 queries, then group in memory
      const leagueIds = userLeagues.map(l => l.id);
      const [allTeams, allCoaches] = await Promise.all([
        storage.getTeamsByLeagueIds(leagueIds),
        storage.getCoachesByLeagueIds(leagueIds),
      ]);

      const teamsByLeague = new Map<string, typeof allTeams>();
      for (const t of allTeams) {
        if (!teamsByLeague.has(t.leagueId)) teamsByLeague.set(t.leagueId, []);
        teamsByLeague.get(t.leagueId)!.push(t);
      }
      const coachesByLeague = new Map<string, typeof allCoaches>();
      for (const c of allCoaches) {
        if (!coachesByLeague.has(c.leagueId)) coachesByLeague.set(c.leagueId, []);
        coachesByLeague.get(c.leagueId)!.push(c);
      }

      const leaguesWithDetails = userLeagues.map(league => {
        const leagueTeams = teamsByLeague.get(league.id) ?? [];
        const leagueCoaches = coachesByLeague.get(league.id) ?? [];

        const { userCoach, userTeam } = resolveUserTeam(leagueCoaches, leagueTeams, userId);

        // Identify commissioner's team for display to all coaches
        const commCoach = leagueCoaches.find(c => c.userId === league.commissionerId);
        const commTeam = commCoach ? leagueTeams.find(t => t.coachId === commCoach.id) : undefined;
        const commissionerTeamAbbr = commTeam?.abbreviation ?? null;

        // Identify co-commissioner teams
        const coCommIds: string[] = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
        const coCommTeams = coCommIds.map(uid => {
          const coach = leagueCoaches.find(c => c.userId === uid);
          return coach ? leagueTeams.find(t => t.coachId === coach.id) : undefined;
        }).filter(Boolean);
        const coCommTeamAbbrs: string[] = coCommTeams.map(t => t!.abbreviation);

        return {
          ...league,
          teams: leagueTeams,
          userTeam,
          userCoach,
          commissionerTeamAbbr,
          coCommTeamAbbrs,
        };
      });

      res.json(leaguesWithDetails);
    } catch (error) {
      console.error("Failed to fetch leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.get("/api/dashboard/summaries", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const userLeagues = await storage.getLeaguesByUser(userId);
      const leagueIds = userLeagues.map(l => l.id);

      // Batch-fetch teams/coaches for all leagues in 2 queries instead of
      // looping per-league, then determine each league's user team in memory.
      const [allTeams, allCoaches] = await Promise.all([
        storage.getTeamsByLeagueIds(leagueIds),
        storage.getCoachesByLeagueIds(leagueIds),
      ]);

      const teamsByLeague = new Map<string, typeof allTeams>();
      for (const t of allTeams) {
        if (!teamsByLeague.has(t.leagueId)) teamsByLeague.set(t.leagueId, []);
        teamsByLeague.get(t.leagueId)!.push(t);
      }
      const coachesByLeague = new Map<string, typeof allCoaches>();
      for (const c of allCoaches) {
        if (!coachesByLeague.has(c.leagueId)) coachesByLeague.set(c.leagueId, []);
        coachesByLeague.get(c.leagueId)!.push(c);
      }

      const userTeamByLeague = new Map<string, typeof allTeams[number]>();
      for (const league of userLeagues) {
        const leagueTeams = teamsByLeague.get(league.id) ?? [];
        const leagueCoaches = coachesByLeague.get(league.id) ?? [];
        const { userTeam } = resolveUserTeam(leagueCoaches, leagueTeams, userId);
        if (userTeam) userTeamByLeague.set(league.id, userTeam);
      }

      const userTeamIds = Array.from(userTeamByLeague.values()).map(t => t.id);

      // Batch-fetch players for all user teams and recruits for all leagues
      // in 2 queries instead of 2 queries per league.
      const [allPlayers, allRecruits] = await Promise.all([
        storage.getPlayersByTeamIds(userTeamIds),
        storage.getRecruitsByLeagueIds(leagueIds),
      ]);

      const playersByTeam = new Map<string, typeof allPlayers>();
      for (const p of allPlayers) {
        if (!playersByTeam.has(p.teamId)) playersByTeam.set(p.teamId, []);
        playersByTeam.get(p.teamId)!.push(p);
      }
      const recruitsByLeague = new Map<string, typeof allRecruits>();
      for (const r of allRecruits) {
        if (!recruitsByLeague.has(r.leagueId)) recruitsByLeague.set(r.leagueId, []);
        recruitsByLeague.get(r.leagueId)!.push(r);
      }

      const validResults: { roster: any; recruiting: any }[] = [];
      for (const league of userLeagues) {
        const userTeam = userTeamByLeague.get(league.id);
        if (!userTeam) continue;

        const players = playersByTeam.get(userTeam.id) ?? [];
        const recruits = recruitsByLeague.get(league.id) ?? [];

        const activePlayers = players.filter(p => !p.declaredForDraft);
        const avgOvr = activePlayers.length > 0
          ? Math.round(activePlayers.reduce((s, p) => s + (p.overall || 0), 0) / activePlayers.length)
          : 0;
        const starPlayers = activePlayers.filter(p => (p.overall || 0) >= 400).length;
        const teamRecruits = recruits.filter((r: any) => r.committedTeamId === userTeam.id);

        validResults.push({
          roster: {
            leagueId: league.id,
            leagueName: league.name,
            teamId: userTeam.id,
            teamName: userTeam.name,
            mascot: userTeam.mascot,
            abbreviation: userTeam.abbreviation,
            primaryColor: userTeam.primaryColor,
            secondaryColor: userTeam.secondaryColor,
            playerCount: activePlayers.length,
            avgOvr,
            starPlayers,
          },
          recruiting: {
            leagueId: league.id,
            leagueName: league.name,
            teamId: userTeam.id,
            teamName: userTeam.name,
            abbreviation: userTeam.abbreviation,
            primaryColor: userTeam.primaryColor,
            secondaryColor: userTeam.secondaryColor,
            totalRecruits: recruits.length,
            committed: teamRecruits.length,
            phase: league.currentPhase,
          },
        });
      }

      res.json({
        rosters: validResults.map(r => r.roster),
        recruiting: validResults.map(r => r.recruiting),
      });
    } catch (error) {
      console.error("Failed to fetch dashboard summaries:", error);
      res.status(500).json({ message: "Failed to fetch summaries" });
    }
  });

  app.post("/api/leagues", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = leagueCreateSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid league data" });
      }

      const { name, maxTeams = 14, cpuDifficulty = "high_school", conferenceCount = 3, selectedConferences, seasonLength = "standard", progressionEnabled = false, isTestData, gameMode = "simulated", preset } = result.data;

      // Safety net: always flag leagues named with the E2E test-runner convention
      // as test data, even if the caller forgot to pass isTestData explicitly.
      const autoDetectedTestData = /^e2e[\s-]/i.test(name.trim());

      // Full Season preset: lock all gameplay rules to canonical values.
      const isFullSeason = preset === "full_season";
      const effectiveMaxTeams       = isFullSeason ? FULL_SEASON_TOTAL                  : maxTeams;
      const effectiveSeasonLength   = isFullSeason ? FULL_SEASON_RULES.seasonLength     : seasonLength;
      const effectiveProgression    = isFullSeason ? FULL_SEASON_RULES.progressionEnabled : progressionEnabled;
      const effectiveGameMode       = isFullSeason ? FULL_SEASON_RULES.gameMode         : gameMode;

      const league = await storage.createLeague({
        name,
        commissionerId: userId,
        maxTeams:           effectiveMaxTeams,
        cpuDifficulty,
        seasonLength:       effectiveSeasonLength,
        currentPhase:       "dynasty_setup",
        progressionEnabled: effectiveProgression,
        isTestData:         isTestData === true || autoDetectedTestData,
        gameMode:           effectiveGameMode,
        dynastyPreset:      preset ?? "custom",
        catalogVersion:     isFullSeason ? FULL_SEASON_RULES.catalogVersion : undefined,
        rulesVersion:       isFullSeason ? 1 : undefined,
        rulesSnapshot:      isFullSeason ? leagueRulesSnapshotSchema.parse(FULL_SEASON_RULES_SNAPSHOT) : undefined,
      });

      // Create conferences — use all 12 for full_season, otherwise selected or default N
      const conferenceNames = isFullSeason
        ? FULL_SEASON_CONF_NAMES
        : (selectedConferences && selectedConferences.length > 0
            ? selectedConferences.filter(c => FULL_SEASON_CONF_NAMES.includes(c))
            : FULL_SEASON_CONF_NAMES.slice(0, conferenceCount));

      for (const confName of conferenceNames) {
        await storage.createConference({ leagueId: league.id, name: confName });
      }

      // DON'T create teams yet - let users select specific teams in dynasty-setup

      await storage.createAuditLog({
        leagueId: league.id,
        userId,
        action: "League Created",
        details: `League "${name}" created — preset=${preset ?? "custom"}, maxTeams=${effectiveMaxTeams}`,
      });

      if (isFullSeason) {
        const job = await storage.createLeagueJob({
          leagueId: league.id,
          jobType: "bootstrap",
          status: "pending",
          progress: 0,
        });
        return res.status(202).json({ league, jobId: job.id });
      }

      res.json(league);
    } catch (error) {
      console.error("Failed to create league:", error);
      res.status(500).json({ message: "Failed to create league" });
    }
  });

  app.get("/api/leagues/:id/job", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const job = await storage.getLatestLeagueJob(leagueId);
      if (!job) return res.status(404).json({ message: "No job found for this league" });
      res.json(job);
    } catch (error) {
      console.error("Failed to fetch league job:", error);
      res.status(500).json({ message: "Failed to fetch league job" });
    }
  });

  // ── Schedule preview (pure, no DB writes) ────────────────────────────────
  // Commissioners can call this before publishing to verify schedule fairness
  // without committing any changes.
  app.get("/api/leagues/:id/schedule/preview", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = (req.session as any).userId as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only the commissioner can preview the schedule" });
      }
      const season = Number(req.query.season) || league.currentSeason || 1;
      const preview = await previewFullSeasonSchedule(leagueId, season);
      res.json({ leagueId, season, ...preview });
    } catch (error) {
      console.error("Failed to preview schedule:", error);
      res.status(500).json({ message: "Failed to preview schedule" });
    }
  });

  // ── Schedule publish (commissioner-only, atomic) ─────────────────────────
  // Rebuilds and atomically replaces only unlocked future regular-phase games.
  // Bumps scheduleVersion and writes an audit_log row inside the same
  // transaction.  Completed games are never removed.
  app.post("/api/leagues/:id/schedule/publish", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = (req.session as any).userId as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only the commissioner can publish the schedule" });
      }
      const season = Number(req.body?.season) || league.currentSeason || 1;
      const gamesWritten = await publishFullSeasonSchedule(leagueId, season);
      res.json({ ok: true, leagueId, season, gamesWritten });
    } catch (error: any) {
      console.error("Failed to publish schedule:", error);
      res.status(500).json({ message: error?.message ?? "Failed to publish schedule" });
    }
  });

  app.get("/api/leagues/:id", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const cacheKey = leagueCacheKey(leagueId, "main");
      const cached = cacheGet(cacheKey);
      res.set("Cache-Control", "private, max-age=30, must-revalidate");
      if (cached) {
        return res.json(cached);
      }

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const leagueConferences = await storage.getConferencesByLeague(league.id);
      const leagueStandings = await storage.getStandingsByLeague(league.id, league.currentSeason);
      const coaches = await storage.getCoachesByLeague(league.id);

      const teamsWithStandingsAndCoach = await Promise.all(leagueTeams.map(async (team) => {
        const coach = coaches.find(c => c.teamId === team.id);
        let user = null;
        if (coach?.userId) {
          const userData = await storage.getUser(coach.userId);
          user = userData ? { email: userData.email } : null;
        }
        return {
          ...team,
          standings: leagueStandings.find((s) => s.teamId === team.id),
          coach: coach ? {
            id: coach.id,
            firstName: coach.firstName,
            lastName: coach.lastName,
            userId: coach.userId,
            archetype: coach.archetype,
          } : null,
          user,
        };
      }));

      const payload = {
        ...league,
        teams: teamsWithStandingsAndCoach,
        conferences: leagueConferences,
      };
      cacheSet(cacheKey, payload, 45_000);
      res.json(payload);
    } catch (error) {
      console.error("Failed to fetch league:", error);
      res.status(500).json({ message: "Failed to fetch league" });
    }
  });

  app.get("/api/leagues/:id/dashboard-overview", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach?.teamId) {
        return res.status(404).json({ message: "No team found" });
      }

      const team = await storage.getTeam(userCoach.teamId);
      const roster = await storage.getPlayersByTeam(userCoach.teamId);

      const eligibility: Record<string, number> = {};
      const positionCounts: Record<string, number> = {};
      const positions = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "P", "DH"];

      for (const p of roster) {
        eligibility[p.eligibility] = (eligibility[p.eligibility] || 0) + 1;
        positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
      }

      const positionsAtRisk = positions.filter(pos => (positionCounts[pos] || 0) === 1);

      const recruits = await storage.getRecruitsByLeague(leagueId);
      const mySignedRecruits = recruits.filter(r => r.signedTeamId === userCoach.teamId);

      const myInterests = await storage.getRecruitingInterestsByTeam(userCoach.teamId);

      const PITCHER_POS_SET = new Set(["P", "SP", "RP", "CP", "CL", "LHP", "RHP"]);
      let totalOverall = 0;
      let hitterTotal = 0, hitterCount = 0;
      let pitcherTotal = 0, pitcherCount = 0;
      const starDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };

      for (const p of roster) {
        const ovr = p.overall || 0;
        totalOverall += ovr;
        const stars = getStarRatingFromOVR(ovr);
        starDist[String(stars)] = (starDist[String(stars)] || 0) + 1;
        if (PITCHER_POS_SET.has(p.position)) {
          pitcherTotal += ovr; pitcherCount++;
        } else {
          hitterTotal += ovr; hitterCount++;
        }
      }

      const dashHitters = roster.filter(p => !PITCHER_POS_SET.has(p.position));
      const dashPitchers = roster.filter(p => PITCHER_POS_SET.has(p.position));
      const dashAttrAvg = (nums: number[]) =>
        nums.length === 0 ? 0 : Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);

      const dashHittingScore = dashAttrAvg(dashHitters.flatMap(p => [p.hitForAvg ?? 50, p.power ?? 50]));
      const dashFieldingScore = dashAttrAvg(dashHitters.flatMap(p => [p.fielding ?? 50, p.errorResistance ?? 50, p.throwing ?? 50]));
      const dashSpeedScore = dashAttrAvg(roster.map(p => p.running ?? 50));
      const dashPitchingScore = pitcherCount > 0 ? Math.round(pitcherTotal / pitcherCount) : 0;

      // Compute relative grades against all real-roster teams (same percentile system as national rank)
      const allHitScores: number[] = [], allFieldScores: number[] = [],
            allSpdScores: number[] = [], allPitchScores: number[] = [];
      const rawAvg = (nums: number[]) => nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
      const { ALL_REAL_ROSTERS } = await getRealRosters();
      for (const rp of Object.values(ALL_REAL_ROSTERS)) {
        const rHitters = rp.filter(p => p.position !== "P");
        const rPitchers = rp.filter(p => p.position === "P");
        allHitScores.push(rawAvg(rHitters.flatMap(p => [p.hitForAvg ?? 50, p.power ?? 50])));
        allFieldScores.push(rawAvg(rHitters.flatMap(p => [p.fielding ?? 50, p.errorResistance ?? 50, p.throwing ?? 50])));
        allSpdScores.push(rawAvg(rp.map(p => p.running ?? 50)));
        allPitchScores.push(rawAvg(rPitchers.map(p => calculateOVR(p as Parameters<typeof calculateOVR>[0]))));
      }
      const sd = (arr: number[]) => [...arr].sort((a, b) => b - a);
      function dashRelGrade(score: number, sorted: number[]): string {
        const n = sorted.length;
        if (n === 0) return "C";
        let rank = 0;
        while (rank < n - 1 && sorted[rank] > score) rank++;
        const pct = n === 1 ? 0 : rank / (n - 1);
        const s = pct <= 0.04 ? 12 : pct <= 0.12 ? 11 : pct <= 0.20 ? 10 :
                  pct <= 0.28 ? 9  : pct <= 0.36 ? 8  : pct <= 0.44 ? 7  :
                  pct <= 0.52 ? 6  : pct <= 0.60 ? 5  : pct <= 0.68 ? 4  :
                  pct <= 0.76 ? 3  : pct <= 0.84 ? 2  : pct <= 0.92 ? 1  : 0;
        return s >= 12 ? "A+" : s >= 11 ? "A" : s >= 10 ? "A-" :
               s >= 9  ? "B+" : s >= 8  ? "B" : s >= 7  ? "B-" :
               s >= 6  ? "C+" : s >= 5  ? "C" : s >= 4  ? "C-" :
               s >= 3  ? "D+" : s >= 2  ? "D" : s >= 1  ? "D-" : "F";
      }
      const hitGrade   = dashRelGrade(dashHittingScore,  sd(allHitScores));
      const fieldGrade = dashRelGrade(dashFieldingScore, sd(allFieldScores));
      const speedGrade = dashRelGrade(dashSpeedScore,    sd(allSpdScores));
      const pitchGrade = dashRelGrade(dashPitchingScore, sd(allPitchScores));

      const top5Players = [...roster]
        .sort((a, b) => (b.overall || 0) - (a.overall || 0))
        .slice(0, 5)
        .map(p => ({
          name: `${p.firstName} ${p.lastName}`,
          position: p.position,
          overall: p.overall || 0,
          starRating: getStarRatingFromOVR(p.overall || 0),
        }));

      res.json({
        rosterSize: roster.length,
        eligibility,
        positionCounts,
        positionsAtRisk,
        nilBudget: team?.nilBudget || 0,
        nilSpent: team?.nilSpent || 0,
        prestige: team?.prestige || 0,
        recruitingSigned: mySignedRecruits.length,
        recruitingInterested: myInterests.length,
        averageOverall: roster.length > 0 ? Math.round(totalOverall / roster.length) : 0,
        topPlayer: top5Players.length > 0 ? { name: top5Players[0].name, position: top5Players[0].position, overall: top5Players[0].overall } : null,
        hitterAvg: hitterCount > 0 ? Math.round(hitterTotal / hitterCount) : 0,
        pitcherAvg: pitcherCount > 0 ? Math.round(pitcherTotal / pitcherCount) : 0,
        starDist,
        top5Players,
        hittingScore: dashHittingScore,
        fieldingScore: dashFieldingScore,
        speedScore: dashSpeedScore,
        pitchingScore: dashPitchingScore,
        hitGrade,
        fieldGrade,
        speedGrade,
        pitchGrade,
      });
    } catch (error) {
      console.error("Failed to fetch dashboard overview:", error);
      res.status(500).json({ message: "Failed to fetch dashboard overview" });
    }
  });

  // Static scouting data for all team templates — no auth required, purely derived from hardcoded rosters
  app.get("/api/team-templates/scouting", async (_req, res) => {
    try {
      const ALL_CONF_NAMES = FULL_SEASON_CONF_NAMES;

      // Composite recruit grade: 40% normalized geographic talent pool + 60% program attributes
      // (prestige, facilities, academics, stadium, collegeLife all on 1-9 scale). Normal
      // distribution across all 149 programs. z-bands: A+ ≥2.0σ, A ≥1.5σ, A- ≥1.0σ,
      // B+ ≥0.5σ, B ≥0σ, B- ≥-0.5σ, C+ ≥-1.0σ, C ≥-1.5σ, C- ≥-2.0σ, D+ below.
      const RECRUIT_GRADE_LOOKUP: Record<string, string> = {
        "Texas":"A+","Florida":"A+","Stanford":"A+",
        "UCLA":"A","Miami":"A","Arkansas":"A","USC":"A","Mississippi State":"A","Vanderbilt":"A",
        "Ole Miss":"A","Cal State Fullerton":"A","Florida State":"A","Texas A&M":"A","TCU":"A",
        "UC Santa Barbara":"A-","UC Irvine":"A-","Alabama":"A-","Pepperdine":"A-","Cal Poly":"A-",
        "Rice":"A-","Long Beach State":"A-","LSU":"A-","Georgia":"A-","California":"A-",
        "Fresno State":"A-","San Diego State":"A-",
        "North Carolina":"B+","Tennessee":"B+","South Carolina":"B+","South Florida":"B+",
        "Florida A&M":"B+","Dallas Baptist":"B+","Southern Miss":"B+","Loyola Marymount":"B+",
        "San Diego":"B+","Santa Clara":"B+","UC San Diego":"B+","Auburn":"B+","Oregon State":"B+",
        "Texas Tech":"B+","East Carolina":"B+","Virginia":"B+","Saint Mary's":"B+","Clemson":"B+",
        "San Francisco":"B+","UC Davis":"B+","Coastal Carolina":"B+","UCF":"B+",
        "Florida Atlantic":"B+","Baylor":"B+","Jackson State":"B+","Wake Forest":"B+",
        "Bethune-Cookman":"B","Georgia Tech":"B","Duke":"B","NC State":"B","Kentucky":"B",
        "Houston":"B","Virginia Tech":"B","Oklahoma State":"B","Cal State Northridge":"B",
        "Tulane":"B","North Texas":"B","Arkansas State":"B","West Virginia":"B",
        "Louisville":"B","Georgia State":"B",
        "Belmont":"B-","James Madison":"B-","Oregon":"B-","Oklahoma":"B-","Texas Southern":"B-",
        "Charlotte":"B-","App State":"B-","North Carolina A&T":"B-","Memphis":"B-",
        "Old Dominion":"B-","Washington":"B-","Louisiana":"B-","Ohio State":"B-",
        "Arizona State":"B-","Michigan":"B-","Georgia Southern":"B-","Gonzaga":"B-",
        "Cal State Bakersfield":"B-","South Alabama":"B-","Marshall":"B-","UNLV":"B-",
        "Prairie View A&M":"B-","Alcorn State":"B-","North Carolina Central":"B-",
        "Norfolk State":"B-","UAB":"B-","Notre Dame":"B-","Indiana":"B-",
        "Arizona":"C+","Wichita State":"C+","Penn State":"C+","Troy":"C+","Maryland":"C+",
        "Murray State":"C+","Creighton":"C+","Penn":"C+","Washington State":"C+",
        "Southern University":"C+","Alabama State":"C+","Minnesota":"C+","Hawaii":"C+",
        "Howard":"C+","Grambling State":"C+","Illinois":"C+","Southern Illinois":"C+",
        "Nevada":"C+","Missouri":"C+","Missouri State":"C+","Northwestern":"C+",
        "Portland":"C+","Columbia":"C+","Harvard":"C+","Yale":"C+",
        "UIC":"C","Cincinnati":"C","Iowa":"C","Michigan State":"C","Nebraska":"C","Purdue":"C",
        "Princeton":"C","Illinois State":"C","Boston College":"C","Utah":"C","Brown":"C",
        "Rutgers":"C","BYU":"C","Kansas":"C","New Mexico":"C","Air Force":"C","Cornell":"C",
        "Dartmouth":"C","Indiana State":"C","Northern Iowa":"C","Bradley":"C","Evansville":"C",
        "Pittsburgh":"C",
        "Kansas State":"C-","Valparaiso":"C-","Delaware State":"C-",
        "Western Illinois":"D+","Coppin State":"D+","Maryland Eastern Shore":"D+",
      };

      function recruitAdv(teamName: string) {
        const letter = RECRUIT_GRADE_LOOKUP[teamName] ?? "C";
        const score = letter === "A+" ? 10 : letter === "A" ? 9 : letter === "A-" ? 8 :
                      letter === "B+" ? 7 : letter === "B" ? 6 : letter === "B-" ? 5 :
                      letter === "C+" ? 4 : letter === "C" ? 3 : letter === "C-" ? 2 : 1;
        const label = score >= 10 ? "Elite" : score >= 8 ? "Very High" : score >= 5 ? "High" :
                      score >= 3 ? "Average" : "Low";
        return { grade: letter, label, score };
      }

      // Relative grader: called after all team scores are collected so grades
      // are distributed across the full population (best team = A+, worst = F).
      function relativeGrade(score: number, sortedDesc: number[]): { letter: string; score: number } {
        const n = sortedDesc.length;
        if (n === 0) return { letter: "C", score: 5 };
        // Find percentile rank: 0.0 = best, 1.0 = worst
        let rank = 0;
        while (rank < n - 1 && sortedDesc[rank] > score) rank++;
        const pct = n === 1 ? 0 : rank / (n - 1);
        // 13-band distribution spread evenly across population
        const s = pct <= 0.04 ? 12 : pct <= 0.12 ? 11 : pct <= 0.20 ? 10 :
                  pct <= 0.28 ? 9  : pct <= 0.36 ? 8  : pct <= 0.44 ? 7  :
                  pct <= 0.52 ? 6  : pct <= 0.60 ? 5  : pct <= 0.68 ? 4  :
                  pct <= 0.76 ? 3  : pct <= 0.84 ? 2  : pct <= 0.92 ? 1  : 0;
        const l = s >= 12 ? "A+" : s >= 11 ? "A" : s >= 10 ? "A-" :
                  s >= 9  ? "B+" : s >= 8  ? "B" : s >= 7  ? "B-" :
                  s >= 6  ? "C+" : s >= 5  ? "C" : s >= 4  ? "C-" :
                  s >= 3  ? "D+" : s >= 2  ? "D" : s >= 1  ? "D-" : "F";
        return { letter: l, score: s };
      }

      function mean(arr: number[]) {
        return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
      }

      // Build conference → team name list and template metadata map
      const confMap = new Map<string, string[]>();
      const tmplMap = new Map<string, { city: string; state: string; nilBudget: number; prestige: number; facilities: number; academics: number; stadium: number; collegeLife: number; conference: string; nationalRank: number }>();
      for (const cn of ALL_CONF_NAMES) {
        const ts = getTeamsForConference(cn);
        confMap.set(cn, ts.map(t => t.name));
        for (const t of ts) tmplMap.set(t.name, { city: t.city, state: t.state, nilBudget: t.nilBudget, prestige: t.prestige, facilities: t.facilities, academics: t.academics, stadium: t.stadium, collegeLife: t.collegeLife, conference: cn, nationalRank: NATIONAL_RANKS[t.name] ?? TOTAL_NATIONAL_TEAMS });
      }

      type PlayerInfo = { name: string; position: string; eligibility: string; overall: number; starRating: number };
      const statsList: Array<{
        teamName: string; rosterScore: number;
        pitchingScore: number; hittingScore: number; fieldingScore: number; speedScore: number;
        topFielder: PlayerInfo | null; topPitcher: PlayerInfo | null; topUnderclassman: PlayerInfo | null;
      }> = [];

      const { ALL_REAL_ROSTERS: ALL_ROSTERS_FOR_STATS } = await getRealRosters();
      for (const [teamName, roster] of Object.entries(ALL_ROSTERS_FOR_STATS)) {
        const pitchers = roster.filter(p => p.position === "P");
        const hitters = roster.filter(p => p.position !== "P");

        const withOvr = roster.map(p => {
          const ovr = calculateOVR(p as Parameters<typeof calculateOVR>[0]);
          return { ...p, computedOvr: ovr, star: getStarRatingFromOVR(ovr) };
        });

        const rosterScore = mean(withOvr.map(p => p.computedOvr));
        const pitchingScore = mean(pitchers.map(p => calculateOVR(p as Parameters<typeof calculateOVR>[0])));
        const hittingScore = mean(hitters.flatMap(p => [p.hitForAvg ?? 50, p.power ?? 50]));
        const fieldingScore = mean(hitters.flatMap(p => [p.fielding ?? 50, p.arm ?? 50, p.errorResistance ?? 50]));
        const speedScore = mean(hitters.flatMap(p => [p.speed ?? 50, p.stealing ?? 50]));

        const sorted = (arr: typeof withOvr) => [...arr].sort((a, b) => b.computedOvr - a.computedOvr);
        const mkInfo = (p: (typeof withOvr)[0] | undefined): PlayerInfo | null =>
          p ? { name: `${p.firstName} ${p.lastName}`, position: p.position, eligibility: (p as any).eligibility ?? "FR", overall: p.computedOvr, starRating: p.star } : null;

        const bestHitter = sorted(withOvr.filter(p => p.position !== "P"))[0];
        const bestPitcher = sorted(withOvr.filter(p => p.position === "P"))[0];
        const bestFrosh = sorted(withOvr.filter(p => (p as any).eligibility === "FR" || (p as any).eligibility === "SO"))[0];

        statsList.push({ teamName, rosterScore, pitchingScore, hittingScore, fieldingScore, speedScore, topFielder: mkInfo(bestHitter), topPitcher: mkInfo(bestPitcher), topUnderclassman: mkInfo(bestFrosh) });
      }

      statsList.sort((a, b) => b.rosterScore - a.rosterScore);
      const totalTeams = statsList.length;

      // Build sorted-descending score arrays for relative grading across all teams
      const allPitching = [...statsList.map(t => t.pitchingScore)].sort((a, b) => b - a);
      const allHitting  = [...statsList.map(t => t.hittingScore)].sort((a, b) => b - a);
      const allFielding = [...statsList.map(t => t.fieldingScore)].sort((a, b) => b - a);
      const allSpeed    = [...statsList.map(t => t.speedScore)].sort((a, b) => b - a);

      // Pre-sort conference rankings (statsList already sorted so filter preserves order)
      const confRankings = new Map<string, string[]>();
      for (const [cn, names] of confMap.entries()) {
        confRankings.set(cn, statsList.filter(t => names.includes(t.teamName)).map(t => t.teamName));
      }

      const result: Record<string, object> = {};
      statsList.forEach((t, i) => {
        const tmpl = tmplMap.get(t.teamName);
        const cn = tmpl?.conference ?? "";
        const cr = confRankings.get(cn) ?? [];
        result[t.teamName] = {
          talentRank: i + 1,
          totalTeams,
          nationalRank: tmpl?.nationalRank ?? NATIONAL_RANKS[t.teamName] ?? (i + 1),
          pitchingGrade: relativeGrade(t.pitchingScore, allPitching),
          hittingGrade:  relativeGrade(t.hittingScore,  allHitting),
          fieldingGrade: relativeGrade(t.fieldingScore, allFielding),
          speedGrade:    relativeGrade(t.speedScore,    allSpeed),
          topFielder: t.topFielder,
          topPitcher: t.topPitcher,
          topUnderclassman: t.topUnderclassman,
          recruitingAdvantage: recruitAdv(t.teamName),
          projectedConferenceFinish: { rank: (cr.indexOf(t.teamName) + 1) || 1, total: cr.length || 1 },
          nilBudget: tmpl?.nilBudget ?? 2000000,
          city: tmpl?.city ?? "",
          state: tmpl?.state ?? "",
          conference: cn,
          prestige: tmpl?.prestige ?? 5,
          facilities: tmpl?.facilities ?? 5,
          academics: tmpl?.academics ?? 5,
          stadium: tmpl?.stadium ?? 5,
          collegeLife: tmpl?.collegeLife ?? 5,
        };
      });

      res.json(result);
    } catch (err) {
      console.error("Scouting endpoint error:", err);
      res.status(500).json({ message: "Failed to compute scouting data" });
    }
  });

  // Team selection - get available team templates for selecting which teams to include
  app.get("/api/leagues/:id/team-selection", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const existingTeams = await storage.getTeamsByLeague(league.id);
      if (existingTeams.length > 0) {
        return res.json({ league, conferences: [], conferenceTeamPools: [], teamsAlreadySelected: true });
      }

      const conferences = await storage.getConferencesByLeague(league.id);
      
      // Sort conferences by their catalog rank so SEC (index 0) always gets
      // the largest target slot in uneven splits (e.g. 6-4-4 for 14 teams).
      const catalogOrder = FULL_SEASON_CONF_NAMES;
      const sortedConferences = [...conferences].sort((a, b) => {
        const ai = catalogOrder.indexOf(a.name);
        const bi = catalogOrder.indexOf(b.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

      const conferenceTeamPools = sortedConferences.map(conf => ({
        conference: conf,
        teams: getTeamsForConference(conf.name),
      }));

      res.json({
        league,
        conferences: sortedConferences,
        conferenceTeamPools,
        teamsAlreadySelected: false,
      });
    } catch (error) {
      console.error("Failed to fetch dynasty setup data:", error);
      res.status(500).json({ message: "Failed to fetch dynasty setup data" });
    }
  });

  // Team selection - create selected teams
  app.post("/api/leagues/:id/team-selection", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Only the commissioner can set up the dynasty" });
      }

      const existingTeams = await storage.getTeamsByLeague(league.id);
      if (existingTeams.length > 0) {
        return res.status(400).json({ message: "Teams have already been selected for this league" });
      }

      const { selectedTeams } = req.body as { selectedTeams: { conferenceId: string; teamNames: string[] }[] };
      
      if (!selectedTeams || !Array.isArray(selectedTeams)) {
        return res.status(400).json({ message: "Invalid selected teams data" });
      }

      // Fetch actual league conferences first — needed for exact distribution validation
      const conferences = await storage.getConferencesByLeague(league.id);
      const actualConfCount = conferences.length;

      let totalTeamsCreated = 0;

      const allTeamPools = FULL_SEASON_CONF_NAMES.flatMap(name => getTeamsForConference(name));

      // Full Season preset: ignore incoming payload — auto-create ALL teams from the canonical catalog.
      if (league.dynastyPreset === "full_season") {
        for (const conf of conferences) {
          const confTeams = getTeamsForConference(conf.name);
          for (const teamData of confTeams) {
            const team = await storage.createTeam({
              ...teamData,
              leagueId: league.id,
              conferenceId: conf.id,
              isCpu: true,
              nationalRank: NATIONAL_RANKS[teamData.name] ?? TOTAL_NATIONAL_TEAMS,
            });
            await storage.createStandings({ leagueId: league.id, teamId: team.id, season: 1 });
            totalTeamsCreated++;
          }
        }
      } else {
        // Custom mode: validate the incoming selectedTeams payload with equal-split rules.
        const totalRequestedTeams = selectedTeams.reduce((sum, s) => sum + (s.teamNames?.length ?? 0), 0);
        if (totalRequestedTeams !== league.maxTeams) {
          return res.status(400).json({ message: `Must select exactly ${league.maxTeams} teams (got ${totalRequestedTeams})` });
        }

        const payloadConfIds = new Set(selectedTeams.map(s => s.conferenceId));
        for (const conf of conferences) {
          if (!payloadConfIds.has(conf.id)) {
            return res.status(400).json({ message: `Conference "${conf.name}" is missing from team selection` });
          }
        }

        // Use canonical conference sizes when available; fall back to equal-split for custom configurations.
        const confTargets = (() => {
          // If all conferences in this league are canonical (known sizes), use those directly —
          // but only when the canonical totals actually match the league size. A small dynasty
          // that happens to use real conference names (e.g. 14 teams across SEC/Big Ten/ACC)
          // should fall through to the equal-split logic instead of enforcing full-size counts.
          const allCanonical = conferences.every(c => CONF_SIZE_MAP.has(c.name));
          const canonicalTotal = allCanonical
            ? conferences.reduce((s, c) => s + CONF_SIZE_MAP.get(c.name)!, 0)
            : 0;
          if (allCanonical && canonicalTotal === league.maxTeams) {
            return conferences.map(c => CONF_SIZE_MAP.get(c.name)!);
          }
          // Special case: 14-team / 3-conf → 6+4+4 (legacy default)
          if (league.maxTeams === 14 && actualConfCount === 3) return [6, 4, 4];
          const base = Math.floor(league.maxTeams / actualConfCount);
          const extras = league.maxTeams % actualConfCount;
          return conferences.map((_, i) => base + (i < extras ? 1 : 0));
        })();

        const confTargetMap = new Map(conferences.map((c, i) => [c.id, confTargets[i]]));
        for (const sel of selectedTeams) {
          const target = confTargetMap.get(sel.conferenceId);
          if (target === undefined) {
            return res.status(400).json({ message: `Unknown conference in selection` });
          }
          const count = sel.teamNames?.length ?? 0;
          if (count !== target) {
            const conf = conferences.find(c => c.id === sel.conferenceId);
            return res.status(400).json({ message: `Conference "${conf?.name}" requires exactly ${target} teams (got ${count})` });
          }
        }

        for (const selection of selectedTeams) {
          const conf = conferences.find(c => c.id === selection.conferenceId);
          if (!conf) continue;
          for (const teamName of selection.teamNames) {
            const teamData = allTeamPools.find(t => t.name === teamName);
            if (!teamData) continue;
            const team = await storage.createTeam({
              ...teamData,
              leagueId: league.id,
              conferenceId: conf.id,
              isCpu: true,
              nationalRank: NATIONAL_RANKS[teamData.name] ?? TOTAL_NATIONAL_TEAMS,
            });
            await storage.createStandings({ leagueId: league.id, teamId: team.id, season: 1 });
            totalTeamsCreated++;
          }
        }
      }

      // Generate recruits now that teams exist — scale class size to team count
      const initClassVintage = await generateRecruits(league.id, getRecruitPoolSize(totalTeamsCreated, league.dynastyPreset ?? undefined));
      if (initClassVintage) {
        await storage.updateLeague(league.id, { currentClassVintage: initClassVintage });
      }

      await storage.createAuditLog({
        leagueId: league.id,
        userId,
        action: "Teams Selected",
        details: `${totalTeamsCreated} teams added to the dynasty`,
      });

      res.json({ success: true, teamsCreated: totalTeamsCreated });
    } catch (error) {
      console.error("Dynasty setup failed:", error);
      res.status(500).json({ message: "Dynasty setup failed" });
    }
  });

  app.get("/api/leagues/:id/setup", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const conferences = await storage.getConferencesByLeague(league.id);
      const coaches = await storage.getCoachesByLeague(league.id);
      
      // Add coach info to teams for Human/CPU display
      const teamsWithCoachInfo = leagueTeams.map(team => {
        const coach = coaches.find(c => c.teamId === team.id);
        return {
          ...team,
          coach: coach ? {
            id: coach.id,
            firstName: coach.firstName,
            lastName: coach.lastName,
            userId: coach.userId,
          } : null,
        };
      });
      
      res.json({ 
        teams: teamsWithCoachInfo,
        conferences,
        league,
      });
    } catch (error) {
      console.error("Failed to fetch setup data:", error);
      res.status(500).json({ message: "Failed to fetch setup data" });
    }
  });

  app.post("/api/leagues/:id/setup", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = setupSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid setup data" });
      }
      
      const { teamId, coach: coachData } = result.data;

      const coach = await storage.createCoach({
        userId,
        teamId,
        leagueId: (req.params.id as string),
        firstName: coachData.firstName,
        lastName: coachData.lastName,
        archetype: coachData.archetype || "Balanced",
        skinTone: coachData.skinTone || "light",
        hairColor: coachData.hairColor || "brown",
        hairStyle: coachData.hairStyle || "short",
      });

      // Initialize personality/traits/philosophy at creation time
      try { await ensureCoachTraits(coach, 1); } catch (traitErr) {
        console.error("[createCoach] ensureCoachTraits failed:", traitErr);
      }

      await storage.updateTeam(teamId, { coachId: coach.id, isCpu: false });

      const leagueForGen = await storage.getLeague((req.params.id as string));
      const progressionOn = leagueForGen?.progressionEnabled ?? false;

      const leagueTeams = await storage.getTeamsByLeague((req.params.id as string));
      const leagueConfs = await storage.getConferencesByLeague((req.params.id as string));
      const confNameById: Record<string, string> = {};
      for (const c of leagueConfs) confNameById[c.id] = c.name;
      for (const team of leagueTeams) {
        const existingPlayers = await storage.getPlayersByTeam(team.id);
        if (existingPlayers.length === 0) {
          const confName = team.conferenceId ? confNameById[team.conferenceId] : undefined;
          await generatePlayersForTeam(team.id, progressionOn, team.name, confName);
          // #9 — validate immediately so bad CPU rosters are caught at dynasty creation time
          const genPlayers = await storage.getPlayersByTeam(team.id);
          const setupViolations = checkTeamRosterStructure(team.name, genPlayers);
          if (setupViolations.length > 0) {
            console.error(`[roster-validation:dynasty-setup] ${setupViolations.length} violation(s) for "${team.name}":`);
            for (const v of setupViolations) console.error(`  [${v.teamName}]: ${v.message}`);
          }
        }
      }

      for (const team of leagueTeams) {
        if (!team.isCpu) continue; // never overwrite a human coach's lineup
        const teamPlayers = await storage.getPlayersByTeam(team.id);
        await autoAssignLineup(storage, teamPlayers, team.id);
      }

      // Generate initial schedule (only if not already present — startDynasty may have run first)
      const existingGamesForCoach = await storage.getGamesByLeague((req.params.id as string));
      if (existingGamesForCoach.length === 0) {
        await createScheduleForSeason((req.params.id as string), 1);
        if (leagueForGen?.dynastyPreset !== "full_season") {
          await generateExhibitionGames((req.params.id as string), 1);
        }
      }

      await storage.createAuditLog({
        leagueId: (req.params.id as string),
        userId,
        action: "Coach Created",
        details: `${coachData.firstName} ${coachData.lastName} joined as coach`,
      });

      res.json({ coach });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : '';
      console.error("Setup failed:", errMsg, errStack);
      res.status(500).json({ message: "Setup failed", detail: errMsg });
    }
  });


  registerStorylineRoutes(app);

  return httpServer;
}
