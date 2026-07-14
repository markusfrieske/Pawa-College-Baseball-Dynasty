import { RetroCard } from "@/components/ui/retro-card";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PositionBadge } from "@/components/ui/position-badge";
import { TrendingUp, Zap } from "lucide-react";
import type { Player } from "@shared/schema";
import { ovrToStar, getTopAttrDeltas } from "../lib/helpers";

export function DevelopmentTab({
  players,
  onSelectPlayer,
  teamPrimaryColor,
}: {
  players: Player[];
  onSelectPlayer: (player: Player) => void;
  teamPrimaryColor?: string;
}) {
  const withDeltas = players.filter(
    (p) => p.progressionDeltas != null && p.progressionDeltas.overall != null
  );
  const noDeltas = players.filter(
    (p) => !p.progressionDeltas || p.progressionDeltas.overall == null
  );

  if (withDeltas.length === 0) {
    return (
      <RetroCard>
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-pixel text-xs mb-2">NO DEVELOPMENT DATA YET</p>
          <p className="text-sm">Development report is generated at the end of each season.</p>
        </div>
      </RetroCard>
    );
  }

  const sortedByDelta = [...withDeltas].sort(
    (a, b) => (b.progressionDeltas!.overall ?? 0) - (a.progressionDeltas!.overall ?? 0)
  );

  const improvers = withDeltas.filter((p) => (p.progressionDeltas!.overall ?? 0) > 0);
  const regressors = withDeltas.filter((p) => (p.progressionDeltas!.overall ?? 0) < 0);
  const totalDelta = withDeltas.reduce((s, p) => s + (p.progressionDeltas!.overall ?? 0), 0);
  const avgDelta = totalDelta / withDeltas.length;
  const breakouts = sortedByDelta.slice(0, 3).filter((p) => (p.progressionDeltas!.overall ?? 0) > 0);

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      <RetroCard>
        <div className="p-4">
          <h3 className="font-pixel text-gold text-xs mb-4">OFFSEASON DEVELOPMENT SUMMARY</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-card/60 border border-border">
              <p className={`text-2xl font-bold ${avgDelta > 0 ? "text-green-400" : avgDelta < 0 ? "text-red-400" : "text-muted-foreground"}`} data-testid="text-dev-avg-delta">
                {avgDelta > 0 ? "+" : ""}{avgDelta.toFixed(1)}
              </p>
              <p className="font-pixel text-xs text-muted-foreground mt-1">AVG OVR CHANGE</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-900/10 border border-green-800/30">
              <p className="text-2xl font-bold text-green-400" data-testid="text-dev-improvers">{improvers.length}</p>
              <p className="font-pixel text-xs text-muted-foreground mt-1">IMPROVED</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-900/10 border border-red-800/30">
              <p className="text-2xl font-bold text-red-400" data-testid="text-dev-regressors">{regressors.length}</p>
              <p className="font-pixel text-xs text-muted-foreground mt-1">REGRESSED</p>
            </div>
          </div>

          {breakouts.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3 h-3 text-gold" />
                <h4 className="font-pixel text-gold text-xs">BREAKOUT PLAYERS</h4>
              </div>
              <div className="flex flex-wrap gap-3">
                {breakouts.map((p) => {
                  const delta = p.progressionDeltas!.overall ?? 0;
                  const prevOvr = p.overall - delta;
                  const prevStar = ovrToStar(prevOvr);
                  const starChanged = prevStar !== p.starRating;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelectPlayer(p)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/20 border border-green-700/40 hover:bg-green-900/35 transition-colors"
                      data-testid={`card-breakout-${p.id}`}
                    >
                      <PlayerPortrait
                        skinTone={p.skinTone || "light"}
                        hairColor={p.hairColor || "brown"}
                        hairStyle={p.hairStyle || "short"}
                        facialHair={p.facialHair || "none"}
                        eyeStyle={p.eyeStyle || undefined}
                        eyebrowStyle={p.eyebrowStyle || undefined}
                        mouthStyle={p.mouthStyle || undefined}
                        eyeBlack={p.eyeBlack ?? undefined}
                        playerId={p.id}
                        className="w-10 h-10 flex-shrink-0"
                        jerseyColor={teamPrimaryColor}
                      />
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground leading-tight">{p.firstName} {p.lastName}</p>
                        <p className="font-pixel text-xs text-green-400">+{delta} OVR{starChanged ? ` · ${prevStar}★→${p.starRating}★` : ""}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </RetroCard>

      {/* Full Player Development List */}
      <RetroCard>
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-pixel text-gold text-xs">PLAYER DEVELOPMENT REPORT</h3>
        </div>
        <div className="divide-y divide-border/40">
          {sortedByDelta.map((p) => {
            const delta = p.progressionDeltas!.overall ?? 0;
            const prevOvr = p.overall - delta;
            const prevStar = ovrToStar(prevOvr);
            const starChanged = prevStar !== p.starRating;
            const topAttrs = getTopAttrDeltas(p.progressionDeltas);
            return (
              <button
                key={p.id}
                onClick={() => onSelectPlayer(p)}
                className="w-full text-left px-4 py-3 hover:bg-card/50 transition-colors flex items-center gap-3"
                data-testid={`row-dev-player-${p.id}`}
              >
                <PlayerPortrait
                  skinTone={p.skinTone || "light"}
                  hairColor={p.hairColor || "brown"}
                  hairStyle={p.hairStyle || "short"}
                  facialHair={p.facialHair || "none"}
                  eyeStyle={p.eyeStyle || undefined}
                  eyebrowStyle={p.eyebrowStyle || undefined}
                  mouthStyle={p.mouthStyle || undefined}
                  eyeBlack={p.eyeBlack ?? undefined}
                  playerId={p.id}
                  className="w-9 h-9 flex-shrink-0"
                  jerseyColor={teamPrimaryColor}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.firstName} {p.lastName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <PositionBadge position={p.position} size="sm" />
                    <span className="text-xs text-muted-foreground">{p.eligibility}</span>
                  </div>
                  {topAttrs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1" data-testid={`text-dev-attrs-${p.id}`}>
                      {topAttrs.map((attr, i) => (
                        <span key={attr.label} className="flex items-center gap-0.5">
                          {i > 0 && <span className="text-muted-foreground/40 text-xs">·</span>}
                          <span className={`font-pixel text-xs ${attr.delta > 0 ? "text-green-400" : "text-red-400"}`}>
                            {attr.label} {attr.delta > 0 ? "+" : ""}{attr.delta}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0 space-y-0.5">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs text-muted-foreground">{prevOvr}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="font-bold text-gold text-sm">{p.overall}</span>
                    <span
                      className={`font-pixel text-xs font-bold w-8 text-right ${
                        delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"
                      }`}
                      data-testid={`text-dev-delta-${p.id}`}
                    >
                      {delta > 0 ? "+" : ""}{delta}
                    </span>
                  </div>
                  {starChanged && (
                    <p className="text-xs text-gold font-pixel">{prevStar}★ → {p.starRating}★</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {noDeltas.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-card/30">
            <p className="font-pixel text-xs text-muted-foreground">
              {noDeltas.length} player{noDeltas.length !== 1 ? "s" : ""} (new signings) have no prior-season data
            </p>
          </div>
        )}
      </RetroCard>
    </div>
  );
}
