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

const positionsList = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const eligibilityList = ["FR", "SO", "JR", "SR"];
const skinToneOptions = ["light", "medium", "tan", "olive", "dark", "deep"];
const hairColorOptions = ["black", "brown", "blonde", "red", "gray", "white"];
const hairStyleOptions = ["short", "medium", "long", "fade", "buzz", "bald"];
const headwearOptions = ["cap", "helmet", "batting_helmet", "catchers_mask", "none"];

function PlayerEditModal({ player, open, onClose, onSave, isSaving }: PlayerEditModalProps) {
  const [formData, setFormData] = useState({
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position,
    eligibility: player.eligibility,
    jerseyNumber: player.jerseyNumber,
    hometown: player.hometown,
    homeState: player.homeState,
    batHand: player.batHand,
    throwHand: player.throwHand,
    skinTone: player.skinTone || "light",
    hairColor: player.hairColor || "brown",
    hairStyle: player.hairStyle || "short",
    headwear: player.headwear || "cap",
    overall: player.overall,
    starRating: player.starRating,
    hitForAvg: player.hitForAvg || 50,
    power: player.power || 50,
    speed: player.speed || 50,
    arm: player.arm || 50,
    fielding: player.fielding || 50,
    errorResistance: player.errorResistance || 50,
    clutch: player.clutch || 50,
    vsLHP: player.vsLHP || 50,
    grit: player.grit || 50,
    stealing: player.stealing || 50,
    running: player.running || 50,
    throwing: player.throwing || 50,
    recovery: player.recovery || 50,
    catcherAbility: player.catcherAbility || 50,
    velocity: player.velocity || 50,
    control: player.control || 50,
    stamina: player.stamina || 50,
    stuff: player.stuff || 50,
    wRISP: player.wRISP || 50,
    vsLefty: player.vsLefty || 50,
    poise: player.poise || 50,
    heater: player.heater || 50,
    agile: player.agile || 50,
    abilities: player.abilities || [],
  });

  const [activeTab, setActiveTab] = useState<"info" | "attrs" | "common" | "abilities">("info");
  const isPlayerPitcher = isPitcher(formData.position);
  const isPlayerCatcher = isCatcher(formData.position);

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Edit className="w-4 h-4" />
            Edit Player
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-1 mb-4 border-b border-border pb-2">
          {(["info", "attrs", "common", "abilities"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded ${
                activeTab === tab ? 'bg-gold text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`tab-${tab}`}
            >
              {tab === "info" ? "Info" : tab === "attrs" ? "Attributes" : tab === "common" ? "Common" : "Abilities"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === "info" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">First Name</label>
                  <RetroInput
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Last Name</label>
                  <RetroInput
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Position</label>
                  <select
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    data-testid="select-position"
                  >
                    {positionsList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Year</label>
                  <select
                    value={formData.eligibility}
                    onChange={(e) => setFormData({ ...formData, eligibility: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    data-testid="select-eligibility"
                  >
                    {eligibilityList.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Jersey #</label>
                  <RetroInput
                    type="number"
                    min={0}
                    max={99}
                    value={formData.jerseyNumber}
                    onChange={(e) => setFormData({ ...formData, jerseyNumber: parseInt(e.target.value) || 0 })}
                    data-testid="input-jersey"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Hometown</label>
                  <RetroInput
                    value={formData.hometown}
                    onChange={(e) => setFormData({ ...formData, hometown: e.target.value })}
                    data-testid="input-hometown"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">State</label>
                  <RetroInput
                    value={formData.homeState}
                    onChange={(e) => setFormData({ ...formData, homeState: e.target.value })}
                    data-testid="input-state"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Bats</label>
                  <select
                    value={formData.batHand}
                    onChange={(e) => setFormData({ ...formData, batHand: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    data-testid="select-bats"
                  >
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                    <option value="S">Switch</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Throws</label>
                  <select
                    value={formData.throwHand}
                    onChange={(e) => setFormData({ ...formData, throwHand: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    data-testid="select-throws"
                  >
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                  </select>
                </div>
              </div>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Appearance</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Skin Tone</label>
                  <select
                    value={formData.skinTone}
                    onChange={(e) => setFormData({ ...formData, skinTone: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize"
                    data-testid="select-skin"
                  >
                    {skinToneOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hair Color</label>
                  <select
                    value={formData.hairColor}
                    onChange={(e) => setFormData({ ...formData, hairColor: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize"
                    data-testid="select-hair-color"
                  >
                    {hairColorOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hair Style</label>
                  <select
                    value={formData.hairStyle}
                    onChange={(e) => setFormData({ ...formData, hairStyle: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize"
                    data-testid="select-hair-style"
                  >
                    {hairStyleOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Headwear</label>
                  <select
                    value={formData.headwear}
                    onChange={(e) => setFormData({ ...formData, headwear: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize"
                    data-testid="select-headwear"
                  >
                    {headwearOptions.map(h => <option key={h} value={h}>{h.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
            </>
          )}

          {activeTab === "attrs" && (
            <>
              {isPlayerPitcher ? (
                <>
                  <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Pitcher Attributes (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Velocity</label>
                      <RetroInput type="number" min={1} max={99} value={formData.velocity} onChange={(e) => setFormData({ ...formData, velocity: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Control</label>
                      <RetroInput type="number" min={1} max={99} value={formData.control} onChange={(e) => setFormData({ ...formData, control: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Stamina</label>
                      <RetroInput type="number" min={1} max={99} value={formData.stamina} onChange={(e) => setFormData({ ...formData, stamina: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Stuff</label>
                      <RetroInput type="number" min={1} max={99} value={formData.stuff} onChange={(e) => setFormData({ ...formData, stuff: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Fielder Attributes (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Contact</label>
                      <RetroInput type="number" min={1} max={99} value={formData.hitForAvg} onChange={(e) => setFormData({ ...formData, hitForAvg: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Power</label>
                      <RetroInput type="number" min={1} max={99} value={formData.power} onChange={(e) => setFormData({ ...formData, power: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Speed</label>
                      <RetroInput type="number" min={1} max={99} value={formData.speed} onChange={(e) => setFormData({ ...formData, speed: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Arm</label>
                      <RetroInput type="number" min={1} max={99} value={formData.arm} onChange={(e) => setFormData({ ...formData, arm: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Fielding</label>
                      <RetroInput type="number" min={1} max={99} value={formData.fielding} onChange={(e) => setFormData({ ...formData, fielding: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Error Resist</label>
                      <RetroInput type="number" min={1} max={99} value={formData.errorResistance} onChange={(e) => setFormData({ ...formData, errorResistance: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "common" && (
            <>
              {isPlayerPitcher ? (
                <>
                  <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Pitcher Common Abilities (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">W/RISP</label>
                      <RetroInput type="number" min={1} max={99} value={formData.wRISP} onChange={(e) => setFormData({ ...formData, wRISP: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">vs Lefty</label>
                      <RetroInput type="number" min={1} max={99} value={formData.vsLefty} onChange={(e) => setFormData({ ...formData, vsLefty: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Poise</label>
                      <RetroInput type="number" min={1} max={99} value={formData.poise} onChange={(e) => setFormData({ ...formData, poise: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Grit</label>
                      <RetroInput type="number" min={1} max={99} value={formData.grit} onChange={(e) => setFormData({ ...formData, grit: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Heater</label>
                      <RetroInput type="number" min={1} max={99} value={formData.heater} onChange={(e) => setFormData({ ...formData, heater: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Agile</label>
                      <RetroInput type="number" min={1} max={99} value={formData.agile} onChange={(e) => setFormData({ ...formData, agile: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Recovery</label>
                      <RetroInput type="number" min={1} max={99} value={formData.recovery} onChange={(e) => setFormData({ ...formData, recovery: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Fielder Common Abilities (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Clutch</label>
                      <RetroInput type="number" min={1} max={99} value={formData.clutch} onChange={(e) => setFormData({ ...formData, clutch: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">vs LHP</label>
                      <RetroInput type="number" min={1} max={99} value={formData.vsLHP} onChange={(e) => setFormData({ ...formData, vsLHP: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Grit</label>
                      <RetroInput type="number" min={1} max={99} value={formData.grit} onChange={(e) => setFormData({ ...formData, grit: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Stealing</label>
                      <RetroInput type="number" min={1} max={99} value={formData.stealing} onChange={(e) => setFormData({ ...formData, stealing: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Running</label>
                      <RetroInput type="number" min={1} max={99} value={formData.running} onChange={(e) => setFormData({ ...formData, running: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Throwing</label>
                      <RetroInput type="number" min={1} max={99} value={formData.throwing} onChange={(e) => setFormData({ ...formData, throwing: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Recovery</label>
                      <RetroInput type="number" min={1} max={99} value={formData.recovery} onChange={(e) => setFormData({ ...formData, recovery: parseInt(e.target.value) || 50 })} />
                    </div>
                    {isPlayerCatcher && (
                      <div>
                        <label className="text-xs text-muted-foreground">Catcher</label>
                        <RetroInput type="number" min={1} max={99} value={formData.catcherAbility} onChange={(e) => setFormData({ ...formData, catcherAbility: parseInt(e.target.value) || 50 })} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "abilities" && (
            <>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Special Abilities</h4>
              <div className="text-xs text-muted-foreground mb-2">
                Enter ability IDs separated by commas (e.g., explosive_fb, quick_hands)
              </div>
              <RetroInput
                value={(formData.abilities || []).join(", ")}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  abilities: e.target.value.split(",").map(a => a.trim()).filter(a => a) 
                })}
                placeholder="explosive_fb, monster_stuff"
                data-testid="input-abilities"
              />
              <div className="text-xs text-muted-foreground mt-2">
                Current: {(formData.abilities || []).length} abilities
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
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

interface PositionCardProps {
  position: string;
  players: Player[];
  onSelectPlayer: (p: Player) => void;
  maxPlayers?: number;
}

function PositionCard({ position, players, onSelectPlayer, maxPlayers = 3 }: PositionCardProps) {
  const displayPlayers = players.slice(0, maxPlayers);
  
  return (
    <div className="bg-card/90 border border-border rounded-lg overflow-hidden min-w-[140px]" data-testid={`depth-card-${position}`}>
      <div className="bg-gold/20 px-2 py-1 border-b border-border">
        <span className="font-pixel text-gold text-[10px]">{position}</span>
      </div>
      <div className="p-1">
        {displayPlayers.length === 0 ? (
          <div className="text-muted-foreground text-xs py-2 text-center">Empty</div>
        ) : (
          displayPlayers.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => onSelectPlayer(p)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                idx === 0 ? 'bg-gold/10 hover:bg-gold/20' : 'hover:bg-card'
              }`}
              data-testid={`depth-${position}-${idx}`}
            >
              <PlayerPortrait
                skinTone={p.skinTone || "light"}
                hairColor={p.hairColor || "brown"}
                hairStyle={p.hairStyle || "short"}
                className="w-6 h-6 flex-shrink-0"
              />
              <span className={`text-xs truncate flex-1 ${idx === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                {p.firstName.charAt(0)}. {p.lastName}
              </span>
              <span className={`text-xs font-bold ${idx === 0 ? 'text-gold' : 'text-muted-foreground'}`}>
                {p.overall}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function DepthChartView({ players, onSelectPlayer }: { players: Player[]; onSelectPlayer: (p: Player) => void }) {
  const getPlayersByPosition = (pos: string): Player[] => {
    return players
      .filter(p => p.position === pos)
      .sort((a, b) => b.overall - a.overall);
  };

  const pitchers = players.filter(p => isPitcher(p.position)).sort((a, b) => b.overall - a.overall);
  const starters = pitchers.slice(0, 5);
  const bullpen = pitchers.slice(5, 10);

  const catchers = getPlayersByPosition("C");
  
  return (
    <div className="space-y-4" data-testid="depth-chart-view">
      <div className="text-right">
        <span className="font-pixel text-gold text-lg">DEPTH CHART</span>
      </div>
      
      <div className="grid gap-4">
        <div className="flex justify-center gap-4 flex-wrap">
          <PositionCard position="LF" players={getPlayersByPosition("LF")} onSelectPlayer={onSelectPlayer} />
          <PositionCard position="CF" players={getPlayersByPosition("CF")} onSelectPlayer={onSelectPlayer} />
          <PositionCard position="RF" players={getPlayersByPosition("RF")} onSelectPlayer={onSelectPlayer} />
        </div>
        
        <div className="flex justify-center gap-4 flex-wrap items-start">
          <PositionCard position="3B" players={getPlayersByPosition("3B")} onSelectPlayer={onSelectPlayer} />
          
          <div className="flex flex-col gap-4">
            <PositionCard position="SS" players={getPlayersByPosition("SS")} onSelectPlayer={onSelectPlayer} />
            <PositionCard position="2B" players={getPlayersByPosition("2B")} onSelectPlayer={onSelectPlayer} />
          </div>
          
          <div className="bg-card/90 border border-border rounded-lg overflow-hidden min-w-[160px]" data-testid="depth-card-SP">
            <div className="bg-gold/20 px-2 py-1 border-b border-border">
              <span className="font-pixel text-gold text-[10px]">STARTING PITCHERS</span>
            </div>
            <div className="p-1">
              {starters.length === 0 ? (
                <div className="text-muted-foreground text-xs py-2 text-center">No pitchers</div>
              ) : (
                starters.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectPlayer(p)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                      idx === 0 ? 'bg-gold/10 hover:bg-gold/20' : 'hover:bg-card'
                    }`}
                    data-testid={`depth-SP-${idx}`}
                  >
                    <PlayerPortrait
                      skinTone={p.skinTone || "light"}
                      hairColor={p.hairColor || "brown"}
                      hairStyle={p.hairStyle || "short"}
                      className="w-6 h-6 flex-shrink-0"
                    />
                    <span className={`text-xs truncate flex-1 ${idx === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {p.firstName.charAt(0)}. {p.lastName}
                    </span>
                    <span className={`text-xs font-bold ${idx === 0 ? 'text-gold' : 'text-muted-foreground'}`}>
                      {p.overall}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
          
          <PositionCard position="1B" players={getPlayersByPosition("1B")} onSelectPlayer={onSelectPlayer} />
        </div>
        
        <div className="flex justify-center gap-4 flex-wrap items-start">
          <div className="bg-card/90 border border-border rounded-lg overflow-hidden min-w-[140px]" data-testid="depth-card-C">
            <div className="bg-gold/20 px-2 py-1 border-b border-border">
              <span className="font-pixel text-gold text-[10px]">C</span>
            </div>
            <div className="p-1">
              {catchers.length === 0 ? (
                <div className="text-muted-foreground text-xs py-2 text-center">Empty</div>
              ) : (
                catchers.slice(0, 3).map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectPlayer(p)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                      idx === 0 ? 'bg-gold/10 hover:bg-gold/20' : 'hover:bg-card'
                    }`}
                    data-testid={`depth-C-${idx}`}
                  >
                    <PlayerPortrait
                      skinTone={p.skinTone || "light"}
                      hairColor={p.hairColor || "brown"}
                      hairStyle={p.hairStyle || "short"}
                      className="w-6 h-6 flex-shrink-0"
                    />
                    <span className={`text-xs truncate flex-1 ${idx === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {p.firstName.charAt(0)}. {p.lastName}
                    </span>
                    <span className={`text-xs font-bold ${idx === 0 ? 'text-gold' : 'text-muted-foreground'}`}>
                      {p.overall}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
          
          <div className="bg-card/90 border border-border rounded-lg overflow-hidden min-w-[140px]" data-testid="depth-card-RP">
            <div className="bg-gold/20 px-2 py-1 border-b border-border">
              <span className="font-pixel text-gold text-[10px]">RP</span>
            </div>
            <div className="p-1 max-h-40 overflow-y-auto">
              {bullpen.length === 0 ? (
                <div className="text-muted-foreground text-xs py-2 text-center">No relievers</div>
              ) : (
                bullpen.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectPlayer(p)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-card transition-colors"
                    data-testid={`depth-RP-${idx}`}
                  >
                    <PlayerPortrait
                      skinTone={p.skinTone || "light"}
                      hairColor={p.hairColor || "brown"}
                      hairStyle={p.hairStyle || "short"}
                      className="w-6 h-6 flex-shrink-0"
                    />
                    <span className="text-xs truncate flex-1 text-muted-foreground">
                      {p.firstName.charAt(0)}. {p.lastName}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {p.overall}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
