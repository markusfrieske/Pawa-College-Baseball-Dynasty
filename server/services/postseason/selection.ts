/**
 * National field selection for Full Season postseason.
 * - 12 automatic bids (conference champions, one per conference)
 * - 4 at-large bids (highest selection score among non-champions)
 * - All 16 seeded by selection score
 * - Results stored idempotently in postseason_entries
 */
import { storage } from "../../storage";
import type { PostseasonEntry } from "../../../shared/schema";

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
  // Idempotency: if entries already exist for this league/season, return them
  const existing = await storage.getPostseasonEntriesByLeague(leagueId, season);
  if (existing.length >= 16) {
    return existing;
  }

  const allGames = await storage.getGamesByLeague(leagueId);
  const leagueTeams = await storage.getTeamsByLeague(leagueId);
  const standingsList = await storage.getStandingsByLeague(leagueId, season);

  // Determine conference champions from completed CC games
  const ccGames = allGames.filter(
    g => g.phase === "conference_championship" && g.season === season && g.isComplete
  );
  const confChampionIds = new Set(
    ccGames.map(g => (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId)
  );

  // Score all teams
  const scoredTeams = leagueTeams.map(t => {
    const s = standingsList.find(st => st.teamId === t.id);
    const wins = s?.wins ?? 0;
    const losses = s?.losses ?? 0;
    const confWins = s?.conferenceWins ?? 0;
    const confLosses = s?.conferenceLosses ?? 0;
    const runsScored = s?.runsScored ?? 0;
    const runsAllowed = s?.runsAllowed ?? 0;
    const score = computeSelectionScore(wins, losses, confWins, confLosses, runsScored, runsAllowed);
    const isAutoChamp = confChampionIds.has(t.id);
    return { teamId: t.id, score, wins, losses, isAutoChamp };
  });

  // Separate auto bids and at-large candidates
  const autoChamps = scoredTeams
    .filter(t => t.isAutoChamp)
    .sort((a, b) => b.score - a.score);

  const atLargeCandidates = scoredTeams
    .filter(t => !t.isAutoChamp)
    .sort((a, b) => b.score - a.score);

  // Take top 4 at-large (or fewer if not enough teams)
  const atLargeSelection = atLargeCandidates.slice(0, 4);

  // Combine and sort by score for seeding
  const allSelected = [
    ...autoChamps.map(t => ({ ...t, qualType: "auto_bid" as const })),
    ...atLargeSelection.map(t => ({ ...t, qualType: "at_large" as const })),
  ].sort((a, b) => b.score - a.score);

  // Assign national seeds 1-16
  const entries: PostseasonEntry[] = [];
  for (let i = 0; i < allSelected.length && i < 16; i++) {
    const t = allSelected[i];
    const nationalSeed = i + 1;
    // Bracket lane: seeds 1,4,5,8,9,12,13,16 → A; 2,3,6,7,10,11,14,15 → B
    // For SR 16-team: bracket assignment isn't needed yet (assigned at CWS for 8 SR winners)
    // bracketLane is filled when CWS entries are created
    const entry = await storage.upsertPostseasonEntry({
      leagueId,
      season,
      teamId: t.teamId,
      nationalSeed,
      qualificationType: t.qualType,
      selectionScore: t.score,
      selectionReason: t.qualType === "auto_bid"
        ? `Conference Champion (${(t.score * 100).toFixed(1)} sel)`
        : `At-Large #${atLargeSelection.findIndex(x => x.teamId === t.teamId) + 1} (${(t.score * 100).toFixed(1)} sel)`,
      seed: nationalSeed,
      status: "active",
    });
    entries.push(entry);
  }

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
