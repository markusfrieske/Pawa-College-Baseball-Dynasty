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

/** Generate all 8 SR series records and G1 games. Idempotent. */
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

  // Idempotency: skip only if all expected series already exist (not on partial writes)
  const existingSeries = await storage.getPostseasonSeriesByLeague(leagueId, season, "super_regionals");
  if (existingSeries.length >= pairs.length) return; // fully generated

  for (const pair of pairs) {
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
    g => g.phase === "super_regionals" && g.season === season && g.bracketType === "bof3"
  );
  const allSeries = await storage.getPostseasonSeriesByLeague(leagueId, season, "super_regionals");

  if (allSeries.length === 0) return { done: false, winners: [] };

  const winners: string[] = [];
  let anyPending = false;

  for (const series of allSeries) {
    const seriesIndex = series.round ?? parseInt((series.bracketSlot ?? "SR1").replace("SR", ""));
    const seriesGames = srGames
      .filter(g => g.bracketRound === seriesIndex)
      .sort((a, b) => (a.bracketSide ?? "G1").localeCompare(b.bracketSide ?? "G1"));

    // Count wins from completed games
    let homeWins = 0;
    let awayWins = 0;
    for (const g of seriesGames) {
      if (!g.isComplete) continue;
      if ((g.homeScore ?? 0) > (g.awayScore ?? 0)) homeWins++;
      else awayWins++;
    }

    const homeId = series.homeTeamId ?? "";
    const awayId = series.awayTeamId ?? "";
    const winnerId = homeWins >= 2 ? homeId : awayWins >= 2 ? awayId : undefined;

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
    const completedCount = seriesGames.filter(g => g.isComplete).length;
    const hasIncomplete = seriesGames.some(g => !g.isComplete);
    if (hasIncomplete) continue; // still waiting for current game

    const nextGameNum = completedCount + 1;
    if (nextGameNum > 3) continue; // shouldn't happen

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
      bracketSide: `G${nextGameNum}`,
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
