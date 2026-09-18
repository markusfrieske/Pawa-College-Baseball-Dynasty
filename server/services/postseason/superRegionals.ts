/**
 * Full Season Super Regionals: 8 best-of-3 series.
 * Seeding: 1v16, 2v15, 3v14, 4v13, 5v12, 6v11, 7v10, 8v9
 * Higher seed (lower number) hosts games 1 and 3; lower seed hosts game 2.
 * Series stops when one team reaches 2 wins.
 *
 * This module only handles bracket logic and game creation — no simulation.
 * Simulation is done by the caller (advance-week handler in simulation.ts).
 */
import { storage } from "../../storage";
import type { Game, PostseasonSeries } from "@shared/schema";

export class SuperRegionalReconciliationRequired extends Error {}

function observeSeries(series: PostseasonSeries, games: Game[]) {
  const homeId = series.homeTeamId;
  const awayId = series.awayTeamId;
  const fail = () => { throw new SuperRegionalReconciliationRequired(`Super Regional ${series.bracketSlot} needs reconciliation: its games or recorded outcome are inconsistent. Existing results are unchanged.`); };
  if (!homeId || !awayId || homeId === awayId || series.bestOf !== 3) fail();
  const sorted = [...games].sort((a, b) => (a.bracketSide ?? "").localeCompare(b.bracketSide ?? ""));
  let homeWins = 0, awayWins = 0;
  let pending = false;
  for (const [index, game] of sorted.entries()) {
    const num = index + 1;
    if (num > 3 || game.bracketSide !== `G${num}` || pending || homeWins >= 2 || awayWins >= 2) fail();
    if (game.homeTeamId !== (num === 2 ? awayId : homeId) || game.awayTeamId !== (num === 2 ? homeId : awayId)) fail();
    if (!game.isComplete) { pending = true; continue; }
    const hs = game.homeScore, as = game.awayScore;
    if (hs === null || as === null || !Number.isSafeInteger(hs) || !Number.isSafeInteger(as) || hs < 0 || as < 0 || hs === as) fail();
    const winnerId = hs! > as! ? game.homeTeamId : game.awayTeamId;
    if (winnerId === homeId) homeWins++; else awayWins++;
  }
  const winnerId = homeWins === 2 ? homeId : awayWins === 2 ? awayId : null;
  // Completed legacy outcomes may already have CWS games/awards downstream.
  // Never silently rewrite that history when recomputation contradicts it.
  if (series.seriesStatus === "complete" || series.isComplete || series.winnerId) {
    if (!winnerId || series.seriesStatus !== "complete" || !series.isComplete || series.winnerId !== winnerId || series.homeWins !== homeWins || series.awayWins !== awayWins) fail();
  }
  return { series, homeId: homeId!, awayId: awayId!, homeWins, awayWins, winnerId, pending, nextGameNum: sorted.length + 1 };
}

function getSRPairs(
  entries: { nationalSeed: number; teamId: string }[]
): Array<{ slot: string; seriesIndex: number; homeTeamId: string; awayTeamId: string }> {
  const sorted = [...entries].sort((a, b) => a.nationalSeed - b.nationalSeed);
  const top16 = sorted.slice(0, 16);
  const pairs = [];
  for (let i = 0; i < 8; i++) {
    const high = top16[i];
    const low = top16[15 - i];
    if (!high || !low) continue;
    const seriesIndex = i + 1; // 1-8
    pairs.push({
      slot: `SR${seriesIndex}`,
      seriesIndex,
      homeTeamId: high.teamId,
      awayTeamId: low.teamId,
    });
  }
  return pairs;
}

/**
 * Generate all 8 SR series records and G1 games.
 * Idempotent: checks each series and G1 game individually before inserting,
 * so a partial prior run is safely backfilled on retry.
 */
export async function generateFSSuperRegionals(
  leagueId: string,
  season: number
): Promise<void> {
  const entries = await storage.getPostseasonEntriesByLeague(leagueId, season);
  const seeded = entries
    .filter(e => e.nationalSeed != null)
    .map(e => ({ nationalSeed: e.nationalSeed!, teamId: e.teamId }));

  if (seeded.length < 2) {
    console.warn(`[fs-sr] generateFSSuperRegionals: only ${seeded.length} seeded entries`);
    return;
  }

  const pairs = getSRPairs(seeded);

  // Fetch existing series + games once up front for O(n) lookup
  const existingSeries = await storage.getPostseasonSeriesByLeague(leagueId, season, "super_regionals");
  const allGames = await storage.getGamesByLeague(leagueId);
  const srGames = allGames.filter(
    (g: any) => g.phase === "super_regionals" && g.season === season && g.bracketType === "bof3"
  );

  for (const pair of pairs) {
    // Per-series idempotency: only create if this slot doesn't exist yet
    const seriesExists = existingSeries.some(s => s.bracketSlot === pair.slot);
    if (!seriesExists) {
      await storage.createPostseasonSeries({
        leagueId,
        season,
        stage: "super_regionals",
        bracketSlot: pair.slot,
        homeTeamId: pair.homeTeamId,
        awayTeamId: pair.awayTeamId,
        bestOf: 3,
        homeWins: 0,
        awayWins: 0,
        seriesStatus: "pending",
        round: pair.seriesIndex,
      });
    }

    // Per-game idempotency: only create G1 if no game exists for this seriesIndex+G1
    const g1Exists = srGames.some(
      (g: any) => g.bracketRound === pair.seriesIndex && g.bracketSide === "G1"
    );
    if (!g1Exists) {
      await storage.createGame({
        leagueId,
        season,
        week: 0,
        homeTeamId: pair.homeTeamId,
        awayTeamId: pair.awayTeamId,
        phase: "super_regionals",
        bracketType: "bof3",
        bracketRound: pair.seriesIndex,
        bracketSide: "G1",
      });
    }
  }
}

/**
 * Called after simulation of SR games.
 * Reads completed game results, updates series win totals,
 * creates next game in each series if needed.
 * Returns { done: true, winners } when all 8 series are complete.
 */
export async function advanceFSSRBracket(
  leagueId: string,
  season: number
): Promise<{ done: boolean; winners: string[] }> {
  const allGames = await storage.getGamesByLeague(leagueId);
  const srGames = allGames.filter(
    g => g.phase === "super_regionals" && g.season === season
  );
  const allSeries = await storage.getPostseasonSeriesByLeague(leagueId, season, "super_regionals");

  if (allSeries.length === 0 && srGames.length === 0) return { done: false, winners: [] };

  // Validate the whole bracket before changing any series. Missing/duplicate
  // slots and foreign games must not produce a partial or false set of winners.
  const teamIds = new Set<string>();
  const leagueTeamIds = new Set((await storage.getTeamsByLeague(leagueId)).map(t => t.id));
  const indices = new Set<number>();
  const plans = allSeries.map(series => {
    const index = series.round;
    if (!index || index < 1 || index > 8 || series.bracketSlot !== `SR${index}` || indices.has(index)
      || !series.homeTeamId || !series.awayTeamId || teamIds.has(series.homeTeamId) || teamIds.has(series.awayTeamId)
      || !leagueTeamIds.has(series.homeTeamId) || !leagueTeamIds.has(series.awayTeamId)) {
      throw new SuperRegionalReconciliationRequired("Super Regional bracket slots or participants need reconciliation before advancing.");
    }
    indices.add(index); teamIds.add(series.homeTeamId); teamIds.add(series.awayTeamId);
    return observeSeries(series, srGames.filter(g => g.bracketRound === index));
  });
  if (plans.length !== 8 || srGames.some(g => g.bracketType !== "bof3" || !g.bracketRound || !indices.has(g.bracketRound))) {
    throw new SuperRegionalReconciliationRequired("The full-season Super Regional bracket must contain eight valid series before advancing.");
  }

  const winners: string[] = [];
  let anyPending = false;

  for (const { series, homeId, awayId, homeWins, awayWins, winnerId, pending, nextGameNum } of plans) {
    const seriesIndex = series.round!;

    if (winnerId) {
      if (series.seriesStatus !== "complete") {
        await storage.updatePostseasonSeries(series.id, {
          homeWins,
          awayWins,
          seriesStatus: "complete",
          isComplete: true,
          winnerId,
        });
      }
      winners.push(winnerId);
      continue;
    }

    anyPending = true;
    if (series.seriesStatus !== "in_progress" || series.homeWins !== homeWins || series.awayWins !== awayWins) {
      await storage.updatePostseasonSeries(series.id, {
        homeWins,
        awayWins,
        seriesStatus: "in_progress",
      });
    }

    // Should we create the next game?
    if (pending) continue; // still waiting for current game
    if (nextGameNum > 3) continue; // shouldn't happen

    // Check if next game already exists (idempotent)
    const nextSide = `G${nextGameNum}`;
    const nextGameExists = srGames.some(
      (g: any) => g.bracketRound === seriesIndex && g.bracketSide === nextSide
    );
    if (nextGameExists) continue;

    // G1: home = highSeed, G2: home = lowSeed, G3: home = highSeed
    const homeTeamId = nextGameNum === 2 ? awayId : homeId;
    const awayTeamId = nextGameNum === 2 ? homeId : awayId;
    await storage.createGame({
      leagueId,
      season,
      week: 0,
      homeTeamId,
      awayTeamId,
      phase: "super_regionals",
      bracketType: "bof3",
      bracketRound: seriesIndex,
      bracketSide: nextSide,
    });
  }

  if (!anyPending) {
    const finalSeries = await storage.getPostseasonSeriesByLeague(leagueId, season, "super_regionals");
    const allComplete = finalSeries.every(s => s.seriesStatus === "complete");
    const finalWinners = finalSeries.map(s => s.winnerId).filter(Boolean) as string[];
    if (allComplete) return { done: true, winners: finalWinners };
  }

  return { done: false, winners };
}
