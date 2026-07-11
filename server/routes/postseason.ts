/**
 * Postseason data and statistics routes.
 *
 * Endpoints (all under /api/leagues/:id/):
 *   GET  /postseason          — full postseason bracket + results
 *   GET  /postseason/stats    — postseason stats leaders
 *   GET  /awards              — season awards (MVP, Pitcher of Year, etc.)
 *   GET  /dynasty-history     — per-season history timeline
 *   GET  /nil-earnings        — NIL season earnings
 *   GET  /recruiting-scores   — recruiting score leaderboard
 *   ... and more postseason/history endpoints
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess } from "../route-helpers";
import { resolveRecruitSigningWinner } from "../signing-resolver";
import type { Game } from "../../shared/schema";
import { cacheGet, cacheSet, leagueCacheKey } from "../cache";

// ── Module-local helpers (also used inline in routes.ts) ─────────────
function getGameWinner(game: Game): string {
  return (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.homeTeamId : game.awayTeamId;
}


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


export function registerPostseasonRoutes(app: Express): void {
  // ============ POSTSEASON DATA ENDPOINT ============
  app.get("/api/leagues/:id/postseason", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      
      const allGames = await storage.getGamesByLeague(leagueId);
      let season = Number(req.query.season as string) || league.currentSeason;
      
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
      const seedsTable = seededList.map((t: any, idx: number) => {
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

      // Cache check — keyed per-team since pipeline data is coach-specific
      const pipelineCacheKey = leagueCacheKey(leagueId, `recruiting-pipeline:${teamId}`);
      const cachedPipeline = cacheGet(pipelineCacheKey);
      if (cachedPipeline) return res.json(cachedPipeline);

      // Fetch all independent data in parallel
      const [team, interests, allRecruits, roster, topSchoolEntries, leagueTeams] = await Promise.all([
        storage.getTeam(teamId),
        storage.getRecruitingInterestsByTeam(teamId),
        storage.getRecruitsByLeague(leagueId),
        storage.getPlayersByTeam(teamId),
        storage.getTopSchoolsByTeam(teamId),
        storage.getTeamsByLeague(leagueId),
      ]);
      const teamState = team?.state || "";

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
      
      const pipelinePayload = { pipeline, positionNeeds, totalTargeted: interests.filter(i => i.isTargeted).length, rosterSize: roster.length, teamState, totalClassSize: allRecruits.length, teamCount: leagueTeams.length };
      cacheSet(pipelineCacheKey, pipelinePayload, 30_000);
      res.json(pipelinePayload);
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

      // Cache check — keyed per-team since trends are coach-specific
      const trendsCacheKey = leagueCacheKey(leagueId, `recruiting-trends:${teamId}`);
      const cachedTrends = cacheGet(trendsCacheKey);
      if (cachedTrends) return res.json(cachedTrends);

      // Fetch interests + all team actions in parallel — eliminates N+1 per-recruit queries
      const [interests, allActions] = await Promise.all([
        storage.getRecruitingInterestsByTeam(teamId),
        storage.getRecruitingActionsLogByTeam(teamId, leagueId),
      ]);

      // Group actions by recruitId for O(1) lookup
      const actionsByRecruit = new Map<string, typeof allActions>();
      for (const action of allActions) {
        const list = actionsByRecruit.get(action.recruitId) ?? [];
        list.push(action);
        actionsByRecruit.set(action.recruitId, list);
      }

      const trends: Record<string, { trend: "up" | "down" | "flat"; recentGain: number }> = {};

      for (const interest of interests) {
        const actions = actionsByRecruit.get(interest.recruitId) ?? [];
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

      const trendsPayload = { trends };
      cacheSet(trendsCacheKey, trendsPayload, 30_000);
      res.json(trendsPayload);
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
        if (winningTeam && !seenConfIds.has(winningTeam.conferenceId!)) {
          seenConfIds.add(winningTeam.conferenceId!);
          const conf = confs.find(c => c.id === winningTeam.conferenceId!);
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
      const season = parseInt(req.params.season as string);
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

  app.get("/api/leagues/:id/championship-screen/:season", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const season = parseInt(req.params.season as string);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeague(leagueId);
      const conferences = await storage.getConferencesByLeague(leagueId);
      const confMap: Record<string, string> = Object.fromEntries(conferences.map(c => [c.id, c.name]));
      const teamMap: Record<string, (typeof leagueTeams)[0]> = {};
      for (const t of leagueTeams) teamMap[t.id] = t;

      const seasonStandings = await storage.getStandingsByLeague(leagueId, season);
      const standingsMap: Record<string, (typeof seasonStandings)[0]> = {};
      for (const s of seasonStandings) standingsMap[s.teamId] = s;

      const allGames = await storage.getGamesByLeague(leagueId);

      const cwsGames = allGames
        .filter(g => g.phase === "cws" && g.season === season && g.isComplete)
        .sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));

      const teamCwsWins: Record<string, number> = {};
      const cwsTeamIds = new Set<string>();
      for (const g of cwsGames) {
        cwsTeamIds.add(g.homeTeamId);
        cwsTeamIds.add(g.awayTeamId);
        const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
        teamCwsWins[winnerId] = (teamCwsWins[winnerId] || 0) + 1;
      }
      const champId = Object.entries(teamCwsWins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const runnerUpId = Array.from(cwsTeamIds).find(id => id !== champId) ?? null;

      const srGames = allGames.filter(g => g.phase === "super_regionals" && g.season === season);
      const srTeamIds = new Set<string>();
      for (const g of srGames) { srTeamIds.add(g.homeTeamId); srTeamIds.add(g.awayTeamId); }

      const ccGames = allGames.filter(g => g.phase === "conference_championship" && g.season === season);
      const ccTeamIds = new Set<string>();
      for (const g of ccGames) { ccTeamIds.add(g.homeTeamId); ccTeamIds.add(g.awayTeamId); }

      const getPostseasonFinish = (teamId: string): string => {
        if (teamId === champId) return "champion";
        if (teamId === runnerUpId) return "runner_up";
        if (cwsTeamIds.has(teamId)) return "cws";
        if (srTeamIds.has(teamId)) return "super_regionals";
        if (ccTeamIds.has(teamId)) return "conf_champ";
        return "regular_season";
      };

      const standingsList = leagueTeams.map(t => ({
        teamId: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        primaryColor: t.primaryColor,
        wins: standingsMap[t.id]?.wins ?? 0,
        losses: standingsMap[t.id]?.losses ?? 0,
        conferenceName: t.conferenceId ? confMap[t.conferenceId] ?? "" : "",
        postseasonFinish: getPostseasonFinish(t.id),
      })).sort((a, b) => b.wins - a.wins || a.losses - b.losses).slice(0, 8);

      const champTeam = champId ? teamMap[champId] : null;
      const runnerUpTeam = runnerUpId ? teamMap[runnerUpId] : null;

      const champion = champTeam ? {
        id: champTeam.id,
        name: champTeam.name,
        mascot: champTeam.mascot,
        abbreviation: champTeam.abbreviation,
        primaryColor: champTeam.primaryColor,
        secondaryColor: champTeam.secondaryColor,
        wins: standingsMap[champTeam.id]?.wins ?? 0,
        losses: standingsMap[champTeam.id]?.losses ?? 0,
        conferenceName: champTeam.conferenceId ? confMap[champTeam.conferenceId] ?? "" : "",
      } : null;

      const runnerUp = runnerUpTeam ? {
        id: runnerUpTeam.id,
        name: runnerUpTeam.name,
        abbreviation: runnerUpTeam.abbreviation,
        primaryColor: runnerUpTeam.primaryColor,
        wins: standingsMap[runnerUpTeam.id]?.wins ?? 0,
        losses: standingsMap[runnerUpTeam.id]?.losses ?? 0,
      } : null;

      const cwsGamesList = cwsGames.map((g, i) => ({
        gameNumber: i + 1,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeTeamAbbr: teamMap[g.homeTeamId]?.abbreviation ?? "?",
        awayTeamAbbr: teamMap[g.awayTeamId]?.abbreviation ?? "?",
        homeTeamName: teamMap[g.homeTeamId]?.name ?? "?",
        awayTeamName: teamMap[g.awayTeamId]?.name ?? "?",
        homeScore: g.homeScore ?? 0,
        awayScore: g.awayScore ?? 0,
        winnerId: (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId,
      }));

      const cwsChampWins = champId ? (teamCwsWins[champId] ?? 0) : 0;
      const cwsRunnerUpWins = runnerUpId ? (teamCwsWins[runnerUpId] ?? 0) : 0;

      const PITCHER_POS = ["P", "SP", "RP", "CL", "LHP", "RHP"];
      const allPlayers: { player: any; team: any }[] = [];
      for (const team of leagueTeams) {
        const roster = await storage.getPlayersByTeam(team.id);
        for (const p of roster) allPlayers.push({ player: p, team });
      }

      const nonPitchers = allPlayers.filter(x => !PITCHER_POS.includes(x.player.position))
        .sort((a, b) => b.player.overall - a.player.overall);
      const pitchersAll = allPlayers.filter(x => PITCHER_POS.includes(x.player.position))
        .sort((a, b) => b.player.overall - a.player.overall);
      const freshmen = allPlayers.filter(x => x.player.eligibility === "FR")
        .sort((a, b) => b.player.overall - a.player.overall);

      const formatAward = (x: { player: any; team: any } | undefined) => x ? {
        playerName: `${x.player.firstName} ${x.player.lastName}`,
        position: x.player.position,
        teamName: x.team.name,
        teamAbbr: x.team.abbreviation,
        overall: x.player.overall,
        starRating: x.player.starRating,
      } : null;

      const awards = {
        mvp: formatAward(nonPitchers[0]),
        pitcherOfYear: formatAward(pitchersAll[0]),
        freshmanOfYear: formatAward(freshmen[0]),
      };

      let startingLineup: any[] = [];
      if (champTeam) {
        const champRoster = (await storage.getPlayersByTeam(champTeam.id))
          .sort((a, b) => b.overall - a.overall);
        const posPlayers = champRoster.filter(p => !PITCHER_POS.includes(p.position)).slice(0, 9);
        const topPitchers = champRoster.filter(p => PITCHER_POS.includes(p.position)).slice(0, 2);
        startingLineup = [
          ...posPlayers.map(p => ({
            id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position,
            eligibility: p.eligibility, overall: p.overall, starRating: p.starRating, isPitcher: false,
          })),
          ...topPitchers.map(p => ({
            id: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position,
            eligibility: p.eligibility, overall: p.overall, starRating: p.starRating, isPitcher: true,
          })),
        ];
      }

      res.json({
        leagueName: league.name,
        season,
        champion,
        runnerUp,
        cwsGames: cwsGamesList,
        cwsSeries: { championWins: cwsChampWins, runnerUpWins: cwsRunnerUpWins },
        standings: standingsList,
        awards,
        startingLineup,
      });
    } catch (error) {
      console.error("Failed to get championship screen data:", error);
      res.status(500).json({ message: "Failed to get championship screen data" });
    }
  });

  app.get("/api/leagues/:id/season-recap/:season", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const season = parseInt(req.params.season as string);
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

        const topPlayers = Array.from(roster).sort((a, b) => b.overall - a.overall).slice(0, 5).map(p => ({
          name: `${p.firstName} ${p.lastName}`, position: p.position, overall: p.overall, year: (p as any).year,
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
          freshmen: roster.filter(p => (p as any).year === 1).length,
          sophomores: roster.filter(p => (p as any).year === 2).length,
          juniors: roster.filter(p => (p as any).year === 3).length,
          seniors: roster.filter(p => (p as any).year === 4).length,
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
      const targetTeam = teamId ? leagueTeams.find(t => t.id === teamId) : null;
      if (!targetTeam) return res.status(404).json({ message: "Team not found — teamId query param required" });

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
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeague(req.params.id as string);
      const teamsMap = new Map(leagueTeams.map(t => [t.id, t]));

      const enrichSnap = (s: any) => ({
        ...s,
        teamName: teamsMap.get(s.teamId)?.name || "Unknown",
        teamAbbr: teamsMap.get(s.teamId)?.abbreviation || "???",
        teamColor: teamsMap.get(s.teamId)?.primaryColor || "#666",
        teamSecondaryColor: teamsMap.get(s.teamId)?.secondaryColor || "#333",
        isCpu: teamsMap.get(s.teamId)?.isCpu ?? true,
      });

      const seasonParam = req.query.season as string ? parseInt(req.query.season as string) : null;
      if (seasonParam !== null) {
        const snapshots = await storage.getRecruitingClassSnapshotsByLeague(req.params.id as string, seasonParam);
        return res.json({ season: seasonParam, snapshots: snapshots.map(enrichSnap) });
      }

      const allSnapshots = await storage.getRecruitingClassSnapshotsAllSeasons(req.params.id as string);
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
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const season = req.query.season as string ? parseInt(req.query.season as string) : league.currentSeason;
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
      const league = await storage.getLeague(req.params.id as string);
      if (!league) return res.status(404).json({ message: "League not found" });

      const [allRecruits, teams, storylineRows] = await Promise.all([
        storage.getRecruitsByLeague(req.params.id as string),
        storage.getTeamsByLeague(req.params.id as string),
        storage.getStorylineRecruitsByLeague(req.params.id as string, league.currentSeason),
      ]);
      const teamsMap = new Map(teams.map(t => [t.id, t]));
      const storylineRecruitIds = new Set(storylineRows.map(sl => sl.recruitId));

      const undecided = allRecruits.filter(r =>
        !r.signedTeamId && ["top3", "top5", "verbal"].includes(r.stage || "open")
      );

      // Build NIL remaining map from teams for resolver canAfford checks
      const nilRemainingMap = new Map(teams.map(t => [t.id, (t.nilBudget || 0) - (t.nilSpent || 0)]));

      const previewRecruits = await Promise.all(undecided.map(async (recruit) => {
        const interests = await storage.getRecruitingInterestsByRecruit(recruit.id);
        // Sort all positive-interest entries by interest level descending
        const allSortedInterests = interests
          .filter(i => (i.interestLevel || 0) > 0)
          .sort((a, b) => (b.interestLevel || 0) - (a.interestLevel || 0));
        // Show top 2 contenders for the schools display
        const topInterests = allSortedInterests.slice(0, 2).map(i => ({
          teamId: i.teamId,
          teamName: teamsMap.get(i.teamId)?.name || "Unknown",
          teamAbbr: teamsMap.get(i.teamId)?.abbreviation || "???",
          primaryColor: teamsMap.get(i.teamId)?.primaryColor || "#888",
          interestLevel: i.interestLevel || 0,
          hasOffer: i.hasOffer || false,
        }));
        // Use canonical resolver for committingTo — same logic as updateRecruitStages/finalizeSigningDay
        const resolution = resolveRecruitSigningWinner(
          { id: recruit.id, starRating: recruit.starRating || 3, isBlueChip: recruit.isBlueChip ?? false, nilCost: recruit.nilCost ?? 0 },
          interests.map(i => ({ teamId: i.teamId, interestLevel: i.interestLevel, hasOffer: i.hasOffer ?? false })),
          teamsMap,
          (teamId, cost) => (nilRemainingMap.get(teamId) ?? 0) >= cost,
        );
        const committingToTeamId = resolution.winnerTeamId;
        const committingTo = committingToTeamId ? {
          teamId: committingToTeamId,
          teamName: teamsMap.get(committingToTeamId)?.name || "Unknown",
          teamAbbr: teamsMap.get(committingToTeamId)?.abbreviation || "???",
          primaryColor: teamsMap.get(committingToTeamId)?.primaryColor || "#888",
          interestLevel: resolution.winnerScore ?? 0,
          hasOffer: true,
        } : null;
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
      const season = req.query.season as string ? parseInt(req.query.season as string) : undefined;

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
      const uniqueTeamIds = Array.from(new Set(unscoredRows.map(r => r.teamId).filter(Boolean) as string[]));
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

}
