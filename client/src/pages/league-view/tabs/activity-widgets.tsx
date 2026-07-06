import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeagueEvent } from "@shared/schema";
import {
  Swords, ChevronRight, Star, Zap, Activity, Filter, Pen, Trophy, GitMerge,
  GraduationCap, Award, Calendar, FileX, UserCheck, Sparkles,
} from "lucide-react";
import type { StorylineWidgetItem } from "../types";
import { formatRelativeTime } from "../helpers";

export function StorylinesDashboardWidget({ leagueId }: { leagueId: string }) {
  const { data: storylinesResp, isLoading } = useQuery<{ storylines: StorylineWidgetItem[] }>({
    queryKey: ["/api/leagues", leagueId, "storylines"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/storylines`, { credentials: "include" });
      if (!res.ok) return { storylines: [] };
      const json = await res.json();
      return Array.isArray(json) ? { storylines: json } : (json as { storylines: StorylineWidgetItem[] });
    },
    staleTime: 60000,
  });
  const storylines = storylinesResp?.storylines ?? [];

  const activityScore = (s: StorylineWidgetItem) => {
    const totalVotes = s.voteCounts
      ? Object.values(s.voteCounts).reduce((a: number, b: number) => a + b, 0)
      : 0;
    const hasOpenVote = s.activeEvent ? 10 : 0;
    return hasOpenVote + totalVotes * 2 + (s.currentArcStage ?? 0) * 3 + Math.abs(s.resolvedOvrDelta ?? 0) + (s.isLegendary ? 5 : 0);
  };

  const unvotedCount = storylines.filter((s) => !!s.activeEvent && !s.myVote).length;
  const mostActive = [...storylines].sort((a, b) => activityScore(b) - activityScore(a)).slice(0, 3);

  if (isLoading) return null;
  if (storylines.length === 0) return null;

  return (
    <RetroCard variant="bordered" className="mb-3" data-testid="storylines-dashboard-widget">
      <RetroCardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-gold" />
          <span className="font-pixel text-xs text-gold">Recruit Storylines</span>
          {unvotedCount > 0 && (
            <span className="font-pixel text-[9px] bg-gold/20 text-gold border border-gold/40 px-1.5 py-0.5 rounded animate-pulse" data-testid="badge-unvoted-storylines">
              {unvotedCount} vote{unvotedCount !== 1 ? "s" : ""} pending
            </span>
          )}
        </div>
        <Link href={`/league/${leagueId}/storylines`}>
          <RetroButton variant="outline" size="sm" data-testid="button-view-storylines">
            View All
            <ChevronRight className="w-3 h-3 ml-1" />
          </RetroButton>
        </Link>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-muted/30 rounded-md px-2 py-2 text-center">
            <div className="font-pixel text-[7px] text-muted-foreground mb-1">STORYLINES</div>
            <div className="text-lg font-bold">{storylines.length}</div>
          </div>
          <div className="bg-muted/30 rounded-md px-2 py-2 text-center">
            <div className="font-pixel text-[7px] text-muted-foreground mb-1">MY VOTES</div>
            <div className={`text-lg font-bold ${unvotedCount > 0 ? "text-gold" : ""}`}>{unvotedCount}</div>
          </div>
        </div>

        {mostActive.length > 0 && (
          <div className="space-y-2">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">MOST ACTIVE</div>
            {mostActive.map((sl) => {
              const hasOpenVote = !!sl.activeEvent;
              return (
                <Link key={sl.id} href={`/league/${leagueId}/storylines`}>
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 rounded-md border border-border/40 hover:border-gold/40 hover:bg-gold/5 transition-all cursor-pointer" data-testid={`widget-storyline-${sl.id}`}>
                    {sl.isLegendary && <Star className="w-3 h-3 text-gold flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block">
                        {sl.recruit?.firstName} {sl.recruit?.lastName}
                      </span>
                      <span className="text-[9px] text-muted-foreground">{sl.archetypeName}</span>
                    </div>
                    {hasOpenVote ? (
                      <div className="flex items-center gap-1 text-[9px] text-gold">
                        <Zap className="w-3 h-3" />
                        Vote
                      </div>
                    ) : (
                      <span className="text-[9px] text-muted-foreground">Wk {sl.currentArcStage ?? 0}</span>
                    )}
                  </div>
                </Link>
              );
            })}
            {storylines.length > 3 && (
              <Link href={`/league/${leagueId}/storylines`}>
                <p className="text-[10px] text-muted-foreground text-center hover:text-gold cursor-pointer transition-colors" data-testid="widget-more-storylines">
                  +{storylines.length - 3} more storylines...
                </p>
              </Link>
            )}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

const EVENT_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "SIGNING", label: "Recruiting" },
  { key: "GAME_RESULT,RIVALRY_RESULT", label: "Games" },
  { key: "TRANSFER,DRAFT,ROSTER_CUT,WALKON", label: "Roster" },
  { key: "AWARD,PHASE_CHANGE", label: "League" },
  { key: "STORYLINE,STORYLINE_ABILITY", label: "Storylines" },
] as const;

type FilterKey = (typeof EVENT_FILTERS)[number]["key"];

const eventTypeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  SIGNING: { icon: <Pen className="w-3 h-3" />, color: "text-green-400 bg-green-500/15 border-green-500/30", label: "Signed" },
  GAME_RESULT: { icon: <Trophy className="w-3 h-3" />, color: "text-gold bg-gold/10 border-gold/30", label: "Game" },
  RIVALRY_RESULT: { icon: <Swords className="w-3 h-3" />, color: "text-amber-400 bg-amber-500/15 border-amber-500/30", label: "Rivalry" },
  TRANSFER: { icon: <GitMerge className="w-3 h-3" />, color: "text-blue-400 bg-blue-500/15 border-blue-500/30", label: "Transfer" },
  DRAFT: { icon: <GraduationCap className="w-3 h-3" />, color: "text-purple-400 bg-purple-500/15 border-purple-500/30", label: "Draft" },
  AWARD: { icon: <Award className="w-3 h-3" />, color: "text-amber-400 bg-amber-500/15 border-amber-500/30", label: "Award" },
  PHASE_CHANGE: { icon: <Calendar className="w-3 h-3" />, color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30", label: "Phase" },
  ROSTER_CUT: { icon: <FileX className="w-3 h-3" />, color: "text-red-400 bg-red-500/15 border-red-500/30", label: "Cut" },
  WALKON: { icon: <UserCheck className="w-3 h-3" />, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", label: "Walk-On" },
  STORYLINE: { icon: <Swords className="w-3 h-3" />, color: "text-amber-300 bg-amber-400/15 border-amber-400/30", label: "Storyline" },
  STORYLINE_ABILITY: { icon: <Sparkles className="w-3 h-3" />, color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30", label: "Story Ability" },
};

export function ActivityFeed({ leagueId }: { leagueId: string }) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("ALL");

  const { data: events = [], isLoading } = useQuery<LeagueEvent[]>({
    queryKey: ["/api/leagues", leagueId, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/events`, { credentials: "include" });
      return res.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const filteredEvents = activeFilter === "ALL"
    ? events
    : events.filter(e => activeFilter.split(",").includes(e.eventType));

  return (
    <RetroCard className="mb-2" data-testid="activity-feed">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gold" />
          <span>Activity Feed</span>
        </div>
      </RetroCardHeader>

      <div className="px-3 pb-2 pt-1 flex items-center gap-1.5 flex-wrap" data-testid="activity-feed-filters">
        <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
        {EVENT_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key as FilterKey)}
            data-testid={`filter-${f.key.toLowerCase()}`}
            className={`px-2 py-0.5 rounded text-[10px] font-pixel border transition-colors ${
              activeFilter === f.key
                ? "bg-gold/20 text-gold border-gold/50"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border/40 max-h-72 overflow-y-auto" data-testid="activity-feed-list">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5 flex items-center gap-3">
              <Skeleton className="w-6 h-6 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/4" />
              </div>
            </div>
          ))
        ) : filteredEvents.length === 0 ? (
          <div className="px-3 py-8 text-center" data-testid="activity-feed-empty">
            <Activity className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No activity yet — events will appear as the dynasty progresses.</p>
          </div>
        ) : (
          filteredEvents.map((event) => {
            let cfg = eventTypeConfig[event.eventType] ?? {
              icon: <Zap className="w-3 h-3" />,
              color: "text-muted-foreground bg-muted border-border",
              label: event.eventType,
            };
            if (event.eventType === "STORYLINE_ABILITY") {
              const desc = (event.description || "").toLowerCase();
              const isLoss = desc.includes("lost") || desc.includes("removed");
              cfg = {
                icon: <Sparkles className="w-3 h-3" />,
                color: isLoss
                  ? "text-red-400 bg-red-500/15 border-red-500/30"
                  : "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
                label: "Story Ability",
              };
            }
            return (
              <div key={event.id} className="px-3 py-2.5 flex items-start gap-3 hover:bg-card/50 transition-colors" data-testid={`event-row-${event.id}`}>
                <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center ${cfg.color}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug">{event.description}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-[9px] font-pixel px-1 py-0.5 rounded border ${cfg.color}`}>{cfg.label}</span>
                    {event.teamAbbreviation && (
                      <TeamBadge abbreviation={event.teamAbbreviation} primaryColor={event.teamPrimaryColor ?? "#2d4a2d"} name={event.teamName || ""} size="sm" className="!w-5 !h-5 !text-[7px]" />
                    )}
                    {event.teamName && (
                      <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">{event.teamName}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">S{event.season} W{event.week}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatRelativeTime(event.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </RetroCard>
  );
}
