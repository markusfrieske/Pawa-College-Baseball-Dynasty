/**
 * Full Season CWS: two 4-team double-elimination brackets → best-of-3 final.
 *
 * 8 SR winners seeded 1-8 by national seed order.
 * Bracket A: CWS seeds 1, 4, 5, 8
 * Bracket B: CWS seeds 2, 3, 6, 7
 *
 * True 4-team double-elimination per bracket:
 *   WBR1:  (s1 vs s4), (s2 vs s3)   [phase: "cws_opening"]
 *   WBR2:  WBR1 winners meet         [phase: "cws_winners"]
 *   LBR1:  WBR1 losers meet          [phase: "cws_elimination"]
 *   LBR2:  WBR2 loser vs LBR1 winner [phase: "cws_elimination"]
 *   BF1:   WBR2 winner vs LBR2 winner [phase: "cws_bracket_final"]
 *   BF2:   if LB team wins BF1 (if-necessary) [phase: "cws_bracket_final"]
 *   → Bracket champion advances to CWS Final
 *
 * CWS Final: best-of-3 between Bracket A and Bracket B champions ["cws_finals"]
 *
 * Canonical phase step values (set on league.currentPhaseStep):
 *   cws_opening      — WBR1 games active
 *   cws_winners      — WBR2 games created
 *   cws_elimination  — LBR rounds created
 *   cws_bracket_final — BF game(s) created
 *   cws_finals       — CWS Final active
 *   cws_complete     — champion determined
 *
 * Series persistence:
 *   All bracket matchups are tracked in postseason_series (stage="cws_bracket")
 *   using bracketSlot values: "A_WBR1a", "A_WBR1b", "A_WBR2", "A_LBR1",
 *   "A_LBR2", "A_BF1", "A_BF2", "B_WBR1a", etc.
 */
import { storage } from "../../storage";
import { assignCWSBracketLanes } from "./selection";

type BracketId = "A" | "B";

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

function winner(g: AnyGame): string {
  return (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
}
function loser(g: AnyGame): string {
  return (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.awayTeamId : g.homeTeamId;
}

function bracketGames(games: AnyGame[], bracket: BracketId, side: "W" | "L" | "BF", round?: number) {
  const bt = `cws_${bracket}_${side}`;
  return games.filter(g => g.bracketType === bt && (round === undefined || g.bracketRound === round));
}

function allDone(games: { isComplete: boolean }[]): boolean {
  return games.length > 0 && games.every(g => g.isComplete);
}

// ── Series persistence helpers ──────────────────────────────────────────────

async function upsertCWSBracketSeries(
  leagueId: string,
  season: number,
  slot: string,
  homeTeamId: string,
  awayTeamId: string,
  homeWins: number,
  awayWins: number,
  isComplete: boolean,
  winnerId?: string
): Promise<void> {
  const allSeries = await storage.getPostseasonSeriesByLeague(leagueId, season, "cws_bracket");
  const existing = allSeries.find(s => s.bracketSlot === slot);

  const status = isComplete ? "complete" : homeWins + awayWins > 0 ? "in_progress" : "pending";

  if (!existing) {
    await storage.createPostseasonSeries({
      leagueId,
      season,
      stage: "cws_bracket",
      bracketSlot: slot,
      homeTeamId,
      awayTeamId,
      bestOf: 1,
      homeWins,
      awayWins,
      seriesStatus: status,
      isComplete: isComplete || undefined,
      winnerId: winnerId,
      round: 0,
    });
  } else if (
    isComplete !== !!existing.isComplete ||
    existing.homeWins !== homeWins ||
    existing.awayWins !== awayWins
  ) {
    await storage.updatePostseasonSeries(existing.id, {
      homeWins,
      awayWins,
      seriesStatus: status,
      isComplete: isComplete || undefined,
      winnerId: winnerId,
    });
  }
}

/** Sync all CWS bracket series from completed game data. Called each advance step. */
async function syncCWSBracketSeriesFromGames(
  leagueId: string,
  season: number,
  allGames: AnyGame[]
): Promise<void> {
  const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season);
  const bracketTypes: Array<{ bt: string; slot: string }> = [];

  for (const br of ["A", "B"] as BracketId[]) {
    bracketTypes.push(
      { bt: `cws_${br}_W_1a`, slot: `${br}_WBR1a` },
      { bt: `cws_${br}_W_1b`, slot: `${br}_WBR1b` },
      { bt: `cws_${br}_W_2`, slot: `${br}_WBR2` },
      { bt: `cws_${br}_L_1`, slot: `${br}_LBR1` },
      { bt: `cws_${br}_L_2`, slot: `${br}_LBR2` },
      { bt: `cws_${br}_BF_1`, slot: `${br}_BF1` },
      { bt: `cws_${br}_BF_2`, slot: `${br}_BF2` },
    );
  }

  // Match games to slots using bracketType + bracketRound + bracketSide
  for (const br of ["A", "B"] as BracketId[]) {
    const matchSlot = (bt: string, round: number | null, side?: string | null): string | null => {
      if (bt === `cws_${br}_W`) {
        if (round === 1 && side === "WBR1a") return `${br}_WBR1a`;
        if (round === 1 && side === "WBR1b") return `${br}_WBR1b`;
        if (round === 1) return `${br}_WBR1a`; // fallback for legacy
        if (round === 2) return `${br}_WBR2`;
      }
      if (bt === `cws_${br}_L`) {
        if (round === 1) return `${br}_LBR1`;
        if (round === 2) return `${br}_LBR2`;
      }
      if (bt === `cws_${br}_BF`) {
        if (round === 1) return `${br}_BF1`;
        if (round === 2) return `${br}_BF2`;
      }
      return null;
    };

    for (const g of cwsGames) {
      if (!g.bracketType?.startsWith(`cws_${br}_`)) continue;
      const slot = matchSlot(g.bracketType, g.bracketRound, g.bracketSide);
      if (!slot) continue;

      const isComplete = g.isComplete;
      const homeWins = isComplete && (g.homeScore ?? 0) > (g.awayScore ?? 0) ? 1 : 0;
      const awayWins = isComplete && (g.awayScore ?? 0) > (g.homeScore ?? 0) ? 1 : 0;
      const winnerId = isComplete ? winner(g) : undefined;

      await upsertCWSBracketSeries(
        leagueId, season, slot,
        g.homeTeamId, g.awayTeamId,
        homeWins, awayWins, isComplete, winnerId
      );
    }
  }
}

// ── Bracket initialization ──────────────────────────────────────────────────

/**
 * Initialize CWS brackets. Creates WBR1 games + series records for both brackets.
 * Idempotent: no-ops if games already exist for this season.
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
      await upsertCWSBracketSeries(leagueId, season, `${bracket}_WBR1a`, t1, t4, 0, 0, false);
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
      await upsertCWSBracketSeries(leagueId, season, `${bracket}_WBR1b`, t2, t3, 0, 0, false);
    }
  }

  await storage.updateLeague(leagueId, { currentPhaseStep: "cws_opening" });
}

// ── Main advance entry point ────────────────────────────────────────────────

/**
 * Called after each simulation of CWS games.
 * Syncs series state, creates next-round games, advances the bracket.
 * Returns { done, champion, runnerUp } when CWS final is decided.
 */
export async function advanceFSCWSBracket(
  leagueId: string,
  season: number
): Promise<{ done: boolean; champion?: string; runnerUp?: string }> {
  const allGames = (await storage.getGamesByLeague(leagueId)).filter(
    g => g.phase === "cws" && g.season === season
  ) as AnyGame[];

  // Sync all bracket series from completed game data
  await syncCWSBracketSeriesFromGames(leagueId, season, allGames);

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
    await storage.upsertCWSFinalSeries(leagueId, season, bracketChamps.A, bracketChamps.B);
    await storage.updateLeague(leagueId, { currentPhaseStep: "cws_finals" });
    return { done: false };
  }

  // Advance CWS final series (best-of-3)
  if (finalGames.length > 0 && bracketChamps.A && bracketChamps.B) {
    const champA = bracketChamps.A;
    const champB = bracketChamps.B;
    const completed = finalGames.filter(g => g.isComplete);
    const hasIncomplete = finalGames.some(g => !g.isComplete);

    let winsA = 0, winsB = 0;
    for (const g of completed) {
      const w = winner(g);
      if (w === champA) winsA++;
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

// ── Single bracket DE logic ─────────────────────────────────────────────────

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

  // True double-elimination: BF1 + optional BF2 (if-necessary)
  if (allDone(bf1)) {
    const bf1Winner = winner(bf1[0]);
    // WB champion is the WBR2 winner
    const wbChamp = wbr2.length > 0 && wbr2[0].isComplete ? winner(wbr2[0]) : null;

    if (wbChamp && bf1Winner === wbChamp) {
      // WB champion wins BF1 outright → bracket champion
      return wbChamp;
    }

    // LB champion won BF1 → WB champion now has 1 loss; need if-necessary BF2
    if (bf2.length === 0 && wbChamp) {
      const lbChamp = bf1Winner; // LB team won BF1
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: wbChamp, awayTeamId: lbChamp,
        phase: "cws",
        bracketType: `cws_${bracket}_BF`,
        bracketRound: 2,
      });
      await upsertCWSBracketSeries(leagueId, season, `${bracket}_BF2`, wbChamp, lbChamp, 0, 0, false);
    }

    if (allDone(bf2)) {
      return winner(bf2[0]);
    }
    return null; // BF2 in progress or just created
  }

  // Any incomplete game in any bracket game → wait
  const allBracketGames = [...wbr1, ...wbr2, ...lbr1, ...lbr2, ...bf1, ...bf2];
  if (allBracketGames.some(g => !g.isComplete)) return null;

  // WBR1 done → create WBR2 + LBR1
  if (allDone(wbr1) && wbr2.length === 0 && lbr1.length === 0) {
    const winners1 = wbr1.map(g => winner(g));
    const losers1 = wbr1.map(g => loser(g));

    if (winners1.length >= 2) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: winners1[0], awayTeamId: winners1[1],
        phase: "cws",
        bracketType: `cws_${bracket}_W`,
        bracketRound: 2,
      });
      await upsertCWSBracketSeries(leagueId, season, `${bracket}_WBR2`, winners1[0], winners1[1], 0, 0, false);
    }
    if (losers1.length >= 2) {
      await storage.createGame({
        leagueId, season, week: 0,
        homeTeamId: losers1[0], awayTeamId: losers1[1],
        phase: "cws",
        bracketType: `cws_${bracket}_L`,
        bracketRound: 1,
      });
      await upsertCWSBracketSeries(leagueId, season, `${bracket}_LBR1`, losers1[0], losers1[1], 0, 0, false);
    }
    await storage.updateLeague(leagueId, { currentPhaseStep: "cws_winners" });
    return null;
  }

  // WBR2 + LBR1 done → create LBR2
  if (allDone(wbr2) && allDone(lbr1) && lbr2.length === 0) {
    const wbr2Loser = loser(wbr2[0]);
    const lbr1Winner = winner(lbr1[0]);
    await storage.createGame({
      leagueId, season, week: 0,
      homeTeamId: lbr1Winner, awayTeamId: wbr2Loser,
      phase: "cws",
      bracketType: `cws_${bracket}_L`,
      bracketRound: 2,
    });
    await upsertCWSBracketSeries(leagueId, season, `${bracket}_LBR2`, lbr1Winner, wbr2Loser, 0, 0, false);
    await storage.updateLeague(leagueId, { currentPhaseStep: "cws_elimination" });
    return null;
  }

  // LBR2 + WBR2 done → create bracket final (BF1)
  if (allDone(lbr2) && allDone(wbr2) && bf1.length === 0) {
    const wbr2Winner = winner(wbr2[0]);
    const lbr2Winner = winner(lbr2[0]);
    await storage.createGame({
      leagueId, season, week: 0,
      homeTeamId: wbr2Winner, awayTeamId: lbr2Winner,
      phase: "cws",
      bracketType: `cws_${bracket}_BF`,
      bracketRound: 1,
    });
    await upsertCWSBracketSeries(leagueId, season, `${bracket}_BF1`, wbr2Winner, lbr2Winner, 0, 0, false);
    await storage.updateLeague(leagueId, { currentPhaseStep: "cws_bracket_final" });
    return null;
  }

  return null;
}
