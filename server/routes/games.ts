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
import { validateBoxScore } from "../lib/validateBoxScore";
import { requireAuth, hasCommissionerAccess, gameScoreSchema } from "../route-helpers";
import { cacheGet, cacheSet, leagueCacheKey, invalidateLeague } from "../cache";
import { finalizeGame, finalizeReportedGame } from "../game-finalizer";
import { SCREENSHOT_CATEGORIES, type ScreenshotCategory } from "@shared/schema";
import { extractBoxScoreFromScreenshot } from "../ocrGameReport";
import { ObjectStorageService, ObjectNotFoundError } from "../replit_integrations/object_storage/objectStorage";
import {
  computePitcherAvailability,
  fullStaminaIP,
  GAME_TYPE_TO_DAY,
  type GameDay,
} from "@shared/pitcherRest";

const objectStorageService = new ObjectStorageService();

// Shape of a single coach correction logged during OCR review. `ocrValue`/`correctedValue`
// are stored as strings (already stringified client-side) so the audit trail can compare
// heterogeneous field types (numbers, strings, booleans) uniformly.
interface CorrectionInput {
  fieldKey?: unknown;
  fieldLabel?: unknown;
  ocrValue?: unknown;
  correctedValue?: unknown;
}

async function persistCorrections(
  rawCorrections: unknown,
  ctx: { gameReportId: string; gameId: string; leagueId: string; userId: string }
): Promise<void> {
  if (!Array.isArray(rawCorrections) || rawCorrections.length === 0) return;
  const rows = (rawCorrections as CorrectionInput[])
    .filter(c => typeof c.fieldKey === "string" && c.fieldKey.length > 0)
    .map(c => ({
      gameReportId: ctx.gameReportId,
      gameId: ctx.gameId,
      leagueId: ctx.leagueId,
      fieldKey: c.fieldKey as string,
      fieldLabel: typeof c.fieldLabel === "string" ? c.fieldLabel : null,
      ocrValue: c.ocrValue == null ? null : String(c.ocrValue),
      correctedValue: c.correctedValue == null ? null : String(c.correctedValue),
      correctedByUserId: ctx.userId,
    }));
  if (rows.length > 0) {
    await storage.batchCreateGameReportCorrections(rows);
  }
}

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

      const leagueTeams = await storage.getTeamsByLeague(patchLeagueId);
      await finalizeGame(patchGame, homeScore, awayScore, null, patchLeagueId, {
        skipPlayerStats: true,
        skipPitcherRest: true,
        leagueTeams,
      });

      await storage.createAuditLog({
        leagueId: patchLeagueId,
        userId: req.session.userId,
        action: "Game Score Submitted",
        details: `Final: ${awayScore} - ${homeScore}`,
      });

      const updatedGame = await storage.getGame(patchGameId);
      res.json(updatedGame);
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

      const hasFullBoxScore = !!(
        Array.isArray(inningScores) && inningScores.length > 0 &&
        homeBoxData?.batting?.length && homeBoxData?.pitching?.length &&
        awayBoxData?.batting?.length && awayBoxData?.pitching?.length
      );

      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!isCommissioner && !hasFullBoxScore) {
        return res.status(422).json({
          message: "Full box score is required. Add batting, pitching, and inning data before submitting.",
          validationErrors: [{ id: "box-score-required", field: "boxData", severity: "error", message: "Full box score (batting + pitching + innings) is required for coach submissions." }],
        });
      }

      const validationIssues = validateBoxScore({ homeScore, awayScore, homeHits, awayHits, inningScores, homeBoxData, awayBoxData });
      const validationErrors = validationIssues.filter(i => i.severity === "error");
      if (validationErrors.length > 0) {
        return res.status(422).json({ message: validationErrors[0].message, validationErrors: validationIssues });
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

      await persistCorrections(req.body.corrections, {
        gameReportId: report.id,
        gameId: game.id,
        leagueId,
        userId: req.session.userId!,
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
      const validationIssues = validateBoxScore({ homeScore, awayScore, homeHits, awayHits, inningScores, homeBoxData, awayBoxData });
      const validationErrors = validationIssues.filter(i => i.severity === "error");
      if (validationErrors.length > 0) {
        return res.status(422).json({ message: validationErrors[0].message, validationErrors: validationIssues });
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
      await persistCorrections(req.body.corrections, {
        gameReportId: existing.id,
        gameId,
        leagueId,
        userId: req.session.userId!,
      });
      res.json(updated);
    } catch (error) {
      console.error("Failed to update game report:", error);
      res.status(500).json({ message: "Failed to update game report" });
    }
  });

  // ── OCR audit trail (commissioner-facing OCR vs correction vs final comparison) ──
  app.get("/api/leagues/:id/games/:gameId/report/audit", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const gameId = req.params.gameId as string;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const game = await storage.getGame(gameId);
      if (!game || game.leagueId !== leagueId) {
        return res.status(404).json({ message: "Game not found in this league" });
      }

      const isCommissioner = hasCommissionerAccess(league, req.session.userId);
      if (!isCommissioner) {
        const coaches = await storage.getCoachesByLeague(leagueId);
        const coach = coaches.find(c => c.userId === req.session.userId);
        const isInvolved = coach?.teamId && (coach.teamId === game.homeTeamId || coach.teamId === game.awayTeamId);
        if (!isInvolved) {
          return res.status(403).json({ message: "Only involved coaches or the commissioner can view this audit trail" });
        }
      }

      const [report, images, corrections] = await Promise.all([
        storage.getGameReport(gameId),
        storage.getGameReportImages(gameId),
        storage.getGameReportCorrections(gameId),
      ]);

      // Build a per-field comparison: OCR value (from screenshot confidence maps, if the
      // field was ever extracted), the correction (if the coach edited it), and null for
      // "final" — the final submitted stat line lives in `report.homeBoxData`/`awayBoxData`
      // and inline score fields, which the client can already read directly off `report`.
      // We surface the correction rows alongside so a commissioner can line OCR → correction
      // → final up without cross-referencing multiple screens.
      const correctionByField = new Map(corrections.map(c => [c.fieldKey, c]));
      const comparison = corrections.map(c => ({
        fieldKey: c.fieldKey,
        fieldLabel: c.fieldLabel ?? c.fieldKey,
        ocrValue: c.ocrValue,
        correctedValue: c.correctedValue,
        correctedByUserId: c.correctedByUserId,
        correctedAt: c.createdAt,
      }));

      res.json({
        report: report ?? null,
        images,
        corrections,
        comparison,
        correctedFieldCount: correctionByField.size,
      });
    } catch (error) {
      console.error("Failed to fetch OCR audit trail:", error);
      res.status(500).json({ message: "Failed to fetch OCR audit trail" });
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

  async function assertGameAccessForImages(req: any, res: any, readOnly = false): Promise<{ leagueId: string; gameId: string; game: any; league: any } | null> {
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
      if (!coach) {
        res.status(403).json({ message: "Only involved coaches or the commissioner can access screenshots for this game" });
        return null;
      }
      // For read-only access on completed games, any league member can view evidence.
      // For uploads/deletes and incomplete games, only the two involved coaches.
      if (!readOnly || !game.isComplete) {
        const isInvolved = coach.teamId && (coach.teamId === game.homeTeamId || coach.teamId === game.awayTeamId);
        if (!isInvolved) {
          res.status(403).json({ message: "Only involved coaches or the commissioner can access screenshots for this game" });
          return null;
        }
      }
    }
    return { leagueId, gameId, game, league };
  }

  // List all screenshots uploaded for a game (grouped by category on the client),
  // viewable from both the box score view and the commissioner review screen.
  // Read-only: any league member may view screenshots for completed games (evidence vault).
  app.get("/api/leagues/:id/games/:gameId/report-images", requireAuth, async (req, res) => {
    try {
      const ctx = await assertGameAccessForImages(req, res, true);
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
            await storage.updateGameReportImage(image.id, {
              ocrStatus: "done",
              ocrResult: result.data ?? null,
              ocrRawResponse: result.rawText ?? null,
              ocrFieldConfidence: result.fieldConfidence ?? null,
              ocrError: null,
            });
          } else {
            await storage.updateGameReportImage(image.id, {
              ocrStatus: "failed",
              ocrRawResponse: result.rawText ?? null,
              ocrError: result.error ?? "OCR failed",
            });
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
            await storage.updateGameReportImage(image.id, {
              ocrStatus: "done",
              ocrResult: result.data ?? null,
              ocrRawResponse: result.rawText ?? null,
              ocrFieldConfidence: result.fieldConfidence ?? null,
              ocrError: null,
            });
          } else {
            await storage.updateGameReportImage(image.id, {
              ocrStatus: "failed",
              ocrRawResponse: result.rawText ?? null,
              ocrError: result.error ?? "OCR failed",
            });
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

  // ── Game Prep Card ────────────────────────────────────────────────────────
  //   GET /api/leagues/:id/games/:gameId/prep
  //   Any authenticated league member may view prep data for any game.
  //   No hidden recruit/gem/bust flags are exposed — only player ratings and
  //   season stats that are already visible on the roster page.
  app.get("/api/leagues/:id/games/:gameId/prep", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const gameId   = req.params.gameId as string;
      const userId   = req.session.userId!;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      // Parallel bulk fetch — everything we need in one round-trip.
      const [allGames, teams, coaches, seasonStats, standingRows] = await Promise.all([
        storage.getGamesByLeague(leagueId),
        storage.getTeamsByLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
        storage.getPlayerSeasonStatsBySeason(leagueId, league.currentSeason),
        storage.getStandingsByLeague(leagueId, league.currentSeason),
      ]);

      const game = allGames.find(g => g.id === gameId);
      if (!game) return res.status(404).json({ message: "Game not found" });

      const homeTeam = teams.find(t => t.id === game.homeTeamId);
      const awayTeam = teams.find(t => t.id === game.awayTeamId);
      if (!homeTeam || !awayTeam) return res.status(404).json({ message: "Teams not found" });

      // Fetch both rosters in parallel.
      const [homePlayers, awayPlayers] = await Promise.all([
        storage.getPlayersByTeam(homeTeam.id),
        storage.getPlayersByTeam(awayTeam.id),
      ]);

      // Determine user's side.
      const userCoach  = coaches.find(c => c.userId === userId);
      const userTeamId = userCoach?.teamId ?? null;
      const userSide: "home" | "away" | null =
        userTeamId === homeTeam.id ? "home" :
        userTeamId === awayTeam.id ? "away" : null;

      // Indexes.
      const standingsMap = new Map(standingRows.map(s => [s.teamId, s]));
      const statsMap     = new Map(seasonStats.map(s => [s.playerId, s]));

      // Game day slot — used for pitcher rest calculations.
      const gameDay: GameDay = GAME_TYPE_TO_DAY[game.gameType ?? ""] ?? "FRI";

      // ── Recent form (last 5 completed games for a team) ────────────────────
      const recentFormForTeam = (teamId: string): Array<"W" | "L"> =>
        allGames
          .filter(g => g.isComplete && (g.homeTeamId === teamId || g.awayTeamId === teamId))
          .sort((a, b) => (b.week ?? 0) - (a.week ?? 0))
          .slice(0, 5)
          .map(g => {
            const isHome = g.homeTeamId === teamId;
            const scored   = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
            const allowed  = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
            return scored > allowed ? "W" : "L";
          });

      // ── Team analysis ───────────────────────────────────────────────────────
      type Player = typeof homePlayers[0];
      const avgAttr = (arr: Player[], key: keyof Player): number =>
        arr.length === 0
          ? 50
          : Math.round(arr.reduce((s, p) => s + ((p[key] as number) ?? 50), 0) / arr.length);

      const analyzeTeam = (
        teamId: string,
        players: Player[],
        coach: (typeof coaches)[0] | undefined,
      ) => {
        const pitchers  = players.filter(p => p.position === "SP" || p.position === "RP");
        const starters  = players.filter(p => p.position === "SP");
        const relievers = players.filter(p => p.position === "RP");
        const hitters   = players.filter(p => p.position !== "SP" && p.position !== "RP");

        // Probable starter: best available SP for this game day.
        // Falls back to best available pitcher, then any pitcher.
        const startPool = starters.length > 0 ? starters : pitchers;
        const startCandidates = startPool
          .map(p => ({
            player: p,
            avail: computePitcherAvailability(
              p.lastPitchedOuts ?? 0,
              p.lastPitchedWeek ?? null,
              (p.lastPitchedDay as GameDay | null) ?? null,
              p.stamina ?? 50,
              league.currentWeek,
              gameDay,
            ),
          }))
          .sort((a, b) => {
            // Prefer: fully available > limited > unavailable; then by OVR desc.
            const aScore =
              a.avail.available && !a.avail.limited ? 2 :
              a.avail.available ?                     1 : 0;
            const bScore =
              b.avail.available && !b.avail.limited ? 2 :
              b.avail.available ?                     1 : 0;
            if (aScore !== bScore) return bScore - aScore;
            return (b.player.overall ?? 0) - (a.player.overall ?? 0);
          });

        const topStarter = startCandidates[0] ?? null;
        const spStats    = topStarter ? statsMap.get(topStarter.player.id) : null;
        const spEra      = spStats && (spStats.ipOuts ?? 0) > 0
          ? (((spStats.pEr ?? 0) * 27) / spStats.ipOuts!).toFixed(2)
          : null;
        const spRecord   = spStats ? `${spStats.wins ?? 0}-${spStats.losses ?? 0}` : null;

        // Bullpen: top 3 relievers by OVR with availability info.
        const bullpen = [...relievers]
          .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
          .slice(0, 3)
          .map(p => {
            const avail  = computePitcherAvailability(
              p.lastPitchedOuts ?? 0,
              p.lastPitchedWeek ?? null,
              (p.lastPitchedDay as GameDay | null) ?? null,
              p.stamina ?? 50,
              league.currentWeek,
              gameDay,
            );
            const pStats = statsMap.get(p.id);
            const era    = pStats && (pStats.ipOuts ?? 0) > 0
              ? (((pStats.pEr ?? 0) * 27) / pStats.ipOuts!).toFixed(2)
              : null;
            return {
              id: p.id,
              name: `${p.firstName} ${p.lastName}`,
              position: p.position,
              overall: p.overall ?? 0,
              velocity: p.velocity ?? 0,
              control: p.control ?? 0,
              stuff: p.stuff ?? 0,
              stamina: p.stamina ?? 0,
              available: avail.available,
              limited: avail.limited,
              suggestedMaxIP: avail.suggestedMaxIP,
              era,
            };
          });

        // Top 3 hitters by OVR with stat enrichment.
        const top3Bats = [...hitters]
          .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
          .slice(0, 3)
          .map(p => {
            const st = statsMap.get(p.id);
            const ba = st && (st.ab ?? 0) > 5
              ? ((st.h ?? 0) / st.ab!).toFixed(3).replace(/^0/, "")
              : null;
            return {
              id: p.id,
              name: `${p.firstName} ${p.lastName}`,
              position: p.position,
              overall: p.overall ?? 0,
              hitForAvg: p.hitForAvg ?? 50,
              power: p.power ?? 50,
              speed: p.speed ?? 50,
              starRating: p.starRating ?? 2,
              ba,
              hr: st?.hr ?? null,
            };
          });

        // Weakest defensive spots: one worst-fielding player per position.
        const posDef = new Map<string, Player>();
        for (const p of hitters) {
          const existing = posDef.get(p.position);
          if (!existing || (p.fielding ?? 0) < (existing.fielding ?? 0)) {
            posDef.set(p.position, p);
          }
        }
        const weakDefense = [...posDef.entries()]
          .sort((a, b) => (a[1].fielding ?? 50) - (b[1].fielding ?? 50))
          .slice(0, 2)
          .map(([pos, p]) => ({
            position: pos,
            name: `${p.firstName} ${p.lastName}`,
            fielding: p.fielding ?? 50,
            errorResistance: p.errorResistance ?? 50,
          }));

        // Catcher arm (used for Keys to Win logic).
        const catcher = hitters.find(p => p.position === "C");

        // Team batting aggregates from season stats (only if enough ABs exist).
        const hitterStats = hitters.flatMap(p => {
          const s = statsMap.get(p.id);
          return s ? [s] : [];
        });
        const totalAB = hitterStats.reduce((s, st) => s + (st.ab ?? 0), 0);
        const totalH  = hitterStats.reduce((s, st) => s + (st.h  ?? 0), 0);
        const totalHR = hitterStats.reduce((s, st) => s + (st.hr ?? 0), 0);
        const teamBA  = totalAB > 10 ? (totalH / totalAB).toFixed(3).replace(/^0/, "") : null;
        const teamHR  = totalAB > 10 ? totalHR : null;

        // ── Matchup meter (0–100 per dimension) ─────────────────────────────
        // Batting / Power / Speed / Defense → average of hitter attributes.
        // Starting Pitching → weighted composite of the probable starter's attrs.
        // Bullpen → weighted composite of top relievers' attrs.
        const spPlayer = topStarter?.player;
        const startingPitchingScore = spPlayer
          ? Math.round(
              (spPlayer.velocity ?? 50) * 0.40 +
              (spPlayer.control  ?? 50) * 0.30 +
              (spPlayer.stamina  ?? 50) * 0.20 +
              (spPlayer.stuff    ?? 50) * 0.10,
            )
          : 50;

        const bullpenScore = bullpen.length === 0 ? 50 : Math.round(
          bullpen.reduce((s, p) => s + p.velocity * 0.40 + p.control * 0.35 + p.stuff * 0.25, 0)
          / bullpen.length,
        );

        const meter = {
          batting:          avgAttr(hitters, "hitForAvg"),
          power:            avgAttr(hitters, "power"),
          speed:            avgAttr(hitters, "speed"),
          defense:          avgAttr(hitters, "fielding"),
          startingPitching: startingPitchingScore,
          bullpen:          bullpenScore,
        };

        // Coach style / philosophy (only non-hidden fields).
        const style      = coach?.archetype ?? null;
        const philosophy = (
          (coach?.coachingPhilosophy as Array<{ statement?: string; importance?: string }> | null)
            ?.filter(p => p.importance === "core" || p.importance === "primary")
            ?.slice(0, 2)
            ?.map(p => p.statement ?? "")
            ?.filter(Boolean)
        ) ?? [];

        return {
          meter,
          probableStarter: topStarter ? {
            id: topStarter.player.id,
            name: `${topStarter.player.firstName} ${topStarter.player.lastName}`,
            overall:   topStarter.player.overall  ?? 0,
            velocity:  topStarter.player.velocity  ?? 0,
            control:   topStarter.player.control   ?? 0,
            stamina:   topStarter.player.stamina   ?? 0,
            stuff:     topStarter.player.stuff     ?? 0,
            suggestedMaxIP: fullStaminaIP(topStarter.player.stamina ?? 50),
            pitchingSuggestedMaxIP: topStarter.avail.suggestedMaxIP,
            available: topStarter.avail.available,
            limited:   topStarter.avail.limited,
            era:       spEra,
            record:    spRecord,
          } : null,
          bullpen,
          top3Bats,
          weakDefense,
          catcher: catcher ? { arm: catcher.arm ?? 50 } : null,
          style,
          philosophy,
          teamBA,
          teamHR,
          record: {
            wins:   standingsMap.get(teamId)?.wins   ?? 0,
            losses: standingsMap.get(teamId)?.losses ?? 0,
          },
          recentForm: recentFormForTeam(teamId),
        };
      };

      const homeCoach = coaches.find(c => c.teamId === homeTeam.id);
      const awayCoach = coaches.find(c => c.teamId === awayTeam.id);

      const homeAnalysis = analyzeTeam(homeTeam.id, homePlayers, homeCoach);
      const awayAnalysis = analyzeTeam(awayTeam.id, awayPlayers, awayCoach);

      // ── Head-to-head history ───────────────────────────────────────────────
      const h2hGames = allGames
        .filter(g =>
          g.isComplete && g.id !== game.id && (
            (g.homeTeamId === homeTeam.id && g.awayTeamId === awayTeam.id) ||
            (g.homeTeamId === awayTeam.id && g.awayTeamId === homeTeam.id)
          )
        )
        .sort((a, b) => (b.week ?? 0) - (a.week ?? 0))
        .slice(0, 5);

      const homeH2HWins = h2hGames.filter(g =>
        (g.homeTeamId === homeTeam.id && (g.homeScore ?? 0) > (g.awayScore ?? 0)) ||
        (g.awayTeamId === homeTeam.id && (g.awayScore ?? 0) > (g.homeScore ?? 0))
      ).length;

      // ── Keys to Win ────────────────────────────────────────────────────────
      //   Generated deterministically from ratings and rest status.
      //   Perspective = user's team vs. opponent.
      //   Falls back to home-team perspective when user is not in the game.
      const myA   = userSide === "home" ? homeAnalysis : awayAnalysis;
      const oppA  = userSide === "home" ? awayAnalysis : homeAnalysis;

      const keys: string[] = [];

      // 1. Starter availability / fatigue
      const sp = oppA.probableStarter;
      if (sp) {
        if (!sp.available) {
          keys.push("Their probable starter is unavailable — expect a bullpen game from the start");
        } else if (sp.limited) {
          keys.push(`Work deep counts — ${sp.name} is limited to ~${sp.pitchingSuggestedMaxIP} IP on short rest`);
        } else if ((sp.stamina ?? 0) < 50) {
          keys.push(`Tire out their starter — ${sp.name} runs out of gas around ${sp.suggestedMaxIP} innings`);
        } else if ((sp.control ?? 0) < 50) {
          keys.push(`Be patient at the plate — ${sp.name} struggles with command (${sp.control} control)`);
        } else if ((sp.velocity ?? 0) >= 75 && (sp.control ?? 0) >= 70) {
          keys.push(`Their ace ${sp.name} is legitimate — make contact early before he finds his rhythm`);
        }
      }

      // 2. Running game / catcher arm
      if (oppA.catcher && oppA.catcher.arm >= 75) {
        keys.push(`Stay put — their catcher has an elite arm (${oppA.catcher.arm}). Do not run.`);
      } else if (myA.meter.speed >= 65 && (oppA.catcher?.arm ?? 50) < 55) {
        keys.push("Push the running game — you have a speed edge and their catcher's arm is exploitable");
      }

      // 3. Power threat — protect the strike zone vs. their top bat
      const topBat = oppA.top3Bats[0];
      if (topBat && topBat.power >= 75) {
        keys.push(`Keep the ball in the park — ${topBat.name} (${topBat.position}) can change the game in one swing (${topBat.power} power)`);
      }

      // 4. Lineup depth — exploit the bottom of their order
      const oppLineupAvg = oppA.top3Bats.length > 0
        ? oppA.top3Bats.reduce((s, b) => s + b.overall, 0) / oppA.top3Bats.length
        : 300;
      if (oppLineupAvg > 360 && oppA.meter.batting < 55) {
        keys.push("Their lineup falls off hard after the top — let your starter carve through the bottom third");
      }

      // 5. Bullpen edge
      if (myA.meter.bullpen > oppA.meter.bullpen + 15) {
        keys.push("Trust your bullpen — a late-game lead is safe with your pen advantage");
      } else if (oppA.meter.bullpen > myA.meter.bullpen + 15) {
        keys.push("Score early — their bullpen is strong enough to close out any late lead you chase");
      }

      // 6. Speed / contact advantage
      if (myA.meter.speed > oppA.meter.speed + 15) {
        keys.push("Use your speed advantage — put the ball in play and make their defense work");
      }

      // 7. Defensive weak spot to exploit
      const weak = oppA.weakDefense[0];
      if (weak && weak.fielding < 45) {
        keys.push(`Attack the ${weak.position} gap — ${weak.name} is an exploitable glove (${weak.fielding} fielding)`);
      }

      // Fill to a minimum of 3 keys with generic comparative tips.
      if (keys.length < 3 && myA.meter.batting > oppA.meter.batting + 10) {
        keys.push("Your lineup has a clear contact advantage — make them earn every single out");
      }
      if (keys.length < 3 && myA.meter.startingPitching > oppA.meter.startingPitching + 10) {
        keys.push("Your starter has the edge on the mound — give him run support early and let him work");
      }
      if (keys.length < 3) {
        keys.push("Stay disciplined at the plate and execute your game plan pitch by pitch");
      }

      res.json({
        game: {
          id:           game.id,
          homeTeamId:   game.homeTeamId,
          awayTeamId:   game.awayTeamId,
          isConference: game.isConference,
          gameType:     game.gameType,
          week:         game.week,
          season:       game.season,
          phase:        game.phase,
          isComplete:   game.isComplete,
        },
        homeTeam: {
          id:             homeTeam.id,
          name:           homeTeam.name,
          abbreviation:   homeTeam.abbreviation,
          primaryColor:   homeTeam.primaryColor,
          secondaryColor: homeTeam.secondaryColor,
          prestige:       homeTeam.prestige,
          mascot:         homeTeam.mascot,
          coachName:      homeCoach ? `${homeCoach.firstName} ${homeCoach.lastName}` : "CPU Coach",
          coachArchetype: homeCoach?.archetype ?? null,
        },
        awayTeam: {
          id:             awayTeam.id,
          name:           awayTeam.name,
          abbreviation:   awayTeam.abbreviation,
          primaryColor:   awayTeam.primaryColor,
          secondaryColor: awayTeam.secondaryColor,
          prestige:       awayTeam.prestige,
          mascot:         awayTeam.mascot,
          coachName:      awayCoach ? `${awayCoach.firstName} ${awayCoach.lastName}` : "CPU Coach",
          coachArchetype: awayCoach?.archetype ?? null,
        },
        home:       homeAnalysis,
        away:       awayAnalysis,
        userSide,
        keysToWin:  keys.slice(0, 5),
        h2h: {
          homeWins:    homeH2HWins,
          awayWins:    h2hGames.length - homeH2HWins,
          totalGames:  h2hGames.length,
          recentGames: h2hGames.slice(0, 3).map(g => ({
            id:         g.id,
            week:       g.week,
            homeScore:  g.homeScore,
            awayScore:  g.awayScore,
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
          })),
        },
      });
    } catch (error) {
      console.error("Failed to fetch game prep:", error);
      res.status(500).json({ message: "Failed to fetch game prep" });
    }
  });
}
