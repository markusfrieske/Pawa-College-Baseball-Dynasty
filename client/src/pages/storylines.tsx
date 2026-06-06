import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/ui/star-rating";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, BookOpen, Sparkles, TrendingUp, TrendingDown, Minus,
  ChevronRight, ChevronDown, Users, Trophy, Flame, Skull, Crown, Zap,
  Vote, Clock, CheckCircle, BarChart2, Link2, Calendar,
  Target, History, GitBranch, Activity, RefreshCw, Loader2,
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
  resolvedAbilityGain?: string | null;
  resolvedAbilityRemove?: string | null;
  resolvedAbilityTier?: string | null;
  archetypeAtEvent?: string | null;
  eventImageUrl?: string | null;
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
    skinTone?: string | null;
    hairColor?: string | null;
    hairStyle?: string | null;
    facialHair?: string | null;
    eyeStyle?: string | null;
    eyebrowStyle?: string | null;
    mouthStyle?: string | null;
    eyeBlack?: string | null;
    abilities?: string[] | null;
    storyLockedAbilities?: string[] | null;
  } | null;
  archetypeName: string;
  archetypeDescription: string;
  archetypeFlavor: string;
  imageUrl: string | null;
  archetypeImageUrl: string | null;
  totalArcEvents: number;
  activeEvent: StorylineEventFull | null;
  latestResolvedEvent: StorylineEventFull | null;
  latestResolvedVoteCounts: Record<string, number>;
  latestResolvedMyVote: string | null;
  latestEvent: StorylineEventFull | null;
  allEvents: StorylineEventFull[];
  totalEvents: number;
  resolvedEvents: number;
  voteCounts: Record<string, number>;
  myVote: string | null;
  featuredTeamName?: string | null;
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

function VoteBar({ counts, total, myVote, resolvedChoice }: { counts: Record<string, number>; total: number; myVote: string | null; resolvedChoice?: string | null }) {
  return (
    <div className="space-y-1.5">
      {CHOICE_LABELS.map(c => {
        const count = counts[c] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const isWinner = resolvedChoice
          ? c === resolvedChoice
          : (total > 0 && count === Math.max(...CHOICE_LABELS.map(x => counts[x] || 0)));
        return (
          <div key={c} className="flex items-center gap-2">
            <span className={`w-4 text-[9px] font-pixel font-bold ${(myVote === c || c === resolvedChoice) ? "text-gold" : "text-muted-foreground"}`}>{c}</span>
            <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isWinner && total > 0 ? "bg-gold" : "bg-muted-foreground/40"}`}
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


function ArcTimeline({ events }: { events: StorylineEventFull[] }) {
  if (events.length === 0) return null;
  // Sort ascending by week so history renders chronologically (Wk 1 → Wk N)
  const resolved = [...events]
    .filter(e => e.resolvedChoice)
    .sort((a, b) => (a.week ?? 0) - (b.week ?? 0));
  if (resolved.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <History className="w-3 h-3 text-muted-foreground" />
        <span className="text-[9px] font-pixel text-muted-foreground">ARC HISTORY</span>
      </div>
      <div className="space-y-2">
        {resolved.map((e, idx) => {
          const prevArchetype = idx > 0 ? resolved[idx - 1].archetypeAtEvent : null;
          const archetypeChanged = prevArchetype && e.archetypeAtEvent && prevArchetype !== e.archetypeAtEvent;
          return (
            <div key={e.id} className="flex items-start gap-2">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${e.ovrDelta && e.ovrDelta > 0 ? "border-green-500/50 bg-green-500/10" : e.ovrDelta && e.ovrDelta < 0 ? "border-red-500/50 bg-red-500/10" : "border-border/50 bg-muted/20"}`}>
                  <span className="text-[7px] font-pixel font-bold">{idx + 1}</span>
                </div>
                {idx < resolved.length - 1 && <div className="w-px h-3 bg-border/40 my-0.5" />}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-pixel text-muted-foreground">Wk {e.week}</span>
                  {e.ovrDelta !== null && e.ovrDelta !== 0 && <OvrDeltaBadge delta={e.ovrDelta} />}
                </div>
                {(() => {
                  const wc = e.resolvedChoice;
                  const wcText = wc === "A" ? e.choiceA : wc === "B" ? e.choiceB : wc === "C" ? e.choiceC : (e.choiceD || "");
                  return wc && wcText ? (
                    <p className="text-[10px] text-foreground/80 mt-0.5 leading-snug" data-testid={`text-arc-choice-${e.id}`}>
                      <span className={`font-pixel text-[9px] mr-1 ${CHOICE_ACTIVE[wc] ? wc === "A" ? "text-blue-300" : wc === "B" ? "text-green-300" : wc === "C" ? "text-amber-300" : "text-purple-300" : "text-gold"}`}>{wc}.</span>
                      {wcText}
                    </p>
                  ) : null;
                })()}
                {archetypeChanged && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <GitBranch className="w-2.5 h-2.5 text-amber-400" />
                    <span className="text-[9px] text-amber-400/80 font-pixel">Arc shift → {e.archetypeAtEvent?.replace(/_/g, " ")}</span>
                  </div>
                )}
                {e.resolvedOutcomeText && (
                  <p className="text-[10px] text-muted-foreground/70 italic mt-0.5 leading-relaxed">"{e.resolvedOutcomeText}"</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StorylineCard({ sl, leagueId }: { sl: StorylineRecruit; leagueId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const r = sl.recruit;
  const activeEvent = sl.activeEvent;
  const resolvedEvent = sl.latestResolvedEvent;
  const totalVotes = Object.values(sl.voteCounts).reduce((s, v) => s + v, 0);
  const tierCfg = TIER_CONFIG[sl.tier] || TIER_CONFIG.average;
  const ovrDelta = sl.resolvedOvrDelta ?? 0;
  const isCommitted = r?.stage === "signed" || r?.stage === "committed";
  const hasLinkedArc = !!sl.overlappingRecruitId;

  const voteMutation = useMutation({
    mutationFn: ({ choice }: { choice: string }) =>
      apiRequest("POST", `/api/leagues/${leagueId}/storylines/events/${activeEvent!.id}/vote`, { choice }),
    onSuccess: () => {
      setPendingChoice(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
    },
  });

  const hasChoiceD = !!activeEvent?.choiceD;
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
            <div className={`w-14 h-14 rounded-lg border overflow-hidden ${sl.isLegendary ? "border-gold/50" : "border-border/50"}`}>
              <PlayerPortrait
                skinTone={r?.skinTone ?? "light"}
                hairColor={r?.hairColor ?? "brown"}
                hairStyle={r?.hairStyle ?? "short"}
                facialHair={r?.facialHair ?? "none"}
                eyeStyle={r?.eyeStyle || undefined}
                eyebrowStyle={r?.eyebrowStyle || undefined}
                mouthStyle={r?.mouthStyle || undefined}
                eyeBlack={r?.eyeBlack ? true : undefined}
                playerId={r?.id}
                isRecruit={true}
                className="w-full h-full"
              />
            </div>
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
                <OvrDeltaBadge delta={ovrDelta} />
              </div>
            </div>

            <ArcProgressPips
              arcStage={sl.currentArcStage}
              totalArcEvents={sl.totalArcEvents}
              isLegendary={sl.isLegendary}
            />

            <div className="mt-2 bg-muted/20 rounded-md px-3 py-1.5" data-testid={`archetype-banner-${sl.id}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3 text-gold flex-shrink-0" />
                  <span className="text-[10px] font-pixel text-gold">{sl.archetypeName}</span>
                </div>
                {sl.featuredTeamName && (
                  <span className="text-[9px] text-blue-300/80 italic flex-shrink-0">
                    Recruiting target of {sl.featuredTeamName}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground italic mt-0.5">{sl.archetypeFlavor}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {/* ── CHAPTER RESOLVED section ── shown whenever a resolved event exists */}
          {resolvedEvent && (
            <div
              className={`rounded-md border overflow-hidden ${resolvedEvent.ovrDelta && resolvedEvent.ovrDelta > 0 ? "bg-green-950/20 border-green-500/30" : resolvedEvent.ovrDelta && resolvedEvent.ovrDelta < 0 ? "bg-red-950/20 border-red-500/30" : "bg-muted/20 border-border/40"}`}
              data-testid={`section-resolved-${sl.id}`}
            >
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle className="w-3 h-3 text-green-400" />
                  <span className="text-[9px] font-pixel text-muted-foreground">
                    CHAPTER {resolvedEvent.week} RESOLVED — Choice {resolvedEvent.resolvedChoice} Won
                  </span>
                  {resolvedEvent.ovrDelta !== null && resolvedEvent.ovrDelta !== 0 && (
                    <span className="ml-auto"><OvrDeltaBadge delta={resolvedEvent.ovrDelta} /></span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-foreground/70 line-clamp-1">{resolvedEvent.eventText}</p>
                {(() => {
                  const wc = resolvedEvent.resolvedChoice;
                  const wcText = wc === "A" ? resolvedEvent.choiceA : wc === "B" ? resolvedEvent.choiceB : wc === "C" ? resolvedEvent.choiceC : (resolvedEvent.choiceD || "");
                  return wc && wcText ? (
                    <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-md border ${CHOICE_ACTIVE[wc] ?? ""}`} data-testid={`box-winning-choice-${resolvedEvent.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-pixel text-muted-foreground/70 mb-0.5">WINNING CHOICE</p>
                        <p className="text-xs leading-snug">
                          <span className="font-pixel text-[9px] mr-1.5">{wc}.</span>
                          {wcText}
                        </p>
                      </div>
                    </div>
                  ) : null;
                })()}
                {resolvedEvent.resolvedOutcomeText && (
                  <p className="text-xs text-muted-foreground italic mt-2">"{resolvedEvent.resolvedOutcomeText}"</p>
                )}
                {/* ── Ability change callout (ability-first display) ── */}
                {resolvedEvent.resolvedAbilityGain && (
                  <div className={`mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md border ${resolvedEvent.resolvedAbilityTier === 'gold' ? 'bg-amber-950/30 border-amber-400/40' : resolvedEvent.resolvedAbilityTier === 'red' ? 'bg-red-950/30 border-red-400/40' : 'bg-blue-950/30 border-blue-400/40'}`} data-testid={`ability-gain-banner-${resolvedEvent.id}`}>
                    <Sparkles className={`w-3 h-3 flex-shrink-0 ${resolvedEvent.resolvedAbilityTier === 'gold' ? 'text-amber-400' : resolvedEvent.resolvedAbilityTier === 'red' ? 'text-red-400' : 'text-blue-400'}`} />
                    <span className="text-[9px] font-pixel text-muted-foreground">ABILITY GAINED:</span>
                    <span className={`text-[10px] font-pixel font-bold ${resolvedEvent.resolvedAbilityTier === 'gold' ? 'text-amber-300' : resolvedEvent.resolvedAbilityTier === 'red' ? 'text-red-300' : 'text-blue-300'}`}>{resolvedEvent.resolvedAbilityGain}</span>
                    <span className={`ml-auto text-[8px] font-pixel px-1.5 py-0.5 rounded border ${resolvedEvent.resolvedAbilityTier === 'gold' ? 'border-amber-400/50 text-amber-400 bg-amber-400/10' : resolvedEvent.resolvedAbilityTier === 'red' ? 'border-red-400/50 text-red-400 bg-red-400/10' : 'border-blue-400/50 text-blue-400 bg-blue-400/10'}`}>{(resolvedEvent.resolvedAbilityTier ?? 'blue').toUpperCase()}</span>
                  </div>
                )}
                {resolvedEvent.resolvedAbilityRemove && !resolvedEvent.resolvedAbilityGain && (
                  <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-red-950/20 border-red-400/30" data-testid={`ability-remove-banner-${resolvedEvent.id}`}>
                    <Skull className="w-3 h-3 flex-shrink-0 text-red-400" />
                    <span className="text-[9px] font-pixel text-muted-foreground">ABILITY LOST:</span>
                    <span className="text-[10px] font-pixel font-bold text-red-300">{resolvedEvent.resolvedAbilityRemove}</span>
                  </div>
                )}
                {resolvedEvent.resolvedAbilityRemove && resolvedEvent.resolvedAbilityGain && (
                  <div className="mt-1 flex items-center gap-2 px-2.5 py-1 rounded-md border bg-red-950/10 border-red-400/20" data-testid={`ability-remove-secondary-${resolvedEvent.id}`}>
                    <Skull className="w-2.5 h-2.5 flex-shrink-0 text-red-400/70" />
                    <span className="text-[8px] font-pixel text-muted-foreground">REMOVED:</span>
                    <span className="text-[9px] text-red-300/70 line-through">{resolvedEvent.resolvedAbilityRemove}</span>
                  </div>
                )}
                {(() => {
                  const resolvedTotal = Object.values(sl.latestResolvedVoteCounts).reduce((s, v) => s + v, 0);
                  return resolvedTotal > 0 ? (
                    <div className="mt-2 pt-2 border-t border-border/20 space-y-1">
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <BarChart2 className="w-3 h-3" />
                        Final vote distribution
                      </div>
                      <VoteBar counts={sl.latestResolvedVoteCounts} total={resolvedTotal} myVote={sl.latestResolvedMyVote} resolvedChoice={resolvedEvent.resolvedChoice} />
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          )}

          {/* ── Separator between resolved result and next chapter ── */}
          {resolvedEvent && activeEvent && (
            <div className="flex items-center gap-2 py-1" data-testid={`separator-next-chapter-${sl.id}`}>
              <div className="flex-1 h-px bg-gold/20" />
              <span className="text-[8px] font-pixel text-gold/60 tracking-widest">NEXT CHAPTER</span>
              <div className="flex-1 h-px bg-gold/20" />
            </div>
          )}

          {/* ── ACTIVE VOTE section ── shown when there is an open vote */}
          {activeEvent && (
            <div className="space-y-3">
              <div className="rounded-md border overflow-hidden bg-card/80 border-gold/20">
                <div className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Vote className="w-3 h-3 text-gold animate-pulse" />
                    <span className="text-[9px] font-pixel text-muted-foreground">
                      CHAPTER {activeEvent.week} OPEN
                    </span>
                    <span className="ml-auto text-[9px] text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-foreground/90">{activeEvent.eventText}</p>
                </div>
              </div>

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
                    {sl.myVote ? (
                      availableChoices.map((c) => {
                        const text = c === "A" ? activeEvent.choiceA : c === "B" ? activeEvent.choiceB : c === "C" ? activeEvent.choiceC : activeEvent.choiceD || "";
                        const isMyVote = sl.myVote === c;
                        return (
                          <div
                            key={c}
                            className={`w-full text-left px-3 py-2 rounded-md border text-xs ${isMyVote ? CHOICE_ACTIVE[c] : "bg-muted/10 text-muted-foreground/50 border-border/30"}`}
                            data-testid={`button-vote-${c}-${activeEvent.id}`}
                          >
                            <span className="font-pixel text-[9px] mr-2">{c}.</span>
                            {text}
                            {isMyVote && <span className="ml-2 text-[9px] opacity-70">(your vote — locked)</span>}
                          </div>
                        );
                      })
                    ) : (
                      <>
                        {availableChoices.map((c) => {
                          const text = c === "A" ? activeEvent.choiceA : c === "B" ? activeEvent.choiceB : c === "C" ? activeEvent.choiceC : activeEvent.choiceD || "";
                          const isSelected = pendingChoice === c;
                          return (
                            <button
                              key={c}
                              onClick={() => setPendingChoice(isSelected ? null : c)}
                              disabled={voteMutation.isPending}
                              className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-all ${isSelected ? CHOICE_ACTIVE[c] : `bg-muted/20 text-foreground ${CHOICE_COLORS[c]}`}`}
                              data-testid={`button-vote-${c}-${activeEvent.id}`}
                            >
                              <span className="font-pixel text-[9px] mr-2">{c}.</span>
                              {text}
                              {isSelected && <span className="ml-2 text-[9px] opacity-70">(selected)</span>}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => pendingChoice && voteMutation.mutate({ choice: pendingChoice })}
                          disabled={!pendingChoice || voteMutation.isPending}
                          className={`w-full px-3 py-2 rounded-md border text-xs font-pixel transition-all ${pendingChoice ? "border-gold bg-gold/10 text-gold hover:bg-gold/20" : "border-border/30 bg-muted/10 text-muted-foreground/40 cursor-not-allowed"}`}
                          data-testid={`button-submit-vote-${activeEvent.id}`}
                        >
                          {voteMutation.isPending ? "Submitting…" : pendingChoice ? `Submit Vote — Choice ${pendingChoice}` : "Select a choice above"}
                        </button>
                      </>
                    )}

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
            </div>
          )}

          {/* ── Waiting for next chapter (resolved exists, no active vote yet) ── */}
          {resolvedEvent && !activeEvent && (
            <div className="text-center py-2 text-muted-foreground" data-testid={`section-waiting-${sl.id}`}>
              <Clock className="w-3.5 h-3.5 mx-auto mb-1 opacity-40" />
              <p className="text-[10px]">Advance the week to unlock the next chapter</p>
            </div>
          )}

          {/* ── True empty state: no events at all yet ── */}
          {!resolvedEvent && !activeEvent && (
            <div className="text-center py-2 text-muted-foreground" data-testid={`section-no-event-${sl.id}`}>
              <Clock className="w-4 h-4 mx-auto mb-1 opacity-50" />
              <p className="text-[10px]">No active event — advance the week to generate one</p>
            </div>
          )}
        </div>

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
            {showTimeline && (
              <div className="flex items-start gap-3 mt-2">
                {r && (
                  <div className={`flex-shrink-0 w-20 h-20 rounded-lg border overflow-hidden ${sl.isLegendary ? "border-gold/50" : "border-border/50"}`} data-testid={`portrait-expanded-${sl.id}`}>
                    <PlayerPortrait
                      skinTone={r.skinTone ?? "light"}
                      hairColor={r.hairColor ?? "brown"}
                      hairStyle={r.hairStyle ?? "short"}
                      facialHair={r.facialHair ?? "none"}
                      eyeStyle={r.eyeStyle || undefined}
                      eyebrowStyle={r.eyebrowStyle || undefined}
                      mouthStyle={r.mouthStyle || undefined}
                      eyeBlack={r.eyeBlack ? true : undefined}
                      playerId={r.id}
                      isRecruit={true}
                      className="w-full h-full"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <ArcTimeline events={sl.allEvents} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </RetroCard>
  );
}

// Trending Recruits: top-3 storyline recruits by arc activity (votes cast + OVR impact)
function TrendingRecruits({ storylines, leagueId }: { storylines: StorylineRecruit[]; leagueId: string }) {
  const ranked = [...storylines]
    .map(sl => {
      const totalVotes = Object.values(sl.voteCounts).reduce((s, v) => s + v, 0);
      const activityScore = totalVotes * 2 + Math.abs(sl.resolvedOvrDelta ?? 0) + (sl.currentArcStage * 3);
      return { sl, activityScore };
    })
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, 3)
    .filter(({ activityScore }) => activityScore > 0);

  if (ranked.length === 0) return null;

  return (
    <RetroCard variant="bordered" className="p-4 mb-4" data-testid="card-trending-recruits">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-gold" />
        <span className="font-pixel text-[10px] text-gold">TRENDING RECRUITS</span>
        <span className="text-[9px] text-muted-foreground ml-1">most arc activity</span>
      </div>
      <div className="space-y-2">
        {ranked.map(({ sl, activityScore }, idx) => {
          const r = sl.recruit;
          if (!r) return null;
          const totalVotes = Object.values(sl.voteCounts).reduce((s, v) => s + v, 0);
          const ovrDelta = sl.resolvedOvrDelta ?? 0;
          return (
            <div key={sl.id} className="flex items-center gap-2" data-testid={`trending-recruit-${sl.id}`}>
              <span className="font-pixel text-[9px] text-muted-foreground w-4">{idx + 1}.</span>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sl.isLegendary ? "bg-gold" : "bg-muted-foreground/40"}`} />
              <Link href={`/league/${leagueId}/recruit/${r.id}`} className="text-[10px] font-medium hover:text-gold flex-1 truncate">
                {r.firstName} {r.lastName}
              </Link>
              <span className="text-[9px] text-muted-foreground">{r.position}</span>
              <StarRating rating={r.starRank} size="sm" />
              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                <Vote className="w-2.5 h-2.5" />{totalVotes}v
              </span>
              {ovrDelta !== 0 && <OvrDeltaBadge delta={ovrDelta} />}
              <span className="text-[8px] text-muted-foreground/50">({activityScore}pts)</span>
            </div>
          );
        })}
      </div>
    </RetroCard>
  );
}

function ArcProgressPips({ arcStage, totalArcEvents, isLegendary }: { arcStage: number; totalArcEvents: number; isLegendary: boolean }) {
  const total = Math.max(3, totalArcEvents);
  const filled = Math.min(arcStage, total);
  return (
    <div className="flex items-center gap-1 mt-1.5" data-testid="arc-progress-pips">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-sm transition-colors ${
            i < filled
              ? isLegendary
                ? "bg-gold/80"
                : "bg-muted-foreground/55"
              : isLegendary
              ? "bg-gold/15"
              : "bg-muted/40"
          }`}
        />
      ))}
      <span className={`text-[8px] font-pixel flex-shrink-0 ml-0.5 ${isLegendary ? "text-gold/70" : "text-muted-foreground/50"}`}>
        {filled}/{total}
      </span>
    </div>
  );
}

function ArcInterestBar({ arcStage, totalEvents, ovrDelta }: { arcStage: number; totalEvents: number; ovrDelta: number }) {
  // Derive a 0–100 arc interest score: arc stage progress + OVR trajectory
  const progressPct = totalEvents > 0 ? Math.min(100, Math.round((arcStage / Math.max(3, totalEvents)) * 100)) : 0;
  const trend = ovrDelta > 5 ? "rising" : ovrDelta < -5 ? "falling" : "stable";
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden" style={{ minWidth: "40px" }}>
        <div
          className={`h-full rounded-full ${trend === "rising" ? "bg-green-400" : trend === "falling" ? "bg-red-400" : "bg-muted-foreground/60"}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      {trend === "rising" && <TrendingUp className="w-2.5 h-2.5 text-green-400 flex-shrink-0" />}
      {trend === "falling" && <TrendingDown className="w-2.5 h-2.5 text-red-400 flex-shrink-0" />}
      {trend === "stable" && <Minus className="w-2.5 h-2.5 text-muted-foreground/60 flex-shrink-0" />}
    </div>
  );
}

function CommitmentTracker({ storylines }: { storylines: StorylineRecruit[] }) {
  const committed = storylines.filter(sl => sl.recruit?.stage === "signed" || sl.recruit?.stage === "committed");
  const pending = storylines.filter(sl => sl.recruit?.stage !== "signed" && sl.recruit?.stage !== "committed");

  // Sort pending by arc interest: most active arcs (high arcStage + OVR momentum) first
  const sortedPending = [...pending].sort((a, b) => {
    const scoreA = (a.currentArcStage * 3) + Math.abs(a.resolvedOvrDelta ?? 0) + (a.totalEvents ?? 0);
    const scoreB = (b.currentArcStage * 3) + Math.abs(b.resolvedOvrDelta ?? 0) + (b.totalEvents ?? 0);
    return scoreB - scoreA;
  });

  return (
    <RetroCard variant="bordered" className="p-4 mb-6" data-testid="card-commitment-tracker">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-gold" />
        <span className="font-pixel text-[10px] text-gold">COMMITMENT TRACKER</span>
        <Badge className="text-[8px] bg-green-500/20 text-green-400 border-green-500/30 no-default-hover-elevate no-default-active-elevate ml-auto">
          {committed.length}/{storylines.length} committed
        </Badge>
      </div>
      {committed.length === 0 && pending.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">No storyline recruits this season.</p>
      )}
      {committed.length > 0 && (
        <div className="space-y-1.5 mb-2">
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
      {sortedPending.length > 0 && (
        <div className={`space-y-1.5 ${committed.length > 0 ? "border-t border-border/30 pt-2" : ""}`}>
          <div className="font-pixel text-[8px] text-muted-foreground mb-1">UNDECIDED — ARC INTEREST</div>
          {sortedPending.map(sl => {
            const r = sl.recruit;
            const ovrDelta = sl.resolvedOvrDelta ?? 0;
            return (
              <div key={sl.id} className="flex items-center gap-2 px-2 py-1.5 bg-muted/10 rounded-md">
                <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <Link href={`/league/${sl.leagueId}/recruit/${r?.id ?? ""}`} className="text-[10px] font-medium hover:text-gold truncate" style={{ minWidth: "80px", maxWidth: "120px" }}>
                  {r?.firstName} {r?.lastName}
                </Link>
                <span className="text-[9px] text-muted-foreground flex-shrink-0">{r?.position}</span>
                <ArcInterestBar arcStage={sl.currentArcStage} totalEvents={sl.totalEvents} ovrDelta={ovrDelta} />
                <span className="text-[9px] text-muted-foreground flex-shrink-0">Wk {sl.currentArcStage}</span>
              </div>
            );
          })}
        </div>
      )}
    </RetroCard>
  );
}

export default function StorylinesPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [filterLegendary, setFilterLegendary] = useState(false);
  const [filterLinked, setFilterLinked] = useState(false);

  const { data: authData } = useQuery<{ id: string }>({ queryKey: ["/api/auth/me"] });
  const { data: leagueData } = useQuery<{ commissionerId: string }>({
    queryKey: ["/api/leagues", leagueId],
    enabled: !!leagueId,
  });
  const isCommissioner = !!(authData?.id && leagueData?.commissionerId && authData.id === leagueData.commissionerId);

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

  const queryClient = useQueryClient();

  const repairMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${leagueId}/storylines/repair`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
    },
  });

  const storylines = storylinesResp?.storylines ?? [];

  let filtered = filterLegendary ? storylines.filter(s => s.isLegendary) : storylines;
  if (filterLinked) filtered = filtered.filter(s => !!s.overlappingRecruitId);

  // Count only events the current coach has NOT yet voted on (not all unresolved events).
  const activeVotes = storylines.filter(s => s.activeEvent && !s.myVote).length;
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

        <div className="grid grid-cols-3 gap-3 mb-6">
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
          <>
            <TrendingRecruits storylines={storylines} leagueId={leagueId!} />
            <CommitmentTracker storylines={storylines} />
          </>
        )}

        {storylines.length > 0 && activeVotes === 0 && !isLoading && !filterLegendary && !filterLinked && (
          <div
            className="mb-4 px-4 py-3 rounded border border-gold/30 bg-gold/5 text-xs text-muted-foreground flex items-center gap-2"
            data-testid="banner-storylines-between-chapters"
          >
            <span className="text-gold font-pixel text-[8px]">■</span>
            <span>
              All {storylines.length} storyline arcs are between chapters.{" "}
              {committedCount > 0 && <span className="text-green-400">{committedCount} committed.</span>}{" "}
              Advance the week to generate new events.
            </span>
          </div>
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
            {!filterLegendary && !filterLinked && isCommissioner && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-3">
                  If this dynasty was started with a saved recruiting class, storylines may need to be initialized.
                </p>
                <RetroButton
                  variant="outline"
                  size="sm"
                  onClick={() => repairMutation.mutate()}
                  disabled={repairMutation.isPending}
                  data-testid="button-repair-storylines"
                >
                  {repairMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Repair Storylines
                </RetroButton>
              </div>
            )}
          </RetroCard>
        ) : (() => {
          const sorted = [...filtered].sort((a, b) => {
            if (a.isLegendary && !b.isLegendary) return -1;
            if (!a.isLegendary && b.isLegendary) return 1;
            const aHasVote = a.activeEvent ? 1 : 0;
            const bHasVote = b.activeEvent ? 1 : 0;
            return bHasVote - aHasVote;
          });
          const votePending = sorted.filter(sl => !!sl.activeEvent);
          const noActivePending = sorted.filter(sl => !sl.activeEvent);
          return (
            <div className="space-y-6">
              {votePending.length > 0 && (
                <section data-testid="section-vote-center">
                  <div className="flex items-center gap-2 mb-3">
                    <Vote className="w-4 h-4 text-gold" />
                    <span className="font-pixel text-[10px] text-gold">VOTE CENTER</span>
                    <span className="font-pixel text-[9px] bg-gold/20 text-gold border border-gold/40 px-1.5 py-0.5 rounded animate-pulse">
                      {votePending.length} open
                    </span>
                  </div>
                  <div className="space-y-4">
                    {votePending.map(sl => (
                      <StorylineCard key={sl.id} sl={sl} leagueId={leagueId!} />
                    ))}
                  </div>
                </section>
              )}
              {noActivePending.length > 0 && (
                <section data-testid="section-storyline-feed">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <span className="font-pixel text-[10px] text-muted-foreground">STORYLINE FEED</span>
                    <span className="text-[9px] text-muted-foreground/60">{noActivePending.length} recruit{noActivePending.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-4">
                    {noActivePending.map(sl => (
                      <StorylineCard key={sl.id} sl={sl} leagueId={leagueId!} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
