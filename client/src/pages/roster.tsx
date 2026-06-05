import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation, useSearch } from "wouter";
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
  List,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Wand2,
  X,
  FolderDown,
  TrendingUp,
  Zap,
  Shield,
  ShieldOff,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Player, Team, Coach, League } from "@shared/schema";
import { isPitcher, isCatcher, isInfielder, isOutfielder } from "@shared/positions";
import { getPotentialGrade, getProgressionZone, getProgressionColor } from "@shared/potential";
import { TRAJECTORY_LABELS } from "@shared/trajectory";
import { computePitcherAvailability, ALL_GAME_DAYS } from "@shared/pitcherRest";
import type { GameDay } from "@shared/pitcherRest";

const TRAJECTORY_ICONS: Record<number, React.ReactNode> = {
  1: <ArrowDownRight className="w-2.5 h-2.5 inline-block" />,
  2: <ArrowRight className="w-2.5 h-2.5 inline-block" />,
  3: <ArrowUpRight className="w-2.5 h-2.5 inline-block" />,
  4: <ArrowUp className="w-2.5 h-2.5 inline-block" />,
};

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

const DEVELOPMENT_PHASES = new Set([
  "offseason",
  "offseason_departures",
  "offseason_walkons",
  "signing_day",
]);

function ovrToStar(ovr: number): number {
  if (ovr >= 500) return 5;
  if (ovr >= 400) return 4;
  if (ovr >= 300) return 3;
  if (ovr >= 200) return 2;
  return 1;
}

const ATTR_LABELS: Record<string, string> = {
  hitForAvg: "Contact",
  power: "Power",
  speed: "Speed",
  arm: "Arm",
  fielding: "Fielding",
  errorResistance: "Errors",
  clutch: "Clutch",
  vsLHP: "vs LHP",
  grit: "Grit",
  stealing: "Stealing",
  running: "Running",
  throwing: "Throwing",
  recovery: "Recovery",
  catcherAbility: "Catcher",
  velocity: "Velocity",
  control: "Control",
  stamina: "Stamina",
  stuff: "Stuff",
  wRISP: "W/RISP",
  vsLefty: "vs Lefty",
  poise: "Poise",
  heater: "Heater",
  agile: "Agile",
};

function getTopAttrDeltas(
  deltas: Record<string, number> | null | undefined,
  limit = 3
): Array<{ label: string; delta: number }> {
  if (!deltas) return [];
  return Object.entries(deltas)
    .filter(([key, val]) => key !== "overall" && val !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, limit)
    .map(([key, val]) => ({
      label: ATTR_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").trim(),
      delta: val,
    }));
}

export default function RosterPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");
  const [eligibilityFilter, setEligibilityFilter] = useState("all");
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "depth" | "development">(() => {
    const params = new URLSearchParams(search);
    if (params.get("view") === "depth") return "depth";
    if (params.get("view") === "development") return "development";
    return "list";
  });
  const initialLineupTab = useMemo<"field" | "lineup" | "pitching">(() => {
    const params = new URLSearchParams(search);
    const sub = params.get("sub");
    if (sub === "lineup") return "lineup";
    if (sub === "pitching") return "pitching";
    return "field";
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("view") === "depth") setViewMode("depth");
    else if (params.get("view") === "development") setViewMode("development");
  }, [search]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const rosterUrl = viewingTeamId 
    ? `/api/leagues/${id}/roster?teamId=${viewingTeamId}`
    : `/api/leagues/${id}/roster`;
    
  const { data, isLoading } = useQuery<RosterData>({
    queryKey: [rosterUrl],
  });
  
  const { data: leagueData } = useQuery<{ teams: LeagueTeam[]; league?: League; progressionEnabled?: boolean }>({
    queryKey: ["/api/leagues", id],
  });

  const { data: authData } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const isCommissioner = authData?.id && leagueData?.league?.commissionerId === authData.id;

  const hasAnyProgressionData = (data?.players || []).some(
    p => p.progressionDeltas != null && (p.progressionDeltas as any).overall != null
  );
  const canViewDevelopment =
    !viewingTeamId &&
    !!leagueData?.progressionEnabled &&
    (DEVELOPMENT_PHASES.has(leagueData?.league?.currentPhase ?? "") || hasAnyProgressionData);

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

  const saveRosterMutation = useMutation({
    mutationFn: async (name: string) => {
      const team = data?.team;
      const players = data?.players || [];
      return apiRequest("POST", `/api/saved-rosters`, {
        name,
        basedOn: team ? `${team.name} (Season ${leagueData?.league?.currentSeason ?? 1})` : "NCAA 2026",
        rosterData: players,
      });
    },
    onSuccess: () => {
      toast({ title: "Roster Saved", description: `Roster file saved to your dashboard.` });
      setShowSaveDialog(false);
      setSaveFileName("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save roster file.", variant: "destructive" });
    },
  });

  const setCaptainMutation = useMutation({
    mutationFn: async ({ playerId, action }: { playerId: string; action: "set" | "clear" }) => {
      const teamId = data?.team?.id;
      if (!teamId) throw new Error("No team");
      return apiRequest("POST", `/api/leagues/${id}/teams/${teamId}/captain`, { playerId, action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [rosterUrl] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update captain.", variant: "destructive" });
    },
  });

  const declareDraftMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await apiRequest("POST", `/api/leagues/${id}/players/${playerId}/declare-draft`, {});
      return response.json() as Promise<{ message: string }>;
    },
    onSuccess: (result) => {
      toast({ title: "Draft Declaration", description: result.message });
      queryClient.invalidateQueries({ queryKey: [rosterUrl] });
      setSelectedPlayer(null);
    },
    onError: (error: Error) => {
      toast({ title: "Cannot Declare", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  // Check if a player is eligible to declare for the draft
  // Must be: RS (redshirt) + high skill (4+ stars OR 700+ overall) + not already declared
  const canPlayerDeclareDraft = (player: Player): boolean => {
    const isRedshirt = player.eligibility === "RS";
    const isHighSkill = player.starRating >= 4 || player.overall >= 500;
    const notDeclared = !player.declaredForDraft;
    return isRedshirt && isHighSkill && notDeclared;
  };

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

  const positionPlayersAll = (data?.players || []).filter(p => !isPitcher(p.position));
  const allPitchersAll = (data?.players || []).filter(p => isPitcher(p.position));
  const assignedBattingCount = positionPlayersAll.filter(p => p.battingOrder != null && p.battingOrder >= 1 && p.battingOrder <= 9).length;
  const requiredRotationRoles = ["FRI", "SAT", "SUN", "MID"];
  const assignedRotationCount = requiredRotationRoles.filter(role => allPitchersAll.some(p => p.pitchingRole === role)).length;
  const battingIncomplete = !viewingTeamId && positionPlayersAll.length >= 9 && assignedBattingCount < 9;
  const pitchingIncomplete = !viewingTeamId && allPitchersAll.length >= 4 && assignedRotationCount < 4;
  const isLineupIncomplete = battingIncomplete || pitchingIncomplete;

  if (isLoading) {
    return <RosterSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-base sm:text-lg truncate">
              {data?.team ? `${data.team.name} Roster` : 'Roster'}
            </h1>
            {isLineupIncomplete && (
              <button
                onClick={() => { setViewMode("depth"); }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-[10px] font-pixel hover:bg-yellow-500/30 transition-colors"
                data-testid="badge-lineup-incomplete"
              >
                ⚠ Lineup Incomplete{battingIncomplete ? ` (Bat ${assignedBattingCount}/9)` : ""}{pitchingIncomplete ? ` (Rot ${assignedRotationCount}/4)` : ""}
              </button>
            )}
            <div className="ml-auto flex items-center gap-2 sm:gap-4 flex-wrap">
              {leagueData?.teams && leagueData.teams.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground hidden sm:inline">View:</span>
                  <select
                    value={viewingTeamId || ""}
                    onChange={(e) => setViewingTeamId(e.target.value || null)}
                    className="bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-gold max-w-[140px]"
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
              {!viewingTeamId && data?.players && (
                <RetroButton
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSaveFileName(`${data.team?.name || "My Team"} - Season ${leagueData?.league?.currentSeason ?? 1}`);
                    setShowSaveDialog(true);
                  }}
                  data-testid="button-save-roster-file"
                >
                  <FolderDown className="w-3 h-3 mr-1" />
                  Save File
                </RetroButton>
              )}
              <span className="text-sm text-muted-foreground shrink-0">
                {data?.players.length || 0} Players
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
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
              {canViewDevelopment && (
                <RetroButton
                  variant={viewMode === "development" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("development")}
                  data-testid="button-development-view"
                >
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Development
                </RetroButton>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredPlayers.length} players shown
            </span>
          </div>
        </RetroCard>

        {/* Captain Slots — only for own team, list view */}
        {!viewingTeamId && viewMode === "list" && data?.players && (() => {
          const pitcherCaptain = data.players.find(p => p.captainRole === "pitcher_captain");
          const fielderCaptain = data.players.find(p => p.captainRole === "fielder_captain");
          return (
            <RetroCard className="mb-4">
              <div className="px-4 py-2 bg-card/80 border-b border-border flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-gold" />
                <h3 className="font-pixel text-gold text-xs uppercase tracking-wider">Team Captains</h3>
                <span className="text-[10px] text-muted-foreground ml-1">(+15% portal retention · leadership role promise)</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border/30">
                {[
                  { label: "Pitcher Captain", captain: pitcherCaptain },
                  { label: "Fielder Captain", captain: fielderCaptain },
                ].map(({ label, captain }) => (
                  <div key={label} className="p-3 bg-card/60 flex items-center gap-3">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="font-pixel text-[8px] text-muted-foreground uppercase">{label}</span>
                      {captain ? (
                        <span className="text-sm font-medium truncate">{captain.firstName} {captain.lastName} <span className="text-muted-foreground text-xs">({captain.position})</span></span>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">Open — select from roster below</span>
                      )}
                    </div>
                    {captain && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setCaptainMutation.mutate({ playerId: captain.id, action: "clear" })}
                            className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
                            data-testid={`button-clear-captain-${captain.id}`}
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Remove captain</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            </RetroCard>
          );
        })()}

        {viewMode === "development" && canViewDevelopment ? (
          <DevelopmentTab
            players={filteredPlayers}
            onSelectPlayer={setSelectedPlayer}
            teamPrimaryColor={data?.team?.primaryColor}
          />
        ) : viewMode === "depth" ? (
          <DepthChartView players={data?.players || []} onSelectPlayer={setSelectedPlayer} teamPrimaryColor={data?.team?.primaryColor} leagueId={id} isOwnTeam={!viewingTeamId} rosterUrl={rosterUrl} initialLineupTab={initialLineupTab} currentWeek={leagueData?.league?.currentWeek ?? 1} />
        ) : positionFilter === "all" ? (
          <>
            <PositionSection 
              title="Pitchers" 
              players={grouped.pitchers} 
              onSelectPlayer={setSelectedPlayer}
              teamPrimaryColor={data?.team?.primaryColor}
              progressionEnabled={leagueData?.progressionEnabled}
              isOwnTeam={!viewingTeamId}
              onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
            />
            <PositionSection 
              title="Catchers" 
              players={grouped.catchers} 
              onSelectPlayer={setSelectedPlayer}
              teamPrimaryColor={data?.team?.primaryColor}
              progressionEnabled={leagueData?.progressionEnabled}
              isOwnTeam={!viewingTeamId}
              onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
            />
            <PositionSection 
              title="Infielders" 
              players={grouped.infielders} 
              onSelectPlayer={setSelectedPlayer}
              teamPrimaryColor={data?.team?.primaryColor}
              progressionEnabled={leagueData?.progressionEnabled}
              isOwnTeam={!viewingTeamId}
              onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
            />
            <PositionSection 
              title="Outfielders" 
              players={grouped.outfielders} 
              onSelectPlayer={setSelectedPlayer}
              teamPrimaryColor={data?.team?.primaryColor}
              progressionEnabled={leagueData?.progressionEnabled}
              isOwnTeam={!viewingTeamId}
              onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
            />
          </>
        ) : (
          <PositionSection 
            title={positionOptions.find(o => o.value === positionFilter)?.label || "Players"} 
            players={allSorted} 
            onSelectPlayer={setSelectedPlayer}
            teamPrimaryColor={data?.team?.primaryColor}
            progressionEnabled={leagueData?.progressionEnabled}
            isOwnTeam={!viewingTeamId}
            onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
          />
        )}

        {filteredPlayers.length === 0 && viewMode !== "development" && (
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
          teamPrimaryColor={data?.team?.primaryColor}
          canDeclareDraft={canPlayerDeclareDraft(selectedPlayer)}
          onDeclareDraft={() => declareDraftMutation.mutate(selectedPlayer.id)}
          isDeclaringDraft={declareDraftMutation.isPending}
          leagueId={id}
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

      <Dialog open={showSaveDialog} onOpenChange={(open) => { if (!open) setShowSaveDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Save Roster File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This saves a snapshot of your current roster ({data?.players?.length || 0} players) to your dashboard.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">File Name</label>
              <RetroInput
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                placeholder="e.g. My Team - Season 1"
                maxLength={80}
                data-testid="input-save-roster-name"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <RetroButton variant="outline" size="sm" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                onClick={() => saveRosterMutation.mutate(saveFileName.trim() || "My Roster")}
                disabled={saveRosterMutation.isPending || !saveFileName.trim()}
                data-testid="button-confirm-save-roster"
              >
                {saveRosterMutation.isPending ? "Saving..." : "Save"}
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


interface PositionSectionProps {
  title: string;
  players: Player[];
  onSelectPlayer: (player: Player) => void;
  teamPrimaryColor?: string;
  progressionEnabled?: boolean;
  isOwnTeam?: boolean;
  onSetCaptain?: (playerId: string) => void;
}

function PositionSection({ title, players, onSelectPlayer, teamPrimaryColor, progressionEnabled, isOwnTeam, onSetCaptain }: PositionSectionProps) {
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
          <button
            key={player.id}
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
                    <span className="inline-flex items-center gap-0.5 font-pixel text-[7px] px-1 py-0.5 rounded border border-gold/50 text-gold bg-gold/10" data-testid={`badge-captain-mobile-${player.id}`}>
                      <Shield className="w-2 h-2" />C
                    </span>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-1 text-xs text-muted-foreground">
                  <span className="text-[10px]">{player.eligibility}</span>
                  {isPitcher(player.position) ? (
                    <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-mobile-${player.id}`}>{player.throwHand}HP</span>
                  ) : (
                    <>
                      <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${player.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : player.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-bat-mobile-${player.id}`}>B:{player.batHand}</span>
                      <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-throw-mobile-${player.id}`}>T:{player.throwHand}</span>
                      {(player as any).trajectory != null && (
                        <span className="inline-flex items-center gap-0.5 font-pixel text-[7px] px-1 py-0.5 rounded border border-gold/30 text-gold/70 bg-gold/5" data-testid={`badge-traj-mobile-${player.id}`}>
                          {TRAJECTORY_LABELS[(player as any).trajectory] ?? "LD"}
                          {TRAJECTORY_ICONS[(player as any).trajectory]}
                        </span>
                      )}
                    </>
                  )}
                  {progressionEnabled && player.potential != null && (
                    <span className={`font-bold text-[10px] ${getProgressionColor(getProgressionZone(player.potential))}`}>
                      {getPotentialGrade(player.potential)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-1">
                <div className="flex items-center gap-0.5">
                  <span className="font-bold text-gold text-sm">{player.overall}</span>
                  {player.progressionDeltas?.overall != null && player.progressionDeltas.overall !== 0 && (
                    <span className={`flex items-center text-[10px] font-bold ${player.progressionDeltas.overall > 0 ? "text-green-400" : "text-red-400"}`} data-testid={`text-roster-ovr-delta-${player.id}`}>
                      {player.progressionDeltas.overall > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                      {Math.abs(player.progressionDeltas.overall)}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">#{player.jerseyNumber}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop table layout */}
      <div className="hidden sm:block overflow-x-auto">
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
                      <span className="inline-flex items-center gap-0.5 font-pixel text-[7px] px-1.5 py-0.5 rounded border border-gold/50 text-gold bg-gold/10 shrink-0" data-testid={`badge-captain-desktop-${player.id}`}>
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
                    <span className={`font-pixel text-[7px] px-1.5 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-desktop-${player.id}`}>{player.throwHand}HP</span>
                  ) : (
                    <div className="flex items-center gap-1 justify-center flex-wrap">
                      <span className={`font-pixel text-[7px] px-1.5 py-0.5 rounded border ${player.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : player.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-desktop-${player.id}`}>{player.batHand}/{player.throwHand}</span>
                      {(player as any).trajectory != null && (
                        <span className="inline-flex items-center gap-0.5 font-pixel text-[7px] px-1.5 py-0.5 rounded border border-gold/30 text-gold/70 bg-gold/5" data-testid={`badge-traj-desktop-${player.id}`}>
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
                    <span className={`inline-flex items-center ml-1 text-[10px] font-bold ${player.progressionDeltas.overall > 0 ? "text-green-400" : "text-red-400"}`} data-testid={`text-roster-ovr-delta-${player.id}`}>
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

function DevelopmentTab({
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
              <p className="font-pixel text-[8px] text-muted-foreground mt-1">AVG OVR CHANGE</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-900/10 border border-green-800/30">
              <p className="text-2xl font-bold text-green-400" data-testid="text-dev-improvers">{improvers.length}</p>
              <p className="font-pixel text-[8px] text-muted-foreground mt-1">IMPROVED</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-900/10 border border-red-800/30">
              <p className="text-2xl font-bold text-red-400" data-testid="text-dev-regressors">{regressors.length}</p>
              <p className="font-pixel text-[8px] text-muted-foreground mt-1">REGRESSED</p>
            </div>
          </div>

          {breakouts.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3 h-3 text-gold" />
                <h4 className="font-pixel text-gold text-[9px]">BREAKOUT PLAYERS</h4>
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
                        <p className="font-pixel text-[8px] text-green-400">+{delta} OVR{starChanged ? ` · ${prevStar}★→${p.starRating}★` : ""}</p>
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
                          {i > 0 && <span className="text-muted-foreground/40 text-[10px]">·</span>}
                          <span className={`font-pixel text-[8px] ${attr.delta > 0 ? "text-green-400" : "text-red-400"}`}>
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
                    <p className="text-[9px] text-gold font-pixel">{prevStar}★ → {p.starRating}★</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {noDeltas.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-card/30">
            <p className="font-pixel text-[8px] text-muted-foreground">
              {noDeltas.length} player{noDeltas.length !== 1 ? "s" : ""} (new signings) have no prior-season data
            </p>
          </div>
        )}
      </RetroCard>
    </div>
  );
}

function RosterSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-48" />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-md border border-border/50 bg-card/30">
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
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
  teamPrimaryColor?: string;
  draggable?: boolean;
  onReorder?: (position: string, reorderedPlayers: Player[]) => void;
}

function DepthPlayerRow({ p, idx, position, teamPrimaryColor, draggable, onSelectPlayer, onDragStart, onDragOver, onDrop, onDragEnd, dragOverIdx }: {
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
            <div className="font-pixel text-gold text-xs">
              #{p.jerseyNumber} {p.firstName} {p.lastName}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
            <div className="text-[10px] text-muted-foreground">{keyStats}</div>
          </div>
        </TooltipContent>
      </Tooltip>
      <span className="text-[9px] text-muted-foreground/80 font-medium">
        {p.eligibility || 'FR'}
      </span>
      <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${isPitcher(p.position) ? (p.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60") : (p.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : p.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60")}`} data-testid={`badge-hand-depth-${p.id}`}>
        {isPitcher(p.position) ? `${p.throwHand}HP` : `${p.batHand}/${p.throwHand}`}
      </span>
      <span className={`text-xs font-bold ${idx === 0 ? 'text-gold' : 'text-muted-foreground'}`}>
        {p.overall}
      </span>
    </div>
  );
}

function PositionCard({ position, players, onSelectPlayer, maxPlayers = 3, teamPrimaryColor, draggable, onReorder }: PositionCardProps) {
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
        <span className="font-pixel text-gold text-[10px]">{position}</span>
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

function DepthChartView({ players, onSelectPlayer, teamPrimaryColor, leagueId, isOwnTeam, rosterUrl, initialLineupTab = "field", currentWeek = 1 }: {
  players: Player[];
  onSelectPlayer: (p: Player) => void;
  teamPrimaryColor?: string;
  leagueId?: string;
  isOwnTeam?: boolean;
  rosterUrl?: string;
  initialLineupTab?: "field" | "lineup" | "pitching";
  currentWeek?: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lineupTab, setLineupTab] = useState<"field" | "lineup" | "pitching">(initialLineupTab);
  useEffect(() => { setLineupTab(initialLineupTab); }, [initialLineupTab]);
  const [selectingSlot, setSelectingSlot] = useState<{ type: "batting"; slot: number } | { type: "pitching"; role: string } | null>(null);
  const [dragBattingSource, setDragBattingSource] = useState<{ player: Player; fromSlot?: number } | null>(null);
  const [dragOverBattingSlot, setDragOverBattingSlot] = useState<number | null>(null);
  const [dragPitchingSource, setDragPitchingSource] = useState<{ player: Player; fromRole?: string } | null>(null);
  const [dragOverPitchingRole, setDragOverPitchingRole] = useState<string | null>(null);

  const depthOrderMutation = useMutation({
    mutationFn: async (orders: { playerId: string; depthOrder: number }[]) => {
      return apiRequest("PUT", `/api/leagues/${leagueId}/depth-chart`, { orders });
    },
    onSuccess: () => {
      if (rosterUrl) {
        queryClient.invalidateQueries({ queryKey: [rosterUrl] });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save depth chart order", variant: "destructive" });
    },
  });

  const battingOrderMutation = useMutation({
    mutationFn: async (orders: { playerId: string; battingOrder: number | null }[]) => {
      return apiRequest("PUT", `/api/leagues/${leagueId}/batting-order`, { orders });
    },
    onSuccess: () => {
      if (rosterUrl) queryClient.invalidateQueries({ queryKey: [rosterUrl] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save batting order", variant: "destructive" });
    },
  });

  const pitchingRoleMutation = useMutation({
    mutationFn: async (assignments: { playerId: string; pitchingRole: string | null }[]) => {
      return apiRequest("PUT", `/api/leagues/${leagueId}/pitching-roles`, { assignments });
    },
    onSuccess: () => {
      if (rosterUrl) queryClient.invalidateQueries({ queryKey: [rosterUrl] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save pitching roles", variant: "destructive" });
    },
  });

  interface PitcherSlot { available: boolean; limited: boolean; daysOfRest: number; suggestedMaxIP: number; }
  interface PitcherAvailRow {
    playerId: string;
    slots: Record<string, PitcherSlot>;
    lastPitchedOuts: number;
    lastPitchedWeek: number | null;
    lastPitchedDay: string | null;
    stamina: number;
  }

  const availMap = useMemo(() => {
    const map = new Map<string, PitcherAvailRow>();
    for (const p of players) {
      if (!isPitcher(p.position)) continue;
      const slots: Record<string, PitcherSlot> = {};
      for (const day of ALL_GAME_DAYS) {
        slots[day] = computePitcherAvailability(
          p.lastPitchedOuts ?? 0,
          (p.lastPitchedWeek as number | null) ?? null,
          (p.lastPitchedDay as GameDay | null) ?? null,
          p.stamina ?? 50,
          currentWeek,
          day,
        );
      }
      map.set(p.id, {
        playerId: p.id,
        slots,
        lastPitchedOuts: p.lastPitchedOuts ?? 0,
        lastPitchedWeek: (p.lastPitchedWeek as number | null) ?? null,
        lastPitchedDay: (p.lastPitchedDay as string | null) ?? null,
        stamina: p.stamina ?? 50,
      });
    }
    return map;
  }, [players, currentWeek]);

  function availOutsToIpStr(outs: number): string {
    return `${Math.floor(outs / 3)}.${outs % 3}`;
  }
  function availRestNeeded(outs: number): number {
    if (outs === 0) return 0;
    if (outs <= 3) return 1;
    if (outs <= 9) return 2;
    if (outs <= 15) return 3;
    if (outs <= 21) return 4;
    if (outs <= 27) return 5;
    return 6;
  }
  const DAY_LABEL: Record<string, string> = { WED: "Wednesday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" };

  function AvailTooltipContent({ row, day, slot }: { row: PitcherAvailRow; day: string; slot: PitcherSlot }) {
    if (slot.daysOfRest === 99 || !row.lastPitchedDay) {
      return (
        <div className="text-[10px] space-y-0.5">
          <div className="font-semibold text-green-400">{day}: Fresh</div>
          <div className="text-muted-foreground">No recent appearances</div>
          <div>Full strength — up to <span className="text-green-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
        </div>
      );
    }
    const ip = availOutsToIpStr(row.lastPitchedOuts);
    const restNeeded = availRestNeeded(row.lastPitchedOuts);
    const restHad = slot.daysOfRest;
    const lastDay = DAY_LABEL[row.lastPitchedDay] ?? row.lastPitchedDay;
    if (!slot.available) {
      return (
        <div className="text-[10px] space-y-0.5">
          <div className="font-semibold text-red-400">{day}: Unavailable</div>
          <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({row.lastPitchedOuts} outs)</div>
          <div>Needs <span className="font-bold">{restNeeded}d</span> rest — only <span className="text-red-400 font-bold">{restHad}d</span> available</div>
        </div>
      );
    }
    if (slot.limited) {
      return (
        <div className="text-[10px] space-y-0.5">
          <div className="font-semibold text-yellow-400">{day}: Limited</div>
          <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({row.lastPitchedOuts} outs)</div>
          <div>{restHad}d rest received, {restNeeded}d required — capped at <span className="text-yellow-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
        </div>
      );
    }
    return (
      <div className="text-[10px] space-y-0.5">
        <div className="font-semibold text-green-400">{day}: Full strength</div>
        <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({row.lastPitchedOuts} outs)</div>
        <div>{restHad}d rest received — up to <span className="text-green-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
      </div>
    );
  }

  function AvailStrip({ playerId }: { playerId: string }) {
    const row = availMap.get(playerId);
    if (!row) return null;
    const days = ["WED", "FRI", "SAT", "SUN"] as const;
    return (
      <div className="flex gap-1 items-center flex-shrink-0">
        {days.map(d => {
          const s = row.slots[d];
          const avail = s?.available ?? false;
          const limited = s?.limited ?? false;
          const ip = s?.suggestedMaxIP ?? 0;
          const cls = !avail
            ? "border-red-500/50 bg-red-500/10 text-red-400"
            : limited
            ? "border-yellow-400/50 bg-yellow-500/10 text-yellow-300"
            : "border-green-500/50 bg-green-500/10 text-green-400";
          return (
            <Tooltip key={d}>
              <TooltipTrigger asChild>
                <div
                  className={`flex flex-col items-center border rounded px-1 py-0.5 cursor-default ${cls}`}
                  style={{ minWidth: 34 }}
                  data-testid={`avail-strip-${playerId}-${d}`}
                >
                  <span className="text-[7px] font-pixel leading-none">{d}</span>
                  <span className="text-[8px] font-bold leading-none mt-0.5">
                    {!avail ? "✕" : `${ip}IP`}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px]">
                {s ? <AvailTooltipContent row={row} day={d} slot={s} /> : <span className="text-[10px]">No data</span>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  const autoLineupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${leagueId}/auto-lineup`);
    },
    onSuccess: () => {
      if (rosterUrl) queryClient.invalidateQueries({ queryKey: [rosterUrl] });
      toast({ title: "Lineup Set", description: "Batting order, rotation, and bullpen have been automatically assigned." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to auto-set lineup", variant: "destructive" });
    },
  });

  const lineupPositionMutation = useMutation({
    mutationFn: async (assignments: { playerId: string; lineupPosition: string | null }[]) => {
      return apiRequest("PUT", `/api/leagues/${leagueId}/lineup-position`, { assignments });
    },
    onSuccess: () => {
      if (rosterUrl) queryClient.invalidateQueries({ queryKey: [rosterUrl] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save defensive position", variant: "destructive" });
    },
  });

  const [openLineupPosId, setOpenLineupPosId] = useState<string | null>(null);

  const handleReorder = useCallback((position: string, reorderedPlayers: Player[]) => {
    const orders = reorderedPlayers.map((p, idx) => ({
      playerId: p.id,
      depthOrder: idx + 1,
    }));
    depthOrderMutation.mutate(orders);
  }, [depthOrderMutation]);

  const sortByDepth = (list: Player[]) => {
    return [...list].sort((a, b) => {
      const aOrder = a.depthOrder || 0;
      const bOrder = b.depthOrder || 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.overall - a.overall;
    });
  };

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
          <span className="font-pixel text-gold text-lg">DEPTH CHART</span>
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
              <span className="font-pixel text-gold text-xs">BATTING ORDER</span>
              {canDrag && (
                <span className="text-[9px] text-muted-foreground">Drag or click to assign</span>
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
                    <span className="font-pixel text-gold text-[10px] w-6 flex-shrink-0 text-center">{slot}</span>
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
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
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
                                      className={`text-[9px] font-bold px-1.5 py-1 rounded transition-colors ${
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
                        <span className="text-[9px] text-muted-foreground hidden sm:inline">
                          {isPitcher(player.position) ? `VEL ${player.velocity || 0} / CTL ${player.control || 0}` : `HIT ${player.hitForAvg || 0} / PWR ${player.power || 0} / SPD ${player.speed || 0}`}
                        </span>
                        <span className="text-[9px] text-muted-foreground">{player.eligibility}</span>
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
              <span className="font-pixel text-gold text-xs">
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
                      <span className="text-[9px] text-muted-foreground hidden sm:inline">{keyStats}</span>
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
                  <span className="font-pixel text-gold text-xs">{sectionLabel}</span>
                  {canDrag && <span className="text-[9px] text-muted-foreground">Drag or click</span>}
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
                        <span className="font-pixel text-gold text-[9px] w-10 flex-shrink-0">{label}</span>
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
                            <span className="text-[9px] text-muted-foreground hidden sm:inline">
                              VEL {player.velocity || 0} / CTL {player.control || 0} / STM {player.stamina || 0}
                            </span>
                            <span className="text-[9px] text-muted-foreground">{player.eligibility}</span>
                            <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`}>
                              {player.throwHand}HP
                            </span>
                            <span className="text-xs font-bold text-gold">{player.overall}</span>
                            <AvailStrip playerId={player.id} />
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
              <span className="font-pixel text-gold text-xs">
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
                      <span className="text-[9px] text-muted-foreground hidden sm:inline">{keyStats}</span>
                      <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${p.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`}>
                        {p.throwHand}HP
                      </span>
                      <span className="text-xs font-bold text-gold">{p.overall}</span>
                      <AvailStrip playerId={p.id} />
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
