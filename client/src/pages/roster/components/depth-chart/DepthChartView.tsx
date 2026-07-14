import { useState, useCallback, useEffect } from "react";
import { RetroButton } from "@/components/ui/retro-button";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PositionBadge } from "@/components/ui/position-badge";
import { LayoutGrid, List, Wand2, X, GripVertical } from "lucide-react";
import type { Player } from "@shared/schema";
import { isPitcher } from "@shared/positions";
import { sortByDepth } from "../../lib/helpers";
import { useLineupMutations } from "../../hooks/useLineupMutations";
import { usePitcherAvailability } from "../../hooks/usePitcherAvailability";
import { PositionCard } from "./PositionCard";
import { AvailStrip } from "./AvailStrip";

export function DepthChartView({ players, onSelectPlayer, teamPrimaryColor, leagueId, isOwnTeam, rosterUrl, initialLineupTab = "field", currentWeek = 1 }: {
  players: Player[];
  onSelectPlayer: (p: Player) => void;
  teamPrimaryColor?: string;
  leagueId?: string;
  isOwnTeam?: boolean;
  rosterUrl?: string;
  initialLineupTab?: "field" | "lineup" | "pitching";
  currentWeek?: number;
}) {
  const [lineupTab, setLineupTab] = useState<"field" | "lineup" | "pitching">(initialLineupTab);
  useEffect(() => { setLineupTab(initialLineupTab); }, [initialLineupTab]);
  const [selectingSlot, setSelectingSlot] = useState<{ type: "batting"; slot: number } | { type: "pitching"; role: string } | null>(null);
  const [dragBattingSource, setDragBattingSource] = useState<{ player: Player; fromSlot?: number } | null>(null);
  const [dragOverBattingSlot, setDragOverBattingSlot] = useState<number | null>(null);
  const [dragPitchingSource, setDragPitchingSource] = useState<{ player: Player; fromRole?: string } | null>(null);
  const [dragOverPitchingRole, setDragOverPitchingRole] = useState<string | null>(null);

  const {
    depthOrderMutation,
    battingOrderMutation,
    pitchingRoleMutation,
    autoLineupMutation,
    lineupPositionMutation,
  } = useLineupMutations(leagueId, rosterUrl);

  const availMap = usePitcherAvailability(players, currentWeek);

  const [openLineupPosId, setOpenLineupPosId] = useState<string | null>(null);

  const handleReorder = useCallback((position: string, reorderedPlayers: Player[]) => {
    const orders = reorderedPlayers.map((p, idx) => ({
      playerId: p.id,
      depthOrder: idx + 1,
    }));
    depthOrderMutation.mutate(orders);
  }, [depthOrderMutation]);

  const getPlayersByPosition = (pos: string): Player[] => {
    if (pos === "LF" || pos === "CF" || pos === "RF") {
      const specificPlayers = players.filter(p => p.position === pos);
      const ofPlayers = players.filter(p => p.position === "OF");
      const ofPositions = ["LF", "CF", "RF"];
      const myOfPlayers = ofPlayers.filter((_, i) => ofPositions[i % 3] === pos);
      return sortByDepth([...specificPlayers, ...myOfPlayers]);
    }
    return sortByDepth(players.filter(p => p.position === pos));
  };

  const fieldPositions = ["LF", "CF", "RF", "3B", "SS", "2B", "1B", "C"];
  const starterIds = new Set<string>();
  fieldPositions.forEach(pos => {
    const posPlayers = getPlayersByPosition(pos);
    if (posPlayers.length > 0) {
      starterIds.add(posPlayers[0].id);
    }
  });

  const eligibleForDH = players
    .filter(p => !isPitcher(p.position) && !starterIds.has(p.id))
    .map(p => ({
      player: p,
      dhScore: (p.hitForAvg || 0) + (p.power || 0) + (p.speed || 0)
    }))
    .sort((a, b) => b.dhScore - a.dhScore);

  const dhPlayers = eligibleForDH.length > 0 ? [eligibleForDH[0].player] : [];

  const canDrag = isOwnTeam === true;

  const positionPlayers = players.filter(p => !isPitcher(p.position));
  const allPitchers = players.filter(p => isPitcher(p.position));

  const battingSlots = Array.from({ length: 9 }, (_, i) => {
    const slotNum = i + 1;
    const assigned = positionPlayers.find(p => p.battingOrder === slotNum);
    return { slot: slotNum, player: assigned || null };
  });
  const assignedBattingIds = new Set(battingSlots.filter(s => s.player).map(s => s.player!.id));
  const unassignedBatters = positionPlayers
    .filter(p => !assignedBattingIds.has(p.id))
    .sort((a, b) => b.overall - a.overall);

  const rotationRoles = [
    { role: "FRI", label: "Fri" },
    { role: "SAT", label: "Sat" },
    { role: "SUN", label: "Sun" },
    { role: "MID", label: "Midweek" },
  ];
  const bullpenRoles = [
    { role: "LRP", label: "LRP" },
    { role: "MR1", label: "MR" },
    { role: "MR2", label: "MR" },
    { role: "MR3", label: "MR" },
    { role: "SU", label: "SU" },
    { role: "CP", label: "CP" },
  ];

  const rotationSlots = rotationRoles.map(r => ({
    ...r,
    player: allPitchers.find(p => p.pitchingRole === r.role) || null,
  }));
  const bullpenSlots = bullpenRoles.map(r => ({
    ...r,
    player: allPitchers.find(p => p.pitchingRole === r.role) || null,
  }));
  const assignedPitchingIds = new Set([
    ...rotationSlots.filter(s => s.player).map(s => s.player!.id),
    ...bullpenSlots.filter(s => s.player).map(s => s.player!.id),
  ]);
  const unassignedPitchers = allPitchers
    .filter(p => !assignedPitchingIds.has(p.id))
    .sort((a, b) => b.overall - a.overall);

  const handleAssignBatter = (slot: number, player: Player) => {
    const previousHolder = battingSlots.find(s => s.slot === slot)?.player;
    const orders: { playerId: string; battingOrder: number | null }[] = [];
    const existingSlot = battingSlots.find(s => s.player?.id === player.id);
    if (existingSlot) {
      orders.push({ playerId: player.id, battingOrder: null });
    }
    if (previousHolder && previousHolder.id !== player.id) {
      if (existingSlot) {
        orders.push({ playerId: previousHolder.id, battingOrder: existingSlot.slot });
      } else {
        orders.push({ playerId: previousHolder.id, battingOrder: null });
      }
    }
    orders.push({ playerId: player.id, battingOrder: slot });
    battingOrderMutation.mutate(orders);
    setSelectingSlot(null);
  };

  const handleClearBatter = (slot: number) => {
    const holder = battingSlots.find(s => s.slot === slot)?.player;
    if (holder) {
      battingOrderMutation.mutate([{ playerId: holder.id, battingOrder: null }]);
    }
  };

  const handleAssignPitchingRole = (role: string, player: Player) => {
    const allSlots = [...rotationSlots, ...bullpenSlots];
    const previousHolder = allSlots.find(s => s.role === role)?.player;
    const assignments: { playerId: string; pitchingRole: string | null }[] = [];
    const existingSlot = allSlots.find(s => s.player?.id === player.id);
    if (existingSlot) {
      assignments.push({ playerId: player.id, pitchingRole: null });
    }
    if (previousHolder && previousHolder.id !== player.id) {
      if (existingSlot) {
        assignments.push({ playerId: previousHolder.id, pitchingRole: existingSlot.role });
      } else {
        assignments.push({ playerId: previousHolder.id, pitchingRole: null });
      }
    }
    assignments.push({ playerId: player.id, pitchingRole: role });
    pitchingRoleMutation.mutate(assignments);
    setSelectingSlot(null);
  };

  const handleClearPitchingRole = (role: string) => {
    const allSlots = [...rotationSlots, ...bullpenSlots];
    const holder = allSlots.find(s => s.role === role)?.player;
    if (holder) {
      pitchingRoleMutation.mutate([{ playerId: holder.id, pitchingRole: null }]);
    }
  };

  return (
    <div className="space-y-4" data-testid="depth-chart-view">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <RetroButton
            variant={lineupTab === "field" ? "primary" : "outline"}
            size="sm"
            onClick={() => { setLineupTab("field"); setSelectingSlot(null); }}
            data-testid="tab-field"
          >
            <LayoutGrid className="w-3 h-3 mr-1" />
            Field
          </RetroButton>
          <RetroButton
            variant={lineupTab === "lineup" ? "primary" : "outline"}
            size="sm"
            onClick={() => { setLineupTab("lineup"); setSelectingSlot(null); }}
            data-testid="tab-lineup"
          >
            <List className="w-3 h-3 mr-1" />
            Lineup
          </RetroButton>
          <RetroButton
            variant={lineupTab === "pitching" ? "primary" : "outline"}
            size="sm"
            onClick={() => { setLineupTab("pitching"); setSelectingSlot(null); }}
            data-testid="tab-pitching"
          >
            Pitching
          </RetroButton>
        </div>
        <div className="flex items-center gap-2">
          {isOwnTeam && (
            <RetroButton
              variant="outline"
              size="sm"
              onClick={() => autoLineupMutation.mutate()}
              disabled={autoLineupMutation.isPending}
              data-testid="button-auto-lineup"
            >
              <Wand2 className="w-3 h-3 mr-1" />
              {autoLineupMutation.isPending ? "Setting..." : "Auto-Set Lineup"}
            </RetroButton>
          )}
          <span className="text-gold text-lg">DEPTH CHART</span>
        </div>
      </div>

      {lineupTab === "field" && (
        <div className="grid gap-4">
          <div className="flex justify-center gap-4 flex-wrap">
            <PositionCard position="LF" players={getPlayersByPosition("LF")} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} draggable={canDrag} onReorder={handleReorder} />
            <PositionCard position="CF" players={getPlayersByPosition("CF")} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} draggable={canDrag} onReorder={handleReorder} />
            <PositionCard position="RF" players={getPlayersByPosition("RF")} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} draggable={canDrag} onReorder={handleReorder} />
          </div>

          <div className="flex justify-center gap-4 flex-wrap">
            <PositionCard position="3B" players={getPlayersByPosition("3B")} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} draggable={canDrag} onReorder={handleReorder} />
            <PositionCard position="SS" players={getPlayersByPosition("SS")} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} draggable={canDrag} onReorder={handleReorder} />
            <PositionCard position="2B" players={getPlayersByPosition("2B")} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} draggable={canDrag} onReorder={handleReorder} />
            <PositionCard position="1B" players={getPlayersByPosition("1B")} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} draggable={canDrag} onReorder={handleReorder} />
          </div>

          <div className="flex justify-center">
            <PositionCard position="C" players={getPlayersByPosition("C")} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} draggable={canDrag} onReorder={handleReorder} />
          </div>

          <div className="flex justify-center">
            <PositionCard position="DH" players={dhPlayers} onSelectPlayer={onSelectPlayer} teamPrimaryColor={teamPrimaryColor} />
          </div>
        </div>
      )}

      {lineupTab === "lineup" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-card/90 border border-border rounded-lg overflow-visible" data-testid="batting-order-section">
            <div className="bg-gold/20 px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-gold text-xs">BATTING ORDER</span>
              {canDrag && (
                <span className="text-xs text-muted-foreground">Drag or click to assign</span>
              )}
            </div>
            <div className="p-2 space-y-1">
              {battingSlots.map(({ slot, player }) => {
                const isActive = selectingSlot?.type === "batting" && selectingSlot.slot === slot;
                const isDragTarget = dragOverBattingSlot === slot;
                return (
                  <div
                    key={slot}
                    className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors cursor-pointer ${
                      isDragTarget ? 'border-gold bg-gold/20 scale-[1.01]' :
                      isActive ? 'border-gold bg-gold/10' : 'border-border bg-card/90 hover:border-border/80'
                    }`}
                    onClick={() => { setOpenLineupPosId(null); if (canDrag) setSelectingSlot(isActive ? null : { type: "batting", slot }); }}
                    onDragOver={(e) => {
                      if (!canDrag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverBattingSlot(slot);
                    }}
                    onDragLeave={() => setDragOverBattingSlot(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverBattingSlot(null);
                      if (dragBattingSource) {
                        handleAssignBatter(slot, dragBattingSource.player);
                        setDragBattingSource(null);
                        setSelectingSlot(null);
                      }
                    }}
                    data-testid={`slot-batting-${slot}`}
                  >
                    <span className="text-gold text-xs w-6 flex-shrink-0 text-center">{slot}</span>
                    {player ? (
                      <div
                        className="flex items-center gap-2 flex-1 min-w-0"
                        draggable={canDrag}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          setDragBattingSource({ player, fromSlot: slot });
                          setSelectingSlot(null);
                        }}
                        onDragEnd={() => { setDragBattingSource(null); setDragOverBattingSlot(null); }}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`batting-slot-player-${slot}`}
                      >
                        {canDrag && <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 cursor-grab" />}
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
                          className="w-6 h-6 flex-shrink-0"
                          jerseyColor={teamPrimaryColor}
                        />
                        <PositionBadge position={player.position} size="sm" />
                        {(() => {
                          const defPos = player.lineupPosition || player.position;
                          const DEF_POSITIONS = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "DH"];
                          const isOpen = openLineupPosId === player.id;
                          return (
                            <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                className={`text-xs font-bold px-1.5 py-0.5 rounded border transition-colors ${
                                  canDrag
                                    ? "border-border/60 bg-muted/30 hover:border-gold/60 hover:bg-gold/10 cursor-pointer text-muted-foreground hover:text-gold"
                                    : "border-transparent bg-muted/20 text-muted-foreground cursor-default"
                                }`}
                                onClick={() => canDrag && setOpenLineupPosId(isOpen ? null : player.id)}
                                title={canDrag ? "Click to change defensive position" : "Defensive position"}
                                data-testid={`lineup-pos-badge-${slot}`}
                              >
                                {defPos}
                              </button>
                              {canDrag && isOpen && (
                                <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded shadow-lg p-1 grid grid-cols-3 gap-0.5 min-w-[100px]">
                                  {DEF_POSITIONS.map(pos => (
                                    <button
                                      key={pos}
                                      className={`text-xs font-bold px-1.5 py-1 rounded transition-colors ${
                                        pos === defPos
                                          ? "bg-gold text-black"
                                          : "hover:bg-gold/20 text-muted-foreground hover:text-gold"
                                      }`}
                                      onClick={() => {
                                        lineupPositionMutation.mutate([{ playerId: player.id, lineupPosition: pos }]);
                                        setOpenLineupPosId(null);
                                      }}
                                      data-testid={`lineup-pos-option-${pos}`}
                                    >
                                      {pos}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <span className="text-xs truncate flex-1">{player.firstName.charAt(0)}. {player.lastName}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {isPitcher(player.position) ? `VEL ${player.velocity || 0} / CTL ${player.control || 0}` : `HIT ${player.hitForAvg || 0} / PWR ${player.power || 0} / SPD ${player.speed || 0}`}
                        </span>
                        <span className="text-xs text-muted-foreground">{player.eligibility}</span>
                        <span className="text-xs font-bold text-gold">{player.overall}</span>
                        {canDrag && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleClearBatter(slot); }}
                            className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                            data-testid={`clear-batting-${slot}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic flex-1">
                        {isDragTarget ? "Drop here" : "Empty"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-card/90 border border-border rounded-lg overflow-visible" data-testid="available-batters-section">
            <div className="bg-gold/20 px-3 py-2 border-b border-border">
              <span className="text-gold text-xs">
                {selectingSlot?.type === "batting" ? `SELECT FOR SLOT #${selectingSlot.slot}` : "AVAILABLE PLAYERS"}
              </span>
            </div>
            <div className="p-2 space-y-0.5 max-h-[420px] overflow-y-auto">
              {(selectingSlot?.type === "batting" ? [...unassignedBatters, ...battingSlots.filter(s => s.player && s.slot !== selectingSlot.slot).map(s => s.player!)] : unassignedBatters).length === 0 ? (
                <div className="text-muted-foreground text-xs py-4 text-center">
                  {selectingSlot?.type === "batting" ? "No available players" : "All position players assigned"}
                </div>
              ) : (
                (selectingSlot?.type === "batting"
                  ? [...unassignedBatters, ...battingSlots.filter(s => s.player && s.slot !== selectingSlot.slot).map(s => s.player!)]
                  : unassignedBatters
                ).map(p => {
                  const keyStats = `HIT ${p.hitForAvg || 0} / PWR ${p.power || 0} / SPD ${p.speed || 0}`;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors ${
                        canDrag ? 'cursor-grab hover:bg-gold/10 hover:border-gold/30 border-transparent' : 'cursor-pointer hover:bg-gold/10 border-transparent'
                      } ${dragBattingSource?.player.id === p.id ? 'opacity-40' : ''}`}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragBattingSource({ player: p });
                        setSelectingSlot(null);
                      }}
                      onDragEnd={() => { setDragBattingSource(null); setDragOverBattingSlot(null); }}
                      onClick={() => selectingSlot?.type === "batting" ? handleAssignBatter(selectingSlot.slot, p) : canDrag ? setSelectingSlot(null) : undefined}
                      data-testid={`available-batter-${p.id}`}
                    >
                      {canDrag && <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />}
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
                        className="w-5 h-5 flex-shrink-0"
                        jerseyColor={teamPrimaryColor}
                      />
                      <PositionBadge position={p.position} size="sm" />
                      <span className="text-xs truncate flex-1">{p.firstName.charAt(0)}. {p.lastName}</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{keyStats}</span>
                      <span className="text-xs font-bold text-gold">{p.overall}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {lineupTab === "pitching" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            {([
              { sectionLabel: "STARTING ROTATION", slots: rotationSlots, testId: "starting-rotation-section" },
              { sectionLabel: "BULLPEN", slots: bullpenSlots, testId: "bullpen-section" },
            ] as const).map(({ sectionLabel, slots, testId }) => (
              <div key={sectionLabel} className="bg-card/90 border border-border rounded-lg overflow-visible" data-testid={testId}>
                <div className="bg-gold/20 px-3 py-2 border-b border-border flex items-center justify-between">
                  <span className="text-gold text-xs">{sectionLabel}</span>
                  {canDrag && <span className="text-xs text-muted-foreground">Drag or click</span>}
                </div>
                <div className="p-2 space-y-1">
                  {slots.map(({ role, label, player }) => {
                    const isActive = selectingSlot?.type === "pitching" && selectingSlot.role === role;
                    const isDragTarget = dragOverPitchingRole === role;
                    return (
                      <div
                        key={role}
                        className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors cursor-pointer ${
                          isDragTarget ? 'border-gold bg-gold/20 scale-[1.01]' :
                          isActive ? 'border-gold bg-gold/10' : 'border-border bg-card/90 hover:border-border/80'
                        }`}
                        onClick={() => canDrag ? setSelectingSlot(isActive ? null : { type: "pitching", role }) : undefined}
                        onDragOver={(e) => {
                          if (!canDrag) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDragOverPitchingRole(role);
                        }}
                        onDragLeave={() => setDragOverPitchingRole(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverPitchingRole(null);
                          if (dragPitchingSource) {
                            handleAssignPitchingRole(role, dragPitchingSource.player);
                            setDragPitchingSource(null);
                            setSelectingSlot(null);
                          }
                        }}
                        data-testid={`slot-pitching-${role}`}
                      >
                        <span className="text-gold text-xs w-10 flex-shrink-0">{label}</span>
                        {player ? (
                          <div
                            className="flex items-center gap-2 flex-1 min-w-0"
                            draggable={canDrag}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              setDragPitchingSource({ player, fromRole: role });
                              setSelectingSlot(null);
                            }}
                            onDragEnd={() => { setDragPitchingSource(null); setDragOverPitchingRole(null); }}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`pitching-slot-player-${role}`}
                          >
                            {canDrag && <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 cursor-grab" />}
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
                              className="w-6 h-6 flex-shrink-0"
                              jerseyColor={teamPrimaryColor}
                            />
                            <PositionBadge position={player.position} size="sm" />
                            <span className="text-xs truncate flex-1">{player.firstName.charAt(0)}. {player.lastName}</span>
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              VEL {player.velocity || 0} / CTL {player.control || 0} / STM {player.stamina || 0}
                            </span>
                            <span className="text-xs text-muted-foreground">{player.eligibility}</span>
                            <span className={`text-xs font-semibold px-1 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`}>
                              {player.throwHand}HP
                            </span>
                            <span className="text-xs font-bold text-gold">{player.overall}</span>
                            <AvailStrip playerId={player.id} availMap={availMap} />
                            {canDrag && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleClearPitchingRole(role); }}
                                className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                                data-testid={`clear-pitching-${role}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic flex-1">
                            {isDragTarget ? "Drop here" : "Empty"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card/90 border border-border rounded-lg overflow-visible" data-testid="available-pitchers-section">
            <div className="bg-gold/20 px-3 py-2 border-b border-border">
              <span className="text-gold text-xs">
                {selectingSlot?.type === "pitching" ? `SELECT FOR ${[...rotationRoles, ...bullpenRoles].find(r => r.role === selectingSlot.role)?.label?.toUpperCase() || selectingSlot.role}` : "AVAILABLE PITCHERS"}
              </span>
            </div>
            <div className="p-2 space-y-0.5 max-h-[500px] overflow-y-auto">
              {(selectingSlot?.type === "pitching"
                ? [...unassignedPitchers, ...[...rotationSlots, ...bullpenSlots].filter(s => s.player && s.role !== selectingSlot.role).map(s => s.player!)]
                : unassignedPitchers
              ).length === 0 ? (
                <div className="text-muted-foreground text-xs py-4 text-center">
                  {selectingSlot?.type === "pitching" ? "No available pitchers" : "All pitchers assigned"}
                </div>
              ) : (
                (selectingSlot?.type === "pitching"
                  ? [...unassignedPitchers, ...[...rotationSlots, ...bullpenSlots].filter(s => s.player && s.role !== selectingSlot.role).map(s => s.player!)]
                  : unassignedPitchers
                ).map(p => {
                  const keyStats = `VEL ${p.velocity || 0} / CTL ${p.control || 0} / STM ${p.stamina || 0}`;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors ${
                        canDrag ? 'cursor-grab hover:bg-gold/10 hover:border-gold/30 border-transparent' : 'cursor-pointer hover:bg-gold/10 border-transparent'
                      } ${dragPitchingSource?.player.id === p.id ? 'opacity-40' : ''}`}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragPitchingSource({ player: p });
                        setSelectingSlot(null);
                      }}
                      onDragEnd={() => { setDragPitchingSource(null); setDragOverPitchingRole(null); }}
                      onClick={() => selectingSlot?.type === "pitching" ? handleAssignPitchingRole(selectingSlot.role, p) : undefined}
                      data-testid={`available-pitcher-${p.id}`}
                    >
                      {canDrag && <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />}
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
                        className="w-5 h-5 flex-shrink-0"
                        jerseyColor={teamPrimaryColor}
                      />
                      <PositionBadge position={p.position} size="sm" />
                      <span className="text-xs truncate flex-1">{p.firstName.charAt(0)}. {p.lastName}</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{keyStats}</span>
                      <span className={`text-xs font-semibold px-1 py-0.5 rounded border ${p.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`}>
                        {p.throwHand}HP
                      </span>
                      <span className="text-xs font-bold text-gold">{p.overall}</span>
                      <AvailStrip playerId={p.id} availMap={availMap} />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
