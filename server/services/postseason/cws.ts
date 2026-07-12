/**
 * Full Season CWS: two 4-team double-elimination brackets → best-of-3 final.
 *
 * 8 SR winners seeded 1-8 by national seed order.
 * Bracket A: CWS seeds 1, 4, 5, 8
 * Bracket B: CWS seeds 2, 3, 6, 7
 *
 * True 4-team double-elimination per bracket:
 *   WBR1:  (s1 vs s4), (s2 vs s3)   [2 games — "cws_opening"]
 *   WBR2:  WBR1 winners meet         [1 game — "cws_winners"]
 *   LBR1:  WBR1 losers meet          [1 game — "cws_elimination"]
 *   LBR2:  WBR2 loser vs LBR1 winner [1 game — "cws_elimination"]
 *   BF1:   WBR2 winner vs LBR2 winner [1 game — "cws_bracket_final"]
 *   BF2:   IF BF1 won by LBR2 winner, play again [1 game — "cws_bracket_final"]
 *   → Bracket champion (must lose twice to be eliminated from CWS before champion)
 *
 * CWS Final: best-of-3 between Bracket A and Bracket B champions. ["cws_finals"]
 *
 * Phase step canonical values (set on league.currentPhaseStep):
 *   cws_opening      — WBR1 active
 *   cws_winners      — WBR2 created
 *   cws_elimination  — LBR rounds created
 *   cws_bracket_final — BF game(s) created
 *   cws_finals       — CWS Final active
 *   cws_complete     — champion determined
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
  games: AnyGame[],
  bracket: BracketId,
  side: "W" | "L" | "BF",
  round?: number
) {
  const bt = `cws_${bracket}_${side}`;
  return games.filter(g =>
    g.bracketType === bt && (round === undefined || g.bracketRound === round)
  );
}

function allDone(games: { isComplete: boolean }[]): boolean {
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

  await storage.updateLeague(leagueId, { currentPhaseStep: "cws_opening" });
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
    // Persist series record for the CWS final
    await storage.upsertCWSFinalSeries(leagueId, season, bracketChamps.A, bracketChamps.B);
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
  const bf1 = bracketGames(allGames, bracket, "BF", 1);
  const bf2 = bracketGames(allGames, bracket, "BF", 2);

  // True double-elimination: bracket final BF1 + optional BF2
  // BF2 exists if LB winner won BF1 (WB winner now has 1 loss — must play again)
  if (allDone(bf1)) {
    const bf1Winner = w(bf1[0]);
    // Identify WB champion (won WBR2)
    const wbChamp = wbr2.length > 0 && wbr2[0].isComplete ? w(wbr2[0]) : null;

    if (wbChamp && bf1Winner === wbChamp) {
      // WB champion won BF1 outright → bracket champion
      return wbChamp;
    }

    // LB champion won BF1 → WB champion has 1 loss now, need BF2
    if (bf2.length === 0) {
      const lbChamp = wbChamp ? (bf1Winner === wbChamp ? null : bf1Winner) : bf1Winner;
      if (wbChamp && lbChamp) {
        await storage.createGame({
          leagueId, season, week: 0,
          homeTeamId: wbChamp, awayTeamId: lbChamp,
          phase: "cws",
          bracketType: `cws_${bracket}_BF`,
          bracketRound: 2,
        });
      }
      return null;
    }

    if (allDone(bf2)) {
      return w(bf2[0]);
    }
    return null; // BF2 in progress
  }

  // Any incomplete game → wait
  const allBracketGames = [...wbr1, ...wbr2, ...lbr1, ...lbr2, ...bf1, ...bf2];
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
    await storage.updateLeague(leagueId, { currentPhaseStep: "cws_winners" });
    return null;
  }

  // WBR2 + LBR1 done → create LBR2
  if (allDone(wbr2) && allDone(lbr1) && lbr2.length === 0) {
    const wbr2Loser = l(wbr2[0]);
    const lbr1Winner = w(lbr1[0]);
    await storage.createGame({
      leagueId, season, week: 0,
      homeTeamId: lbr1Winner, awayTeamId: wbr2Loser,
      phase: "cws",
      bracketType: `cws_${bracket}_L`,
      bracketRound: 2,
    });
    await storage.updateLeague(leagueId, { currentPhaseStep: "cws_elimination" });
    return null;
  }

  // LBR2 + WBR2 done → create bracket final (BF1)
  if (allDone(lbr2) && allDone(wbr2) && bf1.length === 0) {
    const wbr2Winner = w(wbr2[0]);
    const lbr2Winner = w(lbr2[0]);
    await storage.createGame({
      leagueId, season, week: 0,
      homeTeamId: wbr2Winner, awayTeamId: lbr2Winner,
      phase: "cws",
      bracketType: `cws_${bracket}_BF`,
      bracketRound: 1,
    });
    await storage.updateLeague(leagueId, { currentPhaseStep: "cws_bracket_final" });
    return null;
  }

  return null;
}
