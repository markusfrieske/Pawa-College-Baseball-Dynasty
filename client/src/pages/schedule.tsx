import { useState } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Check, Edit2, Lock, Play, FileText, AlertTriangle, CheckCircle, XCircle, Swords, User, Star } from "lucide-react";
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

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [editingGame, setEditingGame] = useState<GameWithTeams | null>(null);
  const [boxScoreGame, setBoxScoreGame] = useState<GameWithTeams | null>(null);
  const [showMyTeam, setShowMyTeam] = useState(true);
  const [disputeGameId, setDisputeGameId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [matchupPreviewGameId, setMatchupPreviewGameId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ScheduleData>({
    queryKey: ["/api/leagues", id, "schedule"],
  });

  const submitScoreMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore }: { gameId: string; homeScore: number; awayScore: number }) => {
      return apiRequest("PATCH", `/api/leagues/${id}/games/${gameId}`, { homeScore, awayScore });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      toast({ title: "Score submitted", description: "Game result has been recorded." });
      setEditingGame(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
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

  if (isLoading) {
    return <ScheduleSkeleton />;
  }

  const phaseLabels: Record<string, string> = {
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
  };

  const filteredGames = showMyTeam && data?.userTeamId
    ? data.games.filter(g => g.homeTeamId === data.userTeamId || g.awayTeamId === data.userTeamId)
    : data?.games || [];

  const gamesByGroup = filteredGames.reduce((acc, game) => {
    const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(game.phase || "");
    const groupKey = isPostseason ? game.phase! : `week_${game.week}`;
    if (!acc[groupKey]) acc[groupKey] = { games: [], label: isPostseason ? phaseLabels[game.phase!] || game.phase! : `Week ${game.week}`, sortOrder: isPostseason ? 1000 + (game.phase === "conference_championship" ? 1 : game.phase === "super_regionals" ? 2 : 3) : game.week, isCurrentWeek: !isPostseason && game.week === data?.currentWeek };
    acc[groupKey].games.push(game);
    return acc;
  }, {} as Record<string, { games: GameWithTeams[]; label: string; sortOrder: number; isCurrentWeek: boolean }>) || {};

  const groups = Object.entries(gamesByGroup).sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 justify-between flex-wrap">
            <div className="flex items-center gap-4">
              <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="font-pixel text-gold text-lg">Schedule</h1>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {data?.userTeamId && (
                <div className="flex items-center gap-2">
                  <RetroButton 
                    variant={showMyTeam ? "primary" : "outline"} 
                    size="sm" 
                    onClick={() => setShowMyTeam(true)}
                    data-testid="button-my-team-schedule"
                  >
                    My Team
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Season {data?.currentSeason}, Week {data?.currentWeek}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
        {groups.map(([key, group]) => (
          <RetroCard key={key}>
            <RetroCardHeader className="flex items-center justify-between gap-4">
              <span>{group.label}</span>
              {group.isCurrentWeek && (
                <span className="text-[8px] text-gold bg-gold/20 px-2 py-1 rounded">Current</span>
              )}
            </RetroCardHeader>
            <RetroCardContent>
              <div className="space-y-4">
                {group.games.map((game) => (
                  <GameRow
                    key={game.id}
                    game={game}
                    allGamesInGroup={group.games}
                    onEdit={() => setEditingGame(game)}
                    onViewBoxScore={() => setBoxScoreGame(game)}
                    onMatchupPreview={() => setMatchupPreviewGameId(game.id)}
                    userTeamId={data?.userTeamId}
                    leagueId={id!}
                    humanTeamIds={data?.humanTeamIds ?? []}
                    humanCoachNames={data?.humanCoachNames ?? {}}
                    report={data?.reportsByGameId?.[game.id] ?? null}
                    onConfirm={() => confirmReportMutation.mutate(game.id)}
                    onDispute={() => { setDisputeGameId(game.id); setDisputeReason(""); }}
                    isConfirming={confirmReportMutation.isPending}
                    isDisputing={disputeReportMutation.isPending}
                    isCommissioner={data?.isCommissioner}
                  />
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>
        ))}

        {groups.length === 0 && (
          <RetroCard variant="bordered" className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No games scheduled yet</p>
          </RetroCard>
        )}
      </main>

      <ScoreEntryModal
        game={editingGame}
        onClose={() => setEditingGame(null)}
        onSubmit={(homeScore, awayScore) => {
          if (editingGame) {
            submitScoreMutation.mutate({ gameId: editingGame.id, homeScore, awayScore });
          }
        }}
        isPending={submitScoreMutation.isPending}
      />

      <BoxScoreModal
        game={boxScoreGame}
        onClose={() => setBoxScoreGame(null)}
      />

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

function GameRow({ game, allGamesInGroup, onEdit, onViewBoxScore, onMatchupPreview, userTeamId, leagueId, humanTeamIds, humanCoachNames, report, onConfirm, onDispute, isConfirming, isDisputing, isCommissioner }: {
  game: GameWithTeams;
  allGamesInGroup: GameWithTeams[];
  onEdit: () => void;
  onViewBoxScore: () => void;
  onMatchupPreview: () => void;
  userTeamId?: string | null;
  leagueId: string;
  humanTeamIds: string[];
  humanCoachNames: Record<string, string>;
  report: GameReport | null;
  onConfirm: () => void;
  onDispute: () => void;
  isConfirming: boolean;
  isDisputing: boolean;
  isCommissioner?: boolean;
}) {
  const isUserGame = userTeamId && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId);
  const userWon = isUserGame && game.isComplete && (
    (game.homeTeamId === userTeamId && (game.homeScore ?? 0) > (game.awayScore ?? 0)) ||
    (game.awayTeamId === userTeamId && (game.awayScore ?? 0) > (game.homeScore ?? 0))
  );
  const userLost = isUserGame && game.isComplete && !userWon;

  const isHumanVsHuman = humanTeamIds.includes(game.homeTeamId) && humanTeamIds.includes(game.awayTeamId);
  const opposingTeamId = game.homeTeamId === userTeamId ? game.awayTeamId : game.homeTeamId;
  const userIsOpposingTeam = report && userTeamId && report.reporterTeamId !== userTeamId &&
    (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId);

  const gameTypeOrder = ["friday", "saturday", "sunday"];
  const currentIdx = game.gameType ? gameTypeOrder.indexOf(game.gameType) : -1;
  const isSeriesLocked = !game.isComplete && game.isConference && currentIdx > 0 && (() => {
    const seriesGames = allGamesInGroup.filter(g =>
      g.isConference &&
      g.week === game.week &&
      ((g.homeTeamId === game.homeTeamId && g.awayTeamId === game.awayTeamId) ||
       (g.homeTeamId === game.awayTeamId && g.awayTeamId === game.homeTeamId))
    );
    for (let i = 0; i < currentIdx; i++) {
      const priorGame = seriesGames.find(g => g.gameType === gameTypeOrder[i]);
      if (priorGame && !priorGame.isComplete) return true;
    }
    return false;
  })();

  return (
    <div className="space-y-2">
      <div 
        className={`flex items-center gap-4 p-4 rounded ${
          game.isComplete && isUserGame
            ? userWon ? "bg-green-900/20 border border-green-800/30" : "bg-red-900/20 border border-red-800/30"
            : "bg-muted/30"
        } ${isHumanVsHuman && !game.isComplete ? "cursor-pointer hover:bg-amber-500/5 hover:border hover:border-amber-500/20 transition-colors" : ""}`} 
        onClick={isHumanVsHuman && !game.isComplete ? onMatchupPreview : undefined}
        data-testid={`card-game-${game.id}`}
      >
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <TeamBadge
            abbreviation={game.awayTeam.abbreviation}
            primaryColor={game.awayTeam.primaryColor}
            secondaryColor={game.awayTeam.secondaryColor}
            name={game.awayTeam.name}
           
            size="sm"
          />
          <div className="min-w-0">
            <Link href={`/league/${leagueId}/team/${game.awayTeamId}/profile`} onClick={e => e.stopPropagation()}>
              <span className="font-medium text-sm block truncate hover:text-gold transition-colors cursor-pointer" data-testid={`link-profile-away-${game.id}`}>{game.awayTeam.name}</span>
            </Link>
            {isHumanVsHuman && !game.isComplete && (() => {
              const opponentId = userTeamId === game.awayTeamId ? game.homeTeamId : game.awayTeamId;
              const coachName = humanCoachNames[opponentId];
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
            onClick={onViewBoxScore}
            className="flex flex-nowrap items-center gap-4 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity shrink-0 min-w-[96px]"
            data-testid={`button-box-score-${game.id}`}
          >
            <span className={`text-xl font-bold ${(game.awayScore ?? 0) > (game.homeScore ?? 0) ? "text-gold" : "text-muted-foreground"}`} data-testid={`score-away-${game.id}`}>
              {game.awayScore}
            </span>
            <span className="text-muted-foreground">@</span>
            <span className={`text-xl font-bold ${(game.homeScore ?? 0) > (game.awayScore ?? 0) ? "text-gold" : "text-muted-foreground"}`} data-testid={`score-home-${game.id}`}>
              {game.homeScore}
            </span>
            {isUserGame && (
              <Badge variant="outline" className={`text-[9px] ml-1 ${userWon ? "border-green-600 text-green-400" : "border-red-600 text-red-400"}`} data-testid={`badge-result-${game.id}`}>
                {userWon ? "W" : "L"}
              </Badge>
            )}
            {game.isManuallyReported && (
              <Badge variant="outline" className="text-[9px] ml-1 border-blue-600 text-blue-400">Reported</Badge>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {report?.status === "pending" && (
              <Badge variant="outline" className="text-[9px] border-yellow-600 text-yellow-400" data-testid={`badge-report-pending-${game.id}`}>
                PENDING
              </Badge>
            )}
            {report?.status === "disputed" && (
              <Badge variant="outline" className="text-[9px] border-red-600 text-red-400" data-testid={`badge-report-disputed-${game.id}`}>
                DISPUTED
              </Badge>
            )}
          </div>
        )}
        {!game.isComplete && (
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">@</span>
          </div>
        )}

        <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
          <div className="min-w-0">
            <Link href={`/league/${leagueId}/team/${game.homeTeamId}/profile`} onClick={e => e.stopPropagation()}>
              <span className="font-medium text-sm block truncate hover:text-gold transition-colors cursor-pointer" data-testid={`link-profile-home-${game.id}`}>{game.homeTeam.name}</span>
            </Link>
          </div>
          <TeamBadge
            abbreviation={game.homeTeam.abbreviation}
            primaryColor={game.homeTeam.primaryColor}
            secondaryColor={game.homeTeam.secondaryColor}
            name={game.homeTeam.name}
           
            size="sm"
          />
        </div>

        <div className="flex items-center gap-1">
          {!game.isComplete && isHumanVsHuman && (
            <RetroButton
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onMatchupPreview(); }}
              title="View Matchup Preview"
              data-testid={`button-matchup-preview-${game.id}`}
              className="border-gold/60 text-gold/80 hover:text-gold hover:border-gold"
            >
              <Swords className="w-3 h-3" />
            </RetroButton>
          )}
          {!game.isComplete && (
            <>
              {isHumanVsHuman && (isUserGame || isCommissioner) && !report && (
                isSeriesLocked ? (
                  <RetroButton variant="outline" size="sm" disabled className="opacity-40 cursor-not-allowed" data-testid={`button-report-locked-${game.id}`}>
                    <Lock className="w-3 h-3" />
                  </RetroButton>
                ) : (
                  <Link href={`/league/${leagueId}/report-game/${game.id}`}>
                    <RetroButton variant="outline" size="sm" title="Report Game Result" data-testid={`button-report-${game.id}`}>
                      <FileText className="w-3 h-3" />
                    </RetroButton>
                  </Link>
                )
              )}
              {!isHumanVsHuman && (
                isSeriesLocked ? (
                  <RetroButton
                    variant="outline"
                    size="sm"
                    title="Complete earlier games in this series first"
                    disabled
                    className="opacity-40 cursor-not-allowed"
                    data-testid={`button-pbp-locked-${game.id}`}
                  >
                    <Lock className="w-3 h-3" />
                  </RetroButton>
                ) : (
                  <Link href={`/league/${leagueId}/game/${game.id}/play-by-play`}>
                    <RetroButton
                      variant="outline"
                      size="sm"
                      title="Play by Play"
                      data-testid={`button-pbp-${game.id}`}
                    >
                      <Play className="w-3 h-3" />
                    </RetroButton>
                  </Link>
                )
              )}
            </>
          )}
          {isCommissioner && (
            <RetroButton
              variant="outline"
              size="sm"
              onClick={onEdit}
              data-testid={`button-edit-game-${game.id}`}
            >
              {game.isComplete ? <Check className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
            </RetroButton>
          )}
        </div>
      </div>

      {!game.isComplete && report && isUserGame && (
        <div className={`flex items-center gap-3 px-4 py-2 rounded text-xs ${
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
              <RetroButton size="sm" variant="primary" onClick={onConfirm} disabled={isConfirming} data-testid={`button-confirm-report-${game.id}`}>
                <CheckCircle className="w-3 h-3 mr-1" /> Confirm
              </RetroButton>
              <RetroButton size="sm" variant="outline" onClick={onDispute} disabled={isDisputing} data-testid={`button-dispute-report-${game.id}`} className="border-red-600 text-red-400 hover:bg-red-900/20">
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
            {/* Game context */}
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
              <span className={`px-2 py-0.5 rounded font-pixel text-[8px] ${data.game.isConference ? "bg-blue-500/20 text-blue-400" : "bg-muted/50"}`}>
                {data.game.isConference ? "CONF" : "OOC"}
              </span>
              <span>Week {data.game.week}</span>
              {data.game.gameType && (
                <span className="capitalize">{data.game.gameType}</span>
              )}
            </div>

            {/* Teams */}
            <div className="flex items-start gap-4">
              <TeamPanel team={data.awayTeam} isHome={false} />

              <div className="flex-shrink-0 text-center px-2 pt-2">
                <div className="font-pixel text-muted-foreground text-[10px] mb-1">@</div>
                {data.h2h.totalGames > 0 ? (
                  <div className="mt-4 space-y-1 max-w-[90px]">
                    <p className="font-pixel text-[6px] text-muted-foreground leading-tight">ALL-TIME vs {data.awayTeam.abbreviation}</p>
                    <p className="font-pixel text-[9px] text-gold">
                      {data.h2h.homeWins}–{data.h2h.awayWins}
                    </p>
                    <p className="font-pixel text-[6px] text-muted-foreground leading-tight">ALL-TIME vs {data.homeTeam.abbreviation}</p>
                    <p className="font-pixel text-[9px] text-gold">
                      {data.h2h.awayWins}–{data.h2h.homeWins}
                    </p>
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

  return (
    <Dialog open={!!game} onOpenChange={() => onClose()}>
      <DialogContent className="bg-[#1a2e1a] border-gold/50 max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-box-score">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm">Box Score</DialogTitle>
        </DialogHeader>

        {!boxScore ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">Box score not available for this game.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" data-testid="table-line-score">
                <thead>
                  <tr className="border-b border-gold/30">
                    <th className="font-pixel text-gold text-left p-2 min-w-[120px]">Team</th>
                    {boxScore.innings.map((_, i) => (
                      <th key={i} className="font-pixel text-gold text-center p-2 w-8">{i + 1}</th>
                    ))}
                    <th className="font-pixel text-gold text-center p-2 w-8 border-l border-gold/30">R</th>
                    <th className="font-pixel text-gold text-center p-2 w-8">H</th>
                    <th className="font-pixel text-gold text-center p-2 w-8">E</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gold/20">
                    <td className="p-2 font-medium text-foreground flex items-center gap-2">
                      <TeamBadge abbreviation={game.awayTeam.abbreviation} primaryColor={game.awayTeam.primaryColor} secondaryColor={game.awayTeam.secondaryColor} name={game.awayTeam.name} size="sm" />
                      <span className="truncate">{game.awayTeam.abbreviation}</span>
                    </td>
                    {boxScore.innings.map((inning, i) => (
                      <td key={i} className="text-center p-2 text-foreground">{inning[0]}</td>
                    ))}
                    <td className="text-center p-2 font-bold text-gold border-l border-gold/30">{game.awayScore}</td>
                    <td className="text-center p-2 text-foreground">{totalAwayH}</td>
                    <td className="text-center p-2 text-foreground">{boxScore.away.errors ?? 0}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-medium text-foreground flex items-center gap-2">
                      <TeamBadge abbreviation={game.homeTeam.abbreviation} primaryColor={game.homeTeam.primaryColor} secondaryColor={game.homeTeam.secondaryColor} name={game.homeTeam.name} size="sm" />
                      <span className="truncate">{game.homeTeam.abbreviation}</span>
                    </td>
                    {boxScore.innings.map((inning, i) => (
                      <td key={i} className="text-center p-2 text-foreground">{inning[1]}</td>
                    ))}
                    <td className="text-center p-2 font-bold text-gold border-l border-gold/30">{game.homeScore}</td>
                    <td className="text-center p-2 text-foreground">{totalHomeH}</td>
                    <td className="text-center p-2 text-foreground">{boxScore.home.errors ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <TeamBattingTable label={game.awayTeam.name} team={boxScore.away} />
            <TeamBattingTable label={game.homeTeam.name} team={boxScore.home} />

            <TeamPitchingTable label={game.awayTeam.name} pitching={boxScore.away.pitching} />
            <TeamPitchingTable label={game.homeTeam.name} pitching={boxScore.home.pitching} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamBattingTable({ label, team }: { label: string; team: BoxScoreTeam }) {
  return (
    <div className="overflow-x-auto">
      <h3 className="font-pixel text-gold text-xs mb-2">{label} - Batting</h3>
      <table className="w-full text-xs border-collapse" data-testid={`table-batting-${label}`}>
        <thead>
          <tr className="border-b border-gold/30">
            <th className="text-left p-1.5 text-gold/80">Batting</th>
            <th className="text-center p-1.5 text-gold/80 w-8">AB</th>
            <th className="text-center p-1.5 text-gold/80 w-8">R</th>
            <th className="text-center p-1.5 text-gold/80 w-8">H</th>
            <th className="text-center p-1.5 text-gold/80 w-8">2B</th>
            <th className="text-center p-1.5 text-gold/80 w-8">3B</th>
            <th className="text-center p-1.5 text-gold/80 w-8">HR</th>
            <th className="text-center p-1.5 text-gold/80 w-8">RBI</th>
            <th className="text-center p-1.5 text-gold/80 w-8">BB</th>
            <th className="text-center p-1.5 text-gold/80 w-8">SO</th>
            <th className="text-center p-1.5 text-gold/80 w-8">SB</th>
            <th className="text-center p-1.5 text-gold/80 w-12">AVG</th>
          </tr>
        </thead>
        <tbody>
          {team.batting.map((batter, i) => (
            <tr key={i} className="border-b border-gold/10">
              <td className="p-1.5 text-foreground">
                <span>{batter.name}</span>
                <span className="text-muted-foreground ml-1">({batter.position})</span>
              </td>
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
              <td className="text-center p-1.5 text-foreground">{batter.avg}</td>
            </tr>
          ))}
          <tr className="border-t border-gold/30 font-bold">
            <td className="p-1.5 text-gold">Totals</td>
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

function ScoreEntryModal({
  game,
  onClose,
  onSubmit,
  isPending,
}: {
  game: GameWithTeams | null;
  onClose: () => void;
  onSubmit: (homeScore: number, awayScore: number) => void;
  isPending: boolean;
}) {
  const [homeScore, setHomeScore] = useState(game?.homeScore?.toString() || "0");
  const [awayScore, setAwayScore] = useState(game?.awayScore?.toString() || "0");

  if (!game) return null;

  return (
    <Dialog open={!!game} onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-gold max-w-md">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm">Enter Game Score</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 text-center">
              <TeamBadge
                abbreviation={game.awayTeam.abbreviation}
                primaryColor={game.awayTeam.primaryColor}
                secondaryColor={game.awayTeam.secondaryColor}
                name={game.awayTeam.name}
                className="mx-auto mb-2"
              />
              <p className="text-sm font-medium mb-3">{game.awayTeam.name}</p>
              <RetroInput
                type="number"
                min="0"
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                className="text-center text-xl"
                data-testid="input-away-score"
              />
            </div>
            <span className="text-muted-foreground text-xl">@</span>
            <div className="flex-1 text-center">
              <TeamBadge
                abbreviation={game.homeTeam.abbreviation}
                primaryColor={game.homeTeam.primaryColor}
                secondaryColor={game.homeTeam.secondaryColor}
                name={game.homeTeam.name}
                className="mx-auto mb-2"
              />
              <p className="text-sm font-medium mb-3">{game.homeTeam.name}</p>
              <RetroInput
                type="number"
                min="0"
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                className="text-center text-xl"
                data-testid="input-home-score"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <RetroButton
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </RetroButton>
            <RetroButton
              className="flex-1"
              onClick={() => onSubmit(parseInt(homeScore) || 0, parseInt(awayScore) || 0)}
              disabled={isPending}
              data-testid="button-submit-score"
            >
              {isPending ? "Saving..." : "Submit Score"}
            </RetroButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
