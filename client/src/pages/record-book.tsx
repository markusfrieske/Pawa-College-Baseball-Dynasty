import React, { useState } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy, BookOpen, Users, TrendingUp, Star, ChevronDown, ChevronUp, Award, BarChart2, Target } from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PlayerProfileCard } from "@/components/player-profile-card";

interface SeasonEntry {
  season: number;
  championTeamId: string | null;
  championName: string | null;
  championW: number;
  championL: number;
  runnerUpName: string | null;
  runnerUpW: number;
  runnerUpL: number;
  isCwsChampion: boolean;
  confChampions: { teamId: string; teamName: string; confId: string | null }[];
  hrLeader: { name: string; value: number; teamId: string; playerId?: string } | null;
  avgLeader: { name: string; value: string; teamId: string; playerId?: string } | null;
  eraLeader: { name: string; value: string; teamId: string; playerId?: string } | null;
  recruitingGrade: string | null;
  winsLeader: { name: string; teamId: string; wins: number; losses: number } | null;
}

interface CareerBatter {
  playerId: string; name: string; teamName: string; teamAbbr: string; teamColor: string;
  position: string; seasons: number; games: number; ab: number;
  avg: string; hr: number; rbi: number; ops: string; war: string;
  status: "active" | "graduated" | "drafted"; lastSeason: number;
}

interface CareerPitcher {
  playerId: string; name: string; teamName: string; teamAbbr: string; teamColor: string;
  position: string; seasons: number; games: number; wins: number; losses: number;
  ip: string; era: string; whip: string; so: number; war: string;
  status: "active" | "graduated" | "drafted"; lastSeason: number;
}

interface CareerFielder {
  playerId: string; name: string; teamName: string; teamAbbr: string; teamColor: string;
  position: string; seasons: number; games: number;
  putouts: number; assists: number; errors: number; totalChances: number;
  fldPct: string; oaa: number;
}

interface TeamRecord {
  teamId: string; teamName: string; teamAbbr: string; teamColor: string;
  allTimeW: number; allTimeL: number; pct: string;
  championships: number; bestSeasonW: number;
  postseasonApps: number; allTimeFiveStars: number;
}

interface CoachStat {
  coachId: string; name: string; archetype: string;
  teamName: string; teamAbbr: string; teamColor: string;
  seasons: number; w: number; l: number; pct: string;
  championships: number; confChampionships: number; cwsAppearances: number;
  legacyScore: number; teamsCoached: string[];
}

interface RecruitingSnapshot {
  teamId: string; teamName: string; teamAbbr: string; teamColor: string;
  classRank: number; grade: string; classScore: number;
  totalCommits: number; fiveStars: number; fourStars: number;
  topRecruitName: string | null; topRecruitOvr: number | null; topRecruitStars: number | null;
  signedPlayers: { name: string; position: string }[];
}

interface RecruitingSeason {
  season: number;
  snapshots: RecruitingSnapshot[];
}

interface HoFPlayer {
  id: string; name: string; position: string;
  teamName: string; teamAbbr: string; teamColor: string;
  overall: number; starRating: number; seasonsPlayed: number;
  departureType: string; draftRound: number | null; departedSeason: number;
  abilities: string[];
  bestSeasonStat: string | null;
  careerWar: number;
  legacyScore: number;
}

interface RecordBookData {
  seasons: SeasonEntry[];
  careerBattingLeaders: CareerBatter[];
  careerPitchingLeaders: CareerPitcher[];
  careerFieldingLeaders: CareerFielder[];
  teamRecords: TeamRecord[];
  coachStats: CoachStat[];
  recruitingHistory: RecruitingSeason[];
  hallOfFame: HoFPlayer[];
  meta: { currentSeason: number; totalSeasons: number };
}

type ActiveSection = "seasons" | "batting" | "pitching" | "fielding" | "teams" | "coaches" | "recruiting" | "hof";

function gradeColor(grade: string) {
  if (grade.startsWith("A")) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (grade.startsWith("B")) return "text-sky-400 bg-sky-500/10 border-sky-500/30";
  return "text-amber-400 bg-amber-500/10 border-amber-500/30";
}

function StarBadge({ stars }: { stars: number }) {
  const colors: Record<number, string> = {
    5: "text-orange-400", 4: "text-yellow-400", 3: "text-green-400", 2: "text-blue-400", 1: "text-gray-400",
  };
  return <span className={`text-xs font-semibold ${colors[stars] ?? "text-muted-foreground"}`}>{"★".repeat(stars)}</span>;
}

function TeamDot({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />;
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="text-gold">{icon}</div>
      <div>
        <h2 className="text-gold text-xs sm:text-[13px]">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function SeasonHistorySection({ seasons, leagueId }: { seasons: SeasonEntry[]; leagueId: string }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!seasons.length) return <p className="text-sm text-muted-foreground text-center py-8">No completed seasons yet.</p>;

  return (
    <div className="space-y-3" data-testid="section-season-history">
      {seasons.map(s => (
        <RetroCard key={s.season} variant="bordered">
          <button
            className="w-full text-left"
            onClick={() => setExpanded(expanded === s.season ? null : s.season)}
            data-testid={`season-row-${s.season}`}
          >
            <RetroCardContent className="py-3">
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-gold flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gold text-xs">Season {s.season}</span>
                    {s.championName && s.championTeamId && (
                      <Link href={`/league/${leagueId}/team/${s.championTeamId}/profile`}>
                        <span className="text-xs font-semibold text-foreground hover:text-gold transition-colors cursor-pointer truncate">
                          {s.championName} ({s.championW}-{s.championL})
                        </span>
                      </Link>
                    )}
                    {s.championName && !s.championTeamId && (
                      <span className="text-xs font-semibold text-foreground truncate">
                        {s.championName} ({s.championW}-{s.championL})
                      </span>
                    )}
                    {s.isCwsChampion && (
                      <span className="text-xs font-semibold bg-gold/15 text-gold border border-gold/40 rounded px-1 py-0.5">CWS</span>
                    )}
                    {!s.championName && <span className="text-xs text-muted-foreground">No champion recorded</span>}
                  </div>
                  {s.runnerUpName && (
                    <p className="text-xs text-muted-foreground mt-0.5">Runner-up: {s.runnerUpName} ({s.runnerUpW}-{s.runnerUpL})</p>
                  )}
                </div>
                {s.recruitingGrade && (
                  <span className={`text-xs font-semibold border rounded px-1.5 py-0.5 ${gradeColor(s.recruitingGrade)}`}>
                    {s.recruitingGrade}
                  </span>
                )}
                {expanded === s.season ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
              </div>
            </RetroCardContent>
          </button>

          {expanded === s.season && (
            <div className="border-t border-border/50 px-4 pb-4 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {s.winsLeader && (
                  <div className="sm:col-span-3 bg-card/60 border border-border/40 rounded p-2 flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-gold flex-shrink-0" />
                    <span className="text-xs font-semibold text-muted-foreground">BEST RECORD:</span>
                    <Link href={`/league/${leagueId}/team/${s.winsLeader.teamId}/profile`}>
                      <span className="text-xs font-medium hover:text-gold transition-colors cursor-pointer">{s.winsLeader.name}</span>
                    </Link>
                    <span className="text-xs text-emerald-400 ml-auto">{s.winsLeader.wins}–{s.winsLeader.losses}</span>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">STAT LEADERS</p>
                  <div className="space-y-1.5">
                    {s.hrLeader && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground w-6">HR</span>
                        <span className="font-medium text-xs">{s.hrLeader.name}</span>
                        <span className="text-gold text-xs ml-auto">{s.hrLeader.value}</span>
                      </div>
                    )}
                    {s.avgLeader && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground w-6">AVG</span>
                        <span className="font-medium text-xs">{s.avgLeader.name}</span>
                        <span className="text-gold text-xs ml-auto">{s.avgLeader.value}</span>
                      </div>
                    )}
                    {s.eraLeader && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground w-6">ERA</span>
                        <span className="font-medium text-xs">{s.eraLeader.name}</span>
                        <span className="text-gold text-xs ml-auto">{s.eraLeader.value}</span>
                      </div>
                    )}
                    {!s.hrLeader && !s.avgLeader && !s.eraLeader && (
                      <p className="text-xs text-muted-foreground">No stats recorded</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">CONF CHAMPIONS</p>
                  <div className="space-y-1">
                    {s.confChampions.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-xs text-gold">★</span>
                        <Link href={`/league/${leagueId}/team/${c.teamId}/profile`}>
                          <span className="text-xs hover:text-gold transition-colors cursor-pointer">{c.teamName}</span>
                        </Link>
                      </div>
                    ))}
                    {!s.confChampions.length && <p className="text-xs text-muted-foreground">—</p>}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">CLASS GRADE</p>
                  {s.recruitingGrade ? (
                    <span className={`text-xs font-semibold border rounded px-2 py-1 ${gradeColor(s.recruitingGrade)}`}>
                      {s.recruitingGrade}
                    </span>
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </RetroCard>
      ))}
    </div>
  );
}

function CareerBattingSection({ leaders, leagueId, onPlayerClick }: { leaders: CareerBatter[]; leagueId: string; onPlayerClick: (playerId: string) => void }) {
  type BattingSort = "war" | "avg" | "hr" | "rbi" | "ops";
  const [sort, setSort] = useState<BattingSort>("war");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [yearFilter, setYearFilter] = useState<number | "ALL">("ALL");

  const BATTER_POSITIONS = ["ALL", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "OF", "IF"];
  const posOptions = BATTER_POSITIONS.filter(p => p === "ALL" || leaders.some(l => l.position === p));
  const STATUS_OPTIONS = ["ALL", "active", "graduated", "drafted"] as const;
  const yearOptions = ["ALL", ...[...new Set(leaders.filter(b => b.lastSeason > 0).map(b => b.lastSeason))].sort((a, b) => b - a)] as (number | "ALL")[];

  const sorted = [...leaders]
    .filter(b => posFilter === "ALL" || b.position === posFilter)
    .filter(b => statusFilter === "ALL" || b.status === statusFilter)
    .filter(b => yearFilter === "ALL" || b.lastSeason === yearFilter)
    .sort((a, b) => {
      if (sort === "war") return parseFloat(b.war) - parseFloat(a.war);
      if (sort === "avg") return parseFloat(b.avg) - parseFloat(a.avg);
      if (sort === "hr") return b.hr - a.hr;
      if (sort === "rbi") return b.rbi - a.rbi;
      if (sort === "ops") return parseFloat(b.ops) - parseFloat(a.ops);
      return 0;
    }).slice(0, 25);

  const sortButtons: { key: BattingSort; label: string }[] = [
    { key: "war", label: "WAR" }, { key: "avg", label: "AVG" },
    { key: "hr", label: "HR" }, { key: "rbi", label: "RBI" }, { key: "ops", label: "OPS" },
  ];

  if (!leaders.length) return <p className="text-sm text-muted-foreground text-center py-8">No batting stats accumulated yet.</p>;

  return (
    <div className="space-y-3" data-testid="section-career-batting">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          {sortButtons.map(b => (
            <RetroButton key={b.key} variant={sort === b.key ? "primary" : "outline"} size="sm"
              onClick={() => setSort(b.key)} data-testid={`batting-sort-${b.key}`}>
              {b.label}
            </RetroButton>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Status:</span>
          {STATUS_OPTIONS.map(s => (
            <RetroButton key={s} variant={statusFilter === s ? "primary" : "outline"} size="sm"
              onClick={() => setStatusFilter(s)} data-testid={`batting-status-${s}`}>
              {s === "ALL" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </RetroButton>
          ))}
        </div>
        {yearOptions.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Season:</span>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value === "ALL" ? "ALL" : parseInt(e.target.value))}
              className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
              data-testid="batting-year-filter">
              {yearOptions.map(y => <option key={y} value={y}>{y === "ALL" ? "All Seasons" : `Season ${y}`}</option>)}
            </select>
          </div>
        )}
        {posOptions.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Position:</span>
            {posOptions.map(p => (
              <RetroButton key={p} variant={posFilter === p ? "primary" : "outline"} size="sm"
                onClick={() => setPosFilter(p)} data-testid={`batting-pos-${p}`}>
                {p}
              </RetroButton>
            ))}
          </div>
        )}
      </div>
      <RetroCard variant="bordered">
        <RetroCardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-career-batting">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center w-8">#</th>
                  <th className="py-2 px-2 text-xs font-semibold text-gold">Player</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground">Team</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">Yrs</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">G</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">AB</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">AVG</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">HR</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">RBI</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">OPS</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">WAR</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b, i) => (
                  <tr key={b.playerId} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    data-testid={`row-career-batter-${i}`}>
                    <td className="py-2 px-2 text-center text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => b.playerId && onPlayerClick(b.playerId)}
                        className="text-left hover:text-gold transition-colors group"
                        data-testid={`link-player-${b.playerId}`}
                      >
                        <span className="text-xs font-medium group-hover:underline">{b.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">({b.position})</span>
                      </button>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <TeamDot color={b.teamColor} />
                        <span className="text-xs font-semibold">{b.teamAbbr}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center text-xs">{b.seasons}</td>
                    <td className="py-2 px-2 text-center text-xs">{b.games}</td>
                    <td className="py-2 px-2 text-center text-xs">{b.ab}</td>
                    <td className={`py-2 px-2 text-center text-xs font-medium ${sort === "avg" ? "text-gold" : ""}`}>{b.avg}</td>
                    <td className={`py-2 px-2 text-center text-xs font-medium ${sort === "hr" ? "text-gold" : ""}`}>{b.hr}</td>
                    <td className={`py-2 px-2 text-center text-xs ${sort === "rbi" ? "text-gold font-medium" : ""}`}>{b.rbi}</td>
                    <td className={`py-2 px-2 text-center text-xs ${sort === "ops" ? "text-gold font-medium" : ""}`}>{b.ops}</td>
                    <td className={`py-2 px-2 text-center text-xs font-bold ${sort === "war" ? "text-gold" : ""}`}>{b.war}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function CareerPitchingSection({ leaders, leagueId, onPlayerClick }: { leaders: CareerPitcher[]; leagueId: string; onPlayerClick: (playerId: string) => void }) {
  type PitchingSort = "era" | "whip" | "so" | "wins" | "war";
  const [sort, setSort] = useState<PitchingSort>("era");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [yearFilter, setYearFilter] = useState<number | "ALL">("ALL");

  const PITCHER_POSITIONS = ["ALL", "SP", "RP", "CL", "P", "LHP", "RHP"];
  const posOptions = PITCHER_POSITIONS.filter(p => p === "ALL" || leaders.some(l => l.position === p));
  const STATUS_OPTIONS = ["ALL", "active", "graduated", "drafted"] as const;
  const yearOptions = ["ALL", ...[...new Set(leaders.filter(p => p.lastSeason > 0).map(p => p.lastSeason))].sort((a, b) => b - a)] as (number | "ALL")[];

  const sorted = [...leaders]
    .filter(p => posFilter === "ALL" || p.position === posFilter)
    .filter(p => statusFilter === "ALL" || p.status === statusFilter)
    .filter(p => yearFilter === "ALL" || p.lastSeason === yearFilter)
    .sort((a, b) => {
      if (sort === "era") return parseFloat(a.era) - parseFloat(b.era);
      if (sort === "whip") return parseFloat(a.whip) - parseFloat(b.whip);
      if (sort === "so") return b.so - a.so;
      if (sort === "wins") return b.wins - a.wins;
      if (sort === "war") return parseFloat(b.war) - parseFloat(a.war);
      return 0;
    }).slice(0, 25);

  const sortButtons: { key: PitchingSort; label: string }[] = [
    { key: "era", label: "ERA" }, { key: "whip", label: "WHIP" },
    { key: "so", label: "SO" }, { key: "wins", label: "Wins" }, { key: "war", label: "WAR" },
  ];

  if (!leaders.length) return <p className="text-sm text-muted-foreground text-center py-8">No pitching stats accumulated yet.</p>;

  return (
    <div className="space-y-3" data-testid="section-career-pitching">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          {sortButtons.map(b => (
            <RetroButton key={b.key} variant={sort === b.key ? "primary" : "outline"} size="sm"
              onClick={() => setSort(b.key)} data-testid={`pitching-sort-${b.key}`}>
              {b.label}
            </RetroButton>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Status:</span>
          {STATUS_OPTIONS.map(s => (
            <RetroButton key={s} variant={statusFilter === s ? "primary" : "outline"} size="sm"
              onClick={() => setStatusFilter(s)} data-testid={`pitching-status-${s}`}>
              {s === "ALL" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </RetroButton>
          ))}
        </div>
        {yearOptions.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Season:</span>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value === "ALL" ? "ALL" : parseInt(e.target.value))}
              className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
              data-testid="pitching-year-filter">
              {yearOptions.map(y => <option key={y} value={y}>{y === "ALL" ? "All Seasons" : `Season ${y}`}</option>)}
            </select>
          </div>
        )}
        {posOptions.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Position:</span>
            {posOptions.map(p => (
              <RetroButton key={p} variant={posFilter === p ? "primary" : "outline"} size="sm"
                onClick={() => setPosFilter(p)} data-testid={`pitching-pos-${p}`}>
                {p}
              </RetroButton>
            ))}
          </div>
        )}
      </div>
      <RetroCard variant="bordered">
        <RetroCardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-career-pitching">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center w-8">#</th>
                  <th className="py-2 px-2 text-xs font-semibold text-gold">Player</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground">Team</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">Yrs</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">W</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">L</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">IP</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">ERA</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">WHIP</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">SO</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">WAR</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={p.playerId} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    data-testid={`row-career-pitcher-${i}`}>
                    <td className="py-2 px-2 text-center text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => p.playerId && onPlayerClick(p.playerId)}
                        className="text-left hover:text-gold transition-colors group"
                        data-testid={`link-pitcher-${p.playerId}`}
                      >
                        <span className="text-xs font-medium group-hover:underline">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">({p.position})</span>
                      </button>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <TeamDot color={p.teamColor} />
                        <span className="text-xs font-semibold">{p.teamAbbr}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center text-xs">{p.seasons}</td>
                    <td className={`py-2 px-2 text-center text-xs font-medium ${sort === "wins" ? "text-gold" : "text-emerald-400"}`}>{p.wins}</td>
                    <td className="py-2 px-2 text-center text-xs text-red-400">{p.losses}</td>
                    <td className="py-2 px-2 text-center text-xs">{p.ip}</td>
                    <td className={`py-2 px-2 text-center text-xs font-medium ${sort === "era" ? "text-gold" : ""}`}>{p.era}</td>
                    <td className={`py-2 px-2 text-center text-xs ${sort === "whip" ? "text-gold font-medium" : ""}`}>{p.whip}</td>
                    <td className={`py-2 px-2 text-center text-xs ${sort === "so" ? "text-gold font-medium" : ""}`}>{p.so}</td>
                    <td className={`py-2 px-2 text-center text-xs font-bold ${sort === "war" ? "text-gold" : ""}`}>{p.war}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function CareerFieldingSection({ leaders, onPlayerClick }: { leaders: CareerFielder[]; onPlayerClick: (playerId: string) => void }) {
  type FieldingSort = "fldPct" | "oaa" | "putouts" | "assists" | "totalChances";
  const [sort, setSort] = useState<FieldingSort>("fldPct");
  const [posFilter, setPosFilter] = useState<string>("ALL");

  const FIELD_POSITIONS = ["ALL", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "IF"];
  const posOptions = FIELD_POSITIONS.filter(p => p === "ALL" || leaders.some(l => l.position === p));

  const sorted = [...leaders]
    .filter(f => posFilter === "ALL" || f.position === posFilter)
    .sort((a, b) => {
      if (sort === "fldPct") return parseFloat(b.fldPct) - parseFloat(a.fldPct);
      if (sort === "oaa") return b.oaa - a.oaa;
      if (sort === "putouts") return b.putouts - a.putouts;
      if (sort === "assists") return b.assists - a.assists;
      if (sort === "totalChances") return b.totalChances - a.totalChances;
      return 0;
    }).slice(0, 25);

  const sortButtons: { key: FieldingSort; label: string }[] = [
    { key: "fldPct", label: "FLD%" }, { key: "oaa", label: "OAA" },
    { key: "putouts", label: "PO" }, { key: "assists", label: "A" }, { key: "totalChances", label: "TC" },
  ];

  if (!leaders.length) return <p className="text-sm text-muted-foreground text-center py-8">No fielding stats accumulated yet.</p>;

  return (
    <div className="space-y-3" data-testid="section-career-fielding">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          {sortButtons.map(b => (
            <RetroButton key={b.key} variant={sort === b.key ? "primary" : "outline"} size="sm"
              onClick={() => setSort(b.key)} data-testid={`fielding-sort-${b.key}`}>
              {b.label}
            </RetroButton>
          ))}
        </div>
        {posOptions.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Position:</span>
            {posOptions.map(p => (
              <RetroButton key={p} variant={posFilter === p ? "primary" : "outline"} size="sm"
                onClick={() => setPosFilter(p)} data-testid={`fielding-pos-${p}`}>
                {p}
              </RetroButton>
            ))}
          </div>
        )}
      </div>
      <RetroCard variant="bordered">
        <RetroCardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-career-fielding">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center w-8">#</th>
                  <th className="py-2 px-2 text-xs font-semibold text-gold">Player</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground">Team</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">Yrs</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">G</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">PO</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">A</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">E</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">TC</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">FLD%</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">OAA</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => (
                  <tr key={f.playerId} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    data-testid={`row-career-fielder-${i}`}>
                    <td className="py-2 px-2 text-center text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => f.playerId && onPlayerClick(f.playerId)}
                        className="text-left hover:text-gold transition-colors group"
                        data-testid={`link-fielder-${f.playerId}`}
                      >
                        <span className="text-xs font-medium group-hover:underline">{f.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">({f.position})</span>
                      </button>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <TeamDot color={f.teamColor} />
                        <span className="text-xs font-semibold">{f.teamAbbr}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center text-xs">{f.seasons}</td>
                    <td className="py-2 px-2 text-center text-xs">{f.games}</td>
                    <td className="py-2 px-2 text-center text-xs">{f.putouts}</td>
                    <td className="py-2 px-2 text-center text-xs">{f.assists}</td>
                    <td className="py-2 px-2 text-center text-xs text-red-400">{f.errors}</td>
                    <td className="py-2 px-2 text-center text-xs">{f.totalChances}</td>
                    <td className={`py-2 px-2 text-center text-xs font-bold ${sort === "fldPct" ? "text-gold" : ""}`}>{f.fldPct}</td>
                    <td className={`py-2 px-2 text-center text-xs font-medium ${sort === "oaa" ? "text-gold" : f.oaa > 0 ? "text-emerald-400" : f.oaa < 0 ? "text-red-400" : ""}`}>{f.oaa > 0 ? "+" : ""}{f.oaa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function TeamRecordsSection({ records, leagueId }: { records: TeamRecord[]; leagueId: string }) {
  if (!records.length) return <p className="text-sm text-muted-foreground text-center py-8">No team records yet.</p>;
  return (
    <div data-testid="section-team-records">
      <RetroCard variant="bordered">
        <RetroCardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-team-records">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-3 text-xs font-semibold text-gold">Team</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">W</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">L</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">Pct</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">Titles</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">PS App</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">5★ Recruits</th>
                  <th className="py-2 px-2 text-xs font-semibold text-muted-foreground text-center">Best W</th>
                </tr>
              </thead>
              <tbody>
                {records.map((t, i) => (
                  <tr key={t.teamId} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    data-testid={`row-team-record-${t.teamAbbr}`}>
                    <td className="py-2 px-3">
                      <Link href={`/league/${leagueId}/team/${t.teamId}/profile`}>
                        <div className="flex items-center gap-2 cursor-pointer hover:text-gold transition-colors">
                          <TeamDot color={t.teamColor} />
                          <div>
                            <div className="text-xs font-semibold">{t.teamAbbr}</div>
                            <div className="text-xs text-muted-foreground">{t.teamName}</div>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-2 px-2 text-center text-xs text-emerald-400 font-medium">{t.allTimeW}</td>
                    <td className="py-2 px-2 text-center text-xs text-red-400">{t.allTimeL}</td>
                    <td className="py-2 px-2 text-center text-xs font-medium text-gold">{t.pct}</td>
                    <td className="py-2 px-2 text-center">
                      {t.championships > 0 ? (
                        <span className="flex items-center justify-center gap-0.5">
                          <Trophy className="w-3 h-3 text-gold" />
                          <span className="text-xs font-bold text-gold">{t.championships}</span>
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-2 text-center text-xs">{t.postseasonApps > 0 ? t.postseasonApps : "—"}</td>
                    <td className="py-2 px-2 text-center text-xs font-medium text-orange-400">{t.allTimeFiveStars > 0 ? t.allTimeFiveStars : "—"}</td>
                    <td className="py-2 px-2 text-center text-xs">{t.bestSeasonW}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function CoachHoFSection({ coaches, leagueId }: { coaches: CoachStat[]; leagueId: string }) {
  if (!coaches.length) return <p className="text-sm text-muted-foreground text-center py-8">No coaches in the dynasty.</p>;
  return (
    <div className="space-y-3" data-testid="section-coach-hof">
      {coaches.map((c, i) => (
        <RetroCard key={c.coachId} variant="bordered">
          <RetroCardContent className="py-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: c.teamColor + "33", border: `1px solid ${c.teamColor}66` }}>
                <span className="text-xs font-semibold" style={{ color: c.teamColor }}>#{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/league/${leagueId}/coach/${c.coachId}`}>
                    <span className="text-sm font-semibold hover:text-gold transition-colors cursor-pointer">{c.name}</span>
                  </Link>
                  <Badge variant="outline" className="text-xs font-semibold px-1.5">{c.archetype}</Badge>
                  {c.championships > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-gold bg-gold/10 border border-gold/30 rounded px-1.5 py-0.5">
                      <Trophy className="w-2.5 h-2.5" />
                      {c.championships}x Champion
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <TeamDot color={c.teamColor} />
                  <span className="text-xs text-muted-foreground">{c.teamName || "No team"}</span>
                </div>
                {c.teamsCoached.length > 1 && (
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    <span className="text-xs font-semibold text-muted-foreground">COACHED:</span>
                    {c.teamsCoached.map((t, ti) => (
                      <span key={ti} className="text-xs text-muted-foreground">{t}{ti < c.teamsCoached.length - 1 ? " →" : ""}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-muted-foreground">Record</div>
                    <div className="text-xs font-medium">{c.w}-{c.l} <span className="text-muted-foreground">({c.pct})</span></div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-muted-foreground">Seasons</div>
                    <div className="text-xs font-medium">{c.seasons}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-muted-foreground">Conf Titles</div>
                    <div className="text-xs font-medium">{c.confChampionships}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-muted-foreground">CWS App</div>
                    <div className="text-xs font-medium">{c.cwsAppearances}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-muted-foreground">Legacy</div>
                    <div className="text-xs font-bold text-gold">{c.legacyScore}</div>
                  </div>
                </div>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
      ))}
    </div>
  );
}

function RecruitingHistorySection({ history }: { history: RecruitingSeason[] }) {
  const [expanded, setExpanded] = useState<number | null>(history[0]?.season ?? null);
  type RecSort = "rank" | "grade" | "fiveStars" | "fourStars" | "totalCommits";
  const [recSort, setRecSort] = useState<RecSort>("rank");
  const [recSortDir, setRecSortDir] = useState<"asc" | "desc">("asc");

  const handleRecSort = (key: RecSort) => {
    if (recSort === key) setRecSortDir(d => d === "asc" ? "desc" : "asc");
    else { setRecSort(key); setRecSortDir(key === "rank" ? "asc" : "desc"); }
  };

  if (!history.length) return <p className="text-sm text-muted-foreground text-center py-8">No recruiting history yet.</p>;

  return (
    <div className="space-y-3" data-testid="section-recruiting-history">
      {history.map(h => (
        <RetroCard key={h.season} variant="bordered">
          <button
            className="w-full text-left"
            onClick={() => setExpanded(expanded === h.season ? null : h.season)}
            data-testid={`recruiting-season-${h.season}`}
          >
            <RetroCardContent className="py-3">
              <div className="flex items-center gap-3">
                <Target className="w-4 h-4 text-gold flex-shrink-0" />
                <span className="text-gold text-xs">Season {h.season}</span>
                <div className="flex items-center gap-1.5 flex-wrap ml-2">
                  {h.snapshots.slice(0, 4).map(s => (
                    <span key={s.teamId} className={`text-xs font-semibold border rounded px-1 py-0.5 ${gradeColor(s.grade)}`}>
                      {s.teamAbbr}: {s.grade}
                    </span>
                  ))}
                  {h.snapshots.length > 4 && (
                    <span className="text-xs text-muted-foreground">+{h.snapshots.length - 4} more</span>
                  )}
                </div>
                <div className="ml-auto">
                  {expanded === h.season ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
              </div>
            </RetroCardContent>
          </button>

          {expanded === h.season && (() => {
            const gradeOrder = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"];
            const sortedSnaps = [...h.snapshots].sort((a, b) => {
              let cmp = 0;
              if (recSort === "rank") cmp = 0;
              else if (recSort === "grade") cmp = gradeOrder.indexOf(a.grade ?? "F") - gradeOrder.indexOf(b.grade ?? "F");
              else if (recSort === "fiveStars") cmp = b.fiveStars - a.fiveStars;
              else if (recSort === "fourStars") cmp = b.fourStars - a.fourStars;
              else if (recSort === "totalCommits") cmp = b.totalCommits - a.totalCommits;
              return recSortDir === "asc" ? cmp : -cmp;
            });
            const SortTh = ({ label, col }: { label: string; col: RecSort }) => (
              <th className="py-1.5 px-2 text-xs font-semibold text-muted-foreground text-center cursor-pointer hover:text-gold select-none"
                onClick={() => handleRecSort(col)}
                data-testid={`recruiting-sort-${col}`}>
                {label}{recSort === col ? (recSortDir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            );
            return (
              <div className="border-t border-border/50 px-3 pb-3 pt-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid={`table-recruiting-${h.season}`}>
                    <thead>
                      <tr className="border-b border-border/50 text-left">
                        <SortTh label="#" col="rank" />
                        <th className="py-1.5 px-2 text-xs font-semibold text-gold">Team</th>
                        <SortTh label="Grade" col="grade" />
                        <SortTh label="Commits" col="totalCommits" />
                        <SortTh label="5★" col="fiveStars" />
                        <SortTh label="4★" col="fourStars" />
                        <th className="py-1.5 px-2 text-xs font-semibold text-muted-foreground">Top Recruit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSnaps.map((s, i) => (
                        <React.Fragment key={s.teamId}>
                          {/* row + optional signed class below */}
                          <tr className={`border-b border-border/20 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                            data-testid={`recruiting-row-${s.teamAbbr}`}>
                            <td className="py-1.5 px-2 text-center text-xs text-muted-foreground">{i + 1}</td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center gap-1.5">
                                <TeamDot color={s.teamColor} />
                                <span className="text-xs font-semibold">{s.teamAbbr}</span>
                              </div>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <span className={`text-xs font-semibold border rounded px-1 py-0.5 ${gradeColor(s.grade)}`}>{s.grade}</span>
                            </td>
                            <td className="py-1.5 px-2 text-center text-xs">{s.totalCommits}</td>
                            <td className="py-1.5 px-2 text-center text-xs text-orange-400">{s.fiveStars}</td>
                            <td className="py-1.5 px-2 text-center text-xs text-yellow-400">{s.fourStars}</td>
                            <td className="py-1.5 px-2">
                              {s.topRecruitName ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs">{s.topRecruitName}</span>
                                  {s.topRecruitStars && <StarBadge stars={s.topRecruitStars} />}
                                </div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                          </tr>
                          {s.signedPlayers.length > 0 && (
                            <tr className="bg-muted/5 border-b border-border/10">
                              <td colSpan={7} className="px-3 pb-2 pt-0">
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {s.signedPlayers.map((p, pi) => (
                                    <span key={pi} className="text-xs bg-background/60 border border-border/40 rounded px-1.5 py-0.5">
                                      <span className="text-muted-foreground mr-0.5">{p.position}</span>
                                      {p.name}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </RetroCard>
      ))}
    </div>
  );
}

function HallOfFameSection({ players }: { players: HoFPlayer[] }) {
  if (!players.length) {
    return (
      <div className="text-center py-12">
        <Star className="w-10 h-10 text-gold/40 mx-auto mb-3" />
        <p className="text-gold text-xs mb-2">Hall of Fame Empty</p>
        <p className="text-sm text-muted-foreground">Players with OVR 400+ who graduate or get drafted will be inducted.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="section-hof">
      {players.map(p => {
        const isDrafted = p.departureType === "drafted" || p.departureType === "declared";
        const is5Star = p.starRating >= 5;
        return (
          <RetroCard key={p.id} variant="bordered"
            className={`${is5Star ? "ring-1 ring-gold/40" : ""}`}
            data-testid={`hof-card-${p.id}`}>
            <RetroCardContent className="py-3">
              <div className="flex items-start gap-2">
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: p.teamColor + "33", border: `2px solid ${p.teamColor}88` }}>
                    <span className="text-xs font-semibold font-bold" style={{ color: p.teamColor }}>
                      {p.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 bg-card border border-border/60 rounded px-0.5 py-px">
                    <span className="text-xs font-semibold" style={{ color: p.teamColor }}>{p.position}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold truncate">{p.name}</span>
                    {is5Star && <Star className="w-3 h-3 text-gold fill-gold flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <TeamDot color={p.teamColor} />
                    <span className="text-xs text-muted-foreground">{p.teamName}</span>
                    {isDrafted && p.draftRound && (
                      <span className="text-xs bg-gold/10 text-gold border border-gold/30 rounded px-1 py-0.5">
                        Rd {p.draftRound}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    <div className="text-center bg-background/50 rounded p-1 border border-border/40">
                      <div className="text-xs font-semibold text-muted-foreground">OVR</div>
                      <div className="text-xs font-bold text-gold">{p.overall}</div>
                    </div>
                    <div className="text-center bg-background/50 rounded p-1 border border-border/40">
                      <div className="text-xs font-semibold text-muted-foreground">WAR</div>
                      <div className="text-xs font-bold text-emerald-400">{p.careerWar}</div>
                    </div>
                    <div className="text-center bg-background/50 rounded p-1 border border-border/40">
                      <div className="text-xs font-semibold text-muted-foreground">Yrs</div>
                      <div className="text-xs font-bold">{p.seasonsPlayed}</div>
                    </div>
                    <div className="text-center bg-background/50 rounded p-1 border border-border/40">
                      <div className="text-xs font-semibold text-muted-foreground">Legacy</div>
                      <div className="text-xs font-bold text-gold">{p.legacyScore}</div>
                    </div>
                  </div>
                  {p.bestSeasonStat && (
                    <p className="text-xs text-muted-foreground mt-1.5 truncate">Best: {p.bestSeasonStat}</p>
                  )}
                </div>
              </div>
            </RetroCardContent>
          </RetroCard>
        );
      })}
    </div>
  );
}

export default function RecordBookPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [activeSection, setActiveSection] = useState<ActiveSection>("seasons");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<RecordBookData>({
    queryKey: ["/api/leagues", leagueId, "record-book"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/record-book`, { credentials: "include" }).then(r => r.json()),
    enabled: !!leagueId,
  });

  const { data: selectedPlayerData } = useQuery<any>({
    queryKey: ["/api/leagues", leagueId, "players", selectedPlayerId],
    queryFn: () => fetch(`/api/leagues/${leagueId}/players/${selectedPlayerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!leagueId && !!selectedPlayerId,
  });

  const navItems: { key: ActiveSection; label: string; icon: React.ReactNode }[] = [
    { key: "seasons", label: "Season History", icon: <Trophy className="w-4 h-4" /> },
    { key: "batting", label: "Career Batting", icon: <BarChart2 className="w-4 h-4" /> },
    { key: "pitching", label: "Career Pitching", icon: <TrendingUp className="w-4 h-4" /> },
    { key: "fielding", label: "Career Fielding", icon: <Target className="w-4 h-4" /> },
    { key: "teams", label: "Team Records", icon: <Users className="w-4 h-4" /> },
    { key: "coaches", label: "Coach HOF", icon: <Award className="w-4 h-4" /> },
    { key: "recruiting", label: "Recruiting", icon: <BookOpen className="w-4 h-4" /> },
    { key: "hof", label: "Hall of Fame", icon: <Star className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/60 bg-card/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/league/${leagueId}`}>
              <RetroButton variant="outline" size="sm" className="gap-1" data-testid="button-back-league">
                <ArrowLeft className="w-3.5 h-3.5" />
                League
              </RetroButton>
            </Link>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-gold" />
              <h1 className="text-gold text-xs sm:text-[13px]">RECORD BOOK</h1>
            </div>
            {data?.meta && (
              <span className="text-xs text-muted-foreground ml-auto">
                {data.meta.totalSeasons} season{data.meta.totalSeasons !== 1 ? "s" : ""} recorded
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4">
        {/* Section Nav */}
        <div className="flex gap-1.5 flex-wrap mb-6 pb-4 border-b border-border/40">
          {navItems.map(item => (
            <RetroButton
              key={item.key}
              variant={activeSection === item.key ? "primary" : "outline"}
              size="sm"
              onClick={() => setActiveSection(item.key)}
              className="gap-1.5 text-xs sm:text-xs"
              data-testid={`section-nav-${item.key}`}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{item.label.split(" ")[0]}</span>
            </RetroButton>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 bg-card" />
            <Skeleton className="h-32 bg-card" />
            <Skeleton className="h-32 bg-card" />
            <Skeleton className="h-32 bg-card" />
          </div>
        )}

        {/* Sections */}
        {data && !isLoading && (
          <>
            {activeSection === "seasons" && (
              <>
                <SectionHeader icon={<Trophy className="w-5 h-5" />} title="SEASON HISTORY"
                  subtitle="Year-by-year champions, stat leaders, and recruiting class grades" />
                <SeasonHistorySection seasons={data.seasons} leagueId={leagueId!} />
              </>
            )}

            {activeSection === "batting" && (
              <>
                <SectionHeader icon={<BarChart2 className="w-5 h-5" />} title="CAREER BATTING LEADERS"
                  subtitle="All-time top 25 hitters — min 30 career at-bats. Click a name to view profile." />
                <CareerBattingSection leaders={data.careerBattingLeaders} leagueId={leagueId!} onPlayerClick={setSelectedPlayerId} />
              </>
            )}

            {activeSection === "pitching" && (
              <>
                <SectionHeader icon={<TrendingUp className="w-5 h-5" />} title="CAREER PITCHING LEADERS"
                  subtitle="All-time top 25 arms — min 3 career innings. Click a name to view profile." />
                <CareerPitchingSection leaders={data.careerPitchingLeaders} leagueId={leagueId!} onPlayerClick={setSelectedPlayerId} />
              </>
            )}

            {activeSection === "fielding" && (
              <>
                <SectionHeader icon={<Target className="w-5 h-5" />} title="CAREER FIELDING LEADERS"
                  subtitle="All-time top defenders — min 10 career chances. Sort by FLD%, OAA, putouts, or assists." />
                <CareerFieldingSection leaders={data.careerFieldingLeaders ?? []} onPlayerClick={setSelectedPlayerId} />
              </>
            )}

            {activeSection === "teams" && (
              <>
                <SectionHeader icon={<Users className="w-5 h-5" />} title="ALL-TIME TEAM RECORDS"
                  subtitle="Franchise records across all seasons" />
                <TeamRecordsSection records={data.teamRecords} leagueId={leagueId!} />
              </>
            )}

            {activeSection === "coaches" && (
              <>
                <SectionHeader icon={<Award className="w-5 h-5" />} title="COACH LEGACY RANKINGS"
                  subtitle="All coaches ranked by legacy score" />
                <CoachHoFSection coaches={data.coachStats} leagueId={leagueId!} />
              </>
            )}

            {activeSection === "recruiting" && (
              <>
                <SectionHeader icon={<Target className="w-5 h-5" />} title="RECRUITING HISTORY"
                  subtitle="Season-by-season class grades and top commits" />
                <RecruitingHistorySection history={data.recruitingHistory} />
              </>
            )}

            {activeSection === "hof" && (
              <>
                <SectionHeader icon={<Star className="w-5 h-5" />} title="HALL OF FAME"
                  subtitle="Graduated and drafted players with OVR 400+" />
                <HallOfFameSection players={data.hallOfFame} />
              </>
            )}
          </>
        )}

        {/* Empty state — no seasons yet */}
        {data && !isLoading && data.meta.totalSeasons === 0 && (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gold/40 mx-auto mb-4" />
            <p className="text-gold text-xs mb-2">Record Book is Empty</p>
            <p className="text-sm text-muted-foreground">
              Complete your first season to start building the dynasty almanac.
            </p>
            <Link href={`/league/${leagueId}`}>
              <RetroButton variant="outline" size="sm" className="mt-4" data-testid="button-go-to-league">
                Back to League
              </RetroButton>
            </Link>
          </div>
        )}
      </div>

      {selectedPlayerData && (
        <PlayerProfileCard
          player={selectedPlayerData}
          open={!!selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          leagueId={leagueId}
        />
      )}
    </div>
  );
}
