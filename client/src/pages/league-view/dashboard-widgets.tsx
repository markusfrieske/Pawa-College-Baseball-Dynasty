import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Play, ChevronRight, Home, Plane, FileText, ClipboardList, Target,
  UserMinus, UserPlus, Check, Clock, Settings, Trophy, AlertTriangle, History,
  TrendingUp, TrendingDown, Bell, Zap, Star, Swords, Building2, Users,
  GraduationCap, BarChart2, BookOpen, Archive, FastForward, Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LeagueEvent, AdvanceDigest } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import type { LeagueDetails, TeamWithCoach, DashboardOverview, GameForWidget, ScheduleForWidget, ReadyStatusData } from "./types";
import { NEXT_GAME_PHASES } from "./types";
import { getRecentForm, getEffectiveReady } from "./helpers";

function QuickActionCard({
  href,
  icon,
  title,
  subtitle,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: number | string;
}) {
  const showBadge = badge != null && badge !== 0 && badge !== "";
  return (
    <Link href={href}>
      <RetroCard className="hover:border-gold/50 transition-colors cursor-pointer relative min-h-[72px]" data-testid={`card-action-${title.toLowerCase()}`}>
        {showBadge && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-gold text-forest-dark font-pixel text-[7px] px-1 z-10 animate-pulse"
            data-testid={`badge-action-${title.toLowerCase()}`}
          >
            {badge}
          </span>
        )}
        <div className="flex flex-col items-center justify-center text-center gap-1 py-2 h-full">
          <div className="text-gold">{icon}</div>
          <h3 className="font-pixel text-[9px] text-foreground leading-tight">{title}</h3>
          <p className="text-[8px] text-muted-foreground leading-tight hidden sm:block">{subtitle}</p>
        </div>
      </RetroCard>
    </Link>
  );
}

// ============ NEXT GAME WIDGET ============

interface MatchupPreviewResp {
  homeTeam: { id: string; name: string; abbreviation: string; record: { wins: number; losses: number }; powerRank: number; composite: number; top3: { name: string; position: string; overall: number }[] };
  awayTeam: { id: string; name: string; abbreviation: string; record: { wins: number; losses: number }; powerRank: number; composite: number; top3: { name: string; position: string; overall: number }[] };
  h2h: { homeWins: number; awayWins: number; totalGames: number };
}

function QuickMatchupPreviewModal({ leagueId, gameId, open, onOpenChange }: { leagueId: string; gameId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useQuery<MatchupPreviewResp>({
    queryKey: ["/api/leagues", leagueId, "games", gameId, "matchup-preview"],
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm" data-testid="modal-quick-matchup-preview">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-xs">Matchup Preview</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading preview...</div>
        ) : (
          <div className="space-y-4">
            {[data.awayTeam, data.homeTeam].map((t, idx) => (
              <div key={t.id} className="p-2.5 rounded border border-border/50 bg-background/40" data-testid={`preview-team-${idx}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.record.wins}–{t.record.losses}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                  {t.powerRank > 0 && <span>Rank #{t.powerRank}</span>}
                  <span>Avg OVR {t.composite}</span>
                </div>
                <div className="space-y-1">
                  {t.top3.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate">{p.name} <span className="text-muted-foreground">({p.position})</span></span>
                      <span className="text-gold font-medium">{p.overall}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {data.h2h.totalGames > 0 && (
              <p className="text-xs text-center text-muted-foreground" data-testid="text-preview-h2h">
                All-time: {data.awayTeam.abbreviation} {data.h2h.awayWins} – {data.h2h.homeWins} {data.homeTeam.abbreviation}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WeeklyOpponentCard({ leagueId, league, myTeam }: { leagueId: string; league: LeagueDetails; myTeam: TeamWithCoach | undefined }) {
  const isActive = NEXT_GAME_PHASES.has(league.currentPhase);
  const [previewGameId, setPreviewGameId] = useState<string | null>(null);

  const { data: scheduleData } = useQuery<ScheduleForWidget>({
    queryKey: ["/api/leagues", leagueId, "schedule"],
    enabled: isActive,
    staleTime: 30000,
  });

  if (!isActive || !scheduleData) return null;

  const { games, currentWeek, humanTeamIds } = scheduleData;
  const humanTeamSet = new Set(humanTeamIds);
  const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(league.currentPhase);

  const weekGames = isPostseason
    ? games.filter(g => g.phase === league.currentPhase)
    : games.filter(g => g.week === currentWeek);

  const myGames = myTeam
    ? weekGames.filter(g => g.homeTeamId === myTeam.id || g.awayTeamId === myTeam.id)
    : [];

  const nextIncomplete = myGames.find(g => !g.isComplete);
  const lastCompleted = myGames.filter(g => g.isComplete).slice(-1)[0];
  const featured = nextIncomplete ?? lastCompleted;

  if (myTeam && myGames.length === 0) {
    return (
      <div className="mb-4 px-4 py-3 rounded-lg bg-card/60 border border-border/40 flex items-center gap-3" data-testid="widget-next-game-bye">
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div>
          <p className="font-pixel text-[9px] text-muted-foreground mb-0.5">WEEK {currentWeek}</p>
          <p className="text-sm text-muted-foreground">Bye week — no game scheduled</p>
        </div>
      </div>
    );
  }

  let displayGame: GameForWidget | null = featured ?? null;

  if (!myTeam && !displayGame) {
    const incomplete = weekGames.filter(g => !g.isComplete);
    const getPrestige = (g: GameForWidget) => {
      const h = league.teams.find(t => t.id === g.homeTeamId);
      const a = league.teams.find(t => t.id === g.awayTeamId);
      return (h?.prestige ?? 0) + (a?.prestige ?? 0) + (h?.standings?.wins ?? 0) + (a?.standings?.wins ?? 0);
    };
    displayGame = incomplete.sort((a, b) => getPrestige(b) - getPrestige(a))[0] ?? null;
  }

  if (!displayGame) return null;

  const game = displayGame;
  const isUserGame = !!myTeam;
  const userIsHome = !!myTeam && game.homeTeamId === myTeam.id;
  const opponent = isUserGame ? (userIsHome ? game.awayTeam : game.homeTeam) : null;
  const opponentTeamData = opponent ? league.teams.find(t => t.id === opponent.id) : null;
  const homeTeamData = league.teams.find(t => t.id === game.homeTeamId);
  const awayTeamData = league.teams.find(t => t.id === game.awayTeamId);

  const isHvH = humanTeamSet.has(game.homeTeamId) && humanTeamSet.has(game.awayTeamId);
  const phaseLabel = {
    conference_championship: "CONF CHAMPS",
    super_regionals: "SUPER REGIONALS",
    cws: "COLLEGE WORLD SERIES",
  }[league.currentPhase] ?? `WEEK ${currentWeek}`;

  const gameTypeLabel = game.gameType
    ? { friday: "FRI", saturday: "SAT", sunday: "SUN", midweek: "MID" }[game.gameType] ?? game.gameType.toUpperCase()
    : null;

  const userScore = game.isComplete ? (userIsHome ? game.homeScore : game.awayScore) : null;
  const oppScore = game.isComplete ? (userIsHome ? game.awayScore : game.homeScore) : null;
  const userWon = game.isComplete && userScore != null && oppScore != null && userScore > oppScore;

  return (
    <div
      className={`mb-4 bg-card/90 border rounded-lg overflow-hidden ${
        game.isComplete && isUserGame
          ? userWon ? "border-green-700/40" : "border-red-700/40"
          : "border-border"
      }`}
      data-testid="widget-next-game"
    >
      <div className="bg-gold/10 px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-pixel text-gold text-[9px]">
            {game.isComplete ? "RESULT" : "NEXT GAME"} — {phaseLabel}
          </span>
          {gameTypeLabel && (
            <span className="font-pixel text-[7px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground">{gameTypeLabel}</span>
          )}
        </div>
        <span className={`font-pixel text-[8px] px-1.5 py-0.5 rounded ${game.isConference ? "bg-blue-500/20 text-blue-400" : "bg-muted/50 text-muted-foreground"}`}>
          {game.isConference ? "CONF" : "OOC"}
        </span>
      </div>

      <div className="px-3 py-3 flex items-center gap-3">
        {isUserGame && myTeam && opponent ? (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TeamBadge abbreviation={myTeam.abbreviation} primaryColor={myTeam.primaryColor} secondaryColor={myTeam.secondaryColor} name={myTeam.name} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate leading-tight">{myTeam.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {userIsHome
                    ? <Home className="w-2.5 h-2.5 text-gold" />
                    : <Plane className="w-2.5 h-2.5 text-muted-foreground" />}
                  <span className="font-pixel text-[7px] text-muted-foreground">{userIsHome ? "HOME" : "AWAY"}</span>
                </div>
              </div>
            </div>

            <div className="text-center flex-shrink-0 w-16">
              {game.isComplete ? (
                <div className={`font-pixel text-sm leading-none ${userWon ? "text-green-400" : "text-red-400"}`} data-testid="text-next-game-score">
                  {userScore} – {oppScore}
                </div>
              ) : (
                <div className="font-pixel text-muted-foreground text-[10px]">VS</div>
              )}
              {game.isComplete && (
                <div className={`font-pixel text-[8px] mt-0.5 ${userWon ? "text-green-400" : "text-red-400"}`}>
                  {userWon ? "W" : "L"}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 text-right">
                <p className="text-sm font-medium truncate leading-tight" data-testid="text-opponent-name">{opponent.name}</p>
                <div className="flex items-center gap-1.5 justify-end mt-0.5 flex-wrap">
                  {opponentTeamData?.standings && (
                    <span className="text-[10px] text-muted-foreground">
                      {opponentTeamData.standings.wins ?? 0}–{opponentTeamData.standings.losses ?? 0}
                    </span>
                  )}
                  {!!opponentTeamData?.nationalRank && opponentTeamData.nationalRank > 0 && (
                    <span className="text-[10px] text-gold" data-testid="text-opponent-rank">#{opponentTeamData.nationalRank}</span>
                  )}
                </div>
                {(() => {
                  const form = getRecentForm(opponent.id, games, game);
                  if (form.length === 0) return null;
                  return (
                    <div className="flex items-center gap-0.5 justify-end mt-1" data-testid="text-opponent-form">
                      {form.map((r, i) => (
                        <span
                          key={i}
                          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${r === "W" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <TeamBadge abbreviation={opponent.abbreviation} primaryColor={opponent.primaryColor} secondaryColor={opponent.secondaryColor} name={opponent.name} size="md" />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TeamBadge abbreviation={game.homeTeam.abbreviation} primaryColor={game.homeTeam.primaryColor} secondaryColor={game.homeTeam.secondaryColor} name={game.homeTeam.name} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{game.homeTeam.name}</p>
                {homeTeamData?.standings && (
                  <p className="text-[10px] text-muted-foreground">{homeTeamData.standings.wins ?? 0}–{homeTeamData.standings.losses ?? 0}</p>
                )}
              </div>
            </div>
            <div className="font-pixel text-muted-foreground text-[10px] flex-shrink-0">
              {game.isComplete ? `${game.awayScore ?? 0} – ${game.homeScore ?? 0}` : "VS"}
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 text-right">
                <p className="text-sm font-medium truncate">{game.awayTeam.name}</p>
                {awayTeamData?.standings && (
                  <p className="text-[10px] text-muted-foreground">{awayTeamData.standings.wins ?? 0}–{awayTeamData.standings.losses ?? 0}</p>
                )}
              </div>
              <TeamBadge abbreviation={game.awayTeam.abbreviation} primaryColor={game.awayTeam.primaryColor} secondaryColor={game.awayTeam.secondaryColor} name={game.awayTeam.name} size="md" />
            </div>
          </>
        )}

        {!game.isComplete && (
          <div className="flex-shrink-0 ml-1 flex flex-col gap-1.5 items-end">
            {isHvH ? (
              <Link href={`/league/${leagueId}/report-game/${game.id}`}>
                <RetroButton variant="outline" size="sm" data-testid="button-next-game-report">
                  <FileText className="w-3 h-3 mr-1" />
                  Report
                </RetroButton>
              </Link>
            ) : (
              <Link href={`/league/${leagueId}/game/${game.id}/play-by-play`}>
                <RetroButton variant="primary" size="sm" data-testid="button-next-game-simulate">
                  <Play className="w-3 h-3 mr-1" />
                  Simulate
                </RetroButton>
              </Link>
            )}
            <button
              onClick={() => setPreviewGameId(game.id)}
              className="text-[10px] text-muted-foreground hover:text-gold transition-colors underline underline-offset-2"
              data-testid="button-next-game-preview"
            >
              Preview
            </button>
          </div>
        )}
        {game.isComplete && (
          <div className="flex-shrink-0 ml-1">
            <Link href={`/league/${leagueId}/schedule`}>
              <RetroButton variant="outline" size="sm" data-testid="button-next-game-results">
                <FileText className="w-3 h-3 mr-1" />
                Results
              </RetroButton>
            </Link>
          </div>
        )}
      </div>
      {previewGameId && (
        <QuickMatchupPreviewModal
          leagueId={leagueId}
          gameId={previewGameId}
          open={!!previewGameId}
          onOpenChange={(open) => { if (!open) setPreviewGameId(null); }}
        />
      )}
    </div>
  );
}

// ============ PRIMARY PHASE CTA ============

export function PrimaryPhaseCTA({
  leagueId, league, myTeam, currentUserId, isCommissioner, lineupIncomplete,
}: {
  leagueId: string;
  league: LeagueDetails;
  myTeam: TeamWithCoach | undefined;
  currentUserId: string | undefined;
  isCommissioner: boolean;
  lineupIncomplete: boolean;
}) {
  const qc = useQueryClient();
  const phase = league.currentPhase;

  const { data: readyData } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
    staleTime: 15000,
  });

  const isScheduleRelevant = NEXT_GAME_PHASES.has(phase);
  const { data: scheduleData } = useQuery<ScheduleForWidget>({
    queryKey: ["/api/leagues", leagueId, "schedule"],
    enabled: isScheduleRelevant,
    staleTime: 30000,
  });

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
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
    },
  });

  if (!myTeam || phase === "dynasty_setup") return null;

  const myStatus = readyData?.readyStatus.find(s => s.userId === currentUserId);
  const myReady = myStatus ? getEffectiveReady(myStatus, phase) : false;

  let label = "";
  let icon: JSX.Element = <ChevronRight className="w-4 h-4" />;
  let href: string | null = null;
  let onClick: (() => void) | null = null;

  if (isScheduleRelevant && scheduleData) {
    const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(phase);
    const weekGames = isPostseason
      ? scheduleData.games.filter(g => g.phase === phase)
      : scheduleData.games.filter(g => g.week === scheduleData.currentWeek);
    const humanTeamSet = new Set(scheduleData.humanTeamIds);
    const myUnreported = weekGames.find(g =>
      (g.homeTeamId === myTeam.id || g.awayTeamId === myTeam.id) &&
      !g.isComplete && humanTeamSet.has(g.homeTeamId) && humanTeamSet.has(g.awayTeamId)
    );
    if (myUnreported) {
      label = "Report Score";
      icon = <FileText className="w-4 h-4" />;
      href = `/league/${leagueId}/report-game/${myUnreported.id}`;
    } else if (lineupIncomplete) {
      label = "Set Lineup";
      icon = <ClipboardList className="w-4 h-4" />;
      href = `/league/${leagueId}/roster?view=depth&sub=lineup`;
    } else if (!myReady) {
      label = "Ready Up";
      icon = <Check className="w-4 h-4" />;
      onClick = () => toggleReady.mutate();
    }
  } else if ((phase === "preseason" || phase === "spring_training") && lineupIncomplete) {
    label = "Set Lineup";
    icon = <ClipboardList className="w-4 h-4" />;
    href = `/league/${leagueId}/roster?view=depth&sub=lineup`;
  } else if ((phase === "preseason" || phase === "spring_training") && !myReady) {
    label = "Ready Up";
    icon = <Check className="w-4 h-4" />;
    onClick = () => toggleReady.mutate();
  } else if (phase.startsWith("offseason_recruiting")) {
    label = "Recruit Now";
    icon = <Target className="w-4 h-4" />;
    href = `/league/${leagueId}/recruiting`;
  } else if (phase === "offseason_departures") {
    label = "Manage Departures";
    icon = <UserMinus className="w-4 h-4" />;
    href = `/league/${leagueId}/departures`;
  } else if (phase === "offseason_walkons") {
    label = "Manage Walk-Ons";
    icon = <UserPlus className="w-4 h-4" />;
    href = `/league/${leagueId}/walkons`;
  } else if (phase === "offseason_signing_day") {
    if (!myReady) {
      label = "Ready Up";
      icon = <Check className="w-4 h-4" />;
      onClick = () => toggleReady.mutate();
    } else {
      label = "View Commits";
      icon = <Trophy className="w-4 h-4" />;
      href = `/league/${leagueId}/commits`;
    }
  } else if (phase === "offseason" && isCommissioner) {
    label = "Go to Commissioner";
    icon = <Settings className="w-4 h-4" />;
    href = `/league/${leagueId}/commissioner`;
  }

  if (!label) return null;

  const button = (
    <RetroButton
      variant="primary"
      size="lg"
      className="w-full text-xs sm:text-sm py-3.5"
      onClick={onClick ?? undefined}
      disabled={toggleReady.isPending}
      data-haptic={onClick === null ? "light" : "success"}
      data-testid="button-primary-phase-cta"
    >
      {icon}
      <span className="ml-1">{toggleReady.isPending ? "Saving..." : label}</span>
    </RetroButton>
  );

  return (
    <div className="mb-4" data-testid="section-primary-cta">
      {href ? <Link href={href}>{button}</Link> : button}
    </div>
  );
}

// ============ COACH ACTION QUEUE ============

interface RecruitingSummaryForQueue {
  remainingPoints: number;
  remainingScoutPoints: number;
  commitsCount: number;
  maxCommits: number;
}

interface ActionQueueItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: JSX.Element;
  urgent?: boolean;
}

export function CoachActionQueue({
  leagueId, league, myTeam, currentUserId, overview, lineupIncomplete, lineupDetail, isCommissioner,
}: {
  leagueId: string;
  league: LeagueDetails;
  myTeam: TeamWithCoach | undefined;
  currentUserId: string | undefined;
  overview: DashboardOverview | undefined;
  lineupIncomplete: boolean;
  lineupDetail: string;
  isCommissioner: boolean;
}) {
  const phase = league.currentPhase;
  const isRecruitingPhase = phase.startsWith("offseason_recruiting");

  const { data: readyData } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
    staleTime: 15000,
  });

  const isScheduleRelevant = NEXT_GAME_PHASES.has(phase);
  const { data: scheduleData } = useQuery<ScheduleForWidget>({
    queryKey: ["/api/leagues", leagueId, "schedule"],
    enabled: isScheduleRelevant,
    staleTime: 30000,
  });

  const { data: recruitingData } = useQuery<RecruitingSummaryForQueue>({
    queryKey: ["/api/leagues", leagueId, "recruiting"],
    enabled: isRecruitingPhase,
    staleTime: 30000,
  });

  if (!myTeam) return null;

  const items: ActionQueueItem[] = [];

  if (lineupIncomplete) {
    items.push({
      id: "lineup",
      label: "Finish Lineup",
      detail: lineupDetail,
      href: `/league/${leagueId}/roster?view=depth&sub=lineup`,
      icon: <ClipboardList className="w-4 h-4 text-yellow-400" />,
      urgent: true,
    });
  }

  if (isScheduleRelevant && scheduleData) {
    const humanTeamSet = new Set(scheduleData.humanTeamIds);
    const unreported = scheduleData.games.filter(g =>
      (g.homeTeamId === myTeam.id || g.awayTeamId === myTeam.id) &&
      !g.isComplete && g.week <= scheduleData.currentWeek &&
      humanTeamSet.has(g.homeTeamId) && humanTeamSet.has(g.awayTeamId)
    );
    if (unreported.length > 0) {
      items.push({
        id: "unreported-games",
        label: unreported.length === 1 ? "Report a Score" : `Report ${unreported.length} Scores`,
        detail: "Head-to-head result waiting on your box score",
        href: `/league/${leagueId}/report-game/${unreported[0].id}`,
        icon: <FileText className="w-4 h-4 text-blue-400" />,
        urgent: true,
      });
    }
  }

  if (isRecruitingPhase && recruitingData) {
    if (recruitingData.remainingPoints > 0 || recruitingData.remainingScoutPoints > 0) {
      items.push({
        id: "recruiting-points",
        label: "Unused Recruiting Points",
        detail: `${recruitingData.remainingPoints} recruit pts, ${recruitingData.remainingScoutPoints} scout pts left this week`,
        href: `/league/${leagueId}/recruiting`,
        icon: <Target className="w-4 h-4 text-gold" />,
      });
    }
  }

  if (overview && overview.positionsAtRisk.length > 0) {
    items.push({
      id: "positions-at-risk",
      label: "Thin Roster Depth",
      detail: `Low depth: ${overview.positionsAtRisk.join(", ")}`,
      href: `/league/${leagueId}/roster`,
      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
    });
  }

  const myStatus = readyData?.readyStatus.find(s => s.userId === currentUserId);
  const myReady = myStatus ? getEffectiveReady(myStatus, phase) : false;
  if (phase !== "dynasty_setup" && !myReady && items.filter(i => i.urgent).length === 0) {
    const pageActionForPhase: Record<string, { label: string; href: string }> = {
      offseason_departures: { label: "Review Departures", href: `/league/${leagueId}/departures` },
      offseason_walkons: { label: "Manage Walk-Ons", href: `/league/${leagueId}/walkons` },
    };
    const pageAction = pageActionForPhase[phase];
    items.push({
      id: "ready-up",
      label: pageAction ? pageAction.label : "Ready Up for Next Advance",
      detail: pageAction ? "Finish this step so the commissioner can advance" : "Mark yourself ready so the league can move forward",
      href: pageAction ? pageAction.href : `/league/${leagueId}`,
      icon: <Clock className="w-4 h-4 text-muted-foreground" />,
    });
  }

  if (items.length === 0) return null;

  return (
    <RetroCard className="mb-4" data-testid="card-coach-action-queue">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gold" />
          <h3 className="font-pixel text-gold text-[9px] sm:text-[10px]">COACH ACTION QUEUE</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-2">
          {items.map(item => (
            <Link key={item.id} href={item.href}>
              <div
                className={`flex items-center gap-3 p-2.5 rounded-lg border hover-elevate active-elevate-2 cursor-pointer ${item.urgent ? "border-yellow-500/40 bg-yellow-500/5" : "border-border/50 bg-background/30"}`}
                data-testid={`row-action-queue-${item.id}`}
              >
                <div className="flex-shrink-0">{item.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ============ SINCE LAST ADVANCE FEED ============

interface StatLeaderRow {
  playerId: string;
  name: string;
  teamId: string;
  teamAbbr: string;
  hr: number;
  wins: number;
}

interface StatsForFeed {
  battingLeaders?: StatLeaderRow[];
  pitchingLeaders?: StatLeaderRow[];
}

export function SinceLastAdvanceFeed({ leagueId, league }: { leagueId: string; league: LeagueDetails }) {
  const { data: events } = useQuery<LeagueEvent[]>({
    queryKey: ["/api/leagues", leagueId, "events"],
    staleTime: 30000,
  });

  const { data: stats } = useQuery<StatsForFeed>({
    queryKey: ["/api/leagues", leagueId, "stats"],
    staleTime: 60000,
  });

  const rankMovers = (league.teams ?? [])
    .filter(t => t.prevNationalRank != null && t.nationalRank != null && t.prevNationalRank !== t.nationalRank)
    .map(t => ({ team: t, delta: (t.prevNationalRank as number) - t.nationalRank }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  const recentEvents = (events ?? []).slice(0, 8);
  const topHitter = [...(stats?.battingLeaders ?? [])].sort((a, b) => (b.hr ?? 0) - (a.hr ?? 0))[0];
  const topPitcher = [...(stats?.pitchingLeaders ?? [])].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0];

  const hasContent = recentEvents.length > 0 || rankMovers.length > 0 || topHitter || topPitcher;
  if (!hasContent) return null;

  return (
    <RetroCard className="mb-4" data-testid="card-since-last-advance">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-gold" />
          <h3 className="font-pixel text-gold text-[9px] sm:text-[10px]">SINCE LAST ADVANCE</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-3">
          {rankMovers.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="row-rank-movers">
              {rankMovers.map(({ team, delta }) => (
                <div key={team.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-background/40 border border-border/40 text-xs">
                  {delta > 0 ? <TrendingUp className="w-3 h-3 text-green-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                  <span className="font-medium">{team.abbreviation}</span>
                  <span className={delta > 0 ? "text-green-400" : "text-red-400"}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(topHitter || topPitcher) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {topHitter && (
                <div className="p-2 rounded bg-background/30 border border-border/40" data-testid="text-feed-top-hitter">
                  <p className="text-[10px] text-muted-foreground">HR Leader ({topHitter.teamAbbr})</p>
                  <p className="text-sm font-medium">{topHitter.name} <span className="text-gold">{topHitter.hr} HR</span></p>
                </div>
              )}
              {topPitcher && (
                <div className="p-2 rounded bg-background/30 border border-border/40" data-testid="text-feed-top-pitcher">
                  <p className="text-[10px] text-muted-foreground">Wins Leader ({topPitcher.teamAbbr})</p>
                  <p className="text-sm font-medium">{topPitcher.name} <span className="text-gold">{topPitcher.wins}W</span></p>
                </div>
              )}
            </div>
          )}

          {recentEvents.length > 0 && (
            <div className="space-y-1.5" data-testid="list-recent-events">
              {recentEvents.map(e => (
                <div key={e.id} className="flex items-start gap-2 text-sm" data-testid={`row-feed-event-${e.id}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-gold mt-1.5 flex-shrink-0" />
                  <span className="text-foreground/90 leading-snug">{e.description}</span>
                </div>
              ))}
            </div>
          )}

          <Link href={`/league/${leagueId}/ticker`}>
            <span className="text-xs text-gold hover:underline cursor-pointer" data-testid="link-feed-see-more">
              View full ticker →
            </span>
          </Link>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

export function SinceLastAdvanceWidget({ leagueId }: { leagueId: string }) {
  const { data: digest, isLoading } = useQuery<AdvanceDigest | null>({
    queryKey: ["/api/leagues", leagueId, "digests", "latest"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/digests/latest`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 15_000,
  });

  if (isLoading) return null;
  if (!digest) return null;

  const c = digest.categories;
  const gameCount = c.completedGames?.length ?? 0;
  const upsetCount = c.completedGames?.filter(g => g.isUpset).length ?? 0;
  const topPerfCount = c.topPerformances?.length ?? 0;
  const movementCount = c.standingsMovement?.length ?? 0;
  const commitCount = c.recruitingCommits?.length ?? 0;
  const heatingCount = c.heatingUpBattles?.length ?? 0;
  const pendingReportCount = c.pendingScoreReports?.length ?? 0;
  const notReadyCount = c.coachReadyStatus?.filter(cr => !cr.isReady && !cr.isCpu).length ?? 0;

  const totalItems = gameCount + topPerfCount + movementCount + commitCount + heatingCount + pendingReportCount;
  if (totalItems === 0 && notReadyCount === 0) return null;

  const chips: { label: string; icon: JSX.Element; testId: string }[] = [];
  if (gameCount > 0) chips.push({ label: `${gameCount} Game${gameCount === 1 ? "" : "s"}${upsetCount > 0 ? ` (${upsetCount} upset${upsetCount === 1 ? "" : "s"})` : ""}`, icon: <Swords className="w-3 h-3" />, testId: "chip-games" });
  if (topPerfCount > 0) chips.push({ label: `${topPerfCount} Top Perf${topPerfCount === 1 ? "" : "s"}`, icon: <Star className="w-3 h-3" />, testId: "chip-top-performances" });
  if (movementCount > 0) chips.push({ label: `${movementCount} Rank Move${movementCount === 1 ? "" : "s"}`, icon: <TrendingUp className="w-3 h-3" />, testId: "chip-standings-movement" });
  if (commitCount > 0) chips.push({ label: `${commitCount} Commit${commitCount === 1 ? "" : "s"}`, icon: <UserPlus className="w-3 h-3" />, testId: "chip-recruiting-commits" });
  if (heatingCount > 0) chips.push({ label: `${heatingCount} Heating Up`, icon: <Zap className="w-3 h-3" />, testId: "chip-heating-up" });
  if (pendingReportCount > 0) chips.push({ label: `${pendingReportCount} Pending Report${pendingReportCount === 1 ? "" : "s"}`, icon: <AlertTriangle className="w-3 h-3" />, testId: "chip-pending-reports" });
  if (notReadyCount > 0) chips.push({ label: `${notReadyCount} Not Ready`, icon: <Clock className="w-3 h-3" />, testId: "chip-not-ready" });

  return (
    <RetroCard className="border-gold/30 mb-4" data-testid="widget-since-last-advance">
      <div className="flex items-start gap-3">
        <Bell className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="font-pixel text-gold text-[10px]">SINCE LAST ADVANCE</p>
            <Link href={`/league/${leagueId}/digests`}>
              <span className="font-pixel text-[8px] text-muted-foreground hover:text-gold cursor-pointer flex items-center gap-1" data-testid="link-view-all-digests">
                View All <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Badge key={chip.testId} variant="outline" className="text-[9px] gap-1 py-1 px-2 border-border" data-testid={chip.testId}>
                {chip.icon}
                {chip.label}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </RetroCard>
  );
}

// ============ PROGRAM SNAPSHOT PANEL ============

export function ProgramSnapshotPanel({
  overview, userTeam, leagueId,
}: {
  overview: DashboardOverview;
  userTeam: TeamWithCoach | undefined;
  leagueId: string;
}) {
  const wins = userTeam?.standings?.wins ?? 0;
  const losses = userTeam?.standings?.losses ?? 0;
  const confWins = userTeam?.standings?.conferenceWins ?? 0;
  const confLosses = userTeam?.standings?.conferenceLosses ?? 0;

  return (
    <RetroCard data-testid="panel-program-snapshot">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px]">PROGRAM</h3>
          </div>
          {userTeam && (
            <Link href={`/league/${leagueId}/team/${userTeam.id}`}>
              <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer">View →</span>
            </Link>
          )}
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <p className="font-pixel text-[8px] text-muted-foreground mb-1">RECORD</p>
            <p className="text-2xl font-bold text-gold leading-none">{wins}-{losses}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Conf: {confWins}-{confLosses}</p>
          </div>
          <div>
            <p className="font-pixel text-[8px] text-muted-foreground mb-1">AVG OVR</p>
            <p className="text-2xl font-bold leading-none">{Math.round(overview.averageOverall)}</p>
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {overview.hitGrade && (
                <span className="font-pixel text-[7px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-300">H:{overview.hitGrade}</span>
              )}
              {overview.pitchGrade && (
                <span className="font-pixel text-[7px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">P:{overview.pitchGrade}</span>
              )}
              {overview.fieldGrade && (
                <span className="font-pixel text-[7px] px-1 py-0.5 rounded bg-green-500/20 text-green-300">F:{overview.fieldGrade}</span>
              )}
            </div>
          </div>
        </div>
        {overview.topPlayer && (
          <div className="pt-2 border-t border-border/50" data-testid="text-top-player">
            <p className="font-pixel text-[8px] text-muted-foreground mb-1">TOP PLAYER</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate mr-2">{overview.topPlayer.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">({overview.topPlayer.position})</span>
                <span className="text-gold font-bold">{overview.topPlayer.overall}</span>
              </div>
            </div>
          </div>
        )}
        {overview.top5Players && overview.top5Players.length > 1 && (
          <div className="mt-1.5 space-y-1">
            {overview.top5Players.slice(1, 3).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate mr-2">{p.name} <span className="text-[9px]">({p.position})</span></span>
                <span className="shrink-0">{p.overall}</span>
              </div>
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ============ ROSTER HEALTH PANEL ============

export function RosterHealthPanel({
  overview, leagueId,
}: {
  overview: DashboardOverview;
  leagueId: string;
}) {
  const eligOrder = ["FR", "SO", "JR", "SR"];
  const eligMap = overview.eligibility ?? {};
  const atRisk = overview.positionsAtRisk ?? [];

  return (
    <RetroCard data-testid="panel-roster-health">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px]">ROSTER DEPTH</h3>
          </div>
          <Link href={`/league/${leagueId}/roster`}>
            <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer">Manage →</span>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <p className="font-pixel text-[8px] text-muted-foreground">ROSTER</p>
            <p className="text-2xl font-bold leading-none">
              {overview.rosterSize}<span className="text-muted-foreground text-sm">/25</span>
            </p>
          </div>
          <div className="flex gap-3">
            {eligOrder.map(e => {
              const count = eligMap[e] ?? 0;
              if (count === 0) return null;
              return (
                <div key={e} className="text-center">
                  <p className="font-pixel text-[7px] text-muted-foreground">{e}</p>
                  <p className="font-bold text-sm leading-tight">{count}</p>
                </div>
              );
            })}
          </div>
        </div>
        {atRisk.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50" data-testid="list-positions-at-risk">
            <span className="font-pixel text-[8px] text-red-400 self-center">THIN:</span>
            {atRisk.map(pos => (
              <span key={pos} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                {pos}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-green-400 pt-2 border-t border-border/50">Healthy depth across all positions</p>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ============ RECRUITING SNAPSHOT PANEL ============

export function RecruitingSnapshotPanel({
  overview, league, leagueId,
}: {
  overview: DashboardOverview;
  league: LeagueDetails;
  leagueId: string;
}) {
  const remaining = overview.nilBudget - overview.nilSpent;
  const fmt = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  };
  const isRecruitingPhase = league.currentPhase.startsWith("offseason_recruiting") || league.currentPhase === "offseason_signing_day";

  return (
    <RetroCard data-testid="panel-recruiting-snapshot">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px]">RECRUITING</h3>
          </div>
          <Link href={`/league/${leagueId}/recruiting`}>
            <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer">Board →</span>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <p className="font-pixel text-[8px] text-muted-foreground">SIGNED</p>
            <p className="text-2xl font-bold text-gold leading-none">{overview.recruitingSigned}</p>
            {overview.recruitingInterested > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{overview.recruitingInterested} interested</p>
            )}
          </div>
          <div>
            <p className="font-pixel text-[8px] text-muted-foreground">NIL LEFT</p>
            <p className="text-2xl font-bold leading-none">{fmt(remaining)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">of {fmt(overview.nilBudget)}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t border-border/50">
          {isRecruitingPhase && (
            <Link href={`/league/${leagueId}/recruiting`} className="flex-1">
              <span className="block text-center text-[10px] text-gold py-1 border border-gold/30 rounded cursor-pointer hover:bg-gold/5 transition-colors" data-testid="link-recruit-now">
                Scout Now
              </span>
            </Link>
          )}
          <Link href={`/league/${leagueId}/commits`} className="flex-1">
            <span className="block text-center text-[10px] text-muted-foreground hover:text-gold py-1 border border-border/50 rounded cursor-pointer hover:bg-card/80 transition-colors" data-testid="link-class-board">
              Class Board
            </span>
          </Link>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ============ STANDINGS PREVIEW PANEL ============

export function StandingsPreviewPanel({
  league, userTeam, leagueId,
}: {
  league: LeagueDetails;
  userTeam: TeamWithCoach | undefined;
  leagueId: string;
}) {
  const userConfId = userTeam?.conferenceId;
  const conf = userConfId ? (league.conferences ?? []).find(c => c.id === userConfId) : null;
  const confTeams = conf
    ? [...(league.teams ?? [])]
        .filter(t => t.conferenceId === userConfId)
        .sort((a, b) => {
          const aw = a.standings?.wins ?? 0;
          const bw = b.standings?.wins ?? 0;
          if (bw !== aw) return bw - aw;
          return (a.standings?.losses ?? 0) - (b.standings?.losses ?? 0);
        })
        .slice(0, 6)
    : [];

  const fallbackTeams = !conf
    ? [...(league.teams ?? [])]
        .sort((a, b) => (b.standings?.wins ?? 0) - (a.standings?.wins ?? 0))
        .slice(0, 5)
    : [];

  const displayTeams = conf ? confTeams : fallbackTeams;
  const headerLabel = conf
    ? (conf.name.length > 18 ? "CONF STANDINGS" : conf.name.toUpperCase())
    : "LEAGUE";

  if (displayTeams.length === 0) return null;

  return (
    <RetroCard data-testid="panel-standings-preview">
      <RetroCardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-4 h-4 text-gold shrink-0" />
            <h3 className="font-pixel text-gold text-[9px] truncate">{headerLabel}</h3>
          </div>
          <Link href={`/league/${leagueId}?tab=standings`}>
            <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer shrink-0">Full →</span>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-1">
          {displayTeams.map((team, idx) => {
            const isUser = team.id === userTeam?.id;
            return (
              <div
                key={team.id}
                className={`flex items-center gap-2 px-1.5 py-1 rounded ${isUser ? "bg-gold/10 border border-gold/20" : ""}`}
                data-testid={`row-standing-${team.id}`}
              >
                <span className={`font-pixel text-[8px] w-4 text-center shrink-0 ${isUser ? "text-gold" : "text-muted-foreground"}`}>{idx + 1}</span>
                <TeamBadge
                  abbreviation={team.abbreviation}
                  primaryColor={team.primaryColor}
                  secondaryColor={team.secondaryColor}
                  name={team.name}
                  size="xs"
                />
                <span className={`flex-1 text-xs truncate ${isUser ? "text-gold font-medium" : "text-foreground/80"}`}>
                  {team.abbreviation}
                </span>
                <span className={`font-pixel text-[8px] shrink-0 ${isUser ? "text-gold" : "text-muted-foreground"}`}>
                  {team.standings?.wins ?? 0}-{team.standings?.losses ?? 0}
                </span>
              </div>
            );
          })}
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ============ NAV DOCK ============

export function NavDock({
  leagueId, userTeam, isCommissioner, storylinePendingVotes, showLineupBanner,
}: {
  leagueId: string;
  userTeam: TeamWithCoach | undefined;
  isCommissioner: boolean;
  storylinePendingVotes: number;
  showLineupBanner: boolean;
}) {
  const topRow = [
    {
      href: `/league/${leagueId}/coach`,
      icon: <GraduationCap className="w-6 h-6" />,
      title: "Coach",
      subtitle: "View your career",
    },
    {
      href: `/league/${leagueId}/team/${userTeam?.id ?? ""}`,
      icon: <Building2 className="w-6 h-6" />,
      title: "School",
      subtitle: "Your program",
    },
    {
      href: `/league/${leagueId}/roster`,
      icon: <Users className="w-6 h-6" />,
      title: "Roster",
      subtitle: "Manage your team",
    },
    {
      href: `/league/${leagueId}/roster?view=depth&sub=lineup`,
      icon: <ClipboardList className="w-6 h-6" />,
      title: "Lineup",
      subtitle: "Set batting order",
      badge: showLineupBanner ? "!" : undefined,
    },
    {
      href: `/league/${leagueId}/schedule`,
      icon: <Calendar className="w-6 h-6" />,
      title: "Schedule",
      subtitle: "View games",
    },
    {
      href: `/league/${leagueId}/recruiting`,
      icon: <Target className="w-6 h-6" />,
      title: "Recruiting",
      subtitle: "Scout players",
    },
    {
      href: `/league/${leagueId}/commits`,
      icon: <Star className="w-6 h-6" />,
      title: "Commits",
      subtitle: "Class leaderboard",
    },
    {
      href: `/league/${leagueId}/storylines`,
      icon: <Swords className="w-6 h-6" />,
      title: "Storylines",
      subtitle: "Vote on arcs",
      badge: storylinePendingVotes > 0 ? storylinePendingVotes : undefined,
    },
    {
      href: `/league/${leagueId}/stats`,
      icon: <BarChart2 className="w-6 h-6" />,
      title: "Stats",
      subtitle: "Season leaders",
    },
  ];

  const bottomRow = [
    {
      href: `/league/${leagueId}/record-book`,
      icon: <BookOpen className="w-6 h-6" />,
      title: "Record Book",
      subtitle: "Dynasty records",
    },
    {
      href: `/league/${leagueId}/archive`,
      icon: <Archive className="w-6 h-6" />,
      title: "Archive",
      subtitle: "Season history",
    },
    {
      href: `/league/${leagueId}/postseason`,
      icon: <Trophy className="w-6 h-6" />,
      title: "Postseason",
      subtitle: "Bracket & history",
    },
    ...(isCommissioner
      ? [{
          href: `/league/${leagueId}/commissioner`,
          icon: <Settings className="w-6 h-6" />,
          title: "Commissioner",
          subtitle: "Dynasty settings",
        }]
      : []),
  ];

  return (
    <div className="mb-6" data-testid="nav-dock">
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 mb-2">
        {topRow.map(tile => (
          <QuickActionCard key={tile.href} {...tile} />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {bottomRow.map(tile => (
          <QuickActionCard key={tile.href} {...tile} />
        ))}
      </div>
    </div>
  );
}

// ─── Needs Attention Panel ───────────────────────────────────────────────────

interface JobStatus {
  status: "pending" | "processing" | "complete" | "failed";
  progress: number;
  metadata?: { stage?: string };
  errorMessage?: string;
}

interface NeedsAttentionProps {
  leagueId: string;
  league: LeagueDetails;
  isCommissioner: boolean;
  overview: DashboardOverview | undefined;
  onAdvanceSuccess?: (response: any) => void;
}

export function NeedsAttentionPanel({
  leagueId, league, isCommissioner, overview, onAdvanceSuccess,
}: NeedsAttentionProps) {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  const { data: jobStatus } = useQuery<JobStatus>({
    queryKey: ["/api/leagues", leagueId, "job"],
    enabled: !!jobId,
    staleTime: 0,
    refetchInterval: jobId ? 1500 : false,
    select: (data) => {
      if (data?.status === "complete" || data?.status === "failed") {
        setJobId(null);
      }
      return data;
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/advance`, {});
      return res.json();
    },
    onSuccess: (response: any) => {
      if (response?.jobId) {
        setJobId(response.jobId);
      }
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      onAdvanceSuccess?.(response);
    },
  });

  const isWorking = advanceMutation.isPending || (!!jobId && jobStatus?.status !== "complete" && jobStatus?.status !== "failed");
  const jobProgress = jobStatus?.progress ?? 0;
  const jobStage = jobStatus?.metadata?.stage;

  const phase = league.currentPhase;
  const positionsAtRisk = overview?.positionsAtRisk ?? [];
  const isRecruitingPhase = phase.startsWith("offseason_recruiting");
  const hasRosterAlerts = positionsAtRisk.length > 0;

  const { data: recruitingData } = useQuery<{
    remainingPoints: number;
    remainingScoutPoints: number;
    commitsCount: number;
    maxCommits: number;
    highInterestNoOffer?: number;
  }>({
    queryKey: ["/api/leagues", leagueId, "recruiting"],
    enabled: isRecruitingPhase,
    staleTime: 60000,
  });

  const highInterestNoOffer = recruitingData?.highInterestNoOffer ?? 0;
  const hasUrgentRecruits = isRecruitingPhase && highInterestNoOffer > 0;
  const hasAnythingToShow = hasRosterAlerts || hasUrgentRecruits || isCommissioner;

  if (!hasAnythingToShow) return null;

  return (
    <RetroCard className="border-gold/20 bg-gold/5" data-testid="panel-needs-attention">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gold" />
          <h3 className="font-pixel text-gold text-[9px]">NEEDS ATTENTION</h3>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-3">

          {/* Urgent recruits */}
          {hasUrgentRecruits && (
            <Link href={`/league/${leagueId}/recruiting`}>
              <div className="flex items-center gap-3 p-2.5 rounded border border-amber-500/30 bg-amber-500/10 cursor-pointer hover:bg-amber-500/15 transition-colors" data-testid="alert-urgent-recruits">
                <Target className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-amber-300">{highInterestNoOffer} recruit{highInterestNoOffer !== 1 ? "s" : ""} interested — no offer yet</p>
                  <p className="text-[10px] text-amber-400/70">Make an offer before the deadline</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
              </div>
            </Link>
          )}

          {/* Roster alerts */}
          {hasRosterAlerts && (
            <Link href={`/league/${leagueId}/roster`}>
              <div className="flex items-center gap-3 p-2.5 rounded border border-red-500/30 bg-red-500/10 cursor-pointer hover:bg-red-500/15 transition-colors" data-testid="alert-roster-depth">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-300">Thin depth at {positionsAtRisk.slice(0, 3).join(", ")}</p>
                  <p className="text-[10px] text-red-400/70">Check your roster depth</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-red-400/60 shrink-0" />
              </div>
            </Link>
          )}

          {/* Commissioner advance button */}
          {isCommissioner && (
            <div className="space-y-2">
              {isWorking && jobId && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{jobStage ?? "Simulating..."}</span>
                    <span>{jobProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-background/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold/60 rounded-full transition-all duration-500"
                      style={{ width: `${jobProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <RetroButton
                variant="primary"
                className="w-full text-xs py-2.5"
                onClick={() => advanceMutation.mutate()}
                disabled={isWorking}
                data-testid="button-needs-attention-advance"
              >
                {isWorking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {jobId ? `Advancing... ${jobProgress}%` : "Advancing..."}
                  </>
                ) : (
                  <>
                    <FastForward className="w-4 h-4 mr-2" />
                    Advance Week
                  </>
                )}
              </RetroButton>
            </div>
          )}
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

export { QuickActionCard };
