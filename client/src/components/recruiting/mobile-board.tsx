import { useState, useMemo } from "react";
import {
  Target, Flame, Users, ClipboardList, Star as StarIcon,
  TrendingUp, TrendingDown, Minus, Search, AlertTriangle, X,
  Eye, Phone, Mail, GraduationCap, Crown, Building2, Skull, Gem,
  ChevronRight, ChevronDown, ChevronUp, Loader2, Zap, DollarSign, Check,
} from "lucide-react";
import { StarRating } from "@/components/ui/star-rating";
import { PositionBadge } from "@/components/ui/position-badge";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroButton } from "@/components/ui/retro-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RecruitingEconomy } from "@/hooks/use-recruiting";
import {
  getInterestLabel,
  getInterestBarColor,
  RECOMMENDED_ACTION_META,
  type RecruitRecommendation,
} from "@/lib/recruitingUtils";
import type {
  RecruitWithInterest,
  PipelineData,
  TrendsData,
  WeekRecapData,
  DecommitAlert,
  RecruitingHistoryData,
  BattlesData,
  BattleRecruit,
  CommitAnnouncement,
} from "@/hooks/use-recruiting";
import { DramaChips, MovementIndicator, RivalryAlertBadge } from "./drama-chips";

type TabKey = "board" | "targets" | "battles" | "needs" | "recap";

const PITCH_TOPICS = [
  { key: "playingTime", label: "Playing Time" },
  { key: "academics",   label: "Academics" },
  { key: "prestige",    label: "Prestige" },
  { key: "facilities",  label: "Facilities" },
  { key: "collegeLife", label: "College Life" },
] as const;

const STAGE_BADGE: Record<string, { label: string; textColor: string; borderColor: string }> = {
  open:   { label: "Open",   textColor: "text-gray-400",    borderColor: "border-gray-500/40" },
  top8:   { label: "Top 8",  textColor: "text-blue-400",    borderColor: "border-blue-500/40" },
  top5:   { label: "Top 5",  textColor: "text-green-400",   borderColor: "border-green-500/40" },
  top3:   { label: "Top 3",  textColor: "text-yellow-400",  borderColor: "border-yellow-500/40" },
  verbal: { label: "Verbal", textColor: "text-amber-400",   borderColor: "border-amber-500/40" },
  signed: { label: "Signed", textColor: "text-gold",        borderColor: "border-gold/40" },
};

// ── Action availability helpers ──────────────────────────────────────────────

interface ActionState {
  premiumActionsUsed: Record<string, string[]>;
  weeklyActionsUsed: Record<string, string[]>;
  remainingPoints: number;
  remainingScoutPoints: number;
  seasonVisitCount: { total: number; campusVisits: number; hcVisits: number };
  nilRemaining?: number;
  recruitPointCosts: Record<string, { visit: number; headCoachVisit: number }>;
  economy?: RecruitingEconomy;
}

function getDisabledReason(
  action: "scout" | "phone" | "email" | "visit" | "hcv" | "offer" | "target",
  recruit: RecruitWithInterest,
  state: ActionState
): string | null {
  const isSigned = recruit.stage === "signed";
  const isVerbal = recruit.stage === "verbal";

  if (isSigned) return "Already signed";

  const used = state.premiumActionsUsed?.[recruit.id] ?? [];
  const weekly = state.weeklyActionsUsed?.[recruit.id] ?? [];

  if (action === "scout") {
    const pct = recruit.interest?.scoutPercentage ?? 0;
    if (pct >= 100) return "Fully scouted";
    const scoutCap = state.economy?.scoutPoints?.cap;
    const scoutSpent = state.economy?.scoutPoints?.spent;
    if (scoutCap != null && scoutSpent != null && scoutSpent >= scoutCap) return "Scout pts exhausted";
    if (state.remainingScoutPoints <= 0) return "No scout points";
    return null;
  }

  if (action === "phone") {
    if (weekly.includes("phone")) return "Called this week";
    const contactCap = state.economy?.contactPoints?.cap;
    const contactSpent = state.economy?.contactPoints?.spent;
    if (contactCap != null && contactSpent != null && contactSpent >= contactCap) return "Contact pts exhausted";
    if (state.remainingPoints <= 0) return "No action points";
    return null;
  }

  if (action === "email") {
    if (weekly.includes("email")) return "Emailed this week";
    const contactCap = state.economy?.contactPoints?.cap;
    const contactSpent = state.economy?.contactPoints?.spent;
    if (contactCap != null && contactSpent != null && contactSpent >= contactCap) return "Contact pts exhausted";
    if (state.remainingPoints <= 0) return "No action points";
    return null;
  }

  if (action === "visit") {
    if (used.includes("visit")) return "Already visited";
    const visitCap = state.economy?.visits?.totalCap;
    const visitUsed = state.economy?.visits?.totalUsed ?? state.seasonVisitCount.total;
    if (visitCap != null && visitUsed >= visitCap) return `Visit cap reached (${visitCap})`;
    const cost = state.recruitPointCosts?.[recruit.id]?.visit ?? 2;
    if (state.remainingPoints < cost) return `Need ${cost} pts`;
    return null;
  }

  if (action === "hcv") {
    if (used.includes("head_coach_visit")) return "Already HCV'd";
    const hcvCap = state.economy?.visits?.totalCap;
    const visitUsed = state.economy?.visits?.totalUsed ?? state.seasonVisitCount.total;
    if (hcvCap != null && visitUsed >= hcvCap) return `Visit cap reached (${hcvCap})`;
    const cost = state.recruitPointCosts?.[recruit.id]?.headCoachVisit ?? 2;
    if (state.remainingPoints < cost) return `Need ${cost} pts`;
    return null;
  }

  if (action === "offer") {
    if (recruit.interest?.hasOffer) return "Offer already out";
    if (isVerbal) return "Already verbal";
    const nilCost = recruit.nilCost;
    const nilRem = state.economy?.nil?.recruitingRemaining ?? state.nilRemaining;
    if (nilCost && nilRem !== undefined && Math.ceil(nilCost * 1.25) > nilRem) {
      return "Over NIL budget";
    }
    return null;
  }

  if (action === "target") {
    return null;
  }

  return null;
}

// ── Disabled action button ───────────────────────────────────────────────────

function ActionBtn({
  icon,
  label,
  done,
  disabled,
  disabledReason,
  pending,
  onClick,
  colorClass,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  done?: boolean;
  disabled: boolean;
  disabledReason?: string | null;
  pending?: boolean;
  onClick: () => void;
  colorClass: string;
  testId?: string;
}) {
  const btn = (
    <button
      className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-medium py-1.5 rounded border transition-colors min-w-0 ${
        done
          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
          : disabled || pending
          ? "border-border/40 text-muted-foreground/40 cursor-not-allowed"
          : `${colorClass} hover:opacity-90 active:opacity-75`
      }`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && !pending) onClick();
      }}
      disabled={disabled || pending}
      data-testid={testId}
    >
      {pending ? (
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
      ) : done ? (
        <Check className="w-3 h-3 shrink-0" />
      ) : (
        <span className="shrink-0">{icon}</span>
      )}
      <span className="truncate">{done ? "Done" : label}</span>
    </button>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="top" className="text-[11px]">
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

// ── Mobile recruit card ──────────────────────────────────────────────────────

interface MobileRecruitCardProps {
  recruit: RecruitWithInterest;
  trend?: { trend: "up" | "down" | "flat"; recentGain: number };
  recommendation?: RecruitRecommendation;
  positionNeed?: boolean;
  isStoryline?: boolean;
  onSelect: () => void;
  actionState?: ActionState;
  onQuickPhone?: () => void;
  onQuickEmail?: () => void;
  onQuickScout?: () => void;
  onQuickVisit?: () => void;
  onQuickHcv?: () => void;
  onQuickOffer?: () => void;
  onQuickTarget?: () => void;
  isPending?: boolean;
  pendingAction?: string | null;
}

function MobileRecruitCard({
  recruit,
  trend,
  recommendation,
  positionNeed,
  isStoryline,
  onSelect,
  actionState,
  onQuickPhone,
  onQuickEmail,
  onQuickScout,
  onQuickVisit,
  onQuickHcv,
  onQuickOffer,
  onQuickTarget,
  isPending = false,
  pendingAction,
}: MobileRecruitCardProps) {
  const [expanded, setExpanded] = useState(false);
  const interest = recruit.interest;
  const interestLevel = interest?.interestLevel ?? 0;
  const scoutPct = interest?.scoutPercentage ?? 0;
  const { label: interestLabel, color: interestColor } = getInterestLabel(interestLevel);
  const barColor = getInterestBarColor(interestLevel);
  const stage = recruit.stage ?? "open";
  const isSigned = stage === "signed";
  const stageBadge = STAGE_BADGE[stage] ?? STAGE_BADGE.open;
  const isTargeted = recruit.interest?.isTargeted ?? false;
  const hasOffer = recruit.interest?.hasOffer ?? false;

  const ovrStr = (() => {
    const min = interest?.minOverall;
    const max = interest?.maxOverall;
    if (min == null && max == null) return "???";
    if (min === max || (min != null && max != null && max - min <= 5)) return `${min}`;
    return `${min}–${max}`;
  })();

  const yearLabel = recruit.recruitYear ?? "";

  const typeLabel = (() => {
    if (recruit.recruitType === "transfer") return "XFER";
    if (recruit.recruitType === "juco") return "JUCO";
    return null;
  })();

  const actionMeta = recommendation ? RECOMMENDED_ACTION_META[recommendation.action] : null;

  const TrendIcon = trend?.trend === "up"
    ? TrendingUp
    : trend?.trend === "down"
    ? TrendingDown
    : Minus;
  const trendColor = trend?.trend === "up"
    ? "text-green-400"
    : trend?.trend === "down"
    ? "text-red-400"
    : "text-muted-foreground";

  // Action availability
  const phoneDisabled = !actionState ? false : !!getDisabledReason("phone", recruit, actionState);
  const emailDisabled = !actionState ? false : !!getDisabledReason("email", recruit, actionState);
  const scoutDisabled = !actionState ? false : !!getDisabledReason("scout", recruit, actionState);
  const visitDisabled = !actionState ? false : !!getDisabledReason("visit", recruit, actionState);
  const hcvDisabled = !actionState ? false : !!getDisabledReason("hcv", recruit, actionState);
  const offerDisabled = !actionState ? false : !!getDisabledReason("offer", recruit, actionState);

  const phoneReason = actionState ? getDisabledReason("phone", recruit, actionState) : null;
  const emailReason = actionState ? getDisabledReason("email", recruit, actionState) : null;
  const scoutReason = actionState ? getDisabledReason("scout", recruit, actionState) : null;
  const visitReason = actionState ? getDisabledReason("visit", recruit, actionState) : null;
  const hcvReason = actionState ? getDisabledReason("hcv", recruit, actionState) : null;
  const offerReason = actionState ? getDisabledReason("offer", recruit, actionState) : null;

  const phonedThisWeek = actionState?.weeklyActionsUsed?.[recruit.id]?.includes("phone") ?? false;
  const emailedThisWeek = actionState?.weeklyActionsUsed?.[recruit.id]?.includes("email") ?? false;
  const alreadyVisited = actionState?.premiumActionsUsed?.[recruit.id]?.includes("visit") ?? false;
  const alreadyHcv = actionState?.premiumActionsUsed?.[recruit.id]?.includes("head_coach_visit") ?? false;
  const fullyScoutd = (scoutPct >= 100);

  const nilCost = recruit.nilCost;
  const nilAffordable = !actionState?.nilRemaining || !nilCost || Math.ceil(nilCost * 1.25) <= actionState.nilRemaining;

  return (
    <div
      className={`w-full bg-card border rounded-lg p-3 flex flex-col gap-2 transition-colors ${
        isStoryline
          ? "border-violet-500/40 shadow-[0_0_6px_rgba(139,92,246,0.2)]"
          : isSigned
          ? "border-gold/40 bg-gold/5"
          : positionNeed
          ? "border-red-500/30"
          : "border-border/60"
      }`}
      data-testid={`mobile-recruit-card-${recruit.id}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      {/* Row 1: Stars + rank + badges + trend + target indicator */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isTargeted && (
          <Target className="w-3 h-3 text-gold shrink-0" />
        )}
        {recruit.starRating > 0 ? (
          <StarRating rating={recruit.starRating} size="sm" />
        ) : (
          <span className="text-[10px] text-muted-foreground">Unrated</span>
        )}
        {recruit.classRank && (
          <span className="text-[10px] text-muted-foreground font-mono">#{recruit.classRank}</span>
        )}
        <PositionBadge position={recruit.position} />
        {yearLabel && (
          <span className="text-[10px] text-muted-foreground">{yearLabel}</span>
        )}
        {typeLabel && (
          <span className={`text-[10px] font-pixel px-1 rounded ${typeLabel === "XFER" ? "text-purple-300 bg-purple-500/15 border border-purple-500/30" : "text-cyan-300 bg-cyan-500/15 border border-cyan-500/30"}`}>
            {typeLabel}
          </span>
        )}
        {recruit.isBlueChip && (
          <span className="text-[10px] font-pixel text-gold px-1 rounded border border-gold/40 bg-gold/10">CHIP</span>
        )}
        {recruit.isGenerationalGem && (
          <Gem className="w-3 h-3 text-emerald-400" />
        )}
        {recruit.isGenerationalBust && (
          <Skull className="w-3 h-3 text-red-400" />
        )}
        {positionNeed && (
          <span className="text-[10px] font-pixel text-red-400 border border-red-500/40 px-1 rounded">NEED</span>
        )}
        {hasOffer && (
          <span className="text-[10px] font-pixel text-gold border border-gold/40 px-1 rounded bg-gold/10">OFFER</span>
        )}
        {nilCost && !nilAffordable && (
          <DollarSign className="w-3 h-3 text-red-400 shrink-0" />
        )}
        <div className="ml-auto">
          <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
        </div>
      </div>

      {/* Row 2: Name + location */}
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-foreground leading-tight">
          {recruit.firstName} {recruit.lastName}
        </span>
        {(recruit.hometown || recruit.homeState) && (
          <span className="text-[11px] text-muted-foreground truncate">
            {[recruit.hometown, recruit.homeState].filter(Boolean).join(", ")}
          </span>
        )}
      </div>

      {/* Row 3: Interest bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className={`text-[11px] font-medium ${interestColor}`}>{interestLabel}</span>
          <span className="text-[11px] text-muted-foreground">{interestLevel}%</span>
        </div>
        <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${interestLevel}%` }}
          />
        </div>
      </div>

      {/* Row 4: Scout / OVR / stage / expand toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground">
            Scout <span className="text-foreground font-medium">{Math.round(scoutPct)}%</span>
          </span>
          <span className="text-[11px] text-muted-foreground">
            OVR <span className="text-foreground font-medium">{ovrStr}</span>
          </span>
          <span className={`text-[10px] font-pixel px-1.5 py-0.5 rounded border ${stageBadge.textColor} ${stageBadge.borderColor}`}>
            {stageBadge.label}
          </span>
          {typeof recruit.teamsIn === "number" && recruit.teamsIn > 1 && (
            <span className="text-[10px] text-orange-400 font-medium">{recruit.teamsIn} teams</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {actionMeta && !expanded && (
            <span className={`text-[10px] font-pixel px-1.5 py-0.5 rounded border ${actionMeta.color}`}>
              {actionMeta.label}
            </span>
          )}
          <button
            className="p-0.5 text-muted-foreground hover:text-gold transition-colors"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            aria-label={expanded ? "Collapse actions" : "Expand actions"}
            data-testid={`mobile-card-expand-${recruit.id}`}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Row 5: Expanded quick actions */}
      {expanded && (
        <div
          className="flex flex-col gap-2 pt-1 border-t border-border/40"
          onClick={(e) => e.stopPropagation()}
        >
          {/* NIL info if available */}
          {nilCost && scoutPct >= 50 && (
            <div className={`flex items-center gap-1.5 text-[10px] px-1.5 py-1 rounded border ${nilAffordable ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}>
              <DollarSign className="w-3 h-3 shrink-0" />
              <span>NIL: ${nilCost >= 1000000 ? `${(nilCost / 1000000).toFixed(1)}M` : nilCost >= 1000 ? `${Math.round(nilCost / 1000)}K` : nilCost}</span>
              {!nilAffordable && <span className="ml-auto">Over budget</span>}
            </div>
          )}

          {/* Top schools snippet */}
          {recruit.topSchools && recruit.topSchools.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Top:</span>
              {recruit.topSchools.slice(0, 3).map((s) => (
                <span
                  key={s.teamId}
                  className="text-[10px] font-medium px-1 rounded"
                  style={{ color: `#${s.primaryColor?.replace("#", "") || "888"}` }}
                >
                  {s.abbreviation}
                </span>
              ))}
            </div>
          )}

          {/* Action row 1: Scout + Target + Phone + Email */}
          <div className="flex gap-1.5">
            {onQuickScout && (
              <ActionBtn
                icon={<Eye className="w-3 h-3" />}
                label="Scout"
                done={fullyScoutd}
                disabled={scoutDisabled}
                disabledReason={scoutReason}
                pending={isPending && pendingAction === "scout"}
                onClick={onQuickScout}
                colorClass="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                testId={`mobile-card-scout-${recruit.id}`}
              />
            )}
            {onQuickTarget && (
              <ActionBtn
                icon={isTargeted ? <Check className="w-3 h-3" /> : <Target className="w-3 h-3" />}
                label={isTargeted ? "Targeted" : "Target"}
                done={false}
                disabled={isSigned}
                disabledReason={isSigned ? "Already signed" : null}
                pending={isPending && pendingAction === "target"}
                onClick={onQuickTarget}
                colorClass={isTargeted ? "border-gold/50 text-gold hover:bg-gold/10" : "border-muted-foreground/40 text-muted-foreground hover:border-gold/40 hover:text-gold"}
                testId={`mobile-card-target-${recruit.id}`}
              />
            )}
          </div>

          {/* Action row 2: Phone + Email */}
          <div className="flex gap-1.5">
            {onQuickPhone && (
              <ActionBtn
                icon={<Phone className="w-3 h-3" />}
                label={phonedThisWeek ? "Called" : "Call"}
                done={phonedThisWeek}
                disabled={phoneDisabled}
                disabledReason={phoneReason}
                pending={isPending && pendingAction === "phone"}
                onClick={onQuickPhone}
                colorClass="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                testId={`mobile-card-phone-${recruit.id}`}
              />
            )}
            {onQuickEmail && (
              <ActionBtn
                icon={<Mail className="w-3 h-3" />}
                label={emailedThisWeek ? "Emailed" : "Email"}
                done={emailedThisWeek}
                disabled={emailDisabled}
                disabledReason={emailReason}
                pending={isPending && pendingAction === "email"}
                onClick={onQuickEmail}
                colorClass="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                testId={`mobile-card-email-${recruit.id}`}
              />
            )}
          </div>

          {/* Action row 3: Visit + HCV + Offer */}
          <div className="flex gap-1.5">
            {onQuickVisit && (
              <ActionBtn
                icon={<Building2 className="w-3 h-3" />}
                label={alreadyVisited ? "Visited" : "Visit"}
                done={alreadyVisited}
                disabled={visitDisabled}
                disabledReason={visitReason}
                pending={isPending && pendingAction === "visit"}
                onClick={onQuickVisit}
                colorClass="border-teal-500/50 text-teal-400 hover:bg-teal-500/10"
                testId={`mobile-card-visit-${recruit.id}`}
              />
            )}
            {onQuickHcv && (
              <ActionBtn
                icon={<Crown className="w-3 h-3" />}
                label={alreadyHcv ? "HCV Done" : "HC Visit"}
                done={alreadyHcv}
                disabled={hcvDisabled}
                disabledReason={hcvReason}
                pending={isPending && pendingAction === "hcv"}
                onClick={onQuickHcv}
                colorClass="border-violet-500/50 text-violet-400 hover:bg-violet-500/10"
                testId={`mobile-card-hcv-${recruit.id}`}
              />
            )}
            {onQuickOffer && (
              <ActionBtn
                icon={<GraduationCap className="w-3 h-3" />}
                label={hasOffer ? "Offered" : "Offer"}
                done={hasOffer}
                disabled={offerDisabled}
                disabledReason={offerReason}
                pending={isPending && pendingAction === "offer"}
                onClick={onQuickOffer}
                colorClass="border-gold/50 text-gold hover:bg-gold/10"
                testId={`mobile-card-offer-${recruit.id}`}
              />
            )}
          </div>

          {/* Details link */}
          <button
            className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground border border-border/40 rounded py-1.5 hover:border-gold/50 hover:text-gold transition-colors w-full"
            onClick={onSelect}
            data-testid={`mobile-card-details-${recruit.id}`}
          >
            Full Profile
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Mobile recruit list ──────────────────────────────────────────────────────

interface MobileRecruitListProps {
  recruits: RecruitWithInterest[];
  trendsData?: TrendsData;
  recommendationsByRecruit: Map<string, RecruitRecommendation>;
  positionNeeds?: PipelineData["positionNeeds"];
  storylineRecruitIds: Set<string>;
  onSelectRecruit: (r: RecruitWithInterest) => void;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  actionState?: ActionState;
  onQuickPhone?: (recruitId: string) => void;
  onQuickEmail?: (recruitId: string) => void;
  onQuickScout?: (recruitId: string) => void;
  onQuickVisit?: (recruitId: string) => void;
  onQuickHcv?: (recruitId: string) => void;
  onQuickOffer?: (recruitId: string) => void;
  onQuickTarget?: (recruitId: string) => void;
  pendingRecruitId?: string | null;
  pendingActionType?: string | null;
}

function MobileRecruitList({
  recruits,
  trendsData,
  recommendationsByRecruit,
  positionNeeds,
  storylineRecruitIds,
  onSelectRecruit,
  emptyMessage = "No recruits found",
  emptyIcon,
  actionState,
  onQuickPhone,
  onQuickEmail,
  onQuickScout,
  onQuickVisit,
  onQuickHcv,
  onQuickOffer,
  onQuickTarget,
  pendingRecruitId,
  pendingActionType,
}: MobileRecruitListProps) {
  if (recruits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        {emptyIcon && <div className="opacity-50">{emptyIcon}</div>}
        <p className="text-sm text-center">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-4">
      {recruits.map((recruit) => (
        <MobileRecruitCard
          key={recruit.id}
          recruit={recruit}
          trend={trendsData?.trends?.[recruit.id]}
          recommendation={recommendationsByRecruit.get(recruit.id)}
          positionNeed={positionNeeds?.find((p) => p.position === recruit.position)?.need}
          isStoryline={storylineRecruitIds.has(recruit.id)}
          onSelect={() => onSelectRecruit(recruit)}
          actionState={actionState}
          onQuickPhone={onQuickPhone ? () => onQuickPhone(recruit.id) : undefined}
          onQuickEmail={onQuickEmail ? () => onQuickEmail(recruit.id) : undefined}
          onQuickScout={onQuickScout ? () => onQuickScout(recruit.id) : undefined}
          onQuickVisit={onQuickVisit ? () => onQuickVisit(recruit.id) : undefined}
          onQuickHcv={onQuickHcv ? () => onQuickHcv(recruit.id) : undefined}
          onQuickOffer={onQuickOffer ? () => onQuickOffer(recruit.id) : undefined}
          onQuickTarget={onQuickTarget ? () => onQuickTarget(recruit.id) : undefined}
          isPending={pendingRecruitId === recruit.id}
          pendingAction={pendingRecruitId === recruit.id ? pendingActionType : null}
        />
      ))}
    </div>
  );
}

// ── Recap tab ────────────────────────────────────────────────────────────────

interface MobileRecapTabProps {
  weekRecapData?: WeekRecapData;
  visibleDecommits: DecommitAlert[];
  historyData?: RecruitingHistoryData;
  currentWeek: number;
  allRecruits: RecruitWithInterest[];
  onSelectRecruit: (r: RecruitWithInterest) => void;
  onDismissDecommit: (id: string) => void;
}

function MobileRecapTab({
  weekRecapData,
  visibleDecommits,
  historyData,
  currentWeek,
  allRecruits,
  onSelectRecruit,
  onDismissDecommit,
}: MobileRecapTabProps) {
  const allActions = historyData?.actions ?? [];
  const lastWeekActions = allActions.filter((a) => a.week === currentWeek - 1);
  const displayActions = lastWeekActions.length > 0
    ? lastWeekActions
    : (() => {
        const weeks = Array.from(new Set(allActions.map((a) => a.week)))
          .filter((w) => w < currentWeek)
          .sort((a, b) => b - a);
        return weeks.length > 0 ? allActions.filter((a) => a.week === weeks[0]) : [];
      })();

  const actionIconMap: Record<string, React.ReactNode> = {
    scout: <Eye className="w-3 h-3" />,
    phone: <Phone className="w-3 h-3" />,
    email: <Mail className="w-3 h-3" />,
    offer: <GraduationCap className="w-3 h-3" />,
    visit: <Building2 className="w-3 h-3" />,
    head_coach_visit: <Crown className="w-3 h-3" />,
  };
  const actionColorMap: Record<string, string> = {
    scout: "text-green-400",
    phone: "text-blue-400",
    email: "text-purple-400",
    offer: "text-gold",
    visit: "text-teal-400",
    head_coach_visit: "text-violet-400",
  };

  const hasContent =
    visibleDecommits.length > 0 ||
    (weekRecapData?.myRecruits?.length ?? 0) > 0 ||
    (weekRecapData?.hotMissed?.length ?? 0) > 0 ||
    displayActions.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <ClipboardList className="w-12 h-12 opacity-30" />
        <p className="text-sm">No activity to recap yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {visibleDecommits.map((alert) => {
        const isPositive = alert.metadata?.alertType === "gain";
        const recruitId = alert.metadata?.recruitId ?? null;
        const matchedRecruit = recruitId ? allRecruits.find((r) => r.id === recruitId) : null;
        return (
          <div
            key={alert.id}
            className={`rounded-lg border px-3 py-3 ${
              isPositive
                ? "bg-emerald-500/10 border-emerald-500/40"
                : "bg-amber-500/10 border-amber-500/40"
            }`}
            data-testid={`mobile-decommit-alert-${alert.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle
                  className={`w-4 h-4 mt-0.5 shrink-0 ${isPositive ? "text-emerald-400" : "text-amber-400"}`}
                />
                <div className="min-w-0">
                  <p className={`font-pixel text-[9px] uppercase tracking-wider mb-1 ${isPositive ? "text-emerald-400" : "text-amber-400"}`}>
                    {isPositive ? "Decommit Opportunity" : "Decommitment Alert"}
                  </p>
                  <p className="text-[12px] text-foreground leading-snug">{alert.description}</p>
                  {matchedRecruit && (
                    <button
                      className={`mt-1.5 text-[11px] font-medium underline underline-offset-2 ${isPositive ? "text-emerald-400" : "text-amber-400"}`}
                      onClick={() => onSelectRecruit(matchedRecruit)}
                      data-testid={`mobile-decommit-view-${alert.id}`}
                    >
                      {isPositive ? "View recruit →" : "Re-recruit →"}
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => onDismissDecommit(alert.id)}
                className="text-muted-foreground p-1 shrink-0"
                data-testid={`mobile-decommit-dismiss-${alert.id}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {weekRecapData && (weekRecapData.myRecruits.length > 0 || weekRecapData.hotMissed.length > 0) && (
        <div className="bg-card border border-border rounded-lg p-3 space-y-3">
          <p className="font-pixel text-[9px] text-gold uppercase tracking-wider">
            Week {weekRecapData.week} Recap
          </p>
          {weekRecapData.myRecruits.length > 0 && (
            <div>
              <p className="text-[10px] font-pixel text-muted-foreground mb-2">YOUR TARGETS</p>
              <div className="space-y-2">
                {weekRecapData.myRecruits.map((r) => {
                  const recruit = allRecruits.find((rec) => rec.id === r.recruitId);
                  return (
                    <div
                      key={r.recruitId}
                      className="flex items-center justify-between gap-2 bg-background/50 rounded p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <PositionBadge position={r.position} />
                        <button
                          className="text-[12px] font-medium text-foreground hover:text-gold transition-colors truncate"
                          onClick={() => recruit && onSelectRecruit(recruit)}
                          data-testid={`mobile-recap-target-${r.recruitId}`}
                        >
                          {r.name}
                        </button>
                        {r.starRating > 0 && <StarRating rating={r.starRating} size="sm" />}
                      </div>
                      {r.otherTeamActionCount > 0 && (
                        <span className="text-[10px] text-orange-400 shrink-0 flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {r.otherTeamActionCount}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {weekRecapData.hotMissed.length > 0 && (
            <div>
              <p className="text-[10px] font-pixel text-amber-400 mb-2">HOT — NOT CONTACTED</p>
              <div className="space-y-2">
                {weekRecapData.hotMissed.map((r) => {
                  const recruit = allRecruits.find((rec) => rec.id === r.recruitId);
                  return (
                    <div
                      key={r.recruitId}
                      className="flex items-center justify-between gap-2 bg-amber-500/5 border border-amber-500/20 rounded p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <PositionBadge position={r.position} />
                        <button
                          className="text-[12px] font-medium text-foreground hover:text-gold transition-colors truncate"
                          onClick={() => recruit && onSelectRecruit(recruit)}
                          data-testid={`mobile-recap-missed-${r.recruitId}`}
                        >
                          {r.name}
                        </button>
                      </div>
                      <span className="text-[10px] text-amber-400 shrink-0 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {r.otherTeamActionCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {displayActions.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <p className="font-pixel text-[9px] text-gold uppercase tracking-wider">
            Last Week's Actions
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {displayActions.map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between gap-2 text-[11px] py-1 px-2 bg-background/50 rounded"
                data-testid={`mobile-history-${action.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={actionColorMap[action.actionType] ?? "text-muted-foreground"}>
                    {actionIconMap[action.actionType] ?? <Eye className="w-3 h-3" />}
                  </span>
                  <span className="text-foreground truncate">{action.recruitName}</span>
                  <span className="text-muted-foreground capitalize shrink-0">{action.actionType.replace("_", " ")}</span>
                </div>
                {action.interestChange !== 0 && (
                  <span className={`shrink-0 font-medium ${action.interestChange > 0 ? "text-green-400" : "text-red-400"}`}>
                    {action.interestChange > 0 ? `+${action.interestChange}` : action.interestChange}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Needs tab ────────────────────────────────────────────────────────────────

interface MobileNeedsTabProps {
  filteredRecruits: RecruitWithInterest[];
  pipelineData?: PipelineData;
  trendsData?: TrendsData;
  recommendationsByRecruit: Map<string, RecruitRecommendation>;
  storylineRecruitIds: Set<string>;
  onSelectRecruit: (r: RecruitWithInterest) => void;
  actionState?: ActionState;
  onQuickPhone?: (recruitId: string) => void;
  onQuickEmail?: (recruitId: string) => void;
  onQuickScout?: (recruitId: string) => void;
  onQuickVisit?: (recruitId: string) => void;
  onQuickHcv?: (recruitId: string) => void;
  onQuickOffer?: (recruitId: string) => void;
  onQuickTarget?: (recruitId: string) => void;
  pendingRecruitId?: string | null;
  pendingActionType?: string | null;
}

function MobileNeedsTab({
  filteredRecruits,
  pipelineData,
  trendsData,
  recommendationsByRecruit,
  storylineRecruitIds,
  onSelectRecruit,
  actionState,
  onQuickPhone,
  onQuickEmail,
  onQuickScout,
  onQuickVisit,
  onQuickHcv,
  onQuickOffer,
  onQuickTarget,
  pendingRecruitId,
  pendingActionType,
}: MobileNeedsTabProps) {
  const needs = pipelineData?.positionNeeds?.filter((p) => p.need) ?? [];
  const [selectedPos, setSelectedPos] = useState<string | null>(null);

  const needsRecruits = filteredRecruits.filter((r) => {
    const posNeed = pipelineData?.positionNeeds?.find((p) => p.position === r.position)?.need;
    if (!posNeed) return false;
    if (selectedPos && r.position !== selectedPos) return false;
    return true;
  });

  if (needs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Users className="w-12 h-12 opacity-30" />
        <p className="text-sm text-center">No position needs identified</p>
        <p className="text-[11px] text-center opacity-70">Your roster depth looks good for next season</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div>
        <p className="text-[10px] font-pixel text-muted-foreground mb-2 uppercase">Position Needs</p>
        <div className="flex flex-wrap gap-2">
          <button
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              selectedPos === null
                ? "bg-red-500/20 border-red-500/60 text-red-300"
                : "border-border text-muted-foreground hover:border-red-500/40"
            }`}
            onClick={() => setSelectedPos(null)}
            data-testid="mobile-needs-filter-all"
          >
            All ({needs.length})
          </button>
          {needs.map((p) => (
            <button
              key={p.position}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                selectedPos === p.position
                  ? "bg-red-500/20 border-red-500/60 text-red-300"
                  : "border-border text-muted-foreground hover:border-red-500/40"
              }`}
              onClick={() => setSelectedPos(selectedPos === p.position ? null : p.position)}
              data-testid={`mobile-needs-filter-${p.position}`}
            >
              {p.position} <span className="opacity-70">({p.current - p.graduating} left)</span>
            </button>
          ))}
        </div>
      </div>
      <MobileRecruitList
        recruits={needsRecruits}
        trendsData={trendsData}
        recommendationsByRecruit={recommendationsByRecruit}
        positionNeeds={pipelineData?.positionNeeds}
        storylineRecruitIds={storylineRecruitIds}
        onSelectRecruit={onSelectRecruit}
        emptyMessage={selectedPos ? `No ${selectedPos} recruits in your current board` : "No recruits matching position needs"}
        emptyIcon={<Users className="w-10 h-10" />}
        actionState={actionState}
        onQuickPhone={onQuickPhone}
        onQuickEmail={onQuickEmail}
        onQuickScout={onQuickScout}
        onQuickVisit={onQuickVisit}
        onQuickHcv={onQuickHcv}
        onQuickOffer={onQuickOffer}
        onQuickTarget={onQuickTarget}
        pendingRecruitId={pendingRecruitId}
        pendingActionType={pendingActionType}
      />
    </div>
  );
}

// ── Battles panel ────────────────────────────────────────────────────────────

interface BattleRecruitCardProps { battle: BattleRecruit }

function BattleRecruitCard({ battle }: BattleRecruitCardProps) {
  const stageLabel: Record<string, string> = {
    open: "Open", top8: "Top 8", top5: "Top 5", top3: "Top 3", verbal: "Verbal"
  };
  const stars = "★".repeat(Math.min(battle.starRank ?? 0, 5));
  const intensityColor =
    battle.humanRivalCount >= 3 ? "text-red-400" :
    battle.humanRivalCount >= 1 ? "text-orange-400" : "text-muted-foreground";

  return (
    <div className="bg-card border border-border/60 rounded-lg p-3 space-y-2" data-testid={`mobile-battle-card-${battle.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {battle.starRank && battle.starRank > 0 && (
            <span className="text-gold text-[10px] shrink-0">{stars}</span>
          )}
          <PositionBadge position={battle.position} />
          <span className="text-sm font-semibold text-foreground truncate">
            {battle.firstName} {battle.lastName}
          </span>
          {battle.isBlueChip && (
            <span className="text-[10px] font-pixel text-gold border border-gold/40 px-1 rounded bg-gold/10">CHIP</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] font-medium ${intensityColor}`}>
            {battle.humanRivalCount} rival{battle.humanRivalCount !== 1 ? "s" : ""}
          </span>
          {battle.rivalryAlert && <RivalryAlertBadge />}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-pixel px-1.5 py-0.5 rounded border border-gray-500/40 text-gray-400">
          {stageLabel[battle.stage] ?? battle.stage}
        </span>
        {battle.myInterest && (
          <span className="text-[10px] text-foreground">
            My interest: <span className="font-medium text-gold">{battle.myInterest.interestLevel}%</span>
          </span>
        )}
        {battle.myMovementDelta != null && battle.myMovementDelta !== 0 && (
          <MovementIndicator delta={battle.myMovementDelta} />
        )}
      </div>
      {battle.topSchools.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {battle.topSchools.slice(0, 4).map((s) => (
            <div key={s.teamId} className="flex items-center gap-1">
              <span
                className={`text-[10px] font-medium ${s.isMyTeam ? "underline underline-offset-2" : ""}`}
                style={{ color: `#${s.primaryColor?.replace("#", "") || "888"}` }}
              >
                {s.abbreviation}
              </span>
              {s.movementDir === "up" && <TrendingUp className="w-2.5 h-2.5 text-green-400" />}
              {s.movementDir === "down" && <TrendingDown className="w-2.5 h-2.5 text-red-400" />}
            </div>
          ))}
        </div>
      )}
      {battle.dramaTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <DramaChips dramaTags={battle.dramaTags} />
        </div>
      )}
    </div>
  );
}

function CommitAnnouncementCard({ commit }: { commit: CommitAnnouncement }) {
  return (
    <div
      className={`rounded-lg border p-2.5 flex items-center gap-3 ${
        commit.isMyTeam ? "border-gold/40 bg-gold/5" : "border-border/60"
      }`}
      data-testid={`mobile-commit-card-${commit.id}`}
    >
      <GraduationCap className={`w-4 h-4 shrink-0 ${commit.isMyTeam ? "text-gold" : "text-muted-foreground"}`} />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-foreground truncate">
          {commit.firstName} {commit.lastName}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {commit.position}
          {commit.signedTeamName && (
            <span className={commit.isMyTeam ? "text-gold" : ""}> → {commit.signedTeamAbbreviation || commit.signedTeamName}</span>
          )}
          {commit.classRank && <span className="ml-2">#{commit.classRank}</span>}
        </p>
      </div>
    </div>
  );
}

interface RecruitingBattlesPanelProps {
  battlesData?: BattlesData;
  battleRecruits: RecruitWithInterest[];
  trendsData?: TrendsData;
  recommendationsByRecruit: Map<string, RecruitRecommendation>;
  pipelineData?: PipelineData;
  storylineRecruitIds: Set<string>;
  onSelectRecruit: (r: RecruitWithInterest) => void;
  actionState?: ActionState;
  onQuickPhone?: (recruitId: string) => void;
  onQuickEmail?: (recruitId: string) => void;
  pendingRecruitId?: string | null;
  pendingActionType?: string | null;
}

function RecruitingBattlesPanel({
  battlesData,
  battleRecruits,
  trendsData,
  recommendationsByRecruit,
  pipelineData,
  storylineRecruitIds,
  onSelectRecruit,
  actionState,
  onQuickPhone,
  onQuickEmail,
  pendingRecruitId,
  pendingActionType,
}: RecruitingBattlesPanelProps) {
  const [showWatchlist, setShowWatchlist] = useState(true);

  const battles = battlesData?.battles ?? [];
  const recentCommits = battlesData?.recentCommits ?? [];

  const hotBattles = battles.filter(b => b.battleScore >= 3 || b.rivalryAlert);
  const commitWatchBattles = battles.filter(b => b.myInterest?.isTargeted && b.stage === "top3");
  const rivalryBattles = battles.filter(b => b.rivalryAlert && !hotBattles.includes(b));
  const otherBattles = battles.filter(
    b => !hotBattles.includes(b) && !commitWatchBattles.includes(b) && !rivalryBattles.includes(b)
  );

  return (
    <div className="space-y-4 pb-4">
      {hotBattles.length > 0 && (
        <div>
          <div className="text-[10px] font-pixel text-red-400 mb-2 flex items-center gap-1.5">
            <Flame className="w-3 h-3" />
            Hot Battles ({hotBattles.length})
          </div>
          <div className="space-y-2">
            {hotBattles.map(b => (
              <BattleRecruitCard key={b.id} battle={b} />
            ))}
          </div>
        </div>
      )}

      {recentCommits.length > 0 && (
        <div>
          <div className="text-[10px] font-pixel text-gold mb-2 flex items-center gap-1.5">
            <GraduationCap className="w-3 h-3" />
            Recent Commits ({recentCommits.length})
          </div>
          <div className="space-y-2">
            {recentCommits.slice(0, 5).map(c => (
              <CommitAnnouncementCard key={c.id} commit={c} />
            ))}
          </div>
        </div>
      )}

      {commitWatchBattles.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1.5 text-[10px] font-pixel text-amber-400 mb-2 w-full text-left"
            onClick={() => setShowWatchlist(v => !v)}
            data-testid="btn-toggle-watchlist"
          >
            {showWatchlist ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Commitment Watch ({commitWatchBattles.length})
          </button>
          {showWatchlist && (
            <div className="space-y-2">
              {commitWatchBattles.map(b => (
                <BattleRecruitCard key={b.id} battle={b} />
              ))}
            </div>
          )}
        </div>
      )}

      {rivalryBattles.length > 0 && (
        <div>
          <div className="text-[10px] font-pixel text-orange-400 mb-2 flex items-center gap-1.5">
            <Flame className="w-3 h-3" />
            Rivalry Alerts ({rivalryBattles.length})
          </div>
          <div className="space-y-2">
            {rivalryBattles.map(b => (
              <BattleRecruitCard key={b.id} battle={b} />
            ))}
          </div>
        </div>
      )}

      {otherBattles.length > 0 && (
        <div>
          <div className="text-[10px] font-pixel text-muted-foreground mb-2">
            All Battles ({battles.length})
          </div>
          <div className="space-y-2">
            {otherBattles.map(b => (
              <BattleRecruitCard key={b.id} battle={b} />
            ))}
          </div>
        </div>
      )}

      {battles.length === 0 && recentCommits.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
          <Flame className="w-10 h-10 opacity-30" />
          <p className="text-[11px]">No heated battles yet this week</p>
        </div>
      )}
    </div>
  );
}

// ── Main mobile board ────────────────────────────────────────────────────────

export interface MobileRecruitingBoardProps {
  filteredRecruits: RecruitWithInterest[];
  allRecruits: RecruitWithInterest[];
  pipelineData?: PipelineData;
  trendsData?: TrendsData;
  weekRecapData?: WeekRecapData;
  visibleDecommits: DecommitAlert[];
  historyData?: RecruitingHistoryData;
  recommendationsByRecruit: Map<string, RecruitRecommendation>;
  storylineRecruitIds: Set<string>;
  currentWeek: number;
  onSelectRecruit: (r: RecruitWithInterest) => void;
  onOpenFilterSheet: () => void;
  onDismissDecommit: (id: string) => void;
  onPhone: (recruitId: string, pitchTopic?: string) => void;
  onEmail: (recruitId: string, pitchTopic?: string) => void;
  onScout?: (recruitId: string) => void;
  onVisit?: (recruitId: string) => void;
  onHeadCoachVisit?: (recruitId: string) => void;
  onOffer?: (recruitId: string) => void;
  onTarget?: (recruitId: string) => void;
  isPhoning: boolean;
  isEmailing: boolean;
  isScouting?: boolean;
  isVisiting?: boolean;
  isHeadCoachVisiting?: boolean;
  isOffering?: boolean;
  isTargeting?: boolean;
  actionState: ActionState;
  leagueId: string;
  battlesData?: BattlesData;
  activeFilterChips?: string[];
}

export function MobileRecruitingBoard({
  filteredRecruits,
  allRecruits,
  pipelineData,
  trendsData,
  weekRecapData,
  visibleDecommits,
  historyData,
  recommendationsByRecruit,
  storylineRecruitIds,
  currentWeek,
  onSelectRecruit,
  onOpenFilterSheet,
  onDismissDecommit,
  onPhone,
  onEmail,
  onScout,
  onVisit,
  onHeadCoachVisit,
  onOffer,
  onTarget,
  isPhoning,
  isEmailing,
  isScouting,
  isVisiting,
  isHeadCoachVisiting,
  isOffering,
  isTargeting,
  actionState,
  leagueId,
  battlesData,
  activeFilterChips = [],
}: MobileRecruitingBoardProps) {
  const tabStorageKey = `recruiting-mobile-tab-${leagueId}`;
  const [activeTab, setActiveTabState] = useState<TabKey>(() => {
    const saved = sessionStorage.getItem(tabStorageKey);
    return (saved as TabKey | null) ?? "board";
  });

  function setActiveTab(tab: TabKey) {
    setActiveTabState(tab);
    sessionStorage.setItem(tabStorageKey, tab);
  }
  const [boardSearch, setBoardSearch] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    recruitId: string;
    type: "phone" | "email" | "scout" | "visit" | "hcv" | "offer" | "target";
  } | null>(null);
  const [showTopicSheet, setShowTopicSheet] = useState(false);
  const [lastActioningId, setLastActioningId] = useState<string | null>(null);
  const [lastActionType, setLastActionType] = useState<string | null>(null);

  const outOfActions = actionState.remainingPoints <= 0;
  const isPendingAny = isPhoning || isEmailing || isScouting || isVisiting || isHeadCoachVisiting || isOffering || isTargeting;

  function handleQuickPhone(recruitId: string) {
    setPendingAction({ recruitId, type: "phone" });
    setShowTopicSheet(true);
  }

  function handleQuickEmail(recruitId: string) {
    setPendingAction({ recruitId, type: "email" });
    setShowTopicSheet(true);
  }

  function handleQuickScout(recruitId: string) {
    setLastActioningId(recruitId);
    setLastActionType("scout");
    onScout?.(recruitId);
  }

  function handleQuickVisit(recruitId: string) {
    setLastActioningId(recruitId);
    setLastActionType("visit");
    onVisit?.(recruitId);
  }

  function handleQuickHcv(recruitId: string) {
    setLastActioningId(recruitId);
    setLastActionType("hcv");
    onHeadCoachVisit?.(recruitId);
  }

  function handleQuickOffer(recruitId: string) {
    setLastActioningId(recruitId);
    setLastActionType("offer");
    onOffer?.(recruitId);
  }

  function handleQuickTarget(recruitId: string) {
    setLastActioningId(recruitId);
    setLastActionType("target");
    onTarget?.(recruitId);
  }

  function handleTopicSelect(topic?: string) {
    if (!pendingAction) return;
    setLastActioningId(pendingAction.recruitId);
    setLastActionType(pendingAction.type);
    setShowTopicSheet(false);
    if (pendingAction.type === "phone") {
      onPhone(pendingAction.recruitId, topic);
    } else {
      onEmail(pendingAction.recruitId, topic);
    }
    setPendingAction(null);
  }

  const pendingRecruitId = isPendingAny ? lastActioningId : null;

  const boardRecruits = useMemo(() => {
    if (!boardSearch.trim()) return filteredRecruits;
    const q = boardSearch.toLowerCase();
    return filteredRecruits.filter(
      (r) =>
        `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
        r.position.toLowerCase().includes(q) ||
        (r.homeState && r.homeState.toLowerCase().includes(q)) ||
        (r.hometown && r.hometown.toLowerCase().includes(q))
    );
  }, [filteredRecruits, boardSearch]);

  const targetRecruits = useMemo(
    () => filteredRecruits.filter((r) => r.interest?.isTargeted),
    [filteredRecruits]
  );

  const battleRecruits = useMemo(
    () =>
      filteredRecruits.filter(
        (r) =>
          (r.competingIntensity === "Moderate" || r.competingIntensity === "Heavy") ||
          (r.competingCount != null && r.competingCount >= 2)
      ),
    [filteredRecruits]
  );

  const needsCount = pipelineData?.positionNeeds?.filter((p) => p.need).length ?? 0;
  const recapBadge = visibleDecommits.length;

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      key: "board",
      label: "Board",
      icon: <Target className="w-4 h-4" />,
      badge: filteredRecruits.length,
    },
    {
      key: "targets",
      label: "Targets",
      icon: <StarIcon className="w-4 h-4" />,
      badge: targetRecruits.length,
    },
    {
      key: "battles",
      label: "Battles",
      icon: <Flame className="w-4 h-4" />,
      badge: battleRecruits.length,
    },
    {
      key: "needs",
      label: "Needs",
      icon: <Users className="w-4 h-4" />,
      badge: needsCount || undefined,
    },
    {
      key: "recap",
      label: "Recap",
      icon: <ClipboardList className="w-4 h-4" />,
      badge: recapBadge || undefined,
    },
  ];

  const sharedListProps = {
    trendsData,
    recommendationsByRecruit,
    positionNeeds: pipelineData?.positionNeeds,
    storylineRecruitIds,
    onSelectRecruit,
    actionState,
    onQuickPhone: handleQuickPhone,
    onQuickEmail: handleQuickEmail,
    onQuickScout: onScout ? handleQuickScout : undefined,
    onQuickVisit: onVisit ? handleQuickVisit : undefined,
    onQuickHcv: onHeadCoachVisit ? handleQuickHcv : undefined,
    onQuickOffer: onOffer ? handleQuickOffer : undefined,
    onQuickTarget: onTarget ? handleQuickTarget : undefined,
    pendingRecruitId,
    pendingActionType: lastActionType,
  };

  return (
    <div className="flex flex-col">
      {/* Sticky tab bar */}
      <div className="sticky top-[var(--header-height,0px)] z-10 bg-background border-b border-border">
        <div className="flex items-stretch">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 relative transition-colors ${
                  isActive
                    ? "text-gold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab(tab.key)}
                data-testid={`mobile-tab-${tab.key}`}
              >
                <span className="relative">
                  {tab.icon}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={`absolute -top-1 -right-1.5 text-[8px] font-pixel min-w-[14px] h-3.5 flex items-center justify-center rounded-full px-0.5 ${
                      tab.key === "recap" && tab.badge > 0
                        ? "bg-amber-500 text-black"
                        : "bg-gold/20 text-gold border border-gold/40"
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </span>
                <span className="text-[9px] font-pixel leading-none">{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gold rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 pt-3">
        {activeTab === "board" && (
          <div className="space-y-3">
            {/* Search + filter row */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <RetroInput
                  placeholder="Search recruits..."
                  value={boardSearch}
                  onChange={(e) => setBoardSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                  data-testid="mobile-board-search"
                />
              </div>
              <RetroButton
                variant={activeFilterChips.length > 0 ? "primary" : "outline"}
                size="sm"
                onClick={onOpenFilterSheet}
                className="h-9 shrink-0 relative"
                data-testid="mobile-board-filter-btn"
              >
                <Search className="w-3.5 h-3.5 mr-1" />
                Filter
                {activeFilterChips.length > 0 && (
                  <span className="ml-1 text-[9px] bg-background/30 px-1 rounded font-bold">
                    {activeFilterChips.length}
                  </span>
                )}
              </RetroButton>
            </div>

            {/* Active filter chips */}
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="mobile-active-filter-chips">
                {activeFilterChips.map((chip) => (
                  <span
                    key={chip}
                    className="text-[10px] bg-gold/10 border border-gold/40 text-gold px-2 py-0.5 rounded-full font-medium"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              {boardRecruits.length} recruit{boardRecruits.length !== 1 ? "s" : ""}
              {boardSearch && ` matching "${boardSearch}"`}
            </p>
            <MobileRecruitList
              recruits={boardRecruits}
              emptyMessage={boardSearch ? "No recruits match your search" : "No recruits match current filters"}
              emptyIcon={<Target className="w-10 h-10" />}
              {...sharedListProps}
            />
          </div>
        )}

        {activeTab === "targets" && (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              {targetRecruits.length} targeted recruit{targetRecruits.length !== 1 ? "s" : ""}
            </p>
            <MobileRecruitList
              recruits={targetRecruits}
              emptyMessage="No recruits targeted yet"
              emptyIcon={<StarIcon className="w-10 h-10" />}
              {...sharedListProps}
            />
          </div>
        )}

        {activeTab === "battles" && (
          <RecruitingBattlesPanel
            battlesData={battlesData}
            battleRecruits={battleRecruits}
            trendsData={trendsData}
            recommendationsByRecruit={recommendationsByRecruit}
            pipelineData={pipelineData}
            storylineRecruitIds={storylineRecruitIds}
            onSelectRecruit={onSelectRecruit}
            actionState={actionState}
            onQuickPhone={handleQuickPhone}
            onQuickEmail={handleQuickEmail}
            pendingRecruitId={pendingRecruitId}
            pendingActionType={lastActionType}
          />
        )}

        {activeTab === "needs" && (
          <MobileNeedsTab
            filteredRecruits={filteredRecruits}
            pipelineData={pipelineData}
            {...sharedListProps}
          />
        )}

        {activeTab === "recap" && (
          <MobileRecapTab
            weekRecapData={weekRecapData}
            visibleDecommits={visibleDecommits}
            historyData={historyData}
            currentWeek={currentWeek}
            allRecruits={allRecruits}
            onSelectRecruit={onSelectRecruit}
            onDismissDecommit={onDismissDecommit}
          />
        )}
      </div>

      {/* Pitch topic picker bottom sheet */}
      <Sheet open={showTopicSheet} onOpenChange={(open) => { if (!open) { setShowTopicSheet(false); setPendingAction(null); } }}>
        <SheetContent side="bottom" className="pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-pixel text-[11px] text-gold">
              {pendingAction?.type === "phone" ? "Call Topic" : "Email Topic"}
            </SheetTitle>
            <p className="text-[11px] text-muted-foreground">
              Choose a topic to pitch, or send without one
            </p>
          </SheetHeader>
          <div className="space-y-2">
            {PITCH_TOPICS.map((topic) => (
              <button
                key={topic.key}
                className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-gold/50 hover:bg-gold/5 text-sm font-medium transition-colors"
                onClick={() => handleTopicSelect(topic.key)}
                data-testid={`mobile-topic-${topic.key}`}
              >
                {topic.label}
              </button>
            ))}
            <button
              className="w-full text-left px-4 py-3 rounded-lg border border-border/40 hover:border-border text-sm text-muted-foreground transition-colors"
              onClick={() => handleTopicSelect(undefined)}
              data-testid="mobile-topic-none"
            >
              No specific topic
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
