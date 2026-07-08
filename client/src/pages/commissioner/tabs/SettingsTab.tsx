import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Camera, Crown, Loader2, Settings, User, Users, Zap } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import { TransferCommissionerSection } from "../components/TransferCommissionerSection";
import { difficultyOptions, aggressionOptions, RECRUITING_PHASES } from "../helpers/phaseHelpers";
import type { League } from "@shared/schema";
import type { HumanCoach } from "../types";

interface SettingsTabProps {
  league?: League;
  humanCoaches: HumanCoach[];
  isPrimaryCommissioner: boolean;
  onToggleAuditLog: (isPublic: boolean) => void;
  onChangeDifficulty: (difficulty: string) => void;
  onChangeAggression: (aggression: number) => void;
  onToggleDelegate: (userId: string, isDelegate: boolean) => void;
  isDelegating: boolean;
  onToggleEmailDigests: (enabled: boolean) => void;
  onToggleShowReadyNames: (enabled: boolean) => void;
  onChangeGameMode: (gameMode: "simulated" | "reported") => void;
}

export function SettingsTab({
  league,
  humanCoaches,
  isPrimaryCommissioner,
  onToggleAuditLog,
  onChangeDifficulty,
  onChangeAggression,
  onToggleDelegate,
  isDelegating,
  onToggleEmailDigests,
  onToggleShowReadyNames,
  onChangeGameMode,
}: SettingsTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const currentAggression = league?.cpuRecruitingAggression ?? 3;
  const [autoPilotConfirmCoach, setAutoPilotConfirmCoach] = useState<{
    teamId: string;
    coachName: string;
    teamName: string;
  } | null>(null);

  const autoPilotMutation = useMutation<
    { success: boolean; isAutoPilot: boolean; teamId: string },
    Error,
    string
  >({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest(
        "PATCH",
        `/api/leagues/${league?.id}/teams/${teamId}/autopilot`,
        {},
      );
      return res.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", league?.id, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", league?.id, "commissioner"] });
      toast({
        title: result.isAutoPilot ? "Auto-Pilot Enabled" : "Auto-Pilot Disabled",
        description: result.isAutoPilot
          ? "CPU will manage this team's actions going forward."
          : "Coach has regained full control of their team.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const nonCommissionerHumanCoaches = humanCoaches.filter(
    (c) => c.userId !== league?.commissionerId && c.teamId,
  );

  return (
    <div className="space-y-6">
      <RetroCard>
        <RetroCardHeader>Dynasty Settings</RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Public Audit Log</p>
                <p className="text-sm text-muted-foreground">
                  Allow all coaches to view the audit log
                </p>
              </div>
              <Switch
                checked={league?.auditLogPublic || false}
                onCheckedChange={onToggleAuditLog}
                data-testid="switch-audit-log-public"
              />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-6">
              <div>
                <p className="font-medium">Weekly Email Digests</p>
                <p className="text-sm text-muted-foreground">
                  Send coaches a recap email after each phase advance
                </p>
              </div>
              <Switch
                checked={league?.emailDigestsEnabled ?? true}
                onCheckedChange={onToggleEmailDigests}
                data-testid="switch-email-digests"
              />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-6">
              <div>
                <p className="font-medium">Show Ready Status to All Coaches</p>
                <p className="text-sm text-muted-foreground">
                  Let coaches see which teams have and haven't marked ready (off = coaches see only
                  the count)
                </p>
              </div>
              <Switch
                checked={league?.showReadyNamesToAll ?? false}
                onCheckedChange={onToggleShowReadyNames}
                data-testid="switch-show-ready-names"
              />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-6">
              <div className="flex items-center gap-3">
                <Camera className="w-4 h-4 text-gold shrink-0" />
                <div>
                  <p className="font-medium">Reported Games (Screenshot Import)</p>
                  <p className="text-sm text-muted-foreground">
                    When enabled, games do not auto-simulate. Coaches upload screenshots which are
                    OCR-scanned into an editable box score for review before submission.
                  </p>
                </div>
              </div>
              <Switch
                checked={league?.gameMode === "reported"}
                onCheckedChange={(checked) => onChangeGameMode(checked ? "reported" : "simulated")}
                data-testid="switch-game-mode"
              />
            </div>

            <div className="border-t border-border pt-6">
              <div className="mb-4">
                <p className="font-medium mb-2">CPU Difficulty</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Controls how aggressively CPU teams recruit
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {difficultyOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChangeDifficulty(opt.value)}
                      className={`p-3 rounded-md border text-left transition-all ${
                        league?.cpuDifficulty === opt.value
                          ? "bg-gold/20 border-gold text-gold"
                          : "bg-card border-border text-muted-foreground hover:border-gold/50"
                      }`}
                      data-testid={`button-difficulty-${opt.value}`}
                    >
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs opacity-70 mt-1">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-6">
              <div className="mb-4">
                <p className="font-medium mb-2">CPU Recruiting Aggressiveness</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Fine-tunes how early CPU teams extend offers within the 4-week recruiting window.
                  Stacks on top of the difficulty tier.
                </p>
                {(RECRUITING_PHASES as readonly string[]).includes(
                  league?.currentPhase || "",
                ) && (
                  <div className="flex items-start gap-2 mb-3 p-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      Recruiting is currently active — any change will take effect at the start of
                      the next recruiting cycle.
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-1.5">
                  {aggressionOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChangeAggression(opt.value)}
                      className={`p-2 rounded-md border text-center transition-all ${
                        currentAggression === opt.value
                          ? "bg-gold/20 border-gold text-gold"
                          : "bg-card border-border text-muted-foreground hover:border-gold/50"
                      }`}
                      data-testid={`button-aggression-${opt.value}`}
                      title={opt.description}
                    >
                      <div className="font-medium text-xs">{opt.label}</div>
                      <div className="text-[10px] opacity-60 mt-0.5 leading-tight hidden sm:block">
                        {opt.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-6">
              <div className="flex items-center gap-3 mb-4">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Dynasty Name</p>
                  <p className="text-sm text-muted-foreground">{league?.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Max Teams</p>
                  <p className="text-sm text-muted-foreground">{league?.maxTeams}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Player Progression</p>
                  <div className="mt-1">
                    {league?.progressionEnabled ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-pixel bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default"
                        title="Player attributes grow between seasons based on potential and team facilities"
                        data-testid="badge-progression-on"
                      >
                        PROGRESSION ON
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-pixel bg-muted/40 text-muted-foreground border border-border cursor-default"
                        title="Player attributes do not change between seasons in this league"
                        data-testid="badge-progression-off"
                      >
                        PROGRESSION OFF
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </RetroCardContent>
      </RetroCard>

      {nonCommissionerHumanCoaches.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gold" />
              <span>Coach Management</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Enable auto-pilot for inactive coaches. The CPU will manage their team's recruiting,
              readiness, and phase actions until disabled.
            </p>
            <div className="space-y-2">
              {nonCommissionerHumanCoaches.map((coach) => {
                const coachName = `${coach.firstName} ${coach.lastName}`;
                return (
                  <div
                    key={coach.coachId}
                    className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                      coach.isAutoPilot
                        ? "bg-blue-950/20 border-blue-400/30"
                        : "bg-muted/30 border-border"
                    }`}
                    data-testid={`row-coach-mgmt-${coach.coachId}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {coach.isAutoPilot ? (
                        <Bot className="w-4 h-4 text-blue-400 shrink-0" />
                      ) : (
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{coachName}</p>
                          {coach.abbreviation && (
                            <span className="font-pixel text-[9px] text-gold shrink-0">
                              {coach.abbreviation}
                            </span>
                          )}
                          {coach.isAutoPilot && (
                            <Badge className="text-[8px] bg-blue-500/20 text-blue-400 border-blue-500/40 shrink-0 px-1">
                              AUTO-PILOT
                            </Badge>
                          )}
                        </div>
                        {coach.archetype && (
                          <p className="text-[10px] text-muted-foreground/70 truncate">
                            {coach.archetype}
                          </p>
                        )}
                        {coach.teamName && (
                          <p className="text-xs text-muted-foreground truncate">{coach.teamName}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={autoPilotMutation.isPending}
                      onClick={() => {
                        if (coach.isAutoPilot) {
                          autoPilotMutation.mutate(coach.teamId!);
                        } else {
                          setAutoPilotConfirmCoach({
                            teamId: coach.teamId!,
                            coachName,
                            teamName: coach.teamName ?? "",
                          });
                        }
                      }}
                      className={`ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-all disabled:opacity-50 ${
                        coach.isAutoPilot
                          ? "bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30"
                          : "bg-muted/50 border-border text-muted-foreground hover:border-blue-400/50 hover:text-blue-400"
                      }`}
                      data-testid={`button-autopilot-settings-${coach.coachId}`}
                      title={coach.isAutoPilot ? "Disable Auto-Pilot" : "Enable Auto-Pilot"}
                    >
                      <Bot className="w-3 h-3" />
                      <span>{coach.isAutoPilot ? "Disable" : "Enable"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </RetroCardContent>
        </RetroCard>
      )}

      <AlertDialog
        open={!!autoPilotConfirmCoach}
        onOpenChange={(open) => {
          if (!open) setAutoPilotConfirmCoach(null);
        }}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-gold text-sm">
              Enable Auto-Pilot?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Put <strong>{autoPilotConfirmCoach?.coachName}</strong>'s team (
              {autoPilotConfirmCoach?.teamName}) on auto-pilot? The CPU will manage their
              recruiting, readiness, and phase actions until you disable it. The coach account
              remains intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                autoPilotConfirmCoach && autoPilotMutation.mutate(autoPilotConfirmCoach.teamId)
              }
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-confirm-autopilot-settings"
            >
              {autoPilotMutation.isPending ? "Enabling..." : "Enable Auto-Pilot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isPrimaryCommissioner && humanCoaches.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-gold" />
              <span>Co-Commissioner Delegates</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Delegates can perform all commissioner actions — advance, simulate, manage settings,
              and more. Only the primary commissioner can manage delegates or invite links.
            </p>
            <div className="space-y-2">
              {humanCoaches.map((coach) => {
                const coIds: string[] = Array.isArray(league?.coCommissionerIds)
                  ? (league!.coCommissionerIds as string[])
                  : [];
                const isDelegate = coIds.includes(coach.userId);
                const isPrimary = coach.userId === league?.commissionerId;
                return (
                  <div
                    key={coach.userId}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border"
                    data-testid={`row-delegate-${coach.coachId}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {coach.firstName} {coach.lastName}
                        </p>
                        {coach.archetype && (
                          <p className="text-[10px] text-muted-foreground/70 truncate">
                            {coach.archetype}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">{coach.email}</p>
                      </div>
                      {isPrimary && (
                        <Badge className="text-[8px] bg-gold/20 text-gold border-gold/40 shrink-0">
                          COMMISSIONER
                        </Badge>
                      )}
                      {isDelegate && !isPrimary && (
                        <Badge className="text-[8px] bg-blue-500/20 text-blue-400 border-blue-500/40 shrink-0">
                          DELEGATE
                        </Badge>
                      )}
                    </div>
                    {!isPrimary && (
                      <button
                        type="button"
                        disabled={isDelegating}
                        onClick={() => onToggleDelegate(coach.userId, isDelegate)}
                        className={`ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                          isDelegate
                            ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                            : "bg-gold/20 border-gold/40 text-gold hover:bg-gold/30 disabled:opacity-50"
                        }`}
                        data-testid={`button-delegate-${isDelegate ? "remove" : "add"}-${coach.coachId}`}
                      >
                        {isDelegating ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>...</span>
                          </>
                        ) : isDelegate ? (
                          "Revoke"
                        ) : (
                          "Grant"
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </RetroCardContent>
        </RetroCard>
      )}

      {league?.id && (
        <TransferCommissionerSection leagueId={league.id} />
      )}
    </div>
  );
}
