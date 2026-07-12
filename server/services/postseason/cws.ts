/**
 * Full Season CWS: two 4-team double-elimination brackets → best-of-3 final.
 *
 * 8 SR winners seeded 1-8 by national seed order.
 * Bracket A: CWS seeds 1, 4, 5, 8
 * Bracket B: CWS seeds 2, 3, 6, 7
 *
 * Each bracket (4-team DE):
 *   WBR1: (s1 vs s4), (s2 vs s3) — 2 games
 *   LBR1: (2 WBR1 losers play) — 1 game
 *   WBR2: (2 WBR1 winners play) — 1 game (WB final)
 *   LBR2: (LBR1 winner vs WBR2 loser) — 1 game
 *   BracketFinal: (WBR2 winner vs LBR2 winner) — 1 game → bracket champion
 *
 * CWS Final: best-of-3 between Bracket A and Bracket B champions.
 *
 * This module handles bracket logic and game creation only — no simulation.
 */
import { storage } from "../../storage";
import { assignCWSBracketLanes } from "./selection";

type BracketId = "A" | "B";

function w(g: { homeScore: number | null; awayScore: number | null; homeTeamId: string; awayTeamId: string }) {
  return (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
}
function l(g: { homeScore: number | null; awayScore: number | null; homeTeamId: string; awayTeamId: string }) {
  return (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.awayTeamId : g.homeTeamId;
}

function bracketGames(
  games: { bracketType: string | null; bracketRound: number | null; bracketSide?: string | null; isComplete: boolean; homeScore: number | null; awayScore: number | null; homeTeamId: string; awayTeamId: string }[],
  bracket: BracketId,
  side: "W" | "L" | "BF",
  round?: number
) {
  const bt = `cws_${bracket}_${side}`;
  return games.filter(g =>
    g.bracketType === bt && (round === undefined || g.bracketRound === round)
  );
}

function allDone(
  games: { isComplete: boolean }[]
): boolean {
  return games.length > 0 && games.every(g => g.isComplete);
}

/**
 * Initialize CWS brackets. Creates WBR1 games for both brackets.
 * srWinnersInSeedOrder: 8 winners ordered by CWS seed (index 0 = best).
 * Idempotent.
 */
export async function initializeFSCWSBrackets(
  leagueId: string,
  season: number,
  srWinnersInSeedOrder: string[]
): Promise<void> {
  const existing = (await storage.getGamesByLeague(leagueId)).filter(
    g => g.phase === "cws" && g.season === season
  );
  if (existing.length > 0) return;

  const [s1, s2, s3, s4, s5, s6, s7, s8] = srWinnersInSeedOrder;
  // Bracket A: seeds 1,4,5,8; Bracket B: 2,3,6,7
  const aTeams = [s1, s4, s5, s8].filter(Boolean);
  const bTeams = [s2, s3, s6, s7].filter(Boolean);

  const cwsSeedOrder = srWinnersInSeedOrder.map((teamId, i) => ({ teamId, cwsSeed: i + 1 }));
  await assignCWSBracketLanes(leagueId, season, cwsSeedOrder);

  for (const [bracket, teams] of [["A", aTeams], ["B", bTeams]] as [BracketId, string[]][]) {
    if (teams.length < 2) continue;
    const [t1, t2, t3, t4] = teams;

    // WBR1 game 1: bracket seed 1 vs bracket seed 4
    if (t1 && t4) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: t1, awayTeamId: t4,
        phase: "cws",
        bracketType: `cws_${bracket}_W`,
        bracketRound: 1,
        bracketSide: "WBR1a",
      });
    }
    // WBR1 game 2: bracket seed 2 vs bracket seed 3
    if (t2 && t3) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: t2, awayTeamId: t3,
        phase: "cws",
        bracketType: `cws_${bracket}_W`,
        bracketRound: 1,
        bracketSide: "WBR1b",
      });
    }
  }

  await storage.updateLeague(leagueId, { currentPhaseStep: "cws_bracket_wbr1" });
}

type AnyGame = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  bracketType: string | null;
  bracketRound: number | null;
  bracketSide?: string | null;
  phase: string;
  season: number;
};

/**
 * Called after simulation of CWS games.
 * Reads completed game results, creates next games as needed.
 * Returns { done, champion, runnerUp } when CWS final is decided.
 */
export async function advanceFSCWSBracket(
  leagueId: string,
  season: number
): Promise<{ done: boolean; champion?: string; runnerUp?: string }> {
  const allGames = (await storage.getGamesByLeague(leagueId)).filter(
    g => g.phase === "cws" && g.season === season
  ) as AnyGame[];

  // Process each bracket
  const bracketChamps: Partial<Record<BracketId, string>> = {};
  for (const bracket of ["A", "B"] as BracketId[]) {
    const champ = await advanceSingleBracket(leagueId, season, bracket, allGames);
    if (champ) bracketChamps[bracket] = champ;
  }

  const finalGames = allGames.filter(g => g.bracketType === "cws_final");

  // Both bracket champs known, no final yet → start CWS final (game 1)
  if (bracketChamps.A && bracketChamps.B && finalGames.length === 0) {
    await storage.createGame({
      leagueId, season, week: 0,
      homeTeamId: bracketChamps.A, awayTeamId: bracketChamps.B,
      phase: "cws",
      bracketType: "cws_final",
      bracketRound: 1,
    });
    await storage.updateLeague(leagueId, { currentPhaseStep: "cws_finals" });
    return { done: false };
  }

  // Advance CWS final series
  if (finalGames.length > 0 && bracketChamps.A && bracketChamps.B) {
    const champA = bracketChamps.A;
    const champB = bracketChamps.B;
    const completed = finalGames.filter(g => g.isComplete);
    const hasIncomplete = finalGames.some(g => !g.isComplete);

    let winsA = 0, winsB = 0;
    for (const g of completed) {
      const winner = w(g);
      if (winner === champA) winsA++;
      else winsB++;
    }

    if (winsA >= 2) {
      await storage.updateLeague(leagueId, { currentPhaseStep: "cws_complete" });
      return { done: true, champion: champA, runnerUp: champB };
    }
    if (winsB >= 2) {
      await storage.updateLeague(leagueId, { currentPhaseStep: "cws_complete" });
      return { done: true, champion: champB, runnerUp: champA };
    }

    if (!hasIncomplete && completed.length < 3) {
      const gameNum = completed.length + 1;
      // Alternate home: game1=champA, game2=champB, game3=champA
      const homeTeamId = gameNum % 2 === 1 ? champA : champB;
      const awayTeamId = homeTeamId === champA ? champB : champA;
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId, awayTeamId,
        phase: "cws",
        bracketType: "cws_final",
        bracketRound: gameNum,
      });
    }
    return { done: false };
  }

  return { done: false };
}

async function advanceSingleBracket(
  leagueId: string,
  season: number,
  bracket: BracketId,
  allGames: AnyGame[]
): Promise<string | null> {
  const wbr1 = bracketGames(allGames, bracket, "W", 1);
  const wbr2 = bracketGames(allGames, bracket, "W", 2);
  const lbr1 = bracketGames(allGames, bracket, "L", 1);
  const lbr2 = bracketGames(allGames, bracket, "L", 2);
  const bf = bracketGames(allGames, bracket, "BF", 1);

  // Bracket final complete → return champion
  if (allDone(bf)) {
    return w(bf[0]);
  }

  // Any incomplete game → wait
  const allBracketGames = [...wbr1, ...wbr2, ...lbr1, ...lbr2, ...bf];
  if (allBracketGames.some(g => !g.isComplete)) return null;

  // WBR1 done → create WBR2 + LBR1
  if (allDone(wbr1) && wbr2.length === 0 && lbr1.length === 0) {
    const winners1 = wbr1.map(g => w(g));
    const losers1 = wbr1.map(g => l(g));

    if (winners1.length >= 2) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: winners1[0], awayTeamId: winners1[1],
        phase: "cws",
        bracketType: `cws_${bracket}_W`,
        bracketRound: 2,
      });
    }
    if (losers1.length >= 2) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: losers1[0], awayTeamId: losers1[1],
        phase: "cws",
        bracketType: `cws_${bracket}_L`,
        bracketRound: 1,
      });
    }
    return null;
  }

  // WBR2 + LBR1 done → create LBR2
  if (allDone(wbr2) && allDone(lbr1) && lbr2.length === 0) {
    const wbr2Loser = wbr2.length > 0 ? l(wbr2[0]) : null;
    const lbr1Winner = lbr1.length > 0 ? w(lbr1[0]) : null;
    if (wbr2Loser && lbr1Winner) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: lbr1Winner, awayTeamId: wbr2Loser,
        phase: "cws",
        bracketType: `cws_${bracket}_L`,
        bracketRound: 2,
      });
    }
    return null;
  }

  // LBR2 + WBR2 done → create bracket final
  if (allDone(lbr2) && allDone(wbr2) && bf.length === 0) {
    const wbr2Winner = wbr2.length > 0 ? w(wbr2[0]) : null;
    const lbr2Winner = lbr2.length > 0 ? w(lbr2[0]) : null;
    if (wbr2Winner && lbr2Winner) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: wbr2Winner, awayTeamId: lbr2Winner,
        phase: "cws",
        bracketType: `cws_${bracket}_BF`,
        bracketRound: 1,
      });
      await storage.updateLeague(leagueId, {
        currentPhaseStep: `cws_bracket_${bracket.toLowerCase()}_final`
      });
    }
    return null;
  }

  return null;
}
