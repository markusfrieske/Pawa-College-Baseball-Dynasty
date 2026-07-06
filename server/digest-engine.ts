import { storage } from "./storage";
import type { AdvanceDigestCategories, Team, Game } from "@shared/schema";

interface BoxBatter {
  playerId?: string;
  name?: string;
  position?: string;
  ab?: number;
  h?: number;
  hr?: number;
  rbi?: number;
  r?: number;
  doubles?: number;
  triples?: number;
  bb?: number;
  so?: number;
}

interface BoxPitcher {
  playerId?: string;
  name?: string;
  ip?: string;
  so?: number;
  er?: number;
  h?: number;
  bb?: number;
}

function extractTopPerformances(
  gameId: string,
  homeTeamName: string,
  awayTeamName: string,
  boxHome: { batting?: BoxBatter[]; pitching?: BoxPitcher[] } | undefined,
  boxAway: { batting?: BoxBatter[]; pitching?: BoxPitcher[] } | undefined,
): AdvanceDigestCategories["topPerformances"] {
  const out: AdvanceDigestCategories["topPerformances"] = [];
  const sides: Array<{ box?: { batting?: BoxBatter[]; pitching?: BoxPitcher[] }; teamName: string }> = [
    { box: boxHome, teamName: homeTeamName },
    { box: boxAway, teamName: awayTeamName },
  ];
  for (const side of sides) {
    for (const b of side.box?.batting ?? []) {
      if (!b.name) continue;
      const hits = b.h ?? 0;
      const hr = b.hr ?? 0;
      const rbi = b.rbi ?? 0;
      if (hr >= 2 || (hr >= 1 && rbi >= 3) || hits >= 4) {
        const parts = [`${hits}-${b.ab ?? 0}`];
        if (hr) parts.push(`${hr} HR`);
        if (rbi) parts.push(`${rbi} RBI`);
        out.push({ gameId, playerName: b.name, teamName: side.teamName, statLine: parts.join(", "), category: "hitting" });
      }
    }
    for (const p of side.box?.pitching ?? []) {
      if (!p.name) continue;
      const so = p.so ?? 0;
      const er = p.er ?? 0;
      const ip = parseFloat(p.ip || "0") || 0;
      if (so >= 8 || (ip >= 6 && er === 0)) {
        const parts = [`${p.ip ?? "0"} IP`, `${so} K`, `${er} ER`];
        out.push({ gameId, playerName: p.name, teamName: side.teamName, statLine: parts.join(", "), category: "pitching" });
      }
    }
  }
  return out.slice(0, 10);
}

export interface FinalizeDigestParams {
  leagueId: string;
  windowStart: Date;
  season: number;
  weeks: number[];
  phase: string;
  prevPowerRankings: Array<{ teamId: string; rank: number }> | null | undefined;
}

export async function computeAndSaveAdvanceDigest(params: FinalizeDigestParams): Promise<void> {
  const { leagueId, windowStart, season, weeks, phase, prevPowerRankings } = params;
  const windowEnd = new Date();

  const [teams, allEvents, gamesInSeason, coaches, gameReports, auditLogs, newRankings] = await Promise.all([
    storage.getTeamsByLeague(leagueId),
    storage.getLeagueEventsBySeason(leagueId, season),
    storage.getGamesByLeagueSeason(leagueId, season),
    storage.getCoachesByLeague(leagueId),
    storage.getGameReportsByLeague(leagueId),
    storage.getAuditLogsByLeague(leagueId),
    storage.computeLeaguePowerRankings(leagueId),
  ]);

  const teamById = new Map<string, Team>(teams.map(t => [t.id, t]));
  const weekSet = new Set(weeks);
  const eventsInWindow = allEvents.filter(e => {
    const ts = e.createdAt ? new Date(e.createdAt).getTime() : 0;
    return ts >= windowStart.getTime() && ts <= windowEnd.getTime();
  });

  // Completed games/upsets — from games table for the exact weeks advanced this cycle.
  const completedGamesRaw: Game[] = gamesInSeason.filter(g => g.isComplete && weekSet.has(g.week));
  const completedGames: AdvanceDigestCategories["completedGames"] = [];
  const topPerformances: AdvanceDigestCategories["topPerformances"] = [];

  for (const g of completedGamesRaw) {
    const home = teamById.get(g.homeTeamId);
    const away = teamById.get(g.awayTeamId);
    if (!home || !away) continue;
    const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    const rankDiff = (loser.nationalRank ?? 149) - (winner.nationalRank ?? 149);
    const isUpset = rankDiff >= 25;
    const isRivalry = !home.isCpu && !away.isCpu;
    const description = `${winner.abbreviation} def. ${loser.abbreviation} ${homeWon ? g.homeScore : g.awayScore}-${homeWon ? g.awayScore : g.homeScore}`;
    completedGames.push({
      gameId: g.id,
      homeTeamId: home.id,
      homeTeamName: home.name,
      awayTeamId: away.id,
      awayTeamName: away.name,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      isUpset,
      isRivalry,
      description,
      season: g.season,
      week: g.week,
      phase: g.phase,
    });

    try {
      if (g.boxScore) {
        const parsed = JSON.parse(g.boxScore);
        topPerformances.push(...extractTopPerformances(g.id, home.name, away.name, parsed.home, parsed.away));
      }
    } catch {
      // boxScore may be non-JSON legacy text; skip top-performance extraction for this game
    }
  }

  // Standings/power ranking movement
  const prevMap = new Map<string, number>((prevPowerRankings ?? []).map(r => [r.teamId, r.rank]));
  const standingsMovement: AdvanceDigestCategories["standingsMovement"] = newRankings
    .map(r => {
      const team = teamById.get(r.teamId);
      if (!team) return null;
      const prevRank = prevMap.has(r.teamId) ? prevMap.get(r.teamId)! : null;
      return {
        teamId: r.teamId,
        teamName: team.name,
        prevRank,
        newRank: r.rank,
        delta: prevRank !== null ? prevRank - r.rank : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.delta !== null && Math.abs(x.delta) >= 3)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 15);

  // Recruiting commits
  const recruitingCommits: AdvanceDigestCategories["recruitingCommits"] = eventsInWindow
    .filter(e => e.eventType === "SIGNING")
    .map(e => ({
      teamId: e.teamId,
      teamName: e.teamName ?? "Unknown",
      description: e.description,
      season: e.season,
      week: e.week,
      createdAt: (e.createdAt ? new Date(e.createdAt) : new Date()).toISOString(),
    }));

  // Heating-up recruiting battles — scan every week in the advance window, not just the last one,
  // so multi-week advances (e.g. long-season sims) don't miss earlier activity.
  const weeksToScan = weeks.length > 0 ? weeks : [1];
  const actionsInWindowLists = await Promise.all(
    weeksToScan.map(w => storage.getRecruitingActionsLogByLeagueWeek(leagueId, season, w).catch(() => []))
  );
  const actionsInWindow = actionsInWindowLists.flat();
  const battleMap = new Map<string, { count: number; teams: Set<string> }>();
  for (const a of actionsInWindow) {
    const ts = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    if (ts < windowStart.getTime() || ts > windowEnd.getTime()) continue;
    const entry = battleMap.get(a.recruitId) ?? { count: 0, teams: new Set<string>() };
    entry.count += 1;
    entry.teams.add(a.teamId);
    battleMap.set(a.recruitId, entry);
  }
  const heatingUpEntries = Array.from(battleMap.entries()).filter(([, v]) => v.teams.size >= 2 && v.count >= 3);
  const heatingUpBattles: AdvanceDigestCategories["heatingUpBattles"] = [];
  if (heatingUpEntries.length > 0) {
    const recruitIds = heatingUpEntries.map(([id]) => id);
    const recruitsData = await Promise.all(recruitIds.map(id => storage.getRecruit(id).catch(() => undefined)));
    heatingUpEntries.forEach(([recruitId, v], i) => {
      const r = recruitsData[i];
      if (!r) return;
      heatingUpBattles.push({
        recruitId,
        recruitName: `${r.firstName} ${r.lastName}`,
        stars: r.starRating,
        position: r.position,
        actionCount: v.count,
        teamsInvolved: v.teams.size,
      });
    });
    heatingUpBattles.sort((a, b) => b.actionCount - a.actionCount);
  }

  // Pending score reports (current snapshot)
  const pendingScoreReports: AdvanceDigestCategories["pendingScoreReports"] = gameReports
    .filter(r => r.status === "pending" || r.status === "disputed")
    .map(r => {
      const game = gamesInSeason.find(g => g.id === r.gameId);
      const home = game ? teamById.get(game.homeTeamId) : undefined;
      const away = game ? teamById.get(game.awayTeamId) : undefined;
      return {
        gameId: r.gameId,
        homeTeamName: home?.name ?? "Unknown",
        awayTeamName: away?.name ?? "Unknown",
        status: r.status,
        season: game?.season ?? season,
        week: game?.week ?? 0,
      };
    })
    .slice(0, 25);

  // Coach ready/not-ready status (current snapshot, human-controlled teams only)
  const coachReadyStatus: AdvanceDigestCategories["coachReadyStatus"] = coaches
    .filter(c => c.teamId && !!teamById.get(c.teamId)?.isCpu === false)
    .map(c => {
      const team = teamById.get(c.teamId!)!;
      return {
        teamId: team.id,
        teamName: team.name,
        coachName: `${c.firstName} ${c.lastName}`,
        isReady: c.isReady,
        isCpu: team.isCpu,
      };
    });

  // Relevant commissioner actions
  const commissionerActions: AdvanceDigestCategories["commissionerActions"] = auditLogs
    .filter(a => {
      const ts = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      return ts >= windowStart.getTime() && ts <= windowEnd.getTime();
    })
    .map(a => ({ action: a.action, details: a.details ?? null, timestamp: (a.timestamp ? new Date(a.timestamp) : new Date()).toISOString() }))
    .slice(0, 30);

  const categories: AdvanceDigestCategories = {
    completedGames,
    topPerformances,
    standingsMovement,
    recruitingCommits,
    heatingUpBattles,
    pendingScoreReports,
    coachReadyStatus,
    commissionerActions,
  };

  await storage.createAdvanceDigest({
    leagueId,
    season,
    week: weeks[weeks.length - 1] ?? 1,
    phase,
    windowStart,
    windowEnd,
    categories,
  });

  await storage.updateLeague(leagueId, { lastDigestAt: windowEnd });
}

/**
 * Best-effort wrapper: never throws, so it can be safely fire-and-forgotten
 * from advance-flow route handlers without affecting the primary response.
 */
export async function finalizeAdvanceDigestSafe(params: FinalizeDigestParams): Promise<void> {
  try {
    await computeAndSaveAdvanceDigest(params);
  } catch (e) {
    console.error("[digest-engine] Failed to compute advance digest:", e);
  }
}
