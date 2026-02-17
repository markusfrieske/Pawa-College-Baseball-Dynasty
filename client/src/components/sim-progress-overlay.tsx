import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, Zap } from "lucide-react";

export interface SimGameResult {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  isConference?: boolean;
  isUserTeam?: boolean;
}

export interface SimWeekResult {
  week: number;
  phase: string;
  games: SimGameResult[];
}

export interface SimPostseasonResult {
  phase: string;
  games: SimGameResult[];
}

export interface SimSummary {
  weekResults: SimWeekResult[];
  postseasonResults: SimPostseasonResult[];
}

interface SimProgressOverlayProps {
  open: boolean;
  onClose: () => void;
  simSummary: SimSummary | null;
  userTeamName?: string;
}

function formatPhase(phase: string): string {
  const map: Record<string, string> = {
    preseason: "Preseason",
    spring_training: "Spring Training",
    regular_season: "Regular Season",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
  };
  return map[phase] || phase;
}

function GameRow({ game, userTeamName }: { game: SimGameResult; userTeamName?: string }) {
  const isUserGame = game.isUserTeam;
  const isCloseGame = Math.abs(game.homeScore - game.awayScore) <= 1;
  const homeWon = game.homeScore > game.awayScore;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
        isUserGame ? "bg-gold/10 border border-gold/30" : ""
      }`}
      data-testid={`sim-game-${game.homeTeam}-vs-${game.awayTeam}`}
    >
      {isUserGame && <Star className="w-3 h-3 text-gold flex-shrink-0" />}
      {isCloseGame && !isUserGame && <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
      <span
        className={`flex-1 text-right truncate ${
          homeWon ? "text-foreground font-semibold" : "text-muted-foreground"
        } ${isUserGame && game.homeTeam.includes(userTeamName || "__none__") ? "text-gold" : ""}`}
      >
        {game.homeTeam}
      </span>
      <span className="font-pixel text-[9px] text-foreground min-w-[40px] text-center">
        {game.homeScore} - {game.awayScore}
      </span>
      <span
        className={`flex-1 truncate ${
          !homeWon ? "text-foreground font-semibold" : "text-muted-foreground"
        } ${isUserGame && game.awayTeam.includes(userTeamName || "__none__") ? "text-gold" : ""}`}
      >
        {game.awayTeam}
      </span>
      {game.isConference && (
        <Badge variant="outline" className="text-[7px] px-1 py-0 flex-shrink-0">
          CONF
        </Badge>
      )}
    </div>
  );
}

export function SimProgressOverlay({ open, onClose, simSummary, userTeamName }: SimProgressOverlayProps) {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalSections = (simSummary?.weekResults.length ?? 0) + (simSummary?.postseasonResults.length ?? 0);
  const animationDone = skipped || visibleIndex >= totalSections;

  useEffect(() => {
    if (!open) {
      setVisibleIndex(0);
      setSkipped(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !simSummary || skipped || animationDone) return;

    const timer = setTimeout(() => {
      setVisibleIndex(prev => prev + 1);
    }, 250);

    return () => clearTimeout(timer);
  }, [open, simSummary, visibleIndex, skipped, animationDone]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleIndex]);

  const handleSkip = () => {
    setSkipped(true);
    setVisibleIndex(totalSections);
  };

  if (!simSummary) return null;

  const weekResults = simSummary.weekResults;
  const postseasonResults = simSummary.postseasonResults;
  const displayCount = skipped ? totalSections : visibleIndex;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-card border-border p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="font-pixel text-gold text-sm tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Season Simulation
          </DialogTitle>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
          onClick={!animationDone ? handleSkip : undefined}
          data-testid="sim-progress-scroll-area"
        >
          {!animationDone && (
            <p className="text-[9px] text-muted-foreground font-pixel text-center animate-pulse">
              Click to skip animation...
            </p>
          )}

          {weekResults.slice(0, Math.min(displayCount, weekResults.length)).map((week, i) => (
            <div key={`week-${i}`} className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-pixel text-[9px] text-gold">
                  Week {week.week}
                </h3>
                <span className="text-[8px] text-muted-foreground font-pixel">
                  {formatPhase(week.phase)}
                </span>
                <div className="flex-1 border-t border-border/50" />
              </div>
              <div className="space-y-0.5">
                {week.games.map((game, j) => (
                  <GameRow key={j} game={game} userTeamName={userTeamName} />
                ))}
              </div>
            </div>
          ))}

          {displayCount > weekResults.length &&
            postseasonResults.slice(0, displayCount - weekResults.length).map((ps, i) => (
              <div key={`ps-${i}`} className="space-y-1 pt-2">
                <div className="flex items-center gap-2">
                  <Trophy className="w-3 h-3 text-gold" />
                  <h3 className="font-pixel text-[10px] text-gold">
                    {ps.phase}
                  </h3>
                  <div className="flex-1 border-t border-gold/30" />
                </div>
                <div className="space-y-0.5">
                  {ps.games.map((game, j) => (
                    <GameRow key={j} game={game} userTeamName={userTeamName} />
                  ))}
                </div>
              </div>
            ))}

          {animationDone && totalSections === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No games were simulated.
            </p>
          )}
        </div>

        <div className="p-4 pt-2 border-t border-border flex justify-end gap-2">
          {animationDone ? (
            <RetroButton
              onClick={onClose}
              data-testid="sim-overlay-continue"
            >
              Continue
            </RetroButton>
          ) : (
            <RetroButton
              variant="outline"
              size="sm"
              onClick={handleSkip}
              data-testid="sim-overlay-skip"
            >
              Skip
            </RetroButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}