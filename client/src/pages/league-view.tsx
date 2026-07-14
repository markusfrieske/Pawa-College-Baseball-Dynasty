import { useState, useEffect } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation, useSearch } from "wouter";
import { useUpdateMusicPhase } from "@/lib/music-context";
import { useUpdateAtmospherePhase, useSetAtmosphereBurstColor } from "@/components/atmosphere-provider";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard } from "@/components/ui/retro-card";
import { QueryError } from "@/components/ui/query-error";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TeamBadge } from "@/components/ui/team-badge";
import {
  ArrowLeft,
  Trophy,
  Calendar,
  Settings,
  X,
  AlertTriangle,
  Zap,
  ScrollText,
  Crown,
  LogOut,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Player } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LEAGUE_HUB_BANNERS, getLeagueHubBannerKey } from "@/lib/art-assets";

import type { LeagueDetails, TeamWithCoach, DashboardOverview, AuctionOutcome, StorylineWidgetItem } from "./league-view/types";
import { HOME_TAB_VALUES, STORYLINE_VOTE_CALLOUT_PHASES } from "./league-view/types";
import { LeagueViewSkeleton } from "./league-view/tabs/skeleton";
import { PhaseGuidanceBanner, SeasonProgressBar } from "./league-view/tabs/phase-banners";
import { NotificationCenter, PhaseDeadline } from "./league-view/tabs/notification-center";
import { WaitingOnWidget } from "./league-view/tabs/waiting-on-widget";
import { WalkonAuctionSummaryModal } from "./league-view/tabs/walkon-auction-modal";
import {
  WeeklyOpponentCard, PrimaryPhaseCTA, CoachActionQueue, SinceLastAdvanceFeed,
  SinceLastAdvanceWidget, ProgramSnapshotPanel,
  RecruitingSnapshotPanel, StandingsPreviewPanel, NavDock,
  NeedsAttentionPanel,
} from "./league-view/dashboard-widgets";
import {
  LeagueTickerBanner, StatsLeadersPanel, PowerRankingsWidget,
  TopProspectsWidget, MergedRosterPanel, NewsroomPanel,
  NationalPulsePanel, ThisWeekPanel,
} from "./league-view/hub-panels";
import { StorylinesDashboardWidget } from "./league-view/tabs/activity-widgets";
import { SigningDaySummaryCard, ProgramChangesCard, OffseasonSummary } from "./league-view/tabs/offseason-widgets";
import { SeasonRecapDialog } from "./league-view/tabs/season-recap-dialog";
import { StandingsTab } from "./league-view/tabs/StandingsTab";
import { TeamsTab } from "./league-view/tabs/TeamsTab";
import { RankingsTab } from "./league-view/tabs/RankingsTab";
import { ProspectsTab } from "./league-view/tabs/ProspectsTab";
import { AwardsTab } from "./league-view/tabs/AwardsTab";
import { DynastyHistoryTab } from "./league-view/tabs/DynastyHistoryTab";
import { LeagueEditsReadOnly } from "./league-view/tabs/LeagueEditsReadOnly";

export default function LeagueViewPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const search = useSearch();
  const updateMusicPhase = useUpdateMusicPhase();
  const updateAtmospherePhase = useUpdateAtmospherePhase();
  const setAtmosphereBurstColor = useSetAtmosphereBurstColor();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showRecap, setShowRecap] = useState(false);
  const [recapSeason, setRecapSeason] = useState(1);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showAuctionModal, setShowAuctionModal] = useState(false);

  const requestedTab = new URLSearchParams(search).get("tab");
  const [homeTab, setHomeTab] = useState(
    requestedTab && HOME_TAB_VALUES.has(requestedTab) ? requestedTab : "standings"
  );
  useEffect(() => {
    if (requestedTab && HOME_TAB_VALUES.has(requestedTab)) {
      setHomeTab(requestedTab);
    }
  }, [requestedTab]);

  const { data: league, isLoading, isFetching, isError: leagueIsError, error: leagueError, refetch: refetchLeague } = useQuery<LeagueDetails>({
    queryKey: ["/api/leagues", id],
  });

  const { data: currentUser } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const leagueMut = useMutation({
    mutationFn: async (coachId: string) => {
      const res = await apiRequest("DELETE", `/api/leagues/${id}/coaches/${coachId}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues"] });
      toast({ title: "Left League", description: "You have left the dynasty. Your team is now CPU-controlled." });
      navigate("/dashboard");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const { data: overview } = useQuery<DashboardOverview>({
    queryKey: ["/api/leagues", id, "dashboard-overview"],
    enabled: !!league && league.currentPhase !== "dynasty_setup",
    staleTime: 30_000,
  });

  const { data: readyStatus } = useQuery<import("./league-view/types").ReadyStatusData>({
    queryKey: ["/api/leagues", id, "ready-status"],
    enabled: !!league && league.currentPhase !== "dynasty_setup",
    staleTime: 30_000,
  });

  const storylineActivePhase = league ? STORYLINE_VOTE_CALLOUT_PHASES.has(league.currentPhase) : false;
  const { data: storylinesNavResp } = useQuery<{ storylines: StorylineWidgetItem[] }>({
    queryKey: ["/api/leagues", id, "storylines"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/storylines`, { credentials: "include" });
      if (!res.ok) return { storylines: [] };
      const json = await res.json();
      return Array.isArray(json) ? { storylines: json } : (json as { storylines: StorylineWidgetItem[] });
    },
    enabled: storylineActivePhase,
    staleTime: 60000,
  });
  const storylinePendingVotes = (storylinesNavResp?.storylines ?? []).filter(
    (s) => !!s.activeEvent && !s.myVote,
  ).length;

  const activeLineupPhases = ["preseason", "spring_training", "regular_season", "conference_championship", "super_regionals", "cws"];
  const shouldCheckLineup = !!(league?.teams?.find(t => t.coach?.userId === currentUser?.id)) && activeLineupPhases.includes(league?.currentPhase ?? "");

  const { data: ownRosterData } = useQuery({
    queryKey: [`/api/leagues/${id}/roster`],
    enabled: shouldCheckLineup,
    select: (data: { players: Player[]; team: TeamWithCoach }) => ({
      players: data.players.map((p) => ({
        position: p.position,
        battingOrder: p.battingOrder,
        pitchingRole: p.pitchingRole,
      })),
    }),
  });

  const [lineupBannerDismissed, setLineupBannerDismissed] = useState(() => {
    try { return localStorage.getItem(`lineup-banner-dismissed-${id}`) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (league?.currentPhase) {
      updateMusicPhase(league.currentPhase);
      updateAtmospherePhase(league.currentPhase);
    }
  }, [league?.currentPhase, updateMusicPhase, updateAtmospherePhase]);

  useEffect(() => {
    if (!league?.teams || !currentUser?.id) return;
    const myTeamLocal = league.teams.find((t: TeamWithCoach) => t.coach?.userId === currentUser.id);
    if (myTeamLocal?.primaryColor) {
      setAtmosphereBurstColor(myTeamLocal.primaryColor);
    }
  }, [league?.teams, currentUser?.id, setAtmosphereBurstColor]);

  const hasAuctionResults = !!league?.lastWalkonAuction && league?.currentPhase !== "offseason_walkons";
  const auctionSeenKey = `walkon-auction-seen-${id}-s${league?.currentSeason}`;
  const { data: auctionResultsData } = useQuery<{ results: AuctionOutcome[] }>({
    queryKey: ["/api/leagues", id, "walkons", "auction-results"],
    enabled: hasAuctionResults && !!currentUser,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (!auctionResultsData?.results || auctionResultsData.results.length === 0) return;
    try {
      if (localStorage.getItem(auctionSeenKey) !== "1") {
        setShowAuctionModal(true);
      }
    } catch {}
  }, [auctionResultsData, auctionSeenKey]);

  if (isLoading) return <LeagueViewSkeleton />;

  if (leagueIsError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <QueryError error={leagueError} onRetry={refetchLeague} />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-8">
          <h2 className="font-pixel text-gold text-sm mb-4">Dynasty Not Found</h2>
          <Link href="/dashboard">
            <RetroButton>Back to Dashboard</RetroButton>
          </Link>
        </RetroCard>
      </div>
    );
  }

  const myTeam = league.teams?.find(t => t.coach?.userId === currentUser?.id) ?? null;
  const myCoach = myTeam?.coach ?? null;
  const coCommIds: string[] = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
  const isPrimaryCommissioner = !!currentUser && currentUser.id === league.commissionerId;
  const isCommissioner = isPrimaryCommissioner || (!!currentUser && coCommIds.includes(currentUser.id));
  const hasAssignedTeam = !!myTeam;
  const isLeagueOnlyCommissioner = isCommissioner && !hasAssignedTeam;
  const canLeave = !!myCoach && !isPrimaryCommissioner;

  const dismissLineupBanner = () => {
    setLineupBannerDismissed(true);
    try { localStorage.setItem(`lineup-banner-dismissed-${id}`, "1"); } catch {}
  };

  const PITCHER_POS = ["P", "SP", "RP", "CL", "LHP", "RHP"];
  const ownPositionPlayers = (ownRosterData?.players ?? []).filter((p) => !PITCHER_POS.includes(p.position));
  const ownPitchers = (ownRosterData?.players ?? []).filter((p) => PITCHER_POS.includes(p.position));
  const ownBattingAssigned = ownPositionPlayers.filter(p => p.battingOrder != null && p.battingOrder >= 1 && p.battingOrder <= 9).length;
  const requiredRotation = ["FRI", "SAT", "SUN", "MID"];
  const ownRotationAssigned = requiredRotation.filter(role => ownPitchers.some(p => p.pitchingRole === role)).length;
  const ownBattingIncomplete = ownPositionPlayers.length >= 9 && ownBattingAssigned < 9;
  const ownPitchingIncomplete = ownPitchers.length >= 4 && ownRotationAssigned < 4;
  const showLineupBanner = shouldCheckLineup && !lineupBannerDismissed && (ownBattingIncomplete || ownPitchingIncomplete);

  if (!isFetching && (league.currentPhase === "dynasty_setup" || (!league.teams || league.teams.length === 0))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-8 max-w-md">
          <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
          <h2 className="font-pixel text-gold text-sm mb-2">Dynasty Setup Incomplete</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This dynasty still needs teams selected. Continue setup to pick your team and add CPU opponents.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href={`/league/${id}/team-selection`}>
              <RetroButton data-testid="button-resume-setup">Resume Setup</RetroButton>
            </Link>
            <Link href="/dashboard">
              <RetroButton variant="outline" data-testid="button-back-dashboard">Back to Dashboard</RetroButton>
            </Link>
          </div>
        </RetroCard>
      </div>
    );
  }

  const phaseLabels: Record<string, string> = {
    dynasty_setup: "Dynasty Setup",
    preseason: "Spring",
    spring_training: "Spring Training",
    regular_season: "Regular Season",
    conference_championship: "Conf. Champs",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason: "Offseason",
    offseason_departures: "Players Leaving",
    offseason_recruiting_1: "Recruiting Wk 1",
    offseason_recruiting_2: "Recruiting Wk 2",
    offseason_recruiting_3: "Recruiting Wk 3",
    offseason_recruiting_4: "Recruiting Wk 4",
    offseason_signing_day: "Decision Day",
    offseason_walkons: "Cuts & Walk-Ons",
  };

  const canShowRecap = league.currentSeason >= 1;
  const isOffseason = league.currentPhase.startsWith("offseason");
  const recapSeasonNum = isOffseason && league.currentSeason > 1 ? league.currentSeason - 1 : league.currentSeason;

  return (
    <div className="min-h-screen bg-background">

      {/* ─── LEAVE LEAGUE DIALOG ─────────────────────────────────────── */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-gold text-sm">Leave Dynasty?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave <strong>{league.name}</strong>? Your team ({myTeam?.name}) will become CPU-controlled. This cannot be undone.
              {isCommissioner && (
                <span className="block mt-2 text-amber-400">You are the commissioner. Transfer the role before leaving.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leagueMut.mutate(myCoach!.id)}
              disabled={leagueMut.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-confirm-leave-league"
            >
              {leagueMut.isPending ? "Leaving..." : "Leave Dynasty"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── COMMAND BAR ─────────────────────────────────────────────── */}
      <header className="border-b border-border">
        <div className="h-[2px] w-full" style={{ background: "rgb(var(--atm-accent) / 0.55)" }} aria-hidden="true" />
        <div className="container mx-auto px-4 py-3">
          {/* Identity row */}
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="text-muted-foreground hover:text-gold transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>

            {myTeam && (
              <TeamBadge
                abbreviation={myTeam.abbreviation}
                primaryColor={myTeam.primaryColor}
                secondaryColor={myTeam.secondaryColor}
                name={myTeam.name}
                size="sm"
                className="shrink-0"
              />
            )}

            <div className="flex-1 min-w-0">
              <h1 className="font-pixel text-gold text-sm sm:text-base truncate leading-tight" data-testid="text-league-name">
                {league.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                <div className="flex items-center gap-1 shrink-0">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">S{league.currentSeason} W{league.currentWeek}</span>
                </div>
                <Badge
                  variant="outline"
                  className="font-pixel text-xs text-gold border-gold/40 bg-gold/10 whitespace-nowrap"
                  data-testid="text-current-phase"
                >
                  {phaseLabels[league.currentPhase]}
                </Badge>
                {myTeam?.standings && (
                  <span className="text-xs text-gold font-medium shrink-0" data-testid="text-user-team-record">
                    {myTeam.standings.wins ?? 0}–{myTeam.standings.losses ?? 0}
                  </span>
                )}
                {isPrimaryCommissioner ? (
                  <span className="flex items-center gap-1 shrink-0" data-testid="badge-commissioner-identity">
                    <Crown className="w-3 h-3 text-gold" />
                    <Badge variant="outline" className="font-pixel text-xs text-gold border-gold/40 bg-gold/10">COMM</Badge>
                  </span>
                ) : isCommissioner ? (
                  <span className="flex items-center gap-1 shrink-0" data-testid="badge-co-commissioner">
                    <Crown className="w-3 h-3 text-blue-400" />
                    <Badge variant="outline" className="font-pixel text-xs text-blue-400 border-blue-400/40 bg-blue-400/10">DELEGATE</Badge>
                  </span>
                ) : null}
                {league.progressionEnabled ? (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-pixel text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default shrink-0"
                    title="Player attributes grow between seasons"
                    data-testid="badge-progression-on"
                  >
                    <Zap className="w-2.5 h-2.5" />
                    PROG
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-pixel text-xs bg-muted/40 text-muted-foreground border border-border cursor-default shrink-0"
                    title="Player attributes do not change between seasons"
                    data-testid="badge-progression-off"
                  >
                    <Zap className="w-2.5 h-2.5" />
                    NO PROG
                  </span>
                )}
              </div>
            </div>

            {/* Right-side controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {canShowRecap && (
                <button
                  onClick={() => { setRecapSeason(recapSeasonNum); setShowRecap(true); }}
                  className="text-gold/70 hover:text-gold transition-colors p-1"
                  data-testid="button-season-recap"
                  title="Season Recap"
                >
                  <ScrollText className="w-4 h-4" />
                </button>
              )}
              {isCommissioner && (
                <Link href={`/league/${id}/commissioner`}>
                  <RetroButton variant="outline" size="sm" data-testid="button-commissioner-shortcut" className="hidden sm:flex">
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    Comm
                  </RetroButton>
                </Link>
              )}
              {canLeave && (
                <RetroButton
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLeaveConfirm(true)}
                  data-testid="button-leave-league"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10 p-1 sm:px-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </RetroButton>
              )}
              <NotificationCenter leagueId={id!} />
            </div>
          </div>

          {league.phaseDeadline && <PhaseDeadline deadline={league.phaseDeadline} />}
          <SeasonProgressBar phase={league.currentPhase} />
        </div>
      </header>

      {/* ─── SEASONAL HERO BANNER ────────────────────────────────────── */}
      {(() => {
        const bannerKey = getLeagueHubBannerKey(league.currentPhase, league.currentWeek ?? 0);
        const banner = LEAGUE_HUB_BANNERS[bannerKey];
        return (
          <div
            className="relative overflow-hidden border-b"
            style={{ height: "clamp(240px, 24vw, 380px)", borderColor: "rgba(202,168,84,0.22)", background: "#102414" }}
            data-testid="hub-hero"
          >
            {/* Desktop image */}
            <img
              src={banner.src}
              alt={banner.alt}
              loading="eager"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none hidden sm:block"
              style={{ objectPosition: banner.desktopPosition }}
            />
            {/* Mobile image */}
            <img
              src={banner.src}
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none sm:hidden"
              style={{ objectPosition: banner.mobilePosition }}
            />
            {/* Subtle bottom overlay only — no left-side dark gradient */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
              style={{
                background: "linear-gradient(to bottom, rgba(8,18,10,0.04), rgba(8,18,10,0.18)), linear-gradient(to top, rgba(8,18,10,0.55), rgba(8,18,10,0))",
              }}
            />
            {/* Text panel — bottom-left, sits in the gradient fade zone */}
            <div className="relative z-10 h-full flex items-end">
              <div className="container mx-auto px-4 pb-4">
                <div className="min-w-0">
                  {hasAssignedTeam && myTeam && (
                    <p className="font-pixel text-xs text-gold/80 mb-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {myTeam.name} · {phaseLabels[league.currentPhase]}
                    </p>
                  )}
                  {isLeagueOnlyCommissioner && (
                    <p className="font-pixel text-xs text-gold/80 mb-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      COMMISSIONER · {phaseLabels[league.currentPhase]}
                    </p>
                  )}
                  <h2
                    className="font-pixel text-gold text-sm sm:text-base leading-snug truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
                    data-testid="text-hub-season"
                  >
                    Season {league.currentSeason} · Week {league.currentWeek}
                  </h2>
                  {hasAssignedTeam && myTeam?.standings && (
                    <p className="text-white/80 text-xs mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {myTeam.standings.wins ?? 0}–{myTeam.standings.losses ?? 0} record
                      {myTeam.standings.conferenceWins != null ? ` · ${myTeam.standings.conferenceWins}-${myTeam.standings.conferenceLosses} conf` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── AUCTION MODAL ───────────────────────────────────────────── */}
      {showAuctionModal && auctionResultsData?.results && (
        <WalkonAuctionSummaryModal
          outcomes={auctionResultsData.results}
          onDismiss={() => {
            setShowAuctionModal(false);
            try { localStorage.setItem(auctionSeenKey, "1"); } catch {}
          }}
        />
      )}

      {/* Live ticker — full-bleed, immediately below hero */}
      <LeagueTickerBanner leagueId={league.id} />

      <main className="container mx-auto px-4 py-4 pb-20 md:pb-6">

        {/* Digest strip — full width, collapsed chip row */}
        <SinceLastAdvanceWidget leagueId={league.id} />

        {/* Lineup alert — inline, dismissible */}
        {showLineupBanner && (
          <div className="flex items-center gap-3 px-4 py-2.5 mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30" data-testid="banner-lineup-incomplete">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-yellow-300 text-sm font-medium">Lineup incomplete</span>
              <span className="text-yellow-400/70 text-xs ml-2">
                {[
                  ownBattingIncomplete ? `Batting ${ownBattingAssigned}/9` : null,
                  ownPitchingIncomplete ? `Rotation ${ownRotationAssigned}/4` : null,
                ].filter(Boolean).join(" · ")}
              </span>
            </div>
            <Link href={`/league/${id}/roster?view=depth&sub=lineup`}>
              <RetroButton variant="outline" size="sm" className="border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10 text-xs" data-testid="button-set-lineup">
                Set Lineup
              </RetroButton>
            </Link>
            <button
              onClick={dismissLineupBanner}
              className="text-yellow-400/60 hover:text-yellow-300 transition-colors"
              data-testid="button-dismiss-lineup-banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── THIS WEEK: Command Center ────────────────────────────── */}
        <ThisWeekPanel
          leagueId={id!}
          league={league}
          myTeamId={myTeam?.id}
          overview={overview}
          readyStatus={readyStatus ?? undefined}
          isCommissioner={isCommissioner}
        />

        {/* ═══════════════════════════════════════════════════════════
            COCKPIT GRID — 3-column on desktop, stacked on mobile
            Left  (4): Readiness + Action queue + Storylines
            Center(5): Phase context + Next game + Program + Roster
            Right (3): Recruiting + Standings + League pulse
        ═══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6 items-start">

          {/* ── LEFT COLUMN: Readiness + Actions ─────────────────── */}
          <div className="lg:col-span-4 space-y-4">
            <WaitingOnWidget
              leagueId={id!}
              league={league}
              pendingVoteCount={storylinePendingVotes}
            />

            <PrimaryPhaseCTA
              leagueId={id!}
              league={league}
              myTeam={myTeam ?? undefined}
              currentUserId={currentUser?.id}
              isCommissioner={isCommissioner}
              lineupIncomplete={ownBattingIncomplete || ownPitchingIncomplete}
            />

            <NeedsAttentionPanel
              leagueId={id!}
              league={league}
              isCommissioner={isCommissioner}
              overview={overview}
              onAdvanceSuccess={(response: any) => {
                const phase: string | undefined = response?.currentPhase;
                if (league.dynastyPreset === "full_season" && phase) {
                  const phaseRedirects: Record<string, string> = {
                    offseason_recruiting_1: `/league/${id}/recruiting`,
                    offseason_recruiting_2: `/league/${id}/recruiting`,
                    offseason_recruiting_3: `/league/${id}/recruiting`,
                    offseason_recruiting_4: `/league/${id}/recruiting`,
                    conference_championship: `/league/${id}/postseason`,
                    super_regionals: `/league/${id}/postseason`,
                    cws: `/league/${id}/postseason`,
                    offseason_signing_day: `/league/${id}/commits`,
                    offseason_walkons: `/league/${id}/walkons`,
                    regular_season: `/league/${id}`,
                    preseason: `/league/${id}`,
                    spring_training: `/league/${id}`,
                  };
                  const dest = phaseRedirects[phase];
                  if (dest) navigate(dest);
                }
              }}
            />

            <CoachActionQueue
              leagueId={id!}
              league={league}
              myTeam={myTeam ?? undefined}
              currentUserId={currentUser?.id}
              overview={overview}
              lineupIncomplete={ownBattingIncomplete || ownPitchingIncomplete}
              lineupDetail={[
                ownBattingIncomplete ? `Batting ${ownBattingAssigned}/9` : null,
                ownPitchingIncomplete ? `Rotation ${ownRotationAssigned}/4` : null,
              ].filter(Boolean).join(" · ")}
              isCommissioner={isCommissioner}
            />

            <StorylinesDashboardWidget leagueId={id!} />

            {/* Offseason-specific summary cards */}
            <SigningDaySummaryCard league={league} myTeam={myTeam} />
            <ProgramChangesCard league={league} myTeam={myTeam} />
            <OffseasonSummary league={league} myTeam={myTeam} />
          </div>

          {/* ── CENTER COLUMN: Game context + Program ────────────── */}
          <div className="lg:col-span-5 space-y-4">
            <PhaseGuidanceBanner phase={league.currentPhase} leagueId={id!} />

            <WeeklyOpponentCard leagueId={id!} league={league} myTeam={myTeam ?? undefined} />

            {overview && (
              <>
                <ProgramSnapshotPanel
                  overview={overview}
                  userTeam={myTeam ?? undefined}
                  leagueId={id!}
                />
                {/* ── Roster composition ──────────────────────────────── */}
                <div className="flex items-center gap-2 -mb-1 mt-1">
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="font-pixel text-xs text-muted-foreground/50 uppercase tracking-wider">Roster</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
                <MergedRosterPanel
                  overview={overview}
                  leagueId={id!}
                />
              </>
            )}
          </div>

          {/* ── RIGHT COLUMN: Recruiting + Standings + Pulse ─────── */}
          <div className="lg:col-span-3 space-y-4">
            {overview && (
              <RecruitingSnapshotPanel
                overview={overview}
                league={league}
                leagueId={id!}
              />
            )}

            <StandingsPreviewPanel
              league={league}
              userTeam={myTeam ?? undefined}
              leagueId={id!}
            />

            <SinceLastAdvanceFeed leagueId={id!} league={league} />
          </div>
        </div>

        {/* ─── LEAGUE NEWSROOM ──────────────────────────────────────── */}
        <div className="mt-4">
          <NewsroomPanel
            leagueId={league.id}
            isCommissioner={isCommissioner}
            myTeamId={myTeam?.id}
            phase={league.currentPhase}
            currentUserId={currentUser?.id}
          />
        </div>

        {/* ─── STATS / RANKINGS / PROSPECTS ROW ───────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <StatsLeadersPanel leagueId={id!} />
          <PowerRankingsWidget leagueId={id!} />
          <TopProspectsWidget leagueId={id!} />
        </div>

        {/* ─── NATIONAL PULSE (full-width Top 25 + bubble) ─────────── */}
        <div className="mt-4">
          <NationalPulsePanel leagueId={id!} />
        </div>

        {/* ─── NAVIGATION DOCK ─────────────────────────────────────── */}
        <NavDock
          leagueId={id!}
          userTeam={myTeam ?? undefined}
          isCommissioner={isCommissioner}
          storylinePendingVotes={storylinePendingVotes}
          showLineupBanner={showLineupBanner}
        />

        {/* ─── DETAIL TABS (deep-dive views) ───────────────────────── */}
        <Tabs value={homeTab} onValueChange={setHomeTab} className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
            <TabsList className="bg-card border border-border inline-flex w-auto gap-0">
              <TabsTrigger value="standings" className="font-pixel text-xs whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-standings">
                <span className="hidden sm:inline">Standings</span>
                <span className="sm:hidden">Stand</span>
              </TabsTrigger>
              <TabsTrigger value="teams" className="font-pixel text-xs whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-teams">
                Teams
              </TabsTrigger>
              <TabsTrigger value="rankings" className="font-pixel text-xs whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-rankings">
                <span className="hidden sm:inline">Rankings</span>
                <span className="sm:hidden">Rank</span>
              </TabsTrigger>
              <TabsTrigger value="prospects" className="font-pixel text-xs whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-prospects">
                Top 100
              </TabsTrigger>
              <TabsTrigger value="awards" className="font-pixel text-xs whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-awards">
                <span className="hidden sm:inline">Awards</span>
                <span className="sm:hidden">Award</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="font-pixel text-xs whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-history">
                <span className="hidden sm:inline">History</span>
                <span className="sm:hidden">Hist</span>
              </TabsTrigger>
              <TabsTrigger value="edits" className="font-pixel text-xs whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-edits">
                <span className="hidden sm:inline">Edits</span>
                <span className="sm:hidden">Edits</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="standings">
            <StandingsTab league={league} />
          </TabsContent>

          <TabsContent value="teams">
            <TeamsTab league={league} />
          </TabsContent>

          <TabsContent value="rankings">
            <RankingsTab league={league} />
          </TabsContent>

          <TabsContent value="prospects">
            <ProspectsTab leagueId={league.id} currentSeason={league.currentSeason ?? 1} />
          </TabsContent>

          <TabsContent value="awards">
            <AwardsTab leagueId={league.id} />
          </TabsContent>

          <TabsContent value="history">
            <DynastyHistoryTab leagueId={league.id} />
          </TabsContent>

          <TabsContent value="edits">
            <LeagueEditsReadOnly leagueId={league.id} />
          </TabsContent>
        </Tabs>
      </main>

      <SeasonRecapDialog
        leagueId={league.id}
        season={recapSeason}
        open={showRecap}
        onClose={() => setShowRecap(false)}
      />
    </div>
  );
}
