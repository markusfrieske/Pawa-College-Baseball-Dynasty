/**
 * War Room route — aggregated coach dashboard endpoint.
 *
 * GET /api/leagues/:id/war-room
 *   Returns the logged-in coach's next game, needs-attention checklist,
 *   recent league events, and (if commissioner) league-wide blocker counts.
 *   Never exposes hidden gem/bust recruit flags.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess } from "../route-helpers";

const NEXT_GAME_PHASES = new Set([
  "regular_season",
  "conference_championship",
  "super_regionals",
  "cws",
]);

export function registerWarRoomRoutes(app: Express): void {
  app.get("/api/leagues/:id/war-room", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId!;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      // Parallel bulk fetches — everything we need at once
      const [teams, coaches, games, leagueEvents, standingRows] = await Promise.all([
        storage.getTeamsByLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
        storage.getGamesByLeagueSeason(leagueId, league.currentSeason),
        storage.getLeagueEvents(leagueId, 30),
        storage.getStandingsByLeague(leagueId, league.currentSeason),
      ]);

      const userCoach = coaches.find(c => c.userId === userId) ?? null;
      const userTeam = userCoach ? (teams.find(t => t.id === userCoach.teamId) ?? null) : null;
      const isCommissioner = hasCommissionerAccess(league, userId);

      // Map standings by teamId for O(1) lookup
      const standingsMap = new Map(standingRows.map(s => [s.teamId, s]));
      const getRecord = (teamId: string) => {
        const s = standingsMap.get(teamId);
        return { wins: s?.wins ?? 0, losses: s?.losses ?? 0 };
      };

      // Recruiting interests for the user's team (needs-attention scout/recruit counts)
      const recruitingInterests = userTeam
        ? await storage.getRecruitingInterestsByTeam(userTeam.id)
        : [];

      // ─── Next game ───────────────────────────────────────────────────────
      const isGamePhase = NEXT_GAME_PHASES.has(league.currentPhase);
      let nextOpponent = null;

      if (isGamePhase && userTeam) {
        const userWeekGames = games.filter(g =>
          g.week === league.currentWeek &&
          (g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id),
        );

        // Prefer next incomplete; fall back to the last played game this week
        const game =
          userWeekGames.find(g => !g.isComplete) ??
          userWeekGames[userWeekGames.length - 1] ??
          null;

        if (game) {
          const isHome = game.homeTeamId === userTeam.id;
          const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
          const opponent = teams.find(t => t.id === opponentId) ?? null;

          // Last 3 completed games for opponent form indicator
          const oppCompleted = games
            .filter(
              g =>
                (g.homeTeamId === opponentId || g.awayTeamId === opponentId) &&
                g.isComplete,
            )
            .slice(-3);
          const recentForm = oppCompleted.map(g => {
            const oppIsHome = g.homeTeamId === opponentId;
            const oppScore = (oppIsHome ? g.homeScore : g.awayScore) ?? 0;
            const otherScore = (oppIsHome ? g.awayScore : g.homeScore) ?? 0;
            return oppScore > otherScore ? "W" : "L";
          });

          // Determine whether this game needs a report upload
          const oppCoach = coaches.find(c => c.teamId === opponentId);
          const isHvH = !!userCoach?.userId && !!oppCoach?.userId;
          const needsReporting =
            league.gameMode === "reported" && isHvH && !game.isComplete;

          nextOpponent = {
            gameId: game.id,
            isHome,
            isComplete: game.isComplete,
            gameType: game.gameType ?? null,
            isConference: game.isConference,
            needsReporting,
            userScore: game.isComplete
              ? (isHome ? game.homeScore : game.awayScore) ?? null
              : null,
            opponentScore: game.isComplete
              ? (isHome ? game.awayScore : game.homeScore) ?? null
              : null,
            opponent: opponent
              ? {
                  id: opponent.id,
                  name: opponent.name,
                  abbreviation: opponent.abbreviation,
                  primaryColor: opponent.primaryColor,
                  secondaryColor: opponent.secondaryColor,
                  prestige: opponent.prestige,
                  record: getRecord(opponent.id),
                  recentForm,
                }
              : null,
          };
        }
      }

      // ─── Needs-attention checklist ────────────────────────────────────────
      const phase = league.currentPhase;
      const isRecruitingPhase = phase.startsWith("offseason_recruiting");
      const isDeparturesPhase = phase === "offseason_departures";
      const isWalkonsPhase = phase === "offseason_walkons";

      const userWeekGamesAll = isGamePhase && userTeam
        ? games.filter(g =>
            g.week === league.currentWeek &&
            (g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id),
          )
        : [];

      const hasUnplayedGames = userWeekGamesAll.some(g => !g.isComplete);
      const hasUnreportedGames =
        league.gameMode === "reported" && hasUnplayedGames;

      const scoutActionsUsed = recruitingInterests.filter(
        i => i.scoutPercentage > 0,
      ).length;
      const recruitActionsUsed = recruitingInterests.filter(
        i => i.interestLevel > 0,
      ).length;

      const needsAttention = {
        hasUnplayedGames,
        hasUnreportedGames,
        isRecruitingPhase,
        scoutActionsUsed,
        recruitActionsUsed,
        needsRecruiting: isRecruitingPhase && recruitActionsUsed === 0,
        departuresFinalized: userTeam?.departuresFinalized ?? null,
        walkonReady: userTeam?.walkonReady ?? null,
        isReady: userCoach?.isReady ?? false,
        isDeparturesPhase,
        isWalkonsPhase,
        isGamePhase,
      };

      // ─── Commissioner blockers ────────────────────────────────────────────
      let commissionerBlockers = null;
      if (isCommissioner) {
        const humanTeams = teams.filter(t => {
          if (t.isAutoPilot) return false;
          const c = coaches.find(cc => cc.teamId === t.id);
          return !!c?.userId;
        });

        let notReadyCount = 0;
        for (const t of humanTeams) {
          const c = coaches.find(cc => cc.teamId === t.id);
          if (!c) continue;
          if (isDeparturesPhase) {
            if (!t.departuresFinalized) notReadyCount++;
          } else if (isWalkonsPhase) {
            if (!t.walkonReady) notReadyCount++;
          } else {
            if (!c.isReady) notReadyCount++;
          }
        }

        const unreportedGames =
          league.gameMode === "reported"
            ? games.filter(g => {
                if (g.week !== league.currentWeek || g.isComplete) return false;
                const hc = coaches.find(c => c.teamId === g.homeTeamId);
                const ac = coaches.find(c => c.teamId === g.awayTeamId);
                return !!hc?.userId && !!ac?.userId;
              }).length
            : 0;

        commissionerBlockers = {
          notReadyCount,
          totalHumanTeams: humanTeams.length,
          unreportedGames,
        };
      }

      // ─── Since-last-advance feed ──────────────────────────────────────────
      // Build a fast teamId→{name,abbr} lookup to avoid repeated filter in map
      const teamInfoMap = new Map(
        teams.map(t => [t.id, { name: t.name, abbreviation: t.abbreviation }]),
      );

      const sinceLastAdvance = leagueEvents
        .filter(e => e.season === league.currentSeason && e.eventType !== "NUDGE")
        .slice(0, 15)
        .map(e => ({
          id: e.id,
          eventType: e.eventType,
          description: e.description,
          teamId: e.teamId ?? null,
          teamName: e.teamId ? (teamInfoMap.get(e.teamId)?.name ?? null) : null,
          teamAbbr: e.teamId ? (teamInfoMap.get(e.teamId)?.abbreviation ?? null) : null,
          createdAt: e.createdAt,
        }));

      res.json({
        league: {
          id: league.id,
          name: league.name,
          currentSeason: league.currentSeason,
          currentWeek: league.currentWeek,
          currentPhase: league.currentPhase,
          phaseDeadline: league.phaseDeadline ?? null,
          gameMode: league.gameMode ?? "simulated",
        },
        userTeam: userTeam
          ? {
              id: userTeam.id,
              name: userTeam.name,
              abbreviation: userTeam.abbreviation,
              primaryColor: userTeam.primaryColor,
              secondaryColor: userTeam.secondaryColor,
              prestige: userTeam.prestige,
              record: getRecord(userTeam.id),
            }
          : null,
        userCoach: userCoach
          ? {
              id: userCoach.id,
              firstName: userCoach.firstName,
              lastName: userCoach.lastName,
              isReady: userCoach.isReady ?? false,
              level: userCoach.level,
            }
          : null,
        isCommissioner,
        nextOpponent,
        sinceLastAdvance,
        needsAttention,
        commissionerBlockers,
      });
    } catch (error) {
      console.error("[war-room] Failed to load:", error);
      res.status(500).json({ message: "Failed to load War Room" });
    }
  });
}
