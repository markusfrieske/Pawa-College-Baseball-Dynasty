import { useState, useMemo, useEffect } from "react";
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
import { positionOptions, eligibilityOptions, groupPlayersByCategory } from "./lib/helpers";
import { useRosterData, canPlayerDeclareDraft } from "./hooks/useRosterData";
import { RosterSkeleton } from "./components/RosterSkeleton";
import { PositionSection } from "./components/PositionSection";
import { DevelopmentTab } from "./components/DevelopmentTab";
import { PlayerEditModal } from "./components/PlayerEditModal";
import { DepthChartView } from "./components/depth-chart/DepthChartView";

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

  const {
    rosterUrl,
    data,
    isLoading,
    isError,
    error,
    refetch,
    leagueData,
    isCommissioner,
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

  const filteredPlayers = data?.players.filter(p => {
    if (positionFilter !== "all") {
      if (positionFilter === "IF" && !isInfielder(p.position)) return false;
      if (positionFilter === "OF" && !isOutfielder(p.position)) return false;
      if (positionFilter !== "IF" && positionFilter !== "OF" && p.position !== positionFilter) return false;
    }
    if (eligibilityFilter !== "all" && p.eligibility !== eligibilityFilter) return false;
    return true;
  }) || [];

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

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <QueryError error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-gold text-base sm:text-lg truncate">
              {data?.team ? `${data.team.name} Roster` : 'Roster'}
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
            {grouped.firstBase.length > 0 && (
              <PositionSection
                title="First Base"
                players={grouped.firstBase}
                onSelectPlayer={setSelectedPlayer}
                teamPrimaryColor={data?.team?.primaryColor}
                progressionEnabled={leagueData?.progressionEnabled}
                isOwnTeam={!viewingTeamId}
                onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
              />
            )}
            {grouped.secondBase.length > 0 && (
              <PositionSection
                title="Second Base"
                players={grouped.secondBase}
                onSelectPlayer={setSelectedPlayer}
                teamPrimaryColor={data?.team?.primaryColor}
                progressionEnabled={leagueData?.progressionEnabled}
                isOwnTeam={!viewingTeamId}
                onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
              />
            )}
            {grouped.thirdBase.length > 0 && (
              <PositionSection
                title="Third Base"
                players={grouped.thirdBase}
                onSelectPlayer={setSelectedPlayer}
                teamPrimaryColor={data?.team?.primaryColor}
                progressionEnabled={leagueData?.progressionEnabled}
                isOwnTeam={!viewingTeamId}
                onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
              />
            )}
            {grouped.shortstops.length > 0 && (
              <PositionSection
                title="Shortstops"
                players={grouped.shortstops}
                onSelectPlayer={setSelectedPlayer}
                teamPrimaryColor={data?.team?.primaryColor}
                progressionEnabled={leagueData?.progressionEnabled}
                isOwnTeam={!viewingTeamId}
                onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
              />
            )}
            {grouped.otherInfielders.length > 0 && (
              <PositionSection
                title="Infielders"
                players={grouped.otherInfielders}
                onSelectPlayer={setSelectedPlayer}
                teamPrimaryColor={data?.team?.primaryColor}
                progressionEnabled={leagueData?.progressionEnabled}
                isOwnTeam={!viewingTeamId}
                onSetCaptain={(playerId) => setCaptainMutation.mutate({ playerId, action: "set" })}
              />
            )}
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

