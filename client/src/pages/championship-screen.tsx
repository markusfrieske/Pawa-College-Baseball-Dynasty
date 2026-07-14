import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ArrowLeft, Crown, Camera, Award, Users, Medal } from "lucide-react";

interface ChampionInfo {
  id: string;
  name: string;
  mascot: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  wins: number;
  losses: number;
  conferenceName: string;
}

interface RunnerUpInfo {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  wins: number;
  losses: number;
}

interface CWSGame {
  gameNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  winnerId: string;
}

interface StandingEntry {
  teamId: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  wins: number;
  losses: number;
  conferenceName: string;
  postseasonFinish: string;
}

interface AwardEntry {
  playerName: string;
  position: string;
  teamName: string;
  teamAbbr: string;
  overall: number;
  starRating: number;
}

interface LineupPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  eligibility: string;
  overall: number;
  starRating: number;
  isPitcher: boolean;
}

interface ChampionshipData {
  leagueName: string;
  season: number;
  champion: ChampionInfo | null;
  runnerUp: RunnerUpInfo | null;
  cwsGames: CWSGame[];
  cwsSeries: { championWins: number; runnerUpWins: number };
  standings: StandingEntry[];
  awards: {
    mvp: AwardEntry | null;
    pitcherOfYear: AwardEntry | null;
    freshmanOfYear: AwardEntry | null;
  };
  startingLineup: LineupPlayer[];
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

const ELIGIBILITY_LABELS: Record<string, string> = {
  FR: "FR", SO: "SO", JR: "JR", SR: "SR",
};

const STAR_COLORS: Record<number, string> = {
  1: "text-gray-400", 2: "text-blue-400", 3: "text-green-400",
  4: "text-yellow-400", 5: "text-orange-400",
};

function PlayerSilhouette({
  primaryColor,
  isPitcher = false,
  size = 32,
}: {
  primaryColor: string;
  isPitcher?: boolean;
  size?: number;
}) {
  const jersey = primaryColor;
  const skin = "#d4a574";
  const pants = "#e8e8e8";

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      style={{ imageRendering: "pixelated" }}
      shapeRendering="crispEdges"
    >
      {/* Head */}
      <rect x="12" y="2" width="8" height="8" fill={skin} />
      <rect x="11" y="3" width="1" height="6" fill={skin} />
      <rect x="20" y="3" width="1" height="6" fill={skin} />
      {/* Cap */}
      <rect x="11" y="2" width="10" height="2" fill="#1a1a1a" />
      <rect x="10" y="3" width="13" height="1" fill="#1a1a1a" />
      {/* Eyes */}
      <rect x="13" y="6" width="2" height="1" fill="#1a1a1a" />
      <rect x="17" y="6" width="2" height="1" fill="#1a1a1a" />
      {/* Jersey body */}
      <rect x="10" y="10" width="12" height="9" fill={jersey} />
      <rect x="9" y="11" width="1" height="7" fill={jersey} />
      <rect x="22" y="11" width="1" height="7" fill={jersey} />
      {/* Jersey number area */}
      <rect x="13" y="12" width="6" height="5" fill={jersey} rx="0" />
      {/* Arms */}
      {isPitcher ? (
        <>
          {/* Pitching arm raised */}
          <rect x="6" y="8" width="3" height="6" fill={jersey} />
          <rect x="23" y="11" width="3" height="5" fill={jersey} />
          <rect x="5" y="7" width="3" height="2" fill={skin} />
        </>
      ) : (
        <>
          {/* Batting stance — arms out */}
          <rect x="6" y="11" width="3" height="4" fill={jersey} />
          <rect x="23" y="10" width="4" height="3" fill={jersey} />
          {/* Bat */}
          <rect x="25" y="7" width="2" height="5" fill="#8B6914" />
          <rect x="26" y="6" width="1" height="2" fill="#6B4F10" />
        </>
      )}
      {/* Pants */}
      <rect x="11" y="19" width="4" height="9" fill={pants} />
      <rect x="17" y="19" width="4" height="9" fill={pants} />
      {/* Belt */}
      <rect x="10" y="18" width="12" height="2" fill={jersey} />
      {/* Cleats */}
      <rect x="10" y="28" width="5" height="2" fill="#1a1a1a" />
      <rect x="9" y="29" width="5" height="1" fill="#1a1a1a" />
      <rect x="17" y="28" width="5" height="2" fill="#1a1a1a" />
      <rect x="18" y="29" width="5" height="1" fill="#1a1a1a" />
    </svg>
  );
}

function StarDisplay({ stars }: { stars: number }) {
  return (
    <span className={`font-pixel text-xs ${STAR_COLORS[stars] ?? "text-muted-foreground"}`}>
      {"★".repeat(stars)}
    </span>
  );
}

const FINISH_CONFIG: Record<string, { label: string; className: string }> = {
  champion: { label: "CHAMPION", className: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" },
  runner_up: { label: "RUNNER-UP", className: "bg-gray-400/20 text-gray-300 border-gray-400/40" },
  cws: { label: "CWS", className: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  super_regionals: { label: "SUPER REG", className: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  conf_champ: { label: "CONF CHAMP", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  regular_season: { label: "", className: "" },
};

function PostseasonBadge({ finish }: { finish: string }) {
  const cfg = FINISH_CONFIG[finish];
  if (!cfg || !cfg.label) return null;
  return (
    <Badge variant="outline" className={`font-pixel text-xs px-1 py-0 h-auto ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

export default function ChampionshipScreenPage() {
  const { id, season: seasonParam } = useParams<{ id: string; season: string }>();
  const season = parseInt(seasonParam ?? "1");
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<ChampionshipData>({
    queryKey: ["/api/leagues", id, "championship-screen", season],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/championship-screen/${season}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load championship data");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-2xl px-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-8 max-w-sm">
          <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-pixel text-gold text-sm mb-4">Championship data not available</h2>
          <Link href={`/league/${id}`}>
            <RetroButton variant="outline">Back to League</RetroButton>
          </Link>
        </RetroCard>
      </div>
    );
  }

  const { champion, runnerUp, cwsGames, cwsSeries, standings, awards, startingLineup } = data;
  const primaryRgb = champion?.primaryColor ? hexToRgb(champion.primaryColor) : "212, 175, 55";
  const secondaryRgb = champion?.secondaryColor ? hexToRgb(champion.secondaryColor) : "0, 0, 0";

  const positionPlayers = startingLineup.filter(p => !p.isPitcher);
  const pitcherPlayers = startingLineup.filter(p => p.isPitcher);

  const handleScreenshot = () => window.print();

  const handleContinue = () => {
    navigate(`/league/${id}/commissioner?showSummary=1&season=${season}`);
  };

  return (
    <div
      className="min-h-screen bg-background print:bg-white"
      data-testid="page-championship-screen"
      data-screenshot-region="championship"
    >

      {/* ── Hero Section ──────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: `radial-gradient(ellipse at center, rgba(${primaryRgb}, 0.25) 0%, rgba(${primaryRgb}, 0.08) 50%, transparent 100%)`,
          borderBottom: `1px solid rgba(${primaryRgb}, 0.3)`,
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, transparent 60%, rgba(${secondaryRgb}, 0.06) 100%)`,
          }}
        />

        {/* Nav row */}
        <div className="relative z-10 container mx-auto px-4 pt-4 pb-2 flex items-center justify-between print:hidden">
          <Link href={`/league/${id}`}>
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-gold transition-colors text-xs" data-testid="button-back-to-league">
              <ArrowLeft className="w-4 h-4" />
              Back to League
            </button>
          </Link>
          <button
            onClick={handleScreenshot}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-gold transition-colors text-xs"
            data-testid="button-screenshot"
          >
            <Camera className="w-3.5 h-3.5" />
            Save Screenshot
          </button>
        </div>

        {/* Main hero content */}
        <div className="relative z-10 container mx-auto px-4 py-10 text-center">
          {/* League + Season label */}
          <p className="font-pixel text-xs text-muted-foreground tracking-widest uppercase mb-3">
            {data.leagueName} &bull; Season {data.season}
          </p>

          {/* Trophy icon with pulse */}
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-5 border-2 animate-pulse"
            style={{
              backgroundColor: `rgba(${primaryRgb}, 0.15)`,
              borderColor: `rgba(${primaryRgb}, 0.4)`,
            }}
          >
            <Trophy className="w-10 h-10" style={{ color: champion?.primaryColor ?? "#D4AF37" }} />
          </div>

          {/* "The Deuce 2.0 — Season N Champion" pixel headline */}
          <h1
            className="font-pixel text-xs sm:text-[12px] tracking-wide mb-5 leading-loose"
            style={{ color: champion?.primaryColor ?? "#D4AF37" }}
          >
            The Deuce 2.0 &mdash; Season {data.season} Champion
          </h1>

          {/* TeamBadge + team name */}
          {champion && (
            <div className="flex flex-col items-center gap-3 mb-4">
              <TeamBadge
                abbreviation={champion.abbreviation}
                primaryColor={champion.primaryColor}
                secondaryColor={champion.secondaryColor}
                size="lg"
                name={champion.name}
              />
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-1 tracking-tight">
                  {champion.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {champion.mascot}
                  {champion.conferenceName && (
                    <span className="ml-2 text-muted-foreground/60">&bull; {champion.conferenceName}</span>
                  )}
                </p>
                <p className="font-pixel text-xs text-muted-foreground mt-1">
                  Season Record: <span className="text-foreground">{champion.wins}–{champion.losses}</span>
                </p>
              </div>
            </div>
          )}

          {/* Series result */}
          {champion && runnerUp && (
            <div
              className="mt-4 inline-flex items-center gap-6 px-8 py-4 rounded-lg border"
              style={{ borderColor: `rgba(${primaryRgb}, 0.3)`, backgroundColor: `rgba(${primaryRgb}, 0.08)` }}
            >
              <div className="text-center">
                <p className="font-pixel text-xs text-muted-foreground mb-1">CHAMPIONS</p>
                <TeamBadge
                  abbreviation={champion.abbreviation}
                  primaryColor={champion.primaryColor}
                  secondaryColor={champion.secondaryColor}
                  size="sm"
                />
                <p className="font-pixel text-2xl mt-1" style={{ color: champion.primaryColor }}>{cwsSeries.championWins}</p>
              </div>
              <div className="text-center">
                <Crown className="w-5 h-5 mx-auto mb-1" style={{ color: champion.primaryColor }} />
                <p className="font-pixel text-xs text-muted-foreground">CWS FINAL</p>
              </div>
              <div className="text-center">
                <p className="font-pixel text-xs text-muted-foreground mb-1">RUNNER-UP</p>
                <TeamBadge
                  abbreviation={runnerUp.abbreviation}
                  primaryColor={runnerUp.primaryColor}
                  size="sm"
                />
                <p className="font-pixel text-2xl mt-1 text-muted-foreground">{cwsSeries.runnerUpWins}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 py-8 space-y-8 max-w-5xl">

        {/* CWS Bracket + Game Log */}
        {cwsGames.length > 0 && champion && runnerUp && (
          <RetroCard data-testid="panel-cws-bracket">
            <RetroCardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-gold" />
                <h3 className="font-pixel text-gold text-xs sm:text-xs">CWS CHAMPIONSHIP BRACKET</h3>
              </div>
            </RetroCardHeader>
            <RetroCardContent>
              {/* Bracket visual */}
              <div className="flex items-stretch gap-0 mb-5" data-testid="bracket-visual">
                {/* Champion column */}
                <div
                  className="flex-1 rounded-l-lg px-4 py-3 border border-r-0 text-center"
                  style={{ borderColor: `rgba(${primaryRgb}, 0.3)`, backgroundColor: `rgba(${primaryRgb}, 0.08)` }}
                >
                  <TeamBadge
                    abbreviation={champion.abbreviation}
                    primaryColor={champion.primaryColor}
                    secondaryColor={champion.secondaryColor}
                    size="md"
                    name={champion.name}
                    className="mx-auto mb-2"
                  />
                  <p className="text-xs font-medium text-foreground">{champion.name}</p>
                  <p className="font-pixel text-3xl mt-1" style={{ color: champion.primaryColor }}>
                    {cwsSeries.championWins}
                  </p>
                  <Badge
                    variant="outline"
                    className="font-pixel text-xs mt-1 bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
                  >
                    CHAMPION
                  </Badge>
                </div>

                {/* Center divider */}
                <div className="flex flex-col items-center justify-center px-3 bg-muted/20 border-y border-border/30">
                  <Crown className="w-5 h-5 mb-1" style={{ color: champion.primaryColor }} />
                  <p className="font-pixel text-xs text-muted-foreground">VS</p>
                </div>

                {/* Runner-up column */}
                <div className="flex-1 rounded-r-lg px-4 py-3 border border-l-0 border-border/30 text-center bg-muted/10">
                  <TeamBadge
                    abbreviation={runnerUp.abbreviation}
                    primaryColor={runnerUp.primaryColor}
                    size="md"
                    name={runnerUp.name}
                    className="mx-auto mb-2"
                  />
                  <p className="text-xs font-medium text-muted-foreground">{runnerUp.name}</p>
                  <p className="font-pixel text-3xl mt-1 text-muted-foreground">
                    {cwsSeries.runnerUpWins}
                  </p>
                  <Badge
                    variant="outline"
                    className="font-pixel text-xs mt-1 bg-gray-400/20 text-gray-300 border-gray-400/40"
                  >
                    RUNNER-UP
                  </Badge>
                </div>
              </div>

              {/* Game-by-game scores */}
              <p className="font-pixel text-xs text-muted-foreground uppercase tracking-wide mb-2">Game-by-Game Results</p>
              <div className="space-y-2">
                {cwsGames.map(game => {
                  const homeWon = game.homeScore > game.awayScore;
                  const awayWon = game.awayScore > game.homeScore;
                  return (
                    <div
                      key={game.gameNumber}
                      className="flex items-center gap-3 px-3 py-2.5 rounded bg-muted/20 border border-border/30"
                      data-testid={`row-cws-game-${game.gameNumber}`}
                    >
                      <span className="font-pixel text-xs text-muted-foreground w-10 flex-shrink-0">
                        GAME {game.gameNumber}
                      </span>
                      <div className={`flex items-center gap-2 flex-1 ${awayWon ? "" : "opacity-60"}`}>
                        <span className={`text-xs font-medium truncate ${awayWon ? "text-foreground" : "text-muted-foreground"}`}>
                          {game.awayTeamName}
                        </span>
                        <span className={`font-pixel text-sm flex-shrink-0 ml-auto ${awayWon ? "text-gold font-bold" : "text-muted-foreground"}`}>
                          {game.awayScore}
                        </span>
                      </div>
                      <span className="font-pixel text-xs text-muted-foreground/40 flex-shrink-0 px-1">@</span>
                      <div className={`flex items-center gap-2 flex-1 ${homeWon ? "" : "opacity-60"}`}>
                        <span className={`font-pixel text-sm flex-shrink-0 ${homeWon ? "text-gold font-bold" : "text-muted-foreground"}`}>
                          {game.homeScore}
                        </span>
                        <span className={`text-xs font-medium truncate ${homeWon ? "text-foreground" : "text-muted-foreground"}`}>
                          {game.homeTeamName}
                        </span>
                      </div>
                      {game.winnerId === champion?.id && (
                        <Crown className="w-3 h-3 flex-shrink-0" style={{ color: champion?.primaryColor ?? "#D4AF37" }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </RetroCardContent>
          </RetroCard>
        )}

        {/* Final Rankings + Awards (two-column on desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Final Rankings */}
          <RetroCard data-testid="card-final-rankings">
            <RetroCardHeader>
              <div className="flex items-center gap-2">
                <Medal className="w-4 h-4 text-gold" />
                <h3 className="font-pixel text-gold text-xs sm:text-xs">FINAL RANKINGS</h3>
              </div>
            </RetroCardHeader>
            <RetroCardContent>
              <div className="space-y-1.5">
                {standings.map((team, i) => (
                  <div
                    key={team.teamId}
                    className={`flex items-center gap-2 px-2 py-2 rounded border transition-colors
                      ${team.postseasonFinish === "champion"
                        ? "bg-yellow-500/10 border-yellow-500/30"
                        : team.postseasonFinish === "runner_up"
                        ? "bg-gray-500/10 border-gray-500/20"
                        : "bg-muted/20 border-border/20"
                      }`}
                    data-testid={`row-ranking-${i + 1}`}
                  >
                    <span className="font-pixel text-xs text-muted-foreground w-4 flex-shrink-0 text-right">
                      {i + 1}
                    </span>
                    <TeamBadge
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      size="xs"
                      name={team.name}
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${team.postseasonFinish === "champion" ? "text-yellow-300" : ""}`}>
                        {team.name}
                      </p>
                      {team.conferenceName && (
                        <p className="text-xs text-muted-foreground/60 truncate">{team.conferenceName}</p>
                      )}
                    </div>
                    <PostseasonBadge finish={team.postseasonFinish} />
                    <span className="font-pixel text-xs text-muted-foreground flex-shrink-0 ml-1">
                      {team.wins}–{team.losses}
                    </span>
                  </div>
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>

          {/* Season Awards */}
          <RetroCard data-testid="card-season-awards">
            <RetroCardHeader>
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-gold" />
                <h3 className="font-pixel text-gold text-xs sm:text-xs">SEASON AWARDS</h3>
              </div>
            </RetroCardHeader>
            <RetroCardContent>
              <div className="space-y-3">
                {[
                  { label: "PLAYER OF THE YEAR", award: awards.mvp },
                  { label: "PITCHER OF THE YEAR", award: awards.pitcherOfYear },
                  { label: "FRESHMAN OF THE YEAR", award: awards.freshmanOfYear },
                ].map(({ label, award }) =>
                  award ? (
                    <div
                      key={label}
                      className="px-3 py-3 rounded bg-muted/20 border border-border/30"
                      data-testid={`card-award-${label.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <p className="font-pixel text-xs text-gold/70 tracking-widest mb-1.5">{label}</p>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{award.playerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {award.position} &bull; {award.teamName}
                          </p>
                          <div className="mt-0.5">
                            <StarDisplay stars={award.starRating} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-pixel text-lg text-gold">{award.overall}</p>
                          <p className="font-pixel text-xs text-muted-foreground">OVR</p>
                        </div>
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </RetroCardContent>
          </RetroCard>
        </div>

        {/* Champion Starting Lineup */}
        {startingLineup.length > 0 && champion && (
          <RetroCard data-testid="card-starting-lineup">
            <RetroCardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gold" />
                <h3 className="font-pixel text-gold text-xs sm:text-xs">
                  {champion.abbreviation} — STARTING NINE + KEY STARTERS
                </h3>
              </div>
            </RetroCardHeader>
            <RetroCardContent>
              {positionPlayers.length > 0 && (
                <div className="mb-4">
                  <p className="font-pixel text-xs text-muted-foreground mb-2 uppercase tracking-wide">Position Players</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {positionPlayers.map(player => (
                      <div
                        key={player.id}
                        className="flex items-center gap-2 px-2 py-2 rounded bg-muted/20 border border-border/30"
                        data-testid={`card-lineup-player-${player.id}`}
                      >
                        <div
                          className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-muted/20"
                          style={{ backgroundColor: `rgba(${primaryRgb}, 0.15)` }}
                        >
                          <PlayerSilhouette primaryColor={champion.primaryColor} isPitcher={false} size={32} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {player.firstName[0]}. {player.lastName}
                          </p>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-pixel text-xs text-gold">{player.overall}</span>
                            <span className="text-xs text-muted-foreground/60">
                              {ELIGIBILITY_LABELS[player.eligibility] ?? player.eligibility}
                            </span>
                          </div>
                          <StarDisplay stars={player.starRating} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pitcherPlayers.length > 0 && (
                <div>
                  <p className="font-pixel text-xs text-muted-foreground mb-2 uppercase tracking-wide">Key Pitchers</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {pitcherPlayers.map((player, idx) => {
                      const pitcherLabel = idx === 0 ? "ACE" : "KEY STARTER";
                      return (
                        <div
                          key={player.id}
                          className="flex items-center gap-2 px-2 py-2 rounded bg-purple-500/10 border border-purple-500/20"
                          data-testid={`card-lineup-pitcher-${player.id}`}
                        >
                          <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-purple-500/20">
                            <PlayerSilhouette primaryColor={champion.primaryColor} isPitcher={true} size={32} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 mb-0.5">
                              <Badge
                                variant="outline"
                                className={`font-pixel text-xs px-1 py-0 h-auto ${
                                  idx === 0
                                    ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
                                    : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                }`}
                              >
                                {pitcherLabel}
                              </Badge>
                            </div>
                            <p className="text-xs font-medium truncate">
                              {player.firstName[0]}. {player.lastName}
                            </p>
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-pixel text-xs text-gold">{player.overall}</span>
                              <span className="text-xs text-muted-foreground/60">
                                {ELIGIBILITY_LABELS[player.eligibility] ?? player.eligibility}
                              </span>
                            </div>
                            <StarDisplay stars={player.starRating} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </RetroCardContent>
          </RetroCard>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-8 print:hidden">
          <Link href={`/league/${id}`}>
            <RetroButton variant="outline" data-testid="button-back-to-league-footer">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to League
            </RetroButton>
          </Link>
          <RetroButton
            onClick={handleContinue}
            data-testid="button-continue-offseason"
          >
            Continue to Offseason
          </RetroButton>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          nav, header, [data-print-hidden] { display: none !important; }
          [data-screenshot-region="championship"] { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
