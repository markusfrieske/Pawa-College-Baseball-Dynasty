/**
 * Weekly War Room — default coach hub for a league.
 * Mobile-first. First viewport answers: who do I play, am I ready, what's blocking me?
 */
import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Check, Clock, FileText, Target, UserMinus, UserPlus,
  ClipboardList, AlertTriangle, Home, Plane, Calendar, ShieldCheck,
  ChevronRight, Trophy, History, Swords, Rss, Newspaper,
} from "lucide-react";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { apiRequest } from "@/lib/queryClient";
import { getEffectiveReady, getReadyBlockReason, type ReadyStatusEntryLike } from "@/lib/ready-status";
import type { ReadyStatusData } from "@/pages/league-view/types";
import { RecapModal } from "@/components/recap-modal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WarRoomOpponent {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  prestige: number;
  record: { wins: number; losses: number };
  recentForm: Array<"W" | "L">;
}

interface WarRoomNextOpponent {
  gameId: string;
  isHome: boolean;
  isComplete: boolean;
  gameType: string | null;
  isConference: boolean;
  needsReporting: boolean;
  userScore: number | null;
  opponentScore: number | null;
  opponent: WarRoomOpponent | null;
}

interface WarRoomFeedItem {
  id: string;
  eventType: string;
  description: string;
  teamId: string | null;
  teamName: string | null;
  teamAbbr: string | null;
  createdAt: string;
}

interface WarRoomNeedsAttention {
  hasUnplayedGames: boolean;
  hasUnreportedGames: boolean;
  isRecruitingPhase: boolean;
  scoutActionsUsed: number;
  recruitActionsUsed: number;
  needsRecruiting: boolean;
  departuresFinalized: boolean | null;
  walkonReady: boolean | null;
  isReady: boolean;
  isDeparturesPhase: boolean;
  isWalkonsPhase: boolean;
  isGamePhase: boolean;
}

interface WarRoomData {
  league: {
    id: string;
    name: string;
    currentSeason: number;
    currentWeek: number;
    currentPhase: string;
    phaseDeadline: string | null;
    gameMode: string;
  };
  userTeam: {
    id: string;
    name: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    prestige: number;
    record: { wins: number; losses: number };
  } | null;
  userCoach: {
    id: string;
    firstName: string;
    lastName: string;
    isReady: boolean;
    level: number;
  } | null;
  isCommissioner: boolean;
  nextOpponent: WarRoomNextOpponent | null;
  sinceLastAdvance: WarRoomFeedItem[];
  needsAttention: WarRoomNeedsAttention;
  commissionerBlockers: {
    notReadyCount: number;
    totalHumanTeams: number;
    unreportedGames: number;
  } | null;
}

// ─── Phase labels ─────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  dynasty_setup: "Setup",
  preseason: "Preseason",
  spring_training: "Spring Training",
  regular_season: "Regular Season",
  conference_championship: "Conf. Champs",
  super_regionals: "Super Regionals",
  cws: "CWS",
  offseason: "Offseason",
  offseason_departures: "Departures",
  offseason_walkons: "Walk-ons",
  offseason_recruiting_1: "Recruiting Wk 1",
  offseason_recruiting_2: "Recruiting Wk 2",
  offseason_recruiting_3: "Recruiting Wk 3",
  offseason_recruiting_4: "Recruiting Wk 4",
  offseason_signing_day: "Signing Day",
};

const GAME_TYPE_LABELS: Record<string, string> = {
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
  midweek: "MID",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function WarRoomSkeleton() {
  return (
    <div className="container mx-auto px-4 pt-4 pb-24 max-w-2xl space-y-4">
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

function ReadyBadge({ isReady }: { isReady: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
        isReady
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
          : "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
      }`}
      data-testid="badge-ready-status"
    >
      {isReady ? <Check className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
      {isReady ? "READY" : "NOT READY"}
    </span>
  );
}

function NextGameCard({
  leagueId,
  data,
}: {
  leagueId: string;
  data: WarRoomData;
}) {
  const [recapOpen, setRecapOpen] = useState(false);
  const { nextOpponent, league, userTeam } = data;
  const isGamePhase = [
    "regular_season",
    "conference_championship",
    "super_regionals",
    "cws",
  ].includes(league.currentPhase);

  if (!isGamePhase) return null;

  if (!nextOpponent) {
    return (
      <RetroCard className="mb-4" data-testid="card-next-game-bye">
        <RetroCardContent>
          <div className="flex items-center gap-3 py-1">
            <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                WEEK {league.currentWeek}
              </p>
              <p className="text-sm text-muted-foreground">Bye week — no game scheduled</p>
            </div>
          </div>
        </RetroCardContent>
      </RetroCard>
    );
  }

  const { opponent, isHome, isComplete, gameType, isConference, needsReporting, userScore, opponentScore } = nextOpponent;
  const userWon = isComplete && userScore != null && opponentScore != null && userScore > opponentScore;

  const phaseLabel =
    {
      conference_championship: "CONF CHAMPS",
      super_regionals: "SUPER REGIONALS",
      cws: "CWS",
    }[league.currentPhase] ?? `WEEK ${league.currentWeek}`;

  return (
    <RetroCard
      className={`mb-4 overflow-hidden ${
        isComplete
          ? userWon
            ? "border-emerald-700/50"
            : "border-red-700/50"
          : "border-border"
      }`}
      data-testid="card-next-game"
    >
      {/* Card header bar */}
      <div className="bg-gold/10 px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Swords className="w-3.5 h-3.5 text-gold" />
          <span className="text-gold text-xs">
            {isComplete ? "RESULT" : "NEXT GAME"} — {phaseLabel}
          </span>
          {gameType && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
              {GAME_TYPE_LABELS[gameType] ?? gameType.toUpperCase()}
            </span>
          )}
        </div>
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
            isConference
              ? "bg-blue-500/20 text-blue-400"
              : "bg-muted/50 text-muted-foreground"
          }`}
        >
          {isConference ? "CONF" : "OOC"}
        </span>
      </div>

      <RetroCardContent>
        {opponent && userTeam ? (
          <div className="flex items-center gap-3">
            {/* User team side */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TeamBadge
                abbreviation={userTeam.abbreviation}
                primaryColor={userTeam.primaryColor}
                secondaryColor={userTeam.secondaryColor}
                name={userTeam.name}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate leading-tight">{userTeam.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {isHome ? (
                    <Home className="w-2.5 h-2.5 text-gold" />
                  ) : (
                    <Plane className="w-2.5 h-2.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold text-muted-foreground">
                    {isHome ? "HOME" : "AWAY"}
                  </span>
                </div>
              </div>
            </div>

            {/* Score / VS */}
            <div className="text-center flex-shrink-0 w-16">
              {isComplete ? (
                <>
                  <div
                    className={`font-display text-sm font-bold leading-none ${
                      userWon ? "text-emerald-400" : "text-red-400"
                    }`}
                    data-testid="text-war-room-score"
                  >
                    {userScore} – {opponentScore}
                  </div>
                  <div
                    className={`text-xs font-semibold mt-1 ${
                      userWon ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {userWon ? "WIN" : "LOSS"}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground text-xs">VS</div>
              )}
            </div>

            {/* Opponent side */}
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 text-right">
                <p className="text-sm font-medium truncate leading-tight" data-testid="text-war-room-opponent">
                  {opponent.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {opponent.record.wins}–{opponent.record.losses}
                </p>
                {opponent.recentForm.length > 0 && (
                  <div className="flex items-center gap-0.5 justify-end mt-1" data-testid="text-opponent-form">
                    {opponent.recentForm.map((r, i) => (
                      <span
                        key={i}
                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-xs font-bold ${
                          r === "W"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <TeamBadge
                abbreviation={opponent.abbreviation}
                primaryColor={opponent.primaryColor}
                secondaryColor={opponent.secondaryColor}
                name={opponent.name}
                size="md"
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Opponent info unavailable</p>
        )}

        {/* Action buttons */}
        {!isComplete && opponent && (
          <div className="mt-3 flex gap-2" data-testid="section-game-actions">
            {needsReporting ? (
              <Link href={`/league/${leagueId}/report-game/${nextOpponent.gameId}`} className="flex-1">
                <RetroButton
                  variant="primary"
                  size="md"
                  className="w-full min-h-[44px]"
                  data-testid="button-war-room-report"
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Report Score
                </RetroButton>
              </Link>
            ) : (
              <Link href={`/league/${leagueId}/schedule`} className="flex-1">
                <RetroButton
                  variant="outline"
                  size="md"
                  className="w-full min-h-[44px]"
                  data-testid="button-war-room-schedule"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1.5" />
                  View Schedule
                </RetroButton>
              </Link>
            )}
          </div>
        )}
        {isComplete && (
          <div className="mt-3 flex gap-2">
            <Link href={`/league/${leagueId}/schedule`} className="flex-1">
              <RetroButton
                variant="outline"
                size="md"
                className="w-full min-h-[44px]"
                data-testid="button-war-room-results"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                View Results
              </RetroButton>
            </Link>
            {nextOpponent?.gameId && (
              <RetroButton
                variant="outline"
                size="md"
                className="min-h-[44px] border-gold/30 text-gold/70 hover:text-gold hover:border-gold/60"
                data-testid="button-war-room-recap"
                onClick={() => setRecapOpen(true)}
              >
                <Newspaper className="w-3.5 h-3.5 mr-1.5" />
                Recap
              </RetroButton>
            )}
          </div>
        )}
      </RetroCardContent>
      <RecapModal leagueId={leagueId} gameId={recapOpen && nextOpponent?.gameId ? nextOpponent.gameId : null} onClose={() => setRecapOpen(false)} />
    </RetroCard>
  );
}

interface AttentionItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  urgent: boolean;
  icon: React.ReactNode;
}

function NeedsAttentionCard({
  leagueId,
  data,
  myReadyStatus,
  currentUserId,
  onReadyUp,
  readyPending,
}: {
  leagueId: string;
  data: WarRoomData;
  myReadyStatus: ReadyStatusEntryLike | undefined;
  currentUserId: string | undefined;
  onReadyUp: () => void;
  readyPending: boolean;
}) {
  const { needsAttention, league, userTeam, userCoach } = data;
  if (!userTeam || !userCoach) return null;

  const phase = league.currentPhase;
  const effectiveReady = myReadyStatus ? getEffectiveReady(myReadyStatus, phase) : userCoach.isReady;
  const blockReason = myReadyStatus ? getReadyBlockReason(myReadyStatus, phase) : null;

  const items: AttentionItem[] = [];

  // Unplayed / unreported games
  if (needsAttention.hasUnreportedGames) {
    items.push({
      id: "report-game",
      label: "Score Not Reported",
      detail: "Submit your game report before readying up",
      href: `/league/${leagueId}/schedule`,
      urgent: true,
      icon: <FileText className="w-4 h-4 text-red-400" />,
    });
  } else if (needsAttention.hasUnplayedGames) {
    items.push({
      id: "unplayed-game",
      label: "Game Not Simulated",
      detail: "Simulate your game for this week",
      href: `/league/${leagueId}/schedule`,
      urgent: true,
      icon: <Swords className="w-4 h-4 text-red-400" />,
    });
  }

  // Recruiting
  if (needsAttention.needsRecruiting) {
    items.push({
      id: "recruiting",
      label: "No Recruiting Actions Yet",
      detail: "Take at least one action before you can ready up",
      href: `/league/${leagueId}/recruiting`,
      urgent: true,
      icon: <Target className="w-4 h-4 text-yellow-400" />,
    });
  } else if (needsAttention.isRecruitingPhase) {
    items.push({
      id: "recruiting-active",
      label: "Recruiting Board Open",
      detail: `${needsAttention.recruitActionsUsed} recruit action${needsAttention.recruitActionsUsed !== 1 ? "s" : ""} · ${needsAttention.scoutActionsUsed} scouted`,
      href: `/league/${leagueId}/recruiting`,
      urgent: false,
      icon: <Target className="w-4 h-4 text-gold" />,
    });
  }

  // Departures phase
  if (needsAttention.isDeparturesPhase && needsAttention.departuresFinalized === false) {
    items.push({
      id: "departures",
      label: "Departures Not Finalized",
      detail: "Review and finalize your player departures",
      href: `/league/${leagueId}/departures`,
      urgent: true,
      icon: <UserMinus className="w-4 h-4 text-red-400" />,
    });
  }

  // Walk-ons phase
  if (needsAttention.isWalkonsPhase && needsAttention.walkonReady === false) {
    items.push({
      id: "walkons",
      label: "Walk-ons Not Locked In",
      detail: "Manage your walk-on roster to proceed",
      href: `/league/${leagueId}/walkons`,
      urgent: true,
      icon: <UserPlus className="w-4 h-4 text-yellow-400" />,
    });
  }

  // Ready up (only if no higher-priority urgent block)
  const hasUrgentBlock = items.some(i => i.urgent);
  if (!effectiveReady && !hasUrgentBlock) {
    items.push({
      id: "ready-up",
      label: "Mark Yourself Ready",
      detail: "Let the commissioner know you're set for the next advance",
      href: `#`,
      urgent: false,
      icon: <Clock className="w-4 h-4 text-muted-foreground" />,
    });
  }

  if (effectiveReady && items.length === 0) {
    return (
      <RetroCard className="mb-4 border-emerald-700/40" data-testid="card-needs-attention-clear">
        <RetroCardContent>
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-emerald-400 text-sm">You&rsquo;re all set</p>
              <p className="text-xs text-muted-foreground mt-0.5">Waiting for other coaches and the commissioner to advance</p>
            </div>
          </div>
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <RetroCard className="mb-4" data-testid="card-needs-attention">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gold" />
          <h3 className="text-gold text-xs sm:text-xs">NEEDS ATTENTION</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-2">
          {items.map(item => {
            const isReadyItem = item.id === "ready-up";
            const content = (
              <div
                className={`flex items-center gap-3 p-3 rounded-lg border min-h-[44px] ${
                  item.urgent
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-border/50 bg-background/30"
                } ${isReadyItem ? "cursor-pointer hover-elevate active-elevate-2" : "hover-elevate active-elevate-2 cursor-pointer"}`}
                data-testid={`row-attention-${item.id}`}
              >
                <div className="flex-shrink-0">{item.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.detail}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
            );

            if (isReadyItem) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={blockReason ? undefined : onReadyUp}
                  disabled={readyPending || !!blockReason}
                  className="w-full text-left disabled:opacity-60 disabled:cursor-not-allowed"
                  data-testid="button-attention-ready-up"
                >
                  {content}
                </button>
              );
            }
            return (
              <Link key={item.id} href={item.href}>
                {content}
              </Link>
            );
          })}
        </div>
        {blockReason && (
          <p className="mt-2 text-xs text-yellow-400/80 px-1" data-testid="text-ready-block-reason">
            {blockReason}
          </p>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function QuickActionsBar({
  leagueId,
  phase,
  gameMode,
  isCommissioner,
  onReadyUp,
  readyPending,
  isReady,
}: {
  leagueId: string;
  phase: string;
  gameMode: string;
  isCommissioner: boolean;
  onReadyUp: () => void;
  readyPending: boolean;
  isReady: boolean;
}) {
  const isGamePhase = ["regular_season", "conference_championship", "super_regionals", "cws"].includes(phase);
  const isRecruitingPhase = phase.startsWith("offseason_recruiting");

  type Action = { label: string; href?: string; onClick?: () => void; variant: "primary" | "outline"; icon: React.ReactNode; testId: string; disabled?: boolean };
  const actions: Action[] = [];

  if (isGamePhase) {
    actions.push({
      label: "Schedule",
      href: `/league/${leagueId}/schedule`,
      variant: "outline",
      icon: <Calendar className="w-3.5 h-3.5" />,
      testId: "button-quick-schedule",
    });
    if (gameMode === "reported") {
      actions.push({
        label: "Report Game",
        href: `/league/${leagueId}/schedule`,
        variant: "outline",
        icon: <FileText className="w-3.5 h-3.5" />,
        testId: "button-quick-report",
      });
    }
  }

  if (isRecruitingPhase) {
    actions.push({
      label: "Recruit",
      href: `/league/${leagueId}/recruiting`,
      variant: "outline",
      icon: <Target className="w-3.5 h-3.5" />,
      testId: "button-quick-recruit",
    });
  }

  if (phase === "offseason_departures") {
    actions.push({
      label: "Departures",
      href: `/league/${leagueId}/departures`,
      variant: "outline",
      icon: <UserMinus className="w-3.5 h-3.5" />,
      testId: "button-quick-departures",
    });
  }

  if (phase === "offseason_walkons") {
    actions.push({
      label: "Walk-ons",
      href: `/league/${leagueId}/walkons`,
      variant: "outline",
      icon: <UserPlus className="w-3.5 h-3.5" />,
      testId: "button-quick-walkons",
    });
  }

  // Always show Roster shortcut
  actions.push({
    label: "Roster",
    href: `/league/${leagueId}/roster`,
    variant: "outline",
    icon: <Trophy className="w-3.5 h-3.5" />,
    testId: "button-quick-roster",
  });

  // Ready Up
  actions.push({
    label: isReady ? "Unready" : "Ready Up",
    onClick: onReadyUp,
    variant: isReady ? "outline" : "primary",
    icon: isReady ? <Clock className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />,
    testId: "button-quick-ready",
    disabled: readyPending,
  });

  if (isCommissioner) {
    actions.push({
      label: "Commissioner",
      href: `/league/${leagueId}/commissioner`,
      variant: "outline",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      testId: "button-quick-commissioner",
    });
  }

  return (
    <div className="mb-4" data-testid="section-quick-actions">
      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Quick Actions</p>
      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {actions.map(action => {
          const btn = (
            <RetroButton
              key={action.testId}
              variant={action.variant}
              size="sm"
              className="flex-shrink-0 min-h-[44px] flex items-center gap-1.5 whitespace-nowrap px-3"
              onClick={action.onClick}
              disabled={action.disabled}
              data-testid={action.testId}
            >
              {action.icon}
              <span>{action.label}</span>
            </RetroButton>
          );
          if (action.href) {
            return (
              <Link key={action.testId} href={action.href}>
                {btn}
              </Link>
            );
          }
          return btn;
        })}
      </div>
    </div>
  );
}

function CommissionerView({
  leagueId,
  blockers,
}: {
  leagueId: string;
  blockers: NonNullable<WarRoomData["commissionerBlockers"]>;
}) {
  const totalBlockers = blockers.notReadyCount + blockers.unreportedGames;
  const allGood = totalBlockers === 0;

  return (
    <RetroCard
      className={`mb-4 ${allGood ? "border-emerald-700/40" : "border-gold/40"}`}
      data-testid="card-commissioner-view"
    >
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-gold" />
          <h3 className="text-gold text-xs sm:text-xs">COMMISSIONER VIEW</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {allGood ? (
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            <Check className="w-4 h-4" />
            All teams ready — you can advance
          </p>
        ) : (
          <div className="space-y-2">
            {blockers.notReadyCount > 0 && (
              <div className="flex items-center justify-between" data-testid="text-comm-not-ready">
                <span className="text-sm text-foreground">
                  {blockers.notReadyCount}/{blockers.totalHumanTeams} teams not ready
                </span>
                <Badge variant="outline" className="text-xs font-semibold text-yellow-400 border-yellow-500/40">
                  WAITING
                </Badge>
              </div>
            )}
            {blockers.unreportedGames > 0 && (
              <div className="flex items-center justify-between" data-testid="text-comm-unreported">
                <span className="text-sm text-foreground">
                  {blockers.unreportedGames} game{blockers.unreportedGames !== 1 ? "s" : ""} need reporting
                </span>
                <Badge variant="outline" className="text-xs font-semibold text-red-400 border-red-500/40">
                  REPORTS DUE
                </Badge>
              </div>
            )}
          </div>
        )}
        <Link href={`/league/${leagueId}/commissioner`}>
          <RetroButton
            variant="outline"
            size="sm"
            className="mt-3 w-full min-h-[44px]"
            data-testid="button-comm-go-to-tools"
          >
            Commissioner Tools
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </RetroButton>
        </Link>
      </RetroCardContent>
    </RetroCard>
  );
}

function SinceLastAdvanceSection({
  leagueId,
  items,
}: {
  leagueId: string;
  items: WarRoomFeedItem[];
}) {
  if (items.length === 0) {
    return (
      <RetroCard className="mb-4" data-testid="card-feed-empty">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gold" />
            <h3 className="text-gold text-xs sm:text-xs">SINCE LAST ADVANCE</h3>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-sm text-muted-foreground">No recent activity to show.</p>
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <RetroCard className="mb-4" data-testid="card-since-last-advance">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gold" />
            <h3 className="text-gold text-xs sm:text-xs">SINCE LAST ADVANCE</h3>
          </div>
          <Link href={`/league/${leagueId}/ticker`}>
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-gold transition-colors" data-testid="link-war-room-ticker">
              <Rss className="w-3 h-3" />
              Full Feed →
            </span>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-2" data-testid="list-war-room-feed">
          {items.map(e => (
            <div key={e.id} className="flex items-start gap-2.5" data-testid={`row-feed-${e.id}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-gold/60 mt-[6px] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-foreground/90 leading-snug">{e.description}</p>
                {e.teamAbbr && (
                  <p className="text-xs text-muted-foreground mt-0.5">{e.teamName}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WarRoomPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<WarRoomData>({
    queryKey: ["/api/leagues", id, "war-room"],
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const { data: currentUser } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: readyStatus } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", id, "ready-status"],
    staleTime: 15_000,
  });

  const toggleReady = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/ready`);
      return res.json();
    },
    onSuccess: (resp: { isReady?: boolean }) => {
      if (resp?.isReady) {
        import("@/lib/sfx").then(({ playReadyUpSfx }) => playReadyUpSfx()).catch(() => {});
      } else {
        import("@/lib/sfx").then(({ playClick }) => playClick()).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["/api/leagues", id, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", id, "war-room"] });
    },
  });

  if (isLoading) return <WarRoomSkeleton />;

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <RetroCard variant="bordered" className="text-center p-8 max-w-sm">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-gold text-xs mb-2">War Room Unavailable</h2>
          <p className="text-sm text-muted-foreground mb-4">Could not load your dashboard data.</p>
          <RetroButton onClick={() => refetch()} data-testid="button-war-room-retry">
            Try Again
          </RetroButton>
        </RetroCard>
      </div>
    );
  }

  const { league, userTeam, userCoach, isCommissioner, sinceLastAdvance, commissionerBlockers } = data;

  // Resolve user's personal ready-status entry (server may return minimal list for non-commissioners)
  const myReadyEntry = readyStatus?.readyStatus.find(s => s.userId === currentUser?.id);

  const phase = league.currentPhase;
  const phaseLabel = PHASE_LABELS[phase] ?? phase;
  const effectiveReady = myReadyEntry
    ? getEffectiveReady(myReadyEntry, phase)
    : (userCoach?.isReady ?? false);

  const readyCount = readyStatus?.readyCount ?? 0;
  const humanCount = readyStatus?.humanCount ?? 0;

  // If no team and not commissioner — prompt to join / select
  const hasNoTeam = !userTeam;

  return (
    <div className="min-h-screen bg-background" data-testid="page-war-room">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <header className="border-b border-border sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 max-w-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(`/league/${id}`)}
              className="text-muted-foreground hover:text-gold transition-colors flex-shrink-0 min-h-[44px] flex items-center"
              aria-label="Back to league"
              data-testid="button-war-room-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gold text-xs">WAR ROOM</span>
                <Badge variant="outline" className="text-xs font-semibold text-gold border-gold/40 bg-gold/10">
                  S{league.currentSeason} W{league.currentWeek}
                </Badge>
                <Badge variant="outline" className="text-xs font-semibold text-muted-foreground border-border whitespace-nowrap">
                  {phaseLabel.toUpperCase()}
                </Badge>
              </div>
              {userTeam && (
                <p className="text-sm font-medium text-foreground mt-0.5 truncate" data-testid="text-war-room-team">
                  {userTeam.name}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {userTeam.record.wins}–{userTeam.record.losses}
                  </span>
                </p>
              )}
            </div>

            {userCoach && (
              <div className="flex-shrink-0">
                <ReadyBadge isReady={effectiveReady} />
              </div>
            )}
          </div>

          {/* Ready aggregate bar */}
          {humanCount > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-ready-aggregate">
              <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${humanCount > 0 ? (readyCount / humanCount) * 100 : 0}%` }}
                />
              </div>
              <span className="flex-shrink-0 text-xs font-semibold">
                {readyCount}/{humanCount} ready
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 pt-4 pb-24 max-w-2xl">

        {/* No team state */}
        {hasNoTeam && !isCommissioner && (
          <RetroCard variant="bordered" className="text-center p-8 mb-4" data-testid="card-no-team">
            <Trophy className="w-10 h-10 text-gold mx-auto mb-3" />
            <h2 className="text-gold text-xs mb-2">No Team Assigned</h2>
            <p className="text-sm text-muted-foreground mb-4">
              You are not currently coaching a team in this league.
            </p>
            <Link href={`/league/${id}`}>
              <RetroButton data-testid="button-no-team-go-home">Back to League</RetroButton>
            </Link>
          </RetroCard>
        )}

        {/* Next game */}
        {!hasNoTeam && (
          <NextGameCard leagueId={id} data={data} />
        )}

        {/* Needs attention */}
        {!hasNoTeam && (
          <NeedsAttentionCard
            leagueId={id}
            data={data}
            myReadyStatus={myReadyEntry}
            currentUserId={currentUser?.id}
            onReadyUp={() => toggleReady.mutate()}
            readyPending={toggleReady.isPending}
          />
        )}

        {/* Quick actions */}
        {!hasNoTeam && userCoach && (
          <QuickActionsBar
            leagueId={id}
            phase={phase}
            gameMode={league.gameMode}
            isCommissioner={isCommissioner}
            onReadyUp={() => toggleReady.mutate()}
            readyPending={toggleReady.isPending}
            isReady={effectiveReady}
          />
        )}

        {/* Commissioner view */}
        {isCommissioner && commissionerBlockers && (
          <CommissionerView leagueId={id} blockers={commissionerBlockers} />
        )}

        {/* Since last advance feed */}
        <SinceLastAdvanceSection leagueId={id} items={sinceLastAdvance} />

        {/* Quick links */}
        <div className="mt-2 mb-4 flex gap-2">
          <Link href={`/league/${id}/rivalries`} className="flex-1">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-gold transition-colors min-h-[44px] border border-border rounded-lg"
              data-testid="button-war-room-rivalries"
            >
              <Swords className="w-4 h-4" />
              <span>Rivalries</span>
            </button>
          </Link>
          <Link href={`/league/${id}/identity`} className="flex-1">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-gold transition-colors min-h-[44px] border border-border rounded-lg"
              data-testid="button-war-room-identity"
            >
              <span className="text-base leading-none">🎯</span>
              <span>Identity</span>
            </button>
          </Link>
          <Link href={`/league/${id}`} className="flex-1">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-gold transition-colors min-h-[44px]"
              data-testid="button-war-room-full-hub"
            >
              <span>League Hub</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
