/**
 * Core game computation helpers shared across route modules.
 *
 * These functions were originally defined as inner functions inside
 * registerRoutes in server/routes.ts. They are extracted here so that
 * both server/routes/games.ts and the remaining simulation routes in
 * server/routes.ts can import them without circular dependencies.
 */

import { storage } from "./storage";
import type { Game } from "@shared/schema";
import type { InsertPlayerSeasonStats } from "@shared/schema";
import { GAME_TYPE_TO_DAY, ipToOuts } from "@shared/pitcherRest";

// ── Formatting helpers ────────────────────────────────────────────────────────

export function ipToDecimalRep(ip: string): number {
  const [whole, frac] = ip.split(".");
  return (parseInt(whole) || 0) + (parseInt(frac) || 0) / 3;
}

export function fmtAvg(ab: number, h: number): string {
  if (ab <= 0) return ".000";
  const v = h / ab;
  return v >= 1 ? "1.000" : v.toFixed(3).slice(1);
}

export function fmtEra(er: number, ip: string): string {
  const dec = ipToDecimalRep(ip);
  if (dec <= 0) return "--";
  return (9 * er / dec).toFixed(2);
}

export function enrichBoxData(
  raw: Record<string, unknown> | null,
  errors: number,
  fallbackR = 0,
  fallbackH = 0,
): Record<string, unknown> {
  if (!raw) {
    return { batting: [], pitching: [], totals: { ab: 0, r: fallbackR, h: fallbackH, rbi: 0, bb: 0, so: 0 }, errors };
  }
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

// ── Legacy score ─────────────────────────────────────────────────────────────

export function computeLegacyScore(coach: {
  careerWins: number;
  confChampionships: number;
  cwsAppearances: number;
  nationalChampionships: number;
  allAmericans: number;
  draftPicks: number;
}): number {
  return (
    coach.careerWins +
    coach.confChampionships * 5 +
    coach.cwsAppearances * 10 +
    coach.nationalChampionships * 20 +
    coach.allAmericans +
    coach.draftPicks
  );
}

// ── Standings update ──────────────────────────────────────────────────────────

export async function updateStandingsForGame(
  leagueId: string,
  season: number,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  isConference: boolean = false,
) {
  await storage.incrementStandingsForGame(leagueId, season, homeTeamId, awayTeamId, homeScore, awayScore, isConference);
}

// ── Player stats accumulation ─────────────────────────────────────────────────

export async function accumulatePlayerStats(
  leagueId: string,
  season: number,
  teamId: string,
  boxData: any,
  teamWon?: boolean,
) {
  // Resolve fake_ IDs by matching player name against real DB roster for this team
  const hasFakeIds =
    (boxData.batting || []).some((b: any) => b.playerId?.startsWith("fake_")) ||
    (boxData.pitching || []).some((p: any) => p.playerId?.startsWith("fake_"));

  if (hasFakeIds) {
    const teamPlayers = await storage.getPlayersByTeam(teamId);
    const nameToId = new Map<string, string>();
    for (const pl of teamPlayers) {
      nameToId.set(`${pl.firstName} ${pl.lastName}`.toLowerCase(), pl.id);
    }
    const resolve = (entry: any): any => {
      if (!entry.playerId?.startsWith("fake_")) return entry;
      const realId = nameToId.get((entry.name || "").toLowerCase());
      if (realId) return { ...entry, playerId: realId };
      console.warn(`[accumulatePlayerStats] Could not resolve fake_ ID for "${entry.name}" on team ${teamId} — skipping`);
      return { ...entry, playerId: null };
    };
    boxData = {
      ...boxData,
      batting: (boxData.batting || []).map(resolve),
      pitching: (boxData.pitching || []).map(resolve),
    };
  }

  const playerStatsMap = new Map<string, InsertPlayerSeasonStats>();

  if (boxData.batting) {
    for (const b of boxData.batting) {
      if (!b.playerId) continue;
      if (b.playerId.startsWith("fake_")) {
        console.warn(`[accumulatePlayerStats] Skipping unresolved fake_ batter ID: ${b.playerId}`);
        continue;
      }
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

  // Determine winning/losing pitcher using pitcher-of-record logic
  let winningPitcherId: string | null = null;
  let losingPitcherId: string | null = null;
  if (teamWon !== undefined && Array.isArray(boxData.pitching)) {
    if (teamWon) {
      for (const p of boxData.pitching) {
        if (!p.playerId || p.playerId.startsWith("fake_")) continue;
        winningPitcherId = p.playerId;
      }
    } else {
      let maxEr = -1;
      let firstPitcherId: string | null = null;
      for (const p of boxData.pitching) {
        if (!p.playerId || p.playerId.startsWith("fake_")) continue;
        if (firstPitcherId === null) firstPitcherId = p.playerId;
        const er = p.er || 0;
        if (er > maxEr) { maxEr = er; losingPitcherId = p.playerId; }
      }
      if (losingPitcherId === null) losingPitcherId = firstPitcherId;
    }
  }

  if (boxData.pitching) {
    for (const p of boxData.pitching) {
      if (!p.playerId) continue;
      if (p.playerId.startsWith("fake_")) {
        console.warn(`[accumulatePlayerStats] Skipping fake_ pitcher ID: ${p.playerId}`);
        continue;
      }
      const ipParts = String(p.ip).split(".");
      const fullInnings = parseInt(ipParts[0]) || 0;
      const partialOuts = Math.min(parseInt(ipParts[1]) || 0, 2);
      const totalOuts = fullInnings * 3 + partialOuts;
      const isWinPitcher = p.playerId === winningPitcherId;
      const isLossPitcher = p.playerId === losingPitcherId;
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
        if (isWinPitcher) existing.wins = 1;
        if (isLossPitcher) existing.losses = 1;
      } else {
        playerStatsMap.set(p.playerId, {
          playerId: p.playerId,
          playerName: p.name,
          teamId,
          leagueId,
          season,
          position: "P",
          games: 1,
          ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
          rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0, cs: 0,
          exitVeloTotal: 0, barrels: 0, ballsInPlay: 0, hardHits: 0,
          putouts: 0, assists: 0, fieldingErrors: 0, totalChances: 0,
          wpa: 0,
          pitchingGames: 1,
          wins: isWinPitcher ? 1 : 0,
          losses: isLossPitcher ? 1 : 0,
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

// ── Pitcher rest update ────────────────────────────────────────────────────────

export async function updatePitcherRestFromBox(
  homeBoxData: any,
  awayBoxData: any,
  game: { gameType?: string | null; week?: number | null },
  leagueCurrentWeek?: number,
) {
  const gameDay = game.gameType ? (GAME_TYPE_TO_DAY[game.gameType] ?? "midweek") : "midweek";
  const gameWeek = game.week ?? leagueCurrentWeek ?? 1;
  if (!gameDay) return;

  const updates: Array<{ id: string; lastPitchedOuts: number; lastPitchedWeek: number; lastPitchedDay: string }> = [];
  for (const boxData of [homeBoxData, awayBoxData]) {
    if (!boxData) continue;
    const pitchingArr = boxData.pitching;
    if (!Array.isArray(pitchingArr)) continue;
    for (const p of pitchingArr) {
      const pid = p.playerId as string | undefined;
      if (!pid || pid.startsWith("fake_")) continue;
      const outs = ipToOuts((p.ip as string) ?? "0.0");
      if (outs > 0) {
        updates.push({ id: pid, lastPitchedOuts: outs, lastPitchedWeek: gameWeek, lastPitchedDay: gameDay });
      }
    }
  }
  await storage.bulkUpdatePlayerRest(updates);
}

// finalizeReportedGame moved to server/game-finalizer.ts to avoid circular imports.
// Import it from there: import { finalizeReportedGame } from "./game-finalizer";

// ── Conference championships generation ──────────────────────────────────────

export async function generateConferenceChampionships(leagueId: string, season: number) {
  const confs = await storage.getConferencesByLeague(leagueId);
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  const standingsList = await storage.getStandingsByLeague(leagueId, season);

  for (const conf of confs) {
    const confTeams = leagueTeams.filter(t => t.conferenceId === conf.id);
    if (confTeams.length < 2) continue;

    const confStandings = confTeams
      .map(t => {
        const s = standingsList.find(st => st.teamId === t.id);
        return { team: t, wins: s?.wins || 0, confWins: s?.conferenceWins || 0 };
      })
      .sort((a, b) => b.confWins - a.confWins || b.wins - a.wins);

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

// ── All-American selection counter ────────────────────────────────────────────

export async function countAllAmericanSelectionsForLeague(leagueId: string): Promise<Map<string, number>> {
  const fieldingSlots = ["C", "1B", "2B", "SS", "3B", "OF", "OF", "OF"];
  const pitcherSlots = ["SP", "SP", "SP", "R", "CL"];
  const slots = [...fieldingSlots, ...pitcherSlots, "DH"];

  function selectTeamIds(pool: { id: string; overall: number; position: string; teamId: string }[]): string[] {
    const selected: string[] = [];
    const used = new Set<string>();
    const pitchers = pool
      .filter(p => p.position === "P")
      .sort((a, b) => (b.overall || 0) - (a.overall || 0));
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

  for (const tId of selectTeamIds(allPool)) inc(tId);

  for (const conf of allConfs) {
    const confTeamIds = new Set(allTeams.filter(t => t.conferenceId === conf.id).map(t => t.id));
    const confPool = allPool.filter(p => confTeamIds.has(p.teamId));
    for (const tId of selectTeamIds(confPool)) inc(tId);
  }

  return teamCounts;
}
