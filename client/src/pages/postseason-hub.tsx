import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroCard, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ArrowLeft, Star, ChevronRight } from "lucide-react";
import { ArtworkBackground } from "@/components/artwork-background";
import { artBackgrounds } from "@/lib/art-assets";

// ─── Types ─────────────────────────────────────────────────────────────────

interface TeamInfo {
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  conferenceName?: string;
}

interface PostseasonGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  phase: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  homeSeed?: number;
  awaySeed?: number;
  bracketSide?: string;
  bracketRound?: number;
  bracketType?: string;
  boxScore?: string;
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

interface BatterStat {
  name: string;
  teamAbbr: string;
  avg: string;
  obp: string;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
}

interface PitcherStat {
  name: string;
  teamAbbr: string;
  era: string;
  ip: number;
  so: number;
  bb: number;
  wins: number;
  losses: number;
}

interface PostseasonData {
  phase: string;
  season: number;
  conferenceChampionships: PostseasonGame[];
  superRegionals: PostseasonGame[];
  cws: PostseasonGame[];
  seeds: SeedEntry[];
  confStandings: ConfStandings[];
  stats?: { topBatters: BatterStat[]; topPitchers: PitcherStat[] };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getWinner(g: PostseasonGame): string | null {
  if (!g.isComplete) return null;
  return (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    conference_championship: "Conference Championships",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason: "Offseason",
    preseason: "Preseason",
    regular_season: "Regular Season",
  };
  return map[phase] ?? phase.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Bracket node game card with hover box score ───────────────────────────

function BracketNode({
  game,
  seeds,
}: {
  game: PostseasonGame;
  seeds: SeedEntry[];
}) {
  const [hovered, setHovered] = useState(false);
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  const homeSeedEntry = seeds.find(s => s.teamId === game.homeTeamId);
  const awaySeedEntry = seeds.find(s => s.teamId === game.awayTeamId);

  // Parse box score for hover detail
  let homeLineScore: number[] = [];
  let awayLineScore: number[] = [];
  if (game.isComplete && game.boxScore) {
    try {
      const box = JSON.parse(game.boxScore);
      homeLineScore = (box.home?.inningScores || []).slice(0, 9);
      awayLineScore = (box.away?.inningScores || []).slice(0, 9);
    } catch {}
  }
  const hasBoxScore = homeLineScore.length > 0 || awayLineScore.length > 0;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid={`bracket-node-${game.id}`}
    >
      <div
        className={`border rounded bg-muted/30 min-w-[130px] cursor-default transition-colors
          ${game.isComplete ? "border-border" : "border-gold/30"}`}
      >
        {/* Home team row */}
        <div
          className={`flex items-start gap-1 px-2 py-1.5 rounded-t
            ${homeWon ? "bg-gold/10" : ""}`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {(game.homeSeed ?? 0) > 0 && (
              <span className="text-[9px] font-pixel text-gold w-4 flex-shrink-0 leading-none pt-0.5">
                {game.homeSeed}
              </span>
            )}
            <div className="min-w-0">
              <p className={`text-[10px] leading-tight truncate font-medium
                ${homeWon ? "text-gold" : awayWon ? "text-muted-foreground/70" : ""}`}>
                {game.homeTeam?.name || "TBD"}
              </p>
              <p className="text-[8px] text-muted-foreground leading-tight">
                {homeSeedEntry?.conferenceName || game.homeTeam?.conferenceName || ""}
                {homeSeedEntry && <span className="ml-1 opacity-70">{homeSeedEntry.wins}-{homeSeedEntry.losses}</span>}
              </p>
            </div>
          </div>
          <span className={`text-[10px] font-pixel flex-shrink-0 ml-1 pt-0.5
            ${homeWon ? "text-gold font-bold" : "text-muted-foreground"}`}>
            {game.isComplete ? game.homeScore : "-"}
          </span>
        </div>

        <div className="border-t border-border/30" />

        {/* Away team row */}
        <div
          className={`flex items-start gap-1 px-2 py-1.5 rounded-b
            ${awayWon ? "bg-gold/10" : ""}`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {(game.awaySeed ?? 0) > 0 && (
              <span className="text-[9px] font-pixel text-gold w-4 flex-shrink-0 leading-none pt-0.5">
                {game.awaySeed}
              </span>
            )}
            <div className="min-w-0">
              <p className={`text-[10px] leading-tight truncate font-medium
                ${awayWon ? "text-gold" : homeWon ? "text-muted-foreground/70" : ""}`}>
                {game.awayTeam?.name || "TBD"}
              </p>
              <p className="text-[8px] text-muted-foreground leading-tight">
                {awaySeedEntry?.conferenceName || game.awayTeam?.conferenceName || ""}
                {awaySeedEntry && <span className="ml-1 opacity-70">{awaySeedEntry.wins}-{awaySeedEntry.losses}</span>}
              </p>
            </div>
          </div>
          <span className={`text-[10px] font-pixel flex-shrink-0 ml-1 pt-0.5
            ${awayWon ? "text-gold font-bold" : "text-muted-foreground"}`}>
            {game.isComplete ? game.awayScore : "-"}
          </span>
        </div>

        {!game.isComplete && (
          <div className="border-t border-border/30 px-2 py-0.5 text-center">
            <span className="text-[7px] font-pixel text-gold/60">UPCOMING</span>
          </div>
        )}
      </div>

      {/* Hover box score overlay */}
      {hovered && game.isComplete && hasBoxScore && (
        <div className="absolute z-50 bottom-full mb-1 left-0 bg-background border border-gold/30 rounded shadow-xl p-2 min-w-[200px]">
          <p className="text-[8px] font-pixel text-gold mb-1.5">Box Score</p>
          <table className="text-[9px] w-full">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal w-16">Team</th>
                {homeLineScore.map((_, i) => (
                  <th key={i} className="text-center font-normal w-4">{i + 1}</th>
                ))}
                <th className="text-center font-normal w-6 border-l border-border/30">R</th>
              </tr>
            </thead>
            <tbody>
              <tr className={homeWon ? "text-gold" : "text-muted-foreground"}>
                <td className="truncate font-medium">{game.homeTeam?.abbreviation}</td>
                {homeLineScore.map((s, i) => <td key={i} className="text-center">{s}</td>)}
                <td className="text-center font-pixel border-l border-border/30">{game.homeScore}</td>
              </tr>
              <tr className={awayWon ? "text-gold" : "text-muted-foreground"}>
                <td className="truncate font-medium">{game.awayTeam?.abbreviation}</td>
                {awayLineScore.map((s, i) => <td key={i} className="text-center">{s}</td>)}
                <td className="text-center font-pixel border-l border-border/30">{game.awayScore}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Bracket side view ─────────────────────────────────────────────────────

function BracketSideView({
  games,
  side,
  sideLabel,
  seeds,
}: {
  games: PostseasonGame[];
  side: string;
  sideLabel: string;
  seeds: SeedEntry[];
}) {
  // Filter by bracketType ("winners" or "losers") — bracketType is reliably written
  // to the DB; bracketSide was not, so we no longer rely on it.
  const sideGames = games.filter(g => g.bracketType === side);
  if (sideGames.length === 0) return null;

  const minRound = Math.min(...sideGames.map(g => g.bracketRound ?? 1));
  const maxRound = Math.max(...sideGames.map(g => g.bracketRound ?? 1));
  const rounds: PostseasonGame[][] = [];
  for (let r = minRound; r <= maxRound; r++) {
    const rg = sideGames.filter(g => (g.bracketRound ?? 1) === r);
    if (rg.length > 0) rounds.push(rg);
  }

  // Detect bye teams: seeded teams that appear in round 2+ but not round 1.
  // This handles the #1 seed WBR1 bye and any LBR1 bye.
  const r1TeamIds = new Set<string>();
  rounds[0]?.forEach(g => { r1TeamIds.add(g.homeTeamId); r1TeamIds.add(g.awayTeamId); });

  const byeSeeds = seeds.filter(s => {
    if (r1TeamIds.has(s.teamId)) return false;
    return sideGames.some(g => g.homeTeamId === s.teamId || g.awayTeamId === s.teamId);
  });

  // CWS bound box
  const lastRound = rounds[rounds.length - 1];
  const finalGame = lastRound?.length === 1 ? lastRound[0] : null;
  const cwsTeamId = finalGame?.isComplete ? getWinner(finalGame) : null;
  const cwsSeed = cwsTeamId ? seeds.find(s => s.teamId === cwsTeamId) : null;

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-pixel text-gold text-center mb-2 uppercase tracking-wide">
        {sideLabel}
      </p>
      <div className="flex items-start gap-3 overflow-x-auto pb-2">
        {/* Byes column */}
        {byeSeeds.length > 0 && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1 text-center">Byes</p>
            {byeSeeds.map(s => (
              <div
                key={s.teamId}
                className="border border-gold/30 rounded bg-gold/5 px-2 py-2 min-w-[130px]"
              >
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-pixel text-gold w-4">{s.seed}</span>
                  <div>
                    <p className="text-[10px] font-medium truncate">{s.name}</p>
                    <p className="text-[8px] text-muted-foreground">
                      {s.conferenceName}
                      <span className="ml-1 opacity-70">{s.wins}-{s.losses}</span>
                    </p>
                  </div>
                </div>
                <p className="text-[7px] font-pixel text-gold/50 mt-1 text-center">BYE</p>
              </div>
            ))}
          </div>
        )}

        {/* Round columns */}
        {rounds.map((roundGames, ri) => (
          <div key={ri} className="flex flex-col gap-2 flex-shrink-0">
            <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1 text-center">
              {ri === rounds.length - 1 && rounds.length > 1 ? "Semifinal" : `Round ${ri + 1}`}
            </p>
            {roundGames.map(g => (
              <BracketNode key={g.id} game={g} seeds={seeds} />
            ))}
          </div>
        ))}

        {/* CWS Bound */}
        <div className="flex flex-col justify-center flex-shrink-0">
          <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1 text-center">CWS Bound</p>
          {cwsTeamId ? (
            <div className="border border-gold/30 rounded bg-gold/10 px-2 py-2 min-w-[80px] text-center">
              {cwsSeed ? (
                <>
                  <span className="text-[9px] font-pixel text-gold mr-1">{cwsSeed.seed}</span>
                  <span className="text-[10px] font-pixel text-gold">{cwsSeed.abbreviation}</span>
                  <p className="text-[8px] text-muted-foreground mt-0.5">{cwsSeed.conferenceName}</p>
                </>
              ) : (
                <span className="text-[10px] font-pixel text-gold">
                  {cwsTeamId === finalGame?.homeTeamId
                    ? finalGame?.homeTeam?.abbreviation
                    : finalGame?.awayTeam?.abbreviation}
                </span>
              )}
            </div>
          ) : (
            <div className="border border-border/50 rounded bg-muted/20 px-2 py-2 min-w-[80px] text-center">
              <p className="text-[10px] font-pixel text-muted-foreground">TBD</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Conference Championship card ──────────────────────────────────────────

function ConfChampSection({
  game,
  standings,
}: {
  game: PostseasonGame;
  standings: ConfStandings | undefined;
}) {
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  const confName = game.homeTeam?.conferenceName
    || standings?.name
    || "Conference";

  return (
    <div className="border border-border rounded bg-muted/20 overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="text-[10px] font-pixel text-gold truncate pr-2">{confName} Championship</span>
        {game.isComplete ? (
          <Badge className="text-[8px] bg-green-500/20 text-green-400 border-green-500/30 flex-shrink-0">Final</Badge>
        ) : (
          <Badge variant="outline" className="text-[8px] text-gold border-gold/30 flex-shrink-0">Upcoming</Badge>
        )}
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {/* Home team */}
        <div className={`flex items-center justify-between ${homeWon ? "text-gold" : awayWon ? "text-muted-foreground" : ""}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {(game.homeSeed ?? 0) > 0 && (
              <span className="text-[9px] font-pixel text-gold w-4 flex-shrink-0">{game.homeSeed}</span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{game.homeTeam?.name || "TBD"}</p>
              {standings && (
                <p className="text-[8px] text-muted-foreground">
                  {standings.teams.find(t => t.teamId === game.homeTeamId)
                    ? `${standings.teams.find(t => t.teamId === game.homeTeamId)!.confWins}-${standings.teams.find(t => t.teamId === game.homeTeamId)!.confLosses} conf`
                    : ""}
                </p>
              )}
            </div>
            {homeWon && <Trophy className="w-3 h-3 text-gold ml-1 flex-shrink-0" />}
          </div>
          <span className="text-sm font-pixel ml-2">{game.isComplete ? game.homeScore : "-"}</span>
        </div>

        {/* Away team */}
        <div className={`flex items-center justify-between ${awayWon ? "text-gold" : homeWon ? "text-muted-foreground" : ""}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {(game.awaySeed ?? 0) > 0 && (
              <span className="text-[9px] font-pixel text-gold w-4 flex-shrink-0">{game.awaySeed}</span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{game.awayTeam?.name || "TBD"}</p>
              {standings && (
                <p className="text-[8px] text-muted-foreground">
                  {standings.teams.find(t => t.teamId === game.awayTeamId)
                    ? `${standings.teams.find(t => t.teamId === game.awayTeamId)!.confWins}-${standings.teams.find(t => t.teamId === game.awayTeamId)!.confLosses} conf`
                    : ""}
                </p>
              )}
            </div>
            {awayWon && <Trophy className="w-3 h-3 text-gold ml-1 flex-shrink-0" />}
          </div>
          <span className="text-sm font-pixel ml-2">{game.isComplete ? game.awayScore : "-"}</span>
        </div>
      </div>

      {/* Conf standings — all teams */}
      {standings && (
        <div className="border-t border-border/40 px-3 py-2">
          <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1">Conf Standings</p>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[8px] text-muted-foreground">
                <th className="text-left font-normal py-0.5">Team</th>
                <th className="text-center font-normal w-12">Conf</th>
                <th className="text-center font-normal w-10">Pct</th>
                <th className="text-right font-normal w-12">Overall</th>
              </tr>
            </thead>
            <tbody>
              {standings.teams.map(row => {
                const total = row.confWins + row.confLosses;
                const pct = total > 0 ? (row.confWins / total).toFixed(3) : ".000";
                return (
                  <tr key={row.teamId} className="border-t border-border/20">
                    <td className="py-0.5 truncate max-w-[90px]">{row.abbreviation}</td>
                    <td className="text-center">{row.confWins}-{row.confLosses}</td>
                    <td className="text-center text-muted-foreground">{pct}</td>
                    <td className="text-right text-muted-foreground">{row.wins}-{row.losses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Conference Championship Bracket ───────────────────────────────────────
// Renders one card per conference, in a responsive grid.
// Scales from 1 column (mobile) → 2 → 3 → 4 columns as the viewport widens,
// which comfortably fits 12 conference matchups without horizontal overflow.

function ConfChampBracket({
  games,
  seeds,
}: {
  games: PostseasonGame[];
  seeds: SeedEntry[];
}) {
  if (games.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {games.map(game => {
        const winnerId = getWinner(game);
        const winnerTeam = winnerId
          ? (winnerId === game.homeTeamId ? game.homeTeam : game.awayTeam)
          : null;
        const winnerSeed = winnerId ? seeds.find(s => s.teamId === winnerId) : null;
        const confName = game.homeTeam?.conferenceName || "Conference";

        return (
          <div key={game.id} className="flex items-start gap-2">
            {/* Matchup column */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1 text-center truncate">
                {confName}
              </p>
              <BracketNode game={game} seeds={seeds} />
            </div>

            {/* Arrow */}
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-5" />

            {/* SR Bound box */}
            <div className="flex flex-col flex-shrink-0">
              <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1 text-center">SR Bound</p>
              {winnerId ? (
                <div className="border border-gold/30 rounded bg-gold/10 px-2 py-2 min-w-[72px] text-center">
                  {winnerSeed ? (
                    <>
                      <span className="text-[9px] font-pixel text-gold mr-1">{winnerSeed.seed}</span>
                      <span className="text-[10px] font-pixel text-gold">{winnerSeed.abbreviation}</span>
                      <p className="text-[8px] text-muted-foreground mt-0.5">{winnerSeed.conferenceName}</p>
                    </>
                  ) : (
                    <span className="text-[10px] font-pixel text-gold">
                      {winnerTeam?.abbreviation || "—"}
                    </span>
                  )}
                </div>
              ) : (
                <div className="border border-border/50 rounded bg-muted/20 px-2 py-2 min-w-[72px] text-center">
                  <p className="text-[10px] font-pixel text-muted-foreground">TBD</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── CWS section ───────────────────────────────────────────────────────────

function CWSSection({ games, seeds }: { games: PostseasonGame[]; seeds: SeedEntry[] }) {
  const completedGames = games.filter(g => g.isComplete);
  const winsMap: Record<string, { team: TeamInfo; wins: number; seed?: SeedEntry }> = {};
  for (const g of completedGames) {
    const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    const wTeam = wId === g.homeTeamId ? g.homeTeam : g.awayTeam;
    if (!winsMap[wId]) winsMap[wId] = { team: wTeam, wins: 0, seed: seeds.find(s => s.teamId === wId) };
    winsMap[wId].wins++;
  }
  const champion = Object.values(winsMap).find(e => e.wins >= 2);
  const homeId = games[0]?.homeTeamId;
  const awayId = games[0]?.awayTeamId;

  return (
    <div className="space-y-3">
      {/* Series score */}
      {homeId && awayId && (
        <div className="flex items-center justify-center gap-6 py-2 border border-border/30 rounded bg-muted/20">
          <div className="text-right">
            {seeds.find(s => s.teamId === homeId) && (
              <span className="text-[9px] font-pixel text-gold mr-1">{seeds.find(s => s.teamId === homeId)!.seed}</span>
            )}
            <span className="text-sm font-medium">{games[0]?.homeTeam?.abbreviation || "TBD"}</span>
            <p className="text-[8px] text-muted-foreground">{games[0]?.homeTeam?.conferenceName || ""}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-2 font-pixel text-xl">
              <span className={(winsMap[homeId]?.wins ?? 0) >= 2 ? "text-gold" : "text-muted-foreground"}>
                {winsMap[homeId]?.wins ?? 0}
              </span>
              <span className="text-muted-foreground text-sm">–</span>
              <span className={(winsMap[awayId]?.wins ?? 0) >= 2 ? "text-gold" : "text-muted-foreground"}>
                {winsMap[awayId]?.wins ?? 0}
              </span>
            </div>
            <p className="text-[8px] text-muted-foreground font-pixel">Best of 3</p>
          </div>
          <div className="text-left">
            <span className="text-sm font-medium">{games[0]?.awayTeam?.abbreviation || "TBD"}</span>
            {seeds.find(s => s.teamId === awayId) && (
              <span className="text-[9px] font-pixel text-gold ml-1">{seeds.find(s => s.teamId === awayId)!.seed}</span>
            )}
            <p className="text-[8px] text-muted-foreground">{games[0]?.awayTeam?.conferenceName || ""}</p>
          </div>
        </div>
      )}

      {/* Individual games */}
      <div className="space-y-1">
        {games.map((g, i) => (
          <BracketNode key={g.id} game={g} seeds={seeds} />
        ))}
      </div>

      {/* Champion */}
      {champion && (
        <div className="mt-2 bg-gold/10 border border-gold/30 rounded p-4 text-center">
          <Trophy className="w-6 h-6 text-gold mx-auto mb-1" />
          <p className="font-pixel text-gold text-xs" data-testid="text-cws-champion">
            {champion.team?.name} — CWS Champion!
          </p>
          {champion.seed && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Seed #{champion.seed.seed} · {champion.seed.conferenceName}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Seeding sidebar ───────────────────────────────────────────────────────

function SeedingSidebar({ seeds }: { seeds: SeedEntry[] }) {
  return (
    <div className="space-y-1">
      {seeds.map(s => (
        <div
          key={s.teamId}
          className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20 border border-border/30 hover:border-gold/30 transition-colors"
          data-testid={`seed-row-${s.seed}`}
        >
          <span className="text-[10px] font-pixel text-gold w-5 flex-shrink-0">{s.seed}</span>
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: s.primaryColor || "#FFD700" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs truncate">{s.name}</p>
            <p className="text-[8px] text-muted-foreground truncate">{s.conferenceName}</p>
          </div>
          {s.isConfChamp && (
            <Star className="w-3 h-3 text-gold flex-shrink-0" title="Conference Champion" />
          )}
          <span className="text-[10px] text-muted-foreground flex-shrink-0 font-pixel">
            {s.wins}-{s.losses}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Stats panel ───────────────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: PostseasonData["stats"] }) {
  if (!stats) return null;
  const { topBatters, topPitchers } = stats;
  if (topBatters.length === 0 && topPitchers.length === 0) return null;

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {topBatters.length > 0 && (
        <div>
          <p className="text-[9px] font-pixel text-gold uppercase mb-2">Batting Leaders</p>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[8px] text-muted-foreground border-b border-border/30">
                <th className="text-left font-normal pb-1">Player</th>
                <th className="text-center font-normal pb-1 w-12">AVG</th>
                <th className="text-center font-normal pb-1 w-8">HR</th>
                <th className="text-center font-normal pb-1 w-8">RBI</th>
              </tr>
            </thead>
            <tbody>
              {topBatters.map((b, i) => (
                <tr key={i} className="border-t border-border/20">
                  <td className="py-1">
                    <p className="truncate max-w-[100px]">{b.name}</p>
                    <p className="text-[8px] text-muted-foreground">{b.teamAbbr}</p>
                  </td>
                  <td className="text-center font-pixel text-gold">{b.avg}</td>
                  <td className="text-center">{b.hr}</td>
                  <td className="text-center">{b.rbi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {topPitchers.length > 0 && (
        <div>
          <p className="text-[9px] font-pixel text-gold uppercase mb-2">Pitching Leaders</p>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[8px] text-muted-foreground border-b border-border/30">
                <th className="text-left font-normal pb-1">Player</th>
                <th className="text-center font-normal pb-1 w-12">ERA</th>
                <th className="text-center font-normal pb-1 w-8">IP</th>
                <th className="text-center font-normal pb-1 w-8">SO</th>
              </tr>
            </thead>
            <tbody>
              {topPitchers.map((p, i) => (
                <tr key={i} className="border-t border-border/20">
                  <td className="py-1">
                    <p className="truncate max-w-[100px]">{p.name}</p>
                    <p className="text-[8px] text-muted-foreground">{p.teamAbbr} · {p.wins}-{p.losses}</p>
                  </td>
                  <td className="text-center font-pixel text-gold">{p.era}</td>
                  <td className="text-center">{p.ip}</td>
                  <td className="text-center">{p.so}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── FS postseason types ────────────────────────────────────────────────────

interface FSSeries {
  id: string;
  bracketSlot: string;
  homeTeamId: string;
  awayTeamId: string;
  homeWins: number;
  awayWins: number;
  seriesStatus: string;
  winnerId?: string;
  homeTeam: { name: string; abbreviation: string } | null;
  awayTeam: { name: string; abbreviation: string } | null;
  winner: { name: string; abbreviation: string } | null;
}

interface FSEntry {
  teamId: string;
  nationalSeed: number;
  qualificationType: string;
  selectionReason: string;
  team: { name: string; abbreviation: string; primaryColor: string } | null;
  wins: number;
  losses: number;
}

interface FSCWSGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  bracketType: string | null;
  bracketRound: number | null;
  bracketSide?: string | null;
  homeTeam: { name: string; abbreviation: string } | null;
  awayTeam: { name: string; abbreviation: string } | null;
}

interface FSPostseasonPayload {
  season: number;
  entries: FSEntry[];
  srSeries: FSSeries[];
  cwsSeries: FSSeries[];
  cwsGames: FSCWSGame[];
  currentPhase: string;
  currentPhaseStep: string | null;
}

// ─── FS-specific components ─────────────────────────────────────────────────

function FSSRSeriesView({ srSeries }: { srSeries: FSSeries[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
      {srSeries.map(s => {
        const isDone = s.seriesStatus === "complete";
        const hw = s.winner && s.winner.name === s.homeTeam?.name;
        const aw = s.winner && s.winner.name === s.awayTeam?.name;
        return (
          <div
            key={s.id}
            className={`bg-muted/30 rounded p-2 border text-[10px] ${isDone ? "border-border" : "border-gold/30"}`}
            data-testid={`fs-sr-series-${s.bracketSlot}`}
          >
            <p className="text-[7px] font-pixel text-gold/70 uppercase mb-1">{s.bracketSlot}</p>
            <div className={`flex items-center justify-between py-0.5 ${hw ? "text-gold" : ""}`}>
              <span className="truncate flex-1">{s.homeTeam?.abbreviation || "TBD"}</span>
              <span className="font-pixel ml-1 text-xs">{s.homeWins}</span>
            </div>
            <div className="border-t border-border/30 my-0.5" />
            <div className={`flex items-center justify-between py-0.5 ${aw ? "text-gold" : ""}`}>
              <span className="truncate flex-1">{s.awayTeam?.abbreviation || "TBD"}</span>
              <span className="font-pixel ml-1 text-xs">{s.awayWins}</span>
            </div>
            <p className={`text-[7px] text-center font-pixel mt-0.5 ${isDone ? "text-gold" : "text-muted-foreground"}`}>
              {isDone && s.winner ? `${s.winner.abbreviation} wins` : "Bo3"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function FSCWSMiniGame({ g, label }: { g: FSCWSGame; label: string }) {
  const hw = g.isComplete && (g.homeScore ?? 0) > (g.awayScore ?? 0);
  const aw = g.isComplete && (g.awayScore ?? 0) > (g.homeScore ?? 0);
  return (
    <div className="bg-muted/20 rounded p-1.5 border border-border/50">
      <p className="text-[6px] font-pixel text-muted-foreground uppercase mb-0.5">{label}</p>
      <div className={`flex justify-between text-[9px] ${hw ? "text-gold" : aw ? "text-muted-foreground/60" : ""}`}>
        <span className="truncate">{g.homeTeam?.abbreviation || "TBD"}</span>
        <span className="font-pixel ml-1">{g.isComplete ? g.homeScore : "–"}</span>
      </div>
      <div className={`flex justify-between text-[9px] ${aw ? "text-gold" : hw ? "text-muted-foreground/60" : ""}`}>
        <span className="truncate">{g.awayTeam?.abbreviation || "TBD"}</span>
        <span className="font-pixel ml-1">{g.isComplete ? g.awayScore : "–"}</span>
      </div>
    </div>
  );
}

function FSCWSBracketView({ bracketId, games }: { bracketId: "A" | "B"; games: FSCWSGame[] }) {
  const g = (side: string, round: number) =>
    games.filter(x => x.bracketType === `cws_${bracketId}_${side}` && x.bracketRound === round);

  const wbr1 = g("W", 1);
  const wbr2 = g("W", 2);
  const lbr1 = g("L", 1);
  const lbr2 = g("L", 2);
  const bf1 = g("BF", 1);
  const bf2 = g("BF", 2);

  const gameWinner = (x: FSCWSGame) =>
    x.isComplete ? ((x.homeScore ?? 0) > (x.awayScore ?? 0) ? x.homeTeam : x.awayTeam) : null;

  const wbr2Winner = wbr2[0]?.isComplete ? gameWinner(wbr2[0]) : null;
  const bf1Winner = bf1[0]?.isComplete ? gameWinner(bf1[0]) : null;
  const bf2Winner = bf2[0]?.isComplete ? gameWinner(bf2[0]) : null;
  const bracketChamp = bf2Winner ?? (bf1Winner && wbr2Winner && bf1Winner.name === wbr2Winner.name ? wbr2Winner : null);

  if ([...wbr1, ...wbr2, ...lbr1, ...lbr2, ...bf1, ...bf2].length === 0) {
    return <p className="text-[9px] text-muted-foreground font-pixel text-center py-2">Awaiting bracket</p>;
  }

  return (
    <div className="space-y-2">
      {wbr1.length > 0 && (
        <div>
          <p className="text-[7px] font-pixel text-gold/70 uppercase mb-0.5">WBR1</p>
          <div className="space-y-1">
            {wbr1.map(x => <FSCWSMiniGame key={x.id} g={x} label={x.bracketSide ?? "WBR1"} />)}
          </div>
        </div>
      )}
      {(wbr2.length > 0 || lbr1.length > 0) && (
        <div className="grid grid-cols-2 gap-1">
          {wbr2.length > 0 && (
            <div>
              <p className="text-[7px] font-pixel text-gold/70 uppercase mb-0.5">WBR2</p>
              {wbr2.map(x => <FSCWSMiniGame key={x.id} g={x} label="WBR2" />)}
            </div>
          )}
          {lbr1.length > 0 && (
            <div>
              <p className="text-[7px] font-pixel text-amber-400/70 uppercase mb-0.5">LBR1</p>
              {lbr1.map(x => <FSCWSMiniGame key={x.id} g={x} label="LBR1" />)}
            </div>
          )}
        </div>
      )}
      {lbr2.length > 0 && (
        <div>
          <p className="text-[7px] font-pixel text-amber-400/70 uppercase mb-0.5">LBR2</p>
          {lbr2.map(x => <FSCWSMiniGame key={x.id} g={x} label="LBR2" />)}
        </div>
      )}
      {bf1.length > 0 && (
        <div>
          <p className="text-[7px] font-pixel text-gold uppercase mb-0.5">Bracket Final</p>
          <div className="space-y-1">
            {bf1.map(x => <FSCWSMiniGame key={x.id} g={x} label="BF1" />)}
            {bf2.map(x => <FSCWSMiniGame key={x.id} g={x} label="BF2 (If Nec.)" />)}
          </div>
        </div>
      )}
      {bracketChamp && (
        <div className="bg-gold/10 border border-gold/30 rounded px-2 py-1 text-center">
          <p className="text-[6px] font-pixel text-muted-foreground">BRACKET {bracketId} CHAMP</p>
          <p className="text-gold font-pixel text-[9px]">{bracketChamp.abbreviation}</p>
        </div>
      )}
    </div>
  );
}

function FSCWSView({ cwsGames }: { cwsGames: FSCWSGame[] }) {
  const finalGames = cwsGames.filter(g => g.bracketType === "cws_final");
  const finalWins: Record<string, number> = {};
  for (const g of finalGames.filter(g => g.isComplete)) {
    const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    finalWins[wId] = (finalWins[wId] ?? 0) + 1;
  }
  const cwsChampId = Object.entries(finalWins).find(([, w]) => w >= 2)?.[0];
  const g1 = finalGames[0];
  const homeId = g1?.homeTeamId;
  const awayId = g1?.awayTeamId;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="font-pixel text-[9px] text-gold mb-2 uppercase">Bracket A (Seeds 1,4,5,8)</p>
          <FSCWSBracketView bracketId="A" games={cwsGames} />
        </div>
        <div>
          <p className="font-pixel text-[9px] text-gold mb-2 uppercase">Bracket B (Seeds 2,3,6,7)</p>
          <FSCWSBracketView bracketId="B" games={cwsGames} />
        </div>
      </div>

      {finalGames.length > 0 && g1 && (
        <div className="border-t border-gold/20 pt-3">
          <p className="font-pixel text-[9px] text-gold uppercase text-center mb-2">CWS Final (Best of 3)</p>
          <div className="flex items-center justify-center gap-6 py-2 border border-border/30 rounded bg-muted/20 mb-3">
            <div className="text-right">
              <span className="text-sm font-medium">{g1.homeTeam?.abbreviation || "TBD"}</span>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-2 font-pixel text-xl">
                <span className={(finalWins[homeId] ?? 0) >= 2 ? "text-gold" : "text-muted-foreground"}>
                  {finalWins[homeId] ?? 0}
                </span>
                <span className="text-muted-foreground text-sm">–</span>
                <span className={(finalWins[awayId] ?? 0) >= 2 ? "text-gold" : "text-muted-foreground"}>
                  {finalWins[awayId] ?? 0}
                </span>
              </div>
            </div>
            <div className="text-left">
              <span className="text-sm font-medium">{g1.awayTeam?.abbreviation || "TBD"}</span>
            </div>
          </div>
          {finalGames.map((g, i) => <FSCWSMiniGame key={g.id} g={g} label={`Game ${i + 1}`} />)}
          {cwsChampId && (() => {
            const champTeam = finalGames.find(g => g.homeTeamId === cwsChampId)?.homeTeam
              ?? finalGames.find(g => g.awayTeamId === cwsChampId)?.awayTeam;
            return champTeam ? (
              <div className="mt-3 bg-gold/10 border border-gold/30 rounded p-3 text-center">
                <Trophy className="w-6 h-6 text-gold mx-auto mb-1" />
                <p className="font-pixel text-gold text-xs" data-testid="text-cws-champion">
                  {champTeam.name} — CWS Champion!
                </p>
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function PostseasonHubPage() {
  const { id: leagueId } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<PostseasonData>({
    queryKey: ["/api/leagues", leagueId, "postseason"],
    enabled: !!leagueId,
  });

  const { data: league } = useQuery<{ id: string; dynastyPreset?: string }>({
    queryKey: ["/api/leagues", leagueId],
    enabled: !!leagueId,
  });

  const isFS = league?.dynastyPreset === "full_season";

  const { data: fsData } = useQuery<FSPostseasonPayload>({
    queryKey: ["/api/leagues", leagueId, "fs-postseason"],
    enabled: !!leagueId && isFS,
    refetchInterval: 5000,
  });

  const hasData = data && (
    data.conferenceChampionships.length > 0 ||
    data.superRegionals.length > 0 ||
    data.cws.length > 0 ||
    (isFS && (fsData?.srSeries?.length ?? 0) > 0) ||
    (isFS && (fsData?.cwsGames?.length ?? 0) > 0)
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/50 bg-muted/20 px-4 py-3 flex items-center gap-3">
        <Link href={`/league/${leagueId}`}>
          <RetroButton variant="outline" size="sm" data-testid="button-back-postseason">
            <ArrowLeft className="w-3 h-3" />
          </RetroButton>
        </Link>
        <div>
          <h1 className="font-pixel text-gold text-xs tracking-wide">POSTSEASON</h1>
          {data && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Season {data.season} · {phaseLabel(data.phase)}
            </p>
          )}
        </div>
        {data && (
          <Badge
            variant="outline"
            className={`ml-auto text-[9px] font-pixel ${
              ["conference_championship", "super_regionals", "cws"].includes(data.phase)
                ? "border-gold/50 text-gold"
                : "border-border text-muted-foreground"
            }`}
          >
            {phaseLabel(data.phase)}
          </Badge>
        )}
      </div>

      <ArtworkBackground
        desktopSrc={artBackgrounds.postseason.desktop}
        mobileSrc={artBackgrounds.postseason.mobile}
        focalPoint="center top"
        overlayStrength="heavy"
        className="h-36 sm:h-52"
      />

      {isLoading && (
        <div className="p-4 space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      )}

      {!isLoading && !hasData && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Trophy className="w-14 h-14 text-gold/30 mx-auto mb-4" />
            <p className="font-pixel text-xs text-gold mb-2">No Postseason Data Yet</p>
            <p className="text-sm text-muted-foreground">The postseason begins after the regular season ends.</p>
          </div>
        </div>
      )}

      {!isLoading && hasData && data && (
        <div className="max-w-7xl mx-auto p-4 lg:flex lg:gap-6">

          {/* ── Main column ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Conference Championships */}
            {data.conferenceChampionships.length > 0 && (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  Conference Championships
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.conferenceChampionships.map(game => {
                    const confStandings = data.confStandings?.find(cs =>
                      cs.teams.some(t => t.teamId === game.homeTeamId)
                    );
                    return (
                      <ConfChampSection
                        key={game.id}
                        game={game}
                        standings={confStandings}
                      />
                    );
                  })}
                </div>

                {/* Conference Championship Bracket */}
                <div className="mt-4">
                  <h3 className="font-pixel text-[9px] text-gold mb-2 uppercase tracking-wide flex items-center gap-2">
                    <ChevronRight className="w-3 h-3" />
                    Conference Championship Bracket
                  </h3>
                  <RetroCard>
                    <RetroCardContent>
                      <ConfChampBracket
                        games={data.conferenceChampionships}
                        seeds={data.seeds || []}
                      />
                    </RetroCardContent>
                  </RetroCard>
                </div>
              </section>
            )}

            {/* Super Regionals */}
            {isFS && fsData && fsData.srSeries.length > 0 ? (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  Super Regionals
                </h2>
                <RetroCard>
                  <RetroCardContent>
                    <FSSRSeriesView srSeries={fsData.srSeries} />
                  </RetroCardContent>
                </RetroCard>
              </section>
            ) : data.superRegionals.length > 0 && !isFS ? (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  Super Regionals Bracket
                </h2>
                <RetroCard>
                  <RetroCardContent>
                    <div className="space-y-6">
                      {(["winners", "losers"] as const).map(bracketType => {
                        const typeGames = data.superRegionals.filter(g => g.bracketType === bracketType);
                        if (typeGames.length === 0) return null;
                        return (
                          <BracketSideView
                            key={bracketType}
                            games={data.superRegionals}
                            side={bracketType}
                            sideLabel={bracketType === "winners" ? "Winners Bracket" : "Losers Bracket"}
                            seeds={data.seeds || []}
                          />
                        );
                      })}
                      {!data.superRegionals.some(g => g.bracketType === "winners" || g.bracketType === "losers") && (
                        <div className="grid sm:grid-cols-2 gap-3">
                          {data.superRegionals.map(g => (
                            <BracketNode key={g.id} game={g} seeds={data.seeds || []} />
                          ))}
                        </div>
                      )}
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </section>
            ) : null}

            {/* College World Series */}
            {isFS && fsData && fsData.cwsGames.length > 0 ? (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  College World Series
                </h2>
                <RetroCard>
                  <RetroCardContent>
                    <FSCWSView cwsGames={fsData.cwsGames} />
                  </RetroCardContent>
                </RetroCard>
              </section>
            ) : data.cws.length > 0 && !isFS ? (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  College World Series
                </h2>
                <RetroCard>
                  <RetroCardContent>
                    <CWSSection games={data.cws} seeds={data.seeds || []} />
                  </RetroCardContent>
                </RetroCard>
              </section>
            ) : null}

            {/* FS: national seeding table (inline when sidebar would be empty) */}
            {isFS && fsData && fsData.entries.length > 0 && (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Star className="w-3.5 h-3.5" />
                  National Selection ({fsData.entries.length} teams)
                </h2>
                <RetroCard>
                  <RetroCardContent>
                    <div className="grid sm:grid-cols-2 gap-1">
                      {fsData.entries.map(e => (
                        <div
                          key={e.teamId}
                          className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20 border border-border/30"
                          data-testid={`fs-national-seed-${e.nationalSeed}`}
                        >
                          <span className="text-[10px] font-pixel text-gold w-5 flex-shrink-0">{e.nationalSeed}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs truncate">{e.team?.name ?? "—"}</p>
                            <p className="text-[8px] text-muted-foreground">{e.wins}-{e.losses}</p>
                          </div>
                          <span
                            className={`text-[7px] font-pixel flex-shrink-0 px-1 rounded ${
                              e.qualificationType === "auto_bid"
                                ? "text-gold bg-gold/10"
                                : "text-muted-foreground"
                            }`}
                          >
                            {e.qualificationType === "auto_bid" ? "AUTO" : "AL"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </section>
            )}

            {/* Postseason Stats Leaders */}
            {data.stats && (data.stats.topBatters.length > 0 || data.stats.topPitchers.length > 0) && (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  Postseason Leaders
                </h2>
                <RetroCard>
                  <RetroCardContent>
                    <StatsPanel stats={data.stats} />
                  </RetroCardContent>
                </RetroCard>
              </section>
            )}
          </div>

          {/* ── Sidebar ── */}
          {data.seeds && data.seeds.length > 0 && (
            <aside className="mt-6 lg:mt-0 lg:w-64 flex-shrink-0">
              <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                <Star className="w-3.5 h-3.5" />
                Seeding Table
              </h2>
              <RetroCard>
                <RetroCardContent>
                  <div className="mb-2 flex items-center gap-2">
                    <Star className="w-3 h-3 text-gold" />
                    <span className="text-[9px] text-muted-foreground">= Conference Champion</span>
                  </div>
                  <SeedingSidebar seeds={data.seeds} />
                </RetroCardContent>
              </RetroCard>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
