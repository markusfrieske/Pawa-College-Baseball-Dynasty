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
  ChevronRight, ChevronDown, Users, Trophy, Flame, Skull, Crown, Zap,
  Vote, Clock, CheckCircle, BarChart2, Link2, Image, Calendar,
  Target, History, GitBranch,
} from "lucide-react";

interface StorylineEventFull {
  id: string;
  storylineRecruitId: string;
  leagueId: string;
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
  imagePrompt: string | null;
  overlappingRecruitId: string | null;
  overlappingRecruitName: string | null;
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
    stage: string;
    signedTeamAbbreviation?: string | null;
    signedTeamPrimaryColor?: string | null;
  } | null;
  archetypeName: string;
  archetypeDescription: string;
  archetypeFlavor: string;
  latestEvent: StorylineEventFull | null;
  allEvents: StorylineEventFull[];
  totalEvents: number;
  resolvedEvents: number;
  voteCounts: Record<string, number>;
  myVote: string | null;
}

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  elite:         { label: "Elite",      color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
  above_average: { label: "Above Avg",  color: "text-blue-400 bg-blue-500/15 border-blue-500/30" },
  average:       { label: "Average",    color: "text-green-400 bg-green-500/15 border-green-500/30" },
  below_average: { label: "Below Avg",  color: "text-gray-400 bg-gray-500/15 border-gray-500/30" },
  unknown:       { label: "Unknown",    color: "text-purple-400 bg-purple-500/15 border-purple-500/30" },
  legendary:     { label: "Legendary",  color: "text-gold bg-gold/15 border-gold/30" },
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

function ArcTimeline({ events, leagueId }: { events: StorylineEventFull[]; leagueId: string }) {
  if (events.length === 0) return null;
  const resolved = events.filter(e => e.resolvedChoice);
  if (resolved.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <History className="w-3 h-3 text-muted-foreground" />
        <span className="text-[9px] font-pixel text-muted-foreground">ARC HISTORY</span>
      </div>
      <div className="space-y-2">
        {resolved.map((e, idx) => (
          <div key={e.id} className="flex items-start gap-2">
            <div className="flex flex-col items-center">
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${e.ovrDelta && e.ovrDelta > 0 ? "border-green-500/50 bg-green-500/10" : e.ovrDelta && e.ovrDelta < 0 ? "border-red-500/50 bg-red-500/10" : "border-border/50 bg-muted/20"}`}>
                <span className="text-[7px] font-pixel font-bold">{idx + 1}</span>
              </div>
              {idx < resolved.length - 1 && <div className="w-px h-3 bg-border/40 my-0.5" />}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] font-pixel text-muted-foreground">Wk {e.week} — Choice {e.resolvedChoice}</span>
                {e.ovrDelta !== null && e.ovrDelta !== 0 && <OvrDeltaBadge delta={e.ovrDelta} />}
              </div>
              {e.resolvedOutcomeText && (
                <p className="text-[10px] text-muted-foreground/70 italic mt-0.5 leading-relaxed">"{e.resolvedOutcomeText}"</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StorylineCard({ sl, leagueId }: { sl: StorylineRecruit; leagueId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const r = sl.recruit;
  const event = sl.latestEvent;
  const isResolved = !!event?.resolvedChoice;
  const totalVotes = Object.values(sl.voteCounts).reduce((s, v) => s + v, 0);
  const tierCfg = TIER_CONFIG[sl.tier] || TIER_CONFIG.average;
  const ovrDelta = sl.resolvedOvrDelta ?? 0;
  const isCommitted = r?.stage === "signed" || r?.stage === "committed";
  const hasLinkedArc = !!sl.overlappingRecruitId;

  const voteMutation = useMutation({
    mutationFn: ({ choice }: { choice: string }) =>
      apiRequest("POST", `/api/leagues/${leagueId}/storylines/events/${event!.id}/vote`, { choice }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
    },
  });

  const generateImageMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/leagues/${leagueId}/storylines/${sl.id}/generate-image`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
    },
  });

  const hasChoiceD = !!event?.choiceD;
  const availableChoices = hasChoiceD ? CHOICE_LABELS : (["A", "B", "C"] as const);

  return (
    <RetroCard
      variant="bordered"
      className={`overflow-hidden transition-all ${sl.isLegendary ? "border-gold/60 shadow-lg shadow-gold/10" : ""} ${isCommitted ? "border-green-500/40" : ""}`}
      data-testid={`card-storyline-${sl.id}`}
    >
      {sl.isLegendary && (
        <div className="bg-gradient-to-r from-gold/20 via-gold/10 to-transparent px-4 py-1 flex items-center gap-2">
          <Crown className="w-3 h-3 text-gold" />
          <span className="text-[9px] font-pixel text-gold tracking-widest">GENERATIONAL STORYLINE</span>
        </div>
      )}
      {isCommitted && (
        <div className="bg-gradient-to-r from-green-500/20 via-green-500/10 to-transparent px-4 py-1 flex items-center gap-2">
          <CheckCircle className="w-3 h-3 text-green-400" />
          <span className="text-[9px] font-pixel text-green-400 tracking-widest">
            COMMITTED{r?.signedTeamAbbreviation ? ` — ${r.signedTeamAbbreviation}` : ""}
          </span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            {sl.imageUrl ? (
              <img
                src={sl.imageUrl}
                alt={r ? `${r.firstName} ${r.lastName}` : "Recruit"}
                className="w-14 h-14 rounded-lg border border-border/50 object-cover"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <div className={`w-14 h-14 rounded-lg border flex items-center justify-center group cursor-pointer ${sl.isLegendary ? "border-gold/50 bg-gold/10" : "border-border/50 bg-muted/30"}`}
                onClick={() => generateImageMutation.mutate()}
                title="Click to generate AI portrait"
              >
                {generateImageMutation.isPending ? (
                  <Sparkles className="w-5 h-5 text-gold animate-spin" />
                ) : sl.isLegendary ? (
                  <Crown className="w-6 h-6 text-gold" />
                ) : (
                  <Image className="w-5 h-5 text-muted-foreground/50 group-hover:text-gold transition-colors" />
                )}
              </div>
            )}
          </div>

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
                  {isCommitted && <CheckCircle className="w-3 h-3 text-green-400" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {r && <span className="text-[10px] text-muted-foreground">{r.position} • {r.homeState}</span>}
                  {r && <StarRating rating={r.starRank} size="sm" />}
                  <Badge className={`text-[9px] border no-default-hover-elevate no-default-active-elevate ${tierCfg.color}`}>
                    {sl.tier === "unknown" ? "?" : tierCfg.label}
                  </Badge>
                  {hasLinkedArc && (
                    <Badge className="text-[9px] border border-cyan-500/30 text-cyan-400 bg-cyan-500/10 no-default-hover-elevate no-default-active-elevate" title={`Linked arc with ${sl.overlappingRecruitName || "another recruit"}`}>
                      <Link2 className="w-2.5 h-2.5 mr-0.5" />
                      Linked Arc
                    </Badge>
                  )}
                </div>
                {hasLinkedArc && sl.overlappingRecruitName && (
                  <p className="text-[9px] text-cyan-400/70 mt-0.5 flex items-center gap-1">
                    <GitBranch className="w-2.5 h-2.5" />
                    Connected to {sl.overlappingRecruitName}'s storyline
                  </p>
                )}
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

        {sl.allEvents.filter(e => e.resolvedChoice).length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="flex items-center gap-1 text-[9px] font-pixel text-muted-foreground hover:text-gold transition-colors"
              data-testid={`button-timeline-${sl.id}`}
            >
              <History className="w-3 h-3" />
              {showTimeline ? "Hide" : "Show"} arc history ({sl.allEvents.filter(e => e.resolvedChoice).length} resolved)
              {showTimeline ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            {showTimeline && <ArcTimeline events={sl.allEvents} leagueId={leagueId} />}
          </div>
        )}
      </div>
    </RetroCard>
  );
}

function CommitmentTracker({ storylines }: { storylines: StorylineRecruit[] }) {
  const committed = storylines.filter(sl => sl.recruit?.stage === "signed" || sl.recruit?.stage === "committed");
  const pending = storylines.filter(sl => sl.recruit?.stage !== "signed" && sl.recruit?.stage !== "committed");

  return (
    <RetroCard variant="bordered" className="p-4 mb-6" data-testid="card-commitment-tracker">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-gold" />
        <span className="font-pixel text-[10px] text-gold">COMMITMENT TRACKER</span>
        <Badge className="text-[8px] bg-green-500/20 text-green-400 border-green-500/30 no-default-hover-elevate no-default-active-elevate ml-auto">
          {committed.length}/{storylines.length} committed
        </Badge>
      </div>
      {committed.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">No storyline recruits have committed yet.</p>
      ) : (
        <div className="space-y-1.5">
          {committed.map(sl => {
            const r = sl.recruit!;
            const ovrDelta = sl.resolvedOvrDelta ?? 0;
            return (
              <div key={sl.id} className="flex items-center gap-2 bg-green-500/10 rounded-md px-2 py-1.5">
                <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                <Link href={`/league/${sl.leagueId}/recruit/${r.id}`} className="text-[10px] font-medium hover:text-gold flex-1 truncate">
                  {r.firstName} {r.lastName}
                </Link>
                <span className="text-[9px] text-muted-foreground">{r.position}</span>
                <StarRating rating={r.starRank} size="sm" />
                {ovrDelta !== 0 && <OvrDeltaBadge delta={ovrDelta} />}
                {r.signedTeamAbbreviation && (
                  <Badge
                    className="text-[8px] text-white no-default-hover-elevate no-default-active-elevate"
                    style={{ backgroundColor: r.signedTeamPrimaryColor || "#666" }}
                  >
                    {r.signedTeamAbbreviation}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
      {pending.length > 0 && committed.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <p className="text-[9px] text-muted-foreground">{pending.length} recruits still undecided</p>
        </div>
      )}
    </RetroCard>
  );
}

export default function StorylinesPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [filterLegendary, setFilterLegendary] = useState(false);
  const [filterLinked, setFilterLinked] = useState(false);

  const { data: storylinesResp, isLoading } = useQuery<{ storylines: StorylineRecruit[] }>({
    queryKey: ["/api/leagues", leagueId, "storylines"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/storylines`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch storylines");
      const json = await res.json();
      return Array.isArray(json) ? { storylines: json } : json;
    },
    refetchInterval: 30000,
  });

  const storylines = storylinesResp?.storylines ?? [];

  let filtered = filterLegendary ? storylines.filter(s => s.isLegendary) : storylines;
  if (filterLinked) filtered = filtered.filter(s => !!s.overlappingRecruitId);

  const activeVotes = storylines.filter(s => s.latestEvent && !s.latestEvent.resolvedChoice).length;
  const legendaryCount = storylines.filter(s => s.isLegendary).length;
  const linkedCount = storylines.filter(s => !!s.overlappingRecruitId).length;
  const committedCount = storylines.filter(s => s.recruit?.stage === "signed" || s.recruit?.stage === "committed").length;

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

        <div className="grid grid-cols-4 gap-3 mb-6">
          <RetroCard className="p-3 text-center" data-testid="card-storylines-total">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">STORYLINES</div>
            <div className="text-2xl font-bold">{storylines.length}</div>
            <div className="text-[10px] text-muted-foreground">this class</div>
          </RetroCard>
          <RetroCard className="p-3 text-center" data-testid="card-storylines-votes">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">OPEN VOTES</div>
            <div className={`text-2xl font-bold ${activeVotes > 0 ? "text-gold" : ""}`}>{activeVotes}</div>
            <div className="text-[10px] text-muted-foreground">pending</div>
          </RetroCard>
          <RetroCard className="p-3 text-center" data-testid="card-storylines-committed">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">COMMITTED</div>
            <div className={`text-2xl font-bold ${committedCount > 0 ? "text-green-400" : ""}`}>{committedCount}</div>
            <div className="text-[10px] text-muted-foreground">signed/committed</div>
          </RetroCard>
          <RetroCard className="p-3 text-center" data-testid="card-storylines-legendary">
            <div className="font-pixel text-[8px] text-muted-foreground mb-1">LEGENDARY</div>
            <div className="text-2xl font-bold text-gold">{legendaryCount}</div>
            <div className="text-[10px] text-muted-foreground">generational</div>
          </RetroCard>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <RetroButton
            variant={!filterLegendary && !filterLinked ? "primary" : "outline"}
            size="sm"
            onClick={() => { setFilterLegendary(false); setFilterLinked(false); }}
            data-testid="filter-all-storylines"
          >
            <Users className="w-3 h-3 mr-1" />
            All ({storylines.length})
          </RetroButton>
          <RetroButton
            variant={filterLegendary ? "primary" : "outline"}
            size="sm"
            onClick={() => { setFilterLegendary(true); setFilterLinked(false); }}
            data-testid="filter-legendary-storylines"
          >
            <Crown className="w-3 h-3 mr-1" />
            Legendary ({legendaryCount})
          </RetroButton>
          {linkedCount > 0 && (
            <RetroButton
              variant={filterLinked ? "primary" : "outline"}
              size="sm"
              onClick={() => { setFilterLinked(true); setFilterLegendary(false); }}
              data-testid="filter-linked-storylines"
            >
              <Link2 className="w-3 h-3 mr-1" />
              Linked Arcs ({linkedCount})
            </RetroButton>
          )}
        </div>

        {storylines.length > 0 && !filterLegendary && !filterLinked && (
          <CommitmentTracker storylines={storylines} />
        )}

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
              {filterLegendary ? "No Legendary Recruits" : filterLinked ? "No Linked Arcs" : "No Storylines Yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              {filterLegendary
                ? "No legendary storyline recruits in this class."
                : filterLinked
                ? "No linked storyline arcs were generated for this class. About 15% of classes feature connected arcs."
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
