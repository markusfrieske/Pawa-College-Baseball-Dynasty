import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getRandomAbilities, getAbilitiesForPosition, calculateOVR, getStarRatingFromOVR } from "@shared/abilities";
import { getPotentialRange, getProgressionZone, rollWeightedPotential, getPotentialGrade } from "@shared/potential";
import { getActionPointCost } from "@shared/stateDistance";
import type { Player, TransferPortalInterest, Game, InsertPlayerSeasonStats } from "@shared/schema";
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
import { SEC_REAL_ROSTERS } from "./realRosters";
import { generateRecruitClass } from "./recruit-generator";
import { validateLeagueRosters, checkTeamRosterStructure } from "./rosterValidation";

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
});

const SALT_ROUNDS = 10;

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId && !req.session.isGuest) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

async function autoAssignLineup(storage: any, teamPlayers: Player[], teamId: string): Promise<void> {
  const positionPlayers = teamPlayers.filter(p => p.position !== "P");
  const pitchers = teamPlayers.filter(p => p.position === "P");

  const hittingScore = (p: Player) =>
    (p.hitForAvg || 0) * 0.4 + (p.power || 0) * 0.3 + (p.speed || 0) * 0.2 + (p.clutch || 0) * 0.1;

  const positionSlots = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  const starters: Player[] = [];
  const usedIds = new Set<string>();

  for (const pos of positionSlots) {
    const candidates = positionPlayers
      .filter(p => p.position === pos && !usedIds.has(p.id))
      .sort((a, b) => (b.overall || 0) - (a.overall || 0));
    if (candidates.length > 0) {
      starters.push(candidates[0]);
      usedIds.add(candidates[0].id);
    }
  }

  if (starters.length < 9) {
    const dhCandidates = positionPlayers
      .filter(p => !usedIds.has(p.id))
      .sort((a, b) => (b.overall || 0) - (a.overall || 0));
    if (dhCandidates.length > 0) {
      starters.push(dhCandidates[0]);
      usedIds.add(dhCandidates[0].id);
    }
  }

  starters.sort((a, b) => hittingScore(b) - hittingScore(a));

  for (const p of positionPlayers) {
    const idx = starters.indexOf(p);
    if (idx !== -1) {
      await storage.updatePlayer(p.id, { battingOrder: idx + 1 });
    } else {
      await storage.updatePlayer(p.id, { battingOrder: null });
    }
  }

  pitchers.sort((a, b) => (b.overall || 0) - (a.overall || 0));

  const rotationRoles = ["FRI", "SAT", "SUN", "MID"];
  for (let i = 0; i < pitchers.length; i++) {
    let role: string | null = null;
    if (i < rotationRoles.length) {
      role = rotationRoles[i];
    } else {
      const bullpenIdx = i - rotationRoles.length;
      if (bullpenIdx === 0) {
        role = "CP";
      } else if (bullpenIdx === 1) {
        role = "SU";
      } else if (bullpenIdx === 2) {
        role = "MR1";
      } else if (bullpenIdx === 3) {
        role = "MR2";
      } else if (bullpenIdx === 4) {
        role = "MR3";
      } else if (bullpenIdx === 5) {
        role = "LRP";
      } else {
        role = null;
      }
    }
    await storage.updatePlayer(pitchers[i].id, { pitchingRole: role });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.set("trust proxy", 1);

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
      res.json({ id: req.session.userId || "guest", email: "guest@guest.com" });
    } else if (req.session.userId) {
      storage.getUser(req.session.userId).then((user) => {
        if (user) {
          res.json({ id: user.id, email: user.email });
        } else {
          res.status(401).json({ message: "Not authenticated" });
        }
      });
    } else {
      res.status(401).json({ message: "Not authenticated" });
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
      
      const leaguesWithDetails = await Promise.all(
        userLeagues.map(async (league) => {
          const leagueTeams = await storage.getTeamsByLeague(league.id);
          const userTeam = leagueTeams.find((t) => !t.isCpu);
          const userCoach = userTeam?.coachId 
            ? await storage.getCoach(userTeam.coachId) 
            : undefined;
          
          return {
            ...league,
            teams: leagueTeams,
            userTeam,
            userCoach,
          };
        })
      );

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
      const allConferences = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Mountain West", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];
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

      let totalOverall = 0;
      let topPlayer: { name: string; position: string; overall: number } | null = null;
      for (const p of roster) {
        totalOverall += (p.overall || 0);
        if (!topPlayer || (p.overall || 0) > topPlayer.overall) {
          topPlayer = {
            name: `${p.firstName} ${p.lastName}`,
            position: p.position,
            overall: p.overall || 0,
          };
        }
      }

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
        topPlayer,
      });
    } catch (error) {
      console.error("Failed to fetch dashboard overview:", error);
      res.status(500).json({ message: "Failed to fetch dashboard overview" });
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

      if (league.commissionerId !== userId) {
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

      const allConferenceNames = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Mountain West", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];
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
          });

          await storage.createStandings({
            leagueId: league.id,
            teamId: team.id,
            season: 1,
          });

          totalTeamsCreated++;
        }
      }

      // Generate recruits now that teams exist
      await generateRecruits(league.id, 80);

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

      const recruitsWithInterest = await Promise.all(leagueRecruits.map(async (recruit) => {
        const interest = interests.find((i) => i.recruitId === recruit.id);
        
        // Fetch stored top schools from database (only includes teams in the league)
        const storedTopSchools = await storage.getRecruitTopSchools(recruit.id);
        
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

        return {
          ...recruit,
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
      for (const action of allTeamActions) {
        if (action.actionType === "visit" || action.actionType === "head_coach_visit") {
          if (!premiumActionsUsed[action.recruitId]) {
            premiumActionsUsed[action.recruitId] = [];
          }
          if (!premiumActionsUsed[action.recruitId].includes(action.actionType)) {
            premiumActionsUsed[action.recruitId].push(action.actionType);
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
        recruitPointCosts,
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

      // Helper function to narrow down a range (with archetype potential narrowing bonus)
      const narrowRange = (min: number, max: number, actual: number, pct: number): { newMin: number; newMax: number } => {
        const range = max - min;
        // Apply archetype bonus to how quickly ranges narrow
        const effectivePct = Math.min(100, pct * potentialNarrowMultiplier);
        const narrowFactor = effectivePct / 100;
        const newRange = Math.max(0, range * (1 - narrowFactor * 0.8));
        const halfRange = Math.floor(newRange / 2);
        let newMin = Math.max(min, actual - halfRange);
        let newMax = Math.min(max, actual + halfRange);
        if (pct >= 100) {
          return { newMin: actual, newMax: actual };
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
        // Determine which attributes to reveal
        const revealedAttrs = getAttributesToReveal(revealAmount);
        
        // Calculate initial ranges based on reveal amount
        const ovrRange = narrowRange(150, 650, recruit.overall, revealAmount);
        const starRange = narrowStarRange(1, 5, recruit.starRating, revealAmount);
        
        // Reveal abilities based on percentage
        const totalAbilities = (recruit.abilities as string[] || []).length;
        const revealedAbilitiesCount = Math.min(totalAbilities, Math.floor(totalAbilities * (revealAmount / 100)));
        
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
        
        // Add more revealed attributes based on new percentage
        const currentAttrs = (interest.revealedAttributes as string[]) || [];
        const additionalAttrs = getAttributesToReveal(newPct - currentPct, currentAttrs);
        const allAttrs = [...currentAttrs, ...additionalAttrs];
        
        // Narrow down the rating ranges
        const currentMinOvr = interest.minOverall || 150;
        const currentMaxOvr = interest.maxOverall || 650;
        const currentMinStar = interest.minStar || 1;
        const currentMaxStar = interest.maxStar || 5;
        
        const ovrRange = narrowRange(currentMinOvr, currentMaxOvr, recruit.overall, newPct);
        const starRange = narrowStarRange(currentMinStar, currentMaxStar, recruit.starRating, newPct);
        
        // Reveal more abilities
        const totalAbilities = (recruit.abilities as string[] || []).length;
        const revealedAbilitiesCount = Math.min(totalAbilities, Math.floor(totalAbilities * (newPct / 100)));
        
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
  
  // Calculate priority match bonus based on pitch topic and recruit priorities
  // Sanity-check that an action's interest gain stays inside its expected band.
  // Bands derived from spec: priority(0.5-2.0) * school(~0.7-1.4) * coach(~0.95-1.7) * proximity(1-1.5).
  // Worst case multiplier ~0.3, best ~7.0. We log when out of plausible range.
  function assertInterestGainSane(actionType: string, interestGain: number, baseGain: number) {
    const expectedMin = Math.floor(baseGain * 0.25);
    const expectedMax = Math.ceil(baseGain * 8);
    if (interestGain < expectedMin || interestGain > expectedMax) {
      console.warn(
        `[recruiting-sanity] ${actionType}: interestGain=${interestGain} outside [${expectedMin},${expectedMax}] (base=${baseGain})`,
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
  
  // Calculate school attribute bonus for a pitch topic
  function calculateSchoolBonus(pitchTopic: string, team: any): number {
    const attributeMap: Record<string, number> = {
      proximity: 1.0, // No school attribute for proximity
      reputation: (team.prestige || 5) / 5, // Prestige affects reputation pitch
      playingTime: 1.0, // Playing time is situational
      academics: (team.academics || 5) / 5,
      prestige: (team.prestige || 5) / 5,
      facilities: (team.facilities || 5) / 5,
    };
    const topicBonus = attributeMap[pitchTopic] || 1.0;
    
    const overallQuality = ((team.prestige || 5) + (team.facilities || 5) + (team.academics || 5)) / 30;
    const qualityModifier = 0.9 + (overallQuality * 0.2);
    
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
    const baseActions = 12;
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

  // Shared per-action interest formulas. Both human endpoints and the CPU
  // recruiter call these so the math is guaranteed to be identical.
  function computeEmailGain(recruit: any, team: any, coach: any, topic: string) {
    const baseGain = 3 + Math.floor(Math.random() * 5);
    const { bonus: priorityBonus, matchLevel } = calculatePriorityBonus(topic, recruit, team);
    const schoolBonus = calculateSchoolBonus(topic, team);
    const coachBonus = calculateCoachBonus(coach, recruit, "email");
    const proximityBonus = topic === "proximity" ? calculateProximityBonus(recruit.homeState, team.state) : 1.0;
    const totalMultiplier = priorityBonus * schoolBonus * coachBonus * proximityBonus;
    const interestGain = Math.round(baseGain * totalMultiplier);
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
      const gain = Math.round(baseGain * priorityBonus * schoolBonus * coachBonus * proximityBonus);
      totalInterestGain += gain;
      pitchResults.push({ topic, gain, matchLevel });
    }
    return { totalInterestGain, pitchResults };
  }
  function computeVisitGain(recruit: any, team: any, coach: any) {
    const baseGain = 20 + Math.floor(Math.random() * 16);
    const facilitiesBonus = (team.facilities || 5) / 5;
    const academicsBonus = (team.academics || 5) / 5;
    const prestigeBonus = (team.prestige || 5) / 5;
    const collegeLifeBonus = (team.collegeLife || 5) / 5;
    const schoolAttrBonus = (facilitiesBonus + academicsBonus + prestigeBonus + collegeLifeBonus) / 4;
    const coachBonus = calculateCoachBonus(coach, recruit, "visit");
    const { bonus: priorityBonus } = calculatePriorityBonus("facilities", recruit, team);
    const proximityBonus = calculateProximityBonus(recruit.homeState, team.state);
    const totalMultiplier = schoolAttrBonus * coachBonus * priorityBonus * proximityBonus;
    const interestGain = Math.round(baseGain * totalMultiplier);
    return { baseGain, interestGain, totalMultiplier };
  }
  function computeHeadCoachVisitGain(recruit: any, team: any, coach: any) {
    const baseGain = 25 + Math.floor(Math.random() * 16);
    const coachBonus = calculateCoachBonus(coach, recruit, "head_coach_visit");
    const levelBonus = 1.0 + ((coach?.level || 1) - 1) * 0.03;
    const { bonus: priorityBonus } = calculatePriorityBonus("prestige", recruit, team);
    const proximityBonus = calculateProximityBonus(recruit.homeState, team.state);
    const totalMultiplier = coachBonus * levelBonus * priorityBonus * proximityBonus;
    const interestGain = Math.round(baseGain * totalMultiplier);
    return { baseGain, interestGain, totalMultiplier };
  }
  function computeOfferGain(recruit: any, team: any, coach: any) {
    const baseGain = 15 + Math.floor(Math.random() * 10);
    const prestigeBonus = (team.prestige || 5) / 5;
    const coachBonus = calculateCoachBonus(coach, recruit, "offer");
    const { bonus: priorityBonus } = calculatePriorityBonus("playingTime", recruit, team);
    const interestGain = Math.round(baseGain * prestigeBonus * coachBonus * priorityBonus);
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
      if ((userCoach?.recruitActionsUsed || 0) >= maxRecruitingActions) {
        return res.status(400).json({ message: `You've used all ${maxRecruitingActions} recruiting points this week` });
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

      assertInterestGainSane("phone", totalInterestGain, 6 * topics.length);
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
          recruitActionsUsed: (userCoach.recruitActionsUsed || 0) + 1,
        });
      }

      const actionsRemaining = maxRecruitingActions - ((userCoach?.recruitActionsUsed || 0) + 1);
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
        league: { id: league.id, name: league.name, currentSeason: league.currentSeason },
        commitsByTeam,
        totalCommits: signedRecruits.length,
        totalRecruits: recruits.length,
      });
    } catch (error) {
      console.error("Failed to fetch commits:", error);
      res.status(500).json({ message: "Failed to fetch commits" });
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
      
      // Filter out players who have declared for the draft
      const activePlayers = teamPlayers.filter(p => !p.declaredForDraft);

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

      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can edit players" });
      }

      const player = await storage.getPlayer(req.params.playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      const mergedPlayer = { ...player, ...req.body };
      const recalcedOverall = calculateOVR(mergedPlayer);
      const recalcedStar = getStarRatingFromOVR(recalcedOverall);
      const updated = await storage.updatePlayer(req.params.playerId, {
        ...req.body,
        overall: recalcedOverall,
        starRating: recalcedStar,
      });
      
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
      
      const isCommissioner = league.commissionerId === req.session.userId;
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
      
      const isCommissioner = league.commissionerId === req.session.userId;
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
      let retentionChance = 0.30; // base

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
      const humanTeams = teams.filter(t => !t.isCpu);
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
        isCommissioner: league.commissionerId === req.session.userId,
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

      if (league.commissionerId !== req.session.userId) {
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
          sanitizedData['overall'] = calculateOVR(mergedPlayer as any);
          sanitizedData['starRating'] = getStarRatingFromOVR(sanitizedData['overall'] as number);
          const updated = await storage.updatePlayer(update.id, sanitizedData);
          results.push(updated);
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
      const isCommissioner = league.commissionerId === req.session.userId;
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
      const isCommissioner = league.commissionerId === req.session.userId;
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

  // Pitching roles - set pitching roles for the user's team
  app.put("/api/leagues/:id/pitching-roles", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) return res.status(404).json({ message: "League not found" });

      const coaches = await storage.getCoachesByLeague(req.params.id);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const isCommissioner = league.commissionerId === req.session.userId;
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
      const isCommissioner = league.commissionerId === req.session.userId;
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
      const coach = await storage.getCoach(req.params.coachId as string);
      if (!coach) {
        return res.status(404).json({ message: "Coach not found" });
      }

      const team = coach.teamId ? await storage.getTeam(coach.teamId) : undefined;
      const isOwnCoach = coach.userId === req.session.userId;

      res.json({
        coach,
        team,
        isOwnCoach,
      });
    } catch (error) {
      console.error("Failed to fetch coach:", error);
      res.status(500).json({ message: "Failed to fetch coach" });
    }
  });

  // Power Rankings — composite OVR-based team strength ranking
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

      // Build raw data per team
      const teamData = leagueTeams.map(team => {
        const players = playersByTeam.get(team.id) || [];
        const pitchers = players.filter(p => p.position === "P");
        const hitters = players.filter(p => p.position !== "P");
        const signed = signedByTeam.get(team.id) || [];

        const rosterOvr = avg(players.map(p => p.overall));
        const pitchingOvr = avg(pitchers.map(p => p.overall));
        const hittingOvr = avg(hitters.map(p => p.overall));
        const recruitingScore = avg(signed.map(r => r.overall));

        const composite = Math.round(
          rosterOvr * 0.4 +
          pitchingOvr * 0.3 +
          hittingOvr * 0.2 +
          recruitingScore * 0.1
        );

        return {
          teamId: team.id,
          teamName: team.name,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          isCpu: team.isCpu,
          composite,
          rosterOvr,
          pitchingOvr,
          hittingOvr,
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

      const rosterVals = teamData.map(t => t.rosterOvr);
      const pitchVals = teamData.map(t => t.pitchingOvr);
      const hitVals = teamData.map(t => t.hittingOvr);
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
          rosterPercentile: computePercentile(rosterVals, t.rosterOvr),
          pitchingPercentile: computePercentile(pitchVals, t.pitchingOvr),
          hittingPercentile: computePercentile(hitVals, t.hittingOvr),
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
        name: string; teamId: string; games: number; ab: number; r: number; h: number;
        doubles: number; triples: number; hr: number; rbi: number; bb: number; hbp: number; so: number; sb: number;
        cs: number; exitVeloTotal: number; barrels: number; ballsInPlay: number; hardHits: number;
        putouts: number; assists: number; fieldingErrors: number; totalChances: number;
      }
      interface PitcherAgg {
        name: string; teamId: string; games: number; ip: number; h: number; r: number; er: number;
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
                  name: b.name, teamId: side.teamId, games: 0, ab: 0, r: 0, h: 0,
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
                  name: p.name, teamId: side.teamId, games: 0, ip: 0, h: 0, r: 0, er: 0,
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

  app.get("/api/leagues/:leagueId/players/:playerId/career-stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getPlayerSeasonStats(req.params.playerId, req.params.leagueId);

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

      res.json({
        games: gamesWithTeams,
        currentWeek: league.currentWeek,
        currentSeason: league.currentSeason,
        userTeamId: userTeam?.id || null,
      });
    } catch (error) {
      console.error("Failed to fetch schedule:", error);
      res.status(500).json({ message: "Failed to fetch schedule" });
    }
  });

  app.patch("/api/leagues/:id/games/:gameId", requireAuth, async (req, res) => {
    try {
      const result = gameScoreSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid score data" });
      }

      const { homeScore, awayScore } = result.data;
      
      const game = await storage.updateGame(req.params.gameId, {
        homeScore,
        awayScore,
        isComplete: true,
      });

      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Update standings
      await updateStandingsForGame(req.params.id as string, game.season, game.homeTeamId, game.awayTeamId, homeScore, awayScore, game.isConference);

      // Award XP to coaches for wins
      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
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
          await storage.updateCoach(homeCoach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: homeCoach.skillPoints + skillPointsGained,
            careerWins: homeCoach.careerWins + (homeWon ? 1 : 0),
            careerLosses: homeCoach.careerLosses + (homeWon ? 0 : 1),
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
          await storage.updateCoach(awayCoach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: awayCoach.skillPoints + skillPointsGained,
            careerWins: awayCoach.careerWins + (homeWon ? 0 : 1),
            careerLosses: awayCoach.careerLosses + (homeWon ? 1 : 0),
          });
        }
      }

      await storage.createAuditLog({
        leagueId: req.params.id,
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

      function buildLineup(players: Player[]) {
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

        selected.sort((a, b) => ((b.hitForAvg || 0) + (b.power || 0)) - ((a.hitForAvg || 0) + (a.power || 0)));

        let ofIdx = 0;
        const lineup = selected.map((p, i) => {
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
            skinTone: p.skinTone || "light",
            hairColor: p.hairColor || "brown",
            hairStyle: p.hairStyle || "short",
            headwear: p.headwear || "cap",
            overall: p.overall || 300,
            abilities: p.abilities || [],
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
            skinTone: "light",
            hairColor: "brown",
            hairStyle: "short",
            headwear: "cap",
            overall: 300,
            abilities: [] as string[],
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

      const homeLineup = buildLineup(homePlayers);
      const awayLineup = buildLineup(awayPlayers);
      const homeStaff = pickPitchingStaff(homePlayers, game.gameType);
      const awayStaff = pickPitchingStaff(awayPlayers, game.gameType);
      const homePitcher = homeStaff.starter;
      const awayPitcher = awayStaff.starter;

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
      ): HalfInningResult {
        let outs = 0;
        let runs = 0;
        let hits = 0;
        let errors = 0;
        let bases: [string | null, string | null, string | null] = [null, null, null];
        const atBats: AtBatResult[] = [];

        while (outs < 3) {
          const batterIdx = batterIndexRef.value % 9;
          const batter = battingLineup[batterIdx];
          batterIndexRef.value++;

          const contact = batter.contact;
          const power = batter.power;
          const speed = batter.speed;
          const fieldingAvg = defFielding;

          const fatigueFactor = pitcherState.pitchCount > pitcherState.current.stamina * 0.8
            ? Math.max(0.7, 1 - (pitcherState.pitchCount - pitcherState.current.stamina * 0.8) / 100)
            : 1;
          const stuff = pitcherState.current.stuff * fatigueFactor;
          const control = pitcherState.current.control * fatigueFactor;
          const velocity = pitcherState.current.velocity;

          const contactNorm = contact / 100;
          const powerNorm = power / 100;
          const speedNorm = speed / 100;
          const stuffNorm = stuff / 100;
          const controlNorm = control / 100;
          const velocityNorm = velocity / 100;
          const fieldNorm = fieldingAvg / 100;

          const strikeoutChance = Math.max(0.10, 0.20 + stuffNorm * 0.12 + velocityNorm * 0.05 - contactNorm * 0.15);
          const walkChance = Math.max(0.03, 0.08 - controlNorm * 0.05 + contactNorm * 0.02);
          const hbpChance = 0.008;
          const errorChance = Math.max(0.005, 0.025 - fieldNorm * 0.02);

          const hitChance = Math.max(0.06, 0.14 + contactNorm * 0.08 - stuffNorm * 0.04 - velocityNorm * 0.03);

          const hrChance = Math.max(0.005, 0.012 + powerNorm * 0.03 - stuffNorm * 0.01);
          const tripleChance = Math.max(0.002, 0.004 + speedNorm * 0.006);
          const doubleChance = Math.max(0.01, 0.035 + powerNorm * 0.02 - stuffNorm * 0.01);

          const runnersOn = bases.filter(b => b !== null).length;
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
                                if (outRoll < 0.45) result = "groundout";
                                else if (outRoll < 0.80) result = "flyout";
                                else if (outRoll < 0.92) result = "lineout";
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
          let description = "";
          switch (result) {
            case "strikeout": description = `${bn} strikes out`; break;
            case "walk": description = `${bn} walks`; break;
            case "hbp": description = `${bn} hit by pitch`; break;
            case "single": description = `${bn} singles ${locations[Math.floor(Math.random() * locations.length)]}`; break;
            case "double": description = `${bn} doubles ${locations[Math.floor(Math.random() * locations.length)]}`; break;
            case "triple": description = `${bn} triples ${locations[Math.floor(Math.random() * locations.length)]}`; break;
            case "homerun": description = runsScored > 1 ? `${bn} hits a ${runsScored}-run home run!` : `${bn} hits a solo home run!`; break;
            case "groundout": description = `${bn} grounds out ${groundLocations[Math.floor(Math.random() * groundLocations.length)]}`; break;
            case "flyout": description = `${bn} flies out ${locations[Math.floor(Math.random() * locations.length)]}`; break;
            case "lineout": description = `${bn} lines out ${locations[Math.floor(Math.random() * locations.length)]}`; break;
            case "popout": description = `${bn} pops out to the infield`; break;
            case "error": description = `${bn} reaches on an error`; break;
            case "fielders_choice": description = `${bn} reaches on fielder's choice`; break;
            case "sacrifice_fly": description = `${bn} hits a sacrifice fly ${locations[Math.floor(Math.random() * locations.length)]}`; break;
            case "double_play": description = `${bn} grounds into a double play`; break;
          }
          if (runsScored > 0 && result !== "homerun") {
            description += `. ${runsScored} run${runsScored > 1 ? "s" : ""} score${runsScored === 1 ? "s" : ""}`;
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
          const maxPitches = Math.floor(pitcherState.current.stamina * 1.2) + 20;
          if (pitcherState.pitchCount > maxPitches && pitcherState.bullpenIdx < pitcherState.bullpen.length) {
            pitcherState.current = pitcherState.bullpen[pitcherState.bullpenIdx];
            pitcherState.bullpenIdx++;
            pitcherState.pitchCount = 0;
          }
        }

        return { atBats, runs, hits, errors };
      }

      const homeIdx = { value: 0 };
      const awayIdx = { value: 0 };

      const homePitcherState = { current: currentHomePitcher, pitchCount: homePitchCount, bullpen: homeStaff.bullpen, bullpenIdx: homeBullpenIdx };
      const awayPitcherState = { current: currentAwayPitcher, pitchCount: awayPitchCount, bullpen: awayStaff.bullpen, bullpenIdx: awayBullpenIdx };

      for (let inn = 1; inn <= 9; inn++) {
        const topHalf = simulateHalfInning(awayLineup, homePitcherState, awayIdx, homeFielding, false);
        totalAwayScore += topHalf.runs;

        let bottomHalf: HalfInningResult;
        if (inn === 9 && totalHomeScore > totalAwayScore) {
          bottomHalf = { atBats: [], runs: 0, hits: 0, errors: 0 };
        } else {
          bottomHalf = simulateHalfInning(homeLineup, awayPitcherState, homeIdx, awayFielding, true);
          totalHomeScore += bottomHalf.runs;
        }

        innings.push({ inning: inn, topHalf, bottomHalf });
      }

      let extraInning = 10;
      while (totalHomeScore === totalAwayScore && extraInning <= 12) {
        const topHalf = simulateHalfInning(awayLineup, homePitcherState, awayIdx, homeFielding, false);
        totalAwayScore += topHalf.runs;

        const bottomHalf = simulateHalfInning(homeLineup, awayPitcherState, homeIdx, awayFielding, true);
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
          await storage.updateCoach(homeCoach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: homeCoach.skillPoints + skillPointsGained,
            careerWins: homeCoach.careerWins + (homeWon ? 1 : 0),
            careerLosses: homeCoach.careerLosses + (homeWon ? 0 : 1),
          });
        }
      }

      if (awayTeamData?.coachId) {
        const awayCoach = await storage.getCoach(awayTeamData.coachId);
        if (awayCoach) {
          const newXp = awayCoach.xp + (homeWon ? LOSS_XP : WIN_XP);
          const newLevel = Math.floor(newXp / 1000) + 1;
          const skillPointsGained = newLevel > awayCoach.level ? 1 : 0;
          await storage.updateCoach(awayCoach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: awayCoach.skillPoints + skillPointsGained,
            careerWins: awayCoach.careerWins + (homeWon ? 0 : 1),
            careerLosses: awayCoach.careerLosses + (homeWon ? 1 : 0),
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

      const auditLogsData = await storage.getAuditLogsByLeague(league.id);
      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const humanTeams = leagueTeams.filter(t => !t.isCpu);
      const invites = await storage.getLeagueInvitesByLeague(league.id);

      res.json({
        league,
        auditLogs: auditLogsData,
        readyCoaches: [],
        totalCoaches: humanTeams.length,
        invites,
      });
    } catch (error) {
      console.error("Failed to fetch commissioner data:", error);
      res.status(500).json({ message: "Failed to fetch commissioner data" });
    }
  });

  app.post("/api/leagues/:id/advance", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const leagueId = league.id;
      const currentWeek = league.currentWeek;
      const nextWeek = currentWeek + 1;

      // ============ POWER RANKINGS SNAPSHOT ============
      // Capture rankings before any changes so the next view can show week-over-week movement
      try {
        const snapPlayers = await storage.getPlayersByLeague(leagueId);
        const snapRecruits = await storage.getRecruitsByLeague(leagueId);
        const snapTeams = await storage.getTeamsByLeague(leagueId);
        const snapPlayersByTeam = new Map<string, typeof snapPlayers>();
        for (const p of snapPlayers) {
          if (!snapPlayersByTeam.has(p.teamId)) snapPlayersByTeam.set(p.teamId, []);
          snapPlayersByTeam.get(p.teamId)!.push(p);
        }
        const snapSignedByTeam = new Map<string, typeof snapRecruits>();
        for (const r of snapRecruits) {
          if (r.signedTeamId) {
            if (!snapSignedByTeam.has(r.signedTeamId)) snapSignedByTeam.set(r.signedTeamId, []);
            snapSignedByTeam.get(r.signedTeamId)!.push(r);
          }
        }
        const avg = (nums: number[]) => nums.length === 0 ? 0 : Math.round(nums.reduce((s, v) => s + v, 0) / nums.length);
        const snapRanked = snapTeams.map(team => {
          const players = snapPlayersByTeam.get(team.id) || [];
          const pitchers = players.filter(p => p.position === "P");
          const hitters = players.filter(p => p.position !== "P");
          const signed = snapSignedByTeam.get(team.id) || [];
          const rosterOvr = avg(players.map(p => p.overall));
          const pitchingOvr = avg(pitchers.map(p => p.overall));
          const hittingOvr = avg(hitters.map(p => p.overall));
          const recruitingScore = avg(signed.map(r => r.overall));
          const composite = Math.round(rosterOvr * 0.4 + pitchingOvr * 0.3 + hittingOvr * 0.2 + recruitingScore * 0.1);
          return { teamId: team.id, composite };
        }).sort((a, b) => b.composite - a.composite);
        const snapshot = snapRanked.map((t, i) => ({ teamId: t.teamId, rank: i + 1 }));
        await storage.updateLeague(leagueId, { prevPowerRankings: snapshot } as any);
      } catch (snapErr) {
        console.error("[power-rankings-snapshot] Failed to snapshot rankings:", snapErr);
      }

      // ============ DEADLINE AUTO-READY ============
      if (league.phaseDeadline && new Date(league.phaseDeadline) <= new Date()) {
        const allLeagueCoaches = await storage.getCoachesByLeague(leagueId);
        const allLeagueTeams = await storage.getTeamsByLeague(leagueId);
        const humanTeamIds = new Set(allLeagueTeams.filter(t => !t.isCpu).map(t => t.id));
        const nonReadyHumanCoaches = allLeagueCoaches.filter(c => c.teamId && humanTeamIds.has(c.teamId) && !c.isReady);
        if (nonReadyHumanCoaches.length > 0) {
          await Promise.all(nonReadyHumanCoaches.map(c => storage.updateCoach(c.id, { isReady: true })));
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

      // Determine max weeks for season based on phase
      const seasonWeeks: Record<string, number> = {
        "short": 5,
        "medium": 5,
        "long": 10,
      };
      const maxWeeks = seasonWeeks[league.seasonLength || "medium"] || 5;
      
      // ============ CPU RECRUITING AI ============
      if (league.currentPhase === "recruiting" || league.currentPhase === "preseason" || league.currentPhase === "regular_season") {
        await runCpuRecruiting(leagueId, currentWeek, league.currentSeason);
      }
      
      // ============ RECRUIT STAGE PROGRESSION ============
      await updateRecruitStages(leagueId, nextWeek);
      
      // ============ RESET WEEKLY ACTIONS ============
      const coaches = await storage.getCoachesByLeague(leagueId);
      await Promise.all(coaches.map(coach => 
        storage.updateCoach(coach.id, {
          scoutActionsUsed: 0,
          recruitActionsUsed: 0,
        })
      ));

      // ============ AUTO-SIMULATE REGULAR SEASON GAMES ============
      const seasonGames = await storage.getGamesByLeagueSeason(leagueId, league.currentSeason);
      const incompleteGames = seasonGames.filter(g => 
        g.week === currentWeek && 
        g.phase === "regular" && 
        !g.isComplete
      );
      
      const leagueTeamsForSim = await storage.getTeamsByLeague(leagueId);
      const WIN_XP = 100;
      const LOSS_XP = 25;
      
      const gameResults = await Promise.all(incompleteGames.map(async (game) => {
        const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType);
        await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, isComplete: true, boxScore: result.boxScore });
        return { game, result };
      }));

      const coachXpAccum = new Map<string, { xp: number; wins: number; losses: number }>();

      for (const { game, result } of gameResults) {
        await updateStandingsForGame(leagueId, league.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore, game.isConference);
        try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, league.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, league.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }

        const homeTeamSim = leagueTeamsForSim.find(t => t.id === game.homeTeamId);
        const awayTeamSim = leagueTeamsForSim.find(t => t.id === game.awayTeamId);
        const homeWonSim = result.homeScore > result.awayScore;

        if (homeTeamSim?.coachId) {
          const acc = coachXpAccum.get(homeTeamSim.coachId) || { xp: 0, wins: 0, losses: 0 };
          acc.xp += homeWonSim ? WIN_XP : LOSS_XP;
          acc.wins += homeWonSim ? 1 : 0;
          acc.losses += homeWonSim ? 0 : 1;
          coachXpAccum.set(homeTeamSim.coachId, acc);
        }
        if (awayTeamSim?.coachId) {
          const acc = coachXpAccum.get(awayTeamSim.coachId) || { xp: 0, wins: 0, losses: 0 };
          acc.xp += homeWonSim ? LOSS_XP : WIN_XP;
          acc.wins += homeWonSim ? 0 : 1;
          acc.losses += homeWonSim ? 1 : 0;
          coachXpAccum.set(awayTeamSim.coachId, acc);
        }
      }

      for (const [coachId, acc] of coachXpAccum) {
        const coach = await storage.getCoach(coachId);
        if (coach) {
          const newXp = coach.xp + acc.xp;
          const newLevel = Math.floor(newXp / 1000) + 1;
          const skillPointsGained = Math.max(0, newLevel - coach.level);
          await storage.updateCoach(coach.id, {
            xp: newXp,
            level: newLevel,
            skillPoints: coach.skillPoints + skillPointsGained,
            careerWins: coach.careerWins + acc.wins,
            careerLosses: coach.careerLosses + acc.losses,
          });
        }
      }

      // ============ AUTO-GENERATE NEWS FOR REGULAR SEASON GAMES ============
      if (incompleteGames.length > 0) {
        try {
          const completedThisWeek = gameResults.map(gr => ({
            ...gr.game,
            homeScore: gr.result.homeScore,
            awayScore: gr.result.awayScore,
            isComplete: true,
            boxScore: gr.result.boxScore,
          }));
          await generateGameNewsArticles(leagueId, completedThisWeek, leagueTeamsForSim, league.currentSeason, currentWeek, league.currentPhase);
          if (currentWeek % 3 === 0) {
            await generateConferenceUpdateNews(leagueId, leagueTeamsForSim, league.currentSeason, currentWeek);
          }
        } catch (e) {
          console.error("News generation error:", e);
        }
        // ======= ACTIVITY FEED: log notable game results =======
        try {
          for (const { game, result } of gameResults) {
            const homeTeamFeed = leagueTeamsForSim.find(t => t.id === game.homeTeamId);
            const awayTeamFeed = leagueTeamsForSim.find(t => t.id === game.awayTeamId);
            if (!homeTeamFeed || !awayTeamFeed) continue;
            const homeWon = result.homeScore > result.awayScore;
            const winner = homeWon ? homeTeamFeed : awayTeamFeed;
            const loser = homeWon ? awayTeamFeed : homeTeamFeed;
            const winScore = homeWon ? result.homeScore : result.awayScore;
            const lossScore = homeWon ? result.awayScore : result.homeScore;
            await storage.createLeagueEvent({
              leagueId,
              teamId: winner.id,
              teamName: winner.name,
              teamAbbreviation: winner.abbreviation,
              eventType: "GAME_RESULT",
              description: `${winner.abbreviation} def. ${loser.abbreviation} ${winScore}-${lossScore}${game.isConference ? " (Conf)" : ""}`,
              season: league.currentSeason,
              week: currentWeek,
            });
          }
        } catch (e) { console.error("Game feed event error:", e); }
      }

      // ============ POSTSEASON / SEASON PROGRESSION ============
      const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(league.currentPhase);

      if (isPostseason) {
        if (league.currentPhase === "conference_championship") {
          const confGames = (await storage.getGamesByLeague(leagueId))
            .filter(g => g.phase === "conference_championship" && g.season === league.currentSeason && !g.isComplete);
          
          for (const game of confGames) {
            const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType || "friday");
            await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, isComplete: true, boxScore: result.boxScore });
            await updateStandingsForGame(leagueId, league.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore);
            try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, league.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, league.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
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
                  eventType: "AWARD",
                  description: `${champT.name} wins the Conference Championship! Season ${league.currentSeason}.`,
                  season: league.currentSeason,
                  week: currentWeek,
                });
              }
            }
          } catch (e) { console.error("Postseason news error:", e); }
          
          await generateSuperRegionalBracket(leagueId, league.currentSeason);
          
          const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "super_regionals", currentWeek: nextWeek });
          await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Conference Championships Complete", details: "Conference championship games have been played. Super Regionals begin!" });
          return res.json(updatedLeague);
        }
        
        if (league.currentPhase === "super_regionals") {
          const srResult = await advanceSuperRegionals(leagueId, league.currentSeason);
          
          if (srResult.done && !srResult.champion1) {
            const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "offseason_departures", currentWeek: nextWeek });
            await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Postseason Skipped", details: "Not enough teams for postseason bracket." });
            return res.json(updatedLeague);
          }
          
          if (srResult.done && srResult.champion1 && srResult.champion2) {
            await storage.createGame({
              leagueId, season: league.currentSeason, week: 0,
              homeTeamId: srResult.champion1, awayTeamId: srResult.champion2,
              phase: "cws",
            });
            const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "cws", currentWeek: nextWeek });
            await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Super Regionals Complete", details: "The final two teams advance to the College World Series!" });
            return res.json(updatedLeague);
          }
          
          await storage.updateLeague(league.id, { currentWeek: nextWeek });
          await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Super Regionals Round Complete", details: "A round of the Super Regionals has been completed." });
          const updatedLeague = await storage.getLeague(leagueId);
          return res.json(updatedLeague);
        }
        
        if (league.currentPhase === "cws") {
          const cwsResult = await advanceCWS(leagueId, league.currentSeason);
          
          if (cwsResult.done && cwsResult.champion) {
            const leagueTeams = await storage.getTeamsByLeague(leagueId);
            const champTeam = leagueTeams.find(t => t.id === cwsResult.champion);
            const runnerUpTeam = leagueTeams.find(t => t.id === cwsResult.runnerUp);
            
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
              for (const t of leagueTeams) {
                const roster = await storage.getPlayersByTeam(t.id);
                for (const p of roster) allSeasonPlayers.push({ player: p, team: t });
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
              try {
                await generateDeparturesSummaryNews(leagueId, league.currentSeason, departureResult.graduated, departureResult.draftDeclared, departureResult.transferPortal);
              } catch (e) { console.error("Departures news error:", e); }
            } catch (e) {
              console.error("Auto-process departures error:", e);
            }
            
            return res.json({ ...updatedLeague, cwsChampion: cwsResult.champion, cwsRunnerUp: cwsResult.runnerUp });
          }
          
          await storage.updateLeague(league.id, { currentWeek: nextWeek });
          await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "CWS Game Complete", details: "A game of the College World Series has been played." });
          const updatedLeague = await storage.getLeague(leagueId);
          return res.json(updatedLeague);
        }
      }

      // ============ OFFSEASON SUB-PHASE PROGRESSION ============
      const offseasonPhases = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
      
      if (league.currentPhase === "offseason_departures") {
        const existingPending = await storage.getPendingDeparturesByLeague(leagueId);
        
        if (existingPending.length === 0) {
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

          try {
            await generateDeparturesSummaryNews(leagueId, league.currentSeason, departureResult.graduated, departureResult.draftDeclared, departureResult.transferPortal);
          } catch (e) {
            console.error("Departures news error:", e);
          }
          
          return res.json({ 
            ...league, 
            currentPhase: "offseason_departures",
            departures: departureResult,
            needsDepartureReview: true 
          });
        } else {
          const leagueTeams = await storage.getTeamsByLeague(leagueId);
          const humanTeams = leagueTeams.filter(t => !t.isCpu);
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
          for (const team of leagueTeams) {
            if (team.departuresFinalized) {
              await storage.updateTeam(team.id, { departuresFinalized: false });
            }
          }
          
          await storage.createAuditLog({
            leagueId, userId: req.session.userId,
            action: "Departures Finalized",
            details: `${finalizeResult.graduated} graduated, ${finalizeResult.drafted} entered MLB draft, ${finalizeResult.transferred} entered transfer portal.`,
          });
          
          return res.json({ 
            ...finalizeResult.updatedLeague,
            departed: { graduated: finalizeResult.graduated, drafted: finalizeResult.drafted, transferred: finalizeResult.transferred },
          });
        }
      }
      
      if (["offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4"].includes(league.currentPhase)) {
        // Run CPU recruiting for leftover unsigned recruits + transfer portal
        await runCpuRecruiting(leagueId, league.currentWeek, league.currentSeason);
        await runCpuTransferPortalRecruiting(leagueId);
        await updateRecruitStages(leagueId, league.currentWeek);
        
        const phaseIndex = offseasonPhases.indexOf(league.currentPhase);
        const nextPhase = offseasonPhases[phaseIndex + 1];
        
        const updatedLeague = await storage.updateLeague(league.id, { currentPhase: nextPhase, currentWeek: nextWeek });
        await storage.createAuditLog({
          leagueId, userId: req.session.userId,
          action: `Offseason Recruiting Week ${phaseIndex}`,
          details: `Offseason recruiting week ${phaseIndex} complete. CPU teams continue recruiting.`,
        });
        
        return res.json(updatedLeague);
      }
      
      if (league.currentPhase === "offseason_signing_day") {
        const signingResult = await finalizeSigningDay(leagueId, league.currentSeason);
        
        await generateWalkonPool(leagueId);
        await processCpuWalkons(leagueId);
        
        const allTeams = await storage.getTeamsByLeague(leagueId);
        for (const team of allTeams) {
          await storage.updateTeam(team.id, { walkonReady: team.isCpu });
        }
        
        const updatedLeague = await storage.updateLeague(league.id, {
          currentPhase: "offseason_walkons",
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
        
        const walkonResult = await finalizeWalkonsPhase(leagueId, league.currentSeason);
        
        const updatedLeague = await storage.updateLeague(league.id, {
          currentWeek: 1,
          currentSeason: league.currentSeason + 1,
          currentPhase: "preseason",
        });

        try {
          const allTeamsForLineup = await storage.getTeamsByLeague(leagueId);
          for (const team of allTeamsForLineup) {
            if (!team.userId || team.userId === "cpu") {
              const teamPlayers = await storage.getPlayersByTeam(team.id);
              await autoAssignLineup(storage, teamPlayers, team.id);
            }
          }
        } catch (e) {
          console.error("CPU auto-lineup error:", e);
        }

        await storage.createAuditLog({
          leagueId: league.id,
          userId: req.session.userId,
          action: "Season Advanced",
          details: `Season ${league.currentSeason} ended. ${walkonResult.walkonsAdded} walk-ons joined rosters, ${walkonResult.newRecruits} new recruits generated. Now entering Season ${league.currentSeason + 1}.`,
        });

        try {
          const previewTeams = await storage.getTeamsByLeague(leagueId);
          await generateSeasonPreviewNewsArticle(leagueId, previewTeams, league.currentSeason + 1);
        } catch (e) {
          console.error("Season preview news error:", e);
        }

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
        return res.json(updatedLeague);
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

      res.json(updatedLeague);
    } catch (error: any) {
      console.error("Failed to advance week:", error);
      res.status(500).json({ message: "Failed to advance week", detail: error?.message || String(error) });
    }
  });

  app.post("/api/leagues/:id/sim-to-offseason", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!req.session.userId || league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can sim the full season." });
      }

      const teams = await storage.getTeamsByLeague(leagueId);
      const teamNameMap = new Map<string, string>();
      for (const t of teams) teamNameMap.set(t.id, `${t.name} ${t.mascot}`);

      const coaches = await storage.getCoachesByLeague(leagueId);
      const userCoach = coaches.find(c => c.userId === req.session.userId);
      const userTeamId = userCoach?.teamId || null;

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

          const simResults = weekGames.map(game => {
            const homePlayers = rosterCache.get(game.homeTeamId) || [];
            const awayPlayers = rosterCache.get(game.awayTeamId) || [];
            return { game, result: simulateGameWithRosters(homePlayers, awayPlayers, game.gameType) };
          });

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
            return { game, result: simulateGameWithRosters(homePlayers, awayPlayers, game.gameType || "friday") };
          });

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
                invalidateGameCache();
                currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "cws" })) as any;
              } else {
                currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "offseason_departures" })) as any;
              }
            }
          }
          continue;
        }

        if (phase === "cws") {
          let cwsDone = false;
          let cwsIterations = 0;
          while (!cwsDone && cwsIterations < 10) {
            cwsIterations++;
            const cwsResult = await advanceCWS(leagueId, currentLeague.currentSeason);
            cwsDone = cwsResult.done;
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
          currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "offseason_departures" })) as any;
          continue;
        }

        break;
      }

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Sim to Offseason",
        details: `Simulated ${iterations} advances from ${phasesVisited[0] || "unknown"} to ${currentLeague.currentPhase}. Season ${startSeason}.`,
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
      if (!req.session.userId || league.commissionerId !== req.session.userId) {
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

      const recruitingPhases = ["offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4"];
      for (const phase of recruitingPhases) {
        if (offseasonPhases.indexOf(currentLeague.currentPhase) <= offseasonPhases.indexOf(phase)) {
          await runCpuRecruiting(leagueId, currentLeague.currentWeek ?? 1, currentLeague.currentSeason);
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
          const allTeamsForLineup = await storage.getTeamsByLeague(leagueId);
          for (const team of allTeamsForLineup) {
            if (!team.userId || team.userId === "cpu") {
              const teamPlayers = await storage.getPlayersByTeam(team.id);
              await autoAssignLineup(storage, teamPlayers, team.id);
            }
          }
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
  
  // Sim to Postseason - stops at conference_championship
  app.post("/api/leagues/:id/sim-to-postseason", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!req.session.userId || league.commissionerId !== req.session.userId) {
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

        if (phase === "conference_championship") break;

        const maxWeeks = currentLeague.seasonLength === "short" ? 5 : currentLeague.seasonLength === "long" ? 10 : 5;
        const nextWeek = (currentLeague.currentWeek ?? 1) + 1;

        if (preseasonPhases.includes(phase)) {
          const weekGames = (await storage.getGamesByLeague(leagueId))
            .filter(g => g.season === currentLeague.currentSeason && g.week === currentLeague.currentWeek && !g.isComplete);
          const weekSimResults: Array<{ game: Game; result: { homeScore: number; awayScore: number; boxScore: string } }> = [];
          for (const game of weekGames) {
            const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType);
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
        details: `Simulated ${iterations} advances to ${currentLeague.currentPhase}.`,
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
      if (!req.session.userId || league.commissionerId !== req.session.userId) {
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
                currentLeague = (await storage.updateLeague(leagueId, { currentPhase: "cws" })) as any;
              } else {
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
  function simulateGameWithRosters(homePlayers: Player[], awayPlayers: Player[], gameType?: string | null): { homeScore: number; awayScore: number; boxScore: string } {

    const homeStrength = homePlayers.length > 0
      ? homePlayers.reduce((sum, p) => sum + (p.overall || 300), 0) / homePlayers.length
      : 300;
    const awayStrength = awayPlayers.length > 0
      ? awayPlayers.reduce((sum, p) => sum + (p.overall || 300), 0) / awayPlayers.length
      : 300;

    const strengthDiff = (homeStrength - awayStrength) / 300;
    const homeAdv = 0.25;
    let homeExpected = 4.5 + strengthDiff * 5.0 + homeAdv;
    let awayExpected = 4.5 - strengthDiff * 5.0;
    homeExpected = Math.max(1.0, Math.min(10, homeExpected));
    awayExpected = Math.max(1.0, Math.min(10, awayExpected));

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

    const boxScore = generateBoxScore(homeScore, awayScore, homePlayers, awayPlayers, gameType);
    return { homeScore, awayScore, boxScore: JSON.stringify(boxScore) };
  }

  async function simulateGame(homeTeamId: string, awayTeamId: string, gameType?: string | null): Promise<{ homeScore: number; awayScore: number; boxScore: string }> {
    const homePlayers = await storage.getPlayersByTeam(homeTeamId);
    const awayPlayers = await storage.getPlayersByTeam(awayTeamId);
    return simulateGameWithRosters(homePlayers, awayPlayers, gameType);
  }

  function generateBoxScore(homeScore: number, awayScore: number, homePlayers: Player[], awayPlayers: Player[], gameType?: string | null) {
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
        let rawHR = 0.12 * Math.pow(powerFactor, 1.5) + 0.01;
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

  // ============ SUPER REGIONAL BRACKET GENERATION ============
  async function generateSuperRegionalBracket(leagueId: string, season: number) {
    const leagueTeams = await storage.getTeamsByLeague(leagueId);
    const standingsList = await storage.getStandingsByLeague(leagueId, season);
    
    const rankedTeams = leagueTeams.map(t => {
      const s = standingsList.find(st => st.teamId === t.id);
      return { team: t, wins: s?.wins || 0, losses: s?.losses || 0, runsScored: s?.runsScored || 0 };
    }).sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.runsScored - a.runsScored);
    
    const maxBracketSize = Math.min(8, leagueTeams.length);
    const qualifiedTeams = rankedTeams.slice(0, maxBracketSize);
    
    // Split into two brackets: A gets seeds 1,4,5,8 and B gets seeds 2,3,6,7
    // Bracket A Round 1: 1v8, 4v5
    // Bracket B Round 1: 2v7, 3v6
    if (qualifiedTeams.length >= 8) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: qualifiedTeams[0].team.id, awayTeamId: qualifiedTeams[7].team.id,
        phase: "super_regionals", bracketSide: "A", bracketRound: 1, bracketType: "winners",
      });
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: qualifiedTeams[3].team.id, awayTeamId: qualifiedTeams[4].team.id,
        phase: "super_regionals", bracketSide: "A", bracketRound: 1, bracketType: "winners",
      });
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: qualifiedTeams[1].team.id, awayTeamId: qualifiedTeams[6].team.id,
        phase: "super_regionals", bracketSide: "B", bracketRound: 1, bracketType: "winners",
      });
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: qualifiedTeams[2].team.id, awayTeamId: qualifiedTeams[5].team.id,
        phase: "super_regionals", bracketSide: "B", bracketRound: 1, bracketType: "winners",
      });
    } else {
      // Fallback for fewer teams - simple bracket
      for (let i = 0; i < qualifiedTeams.length / 2; i++) {
        await storage.createGame({
          leagueId, season, week: 0,
          homeTeamId: qualifiedTeams[i].team.id,
          awayTeamId: qualifiedTeams[qualifiedTeams.length - 1 - i].team.id,
          phase: "super_regionals", bracketSide: i < qualifiedTeams.length / 4 ? "A" : "B",
          bracketRound: 1, bracketType: "winners",
        });
      }
    }
  }

  // ============ ADVANCE SUPER REGIONALS ============
  async function advanceSuperRegionals(leagueId: string, season: number): Promise<{ done: boolean; champion1?: string; champion2?: string }> {
    const allGames = await storage.getGamesByLeague(leagueId);
    const srGames = allGames.filter(g => g.phase === "super_regionals" && g.season === season);
    
    const incompleteGames = srGames.filter(g => !g.isComplete);
    
    if (incompleteGames.length > 0) {
      // Find the earliest round among incomplete games to simulate only that round
      const minRound = Math.min(...incompleteGames.map(g => g.bracketRound ?? 0));
      const typeOrder: Record<string, number> = { winners: 0, losers: 1, bracket_final: 2, if_necessary: 3 };
      const currentRoundGames = incompleteGames.filter(g => (g.bracketRound ?? 0) === minRound);
      // Among same-round games, pick the earliest type
      const minTypeOrder = Math.min(...currentRoundGames.map(g => typeOrder[g.bracketType ?? "winners"] ?? 0));
      const gamesToSimulate = currentRoundGames.filter(g => (typeOrder[g.bracketType ?? "winners"] ?? 0) === minTypeOrder);
      
      const postseasonRotation = ["friday", "saturday", "sunday"];
      for (let gi = 0; gi < gamesToSimulate.length; gi++) {
        const game = gamesToSimulate[gi];
        const psGameType = game.gameType || postseasonRotation[gi % 3];
        const result = await simulateGame(game.homeTeamId, game.awayTeamId, psGameType);
        await storage.updateGame(game.id, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          isComplete: true,
          boxScore: result.boxScore,
        });
        try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, season, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, season, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
      }
    }
    
    // Re-fetch all SR games after simulation
    const updatedAllGames = await storage.getGamesByLeague(leagueId);
    const updatedSRGames = updatedAllGames.filter(g => g.phase === "super_regionals" && g.season === season);
    
    // Process each bracket side to create next-round games
    const sideAChampion = await processBracketSide(leagueId, season, updatedSRGames, "A");
    const sideBChampion = await processBracketSide(leagueId, season, updatedSRGames, "B");
    
    if (sideAChampion && sideBChampion) {
      return { done: true, champion1: sideAChampion, champion2: sideBChampion };
    }
    
    // Check if new games were just created that need to be played next advance
    const pendingGames = (await storage.getGamesByLeague(leagueId))
      .filter(g => g.phase === "super_regionals" && g.season === season && !g.isComplete);
    if (pendingGames.length > 0) {
      return { done: false };
    }
    
    // All games complete but one side may still need game creation - re-process
    const finalAllGames = await storage.getGamesByLeague(leagueId);
    const finalSRGames = finalAllGames.filter(g => g.phase === "super_regionals" && g.season === season);
    const finalA = await processBracketSide(leagueId, season, finalSRGames, "A");
    const finalB = await processBracketSide(leagueId, season, finalSRGames, "B");
    
    if (finalA && finalB) {
      return { done: true, champion1: finalA, champion2: finalB };
    }
    
    // New games were created by processBracketSide
    const newPending = (await storage.getGamesByLeague(leagueId))
      .filter(g => g.phase === "super_regionals" && g.season === season && !g.isComplete);
    if (newPending.length > 0) {
      return { done: false };
    }
    
    return { done: true, champion1: finalA || undefined, champion2: finalB || undefined };
  }

  function getGameWinner(game: Game): string {
    return (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.homeTeamId : game.awayTeamId;
  }
  
  function getGameLoser(game: Game): string {
    return (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.awayTeamId : game.homeTeamId;
  }

  async function processBracketSide(leagueId: string, season: number, allSRGames: Game[], side: string): Promise<string | null> {
    const sideGames = allSRGames.filter(g => g.bracketSide === side && g.isComplete);
    const pendingSide = allSRGames.filter(g => g.bracketSide === side && !g.isComplete);
    
    if (pendingSide.length > 0) return null; // Still games to play
    
    // Get games by round and type
    const winnersR1 = sideGames.filter(g => g.bracketRound === 1 && g.bracketType === "winners");
    const winnersR2 = sideGames.filter(g => g.bracketRound === 2 && g.bracketType === "winners");
    const losersR1 = sideGames.filter(g => g.bracketRound === 1 && g.bracketType === "losers");
    const losersR2 = sideGames.filter(g => g.bracketRound === 2 && g.bracketType === "losers");
    const bracketFinal = sideGames.filter(g => g.bracketType === "bracket_final");
    const ifNecessary = sideGames.filter(g => g.bracketType === "if_necessary");
    
    // If only 1 game in winners R1 (small bracket side), the winner is the side champion
    if (winnersR1.length === 1 && winnersR1.length === sideGames.length) {
      return getGameWinner(winnersR1[0]);
    }
    
    // If bracket has 0 winners R1 games, no champion can be determined
    if (winnersR1.length === 0) return null;
    
    // If only 1 R1 game but other games exist (shouldn't happen but guard against it)
    if (winnersR1.length === 1) {
      // Check if all side games are complete and we have a bracket final winner
      if (bracketFinal.length > 0) return getGameWinner(bracketFinal[0]);
      if (ifNecessary.length > 0) return getGameWinner(ifNecessary[0]);
      return getGameWinner(winnersR1[0]);
    }
    
    // Round 1 Winners must be complete (2+ games) for full double-elimination
    
    // Create Winners R2 (winners semis) if not exists
    if (winnersR2.length === 0) {
      const w1 = getGameWinner(winnersR1[0]);
      const w2 = getGameWinner(winnersR1[1]);
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: w1, awayTeamId: w2,
        phase: "super_regionals", bracketSide: side, bracketRound: 2, bracketType: "winners",
      });
      return null;
    }
    
    // Create Losers R1 (first elimination game) if not exists
    if (losersR1.length === 0) {
      const l1 = getGameLoser(winnersR1[0]);
      const l2 = getGameLoser(winnersR1[1]);
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: l1, awayTeamId: l2,
        phase: "super_regionals", bracketSide: side, bracketRound: 1, bracketType: "losers",
      });
      return null;
    }
    
    // Create Losers R2 (losers bracket final): Loser of Winners R2 vs Winner of Losers R1
    if (losersR2.length === 0 && winnersR2.length > 0 && losersR1.length > 0) {
      const wbLoser = getGameLoser(winnersR2[0]);
      const lbWinner = getGameWinner(losersR1[0]);
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: lbWinner, awayTeamId: wbLoser,
        phase: "super_regionals", bracketSide: side, bracketRound: 2, bracketType: "losers",
      });
      return null;
    }
    
    // Create Bracket Final: Winner of Winners R2 vs Winner of Losers R2
    if (bracketFinal.length === 0 && losersR2.length > 0) {
      const wbChamp = getGameWinner(winnersR2[0]);
      const lbChamp = getGameWinner(losersR2[0]);
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: wbChamp, awayTeamId: lbChamp,
        phase: "super_regionals", bracketSide: side, bracketRound: 3, bracketType: "bracket_final",
      });
      return null;
    }
    
    // Check bracket final result
    if (bracketFinal.length > 0) {
      const wbChamp = getGameWinner(winnersR2[0]);
      const bfWinner = getGameWinner(bracketFinal[0]);
      
      // If winners bracket champion won the bracket final, they're the bracket champion (undefeated)
      if (bfWinner === wbChamp) {
        return bfWinner;
      }
      
      // If losers bracket team won, we need an if-necessary game
      if (ifNecessary.length === 0) {
        const bfLoser = getGameLoser(bracketFinal[0]);
        await storage.createGame({
          leagueId, season, week: 0,
          homeTeamId: bfWinner, awayTeamId: bfLoser,
          phase: "super_regionals", bracketSide: side, bracketRound: 4, bracketType: "if_necessary",
        });
        return null;
      }
      
      // If-necessary game is complete, winner is bracket champion
      return getGameWinner(ifNecessary[0]);
    }
    
    return null;
  }

  // ============ ADVANCE CWS (BEST OF 3) ============
  async function advanceCWS(leagueId: string, season: number): Promise<{ done: boolean; champion?: string; runnerUp?: string }> {
    const allGames = await storage.getGamesByLeague(leagueId);
    const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season);
    
    const incompleteGames = cwsGames.filter(g => !g.isComplete);
    const cwsRotation = ["friday", "saturday", "sunday"];
    for (let gi = 0; gi < incompleteGames.length; gi++) {
      const game = incompleteGames[gi];
      const cwsGameType = game.gameType || cwsRotation[gi % 3];
      const result = await simulateGame(game.homeTeamId, game.awayTeamId, cwsGameType);
      await storage.updateGame(game.id, {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        isComplete: true,
        boxScore: result.boxScore,
      });
      try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(leagueId, season, game.homeTeamId, box.home); await accumulatePlayerStats(leagueId, season, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
    }
    
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

    const attrFields = [
      "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
      "velocity", "control", "stamina", "stuff",
    ] as const;
    const commonFields = [
      "clutch", "vsLHP", "grit", "stealing", "running", "throwing",
      "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
    ] as const;

    for (const team of teams) {
      const roster = await storage.getPlayersByTeam(team.id);
      for (const player of roster) {
        if (player.potential == null) continue;

        const targetOvrDelta = getOvrDeltaFromPotential(player.potential);

        const updates: Record<string, number> = {};
        const deltas: Record<string, number> = {};

        const presentAttrFields = attrFields.filter(f => (player as any)[f] != null);
        const presentCommonFields = commonFields.filter(f => (player as any)[f] != null);
        const totalFields = presentAttrFields.length + presentCommonFields.length;
        if (totalFields === 0) continue;

        const targetAvgAttrDelta = targetOvrDelta / 10;

        const rawAttrDeltas: number[] = [];
        for (const attr of presentAttrFields) {
          rawAttrDeltas.push(targetAvgAttrDelta + (Math.random() - 0.5) * 2);
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
          const variance = (Math.random() - 0.5) * 2;
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
        const newOverall = calculateOVR(updatedPlayerData);
        updates["overall"] = newOverall;
        const ovrDelta = newOverall - player.overall;
        if (ovrDelta !== 0) deltas["overall"] = ovrDelta;

        updates["starRating"] = getStarRatingFromOVR(newOverall);

        (updates as any)["progressionDeltas"] = Object.keys(deltas).length > 0 ? deltas : null;

        await storage.updatePlayer(player.id, updates);
        progressed++;
      }
    }
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
        const overallFactor = (player.overall || 300) / 650;
        
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

    for (const team of teams) {
      const roster = await storage.getPlayersByTeam(team.id);
      const pending = roster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained");

      for (const player of pending) {
        if (player.departureType === "graduated" || player.departureType === "draft") {
          try {
            await storage.createPlayerHistory({
              leagueId,
              teamId: team.id,
              firstName: player.firstName,
              lastName: player.lastName,
              position: player.position,
              finalEligibility: player.eligibility,
              overall: player.overall ?? 300,
              starRating: player.starRating ?? 3,
              departureType: player.departureType,
              draftRound: player.draftRound || null,
              departedSeason: league.currentSeason,
              seasonsPlayed: eligMap[player.eligibility] || 1,
              abilities: player.abilities || [],
              homeState: player.homeState || "",
              hometown: player.hometown || "",
            });
          } catch (e) {
            console.error(`Failed to create history for ${player.firstName} ${player.lastName}:`, e);
          }
          await storage.deletePlayer(player.id);
          if (player.departureType === "graduated") totalGraduated++;
          else totalDrafted++;
        } else if (player.departureType === "transfer") {
          try {
            await storage.createPlayerHistory({
              leagueId,
              teamId: team.id,
              firstName: player.firstName,
              lastName: player.lastName,
              position: player.position,
              finalEligibility: player.eligibility,
              overall: player.overall ?? 300,
              starRating: player.starRating ?? 3,
              departureType: "transfer_portal",
              departedSeason: league.currentSeason,
              seasonsPlayed: eligMap[player.eligibility] || 1,
              abilities: player.abilities || [],
              homeState: player.homeState || "",
              hometown: player.hometown || "",
            });
          } catch (e) {
            console.error(`Failed to create transfer history for ${player.firstName} ${player.lastName}:`, e);
          }
          await storage.updatePlayer(player.id, {
            pendingDeparture: false,
            retentionStatus: null,
            inTransferPortal: true,
          });
          totalTransferred++;
        }
      }

      const retained = roster.filter(p => p.pendingDeparture && p.retentionStatus === "retained");
      for (const player of retained) {
        await storage.updatePlayer(player.id, {
          pendingDeparture: false,
          departureType: null,
          draftRound: null,
        });
      }
    }

    // Add transfer portal players to the existing recruiting pool as TRANSFER recruits
    const existingRecruits = await storage.getRecruitsByLeague(leagueId);
    const existingSourceIds = new Set(existingRecruits.filter(r => r.sourcePlayerId).map(r => r.sourcePlayerId));
    
    const allTeamsForTransfers = await storage.getTeamsByLeague(leagueId);
    const transfersToAdd: Array<{ player: any; teamName: string }> = [];
    
    for (const team of allTeamsForTransfers) {
      const roster = await storage.getPlayersByTeam(team.id);
      const portalPlayers = roster.filter(p => p.inTransferPortal);
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
      return { graduated: grads.length, draftDeclared: drafts.length, transferPortal: transfers.length };
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
    
    // Also include juniors/RS with high enough OVR for draft consideration
    const juniorDraftCandidates = allRosterPlayers.filter(({ player }) => 
      (player.eligibility === "JR" || player.eligibility === "RS") && 
      !player.declaredForDraft &&
      (player.overall || 0) >= 400
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
      
      // Juniors/RS projected in first 3 rounds auto-declare for draft
      const juniorsOnTeam = roster.filter(p => 
        (p.eligibility === "JR" || p.eligibility === "RS") && 
        p.eligibility !== "SR" &&
        !p.declaredForDraft
      );
      for (const player of juniorsOnTeam) {
        const projectedRound = draftProjections.get(player.id);
        if (projectedRound) {
          const ask = generateDraftAsk(player.overall);
          // Draft declarations for juniors are harder to retain: higher ask
          const draftMultiplier = projectedRound === 1 ? 2.0 : projectedRound === 2 ? 1.5 : 1.2;
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
    }
    
    return { graduated: totalGraduated, draftDeclared: totalDraftDeclared, transferPortal: totalTransferPortal };
  }
  
  // ============ CPU TRANSFER PORTAL RECRUITING ============
  async function runCpuTransferPortalRecruiting(leagueId: string) {
    const teams = await storage.getTeamsByLeague(leagueId);
    const cpuTeams = teams.filter(t => t.isCpu);
    
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
    
    const TARGET_PER_POS = 12;
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
          hitForAvg: randAttr(), power: randAttr(), speed: randAttr(),
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
          throwHand: Math.random() > 0.7 ? "L" : "R",
          batHand: Math.random() > 0.65 ? "L" : "R",
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

  async function processAllTeamWalkons(leagueId: string) {
    const teams = await storage.getTeamsByLeague(leagueId);
    const MAX_ROSTER = 25;
    
    for (const team of teams) {
      let roster = await storage.getPlayersByTeam(team.id);
      
      if (roster.length > MAX_ROSTER && team.isCpu) {
        const positionCounts: Record<string, number> = {};
        for (const p of roster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        
        const cuttable = roster.filter(p => (positionCounts[p.position] || 0) > 1)
          .sort((a, b) => (a.overall || 0) - (b.overall || 0));
        
        let toCut = roster.length - MAX_ROSTER;
        const currentLeagueData = await storage.getLeague(leagueId);
        const currentSeason = currentLeagueData?.currentSeason || 1;
        
        for (const player of cuttable) {
          if (toCut <= 0) break;
          if ((positionCounts[player.position] || 0) > 1) {
            const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };
            await storage.createPlayerHistory({
              leagueId,
              teamId: team.id,
              firstName: player.firstName,
              lastName: player.lastName,
              position: player.position,
              finalEligibility: player.eligibility,
              overall: player.overall,
              starRating: player.starRating,
              departureType: "cut_juco",
              departedSeason: currentSeason,
              seasonsPlayed: eligMap[player.eligibility] || 1,
              abilities: player.abilities || [],
              homeState: player.homeState,
              hometown: player.hometown,
            });
            await storage.deletePlayer(player.id);
            positionCounts[player.position]--;
            toCut--;
          }
        }
        
        roster = await storage.getPlayersByTeam(team.id);
      }
      
      if (roster.length < MAX_ROSTER) {
        const positionCounts: Record<string, number> = {};
        for (const p of roster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        
        let pool = await storage.getWalkonsByLeague(leagueId);
        let available = pool.filter(w => !w.signedTeamId);
        let slotsToFill = MAX_ROSTER - roster.length;
        
        while (slotsToFill > 0 && available.length > 0) {
          const allPositions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
          const posNeeds = allPositions.map(pos => ({ pos, count: positionCounts[pos] || 0 }))
            .sort((a, b) => a.count - b.count);
          
          let signed = false;
          for (const need of posNeeds) {
            const candidates = available.filter(w => w.position === need.pos)
              .sort((a, b) => (b.overall || 0) - (a.overall || 0));
            
            if (candidates.length > 0) {
              const best = candidates[0];
              await storage.updateWalkon(best.id, { signedTeamId: team.id, signedTeamName: team.name });
              positionCounts[need.pos] = (positionCounts[need.pos] || 0) + 1;
              slotsToFill--;
              signed = true;
              available = available.filter(w => w.id !== best.id);
              break;
            }
          }
          
          if (!signed) {
            const bestAvail = available.sort((a, b) => (b.overall || 0) - (a.overall || 0))[0];
            if (bestAvail) {
              await storage.updateWalkon(bestAvail.id, { signedTeamId: team.id, signedTeamName: team.name });
              positionCounts[bestAvail.position] = (positionCounts[bestAvail.position] || 0) + 1;
              slotsToFill--;
              available = available.filter(w => w.id !== bestAvail.id);
            } else {
              break;
            }
          }
        }
      }
    }
  }

  async function processCpuWalkons(leagueId: string) {
    const teams = await storage.getTeamsByLeague(leagueId);
    const MAX_ROSTER = 25;
    
    for (const team of teams) {
      if (!team.isCpu) continue;
      
      let roster = await storage.getPlayersByTeam(team.id);
      
      if (roster.length > MAX_ROSTER) {
        const positionCounts: Record<string, number> = {};
        for (const p of roster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        
        const cuttable = roster.filter(p => (positionCounts[p.position] || 0) > 1)
          .sort((a, b) => (a.overall || 0) - (b.overall || 0));
        
        let toCut = roster.length - MAX_ROSTER;
        const currentLeagueData = await storage.getLeague(leagueId);
        const currentSeason = currentLeagueData?.currentSeason || 1;
        
        for (const player of cuttable) {
          if (toCut <= 0) break;
          if ((positionCounts[player.position] || 0) > 1) {
            const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };
            await storage.createPlayerHistory({
              leagueId,
              teamId: team.id,
              firstName: player.firstName,
              lastName: player.lastName,
              position: player.position,
              finalEligibility: player.eligibility,
              overall: player.overall,
              starRating: player.starRating,
              departureType: "cut_juco",
              departedSeason: currentSeason,
              seasonsPlayed: eligMap[player.eligibility] || 1,
              abilities: player.abilities || [],
              homeState: player.homeState,
              hometown: player.hometown,
            });
            await storage.deletePlayer(player.id);
            positionCounts[player.position]--;
            toCut--;
          }
        }
        
        roster = await storage.getPlayersByTeam(team.id);
      }
      
      if (roster.length < MAX_ROSTER) {
        const positionCounts: Record<string, number> = {};
        for (const p of roster) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        
        let pool = await storage.getWalkonsByLeague(leagueId);
        let available = pool.filter(w => !w.signedTeamId);
        let slotsToFill = MAX_ROSTER - roster.length;
        
        while (slotsToFill > 0 && available.length > 0) {
          const allPositions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
          const posNeeds = allPositions.map(pos => ({ pos, count: positionCounts[pos] || 0 }))
            .sort((a, b) => a.count - b.count);
          
          let signed = false;
          for (const need of posNeeds) {
            const candidates = available.filter(w => w.position === need.pos)
              .sort((a, b) => (b.overall || 0) - (a.overall || 0));
            
            if (candidates.length > 0) {
              const best = candidates[0];
              await storage.updateWalkon(best.id, { signedTeamId: team.id, signedTeamName: team.name });
              positionCounts[need.pos] = (positionCounts[need.pos] || 0) + 1;
              slotsToFill--;
              signed = true;
              available = available.filter(w => w.id !== best.id);
              break;
            }
          }
          
          if (!signed) {
            const bestAvail = available.sort((a, b) => (b.overall || 0) - (a.overall || 0))[0];
            if (bestAvail) {
              await storage.updateWalkon(bestAvail.id, { signedTeamId: team.id, signedTeamName: team.name });
              positionCounts[bestAvail.position] = (positionCounts[bestAvail.position] || 0) + 1;
              slotsToFill--;
              available = available.filter(w => w.id !== bestAvail.id);
            } else {
              break;
            }
          }
        }
      }
    }
  }

  async function finalizeSigningDay(leagueId: string, completedSeason: number) {
    console.log(`[finalizeSigningDay] Starting for league ${leagueId}, season ${completedSeason}`);
    const progressionResult = await applyPlayerProgression(leagueId);
    console.log(`[finalizeSigningDay] Progression complete: ${progressionResult.progressed} players`);

    const teams = await storage.getTeamsByLeague(leagueId);
    let totalRecruitsAdded = 0;
    let totalTransferred = 0;

    const MIN_ROSTER = 20;
    const cpuTeamsNeedingRecruits: Array<{ team: typeof teams[0]; needed: number; positionCounts: Record<string, number> }> = [];
    const allRecruitsPreCheck = await storage.getRecruitsByLeague(leagueId);

    for (const team of teams) {
      if (!team.isCpu) continue;
      const currentRoster = await storage.getPlayersByTeam(team.id);
      const alreadySignedCount = allRecruitsPreCheck.filter(r => r.signedTeamId === team.id).length;
      const projectedSize = currentRoster.length + alreadySignedCount;
      if (projectedSize < MIN_ROSTER) {
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
          departureType: wasSignedAsRecruit ? "transfer_signed" : "transfer_juco",
          departedSeason: completedSeason,
          seasonsPlayed: eligMap[player.eligibility] || 1,
          abilities: player.abilities || [],
          homeState: player.homeState,
          hometown: player.hometown,
        });

        if (!wasSignedAsRecruit) {
          const jucoEligMap: Record<string, string> = { "FR": "SO", "SO": "JR", "JR": "SR" };
          const newElig = jucoEligMap[player.eligibility] || player.eligibility;
          if (newElig !== "SR") {
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

      for (const recruit of signedRecruits) {
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
          pitchSPL: recruit.pitchSPL ?? 0,
          abilities: recruit.abilities || [],
          skinTone: recruit.skinTone || "light",
          hairColor: recruit.hairColor || "brown",
          hairStyle: recruit.hairStyle || "short",
          headwear: recruit.headwear || "cap",
          potential: recruit.potential ?? null,
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

  async function finalizeWalkonsPhase(leagueId: string, completedSeason: number) {
    const teams = await storage.getTeamsByLeague(leagueId);
    let totalWalkonsAdded = 0;

    const walkons = await storage.getWalkonsByLeague(leagueId);

    for (const team of teams) {
      const signedWalkons = walkons.filter(w => w.signedTeamId === team.id);
      for (const walkon of signedWalkons) {
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

    const unsignedRealWalkons = walkons.filter(w => !w.signedTeamId && !w.isGenerated);

    await storage.deleteWalkonsByLeague(leagueId);

    await storage.deleteRecruitsByLeague(leagueId);

    const recruitCount = 80;
    await generateRecruits(leagueId, recruitCount);

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

        await storage.createRecruit({
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
          sourcePlayerId: null,
          fromTeamName: null,
        });
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

    return {
      walkonsAdded: totalWalkonsAdded,
      newRecruits: recruitCount,
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
    };
  }
  
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
      
      if (league.commissionerId !== req.session.userId) {
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

  app.post("/api/leagues/:id/walkons/:walkonId/sign", requireAuth, async (req, res) => {
    try {
      const { id: leagueId, walkonId } = req.params;
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
      
      const roster = await storage.getPlayersByTeam(team.id);
      if (roster.length >= 25) {
        return res.status(400).json({ message: "Roster is full (25 players). Cut a player first." });
      }
      
      const walkons = await storage.getWalkonsByLeague(leagueId);
      const walkon = walkons.find(w => w.id === walkonId);
      if (!walkon) return res.status(404).json({ message: "Walk-on not found" });
      if (walkon.signedTeamId) {
        return res.status(400).json({ message: `Already signed by ${walkon.signedTeamName || "another team"}` });
      }
      
      const updated = await storage.updateWalkon(walkonId, { signedTeamId: team.id, signedTeamName: team.name });

      try {
        const leagueForEvent = await storage.getLeague(leagueId);
        await storage.createLeagueEvent({
          leagueId,
          teamId: team.id,
          eventType: "WALKON",
          teamName: team.name,
          teamAbbreviation: team.abbreviation,
          description: `${team.name} signed walk-on ${walkon.firstName} ${walkon.lastName} (${walkon.position})`,
          season: leagueForEvent?.currentSeason || 1,
          week: leagueForEvent?.currentWeek || 1,
        });
      } catch (e) { console.error("League event error:", e); }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to sign walk-on" });
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
        departureType: "cut_juco",
        departedSeason: league.currentSeason,
        seasonsPlayed: eligMap[player.eligibility] || 1,
        abilities: player.abilities || [],
        homeState: player.homeState,
        hometown: player.hometown,
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
      
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const teamMap = Object.fromEntries(leagueTeams.map(t => [t.id, { name: t.name, abbreviation: t.abbreviation, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor }]));
      
      let confChampGames = allGames.filter(g => g.phase === "conference_championship" && g.season === season);
      let srGames = allGames.filter(g => g.phase === "super_regionals" && g.season === season);
      let cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season);
      
      if (confChampGames.length === 0 && srGames.length === 0 && cwsGames.length === 0 && season > 1 && !req.query.season) {
        season = league.currentSeason - 1;
        confChampGames = allGames.filter(g => g.phase === "conference_championship" && g.season === season);
        srGames = allGames.filter(g => g.phase === "super_regionals" && g.season === season);
        cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season);
      }
      
      const standingsList = await storage.getStandingsByLeague(leagueId, season);
      const rankedTeamIds = leagueTeams
        .map(t => {
          const s = standingsList.find(st => st.teamId === t.id);
          return { id: t.id, wins: s?.wins || 0, losses: s?.losses || 0, runsScored: s?.runsScored || 0 };
        })
        .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.runsScored - a.runsScored)
        .map(t => t.id);
      
      const enrichGame = (g: any) => ({
        ...g,
        homeTeam: teamMap[g.homeTeamId],
        awayTeam: teamMap[g.awayTeamId],
        homeSeed: rankedTeamIds.indexOf(g.homeTeamId) + 1,
        awaySeed: rankedTeamIds.indexOf(g.awayTeamId) + 1,
      });
      
      const enrichedSR = srGames.map(enrichGame).sort((a: any, b: any) => {
        if (a.bracketSide !== b.bracketSide) return (a.bracketSide || "A") < (b.bracketSide || "B") ? -1 : 1;
        if (a.bracketRound !== b.bracketRound) return (a.bracketRound || 0) - (b.bracketRound || 0);
        const typeOrder: Record<string, number> = { winners: 0, losers: 1, bracket_final: 2, if_necessary: 3 };
        return (typeOrder[a.bracketType] ?? 0) - (typeOrder[b.bracketType] ?? 0);
      });
      
      res.json({
        phase: league.currentPhase,
        season,
        conferenceChampionships: confChampGames.map(enrichGame),
        superRegionals: enrichedSR,
        cws: cwsGames.map(enrichGame),
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
      
      res.json({ pipeline, positionNeeds, totalTargeted: interests.filter(i => i.isTargeted).length, rosterSize: roster.length, teamState });
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
      
      const nonPitchers = allPlayers.filter(x => x.player.position !== "P").sort((a, b) => b.player.overall - a.player.overall);
      const pitchers = allPlayers.filter(x => x.player.position === "P").sort((a, b) => b.player.overall - a.player.overall);
      const freshmen = allPlayers.filter(x => x.player.eligibility === "FR").sort((a, b) => b.player.overall - a.player.overall);
      
      const formatAward = (x: { player: any; team: any } | undefined) => x ? {
        playerName: `${x.player.firstName} ${x.player.lastName}`,
        position: x.player.position,
        overall: x.player.overall,
        eligibility: x.player.eligibility,
        teamName: x.team.name,
        abbreviation: x.team.abbreviation,
        primaryColor: x.team.primaryColor,
      } : null;

      const allPositions = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "P", "DH"];

      const buildPositionTeam = (pool: { player: any; team: any }[]) => {
        const result: { position: string; player: any }[] = [];
        const used = new Set<string>();
        for (const pos of allPositions) {
          const candidates = pool
            .filter(x => {
              if (pos === "DH") return x.player.position !== "P" && !used.has(x.player.id);
              return x.player.position === pos && !used.has(x.player.id);
            })
            .sort((a, b) => b.player.overall - a.player.overall);
          if (candidates.length > 0) {
            used.add(candidates[0].player.id);
            result.push({ position: pos, player: formatAward(candidates[0]) });
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
      
      res.json({
        season: league.currentSeason,
        awardsAvailable: true,
        leagueAwards: {
          mvp: formatAward(nonPitchers[0]),
          pitcherOfYear: formatAward(pitchers[0]),
          freshmanOfYear: formatAward(freshmen[0]),
        },
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
          name: t.name, abbreviation: t.abbreviation, primaryColor: t.primaryColor,
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
        cwsChampion = champTeam ? { name: champTeam.name, abbreviation: champTeam.abbreviation, primaryColor: champTeam.primaryColor } : null;
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
          id: team!.id, name: team!.name, abbreviation: team!.abbreviation,
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

  app.get("/api/leagues/:id/dynasty-history", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      
      const allGames = await storage.getGamesByLeague(leagueId);
      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const teamMap = Object.fromEntries(leagueTeams.map(t => [t.id, { name: t.name, abbreviation: t.abbreviation, primaryColor: t.primaryColor }]));
      
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
        })).sort((a, b) => (b.wins || 0) - (a.wins || 0));
        
        seasons.push({
          season: s,
          cwsChampion,
          cwsRunnerUp,
          conferenceChampions: confChampions,
          teamRecords,
          hasCWSData: cwsGames.length > 0,
        });
      }
      
      res.json({ seasons, currentSeason: league.currentSeason });
    } catch (error) {
      console.error("Failed to fetch dynasty history:", error);
      res.status(500).json({ message: "Failed to fetch dynasty history" });
    }
  });

  // ============ CPU RECRUITING AI FUNCTION ============
  async function runCpuRecruiting(leagueId: string, week: number, season: number) {
    const league = await storage.getLeague(leagueId);
    const difficulty = league?.cpuDifficulty || "high_school";
    
    const difficultyConfig: Record<string, { minActions: number; maxActions: number; gainMultiplier: number; targetingBonus: number; offerThreshold: number; visitThreshold: number }> = {
      beginner:     { minActions: 3, maxActions: 5,  gainMultiplier: 0.8,  targetingBonus: 0,  offerThreshold: 50, visitThreshold: 65 },
      high_school:  { minActions: 4, maxActions: 7,  gainMultiplier: 1.1,  targetingBonus: 5,  offerThreshold: 35, visitThreshold: 50 },
      all_american: { minActions: 5, maxActions: 8,  gainMultiplier: 1.3,  targetingBonus: 10, offerThreshold: 25, visitThreshold: 40 },
      elite:        { minActions: 6, maxActions: 10, gainMultiplier: 1.5,  targetingBonus: 15, offerThreshold: 20, visitThreshold: 30 },
    };
    const config = difficultyConfig[difficulty] || difficultyConfig.high_school;
    
    const teams = await storage.getTeamsByLeague(leagueId);
    const cpuTeams = teams.filter(t => t.isCpu);
    const recruits = await storage.getRecruitsByLeague(leagueId);
    const unsignedRecruits = recruits.filter(r => !r.signedTeamId);
    
    if (unsignedRecruits.length === 0 || cpuTeams.length === 0) return;
    
    const allCoaches = await storage.getCoachesByLeague(leagueId);

    for (const team of cpuTeams) {
      const teamCoach = allCoaches.find(c => c.teamId === team.id);
      // Use the same coach-driven budget as humans so archetype/skill perks
      // measurably affect CPU action throughput too. Difficulty stretches it.
      const baseBudget = getMaxRecruitingActions(teamCoach);
      const difficultyStretch = { beginner: 0.6, high_school: 0.8, all_american: 1.0, elite: 1.2 }[difficulty] ?? 0.8;
      const actionsBudget = Math.max(2, Math.round(baseBudget * difficultyStretch));
      
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
      
      const sortedRecruits = unsignedRecruits
        .map(r => {
          const interest = teamInterests.find(i => i.recruitId === r.id);
          const prestigeMatch = Math.abs((team.prestige || 5) - (r.starRating || 3) * 2);
          const positionNeed = (positionCounts[r.position] || 0) < 2 ? 10 : 0;
          const currentInterest = interest?.interestLevel || 0;
          return { 
            recruit: r, 
            interest,
            score: currentInterest * 2 + positionNeed - prestigeMatch + config.targetingBonus + Math.random() * 5 
          };
        })
        .sort((a, b) => b.score - a.score);
      
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
      
      let pointsSpent = 0;
      for (let i = 0; i < sortedRecruits.length && pointsSpent < actionsBudget; i++) {
        const { recruit, interest } = sortedRecruits[i];
        const remaining = actionsBudget - pointsSpent;
        
        const candidateActions: string[] = [];
        if (!weeklyActionsThisWeek.has(weeklyActionKey(recruit.id, "email"))) candidateActions.push("email");
        if (!weeklyActionsThisWeek.has(weeklyActionKey(recruit.id, "phone"))) candidateActions.push("phone", "phone");
        if ((interest?.interestLevel || 0) > config.offerThreshold && !interest?.hasOffer) {
          candidateActions.push("offer", "offer");
        }
        const visitCost = getActionPointCost("visit", team.state, recruit.homeState);
        if ((interest?.interestLevel || 0) > config.visitThreshold && visitCost <= remaining &&
            !teamActionsLog.some(a => a.recruitId === recruit.id && a.actionType === "visit")) {
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
        assertInterestGainSane(`cpu_${actionType}`, interestGain, baseGain);
        weeklyActionsThisWeek.add(weeklyActionKey(recruit.id, actionType));
        pointsSpent += cost;
        
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
        
        await storage.createRecruitingAction({
          recruitId: recruit.id,
          teamId: team.id,
          leagueId: leagueId,
          week: week,
          season: season,
          actionType: actionType,
          interestChange: interestGain,
          notes: `CPU ${actionType} action`,
        });
      }
    }
  }
  
  // ============ RECRUIT STAGE PROGRESSION FUNCTION ============
  async function updateRecruitStages(leagueId: string, week: number) {
    const recruits = await storage.getRecruitsByLeague(leagueId);
    const unsignedRecruits = recruits.filter(r => !r.signedTeamId);
    
    for (const recruit of unsignedRecruits) {
      const allInterests = await storage.getRecruitingInterestsByRecruit(recruit.id);
      if (allInterests.length === 0) continue;
      
      const sortedInterests = allInterests
        .filter(i => i.interestLevel > 0)
        .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0));
      
      const topInterestLevel = sortedInterests[0]?.interestLevel || 0;
      const currentStage = recruit.stage || "open";
      
      let newStage = currentStage;
      
      // Star-based thresholds: higher-rated recruits take longer to decide
      const starRating = recruit.starRating || 3;
      const isBlueChip = recruit.isBlueChip || false;
      
      // Signing thresholds scale with star rating
      const verbalWeek = isBlueChip ? 11 : starRating >= 5 ? 10 : starRating >= 4 ? 8 : 6;
      const verbalInterest = isBlueChip ? 85 : starRating >= 5 ? 80 : starRating >= 4 ? 70 : 60;
      const signInterest = isBlueChip ? 90 : starRating >= 5 ? 85 : starRating >= 4 ? 75 : 65;
      
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
            const teamRoster = await storage.getPlayersByTeam(topSchool.teamId);
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
      
      if (currentStage === "verbal") {
        const topSchoolWithOffer = sortedInterests.filter(i => i.hasOffer).sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0))[0];
        if (topSchoolWithOffer && topSchoolWithOffer.interestLevel >= signInterest) {
          const teamRoster = await storage.getPlayersByTeam(topSchoolWithOffer.teamId);
          const teamCommits = recruits.filter(r => r.signedTeamId === topSchoolWithOffer.teamId).length;
          const departing = teamRoster.filter(p => p.pendingDeparture && p.retentionStatus !== "retained").length;
          const portal = teamRoster.filter(p => p.inTransferPortal).length;
          if (teamRoster.length - departing - portal + teamCommits + 1 <= 30) {
            await storage.updateRecruit(recruit.id, { 
              stage: "signed",
              signedTeamId: topSchoolWithOffer.teamId,
            });
          }
        }
      }
    }
  }

  // Generate recruiting class for dynasty setup
  app.post("/api/leagues/:id/recruiting/generate", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      // Commissioner-only action
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only commissioner can generate recruiting class" });
      }

      // Delete existing recruits for this league
      await storage.deleteRecruitsByLeague(req.params.id as string);

      // Generate new recruiting class (80 recruits)
      const recruitCount = 80;
      await generateRecruits(req.params.id as string, recruitCount);

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Recruiting Class Generated",
        details: `Generated ${recruitCount} new recruits for the recruiting class`,
      });

      res.json({ success: true, count: recruitCount });
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

      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can simulate games" });
      }

      const games = await storage.getGamesByLeague(league.id);
      const currentWeekGames = games.filter(g => 
        g.week === league.currentWeek && 
        g.season === league.currentSeason &&
        !g.isComplete
      );

      for (const game of currentWeekGames) {
        const result = await simulateGame(game.homeTeamId, game.awayTeamId, game.gameType);
        await storage.updateGame(game.id, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          isComplete: true,
          boxScore: result.boxScore,
        });
        try { const box = JSON.parse(result.boxScore); await accumulatePlayerStats(league.id, league.currentSeason, game.homeTeamId, box.home); await accumulatePlayerStats(league.id, league.currentSeason, game.awayTeamId, box.away); } catch (e) { console.error("Stat accumulation error:", e); }
      }

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Simulated Week",
        details: `Auto-resolved ${currentWeekGames.length} games for week ${league.currentWeek}`,
      });

      res.json({ success: true, gamesSimulated: currentWeekGames.length });
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

      const teams = await storage.getTeamsByLeague(league.id);
      const coaches = await storage.getCoachesByLeague(league.id);
      const games = await storage.getGamesByLeague(league.id);
      
      // Get current week's games that need scores
      const currentWeekGames = games.filter(g => 
        g.week === league.currentWeek && 
        g.season === league.currentSeason &&
        !g.isComplete
      );

      // Get all recruiting interests for accurate action counts
      const allInterests = await storage.getRecruitingInterestsByLeague(league.id);

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
        const teamInterests = allInterests.filter(i => i.teamId === team.id);
        const scoutActionsUsed = teamInterests.filter(i => i.scoutPercentage > 0).length;
        const recruitActionsUsed = teamInterests.filter(i => i.interestLevel > 0).length;

        return {
          teamId: team.id,
          teamName: team.name,
          abbreviation: team.abbreviation,
          isHumanControlled,
          userId: coach?.userId ?? null,
          coachName: coach ? `${coach.firstName} ${coach.lastName}` : "CPU",
          isReady: coach?.isReady ?? false,
          departuresFinalized: team.departuresFinalized,
          walkonReady: team.walkonReady ?? false,
          scoutActionsUsed,
          recruitActionsUsed,
          hasReportedScores,
        };
      });

      const isDeparturesPhase = league.currentPhase === "offseason_departures";
      const isWalkonsPhase = league.currentPhase === "offseason_walkons";
      
      const getReadyState = (s: typeof readyStatus[0]) => {
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
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only commissioner can import recruiting class" });
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
        // Generate new recruiting class (80 recruits)
        recruitCount = 80;
        await generateRecruits(req.params.id as string, recruitCount);

        await storage.createAuditLog({
          leagueId: league.id,
          userId: req.session.userId,
          action: "Recruiting Class Imported",
          details: `Generated ${recruitCount} new recruits for the recruiting class`,
        });
      }

      res.json({ success: true, count: recruitCount });
    } catch (error) {
      console.error("Failed to import recruiting class:", error);
      res.status(500).json({ message: "Failed to import recruiting class" });
    }
  });

  app.patch("/api/leagues/:id/deadline", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.commissionerId !== req.session.userId) {
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
      const result = settingsSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid settings data" });
      }
      
      const updateData: Record<string, any> = {};
      if (result.data.auditLogPublic !== undefined) updateData.auditLogPublic = result.data.auditLogPublic;
      if (result.data.cpuDifficulty !== undefined) updateData.cpuDifficulty = result.data.cpuDifficulty;
      const league = await storage.updateLeague(req.params.id, updateData);
      res.json(league);
    } catch (error) {
      console.error("Failed to update settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
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

      const { label } = req.body || {};

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

      res.json({
        recruit: {
          ...recruit,
          potential: actualPotential,
          potentialFloor: dynamicPotentialFloor,
          potentialCeiling: dynamicPotentialCeiling,
          interest,
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

      if (league.commissionerId !== req.session.userId) {
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

      if (league.commissionerId !== req.session.userId) {
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
      
      const isCommissioner = league.commissionerId === userId;
      
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
      const { rosterId, recruitingClassId } = req.body || {};
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can start dynasty" });
      }
      
      // Apply saved roster if specified
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
            }
          }
        } else {
          const teams = await storage.getTeamsByLeague(leagueId);
          const recruitCount = Math.max(80, teams.length * 5);
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
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can generate schedule" });
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

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can delete news" });
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

  // === Conference Teams API (for roster viewing) ===
  app.get("/api/conference-teams", async (_req, res) => {
    try {
      const allConferences = ["SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "WCC", "Mountain West", "Ivy League", "Sun Belt", "Big West", "HBCU", "Missouri Valley"];
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

  return httpServer;
}

// Helper functions
function getAttributesToReveal(percentage: number, existing: string[] = []): string[] {
  const allAttrs = ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "velocity", "control", "stamina", "stuff"];
  const remaining = allAttrs.filter(a => !existing.includes(a));
  
  const countToReveal = Math.floor((percentage / 100) * allAttrs.length);
  const toReveal: string[] = [];
  
  for (let i = 0; i < countToReveal && remaining.length > 0; i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    toReveal.push(remaining.splice(idx, 1)[0]);
  }
  
  return toReveal;
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
    confWeeklyRounds.set(cid, shuffledOrder.map(i => weekRounds[i]));
  }

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

    const oocUsed = new Set<string>();
    const allTeamsShuffled = shuffle([...leagueTeams]);
    const oocPairs: Matchup[] = [];

    const conferences = [...confMap.keys()];
    if (conferences.length >= 2) {
      const confBuckets: TeamType[][] = conferences.map(cid => 
        shuffle(confMap.get(cid)!.filter(t => !oocUsed.has(t.id)))
      );

      let changed = true;
      while (changed) {
        changed = false;
        for (let ci = 0; ci < confBuckets.length && !changed; ci++) {
          for (let cj = ci + 1; cj < confBuckets.length && !changed; cj++) {
            const aTeam = confBuckets[ci].find(t => !oocUsed.has(t.id));
            const bTeam = confBuckets[cj].find(t => !oocUsed.has(t.id));
            if (aTeam && bTeam) {
              const home = Math.random() > 0.5 ? aTeam : bTeam;
              const away = home === aTeam ? bTeam : aTeam;
              oocPairs.push({ home, away });
              oocUsed.add(aTeam.id);
              oocUsed.add(bTeam.id);
              changed = true;
            }
          }
        }
      }

      const remaining = allTeamsShuffled.filter(t => !oocUsed.has(t.id));
      for (let i = 0; i < remaining.length - 1; i += 2) {
        oocPairs.push({ home: remaining[i], away: remaining[i + 1] });
        oocUsed.add(remaining[i].id);
        oocUsed.add(remaining[i + 1].id);
      }
    } else {
      const available = allTeamsShuffled.filter(t => !oocUsed.has(t.id));
      for (let i = 0; i < available.length - 1; i += 2) {
        oocPairs.push({ home: available[i], away: available[i + 1] });
        oocUsed.add(available[i].id);
        oocUsed.add(available[i + 1].id);
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
      { name: "Alabama", mascot: "Crimson Tide", abbreviation: "BAMA", city: "Tuscaloosa", state: "AL", primaryColor: "#9e1b32", secondaryColor: "#ffffff", prestige: 8, stadium: 8, facilities: 9, collegeLife: 9, marketing: 9, academics: 6, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 38000, nilBudget: 5500000 },
      { name: "Arkansas", mascot: "Razorbacks", abbreviation: "ARK", city: "Fayetteville", state: "AR", primaryColor: "#9d2235", secondaryColor: "#ffffff", prestige: 8, stadium: 8, facilities: 7, collegeLife: 7, marketing: 7, academics: 6, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 30000, nilBudget: 4000000 },
      { name: "Auburn", mascot: "Tigers", abbreviation: "AUB", city: "Auburn", state: "AL", primaryColor: "#0c2340", secondaryColor: "#e87722", prestige: 7, stadium: 7, facilities: 7, collegeLife: 8, marketing: 7, academics: 6, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 31000, nilBudget: 3500000 },
      { name: "Florida", mascot: "Gators", abbreviation: "FL", city: "Gainesville", state: "FL", primaryColor: "#0037ff", secondaryColor: "#fc4903", prestige: 9, stadium: 8, facilities: 7, collegeLife: 10, marketing: 8, academics: 8, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 55000, nilBudget: 5000000 },
      { name: "Georgia", mascot: "Bulldogs", abbreviation: "UGA", city: "Athens", state: "GA", primaryColor: "#ba0c2f", secondaryColor: "#000000", prestige: 7, stadium: 7, facilities: 7, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 40000, nilBudget: 4000000 },
      { name: "Kentucky", mascot: "Wildcats", abbreviation: "UK", city: "Lexington", state: "KY", primaryColor: "#0033a0", secondaryColor: "#ffffff", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 2500000 },
      { name: "LSU", mascot: "Tigers", abbreviation: "LSU", city: "Baton Rouge", state: "LA", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 9, stadium: 9, facilities: 8, collegeLife: 9, marketing: 8, academics: 6, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 35000, nilBudget: 5000000 },
      { name: "Mississippi State", mascot: "Bulldogs", abbreviation: "MSST", city: "Starkville", state: "MS", primaryColor: "#660000", secondaryColor: "#ffffff", prestige: 7, stadium: 7, facilities: 7, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 23000, nilBudget: 3000000 },
      { name: "Missouri", mascot: "Tigers", abbreviation: "MIZ", city: "Columbia", state: "MO", primaryColor: "#f1b82d", secondaryColor: "#000000", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 31000, nilBudget: 2500000 },
      { name: "Oklahoma", mascot: "Sooners", abbreviation: "OU", city: "Norman", state: "OK", primaryColor: "#841617", secondaryColor: "#fdf9d8", prestige: 6, stadium: 6, facilities: 7, collegeLife: 8, marketing: 8, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 28000, nilBudget: 3000000 },
      { name: "Ole Miss", mascot: "Rebels", abbreviation: "MISS", city: "Oxford", state: "MS", primaryColor: "#14213d", secondaryColor: "#ce1126", prestige: 7, stadium: 7, facilities: 7, collegeLife: 8, marketing: 7, academics: 6, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 24000, nilBudget: 3500000 },
      { name: "South Carolina", mascot: "Gamecocks", abbreviation: "SC", city: "Columbia", state: "SC", primaryColor: "#73000a", secondaryColor: "#000000", prestige: 7, stadium: 7, facilities: 7, collegeLife: 8, marketing: 7, academics: 6, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 35000, nilBudget: 3000000 },
      { name: "Tennessee", mascot: "Volunteers", abbreviation: "TENN", city: "Knoxville", state: "TN", primaryColor: "#ff8200", secondaryColor: "#ffffff", prestige: 8, stadium: 7, facilities: 7, collegeLife: 8, marketing: 7, academics: 6, fanbasePassion: "A", fanbaseType: "Southern", enrollment: 31000, nilBudget: 4000000 },
      { name: "Texas", mascot: "Longhorns", abbreviation: "TEX", city: "Austin", state: "TX", primaryColor: "#bf5700", secondaryColor: "#ffffff", prestige: 9, stadium: 9, facilities: 8, collegeLife: 9, marketing: 9, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 52000, nilBudget: 6000000 },
      { name: "Texas A&M", mascot: "Aggies", abbreviation: "TAMU", city: "College Station", state: "TX", primaryColor: "#500000", secondaryColor: "#ffffff", prestige: 7, stadium: 8, facilities: 8, collegeLife: 8, marketing: 8, academics: 7, fanbasePassion: "A+", fanbaseType: "Cult Following", enrollment: 72000, nilBudget: 4500000 },
      { name: "Vanderbilt", mascot: "Commodores", abbreviation: "VAN", city: "Nashville", state: "TN", primaryColor: "#866d4b", secondaryColor: "#000000", prestige: 9, stadium: 7, facilities: 9, collegeLife: 8, marketing: 7, academics: 10, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 4000000 },
    ],
    "ACC": [
      { name: "Boston College", mascot: "Eagles", abbreviation: "BC", city: "Chestnut Hill", state: "MA", primaryColor: "#8b0000", secondaryColor: "#c4a77d", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 15000, nilBudget: 1500000 },
      { name: "California", mascot: "Golden Bears", abbreviation: "CAL", city: "Berkeley", state: "CA", primaryColor: "#003262", secondaryColor: "#fdb515", prestige: 5, stadium: 5, facilities: 6, collegeLife: 8, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 45000, nilBudget: 2000000 },
      { name: "Clemson", mascot: "Tigers", abbreviation: "CLEM", city: "Clemson", state: "SC", primaryColor: "#f66733", secondaryColor: "#522d80", prestige: 6, stadium: 6, facilities: 7, collegeLife: 8, marketing: 7, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 27000, nilBudget: 3000000 },
      { name: "Duke", mascot: "Blue Devils", abbreviation: "DUKE", city: "Durham", state: "NC", primaryColor: "#003087", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 7, collegeLife: 7, marketing: 6, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 17000, nilBudget: 2000000 },
      { name: "Florida State", mascot: "Seminoles", abbreviation: "FSU", city: "Tallahassee", state: "FL", primaryColor: "#782f40", secondaryColor: "#ceb888", prestige: 7, stadium: 7, facilities: 7, collegeLife: 8, marketing: 8, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 45000, nilBudget: 3500000 },
      { name: "Georgia Tech", mascot: "Yellow Jackets", abbreviation: "GT", city: "Atlanta", state: "GA", primaryColor: "#003057", secondaryColor: "#b3a369", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 5, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 45000, nilBudget: 2000000 },
      { name: "Louisville", mascot: "Cardinals", abbreviation: "LOU", city: "Louisville", state: "KY", primaryColor: "#ad0000", secondaryColor: "#000000", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 23000, nilBudget: 2500000 },
      { name: "Miami", mascot: "Hurricanes", abbreviation: "MIA", city: "Coral Gables", state: "FL", primaryColor: "#f47321", secondaryColor: "#005030", prestige: 8, stadium: 7, facilities: 7, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 3500000 },
      { name: "NC State", mascot: "Wolfpack", abbreviation: "NCS", city: "Raleigh", state: "NC", primaryColor: "#cc0000", secondaryColor: "#ffffff", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 37000, nilBudget: 2000000 },
      { name: "North Carolina", mascot: "Tar Heels", abbreviation: "UNC", city: "Chapel Hill", state: "NC", primaryColor: "#7bafd4", secondaryColor: "#ffffff", prestige: 7, stadium: 6, facilities: 6, collegeLife: 8, marketing: 7, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 31000, nilBudget: 3000000 },
      { name: "Notre Dame", mascot: "Fighting Irish", abbreviation: "ND", city: "South Bend", state: "IN", primaryColor: "#0c2340", secondaryColor: "#c99700", prestige: 6, stadium: 6, facilities: 7, collegeLife: 7, marketing: 8, academics: 9, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 13000, nilBudget: 3000000 },
      { name: "Pittsburgh", mascot: "Panthers", abbreviation: "PITT", city: "Pittsburgh", state: "PA", primaryColor: "#003594", secondaryColor: "#ffb81c", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 1500000 },
      { name: "SMU", mascot: "Mustangs", abbreviation: "SMU", city: "Dallas", state: "TX", primaryColor: "#cc0035", secondaryColor: "#002a5c", prestige: 5, stadium: 6, facilities: 7, collegeLife: 8, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 2500000 },
      { name: "Stanford", mascot: "Cardinal", abbreviation: "STAN", city: "Stanford", state: "CA", primaryColor: "#8c1515", secondaryColor: "#ffffff", prestige: 8, stadium: 6, facilities: 8, collegeLife: 8, marketing: 7, academics: 10, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 17000, nilBudget: 3000000 },
      { name: "Virginia", mascot: "Cavaliers", abbreviation: "UVA", city: "Charlottesville", state: "VA", primaryColor: "#232d4b", secondaryColor: "#f84c1e", prestige: 7, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 26000, nilBudget: 2500000 },
      { name: "Virginia Tech", mascot: "Hokies", abbreviation: "VT", city: "Blacksburg", state: "VA", primaryColor: "#630031", secondaryColor: "#cf4420", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 7, fanbasePassion: "A", fanbaseType: "Balanced", enrollment: 37000, nilBudget: 2000000 },
      { name: "Wake Forest", mascot: "Demon Deacons", abbreviation: "WAKE", city: "Winston-Salem", state: "NC", primaryColor: "#9e7e38", secondaryColor: "#000000", prestige: 6, stadium: 6, facilities: 7, collegeLife: 7, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 2000000 },
    ],
    "Big 12": [
      { name: "Arizona", mascot: "Wildcats", abbreviation: "ARIZ", city: "Tucson", state: "AZ", primaryColor: "#002449", secondaryColor: "#cc0033", prestige: 6, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 2000000 },
      { name: "Arizona State", mascot: "Sun Devils", abbreviation: "ASU", city: "Tempe", state: "AZ", primaryColor: "#8c1d40", secondaryColor: "#ffc627", prestige: 6, stadium: 7, facilities: 6, collegeLife: 9, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 75000, nilBudget: 2500000 },
      { name: "Baylor", mascot: "Bears", abbreviation: "BAY", city: "Waco", state: "TX", primaryColor: "#154734", secondaryColor: "#ffc72c", prestige: 5, stadium: 6, facilities: 6, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 20000, nilBudget: 2000000 },
      { name: "BYU", mascot: "Cougars", abbreviation: "BYU", city: "Provo", state: "UT", primaryColor: "#002e5d", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 5, academics: 7, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 35000, nilBudget: 2000000 },
      { name: "Cincinnati", mascot: "Bearcats", abbreviation: "CIN", city: "Cincinnati", state: "OH", primaryColor: "#e00122", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 1500000 },
      { name: "Houston", mascot: "Cougars", abbreviation: "HOU", city: "Houston", state: "TX", primaryColor: "#c8102e", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 1500000 },
      { name: "Kansas", mascot: "Jayhawks", abbreviation: "KU", city: "Lawrence", state: "KS", primaryColor: "#0051ba", secondaryColor: "#e8000d", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 28000, nilBudget: 1500000 },
      { name: "Kansas State", mascot: "Wildcats", abbreviation: "KSU", city: "Manhattan", state: "KS", primaryColor: "#512888", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 1500000 },
      { name: "Oklahoma State", mascot: "Cowboys", abbreviation: "OKST", city: "Stillwater", state: "OK", primaryColor: "#ff7300", secondaryColor: "#000000", prestige: 7, stadium: 7, facilities: 7, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 25000, nilBudget: 2500000 },
      { name: "TCU", mascot: "Horned Frogs", abbreviation: "TCU", city: "Fort Worth", state: "TX", primaryColor: "#4d1979", secondaryColor: "#a3a9ac", prestige: 7, stadium: 7, facilities: 7, collegeLife: 8, marketing: 7, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 2500000 },
      { name: "Texas Tech", mascot: "Red Raiders", abbreviation: "TTU", city: "Lubbock", state: "TX", primaryColor: "#cc0000", secondaryColor: "#000000", prestige: 6, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 40000, nilBudget: 2000000 },
      { name: "UCF", mascot: "Knights", abbreviation: "UCF", city: "Orlando", state: "FL", primaryColor: "#ba9b37", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 72000, nilBudget: 1500000 },
      { name: "Utah", mascot: "Utes", abbreviation: "UTAH", city: "Salt Lake City", state: "UT", primaryColor: "#cc0000", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 2000000 },
      { name: "West Virginia", mascot: "Mountaineers", abbreviation: "WVU", city: "Morgantown", state: "WV", primaryColor: "#002855", secondaryColor: "#eaaa00", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 26000, nilBudget: 1500000 },
    ],
    "Big Ten": [
      { name: "Illinois", mascot: "Fighting Illini", abbreviation: "ILL", city: "Champaign", state: "IL", primaryColor: "#e84a27", secondaryColor: "#13294b", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 52000, nilBudget: 1500000 },
      { name: "Indiana", mascot: "Hoosiers", abbreviation: "IU", city: "Bloomington", state: "IN", primaryColor: "#990000", secondaryColor: "#ffffff", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 45000, nilBudget: 2000000 },
      { name: "Iowa", mascot: "Hawkeyes", abbreviation: "IOWA", city: "Iowa City", state: "IA", primaryColor: "#000000", secondaryColor: "#ffcd00", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 32000, nilBudget: 1500000 },
      { name: "Maryland", mascot: "Terrapins", abbreviation: "MD", city: "College Park", state: "MD", primaryColor: "#e03a3e", secondaryColor: "#ffd520", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 41000, nilBudget: 2000000 },
      { name: "Michigan", mascot: "Wolverines", abbreviation: "MICH", city: "Ann Arbor", state: "MI", primaryColor: "#00274c", secondaryColor: "#ffcb05", prestige: 7, stadium: 6, facilities: 7, collegeLife: 8, marketing: 8, academics: 9, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 47000, nilBudget: 3000000 },
      { name: "Michigan State", mascot: "Spartans", abbreviation: "MSU", city: "East Lansing", state: "MI", primaryColor: "#18453b", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "Minnesota", mascot: "Golden Gophers", abbreviation: "MINN", city: "Minneapolis", state: "MN", primaryColor: "#862334", secondaryColor: "#ffc72c", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 52000, nilBudget: 2000000 },
      { name: "Nebraska", mascot: "Cornhuskers", abbreviation: "NEB", city: "Lincoln", state: "NE", primaryColor: "#e41c38", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 24000, nilBudget: 2000000 },
      { name: "Northwestern", mascot: "Wildcats", abbreviation: "NW", city: "Evanston", state: "IL", primaryColor: "#4e2a84", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 5, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 22000, nilBudget: 2000000 },
      { name: "Ohio State", mascot: "Buckeyes", abbreviation: "OSU", city: "Columbus", state: "OH", primaryColor: "#bb0000", secondaryColor: "#666666", prestige: 6, stadium: 6, facilities: 7, collegeLife: 9, marketing: 8, academics: 7, fanbasePassion: "A+", fanbaseType: "Blue Blood", enrollment: 61000, nilBudget: 3000000 },
      { name: "Oregon", mascot: "Ducks", abbreviation: "ORE", city: "Eugene", state: "OR", primaryColor: "#154733", secondaryColor: "#fee123", prestige: 5, stadium: 6, facilities: 7, collegeLife: 8, marketing: 7, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 2500000 },
      { name: "Penn State", mascot: "Nittany Lions", abbreviation: "PSU", city: "State College", state: "PA", primaryColor: "#041e42", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 6, collegeLife: 8, marketing: 6, academics: 7, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 88000, nilBudget: 2000000 },
      { name: "Purdue", mascot: "Boilermakers", abbreviation: "PUR", city: "West Lafayette", state: "IN", primaryColor: "#ceb888", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "Rutgers", mascot: "Scarlet Knights", abbreviation: "RUT", city: "New Brunswick", state: "NJ", primaryColor: "#cc0033", secondaryColor: "#5f6a72", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1500000 },
      { name: "USC", mascot: "Trojans", abbreviation: "USC", city: "Los Angeles", state: "CA", primaryColor: "#990000", secondaryColor: "#ffc72c", prestige: 6, stadium: 6, facilities: 7, collegeLife: 9, marketing: 8, academics: 8, fanbasePassion: "B", fanbaseType: "Blue Blood", enrollment: 47000, nilBudget: 3000000 },
      { name: "UCLA", mascot: "Bruins", abbreviation: "UCLA", city: "Los Angeles", state: "CA", primaryColor: "#2774ae", secondaryColor: "#ffd100", prestige: 8, stadium: 6, facilities: 7, collegeLife: 9, marketing: 8, academics: 9, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 46000, nilBudget: 3500000 },
      { name: "Washington", mascot: "Huskies", abbreviation: "WASH", city: "Seattle", state: "WA", primaryColor: "#4b2e83", secondaryColor: "#b7a57a", prestige: 5, stadium: 5, facilities: 6, collegeLife: 8, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 48000, nilBudget: 2000000 },
      { name: "Wisconsin", mascot: "Badgers", abbreviation: "WIS", city: "Madison", state: "WI", primaryColor: "#c5050c", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 5, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 47000, nilBudget: 1500000 },
    ],
    "Pac-12": [
      { name: "Oregon State", mascot: "Beavers", abbreviation: "ORST", city: "Corvallis", state: "OR", primaryColor: "#dc4405", secondaryColor: "#000000", prestige: 9, stadium: 8, facilities: 8, collegeLife: 7, marketing: 7, academics: 7, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 34000, nilBudget: 3500000 },
      { name: "Washington State", mascot: "Cougars", abbreviation: "WSU", city: "Pullman", state: "WA", primaryColor: "#981e32", secondaryColor: "#5e6a71", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 30000, nilBudget: 1500000 },
    ],
    "AAC": [
      { name: "East Carolina", mascot: "Pirates", abbreviation: "ECU", city: "Greenville", state: "NC", primaryColor: "#592a8a", secondaryColor: "#fdc82f", prestige: 7, stadium: 7, facilities: 7, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 28000, nilBudget: 2000000 },
      { name: "Wichita State", mascot: "Shockers", abbreviation: "WICH", city: "Wichita", state: "KS", primaryColor: "#ffc72c", secondaryColor: "#000000", prestige: 7, stadium: 7, facilities: 6, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 16000, nilBudget: 1800000 },
      { name: "Tulane", mascot: "Green Wave", abbreviation: "TUL", city: "New Orleans", state: "LA", primaryColor: "#006747", secondaryColor: "#418fde", prestige: 6, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 1800000 },
      { name: "Memphis", mascot: "Tigers", abbreviation: "MEM", city: "Memphis", state: "TN", primaryColor: "#003087", secondaryColor: "#8e9090", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1500000 },
      { name: "South Florida", mascot: "Bulls", abbreviation: "USF", city: "Tampa", state: "FL", primaryColor: "#006747", secondaryColor: "#cfc493", prestige: 6, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 50000, nilBudget: 1800000 },
      { name: "Charlotte", mascot: "49ers", abbreviation: "CLT", city: "Charlotte", state: "NC", primaryColor: "#046a38", secondaryColor: "#b9975b", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 1200000 },
      { name: "UAB", mascot: "Blazers", abbreviation: "UAB", city: "Birmingham", state: "AL", primaryColor: "#1e6b52", secondaryColor: "#f4c300", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1200000 },
      { name: "Rice", mascot: "Owls", abbreviation: "RICE", city: "Houston", state: "TX", primaryColor: "#00205b", secondaryColor: "#a4a8b1", prestige: 6, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 8000, nilBudget: 1500000 },
      { name: "Florida Atlantic", mascot: "Owls", abbreviation: "FAU", city: "Boca Raton", state: "FL", primaryColor: "#003366", secondaryColor: "#cc0000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 30000, nilBudget: 1200000 },
      { name: "North Texas", mascot: "Mean Green", abbreviation: "UNT", city: "Denton", state: "TX", primaryColor: "#00853e", secondaryColor: "#000000", prestige: 4, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 41000, nilBudget: 1000000 },
      { name: "Dallas Baptist", mascot: "Patriots", abbreviation: "DBU", city: "Dallas", state: "TX", primaryColor: "#002d72", secondaryColor: "#c8102e", prestige: 7, stadium: 6, facilities: 7, collegeLife: 6, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 1500000 },
    ],
    "WCC": [
      { name: "Pepperdine", mascot: "Waves", abbreviation: "PEPP", city: "Malibu", state: "CA", primaryColor: "#00205b", secondaryColor: "#f47920", prestige: 6, stadium: 5, facilities: 6, collegeLife: 8, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 1200000 },
      { name: "Loyola Marymount", mascot: "Lions", abbreviation: "LMU", city: "Los Angeles", state: "CA", primaryColor: "#8a0029", secondaryColor: "#003595", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 1000000 },
      { name: "San Diego", mascot: "Toreros", abbreviation: "USD", city: "San Diego", state: "CA", primaryColor: "#003b70", secondaryColor: "#c69214", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 1000000 },
      { name: "Saint Mary's", mascot: "Gaels", abbreviation: "SMC", city: "Moraga", state: "CA", primaryColor: "#06315b", secondaryColor: "#d20f29", prestige: 4, stadium: 4, facilities: 5, collegeLife: 7, marketing: 5, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 4000, nilBudget: 800000 },
      { name: "Gonzaga", mascot: "Bulldogs", abbreviation: "GONZ", city: "Spokane", state: "WA", primaryColor: "#002967", secondaryColor: "#c8102e", prestige: 5, stadium: 5, facilities: 6, collegeLife: 7, marketing: 6, academics: 8, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 8000, nilBudget: 1500000 },
      { name: "Santa Clara", mascot: "Broncos", abbreviation: "SCU", city: "Santa Clara", state: "CA", primaryColor: "#aa003d", secondaryColor: "#a59b80", prestige: 4, stadium: 4, facilities: 5, collegeLife: 7, marketing: 5, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 800000 },
      { name: "Portland", mascot: "Pilots", abbreviation: "POR", city: "Portland", state: "OR", primaryColor: "#582c83", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 4, academics: 7, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 4000, nilBudget: 700000 },
      { name: "San Francisco", mascot: "Dons", abbreviation: "SFU", city: "San Francisco", state: "CA", primaryColor: "#00543c", secondaryColor: "#fdb913", prestige: 4, stadium: 4, facilities: 4, collegeLife: 8, marketing: 4, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 11000, nilBudget: 700000 },
    ],
    "Mountain West": [
      { name: "Fresno State", mascot: "Bulldogs", abbreviation: "FRES", city: "Fresno", state: "CA", primaryColor: "#db0032", secondaryColor: "#002e6d", prestige: 7, stadium: 7, facilities: 6, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 25000, nilBudget: 1800000 },
      { name: "San Diego State", mascot: "Aztecs", abbreviation: "SDSU", city: "San Diego", state: "CA", primaryColor: "#a6192e", secondaryColor: "#000000", prestige: 6, stadium: 6, facilities: 6, collegeLife: 8, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 36000, nilBudget: 1800000 },
      { name: "UNLV", mascot: "Rebels", abbreviation: "UNLV", city: "Las Vegas", state: "NV", primaryColor: "#cf0a2c", secondaryColor: "#666666", prestige: 5, stadium: 5, facilities: 5, collegeLife: 9, marketing: 6, academics: 5, fanbasePassion: "B", fanbaseType: "Party School", enrollment: 30000, nilBudget: 1200000 },
      { name: "Nevada", mascot: "Wolf Pack", abbreviation: "NEV", city: "Reno", state: "NV", primaryColor: "#003366", secondaryColor: "#807f84", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 4, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 900000 },
      { name: "New Mexico", mascot: "Lobos", abbreviation: "UNM", city: "Albuquerque", state: "NM", primaryColor: "#ba0c2f", secondaryColor: "#a7a8aa", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1000000 },
      { name: "Air Force", mascot: "Falcons", abbreviation: "AF", city: "Colorado Springs", state: "CO", primaryColor: "#003594", secondaryColor: "#8a8d8f", prestige: 4, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 8, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 4000, nilBudget: 800000 },
    ],
    "Ivy League": [
      { name: "Columbia", mascot: "Lions", abbreviation: "COL", city: "New York", state: "NY", primaryColor: "#9bcbeb", secondaryColor: "#ffffff", prestige: 5, stadium: 4, facilities: 5, collegeLife: 9, marketing: 5, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 33000, nilBudget: 500000 },
      { name: "Cornell", mascot: "Big Red", abbreviation: "COR", city: "Ithaca", state: "NY", primaryColor: "#b31b1b", secondaryColor: "#ffffff", prestige: 4, stadium: 4, facilities: 5, collegeLife: 7, marketing: 4, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 25000, nilBudget: 500000 },
      { name: "Dartmouth", mascot: "Big Green", abbreviation: "DART", city: "Hanover", state: "NH", primaryColor: "#00693e", secondaryColor: "#ffffff", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 4, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 7000, nilBudget: 400000 },
      { name: "Harvard", mascot: "Crimson", abbreviation: "HARV", city: "Cambridge", state: "MA", primaryColor: "#a51c30", secondaryColor: "#000000", prestige: 5, stadium: 4, facilities: 5, collegeLife: 8, marketing: 6, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 23000, nilBudget: 600000 },
      { name: "Penn", mascot: "Quakers", abbreviation: "PENN", city: "Philadelphia", state: "PA", primaryColor: "#011f5b", secondaryColor: "#990000", prestige: 5, stadium: 4, facilities: 5, collegeLife: 8, marketing: 5, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 22000, nilBudget: 500000 },
      { name: "Princeton", mascot: "Tigers", abbreviation: "PRIN", city: "Princeton", state: "NJ", primaryColor: "#e77500", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 5, collegeLife: 7, marketing: 5, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 9000, nilBudget: 500000 },
      { name: "Yale", mascot: "Bulldogs", abbreviation: "YALE", city: "New Haven", state: "CT", primaryColor: "#00356b", secondaryColor: "#ffffff", prestige: 5, stadium: 4, facilities: 5, collegeLife: 8, marketing: 5, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 14000, nilBudget: 600000 },
      { name: "Brown", mascot: "Bears", abbreviation: "BRN", city: "Providence", state: "RI", primaryColor: "#4e3629", secondaryColor: "#c00404", prestige: 4, stadium: 3, facilities: 4, collegeLife: 7, marketing: 4, academics: 10, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 400000 },
    ],
    "Sun Belt": [
      { name: "Coastal Carolina", mascot: "Chanticleers", abbreviation: "CCU", city: "Conway", state: "SC", primaryColor: "#006f71", secondaryColor: "#a27752", prestige: 8, stadium: 7, facilities: 7, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 11000, nilBudget: 2000000 },
      { name: "Southern Miss", mascot: "Golden Eagles", abbreviation: "USM", city: "Hattiesburg", state: "MS", primaryColor: "#ffab00", secondaryColor: "#000000", prestige: 7, stadium: 7, facilities: 6, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 15000, nilBudget: 1500000 },
      { name: "Troy", mascot: "Trojans", abbreviation: "TROY", city: "Troy", state: "AL", primaryColor: "#8b2332", secondaryColor: "#000000", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 18000, nilBudget: 1000000 },
      { name: "Marshall", mascot: "Thundering Herd", abbreviation: "MAR", city: "Huntington", state: "WV", primaryColor: "#00b140", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1000000 },
      { name: "Louisiana", mascot: "Ragin' Cajuns", abbreviation: "ULL", city: "Lafayette", state: "LA", primaryColor: "#ce181e", secondaryColor: "#ffffff", prestige: 7, stadium: 7, facilities: 6, collegeLife: 7, marketing: 5, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 17000, nilBudget: 1500000 },
      { name: "Old Dominion", mascot: "Monarchs", abbreviation: "ODU", city: "Norfolk", state: "VA", primaryColor: "#003057", secondaryColor: "#8b8d8e", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 1000000 },
      { name: "Arkansas State", mascot: "Red Wolves", abbreviation: "ARST", city: "Jonesboro", state: "AR", primaryColor: "#cc092f", secondaryColor: "#000000", prestige: 4, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 14000, nilBudget: 800000 },
      { name: "Georgia Southern", mascot: "Eagles", abbreviation: "GASO", city: "Statesboro", state: "GA", primaryColor: "#041e42", secondaryColor: "#87714d", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 27000, nilBudget: 1000000 },
      { name: "App State", mascot: "Mountaineers", abbreviation: "APP", city: "Boone", state: "NC", primaryColor: "#222222", secondaryColor: "#ffcc00", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 21000, nilBudget: 1000000 },
      { name: "Georgia State", mascot: "Panthers", abbreviation: "GAST", city: "Atlanta", state: "GA", primaryColor: "#0039a6", secondaryColor: "#cc0000", prestige: 4, stadium: 5, facilities: 5, collegeLife: 7, marketing: 4, academics: 6, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 54000, nilBudget: 1000000 },
      { name: "South Alabama", mascot: "Jaguars", abbreviation: "USA", city: "Mobile", state: "AL", primaryColor: "#00205b", secondaryColor: "#bf0d3e", prestige: 6, stadium: 6, facilities: 5, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 14000, nilBudget: 1200000 },
      { name: "James Madison", mascot: "Dukes", abbreviation: "JMU", city: "Harrisonburg", state: "VA", primaryColor: "#450084", secondaryColor: "#cbb778", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 38000, nilBudget: 1500000 },
      { name: "Texas State", mascot: "Bobcats", abbreviation: "TXST", city: "San Marcos", state: "TX", primaryColor: "#501214", secondaryColor: "#8d734a", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 38000, nilBudget: 1500000 },
    ],
    "Big West": [
      { name: "Cal State Fullerton", mascot: "Titans", abbreviation: "CSUF", city: "Fullerton", state: "CA", primaryColor: "#00274c", secondaryColor: "#f47920", prestige: 8, stadium: 8, facilities: 7, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "A", fanbaseType: "Blue Blood", enrollment: 42000, nilBudget: 2000000 },
      { name: "UC Irvine", mascot: "Anteaters", abbreviation: "UCI", city: "Irvine", state: "CA", primaryColor: "#0064a4", secondaryColor: "#ffd200", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 5, academics: 8, fanbasePassion: "B", fanbaseType: "Academic Elite", enrollment: 36000, nilBudget: 1500000 },
      { name: "UC Santa Barbara", mascot: "Gauchos", abbreviation: "UCSB", city: "Santa Barbara", state: "CA", primaryColor: "#003660", secondaryColor: "#febc11", prestige: 6, stadium: 5, facilities: 6, collegeLife: 9, marketing: 5, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 27000, nilBudget: 1500000 },
      { name: "Long Beach State", mascot: "Dirtbags", abbreviation: "LBSU", city: "Long Beach", state: "CA", primaryColor: "#000000", secondaryColor: "#f0ab00", prestige: 7, stadium: 6, facilities: 6, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Cult Following", enrollment: 39000, nilBudget: 1500000 },
      { name: "UC San Diego", mascot: "Tritons", abbreviation: "UCSD", city: "San Diego", state: "CA", primaryColor: "#182b49", secondaryColor: "#c69214", prestige: 4, stadium: 4, facilities: 5, collegeLife: 8, marketing: 4, academics: 9, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 42000, nilBudget: 1000000 },
      { name: "Hawaii", mascot: "Rainbow Warriors", abbreviation: "HAW", city: "Honolulu", state: "HI", primaryColor: "#024731", secondaryColor: "#ffffff", prestige: 6, stadium: 6, facilities: 5, collegeLife: 9, marketing: 6, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 19000, nilBudget: 1500000 },
      { name: "Cal Poly", mascot: "Mustangs", abbreviation: "CPOL", city: "San Luis Obispo", state: "CA", primaryColor: "#154734", secondaryColor: "#bd8b13", prestige: 5, stadium: 5, facilities: 5, collegeLife: 8, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 22000, nilBudget: 1000000 },
      { name: "UC Davis", mascot: "Aggies", abbreviation: "UCD", city: "Davis", state: "CA", primaryColor: "#002855", secondaryColor: "#daaa00", prestige: 4, stadium: 4, facilities: 5, collegeLife: 7, marketing: 4, academics: 8, fanbasePassion: "C", fanbaseType: "Academic Elite", enrollment: 40000, nilBudget: 1000000 },
      { name: "Cal State Northridge", mascot: "Matadors", abbreviation: "CSUN", city: "Northridge", state: "CA", primaryColor: "#ce1126", secondaryColor: "#000000", prestige: 4, stadium: 4, facilities: 4, collegeLife: 7, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 38000, nilBudget: 800000 },
      { name: "Cal State Bakersfield", mascot: "Roadrunners", abbreviation: "CSUB", city: "Bakersfield", state: "CA", primaryColor: "#003399", secondaryColor: "#f0ab00", prestige: 3, stadium: 3, facilities: 4, collegeLife: 5, marketing: 3, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 11000, nilBudget: 600000 },
    ],
    "HBCU": [
      { name: "Grambling State", mascot: "Tigers", abbreviation: "GRAM", city: "Grambling", state: "LA", primaryColor: "#000000", secondaryColor: "#f0ab00", prestige: 6, stadium: 5, facilities: 4, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 5000, nilBudget: 800000 },
      { name: "Southern University", mascot: "Jaguars", abbreviation: "SOU", city: "Baton Rouge", state: "LA", primaryColor: "#0033a0", secondaryColor: "#fdd023", prestige: 6, stadium: 5, facilities: 5, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 7000, nilBudget: 900000 },
      { name: "Florida A&M", mascot: "Rattlers", abbreviation: "FAMU", city: "Tallahassee", state: "FL", primaryColor: "#006747", secondaryColor: "#f47920", prestige: 7, stadium: 6, facilities: 5, collegeLife: 8, marketing: 7, academics: 6, fanbasePassion: "A+", fanbaseType: "Cult Following", enrollment: 10000, nilBudget: 1200000 },
      { name: "Bethune-Cookman", mascot: "Wildcats", abbreviation: "BCU", city: "Daytona Beach", state: "FL", primaryColor: "#8b0000", secondaryColor: "#ffd700", prestige: 6, stadium: 5, facilities: 5, collegeLife: 7, marketing: 6, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 4000, nilBudget: 700000 },
      { name: "Jackson State", mascot: "Tigers", abbreviation: "JKST", city: "Jackson", state: "MS", primaryColor: "#002b5c", secondaryColor: "#ffffff", prestige: 6, stadium: 6, facilities: 5, collegeLife: 7, marketing: 7, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 7000, nilBudget: 1000000 },
      { name: "North Carolina A&T", mascot: "Aggies", abbreviation: "NCAT", city: "Greensboro", state: "NC", primaryColor: "#004684", secondaryColor: "#ffc72c", prestige: 6, stadium: 5, facilities: 5, collegeLife: 7, marketing: 6, academics: 6, fanbasePassion: "A", fanbaseType: "Balanced", enrollment: 13000, nilBudget: 900000 },
      { name: "Alabama State", mascot: "Hornets", abbreviation: "ALST", city: "Montgomery", state: "AL", primaryColor: "#000000", secondaryColor: "#d4a843", prestige: 5, stadium: 5, facilities: 4, collegeLife: 7, marketing: 5, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 5000, nilBudget: 700000 },
      { name: "Norfolk State", mascot: "Spartans", abbreviation: "NSU", city: "Norfolk", state: "VA", primaryColor: "#006747", secondaryColor: "#ffc72c", prestige: 5, stadium: 5, facilities: 4, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 6000, nilBudget: 700000 },
      { name: "Alcorn State", mascot: "Braves", abbreviation: "ALCN", city: "Lorman", state: "MS", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 5, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "A", fanbaseType: "Cult Following", enrollment: 3500, nilBudget: 600000 },
      { name: "Prairie View A&M", mascot: "Panthers", abbreviation: "PVAM", city: "Prairie View", state: "TX", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 5, stadium: 4, facilities: 4, collegeLife: 6, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 600000 },
      { name: "Texas Southern", mascot: "Tigers", abbreviation: "TXSO", city: "Houston", state: "TX", primaryColor: "#8b0000", secondaryColor: "#b0b7bc", prestige: 5, stadium: 5, facilities: 4, collegeLife: 7, marketing: 5, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 7000, nilBudget: 700000 },
      { name: "Howard", mascot: "Bison", abbreviation: "HOW", city: "Washington", state: "DC", primaryColor: "#003a63", secondaryColor: "#e51937", prestige: 6, stadium: 5, facilities: 5, collegeLife: 8, marketing: 7, academics: 7, fanbasePassion: "A", fanbaseType: "Academic Elite", enrollment: 10000, nilBudget: 1000000 },
      { name: "Delaware State", mascot: "Hornets", abbreviation: "DSU", city: "Dover", state: "DE", primaryColor: "#c8102e", secondaryColor: "#00529b", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 500000 },
      { name: "Coppin State", mascot: "Eagles", abbreviation: "COPP", city: "Baltimore", state: "MD", primaryColor: "#002d72", secondaryColor: "#ffc72c", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 3000, nilBudget: 400000 },
      { name: "North Carolina Central", mascot: "Eagles", abbreviation: "NCCU", city: "Durham", state: "NC", primaryColor: "#8b0000", secondaryColor: "#b0b7bc", prestige: 5, stadium: 5, facilities: 4, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 8000, nilBudget: 600000 },
      { name: "Maryland Eastern Shore", mascot: "Hawks", abbreviation: "UMES", city: "Princess Anne", state: "MD", primaryColor: "#8b0000", secondaryColor: "#b7a57a", prestige: 4, stadium: 3, facilities: 3, collegeLife: 5, marketing: 4, academics: 5, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 3000, nilBudget: 400000 },
    ],
    "Missouri Valley": [
      { name: "Missouri State", mascot: "Bears", abbreviation: "MOST", city: "Springfield", state: "MO", primaryColor: "#8b0000", secondaryColor: "#ffffff", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 24000, nilBudget: 1500000 },
      { name: "Indiana State", mascot: "Sycamores", abbreviation: "INST", city: "Terre Haute", state: "IN", primaryColor: "#00529b", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1000000 },
      { name: "Illinois State", mascot: "Redbirds", abbreviation: "ILST", city: "Normal", state: "IL", primaryColor: "#ce1126", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 21000, nilBudget: 1000000 },
      { name: "Southern Illinois", mascot: "Salukis", abbreviation: "SIU", city: "Carbondale", state: "IL", primaryColor: "#8b0000", secondaryColor: "#000000", prestige: 6, stadium: 6, facilities: 5, collegeLife: 7, marketing: 5, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 12000, nilBudget: 1200000 },
      { name: "Bradley", mascot: "Braves", abbreviation: "BRAD", city: "Peoria", state: "IL", primaryColor: "#ce1126", secondaryColor: "#ffffff", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 800000 },
      { name: "Evansville", mascot: "Purple Aces", abbreviation: "EVAN", city: "Evansville", state: "IN", primaryColor: "#461d7c", secondaryColor: "#f47920", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 5000, nilBudget: 800000 },
      { name: "Valparaiso", mascot: "Beacons", abbreviation: "VALP", city: "Valparaiso", state: "IN", primaryColor: "#613318", secondaryColor: "#fdd023", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 4000, nilBudget: 700000 },
      { name: "UIC", mascot: "Flames", abbreviation: "UIC", city: "Chicago", state: "IL", primaryColor: "#001e62", secondaryColor: "#ce1126", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 34000, nilBudget: 1000000 },
      { name: "Belmont", mascot: "Bruins", abbreviation: "BELT", city: "Nashville", state: "TN", primaryColor: "#002d72", secondaryColor: "#ce1126", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 900000 },
      { name: "Murray State", mascot: "Racers", abbreviation: "MURR", city: "Murray", state: "KY", primaryColor: "#002d72", secondaryColor: "#fdd023", prestige: 5, stadium: 5, facilities: 5, collegeLife: 6, marketing: 4, academics: 6, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 10000, nilBudget: 800000 },
      { name: "Western Illinois", mascot: "Leathernecks", abbreviation: "WIU", city: "Macomb", state: "IL", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 4, stadium: 4, facilities: 4, collegeLife: 6, marketing: 4, academics: 5, fanbasePassion: "C", fanbaseType: "Balanced", enrollment: 7000, nilBudget: 600000 },
      { name: "Northern Iowa", mascot: "Panthers", abbreviation: "UNI", city: "Cedar Falls", state: "IA", primaryColor: "#461d7c", secondaryColor: "#fdd023", prestige: 5, stadium: 5, facilities: 5, collegeLife: 7, marketing: 5, academics: 7, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 10000, nilBudget: 1000000 },
      { name: "Creighton", mascot: "Bluejays", abbreviation: "CREI", city: "Omaha", state: "NE", primaryColor: "#005ca9", secondaryColor: "#ffffff", prestige: 6, stadium: 6, facilities: 6, collegeLife: 7, marketing: 6, academics: 8, fanbasePassion: "B", fanbaseType: "Balanced", enrollment: 9000, nilBudget: 1500000 },
    ],
  };
  
  return conferenceTeams[conferenceName] || [];
}

async function generateRecruits(leagueId: string, count: number) {
  const leagueForProgression = await storage.getLeague(leagueId);
  const progressionEnabled = leagueForProgression?.progressionEnabled ?? false;

  const recruits = generateRecruitClass(count);
  for (const r of recruits) {
    await storage.createRecruit({
      leagueId,
      ...r,
      ...(progressionEnabled ? (() => {
        let pot = rollWeightedPotential();
        if (r.isBlueChip) pot = Math.max(78, pot);
        if (r.isGenerationalGem) pot = Math.max(74, pot);
        if (r.isGem && !r.isGenerationalGem) pot = Math.max(74, pot);
        const range = getPotentialRange(pot);
        return { potential: pot, potentialFloor: range.floor, potentialCeiling: range.ceiling };
      })() : {}),
    });
  }

  await generateTopSchoolsForLeague(leagueId);
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
  
  // Create database entries with RECALCULATED interest levels based on final ranks
  for (const [recruitId, topSchools] of recruitTopSchoolsData.entries()) {
    // Sort by final rank
    topSchools.sort((a, b) => a.rank - b.rank);
    
    // Interest levels: #1 gets highest (70-80), lower ranks get proportionally less
    // This ensures #1 always has highest interest regardless of original score
    for (let i = 0; i < topSchools.length; i++) {
      const ts = topSchools[i];
      // Base interest by rank: #1=75, #2=65, #3=55, etc. with some variation
      const baseInterest = Math.max(30, 80 - (i * 8));
      // Add small variation based on original score
      const maxScore = Math.max(...topSchools.map(t => t.score)) || 100;
      const scoreBonus = Math.floor((ts.score / maxScore) * 5);
      const interestLevel = Math.min(80, baseInterest + scoreBonus);
      
      await storage.createRecruitTopSchool({
        recruitId,
        teamId: ts.teamId,
        interestLevel,
        rank: i + 1, // Use array index + 1 as final rank
        isActive: true,
        accumulatedInterest: 0,
      });
    }
  }
}

// Random appearance generator for players/recruits
function getRandomAppearance() {
  const skinTones = ["light", "medium", "tan", "dark", "deep"];
  const hairColors = ["black", "brown", "blonde", "red", "gray"];
  const hairStyles = ["short", "buzzcut", "curly", "mullet", "bald"];
  const headwears = ["cap", "helmet", "batting_helmet", "none"];
  
  return {
    skinTone: skinTones[Math.floor(Math.random() * skinTones.length)],
    hairColor: hairColors[Math.floor(Math.random() * hairColors.length)],
    hairStyle: hairStyles[Math.floor(Math.random() * hairStyles.length)],
    headwear: headwears[Math.floor(Math.random() * headwears.length)],
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
  // Conference tier → attribute scale factor (keeps cross-conference OVR spread realistic)
  const CONF_TIER_SCALE: Record<string, number> = {
    // Tier 1 — power conferences (full attribute scale)
    'SEC': 1.00, 'ACC': 1.00, 'Big 12': 1.00, 'Big Ten': 1.00,
    // Tier 2 — mid-major conferences
    'Pac-12': 0.80, 'AAC': 0.80, 'Sun Belt': 0.80,
    // Tier 3 — lower-mid conferences
    'WCC': 0.72, 'Mountain West': 0.72, 'Big West': 0.72, 'Missouri Valley': 0.72,
    // Tier 4 — academic/non-scholarship conferences
    'Ivy League': 0.68,
    // Tier 5 — HBCU conferences
    'HBCU': 0.65,
  };
  const tierScale = conferenceName ? (CONF_TIER_SCALE[conferenceName] ?? 1.00) : 1.00;
  const scaleAttr = (v: number) => tierScale < 1.00 ? Math.max(1, Math.min(99, Math.round(v * tierScale))) : v;

  const realRoster = teamName ? SEC_REAL_ROSTERS[teamName] : undefined;

  if (realRoster && realRoster.length > 0) {
    const usedJerseyNumbers = new Set<number>();

    for (const rp of realRoster) {
      const randomAppearance = getRandomAppearance();
      const appearance = {
        skinTone: rp.skinTone || randomAppearance.skinTone,
        hairColor: rp.hairColor || randomAppearance.hairColor,
        hairStyle: rp.hairStyle || randomAppearance.hairStyle,
        headwear: randomAppearance.headwear,
      };
      usedJerseyNumbers.add(rp.jerseyNumber);
      const playerData = {
        hitForAvg: scaleAttr(rp.hitForAvg), power: scaleAttr(rp.power), speed: scaleAttr(rp.speed), arm: scaleAttr(rp.arm),
        fielding: scaleAttr(rp.fielding), errorResistance: scaleAttr(rp.errorResistance),
        velocity: scaleAttr(rp.velocity), control: scaleAttr(rp.control), stamina: scaleAttr(rp.stamina), stuff: scaleAttr(rp.stuff),
        clutch: scaleAttr(rp.clutch), vsLHP: scaleAttr(rp.vsLHP), grit: scaleAttr(rp.grit), stealing: scaleAttr(rp.stealing),
        running: scaleAttr(rp.running), throwing: scaleAttr(rp.throwing), recovery: scaleAttr(rp.recovery),
        wRISP: scaleAttr(rp.wRISP), vsLefty: scaleAttr(rp.vsLefty), poise: scaleAttr(rp.poise), heater: scaleAttr(rp.heater), agile: scaleAttr(rp.agile),
        abilities: rp.abilities,
      };

      // #12 — Big 12 marquee boost: A/A+ potential players get a +10% lift on key
      // positional attributes so they feel genuinely elite relative to the field.
      if (conferenceName === "Big 12" && (rp.potential === "A+" || rp.potential === "A")) {
        const marquee = (v: number) => Math.max(1, Math.min(97, Math.round(v * 1.10)));
        if (rp.position === "P") {
          playerData.velocity = marquee(playerData.velocity);
          playerData.stuff    = marquee(playerData.stuff);
          playerData.control  = marquee(playerData.control);
          playerData.stamina  = marquee(playerData.stamina);
          playerData.clutch   = marquee(playerData.clutch);
          playerData.poise    = marquee(playerData.poise);
        } else {
          playerData.hitForAvg = marquee(playerData.hitForAvg);
          playerData.power     = marquee(playerData.power);
          playerData.clutch    = marquee(playerData.clutch);
          playerData.wRISP     = marquee(playerData.wRISP);
          playerData.grit      = marquee(playerData.grit);
        }
      }

      const rawOverall = calculateOVR(playerData);
      const overall = Math.max(159, Math.min(650, rawOverall));
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
        catcherAbility: rp.catcherAbility,
        skinTone: appearance.skinTone,
        hairColor: appearance.hairColor,
        hairStyle: appearance.hairStyle,
        headwear: appearance.headwear,
        potential: typeof rp.potential === 'string' ? potentialGradeToNumber(rp.potential as string) : (rp.potential ?? 71),
        pitchFB: rp.pitchFB,
        pitch2S: rp.pitch2S,
        pitchSL: rp.pitchSL,
        pitchCB: rp.pitchCB,
        pitchCH: rp.pitchCH,
        pitchCT: rp.pitchCT,
        pitchSNK: rp.pitchSNK,
        pitchSPL: rp.pitchSPL,
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
      const fillerEligibilities = ["FR", "SO", "JR"];

      for (let f = 0; f < remaining; f++) {
        const appearance = getRandomAppearance();
        const targetAvg = 25 + Math.floor(Math.random() * 15);
        const genAttr = () => Math.max(1, Math.min(99, targetAvg + Math.floor(Math.random() * 21) - 10));
        const pos = fillerPositions[f];
        const abilities: string[] = [];
        const playerData = {
          hitForAvg: genAttr(), power: genAttr(), speed: genAttr(), arm: genAttr(),
          fielding: genAttr(), errorResistance: genAttr(),
          velocity: genAttr(), control: genAttr(), stamina: genAttr(), stuff: genAttr(),
          clutch: genAttr(), vsLHP: genAttr(), grit: genAttr(), stealing: genAttr(),
          running: genAttr(), throwing: genAttr(), recovery: genAttr(),
          wRISP: genAttr(), vsLefty: genAttr(), poise: genAttr(), heater: genAttr(), agile: genAttr(),
          abilities,
        };
        const rawOvr = calculateOVR(playerData);
        const ovr = Math.max(159, Math.min(650, rawOvr));
        let jerseyNum = realRoster.length + f + 1;
        while (usedJerseyNumbers.has(jerseyNum)) jerseyNum++;
        usedJerseyNumbers.add(jerseyNum);
        const stEntry = fillerStates[Math.floor(Math.random() * fillerStates.length)];

        await storage.createPlayer({
          teamId,
          firstName: fillerNames[Math.floor(Math.random() * fillerNames.length)],
          lastName: fillerLastNames[Math.floor(Math.random() * fillerLastNames.length)],
          position: pos,
          eligibility: fillerEligibilities[Math.floor(Math.random() * fillerEligibilities.length)],
          homeState: stEntry.state,
          hometown: stEntry.cities[Math.floor(Math.random() * stEntry.cities.length)],
          jerseyNumber: jerseyNum,
          overall: ovr,
          starRating: getStarRatingFromOVR(ovr),
          ...playerData,
          catcherAbility: pos === "C" ? genAttr() : null,
          skinTone: appearance.skinTone,
          hairColor: appearance.hairColor,
          hairStyle: appearance.hairStyle,
          headwear: appearance.headwear,
          potential: rollWeightedPotential(),
          pitchFB: pos === "P" ? 1 : 0,
          pitch2S: pos === "P" && Math.random() < 0.5 ? 1 : 0,
          pitchSL: pos === "P" && Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 7) : 0,
          pitchCB: pos === "P" && Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 7) : 0,
          pitchCH: pos === "P" && Math.random() < 0.5 ? 1 : 0,
          pitchCT: 0, pitchSNK: 0, pitchSPL: 0,
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

  // Class balance: 6 SR, 6 JR, 7 SO, 6 FR = 25 total
  const eligibilityDistribution = [
    ...Array(6).fill("SR"),
    ...Array(6).fill("JR"),
    ...Array(7).fill("SO"),
    ...Array(6).fill("FR"),
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

    const abilityCount = starTier === 5 ? 3 + Math.floor(Math.random() * 3) :   // 3-5
                         starTier === 4 ? 2 + Math.floor(Math.random() * 3) :   // 2-4
                         starTier === 3 ? 1 + Math.floor(Math.random() * 3) :   // 1-3
                         starTier === 2 ? Math.floor(Math.random() * 3) :       // 0-2
                         Math.random() < 0.5 ? 1 : 0;                            // 1★: 50% of 1
    // #66 — use conference-flavored ability pools for HBCU/Ivy; generic pool for all others
    const abilities = getConferenceFlavoredAbilities(conferenceName, position, abilityCount, starTier >= 4);

    const appearance = getRandomAppearance();

    const hitForAvg = genAttrAroundAvg(targetAvg);
    const power = genAttrAroundAvg(targetAvg);
    const speed = genAttrAroundAvg(targetAvg);
    const arm = genAttrAroundAvg(targetAvg);
    const fielding = genAttrAroundAvg(targetAvg);
    const errorResistance = genAttrAroundAvg(targetAvg);
    const velocity = genAttrAroundAvg(targetAvg);
    const control = genAttrAroundAvg(targetAvg);
    const stamina = genAttrAroundAvg(targetAvg);
    const stuff = genAttrAroundAvg(targetAvg);
    const clutch = genAttrAroundAvg(targetAvg);
    const vsLHPVal = genAttrAroundAvg(targetAvg);
    const grit = genAttrAroundAvg(targetAvg);
    const stealing = genAttrAroundAvg(targetAvg);
    const running = genAttrAroundAvg(targetAvg);
    const throwing = genAttrAroundAvg(targetAvg);
    const recovery = genAttrAroundAvg(targetAvg);
    const wRISP = genAttrAroundAvg(targetAvg);
    const vsLefty = genAttrAroundAvg(targetAvg);
    const poise = genAttrAroundAvg(targetAvg);
    const heater = genAttrAroundAvg(targetAvg);
    const agile = genAttrAroundAvg(targetAvg);

    const playerData = {
      hitForAvg, power, speed, arm, fielding, errorResistance,
      velocity, control, stamina, stuff,
      clutch, vsLHP: vsLHPVal, grit, stealing, running, throwing, recovery,
      wRISP, vsLefty, poise, heater, agile,
      abilities,
    };

    const rawOverall = calculateOVR(playerData);
    const overall = Math.max(159, Math.min(650, rawOverall));
    const starRating = getStarRatingFromOVR(overall);

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
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
      headwear: appearance.headwear,
      potential: rollWeightedPotential(),
      pitchFB: position === "P" ? 1 : 0,
      pitch2S: position === "P" && Math.random() < 0.5 ? 1 : 0,
      pitchSL: position === "P" && Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchCB: position === "P" && Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchCH: position === "P" && Math.random() < 0.5 ? 1 : 0,
      pitchCT: position === "P" && Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchSNK: position === "P" && Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchSPL: position === "P" && Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 7) : 0,
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
    
    // Link coach to team
    await storage.updateTeam(team.id, { coachId: coach.id });
  }
}
