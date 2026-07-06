import { useQuery } from "@tanstack/react-query";
import type { Player, Team } from "@shared/schema";
import type { LeagueDetails, DashboardOverview, AuctionOutcome, StorylineWidgetItem } from "./types";
import { STORYLINE_VOTE_CALLOUT_PHASES } from "./types";

const ACTIVE_LINEUP_PHASES = ["preseason", "spring_training", "regular_season", "conference_championship", "super_regionals", "cws"];

export function useLeagueViewData(leagueId: string | undefined, currentUserId: string | undefined) {
  const { data: league, isLoading } = useQuery<LeagueDetails>({
    queryKey: ["/api/leagues", leagueId],
  });

  const { data: overview } = useQuery<DashboardOverview>({
    queryKey: ["/api/leagues", leagueId, "dashboard-overview"],
    enabled: !!league && league.currentPhase !== "dynasty_setup",
    staleTime: 30_000,
  });

  const storylineActivePhase = league ? STORYLINE_VOTE_CALLOUT_PHASES.has(league.currentPhase) : false;
  const { data: storylinesNavResp } = useQuery<{ storylines: StorylineWidgetItem[] }>({
    queryKey: ["/api/leagues", leagueId, "storylines"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/storylines`, { credentials: "include" });
      if (!res.ok) return { storylines: [] };
      const json = await res.json();
      return Array.isArray(json) ? { storylines: json } : (json as { storylines: StorylineWidgetItem[] });
    },
    enabled: storylineActivePhase,
    staleTime: 60000,
  });
  const storylinePendingVotes = (storylinesNavResp?.storylines ?? []).filter(
    (s) => !!s.activeEvent && !s.myVote,
  ).length;

  const shouldCheckLineup = !!(league?.teams?.find(t => t.coach?.userId === currentUserId)) && ACTIVE_LINEUP_PHASES.includes(league?.currentPhase ?? "");

  const { data: ownRosterData } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/roster`],
    enabled: shouldCheckLineup,
    select: (data: { players: Player[]; team: Team }) => ({
      players: data.players.map((p) => ({
        position: p.position,
        battingOrder: p.battingOrder,
        pitchingRole: p.pitchingRole,
      })),
    }),
  });

  const hasAuctionResults = !!league?.lastWalkonAuction && league?.currentPhase !== "offseason_walkons";
  const auctionSeenKey = `walkon-auction-seen-${leagueId}-s${league?.currentSeason}`;
  const { data: auctionResultsData } = useQuery<{ results: AuctionOutcome[] }>({
    queryKey: ["/api/leagues", leagueId, "walkons", "auction-results"],
    enabled: hasAuctionResults && !!currentUserId,
    staleTime: Infinity,
  });

  return {
    league,
    isLoading,
    overview,
    storylinePendingVotes,
    shouldCheckLineup,
    ownRosterData,
    hasAuctionResults,
    auctionSeenKey,
    auctionResultsData,
  };
}
