import { RetroCard } from "@/components/ui/retro-card";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PositionBadge } from "@/components/ui/position-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Star, ArrowUp, ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, Shield } from "lucide-react";
import type { Player } from "@shared/schema";
import { isPitcher } from "@shared/positions";
import { getPotentialGrade, getProgressionZone, getProgressionColor } from "@shared/potential";
import { TRAJECTORY_LABELS } from "@shared/trajectory";

const TRAJECTORY_ICONS: Record<number, React.ReactNode> = {
  1: <ArrowDownRight className="w-2.5 h-2.5 inline-block" />,
  2: <ArrowRight className="w-2.5 h-2.5 inline-block" />,
  3: <ArrowUpRight className="w-2.5 h-2.5 inline-block" />,
  4: <ArrowUp className="w-2.5 h-2.5 inline-block" />,
};

interface PositionSectionProps {
  title: string;
  players: Player[];
  onSelectPlayer: (player: Player) => void;
  teamPrimaryColor?: string;
  progressionEnabled?: boolean;
  isOwnTeam?: boolean;
  onSetCaptain?: (playerId: string) => void;
}

export function PositionSection({ title, players, onSelectPlayer, teamPrimaryColor, progressionEnabled, isOwnTeam, onSetCaptain }: PositionSectionProps) {
  if (players.length === 0) return null;

  return (
    <RetroCard className="mb-4">
      <div className="px-4 py-2 bg-card/80 border-b border-border">
        <h3 className="font-pixel text-gold text-xs uppercase tracking-wider">
          {title} ({players.length})
        </h3>
      </div>

      {/* Mobile card layout */}
      <div className="sm:hidden divide-y divide-border/40">
        {players.map((player) => (
          <div key={player.id} className="roster-row-cv">
          <button
            onClick={() => onSelectPlayer(player)}
            className="w-full text-left px-3 py-2.5 hover:bg-card/50 transition-colors active:bg-card/70"
            data-testid={`card-player-mobile-${player.id}`}
          >
            <div className="flex items-center gap-2">
              <PlayerPortrait
                skinTone={player.skinTone || "light"}
                hairColor={player.hairColor || "brown"}
                hairStyle={player.hairStyle || "short"}
                facialHair={player.facialHair || "none"}
                eyeStyle={player.eyeStyle || undefined}
                eyebrowStyle={player.eyebrowStyle || undefined}
                mouthStyle={player.mouthStyle || undefined}
                eyeBlack={player.eyeBlack ?? undefined}
                playerId={player.id}
                className="w-8 h-8 flex-shrink-0"
                jerseyColor={teamPrimaryColor}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-medium text-xs truncate min-w-0">{player.firstName} {player.lastName}</span>
                  <PositionBadge position={player.position} size="sm" />
                  {player.captainRole && (
                    <span className="inline-flex items-center gap-0.5 font-pixel text-xs px-1 py-0.5 rounded border border-gold/50 text-gold bg-gold/10" data-testid={`badge-captain-mobile-${player.id}`}>
                      <Shield className="w-2 h-2" />C
                    </span>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-1 text-xs text-muted-foreground">
                  <span className="text-xs">{player.eligibility}</span>
                  {isPitcher(player.position) ? (
                    <>
                      <span className={`font-pixel text-xs px-1 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-mobile-${player.id}`}>{player.throwHand}HP</span>
                    </>
                  ) : (
                    <>
                      <span className={`font-pixel text-xs px-1 py-0.5 rounded border ${player.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : player.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-bat-mobile-${player.id}`}>B:{player.batHand}</span>
                      <span className={`font-pixel text-xs px-1 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-throw-mobile-${player.id}`}>T:{player.throwHand}</span>
                      {(player as any).trajectory != null && (
                        <span className="inline-flex items-center gap-0.5 font-pixel text-xs px-1 py-0.5 rounded border border-gold/30 text-gold/70 bg-gold/5" data-testid={`badge-traj-mobile-${player.id}`}>
                          {TRAJECTORY_LABELS[(player as any).trajectory] ?? "LD"}
                          {TRAJECTORY_ICONS[(player as any).trajectory]}
                        </span>
                      )}
                    </>
                  )}
                  {progressionEnabled && player.potential != null && (
                    <span className={`font-bold text-xs ${getProgressionColor(getProgressionZone(player.potential))}`}>
                      {getPotentialGrade(player.potential)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-1">
                <div className="flex items-center gap-0.5">
                  <span className="font-bold text-gold text-sm">{player.overall}</span>
                  {player.progressionDeltas?.overall != null && player.progressionDeltas.overall !== 0 && (
                    <span className={`flex items-center text-xs font-bold ${player.progressionDeltas.overall > 0 ? "text-green-400" : "text-red-400"}`} data-testid={`text-roster-ovr-delta-${player.id}`}>
                      {player.progressionDeltas.overall > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                      {Math.abs(player.progressionDeltas.overall)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">#{player.jerseyNumber}</span>
              </div>
            </div>
          </button>
          </div>
        ))}
      </div>

      {/* Desktop table layout */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-12" />
            <col className="w-12" />
            <col className="w-24" />
            <col className="w-12" />
            {progressionEnabled && <col className="w-12" />}
            <col className="w-36 hidden lg:table-column" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-3 px-2">#</th>
              <th className="text-left py-3 px-2">Name</th>
              <th className="text-center py-3 px-2">Pos</th>
              <th className="text-center py-3 px-2">Year</th>
              <th className="text-center py-3 px-2">B/T</th>
              <th className="text-center py-3 px-2">
                <Star className="w-3 h-3 inline text-gold" />
              </th>
              {progressionEnabled && (
                <th className="text-center py-3 px-2">POT</th>
              )}
              <th className="text-left py-3 px-2 hidden lg:table-cell">Hometown</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr
                key={player.id}
                className="group border-b border-border/50 hover:bg-card/50 transition-colors"
                style={player.starRating >= 5 ? { borderLeft: "3px solid rgba(196,163,90,0.7)", background: "rgba(196,163,90,0.04)" } : undefined}
                data-testid={`row-player-desktop-${player.id}`}
              >
                <td className="py-3 px-2 text-muted-foreground font-mono">
                  {player.jerseyNumber}
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectPlayer(player)}
                      className="font-medium text-left hover:text-gold transition-colors cursor-pointer flex items-center gap-2"
                      data-testid={`link-player-${player.id}`}
                    >
                      <PlayerPortrait
                        skinTone={player.skinTone || "light"}
                        hairColor={player.hairColor || "brown"}
                        hairStyle={player.hairStyle || "short"}
                        facialHair={player.facialHair || "none"}
                        eyeStyle={player.eyeStyle || undefined}
                        eyebrowStyle={player.eyebrowStyle || undefined}
                        mouthStyle={player.mouthStyle || undefined}
                        eyeBlack={player.eyeBlack ?? undefined}
                        playerId={player.id}
                        className="w-8 h-8 flex-shrink-0"
                        jerseyColor={teamPrimaryColor}
                      />
                      {player.firstName} {player.lastName}
                    </button>
                    {player.captainRole && (
                      <span className="inline-flex items-center gap-0.5 font-pixel text-xs px-1.5 py-0.5 rounded border border-gold/50 text-gold bg-gold/10 shrink-0" data-testid={`badge-captain-desktop-${player.id}`}>
                        <Shield className="w-2.5 h-2.5" />C
                      </span>
                    )}
                    {isOwnTeam && onSetCaptain && !player.captainRole && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => { e.stopPropagation(); onSetCaptain(player.id); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground/50 hover:text-gold transition-all"
                            data-testid={`button-set-captain-${player.id}`}
                          >
                            <Shield className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Name as captain</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </td>
                <td className="text-center py-3 px-2">
                  <PositionBadge position={player.position} size="sm" />
                </td>
                <td className="text-center py-3 px-2 text-muted-foreground">
                  {player.eligibility}
                </td>
                <td className="text-center py-3 px-2">
                  {isPitcher(player.position) ? (
                    <div className="flex items-center gap-1 justify-center flex-wrap">
                      <span className={`font-pixel text-xs px-1.5 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-desktop-${player.id}`}>{player.throwHand}HP</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 justify-center flex-wrap">
                      <span className={`font-pixel text-xs px-1.5 py-0.5 rounded border ${player.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : player.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-desktop-${player.id}`}>{player.batHand}/{player.throwHand}</span>
                      {(player as any).trajectory != null && (
                        <span className="inline-flex items-center gap-0.5 font-pixel text-xs px-1.5 py-0.5 rounded border border-gold/30 text-gold/70 bg-gold/5" data-testid={`badge-traj-desktop-${player.id}`}>
                          {TRAJECTORY_LABELS[(player as any).trajectory] ?? "LD"}
                          {TRAJECTORY_ICONS[(player as any).trajectory]}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="text-center py-3 px-2">
                  <span className="font-bold text-gold">{player.overall}</span>
                  {player.progressionDeltas?.overall != null && player.progressionDeltas.overall !== 0 && (
                    <span className={`inline-flex items-center ml-1 text-xs font-bold ${player.progressionDeltas.overall > 0 ? "text-green-400" : "text-red-400"}`} data-testid={`text-roster-ovr-delta-${player.id}`}>
                      {player.progressionDeltas.overall > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                      {Math.abs(player.progressionDeltas.overall)}
                    </span>
                  )}
                </td>
                {progressionEnabled && (
                  <td className="text-center py-3 px-2">
                    {player.potential != null ? (() => {
                      const grade = getPotentialGrade(player.potential);
                      const zone = getProgressionZone(player.potential);
                      const color = getProgressionColor(zone);
                      return <span className={`font-bold ${color}`}>{grade}</span>;
                    })() : <span className="text-muted-foreground">—</span>}
                  </td>
                )}
                <td className="py-3 px-2 text-muted-foreground hidden lg:table-cell">
                  {player.hometown}, {player.homeState}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RetroCard>
  );
}
