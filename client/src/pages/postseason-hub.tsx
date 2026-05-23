import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ArrowLeft, Star, ChevronRight } from "lucide-react";

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
  seeds: SeedEntry[];
  confStandings: ConfStandings[];
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

// ─── Small game card ───────────────────────────────────────────────────────

function MiniGameCard({ game }: { game: PostseasonGame }) {
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div
      className={`border rounded bg-muted/30 ${game.isComplete ? "border-border" : "border-gold/30"}`}
      data-testid={`postseason-game-${game.id}`}
    >
      <div
        className={`flex items-center justify-between gap-1 px-2 py-1.5 ${homeWon ? "bg-gold/10" : ""}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {game.homeSeed != null && game.homeSeed > 0 && (
            <span className="text-[9px] font-pixel text-gold w-4 flex-shrink-0">{game.homeSeed}</span>
          )}
          <span
            className={`text-[10px] truncate ${homeWon ? "text-gold font-medium" : awayWon ? "text-muted-foreground" : ""}`}
          >
            {game.homeTeam?.name || "TBD"}
          </span>
        </div>
        <span className={`text-[10px] font-pixel flex-shrink-0 ${homeWon ? "text-gold" : "text-muted-foreground"}`}>
          {game.isComplete ? game.homeScore : "-"}
        </span>
      </div>
      <div className="border-t border-border/30" />
      <div
        className={`flex items-center justify-between gap-1 px-2 py-1.5 ${awayWon ? "bg-gold/10" : ""}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {game.awaySeed != null && game.awaySeed > 0 && (
            <span className="text-[9px] font-pixel text-gold w-4 flex-shrink-0">{game.awaySeed}</span>
          )}
          <span
            className={`text-[10px] truncate ${awayWon ? "text-gold font-medium" : homeWon ? "text-muted-foreground" : ""}`}
          >
            {game.awayTeam?.name || "TBD"}
          </span>
        </div>
        <span className={`text-[10px] font-pixel flex-shrink-0 ${awayWon ? "text-gold" : "text-muted-foreground"}`}>
          {game.isComplete ? game.awayScore : "-"}
        </span>
      </div>
      {!game.isComplete && game.homeTeam && game.awayTeam && (
        <div className="border-t border-border/30 px-2 py-1 text-center">
          <span className="text-[8px] font-pixel text-gold/70">UPCOMING</span>
        </div>
      )}
    </div>
  );
}

// ─── Bracket ────────────────────────────────────────────────────────────────

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
  const sideGames = games.filter(g => g.bracketSide === side);
  if (sideGames.length === 0) return null;

  const maxRound = Math.max(...sideGames.map(g => g.bracketRound ?? 1));
  const rounds: PostseasonGame[][] = [];
  for (let r = 1; r <= maxRound; r++) {
    rounds.push(sideGames.filter(g => (g.bracketRound ?? 1) === r));
  }

  // Detect bye teams (in this side's seeding but not in any R1 game)
  const r1TeamIds = new Set<string>();
  rounds[0]?.forEach(g => { r1TeamIds.add(g.homeTeamId); r1TeamIds.add(g.awayTeamId); });
  const byeSeeds = seeds.filter(s => {
    const inR1 = r1TeamIds.has(s.teamId);
    const inAnySide = sideGames.some(g => g.homeTeamId === s.teamId || g.awayTeamId === s.teamId);
    return !inR1 && inAnySide;
  });

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-pixel text-gold text-center mb-2 uppercase tracking-wide">
        {sideLabel}
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {/* R1 byes column (if any) */}
        {byeSeeds.length > 0 && (
          <div className="flex flex-col gap-2 flex-shrink-0" style={{ minWidth: 110 }}>
            <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1 text-center">R1 Byes</p>
            {byeSeeds.map(s => (
              <div key={s.teamId} className="border border-gold/30 rounded bg-gold/5 px-2 py-1.5 text-center">
                <span className="text-[9px] font-pixel text-gold mr-1">{s.seed}</span>
                <span className="text-[10px] truncate">{s.abbreviation}</span>
                <p className="text-[7px] text-muted-foreground mt-0.5">{s.conferenceName}</p>
              </div>
            ))}
          </div>
        )}

        {/* Per-round columns */}
        {rounds.map((roundGames, ri) => (
          <div key={ri} className="flex flex-col gap-2 flex-shrink-0" style={{ minWidth: 120 }}>
            <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1 text-center">
              {ri === rounds.length - 1 && rounds.length > 1 ? "Semifinal" : `Round ${ri + 1}`}
            </p>
            {roundGames.map(g => (
              <MiniGameCard key={g.id} game={g} />
            ))}
          </div>
        ))}

        {/* CWS Bound box */}
        <div className="flex flex-col justify-center flex-shrink-0" style={{ minWidth: 80 }}>
          {(() => {
            const lastRound = rounds[rounds.length - 1];
            if (!lastRound || lastRound.length !== 1) return null;
            const finalGame = lastRound[0];
            if (!finalGame.isComplete) {
              return (
                <div className="border border-border/50 rounded bg-muted/20 px-2 py-2 text-center">
                  <p className="text-[7px] font-pixel text-muted-foreground mb-1">CWS BOUND</p>
                  <p className="text-[10px] font-pixel text-muted-foreground">TBD</p>
                </div>
              );
            }
            const winnerTeamId = getWinner(finalGame);
            const seed = seeds.find(s => s.teamId === winnerTeamId);
            return (
              <div className="border border-gold/30 rounded bg-gold/10 px-2 py-2 text-center">
                <p className="text-[7px] font-pixel text-muted-foreground mb-1">CWS BOUND</p>
                {seed ? (
                  <>
                    <span className="text-[9px] font-pixel text-gold mr-1">{seed.seed}</span>
                    <span className="text-[10px] font-pixel text-gold">{seed.abbreviation}</span>
                  </>
                ) : (
                  <p className="text-[10px] font-pixel text-gold">
                    {winnerTeamId === finalGame.homeTeamId
                      ? finalGame.homeTeam?.abbreviation
                      : finalGame.awayTeam?.abbreviation}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── Conference Championship section ───────────────────────────────────────

function ConfChampSection({
  game,
  standings,
}: {
  game: PostseasonGame;
  standings: ConfStandings | undefined;
}) {
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div className="border border-border rounded bg-muted/20 overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="text-[10px] font-pixel text-gold">
          {game.homeTeam?.conferenceName || standings?.name || "Conference"} Championship
        </span>
        {game.isComplete && (
          <Badge className="text-[8px] bg-green-500/20 text-green-400 border-green-500/30">Final</Badge>
        )}
        {!game.isComplete && (
          <Badge variant="outline" className="text-[8px] text-gold border-gold/30">Upcoming</Badge>
        )}
      </div>

      {/* Matchup */}
      <div className="px-3 py-2 space-y-1">
        <div className={`flex items-center justify-between ${homeWon ? "text-gold" : awayWon ? "text-muted-foreground" : ""}`}>
          <div className="flex items-center gap-1.5">
            {game.homeSeed != null && game.homeSeed > 0 && (
              <span className="text-[9px] font-pixel text-gold w-4">{game.homeSeed}</span>
            )}
            <span className="text-xs font-medium">{game.homeTeam?.name || "TBD"}</span>
            {homeWon && <Trophy className="w-3 h-3 text-gold" />}
          </div>
          <span className="text-sm font-pixel">{game.isComplete ? game.homeScore : "-"}</span>
        </div>
        <div className={`flex items-center justify-between ${awayWon ? "text-gold" : homeWon ? "text-muted-foreground" : ""}`}>
          <div className="flex items-center gap-1.5">
            {game.awaySeed != null && game.awaySeed > 0 && (
              <span className="text-[9px] font-pixel text-gold w-4">{game.awaySeed}</span>
            )}
            <span className="text-xs font-medium">{game.awayTeam?.name || "TBD"}</span>
            {awayWon && <Trophy className="w-3 h-3 text-gold" />}
          </div>
          <span className="text-sm font-pixel">{game.isComplete ? game.awayScore : "-"}</span>
        </div>
      </div>

      {/* Mini standings */}
      {standings && (
        <div className="border-t border-border/50 px-3 py-2">
          <p className="text-[7px] font-pixel text-muted-foreground uppercase mb-1">Conf Standings</p>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[8px] text-muted-foreground">
                <th className="text-left font-normal py-0.5">Team</th>
                <th className="text-center font-normal w-8">W</th>
                <th className="text-center font-normal w-8">L</th>
                <th className="text-right font-normal w-12">Ovr</th>
              </tr>
            </thead>
            <tbody>
              {standings.teams.map(row => (
                <tr key={row.teamId} className="border-t border-border/20">
                  <td className="py-0.5 truncate max-w-[100px]">{row.abbreviation}</td>
                  <td className="text-center">{row.confWins}</td>
                  <td className="text-center">{row.confLosses}</td>
                  <td className="text-right text-muted-foreground">{row.wins}-{row.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── CWS section ───────────────────────────────────────────────────────────

function CWSSection({ games }: { games: PostseasonGame[] }) {
  const completedGames = games.filter(g => g.isComplete);

  const winsMap: Record<string, { team: TeamInfo; wins: number; seed?: number }> = {};
  for (const g of completedGames) {
    const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    const winnerTeam = winnerId === g.homeTeamId ? g.homeTeam : g.awayTeam;
    const winnerSeed = winnerId === g.homeTeamId ? g.homeSeed : g.awaySeed;
    if (!winsMap[winnerId]) winsMap[winnerId] = { team: winnerTeam, wins: 0, seed: winnerSeed };
    winsMap[winnerId].wins++;
  }

  const entries = Object.values(winsMap);
  const champion = entries.find(e => e.wins >= 2);
  const team1 = games[0]?.homeTeam;
  const team2 = games[0]?.awayTeam;
  const seed1 = games[0]?.homeSeed;
  const seed2 = games[0]?.awaySeed;

  return (
    <div className="space-y-3">
      {/* Series header */}
      {(team1 || team2) && (
        <div className="flex items-center justify-center gap-4 py-2">
          <div className="text-right">
            {seed1 != null && <span className="text-[9px] font-pixel text-gold mr-1">{seed1}</span>}
            <span className="text-sm font-medium">{team1?.abbreviation || "TBD"}</span>
          </div>
          <div className="flex items-center gap-2 font-pixel text-lg">
            <span className={winsMap[games[0]?.homeTeamId]?.wins > (winsMap[games[0]?.awayTeamId]?.wins ?? 0) ? "text-gold" : "text-muted-foreground"}>
              {winsMap[games[0]?.homeTeamId]?.wins ?? 0}
            </span>
            <span className="text-muted-foreground text-sm">–</span>
            <span className={winsMap[games[0]?.awayTeamId]?.wins > (winsMap[games[0]?.homeTeamId]?.wins ?? 0) ? "text-gold" : "text-muted-foreground"}>
              {winsMap[games[0]?.awayTeamId]?.wins ?? 0}
            </span>
          </div>
          <div className="text-left">
            <span className="text-sm font-medium">{team2?.abbreviation || "TBD"}</span>
            {seed2 != null && <span className="text-[9px] font-pixel text-gold ml-1">{seed2}</span>}
          </div>
        </div>
      )}

      {/* Individual games */}
      <div className="space-y-1">
        {games.map((g, i) => {
          const hw = (g.homeScore ?? 0) > (g.awayScore ?? 0);
          const aw = (g.awayScore ?? 0) > (g.homeScore ?? 0);
          return (
            <div key={g.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/20 border border-border/30">
              <span className="text-[8px] font-pixel text-muted-foreground w-12 flex-shrink-0">Game {i + 1}</span>
              <span className={`flex-1 text-right ${hw ? "text-gold font-medium" : g.isComplete ? "text-muted-foreground" : ""}`}>
                {g.homeTeam?.abbreviation || "TBD"}
              </span>
              <span className="font-pixel text-[11px] w-12 text-center flex-shrink-0">
                {g.isComplete ? `${g.homeScore}–${g.awayScore}` : "vs"}
              </span>
              <span className={`flex-1 ${aw ? "text-gold font-medium" : g.isComplete ? "text-muted-foreground" : ""}`}>
                {g.awayTeam?.abbreviation || "TBD"}
              </span>
              {g.isComplete && (
                <Badge className="text-[8px] bg-green-500/20 text-green-400 border-green-500/30 flex-shrink-0">F</Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* Champion banner */}
      {champion && (
        <div className="mt-2 bg-gold/10 border border-gold/30 rounded p-4 text-center">
          <Trophy className="w-6 h-6 text-gold mx-auto mb-1" />
          <p className="font-pixel text-gold text-xs" data-testid="text-cws-champion">
            {champion.team?.name} — CWS Champion!
          </p>
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
          <span className="text-xs truncate flex-1">{s.name}</span>
          {s.isConfChamp && (
            <Star className="w-3 h-3 text-gold flex-shrink-0" />
          )}
          <span className="text-[10px] text-muted-foreground flex-shrink-0 font-pixel">
            {s.wins}-{s.losses}
          </span>
        </div>
      ))}
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

  const hasData = data && (
    data.conferenceChampionships.length > 0 ||
    data.superRegionals.length > 0 ||
    data.cws.length > 0
  );

  const sides = ["A", "B"];

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
                    const confId = game.homeTeam?.conferenceName
                      ? data.confStandings?.find(cs =>
                          cs.teams.some(t => t.teamId === game.homeTeamId)
                        )
                      : undefined;
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
              </section>
            )}

            {/* Super Regionals Bracket */}
            {data.superRegionals.length > 0 && (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  Super Regionals Bracket
                </h2>
                <RetroCard>
                  <RetroCardContent>
                    <div className="space-y-4">
                      {sides.map(side => {
                        const sideGames = data.superRegionals.filter(g => g.bracketSide === side);
                        if (sideGames.length === 0) return null;
                        return (
                          <div key={side}>
                            <BracketSideView
                              games={data.superRegionals}
                              side={side}
                              sideLabel={`Bracket ${side}`}
                              seeds={data.seeds || []}
                            />
                          </div>
                        );
                      })}
                      {/* Fallback: no bracketSide */}
                      {data.superRegionals.every(g => !g.bracketSide) && (
                        <div className="grid sm:grid-cols-2 gap-3">
                          {data.superRegionals.map(g => (
                            <MiniGameCard key={g.id} game={g} />
                          ))}
                        </div>
                      )}
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </section>
            )}

            {/* College World Series */}
            {data.cws.length > 0 && (
              <section>
                <h2 className="font-pixel text-xs text-gold mb-3 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  College World Series
                </h2>
                <RetroCard>
                  <RetroCardContent>
                    <CWSSection games={data.cws} />
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
