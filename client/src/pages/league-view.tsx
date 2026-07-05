import { useState, useEffect, Fragment } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation, useSearch } from "wouter";
import { useUpdateMusicPhase } from "@/lib/music-context";
import { useUpdateAtmospherePhase, useSetAtmosphereBurstColor } from "@/components/atmosphere-provider";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Trophy, 
  Users, 
  Target, 
  Calendar, 
  Settings,
  Play,
  ChevronRight,
  Newspaper,
  Plus,
  Pin,
  Award,
  Image as ImageIcon,
  X,
  Building2,
  Check,
  CheckCircle,
  Clock,
  Bell,
  TrendingUp,
  TrendingDown,
  Star,
  Zap,
  History,
  BarChart,
  ScrollText,
  Compass,
  UserMinus,
  UserPlus,
  Timer,
  ChevronDown,
  ChevronUp,
  Swords,
  BookOpen,
  Sparkles,
  Vote,
  ClipboardList,
  AlertTriangle,
  FileText,
  Home,
  Plane,
  Crown,
  Skull,
  Diamond,
  Gavel,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { League, Team, Conference, Standings, DynastyNews, LeagueEvent, Player } from "@shared/schema";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { User, Cpu, Pen, GitMerge, FileX, UserCheck, GraduationCap, Activity, Filter, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import addieFriskImg from "@/assets/images/addie-frisk.png";
import sullyPumpImg from "@/assets/images/sully-pump.png";
import { StoryEngineHub } from "@/components/story-engine-hub";
import { InningScoreboard, useScoreboardEnabled, type InningScoreboardData } from "@/components/inning-scoreboard";

interface TeamWithCoach extends Team {
  standings?: Standings;
  coach?: {
    id: string;
    firstName: string;
    lastName: string;
    userId: string;
  } | null;
  user?: {
    email: string;
    username?: string | null;
  } | null;
}

// Format NIL budget values: ≥1M → "$X.XM", otherwise "$XK"
function formatNil(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1000)}K`;
}

// Helper to get display name from user email/username
function getDisplayName(user?: { email: string; username?: string | null } | null): string {
  if (!user) return "";
  if (user.username) return user.username;
  const emailPrefix = user.email.split("@")[0];
  // For guest accounts, show shortened version
  if (emailPrefix.startsWith("guest-")) {
    return "Guest";
  }
  return emailPrefix;
}

interface DashboardOverview {
  rosterSize: number;
  eligibility: Record<string, number>;
  positionCounts: Record<string, number>;
  positionsAtRisk: string[];
  nilBudget: number;
  nilSpent: number;
  prestige: number;
  recruitingSigned: number;
  recruitingInterested: number;
  averageOverall: number;
  hitterAvg: number;
  pitcherAvg: number;
  starDist: Record<string, number>;
  top5Players: { name: string; position: string; overall: number; starRating: number }[];
  topPlayer: { name: string; position: string; overall: number } | null;
  hittingScore?: number;
  fieldingScore?: number;
  speedScore?: number;
  pitchingScore?: number;
  hitGrade?: string;
  fieldGrade?: string;
  speedGrade?: string;
  pitchGrade?: string;
}

interface AuctionOutcome {
  walkonId: string;
  firstName: string;
  lastName: string;
  position: string;
  overall: number;
  won: boolean;
  pricePaid: number;
  winnerTeamName: string | null;
  yourBid: number;
}

function fmtKLeague(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

const STAR_COLORS: Record<number, string> = {
  1: "bg-gray-500",
  2: "bg-blue-500",
  3: "bg-green-500",
  4: "bg-yellow-500",
  5: "bg-orange-500",
};

const STAR_TEXT_COLORS: Record<number, string> = {
  1: "text-gray-400",
  2: "text-blue-400",
  3: "text-green-400",
  4: "text-yellow-400",
  5: "text-orange-400",
};

function RosterStrengthCard({ overview, leagueId }: { overview: DashboardOverview; leagueId: string }) {
  const totalPlayers = overview.rosterSize;
  const maxStarCount = Math.max(...[1, 2, 3, 4, 5].map(s => overview.starDist?.[String(s)] || 0), 1);

  return (
    <RetroCard className="mb-6" data-testid="card-roster-strength">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px] sm:text-[10px]">ROSTER STRENGTH</h3>
          </div>
          <Link href={`/league/${leagueId}/roster`}>
            <RetroButton variant="outline" size="sm" className="text-[9px] px-2 py-1 h-auto" data-testid="button-view-full-roster">
              View Roster
            </RetroButton>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div className="space-y-3">
            <div className="text-center p-3 bg-background/50 rounded border border-border/50">
              <p className="font-pixel text-[7px] text-muted-foreground mb-1">TEAM AVG OVR</p>
              <p className="text-3xl font-bold text-gold" data-testid="text-avg-ovr">{overview.averageOverall}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{totalPlayers} players</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-background/50 rounded border border-border/50">
                <p className="font-pixel text-[7px] text-muted-foreground mb-1">HITTERS</p>
                <p className="text-lg font-bold text-sky-400" data-testid="text-hitter-avg">{overview.hitterAvg || "—"}</p>
                <p className="font-pixel text-[6px] text-muted-foreground">avg ovr</p>
              </div>
              <div className="text-center p-2 bg-background/50 rounded border border-border/50">
                <p className="font-pixel text-[7px] text-muted-foreground mb-1">PITCHERS</p>
                <p className="text-lg font-bold text-purple-400" data-testid="text-pitcher-avg">{overview.pitcherAvg || "—"}</p>
                <p className="font-pixel text-[6px] text-muted-foreground">avg ovr</p>
              </div>
            </div>
          </div>

          <div>
            <p className="font-pixel text-[7px] text-muted-foreground mb-2">STAR DISTRIBUTION</p>
            <div className="space-y-1.5" data-testid="chart-star-distribution">
              {[5, 4, 3, 2, 1].map(stars => {
                const count = overview.starDist?.[String(stars)] || 0;
                const pct = totalPlayers > 0 ? Math.round((count / totalPlayers) * 100) : 0;
                const barWidth = maxStarCount > 0 ? Math.round((count / maxStarCount) * 100) : 0;
                return (
                  <div key={stars} className="flex items-center gap-2" data-testid={`row-star-dist-${stars}`}>
                    <span className={`font-pixel text-[7px] w-5 shrink-0 ${STAR_TEXT_COLORS[stars]}`}>{stars}★</span>
                    <div className="flex-1 bg-background/60 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${STAR_COLORS[stars]}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-10 shrink-0 text-right">
                      {count} <span className="text-muted-foreground/60">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="font-pixel text-[7px] text-muted-foreground mb-2">TOP 5 PLAYERS</p>
            <div className="space-y-1.5" data-testid="list-top5-players">
              {(overview.top5Players || []).map((p, i) => (
                <div key={i} className="flex items-center gap-2 p-1.5 bg-background/40 rounded border border-border/30" data-testid={`row-top-player-${i}`}>
                  <span className="font-pixel text-[7px] text-muted-foreground/60 w-3 shrink-0">{i + 1}</span>
                  <span className={`font-pixel text-[7px] shrink-0 ${STAR_TEXT_COLORS[p.starRating]}`}>
                    {"★".repeat(p.starRating)}
                  </span>
                  <span className="text-[10px] font-medium text-foreground truncate flex-1 min-w-0">{p.name}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{p.position}</span>
                  <span className="font-pixel text-[8px] text-gold shrink-0 w-8 text-right" data-testid={`text-player-ovr-${i}`}>{p.overall}</span>
                </div>
              ))}
            </div>
          </div>

        </div>


      </RetroCardContent>
    </RetroCard>
  );
}

interface LeagueDetails extends League {
  teams: TeamWithCoach[];
  conferences: Conference[];
}

const HOME_TAB_VALUES = new Set(["prospects", "standings", "teams", "rankings", "news", "awards", "history"]);

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
    select: (data: { players: Player[]; team: Team }) => ({
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
      <RetroCard className="hover:border-gold/50 transition-colors cursor-pointer h-full relative" data-testid={`card-action-${title.toLowerCase()}`}>
        {showBadge && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-gold text-forest-dark font-pixel text-[7px] px-1 z-10 animate-pulse"
            data-testid={`badge-action-${title.toLowerCase()}`}
          >
            {badge}
          </span>
        )}
        <div className="flex flex-col items-center text-center gap-1 py-1">
          <div className="text-gold">{icon}</div>
          <h3 className="font-pixel text-[9px] text-foreground leading-tight">{title}</h3>
          <p className="text-[8px] text-muted-foreground leading-tight hidden sm:block">{subtitle}</p>
        </div>
      </RetroCard>
    </Link>
  );
}

// ============ NEXT GAME WIDGET ============

interface GameForWidget {
  id: string;
  week: number;
  phase: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  isConference: boolean;
  gameType: string | null;
  homeTeam: Team;
  awayTeam: Team;
}

interface ScheduleForWidget {
  games: GameForWidget[];
  currentWeek: number;
  humanTeamIds: string[];
}

const NEXT_GAME_PHASES = new Set(["regular_season", "conference_championship", "super_regionals", "cws"]);

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

function getRecentForm(teamId: string, allGames: GameForWidget[], beforeGame: GameForWidget, limit = 5): ("W" | "L")[] {
  const completed = allGames
    .filter(g => g.isComplete && g.homeScore != null && g.awayScore != null && (g.homeTeamId === teamId || g.awayTeamId === teamId))
    .filter(g => g.week < beforeGame.week || (g.week === beforeGame.week && g.id !== beforeGame.id))
    .sort((a, b) => a.week - b.week)
    .slice(-limit);
  return completed.map(g => {
    const isHome = g.homeTeamId === teamId;
    const teamScore = isHome ? g.homeScore! : g.awayScore!;
    const oppScore = isHome ? g.awayScore! : g.homeScore!;
    return teamScore > oppScore ? "W" : "L";
  });
}

function WeeklyOpponentCard({ leagueId, league, myTeam }: { leagueId: string; league: LeagueDetails; myTeam: TeamWithCoach | undefined }) {
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

function PrimaryPhaseCTA({
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
    onSuccess: () => {
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

function CoachActionQueue({
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

function SinceLastAdvanceFeed({ leagueId, league }: { leagueId: string; league: LeagueDetails }) {
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

          <Link href={`/league/${leagueId}/record-book`}>
            <span className="text-xs text-gold hover:underline cursor-pointer" data-testid="link-feed-see-more">
              View full history →
            </span>
          </Link>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

// ============ STORYLINES DASHBOARD WIDGET ============

interface StorylineWidgetItem {
  id: string;
  isLegendary: boolean;
  archetypeName: string;
  overlappingRecruitName?: string | null;
  currentArcStage?: number;
  resolvedOvrDelta?: number;
  totalEvents?: number;
  recruit?: {
    firstName: string;
    lastName: string;
    position?: string;
    starRank?: number;
  } | null;
  activeEvent?: {
    id: string;
    eventText: string;
    resolvedChoice?: string | null;
    ovrDelta?: number | null;
  } | null;
  voteCounts?: Record<string, number>;
  myVote?: string | null;
}

function StorylinesDashboardWidget({ leagueId }: { leagueId: string }) {
  const { data: storylinesResp, isLoading } = useQuery<{ storylines: StorylineWidgetItem[] }>({
    queryKey: ["/api/leagues", leagueId, "storylines"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/storylines`, { credentials: "include" });
      if (!res.ok) return { storylines: [] };
      const json = await res.json();
      return Array.isArray(json) ? { storylines: json } : (json as { storylines: StorylineWidgetItem[] });
    },
    staleTime: 60000,
  });
  const storylines = storylinesResp?.storylines ?? [];

  // Real activity score: open votes get 2x weight, arc stage progress, OVR momentum, and legendary bonus
  const activityScore = (s: StorylineWidgetItem) => {
    const totalVotes = s.voteCounts
      ? Object.values(s.voteCounts).reduce((a: number, b: number) => a + b, 0)
      : 0;
    const hasOpenVote = s.activeEvent ? 10 : 0;
    return hasOpenVote + totalVotes * 2 + (s.currentArcStage ?? 0) * 3 + Math.abs(s.resolvedOvrDelta ?? 0) + (s.isLegendary ? 5 : 0);
  };

  const activeVotes = storylines.filter((s) => !!s.activeEvent);
  // Votes the current coach hasn't cast yet
  const unvotedCount = storylines.filter((s) => !!s.activeEvent && !s.myVote).length;
  // Top 3 most active storylines by real activity score
  const mostActive = [...storylines].sort((a, b) => activityScore(b) - activityScore(a)).slice(0, 3);

  if (isLoading) return null;
  if (storylines.length === 0) return null;

  return (
    <RetroCard variant="bordered" className="mb-3" data-testid="storylines-dashboard-widget">
      <RetroCardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-gold" />
          <span className="font-pixel text-xs text-gold">Recruit Storylines</span>
          {unvotedCount > 0 && (
            <span className="font-pixel text-[9px] bg-gold/20 text-gold border border-gold/40 px-1.5 py-0.5 rounded animate-pulse" data-testid="badge-unvoted-storylines">
              {unvotedCount} vote{unvotedCount !== 1 ? "s" : ""} pending
            </span>
          )}
        </div>
        <Link href={`/league/${leagueId}/storylines`}>
          <RetroButton variant="outline" size="sm" data-testid="button-view-storylines">
            View All
            <ChevronRight className="w-3 h-3 ml-1" />
          </RetroButton>
        </Link>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-muted/30 rounded-md px-2 py-2 text-center">
            <div className="font-pixel text-[7px] text-muted-foreground mb-1">STORYLINES</div>
            <div className="text-lg font-bold">{storylines.length}</div>
          </div>
          <div className="bg-muted/30 rounded-md px-2 py-2 text-center">
            <div className="font-pixel text-[7px] text-muted-foreground mb-1">MY VOTES</div>
            <div className={`text-lg font-bold ${unvotedCount > 0 ? "text-gold" : ""}`}>{unvotedCount}</div>
          </div>
        </div>

        {mostActive.length > 0 && (
          <div className="space-y-2">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">MOST ACTIVE</div>
            {mostActive.map((sl) => {
              const hasOpenVote = !!sl.activeEvent;
              return (
                <Link key={sl.id} href={`/league/${leagueId}/storylines`}>
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 rounded-md border border-border/40 hover:border-gold/40 hover:bg-gold/5 transition-all cursor-pointer" data-testid={`widget-storyline-${sl.id}`}>
                    {sl.isLegendary && <Star className="w-3 h-3 text-gold flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block">
                        {sl.recruit?.firstName} {sl.recruit?.lastName}
                      </span>
                      <span className="text-[9px] text-muted-foreground">{sl.archetypeName}</span>
                    </div>
                    {hasOpenVote ? (
                      <div className="flex items-center gap-1 text-[9px] text-gold">
                        <Zap className="w-3 h-3" />
                        Vote
                      </div>
                    ) : (
                      <span className="text-[9px] text-muted-foreground">Wk {sl.currentArcStage ?? 0}</span>
                    )}
                  </div>
                </Link>
              );
            })}
            {storylines.length > 3 && (
              <Link href={`/league/${leagueId}/storylines`}>
                <p className="text-[10px] text-muted-foreground text-center hover:text-gold cursor-pointer transition-colors" data-testid="widget-more-storylines">
                  +{storylines.length - 3} more storylines...
                </p>
              </Link>
            )}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ============ ACTIVITY FEED ============

const EVENT_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "SIGNING", label: "Recruiting" },
  { key: "GAME_RESULT,RIVALRY_RESULT", label: "Games" },
  { key: "TRANSFER,DRAFT,ROSTER_CUT,WALKON", label: "Roster" },
  { key: "AWARD,PHASE_CHANGE", label: "League" },
  { key: "STORYLINE,STORYLINE_ABILITY", label: "Storylines" },
] as const;

type FilterKey = (typeof EVENT_FILTERS)[number]["key"];

const eventTypeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  SIGNING: { icon: <Pen className="w-3 h-3" />, color: "text-green-400 bg-green-500/15 border-green-500/30", label: "Signed" },
  GAME_RESULT: { icon: <Trophy className="w-3 h-3" />, color: "text-gold bg-gold/10 border-gold/30", label: "Game" },
  RIVALRY_RESULT: { icon: <Swords className="w-3 h-3" />, color: "text-amber-400 bg-amber-500/15 border-amber-500/30", label: "Rivalry" },
  TRANSFER: { icon: <GitMerge className="w-3 h-3" />, color: "text-blue-400 bg-blue-500/15 border-blue-500/30", label: "Transfer" },
  DRAFT: { icon: <GraduationCap className="w-3 h-3" />, color: "text-purple-400 bg-purple-500/15 border-purple-500/30", label: "Draft" },
  AWARD: { icon: <Award className="w-3 h-3" />, color: "text-amber-400 bg-amber-500/15 border-amber-500/30", label: "Award" },
  PHASE_CHANGE: { icon: <Calendar className="w-3 h-3" />, color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30", label: "Phase" },
  ROSTER_CUT: { icon: <FileX className="w-3 h-3" />, color: "text-red-400 bg-red-500/15 border-red-500/30", label: "Cut" },
  WALKON: { icon: <UserCheck className="w-3 h-3" />, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", label: "Walk-On" },
  STORYLINE: { icon: <Swords className="w-3 h-3" />, color: "text-amber-300 bg-amber-400/15 border-amber-400/30", label: "Storyline" },
  STORYLINE_ABILITY: { icon: <Sparkles className="w-3 h-3" />, color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30", label: "Story Ability" },
};

function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function ActivityFeed({ leagueId }: { leagueId: string }) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("ALL");

  const { data: events = [], isLoading } = useQuery<LeagueEvent[]>({
    queryKey: ["/api/leagues", leagueId, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/events`, { credentials: "include" });
      return res.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const filteredEvents = activeFilter === "ALL"
    ? events
    : events.filter(e => activeFilter.split(",").includes(e.eventType));

  return (
    <RetroCard className="mb-2" data-testid="activity-feed">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gold" />
          <span>Activity Feed</span>
        </div>
      </RetroCardHeader>

      <div className="px-3 pb-2 pt-1 flex items-center gap-1.5 flex-wrap" data-testid="activity-feed-filters">
        <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
        {EVENT_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key as FilterKey)}
            data-testid={`filter-${f.key.toLowerCase()}`}
            className={`px-2 py-0.5 rounded text-[10px] font-pixel border transition-colors ${
              activeFilter === f.key
                ? "bg-gold/20 text-gold border-gold/50"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border/40 max-h-72 overflow-y-auto" data-testid="activity-feed-list">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5 flex items-center gap-3">
              <Skeleton className="w-6 h-6 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/4" />
              </div>
            </div>
          ))
        ) : filteredEvents.length === 0 ? (
          <div className="px-3 py-8 text-center" data-testid="activity-feed-empty">
            <Activity className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No activity yet — events will appear as the dynasty progresses.</p>
          </div>
        ) : (
          filteredEvents.map((event) => {
            let cfg = eventTypeConfig[event.eventType] ?? {
              icon: <Zap className="w-3 h-3" />,
              color: "text-muted-foreground bg-muted border-border",
              label: event.eventType,
            };
            if (event.eventType === "STORYLINE_ABILITY") {
              const desc = (event.description || "").toLowerCase();
              const isLoss = desc.includes("lost") || desc.includes("removed");
              cfg = {
                icon: <Sparkles className="w-3 h-3" />,
                color: isLoss
                  ? "text-red-400 bg-red-500/15 border-red-500/30"
                  : "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
                label: "Story Ability",
              };
            }
            return (
              <div key={event.id} className="px-3 py-2.5 flex items-start gap-3 hover:bg-card/50 transition-colors" data-testid={`event-row-${event.id}`}>
                <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center ${cfg.color}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug">{event.description}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-[9px] font-pixel px-1 py-0.5 rounded border ${cfg.color}`}>{cfg.label}</span>
                    {event.teamAbbreviation && (
                      <TeamBadge abbreviation={event.teamAbbreviation} primaryColor={event.teamPrimaryColor ?? "#2d4a2d"} name={event.teamName || ""} size="sm" className="!w-5 !h-5 !text-[7px]" />
                    )}
                    {event.teamName && (
                      <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">{event.teamName}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">S{event.season} W{event.week}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatRelativeTime(event.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </RetroCard>
  );
}

function StandingsTab({ league }: { league: LeagueDetails }) {
  const { data: rankData } = useQuery<{ rankings: PowerRankingEntry[]; userTeamId: string | null }>({
    queryKey: ["/api/leagues", league.id, "power-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/power-rankings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const leagueRankMap = new Map((rankData?.rankings ?? []).map(r => [r.teamId, r.rank]));

  // Group teams by conference and sort within each conference
  const standingsByConference = league.conferences?.map(conf => {
    const confTeams = (league.teams || [])
      .filter(t => t.conferenceId === conf.id)
      .sort((a, b) => {
        const aWins = a.standings?.wins || 0;
        const bWins = b.standings?.wins || 0;
        if (bWins !== aWins) return bWins - aWins;
        return (a.standings?.losses || 0) - (b.standings?.losses || 0);
      });
    return { ...conf, teams: confTeams };
  }) || [];

  return (
    <div className="space-y-6">
      {standingsByConference.map((conf) => (
        <RetroCard key={conf.id}>
          <RetroCardHeader>{conf.name} Standings</RetroCardHeader>
          <div className="overflow-x-auto -mx-4 px-0 sm:mx-0 sm:px-0">
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-2 w-8 sticky left-0 bg-card z-10">#</th>
                  <th className="text-left py-3 px-2 min-w-[130px] sticky left-8 bg-card z-10">Team</th>
                  <th className="text-left py-3 px-2 hidden lg:table-cell min-w-[150px]">Coach</th>
                  <th className="text-center py-3 px-2 w-10">W</th>
                  <th className="text-center py-3 px-2 w-10">L</th>
                  <th className="text-center py-3 px-2 w-16 hidden sm:table-cell">Conf</th>
                  <th className="text-center py-3 px-2 w-10 hidden md:table-cell">RS</th>
                  <th className="text-center py-3 px-2 w-10 hidden md:table-cell">RA</th>
                </tr>
              </thead>
              <tbody>
                {conf.teams.map((team, index) => (
                  <tr key={team.id} className="border-b border-border/50 hover:bg-card/50">
                    <td className="py-3 px-2 text-muted-foreground sticky left-0 bg-card z-10">{index + 1}</td>
                    <td className="py-3 px-2 sticky left-8 bg-card z-10">
                      <div className="flex items-center gap-2">
                        <TeamBadge
                          abbreviation={team.abbreviation}
                          primaryColor={team.primaryColor}
                          secondaryColor={team.secondaryColor}
                          name={team.name}
                         
                          size="sm"
                        />
                        <Link href={`/league/${league.id}/team/${team.id}/profile`}>
                          <span className="font-medium hover:text-gold cursor-pointer truncate max-w-[90px] sm:max-w-none block" data-testid={`link-team-standings-${team.id}`}>{team.name}</span>
                        </Link>
                        {leagueRankMap.has(team.id) && (
                          <span className="font-pixel text-[8px] text-gold/70 flex-shrink-0" data-testid={`badge-league-rank-${team.id}`}>
                            #{leagueRankMap.get(team.id)}
                          </span>
                        )}
                        {!team.isCpu && (
                          <span
                            className="hidden sm:inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gold/20 border border-gold/40 flex-shrink-0"
                            title="Human-controlled team"
                            data-testid={`badge-human-team-${team.id}`}
                          >
                            <User className="w-2 h-2 text-gold" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 hidden lg:table-cell">
                      {team.coach ? (
                        <Link href={`/league/${league.id}/team/${team.id}/profile`}>
                          <div className="flex items-center gap-2 hover:text-gold cursor-pointer">
                            {team.coach.userId ? (
                              <User className="w-3 h-3 text-gold" />
                            ) : (
                              <Cpu className="w-3 h-3 text-orange-400" />
                            )}
                            <div>
                              <span className="text-foreground hover:text-gold">{team.coach.firstName} {team.coach.lastName}</span>
                              {team.coach.userId ? (
                                team.user && (
                                  <span className="text-xs text-muted-foreground ml-1">({getDisplayName(team.user)})</span>
                                )
                              ) : (
                                <span className="text-xs text-orange-400 ml-1">(CPU)</span>
                              )}
                              {(team.coach as any).archetype && (
                                <div className="text-[10px] text-muted-foreground/60 mt-0.5">{(team.coach as any).archetype}</div>
                              )}
                            </div>
                          </div>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Cpu className="w-3 h-3" />
                          <span>CPU</span>
                        </div>
                      )}
                    </td>
                    <td className="text-center py-3 px-2 font-bold text-green-500">
                      {team.standings?.wins || 0}
                    </td>
                    <td className="text-center py-3 px-2 font-bold text-red-500">
                      {team.standings?.losses || 0}
                    </td>
                    <td className="text-center py-3 px-2 hidden sm:table-cell text-muted-foreground">
                      {team.standings?.conferenceWins || 0}-{team.standings?.conferenceLosses || 0}
                    </td>
                    <td className="text-center py-3 px-2 hidden md:table-cell text-muted-foreground">
                      {team.standings?.runsScored || 0}
                    </td>
                    <td className="text-center py-3 px-2 hidden md:table-cell text-muted-foreground">
                      {team.standings?.runsAllowed || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RetroCard>
      ))}
      {["regular_season", "preseason", "spring_training"].includes(league.currentPhase) && (
        <RetroCard data-testid="postseason-projection">
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Compass className="w-4 h-4 text-gold" />
              <span>Postseason Projection</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <p className="text-xs text-muted-foreground mb-3">Based on current standings, these teams would qualify for the postseason:</p>
            <div className="space-y-3">
              {standingsByConference.map(conf => {
                const topTwo = conf.teams.slice(0, 2);
                return (
                  <div key={conf.id}>
                    <p className="font-pixel text-[9px] text-muted-foreground mb-1">{conf.name}</p>
                    <div className="flex gap-2">
                      {topTwo.map((team, i) => (
                        <div key={team.id} className="flex items-center gap-2 text-xs">
                          <Badge variant={i === 0 ? "default" : "outline"} className={`text-[8px] ${i === 0 ? "bg-gold text-forest-dark" : ""}`}>
                            {i === 0 ? "1 Seed" : "2 Seed"}
                          </Badge>
                          <span>{team.name}</span>
                          <span className="text-muted-foreground">({team.standings?.wins || 0}-{team.standings?.losses || 0})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] text-muted-foreground mt-3">Top 2 teams per conference qualify for Conference Championships. Winners advance to Super Regionals.</p>
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
  );
}

function TeamsTab({ league }: { league: LeagueDetails }) {
  const [compareTeamA, setCompareTeamA] = useState("");
  const [compareTeamB, setCompareTeamB] = useState("");
  const [showCompare, setShowCompare] = useState(false);

  const { data: rankData } = useQuery<{ rankings: PowerRankingEntry[]; userTeamId: string | null }>({
    queryKey: ["/api/leagues", league.id, "power-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/power-rankings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const leagueRankMap = new Map((rankData?.rankings ?? []).map(r => [r.teamId, r.rank]));

  const teamsByConference = league.conferences?.map(conf => ({
    ...conf,
    teams: league.teams?.filter(t => t.conferenceId === conf.id) || [],
  })) || [];

  const allTeams = league.teams || [];

  return (
    <div className="space-y-6">
      <RetroCard>
        <RetroCardHeader className="flex items-center justify-between gap-4">
          <span>Compare Teams</span>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
            <div className="flex-1 sm:flex-none">
              <label className="text-xs text-muted-foreground block mb-1">Team A</label>
              <select
                value={compareTeamA}
                onChange={(e) => setCompareTeamA(e.target.value)}
                className="w-full sm:w-auto bg-muted border border-border rounded px-3 py-2 text-sm"
                data-testid="select-compare-team-a"
              >
                <option value="">Select team...</option>
                {allTeams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <span className="text-muted-foreground text-sm hidden sm:block pb-2">vs</span>
            <div className="flex-1 sm:flex-none">
              <label className="text-xs text-muted-foreground block mb-1">Team B</label>
              <select
                value={compareTeamB}
                onChange={(e) => setCompareTeamB(e.target.value)}
                className="w-full sm:w-auto bg-muted border border-border rounded px-3 py-2 text-sm"
                data-testid="select-compare-team-b"
              >
                <option value="">Select team...</option>
                {allTeams.filter(t => t.id !== compareTeamA).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <RetroButton
              size="sm"
              disabled={!compareTeamA || !compareTeamB}
              onClick={() => setShowCompare(true)}
              className="w-full sm:w-auto"
              data-testid="button-compare-teams"
            >
              Compare
            </RetroButton>
          </div>
        </RetroCardContent>
      </RetroCard>

      <TeamCompareDialog
        leagueId={league.id}
        teamAId={compareTeamA}
        teamBId={compareTeamB}
        open={showCompare}
        onClose={() => setShowCompare(false)}
      />

      {teamsByConference.map((conf) => (
        <RetroCard key={conf.id}>
          <RetroCardHeader>{conf.name}</RetroCardHeader>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {conf.teams.map((team) => (
              <Link key={team.id} href={`/league/${league.id}/team/${team.id}`}>
                <div className="bg-muted/30 p-4 rounded hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`card-team-${team.id}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <TeamBadge
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      secondaryColor={team.secondaryColor}
                      name={team.name}
                     
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-foreground">{team.name}</p>
                        {leagueRankMap.has(team.id) && (
                          <span className="font-pixel text-[8px] text-gold/70" data-testid={`badge-league-rank-card-${team.id}`}>
                            #{leagueRankMap.get(team.id)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{team.mascot}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs mb-2">
                    {team.coach ? (
                      <>
                        <User className="w-3 h-3 text-gold" />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-foreground">{team.coach.firstName} {team.coach.lastName}</span>
                            {team.user && (
                              <span className="text-muted-foreground">({team.user.email.split("@")[0]})</span>
                            )}
                          </div>
                          {(team.coach as any).archetype && (
                            <div className="text-[10px] text-muted-foreground/60">{(team.coach as any).archetype}</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">CPU Controlled</span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Prestige</span>
                    <StarRating rating={Math.ceil(team.prestige / 2)} size="sm" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </RetroCard>
      ))}
    </div>
  );
}

interface PowerRankingEntry {
  rank: number;
  rankDelta: number | null;
  teamId: string;
  teamName: string;
  mascot: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  isCpu: boolean;
  avgOvr: number;
  hitterAvgOvr: number;
  pitcherAvgOvr: number;
  recruitingScore: number;
  hasSignedRecruits: boolean;
  ovrPercentile: number;
  hitterPercentile: number;
  pitcherPercentile: number;
  recruitingPercentile: number;
}

function percentileToGrade(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C+";
  if (pct >= 40) return "C";
  if (pct >= 30) return "D+";
  if (pct >= 20) return "D";
  return "F";
}

function attrToGrade(val: number): string {
  if (val >= 80) return "A+";
  if (val >= 72) return "A";
  if (val >= 65) return "B+";
  if (val >= 58) return "B";
  if (val >= 50) return "C+";
  if (val >= 42) return "C";
  if (val >= 35) return "D+";
  if (val >= 28) return "D";
  return "F";
}

function starToGrade(stars: number): string {
  if (stars >= 4.5) return "A+";
  if (stars >= 4.0) return "A";
  if (stars >= 3.5) return "B+";
  if (stars >= 3.0) return "B";
  if (stars >= 2.5) return "C+";
  if (stars >= 2.0) return "C";
  if (stars >= 1.5) return "D+";
  return "F";
}

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-green-400";
  if (grade.startsWith("B")) return "text-blue-400";
  if (grade.startsWith("C")) return "text-yellow-400";
  if (grade.startsWith("D")) return "text-orange-400";
  return "text-red-400";
}

function percentileLabel(pct: number): string {
  const fromTop = Math.max(1, 100 - pct);
  const fromBot = Math.max(1, pct);
  if (pct >= 50) return `Top ${fromTop}%`;
  return `Bottom ${fromBot}%`;
}

type RankSortKey = "avgOvr" | "hitter" | "pitcher" | "recruiting";

function RankingsTab({ league }: { league: LeagueDetails }) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<RankSortKey>("avgOvr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: rankData, isLoading } = useQuery<{ rankings: PowerRankingEntry[]; userTeamId: string | null }>({
    queryKey: ["/api/leagues", league.id, "power-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/power-rankings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const userTeamId = rankData?.userTeamId ?? null;
  const rawRankings = rankData?.rankings ?? [];
  const rankings = [...rawRankings].sort((a, b) => {
    const val = (e: PowerRankingEntry) => {
      if (sortBy === "avgOvr") return e.avgOvr;
      if (sortBy === "hitter") return e.hitterAvgOvr;
      if (sortBy === "pitcher") return e.pitcherAvgOvr;
      return e.recruitingScore;
    };
    return sortDir === "desc" ? val(b) - val(a) : val(a) - val(b);
  });
  const userEntry = rankings.find(r => r.teamId === userTeamId);

  const handleSort = (key: RankSortKey) => {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };
  const sortArrow = (key: RankSortKey) => sortBy === key ? (sortDir === "desc" ? " ▾" : " ▴") : "";

  const toggleExpand = (teamId: string) => {
    setExpandedTeam(prev => prev === teamId ? null : teamId);
  };

  if (isLoading) {
    return (
      <RetroCard>
        <RetroCardHeader>Power Rankings</RetroCardHeader>
        <div className="space-y-2 mt-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </RetroCard>
    );
  }

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-gold" />
          Power Rankings
        </div>
      </RetroCardHeader>
      <p className="text-[10px] text-muted-foreground mb-4">
        Avg OVR of full roster (150–650 scale). Hitters and Pitchers show position-group avg OVR. Click a rival to compare.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-pixel text-[8px]">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Team</th>
              <th className="text-center py-2 px-1 cursor-pointer hover:text-gold select-none" onClick={() => handleSort("avgOvr")}>Avg OVR{sortArrow("avgOvr")}</th>
              <th className="text-center py-2 px-1 cursor-pointer hover:text-gold select-none" onClick={() => handleSort("hitter")}>Hitters{sortArrow("hitter")}</th>
              <th className="text-center py-2 px-1 cursor-pointer hover:text-gold select-none" onClick={() => handleSort("pitcher")}>Pitchers{sortArrow("pitcher")}</th>
              <th className="text-center py-2 px-1 hidden sm:table-cell cursor-pointer hover:text-gold select-none" onClick={() => handleSort("recruiting")}>Recruiting{sortArrow("recruiting")}</th>
              <th className="py-2 px-1 w-6" />
            </tr>
          </thead>
          <tbody>
            {rankings.map((entry) => {
              const isUser = entry.teamId === userTeamId;
              const isExpanded = expandedTeam === entry.teamId;
              const ovrGrade = percentileToGrade(entry.ovrPercentile);
              const hitGrade = percentileToGrade(entry.hitterPercentile);
              const pitchGrade = percentileToGrade(entry.pitcherPercentile);
              const recruGrade = percentileToGrade(entry.recruitingPercentile);

              return (
                <Fragment key={entry.teamId}>
                  <tr
                    className={`border-b border-border/50 cursor-pointer transition-colors ${isUser ? "bg-gold/10 hover:bg-gold/15" : "hover:bg-card/50"}`}
                    onClick={() => !isUser && toggleExpand(entry.teamId)}
                    data-testid={`row-power-ranking-${entry.teamId}`}
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1">
                        <span className={`font-pixel text-xs ${isUser ? "text-gold" : "text-muted-foreground"}`}>
                          #{entry.rank}
                        </span>
                        {entry.rankDelta != null && entry.rankDelta !== 0 && (
                          <span
                            className={`font-pixel text-[8px] leading-none ${entry.rankDelta > 0 ? "text-green-400" : "text-red-400"}`}
                            title={`${entry.rankDelta > 0 ? "+" : ""}${entry.rankDelta} since last week`}
                            data-testid={`rank-delta-${entry.teamId}`}
                          >
                            {entry.rankDelta > 0 ? "▲" : "▼"}{Math.abs(entry.rankDelta)}
                          </span>
                        )}
                        {entry.rankDelta === 0 && (
                          <span className="font-pixel text-[8px] text-muted-foreground/50" title="No change">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <TeamBadge
                          abbreviation={entry.abbreviation}
                          primaryColor={entry.primaryColor}
                          secondaryColor={entry.secondaryColor}
                          name={entry.teamName}
                         
                          size="sm"
                        />
                        <div>
                          <Link href={`/league/${league.id}/team/${entry.teamId}/profile`}>
                            <span className={`font-medium text-xs hover:text-gold transition-colors cursor-pointer ${isUser ? "text-gold font-semibold" : ""}`} data-testid={`link-profile-powerrank-${entry.teamId}`}>
                              {entry.teamName}
                            </span>
                          </Link>
                          {isUser && (
                            <span className="ml-1.5 text-[9px] font-pixel text-gold/70">YOU</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center cursor-default">
                            <span className={`font-bold text-sm ${gradeColor(ovrGrade)}`}>{ovrGrade}</span>
                            <span className="text-[9px] text-muted-foreground">{entry.avgOvr}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{percentileLabel(entry.ovrPercentile)} overall (avg OVR)</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center cursor-default">
                            <span className={`font-bold text-xs ${gradeColor(hitGrade)}`}>{hitGrade}</span>
                            <span className="text-[9px] text-muted-foreground">{entry.hitterAvgOvr}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{percentileLabel(entry.hitterPercentile)} in Hitters (avg OVR of position players)</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center cursor-default">
                            <span className={`font-bold text-xs ${gradeColor(pitchGrade)}`}>{pitchGrade}</span>
                            <span className="text-[9px] text-muted-foreground">{entry.pitcherAvgOvr}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{percentileLabel(entry.pitcherPercentile)} in Pitchers (avg OVR of pitching staff)</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center hidden sm:table-cell">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center cursor-default">
                            <span className={`font-bold text-xs ${gradeColor(recruGrade)}`}>{entry.hasSignedRecruits ? recruGrade : "—"}</span>
                            <span className="text-[9px] text-muted-foreground">{entry.hasSignedRecruits ? entry.recruitingScore : "—"}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{entry.hasSignedRecruits ? `${percentileLabel(entry.recruitingPercentile)} in Recruiting (avg OVR of signed class)` : "No signed recruits yet"}</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center">
                      {!isUser && (
                        isExpanded
                          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </td>
                  </tr>

                  {isExpanded && userEntry && (
                    <tr className="border-b border-gold/20">
                      <td colSpan={7} className="px-2 py-3 bg-card/40">
                        <PowerComparePanel userEntry={userEntry} rivalEntry={entry} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </RetroCard>
  );
}

function PowerComparePanel({ userEntry, rivalEntry }: { userEntry: PowerRankingEntry; rivalEntry: PowerRankingEntry }) {
  const components = [
    { label: "Avg OVR", userVal: userEntry.avgOvr, rivalVal: rivalEntry.avgOvr },
    { label: "Hitters Avg OVR", userVal: userEntry.hitterAvgOvr, rivalVal: rivalEntry.hitterAvgOvr },
    { label: "Pitchers Avg OVR", userVal: userEntry.pitcherAvgOvr, rivalVal: rivalEntry.pitcherAvgOvr },
    { label: "Recruiting Avg OVR", userVal: userEntry.recruitingScore, rivalVal: rivalEntry.recruitingScore },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TeamBadge abbreviation={userEntry.abbreviation} primaryColor={userEntry.primaryColor} secondaryColor={userEntry.secondaryColor} name={userEntry.teamName} size="sm" />
          <span className="font-pixel text-gold text-[9px]">YOU</span>
        </div>
        <span className="font-pixel text-[9px] text-muted-foreground">HEAD-TO-HEAD</span>
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[9px] text-foreground">{rivalEntry.teamName}</span>
          <TeamBadge abbreviation={rivalEntry.abbreviation} primaryColor={rivalEntry.primaryColor} secondaryColor={rivalEntry.secondaryColor} name={rivalEntry.teamName} size="sm" />
        </div>
      </div>

      {components.map(({ label, userVal, rivalVal }) => {
        const delta = userVal - rivalVal;
        const maxVal = Math.max(userVal, rivalVal, 1);
        const userPct = Math.round((userVal / maxVal) * 100);
        const rivalPct = Math.round((rivalVal / maxVal) * 100);
        const userWins = userVal > rivalVal;
        const rivalWins = rivalVal > userVal;

        return (
          <div key={label} className="space-y-1" data-testid={`compare-row-${label.replace(/\s/g, "-").toLowerCase()}`}>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span className={userWins ? "text-green-400 font-semibold" : ""}>{userVal}</span>
              <span>{label}</span>
              <span className={rivalWins ? "text-green-400 font-semibold" : ""}>{rivalVal}</span>
            </div>
            <div className="flex gap-1 items-center h-2">
              <div className="flex-1 flex justify-end">
                <div
                  className={`h-2 rounded-sm transition-all ${userWins ? "bg-gold" : "bg-muted-foreground/30"}`}
                  style={{ width: `${userPct}%` }}
                />
              </div>
              <div className="w-px h-3 bg-border shrink-0" />
              <div className="flex-1">
                <div
                  className={`h-2 rounded-sm transition-all ${rivalWins ? "bg-blue-400" : "bg-muted-foreground/30"}`}
                  style={{ width: `${rivalPct}%` }}
                />
              </div>
            </div>
            {delta !== 0 && (
              <p className="text-[9px] text-center">
                <span className={delta > 0 ? "text-green-400" : "text-red-400"}>
                  {delta > 0 ? `+${delta}` : delta} advantage for {delta > 0 ? "you" : rivalEntry.teamName}
                </span>
              </p>
            )}
          </div>
        );
      })}

      <div className="pt-2 border-t border-border/50">
        <div className="flex justify-between text-[9px]">
          <span className={userEntry.avgOvr >= rivalEntry.avgOvr ? "text-gold font-semibold" : "text-muted-foreground"}>
            Avg OVR: {userEntry.avgOvr} (#{userEntry.rank})
          </span>
          <span className={rivalEntry.avgOvr >= userEntry.avgOvr ? "text-gold font-semibold" : "text-muted-foreground"}>
            Avg OVR: {rivalEntry.avgOvr} (#{rivalEntry.rank})
          </span>
        </div>
      </div>
    </div>
  );
}

function NewsTab({ leagueId }: { leagueId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [filterJournalist, setFilterJournalist] = useState<string>("all");

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const { data: news, isLoading } = useQuery<DynastyNews[]>({
    queryKey: ["/api/leagues", leagueId, "news"],
  });

  const createNewsMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; category: string; imageUrl?: string | null }) => {
      return await apiRequest("POST", `/api/leagues/${leagueId}/news`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] });
      setShowForm(false);
      setTitle("");
      setContent("");
      setCategory("general");
      setImageUrl(null);
    },
  });

  const categoryLabels: Record<string, string> = {
    general: "General",
    recruiting: "Recruiting",
    game: "Game Result",
    postseason: "Postseason",
    conference: "Conference",
    recap: "Weekly Recap",
    trade: "Trade",
    announcement: "Announcement",
  };

  const categoryColors: Record<string, string> = {
    general: "bg-muted text-muted-foreground",
    recruiting: "bg-blue-500/20 text-blue-400",
    game: "bg-green-500/20 text-green-400",
    postseason: "bg-amber-500/20 text-amber-400",
    conference: "bg-cyan-500/20 text-cyan-400",
    recap: "bg-indigo-500/20 text-indigo-400",
    trade: "bg-purple-500/20 text-purple-400",
    announcement: "bg-yellow-500/20 text-yellow-400",
  };

  const journalistInfo: Record<string, { name: string; avatar: string; title: string }> = {
    addie: { name: "Addie Frisk", avatar: addieFriskImg, title: "Game & Conference Reporter" },
    sully: { name: "Sully Pump", avatar: sullyPumpImg, title: "Recruiting Analyst" },
  };

  const filteredNews = news?.filter(item => {
    if (filterJournalist === "all") return true;
    if (filterJournalist === "user") return !item.journalist;
    return item.journalist === filterJournalist;
  });

  if (isLoading) {
    return (
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-gold" />
            <span>Dynasty News</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 mb-3" />
          ))}
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <RetroCard variant="bordered">
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-gold" />
          <span>Dynasty News</span>
        </div>
        <RetroButton 
          size="sm" 
          onClick={() => setShowForm(!showForm)}
          data-testid="button-create-news"
        >
          <Plus className="w-4 h-4 mr-1" />
          Post
        </RetroButton>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="news-filters">
          <button
            onClick={() => setFilterJournalist("all")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "all" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-all"
          >
            All
          </button>
          <button
            onClick={() => setFilterJournalist("addie")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "addie" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-addie"
          >
            <img src={addieFriskImg} alt="" className="w-4 h-4 rounded-sm" />
            Addie
          </button>
          <button
            onClick={() => setFilterJournalist("sully")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "sully" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-sully"
          >
            <img src={sullyPumpImg} alt="" className="w-4 h-4 rounded-sm" />
            Sully
          </button>
          <button
            onClick={() => setFilterJournalist("user")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "user" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-user"
          >
            Commissioner
          </button>
        </div>

        {showForm && (
          <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-3">
            <RetroInput
              placeholder="News title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-news-title"
            />
            <textarea
              placeholder="Write your news post..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-background border border-border rounded p-2 text-sm min-h-[100px] resize-none focus:outline-none focus:border-gold"
              data-testid="input-news-content"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-background border border-border rounded px-2 py-1 text-sm hover:border-gold transition-colors">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Add Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  data-testid="input-news-image"
                />
              </label>
              {imageUrl && (
                <div className="flex items-center gap-2">
                  <img src={imageUrl} alt="Preview" className="w-10 h-10 object-cover rounded" />
                  <button
                    onClick={() => setImageUrl(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-background border border-border rounded px-2 py-1 text-sm"
                data-testid="select-news-category"
              >
                <option value="general">General</option>
                <option value="recruiting">Recruiting</option>
                <option value="game">Game Result</option>
                <option value="trade">Trade</option>
                <option value="announcement">Announcement</option>
              </select>
              <div className="flex-1" />
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setShowForm(false)}
                data-testid="button-cancel-news"
              >
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                onClick={() => createNewsMutation.mutate({ title, content, category, imageUrl })}
                disabled={!title.trim() || !content.trim() || createNewsMutation.isPending}
                data-testid="button-submit-news"
              >
                {createNewsMutation.isPending ? "Posting..." : "Post"}
              </RetroButton>
            </div>
          </div>
        )}

        {(!filteredNews || filteredNews.length === 0) ? (
          <div className="text-center py-8 text-muted-foreground">
            <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{filterJournalist !== "all" ? "No stories from this reporter yet." : "No news yet. Be the first to post!"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNews.map((item) => {
              const journalist = item.journalist ? journalistInfo[item.journalist] : null;
              return (
                <div 
                  key={item.id} 
                  className="bg-muted/30 rounded-lg p-4 border border-border/50"
                  data-testid={`card-news-${item.id}`}
                >
                  <div className="flex items-start gap-3 mb-2">
                    {journalist ? (
                      <img 
                        src={journalist.avatar} 
                        alt={journalist.name}
                        className="w-10 h-10 rounded-md flex-shrink-0 border border-gold/30"
                        style={{ imageRendering: "pixelated" }}
                        data-testid={`avatar-journalist-${item.journalist}`}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md flex-shrink-0 bg-muted border border-border flex items-center justify-center">
                        <Newspaper className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.isSticky && (
                          <Pin className="w-3 h-3 text-gold flex-shrink-0" />
                        )}
                        <h4 className="font-medium text-gold text-sm leading-tight">{item.title}</h4>
                        <Badge className={`text-[9px] no-default-hover-elevate no-default-active-elevate ${categoryColors[item.category] || "bg-muted"}`}>
                          {categoryLabels[item.category] || item.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {journalist ? (
                          <>
                            <span className="text-foreground/80">{journalist.name}</span>
                            <span className="mx-1 opacity-50">|</span>
                            <span className="italic">{journalist.title}</span>
                          </>
                        ) : (
                          <span>{item.authorName}</span>
                        )}
                        {item.season && (
                          <>
                            <span className="mx-1 opacity-50">|</span>
                            Season {item.season}{item.week ? `, Week ${item.week}` : ""}
                          </>
                        )}
                        {!item.season && (
                          <>
                            <span className="mx-1 opacity-50">|</span>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  {item.imageUrl && (
                    <div className="my-3 pl-[52px]">
                      <img 
                        src={item.imageUrl} 
                        alt={item.title}
                        className="max-w-full max-h-64 rounded-lg object-cover"
                      />
                    </div>
                  )}
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap pl-[52px] leading-relaxed">{item.content}</p>
                </div>
              );
            })}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function LeagueViewSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-2 w-full mt-3 rounded-full" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="p-3 rounded-md border border-border/50 bg-card/30 text-center">
              <Skeleton className="h-6 w-6 mx-auto mb-2 rounded" />
              <Skeleton className="h-3 w-14 mx-auto mb-1" />
              <Skeleton className="h-2 w-18 mx-auto" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3 rounded-md border border-border/50 bg-card/30 text-center">
              <Skeleton className="h-3 w-16 mx-auto mb-2" />
              <Skeleton className="h-7 w-12 mx-auto mb-1" />
              <Skeleton className="h-2 w-20 mx-auto" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full mb-4 rounded" />
        <Skeleton className="h-64 w-full rounded" />
      </main>
    </div>
  );
}

interface ReadyStatusData {
  readyStatus: Array<{
    teamId: string;
    teamName: string;
    abbreviation: string;
    isHumanControlled: boolean;
    userId: string | null;
    coachName?: string;
    isReady: boolean;
    isAutoPilot?: boolean;
    departuresFinalized?: boolean;
    walkonReady?: boolean;
    scoutActionsUsed?: number;
    recruitActionsUsed?: number;
    hasReportedScores?: boolean;
  }>;
  notReadyTeams?: Array<{ teamId: string; teamName: string; abbreviation: string }>;
  allHumansReady: boolean;
  humanCount: number;
  readyCount: number;
  currentPhase: string;
  showReadyNamesToAll?: boolean;
  currentUserId?: string;
}


function getEffectiveReady(
  entry: ReadyStatusData["readyStatus"][0],
  phase: string
): boolean {
  if (phase === "offseason_departures") return !!entry.departuresFinalized;
  if (phase === "offseason_walkons") return !!entry.walkonReady;
  return !!entry.isReady;
}

const STORYLINE_VOTE_CALLOUT_PHASES = new Set([
  "recruiting", "preseason", "spring_training", "regular_season",
]);

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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-in fade-in duration-500"
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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-red-900/30 text-red-300 border border-red-700/50 animate-in fade-in duration-500"
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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-green-900/30 text-green-300 border border-green-700/50 animate-in fade-in duration-500"
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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-red-900/30 text-red-400 border border-red-700/50 animate-in fade-in duration-500"
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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-violet-900/30 text-violet-300 border border-violet-700/50 animate-in fade-in duration-500"
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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-purple-600/30 text-purple-300 border border-purple-600/50 animate-in fade-in duration-500"
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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-600/30 text-cyan-300 border border-cyan-600/50 animate-in fade-in duration-500"
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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-blue-900/30 text-blue-300 border border-blue-700/50 animate-in fade-in duration-500"
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
          <DialogTitle className="font-pixel text-gold text-[10px] flex items-center gap-2">
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
            <div className="text-center text-[10px] text-muted-foreground font-pixel">
              {currentIdx + 1} / {recruits.length} UNDECIDED
            </div>
            <div className="text-center space-y-1">
              <StarRating rating={current.starRating} />
              <p className="font-pixel text-white text-sm mt-1">{current.firstName} {current.lastName}</p>
              <p className="text-xs text-muted-foreground">{current.position} · {current.homeState}</p>
            </div>

            {animPhase === "deciding" && (
              <div className="bg-card border border-border rounded p-4 text-center space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Deciding between...</p>
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
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">commits to</p>
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

function WaitingOnWidget({
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
    onSuccess: () => {
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
            <span className={`font-pixel text-[9px] ${allReady ? "text-green-400" : "text-gold"}`}>
              {allReady ? "ALL READY" : "WAITING ON"}
            </span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              ({readyCount}/{humanCount} ready)
            </span>
            {/* Mobile single-line: just count */}
            <span className="text-[10px] text-muted-foreground sm:hidden">
              {readyCount}/{humanCount}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {myStatus && !myEffectiveReady && !isPageActionPhase && (
              <RetroButton
                size="sm"
                variant="primary"
                onClick={() => toggleReady.mutate()}
                disabled={toggleReady.isPending}
                data-testid="button-mark-ready-widget"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">Mark </span>Ready
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
            {myStatus && myEffectiveReady && !isCommissioner && (
              <span className="flex items-center gap-1 text-[10px] text-green-400" data-testid="badge-you-are-ready">
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
          <p className="text-[10px] text-muted-foreground">No human coaches in this league.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1" data-testid="waiting-on-team-list">
            {humanTeams.map((entry) => {
              const ready = getEffectiveReady(entry, phase);
              const isMe = entry.userId === user?.id;
              return (
                <div
                  key={entry.teamId}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[10px] border transition-colors ${
                    ready
                      ? "bg-green-500/10 border-green-500/30 text-green-300"
                      : "bg-card border-border text-muted-foreground"
                  } ${isMe ? "ring-1 ring-gold/60" : ""}`}
                  data-testid={`team-ready-status-${entry.teamId}`}
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
                </div>
              );
            })}
          </div>
        )}

        {/* Privacy note for coaches when names are hidden */}
        {!isCommissioner && !readyData?.showReadyNamesToAll && humanCount > 1 && !allReady && (
          <p className="mt-2 text-[10px] text-muted-foreground" data-testid="text-ready-names-hidden">
            Showing your status only — commissioner can enable full team visibility in settings
          </p>
        )}

        {/* All-ready message for non-commissioner coaches */}
        {allReady && !isCommissioner && (
          <p className="mt-2 text-[10px] text-green-400" data-testid="text-all-ready">
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
              <div className="flex items-center gap-2 text-[10px] text-gold hover:text-gold/80 transition-colors cursor-pointer" data-testid="signing-day-reveal-callout">
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
              <div className="flex items-center gap-2 text-[10px] text-gold hover:text-gold/80 transition-colors cursor-pointer" data-testid="storyline-votes-callout">
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

function PhaseGuidanceBanner({ phase, leagueId }: { phase: string; leagueId: string }) {
  const getGuidance = (): { text: string; action?: { label: string; href: string } } | null => {
    switch (phase) {
      case "preseason":
      case "spring_training":
        return { text: "Spring training is underway. Head to the Commissioner page to advance to the regular season.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "regular_season":
        return { text: "The regular season is in progress. Advance weeks from the Commissioner page or sim ahead.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "conference_championship":
      case "super_regionals":
        return { text: "Postseason is underway. Advance from the Commissioner page to continue the bracket.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "cws":
        return { text: "The College World Series is here. Sim the championship from the Commissioner page.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "offseason_departures":
        return { text: "Review your departing players and make retention offers before the commissioner advances.", action: { label: "Departures", href: `/league/${leagueId}/departures` } };
      case "offseason_recruiting_1":
      case "offseason_recruiting_2":
      case "offseason_recruiting_3":
      case "offseason_recruiting_4":
        return { text: "Recruiting is open. Scout, contact, and offer scholarships to build your next class.", action: { label: "Recruiting", href: `/league/${leagueId}/recruiting` } };
      case "offseason_signing_day":
        return { text: "Decision Day is here. See where the final few recruits go by readying up.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "offseason_walkons":
        return { text: "Time to finalize your roster. Cut players to get to 25 and sign walk-ons to fill gaps.", action: { label: "Walk-Ons", href: `/league/${leagueId}/walkons` } };
      default:
        return null;
    }
  };

  const guidance = getGuidance();
  if (!guidance) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-md bg-gold/5 border border-gold/20 px-4 py-2" data-testid="phase-guidance-banner">
      <ChevronRight className="w-4 h-4 text-gold shrink-0" />
      <span className="text-xs text-muted-foreground flex-1">{guidance.text}</span>
      {guidance.action && (
        <Link href={guidance.action.href}>
          <RetroButton variant="outline" size="sm" data-testid="button-phase-guidance-action">
            {guidance.action.label}
          </RetroButton>
        </Link>
      )}
    </div>
  );
}

function SeasonProgressBar({ phase }: { phase: string }) {
  const phases = [
    { key: "spring", label: "SPR" },
    { key: "regular_season", label: "REG" },
    { key: "conference_championship", label: "CONF" },
    { key: "super_regionals", label: "SUPR" },
    { key: "cws", label: "CWS" },
    { key: "offseason", label: "OFF" },
  ];

  const offseasonPhases = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", 
    "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
  
  const springPhases = ["preseason", "spring_training"];
  
  const currentPhaseNormalized = offseasonPhases.includes(phase) ? "offseason" 
    : springPhases.includes(phase) ? "spring" 
    : phase;
  const currentIndex = phases.findIndex(p => p.key === currentPhaseNormalized);

  return (
    <div className="mt-4" data-testid="season-progress-bar">
      <div className="flex items-center gap-1 sm:gap-2">
        {phases.map((p, i) => (
          <div
            key={p.key}
            className={`flex-1 flex flex-col items-center gap-1 min-w-0 ${
              i < currentIndex ? "opacity-50" : i === currentIndex ? "" : "opacity-30"
            }`}
          >
            <div
              className={`w-full h-2 rounded-full ${
                i < currentIndex
                  ? "bg-green-500"
                  : i === currentIndex
                    ? "bg-gold"
                    : "bg-muted"
              }`}
            />
            <span className={`text-[7px] sm:text-[8px] font-pixel text-center ${i === currentIndex ? "text-gold" : "text-muted-foreground"}`}>
              {p.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PostseasonGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  phase: string;
  homeTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
  homeSeed?: number;
  awaySeed?: number;
  bracketSide?: string;
  bracketRound?: number;
  bracketType?: string;
}

interface SeedEntry {
  seed: number;
  teamId: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  wins: number;
  losses: number;
  isConfChamp: boolean;
  conferenceName: string;
}

interface ConfStandingsRow {
  teamId: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  confWins: number;
  confLosses: number;
  wins: number;
  losses: number;
}

interface ConfStandings {
  id: string;
  name: string;
  teams: ConfStandingsRow[];
}

interface PostseasonData {
  phase: string;
  season: number;
  conferenceChampionships: PostseasonGame[];
  superRegionals: PostseasonGame[];
  cws: PostseasonGame[];
  seeds?: SeedEntry[];
  confStandings?: ConfStandings[];
}

function RecordBookSummaryTab({ leagueId, currentSeason }: { leagueId: string; currentSeason: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/leagues", leagueId, "record-book"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/record-book`, { credentials: "include" }).then(r => r.json()),
    enabled: !!leagueId,
  });

  const latestSeason = data?.seasons?.[0];
  const hallOfFameCount = data?.hallOfFame?.length ?? 0;
  const totalSeasons = data?.meta?.totalSeasons ?? 0;

  return (
    <div className="space-y-4" data-testid="record-book-summary-tab">
      <div className="flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-gold" />
        <span className="font-pixel text-gold text-xs">Dynasty Record Book</span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20 bg-card" />
          <Skeleton className="h-20 bg-card" />
        </div>
      )}

      {!isLoading && totalSeasons === 0 && (
        <RetroCard variant="bordered">
          <RetroCardContent className="py-8 text-center">
            <BookOpen className="w-8 h-8 text-gold/40 mx-auto mb-3" />
            <p className="font-pixel text-gold text-xs mb-2">No History Yet</p>
            <p className="text-sm text-muted-foreground">Complete your first season to start building the dynasty almanac.</p>
          </RetroCardContent>
        </RetroCard>
      )}

      {!isLoading && totalSeasons > 0 && (
        <>
          {/* Latest season summary */}
          {latestSeason && (
            <RetroCard variant="bordered">
              <RetroCardHeader>
                <span className="font-pixel text-xs text-gold">Season {latestSeason.season} Champion</span>
              </RetroCardHeader>
              <RetroCardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center p-2 bg-background/50 rounded border border-border/50">
                    <p className="font-pixel text-[7px] text-muted-foreground mb-1">CHAMPION</p>
                    <p className="text-xs font-bold text-gold">{latestSeason.championName ?? "—"}</p>
                    {latestSeason.championName && (
                      <p className="text-[9px] text-muted-foreground">{latestSeason.championW}-{latestSeason.championL}</p>
                    )}
                  </div>
                  <div className="text-center p-2 bg-background/50 rounded border border-border/50">
                    <p className="font-pixel text-[7px] text-muted-foreground mb-1">HR LEADER</p>
                    <p className="text-xs font-medium truncate">{latestSeason.hrLeader?.name ?? "—"}</p>
                    {latestSeason.hrLeader && <p className="text-[9px] text-gold">{latestSeason.hrLeader.value} HR</p>}
                  </div>
                  <div className="text-center p-2 bg-background/50 rounded border border-border/50">
                    <p className="font-pixel text-[7px] text-muted-foreground mb-1">AVG LEADER</p>
                    <p className="text-xs font-medium truncate">{latestSeason.avgLeader?.name ?? "—"}</p>
                    {latestSeason.avgLeader && <p className="text-[9px] text-gold">{latestSeason.avgLeader.value}</p>}
                  </div>
                  <div className="text-center p-2 bg-background/50 rounded border border-border/50">
                    <p className="font-pixel text-[7px] text-muted-foreground mb-1">ERA LEADER</p>
                    <p className="text-xs font-medium truncate">{latestSeason.eraLeader?.name ?? "—"}</p>
                    {latestSeason.eraLeader && <p className="text-[9px] text-gold">{latestSeason.eraLeader.value} ERA</p>}
                  </div>
                </div>
              </RetroCardContent>
            </RetroCard>
          )}

          {/* Dynasty stats row */}
          <div className="grid grid-cols-3 gap-3">
            <RetroCard variant="bordered">
              <RetroCardContent className="py-3 text-center">
                <p className="font-pixel text-[7px] text-muted-foreground mb-1">SEASONS</p>
                <p className="text-2xl font-bold text-gold">{totalSeasons}</p>
              </RetroCardContent>
            </RetroCard>
            <RetroCard variant="bordered">
              <RetroCardContent className="py-3 text-center">
                <p className="font-pixel text-[7px] text-muted-foreground mb-1">HALL OF FAME</p>
                <p className="text-2xl font-bold text-gold">{hallOfFameCount}</p>
              </RetroCardContent>
            </RetroCard>
            <RetroCard variant="bordered">
              <RetroCardContent className="py-3 text-center">
                <p className="font-pixel text-[7px] text-muted-foreground mb-1">CAREER BATTERS</p>
                <p className="text-2xl font-bold text-gold">{data?.careerBattingLeaders?.length ?? 0}</p>
              </RetroCardContent>
            </RetroCard>
          </div>
        </>
      )}

      <Link href={`/league/${leagueId}/record-book`}>
        <RetroButton variant="primary" className="w-full gap-2" data-testid="button-full-record-book">
          <BookOpen className="w-4 h-4" />
          Full Record Book
          <ChevronRight className="w-3.5 h-3.5 ml-auto" />
        </RetroButton>
      </Link>
    </div>
  );
}

function DynastyTrendsCard({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<{
    teamName: string;
    teamAbbreviation: string;
    prestige: number;
    facilities: number;
    seasons: { season: number; wins: number; losses: number; runsScored: number; runsAllowed: number; avgOverall: number; rosterSize: number }[];
  }>({
    queryKey: ["/api/leagues", leagueId, "dynasty-trends"],
  });

  if (isLoading) return <Skeleton className="h-48" />;
  if (!data || data.seasons.length <= 0) return null;

  const maxWins = Math.max(...data.seasons.map(s => s.wins), 1);

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-2 w-full">
          <BarChart className="w-4 h-4 text-gold" />
          <span>{data.teamName} Season Trends</span>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Win-Loss by Season</p>
            <div className="flex items-end gap-2 h-24">
              {data.seasons.map((s) => {
                const winPct = maxWins > 0 ? (s.wins / maxWins) * 100 : 0;
                return (
                  <Tooltip key={s.season}>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center flex-1 gap-1" data-testid={`trend-season-${s.season}`}>
                        <div className="w-full flex flex-col items-center justify-end h-20">
                          <div
                            className="w-full rounded-t bg-gold/70"
                            style={{ height: `${Math.max(winPct, 5)}%` }}
                          />
                        </div>
                        <span className="text-[8px] text-muted-foreground">S{s.season}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-card border-border">
                      <p className="text-xs font-medium">Season {s.season}</p>
                      <p className="text-xs">Record: {s.wins}-{s.losses}</p>
                      <p className="text-xs">RS: {s.runsScored} | RA: {s.runsAllowed}</p>
                      <p className="text-xs">Avg OVR: {s.avgOverall}</p>
                      <p className="text-xs">Roster: {s.rosterSize}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.seasons.map(s => (
              <div key={s.season} className="text-center">
                <p className="font-pixel text-[8px] text-gold">S{s.season}</p>
                <p className="text-sm font-mono">{s.wins}-{s.losses}</p>
                <p className="text-[10px] text-muted-foreground">OVR: {s.avgOverall}</p>
              </div>
            ))}
          </div>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

interface ProspectEntry {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  eligibility: string;
  overall: number;
  starRating: number;
  batHand: string;
  throwHand: string;
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  teamPrimaryColor: string;
  teamSecondaryColor: string;
  category: "hitter" | "pitcher";
}

type ProspectsView = "combined" | "hitters" | "pitchers";

function ProspectsTab({ leagueId, currentSeason }: { leagueId: string; currentSeason: number }) {
  const [view, setView] = useState<ProspectsView>("combined");
  const [positionFilter, setPositionFilter] = useState<string>("All");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ hitters: ProspectEntry[]; pitchers: ProspectEntry[]; currentSeason: number }>({
    queryKey: ["/api/leagues", leagueId, "top-prospects"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/top-prospects`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch prospects");
      return res.json();
    },
  });

  const { data: selectedPlayer } = useQuery<Player>({
    queryKey: ["/api/leagues", leagueId, "players", selectedPlayerId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/players/${selectedPlayerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!selectedPlayerId,
  });

  // Season the player graduates (SR = now, JR = +1, SO = +2, FR = +3)
  const gradSeason = (eligibility: string) => {
    if (eligibility === "SR") return currentSeason;
    if (eligibility === "JR") return currentSeason + 1;
    if (eligibility === "SO") return currentSeason + 2;
    return currentSeason + 3; // FR
  };

  const baseList: ProspectEntry[] = (() => {
    if (!data) return [];
    if (view === "hitters") return data.hitters;
    if (view === "pitchers") return data.pitchers;
    return [...data.hitters, ...data.pitchers].sort((a, b) => b.overall - a.overall).slice(0, 100);
  })();

  const allPositions = ["All", ...Array.from(new Set(baseList.map(p => p.position))).sort()];

  const displayList: (ProspectEntry & { rank: number })[] = (() => {
    const filtered = positionFilter === "All" ? baseList : baseList.filter(p => p.position === positionFilter);
    return filtered.map((p, i) => ({ ...p, rank: i + 1 }));
  })();

  const eligibilityColor: Record<string, string> = {
    FR: "text-green-400",
    SO: "text-blue-400",
    JR: "text-amber-400",
    SR: "text-red-400",
  };

  const ovrColor = (ovr: number) => {
    if (ovr >= 500) return "text-gold font-bold";
    if (ovr >= 400) return "text-amber-400 font-semibold";
    if (ovr >= 300) return "text-foreground";
    return "text-muted-foreground";
  };

  // Find the team color for the selected player's card header
  const selectedProspectEntry = selectedPlayerId ? baseList.find(p => p.id === selectedPlayerId) : null;

  if (isLoading) {
    return (
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-gold" />
            Top MLB Prospects
          </div>
        </RetroCardHeader>
        <div className="space-y-2 mt-4">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </RetroCard>
    );
  }

  return (
    <>
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-gold" />
            Top MLB Prospects
          </div>
        </RetroCardHeader>
        <p className="text-[10px] text-muted-foreground mb-4">
          Players ranked by overall rating. Click a name to view their full profile. Pitchers: SP, RP, CL. Hitters: all other positions.
        </p>

        {/* View toggle */}
        <div className="flex gap-2 mb-3" data-testid="prospects-toggle">
          {(["combined", "hitters", "pitchers"] as ProspectsView[]).map(v => (
            <button
              key={v}
              onClick={() => { setView(v); setPositionFilter("All"); }}
              data-testid={`button-prospects-${v}`}
              className={`font-pixel text-[8px] px-3 py-1.5 border rounded transition-colors ${
                view === v
                  ? "bg-gold text-forest-dark border-gold"
                  : "bg-transparent text-muted-foreground border-border hover:border-gold/50 hover:text-gold"
              }`}
            >
              {v === "combined" ? "Top 100" : v === "hitters" ? "Hitters" : "Pitchers"}
            </button>
          ))}
        </div>

        {/* Position filter */}
        {allPositions.length > 2 && (
          <div className="flex flex-wrap gap-1.5 mb-4" data-testid="prospects-position-filter">
            {allPositions.map(pos => (
              <button
                key={pos}
                onClick={() => setPositionFilter(pos)}
                data-testid={`button-pos-filter-${pos}`}
                className={`font-pixel text-[7px] px-2 py-1 border rounded transition-colors ${
                  positionFilter === pos
                    ? "bg-gold/20 text-gold border-gold/60"
                    : "bg-transparent text-muted-foreground border-border/60 hover:border-gold/40 hover:text-gold/80"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        )}

        {displayList.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No players match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-pixel text-[8px]">
                  <th className="text-left py-2 px-2 w-10">#</th>
                  <th className="text-left py-2 px-2">Player</th>
                  <th className="text-center py-2 px-1 w-10">Pos</th>
                  <th className="text-left py-2 px-2 hidden sm:table-cell">Team</th>
                  <th className="text-center py-2 px-1 w-14">Class</th>
                  <th className="text-center py-2 px-1 hidden sm:table-cell">Stars</th>
                  <th className="text-center py-2 px-1 w-14">OVR</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map(prospect => (
                  <tr
                    key={`${prospect.rank}-${prospect.id}`}
                    className="border-b border-border/50 hover:bg-card/50 transition-colors"
                    data-testid={`row-prospect-${prospect.id}`}
                  >
                    <td className="py-2.5 px-2">
                      <span className={`font-pixel text-[9px] ${prospect.rank <= 10 ? "text-gold" : "text-muted-foreground"}`}>
                        #{prospect.rank}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedPlayerId(prospect.id)}
                          className="font-medium text-xs hover:text-gold transition-colors text-left"
                          data-testid={`button-prospect-name-${prospect.id}`}
                        >
                          {prospect.firstName} {prospect.lastName}
                        </button>
                        {prospect.category === "pitcher" ? (
                          <span
                            className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${
                              prospect.throwHand === "L"
                                ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                                : "bg-muted/40 text-muted-foreground border-border/60"
                            }`}
                            data-testid={`badge-hand-${prospect.id}`}
                          >
                            {prospect.throwHand}HP
                          </span>
                        ) : (
                          <span
                            className={`font-pixel text-[7px] px-1 py-0.5 rounded border ${
                              prospect.batHand === "L"
                                ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                                : prospect.batHand === "S"
                                ? "bg-purple-500/15 text-purple-400 border-purple-500/40"
                                : "bg-muted/40 text-muted-foreground border-border/60"
                            }`}
                            data-testid={`badge-hand-${prospect.id}`}
                          >
                            {prospect.batHand}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <span className="text-[10px] text-muted-foreground">{prospect.position}</span>
                    </td>
                    <td className="py-2.5 px-2 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <TeamBadge
                          abbreviation={prospect.teamAbbreviation}
                          primaryColor={prospect.teamPrimaryColor}
                          secondaryColor={prospect.teamSecondaryColor}
                          name={prospect.teamName}
                          size="sm"
                        />
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                          {prospect.teamName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">
                            <span className={`font-pixel text-[8px] block ${eligibilityColor[prospect.eligibility] ?? "text-muted-foreground"}`}>
                              {prospect.eligibility}
                            </span>
                            <span className="font-pixel text-[7px] text-muted-foreground/60 block">
                              S{gradSeason(prospect.eligibility)}
                            </span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {prospect.eligibility === "SR"
                            ? "Graduating this season"
                            : `Graduates Season ${gradSeason(prospect.eligibility)}`}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-2.5 px-1 text-center hidden sm:table-cell">
                      <StarRating rating={prospect.starRating} size="sm" />
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <span className={`text-xs ${ovrColor(prospect.overall)}`}>
                        {prospect.overall}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RetroCard>

      {/* Player profile modal — opens when a name is clicked */}
      {selectedPlayer && (
        <PlayerProfileCard
          player={selectedPlayer}
          open={!!selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          leagueId={leagueId}
          teamPrimaryColor={selectedProspectEntry?.teamPrimaryColor}
        />
      )}
    </>
  );
}

function DynastyHistoryTab({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<{
    seasons: {
      season: number;
      cwsChampion: { name: string; abbreviation: string; primaryColor: string } | null;
      cwsRunnerUp: { name: string; abbreviation: string; primaryColor: string } | null;
      conferenceChampions: { name: string; abbreviation: string }[];
      teamRecords: { name: string; abbreviation: string; teamId: string; wins: number; losses: number; conferenceWins: number; conferenceLosses: number; classRank: number | null }[];
      hasCWSData: boolean;
      topClassRankings: { classRank: number; teamId: string; teamAbbr: string; teamName: string; totalCommits: number; fiveStars: number }[];
      recruiterOfYear: { coachName: string; teamName: string; teamAbbr: string; recruitingScore: number; recruitingGrade: string } | null;
    }[];
    currentSeason: number;
  }>({
    queryKey: ["/api/leagues", leagueId, "dynasty-history"],
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!data || data.seasons.length === 0) {
    return (
      <RetroCard>
        <RetroCardContent>
          <div className="text-center py-12 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-pixel text-xs text-gold mb-2">No History Yet</p>
            <p className="text-sm">Complete your first season to start building your dynasty history.</p>
          </div>
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <div className="space-y-4">
      <DynastyTrendsCard leagueId={leagueId} />

      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2 w-full">
            <History className="w-4 h-4 text-gold" />
            <span>Dynasty Timeline</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-4">
            {data.seasons.map(season => (
              <div key={season.season} className="border-b border-border/50 pb-4 last:border-0" data-testid={`history-season-${season.season}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-pixel text-gold text-[10px]">SEASON {season.season}</p>
                  {season.season === data.currentSeason && (
                    <Badge variant="outline" className="text-[8px]">Current</Badge>
                  )}
                </div>
                {season.cwsChampion && (
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-4 h-4 text-gold" />
                    <span className="text-sm font-medium">{season.cwsChampion.name}</span>
                    <span className="text-xs text-muted-foreground">CWS Champion</span>
                    {season.cwsRunnerUp && (
                      <span className="text-xs text-muted-foreground">over {season.cwsRunnerUp.name}</span>
                    )}
                  </div>
                )}
                {!season.cwsChampion && season.hasCWSData && (
                  <p className="text-xs text-muted-foreground mb-2">CWS in progress...</p>
                )}
                {season.conferenceChampions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {season.conferenceChampions.map((champ, i) => (
                      <Badge key={i} variant="outline" className="text-[8px]">{champ.abbreviation} Conf Champ</Badge>
                    ))}
                  </div>
                )}
                {season.teamRecords.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs">
                    {season.teamRecords.slice(0, 8).map(team => (
                      <div key={team.teamId} className="flex items-center justify-between px-2 py-0.5">
                        <span className="text-muted-foreground">{team.abbreviation}</span>
                        <div className="flex items-center gap-1">
                          <span>{team.wins || 0}-{team.losses || 0}</span>
                          {team.classRank && team.classRank <= 3 && (
                            <Badge variant="outline" className="text-[7px] px-1 py-0 h-3 border-gold/50 text-gold">#{team.classRank} class</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {season.topClassRankings && season.topClassRankings.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <p className="font-pixel text-[8px] text-muted-foreground mb-1">TOP RECRUITING CLASSES</p>
                    <div className="flex flex-wrap gap-1">
                      {season.topClassRankings.map(cls => (
                        <div key={cls.teamId} className="flex items-center gap-1 text-[10px]">
                          <span className={`font-pixel text-[8px] ${cls.classRank === 1 ? "text-gold" : "text-muted-foreground"}`}>#{cls.classRank}</span>
                          <span className="text-foreground">{cls.teamAbbr}</span>
                          <span className="text-muted-foreground">({cls.totalCommits} commits{cls.fiveStars > 0 ? `, ${cls.fiveStars}x5★` : ""})</span>
                          {cls.classRank < season.topClassRankings.length && <span className="text-border">·</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {season.recruiterOfYear && (
                  <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2">
                    <Star className="w-3 h-3 text-gold flex-shrink-0" />
                    <span className="font-pixel text-[8px] text-gold">RECRUITER OF THE YEAR</span>
                    <span className="text-[10px] font-medium">{season.recruiterOfYear.coachName}</span>
                    <Badge variant="outline" className="text-[7px]">{season.recruiterOfYear.teamAbbr}</Badge>
                    <span className={`font-pixel text-[9px] font-bold ml-auto ${
                      season.recruiterOfYear.recruitingGrade.startsWith("A") ? "text-gold" :
                      season.recruiterOfYear.recruitingGrade.startsWith("B") ? "text-green-400" : "text-yellow-400"
                    }`}>{season.recruiterOfYear.recruitingGrade}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </RetroCardContent>
      </RetroCard>

      <AllTimeRecruitingLeaderboard leagueId={leagueId} />
    </div>
  );
}

type AwardPlayer = {
  playerName: string;
  position: string;
  overall: number;
  eligibility: string;
  teamName: string;
  abbreviation: string;
  primaryColor: string;
  avg?: string | null;
  hr?: number | null;
  rbi?: number | null;
  era?: string | null;
  strikeouts?: number | null;
} | null;

interface SeasonAwardsData {
  season: number;
  awardsAvailable: boolean;
  currentPhase?: string;
  leagueAwards?: {
    mvp: AwardPlayer;
    pitcherOfYear: AwardPlayer;
    freshmanOfYear: AwardPlayer;
  };
  conferenceChampionshipMVPs?: { conferenceName: string; mvp: AwardPlayer }[];
  cwsMVP?: AwardPlayer;
  allAmericanTeam?: { position: string; player: AwardPlayer }[];
  allFreshmanTeam?: { position: string; player: AwardPlayer }[];
  conferenceAwards?: {
    conferenceName: string;
    mvp: AwardPlayer;
    pitcherOfYear: AwardPlayer;
    allConferenceTeam: { position: string; player: AwardPlayer }[];
  }[];
  statsLeaders?: {
    topHitters: AwardPlayer[];
    topPitchers: AwardPlayer[];
  };
}

function AwardsTab({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<SeasonAwardsData>({
    queryKey: ["/api/leagues", leagueId, "season-awards"],
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!data) return null;

  if (!data.awardsAvailable) {
    const phaseLabels: Record<string, string> = {
      preseason: "Spring",
      spring_training: "Spring",
      regular_season: "Regular Season",
      dynasty_setup: "Dynasty Setup",
    };
    return (
      <RetroCard>
        <RetroCardContent>
          <div className="flex flex-col items-center justify-center py-12 gap-3" data-testid="awards-not-available">
            <Award className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-pixel text-sm text-muted-foreground">Awards Not Yet Available</p>
            <p className="text-xs text-muted-foreground/70 text-center max-w-md">
              Awards will be revealed after the regular season is complete.
              Current phase: {phaseLabels[data.currentPhase || ""] || data.currentPhase}
            </p>
          </div>
        </RetroCardContent>
      </RetroCard>
    );
  }

  const AwardCard = ({ title, player, icon }: { title: string; player: AwardPlayer; icon: React.ReactNode }) => {
    if (!player) return null;
    return (
      <RetroCard data-testid={`award-${title.toLowerCase().replace(/\s/g, "-")}`}>
        <div className="flex items-center gap-3">
          <div className="text-gold">{icon}</div>
          <div className="flex-1">
            <p className="text-[9px] text-muted-foreground font-pixel">{title}</p>
            <p className="font-medium text-sm">{player.playerName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span>{player.position}</span>
              <span className="text-gold font-bold">{player.overall} OVR</span>
              <Badge variant="outline" className="text-[8px]">{player.eligibility}</Badge>
              <span>{player.teamName}</span>
            </div>
          </div>
        </div>
      </RetroCard>
    );
  };

  const PositionTeamTable = ({ team, title }: { team: { position: string; player: AwardPlayer }[]; title: string }) => {
    if (!team || team.length === 0) return null;
    return (
      <div data-testid={`position-team-${title.toLowerCase().replace(/\s/g, "-")}`}>
        <p className="font-pixel text-[9px] text-muted-foreground mb-2">{title.toUpperCase()}</p>
        <div className="space-y-1">
          {team.map((entry, i) => entry.player && (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[7px] min-w-[28px] justify-center">{entry.position}</Badge>
                <span>{entry.player.playerName}</span>
              </div>
              <div className="flex items-center gap-2 text-right">
                {entry.player.era != null && entry.player.strikeouts != null && (
                  <span className="text-[10px] text-muted-foreground">
                    {entry.player.era} ERA / {entry.player.strikeouts} K
                  </span>
                )}
                {entry.player.avg != null && entry.player.hr != null && entry.player.rbi != null && (
                  <span className="text-[10px] text-muted-foreground">
                    {entry.player.avg} / {entry.player.hr} HR / {entry.player.rbi} RBI
                  </span>
                )}
                <span className="text-gold font-bold">{entry.player.overall}</span>
                <span className="text-muted-foreground w-10 text-right">{entry.player.abbreviation}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2 w-full">
            <Award className="w-4 h-4 text-gold" />
            <span>Season {data.season} Awards</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="grid sm:grid-cols-3 gap-3">
            <AwardCard title="MVP" player={data.leagueAwards?.mvp || null} icon={<Trophy className="w-6 h-6" />} />
            <AwardCard title="Pitcher of the Year" player={data.leagueAwards?.pitcherOfYear || null} icon={<Zap className="w-6 h-6" />} />
            <AwardCard title="Freshman of the Year" player={data.leagueAwards?.freshmanOfYear || null} icon={<Star className="w-6 h-6" />} />
          </div>
        </RetroCardContent>
      </RetroCard>

      {(data.conferenceChampionshipMVPs && data.conferenceChampionshipMVPs.length > 0) && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Trophy className="w-4 h-4 text-gold" />
              <span>Conference Championship MVPs</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 gap-3">
              {data.conferenceChampionshipMVPs.map(cc => (
                <AwardCard key={cc.conferenceName} title={`${cc.conferenceName} CC MVP`} player={cc.mvp} icon={<Trophy className="w-5 h-5" />} />
              ))}
            </div>
          </RetroCardContent>
        </RetroCard>
      )}

      {data.cwsMVP && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Trophy className="w-4 h-4 text-gold" />
              <span>College World Series MVP</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <AwardCard title="CWS MVP" player={data.cwsMVP} icon={<Trophy className="w-6 h-6" />} />
          </RetroCardContent>
        </RetroCard>
      )}

      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2 w-full">
            <Star className="w-4 h-4 text-gold" />
            <span>All-American Team</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <PositionTeamTable team={data.allAmericanTeam || []} title="All-American First Team" />
        </RetroCardContent>
      </RetroCard>

      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2 w-full">
            <Star className="w-4 h-4 text-gold" />
            <span>All-Freshman Team</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <PositionTeamTable team={data.allFreshmanTeam || []} title="All-Freshman Team" />
        </RetroCardContent>
      </RetroCard>

      {data.conferenceAwards && data.conferenceAwards.length > 0 && data.conferenceAwards.map(conf => (
        <RetroCard key={conf.conferenceName}>
          <RetroCardHeader>{conf.conferenceName} Awards</RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <AwardCard title={`${conf.conferenceName} MVP`} player={conf.mvp} icon={<Trophy className="w-5 h-5" />} />
              <AwardCard title={`${conf.conferenceName} Pitcher`} player={conf.pitcherOfYear} icon={<Zap className="w-5 h-5" />} />
            </div>
            <PositionTeamTable team={conf.allConferenceTeam} title={`All-${conf.conferenceName} Team`} />
          </RetroCardContent>
        </RetroCard>
      ))}

      <div className="grid sm:grid-cols-2 gap-4">
        <RetroCard>
          <RetroCardHeader>Top Hitters</RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-1">
              {data.statsLeaders?.topHitters.map((p: any, i: number) => p && (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{i + 1}.</span>
                    <span>{p.playerName}</span>
                    <Badge variant="outline" className="text-[7px]">{p.position}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gold font-bold">{p.overall}</span>
                    <span className="text-muted-foreground">{p.abbreviation}</span>
                  </div>
                </div>
              ))}
            </div>
          </RetroCardContent>
        </RetroCard>
        <RetroCard>
          <RetroCardHeader>Top Pitchers</RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-1">
              {data.statsLeaders?.topPitchers.map((p: any, i: number) => p && (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{i + 1}.</span>
                    <span>{p.playerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gold font-bold">{p.overall}</span>
                    <span className="text-muted-foreground">{p.abbreviation}</span>
                  </div>
                </div>
              ))}
            </div>
          </RetroCardContent>
        </RetroCard>
      </div>

      <RecruitingLeaderboardCard leagueId={leagueId} season={data.season} />
      <AllTimeRecruitingLeaderboard leagueId={leagueId} />
    </div>
  );
}

function gradeColorLV(grade: string): string {
  if (grade.startsWith("A")) return "text-gold";
  if (grade.startsWith("B")) return "text-green-400";
  if (grade.startsWith("C")) return "text-yellow-400";
  if (grade === "D") return "text-orange-400";
  return "text-red-400";
}

interface RecruitingLeaderEntry {
  rank: number;
  coachId: string;
  coachName: string;
  season: number;
  teamId: string | null;
  teamName: string;
  teamAbbr: string;
  primaryColor: string | null;
  recruitingScore: number | null;
  recruitingGrade: string | null;
  recruitingBreakdown: Record<string, number> | null;
  classRank: number | null;
  classStarAvg: number | null;
  totalSigned: number;
  topRecruitName: string | null;
  topRecruitOvr: number | null;
  topRecruitStars: number | null;
  careerRecruitingScore: number | null;
}

function RecruitingLeaderboardCard({ leagueId, season }: { leagueId: string; season: number }) {
  const { data, isLoading } = useQuery<{ season: number | null; leaderboard: RecruitingLeaderEntry[] }>({
    queryKey: ["/api/leagues", leagueId, "recruiting-scores", season],
    queryFn: () => fetch(`/api/leagues/${leagueId}/recruiting-scores?season=${season}`, { credentials: "include" }).then(r => r.json()),
  });

  const BREAKDOWN_LABELS: Record<string, { label: string; weight: string }> = {
    classQuality: { label: "Class Quality", weight: "20%" },
    classRank: { label: "Class Rank", weight: "15%" },
    hitRate: { label: "Hit Rate", weight: "15%" },
    starEfficiency: { label: "Star Efficiency", weight: "15%" },
    positionalBalance: { label: "Positional Balance", weight: "10%" },
    blueChipHaul: { label: "Blue Chip Haul", weight: "10%" },
    actionEfficiency: { label: "Action Efficiency", weight: "10%" },
    gemDetection: { label: "Gem Detection", weight: "5%" },
  };

  return (
    <RetroCard data-testid="recruiting-leaderboard">
      <RetroCardHeader>
        <div className="flex items-center gap-2 w-full">
          <Star className="w-4 h-4 text-gold" />
          <span>Recruiter of the Year Leaderboard</span>
          <Badge variant="outline" className="text-[8px] ml-auto">Season {season}</Badge>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !data || data.leaderboard.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Recruiting grades are calculated at the end of signing day.
          </p>
        ) : (
          <div className="space-y-1">
            {data.leaderboard.map((entry, i) => (
              <details key={entry.coachId} className="group" data-testid={`recruiting-leader-${i}`}>
                <summary className="flex items-center justify-between py-2 px-1 rounded cursor-pointer hover:bg-muted/20 list-none border-b border-border/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-pixel text-[9px] w-5 ${i === 0 ? "text-gold" : "text-muted-foreground"}`}>
                      {i === 0 ? "★" : `#${entry.rank}`}
                    </span>
                    <span className="text-sm font-medium">{entry.coachName}</span>
                    <Badge variant="outline" className="text-[7px]">{entry.teamAbbr}</Badge>
                    {entry.classRank != null && (
                      <Badge variant="outline" className={`text-[7px] ${entry.classRank <= 3 ? "border-gold/50 text-gold" : ""}`}>
                        #{entry.classRank} class
                      </Badge>
                    )}
                    {entry.classStarAvg != null && (
                      <span className="text-[9px] text-yellow-400">{entry.classStarAvg.toFixed(1)}★ avg</span>
                    )}
                    {entry.topRecruitName && (
                      <span className="text-[9px] text-muted-foreground hidden sm:inline">
                        Top: {entry.topRecruitName}{entry.topRecruitOvr != null ? ` (${entry.topRecruitOvr})` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{entry.totalSigned} signed</span>
                    <span className={`font-bold font-pixel text-[11px] ${gradeColorLV(entry.recruitingGrade || "F")}`}>
                      {entry.recruitingGrade || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">{entry.recruitingScore?.toFixed(0)}</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground group-open:rotate-180 transition-transform" />
                  </div>
                </summary>
                {entry.recruitingBreakdown && (
                  <div className="px-6 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/10 rounded-b border-b border-border/20">
                    {Object.entries(BREAKDOWN_LABELS).map(([key, { label, weight }]) => (
                      <div key={key} className="text-center">
                        <p className="text-[9px] text-muted-foreground">{label}</p>
                        <p className="text-[9px] text-muted-foreground/60">{weight}</p>
                        <p className={`text-sm font-bold ${(entry.recruitingBreakdown![key] ?? 0) >= 75 ? "text-gold" : (entry.recruitingBreakdown![key] ?? 0) >= 50 ? "text-green-400" : "text-muted-foreground"}`}>
                          {entry.recruitingBreakdown![key] ?? 0}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

interface CareerLeaderEntry {
  rank: number;
  coachId: string;
  coachName: string;
  teamId: string | null;
  teamName: string;
  teamAbbr: string;
  primaryColor: string | null;
  careerRecruitingScore: number | null;
  seasonCount: number;
  bestScore: number;
  bestGrade: string;
}

function AllTimeRecruitingLeaderboard({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<{ careerLeaderboard: CareerLeaderEntry[] }>({
    queryKey: ["/api/leagues", leagueId, "recruiting-scores"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/recruiting-scores`, { credentials: "include" }).then(r => r.json()),
  });

  const leaders = data?.careerLeaderboard ?? [];

  return (
    <RetroCard data-testid="all-time-recruiting-leaderboard">
      <RetroCardHeader>
        <div className="flex items-center gap-2 w-full">
          <Crown className="w-4 h-4 text-gold" />
          <span>All-Time Recruiting Leaders</span>
          <Badge variant="outline" className="text-[8px] ml-auto">Career</Badge>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : leaders.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Career grades appear after the first signing day completes.
          </p>
        ) : (
          <div className="space-y-1">
            {leaders.map((entry, i) => (
              <div key={entry.coachId} className="flex items-center justify-between py-2 px-1 border-b border-border/20" data-testid={`all-time-leader-${i}`}>
                <div className="flex items-center gap-2">
                  <span className={`font-pixel text-[9px] w-5 ${i === 0 ? "text-gold" : "text-muted-foreground"}`}>
                    {i === 0 ? "★" : `#${entry.rank}`}
                  </span>
                  <span className="text-sm font-medium">{entry.coachName}</span>
                  <Badge variant="outline" className="text-[7px]">{entry.teamAbbr}</Badge>
                  <span className="text-[9px] text-muted-foreground">{entry.seasonCount} season{entry.seasonCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold font-pixel text-[11px] ${gradeColorLV(entry.bestGrade)}`}>
                    Best: {entry.bestGrade}
                  </span>
                  <span className="text-xs text-muted-foreground">{entry.careerRecruitingScore?.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function PostseasonTab({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<PostseasonData>({
    queryKey: ["/api/leagues", leagueId, "postseason"],
    enabled: !!leagueId,
  });

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  const hasData = data && (
    data.conferenceChampionships.length > 0 ||
    data.superRegionals.length > 0 ||
    data.cws.length > 0
  );

  if (!hasData) {
    return (
      <RetroCard>
        <RetroCardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-pixel text-xs text-gold mb-2">No Postseason Yet</p>
            <p className="text-sm">The postseason will begin after the regular season ends.</p>
            <Link href={`/league/${leagueId}/postseason`}>
              <RetroButton variant="outline" size="sm" className="mt-4" data-testid="button-postseason-hub">
                Postseason Hub <ChevronRight className="w-3 h-3 ml-1" />
              </RetroButton>
            </Link>
          </div>
        </RetroCardContent>
      </RetroCard>
    );
  }

  const cwsChampName = (() => {
    if (!data!.cws.length) return null;
    const wins: Record<string, { name: string; count: number }> = {};
    for (const g of data!.cws.filter(g => g.isComplete)) {
      const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
      const wName = wId === g.homeTeamId ? g.homeTeam?.name : g.awayTeam?.name;
      if (!wins[wId]) wins[wId] = { name: wName || "", count: 0 };
      wins[wId].count++;
    }
    return Object.values(wins).find(e => e.count >= 2)?.name ?? null;
  })();

  const statusLabel = cwsChampName
    ? `${cwsChampName} — CWS Champion!`
    : data!.cws.length > 0
    ? "College World Series in Progress"
    : data!.superRegionals.length > 0
    ? "Super Regionals in Progress"
    : "Conference Championships in Progress";

  const gamesSummary = [
    data!.conferenceChampionships.length > 0 &&
      `${data!.conferenceChampionships.filter(g => g.isComplete).length}/${data!.conferenceChampionships.length} CC`,
    data!.superRegionals.length > 0 &&
      `${data!.superRegionals.filter(g => g.isComplete).length}/${data!.superRegionals.length} SR`,
    data!.cws.length > 0 &&
      `CWS Game ${Math.min(data!.cws.filter(g => g.isComplete).length + 1, data!.cws.length)}`,
  ].filter(Boolean).join(" · ");

  return (
    <RetroCard>
      <RetroCardContent>
        <div className="flex items-center gap-4 py-2">
          <Trophy className="w-8 h-8 text-gold flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-pixel text-xs text-gold truncate">{statusLabel}</p>
            {gamesSummary && (
              <p className="text-[10px] text-muted-foreground mt-1">{gamesSummary}</p>
            )}
          </div>
          <Link href={`/league/${leagueId}/postseason`}>
            <RetroButton variant="outline" size="sm" className="flex-shrink-0" data-testid="button-postseason-hub">
              Full Bracket <ChevronRight className="w-3 h-3 ml-1" />
            </RetroButton>
          </Link>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

function PostseasonGameCard({ game, leagueId }: { game: PostseasonGame; leagueId: string }) {
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div className="bg-muted/30 rounded p-3 border border-border" data-testid={`postseason-game-${game.id}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {game.homeSeed != null && game.homeSeed > 0 && (
            <span className="text-[9px] font-pixel text-gold flex-shrink-0 w-4">{game.homeSeed}</span>
          )}
          <span className={`text-xs truncate ${homeWon ? "text-gold font-medium" : game.isComplete ? "text-muted-foreground" : ""}`}>
            {game.homeTeam?.name || "TBD"}
          </span>
          {game.homeTeam?.abbreviation && (
            <Badge variant="outline" className="text-[8px] flex-shrink-0">{game.homeTeam.abbreviation}</Badge>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 text-center min-w-[60px] justify-center">
          {game.isComplete ? (
            <>
              <span className={`text-sm font-pixel ${homeWon ? "text-gold" : "text-muted-foreground"}`} data-testid={`score-home-${game.id}`}>
                {game.homeScore}
              </span>
              <span className="text-muted-foreground text-xs">–</span>
              <span className={`text-sm font-pixel ${awayWon ? "text-gold" : "text-muted-foreground"}`} data-testid={`score-away-${game.id}`}>
                {game.awayScore}
              </span>
            </>
          ) : (
            <span className="text-[9px] font-pixel text-muted-foreground">
              {game.homeTeam && game.awayTeam ? "vs" : "TBD"}
            </span>
          )}
        </div>

        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          {game.awayTeam?.abbreviation && (
            <Badge variant="outline" className="text-[8px] flex-shrink-0">{game.awayTeam.abbreviation}</Badge>
          )}
          <span className={`text-xs truncate text-right ${awayWon ? "text-gold font-medium" : game.isComplete ? "text-muted-foreground" : ""}`}>
            {game.awayTeam?.name || "TBD"}
          </span>
          {game.awaySeed != null && game.awaySeed > 0 && (
            <span className="text-[9px] font-pixel text-gold flex-shrink-0 w-4 text-right">{game.awaySeed}</span>
          )}
        </div>

        {!game.isComplete && game.homeTeam && game.awayTeam && (
          <Link href={`/league/${leagueId}/game/${game.id}/play-by-play`}>
            <RetroButton variant="outline" size="sm" title="Play by Play" data-testid={`button-pbp-postseason-${game.id}`}>
              <Play className="w-3 h-3" />
            </RetroButton>
          </Link>
        )}
        {game.isComplete && (
          <Badge className="text-[8px] bg-green-500/20 text-green-400 border-green-500/30 flex-shrink-0">Final</Badge>
        )}
      </div>
    </div>
  );
}

function BracketMatchup({ game, label, lossMap }: { game: PostseasonGame | null; label?: string; lossMap?: Record<string, number> }) {
  if (!game) {
    return (
      <div data-testid="bracket-matchup-tbd">
        {label && <p className="text-[7px] font-pixel text-muted-foreground/50 mb-0.5">{label}</p>}
        <div className="bg-muted/20 border border-border/50 rounded w-full">
          <div className="flex items-center justify-between px-2 py-1.5 text-muted-foreground">
            <span className="text-[10px]">TBD</span>
            <span className="text-[10px] font-pixel">-</span>
          </div>
          <div className="border-t border-border/30" />
          <div className="flex items-center justify-between px-2 py-1.5 text-muted-foreground">
            <span className="text-[10px]">TBD</span>
            <span className="text-[10px] font-pixel">-</span>
          </div>
        </div>
      </div>
    );
  }

  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const homeLosses = lossMap?.[game.homeTeamId] ?? 0;
  const awayLosses = lossMap?.[game.awayTeamId] ?? 0;

  return (
    <div data-testid={`bracket-game-${game.id}`}>
      {label && <p className="text-[7px] font-pixel text-muted-foreground/50 mb-0.5">{label}</p>}
      <div className={`border rounded ${game.isComplete ? "border-border" : "border-gold/30"} bg-muted/30 w-full`}>
        <div className={`flex items-center justify-between gap-1 px-2 py-1.5 ${homeWon ? "bg-gold/10 text-gold font-medium" : awayWon ? "text-muted-foreground" : ""}`}>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {game.homeSeed && <span className="text-[9px] font-pixel text-gold flex-shrink-0 w-3">{game.homeSeed}</span>}
            <span className="text-[10px] truncate">{game.homeTeam?.abbreviation || "TBD"}</span>
            {lossMap && homeLosses > 0 && <span className="text-[7px] text-amber-400/70 flex-shrink-0">{homeLosses}L</span>}
          </div>
          <span className="text-[10px] font-pixel flex-shrink-0">{game.isComplete ? game.homeScore : "-"}</span>
        </div>
        <div className="border-t border-border/30" />
        <div className={`flex items-center justify-between gap-1 px-2 py-1.5 ${awayWon ? "bg-gold/10 text-gold font-medium" : homeWon ? "text-muted-foreground" : ""}`}>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {game.awaySeed && <span className="text-[9px] font-pixel text-gold flex-shrink-0 w-3">{game.awaySeed}</span>}
            <span className="text-[10px] truncate">{game.awayTeam?.abbreviation || "TBD"}</span>
            {lossMap && awayLosses > 0 && <span className="text-[7px] text-amber-400/70 flex-shrink-0">{awayLosses}L</span>}
          </div>
          <span className="text-[10px] font-pixel flex-shrink-0">{game.isComplete ? game.awayScore : "-"}</span>
        </div>
      </div>
      {!game.isComplete && (
        <p className="text-[7px] text-center text-muted-foreground/50 mt-0.5">Upcoming</p>
      )}
    </div>
  );
}

const WB_ROUND_LABELS: Record<number, string> = {
  1: "WB Round 1",
  2: "WB Round 2",
  3: "WB Semifinals",
  4: "WB Final",
};
const LB_ROUND_LABELS: Record<number, string> = {
  2: "LB Round 1",
  3: "LB Round 2",
  4: "LB Quarterfinals",
  5: "LB Semifinals",
  6: "LB Round 5",
  7: "LB Final",
};

function DoubleEliminationBracket({ games, leagueId }: { games: PostseasonGame[]; leagueId: string }) {
  const wbGames = games.filter(g => g.bracketType === "winners");
  const lbGames = games.filter(g => g.bracketType === "losers");
  const gfGames = games.filter(g => g.bracketType === "grand_final" || g.bracketType === "grand_final_reset");

  const wbRounds = [...new Set(wbGames.map(g => g.bracketRound ?? 1))].sort((a, b) => a - b);
  const lbRounds = [...new Set(lbGames.map(g => g.bracketRound ?? 2))].sort((a, b) => a - b);

  // Per-team loss count from completed WB+LB games (not grand final)
  const lossMap: Record<string, number> = {};
  for (const g of [...wbGames, ...lbGames].filter(x => x.isComplete)) {
    const loserId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.awayTeamId : g.homeTeamId;
    lossMap[loserId] = (lossMap[loserId] ?? 0) + 1;
  }

  const getWinner = (g: PostseasonGame) => {
    if (!g.isComplete) return null;
    return (g.homeScore ?? 0) > (g.awayScore ?? 0)
      ? { abbr: g.homeTeam?.abbreviation || "TBD", seed: g.homeSeed }
      : { abbr: g.awayTeam?.abbreviation || "TBD", seed: g.awaySeed };
  };

  const wbFinalGame = wbGames.find(g => g.bracketRound === 4);
  const lbFinalGame = lbGames.find(g => g.bracketRound === 7);
  const wbChamp = wbFinalGame?.isComplete ? getWinner(wbFinalGame) : null;
  const lbChamp = lbFinalGame?.isComplete ? getWinner(lbFinalGame) : null;

  const gfGame    = gfGames.find(g => g.bracketType === "grand_final");
  const gfResetGm = gfGames.find(g => g.bracketType === "grand_final_reset");
  const srChamp   = gfResetGm?.isComplete
    ? getWinner(gfResetGm)
    : (gfGame?.isComplete ? getWinner(gfGame) : null);

  // Find the #1 seed (first-round bye recipient) from WBR2 games where they first appear
  const wbR2Games = wbGames.filter(g => (g.bracketRound ?? 1) === 2);
  let byeSeedAbbr: string | null = null;
  for (const g of wbR2Games) {
    if (g.homeSeed === 1) { byeSeedAbbr = g.homeTeam?.abbreviation ?? "1 Seed"; break; }
    if (g.awaySeed === 1) { byeSeedAbbr = g.awayTeam?.abbreviation ?? "1 Seed"; break; }
  }
  // Fallback: check all WB games
  if (!byeSeedAbbr) {
    for (const g of wbGames) {
      if (g.homeSeed === 1) { byeSeedAbbr = g.homeTeam?.abbreviation ?? "1 Seed"; break; }
      if (g.awaySeed === 1) { byeSeedAbbr = g.awayTeam?.abbreviation ?? "1 Seed"; break; }
    }
  }

  return (
    <div className="space-y-4" data-testid="bracket-view">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Winners Bracket */}
        <div className="space-y-3">
          <p className="text-[9px] font-pixel text-gold uppercase tracking-wider">Winners Bracket</p>
          {wbRounds.map(round => {
            const roundGames = wbGames.filter(g => (g.bracketRound ?? 1) === round);
            const label = WB_ROUND_LABELS[round] ?? `WB Round ${round}`;
            return (
              <div key={round} className="space-y-1">
                <p className="text-[7px] font-pixel text-muted-foreground uppercase">{label}</p>
                <div className="space-y-1.5">
                  {roundGames.map(g => <BracketMatchup key={g.id} game={g} lossMap={lossMap} />)}
                  {round === 1 && byeSeedAbbr && (
                    <div className="bg-muted/20 border border-gold/20 rounded px-2 py-1.5 text-center">
                      <p className="text-[7px] font-pixel text-gold/70 uppercase tracking-wider">#1 Seed — BYE</p>
                      <p className="text-[8px] font-pixel text-muted-foreground">{byeSeedAbbr} advances to WBR2</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {wbChamp && !gfGame && (
            <div className="bg-gold/10 border border-gold/40 rounded px-3 py-2 text-center">
              <p className="text-[7px] font-pixel text-muted-foreground mb-0.5">WB CHAMPION</p>
              <p className="text-gold font-pixel text-xs">
                {wbChamp.seed ? <span className="mr-1">{wbChamp.seed}</span> : null}
                {wbChamp.abbr}
              </p>
            </div>
          )}
        </div>

        {/* Losers Bracket */}
        <div className="space-y-3">
          <p className="text-[9px] font-pixel text-amber-400 uppercase tracking-wider">Losers Bracket</p>
          {lbRounds.map(round => {
            const roundGames = lbGames.filter(g => (g.bracketRound ?? 2) === round);
            const label = LB_ROUND_LABELS[round] ?? `LB Round ${round}`;
            return (
              <div key={round} className="space-y-1">
                <p className="text-[7px] font-pixel text-muted-foreground uppercase">{label}</p>
                <div className="space-y-1.5">
                  {roundGames.map(g => <BracketMatchup key={g.id} game={g} lossMap={lossMap} />)}
                </div>
              </div>
            );
          })}
          {lbChamp && !gfGame && (
            <div className="bg-amber-400/10 border border-amber-400/40 rounded px-3 py-2 text-center">
              <p className="text-[7px] font-pixel text-muted-foreground mb-0.5">LB CHAMPION</p>
              <p className="text-amber-400 font-pixel text-xs">
                {lbChamp.seed ? <span className="mr-1">{lbChamp.seed}</span> : null}
                {lbChamp.abbr}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Grand Final section */}
      {gfGame && (
        <div className="border-t border-gold/30 pt-3 space-y-2">
          <p className="text-[9px] font-pixel text-gold uppercase tracking-wider text-center">SR Grand Final</p>
          <div className="max-w-xs mx-auto space-y-2">
            <BracketMatchup game={gfGame} label="Grand Final" />
            {gfResetGm && <BracketMatchup game={gfResetGm} label="If Necessary (Reset)" />}
          </div>
          {srChamp && (
            <div className="bg-gold/10 border border-gold/40 rounded px-3 py-2 text-center max-w-xs mx-auto">
              <p className="text-[7px] font-pixel text-muted-foreground mb-0.5">SR CHAMPION → CWS</p>
              <p className="text-gold font-pixel text-xs">
                {srChamp.seed ? <span className="mr-1">{srChamp.seed}</span> : null}
                {srChamp.abbr}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border/30 pt-3">
        <p className="text-[8px] font-pixel text-muted-foreground uppercase mb-2">All Games</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {games.map(game => (
            <PostseasonGameCard key={game.id} game={game} leagueId={leagueId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PostseasonBracketView({ games, leagueId }: { games: PostseasonGame[]; leagueId: string }) {
  // Detect new double-elim SR bracket even in Stage 1 (when only WBR1 "winners" games exist, no bracketSide).
  const hasDoubleElim = games.some(g =>
    (g.bracketType === "winners" || g.bracketType === "losers" ||
     g.bracketType === "grand_final" || g.bracketType === "grand_final_reset") && !g.bracketSide
  );

  if (!hasDoubleElim) {
    return (
      <div className="space-y-3" data-testid="bracket-view">
        <div className="grid sm:grid-cols-2 gap-3">
          {games.map(game => (
            <PostseasonGameCard key={game.id} game={game} leagueId={leagueId} />
          ))}
        </div>
      </div>
    );
  }

  return <DoubleEliminationBracket games={games} leagueId={leagueId} />;
}

function CWSSeriesDisplay({ games }: { games: PostseasonGame[] }) {
  const completedGames = games.filter(g => g.isComplete);
  if (completedGames.length === 0) return null;

  const winsMap: Record<string, { name: string; wins: number }> = {};
  for (const g of completedGames) {
    const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    const winnerTeam = winnerId === g.homeTeamId ? g.homeTeam : g.awayTeam;
    if (!winsMap[winnerId]) winsMap[winnerId] = { name: winnerTeam?.name || "TBD", wins: 0 };
    winsMap[winnerId].wins++;
  }

  const entries = Object.values(winsMap);
  const champion = entries.find(e => e.wins >= 2);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      {champion ? (
        <div className="text-center bg-gold/10 rounded p-4 border border-gold/20">
          <Trophy className="w-8 h-8 text-gold mx-auto mb-2" />
          <p className="font-pixel text-gold text-sm" data-testid="text-league-cws-champion">
            {champion.name} Wins the College World Series!
          </p>
        </div>
      ) : (
        <div className="text-center">
          <p className="font-pixel text-xs text-muted-foreground mb-2">Series Status</p>
          <div className="flex items-center justify-center gap-6 text-sm">
            {entries.map(e => (
              <span key={e.name} className="font-pixel text-gold">
                {e.name}: {e.wins}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface SigningDayData {
  teamSignings: {
    teamId: string;
    teamName: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    mascot: string;
    recruits: { id: string; firstName: string; lastName: string; position: string; starRating: number; overall: number; homeState: string; isBlueChip: boolean }[];
    totalRecruits: number;
    avgRating: number;
    totalStars: number;
  }[];
  totalSigned: number;
  totalUnsigned: number;
  totalRecruits: number;
  transferPortal?: {
    departed: number;
    stillAvailable: number;
  };
}

interface CompareTeamData {
  id: string; name: string; mascot: string; abbreviation: string; primaryColor: string; secondaryColor: string;
  prestige: number; facilities: number;
  wins: number; losses: number; confWins: number; confLosses: number;
  runsScored: number; runsAllowed: number;
  rosterSize: number; avgOverall: number; avgPitcher: number; avgHitter: number;
  positionCounts: Record<string, number>;
  topPlayers: { name: string; position: string; overall: number; year: number }[];
  freshmen: number; sophomores: number; juniors: number; seniors: number;
}

function CompareStatRow({ label, valueA, valueB, highlight }: { label: string; valueA: string | number; valueB: string | number; highlight?: boolean }) {
  const numA = typeof valueA === "number" ? valueA : parseFloat(valueA);
  const numB = typeof valueB === "number" ? valueB : parseFloat(valueB);
  const aWins = !isNaN(numA) && !isNaN(numB) && numA > numB;
  const bWins = !isNaN(numA) && !isNaN(numB) && numB > numA;

  return (
    <div className={`grid grid-cols-3 gap-2 py-1.5 text-sm ${highlight ? "bg-gold/5" : ""}`}>
      <span className={`text-right font-mono ${aWins ? "text-green-400 font-semibold" : ""}`}>{valueA}</span>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono ${bWins ? "text-green-400 font-semibold" : ""}`}>{valueB}</span>
    </div>
  );
}

function TeamCompareDialog({ leagueId, teamAId, teamBId, open, onClose }: { leagueId: string; teamAId: string; teamBId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ teamA: CompareTeamData; teamB: CompareTeamData }>({
    queryKey: [`/api/leagues/${leagueId}/team-compare?teamA=${teamAId}&teamB=${teamBId}`],
    enabled: open && !!teamAId && !!teamBId,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background border-gold/30 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm">Team Comparison</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center justify-end gap-2">
                <span className="font-pixel text-xs text-right">{data.teamA.name}</span>
                <TeamBadge abbreviation={data.teamA.abbreviation} primaryColor={data.teamA.primaryColor} name={data.teamA.name} size="md" />
              </div>
              <div className="text-center text-muted-foreground text-xs pt-2">VS</div>
              <div className="flex items-center gap-2">
                <TeamBadge abbreviation={data.teamB.abbreviation} primaryColor={data.teamB.primaryColor} name={data.teamB.name} size="md" />
                <span className="font-pixel text-xs">{data.teamB.name}</span>
              </div>
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">RECORD</p>
              <CompareStatRow label="W-L" valueA={`${data.teamA.wins}-${data.teamA.losses}`} valueB={`${data.teamB.wins}-${data.teamB.losses}`} highlight />
              <CompareStatRow label="Conf W-L" valueA={`${data.teamA.confWins}-${data.teamA.confLosses}`} valueB={`${data.teamB.confWins}-${data.teamB.confLosses}`} />
              <CompareStatRow label="Runs Scored" valueA={data.teamA.runsScored} valueB={data.teamB.runsScored} />
              <CompareStatRow label="Runs Allowed" valueA={data.teamA.runsAllowed} valueB={data.teamB.runsAllowed} />
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">ROSTER</p>
              <CompareStatRow label="Roster Size" valueA={data.teamA.rosterSize} valueB={data.teamB.rosterSize} />
              <CompareStatRow label="Avg Overall" valueA={data.teamA.avgOverall} valueB={data.teamB.avgOverall} highlight />
              <CompareStatRow label="Avg Pitcher" valueA={data.teamA.avgPitcher} valueB={data.teamB.avgPitcher} />
              <CompareStatRow label="Avg Hitter" valueA={data.teamA.avgHitter} valueB={data.teamB.avgHitter} />
              <CompareStatRow label="Freshmen" valueA={data.teamA.freshmen} valueB={data.teamB.freshmen} />
              <CompareStatRow label="Sophomores" valueA={data.teamA.sophomores} valueB={data.teamB.sophomores} />
              <CompareStatRow label="Juniors" valueA={data.teamA.juniors} valueB={data.teamB.juniors} />
              <CompareStatRow label="Seniors" valueA={data.teamA.seniors} valueB={data.teamB.seniors} />
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">PROGRAM</p>
              <CompareStatRow label="Prestige" valueA={data.teamA.prestige} valueB={data.teamB.prestige} highlight />
              <CompareStatRow label="Facilities" valueA={data.teamA.facilities} valueB={data.teamB.facilities} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[data.teamA, data.teamB].map((team, idx) => (
                <div key={idx} className="border border-border/50 rounded-md p-3">
                  <p className="font-pixel text-[10px] text-gold mb-2">TOP 5 PLAYERS - {team.abbreviation}</p>
                  {team.topPlayers.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span className="truncate">{p.name} <span className="text-muted-foreground">({p.position}, Yr {p.year})</span></span>
                      <span className="font-mono">{p.overall}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface StorylineWrapEntry {
  storylineRecruitId: string;
  recruitId: string;
  firstName: string;
  lastName: string;
  position: string;
  archetype: string;
  archetypeName: string;
  isLegendary: boolean;
  resolvedOvrDelta: number;
  committed: boolean;
  signedTeamId: string | null;
}

function SeasonRecapDialog({ leagueId, season, open, onClose }: { leagueId: string; season: number; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<{
    season: number;
    teams: { id: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string; wins: number; losses: number; confWins: number; confLosses: number; runsScored: number; runsAllowed: number }[];
    cwsChampion: { name: string; abbreviation: string; primaryColor: string } | null;
    cwsRunnerUp: { name: string; abbreviation: string } | null;
    totalGames: number;
    bestRecord: string | null;
  }>({
    queryKey: ["/api/leagues", leagueId, "season-recap", season],
    enabled: open && season > 0,
  });

  const { data: wrapData } = useQuery<{ season: number; entries: StorylineWrapEntry[] }>({
    queryKey: ["/api/leagues", leagueId, "storyline-season-wrap", season],
    enabled: open && season > 0,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background border-gold/30 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Season {season} Recap
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            {data.cwsChampion && (
              <div className="text-center p-4 border border-gold/30 rounded-md bg-gold/5">
                <p className="text-xs text-muted-foreground mb-1">CWS CHAMPION</p>
                <div className="flex items-center justify-center gap-2">
                  <TeamBadge
                    abbreviation={data.cwsChampion.abbreviation}
                    primaryColor={data.cwsChampion.primaryColor}
                    name={data.cwsChampion.name}
                    size="md"
                  />
                  <span className="font-pixel text-gold text-sm">{data.cwsChampion.name}</span>
                </div>
                {data.cwsRunnerUp && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Runner-up: {data.cwsRunnerUp.name}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-2">
              <span>{data.totalGames} games played</span>
              {data.bestRecord && <span>Best: {data.bestRecord}</span>}
            </div>

            <div>
              <p className="font-pixel text-gold text-[10px] mb-2">TOP 10 TEAMS</p>
              <div className="space-y-1">
                {data.teams.map((team, i) => (
                  <div
                    key={team.id}
                    className="flex items-center gap-2 p-2 rounded text-sm"
                    data-testid={`recap-team-${i}`}
                  >
                    <span className="text-muted-foreground w-5 text-right text-xs">{i + 1}.</span>
                    <TeamBadge
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      name={team.name}
                      size="sm"
                    />
                    <span className="flex-1 truncate">{team.name}</span>
                    <span className="font-mono text-xs">
                      {team.wins}-{team.losses}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({team.confWins}-{team.confLosses} conf)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No recap data available</p>
        )}

        {/* Storyline Season Wrap */}
        {wrapData && wrapData.entries.length > 0 && (
          <div className="border-t border-border/50 pt-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-gold" />
              <p className="font-pixel text-gold text-[10px]">STORYLINE SEASON WRAP</p>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto" data-testid="storyline-season-wrap">
              {wrapData.entries.map((entry) => {
                const isPositive = entry.resolvedOvrDelta > 0;
                const isNeutral = entry.resolvedOvrDelta === 0;
                const rowColor = isNeutral
                  ? "bg-muted/20 border-border/30"
                  : isPositive
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-red-500/10 border-red-500/30";
                return (
                  <div
                    key={entry.storylineRecruitId}
                    className={`flex items-center gap-2 p-2 rounded border ${rowColor}`}
                    data-testid={`storyline-wrap-${entry.storylineRecruitId}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {entry.firstName[0]}. {entry.lastName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">({entry.position})</span>
                        {entry.isLegendary && (
                          <span className="flex items-center gap-0.5 text-[9px] text-yellow-300 bg-yellow-500/20 border border-yellow-500/30 rounded px-1 py-0.5">
                            <Sparkles className="w-2.5 h-2.5" />
                            Legendary
                          </span>
                        )}
                        {entry.committed ? (
                          <span className="text-[9px] text-green-400 bg-green-500/10 border border-green-500/30 rounded px-1 py-0.5">
                            Committed
                          </span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground bg-muted/30 border border-border/40 rounded px-1 py-0.5">
                            Not Committed
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{entry.archetypeName}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isPositive ? (
                        <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                      ) : isNeutral ? (
                        <span className="w-3.5 h-3.5 text-muted-foreground text-center leading-none">—</span>
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span
                        className={`text-xs font-bold tabular-nums ${isPositive ? "text-green-400" : isNeutral ? "text-muted-foreground" : "text-red-400"}`}
                        data-testid={`wrap-ovr-delta-${entry.storylineRecruitId}`}
                      >
                        {isPositive ? "+" : ""}{entry.resolvedOvrDelta}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type ClassSnapshot = {
  teamId: string;
  classRank: number;
  classScore: number;
  totalCommits: number;
  fiveStars: number;
  fourStars: number;
  threeStars: number;
  avgOverall: number;
  avgStarRating: number;
  topRecruitName?: string | null;
  topRecruitOvr?: number | null;
  topRecruitStars?: number | null;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  isCpu: boolean;
};

function getClassGrade(rank: number, total: number): string {
  const pct = rank / total;
  if (pct <= 0.10) return "A+";
  if (pct <= 0.20) return "A";
  if (pct <= 0.30) return "A-";
  if (pct <= 0.40) return "B+";
  if (pct <= 0.55) return "B";
  if (pct <= 0.70) return "B-";
  if (pct <= 0.80) return "C+";
  if (pct <= 0.90) return "C";
  return "D";
}

function getGradeColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "text-green-400";
  if (grade === "A-" || grade === "B+") return "text-lime-400";
  if (grade === "B") return "text-yellow-400";
  if (grade === "B-" || grade === "C+") return "text-orange-400";
  return "text-red-400";
}

function getGradeBg(grade: string): string {
  if (grade === "A+" || grade === "A") return "bg-green-400/10 border-green-400/30";
  if (grade === "A-" || grade === "B+") return "bg-lime-400/10 border-lime-400/30";
  if (grade === "B") return "bg-yellow-400/10 border-yellow-400/30";
  if (grade === "B-" || grade === "C+") return "bg-orange-400/10 border-orange-400/30";
  return "bg-red-400/10 border-red-400/30";
}

function SigningDaySummaryCard({ league, myTeam }: { league: LeagueDetails; myTeam: TeamWithCoach | undefined | null }) {
  const showPhases = ["offseason_walkons", "preseason"];
  const isVisible = showPhases.includes(league.currentPhase ?? "");

  const { data: rankingsData } = useQuery<{
    bySeason: Record<number, ClassSnapshot[]>;
    availableSeasons: number[];
  }>({
    queryKey: ["/api/leagues", league.id, "class-rankings"],
    enabled: isVisible && !!myTeam,
  });

  const latestSeason = rankingsData?.availableSeasons?.[0];

  // Dismiss key uses the snapshot's own season — stable across walk-ons → preseason transition
  const dismissKey = `signing-day-summary-dismissed-${league.id}-${latestSeason ?? "none"}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (latestSeason != null) {
      setDismissed(localStorage.getItem(dismissKey) === "1");
    }
  }, [dismissKey, latestSeason]);

  const snaps: ClassSnapshot[] = latestSeason != null ? (rankingsData?.bySeason?.[latestSeason] ?? []) : [];
  const mySnap = myTeam ? snaps.find(s => s.teamId === myTeam.id) : null;

  // Don't render until latestSeason is known — avoids a dismissed-card flash on first paint
  if (!isVisible || !myTeam || latestSeason == null) return null;
  if (dismissed || snaps.length === 0 || !mySnap) return null;

  // Use total league teams as denominator (not just teams with commits) for an accurate rank context
  const total = league.teams?.length ?? snaps.length;
  const grade = getClassGrade(mySnap.classRank, total);
  const gradeColor = getGradeColor(grade);
  const gradeBg = getGradeBg(grade);

  const dismiss = () => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  return (
    <RetroCard className="border-gold/40 mb-4 relative overflow-hidden" data-testid="signing-day-summary-card">
      <div className="absolute inset-0 bg-gradient-to-r from-gold/5 to-transparent pointer-events-none" />
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors z-10"
        data-testid="button-dismiss-signing-day-summary"
        aria-label="Dismiss signing day summary"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <Trophy className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-gold text-[10px] mb-0.5">DECISION DAY</p>
          <p className="text-[10px] text-muted-foreground mb-3">
            Season {latestSeason} Recruiting Class — {mySnap.totalCommits} commits signed
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {/* Class Grade */}
            <div className={`rounded border p-3 text-center ${gradeBg}`}>
              <p className="font-pixel text-[8px] text-muted-foreground mb-1">CLASS GRADE</p>
              <p className={`font-pixel text-2xl font-bold ${gradeColor}`} data-testid="text-signing-day-grade">{grade}</p>
            </div>

            {/* National Rank */}
            <div className="bg-muted/30 rounded border border-border p-3 text-center">
              <p className="font-pixel text-[8px] text-muted-foreground mb-1">NATIONAL RANK</p>
              <p className="font-bold text-xl text-foreground" data-testid="text-signing-day-rank">
                #{mySnap.classRank}
              </p>
              <p className="text-[9px] text-muted-foreground">of {total} teams</p>
            </div>

            {/* Total Commits */}
            <div className="bg-muted/30 rounded border border-border p-3 text-center">
              <p className="font-pixel text-[8px] text-muted-foreground mb-1">COMMITS</p>
              <p className="font-bold text-xl text-foreground" data-testid="text-signing-day-commits">
                {mySnap.totalCommits}
              </p>
              <div className="flex justify-center gap-1 mt-0.5 flex-wrap">
                {mySnap.fiveStars > 0 && <span className="text-[8px] text-yellow-400">{mySnap.fiveStars}x 5★</span>}
                {mySnap.fourStars > 0 && <span className="text-[8px] text-yellow-300">{mySnap.fourStars}x 4★</span>}
                {mySnap.threeStars > 0 && <span className="text-[8px] text-muted-foreground">{mySnap.threeStars}x 3★</span>}
              </div>
            </div>

            {/* Top Recruit */}
            <div className="bg-muted/30 rounded border border-border p-3 text-center">
              <p className="font-pixel text-[8px] text-muted-foreground mb-1">TOP RECRUIT</p>
              {mySnap.topRecruitName ? (
                <>
                  <p className="text-xs font-bold text-foreground leading-tight" data-testid="text-signing-day-top-recruit">
                    {mySnap.topRecruitName}
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    {mySnap.topRecruitStars != null && (
                      <span className="text-[9px] text-yellow-400">{"★".repeat(mySnap.topRecruitStars)}</span>
                    )}
                    {mySnap.topRecruitOvr != null && (
                      <span className="text-[9px] text-muted-foreground">{mySnap.topRecruitOvr} OVR</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">—</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Link href={`/league/${league.id}/recruiting`}>
              <RetroButton variant="outline" size="sm" data-testid="button-signing-day-view-class">
                <Target className="w-3 h-3 mr-1" />
                View Full Rankings
              </RetroButton>
            </Link>
          </div>
        </div>
      </div>
    </RetroCard>
  );
}

function ProgramChangesCard({ league, myTeam }: { league: LeagueDetails; myTeam: TeamWithCoach | undefined | null }) {
  const isPreseason = league.currentPhase === "preseason";
  const completedSeason = league.currentSeason - 1;
  const dismissKey = `program-changes-dismissed-${league.id}-${completedSeason}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(localStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  const { data: eventsData } = useQuery<{ events?: Array<{ id: string; teamId: string | null; season: number; metadata: Record<string, unknown> | null }> } | Array<{ id: string; teamId: string | null; season: number; metadata: Record<string, unknown> | null }>>({
    queryKey: ["/api/leagues", league.id, "events", "PROGRAM_ATTR_CHANGE"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/events?type=PROGRAM_ATTR_CHANGE&limit=50`);
      return res.json();
    },
    enabled: isPreseason && !!myTeam && completedSeason >= 1,
  });

  if (!isPreseason || !myTeam || completedSeason < 1 || dismissed) return null;

  type AttrChange = { attr: string; label: string; prev: number; curr: number; delta: number; reason: string };
  const rawEvents = Array.isArray(eventsData) ? eventsData : (eventsData as any)?.events ?? [];
  const teamEvent = rawEvents.find(
    (e: any) => e.teamId === myTeam.id && e.season === completedSeason
  );
  const changeList: AttrChange[] = (teamEvent?.metadata as any)?.changes ?? [];

  if (changeList.length === 0) return null;

  return (
    <RetroCard className="border-gold/30 mb-4 relative overflow-hidden" data-testid="program-changes-card">
      <div className="absolute inset-0 bg-gradient-to-r from-gold/5 to-transparent pointer-events-none" />
      <button
        onClick={() => { localStorage.setItem(dismissKey, "1"); setDismissed(true); }}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors z-10"
        data-testid="button-dismiss-program-changes"
        aria-label="Dismiss program changes"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <Zap className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-gold text-[10px] mb-0.5">PROGRAM CHANGES</p>
          <p className="text-[10px] text-muted-foreground mb-3">
            Season {completedSeason} — Your program attributes evolved
          </p>
          <div className="space-y-1.5">
            {changeList.map((c) => (
              <div key={c.attr} className="flex items-center gap-2 text-xs" data-testid={`program-change-${c.attr}`}>
                <span
                  className={`inline-flex items-center gap-0.5 font-pixel text-[9px] px-1.5 py-0.5 rounded border ${
                    c.delta > 0
                      ? "bg-green-500/15 text-green-400 border-green-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}
                >
                  {c.delta > 0 ? "▲" : "▼"}{Math.abs(c.delta)}
                </span>
                <span className="font-medium text-foreground">{c.label}</span>
                <span className="text-muted-foreground">—</span>
                <span className="text-muted-foreground truncate">{c.reason}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link href={`/league/${league.id}/program/${myTeam.id}`}>
              <RetroButton variant="outline" size="sm" data-testid="button-program-changes-view-profile">
                <Zap className="w-3 h-3 mr-1" />
                View Program Profile
              </RetroButton>
            </Link>
          </div>
        </div>
      </div>
    </RetroCard>
  );
}

function OffseasonSummary({ league }: { league: LeagueDetails }) {
  const isOffseasonPhase = ["offseason", "offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"].includes(league.currentPhase);

  const { data: historyData } = useQuery<{
    history: { departureType: string; teamId: string; position: string; firstName: string; lastName: string; overall: number; departedSeason: number }[];
  }>({
    queryKey: ["/api/leagues", league.id, "player-history"],
    enabled: isOffseasonPhase && league.currentPhase !== "offseason_departures",
  });

  const { data: pendingData } = useQuery<{
    teams: Record<string, { graduates: any[]; draftDeclarations: any[]; transfers: any[]; totalLeaving: number }>;
  }>({
    queryKey: ["/api/leagues", league.id, "players-leaving"],
    enabled: isOffseasonPhase && league.currentPhase === "offseason_departures",
  });

  const { data: signingDayData } = useQuery<SigningDayData>({
    queryKey: ["/api/leagues", league.id, "signing-day"],
    enabled: isOffseasonPhase && league.currentPhase === "offseason_signing_day",
  });

  if (!isOffseasonPhase) return null;

  const userTeam = league.teams?.find(t => !t.isCpu);
  if (!userTeam) return null;

  let graduated: any[] = [];
  let drafted: any[] = [];
  let transferred: any[] = [];
  let currentSeasonDepartures: any[] = [];

  if (league.currentPhase === "offseason_departures" && pendingData?.teams) {
    const teamData = Object.values(pendingData.teams).find((t: any) => t.teamId === userTeam.id) as any;
    if (teamData) {
      graduated = (teamData.graduates || []).map((p: any) => ({ ...p, departureType: "graduated" }));
      drafted = (teamData.draftDeclarations || []).map((p: any) => ({ ...p, departureType: "draft" }));
      transferred = (teamData.transfers || []).map((p: any) => ({ ...p, departureType: "transfer_portal" }));
      currentSeasonDepartures = [...graduated, ...drafted, ...transferred];
    }
  } else {
    currentSeasonDepartures = historyData?.history?.filter(
      h => h.teamId === userTeam.id && h.departedSeason === league.currentSeason
    ) || [];
    graduated = currentSeasonDepartures.filter(h => h.departureType === "graduated");
    drafted = currentSeasonDepartures.filter(h => h.departureType === "draft");
    transferred = currentSeasonDepartures.filter(h => h.departureType === "transfer_portal");
  }

  const phaseTitle = league.currentPhase === "offseason_departures" ? "PLAYERS LEAVING" 
    : league.currentPhase === "offseason_signing_day" ? "DECISION DAY"
    : league.currentPhase === "offseason_walkons" ? "CUTS & WALK-ONS"
    : league.currentPhase?.startsWith("offseason_recruiting") ? "OFFSEASON RECRUITING"
    : "OFFSEASON";

  const phaseIcon = league.currentPhase === "offseason_departures" ? <UserMinus className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
    : league.currentPhase === "offseason_signing_day" ? <Award className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
    : league.currentPhase === "offseason_walkons" ? <UserPlus className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
    : <ScrollText className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />;
  
  return (
    <RetroCard className="border-gold/30 mb-4" data-testid="offseason-summary">
      <div className="flex items-start gap-3">
        {phaseIcon}
        <div className="flex-1">
          <p className="font-pixel text-gold text-[10px] mb-2">{phaseTitle}</p>
          
          {/* Departures phase or any phase with departure data */}
          {(league.currentPhase === "offseason_departures" || (currentSeasonDepartures.length > 0 && league.currentPhase !== "offseason_signing_day")) && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{graduated.length}</p>
                  <p className="text-[9px] text-muted-foreground">Graduated</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{drafted.length}</p>
                  <p className="text-[9px] text-muted-foreground">MLB Draft</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{transferred.length}</p>
                  <p className="text-[9px] text-muted-foreground">Transfer Portal</p>
                </div>
              </div>
              {currentSeasonDepartures.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">DEPARTING PLAYERS</p>
                  <div className="flex flex-wrap gap-1">
                    {currentSeasonDepartures.map((p, i) => (
                      <Badge key={i} variant="outline" className="text-[8px]">
                        {p.firstName[0]}. {p.lastName} ({p.position}, {p.overall} OVR) - {p.departureType === "graduated" ? "Grad" : p.departureType === "draft" ? "MLB" : "Portal"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {league.currentPhase === "offseason_departures" && (
                <div className="mt-3">
                  <Link href={`/league/${league.id}/departures`}>
                    <RetroButton
                      variant="primary"
                      size="sm"
                      data-testid="button-view-departures"
                    >
                      Review Departures
                    </RetroButton>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Recruiting phase message */}
          {league.currentPhase?.startsWith("offseason_recruiting") && currentSeasonDepartures.length === 0 && (
            <p className="text-sm text-muted-foreground">
              The offseason recruiting period is underway. Visit the Recruiting Board to recruit unsigned players and check the Transfer Portal for available transfers.
            </p>
          )}

          {league.currentPhase === "offseason_walkons" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Finalize your roster by cutting players and signing walk-ons. All teams must be ready before advancing to the new season.
              </p>
              <Link href={`/league/${league.id}/walkons`}>
                <RetroButton variant="primary" size="sm" data-testid="button-walkons-page">
                  <UserPlus className="w-3 h-3 mr-1" />
                  Manage Walk-Ons
                </RetroButton>
              </Link>
            </div>
          )}

          {league.currentPhase === "offseason_signing_day" && signingDayData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gold/10 rounded p-2 text-center">
                  <p className="font-bold text-lg text-gold">{signingDayData.totalSigned}</p>
                  <p className="text-[9px] text-muted-foreground">Recruits Signed</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{signingDayData.totalUnsigned}</p>
                  <p className="text-[9px] text-muted-foreground">Unsigned</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{signingDayData.totalRecruits}</p>
                  <p className="text-[9px] text-muted-foreground">Total Class</p>
                </div>
                {signingDayData.transferPortal && (
                  <div className="bg-blue-500/10 rounded p-2 text-center">
                    <p className="font-bold text-lg text-blue-400">{signingDayData.transferPortal.departed}</p>
                    <p className="text-[9px] text-muted-foreground">Portal Transfers</p>
                  </div>
                )}
              </div>
              
              <p className="text-[9px] text-muted-foreground mb-1">RECRUITING CLASS RANKINGS</p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {signingDayData.teamSignings.map((team, rank) => (
                  <div key={team.teamId} className="flex items-center gap-2 p-2 rounded bg-muted/20" data-testid={`signing-day-team-${team.abbreviation}`}>
                    <span className="font-pixel text-gold text-xs w-6 text-center">#{rank + 1}</span>
                    <TeamBadge abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} name={team.teamName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{team.teamName}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {team.recruits.map(r => (
                          <Badge key={r.id} variant="outline" className="text-[8px]">
                            {r.firstName[0]}. {r.lastName} ({r.position}) {"*".repeat(r.starRating || 3)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold">{team.totalRecruits}</p>
                      <p className="text-[8px] text-muted-foreground">Avg {team.avgRating}*</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/league/${league.id}/roster`}>
              <RetroButton variant="outline" size="sm" data-testid="button-offseason-roster">
                <Users className="w-3 h-3 mr-1" />
                View Roster
              </RetroButton>
            </Link>
            {league.currentPhase !== "offseason_signing_day" && league.currentPhase !== "offseason_walkons" && (
              <Link href={`/league/${league.id}/recruiting`}>
                <RetroButton variant="outline" size="sm" data-testid="button-offseason-recruiting">
                  <Target className="w-3 h-3 mr-1" />
                  Recruiting Board
                </RetroButton>
              </Link>
            )}
          </div>
        </div>
      </div>
    </RetroCard>
  );
}

function NotificationCenter({ leagueId }: { leagueId: string }) {
  const [lastSeenCount, setLastSeenCount] = useState(() =>
    parseInt(localStorage.getItem(`notif-seen-${leagueId}`) || "0", 10)
  );

  const { data: news } = useQuery<{ news: { id: string; headline: string; body: string; createdAt: string; newsType: string }[] }>({
    queryKey: ["/api/leagues", leagueId, "news"],
  });

  const { data: eventsData } = useQuery<{ events: { id: string; eventType: string; description: string; createdAt: string }[] }>({
    queryKey: ["/api/leagues", leagueId, "events"],
  });

  type NotifItem = { id: string; headline: string; body: string; createdAt: string; dotColor: string };
  const items: NotifItem[] = [
    ...(news?.news?.slice(0, 6).map(n => ({
      id: `news-${n.id}`,
      headline: n.headline,
      body: n.body,
      createdAt: n.createdAt,
      dotColor: n.newsType === "commit" ? "bg-green-500" : n.newsType === "decommit" ? "bg-red-500" : n.newsType === "transfer" ? "bg-blue-500" : "bg-gold",
    })) || []),
    ...(eventsData?.events?.slice(0, 6).map(e => ({
      id: `event-${e.id}`,
      headline: e.eventType.replace(/_/g, " "),
      body: e.description,
      createdAt: e.createdAt,
      dotColor: e.eventType === "PHASE_CHANGE" ? "bg-purple-500" : (e.eventType === "GAME_RESULT" || e.eventType === "RIVALRY_RESULT") ? "bg-blue-400" : "bg-muted-foreground",
    })) || []),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const unreadCount = Math.max(0, items.length - lastSeenCount);

  const handleOpen = (open: boolean) => {
    if (open) {
      setLastSeenCount(items.length);
      localStorage.setItem(`notif-seen-${leagueId}`, String(items.length));
    }
  };

  return (
    <Popover onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded hover:bg-gold/10 transition-colors" data-testid="button-notifications">
          <Bell className="w-5 h-5 text-muted-foreground hover:text-gold" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-card border-border p-0" align="end">
        <div className="p-3 border-b border-border">
          <span className="font-pixel text-gold text-xs">NOTIFICATIONS</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No recent notifications
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="p-3 border-b border-border/50 hover:bg-gold/5">
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.dotColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium capitalize line-clamp-1">{item.headline}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {items.length > 0 && (
          <div className="p-2 border-t border-border">
            <Link href={`/league/${leagueId}`}>
              <button className="w-full text-center text-xs text-gold hover:underline">
                View all in News tab
              </button>
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PhaseDeadline({ deadline }: { deadline: Date | string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [passed, setPassed] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const end = new Date(deadline).getTime();

  useEffect(() => {
    const diffMs = end - Date.now();
    const isNear = diffMs > 0 && diffMs < 86400000;
    const warnKey = `deadline-warned-${end}`;
    if (isNear && !localStorage.getItem(warnKey)) {
      setShowWarning(true);
      localStorage.setItem(warnKey, "1");
    }

    // #31 — browser Notification API: fire a native notification when < 1 hour remains
    const notifyKey = `deadline-notified-${end}`;
    const isVeryNear = diffMs > 0 && diffMs < 3600000;
    if (isVeryNear && !localStorage.getItem(notifyKey) && "Notification" in window) {
      localStorage.setItem(notifyKey, "1");
      const fireNotification = () => {
        const mins = Math.max(1, Math.floor(diffMs / 60000));
        new Notification("Phase Deadline — College Baseball Dynasty", {
          body: `You have ${mins} minute${mins !== 1 ? "s" : ""} left to complete your actions or you may be auto-advanced.`,
          icon: "/favicon.ico",
        });
      };
      if (Notification.permission === "granted") {
        fireNotification();
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(perm => {
          if (perm === "granted") fireNotification();
        });
      }
    }
  }, [end]);

  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setPassed(true);
        setTimeLeft("Deadline passed");
        return;
      }
      setPassed(false);
      const totalMins = Math.floor(diff / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      if (days > 0) {
        setTimeLeft(`${days}d ${remHours}h remaining`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m remaining`);
      } else {
        setTimeLeft(`${mins}m remaining`);
      }
    };
    compute();
    const interval = setInterval(compute, 60000);
    return () => clearInterval(interval);
  }, [end]);

  const diffMs = end - Date.now();
  const colorClass = passed
    ? "text-red-400"
    : diffMs < 3600000
    ? "text-red-400"
    : diffMs < 14400000
    ? "text-amber-400"
    : "text-gold";

  return (
    <>
      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-pixel text-amber-400 text-sm flex items-center gap-2">
              <Timer className="w-4 h-4" /> Phase Deadline Approaching
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            The commissioner has set a deadline for this phase. You have less than 24 hours to complete your actions — mark yourself ready or you may be auto-advanced.
          </p>
          <div className={`font-pixel text-xs mt-1 ${colorClass}`}>{timeLeft}</div>
          <RetroButton onClick={() => setShowWarning(false)} className="mt-3 w-full" data-testid="button-dismiss-deadline-warning">
            Got It
          </RetroButton>
        </DialogContent>
      </Dialog>
      <div className={`flex items-center gap-1.5 mt-1.5 text-xs ${colorClass}`} data-testid="text-phase-deadline">
        <Timer className="w-3 h-3 shrink-0" />
        <span>{timeLeft}</span>
      </div>
    </>
  );
}

function WalkonAuctionSummaryModal({ outcomes, onDismiss }: {
  outcomes: AuctionOutcome[];
  onDismiss: () => void;
}) {
  const won = outcomes.filter(r => r.won);
  const lost = outcomes.filter(r => !r.won);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent className="bg-card border-gold/30 max-w-lg max-h-[80vh] overflow-y-auto" data-testid="modal-auction-summary">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Gavel className="w-4 h-4 text-gold" />
            Walk-On Auction Results
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground mb-4">
          Here's a summary of your results from the walk-on auction.
          {won.length > 0 && lost.length > 0 && ` You signed ${won.length} player${won.length !== 1 ? "s" : ""} and were outbid on ${lost.length}.`}
          {won.length > 0 && lost.length === 0 && ` You won all ${won.length} bid${won.length !== 1 ? "s" : ""}.`}
          {won.length === 0 && lost.length > 0 && ` You were outbid on all ${lost.length} player${lost.length !== 1 ? "s" : ""}.`}
        </p>

        {won.length > 0 && (
          <div className="mb-4">
            <h3 className="font-pixel text-[9px] text-green-400 mb-2 uppercase">Signed</h3>
            <div className="space-y-1.5">
              {won.map(r => (
                <div
                  key={r.walkonId}
                  className="flex items-center justify-between p-2 rounded bg-green-900/10 border border-green-700/30"
                  data-testid={`auction-won-${r.walkonId}`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                      <p className="text-[9px] text-muted-foreground">{r.position} · {r.overall} OVR</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-400">{fmtKLeague(r.pricePaid)}</p>
                    <p className="text-[8px] text-muted-foreground">your bid: {fmtKLeague(r.yourBid)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lost.length > 0 && (
          <div className="mb-4">
            <h3 className="font-pixel text-[9px] text-red-400 mb-2 uppercase">Outbid On</h3>
            <div className="space-y-1.5">
              {lost.map(r => (
                <div
                  key={r.walkonId}
                  className="flex items-center justify-between p-2 rounded bg-red-900/10 border border-red-700/30"
                  data-testid={`auction-lost-${r.walkonId}`}
                >
                  <div className="flex items-center gap-2">
                    <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{r.firstName} {r.lastName}</p>
                      <p className="text-[9px] text-muted-foreground">{r.position} · {r.overall} OVR</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground">won by {r.winnerTeamName}</p>
                    <p className="text-sm font-medium text-red-400">{fmtKLeague(r.pricePaid)}</p>
                    <p className="text-[8px] text-muted-foreground">your bid: {fmtKLeague(r.yourBid)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <RetroButton
          onClick={onDismiss}
          className="w-full mt-2"
          data-testid="button-dismiss-auction-summary"
        >
          Got It
        </RetroButton>
      </DialogContent>
    </Dialog>
  );
}
