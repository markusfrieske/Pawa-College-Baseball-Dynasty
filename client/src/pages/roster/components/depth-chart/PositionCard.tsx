import { useState, useCallback, useRef } from "react";
import type { Player } from "@shared/schema";
import { DepthPlayerRow } from "./DepthPlayerRow";

interface PositionCardProps {
  position: string;
  players: Player[];
  onSelectPlayer: (p: Player) => void;
  maxPlayers?: number;
  teamPrimaryColor?: string;
  draggable?: boolean;
  onReorder?: (position: string, reorderedPlayers: Player[]) => void;
}

export function PositionCard({ position, players, onSelectPlayer, maxPlayers = 3, teamPrimaryColor, draggable, onReorder }: PositionCardProps) {
  const displayPlayers = players.slice(0, maxPlayers);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    dragIdxRef.current = idx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    const dragIdx = dragIdxRef.current;
    if (dragIdx === null || dragIdx === dropIdx) return;
    const reordered = [...displayPlayers];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    onReorder?.(position, reordered);
    dragIdxRef.current = null;
  }, [displayPlayers, position, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragOverIdx(null);
    dragIdxRef.current = null;
  }, []);

  return (
    <div
      className="bg-card/90 border border-border rounded-lg overflow-visible min-w-[140px]"
      data-testid={`depth-card-${position}`}
      data-position-group={position}
    >
      <div className="bg-gold/20 px-2 py-1 border-b border-border">
        <span className="font-pixel text-gold text-xs">{position}</span>
      </div>
      <div className="p-1" data-testid={`depth-position-group-${position}`}>
        {displayPlayers.length === 0 ? (
          <div className="text-muted-foreground text-xs py-2 text-center">Empty</div>
        ) : (
          displayPlayers.map((p, idx) => (
            <DepthPlayerRow
              key={p.id}
              p={p}
              idx={idx}
              position={position}
              teamPrimaryColor={teamPrimaryColor}
              draggable={draggable}
              onSelectPlayer={onSelectPlayer}
              onDragStart={draggable ? handleDragStart : undefined}
              onDragOver={draggable ? handleDragOver : undefined}
              onDrop={draggable ? handleDrop : undefined}
              onDragEnd={draggable ? handleDragEnd : undefined}
              dragOverIdx={dragOverIdx}
            />
          ))
        )}
      </div>
    </div>
  );
}
