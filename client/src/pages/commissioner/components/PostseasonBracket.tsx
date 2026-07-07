import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";

export interface PostseasonGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  phase: string;
  bracketType?: string;
  bracketRound?: number;
  bracketSide?: string;
  homeSeed?: number;
  awaySeed?: number;
  homeTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
}

interface PostseasonData {
  phase: string;
  conferenceChampionships: PostseasonGame[];
  superRegionals: PostseasonGame[];
  cws: PostseasonGame[];
}

const PHASE_LABELS: Record<string, string> = {
  conference_championship: "Conference Championships",
  super_regionals: "Super Regionals",
  cws: "College World Series",
  offseason: "Postseason Complete",
};

const WB_LABELS: Record<number, string> = { 1: "WB R1", 2: "WB R2", 3: "WB Semis", 4: "WB Final" };
const LB_LABELS: Record<number, string> = {
  2: "LBR1",
  3: "LBR2",
  4: "LB Qtrs",
  5: "LB Semis",
  6: "LBR5",
  7: "LB Final",
};

function GameCard({ game }: { game: PostseasonGame }) {
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div className="bg-muted/30 rounded p-2 border border-border" data-testid={`game-card-${game.id}`}>
      <div
        className={`flex items-center justify-between gap-2 py-1 ${
          homeWon ? "text-gold" : awayWon ? "text-muted-foreground" : ""
        }`}
      >
        <span className="text-xs font-medium truncate">{game.homeTeam?.abbreviation || "TBD"}</span>
        <span className="text-xs font-pixel">{game.isComplete ? game.homeScore : "-"}</span>
      </div>
      <div className="border-t border-border/50 my-0.5" />
      <div
        className={`flex items-center justify-between gap-2 py-1 ${
          awayWon ? "text-gold" : homeWon ? "text-muted-foreground" : ""
        }`}
      >
        <span className="text-xs font-medium truncate">{game.awayTeam?.abbreviation || "TBD"}</span>
        <span className="text-xs font-pixel">{game.isComplete ? game.awayScore : "-"}</span>
      </div>
      {!game.isComplete && (
        <div className="text-center mt-1">
          <Badge variant="outline" className="text-[8px]">
            Upcoming
          </Badge>
        </div>
      )}
    </div>
  );
}

function CWSSeriesStatus({ games }: { games: PostseasonGame[] }) {
  const completedGames = games.filter((g) => g.isComplete);
  if (completedGames.length === 0) return null;

  const winsMap: Record<string, { name: string; wins: number }> = {};
  for (const g of completedGames) {
    const winnerId =
      (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    const winnerTeam = winnerId === g.homeTeamId ? g.homeTeam : g.awayTeam;
    if (!winsMap[winnerId]) winsMap[winnerId] = { name: winnerTeam?.abbreviation || "TBD", wins: 0 };
    winsMap[winnerId].wins++;
  }

  const entries = Object.values(winsMap);
  const champion = entries.find((e) => e.wins >= 2);

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {champion ? (
        <div className="text-center">
          <Trophy className="w-6 h-6 text-gold mx-auto mb-1" />
          <p className="font-pixel text-gold text-xs" data-testid="text-cws-champion">
            {champion.name} Wins the CWS!
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 text-xs">
          {entries.map((e) => (
            <span key={e.name} className="font-pixel">
              {e.name}: {e.wins} {e.wins === 1 ? "win" : "wins"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BracketDisplay({ games }: { games: PostseasonGame[] }) {
  const hasDoubleElim = games.some(
    (g) =>
      (g.bracketType === "winners" ||
        g.bracketType === "losers" ||
        g.bracketType === "grand_final" ||
        g.bracketType === "grand_final_reset") &&
      !g.bracketSide,
  );

  if (!hasDoubleElim) {
    const completedGames = games.filter((g) => g.isComplete);
    const upcomingGames = games.filter((g) => !g.isComplete);
    return (
      <div className="space-y-3">
        {completedGames.length > 0 && (
          <div>
            <p className="text-[9px] text-muted-foreground font-pixel mb-1">Completed</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {completedGames.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        )}
        {upcomingGames.length > 0 && (
          <div>
            <p className="text-[9px] text-muted-foreground font-pixel mb-1">Next Round</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {upcomingGames.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const wbGames = games.filter((g) => g.bracketType === "winners");
  const lbGames = games.filter((g) => g.bracketType === "losers");
  const gfGame = games.find((g) => g.bracketType === "grand_final");
  const gfResetGm = games.find((g) => g.bracketType === "grand_final_reset");

  const wbRounds = Array.from(new Set(wbGames.map((g) => g.bracketRound ?? 1))).sort((a, b) => a - b);
  const lbRounds = Array.from(new Set(lbGames.map((g) => g.bracketRound ?? 2))).sort((a, b) => a - b);

  const lossMap: Record<string, number> = {};
  for (const g of [...wbGames, ...lbGames].filter((g2) => g2.isComplete)) {
    const loserId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.awayTeamId : g.homeTeamId;
    lossMap[loserId] = (lossMap[loserId] ?? 0) + 1;
  }

  const getWinner = (g: PostseasonGame) => {
    if (!g.isComplete) return null;
    return (g.homeScore ?? 0) > (g.awayScore ?? 0)
      ? { abbr: g.homeTeam?.abbreviation || "TBD", seed: g.homeSeed }
      : { abbr: g.awayTeam?.abbreviation || "TBD", seed: g.awaySeed };
  };

  const wbFinal = wbGames.find((g) => g.bracketRound === 4);
  const lbFinal = lbGames.find((g) => g.bracketRound === 7);
  const wbChamp = wbFinal?.isComplete ? getWinner(wbFinal) : null;
  const lbChamp = lbFinal?.isComplete ? getWinner(lbFinal) : null;
  const srChamp = gfResetGm?.isComplete
    ? getWinner(gfResetGm)
    : gfGame?.isComplete
    ? getWinner(gfGame)
    : null;

  const wbR2Games = wbGames.filter((g) => (g.bracketRound ?? 1) === 2);
  let byeSeedAbbr: string | null = null;
  for (const g of wbR2Games) {
    if (g.homeSeed === 1) {
      byeSeedAbbr = g.homeTeam?.abbreviation ?? "1 Seed";
      break;
    }
    if (g.awaySeed === 1) {
      byeSeedAbbr = g.awayTeam?.abbreviation ?? "1 Seed";
      break;
    }
  }
  if (!byeSeedAbbr) {
    for (const g of wbGames) {
      if (g.homeSeed === 1) {
        byeSeedAbbr = g.homeTeam?.abbreviation ?? "1 Seed";
        break;
      }
      if (g.awaySeed === 1) {
        byeSeedAbbr = g.awayTeam?.abbreviation ?? "1 Seed";
        break;
      }
    }
  }

  const lossTag = (teamId: string) => {
    const l = lossMap[teamId] ?? 0;
    return l > 0 ? (
      <span className="ml-1 text-[7px] text-amber-400/70">{l}L</span>
    ) : null;
  };

  const CommGameCard = ({ game, label }: { game: PostseasonGame; label?: string }) => {
    const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
    const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);
    return (
      <div className="bg-muted/30 rounded p-1.5 border border-border text-[10px]">
        {label && (
          <p className="text-[7px] font-pixel text-muted-foreground mb-0.5 uppercase">{label}</p>
        )}
        <div
          className={`flex items-center justify-between gap-1 py-0.5 ${
            homeWon ? "text-gold" : awayWon ? "text-muted-foreground" : ""
          }`}
        >
          <span className="truncate flex-1">
            {game.homeTeam?.abbreviation || "TBD"}
            {lossTag(game.homeTeamId)}
          </span>
          <span className="font-pixel flex-shrink-0">{game.isComplete ? game.homeScore : "-"}</span>
        </div>
        <div className="border-t border-border/30 my-0.5" />
        <div
          className={`flex items-center justify-between gap-1 py-0.5 ${
            awayWon ? "text-gold" : homeWon ? "text-muted-foreground" : ""
          }`}
        >
          <span className="truncate flex-1">
            {game.awayTeam?.abbreviation || "TBD"}
            {lossTag(game.awayTeamId)}
          </span>
          <span className="font-pixel flex-shrink-0">{game.isComplete ? game.awayScore : "-"}</span>
        </div>
        {!game.isComplete && (
          <p className="text-[7px] text-center text-muted-foreground/50 mt-0.5">Upcoming</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <p className="text-[8px] font-pixel text-gold uppercase">Winners Bracket</p>
          {wbRounds.map((r) => (
            <div key={r} className="space-y-1">
              <p className="text-[7px] font-pixel text-muted-foreground uppercase">
                {WB_LABELS[r] ?? `WB R${r}`}
              </p>
              {wbGames
                .filter((g) => (g.bracketRound ?? 1) === r)
                .map((g) => (
                  <CommGameCard key={g.id} game={g} />
                ))}
              {r === 1 && byeSeedAbbr && (
                <div className="bg-muted/20 border border-gold/20 rounded px-1.5 py-1 text-center">
                  <p className="text-[6px] font-pixel text-gold/70 uppercase">#1 Seed — BYE</p>
                  <p className="text-[7px] font-pixel text-muted-foreground">
                    {byeSeedAbbr} → WBR2
                  </p>
                </div>
              )}
            </div>
          ))}
          {wbChamp && !gfGame && (
            <div className="bg-gold/10 border border-gold/30 rounded px-2 py-1 text-center">
              <p className="text-[6px] font-pixel text-muted-foreground">WB CHAMPION</p>
              <p className="text-gold font-pixel text-[9px]">{wbChamp.abbr}</p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-[8px] font-pixel text-amber-400 uppercase">Losers Bracket</p>
          {lbRounds.map((r) => (
            <div key={r} className="space-y-1">
              <p className="text-[7px] font-pixel text-muted-foreground uppercase">
                {LB_LABELS[r] ?? `LB R${r}`}
              </p>
              {lbGames
                .filter((g) => (g.bracketRound ?? 2) === r)
                .map((g) => (
                  <CommGameCard key={g.id} game={g} />
                ))}
            </div>
          ))}
          {lbChamp && !gfGame && (
            <div className="bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1 text-center">
              <p className="text-[6px] font-pixel text-muted-foreground">LB CHAMPION</p>
              <p className="text-amber-400 font-pixel text-[9px]">{lbChamp.abbr}</p>
            </div>
          )}
        </div>
      </div>
      {gfGame && (
        <div className="border-t border-gold/20 pt-2 space-y-1">
          <p className="text-[8px] font-pixel text-gold uppercase text-center">Grand Final</p>
          <div className="max-w-[200px] mx-auto space-y-1">
            <CommGameCard game={gfGame} label="Grand Final" />
            {gfResetGm && <CommGameCard game={gfResetGm} label="If Necessary (Reset)" />}
          </div>
          {srChamp && (
            <div className="bg-gold/10 border border-gold/30 rounded px-2 py-1 text-center max-w-[200px] mx-auto">
              <p className="text-[6px] font-pixel text-muted-foreground">SR CHAMPION → CWS</p>
              <p className="text-gold font-pixel text-[9px]">{srChamp.abbr}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PostseasonBracketProps {
  leagueId: string;
  phase: string;
}

export function PostseasonBracket({ leagueId, phase }: PostseasonBracketProps) {
  const { data } = useQuery<PostseasonData>({
    queryKey: ["/api/leagues", leagueId, "postseason"],
    enabled: !!leagueId,
    refetchInterval: 5000,
  });

  if (!data) return null;

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-3 w-full">
          <Trophy className="w-5 h-5 text-gold" />
          <span>{PHASE_LABELS[phase] || "Postseason"}</span>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {data.conferenceChampionships.length > 0 && (
          <div className="mb-4">
            <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">
              Conference Championships
            </h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {data.conferenceChampionships.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        )}

        {data.superRegionals.length > 0 && (
          <div className="mb-4">
            <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">
              Super Regionals Bracket
            </h4>
            <BracketDisplay games={data.superRegionals} />
          </div>
        )}

        {data.cws.length > 0 && (
          <div>
            <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">
              College World Series (Best of 3)
            </h4>
            <div className="space-y-2">
              {data.cws.map((game, i) => (
                <div key={game.id}>
                  <p className="text-[9px] text-muted-foreground font-pixel mb-1">Game {i + 1}</p>
                  <GameCard game={game} />
                </div>
              ))}
            </div>
            <CWSSeriesStatus games={data.cws} />
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}
