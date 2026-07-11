// Canonical signing winner resolver — single source of truth for both
// `finalizeSigningDay` (auto-commit) and the manual /sign route.
//
// Rules (in priority order):
//   1. Team must have extended a scholarship offer (hasOffer)
//   2. Team's interest must meet the star/prestige-adjusted threshold
//   3. Team must be able to afford the NIL cost (canAfford callback)
//   4. Winner = highest interest score among eligible teams
//   5. Deterministic tiebreak: alphabetical team name

import { calculateSignInterestThreshold } from "./route-helpers";

export interface SigningTeamEntry {
  teamId: string;
  teamName: string;
  interestScore: number;
  hasOffer: boolean;
  metThreshold: boolean;
  nilAffordable: boolean;
  threshold: number;
}

export type SigningReason =
  | "resolved"
  | "no_eligible_teams"
  | "no_interests";

export interface SigningResolution {
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  winnerScore: number | null;
  runnerUpTeamId: string | null;
  runnerUpTeamName: string | null;
  runnerUpScore: number | null;
  wonBy: number | null;
  eligibleTeams: SigningTeamEntry[];
  allEntries: SigningTeamEntry[];
  reason: SigningReason;
}

export interface ResolverTeam {
  id: string;
  name: string;
  prestige?: number | null;
}

export interface ResolverInterest {
  teamId: string;
  interestLevel: number | null;
  hasOffer?: boolean | null;
}

export interface ResolverRecruit {
  id: string;
  starRating: number;
  isBlueChip?: boolean | null;
  nilCost?: number | null;
  recruitType?: string | null;
}

/**
 * Resolves the signing winner for a single recruit.
 *
 * @param recruit      Recruit record (must have starRating, isBlueChip, nilCost)
 * @param interests    All recruiting_interests rows for this recruit
 * @param teamMap      Map of teamId → team record (for name + prestige)
 * @param canAfford    Callback: returns true if the team can pay nilCost
 */
export function resolveRecruitSigningWinner(
  recruit: ResolverRecruit,
  interests: ResolverInterest[],
  teamMap: Map<string, ResolverTeam>,
  canAfford: (teamId: string, cost: number) => boolean,
): SigningResolution {
  const nilCost = recruit.nilCost ?? 0;
  const isStoryline = recruit.recruitType === "STORYLINE";

  if (interests.length === 0) {
    return {
      winnerTeamId: null,
      winnerTeamName: null,
      winnerScore: null,
      runnerUpTeamId: null,
      runnerUpTeamName: null,
      runnerUpScore: null,
      wonBy: null,
      eligibleTeams: [],
      allEntries: [],
      reason: "no_interests",
    };
  }

  const allEntries: SigningTeamEntry[] = interests
    .filter(i => (i.interestLevel ?? 0) > 0)
    .map(i => {
      const team = teamMap.get(i.teamId);
      const prestige = team?.prestige ?? 5;
      const threshold = calculateSignInterestThreshold(
        recruit.starRating,
        !!recruit.isBlueChip,
        isStoryline,
        prestige,
      );
      const score = i.interestLevel ?? 0;
      return {
        teamId: i.teamId,
        teamName: team?.name ?? i.teamId,
        interestScore: score,
        hasOffer: !!i.hasOffer,
        metThreshold: score >= threshold,
        nilAffordable: canAfford(i.teamId, nilCost),
        threshold,
      };
    });

  // Eligible = has offer + meets threshold + can afford NIL
  const eligible = allEntries
    .filter(e => e.hasOffer && e.metThreshold && e.nilAffordable)
    .sort((a, b) => {
      const diff = b.interestScore - a.interestScore;
      if (diff !== 0) return diff;
      return a.teamName.localeCompare(b.teamName);
    });

  if (eligible.length === 0) {
    return {
      winnerTeamId: null,
      winnerTeamName: null,
      winnerScore: null,
      runnerUpTeamId: null,
      runnerUpTeamName: null,
      runnerUpScore: null,
      wonBy: null,
      eligibleTeams: [],
      allEntries,
      reason: "no_eligible_teams",
    };
  }

  const winner = eligible[0];
  const runnerUp = eligible[1] ?? null;

  return {
    winnerTeamId: winner.teamId,
    winnerTeamName: winner.teamName,
    winnerScore: winner.interestScore,
    runnerUpTeamId: runnerUp?.teamId ?? null,
    runnerUpTeamName: runnerUp?.teamName ?? null,
    runnerUpScore: runnerUp?.interestScore ?? null,
    wonBy: runnerUp != null ? winner.interestScore - runnerUp.interestScore : null,
    eligibleTeams: eligible,
    allEntries,
    reason: "resolved",
  };
}
