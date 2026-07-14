import { useRef } from "react";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, Star, ArrowUp, ArrowDown } from "lucide-react";
import type { Player } from "@shared/schema";
import { isPitcher } from "@shared/positions";

export function DepthPlayerRow({ p, idx, position, teamPrimaryColor, draggable, onSelectPlayer, onDragStart, onDragOver, onDrop, onDragEnd, dragOverIdx }: {
  p: Player;
  idx: number;
  position: string;
  teamPrimaryColor?: string;
  draggable?: boolean;
  onSelectPlayer: (p: Player) => void;
  onDragStart?: (e: React.DragEvent, idx: number) => void;
  onDragOver?: (e: React.DragEvent, idx: number) => void;
  onDrop?: (e: React.DragEvent, idx: number) => void;
  onDragEnd?: () => void;
  dragOverIdx?: number | null;
}) {
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const wasDragged = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    wasDragged.current = false;
  };

  const handleDragStartInternal = (e: React.DragEvent) => {
    wasDragged.current = true;
    onDragStart?.(e, idx);
  };

  const handleClick = () => {
    if (!wasDragged.current) {
      onSelectPlayer(p);
    }
    wasDragged.current = false;
  };

  const keyStats = isPitcher(p.position)
    ? `VEL ${p.velocity || 0} / CTL ${p.control || 0} / STM ${p.stamina || 0}`
    : `CON ${p.hitForAvg || 0} / PWR ${p.power || 0} / SPD ${p.speed || 0}`;

  const isDragOver = dragOverIdx === idx;

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStartInternal}
      onDragOver={(e) => onDragOver?.(e, idx)}
      onDrop={(e) => onDrop?.(e, idx)}
      onDragEnd={onDragEnd}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={`w-full flex items-center gap-1 px-2 py-1.5 rounded text-left transition-colors cursor-pointer select-none ${
        idx === 0 ? 'bg-gold/10 hover:bg-gold/20' : 'hover:bg-card'
      } ${isDragOver ? 'border border-[#d4a843] bg-gold/10' : 'border border-transparent'}`}
      data-testid={`depth-${position}-${idx}`}
    >
      {draggable && (
        <GripVertical
          className="w-3 h-3 text-muted-foreground/50 flex-shrink-0 cursor-grab"
          data-testid={`depth-drag-handle-${p.id}`}
        />
      )}
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
        className="w-6 h-6 flex-shrink-0"
        jerseyColor={teamPrimaryColor}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`text-xs truncate flex-1 ${idx === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
            {p.firstName.charAt(0)}. {p.lastName}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-card border-border p-2 max-w-[200px]">
          <div className="space-y-1">
            <div className="text-gold text-xs">
              #{p.jerseyNumber} {p.firstName} {p.lastName}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{p.position}</span>
              <span className="inline-flex items-center gap-0.5">OVR {p.overall}{p.progressionDeltas?.overall != null && p.progressionDeltas.overall !== 0 && (p.progressionDeltas.overall > 0 ? <ArrowUp className="w-2 h-2 text-green-400" /> : <ArrowDown className="w-2 h-2 text-red-400" />)}</span>
              <span className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-2 h-2 ${i < p.starRating ? "text-gold" : "text-muted-foreground/30"}`}
                    fill={i < p.starRating ? "currentColor" : "none"}
                  />
                ))}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{keyStats}</div>
          </div>
        </TooltipContent>
      </Tooltip>
      <span className="text-xs text-muted-foreground/80 font-medium">
        {p.eligibility || 'FR'}
      </span>
      <span className={`text-xs font-semibold px-1 py-0.5 rounded border ${isPitcher(p.position) ? (p.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60") : (p.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : p.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60")}`} data-testid={`badge-hand-depth-${p.id}`}>
        {isPitcher(p.position) ? `${p.throwHand}HP` : `${p.batHand}/${p.throwHand}`}
      </span>
      <span className={`text-xs font-bold ${idx === 0 ? 'text-gold' : 'text-muted-foreground'}`}>
        {p.overall}
      </span>
    </div>
  );
}
