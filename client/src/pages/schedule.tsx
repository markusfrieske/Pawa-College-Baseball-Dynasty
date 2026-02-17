import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Check, Edit2, Play } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Game, Team } from "@shared/schema";

interface GameWithTeams extends Game {
  homeTeam: Team;
  awayTeam: Team;
}

interface ScheduleData {
  games: GameWithTeams[];
  currentWeek: number;
  currentSeason: number;
  userTeamId: string | null;
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

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [editingGame, setEditingGame] = useState<GameWithTeams | null>(null);
  const [boxScoreGame, setBoxScoreGame] = useState<GameWithTeams | null>(null);
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  const gamesByGroup = data?.games.reduce((acc, game) => {
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
          <div className="flex items-center gap-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-lg">Schedule</h1>
            <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Season {data?.currentSeason}, Week {data?.currentWeek}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
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
                    onEdit={() => setEditingGame(game)}
                    onViewBoxScore={() => setBoxScoreGame(game)}
                    userTeamId={data?.userTeamId}
                    leagueId={id!}
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
    </div>
  );
}

function GameRow({ game, onEdit, onViewBoxScore, userTeamId, leagueId }: { game: GameWithTeams; onEdit: () => void; onViewBoxScore: () => void; userTeamId?: string | null; leagueId: string }) {
  const isUserGame = userTeamId && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId);
  const userWon = isUserGame && game.isComplete && (
    (game.homeTeamId === userTeamId && (game.homeScore ?? 0) > (game.awayScore ?? 0)) ||
    (game.awayTeamId === userTeamId && (game.awayScore ?? 0) > (game.homeScore ?? 0))
  );
  const userLost = isUserGame && game.isComplete && !userWon;

  return (
    <div 
      className={`flex items-center gap-4 p-4 rounded ${
        game.isComplete && isUserGame
          ? userWon ? "bg-green-900/20 border border-green-800/30" : "bg-red-900/20 border border-red-800/30"
          : "bg-muted/30"
      }`} 
      data-testid={`card-game-${game.id}`}
    >
      <div className="flex-1 flex items-center gap-3">
        <TeamBadge
          abbreviation={game.awayTeam.abbreviation}
          primaryColor={game.awayTeam.primaryColor}
          secondaryColor={game.awayTeam.secondaryColor}
          size="sm"
        />
        <span className="font-medium text-sm">{game.awayTeam.name}</span>
      </div>

      {game.isComplete ? (
        <button
          onClick={onViewBoxScore}
          className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
          data-testid={`button-box-score-${game.id}`}
        >
          <span className={`text-xl font-bold ${(game.awayScore || 0) > (game.homeScore || 0) ? "text-gold" : "text-muted-foreground"}`}>
            {game.awayScore}
          </span>
          <span className="text-muted-foreground">@</span>
          <span className={`text-xl font-bold ${(game.homeScore || 0) > (game.awayScore || 0) ? "text-gold" : "text-muted-foreground"}`}>
            {game.homeScore}
          </span>
          {isUserGame && (
            <Badge variant="outline" className={`text-[9px] ml-1 ${userWon ? "border-green-600 text-green-400" : "border-red-600 text-red-400"}`}>
              {userWon ? "W" : "L"}
            </Badge>
          )}
        </button>
      ) : (
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">@</span>
        </div>
      )}

      <div className="flex-1 flex items-center justify-end gap-3">
        <span className="font-medium text-sm">{game.homeTeam.name}</span>
        <TeamBadge
          abbreviation={game.homeTeam.abbreviation}
          primaryColor={game.homeTeam.primaryColor}
          secondaryColor={game.homeTeam.secondaryColor}
          size="sm"
        />
      </div>

      <div className="flex items-center gap-1">
        {!game.isComplete && (
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
        )}
        <RetroButton
          variant="outline"
          size="sm"
          onClick={onEdit}
          data-testid={`button-edit-game-${game.id}`}
        >
          {game.isComplete ? <Check className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
        </RetroButton>
      </div>
    </div>
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
                      <TeamBadge abbreviation={game.awayTeam.abbreviation} primaryColor={game.awayTeam.primaryColor} secondaryColor={game.awayTeam.secondaryColor} size="sm" />
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
                      <TeamBadge abbreviation={game.homeTeam.abbreviation} primaryColor={game.homeTeam.primaryColor} secondaryColor={game.homeTeam.secondaryColor} size="sm" />
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
      <main className="container mx-auto px-4 py-6 space-y-6">
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
