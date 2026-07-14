/**
 * National field selection for Full Season postseason.
 *
 * Selection rules:
 *   - Exactly 1 automatic bid per conference (conference champion).
 *     If a conference championship game is not yet completed, the auto bid
 *     falls back to the best team in that conference by conference win%.
 *   - AT_LARGE_SLOTS = TARGET_FIELD_SIZE - numConferences at-large teams,
 *     chosen from remaining teams by selection score.
 *   - All 16 seeded 1-16 by selection score (best score = seed 1).
 *
 * Minimum field: if fewer than 4 qualifying teams exist, aborts gracefully.
 * Results stored idempotently in postseason_entries.
 */
import { storage } from "../../storage";
import type { PostseasonEntry } from "../../../shared/schema";

const TARGET_FIELD_SIZE = 16;

function computeSelectionScore(
  wins: number,
  losses: number,
  confWins: number,
  confLosses: number,
  runsScored: number,
  runsAllowed: number
): number {
  const total = wins + losses;
  const confTotal = confWins + confLosses;
  const winPct = total > 0 ? wins / total : 0;
  const confWinPct = confTotal > 0 ? confWins / confTotal : 0;
  const runDiff = runsScored - runsAllowed;
  // Normalize run differential to a 0-1 scale (cap at ±200 runs)
  const rdNorm = Math.max(-1, Math.min(1, runDiff / 200)) * 0.5 + 0.5;
  return winPct * 0.6 + confWinPct * 0.3 + rdNorm * 0.1;
}

export async function selectAndSeedNationalField(
  leagueId: string,
  season: number
): Promise<PostseasonEntry[]> {
  // NOTE: do not early-return on existing.length > 0.
  // A prior call may have written partial data. upsertPostseasonEntry is
  // idempotent (ON CONFLICT), so we always run the full selection and
  // backfill any missing rows.

  const allGames = await storage.getGamesByLeague(leagueId);
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  const standingsList = await storage.getStandingsByLeague(leagueId, season);
  const confs = await storage.getConferencesByLeague(leagueId);

  if (leagueTeams.length < 4) {
    console.warn(`[fs-selection] Not enough teams (${leagueTeams.length}) to run national selection.`);
    return [];
  }

  // Build team standings lookup
  const standingsById = new Map(standingsList.map(s => [s.teamId, s]));

  const confWinPct = (teamId: string) => {
    const s = standingsById.get(teamId);
    const cw = s?.conferenceWins ?? 0;
    const cl = s?.conferenceLosses ?? 0;
    const total = cw + cl;
    return { pct: total > 0 ? cw / total : 0, diff: cw - cl, cw };
  };

  // Map conference championship winners from completed CC games
  const ccGames = allGames.filter(
    g => g.phase === "conference_championship" && g.season === season && g.isComplete
  );
  // Map: conferenceId → winning teamId (from CC game)
  const ccWinnerByConf = new Map<string, string>();
  for (const game of ccGames) {
    const winner = (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.homeTeamId : game.awayTeamId;
    const team = (leagueTeams as any[]).find(t => t.id === winner);
    if (team?.conferenceId && !ccWinnerByConf.has(team.conferenceId)) {
      ccWinnerByConf.set(team.conferenceId, winner);
    }
  }

  // Enforce EXACTLY 1 auto bid per conference.
  // Fallback: best team by conf win% if CC game incomplete.
  const autoChampIds = new Set<string>();
  const autoChampReason = new Map<string, string>(); // teamId → reason label
  for (const conf of confs) {
    if (ccWinnerByConf.has(conf.id)) {
      const tid = ccWinnerByConf.get(conf.id)!;
      autoChampIds.add(tid);
      autoChampReason.set(tid, "Conference Champion");
    } else {
      // A missing CC winner means the conference championship was not yet
      // simulated.  Throw so the phase-advance caller gets a clear error
      // instead of silently using a standings proxy.
      throw new Error(
        `[fs-selection] Cannot seed national field: conference championship ` +
        `for conference ${conf.id} has no completed game. ` +
        `Ensure all CC games are simulated before advancing to Super Regionals.`
      );
    }
  }

  // Hard invariant: log clearly if mismatch (should never happen with fallback above)
  if (autoChampIds.size !== confs.length) {
    console.error(
      `[fs-selection] INVARIANT FAILED: expected ${confs.length} auto bids but resolved ${autoChampIds.size}. ` +
      `CC games completed: ${ccGames.length}/${confs.length}`
    );
  }

  // Score ALL teams
  const scoredTeams = (leagueTeams as any[]).map(t => {
    const s = standingsById.get(t.id);
    const wins = s?.wins ?? 0;
    const losses = s?.losses ?? 0;
    const confWins = s?.conferenceWins ?? 0;
    const confLosses = s?.conferenceLosses ?? 0;
    const runsScored = s?.runsScored ?? 0;
    const runsAllowed = s?.runsAllowed ?? 0;
    const score = computeSelectionScore(wins, losses, confWins, confLosses, runsScored, runsAllowed);
    const isAuto = autoChampIds.has(t.id);
    return { teamId: t.id as string, score, wins, losses, isAuto };
  });

  // Auto-bids: exactly one per conference
  const autoTeams = scoredTeams
    .filter(t => t.isAuto)
    .sort((a, b) => b.score - a.score);

  // At-large: fill remaining spots to TARGET_FIELD_SIZE
  const atLargeNeeded = Math.max(0, TARGET_FIELD_SIZE - autoTeams.length);
  const atLargePool = scoredTeams
    .filter(t => !t.isAuto)
    .sort((a, b) => b.score - a.score);
  const atLargeSelection = atLargePool.slice(0, atLargeNeeded);

  // Combine and sort by score for seeding
  const allSelected = [
    ...autoTeams.map(t => ({ ...t, qualType: "auto_bid" as const })),
    ...atLargeSelection.map(t => ({ ...t, qualType: "at_large" as const })),
  ].sort((a, b) => b.score - a.score);

  if (allSelected.length < 4) {
    console.warn(`[fs-selection] Only ${allSelected.length} teams qualified — too few for postseason. Skipping.`);
    return [];
  }

  // Assign national seeds 1-N (up to TARGET_FIELD_SIZE)
  const entries: PostseasonEntry[] = [];
  const atLargeRank = new Map<string, number>();
  atLargeSelection.forEach((t, i) => atLargeRank.set(t.teamId, i + 1));

  for (let i = 0; i < allSelected.length; i++) {
    const t = allSelected[i];
    const nationalSeed = i + 1;
    const label = t.qualType === "auto_bid"
      ? `${autoChampReason.get(t.teamId) ?? "Conference Champion"} (${(t.score * 100).toFixed(1)} sel)`
      : `At-Large #${atLargeRank.get(t.teamId) ?? 0} (${(t.score * 100).toFixed(1)} sel)`;
    const entry = await storage.upsertPostseasonEntry({
      leagueId,
      season,
      teamId: t.teamId,
      nationalSeed,
      qualificationType: t.qualType,
      selectionScore: t.score,
      selectionReason: label,
      seed: nationalSeed,
      status: "active",
    });
    entries.push(entry);
  }

  console.log(
    `[fs-selection] Selected ${entries.length} teams: ` +
    `${autoTeams.length} auto-bids (${confs.length} expected) + ${atLargeSelection.length} at-large`
  );
  return entries;
}

export async function assignCWSBracketLanes(
  leagueId: string,
  season: number,
  cwsSeedOrder: { teamId: string; cwsSeed: number }[]
): Promise<void> {
  // Bracket A: CWS seeds 1,4,5,8; Bracket B: 2,3,6,7
  const bracketA = new Set([1, 4, 5, 8]);
  for (const { teamId, cwsSeed } of cwsSeedOrder) {
    const lane = bracketA.has(cwsSeed) ? "A" : "B";
    const existing = await storage.getPostseasonEntryByTeam(leagueId, season, teamId);
    if (existing) {
      await storage.updatePostseasonEntry(existing.id, { bracketLane: lane });
    }
  }
}
