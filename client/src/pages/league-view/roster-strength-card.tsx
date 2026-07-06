import { Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { BarChart } from "lucide-react";
import type { DashboardOverview } from "./types";
import { STAR_COLORS, STAR_TEXT_COLORS } from "./helpers";

export function RosterStrengthCard({ overview, leagueId }: { overview: DashboardOverview; leagueId: string }) {
  const totalPlayers = overview.rosterSize;
  const maxStarCount = Math.max(...[1, 2, 3, 4, 5].map(s => overview.starDist?.[String(s)] || 0), 1);

  return (
    <RetroCard className="mb-6" data-testid="card-roster-strength">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px] sm:text-[10px]">ROSTER STRENGTH</h3>
          </div>
          <Link href={`/league/${leagueId}/roster`}>
            <RetroButton variant="outline" size="sm" className="text-[9px] px-2 py-1 h-auto" data-testid="button-view-full-roster">
              View Roster
            </RetroButton>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div className="space-y-3">
            <div className="text-center p-3 bg-background/50 rounded border border-border/50">
              <p className="font-pixel text-[7px] text-muted-foreground mb-1">TEAM AVG OVR</p>
              <p className="text-3xl font-bold text-gold" data-testid="text-avg-ovr">{overview.averageOverall}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{totalPlayers} players</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-background/50 rounded border border-border/50">
                <p className="font-pixel text-[7px] text-muted-foreground mb-1">HITTERS</p>
                <p className="text-lg font-bold text-sky-400" data-testid="text-hitter-avg">{overview.hitterAvg || "—"}</p>
                <p className="font-pixel text-[6px] text-muted-foreground">avg ovr</p>
              </div>
              <div className="text-center p-2 bg-background/50 rounded border border-border/50">
                <p className="font-pixel text-[7px] text-muted-foreground mb-1">PITCHERS</p>
                <p className="text-lg font-bold text-purple-400" data-testid="text-pitcher-avg">{overview.pitcherAvg || "—"}</p>
                <p className="font-pixel text-[6px] text-muted-foreground">avg ovr</p>
              </div>
            </div>
          </div>

          <div>
            <p className="font-pixel text-[7px] text-muted-foreground mb-2">STAR DISTRIBUTION</p>
            <div className="space-y-1.5" data-testid="chart-star-distribution">
              {[5, 4, 3, 2, 1].map(stars => {
                const count = overview.starDist?.[String(stars)] || 0;
                const pct = totalPlayers > 0 ? Math.round((count / totalPlayers) * 100) : 0;
                const barWidth = maxStarCount > 0 ? Math.round((count / maxStarCount) * 100) : 0;
                return (
                  <div key={stars} className="flex items-center gap-2" data-testid={`row-star-dist-${stars}`}>
                    <span className={`font-pixel text-[7px] w-5 shrink-0 ${STAR_TEXT_COLORS[stars]}`}>{stars}★</span>
                    <div className="flex-1 bg-background/60 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${STAR_COLORS[stars]}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-10 shrink-0 text-right">
                      {count} <span className="text-muted-foreground/60">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="font-pixel text-[7px] text-muted-foreground mb-2">TOP 5 PLAYERS</p>
            <div className="space-y-1.5" data-testid="list-top5-players">
              {(overview.top5Players || []).map((p, i) => (
                <div key={i} className="flex items-center gap-2 p-1.5 bg-background/40 rounded border border-border/30" data-testid={`row-top-player-${i}`}>
                  <span className="font-pixel text-[7px] text-muted-foreground/60 w-3 shrink-0">{i + 1}</span>
                  <span className={`font-pixel text-[7px] shrink-0 ${STAR_TEXT_COLORS[p.starRating]}`}>
                    {"★".repeat(p.starRating)}
                  </span>
                  <span className="text-[10px] font-medium text-foreground truncate flex-1 min-w-0">{p.name}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{p.position}</span>
                  <span className="font-pixel text-[8px] text-gold shrink-0 w-8 text-right" data-testid={`text-player-ovr-${i}`}>{p.overall}</span>
                </div>
              ))}
            </div>
          </div>

        </div>


      </RetroCardContent>
    </RetroCard>
  );
}
