import { useState, useEffect, type ReactNode } from "react";
import { FlipReveal } from "@/components/ui/flip-reveal";
import { 
  Eye, Phone, Mail, MapPin, GraduationCap, Gem, XCircle, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Star, Skull, Lock, BookOpen, Gift, Building2, Crown,
  HelpCircle, DollarSign, AlertTriangle, Zap, Target
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/star-rating";
import { PositionBadge } from "@/components/ui/position-badge";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { RetroButton } from "@/components/ui/retro-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RecruitWithInterest } from "@/lib/recruitingUtils";
import { getAbilityByName } from "@shared/abilities";
import { 
  TRAJECTORY_REVEAL_THRESHOLD, 
  ARCHETYPE_REVEAL_THRESHOLD, 
  computeRevealedPitchFields 
} from "@shared/recruitThresholds";
import { TrajectoryIcon } from "@/components/ui/trajectory-icon";
import { LetterGrade, getLetterGrade } from "@/components/ui/letter-grade";
import { velocityToKMH } from "@/lib/playerUtils";
import { getDevTraitGrade, getPotentialRangeLabel } from "@shared/potential";
import { 
  formatNilRange, 
  NIL_SCOUT_THRESHOLD,
  recruitSGoldDisplayValue,
  recruitSGoldBadge,
  recruitPitcherSGoldDisplayValue,
  recruitPitcherSGoldBadge,
  getInterestChangeLabel
} from "@/lib/recruitingUtils";
import { PitchMixDial } from "@/components/ui/pitch-mix-dial";
import { CompetingSchoolsList, SeeUponSigningBadge, CommonAbilityRow } from "./recruiting-shared";
import { RecruitActionsLog } from "./recruit-actions-log";

/** Flips from "??" to the real attribute value when the card opens — staggered by delay. */
function AttrFlipValue({ value, delay = 0 }: { value: ReactNode; delay?: number }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), delay);
    return () => clearTimeout(t);
  }, []);
  return (
    <FlipReveal
      revealed={revealed}
      duration={280}
      front={<span className="font-bold text-muted-foreground text-sm select-none">??</span>}
      back={<span className="font-bold text-foreground text-sm">{value}</span>}
    />
  );
}

export 
function RecruitDetailModal({
  recruit,
  onClose,
  leagueId,
  onScout,
  isScouting,
  onPhone,
  isPhoning,
  onEmail,
  isEmailing,
  onVisit,
  isVisiting,
  onHeadCoachVisit,
  isHeadCoachVisiting,
  onOffer,
  isOffering,
  outOfRecruitingActions,
  remainingPoints,
  visitCost,
  headCoachVisitCost,
  hasVisited,
  hasHeadCoachVisited,
  nilRemaining,
  seasonVisitCapReached,
  visitCap,
  userTeamId,
  trend,
  onTarget,
  isTargeting,
}: {
  recruit: RecruitWithInterest | null;
  onClose: () => void;
  leagueId: string;
  onScout: (recruitId: string) => void;
  isScouting: boolean;
  onPhone: (recruitId: string, pitchTopic?: string) => void;
  isPhoning: boolean;
  onEmail: (recruitId: string, pitchTopic?: string) => void;
  isEmailing: boolean;
  onVisit: (recruitId: string) => void;
  isVisiting: boolean;
  onHeadCoachVisit: (recruitId: string) => void;
  isHeadCoachVisiting: boolean;
  onOffer: (recruitId: string) => void;
  isOffering: boolean;
  outOfRecruitingActions?: boolean;
  remainingPoints: number;
  visitCost: number;
  headCoachVisitCost: number;
  hasVisited?: boolean;
  hasHeadCoachVisited?: boolean;
  nilRemaining?: number;
  seasonVisitCapReached?: boolean;
  visitCap?: number;
  userTeamId?: string;
  trend?: { trend: "up" | "down" | "flat"; recentGain: number } | null;
  onTarget?: () => void;
  isTargeting?: boolean;
}) {
  const isMobile = useIsMobile();
  const [modalPhonePitches, setModalPhonePitches] = useState<string[]>([]);
  const [modalEmailPitch, setModalEmailPitch] = useState<string | null>(null);
  const [showModalPhonePicker, setShowModalPhonePicker] = useState(false);
  const [showModalEmailPicker, setShowModalEmailPicker] = useState(false);

  const modalPitchOptions = [
    { key: "proximity", label: "Proximity" },
    { key: "reputation", label: "Reputation" },
    { key: "playingTime", label: "Playing Time" },
    { key: "academics", label: "Academics" },
    { key: "prestige", label: "Prestige" },
    { key: "facilities", label: "Facilities" },
    { key: "collegeLife", label: "College Life" },
  ];

  const toggleModalPhonePitch = (key: string) => {
    setModalPhonePitches(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  if (!recruit) return null;

  const scoutPct = recruit.interest?.scoutPercentage || 0;
  // Set of fields locked until signing day reveal (server has already nulled their values)
  const sdLocked = new Set<string>(recruit.signingDayLockedFields || []);
  // Blue chips always show everything; all others unlock only at the signing-day cinematic.
  const isFullyRevealed = recruit.isBlueChip || !!recruit.signingDayRevealed;
  const revealedAttrs = recruit.isBlueChip 
    ? ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "velocity", "control", "stamina"]
    : (recruit.interest?.revealedAttributes || []);

  // Progressive reveal display functions for modal
  const getOverallDisplay = (): string => {
    if (isFullyRevealed) return recruit.overall.toString();
    if (scoutPct === 0) return "???";
    const minOvr = recruit.interest?.minOverall || 1;
    const maxOvr = recruit.interest?.maxOverall || 999;
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

  const revealedAbilitiesCount = recruit.interest?.revealedAbilitiesCount || 0;

  const fielderAttrs = [
    { key: "hitForAvg", label: "Hit for Avg", value: recruit.hitForAvg },
    { key: "power", label: "Power", value: recruit.power },
    { key: "speed", label: "Speed", value: recruit.speed },
    { key: "arm", label: "Arm", value: recruit.arm },
    { key: "fielding", label: "Fielding", value: recruit.fielding },
    { key: "errorResistance", label: "Error Res", value: recruit.errorResistance },
  ];

  const pitcherAttrs = [
    { key: "velocity", label: "Velocity", value: recruit.velocity },
    { key: "control", label: "Control", value: recruit.control },
    { key: "stamina", label: "Stamina", value: recruit.stamina },
  ];

  const attrs = recruit.position === "P" ? pitcherAttrs : fielderAttrs;

  const priorities = [
    { key: "proximityPriority", label: "Proximity to Home", value: recruit.proximityPriority },
    { key: "reputationPriority", label: "Coach Reputation", value: recruit.reputationPriority },
    { key: "playingTimePriority", label: "Playing Time", value: recruit.playingTimePriority },
    { key: "academicsPriority", label: "Academics", value: recruit.academicsPriority },
    { key: "prestigePriority", label: "School Prestige", value: recruit.prestigePriority },
    { key: "facilitiesPriority", label: "Facilities", value: recruit.facilitiesPriority },
    { key: "collegeLifePriority", label: "College Life", value: (recruit as any).collegeLifePriority },
  ];

  const generatePitchMix = () => {
    if (recruit.position !== "P") return [];
    const basePitches = [
      { name: "FB", rating: isFullyRevealed || revealedAttrs.includes("velocity") ? Math.min(99, (recruit.velocity || 50) + 20) : 0 },
      { name: "SL", rating: isFullyRevealed || revealedAttrs.includes("control") ? Math.floor((recruit.control || 0) * 0.8) : 0 },
      { name: "CB", rating: isFullyRevealed || revealedAttrs.includes("control") ? Math.floor((recruit.control || 0) * 0.7) : 0 },
      { name: "CH", rating: isFullyRevealed || revealedAttrs.includes("control") ? Math.floor((recruit.control || 0) * 0.6) : 0 },
      { name: "CT", rating: 0 },
      { name: "SNK", rating: 0 },
    ];
    return basePitches;
  };

  const isPitcherRecruit = ["P", "SP", "RP", "CP", "LHP", "RHP"].includes(recruit.position || "");
  const isModalAttrRevealed = (key: string) =>
    !sdLocked.has(key) && (isFullyRevealed || (revealedAttrs as string[]).includes(key));
  const modalPreviewFields = isPitcherRecruit
    ? [
        { label: "VEL", key: "velocity", val: recruit.velocity },
        { label: "CTL", key: "control", val: recruit.control },
        { label: "STF", key: "stuff", val: recruit.stuff },
        { label: "STM", key: "stamina", val: recruit.stamina },
      ]
    : [
        { label: "HIT", key: "hitForAvg", val: recruit.hitForAvg },
        { label: "PWR", key: "power", val: recruit.power },
        { label: "SPD", key: "speed", val: recruit.speed },
        { label: "FLD", key: "fielding", val: recruit.fielding },
      ];
  const MODAL_GRADE_COLORS: Record<string, string> = {
    s: "#fda4d5", a: "#ef4444", b: "#ef4444", c: "#f97316",
    d: "#eab308", f: "#60a5fa", g: "#9ca3af",
  };
  const modalHasTransferStats = recruit.recruitType === "TRANSFER" && !!recruit.lastSeasonStats;

  const previewStripContent = (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap" data-testid={`modal-stat-preview-${recruit.id}`}>
      {modalHasTransferStats && (() => {
        const s = recruit.lastSeasonStats!;
        return isPitcherRecruit ? (
          <>
            {s.era != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/60 font-mono">ERA</span>
                <span className="text-[10px] text-purple-300/90 font-mono">{s.era.toFixed(2)}</span>
              </div>
            )}
            {s.ip != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/60 font-mono">IP</span>
                <span className="text-[10px] text-purple-300/90 font-mono">{s.ip.toFixed(1)}</span>
              </div>
            )}
            {s.k != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/60 font-mono">K</span>
                <span className="text-[10px] text-purple-300/90 font-mono">{s.k}</span>
              </div>
            )}
            {s.whip != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/60 font-mono">WHIP</span>
                <span className="text-[10px] text-purple-300/90 font-mono">{s.whip.toFixed(2)}</span>
              </div>
            )}
          </>
        ) : (
          <>
            {s.avg != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/60 font-mono">AVG</span>
                <span className="text-[10px] text-purple-300/90 font-mono">.{String(Math.round(s.avg * 1000)).padStart(3, "0")}</span>
              </div>
            )}
            {s.obp != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/60 font-mono">OBP</span>
                <span className="text-[10px] text-purple-300/90 font-mono">.{String(Math.round(s.obp * 1000)).padStart(3, "0")}</span>
              </div>
            )}
            {s.hr != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/60 font-mono">HR</span>
                <span className="text-[10px] text-purple-300/90 font-mono">{s.hr}</span>
              </div>
            )}
            {s.rbi != null && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground/60 font-mono">RBI</span>
                <span className="text-[10px] text-purple-300/90 font-mono">{s.rbi}</span>
              </div>
            )}
          </>
        );
      })()}
      {modalHasTransferStats && <div className="w-px h-3 bg-border/40 self-center" />}
      {modalPreviewFields.map(({ label, key, val }) => {
        const revealed = isModalAttrRevealed(key);
        const grade = (revealed && val != null) ? getLetterGrade(val) : null;
        const isSigningDayLocked = !revealed && sdLocked.has(key) && scoutPct >= 100;
        return (
          <div key={key} className="flex items-center gap-0.5">
            <span className="text-[9px] text-muted-foreground/60 font-mono">{label}</span>
            {isSigningDayLocked ? (
              <Lock className="w-2.5 h-2.5 text-gold/50" />
            ) : (
              <span className="font-pixel text-[10px] font-bold" style={{ color: grade ? (MODAL_GRADE_COLORS[grade.tier] || "#9ca3af") : "#374151" }}>
                {grade ? grade.letter : "?"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  const headerContent = (
    <div className="flex items-start gap-4">
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
        className="w-16 h-16 flex-shrink-0"
        isRecruit={true}
      />
      <div className="flex-1">
        <div className="font-pixel text-gold flex items-center gap-3 flex-wrap text-sm">
          <PositionBadge position={recruit.position} size="lg" />
          <span>{recruit.firstName} {recruit.lastName}</span>
          <StarRating rating={recruit.starRank} />
          {recruit.isBlueChip && (
            <Badge className="bg-blue-500 text-white">Blue Chip</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span>{recruit.hometown}, {recruit.homeState}</span>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={!!recruit} onOpenChange={() => onClose()}>
        <SheetContent
          side="bottom"
          className="h-dvh overflow-y-auto p-0 border-t border-gold bg-card"
          data-testid="recruit-detail-sheet-mobile"
        >
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle asChild>{headerContent}</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded">
              <p className={`font-bold text-gold ${isFullyRevealed ? "text-2xl" : "text-lg"}`}>
                {getOverallDisplay()}
              </p>
              <p className="text-xs text-muted-foreground">Overall (1-999)</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className={`font-bold ${isFullyRevealed ? "text-2xl" : "text-lg"}`}>
                {getStarDisplay()}
              </p>
              <p className="text-xs text-muted-foreground">Star Rating</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className="text-lg font-bold">{recruit.classRank}</p>
              <p className="text-xs text-muted-foreground">Class Rank</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className="text-lg font-bold">{recruit.positionRank}</p>
              <p className="text-xs text-muted-foreground">Pos Rank</p>
            </div>
          </div>
          {recruit.stage !== "signed" && (
            <RetroButton
              variant={recruit.interest?.isTargeted ? "primary" : "outline"}
              className="w-full"
              onClick={() => onTarget?.()}
              disabled={isTargeting}
              data-testid="button-target-modal-mobile"
            >
              <Target className="w-4 h-4 mr-2" />
              {isTargeting ? "Updating..." : recruit.interest?.isTargeted ? "Untarget Player" : "Target Player"}
            </RetroButton>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span className="truncate">{recruit.recruitType === "TRANSFER" ? `Transfer from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "SO"})` : recruit.recruitType === "JUCO" ? `JUCO from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "FR"})` : "High School"}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span>Bats {recruit.batHand || "R"} / Throws {recruit.throwHand || "R"}</span>
              {recruit.position !== "P" && (scoutPct >= TRAJECTORY_REVEAL_THRESHOLD || recruit.isBlueChip) && recruit.trajectory != null && (
                <Badge variant="outline" className={`flex items-center gap-0.5 text-[9px] no-default-hover-elevate no-default-active-elevate ${
                  recruit.trajectory === 1 ? "border-emerald-500/50 text-emerald-400" :
                  recruit.trajectory === 3 ? "border-amber-500/50 text-amber-400" :
                  recruit.trajectory === 4 ? "border-red-500/50 text-red-400" :
                  "border-slate-500/50 text-slate-400"
                }`} data-testid="badge-detail-traj">
                  <TrajectoryIcon trajectory={recruit.trajectory as 1|2|3|4} iconSize="w-3 h-3" textSize="text-[9px]" />
                </Badge>
              )}
            </div>
          </div>

          {recruit.recruitType === "TRANSFER" && (recruit as any).originPrestige != null && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-purple-900/20 border border-purple-500/30 rounded" data-testid="transfer-prestige-target">
              <span className="text-[10px] text-purple-300 font-pixel">Prestige Target</span>
              <span className="text-[10px] text-purple-200">{Math.max(1, (recruit as any).originPrestige - 2)}–{Math.min(10, (recruit as any).originPrestige + 2)}</span>
              <span className="text-[9px] text-muted-foreground">(origin: {(recruit as any).originPrestige})</span>
            </div>
          )}

          {sdLocked.size > 0 && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gold/10 border border-gold/30 rounded" data-testid="signing-day-locked-banner">
              <Lock className="w-3 h-3 text-gold/70 shrink-0" />
              <span className="text-[9px] text-gold/80 font-pixel">{sdLocked.size} attribute{sdLocked.size !== 1 ? "s" : ""} revealed at Signing Day Reveal</span>
            </div>
          )}

          {/* Compact letter-grade strip — mirrors board card badges */}
          {previewStripContent}

          {/* Pitch mix row — mirrors board card (pitchers only) */}
          {isPitcherRecruit && (() => {
            const modalPitchFields = [
              ["pitchFB", "FB"], ["pitch2S", "2S"], ["pitchSL", "SL"], ["pitchCB", "CB"],
              ["pitchCH", "CH"], ["pitchCT", "CT"], ["pitchSNK", "SNK"], ["pitchSPL", "SPL"],
              ["pitchSHU", "SHU"], ["pitchSWP", "SWP"], ["pitchKN", "KN"],
              ["pitchVSL", "VSL"], ["pitchSFF", "SFF"], ["pitchFK", "FK"],
              ["pitchSCB", "SCB"], ["pitchPCB", "PCB"],
            ] as const;
            const revealedPitchFields = computeRevealedPitchFields(recruit.scoutingOrder as string[], scoutPct);
            const active = modalPitchFields.filter(([k]) => {
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

          {recruit.position === "P" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
                <div className="grid grid-cols-2 gap-3">
                  {attrs.map((attr, idx) => {
                    const isSigningDayLocked = sdLocked.has(attr.key);
                    const revealed = !isSigningDayLocked && (isFullyRevealed || revealedAttrs.includes(attr.key));
                    const isVelocity = attr.key === "velocity";
                    const displayValue = isVelocity && revealed 
                      ? `${velocityToKMH(attr.value)} KMH`
                      : (revealed ? attr.value : "??");
                    return (
                      <div
                        key={attr.key}
                        className={`flex items-center justify-between p-2 bg-muted/50 rounded${revealed ? " sim-row-in" : ""}`}
                        style={revealed ? { animationDelay: `${idx * 40}ms` } : undefined}
                      >
                        <span className="text-sm text-muted-foreground">{attr.label}</span>
                        {isSigningDayLocked || !revealed ? (
                          <SeeUponSigningBadge />
                        ) : (
                          <AttrFlipValue value={displayValue} delay={idx * 80 + 100} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Pitch Mix</h4>
                <PitchMixDial pitches={generatePitchMix()} className="w-32 h-32 mx-auto" />
              </div>
            </div>
          ) : (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
              <div className="grid grid-cols-2 gap-3">
                {attrs.map((attr, idx) => {
                  const isSigningDayLocked = sdLocked.has(attr.key);
                  const revealed = !isSigningDayLocked && (isFullyRevealed || revealedAttrs.includes(attr.key));
                  return (
                    <div
                      key={attr.key}
                      className={`flex items-center justify-between p-2 bg-muted/50 rounded${revealed ? " sim-row-in" : ""}`}
                      style={revealed ? { animationDelay: `${idx * 40}ms` } : undefined}
                    >
                      <span className="text-sm text-muted-foreground">{attr.label}</span>
                      {isSigningDayLocked || !revealed ? (
                        <SeeUponSigningBadge />
                      ) : (
                        <AttrFlipValue value={attr.value} delay={idx * 80 + 100} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Common Abilities Section */}
          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Common Abilities</h4>
            <div className="grid grid-cols-2 gap-2">
              {recruit.position === "P" ? (
                <>
                  <CommonAbilityRow label="W/RISP" value={recruitPitcherSGoldDisplayValue(recruit.wRISP, "wRISP", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("wRISP")} goldAbilityName={recruitPitcherSGoldBadge("wRISP", recruit.wRISP, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="vs Lefty" value={recruitPitcherSGoldDisplayValue(recruit.vsLefty, "vsLefty", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("vsLefty")} goldAbilityName={recruitPitcherSGoldBadge("vsLefty", recruit.vsLefty, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Poise" value={recruitPitcherSGoldDisplayValue(recruit.poise, "poise", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("poise")} goldAbilityName={recruitPitcherSGoldBadge("poise", recruit.poise, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Grit" value={recruitPitcherSGoldDisplayValue(recruit.grit, "grit", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("grit")} goldAbilityName={recruitPitcherSGoldBadge("grit", recruit.grit, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Heater" value={recruitPitcherSGoldDisplayValue(recruit.heater, "heater", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("heater")} goldAbilityName={recruitPitcherSGoldBadge("heater", recruit.heater, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Agile" value={recruitPitcherSGoldDisplayValue(recruit.agile, "agile", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("agile")} goldAbilityName={recruitPitcherSGoldBadge("agile", recruit.agile, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Recovery" value={recruitPitcherSGoldDisplayValue(recruit.recovery, "recovery", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("recovery")} goldAbilityName={recruitPitcherSGoldBadge("recovery", recruit.recovery, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                </>
              ) : (
                <>
                  <CommonAbilityRow label="Clutch" value={recruitSGoldDisplayValue(recruit.clutch, "clutch", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("clutch")} goldAbilityName={recruitSGoldBadge(recruit.clutch, "clutch", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="vs LHP" value={recruitSGoldDisplayValue(recruit.vsLHP, "vsLHP", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("vsLHP")} goldAbilityName={recruitSGoldBadge(recruit.vsLHP, "vsLHP", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Grit" value={recruitSGoldDisplayValue(recruit.grit, "grit", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("grit")} goldAbilityName={recruitSGoldBadge(recruit.grit, "grit", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Stealing" value={recruitSGoldDisplayValue(recruit.stealing, "stealing", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("stealing")} goldAbilityName={recruitSGoldBadge(recruit.stealing, "stealing", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Running" value={recruitSGoldDisplayValue(recruit.running, "running", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("running")} goldAbilityName={recruitSGoldBadge(recruit.running, "running", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Throwing" value={recruitSGoldDisplayValue(recruit.throwing, "throwing", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("throwing")} goldAbilityName={recruitSGoldBadge(recruit.throwing, "throwing", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Recovery" value={recruit.recovery} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("recovery")} />
                  {recruit.position === "C" && (
                    <CommonAbilityRow label="Catcher" value={recruitSGoldDisplayValue(recruit.catcherAbility, "catcherAbility", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("catcherAbility")} goldAbilityName={recruitSGoldBadge(recruit.catcherAbility, "catcherAbility", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Priorities</h4>
            <div className="grid grid-cols-2 gap-3">
              {priorities.map((p) => {
                const priorityLabels: Record<string, string> = {
                  "Extremely": "Extremely Important",
                  "Very": "Very Important",
                  "Somewhat": "Somewhat Important",
                  "Not Important": "Not Important"
                };
                return (
                  <div key={p.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm text-muted-foreground">{p.label}</span>
                    {(scoutPct >= TRAJECTORY_REVEAL_THRESHOLD || recruit.isBlueChip) ? (
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {priorityLabels[p.value as string] || p.value}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs whitespace-nowrap text-muted-foreground">
                        ???
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
            {scoutPct < TRAJECTORY_REVEAL_THRESHOLD && !recruit.isBlueChip && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Scout to 50% to unlock priorities
              </p>
            )}
          </div>

          {/* Abilities Section */}
          {(recruit.abilities as string[] || []).length > 0 && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">
                Special Abilities ({isFullyRevealed ? (recruit.abilities as string[]).length : `${revealedAbilitiesCount}/?`})
              </h4>
              <div className="flex flex-wrap gap-2">
                {(recruit.abilities as string[] || []).map((abilityName, idx) => {
                  const ability = getAbilityByName(abilityName);
                  const isAbilityRevealed = isFullyRevealed || revealedAbilitiesCount > idx;
                  
                  if (!isAbilityRevealed) {
                    return (
                      <SeeUponSigningBadge key={idx} />
                    );
                  }
                  
                  const tierColors = {
                    gold: "bg-yellow-600/20 border-yellow-500 text-yellow-400",
                    blue: "bg-blue-600/20 border-blue-500 text-blue-400",
                    red: "bg-red-600/20 border-red-500 text-red-400",
                  };
                  
                  return (
                    <Badge 
                      key={idx}
                      variant="outline"
                      className={`text-xs ${ability ? tierColors[ability.tier] : ""}`}
                      title={ability?.description}
                    >
                      {abilityName}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intangibles / Dev Traits */}
          {(recruit.personality || recruit.workEthic || recruit.gemBustRevealed || scoutPct >= TRAJECTORY_REVEAL_THRESHOLD) && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Intangibles</h4>
              <div className="grid grid-cols-2 gap-3">
                {recruit.personality && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Personality</span>
                    <span className="text-sm font-medium text-foreground capitalize">{(recruit.personality as string).replace(/_/g, " ")}</span>
                  </div>
                )}
                {recruit.workEthic && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Work Ethic</span>
                    <span className="text-sm font-medium text-foreground capitalize">{recruit.workEthic as string}</span>
                  </div>
                )}
                {recruit.workEthicScore != null && scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Work Ethic</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-pixel text-sm font-bold ${
                        recruit.workEthicScore >= 90 ? "text-emerald-400" :
                        recruit.workEthicScore >= 82 ? "text-green-400" :
                        recruit.workEthicScore >= 70 ? "text-foreground" :
                        recruit.workEthicScore >= 58 ? "text-orange-400" : "text-red-400"
                      }`}>{getDevTraitGrade(recruit.workEthicScore)}</span>
                    </span>
                  </div>
                )}
                {recruit.coachability != null && scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Coachability</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-pixel text-sm font-bold ${
                        recruit.coachability >= 90 ? "text-emerald-400" :
                        recruit.coachability >= 82 ? "text-green-400" :
                        recruit.coachability >= 70 ? "text-foreground" :
                        recruit.coachability >= 58 ? "text-orange-400" : "text-red-400"
                      }`}>{getDevTraitGrade(recruit.coachability)}</span>
                    </span>
                  </div>
                )}
                {recruit.playerArchetype && recruit.playerArchetype !== "normal" && (
                  recruit.playerArchetype === "overdraft" ? scoutPct >= ARCHETYPE_REVEAL_THRESHOLD : scoutPct >= TRAJECTORY_REVEAL_THRESHOLD
                ) && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50 col-span-2">
                    <span className="text-[10px] text-muted-foreground block mb-1">Development Profile</span>
                    <span className={`text-sm font-medium ${
                      recruit.playerArchetype === "late_bloomer" ? "text-emerald-400" :
                      recruit.playerArchetype === "overdraft" ? "text-orange-400" :
                      "text-yellow-400"
                    }`}>
                      {recruit.playerArchetype === "late_bloomer"
                        ? "Late Bloomer — ceiling higher than current rating implies"
                        : recruit.playerArchetype === "overdraft"
                        ? "Overdraft — ceiling lower than current rating implies"
                        : "Raw Prospect — extreme tool variance, high risk/high reward"}
                    </span>
                  </div>
                )}
                {recruit.gemBustRevealed && (
                  <div className={`rounded p-2.5 border col-span-2 ${
                    recruit.isGenerationalGem ? "bg-amber-500/15 border-amber-500/40" :
                    recruit.isGenerationalBust ? "bg-red-700/15 border-red-700/40" :
                    recruit.isGem ? "bg-green-500/10 border-green-500/30" : 
                    recruit.isBust ? "bg-red-500/10 border-red-500/30" : "bg-muted/30 border-border/50"
                  }`}>
                    <span className="text-[10px] text-muted-foreground block mb-1">Scout Assessment</span>
                    <span className={`text-sm font-medium ${
                      recruit.isGenerationalGem ? "text-amber-400" :
                      recruit.isGenerationalBust ? "text-red-400" :
                      recruit.isGem ? "text-green-400" : recruit.isBust ? "text-red-400" : "text-foreground"
                    }`}>
                      {recruit.isGenerationalGem 
                        ? "GENERATIONAL TALENT - Once-in-a-generation player. Elite in every way."
                        : recruit.isGenerationalBust 
                        ? "GENERATIONAL BUST - Severely overrated. A major disappointment waiting to happen."
                        : recruit.isGem ? "Hidden Gem - Better than rating suggests" 
                        : recruit.isBust ? "Potential Bust - May be overrated" 
                        : "Accurate Rating - What you see is what you get"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {scoutPct < TRAJECTORY_REVEAL_THRESHOLD && !recruit.personality && !recruit.workEthic && !recruit.gemBustRevealed && (
            <div className="bg-muted/20 rounded p-3 border border-dashed border-border/40">
              <h4 className="font-pixel text-[10px] text-muted-foreground mb-1">Intangibles</h4>
              <p className="text-xs text-muted-foreground italic">Unknown — scout to 50% to begin revealing work ethic and development traits.</p>
            </div>
          )}

          {recruit.dealbreaker && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
              <div className="flex items-center gap-2 text-red-400 mb-1">
                <HelpCircle className="w-4 h-4" />
                <span className="font-pixel text-[10px]">Dealbreaker</span>
              </div>
              <p className="text-sm text-foreground">{recruit.dealbreaker}</p>
            </div>
          )}

          {recruit.nilCost != null && recruit.nilCost > 0 && recruit.stage !== "signed" && scoutPct >= NIL_SCOUT_THRESHOLD && (
            <div className={`flex items-center justify-between px-3 py-2 rounded border ${
              nilRemaining != null && Math.ceil(recruit.nilCost * 1.25) > nilRemaining
                ? "bg-red-500/10 border-red-500/30"
                : "bg-gold/5 border-gold/20"
            }`} data-testid="nil-cost-banner">
              <div className="flex items-center gap-2">
                <DollarSign className={`w-3.5 h-3.5 ${nilRemaining != null && Math.ceil(recruit.nilCost * 1.25) > nilRemaining ? "text-red-400" : "text-gold"}`} />
                <span className="text-[10px] text-muted-foreground">NIL Est. to Sign</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-pixel text-xs font-bold ${nilRemaining != null && Math.ceil(recruit.nilCost * 1.25) > nilRemaining ? "text-red-400" : "text-gold"}`}>
                  {formatNilRange(recruit.nilCost)}
                </span>
                {nilRemaining != null && Math.ceil(recruit.nilCost * 1.25) > nilRemaining && (
                  <span className="flex items-center gap-1 text-[9px] text-red-400">
                    <Lock className="w-2.5 h-2.5" />
                    Over budget
                  </span>
                )}
              </div>
            </div>
          )}

          {recruit.stage === "signed" && recruit.signedTeamId ? (
            <div className="p-4 rounded text-center" style={{ backgroundColor: `${(recruit as RecruitWithInterest).signedTeamPrimaryColor}15` || "rgba(100,100,100,0.1)", border: `1px solid ${(recruit as RecruitWithInterest).signedTeamPrimaryColor}40` }}>
              <p className="font-pixel text-xs mb-1" style={{ color: (recruit as RecruitWithInterest).signedTeamPrimaryColor || "#ccc" }}>
                Signed with {(recruit as RecruitWithInterest).signedTeamName || "Unknown"}
              </p>
              <p className="text-[10px] text-muted-foreground">This recruit is no longer available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <RetroButton 
                variant="outline" 
                className="border-green-500 text-green-400 hover:bg-green-500/10"
                data-testid="button-scout-modal"
                onClick={() => onScout(recruit.id)}
                disabled={isScouting || scoutPct >= 100}
              >
                <Eye className="w-4 h-4 mr-2" />
                {isScouting ? "Scouting..." : `Scout (${scoutPct}%)`}
              </RetroButton>
              <RetroButton 
                className="flex-1" 
                data-testid="button-phone"
                variant={showModalPhonePicker ? "primary" : "outline"}
                onClick={() => { setShowModalPhonePicker(!showModalPhonePicker); setShowModalEmailPicker(false); setModalPhonePitches([]); }}
                disabled={isPhoning}
              >
                <Phone className="w-4 h-4 mr-2" />
                {isPhoning ? "Calling..." : "Phone (3 pitches)"}
              </RetroButton>
              <RetroButton 
                variant={showModalEmailPicker ? "primary" : "outline"}
                className="flex-1" 
                data-testid="button-email"
                onClick={() => { setShowModalEmailPicker(!showModalEmailPicker); setShowModalPhonePicker(false); setModalEmailPitch(null); }}
                disabled={isEmailing}
              >
                <Mail className="w-4 h-4 mr-2" />
                {isEmailing ? "Sending..." : "Email (1 pitch)"}
              </RetroButton>
              <Tooltip>
                <TooltipTrigger asChild>
                  <RetroButton 
                    variant={hasVisited ? "primary" : "outline"}
                    className="flex-1" 
                    data-testid="button-visit"
                    onClick={() => onVisit(recruit.id)}
                    disabled={isVisiting || remainingPoints < visitCost || hasVisited || seasonVisitCapReached}
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    {hasVisited ? "Visited" : seasonVisitCapReached ? "Cap Reached" : isVisiting ? "Scheduling..." : `Campus Visit (${visitCost})`}
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>{hasVisited ? "Campus Visit already used for this recruit" : seasonVisitCapReached ? `Season visit cap reached${visitCap != null ? ` (${visitCap} total)` : ""}. Resets next season.` : `Campus Visit — ${visitCost} recruiting points`}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <RetroButton 
                    variant={hasHeadCoachVisited ? "primary" : "outline"}
                    className="flex-1" 
                    data-testid="button-head-coach-visit"
                    onClick={() => onHeadCoachVisit(recruit.id)}
                    disabled={isHeadCoachVisiting || remainingPoints < headCoachVisitCost || hasHeadCoachVisited || seasonVisitCapReached}
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    {hasHeadCoachVisited ? "HC Visited" : seasonVisitCapReached ? "Cap Reached" : isHeadCoachVisiting ? "Visiting..." : `HC Visit (${headCoachVisitCost})`}
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>{hasHeadCoachVisited ? "Head Coach Visit already used for this recruit" : seasonVisitCapReached ? `Season visit cap reached${visitCap != null ? ` (${visitCap} total)` : ""}. Resets next season.` : `Head Coach Visit — ${headCoachVisitCost} recruiting points`}</TooltipContent>
              </Tooltip>
              {nilRemaining != null && Math.ceil((recruit.nilCost || 0) * 1.25) > nilRemaining && !recruit.interest?.hasOffer && scoutPct >= NIL_SCOUT_THRESHOLD ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="col-span-1">
                      <RetroButton 
                        variant="outline" 
                        className="border-red-500/50 text-red-400/60 w-full"
                        data-testid="button-offer-scholarship"
                        disabled
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Over NIL Budget
                      </RetroButton>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Not enough NIL budget to sign this recruit (est. {formatNilRange(recruit.nilCost || 0)}
                    {", "}$
                    {nilRemaining >= 1000000
                      ? `${(nilRemaining / 1000000).toFixed(2)}M`
                      : `${Math.round(nilRemaining / 1000)}K`}
                    {" remaining)"}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <RetroButton 
                  variant="outline" 
                  className="border-gold text-gold"
                  data-testid="button-offer-scholarship"
                  onClick={() => onOffer(recruit.id)}
                  disabled={isOffering || recruit.interest?.hasOffer}
                >
                  <GraduationCap className="w-4 h-4 mr-2" />
                  {isOffering ? "Offering..." : recruit.interest?.hasOffer ? "Offered" : "Offer Scholarship"}
                </RetroButton>
              )}
            </div>
          )}

          {showModalPhonePicker && recruit && (
            <div className="p-3 bg-muted/30 border border-border rounded" data-testid="modal-pitch-picker-phone">
              <p className="text-[10px] font-pixel text-gold mb-2">SELECT UP TO 3 PITCHES FOR PHONE CALL</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {modalPitchOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => toggleModalPhonePitch(opt.key)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      modalPhonePitches.includes(opt.key)
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`modal-pitch-phone-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <RetroButton
                  size="sm"
                  onClick={() => {
                    onPhone(recruit.id, modalPhonePitches.join(","));
                    setShowModalPhonePicker(false);
                    setModalPhonePitches([]);
                  }}
                  disabled={modalPhonePitches.length === 0 || isPhoning}
                  data-testid="modal-button-send-phone"
                >
                  <Phone className="w-3 h-3 mr-1" />
                  Call ({modalPhonePitches.length}/3)
                </RetroButton>
                <RetroButton variant="outline" size="sm" onClick={() => { setShowModalPhonePicker(false); setModalPhonePitches([]); }}>
                  Cancel
                </RetroButton>
              </div>
            </div>
          )}

          {showModalEmailPicker && recruit && (
            <div className="p-3 bg-muted/30 border border-border rounded" data-testid="modal-pitch-picker-email">
              <p className="text-[10px] font-pixel text-gold mb-2">SELECT 1 PITCH FOR EMAIL</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {modalPitchOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setModalEmailPitch(modalEmailPitch === opt.key ? null : opt.key)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      modalEmailPitch === opt.key
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`modal-pitch-email-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <RetroButton
                  size="sm"
                  onClick={() => {
                    onEmail(recruit.id, modalEmailPitch || undefined);
                    setShowModalEmailPicker(false);
                    setModalEmailPitch(null);
                  }}
                  disabled={!modalEmailPitch || isEmailing}
                  data-testid="modal-button-send-email"
                >
                  <Mail className="w-3 h-3 mr-1" />
                  Send Email
                </RetroButton>
                <RetroButton variant="outline" size="sm" onClick={() => { setShowModalEmailPicker(false); setModalEmailPitch(null); }}>
                  Cancel
                </RetroButton>
              </div>
            </div>
          )}

          {/* Competing Schools */}
          {recruit.topSchools && recruit.topSchools.length > 0 && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">
                {recruit.stage === "top3" ? "Top 3 Schools" : recruit.stage === "top5" ? "Top 5 Schools" : recruit.stage === "top8" ? "Top 8 Schools" : "Competing Schools"}
              </h4>
              <CompetingSchoolsList
                topSchools={recruit.topSchools}
                stage={recruit.stage}
                userTeamId={userTeamId}
                trend={trend}
                showRowRankBadge
                testIdPrefix="modal"
              />
            </div>
          )}

          {/* Actions Log */}
          <RecruitActionsLog recruitId={recruit.id} leagueId={leagueId} />
        </div>
      </SheetContent>
    </Sheet>
    );
  }

  return (
    <Dialog open={!!recruit} onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-gold max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="recruit-detail-dialog-desktop">
        <DialogHeader>
          <DialogTitle asChild>{headerContent}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded">
              <p className={`font-bold text-gold ${isFullyRevealed ? "text-2xl" : "text-lg"}`}>
                {getOverallDisplay()}
              </p>
              <p className="text-xs text-muted-foreground">Overall (1-999)</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className={`font-bold ${isFullyRevealed ? "text-2xl" : "text-lg"}`}>
                {getStarDisplay()}
              </p>
              <p className="text-xs text-muted-foreground">Star Rating</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className="text-lg font-bold">{recruit.classRank}</p>
              <p className="text-xs text-muted-foreground">Class Rank</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className="text-lg font-bold">{recruit.positionRank}</p>
              <p className="text-xs text-muted-foreground">Pos Rank</p>
            </div>
          </div>
          {recruit.stage !== "signed" && (
            <RetroButton
              variant={recruit.interest?.isTargeted ? "primary" : "outline"}
              className="w-full"
              onClick={() => onTarget?.()}
              disabled={isTargeting}
              data-testid="button-target-modal-desktop"
            >
              <Target className="w-4 h-4 mr-2" />
              {isTargeting ? "Updating..." : recruit.interest?.isTargeted ? "Untarget Player" : "Target Player"}
            </RetroButton>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span className="truncate">{recruit.recruitType === "TRANSFER" ? `Transfer from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "SO"})` : recruit.recruitType === "JUCO" ? `JUCO from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "FR"})` : "High School"}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span>Bats {recruit.batHand || "R"} / Throws {recruit.throwHand || "R"}</span>
              {recruit.position !== "P" && (scoutPct >= TRAJECTORY_REVEAL_THRESHOLD || recruit.isBlueChip) && recruit.trajectory != null && (
                <Badge variant="outline" className={`flex items-center gap-0.5 text-[9px] no-default-hover-elevate no-default-active-elevate ${
                  recruit.trajectory === 1 ? "border-emerald-500/50 text-emerald-400" :
                  recruit.trajectory === 3 ? "border-amber-500/50 text-amber-400" :
                  recruit.trajectory === 4 ? "border-red-500/50 text-red-400" :
                  "border-slate-500/50 text-slate-400"
                }`} data-testid="badge-detail-traj">
                  <TrajectoryIcon trajectory={recruit.trajectory as 1|2|3|4} iconSize="w-3 h-3" textSize="text-[9px]" />
                </Badge>
              )}
            </div>
          </div>

          {recruit.recruitType === "TRANSFER" && (recruit as any).originPrestige != null && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-purple-900/20 border border-purple-500/30 rounded" data-testid="transfer-prestige-target">
              <span className="text-[10px] text-purple-300 font-pixel">Prestige Target</span>
              <span className="text-[10px] text-purple-200">{Math.max(1, (recruit as any).originPrestige - 2)}–{Math.min(10, (recruit as any).originPrestige + 2)}</span>
              <span className="text-[9px] text-muted-foreground">(origin: {(recruit as any).originPrestige})</span>
            </div>
          )}

          {sdLocked.size > 0 && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gold/10 border border-gold/30 rounded" data-testid="signing-day-locked-banner">
              <Lock className="w-3 h-3 text-gold/70 shrink-0" />
              <span className="text-[9px] text-gold/80 font-pixel">{sdLocked.size} attribute{sdLocked.size !== 1 ? "s" : ""} revealed at Signing Day Reveal</span>
            </div>
          )}

          {/* Compact letter-grade strip — mirrors board card badges */}
          {previewStripContent}

          {/* Pitch mix row — mirrors board card (pitchers only) */}
          {isPitcherRecruit && (() => {
            const modalPitchFields = [
              ["pitchFB", "FB"], ["pitch2S", "2S"], ["pitchSL", "SL"], ["pitchCB", "CB"],
              ["pitchCH", "CH"], ["pitchCT", "CT"], ["pitchSNK", "SNK"], ["pitchSPL", "SPL"],
              ["pitchSHU", "SHU"], ["pitchSWP", "SWP"], ["pitchKN", "KN"],
              ["pitchVSL", "VSL"], ["pitchSFF", "SFF"], ["pitchFK", "FK"],
              ["pitchSCB", "SCB"], ["pitchPCB", "PCB"],
            ] as const;
            const revealedPitchFields = computeRevealedPitchFields(recruit.scoutingOrder as string[], scoutPct);
            const active = modalPitchFields.filter(([k]) => {
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

          {recruit.position === "P" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
                <div className="grid grid-cols-2 gap-3">
                  {attrs.map((attr, idx) => {
                    const isSigningDayLocked = sdLocked.has(attr.key);
                    const revealed = !isSigningDayLocked && (isFullyRevealed || revealedAttrs.includes(attr.key));
                    const isVelocity = attr.key === "velocity";
                    const displayValue = isVelocity && revealed 
                      ? `${velocityToKMH(attr.value)} KMH`
                      : (revealed ? attr.value : "??");
                    return (
                      <div
                        key={attr.key}
                        className={`flex items-center justify-between p-2 bg-muted/50 rounded${revealed ? " sim-row-in" : ""}`}
                        style={revealed ? { animationDelay: `${idx * 40}ms` } : undefined}
                      >
                        <span className="text-sm text-muted-foreground">{attr.label}</span>
                        {isSigningDayLocked || !revealed ? (
                          <SeeUponSigningBadge />
                        ) : (
                          <AttrFlipValue value={displayValue} delay={idx * 80 + 100} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Pitch Mix</h4>
                <PitchMixDial pitches={generatePitchMix()} className="w-32 h-32 mx-auto" />
              </div>
            </div>
          ) : (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
              <div className="grid grid-cols-2 gap-3">
                {attrs.map((attr, idx) => {
                  const isSigningDayLocked = sdLocked.has(attr.key);
                  const revealed = !isSigningDayLocked && (isFullyRevealed || revealedAttrs.includes(attr.key));
                  return (
                    <div
                      key={attr.key}
                      className={`flex items-center justify-between p-2 bg-muted/50 rounded${revealed ? " sim-row-in" : ""}`}
                      style={revealed ? { animationDelay: `${idx * 40}ms` } : undefined}
                    >
                      <span className="text-sm text-muted-foreground">{attr.label}</span>
                      {isSigningDayLocked || !revealed ? (
                        <SeeUponSigningBadge />
                      ) : (
                        <AttrFlipValue value={attr.value} delay={idx * 80 + 100} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Common Abilities Section */}
          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Common Abilities</h4>
            <div className="grid grid-cols-2 gap-2">
              {recruit.position === "P" ? (
                <>
                  <CommonAbilityRow label="W/RISP" value={recruitPitcherSGoldDisplayValue(recruit.wRISP, "wRISP", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("wRISP")} goldAbilityName={recruitPitcherSGoldBadge("wRISP", recruit.wRISP, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="vs Lefty" value={recruitPitcherSGoldDisplayValue(recruit.vsLefty, "vsLefty", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("vsLefty")} goldAbilityName={recruitPitcherSGoldBadge("vsLefty", recruit.vsLefty, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Poise" value={recruitPitcherSGoldDisplayValue(recruit.poise, "poise", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("poise")} goldAbilityName={recruitPitcherSGoldBadge("poise", recruit.poise, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Grit" value={recruitPitcherSGoldDisplayValue(recruit.grit, "grit", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("grit")} goldAbilityName={recruitPitcherSGoldBadge("grit", recruit.grit, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Heater" value={recruitPitcherSGoldDisplayValue(recruit.heater, "heater", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("heater")} goldAbilityName={recruitPitcherSGoldBadge("heater", recruit.heater, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Agile" value={recruitPitcherSGoldDisplayValue(recruit.agile, "agile", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("agile")} goldAbilityName={recruitPitcherSGoldBadge("agile", recruit.agile, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Recovery" value={recruitPitcherSGoldDisplayValue(recruit.recovery, "recovery", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("recovery")} goldAbilityName={recruitPitcherSGoldBadge("recovery", recruit.recovery, isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                </>
              ) : (
                <>
                  <CommonAbilityRow label="Clutch" value={recruitSGoldDisplayValue(recruit.clutch, "clutch", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("clutch")} goldAbilityName={recruitSGoldBadge(recruit.clutch, "clutch", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="vs LHP" value={recruitSGoldDisplayValue(recruit.vsLHP, "vsLHP", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("vsLHP")} goldAbilityName={recruitSGoldBadge(recruit.vsLHP, "vsLHP", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Grit" value={recruitSGoldDisplayValue(recruit.grit, "grit", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("grit")} goldAbilityName={recruitSGoldBadge(recruit.grit, "grit", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Stealing" value={recruitSGoldDisplayValue(recruit.stealing, "stealing", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("stealing")} goldAbilityName={recruitSGoldBadge(recruit.stealing, "stealing", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Running" value={recruitSGoldDisplayValue(recruit.running, "running", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("running")} goldAbilityName={recruitSGoldBadge(recruit.running, "running", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Throwing" value={recruitSGoldDisplayValue(recruit.throwing, "throwing", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("throwing")} goldAbilityName={recruitSGoldBadge(recruit.throwing, "throwing", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  <CommonAbilityRow label="Recovery" value={recruit.recovery} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("recovery")} />
                  {recruit.position === "C" && (
                    <CommonAbilityRow label="Catcher" value={recruitSGoldDisplayValue(recruit.catcherAbility, "catcherAbility", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("catcherAbility")} goldAbilityName={recruitSGoldBadge(recruit.catcherAbility, "catcherAbility", isFullyRevealed ? (recruit.abilities as string[] || []) : (recruit.abilities as string[] || []).slice(0, revealedAbilitiesCount))} />
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Priorities</h4>
            <div className="grid grid-cols-2 gap-3">
              {priorities.map((p) => {
                const priorityLabels: Record<string, string> = {
                  "Extremely": "Extremely Important",
                  "Very": "Very Important",
                  "Somewhat": "Somewhat Important",
                  "Not Important": "Not Important"
                };
                return (
                  <div key={p.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm text-muted-foreground">{p.label}</span>
                    {(scoutPct >= TRAJECTORY_REVEAL_THRESHOLD || recruit.isBlueChip) ? (
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {priorityLabels[p.value as string] || p.value}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs whitespace-nowrap text-muted-foreground">
                        ???
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
            {scoutPct < TRAJECTORY_REVEAL_THRESHOLD && !recruit.isBlueChip && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Scout to 50% to unlock priorities
              </p>
            )}
          </div>

          {/* Abilities Section */}
          {(recruit.abilities as string[] || []).length > 0 && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">
                Special Abilities ({isFullyRevealed ? (recruit.abilities as string[]).length : `${revealedAbilitiesCount}/?`})
              </h4>
              <div className="flex flex-wrap gap-2">
                {(recruit.abilities as string[] || []).map((abilityName, idx) => {
                  const ability = getAbilityByName(abilityName);
                  const isAbilityRevealed = isFullyRevealed || revealedAbilitiesCount > idx;
                  
                  if (!isAbilityRevealed) {
                    return (
                      <SeeUponSigningBadge key={idx} />
                    );
                  }
                  
                  const tierColors = {
                    gold: "bg-yellow-600/20 border-yellow-500 text-yellow-400",
                    blue: "bg-blue-600/20 border-blue-500 text-blue-400",
                    red: "bg-red-600/20 border-red-500 text-red-400",
                  };
                  
                  return (
                    <Badge 
                      key={idx}
                      variant="outline"
                      className={`text-xs ${ability ? tierColors[ability.tier] : ""}`}
                      title={ability?.description}
                    >
                      {abilityName}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intangibles / Dev Traits */}
          {(recruit.personality || recruit.workEthic || recruit.gemBustRevealed || scoutPct >= TRAJECTORY_REVEAL_THRESHOLD) && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Intangibles</h4>
              <div className="grid grid-cols-2 gap-3">
                {recruit.personality && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Personality</span>
                    <span className="text-sm font-medium text-foreground capitalize">{(recruit.personality as string).replace(/_/g, " ")}</span>
                  </div>
                )}
                {recruit.workEthic && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Work Ethic</span>
                    <span className="text-sm font-medium text-foreground capitalize">{recruit.workEthic as string}</span>
                  </div>
                )}
                {recruit.workEthicScore != null && scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Work Ethic</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-pixel text-sm font-bold ${
                        recruit.workEthicScore >= 90 ? "text-emerald-400" :
                        recruit.workEthicScore >= 82 ? "text-green-400" :
                        recruit.workEthicScore >= 70 ? "text-foreground" :
                        recruit.workEthicScore >= 58 ? "text-orange-400" : "text-red-400"
                      }`}>{getDevTraitGrade(recruit.workEthicScore)}</span>
                    </span>
                  </div>
                )}
                {recruit.coachability != null && scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Coachability</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-pixel text-sm font-bold ${
                        recruit.coachability >= 90 ? "text-emerald-400" :
                        recruit.coachability >= 82 ? "text-green-400" :
                        recruit.coachability >= 70 ? "text-foreground" :
                        recruit.coachability >= 58 ? "text-orange-400" : "text-red-400"
                      }`}>{getDevTraitGrade(recruit.coachability)}</span>
                    </span>
                  </div>
                )}
                {recruit.playerArchetype && recruit.playerArchetype !== "normal" && (
                  recruit.playerArchetype === "overdraft" ? scoutPct >= ARCHETYPE_REVEAL_THRESHOLD : scoutPct >= TRAJECTORY_REVEAL_THRESHOLD
                ) && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50 col-span-2">
                    <span className="text-[10px] text-muted-foreground block mb-1">Development Profile</span>
                    <span className={`text-sm font-medium ${
                      recruit.playerArchetype === "late_bloomer" ? "text-emerald-400" :
                      recruit.playerArchetype === "overdraft" ? "text-orange-400" :
                      "text-yellow-400"
                    }`}>
                      {recruit.playerArchetype === "late_bloomer"
                        ? "Late Bloomer — ceiling higher than current rating implies"
                        : recruit.playerArchetype === "overdraft"
                        ? "Overdraft — ceiling lower than current rating implies"
                        : "Raw Prospect — extreme tool variance, high risk/high reward"}
                    </span>
                  </div>
                )}
                {recruit.gemBustRevealed && (
                  <div className={`rounded p-2.5 border col-span-2 ${
                    recruit.isGenerationalGem ? "bg-amber-500/15 border-amber-500/40" :
                    recruit.isGenerationalBust ? "bg-red-700/15 border-red-700/40" :
                    recruit.isGem ? "bg-green-500/10 border-green-500/30" : 
                    recruit.isBust ? "bg-red-500/10 border-red-500/30" : "bg-muted/30 border-border/50"
                  }`}>
                    <span className="text-[10px] text-muted-foreground block mb-1">Scout Assessment</span>
                    <span className={`text-sm font-medium ${
                      recruit.isGenerationalGem ? "text-amber-400" :
                      recruit.isGenerationalBust ? "text-red-400" :
                      recruit.isGem ? "text-green-400" : recruit.isBust ? "text-red-400" : "text-foreground"
                    }`}>
                      {recruit.isGenerationalGem 
                        ? "GENERATIONAL TALENT - Once-in-a-generation player. Elite in every way."
                        : recruit.isGenerationalBust 
                        ? "GENERATIONAL BUST - Severely overrated. A major disappointment waiting to happen."
                        : recruit.isGem ? "Hidden Gem - Better than rating suggests" 
                        : recruit.isBust ? "Potential Bust - May be overrated" 
                        : "Accurate Rating - What you see is what you get"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {scoutPct < TRAJECTORY_REVEAL_THRESHOLD && !recruit.personality && !recruit.workEthic && !recruit.gemBustRevealed && (
            <div className="bg-muted/20 rounded p-3 border border-dashed border-border/40">
              <h4 className="font-pixel text-[10px] text-muted-foreground mb-1">Intangibles</h4>
              <p className="text-xs text-muted-foreground italic">Unknown — scout to 50% to begin revealing work ethic and development traits.</p>
            </div>
          )}

          {recruit.dealbreaker && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
              <div className="flex items-center gap-2 text-red-400 mb-1">
                <HelpCircle className="w-4 h-4" />
                <span className="font-pixel text-[10px]">Dealbreaker</span>
              </div>
              <p className="text-sm text-foreground">{recruit.dealbreaker}</p>
            </div>
          )}

          {recruit.nilCost != null && recruit.nilCost > 0 && recruit.stage !== "signed" && scoutPct >= NIL_SCOUT_THRESHOLD && (
            <div className={`flex items-center justify-between px-3 py-2 rounded border ${
              nilRemaining != null && Math.ceil(recruit.nilCost * 1.25) > nilRemaining
                ? "bg-red-500/10 border-red-500/30"
                : "bg-gold/5 border-gold/20"
            }`} data-testid="nil-cost-banner">
              <div className="flex items-center gap-2">
                <DollarSign className={`w-3.5 h-3.5 ${nilRemaining != null && Math.ceil(recruit.nilCost * 1.25) > nilRemaining ? "text-red-400" : "text-gold"}`} />
                <span className="text-[10px] text-muted-foreground">NIL Est. to Sign</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-pixel text-xs font-bold ${nilRemaining != null && Math.ceil(recruit.nilCost * 1.25) > nilRemaining ? "text-red-400" : "text-gold"}`}>
                  {formatNilRange(recruit.nilCost)}
                </span>
                {nilRemaining != null && Math.ceil(recruit.nilCost * 1.25) > nilRemaining && (
                  <span className="flex items-center gap-1 text-[9px] text-red-400">
                    <Lock className="w-2.5 h-2.5" />
                    Over budget
                  </span>
                )}
              </div>
            </div>
          )}

          {recruit.stage === "signed" && recruit.signedTeamId ? (
            <div className="p-4 rounded text-center" style={{ backgroundColor: `${(recruit as RecruitWithInterest).signedTeamPrimaryColor}15` || "rgba(100,100,100,0.1)", border: `1px solid ${(recruit as RecruitWithInterest).signedTeamPrimaryColor}40` }}>
              <p className="font-pixel text-xs mb-1" style={{ color: (recruit as RecruitWithInterest).signedTeamPrimaryColor || "#ccc" }}>
                Signed with {(recruit as RecruitWithInterest).signedTeamName || "Unknown"}
              </p>
              <p className="text-[10px] text-muted-foreground">This recruit is no longer available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <RetroButton 
                variant="outline" 
                className="border-green-500 text-green-400 hover:bg-green-500/10"
                data-testid="button-scout-modal"
                onClick={() => onScout(recruit.id)}
                disabled={isScouting || scoutPct >= 100}
              >
                <Eye className="w-4 h-4 mr-2" />
                {isScouting ? "Scouting..." : `Scout (${scoutPct}%)`}
              </RetroButton>
              <RetroButton 
                className="flex-1" 
                data-testid="button-phone"
                variant={showModalPhonePicker ? "primary" : "outline"}
                onClick={() => { setShowModalPhonePicker(!showModalPhonePicker); setShowModalEmailPicker(false); setModalPhonePitches([]); }}
                disabled={isPhoning}
              >
                <Phone className="w-4 h-4 mr-2" />
                {isPhoning ? "Calling..." : "Phone (3 pitches)"}
              </RetroButton>
              <RetroButton 
                variant={showModalEmailPicker ? "primary" : "outline"}
                className="flex-1" 
                data-testid="button-email"
                onClick={() => { setShowModalEmailPicker(!showModalEmailPicker); setShowModalPhonePicker(false); setModalEmailPitch(null); }}
                disabled={isEmailing}
              >
                <Mail className="w-4 h-4 mr-2" />
                {isEmailing ? "Sending..." : "Email (1 pitch)"}
              </RetroButton>
              <Tooltip>
                <TooltipTrigger asChild>
                  <RetroButton 
                    variant={hasVisited ? "primary" : "outline"}
                    className="flex-1" 
                    data-testid="button-visit"
                    onClick={() => onVisit(recruit.id)}
                    disabled={isVisiting || remainingPoints < visitCost || hasVisited || seasonVisitCapReached}
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    {hasVisited ? "Visited" : seasonVisitCapReached ? "Cap Reached" : isVisiting ? "Scheduling..." : `Campus Visit (${visitCost})`}
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>{hasVisited ? "Campus Visit already used for this recruit" : seasonVisitCapReached ? `Season visit cap reached${visitCap != null ? ` (${visitCap} total)` : ""}. Resets next season.` : `Campus Visit — ${visitCost} recruiting points`}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <RetroButton 
                    variant={hasHeadCoachVisited ? "primary" : "outline"}
                    className="flex-1" 
                    data-testid="button-head-coach-visit"
                    onClick={() => onHeadCoachVisit(recruit.id)}
                    disabled={isHeadCoachVisiting || remainingPoints < headCoachVisitCost || hasHeadCoachVisited || seasonVisitCapReached}
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    {hasHeadCoachVisited ? "HC Visited" : seasonVisitCapReached ? "Cap Reached" : isHeadCoachVisiting ? "Visiting..." : `HC Visit (${headCoachVisitCost})`}
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>{hasHeadCoachVisited ? "Head Coach Visit already used for this recruit" : seasonVisitCapReached ? `Season visit cap reached${visitCap != null ? ` (${visitCap} total)` : ""}. Resets next season.` : `Head Coach Visit — ${headCoachVisitCost} recruiting points`}</TooltipContent>
              </Tooltip>
              {nilRemaining != null && Math.ceil((recruit.nilCost || 0) * 1.25) > nilRemaining && !recruit.interest?.hasOffer && scoutPct >= NIL_SCOUT_THRESHOLD ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="col-span-1">
                      <RetroButton 
                        variant="outline" 
                        className="border-red-500/50 text-red-400/60 w-full"
                        data-testid="button-offer-scholarship"
                        disabled
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Over NIL Budget
                      </RetroButton>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Not enough NIL budget to sign this recruit (est. {formatNilRange(recruit.nilCost || 0)}
                    {", "}$
                    {nilRemaining >= 1000000
                      ? `${(nilRemaining / 1000000).toFixed(2)}M`
                      : `${Math.round(nilRemaining / 1000)}K`}
                    {" remaining)"}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <RetroButton 
                  variant="outline" 
                  className="border-gold text-gold"
                  data-testid="button-offer-scholarship"
                  onClick={() => onOffer(recruit.id)}
                  disabled={isOffering || recruit.interest?.hasOffer}
                >
                  <GraduationCap className="w-4 h-4 mr-2" />
                  {isOffering ? "Offering..." : recruit.interest?.hasOffer ? "Offered" : "Offer Scholarship"}
                </RetroButton>
              )}
            </div>
          )}

          {showModalPhonePicker && recruit && (
            <div className="p-3 bg-muted/30 border border-border rounded" data-testid="modal-pitch-picker-phone">
              <p className="text-[10px] font-pixel text-gold mb-2">SELECT UP TO 3 PITCHES FOR PHONE CALL</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {modalPitchOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => toggleModalPhonePitch(opt.key)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      modalPhonePitches.includes(opt.key)
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`modal-pitch-phone-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <RetroButton
                  size="sm"
                  onClick={() => {
                    onPhone(recruit.id, modalPhonePitches.join(","));
                    setShowModalPhonePicker(false);
                    setModalPhonePitches([]);
                  }}
                  disabled={modalPhonePitches.length === 0 || isPhoning}
                  data-testid="modal-button-send-phone"
                >
                  <Phone className="w-3 h-3 mr-1" />
                  Call ({modalPhonePitches.length}/3)
                </RetroButton>
                <RetroButton variant="outline" size="sm" onClick={() => { setShowModalPhonePicker(false); setModalPhonePitches([]); }}>
                  Cancel
                </RetroButton>
              </div>
            </div>
          )}

          {showModalEmailPicker && recruit && (
            <div className="p-3 bg-muted/30 border border-border rounded" data-testid="modal-pitch-picker-email">
              <p className="text-[10px] font-pixel text-gold mb-2">SELECT 1 PITCH FOR EMAIL</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {modalPitchOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setModalEmailPitch(modalEmailPitch === opt.key ? null : opt.key)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      modalEmailPitch === opt.key
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`modal-pitch-email-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <RetroButton
                  size="sm"
                  onClick={() => {
                    onEmail(recruit.id, modalEmailPitch || undefined);
                    setShowModalEmailPicker(false);
                    setModalEmailPitch(null);
                  }}
                  disabled={!modalEmailPitch || isEmailing}
                  data-testid="modal-button-send-email"
                >
                  <Mail className="w-3 h-3 mr-1" />
                  Send Email
                </RetroButton>
                <RetroButton variant="outline" size="sm" onClick={() => { setShowModalEmailPicker(false); setModalEmailPitch(null); }}>
                  Cancel
                </RetroButton>
              </div>
            </div>
          )}

          {/* Competing Schools */}
          {recruit.topSchools && recruit.topSchools.length > 0 && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">
                {recruit.stage === "top3" ? "Top 3 Schools" : recruit.stage === "top5" ? "Top 5 Schools" : recruit.stage === "top8" ? "Top 8 Schools" : "Competing Schools"}
              </h4>
              <CompetingSchoolsList
                topSchools={recruit.topSchools}
                stage={recruit.stage}
                userTeamId={userTeamId}
                trend={trend}
                showRowRankBadge
                testIdPrefix="modal"
              />
            </div>
          )}

          {/* Actions Log */}
          <RecruitActionsLog recruitId={recruit.id} leagueId={leagueId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
