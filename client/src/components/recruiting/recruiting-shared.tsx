import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Lock } from "lucide-react";
import { TeamBadge } from "@/components/ui/team-badge";
import { LetterGrade } from "@/components/ui/letter-grade";
import { 
  getInterestLabel, 
  getInterestBarColor, 
  quantizeInterestWidth,
} from "@/lib/recruitingUtils";
import { ARCHETYPE_REVEAL_THRESHOLD } from "@shared/recruitThresholds";

interface TopSchoolEntry {
  teamId: string;
  teamName: string;
  abbreviation: string;
  primaryColor: string;
  interestLevel: number;
  previousInterestLevel?: number | null;
}

interface CompetingSchoolsListProps {
  topSchools: TopSchoolEntry[];
  stage: string;
  userTeamId?: string | null;
  trend?: { trend: "up" | "down" | "flat"; recentGain: number } | null;
  showRowRankBadge?: boolean;
  testIdPrefix?: string;
}

export function CompetingSchoolsList({
  topSchools,
  stage,
  userTeamId,
  trend,
  showRowRankBadge = false,
  testIdPrefix = "",
}: CompetingSchoolsListProps) {
  const visibleCount = stage === "top3" ? 3 : stage === "top5" ? 5 : 8;
  const visibleSchools = topSchools.slice(0, visibleCount);

  return (
    <div className="space-y-1.5" data-testid={`${testIdPrefix}competing-schools-list`}>
      {visibleSchools.map((school, idx) => {
        const isUserTeam = school.teamId === userTeamId;
        const interestMeta = getInterestLabel(school.interestLevel);
        const change = school.previousInterestLevel != null ? school.interestLevel - school.previousInterestLevel : 0;
        
        return (
          <div 
            key={school.teamId} 
            className={`flex items-center gap-3 p-1.5 rounded transition-colors ${isUserTeam ? "bg-gold/10 border border-gold/20" : "hover:bg-muted/30"}`}
            data-testid={`${testIdPrefix}school-row-${school.teamId}`}
          >
            {showRowRankBadge && (
              <span className="w-4 text-[9px] font-pixel text-muted-foreground text-center">
                {idx + 1}
              </span>
            )}
            <TeamBadge 
              abbreviation={school.abbreviation} 
              primaryColor={school.primaryColor} 
              secondaryColor="#fff" 
              name={school.teamName}
              size="xs" 
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-medium truncate ${isUserTeam ? "text-gold" : ""}`}>
                  {school.teamName} {isUserTeam && "(You)"}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isUserTeam && trend && trend.trend !== "flat" && (
                    <span className={`text-[9px] ${trend.trend === "up" ? "text-green-400" : "text-red-400"}`} data-testid={`${testIdPrefix}school-trend-${school.teamId}`}>
                      {trend.trend === "up" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    </span>
                  )}
                  {change !== 0 && !isUserTeam && (
                    <span className={`text-[8px] font-mono ${change > 0 ? "text-green-400" : "text-red-400"}`}>
                      {change > 0 ? "+" : ""}{change}
                    </span>
                  )}
                  <span className={`text-[9px] font-bold ${interestMeta.color}`}>
                    {interestMeta.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${getInterestBarColor(school.interestLevel)}`}
                    style={{ width: `${quantizeInterestWidth(school.interestLevel)}%` }}
                  />
                </div>
                <span className="text-[8px] font-mono text-muted-foreground w-6 text-right">
                  {Math.round(school.interestLevel)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SeeUponSigningBadge() {
  return (
    <span className="flex items-center gap-1 text-[9px] text-amber-400 font-pixel border border-amber-400/40 bg-amber-400/10 rounded px-1.5 py-0.5 whitespace-nowrap" title="Revealed on Signing Day">
      <Lock className="w-3 h-3 shrink-0" />
      <span className="hidden sm:inline">See Upon Signing</span>
    </span>
  );
}

export function CommonAbilityRow({ 
  label, 
  value, 
  scoutPct, 
  isFullyRevealed,
  isSigningDayLocked = false,
  goldAbilityName,
}: { 
  label: string; 
  value?: number | null; 
  scoutPct: number;
  isFullyRevealed: boolean;
  isSigningDayLocked?: boolean;
  goldAbilityName?: string;
}) {
  const revealed = isFullyRevealed || scoutPct >= ARCHETYPE_REVEAL_THRESHOLD;
  const displayValue = value ?? 50;

  if (isSigningDayLocked) {
    return (
      <div className="flex items-center justify-between p-2 bg-muted/50 rounded" data-testid={`common-ability-${label.toLowerCase().replace(/\s/g, "-")}`}>
        <span className="text-sm text-muted-foreground">{label}</span>
        <SeeUponSigningBadge />
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-between p-2 bg-muted/50 rounded" data-testid={`common-ability-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      {revealed ? (
        <div className="flex items-center gap-1">
          {goldAbilityName && (
            <span
              className="text-[8px] font-pixel px-1 py-0.5 rounded border"
              style={{ color: "#c4a35a", borderColor: "rgba(196,163,90,0.5)", background: "rgba(196,163,90,0.12)" }}
              title={goldAbilityName}
              data-testid={`common-ability-gold-badge-${label.toLowerCase().replace(/\s/g, "-")}`}
            >
              {goldAbilityName}
            </span>
          )}
          <LetterGrade value={displayValue} size="sm" isCommonAbility={true} />
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">??</span>
      )}
    </div>
  );
}
