import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Calendar, Check, Edit2 } from "lucide-react";
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
}

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [editingGame, setEditingGame] = useState<GameWithTeams | null>(null);
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

  const gamesByWeek = data?.games.reduce((acc, game) => {
    if (!acc[game.week]) acc[game.week] = [];
    acc[game.week].push(game);
    return acc;
  }, {} as Record<number, GameWithTeams[]>) || {};

  const weeks = Object.keys(gamesByWeek).map(Number).sort((a, b) => a - b);

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
        {weeks.map((week) => (
          <RetroCard key={week}>
            <RetroCardHeader className="flex items-center justify-between gap-4">
              <span>Week {week}</span>
              {week === data?.currentWeek && (
                <span className="text-[8px] text-gold bg-gold/20 px-2 py-1 rounded">Current</span>
              )}
            </RetroCardHeader>
            <RetroCardContent>
              <div className="space-y-4">
                {gamesByWeek[week].map((game) => (
                  <GameRow
                    key={game.id}
                    game={game}
                    onEdit={() => setEditingGame(game)}
                  />
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>
        ))}

        {weeks.length === 0 && (
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
    </div>
  );
}

function GameRow({ game, onEdit }: { game: GameWithTeams; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-muted/30 rounded" data-testid={`card-game-${game.id}`}>
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
        <div className="flex items-center gap-4">
          <span className={`text-xl font-bold ${(game.awayScore || 0) > (game.homeScore || 0) ? "text-gold" : "text-muted-foreground"}`}>
            {game.awayScore}
          </span>
          <span className="text-muted-foreground">@</span>
          <span className={`text-xl font-bold ${(game.homeScore || 0) > (game.awayScore || 0) ? "text-gold" : "text-muted-foreground"}`}>
            {game.homeScore}
          </span>
        </div>
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

      <RetroButton
        variant="outline"
        size="sm"
        onClick={onEdit}
        data-testid={`button-edit-game-${game.id}`}
      >
        {game.isComplete ? <Check className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
      </RetroButton>
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
          <Skeleton className="h-6 w-48" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 mb-6" />
        ))}
      </main>
    </div>
  );
}
