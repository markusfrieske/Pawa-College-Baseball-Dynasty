import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import bcrypt from "bcrypt";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getRandomAbilities } from "@shared/abilities";

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
  cpuDifficulty: z.enum(["easy", "normal", "hard", "elite"]).optional(),
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
  auditLogPublic: z.boolean(),
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

      const { name, maxTeams = 8, cpuDifficulty = "normal", conferenceCount = 2, selectedConferences, seasonLength = "medium" } = result.data;

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

      // Create teams - use conference-based team generation
      const conferences = await storage.getConferencesByLeague(league.id);
      const teamsPerConference = Math.floor(maxTeams / conferences.length);

      for (const conf of conferences) {
        const conferenceTeamPool = getTeamsForConference(conf.name);
        const teamsToCreate = conferenceTeamPool.slice(0, teamsPerConference);
        
        for (const teamData of teamsToCreate) {
          const team = await storage.createTeam({
            ...teamData,
            leagueId: league.id,
            conferenceId: conf.id,
            isCpu: true,
          });
          
          // Create standings for this team
          await storage.createStandings({
            leagueId: league.id,
            teamId: team.id,
            season: 1,
          });
        }
      }

      // Create recruits
      await generateRecruits(league.id, 50);

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

  app.get("/api/leagues/:id/setup", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
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

      // Generate players for the team
      await generatePlayersForTeam(teamId);

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

      const recruitsWithInterest = leagueRecruits.map((recruit) => {
        const interest = interests.find((i) => i.recruitId === recruit.id);
        return {
          ...recruit,
          interest,
        };
      });

      const positionCounts: Record<string, number> = {};
      roster.forEach((player) => {
        positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;
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
      const seniorsCount = roster.filter(p => p.year === 'SR').length;
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

      res.json(interest);
    } catch (error) {
      console.error("Failed to scout recruit:", error);
      res.status(500).json({ message: "Failed to scout recruit" });
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

  // Roster routes
  app.get("/api/leagues/:id/roster", requireAuth, async (req, res) => {
    try {
      const leagueTeams = await storage.getTeamsByLeague(req.params.id);
      const userTeam = leagueTeams.find((t) => !t.isCpu);
      
      if (!userTeam) {
        return res.status(400).json({ message: "No team assigned" });
      }

      const teamPlayers = await storage.getPlayersByTeam(userTeam.id);

      res.json({
        players: teamPlayers,
        team: userTeam,
      });
    } catch (error) {
      console.error("Failed to fetch roster:", error);
      res.status(500).json({ message: "Failed to fetch roster" });
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
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const updatedLeague = await storage.updateLeague(league.id, {
        currentWeek: league.currentWeek + 1,
      });

      await storage.createAuditLog({
        leagueId: league.id,
        userId: req.session.userId,
        action: "Week Advanced",
        details: `Advanced to Week ${league.currentWeek + 1}`,
      });

      res.json(updatedLeague);
    } catch (error) {
      console.error("Failed to advance week:", error);
      res.status(500).json({ message: "Failed to advance week" });
    }
  });

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
      
      const { auditLogPublic } = result.data;
      const league = await storage.updateLeague(req.params.id, { auditLogPublic });
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

      res.json({
        recruit: {
          ...recruit,
          interest,
        },
      });
    } catch (error) {
      console.error("Failed to fetch recruit:", error);
      res.status(500).json({ message: "Failed to fetch recruit" });
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
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  
  // Generate 16 weeks of games
  for (let week = 1; week <= 16; week++) {
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

async function generateRecruits(leagueId: string, count: number) {
  const firstNames = ["Marcus", "Tyler", "Jordan", "Chris", "Devon", "Aaron", "Ryan", "Justin", "Brandon", "Cameron", "Dylan", "Jake", "Austin", "Kyle", "Cole", "Mason", "Logan", "Ethan", "Noah", "Caleb", "Jayden", "Bryce", "Hunter", "Chase", "Trey"];
  const lastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez", "Lewis", "Walker", "Hall", "Young", "King"];
  const positions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  const states = ["CA", "TX", "FL", "GA", "NC", "TN", "AZ", "LA", "AL", "SC"];
  const cities = ["Los Angeles", "Houston", "Miami", "Atlanta", "Charlotte", "Nashville", "Phoenix", "New Orleans", "Birmingham", "Charleston"];
  const priorities = ["Extremely", "Very", "Somewhat", "Not Important"];

  // Star distribution: 5% 5-star, 10% 4-star, 40% 3-star, 30% 2-star, 15% 1-star
  const getStarRank = (idx: number, total: number): number => {
    const pct = idx / total;
    if (pct < 0.05) return 5;       // Top 5% = 5 stars
    if (pct < 0.15) return 4;       // Next 10% = 4 stars  
    if (pct < 0.55) return 3;       // Next 40% = 3 stars
    if (pct < 0.85) return 2;       // Next 30% = 2 stars
    return 1;                        // Bottom 15% = 1 star
  };

  // Blue chips: top 1-3 recruits have all ratings revealed
  const numBlueChips = Math.floor(Math.random() * 3) + 1; // 1-3 blue chips

  // Gem/bust system: some players are rated higher/lower than their true ability
  const getGemBustModifier = (): { rankMod: number; isGem: boolean; isBust: boolean } => {
    const roll = Math.random();
    if (roll < 0.08) return { rankMod: -15, isGem: true, isBust: false };  // 8% gems (ranked lower than ability)
    if (roll < 0.16) return { rankMod: 15, isGem: false, isBust: true };   // 8% busts (ranked higher than ability)
    return { rankMod: 0, isGem: false, isBust: false };
  };

  // Generate overall rating 1-999 based on star rank
  const getOverallByStarRank = (starRank: number): number => {
    // 5-star: 800-999, 4-star: 650-849, 3-star: 450-699, 2-star: 250-499, 1-star: 1-299
    switch (starRank) {
      case 5: return 800 + Math.floor(Math.random() * 200);  // 800-999
      case 4: return 650 + Math.floor(Math.random() * 200);  // 650-849
      case 3: return 450 + Math.floor(Math.random() * 250);  // 450-699
      case 2: return 250 + Math.floor(Math.random() * 250);  // 250-499
      default: return 100 + Math.floor(Math.random() * 200); // 100-299
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

  for (let i = 0; i < count; i++) {
    const position = positions[Math.floor(Math.random() * positions.length)];
    const { isGem, isBust } = getGemBustModifier();
    const starRank = getStarRank(i, count);
    const stateIdx = Math.floor(Math.random() * states.length);
    const isBlueChip = i < numBlueChips;

    // Overall rating 1-999 correlates with star rank
    const overall = getOverallByStarRank(starRank);
    
    // Star rating is the actual star value (1-5) - same as starRank for display but stored separately
    const starRating = starRank;
    
    // Generate abilities based on position and star rating
    const abilityCount = getAbilityCount(starRank);
    const abilities = getRandomAbilities(position, abilityCount, starRank >= 4);

    // Random appearance for recruits
    const appearance = getRandomAppearance();

    await storage.createRecruit({
      leagueId,
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      position,
      homeState: states[stateIdx],
      hometown: cities[stateIdx],
      starRank,
      classRank: i + 1,
      positionRank: Math.floor(i / positions.length) + 1,
      recruitType: Math.random() < 0.8 ? "HS" : "JUCO",
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
      abilities,
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
  const positions = ["P", "P", "P", "P", "P", "C", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "LF", "RF"];
  const eligibilities = ["FR", "FR", "SO", "SO", "JR", "JR", "JR", "SR", "SR"];
  const states = ["CA", "TX", "FL", "GA", "NC"];
  const cities = ["Los Angeles", "Houston", "Miami", "Atlanta", "Charlotte"];

  for (let i = 0; i < 25; i++) {
    const position = positions[i % positions.length];
    const eligibility = eligibilities[Math.floor(Math.random() * eligibilities.length)];
    const stateIdx = Math.floor(Math.random() * states.length);

    // Generate 1-999 overall rating and 1-5 star rating for players
    const starRating = Math.floor(Math.random() * 3) + 2; // 2-4 stars for roster players
    const overall = starRating === 4 ? 650 + Math.floor(Math.random() * 200) :
                    starRating === 3 ? 450 + Math.floor(Math.random() * 250) :
                    250 + Math.floor(Math.random() * 250);

    // Generate abilities based on position
    const abilityCount = Math.random() < 0.4 ? Math.floor(Math.random() * 2) : 0;
    const abilities = getRandomAbilities(position, abilityCount);

    // Random appearance
    const appearance = getRandomAppearance();

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
      abilities,
      skinTone: appearance.skinTone,
      hairColor: appearance.hairColor,
      hairStyle: appearance.hairStyle,
      headwear: appearance.headwear,
    });
  }
}
