import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { RetroCard } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { StarRating } from "@/components/ui/star-rating";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InningScoreboard, useScoreboardEnabled, type InningScoreboardData } from "@/components/inning-scoreboard";
import {
  Users, Check, ChevronRight, Play, Clock, Trophy, Vote, Award, Star, Skull, ScrollText, Diamond,
  CalendarClock, Pencil,
} from "lucide-react";
import type { LeagueDetails, ReadyStatusData } from "../types";
import { STORYLINE_VOTE_CALLOUT_PHASES } from "../types";
import { getEffectiveReady, getReadyReason, getReadyBlockReason } from "../helpers";

interface SigningDayPreviewRecruit {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  starRating: number;
  homeState: string;
  topSchools: { teamId: string; teamName: string; teamAbbr: string; primaryColor: string; interestLevel: number; hasOffer: boolean }[];
  committingTo: { teamId: string; teamName: string; teamAbbr: string; primaryColor: string } | null;
  isGenerationalGem?: boolean;
  isGenerationalBust?: boolean;
  isGem?: boolean;
  isBust?: boolean;
  isBlueChip?: boolean;
  isStoryline?: boolean;
  recruitType?: string;
  fromTeamName?: string | null;
}

function SigningDayBadgeRow({ recruit }: { recruit: SigningDayPreviewRecruit }) {
  const badges: React.ReactNode[] = [];

  if (recruit.isGenerationalGem) {
    badges.push(
      <span
        key="gen-gem"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-in fade-in duration-500"
        style={{ animationDelay: "300ms" }}
        data-testid="badge-generational-gem"
      >
        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
        GENERATIONAL GEM
      </span>
    );
  } else if (recruit.isGenerationalBust) {
    badges.push(
      <span
        key="gen-bust"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-900/30 text-red-300 border border-red-700/50 animate-in fade-in duration-500"
        style={{ animationDelay: "300ms" }}
        data-testid="badge-generational-bust"
      >
        <Skull className="w-3 h-3" />
        GENERATIONAL BUST
      </span>
    );
  } else if (recruit.isGem) {
    badges.push(
      <span
        key="gem"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-green-900/30 text-green-300 border border-green-700/50 animate-in fade-in duration-500"
        style={{ animationDelay: "300ms" }}
        data-testid="badge-gem"
      >
        <Star className="w-3 h-3" />
        GEM
      </span>
    );
  } else if (recruit.isBust) {
    badges.push(
      <span
        key="bust"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-900/30 text-red-400 border border-red-700/50 animate-in fade-in duration-500"
        style={{ animationDelay: "300ms" }}
        data-testid="badge-bust"
      >
        <Skull className="w-3 h-3" />
        BUST
      </span>
    );
  }

  if (recruit.isStoryline) {
    badges.push(
      <span
        key="storyline"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-violet-900/30 text-violet-300 border border-violet-700/50 animate-in fade-in duration-500"
        style={{ animationDelay: "400ms" }}
        data-testid="badge-storyline"
      >
        <ScrollText className="w-3 h-3" />
        STORYLINE
      </span>
    );
  }

  if (recruit.recruitType === "TRANSFER") {
    badges.push(
      <span
        key="transfer"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-purple-600/30 text-purple-300 border border-purple-600/50 animate-in fade-in duration-500"
        style={{ animationDelay: "450ms" }}
        data-testid="badge-transfer"
      >
        TRANSFER{recruit.fromTeamName ? ` (${recruit.fromTeamName})` : ""}
      </span>
    );
  } else if (recruit.recruitType === "JUCO") {
    badges.push(
      <span
        key="juco"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-cyan-600/30 text-cyan-300 border border-cyan-600/50 animate-in fade-in duration-500"
        style={{ animationDelay: "450ms" }}
        data-testid="badge-juco"
      >
        JUCO{recruit.fromTeamName ? ` (${recruit.fromTeamName})` : ""}
      </span>
    );
  }

  if (recruit.isBlueChip && !recruit.isGem && !recruit.isGenerationalGem) {
    badges.push(
      <span
        key="bluechip"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-900/30 text-blue-300 border border-blue-700/50 animate-in fade-in duration-500"
        style={{ animationDelay: "500ms" }}
        data-testid="badge-blue-chip"
      >
        <Diamond className="w-3 h-3" />
        BLUE CHIP
      </span>
    );
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-1.5 pt-1">
      {badges}
    </div>
  );
}

function SigningDayRevealModal({
  leagueId,
  open,
  onClose,
  onComplete,
}: {
  leagueId: string;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [animPhase, setAnimPhase] = useState<"deciding" | "reveal" | "done">("deciding");
  const [isCompleting, setIsCompleting] = useState(false);

  const { data, isLoading } = useQuery<{ recruits: SigningDayPreviewRecruit[] }>({
    queryKey: ["/api/leagues", leagueId, "signing-day-preview"],
    enabled: open,
    staleTime: 0,
  });

  const recruits = data?.recruits ?? [];

  useEffect(() => {
    if (!open) {
      setCurrentIdx(0);
      setAnimPhase("deciding");
      setIsCompleting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || isLoading || recruits.length === 0) return;
    if (animPhase === "deciding") {
      const t = setTimeout(() => setAnimPhase("reveal"), 2000);
      return () => clearTimeout(t);
    }
    if (animPhase === "reveal") {
      const t = setTimeout(() => {
        if (currentIdx < recruits.length - 1) {
          setCurrentIdx(i => i + 1);
          setAnimPhase("deciding");
        } else {
          setAnimPhase("done");
        }
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [open, isLoading, recruits.length, animPhase, currentIdx]);

  const current = recruits[currentIdx];
  const school1 = current?.topSchools[0];
  const school2 = current?.topSchools[1];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background border-gold/40 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-xs flex items-center gap-2">
            <Award className="w-4 h-4" />
            DECISION DAY
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading recruit decisions...</div>
        ) : recruits.length === 0 || animPhase === "done" ? (
          <div className="py-6 text-center space-y-4">
            {recruits.length === 0 ? (
              <p className="text-sm text-muted-foreground">All recruits have already committed.</p>
            ) : (
              <p className="text-sm text-muted-foreground">All {recruits.length} decisions revealed.</p>
            )}
            <RetroButton
              variant="primary"
              onClick={() => { setIsCompleting(true); onComplete(); }}
              disabled={isCompleting}
              className="w-full"
              data-testid="button-complete-signing-day"
            >
              {isCompleting ? "Finalizing..." : "Complete Decision Day"}
            </RetroButton>
          </div>
        ) : (
          <div className="py-2 space-y-4">
            <div className="text-center text-xs text-muted-foreground font-pixel">
              {currentIdx + 1} / {recruits.length} UNDECIDED
            </div>
            <div className="text-center space-y-1">
              <StarRating rating={current.starRating} />
              <p className="font-pixel text-white text-sm mt-1">{current.firstName} {current.lastName}</p>
              <p className="text-xs text-muted-foreground">{current.position} · {current.homeState}</p>
            </div>

            {animPhase === "deciding" && (
              <div className="bg-card border border-border rounded p-4 text-center space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Deciding between...</p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  {school1 && (
                    <span className="font-semibold text-sm" style={{ color: school1.primaryColor || undefined }}>
                      {school1.teamName}
                    </span>
                  )}
                  {school2 && (
                    <>
                      <span className="text-muted-foreground text-xs">vs</span>
                      <span className="font-semibold text-sm" style={{ color: school2.primaryColor || undefined }}>
                        {school2.teamName}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex justify-center gap-1 pt-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-gold animate-bounce"
                      style={{ animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {animPhase === "reveal" && (
              <>
                <div className="bg-gold/10 border border-gold/50 rounded p-4 text-center space-y-1 animate-in fade-in duration-300">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">commits to</p>
                  <p className="font-pixel text-gold text-base">
                    {current.committingTo?.teamName ?? school1?.teamName ?? "Undecided"}
                  </p>
                </div>
                <SigningDayBadgeRow recruit={current} />
              </>
            )}

            <RetroButton
              variant="outline"
              size="sm"
              onClick={() => setAnimPhase("done")}
              className="w-full text-xs"
              data-testid="button-skip-signing-reveal"
            >
              Skip to Complete
            </RetroButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WaitingOnWidget({
  leagueId,
  league,
  pendingVoteCount = 0,
}: {
  leagueId: string;
  league: LeagueDetails;
  pendingVoteCount?: number;
}) {
  const [showSigningReveal, setShowSigningReveal] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [scoreboardData, setScoreboardData] = useState<InningScoreboardData | null>(null);
  const scoreboardEnabled = useScoreboardEnabled();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Advance schedule state
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleInput, setScheduleInput] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  // Live clock for countdown
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const scheduleAdvanceMut = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/leagues/${leagueId}/advance-schedule`, {
      nextAdvanceAt: scheduleInput ? new Date(scheduleInput).toISOString() : null,
      advanceScheduleNote: scheduleNote || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      setShowScheduleDialog(false);
    },
  });

  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: readyData, isLoading } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
    refetchInterval: 30000,
  });

  const showStorylineVotes = STORYLINE_VOTE_CALLOUT_PHASES.has(league.currentPhase);

  const toggleReady = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/ready`);
      return res.json();
    },
    onSuccess: (data: { isReady?: boolean }) => {
      if (data?.isReady) {
        import("@/lib/sfx").then(({ playReadyUpSfx }) => playReadyUpSfx());
      } else {
        import("@/lib/sfx").then(({ playClick }) => playClick());
      }
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
    },
  });

  // Capture the phase before any advance so onSuccess knows what transitioned.
  const phase = league.currentPhase;

  const advanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/advance`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/roster`] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "walkons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "postseason"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "dashboard-overview"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      // After signing day is finalized all recruits have signedTeamId set.
      // Navigate the commissioner directly to the cinematic card-flip reveal.
      if (phase === "offseason_signing_day") {
        navigate(`/league/${leagueId}/signing-day-reveal`);
        return;
      }
      if (data?.userTeamGame && scoreboardEnabled) {
        setScoreboardData(data.userTeamGame as InningScoreboardData);
        setShowScoreboard(true);
      }
    },
  });
  const humanTeams = readyData?.readyStatus.filter((s) => s.isHumanControlled) ?? [];
  const myStatus = readyData?.readyStatus.find((s) => s.userId === user?.id);
  const isCommissioner = !!user && user.id === league.commissionerId;
  const myEffectiveReady = myStatus ? getEffectiveReady(myStatus, phase) : false;
  const myBlockReason = myStatus ? getReadyBlockReason(myStatus, phase) : null;
  const allReady = readyData?.allHumansReady ?? false;
  const readyCount = readyData?.readyCount ?? 0;
  const humanCount = readyData?.humanCount ?? 0;

  // Phases where readiness is driven by a dedicated page action (not the isReady toggle)
  const isPageActionPhase =
    phase === "offseason_departures" || phase === "offseason_walkons";

  // Link and label for phases that require completing a page action to mark ready
  const pageActionConfig: Record<string, { href: string; label: string }> = {
    offseason_departures: { href: `/league/${leagueId}/departures`, label: "Review Departures" },
    offseason_walkons: { href: `/league/${leagueId}/walkons`, label: "Manage Walk-Ons" },
  };
  const pageAction = isPageActionPhase ? pageActionConfig[phase] : null;

  const pct = humanCount > 0 ? Math.round((readyCount / humanCount) * 100) : 0;

  return (
    <RetroCard
      className={`mb-4 transition-colors ${allReady ? "border-green-500/50 bg-green-500/5" : "border-gold/30 bg-gold/5"}`}
      data-testid="waiting-on-widget"
    >
      <div className="px-4 py-3">
        {/* Header row — collapses to single line on mobile */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className={`w-4 h-4 shrink-0 ${allReady ? "text-green-400" : "text-gold"}`} />
            <span className={`font-pixel text-xs ${allReady ? "text-green-400" : "text-gold"}`}>
              {allReady ? "ALL READY" : "WAITING ON"}
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              ({readyCount}/{humanCount} ready)
            </span>
            {/* Mobile single-line: just count */}
            <span className="text-xs text-muted-foreground sm:hidden">
              {readyCount}/{humanCount}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {myStatus && !myEffectiveReady && !isPageActionPhase && (
              <RetroButton
                size="sm"
                variant="primary"
                onClick={() => toggleReady.mutate()}
                disabled={toggleReady.isPending || !!myBlockReason}
                title={myBlockReason ?? undefined}
                data-haptic="success"
                data-testid="button-mark-ready-widget"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">Ready Up</span>
                <span className="sm:hidden">Ready</span>
              </RetroButton>
            )}
            {myStatus && !myEffectiveReady && isPageActionPhase && pageAction && (
              <Link href={pageAction.href}>
                <RetroButton size="sm" variant="primary" data-testid="button-page-action-widget">
                  <ChevronRight className="w-3.5 h-3.5 mr-1" />
                  {pageAction.label}
                </RetroButton>
              </Link>
            )}
            {myStatus && myEffectiveReady && !isPageActionPhase && !myStatus.isAutoPilot && (
              <RetroButton
                size="sm"
                variant="outline"
                onClick={() => toggleReady.mutate()}
                disabled={toggleReady.isPending}
                className="border-green-500/50 bg-green-600/10 text-green-300 hover:bg-red-600/10 hover:border-red-500/50 hover:text-red-300"
                data-testid="button-undo-ready-widget"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">Ready &#10003; (Undo)</span>
                <span className="sm:hidden">Ready &#10003;</span>
              </RetroButton>
            )}
            {myStatus && myEffectiveReady && (isPageActionPhase || myStatus.isAutoPilot) && !isCommissioner && (
              <span className="flex items-center gap-1 text-xs text-green-400" data-testid="badge-you-are-ready">
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">You&apos;re ready</span>
              </span>
            )}
            {isCommissioner && allReady && (
              <RetroButton
                size="sm"
                variant="primary"
                onClick={() => {
                  if (phase === "offseason_signing_day") {
                    setShowSigningReveal(true);
                  } else {
                    advanceMutation.mutate();
                  }
                }}
                disabled={advanceMutation.isPending}
                className="border-green-500 bg-green-600/20 text-green-300 hover:bg-green-600/40"
                data-testid="button-advance-now-widget"
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                {advanceMutation.isPending ? "Advancing..." : phase === "offseason_signing_day" ? "Decision Day" : "Advance Now"}
              </RetroButton>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {humanCount > 1 && (
          <div className="mb-2" data-testid="ready-progress-bar">
            <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allReady ? "bg-green-500" : "bg-gold"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Team chip list */}
        {isLoading ? (
          <div className="flex gap-2 flex-wrap mt-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-28 rounded" />
            ))}
          </div>
        ) : humanTeams.length === 0 ? (
          <p className="text-xs text-muted-foreground">No human coaches in this league.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1" data-testid="waiting-on-team-list">
            {humanTeams.map((entry) => {
              const ready = getEffectiveReady(entry, phase);
              const isMe = entry.userId === user?.id;
              const reason = !ready && (isMe ? false : readyData?.showReadyNamesToAll) ? getReadyReason(entry, phase) : null;
              return (
                <div
                  key={entry.teamId}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs border transition-colors ${
                    ready
                      ? "bg-green-500/10 border-green-500/30 text-green-300"
                      : "bg-card border-border text-muted-foreground"
                  } ${isMe ? "ring-1 ring-gold/60" : ""}`}
                  data-testid={`team-ready-status-${entry.teamId}`}
                  title={reason ?? undefined}
                >
                  {ready ? (
                    <Check className="w-3 h-3 text-green-400 shrink-0" />
                  ) : (
                    <Clock className="w-3 h-3 text-gold shrink-0" />
                  )}
                  <span className={isMe ? "text-gold font-medium" : ""}>
                    {entry.teamName}
                    {isMe && <span className="ml-1 text-gold/60">(you)</span>}
                  </span>
                  {reason && (
                    <span className="text-muted-foreground/70" data-testid={`text-ready-reason-${entry.teamId}`}>
                      · {reason}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reason for the current coach's own not-ready status. When there's an
            outstanding requirement, call it out distinctly since it's what's
            keeping the Ready Up button disabled. */}
        {myStatus && !myEffectiveReady && (
          <p
            className={`mt-1 text-xs ${myBlockReason ? "text-amber-400" : "text-muted-foreground"}`}
            data-testid="text-my-ready-reason"
          >
            {myBlockReason ?? getReadyReason(myStatus, phase) ?? "Not marked ready yet"}
          </p>
        )}

        {/* Deadline / autopilot warning — mirrors commissioner page placement */}
        {readyData?.phaseDeadline && !allReady && (() => {
          const deadline = new Date(readyData.phaseDeadline!);
          const diffMs = deadline.getTime() - now;
          const passed = diffMs <= 0;
          const timeLeft = passed
            ? "Deadline passed — auto-ready will apply on next advance"
            : diffMs < 3600000
            ? `${Math.ceil(diffMs / 60000)}m left before auto-ready`
            : `${Math.ceil(diffMs / 3600000)}h left before auto-ready`;
          return (
            <div
              className={`mt-2 flex items-center gap-1.5 text-xs ${passed ? "text-red-400" : "text-amber-400"}`}
              data-testid="text-phase-deadline-warning"
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span>{timeLeft}</span>
            </div>
          );
        })()}

        {/* Scheduled next advance countdown */}
        {(() => {
          const nextAt = (league as any).nextAdvanceAt;
          const note = (league as any).advanceScheduleNote as string | null;
          if (!nextAt && !note && !isCommissioner) return null;
          const deadline = nextAt ? new Date(nextAt) : null;
          const diffMs = deadline ? deadline.getTime() - now : null;
          const passed = diffMs != null && diffMs <= 0;
          const fmt = (ms: number) => {
            const s = Math.floor(ms / 1000);
            const m = Math.floor(s / 60);
            const h = Math.floor(m / 60);
            const d = Math.floor(h / 24);
            if (d > 0) return `${d}d ${h % 24}h`;
            if (h > 0) return `${h}h ${m % 60}m`;
            return `${m}m ${s % 60}s`;
          };
          return (
            <div className="mt-3 pt-2 border-t border-border/30" data-testid="advance-schedule-section">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="w-3 h-3 text-gold/70 shrink-0" />
                  <span className="font-pixel text-xs text-muted-foreground">NEXT ADVANCE</span>
                </div>
                {isCommissioner && (
                  <button
                    onClick={() => {
                      setScheduleInput(nextAt ? new Date(nextAt).toISOString().slice(0, 16) : "");
                      setScheduleNote(note ?? "");
                      setShowScheduleDialog(true);
                    }}
                    className="text-xs text-gold/50 hover:text-gold transition-colors flex items-center gap-0.5"
                    data-testid="button-edit-advance-schedule"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                    Edit
                  </button>
                )}
              </div>
              {deadline && !passed && diffMs != null && (
                <p className="text-sm font-bold text-gold mt-0.5" data-testid="text-advance-countdown">
                  {fmt(diffMs)}
                </p>
              )}
              {deadline && passed && (
                <p className="text-xs text-amber-400 mt-0.5">Advance due — waiting on commissioner</p>
              )}
              {deadline && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {deadline.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{" "}
                  {deadline.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                </p>
              )}
              {note && (
                <p className="text-xs text-muted-foreground/70 mt-0.5 italic">{note}</p>
              )}
              {!deadline && !note && isCommissioner && (
                <button
                  onClick={() => { setScheduleInput(""); setScheduleNote(""); setShowScheduleDialog(true); }}
                  className="text-xs text-gold/50 hover:text-gold transition-colors mt-0.5"
                  data-testid="button-set-advance-schedule"
                >
                  + Set schedule for coaches
                </button>
              )}
            </div>
          );
        })()}

        {/* Privacy note for coaches when names are hidden */}
        {!isCommissioner && !readyData?.showReadyNamesToAll && humanCount > 1 && !allReady && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="text-ready-names-hidden">
            Showing your status only — commissioner can enable full team visibility in settings
          </p>
        )}

        {/* All-ready message for non-commissioner coaches */}
        {allReady && !isCommissioner && (
          <p className="mt-2 text-xs text-green-400" data-testid="text-all-ready">
            All coaches are ready — waiting for the commissioner to advance.
          </p>
        )}

        <SigningDayRevealModal
          leagueId={leagueId}
          open={showSigningReveal}
          onClose={() => setShowSigningReveal(false)}
          onComplete={() => {
            setShowSigningReveal(false);
            advanceMutation.mutate();
          }}
        />

        {/* Advance Schedule Dialog */}
        <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-pixel text-gold text-xs">SET ADVANCE SCHEDULE</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="font-pixel text-xs text-muted-foreground block mb-1.5">NEXT ADVANCE DATE/TIME (EST)</label>
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  onChange={e => setScheduleInput(e.target.value)}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
                  data-testid="input-schedule-datetime"
                />
                <p className="text-xs text-muted-foreground mt-1">Visible to all coaches as a countdown timer</p>
              </div>
              <div>
                <label className="font-pixel text-xs text-muted-foreground block mb-1.5">SCHEDULE NOTE (optional)</label>
                <input
                  value={scheduleNote}
                  onChange={e => setScheduleNote(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Mon/Wed/Fri 9pm EST"
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
                  data-testid="input-schedule-note"
                />
              </div>
              <div className="flex gap-2 pt-1">
                {scheduleInput && (
                  <button
                    onClick={() => { setScheduleInput(""); scheduleAdvanceMut.mutate(); }}
                    className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
                    data-testid="button-clear-schedule"
                  >
                    Clear schedule
                  </button>
                )}
                <div className="ml-auto flex gap-2">
                  <RetroButton variant="outline" size="sm" onClick={() => setShowScheduleDialog(false)}>Cancel</RetroButton>
                  <RetroButton
                    size="sm"
                    disabled={scheduleAdvanceMut.isPending}
                    onClick={() => scheduleAdvanceMut.mutate()}
                    data-testid="button-save-schedule"
                  >
                    {scheduleAdvanceMut.isPending ? "Saving..." : "Save"}
                  </RetroButton>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <InningScoreboard
          open={showScoreboard}
          onClose={() => { setShowScoreboard(false); setScoreboardData(null); }}
          data={scoreboardData}
        />

        {/* Signing day reveal callout — appears during offseason_walkons for non-commissioners
            (commissioners are auto-navigated there after the signing day advance). */}
        {phase === "offseason_walkons" && !isCommissioner && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <Link href={`/league/${leagueId}/signing-day-reveal`}>
              <div className="flex items-center gap-2 text-xs text-gold hover:text-gold/80 transition-colors cursor-pointer" data-testid="signing-day-reveal-callout">
                <Trophy className="w-3 h-3 shrink-0 animate-pulse" />
                <span>Signing day is over — watch the class reveal with card flips</span>
                <ChevronRight className="w-3 h-3 ml-auto shrink-0" />
              </div>
            </Link>
          </div>
        )}
        {showStorylineVotes && pendingVoteCount > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <Link href={`/league/${leagueId}/storylines`}>
              <div className="flex items-center gap-2 text-xs text-gold hover:text-gold/80 transition-colors cursor-pointer" data-testid="storyline-votes-callout">
                <Vote className="w-3 h-3 shrink-0 animate-pulse" />
                <span>
                  {pendingVoteCount} storyline vote{pendingVoteCount !== 1 ? "s" : ""} pending — cast your vote
                </span>
                <ChevronRight className="w-3 h-3 ml-auto shrink-0" />
              </div>
            </Link>
          </div>
        )}
      </div>
    </RetroCard>
  );
}
