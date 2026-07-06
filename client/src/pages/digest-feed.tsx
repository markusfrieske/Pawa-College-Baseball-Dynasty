import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Bell, Swords, Star, TrendingUp, TrendingDown, UserPlus, Zap,
  AlertTriangle, Clock, Megaphone, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { AdvanceDigest } from "@shared/schema";

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function CategorySection({
  icon, title, count, testId, children,
}: { icon: React.ReactNode; title: string; count: number; testId: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  if (count === 0) return null;
  return (
    <div className="mb-3" data-testid={testId}>
      <button
        className="flex items-center gap-2 w-full text-left mb-2"
        onClick={() => setExpanded((e) => !e)}
        data-testid={`toggle-${testId}`}
      >
        <div className="text-gold">{icon}</div>
        <p className="font-pixel text-gold text-[9px] flex-1">{title}</p>
        <Badge variant="outline" className="text-[9px] border-border">{count}</Badge>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {expanded && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function DigestCard({ digest, leagueId }: { digest: AdvanceDigest; leagueId: string }) {
  const c = digest.categories;

  return (
    <RetroCard className="border-gold/30 mb-4" data-testid={`card-digest-${digest.id}`}>
      <RetroCardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-pixel text-gold text-[10px]">
              Season {digest.season} · Week {digest.week}
            </p>
            <p className="text-[10px] text-muted-foreground capitalize">{digest.phase.replace(/_/g, " ")}</p>
          </div>
          <span className="text-[10px] text-muted-foreground" data-testid={`text-time-${digest.id}`}>
            {timeAgo(digest.createdAt as unknown as string)}
          </span>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <CategorySection icon={<Swords className="w-4 h-4" />} title="GAMES" count={c.completedGames?.length ?? 0} testId={`cat-games-${digest.id}`}>
          {c.completedGames?.map((g, i) => (
            <div key={i} className="bg-muted/30 rounded p-2 flex items-center justify-between gap-2" data-testid={`item-game-${digest.id}-${i}`}>
              <div className="min-w-0">
                <p className="text-xs truncate">
                  {g.awayTeamName} {g.awayScore ?? "-"} @ {g.homeTeamName} {g.homeScore ?? "-"}
                </p>
                {g.description && <p className="text-[10px] text-muted-foreground truncate">{g.description}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {g.isUpset && <Badge variant="outline" className="text-[8px] text-amber-400 border-amber-500/40">UPSET</Badge>}
                {g.isRivalry && <Badge variant="outline" className="text-[8px] text-red-400 border-red-500/40">RIVALRY</Badge>}
              </div>
            </div>
          ))}
        </CategorySection>

        <CategorySection icon={<Star className="w-4 h-4" />} title="TOP PERFORMANCES" count={c.topPerformances?.length ?? 0} testId={`cat-performances-${digest.id}`}>
          {c.topPerformances?.map((p, i) => (
            <Link key={i} href={`/league/${leagueId}/game/${p.gameId}/play-by-play`}>
              <div className="bg-muted/30 rounded p-2 hover:bg-muted/50 cursor-pointer" data-testid={`item-performance-${digest.id}-${i}`}>
                <p className="text-xs">
                  <span className="font-semibold">{p.playerName}</span>
                  <span className="text-muted-foreground"> ({p.teamName})</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{p.statLine}</p>
              </div>
            </Link>
          ))}
        </CategorySection>

        <CategorySection icon={<TrendingUp className="w-4 h-4" />} title="STANDINGS MOVEMENT" count={c.standingsMovement?.length ?? 0} testId={`cat-standings-${digest.id}`}>
          {c.standingsMovement?.map((s, i) => (
            <Link key={i} href={`/league/${leagueId}/team/${s.teamId}`}>
              <div className="bg-muted/30 rounded p-2 flex items-center justify-between hover:bg-muted/50 cursor-pointer" data-testid={`item-standing-${digest.id}-${i}`}>
                <p className="text-xs">{s.teamName}</p>
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-muted-foreground">{s.prevRank ?? "?"} → {s.newRank}</span>
                  {s.delta != null && s.delta !== 0 && (
                    s.delta > 0
                      ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                      : <TrendingDown className="w-3 h-3 text-red-400" />
                  )}
                </div>
              </div>
            </Link>
          ))}
        </CategorySection>

        <CategorySection icon={<UserPlus className="w-4 h-4" />} title="RECRUITING COMMITS" count={c.recruitingCommits?.length ?? 0} testId={`cat-commits-${digest.id}`}>
          {c.recruitingCommits?.map((r, i) => (
            <div key={i} className="bg-muted/30 rounded p-2" data-testid={`item-commit-${digest.id}-${i}`}>
              <p className="text-xs">{r.description}</p>
              <p className="text-[10px] text-muted-foreground">{r.teamName}</p>
            </div>
          ))}
        </CategorySection>

        <CategorySection icon={<Zap className="w-4 h-4" />} title="HEATING UP" count={c.heatingUpBattles?.length ?? 0} testId={`cat-heating-${digest.id}`}>
          {c.heatingUpBattles?.map((h, i) => (
            <Link key={i} href={`/league/${leagueId}/recruit/${h.recruitId}`}>
              <div className="bg-muted/30 rounded p-2 flex items-center justify-between hover:bg-muted/50 cursor-pointer" data-testid={`item-heating-${digest.id}-${i}`}>
                <p className="text-xs">{h.recruitName} <span className="text-muted-foreground">({h.position}, {h.stars}★)</span></p>
                <p className="text-[10px] text-muted-foreground">{h.teamsInvolved} teams competing</p>
              </div>
            </Link>
          ))}
        </CategorySection>

        <CategorySection icon={<AlertTriangle className="w-4 h-4" />} title="PENDING SCORE REPORTS" count={c.pendingScoreReports?.length ?? 0} testId={`cat-pending-${digest.id}`}>
          {c.pendingScoreReports?.map((p, i) => (
            <Link key={i} href={`/league/${leagueId}/report-game/${p.gameId}`}>
              <div className="bg-muted/30 rounded p-2 flex items-center justify-between hover:bg-muted/50 cursor-pointer" data-testid={`item-pending-${digest.id}-${i}`}>
                <p className="text-xs">{p.awayTeamName} @ {p.homeTeamName}</p>
                <Badge variant="outline" className="text-[8px] border-border">{p.status}</Badge>
              </div>
            </Link>
          ))}
        </CategorySection>

        <CategorySection icon={<Clock className="w-4 h-4" />} title="COACH READY STATUS" count={c.coachReadyStatus?.filter(cr => !cr.isCpu).length ?? 0} testId={`cat-ready-${digest.id}`}>
          {c.coachReadyStatus?.filter(cr => !cr.isCpu).map((cr, i) => (
            <div key={i} className="bg-muted/30 rounded p-2 flex items-center justify-between" data-testid={`item-ready-${digest.id}-${i}`}>
              <p className="text-xs">{cr.coachName} <span className="text-muted-foreground">({cr.teamName})</span></p>
              <Badge variant="outline" className={`text-[8px] ${cr.isReady ? "text-emerald-400 border-emerald-500/40" : "text-amber-400 border-amber-500/40"}`}>
                {cr.isReady ? "READY" : "NOT READY"}
              </Badge>
            </div>
          ))}
        </CategorySection>

        <CategorySection icon={<Megaphone className="w-4 h-4" />} title="COMMISSIONER ACTIONS" count={c.commissionerActions?.length ?? 0} testId={`cat-commissioner-${digest.id}`}>
          {c.commissionerActions?.map((a, i) => (
            <div key={i} className="bg-muted/30 rounded p-2" data-testid={`item-commissioner-${digest.id}-${i}`}>
              <p className="text-xs">{a.action}</p>
              {a.details && <p className="text-[10px] text-muted-foreground">{a.details}</p>}
            </div>
          ))}
        </CategorySection>
      </RetroCardContent>
    </RetroCard>
  );
}

export default function DigestFeedPage() {
  const { id: leagueId } = useParams<{ id: string }>();

  const { data: digests, isLoading } = useQuery<AdvanceDigest[]>({
    queryKey: ["/api/leagues", leagueId, "digests"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/digests?limit=50`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load digests");
      return res.json();
    },
    enabled: !!leagueId,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-card/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/league/${leagueId}`}>
              <RetroButton variant="outline" size="sm" className="gap-1" data-testid="button-back-league">
                <ArrowLeft className="w-3.5 h-3.5" />
                League
              </RetroButton>
            </Link>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-gold" />
              <h1 className="font-pixel text-gold text-[11px] sm:text-[13px]">LEAGUE NEWS</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!isLoading && (!digests || digests.length === 0) && (
          <RetroCard className="border-border/60" data-testid="empty-digest-feed">
            <div className="text-center py-8">
              <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No news yet. Advance the league to see updates here.</p>
            </div>
          </RetroCard>
        )}

        {!isLoading && digests && digests.map((d) => (
          <DigestCard key={d.id} digest={d} leagueId={leagueId!} />
        ))}
      </div>
    </div>
  );
}
