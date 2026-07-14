import { useState } from "react";
import {
  Flame, AlertTriangle, DollarSign, Building2, Users,
  ChevronDown, ChevronUp, CheckCircle, Zap,
} from "lucide-react";
import type {
  BattlesData,
  RecruitingData,
  PipelineData,
  BattleRecruit,
  RecruitWithInterest,
} from "@/hooks/use-recruiting";
import type { RecruitingRecommendationsData, RecruitRecommendation } from "@/lib/recruitingUtils";

interface CommandCenterProps {
  recruitingData?: RecruitingData;
  battlesData?: BattlesData;
  pipelineData?: PipelineData;
  recommendationsData?: RecruitingRecommendationsData;
  allRecruits: RecruitWithInterest[];
  onSelectRecruit: (r: RecruitWithInterest) => void;
}

function formatNil(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function actionShortLabel(action: RecruitRecommendation["action"]): string {
  const map: Record<RecruitRecommendation["action"], string> = {
    email: "Email",
    phone: "Call",
    campus_visit: "Visit",
    hc_visit: "HC Visit",
    offer: "Offer",
    scout: "Scout",
    hold: "Hold",
  };
  return map[action] ?? action;
}

function CcCard({
  title,
  icon,
  children,
  accent = "gold",
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  accent?: "gold" | "red" | "orange" | "blue" | "green";
  badge?: number;
}) {
  const headerCls: Record<string, string> = {
    gold: "text-gold",
    red: "text-red-400",
    orange: "text-orange-400",
    blue: "text-blue-400",
    green: "text-emerald-400",
  };
  const borderCls: Record<string, string> = {
    gold: "border-gold/20",
    red: "border-red-500/20",
    orange: "border-orange-500/20",
    blue: "border-blue-500/20",
    green: "border-emerald-500/20",
  };

  return (
    <div
      className={`flex-1 min-w-[160px] max-w-[220px] rounded border bg-black/25 px-3 py-2.5 shrink-0 ${borderCls[accent]}`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`shrink-0 ${headerCls[accent]}`}>{icon}</span>
        <span className={`text-xs font-semibold uppercase tracking-wider ${headerCls[accent]}`}>
          {title}
        </span>
        {badge !== undefined && badge > 0 && (
          <span
            className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-black/40 ${headerCls[accent]}`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function RecruitChip({
  name,
  position,
  starRating,
  subtext,
  onClick,
  accent = "default",
}: {
  name: string;
  position: string;
  starRating: number;
  subtext?: string;
  onClick?: () => void;
  accent?: "default" | "red" | "orange" | "green";
}) {
  const hoverCls: Record<string, string> = {
    default: "hover:border-gold/40 hover:bg-gold/5",
    red: "hover:border-red-500/40 hover:bg-red-500/5",
    orange: "hover:border-orange-500/40 hover:bg-orange-500/5",
    green: "hover:border-emerald-500/40 hover:bg-emerald-500/5",
  };

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded border border-border/30 ${hoverCls[accent]} transition-colors text-left disabled:opacity-60 disabled:cursor-default`}
      data-testid={`cmd-center-${name.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <span className="text-xs text-gold shrink-0 leading-none">
        {"★".repeat(Math.min(5, Math.round(starRating)))}
      </span>
      <span className="text-xs font-medium text-foreground truncate flex-1">{name}</span>
      <span className="text-xs text-muted-foreground shrink-0">{position}</span>
      {subtext && (
        <span className="text-xs text-muted-foreground/70 shrink-0 ml-0.5">{subtext}</span>
      )}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted-foreground/60 italic py-1.5 text-center">{label}</p>
  );
}

export function RecruitingCommandCenter({
  recruitingData,
  battlesData,
  pipelineData,
  recommendationsData,
  allRecruits,
  onSelectRecruit,
}: CommandCenterProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem("recruiting-cc-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("recruiting-cc-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const nilRemaining = recruitingData?.economy?.nil?.recruitingRemaining
    ?? (recruitingData?.team ? (recruitingData.team.nilBudget || 0) - (recruitingData.team.nilSpent || 0) : 0);

  const economyLoading = recruitingData != null && recruitingData.economy == null;

  const visitsUsed = recruitingData?.economy?.visits?.totalUsed ?? recruitingData?.seasonVisitCount?.total ?? 0;
  const visitsMax = recruitingData?.economy?.visits?.totalCap ?? null;
  const visitPct = visitsMax != null ? Math.round((visitsUsed / visitsMax) * 100) : 0;
  const visitCapReached = visitsMax != null && visitsUsed >= visitsMax;

  const hotBattles: BattleRecruit[] = (battlesData?.battles ?? [])
    .filter((b) => b.battleScore >= 2 || b.rivalryAlert)
    .slice(0, 3);

  const atRisk = (recommendationsData?.weeklyPlan?.highRisk ?? []).slice(0, 3);
  const soonToCommit = (recommendationsData?.weeklyPlan?.soonToCommit ?? []).slice(0, 3);

  const nilCandidates = allRecruits
    .filter((r) => {
      if (r.signedTeamId) return false;
      if (r.interest?.hasOffer) return false;
      const cost = r.nilCost ?? 0;
      return cost > 0 && cost <= nilRemaining * 1.25;
    })
    .sort((a, b) => (b.nilCost ?? 0) - (a.nilCost ?? 0))
    .slice(0, 3);

  const posNeeds = (pipelineData?.positionNeeds ?? []).filter((p) => p.need);

  const findRecruit = (recruitId: string) =>
    allRecruits.find((r) => r.id === recruitId) ?? null;

  const alertCount =
    hotBattles.length +
    atRisk.length;

  return (
    <div
      className="mb-5 rounded border border-border bg-background/60 overflow-hidden"
      data-testid="recruiting-command-center"
    >
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
        data-testid="button-toggle-command-center"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-gold" />
          <span className="text-xs font-semibold text-gold uppercase tracking-wider">
            Command Center
          </span>
          {alertCount > 0 && (
            <span className="text-xs text-red-400 border border-red-500/40 rounded px-1.5 py-0.5">
              {alertCount} alerts
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 border-t border-border/40">
          <div className="flex gap-3 overflow-x-auto py-3 pb-1 scrollbar-thin">

            {/* Hot Battles */}
            <CcCard
              title="Hot Battles"
              icon={<Flame className="w-3 h-3" />}
              accent="orange"
              badge={hotBattles.length}
            >
              {hotBattles.length === 0 ? (
                <EmptyState label="No fierce battles" />
              ) : (
                hotBattles.map((b) => {
                  const r = findRecruit(b.id);
                  return (
                    <RecruitChip
                      key={b.id}
                      name={`${b.firstName} ${b.lastName}`}
                      position={b.position}
                      starRating={b.starRating ?? b.starRank ?? 0}
                      onClick={r ? () => onSelectRecruit(r) : undefined}
                      subtext={`${b.humanRivalCount}R`}
                      accent="orange"
                    />
                  );
                })
              )}
            </CcCard>

            {/* At Risk */}
            <CcCard
              title="At Risk"
              icon={<AlertTriangle className="w-3 h-3" />}
              accent="red"
              badge={atRisk.length}
            >
              {atRisk.length === 0 ? (
                <EmptyState label="No recruits at risk" />
              ) : (
                atRisk.map((item) => {
                  const r = findRecruit(item.recruitId);
                  return (
                    <RecruitChip
                      key={item.recruitId}
                      name={`${item.firstName} ${item.lastName}`}
                      position={item.position}
                      starRating={item.starRating}
                      onClick={r ? () => onSelectRecruit(r) : undefined}
                      subtext={actionShortLabel(item.action)}
                      accent="red"
                    />
                  );
                })
              )}
            </CcCard>

            {/* Soon to Commit */}
            <CcCard
              title="Close to Commit"
              icon={<CheckCircle className="w-3 h-3" />}
              accent="green"
              badge={soonToCommit.length}
            >
              {soonToCommit.length === 0 ? (
                <EmptyState label="None close yet" />
              ) : (
                soonToCommit.map((item) => {
                  const r = findRecruit(item.recruitId);
                  return (
                    <RecruitChip
                      key={item.recruitId}
                      name={`${item.firstName} ${item.lastName}`}
                      position={item.position}
                      starRating={item.starRating}
                      onClick={r ? () => onSelectRecruit(r) : undefined}
                      subtext={actionShortLabel(item.action)}
                      accent="green"
                    />
                  );
                })
              )}
            </CcCard>

            {/* NIL Watch */}
            <CcCard
              title="NIL Watch"
              icon={<DollarSign className="w-3 h-3" />}
              accent="gold"
            >
              <div className="flex items-baseline gap-1 mb-1.5">
                <span className="text-[13px] font-bold text-gold">{formatNil(nilRemaining)}</span>
                <span className="text-xs text-muted-foreground">remaining</span>
              </div>
              {nilCandidates.length === 0 ? (
                <EmptyState label="No NIL-ready targets" />
              ) : (
                nilCandidates.map((r) => (
                  <RecruitChip
                    key={r.id}
                    name={`${r.firstName} ${r.lastName}`}
                    position={r.position}
                    starRating={r.starRating ?? r.starRank ?? 0}
                    onClick={() => onSelectRecruit(r)}
                    subtext={r.nilCost ? formatNil(r.nilCost) : undefined}
                  />
                ))
              )}
            </CcCard>

            {/* Visit Planner */}
            <CcCard
              title="Visit Planner"
              icon={<Building2 className="w-3 h-3" />}
              accent={
                economyLoading ? "blue" : visitCapReached ? "red" : visitPct >= 80 ? "orange" : "blue"
              }
            >
              {economyLoading ? (
                <div className="space-y-2" data-testid="visit-planner-skeleton">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-0 rounded-full bg-blue-400/30" />
                    </div>
                    <span className="text-xs text-muted-foreground/40 tabular-nums shrink-0">—/—</span>
                  </div>
                  <div className="h-2.5 w-24 rounded bg-white/10 animate-pulse" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          visitCapReached
                            ? "bg-red-400"
                            : visitPct >= 80
                            ? "bg-orange-400"
                            : "bg-blue-400"
                        }`}
                        style={{ width: `${Math.min(100, visitPct)}%` }}
                      />
                    </div>
                    <span
                      data-testid="visit-planner-count"
                      className={`text-xs font-bold tabular-nums shrink-0 ${
                        visitCapReached
                          ? "text-red-400"
                          : visitPct >= 80
                          ? "text-orange-400"
                          : "text-blue-400"
                      }`}
                    >
                      {visitsUsed}/{visitsMax ?? "—"}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span data-testid="visit-planner-campus-count">{recruitingData?.economy?.visits?.campusUsed ?? recruitingData?.seasonVisitCount?.campusVisits ?? 0} campus</span>
                    <span>·</span>
                    <span data-testid="visit-planner-hc-count">{recruitingData?.economy?.visits?.headCoachUsed ?? recruitingData?.seasonVisitCount?.hcVisits ?? 0} HC</span>
                  </div>
                  {visitCapReached && (
                    <p className="text-xs text-red-400 mt-1 font-semibold">Visit cap reached</p>
                  )}
                </>
              )}
            </CcCard>

            {/* Roster Needs */}
            <CcCard
              title="Roster Needs"
              icon={<Users className="w-3 h-3" />}
              accent={posNeeds.length > 0 ? "red" : "gold"}
              badge={posNeeds.length}
            >
              {posNeeds.length === 0 ? (
                <EmptyState label="All positions covered" />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {posNeeds.map((p) => (
                    <span
                      key={p.position}
                      className="text-xs font-bold px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-400"
                      data-testid={`cmd-need-${p.position}`}
                    >
                      {p.position}
                    </span>
                  ))}
                </div>
              )}
              {pipelineData && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {pipelineData.rosterSize} on roster · {recruitingData?.commitsCount ?? 0} committed
                </p>
              )}
            </CcCard>
          </div>
        </div>
      )}
    </div>
  );
}
