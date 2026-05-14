import { useState, useRef, useCallback } from "react";
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
  Wand2,
  X,
  FolderDown
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Player, Team, Coach, League } from "@shared/schema";
import { isPitcher, isCatcher, isInfielder, isOutfielder } from "@shared/positions";
import { getPotentialGrade, getProgressionZone, getProgressionColor } from "@shared/potential";

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
  const search = useSearch();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");
  const [eligibilityFilter, setEligibilityFilter] = useState("all");
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "depth">(() => {
    const params = new URLSearchParams(search);
    return params.get("view") === "depth" ? "depth" : "list";
  });
  const [initialLineupTab] = useState<"field" | "lineup" | "pitching">(() => {
    const params = new URLSearchParams(search);
    const sub = params.get("sub");
    if (sub === "lineup") return "lineup";
    if (sub === "pitching") return "pitching";
    return "field";
  });
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
  const assignedBattingCount = positionPlayersAll.filter(p => p.battingOrder != null && p.battingOrder >= 1 && p.battingOrder <= 9).length;
  const isLineupIncomplete = !viewingTeamId && positionPlayersAll.length >= 9 && assignedBattingCount < 9;

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
                onClick={() => setViewMode("depth")}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-[10px] font-pixel hover:bg-yellow-500/30 transition-colors"
                data-testid="badge-lineup-incomplete"
              >
                ⚠ Lineup Incomplete ({assignedBattingCount}/9)
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
          <DepthChartView players={data?.players || []} onSelectPlayer={setSelectedPlayer} teamPrimaryColor={data?.team?.primaryColor} leagueId={id} isOwnTeam={!viewingTeamId} rosterUrl={rosterUrl} initialLineupTab={initialLineupTab} />
        ) : positionFilter === "all" ? (
          <>
            <PositionSection 
              title="Pitchers" 
              players={grouped.pitchers} 
              onSelectPlayer={setSelectedPlayer}
              teamPrimaryColor={data?.team?.primaryColor}
              progressionEnabled={leagueData?.progressionEnabled}
            />
            <PositionSection 
              title="Catchers" 
              players={grouped.catchers} 
              onSelectPlayer={setSelectedPlayer}
              teamPrimaryColor={data?.team?.primaryColor}
              progressionEnabled={leagueData?.progressionEnabled}
            />
            <PositionSection 
              title="Infielders" 
              players={grouped.infielders} 
              onSelectPlayer={setSelectedPlayer}
              teamPrimaryColor={data?.team?.primaryColor}
              progressionEnabled={leagueData?.progressionEnabled}
            />
            <PositionSection 
              title="Outfielders" 
              players={grouped.outfielders} 
              onSelectPlayer={setSelectedPlayer}
              teamPrimaryColor={data?.team?.primaryColor}
              progressionEnabled={leagueData?.progressionEnabled}
            />
          </>
        ) : (
          <PositionSection 
            title={positionOptions.find(o => o.value === positionFilter)?.label || "Players"} 
            players={allSorted} 
            onSelectPlayer={setSelectedPlayer}
            teamPrimaryColor={data?.team?.primaryColor}
            progressionEnabled={leagueData?.progressionEnabled}
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
}

function PositionSection({ title, players, onSelectPlayer, teamPrimaryColor, progressionEnabled }: PositionSectionProps) {
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
            <div className="flex items-center gap-3">
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
                className="w-9 h-9 flex-shrink-0"
                jerseyColor={teamPrimaryColor}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm truncate">{player.firstName} {player.lastName}</span>
                  <PositionBadge position={player.position} size="sm" />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{player.eligibility}</span>
                  <span className="text-border">·</span>
                  {isPitcher(player.position) ? (
                    <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-mobile-${player.id}`}>{player.throwHand}HP</span>
                  ) : (
                    <>
                      <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${player.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : player.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-bat-mobile-${player.id}`}>B:{player.batHand}</span>
                      <span className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${player.throwHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-throw-mobile-${player.id}`}>T:{player.throwHand}</span>
                    </>
                  )}
                  {progressionEnabled && player.potential != null && (
                    <>
                      <span className="text-border">·</span>
                      <span className={`font-bold ${getProgressionColor(getProgressionZone(player.potential))}`}>
                        {getPotentialGrade(player.potential)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-gold text-sm">{player.overall}</span>
                  {player.progressionDeltas?.overall != null && player.progressionDeltas.overall !== 0 && (
                    <span className={player.progressionDeltas.overall > 0 ? "text-green-400" : "text-red-400"} data-testid={`text-roster-ovr-delta-${player.id}`}>
                      {player.progressionDeltas.overall > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
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
                className="border-b border-border/50 hover:bg-card/50"
                data-testid={`row-player-desktop-${player.id}`}
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
                    <span className={`font-pixel text-[7px] px-1.5 py-0.5 rounded border ${player.batHand === "L" ? "bg-blue-500/15 text-blue-400 border-blue-500/40" : player.batHand === "S" ? "bg-purple-500/15 text-purple-400 border-purple-500/40" : "bg-muted/40 text-muted-foreground border-border/60"}`} data-testid={`badge-hand-desktop-${player.id}`}>{player.batHand}/{player.throwHand}</span>
                  )}
                </td>
                <td className="text-center py-3 px-2">
                  <span className="font-bold text-gold">{player.overall}</span>
                  {player.progressionDeltas?.overall != null && player.progressionDeltas.overall !== 0 && (
                    <span className={`inline-flex items-center ml-1 text-xs font-bold ${player.progressionDeltas.overall > 0 ? "text-green-400" : "text-red-400"}`} data-testid={`text-roster-ovr-delta-${player.id}`}>
                      {player.progressionDeltas.overall > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
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
      <main className="container mx-auto px-4 py-6">
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
    <Tooltip>
      <TooltipTrigger asChild>
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
          <span className={`text-xs truncate flex-1 ${idx === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
            {p.firstName.charAt(0)}. {p.lastName}
          </span>
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

function DepthChartView({ players, onSelectPlayer, teamPrimaryColor, leagueId, isOwnTeam, rosterUrl, initialLineupTab = "field" }: {
  players: Player[];
  onSelectPlayer: (p: Player) => void;
  teamPrimaryColor?: string;
  leagueId?: string;
  isOwnTeam?: boolean;
  rosterUrl?: string;
  initialLineupTab?: "field" | "lineup" | "pitching";
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lineupTab, setLineupTab] = useState<"field" | "lineup" | "pitching">(initialLineupTab);
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

  const renderSlotRow = (
    label: string,
    player: Player | null,
    onClickSlot: () => void,
    onClear: () => void,
    testIdSuffix: string,
    isActive: boolean
  ) => (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded border ${
        isActive ? 'border-gold bg-gold/10' : 'border-border bg-card/90'
      } cursor-pointer`}
      onClick={onClickSlot}
      data-testid={`slot-${testIdSuffix}`}
    >
      <span className="font-pixel text-gold text-[10px] w-16 flex-shrink-0">{label}</span>
      {player ? (
        <>
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
          <span className="text-[9px] text-muted-foreground">{player.eligibility}</span>
          <span className="text-xs font-bold text-gold">{player.overall}</span>
          {canDrag && (
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
              data-testid={`clear-${testIdSuffix}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </>
      ) : (
        <span className="text-xs text-muted-foreground italic flex-1">Empty</span>
      )}
    </div>
  );

  const renderAvailablePlayer = (
    player: Player,
    onSelect: () => void,
    testIdSuffix: string
  ) => {
    const keyStats = isPitcher(player.position)
      ? `VEL ${player.velocity || 0} / CTL ${player.control || 0}`
      : `CON ${player.hitForAvg || 0} / PWR ${player.power || 0}`;
    return (
      <div
        key={player.id}
        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-gold/10 cursor-pointer border border-transparent hover:border-gold/30 transition-colors"
        onClick={onSelect}
        data-testid={`available-${testIdSuffix}-${player.id}`}
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
          className="w-5 h-5 flex-shrink-0"
          jerseyColor={teamPrimaryColor}
        />
        <PositionBadge position={player.position} size="sm" />
        <span className="text-xs truncate flex-1">{player.firstName.charAt(0)}. {player.lastName}</span>
        <span className="text-[9px] text-muted-foreground">{keyStats}</span>
        <span className="text-xs font-bold text-gold">{player.overall}</span>
      </div>
    );
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
                    onClick={() => canDrag ? setSelectingSlot(isActive ? null : { type: "batting", slot }) : undefined}
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
                        <span className="text-xs truncate flex-1">{player.firstName.charAt(0)}. {player.lastName}</span>
                        <span className="text-[9px] text-muted-foreground hidden sm:inline">
                          {isPitcher(player.position) ? `VEL ${player.velocity || 0}` : `CON ${player.hitForAvg || 0} / PWR ${player.power || 0}`}
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
                  const keyStats = `CON ${p.hitForAvg || 0} / PWR ${p.power || 0} / SPD ${p.speed || 0}`;
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
            <div className="bg-card/90 border border-border rounded-lg overflow-visible" data-testid="starting-rotation-section">
              <div className="bg-gold/20 px-3 py-2 border-b border-border">
                <span className="font-pixel text-gold text-xs">STARTING ROTATION</span>
              </div>
              <div className="p-2 space-y-1">
                {rotationSlots.map(({ role, label, player }) => {
                  const isActive = selectingSlot?.type === "pitching" && selectingSlot.role === role;
                  return renderSlotRow(
                    label,
                    player,
                    () => canDrag ? setSelectingSlot(isActive ? null : { type: "pitching", role }) : undefined,
                    () => handleClearPitchingRole(role),
                    `rotation-${role}`,
                    isActive
                  );
                })}
              </div>
            </div>

            <div className="bg-card/90 border border-border rounded-lg overflow-visible" data-testid="bullpen-section">
              <div className="bg-gold/20 px-3 py-2 border-b border-border">
                <span className="font-pixel text-gold text-xs">BULLPEN</span>
              </div>
              <div className="p-2 space-y-1">
                {bullpenSlots.map(({ role, label, player }) => {
                  const isActive = selectingSlot?.type === "pitching" && selectingSlot.role === role;
                  return renderSlotRow(
                    label,
                    player,
                    () => canDrag ? setSelectingSlot(isActive ? null : { type: "pitching", role }) : undefined,
                    () => handleClearPitchingRole(role),
                    `bullpen-${role}`,
                    isActive
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-card/90 border border-border rounded-lg overflow-visible" data-testid="available-pitchers-section">
            <div className="bg-gold/20 px-3 py-2 border-b border-border">
              <span className="font-pixel text-gold text-xs">
                {selectingSlot?.type === "pitching" ? `SELECT FOR ${[...rotationRoles, ...bullpenRoles].find(r => r.role === selectingSlot.role)?.label || selectingSlot.role}` : "AVAILABLE PITCHERS"}
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
                ).map(p => renderAvailablePlayer(
                  p,
                  () => selectingSlot?.type === "pitching" ? handleAssignPitchingRole(selectingSlot.role, p) : undefined,
                  "pitcher"
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
