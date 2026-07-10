import { useState, useMemo } from "react";
import {
  Target, Flame, Users, ClipboardList, Star as StarIcon,
  TrendingUp, TrendingDown, Minus, Search, AlertTriangle, X,
  Eye, Phone, Mail, MapPin, GraduationCap, Crown, Building2, Skull, Gem,
  ChevronRight, ChevronDown, ChevronUp, Loader2, Zap,
} from "lucide-react";
import { StarRating } from "@/components/ui/star-rating";
import { PositionBadge } from "@/components/ui/position-badge";
import { Badge } from "@/components/ui/badge";
import { RetroInput } from "@/components/ui/retro-input";
import { Progress } from "@/components/ui/progress";
import { RetroButton } from "@/components/ui/retro-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getInterestLabel,
  getInterestBarColor,
  RECOMMENDED_ACTION_META,
  type RecruitWithInterest,
  type RecruitRecommendation,
} from "@/lib/recruitingUtils";
import type {
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
import { TeamBadge } from "@/components/ui/team-badge";

type TabKey = "board" | "targets" | "battles" | "needs" | "recap";

const PITCH_TOPICS = [
  { key: "playingTime", label: "Playing Time" },
  { key: "academics",   label: "Academics" },
  { key: "prestige",    label: "Prestige" },
  { key: "facilities",  label: "Facilities" },
  { key: "collegeLife", label: "College Life" },
] as const;

interface MobileRecruitCardProps {
  recruit: RecruitWithInterest;
  trend?: { trend: "up" | "down" | "flat"; recentGain: number };
  recommendation?: RecruitRecommendation;
  positionNeed?: boolean;
  isStoryline?: boolean;
  onSelect: () => void;
  onQuickPhone?: () => void;
  onQuickEmail?: () => void;
  isPending?: boolean;
  phonedThisWeek?: boolean;
  emailedThisWeek?: boolean;
  outOfActions?: boolean;
}

const STAGE_BADGE: Record<string, { label: string; textColor: string; borderColor: string }> = {
  open:   { label: "Open",   textColor: "text-gray-400",    borderColor: "border-gray-500/40" },
  top8:   { label: "Top 8",  textColor: "text-blue-400",    borderColor: "border-blue-500/40" },
  top5:   { label: "Top 5",  textColor: "text-green-400",   borderColor: "border-green-500/40" },
  top3:   { label: "Top 3",  textColor: "text-yellow-400",  borderColor: "border-yellow-500/40" },
  verbal: { label: "Verbal", textColor: "text-amber-400",   borderColor: "border-amber-500/40" },
  signed: { label: "Signed", textColor: "text-gold",        borderColor: "border-gold/40" },
};

function MobileRecruitCard({
  recruit,
  trend,
  recommendation,
  positionNeed,
  isStoryline,
  onSelect,
  onQuickPhone,
  onQuickEmail,
  isPending = false,
  phonedThisWeek = false,
  emailedThisWeek = false,
  outOfActions = false,
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

  const hasQuickActions = !!(onQuickPhone || onQuickEmail);
  const canPhone = !phonedThisWeek && !outOfActions && !!onQuickPhone;
  const canEmail = !emailedThisWeek && !outOfActions && !!onQuickEmail;

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
      {/* Row 1: Stars + rank + badges + trend */}
      <div className="flex items-center gap-1.5 flex-wrap">
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

      {/* Row 4: Scout / OVR / Pipeline stage / expand toggle */}
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
          {hasQuickActions ? (
            <button
              className="p-0.5 text-muted-foreground hover:text-gold transition-colors"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              aria-label={expanded ? "Collapse actions" : "Expand actions"}
              data-testid={`mobile-card-expand-${recruit.id}`}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Row 5: Quick actions (expanded) */}
      {expanded && hasQuickActions && (
        <div
          className="flex items-center gap-2 pt-1 border-t border-border/40"
          onClick={(e) => e.stopPropagation()}
        >
          {onQuickPhone && (
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded border transition-colors ${
                canPhone && !isPending
                  ? "border-blue-500/50 text-blue-400 hover:bg-blue-500/10 active:bg-blue-500/20"
                  : "border-border/40 text-muted-foreground/50 cursor-not-allowed"
              }`}
              onClick={() => canPhone && !isPending && onQuickPhone()}
              disabled={!canPhone || isPending}
              data-testid={`mobile-card-phone-${recruit.id}`}
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Phone className="w-3.5 h-3.5" />
              )}
              {phonedThisWeek ? "Called" : "Call"}
            </button>
          )}
          {onQuickEmail && (
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded border transition-colors ${
                canEmail && !isPending
                  ? "border-purple-500/50 text-purple-400 hover:bg-purple-500/10 active:bg-purple-500/20"
                  : "border-border/40 text-muted-foreground/50 cursor-not-allowed"
              }`}
              onClick={() => canEmail && !isPending && onQuickEmail()}
              disabled={!canEmail || isPending}
              data-testid={`mobile-card-email-${recruit.id}`}
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              {emailedThisWeek ? "Emailed" : "Email"}
            </button>
          )}
          <button
            className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground border border-border/40 rounded py-1.5 px-2 hover:border-gold/50 hover:text-gold transition-colors shrink-0"
            onClick={onSelect}
            data-testid={`mobile-card-details-${recruit.id}`}
          >
            Details
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

interface MobileRecruitListProps {
  recruits: RecruitWithInterest[];
  trendsData?: TrendsData;
  recommendationsByRecruit: Map<string, RecruitRecommendation>;
  positionNeeds?: PipelineData["positionNeeds"];
  storylineRecruitIds: Set<string>;
  onSelectRecruit: (r: RecruitWithInterest) => void;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onQuickPhone?: (recruitId: string) => void;
  onQuickEmail?: (recruitId: string) => void;
  pendingRecruitId?: string | null;
  weeklyActionsUsed?: Record<string, string[]>;
  outOfActions?: boolean;
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
  onQuickPhone,
  onQuickEmail,
  pendingRecruitId,
  weeklyActionsUsed,
  outOfActions,
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
          onQuickPhone={onQuickPhone ? () => onQuickPhone(recruit.id) : undefined}
          onQuickEmail={onQuickEmail ? () => onQuickEmail(recruit.id) : undefined}
          isPending={pendingRecruitId === recruit.id}
          phonedThisWeek={weeklyActionsUsed?.[recruit.id]?.includes("phone") ?? false}
          emailedThisWeek={weeklyActionsUsed?.[recruit.id]?.includes("email") ?? false}
          outOfActions={outOfActions}
        />
      ))}
    </div>
  );
}

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
      {/* Decommit alerts */}
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

      {/* Week recap */}
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

      {/* Recent action history */}
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

interface MobileNeedsTabProps {
  filteredRecruits: RecruitWithInterest[];
  pipelineData?: PipelineData;
  trendsData?: TrendsData;
  recommendationsByRecruit: Map<string, RecruitRecommendation>;
  storylineRecruitIds: Set<string>;
  onSelectRecruit: (r: RecruitWithInterest) => void;
  onQuickPhone?: (recruitId: string) => void;
  onQuickEmail?: (recruitId: string) => void;
  pendingRecruitId?: string | null;
  weeklyActionsUsed?: Record<string, string[]>;
  outOfActions?: boolean;
}

function MobileNeedsTab({
  filteredRecruits,
  pipelineData,
  trendsData,
  recommendationsByRecruit,
  storylineRecruitIds,
  onSelectRecruit,
  onQuickPhone,
  onQuickEmail,
  pendingRecruitId,
  weeklyActionsUsed,
  outOfActions,
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
      {/* Position needs summary chips */}
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

      {/* Recruits matching needs */}
      <MobileRecruitList
        recruits={needsRecruits}
        trendsData={trendsData}
        recommendationsByRecruit={recommendationsByRecruit}
        positionNeeds={pipelineData?.positionNeeds}
        storylineRecruitIds={storylineRecruitIds}
        onSelectRecruit={onSelectRecruit}
        emptyMessage={selectedPos ? `No ${selectedPos} recruits in your current board` : "No recruits matching position needs"}
        emptyIcon={<Users className="w-10 h-10" />}
        onQuickPhone={onQuickPhone}
        onQuickEmail={onQuickEmail}
        pendingRecruitId={pendingRecruitId}
        weeklyActionsUsed={weeklyActionsUsed}
        outOfActions={outOfActions}
      />
    </div>
  );
}

// ── Recruiting Battles Panel ──────────────────────────────────────────────

interface BattleRecruitCardProps {
  battle: BattleRecruit;
}

function BattleRecruitCard({ battle }: BattleRecruitCardProps) {
  const stageLabel: Record<string, string> = {
    open: "Open", top8: "Top 8", top5: "Top 5", top3: "Top 3", verbal: "Verbal"
  };
  const stars = "★".repeat(Math.min(battle.starRank ?? 0, 5));
  const intensityColor =
    battle.humanRivalCount >= 3 ? "text-red-400" :
    battle.humanRivalCount >= 1 ? "text-orange-400" : "text-muted-foreground";

  return (
    <div
      className={`bg-card border rounded-lg p-3 space-y-2 ${battle.rivalryAlert ? "border-orange-600/40" : "border-border"}`}
      data-testid={`battle-card-${battle.id}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate">{battle.firstName} {battle.lastName}</span>
            {battle.isBlueChip && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-600/40">Blue Chip</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
            <span>{battle.position}</span>
            <span className="text-gold">{stars}</span>
            <span>{battle.homeState}</span>
            {battle.stage !== "open" && (
              <span className={`px-1 py-0.5 rounded text-[8px] ${
                battle.stage === "verbal" ? "bg-amber-950/60 text-amber-300 border border-amber-600/40" :
                battle.stage === "top3" ? "bg-yellow-950/60 text-yellow-300 border border-yellow-600/40" :
                "bg-muted/40 text-muted-foreground border border-border"
              }`}>
                {stageLabel[battle.stage] ?? battle.stage}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-[10px] font-medium ${intensityColor}`}>
            {battle.humanRivalCount > 0
              ? `${battle.humanRivalCount} rival${battle.humanRivalCount !== 1 ? "s" : ""}`
              : `${battle.totalActiveCount} schools`}
          </div>
          {battle.offersOut > 0 && (
            <div className="text-[9px] text-muted-foreground">{battle.offersOut} offer{battle.offersOut !== 1 ? "s" : ""}</div>
          )}
        </div>
      </div>

      {/* Drama chips */}
      <DramaChips dramaTags={battle.dramaTags} maxVisible={4} />

      {/* My team movement */}
      {battle.myInterest && (
        <div className="flex items-center gap-2 text-[9px]">
          <span className="text-muted-foreground">My interest:</span>
          <span className={battle.myInterest.interestLevel > 60 ? "text-emerald-400" : "text-foreground"}>
            {battle.myInterest.interestLevel}%
          </span>
          <MovementIndicator delta={battle.myMovementDelta} />
          {battle.myInterest.hasOffer && <span className="text-gold">Offered</span>}
        </div>
      )}

      {/* Top schools strip */}
      {battle.topSchools.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
          {battle.topSchools.slice(0, 5).map(school => (
            <div
              key={school.teamId}
              className={`flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded border ${
                school.isMyTeam ? "border-gold/40 bg-gold/10 text-gold" :
                school.isHuman ? "border-orange-600/30 bg-orange-950/30 text-orange-300" :
                "border-border/40 bg-muted/20 text-muted-foreground"
              }`}
              title={school.teamName}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: school.primaryColor || "#888" }}
              />
              <span>{school.abbreviation}</span>
              {school.movementDir === "up" && <TrendingUp className="w-2 h-2 text-emerald-400" />}
              {school.movementDir === "down" && <TrendingDown className="w-2 h-2 text-red-400" />}
              {school.activityLevel === "High" && <span className="text-[7px] text-orange-400">H</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommitAnnouncementCard({ commit }: { commit: CommitAnnouncement }) {
  const stars = "★".repeat(Math.min(commit.starRank ?? 0, 5));
  return (
    <div
      className={`border rounded-lg p-3 flex items-center gap-3 ${
        commit.isMyTeam ? "border-gold/40 bg-gold/5" : "border-border bg-card"
      }`}
      data-testid={`commit-card-${commit.id}`}
    >
      {commit.signedTeamPrimaryColor && (
        <div
          className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
          style={{ backgroundColor: commit.signedTeamPrimaryColor }}
        >
          {commit.signedTeamAbbreviation?.slice(0, 2) ?? "?"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-[11px]">{commit.firstName} {commit.lastName}</span>
          {commit.isMyTeam && <span className="text-[8px] text-gold">Your Commit</span>}
        </div>
        <div className="text-[9px] text-muted-foreground">
          <span className="text-gold">{stars}</span> {commit.position} · {commit.homeState}
        </div>
        {commit.signedTeamName && (
          <div className="text-[9px] mt-0.5" style={{ color: commit.signedTeamPrimaryColor || undefined }}>
            {commit.signedTeamName}
          </div>
        )}
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
  onQuickPhone?: (recruitId: string) => void;
  onQuickEmail?: (recruitId: string) => void;
  pendingRecruitId?: string | null;
  weeklyActionsUsed: Record<string, string[]>;
  outOfActions: boolean;
}

function RecruitingBattlesPanel({
  battlesData,
  battleRecruits,
  trendsData,
  recommendationsByRecruit,
  pipelineData,
  storylineRecruitIds,
  onSelectRecruit,
  onQuickPhone,
  onQuickEmail,
  pendingRecruitId,
  weeklyActionsUsed,
  outOfActions,
}: RecruitingBattlesPanelProps) {
  const [showCommits, setShowCommits] = useState(true);
  const [showWatchlist, setShowWatchlist] = useState(true);

  const battles = battlesData?.battles ?? [];
  const recentCommits = battlesData?.recentCommits ?? [];

  const commitWatchBattles = battles.filter(b => b.dramaTags.includes("Commitment Watch") || b.dramaTags.includes("Decision Soon"));
  const rivalryBattles = battles.filter(b => b.rivalryAlert && !commitWatchBattles.includes(b));
  const otherBattles = battles.filter(b => !commitWatchBattles.includes(b) && !rivalryBattles.includes(b));

  // If battlesData isn't loaded yet, fall back to filtered recruits
  if (!battlesData) {
    return (
      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground">
          {battleRecruits.length} contested recruit{battleRecruits.length !== 1 ? "s" : ""}
        </p>
        <MobileRecruitList
          recruits={battleRecruits}
          trendsData={trendsData}
          recommendationsByRecruit={recommendationsByRecruit}
          positionNeeds={pipelineData?.positionNeeds}
          storylineRecruitIds={storylineRecruitIds}
          onSelectRecruit={onSelectRecruit}
          emptyMessage="No contested recruits right now"
          emptyIcon={<Flame className="w-10 h-10" />}
          onQuickPhone={onQuickPhone}
          onQuickEmail={onQuickEmail}
          pendingRecruitId={pendingRecruitId}
          weeklyActionsUsed={weeklyActionsUsed}
          outOfActions={outOfActions}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Recent Commitments */}
      {recentCommits.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1.5 text-[10px] font-pixel text-muted-foreground mb-2 w-full text-left"
            onClick={() => setShowCommits(v => !v)}
            data-testid="btn-toggle-commits"
          >
            {showCommits ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Commitments ({recentCommits.length})
          </button>
          {showCommits && (
            <div className="space-y-2">
              {recentCommits.slice(0, 5).map(c => (
                <CommitAnnouncementCard key={c.id} commit={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Commitment Watch */}
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

      {/* Rivalry Alerts */}
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

      {/* Rest of contested recruits */}
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
  isPhoning: boolean;
  isEmailing: boolean;
  weeklyActionsUsed: Record<string, string[]>;
  remainingPoints: number;
  leagueId: string;
  battlesData?: BattlesData;
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
  isPhoning,
  isEmailing,
  weeklyActionsUsed,
  remainingPoints,
  leagueId,
  battlesData,
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
  const [pendingAction, setPendingAction] = useState<{ recruitId: string; type: "phone" | "email" } | null>(null);
  const [showTopicSheet, setShowTopicSheet] = useState(false);
  const [lastActioningId, setLastActioningId] = useState<string | null>(null);

  const outOfActions = remainingPoints <= 0;
  const isPendingAny = isPhoning || isEmailing;

  function handleQuickPhone(recruitId: string) {
    setPendingAction({ recruitId, type: "phone" });
    setShowTopicSheet(true);
  }

  function handleQuickEmail(recruitId: string) {
    setPendingAction({ recruitId, type: "email" });
    setShowTopicSheet(true);
  }

  function handleTopicSelect(topic?: string) {
    if (!pendingAction) return;
    setLastActioningId(pendingAction.recruitId);
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
                variant="outline"
                size="sm"
                onClick={onOpenFilterSheet}
                className="h-9 shrink-0"
                data-testid="mobile-board-filter-btn"
              >
                <Search className="w-3.5 h-3.5 mr-1" />
                Filter
              </RetroButton>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {boardRecruits.length} recruit{boardRecruits.length !== 1 ? "s" : ""}
              {boardSearch && ` matching "${boardSearch}"`}
            </p>
            <MobileRecruitList
              recruits={boardRecruits}
              trendsData={trendsData}
              recommendationsByRecruit={recommendationsByRecruit}
              positionNeeds={pipelineData?.positionNeeds}
              storylineRecruitIds={storylineRecruitIds}
              onSelectRecruit={onSelectRecruit}
              emptyMessage={boardSearch ? "No recruits match your search" : "No recruits match current filters"}
              emptyIcon={<Target className="w-10 h-10" />}
              onQuickPhone={handleQuickPhone}
              onQuickEmail={handleQuickEmail}
              pendingRecruitId={pendingRecruitId}
              weeklyActionsUsed={weeklyActionsUsed}
              outOfActions={outOfActions}
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
              trendsData={trendsData}
              recommendationsByRecruit={recommendationsByRecruit}
              positionNeeds={pipelineData?.positionNeeds}
              storylineRecruitIds={storylineRecruitIds}
              onSelectRecruit={onSelectRecruit}
              emptyMessage="No recruits targeted yet"
              emptyIcon={<StarIcon className="w-10 h-10" />}
              onQuickPhone={handleQuickPhone}
              onQuickEmail={handleQuickEmail}
              pendingRecruitId={pendingRecruitId}
              weeklyActionsUsed={weeklyActionsUsed}
              outOfActions={outOfActions}
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
            onQuickPhone={handleQuickPhone}
            onQuickEmail={handleQuickEmail}
            pendingRecruitId={pendingRecruitId}
            weeklyActionsUsed={weeklyActionsUsed}
            outOfActions={outOfActions}
          />
        )}

        {activeTab === "needs" && (
          <MobileNeedsTab
            filteredRecruits={filteredRecruits}
            pipelineData={pipelineData}
            trendsData={trendsData}
            recommendationsByRecruit={recommendationsByRecruit}
            storylineRecruitIds={storylineRecruitIds}
            onSelectRecruit={onSelectRecruit}
            onQuickPhone={handleQuickPhone}
            onQuickEmail={handleQuickEmail}
            pendingRecruitId={pendingRecruitId}
            weeklyActionsUsed={weeklyActionsUsed}
            outOfActions={outOfActions}
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

      {/* Pitch topic picker — bottom sheet */}
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
