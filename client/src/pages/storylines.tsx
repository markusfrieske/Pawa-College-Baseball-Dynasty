import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/ui/star-rating";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { RetroButton } from "@/components/ui/retro-button";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, BookOpen, Sparkles, TrendingUp, TrendingDown, Minus,
  ChevronRight, ChevronDown, Users, Trophy, Flame, Crown, Zap,
  Vote, Clock, CheckCircle, BarChart2, Link2, Calendar, Shield,
  Target, History, GitBranch, Activity, RefreshCw, Loader2,
  AlertTriangle, Info, HeartPulse, Wrench, Radio, Star,
  Eye, Award,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

interface ChoiceHint {
  choice: string;
  riskLevel: "low" | "medium" | "high";
  rewardLevel: "low" | "medium" | "high";
  flavor: string;
}

interface StorylineRecruit {
  id: string;
  leagueId: string;
  recruitId: string;
  season: number;
  archetype: string;
  isHighInterest: boolean;
  currentArcStage: number;
  resolvedOvrDelta: number;
  overlappingRecruitId: string | null;
  overlappingRecruitName: string | null;
  recruit: {
    id: string; firstName: string; lastName: string;
    position: string; starRank: number; overall: number;
    homeState: string; isBlueChip: boolean;
    stage: string;
    signedTeamAbbreviation?: string | null;
    signedTeamPrimaryColor?: string | null;
    skinTone?: string | null; hairColor?: string | null; hairStyle?: string | null;
    facialHair?: string | null; eyeStyle?: string | null; eyebrowStyle?: string | null;
    mouthStyle?: string | null; eyeBlack?: string | null;
    abilities?: string[] | null; storyLockedAbilities?: string[] | null;
  } | null;
  publicStoryLabel: string;
  publicArcFlavor: string;
  publicArcStatus: string;
  archetypeImageUrl: string | null;
  totalArcEvents: number;
  activeEvent: StorylineEventFull | null;
  latestResolvedEvent: StorylineEventFull | null;
  latestResolvedVoteCounts: Record<string, number>;
  latestResolvedMyVote: string | null;
  allEvents: StorylineEventFull[];
  totalEvents: number;
  resolvedEvents: number;
  voteCounts: Record<string, number>;
  myVote: string | null;
  moodHint?: "rising" | "steady" | "falling";
  recruitingImpactHint?: "high impact" | "moderate impact" | "low impact";
  choiceHints?: ChoiceHint[] | null;
}

interface LeagueData {
  id: string;
  commissionerId: string;
  coCommissionerIds?: string[];
  currentWeek: number;
  currentPhase: string;
  currentSeason: number;
}

interface HealthIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  detail?: string;
  repairAction?: string;
}

interface HealthReport {
  healthy: boolean;
  issues: HealthIssue[];
  summary: {
    storylineCount: number; recruitCount: number;
    unresolvedEvents: number; staleEvents: number;
    totalEventsGenerated: number; zeroEventRecruits: number; mismatchedRecruits: number;
  };
  checkedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHOICE_COLORS: Record<string, { border: string; active: string; label: string }> = {
  A: { border: "border-blue-500/40", active: "border-blue-500 bg-blue-500/15", label: "text-blue-300" },
  B: { border: "border-green-500/40", active: "border-green-500 bg-green-500/15", label: "text-green-300" },
  C: { border: "border-amber-500/40", active: "border-amber-500 bg-amber-500/15", label: "text-amber-300" },
  D: { border: "border-purple-500/40", active: "border-purple-500 bg-purple-500/15", label: "text-purple-300" },
};

const RISK_COLORS: Record<string, string> = {
  low: "text-green-400 bg-green-500/10 border-green-500/30",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  high: "text-red-400 bg-red-500/10 border-red-500/30",
};

const REWARD_COLORS: Record<string, string> = {
  low: "text-muted-foreground bg-muted/20 border-border/30",
  medium: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  high: "text-gold bg-gold/10 border-gold/30",
};

const MOOD_CONFIG = {
  rising:  { icon: TrendingUp,   color: "text-green-400", bar: "bg-green-400",  label: "Rising",  pct: 82 },
  steady:  { icon: Minus,        color: "text-amber-400", bar: "bg-amber-400",  label: "Steady",  pct: 50 },
  falling: { icon: TrendingDown, color: "text-red-400",   bar: "bg-red-400",    label: "Falling", pct: 22 },
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function OvrPill({ delta }: { delta: number }) {
  if (!delta) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded border
      ${delta > 0 ? "text-green-400 bg-green-500/10 border-green-500/30" : "text-red-400 bg-red-500/10 border-red-500/30"}`}>
      {delta > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {delta > 0 ? "+" : ""}{delta} OVR
    </span>
  );
}

function MoodMeter({ mood }: { mood?: "rising" | "steady" | "falling" }) {
  const cfg = MOOD_CONFIG[mood ?? "steady"];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`w-3 h-3 ${cfg.color} flex-shrink-0`} />
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${cfg.bar} transition-all`} style={{ width: `${cfg.pct}%` }} />
      </div>
      <span className={`text-xs ${cfg.color} flex-shrink-0`}>{cfg.label.toUpperCase()}</span>
    </div>
  );
}

function ArcProgressBar({ stage, total, isHighInterest }: { stage: number; total: number; isHighInterest: boolean }) {
  const t = Math.max(3, total);
  const f = Math.min(stage, t);
  return (
    <div className="flex items-center gap-1" data-testid="arc-progress-pips">
      {Array.from({ length: t }).map((_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-sm ${
          i < f
            ? isHighInterest ? "bg-gold/80" : "bg-muted-foreground/55"
            : isHighInterest ? "bg-gold/15" : "bg-muted/40"
        }`} />
      ))}
      <span className={`text-xs ml-0.5 flex-shrink-0 ${isHighInterest ? "text-gold/70" : "text-muted-foreground/50"}`}>
        {f}/{t}
      </span>
    </div>
  );
}

function VoteBar({ counts, total, myVote, resolvedChoice }: {
  counts: Record<string, number>; total: number; myVote: string | null; resolvedChoice?: string | null;
}) {
  return (
    <div className="space-y-1">
      {(["A","B","C","D"] as const).map(c => {
        const count = counts[c] || 0;
        if (!count && !resolvedChoice) return null;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const isWinner = resolvedChoice ? c === resolvedChoice : (total > 0 && count === Math.max(...["A","B","C","D"].map(x => counts[x] || 0)));
        const cc = CHOICE_COLORS[c];
        return (
          <div key={c} className="flex items-center gap-2">
            <span className={`w-4 text-xs font-bold ${(myVote === c || c === resolvedChoice) ? "text-gold" : "text-muted-foreground"}`}>{c}</span>
            <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${isWinner && total > 0 ? "bg-gold" : "bg-muted-foreground/30"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-10 text-right">{count}v · {pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Vote Card (full game-like card for active votes) ──────────────────────────

function VoteCard({ sl, leagueId }: { sl: StorylineRecruit; leagueId: string }) {
  const queryClient = useQueryClient();
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const r = sl.recruit;
  const ev = sl.activeEvent!;
  const totalVotes = Object.values(sl.voteCounts).reduce((s, v) => s + v, 0);
  const hasD = !!ev.choiceD;
  const choices = hasD ? ["A","B","C","D"] : ["A","B","C"];
  const choiceText: Record<string, string> = { A: ev.choiceA, B: ev.choiceB, C: ev.choiceC, D: ev.choiceD ?? "" };
  const hintMap: Record<string, ChoiceHint> = {};
  (sl.choiceHints ?? []).forEach(h => { hintMap[h.choice] = h; });
  const voted = !!sl.myVote;

  const voteMutation = useMutation({
    mutationFn: ({ choice }: { choice: string }) =>
      apiRequest("POST", `/api/leagues/${leagueId}/storylines/events/${ev.id}/vote`, { choice }),
    onSuccess: () => {
      setPendingChoice(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
    },
  });

  const resolvedEvents = sl.allEvents.filter(e => e.resolvedChoice).sort((a, b) => a.week - b.week);

  return (
    <div
      className={`rounded-xl border overflow-hidden ${sl.isHighInterest ? "border-gold/50 shadow-lg shadow-gold/10" : "border-border/60"}`}
      style={{ background: sl.isHighInterest ? "linear-gradient(135deg, rgba(212,175,55,0.06) 0%, transparent 60%)" : "hsl(var(--card))" }}
      data-testid={`card-storyline-${sl.id}`}
    >
      {/* High-interest banner */}
      {sl.isHighInterest && (
        <div className="px-4 py-1.5 bg-gradient-to-r from-gold/20 via-gold/8 to-transparent flex items-center gap-2 border-b border-gold/20">
          <Crown className="w-3 h-3 text-gold" />
          <span className="text-xs text-gold tracking-[0.2em]">FEATURED EVALUATION</span>
        </div>
      )}

      {/* Chapter header bar */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Vote className="w-3.5 h-3.5 text-gold animate-pulse" />
          <span className="text-xs font-semibold text-gold">CHAPTER {ev.week} OPEN</span>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
        {voted && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Voted {sl.myVote}
          </span>
        )}
      </div>

      {/* Recruit identity row */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`w-14 h-14 rounded-xl border overflow-hidden flex-shrink-0 ${sl.isHighInterest ? "border-gold/40" : "border-border/40"}`}>
          <PlayerPortrait
            skinTone={r?.skinTone ?? "light"} hairColor={r?.hairColor ?? "brown"}
            hairStyle={r?.hairStyle ?? "short"} facialHair={r?.facialHair ?? "none"}
            eyeStyle={r?.eyeStyle || undefined} eyebrowStyle={r?.eyebrowStyle || undefined}
            mouthStyle={r?.mouthStyle || undefined} eyeBlack={r?.eyeBlack ? true : undefined}
            playerId={r?.id} isRecruit={true} className="w-full h-full"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {r && (
              <Link href={`/league/${leagueId}/recruit/${r.id}`}>
                <span className="font-bold text-gold hover:underline text-sm leading-tight" data-testid={`link-recruit-${r.id}`}>
                  {r.firstName} {r.lastName}
                </span>
              </Link>
            )}
            {r?.isBlueChip && <Flame className="w-3 h-3 text-blue-400" />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {r && <span className="text-xs text-muted-foreground">{r.position} · {r.homeState}</span>}
            {r && <StarRating rating={r.starRank} size="sm" />}
          </div>
          <div className="mt-1.5">
            <ArcProgressBar stage={sl.currentArcStage} total={sl.totalArcEvents} isHighInterest={sl.isHighInterest} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {sl.resolvedOvrDelta !== 0 && <OvrPill delta={sl.resolvedOvrDelta} />}
          <div className="text-right">
            <MoodMeter mood={sl.moodHint} />
          </div>
        </div>
      </div>

      {/* Scouting category label */}
      <div className="mx-4 mb-2 px-3 py-1.5 rounded-lg bg-muted/20 border border-border/30 flex items-center gap-2">
        <BookOpen className="w-3 h-3 text-gold flex-shrink-0" />
        <span className="text-xs text-gold">{sl.publicStoryLabel}</span>
        <span className="ml-auto text-xs text-muted-foreground/60 flex-shrink-0">{sl.publicArcStatus}</span>
      </div>

      {/* Story event text */}
      <div className="px-4 pb-3">
        <p className="text-xs leading-relaxed text-foreground/85">{ev.eventText}</p>
      </div>

      {/* Choice cards */}
      <div className="px-4 pb-3 space-y-2">
        {choices.map(c => {
          const cc = CHOICE_COLORS[c];
          const hint = hintMap[c];
          const isSelected = pendingChoice === c;
          const isMyVote = sl.myVote === c;
          const disabled = voted || voteMutation.isPending;
          return (
            <button
              key={c}
              onClick={() => !voted && setPendingChoice(isSelected ? null : c)}
              disabled={disabled}
              className={`w-full text-left rounded-lg border transition-all p-3 ${
                isMyVote
                  ? `${cc.active} ${cc.border}`
                  : isSelected
                  ? `${cc.active} ${cc.border}`
                  : voted
                  ? "border-border/20 bg-muted/10 opacity-40"
                  : `${cc.border} bg-muted/10 hover:bg-muted/20`
              }`}
              data-testid={`button-vote-${c}-${ev.id}`}
              style={{ minHeight: "56px" }}
            >
              <div className="flex items-start gap-2.5">
                <span className={`font-display text-base font-bold font-bold flex-shrink-0 leading-none ${isSelected || isMyVote ? cc.label : "text-muted-foreground"}`}>{c}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-snug ${isSelected || isMyVote ? "text-foreground" : "text-foreground/80"}`}>{choiceText[c]}</p>
                  {hint && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${RISK_COLORS[hint.riskLevel]}`}>
                        {hint.riskLevel.toUpperCase()} RISK
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${REWARD_COLORS[hint.rewardLevel]}`}>
                        {hint.rewardLevel.toUpperCase()} REWARD
                      </span>
                      <span className="text-xs text-muted-foreground italic truncate">{hint.flavor}</span>
                    </div>
                  )}
                </div>
                {isMyVote && <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Submit / vote bar */}
      {!voted ? (
        <div className="px-4 pb-4">
          <button
            onClick={() => pendingChoice && voteMutation.mutate({ choice: pendingChoice })}
            disabled={!pendingChoice || voteMutation.isPending}
            className={`w-full py-3 rounded-lg border text-xs font-semibold transition-all ${
              pendingChoice
                ? "border-gold bg-gold/10 text-gold hover:bg-gold/20 active:bg-gold/30"
                : "border-border/30 bg-muted/10 text-muted-foreground/40 cursor-not-allowed"
            }`}
            data-testid={`button-submit-vote-${ev.id}`}
            style={{ minHeight: "48px" }}
          >
            {voteMutation.isPending ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</span>
            ) : pendingChoice ? `SUBMIT VOTE — CHOICE ${pendingChoice}` : "SELECT A CHOICE ABOVE"}
          </button>
        </div>
      ) : totalVotes > 0 ? (
        <div className="px-4 pb-4 pt-1">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart2 className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">LIVE VOTE DISTRIBUTION</span>
          </div>
          <VoteBar counts={sl.voteCounts} total={totalVotes} myVote={sl.myVote} />
        </div>
      ) : null}

      {/* Arc history (collapsible) */}
      {resolvedEvents.length > 0 && (
        <div className="border-t border-border/20 px-4 py-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition-colors"
            data-testid={`button-timeline-${sl.id}`}
          >
            <History className="w-3 h-3" />
            {showHistory ? "Hide" : "Show"} arc history ({resolvedEvents.length})
            {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {showHistory && <ArcTimeline events={resolvedEvents} />}
        </div>
      )}
    </div>
  );
}

// ── Arc Timeline ──────────────────────────────────────────────────────────────

function ArcTimeline({ events }: { events: StorylineEventFull[] }) {
  return (
    <div className="mt-3 space-y-3" data-testid="arc-timeline">
      {events.map((e, idx) => {
        const wc = e.resolvedChoice;
        const wcText = wc === "A" ? e.choiceA : wc === "B" ? e.choiceB : wc === "C" ? e.choiceC : (e.choiceD ?? "");
        const cc = wc ? CHOICE_COLORS[wc] : null;
        const prevArc = idx > 0 ? events[idx - 1].archetypeAtEvent : null;
        const arcShift = prevArc && e.archetypeAtEvent && prevArc !== e.archetypeAtEvent;
        return (
          <div key={e.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                e.ovrDelta && e.ovrDelta > 0 ? "border-green-500/50 bg-green-500/10" :
                e.ovrDelta && e.ovrDelta < 0 ? "border-red-500/50 bg-red-500/10" :
                "border-border/50 bg-muted/20"
              }`}>
                <span className="text-xs">{idx + 1}</span>
              </div>
              {idx < events.length - 1 && <div className="w-px h-4 bg-border/30 my-0.5" />}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-muted-foreground">Wk {e.week}</span>
                {e.ovrDelta !== null && e.ovrDelta !== 0 && <OvrPill delta={e.ovrDelta} />}
                {arcShift && (
                  <span className="text-xs text-amber-400 flex items-center gap-0.5">
                    <GitBranch className="w-2.5 h-2.5" /> Arc shift
                  </span>
                )}
              </div>
              {wc && wcText && cc && (
                <p className="text-xs text-foreground/80 leading-snug">
                  <span className={`text-xs font-semibold mr-1.5 ${cc.label}`}>{wc}.</span>{wcText}
                </p>
              )}
              {e.resolvedOutcomeText && (
                <p className="text-xs text-muted-foreground/70 italic mt-0.5">"{e.resolvedOutcomeText}"</p>
              )}
              {e.resolvedAbilityGain && (
                <div className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded border text-xs ${
                  e.resolvedAbilityTier === "gold" ? "bg-amber-500/10 border-amber-400/30 text-amber-300" :
                  e.resolvedAbilityTier === "red" ? "bg-red-500/10 border-red-400/30 text-red-300" :
                  "bg-blue-500/10 border-blue-400/30 text-blue-300"
                }`}>
                  <Sparkles className="w-2.5 h-2.5" /> {e.resolvedAbilityGain}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Arc Card (non-vote state) ─────────────────────────────────────────────────

function ArcCard({ sl, leagueId }: { sl: StorylineRecruit; leagueId: string }) {
  const [expanded, setExpanded] = useState(false);
  const r = sl.recruit;
  const resolvedEvents = sl.allEvents.filter(e => e.resolvedChoice).sort((a, b) => a.week - b.week);
  const isCommitted = r?.stage === "signed" || r?.stage === "committed";
  const isComplete = sl.currentArcStage >= sl.totalArcEvents && sl.totalArcEvents > 0;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        sl.isHighInterest ? "border-gold/40" :
        isCommitted ? "border-green-500/30" :
        isComplete ? "border-muted-foreground/30" :
        "border-border/40"
      }`}
      style={{ background: "hsl(var(--card))" }}
      data-testid={`card-arc-${sl.id}`}
    >
      {sl.isHighInterest && (
        <div className="px-3 py-1 bg-gradient-to-r from-gold/15 to-transparent flex items-center gap-1.5 border-b border-gold/20">
          <Crown className="w-2.5 h-2.5 text-gold" />
          <span className="text-xs text-gold tracking-widest">FEATURED</span>
        </div>
      )}
      {isCommitted && (
        <div className="px-3 py-1 bg-green-500/10 flex items-center gap-1.5 border-b border-green-500/20">
          <CheckCircle className="w-2.5 h-2.5 text-green-400" />
          <span className="text-xs text-green-400">
            COMMITTED{r?.signedTeamAbbreviation ? ` — ${r.signedTeamAbbreviation}` : ""}
          </span>
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-11 h-11 rounded-lg border overflow-hidden flex-shrink-0 ${sl.isHighInterest ? "border-gold/30" : "border-border/30"}`}>
            <PlayerPortrait
              skinTone={r?.skinTone ?? "light"} hairColor={r?.hairColor ?? "brown"}
              hairStyle={r?.hairStyle ?? "short"} facialHair={r?.facialHair ?? "none"}
              eyeStyle={r?.eyeStyle || undefined} eyebrowStyle={r?.eyebrowStyle || undefined}
              mouthStyle={r?.mouthStyle || undefined} eyeBlack={r?.eyeBlack ? true : undefined}
              playerId={r?.id} isRecruit={true} className="w-full h-full"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {r && (
                <Link href={`/league/${leagueId}/recruit/${r.id}`}>
                  <span className="font-semibold text-gold hover:underline text-[13px]">{r.firstName} {r.lastName}</span>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {r && <span className="text-xs text-muted-foreground">{r.position} · {r.homeState}</span>}
              {r && <StarRating rating={r.starRank} size="sm" />}
            </div>
            <ArcProgressBar stage={sl.currentArcStage} total={sl.totalArcEvents} isHighInterest={sl.isHighInterest} />
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            {sl.resolvedOvrDelta !== 0 && <OvrPill delta={sl.resolvedOvrDelta} />}
            <span className="text-xs text-muted-foreground">{sl.publicStoryLabel.slice(0, 14)}</span>
          </div>
        </div>

        {/* Mood + impact row */}
        <div className="mt-2 flex items-center gap-4">
          <div className="flex-1">
            <MoodMeter mood={sl.moodHint} />
          </div>
          {sl.recruitingImpactHint && (
            <span className={`text-xs px-1.5 py-0.5 rounded border ${
              sl.recruitingImpactHint === "high impact" ? "text-gold border-gold/30 bg-gold/10" :
              sl.recruitingImpactHint === "low impact" ? "text-muted-foreground border-border/30 bg-muted/10" :
              "text-blue-400 border-blue-400/30 bg-blue-400/10"
            }`}>{sl.recruitingImpactHint.toUpperCase()}</span>
          )}
        </div>

        {/* Waiting / complete status */}
        {isComplete && !sl.activeEvent && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Trophy className="w-3 h-3 text-gold" />
            <span className="font-sans font-semibold">Arc complete</span>
            {sl.resolvedOvrDelta !== 0 && <OvrPill delta={sl.resolvedOvrDelta} />}
          </div>
        )}
        {!isComplete && !sl.activeEvent && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Advance week for next chapter</span>
          </div>
        )}

        {/* Timeline toggle */}
        {resolvedEvents.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-gold transition-colors"
            data-testid={`button-timeline-${sl.id}`}
          >
            <History className="w-2.5 h-2.5" />
            {expanded ? "Hide" : "Show"} history ({resolvedEvents.length})
            {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
          </button>
        )}
        {expanded && <ArcTimeline events={resolvedEvents} />}
      </div>
    </div>
  );
}

// ── Weekly Headline Feed ──────────────────────────────────────────────────────

function WeeklyHeadlines({ storylines }: { storylines: StorylineRecruit[] }) {
  const headlines = storylines
    .flatMap(sl =>
      sl.allEvents
        .filter(e => e.resolvedChoice)
        .map(e => ({ sl, event: e }))
    )
    .sort((a, b) => b.event.week - a.event.week)
    .slice(0, 12);

  if (headlines.length === 0) return null;

  return (
    <div data-testid="section-headlines">
      <div className="flex items-center gap-2 mb-2">
        <Radio className="w-3.5 h-3.5 text-gold" />
        <span className="text-xs font-semibold text-gold">RECENT DISPATCHES</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
        {headlines.map(({ sl, event }) => {
          const r = sl.recruit;
          const wc = event.resolvedChoice;
          const wcText = wc === "A" ? event.choiceA : wc === "B" ? event.choiceB : wc === "C" ? event.choiceC : (event.choiceD ?? "");
          const cc = wc ? CHOICE_COLORS[wc] : null;
          return (
            <div
              key={event.id}
              className="flex-shrink-0 w-52 snap-start rounded-xl border border-border/40 bg-muted/10 p-3"
              style={{ minWidth: "208px" }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs text-muted-foreground">WK {event.week}</span>
                {event.ovrDelta !== null && event.ovrDelta !== 0 && <OvrPill delta={event.ovrDelta} />}
                {sl.isHighInterest && <Crown className="w-2.5 h-2.5 text-gold" />}
              </div>
              <p className="text-xs font-semibold text-foreground/90 leading-snug mb-1">
                {r?.firstName} {r?.lastName}
              </p>
              {wc && wcText && cc && (
                <p className="text-xs text-muted-foreground leading-snug">
                  <span className={`${cc.label}`}>{wc}.</span> {wcText.slice(0, 60)}{wcText.length > 60 ? "…" : ""}
                </p>
              )}
              {event.resolvedAbilityGain && (
                <div className={`inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded border text-xs ${
                  event.resolvedAbilityTier === "gold" ? "bg-amber-500/10 border-amber-400/30 text-amber-300" :
                  "bg-blue-500/10 border-blue-400/30 text-blue-300"
                }`}>
                  <Sparkles className="w-2 h-2" /> {event.resolvedAbilityGain}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// CompetingPrograms removed — displaying featured team names in public feed
// would reveal which specific programs are recruiting storyline prospects,
// leaking competitive intel and potentially spoiling gem/bust identity.
// The section has been removed to preserve fog of war.

// ── Completed Arc Recap ───────────────────────────────────────────────────────

function CompletedArcsRecap({ storylines }: { storylines: StorylineRecruit[] }) {
  const completed = storylines.filter(sl =>
    sl.currentArcStage >= sl.totalArcEvents && sl.totalArcEvents > 0
  );
  if (completed.length === 0) return null;

  return (
    <div data-testid="section-completed-arcs">
      <div className="flex items-center gap-2 mb-2">
        <Award className="w-3.5 h-3.5 text-gold" />
        <span className="text-xs font-semibold text-gold">COMPLETED ARCS</span>
        <span className="text-xs text-muted-foreground">{completed.length} recruit{completed.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-1.5">
        {completed.map(sl => {
          const r = sl.recruit;
          const abilities = sl.allEvents.filter(e => e.resolvedAbilityGain).map(e => e.resolvedAbilityGain);
          return (
            <div key={sl.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${
              sl.isHighInterest ? "border-gold/30 bg-gold/5" : "border-border/30 bg-muted/10"
            }`}>
              {sl.isHighInterest && <Crown className="w-3 h-3 text-gold flex-shrink-0" />}
              {!sl.isHighInterest && <Trophy className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
              <Link href={`/league/${sl.leagueId}/recruit/${r?.id ?? ""}`} className="text-xs font-semibold hover:text-gold flex-1 truncate">
                {r?.firstName} {r?.lastName}
              </Link>
              <span className="text-xs text-muted-foreground flex-shrink-0">{r?.position}</span>
              {r && <StarRating rating={r.starRank} size="sm" />}
              {sl.resolvedOvrDelta !== 0 && <OvrPill delta={sl.resolvedOvrDelta} />}
              {abilities.length > 0 && (
                <span className="text-xs text-blue-300 flex-shrink-0 flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5" /> {abilities.length}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── High-Interest Spotlight ───────────────────────────────────────────────────

function LegendarySpotlight({ storylines, leagueId }: { storylines: StorylineRecruit[]; leagueId: string }) {
  const legends = storylines.filter(sl => sl.isHighInterest);
  if (legends.length === 0) return null;

  return (
    <div data-testid="section-legendary-spotlight">
      <div className="flex items-center gap-2 mb-3">
        <Crown className="w-3.5 h-3.5 text-gold" />
        <span className="text-xs font-semibold text-gold">HIGH-INTEREST STORYLINES</span>
        <span className="text-xs font-semibold bg-gold/20 text-gold border border-gold/40 px-1.5 py-0.5 rounded animate-pulse">
          {legends.length}
        </span>
      </div>
      <div className="space-y-3">
        {legends.map(sl => {
          const r = sl.recruit;
          return (
            <div
              key={sl.id}
              className="rounded-xl border border-gold/50 overflow-hidden"
              style={{ background: "linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.02) 100%)" }}
            >
              <div className="p-4 flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border border-gold/40 overflow-hidden flex-shrink-0">
                  <PlayerPortrait
                    skinTone={r?.skinTone ?? "light"} hairColor={r?.hairColor ?? "brown"}
                    hairStyle={r?.hairStyle ?? "short"} facialHair={r?.facialHair ?? "none"}
                    eyeStyle={r?.eyeStyle || undefined} eyebrowStyle={r?.eyebrowStyle || undefined}
                    mouthStyle={r?.mouthStyle || undefined} eyeBlack={r?.eyeBlack ? true : undefined}
                    playerId={r?.id} isRecruit={true} className="w-full h-full"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Crown className="w-3 h-3 text-gold/70" />
                    <span className="text-xs font-semibold tracking-widest text-gold/80">
                      {sl.publicStoryLabel.toUpperCase()}
                    </span>
                  </div>
                  {r && (
                    <Link href={`/league/${leagueId}/recruit/${r.id}`}>
                      <p className="font-bold text-gold text-base hover:underline mt-0.5">{r.firstName} {r.lastName}</p>
                    </Link>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {r && <span className="text-xs text-muted-foreground">{r.position} · {r.homeState}</span>}
                    {r && <StarRating rating={r.starRank} size="sm" />}
                  </div>
                  <div className="mt-2">
                    <ArcProgressBar stage={sl.currentArcStage} total={sl.totalArcEvents} isHighInterest={true} />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {sl.resolvedOvrDelta !== 0 && <OvrPill delta={sl.resolvedOvrDelta} />}
                  <div className="mt-1">
                    <MoodMeter mood={sl.moodHint} />
                  </div>
                </div>
              </div>
              <div className="px-4 pb-3">
                <p className="text-xs text-muted-foreground italic">{sl.publicArcFlavor}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-xs text-gold">{sl.publicArcStatus}</span>
                  {sl.activeEvent && (
                    <span className="ml-auto text-xs bg-gold/20 text-gold border border-gold/40 px-1.5 py-0.5 rounded animate-pulse">
                      EVALUATION WINDOW
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Commissioner Health Panel ─────────────────────────────────────────────────

function HealthPanel({ leagueId }: { leagueId: string }) {
  const queryClient = useQueryClient();

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthReport>({
    queryKey: ["/api/leagues", leagueId, "storylines", "health"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/storylines/health`, { credentials: "include" });
      if (!res.ok) throw new Error("Health check failed");
      return res.json();
    },
  });

  const repairMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${leagueId}/storylines/health/repair`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
      refetchHealth();
    },
  });

  const legacyRepairMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${leagueId}/storylines/repair`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
      refetchHealth();
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${leagueId}/storylines/generate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "storylines"] });
    },
  });

  const severityIcon = (s: string) => {
    if (s === "error") return <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />;
    if (s === "warning") return <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />;
    return <Info className="w-3 h-3 text-blue-400 flex-shrink-0" />;
  };

  return (
    <div className="space-y-4" data-testid="section-health-panel">
      {/* Health status card */}
      <div className={`rounded-xl border p-4 ${
        healthLoading ? "border-border/40" :
        health?.healthy ? "border-green-500/40 bg-green-500/5" :
        "border-red-500/40 bg-red-500/5"
      }`}>
        <div className="flex items-center gap-2 mb-3">
          <HeartPulse className={`w-4 h-4 ${health?.healthy ? "text-green-400" : "text-red-400"}`} />
          <span className="text-xs font-semibold text-gold">STORYLINE HEALTH</span>
          {health && (
            <span className={`ml-auto text-xs px-1.5 py-0.5 rounded border ${
              health.healthy ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-red-400 border-red-500/30 bg-red-500/10"
            }`}>
              {health.healthy ? "HEALTHY" : "ISSUES DETECTED"}
            </span>
          )}
        </div>

        {healthLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {health && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "ARCS", value: health.summary.storylineCount },
                { label: "EVENTS", value: health.summary.totalEventsGenerated },
                { label: "STALE", value: health.summary.staleEvents, alert: health.summary.staleEvents > 0 },
              ].map(s => (
                <div key={s.label} className="text-center bg-muted/20 rounded-lg px-2 py-2">
                  <div className={`text-lg font-bold ${s.alert ? "text-amber-400" : "text-foreground"}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Issues */}
            {health.issues.length === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle className="w-3.5 h-3.5" /> All systems nominal
              </div>
            ) : (
              <div className="space-y-2">
                {health.issues.map((issue, i) => (
                  <div key={i} className={`p-2.5 rounded-lg border text-xs ${
                    issue.severity === "error" ? "border-red-500/30 bg-red-500/8" :
                    issue.severity === "warning" ? "border-amber-500/30 bg-amber-500/8" :
                    "border-blue-500/30 bg-blue-500/8"
                  }`}>
                    <div className="flex items-center gap-1.5">
                      {severityIcon(issue.severity)}
                      <span className="text-xs font-semibold text-muted-foreground">{issue.code}</span>
                    </div>
                    <p className="mt-0.5 text-foreground/80 leading-snug">{issue.message}</p>
                    {issue.detail && <p className="mt-0.5 text-muted-foreground/70 text-xs leading-snug">{issue.detail}</p>}
                  </div>
                ))}
              </div>
            )}

            {health.checkedAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Checked {new Date(health.checkedAt).toLocaleTimeString()}
              </p>
            )}
          </>
        )}
      </div>

      {/* Admin actions */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="w-3.5 h-3.5 text-gold" />
          <span className="text-xs font-semibold text-gold">ADMIN ACTIONS</span>
        </div>

        <button
          onClick={() => refetchHealth()}
          disabled={healthLoading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-border/50 bg-muted/20 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-all"
          data-testid="button-health-check"
          style={{ minHeight: "44px" }}
        >
          <HeartPulse className="w-3.5 h-3.5" /> Run Health Check
        </button>

        {health && !health.healthy && (
          <button
            onClick={() => repairMutation.mutate()}
            disabled={repairMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-400 hover:bg-amber-500/15 transition-all"
            data-testid="button-auto-repair"
            style={{ minHeight: "44px" }}
          >
            {repairMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
            Auto-Repair Issues ({health.issues.filter(i => i.severity === "error").length} error{health.issues.filter(i => i.severity === "error").length !== 1 ? "s" : ""})
          </button>
        )}

        <button
          onClick={() => legacyRepairMutation.mutate()}
          disabled={legacyRepairMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-border/40 bg-muted/10 text-xs text-muted-foreground hover:text-gold hover:border-gold/30 transition-all"
          data-testid="button-repair-storylines"
          style={{ minHeight: "44px" }}
        >
          {legacyRepairMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Initialize Missing Arcs
        </button>

        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-border/40 bg-muted/10 text-xs text-muted-foreground hover:text-gold hover:border-gold/30 transition-all"
          data-testid="button-generate-events"
          style={{ minHeight: "44px" }}
        >
          {generateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Generate Storyline Events
        </button>
      </div>
    </div>
  );
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type Tab = "vote" | "arcs" | "intel" | "command";

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StorylinesPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("vote");

  const { data: authData } = useQuery<{ id: string }>({ queryKey: ["/api/auth/me"] });

  const { data: leagueData } = useQuery<LeagueData>({
    queryKey: ["/api/leagues", leagueId],
    enabled: !!leagueId,
  });

  const isCommissioner = !!(
    authData?.id && leagueData &&
    (leagueData.commissionerId === authData.id ||
      (leagueData.coCommissionerIds ?? []).includes(authData.id))
  );

  const { data: storylinesResp, isLoading } = useQuery<{ storylines: StorylineRecruit[] }>({
    queryKey: ["/api/leagues", leagueId, "storylines"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/storylines`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch storylines");
      const json = await res.json();
      return Array.isArray(json) ? { storylines: json } : json;
    },
    refetchInterval: 30_000,
  });

  const storylines = storylinesResp?.storylines ?? [];

  // Derived counts
  const activeVotes = storylines.filter(s => s.activeEvent && !s.myVote).length;
  const totalVotes = storylines.filter(s => s.activeEvent).length;
  const featuredCount = storylines.filter(s => s.isHighInterest).length;
  const committedCount = storylines.filter(s => s.recruit?.stage === "signed" || s.recruit?.stage === "committed").length;
  const completedCount = storylines.filter(s => s.currentArcStage >= s.totalArcEvents && s.totalArcEvents > 0).length;

  // Split storylines
  const withVotes = storylines.filter(s => !!s.activeEvent).sort((a, b) => {
    if (a.isHighInterest && !b.isHighInterest) return -1;
    if (!a.isHighInterest && b.isHighInterest) return 1;
    const aVoted = a.myVote ? 1 : 0;
    const bVoted = b.myVote ? 1 : 0;
    return aVoted - bVoted;
  });
  const withoutVotes = storylines.filter(s => !s.activeEvent).sort((a, b) => {
    if (a.isHighInterest && !b.isHighInterest) return -1;
    if (!a.isHighInterest && b.isHighInterest) return 1;
    return (b.currentArcStage - a.currentArcStage);
  });

  // Auto-switch to vote tab if votes are pending
  const defaultTab: Tab = activeVotes > 0 ? "vote" : "arcs";

  // Tab bar definition
  const tabs: { id: Tab; label: string; badge?: number | string; badgeGold?: boolean }[] = [
    { id: "vote",    label: "VOTE",    badge: totalVotes > 0 ? totalVotes : undefined, badgeGold: true },
    { id: "arcs",    label: "ARCS",    badge: storylines.length > 0 ? storylines.length : undefined },
    { id: "intel",   label: "INTEL" },
    ...(isCommissioner ? [{ id: "command" as Tab, label: "CMD" }] : []),
  ];

  const currentTab = activeTab;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/40">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-0">
          {/* Back + title row */}
          <div className="flex items-center gap-3 mb-3">
            <Link href={`/league/${leagueId}`}>
              <button className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back-storylines">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-[0.8125rem] font-semibold text-gold">STORYLINE HUB</h1>
                {leagueData && (
                  <span className="text-xs text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">
                    S{leagueData.currentSeason} · WK{leagueData.currentWeek}
                  </span>
                )}
                {activeVotes > 0 && (
                  <span className="ml-auto text-xs bg-gold/20 text-gold border border-gold/40 px-1.5 py-0.5 rounded animate-pulse">
                    {activeVotes} VOTE{activeVotes !== 1 ? "S" : ""} NEEDED
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
              { label: "ARCS",      value: storylines.length, color: "" },
              { label: "OPEN",      value: totalVotes,         color: totalVotes > 0 ? "text-gold" : "" },
              { label: "SIGNED",    value: committedCount,     color: committedCount > 0 ? "text-green-400" : "" },
              { label: "DONE",      value: completedCount,     color: completedCount > 0 ? "text-muted-foreground" : "" },
            ].map(s => (
              <div key={s.label} className="text-center bg-muted/20 rounded-lg py-1.5 px-1">
                <div className={`text-base font-bold leading-tight ${s.color || "text-foreground"}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-border/40 -mx-4 px-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs transition-all border-b-2 -mb-px ${
                  currentTab === tab.id
                    ? "border-gold text-gold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${tab.id}`}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className={`rounded px-1 py-px text-xs border ${
                    tab.badgeGold && Number(tab.badge) > 0
                      ? "bg-gold/20 text-gold border-gold/40"
                      : "bg-muted/30 text-muted-foreground border-border/30"
                  }`}>{tab.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-4 py-4">

        {/* VOTE tab */}
        {currentTab === "vote" && (
          <div className="space-y-4" data-testid="section-vote-center">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)
            ) : withVotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle className="w-12 h-12 text-green-400/30 mb-4" />
                <h3 className="text-xs font-semibold text-gold mb-2">ALL CAUGHT UP</h3>
                <p className="text-xs text-muted-foreground max-w-xs">
                  No open votes right now.{" "}
                  {withoutVotes.length > 0
                    ? "Check the ARCS tab for recruit status."
                    : "Advance the week to generate new storyline events."}
                </p>
                {withoutVotes.length > 0 && (
                  <button
                    onClick={() => setActiveTab("arcs")}
                    className="mt-4 text-xs text-gold border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-all"
                  >
                    VIEW ARCS →
                  </button>
                )}
              </div>
            ) : (
              <>
                {withVotes.some(s => !s.myVote) && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/30 bg-gold/5">
                    <Vote className="w-3.5 h-3.5 text-gold" />
                    <span className="text-xs text-gold">{activeVotes} vote{activeVotes !== 1 ? "s" : ""} pending your decision</span>
                  </div>
                )}
                {withVotes.map(sl => <VoteCard key={sl.id} sl={sl} leagueId={leagueId!} />)}
              </>
            )}
          </div>
        )}

        {/* ARCS tab */}
        {currentTab === "arcs" && (
          <div className="space-y-5" data-testid="section-arcs">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
            ) : storylines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground/20 mb-4" />
                <h3 className="text-xs font-semibold text-gold mb-2">NO STORYLINES YET</h3>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Storyline recruits are assigned when a recruiting class is created. Advance the week to see their stories unfold.
                </p>
                {isCommissioner && (
                  <button
                    onClick={() => setActiveTab("command")}
                    className="mt-4 text-xs text-gold border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-all"
                  >
                    REPAIR IN COMMAND →
                  </button>
                )}
              </div>
            ) : (
              <>
                {featuredCount > 0 && <LegendarySpotlight storylines={storylines} leagueId={leagueId!} />}
                {completedCount > 0 && <CompletedArcsRecap storylines={storylines} />}
                {withoutVotes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">ACTIVE ARCS</span>
                      <span className="text-xs text-muted-foreground/60">{withoutVotes.length}</span>
                    </div>
                    <div className="space-y-3">
                      {withoutVotes.map(sl => <ArcCard key={sl.id} sl={sl} leagueId={leagueId!} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* INTEL tab */}
        {currentTab === "intel" && (
          <div className="space-y-6" data-testid="section-intel">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
            ) : (
              <>
                <WeeklyHeadlines storylines={storylines} />

                {/* Commitment status */}
                {committedCount > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-xs font-semibold text-gold">COMMITTED</span>
                      <span className="text-xs text-green-400">{committedCount}</span>
                    </div>
                    <div className="space-y-1.5">
                      {storylines.filter(s => s.recruit?.stage === "signed" || s.recruit?.stage === "committed").map(sl => {
                        const r = sl.recruit;
                        return (
                          <div key={sl.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-green-500/25 bg-green-500/8">
                            <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                            <Link href={`/league/${sl.leagueId}/recruit/${r?.id ?? ""}`} className="text-xs font-semibold hover:text-gold flex-1 truncate">
                              {r?.firstName} {r?.lastName}
                            </Link>
                            <span className="text-xs text-muted-foreground">{r?.position}</span>
                            {r && <StarRating rating={r.starRank} size="sm" />}
                            {r?.signedTeamAbbreviation && (
                              <Badge
                                className="text-xs text-white no-default-hover-elevate no-default-active-elevate"
                                style={{ backgroundColor: r.signedTeamPrimaryColor || "#666" }}
                              >
                                {r.signedTeamAbbreviation}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {storylines.length === 0 && (
                  <div className="py-12 text-center">
                    <Eye className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
                    <p className="text-xs text-muted-foreground">No intel available yet — generate storyline events to see data here.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* COMMAND tab (commissioner only) */}
        {currentTab === "command" && isCommissioner && (
          <HealthPanel leagueId={leagueId!} />
        )}
        {currentTab === "command" && !isCommissioner && (
          <div className="py-16 text-center">
            <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">Commissioner or co-commissioner access required.</p>
          </div>
        )}
      </div>
    </div>
  );
}
