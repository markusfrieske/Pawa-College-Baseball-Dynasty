import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { Trophy, BookOpen, Sparkles, TrendingUp, TrendingDown } from "lucide-react";

interface StorylineWrapEntry {
  storylineRecruitId: string;
  recruitId: string;
  firstName: string;
  lastName: string;
  position: string;
  archetype: string;
  archetypeName: string;
  isLegendary: boolean;
  resolvedOvrDelta: number;
  committed: boolean;
  signedTeamId: string | null;
}

export function SeasonRecapDialog({ leagueId, season, open, onClose }: { leagueId: string; season: number; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<{
    season: number;
    teams: { id: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string; wins: number; losses: number; confWins: number; confLosses: number; runsScored: number; runsAllowed: number }[];
    cwsChampion: { name: string; abbreviation: string; primaryColor: string } | null;
    cwsRunnerUp: { name: string; abbreviation: string } | null;
    totalGames: number;
    bestRecord: string | null;
  }>({
    queryKey: ["/api/leagues", leagueId, "season-recap", season],
    enabled: open && season > 0,
  });

  const { data: wrapData } = useQuery<{ season: number; entries: StorylineWrapEntry[] }>({
    queryKey: ["/api/leagues", leagueId, "storyline-season-wrap", season],
    enabled: open && season > 0,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background border-gold/30 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Season {season} Recap
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            {data.cwsChampion && (
              <div className="text-center p-4 border border-gold/30 rounded-md bg-gold/5">
                <p className="text-xs text-muted-foreground mb-1">CWS CHAMPION</p>
                <div className="flex items-center justify-center gap-2">
                  <TeamBadge
                    abbreviation={data.cwsChampion.abbreviation}
                    primaryColor={data.cwsChampion.primaryColor}
                    name={data.cwsChampion.name}
                    size="md"
                  />
                  <span className="font-pixel text-gold text-sm">{data.cwsChampion.name}</span>
                </div>
                {data.cwsRunnerUp && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Runner-up: {data.cwsRunnerUp.name}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-2">
              <span>{data.totalGames} games played</span>
              {data.bestRecord && <span>Best: {data.bestRecord}</span>}
            </div>

            <div>
              <p className="font-pixel text-gold text-xs mb-2">TOP 10 TEAMS</p>
              <div className="space-y-1">
                {data.teams.map((team, i) => (
                  <div
                    key={team.id}
                    className="flex items-center gap-2 p-2 rounded text-sm"
                    data-testid={`recap-team-${i}`}
                  >
                    <span className="text-muted-foreground w-5 text-right text-xs">{i + 1}.</span>
                    <TeamBadge
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      name={team.name}
                      size="sm"
                    />
                    <span className="flex-1 truncate">{team.name}</span>
                    <span className="font-mono text-xs">
                      {team.wins}-{team.losses}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({team.confWins}-{team.confLosses} conf)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No recap data available</p>
        )}

        {/* Storyline Season Wrap */}
        {wrapData && wrapData.entries.length > 0 && (
          <div className="border-t border-border/50 pt-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-gold" />
              <p className="font-pixel text-gold text-xs">STORYLINE SEASON WRAP</p>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto" data-testid="storyline-season-wrap">
              {wrapData.entries.map((entry) => {
                const isPositive = entry.resolvedOvrDelta > 0;
                const isNeutral = entry.resolvedOvrDelta === 0;
                const rowColor = isNeutral
                  ? "bg-muted/20 border-border/30"
                  : isPositive
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-red-500/10 border-red-500/30";
                return (
                  <div
                    key={entry.storylineRecruitId}
                    className={`flex items-center gap-2 p-2 rounded border ${rowColor}`}
                    data-testid={`storyline-wrap-${entry.storylineRecruitId}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {entry.firstName[0]}. {entry.lastName}
                        </span>
                        <span className="text-xs text-muted-foreground">({entry.position})</span>
                        {entry.isLegendary && (
                          <span className="flex items-center gap-0.5 text-xs text-yellow-300 bg-yellow-500/20 border border-yellow-500/30 rounded px-1 py-0.5">
                            <Sparkles className="w-2.5 h-2.5" />
                            Legendary
                          </span>
                        )}
                        {entry.committed ? (
                          <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded px-1 py-0.5">
                            Committed
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground bg-muted/30 border border-border/40 rounded px-1 py-0.5">
                            Not Committed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{entry.archetypeName}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isPositive ? (
                        <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                      ) : isNeutral ? (
                        <span className="w-3.5 h-3.5 text-muted-foreground text-center leading-none">—</span>
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span
                        className={`text-xs font-bold tabular-nums ${isPositive ? "text-green-400" : isNeutral ? "text-muted-foreground" : "text-red-400"}`}
                        data-testid={`wrap-ovr-delta-${entry.storylineRecruitId}`}
                      >
                        {isPositive ? "+" : ""}{entry.resolvedOvrDelta}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
