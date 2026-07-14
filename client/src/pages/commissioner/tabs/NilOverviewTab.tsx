import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Zap } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";

interface NilTeamOverview {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  primaryColor: string;
  isCpu: boolean;
  conferenceName: string;
  nilBudget: number;
  nilSpent: number;
  nilRemaining: number;
  baseAllocation: number;
  bonusTotal: number;
  earnings: Array<{ id: string; category: string; amount: number; description: string }>;
}

interface NilOverviewResponse {
  season: number;
  overview: NilTeamOverview[];
}

interface NilOverviewTabProps {
  leagueId: string;
}

export function NilOverviewTab({ leagueId }: NilOverviewTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<NilOverviewResponse>({
    queryKey: ["/api/leagues", leagueId, "nil-earnings"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/nil-earnings`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-card border border-border rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const overview = data?.overview ?? [];

  if (overview.length === 0) {
    return (
      <div className="text-center py-16">
        <DollarSign className="w-12 h-12 text-gold/30 mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">
          NIL budget data will appear here after the first season transition.
        </p>
      </div>
    );
  }

  const maxBudget = Math.max(...overview.map((t) => t.nilBudget), 1);

  return (
    <div className="space-y-4">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gold" />
            <span>NIL Budget Rankings — Season {data?.season}</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-2">
            {overview.map((team, idx) => {
              const spentPct =
                team.nilBudget > 0
                  ? Math.min(100, Math.round((team.nilSpent / team.nilBudget) * 100))
                  : 0;
              const budgetBarPct = Math.round((team.nilBudget / maxBudget) * 100);
              const isOpen = expanded === team.teamId;

              return (
                <div key={team.teamId} data-testid={`nil-row-${team.teamId}`}>
                  <button
                    className="w-full text-left p-3 rounded border border-border/50 hover:border-gold/40 bg-card/50 hover:bg-card transition-colors"
                    onClick={() => setExpanded(isOpen ? null : team.teamId)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                        #{idx + 1}
                      </span>
                      <div
                        className="w-6 h-6 rounded shrink-0 flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: team.primaryColor, color: "#fff" }}
                      >
                        {team.teamAbbr.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{team.teamName}</span>
                          <span className="text-gold font-bold text-xs shrink-0">
                            ${(team.nilBudget / 1_000_000).toFixed(2)}M
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground truncate">
                            {team.conferenceName}
                          </span>
                          {team.bonusTotal > 0 && (
                            <Badge className="text-xs px-1 py-0 bg-gold/20 text-gold border-gold/40 h-3.5">
                              <Zap className="w-2 h-2 mr-0.5" />+$
                              {(team.bonusTotal / 1_000).toFixed(0)}K bonus
                            </Badge>
                          )}
                          {!team.isCpu && (
                            <Badge className="text-xs px-1 py-0 bg-blue-500/20 text-blue-400 border-blue-500/40 h-3.5">
                              Human
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1.5 w-full bg-muted/30 rounded h-1">
                          <div
                            className="bg-gold/50 h-1 rounded"
                            style={{ width: `${budgetBarPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border border-t-0 border-border/50 rounded-b p-3 bg-card/20 space-y-1.5">
                      <div className="grid grid-cols-3 gap-2 text-center mb-3">
                        <div className="p-1.5 bg-gold/10 rounded">
                          <p className="text-gold font-bold text-xs">
                            ${(team.nilBudget / 1_000_000).toFixed(2)}M
                          </p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div className="p-1.5 bg-red-500/10 rounded">
                          <p className="text-red-400 font-bold text-xs">
                            ${(team.nilSpent / 1_000_000).toFixed(2)}M
                          </p>
                          <p className="text-xs text-muted-foreground">Spent ({spentPct}%)</p>
                        </div>
                        <div className="p-1.5 bg-green-500/10 rounded">
                          <p className="text-green-400 font-bold text-xs">
                            ${(team.nilRemaining / 1_000_000).toFixed(2)}M
                          </p>
                          <p className="text-xs text-muted-foreground">Remaining</p>
                        </div>
                      </div>
                      {team.earnings.map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            {e.category === "base" ? (
                              <DollarSign className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <Zap className="w-2.5 h-2.5 text-gold flex-shrink-0" />
                            )}
                            {e.description}
                          </span>
                          <span
                            className={
                              e.category === "base"
                                ? "text-foreground font-medium"
                                : "text-gold font-medium"
                            }
                          >
                            {e.category === "base" ? "" : "+"} ${(e.amount / 1_000_000).toFixed(2)}M
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}
