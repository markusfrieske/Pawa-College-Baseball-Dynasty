import type { Recruit, RecruitingInterest, LastSeasonStats } from "@shared/schema";
import { S_GOLD_COMMON_KEY, S_GOLD_PITCHER_KEY } from "@shared/abilities";

export const NIL_SCOUT_THRESHOLD = 50;

export interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
  topSchools?: { 
    teamId: string; 
    teamName: string; 
    abbreviation: string; 
    primaryColor: string; 
    interestLevel: number; 
    previousInterestLevel?: number | null 
  }[];
  signedTeamName?: string | null;
  signedTeamAbbreviation?: string | null;
  signedTeamPrimaryColor?: string | null;
  signedTeamSecondaryColor?: string | null;
  competingCount?: number | null;
  competingIntensity?: string | null;
  teamsIn?: number | null;
  offersOut?: number | null;
  signingDayLockedFields?: string[] | null;
  lastSeasonStats?: LastSeasonStats | null;
  dramaTags?: string[] | null;
  rivalryAlert?: boolean | null;
  myMovementDelta?: number | null;
}

export interface RecruitRecommendation {
  recruitId: string;
  firstName: string;
  lastName: string;
  position: string;
  starRating: number;
  stage: string;
  action: "email" | "phone" | "campus_visit" | "hc_visit" | "offer" | "scout" | "hold";
  reason: string;
  urgency: number;
  interestLevel: number;
  trend: "up" | "down" | "flat";
  teamsIn: number;
  positionNeed: boolean;
}

export interface RecruitingRecommendationsData {
  season: number;
  week: number;
  remainingPoints: number;
  remainingScoutPoints: number;
  recommendations: RecruitRecommendation[];
  weeklyPlan: {
    topActions: RecruitRecommendation[];
    highRisk: RecruitRecommendation[];
    soonToCommit: RecruitRecommendation[];
    slippingAway: RecruitRecommendation[];
    uncoveredNeeds: string[];
  };
}

export const RECOMMENDED_ACTION_META: Record<RecruitRecommendation["action"], { label: string; color: string }> = {
  email: { label: "EMAIL", color: "border-blue-400/60 text-blue-300 bg-blue-500/10" },
  phone: { label: "CALL", color: "border-sky-400/60 text-sky-300 bg-sky-500/10" },
  campus_visit: { label: "VISIT", color: "border-emerald-400/60 text-emerald-300 bg-emerald-500/10" },
  hc_visit: { label: "HC VISIT", color: "border-violet-400/60 text-violet-300 bg-violet-500/10" },
  offer: { label: "OFFER", color: "border-gold/60 text-gold bg-gold/10" },
  scout: { label: "SCOUT", color: "border-orange-400/60 text-orange-300 bg-orange-500/10" },
  hold: { label: "HOLD", color: "border-muted-foreground/40 text-muted-foreground bg-muted/20" },
};

export function formatNilRange(nilCost: number): string {
  const lo = Math.floor(nilCost * 0.75);
  const hi = Math.ceil(nilCost * 1.25);
  function fmt(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${n}`;
  }
  return `${fmt(lo)}–${fmt(hi)}`;
}

export function getInterestLabel(level: number): { label: string; color: string } {
  if (level >= 90) return { label: "On Fire", color: "text-red-400" };
  if (level >= 70) return { label: "Very Hot", color: "text-orange-400" };
  if (level >= 50) return { label: "Hot", color: "text-yellow-400" };
  if (level >= 30) return { label: "Warm", color: "text-green-400" };
  if (level >= 15) return { label: "Cool", color: "text-blue-400" };
  return { label: "Cold", color: "text-blue-300" };
}

export function getInterestBarColor(level: number): string {
  if (level >= 90) return "bg-red-400";
  if (level >= 70) return "bg-orange-400";
  if (level >= 50) return "bg-yellow-400";
  if (level >= 30) return "bg-green-400";
  if (level >= 15) return "bg-blue-400";
  return "bg-blue-300";
}

export function quantizeInterestWidth(level: number): number {
  return Math.min(100, Math.round(level / 20) * 20);
}

export function qualifyTrend(gain: number): string {
  if (gain >= 15) return "rising sharply";
  if (gain >= 7) return "rising";
  if (gain > 0) return "rising slightly";
  if (gain <= -15) return "falling sharply";
  if (gain <= -7) return "falling";
  return "falling slightly";
}

export function getInterestChangeLabel(change: number): { label: string; color: string } {
  if (change >= 15) return { label: "Big Boost", color: "text-green-400" };
  if (change >= 8) return { label: "Good Progress", color: "text-green-400" };
  if (change >= 3) return { label: "Some Interest", color: "text-yellow-400" };
  return { label: "Slight Interest", color: "text-blue-400" };
}

export const positionOptions = [
  { value: "all", label: "All Positions" },
  { value: "P", label: "Pitcher" },
  { value: "C", label: "Catcher" },
  { value: "1B", label: "First Base" },
  { value: "2B", label: "Second Base" },
  { value: "SS", label: "Shortstop" },
  { value: "3B", label: "Third Base" },
  { value: "OF", label: "Outfield (OF)" },
];

export const starOptions = [
  { value: "all", label: "All Stars" },
  { value: "5", label: "5 Star" },
  { value: "4", label: "4+ Star" },
  { value: "3", label: "3+ Star" },
];

export const sortOptions = [
  { value: "boardRank", label: "My Board Rank" },
  { value: "classRank", label: "Class Rank" },
  { value: "positionRank", label: "Position Rank" },
  { value: "overall", label: "Overall (High to Low)" },
  { value: "starRank", label: "Star Rating" },
  { value: "name", label: "Name (A-Z)" },
  { value: "state", label: "Home State" },
  { value: "scoutPriority", label: "Scout Priority (Targeted First)" },
  { value: "interest", label: "Interest Level" },
  { value: "myInterest", label: "Interest in You (High to Low)" },
  { value: "trendUp", label: "Rising Interest First" },
  { value: "competition", label: "Most Contested First" },
  { value: "myRank", label: "My Rank (Best First)" },
];

export const COMMON_KEY_TO_GOLD_LIST: Record<string, string[]> = {};
for (const [gold, key] of Object.entries(S_GOLD_COMMON_KEY)) {
  if (!COMMON_KEY_TO_GOLD_LIST[key]) COMMON_KEY_TO_GOLD_LIST[key] = [];
  COMMON_KEY_TO_GOLD_LIST[key].push(gold);
}

export function recruitSGoldBadge(attrVal: number | null | undefined, commonKey: string, abilities?: string[]): string | undefined {
  const goldList = COMMON_KEY_TO_GOLD_LIST[commonKey];
  if (!goldList) return undefined;
  if (abilities) {
    const abilitySet = new Set(abilities);
    const fromAbilities = goldList.find(g => abilitySet.has(g));
    if (fromAbilities) return fromAbilities;
  }
  if ((attrVal ?? 0) >= 90) return goldList[0];
  return undefined;
}

export function recruitSGoldDisplayValue(attrVal: number | null | undefined, commonKey: string, abilities?: string[]): number | null | undefined {
  const goldList = COMMON_KEY_TO_GOLD_LIST[commonKey];
  if (!goldList) return attrVal;
  if (abilities) {
    const abilitySet = new Set(abilities);
    if (goldList.some(g => abilitySet.has(g))) return 90;
  }
  return attrVal;
}

export function recruitPitcherSGoldBadge(attrKey: string, attrVal: number | null | undefined, abilities?: string[]): string | undefined {
  const abilitySet = abilities ? new Set(abilities) : new Set<string>();
  for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
    if (linkedKey === attrKey && abilitySet.has(goldName)) return goldName;
  }
  if ((attrVal ?? 0) >= 90) {
    for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
      if (linkedKey === attrKey) return goldName;
    }
  }
  return undefined;
}

export function recruitPitcherSGoldDisplayValue(attrVal: number | null | undefined, attrKey: string, abilities?: string[]): number | null | undefined {
  const abilitySet = abilities ? new Set(abilities) : new Set<string>();
  for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
    if (linkedKey === attrKey && abilitySet.has(goldName)) return 90;
  }
  return attrVal;
}

export function filterRecruits(
  recruits: RecruitWithInterest[],
  filters: {
    searchQuery: string;
    positionFilter: string;
    starFilter: string;
    stateFilter: string;
    typeFilter: string;
    showWatchlistOnly: boolean;
    showContested: boolean;
    showStory: boolean;
    storylineRecruitIds: Set<string>;
    showTopAvailable: boolean;
    positionNeeds?: { position: string; need: boolean }[];
    sortBy: string;
    pipelineFilter: string | null;
    teamState?: string;
    showOfferedOnly?: boolean;
    showInStateOnly?: boolean;
    showAffordableOnly?: boolean;
    showHighRivalPressure?: boolean;
    nilRemaining?: number;
  }
): RecruitWithInterest[] {
  return recruits.filter(r => {
    const searchLower = filters.searchQuery.toLowerCase();
    if (filters.searchQuery && !`${r.firstName} ${r.lastName}`.toLowerCase().includes(searchLower)) return false;
    if (filters.positionFilter !== "all" && r.position !== filters.positionFilter) return false;
    if (filters.starFilter !== "all" && r.starRank < parseInt(filters.starFilter)) return false;
    if (filters.stateFilter !== "all" && r.homeState !== filters.stateFilter) return false;
    if (filters.typeFilter !== "all") {
      const rt = r.recruitType || "HS";
      if (filters.typeFilter === "HS" && rt !== "HS") return false;
      if (filters.typeFilter === "TRANSFER" && rt !== "TRANSFER") return false;
      if (filters.typeFilter === "JUCO" && rt !== "JUCO") return false;
    }
    if (filters.showWatchlistOnly && !r.interest?.isTargeted) return false;
    if (filters.showContested && !(r.teamsIn && r.teamsIn >= 3)) return false;
    if (filters.showStory && !filters.storylineRecruitIds.has(r.id)) return false;
    if (filters.showTopAvailable && filters.positionNeeds) {
      const needPositions = filters.positionNeeds.filter(p => p.need).map(p => p.position);
      if (!needPositions.includes(r.position)) return false;
      if (r.signedTeamId) return false;
    }
    if (filters.showOfferedOnly && !r.interest?.hasOffer) return false;
    if (filters.showInStateOnly && filters.teamState && r.homeState !== filters.teamState) return false;
    if (filters.showAffordableOnly && r.nilCost != null && filters.nilRemaining != null) {
      if (Math.ceil(r.nilCost * 1.25) > filters.nilRemaining) return false;
    }
    if (filters.showHighRivalPressure && !(r.teamsIn && r.teamsIn >= 2)) return false;
    if (filters.sortBy === "interest" && !(r.interest && (r.interest.interestLevel || 0) > 0)) return false;
    if (filters.sortBy === "myInterest" && !(r.interest && (r.interest.interestLevel || 0) > 0)) return false;
    
    if (filters.pipelineFilter) {
      if (filters.pipelineFilter !== "committed" && r.signedTeamId) return false;
      const level = r.interest?.interestLevel || 0;
      if (filters.pipelineFilter === "cold" && !(level >= 1 && level <= 14)) return false;
      if (filters.pipelineFilter === "cool" && !(level >= 15 && level <= 29)) return false;
      if (filters.pipelineFilter === "warm" && !(level >= 30 && level <= 49)) return false;
      if (filters.pipelineFilter === "hot" && !(level >= 50 && level <= 69)) return false;
      if (filters.pipelineFilter === "very_hot" && !(level >= 70 && level <= 89)) return false;
      if (filters.pipelineFilter === "on_fire" && !(level >= 90)) return false;
      if (filters.pipelineFilter === "committed" && !r.signedTeamId) return false;
      if (filters.pipelineFilter === "home_state" && r.homeState !== filters.teamState) return false;
      if (filters.pipelineFilter === "home_region") {
        const ts = filters.teamState || "";
        const adj: Record<string, string[]> = {
          "AL":["FL","GA","MS","TN"],"AZ":["CA","CO","NM","NV","UT"],"AR":["LA","MO","MS","OK","TN","TX"],
          "CA":["AZ","NV","OR"],"CO":["AZ","KS","NE","NM","OK","UT","WY"],"CT":["MA","NY","RI"],
          "DE":["MD","NJ","PA"],"FL":["AL","GA"],"GA":["AL","FL","NC","SC","TN"],
          "ID":["MT","NV","OR","UT","WA","WY"],"IL":["IA","IN","KY","MO","WI"],"IN":["IL","KY","MI","OH"],
          "IA":["IL","MN","MO","NE","SD","WI"],"KS":["CO","MO","NE","OK"],"KY":["IL","IN","MO","OH","TN","VA","WV"],
          "LA":["AR","MS","TX"],"ME":["NH"],"MD":["DE","PA","VA","WV","DC"],"MA":["CT","NH","NY","RI","VT"],
          "MI":["IN","OH","WI"],"MN":["IA","ND","SD","WI"],"MS":["AL","AR","LA","TN"],
          "MO":["AR","IA","IL","KS","KY","NE","OK","TN"],"MT":["ID","ND","SD","WY"],
          "NE":["CO","IA","KS","MO","SD","WY"],"NV":["AZ","CA","ID","OR","UT"],"NH":["MA","ME","VT"],
          "NJ":["DE","NY","PA"],"NM":["AZ","CO","OK","TX","UT"],"NY":["CT","MA","NJ","PA","VT"],
          "NC":["GA","SC","TN","VA"],"ND":["MN","MT","SD"],"OH":["IN","KY","MI","PA","WV"],
          "OK":["AR","CO","KS","MO","NM","TX"],"OR":["CA","ID","NV","WA"],"PA":["DE","MD","NJ","NY","OH","WV"],
          "RI":["CT","MA"],"SC":["GA","NC"],"SD":["IA","MN","MT","ND","NE","WY"],
          "TN":["AL","AR","GA","KY","MO","MS","NC","VA"],"TX":["AR","LA","NM","OK"],
          "UT":["AZ","CO","ID","NM","NV","WY"],"VT":["MA","NH","NY"],"VA":["KY","MD","NC","TN","WV","DC"],
          "WA":["ID","OR"],"WV":["KY","MD","OH","PA","VA"],"WI":["IA","IL","MI","MN"],
          "WY":["CO","ID","MT","NE","SD","UT"],"DC":["MD","VA"],
        };
        const neighbors = new Set(adj[ts] || []);
        if (r.homeState === ts || !neighbors.has(r.homeState)) return false;
      }
    }
    return true;
  });
}

export function sortRecruits(
  recruits: RecruitWithInterest[],
  sortBy: string,
  trendsData?: { trends: Record<string, { trend: "up" | "down" | "flat"; recentGain: number }> },
  teamId?: string
): RecruitWithInterest[] {
  return [...recruits].sort((a, b) => {
    switch (sortBy) {
      case "classRank":
        return (a.classRank || 999) - (b.classRank || 999);
      case "positionRank":
        return (a.positionRank || 999) - (b.positionRank || 999);
      case "overall": {
        const getDisplayOverall = (r: RecruitWithInterest) => {
          if (r.isBlueChip) return r.overall;
          const pct = r.interest?.scoutPercentage || 0;
          if (pct >= 100) return r.overall;
          if (pct === 0) return -1;
          const min = r.interest?.minOverall || 1;
          const max = r.interest?.maxOverall || 999;
          return Math.floor((min + max) / 2);
        };
        return getDisplayOverall(b) - getDisplayOverall(a);
      }
      case "starRank": {
        const getScoutedStar = (r: RecruitWithInterest): number => {
          if (r.isBlueChip) return r.starRank;
          const pct = r.interest?.scoutPercentage || 0;
          if (pct >= 100) return r.starRank;
          if (pct === 0) return -1;
          const mid = Math.floor(((r.interest?.minOverall || 1) + (r.interest?.maxOverall || 999)) / 2);
          if (mid >= 500) return 5;
          if (mid >= 400) return 4;
          if (mid >= 300) return 3;
          if (mid >= 200) return 2;
          return 1;
        };
        return getScoutedStar(b) - getScoutedStar(a) || (a.classRank || 999) - (b.classRank || 999);
      }
      case "name":
        return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
      case "state":
        return (a.homeState || "").localeCompare(b.homeState || "") || (a.classRank || 999) - (b.classRank || 999);
      case "scoutPriority": {
        const aTargeted = a.interest?.isTargeted ? 0 : 1;
        const bTargeted = b.interest?.isTargeted ? 0 : 1;
        if (aTargeted !== bTargeted) return aTargeted - bTargeted;
        return (a.interest?.scoutPercentage || 0) - (b.interest?.scoutPercentage || 0);
      }
      case "interest":
        return (b.interest?.interestLevel || 0) - (a.interest?.interestLevel || 0);
      case "myInterest": {
        const aLevel = a.interest?.interestLevel || 0;
        const bLevel = b.interest?.interestLevel || 0;
        return bLevel - aLevel;
      }
      case "trendUp": {
        const trendScore = (recruitId: string) => {
          const t = trendsData?.trends?.[recruitId]?.trend;
          return t === "up" ? 2 : t === "flat" ? 1 : 0;
        };
        const diff = trendScore(b.id) - trendScore(a.id);
        if (diff !== 0) return diff;
        return (b.interest?.interestLevel || 0) - (a.interest?.interestLevel || 0);
      }
      case "competition": {
        return (b.teamsIn || 0) - (a.teamsIn || 0);
      }
      case "myRank": {
        const userTeamId = teamId;
        const getRank = (r: RecruitWithInterest): number => {
          if (!userTeamId || !r.topSchools) return 9999;
          const scoutPct = r.interest?.scoutPercentage || 0;
          if (scoutPct === 0) return 9999;
          const visibleCount = r.stage === "top3" ? 3 : r.stage === "top5" ? 5 : 8;
          const idx = r.topSchools.slice(0, visibleCount).findIndex(s => s.teamId === userTeamId);
          return idx === -1 ? 9999 : idx + 1;
        };
        const aRank = getRank(a);
        const bRank = getRank(b);
        if (aRank !== bRank) return aRank - bRank;
        return (a.classRank || 999) - (b.classRank || 999);
      }
      case "boardRank": {
        const aRank = a.interest?.boardRank ?? 9999;
        const bRank = b.interest?.boardRank ?? 9999;
        if (aRank !== bRank) return aRank - bRank;
        return (a.classRank || 999) - (b.classRank || 999);
      }
      default:
        return (a.classRank || 999) - (b.classRank || 999);
    }
  });
}
