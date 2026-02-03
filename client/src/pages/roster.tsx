import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroSelect } from "@/components/ui/retro-select";
import { RetroInput } from "@/components/ui/retro-input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PositionBadge } from "@/components/ui/position-badge";
import { TeamBadge } from "@/components/ui/team-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Users, 
  Filter,
  Eye,
  GraduationCap,
  MapPin,
  Star,
  Edit,
  LayoutGrid,
  List
} from "lucide-react";
import type { Player, Team, Coach, League } from "@shared/schema";
import { isPitcher, isCatcher, isInfielder, isOutfielder } from "@shared/positions";

interface RosterData {
  players: Player[];
  team: Team;
}

interface LeagueTeam {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  coach?: { firstName: string; lastName: string } | null;
}

const positionOptions = [
  { value: "all", label: "All Positions" },
  { value: "P", label: "Pitchers" },
  { value: "C", label: "Catchers" },
  { value: "IF", label: "Infielders" },
  { value: "OF", label: "Outfielders" },
];

const eligibilityOptions = [
  { value: "all", label: "All Years" },
  { value: "FR", label: "Freshman" },
  { value: "SO", label: "Sophomore" },
  { value: "JR", label: "Junior" },
  { value: "SR", label: "Senior" },
];

export default function RosterPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");
  const [eligibilityFilter, setEligibilityFilter] = useState("all");
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "depth">("list");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const rosterUrl = viewingTeamId 
    ? `/api/leagues/${id}/roster?teamId=${viewingTeamId}`
    : `/api/leagues/${id}/roster`;
    
  const { data, isLoading } = useQuery<RosterData>({
    queryKey: [rosterUrl],
  });
  
  const { data: leagueData } = useQuery<{ teams: LeagueTeam[]; league?: League }>({
    queryKey: ["/api/leagues", id],
  });

  const { data: authData } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const isCommissioner = authData?.id && leagueData?.league?.commissionerId === authData.id;

  const updatePlayerMutation = useMutation({
    mutationFn: async (updates: Partial<Player> & { id: string }) => {
      return apiRequest("PATCH", `/api/leagues/${id}/players/${updates.id}`, updates);
    },
    onSuccess: () => {
      toast({ title: "Player updated", description: "Player data has been saved." });
      queryClient.invalidateQueries({ queryKey: [rosterUrl] });
      setEditingPlayer(null);
      setSelectedPlayer(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update player", variant: "destructive" });
    },
  });

  const filteredPlayers = data?.players.filter(p => {
    if (positionFilter !== "all") {
      if (positionFilter === "IF" && !isInfielder(p.position)) return false;
      if (positionFilter === "OF" && !isOutfielder(p.position)) return false;
      if (positionFilter !== "IF" && positionFilter !== "OF" && p.position !== positionFilter) return false;
    }
    if (eligibilityFilter !== "all" && p.eligibility !== eligibilityFilter) return false;
    return true;
  }) || [];

  const groupPlayersByCategory = (players: Player[]) => {
    const pitchers = players.filter(p => isPitcher(p.position)).sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);
    const catchers = players.filter(p => isCatcher(p.position)).sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);
    const infielders = players.filter(p => isInfielder(p.position)).sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);
    const outfielders = players.filter(p => isOutfielder(p.position)).sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);
    return { pitchers, catchers, infielders, outfielders };
  };

  const grouped = groupPlayersByCategory(filteredPlayers);
  const allSorted = [...filteredPlayers].sort((a, b) => b.starRating - a.starRating || b.overall - a.overall);

  if (isLoading) {
    return <RosterSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-lg">
              {data?.team ? `${data.team.name} Roster` : 'Roster'}
            </h1>
            <div className="ml-auto flex items-center gap-4">
              {leagueData?.teams && leagueData.teams.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">View:</span>
                  <select
                    value={viewingTeamId || ""}
                    onChange={(e) => setViewingTeamId(e.target.value || null)}
                    className="bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-gold"
                    data-testid="select-view-roster"
                  >
                    <option value="" className="bg-forest-card">My Team</option>
                    {leagueData.teams.map(t => (
                      <option key={t.id} value={t.id} className="bg-forest-card">
                        {t.name} ({t.abbreviation})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <span className="text-sm text-muted-foreground">
                {data?.players.length || 0} Players
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <RetroCard className="mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <RetroSelect
              options={positionOptions}
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-40"
              data-testid="select-position-filter"
            />
            <RetroSelect
              options={eligibilityOptions}
              value={eligibilityFilter}
              onChange={(e) => setEligibilityFilter(e.target.value)}
              className="w-40"
              data-testid="select-eligibility-filter"
            />
            <div className="flex items-center gap-2 ml-auto">
              <RetroButton
                variant={viewMode === "list" ? "primary" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
                data-testid="button-list-view"
              >
                <List className="w-3 h-3 mr-1" />
                List
              </RetroButton>
              <RetroButton
                variant={viewMode === "depth" ? "primary" : "outline"}
                size="sm"
                onClick={() => setViewMode("depth")}
                data-testid="button-depth-view"
              >
                <LayoutGrid className="w-3 h-3 mr-1" />
                Depth Chart
              </RetroButton>
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredPlayers.length} players shown
            </span>
          </div>
        </RetroCard>

        {viewMode === "depth" ? (
          <DepthChartView players={data?.players || []} onSelectPlayer={setSelectedPlayer} />
        ) : positionFilter === "all" ? (
          <>
            <PositionSection 
              title="Pitchers" 
              players={grouped.pitchers} 
              onSelectPlayer={setSelectedPlayer}
            />
            <PositionSection 
              title="Catchers" 
              players={grouped.catchers} 
              onSelectPlayer={setSelectedPlayer}
            />
            <PositionSection 
              title="Infielders" 
              players={grouped.infielders} 
              onSelectPlayer={setSelectedPlayer}
            />
            <PositionSection 
              title="Outfielders" 
              players={grouped.outfielders} 
              onSelectPlayer={setSelectedPlayer}
            />
          </>
        ) : (
          <PositionSection 
            title={positionOptions.find(o => o.value === positionFilter)?.label || "Players"} 
            players={allSorted} 
            onSelectPlayer={setSelectedPlayer}
          />
        )}

        {filteredPlayers.length === 0 && (
          <RetroCard>
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No players match your filters</p>
            </div>
          </RetroCard>
        )}
      </main>

      {selectedPlayer && (
        <PlayerProfileCard
          player={{
            ...selectedPlayer,
            bats: selectedPlayer.batHand,
            throws: selectedPlayer.throwHand,
          }}
          open={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          isCommissioner={!!isCommissioner}
          onEdit={() => {
            setEditingPlayer(selectedPlayer);
            setSelectedPlayer(null);
          }}
        />
      )}

      {editingPlayer && (
        <PlayerEditModal
          player={editingPlayer}
          open={!!editingPlayer}
          onClose={() => setEditingPlayer(null)}
          onSave={(updates) => updatePlayerMutation.mutate({ ...updates, id: editingPlayer.id })}
          isSaving={updatePlayerMutation.isPending}
        />
      )}
    </div>
  );
}


interface PositionSectionProps {
  title: string;
  players: Player[];
  onSelectPlayer: (player: Player) => void;
}

function PositionSection({ title, players, onSelectPlayer }: PositionSectionProps) {
  if (players.length === 0) return null;

  return (
    <RetroCard className="mb-4">
      <div className="px-4 py-2 bg-card/80 border-b border-border">
        <h3 className="font-pixel text-gold text-xs uppercase tracking-wider">
          {title} ({players.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
              <th className="text-left py-3 px-2 hidden lg:table-cell">Hometown</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr 
                key={player.id} 
                className="border-b border-border/50 hover:bg-card/50"
                data-testid={`row-player-${player.id}`}
              >
                <td className="py-3 px-2 text-muted-foreground font-mono">
                  {player.jerseyNumber}
                </td>
                <td className="py-3 px-2">
                  <button
                    onClick={() => onSelectPlayer(player)}
                    className="font-medium text-left hover:text-gold transition-colors cursor-pointer flex items-center gap-2"
                    data-testid={`link-player-${player.id}`}
                  >
                    <PlayerPortrait
                      skinTone={player.skinTone || "light"}
                      hairColor={player.hairColor || "brown"}
                      hairStyle={player.hairStyle || "short"}
                      className="w-8 h-8 flex-shrink-0"
                    />
                    {player.firstName} {player.lastName}
                  </button>
                </td>
                <td className="text-center py-3 px-2">
                  <PositionBadge position={player.position} size="sm" />
                </td>
                <td className="text-center py-3 px-2 text-muted-foreground">
                  {player.eligibility}
                </td>
                <td className="text-center py-3 px-2 text-muted-foreground">
                  {player.batHand}/{player.throwHand}
                </td>
                <td className="text-center py-3 px-2">
                  <span className="font-bold text-gold">{player.overall}</span>
                </td>
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

function RosterSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Skeleton className="h-16 mb-6" />
        <Skeleton className="h-96" />
      </main>
    </div>
  );
}

interface PlayerEditModalProps {
  player: Player;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Player>) => void;
  isSaving: boolean;
}

function PlayerEditModal({ player, open, onClose, onSave, isSaving }: PlayerEditModalProps) {
  const [formData, setFormData] = useState({
    overall: player.overall,
    starRating: player.starRating,
    hitForAvg: player.hitForAvg || 50,
    power: player.power || 50,
    speed: player.speed || 50,
    arm: player.arm || 50,
    fielding: player.fielding || 50,
    errorResistance: player.errorResistance || 50,
    velocity: player.velocity || 50,
    control: player.control || 50,
    stamina: player.stamina || 50,
    stuff: player.stuff || 50,
  });

  const isPlayerPitcher = isPitcher(player.position);

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Edit className="w-4 h-4" />
            Edit Player: {player.firstName} {player.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Overall (1-999)</label>
              <RetroInput
                type="number"
                min={1}
                max={999}
                value={formData.overall}
                onChange={(e) => setFormData({ ...formData, overall: parseInt(e.target.value) || 1 })}
                data-testid="input-overall"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Star Rating (1-5)</label>
              <RetroInput
                type="number"
                min={1}
                max={5}
                value={formData.starRating}
                onChange={(e) => setFormData({ ...formData, starRating: parseInt(e.target.value) || 1 })}
                data-testid="input-star-rating"
              />
            </div>
          </div>

          {isPlayerPitcher ? (
            <>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Pitcher Attributes</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Velocity</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.velocity}
                    onChange={(e) => setFormData({ ...formData, velocity: parseInt(e.target.value) || 50 })}
                    data-testid="input-velocity"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Control</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.control}
                    onChange={(e) => setFormData({ ...formData, control: parseInt(e.target.value) || 50 })}
                    data-testid="input-control"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Stamina</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.stamina}
                    onChange={(e) => setFormData({ ...formData, stamina: parseInt(e.target.value) || 50 })}
                    data-testid="input-stamina"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Stuff</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.stuff}
                    onChange={(e) => setFormData({ ...formData, stuff: parseInt(e.target.value) || 50 })}
                    data-testid="input-stuff"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Fielder Attributes</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Contact</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.hitForAvg}
                    onChange={(e) => setFormData({ ...formData, hitForAvg: parseInt(e.target.value) || 50 })}
                    data-testid="input-contact"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Power</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.power}
                    onChange={(e) => setFormData({ ...formData, power: parseInt(e.target.value) || 50 })}
                    data-testid="input-power"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Speed</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.speed}
                    onChange={(e) => setFormData({ ...formData, speed: parseInt(e.target.value) || 50 })}
                    data-testid="input-speed"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Arm</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.arm}
                    onChange={(e) => setFormData({ ...formData, arm: parseInt(e.target.value) || 50 })}
                    data-testid="input-arm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Fielding</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.fielding}
                    onChange={(e) => setFormData({ ...formData, fielding: parseInt(e.target.value) || 50 })}
                    data-testid="input-fielding"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Error Resist</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={99}
                    value={formData.errorResistance}
                    onChange={(e) => setFormData({ ...formData, errorResistance: parseInt(e.target.value) || 50 })}
                    data-testid="input-error-resist"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <RetroButton variant="outline" onClick={onClose} data-testid="button-cancel-edit">
              Cancel
            </RetroButton>
            <RetroButton onClick={handleSubmit} disabled={isSaving} data-testid="button-save-player">
              {isSaving ? "Saving..." : "Save Changes"}
            </RetroButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DepthChartView({ players, onSelectPlayer }: { players: Player[]; onSelectPlayer: (p: Player) => void }) {
  const positions = [
    { pos: "LF", x: 15, y: 25, label: "Left Field" },
    { pos: "CF", x: 50, y: 10, label: "Center Field" },
    { pos: "RF", x: 85, y: 25, label: "Right Field" },
    { pos: "SS", x: 35, y: 55, label: "Shortstop" },
    { pos: "2B", x: 65, y: 55, label: "Second Base" },
    { pos: "3B", x: 15, y: 65, label: "Third Base" },
    { pos: "1B", x: 85, y: 65, label: "First Base" },
    { pos: "C", x: 50, y: 85, label: "Catcher" },
    { pos: "P", x: 50, y: 68, label: "Pitcher" },
  ];

  const getPlayersByPosition = (pos: string): Player[] => {
    return players
      .filter(p => p.position === pos)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 3);
  };

  const pitchers = players.filter(p => isPitcher(p.position)).sort((a, b) => b.overall - a.overall);
  const starters = pitchers.slice(0, 5);
  const bullpen = pitchers.slice(5);

  return (
    <div className="space-y-6">
      <RetroCard>
        <div className="font-pixel text-gold text-sm mb-4">FIELD POSITIONS</div>
        <div className="relative w-full aspect-[4/3] bg-gradient-to-b from-green-900 to-green-800 rounded-lg overflow-hidden" data-testid="depth-chart-field">
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <div className="w-[60%] h-[60%] border-2 border-white/30 rounded-full" />
            <div className="absolute w-[30%] h-[30%] border-2 border-white/30" style={{ clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />
          </div>
          
          {positions.map(({ pos, x, y, label }) => {
            const posPlayers = getPlayersByPosition(pos);
            const starter = posPlayers[0];
            
            return (
              <div
                key={pos}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <div className="text-center">
                  <div className="font-pixel text-[8px] text-white/70 mb-1">{pos}</div>
                  {starter ? (
                    <button
                      onClick={() => onSelectPlayer(starter)}
                      className="group"
                      data-testid={`depth-${pos}-starter`}
                    >
                      <div className="w-10 h-10 mx-auto mb-1">
                        <PlayerPortrait
                          skinTone={starter.skinTone || "light"}
                          hairColor={starter.hairColor || "brown"}
                          hairStyle={starter.hairStyle || "short"}
                          className="w-10 h-10 border-2 border-gold rounded-full group-hover:border-white transition-colors"
                        />
                      </div>
                      <div className="text-[8px] text-white truncate max-w-[60px]">
                        {starter.lastName}
                      </div>
                      <div className="text-[10px] font-bold text-gold">{starter.overall}</div>
                    </button>
                  ) : (
                    <div className="w-10 h-10 mx-auto border-2 border-dashed border-white/30 rounded-full flex items-center justify-center">
                      <span className="text-white/30 text-[10px]">?</span>
                    </div>
                  )}
                  {posPlayers.length > 1 && (
                    <div className="text-[8px] text-white/50 mt-1">+{posPlayers.length - 1} backup</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </RetroCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RetroCard>
          <div className="font-pixel text-gold text-sm mb-3">STARTING ROTATION</div>
          <div className="space-y-2">
            {starters.length === 0 ? (
              <p className="text-muted-foreground text-sm">No pitchers on roster</p>
            ) : (
              starters.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPlayer(p)}
                  className="w-full flex items-center gap-3 p-2 rounded hover:bg-gold/10 transition-colors"
                  data-testid={`starter-${i + 1}`}
                >
                  <span className="font-pixel text-gold text-sm w-6">SP{i + 1}</span>
                  <PlayerPortrait
                    skinTone={p.skinTone || "light"}
                    hairColor={p.hairColor || "brown"}
                    hairStyle={p.hairStyle || "short"}
                    className="w-8 h-8"
                  />
                  <span className="flex-1 text-left text-sm">{p.firstName} {p.lastName}</span>
                  <span className="font-bold text-gold">{p.overall}</span>
                </button>
              ))
            )}
          </div>
        </RetroCard>

        <RetroCard>
          <div className="font-pixel text-gold text-sm mb-3">BULLPEN</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {bullpen.length === 0 ? (
              <p className="text-muted-foreground text-sm">No bullpen pitchers</p>
            ) : (
              bullpen.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPlayer(p)}
                  className="w-full flex items-center gap-3 p-2 rounded hover:bg-gold/10 transition-colors"
                  data-testid={`bullpen-${i + 1}`}
                >
                  <span className="font-pixel text-muted-foreground text-[10px] w-6">RP</span>
                  <PlayerPortrait
                    skinTone={p.skinTone || "light"}
                    hairColor={p.hairColor || "brown"}
                    hairStyle={p.hairStyle || "short"}
                    className="w-8 h-8"
                  />
                  <span className="flex-1 text-left text-sm">{p.firstName} {p.lastName}</span>
                  <span className="font-bold text-gold">{p.overall}</span>
                </button>
              ))
            )}
          </div>
        </RetroCard>
      </div>
    </div>
  );
}
