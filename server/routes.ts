import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import bcrypt from "bcrypt";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getRandomAbilities } from "@shared/abilities";
import type { Player, TransferPortalInterest } from "@shared/schema";

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
  maxTeams: z.number().min(4).max(16).optional(),
  cpuDifficulty: z.enum(["beginner", "high_school", "all_american", "elite"]).optional(),
  conferenceCount: z.number().min(2).max(4).optional(),
  selectedConferences: z.array(z.string()).min(1).max(4).optional(),
  seasonLength: z.enum(["short", "medium", "long"]).optional(),
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || randomUUID(),
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
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

  app.post("/api/leagues", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = leagueCreateSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid league data" });
      }

      const { name, maxTeams = 8, cpuDifficulty = "high_school", conferenceCount = 2, selectedConferences, seasonLength = "medium" } = result.data;

      const league = await storage.createLeague({
        name,
        commissionerId: userId,
        maxTeams,
        cpuDifficulty,
        seasonLength,
        currentPhase: "dynasty_setup",
      });

      // Create conferences - use selected conferences or default to first N
      const allConferences = ["SEC", "ACC", "Big 12", "Big Ten"];
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

  // Team selection - get available team templates for selecting which teams to include
  app.get("/api/leagues/:id/team-selection", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const conferences = await storage.getConferencesByLeague(league.id);
      
      // Return team templates (not DB teams) for each conference
      const conferenceTeamPools = conferences.map(conf => ({
        conference: conf,
        teams: getTeamsForConference(conf.name),
      }));
      
      res.json({ 
        league,
        conferences,
        conferenceTeamPools,
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

      const { selectedTeams } = req.body as { selectedTeams: { conferenceId: string; teamNames: string[] }[] };
      
      if (!selectedTeams || !Array.isArray(selectedTeams)) {
        return res.status(400).json({ message: "Invalid selected teams data" });
      }

      const conferences = await storage.getConferencesByLeague(league.id);
      let totalTeamsCreated = 0;

      for (const selection of selectedTeams) {
        const conf = conferences.find(c => c.id === selection.conferenceId);
        if (!conf) continue;

        const conferenceTeamPool = getTeamsForConference(conf.name);
        
        for (const teamName of selection.teamNames) {
          const teamData = conferenceTeamPool.find(t => t.name === teamName);
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
      await generateRecruits(league.id, 50);

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

      // Generate players for ALL teams in the league
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      for (const team of leagueTeams) {
        // Check if team already has players
        const existingPlayers = await storage.getPlayersByTeam(team.id);
        if (existingPlayers.length === 0) {
          await generatePlayersForTeam(team.id);
        }
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
      console.error("Setup failed:", error);
      res.status(500).json({ message: "Setup failed" });
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
      const userTeam = leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const leagueRecruits = await storage.getRecruitsByLeague(league.id);
      const interests = await storage.getRecruitingInterestsByTeam(userTeam.id);
      const roster = await storage.getPlayersByTeam(userTeam.id);
      
      // Get coach data for skill-based action limits
      const coach = userTeam.coachId ? await storage.getCoach(userTeam.coachId) : null;

      // Build team lookup map for top schools
      const teamMap = new Map(leagueTeams.map(t => [t.id, t]));

      const recruitsWithInterest = await Promise.all(leagueRecruits.map(async (recruit) => {
        const interest = interests.find((i) => i.recruitId === recruit.id);
        
        // Fetch stored top schools from database (only includes teams in the league)
        const storedTopSchools = await storage.getRecruitTopSchools(recruit.id);
        
        // Stage values are lowercase: "open", "top8", "top5", "top3", "verbal", "signed"
        const stage = (recruit.stage || "open").toLowerCase();
        const topSchoolsCount = stage === "top3" ? 3 : stage === "top5" ? 5 : 8;
        
        // Convert stored top schools to display format, filtering by active schools in the league
        let topSchools = storedTopSchools
          .filter(ts => ts.isActive && teamMap.has(ts.teamId))
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
        
        return {
          ...recruit,
          interest,
          topSchools,
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

      // Calculate dynamic maximums based on coach skills
      const scoutingSkill = coach?.scoutingSkill || 1;
      const evaluationSkill = coach?.evaluationSkill || 1;
      const pitchingRecruitingSkill = coach?.pitchingRecruitingSkill || 1;
      const hittingRecruitingSkill = coach?.hittingRecruitingSkill || 1;
      
      // Scout actions: 5 base + (scouting + evaluation) / 2
      const maxScoutActions = 5 + Math.floor((scoutingSkill + evaluationSkill) / 2);
      // Recruiting actions: 5 base + (pitching + hitting recruiting) / 2
      const maxRecruitingActions = 5 + Math.floor((pitchingRecruitingSkill + hittingRecruitingSkill) / 2);
      
      // Count seniors for commit limit calculation (max 25 roster, so commits = 25 - current + seniors leaving)
      const seniorsCount = roster.filter(p => p.eligibility === 'SR').length;
      const nextYearRosterSize = roster.length - seniorsCount;
      const maxCommits = Math.max(0, 25 - roster.length + seniorsCount);
      
      // Track scout and recruiting actions used
      const scoutActionsUsed = interests.filter((i) => i.scoutPercentage > 0).length;
      const recruitingActionsUsed = interests.filter((i) => i.interestLevel > 0).length;
      const remainingScoutActions = Math.max(0, maxScoutActions - scoutActionsUsed);
      const remainingRecruitingActions = Math.max(0, maxRecruitingActions - recruitingActionsUsed);

      res.json({
        recruits: recruitsWithInterest,
        team: userTeam,
        remainingActions: remainingRecruitingActions,
        maxActions: maxRecruitingActions,
        remainingScoutActions,
        maxScoutActions,
        targetedCount: interests.filter((i) => i.isTargeted).length,
        commitsCount: leagueRecruits.filter((r) => r.signedTeamId === userTeam.id).length,
        maxCommits,
        rosterDepth: positionCounts,
        rosterSize: roster.length,
        nextYearDepth,
        nextYearRosterSize,
        seniorsGraduating: seniorsCount,
      });
    } catch (error) {
      console.error("Failed to fetch recruiting data:", error);
      res.status(500).json({ message: "Failed to fetch recruiting data" });
    }
  });

  app.post("/api/leagues/:id/recruiting/:recruitId/scout", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const userTeam = leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      // Get the recruit to know actual values for progressive reveal
      const recruit = await storage.getRecruit(req.params.recruitId as string);
      if (!recruit) {
        return res.status(404).json({ message: "Recruit not found" });
      }

      let interest = await storage.getRecruitingInterest(req.params.recruitId, userTeam.id);
      
      // Scout reveals 15-25% each time
      const revealAmount = 15 + Math.floor(Math.random() * 11);

      // Helper function to narrow down a range
      const narrowRange = (min: number, max: number, actual: number, pct: number): { newMin: number; newMax: number } => {
        const range = max - min;
        // As scouting progresses, narrow the range around the actual value
        const narrowFactor = pct / 100;
        const newRange = Math.max(0, range * (1 - narrowFactor * 0.8));
        const halfRange = Math.floor(newRange / 2);
        let newMin = Math.max(min, actual - halfRange);
        let newMax = Math.min(max, actual + halfRange);
        // Ensure range is at least 1 apart unless at 100%
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
        const ovrRange = narrowRange(1, 999, recruit.overall, revealAmount);
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
        const currentMinOvr = interest.minOverall || 1;
        const currentMaxOvr = interest.maxOverall || 999;
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

  // ============ RECRUITING CALCULATION HELPERS ============
  
  // Calculate priority match bonus based on pitch topic and recruit priorities
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
  
  // Calculate coach skill bonus for recruiting action
  function calculateCoachBonus(coach: any, recruit: any, actionType: string): number {
    if (!coach) return 1.0;
    
    const isPitcher = recruit.position === "P";
    const baseSkill = isPitcher 
      ? (coach.pitchingRecruitingSkill || 1)
      : (coach.hittingRecruitingSkill || 1);
    const skillBonus = 1.0 + (baseSkill - 1) * 0.05;
    
    const archetypeMultipliers: Record<string, number> = {
      "Pure CEO": 1.15,
      "Player's Coach": 1.10,
      "Balanced": 1.0,
      "Tactician": 0.95,
      "Old School": 0.90,
    };
    const archetypeBonus = archetypeMultipliers[coach.archetype] || 1.0;
    
    return skillBonus * archetypeBonus;
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

  // Recruiting action: phone call with pitch topic
  app.post("/api/leagues/:id/recruiting/:recruitId/phone", requireAuth, async (req, res) => {
    try {
      const { pitchTopic } = req.body || {}; // proximity, reputation, playingTime, academics, prestige, facilities
      
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

      // Calculate interest gain with modifiers
      const baseGain = 5 + Math.floor(Math.random() * 10); // 5-14 base
      const topic = pitchTopic || "reputation"; // Default pitch topic
      
      const { bonus: priorityBonus, matchLevel } = calculatePriorityBonus(topic, recruit, userTeam);
      const schoolBonus = calculateSchoolBonus(topic, userTeam);
      const coachBonus = calculateCoachBonus(userCoach, recruit, "phone");
      const proximityBonus = topic === "proximity" ? calculateProximityBonus(recruit.homeState, userTeam.state) : 1.0;
      
      // Apply all modifiers
      const totalMultiplier = priorityBonus * schoolBonus * coachBonus * proximityBonus;
      const interestGain = Math.round(baseGain * totalMultiplier);

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

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "phone",
        interestChange: interestGain,
        notes: `Phone call about ${topic} (${matchLevel} priority, +${interestGain}%)`,
      });

      res.json({ 
        interest, 
        interestGain, 
        pitchTopic: topic, 
        matchLevel,
        multiplier: totalMultiplier.toFixed(2)
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

      // Calculate interest gain with modifiers (email is less effective than phone)
      const baseGain = 3 + Math.floor(Math.random() * 5); // 3-7 base
      const topic = pitchTopic || "reputation";
      
      const { bonus: priorityBonus, matchLevel } = calculatePriorityBonus(topic, recruit, userTeam);
      const schoolBonus = calculateSchoolBonus(topic, userTeam);
      const coachBonus = calculateCoachBonus(userCoach, recruit, "email");
      const proximityBonus = topic === "proximity" ? calculateProximityBonus(recruit.homeState, userTeam.state) : 1.0;
      
      const totalMultiplier = priorityBonus * schoolBonus * coachBonus * proximityBonus;
      const interestGain = Math.round(baseGain * totalMultiplier);

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

      res.json({ 
        interest, 
        interestGain, 
        pitchTopic: topic, 
        matchLevel,
        multiplier: totalMultiplier.toFixed(2)
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

      // Campus visits give huge bonuses based on all school attributes
      const baseGain = 15 + Math.floor(Math.random() * 10); // 15-24 base
      
      // Campus visit is influenced by multiple school attributes
      const facilitiesBonus = (userTeam.facilities || 5) / 5;
      const academicsBonus = (userTeam.academics || 5) / 5;
      const prestigeBonus = (userTeam.prestige || 5) / 5;
      const collegeLifeBonus = (userTeam.collegeLife || 5) / 5;
      
      // Average of relevant attributes
      const schoolAttrBonus = (facilitiesBonus + academicsBonus + prestigeBonus + collegeLifeBonus) / 4;
      const coachBonus = calculateCoachBonus(userCoach, recruit, "visit");
      
      const totalMultiplier = schoolAttrBonus * coachBonus;
      const interestGain = Math.round(baseGain * totalMultiplier);

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

      await storage.createRecruitingAction({
        recruitId: req.params.recruitId as string,
        teamId: userTeam.id,
        leagueId: req.params.id as string,
        week: league.currentWeek,
        season: league.currentSeason,
        actionType: "visit",
        interestChange: interestGain,
        notes: `Campus visit (+${interestGain}% interest)`,
      });

      res.json({ 
        interest, 
        interestGain,
        multiplier: totalMultiplier.toFixed(2)
      });
    } catch (error) {
      console.error("Failed to schedule visit:", error);
      res.status(500).json({ message: "Failed to schedule visit" });
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

      let interest = await storage.getRecruitingInterest(req.params.recruitId as string, userTeam.id);
      
      // Offers give big interest boost, influenced by prestige
      const baseGain = 15 + Math.floor(Math.random() * 10);
      const prestigeBonus = (userTeam.prestige || 5) / 5;
      const interestGain = Math.round(baseGain * prestigeBonus);
      
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

      res.json({ interest, interestGain });
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
        interest = await storage.createRecruitingInterest({
          recruitId: req.params.recruitId,
          teamId: userTeam.id,
          isTargeted: true,
        });
      } else {
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
          avgStarRating: teamCommits.length > 0 
            ? teamCommits.reduce((sum, r) => sum + (r.starRating || 3), 0) / teamCommits.length 
            : 0,
        };
      }).sort((a, b) => {
        // Sort by commit count, then by average star rating
        if (b.commitCount !== a.commitCount) return b.commitCount - a.commitCount;
        return b.avgStarRating - a.avgStarRating;
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

      const updated = await storage.updatePlayer(req.params.playerId, req.body);
      
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
      // High skill = 4 or 5 star rating OR overall >= 700
      const isRedshirt = player.eligibility === "RS";
      const isHighSkill = player.starRating >= 4 || player.overall >= 700;
      
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
          message: "Only high-skill players (4+ stars or 700+ overall) can declare for the draft" 
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
            if (key in update.changes) {
              sanitizedData[key] = update.changes[key];
            }
          }
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

      res.json({
        games: gamesWithTeams,
        currentWeek: league.currentWeek,
        currentSeason: league.currentSeason,
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
      const leagueStandings = await storage.getStandingsByLeague(req.params.id, game.season);
      
      const homeStanding = leagueStandings.find(s => s.teamId === game.homeTeamId);
      const awayStanding = leagueStandings.find(s => s.teamId === game.awayTeamId);

      if (homeStanding && awayStanding) {
        const homeWon = homeScore > awayScore;
        
        await storage.updateStandings(homeStanding.id, {
          wins: homeStanding.wins + (homeWon ? 1 : 0),
          losses: homeStanding.losses + (homeWon ? 0 : 1),
          runsScored: homeStanding.runsScored + homeScore,
          runsAllowed: homeStanding.runsAllowed + awayScore,
        });
        
        await storage.updateStandings(awayStanding.id, {
          wins: awayStanding.wins + (homeWon ? 0 : 1),
          losses: awayStanding.losses + (homeWon ? 1 : 0),
          runsScored: awayStanding.runsScored + awayScore,
          runsAllowed: awayStanding.runsAllowed + homeScore,
        });
      }

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
      
      // Determine max weeks for season based on phase
      const seasonWeeks: Record<string, number> = {
        "short": 8,
        "medium": 14,
        "long": 32,
      };
      const maxWeeks = seasonWeeks[league.seasonLength || "medium"] || 14;
      
      // ============ CPU RECRUITING AI ============
      if (league.currentPhase === "recruiting" || league.currentPhase === "preseason") {
        await runCpuRecruiting(leagueId, currentWeek, league.currentSeason);
      }
      
      // ============ RECRUIT STAGE PROGRESSION ============
      await updateRecruitStages(leagueId, nextWeek);
      
      // ============ RESET WEEKLY ACTIONS ============
      const coaches = await storage.getCoachesByLeague(leagueId);
      for (const coach of coaches) {
        await storage.updateCoach(coach.id, {
          scoutActionsUsed: 0,
          recruitActionsUsed: 0,
        });
      }

      // ============ POSTSEASON / SEASON PROGRESSION ============
      const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(league.currentPhase);

      if (isPostseason) {
        if (league.currentPhase === "conference_championship") {
          const confGames = (await storage.getGamesByLeague(leagueId))
            .filter(g => g.phase === "conference_championship" && g.season === league.currentSeason && !g.isComplete);
          
          for (const game of confGames) {
            const result = await simulateGame(game.homeTeamId, game.awayTeamId);
            await storage.updateGame(game.id, { homeScore: result.homeScore, awayScore: result.awayScore, isComplete: true });
            await updateStandingsForGame(leagueId, league.currentSeason, game.homeTeamId, game.awayTeamId, result.homeScore, result.awayScore);
          }
          
          await generateSuperRegionalBracket(leagueId, league.currentSeason);
          
          const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "super_regionals" });
          await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Conference Championships Complete", details: "Conference championship games have been played. Super Regionals begin!" });
          return res.json(updatedLeague);
        }
        
        if (league.currentPhase === "super_regionals") {
          const srResult = await advanceSuperRegionals(leagueId, league.currentSeason);
          
          if (srResult.done && srResult.champion1 && srResult.champion2) {
            await storage.createGame({
              leagueId, season: league.currentSeason, week: 0,
              homeTeamId: srResult.champion1, awayTeamId: srResult.champion2,
              phase: "cws",
            });
            const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "cws" });
            await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Super Regionals Complete", details: "The final two teams advance to the College World Series!" });
            return res.json(updatedLeague);
          }
          
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
            
            const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "offseason" });
            await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "CWS Champion Crowned!", details: `${champTeam?.name || "Unknown"} wins the College World Series over ${runnerUpTeam?.name || "Unknown"}!` });
            
            await storage.createDynastyNews({
              leagueId,
              authorName: "Dynasty Sports Network",
              title: `${champTeam?.name} Wins the College World Series!`,
              content: `The ${champTeam?.name} ${champTeam?.mascot} have defeated the ${runnerUpTeam?.name} ${runnerUpTeam?.mascot} to win the College World Series championship!`,
              category: "game",
            });
            
            return res.json({ ...updatedLeague, cwsChampion: cwsResult.champion, cwsRunnerUp: cwsResult.runnerUp });
          }
          
          await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "CWS Game Complete", details: "A game of the College World Series has been played." });
          const updatedLeague = await storage.getLeague(leagueId);
          return res.json(updatedLeague);
        }
      }

      if (league.currentPhase === "offseason") {
        const transitionResult = await performSeasonTransition(leagueId, league.currentSeason);
        
        const updatedLeague = await storage.updateLeague(league.id, {
          currentWeek: 1,
          currentSeason: league.currentSeason + 1,
          currentPhase: "preseason",
        });

        await storage.createAuditLog({
          leagueId: league.id,
          userId: req.session.userId,
          action: "Season Advanced",
          details: `Season ${league.currentSeason} ended. ${transitionResult.graduated} players graduated, ${transitionResult.recruitsAdded} recruits joined rosters, ${transitionResult.newRecruits} new recruits generated. Now entering Season ${league.currentSeason + 1}.`,
        });

        return res.json({ ...updatedLeague, seasonTransition: transitionResult });
      }

      if (nextWeek > maxWeeks) {
        await generateConferenceChampionships(leagueId, league.currentSeason);
        const updatedLeague = await storage.updateLeague(league.id, { currentPhase: "conference_championship" });
        await storage.createAuditLog({ leagueId, userId: req.session.userId, action: "Regular Season Complete", details: "The regular season is over! Conference Championships begin." });
        return res.json(updatedLeague);
      }

      const updatedLeague = await storage.updateLeague(league.id, {
        currentWeek: nextWeek,
      });

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Week Advanced",
        details: `Advanced to Week ${nextWeek}`,
      });

      res.json(updatedLeague);
    } catch (error) {
      console.error("Failed to advance week:", error);
      res.status(500).json({ message: "Failed to advance week" });
    }
  });
  
  // ============ GAME SIMULATION FUNCTION ============
  async function simulateGame(homeTeamId: string, awayTeamId: string): Promise<{ homeScore: number; awayScore: number }> {
    const homePlayers = await storage.getPlayersByTeam(homeTeamId);
    const awayPlayers = await storage.getPlayersByTeam(awayTeamId);
    
    const homeStrength = homePlayers.length > 0 
      ? homePlayers.reduce((sum, p) => sum + (p.overall || 500), 0) / homePlayers.length 
      : 500;
    const awayStrength = awayPlayers.length > 0 
      ? awayPlayers.reduce((sum, p) => sum + (p.overall || 500), 0) / awayPlayers.length 
      : 500;
    
    const homeBase = 2 + Math.random() * 6;
    const awayBase = 2 + Math.random() * 6;
    
    const strengthDiff = (homeStrength - awayStrength) / 500;
    let homeScore = Math.round(homeBase + strengthDiff * 2 + Math.random() * 2);
    let awayScore = Math.round(awayBase - strengthDiff * 2);
    
    homeScore = Math.max(0, homeScore);
    awayScore = Math.max(0, awayScore);
    if (homeScore === awayScore) {
      if (Math.random() > 0.5) homeScore++; else awayScore++;
    }
    
    return { homeScore, awayScore };
  }

  // ============ STANDINGS UPDATE HELPER ============
  async function updateStandingsForGame(leagueId: string, season: number, homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number) {
    const standingsList = await storage.getStandingsByLeague(leagueId, season);
    const homeStanding = standingsList.find(s => s.teamId === homeTeamId);
    const awayStanding = standingsList.find(s => s.teamId === awayTeamId);
    
    if (homeScore > awayScore) {
      if (homeStanding) await storage.updateStandings(homeStanding.id, { wins: (homeStanding.wins || 0) + 1, runsScored: (homeStanding.runsScored || 0) + homeScore, runsAllowed: (homeStanding.runsAllowed || 0) + awayScore });
      if (awayStanding) await storage.updateStandings(awayStanding.id, { losses: (awayStanding.losses || 0) + 1, runsScored: (awayStanding.runsScored || 0) + awayScore, runsAllowed: (awayStanding.runsAllowed || 0) + homeScore });
    } else {
      if (awayStanding) await storage.updateStandings(awayStanding.id, { wins: (awayStanding.wins || 0) + 1, runsScored: (awayStanding.runsScored || 0) + awayScore, runsAllowed: (awayStanding.runsAllowed || 0) + homeScore });
      if (homeStanding) await storage.updateStandings(homeStanding.id, { losses: (homeStanding.losses || 0) + 1, runsScored: (homeStanding.runsScored || 0) + homeScore, runsAllowed: (homeStanding.runsAllowed || 0) + awayScore });
    }
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
      return { team: t, wins: s?.wins || 0, runsScored: s?.runsScored || 0 };
    }).sort((a, b) => b.wins - a.wins || b.runsScored - a.runsScored);
    
    const bracketSize = Math.floor(leagueTeams.length / 2);
    const qualifiedTeams = rankedTeams.slice(0, bracketSize);
    
    const fullBracketSize = Math.pow(2, Math.floor(Math.log2(bracketSize)));
    const numFirstRoundGames = bracketSize - fullBracketSize;
    
    if (numFirstRoundGames === 0) {
      for (let i = 0; i < qualifiedTeams.length / 2; i++) {
        await storage.createGame({
          leagueId,
          season,
          week: 0,
          homeTeamId: qualifiedTeams[i].team.id,
          awayTeamId: qualifiedTeams[qualifiedTeams.length - 1 - i].team.id,
          phase: "super_regionals",
        });
      }
    } else {
      const numByes = fullBracketSize - numFirstRoundGames;
      const firstRoundTeams = qualifiedTeams.slice(numByes);
      
      for (let i = 0; i < firstRoundTeams.length / 2; i++) {
        const home = firstRoundTeams[i];
        const away = firstRoundTeams[firstRoundTeams.length - 1 - i];
        await storage.createGame({
          leagueId,
          season,
          week: 0,
          homeTeamId: home.team.id,
          awayTeamId: away.team.id,
          phase: "super_regionals",
        });
      }
    }
  }

  // ============ ADVANCE SUPER REGIONALS ============
  async function advanceSuperRegionals(leagueId: string, season: number): Promise<{ done: boolean; champion1?: string; champion2?: string }> {
    const allGames = await storage.getGamesByLeague(leagueId);
    const srGames = allGames.filter(g => g.phase === "super_regionals" && g.season === season);
    
    const incompleteGames = srGames.filter(g => !g.isComplete);
    
    for (const game of incompleteGames) {
      const result = await simulateGame(game.homeTeamId, game.awayTeamId);
      await storage.updateGame(game.id, {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        isComplete: true,
      });
    }
    
    const updatedAllGames = await storage.getGamesByLeague(leagueId);
    const updatedSRGames = updatedAllGames.filter(g => g.phase === "super_regionals" && g.season === season && g.isComplete);
    
    const eliminated = new Set<string>();
    for (const g of updatedSRGames) {
      const loserId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.awayTeamId : g.homeTeamId;
      eliminated.add(loserId);
    }
    
    const participated = new Set<string>();
    for (const g of updatedSRGames) {
      participated.add(g.homeTeamId);
      participated.add(g.awayTeamId);
    }
    
    const leagueTeams = await storage.getTeamsByLeague(leagueId);
    const standingsList = await storage.getStandingsByLeague(leagueId, season);
    const rankedTeams = leagueTeams.map(t => {
      const s = standingsList.find(st => st.teamId === t.id);
      return { team: t, wins: s?.wins || 0, runsScored: s?.runsScored || 0 };
    }).sort((a, b) => b.wins - a.wins || b.runsScored - a.runsScored);
    const bracketSize = Math.floor(leagueTeams.length / 2);
    const qualifiedTeamIds = rankedTeams.slice(0, bracketSize).map(t => t.team.id);
    
    const remainingTeams = qualifiedTeamIds.filter(id => !eliminated.has(id));
    const byeTeams = remainingTeams.filter(id => !participated.has(id));
    const activeWinners = remainingTeams.filter(id => participated.has(id));
    
    const nextRoundTeams = [...activeWinners, ...byeTeams].sort((a, b) => {
      return qualifiedTeamIds.indexOf(a) - qualifiedTeamIds.indexOf(b);
    });
    
    if (nextRoundTeams.length <= 2) {
      return { done: true, champion1: nextRoundTeams[0], champion2: nextRoundTeams[1] };
    }
    
    for (let i = 0; i < nextRoundTeams.length / 2; i++) {
      await storage.createGame({
        leagueId,
        season,
        week: 0,
        homeTeamId: nextRoundTeams[i],
        awayTeamId: nextRoundTeams[nextRoundTeams.length - 1 - i],
        phase: "super_regionals",
      });
    }
    
    return { done: false };
  }

  // ============ ADVANCE CWS (BEST OF 3) ============
  async function advanceCWS(leagueId: string, season: number): Promise<{ done: boolean; champion?: string; runnerUp?: string }> {
    const allGames = await storage.getGamesByLeague(leagueId);
    const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season);
    
    const incompleteGames = cwsGames.filter(g => !g.isComplete);
    for (const game of incompleteGames) {
      const result = await simulateGame(game.homeTeamId, game.awayTeamId);
      await storage.updateGame(game.id, {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        isComplete: true,
      });
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
  async function performSeasonTransition(leagueId: string, completedSeason: number) {
    const teams = await storage.getTeamsByLeague(leagueId);
    let totalGraduated = 0;
    let totalRecruitsAdded = 0;
    let totalDraftDeclared = 0;
    let totalTransferred = 0;
    
    for (const team of teams) {
      const roster = await storage.getPlayersByTeam(team.id);
      
      // 1. Archive graduating seniors (SR eligibility) to player history
      const seniors = roster.filter(p => p.eligibility === "SR");
      for (const senior of seniors) {
        const eligMap: Record<string, number> = { "FR": 1, "SO": 2, "JR": 3, "SR": 4, "RS": 5 };
        await storage.createPlayerHistory({
          leagueId,
          teamId: team.id,
          firstName: senior.firstName,
          lastName: senior.lastName,
          position: senior.position,
          finalEligibility: senior.eligibility,
          overall: senior.overall,
          starRating: senior.starRating,
          departureType: "graduated",
          departedSeason: completedSeason,
          seasonsPlayed: eligMap[senior.eligibility] || 1,
          abilities: senior.abilities || [],
          homeState: senior.homeState,
          hometown: senior.hometown,
        });
        await storage.deletePlayer(senior.id);
        totalGraduated++;
      }
      
      // 2. Archive draft-declared players
      const draftDeclared = roster.filter(p => p.declaredForDraft && !seniors.includes(p));
      for (const player of draftDeclared) {
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
          departureType: "draft",
          departedSeason: completedSeason,
          seasonsPlayed: eligMap[player.eligibility] || 1,
          abilities: player.abilities || [],
          homeState: player.homeState,
          hometown: player.hometown,
        });
        await storage.deletePlayer(player.id);
        totalDraftDeclared++;
      }
      
      // 3. Archive transfer portal players who haven't been signed
      const portalPlayers = roster.filter(p => p.inTransferPortal && !seniors.includes(p) && !draftDeclared.includes(p));
      for (const player of portalPlayers) {
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
          departureType: "transfer_portal",
          departedSeason: completedSeason,
          seasonsPlayed: eligMap[player.eligibility] || 1,
          abilities: player.abilities || [],
          homeState: player.homeState,
          hometown: player.hometown,
        });
        await storage.deletePlayer(player.id);
        totalTransferred++;
      }
      
      // 4. Advance eligibility for remaining players: FR→SO, SO→JR, JR→SR
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
      
      // 5. Convert signed recruits into roster players
      const recruits = await storage.getRecruitsByLeague(leagueId);
      const signedRecruits = recruits.filter(r => r.signedTeamId === team.id);
      
      for (const recruit of signedRecruits) {
        const jerseyNumber = 1 + Math.floor(Math.random() * 99);
        await storage.createPlayer({
          teamId: team.id,
          firstName: recruit.firstName,
          lastName: recruit.lastName,
          position: recruit.position,
          eligibility: "FR",
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
        });
        totalRecruitsAdded++;
      }
    }
    
    // 6. Clear old recruits and recruiting data, generate new class
    await storage.deleteRecruitsByLeague(leagueId);
    
    // Generate new recruiting class (40-50 recruits)
    const recruitCount = 40 + Math.floor(Math.random() * 11);
    await generateRecruits(leagueId, recruitCount);
    
    // 7. Create new standings for the next season (guard against duplicates)
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
    
    return {
      graduated: totalGraduated,
      draftDeclared: totalDraftDeclared,
      transferred: totalTransferred,
      recruitsAdded: totalRecruitsAdded,
      newRecruits: recruitCount,
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
      
      if (league.currentPhase !== "offseason") {
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
        details: `Season ${league.currentSeason} ended. ${transitionResult.graduated} players graduated, ${transitionResult.recruitsAdded} recruits joined rosters, ${transitionResult.newRecruits} new recruits generated.`,
      });

      res.json({ ...updatedLeague, seasonTransition: transitionResult });
    } catch (error) {
      console.error("Failed to advance season:", error);
      res.status(500).json({ message: "Failed to advance season" });
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
      
      const enrichGame = (g: any) => ({
        ...g,
        homeTeam: teamMap[g.homeTeamId],
        awayTeam: teamMap[g.awayTeamId],
      });
      
      res.json({
        phase: league.currentPhase,
        season,
        conferenceChampionships: confChampGames.map(enrichGame),
        superRegionals: srGames.map(enrichGame),
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
      const interests = await storage.getRecruitingInterestsByTeam(teamId);
      const allRecruits = await storage.getRecruitsByLeague(leagueId);
      const roster = await storage.getPlayersByTeam(teamId);
      
      const pipeline = { cold: 0, cool: 0, warm: 0, hot: 0, very_hot: 0, on_fire: 0, committed: 0 };
      const committed = allRecruits.filter(r => r.signedTeamId === teamId);
      pipeline.committed = committed.length;
      
      for (const interest of interests) {
        if (interest.interestLevel >= 90) pipeline.on_fire++;
        else if (interest.interestLevel >= 70) pipeline.very_hot++;
        else if (interest.interestLevel >= 50) pipeline.hot++;
        else if (interest.interestLevel >= 30) pipeline.warm++;
        else if (interest.interestLevel >= 15) pipeline.cool++;
        else pipeline.cold++;
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
      
      res.json({ pipeline, positionNeeds, totalTargeted: interests.filter(i => i.isTargeted).length, rosterSize: roster.length });
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
      
      const conferenceAwards = confs.map(conf => {
        const confTeamIds = leagueTeams.filter(t => t.conferenceId === conf.id).map(t => t.id);
        const confPlayers = allPlayers.filter(x => confTeamIds.includes(x.player.teamId));
        const confNonP = confPlayers.filter(x => x.player.position !== "P").sort((a, b) => b.player.overall - a.player.overall);
        const confP = confPlayers.filter(x => x.player.position === "P").sort((a, b) => b.player.overall - a.player.overall);
        return {
          conferenceName: conf.name,
          mvp: formatAward(confNonP[0]),
          pitcherOfYear: formatAward(confP[0]),
          topPlayers: confPlayers.sort((a, b) => b.player.overall - a.player.overall).slice(0, 5).map(formatAward),
        };
      });
      
      res.json({
        season: league.currentSeason,
        leagueAwards: {
          mvp: formatAward(nonPitchers[0]),
          pitcherOfYear: formatAward(pitchers[0]),
          freshmanOfYear: formatAward(freshmen[0]),
        },
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
      beginner:     { minActions: 1, maxActions: 2, gainMultiplier: 0.6,  targetingBonus: 0,  offerThreshold: 70, visitThreshold: 85 },
      high_school:  { minActions: 2, maxActions: 3, gainMultiplier: 0.85, targetingBonus: 3,  offerThreshold: 50, visitThreshold: 70 },
      all_american: { minActions: 3, maxActions: 4, gainMultiplier: 1.1,  targetingBonus: 7,  offerThreshold: 40, visitThreshold: 55 },
      elite:        { minActions: 4, maxActions: 5, gainMultiplier: 1.35, targetingBonus: 12, offerThreshold: 30, visitThreshold: 45 },
    };
    const config = difficultyConfig[difficulty] || difficultyConfig.high_school;
    
    const teams = await storage.getTeamsByLeague(leagueId);
    const cpuTeams = teams.filter(t => t.isCpu);
    const recruits = await storage.getRecruitsByLeague(leagueId);
    const unsignedRecruits = recruits.filter(r => !r.signedTeamId);
    
    if (unsignedRecruits.length === 0 || cpuTeams.length === 0) return;
    
    for (const team of cpuTeams) {
      const actionsPerWeek = config.minActions + Math.floor(Math.random() * (config.maxActions - config.minActions + 1));
      
      const teamInterests = await storage.getRecruitingInterestsByTeam(team.id);
      const roster = await storage.getPlayersByTeam(team.id);
      
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
      
      for (let i = 0; i < Math.min(actionsPerWeek, sortedRecruits.length); i++) {
        const { recruit, interest } = sortedRecruits[i];
        
        const actionTypes = ["email", "phone", "phone"];
        if ((interest?.interestLevel || 0) > config.offerThreshold && !interest?.hasOffer) {
          actionTypes.push("offer");
        }
        if ((interest?.interestLevel || 0) > config.visitThreshold) {
          actionTypes.push("visit");
        }
        
        const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];
        
        let baseGain = 0;
        switch (actionType) {
          case "email": baseGain = 3 + Math.floor(Math.random() * 5); break;
          case "phone": baseGain = 5 + Math.floor(Math.random() * 10); break;
          case "offer": baseGain = 15 + Math.floor(Math.random() * 10); break;
          case "visit": baseGain = 15 + Math.floor(Math.random() * 10); break;
        }
        
        const overallQuality = ((team.prestige || 5) + (team.facilities || 5) + (team.academics || 5)) / 15;
        const schoolBonus = 0.8 + (overallQuality * 0.4);
        const interestGain = Math.round(baseGain * schoolBonus * config.gainMultiplier);
        
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
        
        // Log the CPU action
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
      // Get all interests for this recruit
      const allInterests = await storage.getRecruitingInterestsByRecruit(recruit.id);
      if (allInterests.length === 0) continue;
      
      // Sort by interest level to find top schools
      const sortedInterests = allInterests
        .filter(i => i.interestLevel > 0)
        .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0));
      
      const topInterestLevel = sortedInterests[0]?.interestLevel || 0;
      const currentStage = recruit.stage || "open";
      
      // Determine new stage based on week and interest levels
      let newStage = currentStage;
      
      // Stage progression happens naturally over time if recruits have interested teams
      if (sortedInterests.length >= 1) {
        if (week >= 12 && topInterestLevel >= 90 && sortedInterests.some(i => i.hasOffer)) {
          // High interest + offer late in recruiting = can commit
          newStage = "verbal";
        } else if (week >= 10 && topInterestLevel >= 70) {
          newStage = "top3";
        } else if (week >= 7 && topInterestLevel >= 50) {
          newStage = "top5";
        } else if (week >= 4 && topInterestLevel >= 30) {
          newStage = "top8";
        }
      }
      
      // Only update if stage changed (and can only progress forward)
      const stageOrder = ["open", "top8", "top5", "top3", "verbal", "signed"];
      if (stageOrder.indexOf(newStage) > stageOrder.indexOf(currentStage)) {
        await storage.updateRecruit(recruit.id, { stage: newStage });
        
        // If verbal, check if they should auto-commit to a team
        if (newStage === "verbal") {
          const topSchool = sortedInterests[0];
          if (topSchool && topSchool.interestLevel >= 95 && topSchool.hasOffer) {
            // Auto-sign to team with highest interest that has offered
            await storage.updateRecruit(recruit.id, { 
              stage: "signed",
              signedTeamId: topSchool.teamId,
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

      // Generate new recruiting class (40-50 recruits)
      const recruitCount = 40 + Math.floor(Math.random() * 11);
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
        const homeScore = Math.floor(Math.random() * 10) + 1;
        const awayScore = Math.floor(Math.random() * 10) + 1;
        
        await storage.updateGame(game.id, {
          homeScore,
          awayScore,
          isComplete: true,
        });
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
          scoutActionsUsed,
          recruitActionsUsed,
          hasReportedScores,
        };
      });

      const allHumansReady = readyStatus
        .filter(s => s.isHumanControlled)
        .every(s => s.isReady);

      res.json({ 
        readyStatus, 
        allHumansReady,
        humanCount: readyStatus.filter(s => s.isHumanControlled).length,
        readyCount: readyStatus.filter(s => s.isHumanControlled && s.isReady).length
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

          // Calculate star rating from overall if provided
          const overallValue = parseInt(row.overall) || 500;
          let starRating = 3;
          if (overallValue >= 800) starRating = 5;
          else if (overallValue >= 600) starRating = 4;
          else if (overallValue >= 400) starRating = 3;
          else if (overallValue >= 200) starRating = 2;
          else starRating = 1;

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
        // Generate new recruiting class (40-50 recruits)
        recruitCount = 40 + Math.floor(Math.random() * 11);
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

  // League invite routes
  app.post("/api/leagues/:id/invites", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== req.session.userId) {
        return res.status(403).json({ message: "Only the commissioner can send invites" });
      }

      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      // Check if invite already exists for this email in this league
      const existingInvite = await storage.getLeagueInviteByEmail(league.id, email);
      if (existingInvite) {
        return res.status(400).json({ message: "An invite has already been sent to this email" });
      }

      // Generate unique invite code with retry for collisions
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
        email,
        inviteCode,
        invitedById: req.session.userId!,
      });

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Invite Sent",
        details: `Sent invite to ${email}`,
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
        return res.status(400).json({ message: "This invite has already been used or expired" });
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
        return res.status(400).json({ message: "This invite has already been used or expired" });
      }

      // Verify user email matches invite email
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return res.status(403).json({ 
          message: "This invite was sent to a different email address. Please log in with the email that received the invite." 
        });
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
        details: `${invite.email} joined the league and selected ${team.name}`,
      });

      res.json({ success: true, leagueId: invite.leagueId, teamId });
    } catch (error) {
      console.error("Failed to accept invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
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
      
      let topSchools = storedTopSchools
        .filter(ts => ts.isActive && teamMap.has(ts.teamId))
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

      res.json({
        recruit: {
          ...recruit,
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
        'isBlueChip', 'isGem', 'isBust',
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
        if (key in req.body) {
          sanitizedData[key] = req.body[key];
        }
      }

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
        'isBlueChip', 'isGem', 'isBust',
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
            if (key in update.changes) {
              sanitizedData[key] = update.changes[key];
            }
          }
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
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only commissioner can start dynasty" });
      }
      
      // Generate CPU coaches for teams that don't have one
      await generateCpuCoaches(leagueId);
      
      await storage.updateLeague(leagueId, { currentPhase: "preseason" });
      
      await storage.createAuditLog({
        leagueId,
        userId: userId || "system",
        action: "start_dynasty",
        details: JSON.stringify({ season: league.currentSeason }),
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

async function generateSchedule(leagueId: string) {
  const league = await storage.getLeague(leagueId);
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  
  // Map season length to number of weeks
  const seasonWeeks: Record<string, number> = {
    "short": 8,
    "medium": 14,
    "long": 32,
  };
  const numWeeks = seasonWeeks[league?.seasonLength || "medium"] || 14;
  
  // Generate games for the season
  for (let week = 1; week <= numWeeks; week++) {
    // Round robin scheduling
    const shuffled = [...leagueTeams].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      await storage.createGame({
        leagueId,
        season: 1,
        week,
        homeTeamId: shuffled[i].id,
        awayTeamId: shuffled[i + 1].id,
        phase: "regular",
      });
    }
  }
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
  };
  
  return conferenceTeams[conferenceName] || [];
}

// Recruiting class themes that influence the distribution of players
type RecruitingTheme = "high_velocity" | "sluggers" | "balanced" | "top_heavy" | "hidden_gems";

function getRandomRecruitingTheme(): RecruitingTheme {
  const themes: RecruitingTheme[] = ["high_velocity", "sluggers", "balanced", "top_heavy", "hidden_gems"];
  return themes[Math.floor(Math.random() * themes.length)];
}

async function generateRecruits(leagueId: string, count: number) {
  const firstNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron", "Dylan", "Jake", "Austin", "Kyle", "Cole", "Mason", "Logan", "Ethan", "Noah", "Caleb", "Jayden", "Bryce", "Hunter", "Chase", "Trey"];
  const lastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez", "Lewis", "Walker", "Hall", "Young", "King"];
  const fieldPositions = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  const states = ["CA", "TX", "FL", "GA", "NC", "TN", "AZ", "LA", "AL", "SC"];
  const cities = ["Los Angeles", "Houston", "Miami", "Atlanta", "Charlotte", "Nashville", "Phoenix", "New Orleans", "Birmingham", "Charleston"];
  const priorities = ["Extremely", "Very", "Somewhat", "Not Important"];

  // Select a hidden theme for this recruiting class
  const theme = getRandomRecruitingTheme();
  
  // Theme modifies pitcher/fielder balance and gem distribution
  const getPitcherRatio = (theme: RecruitingTheme): number => {
    switch (theme) {
      case "high_velocity": return 0.55; // More pitchers
      case "sluggers": return 0.35; // More hitters
      case "balanced": return 0.45;
      case "top_heavy": return 0.45;
      case "hidden_gems": return 0.45;
      default: return 0.45;
    }
  };

  const pitcherRatio = getPitcherRatio(theme);

  // Star distribution adjusted by theme
  const getStarRank = (idx: number, total: number, theme: RecruitingTheme): number => {
    const pct = idx / total;
    if (theme === "top_heavy") {
      // More high-star recruits
      if (pct < 0.08) return 5;       // 8% 5-star
      if (pct < 0.22) return 4;       // 14% 4-star  
      if (pct < 0.55) return 3;       // 33% 3-star
      if (pct < 0.80) return 2;       // 25% 2-star
      return 1;                        // 20% 1-star
    }
    // Standard distribution: 5% 5-star, 10% 4-star, 40% 3-star, 30% 2-star, 15% 1-star
    if (pct < 0.05) return 5;
    if (pct < 0.15) return 4;
    if (pct < 0.55) return 3;
    if (pct < 0.85) return 2;
    return 1;
  };

  // Blue chips: top 1-3 recruits have all ratings revealed
  const numBlueChips = Math.floor(Math.random() * 3) + 1;

  // Gem/bust system adjusted by theme
  const getGemBustModifier = (theme: RecruitingTheme): { isGem: boolean; isBust: boolean } => {
    const roll = Math.random();
    const gemChance = theme === "hidden_gems" ? 0.15 : 0.08; // Hidden gems theme has more gems
    const bustChance = theme === "hidden_gems" ? 0.05 : 0.08; // Hidden gems theme has fewer busts
    
    if (roll < gemChance) return { isGem: true, isBust: false };
    if (roll < gemChance + bustChance) return { isGem: false, isBust: true };
    return { isGem: false, isBust: false };
  };

  // New overall rating ranges per star rating (user specified)
  // Blue Chips = 600-700, 5-star = 450-625, 4-star = 350-475, 3-star = 250-375, 2-star = 150-275, 1-star = <175
  const getOverallByStarRank = (starRank: number, isBlueChip: boolean): number => {
    if (isBlueChip) {
      return 600 + Math.floor(Math.random() * 101); // 600-700
    }
    switch (starRank) {
      case 5: return 450 + Math.floor(Math.random() * 176); // 450-625
      case 4: return 350 + Math.floor(Math.random() * 126); // 350-475
      case 3: return 250 + Math.floor(Math.random() * 126); // 250-375
      case 2: return 150 + Math.floor(Math.random() * 126); // 150-275
      default: return 50 + Math.floor(Math.random() * 126);  // 50-175
    }
  };

  // Get number of abilities based on star rating
  const getAbilityCount = (starRank: number): number => {
    switch (starRank) {
      case 5: return 2 + Math.floor(Math.random() * 2); // 2-3 abilities
      case 4: return 1 + Math.floor(Math.random() * 2); // 1-2 abilities
      case 3: return Math.floor(Math.random() * 2);     // 0-1 abilities
      default: return Math.random() < 0.3 ? 1 : 0;       // 30% chance of 1 ability
    }
  };

  // Generate pitch mix for pitchers
  // FB and 2S are capped at 1 (presence indicator only), secondary pitches are rated 1-7
  const generatePitchMix = (isPitcher: boolean): { pitchFB: number; pitch2S: number; pitchSL: number; pitchCB: number; pitchCH: number; pitchCT: number; pitchSNK: number; pitchSPL: number } => {
    if (!isPitcher) {
      return { pitchFB: 0, pitch2S: 0, pitchSL: 0, pitchCB: 0, pitchCH: 0, pitchCT: 0, pitchSNK: 0, pitchSPL: 0 };
    }
    
    // Every pitcher has a fastball - capped at 1 (presence only)
    const pitchFB = 1;
    // 50% chance of 2-seam - capped at 1 (presence only)
    const pitch2S = Math.random() < 0.5 ? 1 : 0;
    
    // Secondary pitches pool
    const secondaryPitches = ['SL', 'CB', 'CH', 'CT', 'SNK', 'SPL'];
    const shuffled = secondaryPitches.sort(() => Math.random() - 0.5);
    // Pick 2-4 secondary pitches
    const numSecondary = 2 + Math.floor(Math.random() * 3);
    const selectedSecondary = new Set(shuffled.slice(0, numSecondary));
    
    return {
      pitchFB,
      pitch2S,
      pitchSL: selectedSecondary.has('SL') ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchCB: selectedSecondary.has('CB') ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchCH: selectedSecondary.has('CH') ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchCT: selectedSecondary.has('CT') ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchSNK: selectedSecondary.has('SNK') ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchSPL: selectedSecondary.has('SPL') ? 1 + Math.floor(Math.random() * 7) : 0,
    };
  };
  
  // Generate randomized scouting order for a recruit
  // Returns a shuffled array of field names that determines the order in which attributes are revealed
  const generateScoutingOrder = (isPitcher: boolean, position: string): string[] => {
    // Fielder attributes (common to all fielders)
    const fielderAttributes = ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance'];
    const fielderAbilities = ['clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery'];
    
    // Pitcher attributes
    const pitcherAttributes = ['velocity', 'control', 'stamina'];
    const pitcherAbilities = ['wRISP', 'vsLefty', 'poise', 'grit', 'heater', 'agile', 'recovery'];
    const pitchTypes = ['pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL'];
    
    // Catcher-specific ability
    const catcherAbility = position === 'C' ? ['catcherAbility'] : [];
    
    // Build the list based on player type
    let allFields: string[];
    if (isPitcher) {
      allFields = [...pitcherAttributes, ...pitchTypes, ...pitcherAbilities];
    } else {
      allFields = [...fielderAttributes, ...fielderAbilities, ...catcherAbility];
    }
    
    // Shuffle the array using Fisher-Yates algorithm
    for (let i = allFields.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allFields[i], allFields[j]] = [allFields[j], allFields[i]];
    }
    
    return allFields;
  };

  // Generate common ability value (numeric 20-95) based on overall rating
  // Higher overall = better chance of higher ability values
  // UI converts: >= 90: S, >= 80: A, >= 70: B, >= 60: C, >= 50: D, >= 30: F, < 30: G
  const generateCommonAbilityValue = (overall: number): number => {
    // Base value scales with overall rating
    // Overall 50-175 (1-star): ability values ~25-55 (G to D)
    // Overall 150-275 (2-star): ability values ~35-65 (F to C)
    // Overall 250-375 (3-star): ability values ~45-75 (D to B)
    // Overall 350-475 (4-star): ability values ~55-85 (D to A)
    // Overall 450-700 (5-star/blue chip): ability values ~65-95 (C to S)
    const normalizedOverall = Math.min(700, Math.max(50, overall));
    const baseValue = 25 + Math.floor((normalizedOverall - 50) / 13); // Scales from 25 to 75
    // Add randomness (-15 to +20)
    const variance = Math.floor(Math.random() * 36) - 15;
    return Math.max(20, Math.min(95, baseValue + variance));
  };

  // Generate all common abilities for a recruit (numeric values)
  const generateCommonAbilities = (isPitcher: boolean, position: string, overall: number): {
    clutch: number; vsLHP: number; grit: number; stealing: number; running: number; throwing: number; recovery: number; catcherAbility: number;
    wRISP: number; vsLefty: number; poise: number; heater: number; agile: number;
  } => {
    if (isPitcher) {
      return {
        // Pitcher abilities (active)
        wRISP: generateCommonAbilityValue(overall),
        vsLefty: generateCommonAbilityValue(overall),
        poise: generateCommonAbilityValue(overall),
        grit: generateCommonAbilityValue(overall),
        heater: generateCommonAbilityValue(overall),
        agile: generateCommonAbilityValue(overall),
        recovery: generateCommonAbilityValue(overall),
        // Fielder abilities (default values for pitchers)
        clutch: 50,
        vsLHP: 50,
        stealing: 50,
        running: 50,
        throwing: 50,
        catcherAbility: 50,
      };
    } else {
      return {
        // Fielder abilities (active)
        clutch: generateCommonAbilityValue(overall),
        vsLHP: generateCommonAbilityValue(overall),
        grit: generateCommonAbilityValue(overall),
        stealing: generateCommonAbilityValue(overall),
        running: generateCommonAbilityValue(overall),
        throwing: generateCommonAbilityValue(overall),
        recovery: generateCommonAbilityValue(overall),
        catcherAbility: position === 'C' ? generateCommonAbilityValue(overall) : 50,
        // Pitcher abilities (default values for fielders)
        wRISP: 50,
        vsLefty: 50,
        poise: 50,
        heater: 50,
        agile: 50,
      };
    }
  };

  // Theme-based attribute boosts
  const getThemeBoost = (theme: RecruitingTheme, isPitcher: boolean): { attr: string; boost: number } => {
    if (theme === "high_velocity" && isPitcher) {
      return { attr: "velocity", boost: 15 };
    }
    if (theme === "sluggers" && !isPitcher) {
      return { attr: "power", boost: 15 };
    }
    return { attr: "", boost: 0 };
  };

  for (let i = 0; i < count; i++) {
    // Determine position based on pitcher ratio
    const isPitcher = Math.random() < pitcherRatio;
    const position = isPitcher ? "P" : fieldPositions[Math.floor(Math.random() * fieldPositions.length)];
    
    const starRank = getStarRank(i, count, theme);
    const stateIdx = Math.floor(Math.random() * states.length);
    const isBlueChip = i < numBlueChips;
    
    // Get gem/bust modifier, but Blue Chips can NEVER be busts
    let { isGem, isBust } = getGemBustModifier(theme);
    if (isBlueChip && isBust) {
      isBust = false; // Blue Chips can never be busts
    }

    // Overall rating correlates with star rank
    const overall = getOverallByStarRank(starRank, isBlueChip);
    
    // Star rating displayed on the card
    const starRating = starRank;
    
    // Generate abilities based on position and star rating
    const abilityCount = getAbilityCount(starRank);
    const abilities = getRandomAbilities(position, abilityCount, starRank >= 4);

    // Random appearance for recruits
    const appearance = getRandomAppearance();

    // Determine recruit type and year
    const recruitType = Math.random() < 0.8 ? "HS" : "JUCO";
    let recruitYear = "FR";
    if (recruitType === "JUCO") {
      const rand = Math.random();
      if (rand < 0.4) recruitYear = "FR";
      else if (rand < 0.8) recruitYear = "SO";
      else recruitYear = "JR";
    }

    // Apply theme boosts
    const themeBoost = getThemeBoost(theme, isPitcher);
    let velocity = 40 + Math.floor(Math.random() * 40);
    let power = 40 + Math.floor(Math.random() * 40);
    
    if (themeBoost.attr === "velocity") velocity = Math.min(99, velocity + themeBoost.boost);
    if (themeBoost.attr === "power") power = Math.min(99, power + themeBoost.boost);

    // Generate pitch mix for pitchers
    const pitchMix = generatePitchMix(isPitcher);
    
    // Generate common abilities based on overall rating
    const commonAbilities = generateCommonAbilities(isPitcher, position, overall);
    
    // Generate randomized scouting order for this recruit
    const scoutingOrder = generateScoutingOrder(isPitcher, position);

    await storage.createRecruit({
      leagueId,
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      position,
      homeState: states[stateIdx],
      hometown: cities[stateIdx],
      starRank,
      classRank: i + 1,
      positionRank: Math.floor(i / 9) + 1, // 9 positions
      recruitType,
      recruitYear,
      overall,
      starRating,
      hitForAvg: 40 + Math.floor(Math.random() * 40),
      power,
      speed: 40 + Math.floor(Math.random() * 40),
      arm: 40 + Math.floor(Math.random() * 40),
      fielding: 40 + Math.floor(Math.random() * 40),
      errorResistance: 40 + Math.floor(Math.random() * 40),
      velocity,
      control: 40 + Math.floor(Math.random() * 40),
      stamina: 40 + Math.floor(Math.random() * 40),
      stuff: 40 + Math.floor(Math.random() * 40),
      // Pitch mix
      ...pitchMix,
      // Common abilities
      ...commonAbilities,
      // Special abilities
      abilities,
      // Randomized scouting reveal order
      scoutingOrder,
      proximityPriority: priorities[Math.floor(Math.random() * priorities.length)],
      reputationPriority: priorities[Math.floor(Math.random() * priorities.length)],
      playingTimePriority: priorities[Math.floor(Math.random() * priorities.length)],
      academicsPriority: priorities[Math.floor(Math.random() * priorities.length)],
      prestigePriority: priorities[Math.floor(Math.random() * priorities.length)],
      facilitiesPriority: priorities[Math.floor(Math.random() * priorities.length)],
      commitmentThreshold: 300 + Math.floor(Math.random() * 400),
      isBlueChip,
      isGem,
      isBust,
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
      headwear: appearance.headwear,
    });
  }
  
  // After all recruits are created, generate top schools for each
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
    
    // Prestige
    const prestigeWeight = priorityWeight(recruit.prestigePriority);
    score += (team.prestige || 5) * 3 * prestigeWeight;
    
    // Facilities
    const facilitiesWeight = priorityWeight(recruit.facilitiesPriority);
    score += (team.facilities || 5) * 3 * facilitiesWeight;
    
    // Reputation
    const reputationWeight = priorityWeight(recruit.reputationPriority);
    score += ((team.prestige || 5) + (team.facilities || 5)) * 1.5 * reputationWeight;
    
    // Playing time
    const playingTimeWeight = priorityWeight(recruit.playingTimePriority);
    score += (10 - (team.prestige || 5)) * 2 * playingTimeWeight;
    
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

async function generatePlayersForTeam(teamId: string) {
  const firstNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron", "Dylan", "Jake", "Austin", "Kyle", "Cole", "Mason", "Logan", "Ethan", "Noah", "Caleb"];
  const lastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez"];
  const fieldPositions = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  const states = ["CA", "TX", "FL", "GA", "NC", "TN", "AZ", "LA", "AL", "SC"];
  const cities = ["Los Angeles", "Houston", "Miami", "Atlanta", "Charlotte", "Nashville", "Phoenix", "New Orleans", "Birmingham", "Charleston"];

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

  // New overall rating ranges matching recruit generation
  const getOverallByStarRank = (starRank: number): number => {
    switch (starRank) {
      case 5: return 450 + Math.floor(Math.random() * 176); // 450-625
      case 4: return 350 + Math.floor(Math.random() * 126); // 350-475
      case 3: return 250 + Math.floor(Math.random() * 126); // 250-375
      case 2: return 150 + Math.floor(Math.random() * 126); // 150-275
      default: return 50 + Math.floor(Math.random() * 126);  // 50-175
    }
  };

  // Star rating distribution for roster players (weighted towards 2-4 stars)
  const getStarRating = (): number => {
    const roll = Math.random();
    if (roll < 0.05) return 5;       // 5% 5-star
    if (roll < 0.25) return 4;       // 20% 4-star
    if (roll < 0.65) return 3;       // 40% 3-star
    if (roll < 0.90) return 2;       // 25% 2-star
    return 1;                         // 10% 1-star
  };

  for (let i = 0; i < 25; i++) {
    const position = shuffledPositions[i];
    const eligibility = shuffledEligibilities[i];
    const stateIdx = Math.floor(Math.random() * states.length);

    // Generate star rating and overall
    const starRating = getStarRating();
    const overall = getOverallByStarRank(starRating);

    // Generate abilities based on position and star rating
    const abilityCount = starRating >= 4 ? Math.floor(Math.random() * 2) + 1 : 
                         starRating === 3 ? Math.floor(Math.random() * 2) :
                         Math.random() < 0.3 ? 1 : 0;
    const abilities = getRandomAbilities(position, abilityCount, starRating >= 4);

    // Random appearance
    const appearance = getRandomAppearance();

    // Generate common abilities (letter grades mapped from 30-90 range)
    const genCommonAbility = () => 30 + Math.floor(Math.random() * 61);

    await storage.createPlayer({
      teamId,
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      position,
      eligibility,
      homeState: states[stateIdx],
      hometown: cities[stateIdx],
      jerseyNumber: i + 1,
      overall,
      starRating,
      hitForAvg: 40 + Math.floor(Math.random() * 40),
      power: 40 + Math.floor(Math.random() * 40),
      speed: 40 + Math.floor(Math.random() * 40),
      arm: 40 + Math.floor(Math.random() * 40),
      fielding: 40 + Math.floor(Math.random() * 40),
      errorResistance: 40 + Math.floor(Math.random() * 40),
      velocity: 40 + Math.floor(Math.random() * 40),
      control: 40 + Math.floor(Math.random() * 40),
      stamina: 40 + Math.floor(Math.random() * 40),
      stuff: 40 + Math.floor(Math.random() * 40),
      clutch: genCommonAbility(),
      vsLHP: genCommonAbility(),
      grit: genCommonAbility(),
      stealing: genCommonAbility(),
      running: genCommonAbility(),
      throwing: genCommonAbility(),
      recovery: genCommonAbility(),
      catcherAbility: position === "C" ? genCommonAbility() : null,
      wRISP: genCommonAbility(),
      vsLefty: genCommonAbility(),
      poise: genCommonAbility(),
      heater: genCommonAbility(),
      agile: genCommonAbility(),
      abilities,
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
      headwear: appearance.headwear,
      // Generate pitch mix for pitchers
      pitchFB: position === "P" ? 1 : 0,  // FB capped at 1 (presence indicator)
      pitch2S: position === "P" && Math.random() < 0.5 ? 1 : 0,  // 2S capped at 1
      pitchSL: position === "P" && Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchCB: position === "P" && Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 7) : 0,
      pitchCH: position === "P" && Math.random() < 0.5 ? 1 + Math.floor(Math.random() * 7) : 0,
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
  const archetypes = ["Balanced", "Pure CEO", "Player's Coach", "Tactician", "Old School"];

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
