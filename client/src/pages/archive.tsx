import { useState } from "react";
import { useParams, useSearch, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy, Star, Users, BarChart2, Film, ChevronLeft, Award,
  GraduationCap, Zap, Crown, Medal, BookOpen, ArrowRight,
} from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamSummary { teamId: string; name: string; abbr: string; color: string; wins: number; losses: number }
interface StatLeader { playerId: string; name: string; teamAbbr: string; teamColor: string; statLabel: string; value: string }
interface RecruiterOfYear { coachName: string | null; teamName: string; teamAbbr: string; grade: string | null; score: number | null }

interface ArchiveOverview {
  cwsChampion: TeamSummary | null;
  cwsRunnerUp: TeamSummary | null;
  confChampions: { teamId: string; name: string; abbr: string; color: string; confName: string }[];
  statLeaders: { hrLeader: StatLeader | null; avgLeader: StatLeader | null; eraLeader: StatLeader | null; soLeader: StatLeader | null };
  recruiterOfYear: RecruiterOfYear | null;
}

interface RecruitSnapshot {
  teamId: string; name: string; abbr: string; color: string;
  classRank: number; classScore: number; grade: string | null;
  totalCommits: number; fiveStars: number; fourStars: number;
  threeStars: number; twoStars: number; oneStars: number;
  topRecruitName: string | null; topRecruitOvr: number | null; topRecruitStars: number | null;
}

interface DepartedStar {
  id: string; firstName: string; lastName: string; position: string;
  overall: number; starRating: number; departureType: string; draftRound: number | null;
  seasonsPlayed: number; finalEligibility: string;
  teamId: string; teamName: string; teamAbbr: string; teamColor: string;
  abilities: string[];
}

interface LegendaryGame {
  gameId: string; headline: string | null;
  homeTeamName: string; awayTeamName: string;
  homeTeamAbbr: string; awayTeamAbbr: string;
  homeScore: number | null; awayScore: number | null;
  phase: string | null; week: number | null;
  playerOfGame: { name: string; stat: string } | null;
  turningPoint: string | null;
  badges: string[];
  dramaScore: number;
}

interface TeamStanding {
  teamId: string; name: string; abbr: string; color: string; confName: string;
  wins: number; losses: number; confWins: number; confLosses: number;
  isCwsChamp: boolean; isConfChamp: boolean;
}

interface ArchiveData {
  availableSeasons: number[];
  selectedSeason: number | null;
  overview: ArchiveOverview | null;
  recruitingSnapshots: RecruitSnapshot[];
  departedStars: DepartedStar[];
  legendaryGames: LegendaryGame[];
  teamStandings: TeamStanding[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function TeamDot({ color }: { color: string }) {
  return <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />;
}

function gradeColor(g: string | null) {
  if (!g) return "text-muted-foreground";
  if (g.startsWith("A")) return "text-emerald-400";
  if (g.startsWith("B")) return "text-sky-400";
  return "text-amber-400";
}

function DepartureLabel({ type, round }: { type: string; round: number | null }) {
  if (type === "drafted" || type === "declared") {
    return (
      <Badge className="text-xs bg-yellow-500/20 border-yellow-500/40 text-yellow-400">
        {round ? `Rd ${round} Pick` : "Drafted"}
      </Badge>
    );
  }
  if (type === "transfer_portal") return <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/40">Transfer</Badge>;
  if (type === "graduated") return <Badge variant="outline" className="text-xs text-sky-400 border-sky-500/40">Grad</Badge>;
  if (type === "cut_juco") return <Badge variant="outline" className="text-xs">JUCO</Badge>;
  return <Badge variant="outline" className="text-xs">{type}</Badge>;
}

function PhaseLabel({ phase }: { phase: string | null }) {
  const labels: Record<string, string> = {
    cws: "CWS", super_regionals: "Super Regionals",
    conference_championship: "Conf Champ", regular_season: "Regular Season",
    spring_training: "Spring Training",
  };
  const colors: Record<string, string> = {
    cws: "text-gold border-gold/40 bg-gold/10",
    super_regionals: "text-orange-400 border-orange-500/40 bg-orange-500/10",
    conference_championship: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  };
  const label = labels[phase ?? ""] ?? phase ?? "—";
  const cls = colors[phase ?? ""] ?? "text-muted-foreground border-border/40";
  return <Badge variant="outline" className={`text-xs ${cls}`}>{label}</Badge>;
}

function StarRow({ stars }: { stars: number | null }) {
  if (!stars) return null;
  const colors: Record<number, string> = { 5: "text-orange-400", 4: "text-yellow-400", 3: "text-green-400", 2: "text-blue-400", 1: "text-gray-400" };
  return <span className={`font-pixel text-xs ${colors[stars] ?? "text-muted-foreground"}`}>{"★".repeat(stars)}</span>;
}

// ── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab({ overview, season }: { overview: ArchiveOverview; season: number }) {
  return (
    <div className="space-y-4">
      {/* CWS Champion card */}
      <RetroCard data-testid="card-cws-champion">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold" />
            <span>Season {season} Champion</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {overview.cwsChampion ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gold/10 border border-gold/30">
                <Crown className="w-6 h-6 text-gold flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-pixel text-gold text-xs mb-0.5">CWS CHAMPION</p>
                  <p className="font-medium text-base leading-tight truncate">{overview.cwsChampion.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {overview.cwsChampion.wins}–{overview.cwsChampion.losses}
                  </p>
                </div>
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: overview.cwsChampion.color }} />
              </div>
              {overview.cwsRunnerUp && (
                <div className="flex items-center gap-3 px-3 py-2 rounded bg-background/40 border border-border/40">
                  <Medal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Runner-Up</p>
                    <p className="text-sm font-medium truncate">{overview.cwsRunnerUp.name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {overview.cwsRunnerUp.wins}–{overview.cwsRunnerUp.losses}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No CWS data for this season</p>
          )}

          {overview.confChampions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <p className="font-pixel text-xs text-muted-foreground mb-2">CONFERENCE CHAMPIONS</p>
              <div className="flex flex-wrap gap-2">
                {overview.confChampions.map(c => (
                  <div key={c.teamId} className="flex items-center gap-1.5 px-2 py-1 rounded bg-background/40 border border-border/40">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }} />
                    <span className="text-xs font-medium">{c.abbr}</span>
                    <span className="text-xs text-muted-foreground">{c.confName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </RetroCardContent>
      </RetroCard>

      {/* Stat Leaders */}
      <RetroCard data-testid="card-stat-leaders">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-gold" />
            <span>Season {season} Leaders</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="grid grid-cols-2 gap-3">
            {[
              overview.statLeaders.hrLeader,
              overview.statLeaders.avgLeader,
              overview.statLeaders.eraLeader,
              overview.statLeaders.soLeader,
            ].filter(Boolean).map(leader => (
              <div key={leader!.statLabel} className="p-2 rounded bg-background/40 border border-border/40" data-testid={`stat-leader-${leader!.statLabel.toLowerCase()}`}>
                <p className="font-pixel text-xs text-muted-foreground mb-1">{leader!.statLabel} LEADER</p>
                <p className="text-sm font-medium leading-tight truncate">{leader!.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: leader!.teamColor }} />
                  <span className="text-xs text-muted-foreground">{leader!.teamAbbr}</span>
                  <span className="text-gold font-pixel text-xs ml-auto">{leader!.value}</span>
                </div>
              </div>
            ))}
          </div>

          {overview.recruiterOfYear && (
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-3 p-2 rounded bg-background/30">
              <Star className="w-4 h-4 text-gold flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-pixel text-xs text-gold">RECRUITER OF THE YEAR</p>
                <p className="text-sm font-medium truncate">{overview.recruiterOfYear.coachName ?? overview.recruiterOfYear.teamName}</p>
                <p className="text-xs text-muted-foreground">{overview.recruiterOfYear.teamAbbr}</p>
              </div>
              {overview.recruiterOfYear.grade && (
                <span className={`font-pixel text-[14px] font-bold ${gradeColor(overview.recruiterOfYear.grade)}`}>
                  {overview.recruiterOfYear.grade}
                </span>
              )}
            </div>
          )}
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

// ── Recruiting Tab ─────────────────────────────────────────────────────────────

function RecruitingTab({ snapshots, season }: { snapshots: RecruitSnapshot[]; season: number }) {
  if (snapshots.length === 0) {
    return (
      <RetroCard><RetroCardContent>
        <p className="text-center text-sm text-muted-foreground py-8">No recruiting data for Season {season}</p>
      </RetroCardContent></RetroCard>
    );
  }
  return (
    <div className="space-y-2" data-testid="section-recruiting-archive">
      <p className="text-xs text-muted-foreground px-1">Season {season} class rankings — {snapshots.length} teams</p>
      {snapshots.map(snap => (
        <RetroCard key={snap.teamId} data-testid={`card-recruiting-${snap.teamId}`}>
          <RetroCardContent className="py-3">
            <div className="flex items-start gap-3">
              <div className={`font-pixel text-xs w-8 flex-shrink-0 ${snap.classRank === 1 ? "text-gold" : snap.classRank <= 3 ? "text-yellow-400" : "text-muted-foreground"}`}>
                #{snap.classRank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <TeamDot color={snap.color} />
                  <span className="font-medium text-sm truncate">{snap.name}</span>
                  {snap.grade && (
                    <span className={`font-pixel text-xs font-bold ${gradeColor(snap.grade)}`}>{snap.grade}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{snap.totalCommits} commits</span>
                  {snap.fiveStars > 0 && <span className="text-orange-400">{snap.fiveStars}× 5★</span>}
                  {snap.fourStars > 0 && <span className="text-yellow-400">{snap.fourStars}× 4★</span>}
                  {snap.threeStars > 0 && <span>{snap.threeStars}× 3★</span>}
                </div>
                {snap.topRecruitName && (
                  <p className="text-xs mt-1">
                    <span className="text-muted-foreground">Top: </span>
                    <span className="font-medium">{snap.topRecruitName}</span>
                    {snap.topRecruitOvr && <span className="text-muted-foreground ml-1">({snap.topRecruitOvr} OVR)</span>}
                    {snap.topRecruitStars && <StarRow stars={snap.topRecruitStars} />}
                  </p>
                )}
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
      ))}
    </div>
  );
}

// ── Departed Stars Tab ─────────────────────────────────────────────────────────

function DepartedTab({ departed, season }: { departed: DepartedStar[]; season: number }) {
  const [filter, setFilter] = useState<"all" | "drafted" | "graduated" | "transfer">("all");
  const filtered = departed.filter(d => {
    if (filter === "all") return true;
    if (filter === "drafted") return d.departureType === "drafted" || d.departureType === "declared";
    if (filter === "graduated") return d.departureType === "graduated";
    if (filter === "transfer") return d.departureType === "transfer_portal";
    return true;
  });

  if (departed.length === 0) {
    return (
      <RetroCard><RetroCardContent>
        <p className="text-center text-sm text-muted-foreground py-8">No departed players recorded for Season {season}</p>
      </RetroCardContent></RetroCard>
    );
  }

  return (
    <div className="space-y-3" data-testid="section-departed-archive">
      <div className="flex gap-2 flex-wrap" data-testid="departed-filters">
        {(["all", "drafted", "graduated", "transfer"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium min-h-[36px] transition-colors border ${
              filter === f
                ? "bg-gold text-forest-dark border-gold"
                : "border-border/50 text-muted-foreground hover:border-gold/40 hover:text-foreground"
            }`}
            data-testid={`filter-departed-${f}`}
          >
            {f === "all" ? "All" : f === "drafted" ? "Drafted/Declared" : f === "graduated" ? "Graduated" : "Transfers"}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground px-1">{filtered.length} player{filtered.length !== 1 ? "s" : ""}</p>
      <div className="space-y-2">
        {filtered.map(d => (
          <RetroCard key={d.id} data-testid={`card-departed-${d.id}`}>
            <RetroCardContent className="py-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm">{d.firstName} {d.lastName}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{d.position}</Badge>
                    <DepartureLabel type={d.departureType} round={d.draftRound} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TeamDot color={d.teamColor} />
                    <span>{d.teamAbbr}</span>
                    <span>·</span>
                    <span>{d.overall} OVR</span>
                    <StarRow stars={d.starRating} />
                    <span>·</span>
                    <span>{d.seasonsPlayed} season{d.seasonsPlayed !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
            </RetroCardContent>
          </RetroCard>
        ))}
      </div>
    </div>
  );
}

// ── Legendary Games Tab ────────────────────────────────────────────────────────

function GamesTab({ games, season }: { games: LegendaryGame[]; season: number }) {
  if (games.length === 0) {
    return (
      <RetroCard><RetroCardContent>
        <p className="text-center text-sm text-muted-foreground py-8">No game recaps recorded for Season {season}</p>
      </RetroCardContent></RetroCard>
    );
  }
  return (
    <div className="space-y-3" data-testid="section-games-archive">
      <p className="text-xs text-muted-foreground px-1">Top {games.length} memorable game{games.length !== 1 ? "s" : ""} from Season {season}</p>
      {games.map((g, i) => {
        const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
        const winner = homeWon ? g.homeTeamAbbr : g.awayTeamAbbr;
        const loser = homeWon ? g.awayTeamAbbr : g.homeTeamAbbr;
        const winScore = homeWon ? g.homeScore : g.awayScore;
        const loseScore = homeWon ? g.awayScore : g.homeScore;
        return (
          <RetroCard key={g.gameId} data-testid={`card-game-${g.gameId}`}>
            <RetroCardContent className="py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {i === 0 && <Zap className="w-3 h-3 text-gold flex-shrink-0" />}
                    <PhaseLabel phase={g.phase} />
                    {g.week && <span className="text-xs text-muted-foreground">Wk {g.week}</span>}
                  </div>
                  <p className="font-pixel text-xs text-gold">
                    {winner} {winScore} – {loseScore} {loser}
                  </p>
                  {g.headline && (
                    <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">{g.headline}</p>
                  )}
                </div>
              </div>
              {g.playerOfGame && (
                <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <Star className="w-3 h-3 text-gold" />
                  <span className="font-medium text-foreground">{g.playerOfGame.name}</span>
                  <span>{g.playerOfGame.stat}</span>
                </div>
              )}
              {g.turningPoint && (
                <p className="text-xs text-muted-foreground italic line-clamp-2">{g.turningPoint}</p>
              )}
              {Array.isArray(g.badges) && g.badges.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {g.badges.map((b, bi) => (
                    <Badge key={bi} variant="outline" className="text-xs border-gold/30 text-gold/80">{b}</Badge>
                  ))}
                </div>
              )}
            </RetroCardContent>
          </RetroCard>
        );
      })}
    </div>
  );
}

// ── Teams Tab ─────────────────────────────────────────────────────────────────

function TeamsTab({ standings, leagueId, season }: { standings: TeamStanding[]; leagueId: string; season: number }) {
  if (standings.length === 0) {
    return (
      <RetroCard><RetroCardContent>
        <p className="text-center text-sm text-muted-foreground py-8">No standings data for Season {season}</p>
      </RetroCardContent></RetroCard>
    );
  }

  const byConf = standings.reduce<Record<string, TeamStanding[]>>((acc, t) => {
    const key = t.confName || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-4" data-testid="section-teams-archive">
      {Object.entries(byConf).map(([confName, teams]) => (
        <RetroCard key={confName}>
          <RetroCardHeader>
            <span className="text-sm">{confName}</span>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-1">
              {teams.map(t => (
                <Link key={t.teamId} href={`/league/${leagueId}/archive/team/${t.teamId}`}>
                  <div
                    className="flex items-center gap-3 px-2 py-2.5 rounded hover:bg-accent/30 transition-colors cursor-pointer min-h-[44px]"
                    data-testid={`row-team-${t.teamId}`}
                  >
                    <TeamDot color={t.color} />
                    <span className="flex-1 text-sm font-medium truncate">{t.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {t.isCwsChamp && <Trophy className="w-3.5 h-3.5 text-gold" />}
                      {t.isConfChamp && !t.isCwsChamp && <Crown className="w-3.5 h-3.5 text-sky-400" />}
                      <span className="text-xs tabular-nums text-muted-foreground">{t.wins}–{t.losses}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </RetroCardContent>
        </RetroCard>
      ))}
    </div>
  );
}

// ── Main Archive Page ──────────────────────────────────────────────────────────

export default function ArchivePage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const seasonParam = params.get("season");

  const { data, isLoading } = useQuery<ArchiveData>({
    queryKey: ["/api/leagues", id, "archive", seasonParam ?? ""],
    queryFn: () =>
      fetch(`/api/leagues/${id}/archive${seasonParam ? `?season=${seasonParam}` : ""}`, {
        credentials: "include",
      }).then(r => r.json()),
  });

  const { data: leagueData } = useQuery<{ league: { name: string; currentSeason: number } }>({
    queryKey: ["/api/leagues", id],
  });

  function onSeasonChange(val: string) {
    setLocation(`/league/${id}/archive?season=${val}`);
  }

  const leagueName = leagueData?.league?.name ?? "League";

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 border-b border-border/50 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/league/${id}`}>
              <button className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2 text-muted-foreground hover:text-foreground transition-colors" data-testid="btn-back-archive">
                <ChevronLeft className="w-5 h-5" />
              </button>
            </Link>
            <div className="flex-1 min-w-0">
              <p className="font-pixel text-gold text-xs">{leagueName.toUpperCase()}</p>
              <h1 className="font-pixel text-xs text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-gold" />
                Historical Archive
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Season picker */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Season:</span>
          {isLoading ? (
            <Skeleton className="h-9 w-32" />
          ) : (
            <Select
              value={data?.selectedSeason?.toString() ?? ""}
              onValueChange={onSeasonChange}
            >
              <SelectTrigger className="w-36 h-9 text-sm" data-testid="select-archive-season">
                <SelectValue placeholder="Select season" />
              </SelectTrigger>
              <SelectContent>
                {(data?.availableSeasons ?? []).map(s => (
                  <SelectItem key={s} value={s.toString()}>
                    Season {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {data?.availableSeasons && data.availableSeasons.length === 0 && (
            <span className="text-xs text-muted-foreground">Complete a season to start building your archive.</span>
          )}
        </div>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </div>
        )}

        {!isLoading && data && data.selectedSeason !== null && (
          <Tabs defaultValue="overview">
            <TabsList className="w-full grid grid-cols-5 h-auto mb-4">
              {[
                { value: "overview", icon: <Trophy className="w-3.5 h-3.5" />, label: "Overview" },
                { value: "recruiting", icon: <Star className="w-3.5 h-3.5" />, label: "Recruiting" },
                { value: "departed", icon: <GraduationCap className="w-3.5 h-3.5" />, label: "Departed" },
                { value: "games", icon: <Film className="w-3.5 h-3.5" />, label: "Games" },
                { value: "teams", icon: <Users className="w-3.5 h-3.5" />, label: "Teams" },
              ].map(tab => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex flex-col gap-0.5 py-2 px-1 min-h-[52px]" data-testid={`tab-archive-${tab.value}`}>
                  {tab.icon}
                  <span className="text-xs leading-tight">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview">
              {data.overview ? (
                <OverviewTab overview={data.overview} season={data.selectedSeason} />
              ) : (
                <RetroCard><RetroCardContent>
                  <p className="text-center text-sm text-muted-foreground py-8">No overview data for this season yet.</p>
                </RetroCardContent></RetroCard>
              )}
            </TabsContent>

            <TabsContent value="recruiting">
              <RecruitingTab snapshots={data.recruitingSnapshots} season={data.selectedSeason} />
            </TabsContent>

            <TabsContent value="departed">
              <DepartedTab departed={data.departedStars} season={data.selectedSeason} />
            </TabsContent>

            <TabsContent value="games">
              <GamesTab games={data.legendaryGames} season={data.selectedSeason} />
            </TabsContent>

            <TabsContent value="teams">
              <TeamsTab standings={data.teamStandings} leagueId={id} season={data.selectedSeason} />
            </TabsContent>
          </Tabs>
        )}

        {!isLoading && data && data.availableSeasons.length === 0 && (
          <RetroCard>
            <RetroCardContent>
              <div className="text-center py-12 space-y-3">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/30" />
                <p className="font-pixel text-gold text-xs">No History Yet</p>
                <p className="text-sm text-muted-foreground">
                  Complete your first season to start building your dynasty archive.
                </p>
                <Link href={`/league/${id}`}>
                  <RetroButton size="sm" className="mt-2">Back to League</RetroButton>
                </Link>
              </div>
            </RetroCardContent>
          </RetroCard>
        )}

        {/* Quick links to other historical features */}
        {!isLoading && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Link href={`/league/${id}/record-book`}>
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-gold/40 transition-colors cursor-pointer min-h-[52px]" data-testid="link-record-book">
                <Award className="w-4 h-4 text-gold flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium">Record Book</p>
                  <p className="text-xs text-muted-foreground">All-time leaders</p>
                </div>
              </div>
            </Link>
            <Link href={`/league/${id}?tab=history`}>
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-gold/40 transition-colors cursor-pointer min-h-[52px]" data-testid="link-dynasty-history">
                <BarChart2 className="w-4 h-4 text-gold flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium">Dynasty History</p>
                  <p className="text-xs text-muted-foreground">Season trends</p>
                </div>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
