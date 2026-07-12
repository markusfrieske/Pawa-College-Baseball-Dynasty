/**
 * Hub Panels — extra cockpit widgets for the League Hub
 * - LeagueTickerBanner: scrolling marquee of real league events
 * - StatsLeadersPanel: top batters/pitchers by season stats
 * - PowerRankingsWidget: power ranking table with OVR-based grades
 * - TopProspectsWidget: top players by OVR as draft prospects
 * - LeagueNewsPanel: commissioner blog posts + post form
 * - MergedRosterPanel: Roster Depth + Roster Strength combined
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Newspaper, TrendingUp, BarChart2, Users, Star, Trash2,
  PlusCircle, Image, ChevronRight, Activity, Swords,
} from "lucide-react";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { StoryEngineHub } from "@/components/story-engine-hub";
import { ActivityFeed } from "./tabs/activity-widgets";
import { apiRequest } from "@/lib/queryClient";
import type { Player } from "@shared/schema";
import type { DashboardOverview, LeagueDetails } from "./types";
import { STAR_COLORS, STAR_TEXT_COLORS } from "./helpers";

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
  id: string; title: string; subtitle: string | null; body: string;
  imageUrl: string | null; createdAt: string; commissionerId: string;
}
interface NewsResp { posts: NewsPost[]; }

function NewsPostCard({
  post, isCommissioner, leagueId, onDelete,
}: { post: NewsPost; isCommissioner: boolean; leagueId: string; onDelete: () => void }) {
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
          {isCommissioner && (
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
        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{post.body}</p>
        <p className="text-[10px] text-muted-foreground mt-3">{fmtDate(post.createdAt)}</p>
      </div>
    </article>
  );
}

export function LeagueNewsPanel({
  leagueId, isCommissioner,
}: { leagueId: string; isCommissioner: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const { data, isLoading } = useQuery<NewsResp>({
    queryKey: ["/api/leagues", leagueId, "news"],
    staleTime: 30000,
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${leagueId}/news`, { title, subtitle: subtitle || undefined, body, imageUrl: imageUrl || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] });
      setTitle(""); setSubtitle(""); setBody(""); setImageUrl("");
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (postId: string) => apiRequest("DELETE", `/api/leagues/${leagueId}/news/${postId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] }),
  });

  const posts = data?.posts ?? [];

  return (
    <div data-testid="panel-league-news">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-gold" />
          <h2 className="font-pixel text-gold text-[10px]">LEAGUE NEWS</h2>
        </div>
        {isCommissioner && (
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

      {/* Commissioner post form */}
      {showForm && isCommissioner && (
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
                <label className="font-pixel text-[8px] text-muted-foreground block mb-1">SUBHEADLINE</label>
                <input
                  value={subtitle}
                  onChange={e => setSubtitle(e.target.value)}
                  maxLength={200}
                  placeholder="Optional subheadline..."
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
                  data-testid="input-news-subtitle"
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
                  <Image className="w-3 h-3" /> IMAGE URL (optional)
                </label>
                <input
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
                  data-testid="input-news-image-url"
                />
              </div>
              <div className="flex justify-end gap-2">
                <RetroButton variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</RetroButton>
                <RetroButton
                  size="sm"
                  disabled={!title.trim() || !body.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                  data-testid="button-submit-news-post"
                >
                  {createMut.isPending ? "Posting..." : "Publish Post"}
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
          {isCommissioner && (
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

// ─── Newsroom Panel (unified news + activity + storylines) ───────────────────

export function NewsroomPanel({
  leagueId, isCommissioner, myTeamId,
}: { leagueId: string; isCommissioner: boolean; myTeamId?: string }) {
  const [tab, setTab] = useState("commissioner");

  return (
    <div data-testid="newsroom-panel">
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="w-4 h-4 text-gold" />
        <h2 className="font-pixel text-gold text-[10px]">LEAGUE NEWSROOM</h2>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
          <TabsList className="bg-card border border-border inline-flex w-auto gap-0">
            <TabsTrigger
              value="commissioner"
              className="font-pixel text-[8px] whitespace-nowrap px-2.5 data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
              data-testid="newsroom-tab-commissioner"
            >
              <Newspaper className="w-3 h-3 mr-1" />
              Posts
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="font-pixel text-[8px] whitespace-nowrap px-2.5 data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
              data-testid="newsroom-tab-activity"
            >
              <Activity className="w-3 h-3 mr-1" />
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="storylines"
              className="font-pixel text-[8px] whitespace-nowrap px-2.5 data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
              data-testid="newsroom-tab-storylines"
            >
              <Swords className="w-3 h-3 mr-1" />
              Storylines
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="commissioner">
          <LeagueNewsPanel leagueId={leagueId} isCommissioner={isCommissioner} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityFeed leagueId={leagueId} />
        </TabsContent>

        <TabsContent value="storylines">
          <StoryEngineHub leagueId={leagueId} teamId={myTeamId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
