import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Player } from "@shared/schema";
import { RetroCard, RetroCardHeader } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { Star } from "lucide-react";
import type { ProspectEntry, ProspectsView } from "../types";

export function ProspectsTab({ leagueId, currentSeason }: { leagueId: string; currentSeason: number }) {
  const [view, setView] = useState<ProspectsView>("combined");
  const [positionFilter, setPositionFilter] = useState<string>("All");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ hitters: ProspectEntry[]; pitchers: ProspectEntry[]; currentSeason: number }>({
    queryKey: ["/api/leagues", leagueId, "top-prospects"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/top-prospects`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch prospects");
      return res.json();
    },
  });

  const { data: selectedPlayer } = useQuery<Player>({
    queryKey: ["/api/leagues", leagueId, "players", selectedPlayerId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/players/${selectedPlayerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!selectedPlayerId,
  });

  // Season the player graduates (SR = now, JR = +1, SO = +2, FR = +3)
  const gradSeason = (eligibility: string) => {
    if (eligibility === "SR") return currentSeason;
    if (eligibility === "JR") return currentSeason + 1;
    if (eligibility === "SO") return currentSeason + 2;
    return currentSeason + 3; // FR
  };

  const baseList: ProspectEntry[] = (() => {
    if (!data) return [];
    if (view === "hitters") return data.hitters;
    if (view === "pitchers") return data.pitchers;
    return [...data.hitters, ...data.pitchers].sort((a, b) => b.overall - a.overall).slice(0, 100);
  })();

  const allPositions = ["All", ...Array.from(new Set(baseList.map(p => p.position))).sort()];

  const displayList: (ProspectEntry & { rank: number })[] = (() => {
    const filtered = positionFilter === "All" ? baseList : baseList.filter(p => p.position === positionFilter);
    return filtered.map((p, i) => ({ ...p, rank: i + 1 }));
  })();

  const eligibilityColor: Record<string, string> = {
    FR: "text-green-400",
    SO: "text-blue-400",
    JR: "text-amber-400",
    SR: "text-red-400",
  };

  const ovrColor = (ovr: number) => {
    if (ovr >= 500) return "text-gold font-bold";
    if (ovr >= 400) return "text-amber-400 font-semibold";
    if (ovr >= 300) return "text-foreground";
    return "text-muted-foreground";
  };

  // Find the team color for the selected player's card header
  const selectedProspectEntry = selectedPlayerId ? baseList.find(p => p.id === selectedPlayerId) : null;

  if (isLoading) {
    return (
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-gold" />
            Top MLB Prospects
          </div>
        </RetroCardHeader>
        <div className="space-y-2 mt-4">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </RetroCard>
    );
  }

  return (
    <>
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-gold" />
            Top MLB Prospects
          </div>
        </RetroCardHeader>
        <p className="text-[10px] text-muted-foreground mb-4">
          Players ranked by overall rating. Click a name to view their full profile. Pitchers: SP, RP, CL. Hitters: all other positions.
        </p>

        {/* View toggle */}
        <div className="flex gap-2 mb-3" data-testid="prospects-toggle">
          {(["combined", "hitters", "pitchers"] as ProspectsView[]).map(v => (
            <button
              key={v}
              onClick={() => { setView(v); setPositionFilter("All"); }}
              data-testid={`button-prospects-${v}`}
              className={`font-pixel text-[8px] px-3 py-1.5 border rounded transition-colors ${
                view === v
                  ? "bg-gold text-forest-dark border-gold"
                  : "bg-transparent text-muted-foreground border-border hover:border-gold/50 hover:text-gold"
              }`}
            >
              {v === "combined" ? "Top 100" : v === "hitters" ? "Hitters" : "Pitchers"}
            </button>
          ))}
        </div>

        {/* Position filter */}
        {allPositions.length > 2 && (
          <div className="flex flex-wrap gap-1.5 mb-4" data-testid="prospects-position-filter">
            {allPositions.map(pos => (
              <button
                key={pos}
                onClick={() => setPositionFilter(pos)}
                data-testid={`button-pos-filter-${pos}`}
                className={`font-pixel text-[7px] px-2 py-1 border rounded transition-colors ${
                  positionFilter === pos
                    ? "bg-gold/20 text-gold border-gold/60"
                    : "bg-transparent text-muted-foreground border-border/60 hover:border-gold/40 hover:text-gold/80"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        )}

        {displayList.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No players match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-pixel text-[8px]">
                  <th className="text-left py-2 px-2 w-10">#</th>
                  <th className="text-left py-2 px-2">Player</th>
                  <th className="text-center py-2 px-1 w-10">Pos</th>
                  <th className="text-left py-2 px-2 hidden sm:table-cell">Team</th>
                  <th className="text-center py-2 px-1 w-14">Class</th>
                  <th className="text-center py-2 px-1 hidden sm:table-cell">Stars</th>
                  <th className="text-center py-2 px-1 w-14">OVR</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map(prospect => (
                  <tr
                    key={`${prospect.rank}-${prospect.id}`}
                    className="border-b border-border/50 hover:bg-card/50 transition-colors"
                    data-testid={`row-prospect-${prospect.id}`}
                  >
                    <td className="py-2.5 px-2">
                      <span className={`font-pixel text-[9px] ${prospect.rank <= 10 ? "text-gold" : "text-muted-foreground"}`}>
                        #{prospect.rank}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedPlayerId(prospect.id)}
                          className="font-medium text-xs hover:text-gold transition-colors text-left"
                          data-testid={`button-prospect-name-${prospect.id}`}
                        >
                          {prospect.firstName} {prospect.lastName}
                        </button>
                        {prospect.category === "pitcher" ? (
                          <span
                            className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${
                              prospect.throwHand === "L"
                                ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                                : "bg-muted/40 text-muted-foreground border-border/60"
                            }`}
                            data-testid={`badge-hand-${prospect.id}`}
                          >
                            {prospect.throwHand}HP
                          </span>
                        ) : (
                          <span
                            className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${
                              prospect.batHand === "L"
                                ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                                : prospect.batHand === "S"
                                ? "bg-purple-500/15 text-purple-400 border-purple-500/40"
                                : "bg-muted/40 text-muted-foreground border-border/60"
                            }`}
                            data-testid={`badge-hand-${prospect.id}`}
                          >
                            {prospect.batHand}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <span className="text-[10px] text-muted-foreground">{prospect.position}</span>
                    </td>
                    <td className="py-2.5 px-2 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <TeamBadge
                          abbreviation={prospect.teamAbbreviation}
                          primaryColor={prospect.teamPrimaryColor}
                          secondaryColor={prospect.teamSecondaryColor}
                          name={prospect.teamName}
                          size="sm"
                        />
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                          {prospect.teamName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">
                            <span className={`font-pixel text-[8px] block ${eligibilityColor[prospect.eligibility] ?? "text-muted-foreground"}`}>
                              {prospect.eligibility}
                            </span>
                            <span className="font-pixel text-[7px] text-muted-foreground/60 block">
                              S{gradSeason(prospect.eligibility)}
                            </span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {prospect.eligibility === "SR"
                            ? "Graduating this season"
                            : `Graduates Season ${gradSeason(prospect.eligibility)}`}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-2.5 px-1 text-center hidden sm:table-cell">
                      <StarRating rating={prospect.starRating} size="sm" />
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <span className={`text-xs ${ovrColor(prospect.overall)}`}>
                        {prospect.overall}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RetroCard>

      {/* Player profile modal — opens when a name is clicked */}
      {selectedPlayer && (
        <PlayerProfileCard
          player={selectedPlayer}
          open={!!selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          leagueId={leagueId}
          teamPrimaryColor={selectedProspectEntry?.teamPrimaryColor}
        />
      )}
    </>
  );
}
