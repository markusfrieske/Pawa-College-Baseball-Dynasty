import { useState, useEffect } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation, useSearch } from "wouter";
import { useUpdateMusicPhase } from "@/lib/music-context";
import { useUpdateAtmospherePhase, useSetAtmosphereBurstColor } from "@/components/atmosphere-provider";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard } from "@/components/ui/retro-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Trophy,
  Users,
  Target,
  Calendar,
  Settings,
  Award,
  X,
  Building2,
  AlertTriangle,
  Zap,
  BarChart,
  ScrollText,
  Swords,
  BookOpen,
  ClipboardList,
  Crown,
  LogOut,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Player } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StoryEngineHub } from "@/components/story-engine-hub";

import type { LeagueDetails, TeamWithCoach, DashboardOverview, AuctionOutcome, StorylineWidgetItem } from "./league-view/types";
import { HOME_TAB_VALUES, STORYLINE_VOTE_CALLOUT_PHASES } from "./league-view/types";
import { formatNil } from "./league-view/helpers";
import { LeagueViewSkeleton } from "./league-view/tabs/skeleton";
import { PhaseGuidanceBanner, SeasonProgressBar } from "./league-view/tabs/phase-banners";
import { NotificationCenter, PhaseDeadline } from "./league-view/tabs/notification-center";
import { WaitingOnWidget } from "./league-view/tabs/waiting-on-widget";
import { WalkonAuctionSummaryModal } from "./league-view/tabs/walkon-auction-modal";
import { QuickActionCard, WeeklyOpponentCard, PrimaryPhaseCTA, CoachActionQueue, SinceLastAdvanceFeed, SinceLastAdvanceWidget } from "./league-view/dashboard-widgets";
import { RosterStrengthCard } from "./league-view/roster-strength-card";
import { ActivityFeed, StorylinesDashboardWidget } from "./league-view/tabs/activity-widgets";
import { SigningDaySummaryCard, ProgramChangesCard, OffseasonSummary } from "./league-view/tabs/offseason-widgets";
import { SeasonRecapDialog } from "./league-view/tabs/season-recap-dialog";
import { StandingsTab } from "./league-view/tabs/StandingsTab";
import { TeamsTab } from "./league-view/tabs/TeamsTab";
import { RankingsTab } from "./league-view/tabs/RankingsTab";
import { ProspectsTab } from "./league-view/tabs/ProspectsTab";
import { AwardsTab } from "./league-view/tabs/AwardsTab";
import { DynastyHistoryTab } from "./league-view/tabs/DynastyHistoryTab";

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
    requestedTab && HOME_TAB_VALUES.has(requestedTab) ? requestedTab : "news"
  );
  useEffect(() => {
    if (requestedTab && HOME_TAB_VALUES.has(requestedTab)) {
      setHomeTab(requestedTab);
    }
  }, [requestedTab]);

  const { data: league, isLoading } = useQuery<LeagueDetails>({
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

  // Auction results: auto-open summary modal for coaches who missed the live resolution
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

  if (isLoading) {
    return <LeagueViewSkeleton />;
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

  const userTeam = league.teams?.find(t => !t.isCpu);
  const myTeam = league.teams?.find(t => t.coach?.userId === currentUser?.id);
  const myCoach = myTeam?.coach ?? null;
  const coCommIds: string[] = Array.isArray(league.coCommissionerIds) ? (league.coCommissionerIds as string[]) : [];
  const isPrimaryCommissioner = !!currentUser && currentUser.id === league.commissionerId;
  const isCommissioner = isPrimaryCommissioner || (!!currentUser && coCommIds.includes(currentUser.id));
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

  if (league.currentPhase === "dynasty_setup" || (!league.teams || league.teams.length === 0)) {
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
    spring_training: "Spring",
    regular_season: "Regular Season",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason: "Offseason",
    offseason_departures: "Players Leaving",
    offseason_recruiting_1: "Offseason Recruiting (Week 1)",
    offseason_recruiting_2: "Offseason Recruiting (Week 2)",
    offseason_recruiting_3: "Offseason Recruiting (Week 3)",
    offseason_recruiting_4: "Offseason Recruiting (Week 4)",
    offseason_signing_day: "Decision Day",
    offseason_walkons: "Cuts & Walk-Ons",
  };

  const canShowRecap = league.currentSeason >= 1;
  const isOffseason = league.currentPhase.startsWith("offseason");
  const recapSeasonNum = isOffseason && league.currentSeason > 1 ? league.currentSeason - 1 : league.currentSeason;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3 min-w-0">
            <Link href="/dashboard" className="text-muted-foreground hover:text-gold transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-base sm:text-lg truncate">{league.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 shrink-0">
              <Calendar className="w-3.5 h-3.5" />
              <span>S{league.currentSeason} W{league.currentWeek}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0" data-testid="text-current-phase">
              <Trophy className="w-3.5 h-3.5 text-gold" />
              <Badge variant="outline" className="font-pixel text-[7px] sm:text-[8px] text-gold border-gold/40 bg-gold/10 whitespace-nowrap">
                {phaseLabels[league.currentPhase]}
              </Badge>
            </div>
            {userTeam?.standings && (
              <div className="flex items-center gap-1.5 shrink-0" data-testid="text-user-team-record">
                <span className="text-gold font-medium">
                  {userTeam.name}: {userTeam.standings.wins ?? 0}-{userTeam.standings.losses ?? 0}
                </span>
              </div>
            )}
            {(() => {
              const commTeam = league.teams?.find(t => t.coach?.userId === league.commissionerId);
              const commLabel = commTeam?.abbreviation ?? "COMM";
              const coCommTeams = coCommIds.map(uid => league.teams?.find(t => t.coach?.userId === uid)).filter(Boolean);
              return (
                <>
                  <div className="flex items-center gap-1 shrink-0" data-testid="badge-commissioner-identity">
                    <Crown className="w-3 h-3 text-gold" />
                    <Badge variant="outline" className="font-pixel text-[7px] text-gold border-gold/40 bg-gold/10">
                      {isPrimaryCommissioner ? "COMMISSIONER" : `COMM: ${commLabel}`}
                    </Badge>
                  </div>
                  {coCommTeams.length > 0 && coCommIds.some(uid => uid !== currentUser?.id) && (
                    coCommTeams.map(t => (
                      t && t.coach?.userId !== currentUser?.id && (
                        <div key={t.id} className="flex items-center gap-1 shrink-0" data-testid={`badge-delegate-identity-${t.id}`}>
                          <Crown className="w-3 h-3 text-blue-400" />
                          <Badge variant="outline" className="font-pixel text-[7px] text-blue-400 border-blue-400/40 bg-blue-400/10">
                            DEL: {t.abbreviation}
                          </Badge>
                        </div>
                      )
                    ))
                  )}
                  {!isPrimaryCommissioner && isCommissioner && (
                    <div className="flex items-center gap-1 shrink-0" data-testid="badge-co-commissioner">
                      <Crown className="w-3 h-3 text-blue-400" />
                      <Badge variant="outline" className="font-pixel text-[7px] text-blue-400 border-blue-400/40 bg-blue-400/10">DELEGATE</Badge>
                    </div>
                  )}
                </>
              );
            })()}
            {canShowRecap && (
              <button
                onClick={() => { setRecapSeason(recapSeasonNum); setShowRecap(true); }}
                className="flex items-center gap-1 text-gold/70 hover:text-gold transition-colors shrink-0"
                data-testid="button-season-recap"
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span className="text-[10px]">Recap</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <Users className="w-3.5 h-3.5" />
              <span>{league.teams?.length || 0}/{league.maxTeams} Teams</span>
            </div>
            {league.progressionEnabled ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-pixel text-[7px] sm:text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default shrink-0"
                title="Player attributes grow between seasons based on potential and team facilities"
                data-testid="badge-progression-on"
              >
                <Zap className="w-2.5 h-2.5" />
                PROGRESSION ON
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-pixel text-[7px] sm:text-[8px] bg-muted/40 text-muted-foreground border border-border cursor-default shrink-0"
                title="Player attributes do not change between seasons in this league"
                data-testid="badge-progression-off"
              >
                <Zap className="w-2.5 h-2.5" />
                PROGRESSION OFF
              </span>
            )}
          </div>
          {league.phaseDeadline && (
            <PhaseDeadline deadline={league.phaseDeadline} />
          )}
          <div className="flex items-center justify-end gap-2 mt-2">
            {canLeave && (
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setShowLeaveConfirm(true)}
                data-testid="button-leave-league"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="w-3.5 h-3.5 mr-1" />
                Leave
              </RetroButton>
            )}
            <NotificationCenter leagueId={id!} />
          </div>

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

          <SeasonProgressBar phase={league.currentPhase} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <PhaseGuidanceBanner phase={league.currentPhase} leagueId={id!} />

        <WaitingOnWidget leagueId={id!} league={league} pendingVoteCount={storylinePendingVotes} />

        {showLineupBanner && (
          <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30" data-testid="banner-lineup-incomplete">
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

        {showAuctionModal && auctionResultsData?.results && (
          <WalkonAuctionSummaryModal
            outcomes={auctionResultsData.results}
            onDismiss={() => {
              setShowAuctionModal(false);
              try { localStorage.setItem(auctionSeenKey, "1"); } catch {}
            }}
          />
        )}

        <PrimaryPhaseCTA
          leagueId={id!}
          league={league}
          myTeam={myTeam}
          currentUserId={currentUser?.id}
          isCommissioner={isCommissioner}
          lineupIncomplete={ownBattingIncomplete || ownPitchingIncomplete}
        />

        <WeeklyOpponentCard leagueId={id!} league={league} myTeam={myTeam} />

        <CoachActionQueue
          leagueId={id!}
          league={league}
          myTeam={myTeam}
          currentUserId={currentUser?.id}
          overview={overview}
          lineupIncomplete={ownBattingIncomplete || ownPitchingIncomplete}
          lineupDetail={[
            ownBattingIncomplete ? `Batting ${ownBattingAssigned}/9` : null,
            ownPitchingIncomplete ? `Rotation ${ownRotationAssigned}/4` : null,
          ].filter(Boolean).join(" · ")}
          isCommissioner={isCommissioner}
        />

        <SinceLastAdvanceFeed leagueId={id!} league={league} />

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-2 sm:gap-3 mb-6">
          <QuickActionCard
            href={`/league/${id}/coach`}
            icon={<Award className="w-6 h-6" />}
            title="Coach"
            subtitle="View your career"
          />
          <QuickActionCard
            href={`/league/${id}/team/${userTeam?.id || ''}`}
            icon={<Building2 className="w-6 h-6" />}
            title="School"
            subtitle="Your program"
          />
          <QuickActionCard
            href={`/league/${id}/roster`}
            icon={<Users className="w-6 h-6" />}
            title="Roster"
            subtitle="Manage your team"
          />
          <QuickActionCard
            href={`/league/${id}/roster?view=depth&sub=lineup`}
            icon={<ClipboardList className="w-6 h-6" />}
            title="Lineup"
            subtitle="Set batting order"
            badge={showLineupBanner ? "!" : undefined}
          />
          <QuickActionCard
            href={`/league/${id}/schedule`}
            icon={<Calendar className="w-6 h-6" />}
            title="Schedule"
            subtitle="View games"
          />
          <QuickActionCard
            href={`/league/${id}/recruiting`}
            icon={<Target className="w-6 h-6" />}
            title="Recruiting"
            subtitle="Scout players"
          />
          <QuickActionCard
            href={`/league/${id}/commits`}
            icon={<Trophy className="w-6 h-6" />}
            title="Commits"
            subtitle="Class leaderboard"
          />
          <QuickActionCard
            href={`/league/${id}/storylines`}
            icon={<Swords className="w-6 h-6" />}
            title="Storylines"
            subtitle="Vote on arcs"
            badge={storylinePendingVotes || undefined}
          />
          <QuickActionCard
            href={`/league/${id}/stats`}
            icon={<BarChart className="w-6 h-6" />}
            title="Stats"
            subtitle="Season leaders"
          />
          <QuickActionCard
            href={`/league/${id}/record-book`}
            icon={<BookOpen className="w-6 h-6" />}
            title="Record Book"
            subtitle="Dynasty records"
          />
          <QuickActionCard
            href={`/league/${id}/postseason`}
            icon={<Crown className="w-6 h-6" />}
            title="Postseason"
            subtitle="Bracket & history"
          />
          {isCommissioner && (
            <QuickActionCard
              href={`/league/${id}/commissioner`}
              icon={<Settings className="w-6 h-6" />}
              title="Commissioner"
              subtitle="Dynasty settings"
            />
          )}
        </div>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <RetroCard className="p-3" data-testid="card-overview-record">
              <div className="text-center">
                <p className="font-pixel text-[8px] text-muted-foreground mb-1">RECORD</p>
                <p className="text-xl font-bold text-gold">
                  {userTeam?.standings?.wins || 0}-{userTeam?.standings?.losses || 0}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Conf: {userTeam?.standings?.conferenceWins || 0}-{userTeam?.standings?.conferenceLosses || 0}
                </p>
              </div>
            </RetroCard>

            <RetroCard className="p-3" data-testid="card-overview-roster">
              <div className="text-center">
                <p className="font-pixel text-[8px] text-muted-foreground mb-1">ROSTER</p>
                <p className="text-xl font-bold">{overview.rosterSize}/25</p>
                {overview.positionsAtRisk.length > 0 ? (
                  <p className="text-[10px] text-red-400">
                    Thin: {overview.positionsAtRisk.join(", ")}
                  </p>
                ) : (
                  <p className="text-[10px] text-green-400">Healthy depth</p>
                )}
              </div>
            </RetroCard>

            <RetroCard className="p-3" data-testid="card-overview-nil">
              <div className="text-center">
                <p className="font-pixel text-[8px] text-muted-foreground mb-1">NIL BUDGET</p>
                <p className="text-xl font-bold text-gold">
                  {formatNil(overview.nilBudget - overview.nilSpent)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  of {formatNil(overview.nilBudget)} total
                </p>
              </div>
            </RetroCard>

            <RetroCard className="p-3" data-testid="card-overview-recruiting">
              <div className="text-center">
                <p className="font-pixel text-[8px] text-muted-foreground mb-1">RECRUITING</p>
                <p className="text-xl font-bold">{overview.recruitingSigned}</p>
                <p className="text-[10px] text-muted-foreground">
                  Signed{overview.recruitingInterested > 0 ? ` | ${overview.recruitingInterested} interested` : ""}
                </p>
              </div>
            </RetroCard>
          </div>
        )}

        <SigningDaySummaryCard league={league} myTeam={myTeam} />

        <ProgramChangesCard league={league} myTeam={myTeam} />

        <SinceLastAdvanceWidget leagueId={league.id} />

        <OffseasonSummary league={league} />

        <Tabs value={homeTab} onValueChange={setHomeTab} className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
            <TabsList className="bg-card border border-border inline-flex w-auto gap-0">
              <TabsTrigger value="news" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-news">
                News
              </TabsTrigger>
              <TabsTrigger value="standings" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-standings">
                Stand
              </TabsTrigger>
              <TabsTrigger value="teams" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-teams">
                Teams
              </TabsTrigger>
              <TabsTrigger value="rankings" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-rankings">
                Rank
              </TabsTrigger>
              <TabsTrigger value="prospects" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-prospects">
                Top 100
              </TabsTrigger>
              <TabsTrigger value="awards" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-awards">
                Award
              </TabsTrigger>
              <TabsTrigger value="history" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-history">
                Hist
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="prospects">
            <ProspectsTab leagueId={league.id} currentSeason={league.currentSeason ?? 1} />
          </TabsContent>

          <TabsContent value="standings">
            <StandingsTab league={league} />
          </TabsContent>

          <TabsContent value="teams">
            <TeamsTab league={league} />
          </TabsContent>

          <TabsContent value="rankings">
            <RankingsTab league={league} />
          </TabsContent>

          <TabsContent value="news">
            <ActivityFeed leagueId={league.id} />
            <StorylinesDashboardWidget leagueId={league.id} />
            <div className="mt-4">
              <StoryEngineHub leagueId={league.id} teamId={userTeam?.id} />
            </div>
            {overview && (
              <div className="mt-4">
                <RosterStrengthCard overview={overview} leagueId={league.id} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="awards">
            <AwardsTab leagueId={league.id} />
          </TabsContent>

          <TabsContent value="history">
            <DynastyHistoryTab leagueId={league.id} />
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
