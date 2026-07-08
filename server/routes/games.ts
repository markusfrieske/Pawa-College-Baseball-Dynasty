/**
 * Game schedule and game-report routes.
 *
 * Covers:
 *  - GET /schedule                   — full league schedule with report metadata
 *  - GET /games/:gameId              — single game + teams
 *  - GET /games/:gameId/matchup-preview  — head-to-head preview card
 *  - PATCH /games/:gameId            — commissioner quick-score
 *  - GET /game-reports               — all reports (commissioner)
 *  - GET /game-reports/pending       — pending/disputed reports (commissioner)
 *  - GET /games/:gameId/report       — single report (involved coaches or commissioner)
 *  - POST /games/:gameId/report      — submit a new report
 *  - PATCH /games/:gameId/report     — commissioner edits a pending report
 *  - POST /games/:gameId/report/confirm   — opposing coach or commissioner confirms
 *  - POST /games/:gameId/report/dispute   — opposing coach or commissioner disputes
 *  - POST /games/:gameId/report/finalize  — commissioner force-finalizes
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess, gameScoreSchema } from "../route-helpers";
import { cacheGet, cacheSet, leagueCacheKey, invalidateLeague } from "../cache";
import {
  computeLegacyScore,
  updateStandingsForGame,
  finalizeReportedGame,
} from "../game-engine";
import { SCREENSHOT_CATEGORIES, type ScreenshotCategory } from "@shared/schema";
import { extractBoxScoreFromScreenshot } from "../ocrGameReport";
import { ObjectStorageService, ObjectNotFoundError } from "../replit_integrations/object_storage/objectStorage";

const objectStorageService = new ObjectStorageService();

export function registerGameRoutes(app: Express): void {
  // ── Schedule ──────────────────────────────────────────────────────────────
  app.get("/api/leagues/:id/schedule", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const scheduleCacheKey = leagueCacheKey(leagueId, "schedule");

      type ScheduleShared = {
        games: unknown[];
        currentWeek: number;
        currentSeason: number;
        currentPhase: string;
        humanTeamIds: string[];
        humanCoachNames: Record<string, string>;
        reportsByGameId: Record<string, unknown>;
        coachTeamMap: Record<string, string>;
        commissionerUserIds: string[];
      };

      let shared = cacheGet<ScheduleShared>(scheduleCacheKey);

      if (!shared) {
        const league = await storage.getLeague(leagueId);
        if (!league) return res.status(404).json({ message: "League not found" });

        const [leagueGames, leagueTeams, coaches, gameReportsList] = await Promise.all([
          storage.getGamesByLeague(league.id),
          storage.getTeamsByLeague(league.id),
          storage.getCoachesByLeague(league.id),
          storage.getGameReportsByLeague(league.id),
        ]);

        const gamesWithTeams = leagueGames
          .map(game => ({
            ...game,
            homeTeam: leagueTeams.find(t => t.id === game.homeTeamId),
            awayTeam: leagueTeams.find(t => t.id === game.awayTeamId),
          }))
          .filter(g => g.homeTeam != null && g.awayTeam != null);

        const humanTeamIds = leagueTeams.filter(t => !t.isCpu).map(t => t.id);
        const humanCoachNames: Record<string, string> = {};
        const coachTeamMap: Record<string, string> = {};
        for (const c of coaches) {
          if (c.teamId) {
            coachTeamMap[c.userId ?? ""] = c.teamId;
            if (humanTeamIds.includes(c.teamId)) {
              humanCoachNames[c.teamId] = `${c.firstName} ${c.lastName}`;
            }
          }
        }

        const reportsByGameId = Object.fromEntries(
          gameReportsList.map(r => [
            r.gameId,
            {
              id: r.id,
              gameId: r.gameId,
              status: r.status,
              reporterUserId: r.reporterUserId,
              reporterTeamId: r.reporterTeamId,
              homeScore: r.homeScore,
              awayScore: r.awayScore,
              disputeReason: r.disputeReason,
              createdAt: r.createdAt,
            },
          ])
        );

        const commissionerUserIds: string[] = [];
        if (league.commissionerId) commissionerUserIds.push(league.commissionerId);
        const coIds = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
        for (const coId of coIds) {
          if (coId && !commissionerUserIds.includes(coId)) commissionerUserIds.push(coId);
        }

        shared = {
          games: gamesWithTeams,
          currentWeek: league.currentWeek,
          currentSeason: league.currentSeason,
          currentPhase: league.currentPhase,
          humanTeamIds,
          humanCoachNames,
          reportsByGameId,
          coachTeamMap,
          commissionerUserIds,
        };
        cacheSet(scheduleCacheKey, shared, 30_000);
      }

      const userId = req.session.userId ?? "";
      const userTeamId = shared.coachTeamMap[userId] || null;
      const isCommissioner = shared.commissionerUserIds.includes(userId);

      res.set("Cache-Control", "private, max-age=30, must-revalidate");
      res.json({
        games: shared.games,
        currentWeek: shared.currentWeek,
        currentSeason: shared.currentSeason,
        currentPhase: shared.currentPhase,
        userTeamId,
        humanTeamIds: shared.humanTeamIds,
        humanCoachNames: shared.humanCoachNames,
        reportsByGameId: shared.reportsByGameId,
        isCommissioner,
      });
    } catch (error) {
      console.error("Failed to fetch schedule:", error);
      res.status(500).json({ message: "Failed to fetch schedule" });
    }
  });

  // ── Single game ───────────────────────────────────────────────────────────
  app.get("/api/leagues/:id/games/:gameId", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      const allLeagueGames = await storage.getGamesByLeague(league.id);
      const game = allLeagueGames.find(g => g.id === req.params.gameId as string);
      if (!game) return res.status(404).json({ message: "Game not found" });
      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const homeTeam = leagueTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = leagueTeams.find(t => t.id === game.awayTeamId);
      if (!homeTeam || !awayTeam) return res.status(404).json({ message: "Teams not found" });
      res.json({ game: { ...game, homeTeam, awayTeam }, homeTeam, awayTeam });
    } catch (error) {
      console.error("Error fetching game:", error);
      res.status(500).json({ message: "Failed to fetch game" });
    }
  });

  // ── Matchup preview ───────────────────────────────────────────────────────
  app.get("/api/leagues/:id/games/:gameId/matchup-preview", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const allLeagueGames = await storage.getGamesByLeague(league.id);
      const game = allLeagueGames.find(g => g.id === req.params.gameId as string);
      if (!game) return res.status(404).json({ message: "Game not found" });

      const leagueTeams = await storage.getTeamsByLeague(league.id);
      const homeTeam = leagueTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = leagueTeams.find(t => t.id === game.awayTeamId);
      if (!homeTeam || !awayTeam) return res.status(404).json({ message: "Teams not found" });

      const [coaches, allStandings, homePlayers, awayPlayers] = await Promise.all([
        storage.getCoachesByLeague(league.id),
        storage.getStandingsByLeague(league.id, league.currentSeason),
        storage.getPlayersByTeam(homeTeam.id),
        storage.getPlayersByTeam(awayTeam.id),
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

      const computeComposite = (playerList: typeof homePlayers) =>
        playerList.length === 0 ? 0 : Math.round(playerList.reduce((s, p) => s + (p.overall || 0), 0) / playerList.length);

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

      res.json({
        homeTeam: {
          id: homeTeam.id, name: homeTeam.name, abbreviation: homeTeam.abbreviation,
          primaryColor: homeTeam.primaryColor, secondaryColor: homeTeam.secondaryColor,
          mascot: homeTeam.mascot, prestige: homeTeam.prestige, isCpu: homeTeam.isCpu,
          coachName: homeCoach ? `${homeCoach.firstName} ${homeCoach.lastName}` : "CPU Coach",
          coachArchetype: homeCoach?.archetype ?? null,
          record: { wins: homeStandings?.wins ?? 0, losses: homeStandings?.losses ?? 0 },
          powerRank: homeTeam.nationalRank || 0, composite: computeComposite(homePlayers), top3: top3(homePlayers),
        },
        awayTeam: {
          id: awayTeam.id, name: awayTeam.name, abbreviation: awayTeam.abbreviation,
          primaryColor: awayTeam.primaryColor, secondaryColor: awayTeam.secondaryColor,
          mascot: awayTeam.mascot, prestige: awayTeam.prestige, isCpu: awayTeam.isCpu,
          coachName: awayCoach ? `${awayCoach.firstName} ${awayCoach.lastName}` : "CPU Coach",
          coachArchetype: awayCoach?.archetype ?? null,
          record: { wins: awayStandings?.wins ?? 0, losses: awayStandings?.losses ?? 0 },
          powerRank: awayTeam.nationalRank || 0, composite: computeComposite(awayPlayers), top3: top3(awayPlayers),
        },
        h2h: { homeWins: homeH2HWins, awayWins: h2hGames.length - homeH2HWins, totalGames: h2hGames.length },
        game: { id: game.id, isComplete: game.isComplete, isConference: game.isConference, gameType: game.gameType, week: game.week, season: game.season },
      });
    } catch (error) {
      console.error("Failed to fetch matchup preview:", error);
      res.status(500).json({ message: "Failed to fetch matchup preview" });
    }
  });

  // ── Quick-score (commissioner only) ──────────────────────────────────────
  app.patch("/api/leagues/:id/games/:gameId", requireAuth, async (req, res) => {
    try {
      const scoreResult = gameScoreSchema.safeParse(req.body);
      if (!scoreResult.success) {
        return res.status(400).json({ message: "Invalid score data — scores must be non-negative integers" });
      }
      const { homeScore, awayScore } = scoreResult.data;

      const patchLeagueId = req.params.id as string;
      const patchGameId = req.params.gameId as string;
      const patchLeague = await storage.getLeague(patchLeagueId);
      if (!patchLeague) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(patchLeague, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can submit quick scores. Coaches must use the Report Game flow." });
      }

      const existingReport = await storage.getGameReport(patchGameId);
      if (existingReport && (existingReport.status === "pending" || existingReport.status === "disputed")) {
        return res.status(409).json({
          message: `Cannot quick-score: a ${existingReport.status} game report exists. Use Force Finalize on the commissioner page to resolve it.`,
        });
      }

      const patchGame = await storage.getGame(patchGameId);
      if (!patchGame) return res.status(404).json({ message: "Game not found" });

      const game = await storage.updateGame(patchGameId, { homeScore, awayScore, isComplete: true });
      if (!game) return res.status(404).json({ message: "Game not found" });

      await updateStandingsForGame(patchLeagueId, game.season, game.homeTeamId, game.awayTeamId, homeScore, awayScore, game.isConference);

      const leagueTeams = await storage.getTeamsByLeague(patchLeagueId);
      const homeTeam = leagueTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = leagueTeams.find(t => t.id === game.awayTeamId);
      const homeWon = homeScore > awayScore;

      const WIN_XP = 100, LOSS_XP = 25;

      if (homeTeam?.coachId) {
        const homeCoach = await storage.getCoach(homeTeam.coachId);
        if (homeCoach) {
          const newXp = homeCoach.xp + (homeWon ? WIN_XP : LOSS_XP);
          const newLevel = Math.floor(newXp / 1000) + 1;
          const hcWins = homeCoach.careerWins + (homeWon ? 1 : 0);
          const hcLosses = homeCoach.careerLosses + (homeWon ? 0 : 1);
          await storage.updateCoach(homeCoach.id, {
            xp: newXp, level: newLevel,
            skillPoints: homeCoach.skillPoints + (newLevel > homeCoach.level ? 1 : 0),
            careerWins: hcWins, careerLosses: hcLosses,
            confWins: homeCoach.confWins + (game.isConference && homeWon ? 1 : 0),
            confLosses: homeCoach.confLosses + (game.isConference && !homeWon ? 1 : 0),
            legacyScore: computeLegacyScore({ ...homeCoach, careerWins: hcWins }),
          });
        }
      }

      if (awayTeam?.coachId) {
        const awayCoach = await storage.getCoach(awayTeam.coachId);
        if (awayCoach) {
          const newXp = awayCoach.xp + (homeWon ? LOSS_XP : WIN_XP);
          const newLevel = Math.floor(newXp / 1000) + 1;
          const acWins = awayCoach.careerWins + (homeWon ? 0 : 1);
          const acLosses = awayCoach.careerLosses + (homeWon ? 1 : 0);
          await storage.updateCoach(awayCoach.id, {
            xp: newXp, level: newLevel,
            skillPoints: awayCoach.skillPoints + (newLevel > awayCoach.level ? 1 : 0),
            careerWins: acWins, careerLosses: acLosses,
            confWins: awayCoach.confWins + (game.isConference && !homeWon ? 1 : 0),
            confLosses: awayCoach.confLosses + (game.isConference && homeWon ? 1 : 0),
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

      invalidateLeague(patchLeagueId);
      res.json(game);
    } catch (error) {
      console.error("Failed to update game:", error);
      res.status(500).json({ message: "Failed to update game" });
    }
  });

  // ── All game reports (commissioner) ─────────────────────────────────────
  app.get("/api/leagues/:id/game-reports", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can view all game reports" });
      }
      const reports = await storage.getGameReportsByLeague(req.params.id as string);
      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch game reports:", error);
      res.status(500).json({ message: "Failed to fetch game reports" });
    }
  });

  // ── Pending/disputed game reports (commissioner) ─────────────────────────
  app.get("/api/leagues/:id/game-reports/pending", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!hasCommissionerAccess(league, req.session.userId)) {
        return res.status(403).json({ message: "Only the commissioner can view pending game reports" });
      }
      const allReports = await storage.getGameReportsByLeague(req.params.id as string);
      res.json(allReports.filter(r => r.status === "pending" || r.status === "disputed"));
    } catch (error) {
      console.error("Failed to fetch pending game reports:", error);
      res.status(500).json({ message: "Failed to fetch pending game reports" });
    }
  });

  // ── Fetch single report (involved coaches or commissioner) ───────────────
  // NOTE: This is the ONLY handler for GET /api/leagues/:id/games/:gameId/report.
  // The duplicate commissioner-only GET that previously existed at a later line
  // was removed — it was dead code (Express stops at the first match).
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

      const isCommissioner = hasCommissionerAccess(fetchLeague, req.session.userId);
      if (!isCommissioner) {
        const fetchCoaches = await storage.getCoachesByLeague(fetchLeagueId);
        const fetchCoach = fetchCoaches.find(c => c.userId === req.session.userId);
        const isInvolved =
          fetchCoach?.teamId &&
          (fetchCoach.teamId === fetchGame.homeTeamId || fetchCoach.teamId === fetchGame.awayTeamId);
        if (!isInvolved) {
          return res.status(403).json({ message: "Only involved coaches or the commissioner can view this game report" });
        }
      }

      const report = await storage.getGameReport(fetchGameId);
      res.json(report || null);
    } catch (error) {
      console.error("Failed to fetch game report:", error);
      res.status(500).json({ message: "Failed to fetch game report" });
    }
  });

  // ── Submit a new report ──────────────────────────────────────────────────
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
      if (existing) {
        const statusMsg =
          existing.status === "confirmed"
            ? "This game has already been confirmed and finalized."
            : "An active report already exists for this game. Wait for it to be resolved before submitting a new one.";
        return res.status(400).json({ message: statusMsg });
      }

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

      const hasFullBoxScore =
        Array.isArray(inningScores) && inningScores.length > 0 &&
        homeBoxData?.batting?.length && homeBoxData?.pitching?.length &&
        awayBoxData?.batting?.length && awayBoxData?.pitching?.length;

      if (homeScore < 0 || awayScore < 0) {
        return res.status(400).json({ message: "Scores cannot be negative" });
      }

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
        for (const pArr of [homeBoxData?.pitching, awayBoxData?.pitching]) {
          if (!Array.isArray(pArr)) continue;
          for (const p of pArr as Array<{ ip?: string; name?: string }>) {
            if (p.ip && !ipRe.test(p.ip)) {
              return res.status(400).json({ message: `Invalid IP format "${p.ip}" for ${p.name ?? "pitcher"}. Use format like "6.0" or "2.1"` });
            }
          }
        }
      }

      const allTeams = await storage.getTeamsByLeague(leagueId);
      const homeTeam = allTeams.find(t => t.id === game.homeTeamId);
      const awayTeam = allTeams.find(t => t.id === game.awayTeamId);
      const isCpuGame = !!(homeTeam?.isCpu || awayTeam?.isCpu);

      const report = await storage.createGameReport({
        gameId: game.id,
        leagueId,
        reporterUserId: req.session.userId!,
        reporterTeamId:
          coach?.teamId && (coach.teamId === game.homeTeamId || coach.teamId === game.awayTeamId)
            ? coach.teamId
            : null,
        homeScore, awayScore,
        homeHits: homeHits ?? 0, awayHits: awayHits ?? 0,
        homeErrors: homeErrors ?? 0, awayErrors: awayErrors ?? 0,
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

  // ── Commissioner edits an existing pending report ────────────────────────
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
      for (const p of [...homeBoxData.pitching, ...awayBoxData.pitching] as Array<{ ip?: string; name?: string }>) {
        if (p.ip && !ipRe.test(p.ip)) {
          return res.status(400).json({ message: `Invalid IP format "${p.ip}" for ${p.name ?? "pitcher"}. Use format like "6.0" or "2.1"` });
        }
      }
      const updated = await storage.updateGameReport(existing.id, {
        homeScore, awayScore,
        homeHits: homeHits ?? 0, awayHits: awayHits ?? 0,
        homeErrors: homeErrors ?? 0, awayErrors: awayErrors ?? 0,
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

  // ── Confirm a pending report ─────────────────────────────────────────────
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
      const userTeamId = coach?.teamId ?? null;
      const reporterCoach = coaches.find(c => c.userId === report.reporterUserId);
      const rawReporterTeamId = reporterCoach?.teamId ?? report.reporterTeamId;
      const reporterTeamId =
        rawReporterTeamId === game.homeTeamId || rawReporterTeamId === game.awayTeamId
          ? rawReporterTeamId : null;
      const isInvolvedCoach = userTeamId != null && (userTeamId === game.homeTeamId || userTeamId === game.awayTeamId);
      const opposingTeamId = reporterTeamId != null
        ? (reporterTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
        : null;
      const isOpposingCoach =
        reporterTeamId == null ? isInvolvedCoach : (userTeamId != null && userTeamId === opposingTeamId);

      if (!isCommissioner && !isOpposingCoach) {
        return res.status(403).json({ message: "Only the opposing team's coach or the commissioner can confirm this report" });
      }

      const leagueTeamsForNotify = await storage.getTeamsByLeague(leagueId);
      const homeTeamForNotify = leagueTeamsForNotify.find(t => t.id === game.homeTeamId);
      const awayTeamForNotify = leagueTeamsForNotify.find(t => t.id === game.awayTeamId);
      const confirmerLabel = isCommissioner ? "Commissioner" : "Opposing coach";

      if (game.isComplete) {
        await storage.updateGameReport(report.id, { status: "confirmed", confirmedByUserId: req.session.userId });
        await storage.createAuditLog({
          leagueId,
          userId: req.session.userId,
          action: "Game Report Confirmed",
          details: `${confirmerLabel} confirmed already-finalized report: ${report.awayScore}-${report.homeScore}`,
        });
        return res.json({ message: "Report confirmed (game was already finalized)" });
      }

      await finalizeReportedGame(report, game, leagueId);
      await storage.updateGameReport(report.id, { status: "confirmed", confirmedByUserId: req.session.userId });

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Game Report Confirmed",
        details: `${confirmerLabel} confirmed reported score: ${report.awayScore}-${report.homeScore}`,
      });

      await storage.createLeagueEvent({
        leagueId,
        teamId: reporterTeamId ?? null,
        teamName: null,
        teamAbbreviation: null,
        teamPrimaryColor: null,
        eventType: "GAME_REPORT",
        description: `${awayTeamForNotify?.name || "Away"} @ ${homeTeamForNotify?.name || "Home"}: reported score confirmed (${report.awayScore}-${report.homeScore}) and finalized.`,
        season: game.season,
        week: game.week,
      });

      invalidateLeague(leagueId);
      res.json({ message: "Report confirmed and game finalized" });
    } catch (error) {
      console.error("Failed to confirm game report:", error);
      res.status(500).json({ message: "Failed to confirm game report" });
    }
  });

  // ── Dispute a pending report ─────────────────────────────────────────────
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
      const reporterTeamId =
        rawReporterTeamId === game.homeTeamId || rawReporterTeamId === game.awayTeamId
          ? rawReporterTeamId : null;
      const isInvolvedCoach = userTeamId != null && (userTeamId === game.homeTeamId || userTeamId === game.awayTeamId);
      const opposingTeamId = reporterTeamId != null
        ? (reporterTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
        : null;
      const isOpposingCoach =
        reporterTeamId == null ? isInvolvedCoach : (userTeamId != null && userTeamId === opposingTeamId);

      if (!isCommissioner && !isOpposingCoach) {
        return res.status(403).json({ message: "Only the opposing team's coach or the commissioner can dispute this report" });
      }
      if (!isCommissioner && report.reporterUserId === req.session.userId) {
        return res.status(400).json({ message: "You cannot dispute your own report" });
      }

      const { correctedHomeScore, correctedAwayScore } = req.body as {
        correctedHomeScore?: unknown;
        correctedAwayScore?: unknown;
      };
      const hasCorrectedScore =
        typeof correctedHomeScore === "number" && typeof correctedAwayScore === "number" &&
        correctedHomeScore >= 0 && correctedAwayScore >= 0;

      await storage.updateGameReport(report.id, {
        status: "disputed",
        disputedByUserId: req.session.userId,
        disputeReason: req.body.reason || "Score disputed by opposing coach",
        disputeCorrectedHomeScore: hasCorrectedScore ? correctedHomeScore : null,
        disputeCorrectedAwayScore: hasCorrectedScore ? correctedAwayScore : null,
      });

      const disputeDetails = hasCorrectedScore
        ? `${req.body.reason || "Score disputed by opposing coach"} (proposed correction: ${correctedAwayScore}-${correctedHomeScore})`
        : req.body.reason || "Score disputed by opposing coach";

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Game Report Disputed",
        details: disputeDetails,
      });

      const leagueTeamsForNotify = await storage.getTeamsByLeague(leagueId);
      const homeTeamForNotify = leagueTeamsForNotify.find(t => t.id === game.homeTeamId);
      const awayTeamForNotify = leagueTeamsForNotify.find(t => t.id === game.awayTeamId);

      await storage.createLeagueEvent({
        leagueId,
        teamId: reporterTeamId ?? null,
        teamName: null,
        teamAbbreviation: null,
        teamPrimaryColor: null,
        eventType: "GAME_REPORT",
        description: `${awayTeamForNotify?.name || "Away"} @ ${homeTeamForNotify?.name || "Home"}: reported score disputed. Awaiting commissioner review.`,
        season: game.season,
        week: game.week,
      });

      res.json({ message: "Report disputed. Commissioner will review." });
    } catch (error) {
      console.error("Failed to dispute game report:", error);
      res.status(500).json({ message: "Failed to dispute game report" });
    }
  });

  // ── Commissioner force-finalizes a disputed or pending report ────────────
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

      // Commissioner may opt to apply the disputing coach's proposed corrected score
      // instead of the originally reported one when resolving a dispute.
      const useCorrectedScore = req.body?.useCorrectedScore === true &&
        typeof report.disputeCorrectedHomeScore === "number" &&
        typeof report.disputeCorrectedAwayScore === "number";
      const reportToFinalize = useCorrectedScore
        ? { ...report, homeScore: report.disputeCorrectedHomeScore!, awayScore: report.disputeCorrectedAwayScore! }
        : report;

      await finalizeReportedGame(reportToFinalize, game, leagueId);
      await storage.updateGameReport(report.id, {
        status: "confirmed",
        confirmedByUserId: req.session.userId,
        ...(useCorrectedScore ? { homeScore: reportToFinalize.homeScore, awayScore: reportToFinalize.awayScore } : {}),
      });

      await storage.createAuditLog({
        leagueId,
        userId: req.session.userId,
        action: "Game Report Force-Finalized",
        details: useCorrectedScore
          ? `Commissioner finalized with corrected score: ${reportToFinalize.awayScore}-${reportToFinalize.homeScore} (originally reported ${report.awayScore}-${report.homeScore})`
          : `Commissioner finalized: ${report.awayScore}-${report.homeScore}`,
      });

      const leagueTeamsForNotify = await storage.getTeamsByLeague(leagueId);
      const homeTeamForNotify = leagueTeamsForNotify.find(t => t.id === game.homeTeamId);
      const awayTeamForNotify = leagueTeamsForNotify.find(t => t.id === game.awayTeamId);

      await storage.createLeagueEvent({
        leagueId,
        teamId: null,
        teamName: null,
        teamAbbreviation: null,
        teamPrimaryColor: null,
        eventType: "GAME_REPORT",
        description: `${awayTeamForNotify?.name || "Away"} @ ${homeTeamForNotify?.name || "Home"}: commissioner finalized the official score (${reportToFinalize.awayScore}-${reportToFinalize.homeScore}).`,
        season: game.season,
        week: game.week,
      });

      invalidateLeague(leagueId);
      res.json({ message: "Game finalized by commissioner" });
    } catch (error) {
      console.error("Failed to finalize game report:", error);
      res.status(500).json({ message: "Failed to finalize game report" });
    }
  });

  // ── Screenshot upload & OCR (categorized box-score images) ──────────────
  // Coaches upload categorized eBaseball Power Pros screenshots for a scheduled game;
  // OpenAI vision OCR extracts a draft stat line (never auto-applied) that prefills the
  // review form in report-game.tsx. Images stay attached to the game/report permanently
  // for later viewing on the box score and commissioner review screens.

  async function assertGameAccessForImages(req: any, res: any): Promise<{ leagueId: string; gameId: string; game: any; league: any } | null> {
    const leagueId = req.params.id as string;
    const gameId = req.params.gameId as string;
    const league = await storage.getLeague(leagueId);
    if (!league) { res.status(404).json({ message: "League not found" }); return null; }
    const game = await storage.getGame(gameId);
    if (!game || game.leagueId !== leagueId) { res.status(404).json({ message: "Game not found in this league" }); return null; }
    const isCommissioner = hasCommissionerAccess(league, req.session.userId);
    if (!isCommissioner) {
      const coaches = await storage.getCoachesByLeague(leagueId);
      const coach = coaches.find((c: any) => c.userId === req.session.userId);
      const isInvolved = coach?.teamId && (coach.teamId === game.homeTeamId || coach.teamId === game.awayTeamId);
      if (!isInvolved) {
        res.status(403).json({ message: "Only involved coaches or the commissioner can access screenshots for this game" });
        return null;
      }
    }
    return { leagueId, gameId, game, league };
  }

  // List all screenshots uploaded for a game (grouped by category on the client),
  // viewable from both the box score view and the commissioner review screen.
  app.get("/api/leagues/:id/games/:gameId/report-images", requireAuth, async (req, res) => {
    try {
      const ctx = await assertGameAccessForImages(req, res);
      if (!ctx) return;
      const images = await storage.getGameReportImages(ctx.gameId);
      res.json(images);
    } catch (error) {
      console.error("Failed to fetch game report images:", error);
      res.status(500).json({ message: "Failed to fetch game report images" });
    }
  });

  // Register an uploaded screenshot (after the client has PUT it to the presigned URL)
  // and kick off OCR extraction for it.
  app.post("/api/leagues/:id/games/:gameId/report-images", requireAuth, async (req, res) => {
    try {
      const ctx = await assertGameAccessForImages(req, res);
      if (!ctx) return;
      const { category, objectPath } = req.body as { category?: string; objectPath?: string };
      if (!category || !SCREENSHOT_CATEGORIES.includes(category as ScreenshotCategory)) {
        return res.status(400).json({ message: `category must be one of: ${SCREENSHOT_CATEGORIES.join(", ")}` });
      }
      if (!objectPath || typeof objectPath !== "string") {
        return res.status(400).json({ message: "objectPath is required" });
      }
      // objectPath must reference a real, already-uploaded object in our own
      // storage namespace — this rejects arbitrary/attacker-supplied strings
      // (e.g. "javascript:" URLs) before they're persisted and later rendered
      // as an <a href>/<img src> on the client.
      try {
        await objectStorageService.getObjectEntityFile(objectPath);
      } catch (err) {
        if (err instanceof ObjectNotFoundError) {
          return res.status(400).json({ message: "objectPath does not reference an uploaded object" });
        }
        throw err;
      }

      const image = await storage.createGameReportImage({
        gameId: ctx.gameId,
        leagueId: ctx.leagueId,
        uploadedByUserId: req.session.userId!,
        category,
        objectPath,
      });

      res.json(image);

      // Fire-and-forget OCR — client polls the image record for ocrStatus updates.
      (async () => {
        try {
          await storage.updateGameReportImage(image.id, { ocrStatus: "processing" });
          const result = await extractBoxScoreFromScreenshot(objectPath, category as ScreenshotCategory);
          if (result.success) {
            await storage.updateGameReportImage(image.id, { ocrStatus: "done", ocrResult: result.data ?? null, ocrError: null });
          } else {
            await storage.updateGameReportImage(image.id, { ocrStatus: "failed", ocrError: result.error ?? "OCR failed" });
          }
        } catch (err) {
          console.error("[report-images] OCR background job failed:", err);
          await storage.updateGameReportImage(image.id, { ocrStatus: "failed", ocrError: err instanceof Error ? err.message : "OCR failed" }).catch(() => {});
        }
      })();
    } catch (error) {
      console.error("Failed to create game report image:", error);
      res.status(500).json({ message: "Failed to create game report image" });
    }
  });

  // Re-run OCR on an existing screenshot (e.g. after a failure).
  app.post("/api/leagues/:id/games/:gameId/report-images/:imageId/ocr", requireAuth, async (req, res) => {
    try {
      const ctx = await assertGameAccessForImages(req, res);
      if (!ctx) return;
      const image = await storage.getGameReportImage(req.params.imageId as string);
      if (!image || image.gameId !== ctx.gameId) {
        return res.status(404).json({ message: "Screenshot not found for this game" });
      }
      await storage.updateGameReportImage(image.id, { ocrStatus: "processing", ocrError: null });
      res.json({ message: "OCR re-run started" });

      (async () => {
        try {
          const result = await extractBoxScoreFromScreenshot(image.objectPath, image.category as ScreenshotCategory);
          if (result.success) {
            await storage.updateGameReportImage(image.id, { ocrStatus: "done", ocrResult: result.data ?? null, ocrError: null });
          } else {
            await storage.updateGameReportImage(image.id, { ocrStatus: "failed", ocrError: result.error ?? "OCR failed" });
          }
        } catch (err) {
          console.error("[report-images] OCR re-run failed:", err);
          await storage.updateGameReportImage(image.id, { ocrStatus: "failed", ocrError: err instanceof Error ? err.message : "OCR failed" }).catch(() => {});
        }
      })();
    } catch (error) {
      console.error("Failed to re-run OCR:", error);
      res.status(500).json({ message: "Failed to re-run OCR" });
    }
  });

  // Remove a screenshot (uploader or commissioner only).
  app.delete("/api/leagues/:id/games/:gameId/report-images/:imageId", requireAuth, async (req, res) => {
    try {
      const ctx = await assertGameAccessForImages(req, res);
      if (!ctx) return;
      const image = await storage.getGameReportImage(req.params.imageId as string);
      if (!image || image.gameId !== ctx.gameId) {
        return res.status(404).json({ message: "Screenshot not found for this game" });
      }
      const isCommissioner = hasCommissionerAccess(ctx.league, req.session.userId);
      if (!isCommissioner && image.uploadedByUserId !== req.session.userId) {
        return res.status(403).json({ message: "Only the uploader or the commissioner can delete this screenshot" });
      }
      await storage.deleteGameReportImage(image.id);
      res.json({ message: "Screenshot deleted" });
    } catch (error) {
      console.error("Failed to delete game report image:", error);
      res.status(500).json({ message: "Failed to delete game report image" });
    }
  });
}
