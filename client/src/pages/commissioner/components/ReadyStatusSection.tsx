import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, BellRing, Bot, Check, CheckCircle, Clock, Play, Timer, UserX, Zap,
} from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import { getReadyReason, getEffectiveReady } from "@/lib/ready-status";
import { formatLastActivity } from "../helpers/phaseHelpers";
import type { ReadyStatusData } from "../types";

interface ReadyStatusSectionProps {
  leagueId: string;
  commissionerUserId?: string;
  coCommissionerIds?: string[];
  onAdvanceWeek?: () => void;
  isAdvancing?: boolean;
}

export function ReadyStatusSection({
  leagueId,
  commissionerUserId,
  coCommissionerIds,
  onAdvanceWeek,
  isAdvancing,
}: ReadyStatusSectionProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForceAdvanceConfirm, setShowForceAdvanceConfirm] = useState(false);
  const [autoPilotConfirmTeam, setAutoPilotConfirmTeam] = useState<{
    teamId: string;
    coachName: string;
    teamName: string;
  } | null>(null);

  const { data: currentUser } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const isCommissioner =
    !!currentUser &&
    (currentUser.id === commissionerUserId ||
      (coCommissionerIds ?? []).includes(currentUser.id));

  const removeCoachMutation = useMutation({
    mutationFn: async (coachId: string) => {
      const res = await apiRequest("DELETE", `/api/leagues/${leagueId}/coaches/${coachId}/remove`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      toast({ title: "Coach Removed", description: "The coach has been removed. Their team is now CPU-controlled." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const autoPilotMutation = useMutation<
    { success: boolean; isAutoPilot: boolean; teamId: string },
    Error,
    string
  >({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest("PATCH", `/api/leagues/${leagueId}/teams/${teamId}/autopilot`, {});
      return res.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      toast({
        title: result.isAutoPilot ? "Auto-Pilot Enabled" : "Auto-Pilot Disabled",
        description: result.isAutoPilot
          ? "The CPU will now manage this team automatically."
          : "The coach has regained full control of their team.",
      });
      setAutoPilotConfirmTeam(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setAutoPilotConfirmTeam(null);
    },
  });

  type ForceAdvanceResponse = {
    currentSeason?: number;
    seasonTransition?: { graduated: number; recruitsAdded: number };
    [key: string]: unknown;
  };

  const forceAdvanceMutation = useMutation<ForceAdvanceResponse, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/force-advance`, {});
      return res.json();
    },
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
      qc.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/roster`] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "walkons"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      setShowForceAdvanceConfirm(false);
      toast({ title: "Phase Force-Advanced", description: "All non-ready coaches were bypassed and the phase has advanced." });
      if (response?.seasonTransition) {
        const t = response.seasonTransition;
        toast({
          title: "Season Complete!",
          description: `${t.graduated} graduated, ${t.recruitsAdded} recruits joined. Welcome to Season ${response.currentSeason}!`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setShowForceAdvanceConfirm(false);
    },
  });

  const { data, isLoading } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
    enabled: !!leagueId,
    refetchInterval: 30000,
  });

  const walkonReadyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/walkons/ready`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "walkons", "readiness"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      toast({ title: "Bids Locked In", description: "Your bids are locked. Waiting for all teams." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const nudgeMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/teams/${teamId}/nudge`);
      return res.json();
    },
    onSuccess: (_data, teamId) => {
      const team = data?.readyStatus.find((s) => s.teamId === teamId);
      toast({ title: "Nudge Sent", description: `Reminder logged for ${team?.coachName ?? "coach"}.` });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  if (isLoading || !data) {
    return (
      <RetroCard>
        <RetroCardHeader>Ready Status</RetroCardHeader>
        <RetroCardContent>
          <Skeleton className="h-32" />
        </RetroCardContent>
      </RetroCard>
    );
  }

  const humanTeams = data.readyStatus.filter((s) => s.isHumanControlled);
  const cpuTeams = data.readyStatus.filter((s) => !s.isHumanControlled);
  const isDeparturesPhase = data.currentPhase === "offseason_departures";
  const isWalkonsPhase = data.currentPhase === "offseason_walkons";
  const isRecruitingPhase = [
    "offseason_recruiting_1",
    "offseason_recruiting_2",
    "offseason_recruiting_3",
    "offseason_recruiting_4",
  ].includes(data.currentPhase);

  const getTeamReady = (team: (typeof humanTeams)[0]) =>
    getEffectiveReady(team, data.currentPhase);

  const stalledTeams = humanTeams.filter((t) => !getTeamReady(t));
  const readyTeams = humanTeams.filter((t) => getTeamReady(t));

  const sectionTitle = isDeparturesPhase
    ? "Departure Readiness"
    : isWalkonsPhase
    ? "Walk-On Readiness"
    : stalledTeams.length > 0
    ? "Who's Stalling?"
    : "Ready Status";

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2">
            {stalledTeams.length > 0 && !data.allHumansReady ? (
              <BellRing className="w-4 h-4 text-amber-400" />
            ) : (
              <Bell className="w-4 h-4 text-green-500" />
            )}
            <span>{sectionTitle}</span>
            <Badge
              variant="outline"
              className={
                data.allHumansReady
                  ? "border-green-500 text-green-500"
                  : "border-amber-400 text-amber-400"
              }
            >
              {data.readyCount}/{data.humanCount} Ready
            </Badge>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isCommissioner && onAdvanceWeek && data.allHumansReady && humanTeams.length > 0 && (
              <RetroButton
                variant="shimmer"
                size="sm"
                onClick={onAdvanceWeek}
                disabled={isAdvancing || forceAdvanceMutation.isPending}
                className="shrink-0"
                data-testid="button-advance-now-ready-section"
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                {isAdvancing ? "Advancing..." : "Advance Now"}
              </RetroButton>
            )}
            {isCommissioner && stalledTeams.filter((t) => !t.isAutoPilot).length > 0 && (
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setShowForceAdvanceConfirm(true)}
                disabled={isAdvancing || forceAdvanceMutation.isPending}
                className="shrink-0 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                data-testid="button-force-advance"
              >
                <Zap className="w-3.5 h-3.5 mr-1" />
                Force Advance
              </RetroButton>
            )}
          </div>
        </div>
      </RetroCardHeader>

      <AlertDialog open={showForceAdvanceConfirm} onOpenChange={setShowForceAdvanceConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-orange-400 text-sm">
              Force Advance Phase?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will bypass all coaches who haven't marked ready and immediately advance the
                  phase.
                </p>
                {stalledTeams.filter((t) => !t.isAutoPilot).length > 0 && (
                  <div className="rounded border border-orange-500/30 bg-orange-950/20 p-2 text-xs">
                    <p className="font-medium text-orange-400 mb-1">Coaches being bypassed:</p>
                    <ul className="space-y-0.5">
                      {stalledTeams
                        .filter((t) => !t.isAutoPilot)
                        .map((t) => (
                          <li key={t.teamId} className="text-muted-foreground">
                            · {t.coachName} ({t.abbreviation})
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => forceAdvanceMutation.mutate()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-confirm-force-advance"
            >
              {forceAdvanceMutation.isPending ? "Advancing..." : "Force Advance"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!autoPilotConfirmTeam}
        onOpenChange={(open) => {
          if (!open) setAutoPilotConfirmTeam(null);
        }}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-gold text-sm">
              Enable Auto-Pilot?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Put <strong>{autoPilotConfirmTeam?.coachName}</strong>'s team (
              {autoPilotConfirmTeam?.teamName}) on auto-pilot? The CPU will manage their recruiting,
              readiness, and phase actions until you disable it. The coach account remains intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                autoPilotConfirmTeam && autoPilotMutation.mutate(autoPilotConfirmTeam.teamId)
              }
              className="bg-gold text-forest-dark hover:bg-gold/90"
              data-testid="button-confirm-autopilot-enable"
            >
              {autoPilotMutation.isPending ? "Enabling..." : "Enable Auto-Pilot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RetroCardContent>
        {humanTeams.length === 0 ? (
          <p className="text-muted-foreground text-sm">No human coaches in this dynasty.</p>
        ) : (
          <div className="space-y-4">
            {stalledTeams.length > 0 && (
              <div>
                <p className="font-pixel text-xs text-amber-400 uppercase mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Waiting ({stalledTeams.length})
                </p>
                <div className="space-y-2">
                  {stalledTeams.map((team) => {
                    const deadline = data.phaseDeadline
                      ? new Date(data.phaseDeadline)
                      : null;
                    const deadlineDiffMs = deadline
                      ? deadline.getTime() - Date.now()
                      : null;
                    const timeLeft =
                      deadlineDiffMs !== null && deadlineDiffMs <= 0
                        ? "Deadline passed"
                        : deadlineDiffMs !== null && deadlineDiffMs < 3600000
                        ? `${Math.ceil(deadlineDiffMs / 60000)}m left`
                        : deadlineDiffMs !== null
                        ? `${Math.ceil(deadlineDiffMs / 3600000)}h left`
                        : null;
                    const canRemove =
                      isCommissioner && team.userId !== commissionerUserId;
                    const canAutoPilot =
                      isCommissioner && team.userId !== commissionerUserId;

                    return (
                      <div
                        key={team.teamId}
                        className={`flex items-center justify-between gap-3 p-2.5 rounded border ${
                          team.isAutoPilot
                            ? "border-blue-400/30 bg-blue-950/20"
                            : "border-amber-400/30 bg-amber-950/20"
                        }`}
                        data-testid={`stall-row-${team.teamId}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-pixel text-xs text-gold">
                              {team.abbreviation}
                            </span>
                            <span className="text-sm">{team.coachName}</span>
                            {team.isAutoPilot ? (
                              <span className="text-xs font-pixel text-blue-400 border border-blue-400/40 px-1 py-0.5 rounded flex items-center gap-0.5">
                                <Bot className="w-2.5 h-2.5" /> AUTO-PILOT
                              </span>
                            ) : (
                              <span className="text-xs font-pixel text-amber-400 border border-amber-400/40 px-1 py-0.5 rounded">
                                WAITING
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            {team.isAutoPilot && isRecruitingPhase ? (
                              <span className="text-blue-400/70">
                                CPU took {team.currentWeekActionCount} action
                                {team.currentWeekActionCount !== 1 ? "s" : ""} this week
                              </span>
                            ) : team.isAutoPilot ? (
                              <span className="text-blue-400/70">
                                {getReadyReason(team, data.currentPhase)}
                              </span>
                            ) : isRecruitingPhase ? (
                              <>
                                <span>{getReadyReason(team, data.currentPhase)}</span>
                                <span>·</span>
                                <span>
                                  Scout: {team.scoutActionsUsed} · Recruit:{" "}
                                  {team.recruitActionsUsed}
                                </span>
                              </>
                            ) : (
                              <span>{getReadyReason(team, data.currentPhase)}</span>
                            )}
                            {!team.isAutoPilot && team.lastActivityAt && (
                              <>
                                <span>·</span>
                                <span className="text-muted-foreground/70">
                                  Last active: {formatLastActivity(team.lastActivityAt)}
                                </span>
                              </>
                            )}
                            {!team.isAutoPilot && !team.lastActivityAt && (
                              <span className="text-muted-foreground/50">
                                No activity yet this week
                              </span>
                            )}
                          </div>
                          {!team.isAutoPilot && timeLeft && (
                            <div className="flex items-center gap-1 mt-1">
                              <Timer className="w-3 h-3 text-amber-400" />
                              <span className="text-xs text-amber-400">{timeLeft}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isWalkonsPhase && team.userId === currentUser?.id && (
                            <RetroButton
                              variant="primary"
                              size="sm"
                              onClick={() => walkonReadyMutation.mutate()}
                              disabled={walkonReadyMutation.isPending}
                              data-testid={`button-lockin-bids-${team.teamId}`}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {walkonReadyMutation.isPending ? "Locking..." : "Lock In Bids"}
                            </RetroButton>
                          )}
                          {isCommissioner &&
                            !team.isAutoPilot &&
                            team.userId !== currentUser?.id && (
                              <RetroButton
                                variant="outline"
                                size="sm"
                                onClick={() => nudgeMutation.mutate(team.teamId)}
                                disabled={nudgeMutation.isPending}
                                data-testid={`button-nudge-${team.teamId}`}
                                className="border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
                              >
                                <BellRing className="w-3 h-3 mr-1" />
                                Nudge
                              </RetroButton>
                            )}
                          {canAutoPilot && (
                            <RetroButton
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (team.isAutoPilot) {
                                  autoPilotMutation.mutate(team.teamId);
                                } else {
                                  setAutoPilotConfirmTeam({
                                    teamId: team.teamId,
                                    coachName: team.coachName,
                                    teamName: team.teamName,
                                  });
                                }
                              }}
                              disabled={autoPilotMutation.isPending}
                              data-testid={`button-autopilot-${team.teamId}`}
                              className={
                                team.isAutoPilot
                                  ? "border-blue-400/40 text-blue-400 hover:bg-blue-400/10"
                                  : "border-blue-500/40 text-blue-400/70 hover:bg-blue-500/10 hover:text-blue-400"
                              }
                              title={
                                team.isAutoPilot ? "Disable Auto-Pilot" : "Enable Auto-Pilot"
                              }
                            >
                              <Bot className="w-3 h-3" />
                            </RetroButton>
                          )}
                          {canRemove && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <RetroButton
                                  variant="outline"
                                  size="sm"
                                  data-testid={`button-remove-coach-stall-${team.teamId}`}
                                  className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                                >
                                  <UserX className="w-3 h-3" />
                                </RetroButton>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-card border-border">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="font-pixel text-gold text-sm">
                                    Remove Coach?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove <strong>{team.coachName}</strong> from the dynasty? Their
                                    team ({team.teamName}) will become CPU-controlled. This cannot be
                                    undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-background border-border">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => removeCoachMutation.mutate(team.coachId!)}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    data-testid={`button-confirm-remove-coach-${team.teamId}`}
                                  >
                                    Remove Coach
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {readyTeams.length > 0 && (
              <div>
                {stalledTeams.length > 0 && (
                  <p className="font-pixel text-xs text-green-500 uppercase mb-2 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Ready ({readyTeams.length})
                  </p>
                )}
                <div className="space-y-1">
                  {readyTeams.map((team) => {
                    const canRemove =
                      isCommissioner && team.userId !== commissionerUserId;
                    const canAutoPilot =
                      isCommissioner && team.userId !== commissionerUserId;
                    return (
                      <div
                        key={team.teamId}
                        className={`flex items-center justify-between gap-2 py-1.5 px-2 rounded border ${
                          team.isAutoPilot
                            ? "border-blue-400/20 bg-blue-950/10"
                            : "border-green-500/20 bg-green-950/20"
                        }`}
                        data-testid={`ready-row-${team.teamId}`}
                      >
                        <div className="flex items-center gap-2">
                          {team.isAutoPilot ? (
                            <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          )}
                          <span className="font-pixel text-xs text-gold">
                            {team.abbreviation}
                          </span>
                          <span className="text-sm text-muted-foreground">{team.coachName}</span>
                          {team.isAutoPilot && (
                            <span className="text-xs font-pixel text-blue-400 border border-blue-400/40 px-1 py-0.5 rounded">
                              AUTO-PILOT
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {isRecruitingPhase && !team.isAutoPilot && (
                            <span>
                              {team.currentWeekActionCount} action
                              {team.currentWeekActionCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {isRecruitingPhase && team.isAutoPilot && (
                            <span className="text-blue-400/70">
                              {team.currentWeekActionCount} CPU action
                              {team.currentWeekActionCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {!team.isAutoPilot && team.lastActivityAt && (
                            <span className="opacity-60">
                              {formatLastActivity(team.lastActivityAt)}
                            </span>
                          )}
                          {canAutoPilot && (
                            <button
                              type="button"
                              onClick={() => {
                                if (team.isAutoPilot) {
                                  autoPilotMutation.mutate(team.teamId);
                                } else {
                                  setAutoPilotConfirmTeam({
                                    teamId: team.teamId,
                                    coachName: team.coachName,
                                    teamName: team.teamName,
                                  });
                                }
                              }}
                              disabled={autoPilotMutation.isPending}
                              title={team.isAutoPilot ? "Disable Auto-Pilot" : "Enable Auto-Pilot"}
                              data-testid={`button-autopilot-ready-${team.teamId}`}
                              className={`transition-colors ${
                                team.isAutoPilot
                                  ? "text-blue-400 hover:text-blue-300"
                                  : "text-muted-foreground/40 hover:text-blue-400"
                              }`}
                            >
                              <Bot className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canRemove && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  className="text-red-400/60 hover:text-red-400 transition-colors ml-1"
                                  title="Remove coach"
                                  data-testid={`button-remove-coach-ready-${team.teamId}`}
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-card border-border">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="font-pixel text-gold text-sm">
                                    Remove Coach?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove <strong>{team.coachName}</strong> from the dynasty? Their
                                    team ({team.teamName}) will become CPU-controlled. This cannot be
                                    undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-background border-border">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => removeCoachMutation.mutate(team.coachId!)}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    data-testid={`button-confirm-remove-coach-ready-${team.teamId}`}
                                  >
                                    Remove Coach
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {cpuTeams.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bot className="w-3.5 h-3.5" />
                  <span>
                    {cpuTeams.length} CPU team{cpuTeams.length !== 1 ? "s" : ""} — auto-managed
                  </span>
                </div>
              </div>
            )}

            {data.allHumansReady && humanTeams.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded bg-green-950/30 border border-green-500/30">
                <Check className="w-4 h-4 text-green-500 shrink-0" />
                <span className="text-sm text-green-400">
                  All coaches are ready — use the button above to advance.
                </span>
              </div>
            )}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}
