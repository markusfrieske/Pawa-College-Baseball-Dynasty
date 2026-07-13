/**
 * Hub Panels — extra cockpit widgets for the League Hub
 * - LeagueTickerBanner: scrolling marquee of real league events
 * - StatsLeadersPanel: top batters/pitchers by season stats
 * - PowerRankingsWidget: power ranking table with OVR-based grades
 * - TopProspectsWidget: top players by OVR as draft prospects
 * - LeagueNewsPanel: commissioner blog posts + post form
 * - MergedRosterPanel: Roster Depth + Roster Strength combined
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Newspaper, TrendingUp, BarChart2, Users, Star, Trash2,
  PlusCircle, Image, ChevronRight, Activity, Swords, Zap,
  Globe, Radio, Target,
} from "lucide-react";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { apiRequest } from "@/lib/queryClient";
import type { Player, LeagueEvent } from "@shared/schema";
import type { DashboardOverview, LeagueDetails, ReadyStatusData, StorylineWidgetItem } from "./types";
import { STAR_COLORS, STAR_TEXT_COLORS, formatRelativeTime } from "./helpers";

// ─── Helpers ────────────────────────────────────────────────────────────────

function pctGrade(pct: number): { grade: string; color: string } {
  if (pct >= 90) return { grade: "A+", color: "text-emerald-400" };
  if (pct >= 80) return { grade: "A",  color: "text-emerald-400" };
  if (pct >= 70) return { grade: "A-", color: "text-green-400" };
  if (pct >= 60) return { grade: "B+", color: "text-sky-400" };
  if (pct >= 50) return { grade: "B",  color: "text-sky-400" };
  if (pct >= 40) return { grade: "B-", color: "text-blue-400" };
  if (pct >= 30) return { grade: "C+", color: "text-yellow-400" };
  if (pct >= 20) return { grade: "C",  color: "text-yellow-400" };
  if (pct >= 10) return { grade: "C-", color: "text-amber-400" };
  return { grade: "D", color: "text-red-400" };
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── League Ticker Banner ────────────────────────────────────────────────────

interface TickerEvent { id: string; description: string; eventType: string; }
interface TickerResp { events: TickerEvent[]; }

const TICKER_TAG: Record<string, { tag: string; color: string }> = {
  GAME_RESULT:       { tag: "FINAL",       color: "text-green-400" },
  RIVALRY_RESULT:    { tag: "RIVALRY",     color: "text-amber-400" },
  SIGNING:           { tag: "COMMITMENT",  color: "text-blue-400" },
  TRANSFER:          { tag: "TRANSFER",    color: "text-cyan-400" },
  DRAFT:             { tag: "DRAFT",       color: "text-purple-400" },
  AWARD:             { tag: "AWARD",       color: "text-amber-400" },
  PHASE_CHANGE:      { tag: "ADVANCE",     color: "text-gold" },
  ROSTER_CUT:        { tag: "CUT",         color: "text-red-400" },
  WALKON:            { tag: "WALK-ON",     color: "text-emerald-400" },
  STORYLINE:         { tag: "STORYLINE",   color: "text-purple-400" },
  STORYLINE_ABILITY: { tag: "STORYLINE",   color: "text-purple-400" },
};

export function LeagueTickerBanner({ leagueId }: { leagueId: string }) {
  const { data } = useQuery<TickerResp>({
    queryKey: ["/api/leagues", leagueId, "ticker"],
    staleTime: 60000,
  });

  const events = (data?.events ?? []).slice(0, 20);
  if (events.length === 0) return null;

  const items = [...events, ...events];

  return (
    <div
      className="border-y border-border bg-card/30 py-2.5 overflow-hidden"
      data-testid="league-ticker-banner"
    >
      <style>{`
        @keyframes hub-ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .hub-ticker-track { animation: hub-ticker 60s linear infinite; display: flex; width: max-content; }
        .hub-ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="hub-ticker-track whitespace-nowrap">
        {items.map((e, i) => {
          const cfg = TICKER_TAG[e.eventType] ?? { tag: "NEWS", color: "text-muted-foreground" };
          return (
            <span key={i} className="flex items-center gap-3 px-6 whitespace-nowrap">
              <span className={`font-pixel text-[8px] tracking-widest ${cfg.color}`}>{cfg.tag}</span>
              <span className="text-[11px] text-muted-foreground/70">{e.description}</span>
              <span className="text-gold/20">◆</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stats Leaders Panel ─────────────────────────────────────────────────────

interface BattingLeader {
  name: string; teamAbbr: string; teamColor: string;
  avg: string; hr: number; rbi: number; ops: string;
}
interface PitchingLeader {
  name: string; teamAbbr: string; teamColor: string;
  era: string; so: number; wins: number; whip: string;
}
interface StatsData { battingLeaders: BattingLeader[]; pitchingLeaders: PitchingLeader[]; totalGames: number; }

export function StatsLeadersPanel({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<StatsData>({
    queryKey: ["/api/leagues", leagueId, "stats"],
    staleTime: 120000,
  });

  const batters = (data?.battingLeaders ?? []).slice(0, 5);
  const pitchers = (data?.pitchingLeaders ?? [])
    .filter(p => parseFloat(p.era) < 99)
    .sort((a, b) => parseFloat(a.era) - parseFloat(b.era))
    .slice(0, 5);
  const noGames = !isLoading && (data?.totalGames ?? 0) === 0;

  return (
    <RetroCard data-testid="panel-stats-leaders">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px]">STAT LEADERS</h3>
          </div>
          <Link href={`/league/${leagueId}/stats`}>
            <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer">Full Stats →</span>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {isLoading ? (
          <div className="space-y-1.5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
        ) : noGames ? (
          <p className="text-[10px] text-muted-foreground text-center py-4">Stats update after games are played</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="font-pixel text-[7px] text-sky-400 mb-1.5">BATTING AVG</p>
              <div className="space-y-1">
                {batters.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs" data-testid={`stat-batter-${i}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-pixel text-[7px] text-muted-foreground/60 w-3 shrink-0">{i + 1}</span>
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-pixel shrink-0"
                        style={{ backgroundColor: `#${b.teamColor ?? "4a4a4a"}22`, color: `#${b.teamColor ?? "C4A35A"}`, border: `1px solid #${b.teamColor ?? "4a4a4a"}44` }}
                      >{b.teamAbbr?.slice(0, 2) ?? "—"}</span>
                      <span className="truncate text-foreground/80">{b.name}</span>
                    </div>
                    <span className="text-gold font-bold shrink-0 ml-1">{b.avg}</span>
                  </div>
                ))}
              </div>
              <p className="font-pixel text-[7px] text-purple-400 mb-1.5 mt-3">ERA</p>
              <div className="space-y-1">
                {pitchers.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs" data-testid={`stat-pitcher-${i}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-pixel text-[7px] text-muted-foreground/60 w-3 shrink-0">{i + 1}</span>
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-pixel shrink-0"
                        style={{ backgroundColor: `#${p.teamColor ?? "4a4a4a"}22`, color: `#${p.teamColor ?? "C4A35A"}`, border: `1px solid #${p.teamColor ?? "4a4a4a"}44` }}
                      >{p.teamAbbr?.slice(0, 2) ?? "—"}</span>
                      <span className="truncate text-foreground/80">{p.name}</span>
                    </div>
                    <span className="text-purple-400 font-bold shrink-0 ml-1">{p.era}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-pixel text-[7px] text-amber-400 mb-1.5">HOME RUNS</p>
              <div className="space-y-1">
                {[...batters].sort((a, b) => b.hr - a.hr).map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-pixel text-[7px] text-muted-foreground/60 w-3 shrink-0">{i + 1}</span>
                      <span className="truncate text-foreground/80">{b.name}</span>
                    </div>
                    <span className="text-amber-400 font-bold shrink-0 ml-1">{b.hr}</span>
                  </div>
                ))}
              </div>
              <p className="font-pixel text-[7px] text-emerald-400 mb-1.5 mt-3">STRIKEOUTS</p>
              <div className="space-y-1">
                {[...pitchers].sort((a, b) => b.so - a.so).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-pixel text-[7px] text-muted-foreground/60 w-3 shrink-0">{i + 1}</span>
                      <span className="truncate text-foreground/80">{p.name}</span>
                    </div>
                    <span className="text-emerald-400 font-bold shrink-0 ml-1">{p.so}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Power Rankings Widget ───────────────────────────────────────────────────

interface RankEntry {
  rank: number; rankDelta: number; teamId: string; teamName: string;
  abbreviation: string; primaryColor: string; avgOvr: number;
  ovrPercentile: number; hitterPercentile: number; pitcherPercentile: number;
}
interface RankingsResp { rankings: RankEntry[]; userTeamId: string; }

// ─── National Pulse Panel ────────────────────────────────────────────────────

interface BubbleTeam {
  rank: number;
  teamId: string;
  teamName: string;
  abbreviation: string;
  primaryColor: string;
  avgOvr: number;
  ovrPercentile: number;
}

export function NationalPulsePanel({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<RankingsResp>({
    queryKey: ["/api/leagues", leagueId, "power-rankings"],
    staleTime: 120000,
  });

  const { data: tickerData } = useQuery<{ events: TickerEvent[] }>({
    queryKey: ["/api/leagues", leagueId, "ticker"],
    staleTime: 60000,
  });

  const top25 = (data?.rankings ?? []).slice(0, 25);
  const userTeamId = data?.userTeamId;

  const bubbleTeams: BubbleTeam[] = (data?.rankings ?? [])
    .slice(5, 12)
    .filter(r => r.ovrPercentile >= 40);

  const notableEvents = (tickerData?.events ?? [])
    .filter(e => ["GAME_RESULT", "RIVALRY_RESULT", "AWARD", "DRAFT"].includes(e.eventType))
    .slice(0, 5);

  return (
    <RetroCard data-testid="panel-national-pulse">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px]">NATIONAL PULSE</h3>
          </div>
          <Link href={`/league/${leagueId}?tab=rankings`}>
            <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer">Full →</span>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Top 25 */}
          <div className="md:col-span-2">
            <p className="font-pixel text-[7px] text-gold/70 uppercase tracking-wider mb-2">Top 25</p>
            {isLoading ? (
              <div className="space-y-1">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
            ) : (
              <div className="space-y-0.5 max-h-[400px] overflow-y-auto scrollbar-hide" data-testid="list-top25">
                {top25.map(r => {
                  const { grade, color } = pctGrade(r.ovrPercentile);
                  const isUser = r.teamId === userTeamId;
                  const delta = r.rankDelta ?? 0;
                  return (
                    <Link key={r.teamId} href={`/league/${leagueId}/team/${r.teamId}`}>
                      <div
                        className={`flex items-center gap-1.5 py-0.5 px-1.5 rounded text-xs cursor-pointer transition-colors ${isUser ? "bg-gold/10 border border-gold/20 hover:bg-gold/15" : "hover:bg-card/80"}`}
                        data-testid={`pulse-rank-${r.rank}`}
                      >
                        <span className="font-pixel text-[8px] text-muted-foreground w-5 text-right shrink-0">{r.rank}</span>
                        {delta !== 0 && (
                          <span className={`font-pixel text-[7px] shrink-0 ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {delta > 0 ? "▲" : "▼"}
                          </span>
                        )}
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center font-pixel text-[6px] shrink-0"
                          style={{ backgroundColor: `#${r.primaryColor ?? "4a4a4a"}33`, color: `#${r.primaryColor ?? "C4A35A"}`, border: `1px solid #${r.primaryColor ?? "4a4a4a"}55` }}
                        >{r.abbreviation?.slice(0, 3) ?? "—"}</span>
                        <span className={`flex-1 truncate text-[11px] ${isUser ? "text-gold font-medium" : "text-foreground/80"}`}>{r.teamName}</span>
                        <span className="text-muted-foreground text-[10px] shrink-0">{Math.round(r.avgOvr)}</span>
                        <span className={`font-pixel text-[8px] ${color} w-5 text-right shrink-0`}>{grade}</span>
                      </div>
                    </Link>
                  );
                })}
                {top25.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">Rankings update after the season starts</p>
                )}
              </div>
            )}
          </div>

          {/* Right rail: Notable events + Bubble */}
          <div className="space-y-4">
            {notableEvents.length > 0 && (
              <div>
                <p className="font-pixel text-[7px] text-sky-400/70 uppercase tracking-wider mb-2">
                  <Radio className="w-2.5 h-2.5 inline mr-1" />Notable
                </p>
                <div className="space-y-2">
                  {notableEvents.map((e, i) => {
                    const cfg = TICKER_TAG[e.eventType] ?? { tag: "NEWS", color: "text-muted-foreground" };
                    return (
                      <div key={i} className="space-y-0.5">
                        <span className={`font-pixel text-[7px] ${cfg.color}`}>{cfg.tag}</span>
                        <p className="text-[10px] text-foreground/70 leading-snug line-clamp-2">{e.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {bubbleTeams.length > 0 && (
              <div>
                <p className="font-pixel text-[7px] text-amber-400/70 uppercase tracking-wider mb-2">
                  <Target className="w-2.5 h-2.5 inline mr-1" />Bubble
                </p>
                <div className="space-y-1">
                  {bubbleTeams.map(r => {
                    const isUser = r.teamId === userTeamId;
                    return (
                      <Link key={r.teamId} href={`/league/${leagueId}/team/${r.teamId}`}>
                        <div className={`flex items-center gap-1.5 py-0.5 px-1 rounded text-xs cursor-pointer ${isUser ? "text-gold" : "text-foreground/70 hover:text-foreground"}`} data-testid={`bubble-row-${r.teamId}`}>
                          <span className="font-pixel text-[8px] text-muted-foreground w-4 text-right shrink-0">#{r.rank}</span>
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center font-pixel text-[6px] shrink-0"
                            style={{ backgroundColor: `#${r.primaryColor ?? "4a4a4a"}33`, color: `#${r.primaryColor ?? "C4A35A"}` }}
                          >{r.abbreviation?.slice(0, 2) ?? "—"}</span>
                          <span className="flex-1 truncate text-[10px]">{r.teamName}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                <p className="text-[9px] text-muted-foreground/60 mt-1">At-large contenders</p>
              </div>
            )}
          </div>

        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

export function PowerRankingsWidget({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<RankingsResp>({
    queryKey: ["/api/leagues", leagueId, "power-rankings"],
    staleTime: 120000,
  });

  const rankings = (data?.rankings ?? []).slice(0, 10);

  return (
    <RetroCard data-testid="panel-power-rankings">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px]">POWER RANKINGS</h3>
          </div>
          <Link href={`/league/${leagueId}?tab=rankings`}>
            <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer">Full →</span>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {isLoading ? (
          <div className="space-y-1.5">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : (
          <div className="space-y-1" data-testid="list-power-rankings">
            {rankings.map(r => {
              const { grade, color } = pctGrade(r.ovrPercentile);
              const isUser = r.teamId === data?.userTeamId;
              const delta = r.rankDelta ?? 0;
              return (
                <Link key={r.teamId} href={`/league/${leagueId}/team/${r.teamId}`}>
                  <div
                    className={`flex items-center gap-2 py-1 px-1.5 rounded text-xs cursor-pointer transition-colors ${isUser ? "bg-gold/10 border border-gold/20 hover:bg-gold/15" : "hover:bg-card/80 hover:border hover:border-border/60"}`}
                    data-testid={`rank-row-${r.teamId}`}
                  >
                    <span className="font-pixel text-[8px] text-muted-foreground w-4 text-right shrink-0">{r.rank}</span>
                    {delta !== 0 && (
                      <span className={`font-pixel text-[7px] shrink-0 ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {delta > 0 ? "▲" : "▼"}
                      </span>
                    )}
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center font-pixel text-[7px] shrink-0"
                      style={{ backgroundColor: `#${r.primaryColor ?? "4a4a4a"}33`, color: `#${r.primaryColor ?? "C4A35A"}`, border: `1px solid #${r.primaryColor ?? "4a4a4a"}55` }}
                    >{r.abbreviation?.slice(0, 3) ?? "—"}</span>
                    <span className={`flex-1 truncate ${isUser ? "text-gold font-medium" : "text-foreground/80"}`}>{r.teamName}</span>
                    <span className="text-muted-foreground text-[10px] shrink-0">{Math.round(r.avgOvr)}</span>
                    <span className={`font-pixel text-[8px] ${color} w-5 text-right shrink-0`}>{grade}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Top Prospects Widget ────────────────────────────────────────────────────

interface ProspectRow {
  id: string; firstName: string; lastName: string; position: string;
  overall: number; eligibility: string; teamName: string; teamAbbreviation: string; teamPrimaryColor: string;
}
interface TopPlayersResp { hitters: ProspectRow[]; pitchers: ProspectRow[]; }

export function TopProspectsWidget({ leagueId }: { leagueId: string }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<TopPlayersResp>({
    queryKey: ["/api/leagues", leagueId, "top-players"],
    staleTime: 120000,
  });

  const { data: selectedPlayer } = useQuery<Player>({
    queryKey: ["/api/leagues", leagueId, "players", selectedPlayerId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/players/${selectedPlayerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!selectedPlayerId,
  });

  const hitters = (data?.hitters ?? []).slice(0, 8);
  const pitchers = (data?.pitchers ?? []).slice(0, 8);

  const allProspects = [...(data?.hitters ?? []), ...(data?.pitchers ?? [])];
  const selectedProspect = selectedPlayerId ? allProspects.find(p => p.id === selectedPlayerId) : null;

  const ProspectRow = ({ p, i, accentClass }: { p: ProspectRow; i: number; accentClass: string }) => (
    <button
      key={p.id}
      className="w-full flex items-center gap-1.5 text-xs py-0.5 px-1 rounded hover:bg-card/60 cursor-pointer transition-colors text-left"
      onClick={() => setSelectedPlayerId(p.id)}
      data-testid={`prospect-row-${p.id}`}
    >
      <span className="font-pixel text-[7px] text-muted-foreground/60 w-3 shrink-0">{i + 1}</span>
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center font-pixel text-[7px] shrink-0"
        style={{ backgroundColor: `#${p.teamPrimaryColor ?? "4a4a4a"}22`, color: `#${p.teamPrimaryColor ?? "C4A35A"}`, border: `1px solid #${p.teamPrimaryColor ?? "4a4a4a"}44` }}
      >{p.teamAbbreviation?.slice(0, 2) ?? "—"}</span>
      <span className="truncate text-foreground/80 flex-1">{p.firstName[0]}. {p.lastName}</span>
      <span className="text-[9px] text-muted-foreground shrink-0">{p.position}</span>
      <span className={`${accentClass} font-bold shrink-0 ml-1`}>{p.overall}</span>
    </button>
  );

  return (
    <>
      <RetroCard data-testid="panel-top-prospects">
        <RetroCardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-gold" />
              <h3 className="font-pixel text-gold text-[9px]">TOP MLB PROSPECTS</h3>
            </div>
            <Link href={`/league/${leagueId}?tab=prospects`}>
              <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer">Top 100 →</span>
            </Link>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {isLoading ? (
            <div className="space-y-1.5">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="font-pixel text-[7px] text-sky-400 mb-1.5">HITTERS</p>
                <div className="space-y-0.5">
                  {hitters.map((p, i) => (
                    <ProspectRow key={p.id} p={p} i={i} accentClass="text-gold" />
                  ))}
                </div>
              </div>
              <div>
                <p className="font-pixel text-[7px] text-purple-400 mb-1.5">PITCHERS</p>
                <div className="space-y-0.5">
                  {pitchers.map((p, i) => (
                    <ProspectRow key={p.id} p={p} i={i} accentClass="text-purple-400" />
                  ))}
                </div>
              </div>
            </div>
          )}
        </RetroCardContent>
      </RetroCard>

      {/* Player Profile Card Modal */}
      {selectedPlayerId && selectedPlayer && (
        <PlayerProfileCard
          player={selectedPlayer}
          open={true}
          leagueId={leagueId}
          teamPrimaryColor={selectedProspect?.teamPrimaryColor ?? undefined}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </>
  );
}

// ─── League News Panel ───────────────────────────────────────────────────────

interface NewsPost {
  id: string; title: string; subtitle?: string | null; content: string;
  imageUrl: string | null; createdAt: string; authorName?: string | null;
  authorId?: string | null;
}

function NewsPostCard({
  post, isCommissioner, currentUserId, leagueId, onDelete,
}: { post: NewsPost; isCommissioner: boolean; currentUserId?: string; leagueId: string; onDelete: () => void }) {
  const canDelete = isCommissioner || (!!currentUserId && post.authorId === currentUserId);
  return (
    <article className="border border-border/50 rounded-lg overflow-hidden bg-card/30" data-testid={`news-post-${post.id}`}>
      {post.imageUrl && (
        <div className="h-36 sm:h-48 overflow-hidden bg-background/40">
          <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-pixel text-gold text-[10px] leading-tight">{post.title}</h3>
          {canDelete && (
            <button
              onClick={onDelete}
              className="text-red-400/60 hover:text-red-400 transition-colors shrink-0"
              data-testid={`button-delete-post-${post.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {post.subtitle && (
          <p className="text-sm text-muted-foreground mb-2 font-medium">{post.subtitle}</p>
        )}
        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{post.content}</p>
        <div className="flex items-center gap-2 mt-3">
          {post.authorName && (
            <span className="text-[9px] font-pixel text-gold/70 border border-gold/20 rounded px-1.5 py-0.5">
              {post.authorName}
            </span>
          )}
          <p className="text-[10px] text-muted-foreground">{fmtDate(post.createdAt)}</p>
        </div>
      </div>
    </article>
  );
}

export function LeagueNewsPanel({
  leagueId, isCommissioner, myTeamId, currentUserId,
}: { leagueId: string; isCommissioner: boolean; myTeamId?: string; currentUserId?: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const canPost = isCommissioner || !!myTeamId;

  const { data, isLoading } = useQuery<NewsPost[]>({
    queryKey: ["/api/leagues", leagueId, "news"],
    staleTime: 30000,
  });

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    if (!file.type.startsWith("image/")) {
      setImageError("Only image files are accepted.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  const createMut = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (imageFile) {
        setImageUploading(true);
        try {
          const resp = await apiRequest("POST", "/api/uploads/request-url", {
            name: imageFile.name, size: imageFile.size, contentType: imageFile.type,
          });
          const { uploadURL, objectPath } = await resp.json();
          await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": imageFile.type }, body: imageFile });
          imageUrl = objectPath;
        } finally {
          setImageUploading(false);
        }
      }
      return apiRequest("POST", `/api/leagues/${leagueId}/news`, { title, body, imageUrl });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] });
      setTitle(""); setBody(""); setImageFile(null); setImagePreview(null);
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (postId: string) => apiRequest("DELETE", `/api/leagues/${leagueId}/news/${postId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] }),
  });

  const posts = data ?? [];

  return (
    <div data-testid="panel-league-news">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-gold" />
          <h2 className="font-pixel text-gold text-[10px]">LEAGUE NEWS</h2>
        </div>
        {canPost && (
          <RetroButton
            size="sm"
            variant="outline"
            onClick={() => setShowForm(v => !v)}
            data-testid="button-toggle-news-form"
          >
            <PlusCircle className="w-3.5 h-3.5 mr-1" />
            {showForm ? "Cancel" : "Post"}
          </RetroButton>
        )}
      </div>

      {/* Post form — open to all league members */}
      {showForm && canPost && (
        <RetroCard className="mb-6 border-gold/30" data-testid="form-news-post">
          <RetroCardHeader>
            <h3 className="font-pixel text-[9px] text-gold">NEW POST</h3>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-3">
              <div>
                <label className="font-pixel text-[8px] text-muted-foreground block mb-1">HEADLINE *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Post headline..."
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
                  data-testid="input-news-title"
                />
              </div>
              <div>
                <label className="font-pixel text-[8px] text-muted-foreground block mb-1">BODY *</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  maxLength={5000}
                  rows={5}
                  placeholder="Write your post..."
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50 resize-none"
                  data-testid="input-news-body"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-0.5">{body.length}/5000</p>
              </div>
              <div>
                <label className="font-pixel text-[8px] text-muted-foreground block mb-1 flex items-center gap-1">
                  <Image className="w-3 h-3" /> IMAGE (optional)
                </label>
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="h-28 w-full object-cover rounded border border-border/40" />
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null); }}
                      className="absolute top-1 right-1 bg-background/80 text-red-400 rounded p-0.5 hover:bg-background"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border/50 hover:border-gold/40 rounded px-3 py-2 transition-colors">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Choose image...</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} data-testid="input-news-image-file" />
                  </label>
                )}
                {imageError && (
                  <p className="text-xs text-red-400 mt-1" data-testid="text-image-error">{imageError}</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <RetroButton variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</RetroButton>
                <RetroButton
                  size="sm"
                  disabled={!title.trim() || !body.trim() || createMut.isPending || imageUploading}
                  onClick={() => createMut.mutate()}
                  data-testid="button-submit-news-post"
                >
                  {imageUploading ? "Uploading..." : createMut.isPending ? "Posting..." : "Publish Post"}
                </RetroButton>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : posts.length === 0 ? (
        <RetroCard className="text-center py-8" data-testid="news-empty-state">
          <Newspaper className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No posts yet</p>
          {canPost && (
            <p className="text-[10px] text-muted-foreground mt-1">Use the Post button above to share league news</p>
          )}
        </RetroCard>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <NewsPostCard
              key={post.id}
              post={post}
              isCommissioner={isCommissioner}
              currentUserId={currentUserId}
              leagueId={leagueId}
              onDelete={() => deleteMut.mutate(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Merged Roster Panel ─────────────────────────────────────────────────────

export function MergedRosterPanel({
  overview, leagueId,
}: { overview: DashboardOverview; leagueId: string }) {
  const eligOrder = ["FR", "SO", "JR", "SR"];
  const eligMap = overview.eligibility ?? {};
  const atRisk = overview.positionsAtRisk ?? [];
  const totalPlayers = overview.rosterSize;
  const maxStarCount = Math.max(...[1, 2, 3, 4, 5].map(s => overview.starDist?.[String(s)] || 0), 1);

  return (
    <RetroCard data-testid="panel-merged-roster">
      <RetroCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gold" />
            <h3 className="font-pixel text-gold text-[9px]">ROSTER</h3>
          </div>
          <Link href={`/league/${leagueId}/roster`}>
            <span className="text-[10px] text-muted-foreground hover:text-gold transition-colors cursor-pointer">Manage →</span>
          </Link>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {/* Depth row: size + eligibility */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-pixel text-[8px] text-muted-foreground">ROSTER</p>
            <p className="text-2xl font-bold leading-none">
              {overview.rosterSize}<span className="text-muted-foreground text-sm">/25</span>
            </p>
          </div>
          <div className="flex gap-3">
            {eligOrder.map(e => {
              const count = eligMap[e] ?? 0;
              if (count === 0) return null;
              return (
                <div key={e} className="text-center">
                  <p className="font-pixel text-[7px] text-muted-foreground">{e}</p>
                  <p className="font-bold text-sm leading-tight">{count}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Strength row: avg OVR + grades */}
        <div className="flex items-center gap-4 py-2 border-y border-border/40 mb-3">
          <div>
            <p className="font-pixel text-[7px] text-muted-foreground">AVG OVR</p>
            <p className="text-xl font-bold text-gold leading-none">{Math.round(overview.averageOverall)}</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {overview.hitGrade && (
              <span className="font-pixel text-[7px] px-1.5 py-1 rounded bg-sky-500/20 text-sky-300">H:{overview.hitGrade}</span>
            )}
            {overview.pitchGrade && (
              <span className="font-pixel text-[7px] px-1.5 py-1 rounded bg-purple-500/20 text-purple-300">P:{overview.pitchGrade}</span>
            )}
            {overview.fieldGrade && (
              <span className="font-pixel text-[7px] px-1.5 py-1 rounded bg-green-500/20 text-green-300">F:{overview.fieldGrade}</span>
            )}
          </div>
          <div className="ml-auto flex gap-3">
            <div className="text-center">
              <p className="font-pixel text-[7px] text-sky-400">HIT</p>
              <p className="text-sm font-bold text-sky-400">{overview.hitterAvg || "—"}</p>
            </div>
            <div className="text-center">
              <p className="font-pixel text-[7px] text-purple-400">PITCH</p>
              <p className="text-sm font-bold text-purple-400">{overview.pitcherAvg || "—"}</p>
            </div>
          </div>
        </div>

        {/* Star distribution (compact) */}
        <div className="space-y-1 mb-3" data-testid="chart-star-dist-merged">
          {[5, 4, 3, 2, 1].map(stars => {
            const count = overview.starDist?.[String(stars)] || 0;
            const pct = totalPlayers > 0 ? Math.round((count / totalPlayers) * 100) : 0;
            const barWidth = maxStarCount > 0 ? Math.round((count / maxStarCount) * 100) : 0;
            return (
              <div key={stars} className="flex items-center gap-2">
                <span className={`font-pixel text-[7px] w-5 shrink-0 ${STAR_TEXT_COLORS[stars]}`}>{stars}★</span>
                <div className="flex-1 bg-background/60 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full ${STAR_COLORS[stars]}`} style={{ width: `${barWidth}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground w-12 shrink-0 text-right">
                  {count} <span className="text-muted-foreground/60">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Thin positions */}
        {atRisk.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
            <span className="font-pixel text-[8px] text-red-400 self-center">THIN:</span>
            {atRisk.map(pos => (
              <span key={pos} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">{pos}</span>
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

// ─── Newsroom Panel (full-width dashboard module) ────────────────────────────

const PHASE_LABEL: Record<string, string> = {
  preseason:               "Preseason",
  spring_training:         "Spring Training",
  regular_season:          "Regular Season",
  conference_championship: "Conf. Championship",
  super_regionals:         "Super Regionals",
  cws:                     "College World Series",
  offseason:               "Offseason",
  recruiting:              "Recruiting",
  signing_day:             "Signing Day",
  offseason_walkons:       "Walk-On Phase",
};

const NR_EVENT_CHIP: Record<string, { label: string; cls: string }> = {
  GAME_RESULT:       { label: "FINAL",    cls: "text-green-400 bg-green-500/15 border-green-500/30" },
  RIVALRY_RESULT:    { label: "RIVALRY",  cls: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
  SIGNING:           { label: "COMMIT",   cls: "text-blue-400 bg-blue-500/15 border-blue-500/30" },
  TRANSFER:          { label: "TRANSFER", cls: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30" },
  DRAFT:             { label: "DRAFT",    cls: "text-purple-400 bg-purple-500/15 border-purple-500/30" },
  AWARD:             { label: "AWARD",    cls: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
  PHASE_CHANGE:      { label: "ADVANCE",  cls: "text-gold bg-gold/15 border-gold/30" },
  ROSTER_CUT:        { label: "CUT",      cls: "text-red-400 bg-red-500/15 border-red-500/30" },
  WALKON:            { label: "WALK-ON",  cls: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  STORYLINE:         { label: "VOTE",     cls: "text-amber-300 bg-amber-400/15 border-amber-400/30" },
  STORYLINE_ABILITY: { label: "STORY",    cls: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30" },
};

const NR_FILTERS = [
  { key: "ALL",                              label: "All" },
  { key: "SIGNING",                          label: "Commits" },
  { key: "GAME_RESULT,RIVALRY_RESULT",       label: "Games" },
  { key: "TRANSFER,DRAFT,ROSTER_CUT,WALKON", label: "Roster" },
  { key: "AWARD,PHASE_CHANGE",               label: "League" },
  { key: "STORYLINE,STORYLINE_ABILITY",      label: "Storylines" },
] as const;
type NrFilterKey = (typeof NR_FILTERS)[number]["key"];

export function NewsroomPanel({
  leagueId, isCommissioner, myTeamId, phase, currentUserId,
}: { leagueId: string; isCommissioner: boolean; myTeamId?: string; phase?: string; currentUserId?: string }) {
  const [tab, setTab] = useState("posts");
  const [showPostForm, setShowPostForm] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [postImageUploading, setPostImageUploading] = useState(false);
  const [postImageError, setPostImageError] = useState<string | null>(null);
  const [actFilter, setActFilter] = useState<NrFilterKey>("ALL");
  const qc = useQueryClient();

  const canPost = isCommissioner || !!myTeamId;

  const { data: newsData, isLoading: newsLoading } = useQuery<NewsPost[]>({
    queryKey: ["/api/leagues", leagueId, "news"],
    staleTime: 30000,
  });

  function handlePostImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPostImageError(null);
    if (!file.type.startsWith("image/")) {
      setPostImageError("Only image files are accepted.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPostImageError("Image must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }
    setPostImageFile(file);
    setPostImagePreview(URL.createObjectURL(file));
  }
  const { data: rawEvents = [], isLoading: eventsLoading } = useQuery<LeagueEvent[]>({
    queryKey: ["/api/leagues", leagueId, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/events`, { credentials: "include" });
      return res.json();
    },
    staleTime: 30000,
  });
  const { data: storylinesResp } = useQuery<{ storylines: StorylineWidgetItem[] }>({
    queryKey: ["/api/leagues", leagueId, "storylines"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/storylines`, { credentials: "include" });
      if (!res.ok) return { storylines: [] };
      const json = await res.json();
      return Array.isArray(json) ? { storylines: json } : json;
    },
    staleTime: 60000,
  });
  const { data: readyData } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
    staleTime: 30000,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (postImageFile) {
        setPostImageUploading(true);
        try {
          const resp = await apiRequest("POST", "/api/uploads/request-url", {
            name: postImageFile.name, size: postImageFile.size, contentType: postImageFile.type,
          });
          const { uploadURL, objectPath } = await resp.json();
          await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": postImageFile.type }, body: postImageFile });
          imageUrl = objectPath;
        } finally {
          setPostImageUploading(false);
        }
      }
      return apiRequest("POST", `/api/leagues/${leagueId}/news`, {
        title: postTitle, body: postBody, imageUrl,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] });
      setPostTitle(""); setPostBody(""); setPostImageFile(null); setPostImagePreview(null);
      setShowPostForm(false);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (pid: string) => apiRequest("DELETE", `/api/leagues/${leagueId}/news/${pid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] }),
  });

  const posts = newsData ?? [];
  const storylines = storylinesResp?.storylines ?? [];
  const pendingVotes = storylines.filter(s => !!s.activeEvent && !s.myVote).length;
  const phaseLabel = phase ? (PHASE_LABEL[phase] ?? phase.replace(/_/g, " ")) : "—";
  const readyCount = readyData?.readyCount ?? 0;
  const humanCount = Math.max(readyData?.humanCount ?? 1, 1);
  const latestSigning = rawEvents.find(e => e.eventType === "SIGNING");
  const filteredEvents = actFilter === "ALL"
    ? rawEvents
    : rawEvents.filter(e => actFilter.split(",").includes(e.eventType));

  const TABS = [
    { key: "posts",      label: "Posts",      badge: 0 },
    { key: "activity",   label: "Activity",   badge: 0 },
    { key: "storylines", label: "Storylines", badge: pendingVotes },
  ];

  return (
    <RetroCard className="border-gold/15" data-testid="newsroom-panel" style={{ minHeight: 320 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <RetroCardHeader>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-gold" />
            <h2 className="font-pixel text-gold text-[10px]">LEAGUE NEWSROOM</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Segmented tab buttons */}
            <div className="flex border border-border rounded-md overflow-hidden">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  data-testid={`newsroom-tab-${t.key}`}
                  className={`relative px-2.5 py-1 font-pixel text-[7px] whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                    tab === t.key
                      ? "bg-gold text-forest-dark"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  {t.label}
                  {t.badge > 0 && (
                    <span className="min-w-[14px] h-[14px] rounded-full bg-red-500 text-white font-pixel text-[7px] flex items-center justify-center px-0.5 animate-pulse">
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {canPost && (
              <RetroButton
                size="sm"
                variant="outline"
                onClick={() => { setTab("posts"); setShowPostForm(v => !v); }}
                className="border-gold/40 text-gold hover:bg-gold/10 text-[9px] whitespace-nowrap"
                data-testid="button-toggle-news-form"
              >
                <PlusCircle className="w-3 h-3 mr-1" />
                Post
              </RetroButton>
            )}
          </div>
        </div>
      </RetroCardHeader>

      <RetroCardContent>
        {/* ── Post creation form — open to all league members ────────────── */}
        {showPostForm && canPost && (
          <div className="mb-4 p-3 bg-background/50 border border-gold/20 rounded-lg space-y-2.5" data-testid="form-news-post">
            <p className="font-pixel text-[8px] text-gold">NEW POST</p>
            <input
              value={postTitle}
              onChange={e => setPostTitle(e.target.value)}
              maxLength={120}
              placeholder="Headline..."
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
              data-testid="input-news-title"
            />
            <textarea
              value={postBody}
              onChange={e => setPostBody(e.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="Write your post..."
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50 resize-none"
              data-testid="input-news-body"
            />
            {postImagePreview ? (
              <div className="relative">
                <img src={postImagePreview} alt="Preview" className="h-24 w-full object-cover rounded border border-border/40" />
                <button
                  onClick={() => { setPostImageFile(null); setPostImagePreview(null); setPostImageError(null); }}
                  className="absolute top-1 right-1 bg-background/80 text-red-400 rounded p-0.5 hover:bg-background"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border/40 hover:border-gold/40 rounded px-3 py-1.5 transition-colors">
                <Image className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Add image (optional)...</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePostImageSelect} data-testid="input-news-image-file" />
              </label>
            )}
            {postImageError && (
              <p className="text-xs text-red-400 mt-1" data-testid="text-post-image-error">{postImageError}</p>
            )}
            <div className="flex justify-end gap-2">
              <RetroButton variant="outline" size="sm" onClick={() => setShowPostForm(false)}>Cancel</RetroButton>
              <RetroButton
                size="sm"
                disabled={!postTitle.trim() || !postBody.trim() || createMut.isPending || postImageUploading}
                onClick={() => createMut.mutate()}
                data-testid="button-submit-news-post"
              >
                {postImageUploading ? "Uploading..." : createMut.isPending ? "Posting..." : "Publish"}
              </RetroButton>
            </div>
          </div>
        )}

        {/* ── Body: main feed + league pulse rail ─────────────────────────── */}
        <div className="flex gap-0">

          {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 min-h-[220px]" data-testid="newsroom-feed">

            {/* POSTS TAB ─────────────────────────────────────────────── */}
            {tab === "posts" && (
              newsLoading ? (
                <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : posts.length === 0 ? (
                <div className="py-4 space-y-3" data-testid="newsroom-posts-empty">
                  <div className="text-center py-2">
                    <p className="text-[11px] text-muted-foreground">No posts yet</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{phaseLabel} is underway</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pendingVotes > 0 && (
                      <Link href={`/league/${leagueId}/storylines`}>
                        <span className="flex items-center gap-1 text-[9px] px-2 py-1 rounded border border-gold/30 bg-gold/5 text-gold cursor-pointer hover:bg-gold/10 transition-colors" data-testid="chip-pending-votes">
                          <Zap className="w-2.5 h-2.5" /> {pendingVotes} storyline vote{pendingVotes !== 1 ? "s" : ""} pending
                        </span>
                      </Link>
                    )}
                    <span className="text-[9px] px-2 py-1 rounded border border-border/40 text-muted-foreground">
                      {readyCount}/{humanCount} coaches ready
                    </span>
                  </div>
                  {isCommissioner && (
                    <div>
                      <p className="font-pixel text-[7px] text-muted-foreground/60 mb-1.5">SUGGESTED POSTS</p>
                      <div className="flex flex-wrap gap-2">
                        {["Preseason prediction", "Recruiting rumor", "Season recap", "Commissioner note"].map(prompt => (
                          <button
                            key={prompt}
                            onClick={() => { setPostTitle(prompt); setShowPostForm(true); }}
                            className="text-[9px] px-2 py-1 rounded border border-border/40 text-muted-foreground hover:border-gold/40 hover:text-gold transition-colors"
                            data-testid={`chip-post-prompt-${prompt.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2" data-testid="newsroom-posts-list">
                  {posts.map(post => (
                    <div
                      key={post.id}
                      className="border border-border/40 rounded-lg overflow-hidden bg-card/20 hover:border-gold/30 transition-colors"
                      data-testid={`newsroom-post-${post.id}`}
                    >
                      <button
                        className="w-full text-left p-3"
                        onClick={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-pixel text-[7px] text-gold/60 border border-gold/20 rounded px-1">POST</span>
                              <span className="text-[9px] text-muted-foreground">{fmtDate(post.createdAt)}</span>
                              {post.authorName && (
                                <span className="text-[9px] font-pixel text-gold/70">{post.authorName}</span>
                              )}
                            </div>
                            <p className="font-pixel text-[9px] text-foreground leading-snug truncate">{post.title}</p>
                          </div>
                          {(isCommissioner || (!!currentUserId && post.authorId === currentUserId)) && (
                            <button
                              onClick={e => { e.stopPropagation(); deleteMut.mutate(post.id); }}
                              className="text-red-400/40 hover:text-red-400 transition-colors shrink-0 p-1"
                              data-testid={`button-delete-post-${post.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </button>
                      {expandedPostId === post.id && (
                        <div className="px-3 pb-3 border-t border-border/30">
                          {post.imageUrl && (
                            <div className="h-32 overflow-hidden rounded bg-background/40 mb-2 mt-2">
                              <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap mt-2">{post.content}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ACTIVITY TAB ──────────────────────────────────────────── */}
            {tab === "activity" && (
              <div data-testid="newsroom-activity">
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {NR_FILTERS.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setActFilter(f.key as NrFilterKey)}
                      data-testid={`newsroom-filter-${f.key.toLowerCase().replace(/[,]/g, "-")}`}
                      className={`px-2 py-0.5 rounded text-[9px] font-pixel border transition-colors ${
                        actFilter === f.key
                          ? "bg-gold/20 text-gold border-gold/50"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {eventsLoading ? (
                  <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : filteredEvents.length === 0 ? (
                  <div className="py-6 text-center" data-testid="newsroom-activity-empty">
                    <Activity className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground">No activity yet</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{phaseLabel} — activity appears after coaches recruit, post, or advance</p>
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-72 overflow-y-auto pr-1" data-testid="newsroom-activity-list">
                    {filteredEvents.map(ev => {
                      const chip = NR_EVENT_CHIP[ev.eventType] ?? { label: ev.eventType.slice(0, 6), cls: "text-muted-foreground bg-muted border-border" };
                      return (
                        <div
                          key={ev.id}
                          className="flex items-start gap-2 px-2 py-2 rounded hover:bg-card/50 transition-colors"
                          data-testid={`newsroom-event-${ev.id}`}
                        >
                          <span className={`shrink-0 font-pixel text-[7px] px-1 py-0.5 rounded border whitespace-nowrap mt-0.5 ${chip.cls}`}>
                            {chip.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-foreground/80 leading-snug">{ev.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {ev.teamName && (
                                <span className="text-[9px] text-muted-foreground truncate max-w-[120px]">{ev.teamName}</span>
                              )}
                              <span className="text-[9px] text-muted-foreground ml-auto shrink-0">{formatRelativeTime(ev.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* STORYLINES TAB ─────────────────────────────────────────── */}
            {tab === "storylines" && (
              <div data-testid="newsroom-storylines">
                {storylines.length === 0 ? (
                  <div className="py-6 text-center" data-testid="newsroom-storylines-empty">
                    <Swords className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground">No active storylines</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Storylines unlock during recruiting as recruits advance</p>
                  </div>
                ) : (
                  <div className="space-y-2" data-testid="newsroom-storylines-list">
                    {pendingVotes > 0 && (
                      <div className="px-3 py-2 bg-gold/10 border border-gold/30 rounded-lg flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-gold" />
                          <span className="font-pixel text-[9px] text-gold">{pendingVotes} vote{pendingVotes !== 1 ? "s" : ""} pending</span>
                        </div>
                        <Link href={`/league/${leagueId}/storylines`}>
                          <RetroButton size="sm" variant="outline" className="border-gold/40 text-gold text-[8px]" data-testid="newsroom-vote-cta">
                            Vote now <ChevronRight className="w-3 h-3 ml-1" />
                          </RetroButton>
                        </Link>
                      </div>
                    )}
                    {storylines.slice(0, 5).map(sl => {
                      const hasVote = !!sl.activeEvent && !sl.myVote;
                      const arcPct = Math.min(((sl.currentArcStage ?? 0) / Math.max(sl.totalEvents ?? 4, 1)) * 100, 100);
                      return (
                        <Link key={sl.id} href={`/league/${leagueId}/storylines`}>
                          <div
                            className={`px-3 py-2 rounded-md border transition-all cursor-pointer ${hasVote ? "bg-gold/5 border-gold/30 hover:bg-gold/10" : "bg-muted/20 border-border/40 hover:border-gold/30 hover:bg-muted/30"}`}
                            data-testid={`newsroom-storyline-${sl.id}`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {sl.isLegendary && <Star className="w-3 h-3 text-gold shrink-0" />}
                              <span className="text-[11px] font-medium truncate flex-1 text-foreground/80">
                                {sl.recruit?.firstName} {sl.recruit?.lastName}
                                {sl.recruit?.position && <span className="text-muted-foreground text-[9px] ml-1">({sl.recruit.position})</span>}
                              </span>
                              {hasVote ? (
                                <span className="flex items-center gap-0.5 text-[9px] text-gold font-pixel shrink-0"><Zap className="w-2.5 h-2.5" /> VOTE</span>
                              ) : sl.resolvedOvrDelta ? (
                                <span className={`text-[9px] font-pixel shrink-0 ${(sl.resolvedOvrDelta ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  {(sl.resolvedOvrDelta ?? 0) > 0 ? "+" : ""}{sl.resolvedOvrDelta} OVR
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-background/60 rounded-full overflow-hidden">
                                <div className="h-full bg-gold/40 rounded-full" style={{ width: `${arcPct}%` }} />
                              </div>
                              <span className="text-[9px] text-muted-foreground shrink-0">Wk {sl.currentArcStage ?? 0}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {storylines.length > 5 && (
                      <Link href={`/league/${leagueId}/storylines`}>
                        <p className="text-[10px] text-muted-foreground text-center hover:text-gold transition-colors pt-1" data-testid="newsroom-more-storylines">
                          +{storylines.length - 5} more arcs on the War Board
                        </p>
                      </Link>
                    )}
                    <div className="pt-1">
                      <Link href={`/league/${leagueId}/storylines`}>
                        <RetroButton size="sm" variant="outline" className="w-full border-border/50 text-[9px]" data-testid="newsroom-warboard-btn">
                          <Swords className="w-3 h-3 mr-1.5" /> Open War Board
                        </RetroButton>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── LEAGUE PULSE SIDE RAIL ───────────────────────────────── */}
          <div
            className="hidden lg:flex flex-col gap-3 w-[210px] shrink-0 ml-5 pl-5 border-l border-border/30"
            data-testid="newsroom-pulse"
          >
            <p className="font-pixel text-[8px] text-muted-foreground/50 uppercase tracking-wider">League Pulse</p>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Ready</span>
                <span className={`font-pixel text-[9px] ${readyCount >= humanCount ? "text-emerald-400" : "text-gold"}`}>
                  {readyCount}/{humanCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Votes pending</span>
                <span className={`font-pixel text-[9px] ${pendingVotes > 0 ? "text-gold animate-pulse" : "text-muted-foreground"}`}>
                  {pendingVotes}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Phase</span>
                <span className="text-[10px] text-foreground/70 text-right max-w-[100px] leading-snug">{phaseLabel}</span>
              </div>
              <div className="pt-2 border-t border-border/30">
                <p className="text-[9px] text-muted-foreground/60 mb-0.5">Latest signing</p>
                <p className="text-[10px] text-foreground/60 leading-snug line-clamp-2">
                  {latestSigning ? latestSigning.description : "None yet"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 mt-auto pt-3 border-t border-border/30">
              {isCommissioner && (
                <button
                  onClick={() => { setTab("posts"); setShowPostForm(true); }}
                  className="w-full text-left flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-gold transition-colors py-0.5"
                  data-testid="pulse-action-post"
                >
                  <PlusCircle className="w-3 h-3 shrink-0" /> Post an update
                </button>
              )}
              {pendingVotes > 0 && (
                <Link href={`/league/${leagueId}/storylines`}>
                  <div className="flex items-center gap-1.5 text-[10px] text-gold hover:underline py-0.5 cursor-pointer" data-testid="pulse-action-vote">
                    <Zap className="w-3 h-3 shrink-0" /> Vote on storylines
                  </div>
                </Link>
              )}
              <Link href={`/league/${leagueId}/recruiting`}>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-gold transition-colors py-0.5 cursor-pointer" data-testid="pulse-action-recruit">
                  <ChevronRight className="w-3 h-3 shrink-0" /> Recruiting board
                </div>
              </Link>
              <Link href={`/league/${leagueId}/schedule`}>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-gold transition-colors py-0.5 cursor-pointer" data-testid="pulse-action-schedule">
                  <ChevronRight className="w-3 h-3 shrink-0" /> Schedule
                </div>
              </Link>
            </div>
          </div>

        </div>
      </RetroCardContent>
    </RetroCard>
  );
}
