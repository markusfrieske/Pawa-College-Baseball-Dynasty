import { useState, useMemo } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";

import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Calendar, Check, Edit2, Lock, Play, FileText, AlertTriangle, CheckCircle, XCircle, Swords, User, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Game, Team } from "@shared/schema";

interface GameWithTeams extends Game {
  homeTeam: Team;
  awayTeam: Team;
}

interface GameReport {
  id: string;
  gameId: string;
  reporterUserId: string;
  reporterTeamId: string;
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  status: string;
  disputeReason: string | null;
}

interface ScheduleData {
  games: GameWithTeams[];
  currentWeek: number;
  currentSeason: number;
  currentPhase: string;
  userTeamId: string | null;
  humanTeamIds: string[];
  humanCoachNames: Record<string, string>;
  reportsByGameId: Record<string, GameReport>;
  isCommissioner: boolean;
}

interface BoxScoreBatter {
  name: string; position: string; ab: number; r: number; h: number;
  doubles?: number; triples?: number; hr?: number;
  rbi: number; bb: number; hbp?: number; so: number; sb?: number; avg: string;
}

interface BoxScorePitcher {
  name: string; ip: string; h: number; r: number; er: number;
  bb: number; so: number; hr?: number; era: string;
}

interface BoxScoreTotals {
  ab: number; r: number; h: number; doubles?: number; triples?: number; hr?: number;
  rbi: number; bb: number; hbp?: number; so: number; sb?: number;
}

interface BoxScoreTeam {
  batting: BoxScoreBatter[];
  pitching: BoxScorePitcher[];
  totals: BoxScoreTotals;
  errors?: number;
}

interface BoxScoreData {
  innings: number[][];
  home: BoxScoreTeam;
  away: BoxScoreTeam;
}

interface MatchupPreviewTeam {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  mascot: string;
  prestige: number;
  isCpu: boolean;
  coachName: string;
  coachArchetype: string | null;
  record: { wins: number; losses: number };
  powerRank: number;
  composite: number;
  top3: { name: string; position: string; overall: number; starRating: number }[];
}

interface MatchupPreviewData {
  homeTeam: MatchupPreviewTeam;
  awayTeam: MatchupPreviewTeam;
  h2h: { homeWins: number; awayWins: number; totalGames: number };
  game: { id: string; isComplete: boolean; isConference: boolean; gameType: string | null; week: number; season: number };
}

interface SeriesGroup {
  key: string;
  homeTeam: Team;
  awayTeam: Team;
  games: GameWithTeams[];
  isUserSeries: boolean;
}

interface WeekData {
  weekNum: number;
  label: string;
  isCurrentWeek: boolean;
  sortOrder: number;
  series: SeriesGroup[];
  midweekGames: GameWithTeams[];
  postseasonGames: GameWithTeams[];
  isPostseason: boolean;
}

const GAME_TYPE_ORDER = ["friday", "saturday", "sunday"];

const CONF_COLORS: Record<string, string> = {
  SEC: "#002D72",
  ACC: "#003087",
  "Big Ten": "#0032A0",
  "Big 12": "#00205B",
  "Pac-12": "#003DA5",
  AAC: "#007A53",
  "Sun Belt": "#003087",
  WCC: "#6B1D3E",
  "Big West": "#00539C",
  "Missouri Valley": "#5B2C6B",
  "Ivy League": "#006438",
  HBCU: "#1A1A1A",
};

function getConfColor(team: Team): string {
  return team.primaryColor || "#555";
}

function buildSeriesKey(game: GameWithTeams): string {
  const ids = [game.homeTeamId, game.awayTeamId].sort();
  return `${game.week}_${ids[0]}_${ids[1]}`;
}

function buildWeeks(games: GameWithTeams[], userTeamId: string | null, currentWeek: number): WeekData[] {
  const phaseLabels: Record<string, string> = {
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
  };

  const weekMap = new Map<string, WeekData>();

  for (const game of games) {
    const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(game.phase || "");
    const groupKey = isPostseason ? game.phase! : `week_${game.week}`;

    if (!weekMap.has(groupKey)) {
      weekMap.set(groupKey, {
        weekNum: game.week ?? 0,
        label: isPostseason ? (phaseLabels[game.phase!] || game.phase!) : `Week ${game.week}`,
        isCurrentWeek: !isPostseason && game.week === currentWeek,
        sortOrder: isPostseason
          ? 1000 + (game.phase === "conference_championship" ? 1 : game.phase === "super_regionals" ? 2 : 3)
          : game.week ?? 0,
        series: [],
        midweekGames: [],
        postseasonGames: [],
        isPostseason,
      });
    }

    const weekData = weekMap.get(groupKey)!;

    if (isPostseason) {
      weekData.postseasonGames.push(game);
    } else if (game.gameType === "midweek" || !game.isConference) {
      weekData.midweekGames.push(game);
    } else {
      // Conference game — group into series
      const seriesKey = buildSeriesKey(game);
      let seriesGroup = weekData.series.find(s => s.key === seriesKey);
      if (!seriesGroup) {
        seriesGroup = {
          key: seriesKey,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          games: [],
          isUserSeries: userTeamId
            ? game.homeTeamId === userTeamId || game.awayTeamId === userTeamId
            : false,
        };
        weekData.series.push(seriesGroup);
      }
      seriesGroup.games.push(game);
    }
  }

  // Sort games within each series
  for (const weekData of weekMap.values()) {
    for (const series of weekData.series) {
      series.games.sort((a, b) => {
        const ai = GAME_TYPE_ORDER.indexOf(a.gameType || "");
        const bi = GAME_TYPE_ORDER.indexOf(b.gameType || "");
        return ai - bi;
      });
    }
  }

  return Array.from(weekMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

function getSeriesOutcome(series: SeriesGroup, userTeamId: string | null): {
  complete: boolean;
  homeWins: number;
  awayWins: number;
  text: string;
  userWon: boolean | null;
} {
  const completedGames = series.games.filter(g => g.isComplete);
  const allComplete = completedGames.length === series.games.length && series.games.length > 0;

  let homeWins = 0;
  let awayWins = 0;
  for (const g of completedGames) {
    if ((g.homeScore ?? 0) > (g.awayScore ?? 0)) homeWins++;
    else awayWins++;
  }

  let text = "";
  let userWon: boolean | null = null;

  if (allComplete && series.games.length >= 2) {
    const homeAbbr = series.homeTeam.abbreviation;
    const awayAbbr = series.awayTeam.abbreviation;
    if (homeWins === series.games.length) {
      text = `${homeAbbr} swept`;
    } else if (awayWins === series.games.length) {
      text = `${awayAbbr} swept`;
    } else {
      const winner = homeWins > awayWins ? homeAbbr : awayAbbr;
      text = `${winner} won series ${Math.max(homeWins, awayWins)}-${Math.min(homeWins, awayWins)}`;
    }

    if (userTeamId) {
      if (series.homeTeam.id === userTeamId) userWon = homeWins > awayWins;
      else if (series.awayTeam.id === userTeamId) userWon = awayWins > homeWins;
    }
  } else if (allComplete && series.games.length === 1) {
    const g = completedGames[0];
    const winner = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? series.homeTeam.abbreviation : series.awayTeam.abbreviation;
    text = `${winner} won`;
    if (userTeamId) {
      if (series.homeTeam.id === userTeamId) userWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
      else if (series.awayTeam.id === userTeamId) userWon = (g.awayScore ?? 0) > (g.homeScore ?? 0);
    }
  }

  return { complete: allComplete, homeWins, awayWins, text, userWon };
}

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [boxScoreGame, setBoxScoreGame] = useState<GameWithTeams | null>(null);
  const [showMyTeam, setShowMyTeam] = useState(true);
  const [disputeGameId, setDisputeGameId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [matchupPreviewGameId, setMatchupPreviewGameId] = useState<string | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ScheduleData>({
    queryKey: ["/api/leagues", id, "schedule"],
  });

  const confirmReportMutation = useMutation({
    mutationFn: async (gameId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/games/${gameId}/report/confirm`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      toast({ title: "Report Confirmed", description: "Game result has been finalized." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const disputeReportMutation = useMutation({
    mutationFn: async ({ gameId, reason }: { gameId: string; reason: string }) => {
      return apiRequest("POST", `/api/leagues/${id}/games/${gameId}/report/dispute`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      toast({ title: "Report Disputed", description: "Commissioner will review the discrepancy." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const simExhibitionMutation = useMutation({
    mutationFn: async (gameId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/games/${gameId}/play-by-play`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      toast({ title: "Game Simulated", description: "Exhibition game has been auto-simulated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const filteredGames = useMemo(() => {
    const all = showMyTeam && data?.userTeamId
      ? (data?.games || []).filter(g => g.homeTeamId === data.userTeamId || g.awayTeamId === data.userTeamId)
      : (data?.games || []);
    return all.filter(g => g.phase !== "exhibition");
  }, [showMyTeam, data]);

  const exhibitionGames = useMemo(() => {
    if (!data?.games) return [];
    const all = showMyTeam && data?.userTeamId
      ? data.games.filter(g => g.homeTeamId === data.userTeamId || g.awayTeamId === data.userTeamId)
      : data.games;
    return all.filter(g => g.phase === "exhibition");
  }, [showMyTeam, data]);

  const weeks = useMemo(
    () => buildWeeks(filteredGames, data?.userTeamId ?? null, data?.currentWeek ?? 0),
    [filteredGames, data?.userTeamId, data?.currentWeek]
  );

  const regularWeeks = weeks.filter(w => !w.isPostseason);
  const postseasonWeeks = weeks.filter(w => w.isPostseason);

  const currentWeekKey = useMemo(() => {
    // Auto-select spring training tab when the league is in preseason/spring_training and exhibition games exist
    const inSpringTraining = (data?.currentPhase === "preseason" || data?.currentPhase === "spring_training") && exhibitionGames.length > 0;
    if (inSpringTraining) return "spring_training";
    const cur = regularWeeks.find(w => w.isCurrentWeek);
    return cur ? `week_${cur.weekNum}` : (regularWeeks[0] ? `week_${regularWeeks[0].weekNum}` : null);
  }, [regularWeeks, exhibitionGames, data?.currentWeek, data?.currentPhase]);

  const activeKey = selectedWeekKey ?? currentWeekKey;

  const activeWeeks = useMemo(() => {
    if (!activeKey) return weeks;
    if (activeKey === "spring_training") return [];
    const match = weeks.find(w => (!w.isPostseason ? `week_${w.weekNum}` : w.label) === activeKey);
    if (match) return [match, ...postseasonWeeks.filter(w => `week_${w.weekNum}` !== activeKey)].filter(Boolean);
    const postMatch = postseasonWeeks.find(w => w.label === activeKey);
    return postMatch ? [postMatch] : weeks;
  }, [activeKey, weeks, postseasonWeeks]);

  // Compute team records from ALL games (not just filtered) for accurate display
  const teamRecords = useMemo(
    () => computeTeamRecords(data?.games || []),
    [data?.games]
  );

  if (isLoading) return <ScheduleSkeleton />;

  const gameCallbacks = {
    onViewBoxScore: (game: GameWithTeams) => setBoxScoreGame(game),
    onMatchupPreview: (gameId: string) => setMatchupPreviewGameId(gameId),
    onConfirm: (gameId: string) => confirmReportMutation.mutate(gameId),
    onDispute: (gameId: string) => { setDisputeGameId(gameId); setDisputeReason(""); },
    isConfirming: confirmReportMutation.isPending,
    isDisputing: disputeReportMutation.isPending,
    userTeamId: data?.userTeamId ?? null,
    leagueId: id!,
    humanTeamIds: data?.humanTeamIds ?? [],
    humanCoachNames: data?.humanCoachNames ?? {},
    reportsByGameId: data?.reportsByGameId ?? {},
    isCommissioner: data?.isCommissioner,
    teamRecords,
    isUserGame: (game: GameWithTeams) =>
      !!(data?.userTeamId && (game.homeTeamId === data.userTeamId || game.awayTeamId === data.userTeamId)),
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-10 bg-background">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4 justify-between flex-wrap gap-y-2">
            <div className="flex items-center gap-4">
              <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="font-pixel text-gold text-lg">Schedule</h1>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {data?.userTeamId && (
                <div className="flex items-center gap-1">
                  <RetroButton
                    variant={showMyTeam ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setShowMyTeam(true)}
                    data-testid="button-my-team-schedule"
                  >
                    My Schedule
                  </RetroButton>
                  <RetroButton
                    variant={!showMyTeam ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setShowMyTeam(false)}
                    data-testid="button-all-games-schedule"
                  >
                    All Games
                  </RetroButton>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>S{data?.currentSeason} · {data?.currentPhase === "preseason" || data?.currentPhase === "spring_training" ? "Spring Training" : `Wk ${data?.currentWeek}`}</span>
              </div>
            </div>
          </div>

          {(regularWeeks.length > 0 || exhibitionGames.length > 0) && (
            <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1 hide-scrollbar">
              {exhibitionGames.length > 0 && (
                <button
                  onClick={() => setSelectedWeekKey("spring_training")}
                  data-testid="button-week-nav-spr"
                  className={`shrink-0 font-pixel text-[8px] px-2 py-1 rounded transition-colors ${
                    activeKey === "spring_training"
                      ? "bg-gold text-black"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30"
                  }`}
                >
                  SPR
                </button>
              )}
              {regularWeeks.map(w => {
                const key = `week_${w.weekNum}`;
                const isActive = activeKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedWeekKey(key)}
                    data-testid={`button-week-nav-${w.weekNum}`}
                    className={`shrink-0 font-pixel text-[8px] px-2 py-1 rounded transition-colors ${
                      isActive
                        ? "bg-gold text-black"
                        : w.isCurrentWeek
                        ? "bg-gold/20 text-gold border border-gold/40"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    Wk {w.weekNum}
                  </button>
                );
              })}
              {postseasonWeeks.map(w => {
                const key = w.label;
                const isActive = activeKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedWeekKey(key)}
                    data-testid={`button-week-nav-postseason-${w.label}`}
                    className={`shrink-0 font-pixel text-[7px] px-2 py-1 rounded transition-colors ${
                      isActive ? "bg-gold text-black" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {w.label.split(" ").map(word => word[0]).join("")}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
        {exhibitionGames.length > 0 && activeKey === "spring_training" && (
          <div className="rounded-lg border border-border/50 bg-card/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-card/50">
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[9px] text-muted-foreground uppercase tracking-wider">Spring</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-pixel border border-amber-500/40 text-amber-400 bg-amber-500/10">
                  EXHIBITION
                </span>
              </div>
              <span className="font-pixel text-[8px] text-muted-foreground">
                {exhibitionGames.filter(g => g.isComplete).length}/{exhibitionGames.length} Complete
              </span>
            </div>
            <div className="divide-y divide-border/20">
              {exhibitionGames.map(game => {
                const isUserExhibGame = !!(data?.userTeamId && (game.homeTeamId === data.userTeamId || game.awayTeamId === data.userTeamId));
                const exhibReport = data?.reportsByGameId?.[game.id] ?? null;
                return (
                  <div key={game.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <TeamBadge
                        abbreviation={game.awayTeam.abbreviation}
                        primaryColor={game.awayTeam.primaryColor}
                        secondaryColor={game.awayTeam.secondaryColor}
                        name={game.awayTeam.name}
                        size="xs"
                      />
                      <span className="font-pixel text-[9px] text-muted-foreground truncate hidden sm:block">{game.awayTeam.name}</span>
                    </div>
                    <div className="w-12 text-center shrink-0">
                      {game.isComplete ? (
                        <button
                          onClick={() => setBoxScoreGame(game)}
                          className="font-pixel text-[10px] text-foreground hover:text-gold transition-colors"
                          data-testid={`button-box-score-exhb-${game.id}`}
                        >
                          {game.awayScore}–{game.homeScore}
                        </button>
                      ) : (
                        <span className="font-pixel text-[8px] text-muted-foreground">vs</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                      <span className="font-pixel text-[9px] text-muted-foreground truncate hidden sm:block">{game.homeTeam.name}</span>
                      <TeamBadge
                        abbreviation={game.homeTeam.abbreviation}
                        primaryColor={game.homeTeam.primaryColor}
                        secondaryColor={game.homeTeam.secondaryColor}
                        name={game.homeTeam.name}
                        size="xs"
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {game.isComplete && (
                        <RetroButton variant="outline" size="sm" onClick={() => setBoxScoreGame(game)} data-testid={`button-box-score-action-exhb-${game.id}`} title="View Box Score">
                          <Check className="w-3 h-3" />
                        </RetroButton>
                      )}
                      {!game.isComplete && isUserExhibGame && !exhibReport && (
                        <Link href={`/league/${id}/report-game/${game.id}`}>
                          <RetroButton variant="outline" size="sm" title="Report Game Result" data-testid={`button-report-exhb-${game.id}`}>
                            <FileText className="w-3 h-3" />
                          </RetroButton>
                        </Link>
                      )}
                      {!game.isComplete && (
                        <Link href={`/league/${id}/game/${game.id}/play-by-play`}>
                          <RetroButton variant="outline" size="sm" title="Play by Play" data-testid={`button-pbp-exhb-${game.id}`}>
                            <Play className="w-3 h-3" />
                          </RetroButton>
                        </Link>
                      )}
                      {!game.isComplete && data?.isCommissioner && (
                        <RetroButton
                          variant="outline"
                          size="sm"
                          title="Simulate Game"
                          data-testid={`button-sim-exhb-${game.id}`}
                          disabled={simExhibitionMutation.isPending}
                          onClick={() => simExhibitionMutation.mutate(game.id)}
                        >
                          <Swords className="w-3 h-3" />
                        </RetroButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeWeeks.map(weekData => (
          <WeekCard
            key={weekData.isPostseason ? weekData.label : `week_${weekData.weekNum}`}
            weekData={weekData}
            callbacks={gameCallbacks}
          />
        ))}

        {weeks.length === 0 && (
          <RetroCard variant="bordered" className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No games scheduled yet</p>
          </RetroCard>
        )}
      </main>

      <BoxScoreModal game={boxScoreGame} onClose={() => setBoxScoreGame(null)} />

      <Dialog open={!!disputeGameId} onOpenChange={open => { if (!open) setDisputeGameId(null); }}>
        <DialogContent className="bg-[#1a2e1a] border-gold/50 max-w-md" data-testid="dialog-dispute-reason">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Dispute Reported Score</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Explain why the reported score is incorrect. The commissioner will review and resolve the dispute.
            </p>
            <textarea
              value={disputeReason}
              onChange={e => setDisputeReason(e.target.value)}
              placeholder="e.g. Final score was 5-3, not 4-3 as reported..."
              maxLength={500}
              rows={4}
              className="w-full text-sm bg-muted/40 border border-border rounded p-2 focus:outline-none focus:border-gold text-foreground resize-none"
              data-testid="textarea-dispute-reason"
            />
            <div className="flex gap-3 justify-end">
              <RetroButton variant="outline" size="sm" onClick={() => setDisputeGameId(null)} data-testid="button-cancel-dispute">
                Cancel
              </RetroButton>
              <RetroButton
                variant="primary"
                size="sm"
                disabled={!disputeReason.trim() || disputeReportMutation.isPending}
                onClick={() => {
                  if (disputeGameId && disputeReason.trim()) {
                    disputeReportMutation.mutate({ gameId: disputeGameId, reason: disputeReason.trim() });
                    setDisputeGameId(null);
                  }
                }}
                data-testid="button-submit-dispute"
              >
                Submit Dispute
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MatchupPreviewModal
        leagueId={id!}
        gameId={matchupPreviewGameId}
        onClose={() => setMatchupPreviewGameId(null)}
      />
    </div>
  );
}

type GameCallbacks = {
  onViewBoxScore: (game: GameWithTeams) => void;
  onMatchupPreview: (gameId: string) => void;
  onConfirm: (gameId: string) => void;
  onDispute: (gameId: string) => void;
  isConfirming: boolean;
  isDisputing: boolean;
  userTeamId: string | null;
  leagueId: string;
  humanTeamIds: string[];
  humanCoachNames: Record<string, string>;
  reportsByGameId: Record<string, GameReport>;
  isCommissioner?: boolean;
  teamRecords: Map<string, { wins: number; losses: number }>;
  isUserGame: (game: GameWithTeams) => boolean;
};

function computeTeamRecords(games: GameWithTeams[]): Map<string, { wins: number; losses: number }> {
  const records = new Map<string, { wins: number; losses: number }>();
  const ensure = (id: string) => { if (!records.has(id)) records.set(id, { wins: 0, losses: 0 }); };
  for (const g of games) {
    if (!g.isComplete) continue;
    ensure(g.homeTeamId); ensure(g.awayTeamId);
    if ((g.homeScore ?? 0) > (g.awayScore ?? 0)) {
      records.get(g.homeTeamId)!.wins++;
      records.get(g.awayTeamId)!.losses++;
    } else {
      records.get(g.awayTeamId)!.wins++;
      records.get(g.homeTeamId)!.losses++;
    }
  }
  return records;
}

function WeekCard({ weekData, callbacks }: { weekData: WeekData; callbacks: GameCallbacks }) {
  const [collapsed, setCollapsed] = useState(false);
  const totalGames = weekData.series.length + weekData.midweekGames.length + weekData.postseasonGames.length;
  const completedCount = [
    ...weekData.series.flatMap(s => s.games),
    ...weekData.midweekGames,
    ...weekData.postseasonGames,
  ].filter(g => g.isComplete).length;
  const totalCount = [
    ...weekData.series.flatMap(s => s.games),
    ...weekData.midweekGames,
    ...weekData.postseasonGames,
  ].length;

  return (
    <RetroCard data-testid={`card-week-${weekData.isPostseason ? weekData.label : weekData.weekNum}`}>
      <RetroCardHeader
        className="flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-white/5 transition-colors rounded-t"
        onClick={() => setCollapsed(c => !c)}
        data-testid={`button-collapse-week-${weekData.isPostseason ? weekData.label : weekData.weekNum}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
          <span>{weekData.label}</span>
          {weekData.isCurrentWeek && (
            <span className="text-[8px] text-gold bg-gold/20 px-2 py-1 rounded">Current</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <span className="font-pixel text-[8px] text-muted-foreground">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
      </RetroCardHeader>

      {!collapsed && (
        <RetroCardContent>
          {weekData.postseasonGames.length > 0 && (
            <div className="space-y-3">
              {weekData.postseasonGames.map(game => (
                <StandaloneGameRow
                  key={game.id}
                  game={game}
                  allGames={weekData.postseasonGames}
                  callbacks={callbacks}
                  badge={null}
                />
              ))}
            </div>
          )}

          {weekData.midweekGames.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-pixel text-[8px] text-muted-foreground">MIDWEEK</span>
                <div className="flex-1 border-t border-border/30" />
              </div>
              {weekData.midweekGames.map(game => (
                <StandaloneGameRow
                  key={game.id}
                  game={game}
                  allGames={weekData.midweekGames}
                  callbacks={callbacks}
                  badge={null}
                />
              ))}
            </div>
          )}

          {weekData.series.length > 0 && (
            <div className={`space-y-3 ${weekData.midweekGames.length > 0 ? "mt-4 pt-3 border-t border-border/40" : ""}`}>
              {weekData.midweekGames.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-pixel text-[8px] text-muted-foreground">CONF SERIES</span>
                  <div className="flex-1 border-t border-border/30" />
                </div>
              )}
              {weekData.series.map(series => (
                <SeriesRow
                  key={series.key}
                  series={series}
                  callbacks={callbacks}
                />
              ))}
            </div>
          )}

          {totalGames === 0 && (
            <p className="text-muted-foreground text-sm text-center py-4">No games this week</p>
          )}
        </RetroCardContent>
      )}
    </RetroCard>
  );
}

function SeriesRow({ series, callbacks }: { series: SeriesGroup; callbacks: GameCallbacks }) {
  const [expanded, setExpanded] = useState(true);
  const outcome = getSeriesOutcome(series, callbacks.userTeamId);
  const confColor = getConfColor(series.homeTeam);

  const completedGames = series.games.filter(g => g.isComplete);
  const allComplete = outcome.complete;

  const userIsHome = callbacks.userTeamId === series.homeTeam.id;
  const userIsAway = callbacks.userTeamId === series.awayTeam.id;
  const isUserSeries = userIsHome || userIsAway;

  const seriesBg = allComplete && isUserSeries
    ? outcome.userWon ? "bg-green-900/10 border-l-2 border-green-700/40" : "bg-red-900/10 border-l-2 border-red-700/40"
    : "bg-muted/20";

  return (
    <div className="rounded overflow-hidden" data-testid={`series-${series.key}`}>
      <div
        className={`${seriesBg} rounded`}
        style={!isUserSeries || !allComplete ? { borderLeft: `3px solid ${confColor}40` } : undefined}
      >
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors"
          onClick={() => setExpanded(e => !e)}
          data-testid={`button-expand-series-${series.key}`}
        >
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>

          <TeamBadge
            abbreviation={series.awayTeam.abbreviation}
            primaryColor={series.awayTeam.primaryColor}
            secondaryColor={series.awayTeam.secondaryColor}
            name={series.awayTeam.name}
            size="sm"
          />

          <div className="flex-1 flex items-center gap-1.5 min-w-0 text-left">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <Link
                  href={`/league/${callbacks.leagueId}/team/${series.awayTeam.id}/profile`}
                  onClick={e => e.stopPropagation()}
                  className="font-medium text-sm truncate hover:text-gold transition-colors"
                  data-testid={`link-away-team-series-${series.key}`}
                >
                  {series.awayTeam.name}
                </Link>
                {(() => {
                  const rec = callbacks.teamRecords.get(series.awayTeam.id);
                  return rec ? (
                    <span className="font-pixel text-[7px] text-muted-foreground shrink-0" data-testid={`record-away-series-${series.key}`}>
                      {rec.wins}-{rec.losses}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
            <span className="text-muted-foreground text-xs shrink-0">@</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <Link
                  href={`/league/${callbacks.leagueId}/team/${series.homeTeam.id}/profile`}
                  onClick={e => e.stopPropagation()}
                  className="font-medium text-sm truncate hover:text-gold transition-colors"
                  data-testid={`link-home-team-series-${series.key}`}
                >
                  {series.homeTeam.name}
                </Link>
                {(() => {
                  const rec = callbacks.teamRecords.get(series.homeTeam.id);
                  return rec ? (
                    <span className="font-pixel text-[7px] text-muted-foreground shrink-0" data-testid={`record-home-series-${series.key}`}>
                      {rec.wins}-{rec.losses}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          </div>

          <TeamBadge
            abbreviation={series.homeTeam.abbreviation}
            primaryColor={series.homeTeam.primaryColor}
            secondaryColor={series.homeTeam.secondaryColor}
            name={series.homeTeam.name}
            size="sm"
          />

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[8px] border-blue-600/50 text-blue-400 font-pixel hidden sm:inline-flex">
              CONF
            </Badge>

            {completedGames.length > 0 && !allComplete && (
              <span className="font-pixel text-[8px] text-muted-foreground">
                {outcome.awayWins}-{outcome.homeWins}
              </span>
            )}

            {allComplete && outcome.text && (
              <span
                className={`font-pixel text-[8px] ${
                  isUserSeries
                    ? outcome.userWon ? "text-green-400" : "text-red-400"
                    : "text-gold"
                }`}
                data-testid={`series-outcome-${series.key}`}
              >
                {outcome.text}
              </span>
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border/30 space-y-0.5 pb-1">
            {series.games.map(game => (
              <CompactGameRow
                key={game.id}
                game={game}
                allGames={series.games}
                callbacks={callbacks}
                dayLabel={game.gameType ? game.gameType.charAt(0).toUpperCase() + game.gameType.slice(1) : ""}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompactGameRow({
  game,
  allGames,
  callbacks,
  dayLabel,
}: {
  game: GameWithTeams;
  allGames: GameWithTeams[];
  callbacks: GameCallbacks;
  dayLabel: string;
}) {
  const report = callbacks.reportsByGameId[game.id] ?? null;
  const userTeamId = callbacks.userTeamId;
  const isUserGame = userTeamId
    ? game.homeTeamId === userTeamId || game.awayTeamId === userTeamId
    : false;
  const userWon = isUserGame && game.isComplete && (
    (game.homeTeamId === userTeamId && (game.homeScore ?? 0) > (game.awayScore ?? 0)) ||
    (game.awayTeamId === userTeamId && (game.awayScore ?? 0) > (game.homeScore ?? 0))
  );

  const isHumanVsHuman = callbacks.humanTeamIds.includes(game.homeTeamId) && callbacks.humanTeamIds.includes(game.awayTeamId);

  const gameTypeOrder = ["friday", "saturday", "sunday"];
  const currentIdx = game.gameType ? gameTypeOrder.indexOf(game.gameType) : -1;
  const isSeriesLocked = !game.isComplete && game.isConference && currentIdx > 0 && (() => {
    for (let i = 0; i < currentIdx; i++) {
      const priorGame = allGames.find(g => g.gameType === gameTypeOrder[i]);
      if (priorGame && !priorGame.isComplete) return true;
    }
    return false;
  })();

  const userIsOpposingTeam = report && userTeamId && report.reporterTeamId !== userTeamId &&
    (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId);

  return (
    <div data-testid={`card-game-${game.id}`}>
      <div className={`flex items-center gap-2 px-3 py-2 text-sm ${
        game.isComplete && isUserGame
          ? userWon ? "bg-green-900/10" : "bg-red-900/10"
          : "hover:bg-white/3"
      }`}>
        <span className="font-pixel text-[7px] text-muted-foreground w-9 shrink-0">{dayLabel}</span>

        {game.isComplete ? (
          <button
            onClick={() => callbacks.onViewBoxScore(game)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            data-testid={`button-box-score-${game.id}`}
          >
            <span className={`font-mono text-sm font-bold ${(game.awayScore ?? 0) > (game.homeScore ?? 0) ? "text-gold" : "text-muted-foreground"}`} data-testid={`score-away-${game.id}`}>
              {game.awayScore}
            </span>
            <span className="text-muted-foreground text-xs">-</span>
            <span className={`font-mono text-sm font-bold ${(game.homeScore ?? 0) > (game.awayScore ?? 0) ? "text-gold" : "text-muted-foreground"}`} data-testid={`score-home-${game.id}`}>
              {game.homeScore}
            </span>
            {isUserGame && (
              <Badge
                variant="outline"
                className={`text-[8px] ${userWon ? "border-green-600 text-green-400" : "border-red-600 text-red-400"}`}
                data-testid={`badge-result-${game.id}`}
              >
                {userWon ? "W" : "L"}
              </Badge>
            )}
            {game.isManuallyReported && (
              <Badge variant="outline" className="text-[8px] border-blue-600 text-blue-400">R</Badge>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs">vs</span>
            {report?.status === "pending" && (
              <Badge variant="outline" className="text-[8px] border-yellow-600 text-yellow-400" data-testid={`badge-report-pending-${game.id}`}>PENDING</Badge>
            )}
            {report?.status === "disputed" && (
              <Badge variant="outline" className="text-[8px] border-red-600 text-red-400" data-testid={`badge-report-disputed-${game.id}`}>DISPUTED</Badge>
            )}
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          {!game.isComplete && callbacks.isUserGame(game) && !report && (
            isSeriesLocked ? (
              <RetroButton variant="outline" size="sm" disabled className="opacity-40 cursor-not-allowed" data-testid={`button-report-locked-${game.id}`}>
                <Lock className="w-3 h-3" />
              </RetroButton>
            ) : (
              <Link href={`/league/${callbacks.leagueId}/report-game/${game.id}`}>
                <RetroButton variant="outline" size="sm" title="Report Game Result" data-testid={`button-report-${game.id}`}>
                  <FileText className="w-3 h-3" />
                </RetroButton>
              </Link>
            )
          )}
          {callbacks.isCommissioner && report && !game.isComplete && (
            <Link href={`/league/${callbacks.leagueId}/report-game/${game.id}?mode=edit`}>
              <RetroButton variant="outline" size="sm" title="Edit Submitted Report" data-testid={`button-edit-report-${game.id}`}>
                <Edit2 className="w-3 h-3" />
              </RetroButton>
            </Link>
          )}
          {!game.isComplete && (
            isSeriesLocked ? (
              <RetroButton variant="outline" size="sm" disabled className="opacity-40 cursor-not-allowed" data-testid={`button-pbp-locked-${game.id}`}>
                <Lock className="w-3 h-3" />
              </RetroButton>
            ) : (
              <Link href={`/league/${callbacks.leagueId}/game/${game.id}/play-by-play`}>
                <RetroButton variant="outline" size="sm" title="Play by Play" data-testid={`button-pbp-${game.id}`}>
                  <Play className="w-3 h-3" />
                </RetroButton>
              </Link>
            )
          )}
          {game.isComplete && (
            <RetroButton variant="outline" size="sm" onClick={() => callbacks.onViewBoxScore(game)} data-testid={`button-box-score-action-${game.id}`} title="View Box Score">
              <Check className="w-3 h-3" />
            </RetroButton>
          )}
        </div>
      </div>

      {!game.isComplete && report && isUserGame && (
        <div className={`flex items-center gap-3 mx-3 mb-1.5 px-3 py-1.5 rounded text-xs ${
          report.status === "disputed" ? "bg-red-900/20 border border-red-800/30" : "bg-yellow-900/20 border border-yellow-700/30"
        }`} data-testid={`report-status-${game.id}`}>
          {report.status === "pending" && <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />}
          {report.status === "disputed" && <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
          <div className="flex-1">
            {report.status === "pending" && (
              <span className="text-yellow-300">
                Score reported: {report.awayScore} - {report.homeScore}. Awaiting confirmation.
              </span>
            )}
            {report.status === "disputed" && (
              <span className="text-red-300">Disputed. Commissioner will resolve.</span>
            )}
          </div>
          {report.status === "pending" && userIsOpposingTeam && (
            <div className="flex gap-1.5">
              <RetroButton size="sm" variant="primary" onClick={() => callbacks.onConfirm(game.id)} disabled={callbacks.isConfirming} data-testid={`button-confirm-report-${game.id}`}>
                <CheckCircle className="w-3 h-3 mr-1" /> Confirm
              </RetroButton>
              <RetroButton size="sm" variant="outline" onClick={() => callbacks.onDispute(game.id)} disabled={callbacks.isDisputing} data-testid={`button-dispute-report-${game.id}`} className="border-red-600 text-red-400 hover:bg-red-900/20">
                <XCircle className="w-3 h-3 mr-1" /> Dispute
              </RetroButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StandaloneGameRow({
  game,
  allGames,
  callbacks,
  badge,
}: {
  game: GameWithTeams;
  allGames: GameWithTeams[];
  callbacks: GameCallbacks;
  badge: string | null;
}) {
  const report = callbacks.reportsByGameId[game.id] ?? null;
  const userTeamId = callbacks.userTeamId;
  const isUserGame = userTeamId
    ? game.homeTeamId === userTeamId || game.awayTeamId === userTeamId
    : false;
  const userWon = isUserGame && game.isComplete && (
    (game.homeTeamId === userTeamId && (game.homeScore ?? 0) > (game.awayScore ?? 0)) ||
    (game.awayTeamId === userTeamId && (game.awayScore ?? 0) > (game.homeScore ?? 0))
  );
  const userLost = isUserGame && game.isComplete && !userWon;

  const isHumanVsHuman = callbacks.humanTeamIds.includes(game.homeTeamId) && callbacks.humanTeamIds.includes(game.awayTeamId);
  const userIsOpposingTeam = report && userTeamId && report.reporterTeamId !== userTeamId &&
    (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId);

  const gameTypeOrder = ["friday", "saturday", "sunday"];
  const currentIdx = game.gameType ? gameTypeOrder.indexOf(game.gameType) : -1;
  const isSeriesLocked = !game.isComplete && game.isConference && currentIdx > 0 && (() => {
    for (let i = 0; i < currentIdx; i++) {
      const priorGame = allGames.find(g => g.gameType === gameTypeOrder[i]);
      if (priorGame && !priorGame.isComplete) return true;
    }
    return false;
  })();

  const confColor = getConfColor(game.homeTeam);

  return (
    <div className="space-y-1.5" data-testid={`card-game-${game.id}`}>
      <div
        className={`flex items-center gap-3 p-3 rounded ${
          game.isComplete && isUserGame
            ? userWon ? "bg-green-900/20 border border-green-800/30" : "bg-red-900/20 border border-red-800/30"
            : "bg-muted/30"
        } ${isHumanVsHuman && !game.isComplete ? "cursor-pointer hover:bg-amber-500/5 hover:border hover:border-amber-500/20 transition-colors" : ""}`}
        style={{ borderLeft: `3px solid ${confColor}50` }}
        onClick={isHumanVsHuman && !game.isComplete ? () => callbacks.onMatchupPreview(game.id) : undefined}
      >
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <TeamBadge
            abbreviation={game.awayTeam.abbreviation}
            primaryColor={game.awayTeam.primaryColor}
            secondaryColor={game.awayTeam.secondaryColor}
            name={game.awayTeam.name}
            size="sm"
          />
          <div className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link href={`/league/${callbacks.leagueId}/team/${game.awayTeamId}/profile`} onClick={e => e.stopPropagation()} className="min-w-0 overflow-hidden">
                <span className="font-medium text-sm block truncate hover:text-gold transition-colors cursor-pointer" data-testid={`link-profile-away-${game.id}`}>
                  {game.awayTeam.name}
                </span>
              </Link>
              {(() => {
                const rec = callbacks.teamRecords.get(game.awayTeamId);
                return rec ? (
                  <span className="font-pixel text-[7px] text-muted-foreground shrink-0">
                    {rec.wins}-{rec.losses}
                  </span>
                ) : null;
              })()}
              {badge && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: game.awayTeam.primaryColor || "#555" }}
                  title="Conference color"
                />
              )}
            </div>
            {isHumanVsHuman && !game.isComplete && (() => {
              const opponentId = userTeamId === game.awayTeamId ? game.homeTeamId : game.awayTeamId;
              const coachName = callbacks.humanCoachNames[opponentId];
              return coachName ? (
                <span className="font-pixel text-[7px] text-amber-400 flex items-center gap-1 mt-0.5 truncate">
                  <Swords className="w-2.5 h-2.5 shrink-0" /> vs {coachName}
                </span>
              ) : (
                <span className="font-pixel text-[7px] text-amber-400 flex items-center gap-1 mt-0.5">
                  <Swords className="w-2.5 h-2.5" /> RIVALRY
                </span>
              );
            })()}
          </div>
        </div>

        {game.isComplete ? (
          <button
            onClick={e => { e.stopPropagation(); callbacks.onViewBoxScore(game); }}
            className="flex flex-nowrap items-center gap-3 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity shrink-0"
            data-testid={`button-box-score-${game.id}`}
          >
            <span className={`text-lg font-bold ${(game.awayScore ?? 0) > (game.homeScore ?? 0) ? "text-gold" : "text-muted-foreground"}`} data-testid={`score-away-${game.id}`}>
              {game.awayScore}
            </span>
            <span className="text-muted-foreground text-xs">@</span>
            <span className={`text-lg font-bold ${(game.homeScore ?? 0) > (game.awayScore ?? 0) ? "text-gold" : "text-muted-foreground"}`} data-testid={`score-home-${game.id}`}>
              {game.homeScore}
            </span>
            {isUserGame && (
              <Badge variant="outline" className={`text-[9px] ${userWon ? "border-green-600 text-green-400" : "border-red-600 text-red-400"}`} data-testid={`badge-result-${game.id}`}>
                {userWon ? "W" : "L"}
              </Badge>
            )}
            {game.isManuallyReported && (
              <Badge variant="outline" className="text-[9px] border-blue-600 text-blue-400">Reported</Badge>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-muted-foreground text-sm">@</span>
            {badge && (
              <Badge variant="outline" className="text-[8px] border-purple-600/50 text-purple-400 font-pixel">{badge}</Badge>
            )}
            {report?.status === "pending" && (
              <Badge variant="outline" className="text-[9px] border-yellow-600 text-yellow-400" data-testid={`badge-report-pending-${game.id}`}>PENDING</Badge>
            )}
            {report?.status === "disputed" && (
              <Badge variant="outline" className="text-[9px] border-red-600 text-red-400" data-testid={`badge-report-disputed-${game.id}`}>DISPUTED</Badge>
            )}
          </div>
        )}

        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <div className="min-w-0 overflow-hidden text-right">
            <div className="flex items-center justify-end gap-1.5 min-w-0">
              {badge && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: game.homeTeam.primaryColor || "#555" }}
                  title="Conference color"
                />
              )}
              {(() => {
                const rec = callbacks.teamRecords.get(game.homeTeamId);
                return rec ? (
                  <span className="font-pixel text-[7px] text-muted-foreground shrink-0">
                    {rec.wins}-{rec.losses}
                  </span>
                ) : null;
              })()}
              <Link href={`/league/${callbacks.leagueId}/team/${game.homeTeamId}/profile`} onClick={e => e.stopPropagation()} className="min-w-0 overflow-hidden">
                <span className="font-medium text-sm block truncate hover:text-gold transition-colors cursor-pointer" data-testid={`link-profile-home-${game.id}`}>
                  {game.homeTeam.name}
                </span>
              </Link>
            </div>
          </div>
          <TeamBadge
            abbreviation={game.homeTeam.abbreviation}
            primaryColor={game.homeTeam.primaryColor}
            secondaryColor={game.homeTeam.secondaryColor}
            name={game.homeTeam.name}
            size="sm"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!game.isComplete && isHumanVsHuman && (
            <RetroButton
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); callbacks.onMatchupPreview(game.id); }}
              title="View Matchup Preview"
              data-testid={`button-matchup-preview-${game.id}`}
              className="border-gold/60 text-gold/80 hover:text-gold hover:border-gold"
            >
              <Swords className="w-3 h-3" />
            </RetroButton>
          )}
          {!game.isComplete && (
            <>
              {callbacks.isUserGame(game) && !report && (
                isSeriesLocked ? (
                  <RetroButton variant="outline" size="sm" disabled className="opacity-40 cursor-not-allowed" data-testid={`button-report-locked-${game.id}`}>
                    <Lock className="w-3 h-3" />
                  </RetroButton>
                ) : (
                  <Link href={`/league/${callbacks.leagueId}/report-game/${game.id}`}>
                    <RetroButton variant="outline" size="sm" title="Report Game Result" data-testid={`button-report-${game.id}`}>
                      <FileText className="w-3 h-3" />
                    </RetroButton>
                  </Link>
                )
              )}
              {callbacks.isCommissioner && report && (
                <Link href={`/league/${callbacks.leagueId}/report-game/${game.id}?mode=edit`}>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={(e) => e.stopPropagation()}
                    title="Edit Submitted Report"
                    data-testid={`button-edit-report-${game.id}`}
                  >
                    <Edit2 className="w-3 h-3" />
                  </RetroButton>
                </Link>
              )}
              {(
                isSeriesLocked ? (
                  <RetroButton variant="outline" size="sm" disabled className="opacity-40 cursor-not-allowed" data-testid={`button-pbp-locked-${game.id}`}>
                    <Lock className="w-3 h-3" />
                  </RetroButton>
                ) : (
                  <Link href={`/league/${callbacks.leagueId}/game/${game.id}/play-by-play`}>
                    <RetroButton variant="outline" size="sm" title="Play by Play" data-testid={`button-pbp-${game.id}`}>
                      <Play className="w-3 h-3" />
                    </RetroButton>
                  </Link>
                )
              )}
            </>
          )}
          {game.isComplete && (
            <RetroButton
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); callbacks.onViewBoxScore(game); }}
              data-testid={`button-box-score-action-${game.id}`}
              title="View Box Score"
            >
              <Check className="w-3 h-3" />
            </RetroButton>
          )}
        </div>
      </div>

      {!game.isComplete && report && isUserGame && (
        <div className={`flex items-center gap-3 px-3 py-2 rounded text-xs ${
          report.status === "disputed" ? "bg-red-900/20 border border-red-800/30" : "bg-yellow-900/20 border border-yellow-700/30"
        }`} data-testid={`report-status-${game.id}`}>
          {report.status === "pending" && <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />}
          {report.status === "disputed" && <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
          <div className="flex-1">
            {report.status === "pending" && (
              <span className="text-yellow-300">
                Score reported: {report.awayScore} - {report.homeScore}. Awaiting opponent confirmation.
              </span>
            )}
            {report.status === "disputed" && (
              <span className="text-red-300">
                Score disputed. Commissioner will resolve. Reason: {report.disputeReason}
              </span>
            )}
          </div>
          {report.status === "pending" && userIsOpposingTeam && (
            <div className="flex gap-2">
              <RetroButton size="sm" variant="primary" onClick={() => callbacks.onConfirm(game.id)} disabled={callbacks.isConfirming} data-testid={`button-confirm-report-${game.id}`}>
                <CheckCircle className="w-3 h-3 mr-1" /> Confirm
              </RetroButton>
              <RetroButton size="sm" variant="outline" onClick={() => callbacks.onDispute(game.id)} disabled={callbacks.isDisputing} data-testid={`button-dispute-report-${game.id}`} className="border-red-600 text-red-400 hover:bg-red-900/20">
                <XCircle className="w-3 h-3 mr-1" /> Dispute
              </RetroButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchupPreviewModal({ leagueId, gameId, onClose }: { leagueId: string; gameId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<MatchupPreviewData>({
    queryKey: ["/api/leagues", leagueId, "games", gameId, "matchup-preview"],
    enabled: !!gameId,
  });

  const starColor = (s: number) => s >= 5 ? "text-amber-400" : s >= 4 ? "text-gold" : s >= 3 ? "text-yellow-200" : "text-muted-foreground";

  const TeamPanel = ({ team, isHome }: { team: MatchupPreviewTeam; isHome: boolean }) => (
    <div className={`flex-1 min-w-0 ${isHome ? "text-right" : "text-left"}`}>
      <div className={`flex items-center gap-2 mb-1 ${isHome ? "flex-row-reverse" : ""}`}>
        <TeamBadge
          abbreviation={team.abbreviation}
          primaryColor={team.primaryColor}
          secondaryColor={team.secondaryColor}
          name={team.name}
          size="md"
        />
        <div className={isHome ? "text-right" : ""}>
          <p className="font-medium text-sm leading-tight">{team.name}</p>
          <p className="text-xs text-muted-foreground">{team.record.wins}-{team.record.losses}</p>
        </div>
      </div>
      <div className={`flex items-center gap-2 mb-2 ${isHome ? "justify-end" : ""}`}>
        <span className="font-pixel text-[8px] text-gold/80">#{team.powerRank}</span>
        <span className="text-[10px] text-muted-foreground">PWR {team.composite}</span>
      </div>
      <div className={`flex items-center gap-1 text-xs text-muted-foreground mb-2 ${isHome ? "justify-end" : ""}`}>
        {team.isCpu ? null : <User className="w-3 h-3 text-gold" />}
        <span>{team.coachName}</span>
        {team.coachArchetype && <span className="text-[10px] text-muted-foreground/60">({team.coachArchetype})</span>}
      </div>
      <div className="space-y-1">
        <p className="font-pixel text-[8px] text-muted-foreground mb-1">TOP PLAYERS</p>
        {team.top3.map((p, i) => (
          <div key={i} className={`flex items-center gap-2 text-xs ${isHome ? "flex-row-reverse" : ""}`}>
            <span className={`font-pixel text-[8px] ${starColor(p.starRating)}`}>{Array.from({ length: Math.min(p.starRating, 5) }, () => "★").join("")}</span>
            <span className="text-foreground">{p.name}</span>
            <span className="text-muted-foreground text-[10px]">{p.position}</span>
            <span className="font-mono text-[10px] text-gold/70">{p.overall}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={!!gameId} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="bg-[#1a2e1a] border-gold/50 max-w-2xl" data-testid="dialog-matchup-preview">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Swords className="w-4 h-4" /> Rivalry Matchup Preview
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <div className="font-pixel text-[9px] text-muted-foreground">Loading matchup data...</div>
          </div>
        ) : !data ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Matchup data unavailable.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
              <span className={`px-2 py-0.5 rounded font-pixel text-[8px] ${data.game.isConference ? "bg-blue-500/20 text-blue-400" : "bg-muted/50"}`}>
                {data.game.isConference ? "CONF" : "OOC"}
              </span>
              <span>Week {data.game.week}</span>
              {data.game.gameType && (
                <span className="capitalize">{data.game.gameType}</span>
              )}
            </div>

            <div className="flex items-start gap-4">
              <TeamPanel team={data.awayTeam} isHome={false} />
              <div className="flex-shrink-0 text-center px-2 pt-2">
                <div className="font-pixel text-muted-foreground text-[10px] mb-1">@</div>
                {data.h2h.totalGames > 0 ? (
                  <div className="mt-4 space-y-1 max-w-[90px]">
                    <p className="font-pixel text-[6px] text-muted-foreground leading-tight">ALL-TIME vs {data.awayTeam.abbreviation}</p>
                    <p className="font-pixel text-[9px] text-gold">{data.h2h.homeWins}–{data.h2h.awayWins}</p>
                    <p className="font-pixel text-[6px] text-muted-foreground leading-tight">ALL-TIME vs {data.homeTeam.abbreviation}</p>
                    <p className="font-pixel text-[9px] text-gold">{data.h2h.awayWins}–{data.h2h.homeWins}</p>
                  </div>
                ) : (
                  <div className="mt-4">
                    <p className="font-pixel text-[7px] text-muted-foreground">FIRST</p>
                    <p className="font-pixel text-[7px] text-muted-foreground">MEETING</p>
                  </div>
                )}
              </div>
              <TeamPanel team={data.homeTeam} isHome={true} />
            </div>

            <div className="text-center">
              <RetroButton variant="outline" size="sm" onClick={onClose} data-testid="button-close-matchup-preview">
                Close
              </RetroButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BoxScoreModal({ game, onClose }: { game: GameWithTeams | null; onClose: () => void }) {
  if (!game) return null;

  let boxScore: BoxScoreData | null = null;
  if (game.boxScore) {
    try {
      boxScore = JSON.parse(game.boxScore);
    } catch {
      boxScore = null;
    }
  }

  const totalAwayH = boxScore?.away.totals.h ?? 0;
  const totalHomeH = boxScore?.home.totals.h ?? 0;
  const awayWon = (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0);

  return (
    <Dialog open={!!game} onOpenChange={() => onClose()}>
      <DialogContent className="bg-[#1a2e1a] border-gold/50 max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-box-score">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm">
            {game.awayTeam.abbreviation} {game.awayScore} @ {game.homeTeam.abbreviation} {game.homeScore}
          </DialogTitle>
        </DialogHeader>

        {!boxScore ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">Box score not available for this game.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Linescore */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" data-testid="table-line-score">
                <thead>
                  <tr className="border-b border-gold/30">
                    <th className="font-pixel text-gold/80 text-left p-2 min-w-[110px]">Team</th>
                    {boxScore.innings.map((_, i) => (
                      <th key={i} className="font-pixel text-gold/80 text-center p-2 w-7">{i + 1}</th>
                    ))}
                    <th className="font-pixel text-gold text-center p-2 w-8 border-l border-gold/30">R</th>
                    <th className="font-pixel text-gold/80 text-center p-2 w-8">H</th>
                    <th className="font-pixel text-gold/80 text-center p-2 w-8">E</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b border-gold/20 ${awayWon ? "bg-gold/5" : ""}`}>
                    <td className="p-2 font-medium text-foreground flex items-center gap-2">
                      <TeamBadge abbreviation={game.awayTeam.abbreviation} primaryColor={game.awayTeam.primaryColor} secondaryColor={game.awayTeam.secondaryColor} name={game.awayTeam.name} size="sm" />
                      <span className={`truncate ${awayWon ? "text-gold font-bold" : ""}`}>{game.awayTeam.abbreviation}</span>
                      {awayWon && <span className="text-[8px] font-pixel text-gold ml-1">W</span>}
                    </td>
                    {boxScore.innings.map((inning, i) => (
                      <td key={i} className="text-center p-2 text-foreground">{inning[0]}</td>
                    ))}
                    <td className={`text-center p-2 font-bold border-l border-gold/30 ${awayWon ? "text-gold" : "text-foreground"}`}>{game.awayScore}</td>
                    <td className="text-center p-2 text-foreground">{totalAwayH}</td>
                    <td className="text-center p-2 text-foreground">{boxScore.away.errors ?? 0}</td>
                  </tr>
                  <tr className={homeWon ? "bg-gold/5" : ""}>
                    <td className="p-2 font-medium text-foreground flex items-center gap-2">
                      <TeamBadge abbreviation={game.homeTeam.abbreviation} primaryColor={game.homeTeam.primaryColor} secondaryColor={game.homeTeam.secondaryColor} name={game.homeTeam.name} size="sm" />
                      <span className={`truncate ${homeWon ? "text-gold font-bold" : ""}`}>{game.homeTeam.abbreviation}</span>
                      {homeWon && <span className="text-[8px] font-pixel text-gold ml-1">W</span>}
                    </td>
                    {boxScore.innings.map((inning, i) => (
                      <td key={i} className="text-center p-2 text-foreground">{inning[1]}</td>
                    ))}
                    <td className={`text-center p-2 font-bold border-l border-gold/30 ${homeWon ? "text-gold" : "text-foreground"}`}>{game.homeScore}</td>
                    <td className="text-center p-2 text-foreground">{totalHomeH}</td>
                    <td className="text-center p-2 text-foreground">{boxScore.home.errors ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Home / Away tabs */}
            <Tabs defaultValue="away" className="w-full">
              <TabsList className="bg-[#0f1f0f] border border-gold/30 w-full grid grid-cols-2">
                <TabsTrigger value="away" className="font-pixel text-[10px] data-[state=active]:bg-gold/20 data-[state=active]:text-gold" data-testid="tab-away-box">
                  {game.awayTeam.abbreviation}
                  {awayWon && <span className="ml-1 text-gold">W</span>}
                </TabsTrigger>
                <TabsTrigger value="home" className="font-pixel text-[10px] data-[state=active]:bg-gold/20 data-[state=active]:text-gold" data-testid="tab-home-box">
                  {game.homeTeam.abbreviation}
                  {homeWon && <span className="ml-1 text-gold">W</span>}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="away" className="space-y-4 mt-3">
                <TeamBattingTable label={game.awayTeam.name} team={boxScore.away} />
                <TeamPitchingTable label={game.awayTeam.name} pitching={boxScore.away.pitching} />
              </TabsContent>
              <TabsContent value="home" className="space-y-4 mt-3">
                <TeamBattingTable label={game.homeTeam.name} team={boxScore.home} />
                <TeamPitchingTable label={game.homeTeam.name} pitching={boxScore.home.pitching} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamBattingTable({ label, team }: { label: string; team: BoxScoreTeam }) {
  return (
    <div className="overflow-x-auto">
      <h3 className="font-pixel text-gold text-xs mb-2">{label} — Batting</h3>
      <table className="w-full text-xs border-collapse" data-testid={`table-batting-${label}`}>
        <thead>
          <tr className="border-b border-gold/30">
            <th className="text-center p-1.5 text-gold/60 w-6">#</th>
            <th className="text-left p-1.5 text-gold/80">Name</th>
            <th className="text-center p-1.5 text-gold/80 w-10">Pos</th>
            <th className="text-center p-1.5 text-gold/80 w-8">AB</th>
            <th className="text-center p-1.5 text-gold/80 w-8">R</th>
            <th className="text-center p-1.5 text-gold/80 w-8">H</th>
            <th className="text-center p-1.5 text-gold/80 w-8">2B</th>
            <th className="text-center p-1.5 text-gold/80 w-8">3B</th>
            <th className="text-center p-1.5 text-gold/80 w-8">HR</th>
            <th className="text-center p-1.5 text-gold/80 w-8">RBI</th>
            <th className="text-center p-1.5 text-gold/80 w-8">BB</th>
            <th className="text-center p-1.5 text-red-400 w-8">SO</th>
            <th className="text-center p-1.5 text-gold/80 w-8">SB</th>
            <th className="text-center p-1.5 text-gold/80 w-12">AVG</th>
          </tr>
        </thead>
        <tbody>
          {team.batting.map((batter, i) => (
            <tr key={i} className="border-b border-gold/10">
              <td className="text-center p-1.5 text-muted-foreground font-pixel text-[8px]">{i + 1}</td>
              <td className="p-1.5 text-foreground">{batter.name}</td>
              <td className="text-center p-1.5 text-muted-foreground text-xs">{batter.position}</td>
              <td className="text-center p-1.5 text-foreground">{batter.ab}</td>
              <td className="text-center p-1.5 text-foreground">{batter.r}</td>
              <td className="text-center p-1.5 text-foreground">{batter.h}</td>
              <td className="text-center p-1.5 text-foreground">{batter.doubles ?? 0}</td>
              <td className="text-center p-1.5 text-foreground">{batter.triples ?? 0}</td>
              <td className="text-center p-1.5 text-foreground">{batter.hr ?? 0}</td>
              <td className="text-center p-1.5 text-foreground">{batter.rbi}</td>
              <td className="text-center p-1.5 text-foreground">{batter.bb}</td>
              <td className="text-center p-1.5 text-foreground">{batter.so}</td>
              <td className="text-center p-1.5 text-foreground">{batter.sb ?? 0}</td>
              <td className="text-center p-1.5 text-foreground">{batter.avg ?? "--"}</td>
            </tr>
          ))}
          <tr className="border-t border-gold/30 font-bold">
            <td className="p-1.5"></td>
            <td className="p-1.5 text-gold" colSpan={2}>Totals</td>
            <td className="text-center p-1.5 text-gold">{team.totals.ab}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.r}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.h}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.doubles ?? 0}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.triples ?? 0}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.hr ?? 0}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.rbi}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.bb}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.so}</td>
            <td className="text-center p-1.5 text-gold">{team.totals.sb ?? 0}</td>
            <td className="text-center p-1.5 text-gold"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TeamPitchingTable({ label, pitching }: { label: string; pitching: BoxScorePitcher[] }) {
  return (
    <div className="overflow-x-auto">
      <h3 className="font-pixel text-gold text-xs mb-2">{label} - Pitching</h3>
      <table className="w-full text-xs border-collapse" data-testid={`table-pitching-${label}`}>
        <thead>
          <tr className="border-b border-gold/30">
            <th className="text-left p-1.5 text-gold/80">Pitching</th>
            <th className="text-center p-1.5 text-gold/80 w-10">IP</th>
            <th className="text-center p-1.5 text-gold/80 w-10">H</th>
            <th className="text-center p-1.5 text-gold/80 w-10">R</th>
            <th className="text-center p-1.5 text-gold/80 w-10">ER</th>
            <th className="text-center p-1.5 text-gold/80 w-10">BB</th>
            <th className="text-center p-1.5 text-gold/80 w-10">SO</th>
            <th className="text-center p-1.5 text-gold/80 w-10">HR</th>
            <th className="text-center p-1.5 text-gold/80 w-14">ERA</th>
          </tr>
        </thead>
        <tbody>
          {pitching.map((pitcher, i) => (
            <tr key={i} className="border-b border-gold/10">
              <td className="p-1.5 text-foreground">{pitcher.name}</td>
              <td className="text-center p-1.5 text-foreground">{pitcher.ip}</td>
              <td className="text-center p-1.5 text-foreground">{pitcher.h}</td>
              <td className="text-center p-1.5 text-foreground">{pitcher.r}</td>
              <td className="text-center p-1.5 text-foreground">{pitcher.er}</td>
              <td className="text-center p-1.5 text-foreground">{pitcher.bb}</td>
              <td className="text-center p-1.5 text-foreground">{pitcher.so}</td>
              <td className="text-center p-1.5 text-foreground">{pitcher.hr ?? 0}</td>
              <td className="text-center p-1.5 text-foreground">{pitcher.era}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-32" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
        {[1, 2, 3].map((week) => (
          <div key={week} className="rounded-md border border-border/50 bg-card/30">
            <div className="px-4 py-3 border-b border-border/50">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="p-4 space-y-4">
              {[1, 2].map((game) => (
                <div key={game} className="flex items-center gap-4 p-4 rounded bg-muted/30">
                  <div className="flex-1 flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                  <div className="flex-1 flex items-center justify-end gap-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
