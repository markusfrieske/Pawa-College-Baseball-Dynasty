/**
 * RecapModal — Postgame summary card.
 *
 * Fetches and displays the persisted recap for a completed game.
 * Mobile-first, touch-friendly, dark mode only.
 */

import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Star, AlertTriangle, Newspaper, Zap, TrendingUp, Users } from "lucide-react";
import type { GameRecap } from "@shared/schema";

// ── Badge config ────────────────────────────────────────────────────────────
const BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  postseason: { label: "POSTSEASON", className: "bg-purple-800/60 text-purple-300 border-purple-600/50" },
  rivalry:    { label: "RIVALRY",    className: "bg-amber-800/60  text-amber-300  border-amber-600/50"  },
  upset:      { label: "UPSET",      className: "bg-red-800/60    text-red-300    border-red-600/50"    },
  shutout:    { label: "SHUTOUT",    className: "bg-blue-800/60   text-blue-300   border-blue-600/50"   },
  blowout:    { label: "BLOWOUT",    className: "bg-orange-800/60 text-orange-300 border-orange-600/50" },
};

// ── Line score ──────────────────────────────────────────────────────────────
function LineScoreTable({
  innings,
  homeAbbr,
  awayAbbr,
  homeScore,
  awayScore,
  homeColor,
  awayColor,
}: {
  innings: number[][];
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  homeColor?: string | null;
  awayColor?: string | null;
}) {
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="text-xs font-mono w-full min-w-max">
        <thead>
          <tr className="text-muted-foreground border-b border-border/40">
            <th className="text-left px-2 py-1 font-normal w-14 sticky left-0 bg-[#1a2e1a]">Team</th>
            {innings.map((_, i) => (
              <th key={i} className="text-center px-1.5 py-1 font-normal w-7">{i + 1}</th>
            ))}
            <th className="text-center px-2 py-1 font-normal w-8 border-l border-border/30">R</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/20">
            <td className="px-2 py-1.5 font-bold sticky left-0 bg-[#1a2e1a]" style={{ color: awayColor || undefined }}>
              {awayAbbr}
            </td>
            {innings.map((inn, i) => (
              <td key={i} className="text-center px-1.5 py-1.5 text-muted-foreground">
                {inn[0] ?? 0}
              </td>
            ))}
            <td className={`text-center px-2 py-1.5 font-bold border-l border-border/30 ${awayWon ? "text-gold" : "text-foreground"}`}>
              {awayScore}
            </td>
          </tr>
          <tr>
            <td className="px-2 py-1.5 font-bold sticky left-0 bg-[#1a2e1a]" style={{ color: homeColor || undefined }}>
              {homeAbbr}
            </td>
            {innings.map((inn, i) => (
              <td key={i} className="text-center px-1.5 py-1.5 text-muted-foreground">
                {inn[1] ?? 0}
              </td>
            ))}
            <td className={`text-center px-2 py-1.5 font-bold border-l border-border/30 ${homeWon ? "text-gold" : "text-foreground"}`}>
              {homeScore}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function RecapModal({
  leagueId,
  gameId,
  onClose,
}: {
  leagueId: string;
  gameId: string | null;
  onClose: () => void;
}) {
  const { data: recap, isLoading, isError } = useQuery<GameRecap>({
    queryKey: ["/api/leagues", leagueId, "games", gameId, "recap"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/games/${gameId}/recap`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!gameId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const homeWon = recap ? recap.homeScore > recap.awayScore : false;
  const winner  = recap ? (homeWon ? recap.homeTeamAbbr : recap.awayTeamAbbr) : "";
  const winnerColor = recap ? (homeWon ? recap.homeTeamColor : recap.awayTeamColor) : null;

  const badges = (recap?.badges as string[] | null) ?? [];

  return (
    <Dialog open={!!gameId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="bg-[#162516] border-gold/30 max-w-lg w-full max-h-[90dvh] overflow-y-auto p-0"
        data-testid="dialog-recap"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Game Recap</DialogTitle>
        </DialogHeader>

        {/* ── Header bar ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gold/10 border-b border-gold/20">
          <Newspaper className="w-3.5 h-3.5 text-gold flex-shrink-0" />
          <span className="font-pixel text-gold text-xs tracking-wide">GAME RECAP</span>
          {badges.length > 0 && (
            <div className="flex gap-1 ml-auto flex-wrap justify-end">
              {badges.map(b => {
                const cfg = BADGE_CONFIG[b];
                if (!cfg) return null;
                return (
                  <span
                    key={b}
                    className={`font-pixel text-xs px-1.5 py-0.5 rounded border ${cfg.className}`}
                  >
                    {cfg.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {isLoading && (
          <div className="p-4 space-y-3">
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-6 w-3/4 rounded" />
            <Skeleton className="h-20 w-full rounded" />
            <Skeleton className="h-16 w-full rounded" />
          </div>
        )}

        {isError && (
          <div className="p-6 flex flex-col items-center gap-3 text-center text-muted-foreground">
            <AlertTriangle className="w-8 h-8 text-yellow-600/60" />
            <p className="text-sm">Recap not available for this game.</p>
            <p className="text-xs opacity-60">Recaps are only generated for games completed after this feature launched.</p>
          </div>
        )}

        {recap && (
          <div className="divide-y divide-border/30">

            {/* ── Final score ── */}
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                {/* Away team */}
                <div className="text-center flex-1 min-w-0">
                  <p
                    className="font-pixel text-xs mb-1 truncate"
                    style={{ color: recap.awayTeamColor || undefined }}
                    data-testid="recap-away-abbr"
                  >
                    {recap.awayTeamAbbr}
                  </p>
                  <p
                    className={`font-pixel text-3xl leading-none ${recap.awayScore > recap.homeScore ? "text-gold" : "text-foreground/60"}`}
                    data-testid="recap-away-score"
                  >
                    {recap.awayScore}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{recap.awayTeamName}</p>
                </div>

                {/* VS divider */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <span className="font-pixel text-xs text-muted-foreground/60">FINAL</span>
                  <span className="text-muted-foreground/40 text-lg leading-none mt-0.5">—</span>
                </div>

                {/* Home team */}
                <div className="text-center flex-1 min-w-0">
                  <p
                    className="font-pixel text-xs mb-1 truncate"
                    style={{ color: recap.homeTeamColor || undefined }}
                    data-testid="recap-home-abbr"
                  >
                    {recap.homeTeamAbbr}
                  </p>
                  <p
                    className={`font-pixel text-3xl leading-none ${recap.homeScore > recap.awayScore ? "text-gold" : "text-foreground/60"}`}
                    data-testid="recap-home-score"
                  >
                    {recap.homeScore}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{recap.homeTeamName}</p>
                </div>
              </div>

              {/* Headline */}
              <p
                className="text-sm font-medium text-center text-foreground/90 leading-snug mt-3"
                data-testid="recap-headline"
              >
                {recap.headline}
              </p>

              {/* Meta */}
              <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
                {recap.phase && (
                  <span className="font-pixel text-xs px-2 py-0.5 rounded bg-muted/50 text-muted-foreground uppercase">
                    {recap.phase.replace(/_/g, " ")}
                  </span>
                )}
                <span className="font-pixel text-xs text-muted-foreground/60">
                  S{recap.season} · W{recap.week}
                </span>
                {recap.statsIncomplete && (
                  <span className="font-pixel text-xs text-yellow-600/80">STATS INCOMPLETE</span>
                )}
              </div>
            </div>

            {/* ── Line score ── */}
            {recap.lineScore && recap.lineScore.length > 0 && (
              <div className="px-3 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="font-pixel text-xs text-muted-foreground uppercase tracking-wider">Line Score</span>
                </div>
                <LineScoreTable
                  innings={recap.lineScore as number[][]}
                  homeAbbr={recap.homeTeamAbbr}
                  awayAbbr={recap.awayTeamAbbr}
                  homeScore={recap.homeScore}
                  awayScore={recap.awayScore}
                  homeColor={recap.homeTeamColor}
                  awayColor={recap.awayTeamColor}
                />
              </div>
            )}

            {/* ── Player of the game ── */}
            {recap.playerOfGame && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Star className="w-3 h-3 text-gold" />
                  <span className="font-pixel text-xs text-gold uppercase tracking-wider">Player of the Game</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded bg-gold/5 border border-gold/20">
                  <Trophy className="w-5 h-5 text-gold flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm text-foreground" data-testid="recap-potg-name">
                        {(recap.playerOfGame as any).name}
                      </p>
                      <span
                        className="font-pixel text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${(recap.playerOfGame as any).teamColor || "#888"}30`,
                          color: (recap.playerOfGame as any).teamColor || "#aaa",
                        }}
                      >
                        {(recap.playerOfGame as any).teamAbbr}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5" data-testid="recap-potg-stat">
                      {(recap.playerOfGame as any).statLine}
                    </p>
                    <p className="text-xs text-gold/70 mt-0.5 italic">
                      {(recap.playerOfGame as any).highlight}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Turning point ── */}
            {recap.turningPoint && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span className="font-pixel text-xs text-amber-400/80 uppercase tracking-wider">Turning Point</span>
                </div>
                <p className="text-sm text-foreground/80" data-testid="recap-turning-point">
                  {recap.turningPoint}
                </p>
              </div>
            )}

            {/* ── Top hitters ── */}
            {recap.topHitters && (recap.topHitters as any[]).length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="w-3 h-3 text-blue-400" />
                  <span className="font-pixel text-xs text-muted-foreground uppercase tracking-wider">Top Performers</span>
                </div>
                <div className="space-y-1.5">
                  {(recap.topHitters as any[]).map((hitter: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-pixel text-xs px-1 py-0.5 rounded bg-muted/40 text-muted-foreground flex-shrink-0"
                        >
                          {hitter.teamAbbr}
                        </span>
                        <span className="truncate text-foreground/90">{hitter.name}</span>
                      </div>
                      <span className="text-muted-foreground text-xs flex-shrink-0">{hitter.statLine}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Pitching line ── */}
            {recap.pitchingLine && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span className="font-pixel text-xs text-muted-foreground uppercase tracking-wider">Pitching Decision</span>
                </div>
                <div className="space-y-1.5">
                  {(recap.pitchingLine as any).winner && (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-pixel text-xs text-emerald-400 border border-emerald-700/40 px-1 py-0.5 rounded">W</span>
                        <span className="text-foreground/90">{(recap.pitchingLine as any).winner.name}</span>
                        <span className="font-pixel text-xs text-muted-foreground">{(recap.pitchingLine as any).winner.teamAbbr}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {(recap.pitchingLine as any).winner.ip} IP · {(recap.pitchingLine as any).winner.so} K · {(recap.pitchingLine as any).winner.er} ER
                      </span>
                    </div>
                  )}
                  {(recap.pitchingLine as any).loser && (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-pixel text-xs text-red-400 border border-red-700/40 px-1 py-0.5 rounded">L</span>
                        <span className="text-foreground/90">{(recap.pitchingLine as any).loser.name}</span>
                        <span className="font-pixel text-xs text-muted-foreground">{(recap.pitchingLine as any).loser.teamAbbr}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {(recap.pitchingLine as any).loser.ip} IP · {(recap.pitchingLine as any).loser.so} K · {(recap.pitchingLine as any).loser.er} ER
                      </span>
                    </div>
                  )}
                  {(recap.pitchingLine as any).save && (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-pixel text-xs text-blue-400 border border-blue-700/40 px-1 py-0.5 rounded">SV</span>
                        <span className="text-foreground/90">{(recap.pitchingLine as any).save.name}</span>
                        <span className="font-pixel text-xs text-muted-foreground">{(recap.pitchingLine as any).save.teamAbbr}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {(recap.pitchingLine as any).save.ip} IP
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Standings + Series ── */}
            {(recap.standingsImpact || recap.seriesStatus) && (
              <div className="px-4 py-3 space-y-2">
                {recap.standingsImpact && (
                  <div className="flex items-start gap-2 text-sm">
                    <TrendingUp className="w-3.5 h-3.5 text-gold/60 mt-0.5 flex-shrink-0" />
                    <span className="text-foreground/80" data-testid="recap-standings">{recap.standingsImpact}</span>
                  </div>
                )}
                {recap.seriesStatus && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="font-pixel text-xs text-muted-foreground mt-1 flex-shrink-0">SERIES</span>
                    <span className="text-foreground/80" data-testid="recap-series">{recap.seriesStatus}</span>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
