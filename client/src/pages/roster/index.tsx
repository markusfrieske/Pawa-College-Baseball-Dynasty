import { useState, useMemo, useEffect, useRef } from "react";
import { QueryError } from "@/components/ui/query-error";
import { useParams, Link, useSearch } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard } from "@/components/ui/retro-card";
import { RetroSelect } from "@/components/ui/retro-select";
import { RetroInput } from "@/components/ui/retro-input";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Users,
  LayoutGrid,
  List,
  FolderDown,
  TrendingUp,
  Shield,
  ShieldOff,
} from "lucide-react";
import type { Player } from "@shared/schema";
import { isInfielder, isOutfielder, isPitcher } from "@shared/positions";
import { positionOptions, eligibilityOptions } from "./lib/helpers";
import { useRosterData, canPlayerDeclareDraft } from "./hooks/useRosterData";
import { RosterSkeleton } from "./components/RosterSkeleton";
import { PositionSection } from "./components/PositionSection";
import { DevelopmentTab } from "./components/DevelopmentTab";
import { PlayerEditModal } from "./components/PlayerEditModal";
import "./roster-workspace.css";
import { DepthChartView } from "./components/depth-chart/DepthChartView";

export default function RosterPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const profileTrigger = useRef<HTMLElement | null>(null);
  const openProfile = (player: Player) => { profileTrigger.current = document.activeElement as HTMLElement; setSelectedPlayer(player); };
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState("overall");
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
    else setViewMode("list");
  }, [search]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");

  const {
    rosterUrl,
    data,
    isLoading,
    isError,
    error,
    refetch,
    leagueData,
    isCommissioner,
    isOwnTeam,
    canViewDevelopment,
    updatePlayerMutation,
    saveRosterMutation,
    setCaptainMutation,
    declareDraftMutation,
  } = useRosterData(id, viewingTeamId, {
    onPlayerUpdated: () => {
      setEditingPlayer(null);
      setSelectedPlayer(null);
    },
    onDraftDeclared: () => {
      setSelectedPlayer(null);
    },
  });

  useEffect(() => { setSelectedPlayer(null); setEditingPlayer(null); }, [viewingTeamId]);

  const filteredPlayers = data?.players.filter(p => {
    if (searchTerm.trim() && !`${p.firstName} ${p.lastName} ${p.jerseyNumber}`.toLowerCase().includes(searchTerm.trim().toLowerCase())) return false;
    if (positionFilter !== "all") {
      if (positionFilter === "IF" && !isInfielder(p.position)) return false;
      if (positionFilter === "OF" && !["OF", "LF", "CF", "RF"].includes(p.position)) return false;
      if (positionFilter === "P" && !isPitcher(p.position)) return false;
      if (positionFilter !== "IF" && positionFilter !== "OF" && positionFilter !== "P" && p.position !== positionFilter) return false;
    }
    if (eligibilityFilter !== "all" && p.eligibility !== eligibilityFilter) return false;
    return true;
  }) || [];

  const allSorted = [...filteredPlayers].sort((a, b) => sort === "name" ? `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) : sort === "number" ? a.jerseyNumber - b.jerseyNumber : b.overall - a.overall || a.lastName.localeCompare(b.lastName));

  const positionPlayersAll = (data?.players || []).filter(p => !isPitcher(p.position));
  const allPitchersAll = (data?.players || []).filter(p => isPitcher(p.position));
  const assignedBattingCount = new Set(positionPlayersAll.filter(p => p.battingOrder != null && p.battingOrder >= 1 && p.battingOrder <= 9).map(p=>p.battingOrder)).size;
  const requiredRotationRoles = ["FRI", "SAT", "SUN", "MID"];
  const assignedRotationCount = requiredRotationRoles.filter(role => allPitchersAll.some(p => p.pitchingRole === role)).length;
  const battingIncomplete = isOwnTeam && positionPlayersAll.length >= 9 && assignedBattingCount < 9;
  const pitchingIncomplete = isOwnTeam && allPitchersAll.length >= 4 && assignedRotationCount < 4;
  const isLineupIncomplete = battingIncomplete || pitchingIncomplete;

  if (isLoading) {
    return <RosterSkeleton />;
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <QueryError error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" /><span className="sr-only">Back to league</span>
            </Link>
            <h1 className="c9-roster-heading">
              {data?.team ? `${data.team.name}` : 'Program roster'}
            </h1>
            {isLineupIncomplete && (
              <button
                onClick={() => { setViewMode("depth"); }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs hover:bg-yellow-500/30 transition-colors"
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
                    aria-label="View team roster"
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
              {isOwnTeam && data?.players && (
                <RetroButton
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSaveFileName(`${data.team?.name || "My Team"} - Season ${leagueData?.currentSeason ?? 1}`);
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

      <main className="container mx-auto px-4 py-6 pb-6">
        <p className="c9-roster-kicker">PERSONNEL / SEASON {leagueData?.currentSeason ?? "—"}</p>
        <div className="c9-view-tabs" aria-label="Roster views">
          <RetroButton size="sm" variant={viewMode === "list" ? "primary" : "outline"} aria-pressed={viewMode === "list"} onClick={()=>setViewMode("list")} data-testid="button-list-view">Roster</RetroButton>
          <RetroButton size="sm" variant={viewMode === "depth" ? "primary" : "outline"} aria-pressed={viewMode === "depth"} onClick={()=>setViewMode("depth")} data-testid="button-depth-view">Lineup & field</RetroButton>
          {canViewDevelopment && <RetroButton size="sm" variant={viewMode === "development" ? "primary" : "outline"} aria-pressed={viewMode === "development"} onClick={()=>setViewMode("development")} data-testid="button-development-view">Development</RetroButton>}
        </div>
        {viewMode !== "depth" && <>
          <div className="c9-roster-tools">
            <div className="c9-search"><label htmlFor="roster-search">Find a player</label><RetroInput id="roster-search" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Name or jersey number" data-testid="roster-search" /></div>
            <div><label htmlFor="roster-position">Position group</label><RetroSelect id="roster-position" options={positionOptions} value={positionFilter} onChange={e=>setPositionFilter(e.target.value)} data-testid="select-position-filter" /></div>
            <div><label htmlFor="roster-year">Class</label><RetroSelect id="roster-year" options={eligibilityOptions} value={eligibilityFilter} onChange={e=>setEligibilityFilter(e.target.value)} data-testid="select-eligibility-filter" /></div>
            {viewMode === "list" && <div><label htmlFor="roster-sort">Order by</label><select id="roster-sort" className="c9-select" value={sort} onChange={e=>setSort(e.target.value)}><option value="overall">Overall rating</option><option value="name">Last name</option><option value="number">Jersey number</option></select></div>}
          </div>
          <div className="c9-roster-caption" aria-live="polite">{filteredPlayers.length} of {data?.players.length ?? 0} players · Select a player for their sports profile{(searchTerm || positionFilter !== "all" || eligibilityFilter !== "all") && <button className="ml-3 text-gold underline" onClick={()=>{setSearchTerm("");setPositionFilter("all");setEligibilityFilter("all");}}>Reset filters</button>}</div>
        </>}

        {/* Captain Slots — only for own team, list view */}
        {isOwnTeam && viewMode === "list" && data?.players && (() => {
          const pitcherCaptain = data.players.find(p => p.captainRole === "pitcher_captain");
          const fielderCaptain = data.players.find(p => p.captainRole === "fielder_captain");
          return (
            <details className="c9-captains"><summary>Team leadership · Manage captains</summary><RetroCard className="mb-4">
              <div className="px-4 py-2 bg-card/80 border-b border-border flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-gold" />
                <h3 className="text-gold text-xs uppercase tracking-wider">Team Captains</h3>
                <span className="text-xs text-muted-foreground ml-1">(+15% portal retention · leadership role promise)</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border/30">
                {[
                  { label: "Pitcher Captain", captain: pitcherCaptain },
                  { label: "Fielder Captain", captain: fielderCaptain },
                ].map(({ label, captain }) => (
                  <div key={label} className="p-3 bg-card/60 flex items-center gap-3">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">{label}</span>
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
                            aria-label={`Remove ${captain.firstName} ${captain.lastName} as captain`}
                            disabled={setCaptainMutation.isPending}
                            className="min-h-11 min-w-11 p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
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
            </RetroCard></details>
          );
        })()}

        {viewMode === "development" && canViewDevelopment ? (
          <DevelopmentTab
            players={filteredPlayers}
            onSelectPlayer={openProfile}
            teamPrimaryColor={data?.team?.primaryColor}
          />
        ) : viewMode === "depth" ? (
          <DepthChartView key={data?.team?.id} players={data?.players || []} onSelectPlayer={openProfile} teamPrimaryColor={data?.team?.primaryColor} leagueId={id} isOwnTeam={isOwnTeam} rosterUrl={rosterUrl} initialLineupTab={initialLineupTab} currentWeek={leagueData?.currentWeek ?? 1} />
        ) : (
          <PositionSection
            title={positionFilter === "all" ? "Program roster" : positionOptions.find(o => o.value === positionFilter)?.label || "Players"}
            players={allSorted}
            onSelectPlayer={openProfile}
            teamPrimaryColor={data?.team?.primaryColor}
            progressionEnabled={leagueData?.progressionEnabled}
            isOwnTeam={isOwnTeam}
            captainPending={setCaptainMutation.isPending}
            onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
          />
        )}

        {filteredPlayers.length === 0 && viewMode === "list" && (
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
          onReturnFocus={() => { if (!editingPlayer) requestAnimationFrame(() => profileTrigger.current?.focus()); }}
          open={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          isCommissioner={!!isCommissioner}
          onEdit={() => {
            setEditingPlayer(selectedPlayer);
            setSelectedPlayer(null);
          }}
          teamPrimaryColor={data?.team?.primaryColor}
          canDeclareDraft={(isOwnTeam || isCommissioner) && selectedPlayer.teamId === data?.team?.id && canPlayerDeclareDraft(selectedPlayer)}
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
            <DialogTitle className="text-gold text-sm">Save Roster File</DialogTitle>
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
                onClick={() => {
                  saveRosterMutation.mutate(saveFileName.trim() || "My Roster", {
                    onSuccess: () => {
                      setShowSaveDialog(false);
                      setSaveFileName("");
                    },
                  });
                }}
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
