import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/ui/star-rating";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, BookOpen, Sparkles, TrendingUp, TrendingDown, Minus,
  ChevronRight, Users, Trophy, Flame, Skull, Crown, Zap,
  Vote, Clock, CheckCircle, BarChart2,
} from "lucide-react";

interface StorylineRecruit {
  id: string;
  leagueId: string;
  recruitId: string;
  season: number;
  archetype: string;
  tier: string;
  isLegendary: boolean;
  currentArcStage: number;
  resolvedOvrDelta: number;
  imageUrl: string | null;
  recruit: {
    id: string;
    firstName: string;
    lastName: string;
    position: string;
    starRank: number;
    overall: number;
    homeState: string;
    isBlueChip: boolean;
    isGenerationalGem: boolean;
  } | null;
  archetypeName: string;
  archetypeDescription: string;
  archetypeFlavor: string;
  latestEvent: StorylineEventFull | null;
  totalEvents: number;
  resolvedEvents: number;
  voteCounts: Record<string, number>;
  myVote: string | null;
}

interface StorylineEventFull {
  id: string;
  storylineRecruitId: string;
  season: number;
  week: number;
  eventText: string;
  choiceA: string; choiceAOutcome: string;
  choiceB: string; choiceBOutcome: string;
  choiceC: string; choiceCOutcome: string;
  choiceD?: string; choiceDOutcome?: string;
  resolvedChoice: string | null;
  resolvedOutcomeText: string | null;
  ovrDelta: number | null;
}

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  elite: { label: "Elite", color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
  above_average: { label: "Above Avg", color: "text-blue-400 bg-blue-500/15 border-blue-500/30" },
  average: { label: "Average", color: "text-green-400 bg-green-500/15 border-green-500/30" },
  below_average: { label: "Below Avg", color: "text-gray-400 bg-gray-500/15 border-gray-500/30" },
  unknown: { label: "Unknown", color: "text-purple-400 bg-purple-500/15 border-purple-500/30" },
  legendary: { label: "Legendary", color: "text-gold bg-gold/15 border-gold/30" },
};

const CHOICE_LABELS = ["A", "B", "C", "D"] as const;
const CHOICE_COLORS: Record<string, string> = {
  A: "border-blue-500/50 hover:border-blue-500 hover:bg-blue-500/10",
  B: "border-green-500/50 hover:border-green-500 hover:bg-green-500/10",
  C: "border-amber-500/50 hover:border-amber-500 hover:bg-amber-500/10",
  D: "border-purple-500/50 hover:border-purple-500 hover:bg-purple-500/10",
};
const CHOICE_ACTIVE: Record<string, string> = {
  A: "border-blue-500 bg-blue-500/20 text-blue-300",
  B: "border-green-500 bg-green-500/20 text-green-300",
  C: "border-amber-500 bg-amber-500/20 text-amber-300",
  D: "border-purple-500 bg-purple-500/20 text-purple-300",
};

function OvrDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-muted-foreground text-xs flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>;
  if (delta > 0) return <span className="text-green-400 text-xs font-bold flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +{delta} OVR</span>;
  return <span className="text-red-400 text-xs font-bold flex items-center gap-1"><TrendingDown className="w-3 h-3" /> {delta} OVR</span>;
}

function VoteBar({ counts, total, myVote }: { counts: Record<string, number>; total: number; myVote: string | null }) {
  return (
    <div className="space-y-1.5">
      {CHOICE_LABELS.map(c => {
        const count = counts[c] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const isWinning = total > 0 && count === Math.max(...CHOICE_LABELS.map(x => counts[x] || 0));
        return (
          <div key={c} className="flex items-center gap-2">
            <span className={`w-4 text-[9px] font-pixel font-bold ${myVote === c ? "text-gold" : "text-muted-foreground"}`}>{c}</span>
            <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isWinning && total > 0 ? "bg-gold" : "bg-muted-foreground/40"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground w-8 text-right">{count}v</span>
            <span className="text-[9px] text-muted-foreground w-7 text-right">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function StorylineCard({ sl, leagueId }: { sl: StorylineRecruit; leagueId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const r = sl.recruit;
  const event = sl.latestEvent;
  const isResolved = !!event?.resolvedChoice;
  const totalVotes = Object.values(sl.voteCounts).reduce((s, v) => s + v, 0);
  const tierCfg = TIER_CONFIG[sl.tier] || TIER_CONFIG.average;
  const ovrDelta = sl.resolvedOvrDelta ?? 0;

  const voteMutation = useMutation({
    mutationFn: ({ choice }: { choice: string }) =>
      apiRequest("POST", `/api/leagues/${leagueId}/storylines/events/${event!.id}/vote`, { choice }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
    },
  });

  const hasChoiceD = !!event?.choiceD;
  const availableChoices = hasChoiceD ? CHOICE_LABELS : (["A", "B", "C"] as const);

  return (
    <RetroCard
      variant="bordered"
      className={`overflow-hidden transition-all ${sl.isLegendary ? "border-gold/60 shadow-lg shadow-gold/10" : ""}`}
      data-testid={`card-storyline-${sl.id}`}
    >
      {sl.isLegendary && (
        <div className="bg-gradient-to-r from-gold/20 via-gold/10 to-transparent px-4 py-1 flex items-center gap-2">
          <Crown className="w-3 h-3 text-gold" />
          <span className="text-[9px] font-pixel text-gold tracking-widest">GENERATIONAL STORYLINE</span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {sl.imageUrl ? (
            <img
              src={sl.imageUrl}
              alt={r ? `${r.firstName} ${r.lastName}` : "Recruit"}
              className="w-14 h-14 rounded-lg border border-border/50 object-cover flex-shrink-0"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <div className={`w-14 h-14 rounded-lg border flex items-center justify-center flex-shrink-0 ${sl.isLegendary ? "border-gold/50 bg-gold/10" : "border-border/50 bg-muted/30"}`}>
              {sl.isLegendary ? <Crown className="w-6 h-6 text-gold" /> : <BookOpen className="w-6 h-6 text-muted-foreground/50" />}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {r && (
                    <Link href={`/league/${leagueId}/recruit/${r.id}`}>
                      <span className="font-bold text-gold hover:underline cursor-pointer text-sm" data-testid={`link-recruit-${r.id}`}>
                        {r.firstName} {r.lastName}
                      </span>
                    </Link>
                  )}
                  {r?.isGenerationalGem && <Sparkles className="w-3 h-3 text-amber-400" />}
                  {r?.isBlueChip && !r?.isGenerationalGem && <Flame className="w-3 h-3 text-blue-400" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {r && <span className="text-[10px] text-muted-foreground">{r.position} • {r.homeState}</span>}
                  {r && <StarRating rating={r.starRank} size="sm" />}
                  <Badge className={`text-[9px] border no-default-hover-elevate no-default-active-elevate ${tierCfg.color}`}>{tierCfg.label}</Badge>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <div className="text-[9px] font-pixel text-muted-foreground">Arc {sl.currentArcStage}/{sl.totalEvents}</div>
                <OvrDeltaBadge delta={ovrDelta} />
              </div>
            </div>

            <div className="mt-2 bg-muted/20 rounded-md px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3 h-3 text-gold flex-shrink-0" />
                <span className="text-[10px] font-pixel text-gold">{sl.archetypeName}</span>
              </div>
              <p className="text-[10px] text-muted-foreground italic mt-0.5">{sl.archetypeFlavor}</p>
            </div>
          </div>
        </div>

        {event && (
          <div className="mt-4 space-y-3">
            <div className={`rounded-md px-3 py-2.5 border ${isResolved ? "bg-muted/20 border-border/40" : "bg-card/80 border-gold/20"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                {isResolved ? (
                  <CheckCircle className="w-3 h-3 text-green-400" />
                ) : (
                  <Vote className="w-3 h-3 text-gold animate-pulse" />
                )}
                <span className="text-[9px] font-pixel text-muted-foreground">
                  {isResolved ? `RESOLVED — Choice ${event.resolvedChoice} Won` : `VOTE OPEN — Week ${event.week}`}
                </span>
                <span className="ml-auto text-[9px] text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
              </div>
              <p className="text-xs leading-relaxed text-foreground/90">{event.eventText}</p>

              {isResolved && event.resolvedOutcomeText && (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground italic">"{event.resolvedOutcomeText}"</p>
                  {event.ovrDelta !== null && event.ovrDelta !== 0 && (
                    <OvrDeltaBadge delta={event.ovrDelta} />
                  )}
                </div>
              )}
            </div>

            {!isResolved && (
              <div className="space-y-2">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-[9px] font-pixel text-muted-foreground hover:text-gold transition-colors"
                  data-testid={`button-expand-vote-${sl.id}`}
                >
                  <Vote className="w-3 h-3" />
                  {expanded ? "Hide choices" : "Show choices & vote"}
                  <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                </button>

                {expanded && (
                  <div className="space-y-2">
                    {availableChoices.map((c) => {
                      const text = c === "A" ? event.choiceA : c === "B" ? event.choiceB : c === "C" ? event.choiceC : event.choiceD || "";
                      const isMyVote = sl.myVote === c;
                      return (
                        <button
                          key={c}
                          onClick={() => voteMutation.mutate({ choice: c })}
                          disabled={voteMutation.isPending}
                          className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-all ${isMyVote ? CHOICE_ACTIVE[c] : `bg-muted/20 text-foreground ${CHOICE_COLORS[c]}`}`}
                          data-testid={`button-vote-${c}-${event.id}`}
                        >
                          <span className="font-pixel text-[9px] mr-2">{c}.</span>
                          {text}
                          {isMyVote && <span className="ml-2 text-[9px] opacity-70">(your vote)</span>}
                        </button>
                      );
                    })}

                    {totalVotes > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-1.5">
                          <BarChart2 className="w-3 h-3" />
                          Current vote distribution
                        </div>
                        <VoteBar counts={sl.voteCounts} total={totalVotes} myVote={sl.myVote} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isResolved && totalVotes > 0 && (
              <VoteBar counts={sl.voteCounts} total={totalVotes} myVote={sl.myVote} />
            )}
          </div>
        )}

        {!event && (
          <div className="mt-3 text-center py-2 text-muted-foreground">
            <Clock className="w-4 h-4 mx-auto mb-1 opacity-50" />
            <p className="text-[10px]">No active event — advance the week to generate one</p>
          </div>
        )}
      </div>
    </RetroCard>
  );
}

export default function StorylinesPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [filterLegendary, setFilterLegendary] = useState(false);

  const { data: storylines = [], isLoading } = useQuery<StorylineRecruit[]>({
    queryKey: ["/api/leagues", leagueId, "storylines"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/storylines`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch storylines");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const filtered = filterLegendary ? storylines.filter(s => s.isLegendary) : storylines;
  const activeVotes = storylines.filter(s => s.latestEvent && !s.latestEvent.resolvedChoice).length;
  const legendaryCount = storylines.filter(s => s.isLegendary).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/league/${leagueId}`}>
            <RetroButton variant="outline" size="sm" data-testid="button-back-storylines">
              <ArrowLeft className="w-4 h-4 mr-1" />
              League
            </RetroButton>
          </Link>
          <div>
            <h1 className="font-pixel text-lg text-gold flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Recruit Storylines
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Each recruit has a branching narrative. Your votes shape their development.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <RetroCard className="p-3 text-center" data-testid="card-storylines-total">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">STORYLINES</div>
            <div className="text-2xl font-bold">{storylines.length}</div>
            <div className="text-[10px] text-muted-foreground">this class</div>
          </RetroCard>
          <RetroCard className="p-3 text-center" data-testid="card-storylines-votes">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">OPEN VOTES</div>
            <div className={`text-2xl font-bold ${activeVotes > 0 ? "text-gold" : ""}`}>{activeVotes}</div>
            <div className="text-[10px] text-muted-foreground">pending decisions</div>
          </RetroCard>
          <RetroCard className="p-3 text-center" data-testid="card-storylines-legendary">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">LEGENDARY</div>
            <div className="text-2xl font-bold text-gold">{legendaryCount}</div>
            <div className="text-[10px] text-muted-foreground">generational</div>
          </RetroCard>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <RetroButton
            variant={!filterLegendary ? "primary" : "outline"}
            size="sm"
            onClick={() => setFilterLegendary(false)}
            data-testid="filter-all-storylines"
          >
            <Users className="w-3 h-3 mr-1" />
            All ({storylines.length})
          </RetroButton>
          <RetroButton
            variant={filterLegendary ? "primary" : "outline"}
            size="sm"
            onClick={() => setFilterLegendary(true)}
            data-testid="filter-legendary-storylines"
          >
            <Crown className="w-3 h-3 mr-1" />
            Legendary ({legendaryCount})
          </RetroButton>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <RetroCard className="p-12 text-center">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="font-pixel text-sm text-gold mb-2">
              {filterLegendary ? "No Legendary Recruits" : "No Storylines Yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              {filterLegendary
                ? "No legendary storyline recruits in this class."
                : "Storyline recruits are generated when your recruiting class is created. Advance the week to see their stories unfold."}
            </p>
          </RetroCard>
        ) : (
          <div className="space-y-4">
            {filtered
              .sort((a, b) => {
                if (a.isLegendary && !b.isLegendary) return -1;
                if (!a.isLegendary && b.isLegendary) return 1;
                const aHasVote = a.latestEvent && !a.latestEvent.resolvedChoice ? 1 : 0;
                const bHasVote = b.latestEvent && !b.latestEvent.resolvedChoice ? 1 : 0;
                return bHasVote - aHasVote;
              })
              .map(sl => (
                <StorylineCard key={sl.id} sl={sl} leagueId={leagueId!} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
