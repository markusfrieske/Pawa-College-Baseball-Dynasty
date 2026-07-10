import { useState, useRef } from "react";
import { Link } from "wouter";
import { DramaChips, MovementIndicator } from "./drama-chips";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { PositionBadge } from "@/components/ui/position-badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Target, Search, Eye, Phone, Mail, MapPin, GraduationCap, Check, StickyNote,
  Gem, XCircle, TrendingUp, TrendingDown, Flame, ChevronDown, ChevronUp, Star,
  Skull, Lock, BookOpen, Gift, MoreHorizontal, Building2, Crown, Zap
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAbilityByName } from "@shared/abilities";
import { TRAJECTORY_REVEAL_THRESHOLD, ARCHETYPE_REVEAL_THRESHOLD, computeRevealedPitchFields } from "@shared/recruitThresholds";
import { TrajectoryIcon } from "@/components/ui/trajectory-icon";
import { TRAJECTORY_FULL_LABELS } from "@shared/trajectory";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { LetterGrade, getLetterGrade } from "@/components/ui/letter-grade";
import { velocityToKMH } from "@/lib/playerUtils";
import { getPotentialRangeLabel } from "@shared/potential";
import { 
  formatNilRange, 
  getInterestLabel, 
  getInterestBarColor, 
  quantizeInterestWidth, 
  qualifyTrend, 
  NIL_SCOUT_THRESHOLD,
  RECOMMENDED_ACTION_META,
  type RecruitWithInterest,
  type RecruitRecommendation,
} from "@/lib/recruitingUtils";
import { CompetingSchoolsList, SeeUponSigningBadge } from "./recruiting-shared";

export 
function RecruitRow({
  recruit,
  leagueId,
  onTarget,
  onScout,
  onPhone,
  onEmail,
  onVisit,
  onHeadCoachVisit,
  onOffer,
  onSaveNotes,
  onSetBoardRank,
  onToggleCompare,
  isTargeting,
  isScouting,
  isPhoning,
  isEmailing,
  isVisiting,
  isHeadCoachVisiting,
  isOffering,
  isSavingNotes,
  isSavingBoardRank,
  isSelected,
  trend,
  userTeamId,
  recommendation,
  isStorylineRecruit,
  positionNeed,
  outOfRecruitingActions,
  remainingPoints,
  visitCost,
  headCoachVisitCost,
  outOfScoutActions,
  progressionEnabled,
  hasVisited,
  hasHeadCoachVisited,
  phonedThisWeek,
  emailedThisWeek,
  nilRemaining,
  seasonVisitCapReached,
}: {
  recruit: RecruitWithInterest;
  leagueId: string;
  onTarget: () => void;
  onScout: () => void;
  onPhone: (pitchTopic?: string) => void;
  onEmail: (pitchTopic?: string) => void;
  onVisit: () => void;
  onHeadCoachVisit: () => void;
  onOffer: () => void;
  onSaveNotes: (notes: string) => void;
  onSetBoardRank: (boardRank: number | null) => void;
  onToggleCompare: () => void;
  isTargeting: boolean;
  isScouting: boolean;
  isPhoning: boolean;
  isEmailing: boolean;
  isVisiting: boolean;
  isHeadCoachVisiting: boolean;
  isOffering: boolean;
  isSavingNotes: boolean;
  isSavingBoardRank: boolean;
  isSelected: boolean;
  trend?: { trend: "up" | "down" | "flat"; recentGain: number };
  userTeamId?: string;
  recommendation?: RecruitRecommendation;
  positionNeed?: boolean;
  outOfRecruitingActions?: boolean;
  remainingPoints: number;
  visitCost: number;
  headCoachVisitCost: number;
  outOfScoutActions?: boolean;
  progressionEnabled?: boolean;
  hasVisited?: boolean;
  hasHeadCoachVisited?: boolean;
  isStorylineRecruit?: boolean;
  phonedThisWeek?: boolean;
  emailedThisWeek?: boolean;
  nilRemaining?: number;
  seasonVisitCapReached?: boolean;
}) {
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notesValue, setNotesValue] = useState(recruit.interest?.notes || "");
  const [showRankEditor, setShowRankEditor] = useState(false);
  const [rankInputValue, setRankInputValue] = useState(String(recruit.interest?.boardRank ?? ""));
  const rankCommittedRef = useRef(false);
  const [showPhonePicker, setShowPhonePicker] = useState(false);
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [selectedPhonePitches, setSelectedPhonePitches] = useState<string[]>([]);
  const [selectedEmailPitch, setSelectedEmailPitch] = useState<string | null>(null);
  const [showTopSchools, setShowTopSchools] = useState(() => {
    if (recruit.stage === "verbal") return true;
    if (!recruit.topSchools || !userTeamId) return false;
    const visibleCount = recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8;
    return recruit.topSchools.slice(0, visibleCount).some(s => s.teamId === userTeamId);
  });
  const [showMobileMore, setShowMobileMore] = useState(false);

  const isOverNilBudget = nilRemaining != null && Math.ceil((recruit.nilCost || 0) * 1.25) > nilRemaining && !recruit.interest?.hasOffer && (recruit.interest?.scoutPercentage || 0) >= NIL_SCOUT_THRESHOLD;

  const pitchOptions = [
    { key: "proximity", label: "Proximity" },
    { key: "reputation", label: "Reputation" },
    { key: "playingTime", label: "Playing Time" },
    { key: "academics", label: "Academics" },
    { key: "prestige", label: "Prestige" },
    { key: "facilities", label: "Facilities" },
    { key: "collegeLife", label: "College Life" },
  ];

  const togglePhonePitch = (key: string) => {
    setSelectedPhonePitches(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  const stageBadges: Record<string, { label: string; color: string }> = {
    open: { label: "Open", color: "bg-gray-500" },
    top8: { label: "Top 8", color: "bg-blue-500" },
    top5: { label: "Top 5", color: "bg-green-500" },
    top3: { label: "Top 3", color: "bg-yellow-500" },
    verbal: { label: "Verbal", color: "bg-orange-500" },
    signed: { label: "Signed", color: "bg-red-500" },
  };

  const stage = stageBadges[recruit.stage] || stageBadges.open;
  const verbalSchoolCount = recruit.stage === "verbal" ? (recruit.topSchools?.length ?? 0) : 0;
  const stageDisplay = recruit.stage === "verbal"
    ? { label: `Deciding (${verbalSchoolCount} Schools)`, color: "bg-amber-500" }
    : stage;
  const scoutPct = recruit.interest?.scoutPercentage || 0;
  // Blue chips always show full details; everyone else must wait for the signing-day reveal
  const isFullyRevealed = recruit.isBlueChip || !!recruit.signingDayRevealed;

  // Stat/attribute preview strip computations
  const isPitcherRecruit = ["P", "SP", "RP", "CP", "LHP", "RHP"].includes(recruit.position || "");
  const sdAttrSet = new Set<string>(recruit.signingDayLockedFields || []);
  const revealedAttrSet = new Set<string>(
    isFullyRevealed
      ? (isPitcherRecruit
          ? ["velocity","control","stamina","fielding","wRISP","vsLefty","poise","grit","heater","agile","recovery"]
          : ["hitForAvg","power","speed","fielding","arm","errorResistance","clutch","vsLHP","grit","stealing","running","throwing","recovery"])
      : ((recruit.interest?.revealedAttributes as string[] | undefined) || [])
  );
  const isAttrRevealed = (key: string) => !sdAttrSet.has(key) && (isFullyRevealed || revealedAttrSet.has(key));
  // Primary attrs — row 1 of the strip
  const primaryAttrFields = isPitcherRecruit
    ? [
        { label: "VEL", key: "velocity",  val: recruit.velocity },
        { label: "CTL", key: "control",   val: recruit.control },
        { label: "STM", key: "stamina",   val: recruit.stamina },
        { label: "FLD", key: "fielding",  val: recruit.fielding },
      ]
    : [
        { label: "HIT",  key: "hitForAvg",      val: recruit.hitForAvg },
        { label: "PWR",  key: "power",           val: recruit.power },
        { label: "SPD",  key: "speed",           val: recruit.speed },
        { label: "ARM",  key: "arm",             val: recruit.arm },
        { label: "FLD",  key: "fielding",        val: recruit.fielding },
        { label: "ERR",  key: "errorResistance", val: recruit.errorResistance },
      ];
  // Common ability attrs — row 2 of the strip
  const commonAttrFields = isPitcherRecruit
    ? [
        { label: "RISP", key: "wRISP",    val: recruit.wRISP },
        { label: "LFT",  key: "vsLefty",  val: recruit.vsLefty },
        { label: "PSE",  key: "poise",    val: recruit.poise },
        { label: "GRIT", key: "grit",     val: recruit.grit },
        { label: "HTR",  key: "heater",   val: recruit.heater },
        { label: "AGL",  key: "agile",    val: recruit.agile },
        { label: "RCV",  key: "recovery", val: recruit.recovery },
      ]
    : [
        { label: "CLU",  key: "clutch",    val: recruit.clutch },
        { label: "LHP",  key: "vsLHP",     val: recruit.vsLHP },
        { label: "GRIT", key: "grit",      val: recruit.grit },
        { label: "STL",  key: "stealing",  val: recruit.stealing },
        { label: "RUN",  key: "running",   val: recruit.running },
        { label: "THW",  key: "throwing",  val: recruit.throwing },
        { label: "RCV",  key: "recovery",  val: recruit.recovery },
      ];
  const ATTR_GRADE_COLORS: Record<string, string> = {
    s: "#fda4d5", a: "#ef4444", b: "#ef4444", c: "#f97316",
    d: "#eab308", f: "#60a5fa", g: "#9ca3af",
  };
  const COMMON_TIER_COLORS: Record<string, string> = {
    s: "#f59e0b", a: "#3b82f6", b: "#3b82f6", c: "#38bdf8",
    d: "#38bdf8", f: "#ef4444", g: "#ef4444",
  };
  const hasTransferStats = recruit.recruitType === "TRANSFER" && !!recruit.lastSeasonStats;
  // Strip always visible on every card: shows "?" placeholders for un-scouted attrs
  const showPreviewStrip = true;

  // Get display strings for overall and star rating based on scouting progress
  const getOverallDisplay = (): string => {
    if (isFullyRevealed) return recruit.overall.toString();
    if (scoutPct === 0) return "???";
    // Show range based on minOverall/maxOverall from interest
    const minOvr = recruit.interest?.minOverall || 1;
    const maxOvr = recruit.interest?.maxOverall || 999;
    if (maxOvr - minOvr <= 50) return `${minOvr}-${maxOvr}`;
    if (maxOvr - minOvr <= 150) return `${minOvr}-${maxOvr}`;
    return `${minOvr}-${maxOvr}`;
  };

  const getStarDisplay = (): string => {
    if (isFullyRevealed) return `${recruit.starRating}`;
    if (scoutPct === 0) return "?";
    const minStar = recruit.interest?.minStar || 1;
    const maxStar = recruit.interest?.maxStar || 5;
    if (minStar === maxStar) return `${minStar}`;
    return `${minStar}-${maxStar}`;
  };

  // Get number of revealed abilities
  const revealedAbilitiesCount = recruit.interest?.revealedAbilitiesCount || 0;
  const totalAbilities = recruit.abilities?.length || 0;

  const isSigned = recruit.stage === "signed" && !!recruit.signedTeamId;
  const interestMeta = recruit.interest?.interestLevel != null
    ? getInterestLabel(recruit.interest.interestLevel)
    : null;

  const rowStyle = (() => {
    if (isSigned && recruit.signedTeamPrimaryColor) {
      return { borderLeft: `4px solid ${recruit.signedTeamPrimaryColor}` };
    }
    if (isFullyRevealed && recruit.starRating >= 5) {
      return { borderLeft: "3px solid rgba(196,163,90,0.75)", background: "rgba(196,163,90,0.03)" };
    }
    return undefined;
  })();

  return (
    <RetroCard 
      id={`recruit-card-${recruit.id}`}
      className={`hover:border-gold/30 transition-colors ${isSelected ? "border-gold ring-1 ring-gold/50" : ""}`} 
      data-testid={`card-recruit-${recruit.id}`}
      style={rowStyle}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="flex items-center gap-4 flex-1">
          {!isSigned && (
            <button
              onClick={onToggleCompare}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected ? "bg-gold border-gold text-forest-dark" : "border-muted-foreground/50 hover:border-gold"
              }`}
              data-testid={`checkbox-compare-${recruit.id}`}
            >
              {isSelected && <Check className="w-3 h-3" />}
            </button>
          )}
          <div className="w-12 h-12 relative flex-shrink-0">
            <PlayerPortrait 
              skinTone={recruit.skinTone || "light"}
              hairColor={recruit.hairColor || "brown"}
              hairStyle={recruit.hairStyle || "short"}
              facialHair={recruit.facialHair || "none"}
              eyeStyle={recruit.eyeStyle || undefined}
              eyebrowStyle={recruit.eyebrowStyle || undefined}
              mouthStyle={recruit.mouthStyle || undefined}
              eyeBlack={recruit.eyeBlack ?? undefined}
              playerId={recruit.id}
              className="w-12 h-12"
              isRecruit={true}
            />
            <div className="absolute -bottom-1 -left-1">
              <PositionBadge position={recruit.position} size="sm" />
            </div>
            {recruit.isBlueChip && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-background flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">B</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {/* Row 1: name + critical badges only — no wrapping */}
            <div className="flex items-center gap-2 mb-1 min-w-0">
              <Link href={`/league/${leagueId}/recruit/${recruit.id}`} className="hover:text-gold min-w-0 shrink">
                <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis block">{recruit.firstName} {recruit.lastName}</span>
              </Link>
              {recruit.isBlueChip && (
                <Badge className="bg-blue-500 text-white text-[8px] shrink-0">Blue Chip</Badge>
              )}
              {isSigned && recruit.signedTeamAbbreviation ? (
                <Badge 
                  className="text-white text-[8px] shrink-0"
                  style={{ backgroundColor: recruit.signedTeamPrimaryColor || "#666" }}
                >
                  Signed: {recruit.signedTeamAbbreviation}
                </Badge>
              ) : recruit.stage === "verbal" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className={`${stageDisplay.color} text-white text-[8px] shrink-0 animate-pulse`}>
                      {stageDisplay.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>This recruit will commit on Decision Day — keep recruiting!</TooltipContent>
                </Tooltip>
              ) : (
                <Badge className={`${stageDisplay.color} text-white text-[8px] shrink-0`}>{stageDisplay.label}</Badge>
              )}
            </div>
            {/* Row 2: location, hand, stars + all secondary badges */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1 shrink-0">
                <MapPin className="w-3 h-3" />
                {recruit.hometown}, {recruit.homeState}
              </span>
              <span className="text-[10px] shrink-0">
                {recruit.throwHand}/{recruit.batHand === "S" ? "S" : recruit.batHand}
              </span>
              <StarRating rating={recruit.starRank} size="sm" />
              {/* My recruiting rank badge — only shown after any scouting */}
              {scoutPct > 0 && recruit.topSchools && userTeamId && (() => {
                const visibleCount = recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8;
                const visibleSchools = recruit.topSchools.slice(0, visibleCount);
                const myRank = visibleSchools.findIndex(s => s.teamId === userTeamId);
                if (myRank === -1) return null;
                const rankNum = myRank + 1;
                const rankColor =
                  rankNum === 1 ? "border-gold/70 text-gold bg-gold/10" :
                  rankNum === 2 ? "border-slate-300/60 text-slate-300 bg-slate-300/10" :
                  rankNum === 3 ? "border-amber-700/60 text-amber-600 bg-amber-700/10" :
                  "border-muted-foreground/40 text-muted-foreground bg-muted/20";
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`text-[8px] shrink-0 no-default-hover-elevate no-default-active-elevate font-bold ${rankColor}`}
                        data-testid={`badge-my-rank-${recruit.id}`}
                      >
                        #{rankNum}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      You are #{rankNum} of {visibleSchools.length} schools in this recruit's top list
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
              {recruit.stage === "verbal" && recruit.topSchools && recruit.topSchools.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  {recruit.topSchools.slice(0, 5).map(school => (
                    <Tooltip key={school.teamId}>
                      <TooltipTrigger asChild>
                        <span
                          className="text-[8px] font-bold px-1 py-0.5 rounded border border-current/30 cursor-default"
                          style={{ color: school.primaryColor || "#aaa" }}
                        >
                          {school.abbreviation}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{school.teamName}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
              {recruit.recruitType === "TRANSFER" ? (
                <Badge className="bg-purple-600/30 text-purple-400 border-purple-600/50 text-[8px] no-default-hover-elevate no-default-active-elevate" data-testid={`badge-transfer-${recruit.id}`}>
                  TRANSFER {recruit.recruitYear || ""} {recruit.fromTeamName ? `(${recruit.fromTeamName})` : ""}
                </Badge>
              ) : recruit.recruitType === "JUCO" ? (
                <Badge className="bg-cyan-600/30 text-cyan-400 border-cyan-600/50 text-[8px] no-default-hover-elevate no-default-active-elevate" data-testid={`badge-juco-${recruit.id}`}>
                  JUCO {recruit.recruitYear || "FR"} {recruit.fromTeamName ? `(${recruit.fromTeamName})` : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[8px]" data-testid={`badge-type-${recruit.id}`}>
                  {recruit.recruitType || "HS"}
                </Badge>
              )}
              {totalAbilities > 0 && (
                <Badge variant="outline" className="text-[8px] border-gold/50 text-gold">
                  {isFullyRevealed ? `${totalAbilities} Abilities` : `${revealedAbilitiesCount}/${totalAbilities > revealedAbilitiesCount ? "?" : totalAbilities}`}
                </Badge>
              )}
              {positionNeed && (
                <Badge variant="outline" className="text-[8px] border-red-500/50 text-red-400">
                  NEED
                </Badge>
              )}
              {recommendation && recommendation.action !== "hold" && !isSigned && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={`text-[8px] no-default-hover-elevate no-default-active-elevate font-bold ${RECOMMENDED_ACTION_META[recommendation.action].color}`}
                      data-testid={`badge-recommended-action-${recruit.id}`}
                    >
                      <Target className="w-2.5 h-2.5 mr-0.5" />
                      {RECOMMENDED_ACTION_META[recommendation.action].label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{recommendation.reason}</TooltipContent>
                </Tooltip>
              )}
              {isStorylineRecruit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[8px] border-purple-500/50 text-purple-400 bg-purple-500/10 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-storyline-${recruit.id}`}>
                      <BookOpen className="w-2.5 h-2.5 mr-0.5" />STORY
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>This recruit has an active storyline arc</TooltipContent>
                </Tooltip>
              )}
              {(recruit as any).stadiumAffinitySignal && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[8px] no-default-hover-elevate no-default-active-elevate border-blue-400/60 text-blue-300 bg-blue-500/10"
                      data-testid={`badge-stadium-affinity-${recruit.id}`}
                    >
                      <Star className="w-2.5 h-2.5 mr-0.5" />
                      VENUE FIT
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>This recruit values stadium atmosphere — your venue is a strong fit</TooltipContent>
                </Tooltip>
              )}
              {recruit.teamsIn != null && recruit.teamsIn > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={`text-[8px] no-default-hover-elevate no-default-active-elevate ${
                        recruit.teamsIn >= 5
                          ? "border-red-500/60 text-red-400 bg-red-500/10"
                          : recruit.teamsIn >= 3
                          ? "border-orange-500/60 text-orange-400 bg-orange-500/10"
                          : "border-yellow-500/60 text-yellow-400 bg-yellow-500/10"
                      }`}
                      data-testid={`badge-rivalry-${recruit.id}`}
                    >
                      <Flame className="w-2.5 h-2.5 mr-0.5" />
                      {recruit.teamsIn} {recruit.teamsIn === 1 ? "team" : "teams"} in
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {recruit.teamsIn >= 5 ? "Heavy" : recruit.teamsIn >= 3 ? "Moderate" : "Light"} competition — {recruit.teamsIn} {recruit.teamsIn === 1 ? "rival has" : "rivals have"} {">"} 20% interest or an offer out{recruit.offersOut && recruit.offersOut > 0 ? ` (${recruit.offersOut} with offer)` : ""}
                  </TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isGenerationalGem && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-amber-500 text-black border-amber-400 no-default-hover-elevate no-default-active-elevate">
                      <Star className="w-3 h-3 mr-0.5 fill-current" />
                      GENERATIONAL GEM
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Generational Talent - Once-in-a-generation player hidden in the recruiting class</TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isGenerationalBust && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-red-700 text-white border-red-600 no-default-hover-elevate no-default-active-elevate">
                      <Skull className="w-3 h-3 mr-0.5" />
                      GENERATIONAL BUST
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Generational Bust - An overhyped recruit who will severely disappoint</TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isGem && !recruit.isGenerationalGem && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center justify-center w-5 h-5 bg-green-500/20 rounded-full">
                      <Gem className="w-3 h-3 text-green-400" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Gem - Better than ranking suggests</TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isBust && !recruit.isGenerationalBust && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center justify-center w-5 h-5 bg-red-500/20 rounded-full">
                      <XCircle className="w-3 h-3 text-red-400" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Bust - Worse than ranking suggests</TooltipContent>
                </Tooltip>
              )}
              {scoutPct >= TRAJECTORY_REVEAL_THRESHOLD && recruit.playerArchetype === "late_bloomer" && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-emerald-500/15 text-emerald-400 border-emerald-500/40 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-upside-${recruit.id}`}>
                      <TrendingUp className="w-2.5 h-2.5 mr-0.5" />UPSIDE
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Late Bloomer - Higher ceiling than current rating suggests</TooltipContent>
                </Tooltip>
              )}
              {scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && recruit.playerArchetype === "overdraft" && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-orange-500/15 text-orange-400 border-orange-500/40 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-ceiling-${recruit.id}`}>
                      <TrendingDown className="w-2.5 h-2.5 mr-0.5" />CEILING
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Overdraft - Lower ceiling than current rating suggests</TooltipContent>
                </Tooltip>
              )}
              {scoutPct >= TRAJECTORY_REVEAL_THRESHOLD && recruit.playerArchetype === "raw" && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-yellow-500/15 text-yellow-400 border-yellow-500/40 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-raw-${recruit.id}`}>
                      <Zap className="w-2.5 h-2.5 mr-0.5" />RAW
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Raw Prospect - Extreme tool variance, high risk/high reward</TooltipContent>
                </Tooltip>
              )}
            </div>
            {/* Drama layer: public engagement signals (never reveals hidden gem/bust status) */}
            {((recruit.dramaTags && recruit.dramaTags.length > 0) || recruit.myMovementDelta != null) && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <DramaChips dramaTags={recruit.dramaTags} maxVisible={3} testIdPrefix={`recruit-${recruit.id}-`} />
                <MovementIndicator delta={recruit.myMovementDelta} />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-center min-w-[70px]">
            <p className={`font-bold ${isFullyRevealed ? "text-lg" : "text-sm"} text-gold`}>
              {getOverallDisplay()}
            </p>
            <p className="text-[10px] text-muted-foreground">OVR</p>
          </div>
          {recruit.nilCost != null && recruit.nilCost > 0 && recruit.stage !== "signed" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-center min-w-[40px] cursor-default">
                  {(scoutPct >= NIL_SCOUT_THRESHOLD) ? (
                    <p className="font-bold text-sm text-gold/80">{formatNilRange(recruit.nilCost)}</p>
                  ) : (
                    <p className="font-bold text-xs text-muted-foreground/50 flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" />NIL</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">NIL</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>{scoutPct >= NIL_SCOUT_THRESHOLD ? "Estimated NIL range to sign this recruit (±25%)" : "Scout to 50% to reveal NIL estimate"}</TooltipContent>
            </Tooltip>
          )}
          <div className="text-center min-w-[40px]">
            <p className="font-bold text-sm">
              #{recruit.classRank || "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">CLASS</p>
          </div>
          <div className="text-center min-w-[40px]">
            <p className="font-bold text-sm">
              #{recruit.positionRank || "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">{recruit.position}</p>
          </div>
          <div className="text-center min-w-[40px]">
            {showRankEditor ? (
              <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={rankInputValue}
                  onChange={(e) => setRankInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      rankCommittedRef.current = true;
                      const n = parseInt(rankInputValue, 10);
                      onSetBoardRank(isNaN(n) || n < 1 ? null : Math.min(n, 99));
                      setShowRankEditor(false);
                    } else if (e.key === "Escape") {
                      rankCommittedRef.current = true;
                      setRankInputValue(String(recruit.interest?.boardRank ?? ""));
                      setShowRankEditor(false);
                    }
                  }}
                  onBlur={() => {
                    if (rankCommittedRef.current) {
                      rankCommittedRef.current = false;
                      return;
                    }
                    const n = parseInt(rankInputValue, 10);
                    onSetBoardRank(isNaN(n) || n < 1 ? null : Math.min(n, 99));
                    setShowRankEditor(false);
                  }}
                  autoFocus
                  className="w-8 text-center text-xs bg-background border border-gold/50 rounded px-0.5 py-0.5 text-gold focus:outline-none focus:border-gold"
                  data-testid={`input-board-rank-${recruit.id}`}
                />
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSetBoardRank(null); setRankInputValue(""); setShowRankEditor(false); }}
                  className="text-muted-foreground hover:text-red-400 text-[9px] leading-none"
                  title="Clear rank"
                >✕</button>
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRankInputValue(String(recruit.interest?.boardRank ?? "")); setShowRankEditor(true); }}
                    disabled={isSavingBoardRank}
                    className={`font-bold text-sm transition-colors ${recruit.interest?.boardRank != null ? "text-gold hover:text-gold/70" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`}
                    data-testid={`button-board-rank-${recruit.id}`}
                  >
                    {recruit.interest?.boardRank != null ? `#${recruit.interest.boardRank}` : "—"}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {recruit.interest?.boardRank != null ? `Board rank #${recruit.interest.boardRank} — click to edit` : "Click to set your board rank"}
                </TooltipContent>
              </Tooltip>
            )}
            <p className="text-[10px] text-muted-foreground">BOARD</p>
          </div>
          {recruit.potentialFloor != null && recruit.potentialCeiling != null && scoutPct >= 100 && (
            <div className="text-center min-w-[50px]">
              <p className="font-bold text-sm text-amber-400">
                {getPotentialRangeLabel(recruit.potentialFloor, recruit.potentialCeiling)}
              </p>
              <p className="text-[10px] text-muted-foreground">POT</p>
            </div>
          )}
        </div>

        {isSigned ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: `${recruit.signedTeamPrimaryColor}20` || "rgba(100,100,100,0.1)" }}>
              <TeamBadge 
                abbreviation={recruit.signedTeamAbbreviation || "?"} 
                primaryColor={recruit.signedTeamPrimaryColor || "#666"} 
                secondaryColor={recruit.signedTeamSecondaryColor || "#fff"} 
                name={recruit.signedTeamName || ""}
                size="sm" 
              />
              <span className="text-xs font-medium" style={{ color: recruit.signedTeamPrimaryColor || "#ccc" }}>
                {recruit.signedTeamName || "Unknown"}
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/league/${leagueId}/recruit/${recruit.id}`}>
                  <RetroButton size="sm" data-testid={`button-view-${recruit.id}`}>
                    <Eye className="w-3 h-3" />
                  </RetroButton>
                </Link>
              </TooltipTrigger>
              <TooltipContent>View Details</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            {/* Mobile compact quick-actions — Scout + More popover */}
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="text-[9px]">Scout</span>
                  <div className="flex items-center gap-1.5">
                    {trend && trend.trend !== "flat" && (
                      <span className={`text-[9px] ${trend.trend === "up" ? "text-green-400" : "text-red-400"}`} data-testid={`trend-mobile-${recruit.id}`}>
                        {trend.trend === "up" ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                      </span>
                    )}
                    <span className="text-[9px]">{scoutPct}%</span>
                  </div>
                </div>
                <Progress value={scoutPct} className="h-1.5" />
                <div className="flex justify-between items-center">
                  <span className="text-[9px] text-muted-foreground">Interest</span>
                  {interestMeta ? (
                    <div className="flex items-center gap-1" data-testid={`interest-bar-mobile-${recruit.id}`}>
                      <div className="w-16 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getInterestBarColor(recruit.interest!.interestLevel)}`}
                          style={{ width: `${quantizeInterestWidth(recruit.interest!.interestLevel)}%` }}
                        />
                      </div>
                      <span className={`text-[9px] font-bold ${interestMeta.color}`}>{interestMeta.label}</span>
                    </div>
                  ) : (
                    <span className="text-[9px] text-muted-foreground/50">?</span>
                  )}
                </div>
              </div>
              <RetroButton
                variant="outline"
                size="sm"
                onClick={onScout}
                disabled={isScouting || scoutPct >= 100 || outOfScoutActions}
                data-testid={`button-scout-mobile-${recruit.id}`}
              >
                <Search className="w-3 h-3 mr-1" />
                <span className="text-[9px]">Scout</span>
              </RetroButton>
              <Popover open={showMobileMore} onOpenChange={setShowMobileMore}>
                <PopoverTrigger asChild>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    data-testid={`button-more-mobile-${recruit.id}`}
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </RetroButton>
                </PopoverTrigger>
                <PopoverContent className="w-44 bg-card border-border p-1.5" align="end" data-testid={`popover-more-${recruit.id}`}>
                  <div className="flex flex-col gap-0.5">
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${recruit.interest?.isTargeted ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { onTarget(); setShowMobileMore(false); }}
                      disabled={isTargeting}
                      data-testid={`button-target-mobile-${recruit.id}`}
                    >
                      <Target className="w-3 h-3 flex-shrink-0" />
                      {recruit.interest?.isTargeted ? "Untarget" : "Target"}
                    </button>
                    <button
                      className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                      onClick={() => { setShowPhonePicker(true); setShowEmailPicker(false); setSelectedPhonePitches([]); setShowMobileMore(false); }}
                      disabled={isPhoning || !recruit.interest || outOfRecruitingActions || phonedThisWeek || remainingPoints < 2}
                      data-testid={`button-phone-mobile-${recruit.id}`}
                    >
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      {phonedThisWeek ? "Called (limit)" : "Call (2 pts)"}
                    </button>
                    <button
                      className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                      onClick={() => { setShowEmailPicker(true); setShowPhonePicker(false); setSelectedEmailPitch(null); setShowMobileMore(false); }}
                      disabled={isEmailing || !recruit.interest || outOfRecruitingActions || emailedThisWeek}
                      data-testid={`button-email-mobile-${recruit.id}`}
                    >
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      {emailedThisWeek ? "Emailed (limit)" : "Email (1 pt)"}
                    </button>
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${hasVisited ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { onVisit(); setShowMobileMore(false); }}
                      disabled={isVisiting || !recruit.interest || remainingPoints < visitCost || hasVisited || seasonVisitCapReached}
                      data-testid={`button-visit-mobile-${recruit.id}`}
                      title={seasonVisitCapReached ? "Season visit limit reached (20 total campus + HC visits per season). Resets next season." : hasVisited ? "Campus Visit already used for this recruit" : undefined}
                    >
                      <Building2 className="w-3 h-3 flex-shrink-0" />
                      {hasVisited ? "Visited" : seasonVisitCapReached ? "Cap Reached" : `Visit (${visitCost} pts)`}
                    </button>
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${hasHeadCoachVisited ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { onHeadCoachVisit(); setShowMobileMore(false); }}
                      disabled={isHeadCoachVisiting || !recruit.interest || remainingPoints < headCoachVisitCost || hasHeadCoachVisited || seasonVisitCapReached}
                      data-testid={`button-hcvisit-mobile-${recruit.id}`}
                      title={seasonVisitCapReached ? "Season visit limit reached (20 total campus + HC visits per season). Resets next season." : hasHeadCoachVisited ? "Head Coach Visit already used for this recruit" : undefined}
                    >
                      <Crown className="w-3 h-3 flex-shrink-0" />
                      {hasHeadCoachVisited ? "HC Visited" : seasonVisitCapReached ? "Cap Reached" : `HC Visit (${headCoachVisitCost} pts)`}
                    </button>
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${isOverNilBudget ? "text-red-400/60" : recruit.interest?.hasOffer ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { if (!isOverNilBudget) { onOffer(); setShowMobileMore(false); } }}
                      disabled={isOffering || !recruit.interest || recruit.interest?.hasOffer || isOverNilBudget}
                      data-testid={`button-offer-mobile-${recruit.id}`}
                      title={isOverNilBudget ? `Over NIL budget — need ~${formatNilRange(recruit.nilCost || 0)} to sign` : undefined}
                    >
                      {isOverNilBudget ? <Lock className="w-3 h-3 flex-shrink-0" /> : <Gift className="w-3 h-3 flex-shrink-0" />}
                      {isOverNilBudget ? "Over NIL Budget" : recruit.interest?.hasOffer ? "Offered" : "Offer Scholarship"}
                    </button>
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${recruit.interest?.notes ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { setShowNotesDialog(true); setShowMobileMore(false); }}
                      disabled={!recruit.interest}
                      data-testid={`button-notes-mobile-${recruit.id}`}
                    >
                      <StickyNote className="w-3 h-3 flex-shrink-0" />
                      Notes
                    </button>
                    <div className="border-t border-border my-0.5" />
                    <Link href={`/league/${leagueId}/recruit/${recruit.id}`}>
                      <button
                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted/50 transition-colors"
                        data-testid={`button-view-mobile-${recruit.id}`}
                      >
                        <Eye className="w-3 h-3 flex-shrink-0" />
                        View Full Profile
                      </button>
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Desktop full actions — hidden on mobile */}
            <div className="hidden lg:flex items-center gap-4 flex-wrap">
              <div className="w-36 space-y-1.5">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
                    <span className="text-[9px]">Scout</span>
                    <div className="flex items-center gap-1">
                      {trend && trend.trend !== "flat" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-[9px] cursor-default ${trend.trend === "up" ? "text-green-400" : "text-red-400"}`} data-testid={`trend-${recruit.id}`}>
                              {trend.trend === "up" ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {`Interest ${qualifyTrend(trend.recentGain)}`}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <span className="text-[9px]">{scoutPct}%</span>
                    </div>
                  </div>
                  <Progress value={scoutPct} className="h-1.5" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] text-muted-foreground">Interest</span>
                    {interestMeta ? (
                      <span className={`text-[9px] font-bold ${interestMeta.color}`} data-testid={`interest-label-${recruit.id}`}>
                        {interestMeta.label}
                      </span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground/50">?</span>
                    )}
                  </div>
                  {interestMeta ? (
                    <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden" data-testid={`interest-bar-${recruit.id}`}>
                      <div
                        className={`h-full rounded-full transition-all ${getInterestBarColor(recruit.interest!.interestLevel)}`}
                        style={{ width: `${quantizeInterestWidth(recruit.interest!.interestLevel)}%` }}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-1.5 bg-muted/20 rounded-full" />
                  )}
                </div>
              </div>

              <div className="flex gap-1.5 flex-wrap">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant="outline"
                      size="sm"
                      onClick={onScout}
                      disabled={isScouting || scoutPct >= 100 || outOfScoutActions}
                      data-testid={`button-scout-${recruit.id}`}
                    >
                      <Search className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">Scout</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>Scout (1 scouting point)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={recruit.interest?.isTargeted ? "primary" : "outline"}
                      size="sm"
                      onClick={onTarget}
                      disabled={isTargeting}
                      data-testid={`button-target-${recruit.id}`}
                    >
                      <Target className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{recruit.interest?.isTargeted ? "Targeted" : "Target"}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{recruit.interest?.isTargeted ? "Untarget" : "Target"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={phonedThisWeek ? "primary" : showPhonePicker ? "primary" : "outline"}
                      size="sm"
                      onClick={() => { if (!phonedThisWeek) { setShowPhonePicker(!showPhonePicker); setShowEmailPicker(false); setSelectedPhonePitches([]); } }}
                      disabled={isPhoning || !recruit.interest || outOfRecruitingActions || phonedThisWeek || remainingPoints < 2}
                      data-testid={`button-phone-${recruit.id}`}
                    >
                      <Phone className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{phonedThisWeek ? "Called" : "Call (2)"}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{phonedThisWeek ? "Already called this recruit this week (1 per week max)" : "Phone Call - 2 recruiting points (3 pitches)"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={emailedThisWeek ? "primary" : showEmailPicker ? "primary" : "outline"}
                      size="sm"
                      onClick={() => { if (!emailedThisWeek) { setShowEmailPicker(!showEmailPicker); setShowPhonePicker(false); setSelectedEmailPitch(null); } }}
                      disabled={isEmailing || !recruit.interest || outOfRecruitingActions || emailedThisWeek}
                      data-testid={`button-email-${recruit.id}`}
                    >
                      <Mail className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{emailedThisWeek ? "Emailed" : "Email (1)"}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{emailedThisWeek ? "Already emailed this recruit this week (1 per week max)" : "Send Email - 1 recruiting point (1 pitch)"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={hasVisited ? "primary" : "outline"}
                      size="sm"
                      onClick={onVisit}
                      disabled={isVisiting || !recruit.interest || remainingPoints < visitCost || hasVisited || seasonVisitCapReached}
                      data-testid={`button-visit-${recruit.id}`}
                    >
                      <Building2 className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{hasVisited ? "Visited" : seasonVisitCapReached ? "Cap" : `Visit (${visitCost})`}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{hasVisited ? "Campus Visit already used for this recruit" : seasonVisitCapReached ? "Season visit limit reached (20 total campus + HC visits per season). Resets next season." : remainingPoints < visitCost ? `Need ${visitCost} points for Campus Visit` : `Campus Visit - ${visitCost} recruiting points`}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={hasHeadCoachVisited ? "primary" : "outline"}
                      size="sm"
                      onClick={onHeadCoachVisit}
                      disabled={isHeadCoachVisiting || !recruit.interest || remainingPoints < headCoachVisitCost || hasHeadCoachVisited || seasonVisitCapReached}
                      data-testid={`button-head-coach-visit-${recruit.id}`}
                    >
                      <Crown className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{hasHeadCoachVisited ? "HC Visited" : seasonVisitCapReached ? "Cap" : `HC Visit (${headCoachVisitCost})`}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{hasHeadCoachVisited ? "Head Coach Visit already used for this recruit" : seasonVisitCapReached ? "Season visit limit reached (20 total campus + HC visits per season). Resets next season." : remainingPoints < headCoachVisitCost ? `Need ${headCoachVisitCost} points for HC Visit` : `Head Coach Visit - ${headCoachVisitCost} recruiting points`}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={recruit.interest?.hasOffer ? "primary" : "outline"}
                      size="sm"
                      onClick={onOffer}
                      disabled={isOffering || !recruit.interest || recruit.interest?.hasOffer || isOverNilBudget}
                      className={isOverNilBudget ? "border-red-500/40 text-red-400/60" : ""}
                      data-testid={`button-offer-${recruit.id}`}
                    >
                      {isOverNilBudget ? <Lock className="w-3 h-3 mr-1" /> : <Gift className="w-3 h-3 mr-1" />}
                      <span className="text-[9px]">{recruit.interest?.hasOffer ? "Offered" : isOverNilBudget ? "Budget" : "Offer"}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    {recruit.interest?.hasOffer
                      ? "Scholarship Offered"
                      : isOverNilBudget
                      ? `Over NIL budget — need ~${formatNilRange(recruit.nilCost || 0)} to sign`
                      : "Offer Scholarship (1 recruiting point)"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={`/league/${leagueId}/recruit/${recruit.id}`}>
                      <RetroButton
                        size="sm"
                        data-testid={`button-view-${recruit.id}`}
                      >
                        <Eye className="w-3 h-3" />
                      </RetroButton>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>View Details</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={recruit.interest?.notes ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setShowNotesDialog(true)}
                      disabled={!recruit.interest}
                      data-testid={`button-notes-${recruit.id}`}
                    >
                      <StickyNote className="w-3 h-3" />
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>Notes</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stat/Attribute preview strip — always visible on every recruit card */}
      {showPreviewStrip && (
        <div className="mt-2 pt-2 border-t border-border/30 px-1 flex flex-col gap-0.5" data-testid={`stat-preview-${recruit.id}`}>
          {/* Transfer: real last-season stats */}
          {hasTransferStats && (
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mb-0.5">
              {(() => {
                const s = recruit.lastSeasonStats!;
                return isPitcherRecruit ? (
                  <>
                    {s.era != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground/60 font-mono">ERA</span>
                        <span className="text-[9px] text-purple-300/90 font-mono">{s.era.toFixed(2)}</span>
                      </div>
                    )}
                    {s.ip != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground/60 font-mono">IP</span>
                        <span className="text-[9px] text-purple-300/90 font-mono">{s.ip.toFixed(1)}</span>
                      </div>
                    )}
                    {s.k != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground/60 font-mono">K</span>
                        <span className="text-[9px] text-purple-300/90 font-mono">{s.k}</span>
                      </div>
                    )}
                    {s.whip != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground/60 font-mono">WHIP</span>
                        <span className="text-[9px] text-purple-300/90 font-mono">{s.whip.toFixed(2)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {s.avg != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground/60 font-mono">AVG</span>
                        <span className="text-[9px] text-purple-300/90 font-mono">.{String(Math.round(s.avg * 1000)).padStart(3, "0")}</span>
                      </div>
                    )}
                    {s.obp != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground/60 font-mono">OBP</span>
                        <span className="text-[9px] text-purple-300/90 font-mono">.{String(Math.round(s.obp * 1000)).padStart(3, "0")}</span>
                      </div>
                    )}
                    {s.hr != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground/60 font-mono">HR</span>
                        <span className="text-[9px] text-purple-300/90 font-mono">{s.hr}</span>
                      </div>
                    )}
                    {s.rbi != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground/60 font-mono">RBI</span>
                        <span className="text-[9px] text-purple-300/90 font-mono">{s.rbi}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Trajectory row — hitters only; always shown, revealed after 50% scouted (blue chips always revealed) */}
          {!isPitcherRecruit && (
            <div className="flex items-center gap-1" data-testid={`traj-row-${recruit.id}`}>
              <span className="font-pixel text-[7px] text-muted-foreground/50 uppercase w-14 shrink-0">TRAJ</span>
              {(scoutPct >= TRAJECTORY_REVEAL_THRESHOLD || recruit.isBlueChip) && recruit.trajectory != null ? (
                <>
                  <TrajectoryIcon trajectory={recruit.trajectory as 1|2|3|4} iconSize="w-2.5 h-2.5" textSize="text-[9px]" />
                  <span className={`text-[9px] font-mono ${
                    recruit.trajectory === 1 ? "text-emerald-400" :
                    recruit.trajectory === 3 ? "text-amber-400" :
                    recruit.trajectory === 4 ? "text-red-400" :
                    "text-slate-400"
                  }`}>{TRAJECTORY_FULL_LABELS[recruit.trajectory] ?? ""}</span>
                </>
              ) : (
                <span className="font-pixel text-[9px] font-bold" style={{ color: "#374151" }}>?</span>
              )}
            </div>
          )}

          {/* Row 1 — ATTRIBUTES */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-pixel text-[7px] text-muted-foreground/50 uppercase w-20 shrink-0">ATTRIBUTES</span>
            {primaryAttrFields.map(({ label, key, val }) => {
              const revealed = isAttrRevealed(key);
              const grade = (revealed && val != null) ? getLetterGrade(val) : null;
              const isSigningDayLocked = !revealed && sdAttrSet.has(key) && scoutPct >= 100;
              const isVelRevealed = key === "velocity" && revealed && val != null;
              return (
                <div key={key} className="flex items-center gap-0.5">
                  <span className="text-[8px] text-muted-foreground/60 font-mono">{label}</span>
                  {isSigningDayLocked ? (
                    <Lock className="w-2.5 h-2.5 text-gold/50" />
                  ) : isVelRevealed ? (
                    <span className="font-pixel text-[9px] font-bold text-sky-300/90">
                      {velocityToKMH(val)} KMH
                    </span>
                  ) : (
                    <span className="font-pixel text-[9px] font-bold" style={{ color: grade ? (ATTR_GRADE_COLORS[grade.tier] || "#9ca3af") : "#374151" }}>
                      {grade ? grade.letter : "?"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Row 1b — PITCH MIX (pitchers only) */}
          {isPitcherRecruit && (() => {
            const pitchFields = [
              ["pitchFB", "FB"], ["pitch2S", "2S"], ["pitchSL", "SL"], ["pitchCB", "CB"],
              ["pitchCH", "CH"], ["pitchCT", "CT"], ["pitchSNK", "SNK"], ["pitchSPL", "SPL"],
              ["pitchSHU", "SHU"], ["pitchSWP", "SWP"], ["pitchKN", "KN"],
              ["pitchVSL", "VSL"], ["pitchSFF", "SFF"], ["pitchFK", "FK"],
              ["pitchSCB", "SCB"], ["pitchPCB", "PCB"],
            ] as const;
            const revealedPitchFields = computeRevealedPitchFields(recruit.scoutingOrder as string[], scoutPct);
            const active = pitchFields.filter(([k]) => {
              const v = (recruit as any)[k];
              return v != null && v > 0 && (isFullyRevealed || revealedPitchFields.has(k));
            });
            if (!active.length) return null;
            return (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-pixel text-[7px] text-muted-foreground/50 uppercase w-14 shrink-0">PITCH MIX</span>
                {scoutPct < 50 && !isFullyRevealed ? (
                  active.map(([k, label]) => (
                    <span key={label} className="text-[8px] font-mono px-1 py-0.5 rounded bg-muted/40 border border-border/50 text-muted-foreground/70 leading-tight">{label}</span>
                  ))
                ) : (
                  active.map(([k, label]) => (
                    <span key={label} className="text-[8px] font-mono px-1 py-0.5 rounded bg-muted/40 border border-border/50 text-muted-foreground/70 leading-tight">
                      {label}·{(recruit as any)[k]}
                    </span>
                  ))
                )}
              </div>
            );
          })()}

          {/* Row 2 — COMMON abilities */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-pixel text-[7px] text-muted-foreground/50 uppercase w-14 shrink-0">COMMON</span>
            {commonAttrFields.map(({ label, key, val }) => {
              const revealed = isAttrRevealed(key);
              const grade = (revealed && val != null) ? getLetterGrade(val) : null;
              const isSigningDayLocked = !revealed && sdAttrSet.has(key) && scoutPct >= 100;
              return (
                <div key={key} className="flex items-center gap-0.5">
                  <span className="text-[8px] text-muted-foreground/60 font-mono">{label}</span>
                  {isSigningDayLocked ? (
                    <Lock className="w-2.5 h-2.5 text-gold/50" />
                  ) : (
                    <span className="font-pixel text-[9px] font-bold" style={{ color: grade ? (COMMON_TIER_COLORS[grade.tier] || "#9ca3af") : "#374151" }}>
                      {grade ? grade.letter : "?"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Row 3 — SPECIAL abilities */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-pixel text-[7px] text-muted-foreground/50 uppercase w-14 shrink-0">SPECIAL</span>
            {(() => {
              const abilitiesList = (recruit.abilities as string[] | null | undefined) || [];
              // Filter to only gold/blue/red special abilities first, then apply fog-of-war slice
              const specialAbilities = abilitiesList.filter(name => {
                const tier = getAbilityByName(name)?.tier;
                return tier === "gold" || tier === "blue" || tier === "red";
              });
              const revealed = isFullyRevealed
                ? specialAbilities
                : specialAbilities.slice(0, revealedAbilitiesCount);
              if (revealed.length === 0) {
                return <span className="text-[9px] text-muted-foreground/40 font-mono">—</span>;
              }
              return revealed.map((name, idx) => {
                const ability = getAbilityByName(name);
                const tierColor =
                  ability?.tier === "gold" ? "#f59e0b"
                  : ability?.tier === "blue" ? "#3b82f6"
                  : ability?.tier === "red"  ? "#ef4444"
                  : "#9ca3af";
                const tierBg =
                  ability?.tier === "gold" ? "rgba(245,158,11,0.12)"
                  : ability?.tier === "blue" ? "rgba(59,130,246,0.12)"
                  : ability?.tier === "red"  ? "rgba(239,68,68,0.12)"
                  : "rgba(156,163,175,0.12)";
                return (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>
                      <span
                        className="text-[8px] font-mono px-1 py-0.5 rounded leading-tight border cursor-default"
                        style={{ color: tierColor, background: tierBg, borderColor: `${tierColor}40` }}
                      >
                        {name}
                      </span>
                    </TooltipTrigger>
                    {ability?.description && (
                      <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                        {ability.description}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              });
            })()}
          </div>
        </div>
      )}

      {showPhonePicker && (
        <div className="mt-3 p-3 bg-muted/30 border border-border rounded" data-testid={`pitch-picker-phone-${recruit.id}`}>
          <p className="text-[10px] font-pixel text-gold mb-2">SELECT UP TO 3 PITCHES FOR PHONE CALL</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pitchOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => togglePhonePitch(opt.key)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  selectedPhonePitches.includes(opt.key)
                    ? "bg-gold/20 border-gold text-gold"
                    : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                }`}
                data-testid={`pitch-option-phone-${opt.key}-${recruit.id}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <RetroButton
              size="sm"
              onClick={() => {
                onPhone(selectedPhonePitches.length > 0 ? selectedPhonePitches.join(",") : undefined);
                setShowPhonePicker(false);
                setSelectedPhonePitches([]);
              }}
              disabled={selectedPhonePitches.length === 0 || isPhoning}
              data-testid={`button-send-phone-${recruit.id}`}
            >
              <Phone className="w-3 h-3 mr-1" />
              Call ({selectedPhonePitches.length}/3)
            </RetroButton>
            <RetroButton variant="outline" size="sm" onClick={() => { setShowPhonePicker(false); setSelectedPhonePitches([]); }}>
              Cancel
            </RetroButton>
          </div>
        </div>
      )}

      {showEmailPicker && (
        <div className="mt-3 p-3 bg-muted/30 border border-border rounded" data-testid={`pitch-picker-email-${recruit.id}`}>
          <p className="text-[10px] font-pixel text-gold mb-2">SELECT 1 PITCH FOR EMAIL</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pitchOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSelectedEmailPitch(selectedEmailPitch === opt.key ? null : opt.key)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  selectedEmailPitch === opt.key
                    ? "bg-gold/20 border-gold text-gold"
                    : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                }`}
                data-testid={`pitch-option-email-${opt.key}-${recruit.id}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <RetroButton
              size="sm"
              onClick={() => {
                onEmail(selectedEmailPitch || undefined);
                setShowEmailPicker(false);
                setSelectedEmailPitch(null);
              }}
              disabled={!selectedEmailPitch || isEmailing}
              data-testid={`button-send-email-${recruit.id}`}
            >
              <Mail className="w-3 h-3 mr-1" />
              Send Email
            </RetroButton>
            <RetroButton variant="outline" size="sm" onClick={() => { setShowEmailPicker(false); setSelectedEmailPitch(null); }}>
              Cancel
            </RetroButton>
          </div>
        </div>
      )}

      {recruit.interest?.notes && (
        <div className="mt-2 px-4 py-2 bg-gold/10 border border-gold/20 rounded text-sm text-muted-foreground">
          <span className="text-gold font-pixel text-[8px]">NOTE: </span>
          {recruit.interest.notes}
        </div>
      )}

      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">
              Notes for {recruit.firstName} {recruit.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Add your personal notes about this recruit..."
              className="min-h-[100px] bg-background border-border"
              data-testid="textarea-notes"
            />
            <div className="flex gap-2 justify-end">
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setShowNotesDialog(false)}
                data-testid="button-cancel-notes"
              >
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                onClick={() => {
                  onSaveNotes(notesValue);
                  setShowNotesDialog(false);
                }}
                disabled={isSavingNotes}
                data-testid="button-save-notes"
              >
                Save Notes
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isSigned ? (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: `${recruit.signedTeamPrimaryColor}20` || "rgba(100,100,100,0.1)", border: `1px solid ${recruit.signedTeamPrimaryColor}40` }}>
            <TeamBadge
              abbreviation={recruit.signedTeamAbbreviation || "?"}
              primaryColor={recruit.signedTeamPrimaryColor || "#666"}
              secondaryColor={recruit.signedTeamSecondaryColor || "#fff"}
              name={recruit.signedTeamName || ""}
              size="sm"
            />
            <span className="text-xs font-medium" style={{ color: recruit.signedTeamPrimaryColor || "#ccc" }} data-testid={`text-signed-team-${recruit.id}`}>
              Player signed with {recruit.signedTeamName || "Unknown"}
            </span>
          </div>
        </div>
      ) : recruit.topSchools && recruit.topSchools.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <button
            onClick={() => setShowTopSchools(!showTopSchools)}
            className="flex items-center justify-between w-full mb-2 group"
            data-testid={`button-toggle-top-schools-${recruit.id}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Your Rank</span>
              {(() => {
                const visibleCount = recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8;
                const visibleSchools = recruit.topSchools!.slice(0, visibleCount);
                const userIdx = visibleSchools.findIndex(s => s.teamId === userTeamId);
                if (userIdx >= 0) {
                  const hasOffer = recruit.interest?.hasOffer;
                  return (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-pixel text-gold" data-testid={`text-user-school-rank-${recruit.id}`}>
                        #{userIdx + 1} of {visibleSchools.length}
                      </span>
                      {!hasOffer && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-0.5 text-[9px] text-amber-400/80 cursor-default" data-testid={`text-offer-required-${recruit.id}`}>
                              <Lock className="w-2.5 h-2.5" />
                              Offer needed
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Recruits can only commit to schools that have extended a scholarship offer — interest alone won't close the deal</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                }
                return (
                  <span className="text-[9px] text-muted-foreground/60" data-testid={`text-user-school-absent-${recruit.id}`}>
                    Not Listed
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[8px]">
                {recruit.stage === "open" ? "8 Schools" : recruit.stage === "top8" ? "Top 8" : recruit.stage === "top5" ? "Top 5" : recruit.stage === "top3" ? "Top 3" : recruit.stage}
              </Badge>
              {showTopSchools ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
            </div>
          </button>
          {showTopSchools && (
            <CompetingSchoolsList
              topSchools={recruit.topSchools}
              stage={recruit.stage}
              userTeamId={userTeamId}
              trend={trend}
            />
          )}
        </div>
      )}
    </RetroCard>
  );
}
