/**
 * League Ticker — /league/:id/ticker
 *
 * Live feed of everything that happened across the multiplayer league.
 * Filters: All | Games | Recruiting | Storylines | Commissioner | My Team
 * Marks events as read when the page is visited.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Trophy,
  Target,
  Sparkles,
  ShieldCheck,
  Users,
  Swords,
  FileText,
  UserCheck,
  UserX,
  ArrowRightLeft,
  Calendar,
  Award,
  Scissors,
  UserPlus,
  Bell,
  Settings,
  TrendingUp,
  Rss,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import type { LeagueEvent } from "@shared/schema";
import { RecapModal } from "@/components/recap-modal";

// ── Types ──────────────────────────────────────────────────────────────────

interface TickerResponse {
  events: LeagueEvent[];
  unreadCount: number;
  lastReadAt: string | null;
  filter: string;
  hasMore: boolean;
}

interface WarRoomData {
  userTeam: { id: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string } | null;
  isCommissioner: boolean;
}

// ── Filter config ──────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all",          label: "All",          icon: Rss },
  { key: "games",        label: "Games",        icon: Swords },
  { key: "recruiting",   label: "Recruiting",   icon: Target },
  { key: "storylines",   label: "Storylines",   icon: Sparkles },
  { key: "commissioner", label: "League",       icon: ShieldCheck },
  { key: "myteam",       label: "My Team",      icon: Users },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

// ── Event-type icon + color ────────────────────────────────────────────────

function eventIcon(eventType: string) {
  switch (eventType) {
    case "GAME_RESULT":   return { Icon: Trophy,          color: "text-gold" };
    case "RIVALRY_RESULT":return { Icon: Swords,          color: "text-orange-400" };
    case "GAME_REPORT":   return { Icon: FileText,         color: "text-blue-400" };
    case "SIGNING":       return { Icon: UserCheck,        color: "text-green-400" };
    case "DECOMMIT":      return { Icon: UserX,            color: "text-red-400" };
    case "TRANSFER":      return { Icon: ArrowRightLeft,   color: "text-purple-400" };
    case "WALKON":        return { Icon: UserPlus,         color: "text-cyan-400" };
    case "PHASE_CHANGE":  return { Icon: Calendar,         color: "text-gold" };
    case "AWARD":         return { Icon: Award,            color: "text-yellow-400" };
    case "ROSTER_CUT":    return { Icon: Scissors,         color: "text-red-400" };
    case "NUDGE":         return { Icon: Bell,             color: "text-muted-foreground" };
    case "PROGRAM_ATTR_CHANGE": return { Icon: Settings,   color: "text-muted-foreground" };
    case "STORYLINE":     return { Icon: Sparkles,         color: "text-violet-400" };
    case "STORYLINE_ABILITY": return { Icon: TrendingUp,   color: "text-violet-400" };
    case "DRAFT":         return { Icon: Award,            color: "text-gold" };
    default:              return { Icon: Bell,             color: "text-muted-foreground" };
  }
}

function relativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Event card ─────────────────────────────────────────────────────────────

function TickerEventCard({ event, isNew, onViewRecap }: { event: LeagueEvent; isNew: boolean; onViewRecap?: (gameId: string) => void }) {
  const { Icon, color } = eventIcon(event.eventType);

  return (
    <div
      className={`flex items-start gap-3 px-3 py-3 rounded-lg border transition-colors ${
        isNew
          ? "bg-gold/5 border-gold/20"
          : "bg-background/30 border-border/30"
      }`}
      data-testid={`ticker-event-${event.id}`}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-snug text-foreground/90 flex-1 min-w-0">
            {event.description}
          </p>
          {isNew && (
            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-gold mt-1" aria-label="New" />
          )}
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {event.teamName && (
            <span className="text-xs text-muted-foreground">
              {event.teamAbbreviation ?? event.teamName}
            </span>
          )}
          <span className="text-xs text-muted-foreground/60">
            S{event.season} W{event.week}
          </span>
          <span className="text-xs text-muted-foreground/50">
            {relativeTime(event.createdAt)}
          </span>
          {event.eventType === "GAME_RESULT" && onViewRecap && typeof (event.metadata as Record<string, unknown>)?.gameId === "string" && (
            <button
              type="button"
              className="text-xs text-gold/70 hover:text-gold underline underline-offset-2"
              onClick={() => onViewRecap((event.metadata as Record<string, string>).gameId)}
              data-testid={`ticker-recap-${event.id}`}
            >
              Recap
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton loader ────────────────────────────────────────────────────────

function TickerSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-3 rounded-lg border border-border/30 bg-background/20">
          <Skeleton className="w-4 h-4 mt-0.5 flex-shrink-0 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LeagueTickerPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [offset, setOffset] = useState(0);
  const [allEvents, setAllEvents] = useState<LeagueEvent[]>([]);
  const [recapGameId, setRecapGameId] = useState<string | null>(null);

  // War-room meta gives us userTeam + isCommissioner
  const { data: wrData } = useQuery<WarRoomData>({
    queryKey: ["/api/leagues", leagueId, "war-room"],
    staleTime: 30_000,
  });

  // Ticker feed — refetches when filter or offset changes
  const { data: tickerData, isLoading, isFetching } = useQuery<TickerResponse>({
    queryKey: ["/api/leagues", leagueId, "ticker", activeFilter, offset],
    queryFn: async () => {
      const params = new URLSearchParams({ filter: activeFilter, limit: "50", offset: String(offset) });
      const res = await fetch(`/api/leagues/${leagueId}/ticker?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ticker");
      return res.json();
    },
    staleTime: 20_000,
  });

  // Accumulate events across pages
  useEffect(() => {
    if (!tickerData) return;
    if (offset === 0) {
      setAllEvents(tickerData.events);
    } else {
      setAllEvents(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        const newOnes = tickerData.events.filter(e => !existingIds.has(e.id));
        return [...prev, ...newOnes];
      });
    }
  }, [tickerData, offset]);

  // Reset when filter changes
  useEffect(() => {
    setOffset(0);
    setAllEvents([]);
  }, [activeFilter]);

  // Mark read mutation
  const markRead = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${leagueId}/ticker/mark-read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ticker"] });
    },
  });

  // Mark read once on mount (fire-and-forget)
  useEffect(() => {
    if (leagueId) markRead.mutate();
  }, [leagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = useCallback((key: FilterKey) => {
    setActiveFilter(key);
    setOffset(0);
    setAllEvents([]);
  }, []);

  const lastReadAt = tickerData?.lastReadAt ? new Date(tickerData.lastReadAt) : null;
  const hasMore = tickerData?.hasMore ?? false;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 pb-24 pt-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link href={`/league/${leagueId}`}>
            <button
              type="button"
              className="flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Back to league"
              data-testid="button-ticker-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <h1 className="font-pixel text-gold text-xs sm:text-[13px] leading-tight">LEAGUE TICKER</h1>
            <p className="text-xs text-muted-foreground mt-0.5">What's happening across the league</p>
          </div>
          {(tickerData?.unreadCount ?? 0) > 0 && (
            <span
              className="ml-auto text-xs font-medium bg-gold text-background px-2 py-0.5 rounded-full"
              data-testid="badge-unread-count"
            >
              {tickerData!.unreadCount > 98 ? "99+" : tickerData!.unreadCount} new
            </span>
          )}
        </div>

        {/* Filter tabs — horizontally scrollable on mobile */}
        <div
          className="flex gap-1.5 overflow-x-auto pb-2 mb-4 -mx-1 px-1 scrollbar-none"
          style={{ scrollbarWidth: "none" }}
          data-testid="ticker-filter-bar"
        >
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleFilterChange(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors min-h-[36px] flex-shrink-0 ${
                activeFilter === key
                  ? "bg-gold text-background"
                  : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              data-testid={`filter-${key}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Feed */}
        <RetroCard>
          <RetroCardContent className="p-3 sm:p-4">
            {isLoading && offset === 0 ? (
              <TickerSkeleton />
            ) : allEvents.length === 0 ? (
              <div className="text-center py-10" data-testid="ticker-empty">
                <Rss className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No events yet for this filter.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Check back after the next advance.</p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="ticker-event-list">
                {allEvents.map(event => (
                  <TickerEventCard
                    key={event.id}
                    event={event}
                    isNew={lastReadAt !== null && new Date(event.createdAt) > lastReadAt}
                    onViewRecap={setRecapGameId}
                  />
                ))}

                {/* Load more */}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setOffset(prev => prev + 50)}
                    disabled={isFetching}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] disabled:opacity-50"
                    data-testid="button-load-more"
                  >
                    {isFetching ? (
                      <RotateCcw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {isFetching ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            )}
          </RetroCardContent>
        </RetroCard>

        {/* Quick links */}
        <div className="mt-4 flex gap-3 flex-wrap text-xs text-muted-foreground">
          <Link href={`/league/${leagueId}/record-book`}>
            <span className="hover:text-gold transition-colors cursor-pointer" data-testid="link-record-book">
              Record Book
            </span>
          </Link>
          <Link href={`/league/${leagueId}/digests`}>
            <span className="hover:text-gold transition-colors cursor-pointer" data-testid="link-digests">
              Advance Digests
            </span>
          </Link>
          <Link href={`/league/${leagueId}/storylines`}>
            <span className="hover:text-gold transition-colors cursor-pointer" data-testid="link-storylines">
              Storylines
            </span>
          </Link>
        </div>
      </div>
      <RecapModal leagueId={leagueId!} gameId={recapGameId} onClose={() => setRecapGameId(null)} />
    </div>
  );
}
