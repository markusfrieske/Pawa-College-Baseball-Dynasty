import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerStorylineRoutes, initializeStorylineRecruits, generateAndResolveStorylineEvents, resolveAllPendingStorylineEvents } from "./storyline-routes";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getRandomAbilities, getAbilitiesForPosition, calculateOVR, getStarRatingFromOVR, enforceGoldOvrGate } from "@shared/abilities";
import { getPotentialRange, getProgressionZone, rollWeightedPotential, getPotentialGrade } from "@shared/potential";
import { getActionPointCost } from "@shared/stateDistance";
import { getPersonalityForArchetype, getTraitBadgesForArchetype, getPhilosophyForArchetype, evaluateMilestones } from "@shared/coachTraits";
import { CONFERENCE_TIER_NIL, DEFAULT_CONFERENCE_NIL } from "@shared/nilConfig";
import type { Player, Recruit, TransferPortalInterest, Game, InsertPlayerSeasonStats, GameReport } from "@shared/schema";
import { assignTrajectory } from "@shared/trajectory";
import { getRecruitPoolSize } from "./utils";
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
import { SEC_REAL_ROSTERS, ALL_REAL_ROSTERS } from "./realRosters";
import { NATIONAL_RANKS, TOTAL_NATIONAL_TEAMS } from "./rosterScaleFactors";
import { generateRecruitClass, selectTools, genToolAttr, sampleNormalSpeed, sampleNormalVelocity, HITTER_TOOL_GROUPS, PITCHER_TOOL_GROUPS } from "./recruit-generator";
import { normalizeCommonAbilities } from "./normalizeCommonAbilities";
import { validateLeagueRosters, checkTeamRosterStructure } from "./rosterValidation";
import { sendWeeklyDigests, verifyUnsubToken } from "./digestEmail";
import { pool } from "./db";
import { calibrateRpiOvr } from "./calibrateRpiOvr";
import { assignPitcherArchetype, generateArchetypePitchMix, qualityTierFromOvr, noPitches } from "./pitchMixHelpers";

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
  maxTeams: z.number().min(6).max(64).optional(),
  cpuDifficulty: z.enum(["beginner", "high_school", "all_american", "elite"]).optional(),
  conferenceCount: z.number().min(2).max(4).optional(),
  selectedConferences: z.array(z.string()).min(1).max(4).optional(),
  seasonLength: z.enum(["short", "medium", "long"]).optional(),
  progressionEnabled: z.boolean().optional(),
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
  const PITCHER_POSITIONS = ["P", "SP", "RP", "CL", "LHP", "RHP"];
  const OF_POSITIONS = ["LF", "CF", "RF"];
  const positionPlayers = teamPlayers.filter(p => !PITCHER_POSITIONS.includes(p.position));
  const pitchers = teamPlayers.filter(p => PITCHER_POSITIONS.includes(p.position));

  // ── STEP 1: pick one starter per defensive position ──────────────────────
  // For outfield slots, include both specific (LF/CF/RF) AND generic (OF) players.
  // Preferred OF assignment order: CF first (best), then LF, then RF.
  const positionSlots = ["C", "1B", "2B", "SS", "3B", "CF", "LF", "RF"];
  const starters: Player[] = [];
  const starterLineupPositions = new Map<string, string>(); // playerId → defensive position
  const usedIds = new Set<string>();

  for (const pos of positionSlots) {
    let candidates: Player[];
    if (OF_POSITIONS.includes(pos)) {
      candidates = positionPlayers
        .filter(p => (p.position === pos || p.position === "OF") && !usedIds.has(p.id))
        .sort((a, b) => (b.overall || 0) - (a.overall || 0));
    } else {
      candidates = positionPlayers
        .filter(p => p.position === pos && !usedIds.has(p.id))
        .sort((a, b) => (b.overall || 0) - (a.overall || 0));
    }
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
    const picked = remaining.shift()!;
    return picked;
  };

  const slotAssignments: Player[] = [];

  // Slot 1 — Leadoff: best OPS proxy (hitForAvg + power, balanced)
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) + (p.power || 0)));

  // Slot 2 — Contact: highest hitForAvg
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0)));

  // Slot 3 — Power: highest power
  slotAssignments.push(pickBest(p => (p.power || 0)));

  // Slot 4 — Cleanup/Slugging: highest power + clutch
  slotAssignments.push(pickBest(p => (p.power || 0) + (p.clutch || 0)));

  // Slot 5 — Balanced
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) * 0.35 + (p.power || 0) * 0.35 + (p.speed || 0) * 0.15 + (p.clutch || 0) * 0.15));

  // Slot 6 — Balanced (same composite)
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) * 0.35 + (p.power || 0) * 0.35 + (p.speed || 0) * 0.15 + (p.clutch || 0) * 0.15));

  // Slot 7 — Contact
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0)));

  // Slot 8 — Speed
  slotAssignments.push(pickBest(p => (p.speed || 0)));

  // Slot 9 — Second leadoff: hitForAvg + speed
  slotAssignments.push(pickBest(p => (p.hitForAvg || 0) + (p.speed || 0)));

  // Collect batting order / lineup position updates for batch write
  const hitterUpdates = positionPlayers.map(p => {
    const slot = slotAssignments.indexOf(p);
    const lineupPos = starterLineupPositions.get(p.id) ?? null;
    return slot !== -1
      ? { id: p.id, data: { battingOrder: slot + 1, lineupPosition: lineupPos } }
      : { id: p.id, data: { battingOrder: null, lineupPosition: null } };
  });

  // ── STEP 3: assign pitching roles ─────────────────────────────────────────
  // Sort by overall as a baseline, then deviate for specialist roles.
  const pitcherPool = [...pitchers].sort((a, b) => (b.overall || 0) - (a.overall || 0));
  const pitcherRemaining = [...pitcherPool];
  const assignedPitcherIds = new Set<string>();

  const pickPitcher = (scoreFn: (p: Player) => number): Player | null => {
    const pool = pitcherRemaining.filter(p => !assignedPitcherIds.has(p.id));
    if (pool.length === 0) return null;
    pool.sort((a, b) => scoreFn(b) - scoreFn(a));
    const picked = pool[0];
    assignedPitcherIds.add(picked.id);
    return picked;
  };

  const roleMap = new Map<string, string>();

  // FRI — best overall starter
  const fri = pickPitcher(p => (p.overall || 0));
  if (fri) roleMap.set(fri.id, "FRI");

  // SAT — second best overall
  const sat = pickPitcher(p => (p.overall || 0));
  if (sat) roleMap.set(sat.id, "SAT");

  // SUN — third best overall
  const sun = pickPitcher(p => (p.overall || 0));
  if (sun) roleMap.set(sun.id, "SUN");

  // MID — young future star: FR/SO with best potential; fallback to best potential overall
  const eligibilityOrder: Record<string, number> = { FR: 0, SO: 1, JR: 2, SR: 3 };
  const youngPool = pitcherRemaining.filter(p => !assignedPitcherIds.has(p.id) && (p.eligibility === "FR" || p.eligibility === "SO"));
  const midPool = youngPool.length > 0
    ? youngPool
    : pitcherRemaining.filter(p => !assignedPitcherIds.has(p.id));
  const mid = midPool.length > 0
    ? midPool.sort((a, b) => {
        const potDiff = (b.potential || 0) - (a.potential || 0);
        if (potDiff !== 0) return potDiff;
        return (eligibilityOrder[a.eligibility || "SR"] ?? 3) - (eligibilityOrder[b.eligibility || "SR"] ?? 3);
      })[0]
    : null;
  if (mid) {
    assignedPitcherIds.add(mid.id);
    roleMap.set(mid.id, "MID");
  }

  // CP — Closer: low stamina + high velocity/control; score = (velocity + control) - stamina * 0.5
  const cp = pickPitcher(p => (p.velocity || 0) + (p.control || 0) - (p.stamina || 0) * 0.5);
  if (cp) roleMap.set(cp.id, "CP");

  // SU — Setup: highest stuff (specialty pitches)
  const su = pickPitcher(p => (p.stuff || 0));
  if (su) roleMap.set(su.id, "SU");

  // Remaining → MR1, MR2, MR3, LRP in overall order
  const bullpenRoles = ["MR1", "MR2", "MR3", "LRP"];
  const remainingBullpen = pitcherRemaining
    .filter(p => !assignedPitcherIds.has(p.id))
    .sort((a, b) => (b.overall || 0) - (a.overall || 0));
  for (let i = 0; i < remainingBullpen.length; i++) {
    const role = bullpenRoles[i] ?? null;
    roleMap.set(remainingBullpen[i].id, role ?? "");
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
      secret: process.env.SESSION_SECRET || randomUUID(),
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

  // ── PRESENCE ENDPOINTS (public, no auth required) ────────────────────────
  app.post("/api/presence/heartbeat", (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.slice(0, 64) : null;
    if (!token) return res.status(400).json({ message: "token required" });
    presenceMap.set(token, Date.now());
    res.json({ ok: true, online: getOnlineCount() });
  });

  app.get("/api/presence/online-count", (_req, res) => {
    res.json({ online: getOnlineCount() });
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const result = authSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid email or password (min 6 characters)" });
      }

      const { email, password } = result.data;
      
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await storage.createUser({ email, password: hashedPassword });
      req.session.userId = user.id;
      res.json({ id: user.id, email: user.email });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const result = authSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      const { email, password } = result.data;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      res.json({ id: user.id, email: user.email });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.isGuest) {
      res.json({ id: req.session.userId || "guest", email: "guest@guest.com", emailOptOut: false });
    } else if (req.session.userId) {
      storage.getUser(req.session.userId).then((user) => {
        if (user) {
          res.json({ id: user.id, email: user.email, emailOptOut: user.emailOptOut ?? false });
        } else {
          res.status(401).json({ message: "Not authenticated" });
        }
      });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.patch("/api/users/email-preferences", requireAuth, async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      const schema = z.object({ emailOptOut: z.boolean() });
      const result = schema.safeParse(req.body);
      if (!result.success) return res.status(400).json({ message: "emailOptOut (boolean) is required" });
      const updated = await storage.updateUser(req.session.userId, { emailOptOut: result.data.emailOptOut });
      res.json({ emailOptOut: updated?.emailOptOut ?? result.data.emailOptOut });
    } catch (error) {
      console.error("Failed to update email preferences:", error);
      res.status(500).json({ message: "Failed to update email preferences" });
    }
  });

  app.get("/api/users/unsubscribe", async (req, res) => {
    try {
      const { token } = req.query as { token?: string };
      if (!token) return res.status(400).send("Missing token");
      const userId = verifyUnsubToken(token);
      if (!userId) return res.status(400).send("Invalid or expired unsubscribe link");
      await storage.updateUser(userId, { emailOptOut: true });
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Unsubscribed</title></head>
<body style="background:#0a1a0a;color:#d4d4aa;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="text-align:center;max-width:400px;padding:40px">
  <div style="font-size:32px;color:#FFD700;margin-bottom:16px;">⚾</div>
  <h1 style="color:#FFD700;font-size:18px;margin:0 0 12px">Unsubscribed</h1>
  <p style="color:#8aaa8a;font-size:14px;margin:0 0 20px">You've been unsubscribed from weekly digest emails. You can re-enable them anytime from your coach profile.</p>
  <a href="/" style="color:#FFD700;font-size:12px;text-decoration:none;border:1px solid #FFD700;padding:8px 20px;border-radius:4px">Return to Dynasty</a>
</div></body></html>`);
    } catch (error) {
      console.error("Failed to process unsubscribe:", error);
      res.status(500).send("Failed to process unsubscribe");
    }
  });

  app.post("/api/auth/guest", async (req, res) => {
    try {
      const guestId = `guest-${randomUUID()}`;
      const guestEmail = `guest-${randomUUID()}@guest.local`;
      
      // Create a temporary guest user in the database to satisfy foreign key constraints
      await storage.createUser({ 
        id: guestId,
        email: guestEmail, 
        password: randomUUID() // Random password, not used for guest auth
      });
      
      req.session.isGuest = true;
      req.session.userId = guestId;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create guest session" });
        }
        res.json({ id: guestId, email: guestEmail });
      });
    } catch (error) {
      console.error("Guest creation error:", error);
      res.status(500).json({ message: "Failed to create guest session" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
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

        const userCoach = leagueCoaches.find(c => c.userId === userId);
        const userTeam = userCoach
          ? leagueTeams.find(t => t.coachId === userCoach.id)
          : leagueTeams.find(t => !t.isCpu);

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

      const results = await Promise.all(userLeagues.map(async (league) => {
        const [leagueTeams, coaches] = await Promise.all([
          storage.getTeamsByLeague(league.id),
          storage.getCoachesByLeague(league.id),
        ]);
        const userCoach = coaches.find((c) => c.userId === userId);
        const userTeam = userCoach ? leagueTeams.find((t) => t.coachId === userCoach.id) : leagueTeams.find((t) => !t.isCpu);

        if (!userTeam) return null;

        const [players, recruits] = await Promise.all([
          storage.getPlayersByTeam(userTeam.id),
          storage.getRecruitsByLeague(league.id),
        ]);

        const activePlayers = players.filter(p => !p.declaredForDraft);
        const avgOvr = activePlayers.length > 0
          ? Math.round(activePlayers.reduce((s, p) => s + (p.overall || 0), 0) / activePlayers.length)
          : 0;
        const starPlayers = activePlayers.filter(p => (p.overall || 0) >= 400).length;
        const teamRecruits = recruits.filter((r: any) => r.committedTeamId === userTeam.id);

        return {
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
        };
      }));

      const validResults = results.filter(Boolean) as { roster: any; recruiting: any }[];
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

      const { name, maxTeams = 8, cpuDifficulty = "high_school", conferenceCount = 2, selectedConferences, seasonLength = "medium", progressionEnabled = false } = result.data;

      const league = await storage.createLeague({
        name,
        commissionerId: userId,
        maxTeams,
        cpuDifficulty,
        seasonLength,
        currentPhase: "dynasty_setup",
        progressionEnabled,
      });

      // Create conferences - use selected conferences or default to first N
      const allConferences = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];
      const conferenceNames = selectedConferences && selectedConferences.length > 0
        ? selectedConferences.filter(c => allConferences.includes(c))
        : allConferences.slice(0, conferenceCount);

      for (const confName of conferenceNames) {
        await storage.createConference({ leagueId: league.id, name: confName });
      }

      // DON'T create teams yet - let users select specific teams in dynasty-setup

      await storage.createAuditLog({
        leagueId: league.id,
        userId,
        action: "League Created",
        details: `League "${name}" was created with ${maxTeams} teams`,
      });

      res.json(league);
    } catch (error) {
      console.error("Failed to create league:", error);
      res.status(500).json({ message: "Failed to create league" });
    }
  });

  app.get("/api/leagues/:id", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
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
          } : null,
          user,
        };
      }));

      res.json({
        ...league,
        teams: teamsWithStandingsAndCoach,
        conferences: leagueConferences,
      });
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

      const PITCHER_POS_SET = new Set(["P", "SP", "RP", "CL", "LHP", "RHP"]);
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
      const ALL_CONF_NAMES = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];

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

      for (const [teamName, roster] of Object.entries(ALL_REAL_ROSTERS)) {
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
      
      const conferenceTeamPools = conferences.map(conf => {
        return {
          conference: conf,
          teams: getTeamsForConference(conf.name),
        };
      });
      
      res.json({ 
        league,
        conferences,
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

      const conferences = await storage.getConferencesByLeague(league.id);
      let totalTeamsCreated = 0;

      const allConferenceNames = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];
      const allTeamPools = allConferenceNames.flatMap(name => getTeamsForConference(name));

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

          await storage.createStandings({
            leagueId: league.id,
            teamId: team.id,
            season: 1,
          });

          totalTeamsCreated++;
        }
      }

      // Generate recruits now that teams exist — scale class size to team count
      await generateRecruits(league.id, getRecruitPoolSize(totalTeamsCreated));

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
        leagueId: req.params.id,
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

      const leagueForGen = await storage.getLeague(req.params.id);
      const progressionOn = leagueForGen?.progressionEnabled ?? false;

      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const leagueConfs = await storage.getConferencesByLeague(req.params.id);
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
        const teamPlayers = await storage.getPlayersByTeam(team.id);
        await autoAssignLineup(storage, teamPlayers, team.id);
      }

      // Generate initial schedule
      await generateSchedule(req.params.id);

      await storage.createAuditLog({
        leagueId: req.params.id,
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

  // Recruiting routes
  app.get("/api/leagues/:id/recruiting", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(league.id);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = userCoach
        ? leagueTeams.find((t) => t.coachId === userCoach.id)
        : leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const leagueRecruits = await storage.getRecruitsByLeague(league.id);
      const interests = await storage.getRecruitingInterestsByTeam(userTeam.id);
      const roster = await storage.getPlayersByTeam(userTeam.id);
      
      // Get coach data for skill-based action limits
      const coach = userCoach ?? (userTeam.coachId ? await storage.getCoach(userTeam.coachId) : null);

      // Build team lookup map for top schools
      const teamMap = new Map(leagueTeams.map(t => [t.id, t]));

      // Rivalry computation: use recruit_top_schools combined interest (interestLevel + accumulatedInterest)
      // as the canonical interest signal.
      // RIVALRY_INTEREST_THRESHOLD: combined baseline prestige (default 50) + meaningful active
      // recruiting accumulation (30). A school must exceed this sum to count as an active rival.
      const RIVALRY_INTEREST_THRESHOLD = 80;
      // RIVALRY_INTENSITY_CUTOFFS: school counts that define Light / Moderate / Heavy labels.
      const RIVALRY_INTENSITY_CUTOFFS = { moderate: 2, heavy: 4 } as const;
      const allLeagueTopSchools = await storage.getRecruitTopSchoolsByLeague(league.id);
      const cpuDifficulty = league.cpuDifficulty || "high_school";
      const cpuCountsForRivalry = cpuDifficulty === "all_american" || cpuDifficulty === "elite";
      // Build per-recruit map: recruitId -> count of teams with meaningful combined interest
      const rivalryMap = new Map<string, number>();
      for (const ts of allLeagueTopSchools) {
        if (ts.teamId === userTeam.id) continue;
        if (!ts.isActive) continue;
        if ((ts.interestLevel || 0) + (ts.accumulatedInterest || 0) < RIVALRY_INTEREST_THRESHOLD) continue;
        const tsTeam = teamMap.get(ts.teamId);
        if (!tsTeam) continue;
        if (tsTeam.isCpu && !cpuCountsForRivalry) continue;
        rivalryMap.set(ts.recruitId, (rivalryMap.get(ts.recruitId) || 0) + 1);
      }

      // teamsIn map: recruitId -> { teamsIn, offersOut } from recruiting_interests table.
      // Counts rival teams that have either extended an offer OR accumulated >20% interest.
      // More precise than rivalryMap (which uses recruit_top_schools prestige baseline).
      // Revealed once the user has scouted >= 10% of the recruit.
      const allLeagueInterests = await storage.getRecruitingInterestsByLeague(league.id);
      const teamsInMap = new Map<string, { teamsIn: number; offersOut: number }>();
      for (const ri of allLeagueInterests) {
        if (ri.teamId === userTeam.id) continue;
        if ((ri.interestLevel || 0) <= 20 && !ri.hasOffer) continue;
        const entry = teamsInMap.get(ri.recruitId) ?? { teamsIn: 0, offersOut: 0 };
        entry.teamsIn++;
        if (ri.hasOffer) entry.offersOut++;
        teamsInMap.set(ri.recruitId, entry);
      }

      // Build a per-recruit map from the already-fetched allLeagueTopSchools to avoid N+1 queries
      const topSchoolsByRecruit = new Map<string, (typeof allLeagueTopSchools)[number][]>();
      for (const ts of allLeagueTopSchools) {
        if (!topSchoolsByRecruit.has(ts.recruitId)) topSchoolsByRecruit.set(ts.recruitId, []);
        topSchoolsByRecruit.get(ts.recruitId)!.push(ts);
      }

      const recruitsWithInterest = await Promise.all(leagueRecruits.map(async (recruit) => {
        const interest = interests.find((i) => i.recruitId === recruit.id);
        
        // Use pre-fetched top schools map — no extra DB query per recruit
        const storedTopSchools = topSchoolsByRecruit.get(recruit.id) ?? [];
        
        // Stage values are lowercase: "open", "top8", "top5", "top3", "verbal", "signed"
        const stage = (recruit.stage || "open").toLowerCase();
        const topSchoolsCount = stage === "top3" ? 3 : stage === "top5" ? 5 : 8;
        
        // Convert stored top schools to display format, filtering by active schools in the league
        // Deduplicate by teamId, keeping the entry with the highest combined interest
        const deduped = new Map<string, typeof storedTopSchools[0]>();
        for (const ts of storedTopSchools) {
          if (!ts.isActive || !teamMap.has(ts.teamId)) continue;
          const existing = deduped.get(ts.teamId);
          if (!existing || (ts.interestLevel + ts.accumulatedInterest) > (existing.interestLevel + existing.accumulatedInterest)) {
            deduped.set(ts.teamId, ts);
          }
        }
        let topSchools = Array.from(deduped.values())
          .sort((a, b) => (a.rank || 99) - (b.rank || 99))
          .slice(0, topSchoolsCount)
          .map(ts => {
            const team = teamMap.get(ts.teamId)!;
            return {
              teamId: ts.teamId,
              teamName: team.name,
              abbreviation: team.abbreviation,
              primaryColor: team.primaryColor,
              interestLevel: ts.interestLevel + ts.accumulatedInterest,
            };
          })
          .sort((a, b) => b.interestLevel - a.interestLevel);
        
        // Fallback: if no stored top schools, generate from league teams
        if (topSchools.length === 0) {
          const seedFromId = (id: string) => {
            let hash = 0;
            for (let i = 0; i < id.length; i++) {
              hash = ((hash << 5) - hash) + id.charCodeAt(i);
              hash = hash & hash;
            }
            return Math.abs(hash);
          };
          const seed = seedFromId(recruit.id);
          const seededShuffle = <T,>(arr: T[], s: number): T[] => {
            const result = [...arr];
            for (let i = result.length - 1; i > 0; i--) {
              const j = (s * (i + 1)) % result.length;
              [result[i], result[j]] = [result[j], result[i]];
            }
            return result;
          };
          const shuffledTeams = seededShuffle(leagueTeams, seed).slice(0, topSchoolsCount);
          topSchools = shuffledTeams.map((team, idx) => ({
            teamId: team.id,
            teamName: team.name,
            abbreviation: team.abbreviation,
            primaryColor: team.primaryColor,
            interestLevel: Math.max(10, 100 - (idx * 10) - ((seed + idx) % 10)),
          })).sort((a, b) => b.interestLevel - a.interestLevel);
        }
        
        const signedTeam = recruit.signedTeamId ? teamMap.get(recruit.signedTeamId) : null;
        
        let actualPotential = recruit.potential;
        if (actualPotential == null) {
          actualPotential = rollWeightedPotential();
          storage.updateRecruit(recruit.id, { potential: actualPotential }).catch(() => {});
        }
        let dynamicPotentialFloor = recruit.potentialFloor;
        let dynamicPotentialCeiling = recruit.potentialCeiling;
        if (actualPotential != null && coach) {
          const evalSkill = coach.evaluationSkill || 1;
          const dynRange = getPotentialRange(actualPotential, evalSkill);
          dynamicPotentialFloor = dynRange.floor;
          dynamicPotentialCeiling = dynRange.ceiling;
        }
        
        // Rivalry signals: only visible when viewer has scouted >= 25%
        const userScoutPct = interest?.scoutPercentage || 0;
        const rawCompetingCount = rivalryMap.get(recruit.id) || 0;
        const competingCount = userScoutPct >= 25 ? rawCompetingCount : null;
        const competingIntensity: string | null =
          competingCount === null || competingCount === 0 ? null :
          competingCount < RIVALRY_INTENSITY_CUTOFFS.moderate ? "Light" :
          competingCount < RIVALRY_INTENSITY_CUTOFFS.heavy ? "Moderate" : "Heavy";

        // teamsIn / offersOut: revealed once user has scouted >= 10%.
        // Sourced from recruiting_interests (hasOffer OR interestLevel > 20) — more
        // precise than the prestige-baseline rivalryMap used for competingCount.
        const rawTeamsIn = teamsInMap.get(recruit.id) ?? { teamsIn: 0, offersOut: 0 };
        const teamsIn: number | null = userScoutPct >= 10 ? rawTeamsIn.teamsIn : null;
        const offersOut: number | null = userScoutPct >= 10 ? rawTeamsIn.offersOut : null;

        // Signing-day holdback: hold back last 40% of attribute fields and last 50% of common-ability
        // fields until signingDayRevealed = true.  Blue chips are fully exempt.
        const SIGNING_ATTR_KEYS = new Set([
          'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
          'velocity', 'control', 'stamina',
          'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL',
        ]);
        const SIGNING_COMMON_KEYS = new Set([
          'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery',
          'wRISP', 'vsLefty', 'poise', 'heater', 'agile', 'catcherAbility',
        ]);
        // Default field ordering for recruits whose scoutingOrder was generated before
        // attribute/common-ability keys were included (prevents empty holdbackFields).
        const isPitcherRecruit = ['P', 'SP', 'RP', 'CP'].includes(recruit.position || '');
        const defaultAttrOrder = isPitcherRecruit
          ? ['velocity', 'control', 'stamina', 'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL']
          : ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance'];
        const defaultCommonOrder = isPitcherRecruit
          ? ['wRISP', 'vsLefty', 'poise', 'grit', 'heater', 'agile', 'recovery']
          : ['clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility'];
        const scoutingOrder = (recruit.scoutingOrder as string[]) || [];
        const attrOrderFromScouting   = scoutingOrder.filter(f => SIGNING_ATTR_KEYS.has(f));
        const commonOrderFromScouting = scoutingOrder.filter(f => SIGNING_COMMON_KEYS.has(f));
        // Fall back to defaults when scoutingOrder predates these key groups
        const attrOrder   = attrOrderFromScouting.length   > 0 ? attrOrderFromScouting   : defaultAttrOrder;
        const commonOrder = commonOrderFromScouting.length > 0 ? commonOrderFromScouting : defaultCommonOrder;
        const holdbackFields: string[] = (recruit.isBlueChip || recruit.signingDayRevealed)
          ? []
          : [
              ...attrOrder.slice(Math.floor(attrOrder.length * 0.60)),    // hold back last 40%
              ...commonOrder.slice(Math.floor(commonOrder.length * 0.50)), // hold back last 50%
            ];

        // Null out holdback field values so they never reach the client before signing day
        const maskedRecruit: Record<string, unknown> = { ...recruit };
        for (const field of holdbackFields) {
          maskedRecruit[field] = null;
        }

        return {
          ...maskedRecruit,
          potential: actualPotential,
          potentialFloor: dynamicPotentialFloor,
          potentialCeiling: dynamicPotentialCeiling,
          interest,
          topSchools,
          signedTeamName: signedTeam?.name || null,
          signedTeamAbbreviation: signedTeam?.abbreviation || null,
          signedTeamPrimaryColor: signedTeam?.primaryColor || null,
          signedTeamSecondaryColor: signedTeam?.secondaryColor || null,
          competingCount,
          competingIntensity,
          teamsIn,
          offersOut,
          // Tell the client which fields are signing-day locked vs just unscouted
          signingDayLockedFields: holdbackFields,
        };
      }));

      // Current roster position counts
      const positionCounts: Record<string, number> = {};
      roster.forEach((player) => {
        positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;
      });

      // Next year's roster forecast (seniors graduate, players age up)
      const nextYearDepth: Record<string, number> = {};
      roster.forEach((player) => {
        // Seniors will graduate, so don't count them for next year
        if (player.eligibility !== 'SR') {
          nextYearDepth[player.position] = (nextYearDepth[player.position] || 0) + 1;
        }
      });

      const maxScoutActions = getMaxScoutActions(coach);
      const maxRecruitingActions = getMaxRecruitingActions(coach);
      
      // Count seniors for commit limit calculation (max 25 roster, so commits = 25 - current + seniors leaving)
      const seniorsCount = roster.filter(p => p.eligibility === 'SR').length;
      const nextYearRosterSize = roster.length - seniorsCount;
      const maxCommits = Math.max(0, 25 - roster.length + seniorsCount);
      
      const scoutActionsUsed = coach?.scoutActionsUsed || 0;
      const recruitingActionsUsed = coach?.recruitActionsUsed || 0;
      const remainingScoutActions = Math.max(0, maxScoutActions - scoutActionsUsed);
      const remainingRecruitingActions = Math.max(0, maxRecruitingActions - recruitingActionsUsed);

      const allTeamActions = await storage.getRecruitingActionsLogByTeam(userTeam.id, league.id);
      const premiumActionsUsed: Record<string, string[]> = {};
      const weeklyActionsUsed: Record<string, string[]> = {};
      for (const action of allTeamActions) {
        if (action.actionType === "visit" || action.actionType === "head_coach_visit") {
          if (!premiumActionsUsed[action.recruitId]) {
            premiumActionsUsed[action.recruitId] = [];
          }
          if (!premiumActionsUsed[action.recruitId].includes(action.actionType)) {
            premiumActionsUsed[action.recruitId].push(action.actionType);
          }
        }
        if ((action.actionType === "phone" || action.actionType === "email")
            && action.week === league.currentWeek && action.season === league.currentSeason) {
          if (!weeklyActionsUsed[action.recruitId]) {
            weeklyActionsUsed[action.recruitId] = [];
          }
          if (!weeklyActionsUsed[action.recruitId].includes(action.actionType)) {
            weeklyActionsUsed[action.recruitId].push(action.actionType);
          }
        }
      }

      const recruitPointCosts: Record<string, { visit: number; headCoachVisit: number }> = {};
      for (const recruit of leagueRecruits) {
        recruitPointCosts[recruit.id] = {
          visit: getActionPointCost("visit", userTeam.state, recruit.homeState),
          headCoachVisit: getActionPointCost("head_coach_visit", userTeam.state, recruit.homeState),
        };
      }

      res.json({
        recruits: recruitsWithInterest,
        team: userTeam,
        remainingPoints: remainingRecruitingActions,
        maxPoints: maxRecruitingActions,
        pointsUsed: recruitingActionsUsed,
        remainingScoutPoints: remainingScoutActions,
        maxScoutPoints: maxScoutActions,
        scoutPointsUsed: scoutActionsUsed,
        targetedCount: interests.filter((i) => i.isTargeted).length,
        commitsCount: leagueRecruits.filter((r) => r.signedTeamId === userTeam.id).length,
        maxCommits,
        rosterDepth: positionCounts,
        rosterSize: roster.length,
        nextYearDepth,
        nextYearRosterSize,
        seniorsGraduating: seniorsCount,
        premiumActionsUsed,
        weeklyActionsUsed,
        recruitPointCosts,
        autoPilotPendingAlert: (coach as any)?.autoPilotPendingAlert ?? [],
      });
    } catch (error) {
      console.error("Failed to fetch recruiting data:", error);
      res.status(500).json({ message: "Failed to fetch recruiting data" });
    }
  });

  app.post("/api/leagues/:id/recruiting/:recruitId/scout", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId) || leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const maxScoutActions = getMaxScoutActions(userCoach);
      if ((userCoach?.scoutActionsUsed || 0) >= maxScoutActions) {
        return res.status(400).json({ message: `You've used all ${maxScoutActions} scouting points this week` });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      let interest = await storage.getRecruitingInterest(req.params.recruitId, userTeam.id);
      
      // Scout reveals 15-25% each time, with archetype scouting efficiency bonus
      const archetypeScoutEfficiency: Record<string, number> = {
        "Scout Master": 15,
        "Academic Dean": 5,
        "Balanced": 0,
        "Pure CEO": 0,
        "Player's Coach": 0,
        "Dealmaker": 0,
        "Tactician": 3,
        "Old School": 0,
      };
      const scoutSkillBonus = Math.floor(((userCoach?.scoutingSkill || 1) - 1) * 2);
      const archEfficiency = archetypeScoutEfficiency[userCoach?.archetype] || 0;
      const revealAmount = 15 + Math.floor(Math.random() * 11) + scoutSkillBonus + archEfficiency;
      const potentialNarrowMultiplier = ARCHETYPE_POTENTIAL_NARROWING[userCoach?.archetype] || 1.0;

      // Helper function to narrow down a range (with archetype potential narrowing bonus).
      // Scouting is partially capped before signing day — attrs cap at 60%, common abilities at 50%.
      // The held-back portion unlocks only at the signing-day cinematic.
      const narrowRange = (min: number, max: number, actual: number, pct: number): { newMin: number; newMax: number } => {
        const range = max - min;
        // Cap effective pct at 60: even fully-scouted recruits stay as a range until signing day.
        const cappedPct = Math.min(pct, 60);
        const effectivePct = Math.min(100, cappedPct * potentialNarrowMultiplier);
        const narrowFactor = effectivePct / 100;
        const newRange = Math.max(0, range * (1 - narrowFactor * 0.8));
        const halfRange = Math.floor(newRange / 2);
        let newMin = Math.max(1, Math.max(min, actual - halfRange));
        let newMax = Math.min(max, actual + halfRange);
        // Enforce minimum display width of 150 before signing day.
        // Expand symmetrically around actual, then shift window if clipped at boundary.
        if (newMax - newMin < 150) {
          let newMinAdj = Math.max(1, actual - 75);
          let newMaxAdj = Math.min(999, newMinAdj + 150);
          // If upper-bound clip made range too narrow, push window left
          if (newMaxAdj - newMinAdj < 150) {
            newMinAdj = Math.max(1, newMaxAdj - 150);
          }
          newMin = newMinAdj;
          newMax = newMaxAdj;
        }
        return { newMin, newMax };
      };

      // Helper function to narrow star range
      const narrowStarRange = (min: number, max: number, actual: number, pct: number): { newMin: number; newMax: number } => {
        if (pct >= 100) return { newMin: actual, newMax: actual };
        if (pct >= 75) {
          // At 75%+, exact star
          return { newMin: actual, newMax: actual };
        }
        if (pct >= 50) {
          // At 50%+, narrow to within 1 star
          return { 
            newMin: Math.max(1, actual - 1), 
            newMax: Math.min(5, actual + 1) 
          };
        }
        if (pct >= 25) {
          // At 25%+, narrow to within 2 stars of actual
          return { 
            newMin: Math.max(1, actual - 2), 
            newMax: Math.min(5, actual + 2) 
          };
        }
        return { newMin: 1, newMax: 5 };
      };
      
      if (!interest) {
        // Determine which attributes to reveal — capped at 60% before signing day
        const revealedAttrs = getAttributesToReveal(Math.min(revealAmount, 60));
        
        // Calculate initial ranges based on reveal amount
        const ovrRange = narrowRange(1, 999, recruit.overall, revealAmount);
        const starRange = narrowStarRange(1, 5, recruit.starRating, revealAmount);
        
        // Reveal abilities based on percentage, capped at 50% — rest unlocks at signing day
        const totalAbilities = (recruit.abilities as string[] || []).length;
        const revealedAbilitiesCount = Math.min(totalAbilities, Math.floor(totalAbilities * (Math.min(revealAmount, 50) / 100)));
        
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          scoutPercentage: revealAmount,
          revealedAttributes: revealedAttrs,
          minOverall: ovrRange.newMin,
          maxOverall: ovrRange.newMax,
          minStar: starRange.newMin,
          maxStar: starRange.newMax,
          revealedAbilitiesCount,
        });
      } else {
        const currentPct = interest.scoutPercentage || 0;
        const newPct = Math.min(100, currentPct + revealAmount);
        
        // Add more revealed attributes using target-based count (prevents floor compounding).
        // Cap target at 60% of all attrs — the remaining 40% unlocks at signing day.
        const currentAttrs = (interest.revealedAttributes as string[]) || [];
        const effectiveNewPct = Math.min(newPct, 60);
        const targetTotal = Math.floor(effectiveNewPct / 100 * SCOUT_ATTRS.length);
        const needToReveal = Math.max(0, targetTotal - currentAttrs.length);
        const additionalAttrs = getAttributesToRevealCount(needToReveal, currentAttrs);
        const allAttrs = [...currentAttrs, ...additionalAttrs];
        
        // Narrow down the rating ranges
        const currentMinOvr = interest.minOverall || 1;
        const currentMaxOvr = interest.maxOverall || 999;
        const currentMinStar = interest.minStar || 1;
        const currentMaxStar = interest.maxStar || 5;
        
        const ovrRange = narrowRange(currentMinOvr, currentMaxOvr, recruit.overall, newPct);
        const starRange = narrowStarRange(currentMinStar, currentMaxStar, recruit.starRating, newPct);
        
        // Reveal more abilities, capped at 50% — rest unlocks at signing day
        const totalAbilities = (recruit.abilities as string[] || []).length;
        const revealedAbilitiesCount = Math.min(totalAbilities, Math.floor(totalAbilities * (Math.min(newPct, 50) / 100)));
        
        interest = await storage.updateRecruitingInterest(interest.id, {
          scoutPercentage: newPct,
          revealedAttributes: allAttrs,
          minOverall: ovrRange.newMin,
          maxOverall: ovrRange.newMax,
          minStar: starRange.newMin,
          maxStar: starRange.newMax,
          revealedAbilitiesCount,
        });
      }

      // Log the scouting action
      const league = await storage.getLeague(req.params.id);
      if (league) {
        await storage.createRecruitingAction({
          recruitId: req.params.recruitId,
          teamId: userTeam.id,
          leagueId: req.params.id,
          week: league.currentWeek,
          season: league.currentSeason,
          actionType: "scout",
          interestChange: 0,
          notes: `Scouted to ${interest?.scoutPercentage || 0}%`,
        });
      }

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          scoutActionsUsed: (userCoach.scoutActionsUsed || 0) + 1,
        });
      }

      res.json(interest);
    } catch (error) {
      console.error("Failed to scout recruit:", error);
      res.status(500).json({ message: "Failed to scout recruit" });
    }
  });

  // Get recruiting actions log for a recruit
  app.get("/api/leagues/:id/recruiting/:recruitId/actions", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const userTeam = leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const actions = await storage.getRecruitingActionsLog(req.params.recruitId, userTeam.id);
      res.json({ actions });
    } catch (error) {
      console.error("Failed to fetch recruiting actions:", error);
      res.status(500).json({ message: "Failed to fetch recruiting actions" });
    }
  });

  // Get all scouting/recruiting actions for user's team (history across all recruits)
  app.get("/api/leagues/:id/recruiting-history", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      if (!userCoach) {
        return res.status(400).json({ message: "No coach assigned" });
      }

      const actions = await storage.getRecruitingActionsLogByTeam(userCoach.teamId, req.params.id);
      
      const recruits = await storage.getRecruitsByLeague(req.params.id);
      const recruitMap = new Map(recruits.map(r => [r.id, r]));
      
      const enrichedActions = actions.map(a => {
        const recruit = recruitMap.get(a.recruitId);
        return {
          ...a,
          recruitName: recruit ? `${recruit.firstName} ${recruit.lastName}` : "Unknown",
          recruitPosition: recruit?.position || "?",
          recruitStarRating: recruit?.starRating || 0,
        };
      });

      res.json({ actions: enrichedActions });
    } catch (error) {
      console.error("Failed to fetch recruiting history:", error);
      res.status(500).json({ message: "Failed to fetch recruiting history" });
    }
  });

  // Weekly rival activity recap for recruiting page
  app.get("/api/leagues/:id/recruiting/weekly-recap", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach) return res.status(400).json({ message: "No coach assigned" });

      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const userTeam = leagueTeams.find(t => t.id === userCoach.teamId);
      if (!userTeam) return res.status(400).json({ message: "No team assigned" });

      const reqSeason = req.query.season ? parseInt(req.query.season as string) : league.currentSeason;
      const reqWeek = req.query.week ? parseInt(req.query.week as string) : Math.max(1, league.currentWeek - 1);

      // Get ALL actions for this league/season/week
      const allActions = await storage.getRecruitingActionsLogByLeagueWeek(leagueId, reqSeason, reqWeek);

      // Separate my actions from rivals'
      const myActions = allActions.filter(a => a.teamId === userTeam.id);
      const rivalActions = allActions.filter(a => a.teamId !== userTeam.id);

      // Build set of recruits I contacted this week
      const myRecruitIds = new Set(myActions.map(a => a.recruitId));

      // Build rival action counts per recruit
      const rivalCountByRecruit = new Map<string, number>();
      for (const a of rivalActions) {
        rivalCountByRecruit.set(a.recruitId, (rivalCountByRecruit.get(a.recruitId) || 0) + 1);
      }

      const getActivityLevel = (count: number): string => {
        if (count >= 5) return "Hot";
        if (count >= 2) return "Active";
        return "Quiet";
      };

      // Load recruits for name/position/star info
      const allRecruits = await storage.getRecruitsByLeague(leagueId);
      const recruitMap = new Map(allRecruits.map(r => [r.id, r]));

      // Recruits I contacted: show rival activity count
      const myRecruits = Array.from(myRecruitIds).map(recruitId => {
        const recruit = recruitMap.get(recruitId);
        const rivalCount = rivalCountByRecruit.get(recruitId) || 0;
        return {
          recruitId,
          name: recruit ? `${recruit.firstName} ${recruit.lastName}` : "Unknown",
          position: recruit?.position || "?",
          starRating: recruit?.starRating || 0,
          otherTeamActionCount: rivalCount,
          activityLevel: getActivityLevel(rivalCount),
        };
      }).sort((a, b) => b.otherTeamActionCount - a.otherTeamActionCount);

      // Hot recruits I HAVEN'T contacted with 3+ rival actions
      const hotMissed = Array.from(rivalCountByRecruit.entries())
        .filter(([recruitId, count]) => !myRecruitIds.has(recruitId) && count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([recruitId, count]) => {
          const recruit = recruitMap.get(recruitId);
          return {
            recruitId,
            name: recruit ? `${recruit.firstName} ${recruit.lastName}` : "Unknown",
            position: recruit?.position || "?",
            starRating: recruit?.starRating || 0,
            otherTeamActionCount: count,
            activityLevel: getActivityLevel(count),
          };
        });

      res.json({ season: reqSeason, week: reqWeek, myRecruits, hotMissed });
    } catch (error) {
      console.error("Failed to fetch weekly recap:", error);
      res.status(500).json({ message: "Failed to fetch weekly recap" });
    }
  });

  // ============ RECRUITING CALCULATION HELPERS ============
  
  // Clipped-gain observability counter. Incremented whenever a gain lands outside
  // the expected band so operators can grep for summary lines in server logs.
  let _sanityClippedCount = 0;

  function assertInterestGainSane(actionType: string, interestGain: number, baseGain: number) {
    // Tightened band: 0.4× to 5.0× base (previously 0.25×–8×).
    // After the school-bonus normalization (0.80–1.25) and per-action multiplier
    // caps (email/phone 4.5×, visits/offer 3.0×) the legitimate range is
    // ≈0.36×–4.5×, so anything outside 0.4×–5.0× is a real anomaly.
    const expectedMin = Math.ceil(baseGain * 0.4);
    const expectedMax = Math.ceil(baseGain * 5.0);
    if (interestGain < expectedMin || interestGain > expectedMax) {
      _sanityClippedCount++;
      console.warn(
        `[recruiting-sanity] ${actionType}: interestGain=${interestGain} outside [${expectedMin},${expectedMax}] (base=${baseGain}) — cumulative clips: ${_sanityClippedCount}`,
      );
    }
  }

  function calculatePriorityBonus(pitchTopic: string, recruit: any, team: any): { bonus: number; matchLevel: string } {
    const priorityMap: Record<string, string> = {
      proximity: recruit.proximityPriority,
      reputation: recruit.reputationPriority,
      playingTime: recruit.playingTimePriority,
      academics: recruit.academicsPriority,
      prestige: recruit.prestigePriority,
      facilities: recruit.facilitiesPriority,
    };
    
    const priorityValue = priorityMap[pitchTopic] || "Somewhat";
    
    // Convert priority text to multiplier
    const priorityMultipliers: Record<string, number> = {
      "Not Important": 0.5,
      "Somewhat": 1.0,
      "Very": 1.5,
      "Extremely": 2.0,
    };
    
    const multiplier = priorityMultipliers[priorityValue] || 1.0;
    return { bonus: multiplier, matchLevel: priorityValue };
  }
  
  // Normalize a 1-10 team attribute into the range 0.80–1.25.
  // At attr=1 → 0.80, attr=5 → 1.0, attr=10 → 1.25.
  // This replaces the old attr/5 formula (range 0.2–2.0) which caused extreme
  // stacking and is inconsistent with the design spec of ~0.7–1.4 school bonus.
  function normalizeAttrBonus(attr: number): number {
    const clamped = Math.max(1, Math.min(10, attr));
    return 0.75 + clamped * 0.05;
  }

  // Calculate school attribute bonus for a pitch topic.
  // Range: ~0.80–1.375 (topic bonus × overall quality modifier).
  // Rising programs (improved national rank 10+ spots last season) get a temporary
  // recruitingRankBoost (0.05 or 0.10) added to the quality modifier for one season.
  function calculateSchoolBonus(pitchTopic: string, team: any): number {
    const attributeMap: Record<string, number> = {
      proximity: 1.0,                                // No school attribute for proximity
      reputation: normalizeAttrBonus(team.prestige || 5),
      playingTime: 1.0,                              // Playing time is situational
      academics: normalizeAttrBonus(team.academics || 5),
      prestige: normalizeAttrBonus(team.prestige || 5),
      facilities: normalizeAttrBonus(team.facilities || 5),
    };
    const topicBonus = attributeMap[pitchTopic] || 1.0;

    // Overall program quality modifier: 0.92 (all attrs 1) to 1.10 (all attrs 10)
    const overallQuality = ((team.prestige || 5) + (team.facilities || 5) + (team.academics || 5)) / 30;
    // Apply rising-program rank boost (0 baseline, +0.05 for 10+ spots, +0.10 for 20+ spots)
    const rankBoost = typeof team.recruitingRankBoost === "number" ? team.recruitingRankBoost : 0;
    const qualityModifier = 0.9 + (overallQuality * 0.2) + rankBoost;

    return topicBonus * qualityModifier;
  }
  
  const ARCHETYPE_RECRUITING_ACTION_BONUS: Record<string, number> = {
    "Scout Master": 6,
    "Dealmaker": 4,
    "Pure CEO": 2,
    "Player's Coach": 0,
    "Balanced": 0,
    "Academic Dean": 0,
    "Tactician": -2,
    "Old School": -4,
  };

  const ARCHETYPE_INTEREST_MULTIPLIERS: Record<string, number> = {
    "Pure CEO": 1.15,
    "Dealmaker": 1.12,
    "Player's Coach": 1.10,
    "Scout Master": 1.08,
    "Balanced": 1.0,
    "Academic Dean": 1.0,
    "Tactician": 0.95,
    "Old School": 0.90,
  };

  function getMaxRecruitingActions(coach: any): number {
    const baseActions = 15;
    const skillBonus = Math.floor(((coach?.pitchingRecruitingSkill || 1) + (coach?.hittingRecruitingSkill || 1)) / 2);
    const archetypeBonus = ARCHETYPE_RECRUITING_ACTION_BONUS[coach?.archetype] || 0;
    return Math.max(4, baseActions + skillBonus + archetypeBonus);
  }

  function getMaxScoutActions(coach: any): number {
    const baseActions = 25;
    const skillBonus = Math.floor(((coach?.scoutingSkill || 1) + (coach?.evaluationSkill || 1)) / 2);
    const archetypeScoutBonus: Record<string, number> = {
      "Scout Master": 8,
      "Academic Dean": 3,
      "Balanced": 0,
      "Pure CEO": 0,
      "Player's Coach": 2,
      "Dealmaker": -2,
      "Tactician": 2,
      "Old School": -2,
    };
    const archBonus = archetypeScoutBonus[coach?.archetype] || 0;
    return Math.max(4, baseActions + skillBonus + archBonus);
  }

  const ARCHETYPE_PITCHER_BONUS: Record<string, number> = {
    "Tactician": 1.20,
    "Old School": 1.15,
    "Scout Master": 1.05,
    "Balanced": 1.0,
    "Pure CEO": 1.0,
    "Dealmaker": 1.0,
    "Player's Coach": 1.0,
    "Academic Dean": 1.0,
  };

  const ARCHETYPE_HITTER_BONUS: Record<string, number> = {
    "Player's Coach": 1.20,
    "Dealmaker": 1.10,
    "Scout Master": 1.05,
    "Balanced": 1.0,
    "Pure CEO": 1.0,
    "Tactician": 1.0,
    "Old School": 1.0,
    "Academic Dean": 1.0,
  };

  const ARCHETYPE_POTENTIAL_NARROWING: Record<string, number> = {
    "Scout Master": 1.30,
    "Academic Dean": 1.15,
    "Tactician": 1.10,
    "Balanced": 1.0,
    "Pure CEO": 1.0,
    "Player's Coach": 1.0,
    "Dealmaker": 0.90,
    "Old School": 0.85,
  };

  // Calculate coach skill bonus for recruiting action
  function calculateCoachBonus(coach: any, recruit: any, actionType: string): number {
    if (!coach) return 1.0;
    
    const isPitcher = recruit.position === "P";
    const baseSkill = isPitcher 
      ? (coach.pitchingRecruitingSkill || 1)
      : (coach.hittingRecruitingSkill || 1);
    const skillBonus = 1.0 + (baseSkill - 1) * 0.05;
    
    const archetypeBonus = ARCHETYPE_INTEREST_MULTIPLIERS[coach.archetype] || 1.0;
    const positionBonus = isPitcher
      ? (ARCHETYPE_PITCHER_BONUS[coach.archetype] || 1.0)
      : (ARCHETYPE_HITTER_BONUS[coach.archetype] || 1.0);
    
    return skillBonus * archetypeBonus * positionBonus;
  }
  
  // Calculate proximity bonus based on recruit home state vs team state
  function calculateProximityBonus(recruitState: string, teamState: string): number {
    if (recruitState === teamState) return 1.5; // Same state
    
    // Regional proximity groupings
    const regions: Record<string, string[]> = {
      southeast: ["FL", "GA", "AL", "SC", "NC", "TN", "MS", "LA"],
      southwest: ["TX", "AZ", "NM", "OK"],
      midwest: ["OH", "IN", "IL", "MI", "WI", "MN", "IA", "MO", "NE", "KS"],
      northeast: ["NY", "PA", "NJ", "MA", "CT", "MD", "VA"],
      west: ["CA", "WA", "OR", "CO", "UT", "NV"],
    };
    
    let recruitRegion = "";
    let teamRegion = "";
    
    for (const [region, states] of Object.entries(regions)) {
      if (states.includes(recruitState)) recruitRegion = region;
      if (states.includes(teamState)) teamRegion = region;
    }
    
    if (recruitRegion && recruitRegion === teamRegion) return 1.2; // Same region
    return 1.0; // Different region
  }

  // ── Recruiting math: expected gain ranges (after rebalance) ──────────────────
  //
  //  ACTION          BASE      TYPICAL GAIN    BEST CASE    FLOOR
  //  Email           3–7       ~5–8%           ~28% (cap)   1%
  //  Phone/topic     3–9       ~5–10%          ~36% (cap)   1%
  //  Campus Visit    20–35     ~25–40%         ~88% (cap)   5%
  //  HC Visit        25–40     ~30–45%         ~100% (cap)  5%
  //  Offer           15–24     ~18–25%         ~65% (cap)   2%
  //
  //  Multiplier components:
  //    priority:    0.5 (Not Important) – 2.0 (Extremely)
  //    school:      ~0.80–1.375 (normalizeAttrBonus × qualityModifier)
  //    coach:       ~0.90–1.66 (skill 1-10 × archetype × position)
  //    proximity:   1.0 (different region), 1.2 (same region), 1.5 (same state)
  //
  //  Caps prevent a single action from dominating:
  //    email/phone per-topic: totalMultiplier capped at 4.5×
  //    visit/hcv/offer:       totalMultiplier capped at 3.0×
  //
  //  ── Expected weekly progress by star tier (mid-prestige school, balanced coach) ──
  //
  //  Signing thresholds: 1–2★ need 65%, 3★ 65%, 4★ 70%, 5★ 80%, blue chip 90%.
  //  Typical weekly inputs: 1 email (~6%), 1 phone/2 topics (~14%), plus visit/offer
  //  as one-time boosts. Below: points/week excluding one-time actions.
  //
  //  Star  Threshold  Weekly inputs   Est. weeks to threshold (excl. visit/offer)
  //  1★    65%        email+phone≈20  ~3 weeks — easily signed early
  //  2★    65%        email+phone≈20  ~3 weeks — a few rivals may compete
  //  3★    65%        email+phone≈20  ~3 weeks — competitive with 2+ schools
  //  4★    70%        email+phone≈20  ~4 weeks — needs visit or offer to close
  //  5★    80%        email+phone≈20  ~4 weeks — requires perfect topic match + visit
  //  BC    90%        email+phone≈20  ~5+ weeks — visit + HCV + offer nearly required
  //
  //  (Season length Standard = 5 recruiting weeks; these are baseline estimates.
  //   Priority match, school quality, coach level, and proximity shift gains ±50%.)
  // ─────────────────────────────────────────────────────────────────────────────

  // Shared per-action interest formulas. Both human endpoints and the CPU
  // recruiter call these so the math is guaranteed to be identical.
  function computeEmailGain(recruit: any, team: any, coach: any, topic: string) {
    const baseGain = 3 + Math.floor(Math.random() * 5);
    const { bonus: priorityBonus, matchLevel } = calculatePriorityBonus(topic, recruit, team);
    const schoolBonus = calculateSchoolBonus(topic, team);
    const coachBonus = calculateCoachBonus(coach, recruit, "email");
    const proximityBonus = topic === "proximity" ? calculateProximityBonus(recruit.homeState, team.state) : 1.0;
    // Cap at 4.5× to prevent a single email from being dominant
    const totalMultiplier = Math.min(4.5, priorityBonus * schoolBonus * coachBonus * proximityBonus);
    const interestGain = Math.max(1, Math.round(baseGain * totalMultiplier));
    return { baseGain, interestGain, matchLevel, totalMultiplier };
  }
  function computePhoneGain(recruit: any, team: any, coach: any, topics: string[]) {
    let totalInterestGain = 0;
    const pitchResults: { topic: string; gain: number; matchLevel: string }[] = [];
    for (const topic of topics) {
      const baseGain = 3 + Math.floor(Math.random() * 7);
      const { bonus: priorityBonus, matchLevel } = calculatePriorityBonus(topic, recruit, team);
      const schoolBonus = calculateSchoolBonus(topic, team);
      const coachBonus = calculateCoachBonus(coach, recruit, "phone");
      const proximityBonus = topic === "proximity" ? calculateProximityBonus(recruit.homeState, team.state) : 1.0;
      // Cap per-topic at 4.5× (same as email) so multi-topic calls don't stack absurdly
      const topicMultiplier = Math.min(4.5, priorityBonus * schoolBonus * coachBonus * proximityBonus);
      const gain = Math.max(1, Math.round(baseGain * topicMultiplier));
      // Sanity-check each topic individually (avoids false positives from aggregate base averaging)
      assertInterestGainSane(`phone:${topic}`, gain, baseGain);
      totalInterestGain += gain;
      pitchResults.push({ topic, gain, matchLevel });
    }
    return { totalInterestGain, pitchResults };
  }
  function computeVisitGain(recruit: any, team: any, coach: any) {
    const baseGain = 20 + Math.floor(Math.random() * 16);
    // Use normalized attr bonuses (0.80–1.25) instead of raw attr/5 (0.2–2.0)
    const facilitiesBonus = normalizeAttrBonus(team.facilities || 5);
    const academicsBonus  = normalizeAttrBonus(team.academics  || 5);
    const prestigeBonus   = normalizeAttrBonus(team.prestige   || 5);
    const collegeLifeBonus = normalizeAttrBonus(team.collegeLife || 5);
    const schoolAttrBonus = (facilitiesBonus + academicsBonus + prestigeBonus + collegeLifeBonus) / 4;
    const coachBonus = calculateCoachBonus(coach, recruit, "visit");
    const { bonus: priorityBonus } = calculatePriorityBonus("facilities", recruit, team);
    const proximityBonus = calculateProximityBonus(recruit.homeState, team.state);
    // Cap at 3.0× — visits already have a large base (20–35); compound extremes would eclipse everything else
    const totalMultiplier = Math.min(3.0, schoolAttrBonus * coachBonus * priorityBonus * proximityBonus);
    const interestGain = Math.max(5, Math.round(baseGain * totalMultiplier));
    return { baseGain, interestGain, totalMultiplier };
  }
  function computeHeadCoachVisitGain(recruit: any, team: any, coach: any) {
    const baseGain = 25 + Math.floor(Math.random() * 16);
    const coachBonus = calculateCoachBonus(coach, recruit, "head_coach_visit");
    const levelBonus = 1.0 + ((coach?.level || 1) - 1) * 0.03;
    const { bonus: priorityBonus } = calculatePriorityBonus("prestige", recruit, team);
    const proximityBonus = calculateProximityBonus(recruit.homeState, team.state);
    // Cap at 3.0× — HC visit is the premium action; base alone (25–40) is strong
    const totalMultiplier = Math.min(3.0, coachBonus * levelBonus * priorityBonus * proximityBonus);
    const interestGain = Math.max(5, Math.round(baseGain * totalMultiplier));
    return { baseGain, interestGain, totalMultiplier };
  }
  function computeOfferGain(recruit: any, team: any, coach: any) {
    const baseGain = 15 + Math.floor(Math.random() * 10);
    // Normalized prestige bonus: 0.80–1.25 (was raw prestige/5 = 0.2–2.0)
    const prestigeBonus = normalizeAttrBonus(team.prestige || 5);
    const coachBonus = calculateCoachBonus(coach, recruit, "offer");
    const { bonus: priorityBonus } = calculatePriorityBonus("playingTime", recruit, team);
    // Cap at 3.0× — offer is primarily gated, not a primary gain engine
    const totalMultiplier = Math.min(3.0, prestigeBonus * coachBonus * priorityBonus);
    const interestGain = Math.max(2, Math.round(baseGain * totalMultiplier));
    return { baseGain, interestGain };
  }

  // Recruiting action: phone call with up to 3 pitch topics
  app.post("/api/leagues/:id/recruiting/:recruitId/phone", requireAuth, async (req, res) => {
    try {
      const { pitchTopic, pitchTopics } = req.body || {};
      const topics: string[] = pitchTopics && Array.isArray(pitchTopics) && pitchTopics.length > 0 
        ? pitchTopics.slice(0, 3) 
        : [pitchTopic || "reputation"];
      
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const existingActions = await storage.getRecruitingActionsLog(req.params.recruitId as string, userTeam.id);
      const phoneThisWeek = existingActions.filter(a => 
        a.actionType === "phone" && a.week === league.currentWeek && a.season === league.currentSeason
      );
      if (phoneThisWeek.length >= 1) {
        return res.status(400).json({ message: "You've already called this recruit this week. Max 1 phone call per recruit per week." });
      }

      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      const phoneCost = getActionPointCost("phone", userTeam.state, recruit.homeState);
      if ((userCoach?.recruitActionsUsed || 0) + phoneCost > maxRecruitingActions) {
        return res.status(400).json({ message: `Phone calls cost ${phoneCost} recruiting points. You don't have enough points remaining this week.` });
      }

      const { totalInterestGain, pitchResults } = computePhoneGain(recruit, userTeam, userCoach, topics);

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: totalInterestGain,
        });
      } else {
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + totalInterestGain),
        });
      }

      const phoneTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const phoneUserTopSchool = phoneTopSchools.find(ts => ts.teamId === userTeam.id);
      if (phoneUserTopSchool) {
        await storage.updateRecruitTopSchool(phoneUserTopSchool.id, { 
          accumulatedInterest: (phoneUserTopSchool.accumulatedInterest || 0) + totalInterestGain 
        });
      }

      // Per-topic sanity checks already run inside computePhoneGain; no aggregate check needed here.
      const topicSummary = pitchResults.map(p => `${p.topic} (${p.matchLevel}, +${p.gain}%)`).join(", ");
      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "phone",
        interestChange: totalInterestGain,
        notes: `Phone call: ${topicSummary}`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: (userCoach.recruitActionsUsed || 0) + phoneCost,
        });
      }

      const actionsRemaining = maxRecruitingActions - ((userCoach?.recruitActionsUsed || 0) + phoneCost);
      res.json({ 
        interest, 
        interestGain: totalInterestGain, 
        pitchResults,
        actionsRemaining,
      });
    } catch (error) {
      console.error("Failed to make phone call:", error);
      res.status(500).json({ message: "Failed to make phone call" });
    }
  });

  // Recruiting action: email with pitch topic
  app.post("/api/leagues/:id/recruiting/:recruitId/email", requireAuth, async (req, res) => {
    try {
      const { pitchTopic } = req.body || {};
      
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const existingEmailActions = await storage.getRecruitingActionsLog(req.params.recruitId as string, userTeam.id);
      const emailThisWeek = existingEmailActions.filter(a => 
        a.actionType === "email" && a.week === league.currentWeek && a.season === league.currentSeason
      );
      if (emailThisWeek.length >= 1) {
        return res.status(400).json({ message: "You've already emailed this recruit this week. Max 1 email per recruit per week." });
      }

      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      if ((userCoach?.recruitActionsUsed || 0) >= maxRecruitingActions) {
        return res.status(400).json({ message: `You've used all ${maxRecruitingActions} recruiting points this week` });
      }

      // Calculate interest gain with modifiers (email is less effective than phone)
      const topic = pitchTopic || "reputation";
      const { baseGain, interestGain, matchLevel, totalMultiplier } = computeEmailGain(recruit, userTeam, userCoach, topic);
      assertInterestGainSane("email", interestGain, baseGain);

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: interestGain,
        });
      } else {
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
        });
      }

      // Sync top schools interest
      const emailTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const emailUserTopSchool = emailTopSchools.find(ts => ts.teamId === userTeam.id);
      if (emailUserTopSchool) {
        await storage.updateRecruitTopSchool(emailUserTopSchool.id, { 
          accumulatedInterest: (emailUserTopSchool.accumulatedInterest || 0) + interestGain 
        });
      }

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "email",
        interestChange: interestGain,
        notes: `Email about ${topic} (${matchLevel} priority, +${interestGain}%)`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: (userCoach.recruitActionsUsed || 0) + 1,
        });
      }

      const actionsRemaining = maxRecruitingActions - ((userCoach?.recruitActionsUsed || 0) + 1);
      res.json({ 
        interest, 
        interestGain, 
        pitchTopic: topic, 
        matchLevel,
        multiplier: totalMultiplier.toFixed(2),
        actionsRemaining,
      });
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });
  
  // Recruiting action: campus visit (high value, limited uses)
  app.post("/api/leagues/:id/recruiting/:recruitId/visit", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const actionCost = getActionPointCost("visit", userTeam.state, recruit.homeState);
      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      const actionsUsed = userCoach?.recruitActionsUsed || 0;
      if (actionsUsed + actionCost > maxRecruitingActions) {
        return res.status(400).json({ message: `Campus Visit costs ${actionCost} recruiting points. You only have ${maxRecruitingActions - actionsUsed} remaining.` });
      }

      const existingActions = await storage.getRecruitingActionsLog(req.params.recruitId as string, userTeam.id);
      const previousVisit = existingActions.find(a => a.actionType === "visit");
      if (previousVisit) {
        return res.status(400).json({ message: "You've already used your Campus Visit for this recruit. This action can only be done once per recruit." });
      }

      const { baseGain, interestGain, totalMultiplier } = computeVisitGain(recruit, userTeam, userCoach);
      assertInterestGainSane("visit", interestGain, baseGain);

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: interestGain,
        });
      } else {
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
        });
      }

      const visitTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const visitUserTopSchool = visitTopSchools.find(ts => ts.teamId === userTeam.id);
      if (visitUserTopSchool) {
        await storage.updateRecruitTopSchool(visitUserTopSchool.id, { 
          accumulatedInterest: (visitUserTopSchool.accumulatedInterest || 0) + interestGain 
        });
      }

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "visit",
        interestChange: interestGain,
        notes: `Campus Visit (+${interestGain}% interest) [Costs ${actionCost} points]`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: actionsUsed + actionCost,
        });
      }

      const actionsRemaining = maxRecruitingActions - (actionsUsed + actionCost);
      res.json({ 
        interest, 
        interestGain,
        multiplier: totalMultiplier.toFixed(2),
        actionsRemaining,
        actionCost,
      });
    } catch (error) {
      console.error("Failed to schedule visit:", error);
      res.status(500).json({ message: "Failed to schedule visit" });
    }
  });

  // Recruiting action: Head Coach Visit (premium, 1 per recruit, costs 2 actions)
  app.post("/api/leagues/:id/recruiting/:recruitId/head-coach-visit", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const actionCost = getActionPointCost("head_coach_visit", userTeam.state, recruit.homeState);
      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      const actionsUsed = userCoach?.recruitActionsUsed || 0;
      if (actionsUsed + actionCost > maxRecruitingActions) {
        return res.status(400).json({ message: `Head Coach Visit costs ${actionCost} recruiting points. You only have ${maxRecruitingActions - actionsUsed} remaining.` });
      }

      const existingActions = await storage.getRecruitingActionsLog(req.params.recruitId as string, userTeam.id);
      const previousHCV = existingActions.find(a => a.actionType === "head_coach_visit");
      if (previousHCV) {
        return res.status(400).json({ message: "You've already used your Head Coach Visit for this recruit. This action can only be done once per recruit." });
      }

      const { baseGain, interestGain, totalMultiplier } = computeHeadCoachVisitGain(recruit, userTeam, userCoach);
      assertInterestGainSane("head_coach_visit", interestGain, baseGain);

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: interestGain,
        });
      } else {
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
        });
      }

      const hcvTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const hcvUserTopSchool = hcvTopSchools.find(ts => ts.teamId === userTeam.id);
      if (hcvUserTopSchool) {
        await storage.updateRecruitTopSchool(hcvUserTopSchool.id, { 
          accumulatedInterest: (hcvUserTopSchool.accumulatedInterest || 0) + interestGain 
        });
      }

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "head_coach_visit",
        interestChange: interestGain,
        notes: `Head Coach Visit (+${interestGain}% interest) [Costs ${actionCost} points]`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: actionsUsed + actionCost,
        });
      }

      const actionsRemaining = maxRecruitingActions - (actionsUsed + actionCost);
      res.json({ 
        interest, 
        interestGain,
        multiplier: totalMultiplier.toFixed(2),
        actionsRemaining,
        actionCost,
      });
    } catch (error) {
      console.error("Failed to schedule head coach visit:", error);
      res.status(500).json({ message: "Failed to schedule head coach visit" });
    }
  });

  // Recruiting action: offer scholarship
  app.post("/api/leagues/:id/recruiting/:recruitId/offer", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const maxRecruitingActions = getMaxRecruitingActions(userCoach);
      if ((userCoach?.recruitActionsUsed || 0) >= maxRecruitingActions) {
        return res.status(400).json({ message: `You've used all ${maxRecruitingActions} recruiting points this week` });
      }

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      const { baseGain, interestGain } = computeOfferGain(recruit, userTeam, userCoach);
      assertInterestGainSane("offer", interestGain, baseGain);
      
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId as string,
          teamId: userTeam.id,
          interestLevel: interestGain,
          hasOffer: true,
        });
      } else {
        if (interest.hasOffer) {
          return res.status(400).json({ message: "Already offered scholarship" });
        }
        interest = await storage.updateRecruitingInterest(interest.id, {
          interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
          hasOffer: true,
        });
      }

      // Sync top schools interest
      const offerTopSchools = await storage.getRecruitTopSchools(req.params.recruitId as string);
      const offerUserTopSchool = offerTopSchools.find(ts => ts.teamId === userTeam.id);
      if (offerUserTopSchool) {
        await storage.updateRecruitTopSchool(offerUserTopSchool.id, { 
          accumulatedInterest: (offerUserTopSchool.accumulatedInterest || 0) + interestGain 
        });
      }

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "offer",
        interestChange: interestGain,
        notes: `Offered scholarship (+${interestGain}% interest)`,
      });

      if (userCoach) {
        await storage.updateCoach(userCoach.id, {
          recruitActionsUsed: (userCoach.recruitActionsUsed || 0) + 1,
        });
      }

      const actionsRemaining = maxRecruitingActions - ((userCoach?.recruitActionsUsed || 0) + 1);
      res.json({ interest, interestGain, actionsRemaining });
    } catch (error) {
      console.error("Failed to offer scholarship:", error);
      res.status(500).json({ message: "Failed to offer scholarship" });
    }
  });

  app.post("/api/leagues/:id/recruiting/:recruitId/target", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const userTeam = leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      let interest = await storage.getRecruitingInterest(req.params.recruitId, userTeam.id);
      
      if (!interest) {
        const allInterests = await storage.getRecruitingInterestsByTeam(userTeam.id);
        const currentTargets = allInterests.filter(i => i.isTargeted).length;
        if (currentTargets >= 20) {
          return res.status(400).json({ message: "Maximum 20 targets reached. Remove a target first." });
        }
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId,
          teamId: userTeam.id,
          isTargeted: true,
        });
      } else {
        if (!interest.isTargeted) {
          const allInterests = await storage.getRecruitingInterestsByTeam(userTeam.id);
          const currentTargets = allInterests.filter(i => i.isTargeted).length;
          if (currentTargets >= 20) {
            return res.status(400).json({ message: "Maximum 20 targets reached. Remove a target first." });
          }
        }
        interest = await storage.updateRecruitingInterest(interest.id, {
          isTargeted: !interest.isTargeted,
        });
      }

      res.json(interest);
    } catch (error) {
      console.error("Failed to target recruit:", error);
      res.status(500).json({ message: "Failed to target recruit" });
    }
  });

  // Update recruit notes
  app.patch("/api/leagues/:id/recruiting/:recruitId/notes", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const userTeam = leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const { notes } = req.body;
      if (typeof notes !== "string") {
        return res.status(400).json({ message: "Notes must be a string" });
      }

      const interest = await storage.getRecruitingInterest(req.params.recruitId, userTeam.id);
      if (!interest) {
        return res.status(404).json({ message: "Recruit interest not found" });
      }

      await storage.updateRecruitingInterest(interest.id, { notes: notes || null });
      const updated = await storage.getRecruitingInterest(req.params.recruitId, userTeam.id);
      
      res.json(updated);
    } catch (error) {
      console.error("Failed to update notes:", error);
      res.status(500).json({ message: "Failed to update notes" });
    }
  });

  app.patch("/api/leagues/:id/recruiting/:recruitId/board-rank", requireAuth, async (req, res) => {
    try {
      const [leagueTeams, coaches] = await Promise.all([
        storage.getTeamsByLeague(req.params.id),
        storage.getCoachesByLeague(req.params.id),
      ]);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const userTeam = leagueTeams.find((t) => t.id === userCoach?.teamId);

      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const { boardRank } = req.body;
      if (boardRank !== null && boardRank !== undefined) {
        if (typeof boardRank !== "number" || !Number.isInteger(boardRank) || boardRank < 1 || boardRank > 99) {
          return res.status(400).json({ message: "boardRank must be an integer between 1 and 99, or null" });
        }
      }

      let interest = await storage.getRecruitingInterest(req.params.recruitId, userTeam.id);
      if (!interest) {
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId,
          teamId: userTeam.id,
          interestLevel: 0,
          scoutPercentage: 0,
          isTargeted: false,
          hasOffer: false,
          revealedAttributes: [],
          minOverall: 1,
          maxOverall: 999,
          minStar: 1,
          maxStar: 5,
          revealedAbilitiesCount: 0,
          notes: null,
          boardRank: boardRank ?? null,
        });
        return res.json(interest);
      }

      await storage.updateRecruitingInterest(interest.id, { boardRank: boardRank ?? null });
      const updated = await storage.getRecruitingInterest(req.params.recruitId, userTeam.id);

      res.json(updated);
    } catch (error) {
      console.error("Failed to update board rank:", error);
      res.status(500).json({ message: "Failed to update board rank" });
    }
  });

  // Sign/commit a recruit to your team
  app.post("/api/leagues/:id/recruiting/:recruitId/sign", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      const userCoach = coaches.find((c) => c.userId === userId);
      
      if (!userCoach || !userCoach.teamId) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const userTeam = leagueTeams.find((t) => t.id === userCoach.teamId);
      if (!userTeam) {
        return res.status(400).json({ message: "Team not found" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      if (recruit.signedTeamId) {
        return res.status(400).json({ message: "Recruit already signed to a team" });
      }

      const roster = await storage.getPlayersByTeam(userTeam.id);
      const leagueRecruits = await storage.getRecruitsByLeague(req.params.id as string);
      const currentCommits = leagueRecruits.filter(r => r.signedTeamId === userTeam.id).length;
      const departingCount = roster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained").length;
      const portalCount = roster.filter(p => p.inTransferPortal).length;
      const projectedSize = roster.length - departingCount - portalCount + currentCommits + 1;
      if (projectedSize > 30) {
        return res.status(400).json({ message: "Roster would exceed 30-player limit. Release or manage your roster before signing more recruits." });
      }

      // Sign the recruit
      const updatedRecruit = await storage.updateRecruit(recruit.id, {
        signedTeamId: userTeam.id,
        stage: "signed",
      });

      // Award XP to the coach for signing a recruit
      const SIGN_XP_BASE = 50;
      const starBonus = (recruit.starRank || 1) * 25; // 25 extra per star
      const signXp = SIGN_XP_BASE + starBonus;
      
      const newXp = userCoach.xp + signXp;
      const newLevel = Math.floor(newXp / 1000) + 1;
      const skillPointsGained = newLevel > userCoach.level ? 1 : 0;
      
      await storage.updateCoach(userCoach.id, {
        xp: newXp,
        level: newLevel,
        skillPoints: userCoach.skillPoints + skillPointsGained,
      });

      await storage.createAuditLog({
        leagueId: req.params.id,
        userId: req.session.userId,
        action: "Recruit Signed",
        details: `Signed ${recruit.firstName} ${recruit.lastName} (${recruit.starRank}-star ${recruit.position})`,
      });

      try {
        const league = await storage.getLeague(req.params.id);
        await generateRecruitCommitNewsArticle(
          req.params.id,
          `${recruit.firstName} ${recruit.lastName}`,
          recruit.starRank || 3,
          recruit.position,
          recruit.homeState,
          recruit.hometown,
          userTeam,
          recruit.overall,
          recruit.classRank,
          league?.currentSeason || 1,
          league?.currentWeek
        );
        const stars = "★".repeat(recruit.starRank || 1);
        await storage.createLeagueEvent({
          leagueId: req.params.id,
          teamId: userTeam.id,
          teamName: userTeam.name,
          teamAbbreviation: userTeam.abbreviation,
          eventType: "SIGNING",
          description: `${userTeam.name} signed ${recruit.firstName} ${recruit.lastName} (${recruit.position}, ${stars} ${recruit.homeState || ""})`,
          season: league?.currentSeason || 1,
          week: league?.currentWeek || 1,
        });
      } catch (e) {
        console.error("Recruit commit news error:", e);
      }

      res.json(updatedRecruit);
    } catch (error) {
      console.error("Failed to sign recruit:", error);
      res.status(500).json({ message: "Failed to sign recruit" });
    }
  });

  // Get all commits (signed recruits) for all teams in a league
  app.get("/api/leagues/:id/commits", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const recruits = await storage.getRecruitsByLeague(league.id);
      
      // Group signed recruits by team
      const signedRecruits = recruits.filter(r => r.signedTeamId);
      
      const commitsByTeam = leagueTeams.map(team => {
        const teamCommits = signedRecruits.filter(r => r.signedTeamId === team.id);
        const avgStarRating = teamCommits.length > 0 
          ? teamCommits.reduce((sum, r) => sum + (r.starRating || 3), 0) / teamCommits.length 
          : 0;
        const avgOverall = teamCommits.length > 0
          ? teamCommits.reduce((sum, r) => sum + (r.overall || 300), 0) / teamCommits.length
          : 0;
        const fiveStars = teamCommits.filter(r => r.starRating === 5).length;
        const fourStars = teamCommits.filter(r => r.starRating >= 4).length;
        const classScore = teamCommits.length > 0
          ? (avgStarRating * 20) + (avgOverall / 50) + (fiveStars * 15) + (fourStars * 5) + (teamCommits.length * 3)
          : 0;
        return {
          team: {
            id: team.id,
            name: team.name,
            abbreviation: team.abbreviation,
            primaryColor: team.primaryColor,
            secondaryColor: team.secondaryColor,
            prestige: team.prestige,
            isCpu: team.isCpu,
          },
          commits: teamCommits.map(r => ({
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            position: r.position,
            starRating: r.starRating,
            overall: r.overall,
            classRank: r.classRank,
            positionRank: r.positionRank,
            homeState: r.homeState,
            hometown: r.hometown,
            recruitType: r.recruitType,
          })),
          commitCount: teamCommits.length,
          avgStarRating,
          avgOverall,
          fiveStars,
          fourStars,
          classScore,
          classRank: 0,
        };
      }).sort((a, b) => b.classScore - a.classScore);

      let rankCounter = 1;
      commitsByTeam.forEach((t) => {
        if (t.commitCount > 0) {
          t.classRank = rankCounter++;
        }
      });

      res.json({
        league: { id: league.id, name: league.name, currentSeason: league.currentSeason, currentPhase: league.currentPhase },
        commitsByTeam,
        totalCommits: signedRecruits.length,
        totalRecruits: recruits.length,
      });
    } catch (error) {
      console.error("Failed to fetch commits:", error);
      res.status(500).json({ message: "Failed to fetch commits" });
    }
  });

  // Signing-day reveal: full recruit data for signed recruits on a team
  app.get("/api/leagues/:id/signing-day-reveal", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const teamId = req.query.teamId as string | undefined;
      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const recruits = await storage.getRecruitsByLeague(league.id);
      const signedRecruits = recruits.filter(r => r.signedTeamId);

      // Resolve the authenticated user's team so the UI can default to it
      let myTeamId: string | null = null;
      if (req.session.userId && !req.session.isGuest) {
        const leagueCoaches = await storage.getCoachesByLeague(league.id);
        const myCoach = leagueCoaches.find(c => c.userId === req.session.userId);
        if (myCoach?.teamId) myTeamId = myCoach.teamId;
      }

      const targetTeams = teamId
        ? leagueTeams.filter(t => t.id === teamId)
        : leagueTeams;

      const teamData = targetTeams.map(team => {
        const teamRecruits = signedRecruits.filter(r => r.signedTeamId === team.id);
        return {
          team: {
            id: team.id,
            name: team.name,
            abbreviation: team.abbreviation,
            primaryColor: team.primaryColor,
            secondaryColor: team.secondaryColor,
            conference: team.conference,
            prestige: team.prestige,
            isCpu: team.isCpu,
          },
          recruits: teamRecruits.map(r => ({
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            position: r.position,
            throwHand: r.throwHand,
            batHand: r.batHand,
            homeState: r.homeState,
            hometown: r.hometown,
            starRating: r.starRating,
            overall: r.overall,
            classRank: r.classRank,
            positionRank: r.positionRank,
            recruitType: r.recruitType,
            recruitYear: r.recruitYear,
            isBlueChip: r.isBlueChip,
            isGem: r.isGem,
            isBust: r.isBust,
            isGenerationalGem: r.isGenerationalGem,
            isGenerationalBust: r.isGenerationalBust,
            gemBustRevealed: r.gemBustRevealed,
            potential: r.potential,
            abilities: r.abilities,
            hitForAvg: r.hitForAvg,
            power: r.power,
            speed: r.speed,
            arm: r.arm,
            fielding: r.fielding,
            errorResistance: r.errorResistance,
            clutch: r.clutch,
            stealing: r.stealing,
            running: r.running,
            throwing: r.throwing,
            recovery: r.recovery,
            catcherAbility: r.catcherAbility,
            vsLHP: r.vsLHP,
            grit: r.grit,
            velocity: r.velocity,
            control: r.control,
            stamina: r.stamina,
            stuff: r.stuff,
            wRISP: r.wRISP,
            vsLefty: r.vsLefty,
            poise: r.poise,
            heater: r.heater,
            agile: r.agile,
            skinTone: r.skinTone,
            hairColor: r.hairColor,
            hairStyle: r.hairStyle,
            facialHair: r.facialHair,
            eyeBlack: r.eyeBlack,
            headwear: r.headwear,
            fromTeamName: r.fromTeamName,
          })),
        };
      });

      res.json({
        league: { id: league.id, name: league.name, currentSeason: league.currentSeason },
        teamData,
        myTeamId,
        allTeams: leagueTeams.map(t => ({
          id: t.id,
          name: t.name,
          abbreviation: t.abbreviation,
          primaryColor: t.primaryColor,
          secondaryColor: t.secondaryColor,
          isCpu: t.isCpu,
        })),
      });
    } catch (error) {
      console.error("Failed to fetch signing-day reveal data:", error);
      res.status(500).json({ message: "Failed to fetch reveal data" });
    }
  });

  // Mark signed recruits as revealed after the coach watches the Signing Day Reveal screen.
  // Accepts optional ?teamId= to reveal only one team's class at a time.
  app.post("/api/leagues/:id/signing-day-reveal/complete", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      // Enforce league membership: caller must be a coach in this league
      const userId = req.session.userId;
      const leagueCoaches = await storage.getCoachesByLeague(league.id);
      const isMember = leagueCoaches.some(c => c.userId === userId);
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this league" });
      }

      const teamId = req.query.teamId as string | undefined;

      // Validate teamId belongs to this league if provided
      if (teamId) {
        const leagueTeams = await storage.getTeamsByLeague(league.id);
        const validTeam = leagueTeams.some(t => t.id === teamId);
        if (!validTeam) {
          return res.status(400).json({ message: "Team not found in this league" });
        }
      }

      const recruits = await storage.getRecruitsByLeague(league.id);
      const toReveal = recruits.filter(r =>
        r.signedTeamId &&
        !r.signingDayRevealed &&
        (!teamId || r.signedTeamId === teamId)
      );

      for (const r of toReveal) {
        await storage.updateRecruit(r.id, { signingDayRevealed: true });
        // Also unlock exact OVR and full abilities in every team's recruiting_interests row
        const interests = await storage.getRecruitingInterestsByRecruit(r.id);
        const totalAbilities = (r.abilities as string[] || []).length;
        for (const interest of interests) {
          await storage.updateRecruitingInterest(interest.id, {
            minOverall: r.overall,
            maxOverall: r.overall,
            revealedAbilitiesCount: totalAbilities,
          });
        }
      }

      console.log(`[signing-day-reveal/complete] Set signingDayRevealed=true for ${toReveal.length} recruits` +
        (teamId ? ` (teamId=${teamId})` : " (all teams)"));

      res.json({ revealed: toReveal.length });
    } catch (error) {
      console.error("Failed to complete signing-day reveal:", error);
      res.status(500).json({ message: "Failed to complete reveal" });
    }
  });

  // Roster routes
  app.get("/api/leagues/:id/roster", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const requestedTeamId = req.query.teamId as string | undefined;
      
      let team;
      if (requestedTeamId) {
        team = leagueTeams.find((t) => t.id === requestedTeamId);
        if (!team) {
          return res.status(404).json({ message: "Team not found" });
        }
      } else {
        const userId = req.session.userId;
        const coaches = await storage.getCoachesByLeague(req.params.id);
        const userCoach = coaches.find((c) => c.userId === userId);
        team = userCoach ? leagueTeams.find((t) => t.id === userCoach.teamId) : leagueTeams.find((t) => !t.isCpu);
      }
      
      if (!team) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const teamPlayers = await storage.getPlayersByTeam(team.id);
      
      // Filter out players who have declared for the draft or are otherwise flagged as departing
      const activePlayers = teamPlayers.filter(p => !p.declaredForDraft && !p.pendingDeparture);

      res.json({
        players: activePlayers,
        team: team,
      });
    } catch (error) {
      console.error("Failed to fetch roster:", error);
      res.status(500).json({ message: "Failed to fetch roster" });
    }
  });

  // Get single player by id
  app.get("/api/leagues/:id/players/:playerId", requireAuth, async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.playerId);
      if (!player) return res.status(404).json({ message: "Player not found" });
      res.json(player);
    } catch (error) {
      console.error("Failed to fetch player:", error);
      res.status(500).json({ message: "Failed to fetch player" });
    }
  });

  // Update player (commissioner only)
  app.patch("/api/leagues/:id/players/:playerId", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can edit players" });
      }

      const player = await storage.getPlayer(req.params.playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      const mergedPlayer = { ...player, ...req.body };
      // Recalculate OVR using the new (merged) position — converted players get the
      // correct positional attribute weights applied immediately.
      const recalcedOverall = calculateOVR(mergedPlayer);
      const recalcedStar = getStarRatingFromOVR(recalcedOverall);
      const positionChanged = req.body.position != null && req.body.position !== player.position;
      const shouldSetOriginal = positionChanged && !player.originalPosition;
      const updated = await storage.updatePlayer(req.params.playerId, {
        ...req.body,
        overall: recalcedOverall,
        starRating: recalcedStar,
        ...(shouldSetOriginal ? { originalPosition: player.position } : {}),
      });

      // Sync the current-season stat row's position so the career stats display
      // immediately reflects the new position after conversion.
      if (positionChanged) {
        await storage.updatePlayerSeasonStatsPosition(
          req.params.playerId,
          req.params.id,
          league.currentSeason,
          req.body.position,
        );
      }
      
      await storage.createAuditLog({
        leagueId: req.params.id,
        userId: req.session.userId,
        action: "Player Edited",
        details: `Edited player ${player.firstName} ${player.lastName}`,
      });

      res.json(updated);
    } catch (error) {
      console.error("Failed to update player:", error);
      res.status(500).json({ message: "Failed to update player" });
    }
  });

  // Declare player for draft (commissioner or owning coach)
  app.post("/api/leagues/:id/players/:playerId/declare-draft", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const player = await storage.getPlayer(req.params.playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Check if player's team belongs to this league
      const team = await storage.getTeam(player.teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Verify team belongs to the league in the URL
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === team.id);
      if (!teamBelongsToLeague) {
        return res.status(404).json({ message: "Player not found in this league" });
      }

      // Check if user is commissioner or owns this player's team
      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      const isTeamCoach = userCoach && team && userCoach.teamId === team.id;
      
      if (!isCommissioner && !isTeamCoach) {
        return res.status(403).json({ message: "Only the commissioner or team coach can declare players for draft" });
      }

      // Check eligibility: must be RS (redshirt) and at least sophomore level with high skill
      // RS eligibility format: "RS" for redshirt freshmen who haven't played
      // High skill = 4 or 5 star rating OR overall >= 500
      const isRedshirt = player.eligibility === "RS";
      const isHighSkill = player.starRating >= 4 || player.overall >= 500;
      
      // For RS sophomores - eligibility would still show RS but they've had a year
      // In reality, RS players who are sophomores or higher (played 2+ years) can declare
      // Since we use RS as a blanket term, we'll check for high skill + RS eligibility
      
      if (!isRedshirt) {
        return res.status(400).json({ 
          message: "Only redshirt players can declare for the draft early" 
        });
      }

      if (!isHighSkill) {
        return res.status(400).json({ 
          message: "Only high-skill players (4+ stars or 500+ overall) can declare for the draft" 
        });
      }

      if (player.declaredForDraft) {
        return res.status(400).json({ message: "Player has already declared for the draft" });
      }

      // Update player to mark as declared for draft
      const updated = await storage.updatePlayer(req.params.playerId, {
        declaredForDraft: true,
        draftDeclarationDate: new Date(),
      });

      await storage.createAuditLog({
        leagueId: req.params.id,
        userId: req.session.userId,
        action: "Draft Declaration",
        details: `${player.firstName} ${player.lastName} (${team?.abbreviation || 'Unknown'}) declared for the MLB Draft`,
      });

      try {
        const leagueForEvent = await storage.getLeague(req.params.id);
        await storage.createLeagueEvent({
          leagueId: req.params.id,
          teamId: team?.id,
          teamName: team?.name,
          teamAbbreviation: team?.abbreviation,
          eventType: "DRAFT",
          description: `${player.firstName} ${player.lastName} (${player.position}, ${team?.abbreviation || "UNK"}) declared for the MLB Draft`,
          season: leagueForEvent?.currentSeason || 1,
          week: leagueForEvent?.currentWeek || 1,
        });
      } catch (e) { console.error("League event error:", e); }

      res.json({ 
        success: true, 
        message: `${player.firstName} ${player.lastName} has declared for the MLB Draft`,
        player: updated 
      });
    } catch (error) {
      console.error("Failed to declare player for draft:", error);
      res.status(500).json({ message: "Failed to declare player for draft" });
    }
  });

  // Enter player into transfer portal (commissioner or owning coach)
  app.post("/api/leagues/:id/players/:playerId/enter-portal", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const player = await storage.getPlayer(req.params.playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Check if player's team belongs to this league
      const team = await storage.getTeam(player.teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === team.id);
      if (!teamBelongsToLeague) {
        return res.status(404).json({ message: "Player not found in this league" });
      }

      // Check if user is commissioner or owns this player's team
      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      const isTeamCoach = userCoach && userCoach.teamId === team.id;
      
      if (!isCommissioner && !isTeamCoach) {
        return res.status(403).json({ message: "Only the commissioner or team coach can enter players into the transfer portal" });
      }

      if (player.inTransferPortal) {
        return res.status(400).json({ message: "Player is already in the transfer portal" });
      }

      if (player.declaredForDraft) {
        return res.status(400).json({ message: "Player has already declared for the draft" });
      }

      // Seniors cannot enter portal (they're graduating)
      if (player.eligibility === "Sr") {
        return res.status(400).json({ message: "Seniors cannot enter the transfer portal" });
      }

      const { reason } = req.body as { reason?: string };

      const updated = await storage.updatePlayer(req.params.playerId, {
        inTransferPortal: true,
        portalEntryDate: new Date(),
        portalReason: reason || "Seeking new opportunity",
      });

      await storage.createAuditLog({
        leagueId: req.params.id,
        userId: req.session.userId,
        action: "Transfer Portal Entry",
        details: `${player.firstName} ${player.lastName} (${team.abbreviation}) entered the transfer portal${reason ? `: ${reason}` : ''}`,
      });

      try {
        const leagueForEvent = await storage.getLeague(req.params.id);
        await storage.createLeagueEvent({
          leagueId: req.params.id,
          teamId: team.id,
          teamName: team.name,
          teamAbbreviation: team.abbreviation,
          eventType: "TRANSFER",
          description: `${player.firstName} ${player.lastName} (${player.position}, ${team.abbreviation}) entered the transfer portal`,
          season: leagueForEvent?.currentSeason || 1,
          week: leagueForEvent?.currentWeek || 1,
        });
      } catch (e) { console.error("League event error:", e); }

      res.json({ 
        success: true, 
        message: `${player.firstName} ${player.lastName} has entered the transfer portal`,
        player: updated 
      });
    } catch (error) {
      console.error("Failed to enter player into portal:", error);
      res.status(500).json({ message: "Failed to enter player into transfer portal" });
    }
  });

  // Get players leaving (graduates, draft declarations, transfer portal) - summary by team
  app.get("/api/leagues/:id/players-leaving", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const teams = await storage.getTeamsByLeague(req.params.id);
      const playersLeavingByTeam: Record<string, {
        teamId: string;
        teamName: string;
        abbreviation: string;
        primaryColor: string;
        secondaryColor: string;
        graduates: typeof allPlayers;
        draftDeclarations: typeof allPlayers;
        transfers: typeof allPlayers;
        totalLeaving: number;
      }> = {};

      // Initialize for all teams
      for (const team of teams) {
        playersLeavingByTeam[team.id] = {
          teamId: team.id,
          teamName: team.name,
          mascot: team.mascot,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          graduates: [],
          draftDeclarations: [],
          transfers: [],
          totalLeaving: 0,
        };
      }

      // Get all players for all teams
      const allPlayers: Player[] = [];
      for (const team of teams) {
        const teamPlayers = await storage.getPlayersByTeam(team.id);
        allPlayers.push(...teamPlayers);
      }

      // Categorize players
      for (const player of allPlayers) {
        const teamData = playersLeavingByTeam[player.teamId];
        if (!teamData) continue;

        if (player.eligibility === "Sr") {
          teamData.graduates.push(player);
          teamData.totalLeaving++;
        } else if (player.declaredForDraft) {
          teamData.draftDeclarations.push(player);
          teamData.totalLeaving++;
        } else if (player.inTransferPortal) {
          teamData.transfers.push(player);
          teamData.totalLeaving++;
        }
      }

      // Calculate league totals
      const leagueTotals = {
        graduates: Object.values(playersLeavingByTeam).reduce((sum, t) => sum + t.graduates.length, 0),
        draftDeclarations: Object.values(playersLeavingByTeam).reduce((sum, t) => sum + t.draftDeclarations.length, 0),
        transfers: Object.values(playersLeavingByTeam).reduce((sum, t) => sum + t.transfers.length, 0),
        total: Object.values(playersLeavingByTeam).reduce((sum, t) => sum + t.totalLeaving, 0),
      };

      res.json({
        league: { id: league.id, name: league.name, currentSeason: league.currentSeason },
        teams: Object.values(playersLeavingByTeam).sort((a, b) => b.totalLeaving - a.totalLeaving),
        totals: leagueTotals,
      });
    } catch (error) {
      console.error("Failed to get players leaving:", error);
      res.status(500).json({ message: "Failed to get players leaving" });
    }
  });

  // ============ DEPARTURES SYSTEM ============
  
  // Get all departures for the departures screen
  app.get("/api/leagues/:id/departures", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      // Safety net: if we're in offseason_departures but departure flags were never set
      // (e.g. SR-skip path, legacy "offseason" bump, or any other missed transition),
      // trigger processing now so the screen is never empty.
      if (league.currentPhase === "offseason_departures") {
        const existingPending = await storage.getPendingDeparturesByLeague(req.params.id);
        const hasValidDepartures = existingPending.some(
          p => p.departureType === "graduated" || p.departureType === "draft"
        );
        if (!hasValidDepartures) {
          try {
            await evaluatePlayerPromises(req.params.id, league.currentSeason);
            await processOffseasonDepartures(req.params.id, league.currentSeason);
            console.log(`[departures-GET] safety-net: triggered departure processing for league=${req.params.id} season=${league.currentSeason}`);
          } catch (e) {
            console.error("[departures-GET] safety-net departure processing error:", e);
          }
        }
      }

      const teams = await storage.getTeamsByLeague(req.params.id);
      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const userTeam = teams.find(t => t.id === userCoach?.teamId);

      const departuresByTeam: Record<string, any> = {};

      for (const team of teams) {
        const roster = await storage.getPlayersByTeam(team.id);
        const pending = roster.filter(p => p.pendingDeparture);
        const promises = await storage.getPlayerPromisesByTeam(team.id);

        departuresByTeam[team.id] = {
          teamId: team.id,
          teamName: team.name,
          mascot: team.mascot,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          isCpu: team.isCpu,
          departuresFinalized: team.departuresFinalized,
          nilBudget: team.nilBudget,
          nilSpent: team.nilSpent,
          nilRemaining: team.nilBudget - (team.nilSpent || 0),
          rosterSize: roster.filter(p => !p.pendingDeparture).length,
          graduates: pending.filter(p => p.departureType === "graduated"),
          draftDeclarations: pending.filter(p => p.departureType === "draft"),
          transfers: pending.filter(p => p.departureType === "transfer"),
          promises: promises.filter(p => p.isActive),
        };
      }

      res.json({
        league: { 
          id: league.id, 
          name: league.name, 
          currentSeason: league.currentSeason,
          currentPhase: league.currentPhase,
        },
        userTeamId: userTeam?.id,
        userTeam: userTeam ? departuresByTeam[userTeam.id] : null,
        allTeams: Object.values(departuresByTeam).sort((a: any, b: any) => {
          const aTotal = a.graduates.length + a.draftDeclarations.length + a.transfers.length;
          const bTotal = b.graduates.length + b.draftDeclarations.length + b.transfers.length;
          return bTotal - aTotal;
        }),
      });
    } catch (error) {
      console.error("Failed to get departures:", error);
      res.status(500).json({ message: "Failed to get departures" });
    }
  });

  // Retain a draft-eligible player with NIL offer
  app.post("/api/leagues/:id/departures/retain-draft", requireAuth, async (req, res) => {
    try {
      const { playerId, nilOffer } = req.body;
      if (!playerId || nilOffer === undefined) {
        return res.status(400).json({ message: "playerId and nilOffer are required" });
      }

      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach?.teamId) return res.status(403).json({ message: "No team assigned" });

      const player = await storage.getPlayer(playerId);
      if (!player || !player.pendingDeparture || player.departureType !== "draft") {
        return res.status(400).json({ message: "Player not found or not a draft departure" });
      }
      if (player.teamId !== userCoach.teamId) {
        return res.status(403).json({ message: "Not your player" });
      }
      if (player.retentionStatus === "retained" || player.retentionStatus === "rejected") {
        return res.status(400).json({ message: "Already processed" });
      }

      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });

      const nilRemaining = team.nilBudget - (team.nilSpent || 0);
      if (nilOffer > nilRemaining) {
        return res.status(400).json({ message: `Insufficient NIL budget. You have $${nilRemaining.toLocaleString()} remaining.` });
      }

      const askMin = player.draftAskMin || 50000;
      const askMax = player.draftAskMax || 100000;
      
      let stayChance: number;
      if (nilOffer >= askMax) {
        stayChance = 0.95;
      } else if (nilOffer >= askMin) {
        stayChance = 0.5 + 0.4 * ((nilOffer - askMin) / (askMax - askMin));
      } else if (nilOffer >= askMin * 0.5) {
        stayChance = 0.1 + 0.4 * ((nilOffer) / askMin);
      } else {
        stayChance = 0.1;
      }

      const roll = Math.random();
      const stayed = roll < stayChance;

      if (stayed) {
        await storage.updatePlayer(playerId, {
          pendingDeparture: false,
          departureType: null,
          retentionStatus: "retained",
          declaredForDraft: false,
          nilOffered: nilOffer,
        });
        await storage.updateTeam(team.id, { nilSpent: (team.nilSpent || 0) + nilOffer });
        
        await storage.createAuditLog({
          leagueId: req.params.id,
          userId: req.session.userId,
          action: "Draft Retention: Success",
          details: `${player.firstName} ${player.lastName} retained with $${nilOffer.toLocaleString()} NIL offer.`,
        });
      } else {
        await storage.updatePlayer(playerId, {
          retentionStatus: "rejected",
          nilOffered: nilOffer,
        });
        
        await storage.createAuditLog({
          leagueId: req.params.id,
          userId: req.session.userId,
          action: "Draft Retention: Failed",
          details: `${player.firstName} ${player.lastName} rejected $${nilOffer.toLocaleString()} NIL offer and will enter the MLB Draft.`,
        });
      }

      res.json({ 
        success: stayed, 
        playerId, 
        playerName: `${player.firstName} ${player.lastName}`,
        nilOffer,
        stayChance: Math.round(stayChance * 100),
      });
    } catch (error) {
      console.error("Failed to retain draft player:", error);
      res.status(500).json({ message: "Failed to retain player" });
    }
  });

  // Retain a transfer portal player with NIL + promises
  app.post("/api/leagues/:id/departures/retain-transfer", requireAuth, async (req, res) => {
    try {
      const { playerId, nilOffer, playerPromise, teamPromise } = req.body;
      if (!playerId) {
        return res.status(400).json({ message: "playerId is required" });
      }

      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach?.teamId) return res.status(403).json({ message: "No team assigned" });

      const player = await storage.getPlayer(playerId);
      if (!player || !player.pendingDeparture || player.departureType !== "transfer") {
        return res.status(400).json({ message: "Player not found or not a transfer departure" });
      }
      if (player.teamId !== userCoach.teamId) {
        return res.status(403).json({ message: "Not your player" });
      }
      if (player.retentionStatus === "retained" || player.retentionStatus === "rejected") {
        return res.status(400).json({ message: "Already processed" });
      }

      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });

      const offer = nilOffer || 0;
      const nilRemaining = team.nilBudget - (team.nilSpent || 0);
      if (offer > nilRemaining) {
        return res.status(400).json({ message: `Insufficient NIL budget. You have $${nilRemaining.toLocaleString()} remaining.` });
      }

      // Calculate retention chance
      // Sophomores are easier to retain (2 years of eligibility left); JRs are harder.
      const isSophomore = player.eligibility === "SO";
      let retentionChance = isSophomore ? 0.40 : 0.30; // base

      // NIL bonus (up to +25%)
      if (offer > 0) {
        const nilFactor = Math.min(offer / 200000, 1);
        retentionChance += 0.25 * nilFactor;
      }

      // Player promise bonus (up to +25%)
      const promiseDifficulty: Record<string, number> = {
        easy: 0.10,
        medium: 0.18,
        hard: 0.25,
      };
      if (playerPromise?.type && playerPromise?.difficulty) {
        retentionChance += promiseDifficulty[playerPromise.difficulty] || 0.10;
      }

      // Team promise bonus (up to +20%)
      const teamPromiseDifficulty: Record<string, number> = {
        easy: 0.08,
        medium: 0.14,
        hard: 0.20,
      };
      if (teamPromise?.type && teamPromise?.difficulty) {
        retentionChance += teamPromiseDifficulty[teamPromise.difficulty] || 0.08;
      }

      retentionChance = Math.min(retentionChance, 0.98);

      const roll = Math.random();
      const stayed = roll < retentionChance;

      if (stayed) {
        await storage.updatePlayer(playerId, {
          pendingDeparture: false,
          departureType: null,
          retentionStatus: "retained",
          inTransferPortal: false,
          nilOffered: offer,
        });
        if (offer > 0) {
          await storage.updateTeam(team.id, { nilSpent: (team.nilSpent || 0) + offer });
        }

        // Create promise records if promises were made
        if (playerPromise?.type) {
          await storage.createPlayerPromise({
            leagueId: req.params.id,
            teamId: team.id,
            playerId,
            season: league.currentSeason + 1,
            promiseType: playerPromise.type,
            promiseCategory: "player",
            targetValue: playerPromise.targetValue || playerPromise.difficulty,
            nilAmount: 0,
          });
        }
        if (teamPromise?.type) {
          await storage.createPlayerPromise({
            leagueId: req.params.id,
            teamId: team.id,
            playerId,
            season: league.currentSeason + 1,
            promiseType: teamPromise.type,
            promiseCategory: "team",
            targetValue: teamPromise.targetValue || teamPromise.difficulty,
            nilAmount: 0,
          });
        }

        await storage.createAuditLog({
          leagueId: req.params.id,
          userId: req.session.userId,
          action: "Transfer Retention: Success",
          details: `${player.firstName} ${player.lastName} convinced to stay with $${offer.toLocaleString()} NIL${playerPromise?.type ? ` + ${playerPromise.type} promise` : ""}${teamPromise?.type ? ` + ${teamPromise.type} promise` : ""}.`,
        });
      } else {
        await storage.updatePlayer(playerId, {
          retentionStatus: "rejected",
          nilOffered: offer,
        });

        await storage.createAuditLog({
          leagueId: req.params.id,
          userId: req.session.userId,
          action: "Transfer Retention: Failed",
          details: `${player.firstName} ${player.lastName} rejected retention offer and will enter the transfer portal.`,
        });
      }

      res.json({
        success: stayed,
        playerId,
        playerName: `${player.firstName} ${player.lastName}`,
        nilOffer: offer,
        retentionChance: Math.round(retentionChance * 100),
      });
    } catch (error) {
      console.error("Failed to retain transfer player:", error);
      res.status(500).json({ message: "Failed to retain player" });
    }
  });

  // Finalize departures - mark team as ready (does NOT advance the league phase)
  app.post("/api/leagues/:id/departures/finalize", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      if (league.currentPhase !== "offseason_departures") {
        return res.status(400).json({ message: "Not in departures phase" });
      }

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach?.teamId) return res.status(403).json({ message: "Not authorized" });

      await storage.updateTeam(userCoach.teamId, { departuresFinalized: true });

      await storage.createAuditLog({
        leagueId: req.params.id,
        userId: req.session.userId,
        action: "Departures Marked Ready",
        details: `Coach marked their departures as finalized and ready to advance.`,
      });

      const teams = await storage.getTeamsByLeague(req.params.id);
      // Auto-pilot teams are always treated as departed-ready (CPU manages them)
      const humanTeams = teams.filter(t => !t.isCpu && !t.isAutoPilot);
      const allReady = humanTeams.every(t => t.departuresFinalized);

      res.json({ 
        success: true,
        teamMarkedReady: true,
        allTeamsReady: allReady,
        readyCount: humanTeams.filter(t => t.departuresFinalized).length,
        totalHumanTeams: humanTeams.length,
      });
    } catch (error) {
      console.error("Failed to finalize departures:", error);
      res.status(500).json({ message: "Failed to finalize departures" });
    }
  });

  // Get transfer portal players for the league
  app.get("/api/leagues/:id/transfer-portal", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const portalPlayers = await storage.getTransferPortalPlayersByLeague(req.params.id);
      const teams = await storage.getTeamsByLeague(req.params.id);
      const teamsMap = new Map(teams.map(t => [t.id, t]));
      
      // Get user's coach for portal interests
      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      let myInterests: Record<string, TransferPortalInterest> = {};
      if (userCoach?.teamId) {
        const portalInterests = await storage.getTransferPortalInterestsByTeam(userCoach.teamId);
        myInterests = Object.fromEntries(portalInterests.map(i => [i.playerId, i]));
      }

      const playersWithDetails = portalPlayers.map(player => ({
        ...player,
        originalTeam: teamsMap.get(player.teamId) || null,
        myInterest: myInterests[player.id] || null,
      }));

      res.json({
        players: playersWithDetails,
        myTeamId: userCoach?.teamId || null,
        isCommissioner: hasCommissionerAccess(league, req.session.userId),
      });
    } catch (error) {
      console.error("Failed to get transfer portal:", error);
      res.status(500).json({ message: "Failed to get transfer portal" });
    }
  });

  // Update interest in a portal player
  app.post("/api/leagues/:id/transfer-portal/:playerId/interest", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      if (!userCoach?.teamId) {
        return res.status(403).json({ message: "You must have a team to recruit from the portal" });
      }

      const player = await storage.getPlayer(req.params.playerId);
      if (!player || !player.inTransferPortal) {
        return res.status(404).json({ message: "Player not found in transfer portal" });
      }

      // Check player is in this league
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === player.teamId);
      if (!teamBelongsToLeague) {
        return res.status(404).json({ message: "Player not found in this league" });
      }

      // Can't recruit your own player
      if (player.teamId === userCoach.teamId) {
        return res.status(400).json({ message: "Cannot recruit your own player from the portal" });
      }

      const { isTargeted, notes } = req.body as { isTargeted?: boolean; notes?: string };

      let interest = await storage.getTransferPortalInterest(req.params.playerId, userCoach.teamId);
      
      if (interest) {
        interest = await storage.updateTransferPortalInterest(interest.id, {
          isTargeted: isTargeted ?? interest.isTargeted,
          notes: notes !== undefined ? notes : interest.notes,
        });
      } else {
        interest = await storage.createTransferPortalInterest({
          playerId: req.params.playerId,
          teamId: userCoach.teamId,
          isTargeted: isTargeted ?? false,
          notes: notes || null,
        });
      }

      res.json({ success: true, interest });
    } catch (error) {
      console.error("Failed to update portal interest:", error);
      res.status(500).json({ message: "Failed to update portal interest" });
    }
  });

  // Sign player from transfer portal
  app.post("/api/leagues/:id/transfer-portal/:playerId/sign", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      
      if (!userCoach?.teamId) {
        return res.status(403).json({ message: "You must have a team to sign from the portal" });
      }

      const player = await storage.getPlayer(req.params.playerId);
      if (!player || !player.inTransferPortal) {
        return res.status(404).json({ message: "Player not found in transfer portal" });
      }

      // Verify player is in this league
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === player.teamId);
      if (!teamBelongsToLeague) {
        return res.status(404).json({ message: "Player not found in this league" });
      }

      // Can't sign your own player from the portal
      if (player.teamId === userCoach.teamId) {
        return res.status(400).json({ message: "Cannot sign your own player from the portal" });
      }

      const oldTeam = await storage.getTeam(player.teamId);
      const newTeam = await storage.getTeam(userCoach.teamId);

      // Update player to new team and remove from portal
      const updated = await storage.updatePlayer(req.params.playerId, {
        teamId: userCoach.teamId,
        inTransferPortal: false,
        portalEntryDate: null,
        portalReason: null,
      });

      // Clean up portal interests
      await storage.deleteTransferPortalInterestsByPlayer(req.params.playerId);

      await storage.createAuditLog({
        leagueId: req.params.id,
        userId: req.session.userId,
        action: "Transfer Portal Signing",
        details: `${player.firstName} ${player.lastName} transferred from ${oldTeam?.abbreviation || 'Unknown'} to ${newTeam?.abbreviation || 'Unknown'}`,
      });

      res.json({ 
        success: true, 
        message: `${player.firstName} ${player.lastName} has signed with ${newTeam?.name || 'your team'}`,
        player: updated 
      });
    } catch (error) {
      console.error("Failed to sign portal player:", error);
      res.status(500).json({ message: "Failed to sign portal player" });
    }
  });

  // Batch update players (commissioner only)
  app.patch("/api/leagues/:id/players/batch", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can edit players" });
      }

      const { updates } = req.body as { updates: { id: string; changes: Record<string, unknown> }[] };
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }

      const allowedFields = [
        'firstName', 'lastName', 'position', 'hometown', 'homeState',
        'batHand', 'throwHand', 'eligibility',
        'skinTone', 'hairColor', 'hairStyle', 'headwear',
        'overall', 'starRating',
        'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
        'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility',
        'velocity', 'control', 'stamina', 'stuff',
        'wRISP', 'vsLefty', 'poise', 'heater', 'agile',
        'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL',
        'abilities'
      ];

      // Get all teams in this league to verify player ownership
      const teams = await storage.getTeamsByLeague(req.params.id);
      const leagueTeamIds = new Set(teams.map(t => t.id));

      const results = [];
      for (const update of updates) {
        const player = await storage.getPlayer(update.id);
        // Verify player exists and belongs to a team in this league
        if (player && leagueTeamIds.has(player.teamId)) {
          const sanitizedData: Record<string, unknown> = {};
          for (const key of allowedFields) {
            if (key in update.changes && key !== 'overall' && key !== 'starRating') {
              sanitizedData[key] = update.changes[key];
            }
          }
          const mergedPlayer = { ...player, ...sanitizedData };
          const positionChanged = 'position' in sanitizedData && sanitizedData['position'] !== player.position;
          if (positionChanged && !player.originalPosition) {
            sanitizedData['originalPosition'] = player.position;
          }
          // Recalculate OVR using the new (merged) position — converted players get
          // the correct positional attribute weights applied immediately.
          sanitizedData['overall'] = calculateOVR(mergedPlayer as any);
          sanitizedData['starRating'] = getStarRatingFromOVR(sanitizedData['overall'] as number);
          const updated = await storage.updatePlayer(update.id, sanitizedData);
          results.push(updated);

          // Sync current-season stat row's position so career stats display reflects
          // the new position without waiting for the next game to be simulated.
          if (positionChanged) {
            await storage.updatePlayerSeasonStatsPosition(
              update.id,
              req.params.id,
              league.currentSeason,
              sanitizedData['position'] as string,
            );
          }
        }
      }

      await storage.createAuditLog({
        leagueId: req.params.id,
        userId: req.session.userId,
        action: "Batch Player Edit",
        details: `Edited ${results.length} players via roster editor`,
      });

      res.json({ success: true, count: results.length });
    } catch (error) {
      console.error("Failed to batch update players:", error);
      res.status(500).json({ message: "Failed to batch update players" });
    }
  });

  // Depth chart reorder - update depth order for players at a position
  app.put("/api/leagues/:id/depth-chart", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { orders } = req.body as { orders: { playerId: string; depthOrder: number }[] };
      if (!Array.isArray(orders)) {
        return res.status(400).json({ message: "Orders must be an array" });
      }

      const teamId = userCoach?.teamId;
      for (const order of orders) {
        const player = await storage.getPlayer(order.playerId);
        if (player && (isCommissioner || player.teamId === teamId)) {
          await storage.updatePlayer(order.playerId, { depthOrder: order.depthOrder });
        }
      }

      res.json({ success: true, count: orders.length });
    } catch (error) {
      console.error("Failed to update depth chart:", error);
      res.status(500).json({ message: "Failed to update depth chart" });
    }
  });

  // Batting order - set batting order for the user's team
  app.put("/api/leagues/:id/batting-order", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { orders } = req.body as { orders: { playerId: string; battingOrder: number | null }[] };
      if (!Array.isArray(orders)) {
        return res.status(400).json({ message: "Orders must be an array" });
      }

      for (const order of orders) {
        if (order.battingOrder !== null && (order.battingOrder < 1 || order.battingOrder > 9)) {
          return res.status(400).json({ message: "Batting order must be 1-9 or null" });
        }
      }

      const usedNumbers = orders
        .map(o => o.battingOrder)
        .filter((n): n is number => n !== null);
      if (new Set(usedNumbers).size !== usedNumbers.length) {
        return res.status(400).json({ message: "Duplicate batting order numbers not allowed" });
      }

      const teamId = userCoach?.teamId;
      for (const order of orders) {
        const player = await storage.getPlayer(order.playerId);
        if (player && (isCommissioner || player.teamId === teamId)) {
          await storage.updatePlayer(order.playerId, { battingOrder: order.battingOrder });
        }
      }

      res.json({ success: true, count: orders.length });
    } catch (error) {
      console.error("Failed to update batting order:", error);
      res.status(500).json({ message: "Failed to update batting order" });
    }
  });

  // Lineup position - set the defensive position each batter plays in the lineup
  app.put("/api/leagues/:id/lineup-position", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const validPositions = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "DH"];
      const { assignments } = req.body as { assignments: { playerId: string; lineupPosition: string | null }[] };
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ message: "Assignments must be an array" });
      }

      for (const a of assignments) {
        if (a.lineupPosition !== null && !validPositions.includes(a.lineupPosition)) {
          return res.status(400).json({ message: `Invalid lineup position: ${a.lineupPosition}` });
        }
      }

      const PITCHER_POS_LP = ["P", "SP", "RP", "CL", "LHP", "RHP"];
      const teamId = userCoach?.teamId;
      for (const a of assignments) {
        const player = await storage.getPlayer(a.playerId);
        if (!player) continue;
        if (!isCommissioner && player.teamId !== teamId) continue;
        if (PITCHER_POS_LP.includes(player.position)) continue;
        await storage.updatePlayer(a.playerId, { lineupPosition: a.lineupPosition });
      }

      res.json({ success: true, count: assignments.length });
    } catch (error) {
      console.error("Failed to update lineup positions:", error);
      res.status(500).json({ message: "Failed to update lineup positions" });
    }
  });

  // Pitching roles - set pitching roles for the user's team
  app.put("/api/leagues/:id/pitching-roles", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const validRoles = ["FRI", "SAT", "SUN", "MID", "LRP", "MR", "SU", "CP"];
      const { assignments } = req.body as { assignments: { playerId: string; pitchingRole: string | null }[] };
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ message: "Assignments must be an array" });
      }

      for (const assignment of assignments) {
        if (assignment.pitchingRole !== null && !validRoles.includes(assignment.pitchingRole)) {
          return res.status(400).json({ message: `Invalid pitching role: ${assignment.pitchingRole}. Valid roles: ${validRoles.join(", ")}` });
        }
      }

      const teamId = userCoach?.teamId;
      for (const assignment of assignments) {
        const player = await storage.getPlayer(assignment.playerId);
        if (!player) continue;
        if (!isCommissioner && player.teamId !== teamId) continue;
        if (player.position !== "P") {
          return res.status(400).json({ message: `Player ${player.firstName} ${player.lastName} is not a pitcher` });
        }
        await storage.updatePlayer(assignment.playerId, { pitchingRole: assignment.pitchingRole });
      }

      res.json({ success: true, count: assignments.length });
    } catch (error) {
      console.error("Failed to update pitching roles:", error);
      res.status(500).json({ message: "Failed to update pitching roles" });
    }
  });

  // Auto-lineup - auto-assign batting order, rotation, and bullpen
  app.post("/api/leagues/:id/auto-lineup", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!userCoach && !isCommissioner) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const teamId = userCoach?.teamId;
      if (!teamId) return res.status(400).json({ message: "No team assigned" });

      const teamPlayers = await storage.getPlayersByTeam(teamId);
      await autoAssignLineup(storage, teamPlayers, teamId);

      const updatedRoster = await storage.getPlayersByTeam(teamId);
      res.json({ success: true, roster: updatedRoster });
    } catch (error) {
      console.error("Failed to auto-assign lineup:", error);
      res.status(500).json({ message: "Failed to auto-assign lineup" });
    }
  });

  // Coach profile route
  app.get("/api/leagues/:id/coach", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id as string);
      
      // Find the coach belonging to the authenticated user
      const userCoach = coaches.find((c) => c.userId === userId);
      
      if (!userCoach) {
        return res.status(404).json({ message: "No coach found for this user" });
      }

      const team = userCoach.teamId ? await storage.getTeam(userCoach.teamId) : undefined;
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Auto-assign personality/traits/philosophy/milestones on first render
      try {
        await ensureCoachTraits(userCoach);
        const fresh = await storage.getCoach(userCoach.id);
        if (fresh) { res.json({ coach: fresh, team, isOwnCoach: true }); return; }
      } catch (traitErr) {
        console.error("[coach-profile] ensureCoachTraits failed:", traitErr);
      }

      res.json({
        coach: userCoach,
        team,
        isOwnCoach: true,
      });
    } catch (error) {
      console.error("Failed to fetch coach:", error);
      res.status(500).json({ message: "Failed to fetch coach" });
    }
  });

  // Upgrade a coach skill
  app.post("/api/leagues/:id/coach/upgrade-skill", requireAuth, async (req, res) => {
    try {
      const { skill } = req.body;
      const validSkills = ["scouting", "evaluation", "pitching", "hitting"];
      
      if (!validSkills.includes(skill)) {
        return res.status(400).json({ message: "Invalid skill type" });
      }
      
      const userId = req.session.userId;
      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find((c) => c.userId === userId);
      
      if (!userCoach) {
        return res.status(404).json({ message: "No coach found for this user" });
      }
      
      if ((userCoach.skillPoints || 0) < 1) {
        return res.status(400).json({ message: "Not enough skill points" });
      }
      
      // Get current skill level and check max
      const skillFieldMap: Record<string, keyof typeof userCoach> = {
        scouting: "scoutingSkill",
        evaluation: "evaluationSkill",
        pitching: "pitchingRecruitingSkill",
        hitting: "hittingRecruitingSkill",
      };
      
      const skillField = skillFieldMap[skill];
      const currentLevel = (userCoach[skillField] as number) || 1;
      
      if (currentLevel >= 10) {
        return res.status(400).json({ message: "Skill already at maximum level" });
      }
      
      // Update coach
      const updatedCoach = await storage.updateCoach(userCoach.id, {
        [skillField]: currentLevel + 1,
        skillPoints: (userCoach.skillPoints || 0) - 1,
      });
      
      res.json({ coach: updatedCoach });
    } catch (error) {
      console.error("Failed to upgrade skill:", error);
      res.status(500).json({ message: "Failed to upgrade skill" });
    }
  });

  // View any coach by ID (for viewing other coaches)
  app.get("/api/coaches/:coachId", requireAuth, async (req, res) => {
    try {
      let coach = await storage.getCoach(req.params.coachId as string);
      if (!coach) {
        return res.status(404).json({ message: "Coach not found" });
      }

      try {
        await ensureCoachTraits(coach);
        coach = (await storage.getCoach(coach.id)) ?? coach;
      } catch (traitErr) {
        console.error("[coach-by-id] ensureCoachTraits failed:", traitErr);
      }

      const team = coach.teamId ? await storage.getTeam(coach.teamId) : undefined;
      const isOwnCoach = coach.userId === req.session.userId;

      // Check if requesting user is commissioner of the coach's league
      let isCommissioner = false;
      if (coach.leagueId) {
        const coachLeague = await storage.getLeague(coach.leagueId);
        if (coachLeague) {
          isCommissioner = hasCommissionerAccess(coachLeague, req.session.userId);
        }
      }

      res.json({
        coach,
        team,
        isOwnCoach,
        isCommissioner,
      });
    } catch (error) {
      console.error("Failed to fetch coach:", error);
      res.status(500).json({ message: "Failed to fetch coach" });
    }
  });

  // Coach season history by coach ID
  app.get("/api/coaches/:coachId/season-history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getCoachSeasonHistory(req.params.coachId as string);
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch coach season history:", error);
      res.status(500).json({ message: "Failed to fetch coach season history" });
    }
  });

  // Coach season history for the current user in a league
  app.get("/api/leagues/:id/coach/season-history", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach) return res.status(404).json({ message: "No coach found" });
      const history = await storage.getCoachSeasonHistory(userCoach.id);
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch coach season history:", error);
      res.status(500).json({ message: "Failed to fetch coach season history" });
    }
  });

  // Recruiting record helper — builds aggregated stats from class snapshots + player history
  async function buildRecruitingRecord(coach: { id: string; teamId?: string | null; leagueId: string }) {
    const history = await storage.getCoachSeasonHistory(coach.id);
    if (history.length === 0) {
      return {
        totalSigned: 0, fiveStars: 0, fourStars: 0, threeStars: 0, twoStars: 0, oneStars: 0,
        blueChipsSigned: 0,
        avgClassRank: null as number | null, bestClassRank: null as number | null,
        topClassSeason: null as number | null, topRecruitName: null as string | null,
        topRecruitOvr: null as number | null, topRecruitStars: null as number | null,
        draftPicksDeveloped: 0, allAmericansDeveloped: 0, seasonsRecorded: 0,
        seasonHistory: [] as Array<{
          season: number; classRank: number | null; classScore: number | null;
          totalSigned: number; fiveStars: number; fourStars: number;
          threeStars: number; twoStars: number; oneStars: number;
          classStarAvg: number | null; topRecruitName: string | null; topRecruitStars: number | null;
        }>,
      };
    }

    // Aggregate from class snapshots for star breakdown
    let fiveStars = 0, fourStars = 0, threeStars = 0, twoStars = 0, oneStars = 0;
    const leagueSnaps = await storage.getRecruitingClassSnapshotsAllSeasons(coach.leagueId);

    // Season-by-season history with star breakdown from snapshots
    // Uses per-row teamId (stored at season finalization) for accurate team-season attribution
    const seasonHistory = history.map(entry => {
      const rowTeamId = entry.teamId ?? coach.teamId ?? "";
      const snap = leagueSnaps.find(s => s.teamId === rowTeamId && s.season === entry.season);
      return {
        season: entry.season,
        classRank: entry.classRank ?? null,
        classScore: entry.classScore ?? null,
        totalSigned: entry.totalSigned,
        fiveStars: snap?.fiveStars ?? 0,
        fourStars: snap?.fourStars ?? 0,
        threeStars: snap?.threeStars ?? 0,
        twoStars: snap?.twoStars ?? 0,
        oneStars: snap?.oneStars ?? 0,
        classStarAvg: entry.classStarAvg ?? null,
        topRecruitName: entry.topRecruitName ?? null,
        topRecruitStars: entry.topRecruitStars ?? null,
        recruitingScore: entry.recruitingScore ?? null,
        recruitingGrade: entry.recruitingGrade ?? null,
        recruitingBreakdown: entry.recruitingBreakdown ?? null,
      };
    }).sort((a, b) => b.season - a.season); // most recent first

    for (const entry of history) {
      const rowTeamId = entry.teamId ?? coach.teamId ?? "";
      const snap = leagueSnaps.find(s => s.teamId === rowTeamId && s.season === entry.season);
      if (snap) {
        fiveStars += snap.fiveStars;
        fourStars += snap.fourStars;
        threeStars += snap.threeStars;
        twoStars += snap.twoStars;
        oneStars += snap.oneStars;
      }
    }

    // Best recruit across all seasons
    const bestEntry = [...history].sort((a, b) => (b.topRecruitOvr ?? 0) - (a.topRecruitOvr ?? 0))[0];
    const bestClassEntry = [...history].filter(h => h.classRank != null).sort((a, b) => (a.classRank ?? 999) - (b.classRank ?? 999))[0];
    const rankedSeasons = history.filter(h => h.classRank != null);
    const avgClassRank = rankedSeasons.length > 0
      ? Math.round(rankedSeasons.reduce((s, h) => s + (h.classRank ?? 0), 0) / rankedSeasons.length)
      : null;

    // Draft picks developed — bounded to team+season windows from coach_season_history
    // This avoids overcounting inherited production from before/after coach tenure
    let draftPicksDeveloped = 0;
    let blueChipsSigned = 0;
    // Build map: teamId -> Set of seasons the coach was at that team
    const coachTeamSeasons = new Map<string, Set<number>>();
    for (const h of history) {
      const tid = h.teamId ?? coach.teamId ?? "";
      if (!tid) continue;
      if (!coachTeamSeasons.has(tid)) coachTeamSeasons.set(tid, new Set());
      coachTeamSeasons.get(tid)!.add(h.season);
    }
    if (coachTeamSeasons.size > 0) {
      const playerHist = await storage.getPlayerHistoryByLeague(coach.leagueId);
      draftPicksDeveloped = playerHist.filter(ph => {
        if (!ph.teamId || ph.draftRound == null) return false;
        const seasons = coachTeamSeasons.get(ph.teamId);
        return seasons != null && seasons.has(ph.season);
      }).length;
      // Blue chips signed — bounded to teams coach was at; recruits schema has no signedSeason
      // so team-match is the tightest bound possible without a schema addition
      const allRecruits = await storage.getRecruitsByLeague(coach.leagueId);
      blueChipsSigned = allRecruits.filter(r =>
        r.signedTeamId != null &&
        coachTeamSeasons.has(r.signedTeamId) &&
        r.isBlueChip === true &&
        r.starRating === 5
      ).length;
    }

    // Use stored career recruiting score (rolling weighted avg + milestone bonuses, computed at signing day)
    const coachFull = await storage.getCoach(coach.id);
    const careerRecruitingScore = coachFull?.careerRecruitingScore ?? null;

    return {
      totalSigned: history.reduce((s, h) => s + h.totalSigned, 0),
      fiveStars, fourStars, threeStars, twoStars, oneStars,
      blueChipsSigned,
      avgClassRank,
      bestClassRank: bestClassEntry?.classRank ?? null,
      topClassSeason: bestClassEntry?.season ?? null,
      topRecruitName: bestEntry?.topRecruitName ?? null,
      topRecruitOvr: bestEntry?.topRecruitOvr ?? null,
      topRecruitStars: bestEntry?.topRecruitStars ?? null,
      draftPicksDeveloped,
      allAmericansDeveloped: 0,
      seasonsRecorded: history.length,
      careerRecruitingScore,
      seasonHistory,
    };
  }

  // Recruiting record — own coach in a league
  app.get("/api/leagues/:id/coach/recruiting-record", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach) return res.status(404).json({ message: "No coach found" });
      const record = await buildRecruitingRecord({ id: userCoach.id, teamId: userCoach.teamId, leagueId });
      res.json(record);
    } catch (error) {
      console.error("Failed to fetch recruiting record:", error);
      res.status(500).json({ message: "Failed to fetch recruiting record" });
    }
  });

  // Recruiting record — any coach by ID
  app.get("/api/coaches/:coachId/recruiting-record", requireAuth, async (req, res) => {
    try {
      const coach = await storage.getCoach(req.params.coachId as string);
      if (!coach) return res.status(404).json({ message: "Coach not found" });
      const record = await buildRecruitingRecord({ id: coach.id, teamId: coach.teamId, leagueId: coach.leagueId });
      res.json(record);
    } catch (error) {
      console.error("Failed to fetch recruiting record:", error);
      res.status(500).json({ message: "Failed to fetch recruiting record" });
    }
  });

  // Update coach strategy (roster, geography, recruiting style, game philosophy)
  app.patch("/api/coaches/:id/strategy", requireAuth, async (req, res) => {
    try {
      const coach = await storage.getCoach(req.params.id as string);
      if (!coach) return res.status(404).json({ message: "Coach not found" });

      const league = await storage.getLeague(coach.leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      const isOwnCoach = coach.userId === req.session.userId;
      if (!isCommissioner && !isOwnCoach) {
        return res.status(403).json({ message: "You can only edit your own strategy." });
      }

      const validRosterStrategies = ["pitching_first", "contact_hitting", "power_hitting", "speed_defense", "balanced"];
      const validGeographyStrategies = ["local_regional", "texas", "california", "florida", "national"];
      const validStyleStrategies = ["all_in_few", "spread_wide", "top_prospects", "high_potential", "best_available"];
      const validPhilosophyStrategies = ["small_ball", "power_ball", "aggressive", "conservative", "balanced"];

      const { rosterStrategy, recruitingGeographyStrategy, recruitingStyleStrategy, gamePhilosophyStrategy } = req.body;
      const update: Record<string, string> = {};

      if (rosterStrategy !== undefined) {
        if (!validRosterStrategies.includes(rosterStrategy)) return res.status(400).json({ message: "Invalid roster strategy" });
        update.rosterStrategy = rosterStrategy;
      }
      if (recruitingGeographyStrategy !== undefined) {
        if (!validGeographyStrategies.includes(recruitingGeographyStrategy)) return res.status(400).json({ message: "Invalid geography strategy" });
        update.recruitingGeographyStrategy = recruitingGeographyStrategy;
      }
      if (recruitingStyleStrategy !== undefined) {
        if (!validStyleStrategies.includes(recruitingStyleStrategy)) return res.status(400).json({ message: "Invalid recruiting style" });
        update.recruitingStyleStrategy = recruitingStyleStrategy;
      }
      if (gamePhilosophyStrategy !== undefined) {
        if (!validPhilosophyStrategies.includes(gamePhilosophyStrategy)) return res.status(400).json({ message: "Invalid game philosophy" });
        update.gamePhilosophyStrategy = gamePhilosophyStrategy;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "No valid strategy fields provided" });
      }

      const updated = await storage.updateCoach(coach.id, update as any);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update coach strategy:", error);
      res.status(500).json({ message: "Failed to update coach strategy" });
    }
  });

  // Power Rankings — star/attribute-based team strength ranking
  app.get("/api/leagues/:id/power-rankings", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const userTeamId = userCoach?.teamId ?? null;

      const allPlayers = await storage.getPlayersByLeague(leagueId);
      const allRecruits = await storage.getRecruitsByLeague(leagueId);

      // Group players by team
      const playersByTeam = new Map<string, typeof allPlayers>();
      for (const p of allPlayers) {
        if (!playersByTeam.has(p.teamId)) playersByTeam.set(p.teamId, []);
        playersByTeam.get(p.teamId)!.push(p);
      }

      // Group signed recruits by team
      const signedByTeam = new Map<string, typeof allRecruits>();
      for (const r of allRecruits) {
        if (r.signedTeamId) {
          if (!signedByTeam.has(r.signedTeamId)) signedByTeam.set(r.signedTeamId, []);
          signedByTeam.get(r.signedTeamId)!.push(r);
        }
      }

      const avg = (nums: number[]): number =>
        nums.length === 0 ? 0 : Math.round(nums.reduce((s, v) => s + v, 0) / nums.length);

      const PITCHER_POS_SET = new Set(["P", "SP", "RP", "CL", "LHP", "RHP"]);

      // Build raw data per team
      const teamData = leagueTeams.map(team => {
        const players = playersByTeam.get(team.id) || [];
        const pitchers = players.filter(p => PITCHER_POS_SET.has(p.position));
        const hitters = players.filter(p => !PITCHER_POS_SET.has(p.position));
        const signed = signedByTeam.get(team.id) || [];

        const avgAttr = (arr: number[]): number =>
          arr.length === 0 ? 0 : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
        const avgStar = (arr: { starRating: number }[]): number =>
          arr.length === 0 ? 0 : arr.reduce((s, p) => s + (p.starRating || 1), 0) / arr.length;

        const overallStarAvg = avgStar(players);
        const hittingScore = avgAttr(
          hitters.flatMap(p => [p.hitForAvg ?? 50, p.power ?? 50])
        );
        const fieldingScore = avgAttr(
          hitters.flatMap(p => [p.fielding ?? 50, p.errorResistance ?? 50, p.throwing ?? 50])
        );
        const speedScore = avgAttr(players.map(p => p.running ?? 50));
        const pitchingScore = avgStar(pitchers);
        const recruitingScore = avg(signed.map(r => r.overall));

        const composite = Math.round(overallStarAvg * 20);

        return {
          teamId: team.id,
          teamName: team.name,
          mascot: team.mascot,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          isCpu: team.isCpu,
          composite,
          overallStarAvg,
          pitchingScore,
          hittingScore,
          fieldingScore,
          speedScore,
          recruitingScore,
          hasSignedRecruits: signed.length > 0,
        };
      }).sort((a, b) => b.composite - a.composite);

      const n = teamData.length;

      const computePercentile = (vals: number[], val: number): number => {
        const sorted = [...vals].sort((a, b) => a - b);
        const rank = sorted.filter(v => v < val).length;
        return n <= 1 ? 100 : Math.round((rank / (n - 1)) * 100);
      };

      const pitchVals = teamData.map(t => t.pitchingScore);
      const hitVals = teamData.map(t => t.hittingScore);
      const fieldVals = teamData.map(t => t.fieldingScore);
      const speedVals = teamData.map(t => t.speedScore);
      const recruVals = teamData.map(t => t.recruitingScore);
      const compositeVals = teamData.map(t => t.composite);

      // Build previous-rank lookup from the stored snapshot (set at each week advance)
      const prevRankings = (league.prevPowerRankings as { teamId: string; rank: number }[] | null) ?? [];
      const prevRankMap = new Map(prevRankings.map(r => [r.teamId, r.rank]));

      const rankings = teamData.map((t, i) => {
        const currentRank = i + 1;
        const prevRank = prevRankMap.get(t.teamId);
        const rankDelta = prevRank != null ? prevRank - currentRank : null;
        return {
          rank: currentRank,
          rankDelta,
          ...t,
          pitchingPercentile: computePercentile(pitchVals, t.pitchingScore),
          hittingPercentile: computePercentile(hitVals, t.hittingScore),
          fieldingPercentile: computePercentile(fieldVals, t.fieldingScore),
          speedPercentile: computePercentile(speedVals, t.speedScore),
          recruitingPercentile: computePercentile(recruVals, t.recruitingScore),
          compositePercentile: computePercentile(compositeVals, t.composite),
        };
      });

      res.json({ rankings, userTeamId });
    } catch (error) {
      console.error("Failed to fetch power rankings:", error);
      res.status(500).json({ message: "Failed to fetch power rankings" });
    }
  });

  // Top 100 MLB Prospects
  app.get("/api/leagues/:id/top-prospects", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const [allPlayers, leagueTeams] = await Promise.all([
        storage.getPlayersByLeague(leagueId),
        storage.getTeamsByLeague(leagueId),
      ]);

      const teamMap = new Map(leagueTeams.map(t => [t.id, t]));
      const PITCHER_POSITIONS = new Set(["SP", "RP", "CL", "P"]);

      const activePlayers = allPlayers.filter(p => !p.pendingDeparture && !p.declaredForDraft);

      const withTeam = activePlayers.map(p => {
        const team = teamMap.get(p.teamId);
        return {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          position: p.position,
          eligibility: p.eligibility,
          overall: p.overall ?? 0,
          starRating: p.starRating ?? 1,
          batHand: p.batHand ?? "R",
          throwHand: p.throwHand ?? "R",
          teamId: p.teamId,
          teamName: team?.name ?? "Unknown",
          teamAbbreviation: team?.abbreviation ?? "???",
          teamPrimaryColor: team?.primaryColor ?? "#666",
          teamSecondaryColor: team?.secondaryColor ?? "#999",
          category: PITCHER_POSITIONS.has(p.position) ? "pitcher" : "hitter",
        };
      });

      const hitters = withTeam
        .filter(p => p.category === "hitter")
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 100);

      const pitchers = withTeam
        .filter(p => p.category === "pitcher")
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 100);

      res.json({ hitters, pitchers, currentSeason: league.currentSeason ?? 1 });
    } catch (error) {
      console.error("Failed to fetch top prospects:", error);
      res.status(500).json({ message: "Failed to fetch top prospects" });
    }
  });

  // League stats - aggregate batting/pitching from box scores
  app.get("/api/leagues/:id/stats", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      let season = req.query.season ? parseInt(req.query.season as string) : league.currentSeason;
      const allGames = await storage.getGamesByLeague(req.params.id);
      let seasonGames = allGames.filter(g => g.season === season && g.isComplete && g.boxScore);
      
      if (seasonGames.length === 0 && !req.query.season && season > 1) {
        season = season - 1;
        seasonGames = allGames.filter(g => g.season === season && g.isComplete && g.boxScore);
      }
      const teams = await storage.getTeamsByLeague(req.params.id);
      const teamsMap = new Map(teams.map(t => [t.id, t]));

      interface BatterAgg {
        name: string; playerId: string; teamId: string; games: number; ab: number; r: number; h: number;
        doubles: number; triples: number; hr: number; rbi: number; bb: number; hbp: number; so: number; sb: number;
        cs: number; exitVeloTotal: number; barrels: number; ballsInPlay: number; hardHits: number;
        putouts: number; assists: number; fieldingErrors: number; totalChances: number;
      }
      interface PitcherAgg {
        name: string; playerId: string; teamId: string; games: number; ip: number; h: number; r: number; er: number;
        bb: number; so: number; hr: number; wins: number; losses: number;
        totalPitches: number; whiffs: number; spinRateTotal: number;
      }
      interface TeamAgg {
        teamId: string; games: number; runsScored: number; runsAllowed: number; hits: number; hitsAllowed: number;
        totalAB: number; totalBB: number; totalSO: number; totalHR: number; totalDoubles: number; totalTriples: number;
        totalHBP: number; totalSB: number; errors: number;
      }

      const batters = new Map<string, BatterAgg>();
      const pitchers = new Map<string, PitcherAgg>();
      const teamStats = new Map<string, TeamAgg>();

      for (const game of seasonGames) {
        let box: any;
        try { box = JSON.parse(game.boxScore!); } catch { continue; }
        if (!box.home || !box.away) continue;

        const sides = [
          { data: box.home, teamId: game.homeTeamId, oppTeamId: game.awayTeamId, isHome: true },
          { data: box.away, teamId: game.awayTeamId, oppTeamId: game.homeTeamId, isHome: false },
        ];

        for (const side of sides) {
          const tKey = side.teamId;
          if (!teamStats.has(tKey)) {
            teamStats.set(tKey, {
              teamId: tKey, games: 0, runsScored: 0, runsAllowed: 0, hits: 0, hitsAllowed: 0,
              totalAB: 0, totalBB: 0, totalSO: 0, totalHR: 0, totalDoubles: 0, totalTriples: 0,
              totalHBP: 0, totalSB: 0, errors: 0,
            });
          }
          const ts = teamStats.get(tKey)!;
          ts.games++;
          const teamScore = side.isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
          const oppScore = side.isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
          ts.runsScored += teamScore;
          ts.runsAllowed += oppScore;
          ts.errors += side.data.errors || 0;

          if (side.data.batting) {
            for (const b of side.data.batting) {
              ts.totalAB += b.ab || 0;
              ts.hits += b.h || 0;
              ts.totalBB += b.bb || 0;
              ts.totalSO += b.so || 0;
              ts.totalHR += b.hr || 0;
              ts.totalDoubles += b.doubles || 0;
              ts.totalTriples += b.triples || 0;
              ts.totalHBP += b.hbp || 0;
              ts.totalSB += b.sb || 0;

              const bKey = `${b.name}_${side.teamId}`;
              if (!batters.has(bKey)) {
                batters.set(bKey, {
                  name: b.name, playerId: b.playerId || "", teamId: side.teamId, games: 0, ab: 0, r: 0, h: 0,
                  doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0,
                  cs: 0, exitVeloTotal: 0, barrels: 0, ballsInPlay: 0, hardHits: 0,
                  putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0,
                });
              }
              const ba = batters.get(bKey)!;
              ba.games++;
              ba.ab += b.ab || 0;
              ba.r += b.r || 0;
              ba.h += b.h || 0;
              ba.doubles += b.doubles || 0;
              ba.triples += b.triples || 0;
              ba.hr += b.hr || 0;
              ba.rbi += b.rbi || 0;
              ba.bb += b.bb || 0;
              ba.hbp += b.hbp || 0;
              ba.so += b.so || 0;
              ba.sb += b.sb || 0;
              ba.cs += b.cs || 0;
              ba.exitVeloTotal += b.exitVelo || 0;
              ba.barrels += b.barrels || 0;
              ba.ballsInPlay += b.ballsInPlay || 0;
              ba.hardHits += b.hardHits || 0;
              ba.putouts += b.putouts || 0;
              ba.assists += b.assists || 0;
              ba.fieldingErrors += b.fieldingErrors || 0;
              ba.totalChances += b.totalChances || 0;
            }
          }

          if (side.data.pitching) {
            for (const p of side.data.pitching) {
              ts.hitsAllowed += p.h || 0;
              const pKey = `${p.name}_${side.teamId}`;
              if (!pitchers.has(pKey)) {
                pitchers.set(pKey, {
                  name: p.name, playerId: p.playerId || "", teamId: side.teamId, games: 0, ip: 0, h: 0, r: 0, er: 0,
                  bb: 0, so: 0, hr: 0, wins: 0, losses: 0,
                  totalPitches: 0, whiffs: 0, spinRateTotal: 0,
                });
              }
              const pa = pitchers.get(pKey)!;
              pa.games++;
              const ipParts = String(p.ip).split(".");
              const fullInnings = parseInt(ipParts[0]) || 0;
              const partialInnings = parseInt(ipParts[1]) || 0;
              pa.ip += fullInnings + partialInnings / 3;
              pa.h += p.h || 0;
              pa.r += p.r || 0;
              pa.er += p.er || 0;
              pa.bb += p.bb || 0;
              pa.so += p.so || 0;
              pa.hr += p.hr || 0;
              pa.totalPitches += p.totalPitches || 0;
              pa.whiffs += p.whiffs || 0;
              pa.spinRateTotal += p.spinRate || 0;
            }

            if (side.data.pitching.length > 0) {
              const starter = side.data.pitching[0];
              const sKey = `${starter.name}_${side.teamId}`;
              const pa = pitchers.get(sKey);
              if (pa) {
                const teamScore = side.isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
                const oppScore = side.isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
                if (teamScore > oppScore) pa.wins++;
                else pa.losses++;
              }
            }
          }
        }
      }

      const FIP_CONSTANT = 3.10;
      const LEAGUE_AVG_RPG = 4.5;

      const battingLeaders = Array.from(batters.values())
        .filter(b => b.ab >= 10)
        .map(b => {
          const avg = b.ab > 0 ? b.h / b.ab : 0;
          const obp = (b.ab + b.bb + b.hbp) > 0 ? (b.h + b.bb + b.hbp) / (b.ab + b.bb + b.hbp) : 0;
          const singles = b.h - b.doubles - b.triples - b.hr;
          const totalBases = singles + b.doubles * 2 + b.triples * 3 + b.hr * 4;
          const slg = b.ab > 0 ? totalBases / b.ab : 0;
          const ops = obp + slg;
          const wOBA = (b.ab + b.bb + b.hbp) > 0
            ? (0.69 * b.bb + 0.72 * b.hbp + 0.89 * singles + 1.27 * b.doubles + 1.62 * b.triples + 2.10 * b.hr) / (b.ab + b.bb + b.hbp)
            : 0;
          const wRAA = ((wOBA - 0.320) / 1.25) * (b.ab + b.bb + b.hbp);
          const battingWar = wRAA / 10;

          const babip = (b.ab - b.so - b.hr) > 0 ? (b.h - b.hr) / (b.ab - b.so - b.hr) : 0;

          const leagueWOBA = 0.320;
          const wOBAScale = 1.25;
          const lgRPA = 0.12;
          const wRCplus = lgRPA > 0 ? ((((wOBA - leagueWOBA) / wOBAScale) + lgRPA) / lgRPA) * 100 : 100;

          const lgOBP = 0.320;
          const lgSLG = 0.410;
          const opsPlus = obp > 0 || slg > 0 ? Math.round(100 * (obp / lgOBP + slg / lgSLG - 1)) : 0;

          const avgExitVelo = b.games > 0 ? b.exitVeloTotal / b.games : 0;
          const barrelPct = b.ballsInPlay > 0 ? (b.barrels / b.ballsInPlay) * 100 : 0;
          const hardHitPct = b.ballsInPlay > 0 ? (b.hardHits / b.ballsInPlay) * 100 : 0;

          const fldPct = b.totalChances > 0 ? (b.putouts + b.assists) / b.totalChances : 0;
          const lgFldPct = 0.970;
          const oaa = Math.round((fldPct - lgFldPct) * b.totalChances * 0.5);
          const drs = Math.round((fldPct - lgFldPct) * b.totalChances * 0.7 + (b.assists * 0.05));

          return {
            ...b,
            avg: avg.toFixed(3),
            obp: obp.toFixed(3),
            slg: slg.toFixed(3),
            ops: ops.toFixed(3),
            war: Math.max(0, battingWar).toFixed(1),
            babip: babip.toFixed(3),
            wOBA: wOBA.toFixed(3),
            wRCplus: Math.round(Math.max(0, wRCplus)),
            opsPlus: Math.max(0, opsPlus),
            avgExitVelo: avgExitVelo.toFixed(1),
            barrelPct: barrelPct.toFixed(1),
            hardHitPct: hardHitPct.toFixed(1),
            oaa,
            drs,
            fldPct: fldPct.toFixed(3),
            cs: b.cs,
            teamAbbr: teamsMap.get(b.teamId)?.abbreviation || "???",
            teamColor: teamsMap.get(b.teamId)?.primaryColor || "#666",
          };
        });

      const pitchingLeaders = Array.from(pitchers.values())
        .filter(p => p.ip >= 3)
        .map(p => {
          const era = p.ip > 0 ? (p.er * 9) / p.ip : 0;
          const fip = p.ip > 0 ? ((13 * p.hr + 3 * p.bb - 2 * p.so) / p.ip) + FIP_CONSTANT : 0;
          const whip = p.ip > 0 ? (p.bb + p.h) / p.ip : 0;
          const kPer9 = p.ip > 0 ? (p.so * 9) / p.ip : 0;
          const bbPer9 = p.ip > 0 ? (p.bb * 9) / p.ip : 0;
          const raaPitch = p.ip > 0 ? ((LEAGUE_AVG_RPG / 9 - era / 9) * p.ip) : 0;
          const pitchingWar = raaPitch / 10;

          const bfApprox = Math.round(p.ip * 3 + p.h + p.bb);
          const kPct = bfApprox > 0 ? (p.so / bfApprox) * 100 : 0;
          const bbPct = bfApprox > 0 ? (p.bb / bfApprox) * 100 : 0;
          const whiffRate = p.totalPitches > 0 ? (p.whiffs / p.totalPitches) * 100 : 0;
          const siera = p.ip > 0 ? (era * 0.6 + fip * 0.4) : 0;
          const avgSpinRate = p.games > 0 ? Math.round(p.spinRateTotal / p.games) : 0;

          return {
            ...p,
            ipDisplay: `${Math.floor(p.ip)}.${Math.round((p.ip % 1) * 3)}`,
            era: era.toFixed(2),
            fip: Math.max(0, fip).toFixed(2),
            whip: whip.toFixed(2),
            kPer9: kPer9.toFixed(1),
            bbPer9: bbPer9.toFixed(1),
            war: Math.max(0, pitchingWar).toFixed(1),
            kPct: kPct.toFixed(1),
            bbPct: bbPct.toFixed(1),
            whiffRate: whiffRate.toFixed(1),
            siera: Math.max(0, siera).toFixed(2),
            avgSpinRate,
            totalPitches: p.totalPitches,
            teamAbbr: teamsMap.get(p.teamId)?.abbreviation || "???",
            teamColor: teamsMap.get(p.teamId)?.primaryColor || "#666",
          };
        });

      const teamStatsArray = Array.from(teamStats.values()).map(ts => {
        const battingAvg = ts.totalAB > 0 ? ts.hits / ts.totalAB : 0;
        const singles = ts.hits - ts.totalDoubles - ts.totalTriples - ts.totalHR;
        const totalBases = singles + ts.totalDoubles * 2 + ts.totalTriples * 3 + ts.totalHR * 4;
        const slg = ts.totalAB > 0 ? totalBases / ts.totalAB : 0;
        const obp = (ts.totalAB + ts.totalBB + ts.totalHBP) > 0
          ? (ts.hits + ts.totalBB + ts.totalHBP) / (ts.totalAB + ts.totalBB + ts.totalHBP) : 0;
        const ops = obp + slg;

        return {
          ...ts,
          teamName: teamsMap.get(ts.teamId)?.name || "Unknown",
          teamAbbr: teamsMap.get(ts.teamId)?.abbreviation || "???",
          teamColor: teamsMap.get(ts.teamId)?.primaryColor || "#666",
          battingAvg: battingAvg.toFixed(3),
          obp: obp.toFixed(3),
          slg: slg.toFixed(3),
          ops: ops.toFixed(3),
          rpg: ts.games > 0 ? (ts.runsScored / ts.games).toFixed(1) : "0.0",
          rapg: ts.games > 0 ? (ts.runsAllowed / ts.games).toFixed(1) : "0.0",
        };
      });

      res.json({
        season,
        battingLeaders,
        pitchingLeaders,
        teamStats: teamStatsArray.sort((a, b) => parseFloat(b.battingAvg) - parseFloat(a.battingAvg)),
        totalGames: seasonGames.length,
      });
    } catch (error) {
      console.error("Failed to fetch league stats:", error);
      res.status(500).json({ message: "Failed to fetch league stats" });
    }
  });

  // ─── Record Book ────────────────────────────────────────────────────────────
  app.get("/api/leagues/:id/record-book", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const [teams, allStandings, allPlayerHistory, allSeasonStats, allCoaches, coachHistory, recruitingSnaps, allGames] =
        await Promise.all([
          storage.getTeamsByLeague(leagueId),
          storage.getAllStandingsByLeague(leagueId),
          storage.getPlayerHistoryByLeague(leagueId),
          storage.getAllPlayerSeasonStatsByLeague(leagueId),
          storage.getCoachesByLeague(leagueId),
          storage.getCoachSeasonHistoryByLeague(leagueId),
          storage.getRecruitingClassSnapshotsAllSeasons(leagueId),
          storage.getGamesByLeague(leagueId),
        ]);

      const teamMap = new Map(teams.map(t => [t.id, t]));

      // ── Season History ──────────────────────────────────────────────────────
      const seasonNums = [...new Set(allStandings.map(s => s.season))].sort((a, b) => b - a);

      const gradeFromScore = (score: number | null) => {
        if (score === null) return null;
        if (score >= 95) return "A+";
        if (score >= 88) return "A";
        if (score >= 80) return "A-";
        if (score >= 72) return "B+";
        if (score >= 65) return "B";
        if (score >= 58) return "B-";
        if (score >= 50) return "C+";
        if (score >= 42) return "C";
        return "C-";
      };

      const seasonHistory = seasonNums.map(season => {
        const seasonStandings = allStandings.filter(s => s.season === season);
        const sorted = [...seasonStandings].sort((a, b) => {
          const awPct = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
          const bwPct = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
          return bwPct - awPct;
        });

        // Determine CWS champion/runner-up from game results (most accurate)
        const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season && g.isComplete);
        let cwsChampionId: string | null = null;
        let cwsRunnerUpId: string | null = null;
        if (cwsGames.length >= 2) {
          const winsMap: Record<string, number> = {};
          for (const g of cwsGames) {
            const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
            winsMap[winnerId] = (winsMap[winnerId] || 0) + 1;
          }
          cwsChampionId = Object.entries(winsMap).find(([_, w]) => w >= 2)?.[0] ?? null;
          const otherIds = Object.keys(winsMap).filter(id => id !== cwsChampionId);
          cwsRunnerUpId = otherIds.length > 0 ? otherIds[0] : null;
        }

        // Fall back to standings leader if no CWS game data
        const champTeamId = cwsChampionId ?? (sorted[0]?.teamId ?? null);
        const runnerUpTeamId = cwsRunnerUpId ?? (sorted[1]?.teamId ?? null);
        const champTeam = champTeamId ? teamMap.get(champTeamId) : null;
        const ruTeam = runnerUpTeamId ? teamMap.get(runnerUpTeamId) : null;
        const champStandings = seasonStandings.find(s => s.teamId === champTeamId);
        const ruStandings = seasonStandings.find(s => s.teamId === runnerUpTeamId);

        // conf champions from conference_championship game results
        const confChampGames = allGames.filter(g => g.phase === "conference_championship" && g.season === season && g.isComplete);
        const confChamps: { teamId: string; teamName: string; confId: string | null }[] = [];
        if (confChampGames.length > 0) {
          for (const g of confChampGames) {
            const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
            const t = teamMap.get(winnerId);
            if (t) confChamps.push({ teamId: winnerId, teamName: t.name, confId: t.conferenceId ?? null });
          }
        } else {
          // Fall back to standings-based conf leaders
          const seen = new Set<string | null>();
          for (const s of sorted) {
            const t = teamMap.get(s.teamId);
            const confId = t?.conferenceId ?? null;
            if (!seen.has(confId)) {
              seen.add(confId);
              confChamps.push({ teamId: s.teamId, teamName: t?.name ?? "", confId });
            }
          }
        }

        // stat leaders for the season from player_season_stats
        const seasonStats = allSeasonStats.filter(p => p.season === season);
        const batters = seasonStats.filter(p => p.ab >= 10);
        const pitchers = seasonStats.filter(p => p.ipOuts >= 3);

        const hrLeader = batters.length ? batters.reduce((best, p) => p.hr > best.hr ? p : best) : null;
        const avgLeader = batters.length ? batters.reduce((best, p) => {
          const avg = p.ab > 0 ? p.h / p.ab : 0;
          const bAvg = best.ab > 0 ? best.h / best.ab : 0;
          return avg > bAvg ? p : best;
        }) : null;
        const eraLeader = pitchers.length ? pitchers.reduce((best, p) => {
          const era = p.ipOuts > 0 ? (p.pEr * 27) / p.ipOuts : 99;
          const bEra = best.ipOuts > 0 ? (best.pEr * 27) / best.ipOuts : 99;
          return era < bEra ? p : best;
        }) : null;

        // recruiting class grade for this season (avg classScore normalized to letter)
        const snapshots = recruitingSnaps.filter(s => s.season === season);
        const avgScore = snapshots.length ? snapshots.reduce((sum, s) => sum + s.classScore, 0) / snapshots.length : null;

        return {
          season,
          championTeamId: champTeam?.id ?? null,
          championName: champTeam?.name ?? null,
          championW: champStandings?.wins ?? 0,
          championL: champStandings?.losses ?? 0,
          runnerUpName: ruTeam?.name ?? null,
          runnerUpW: ruStandings?.wins ?? 0,
          runnerUpL: ruStandings?.losses ?? 0,
          isCwsChampion: cwsChampionId !== null,
          confChampions: confChamps,
          hrLeader: hrLeader ? { name: hrLeader.playerName, value: hrLeader.hr, teamId: hrLeader.teamId, playerId: hrLeader.playerId } : null,
          avgLeader: avgLeader ? {
            name: avgLeader.playerName,
            value: avgLeader.ab > 0 ? (avgLeader.h / avgLeader.ab).toFixed(3) : ".000",
            teamId: avgLeader.teamId, playerId: avgLeader.playerId,
          } : null,
          eraLeader: eraLeader ? {
            name: eraLeader.playerName,
            value: eraLeader.ipOuts > 0 ? ((eraLeader.pEr * 27) / eraLeader.ipOuts).toFixed(2) : "0.00",
            teamId: eraLeader.teamId, playerId: eraLeader.playerId,
          } : null,
          recruitingGrade: gradeFromScore(avgScore),
          winsLeader: sorted[0] ? {
            name: teamMap.get(sorted[0].teamId)?.name ?? "",
            teamId: sorted[0].teamId,
            wins: sorted[0].wins,
            losses: sorted[0].losses,
          } : null,
        };
      });

      // ── Career Batting Leaders (aggregated from player_season_stats) ─────────
      const battersByPlayer = new Map<string, {
        playerId: string; name: string; teamId: string; position: string;
        seasons: number; games: number; ab: number; h: number; hr: number; rbi: number; bb: number;
        hbp: number; doubles: number; triples: number; so: number;
      }>();
      for (const row of allSeasonStats) {
        const PITCHER_POS = ["P", "SP", "RP", "CL", "LHP", "RHP"];
        if (PITCHER_POS.includes(row.position)) continue;
        const key = row.playerId;
        if (!battersByPlayer.has(key)) {
          battersByPlayer.set(key, {
            playerId: row.playerId, name: row.playerName, teamId: row.teamId, position: row.position,
            seasons: 0, games: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0,
            hbp: 0, doubles: 0, triples: 0, so: 0,
          });
        }
        const agg = battersByPlayer.get(key)!;
        agg.seasons++;
        agg.games += row.games;
        agg.ab += row.ab;
        agg.h += row.h;
        agg.hr += row.hr;
        agg.rbi += row.rbi;
        agg.bb += row.bb;
        agg.hbp += row.hbp;
        agg.doubles += row.doubles;
        agg.triples += row.triples;
        agg.so += row.so;
        // Keep most recent team
        agg.teamId = row.teamId;
      }

      // Build last season per player (for graduation year filter)
      const playerLastSeason = new Map<string, number>();
      for (const row of allSeasonStats) {
        const cur = playerLastSeason.get(row.playerId);
        if (cur === undefined || row.season > cur) playerLastSeason.set(row.playerId, row.season);
      }

      const careerBatting = Array.from(battersByPlayer.values())
        .filter(b => b.ab >= 30)
        .map(b => {
          const avg = b.ab > 0 ? b.h / b.ab : 0;
          const obp = (b.ab + b.bb + b.hbp) > 0 ? (b.h + b.bb + b.hbp) / (b.ab + b.bb + b.hbp) : 0;
          const singles = b.h - b.doubles - b.triples - b.hr;
          const tb = singles + b.doubles * 2 + b.triples * 3 + b.hr * 4;
          const slg = b.ab > 0 ? tb / b.ab : 0;
          const ops = obp + slg;
          const wOBA = (b.ab + b.bb + b.hbp) > 0
            ? (0.69 * b.bb + 0.72 * b.hbp + 0.89 * singles + 1.27 * b.doubles + 1.62 * b.triples + 2.10 * b.hr) / (b.ab + b.bb + b.hbp)
            : 0;
          const wRAA = ((wOBA - 0.320) / 1.25) * (b.ab + b.bb + b.hbp);
          const war = wRAA / 10;
          const team = teamMap.get(b.teamId);
          // Status: check if player_history has a matching record for this playerId
          const phRecord = allPlayerHistory.find(ph => `${ph.firstName} ${ph.lastName}` === b.name && ph.teamId === b.teamId);
          const status: string = phRecord ? (phRecord.departureType === "drafted" || phRecord.departureType === "declared" ? "drafted" : "graduated") : "active";
          return {
            playerId: b.playerId, name: b.name, teamName: team?.name ?? "", teamAbbr: team?.abbreviation ?? "",
            teamColor: team?.primaryColor ?? "#888", position: b.position, seasons: b.seasons,
            games: b.games, ab: b.ab, avg: avg.toFixed(3), hr: b.hr, rbi: b.rbi,
            ops: ops.toFixed(3), war: war.toFixed(1), status,
            lastSeason: playerLastSeason.get(b.playerId) ?? 0,
          };
        })
        .sort((a, b) => parseFloat(b.war) - parseFloat(a.war));
      // No .slice — return full list so client can accurately sort by any metric

      // ── Career Pitching Leaders ──────────────────────────────────────────────
      const pitchersByPlayer = new Map<string, {
        playerId: string; name: string; teamId: string; position: string;
        seasons: number; games: number; wins: number; losses: number; ipOuts: number;
        pEr: number; pHits: number; pBb: number; pSo: number;
      }>();
      const PITCHER_POSITIONS = ["P", "SP", "RP", "CL", "LHP", "RHP"];
      for (const row of allSeasonStats) {
        if (!PITCHER_POSITIONS.includes(row.position) && row.ipOuts < 3) continue;
        if (row.ipOuts < 3) continue;
        const key = row.playerId;
        if (!pitchersByPlayer.has(key)) {
          pitchersByPlayer.set(key, {
            playerId: row.playerId, name: row.playerName, teamId: row.teamId, position: row.position,
            seasons: 0, games: 0, wins: 0, losses: 0, ipOuts: 0, pEr: 0, pHits: 0, pBb: 0, pSo: 0,
          });
        }
        const agg = pitchersByPlayer.get(key)!;
        agg.seasons++;
        agg.games += row.pitchingGames;
        agg.wins += row.wins;
        agg.losses += row.losses;
        agg.ipOuts += row.ipOuts;
        agg.pEr += row.pEr;
        agg.pHits += row.pHits;
        agg.pBb += row.pBb;
        agg.pSo += row.pSo;
        agg.teamId = row.teamId;
      }

      const careerPitching = Array.from(pitchersByPlayer.values())
        .filter(p => p.ipOuts >= 9)
        .map(p => {
          const ip = p.ipOuts / 3;
          const era = ip > 0 ? (p.pEr * 9) / ip : 99;
          const whip = ip > 0 ? (p.pBb + p.pHits) / ip : 99;
          const team = teamMap.get(p.teamId);
          const war = Math.max(0, (4.0 - era) * ip / 9);
          const phRecord = allPlayerHistory.find(ph => `${ph.firstName} ${ph.lastName}` === p.name && ph.teamId === p.teamId);
          const status: string = phRecord ? (phRecord.departureType === "drafted" || phRecord.departureType === "declared" ? "drafted" : "graduated") : "active";
          return {
            playerId: p.playerId, name: p.name, teamName: team?.name ?? "", teamAbbr: team?.abbreviation ?? "",
            teamColor: team?.primaryColor ?? "#888", position: p.position, seasons: p.seasons,
            games: p.games, wins: p.wins, losses: p.losses,
            ip: ip.toFixed(1), era: era.toFixed(2), whip: whip.toFixed(2), so: p.pSo, war: war.toFixed(1), status,
            lastSeason: playerLastSeason.get(p.playerId) ?? 0,
          };
        })
        .sort((a, b) => parseFloat(a.era) - parseFloat(b.era));
      // No .slice — return full list so client can accurately sort by any metric

      // ── All-Time Team Records ────────────────────────────────────────────────
      const teamRecordsMap = new Map<string, {
        teamId: string; w: number; l: number; championships: number; postseasonApps: number; bestSeasonW: number;
      }>();
      for (const s of allStandings) {
        if (!teamRecordsMap.has(s.teamId)) {
          teamRecordsMap.set(s.teamId, { teamId: s.teamId, w: 0, l: 0, championships: 0, postseasonApps: 0, bestSeasonW: 0 });
        }
        const rec = teamRecordsMap.get(s.teamId)!;
        rec.w += s.wins;
        rec.l += s.losses;
        if (s.wins > rec.bestSeasonW) rec.bestSeasonW = s.wins;
      }

      // Mark CWS champions from season history
      for (const sh of seasonHistory) {
        if (sh.championTeamId && teamRecordsMap.has(sh.championTeamId)) {
          teamRecordsMap.get(sh.championTeamId)!.championships++;
        }
      }

      // Count postseason appearances per team (super_regionals or CWS)
      const postseasonTeamSet = new Map<string, Set<number>>();
      for (const g of allGames) {
        if (g.phase !== "super_regionals" && g.phase !== "cws") continue;
        const addTeam = (tid: string | null) => {
          if (!tid) return;
          if (!postseasonTeamSet.has(tid)) postseasonTeamSet.set(tid, new Set());
          postseasonTeamSet.get(tid)!.add(g.season);
        };
        addTeam(g.homeTeamId);
        addTeam(g.awayTeamId);
      }
      for (const [tid, seasons] of postseasonTeamSet) {
        if (teamRecordsMap.has(tid)) {
          teamRecordsMap.get(tid)!.postseasonApps = seasons.size;
        }
      }

      // Count all-time 5-star recruits per team
      const fiveStarByTeam = new Map<string, number>();
      for (const snap of recruitingSnaps) {
        fiveStarByTeam.set(snap.teamId, (fiveStarByTeam.get(snap.teamId) ?? 0) + (snap.fiveStars ?? 0));
      }

      const teamRecords = Array.from(teamRecordsMap.values()).map(rec => {
        const t = teamMap.get(rec.teamId);
        const pct = (rec.w + rec.l) > 0 ? rec.w / (rec.w + rec.l) : 0;
        return {
          teamId: rec.teamId, teamName: t?.name ?? "", teamAbbr: t?.abbreviation ?? "",
          teamColor: t?.primaryColor ?? "#888",
          allTimeW: rec.w, allTimeL: rec.l, pct: pct.toFixed(3),
          championships: rec.championships, bestSeasonW: rec.bestSeasonW,
          postseasonApps: rec.postseasonApps,
          allTimeFiveStars: fiveStarByTeam.get(rec.teamId) ?? 0,
        };
      }).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

      // ── Coach Career Stats ──────────────────────────────────────────────────
      const coachStats = allCoaches.map(coach => {
        const history = coachHistory.filter(h => h.coachId === coach.id);
        const totalW = history.reduce((s, h) => s + h.wins, 0);
        const totalL = history.reduce((s, h) => s + h.losses, 0);
        const pct = (totalW + totalL) > 0 ? totalW / (totalW + totalL) : 0;
        const teamsCoached = [...new Set(history.map(h => h.teamName).filter(Boolean))];
        const team = coach.teamId ? teamMap.get(coach.teamId) : null;
        return {
          coachId: coach.id,
          name: `${coach.firstName} ${coach.lastName}`,
          archetype: coach.archetype,
          teamName: team?.name ?? "",
          teamAbbr: team?.abbreviation ?? "",
          teamColor: team?.primaryColor ?? "#888",
          seasons: history.length,
          w: totalW, l: totalL, pct: pct.toFixed(3),
          championships: coach.nationalChampionships,
          confChampionships: coach.confChampionships,
          cwsAppearances: coach.cwsAppearances,
          legacyScore: coach.legacyScore,
          teamsCoached,
        };
      }).sort((a, b) => b.legacyScore - a.legacyScore);

      // ── Recruiting History ──────────────────────────────────────────────────
      // Build first-season per player (for signed class derivation from stats)
      const playerTeamFirstSeason = new Map<string, { season: number; name: string; position: string; teamId: string }>();
      for (const row of [...allSeasonStats].sort((a, b) => a.season - b.season)) {
        if (!playerTeamFirstSeason.has(row.playerId)) {
          playerTeamFirstSeason.set(row.playerId, { season: row.season, name: row.playerName, position: row.position, teamId: row.teamId });
        }
      }
      // Group signed class by season+team
      const signedClassBySeason = new Map<number, Map<string, { name: string; position: string }[]>>();
      for (const data of playerTeamFirstSeason.values()) {
        if (!signedClassBySeason.has(data.season)) signedClassBySeason.set(data.season, new Map());
        const teamMap2 = signedClassBySeason.get(data.season)!;
        if (!teamMap2.has(data.teamId)) teamMap2.set(data.teamId, []);
        teamMap2.get(data.teamId)!.push({ name: data.name, position: data.position });
      }

      const recruitingSeasons = [...new Set(recruitingSnaps.map(s => s.season))].sort((a, b) => b - a);
      const recruitingHistory = recruitingSeasons.map(season => {
        const snaps = recruitingSnaps.filter(s => s.season === season)
          .sort((a, b) => a.classRank - b.classRank);
        const seasonSignedClass = signedClassBySeason.get(season);
        return {
          season,
          snapshots: snaps.map(s => {
            const t = teamMap.get(s.teamId);
            const gradeFromScore2 = (score: number) => {
              if (score >= 95) return "A+";
              if (score >= 88) return "A";
              if (score >= 80) return "A-";
              if (score >= 72) return "B+";
              if (score >= 65) return "B";
              if (score >= 58) return "B-";
              if (score >= 50) return "C+";
              if (score >= 42) return "C";
              return "C-";
            };
            return {
              teamId: s.teamId, teamName: t?.name ?? "", teamAbbr: t?.abbreviation ?? "",
              teamColor: t?.primaryColor ?? "#888", classRank: s.classRank,
              grade: gradeFromScore2(s.classScore), classScore: s.classScore,
              totalCommits: s.totalCommits, fiveStars: s.fiveStars, fourStars: s.fourStars,
              topRecruitName: s.topRecruitName, topRecruitOvr: s.topRecruitOvr, topRecruitStars: s.topRecruitStars,
              signedPlayers: (seasonSignedClass?.get(s.teamId) ?? []).sort((a, b) => a.position.localeCompare(b.position)),
            };
          }),
        };
      });

      // ── Career Fielding Leaders ──────────────────────────────────────────────
      const fieldersByPlayer = new Map<string, {
        playerId: string; name: string; teamId: string; position: string;
        seasons: number; games: number; putouts: number; assists: number;
        errors: number; totalChances: number;
      }>();
      for (const row of allSeasonStats) {
        if ((row.putouts + row.assists + row.fieldingErrors + row.totalChances) === 0) continue;
        const key = row.playerId;
        if (!fieldersByPlayer.has(key)) {
          fieldersByPlayer.set(key, {
            playerId: row.playerId, name: row.playerName, teamId: row.teamId, position: row.position,
            seasons: 0, games: 0, putouts: 0, assists: 0, errors: 0, totalChances: 0,
          });
        }
        const agg = fieldersByPlayer.get(key)!;
        agg.seasons++;
        agg.games += row.games;
        agg.putouts += row.putouts;
        agg.assists += row.assists;
        agg.errors += row.fieldingErrors;
        agg.totalChances += row.totalChances;
        agg.teamId = row.teamId;
      }

      const careerFielding = Array.from(fieldersByPlayer.values())
        .filter(f => f.totalChances >= 10)
        .map(f => {
          const fldPct = f.totalChances > 0 ? ((f.totalChances - f.errors) / f.totalChances) : 1.0;
          const oaa = f.putouts + f.assists - Math.round(f.totalChances * 0.95);
          const team = teamMap.get(f.teamId);
          return {
            playerId: f.playerId, name: f.name, teamName: team?.name ?? "", teamAbbr: team?.abbreviation ?? "",
            teamColor: team?.primaryColor ?? "#888", position: f.position, seasons: f.seasons,
            games: f.games, putouts: f.putouts, assists: f.assists, errors: f.errors,
            totalChances: f.totalChances, fldPct: fldPct.toFixed(3), oaa,
          };
        })
        .sort((a, b) => parseFloat(b.fldPct) - parseFloat(a.fldPct))
        .slice(0, 25);

      // ── Hall of Fame ────────────────────────────────────────────────────────
      // Build career WAR map keyed by playerId (correct aggregation, handles transfers)
      const PITCHER_POS_HOF = ["P", "SP", "RP", "CL", "LHP", "RHP"];
      const careerWarById = new Map<string, number>();
      for (const row of allSeasonStats) {
        let war = 0;
        if (PITCHER_POS_HOF.includes(row.position)) {
          const ip = row.ipOuts / 3;
          war = Math.max(0, (4.0 - (ip > 0 ? (row.pEr * 9) / ip : 99)) * ip / 9);
        } else {
          const singles = row.h - row.doubles - row.triples - row.hr;
          const wOBA = (row.ab + row.bb + row.hbp) > 0
            ? (0.69 * row.bb + 0.72 * row.hbp + 0.89 * singles + 1.27 * row.doubles + 1.62 * row.triples + 2.10 * row.hr) / (row.ab + row.bb + row.hbp)
            : 0;
          war = ((wOBA - 0.320) / 1.25) * (row.ab + row.bb + row.hbp) / 10;
        }
        careerWarById.set(row.playerId, (careerWarById.get(row.playerId) ?? 0) + war);
      }

      // Build lookup: playerName|teamId -> most recent playerId (for history-to-stats linkage)
      // We sort by season desc so the "latest" playerId wins if a player changed name
      const nameTeamToPlayerId = new Map<string, string>();
      for (const row of [...allSeasonStats].sort((a, b) => a.season - b.season)) {
        nameTeamToPlayerId.set(`${row.playerName}|${row.teamId}`, row.playerId);
      }

      const DEPARTURES_HOF = new Set(["graduated", "drafted", "declared"]);

      // Helper: resolve the playerId for a player_history record.
      // Prefer the stored sourcePlayerId (direct FK, always correct), then fall back to
      // the name+teamId string match for legacy records that predate this field.
      const resolveHofPlayerId = (p: typeof allPlayerHistory[0]): string | undefined => {
        if (p.sourcePlayerId) return p.sourcePlayerId;
        const pName = `${p.firstName} ${p.lastName}`;
        return nameTeamToPlayerId.get(`${pName}|${p.teamId}`);
      };

      const hofEligible = allPlayerHistory.filter(p => {
        if (!DEPARTURES_HOF.has(p.departureType ?? "")) return false;
        const resolvedPlayerId = resolveHofPlayerId(p);
        const careerWar = resolvedPlayerId ? (careerWarById.get(resolvedPlayerId) ?? 0) : 0;
        return p.overall >= 400 || careerWar >= 2;
      });

      const hallOfFame = hofEligible.map(p => {
        const t = teamMap.get(p.teamId);
        const pName = `${p.firstName} ${p.lastName}`;
        const PITCHER_POS2 = ["P", "SP", "RP", "CL", "LHP", "RHP"];
        const resolvedPlayerId = resolveHofPlayerId(p);
        const careerWar = resolvedPlayerId ? (careerWarById.get(resolvedPlayerId) ?? 0) : 0;
        const playerStats = resolvedPlayerId
          ? allSeasonStats.filter(s => s.playerId === resolvedPlayerId)
          : allSeasonStats.filter(s => s.playerName === pName && s.teamId === p.teamId);
        const bestSeason = playerStats.length ? playerStats.reduce((best, s) => {
          if (PITCHER_POS2.includes(p.position)) {
            const era = s.ipOuts > 0 ? (s.pEr * 27) / s.ipOuts : 99;
            const bEra = best.ipOuts > 0 ? (best.pEr * 27) / best.ipOuts : 99;
            return era < bEra ? s : best;
          }
          return s.hr > best.hr ? s : best;
        }) : null;
        const bestStatStr = bestSeason ? (PITCHER_POS2.includes(p.position)
          ? `${bestSeason.pSo} SO, ${((bestSeason.pEr * 27) / Math.max(bestSeason.ipOuts, 1)).toFixed(2)} ERA`
          : `${bestSeason.hr} HR, .${Math.round(bestSeason.ab > 0 ? bestSeason.h / bestSeason.ab * 1000 : 0).toString().padStart(3, "0")} AVG`
        ) : null;
        // Legacy score: OVR + careerWAR*5 + draft bonus
        const draftBonus = p.draftRound === 1 ? 30 : p.draftRound === 2 ? 20 : p.draftRound === 3 ? 10 : 0;
        const legacyScore = Math.round(p.overall + careerWar * 5 + draftBonus);
        return {
          id: p.id, name: pName, position: p.position,
          teamName: t?.name ?? "", teamAbbr: t?.abbreviation ?? "", teamColor: t?.primaryColor ?? "#888",
          overall: p.overall, starRating: p.starRating, seasonsPlayed: p.seasonsPlayed,
          departureType: p.departureType, draftRound: p.draftRound, departedSeason: p.departedSeason,
          abilities: p.abilities ?? [],
          bestSeasonStat: bestStatStr,
          careerWar: parseFloat(careerWar.toFixed(1)),
          legacyScore,
        };
      }).sort((a, b) => b.legacyScore - a.legacyScore).slice(0, 50);

      res.json({
        seasons: seasonHistory,
        careerBattingLeaders: careerBatting,
        careerPitchingLeaders: careerPitching,
        careerFieldingLeaders: careerFielding,
        teamRecords,
        coachStats,
        recruitingHistory,
        hallOfFame,
        meta: { currentSeason: league.currentSeason, totalSeasons: seasonNums.length },
      });
    } catch (error) {
      console.error("Failed to fetch record book:", error);
      res.status(500).json({ message: "Failed to fetch record book" });
    }
  });

  app.get("/api/leagues/:leagueId/players/:playerId/career-stats", requireAuth, async (req, res) => {
    try {
      const rawStats = await storage.getPlayerSeasonStats(req.params.playerId, req.params.leagueId);
      const stats = [...rawStats].sort((a, b) => (a.season ?? 0) - (b.season ?? 0));

      const seasonStats = stats.map(s => {
        const ip = s.ipOuts / 3;
        const avg = s.ab > 0 ? (s.h / s.ab) : 0;
        const obp = (s.ab + s.bb + s.hbp) > 0 ? (s.h + s.bb + s.hbp) / (s.ab + s.bb + s.hbp) : 0;
        const singles = s.h - s.doubles - s.triples - s.hr;
        const totalBases = singles + s.doubles * 2 + s.triples * 3 + s.hr * 4;
        const slg = s.ab > 0 ? totalBases / s.ab : 0;
        const ops = obp + slg;
        const era = ip > 0 ? (s.pEr * 9) / ip : 0;
        const fip = ip > 0 ? ((13 * s.pHr + 3 * s.pBb - 2 * s.pSo) / ip) + 3.10 : 0;
        const whip = ip > 0 ? (s.pBb + s.pHits) / ip : 0;
        const babip = (s.ab - s.so - s.hr) > 0 ? (s.h - s.hr) / (s.ab - s.so - s.hr) : 0;
        const wOBA = (s.ab + s.bb + s.hbp) > 0
          ? (0.69 * s.bb + 0.72 * s.hbp + 0.89 * singles + 1.27 * s.doubles + 1.62 * s.triples + 2.10 * s.hr) / (s.ab + s.bb + s.hbp)
          : 0;
        const avgExitVelo = s.games > 0 ? s.exitVeloTotal / s.games : 0;
        const barrelPct = s.ballsInPlay > 0 ? (s.barrels / s.ballsInPlay) * 100 : 0;
        const hardHitPct = s.ballsInPlay > 0 ? (s.hardHits / s.ballsInPlay) * 100 : 0;
        const fldPct = s.totalChances > 0 ? (s.putouts + s.assists) / s.totalChances : 0;
        const bfApprox = Math.round(ip * 3 + s.pHits + s.pBb);
        const kPct = bfApprox > 0 ? (s.pSo / bfApprox) * 100 : 0;
        const whiffRate = s.totalPitches > 0 ? (s.whiffs / s.totalPitches) * 100 : 0;
        const avgSpinRate = s.pitchingGames > 0 ? Math.round(s.spinRateTotal / s.pitchingGames) : 0;

        return {
          season: s.season,
          teamId: s.teamId,
          position: s.position,
          endSeasonOvr: s.endSeasonOvr ?? null,
          games: s.games,
          ab: s.ab, r: s.r, h: s.h, doubles: s.doubles, triples: s.triples,
          hr: s.hr, rbi: s.rbi, bb: s.bb, hbp: s.hbp, so: s.so, sb: s.sb, cs: s.cs,
          avg: avg.toFixed(3), obp: obp.toFixed(3), slg: slg.toFixed(3), ops: ops.toFixed(3),
          babip: babip.toFixed(3), wOBA: wOBA.toFixed(3),
          avgExitVelo: avgExitVelo.toFixed(1), barrelPct: barrelPct.toFixed(1), hardHitPct: hardHitPct.toFixed(1),
          fldPct: fldPct.toFixed(3),
          pitchingGames: s.pitchingGames,
          wins: s.wins, losses: s.losses,
          ipDisplay: `${Math.floor(ip)}.${Math.round((ip % 1) * 3)}`,
          pHits: s.pHits, pRuns: s.pRuns, pEr: s.pEr, pBb: s.pBb, pSo: s.pSo, pHr: s.pHr,
          era: era.toFixed(2), fip: Math.max(0, fip).toFixed(2), whip: whip.toFixed(2),
          kPct: kPct.toFixed(1), whiffRate: whiffRate.toFixed(1), avgSpinRate,
        };
      });

      res.json({ playerId: req.params.playerId, leagueId: req.params.leagueId, seasons: seasonStats });
    } catch (error) {
      console.error("Failed to fetch career stats:", error);
      res.status(500).json({ message: "Failed to fetch career stats" });
    }
  });

  // Schedule routes
  app.get("/api/leagues/:id/schedule", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const leagueGames = await storage.getGamesByLeague(league.id);
      const leagueTeams = await storage.getTeamsByLeague(league.id);

      const gamesWithTeams = leagueGames.map((game) => ({
        ...game,
        homeTeam: leagueTeams.find((t) => t.id === game.homeTeamId),
        awayTeam: leagueTeams.find((t) => t.id === game.awayTeamId),
      }));

      const coaches = await storage.getCoachesByLeague(league.id);
      const coach = coaches.find(c => c.userId === req.session.userId);
      const userTeam = coach ? leagueTeams.find(t => t.id === coach.teamId) : null;

      const humanTeamIds = leagueTeams.filter(t => !t.isCpu).map(t => t.id);
      // Map human team IDs to their coach last names for H2H badge display
      const humanCoachNames: Record<string, string> = {};
      for (const c of coaches) {
        if (c.teamId && humanTeamIds.includes(c.teamId)) {
          humanCoachNames[c.teamId] = `${c.firstName} ${c.lastName}`;
        }
      }
      const gameReportsList = await storage.getGameReportsByLeague(league.id);
      // Narrow report payload: only expose status-level fields needed by schedule UI
      // (avoid leaking full box score data to all league members)
      const reportsByGameId = Object.fromEntries(
        gameReportsList.map(r => [r.gameId, {
          id: r.id,
          gameId: r.gameId,
          status: r.status,
          reporterUserId: r.reporterUserId,
          reporterTeamId: r.reporterTeamId,
          homeScore: r.homeScore,
          awayScore: r.awayScore,
          disputeReason: r.disputeReason,
          createdAt: r.createdAt,
        }])
      );

      res.json({
        games: gamesWithTeams,
        currentWeek: league.currentWeek,
        currentSeason: league.currentSeason,
        userTeamId: userTeam?.id || null,
        humanTeamIds,
        humanCoachNames,
        reportsByGameId,
        isCommissioner: hasCommissionerAccess(league, req.session.userId),
      });
    } catch (error) {
      console.error("Failed to fetch schedule:", error);
      res.status(500).json({ message: "Failed to fetch schedule" });
    }
  });

  // Matchup preview — head-to-head data for a specific game
  app.get("/api/leagues/:id/games/:gameId/matchup-preview", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const allLeagueGames = await storage.getGamesByLeague(league.id);
      const game = allLeagueGames.find(g => g.id === req.params.gameId);
      if (!game) return res.status(404).json({ message: "Game not found" });

      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const homeTeam = leagueTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = leagueTeams.find(t => t.id === game.awayTeamId);
      if (!homeTeam || !awayTeam) return res.status(404).json({ message: "Teams not found" });

      const [coaches, allStandings, homePlayers, awayPlayers, allLeaguePlayers] = await Promise.all([
        storage.getCoachesByLeague(league.id),
        storage.getStandingsByLeague(league.id, league.currentSeason),
        storage.getPlayersByTeam(homeTeam.id),
        storage.getPlayersByTeam(awayTeam.id),
        storage.getPlayersByLeague(league.id),
      ]);

      const homeCoach = coaches.find(c => c.teamId === homeTeam.id);
      const awayCoach = coaches.find(c => c.teamId === awayTeam.id);
      const homeStandings = allStandings.find(s => s.teamId === homeTeam.id);
      const awayStandings = allStandings.find(s => s.teamId === awayTeam.id);

      const top3 = (playerList: typeof homePlayers) =>
        [...playerList]
          .sort((a, b) => (b.overall || 0) - (a.overall || 0))
          .slice(0, 3)
          .map(p => ({ name: `${p.firstName} ${p.lastName}`, position: p.position, overall: p.overall, starRating: p.starRating }));

      // Compute power ranking composite for each team (same formula as /power-rankings)
      const computeComposite = (playerList: typeof homePlayers): number => {
        if (playerList.length === 0) return 0;
        const avgStar = playerList.reduce((s, p) => s + (p.starRating || 1), 0) / playerList.length;
        return Math.round(avgStar * 20);
      };

      // Compute league-wide power rank positions
      const playersByTeamId = new Map<string, typeof allLeaguePlayers>();
      for (const p of allLeaguePlayers) {
        if (!playersByTeamId.has(p.teamId)) playersByTeamId.set(p.teamId, []);
        playersByTeamId.get(p.teamId)!.push(p);
      }
      const teamComposites = leagueTeams.map(t => ({
        teamId: t.id,
        composite: computeComposite(playersByTeamId.get(t.id) || []),
      })).sort((a, b) => b.composite - a.composite);
      const homeRank = teamComposites.findIndex(t => t.teamId === homeTeam.id) + 1;
      const awayRank = teamComposites.findIndex(t => t.teamId === awayTeam.id) + 1;
      const homeComposite = computeComposite(homePlayers);
      const awayComposite = computeComposite(awayPlayers);

      // H2H all-time record (excluding the current game itself)
      const h2hGames = allLeagueGames.filter(g =>
        g.isComplete && g.id !== game.id && (
          (g.homeTeamId === homeTeam.id && g.awayTeamId === awayTeam.id) ||
          (g.homeTeamId === awayTeam.id && g.awayTeamId === homeTeam.id)
        )
      );
      const homeH2HWins = h2hGames.filter(g =>
        (g.homeTeamId === homeTeam.id && (g.homeScore ?? 0) > (g.awayScore ?? 0)) ||
        (g.awayTeamId === homeTeam.id && (g.awayScore ?? 0) > (g.homeScore ?? 0))
      ).length;
      const awayH2HWins = h2hGames.length - homeH2HWins;

      res.json({
        homeTeam: {
          id: homeTeam.id,
          name: homeTeam.name,
          abbreviation: homeTeam.abbreviation,
          primaryColor: homeTeam.primaryColor,
          secondaryColor: homeTeam.secondaryColor,
          mascot: homeTeam.mascot,
          prestige: homeTeam.prestige,
          isCpu: homeTeam.isCpu,
          coachName: homeCoach ? `${homeCoach.firstName} ${homeCoach.lastName}` : "CPU Coach",
          coachArchetype: homeCoach?.archetype ?? null,
          record: { wins: homeStandings?.wins ?? 0, losses: homeStandings?.losses ?? 0 },
          powerRank: homeRank,
          composite: homeComposite,
          top3: top3(homePlayers),
        },
        awayTeam: {
          id: awayTeam.id,
          name: awayTeam.name,
          abbreviation: awayTeam.abbreviation,
          primaryColor: awayTeam.primaryColor,
          secondaryColor: awayTeam.secondaryColor,
          mascot: awayTeam.mascot,
          prestige: awayTeam.prestige,
          isCpu: awayTeam.isCpu,
          coachName: awayCoach ? `${awayCoach.firstName} ${awayCoach.lastName}` : "CPU Coach",
          coachArchetype: awayCoach?.archetype ?? null,
          record: { wins: awayStandings?.wins ?? 0, losses: awayStandings?.losses ?? 0 },
          powerRank: awayRank,
          composite: awayComposite,
          top3: top3(awayPlayers),
        },
        h2h: { homeWins: homeH2HWins, awayWins: awayH2HWins, totalGames: h2hGames.length },
        game: {
          id: game.id,
          isComplete: game.isComplete,
          isConference: game.isConference,
          gameType: game.gameType,
          week: game.week,
          season: game.season,
        },
      });
    } catch (error) {
      console.error("Failed to fetch matchup preview:", error);
      res.status(500).json({ message: "Failed to fetch matchup preview" });
    }
  });

  app.patch("/api/leagues/:id/games/:gameId", requireAuth, async (req, res) => {
    try {
      const result = gameScoreSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid score data" });
      }

      const { homeScore, awayScore } = result.data;

      // Quick-score is commissioner-only; all coaches must use the Report Game flow
      const patchLeagueId = req.params.id as string;
      const patchGameId = req.params.gameId as string;
      const patchLeague = await storage.getLeague(patchLeagueId);
      if (!patchLeague) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(patchLeague, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can submit quick scores. Coaches must use the Report Game flow." });
      }

      // Block quick-score when a pending or disputed report exists for this game.
      // Coaches must use the Report Game flow; commissioner must resolve the report first.
      const existingReport = await storage.getGameReport(patchGameId);
      if (existingReport && (existingReport.status === "pending" || existingReport.status === "disputed")) {
        return res.status(409).json({
          message: `Cannot quick-score: a ${existingReport.status} game report exists. Use Force Finalize on the commissioner page to resolve it.`,
        });
      }

      const patchGame = await storage.getGame(patchGameId);
      if (!patchGame) return res.status(404).json({ message: "Game not found" });

      const game = await storage.updateGame(patchGameId, {
        homeScore,
        awayScore,
        isComplete: true,
      });

      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Update standings
      await updateStandingsForGame(patchLeagueId, game.season, game.homeTeamId, game.awayTeamId, homeScore, awayScore, game.isConference);

      // Award XP to coaches for wins
      const leagueTeams = await storage.getTeamsByLeague(patchLeagueId);
      const homeTeam = leagueTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = leagueTeams.find(t => t.id === game.awayTeamId);
      const homeWon = homeScore > awayScore;
      
      // XP values
      const WIN_XP = 100;
      const LOSS_XP = 25;
      
      // Update home team coach
      if (homeTeam?.coachId) {
        const homeCoach = await storage.getCoach(homeTeam.coachId);
        if (homeCoach) {
          const newXp = homeCoach.xp + (homeWon ? WIN_XP : LOSS_XP);
          const newLevel = Math.floor(newXp / 1000) + 1;
          const skillPointsGained = newLevel > homeCoach.level ? 1 : 0;
          const hcWins = homeCoach.careerWins + (homeWon ? 1 : 0);
          const hcLosses = homeCoach.careerLosses + (homeWon ? 0 : 1);
          const hcConfWins = homeCoach.confWins + (game.isConference && homeWon ? 1 : 0);
          const hcConfLosses = homeCoach.confLosses + (game.isConference && !homeWon ? 1 : 0);
          await storage.updateCoach(homeCoach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: homeCoach.skillPoints + skillPointsGained,
            careerWins: hcWins,
            careerLosses: hcLosses,
            confWins: hcConfWins,
            confLosses: hcConfLosses,
            legacyScore: computeLegacyScore({ ...homeCoach, careerWins: hcWins }),
          });
        }
      }
      
      // Update away team coach
      if (awayTeam?.coachId) {
        const awayCoach = await storage.getCoach(awayTeam.coachId);
        if (awayCoach) {
          const newXp = awayCoach.xp + (homeWon ? LOSS_XP : WIN_XP);
          const newLevel = Math.floor(newXp / 1000) + 1;
          const skillPointsGained = newLevel > awayCoach.level ? 1 : 0;
          const acWins = awayCoach.careerWins + (homeWon ? 0 : 1);
          const acLosses = awayCoach.careerLosses + (homeWon ? 1 : 0);
          const acConfWins = awayCoach.confWins + (game.isConference && !homeWon ? 1 : 0);
          const acConfLosses = awayCoach.confLosses + (game.isConference && homeWon ? 1 : 0);
          await storage.updateCoach(awayCoach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: awayCoach.skillPoints + skillPointsGained,
            careerWins: acWins,
            careerLosses: acLosses,
            confWins: acConfWins,
            confLosses: acConfLosses,
            legacyScore: computeLegacyScore({ ...awayCoach, careerWins: acWins }),
          });
        }
      }

      await storage.createAuditLog({
        leagueId: patchLeagueId,
        userId: req.session.userId,
        action: "Game Score Submitted",
        details: `Final: ${awayScore} - ${homeScore}`,
      });

      res.json(game);
    } catch (error) {
      console.error("Failed to update game:", error);
      res.status(500).json({ message: "Failed to update game" });
    }
  });

  // ============ MANUAL GAME REPORTING ============

  app.get("/api/leagues/:id/games/:gameId/report", requireAuth, async (req, res) => {
    try {
      const fetchLeagueId = req.params.id as string;
      const fetchGameId = req.params.gameId as string;

      const fetchLeague = await storage.getLeague(fetchLeagueId);
      if (!fetchLeague) return res.status(404).json({ message: "League not found" });

      const fetchGame = await storage.getGame(fetchGameId);
      if (!fetchGame || fetchGame.leagueId !== fetchLeagueId) {
        return res.status(404).json({ message: "Game not found in this league" });
      }

      // Only involved coaches or the commissioner may read a game report
      const isCommissioner = hasCommissionerAccess(fetchLeague, req.session.userId);
      if (!isCommissioner) {
        const fetchCoaches = await storage.getCoachesByLeague(fetchLeagueId);
        const fetchCoach = fetchCoaches.find(c => c.userId === req.session.userId);
        const isInvolved = fetchCoach?.teamId && (fetchCoach.teamId === fetchGame.homeTeamId || fetchCoach.teamId === fetchGame.awayTeamId);
        if (!isInvolved) {
          return res.status(403).json({ message: "Only involved coaches or the commissioner can view this game report" });
        }
      }

      // Returns the report in whatever status it is currently in (pending, disputed, confirmed,
      // or null if no report exists yet). Callers should inspect report.status rather than
      // assuming the response is always a pending report.
      const report = await storage.getGameReport(fetchGameId);
      res.json(report || null);
    } catch (error) {
      console.error("Failed to fetch game report:", error);
      res.status(500).json({ message: "Failed to fetch game report" });
    }
  });

  app.get("/api/leagues/:id/game-reports", requireAuth, async (req, res) => {
    try {
      const reportLeagueId = req.params.id as string;
      const reportLeague = await storage.getLeague(reportLeagueId);
      if (!reportLeague) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(reportLeague, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can view all game reports" });
      }
      const reports = await storage.getGameReportsByLeague(reportLeagueId);
      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch game reports:", error);
      res.status(500).json({ message: "Failed to fetch game reports" });
    }
  });

  app.get("/api/leagues/:id/game-reports/pending", requireAuth, async (req, res) => {
    try {
      const reportLeagueId = req.params.id as string;
      const reportLeague = await storage.getLeague(reportLeagueId);
      if (!reportLeague) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(reportLeague, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can view pending game reports" });
      }
      const allReports = await storage.getGameReportsByLeague(reportLeagueId);
      res.json(allReports.filter(r => r.status === "pending" || r.status === "disputed"));
    } catch (error) {
      console.error("Failed to fetch pending game reports:", error);
      res.status(500).json({ message: "Failed to fetch pending game reports" });
    }
  });

  app.post("/api/leagues/:id/games/:gameId/report", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const game = await storage.getGame(gameId);
      if (!game) return res.status(404).json({ message: "Game not found" });
      if (game.leagueId !== leagueId) return res.status(404).json({ message: "Game not found in this league" });
      if (game.isComplete) return res.status(400).json({ message: "Game is already complete" });

      const reportablePhases = ["regular", "conference_championship", "super_regionals", "cws"];
      if (!reportablePhases.includes(game.phase ?? "")) {
        return res.status(400).json({ message: "Manual reporting is not available for this game phase" });
      }

      const existing = await storage.getGameReport(gameId);
      // Block re-reporting entirely: game_reports.gameId is unique, so any
      // existing row (pending, disputed, or confirmed) prevents a new insert.
      // A confirmed report means the game should already be complete (caught above).
      if (existing) {
        const statusMsg = existing.status === "confirmed"
          ? "This game has already been confirmed and finalized."
          : "An active report already exists for this game. Wait for it to be resolved before submitting a new one.";
        return res.status(400).json({ message: statusMsg });
      }

      // Any authenticated league member may report any game (human-vs-human or vs-CPU).
      const coaches = await storage.getCoachesByLeague(leagueId);
      const coach = coaches.find(c => c.userId === req.session.userId);
      const isLeagueMember = hasCommissionerAccess(league, req.session.userId) || !!coach;
      if (!isLeagueMember) {
        return res.status(403).json({ message: "Only league members can report game results" });
      }

      const { homeScore, awayScore, homeHits, awayHits, homeErrors, awayErrors, inningScores, homeBoxData, awayBoxData } = req.body;

      if (typeof homeScore !== "number" || typeof awayScore !== "number") {
        return res.status(400).json({ message: "homeScore and awayScore are required" });
      }

      // Box score payload is optional — simple score-only reports (from the manual score modal)
      // are accepted without box data. Stats will not be accumulated for these reports,
      // which is acceptable since the game was not simulated. The commissioner must confirm.
      const hasFullBoxScore = Array.isArray(inningScores) && inningScores.length > 0
        && homeBoxData?.batting?.length && homeBoxData?.pitching?.length
        && awayBoxData?.batting?.length && awayBoxData?.pitching?.length;

      // Server-side consistency validation
      if (homeScore < 0 || awayScore < 0) {
        return res.status(400).json({ message: "Scores cannot be negative" });
      }
      // Only run detailed consistency checks when full box score is provided
      if (hasFullBoxScore) {
        if (Array.isArray(inningScores) && inningScores.length > 0) {
          const inningHomeTotal = inningScores.reduce((sum: number, inn: number[]) => sum + (inn[1] ?? 0), 0);
          const inningAwayTotal = inningScores.reduce((sum: number, inn: number[]) => sum + (inn[0] ?? 0), 0);
          if (inningHomeTotal !== homeScore) {
            return res.status(400).json({ message: `Home inning totals (${inningHomeTotal}) must match reported home score (${homeScore})` });
          }
          if (inningAwayTotal !== awayScore) {
            return res.status(400).json({ message: `Away inning totals (${inningAwayTotal}) must match reported away score (${awayScore})` });
          }
        }
        if (homeBoxData?.batting && Array.isArray(homeBoxData.batting)) {
          const battingRuns = homeBoxData.batting.reduce((s: number, b: { r?: number }) => s + (b.r ?? 0), 0);
          if (battingRuns !== homeScore) {
            return res.status(400).json({ message: `Home batting runs (${battingRuns}) must match reported home score (${homeScore})` });
          }
          if (homeBoxData.batting.length < 9) {
            return res.status(400).json({ message: `Home team requires at least 9 batters (got ${homeBoxData.batting.length})` });
          }
        }
        if (awayBoxData?.batting && Array.isArray(awayBoxData.batting)) {
          const battingRuns = awayBoxData.batting.reduce((s: number, b: { r?: number }) => s + (b.r ?? 0), 0);
          if (battingRuns !== awayScore) {
            return res.status(400).json({ message: `Away batting runs (${battingRuns}) must match reported away score (${awayScore})` });
          }
          if (awayBoxData.batting.length < 9) {
            return res.status(400).json({ message: `Away team requires at least 9 batters (got ${awayBoxData.batting.length})` });
          }
        }
        const ipRe = /^\d+(\.[012])?$/;
        if (homeBoxData?.pitching && Array.isArray(homeBoxData.pitching)) {
          for (const p of homeBoxData.pitching as Array<{ ip?: string; name?: string }>) {
            if (p.ip && !ipRe.test(p.ip)) {
              return res.status(400).json({ message: `Invalid IP format "${p.ip}" for ${p.name ?? "pitcher"}. Use format like "6.0" or "2.1"` });
            }
          }
        }
        if (awayBoxData?.pitching && Array.isArray(awayBoxData.pitching)) {
          for (const p of awayBoxData.pitching as Array<{ ip?: string; name?: string }>) {
            if (p.ip && !ipRe.test(p.ip)) {
              return res.status(400).json({ message: `Invalid IP format "${p.ip}" for ${p.name ?? "pitcher"}. Use format like "6.0" or "2.1"` });
            }
          }
        }
      }

      // For vs-CPU games, auto-confirm immediately (no opposing human to confirm/dispute).
      const allTeams = await storage.getTeamsByLeague(leagueId);
      const homeTeam = allTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = allTeams.find(t => t.id === game.awayTeamId);
      const isCpuGame = !!(homeTeam?.isCpu || awayTeam?.isCpu);

      const report = await storage.createGameReport({
        gameId: game.id,
        leagueId,
        reporterUserId: req.session.userId!,
        // Only set reporterTeamId if the reporter's coached team is one of the game's two teams.
        reporterTeamId: (coach?.teamId && (coach.teamId === game.homeTeamId || coach.teamId === game.awayTeamId))
          ? coach.teamId
          : null,
        homeScore,
        awayScore,
        homeHits: homeHits ?? 0,
        awayHits: awayHits ?? 0,
        homeErrors: homeErrors ?? 0,
        awayErrors: awayErrors ?? 0,
        inningScores: inningScores ?? null,
        homeBoxData: homeBoxData ?? null,
        awayBoxData: awayBoxData ?? null,
        status: isCpuGame ? "confirmed" : "pending",
        confirmedByUserId: isCpuGame ? req.session.userId! : null,
        disputedByUserId: null,
        disputeReason: null,
      });

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Game Report Submitted",
        details: `Reported: ${awayScore}-${homeScore}${isCpuGame ? " (auto-confirmed vs CPU)" : ""}`,
      });

      // Auto-finalize vs-CPU games immediately
      if (isCpuGame) {
        await finalizeReportedGame(report, game, leagueId);
        return res.json({ ...report, autoConfirmed: true });
      }

      res.json(report);
    } catch (error) {
      console.error("Failed to create game report:", error);
      res.status(500).json({ message: "Failed to create game report" });
    }
  });

  // Commissioner-only: fetch full report data for edit pre-population
  app.get("/api/leagues/:id/games/:gameId/report", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only commissioners can access full report data" });
      }
      const report = await storage.getGameReport(gameId);
      if (!report) return res.status(404).json({ message: "No report found for this game" });
      if (report.leagueId !== leagueId) return res.status(404).json({ message: "Report not found in this league" });
      res.json(report);
    } catch (error) {
      console.error("Failed to fetch game report:", error);
      res.status(500).json({ message: "Failed to fetch game report" });
    }
  });

  // Commissioner-only: edit an existing report in place without changing its status
  app.patch("/api/leagues/:id/games/:gameId/report", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only commissioners can edit a submitted report" });
      }
      const existing = await storage.getGameReport(gameId);
      if (!existing) return res.status(404).json({ message: "No report found for this game" });
      if (existing.leagueId !== leagueId) return res.status(404).json({ message: "Report not found in this league" });
      if (existing.status === "confirmed") {
        return res.status(400).json({ message: "Cannot edit a confirmed report" });
      }
      const { homeScore, awayScore, homeHits, awayHits, homeErrors, awayErrors, inningScores, homeBoxData, awayBoxData } = req.body;
      if (typeof homeScore !== "number" || typeof awayScore !== "number") {
        return res.status(400).json({ message: "homeScore and awayScore are required" });
      }
      if (!Array.isArray(inningScores) || inningScores.length === 0) {
        return res.status(400).json({ message: "inningScores is required and must be a non-empty array" });
      }
      if (!homeBoxData || !Array.isArray(homeBoxData.batting) || homeBoxData.batting.length === 0) {
        return res.status(400).json({ message: "homeBoxData.batting is required and must be a non-empty array" });
      }
      if (!homeBoxData || !Array.isArray(homeBoxData.pitching) || homeBoxData.pitching.length === 0) {
        return res.status(400).json({ message: "homeBoxData.pitching is required and must be a non-empty array" });
      }
      if (!awayBoxData || !Array.isArray(awayBoxData.batting) || awayBoxData.batting.length === 0) {
        return res.status(400).json({ message: "awayBoxData.batting is required and must be a non-empty array" });
      }
      if (!awayBoxData || !Array.isArray(awayBoxData.pitching) || awayBoxData.pitching.length === 0) {
        return res.status(400).json({ message: "awayBoxData.pitching is required and must be a non-empty array" });
      }
      if (homeScore < 0 || awayScore < 0) {
        return res.status(400).json({ message: "Scores cannot be negative" });
      }
      const inningHomeTotal = inningScores.reduce((sum: number, inn: number[]) => sum + (inn[1] ?? 0), 0);
      const inningAwayTotal = inningScores.reduce((sum: number, inn: number[]) => sum + (inn[0] ?? 0), 0);
      if (inningHomeTotal !== homeScore) {
        return res.status(400).json({ message: `Home inning totals (${inningHomeTotal}) must match reported home score (${homeScore})` });
      }
      if (inningAwayTotal !== awayScore) {
        return res.status(400).json({ message: `Away inning totals (${inningAwayTotal}) must match reported away score (${awayScore})` });
      }
      const homeBattingRuns = homeBoxData.batting.reduce((s: number, b: { r?: number }) => s + (b.r ?? 0), 0);
      if (homeBattingRuns !== homeScore) {
        return res.status(400).json({ message: `Home batting runs (${homeBattingRuns}) must match reported home score (${homeScore})` });
      }
      if (homeBoxData.batting.length < 9) {
        return res.status(400).json({ message: `Home team requires at least 9 batters (got ${homeBoxData.batting.length})` });
      }
      const awayBattingRuns = awayBoxData.batting.reduce((s: number, b: { r?: number }) => s + (b.r ?? 0), 0);
      if (awayBattingRuns !== awayScore) {
        return res.status(400).json({ message: `Away batting runs (${awayBattingRuns}) must match reported away score (${awayScore})` });
      }
      if (awayBoxData.batting.length < 9) {
        return res.status(400).json({ message: `Away team requires at least 9 batters (got ${awayBoxData.batting.length})` });
      }
      const ipRe = /^\d+(\.[012])?$/;
      for (const p of homeBoxData.pitching as Array<{ ip?: string; name?: string }>) {
        if (p.ip && !ipRe.test(p.ip)) {
          return res.status(400).json({ message: `Invalid IP format "${p.ip}" for ${p.name ?? "pitcher"}. Use format like "6.0" or "2.1"` });
        }
      }
      for (const p of awayBoxData.pitching as Array<{ ip?: string; name?: string }>) {
        if (p.ip && !ipRe.test(p.ip)) {
          return res.status(400).json({ message: `Invalid IP format "${p.ip}" for ${p.name ?? "pitcher"}. Use format like "6.0" or "2.1"` });
        }
      }
      const updated = await storage.updateGameReport(existing.id, {
        homeScore,
        awayScore,
        homeHits: homeHits ?? 0,
        awayHits: awayHits ?? 0,
        homeErrors: homeErrors ?? 0,
        awayErrors: awayErrors ?? 0,
        inningScores: inningScores ?? null,
        homeBoxData: homeBoxData ?? null,
        awayBoxData: awayBoxData ?? null,
      });
      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Game Report Edited",
        details: `Commissioner updated report: ${awayScore}-${homeScore}`,
      });
      res.json(updated);
    } catch (error) {
      console.error("Failed to update game report:", error);
      res.status(500).json({ message: "Failed to update game report" });
    }
  });

  app.post("/api/leagues/:id/games/:gameId/report/confirm", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const report = await storage.getGameReport(gameId);
      if (!report) return res.status(404).json({ message: "No report found for this game" });
      if (report.status !== "pending") return res.status(400).json({ message: "Report is not pending" });

      const game = await storage.getGame(gameId);
      if (!game) return res.status(404).json({ message: "Game not found" });
      if (game.leagueId !== leagueId) return res.status(404).json({ message: "Game not found in this league" });

      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      const coaches = await storage.getCoachesByLeague(leagueId);
      const coach = coaches.find(c => c.userId === req.session.userId);
      // Determine which team the current user coaches
      const userTeamId = coach?.teamId ?? null;
      // Determine which team submitted the report (reporter's team)
      const reporterCoach = coaches.find(c => c.userId === report.reporterUserId);
      const rawReporterTeamId = reporterCoach?.teamId ?? report.reporterTeamId;
      // Only treat reporterTeamId as valid if it's actually one of the game's two teams.
      // Commissioners acting outside their own matchup have null here.
      const reporterTeamId = (rawReporterTeamId === game.homeTeamId || rawReporterTeamId === game.awayTeamId)
        ? rawReporterTeamId : null;
      // When commissioner submitted (reporterTeamId null), any involved coach may confirm.
      // Otherwise only the opposing team's coach may confirm.
      const isInvolvedCoach = userTeamId != null && (userTeamId === game.homeTeamId || userTeamId === game.awayTeamId);
      const opposingTeamId = reporterTeamId != null
        ? (reporterTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
        : null;
      const isOpposingCoach = reporterTeamId == null ? isInvolvedCoach : (userTeamId != null && userTeamId === opposingTeamId);

      if (!isCommissioner && !isOpposingCoach) {
        return res.status(403).json({ message: "Only the opposing team's coach or the commissioner can confirm this report" });
      }

      if (game.isComplete) {
        // Game was already finalized (e.g. quick-scored before guard was added, or other race).
        // Just mark the report confirmed without re-running standings/stats accumulation.
        await storage.updateGameReport(report.id, {
          status: "confirmed",
          confirmedByUserId: req.session.userId,
        });
        return res.json({ message: "Report confirmed (game was already finalized)" });
      }

      // Finalize first; only update status if finalization succeeds (prevents partial state)
      await finalizeReportedGame(report, game, leagueId);

      await storage.updateGameReport(report.id, {
        status: "confirmed",
        confirmedByUserId: req.session.userId,
      });

      res.json({ message: "Report confirmed and game finalized" });
    } catch (error) {
      console.error("Failed to confirm game report:", error);
      res.status(500).json({ message: "Failed to confirm game report" });
    }
  });

  app.post("/api/leagues/:id/games/:gameId/report/dispute", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const report = await storage.getGameReport(gameId);
      if (!report) return res.status(404).json({ message: "No report found for this game" });
      if (report.status !== "pending") return res.status(400).json({ message: "Report is not pending" });

      const game = await storage.getGame(gameId);
      if (!game) return res.status(404).json({ message: "Game not found" });
      if (game.leagueId !== leagueId) return res.status(404).json({ message: "Game not found in this league" });

      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      const coaches = await storage.getCoachesByLeague(leagueId);
      const coach = coaches.find(c => c.userId === req.session.userId);
      const userTeamId = coach?.teamId ?? null;
      const reporterCoach = coaches.find(c => c.userId === report.reporterUserId);
      const rawReporterTeamId = reporterCoach?.teamId ?? report.reporterTeamId;
      const reporterTeamId = (rawReporterTeamId === game.homeTeamId || rawReporterTeamId === game.awayTeamId)
        ? rawReporterTeamId : null;
      const isInvolvedCoach = userTeamId != null && (userTeamId === game.homeTeamId || userTeamId === game.awayTeamId);
      const opposingTeamId = reporterTeamId != null
        ? (reporterTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
        : null;
      const isOpposingCoach = reporterTeamId == null ? isInvolvedCoach : (userTeamId != null && userTeamId === opposingTeamId);

      if (!isCommissioner && !isOpposingCoach) {
        return res.status(403).json({ message: "Only the opposing team's coach or the commissioner can dispute this report" });
      }
      if (!isCommissioner && report.reporterUserId === req.session.userId) {
        return res.status(400).json({ message: "You cannot dispute your own report" });
      }

      const { reason } = req.body;

      await storage.updateGameReport(report.id, {
        status: "disputed",
        disputedByUserId: req.session.userId,
        disputeReason: reason || "Score disputed by opposing coach",
      });

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Game Report Disputed",
        details: reason || "Score disputed by opposing coach",
      });

      res.json({ message: "Report disputed. Commissioner will review." });
    } catch (error) {
      console.error("Failed to dispute game report:", error);
      res.status(500).json({ message: "Failed to dispute game report" });
    }
  });

  app.post("/api/leagues/:id/games/:gameId/report/finalize", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can force-finalize a game report" });
      }

      const report = await storage.getGameReport(gameId);
      if (!report) return res.status(404).json({ message: "No report found for this game" });
      if (report.leagueId !== leagueId) return res.status(404).json({ message: "Report not found in this league" });

      const game = await storage.getGame(gameId);
      if (!game) return res.status(404).json({ message: "Game not found" });
      if (game.leagueId !== leagueId) return res.status(404).json({ message: "Game not found in this league" });
      if (game.isComplete) return res.status(400).json({ message: "Game is already complete" });

      // Finalize first; only mark confirmed if finalization succeeds (prevents partial state)
      await finalizeReportedGame(report, game, leagueId);
      await storage.updateGameReport(report.id, { status: "confirmed", confirmedByUserId: req.session.userId });

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Game Report Force-Finalized",
        details: `Commissioner finalized: ${report.awayScore}-${report.homeScore}`,
      });

      res.json({ message: "Game finalized by commissioner" });
    } catch (error) {
      console.error("Failed to finalize game report:", error);
      res.status(500).json({ message: "Failed to finalize game report" });
    }
  });

  function ipToDecimalRep(ip: string): number {
    const [whole, frac] = ip.split(".");
    return (parseInt(whole) || 0) + (parseInt(frac) || 0) / 3;
  }
  function fmtAvg(ab: number, h: number): string {
    if (ab <= 0) return ".000";
    const v = h / ab;
    return v >= 1 ? "1.000" : v.toFixed(3).slice(1); // ".xyz" format
  }
  function fmtEra(er: number, ip: string): string {
    const dec = ipToDecimalRep(ip);
    if (dec <= 0) return "--";
    return (9 * er / dec).toFixed(2);
  }
  function enrichBoxData(raw: Record<string, unknown> | null, errors: number, fallbackR = 0, fallbackH = 0): Record<string, unknown> {
    if (!raw) return { batting: [], pitching: [], totals: { ab: 0, r: fallbackR, h: fallbackH, rbi: 0, bb: 0, so: 0 }, errors };
    const batting = Array.isArray(raw.batting)
      ? (raw.batting as Array<Record<string, unknown>>).map(b => ({
          ...b,
          avg: b.avg ?? fmtAvg((b.ab as number) ?? 0, (b.h as number) ?? 0),
        }))
      : raw.batting;
    const pitching = Array.isArray(raw.pitching)
      ? (raw.pitching as Array<Record<string, unknown>>).map(p => ({
          ...p,
          era: p.era ?? fmtEra((p.er as number) ?? 0, (p.ip as string) ?? "0.0"),
        }))
      : raw.pitching;
    return { ...raw, batting, pitching, errors };
  }

  async function finalizeReportedGame(report: GameReport, game: Game, leagueId: string) {
    const { homeScore, awayScore } = report;
    const homeBoxData = report.homeBoxData as Record<string, unknown> | null;
    const awayBoxData = report.awayBoxData as Record<string, unknown> | null;
    const inningScores = (report.inningScores as number[][] | null) ?? [];

    const homeHits = report.homeHits ?? 0;
    const awayHits = report.awayHits ?? 0;
    const homeErrors = report.homeErrors ?? 0;
    const awayErrors = report.awayErrors ?? 0;

    const boxScore = {
      innings: inningScores,
      home: enrichBoxData(homeBoxData, homeErrors, homeScore, homeHits),
      away: enrichBoxData(awayBoxData, awayErrors, awayScore, awayHits),
    };

    await storage.updateGame(game.id, {
      homeScore,
      awayScore,
      isComplete: true,
      isManuallyReported: true,
      reportedByUserId: report.reporterUserId,
      boxScore: JSON.stringify(boxScore),
    });

    const league = await storage.getLeague(leagueId);
    if (league) {
      await updateStandingsForGame(leagueId, game.season, game.homeTeamId, game.awayTeamId, homeScore, awayScore, game.isConference);

      if (homeBoxData) {
        await accumulatePlayerStats(leagueId, game.season, game.homeTeamId, homeBoxData);
      }
      if (awayBoxData) {
        await accumulatePlayerStats(leagueId, game.season, game.awayTeamId, awayBoxData);
      }

      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const homeTeam = leagueTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = leagueTeams.find(t => t.id === game.awayTeamId);
      const homeWon = homeScore > awayScore;
      const desc = `${awayTeam?.name || "Away"} ${awayScore}, ${homeTeam?.name || "Home"} ${homeScore} (Reported)`;

      await storage.createLeagueEvent({
        leagueId,
        teamId: homeWon ? game.homeTeamId : game.awayTeamId,
        teamName: homeWon ? (homeTeam?.name || null) : (awayTeam?.name || null),
        teamAbbreviation: homeWon ? (homeTeam?.abbreviation || null) : (awayTeam?.abbreviation || null),
        teamPrimaryColor: homeWon ? (homeTeam?.primaryColor || null) : (awayTeam?.primaryColor || null),
        eventType: "GAME_RESULT",
        description: desc,
        season: game.season,
        week: game.week,
      });
    }
  }

  // ============ PLAY-BY-PLAY SIMULATION ============
  app.post("/api/leagues/:id/games/:gameId/play-by-play", requireAuth, async (req, res) => {
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

        for (const pos of ["C", "1B", "2B", "3B", "SS"]) {
          const candidates = positionPlayers.filter(p => p.position === pos && !used.has(p.id));
          if (candidates.length > 0) {
            candidates.sort((a, b) => ((b.hitForAvg || 0) + (b.power || 0)) - ((a.hitForAvg || 0) + (a.power || 0)));
            selected.push(candidates[0]);
            used.add(candidates[0].id);
          }
        }

        const outfielders = positionPlayers.filter(p => p.position === "OF" && !used.has(p.id));
        outfielders.sort((a, b) => ((b.hitForAvg || 0) + (b.power || 0)) - ((a.hitForAvg || 0) + (a.power || 0)));
        const ofPositions = ["LF", "CF", "RF"];
        for (let i = 0; i < 3 && i < outfielders.length; i++) {
          selected.push(outfielders[i]);
          used.add(outfielders[i].id);
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

        // ── Batting order construction ──────────────────────────────────────
        // Platoon: reward vsLHP for RHBs/SHBs when facing a LH starter
        const platoonOBPBonus = (p: Player) =>
          opposingSpHand === "L" && (p.batHand || "R") !== "L"
            ? (p.vsLHP || 50) * 0.25 : 0;
        const obpScore   = (p: Player) => (p.hitForAvg || 50) * 0.50 + (p.speed || 50) * 0.25 + platoonOBPBonus(p);
        const powerScore = (p: Player) => (p.power    || 50) * 0.65 + (p.hitForAvg || 50) * 0.20 + platoonOBPBonus(p) * 0.5;
        const ovScore    = (p: Player) => (p.overall  || 300) / 6   + platoonOBPBonus(p) * 0.5;

        const byOBP = [...selected].sort((a, b) => obpScore(b) - obpScore(a));
        const byPwr = [...selected].sort((a, b) => powerScore(b) - powerScore(a));
        const byOv  = [...selected].sort((a, b) => ovScore(b) - ovScore(a));

        const ordered: (Player | null)[] = new Array(9).fill(null);
        const slotted = new Set<string>();
        const pick = (arr: Player[]) => arr.find(p => !slotted.has(p.id));
        const assign = (slot: number, arr: Player[]) => {
          const p = pick(arr);
          if (p) { ordered[slot] = p; slotted.add(p.id); }
        };

        assign(3, byPwr);          // 4-hole: best power (cleanup)
        assign(2, byOv);           // 3-hole: best overall hitter
        assign(0, byOBP);          // leadoff: best OBP/speed
        assign(1, byOBP);          // 2-hole: second-best OBP
        assign(4, byPwr);          // 5-hole: second power bat
        for (let slot = 5; slot < 9; slot++) assign(slot, byOv);
        for (let slot = 0; slot < 9; slot++) { if (!ordered[slot]) assign(slot, byOv); }

        let ofIdx = 0;
        const lineup = (ordered as Player[]).map((p, i) => {
          let displayPos = p.position;
          if (p.position === "OF") {
            displayPos = ofPositions[ofIdx] || "OF";
            ofIdx++;
          }
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

      function pickPitchingStaff(players: Player[], gameType: string | null | undefined) {
        const pitchers = players.filter(p => p.position === "P");
        pitchers.sort((a, b) => (b.overall || 0) - (a.overall || 0));

        const gameTypeToRole: Record<string, string> = {
          "friday": "FRI", "saturday": "SAT", "sunday": "SUN", "midweek": "MID",
        };
        const starterRoles = ["FRI", "SAT", "SUN", "MID"];
        const relieverRoles = ["LRP", "MR", "MR1", "MR2", "MR3", "SU", "CP"];

        const targetRole = gameType ? gameTypeToRole[gameType] : null;
        let starter = targetRole
          ? pitchers.find(p => p.pitchingRole === targetRole) || null
          : null;
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
      const homeStaff = pickPitchingStaff(homePlayers, game.gameType);
      const awayStaff = pickPitchingStaff(awayPlayers, game.gameType);
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

      await storage.updateGame(gameId, {
        homeScore,
        awayScore,
        isComplete: true,
        boxScore: JSON.stringify(boxScore),
      });

      await updateStandingsForGame(leagueId, game.season, game.homeTeamId, game.awayTeamId, homeScore, awayScore, game.isConference);

      await accumulatePlayerStats(leagueId, game.season, game.homeTeamId, boxScore.home);
      await accumulatePlayerStats(leagueId, game.season, game.awayTeamId, boxScore.away);

      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const homeTeamData = leagueTeams.find(t => t.id === game.homeTeamId);
      const awayTeamData = leagueTeams.find(t => t.id === game.awayTeamId);
      const homeWon = homeScore > awayScore;
      const WIN_XP = 100;
      const LOSS_XP = 25;

      if (homeTeamData?.coachId) {
        const homeCoach = await storage.getCoach(homeTeamData.coachId);
        if (homeCoach) {
          const newXp = homeCoach.xp + (homeWon ? WIN_XP : LOSS_XP);
          const newLevel = Math.floor(newXp / 1000) + 1;
          const skillPointsGained = newLevel > homeCoach.level ? 1 : 0;
          const hcWins = homeCoach.careerWins + (homeWon ? 1 : 0);
          const hcLosses = homeCoach.careerLosses + (homeWon ? 0 : 1);
          const hcConfWins = homeCoach.confWins + (game.isConference && homeWon ? 1 : 0);
          const hcConfLosses = homeCoach.confLosses + (game.isConference && !homeWon ? 1 : 0);
          await storage.updateCoach(homeCoach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: homeCoach.skillPoints + skillPointsGained,
            careerWins: hcWins,
            careerLosses: hcLosses,
            confWins: hcConfWins,
            confLosses: hcConfLosses,
            legacyScore: computeLegacyScore({ ...homeCoach, careerWins: hcWins }),
          });
        }
      }

      if (awayTeamData?.coachId) {
        const awayCoach = await storage.getCoach(awayTeamData.coachId);
        if (awayCoach) {
          const newXp = awayCoach.xp + (homeWon ? LOSS_XP : WIN_XP);
          const newLevel = Math.floor(newXp / 1000) + 1;
          const skillPointsGained = newLevel > awayCoach.level ? 1 : 0;
          const acWins = awayCoach.careerWins + (homeWon ? 0 : 1);
          const acLosses = awayCoach.careerLosses + (homeWon ? 1 : 0);
          const acConfWins = awayCoach.confWins + (game.isConference && !homeWon ? 1 : 0);
          const acConfLosses = awayCoach.confLosses + (game.isConference && homeWon ? 1 : 0);
          await storage.updateCoach(awayCoach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: awayCoach.skillPoints + skillPointsGained,
            careerWins: acWins,
            careerLosses: acLosses,
            confWins: acConfWins,
            confLosses: acConfLosses,
            legacyScore: computeLegacyScore({ ...awayCoach, careerWins: acWins }),
          });
        }
      }

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
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      // Only commissioners and co-commissioners can access commissioner data
      const allCoaches = await storage.getCoachesByLeague(league.id);
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can access this page" });
      }

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
        };
      });

      // Compute per-team roster sizes and flag any oversized rosters (>35 = catastrophic
      // double-insert threshold set in finalizeWalkonsPhase). Surface to commissioner UI
      // so they can spot and fix duplicate-player issues without digging through logs.
      const rosterSizes = await Promise.all(
        leagueTeams.map(async t => ({ id: t.id, name: t.name, count: (await storage.getPlayersByTeam(t.id)).length }))
      );
      const oversizedTeams = rosterSizes
        .filter(r => r.count > 35)
        .map(r => `${r.name} (${r.count} players)`);

      res.json({
        league,
        auditLogs: auditLogsData,
        readyCoaches,
        totalCoaches: humanTeams.length,
        invites,
        humanCoaches,
        oversizedTeams,
      });
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

  // ============ ADVANCE PROGRESS STORE ============
  // In-memory map: leagueId -> { stage, pct, updatedAt }
  const advanceProgress = new Map<string, { stage: string; pct: number; updatedAt: number }>();

  function setAdvanceProgress(leagueId: string, stage: string, pct: number) {
    advanceProgress.set(leagueId, { stage, pct, updatedAt: Date.now() });
  }

  function clearAdvanceProgress(leagueId: string) {
    advanceProgress.delete(leagueId);
  }

  app.get("/api/leagues/:id/advance-progress", requireAuth, async (req, res) => {
    const entry = advanceProgress.get(req.params.id);
    if (!entry) {
      return res.json({ active: false, stage: "idle", pct: 0 });
    }
    // Auto-expire stale entries (>60s) so clients don't hang
    if (Date.now() - entry.updatedAt > 60_000) {
      advanceProgress.delete(req.params.id);
      return res.json({ active: false, stage: "idle", pct: 0 });
    }
    return res.json({ active: true, stage: entry.stage, pct: entry.pct });
  });

  // ============ FORCE ADVANCE ============
  app.post("/api/leagues/:id/force-advance", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can force-advance" });
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

  app.post("/api/leagues/:id/advance", requireAuth, async (req, res) => {
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

      // Concurrent-advance guard — reject duplicate requests while one is in flight
      if (advancingLeagues.has(leagueId)) {
        return res.status(409).json({ message: "League advance already in progress. Please wait." });
      }
      advancingLeagues.add(leagueId);

      setAdvanceProgress(leagueId, "initializing", 5);
      // Auto-clear progress and lock once the response is fully sent
      res.on("finish", () => {
        clearAdvanceProgress(leagueId);
        advancingLeagues.delete(leagueId);
      });

      // ============ POWER RANKINGS SNAPSHOT ============
      // Capture rankings before any changes via SQL aggregation (3 aggregate queries vs 3 full-table loads)
      try {
        const snapshot = await storage.computeLeaguePowerRankings(leagueId);
        await storage.updateLeague(leagueId, { prevPowerRankings: snapshot } as any);
      } catch (snapErr) {
        console.error("[power-rankings-snapshot] Failed to snapshot rankings:", snapErr);
      }

      // ============ DEADLINE AUTO-READY ============
      // Track teams whose coaches were auto-readied so CPU can recruit on their behalf
      const deadlineForcedTeamIds = new Set<string>();
      if (league.phaseDeadline && new Date(league.phaseDeadline) <= new Date()) {
        const allLeagueCoaches = await storage.getCoachesByLeague(leagueId);
        const allLeagueTeams = await storage.getTeamsByLeague(leagueId);
        // Only non-auto-pilot human teams — auto-pilot teams are already handled by runCpuRecruiting
        const humanTeamIds = new Set(allLeagueTeams.filter(t => !t.isCpu && !t.isAutoPilot).map(t => t.id));
        const nonReadyHumanCoaches = allLeagueCoaches.filter(c => c.teamId && humanTeamIds.has(c.teamId) && !c.isReady);
        if (nonReadyHumanCoaches.length > 0) {
          await Promise.all(nonReadyHumanCoaches.map(c => storage.updateCoach(c.id, { isReady: true })));
          // Record which teams were deadline-forced so CPU runs recruiting for them
          for (const c of nonReadyHumanCoaches) {
            if (c.teamId) deadlineForcedTeamIds.add(c.teamId);
          }
          // For the walk-on phase the advance gate checks team.walkonReady, not coach.isReady.
          // Auto-set walkonReady on each human team that was just forced ready so the gate unblocks.
          if (league.currentPhase === "offseason_walkons") {
            const teamsToUnblock = allLeagueTeams.filter(t => deadlineForcedTeamIds.has(t.id) && !t.walkonReady);
            if (teamsToUnblock.length > 0) {
              await Promise.all(teamsToUnblock.map(t => storage.updateTeam(t.id, { walkonReady: true })));
            }
          }
          // CPU fill-in: for human teams that were force-advanced during a recruiting phase,
          // run CPU recruiting at all_american difficulty so their week isn't wasted.
          const recruitingPhases = ["recruiting", "preseason", "regular_season"];
          if (recruitingPhases.includes(league.currentPhase)) {
            const nonAutoPilotForcedIds = new Set(
              nonReadyHumanCoaches
                .filter(c => {
                  const t = allLeagueTeams.find(t => t.id === c.teamId);
                  return t && !t.isAutoPilot;
                })
                .map(c => c.teamId!)
            );
            if (nonAutoPilotForcedIds.size > 0) {
              await runCpuRecruiting(leagueId, currentWeek, league.currentSeason, false, nonAutoPilotForcedIds)
                .catch(e => console.error("[deadline-cpu-fill] Error running CPU fill-in:", e));
            }
          }
          try {
            await storage.createLeagueEvent({
              leagueId,
              eventType: "PHASE_CHANGE",
              description: `Deadline passed — ${nonReadyHumanCoaches.length} coach${nonReadyHumanCoaches.length !== 1 ? "es" : ""} auto-advanced.`,
              season: league.currentSeason,
              week: currentWeek,
            });
          } catch (e) { console.error("Deadline auto-ready feed error:", e); }
        }
      }

      // ============ HUMAN READINESS GATE ============
      // For preseason, spring_training, and regular_season: block the advance when any human
      // coach hasn't marked ready and the phase deadline hasn't yet passed.
      // (Deadline-passed path is already handled above, so if we reach here the deadline is future/unset.)
      // Auto-pilot teams are treated as always ready — skip them in the gate check.
      const readinessGatedPhases = ["preseason", "spring_training", "regular_season"];
      if (readinessGatedPhases.includes(league.currentPhase)) {
        const deadlinePassed = league.phaseDeadline && new Date(league.phaseDeadline) <= new Date();
        if (!deadlinePassed) {
          const gateCoaches = await storage.getCoachesByLeague(leagueId);
          const gateTeams = await storage.getTeamsByLeague(leagueId);
          // Auto-pilot teams count as ready — exclude them from the gate
          const humanGateTeams = gateTeams.filter(t => !t.isCpu && !t.isAutoPilot);
          const humanTeamIdSet = new Set(humanGateTeams.map(t => t.id));
          const notReadyCoaches = gateCoaches.filter(c => c.teamId && humanTeamIdSet.has(c.teamId) && !c.isReady);
          if (notReadyCoaches.length > 0) {
            const notReadyTeamIds = new Set(notReadyCoaches.map(c => c.teamId!));
            const waitingTeams = humanGateTeams.filter(t => notReadyTeamIds.has(t.id)).map(t => t.name);
            const readyCount = humanGateTeams.length - waitingTeams.length;
            return res.status(400).json({
              message: `Not all coaches have marked ready. ${readyCount}/${humanGateTeams.length} ready. Waiting on: ${waitingTeams.join(", ")}`,
              readyCount,
              totalHumanTeams: humanGateTeams.length,
              waitingOn: waitingTeams,
            });
          }
        }
      }

      // Determine max weeks for season based on phase
      const seasonWeeks: Record<string, number> = {
        "short": 5,
        "medium": 5,
        "long": 10,
      };
      const maxWeeks = seasonWeeks[league.seasonLength || "medium"] || 5;
      
      // ============ CPU RECRUITING AI ============
      setAdvanceProgress(leagueId, "cpu_recruiting", 15);
      if (league.currentPhase === "recruiting" || league.currentPhase === "preseason" || league.currentPhase === "regular_season") {
        console.time("[advance-perf] cpu-recruiting");
        await runCpuRecruiting(leagueId, currentWeek, league.currentSeason, false, deadlineForcedTeamIds);
        console.timeEnd("[advance-perf] cpu-recruiting");
      }

      // ============ STORYLINE EVENTS ============
      // Active only during the in-season phases so all arcs conclude before offseason begins.
      if (["recruiting", "preseason", "spring_training", "regular_season"].includes(league.currentPhase)) {
        try {
          // Self-heal: if no storyline recruits exist but recruits do exist, this dynasty
          // was started with a saved class before the fix — initialize them now.
          const existingStorylines = await storage.getStorylineRecruitsByLeague(leagueId, league.currentSeason);
          if (existingStorylines.length === 0) {
            const existingRecruits = await storage.getRecruitsByLeague(leagueId);
            if (existingRecruits.length > 0) {
              console.log(`[storylines] self-heal: no storyline recruits found for league ${leagueId} season ${league.currentSeason}, initializing now`);
              await initializeStorylineRecruits(leagueId, league.currentSeason);
            }
          }
          await generateAndResolveStorylineEvents(leagueId, league.currentSeason, nextWeek, league.seasonLength ?? "medium");
        } catch (err) {
          console.error("[storylines] Failed to generate/resolve storyline events:", err);
        }
      }
      
      // ============ RECRUIT STAGE PROGRESSION ============
      setAdvanceProgress(leagueId, "recruit_stages", 45);
      console.time("[advance-perf] recruit-stages");
      await updateRecruitStages(leagueId, nextWeek);
      console.timeEnd("[advance-perf] recruit-stages");
      
      // ============ RESET WEEKLY ACTIONS ============
      // Also reset isReady so coaches must re-confirm readiness each week.
      const coaches = await storage.getCoachesByLeague(leagueId);
      await Promise.all(coaches.map(coach => 
        storage.updateCoach(coach.id, {
          scoutActionsUsed: 0,
          recruitActionsUsed: 0,
          isReady: false,
        })
      ));

      // ============ AUTO-SIMULATE REGULAR SEASON GAMES ============
      setAdvanceProgress(leagueId, "game_sim", 60);
      const seasonGames = await storage.getGamesByLeagueSeason(leagueId, league.currentSeason);
      const incompleteGames = seasonGames.filter(g => 
        g.week === currentWeek && 
        g.phase === "regular" && 
        !g.isComplete
      );
      
      const leagueTeamsForSim = await storage.getTeamsByLeague(leagueId);
      const WIN_XP = 100;
      const LOSS_XP = 25;

      // Fetch prior completed games BEFORE simulation so H2H records are accurate
      const priorCompletedGames = (await storage.getGamesByLeague(leagueId)).filter(g => g.isComplete);

      console.time("[advance-perf] game-sim");
      const gameResults = await Promise.all(incompleteGames.map(async (game) => {
        const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType);
        await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, isComplete: true, boxScore: result.boxScore });
        return { game, result };
      }));
      console.timeEnd("[advance-perf] game-sim");

      // Build per-user inning scoreboard data (non-blocking, best-effort)
      const simUserCoach = coaches.find((c: any) => c.userId === req.session.userId);
      const simUserTeamId = simUserCoach?.teamId;
      let userTeamGame: {
        homeTeam: string; awayTeam: string; homeAbbr: string; awayAbbr: string;
        homeScore: number; awayScore: number; inningScores: number[][];
        homeHits: number; awayHits: number; homeErrors: number; awayErrors: number; isHome: boolean;
      } | undefined;
      if (simUserTeamId && gameResults.length > 0) {
        const userGame = gameResults.find(({ game }) =>
          game.homeTeamId === simUserTeamId || game.awayTeamId === simUserTeamId
        );
        if (userGame) {
          try {
            const box = JSON.parse(userGame.result.boxScore);
            const homeTeamObj = leagueTeamsForSim.find((t: any) => t.id === userGame.game.homeTeamId);
            const awayTeamObj = leagueTeamsForSim.find((t: any) => t.id === userGame.game.awayTeamId);
            userTeamGame = {
              homeTeam: homeTeamObj?.name ?? "Home",
              awayTeam: awayTeamObj?.name ?? "Away",
              homeAbbr: homeTeamObj?.abbreviation ?? "HME",
              awayAbbr: awayTeamObj?.abbreviation ?? "AWY",
              homeScore: userGame.result.homeScore,
              awayScore: userGame.result.awayScore,
              inningScores: box.innings ?? [],
              homeHits: box.home?.totals?.h ?? 0,
              awayHits: box.away?.totals?.h ?? 0,
              homeErrors: box.home?.errors ?? 0,
              awayErrors: box.away?.errors ?? 0,
              isHome: userGame.game.homeTeamId === simUserTeamId,
              homeColor: homeTeamObj?.primaryColor ?? "#FFD700",
              awayColor: awayTeamObj?.primaryColor ?? "#7eb8f7",
            };
          } catch { /* non-critical */ }
        }
      }

      const coachXpAccum = new Map<string, { xp: number; wins: number; losses: number; confWins: number; confLosses: number }>();

      // Parallelize standings updates and stat accumulation — each game is independent
      setAdvanceProgress(leagueId, "standings", 80);
      console.time("[advance-perf] standings-and-stats");
      await Promise.all(gameResults.map(async ({ game, result }) => {
        await updateStandingsForGame(leagueId, league.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore, game.isConference);
        try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, league.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, league.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }

        const homeTeamSim = leagueTeamsForSim.find(t => t.id === game.homeTeamId);
        const awayTeamSim = leagueTeamsForSim.find(t => t.id === game.awayTeamId);
        const homeWonSim = result.homeScore > result.awayScore;

        if (homeTeamSim?.coachId) {
          const acc = coachXpAccum.get(homeTeamSim.coachId) || { xp: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0 };
          acc.xp += homeWonSim ? WIN_XP : LOSS_XP;
          acc.wins += homeWonSim ? 1 : 0;
          acc.losses += homeWonSim ? 0 : 1;
          acc.confWins += game.isConference && homeWonSim ? 1 : 0;
          acc.confLosses += game.isConference && !homeWonSim ? 1 : 0;
          coachXpAccum.set(homeTeamSim.coachId, acc);
        }
        if (awayTeamSim?.coachId) {
          const acc = coachXpAccum.get(awayTeamSim.coachId) || { xp: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0 };
          acc.xp += homeWonSim ? LOSS_XP : WIN_XP;
          acc.wins += homeWonSim ? 0 : 1;
          acc.losses += homeWonSim ? 1 : 0;
          acc.confWins += game.isConference && !homeWonSim ? 1 : 0;
          acc.confLosses += game.isConference && homeWonSim ? 1 : 0;
          coachXpAccum.set(awayTeamSim.coachId, acc);
        }
      }));
      console.timeEnd("[advance-perf] standings-and-stats");

      // coaches was already fetched — build a lookup map to avoid per-coach DB round-trips
      const coachMapForXp = new Map(coaches.map((c: any) => [c.id, c]));
      await Promise.all([...coachXpAccum.entries()].map(async ([coachId, acc]) => {
        const coach = coachMapForXp.get(coachId);
        if (!coach) return;
        const newXp = coach.xp + acc.xp;
        const newLevel = Math.floor(newXp / 1000) + 1;
        const skillPointsGained = Math.max(0, newLevel - coach.level);
        const newCareerWins = coach.careerWins + acc.wins;
        const newConfWins = coach.confWins + acc.confWins;
        const newConfLosses = coach.confLosses + acc.confLosses;
        await storage.updateCoach(coach.id, {
          xp: newXp,
          level: newLevel,
          skillPoints: coach.skillPoints + skillPointsGained,
          careerWins: newCareerWins,
          careerLosses: coach.careerLosses + acc.losses,
          confWins: newConfWins,
          confLosses: newConfLosses,
          legacyScore: computeLegacyScore({ ...coach, careerWins: newCareerWins }),
        });
      }));

      // ============ AUTO-GENERATE NEWS + ACTIVITY FEED (fire-and-forget) ============
      // These are non-critical for the advance response — kick off in the background
      // so the HTTP response is not blocked waiting for news/feed writes.
      if (incompleteGames.length > 0) {
        const completedThisWeek = gameResults.map(gr => ({
          ...gr.game,
          homeScore: gr.result.homeScore,
          awayScore: gr.result.awayScore,
          isComplete: true,
          boxScore: gr.result.boxScore,
        }));
        // News articles — fire-and-forget
        generateGameNewsArticles(leagueId, completedThisWeek, leagueTeamsForSim, league.currentSeason, currentWeek, league.currentPhase)
          .catch(e => console.error("News generation error:", e));
        if (currentWeek % 3 === 0) {
          generateConferenceUpdateNews(leagueId, leagueTeamsForSim, league.currentSeason, currentWeek)
            .catch(e => console.error("Conference news error:", e));
        }
        // Activity feed — build all event payloads then batch-insert in the background
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
              const h2hPrior = priorCompletedGames.filter(g =>
                (g.homeTeamId === homeTeamFeed.id && g.awayTeamId === awayTeamFeed.id) ||
                (g.homeTeamId === awayTeamFeed.id && g.awayTeamId === homeTeamFeed.id)
              );
              const winnerPriorWins = h2hPrior.filter(g =>
                (g.homeTeamId === winner.id && (g.homeScore ?? 0) > (g.awayScore ?? 0)) ||
                (g.awayTeamId === winner.id && (g.awayScore ?? 0) > (g.homeScore ?? 0))
              ).length;
              const loserPriorWins = h2hPrior.length - winnerPriorWins;
              const winnerNewWins = winnerPriorWins + 1;
              const margin = winScore - lossScore;
              const resultFlair = margin === 1 ? "edges" : margin <= 3 ? "defeats" : "handles";
              description = `RIVALRY: ${winner.abbreviation} ${resultFlair} ${loser.abbreviation} ${winScore}-${lossScore}${game.isConference ? " (Conf)" : ""} — Series ${winnerNewWins}-${loserPriorWins} ${winner.abbreviation}`;
            }

            feedEvents.push({
              leagueId,
              teamId: winner.id,
              teamName: winner.name,
              teamAbbreviation: winner.abbreviation,
              teamPrimaryColor: winner.primaryColor ?? null,
              eventType: isRivalry ? "RIVALRY_RESULT" : "GAME_RESULT",
              description,
              season: league.currentSeason,
              week: currentWeek,
            });
          }
          // Fire-and-forget parallel inserts for all feed events
          Promise.all(feedEvents.map(ev => storage.createLeagueEvent(ev)))
            .catch(e => console.error("Game feed event error:", e));
        } catch (e) { console.error("Game feed event error:", e); }
      }

      setAdvanceProgress(leagueId, "finalizing", 95);

      // ============ POSTSEASON / SEASON PROGRESSION ============
      const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(league.currentPhase);

      if (isPostseason) {
        if (league.currentPhase === "conference_championship") {
          const confGames = (await storage.getGamesByLeague(leagueId))
            .filter(g => g.phase === "conference_championship" && g.season === league.currentSeason && !g.isComplete);
          
          // Parallelize all conference championship games — each matchup is independent
          console.time("[advance-perf] conf-champ-games");
          const confGameResults = await Promise.all(confGames.map(async (game) => {
            const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType || "friday");
            await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, isComplete: true, boxScore: result.boxScore });
            await updateStandingsForGame(leagueId, league.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore);
            try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, league.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, league.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
            try {
              const homeWon = result.homeScore > result.awayScore;
              const confWinner = leagueTeamsForSim.find(t => t.id === (homeWon ? game.homeTeamId : game.awayTeamId));
              const confLoser = leagueTeamsForSim.find(t => t.id === (homeWon ? game.awayTeamId : game.homeTeamId));
              if (confWinner && confLoser) {
                const winScore = homeWon ? result.homeScore : result.awayScore;
                const lossScore = homeWon ? result.awayScore : result.homeScore;
                await storage.createLeagueEvent({
                  leagueId,
                  teamId: confWinner.id,
                  teamName: confWinner.name,
                  teamAbbreviation: confWinner.abbreviation,
                  teamPrimaryColor: confWinner.primaryColor ?? null,
                  eventType: "GAME_RESULT",
                  description: `${confWinner.abbreviation} def. ${confLoser.abbreviation} ${winScore}-${lossScore} (Conf Champ)`,
                  season: league.currentSeason,
                  week: currentWeek,
                });
              }
            } catch (e) { console.error("Conf champ feed event error:", e); }
            return { game, result };
          }));
          console.timeEnd("[advance-perf] conf-champ-games");
          // Extract user's conf champ game if they played one
          if (simUserTeamId && !userTeamGame) {
            const userCcResult = confGameResults.find(({ game }) =>
              game.homeTeamId === simUserTeamId || game.awayTeamId === simUserTeamId
            );
            if (userCcResult) {
              try {
                const ccBox = JSON.parse(userCcResult.result.boxScore);
                const ccHt = leagueTeamsForSim.find((t: any) => t.id === userCcResult.game.homeTeamId);
                const ccAt = leagueTeamsForSim.find((t: any) => t.id === userCcResult.game.awayTeamId);
                userTeamGame = {
                  homeTeam: ccHt?.name ?? "Home", awayTeam: ccAt?.name ?? "Away",
                  homeAbbr: ccHt?.abbreviation ?? "HME", awayAbbr: ccAt?.abbreviation ?? "AWY",
                  homeScore: userCcResult.result.homeScore, awayScore: userCcResult.result.awayScore,
                  inningScores: ccBox.innings ?? [],
                  homeHits: ccBox.home?.totals?.h ?? 0, awayHits: ccBox.away?.totals?.h ?? 0,
                  homeErrors: ccBox.home?.errors ?? 0, awayErrors: ccBox.away?.errors ?? 0,
                  isHome: userCcResult.game.homeTeamId === simUserTeamId,
                  homeColor: ccHt?.primaryColor ?? "#FFD700",
                  awayColor: ccAt?.primaryColor ?? "#7eb8f7",
                };
              } catch { /* non-critical */ }
            }
          }

          try {
            const postTeams = await storage.getTeamsByLeague(leagueId);
            const completedConf = (await storage.getGamesByLeague(leagueId)).filter(g => g.phase === "conference_championship" && g.season === league.currentSeason && g.isComplete);
            await generateGameNewsArticles(leagueId, completedConf, postTeams, league.currentSeason, currentWeek, "conference_championship");
            // Emit AWARD event for each conference champion
            for (const cg of completedConf) {
              const homeWon = (cg.homeScore ?? 0) > (cg.awayScore ?? 0);
              const champId = homeWon ? cg.homeTeamId : cg.awayTeamId;
              const champT = leagueTeamsForSim.find(t => t.id === champId);
              if (champT) {
                await storage.createLeagueEvent({
                  leagueId,
                  teamId: champT.id,
                  teamName: champT.name,
                  teamAbbreviation: champT.abbreviation,
                  teamPrimaryColor: champT.primaryColor ?? null,
                  eventType: "AWARD",
                  description: `${champT.name} wins the Conference Championship! Season ${league.currentSeason}.`,
                  season: league.currentSeason,
                  week: currentWeek,
                });
              }
            }
          } catch (e) { console.error("Postseason news error:", e); }

          // Track confChampionships for each winning coach
          try {
            const finalConfGames = (await storage.getGamesByLeague(leagueId)).filter(g => g.phase === "conference_championship" && g.season === league.currentSeason && g.isComplete);
            for (const cg of finalConfGames) {
              const homeWonCg = (cg.homeScore ?? 0) > (cg.awayScore ?? 0);
              const champTeamId = homeWonCg ? cg.homeTeamId : cg.awayTeamId;
              const champTeamForCoach = leagueTeamsForSim.find(t => t.id === champTeamId);
              if (champTeamForCoach?.coachId) {
                const champCoach = await storage.getCoach(champTeamForCoach.coachId);
                if (champCoach) {
                  const newConfChamp = champCoach.confChampionships + 1;
                  await storage.updateCoach(champCoach.id, { confChampionships: newConfChamp, legacyScore: computeLegacyScore({ ...champCoach, confChampionships: newConfChamp }) });
                }
              }
            }
          } catch (e) { console.error("Conf champ coach stats error:", e); }

          await generateSuperRegionalBracket(leagueId, league.currentSeason);
          
          const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "super_regionals", currentWeek: nextWeek });
          await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Conference Championships Complete", details: "Conference championship games have been played. Super Regionals begin!" });
          sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
            .catch(e => console.error("[digest] conf-champ hook:", e));
          return res.json({ ...updatedLeague, userTeamGame });
        }
        
        if (league.currentPhase === "super_regionals") {
          // Snapshot which SR games involving the user are currently incomplete
          const srPreSnap = simUserTeamId ? (await storage.getGamesByLeague(leagueId)).filter((g: any) =>
            g.phase === "super_regionals" && g.season === league.currentSeason && !g.isComplete &&
            (g.homeTeamId === simUserTeamId || g.awayTeamId === simUserTeamId)
          ).map((g: any) => g.id) : [] as string[];
          const srResult = await advanceSuperRegionals(leagueId, league.currentSeason);
          // Extract the user's just-completed SR game
          if (!userTeamGame && srPreSnap.length > 0) {
            try {
              const srAllGames = await storage.getGamesByLeague(leagueId);
              const srDone = (srAllGames as any[]).find((g: any) => srPreSnap.includes(g.id) && g.isComplete);
              if (srDone) {
                const srBox = JSON.parse(srDone.boxScore ?? "{}");
                const srHt = leagueTeamsForSim.find((t: any) => t.id === srDone.homeTeamId);
                const srAt = leagueTeamsForSim.find((t: any) => t.id === srDone.awayTeamId);
                userTeamGame = {
                  homeTeam: srHt?.name ?? "Home", awayTeam: srAt?.name ?? "Away",
                  homeAbbr: srHt?.abbreviation ?? "HME", awayAbbr: srAt?.abbreviation ?? "AWY",
                  homeScore: srDone.homeScore ?? 0, awayScore: srDone.awayScore ?? 0,
                  inningScores: srBox.innings ?? [],
                  homeHits: srBox.home?.totals?.h ?? 0, awayHits: srBox.away?.totals?.h ?? 0,
                  homeErrors: srBox.home?.errors ?? 0, awayErrors: srBox.away?.errors ?? 0,
                  isHome: srDone.homeTeamId === simUserTeamId,
                  homeColor: srHt?.primaryColor ?? "#FFD700",
                  awayColor: srAt?.primaryColor ?? "#7eb8f7",
                };
              }
            } catch { /* non-critical */ }
          }
          
          if (srResult.done && !srResult.champion1) {
            // Log the SR game state so any future regression is immediately diagnosable.
            try {
              const diagGames = await storage.getGamesByLeague(leagueId);
              const diagSR = diagGames.filter((g: any) => g.phase === "super_regionals" && g.season === league.currentSeason);
              console.warn(`[postseason-skip] SR done but no champion — league=${leagueId} season=${league.currentSeason} srGameCount=${diagSR.length} completedSR=${diagSR.filter((g: any) => g.isComplete).length} srResult=${JSON.stringify(srResult)}`);
            } catch { /* diagnostic only */ }
            // Resolve any unresolved storyline arcs before entering offseason.
            try {
              const swept = await resolveAllPendingStorylineEvents(leagueId, league.currentSeason, league.currentWeek ?? 1);
              if (swept > 0) console.log(`[storylines] sr→offseason sweep resolved ${swept} arc events`);
            } catch (e) { console.warn("[storylines] sr→offseason sweep failed:", e); }
            const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "offseason_departures", currentWeek: nextWeek });
            await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Postseason Skipped", details: "Not enough teams for postseason bracket." });
            try {
              await evaluatePlayerPromises(leagueId, league.currentSeason);
              const departureResult = await processOffseasonDepartures(leagueId, league.currentSeason);
              await storage.createAuditLog({
                leagueId, userId: req.session.userId,
                action: "Offseason: Departures Phase",
                details: `${departureResult.graduated} graduating, ${departureResult.draftDeclared} draft eligible, ${departureResult.transferPortal} considering transfer. Review departures before finalizing.`,
              });
              generateDeparturesSummaryNews(leagueId, league.currentSeason, departureResult.graduated, departureResult.draftDeclared, departureResult.transferPortal)
                .catch(e => console.error("Departures news error (sr-skip):", e));
            } catch (e) {
              console.error("SR-skip departure processing error:", e);
            }
            sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
              .catch(e => console.error("[digest] sr-skipped hook:", e));
            return res.json({ ...updatedLeague, userTeamGame });
          }
          
          if (srResult.done && srResult.champion1 && srResult.champion2) {
            await storage.createGame({
              leagueId, season: league.currentSeason, week: 0,
              homeTeamId: srResult.champion1, awayTeamId: srResult.champion2,
              phase: "cws",
            });
            // Track cwsAppearances for both CWS teams' coaches
            try {
              for (const cwsTeamId of [srResult.champion1, srResult.champion2]) {
                const cwsTeamEntry = leagueTeamsForSim.find(t => t.id === cwsTeamId);
                if (cwsTeamEntry?.coachId) {
                  const cwsCoach = await storage.getCoach(cwsTeamEntry.coachId);
                  if (cwsCoach) {
                    const newCwsApp = cwsCoach.cwsAppearances + 1;
                    await storage.updateCoach(cwsCoach.id, { cwsAppearances: newCwsApp, legacyScore: computeLegacyScore({ ...cwsCoach, cwsAppearances: newCwsApp }) });
                  }
                }
              }
            } catch (e) { console.error("CWS appearances coach stats error:", e); }
            const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "cws", currentWeek: nextWeek });
            await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Super Regionals Complete", details: "The final two teams advance to the College World Series!" });
            sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
              .catch(e => console.error("[digest] sr-complete hook:", e));
            return res.json({ ...updatedLeague, userTeamGame });
          }
          
          await storage.updateLeague(league.id, { currentWeek: nextWeek });
          await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Super Regionals Round Complete", details: "A round of the Super Regionals has been completed." });
          const updatedLeague = await storage.getLeague(leagueId);
          sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
            .catch(e => console.error("[digest] sr-round hook:", e));
          return res.json({ ...updatedLeague, userTeamGame });
        }
        
        if (league.currentPhase === "cws") {
          // Snapshot which CWS games involving the user are currently incomplete
          const cwsPreSnap = simUserTeamId ? (await storage.getGamesByLeague(leagueId)).filter((g: any) =>
            g.phase === "cws" && g.season === league.currentSeason && !g.isComplete &&
            (g.homeTeamId === simUserTeamId || g.awayTeamId === simUserTeamId)
          ).map((g: any) => g.id) : [] as string[];
          const cwsResult = await advanceCWS(leagueId, league.currentSeason);
          // Extract the user's just-completed CWS game
          if (!userTeamGame && cwsPreSnap.length > 0) {
            try {
              const cwsAllGames = await storage.getGamesByLeague(leagueId);
              const cwsDone = (cwsAllGames as any[]).find((g: any) => cwsPreSnap.includes(g.id) && g.isComplete);
              if (cwsDone) {
                const cwsBox = JSON.parse(cwsDone.boxScore ?? "{}");
                const cwsHt = leagueTeamsForSim.find((t: any) => t.id === cwsDone.homeTeamId);
                const cwsAt = leagueTeamsForSim.find((t: any) => t.id === cwsDone.awayTeamId);
                userTeamGame = {
                  homeTeam: cwsHt?.name ?? "Home", awayTeam: cwsAt?.name ?? "Away",
                  homeAbbr: cwsHt?.abbreviation ?? "HME", awayAbbr: cwsAt?.abbreviation ?? "AWY",
                  homeScore: cwsDone.homeScore ?? 0, awayScore: cwsDone.awayScore ?? 0,
                  inningScores: cwsBox.innings ?? [],
                  homeHits: cwsBox.home?.totals?.h ?? 0, awayHits: cwsBox.away?.totals?.h ?? 0,
                  homeErrors: cwsBox.home?.errors ?? 0, awayErrors: cwsBox.away?.errors ?? 0,
                  isHome: cwsDone.homeTeamId === simUserTeamId,
                  homeColor: cwsHt?.primaryColor ?? "#FFD700",
                  awayColor: cwsAt?.primaryColor ?? "#7eb8f7",
                };
              }
            } catch { /* non-critical */ }
          }
          
          if (cwsResult.done && cwsResult.champion) {
            const leagueTeams = await storage.getTeamsByLeague(leagueId);
            const champTeam = leagueTeams.find(t => t.id === cwsResult.champion);
            const runnerUpTeam = leagueTeams.find(t => t.id === cwsResult.runnerUp);

            // Track nationalChampionships for champion coach
            try {
              if (champTeam?.coachId) {
                const champCoach = await storage.getCoach(champTeam.coachId);
                if (champCoach) {
                  const newNatl = champCoach.nationalChampionships + 1;
                  await storage.updateCoach(champCoach.id, { nationalChampionships: newNatl, legacyScore: computeLegacyScore({ ...champCoach, nationalChampionships: newNatl }) });
                }
              }
            } catch (e) { console.error("National championship coach stats error:", e); }

            // Track allAmericans using the same pipeline as the Awards tab
            // (All-American + All-Conference teams, both built via positional slot logic)
            try {
              const aaSelections = await countAllAmericanSelectionsForLeague(leagueId);
              const aaCoachIds = [...aaSelections.keys()]
                .map(tId => leagueTeams.find(t => t.id === tId)?.coachId)
                .filter(Boolean) as string[];
              const aaCoaches = await Promise.all(aaCoachIds.map(id => storage.getCoach(id)));
              const aaCoachMap = new Map(aaCoaches.filter(Boolean).map(c => [c!.id, c!]));
              await Promise.all([...aaSelections.entries()].map(async ([tId, aaCount]) => {
                const aaTeamEntry = leagueTeams.find(t => t.id === tId);
                if (!aaTeamEntry?.coachId) return;
                const aaCoach = aaCoachMap.get(aaTeamEntry.coachId);
                if (!aaCoach) return;
                const newAAs = aaCoach.allAmericans + aaCount;
                await storage.updateCoach(aaCoach.id, { allAmericans: newAAs, legacyScore: computeLegacyScore({ ...aaCoach, allAmericans: newAAs }) });
              }));
            } catch (e) { console.error("All-Americans coach stats error:", e); }

            // Resolve any unresolved storyline arcs before entering offseason.
            try {
              const swept = await resolveAllPendingStorylineEvents(leagueId, league.currentSeason, league.currentWeek ?? 1);
              if (swept > 0) console.log(`[storylines] cws→offseason sweep resolved ${swept} arc events`);
            } catch (e) { console.warn("[storylines] cws→offseason sweep failed:", e); }
            
            const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "offseason_departures", currentWeek: nextWeek });
            await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "CWS Champion Crowned!", details: `${champTeam?.name || "Unknown"} wins the College World Series over ${runnerUpTeam?.name || "Unknown"}!` });
            
            if (champTeam && runnerUpTeam) {
              try {
                await generateCWSChampionNewsArticle(leagueId, champTeam, runnerUpTeam, league.currentSeason);
                await storage.createLeagueEvent({
                  leagueId,
                  teamId: champTeam.id,
                  teamName: champTeam.name,
                  teamAbbreviation: champTeam.abbreviation,
                  eventType: "AWARD",
                  description: `${champTeam.name} wins the College World Series! Season ${league.currentSeason} National Champions.`,
                  season: league.currentSeason,
                  week: nextWeek,
                });
              } catch (e) {
                console.error("CWS news generation error:", e);
              }
            }

            // Emit season award events (MVP, Pitcher of Year, Freshman of Year)
            try {
              const allSeasonPlayers: { player: any; team: any }[] = [];
              const cwsAllPlayers = await storage.getPlayersByLeague(leagueId);
              const cwsPlayersByTeam = new Map<string, typeof cwsAllPlayers>();
              for (const p of cwsAllPlayers) {
                if (!cwsPlayersByTeam.has(p.teamId)) cwsPlayersByTeam.set(p.teamId, []);
                cwsPlayersByTeam.get(p.teamId)!.push(p);
              }
              for (const t of leagueTeams) {
                for (const p of cwsPlayersByTeam.get(t.id) ?? []) allSeasonPlayers.push({ player: p, team: t });
              }
              const byOVR = (a: any, b: any) => b.player.overall - a.player.overall;
              const mvpEntry = allSeasonPlayers.filter(x => x.player.position !== "P").sort(byOVR)[0];
              const poyEntry = allSeasonPlayers.filter(x => x.player.position === "P").sort(byOVR)[0];
              const foyEntry = allSeasonPlayers.filter(x => x.player.eligibility === "FR").sort(byOVR)[0];
              const awardPairs = [
                { entry: mvpEntry, label: "Season MVP" },
                { entry: poyEntry, label: "Pitcher of the Year" },
                { entry: foyEntry, label: "Freshman of the Year" },
              ];
              for (const { entry, label } of awardPairs) {
                if (!entry) continue;
                await storage.createLeagueEvent({
                  leagueId,
                  teamId: entry.team.id,
                  teamName: entry.team.name,
                  teamAbbreviation: entry.team.abbreviation,
                  eventType: "AWARD",
                  description: `${entry.player.firstName} ${entry.player.lastName} (${entry.team.abbreviation}) named Season ${league.currentSeason} ${label}.`,
                  season: league.currentSeason,
                  week: nextWeek,
                });
              }
            } catch (e) {
              console.error("Season award event error:", e);
            }

            try {
              const promiseResult = await evaluatePlayerPromises(leagueId, league.currentSeason);
              if (promiseResult.broken > 0) {
                await storage.createAuditLog({
                  leagueId, userId: req.session.userId,
                  action: "Promise Evaluation",
                  details: `${promiseResult.evaluated} promises evaluated: ${promiseResult.met} met, ${promiseResult.broken} broken.`,
                });
              }
              const departureResult = await processOffseasonDepartures(leagueId, league.currentSeason);
              await storage.createAuditLog({
                leagueId, userId: req.session.userId,
                action: "Offseason: Departures Phase",
                details: `${departureResult.graduated} graduating, ${departureResult.draftDeclared} draft eligible, ${departureResult.transferPortal} considering transfer. Review departures before finalizing.`,
              });
              generateDeparturesSummaryNews(leagueId, league.currentSeason, departureResult.graduated, departureResult.draftDeclared, departureResult.transferPortal)
                .catch(e => console.error("Departures news error:", e));
            } catch (e) {
              console.error("Auto-process departures error:", e);
            }
            
            sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
              .catch(e => console.error("[digest] cws-champion hook:", e));
            return res.json({ ...updatedLeague, cwsChampion: cwsResult.champion, cwsRunnerUp: cwsResult.runnerUp, userTeamGame });
          }
          
          await storage.updateLeague(league.id, { currentWeek: nextWeek });
          await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "CWS Game Complete", details: "A game of the College World Series has been played." });
          const updatedLeague = await storage.getLeague(leagueId);
          sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
            .catch(e => console.error("[digest] cws-round hook:", e));
          return res.json({ ...updatedLeague, userTeamGame });
        }
      }

      // ============ OFFSEASON SUB-PHASE PROGRESSION ============
      const offseasonPhases = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
      
      if (league.currentPhase === "offseason_departures") {
        // Safety-net sweep: resolve any unresolved arc events that slipped through.
        // The authoritative sweep runs at the transition point (sr/cws → offseason_departures).
        // Using currentWeek keeps dynasty-news timestamps aligned with end-of-season.
        try {
          const swept = await resolveAllPendingStorylineEvents(leagueId, league.currentSeason, league.currentWeek ?? 1);
          if (swept > 0) {
            console.log(`[storylines] offseason_departures safety sweep resolved ${swept} pending arc events`);
          }
        } catch (sweepErr) {
          console.warn("[storylines] offseason_departures safety sweep failed:", sweepErr);
        }

        const existingPending = await storage.getPendingDeparturesByLeague(leagueId);
        // Departures are "valid" only when we have actual graduates or draft entries.
        // Stale pendingDeparture:true flags (e.g. uncleared transfer players from a
        // prior season) must not trick the route into skipping the departure run.
        const hasValidDepartures = existingPending.some(
          p => p.departureType === "graduated" || p.departureType === "draft"
        );
        
        if (!hasValidDepartures) {
          const promiseResult = await evaluatePlayerPromises(leagueId, league.currentSeason);
          if (promiseResult.broken > 0) {
            await storage.createAuditLog({
              leagueId, userId: req.session.userId,
              action: "Promise Evaluation",
              details: `${promiseResult.evaluated} promises evaluated: ${promiseResult.met} met, ${promiseResult.broken} broken. Players with broken promises are unhappy.`,
            });
          }

          const departureResult = await processOffseasonDepartures(leagueId, league.currentSeason);
          
          await storage.createAuditLog({
            leagueId, userId: req.session.userId,
            action: "Offseason: Departures Phase",
            details: `${departureResult.graduated} graduating, ${departureResult.draftDeclared} draft eligible, ${departureResult.transferPortal} considering transfer. Review departures before finalizing.`,
          });

          generateDeparturesSummaryNews(leagueId, league.currentSeason, departureResult.graduated, departureResult.draftDeclared, departureResult.transferPortal)
            .catch(e => console.error("Departures news error:", e));
          
          return res.json({ 
            ...league, 
            currentPhase: "offseason_departures",
            departures: departureResult,
            needsDepartureReview: true 
          });
        } else {
          const leagueTeams = await storage.getTeamsByLeague(leagueId);
          // Auto-pilot teams are always treated as ready for departures (CPU manages them)
          const humanTeams = leagueTeams.filter(t => !t.isCpu && !t.isAutoPilot);
          const allReady = humanTeams.every(t => t.departuresFinalized);
          
          if (!allReady) {
            const readyCount = humanTeams.filter(t => t.departuresFinalized).length;
            const notReadyTeams = humanTeams.filter(t => !t.departuresFinalized).map(t => t.name);
            return res.status(400).json({ 
              message: `Not all coaches have finalized departures. ${readyCount}/${humanTeams.length} ready. Waiting on: ${notReadyTeams.join(", ")}`,
              readyCount,
              totalHumanTeams: humanTeams.length,
              waitingOn: notReadyTeams,
            });
          }

          const finalizeResult = await finalizeDeparturesInternal(leagueId, league);
          
          // Reset departuresFinalized flags for all teams
          await Promise.all(
            leagueTeams.filter(t => t.departuresFinalized).map(t => storage.updateTeam(t.id, { departuresFinalized: false }))
          );
          
          await storage.createAuditLog({
            leagueId, userId: req.session.userId,
            action: "Departures Finalized",
            details: `${finalizeResult.graduated} graduated, ${finalizeResult.drafted} entered MLB draft, ${finalizeResult.transferred} entered transfer portal.`,
          });
          
          sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
            .catch(e => console.error("[digest] departures-finalized hook:", e));
          return res.json({ 
            ...finalizeResult.updatedLeague,
            departed: { graduated: finalizeResult.graduated, drafted: finalizeResult.drafted, transferred: finalizeResult.transferred },
          });
        }
      }
      
      if (["offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4"].includes(league.currentPhase)) {
        // Run CPU recruiting for leftover unsigned recruits + transfer portal.
        // The two CPU recruiting tasks target independent recruit pools so they can run in parallel.
        await Promise.all([
          runCpuRecruiting(leagueId, league.currentWeek, league.currentSeason),
          runCpuTransferPortalRecruiting(leagueId),
        ]);
        await updateRecruitStages(leagueId, league.currentWeek);
        
        const phaseIndex = offseasonPhases.indexOf(league.currentPhase);
        const nextPhase = offseasonPhases[phaseIndex + 1];

        const updatedLeague = await storage.updateLeague(league.id, { currentPhase: nextPhase, currentWeek: nextWeek });
        await storage.createAuditLog({
          leagueId, userId: req.session.userId,
          action: `Offseason Recruiting Week ${phaseIndex}`,
          details: `Offseason recruiting week ${phaseIndex} complete. CPU teams continue recruiting.`,
        });
        // Fire digest for the completed offseason recruiting week (non-blocking)
        sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
          .catch(e => console.error("[digest] offseason-recruiting hook:", e));
        return res.json(updatedLeague);
      }
      
      if (league.currentPhase === "offseason_signing_day") {
        const signingResult = await finalizeSigningDay(leagueId, league.currentSeason);
        
        await generateWalkonPool(leagueId);
        await processCpuWalkons(leagueId);
        
        const allTeams = await storage.getTeamsByLeague(leagueId);
        await Promise.all(allTeams.map(team =>
          storage.updateTeam(team.id, { walkonReady: !!(team.isCpu || team.isAutoPilot) })
        ));
        
        // Clear any previous season's auction results so the /walkons/auction-results
        // endpoint never returns stale data from a prior cycle.
        const updatedLeague = await storage.updateLeague(league.id, {
          currentPhase: "offseason_walkons",
          lastWalkonAuction: null,
        });
        
        await storage.createAuditLog({
          leagueId: league.id,
          userId: req.session.userId,
          action: "Walk-On Phase Started",
          details: `Signing day complete. ${signingResult.recruitsAdded} recruits joined rosters. Teams can now make cuts and sign walk-ons.`,
        });

        try {
          await storage.createLeagueEvent({
            leagueId: league.id,
            eventType: "PHASE_CHANGE",
            description: `Signing Day complete — ${signingResult.recruitsAdded} recruits joined rosters league-wide`,
            season: league.currentSeason,
            week: league.currentWeek,
          });
        } catch (e) { console.error("League event error:", e); }
        
        return res.json(updatedLeague);
      }
      
      if (league.currentPhase === "offseason_walkons") {
        const allTeams = await storage.getTeamsByLeague(leagueId);
        const allReady = allTeams.every(t => t.walkonReady);
        if (!allReady) {
          return res.status(400).json({ message: "Not all teams are ready. Each team must mark ready before advancing." });
        }

        const { savedRecruitingClassId: rawClassId } = req.body || {};

        // Two-step flow: if no class selection provided and user has saved classes, prompt commissioner
        let savedRecruitingClassId: string = rawClassId ?? "auto";
        if (!rawClassId) {
          const userId = req.session.userId;
          const userSavedClasses = userId ? await storage.getSavedRecruitingClassesByUser(userId) : [];
          if (userSavedClasses.length > 0) {
            return res.json({
              needs_class_selection: true,
              savedClasses: userSavedClasses.map(c => ({ id: c.id, name: c.name, recruitCount: c.recruitCount, createdAt: c.createdAt })),
              currentSeason: league.currentSeason,
            });
          }
          // No saved classes — normalized to "auto" above, proceed with fresh class
        }

        // Validate saved class BEFORE any state mutation
        let savedClassRecruits: any[] | null = null;
        let savedClassName: string | null = null;
        if (savedRecruitingClassId !== "auto") {
          const savedClass = await storage.getSavedRecruitingClass(String(savedRecruitingClassId));
          if (!savedClass) {
            return res.status(404).json({ message: "Saved recruiting class not found." });
          }
          if (savedClass.userId && savedClass.userId !== req.session.userId) {
            return res.status(403).json({ message: "You do not own this saved recruiting class." });
          }
          // classData may be array (legacy) or { recruits: [...] }
          const raw = savedClass.classData as any;
          const recruitRows: any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.recruits) ? raw.recruits : []);
          if (recruitRows.length === 0) {
            return res.status(400).json({ message: "The selected saved class has no recruits." });
          }
          savedClassRecruits = recruitRows;
          savedClassName = savedClass.name;
        }

        // All validation passed — now mutate state
        const walkonResult = await finalizeWalkonsPhase(leagueId, league.currentSeason);

        // Apply saved class if one was validated above
        if (savedClassRecruits !== null) {
          await storage.deleteRecruitsByLeague(leagueId);
          await storage.batchCreateRecruits(
            savedClassRecruits.map((r: any) => {
              const { id, leagueId: _lid, ...rest } = r;
              return { ...rest, leagueId };
            })
          );
          walkonResult.newRecruits = savedClassRecruits.length;
          console.log(`[advance] Loaded saved class "${savedClassName}" (${savedClassRecruits.length} recruits) for season ${league.currentSeason + 1}`);
        }
        
        const updatedLeague = await storage.updateLeague(league.id, {
          currentWeek: 1,
          currentSeason: league.currentSeason + 1,
          currentPhase: "preseason",
        });

        try {
          const [allTeamsForLineup, allPlayersForLineup] = await Promise.all([
            storage.getTeamsByLeague(leagueId),
            storage.getPlayersByLeague(leagueId),
          ]);
          const lineupPlayersByTeam = new Map<string, typeof allPlayersForLineup>();
          for (const p of allPlayersForLineup) {
            if (!lineupPlayersByTeam.has(p.teamId)) lineupPlayersByTeam.set(p.teamId, []);
            lineupPlayersByTeam.get(p.teamId)!.push(p);
          }
          await Promise.all(allTeamsForLineup
            .filter(team => !team.userId || team.userId === "cpu")
            .map(team => autoAssignLineup(storage, lineupPlayersByTeam.get(team.id) ?? [], team.id))
          );
        } catch (e) {
          console.error("CPU auto-lineup error:", e);
        }

        await storage.createAuditLog({
          leagueId: league.id,
          userId: req.session.userId,
          action: "Season Advanced",
          details: `Season ${league.currentSeason} ended. ${walkonResult.walkonsAdded} walk-ons joined rosters, ${walkonResult.newRecruits} new recruits generated. Now entering Season ${league.currentSeason + 1}.`,
        });

        storage.getTeamsByLeague(leagueId).then(previewTeams =>
          generateSeasonPreviewNewsArticle(leagueId, previewTeams, league.currentSeason + 1)
        ).catch(e => console.error("Season preview news error:", e));

        return res.json({ ...updatedLeague, seasonTransition: walkonResult });
      }
      
      // Legacy "offseason" phase - treat same as offseason_departures for backwards compatibility
      if (league.currentPhase === "offseason") {
        const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "offseason_departures" });
        return res.json(updatedLeague);
      }

      if (nextWeek > maxWeeks) {
        await generateConferenceChampionships(leagueId, league.currentSeason);
        const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "conference_championship", currentWeek: nextWeek });
        await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Regular Season Complete", details: "The regular season is over! Conference Championships begin." });
        try {
          await storage.createLeagueEvent({ leagueId, eventType: "PHASE_CHANGE", description: `Regular season complete — Conference Championships begin (Season ${league.currentSeason})`, season: league.currentSeason, week: nextWeek });
        } catch (e) { console.error("League event error:", e); }
        // Fire digest for the final regular-season week (non-blocking)
        sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
          .catch(e => console.error("[digest] end-of-regular-season hook:", e));
        return res.json({ ...updatedLeague, userTeamGame });
      }

      const newPhase = league.currentPhase === "preseason" && nextWeek >= 2 ? "regular_season" : league.currentPhase;
      if (newPhase === "regular_season" && league.currentPhase === "preseason") {
        await storage.clearProgressionDeltasForLeague(leagueId);
        console.log(`[Progression] Cleared progression deltas for league ${leagueId} (preseason -> regular_season)`);
        try {
          await storage.createLeagueEvent({ leagueId, eventType: "PHASE_CHANGE", description: `Regular season underway — Season ${league.currentSeason} begins!`, season: league.currentSeason, week: nextWeek });
        } catch (e) { console.error("League event error:", e); }
      }
      const updatedLeague = await storage.updateLeague(league.id, {
        currentWeek: nextWeek,
        currentPhase: newPhase,
        phaseDeadline: null,
      });

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Week Advanced",
        details: `Advanced to Week ${nextWeek}`,
      });

      res.json({ ...updatedLeague, userTeamGame });
      // Fire-and-forget digest emails after a regular-season/preseason week advance (non-blocking).
      // Pass the completed week/season/phase (before incrementing) so the digest reflects the games that just finished.
      sendWeeklyDigests(leagueId, storage, league.currentSeason, currentWeek, league.currentPhase)
        .catch(e => console.error("[digest] advance hook:", e));
    } catch (error: any) {
      console.error("Failed to advance week:", error);
      // Release the per-league lock on error so the next request isn't blocked
      advancingLeagues.delete(req.params.id as string);
      res.status(500).json({ message: "Failed to advance week", detail: error?.message || String(error) });
    }
  });

  app.post("/api/leagues/:id/sim-to-offseason", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can sim the full season." });
      }

      const teams = await storage.getTeamsByLeague(leagueId);
      const teamNameMap = new Map<string, string>();
      for (const t of teams) teamNameMap.set(t.id, `${t.name} ${t.mascot}`);

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const userTeamId = userCoach?.teamId || null;

      // Build per-team game philosophy map for strategy-aware simulation
      const teamPhilosophyMap = new Map<string, string>();
      for (const c of coaches) {
        if (c.teamId) teamPhilosophyMap.set(c.teamId, c.gamePhilosophyStrategy ?? "balanced");
      }

      const simSummary: {
        weekResults: Array<{
          week: number;
          phase: string;
          games: Array<{
            homeTeam: string;
            awayTeam: string;
            homeScore: number;
            awayScore: number;
            isConference: boolean;
            isUserTeam: boolean;
          }>;
        }>;
        postseasonResults: Array<{
          phase: string;
          games: Array<{
            homeTeam: string;
            awayTeam: string;
            homeScore: number;
            awayScore: number;
            isUserTeam: boolean;
          }>;
        }>;
      } = { weekResults: [], postseasonResults: [] };

      const MAX_ITERATIONS = 100;
      let currentLeague = league;
      let iterations = 0;
      const phasesVisited: string[] = [];
      const startSeason = currentLeague.currentSeason;

      const allPlayers = await storage.getPlayersByLeague(leagueId);
      const rosterCache = new Map<string, Player[]>();
      for (const p of allPlayers) {
        if (!rosterCache.has(p.teamId)) rosterCache.set(p.teamId, []);
        rosterCache.get(p.teamId)!.push(p);
      }
      const allTeamsForSim = await storage.getTeamsByLeague(leagueId);
      const teamStadiumMap = new Map<string, number>();
      for (const t of allTeamsForSim) teamStadiumMap.set(t.id, t.stadium ?? 5);

      let standingsCache = await storage.getStandingsByLeague(leagueId, startSeason);
      const standingsMap = new Map<string, typeof standingsCache[0]>();
      for (const s of standingsCache) standingsMap.set(s.teamId, s);

      async function updateStandingsCached(
        homeTeamId: string, awayTeamId: string,
        homeScore: number, awayScore: number, isConference: boolean = false
      ) {
        let homeStanding = standingsMap.get(homeTeamId);
        let awayStanding = standingsMap.get(awayTeamId);
        if (!homeStanding) {
          homeStanding = await storage.createStandings({ leagueId, teamId: homeTeamId, season: startSeason });
          standingsMap.set(homeTeamId, homeStanding);
        }
        if (!awayStanding) {
          awayStanding = await storage.createStandings({ leagueId, teamId: awayTeamId, season: startSeason });
          standingsMap.set(awayTeamId, awayStanding);
        }
        const homeWon = homeScore > awayScore;
        const updatedHome = await storage.updateStandings(homeStanding.id, {
          wins: (homeStanding.wins || 0) + (homeWon ? 1 : 0),
          losses: (homeStanding.losses || 0) + (homeWon ? 0 : 1),
          conferenceWins: (homeStanding.conferenceWins || 0) + (isConference && homeWon ? 1 : 0),
          conferenceLosses: (homeStanding.conferenceLosses || 0) + (isConference && !homeWon ? 1 : 0),
          runsScored: (homeStanding.runsScored || 0) + homeScore,
          runsAllowed: (homeStanding.runsAllowed || 0) + awayScore,
        });
        if (updatedHome) standingsMap.set(homeTeamId, updatedHome);
        const updatedAway = await storage.updateStandings(awayStanding.id, {
          wins: (awayStanding.wins || 0) + (homeWon ? 0 : 1),
          losses: (awayStanding.losses || 0) + (homeWon ? 1 : 0),
          conferenceWins: (awayStanding.conferenceWins || 0) + (isConference && !homeWon ? 1 : 0),
          conferenceLosses: (awayStanding.conferenceLosses || 0) + (isConference && homeWon ? 1 : 0),
          runsScored: (awayStanding.runsScored || 0) + awayScore,
          runsAllowed: (awayStanding.runsAllowed || 0) + homeScore,
        });
        if (updatedAway) standingsMap.set(awayTeamId, updatedAway);
      }

      let seasonGames: Game[] | null = null;
      async function getSeasonGames(): Promise<Game[]> {
        if (!seasonGames) {
          seasonGames = await storage.getGamesByLeagueSeason(leagueId, startSeason);
        }
        return seasonGames;
      }
      function invalidateGameCache() { seasonGames = null; }

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const phase = currentLeague.currentPhase;
        phasesVisited.push(`${phase} (wk ${currentLeague.currentWeek})`);

        if (phase === "offseason_departures" && iterations > 1) {
          break;
        }
        if ((currentLeague.currentSeason ?? 1) > startSeason) {
          break;
        }

        const maxWeeks = currentLeague.seasonLength === "short" ? 5 : currentLeague.seasonLength === "long" ? 10 : 5;
        const nextWeek = (currentLeague.currentWeek ?? 1) + 1;

        if (phase === "preseason" || phase === "spring_training" || phase === "regular_season") {
          const allSeasonGames = await getSeasonGames();
          const weekGames = allSeasonGames.filter(g => g.week === currentLeague.currentWeek && !g.isComplete);

          // Sort within week by day order so fatigue carries Fri → Sat → Sun
        const dayOrder: Record<string, number> = { friday: 0, saturday: 1, sunday: 2, midweek: 3 };
        const sortedWeekGames = [...weekGames].sort((a, b) =>
          (dayOrder[a.gameType || ""] ?? 4) - (dayOrder[b.gameType || ""] ?? 4));

        // Per-team reliever pitch accumulation for the week (resets each week)
        const weekPitcherPitches: Map<string, Record<string, number>> = new Map();

        const simResults: { game: typeof weekGames[0]; result: ReturnType<typeof simulateGameWithRosters> }[] = [];
        for (const game of sortedWeekGames) {
            const homePlayers = rosterCache.get(game.homeTeamId) || [];
            const awayPlayers = rosterCache.get(game.awayTeamId) || [];
            const homeFatigue = weekPitcherPitches.get(game.homeTeamId) || {};
            const awayFatigue = weekPitcherPitches.get(game.awayTeamId) || {};
            const result = simulateGameWithRosters(homePlayers, awayPlayers, game.gameType,
              teamStadiumMap.get(game.homeTeamId), teamStadiumMap.get(game.awayTeamId),
              { home: homeFatigue, away: awayFatigue },
              teamPhilosophyMap.get(game.homeTeamId), teamPhilosophyMap.get(game.awayTeamId));

            // Accumulate reliever pitch counts (add to existing, not replace)
            const mergePitches = (existing: Record<string, number>, incoming: Record<string, number>) => {
              const merged = { ...existing };
              for (const [pid, pitches] of Object.entries(incoming)) {
                merged[pid] = (merged[pid] || 0) + pitches;
              }
              return merged;
            };
            weekPitcherPitches.set(game.homeTeamId, mergePitches(homeFatigue, result.homePitcherPitches));
            weekPitcherPitches.set(game.awayTeamId, mergePitches(awayFatigue, result.awayPitcherPitches));
            simResults.push({ game, result });
          }

          await Promise.all(simResults.map(async ({ game, result }) => {
            await storage.updateGame(game.id, {
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              boxScore: result.boxScore,
              isComplete: true,
            });
            game.isComplete = true;
            game.homeScore = result.homeScore;
            game.awayScore = result.awayScore;
          }));

          if (simResults.length > 0) {
            simSummary.weekResults.push({
              week: currentLeague.currentWeek ?? 1,
              phase: phase,
              games: simResults.map(({ game, result }) => ({
                homeTeam: teamNameMap.get(game.homeTeamId) || "Unknown",
                awayTeam: teamNameMap.get(game.awayTeamId) || "Unknown",
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                isConference: game.isConference ?? false,
                isUserTeam: game.homeTeamId === userTeamId || game.awayTeamId === userTeamId,
              })),
            });
          }

          for (const { game, result } of simResults) {
            await updateStandingsCached(game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore, game.isConference ?? false);
            try {
              const box = JSON.parse(result.boxScore);
              await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.homeTeamId, box.home);
              await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.awayTeamId, box.away);
            } catch (e) { console.error("Stat accumulation error:", e); }
          }

          if (nextWeek > maxWeeks) {
            await generateConferenceChampionships(leagueId, currentLeague.currentSeason);
            invalidateGameCache();
            currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "conference_championship", currentWeek: nextWeek })) as any;
          } else {
            const newPhase = phase === "preseason" && nextWeek >= 2 ? "regular_season" : phase;
            if (newPhase === "regular_season" && phase === "preseason") {
              await storage.clearProgressionDeltasForLeague(leagueId);
              console.log(`[Progression] Cleared progression deltas for league ${leagueId} (preseason -> regular_season)`);
            }
            currentLeague = (await storage.updateLeague(leagueId, { currentWeek: nextWeek, currentPhase: newPhase })) as any;
          }
          continue;
        }

        if (phase === "conference_championship") {
          const allSeasonGames = await getSeasonGames();
          const ccGames = allSeasonGames.filter(g => g.phase === "conference_championship" && !g.isComplete);

          const simResults = ccGames.map(game => {
            const homePlayers = rosterCache.get(game.homeTeamId) || [];
            const awayPlayers = rosterCache.get(game.awayTeamId) || [];
            return { game, result: simulateGameWithRosters(homePlayers, awayPlayers, game.gameType || "friday", teamStadiumMap.get(game.homeTeamId), teamStadiumMap.get(game.awayTeamId), undefined, teamPhilosophyMap.get(game.homeTeamId), teamPhilosophyMap.get(game.awayTeamId)) };
          });
          // (CC games are one-off single games; no within-week series fatigue applies)

          await Promise.all(simResults.map(async ({ game, result }) => {
            await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, boxScore: result.boxScore, isComplete: true });
            game.isComplete = true;
          }));

          if (simResults.length > 0) {
            simSummary.postseasonResults.push({
              phase: "Conference Championship",
              games: simResults.map(({ game, result }) => ({
                homeTeam: teamNameMap.get(game.homeTeamId) || "Unknown",
                awayTeam: teamNameMap.get(game.awayTeamId) || "Unknown",
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                isUserTeam: game.homeTeamId === userTeamId || game.awayTeamId === userTeamId,
              })),
            });
          }

          for (const { game, result } of simResults) {
            await updateStandingsCached(game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore);
            try {
              const box = JSON.parse(result.boxScore);
              await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.homeTeamId, box.home);
              await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.awayTeamId, box.away);
            } catch (e) { console.error("Stat accumulation error:", e); }
          }
          // Track confChampionships for each winning coach (sim-to-offseason path)
          try {
            for (const { game, result } of simResults) {
              const homeWonSim2 = result.homeScore > result.awayScore;
              const confChampTeamId = homeWonSim2 ? game.homeTeamId : game.awayTeamId;
              const confChampTeam = allTeamsForSim.find(t => t.id === confChampTeamId);
              if (confChampTeam?.coachId) {
                const confChampCoach = await storage.getCoach(confChampTeam.coachId);
                if (confChampCoach) {
                  const newCC = confChampCoach.confChampionships + 1;
                  await storage.updateCoach(confChampCoach.id, { confChampionships: newCC, legacyScore: computeLegacyScore({ ...confChampCoach, confChampionships: newCC }) });
                }
              }
            }
          } catch (e) { console.error("Conf champ coach stats error (sim):", e); }
          invalidateGameCache();
          await generateSuperRegionalBracket(leagueId, currentLeague.currentSeason);
          currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "super_regionals" })) as any;
          continue;
        }

        if (phase === "super_regionals") {
          let srDone = false;
          let srIterations = 0;
          while (!srDone && srIterations < 20) {
            srIterations++;
            const srResult = await advanceSuperRegionals(leagueId, currentLeague.currentSeason);
            srDone = srResult.done;
            if (srDone) {
              if (srResult.champion1 && srResult.champion2) {
                await storage.createGame({
                  leagueId, season: currentLeague.currentSeason, week: 0,
                  homeTeamId: srResult.champion1, awayTeamId: srResult.champion2,
                  phase: "cws",
                });
                // Track cwsAppearances for both CWS teams (sim-to-offseason path)
                try {
                  for (const cwsTeamId of [srResult.champion1, srResult.champion2]) {
                    const cwsTeamSim = allTeamsForSim.find(t => t.id === cwsTeamId);
                    if (cwsTeamSim?.coachId) {
                      const cwsCoachSim = await storage.getCoach(cwsTeamSim.coachId);
                      if (cwsCoachSim) {
                        const newCwsApp = cwsCoachSim.cwsAppearances + 1;
                        await storage.updateCoach(cwsCoachSim.id, { cwsAppearances: newCwsApp, legacyScore: computeLegacyScore({ ...cwsCoachSim, cwsAppearances: newCwsApp }) });
                      }
                    }
                  }
                } catch (e) { console.error("CWS appearances coach stats error (sim):", e); }
                invalidateGameCache();
                currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "cws" })) as any;
              } else {
                try {
                  const swept = await resolveAllPendingStorylineEvents(leagueId, currentLeague.currentSeason, currentLeague.currentWeek ?? 1);
                  if (swept > 0) console.log(`[storylines] sim-advance sr sweep resolved ${swept} arc events`);
                } catch (e) { console.warn("[storylines] sim-advance sr sweep failed:", e); }
                try {
                  await evaluatePlayerPromises(leagueId, currentLeague.currentSeason);
                  await processOffseasonDepartures(leagueId, currentLeague.currentSeason);
                } catch (e) { console.error("SR-skip departure processing error (sim-to-offseason):", e); }
                currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "offseason_departures" })) as any;
              }
            }
          }
          continue;
        }

        if (phase === "cws") {
          let cwsDone = false;
          let cwsIterations = 0;
          let lastCwsResult: { done: boolean; champion?: string; runnerUp?: string } = { done: false };
          while (!cwsDone && cwsIterations < 10) {
            cwsIterations++;
            lastCwsResult = await advanceCWS(leagueId, currentLeague.currentSeason);
            cwsDone = lastCwsResult.done;
          }
          // Track nationalChampionships + allAmericans (sim-to-offseason path)
          if (lastCwsResult.champion) {
            const simLeagueTeams = await storage.getTeamsByLeague(leagueId);
            try {
              const simChampTeam = simLeagueTeams.find(t => t.id === lastCwsResult.champion);
              if (simChampTeam?.coachId) {
                const simChampCoach = await storage.getCoach(simChampTeam.coachId);
                if (simChampCoach) {
                  const newNatl = simChampCoach.nationalChampionships + 1;
                  await storage.updateCoach(simChampCoach.id, { nationalChampionships: newNatl, legacyScore: computeLegacyScore({ ...simChampCoach, nationalChampionships: newNatl }) });
                }
              }
            } catch (e) { console.error("National championship coach stats error (sim):", e); }
            // Track allAmericans using the same pipeline as the Awards tab (sim-to-offseason path)
            try {
              const simAaSelections = await countAllAmericanSelectionsForLeague(leagueId);
              for (const [tId, aaCount] of simAaSelections.entries()) {
                const aaTeamEntry = simLeagueTeams.find(t => t.id === tId);
                if (aaTeamEntry?.coachId) {
                  const aaCoach = await storage.getCoach(aaTeamEntry.coachId);
                  if (aaCoach) {
                    const newAAs = aaCoach.allAmericans + aaCount;
                    await storage.updateCoach(aaCoach.id, { allAmericans: newAAs, legacyScore: computeLegacyScore({ ...aaCoach, allAmericans: newAAs }) });
                  }
                }
              }
            } catch (e) { console.error("All-Americans coach stats error (sim):", e); }
          }
          try {
            await evaluatePlayerPromises(leagueId, currentLeague.currentSeason);
          } catch (e) {
            console.error("Promise eval error during sim:", e);
          }
          try {
            await processOffseasonDepartures(leagueId, currentLeague.currentSeason);
          } catch (e) {
            console.error("Departure processing error during sim:", e);
          }
          try {
            const swept = await resolveAllPendingStorylineEvents(leagueId, currentLeague.currentSeason, currentLeague.currentWeek ?? 1);
            if (swept > 0) console.log(`[storylines] sim-advance cws sweep resolved ${swept} arc events`);
          } catch (e) { console.warn("[storylines] sim-advance cws sweep failed:", e); }
          currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "offseason_departures" })) as any;
          continue;
        }

        break;
      }

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Sim to Offseason",
        details: `Commissioner sim from ${phasesVisited[0] || "unknown"} → ${currentLeague.currentPhase}. Season ${startSeason}, ${iterations} advances.`,
      });

      res.json({ ...currentLeague, simSummary });
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

      const offseasonPhases = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
      if (!offseasonPhases.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Can only sim to signing day during offseason phases." });
      }

      let currentLeague = league;

      if (currentLeague.currentPhase === "offseason_departures") {
        const existingPending = await storage.getPendingDeparturesByLeague(leagueId);
        if (existingPending.length === 0) {
          await evaluatePlayerPromises(leagueId, currentLeague.currentSeason);
          await processOffseasonDepartures(leagueId, currentLeague.currentSeason);
        }
        await finalizeDeparturesInternal(leagueId, currentLeague);
        currentLeague = (await storage.getLeague(leagueId)) as any;
      }

      // Sim-to-offseason also fast-forwards all teams (human included) through recruiting
      const recruitingPhases = ["offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4"];
      for (const phase of recruitingPhases) {
        if (offseasonPhases.indexOf(currentLeague.currentPhase) <= offseasonPhases.indexOf(phase)) {
          await runCpuRecruiting(leagueId, currentLeague.currentWeek ?? 1, currentLeague.currentSeason, true);
          await runCpuTransferPortalRecruiting(leagueId);
          await updateRecruitStages(leagueId, currentLeague.currentWeek ?? 1);
          const nextPhaseIdx = offseasonPhases.indexOf(phase) + 1;
          currentLeague = (await storage.updateLeague(leagueId, {
            currentPhase: offseasonPhases[nextPhaseIdx],
            currentWeek: (currentLeague.currentWeek ?? 1) + 1,
          })) as any;
        }
      }

      if (currentLeague.currentPhase === "offseason_signing_day") {
        const signingResult = await finalizeSigningDay(leagueId, currentLeague.currentSeason);
        
        await generateWalkonPool(leagueId);
        await processAllTeamWalkons(leagueId);
        
        const allTeams2 = await storage.getTeamsByLeague(leagueId);
        for (const team of allTeams2) {
          await storage.updateTeam(team.id, { walkonReady: true });
        }
        
        const walkonResult = await finalizeWalkonsPhase(leagueId, currentLeague.currentSeason);
        
        currentLeague = (await storage.updateLeague(leagueId, {
          currentWeek: 1,
          currentSeason: currentLeague.currentSeason + 1,
          currentPhase: "preseason",
        })) as any;

        try {
          const [allTeamsForLineup, allPlayersForLineup] = await Promise.all([
            storage.getTeamsByLeague(leagueId),
            storage.getPlayersByLeague(leagueId),
          ]);
          const lineupPlayersByTeam = new Map<string, typeof allPlayersForLineup>();
          for (const p of allPlayersForLineup) {
            if (!lineupPlayersByTeam.has(p.teamId)) lineupPlayersByTeam.set(p.teamId, []);
            lineupPlayersByTeam.get(p.teamId)!.push(p);
          }
          await Promise.all(allTeamsForLineup
            .filter(team => !team.userId || team.userId === "cpu")
            .map(team => autoAssignLineup(storage, lineupPlayersByTeam.get(team.id) ?? [], team.id))
          );
        } catch (e) {
          console.error("CPU auto-lineup error:", e);
        }

        await storage.createAuditLog({
          leagueId,
          userId: req.session.userId,
          action: "Sim to Signing Day",
          details: `Fast-forwarded offseason. ${signingResult.recruitsAdded} recruits joined, ${walkonResult.walkonsAdded} walk-ons added, ${walkonResult.newRecruits} new class generated. Now Season ${currentLeague.currentSeason}.`,
        });

        return res.json({ ...currentLeague, seasonTransition: { ...signingResult, ...walkonResult } });
      }

      res.json(currentLeague);
    } catch (error) {
      console.error("Failed to sim to signing day:", error);
      res.status(500).json({ message: "Failed to sim to signing day" });
    }
  });
  
  // Sim Full Season - advances from current phase all the way to preseason of next season
  app.post("/api/leagues/:id/sim-full-season", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can simulate a full season." });
      }

      const gamePhases = ["preseason", "spring_training", "regular_season", "conference_championship", "super_regionals", "cws"];
      const offseasonPhases = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
      const allValidPhases = [...gamePhases, ...offseasonPhases];
      if (!allValidPhases.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Cannot simulate a full season from the current phase." });
      }

      const fsTeams = await storage.getTeamsByLeague(leagueId);
      const fsTeamNameMap = new Map<string, string>();
      for (const t of fsTeams) fsTeamNameMap.set(t.id, `${t.name} ${t.mascot}`);
      const fsCoaches = await storage.getCoachesByLeague(leagueId);
      const fsUserCoach = fsCoaches.find(c => c.userId === req.session.userId);
      const fsUserTeamId = fsUserCoach?.teamId || null;

      let currentLeague = league;
      const startSeason = currentLeague.currentSeason;
      const startPhase = currentLeague.currentPhase;
      let weeksSimulated = 0;

      // Build per-team game philosophy map for strategy-aware simulation in all phases
      const fsPhilosophyMap = new Map<string, string>();
      {
        const fsPhilosophyCoaches = await storage.getCoachesByLeague(leagueId);
        for (const c of fsPhilosophyCoaches) {
          if (c.teamId) fsPhilosophyMap.set(c.teamId, (c as any).gamePhilosophyStrategy ?? "balanced");
        }
      }

      // Phase 1: Sim through all game phases to offseason_departures
      if (gamePhases.includes(currentLeague.currentPhase)) {
        const MAX_GAME_ITER = 150;
        let gIter = 0;
        while (gIter < MAX_GAME_ITER && gamePhases.includes(currentLeague.currentPhase)) {
          gIter++;
          const phase = currentLeague.currentPhase;
          const maxWeeks = currentLeague.seasonLength === "short" ? 5 : currentLeague.seasonLength === "long" ? 10 : 5;
          const nextWeek = (currentLeague.currentWeek ?? 1) + 1;

          if (["preseason", "spring_training", "regular_season"].includes(phase)) {
            const weekGames = (await storage.getGamesByLeague(leagueId))
              .filter(g => g.season === currentLeague.currentSeason && g.week === currentLeague.currentWeek && !g.isComplete);
            for (const game of weekGames) {
              const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType, fsPhilosophyMap.get(game.homeTeamId), fsPhilosophyMap.get(game.awayTeamId));
              await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, boxScore: result.boxScore, isComplete: true });
              await updateStandingsForGame(leagueId, currentLeague.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore, game.isConference);
              try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.awayTeamId, box.away); } catch (e) { /* ignore */ }
            }
            weeksSimulated++;
            if (nextWeek > maxWeeks) {
              await generateConferenceChampionships(leagueId, currentLeague.currentSeason);
              currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "conference_championship", currentWeek: nextWeek })) as any;
            } else {
              const newPhase = phase === "preseason" && nextWeek >= 2 ? "regular_season" : phase;
              if (newPhase === "regular_season" && phase === "preseason") await storage.clearProgressionDeltasForLeague(leagueId);
              currentLeague = (await storage.updateLeague(leagueId, { currentWeek: nextWeek, currentPhase: newPhase })) as any;
            }
            continue;
          }

          if (phase === "conference_championship") {
            const ccGames = (await storage.getGamesByLeague(leagueId)).filter(g => g.phase === "conference_championship" && !g.isComplete && g.season === currentLeague.currentSeason);
            for (const game of ccGames) {
              const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType, fsPhilosophyMap.get(game.homeTeamId), fsPhilosophyMap.get(game.awayTeamId));
              await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, boxScore: result.boxScore, isComplete: true });
              await updateStandingsForGame(leagueId, currentLeague.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore, false);
            }
            await generateSuperRegionalBracket(leagueId, currentLeague.currentSeason);
            currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "super_regionals" })) as any;
            continue;
          }

          if (phase === "super_regionals") {
            let srDone = false;
            let srIter = 0;
            let srChampion1: string | undefined;
            let srChampion2: string | undefined;
            while (!srDone && srIter < 20) {
              srIter++;
              const srResult = await advanceSuperRegionals(leagueId, currentLeague.currentSeason);
              srDone = srResult.done;
              if (srDone) {
                srChampion1 = srResult.champion1;
                srChampion2 = srResult.champion2;
              }
            }
            if (srChampion1 && srChampion2) {
              await storage.createGame({
                leagueId, season: currentLeague.currentSeason, week: 0,
                homeTeamId: srChampion1, awayTeamId: srChampion2,
                phase: "cws",
              });
              currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "cws" })) as any;
            } else {
              // No CWS — go directly to offseason
              await evaluatePlayerPromises(leagueId, currentLeague.currentSeason);
              await processOffseasonDepartures(leagueId, currentLeague.currentSeason);
              await finalizeDeparturesInternal(leagueId, currentLeague);
              currentLeague = (await storage.getLeague(leagueId)) as any;
              break;
            }
            continue;
          }

          if (phase === "cws") {
            let cwsDone = false;
            let cwsIter = 0;
            while (!cwsDone && cwsIter < 10) {
              cwsIter++;
              const cwsResult = await advanceCWS(leagueId, currentLeague.currentSeason);
              cwsDone = cwsResult.done;
              if (cwsDone) break;
            }
            await evaluatePlayerPromises(leagueId, currentLeague.currentSeason);
            await processOffseasonDepartures(leagueId, currentLeague.currentSeason);
            await finalizeDeparturesInternal(leagueId, currentLeague);
            currentLeague = (await storage.getLeague(leagueId)) as any;
            break;
          }
          break;
        }
      }

      // Phase 2: Process offseason_departures if we landed there
      if (currentLeague.currentPhase === "offseason_departures") {
        const existingPending = await storage.getPendingDeparturesByLeague(leagueId);
        if (existingPending.length === 0) {
          await evaluatePlayerPromises(leagueId, currentLeague.currentSeason);
          await processOffseasonDepartures(leagueId, currentLeague.currentSeason);
        }
        await finalizeDeparturesInternal(leagueId, currentLeague);
        currentLeague = (await storage.getLeague(leagueId)) as any;
      }

      // Phase 3: Sim through all recruiting phases — include all teams since this is a fast-forward
      const recruitingPhaseList = ["offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4"];
      for (const rphase of recruitingPhaseList) {
        if (offseasonPhases.indexOf(currentLeague.currentPhase) <= offseasonPhases.indexOf(rphase)) {
          await runCpuRecruiting(leagueId, currentLeague.currentWeek ?? 1, currentLeague.currentSeason, true);
          await runCpuTransferPortalRecruiting(leagueId);
          await updateRecruitStages(leagueId, currentLeague.currentWeek ?? 1);
          const nextPhaseIdx = offseasonPhases.indexOf(rphase) + 1;
          currentLeague = (await storage.updateLeague(leagueId, {
            currentPhase: offseasonPhases[nextPhaseIdx],
            currentWeek: (currentLeague.currentWeek ?? 1) + 1,
          })) as any;
        }
      }

      // Phase 4: Signing day + walk-ons → new season
      let seasonTransition: any = null;
      if (currentLeague.currentPhase === "offseason_signing_day") {
        const signingResult = await finalizeSigningDay(leagueId, currentLeague.currentSeason);
        await generateWalkonPool(leagueId);
        await processAllTeamWalkons(leagueId);
        const allTeamsFs = await storage.getTeamsByLeague(leagueId);
        for (const team of allTeamsFs) await storage.updateTeam(team.id, { walkonReady: true });
        const walkonResult = await finalizeWalkonsPhase(leagueId, currentLeague.currentSeason);
        // Advance past preseason into spring_training so coaches see their roster
        // before the regular season starts (not stuck in preseason limbo).
        currentLeague = (await storage.updateLeague(leagueId, {
          currentWeek: 2,
          currentSeason: currentLeague.currentSeason + 1,
          currentPhase: "spring_training",
        })) as any;
        try {
          const [allTeamsForLineup, allPlayersForLineup] = await Promise.all([
            storage.getTeamsByLeague(leagueId),
            storage.getPlayersByLeague(leagueId),
          ]);
          const lineupPlayersByTeam = new Map<string, typeof allPlayersForLineup>();
          for (const p of allPlayersForLineup) {
            if (!lineupPlayersByTeam.has(p.teamId)) lineupPlayersByTeam.set(p.teamId, []);
            lineupPlayersByTeam.get(p.teamId)!.push(p);
          }
          await Promise.all(allTeamsForLineup
            .filter(team => !team.userId || team.userId === "cpu")
            .map(team => autoAssignLineup(storage, lineupPlayersByTeam.get(team.id) ?? [], team.id))
          );
        } catch (e) { console.error("Auto-lineup error:", e); }
        seasonTransition = { ...signingResult, ...walkonResult };
      }

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Simulate Full Season",
        details: `Commissioner fast-forwarded Season ${startSeason} from ${startPhase} → spring_training (${weeksSimulated} weeks simulated, + postseason + 4 recruiting weeks + signing day). Now Season ${currentLeague.currentSeason}.`,
      });

      res.json({ ...currentLeague, seasonTransition });
    } catch (error) {
      console.error("Failed to sim full season:", error);
      res.status(500).json({ message: "Failed to simulate full season" });
    }
  });

  // Sim to Postseason - stops at conference_championship
  app.post("/api/leagues/:id/sim-to-postseason", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can sim." });
      }

      const preseasonPhases = ["preseason", "spring_training", "regular_season"];
      if (!preseasonPhases.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Can only sim to postseason during the regular season." });
      }

      const psTeams = await storage.getTeamsByLeague(leagueId);
      const psTeamNameMap = new Map<string, string>();
      for (const t of psTeams) psTeamNameMap.set(t.id, `${t.name} ${t.mascot}`);
      const psCoaches = await storage.getCoachesByLeague(leagueId);
      const psUserCoach = psCoaches.find(c => c.userId === req.session.userId);
      const psUserTeamId = psUserCoach?.teamId || null;

      // Build philosophy map for strategy-aware game simulation
      const psPhilosophyMap = new Map<string, string>();
      for (const c of psCoaches) {
        if (c.teamId) psPhilosophyMap.set(c.teamId, (c as any).gamePhilosophyStrategy ?? "balanced");
      }

      const simSummary: {
        weekResults: Array<{ week: number; phase: string; games: Array<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; isConference: boolean; isUserTeam: boolean }> }>;
        postseasonResults: Array<{ phase: string; games: Array<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; isUserTeam: boolean }> }>;
      } = { weekResults: [], postseasonResults: [] };

      const MAX_ITERATIONS = 100;
      let currentLeague = league;
      let iterations = 0;
      const psStartPhase = league.currentPhase;

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const phase = currentLeague.currentPhase;

        if (phase === "conference_championship") break;

        const maxWeeks = currentLeague.seasonLength === "short" ? 5 : currentLeague.seasonLength === "long" ? 10 : 5;
        const nextWeek = (currentLeague.currentWeek ?? 1) + 1;

        if (preseasonPhases.includes(phase)) {
          const weekGames = (await storage.getGamesByLeague(leagueId))
            .filter(g => g.season === currentLeague.currentSeason && g.week === currentLeague.currentWeek && !g.isComplete);
          const weekSimResults: Array<{ game: Game; result: { homeScore: number; awayScore: number; boxScore: string } }> = [];
          for (const game of weekGames) {
            const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType, psPhilosophyMap.get(game.homeTeamId), psPhilosophyMap.get(game.awayTeamId));
            await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, boxScore: result.boxScore, isComplete: true });
            await updateStandingsForGame(leagueId, currentLeague.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore, game.isConference);
            try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
            weekSimResults.push({ game, result });
          }
          if (weekSimResults.length > 0) {
            simSummary.weekResults.push({
              week: currentLeague.currentWeek ?? 1,
              phase,
              games: weekSimResults.map(({ game, result }) => ({
                homeTeam: psTeamNameMap.get(game.homeTeamId) || "Unknown",
                awayTeam: psTeamNameMap.get(game.awayTeamId) || "Unknown",
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                isConference: game.isConference ?? false,
                isUserTeam: game.homeTeamId === psUserTeamId || game.awayTeamId === psUserTeamId,
              })),
            });
          }
          if (nextWeek > maxWeeks) {
            await generateConferenceChampionships(leagueId, currentLeague.currentSeason);
            currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "conference_championship", currentWeek: nextWeek })) as any;
          } else {
            const newPhase = phase === "preseason" && nextWeek >= 2 ? "regular_season" : phase;
            if (newPhase === "regular_season" && phase === "preseason") {
              await storage.clearProgressionDeltasForLeague(leagueId);
            }
            currentLeague = (await storage.updateLeague(leagueId, { currentWeek: nextWeek, currentPhase: newPhase })) as any;
          }
          continue;
        }
        break;
      }

      await storage.createAuditLog({
        leagueId, userId: req.session.userId, action: "Sim to Postseason",
        details: `Commissioner sim from ${psStartPhase} → ${currentLeague.currentPhase}. Season ${league.currentSeason}, ${iterations} advances.`,
      });
      res.json({ ...currentLeague, simSummary });
    } catch (error) {
      console.error("Failed to sim to postseason:", error);
      res.status(500).json({ message: "Failed to sim to postseason" });
    }
  });

  // Sim to CWS - advances through regular season + conference championships + super regionals, stops at CWS
  app.post("/api/leagues/:id/sim-to-cws", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can sim." });
      }

      const validPhases = ["preseason", "spring_training", "regular_season", "conference_championship", "super_regionals"];
      if (!validPhases.includes(league.currentPhase)) {
        return res.status(400).json({ message: "Can only sim to CWS before the College World Series." });
      }

      const cwsTeams = await storage.getTeamsByLeague(leagueId);
      const cwsTeamNameMap = new Map<string, string>();
      for (const t of cwsTeams) cwsTeamNameMap.set(t.id, `${t.name} ${t.mascot}`);
      const cwsCoaches = await storage.getCoachesByLeague(leagueId);
      const cwsUserCoach = cwsCoaches.find(c => c.userId === req.session.userId);
      const cwsUserTeamId = cwsUserCoach?.teamId || null;

      const simSummary: {
        weekResults: Array<{ week: number; phase: string; games: Array<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; isConference: boolean; isUserTeam: boolean }> }>;
        postseasonResults: Array<{ phase: string; games: Array<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; isUserTeam: boolean }> }>;
      } = { weekResults: [], postseasonResults: [] };

      const MAX_ITERATIONS = 100;
      let currentLeague = league;
      let iterations = 0;

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const phase = currentLeague.currentPhase;

        if (phase === "cws") break;
        if (phase === "offseason_departures") break;

        const maxWeeks = currentLeague.seasonLength === "short" ? 5 : currentLeague.seasonLength === "long" ? 10 : 5;
        const nextWeek = (currentLeague.currentWeek ?? 1) + 1;

        if (["preseason", "spring_training", "regular_season"].includes(phase)) {
          const weekGames = (await storage.getGamesByLeague(leagueId))
            .filter(g => g.season === currentLeague.currentSeason && g.week === currentLeague.currentWeek && !g.isComplete);
          const cwsWeekResults: Array<{ game: Game; result: { homeScore: number; awayScore: number; boxScore: string } }> = [];
          for (const game of weekGames) {
            const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType);
            await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, boxScore: result.boxScore, isComplete: true });
            await updateStandingsForGame(leagueId, currentLeague.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore, game.isConference);
            try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
            cwsWeekResults.push({ game, result });
          }
          if (cwsWeekResults.length > 0) {
            simSummary.weekResults.push({
              week: currentLeague.currentWeek ?? 1,
              phase,
              games: cwsWeekResults.map(({ game, result }) => ({
                homeTeam: cwsTeamNameMap.get(game.homeTeamId) || "Unknown",
                awayTeam: cwsTeamNameMap.get(game.awayTeamId) || "Unknown",
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                isConference: game.isConference ?? false,
                isUserTeam: game.homeTeamId === cwsUserTeamId || game.awayTeamId === cwsUserTeamId,
              })),
            });
          }
          if (nextWeek > maxWeeks) {
            await generateConferenceChampionships(leagueId, currentLeague.currentSeason);
            currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "conference_championship", currentWeek: nextWeek })) as any;
          } else {
            const newPhase = phase === "preseason" && nextWeek >= 2 ? "regular_season" : phase;
            if (newPhase === "regular_season" && phase === "preseason") {
              await storage.clearProgressionDeltasForLeague(leagueId);
            }
            currentLeague = (await storage.updateLeague(leagueId, { currentWeek: nextWeek, currentPhase: newPhase })) as any;
          }
          continue;
        }

        if (phase === "conference_championship") {
          const ccGames = (await storage.getGamesByLeague(leagueId))
            .filter(g => g.phase === "conference_championship" && g.season === currentLeague.currentSeason && !g.isComplete);
          const ccResults: Array<{ game: Game; result: { homeScore: number; awayScore: number; boxScore: string } }> = [];
          for (const game of ccGames) {
            const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType || "friday");
            await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, boxScore: result.boxScore, isComplete: true });
            await updateStandingsForGame(leagueId, currentLeague.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore);
            try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, currentLeague.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
            ccResults.push({ game, result });
          }
          if (ccResults.length > 0) {
            simSummary.postseasonResults.push({
              phase: "Conference Championship",
              games: ccResults.map(({ game, result }) => ({
                homeTeam: cwsTeamNameMap.get(game.homeTeamId) || "Unknown",
                awayTeam: cwsTeamNameMap.get(game.awayTeamId) || "Unknown",
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                isUserTeam: game.homeTeamId === cwsUserTeamId || game.awayTeamId === cwsUserTeamId,
              })),
            });
          }
          // Track confChampionships for each winning coach (sim-to-CWS path)
          try {
            for (const { game, result } of ccResults) {
              const homeWonCg2 = result.homeScore > result.awayScore;
              const ccChampTeamId = homeWonCg2 ? game.homeTeamId : game.awayTeamId;
              const ccChampTeam = cwsTeams.find(t => t.id === ccChampTeamId);
              if (ccChampTeam?.coachId) {
                const ccChampCoach = await storage.getCoach(ccChampTeam.coachId);
                if (ccChampCoach) {
                  const newCC = ccChampCoach.confChampionships + 1;
                  await storage.updateCoach(ccChampCoach.id, { confChampionships: newCC, legacyScore: computeLegacyScore({ ...ccChampCoach, confChampionships: newCC }) });
                }
              }
            }
          } catch (e) { console.error("Conf champ coach stats error (sim-to-cws):", e); }
          await generateSuperRegionalBracket(leagueId, currentLeague.currentSeason);
          currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "super_regionals" })) as any;
          continue;
        }

        if (phase === "super_regionals") {
          let srDone = false;
          let srIterations = 0;
          while (!srDone && srIterations < 20) {
            srIterations++;
            const srResult = await advanceSuperRegionals(leagueId, currentLeague.currentSeason);
            srDone = srResult.done;
            if (srDone) {
              if (srResult.champion1 && srResult.champion2) {
                await storage.createGame({
                  leagueId, season: currentLeague.currentSeason, week: 0,
                  homeTeamId: srResult.champion1, awayTeamId: srResult.champion2,
                  phase: "cws",
                });
                // Track cwsAppearances for both CWS teams (sim-to-CWS path)
                try {
                  for (const cwsTeamId of [srResult.champion1, srResult.champion2]) {
                    const cwsTeamEntry2 = cwsTeams.find(t => t.id === cwsTeamId);
                    if (cwsTeamEntry2?.coachId) {
                      const cwsCoach2 = await storage.getCoach(cwsTeamEntry2.coachId);
                      if (cwsCoach2) {
                        const newCwsApp = cwsCoach2.cwsAppearances + 1;
                        await storage.updateCoach(cwsCoach2.id, { cwsAppearances: newCwsApp, legacyScore: computeLegacyScore({ ...cwsCoach2, cwsAppearances: newCwsApp }) });
                      }
                    }
                  }
                } catch (e) { console.error("CWS appearances coach stats error (sim-to-cws):", e); }
                currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "cws" })) as any;
              } else {
                try {
                  await evaluatePlayerPromises(leagueId, currentLeague.currentSeason);
                  await processOffseasonDepartures(leagueId, currentLeague.currentSeason);
                } catch (e) { console.error("SR-skip departure processing error (sim-to-cws):", e); }
                currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "offseason_departures" })) as any;
              }
            }
          }
          continue;
        }

        break;
      }

      await storage.createAuditLog({
        leagueId, userId: req.session.userId, action: "Sim to CWS",
        details: `Simulated ${iterations} advances to ${currentLeague.currentPhase}.`,
      });
      res.json({ ...currentLeague, simSummary });
    } catch (error) {
      console.error("Failed to sim to CWS:", error);
      res.status(500).json({ message: "Failed to sim to CWS" });
    }
  });

  // ============ GAME SIMULATION FUNCTION ============
  function simulateGameWithRosters(
    homePlayers: Player[], awayPlayers: Player[], gameType?: string | null,
    homeStadium?: number, awayStadium?: number,
    pitcherFatigueIn?: { home: Record<string, number>; away: Record<string, number> },
    homePhilosophy?: string, awayPhilosophy?: string
  ): { homeScore: number; awayScore: number; boxScore: string; homePitcherPitches: Record<string, number>; awayPitcherPitches: Record<string, number> } {

    const gameTypeToRole: Record<string, string> = { friday: "FRI", saturday: "SAT", sunday: "SUN", midweek: "MID" };
    const starterRoles = ["FRI", "SAT", "SUN", "MID"];

    function findStartingPitcher(players: Player[]): Player | undefined {
      const pitchers = players.filter(p => p.position === "P");
      const targetRole = gameType ? gameTypeToRole[gameType] : null;
      let sp = targetRole ? pitchers.find(p => p.pitchingRole === targetRole) : undefined;
      if (!sp) sp = pitchers.find(p => starterRoles.includes(p.pitchingRole || ""));
      if (!sp) sp = [...pitchers].sort((a, b) => (b.overall || 0) - (a.overall || 0))[0];
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
    const philosophyDiffMult = (() => {
      const h = homePhilosophy ?? "balanced";
      const a = awayPhilosophy ?? "balanced";
      if (h === "aggressive" || a === "aggressive") return 1.15;
      if (h === "conservative" || a === "conservative") return 0.85;
      return 1.0;
    })();
    const homeRunAdj = (homePhilosophy === "power_ball" ? 0.8 : homePhilosophy === "small_ball" ? -0.8 : 0);
    const awayRunAdj = (awayPhilosophy === "power_ball" ? 0.8 : awayPhilosophy === "small_ball" ? -0.8 : 0);
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

  async function simulateGame(homeTeamId: string, awayTeamId: string, gameType?: string | null, homePhilosophy?: string, awayPhilosophy?: string): Promise<{ homeScore: number; awayScore: number; boxScore: string }> {
    const [homePlayers, awayPlayers, homeTeam, awayTeam] = await Promise.all([
      storage.getPlayersByTeam(homeTeamId),
      storage.getPlayersByTeam(awayTeamId),
      storage.getTeam(homeTeamId),
      storage.getTeam(awayTeamId),
    ]);
    const result = simulateGameWithRosters(homePlayers, awayPlayers, gameType, homeTeam?.stadium, awayTeam?.stadium, undefined, homePhilosophy, awayPhilosophy);
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

  async function accumulatePlayerStats(leagueId: string, season: number, teamId: string, boxData: any) {
    const playerStatsMap = new Map<string, InsertPlayerSeasonStats>();

    if (boxData.batting) {
      for (const b of boxData.batting) {
        if (!b.playerId || b.playerId.startsWith("fake_")) continue;
        playerStatsMap.set(b.playerId, {
          playerId: b.playerId,
          playerName: b.name,
          teamId,
          leagueId,
          season,
          position: b.position,
          games: 1,
          ab: b.ab || 0,
          r: b.r || 0,
          h: b.h || 0,
          doubles: b.doubles || 0,
          triples: b.triples || 0,
          hr: b.hr || 0,
          rbi: b.rbi || 0,
          bb: b.bb || 0,
          hbp: b.hbp || 0,
          so: b.so || 0,
          sb: b.sb || 0,
          cs: b.cs || 0,
          exitVeloTotal: b.exitVelo || 0,
          barrels: b.barrels || 0,
          ballsInPlay: b.ballsInPlay || 0,
          hardHits: b.hardHits || 0,
          putouts: b.putouts || 0,
          assists: b.assists || 0,
          fieldingErrors: b.fieldingErrors || 0,
          totalChances: b.totalChances || 0,
          wpa: 0,
          pitchingGames: 0, wins: 0, losses: 0, ipOuts: 0,
          pHits: 0, pRuns: 0, pEr: 0, pBb: 0, pSo: 0, pHr: 0,
          totalPitches: 0, whiffs: 0, spinRateTotal: 0,
        });
      }
    }

    if (boxData.pitching) {
      for (const p of boxData.pitching) {
        if (!p.playerId || p.playerId.startsWith("fake_")) continue;
        const ipParts = String(p.ip).split(".");
        const fullInnings = parseInt(ipParts[0]) || 0;
        const partialOuts = parseInt(ipParts[1]) || 0;
        const totalOuts = fullInnings * 3 + partialOuts;
        const existing = playerStatsMap.get(p.playerId);
        if (existing) {
          existing.pitchingGames = 1;
          existing.ipOuts = totalOuts;
          existing.pHits = p.h || 0;
          existing.pRuns = p.r || 0;
          existing.pEr = p.er || 0;
          existing.pBb = p.bb || 0;
          existing.pSo = p.so || 0;
          existing.pHr = p.hr || 0;
          existing.totalPitches = p.totalPitches || 0;
          existing.whiffs = p.whiffs || 0;
          existing.spinRateTotal = p.spinRate || 0;
        } else {
          playerStatsMap.set(p.playerId, {
            playerId: p.playerId,
            playerName: p.name,
            teamId,
            leagueId,
            season,
            position: "P",
            games: 0,
            ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
            rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0, cs: 0,
            exitVeloTotal: 0, barrels: 0, ballsInPlay: 0, hardHits: 0,
            putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0,
            wpa: 0,
            pitchingGames: 1,
            wins: 0, losses: 0,
            ipOuts: totalOuts,
            pHits: p.h || 0,
            pRuns: p.r || 0,
            pEr: p.er || 0,
            pBb: p.bb || 0,
            pSo: p.so || 0,
            pHr: p.hr || 0,
            totalPitches: p.totalPitches || 0,
            whiffs: p.whiffs || 0,
            spinRateTotal: p.spinRate || 0,
          });
        }
      }
    }

    await Promise.all(
      Array.from(playerStatsMap.values()).map(stats => storage.upsertPlayerSeasonStats(stats))
    );
  }

  // ============ COACH LEGACY SCORE HELPER ============
  function computeLegacyScore(coach: { careerWins: number; confChampionships: number; cwsAppearances: number; nationalChampionships: number; allAmericans: number; draftPicks: number }): number {
    return coach.careerWins + (coach.confChampionships * 5) + (coach.cwsAppearances * 10) + (coach.nationalChampionships * 20) + coach.allAmericans + coach.draftPicks;
  }

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

  // ============ STANDINGS UPDATE HELPER ============
  async function updateStandingsForGame(leagueId: string, season: number, homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number, isConference: boolean = false) {
    let standingsList = await storage.getStandingsByLeague(leagueId, season);
    
    let homeStanding = standingsList.find(s => s.teamId === homeTeamId);
    let awayStanding = standingsList.find(s => s.teamId === awayTeamId);
    
    if (!homeStanding) {
      homeStanding = await storage.createStandings({ leagueId, teamId: homeTeamId, season });
    }
    if (!awayStanding) {
      awayStanding = await storage.createStandings({ leagueId, teamId: awayTeamId, season });
    }
    
    const homeWon = homeScore > awayScore;
    
    await storage.updateStandings(homeStanding.id, {
      wins: (homeStanding.wins || 0) + (homeWon ? 1 : 0),
      losses: (homeStanding.losses || 0) + (homeWon ? 0 : 1),
      conferenceWins: (homeStanding.conferenceWins || 0) + (isConference && homeWon ? 1 : 0),
      conferenceLosses: (homeStanding.conferenceLosses || 0) + (isConference && !homeWon ? 1 : 0),
      runsScored: (homeStanding.runsScored || 0) + homeScore,
      runsAllowed: (homeStanding.runsAllowed || 0) + awayScore,
    });
    
    await storage.updateStandings(awayStanding.id, {
      wins: (awayStanding.wins || 0) + (homeWon ? 0 : 1),
      losses: (awayStanding.losses || 0) + (homeWon ? 1 : 0),
      conferenceWins: (awayStanding.conferenceWins || 0) + (isConference && !homeWon ? 1 : 0),
      conferenceLosses: (awayStanding.conferenceLosses || 0) + (isConference && homeWon ? 1 : 0),
      runsScored: (awayStanding.runsScored || 0) + awayScore,
      runsAllowed: (awayStanding.runsAllowed || 0) + homeScore,
    });
  }

  // ============ CONFERENCE CHAMPIONSHIP GENERATION ============
  async function generateConferenceChampionships(leagueId: string, season: number) {
    const confs = await storage.getConferencesByLeague(leagueId);
    const leagueTeams = await storage.getTeamsByLeague(leagueId);
    const standingsList = await storage.getStandingsByLeague(leagueId, season);
    
    for (const conf of confs) {
      const confTeams = leagueTeams.filter(t => t.conferenceId === conf.id);
      if (confTeams.length < 2) continue;
      
      const confStandings = confTeams.map(t => {
        const s = standingsList.find(st => st.teamId === t.id);
        return { team: t, wins: s?.wins || 0, confWins: s?.conferenceWins || 0 };
      }).sort((a, b) => b.confWins - a.confWins || b.wins - a.wins);
      
      await storage.createGame({
        leagueId,
        season,
        week: 0,
        homeTeamId: confStandings[0].team.id,
        awayTeamId: confStandings[1].team.id,
        phase: "conference_championship",
      });
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

  // ============ SUPER REGIONAL BRACKET GENERATION ============
  async function generateSuperRegionalBracket(leagueId: string, season: number) {
    const leagueTeams = await storage.getTeamsByLeague(leagueId);
    const standingsList = await storage.getStandingsByLeague(leagueId, season);
    const allGames = await storage.getGamesByLeague(leagueId);

    // Identify conference champions from completed conf championship games
    const confChampGames = allGames.filter(
      g => g.phase === "conference_championship" && g.season === season && g.isComplete
    );
    const confChampionIds = new Set(confChampGames.map(g => getGameWinner(g)));

    const seededTeams = buildSeededTeams(leagueTeams, standingsList, confChampionIds);
    const N = seededTeams.length;
    if (N < 2) return;

    // Power-of-2 bracket with byes for top seeds
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(Math.max(N, 2))));
    const numByes  = nextPow2 - N;

    // R1 games: pair seeds (numByes+1)..N using highest-vs-lowest matching
    // numByes top seeds automatically advance to R2
    const r1Count = (N - numByes) / 2;
    for (let i = 0; i < r1Count; i++) {
      const highSeed = numByes + 1 + i; // e.g. 5,6,7,8 for 12-team
      const lowSeed  = N - i;           // e.g. 12,11,10,9 for 12-team
      const highTeam = seededTeams[highSeed - 1];
      const lowTeam  = seededTeams[lowSeed - 1];
      const side = getSideForSeed(highSeed, N);
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: highTeam.team.id, awayTeamId: lowTeam.team.id,
        phase: "super_regionals", bracketSide: side, bracketRound: 1, bracketType: "winners",
      });
    }
  }

  // ============ ADVANCE SUPER REGIONALS ============
  async function advanceSuperRegionals(leagueId: string, season: number): Promise<{ done: boolean; champion1?: string; champion2?: string }> {
    const allGames = await storage.getGamesByLeague(leagueId);
    const srGames = allGames.filter(g => g.phase === "super_regionals" && g.season === season);
    const srTeams = await storage.getTeamsByLeague(leagueId);

    // Build canonical seeded list (same algorithm as generateSuperRegionalBracket)
    const standingsList = await storage.getStandingsByLeague(leagueId, season);
    const confChampGames = allGames.filter(
      g => g.phase === "conference_championship" && g.season === season && g.isComplete
    );
    const confChampionIds = new Set(confChampGames.map(g => getGameWinner(g)));
    const seededTeams = buildSeededTeams(srTeams, standingsList, confChampionIds);

    const incompleteGames = srGames.filter(g => !g.isComplete);
    
    if (incompleteGames.length > 0) {
      // Simulate only the earliest incomplete round
      const minRound = Math.min(...incompleteGames.map(g => g.bracketRound ?? 0));
      const gamesToSimulate = incompleteGames.filter(g => (g.bracketRound ?? 0) === minRound);
      
      const postseasonRotation = ["friday", "saturday", "sunday"];
      const _srSimStart = Date.now();
      await Promise.all(gamesToSimulate.map(async (game, gi) => {
        const psGameType = game.gameType || postseasonRotation[gi % 3];
        const result = await simulateGame(game.homeTeamId, game.awayTeamId, psGameType);
        await storage.updateGame(game.id, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          isComplete: true,
          boxScore: result.boxScore,
        });
        // Super Regionals results intentionally do NOT update standings — postseason games
        // must not mutate the regular-season win/loss records that seeding depends on.
        try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, season, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, season, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
        try {
          const srHomeWon = result.homeScore > result.awayScore;
          const srWinnerT = srTeams.find(t => t.id === (srHomeWon ? game.homeTeamId : game.awayTeamId));
          const srLoserT  = srTeams.find(t => t.id === (srHomeWon ? game.awayTeamId : game.homeTeamId));
          if (srWinnerT && srLoserT) {
            const srWinScore  = srHomeWon ? result.homeScore : result.awayScore;
            const srLossScore = srHomeWon ? result.awayScore : result.homeScore;
            await storage.createLeagueEvent({
              leagueId, teamId: srWinnerT.id, teamName: srWinnerT.name,
              teamAbbreviation: srWinnerT.abbreviation, teamPrimaryColor: srWinnerT.primaryColor ?? null,
              eventType: "GAME_RESULT",
              description: `${srWinnerT.abbreviation} def. ${srLoserT.abbreviation} ${srWinScore}-${srLossScore} (Super Regionals)`,
              season, week: 0,
            });
          }
        } catch (e) { console.error("Super Regionals feed event error:", e); }
      }));
      console.log(`[advance-perf] super-regionals-sim: ${Date.now() - _srSimStart}ms`);
    }
    
    // Re-fetch after simulation and process each side
    const updatedSRGames = (await storage.getGamesByLeague(leagueId))
      .filter(g => g.phase === "super_regionals" && g.season === season);
    
    const sideAChampion = await processBracketSide(leagueId, season, updatedSRGames, "A", seededTeams);
    const sideBChampion = await processBracketSide(leagueId, season, updatedSRGames, "B", seededTeams);
    
    if (sideAChampion && sideBChampion) {
      return { done: true, champion1: sideAChampion, champion2: sideBChampion };
    }
    
    const pendingGames = (await storage.getGamesByLeague(leagueId))
      .filter(g => g.phase === "super_regionals" && g.season === season && !g.isComplete);
    if (pendingGames.length > 0) {
      return { done: false };
    }
    
    // All games complete — re-process to detect newly-created games or get final champions
    const finalSRGames = (await storage.getGamesByLeague(leagueId))
      .filter(g => g.phase === "super_regionals" && g.season === season);
    const finalA = await processBracketSide(leagueId, season, finalSRGames, "A", seededTeams);
    const finalB = await processBracketSide(leagueId, season, finalSRGames, "B", seededTeams);
    
    if (finalA && finalB) {
      return { done: true, champion1: finalA, champion2: finalB };
    }
    
    const newPending = (await storage.getGamesByLeague(leagueId))
      .filter(g => g.phase === "super_regionals" && g.season === season && !g.isComplete);
    if (newPending.length > 0) {
      return { done: false };
    }
    
    // ── Defensive fallback ────────────────────────────────────────────────────
    // All SR games are complete but processBracketSide returned null for at least one side.
    // Recover by scanning completed SR game records directly for each side's last-round winner.
    const allCompletedSR = (await storage.getGamesByLeague(leagueId))
      .filter(g => g.phase === "super_regionals" && g.season === season && g.isComplete);
    const getLastRoundWinner = (side: string): string | undefined => {
      const sideCompleted = allCompletedSR.filter(g => g.bracketSide === side);
      if (sideCompleted.length === 0) return undefined;
      const maxRd = Math.max(...sideCompleted.map(g => g.bracketRound ?? 1));
      const lastRoundGames = sideCompleted.filter(g => (g.bracketRound ?? 1) === maxRd);
      if (lastRoundGames.length === 1) return getGameWinner(lastRoundGames[0]);
      return undefined;
    };
    const fallbackA = finalA || getLastRoundWinner("A");
    const fallbackB = finalB || getLastRoundWinner("B");
    if (fallbackA && fallbackB) {
      console.warn(`[advanceSuperRegionals] Used fallback champion detection for league=${leagueId} season=${season} — champion1=${fallbackA} champion2=${fallbackB}`);
      return { done: true, champion1: fallbackA, champion2: fallbackB };
    }
    
    console.warn(`[advanceSuperRegionals] Could not resolve SR champions — league=${leagueId} season=${season} finalA=${finalA} finalB=${finalB} fallbackA=${fallbackA} fallbackB=${fallbackB}`);
    return { done: true, champion1: finalA || undefined, champion2: finalB || undefined };
  }

  function getGameWinner(game: Game): string {
    return (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.homeTeamId : game.awayTeamId;
  }
  
  function getGameLoser(game: Game): string {
    return (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.awayTeamId : game.homeTeamId;
  }

  // Single-elimination bracket side processor.
  // After each completed round it creates the next round's games (handling byes from R1→R2),
  // and returns the side champion once a single game remains and is complete.
  async function processBracketSide(
    leagueId: string,
    season: number,
    allSRGames: Game[],
    side: string,
    seededTeams: { team: { id: string } }[]
  ): Promise<string | null> {
    const sideGames    = allSRGames.filter(g => g.bracketSide === side);
    const pendingSide  = sideGames.filter(g => !g.isComplete);
    const completedSide = sideGames.filter(g => g.isComplete);

    if (pendingSide.length > 0) return null;
    if (completedSide.length === 0) return null;

    const maxRound = Math.max(...completedSide.map(g => g.bracketRound ?? 1));
    const currentRoundGames = completedSide.filter(g => (g.bracketRound ?? 1) === maxRound);

    // Exactly 1 completed game in the highest round → candidate for side champion,
    // but only if ALL teams assigned to this side have appeared in at least one game
    // (prevents premature champion when bye teams haven't played yet).
    if (currentRoundGames.length === 1) {
      // Derive both sets purely from bracketSide-tagged game records — immune to seeding
      // order changes that occur when standings are mutated by postseason results.
      const sideTeamIds = new Set<string>();
      sideGames.forEach(g => { sideTeamIds.add(g.homeTeamId); sideTeamIds.add(g.awayTeamId); });

      const playedTeamIds = new Set<string>();
      completedSide.forEach(g => { playedTeamIds.add(g.homeTeamId); playedTeamIds.add(g.awayTeamId); });

      // Every team that ever appeared in any side game must have a completed game.
      const allPlayed = [...sideTeamIds].every(id => playedTeamIds.has(id));
      if (allPlayed) return getGameWinner(currentRoundGames[0]);
      // Not all teams have played yet — fall through to bye-handling below
    }

    // Guard: next round already exists (avoid duplicate creation across multiple calls)
    const nextRound = maxRound + 1;
    const nextRoundExists = allSRGames.some(g => g.bracketSide === side && (g.bracketRound ?? 1) === nextRound);
    if (nextRoundExists) return null;

    // ── Moving from R1 to R2 with potential byes ──
    if (maxRound === 1) {
      const r1TeamIds = new Set<string>();
      currentRoundGames.forEach(g => { r1TeamIds.add(g.homeTeamId); r1TeamIds.add(g.awayTeamId); });

      const N = seededTeams.length;
      // Bye teams for this side = seeded to this side but absent from all R1 games
      const byeTeams = seededTeams
        .filter((_t, idx) => getSideForSeed(idx + 1, N) === side && !r1TeamIds.has(seededTeams[idx].team.id))
        .map(t => t.team.id);

      if (byeTeams.length > 0) {
        // Pair: best bye (seed 1 in side) vs winner of weakest R1 game, etc.
        // "Weakest R1 game" = the one whose top-seed participant has the highest seed number
        const getTeamSeed = (tid: string) => seededTeams.findIndex(t => t.team.id === tid) + 1;
        const r1Ranked = [...currentRoundGames]
          .map(g => ({ game: g, topSeed: Math.min(getTeamSeed(g.homeTeamId), getTeamSeed(g.awayTeamId)) }))
          .sort((a, b) => b.topSeed - a.topSeed); // descending → weakest first

        for (let i = 0; i < byeTeams.length && i < r1Ranked.length; i++) {
          await storage.createGame({
            leagueId, season, week: 0,
            homeTeamId: byeTeams[i], awayTeamId: getGameWinner(r1Ranked[i].game),
            phase: "super_regionals", bracketSide: side, bracketRound: nextRound, bracketType: "winners",
          });
        }
        // Pair any leftover R1 winners (more R1 games than byes) against each other
        for (let i = byeTeams.length; i < r1Ranked.length - 1; i += 2) {
          await storage.createGame({
            leagueId, season, week: 0,
            homeTeamId: getGameWinner(r1Ranked[i].game), awayTeamId: getGameWinner(r1Ranked[i + 1].game),
            phase: "super_regionals", bracketSide: side, bracketRound: nextRound, bracketType: "winners",
          });
        }
        return null;
      }
    }

    // ── General case: pair current-round winners sequentially ──
    const winners = currentRoundGames.map(g => getGameWinner(g));
    for (let i = 0; i + 1 < winners.length; i += 2) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: winners[i], awayTeamId: winners[i + 1],
        phase: "super_regionals", bracketSide: side, bracketRound: nextRound, bracketType: "winners",
      });
    }
    return null;
  }

  // ============ ADVANCE CWS (BEST OF 3) ============
  async function advanceCWS(leagueId: string, season: number): Promise<{ done: boolean; champion?: string; runnerUp?: string }> {
    const allGames = await storage.getGamesByLeague(leagueId);
    const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season);
    const cwsTeams = await storage.getTeamsByLeague(leagueId);
    
    const incompleteGames = cwsGames.filter(g => !g.isComplete);
    const cwsRotation = ["friday", "saturday", "sunday"];
    const _cwsSimStart = Date.now();
    await Promise.all(incompleteGames.map(async (game, gi) => {
      const cwsGameType = game.gameType || cwsRotation[gi % 3];
      const result = await simulateGame(game.homeTeamId, game.awayTeamId, cwsGameType);
      await storage.updateGame(game.id, {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        isComplete: true,
        boxScore: result.boxScore,
      });
      // CWS results intentionally do NOT update standings — postseason games must not
      // mutate the regular-season win/loss records that bracket seeding depends on.
      try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, season, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, season, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
      try {
        const cwsHomeWon = result.homeScore > result.awayScore;
        const cwsWinnerT = cwsTeams.find(t => t.id === (cwsHomeWon ? game.homeTeamId : game.awayTeamId));
        const cwsLoserT = cwsTeams.find(t => t.id === (cwsHomeWon ? game.awayTeamId : game.homeTeamId));
        if (cwsWinnerT && cwsLoserT) {
          const cwsWinScore = cwsHomeWon ? result.homeScore : result.awayScore;
          const cwsLossScore = cwsHomeWon ? result.awayScore : result.homeScore;
          await storage.createLeagueEvent({
            leagueId,
            teamId: cwsWinnerT.id,
            teamName: cwsWinnerT.name,
            teamAbbreviation: cwsWinnerT.abbreviation,
            teamPrimaryColor: cwsWinnerT.primaryColor ?? null,
            eventType: "GAME_RESULT",
            description: `${cwsWinnerT.abbreviation} def. ${cwsLoserT.abbreviation} ${cwsWinScore}-${cwsLossScore} (CWS)`,
            season,
            week: 0,
          });
        }
      } catch (e) { console.error("CWS feed event error:", e); }
    }));
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
    if (!league?.progressionEnabled) return { progressed: 0 };

    const teams = await storage.getTeamsByLeague(leagueId);
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

    for (const team of teams) {
      const roster = await storage.getPlayersByTeam(team.id);
      for (const player of roster) {
        if (player.potential == null) continue;

        // Seniors graduate without a progression delta — clear any stale deltas
        if ((player as any).eligibility === "SR") {
          if ((player as any).progressionDeltas != null) {
            await storage.updatePlayer(player.id, { progressionDeltas: null } as any);
          }
          continue;
        }

        const targetOvrDelta = getOvrDeltaFromPotential(player.potential);

        const weScore = player.workEthicScore as number | null | undefined;
        const coachScore = player.coachability as number | null | undefined;
        // Divisor 150: allows the 0.6–1.4 clamp range to actually be reached.
        // Both at 100 → 1 + 60/150 = 1.4; both at 0 → 1 + (−140)/150 = 0.067 → clamped at 0.6.
        // Old divisor of 700 produced a tiny 0.80–1.09 range, making traits nearly invisible.
        const traitMult = 1 +
          ((weScore ?? 70) - 70) / 150 +
          ((coachScore ?? 70) - 70) / 150;

        // For positive deltas (growth), multiply — high traits amplify improvement.
        // For negative deltas (decline), divide — high traits dampen regression.
        // Example: D-potential player with max coachability (mult 1.4) declines 1/1.4 = 0.71x as fast.
        //          D-potential player with min coachability (mult 0.6) declines 1/0.6 = 1.67x as fast.
        const clampedMult = Math.max(0.6, Math.min(1.4, traitMult));
        const scaledDelta = targetOvrDelta >= 0
          ? targetOvrDelta * clampedMult
          : targetOvrDelta / clampedMult;

        // Baseline OVR computed from current attributes (before any updates).
        // Using this instead of player.overall for the delta eliminates formula-drift
        // contamination — if weights changed since the last save, the baseline
        // correctly reflects what the current formula would produce for these attrs.
        const baselineOvr = calculateOVR(player as any);

        const updates: Record<string, number> = {};
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

        (updates as any)["progressionDeltas"] = Object.keys(deltas).length > 0 ? deltas : null;

        await storage.updatePlayer(player.id, updates);
        progressed++;

        // Record the end-of-season OVR in player_season_stats for career history tracking
        if (newOverall) {
          await storage.setPlayerSeasonStatsOvr(player.id, leagueId, league.currentSeason, newOverall);
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

    // Log a verification summary so it's easy to confirm potential tiers are differentiated.
    const gradeOrder = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
    const summaryLines = gradeOrder
      .filter(g => gradeStats[g]?.count > 0)
      .map(g => {
        const s = gradeStats[g];
        const avg = (s.totalDelta / s.count).toFixed(1);
        return `${g}: n=${s.count} avgOVR=${avg > 0 ? "+" : ""}${avg} (↑${s.gainers} ↓${s.decliners})`;
      });
    console.log(`[Progression] League ${leagueId} — per-grade OVR summary:\n  ${summaryLines.join("\n  ")}`);

    return { progressed };
  }

  // ============ PROMISE EVALUATION ============
  async function evaluatePlayerPromises(leagueId: string, completedSeason: number) {
    const activePromises = await storage.getActivePromisesByLeague(leagueId);
    const promisesForSeason = activePromises.filter(p => p.season === completedSeason);
    
    if (promisesForSeason.length === 0) return { evaluated: 0, met: 0, broken: 0 };

    const teams = await storage.getTeamsByLeague(leagueId);
    const teamStandings: Record<string, any> = {};
    for (const team of teams) {
      const standings = await storage.getStandingsByLeague(leagueId, completedSeason);
      const teamStanding = standings.find(s => s.teamId === team.id);
      teamStandings[team.id] = teamStanding || { wins: 0, losses: 0 };
    }

    let met = 0;
    let broken = 0;

    for (const promise of promisesForSeason) {
      const player = await storage.getPlayer(promise.playerId);
      if (!player) {
        await storage.updatePlayerPromise(promise.id, { isActive: false, isMet: false, evaluatedSeason: completedSeason });
        broken++;
        continue;
      }

      let isMet = false;
      const target = promise.targetValue;

      if (promise.promiseCategory === "player") {
        // Player promises are based on simulated stats - since we don't track per-game stats yet,
        // we evaluate based on player overall and promise difficulty
        const difficulty = target; // "easy", "medium", "hard"
        const overallFactor = Math.min(1.0, (player.overall || 300) / 650);
        
        if (difficulty === "easy") {
          isMet = Math.random() < 0.7 + overallFactor * 0.2;
        } else if (difficulty === "medium") {
          isMet = Math.random() < 0.4 + overallFactor * 0.3;
        } else {
          isMet = Math.random() < 0.15 + overallFactor * 0.3;
        }
      } else if (promise.promiseCategory === "team") {
        const standing = teamStandings[promise.teamId];
        const totalGames = (standing?.wins || 0) + (standing?.losses || 0);
        const winPct = totalGames > 0 ? (standing?.wins || 0) / totalGames : 0;

        if (promise.promiseType === "winPercentage") {
          const targetPct = parseFloat(target) || 0.5;
          isMet = winPct >= targetPct;
        } else if (promise.promiseType === "conferenceChampionship") {
          isMet = Math.random() < winPct * 0.5; // approximate based on record
        } else if (promise.promiseType === "cwsChampionship") {
          isMet = Math.random() < winPct * 0.15; // very hard to achieve
        } else {
          const difficulty = target;
          if (difficulty === "easy") isMet = winPct >= 0.45;
          else if (difficulty === "medium") isMet = winPct >= 0.55;
          else isMet = winPct >= 0.65;
        }
      }

      await storage.updatePlayerPromise(promise.id, {
        isActive: false,
        isMet,
        evaluatedSeason: completedSeason,
      });

      if (isMet) {
        met++;
      } else {
        broken++;
        // Auto-flag player for departure next offseason
        if (player) {
          await storage.updatePlayer(player.id, {
            inTransferPortal: true,
            portalReason: `Broken promise: ${promise.promiseType}`,
          });
        }
      }
    }

    return { evaluated: promisesForSeason.length, met, broken };
  }

  // ============ SHARED FINALIZE DEPARTURES HELPER ============
  async function finalizeDeparturesInternal(leagueId: string, league: any) {
    await processOffseasonDepartures(leagueId, league.currentSeason);

    const teams = await storage.getTeamsByLeague(leagueId);
    let totalGraduated = 0;
    let totalDrafted = 0;
    let totalTransferred = 0;

    const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };

    // Pre-load all players for the entire league at once to avoid N+1 per team
    const allLeaguePlayers = await storage.getPlayersByLeague(leagueId);
    const rosterByTeam = new Map<string, typeof allLeaguePlayers>();
    for (const p of allLeaguePlayers) {
      if (!rosterByTeam.has(p.teamId)) rosterByTeam.set(p.teamId, []);
      rosterByTeam.get(p.teamId)!.push(p);
    }

    const historyRecords: any[] = [];
    const playerIdsToDelete: string[] = [];
    const transferUpdates: Array<{ id: string }> = [];
    const retainedUpdates: Array<{ id: string }> = [];

    for (const team of teams) {
      const roster = rosterByTeam.get(team.id) ?? [];
      const pending = roster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained");

      for (const player of pending) {
        if (player.departureType === "graduated" || player.departureType === "draft") {
          historyRecords.push({
            leagueId,
            teamId: team.id,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            finalEligibility: player.eligibility,
            overall: player.overall ?? 300,
            starRating: player.starRating ?? 3,
            signingOvr: player.signingOvr ?? player.overall ?? 300,
            ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
            departureType: player.departureType,
            draftRound: player.draftRound || null,
            departedSeason: league.currentSeason,
            seasonsPlayed: eligMap[player.eligibility] || 1,
            abilities: player.abilities || [],
            homeState: player.homeState || "",
            hometown: player.hometown || "",
            sourcePlayerId: player.id,
          });
          playerIdsToDelete.push(player.id);
          if (player.departureType === "graduated") totalGraduated++;
          else totalDrafted++;
        } else if (player.departureType === "transfer") {
          historyRecords.push({
            leagueId,
            teamId: team.id,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            finalEligibility: player.eligibility,
            overall: player.overall ?? 300,
            starRating: player.starRating ?? 3,
            signingOvr: player.signingOvr ?? player.overall ?? 300,
            ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
            departureType: "transfer_portal",
            departedSeason: league.currentSeason,
            seasonsPlayed: eligMap[player.eligibility] || 1,
            abilities: player.abilities || [],
            homeState: player.homeState || "",
            hometown: player.hometown || "",
            sourcePlayerId: player.id,
          });
          transferUpdates.push({ id: player.id });
          totalTransferred++;
        }
      }

      const retained = roster.filter(p => p.pendingDeparture && p.retentionStatus === "retained");
      for (const player of retained) {
        retainedUpdates.push({ id: player.id });
      }
    }

    // Batch-insert all history records, batch-delete all departing players, and
    // run transfer/retained player updates in parallel
    await Promise.all([
      storage.batchCreatePlayerHistories(historyRecords),
      storage.batchDeletePlayers(playerIdsToDelete),
      Promise.all(transferUpdates.map(u => storage.updatePlayer(u.id, {
        pendingDeparture: false,
        retentionStatus: null,
        inTransferPortal: true,
      }))),
      Promise.all(retainedUpdates.map(u => storage.updatePlayer(u.id, {
        pendingDeparture: false,
        departureType: null,
        draftRound: null,
      }))),
    ]);

    // Safety sweep: clear any pendingDeparture:true flags that weren't handled above
    // (edge cases: partial failures, promise-broken players, etc.). This guarantees the
    // next season always starts with a clean slate and the idempotency guard won't fire early.
    const stragglers = await storage.getPendingDeparturesByLeague(leagueId);
    if (stragglers.length > 0) {
      console.log(`[departures] finalize safety sweep: clearing ${stragglers.length} remaining stale pendingDeparture flags`);
      await Promise.all(stragglers.map(p =>
        storage.updatePlayer(p.id, { pendingDeparture: false, departureType: null })
      ));
    }

    // Add transfer portal players to the existing recruiting pool as TRANSFER recruits
    const existingRecruits = await storage.getRecruitsByLeague(leagueId);
    const existingSourceIds = new Set(existingRecruits.filter(r => r.sourcePlayerId).map(r => r.sourcePlayerId));

    // Re-use the already-loaded league players; refresh portal status after updates above
    const allTeamsForTransfers = teams;
    const allPlayersAfterUpdate = await storage.getPlayersByLeague(leagueId);
    const portalByTeam = new Map<string, typeof allPlayersAfterUpdate>();
    for (const p of allPlayersAfterUpdate) {
      if (!portalByTeam.has(p.teamId)) portalByTeam.set(p.teamId, []);
      portalByTeam.get(p.teamId)!.push(p);
    }

    const transfersToAdd: Array<{ player: any; teamName: string }> = [];
    
    for (const team of allTeamsForTransfers) {
      const portalPlayers = (portalByTeam.get(team.id) ?? []).filter(p => p.inTransferPortal);
      for (const player of portalPlayers) {
        if (!existingSourceIds.has(player.id)) {
          transfersToAdd.push({ player, teamName: team.name });
        }
      }
    }
    
    // Collect all OVRs for ranking after batch creation
    const allOvrs = existingRecruits.map(r => r.overall || 0);
    for (const { player } of transfersToAdd) {
      allOvrs.push(player.overall || 300);
    }
    allOvrs.sort((a, b) => b - a);
    
    let transferRecruitsCreated = 0;
    for (const { player, teamName } of transfersToAdd) {
      try {
        const ovr = calculateOVR(player);
        const starRating = getStarRatingFromOVR(ovr);
        
        const higherOrEqual = allOvrs.filter(o => o >= ovr);
        const classRank = Math.max(1, higherOrEqual.indexOf(ovr) + 1 || higherOrEqual.length);
        const posOvrs = [...existingRecruits.filter(r => r.position === player.position).map(r => r.overall || 0), ovr].sort((a, b) => b - a);
        const posRank = Math.max(1, posOvrs.indexOf(ovr) + 1);
        
        const validEligibilities = ["FR", "SO", "JR", "SR", "RS"];
        const recruitYear = validEligibilities.includes(player.eligibility) ? player.eligibility : "SO";
        const playerAbilities = Array.isArray(player.abilities) ? player.abilities : [];
        
        await storage.createRecruit({
            leagueId,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            throwHand: player.throwHand || "R",
            batHand: player.batHand || "R",
            homeState: player.homeState || "TX",
            hometown: player.hometown || "Unknown",
            starRank: starRating,
            classRank,
            positionRank: posRank,
            recruitType: "TRANSFER",
            recruitYear,
            overall: ovr,
            starRating,
            hitForAvg: player.hitForAvg ?? 50,
            power: player.power ?? 50,
            speed: player.speed ?? 50,
            arm: player.arm ?? 50,
            fielding: player.fielding ?? 50,
            errorResistance: player.errorResistance ?? 50,
            clutch: player.clutch ?? 50,
            vsLHP: player.vsLHP ?? 50,
            grit: player.grit ?? 50,
            stealing: player.stealing ?? 50,
            running: player.running ?? 50,
            throwing: player.throwing ?? 50,
            recovery: player.recovery ?? 50,
            catcherAbility: player.catcherAbility ?? 50,
            velocity: player.velocity ?? 50,
            control: player.control ?? 50,
            stamina: player.stamina ?? 50,
            stuff: player.stuff ?? 50,
            wRISP: player.wRISP ?? 50,
            vsLefty: player.vsLefty ?? 50,
            poise: player.poise ?? 50,
            heater: player.heater ?? 50,
            agile: player.agile ?? 50,
            pitchFB: player.pitchFB ?? 1,
            pitch2S: player.pitch2S ?? 0,
            pitchSL: player.pitchSL ?? 0,
            pitchCB: player.pitchCB ?? 0,
            pitchCH: player.pitchCH ?? 0,
            pitchCT: player.pitchCT ?? 0,
            pitchSNK: player.pitchSNK ?? 0,
            pitchSPL: player.pitchSPL ?? 0,
            abilities: playerAbilities,
            potential: player.potential ?? rollWeightedPotential(),
            sourcePlayerId: player.id,
            fromTeamName: teamName,
            trajectory: (player as any).trajectory ?? (["P","SP","RP","CP"].includes(player.position) ? 2 : assignTrajectory(player.power ?? 50, player.speed ?? 50, player.hitForAvg ?? 50)),
            commitmentThreshold: 450,
            proximityPriority: "Somewhat",
            reputationPriority: "Very Important",
            playingTimePriority: "Extremely Important",
            academicsPriority: "Not Important",
            prestigePriority: "Very Important",
            facilitiesPriority: "Somewhat",
            skinTone: player.skinTone || "light",
            hairColor: player.hairColor || "brown",
            hairStyle: player.hairStyle || "short",
            headwear: player.headwear || "cap",
          });
        transferRecruitsCreated++;
      } catch (e) {
        console.error(`Failed to create TRANSFER recruit for ${player.firstName} ${player.lastName} (player ${player.id}) from ${teamName}:`, e);
      }
    }
    console.log(`Transfer portal: ${transfersToAdd.length} portal players found, ${transferRecruitsCreated} TRANSFER recruits created`);
    
    // Regenerate top schools interest to include transfer recruits
    await generateTopSchoolsForLeague(leagueId);

    const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "offseason_recruiting_1" });

    return { updatedLeague, graduated: totalGraduated, drafted: totalDrafted, transferred: totalTransferred };
  }

  // ============ OFFSEASON DEPARTURES ============
  function generateDraftAsk(overall: number): { min: number; max: number } {
    const baseMin = Math.floor((overall - 300) * 2000 + 50000);
    const baseMax = Math.floor(baseMin * (1.5 + Math.random() * 0.5));
    const variance = Math.floor(Math.random() * 20000);
    return { 
      min: Math.max(25000, baseMin + variance), 
      max: Math.max(50000, baseMax + variance) 
    };
  }

  const transferReasons = [
    "Wants more playing time",
    "Looking for a fresh start",
    "Unhappy with team direction",
    "Seeking better facilities",
    "Wants to be closer to home",
    "Dissatisfied with role on team",
    "Looking for more competitive program",
    "Academic opportunities elsewhere",
  ];

  async function processOffseasonDepartures(leagueId: string, completedSeason: number) {
    const teams = await storage.getTeamsByLeague(leagueId);
    let totalGraduated = 0;
    let totalDraftDeclared = 0;
    let totalTransferPortal = 0;

    const existingPending = await storage.getPendingDeparturesByLeague(leagueId);
    if (existingPending.length > 0) {
      const grads = existingPending.filter(p => p.departureType === "graduated");
      const drafts = existingPending.filter(p => p.departureType === "draft");
      const transfers = existingPending.filter(p => p.departureType === "transfer");
      if (grads.length > 0 || drafts.length > 0) {
        // Valid previous run — graduates/draft entries are present; return cached result.
        console.log(`[departures] idempotency: found ${grads.length} grads, ${drafts.length} drafts, ${transfers.length} transfers — returning cached result`);
        return { graduated: grads.length, draftDeclared: drafts.length, transferPortal: transfers.length };
      }
      // Stale flags exist but no grads or drafts — these are leftover flags from a
      // prior season (e.g. un-cleared transfer portal or promise-broken players).
      // Clear them so the full departure run can proceed cleanly for this season.
      console.log(`[departures] idempotency: found ${existingPending.length} stale pendingDeparture flags with no grads/drafts — clearing before re-run`);
      await Promise.all(existingPending.map(p =>
        storage.updatePlayer(p.id, { pendingDeparture: false, departureType: null })
      ));
    }
    
    // Phase 1: Collect all seniors and potential departures across ALL teams
    const allSeniors: Array<{ player: any; team: any }> = [];
    const allRosterPlayers: Array<{ player: any; team: any }> = [];
    
    for (const team of teams) {
      const roster = await storage.getPlayersByTeam(team.id);
      for (const player of roster) {
        allRosterPlayers.push({ player, team });
        if (player.eligibility === "SR") {
          allSeniors.push({ player, team });
        }
      }
    }
    
    // Phase 2: MLB Draft Projection - top players get drafted instead of just graduating
    // Collect all departing players (seniors + previously declared juniors/RS)
    const allDepartingPlayers: Array<{ player: any; team: any; isJunior: boolean }> = [];
    
    for (const { player, team } of allSeniors) {
      allDepartingPlayers.push({ player, team, isJunior: false });
    }
    
    // Also include juniors/RS/SOs with high enough OVR for draft consideration
    // Threshold raised to 500: only genuinely elite underclassmen declare early
    const juniorDraftCandidates = allRosterPlayers.filter(({ player }) => 
      (player.eligibility === "JR" || player.eligibility === "RS" || player.eligibility === "SO") && 
      !player.declaredForDraft &&
      (player.overall || 0) >= 500
    );
    for (const { player, team } of juniorDraftCandidates) {
      allDepartingPlayers.push({ player, team, isJunior: true });
    }
    
    // Previously declared draft players
    const previouslyDeclared = allRosterPlayers.filter(({ player }) => 
      player.declaredForDraft && player.eligibility !== "SR"
    );
    for (const { player, team } of previouslyDeclared) {
      if (!allDepartingPlayers.find(d => d.player.id === player.id)) {
        allDepartingPlayers.push({ player, team, isJunior: true });
      }
    }
    
    // Sort all departing players by OVR descending to project draft rounds
    const sortedByOvr = [...allDepartingPlayers].sort((a, b) => (b.player.overall || 0) - (a.player.overall || 0));
    
    // Project 3 rounds of MLB Draft (about 90 picks for 30 teams, but we scale to league size)
    // Each round has ~(number of teams * 2-3) picks, so roughly top 10% of all departures
    const totalDepartures = allSeniors.length + previouslyDeclared.length;
    const draftPicks = Math.max(6, Math.ceil(totalDepartures * 0.10)); // At least 6 picks
    const round1Picks = Math.ceil(draftPicks / 3);
    const round2Picks = Math.ceil(draftPicks / 3);
    const round3Picks = draftPicks - round1Picks - round2Picks;
    
    // Map each top player to a draft round
    const draftProjections = new Map<string, number>();
    for (let i = 0; i < Math.min(sortedByOvr.length, draftPicks); i++) {
      const round = i < round1Picks ? 1 : i < round1Picks + round2Picks ? 2 : 3;
      draftProjections.set(sortedByOvr[i].player.id, round);
    }

    // Track draftPicks for each team's coach
    try {
      const teamDraftCounts = new Map<string, number>();
      for (let i = 0; i < Math.min(sortedByOvr.length, draftPicks); i++) {
        const tId = sortedByOvr[i].team.id;
        teamDraftCounts.set(tId, (teamDraftCounts.get(tId) || 0) + 1);
      }
      const leagueCoaches = await storage.getCoachesByLeague(leagueId);
      for (const [tId, count] of teamDraftCounts.entries()) {
        const dpCoach = leagueCoaches.find(c => c.teamId === tId);
        if (dpCoach) {
          const newDraftPicks = dpCoach.draftPicks + count;
          await storage.updateCoach(dpCoach.id, { draftPicks: newDraftPicks, legacyScore: computeLegacyScore({ ...dpCoach, draftPicks: newDraftPicks }) });
        }
      }
    } catch (e) { console.error("Draft picks coach stats error:", e); }

    // Phase 3: Process each team's departures
    for (const team of teams) {
      const roster = await storage.getPlayersByTeam(team.id);
      
      // Seniors: check if they're projected to be drafted
      const seniors = roster.filter(p => p.eligibility === "SR");
      for (const senior of seniors) {
        const projectedRound = draftProjections.get(senior.id);
        if (projectedRound) {
          // Senior is projected to be drafted
          await storage.updatePlayer(senior.id, {
            pendingDeparture: true,
            departureType: "draft",
            retentionStatus: "none", // Seniors can't be retained from draft
            draftRound: projectedRound,
          });
          totalDraftDeclared++;
        } else {
          // Regular graduation
          await storage.updatePlayer(senior.id, {
            pendingDeparture: true,
            departureType: "graduated",
            retentionStatus: "none",
          });
          totalGraduated++;
        }
      }
      
      // Juniors/RS/SOs projected in first 3 rounds auto-declare for draft
      const juniorsOnTeam = roster.filter(p => 
        (p.eligibility === "JR" || p.eligibility === "RS" || p.eligibility === "SO") && 
        p.eligibility !== "SR" &&
        !p.declaredForDraft
      );
      for (const player of juniorsOnTeam) {
        const projectedRound = draftProjections.get(player.id);
        if (projectedRound) {
          const ask = generateDraftAsk(player.overall);
          // Retention multiplier is eligibility-based: SOs are easier to retain (2 years left),
          // JRs/RS are harder (1 year left or already grad-eligible).
          const isSophomore = player.eligibility === "SO";
          const draftMultiplier = isSophomore
            ? (projectedRound === 1 ? 1.5 : projectedRound === 2 ? 1.2 : 1.0)
            : (projectedRound === 1 ? 2.0 : projectedRound === 2 ? 1.5 : 1.2);
          await storage.updatePlayer(player.id, {
            pendingDeparture: true,
            departureType: "draft",
            retentionStatus: "pending",
            draftAskMin: Math.floor(ask.min * draftMultiplier),
            draftAskMax: Math.floor(ask.max * draftMultiplier),
            draftRound: projectedRound,
            declaredForDraft: true,
          });
          totalDraftDeclared++;
          try {
            await generateDraftDeclarationNewsArticle(
              leagueId, `${player.firstName} ${player.lastName}`,
              player.position, team, player.overall, player.starRating || 3, completedSeason
            );
          } catch (e) { console.error("Draft news error:", e); }
        }
      }
      
      // Previously declared draft players (carried over from before)
      const prevDeclared = roster.filter(p => p.declaredForDraft && p.eligibility !== "SR" && !juniorsOnTeam.find(j => j.id === p.id && draftProjections.has(j.id)));
      for (const player of prevDeclared) {
        if (player.pendingDeparture) continue; // Already processed
        const projectedRound = draftProjections.get(player.id);
        const ask = generateDraftAsk(player.overall);
        await storage.updatePlayer(player.id, {
          pendingDeparture: true,
          departureType: "draft",
          retentionStatus: "pending",
          draftAskMin: player.draftAskMin || ask.min,
          draftAskMax: player.draftAskMax || ask.max,
          draftRound: projectedRound || null,
        });
        totalDraftDeclared++;
      }
      
      // Transfer portal - lower-rated players
      const nonDeparting = roster.filter(p => 
        p.eligibility !== "SR" && 
        !p.declaredForDraft &&
        !p.inTransferPortal &&
        !p.pendingDeparture &&
        !draftProjections.has(p.id) &&
        (p.overall || 300) < 350
      );
      const portalCount = Math.max(0, Math.floor(nonDeparting.length * (0.1 + Math.random() * 0.1)));
      const shuffled = nonDeparting.sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(portalCount, shuffled.length); i++) {
        const reason = transferReasons[Math.floor(Math.random() * transferReasons.length)];
        await storage.updatePlayer(shuffled[i].id, { 
          pendingDeparture: true,
          departureType: "transfer",
          retentionStatus: (shuffled[i].eligibility === "JR" || shuffled[i].eligibility === "SO") ? "pending" : "none",
          inTransferPortal: true,
          transferReason: reason,
        });
        totalTransferPortal++;
        try {
          await generateTransferPortalNewsArticle(
            leagueId, `${shuffled[i].firstName} ${shuffled[i].lastName}`,
            shuffled[i].position, team, shuffled[i].starRating || 3, completedSeason
          );
        } catch (e) { console.error("Transfer portal news error:", e); }
      }
      
      const existingPortal = roster.filter(p => p.inTransferPortal && !p.pendingDeparture && !shuffled.slice(0, portalCount).find(s => s.id === p.id));
      for (const player of existingPortal) {
        await storage.updatePlayer(player.id, {
          pendingDeparture: true,
          departureType: "transfer",
          retentionStatus: (player.eligibility === "JR" || player.eligibility === "SO") ? "pending" : "none",
          transferReason: player.transferReason || transferReasons[Math.floor(Math.random() * transferReasons.length)],
        });
        totalTransferPortal++;
      }

      // Positional competition pass: SO/JR players buried behind a higher-rated teammate
      // at their same position have an elevated (35%) chance of entering the portal,
      // regardless of their own OVR. They remain retainable (status: "pending").
      const alreadySelectedIds = new Set([
        ...shuffled.slice(0, portalCount).map((p: any) => p.id),
        ...existingPortal.map((p: any) => p.id),
      ]);
      const competitionCandidates = roster.filter(p =>
        (p.eligibility === "SO" || p.eligibility === "JR") &&
        !p.declaredForDraft &&
        !p.inTransferPortal &&
        !p.pendingDeparture &&
        !draftProjections.has(p.id) &&
        !alreadySelectedIds.has(p.id)
      );
      for (const player of competitionCandidates) {
        const hasHigherRatedTeammate = roster.some(tm =>
          tm.id !== player.id &&
          !tm.pendingDeparture &&
          !tm.declaredForDraft &&
          tm.position === player.position &&
          (tm.overall || 0) > (player.overall || 0)
        );
        if (hasHigherRatedTeammate && Math.random() < 0.35) {
          await storage.updatePlayer(player.id, {
            pendingDeparture: true,
            departureType: "transfer",
            retentionStatus: "pending",
            inTransferPortal: true,
            transferReason: "Wants more playing time",
          });
          totalTransferPortal++;
          try {
            await generateTransferPortalNewsArticle(
              leagueId, `${player.firstName} ${player.lastName}`,
              player.position, team, player.starRating || 3, completedSeason
            );
          } catch (e) { console.error("Transfer portal news error:", e); }
        }
      }
    }
    
    return { graduated: totalGraduated, draftDeclared: totalDraftDeclared, transferPortal: totalTransferPortal };
  }
  
  // ============ CPU TRANSFER PORTAL RECRUITING ============
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
      
      // Find portal players from other teams, sorted by need
      const candidates = allPlayers
        .filter(p => p.currentTeam.id !== team.id && p.inTransferPortal)
        .map(p => ({
          player: p,
          score: ((positionCounts[p.position] || 0) < 2 ? 20 : 0) + (p.overall || 300) / 100 + Math.random() * 5,
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
    
    const positionsToFill = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
    const pool = await storage.getWalkonsByLeague(leagueId);
    const posCounts: Record<string, number> = {};
    for (const p of pool) {
      posCounts[p.position] = (posCounts[p.position] || 0) + 1;
    }
    
    // Scale filler per position to league size. Formula: max(4, round(12 × (recruitCount / 80))).
    const allLeagueTeamsWo = await storage.getTeamsByLeague(leagueId);
    const expectedRecruitCount = getRecruitPoolSize(allLeagueTeamsWo.length);
    const TARGET_PER_POS = Math.max(4, Math.round(12 * (expectedRecruitCount / 80)));
    const fillerStates = ["TX", "CA", "FL", "GA", "NC", "AL", "SC", "LA", "AZ", "OH"];
    const fillerTowns = ["Springfield", "Franklin", "Clinton", "Madison", "Georgetown", "Salem", "Greenville", "Bristol", "Fairview", "Chester"];
    
    for (const pos of positionsToFill) {
      const current = posCounts[pos] || 0;
      const needed = Math.max(0, TARGET_PER_POS - current);
      
      for (let i = 0; i < needed; i++) {
        const isPitcher = pos === "P";
        const randAttr = () => 20 + Math.floor(Math.random() * 26);
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
          throwHand: pos === "P" ? (Math.random() < 0.30 ? "L" : "R") : (Math.random() < 0.10 ? "L" : "R"),
          batHand: pos === "P" ? (Math.random() < 0.15 ? "L" : "R") : (() => { const r = Math.random(); return r < 0.28 ? "L" : r < 0.31 ? "S" : "R"; })(),
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
    const allPositions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
    // Build list of (walkon, positionPriority) sorted by need then OVR
    const desired: (typeof pool)[number][] = [];
    const usedIds = new Set<string>();

    for (let pass = 0; pass < slotsNeeded; pass++) {
      const posNeeds = allPositions.map(pos => ({ pos, count: positionCounts[pos] || 0 }))
        .sort((a, b) => a.count - b.count);
      let picked = false;
      for (const need of posNeeds) {
        const candidates = pool
          .filter(w => w.position === need.pos && !usedIds.has(w.id))
          .sort((a, b) => (b.overall || 0) - (a.overall || 0));
        if (candidates.length > 0) {
          desired.push(candidates[0]);
          usedIds.add(candidates[0].id);
          positionCounts[need.pos] = (positionCounts[need.pos] || 0) + 1;
          picked = true;
          break;
        }
      }
      if (!picked) {
        const fallback = pool.filter(w => !usedIds.has(w.id)).sort((a, b) => (b.overall || 0) - (a.overall || 0));
        if (fallback.length > 0) {
          desired.push(fallback[0]);
          usedIds.add(fallback[0].id);
          positionCounts[fallback[0].position] = (positionCounts[fallback[0].position] || 0) + 1;
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

  async function finalizeSigningDay(leagueId: string, completedSeason: number) {
    console.log(`[finalizeSigningDay] Starting for league ${leagueId}, season ${completedSeason}`);
    const progressionResult = await applyPlayerProgression(leagueId);
    console.log(`[finalizeSigningDay] Progression complete: ${progressionResult.progressed} players`);

    const teams = await storage.getTeamsByLeague(leagueId);
    let totalRecruitsAdded = 0;
    let totalTransferred = 0;

    const MIN_ROSTER = 22;
    const cpuTeamsNeedingRecruits: Array<{ team: typeof teams[0]; needed: number; positionCounts: Record<string, number> }> = [];
    const allRecruitsPreCheck = await storage.getRecruitsByLeague(leagueId);

    for (const team of teams) {
      // Auto-pilot human teams get the same CPU minimum-roster auto-fill
      if (!team.isCpu && !team.isAutoPilot) continue;
      const currentRoster = await storage.getPlayersByTeam(team.id);
      const alreadySignedCount = allRecruitsPreCheck.filter(r => r.signedTeamId === team.id).length;
      const projectedSize = currentRoster.length + alreadySignedCount;
      if (projectedSize <= MIN_ROSTER) {
        const positionCounts: Record<string, number> = {};
        for (const p of currentRoster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        cpuTeamsNeedingRecruits.push({ team, needed: MIN_ROSTER - projectedSize, positionCounts });
      }
    }

    if (cpuTeamsNeedingRecruits.length > 0) {
      const unsignedPool = allRecruitsPreCheck.filter(r => !r.signedTeamId);
      const claimed = new Set<string>();
      let anyAssigned = true;
      while (anyAssigned) {
        anyAssigned = false;
        for (const entry of cpuTeamsNeedingRecruits) {
          if (entry.needed <= 0) continue;
          const available = unsignedPool.filter(r => !claimed.has(r.id));
          if (available.length === 0) break;
          const best = available.sort((a, b) => {
            const aNeed = (entry.positionCounts[a.position] || 0) < 2 ? 10 : 0;
            const bNeed = (entry.positionCounts[b.position] || 0) < 2 ? 10 : 0;
            return (bNeed + (b.overall || 0)) - (aNeed + (a.overall || 0));
          })[0];
          if (best) {
            await storage.updateRecruit(best.id, { signedTeamId: entry.team.id });
            // #26 — log CPU auto-signing in the activity feed so human coaches can see it
            try {
              await storage.createLeagueEvent({
                leagueId,
                teamId: entry.team.id,
                teamName: entry.team.name,
                teamAbbreviation: entry.team.abbreviation || entry.team.name.slice(0, 4).toUpperCase(),
                eventType: "SIGNING",
                description: `${entry.team.name} signed ${best.firstName} ${best.lastName} (${best.position}, ${best.starRating ?? 0}★) — CPU auto-signed`,
                season: completedSeason,
                week: 0,
              });
            } catch (evErr) {
              console.error("[finalizeSigningDay] Failed to create CPU signing event:", evErr);
            }
            claimed.add(best.id);
            entry.positionCounts[best.position] = (entry.positionCounts[best.position] || 0) + 1;
            entry.needed--;
            anyAssigned = true;
          }
        }
      }
    }

    // Auto-commit remaining undecided recruits (top3/top5/verbal stage) to their
    // highest-interest team that has made them an offer.  This ensures the signing-day
    // preview and the actual outcome are consistent – previously these recruits were
    // only auto-signed to CPU teams below the MIN_ROSTER threshold, which meant the
    // preview "committingTo" value often didn't match what happened in the DB.
    {
      const stillUnsigned = (await storage.getRecruitsByLeague(leagueId)).filter(
        r => !r.signedTeamId && ["verbal", "top3", "top5", "top8", "open"].includes(r.stage || "")
      );
      for (const recruit of stillUnsigned) {
        try {
          const interests = await storage.getRecruitingInterestsByRecruit(recruit.id);
          const eligible = interests
            .filter(i => (i.interestLevel || 0) > 0)
            .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0));
          // Prefer a team that has made an offer; fall back to highest raw interest
          const target = eligible.find(i => i.hasOffer) ?? eligible[0];
          if (target?.teamId) {
            await storage.updateRecruit(recruit.id, { signedTeamId: target.teamId });
          }
        } catch (e) {
          console.error(`[finalizeSigningDay] Failed to auto-commit recruit ${recruit.id}:`, e);
        }
      }
      if (stillUnsigned.length > 0) {
        console.log(`[finalizeSigningDay] Auto-committed ${stillUnsigned.length} undecided recruits based on interest`);
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
        const currentRoster = await storage.getPlayersByTeam(team.id);
        const signedCount = allAfterAutoCommit.filter(r => r.signedTeamId === team.id).length;
        // Dynamic target: enough new players to approach MAX_ROSTER
        const classTarget = Math.max(MIN_CLASS_FLOOR, MAX_ROSTER - currentRoster.length);
        if (signedCount >= classTarget) continue;

        const needed = classTarget - signedCount;
        const positionCounts: Record<string, number> = {};
        for (const p of currentRoster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;

        let filled = 0;
        while (filled < needed) {
          const available = remainingPool.filter(r => !poolClaimed.has(r.id));
          if (available.length === 0) break;
          const best = available.sort((a, b) => {
            const aNeed = (positionCounts[a.position] || 0) < 2 ? 10 : 0;
            const bNeed = (positionCounts[b.position] || 0) < 2 ? 10 : 0;
            return (bNeed + (b.overall || 0)) - (aNeed + (a.overall || 0));
          })[0];
          if (!best) break;
          await storage.updateRecruit(best.id, { signedTeamId: team.id });
          try {
            await storage.createLeagueEvent({
              leagueId,
              teamId: team.id,
              teamName: team.name,
              teamAbbreviation: team.abbreviation || team.name.slice(0, 4).toUpperCase(),
              eventType: "SIGNING",
              description: `${team.name} signed ${best.firstName} ${best.lastName} (${best.position}, ${best.starRating ?? 0}★) — CPU auto-signed`,
              season: completedSeason,
              week: 0,
            });
          } catch { /* non-fatal */ }
          poolClaimed.add(best.id);
          positionCounts[best.position] = (positionCounts[best.position] || 0) + 1;
          filled++;
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
          const currentRoster = await storage.getPlayersByTeam(team.id);
          const signedCount = afterDynamic.filter(r => r.signedTeamId === team.id).length;
          const projectedSize = currentRoster.length + signedCount;
          const slotsLeft = Math.max(0, MAX_ROSTER - projectedSize);
          if (slotsLeft <= 0) continue;
          const positionCounts: Record<string, number> = {};
          for (const p of currentRoster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
          sweepEntries.push({ team, slotsLeft, positionCounts });
        }

        if (sweepEntries.length > 0) {
          // Sort most-needy teams first each round
          sweepEntries.sort((a, b) => b.slotsLeft - a.slotsLeft);
          const sweepClaimed = new Set<string>();
          let anyPlaced = true;
          let sweepTotal = 0;

          while (anyPlaced) {
            anyPlaced = false;
            for (const entry of sweepEntries) {
              if (entry.slotsLeft <= 0) continue;
              const available = sweepPool.filter(r => !sweepClaimed.has(r.id));
              if (available.length === 0) break;
              const best = available.sort((a, b) => {
                const aNeed = (entry.positionCounts[a.position] || 0) < 2 ? 10 : 0;
                const bNeed = (entry.positionCounts[b.position] || 0) < 2 ? 10 : 0;
                return (bNeed + (b.overall || 0)) - (aNeed + (a.overall || 0));
              })[0];
              if (!best) break;
              await storage.updateRecruit(best.id, { signedTeamId: entry.team.id });
              try {
                await storage.createLeagueEvent({
                  leagueId,
                  teamId: entry.team.id,
                  teamName: entry.team.name,
                  teamAbbreviation: entry.team.abbreviation || entry.team.name.slice(0, 4).toUpperCase(),
                  eventType: "SIGNING",
                  description: `${entry.team.name} signed ${best.firstName} ${best.lastName} (${best.position}, ${best.starRating ?? 0}★) — CPU auto-signed`,
                  season: completedSeason,
                  week: 0,
                });
              } catch { /* non-fatal */ }
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
        }

        const stillUnsigned = (await storage.getRecruitsByLeague(leagueId)).filter(r => !r.signedTeamId).length;
        console.log(`[finalizeSigningDay] After full-sweep: ${stillUnsigned} recruits remain unsigned`);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // NOTE: signingDayRevealed is NOT set here anymore.
    // The attr/common-ability holdback (40%/50%) stays in place until coaches watch the Signing Day screen.
    // The reveal screen calls POST /api/leagues/:id/signing-day-reveal/complete to lift it.

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
          signingOvr: recruit.overall,
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
          pitchSPL: recruit.pitchSPL ?? 0,
          abilities: recruit.abilities || [],
          skinTone: recruit.skinTone || "light",
          hairColor: recruit.hairColor || "brown",
          hairStyle: recruit.hairStyle || "short",
          headwear: recruit.headwear || "cap",
          potential: recruit.potential ?? null,
          workEthicScore: recruit.workEthicScore ?? 70,
          coachability: recruit.coachability ?? 70,
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
      const baseNil = CONFERENCE_TIER_NIL[confName] ?? DEFAULT_CONFERENCE_NIL;

      const earnings: Array<{ category: string; amount: number; description: string }> = [];

      earnings.push({ category: "base", amount: baseNil, description: `${confName || "Unknown"} conference base allocation` });

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

      // ── Reset nilBudget and nilSpent
      const totalNil = earnings.reduce((s, e) => s + e.amount, 0);
      await storage.updateTeam(team.id, { nilBudget: totalNil, nilSpent: 0 });

      console.log(`[NIL] Season ${newSeason} | Team ${team.abbreviation}: base $${(baseNil / 1000).toFixed(0)}K + bonuses $${((totalNil - baseNil) / 1000).toFixed(0)}K = $${(totalNil / 1000).toFixed(0)}K total`);
    }
  }

  async function finalizeWalkonsPhase(leagueId: string, completedSeason: number) {
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

      // Deduct NIL from winner
      const winnerTeam = teamMap.get(winner.teamId);
      if (winnerTeam) {
        const newNilSpent = (winnerTeam.nilSpent || 0) + pricePaid;
        await storage.updateTeam(winnerTeam.id, { nilSpent: newNilSpent });
        winnerTeam.nilSpent = newNilSpent;
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
          skinTone: walkon.skinTone || "light",
          hairColor: walkon.hairColor || "brown",
          hairStyle: walkon.hairStyle || "short",
          headwear: walkon.headwear || "cap",
          potential: walkon.potential ?? null,
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

    // Scale recruit class to league size: min(teams × 5 + 10, 80), so 12 teams → 70, 16 teams → 80
    const recruitCount = getRecruitPoolSize(teams.length);
    // Pass completedSeason + 1 so storyline recruits are keyed to the UPCOMING season,
    // not the season that just ended (the DB counter is bumped after this function returns).
    await generateRecruits(leagueId, recruitCount, false, completedSeason + 1);

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
        const posRank = posRecruits.filter(r => (r.overall || 0) >= boostedOverall).length + 1;

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

    await generateSchedule(leagueId, completedSeason + 1);

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

    // Compute NIL budgets for the new season — failure is intentionally non-silent
    await computeSeasonNilBudget(leagueId, completedSeason);
    console.log(`[NIL] Season ${completedSeason + 1} budgets computed for league ${leagueId}`);

    return {
      walkonsAdded: totalWalkonsAdded,
      newRecruits: recruitCount,
      auctionResultsByTeam: Object.fromEntries(auctionResultsByTeam),
    };
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
  app.post("/api/leagues/:id/admin/dedup-rosters", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
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

  // ============ PLAYER HISTORY API ============
  app.get("/api/leagues/:id/player-history", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      const history = await storage.getPlayerHistoryByLeague(req.params.id);
      const teams = await storage.getTeamsByLeague(req.params.id);
      const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));
      
      const enrichedHistory = history.map(h => ({
        ...h,
        teamName: teamMap[h.teamId]?.name || "Unknown",
        abbreviation: teamMap[h.teamId]?.abbreviation || "???",
        primaryColor: teamMap[h.teamId]?.primaryColor || "#666",
      }));
      
      res.json({ history: enrichedHistory });
    } catch (error) {
      console.error("Failed to fetch player history:", error);
      res.status(500).json({ message: "Failed to fetch player history" });
    }
  });

  // ============ SIGNING DAY SUMMARY API ============
  app.get("/api/leagues/:id/signing-day", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      const teams = await storage.getTeamsByLeague(league.id);
      const recruits = await storage.getRecruitsByLeague(league.id);
      const signedRecruits = recruits.filter(r => r.signedTeamId);
      const unsignedRecruits = recruits.filter(r => !r.signedTeamId);
      
      // Get transfer portal activity from player history
      const history = await storage.getPlayerHistoryByLeague(league.id);
      const portalDepartures = history.filter(h => 
        h.departureType === "transfer_portal" && h.departedSeason === league.currentSeason
      );
      
      // Get current transfer portal players (still unsigned)
      const portalPlayers = await storage.getTransferPortalPlayersByLeague(league.id);
      
      // Group signed recruits by team
      const teamSignings = teams.map(team => {
        const teamRecruits = signedRecruits
          .filter(r => r.signedTeamId === team.id)
          .map(r => ({
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            position: r.position,
            starRating: r.starRating,
            overall: r.overall,
            homeState: r.homeState,
            isBlueChip: r.isBlueChip,
          }));
        
        return {
          teamId: team.id,
          teamName: team.name,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          mascot: team.mascot,
          recruits: teamRecruits,
          totalRecruits: teamRecruits.length,
          avgRating: teamRecruits.length > 0 
            ? Math.round(teamRecruits.reduce((sum, r) => sum + (r.starRating || 3), 0) / teamRecruits.length * 10) / 10
            : 0,
          totalStars: teamRecruits.reduce((sum, r) => sum + (r.starRating || 3), 0),
        };
      })
      .filter(t => t.totalRecruits > 0)
      .sort((a, b) => b.totalStars - a.totalStars);
      
      res.json({
        teamSignings,
        totalSigned: signedRecruits.length,
        totalUnsigned: unsignedRecruits.length,
        totalRecruits: recruits.length,
        transferPortal: {
          departed: portalDepartures.length,
          stillAvailable: portalPlayers.length,
        },
      });
    } catch (error) {
      console.error("Failed to get signing day data:", error);
      res.status(500).json({ message: "Failed to get signing day data" });
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

  // ============ WALK-ON MANAGEMENT ENDPOINTS ============
  app.get("/api/leagues/:id/walkons", requireAuth, async (req, res) => {
    try {
      const walkons = await storage.getWalkonsByLeague(req.params.id);
      res.json(walkons);
    } catch (error) {
      res.status(500).json({ message: "Failed to get walk-on pool" });
    }
  });

  // GET team's bids + NIL summary for the walk-on bid page
  app.get("/api/leagues/:id/walkons/bids", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.json({ bids: {}, nilBudget: 0, nilSpent: 0, committedBids: 0 });
      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.json({ bids: {}, nilBudget: 0, nilSpent: 0, committedBids: 0 });
      const teamBids = await storage.getWalkonBidsByTeam(leagueId, team.id);
      const bids: Record<string, number> = {};
      let committedBids = 0;
      for (const b of teamBids) {
        bids[b.walkonPoolId] = b.bidAmount;
        committedBids += b.bidAmount;
      }
      res.json({
        bids,
        nilBudget: team.nilBudget,
        nilSpent: team.nilSpent,
        committedBids,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get bid data" });
    }
  });

  // GET post-auction results for the requesting team.
  // Reads from league.lastWalkonAuction (persisted before walkons are deleted)
  // so all coaches can see their won/lost summary after the phase advances.
  // Returns { results: [] } when no auction has been resolved this season.
  app.get("/api/leagues/:id/walkons/auction-results", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.json({ results: [] });

      if (!league.lastWalkonAuction) return res.json({ results: [] });

      let allTeamResults: Record<string, unknown[]>;
      try {
        allTeamResults = JSON.parse(league.lastWalkonAuction);
      } catch {
        return res.json({ results: [] });
      }

      const teamResults = (allTeamResults[userCoach.teamId] as unknown[]) || [];
      res.json({ results: teamResults });
    } catch (error) {
      res.status(500).json({ message: "Failed to get auction results" });
    }
  });

  // POST blind bid on a walk-on (upsert — teams can change their bid before ready-up)
  app.post("/api/leagues/:id/walkons/:walkonId/bid", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, walkonId } = req.params;
      const league = await storage.getLeague(leagueId);
      if (!league || league.currentPhase !== "offseason_walkons") {
        return res.status(400).json({ message: "Not in walk-on phase" });
      }

      const bidSchema = z.object({ bidAmount: z.number().int().min(1) });
      const parsed = bidSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "bidAmount must be a positive integer" });
      const { bidAmount } = parsed.data;

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.status(403).json({ message: "No team found" });
      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });

      if (team.walkonReady) {
        return res.status(400).json({ message: "Unmark ready before changing bids" });
      }

      // Roster-slot cap: max active bids ≤ open roster slots.
      // Active roster excludes players with departureType set (draft-declared seniors,
      // transfers, etc.) since those slots will be vacated before the new season.
      // This ensures the highest bidder can always honor their win — no
      // cap-based reassignment is needed at auction resolution time.
      const allRoster = await storage.getPlayersByTeam(team.id);
      const activeRoster = allRoster.filter(p => !p.departureType);
      const MAX_WALKON_BID_ROSTER = 25;
      const openSlots = MAX_WALKON_BID_ROSTER - activeRoster.length;
      if (openSlots <= 0) {
        return res.status(400).json({
          message: `Roster is full (${activeRoster.length}/${MAX_WALKON_BID_ROSTER} active players). Cut a player before bidding.`
        });
      }
      // Count current active bids (excluding any existing bid on this walk-on, which will be replaced)
      const allExistingBids = await storage.getWalkonBidsByTeam(leagueId, team.id);
      const activeBidsExcludingThis = allExistingBids.filter(b => b.walkonPoolId !== walkonId).length;
      if (activeBidsExcludingThis >= openSlots) {
        return res.status(400).json({
          message: `Cannot place more bids than open roster slots. You have ${openSlots} open slot${openSlots !== 1 ? "s" : ""} and ${activeBidsExcludingThis} other active bid${activeBidsExcludingThis !== 1 ? "s" : ""}. Cut a player or remove a bid first.`
        });
      }

      const walkons = await storage.getWalkonsByLeague(leagueId);
      const walkon = walkons.find(w => w.id === walkonId);
      if (!walkon) return res.status(404).json({ message: "Walk-on not found" });
      if (walkon.awardedTeamId) return res.status(400).json({ message: "Auction already resolved" });

      // Validate bid against available NIL (nilBudget - nilSpent - other committed bids)
      const existingBids = await storage.getWalkonBidsByTeam(leagueId, team.id);
      const committedOther = existingBids.reduce((s, b) => b.walkonPoolId === walkonId ? s : s + b.bidAmount, 0);
      const available = (team.nilBudget - team.nilSpent) - committedOther;
      if (bidAmount > available) {
        return res.status(400).json({ message: `Bid exceeds available NIL. Available: $${available.toLocaleString()}` });
      }

      const bid = await storage.upsertWalkonBid(leagueId, walkonId, team.id, bidAmount);
      res.json(bid);
    } catch (error) {
      console.error("Bid error:", error);
      res.status(500).json({ message: "Failed to place bid" });
    }
  });

  // DELETE — withdraw a bid on a walk-on
  app.delete("/api/leagues/:id/walkons/:walkonId/bid", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, walkonId } = req.params;
      const league = await storage.getLeague(leagueId);
      if (!league || league.currentPhase !== "offseason_walkons") {
        return res.status(400).json({ message: "Not in walk-on phase" });
      }
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.status(403).json({ message: "No team found" });
      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });
      if (team.walkonReady) {
        return res.status(400).json({ message: "Unmark ready before changing bids" });
      }
      await storage.deleteWalkonBid(walkonId, team.id);
      res.json({ message: "Bid withdrawn" });
    } catch (error) {
      res.status(500).json({ message: "Failed to withdraw bid" });
    }
  });

  app.post("/api/leagues/:id/walkons/cut/:playerId", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, playerId } = req.params;
      const league = await storage.getLeague(leagueId);
      if (!league || league.currentPhase !== "offseason_walkons") {
        return res.status(400).json({ message: "Not in walk-on phase" });
      }
      
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) {
        return res.status(403).json({ message: "No team found" });
      }
      
      const player = await storage.getPlayer(playerId);
      if (!player || player.teamId !== userCoach.teamId) {
        return res.status(403).json({ message: "Not your player" });
      }
      
      const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };
      await storage.createPlayerHistory({
        leagueId,
        teamId: userCoach.teamId,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        finalEligibility: player.eligibility,
        overall: player.overall,
        starRating: player.starRating,
        signingOvr: player.signingOvr ?? player.overall,
        ovrDelta: (player.progressionDeltas as any)?.overall ?? null,
        departureType: "cut_juco",
        departedSeason: league.currentSeason,
        seasonsPlayed: eligMap[player.eligibility] || 1,
        abilities: player.abilities || [],
        homeState: player.homeState,
        hometown: player.hometown,
        sourcePlayerId: player.id,
      });
      
      await storage.deletePlayer(playerId);

      try {
        const teamForEvent = await storage.getTeam(userCoach.teamId);
        await storage.createLeagueEvent({
          leagueId,
          teamId: userCoach.teamId,
          teamName: teamForEvent?.name,
          teamAbbreviation: teamForEvent?.abbreviation,
          eventType: "ROSTER_CUT",
          description: `${teamForEvent?.name || "A team"} cut ${player.firstName} ${player.lastName} (${player.position}) — sent to JUCO`,
          season: league.currentSeason,
          week: league.currentWeek,
        });
      } catch (e) { console.error("League event error:", e); }

      res.json({ message: "Player cut and sent to JUCO" });
    } catch (error) {
      res.status(500).json({ message: "Failed to cut player" });
    }
  });

  app.post("/api/leagues/:id/walkons/ready", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league || league.currentPhase !== "offseason_walkons") {
        return res.status(400).json({ message: "Not in walk-on phase" });
      }
      
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) {
        return res.status(403).json({ message: "No team found" });
      }
      
      const team = await storage.getTeam(userCoach.teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });
      
      const updated = await storage.updateTeam(team.id, { walkonReady: !team.walkonReady });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle ready status" });
    }
  });

  app.get("/api/leagues/:id/walkons/readiness", requireAuth, async (req, res) => {
    try {
      const teams = await storage.getTeamsByLeague(req.params.id);
      const readiness = teams.map(t => ({
        teamId: t.id,
        teamName: t.name,
        isCpu: t.isCpu,
        walkonReady: t.walkonReady,
        abbreviation: t.abbreviation,
      }));
      res.json(readiness);
    } catch (error) {
      res.status(500).json({ message: "Failed to get readiness" });
    }
  });

  // ============ POSTSEASON DATA ENDPOINT ============
  app.get("/api/leagues/:id/postseason", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      
      const allGames = await storage.getGamesByLeague(leagueId);
      let season = Number(req.query.season) || league.currentSeason;
      
      const leagueTeams  = await storage.getTeamsByLeague(leagueId);
      const conferences  = await storage.getConferencesByLeague(leagueId);
      const confMap      = Object.fromEntries(conferences.map(c => [c.id, c.name]));
      const teamMap      = Object.fromEntries(leagueTeams.map(t => [t.id, {
        name: t.name, abbreviation: t.abbreviation,
        primaryColor: t.primaryColor, secondaryColor: t.secondaryColor,
        conferenceId: t.conferenceId, conferenceName: t.conferenceId ? confMap[t.conferenceId] ?? "" : "",
      }]));
      
      let confChampGames = allGames.filter(g => g.phase === "conference_championship" && g.season === season);
      let srGames        = allGames.filter(g => g.phase === "super_regionals"          && g.season === season);
      let cwsGames       = allGames.filter(g => g.phase === "cws"                      && g.season === season);
      
      const activePostseasonPhases = ["conference_championship", "super_regionals", "cws"];
      if (confChampGames.length === 0 && srGames.length === 0 && cwsGames.length === 0
          && season > 1 && !req.query.season && !activePostseasonPhases.includes(league.currentPhase)) {
        season = league.currentSeason - 1;
        confChampGames = allGames.filter(g => g.phase === "conference_championship" && g.season === season);
        srGames        = allGames.filter(g => g.phase === "super_regionals"          && g.season === season);
        cwsGames       = allGames.filter(g => g.phase === "cws"                      && g.season === season);
      }
      
      const standingsList = await storage.getStandingsByLeague(leagueId, season);

      // Identify conf champions for accurate seeding
      const completedConfChamps = confChampGames.filter(g => g.isComplete);
      const confChampionIds     = new Set(completedConfChamps.map(g => getGameWinner(g)));

      // Canonical seeded list (conf champs first, then at-large by win%)
      const seededList = buildSeededTeams(leagueTeams, standingsList, confChampionIds);
      const seededIds  = seededList.map(t => t.team.id);

      const enrichGame = (g: any) => ({
        ...g,
        homeTeam: teamMap[g.homeTeamId],
        awayTeam: teamMap[g.awayTeamId],
        homeSeed: seededIds.indexOf(g.homeTeamId) + 1,
        awaySeed: seededIds.indexOf(g.awayTeamId) + 1,
      });
      
      const enrichedSR = srGames.map(enrichGame).sort((a: any, b: any) => {
        if (a.bracketSide !== b.bracketSide) return (a.bracketSide || "A") < (b.bracketSide || "B") ? -1 : 1;
        if (a.bracketRound !== b.bracketRound) return (a.bracketRound || 0) - (b.bracketRound || 0);
        return 0;
      });

      // Seeding table for the hub page sidebar
      const seedsTable = seededList.map((t, idx) => {
        const s = standingsList.find(st => st.teamId === t.team.id);
        return {
          seed: idx + 1,
          teamId:         t.team.id,
          name:           (t.team as any).name,
          abbreviation:   (t.team as any).abbreviation,
          primaryColor:   (t.team as any).primaryColor,
          secondaryColor: (t.team as any).secondaryColor,
          wins:    s?.wins    || 0,
          losses:  s?.losses  || 0,
          isConfChamp: confChampionIds.has(t.team.id),
          conferenceName: (t.team as any).conferenceId ? confMap[(t.team as any).conferenceId] ?? "" : "",
        };
      });

      // Conf standings per conference for the hub page CC section
      const confStandings = conferences.map(conf => {
        const confTeams = leagueTeams.filter(t => t.conferenceId === conf.id);
        const rows = confTeams.map(t => {
          const s = standingsList.find(st => st.teamId === t.id);
          return {
            teamId:       t.id,
            name:         t.name,
            abbreviation: t.abbreviation,
            primaryColor: t.primaryColor,
            confWins:     s?.conferenceWins  || 0,
            confLosses:   s?.conferenceLosses || 0,
            wins:         s?.wins   || 0,
            losses:       s?.losses || 0,
          };
        }).sort((a, b) => b.confWins - a.confWins || b.wins - a.wins);
        return { id: conf.id, name: conf.name, teams: rows };
      });

      // ── Postseason stats leaders (top-5 batters by AVG, top-5 pitchers by ERA) ──
      const postseasonGames = [...confChampGames, ...srGames, ...cwsGames].filter(g => g.isComplete && g.boxScore);

      const psBatters = new Map<string, { name: string; teamId: string; ab: number; h: number; hr: number; rbi: number; bb: number; hbp: number; so: number }>();
      const psPitchers = new Map<string, { name: string; teamId: string; ip: number; er: number; so: number; bb: number; wins: number; losses: number }>();

      for (const game of postseasonGames) {
        let box: any;
        try { box = JSON.parse(game.boxScore!); } catch { continue; }
        if (!box.home || !box.away) continue;
        const sides = [
          { data: box.home, teamId: game.homeTeamId },
          { data: box.away, teamId: game.awayTeamId },
        ];
        for (const side of sides) {
          if (side.data.batting) {
            for (const b of side.data.batting) {
              const k = `${b.name}_${side.teamId}`;
              if (!psBatters.has(k)) psBatters.set(k, { name: b.name, teamId: side.teamId, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0 });
              const e = psBatters.get(k)!;
              e.ab += b.ab || 0; e.h += b.h || 0; e.hr += b.hr || 0; e.rbi += b.rbi || 0;
              e.bb += b.bb || 0; e.hbp += b.hbp || 0; e.so += b.so || 0;
            }
          }
          if (side.data.pitching) {
            for (const p of side.data.pitching) {
              const k = `${p.name}_${side.teamId}`;
              if (!psPitchers.has(k)) psPitchers.set(k, { name: p.name, teamId: side.teamId, ip: 0, er: 0, so: 0, bb: 0, wins: 0, losses: 0 });
              const e = psPitchers.get(k)!;
              const ipParts = String(p.ip).split(".");
              e.ip += (parseInt(ipParts[0]) || 0) + (parseInt(ipParts[1]) || 0) / 3;
              e.er += p.er || 0; e.so += p.so || 0; e.bb += p.bb || 0;
            }
            if (side.data.pitching.length > 0) {
              const starter = side.data.pitching[0];
              const k = `${starter.name}_${side.teamId}`;
              const e = psPitchers.get(k);
              if (e) {
                const isHome = side.teamId === game.homeTeamId;
                const teamScore = isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
                const oppScore  = isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
                if (teamScore > oppScore) e.wins++; else e.losses++;
              }
            }
          }
        }
      }

      const topBatters = Array.from(psBatters.values())
        .filter(b => b.ab >= 3)
        .map(b => ({
          name: b.name,
          teamName: teamMap[b.teamId]?.name || "",
          teamAbbr: teamMap[b.teamId]?.abbreviation || "",
          ab: b.ab, h: b.h, hr: b.hr, rbi: b.rbi,
          avg: b.ab > 0 ? (b.h / b.ab).toFixed(3) : ".000",
          obp: (b.ab + b.bb + b.hbp) > 0 ? ((b.h + b.bb + b.hbp) / (b.ab + b.bb + b.hbp)).toFixed(3) : ".000",
        }))
        .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg))
        .slice(0, 5);

      const topPitchers = Array.from(psPitchers.values())
        .filter(p => p.ip >= 1)
        .map(p => ({
          name: p.name,
          teamName: teamMap[p.teamId]?.name || "",
          teamAbbr: teamMap[p.teamId]?.abbreviation || "",
          ip: parseFloat(p.ip.toFixed(1)), so: p.so, bb: p.bb, wins: p.wins, losses: p.losses,
          era: p.ip > 0 ? ((p.er / p.ip) * 9).toFixed(2) : "0.00",
          whip: p.ip > 0 ? ((p.bb + (p.bb * 0)) / p.ip).toFixed(2) : "0.00",
        }))
        .sort((a, b) => parseFloat(a.era) - parseFloat(b.era))
        .slice(0, 5);

      res.json({
        phase: league.currentPhase,
        season,
        conferenceChampionships: confChampGames.map(enrichGame),
        superRegionals: enrichedSR,
        cws: cwsGames.map(enrichGame),
        seeds: seedsTable,
        confStandings,
        stats: { topBatters, topPitchers },
      });
    } catch (error) {
      console.error("Failed to fetch postseason data:", error);
      res.status(500).json({ message: "Failed to fetch postseason data" });
    }
  });

  app.get("/api/leagues/:id/recruiting/pipeline", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      
      const allCoaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = allCoaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.status(403).json({ message: "No team found" });
      
      const teamId = userCoach.teamId;
      const team = await storage.getTeam(teamId);
      const teamState = team?.state || "";
      const interests = await storage.getRecruitingInterestsByTeam(teamId);
      const allRecruits = await storage.getRecruitsByLeague(leagueId);
      const roster = await storage.getPlayersByTeam(teamId);

      const adjacentStates: Record<string, string[]> = {
        "AL": ["FL","GA","MS","TN"],
        "AK": [],
        "AZ": ["CA","CO","NM","NV","UT"],
        "AR": ["LA","MO","MS","OK","TN","TX"],
        "CA": ["AZ","NV","OR"],
        "CO": ["AZ","KS","NE","NM","OK","UT","WY"],
        "CT": ["MA","NY","RI"],
        "DE": ["MD","NJ","PA"],
        "FL": ["AL","GA"],
        "GA": ["AL","FL","NC","SC","TN"],
        "HI": [],
        "ID": ["MT","NV","OR","UT","WA","WY"],
        "IL": ["IA","IN","KY","MO","WI"],
        "IN": ["IL","KY","MI","OH"],
        "IA": ["IL","MN","MO","NE","SD","WI"],
        "KS": ["CO","MO","NE","OK"],
        "KY": ["IL","IN","MO","OH","TN","VA","WV"],
        "LA": ["AR","MS","TX"],
        "ME": ["NH"],
        "MD": ["DE","PA","VA","WV","DC"],
        "MA": ["CT","NH","NY","RI","VT"],
        "MI": ["IN","OH","WI"],
        "MN": ["IA","ND","SD","WI"],
        "MS": ["AL","AR","LA","TN"],
        "MO": ["AR","IA","IL","KS","KY","NE","OK","TN"],
        "MT": ["ID","ND","SD","WY"],
        "NE": ["CO","IA","KS","MO","SD","WY"],
        "NV": ["AZ","CA","ID","OR","UT"],
        "NH": ["MA","ME","VT"],
        "NJ": ["DE","NY","PA"],
        "NM": ["AZ","CO","OK","TX","UT"],
        "NY": ["CT","MA","NJ","PA","VT"],
        "NC": ["GA","SC","TN","VA"],
        "ND": ["MN","MT","SD"],
        "OH": ["IN","KY","MI","PA","WV"],
        "OK": ["AR","CO","KS","MO","NM","TX"],
        "OR": ["CA","ID","NV","WA"],
        "PA": ["DE","MD","NJ","NY","OH","WV"],
        "RI": ["CT","MA"],
        "SC": ["GA","NC"],
        "SD": ["IA","MN","MT","ND","NE","WY"],
        "TN": ["AL","AR","GA","KY","MO","MS","NC","VA"],
        "TX": ["AR","LA","NM","OK"],
        "UT": ["AZ","CO","ID","NM","NV","WY"],
        "VT": ["MA","NH","NY"],
        "VA": ["KY","MD","NC","TN","WV","DC"],
        "WA": ["ID","OR"],
        "WV": ["KY","MD","OH","PA","VA"],
        "WI": ["IA","IL","MI","MN"],
        "WY": ["CO","ID","MT","NE","SD","UT"],
        "DC": ["MD","VA"],
      };

      const neighborStates = new Set(adjacentStates[teamState] || []);
      
      const interestMap = new Map<string, number>();
      for (const interest of interests) {
        interestMap.set(interest.recruitId, interest.interestLevel);
      }

      const topSchoolEntries = await storage.getTopSchoolsByTeam(teamId);
      const topSchoolInterestMap = new Map<string, number>();
      for (const ts of topSchoolEntries) {
        const combined = ts.interestLevel + (ts.accumulatedInterest || 0);
        topSchoolInterestMap.set(ts.recruitId, combined);
      }

      const pipeline = { cold: 0, cool: 0, warm: 0, hot: 0, very_hot: 0, on_fire: 0, committed: 0, home_state: 0, home_region: 0 };
      const committed = allRecruits.filter(r => r.signedTeamId === teamId);
      pipeline.committed = committed.length;

      for (const recruit of allRecruits) {
        if (recruit.signedTeamId) continue;
        const riLevel = interestMap.get(recruit.id) ?? 0;
        const tsLevel = topSchoolInterestMap.get(recruit.id) ?? 0;
        const level = Math.max(riLevel, tsLevel);
        if (level >= 90) pipeline.on_fire++;
        else if (level >= 70) pipeline.very_hot++;
        else if (level >= 50) pipeline.hot++;
        else if (level >= 30) pipeline.warm++;
        else if (level >= 15) pipeline.cool++;
        else if (level >= 1) pipeline.cold++;

        if (recruit.homeState === teamState) pipeline.home_state++;
        else if (neighborStates.has(recruit.homeState)) pipeline.home_region++;
      }
      
      const seniors = roster.filter(p => p.eligibility === "SR");
      const positionCounts: Record<string, number> = {};
      const seniorPositions: Record<string, number> = {};
      for (const p of roster) {
        positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
      }
      for (const s of seniors) {
        seniorPositions[s.position] = (seniorPositions[s.position] || 0) + 1;
      }
      
      const positionNeeds: { position: string; current: number; graduating: number; need: boolean }[] = [];
      const allPositions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
      for (const pos of allPositions) {
        const current = positionCounts[pos] || 0;
        const graduating = seniorPositions[pos] || 0;
        const afterGrad = current - graduating;
        positionNeeds.push({ position: pos, current, graduating, need: afterGrad < 2 });
      }
      
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      res.json({ pipeline, positionNeeds, totalTargeted: interests.filter(i => i.isTargeted).length, rosterSize: roster.length, teamState, totalClassSize: allRecruits.length, teamCount: leagueTeams.length });
    } catch (error) {
      console.error("Failed to fetch pipeline:", error);
      res.status(500).json({ message: "Failed to fetch pipeline data" });
    }
  });

  app.get("/api/leagues/:id/recruiting/trends", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      
      const allCoaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = allCoaches.find(c => c.userId === req.session.userId);
      if (!userCoach || !userCoach.teamId) return res.status(403).json({ message: "No team found" });
      
      const teamId = userCoach.teamId;
      const interests = await storage.getRecruitingInterestsByTeam(teamId);
      
      const trends: Record<string, { trend: "up" | "down" | "flat"; recentGain: number }> = {};
      
      for (const interest of interests) {
        const actions = await storage.getRecruitingActionsLog(interest.recruitId, teamId);
        const recentActions = actions.filter(a => {
          const weekDiff = league.currentWeek - a.week;
          return a.season === league.currentSeason && weekDiff >= 0 && weekDiff <= 2;
        });
        
        const totalGain = recentActions.reduce((sum, a) => sum + (a.interestChange || 0), 0);
        let trend: "up" | "down" | "flat" = "flat";
        if (totalGain > 5) trend = "up";
        else if (totalGain < -5) trend = "down";
        
        trends[interest.recruitId] = { trend, recentGain: totalGain };
      }
      
      res.json({ trends });
    } catch (error) {
      console.error("Failed to fetch trends:", error);
      res.status(500).json({ message: "Failed to fetch trend data" });
    }
  });

  app.get("/api/leagues/:id/season-awards", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const preRegularPhases = ["dynasty_setup", "recruiting", "preseason", "spring_training", "regular_season"];
      const awardsAvailable = !preRegularPhases.includes(league.currentPhase);

      if (!awardsAvailable) {
        return res.json({
          season: league.currentSeason,
          awardsAvailable: false,
          currentPhase: league.currentPhase,
        });
      }
      
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const confs = await storage.getConferencesByLeague(leagueId);
      const teamMap = Object.fromEntries(leagueTeams.map(t => [t.id, t]));
      
      const allPlayers: { player: any; team: any }[] = [];
      for (const team of leagueTeams) {
        const roster = await storage.getPlayersByTeam(team.id);
        for (const p of roster) {
          allPlayers.push({ player: p, team });
        }
      }

      const seasonStatsRows = await storage.getPlayerSeasonStatsBySeason(leagueId, league.currentSeason);
      const seasonStatsMap: Record<string, any> = {};
      for (const s of seasonStatsRows) {
        const avg = s.ab > 0 ? (s.h / s.ab).toFixed(3).replace(/^0/, "") : null;
        const era = s.ipOuts > 0 ? ((s.pEr * 27) / s.ipOuts).toFixed(2) : null;
        seasonStatsMap[s.playerId] = { avg, hr: s.hr, rbi: s.rbi, era, strikeouts: s.pSo };
      }
      
      const nonPitchers = allPlayers.filter(x => x.player.position !== "P").sort((a, b) => b.player.overall - a.player.overall);
      const pitchers = allPlayers.filter(x => x.player.position === "P").sort((a, b) => b.player.overall - a.player.overall);
      const freshmen = allPlayers.filter(x => x.player.eligibility === "FR").sort((a, b) => b.player.overall - a.player.overall);
      
      const formatAward = (x: { player: any; team: any } | undefined) => {
        if (!x) return null;
        const stats = seasonStatsMap[x.player.id] ?? null;
        const isPitcher = x.player.position === "P";
        return {
          playerName: `${x.player.firstName} ${x.player.lastName}`,
          position: x.player.position,
          overall: x.player.overall,
          eligibility: x.player.eligibility,
          teamName: x.team.name,
          abbreviation: x.team.abbreviation,
          primaryColor: x.team.primaryColor,
          avg: !isPitcher ? (stats?.avg ?? null) : null,
          hr: !isPitcher ? (stats?.hr ?? null) : null,
          rbi: !isPitcher ? (stats?.rbi ?? null) : null,
          era: isPitcher ? (stats?.era ?? null) : null,
          strikeouts: isPitcher ? (stats?.strikeouts ?? null) : null,
        };
      };

      // Positional slots: 3 OF, 3 SP, 1 R (reliever), 1 CL (closer)
      const fieldingSlots = ["C", "1B", "2B", "SS", "3B", "OF", "OF", "OF"];
      const pitcherSlots = ["SP", "SP", "SP", "R", "CL"];
      const allSlots = [...fieldingSlots, ...pitcherSlots, "DH"];

      const buildPositionTeam = (pool: { player: any; team: any }[]) => {
        const result: { position: string; player: any }[] = [];
        const used = new Set<string>();
        const pitcherPool = pool.filter(x => x.player.position === "P").sort((a, b) => b.player.overall - a.player.overall);
        let pitcherIdx = 0;

        for (const slot of allSlots) {
          const isPitcherSlot = slot === "SP" || slot === "R" || slot === "CL";
          const isDH = slot === "DH";

          if (isPitcherSlot) {
            while (pitcherIdx < pitcherPool.length && used.has(pitcherPool[pitcherIdx].player.id)) pitcherIdx++;
            if (pitcherIdx < pitcherPool.length) {
              used.add(pitcherPool[pitcherIdx].player.id);
              result.push({ position: slot, player: formatAward(pitcherPool[pitcherIdx]) });
              pitcherIdx++;
            }
          } else if (isDH) {
            const dhCandidates = pool
              .filter(x => x.player.position !== "P" && !used.has(x.player.id))
              .sort((a, b) => b.player.overall - a.player.overall);
            if (dhCandidates.length > 0) {
              used.add(dhCandidates[0].player.id);
              result.push({ position: "DH", player: formatAward(dhCandidates[0]) });
            }
          } else {
            const candidates = pool
              .filter(x => x.player.position === slot && !used.has(x.player.id))
              .sort((a, b) => b.player.overall - a.player.overall);
            if (candidates.length > 0) {
              used.add(candidates[0].player.id);
              result.push({ position: slot, player: formatAward(candidates[0]) });
            }
          }
        }
        return result;
      };

      const allAmericanTeam = buildPositionTeam(allPlayers);

      const allFreshmanTeam = buildPositionTeam(freshmen.map(x => x));

      const allGames = await storage.getGamesByLeague(leagueId);
      const season = league.currentSeason;

      const ccGames = allGames.filter(g => g.phase === "conference_championship" && g.season === season && g.isComplete);
      const conferenceChampionshipMVPs: { conferenceName: string; mvp: any }[] = [];
      const seenConfIds = new Set<string>();
      for (const game of ccGames) {
        const winnerId = (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.homeTeamId : game.awayTeamId;
        const winningTeam = teamMap[winnerId];
        if (winningTeam && !seenConfIds.has(winningTeam.conferenceId)) {
          seenConfIds.add(winningTeam.conferenceId);
          const conf = confs.find(c => c.id === winningTeam.conferenceId);
          const teamPlayers = allPlayers.filter(x => x.player.teamId === winnerId);
          const bestPlayer = teamPlayers.sort((a, b) => b.player.overall - a.player.overall)[0];
          if (bestPlayer && conf) {
            conferenceChampionshipMVPs.push({
              conferenceName: conf.name,
              mvp: formatAward(bestPlayer),
            });
          }
        }
      }

      let cwsMVP = null;
      const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season && g.isComplete);
      if (cwsGames.length > 0) {
        const teamWins: Record<string, number> = {};
        for (const g of cwsGames) {
          const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
          teamWins[winnerId] = (teamWins[winnerId] || 0) + 1;
        }
        const cwsChampId = Object.entries(teamWins).find(([_, w]) => w >= 2)?.[0]
          || Object.entries(teamWins).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (cwsChampId) {
          const champPlayers = allPlayers.filter(x => x.player.teamId === cwsChampId);
          const bestChampPlayer = champPlayers.sort((a, b) => b.player.overall - a.player.overall)[0];
          cwsMVP = formatAward(bestChampPlayer);
        }
      }

      const conferenceAwards = confs.length > 1 ? confs.map(conf => {
        const confTeamIds = leagueTeams.filter(t => t.conferenceId === conf.id).map(t => t.id);
        const confPlayers = allPlayers.filter(x => confTeamIds.includes(x.player.teamId));
        const confNonP = confPlayers.filter(x => x.player.position !== "P").sort((a, b) => b.player.overall - a.player.overall);
        const confP = confPlayers.filter(x => x.player.position === "P").sort((a, b) => b.player.overall - a.player.overall);
        const allConferenceTeam = buildPositionTeam(confPlayers);
        return {
          conferenceName: conf.name,
          mvp: formatAward(confNonP[0]),
          pitcherOfYear: formatAward(confP[0]),
          allConferenceTeam,
        };
      }) : [];
      
      // Recruiter of the Year — top recruiting score this season
      let recruiterOfYear: { coachName: string; teamName: string; teamAbbr: string; primaryColor: string | null; recruitingScore: number; recruitingGrade: string } | null = null;
      try {
        const allCoachHistory = await storage.getCoachSeasonHistoryByLeague(leagueId);
        const allCoachesInLeague = await storage.getCoachesByLeague(leagueId);
        const coachMapForAward = Object.fromEntries(allCoachesInLeague.map(c => [c.id, c]));
        const thisSeasonScored = allCoachHistory
          .filter(h => h.season === season && h.recruitingScore != null)
          .sort((a, b) => (b.recruitingScore ?? 0) - (a.recruitingScore ?? 0));
        if (thisSeasonScored.length > 0) {
          const topH = thisSeasonScored[0];
          const topCoach = coachMapForAward[topH.coachId];
          const topTeam = topH.teamId ? teamMap[topH.teamId] : null;
          if (topCoach) {
            recruiterOfYear = {
              coachName: `${topCoach.firstName} ${topCoach.lastName}`,
              teamName: topH.teamName,
              teamAbbr: topH.teamAbbr,
              primaryColor: topTeam?.primaryColor ?? null,
              recruitingScore: topH.recruitingScore!,
              recruitingGrade: topH.recruitingGrade ?? "F",
            };
          }
        }
      } catch (royErr) {
        console.error("[season-awards] Failed to derive Recruiter of Year:", royErr);
      }

      res.json({
        season: league.currentSeason,
        awardsAvailable: true,
        leagueAwards: {
          mvp: formatAward(nonPitchers[0]),
          pitcherOfYear: formatAward(pitchers[0]),
          freshmanOfYear: formatAward(freshmen[0]),
        },
        recruiterOfYear,
        conferenceChampionshipMVPs,
        cwsMVP,
        allAmericanTeam,
        allFreshmanTeam,
        conferenceAwards,
        statsLeaders: {
          topHitters: nonPitchers.slice(0, 10).map(formatAward),
          topPitchers: pitchers.slice(0, 10).map(formatAward),
        },
      });
    } catch (error) {
      console.error("Failed to fetch season awards:", error);
      res.status(500).json({ message: "Failed to fetch season awards" });
    }
  });

  app.get("/api/leagues/:id/season-summary/:season", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const season = parseInt(req.params.season);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const userTeamId = userCoach?.teamId;

      const seasonStandings = await storage.getStandingsByLeague(leagueId, season);
      const teamMap = Object.fromEntries(leagueTeams.map(t => [t.id, t]));

      const userTeamStandings = userTeamId ? seasonStandings.find(s => s.teamId === userTeamId) : null;
      const userTeamData = userTeamId ? teamMap[userTeamId] : null;

      const userTeam = userTeamData && userTeamStandings ? {
        name: userTeamData.name,
        mascot: userTeamData.mascot,
        abbreviation: userTeamData.abbreviation,
        primaryColor: userTeamData.primaryColor,
        wins: userTeamStandings.wins ?? 0,
        losses: userTeamStandings.losses ?? 0,
        confWins: userTeamStandings.conferenceWins ?? 0,
        confLosses: userTeamStandings.conferenceLosses ?? 0,
        runsScored: userTeamStandings.runsScored ?? 0,
        runsAllowed: userTeamStandings.runsAllowed ?? 0,
      } : null;

      const standings = leagueTeams.map(t => {
        const s = seasonStandings.find(st => st.teamId === t.id);
        return {
          name: t.name, mascot: t.mascot, abbreviation: t.abbreviation, primaryColor: t.primaryColor,
          wins: s?.wins ?? 0, losses: s?.losses ?? 0,
        };
      }).sort((a, b) => b.wins - a.wins || a.losses - b.losses).slice(0, 10);

      const allGames = await storage.getGamesByLeague(leagueId);
      let cwsChampion = null;
      let cwsRunnerUp = null;
      const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season && g.isComplete);
      if (cwsGames.length > 0) {
        const teamWins: Record<string, number> = {};
        for (const g of cwsGames) {
          const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
          teamWins[winnerId] = (teamWins[winnerId] || 0) + 1;
        }
        const champId = Object.entries(teamWins).sort((a, b) => b[1] - a[1])[0]?.[0];
        const runnerId = Object.entries(teamWins).sort((a, b) => b[1] - a[1])[1]?.[0]
          || cwsGames.map(g => g.homeTeamId === champId ? g.awayTeamId : g.homeTeamId).find(id => id !== champId);
        const champTeam = champId ? teamMap[champId] : null;
        const runnerTeam = runnerId ? teamMap[runnerId] : null;
        cwsChampion = champTeam ? { name: champTeam.name, mascot: champTeam.mascot, abbreviation: champTeam.abbreviation, primaryColor: champTeam.primaryColor } : null;
        cwsRunnerUp = runnerTeam ? { name: runnerTeam.name, abbreviation: runnerTeam.abbreviation } : null;
      }

      const allPlayers: { player: any; team: any }[] = [];
      for (const team of leagueTeams) {
        const roster = await storage.getPlayersByTeam(team.id);
        for (const p of roster) {
          allPlayers.push({ player: p, team });
        }
      }

      const nonPitchers = allPlayers.filter(x => x.player.position !== "P").sort((a, b) => b.player.overall - a.player.overall);
      const pitchers = allPlayers.filter(x => x.player.position === "P").sort((a, b) => b.player.overall - a.player.overall);
      const freshmen = allPlayers.filter(x => x.player.eligibility === "FR").sort((a, b) => b.player.overall - a.player.overall);

      const formatAwardSummary = (x: { player: any; team: any } | undefined) => x ? {
        playerName: `${x.player.firstName} ${x.player.lastName}`,
        position: x.player.position,
        teamName: x.team.name,
        overall: x.player.overall,
      } : null;

      const awards = {
        mvp: formatAwardSummary(nonPitchers[0]),
        pitcherOfYear: formatAwardSummary(pitchers[0]),
        freshmanOfYear: formatAwardSummary(freshmen[0]),
      };

      const allHistory = await storage.getPlayerHistoryByLeague(leagueId);
      const seasonHistory = allHistory.filter(h => h.departedSeason === season);

      const leagueDraftPicks = seasonHistory
        .filter(h => h.draftRound != null)
        .sort((a, b) => (a.draftRound ?? 99) - (b.draftRound ?? 99))
        .map(h => ({
          playerName: `${h.firstName} ${h.lastName}`,
          position: h.position,
          teamName: teamMap[h.teamId]?.name ?? "Unknown",
          draftRound: h.draftRound!,
        }));

      const userHistory = userTeamId ? seasonHistory.filter(h => h.teamId === userTeamId) : [];
      const graduated = userHistory.filter(h => h.departureType === "graduated").length;
      const drafted = userHistory.filter(h => h.draftRound != null).length;
      const transferred = userHistory.filter(h => h.departureType === "transfer_portal" || h.departureType === "cut_juco").length;
      const userDraftPicks = userHistory
        .filter(h => h.draftRound != null)
        .sort((a, b) => (a.draftRound ?? 99) - (b.draftRound ?? 99))
        .map(h => ({
          playerName: `${h.firstName} ${h.lastName}`,
          position: h.position,
          draftRound: h.draftRound!,
        }));

      res.json({
        season,
        userTeam,
        standings,
        cwsChampion,
        cwsRunnerUp,
        awards,
        userDepartures: {
          graduated,
          drafted,
          transferred,
          draftPicks: userDraftPicks,
        },
        leagueDraftPicks,
      });
    } catch (error) {
      console.error("Failed to get season summary:", error);
      res.status(500).json({ message: "Failed to get season summary" });
    }
  });

  app.get("/api/leagues/:id/season-recap/:season", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const season = parseInt(req.params.season);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const allGames = await storage.getGamesByLeague(leagueId);
      const seasonStandings = await storage.getStandingsByLeague(leagueId, season);

      const teamsWithRecords = leagueTeams.map(t => {
        const s = seasonStandings.find(st => st.teamId === t.id);
        return {
          id: t.id, name: t.name, abbreviation: t.abbreviation,
          primaryColor: t.primaryColor, secondaryColor: t.secondaryColor,
          wins: s?.wins ?? 0, losses: s?.losses ?? 0,
          confWins: s?.conferenceWins ?? 0, confLosses: s?.conferenceLosses ?? 0,
          runsScored: s?.runsScored ?? 0, runsAllowed: s?.runsAllowed ?? 0,
        };
      }).sort((a, b) => b.wins - a.wins || a.losses - b.losses);

      let cwsChampion = null;
      let cwsRunnerUp = null;
      const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season && g.isComplete);
      if (cwsGames.length > 0) {
        const teamWins: Record<string, number> = {};
        for (const g of cwsGames) {
          const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
          teamWins[winnerId] = (teamWins[winnerId] || 0) + 1;
        }
        const champId = Object.entries(teamWins).sort((a, b) => b[1] - a[1])[0]?.[0];
        const runnerId = Object.entries(teamWins).sort((a, b) => b[1] - a[1])[1]?.[0]
          || cwsGames.map(g => g.homeTeamId === champId ? g.awayTeamId : g.homeTeamId).find(id => id !== champId);
        cwsChampion = leagueTeams.find(t => t.id === champId);
        cwsRunnerUp = leagueTeams.find(t => t.id === runnerId);
      }

      const totalGames = allGames.filter(g => g.season === season && g.isComplete).length;

      res.json({
        season,
        teams: teamsWithRecords.slice(0, 10),
        cwsChampion: cwsChampion ? { name: cwsChampion.name, abbreviation: cwsChampion.abbreviation, primaryColor: cwsChampion.primaryColor } : null,
        cwsRunnerUp: cwsRunnerUp ? { name: cwsRunnerUp.name, abbreviation: cwsRunnerUp.abbreviation } : null,
        totalGames,
        bestRecord: teamsWithRecords[0] ? `${teamsWithRecords[0].name} (${teamsWithRecords[0].wins}-${teamsWithRecords[0].losses})` : null,
      });
    } catch (error) {
      console.error("Failed to get season recap:", error);
      res.status(500).json({ message: "Failed to get season recap" });
    }
  });

  app.get("/api/leagues/:id/team-compare", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const teamAId = req.query.teamA as string;
      const teamBId = req.query.teamB as string;
      if (!teamAId || !teamBId) return res.status(400).json({ message: "Need teamA and teamB query params" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const teamA = leagueTeams.find(t => t.id === teamAId);
      const teamB = leagueTeams.find(t => t.id === teamBId);
      if (!teamA || !teamB) return res.status(404).json({ message: "Team not found" });

      const rosterA = await storage.getPlayersByTeam(teamAId);
      const rosterB = await storage.getPlayersByTeam(teamBId);

      const standingsAll = await storage.getStandingsByLeague(leagueId, league.currentSeason);
      const sA = standingsAll.find(s => s.teamId === teamAId);
      const sB = standingsAll.find(s => s.teamId === teamBId);

      const buildTeamData = (team: typeof teamA, roster: typeof rosterA, standings: typeof sA) => {
        const avgOverall = roster.length > 0 ? Math.round(roster.reduce((s, p) => s + p.overall, 0) / roster.length) : 0;
        const pitchers = roster.filter(p => p.position === "P");
        const hitters = roster.filter(p => p.position !== "P");
        const avgPitcher = pitchers.length > 0 ? Math.round(pitchers.reduce((s, p) => s + p.overall, 0) / pitchers.length) : 0;
        const avgHitter = hitters.length > 0 ? Math.round(hitters.reduce((s, p) => s + p.overall, 0) / hitters.length) : 0;

        const positionCounts: Record<string, number> = {};
        roster.forEach(p => { positionCounts[p.position] = (positionCounts[p.position] || 0) + 1; });

        const topPlayers = [...roster].sort((a, b) => b.overall - a.overall).slice(0, 5).map(p => ({
          name: `${p.firstName} ${p.lastName}`, position: p.position, overall: p.overall, year: p.year,
        }));

        return {
          id: team!.id, name: team!.name, mascot: team!.mascot, abbreviation: team!.abbreviation,
          primaryColor: team!.primaryColor, secondaryColor: team!.secondaryColor,
          prestige: team!.prestige, facilities: team!.facilities,
          wins: standings?.wins ?? 0, losses: standings?.losses ?? 0,
          confWins: standings?.conferenceWins ?? 0, confLosses: standings?.conferenceLosses ?? 0,
          runsScored: standings?.runsScored ?? 0, runsAllowed: standings?.runsAllowed ?? 0,
          rosterSize: roster.length, avgOverall, avgPitcher, avgHitter,
          positionCounts, topPlayers,
          freshmen: roster.filter(p => p.year === 1).length,
          sophomores: roster.filter(p => p.year === 2).length,
          juniors: roster.filter(p => p.year === 3).length,
          seniors: roster.filter(p => p.year === 4).length,
        };
      };

      res.json({
        teamA: buildTeamData(teamA, rosterA, sA),
        teamB: buildTeamData(teamB, rosterB, sB),
      });
    } catch (error) {
      console.error("Failed to compare teams:", error);
      res.status(500).json({ message: "Failed to compare teams" });
    }
  });

  app.get("/api/leagues/:id/dynasty-trends", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const teamId = req.query.teamId as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const targetTeam = teamId ? leagueTeams.find(t => t.id === teamId) : leagueTeams.find(t => !t.isCpu);
      if (!targetTeam) return res.status(404).json({ message: "Team not found" });

      const seasons: { season: number; wins: number; losses: number; runsScored: number; runsAllowed: number; avgOverall: number; rosterSize: number }[] = [];

      for (let s = 1; s <= league.currentSeason; s++) {
        const standings = await storage.getStandingsByLeague(leagueId, s);
        const teamStandings = standings.find(st => st.teamId === targetTeam.id);
        const roster = await storage.getPlayersByTeam(targetTeam.id);
        const avgOverall = roster.length > 0 ? Math.round(roster.reduce((sum, p) => sum + p.overall, 0) / roster.length) : 0;

        seasons.push({
          season: s,
          wins: teamStandings?.wins ?? 0,
          losses: teamStandings?.losses ?? 0,
          runsScored: teamStandings?.runsScored ?? 0,
          runsAllowed: teamStandings?.runsAllowed ?? 0,
          avgOverall,
          rosterSize: roster.length,
        });
      }

      res.json({
        teamName: targetTeam.name,
        teamAbbreviation: targetTeam.abbreviation,
        prestige: targetTeam.prestige,
        facilities: targetTeam.facilities,
        seasons,
      });
    } catch (error) {
      console.error("Failed to get dynasty trends:", error);
      res.status(500).json({ message: "Failed to get dynasty trends" });
    }
  });

  app.get("/api/leagues/:id/class-rankings", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const teamsMap = new Map(leagueTeams.map(t => [t.id, t]));

      const enrichSnap = (s: any) => ({
        ...s,
        teamName: teamsMap.get(s.teamId)?.name || "Unknown",
        teamAbbr: teamsMap.get(s.teamId)?.abbreviation || "???",
        teamColor: teamsMap.get(s.teamId)?.primaryColor || "#666",
        teamSecondaryColor: teamsMap.get(s.teamId)?.secondaryColor || "#333",
        isCpu: teamsMap.get(s.teamId)?.isCpu ?? true,
      });

      const seasonParam = req.query.season ? parseInt(req.query.season as string) : null;
      if (seasonParam !== null) {
        const snapshots = await storage.getRecruitingClassSnapshotsByLeague(req.params.id, seasonParam);
        return res.json({ season: seasonParam, snapshots: snapshots.map(enrichSnap) });
      }

      const allSnapshots = await storage.getRecruitingClassSnapshotsAllSeasons(req.params.id);
      const bySeason: Record<number, any[]> = {};
      for (const s of allSnapshots) {
        if (!bySeason[s.season]) bySeason[s.season] = [];
        bySeason[s.season].push(enrichSnap(s));
      }
      const availableSeasons = Object.keys(bySeason).map(Number).sort((a, b) => b - a);
      return res.json({ bySeason, availableSeasons });
    } catch (error) {
      console.error("Failed to fetch class rankings:", error);
      res.status(500).json({ message: "Failed to fetch class rankings" });
    }
  });

  // ─── NIL Season Earnings endpoint ────────────────────────────────────────────
  app.get("/api/leagues/:id/nil-earnings", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const season = req.query.season ? parseInt(req.query.season as string) : league.currentSeason;
      const teamId = req.query.teamId as string | undefined;

      const [leagueTeams, conferences] = await Promise.all([
        storage.getTeamsByLeague(leagueId),
        storage.getConferencesByLeague(leagueId),
      ]);
      const confById = new Map(conferences.map(c => [c.id, c]));
      const teamById = new Map(leagueTeams.map(t => [t.id, t]));

      if (teamId) {
        const earnings = await storage.getNilEarningsByTeam(leagueId, teamId, season);
        const team = teamById.get(teamId);
        const conf = team?.conferenceId ? confById.get(team.conferenceId) : undefined;

        // Build conference peer comparison
        const confPeers = conf
          ? leagueTeams.filter(t => t.conferenceId === conf.id)
          : [];
        const confBudgets = confPeers.map(t => t.nilBudget).sort((a, b) => b - a);
        const confRank = confBudgets.indexOf(team?.nilBudget ?? 0) + 1;
        const confAvg = confPeers.length > 0
          ? Math.round(confPeers.reduce((s, t) => s + t.nilBudget, 0) / confPeers.length)
          : 0;
        const confMax = confBudgets[0] ?? 0;

        return res.json({
          season,
          teamId,
          teamName: team?.name ?? "Unknown",
          teamAbbr: team?.abbreviation ?? "???",
          conferenceName: conf?.name ?? "Unknown",
          nilBudget: team?.nilBudget ?? 0,
          nilSpent: team?.nilSpent ?? 0,
          nilRemaining: (team?.nilBudget ?? 0) - (team?.nilSpent ?? 0),
          earnings: earnings.filter(e => e.category !== "prestige_baseline"),
          confPeer: {
            rank: confRank,
            total: confPeers.length,
            avg: confAvg,
            max: confMax,
          },
        });
      }

      // League-wide overview — all teams with their NIL data
      const allEarnings = await storage.getNilEarningsByLeague(leagueId, season);
      const earningsByTeam: Record<string, typeof allEarnings> = {};
      for (const e of allEarnings) {
        if (!earningsByTeam[e.teamId]) earningsByTeam[e.teamId] = [];
        if (e.category !== "prestige_baseline") earningsByTeam[e.teamId].push(e);
      }

      const overview = leagueTeams.map(t => {
        const conf = t.conferenceId ? confById.get(t.conferenceId) : undefined;
        const rows = earningsByTeam[t.id] ?? [];
        const baseRow = rows.find(r => r.category === "base");
        const bonusTotal = rows.filter(r => r.category !== "base").reduce((s, r) => s + r.amount, 0);
        return {
          teamId: t.id,
          teamName: t.name,
          teamAbbr: t.abbreviation,
          primaryColor: t.primaryColor,
          isCpu: t.isCpu,
          conferenceName: conf?.name ?? "Unknown",
          nilBudget: t.nilBudget,
          nilSpent: t.nilSpent,
          nilRemaining: t.nilBudget - (t.nilSpent ?? 0),
          baseAllocation: baseRow?.amount ?? 0,
          bonusTotal,
          earnings: rows,
        };
      }).sort((a, b) => b.nilBudget - a.nilBudget);

      return res.json({ season, overview });
    } catch (error) {
      console.error("Failed to fetch NIL earnings:", error);
      res.status(500).json({ message: "Failed to fetch NIL earnings" });
    }
  });

  app.get("/api/leagues/:id/signing-day-preview", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const [allRecruits, teams, storylineRows] = await Promise.all([
        storage.getRecruitsByLeague(req.params.id),
        storage.getTeamsByLeague(req.params.id),
        storage.getStorylineRecruitsByLeague(req.params.id, league.currentSeason),
      ]);
      const teamsMap = new Map(teams.map(t => [t.id, t]));
      const storylineRecruitIds = new Set(storylineRows.map(sl => sl.recruitId));

      const undecided = allRecruits.filter(r =>
        !r.signedTeamId && ["top3", "top5", "verbal"].includes(r.stage || "open")
      );

      const previewRecruits = await Promise.all(undecided.map(async (recruit) => {
        const interests = await storage.getRecruitingInterestsByRecruit(recruit.id);
        const topInterests = interests
          .filter(i => (i.interestLevel || 0) > 0)
          .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0))
          .slice(0, 2)
          .map(i => ({
            teamId: i.teamId,
            teamName: teamsMap.get(i.teamId)?.name || "Unknown",
            teamAbbr: teamsMap.get(i.teamId)?.abbreviation || "???",
            primaryColor: teamsMap.get(i.teamId)?.primaryColor || "#888",
            interestLevel: i.interestLevel || 0,
            hasOffer: i.hasOffer || false,
          }));
        const committingTo = topInterests.find(i => i.hasOffer) || topInterests[0] || null;
        return {
          id: recruit.id,
          firstName: recruit.firstName,
          lastName: recruit.lastName,
          position: recruit.position,
          starRating: recruit.starRating || 3,
          homeState: recruit.homeState,
          topSchools: topInterests,
          committingTo,
          isGenerationalGem: recruit.isGenerationalGem,
          isGenerationalBust: recruit.isGenerationalBust,
          isGem: recruit.isGem,
          isBust: recruit.isBust,
          isBlueChip: recruit.isBlueChip,
          isStoryline: storylineRecruitIds.has(recruit.id),
          recruitType: recruit.recruitType || "HS",
          fromTeamName: recruit.fromTeamName || null,
        };
      }));

      res.json({ recruits: previewRecruits.filter(r => r.topSchools.length > 0) });
    } catch (error) {
      console.error("Failed to fetch signing day preview:", error);
      res.status(500).json({ message: "Failed to fetch signing day preview" });
    }
  });

  app.get("/api/leagues/:id/dynasty-history", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      
      const [allGames, leagueTeams, allClassSnapshots, allCoachHistory, allCoaches] = await Promise.all([
        storage.getGamesByLeague(leagueId),
        storage.getTeamsByLeague(leagueId),
        storage.getRecruitingClassSnapshotsAllSeasons(leagueId),
        storage.getCoachSeasonHistoryByLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
      ]);
      const teamMap = Object.fromEntries(leagueTeams.map(t => [t.id, { name: t.name, abbreviation: t.abbreviation, primaryColor: t.primaryColor }]));
      const coachMap = Object.fromEntries(allCoaches.map(c => [c.id, c]));

      // Index class snapshots by season for O(1) lookup
      const classBySeasonTeam = new Map<string, number>();
      for (const snap of allClassSnapshots) {
        classBySeasonTeam.set(`${snap.season}_${snap.teamId}`, snap.classRank);
      }
      
      const seasons: any[] = [];
      
      for (let s = 1; s <= league.currentSeason; s++) {
        const seasonStandings = await storage.getStandingsByLeague(leagueId, s);
        const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === s && g.isComplete);
        
        let cwsChampion = null;
        let cwsRunnerUp = null;
        
        if (cwsGames.length >= 2) {
          const winsMap: Record<string, number> = {};
          for (const g of cwsGames) {
            const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
            winsMap[winnerId] = (winsMap[winnerId] || 0) + 1;
          }
          const champId = Object.entries(winsMap).find(([_, w]) => w >= 2)?.[0];
          if (champId) {
            cwsChampion = teamMap[champId] || null;
            const otherIds = Object.keys(winsMap).filter(id => id !== champId);
            cwsRunnerUp = otherIds.length > 0 ? teamMap[otherIds[0]] || null : null;
          }
        }
        
        const confChampGames = allGames.filter(g => g.phase === "conference_championship" && g.season === s && g.isComplete);
        const confChampions = confChampGames.map(g => {
          const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
          return teamMap[winnerId] || null;
        }).filter(Boolean);
        
        const teamRecords = seasonStandings.map(st => ({
          ...teamMap[st.teamId],
          teamId: st.teamId,
          wins: st.wins,
          losses: st.losses,
          conferenceWins: st.conferenceWins,
          conferenceLosses: st.conferenceLosses,
          classRank: classBySeasonTeam.get(`${s}_${st.teamId}`) ?? null,
        })).sort((a, b) => (b.wins || 0) - (a.wins || 0));

        // Top 3 class snapshots for this season summary
        const seasonSnapshots = allClassSnapshots
          .filter(snap => snap.season === s)
          .sort((a, b) => a.classRank - b.classRank)
          .slice(0, 3)
          .map(snap => ({
            classRank: snap.classRank,
            teamId: snap.teamId,
            teamAbbr: teamMap[snap.teamId]?.abbreviation || "???",
            teamName: teamMap[snap.teamId]?.name || "Unknown",
            totalCommits: snap.totalCommits,
            fiveStars: snap.fiveStars,
          }));
        
        // Recruiter of Year: coach with highest recruitingScore this season
        const seasonCoachHistory = allCoachHistory.filter(h => h.season === s && h.recruitingScore != null);
        let recruiterOfYear: { coachName: string; teamName: string; teamAbbr: string; recruitingScore: number; recruitingGrade: string } | null = null;
        if (seasonCoachHistory.length > 0) {
          const best = seasonCoachHistory.reduce((a, b) => (b.recruitingScore ?? 0) > (a.recruitingScore ?? 0) ? b : a);
          const bestCoach = coachMap[best.coachId];
          if (bestCoach) {
            recruiterOfYear = {
              coachName: `${bestCoach.firstName} ${bestCoach.lastName}`,
              teamName: best.teamName,
              teamAbbr: best.teamAbbr,
              recruitingScore: best.recruitingScore!,
              recruitingGrade: best.recruitingGrade ?? "F",
            };
          }
        }

        seasons.push({
          season: s,
          cwsChampion,
          cwsRunnerUp,
          conferenceChampions: confChampions,
          teamRecords,
          hasCWSData: cwsGames.length > 0,
          topClassRankings: seasonSnapshots,
          recruiterOfYear,
        });
      }
      
      res.json({ seasons, currentSeason: league.currentSeason });
    } catch (error) {
      console.error("Failed to fetch dynasty history:", error);
      res.status(500).json({ message: "Failed to fetch dynasty history" });
    }
  });

  // ── Per-Coach Recruiting History ───────────────────────────────────────────
  app.get("/api/leagues/:leagueId/coaches/:coachId/recruiting-history", requireAuth, async (req, res) => {
    try {
      const { leagueId, coachId } = req.params as { leagueId: string; coachId: string };
      const [coachHistory, coach, leagueTeams, allHistory, allLeagueCoaches] = await Promise.all([
        storage.getCoachSeasonHistory(coachId),
        storage.getCoach(coachId),
        storage.getTeamsByLeague(leagueId),
        storage.getCoachSeasonHistoryByLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
      ]);
      const teamMap = Object.fromEntries(leagueTeams.map(t => [t.id, t]));
      const leagueRows = coachHistory
        .filter(h => h.leagueId === leagueId && h.recruitingScore != null)
        .sort((a, b) => a.season - b.season);

      const seasons = leagueRows.map(h => {
        const seasonRows = allHistory
          .filter(x => x.season === h.season && x.recruitingScore != null)
          .sort((a, b) => (b.recruitingScore ?? 0) - (a.recruitingScore ?? 0));
        const rank = seasonRows.findIndex(x => x.coachId === coachId) + 1;
        const isRecruiterOfYear = rank === 1;
        const team = h.teamId ? teamMap[h.teamId] : null;
        return {
          season: h.season,
          recruitingScore: h.recruitingScore,
          recruitingGrade: h.recruitingGrade,
          recruitingBreakdown: h.recruitingBreakdown,
          rank,
          totalTeams: seasonRows.length,
          isRecruiterOfYear,
          teamName: h.teamName,
          teamAbbr: h.teamAbbr,
          primaryColor: team?.primaryColor ?? null,
          totalSigned: h.totalSigned,
          classRank: h.classRank,
          classScore: h.classScore,
          classStarAvg: h.classStarAvg,
          topRecruitName: h.topRecruitName,
          topRecruitOvr: h.topRecruitOvr,
          topRecruitStars: h.topRecruitStars,
        };
      });

      // All-time career rank: rank this coach among all league coaches by careerRecruitingScore
      const careerRanked = allLeagueCoaches
        .filter(c => c.careerRecruitingScore != null)
        .sort((a, b) => (b.careerRecruitingScore ?? 0) - (a.careerRecruitingScore ?? 0));
      const allTimeRank = careerRanked.findIndex(c => c.id === coachId) + 1;
      const totalRanked = careerRanked.length;

      res.json({
        coachId,
        coachName: coach ? `${coach.firstName} ${coach.lastName}` : "Unknown",
        careerRecruitingScore: coach?.careerRecruitingScore ?? null,
        allTimeRank: allTimeRank > 0 ? allTimeRank : null,
        totalRanked,
        seasons,
      });
    } catch (error) {
      console.error("Failed to fetch coach recruiting history:", error);
      res.status(500).json({ message: "Failed to fetch coach recruiting history" });
    }
  });

  // ── Recruiting Scores Leaderboard ──────────────────────────────────────────
  app.get("/api/leagues/:leagueId/recruiting-scores", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.leagueId as string;
      const season = req.query.season ? parseInt(req.query.season as string) : undefined;

      const [allHistory, leagueTeams, allCoaches] = await Promise.all([
        storage.getCoachSeasonHistoryByLeague(leagueId),
        storage.getTeamsByLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
      ]);

      const teamMap = Object.fromEntries(leagueTeams.map(t => [t.id, t]));
      const coachMap = Object.fromEntries(allCoaches.map(c => [c.id, c]));

      const filtered = season != null
        ? allHistory.filter(h => h.season === season)
        : allHistory;

      const leaderboard = filtered
        .filter(h => h.recruitingScore != null)
        .sort((a, b) => (b.recruitingScore ?? 0) - (a.recruitingScore ?? 0))
        .map((h, idx) => {
          const coach = coachMap[h.coachId];
          const team = h.teamId ? teamMap[h.teamId] : null;
          return {
            rank: idx + 1,
            coachId: h.coachId,
            coachName: coach ? `${coach.firstName} ${coach.lastName}` : "Unknown",
            season: h.season,
            teamId: h.teamId,
            teamName: h.teamName,
            teamAbbr: h.teamAbbr,
            primaryColor: team?.primaryColor,
            recruitingScore: h.recruitingScore,
            recruitingGrade: h.recruitingGrade,
            recruitingBreakdown: h.recruitingBreakdown,
            classRank: h.classRank,
            classStarAvg: h.classStarAvg,
            totalSigned: h.totalSigned,
            topRecruitName: h.topRecruitName,
            topRecruitOvr: h.topRecruitOvr,
            topRecruitStars: h.topRecruitStars,
            careerRecruitingScore: coach?.careerRecruitingScore ?? null,
          };
        });

      // Career leaderboard (one row per coach, averaged across seasons)
      const careerMap: Record<string, { coachId: string; coachName: string; teamId: string | null; teamName: string; teamAbbr: string; primaryColor: string | null; careerRecruitingScore: number | null; seasonCount: number; bestScore: number; bestGrade: string }> = {};
      for (const h of allHistory.filter(h => h.recruitingScore != null)) {
        const coach = coachMap[h.coachId];
        if (!careerMap[h.coachId]) {
          const team = h.teamId ? teamMap[h.teamId] : null;
          careerMap[h.coachId] = {
            coachId: h.coachId,
            coachName: coach ? `${coach.firstName} ${coach.lastName}` : "Unknown",
            teamId: h.teamId ?? null,
            teamName: h.teamName,
            teamAbbr: h.teamAbbr,
            primaryColor: team?.primaryColor ?? null,
            careerRecruitingScore: coach?.careerRecruitingScore ?? null,
            seasonCount: 0,
            bestScore: 0,
            bestGrade: "F",
          };
        }
        careerMap[h.coachId].seasonCount++;
        if ((h.recruitingScore ?? 0) > careerMap[h.coachId].bestScore) {
          careerMap[h.coachId].bestScore = h.recruitingScore ?? 0;
          careerMap[h.coachId].bestGrade = h.recruitingGrade ?? "F";
        }
        // Keep team info up-to-date with current team assignment
        const currentCoach = coachMap[h.coachId];
        if (currentCoach?.teamId) {
          const currentTeam = teamMap[currentCoach.teamId];
          if (currentTeam) {
            careerMap[h.coachId].teamId = currentCoach.teamId;
            careerMap[h.coachId].teamName = currentTeam.name;
            careerMap[h.coachId].teamAbbr = currentTeam.abbreviation;
            careerMap[h.coachId].primaryColor = currentTeam.primaryColor;
          }
        }
      }
      const careerLeaderboard = Object.values(careerMap)
        .filter(e => e.careerRecruitingScore != null)
        .sort((a, b) => (b.careerRecruitingScore ?? 0) - (a.careerRecruitingScore ?? 0))
        .map((e, idx) => ({ ...e, rank: idx + 1 }));

      res.json({ season: season ?? null, leaderboard, careerLeaderboard });
    } catch (error) {
      console.error("Failed to fetch recruiting scores:", error);
      res.status(500).json({ message: "Failed to fetch recruiting scores" });
    }
  });

  // ── Backfill recruiting scores for pre-feature seasons ─────────────────────
  app.post("/api/leagues/:id/backfill-recruiting-scores", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Only the commissioner can run this backfill" });
      }

      // Collect all history rows where recruitingScore is null (only process those)
      const allHistory = await storage.getCoachSeasonHistoryByLeague(leagueId);
      const unscoredRows = allHistory.filter(h => h.recruitingScore == null);
      if (unscoredRows.length === 0) {
        return res.json({ updated: 0, message: "All seasons already have recruiting scores" });
      }

      // Gather all snapshots and teams for league-wide context
      const [allSnapshots, leagueTeams] = await Promise.all([
        storage.getRecruitingClassSnapshotsAllSeasons(leagueId),
        storage.getTeamsByLeague(leagueId),
      ]);
      const teamPrestigeMap = Object.fromEntries(leagueTeams.map(t => [t.id, t.prestige ?? 5]));

      // Group snapshots by season for fast lookup
      const snapshotsBySeason = new Map<number, typeof allSnapshots>();
      for (const snap of allSnapshots) {
        if (!snapshotsBySeason.has(snap.season)) snapshotsBySeason.set(snap.season, []);
        snapshotsBySeason.get(snap.season)!.push(snap);
      }

      // Group all history by season for classRank reconstruction
      const historyBySeason = new Map<number, typeof allHistory>();
      for (const h of allHistory) {
        if (!historyBySeason.has(h.season)) historyBySeason.set(h.season, []);
        historyBySeason.get(h.season)!.push(h);
      }

      // Preload action logs for all teams that have unscored rows (avoids N+1)
      const uniqueTeamIds = [...new Set(unscoredRows.map(r => r.teamId).filter(Boolean) as string[])];
      const actionLogResults = await Promise.allSettled(
        uniqueTeamIds.map(teamId => storage.getRecruitingActionsLogByTeam(teamId, leagueId))
      );
      const actionLogsByTeam = new Map<string, Awaited<ReturnType<typeof storage.getRecruitingActionsLogByTeam>>>();
      actionLogResults.forEach((result, idx) => {
        const teamId = uniqueTeamIds[idx];
        if (result.status === "fulfilled") {
          actionLogsByTeam.set(teamId, result.value);
        } else {
          console.warn(`[backfill-recruiting-scores] Failed to load action log for team ${teamId}:`, result.reason);
        }
      });

      let updatedCount = 0;

      for (const row of unscoredRows) {
        const seasonSnaps = snapshotsBySeason.get(row.season) ?? [];
        const seasonHistory = historyBySeason.get(row.season) ?? [];
        const teamSnap = seasonSnaps.find(s => s.teamId === row.teamId);

        // ── 1. Class Quality (20%): team avgOvr vs league range ────────────────
        // Only use snapshot avgOverall (OVR scale ~150-650). row.classScore is a
        // composite on a different scale and must NOT be used as a substitute here.
        const leagueAvgOvrs = seasonSnaps.filter(s => (s.totalCommits ?? 0) > 0).map(s => s.avgOverall ?? 0);
        const leagueBestAvg = leagueAvgOvrs.length > 0 ? Math.max(...leagueAvgOvrs) : 0;
        const leagueWorstAvg = leagueAvgOvrs.length > 0 ? Math.min(...leagueAvgOvrs) : 0;
        const teamAvgOvr = teamSnap?.avgOverall ?? null;
        const classQualityScore = (teamAvgOvr !== null && leagueBestAvg > leagueWorstAvg)
          ? Math.min(100, Math.max(0, Math.round(((teamAvgOvr - leagueWorstAvg) / (leagueBestAvg - leagueWorstAvg)) * 100)))
          : 50; // neutral when snapshot data unavailable — avoids cross-scale contamination

        // ── 2. Class Rank (15%): re-rank using stored classScore ────────────────
        const allClassScores = seasonHistory
          .filter(h => (h.classScore ?? 0) > 0)
          .sort((a, b) => (b.classScore ?? 0) - (a.classScore ?? 0));
        const myRankIdx = allClassScores.findIndex(h => h.coachId === row.coachId);
        const numTeams = Math.max(allClassScores.length, 1);
        const classRankScore = numTeams <= 1 ? 50
          : (myRankIdx >= 0 ? Math.round((1 - myRankIdx / (numTeams - 1)) * 100) : 0);

        // ── 3. Hit Rate (15%): approximate — interests not available historically ─
        const hitRateScore = (row.totalSigned ?? 0) > 0 ? 25 : 0;

        // ── 4. Star Efficiency (15%): avgStarRating vs prestige ────────────────
        const prestige = teamPrestigeMap[row.teamId ?? ""] ?? 5;
        const expectedAvgStar = Math.max(1, Math.min(5, prestige / 2));
        const actualAvgStar = teamSnap?.avgStarRating ?? row.classStarAvg ?? expectedAvgStar;
        const starEffScore = Math.min(100, Math.max(0, Math.round(50 + (actualAvgStar - expectedAvgStar) * 15)));

        // ── 5. Positional Balance (10%): estimate from snapshot totalCommits ──────
        // More commits → more likely to cover all 9 positions. Using totalCommits/9
        // as a stable, snapshot-derived proxy for position coverage.
        const totalSigned = teamSnap?.totalCommits ?? row.totalSigned ?? 0;
        const posBalanceScore = totalSigned > 0
          ? Math.min(100, Math.round((totalSigned / 9) * 100))
          : 0;

        // ── 6. Blue Chip Haul (10%): use snapshot fiveStars as blue chip proxy ──
        // Blue chips are a subset of 4-5★ recruits; fiveStars from the snapshot
        // is the closest stable approximation available without per-recruit data.
        const teamFiveStars = teamSnap?.fiveStars ?? 0;
        const maxFiveStars = Math.max(...seasonSnaps.map(s => s.fiveStars ?? 0), 1);
        const blueChipScore = Math.min(100, Math.round((teamFiveStars / maxFiveStars) * 100));

        // ── 7. Action Efficiency (10%): from preloaded action logs (season-filtered) ─
        // Action logs have a season field, so this is computed from real historical data.
        // If a team's log failed to load (logged as a warning above), fall back to 30.
        let actionEffScore = 0;
        const teamActionLog = row.teamId ? actionLogsByTeam.get(row.teamId) : undefined;
        if (teamActionLog !== undefined) {
          const nonScoutActions = teamActionLog.filter(a => a.season === row.season && a.actionType !== "scout");
          const recruitsPerAction = nonScoutActions.length > 0
            ? (totalSigned / nonScoutActions.length)
            : (totalSigned > 0 ? 0.3 : 0);
          actionEffScore = Math.min(100, Math.round(recruitsPerAction * 200));
        } else {
          // Log missing (either load failed or team had no actions) — use conservative default
          console.warn(`[backfill-recruiting-scores] No action log available for team ${row.teamId} season ${row.season}; using default actionEff=30`);
          actionEffScore = totalSigned > 0 ? 30 : 0;
        }

        // ── 8. Gem Detection (5%): unavailable from historical data → 0 ──────────
        // Generational gem flags are not captured in snapshots and cannot be
        // recovered from aggregate data for seasons before tracking launched.
        const gemScore = 0;

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
        const grade = computeRecruitingGrade(score);

        await storage.upsertCoachSeasonHistory({
          coachId: row.coachId,
          leagueId: row.leagueId,
          season: row.season,
          wins: row.wins,
          losses: row.losses,
          confWins: row.confWins,
          confLosses: row.confLosses,
          phaseResult: row.phaseResult,
          classRank: row.classRank,
          classScore: row.classScore,
          classStarAvg: row.classStarAvg,
          totalSigned: row.totalSigned,
          topRecruitName: row.topRecruitName,
          topRecruitOvr: row.topRecruitOvr,
          topRecruitStars: row.topRecruitStars,
          teamId: row.teamId,
          teamName: row.teamName,
          teamAbbr: row.teamAbbr,
          recruitingScore: score,
          recruitingGrade: grade,
          recruitingBreakdown: breakdown,
        });
        updatedCount++;
      }

      // Recompute career scores for all coaches in the league since historical
      // scores may now be available that change the rolling weighted average
      if (updatedCount > 0) {
        const refreshedHistory = await storage.getCoachSeasonHistoryByLeague(leagueId);
        const allCoaches = await storage.getCoachesByLeague(leagueId);
        for (const coach of allCoaches) {
          const scoredSeasons = refreshedHistory
            .filter(h => h.coachId === coach.id && h.leagueId === leagueId && h.recruitingScore != null)
            .sort((a, b) => a.season - b.season);
          if (scoredSeasons.length === 0) continue;
          const N = scoredSeasons.length;
          let weightSum = 0;
          let weightedScoreSum = 0;
          scoredSeasons.forEach((h, idx) => {
            const weight = 1.0 + (N > 1 ? idx / (N - 1) : 0);
            weightedScoreSum += (h.recruitingScore || 0) * weight;
            weightSum += weight;
          });
          const rollingAvg = weightedScoreSum / weightSum;
          let milestoneBonus = 0;
          for (const h of scoredSeasons) {
            const seasonRanked = refreshedHistory
              .filter(x => x.season === h.season && x.recruitingScore != null)
              .sort((a, b) => (b.recruitingScore ?? 0) - (a.recruitingScore ?? 0));
            if (seasonRanked[0]?.coachId === coach.id) {
              milestoneBonus += 1.5;
            } else {
              const rank = seasonRanked.findIndex(x => x.coachId === coach.id);
              if (rank >= 0 && rank < 3) milestoneBonus += 0.5;
            }
            const bd = h.recruitingBreakdown as Record<string, number> | null;
            if (bd?.gemDetection === 100) milestoneBonus += 0.5;
          }
          milestoneBonus = Math.min(5, milestoneBonus);
          const careerScore = Math.min(100, rollingAvg + milestoneBonus);
          await storage.updateCoach(coach.id, { careerRecruitingScore: Math.round(careerScore * 10) / 10 });
        }
      }

      res.json({
        updated: updatedCount,
        message: updatedCount === 0
          ? "All seasons already had recruiting scores — nothing to backfill."
          : `Backfilled grades for ${updatedCount} coach-season record${updatedCount !== 1 ? "s" : ""}. Class quality, rank, star efficiency, blue chip haul (5★ proxy), positional balance (class size proxy), and action efficiency are derived from stable historical data. Hit rate and gem detection use conservative defaults.`,
      });
    } catch (error) {
      console.error("Failed to backfill recruiting scores:", error);
      res.status(500).json({ message: "Failed to backfill recruiting scores" });
    }
  });
  // ────────────────────────────────────────────────────────────────────────────

  // ============ CPU RECRUITING AI FUNCTION ============
  // forcedHumanTeamIds: non-auto-pilot human teams that were force-advanced by the commissioner
  // and should have CPU recruiting run for them at all_american difficulty.
  async function runCpuRecruiting(leagueId: string, week: number, season: number, includeAllTeams = false, forcedHumanTeamIds: Set<string> = new Set()) {
    const league = await storage.getLeague(leagueId);
    const leagueDifficulty = league?.cpuDifficulty || "high_school";
    
    // CPU difficulty balance (rebalanced for 4-week recruiting window):
    //   Auto-pilot and force-advanced human teams always use all_american difficulty,
    //   regardless of the league's CPU difficulty setting.
    //
    //   gainMultiplier applies on top of the same compute* functions humans use.
    //
    //   Effective human-equivalent actions (with updated difficultyStretch, base 15):
    //     beginner:     budget≈15 × 0.75 = 11  → meaningfully easier than human (15)
    //     high_school:  budget≈15 × 1.0  = 15  → matches human baseline
    //     all_american: budget≈15 × 1.1  = 17  → modest edge
    //     elite:        budget≈15 × 1.2  = 18  → challenging not cheating
    const difficultyConfig: Record<string, { minActions: number; maxActions: number; gainMultiplier: number; targetingBonus: number; offerThreshold: number; visitThreshold: number; positionNeedWeight: number; requireWarmup: boolean; competitionAware: boolean }> = {
      beginner:     { minActions: 4, maxActions: 7,  gainMultiplier: 0.70, targetingBonus: 0,  offerThreshold: 25, visitThreshold: 45, positionNeedWeight: 5,  requireWarmup: false, competitionAware: false },
      high_school:  { minActions: 5, maxActions: 9,  gainMultiplier: 1.00, targetingBonus: 5,  offerThreshold: 15, visitThreshold: 35, positionNeedWeight: 12, requireWarmup: false, competitionAware: false },
      all_american: { minActions: 6, maxActions: 11, gainMultiplier: 1.05, targetingBonus: 10, offerThreshold: 10, visitThreshold: 25, positionNeedWeight: 22, requireWarmup: true,  competitionAware: true  },
      elite:        { minActions: 7, maxActions: 13, gainMultiplier: 1.10, targetingBonus: 15, offerThreshold: 5,  visitThreshold: 20, positionNeedWeight: 30, requireWarmup: true,  competitionAware: true  },
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

      // Use the same coach-driven budget as humans so archetype/skill perks
      // measurably affect CPU action throughput too. Difficulty stretches it.
      const baseBudget = getMaxRecruitingActions(teamCoach);
      // Reduced stretches for AA/Elite: action volume advantage is modest; smarts do the heavy lifting.
      const difficultyStretch = { beginner: 0.75, high_school: 1.0, all_american: 1.1, elite: 1.2 }[teamDifficulty] ?? 1.0;
      const actionsBudget = Math.max(2, Math.round(baseBudget * difficultyStretch));

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

          // Recruiting style strategy: bonus for preferred recruit profiles
          let styleBonus = 0;
          const stars = r.starRating || 3;
          if (styleStrategy === "top_prospects" && stars >= 4) styleBonus = 12;
          else if (styleStrategy === "high_potential" && (r.potential === "A" || r.potential === "B" || r.potential === "B+")) styleBonus = 10;
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
          .map(t => ({ t, level: calculatePriorityBonus(t, recruit, team).matchLevel }))
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
        const visitWarmupMet = !config.requireWarmup || priorInteractions >= 1;
        const visitCost = getActionPointCost("visit", team.state, recruit.homeState);
        if (currentInterestLevel > config.visitThreshold && visitCost <= remaining &&
            !hasVisited && visitWarmupMet) {
          candidateActions.push("visit", "visit");
        }
        if (candidateActions.length === 0) continue;
        
        const actionType = candidateActions[Math.floor(Math.random() * candidateActions.length)];
        const cost = getActionPointCost(actionType, team.state, recruit.homeState);
        if (cost > remaining) continue; // budget enforcement before execution
        
        // Use the SAME helper as the human path so multipliers match exactly.
        // Then layer the difficulty gainMultiplier on top.
        let baseGain = 0;
        let interestGain = 0;
        if (actionType === "email") {
          const r = computeEmailGain(recruit, team, teamCoach, pickBestTopic(recruit));
          baseGain = r.baseGain;
          interestGain = Math.round(r.interestGain * config.gainMultiplier);
        } else if (actionType === "phone") {
          // Mirror human multi-topic phone (1-2 topics for CPU)
          const topicSet = [pickBestTopic(recruit)];
          if (Math.random() < 0.5) topicSet.push("reputation");
          const r = computePhoneGain(recruit, team, teamCoach, topicSet);
          baseGain = 6 * topicSet.length;
          interestGain = Math.round(r.totalInterestGain * config.gainMultiplier);
        } else if (actionType === "visit") {
          const r = computeVisitGain(recruit, team, teamCoach);
          baseGain = r.baseGain;
          interestGain = Math.round(r.interestGain * config.gainMultiplier);
        } else { // offer
          const r = computeOfferGain(recruit, team, teamCoach);
          baseGain = r.baseGain;
          interestGain = Math.round(r.interestGain * config.gainMultiplier);
        }
        // Storyline recruits: apply ±15% interest volatility for dramatic swings
        if (storylineRecruitIds.has(recruit.id)) {
          const swing = (Math.random() * 0.30) - 0.15; // -15% to +15%
          interestGain = Math.max(0, Math.round(interestGain * (1 + swing)));
        }
        assertInterestGainSane(`cpu_${actionType}`, interestGain, baseGain);
        weeklyActionsThisWeek.add(weeklyActionKey(recruit.id, actionType));
        pointsSpent += cost;

        // Accumulate action summary for auto-pilot / force-advanced log
        if (isSpecialHandling) {
          if (actionType === "email") actionSummary.emails++;
          else if (actionType === "phone") actionSummary.phones++;
          else if (actionType === "visit") actionSummary.visits++;
          else if (actionType === "hcVisit") actionSummary.hcVisits++;
          else if (actionType === "offer") actionSummary.offers++;
          actionSummary.recruitsTargeted.push({
            name: `${recruit.firstName || ""} ${recruit.lastName || ""}`.trim() || "Unknown",
            position: recruit.position || "?",
            stars: recruit.starRating || 3,
            action: actionType,
          });
        }
        
        if (!interest) {
          await storage.createRecruitingInterest({
            recruitId: recruit.id,
            teamId: team.id,
            interestLevel: interestGain,
            hasOffer: actionType === "offer",
          });
        } else {
          await storage.updateRecruitingInterest(interest.id, {
            interestLevel: Math.min(100, (interest.interestLevel || 0) + interestGain),
            hasOffer: interest.hasOffer || actionType === "offer",
          });
        }
        
        const isForced = forcedHumanTeamIds.has(team.id);
        const isAlertableAction = team.isAutoPilot || isDeadlineForced;
        await storage.createRecruitingAction({
          recruitId: recruit.id,
          teamId: team.id,
          leagueId: leagueId,
          week: week,
          season: season,
          actionType: actionType,
          interestChange: interestGain,
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
  
  // ============ RECRUIT STAGE PROGRESSION FUNCTION ============
  async function updateRecruitStages(leagueId: string, week: number) {
    const recruits = await storage.getRecruitsByLeague(leagueId);
    const unsignedRecruits = recruits.filter(r => !r.signedTeamId);

    // Pre-load everything needed for the loop in parallel — eliminates N+1 queries
    const league = await storage.getLeague(leagueId);
    const [allLeagueInterests, allLeaguePlayers, allLeagueTeams, storylineRecruitsData] = await Promise.all([
      storage.getRecruitingInterestsByLeague(leagueId),
      storage.getPlayersByLeague(leagueId),
      storage.getTeamsByLeague(leagueId),
      league ? storage.getStorylineRecruitsByLeague(leagueId, league.currentSeason) : Promise.resolve([]),
    ]);

    // Group interests by recruitId in memory
    const interestsByRecruit = new Map<string, typeof allLeagueInterests>();
    for (const interest of allLeagueInterests) {
      if (!interestsByRecruit.has(interest.recruitId)) interestsByRecruit.set(interest.recruitId, []);
      interestsByRecruit.get(interest.recruitId)!.push(interest);
    }

    // Group players by teamId in memory
    const playersByTeam = new Map<string, typeof allLeaguePlayers>();
    for (const player of allLeaguePlayers) {
      if (!playersByTeam.has(player.teamId)) playersByTeam.set(player.teamId, []);
      playersByTeam.get(player.teamId)!.push(player);
    }

    const storylineRecruitIds = new Set(storylineRecruitsData.map(sl => sl.recruitId));
    
    // Parallelize per-recruit processing — each recruit's DB writes are independent
    await Promise.all(unsignedRecruits.map(async (recruit) => {
      const allInterests = interestsByRecruit.get(recruit.id) ?? [];
      if (allInterests.length === 0) return;
      
      const sortedInterests = allInterests
        .filter(i => i.interestLevel > 0)
        .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0));
      
      const topInterestLevel = sortedInterests[0]?.interestLevel || 0;
      const currentStage = recruit.stage || "open";
      
      let newStage = currentStage;
      
      // Star-based thresholds: higher-rated recruits take longer to decide
      const starRating = recruit.starRating || 3;
      const isBlueChip = recruit.isBlueChip || false;
      // Storyline recruits hold out longer — +2 week delay, +10 interest required
      const isStoryline = storylineRecruitIds.has(recruit.id);
      const storylineWeekBonus = isStoryline ? 2 : 0;
      const storylineInterestBonus = isStoryline ? 10 : 0;
      
      // Signing thresholds scale with star rating
      const verbalWeek = (isBlueChip ? 11 : starRating >= 5 ? 10 : starRating >= 4 ? 8 : 6) + storylineWeekBonus;
      const verbalInterest = (isBlueChip ? 85 : starRating >= 5 ? 80 : starRating >= 4 ? 70 : 60) + storylineInterestBonus;
      const signInterest = (isBlueChip ? 90 : starRating >= 5 ? 85 : starRating >= 4 ? 75 : 65) + storylineInterestBonus;
      
      if (sortedInterests.length >= 1) {
        if (week >= verbalWeek && topInterestLevel >= verbalInterest && sortedInterests.some(i => i.hasOffer)) {
          newStage = "verbal";
        } else if (week >= Math.max(3, verbalWeek - 4) && topInterestLevel >= 55) {
          newStage = "top3";
        } else if (week >= Math.max(2, verbalWeek - 6) && topInterestLevel >= 35) {
          newStage = "top5";
        } else if (week >= 2 && topInterestLevel >= 20) {
          newStage = "top8";
        }
      }
      
      const stageOrder = ["open", "top8", "top5", "top3", "verbal", "signed"];
      if (stageOrder.indexOf(newStage) > stageOrder.indexOf(currentStage)) {
        await storage.updateRecruit(recruit.id, { stage: newStage });
        
        if (newStage === "verbal") {
          const topSchool = sortedInterests.filter(i => i.hasOffer).sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0))[0];
          if (topSchool && topSchool.interestLevel >= signInterest) {
            const teamRoster = playersByTeam.get(topSchool.teamId) ?? [];
            const teamCommits = recruits.filter(r => r.signedTeamId === topSchool.teamId).length;
            const departing = teamRoster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained").length;
            const portal = teamRoster.filter(p => p.inTransferPortal).length;
            if (teamRoster.length - departing - portal + teamCommits + 1 <= 30) {
              await storage.updateRecruit(recruit.id, { 
                stage: "signed",
                signedTeamId: topSchool.teamId,
              });
            }
          }
        }
      }
      
      let justSigned = false;
      if (currentStage === "verbal") {
        const topSchoolWithOffer = sortedInterests.filter(i => i.hasOffer).sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0))[0];
        if (topSchoolWithOffer && topSchoolWithOffer.interestLevel >= signInterest) {
          const teamRoster = playersByTeam.get(topSchoolWithOffer.teamId) ?? [];
          const teamCommits = recruits.filter(r => r.signedTeamId === topSchoolWithOffer.teamId).length;
          const departing = teamRoster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained").length;
          const portal = teamRoster.filter(p => p.inTransferPortal).length;
          if (teamRoster.length - departing - portal + teamCommits + 1 <= 30) {
            await storage.updateRecruit(recruit.id, { 
              stage: "signed",
              signedTeamId: topSchoolWithOffer.teamId,
            });
            justSigned = true;
          }
        }
      }

      // Decommitment check: verbal recruit can flip if a rival with an offer closes the gap
      const FLIP_THRESHOLD = 15;
      if (currentStage === "verbal" && !justSigned) {
        const schoolsWithOffers = sortedInterests
          .filter(i => i.hasOffer)
          .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0));
        if (schoolsWithOffers.length >= 2) {
          const leader = schoolsWithOffers[0];
          const rival = schoolsWithOffers[1];
          const gap = (leader.interestLevel || 0) - (rival.interestLevel || 0);
          if (gap < FLIP_THRESHOLD && (rival.interestLevel || 0) > 40 && Math.random() < 0.35) {
            await storage.updateRecruit(recruit.id, { stage: "top3" });
            try {
              const leaderTeam = allLeagueTeams.find(t => t.id === leader.teamId);
              const rivalTeam = allLeagueTeams.find(t => t.id === rival.teamId);
              if (leaderTeam) {
                await storage.createLeagueEvent({
                  leagueId,
                  teamId: leader.teamId,
                  teamName: leaderTeam.name,
                  teamAbbreviation: leaderTeam.abbreviation || leaderTeam.name.slice(0, 4).toUpperCase(),
                  eventType: "DECOMMIT",
                  description: `${recruit.firstName} ${recruit.lastName} (${recruit.position}, ${recruit.starRating ?? 0}★) decommitted from ${leaderTeam.name} — ${rivalTeam?.name ?? "a rival"} is closing the gap`,
                  season: league?.currentSeason ?? 1,
                  week,
                  metadata: { recruitId: recruit.id, alertType: "lost", leaderTeamName: leaderTeam.name, rivalTeamName: rivalTeam?.name ?? null },
                });
              }
              if (rivalTeam) {
                await storage.createLeagueEvent({
                  leagueId,
                  teamId: rival.teamId,
                  teamName: rivalTeam.name,
                  teamAbbreviation: rivalTeam.abbreviation || rivalTeam.name.slice(0, 4).toUpperCase(),
                  eventType: "DECOMMIT",
                  description: `${recruit.firstName} ${recruit.lastName} (${recruit.position}, ${recruit.starRating ?? 0}★) decommitted from ${leaderTeam.name} and is now showing increased interest in ${rivalTeam.name}`,
                  season: league?.currentSeason ?? 1,
                  week,
                  metadata: { recruitId: recruit.id, alertType: "gain", leaderTeamName: leaderTeam.name, rivalTeamName: rivalTeam.name },
                });
              }
            } catch (e) {
              console.error("[decommit] Failed to create decommit event:", e);
            }
          }
        }
      }
    }));
  }

  // Generate recruiting class for dynasty setup
  app.post("/api/leagues/:id/recruiting/generate", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      // Commissioner-only action
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can generate a recruiting class" });
      }

      // Delete existing recruits for this league
      await storage.deleteRecruitsByLeague(req.params.id as string);

      // Scale recruit class to league size: teams.length × 5 (min 40)
      // forceStorylineReset=true: commissioner explicitly regenerated the class, so existing
      // storyline data for this season must be wiped and rebuilt for the new recruits.
      const leagueTeamsForCount = await storage.getTeamsByLeague(req.params.id as string);
      const recruitCount = getRecruitPoolSize(leagueTeamsForCount.length);
      await generateRecruits(req.params.id as string, recruitCount, true);

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Recruiting Class Generated",
        details: `Generated ${recruitCount} recruits for the recruiting class (${leagueTeamsForCount.length} teams × 5)`,
      });

      res.json({
        success: true,
        count: recruitCount,
        storylineReset: true,
        storylineResetWarning: "Existing storyline arcs and events for this season were wiped and rebuilt for the new recruiting class.",
      });
    } catch (error) {
      console.error("Failed to generate recruiting class:", error);
      res.status(500).json({ message: "Failed to generate recruiting class" });
    }
  });

  // Simulate week - auto-resolve all games for the current week
  app.post("/api/leagues/:id/simulate", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can simulate games" });
      }

      const games = await storage.getGamesByLeague(league.id);
      const currentWeekGames = games.filter(g => 
        g.week === league.currentWeek && 
        g.season === league.currentSeason &&
        !g.isComplete
      );

      const simTeams = await storage.getTeamsByLeague(league.id);
      const simUserCoachForSim = (await storage.getCoachesByLeague(league.id)).find((c: any) => c.userId === req.session.userId);
      const simUserTeamIdForSim = simUserCoachForSim?.teamId;
      let simUserTeamGame: {
        homeTeam: string; awayTeam: string; homeAbbr: string; awayAbbr: string;
        homeScore: number; awayScore: number; inningScores: number[][];
        homeHits: number; awayHits: number; homeErrors: number; awayErrors: number;
        isHome: boolean; homeColor?: string; awayColor?: string;
      } | undefined;

      for (const game of currentWeekGames) {
        const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType);
        await storage.updateGame(game.id, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          isComplete: true,
          boxScore: result.boxScore,
        });
        try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(league.id, league.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(league.id, league.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
        if (simUserTeamIdForSim && !simUserTeamGame &&
            (game.homeTeamId === simUserTeamIdForSim || game.awayTeamId === simUserTeamIdForSim)) {
          try {
            const box = JSON.parse(result.boxScore);
            const ht = simTeams.find((t: any) => t.id === game.homeTeamId);
            const at = simTeams.find((t: any) => t.id === game.awayTeamId);
            simUserTeamGame = {
              homeTeam: ht?.name ?? "Home", awayTeam: at?.name ?? "Away",
              homeAbbr: ht?.abbreviation ?? "HME", awayAbbr: at?.abbreviation ?? "AWY",
              homeScore: result.homeScore, awayScore: result.awayScore,
              inningScores: box.innings ?? [],
              homeHits: box.home?.totals?.h ?? 0, awayHits: box.away?.totals?.h ?? 0,
              homeErrors: box.home?.errors ?? 0, awayErrors: box.away?.errors ?? 0,
              isHome: game.homeTeamId === simUserTeamIdForSim,
              homeColor: ht?.primaryColor ?? "#FFD700",
              awayColor: at?.primaryColor ?? "#7eb8f7",
            };
          } catch { /* non-critical */ }
        }
      }

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Simulated Week",
        details: `Auto-resolved ${currentWeekGames.length} games for week ${league.currentWeek}`,
      });

      res.json({ success: true, gamesSimulated: currentWeekGames.length, userTeamGame: simUserTeamGame });
    } catch (error) {
      console.error("Failed to simulate week:", error);
      res.status(500).json({ message: "Failed to simulate week" });
    }
  });

  // Toggle ready status for user's coach
  app.post("/api/leagues/:id/ready", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const coaches = await storage.getCoachesByLeague(league.id);
      const userCoach = coaches.find((c: { userId: string | null }) => c.userId === req.session.userId);
      if (!userCoach) {
        return res.status(403).json({ message: "You don't have a coach in this league" });
      }

      // Toggle ready status
      const newReadyStatus = !userCoach.isReady;
      await storage.updateCoach(userCoach.id, { isReady: newReadyStatus });

      res.json({ success: true, isReady: newReadyStatus });
    } catch (error) {
      console.error("Failed to toggle ready status:", error);
      res.status(500).json({ message: "Failed to toggle ready status" });
    }
  });

  // Get ready status for all teams in a league (commissioner view)
  app.get("/api/leagues/:id/ready-status", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      // Commissioner-only: only the commissioner (or their own coach) should see full team readiness
      const allLeagueCoaches = await storage.getCoachesByLeague(league.id);
      const requestingCoach = allLeagueCoaches.find(c => c.userId === req.session.userId);
      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!isCommissioner && !requestingCoach) {
        return res.status(403).json({ message: "Not authorized to view readiness data" });
      }

      const teams = await storage.getTeamsByLeague(league.id);
      const coaches = allLeagueCoaches;
      const games = await storage.getGamesByLeague(league.id);
      
      // Get current week's games that need scores
      const currentWeekGames = games.filter(g => 
        g.week === league.currentWeek && 
        g.season === league.currentSeason &&
        !g.isComplete
      );

      // Get all recruiting interests for accurate action counts
      const allInterests = await storage.getRecruitingInterestsByLeague(league.id);

      // Get this week's recruiting actions for per-team action counts and last-activity timestamps
      const weekActions = await storage.getRecruitingActionsLogByLeagueWeek(league.id, league.currentSeason, league.currentWeek);

      // Get recent league events (current season, non-nudge) as activity signals for non-recruiting phases
      const recentLeagueEvents = await storage.getLeagueEvents(league.id, 200);
      const currentSeasonEvents = recentLeagueEvents.filter(e =>
        e.season === league.currentSeason &&
        e.teamId !== null &&
        e.eventType !== "NUDGE"
      );

      // Pre-group by teamId to avoid repeated filter+sort inside map
      const interestsByTeam = new Map<string, typeof allInterests>();
      for (const i of allInterests) {
        if (!interestsByTeam.has(i.teamId)) interestsByTeam.set(i.teamId, []);
        interestsByTeam.get(i.teamId)!.push(i);
      }

      const weekActionsByTeam = new Map<string, typeof weekActions>();
      for (const a of weekActions) {
        if (!weekActionsByTeam.has(a.teamId)) weekActionsByTeam.set(a.teamId, []);
        weekActionsByTeam.get(a.teamId)!.push(a);
      }

      // Latest event timestamp per team (events already sorted desc by storage)
      const latestEventByTeam = new Map<string, number>();
      for (const e of currentSeasonEvents) {
        const tid = e.teamId!;
        if (!latestEventByTeam.has(tid)) {
          latestEventByTeam.set(tid, new Date(e.createdAt).getTime());
        }
      }

      const readyStatus = teams.map(team => {
        const coach = coaches.find(c => c.teamId === team.id);
        const isHumanControlled = !!coach?.userId;
        
        // Check if team has pending scores to report
        const pendingGames = currentWeekGames.filter(g => 
          (g.homeTeamId === team.id || g.awayTeamId === team.id)
        );
        const hasReportedScores = pendingGames.length === 0 || 
          pendingGames.every(g => g.homeScore !== null && g.awayScore !== null);

        // Calculate actual scout and recruit actions from interests
        const teamInterests = interestsByTeam.get(team.id) ?? [];
        const scoutActionsUsed = teamInterests.filter(i => i.scoutPercentage > 0).length;
        const recruitActionsUsed = teamInterests.filter(i => i.interestLevel > 0).length;

        // Per-team actions this week and last activity timestamp from recruiting log
        const teamWeekActions = weekActionsByTeam.get(team.id) ?? [];
        const currentWeekActionCount = teamWeekActions.length;
        const latestRecruitTs = teamWeekActions.reduce((best, a) => {
          const t = new Date(a.createdAt).getTime();
          return t > best ? t : best;
        }, 0);

        // Latest event timestamp (pre-grouped above)
        const latestEventTs = latestEventByTeam.get(team.id) ?? 0;

        // Use the most recent signal across both sources
        const bestTs = Math.max(latestRecruitTs, latestEventTs);
        const lastActivityAt = bestTs > 0
          ? new Date(bestTs).toISOString()
          : null;

        return {
          teamId: team.id,
          teamName: team.name,
          abbreviation: team.abbreviation,
          isHumanControlled,
          userId: coach?.userId ?? null,
          coachId: coach?.id ?? null,
          coachName: coach ? `${coach.firstName} ${coach.lastName}` : "CPU",
          isReady: coach?.isReady ?? false,
          isAutoPilot: team.isAutoPilot ?? false,
          departuresFinalized: team.departuresFinalized,
          walkonReady: team.walkonReady ?? false,
          scoutActionsUsed,
          recruitActionsUsed,
          currentWeekActionCount,
          lastActivityAt,
          hasReportedScores,
        };
      });

      const isDeparturesPhase = league.currentPhase === "offseason_departures";
      const isWalkonsPhase = league.currentPhase === "offseason_walkons";
      
      const getReadyState = (s: typeof readyStatus[0]) => {
        // Auto-pilot teams are always treated as ready — CPU manages them
        if (s.isAutoPilot) return true;
        if (isDeparturesPhase) return s.departuresFinalized;
        if (isWalkonsPhase) return s.walkonReady;
        return s.isReady;
      };
      
      const allHumansReady = readyStatus
        .filter(s => s.isHumanControlled)
        .every(s => getReadyState(s));

      res.json({ 
        readyStatus, 
        allHumansReady,
        currentPhase: league.currentPhase,
        phaseDeadline: league.phaseDeadline ?? null,
        humanCount: readyStatus.filter(s => s.isHumanControlled).length,
        readyCount: readyStatus.filter(s => s.isHumanControlled && getReadyState(s)).length
      });
    } catch (error) {
      console.error("Failed to get ready status:", error);
      res.status(500).json({ message: "Failed to get ready status" });
    }
  });

  // Send a nudge notification to a stalled coach (commissioner only)
  app.post("/api/leagues/:id/teams/:teamId/nudge", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const teamId = req.params.teamId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can send nudges" });
      }

      const coaches = await storage.getCoachesByLeague(leagueId);
      const targetCoach = coaches.find(c => c.teamId === teamId);
      if (!targetCoach || !targetCoach.userId) {
        return res.status(400).json({ message: "Cannot nudge a CPU team" });
      }

      const teams = await storage.getTeamsByLeague(leagueId);
      const team = teams.find(t => t.id === teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });

      const phaseLabel: Record<string, string> = {
        offseason_departures: "submit their player departures",
        offseason_recruiting_1: "take recruiting actions",
        offseason_recruiting_2: "take recruiting actions",
        offseason_recruiting_3: "take recruiting actions",
        offseason_recruiting_4: "take recruiting actions",
        offseason_signing_day: "finalize their signing day decisions",
        offseason_walkons: "complete their roster cuts & walk-ons",
        regular_season: "advance the week",
        preseason: "mark themselves ready",
        spring_training: "mark themselves ready",
      };
      const action = phaseLabel[league.currentPhase] || "take action";

      await storage.createLeagueEvent({
        leagueId,
        teamId,
        teamName: team.name,
        teamAbbreviation: team.abbreviation,
        eventType: "NUDGE",
        description: `${team.abbreviation} (${targetCoach.firstName} ${targetCoach.lastName}) has been reminded to ${action}.`,
        season: league.currentSeason,
        week: league.currentWeek,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to send nudge:", error);
      res.status(500).json({ message: "Failed to send nudge" });
    }
  });

  // Helper function to convert letter grade to numeric value (0-100)
  function letterGradeToNumeric(grade: string): number {
    const gradeMap: Record<string, number> = {
      'S': 95, 'A': 85, 'B': 75, 'C': 65, 'D': 55, 'E': 45, 'F': 35, 'G': 20
    };
    return gradeMap[grade.toUpperCase()] ?? 50;
  }

  // Helper function to parse CSV data
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  app.post("/api/leagues/:id/recruiting/import", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      // Commissioner-only action
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can import a recruiting class" });
      }

      // Delete existing recruits for this league
      await storage.deleteRecruitsByLeague(req.params.id as string);

      const { csvData } = req.body;
      let recruitCount = 0;

      if (csvData && typeof csvData === 'string' && csvData.trim()) {
        // Parse CSV data
        const lines = csvData.trim().split('\n');
        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));
        
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length < 2) continue;
          
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });

          // Detect if pitcher or fielder based on position
          const position = row.position || row.pos || 'IF';
          const isPitcher = ['SP', 'RP', 'P'].includes(position.toUpperCase());

          // Initial overall placeholder (will be recalculated from attributes below)
          const overallValue = parseInt(row.overall) || 500;
          const starRating = getStarRatingFromOVR(overallValue);

          // Parse recruit data from CSV
          const recruit: any = {
            leagueId: league.id,
            firstName: row.firstname || row.first || row['first name'] || 'Player',
            lastName: row.lastname || row.last || row['last name'] || 'Unknown',
            position: position.toUpperCase(),
            homeState: row.homestate || row.state || row['home state'] || 'TX',
            hometown: row.hometown || row.city || row['home city'] || 'Houston',
            classRank: i,
            positionRank: Math.ceil(i / 5),
            overall: overallValue,
            starRating: parseInt(row.starrating) || parseInt(row.stars) || starRating,
            starRank: parseInt(row.starrating) || parseInt(row.stars) || starRating,
            recruitType: row.recruittype || row.type || 'HS',
            throwHand: row.throwhand || row.throws || 'R',
            batHand: row.bathand || row.bats || 'R',
          };

          // Fielder attributes with letter grade support
          const fielderAttrs = ['hitforavg', 'contact', 'power', 'speed', 'runspeed', 'arm', 
            'armstrength', 'fielding', 'errorresistance', 'clutch', 'vslhp', 'grit', 
            'stealing', 'running', 'throwing', 'recovery', 'catcherability'];
          
          // Map CSV headers to schema fields
          const attrMap: Record<string, string> = {
            'contact': 'hitForAvg', 'hitforavg': 'hitForAvg',
            'power': 'power',
            'speed': 'speed', 'runspeed': 'speed',
            'arm': 'arm', 'armstrength': 'arm',
            'fielding': 'fielding',
            'errorresistance': 'errorResistance',
            'clutch': 'clutch',
            'vslhp': 'vsLHP', 'vsleft': 'vsLHP',
            'grit': 'grit',
            'stealing': 'stealing',
            'running': 'running',
            'throwing': 'throwing',
            'recovery': 'recovery',
            'catcherability': 'catcherAbility', 'catcher': 'catcherAbility'
          };

          // Process fielder attributes
          for (const [csvKey, schemaKey] of Object.entries(attrMap)) {
            if (row[csvKey]) {
              const val = row[csvKey];
              recruit[schemaKey] = /^[A-Ga-g]$/.test(val) 
                ? letterGradeToNumeric(val) 
                : parseInt(val) || 50;
            }
          }

          // Pitcher attributes with letter grade support
          const pitcherAttrMap: Record<string, string> = {
            'velocity': 'velocity', 'velo': 'velocity',
            'control': 'control',
            'stamina': 'stamina',
            'stuff': 'stuff', 'pitchmix': 'stuff',
            'wrisp': 'wRISP', 'risp': 'wRISP',
            'vslefty': 'vsLefty',
            'poise': 'poise',
            'heater': 'heater',
            'agile': 'agile'
          };

          // Process pitcher attributes
          for (const [csvKey, schemaKey] of Object.entries(pitcherAttrMap)) {
            if (row[csvKey]) {
              const val = row[csvKey];
              recruit[schemaKey] = /^[A-Ga-g]$/.test(val) 
                ? letterGradeToNumeric(val) 
                : parseInt(val) || 50;
            }
          }

          // Priority fields (text values: Not, Somewhat, Very, Extremely)
          const priorityMap: Record<string, string> = {
            'proximitypriority': 'proximityPriority', 'proximity': 'proximityPriority',
            'reputationpriority': 'reputationPriority', 'reputation': 'reputationPriority', 'coachreputation': 'reputationPriority',
            'playingtimepriority': 'playingTimePriority', 'playingtime': 'playingTimePriority',
            'academicspriority': 'academicsPriority', 'academics': 'academicsPriority',
            'prestigepriority': 'prestigePriority', 'prestige': 'prestigePriority', 'schoolprestige': 'prestigePriority',
            'facilitiespriority': 'facilitiesPriority', 'facilities': 'facilitiesPriority'
          };
          
          for (const [csvKey, schemaKey] of Object.entries(priorityMap)) {
            if (row[csvKey]) {
              const val = row[csvKey].toLowerCase();
              // Map possible values to standard format
              let priority = 'Somewhat';
              if (val.includes('not') || val === 'n') priority = 'Not';
              else if (val.includes('extremely') || val === 'e') priority = 'Extremely';
              else if (val.includes('very') || val === 'v') priority = 'Very';
              else if (val.includes('somewhat') || val === 's') priority = 'Somewhat';
              recruit[schemaKey] = priority;
            }
          }
          
          // Special abilities (comma-separated list)
          if (row.abilities || row.specialabilities) {
            const abilitiesStr = row.abilities || row.specialabilities;
            recruit.abilities = abilitiesStr.split(',').map((a: string) => a.trim()).filter((a: string) => a);
          }
          
          // Boolean flags
          if (row.isbluechip || row.bluechip) {
            recruit.isBlueChip = ['true', '1', 'yes', 'y'].includes((row.isbluechip || row.bluechip).toLowerCase());
          }
          if (row.isgem || row.gem) {
            recruit.isGem = ['true', '1', 'yes', 'y'].includes((row.isgem || row.gem).toLowerCase());
          }
          if (row.isbust || row.bust) {
            recruit.isBust = ['true', '1', 'yes', 'y'].includes((row.isbust || row.bust).toLowerCase());
          }
          
          // Appearance
          if (row.skintone) recruit.skinTone = row.skintone;
          if (row.haircolor) recruit.hairColor = row.haircolor;
          if (row.hairstyle) recruit.hairStyle = row.hairstyle;

          // Recalculate OVR from attributes using the formula
          recruit.overall = calculateOVR(recruit);
          recruit.starRating = getStarRatingFromOVR(recruit.overall);
          recruit.starRank = recruit.starRating;

          await storage.createRecruit(recruit);
          recruitCount++;
        }

        await storage.createAuditLog({
          leagueId: league.id,
          userId: req.session.userId,
          action: "Recruiting Class Imported",
          details: `Imported ${recruitCount} recruits from CSV file`,
        });
      } else {
        // Generate new recruiting class scaled to league size
        // forceStorylineReset=true: commissioner-initiated generation, so existing storyline data
        // for this season is wiped and rebuilt for the newly generated recruits.
        const importTeams = await storage.getTeamsByLeague(req.params.id as string);
        recruitCount = getRecruitPoolSize(importTeams.length);
        await generateRecruits(req.params.id as string, recruitCount, true);

        await storage.createAuditLog({
          leagueId: league.id,
          userId: req.session.userId,
          action: "Recruiting Class Imported",
          details: `Generated ${recruitCount} new recruits for the recruiting class`,
        });
      }

      res.json({
        success: true,
        count: recruitCount,
        storylineReset: true,
        storylineResetWarning: "Existing storyline arcs and events for this season were wiped and rebuilt for the new recruiting class.",
      });
    } catch (error) {
      console.error("Failed to import recruiting class:", error);
      res.status(500).json({ message: "Failed to import recruiting class" });
    }
  });

  // ─── Recruiting Wizard Endpoints ───────────────────────────────────────────

  // League-agnostic generate endpoint — works without a league (no auth required)
  app.post("/api/recruiting/generate-preview", async (req, res) => {
    try {
      const { config } = req.body as { config: any };
      if (!config) return res.status(400).json({ message: "config required" });
      const theme = (config.theme as RecruitingTheme) || "balanced";
      const count = Math.min(Math.max(Number(config.count) || 80, 20), 80);
      const fogDensity: number = Math.min(100, Math.max(0, Number(config.fogDensity ?? 100)));
      // Forward OVR controls as a unit: if any field differs from defaults, send all four
      // so the generator receives the correct average even when only distribution or range changes.
      const wOvrMin  = config.ovrMin  != null ? Number(config.ovrMin)  : 150;
      const wOvrMax  = config.ovrMax  != null ? Number(config.ovrMax)  : 650;
      const wOvrAvg  = config.ovrAverage != null ? Number(config.ovrAverage) : 300;
      const wOvrDist = config.ovrDistribution || "bell";
      const hasOvrChanges = wOvrMin !== 150 || wOvrMax !== 650 || wOvrAvg !== 300 || wOvrDist !== "bell";
      const recruits = generateRecruitClass(count, {
        theme,
        wizardStarDistribution: config.starDistribution,
        wizardSpecialCounts: config.specialCounts,
        wizardPositionDistribution: config.positionDistribution,
        wizardRegionSkew: config.regionSkew || "none",
        ...(hasOvrChanges ? {
          wizardOvrMin: wOvrMin,
          wizardOvrMax: wOvrMax,
          wizardOvrAverage: wOvrAvg,
          wizardOvrDistribution: wOvrDist as "bell" | "top_heavy" | "bottom_heavy" | "flat",
        } : {}),
      });
      const initialScoutingLevel = Math.round((1 - fogDensity / 100) * 100);
      const recruitsWithFog = recruits.map(r => ({ ...r, scoutingLevel: initialScoutingLevel }));
      res.json({ recruits: recruitsWithFog });
    } catch (error) {
      console.error("Failed to generate wizard preview:", error);
      res.status(500).json({ message: "Failed to generate class" });
    }
  });

  // League-agnostic reroll endpoint — works without a league (no auth required)
  app.post("/api/recruiting/reroll-single", async (req, res) => {
    try {
      const { theme = "balanced", forcedType } = req.body as { theme?: string; forcedType?: any };
      const recruits = generateRecruitClass(1, {
        theme: (theme as RecruitingTheme) || "balanced",
        wizardForcedType: forcedType,
      });
      res.json({ recruit: recruits[0] });
    } catch (error) {
      console.error("Failed to reroll single recruit:", error);
      res.status(500).json({ message: "Failed to reroll recruit" });
    }
  });

  // Generate a class preview from wizard config (no DB write)
  app.post("/api/leagues/:id/recruiting/generate-wizard", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const { config } = req.body as { config: any };
      if (!config) return res.status(400).json({ message: "config required" });

      const theme = (config.theme as RecruitingTheme) || "balanced";
      const count = Math.min(Math.max(Number(config.count) || 80, 20), 80);
      const fogDensity: number = Math.min(100, Math.max(0, Number(config.fogDensity ?? 100)));

      // Forward OVR controls as a unit: if any field differs from defaults, send all four
      // so the generator receives the correct average even when only distribution or range changes.
      const wOvrMin2  = config.ovrMin  != null ? Number(config.ovrMin)  : 150;
      const wOvrMax2  = config.ovrMax  != null ? Number(config.ovrMax)  : 650;
      const wOvrAvg2  = config.ovrAverage != null ? Number(config.ovrAverage) : 300;
      const wOvrDist2 = config.ovrDistribution || "bell";
      const hasOvrChanges2 = wOvrMin2 !== 150 || wOvrMax2 !== 650 || wOvrAvg2 !== 300 || wOvrDist2 !== "bell";
      const recruits = generateRecruitClass(count, {
        theme,
        wizardStarDistribution: config.starDistribution,
        wizardSpecialCounts: config.specialCounts,
        wizardPositionDistribution: config.positionDistribution,
        wizardRegionSkew: config.regionSkew || "none",
        ...(hasOvrChanges2 ? {
          wizardOvrMin: wOvrMin2,
          wizardOvrMax: wOvrMax2,
          wizardOvrAverage: wOvrAvg2,
          wizardOvrDistribution: wOvrDist2 as "bell" | "top_heavy" | "bottom_heavy" | "flat",
        } : {}),
      });

      // Apply fog density: 100% = fully hidden (scoutingLevel=0), 0% = fully revealed (scoutingLevel=100)
      const initialScoutingLevel = Math.round((1 - fogDensity / 100) * 100);
      const recruitsWithFog = recruits.map(r => ({ ...r, scoutingLevel: initialScoutingLevel }));

      res.json({ recruits: recruitsWithFog });
    } catch (error) {
      console.error("Failed to generate wizard class:", error);
      res.status(500).json({ message: "Failed to generate class" });
    }
  });

  // Reroll a single recruit with type constraints (no DB write)
  app.post("/api/leagues/:id/recruiting/reroll-recruit", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const { theme = "balanced", forcedType } = req.body as { theme?: string; forcedType?: any };

      const recruits = generateRecruitClass(1, {
        theme: (theme as RecruitingTheme) || "balanced",
        wizardForcedType: forcedType,
      });

      res.json({ recruit: recruits[0] });
    } catch (error) {
      console.error("Failed to reroll recruit:", error);
      res.status(500).json({ message: "Failed to reroll recruit" });
    }
  });

  // Save wizard class to DB (deletes existing + batch creates)
  app.post("/api/leagues/:id/recruiting/save-wizard-class", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const { recruits } = req.body as { recruits: any[] };
      if (!Array.isArray(recruits) || recruits.length === 0) {
        return res.status(400).json({ message: "recruits array required" });
      }

      await storage.deleteRecruitsByLeague(req.params.id as string);

      const leagueId = req.params.id as string;
      const createdRecruits = await storage.batchCreateRecruits(
        recruits.map((r: any) => ({ ...r, leagueId }))
      );

      if (createdRecruits.length !== recruits.length) {
        return res.status(500).json({
          message: `Save incomplete: only ${createdRecruits.length} of ${recruits.length} recruits were saved. Please try again.`,
        });
      }

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Recruiting Class Created (Wizard)",
        details: `Commissioner created a recruiting class of ${createdRecruits.length} recruits via the class wizard`,
      });

      res.json({ success: true, count: createdRecruits.length });
    } catch (error) {
      console.error("Failed to save wizard class:", error);
      res.status(500).json({ message: "Failed to save class" });
    }
  });

  // Load a saved recruiting class into a league (replaces current recruit pool)
  app.post("/api/leagues/:id/recruiting/load-saved-class", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Commissioner only" });
      }
      const { savedClassId } = req.body as { savedClassId: string };
      if (!savedClassId) return res.status(400).json({ message: "savedClassId required" });

      const savedClass = await storage.getSavedRecruitingClass(String(savedClassId));
      if (!savedClass) return res.status(404).json({ message: "Saved class not found" });
      if (savedClass.userId && savedClass.userId !== req.session.userId) {
        return res.status(403).json({ message: "You do not own this saved class" });
      }

      const raw = savedClass.classData as any;
      const classData: any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.recruits) ? raw.recruits : []);
      if (classData.length === 0) {
        return res.status(400).json({ message: "Saved class has no recruits" });
      }

      const leagueId = req.params.id as string;
      await storage.deleteRecruitsByLeague(leagueId);

      const createdRecruits = await storage.batchCreateRecruits(
        classData.map((r: any) => {
          const { id, leagueId: _lid, ...rest } = r;
          return { ...rest, leagueId };
        })
      );

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Recruiting Class Loaded",
        details: `Commissioner loaded saved class "${savedClass.name}" (${createdRecruits.length} recruits)`,
      });

      res.json({ success: true, count: createdRecruits.length, className: savedClass.name });
    } catch (error) {
      console.error("Failed to load saved class:", error);
      res.status(500).json({ message: "Failed to load saved class" });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────

  app.patch("/api/leagues/:id/deadline", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can set a deadline" });
      }
      const { deadline } = req.body;
      const phaseDeadline = deadline ? new Date(deadline) : null;
      if (phaseDeadline && isNaN(phaseDeadline.getTime())) {
        return res.status(400).json({ message: "Invalid deadline date" });
      }
      const updated = await storage.updateLeague(req.params.id as string, { phaseDeadline });
      res.json(updated);
    } catch (error) {
      console.error("Failed to update deadline:", error);
      res.status(500).json({ message: "Failed to update deadline" });
    }
  });

  app.patch("/api/leagues/:id/settings", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can change league settings" });
      }
      const result = settingsSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid settings data" });
      }
      
      const updateData: Record<string, any> = {};
      if (result.data.auditLogPublic !== undefined) updateData.auditLogPublic = result.data.auditLogPublic;
      if (result.data.cpuDifficulty !== undefined) updateData.cpuDifficulty = result.data.cpuDifficulty;
      if (result.data.cpuRecruitingAggression !== undefined) updateData.cpuRecruitingAggression = result.data.cpuRecruitingAggression;
      if (result.data.emailDigestsEnabled !== undefined) updateData.emailDigestsEnabled = result.data.emailDigestsEnabled;
      const updated = await storage.updateLeague(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.patch("/api/leagues/:id/co-commissioners", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the primary commissioner can manage delegates" });
      }
      const { userId, action } = req.body as { userId: string; action: "add" | "remove" };
      if (!userId || !["add", "remove"].includes(action)) {
        return res.status(400).json({ message: "userId and action (add|remove) are required" });
      }
      if (userId === league.commissionerId) {
        return res.status(400).json({ message: "The primary commissioner cannot be a co-commissioner" });
      }
      // Verify target user is a coach in this league
      const coaches = await storage.getCoachesByLeague(league.id);
      const targetCoach = coaches.find(c => c.userId === userId);
      if (!targetCoach) {
        return res.status(400).json({ message: "Target user is not a coach in this league" });
      }
      const current: string[] = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
      let updated: string[];
      if (action === "add") {
        updated = current.includes(userId) ? current : [...current, userId];
      } else {
        updated = current.filter(id => id !== userId);
      }
      const updatedLeague = await storage.updateLeague(league.id, { coCommissionerIds: updated });
      const targetCoachName = `${targetCoach.firstName} ${targetCoach.lastName}`;
      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: action === "add" ? "Delegate Added" : "Delegate Removed",
        details: `${targetCoachName} was ${action === "add" ? "granted" : "revoked"} co-commissioner access`,
      });
      res.json(updatedLeague);
    } catch (error) {
      console.error("Failed to update co-commissioners:", error);
      res.status(500).json({ message: "Failed to update co-commissioners" });
    }
  });

  app.delete("/api/leagues/:id", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can delete a league" });
      }
      
      await storage.deleteLeague(leagueId);
      res.json({ message: "League deleted" });
    } catch (error) {
      console.error("Failed to delete league:", error);
      res.status(500).json({ message: "Failed to delete league" });
    }
  });

  // League invite routes
  app.post("/api/leagues/:id/invites", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can generate invite links" });
      }

      const { label, expiresIn } = req.body || {};

      // Parse optional expiry duration like "24h", "3d", "7d"
      let expiresAt: Date | undefined;
      if (expiresIn) {
        const match = String(expiresIn).match(/^(\d+)(h|d)$/);
        if (!match) {
          return res.status(400).json({ message: "Invalid expiry format. Use values like '24h', '3d', '7d'." });
        }
        const amount = parseInt(match[1]);
        const ms = match[2] === "h" ? amount * 3_600_000 : amount * 86_400_000;
        expiresAt = new Date(Date.now() + ms);
      }

      let inviteCode: string;
      let attempts = 0;
      do {
        inviteCode = crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase();
        const existing = await storage.getLeagueInviteByCode(inviteCode);
        if (!existing) break;
        attempts++;
      } while (attempts < 5);
      
      if (attempts >= 5) {
        return res.status(500).json({ message: "Failed to generate unique invite code" });
      }

      const invite = await storage.createLeagueInvite({
        leagueId: league.id,
        inviteCode,
        invitedById: req.session.userId!,
        label: label || null,
        expiresAt: expiresAt ?? null,
      });

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Invite Link Created",
        details: `Generated invite link: ${inviteCode}${label ? ` (${label})` : ""}`,
      });

      res.json(invite);
    } catch (error) {
      console.error("Failed to create invite:", error);
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  app.get("/api/invites/:code", async (req, res) => {
    try {
      const invite = await storage.getLeagueInviteByCode(req.params.code);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }
      
      if (invite.status !== "pending") {
        const statusMsg = invite.status === "accepted" ? "This invite link has already been used" 
          : invite.status === "revoked" ? "This invite link has been revoked by the commissioner"
          : "This invite link is no longer valid";
        return res.status(400).json({ message: statusMsg });
      }

      if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) {
        return res.status(400).json({ message: "This invite link has expired" });
      }

      const league = await storage.getLeague(invite.leagueId);
      const teams = await storage.getTeamsByLeague(invite.leagueId);
      const availableTeams = teams.filter(t => t.isCpu); // Only show CPU teams as available

      res.json({
        invite,
        league,
        availableTeams,
      });
    } catch (error) {
      console.error("Failed to fetch invite:", error);
      res.status(500).json({ message: "Failed to fetch invite" });
    }
  });

  app.post("/api/invites/:code/accept", requireAuth, async (req, res) => {
    try {
      const invite = await storage.getLeagueInviteByCode(req.params.code);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ message: "This invite link has already been used or revoked" });
      }

      if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) {
        return res.status(400).json({ message: "This invite link has expired" });
      }

      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const existingTeams = await storage.getTeamsByLeague(invite.leagueId);
      const teamsWithCoaches = existingTeams.filter(t => t.coachId);
      const coaches = await Promise.all(
        teamsWithCoaches.map(t => storage.getCoach(t.coachId!))
      );
      const alreadyCoaching = coaches.some(c => c && c.userId === userId);
      if (alreadyCoaching) {
        return res.status(400).json({ message: "You are already a coach in this league" });
      }

      const { teamId, coachData } = req.body;
      if (!teamId) {
        return res.status(400).json({ message: "Team selection is required" });
      }

      // Check if team is still available (CPU team)
      const team = await storage.getTeam(teamId);
      if (!team || !team.isCpu) {
        return res.status(400).json({ message: "This team is not available" });
      }

      // Verify team belongs to this league
      if (team.leagueId !== invite.leagueId) {
        return res.status(400).json({ message: "Invalid team selection" });
      }

      // Create a coach for the user if coach data is provided
      let coachId = null;
      if (coachData) {
        const coach = await storage.createCoach({
          firstName: coachData.firstName || "New",
          lastName: coachData.lastName || "Coach",
          leagueId: invite.leagueId,
          teamId,
          archetype: coachData.archetype || "Balanced",
          userId: req.session.userId!,
          scoutingSkill: 1,
          evaluationSkill: 1,
          pitchingRecruitingSkill: 1,
          hittingRecruitingSkill: 1,
          skinTone: coachData.skinTone || "light",
          hairColor: coachData.hairColor || "brown",
          hairStyle: coachData.hairStyle || "short",
        });
        try { await ensureCoachTraits(coach, 1); } catch (traitErr) {
          console.error("[inviteJoin] ensureCoachTraits (with data) failed:", traitErr);
        }
        coachId = coach.id;
      } else {
        // Create default coach if no data provided
        const coach = await storage.createCoach({
          firstName: "New",
          lastName: "Coach",
          leagueId: invite.leagueId,
          teamId,
          archetype: "Balanced",
          userId: req.session.userId!,
          scoutingSkill: 1,
          evaluationSkill: 1,
          pitchingRecruitingSkill: 1,
          hittingRecruitingSkill: 1,
        });
        try { await ensureCoachTraits(coach, 1); } catch (traitErr) {
          console.error("[inviteJoin] ensureCoachTraits (default) failed:", traitErr);
        }
        coachId = coach.id;
      }

      // Update the invite
      await storage.updateLeagueInvite(invite.id, {
        status: "accepted",
        teamId,
        acceptedById: req.session.userId,
      });

      // Mark the team as human-controlled and assign coach
      await storage.updateTeam(teamId, {
        isCpu: false,
        coachId,
      });

      await storage.createAuditLog({
        leagueId: invite.leagueId,
        userId: req.session.userId,
        action: "Invite Accepted",
        details: `${user.email || "A player"} joined the league and selected ${team.name}`,
      });

      res.json({ success: true, leagueId: invite.leagueId, teamId });
    } catch (error) {
      console.error("Failed to accept invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  app.post("/api/invites/:code/revoke", requireAuth, async (req, res) => {
    try {
      const invite = await storage.getLeagueInviteByCode(req.params.code);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }

      const league = await storage.getLeague(invite.leagueId);
      if (!league || league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can revoke invites" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ message: "Only pending invites can be revoked" });
      }

      await storage.updateLeagueInvite(invite.id, { status: "revoked" });

      await storage.createAuditLog({
        leagueId: invite.leagueId,
        userId: req.session.userId,
        action: "Invite Revoked",
        details: `Revoked invite link: ${invite.inviteCode}`,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to revoke invite:", error);
      res.status(500).json({ message: "Failed to revoke invite" });
    }
  });

  // Team routes
  app.get("/api/leagues/:id/teams/:teamId", requireAuth, async (req, res) => {
    try {
      const team = await storage.getTeam(req.params.teamId as string);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const coach = team.coachId ? await storage.getCoach(team.coachId) : undefined;
      const teamPlayers = await storage.getPlayersByTeam(team.id);
      const teamGames = await storage.getGamesByTeam(team.id);
      const allTeams = await storage.getTeamsByLeague(req.params.id as string);

      // Enrich games with team info
      const gamesWithTeams = teamGames.map(game => {
        const homeTeam = allTeams.find(t => t.id === game.homeTeamId);
        const awayTeam = allTeams.find(t => t.id === game.awayTeamId);
        return {
          ...game,
          homeTeam: homeTeam ? { name: homeTeam.name, abbreviation: homeTeam.abbreviation } : undefined,
          awayTeam: awayTeam ? { name: awayTeam.name, abbreviation: awayTeam.abbreviation } : undefined,
        };
      });

      // Calculate record
      let wins = 0, losses = 0, conferenceWins = 0, conferenceLosses = 0;
      teamGames.forEach(game => {
        if (game.homeScore !== null && game.awayScore !== null) {
          const isHome = game.homeTeamId === team.id;
          const ourScore = isHome ? game.homeScore : game.awayScore;
          const theirScore = isHome ? game.awayScore : game.homeScore;
          if (ourScore > theirScore) {
            wins++;
            if (game.isConferenceGame) conferenceWins++;
          } else {
            losses++;
            if (game.isConferenceGame) conferenceLosses++;
          }
        }
      });

      res.json({
        ...team,
        coach,
        players: teamPlayers,
        games: gamesWithTeams,
        record: { wins, losses, conferenceWins, conferenceLosses },
      });
    } catch (error) {
      console.error("Failed to fetch team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  // Program profile endpoint
  app.get("/api/leagues/:id/teams/:teamId/program-profile", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const teamId = req.params.teamId as string;

      const [team, league, allTeams] = await Promise.all([
        storage.getTeam(teamId),
        storage.getLeague(leagueId),
        storage.getTeamsByLeague(leagueId),
      ]);

      if (!team || !league) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Security: ensure team belongs to this league
      if (team.leagueId !== leagueId) {
        return res.status(403).json({ message: "Team does not belong to this league" });
      }

      const [coach, conferences, teamStandings, allLeagueStandings, teamHistory, teamGames, currentRoster] = await Promise.all([
        team.coachId ? storage.getCoach(team.coachId) : Promise.resolve(undefined),
        storage.getConferencesByLeague(leagueId),
        storage.getStandingsByTeam(teamId),
        storage.getAllStandingsByLeague(leagueId),
        storage.getPlayerHistoryByTeam(teamId),
        storage.getGamesByTeam(teamId),
        storage.getPlayersByTeam(teamId),
      ]);

      // Determine if the coach is the commissioner
      const isCommissioner = !!(coach?.userId && league.commissionerId === coach.userId);
      // Commissioner tenure: seasons they've served (best proxy — full league run)
      const commissionerSeasons = isCommissioner ? league.currentSeason : 0;

      // Conference for this team
      const teamConferenceId = team.conferenceId;

      // Compute all-time W/L from completed regular-season and postseason game results
      // (standings can exclude certain phases; game results are the authoritative source)
      let allTimeWins = 0;
      let allTimeLosses = 0;
      for (const game of teamGames) {
        if (!game.isComplete) continue;
        const isHome = game.homeTeamId === teamId;
        const ourScore = isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
        const theirScore = isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
        if (ourScore > theirScore) allTimeWins++;
        else allTimeLosses++;
      }

      // Group all league standings by season for conference finish calculation
      const standingsBySeason: Record<number, typeof allLeagueStandings> = {};
      for (const s of allLeagueStandings) {
        if (!standingsBySeason[s.season]) standingsBySeason[s.season] = [];
        standingsBySeason[s.season].push(s);
      }

      // Build team lookup for conference filtering
      const teamConferenceMap: Record<string, string | null> = {};
      for (const t of allTeams) {
        teamConferenceMap[t.id] = t.conferenceId;
      }

      // Determine postseason outcomes per season from team games
      interface PostseasonGames {
        confChamp: { played: boolean; won: boolean };
        superRegionals: { played: boolean; won: boolean };
        cws: { played: boolean; won: boolean };
      }
      const postseasonBySeason: Record<number, PostseasonGames> = {};
      for (const game of teamGames) {
        if (!game.isComplete) continue;
        const phase = game.phase;
        if (!["conference_championship", "super_regionals", "cws"].includes(phase)) continue;
        const season = game.season;
        if (!postseasonBySeason[season]) {
          postseasonBySeason[season] = {
            confChamp: { played: false, won: false },
            superRegionals: { played: false, won: false },
            cws: { played: false, won: false },
          };
        }
        const isHome = game.homeTeamId === teamId;
        const ourScore = isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
        const theirScore = isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
        const won = ourScore > theirScore;
        if (phase === "conference_championship") {
          postseasonBySeason[season].confChamp.played = true;
          if (won) postseasonBySeason[season].confChamp.won = true;
        } else if (phase === "super_regionals") {
          postseasonBySeason[season].superRegionals.played = true;
          if (won) postseasonBySeason[season].superRegionals.won = true;
        } else if (phase === "cws") {
          postseasonBySeason[season].cws.played = true;
          if (won) postseasonBySeason[season].cws.won = true;
        }
      }

      // Detect CWS champion: CWS is best-of-3, champion wins 2 games total.
      // Track wins/losses per season from this team's CWS games.
      const cwsWinsBySeasonCount: Record<number, { wins: number; losses: number }> = {};
      for (const game of teamGames) {
        if (!game.isComplete || game.phase !== "cws") continue;
        if (!cwsWinsBySeasonCount[game.season]) cwsWinsBySeasonCount[game.season] = { wins: 0, losses: 0 };
        const isHome = game.homeTeamId === teamId;
        const ourScore = isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
        const theirScore = isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
        if (ourScore > theirScore) cwsWinsBySeasonCount[game.season].wins++;
        else cwsWinsBySeasonCount[game.season].losses++;
      }

      // Current season stat block (may be in-progress)
      const currentStanding = teamStandings.find(s => s.season === league.currentSeason);
      const currentSeasonStats = currentStanding ? {
        season: currentStanding.season,
        wins: currentStanding.wins,
        losses: currentStanding.losses,
        confWins: currentStanding.conferenceWins,
        confLosses: currentStanding.conferenceLosses,
      } : null;

      // Build season history — only completed seasons (season < currentSeason)
      const completedStandings = teamStandings.filter(s => s.season < league.currentSeason);
      const seasonHistory = completedStandings.map((standing) => {
        const season = standing.season;

        // Conference finish
        const seasonStandings = standingsBySeason[season] || [];
        const confTeamStandings = seasonStandings
          .filter(s => teamConferenceMap[s.teamId] === teamConferenceId)
          .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.losses - b.losses;
          });
        const confFinish = confTeamStandings.findIndex(s => s.teamId === teamId) + 1 || null;

        // Postseason result label
        const ps = postseasonBySeason[season];
        let postseasonResult = "—";
        if (ps) {
          const cwsRecord = cwsWinsBySeasonCount[season];
          if (ps.cws.played) {
            // CWS champion wins 2 games in best-of-3 format
            if (cwsRecord && cwsRecord.wins >= 2) {
              postseasonResult = "CWS Champion";
            } else {
              postseasonResult = "CWS";
            }
          } else if (ps.superRegionals.played) {
            postseasonResult = "Super Regionals";
          } else if (ps.confChamp.played) {
            postseasonResult = "Conf. Champ.";
          }
        }

        return {
          season,
          wins: standing.wins,
          losses: standing.losses,
          confWins: standing.conferenceWins,
          confLosses: standing.conferenceLosses,
          confFinish,
          postseasonResult,
        };
      }).sort((a, b) => b.season - a.season);

      // Aggregate postseason milestones
      const confChampAppearances = Object.values(postseasonBySeason).filter(ps => ps.confChamp.played).length;
      const confChampionships = Object.values(postseasonBySeason).filter(ps => ps.confChamp.won).length;
      const superRegionalsAppearances = Object.values(postseasonBySeason).filter(ps => ps.superRegionals.played).length;
      const cwsAppearances = Object.values(postseasonBySeason).filter(ps => ps.cws.played).length;
      // CWS champion: won at least 2 CWS games (best-of-3)
      const cwsTitles = Object.values(cwsWinsBySeasonCount).filter(r => r.wins >= 2).length;

      // Recruiting Hall of Fame — top 5 all-time players ever on this roster, ranked by signing-time OVR.
      // signingOvr is captured in finalizeSigningDay when a recruit converts to a player, and is copied
      // into player_history when the player departs. This is the authoritative pre-development baseline.
      // Falls back to departure/current OVR for pre-migration rows where signingOvr is null.
      // Excluded: players who were cut and sent to JUCO (departureType = cut_juco).
      const departureStatusMap: Record<string, string> = {
        graduated: "graduated",
        draft: "drafted",
        transfer_portal: "transferred",
        transfer_signed: "transferred",
        transfer_juco: "transferred",
      };

      const activePlayerEntries = currentRoster
        .filter(p => !p.inTransferPortal)
        .map(p => ({
          firstName: p.firstName,
          lastName: p.lastName,
          position: p.position,
          overall: p.overall,
          signingOvr: p.signingOvr ?? p.overall,
          starRating: p.starRating,
          status: "active" as const,
          draftRound: null as number | null,
          season: null as number | null,
          abilities: (p.abilities ?? []) as string[],
        }));

      const historicPlayerEntries = teamHistory
        .filter(p => p.departureType !== "cut_juco")
        .map(p => ({
          firstName: p.firstName,
          lastName: p.lastName,
          position: p.position,
          overall: p.overall,
          signingOvr: p.signingOvr ?? p.overall,
          starRating: p.starRating,
          status: (departureStatusMap[p.departureType] ?? p.departureType) as string,
          draftRound: p.draftRound,
          season: p.departedSeason,
          abilities: (p.abilities ?? []) as string[],
        }));

      const hofPlayers = [...activePlayerEntries, ...historicPlayerEntries]
        .sort((a, b) => b.signingOvr - a.signingOvr)
        .slice(0, 5);

      // Top drafted players: combine player_history + active roster players with draftRound set
      // Sorted by draft round asc then OVR desc — no arbitrary cap
      const activeDraftedPlayers = currentRoster
        .filter(p => p.draftRound != null)
        .map(p => ({
          firstName: p.firstName,
          lastName: p.lastName,
          position: p.position,
          overall: p.overall,
          starRating: p.starRating,
          draftRound: p.draftRound as number,
          departedSeason: league.currentSeason,
        }));
      const historicDraftedPlayers = teamHistory
        .filter(p => p.draftRound != null)
        .map(p => ({
          firstName: p.firstName,
          lastName: p.lastName,
          position: p.position,
          overall: p.overall,
          starRating: p.starRating,
          draftRound: p.draftRound as number,
          departedSeason: p.departedSeason,
        }));
      const draftedPlayers = [...activeDraftedPlayers, ...historicDraftedPlayers]
        .sort((a, b) => a.draftRound - b.draftRound || b.overall - a.overall);

      res.json({
        team: {
          id: team.id,
          name: team.name,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          mascot: team.mascot,
          prestige: team.prestige,
          isCpu: team.isCpu,
          conferenceName: conferences.find(c => c.id === team.conferenceId)?.name ?? null,
        },
        coach: coach ? {
          id: coach.id,
          firstName: coach.firstName,
          lastName: coach.lastName,
          archetype: coach.archetype,
          level: coach.level,
          xp: coach.xp,
          userId: coach.userId,
        } : null,
        isCommissioner,
        commissionerSeasons,
        currentSeason: league.currentSeason,
        allTimeWins,
        allTimeLosses,
        confChampAppearances,
        confChampionships,
        superRegionalsAppearances,
        cwsAppearances,
        cwsTitles,
        currentSeasonStats,
        seasonHistory,
        recruitingHoF: hofPlayers,
        topDraftedPlayers: draftedPlayers,
      });
    } catch (error) {
      console.error("Failed to fetch program profile:", error);
      res.status(500).json({ message: "Failed to fetch program profile" });
    }
  });

  // Single recruit route
  app.get("/api/leagues/:id/recruits/:recruitId", requireAuth, async (req, res) => {
    try {
      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      // Get user's team to find their interest in this recruit
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const userTeam = leagueTeams.find(t => !t.isCpu);
      
      let interest = null;
      if (userTeam) {
        interest = await storage.getRecruitingInterest(recruit.id, userTeam.id);
      }

      // Fetch stored top schools from database (only includes teams in the league)
      const teamMap = new Map(leagueTeams.map(t => [t.id, t]));
      const storedTopSchools = await storage.getRecruitTopSchools(recruit.id);
      const stage = (recruit.stage || "open").toLowerCase();
      const topSchoolsCount = stage === "top3" ? 3 : stage === "top5" ? 5 : 8;
      
      // Deduplicate by teamId, keeping the entry with the highest combined interest
      const dedupedDetail = new Map<string, typeof storedTopSchools[0]>();
      for (const ts of storedTopSchools) {
        if (!ts.isActive || !teamMap.has(ts.teamId)) continue;
        const existing = dedupedDetail.get(ts.teamId);
        if (!existing || (ts.interestLevel + ts.accumulatedInterest) > (existing.interestLevel + existing.accumulatedInterest)) {
          dedupedDetail.set(ts.teamId, ts);
        }
      }
      let topSchools = Array.from(dedupedDetail.values())
        .sort((a, b) => (a.rank || 99) - (b.rank || 99))
        .slice(0, topSchoolsCount)
        .map(ts => {
          const team = teamMap.get(ts.teamId)!;
          return {
            teamId: ts.teamId,
            teamName: team.name,
            abbreviation: team.abbreviation,
            primaryColor: team.primaryColor,
            interestLevel: ts.interestLevel + ts.accumulatedInterest,
          };
        })
        .sort((a, b) => b.interestLevel - a.interestLevel);
      
      // Fallback if no stored top schools
      if (topSchools.length === 0) {
        const seedFromId = (id: string) => {
          let hash = 0;
          for (let i = 0; i < id.length; i++) {
            hash = ((hash << 5) - hash) + id.charCodeAt(i);
            hash = hash & hash;
          }
          return Math.abs(hash);
        };
        const seed = seedFromId(recruit.id);
        const seededShuffle = <T,>(arr: T[], s: number): T[] => {
          const result = [...arr];
          for (let i = result.length - 1; i > 0; i--) {
            const j = (s * (i + 1)) % result.length;
            [result[i], result[j]] = [result[j], result[i]];
          }
          return result;
        };
        const shuffledTeams = seededShuffle(leagueTeams, seed).slice(0, topSchoolsCount);
        topSchools = shuffledTeams.map((team, idx) => ({
          teamId: team.id,
          teamName: team.name,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          interestLevel: Math.max(10, 100 - (idx * 10) - ((seed + idx) % 10)),
        })).sort((a, b) => b.interestLevel - a.interestLevel);
      }

      let actualPotential = recruit.potential;
      if (actualPotential == null) {
        actualPotential = rollWeightedPotential();
        storage.updateRecruit(recruit.id, { potential: actualPotential }).catch(() => {});
      }
      let dynamicPotentialFloor = recruit.potentialFloor;
      let dynamicPotentialCeiling = recruit.potentialCeiling;
      if (actualPotential != null && userTeam?.coachId) {
        const coach = await storage.getCoach(userTeam.coachId);
        if (coach) {
          const evalSkill = coach.evaluationSkill || 1;
          const dynRange = getPotentialRange(actualPotential, evalSkill);
          dynamicPotentialFloor = dynRange.floor;
          dynamicPotentialCeiling = dynRange.ceiling;
        }
      }

      const signedTeam = recruit.signedTeamId ? teamMap.get(recruit.signedTeamId) : null;
      res.json({
        recruit: {
          ...recruit,
          potential: actualPotential,
          potentialFloor: dynamicPotentialFloor,
          potentialCeiling: dynamicPotentialCeiling,
          interest,
          signedTeamName: signedTeam?.name ?? null,
          signedTeamAbbreviation: signedTeam?.abbreviation ?? null,
          signedTeamPrimaryColor: signedTeam?.primaryColor ?? null,
          signedTeamSecondaryColor: signedTeam?.secondaryColor ?? null,
        },
        topSchools,
      });
    } catch (error) {
      console.error("Failed to fetch recruit:", error);
      res.status(500).json({ message: "Failed to fetch recruit" });
    }
  });

  // Update recruit (commissioner only)
  app.patch("/api/leagues/:id/recruits/:recruitId", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can edit recruits" });
      }

      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      if (recruit.leagueId !== req.params.id) {
        return res.status(403).json({ message: "Recruit does not belong to this league" });
      }

      const allowedFields = [
        'firstName', 'lastName', 'position', 'hometown', 'homeState',
        'batHand', 'throwHand', 'recruitType', 'recruitYear',
        'skinTone', 'hairColor', 'hairStyle', 'headwear',
        'overall', 'starRating', 'classRank', 'positionRank',
        'isBlueChip', 'isGem', 'isBust', 'isGenerationalGem', 'isGenerationalBust',
        'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
        'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility',
        'velocity', 'control', 'stamina', 'stuff',
        'wRISP', 'vsLefty', 'poise', 'heater', 'agile',
        'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL',
        'abilities',
        'proximityPriority', 'reputationPriority', 'playingTimePriority',
        'academicsPriority', 'prestigePriority', 'facilitiesPriority', 'dealbreaker'
      ];

      const sanitizedData: Record<string, any> = {};
      for (const key of allowedFields) {
        if (key in req.body && key !== 'overall' && key !== 'starRating') {
          sanitizedData[key] = req.body[key];
        }
      }

      const mergedRecruit = { ...recruit, ...sanitizedData };
      sanitizedData['overall'] = calculateOVR(mergedRecruit);
      sanitizedData['starRating'] = getStarRatingFromOVR(sanitizedData['overall']);
      sanitizedData['starRank'] = sanitizedData['starRating'];

      const updated = await storage.updateRecruit(req.params.recruitId as string, sanitizedData);
      
      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Recruit Edited",
        details: `Edited recruit ${recruit.firstName} ${recruit.lastName}`,
      });

      res.json(updated);
    } catch (error) {
      console.error("Failed to update recruit:", error);
      res.status(500).json({ message: "Failed to update recruit" });
    }
  });

  // Batch update recruits (commissioner only)
  app.patch("/api/leagues/:id/recruits/batch", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can edit recruits" });
      }

      const { updates } = req.body as { updates: { id: string; changes: Record<string, unknown> }[] };
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }

      const allowedFields = [
        'firstName', 'lastName', 'position', 'hometown', 'homeState',
        'batHand', 'throwHand', 'recruitType', 'recruitYear',
        'skinTone', 'hairColor', 'hairStyle', 'headwear',
        'overall', 'starRating', 'classRank', 'positionRank',
        'isBlueChip', 'isGem', 'isBust', 'isGenerationalGem', 'isGenerationalBust',
        'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
        'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility',
        'velocity', 'control', 'stamina', 'stuff',
        'wRISP', 'vsLefty', 'poise', 'heater', 'agile',
        'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL',
        'abilities',
        'proximityPriority', 'reputationPriority', 'playingTimePriority',
        'academicsPriority', 'prestigePriority', 'facilitiesPriority', 'dealbreaker'
      ];

      const results = [];
      for (const update of updates) {
        const recruit = await storage.getRecruit(update.id);
        if (recruit && recruit.leagueId === req.params.id) {
          const sanitizedData: Record<string, unknown> = {};
          for (const key of allowedFields) {
            if (key in update.changes && key !== 'overall' && key !== 'starRating') {
              sanitizedData[key] = update.changes[key];
            }
          }
          const mergedRecruit = { ...recruit, ...sanitizedData };
          sanitizedData['overall'] = calculateOVR(mergedRecruit as any);
          sanitizedData['starRating'] = getStarRatingFromOVR(sanitizedData['overall'] as number);
          sanitizedData['starRank'] = sanitizedData['starRating'];
          const updated = await storage.updateRecruit(update.id, sanitizedData);
          results.push(updated);
        }
      }

      await storage.createAuditLog({
        leagueId: req.params.id as string,
        userId: req.session.userId,
        action: "Batch Recruit Edit",
        details: `Edited ${results.length} recruits via recruiting editor`,
      });

      res.json({ success: true, count: results.length });
    } catch (error) {
      console.error("Failed to batch update recruits:", error);
      res.status(500).json({ message: "Failed to batch update recruits" });
    }
  });

  // Dynasty Setup routes
  app.get("/api/leagues/:id/dynasty-setup", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId;
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      const teams = await storage.getTeamsByLeague(leagueId);
      const conferences = await storage.getConferencesByLeague(leagueId);
      const recruits = await storage.getRecruitsByLeague(leagueId);
      const games = await storage.getGamesByLeague(leagueId);
      const invites = await storage.getLeagueInvitesByLeague(leagueId);
      
      const teamsWithCoaches = await Promise.all(teams.map(async (team) => {
        const coach = team.coachId ? await storage.getCoach(team.coachId) : null;
        let user = null;
        if (coach?.userId) {
          const userData = await storage.getUser(coach.userId);
          user = userData ? { email: userData.email } : null;
        }
        return { ...team, coach, user };
      }));
      
      const isCommissioner = hasCommissionerAccess(league, userId);
      
      res.json({
        league,
        teams: teamsWithCoaches,
        conferences,
        invites,
        hasRecruits: recruits.length > 0,
        hasSchedule: games.length > 0,
        isCommissioner,
      });
    } catch (error) {
      console.error("Failed to fetch dynasty setup:", error);
      res.status(500).json({ message: "Failed to fetch dynasty setup" });
    }
  });

  // Start dynasty - changes phase from dynasty_setup to preseason
  app.post("/api/leagues/:id/start", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId;
      const { rosterId, recruitingClassId, perTeamRosters } = req.body || {};
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Only the commissioner can start dynasty" });
      }
      
      // Apply saved roster if specified (legacy single-roster format)
      if (rosterId) {
        const savedRoster = await storage.getSavedRoster(rosterId);
        if (savedRoster && savedRoster.userId === userId) {
          const rosterData = savedRoster.rosterData as any;
          if (rosterData?.teams) {
            const teams = await storage.getTeamsByLeague(leagueId);
            for (const teamData of rosterData.teams) {
              const matchingTeam = teams.find(t => t.name === teamData.teamName);
              if (matchingTeam && teamData.players) {
                const existingPlayers = await storage.getPlayersByTeam(matchingTeam.id);
                for (const p of existingPlayers) {
                  await storage.deletePlayer(p.id);
                }
                for (const playerData of teamData.players) {
                  await storage.createPlayer({
                    ...playerData,
                    teamId: matchingTeam.id,
                    leagueId,
                  });
                }
              }
            }
          }
        }
      }

      // Apply per-team saved rosters (map of teamName → savedRosterId)
      if (perTeamRosters && typeof perTeamRosters === "object") {
        const NUMERIC_ROSTER_ATTRS = [
          "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
          "velocity", "control", "stamina", "stuff", "clutch", "vsLHP", "grit",
          "stealing", "running", "throwing", "recovery", "wRISP", "vsLefty",
          "poise", "heater", "agile", "catcherAbility",
        ];
        const leagueTeams = await storage.getTeamsByLeague(leagueId);
        for (const [teamName, savedRosterId] of Object.entries(perTeamRosters as Record<string, string>)) {
          if (!savedRosterId) continue;
          const savedRoster = await storage.getSavedRoster(savedRosterId);
          if (!savedRoster || savedRoster.userId !== userId) continue;
          const matchingTeam = leagueTeams.find(t => t.name === teamName);
          if (!matchingTeam) continue;
          const savedPlayers = savedRoster.rosterData as any[];
          if (!Array.isArray(savedPlayers)) continue;
          const existingPlayers = await storage.getPlayersByTeam(matchingTeam.id);
          for (const sp of savedPlayers) {
            const existing = existingPlayers.find(
              p => p.firstName === sp.firstName && p.lastName === sp.lastName,
            );
            if (!existing) continue;
            const updates: Record<string, unknown> = {};
            for (const attr of NUMERIC_ROSTER_ATTRS) {
              if (typeof sp[attr] === "number") updates[attr] = sp[attr];
            }
            if (Array.isArray(sp.abilities)) updates.abilities = sp.abilities;
            if (Object.keys(updates).length > 0) {
              await storage.updatePlayer(existing.id, updates as any);
            }
          }
        }
      }
      
      // Generate CPU coaches for teams that don't have one
      await generateCpuCoaches(leagueId);
      
      // Apply saved recruiting class if specified, otherwise auto-generate
      const existingRecruits = await storage.getRecruitsByLeague(leagueId);
      if (existingRecruits.length === 0) {
        if (recruitingClassId) {
          const savedClass = await storage.getSavedRecruitingClass(recruitingClassId);
          if (savedClass && savedClass.userId === userId) {
            const classData = savedClass.classData as any;
            if (classData?.recruits) {
              for (const recruitData of classData.recruits) {
                await storage.createRecruit({
                  ...recruitData,
                  leagueId,
                });
              }
              // Saved-class path bypasses generateRecruits(), so storylines must be
              // initialized explicitly here to match the auto-generate path.
              // Fire-and-forget so the HTTP response is not delayed.
              initializeStorylineRecruits(leagueId, league.currentSeason)
                .then(n => console.log(`[storylines] initialized ${n} recruits for saved-class dynasty ${leagueId}`))
                .catch(err => console.error("[storylines] Failed to initialize for saved-class dynasty:", err));
            }
          }
        } else {
          const teams = await storage.getTeamsByLeague(leagueId);
          const recruitCount = getRecruitPoolSize(teams.length);
          await generateRecruits(leagueId, recruitCount);
        }
      }
      
      // Auto-generate schedule if not already present
      const existingGames = await storage.getGamesByLeague(leagueId);
      if (existingGames.length === 0) {
        await generateSchedule(leagueId);
      }
      
      await storage.updateLeague(leagueId, { currentPhase: "preseason" });
      
      await storage.createAuditLog({
        leagueId,
        userId: userId || "system",
        action: "start_dynasty",
        details: JSON.stringify({ 
          season: league.currentSeason,
          rosterId: rosterId || "default",
          recruitingClassId: recruitingClassId || "auto",
        }),
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to start dynasty:", error);
      res.status(500).json({ message: "Failed to start dynasty" });
    }
  });

  // Generate schedule
  app.post("/api/leagues/:id/schedule/generate", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId;
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Only the commissioner can generate schedule" });
      }
      
      await generateSchedule(leagueId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to generate schedule:", error);
      res.status(500).json({ message: "Failed to generate schedule" });
    }
  });

  // League Events (Activity Feed) routes
  app.get("/api/leagues/:id/events", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId as string;
      // Verify league exists and user is a member
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      const coaches = await storage.getCoachesByLeague(leagueId);
      const isMember = coaches.some(c => c.userId === userId) || league.commissionerId === userId;
      if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
      const eventType = req.query.type as string | undefined;
      const events = await storage.getLeagueEvents(leagueId, limit, eventType);
      res.json(events);
    } catch (error) {
      console.error("Failed to fetch league events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Decommit Alerts — DECOMMIT events scoped to a specific team for the current week
  app.get("/api/leagues/:id/decommit-alerts", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId!;
      const teamId = req.query.teamId as string;
      if (!teamId) return res.status(400).json({ message: "teamId required" });
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      const coaches = await storage.getCoachesByLeague(leagueId);
      const isCommissioner = hasCommissionerAccess(league, userId);
      const myCoach = coaches.find(c => c.userId === userId);
      if (!isCommissioner && !myCoach) return res.status(403).json({ message: "Not a member of this league" });
      if (!isCommissioner && myCoach?.teamId !== teamId) return res.status(403).json({ message: "Not authorized for this team" });
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const teamBelongsToLeague = leagueTeams.some(t => t.id === teamId);
      if (!teamBelongsToLeague) return res.status(403).json({ message: "Team does not belong to this league" });
      const events = await storage.getLeagueEventsByTeam(teamId, "DECOMMIT", 30);
      const filtered = events.filter(e => e.season === league.currentSeason && e.week >= league.currentWeek - 1);
      res.json(filtered);
    } catch (error) {
      console.error("Failed to fetch decommit alerts:", error);
      res.status(500).json({ message: "Failed to fetch decommit alerts" });
    }
  });

  // Dynasty News routes
  app.get("/api/leagues/:id/news", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const news = await storage.getDynastyNewsByLeague(leagueId);
      res.json(news);
    } catch (error) {
      console.error("Failed to fetch dynasty news:", error);
      res.status(500).json({ message: "Failed to fetch news" });
    }
  });

  app.post("/api/leagues/:id/news", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId;
      const { title, content, category, isSticky, imageUrl } = req.body;

      if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required" });
      }

      const user = await storage.getUser(userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const news = await storage.createDynastyNews({
        leagueId,
        authorId: userId,
        authorName: user.email.split("@")[0] || "Unknown",
        title,
        content,
        category: category || "general",
        imageUrl: imageUrl || null,
        isSticky: isSticky || false,
      });

      res.json(news);
    } catch (error) {
      console.error("Failed to create dynasty news:", error);
      res.status(500).json({ message: "Failed to create news" });
    }
  });

  app.delete("/api/leagues/:id/news/:newsId", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const newsId = req.params.newsId as string;
      const userId = req.session.userId;

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      if (!hasCommissionerAccess(league, userId)) {
        return res.status(403).json({ message: "Only the commissioner can delete news" });
      }

      await storage.deleteDynastyNews(newsId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete dynasty news:", error);
      res.status(500).json({ message: "Failed to delete news" });
    }
  });

  // === Saved Rosters API ===
  app.get("/api/saved-rosters", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rosters = await storage.getSavedRostersByUser(userId);
      res.json(rosters);
    } catch (error) {
      console.error("Failed to get saved rosters:", error);
      res.status(500).json({ message: "Failed to get saved rosters" });
    }
  });

  app.get("/api/saved-rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getSavedRoster(req.params.id as string);
      if (!roster) return res.status(404).json({ message: "Roster not found" });
      if (roster.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      res.json(roster);
    } catch (error) {
      console.error("Failed to get saved roster:", error);
      res.status(500).json({ message: "Failed to get saved roster" });
    }
  });

  app.post("/api/saved-rosters", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { name, description, basedOn, rosterData } = req.body;
      if (!name || !rosterData) return res.status(400).json({ message: "Name and roster data required" });
      const roster = await storage.createSavedRoster({ userId, name, description, basedOn: basedOn || "NCAA 2026", rosterData });
      res.json(roster);
    } catch (error) {
      console.error("Failed to create saved roster:", error);
      res.status(500).json({ message: "Failed to create saved roster" });
    }
  });

  app.patch("/api/saved-rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getSavedRoster(req.params.id as string);
      if (!roster) return res.status(404).json({ message: "Roster not found" });
      if (roster.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      const updated = await storage.updateSavedRoster(req.params.id as string, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update saved roster:", error);
      res.status(500).json({ message: "Failed to update saved roster" });
    }
  });

  app.delete("/api/saved-rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getSavedRoster(req.params.id as string);
      if (!roster) return res.status(404).json({ message: "Roster not found" });
      if (roster.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      await storage.deleteSavedRoster(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete saved roster:", error);
      res.status(500).json({ message: "Failed to delete saved roster" });
    }
  });

  // === Saved Recruiting Classes API ===
  app.get("/api/saved-recruiting-classes", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const classes = await storage.getSavedRecruitingClassesByUser(userId);
      res.json(classes);
    } catch (error) {
      console.error("Failed to get saved recruiting classes:", error);
      res.status(500).json({ message: "Failed to get saved recruiting classes" });
    }
  });

  app.get("/api/saved-recruiting-classes/:id", requireAuth, async (req, res) => {
    try {
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      res.json(rc);
    } catch (error) {
      console.error("Failed to get saved recruiting class:", error);
      res.status(500).json({ message: "Failed to get saved recruiting class" });
    }
  });

  app.post("/api/saved-recruiting-classes", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { name, description, recruitCount, classData } = req.body;
      if (!name || !classData) return res.status(400).json({ message: "Name and class data required" });
      const rc = await storage.createSavedRecruitingClass({ userId, name, description, recruitCount: recruitCount || 80, classData });
      res.json(rc);
    } catch (error) {
      console.error("Failed to create saved recruiting class:", error);
      res.status(500).json({ message: "Failed to create saved recruiting class" });
    }
  });

  app.patch("/api/saved-recruiting-classes/:id", requireAuth, async (req, res) => {
    try {
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      const updated = await storage.updateSavedRecruitingClass(req.params.id as string, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update saved recruiting class:", error);
      res.status(500).json({ message: "Failed to update saved recruiting class" });
    }
  });

  app.delete("/api/saved-recruiting-classes/:id", requireAuth, async (req, res) => {
    try {
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      await storage.deleteSavedRecruitingClass(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete saved recruiting class:", error);
      res.status(500).json({ message: "Failed to delete saved recruiting class" });
    }
  });

  // === Recruiting Class Share Links ===

  // Create a new share link for a saved recruiting class (owner only)
  app.post("/api/saved-recruiting-classes/:id/shares", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== userId) return res.status(403).json({ message: "Not authorized" });
      const token = require("crypto").randomUUID().replace(/-/g, "").substring(0, 12).toUpperCase();
      const share = await storage.createClassShare({
        classId: rc.id,
        userId,
        token,
        label: req.body.label ?? null,
      });
      res.json(share);
    } catch (error) {
      console.error("Failed to create class share link:", error);
      res.status(500).json({ message: "Failed to create share link" });
    }
  });

  // List all share links for a class (owner only)
  app.get("/api/saved-recruiting-classes/:id/shares", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== userId) return res.status(403).json({ message: "Not authorized" });
      const shares = await storage.getClassSharesByClassId(rc.id, userId);
      res.json(shares);
    } catch (error) {
      console.error("Failed to list class shares:", error);
      res.status(500).json({ message: "Failed to list share links" });
    }
  });

  // Revoke a share link (owner only)
  app.delete("/api/saved-recruiting-classes/:classId/shares/:shareId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rc = await storage.getSavedRecruitingClass(req.params.classId as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== userId) return res.status(403).json({ message: "Not authorized" });
      await storage.revokeClassShare(req.params.shareId as string, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to revoke class share:", error);
      res.status(500).json({ message: "Failed to revoke share link" });
    }
  });

  // Public preview: fetch a class via its share token (no auth required)
  app.get("/api/import-class/:token", async (req, res) => {
    try {
      const share = await storage.getClassShareByToken(req.params.token as string);
      if (!share || share.status !== "active") {
        return res.status(404).json({ message: "Share link not found or has been revoked" });
      }
      const rc = await storage.getSavedRecruitingClass(share.classId);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      // Fetch creator's masked email for display
      let creatorDisplay: string | null = null;
      try {
        const creator = await storage.getUser(share.userId);
        if (creator?.email) {
          const [local] = creator.email.split("@");
          creatorDisplay = local.length <= 3 ? `${local[0]}***` : `${local.slice(0, 3)}***`;
        }
      } catch {}
      // Return preview-safe payload — omit internal metadata from classData, expose display fields
      const classData = rc.classData as any;
      const recruits: any[] = Array.isArray(classData) ? classData : (Array.isArray(classData?.recruits) ? classData.recruits : []);
      const theme = !Array.isArray(classData) ? classData?.theme : null;
      const previewRecruits = recruits.map(r => ({
        firstName: r.firstName,
        lastName: r.lastName,
        position: r.position,
        starRating: r.starRating,
        overall: r.overall,
        isBlueChip: r.isBlueChip ?? false,
        isGenerationalGem: r.isGenerationalGem ?? false,
        isGenerationalBust: r.isGenerationalBust ?? false,
        isGem: r.isGem ?? false,
        isBust: r.isBust ?? false,
        recruitType: r.recruitType,
      }));
      res.json({
        shareId: share.id,
        token: share.token,
        label: share.label,
        importCount: share.importCount,
        createdAt: share.createdAt,
        creatorDisplay,
        className: rc.name,
        description: rc.description,
        recruitCount: rc.recruitCount,
        theme,
        recruits: previewRecruits,
      });
    } catch (error) {
      console.error("Failed to fetch import-class preview:", error);
      res.status(500).json({ message: "Failed to load recruiting class" });
    }
  });

  // Authenticated import: copy shared class into requester's library
  app.post("/api/import-class/:token", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const share = await storage.getClassShareByToken(req.params.token as string);
      if (!share || share.status !== "active") {
        return res.status(404).json({ message: "Share link not found or has been revoked" });
      }
      if (share.userId === userId) {
        return res.status(400).json({ message: "This class is already in your library" });
      }
      const rc = await storage.getSavedRecruitingClass(share.classId);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      const imported = await storage.createSavedRecruitingClass({
        userId,
        name: rc.name,
        description: rc.description ?? undefined,
        recruitCount: rc.recruitCount,
        classData: rc.classData,
      });
      await storage.incrementClassShareImportCount(share.id);
      res.json({ success: true, class: imported });
    } catch (error) {
      console.error("Failed to import recruiting class:", error);
      res.status(500).json({ message: "Failed to import recruiting class" });
    }
  });

  // === Conference Teams API (for roster viewing) ===
  app.get("/api/conference-teams", async (_req, res) => {
    try {
      const allConferences = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];
      const result = allConferences.map(conf => ({
        conference: conf,
        teams: getTeamsForConference(conf).map(t => t.name),
      }));
      res.json(result);
    } catch (error) {
      console.error("Failed to get conference teams:", error);
      res.status(500).json({ message: "Failed to get conference teams" });
    }
  });

  // ── Admin: RPI OVR Calibration ───────────────────────────────────────────
  // One-time migration endpoint that adjusts all player OVRs in the database
  // to match the 2026 NCAA RPI ranking order.
  // Protected by SESSION_SECRET passed as x-admin-key header.
  app.post("/api/admin/calibrate-rpi-ovr", async (req, res) => {
    try {
      const providedKey = req.headers["x-admin-key"];
      const expectedKey = process.env.SESSION_SECRET;
      if (!expectedKey || providedKey !== expectedKey) {
        return res.status(403).json({ message: "Forbidden: invalid or missing admin key" });
      }
      const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;
      console.log(`[calibrate-rpi] Admin endpoint triggered. dryRun=${dryRun}`);
      const summary = await calibrateRpiOvr(dryRun);
      return res.json({
        success: true,
        dryRun,
        ...summary,
      });
    } catch (error) {
      console.error("[calibrate-rpi] Admin endpoint error:", error);
      return res.status(500).json({ message: "Calibration failed", error: String(error) });
    }
  });

  // === Default Roster Data API (returns base roster for a team) ===
  app.get("/api/default-roster/:teamName", async (req, res) => {
    try {
      const teamName = decodeURIComponent(req.params.teamName);
      const roster = SEC_REAL_ROSTERS[teamName];
      if (!roster) return res.status(404).json({ message: "Team roster not found" });
      res.json(roster);
    } catch (error) {
      console.error("Failed to get default roster:", error);
      res.status(500).json({ message: "Failed to get default roster" });
    }
  });

  // === NCAA 2026 Public Roster API (no auth required) ===
  const ALL_CONFERENCES_ORDERED = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];

  function getConferenceForTeam(teamName: string): string {
    for (const conf of ALL_CONFERENCES_ORDERED) {
      if (getTeamsForConference(conf).some(t => t.name === teamName)) return conf;
    }
    return "";
  }

  app.get("/api/ncaa-rosters", async (_req, res) => {
    try {
      const result = ALL_CONFERENCES_ORDERED.map(conf => {
        const confTeams = getTeamsForConference(conf);
        return {
          conference: conf,
          teams: confTeams.map(t => {
            const roster = ALL_REAL_ROSTERS[t.name] ?? [];
            const players = roster.map(rp => {
              const normalized = normalizeCommonAbilities(
                { position: rp.position, firstName: rp.firstName, lastName: rp.lastName, ...rp },
                conf,
              );
              // Gate gold abilities using OVR WITH abilities included: a player earns
              // their gold badge if their total OVR (incl. the +10 gold bonus) reaches ≥ 500.
              const ovrWithAbilities = calculateOVR({ ...rp, ...normalized, abilities: rp.abilities ?? [] });
              const gatedAbilities = enforceGoldOvrGate(rp.abilities ?? [], rp.position, ovrWithAbilities);
              let finalNormalized = normalized;
              let finalOverall = calculateOVR({ ...rp, ...normalized, abilities: gatedAbilities });
              // Boost running/stealing for elite speedsters: OVR > 500 with speed 90-94 earns
              // S-grade Running; OVR > 500 with speed 95+ earns S-grade Stealing.
              if (finalOverall > 500 && typeof rp.speed === "number") {
                const spd = rp.speed;
                if (spd >= 90 && spd <= 94 && ((normalized.running ?? 0) as number) < 90) {
                  finalNormalized = { ...normalized, running: 90 };
                  finalOverall = calculateOVR({ ...rp, ...finalNormalized, abilities: gatedAbilities });
                } else if (spd >= 95 && ((normalized.stealing ?? 0) as number) < 90) {
                  finalNormalized = { ...normalized, stealing: 90 };
                  finalOverall = calculateOVR({ ...rp, ...finalNormalized, abilities: gatedAbilities });
                }
              }
              const starRating = finalOverall >= 500 ? 5 : finalOverall >= 400 ? 4 : finalOverall >= 300 ? 3 : finalOverall >= 200 ? 2 : 1;
              return { ...rp, ...finalNormalized, abilities: gatedAbilities, overall: finalOverall, starRating };
            });
            return {
              name: t.name,
              mascot: t.mascot,
              abbreviation: t.abbreviation,
              prestige: t.prestige,
              nationalRank: NATIONAL_RANKS[t.name] ?? TOTAL_NATIONAL_TEAMS,
              conference: conf,
              primaryColor: t.primaryColor,
              secondaryColor: t.secondaryColor,
              players,
            };
          }),
        };
      });
      res.json(result);
    } catch (error) {
      console.error("Failed to get ncaa rosters:", error);
      res.status(500).json({ message: "Failed to get NCAA rosters" });
    }
  });

  app.get("/api/ncaa-rosters/:teamName", async (req, res) => {
    try {
      const teamName = decodeURIComponent(req.params.teamName);
      const roster = ALL_REAL_ROSTERS[teamName];
      if (!roster) return res.status(404).json({ message: "Team roster not found" });

      const conferenceName = getConferenceForTeam(teamName);
      const teams = getTeamsForConference(conferenceName);
      const teamData = teams.find(t => t.name === teamName);

      const players = roster.map(rp => {
        const normalized = normalizeCommonAbilities(
          { position: rp.position, firstName: rp.firstName, lastName: rp.lastName, ...rp },
          conferenceName,
        );
        // Gate gold abilities using OVR WITH abilities included: a player earns
        // their gold badge if their total OVR (incl. the +10 gold bonus) reaches ≥ 500.
        const ovrWithAbilities = calculateOVR({ ...rp, ...normalized, abilities: rp.abilities ?? [] });
        const gatedAbilities = enforceGoldOvrGate(rp.abilities ?? [], rp.position, ovrWithAbilities);
        let finalNormalized = normalized;
        let finalOverall = calculateOVR({ ...rp, ...normalized, abilities: gatedAbilities });
        // Boost running/stealing for elite speedsters: OVR > 500 with speed 90-94 earns
        // S-grade Running; OVR > 500 with speed 95+ earns S-grade Stealing.
        if (finalOverall > 500 && typeof rp.speed === "number") {
          const spd = rp.speed;
          if (spd >= 90 && spd <= 94 && ((normalized.running ?? 0) as number) < 90) {
            finalNormalized = { ...normalized, running: 90 };
            finalOverall = calculateOVR({ ...rp, ...finalNormalized, abilities: gatedAbilities });
          } else if (spd >= 95 && ((normalized.stealing ?? 0) as number) < 90) {
            finalNormalized = { ...normalized, stealing: 90 };
            finalOverall = calculateOVR({ ...rp, ...finalNormalized, abilities: gatedAbilities });
          }
        }
        const starRating = finalOverall >= 500 ? 5 : finalOverall >= 400 ? 4 : finalOverall >= 300 ? 3 : finalOverall >= 200 ? 2 : 1;
        return { ...rp, ...finalNormalized, abilities: gatedAbilities, overall: finalOverall, starRating };
      });

      res.json({
        name: teamName,
        conference: conferenceName,
        prestige: teamData?.prestige ?? 5,
        nationalRank: NATIONAL_RANKS[teamName] ?? TOTAL_NATIONAL_TEAMS,
        primaryColor: teamData?.primaryColor ?? "#1a3a2a",
        secondaryColor: teamData?.secondaryColor ?? "#d4af37",
        players,
      });
    } catch (error) {
      console.error("Failed to get team ncaa roster:", error);
      res.status(500).json({ message: "Failed to get team roster" });
    }
  });

  // Coach self-leave: coach removes themselves from the league
  app.delete("/api/leagues/:leagueId/coaches/:coachId", requireAuth, async (req, res) => {
    try {
      const { leagueId, coachId } = req.params as { leagueId: string; coachId: string };
      const userId = req.session.userId!;
      const coach = await storage.getCoach(coachId);
      if (!coach) return res.status(404).json({ message: "Coach not found" });
      if (coach.leagueId !== leagueId) return res.status(400).json({ message: "Coach not in this league" });
      if (coach.userId !== userId) return res.status(403).json({ message: "You can only remove yourself" });
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId === userId) return res.status(400).json({ message: "Commissioners must transfer their role before leaving" });
      await storage.leaveLeague(coachId, leagueId, userId);
      res.json({ message: "You have left the league" });
    } catch (error) {
      console.error("Failed to leave league:", error);
      res.status(500).json({ message: "Failed to leave league" });
    }
  });

  // Commissioner removes a coach from the league
  app.delete("/api/leagues/:leagueId/coaches/:coachId/remove", requireAuth, async (req, res) => {
    try {
      const { leagueId, coachId } = req.params as { leagueId: string; coachId: string };
      const userId = req.session.userId!;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, userId)) return res.status(403).json({ message: "Only the commissioner can remove coaches" });
      const coach = await storage.getCoach(coachId);
      if (!coach) return res.status(404).json({ message: "Coach not found" });
      if (coach.leagueId !== leagueId) return res.status(400).json({ message: "Coach not in this league" });
      if (coach.userId === userId) return res.status(400).json({ message: "Commissioners cannot remove themselves" });
      if (coach.userId === league.commissionerId) return res.status(403).json({ message: "The primary commissioner cannot be removed" });
      await storage.leaveLeague(coachId, leagueId, userId);
      res.json({ message: "Coach removed from league" });
    } catch (error) {
      console.error("Failed to remove coach:", error);
      res.status(500).json({ message: "Failed to remove coach" });
    }
  });

  // Commissioner transfers their role to another human coach
  app.patch("/api/leagues/:leagueId/commissioner", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.leagueId as string;
      const userId = req.session.userId!;
      const { newUserId } = req.body as { newUserId: string };
      if (!newUserId) return res.status(400).json({ message: "newUserId is required" });
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== userId) return res.status(403).json({ message: "Only the commissioner can transfer the role" });
      if (newUserId === userId) return res.status(400).json({ message: "You are already the commissioner" });
      const coaches = await storage.getCoachesByLeague(leagueId);
      const targetCoach = coaches.find(c => c.userId === newUserId);
      if (!targetCoach) return res.status(400).json({ message: "Target user must have an active coach in this league" });
      await storage.transferCommissioner(leagueId, newUserId, userId);
      res.json({ message: "Commissioner role transferred", newCommissionerId: newUserId });
    } catch (error) {
      console.error("Failed to transfer commissioner:", error);
      res.status(500).json({ message: "Failed to transfer commissioner" });
    }
  });

  registerStorylineRoutes(app);

  return httpServer;
}

// Helper functions

const SCOUT_ATTRS = ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "velocity", "control", "stamina", "stuff"] as const;

/** Reveal exactly `count` new attributes chosen at random from those not yet in `existing`. */
function getAttributesToRevealCount(count: number, existing: string[] = []): string[] {
  const remaining = SCOUT_ATTRS.filter(a => !existing.includes(a));
  const toReveal: string[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    toReveal.push(...remaining.splice(idx, 1));
  }
  return toReveal;
}

/**
 * Percentage-based wrapper used for the **first** scout action (no existing attrs).
 * Uses target-based count so the floor is applied once, not compounded across calls.
 */
function getAttributesToReveal(percentage: number, existing: string[] = []): string[] {
  const targetTotal = Math.floor((percentage / 100) * SCOUT_ATTRS.length);
  const needToReveal = Math.max(0, targetTotal - existing.length);
  return getAttributesToRevealCount(needToReveal, existing);
}

async function generateSchedule(leagueId: string, season: number = 1) {
  const league = await storage.getLeague(leagueId);
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  
  const numTeams = leagueTeams.length;
  if (numTeams < 2) return;

  const seasonLength = league?.seasonLength || "medium";

  type TeamType = typeof leagueTeams[0];
  type Matchup = { home: TeamType; away: TeamType };

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function generateRoundRobin(teams: TeamType[]): Matchup[][] {
    const n = teams.length;
    if (n < 2) return [];
    const list = [...teams];
    if (n % 2 !== 0) list.push(null as any);
    const count = list.length;
    const rounds: Matchup[][] = [];
    for (let r = 0; r < count - 1; r++) {
      const round: Matchup[] = [];
      for (let i = 0; i < count / 2; i++) {
        const t1 = list[i];
        const t2 = list[count - 1 - i];
        if (t1 && t2) {
          round.push(r % 2 === 0 ? { home: t1, away: t2 } : { home: t2, away: t1 });
        }
      }
      rounds.push(round);
      const last = list.pop()!;
      list.splice(1, 0, last);
    }
    return rounds;
  }

  const numWeeks = seasonLength === "long" ? 10 : 5;
  const confGamesPerSeries = seasonLength === "short" ? 1 : 3;

  const confMap = new Map<string, TeamType[]>();
  for (const team of leagueTeams) {
    const cid = team.conferenceId || "none";
    if (!confMap.has(cid)) confMap.set(cid, []);
    confMap.get(cid)!.push(team);
  }

  const confWeeklyRounds = new Map<string, Matchup[][]>();
  for (const [cid, confTeams] of confMap) {
    const rounds = generateRoundRobin(confTeams);
    let weekRounds: Matchup[][] = [];

    if (seasonLength === "long") {
      const reversedRounds = rounds.map(round => round.map(m => ({ home: m.away, away: m.home })));
      weekRounds = [...rounds, ...reversedRounds];
    } else {
      weekRounds = [...rounds];
    }

    while (weekRounds.length < numWeeks) {
      for (const r of shuffle(rounds)) {
        if (weekRounds.length >= numWeeks) break;
        weekRounds.push(r.map(m => Math.random() > 0.5 ? m : { home: m.away, away: m.home }));
      }
    }

    weekRounds = weekRounds.slice(0, numWeeks);
    const shuffledOrder = shuffle(weekRounds.map((_, i) => i));
    let ordered = shuffledOrder.map(i => weekRounds[i]);

    // Enforce no back-to-back same-conference-opponent constraint.
    // Strategy: scan left-to-right; on conflict at week w, try every possible swap
    // partner (w+2 … end) deterministically and keep the first one that resolves
    // the conflict. If no single swap works, re-shuffle and retry up to 5 times.
    // For typical season lengths (5–10 weeks) this always resolves.
    function hasConflict(rounds: typeof ordered): number {
      for (let w = 0; w < rounds.length - 1; w++) {
        const A = rounds[w];
        const B = rounds[w + 1];
        if (A.some(mA => B.some(mB =>
          (mA.home.id === mB.home.id && mA.away.id === mB.away.id) ||
          (mA.home.id === mB.away.id && mA.away.id === mB.home.id)
        ))) return w;
      }
      return -1;
    }

    let resolved = false;
    for (let outerAttempt = 0; outerAttempt < 5 && !resolved; outerAttempt++) {
      let conflictW: number;
      while ((conflictW = hasConflict(ordered)) !== -1) {
        let swapped = false;
        for (let swapWith = conflictW + 2; swapWith < ordered.length; swapWith++) {
          [ordered[conflictW + 1], ordered[swapWith]] = [ordered[swapWith], ordered[conflictW + 1]];
          if (hasConflict(ordered) !== conflictW) { swapped = true; break; }
          // Revert — this swap introduced an equal or earlier conflict
          [ordered[conflictW + 1], ordered[swapWith]] = [ordered[swapWith], ordered[conflictW + 1]];
        }
        if (!swapped) break; // No single swap resolved it — fall through to re-shuffle
      }
      if (hasConflict(ordered) === -1) { resolved = true; break; }
      ordered = shuffle([...ordered]); // Re-shuffle and try again
    }

    confWeeklyRounds.set(cid, ordered);
  }

  // Track which teams have already faced each other as OOC opponents this season
  const oocSeasonHistory = new Map<string, Set<string>>();

  let totalGames = 0;
  for (let week = 0; week < numWeeks; week++) {
    const weekConfSeries: Matchup[] = [];

    for (const [cid, rounds] of confWeeklyRounds) {
      const round = rounds[week];
      if (!round) continue;
      for (const matchup of round) {
        weekConfSeries.push(matchup);
      }
    }

    const confGameTypes = confGamesPerSeries === 3 ? ["friday", "saturday", "sunday"] : ["friday"];
    for (const series of weekConfSeries) {
      for (let g = 0; g < confGamesPerSeries; g++) {
        await storage.createGame({
          leagueId,
          season,
          week: week + 1,
          homeTeamId: series.home.id,
          awayTeamId: series.away.id,
          phase: "regular",
          isConference: true,
          gameType: confGameTypes[g] || "friday",
        });
        totalGames++;
      }
    }

    const oocPairs: Matchup[] = [];
    const conferences = [...confMap.keys()];

    if (conferences.length >= 2) {
      // Build conference lookup once per league (idempotent across weeks)
      const confByTeamId = new Map<string, string>();
      for (const [cid, teams] of confMap) {
        for (const t of teams) confByTeamId.set(t.id, cid);
      }

      // Sort teams most-constrained first: teams with fewer cross-conf
      // candidates are placed first so backtracking finds solutions faster.
      const allTeams = [...leagueTeams].sort((a, b) => {
        const optsA = leagueTeams.filter(t => confByTeamId.get(t.id) !== confByTeamId.get(a.id)).length;
        const optsB = leagueTeams.filter(t => confByTeamId.get(t.id) !== confByTeamId.get(b.id)).length;
        return optsA - optsB;
      });

      // Build candidate lists per team:
      //   Tier 1 – cross-conference AND not yet met this season (preferred)
      //   Tier 2 – cross-conference AND already met this season (acceptable)
      // Within each tier, rotate by week so the same match-up doesn't recur
      // every time we fall back to repeat opponents.
      const candidatesFor = new Map<string, TeamType[]>();
      for (const team of allTeams) {
        const confId = confByTeamId.get(team.id)!;
        const xConf = allTeams.filter(t => confByTeamId.get(t.id) !== confId);
        const offset = week % Math.max(xConf.length, 1);
        const rotated = [...xConf.slice(offset), ...xConf.slice(0, offset)];
        const tier1 = rotated.filter(t => !oocSeasonHistory.get(team.id)?.has(t.id));
        const tier2 = rotated.filter(t => oocSeasonHistory.get(team.id)?.has(t.id));
        candidatesFor.set(team.id, [...tier1, ...tier2]);
      }

      // Backtracking perfect-matching:
      // Recurse through allTeams in order; skip already-paired teams.
      // Try each candidate from candidatesFor until a complete matching is found.
      // This guarantees every team gets exactly one cross-conf OOC game per week
      // as long as a feasible matching exists (which it always does when
      // conferences don't consume more than half the league roster).
      const workPairs: Matchup[] = [];
      const used = new Set<string>();

      function matchOOC(idx: number): boolean {
        while (idx < allTeams.length && used.has(allTeams[idx].id)) idx++;
        if (idx >= allTeams.length) return true; // all teams paired

        const team = allTeams[idx];
        for (const opp of candidatesFor.get(team.id) ?? []) {
          if (used.has(opp.id)) continue;
          used.add(team.id);
          used.add(opp.id);
          const isHome = Math.random() > 0.5;
          workPairs.push(isHome ? { home: team, away: opp } : { home: opp, away: team });
          if (matchOOC(idx + 1)) return true;
          used.delete(team.id);
          used.delete(opp.id);
          workPairs.pop();
        }
        return false; // no valid partner — caller will try a different branch
      }

      const matched = matchOOC(0);

      if (matched) {
        for (const pair of workPairs) {
          oocPairs.push(pair);
          const hId = pair.home.id;
          const aId = pair.away.id;
          if (!oocSeasonHistory.has(hId)) oocSeasonHistory.set(hId, new Set());
          if (!oocSeasonHistory.has(aId)) oocSeasonHistory.set(aId, new Set());
          oocSeasonHistory.get(hId)!.add(aId);
          oocSeasonHistory.get(aId)!.add(hId);
        }
      }
      // matched should always be true for balanced multi-conf leagues;
      // if it ever fails (all-same-conf edge case) week simply has no OOC games.
    } else {
      // Single conference fallback: pair within the conference
      const available = shuffle([...leagueTeams]);
      for (let i = 0; i + 1 < available.length; i += 2) {
        oocPairs.push({ home: available[i], away: available[i + 1] });
      }
    }

    for (const ooc of oocPairs) {
      await storage.createGame({
        leagueId,
        season,
        week: week + 1,
        homeTeamId: ooc.home.id,
        awayTeamId: ooc.away.id,
        phase: "regular",
        isConference: false,
        gameType: "midweek",
      });
      totalGames++;
    }
  }

  console.log(`Schedule generated for league ${leagueId} season ${season}: ${seasonLength} format, ${numWeeks} weeks, ${totalGames} total games`);
}

function getTeamsForConference(conferenceName: string) {
  const conferenceTeams: Record<string, Array<{ name: string; mascot: string; abbreviation: string; city: string; state: string; primaryColor: string; secondaryColor: string; prestige: number; stadium: number; facilities: number; collegeLife: number; marketing: number; academics: number; fanbasePassion: string; fanbaseType: string; enrollment: number; nilBudget: number }>> = {
    "SEC": [
      { name: "Alabama", mascot: "Crimson Tide", abbreviation: "BAMA", city: "Tuscaloosa", state: "AL", primaryColor: "#9e1b32", secondaryColor: "#ffffff", prestige: 8, stadium: 8, facilities: 9, collegeLife: 8, marketing: 9, academics: 5, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 38000, nilBudget: 5500000 },
      { name: "Arkansas", mascot: "Razorbacks", abbreviation: "ARK", city: "Fayetteville", state: "AR", primaryColor: "#9d2235", secondaryColor: "#ffffff", prestige: 8, stadium: 9, facilities: 8, collegeLife: 6, marketing: 7, academics: 5, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 30000, nilBudget: 4000000 },
      { name: "Auburn", mascot: "Tigers", abbreviation: "AUB", city: "Auburn", state: "AL", primaryColor: "#0c2340", secondaryColor: "#e87722", prestige: 7, stadium: 6, facilities: 7, collegeLife: 8, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 31000, nilBudget: 3500000 },
      { name: "Florida", mascot: "Gators", abbreviation: "FL", city: "Gainesville", state: "FL", primaryColor: "#0037ff", secondaryColor: "#fc4903", prestige: 9, stadium: 7, facilities: 7, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 55000, nilBudget: 5000000 },
      { name: "Georgia", mascot: "Bulldogs", abbreviation: "UGA", city: "Athens", state: "GA", primaryColor: "#ba0c2f", secondaryColor: "#000000", prestige: 7, stadium: 5, facilities: 7, collegeLife: 8, marketing: 8, academics: 6, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 40000, nilBudget: 4000000 },
      { name: "Kentucky", mascot: "Wildcats", abbreviation: "UK", city: "Lexington", state: "KY", primaryColor: "#0033a0", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 2500000 },
      { name: "LSU", mascot: "Tigers", abbreviation: "LSU", city: "Baton Rouge", state: "LA", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 9, stadium: 9, facilities: 9, collegeLife: 9, marketing: 8, academics: 4, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 35000, nilBudget: 5000000 },
      { name: "Mississippi State", mascot: "Bulldogs", abbreviation: "MSST", city: "Starkville", state: "MS", primaryColor: "#660000", secondaryColor: "#ffffff", prestige: 8, stadium: 9, facilities: 7, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 23000, nilBudget: 3000000 },
      { name: "Missouri", mascot: "Tigers", abbreviation: "MIZ", city: "Columbia", state: "MO", primaryColor: "#f1b82d", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 5, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 31000, nilBudget: 2500000 },
      { name: "Oklahoma", mascot: "Sooners", abbreviation: "OU", city: "Norman", state: "OK", primaryColor: "#841617", secondaryColor: "#fdf9d8", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 8, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 28000, nilBudget: 3000000 },
      { name: "Ole Miss", mascot: "Rebels", abbreviation: "MISS", city: "Oxford", state: "MS", primaryColor: "#14213d", secondaryColor: "#ce1126", prestige: 7, stadium: 7, facilities: 7, collegeLife: 8, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 24000, nilBudget: 3500000 },
      { name: "South Carolina", mascot: "Gamecocks", abbreviation: "SC", city: "Columbia", state: "SC", primaryColor: "#73000a", secondaryColor: "#000000", prestige: 8, stadium: 7, facilities: 7, collegeLife: 7, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 35000, nilBudget: 3000000 },
      { name: "Tennessee", mascot: "Volunteers", abbreviation: "TENN", city: "Knoxville", state: "TN", primaryColor: "#ff8200", secondaryColor: "#ffffff", prestige: 7, stadium: 7, facilities: 7, collegeLife: 8, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 31000, nilBudget: 4000000 },
      { name: "Texas", mascot: "Longhorns", abbreviation: "TEX", city: "Austin", state: "TX", primaryColor: "#bf5700", secondaryColor: "#ffffff", prestige: 9, stadium: 9, facilities: 9, collegeLife: 8, marketing: 9, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 52000, nilBudget: 6000000 },
      { name: "Texas A&M", mascot: "Aggies", abbreviation: "TAMU", city: "College Station", state: "TX", primaryColor: "#500000", secondaryColor: "#ffffff", prestige: 7, stadium: 7, facilities: 8, collegeLife: 7, marketing: 8, academics: 6, fanbasePassion: "A+", fanbaseType: "Cult Following", enrollment: 72000, nilBudget: 4500000 },
      { name: "Vanderbilt", mascot: "Commodores", abbreviation: "VAN", city: "Nashville", state: "TN", primaryColor: "#866d4b", secondaryColor: "#000000", prestige: 9, stadium: 7, facilities: 9, collegeLife: 7, marketing: 7, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 4000000 },
    ],
    "ACC": [
      { name: "Boston College", mascot: "Eagles", abbreviation: "BC", city: "Chestnut Hill", state: "MA", primaryColor: "#8b0000", secondaryColor: "#c4a77d", prestige: 3, stadium: 2, facilities: 4, collegeLife: 6, marketing: 4, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 15000, nilBudget: 1500000 },
      { name: "California", mascot: "Golden Bears", abbreviation: "CAL", city: "Berkeley", state: "CA", primaryColor: "#003262", secondaryColor: "#fdb515", prestige: 4, stadium: 3, facilities: 5, collegeLife: 7, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 45000, nilBudget: 2000000 },
      { name: "Clemson", mascot: "Tigers", abbreviation: "CLEM", city: "Clemson", state: "SC", primaryColor: "#f66733", secondaryColor: "#522d80", prestige: 6, stadium: 6, facilities: 6, collegeLife: 8, marketing: 7, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 27000, nilBudget: 3000000 },
      { name: "Duke", mascot: "Blue Devils", abbreviation: "DUKE", city: "Durham", state: "NC", primaryColor: "#003087", secondaryColor: "#ffffff", prestige: 4, stadium: 3, facilities: 6, collegeLife: 6, marketing: 6, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 17000, nilBudget: 2000000 },
      { name: "Florida State", mascot: "Seminoles", abbreviation: "FSU", city: "Tallahassee", state: "FL", primaryColor: "#782f40", secondaryColor: "#ceb888", prestige: 7, stadium: 6, facilities: 7, collegeLife: 7, marketing: 8, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 45000, nilBudget: 3500000 },
      { name: "Georgia Tech", mascot: "Yellow Jackets", abbreviation: "GT", city: "Atlanta", state: "GA", primaryColor: "#003057", secondaryColor: "#b3a369", prestige: 4, stadium: 3, facilities: 5, collegeLife: 6, marketing: 5, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 45000, nilBudget: 2000000 },
      { name: "Louisville", mascot: "Cardinals", abbreviation: "LOU", city: "Louisville", state: "KY", primaryColor: "#ad0000", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 23000, nilBudget: 2500000 },
      { name: "Miami", mascot: "Hurricanes", abbreviation: "MIA", city: "Coral Gables", state: "FL", primaryColor: "#f47321", secondaryColor: "#005030", prestige: 8, stadium: 6, facilities: 7, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 3500000 },
      { name: "NC State", mascot: "Wolfpack", abbreviation: "NCS", city: "Raleigh", state: "NC", primaryColor: "#cc0000", secondaryColor: "#ffffff", prestige: 6, stadium: 5, facilities: 5, collegeLife: 6, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 37000, nilBudget: 2000000 },
      { name: "North Carolina", mascot: "Tar Heels", abbreviation: "UNC", city: "Chapel Hill", state: "NC", primaryColor: "#7bafd4", secondaryColor: "#ffffff", prestige: 7, stadium: 5, facilities: 6, collegeLife: 7, marketing: 7, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 31000, nilBudget: 3000000 },
      { name: "Notre Dame", mascot: "Fighting Irish", abbreviation: "ND", city: "South Bend", state: "IN", primaryColor: "#0c2340", secondaryColor: "#c99700", prestige: 5, stadium: 4, facilities: 6, collegeLife: 6, marketing: 8, academics: 9, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 13000, nilBudget: 3000000 },
      { name: "Pittsburgh", mascot: "Panthers", abbreviation: "PITT", city: "Pittsburgh", state: "PA", primaryColor: "#003594", secondaryColor: "#ffb81c", prestige: 3, stadium: 2, facilities: 3, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 1500000 },
      { name: "Stanford", mascot: "Cardinal", abbreviation: "STAN", city: "Stanford", state: "CA", primaryColor: "#8c1515", secondaryColor: "#ffffff", prestige: 8, stadium: 5, facilities: 8, collegeLife: 7, marketing: 7, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 17000, nilBudget: 3000000 },
      { name: "Virginia", mascot: "Cavaliers", abbreviation: "UVA", city: "Charlottesville", state: "VA", primaryColor: "#232d4b", secondaryColor: "#f84c1e", prestige: 6, stadium: 4, facilities: 5, collegeLife: 7, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 26000, nilBudget: 2500000 },
      { name: "Virginia Tech", mascot: "Hokies", abbreviation: "VT", city: "Blacksburg", state: "VA", primaryColor: "#630031", secondaryColor: "#cf4420", prestige: 5, stadium: 4, facilities: 5, collegeLife: 6, marketing: 6, academics: 6, fanbasePassion: "A", fanbaseType: "Balanced", enrollment: 37000, nilBudget: 2000000 },
      { name: "Wake Forest", mascot: "Demon Deacons", abbreviation: "WAKE", city: "Winston-Salem", state: "NC", primaryColor: "#9e7e38", secondaryColor: "#000000", prestige: 5, stadium: 4, facilities: 6, collegeLife: 6, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 2000000 },
    ],
    "Big 12": [
      { name: "Arizona", mascot: "Wildcats", abbreviation: "ARIZ", city: "Tucson", state: "AZ", primaryColor: "#002449", secondaryColor: "#cc0033", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 2000000 },
      { name: "Arizona State", mascot: "Sun Devils", abbreviation: "ASU", city: "Tempe", state: "AZ", primaryColor: "#8c1d40", secondaryColor: "#ffc627", prestige: 7, stadium: 6, facilities: 5, collegeLife: 9, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 75000, nilBudget: 2500000 },
      { name: "Baylor", mascot: "Bears", abbreviation: "BAY", city: "Waco", state: "TX", primaryColor: "#154734", secondaryColor: "#ffc72c", prestige: 4, stadium: 5, facilities: 5, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 20000, nilBudget: 2000000 },
      { name: "BYU", mascot: "Cougars", abbreviation: "BYU", city: "Provo", state: "UT", primaryColor: "#002e5d", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 4, marketing: 5, academics: 6, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 35000, nilBudget: 2000000 },
      { name: "Cincinnati", mascot: "Bearcats", abbreviation: "CIN", city: "Cincinnati", state: "OH", primaryColor: "#e00122", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 1500000 },
      { name: "Houston", mascot: "Cougars", abbreviation: "HOU", city: "Houston", state: "TX", primaryColor: "#c8102e", secondaryColor: "#ffffff", prestige: 5, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 1500000 },
      { name: "Kansas", mascot: "Jayhawks", abbreviation: "KU", city: "Lawrence", state: "KS", primaryColor: "#0051ba", secondaryColor: "#e8000d", prestige: 3, stadium: 3, facilities: 4, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 28000, nilBudget: 1500000 },
      { name: "Kansas State", mascot: "Wildcats", abbreviation: "KSU", city: "Manhattan", state: "KS", primaryColor: "#512888", secondaryColor: "#ffffff", prestige: 3, stadium: 3, facilities: 3, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 1500000 },
      { name: "Oklahoma State", mascot: "Cowboys", abbreviation: "OKST", city: "Stillwater", state: "OK", primaryColor: "#ff7300", secondaryColor: "#000000", prestige: 8, stadium: 6, facilities: 7, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 25000, nilBudget: 2500000 },
      { name: "TCU", mascot: "Horned Frogs", abbreviation: "TCU", city: "Fort Worth", state: "TX", primaryColor: "#4d1979", secondaryColor: "#a3a9ac", prestige: 7, stadium: 7, facilities: 7, collegeLife: 7, marketing: 7, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 2500000 },
      { name: "Texas Tech", mascot: "Red Raiders", abbreviation: "TTU", city: "Lubbock", state: "TX", primaryColor: "#cc0000", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 40000, nilBudget: 2000000 },
      { name: "UCF", mascot: "Knights", abbreviation: "UCF", city: "Orlando", state: "FL", primaryColor: "#ba9b37", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 72000, nilBudget: 1500000 },
      { name: "Utah", mascot: "Utes", abbreviation: "UTAH", city: "Salt Lake City", state: "UT", primaryColor: "#cc0000", secondaryColor: "#ffffff", prestige: 3, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 2000000 },
      { name: "West Virginia", mascot: "Mountaineers", abbreviation: "WVU", city: "Morgantown", state: "WV", primaryColor: "#002855", secondaryColor: "#eaaa00", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 26000, nilBudget: 1500000 },
    ],
    "Big Ten": [
      { name: "Illinois", mascot: "Fighting Illini", abbreviation: "ILL", city: "Champaign", state: "IL", primaryColor: "#e84a27", secondaryColor: "#13294b", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 52000, nilBudget: 1500000 },
      { name: "Indiana", mascot: "Hoosiers", abbreviation: "IU", city: "Bloomington", state: "IN", primaryColor: "#990000", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 45000, nilBudget: 2000000 },
      { name: "Iowa", mascot: "Hawkeyes", abbreviation: "IOWA", city: "Iowa City", state: "IA", primaryColor: "#000000", secondaryColor: "#ffcd00", prestige: 3, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 32000, nilBudget: 1500000 },
      { name: "Maryland", mascot: "Terrapins", abbreviation: "MD", city: "College Park", state: "MD", primaryColor: "#e03a3e", secondaryColor: "#ffd520", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 41000, nilBudget: 2000000 },
      { name: "Michigan", mascot: "Wolverines", abbreviation: "MICH", city: "Ann Arbor", state: "MI", primaryColor: "#00274c", secondaryColor: "#ffcb05", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 8, academics: 9, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 47000, nilBudget: 3000000 },
      { name: "Michigan State", mascot: "Spartans", abbreviation: "MSU", city: "East Lansing", state: "MI", primaryColor: "#18453b", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "Minnesota", mascot: "Golden Gophers", abbreviation: "MINN", city: "Minneapolis", state: "MN", primaryColor: "#862334", secondaryColor: "#ffc72c", prestige: 4, stadium: 5, facilities: 5, collegeLife: 6, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 52000, nilBudget: 2000000 },
      { name: "Nebraska", mascot: "Cornhuskers", abbreviation: "NEB", city: "Lincoln", state: "NE", primaryColor: "#e41c38", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 5, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 24000, nilBudget: 2000000 },
      { name: "Northwestern", mascot: "Wildcats", abbreviation: "NW", city: "Evanston", state: "IL", primaryColor: "#4e2a84", secondaryColor: "#ffffff", prestige: 3, stadium: 3, facilities: 5, collegeLife: 5, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 22000, nilBudget: 2000000 },
      { name: "Ohio State", mascot: "Buckeyes", abbreviation: "OSU", city: "Columbus", state: "OH", primaryColor: "#bb0000", secondaryColor: "#666666", prestige: 5, stadium: 5, facilities: 6, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 61000, nilBudget: 3000000 },
      { name: "Oregon", mascot: "Ducks", abbreviation: "ORE", city: "Eugene", state: "OR", primaryColor: "#154733", secondaryColor: "#fee123", prestige: 4, stadium: 5, facilities: 6, collegeLife: 7, marketing: 7, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 2500000 },
      { name: "Penn State", mascot: "Nittany Lions", abbreviation: "PSU", city: "State College", state: "PA", primaryColor: "#041e42", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 5, collegeLife: 8, marketing: 6, academics: 7, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 88000, nilBudget: 2000000 },
      { name: "Purdue", mascot: "Boilermakers", abbreviation: "PUR", city: "West Lafayette", state: "IN", primaryColor: "#ceb888", secondaryColor: "#000000", prestige: 4, stadium: 3, facilities: 4, collegeLife: 6, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "Rutgers", mascot: "Scarlet Knights", abbreviation: "RUT", city: "New Brunswick", state: "NJ", primaryColor: "#cc0033", secondaryColor: "#5f6a72", prestige: 3, stadium: 3, facilities: 4, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "USC", mascot: "Trojans", abbreviation: "USC", city: "Los Angeles", state: "CA", primaryColor: "#990000", secondaryColor: "#ffc72c", prestige: 6, stadium: 5, facilities: 7, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "B", fanbaseType: "Blue Blood", enrollment: 47000, nilBudget: 3000000 },
      { name: "UCLA", mascot: "Bruins", abbreviation: "UCLA", city: "Los Angeles", state: "CA", primaryColor: "#2774ae", secondaryColor: "#ffd100", prestige: 8, stadium: 5, facilities: 7, collegeLife: 8, marketing: 8, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 46000, nilBudget: 3500000 },
      { name: "Washington", mascot: "Huskies", abbreviation: "WASH", city: "Seattle", state: "WA", primaryColor: "#4b2e83", secondaryColor: "#b7a57a", prestige: 4, stadium: 4, facilities: 5, collegeLife: 7, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 48000, nilBudget: 2000000 },
    ],
    "Pac-12": [
      { name: "Oregon State", mascot: "Beavers", abbreviation: "ORST", city: "Corvallis", state: "OR", primaryColor: "#dc4405", secondaryColor: "#000000", prestige: 9, stadium: 7, facilities: 8, collegeLife: 6, marketing: 7, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 34000, nilBudget: 3500000 },
      { name: "Washington State", mascot: "Cougars", abbreviation: "WSU", city: "Pullman", state: "WA", primaryColor: "#981e32", secondaryColor: "#5e6a71", prestige: 4, stadium: 3, facilities: 4, collegeLife: 5, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 30000, nilBudget: 1500000 },
      { name: "Fresno State", mascot: "Bulldogs", abbreviation: "FRES", city: "Fresno", state: "CA", primaryColor: "#db0032", secondaryColor: "#002e6d", prestige: 7, stadium: 6, facilities: 5, collegeLife: 5, marketing: 5, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 25000, nilBudget: 1800000 },
      { name: "San Diego State", mascot: "Aztecs", abbreviation: "SDSU", city: "San Diego", state: "CA", primaryColor: "#a6192e", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 36000, nilBudget: 1800000 },
      { name: "UNLV", mascot: "Rebels", abbreviation: "UNLV", city: "Las Vegas", state: "NV", primaryColor: "#cf0a2c", secondaryColor: "#666666", prestige: 4, stadium: 4, facilities: 4, collegeLife: 9, marketing: 6, academics: 4, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 30000, nilBudget: 1200000 },
      { name: "Nevada", mascot: "Wolf Pack", abbreviation: "NEV", city: "Reno", state: "NV", primaryColor: "#003366", secondaryColor: "#807f84", prestige: 3, stadium: 3, facilities: 3, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 900000 },
      { name: "New Mexico", mascot: "Lobos", abbreviation: "UNM", city: "Albuquerque", state: "NM", primaryColor: "#ba0c2f", secondaryColor: "#a7a8aa", prestige: 3, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1000000 },
      { name: "Air Force", mascot: "Falcons", abbreviation: "AF", city: "Colorado Springs", state: "CO", primaryColor: "#003594", secondaryColor: "#8a8d8f", prestige: 3, stadium: 4, facilities: 5, collegeLife: 2, marketing: 4, academics: 8, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 4000, nilBudget: 800000 },
    ],
    "AAC": [
      { name: "East Carolina", mascot: "Pirates", abbreviation: "ECU", city: "Greenville", state: "NC", primaryColor: "#592a8a", secondaryColor: "#fdc82f", prestige: 7, stadium: 7, facilities: 6, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 28000, nilBudget: 2000000 },
      { name: "Wichita State", mascot: "Shockers", abbreviation: "WICH", city: "Wichita", state: "KS", primaryColor: "#ffc72c", secondaryColor: "#000000", prestige: 7, stadium: 7, facilities: 5, collegeLife: 5, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 16000, nilBudget: 1800000 },
      { name: "Tulane", mascot: "Green Wave", abbreviation: "TUL", city: "New Orleans", state: "LA", primaryColor: "#006747", secondaryColor: "#418fde", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 1800000 },
      { name: "Memphis", mascot: "Tigers", abbreviation: "MEM", city: "Memphis", state: "TN", primaryColor: "#003087", secondaryColor: "#8e9090", prestige: 4, stadium: 4, facilities: 5, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1500000 },
      { name: "South Florida", mascot: "Bulls", abbreviation: "USF", city: "Tampa", state: "FL", primaryColor: "#006747", secondaryColor: "#cfc493", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1800000 },
      { name: "Charlotte", mascot: "49ers", abbreviation: "CLT", city: "Charlotte", state: "NC", primaryColor: "#046a38", secondaryColor: "#b9975b", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 1200000 },
      { name: "UAB", mascot: "Blazers", abbreviation: "UAB", city: "Birmingham", state: "AL", primaryColor: "#1e6b52", secondaryColor: "#f4c300", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1200000 },
      { name: "Rice", mascot: "Owls", abbreviation: "RICE", city: "Houston", state: "TX", primaryColor: "#00205b", secondaryColor: "#a4a8b1", prestige: 6, stadium: 5, facilities: 5, collegeLife: 7, marketing: 6, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 8000, nilBudget: 1500000 },
      { name: "Florida Atlantic", mascot: "Owls", abbreviation: "FAU", city: "Boca Raton", state: "FL", primaryColor: "#003366", secondaryColor: "#cc0000", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 1200000 },
      { name: "North Texas", mascot: "Mean Green", abbreviation: "UNT", city: "Denton", state: "TX", primaryColor: "#00853e", secondaryColor: "#000000", prestige: 3, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 41000, nilBudget: 1000000 },
      { name: "Dallas Baptist", mascot: "Patriots", abbreviation: "DBU", city: "Dallas", state: "TX", primaryColor: "#002d72", secondaryColor: "#c8102e", prestige: 7, stadium: 5, facilities: 6, collegeLife: 5, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 1500000 },
    ],
    "WCC": [
      { name: "Pepperdine", mascot: "Waves", abbreviation: "PEPP", city: "Malibu", state: "CA", primaryColor: "#00205b", secondaryColor: "#f47920", prestige: 5, stadium: 4, facilities: 5, collegeLife: 7, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 1200000 },
      { name: "Loyola Marymount", mascot: "Lions", abbreviation: "LMU", city: "Los Angeles", state: "CA", primaryColor: "#8a0029", secondaryColor: "#003595", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 1000000 },
      { name: "San Diego", mascot: "Toreros", abbreviation: "USD", city: "San Diego", state: "CA", primaryColor: "#003b70", secondaryColor: "#c69214", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 1000000 },
      { name: "Saint Mary's", mascot: "Gaels", abbreviation: "SMC", city: "Moraga", state: "CA", primaryColor: "#06315b", secondaryColor: "#d20f29", prestige: 5, stadium: 3, facilities: 4, collegeLife: 5, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 4000, nilBudget: 1200000 },
      { name: "Gonzaga", mascot: "Bulldogs", abbreviation: "GONZ", city: "Spokane", state: "WA", primaryColor: "#002967", secondaryColor: "#c8102e", prestige: 4, stadium: 4, facilities: 5, collegeLife: 6, marketing: 6, academics: 7, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 8000, nilBudget: 1500000 },
      { name: "Santa Clara", mascot: "Broncos", abbreviation: "SCU", city: "Santa Clara", state: "CA", primaryColor: "#aa003d", secondaryColor: "#a59b80", prestige: 3, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 800000 },
      { name: "Portland", mascot: "Pilots", abbreviation: "POR", city: "Portland", state: "OR", primaryColor: "#582c83", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 3, collegeLife: 6, marketing: 4, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 4000, nilBudget: 700000 },
      { name: "San Francisco", mascot: "Dons", abbreviation: "SFU", city: "San Francisco", state: "CA", primaryColor: "#00543c", secondaryColor: "#fdb913", prestige: 3, stadium: 2, facilities: 3, collegeLife: 8, marketing: 4, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 11000, nilBudget: 700000 },
    ],
    "Ivy League": [
      { name: "Columbia", mascot: "Lions", abbreviation: "COL", city: "New York", state: "NY", primaryColor: "#9bcbeb", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 3, collegeLife: 8, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 33000, nilBudget: 500000 },
      { name: "Cornell", mascot: "Big Red", abbreviation: "COR", city: "Ithaca", state: "NY", primaryColor: "#b31b1b", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 3, collegeLife: 5, marketing: 4, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 25000, nilBudget: 500000 },
      { name: "Dartmouth", mascot: "Big Green", abbreviation: "DART", city: "Hanover", state: "NH", primaryColor: "#00693e", secondaryColor: "#ffffff", prestige: 3, stadium: 2, facilities: 3, collegeLife: 5, marketing: 4, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 7000, nilBudget: 400000 },
      { name: "Harvard", mascot: "Crimson", abbreviation: "HARV", city: "Cambridge", state: "MA", primaryColor: "#a51c30", secondaryColor: "#000000", prestige: 4, stadium: 2, facilities: 4, collegeLife: 6, marketing: 6, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 23000, nilBudget: 600000 },
      { name: "Penn", mascot: "Quakers", abbreviation: "PENN", city: "Philadelphia", state: "PA", primaryColor: "#011f5b", secondaryColor: "#990000", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 22000, nilBudget: 500000 },
      { name: "Princeton", mascot: "Tigers", abbreviation: "PRIN", city: "Princeton", state: "NJ", primaryColor: "#e77500", secondaryColor: "#000000", prestige: 3, stadium: 2, facilities: 4, collegeLife: 5, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 500000 },
      { name: "Yale", mascot: "Bulldogs", abbreviation: "YALE", city: "New Haven", state: "CT", primaryColor: "#00356b", secondaryColor: "#ffffff", prestige: 4, stadium: 2, facilities: 4, collegeLife: 6, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 600000 },
      { name: "Brown", mascot: "Bears", abbreviation: "BRN", city: "Providence", state: "RI", primaryColor: "#4e3629", secondaryColor: "#c00404", prestige: 3, stadium: 2, facilities: 3, collegeLife: 6, marketing: 4, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 400000 },
    ],
    "Sun Belt": [
      { name: "Coastal Carolina", mascot: "Chanticleers", abbreviation: "CCU", city: "Conway", state: "SC", primaryColor: "#006f71", secondaryColor: "#a27752", prestige: 8, stadium: 6, facilities: 7, collegeLife: 6, marketing: 6, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 11000, nilBudget: 2000000 },
      { name: "Southern Miss", mascot: "Golden Eagles", abbreviation: "USM", city: "Hattiesburg", state: "MS", primaryColor: "#ffab00", secondaryColor: "#000000", prestige: 7, stadium: 6, facilities: 5, collegeLife: 5, marketing: 5, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 15000, nilBudget: 1500000 },
      { name: "Troy", mascot: "Trojans", abbreviation: "TROY", city: "Troy", state: "AL", primaryColor: "#8b2332", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 4, collegeLife: 4, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 18000, nilBudget: 1000000 },
      { name: "Marshall", mascot: "Thundering Herd", abbreviation: "MAR", city: "Huntington", state: "WV", primaryColor: "#00b140", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1000000 },
      { name: "Louisiana", mascot: "Ragin' Cajuns", abbreviation: "ULL", city: "Lafayette", state: "LA", primaryColor: "#ce181e", secondaryColor: "#ffffff", prestige: 7, stadium: 6, facilities: 5, collegeLife: 6, marketing: 5, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 17000, nilBudget: 1500000 },
      { name: "Old Dominion", mascot: "Monarchs", abbreviation: "ODU", city: "Norfolk", state: "VA", primaryColor: "#003057", secondaryColor: "#8b8d8e", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 1000000 },
      { name: "Arkansas State", mascot: "Red Wolves", abbreviation: "ARST", city: "Jonesboro", state: "AR", primaryColor: "#cc092f", secondaryColor: "#000000", prestige: 3, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 4, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 14000, nilBudget: 800000 },
      { name: "Georgia Southern", mascot: "Eagles", abbreviation: "GASO", city: "Statesboro", state: "GA", primaryColor: "#041e42", secondaryColor: "#87714d", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 27000, nilBudget: 1000000 },
      { name: "App State", mascot: "Mountaineers", abbreviation: "APP", city: "Boone", state: "NC", primaryColor: "#222222", secondaryColor: "#ffcc00", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 21000, nilBudget: 1000000 },
      { name: "Georgia State", mascot: "Panthers", abbreviation: "GAST", city: "Atlanta", state: "GA", primaryColor: "#0039a6", secondaryColor: "#cc0000", prestige: 3, stadium: 4, facilities: 4, collegeLife: 7, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 54000, nilBudget: 1000000 },
      { name: "South Alabama", mascot: "Jaguars", abbreviation: "USA", city: "Mobile", state: "AL", primaryColor: "#00205b", secondaryColor: "#bf0d3e", prestige: 5, stadium: 5, facilities: 4, collegeLife: 5, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 14000, nilBudget: 1200000 },
      { name: "James Madison", mascot: "Dukes", abbreviation: "JMU", city: "Harrisonburg", state: "VA", primaryColor: "#450084", secondaryColor: "#cbb778", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 38000, nilBudget: 1500000 },
    ],
    "Big West": [
      { name: "Cal State Fullerton", mascot: "Titans", abbreviation: "CSUF", city: "Fullerton", state: "CA", primaryColor: "#00274c", secondaryColor: "#f47920", prestige: 9, stadium: 6, facilities: 6, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 42000, nilBudget: 2000000 },
      { name: "UC Irvine", mascot: "Anteaters", abbreviation: "UCI", city: "Irvine", state: "CA", primaryColor: "#0064a4", secondaryColor: "#ffd200", prestige: 6, stadium: 5, facilities: 5, collegeLife: 6, marketing: 5, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 36000, nilBudget: 1500000 },
      { name: "UC Santa Barbara", mascot: "Gauchos", abbreviation: "UCSB", city: "Santa Barbara", state: "CA", primaryColor: "#003660", secondaryColor: "#febc11", prestige: 6, stadium: 4, facilities: 5, collegeLife: 9, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 27000, nilBudget: 1500000 },
      { name: "Long Beach State", mascot: "Dirtbags", abbreviation: "LBSU", city: "Long Beach", state: "CA", primaryColor: "#000000", secondaryColor: "#f0ab00", prestige: 7, stadium: 5, facilities: 5, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 39000, nilBudget: 1500000 },
      { name: "UC San Diego", mascot: "Tritons", abbreviation: "UCSD", city: "San Diego", state: "CA", primaryColor: "#182b49", secondaryColor: "#c69214", prestige: 3, stadium: 3, facilities: 4, collegeLife: 7, marketing: 4, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 42000, nilBudget: 1000000 },
      { name: "Hawaii", mascot: "Rainbow Warriors", abbreviation: "HAW", city: "Honolulu", state: "HI", primaryColor: "#024731", secondaryColor: "#ffffff", prestige: 4, stadium: 5, facilities: 4, collegeLife: 9, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 19000, nilBudget: 1500000 },
      { name: "Cal Poly", mascot: "Mustangs", abbreviation: "CPOL", city: "San Luis Obispo", state: "CA", primaryColor: "#154734", secondaryColor: "#bd8b13", prestige: 7, stadium: 4, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1500000 },
      { name: "UC Davis", mascot: "Aggies", abbreviation: "UCD", city: "Davis", state: "CA", primaryColor: "#002855", secondaryColor: "#daaa00", prestige: 3, stadium: 3, facilities: 4, collegeLife: 6, marketing: 4, academics: 7, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 40000, nilBudget: 1000000 },
      { name: "Cal State Northridge", mascot: "Matadors", abbreviation: "CSUN", city: "Northridge", state: "CA", primaryColor: "#ce1126", secondaryColor: "#000000", prestige: 3, stadium: 3, facilities: 3, collegeLife: 6, marketing: 4, academics: 4, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 38000, nilBudget: 800000 },
      { name: "Cal State Bakersfield", mascot: "Roadrunners", abbreviation: "CSUB", city: "Bakersfield", state: "CA", primaryColor: "#003399", secondaryColor: "#f0ab00", prestige: 2, stadium: 2, facilities: 3, collegeLife: 4, marketing: 3, academics: 4, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 11000, nilBudget: 600000 },
    ],
    "HBCU": [
      { name: "Grambling State", mascot: "Tigers", abbreviation: "GRAM", city: "Grambling", state: "LA", primaryColor: "#000000", secondaryColor: "#f0ab00", prestige: 6, stadium: 4, facilities: 3, collegeLife: 5, marketing: 6, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 5000, nilBudget: 800000 },
      { name: "Southern University", mascot: "Jaguars", abbreviation: "SOU", city: "Baton Rouge", state: "LA", primaryColor: "#0033a0", secondaryColor: "#fdd023", prestige: 5, stadium: 4, facilities: 4, collegeLife: 6, marketing: 6, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 7000, nilBudget: 900000 },
      { name: "Florida A&M", mascot: "Rattlers", abbreviation: "FAMU", city: "Tallahassee", state: "FL", primaryColor: "#006747", secondaryColor: "#f47920", prestige: 6, stadium: 5, facilities: 4, collegeLife: 7, marketing: 7, academics: 5, fanbasePassion: "A+", fanbaseType: "Cult Following", enrollment: 10000, nilBudget: 1200000 },
      { name: "Bethune-Cookman", mascot: "Wildcats", abbreviation: "BCU", city: "Daytona Beach", state: "FL", primaryColor: "#8b0000", secondaryColor: "#ffd700", prestige: 5, stadium: 4, facilities: 4, collegeLife: 6, marketing: 6, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 4000, nilBudget: 700000 },
      { name: "Jackson State", mascot: "Tigers", abbreviation: "JKST", city: "Jackson", state: "MS", primaryColor: "#002b5c", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 4, collegeLife: 6, marketing: 7, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 7000, nilBudget: 1000000 },
      { name: "North Carolina A&T", mascot: "Aggies", abbreviation: "NCAT", city: "Greensboro", state: "NC", primaryColor: "#004684", secondaryColor: "#ffc72c", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Balanced", enrollment: 13000, nilBudget: 900000 },
      { name: "Alabama State", mascot: "Hornets", abbreviation: "ALST", city: "Montgomery", state: "AL", primaryColor: "#000000", secondaryColor: "#d4a843", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 5, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 5000, nilBudget: 700000 },
      { name: "Norfolk State", mascot: "Spartans", abbreviation: "NSU", city: "Norfolk", state: "VA", primaryColor: "#006747", secondaryColor: "#ffc72c", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 6000, nilBudget: 700000 },
      { name: "Alcorn State", mascot: "Braves", abbreviation: "ALCN", city: "Lorman", state: "MS", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 4, stadium: 3, facilities: 2, collegeLife: 3, marketing: 4, academics: 4, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 3500, nilBudget: 600000 },
      { name: "Prairie View A&M", mascot: "Panthers", abbreviation: "PVAM", city: "Prairie View", state: "TX", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 4, stadium: 3, facilities: 3, collegeLife: 4, marketing: 5, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 600000 },
      { name: "Texas Southern", mascot: "Tigers", abbreviation: "TXSO", city: "Houston", state: "TX", primaryColor: "#8b0000", secondaryColor: "#b0b7bc", prestige: 4, stadium: 4, facilities: 3, collegeLife: 5, marketing: 5, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 7000, nilBudget: 700000 },
      { name: "Howard", mascot: "Bison", abbreviation: "HOW", city: "Washington", state: "DC", primaryColor: "#003a63", secondaryColor: "#e51937", prestige: 5, stadium: 4, facilities: 4, collegeLife: 7, marketing: 7, academics: 7, fanbasePassion: "A", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 1000000 },
      { name: "Delaware State", mascot: "Hornets", abbreviation: "DSU", city: "Dover", state: "DE", primaryColor: "#c8102e", secondaryColor: "#00529b", prestige: 3, stadium: 3, facilities: 3, collegeLife: 4, marketing: 4, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 500000 },
      { name: "Coppin State", mascot: "Eagles", abbreviation: "COPP", city: "Baltimore", state: "MD", primaryColor: "#002d72", secondaryColor: "#ffc72c", prestige: 2, stadium: 2, facilities: 2, collegeLife: 4, marketing: 3, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 3000, nilBudget: 400000 },
      { name: "North Carolina Central", mascot: "Eagles", abbreviation: "NCCU", city: "Durham", state: "NC", primaryColor: "#8b0000", secondaryColor: "#b0b7bc", prestige: 4, stadium: 4, facilities: 3, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 8000, nilBudget: 600000 },
      { name: "Maryland Eastern Shore", mascot: "Hawks", abbreviation: "UMES", city: "Princess Anne", state: "MD", primaryColor: "#8b0000", secondaryColor: "#b7a57a", prestige: 2, stadium: 1, facilities: 2, collegeLife: 3, marketing: 3, academics: 4, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 3000, nilBudget: 400000 },
    ],
    "Missouri Valley": [
      { name: "Missouri State", mascot: "Bears", abbreviation: "MOST", city: "Springfield", state: "MO", primaryColor: "#8b0000", secondaryColor: "#ffffff", prestige: 6, stadium: 5, facilities: 5, collegeLife: 5, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 1500000 },
      { name: "Indiana State", mascot: "Sycamores", abbreviation: "INST", city: "Terre Haute", state: "IN", primaryColor: "#00529b", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 5, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1000000 },
      { name: "Illinois State", mascot: "Redbirds", abbreviation: "ILST", city: "Normal", state: "IL", primaryColor: "#ce1126", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 1000000 },
      { name: "Southern Illinois", mascot: "Salukis", abbreviation: "SIU", city: "Carbondale", state: "IL", primaryColor: "#8b0000", secondaryColor: "#000000", prestige: 6, stadium: 5, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1200000 },
      { name: "Bradley", mascot: "Braves", abbreviation: "BRAD", city: "Peoria", state: "IL", primaryColor: "#ce1126", secondaryColor: "#ffffff", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 800000 },
      { name: "Evansville", mascot: "Purple Aces", abbreviation: "EVAN", city: "Evansville", state: "IN", primaryColor: "#461d7c", secondaryColor: "#f47920", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 800000 },
      { name: "Valparaiso", mascot: "Beacons", abbreviation: "VALP", city: "Valparaiso", state: "IN", primaryColor: "#613318", secondaryColor: "#fdd023", prestige: 3, stadium: 3, facilities: 3, collegeLife: 4, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 4000, nilBudget: 700000 },
      { name: "UIC", mascot: "Flames", abbreviation: "UIC", city: "Chicago", state: "IL", primaryColor: "#001e62", secondaryColor: "#ce1126", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 1000000 },
      { name: "Belmont", mascot: "Bruins", abbreviation: "BELT", city: "Nashville", state: "TN", primaryColor: "#002d72", secondaryColor: "#ce1126", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 900000 },
      { name: "Murray State", mascot: "Racers", abbreviation: "MURR", city: "Murray", state: "KY", primaryColor: "#002d72", secondaryColor: "#fdd023", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 10000, nilBudget: 800000 },
      { name: "Western Illinois", mascot: "Leathernecks", abbreviation: "WIU", city: "Macomb", state: "IL", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 2, stadium: 2, facilities: 2, collegeLife: 4, marketing: 3, academics: 4, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 7000, nilBudget: 600000 },
      { name: "Northern Iowa", mascot: "Panthers", abbreviation: "UNI", city: "Cedar Falls", state: "IA", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 4, stadium: 3, facilities: 4, collegeLife: 5, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 10000, nilBudget: 1000000 },
      { name: "Creighton", mascot: "Bluejays", abbreviation: "CREI", city: "Omaha", state: "NE", primaryColor: "#005ca9", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 1500000 },
    ],
  };
  
  return conferenceTeams[conferenceName] || [];
}

async function generateRecruits(leagueId: string, count: number, forceStorylineReset = false, targetSeason?: number) {
  const leagueForProgression = await storage.getLeague(leagueId);
  const progressionEnabled = leagueForProgression?.progressionEnabled ?? false;

  const recruits = generateRecruitClass(count);

  // Build all recruit rows in memory, then batch-insert to avoid N sequential round-trips
  const recruitRows = recruits.map(r => ({
    leagueId,
    ...r,
    ...(progressionEnabled ? (() => {
      if (r.potential != null) {
        const range = getPotentialRange(r.potential);
        return { potentialFloor: range.floor, potentialCeiling: range.ceiling };
      }
      let pot = rollWeightedPotential();
      if (r.isBlueChip) pot = Math.max(78, pot);
      if (r.isGenerationalGem) pot = Math.max(74, pot);
      if (r.isGem && !r.isGenerationalGem) pot = Math.max(74, pot);
      const range = getPotentialRange(pot);
      return { potential: pot, potentialFloor: range.floor, potentialCeiling: range.ceiling };
    })() : {}),
  }));

  await storage.batchCreateRecruits(recruitRows);

  await generateTopSchoolsForLeague(leagueId);

  // Initialize storyline recruits after recruit class generation — fire-and-forget so the
  // caller (e.g. /api/leagues/:id/start) can respond before the heavyweight arc setup runs.
  const leagueForStoryline = await storage.getLeague(leagueId);
  if (leagueForStoryline) {
    const storylineSeason = targetSeason ?? leagueForStoryline.currentSeason;
    const doInit = async () => {
      try {
        console.log(`[storylines] Initializing storyline recruits for league ${leagueId} season ${storylineSeason} (force=${forceStorylineReset})…`);
        if (forceStorylineReset) {
          console.warn(`[storylines] Commissioner-triggered recruit class reset — existing storyline data for season ${storylineSeason} will be wiped and regenerated.`);
        }
        const storylineCount = await initializeStorylineRecruits(leagueId, storylineSeason, forceStorylineReset);
        console.log(`[storylines] Storyline initialization complete — ${storylineCount} recruits assigned arcs for season ${storylineSeason}`);
      } catch (err) {
        console.error("[storylines] Failed to initialize storyline recruits:", err);
      }
    };
    // Run asynchronously — do not await so generateRecruits returns sooner
    doInit().catch(err => console.error("[storylines] generateRecruits background init threw:", err));
  }
}

// Generate top schools for all recruits in a league based on their priorities
// With BALANCED DISTRIBUTION: ensures each team gets a fair share of #1 recruit interests
async function generateTopSchoolsForLeague(leagueId: string) {
  const teams = await storage.getTeamsByLeague(leagueId);
  const recruits = await storage.getRecruitsByLeague(leagueId);
  
  if (teams.length === 0 || recruits.length === 0) return;
  
  // Sort recruits by overall rating (descending) so top recruits get processed first
  const sortedRecruits = [...recruits].sort((a, b) => (b.overall || 0) - (a.overall || 0));
  
  // Calculate fair share and max cap for distribution
  const fairShare = Math.max(1, Math.ceil(recruits.length / teams.length));
  const maxCap = fairShare + Math.ceil(fairShare * 0.5); // Allow 50% overflow max
  
  // Track #1 assignments per team
  const teamTopInterestCount: Map<string, number> = new Map();
  teams.forEach(t => teamTopInterestCount.set(t.id, 0));
  
  // Priority weight mapping
  const priorityWeight = (priority: string | null): number => {
    switch (priority) {
      case "Extremely": return 4;
      case "Very": return 3;
      case "Somewhat": return 2;
      case "Not Important": return 1;
      default: return 2;
    }
  };
  
  // Score calculator for a recruit-team pair
  const calculateScore = (recruit: typeof recruits[0], team: typeof teams[0]): number => {
    let score = 0;
    const starRank = recruit.starRank || 3;
    const teamPrestige = team.prestige || 5;
    
    // Prestige affinity: high-star recruits strongly prefer high-prestige schools,
    // low-star recruits prefer lower-prestige schools (more playing time, better fit)
    const prestigeAffinity = (() => {
      if (starRank >= 5) {
        return teamPrestige >= 7 ? 40 : teamPrestige >= 5 ? 15 : 0;
      } else if (starRank === 4) {
        return teamPrestige >= 6 ? 30 : teamPrestige >= 4 ? 20 : 5;
      } else if (starRank === 3) {
        return Math.abs(teamPrestige - 5) <= 2 ? 25 : 10;
      } else if (starRank === 2) {
        return teamPrestige <= 5 ? 30 : teamPrestige <= 7 ? 15 : 0;
      } else {
        return teamPrestige <= 4 ? 35 : teamPrestige <= 6 ? 15 : 0;
      }
    })();
    score += prestigeAffinity;
    
    // Proximity: Higher scores for teams in same state
    const proximityWeight = priorityWeight(recruit.proximityPriority);
    if (recruit.homeState === team.state) {
      score += 30 * proximityWeight;
    } else {
      score += 10 * proximityWeight;
    }
    
    // Academics
    const academicsWeight = priorityWeight(recruit.academicsPriority);
    score += (team.academics || 5) * 3 * academicsWeight;
    
    // Prestige (priority-weighted on top of affinity)
    const prestigeWeight = priorityWeight(recruit.prestigePriority);
    score += teamPrestige * 3 * prestigeWeight;
    
    // Facilities
    const facilitiesWeight = priorityWeight(recruit.facilitiesPriority);
    score += (team.facilities || 5) * 3 * facilitiesWeight;
    
    // Reputation
    const reputationWeight = priorityWeight(recruit.reputationPriority);
    score += (teamPrestige + (team.facilities || 5)) * 1.5 * reputationWeight;
    
    // Playing time - low-star recruits value this more
    const playingTimeWeight = priorityWeight(recruit.playingTimePriority);
    const ptBonus = starRank <= 2 ? 1.5 : 1.0;
    score += (10 - teamPrestige) * 2 * playingTimeWeight * ptBonus;
    
    // Add randomness for variety
    score += Math.floor(Math.random() * 25);
    
    return score;
  };
  
  // Store all recruit top schools data for post-generation rebalancing
  const recruitTopSchoolsData: Map<string, { teamId: string; score: number; rank: number }[]> = new Map();
  
  for (const recruit of sortedRecruits) {
    // Score each team
    const teamScores = teams.map(team => ({
      team,
      score: calculateScore(recruit, team)
    }));
    
    // Sort by score for top schools list
    const sortedTeams = [...teamScores].sort((a, b) => b.score - a.score);
    const numTopSchools = 5 + Math.floor(Math.random() * 4);
    let topSchools = sortedTeams.slice(0, Math.min(numTopSchools, teams.length));
    
    // BALANCED #1 SELECTION with progressive enforcement
    if (topSchools.length > 1) {
      const topScore = topSchools[0].score;
      
      // Find best candidate that's within 15% of top score AND under fair share
      let bestSwapIdx = -1;
      let bestSwapScore = 0;
      
      for (let i = 1; i < Math.min(5, topSchools.length); i++) {
        const candidateTeam = topSchools[i].team;
        const candidateCount = teamTopInterestCount.get(candidateTeam.id) || 0;
        const scorePct = topSchools[i].score / topScore;
        
        // Check if current #1 is at or over max cap - must swap
        const top1Count = teamTopInterestCount.get(topSchools[0].team.id) || 0;
        const mustSwap = top1Count >= maxCap;
        
        // Swap if candidate is under fair share and within threshold
        // Or must swap if #1 is at max cap
        if (candidateCount < fairShare && (scorePct >= 0.85 || mustSwap)) {
          if (topSchools[i].score > bestSwapScore) {
            bestSwapIdx = i;
            bestSwapScore = topSchools[i].score;
          }
        }
      }
      
      // Perform swap if found
      if (bestSwapIdx > 0) {
        const temp = topSchools[0];
        topSchools[0] = topSchools[bestSwapIdx];
        topSchools[bestSwapIdx] = temp;
      }
    }
    
    // Track #1 assignment
    if (topSchools.length > 0) {
      const topTeamId = topSchools[0].team.id;
      teamTopInterestCount.set(topTeamId, (teamTopInterestCount.get(topTeamId) || 0) + 1);
    }
    
    // Store data for database creation
    recruitTopSchoolsData.set(recruit.id, topSchools.map((ts, idx) => ({
      teamId: ts.team.id,
      score: ts.score,
      rank: idx + 1
    })));
  }
  
  // POST-GENERATION REBALANCING PASS
  // Find teams that are over-represented and under-represented
  const overRepTeams = [...teamTopInterestCount.entries()]
    .filter(([_, count]) => count > maxCap)
    .map(([id]) => id);
  const underRepTeams = [...teamTopInterestCount.entries()]
    .filter(([_, count]) => count < Math.max(1, fairShare - 2))
    .map(([id]) => id);
  
  // If significant imbalance, perform targeted swaps with score proximity check
  if (overRepTeams.length > 0 && underRepTeams.length > 0) {
    for (const recruitId of recruitTopSchoolsData.keys()) {
      const topSchools = recruitTopSchoolsData.get(recruitId)!;
      if (topSchools.length < 2) continue;
      
      // Sort by current rank to get #1
      topSchools.sort((a, b) => a.rank - b.rank);
      const current1 = topSchools[0];
      if (!overRepTeams.includes(current1.teamId)) continue;
      
      // Find a swap candidate from under-represented teams WITH SCORE PROXIMITY CHECK
      const top1Score = current1.score;
      for (let i = 1; i < Math.min(5, topSchools.length); i++) {
        const candidate = topSchools[i];
        // Only swap if candidate score is within 15% of #1 score (preserves priority matching)
        const scorePct = candidate.score / top1Score;
        if (scorePct < 0.85) continue; // Skip if too far below in score
        
        if (underRepTeams.includes(candidate.teamId)) {
          // Swap ranks
          const oldRank1TeamId = current1.teamId;
          topSchools[i].rank = 1;
          topSchools[0].rank = i + 1;
          
          // Update counts
          teamTopInterestCount.set(oldRank1TeamId, (teamTopInterestCount.get(oldRank1TeamId) || 1) - 1);
          teamTopInterestCount.set(candidate.teamId, (teamTopInterestCount.get(candidate.teamId) || 0) + 1);
          
          // Re-sort by rank
          topSchools.sort((a, b) => a.rank - b.rank);
          
          // Update over/under lists
          const newOverCount = teamTopInterestCount.get(oldRank1TeamId) || 0;
          if (newOverCount <= maxCap) {
            const idx = overRepTeams.indexOf(oldRank1TeamId);
            if (idx >= 0) overRepTeams.splice(idx, 1);
          }
          const newUnderCount = teamTopInterestCount.get(candidate.teamId) || 0;
          if (newUnderCount >= Math.max(1, fairShare - 2)) {
            const idx = underRepTeams.indexOf(candidate.teamId);
            if (idx >= 0) underRepTeams.splice(idx, 1);
          }
          break;
        }
      }
    }
  }
  
  // Collect all top-school rows, then batch-insert in one shot
  const allTopSchoolRows: import("@shared/schema").InsertRecruitTopSchools[] = [];
  for (const [recruitId, topSchools] of recruitTopSchoolsData.entries()) {
    topSchools.sort((a, b) => a.rank - b.rank);
    const maxScore = Math.max(...topSchools.map(t => t.score)) || 100;
    for (let i = 0; i < topSchools.length; i++) {
      const ts = topSchools[i];
      const baseInterest = Math.max(30, 80 - (i * 8));
      const scoreBonus = Math.floor((ts.score / maxScore) * 5);
      const interestLevel = Math.min(80, baseInterest + scoreBonus);
      allTopSchoolRows.push({
        recruitId,
        teamId: ts.teamId,
        interestLevel,
        rank: i + 1,
        isActive: true,
        accumulatedInterest: 0,
      });
    }
  }
  await storage.batchCreateRecruitTopSchools(allTopSchoolRows);
}

// Random appearance generator for players/recruits
// conferenceName: biases skin tone distribution by conference
// eligibility: biases facial hair probability (SR/JR more likely than FR)
function getRandomAppearance(conferenceName?: string, eligibility?: string) {
  let skinTones: string[];
  if (conferenceName === "HBCU") {
    skinTones = ["dark","dark","dark","deep","deep","deep","medium","tan","olive"];
  } else if (["Pac-12","WCC"].includes(conferenceName ?? "")) {
    skinTones = ["medium","medium","tan","tan","olive","olive","light","dark"];
  } else if (["AAC","Sun Belt"].includes(conferenceName ?? "")) {
    skinTones = ["light","medium","medium","tan","tan","olive","dark","dark"];
  } else {
    skinTones = ["light","light","medium","medium","tan","olive","dark","deep"];
  }

  const hairColors = ["black", "brown", "blonde", "red", "gray"];
  const hairStyles = ["short", "buzz", "medium", "fade", "curly", "mullet", "long", "bald"];
  const headwears = ["cap", "helmet", "batting_helmet", "none"];
  const eyeStyles: string[] = ["standard", "standard", "narrow", "wide", "heavy"];
  const eyebrowStyles: string[] = ["flat", "flat", "arched", "thick", "furrowed"];
  const mouthStyles: string[] = ["neutral", "neutral", "smile", "smirk"];

  // Facial hair weighted by eligibility (players only — not recruits)
  let facialHair = "none";
  const fhRoll = Math.random();
  if (eligibility === "SR") {
    if      (fhRoll < 0.22) facialHair = "stubble";
    else if (fhRoll < 0.34) facialHair = "goatee";
    else if (fhRoll < 0.40) facialHair = "mustache";
    else if (fhRoll < 0.43) facialHair = "beard";
  } else if (eligibility === "JR") {
    if      (fhRoll < 0.15) facialHair = "stubble";
    else if (fhRoll < 0.22) facialHair = "goatee";
    else if (fhRoll < 0.26) facialHair = "mustache";
  } else if (eligibility === "SO") {
    if      (fhRoll < 0.08) facialHair = "stubble";
    else if (fhRoll < 0.11) facialHair = "goatee";
  } else { // FR or unknown
    if (fhRoll < 0.04) facialHair = "stubble";
  }

  // Eye black only for players (not recruits — caller decides); ~28% chance
  const eyeBlack = Math.random() < 0.28;

  return {
    skinTone:     skinTones[Math.floor(Math.random() * skinTones.length)],
    hairColor:    hairColors[Math.floor(Math.random() * hairColors.length)],
    hairStyle:    hairStyles[Math.floor(Math.random() * hairStyles.length)],
    headwear:     headwears[Math.floor(Math.random() * headwears.length)],
    facialHair,
    eyeStyle:     eyeStyles[Math.floor(Math.random() * eyeStyles.length)],
    eyebrowStyle: eyebrowStyles[Math.floor(Math.random() * eyebrowStyles.length)],
    mouthStyle:   mouthStyles[Math.floor(Math.random() * mouthStyles.length)],
    eyeBlack,
  };
}

/**
 * #66 — Conference-flavored ability selection for CPU-generated players.
 * HBCU teams lean athletic/scrappy; Ivy League teams lean cerebral/strategic.
 * All other conferences use the standard randomized ability pool.
 */
function getConferenceFlavoredAbilities(
  conference: string | undefined,
  position: string,
  count: number,
  preferGold: boolean
): string[] {
  const isPitcher = ["P", "SP", "RP", "CP"].includes(position);

  if (conference === "HBCU") {
    const pitcherPool = [
      "Indomitable Soul", "Big Boy Speed", "Groundball Pitcher", "Straddle",
      "Slugger Killer", "Guts", "Strikeout", "Inside Pitch", "Intimidator",
      "Pace", "Heavy Ball", "Houdini", "Natural Shuuto", "Fireman",
    ];
    const hitterPool = [
      "Express Baserunning", "High Speed Charge", "Unrelenting", "Walkoff Hitter",
      "Late Night Hero", "Contact Hitter", "Resilient", "Slap Happy", "Good Bunt",
      "vs. Ace", "Shock Commander", "Artist", "High Ball Hitter", "First Pitch King",
      "Bunt Artisan", "Insurer", "Outside Hitter", "Bases Loaded Slugger",
    ];
    const pool = isPitcher ? pitcherPool : hitterPool;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, pool.length));
  }

  if (conference === "Ivy League") {
    const pitcherPool = [
      "Sangfroid", "Decisive", "Tunneling", "High Spin Gyroball", "Sharpness",
      "Perfect Combustion", "Halting Quickness", "Monster Stuff", "Doctor K",
      "Precision Instrument", "Winner's Luck", "Release", "Escape Pitch", "Painter",
    ];
    const hitterPool = [
      "Good Bunt", "vs. Ace", "Artist", "Consigliere", "Trickster", "Disturbance",
      "Opposite Field Hitter", "Spray Hitter", "Pinch Hitter", "Counterattack",
      "High-Speed Laser", "Milliner", "Final Hit", "Surprise!", "Inside Hitter",
    ];
    const pool = isPitcher ? pitcherPool : hitterPool;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, pool.length));
  }

  return getRandomAbilities(position, count, preferGold);
}

async function generatePlayersForTeam(teamId: string, progressionEnabled: boolean = false, teamName?: string, conferenceName?: string) {
  // Calibrated rosters (via ROSTER_SCALE_FACTORS in realRosters.ts) already encode
  // the correct inter-conference AND intra-conference attribute spread based on real
  // 2026 RPI data. No additional scaling is applied here — attributes are passed
  // straight through so the in-game OVR matches the scouting/analysis OVR exactly.
  const realRoster = teamName ? SEC_REAL_ROSTERS[teamName] : undefined;

  if (realRoster && realRoster.length > 0) {
    const usedJerseyNumbers = new Set<number>();

    for (const rp of realRoster) {
      const randomAppearance = getRandomAppearance(conferenceName, rp.eligibility);
      const appearance = {
        skinTone: rp.skinTone || randomAppearance.skinTone,
        hairColor: rp.hairColor || randomAppearance.hairColor,
        hairStyle: rp.hairStyle || randomAppearance.hairStyle,
        headwear: randomAppearance.headwear,
        facialHair: randomAppearance.facialHair,
        eyeStyle: randomAppearance.eyeStyle,
        eyebrowStyle: randomAppearance.eyebrowStyle,
        mouthStyle: randomAppearance.mouthStyle,
        eyeBlack: randomAppearance.eyeBlack,
      };
      usedJerseyNumbers.add(rp.jerseyNumber);
      const isPitcher = ["P", "SP", "RP", "CP"].includes(rp.position);
      const playerData = {
        hitForAvg: rp.hitForAvg, power: rp.power, speed: rp.speed, arm: rp.arm,
        fielding: rp.fielding, errorResistance: rp.errorResistance,
        velocity: rp.velocity, control: rp.control, stamina: rp.stamina, stuff: rp.stuff,
        clutch: rp.clutch, vsLHP: rp.vsLHP, grit: rp.grit, stealing: rp.stealing,
        running: rp.running, throwing: rp.throwing, recovery: rp.recovery,
        wRISP: rp.wRISP, vsLefty: rp.vsLefty, poise: rp.poise, heater: rp.heater, agile: rp.agile,
        catcherAbility: rp.catcherAbility ?? null,
        abilities: rp.abilities,
        trajectory: rp.trajectory ?? (isPitcher ? 2 : assignTrajectory(rp.power, rp.speed, rp.hitForAvg)),
      };

      // Normalize common ability F/G distribution by conference tier.
      // normalizeCommonAbilities returns ONLY common ability keys — no identity fields leak back.
      Object.assign(playerData, normalizeCommonAbilities(
        { position: rp.position, firstName: rp.firstName, lastName: rp.lastName, ...playerData },
        conferenceName ?? "",
      ));

      // Gate gold abilities using OVR WITH abilities included: a player earns their
      // gold badge if their total OVR (incl. the +10 gold bonus) reaches ≥ 500.
      // If gold is stripped, recalculate so the stored OVR reflects the gated set.
      let rawOverall = calculateOVR(playerData);
      const gatedAbilities = enforceGoldOvrGate(playerData.abilities as string[], rp.position, rawOverall);
      if (gatedAbilities !== playerData.abilities) {
        (playerData as Record<string, unknown>).abilities = gatedAbilities;
        rawOverall = calculateOVR(playerData);
      }
      // Boost running/stealing for elite speedsters: OVR > 500 with speed 90-94 earns
      // S-grade Running; OVR > 500 with speed 95+ earns S-grade Stealing.
      if (rawOverall > 500 && typeof rp.speed === "number") {
        const spd = rp.speed;
        let boosted = false;
        if (spd >= 90 && spd <= 94 && ((playerData as Record<string, unknown>).running as number ?? 0) < 90) {
          (playerData as Record<string, unknown>).running = 90;
          boosted = true;
        } else if (spd >= 95 && ((playerData as Record<string, unknown>).stealing as number ?? 0) < 90) {
          (playerData as Record<string, unknown>).stealing = 90;
          boosted = true;
        }
        if (boosted) rawOverall = calculateOVR(playerData);
      }
      const overall = Math.max(1, Math.min(999, rawOverall));
      const starRating = getStarRatingFromOVR(overall);

      await storage.createPlayer({
        teamId,
        firstName: rp.firstName,
        lastName: rp.lastName,
        position: rp.position,
        eligibility: rp.eligibility,
        homeState: rp.homeState,
        hometown: rp.hometown,
        jerseyNumber: rp.jerseyNumber,
        overall,
        starRating,
        ...playerData,
        batHand: rp.batHand || "R",
        throwHand: rp.throwHand || "R",
        // Use playerData.catcherAbility — may have been adjusted by normalizeCommonAbilities for catchers
        skinTone: appearance.skinTone,
        hairColor: appearance.hairColor,
        hairStyle: appearance.hairStyle,
        facialHair: appearance.facialHair,
        eyeStyle: appearance.eyeStyle,
        eyebrowStyle: appearance.eyebrowStyle,
        mouthStyle: appearance.mouthStyle,
        eyeBlack: appearance.eyeBlack,
        headwear: appearance.headwear,
        potential: typeof rp.potential === 'string' ? potentialGradeToNumber(rp.potential as string) : (rp.potential ?? 71),
        ...(isPitcher
          ? generateArchetypePitchMix(
              assignPitcherArchetype(rp.position, rp.throwHand || "R", rp.velocity, rp.control, rp.stamina, rp.stuff),
              qualityTierFromOvr(rawOverall),
            )
          : noPitches),
      });
    }

    const remaining = 25 - realRoster.length;
    if (remaining > 0) {
      const fillerNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron"];
      const fillerLastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas"];
      const fillerStates = [
        { state: "CA", cities: ["Los Angeles", "San Diego"] },
        { state: "TX", cities: ["Houston", "Dallas"] },
        { state: "FL", cities: ["Miami", "Tampa"] },
        { state: "GA", cities: ["Atlanta", "Savannah"] },
      ];
      const existingPositions = realRoster.map(rp => rp.position);
      const hasCatcher = existingPositions.filter(p => p === "C").length;
      const hasPitchers = existingPositions.filter(p => p === "P").length;
      const fillerPositions: string[] = [];
      if (hasCatcher < 2) fillerPositions.push(...Array(2 - hasCatcher).fill("C"));
      if (hasPitchers < 12) fillerPositions.push(...Array(Math.min(remaining - fillerPositions.length, 12 - hasPitchers)).fill("P"));
      while (fillerPositions.length < remaining) {
        const fieldPos = ["1B", "2B", "SS", "3B", "LF", "CF", "RF"];
        fillerPositions.push(fieldPos[Math.floor(Math.random() * fieldPos.length)]);
      }
      // Deterministic FR assignment: count FR already in the real roster, fill
      // exactly (5 - realFrCount) filler slots as FR, rest as SO/JR.
      // Never set an existing player's eligibility — only newly-created fillers.
      const realFrCount = realRoster.filter(p => p.eligibility === "FR").length;
      const frFillersNeeded = Math.max(0, 5 - realFrCount);

      for (let f = 0; f < remaining; f++) {
        const fillerElig = f < frFillersNeeded ? "FR" : (Math.random() < 0.5 ? "SO" : "JR");
        const appearance = getRandomAppearance(conferenceName, fillerElig);
        const targetAvg = 25 + Math.floor(Math.random() * 15);
        const genAttr = () => Math.max(1, Math.min(99, targetAvg + Math.floor(Math.random() * 21) - 10));
        const pos = fillerPositions[f];
        const abilities: string[] = [];
        const playerData = {
          hitForAvg: genAttr(), power: genAttr(), speed: sampleNormalSpeed(), arm: genAttr(),
          fielding: genAttr(), errorResistance: genAttr(),
          velocity: sampleNormalVelocity(), control: genAttr(), stamina: genAttr(), stuff: genAttr(),
          clutch: genAttr(), vsLHP: genAttr(), grit: genAttr(), stealing: genAttr(),
          running: genAttr(), throwing: genAttr(), recovery: genAttr(),
          wRISP: genAttr(), vsLefty: genAttr(), poise: genAttr(), heater: genAttr(), agile: genAttr(),
          // catcherAbility included so normalization can adjust it for catchers
          catcherAbility: pos === "C" ? genAttr() : null,
          abilities,
        };
        // Normalize common ability distribution by conference tier.
        // Returns ONLY common ability keys — no identity fields leak back.
        Object.assign(playerData, normalizeCommonAbilities(
          { position: pos, firstName: `Filler${f}`, lastName: `${teamId}`, ...playerData },
          conferenceName ?? "",
        ));
        const rawOvr = calculateOVR(playerData);
        const ovr = Math.max(1, Math.min(999, rawOvr));
        let jerseyNum = realRoster.length + f + 1;
        while (usedJerseyNumbers.has(jerseyNum)) jerseyNum++;
        usedJerseyNumbers.add(jerseyNum);
        const stEntry = fillerStates[Math.floor(Math.random() * fillerStates.length)];

        const fillerThrowHand = (() => {
          const r = Math.random();
          if (pos === "P") return r < 0.30 ? "L" : "R";
          return r < 0.10 ? "L" : "R";
        })();
        const fillerBatHand = (() => {
          if (pos === "P") return Math.random() < 0.15 ? "L" : "R";
          const r = Math.random();
          if (r < 0.28) return "L";
          if (r < 0.31) return "S";
          return "R";
        })();

        await storage.createPlayer({
          teamId,
          firstName: fillerNames[Math.floor(Math.random() * fillerNames.length)],
          lastName: fillerLastNames[Math.floor(Math.random() * fillerLastNames.length)],
          position: pos,
          eligibility: fillerElig,
          homeState: stEntry.state,
          hometown: stEntry.cities[Math.floor(Math.random() * stEntry.cities.length)],
          jerseyNumber: jerseyNum,
          overall: ovr,
          starRating: getStarRatingFromOVR(ovr),
          ...playerData,
          batHand: fillerBatHand,
          throwHand: fillerThrowHand,
          // catcherAbility already in playerData (possibly normalized for catchers)
          skinTone: appearance.skinTone,
          hairColor: appearance.hairColor,
          hairStyle: appearance.hairStyle,
          facialHair: appearance.facialHair,
          eyeStyle: appearance.eyeStyle,
          eyebrowStyle: appearance.eyebrowStyle,
          mouthStyle: appearance.mouthStyle,
          eyeBlack: appearance.eyeBlack,
          headwear: appearance.headwear,
          potential: rollWeightedPotential(),
          ...(pos === "P"
            ? generateArchetypePitchMix(
                assignPitcherArchetype(pos, fillerThrowHand, playerData.velocity, playerData.control, playerData.stamina, playerData.stuff),
                qualityTierFromOvr(rawOvr),
              )
            : noPitches),
        });
      }
    }
    return;
  }

  const firstNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron", "Dylan", "Jake", "Austin", "Kyle", "Cole", "Mason", "Logan", "Ethan", "Noah", "Caleb"];
  const lastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez"];
  const fieldPositions = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  const rosterStates = [
    { state: "CA", cities: ["Los Angeles", "San Diego", "Sacramento", "Long Beach"] },
    { state: "TX", cities: ["Houston", "Dallas", "Austin", "San Antonio"] },
    { state: "FL", cities: ["Miami", "Tampa", "Orlando", "Jacksonville"] },
    { state: "GA", cities: ["Atlanta", "Savannah", "Augusta", "Athens"] },
    { state: "NC", cities: ["Charlotte", "Raleigh", "Durham"] },
    { state: "TN", cities: ["Nashville", "Memphis", "Knoxville"] },
    { state: "AZ", cities: ["Phoenix", "Tucson", "Scottsdale"] },
    { state: "LA", cities: ["New Orleans", "Baton Rouge", "Shreveport"] },
    { state: "AL", cities: ["Birmingham", "Tuscaloosa", "Mobile"] },
    { state: "SC", cities: ["Charleston", "Columbia", "Greenville"] },
    { state: "MS", cities: ["Jackson", "Oxford", "Starkville"] },
    { state: "OH", cities: ["Columbus", "Cincinnati", "Cleveland"] },
    { state: "IL", cities: ["Chicago", "Springfield", "Champaign"] },
    { state: "PA", cities: ["Philadelphia", "Pittsburgh", "State College"] },
    { state: "NY", cities: ["New York", "Buffalo", "Syracuse"] },
    { state: "VA", cities: ["Richmond", "Virginia Beach", "Charlottesville"] },
  ];

  // Class balance: 6 SR, 6 JR, 8 SO, 5 FR = 25 total (exactly 5 FR required)
  const eligibilityDistribution = [
    ...Array(6).fill("SR"),
    ...Array(6).fill("JR"),
    ...Array(8).fill("SO"),
    ...Array(5).fill("FR"),
  ];

  // Position distribution: 12 pitchers, 2 catchers, 11 fielders = 25 total
  const positionDistribution = [
    ...Array(12).fill("P"), // 12 pitchers
    ...Array(2).fill("C"),  // 2 catchers
    "1B", "2B", "SS", "3B", // 4 infielders
    "LF", "CF", "RF",       // 3 outfielders
    "SS", "3B", "CF", "RF", // 4 utility fielders (depth)
  ];

  // Shuffle the distributions for randomization
  const shuffledEligibilities = [...eligibilityDistribution].sort(() => Math.random() - 0.5);
  const shuffledPositions = [...positionDistribution].sort(() => Math.random() - 0.5);

  // Target attribute average by star tier (OVR ≈ 9 * avgAttr + special bonus)
  // All roster players capped at 159-650 OVR (only generational recruits can exceed)
  const getTargetAttrAvg = (): { avg: number; starTier: number } => {
    const roll = Math.random();
    if (roll < 0.05) return { avg: 65 + Math.floor(Math.random() * 8), starTier: 5 };  // 65-72 avg → ~585-648 OVR (capped 650)
    if (roll < 0.25) return { avg: 55 + Math.floor(Math.random() * 10), starTier: 4 };  // 55-64 avg → ~495-576 OVR
    if (roll < 0.65) return { avg: 42 + Math.floor(Math.random() * 10), starTier: 3 };  // 42-51 avg → ~378-459 OVR
    if (roll < 0.90) return { avg: 26 + Math.floor(Math.random() * 12), starTier: 2 };  // 26-37 avg → ~234-333 OVR
    return { avg: 18 + Math.floor(Math.random() * 8), starTier: 1 };                    // 18-25 avg → ~162-225 OVR (min ~159)
  };

  const genAttrAroundAvg = (avg: number) => Math.max(1, Math.min(100, avg + Math.floor(Math.random() * 21) - 10));

  for (let i = 0; i < 25; i++) {
    const position = shuffledPositions[i];
    const eligibility = shuffledEligibilities[i];
    const rosterStateEntry = rosterStates[Math.floor(Math.random() * rosterStates.length)];

    const { avg: targetAvg, starTier } = getTargetAttrAvg();
    const isPitcherPos = position === "P";

    // Apply tool archetype system — same logic as recruit-generator.ts
    const cpuTools = selectTools(starTier, isPitcherPos);
    const cpuToolGroups = isPitcherPos ? PITCHER_TOOL_GROUPS : HITTER_TOOL_GROUPS;
    const cpuTooledAttrs = new Set<string>(cpuTools.flatMap(t => cpuToolGroups[t] ?? []));
    const genT = (attr: string) => genToolAttr(targetAvg, cpuTooledAttrs.has(attr));

    const abilityCount = starTier === 5 ? 3 + Math.floor(Math.random() * 3) :   // 3-5
                         starTier === 4 ? 2 + Math.floor(Math.random() * 3) :   // 2-4
                         starTier === 3 ? 1 + Math.floor(Math.random() * 3) :   // 1-3
                         starTier === 2 ? Math.floor(Math.random() * 3) :       // 0-2
                         Math.random() < 0.5 ? 1 : 0;                            // 1★: 50% of 1
    // #66 — use conference-flavored ability pools for HBCU/Ivy; generic pool for all others
    const abilities = getConferenceFlavoredAbilities(conferenceName, position, abilityCount, starTier >= 4);

    const appearance = getRandomAppearance(conferenceName, eligibility);

    const hitForAvg = genT("hitForAvg");
    const power = genT("power");
    const speed = sampleNormalSpeed();
    const arm = genT("arm");
    const fielding = genT("fielding");
    const errorResistance = genT("errorResistance");
    const velocity = sampleNormalVelocity();
    const control = genT("control");
    const stamina = genT("stamina");
    const stuff = genT("stuff");
    const clutch = genT("clutch");
    const vsLHPVal = genAttrAroundAvg(targetAvg); // not in any tool group — flat variance
    const grit = genAttrAroundAvg(targetAvg);     // not in any tool group — flat variance
    const stealing = genT("stealing");
    const running = genT("running");
    const throwing = genT("throwing");
    const recovery = genAttrAroundAvg(targetAvg); // not in any tool group — flat variance
    const wRISP = genT("wRISP");
    const vsLefty = genAttrAroundAvg(targetAvg);  // not in any tool group — flat variance
    const poise = genAttrAroundAvg(targetAvg);    // not in any tool group — flat variance
    const heater = genAttrAroundAvg(targetAvg);   // not in any tool group — flat variance
    const agile = genT("agile");

    const playerData = {
      hitForAvg, power, speed, arm, fielding, errorResistance,
      velocity, control, stamina, stuff,
      clutch, vsLHP: vsLHPVal, grit, stealing, running, throwing, recovery,
      wRISP, vsLefty, poise, heater, agile,
      abilities,
    };

    const rawOverall = calculateOVR(playerData);
    const overall = Math.max(1, Math.min(999, rawOverall));
    const starRating = getStarRatingFromOVR(overall);
    const cpuThrowHand = isPitcherPos ? (Math.random() < 0.28 ? "L" : "R") : "R";
    const cpuBatHand = (() => {
      if (isPitcherPos) return Math.random() < 0.15 ? "L" : "R";
      const r = Math.random();
      if (r < 0.28) return "L";
      if (r < 0.31) return "S";
      return "R";
    })();

    await storage.createPlayer({
      teamId,
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      position,
      eligibility,
      homeState: rosterStateEntry.state,
      hometown: rosterStateEntry.cities[Math.floor(Math.random() * rosterStateEntry.cities.length)],
      jerseyNumber: i + 1,
      overall,
      starRating,
      ...playerData,
      catcherAbility: position === "C" ? genAttrAroundAvg(targetAvg) : null,
      batHand: cpuBatHand,
      throwHand: cpuThrowHand,
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
      facialHair: appearance.facialHair,
      eyeStyle: appearance.eyeStyle,
      eyebrowStyle: appearance.eyebrowStyle,
      mouthStyle: appearance.mouthStyle,
      eyeBlack: appearance.eyeBlack,
      headwear: appearance.headwear,
      potential: rollWeightedPotential(),
      ...(isPitcherPos
        ? generateArchetypePitchMix(
            assignPitcherArchetype(position, cpuThrowHand, velocity, control, stamina, stuff),
            qualityTierFromOvr(overall),
          )
        : noPitches),
      tools: cpuTools,
    });
  }
}

// Generate veteran CPU coaches for teams that don't have a coach
async function generateCpuCoaches(leagueId: string) {
  const firstNames = ["Bob", "Jim", "Steve", "Mike", "Tom", "Bill", "Joe", "Dave", "Rick", "Jack", "Paul", "John", "Mark", "Dan", "Pete", "Tony", "Ray", "Frank", "Ed", "Gary"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"];
  const archetypes = ["Balanced", "Pure CEO", "Player's Coach", "Tactician", "Old School", "Scout Master", "Academic Dean", "Dealmaker"];

  const teams = await storage.getTeamsByLeague(leagueId);
  
  for (const team of teams) {
    // Skip if team already has a coach
    if (team.coachId) continue;
    
    // Generate random veteran experience (5-25 seasons of experience)
    const seasonsExperience = 5 + Math.floor(Math.random() * 21);
    
    // Calculate level based on experience (1 level per 2 seasons on average, with variance)
    const level = Math.min(25, Math.max(1, Math.floor(seasonsExperience * 0.4 + Math.random() * 5)));
    
    // XP is level * 1000 (they've already leveled up)
    const xp = level * 1000;
    
    // Generate skill points - total skill points = level (each level gives 1 point)
    // Distribute across 4 skill trees (1-4 max per tree)
    const distributeSkillPoints = (totalPoints: number): [number, number, number, number] => {
      const skills: [number, number, number, number] = [1, 1, 1, 1]; // Start at 1 each
      let remaining = totalPoints;
      
      while (remaining > 0) {
        const idx = Math.floor(Math.random() * 4);
        if (skills[idx] < 4) {
          skills[idx]++;
          remaining--;
        } else if (skills.every(s => s >= 4)) {
          break; // Max all skills reached
        }
      }
      return skills;
    };
    
    const [scoutingSkill, evaluationSkill, pitchingRecruitingSkill, hittingRecruitingSkill] = distributeSkillPoints(level);
    
    // Generate career stats based on experience
    const winsPerSeason = 20 + Math.floor(Math.random() * 25);
    const lossesPerSeason = 45 - winsPerSeason + Math.floor(Math.random() * 10);
    const careerWins = seasonsExperience * winsPerSeason + Math.floor(Math.random() * 50);
    const careerLosses = seasonsExperience * lossesPerSeason + Math.floor(Math.random() * 50);
    
    // Conference record (slightly less than overall)
    const confWins = Math.floor(careerWins * 0.4 + Math.random() * careerWins * 0.1);
    const confLosses = Math.floor(careerLosses * 0.4 + Math.random() * careerLosses * 0.1);
    
    // Achievements based on experience and randomness
    const confChampionships = Math.floor(Math.random() * Math.min(seasonsExperience * 0.15, 5));
    const cwsAppearances = Math.floor(Math.random() * Math.min(seasonsExperience * 0.2, 8));
    const nationalChampionships = Math.random() < 0.1 ? (Math.random() < 0.5 ? 1 : 2) : 0;
    const coachOfYearAwards = Math.floor(Math.random() * Math.min(seasonsExperience * 0.05, 3));
    const allAmericans = Math.floor(seasonsExperience * 0.5 + Math.random() * 10);
    const draftPicks = Math.floor(seasonsExperience * 2 + Math.random() * 20);
    
    // Random appearance
    const appearance = getRandomAppearance();
    
    const coach = await storage.createCoach({
      userId: null, // CPU coach - no user
      teamId: team.id,
      leagueId,
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      archetype: archetypes[Math.floor(Math.random() * archetypes.length)],
      level,
      xp,
      scoutingSkill,
      evaluationSkill,
      pitchingRecruitingSkill,
      hittingRecruitingSkill,
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
      careerWins,
      careerLosses,
      confWins,
      confLosses,
      confChampionships,
      cwsAppearances,
      nationalChampionships,
      coachOfYearAwards,
      allAmericans,
      draftPicks,
    });

    // Initialize personality/traits/philosophy at creation time
    try { await ensureCoachTraits(coach, 1); } catch (traitErr) {
      console.error("[generateCpuCoach] ensureCoachTraits failed:", traitErr);
    }
    
    // Link coach to team
    await storage.updateTeam(team.id, { coachId: coach.id });
  }
}
