import { useState } from "react";
import { StarRating } from "@/components/ui/star-rating";
import { getLetterGrade } from "@/components/ui/letter-grade";
import { PlayerAvatar } from "@/components/player-avatar";
import { isPitcher, isCatcher } from "@shared/positions";
import { getAbilityByName } from "@shared/abilities";
import { getPotentialGrade } from "@shared/potential";
import { Crown, Zap } from "lucide-react";
import { TrajectoryIcon } from "@/components/ui/trajectory-icon";
import { computeRevealedPitchFields } from "@shared/recruitThresholds";
import { velocityToKMH } from "@/lib/playerUtils";

export interface RevealRecruit {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  throwHand: string;
  batHand: string;
  homeState: string;
  hometown: string;
  starRating: number;
  overall: number;
  classRank: number;
  positionRank: number;
  recruitType: string;
  recruitYear: string;
  isBlueChip?: boolean;
  isGem?: boolean;
  isBust?: boolean;
  isGenerationalGem?: boolean;
  isGenerationalBust?: boolean;
  gemBustRevealed?: boolean;
  fromTeamName?: string;
  potential?: number | null;
  abilities?: string[];
  hitForAvg?: number | null;
  power?: number | null;
  speed?: number | null;
  arm?: number | null;
  fielding?: number | null;
  errorResistance?: number | null;
  clutch?: number | null;
  stealing?: number | null;
  running?: number | null;
  throwing?: number | null;
  recovery?: number | null;
  catcherAbility?: number | null;
  vsLHP?: number | null;
  grit?: number | null;
  velocity?: number | null;
  control?: number | null;
  stamina?: number | null;
  stuff?: number | null;
  wRISP?: number | null;
  vsLefty?: number | null;
  poise?: number | null;
  heater?: number | null;
  agile?: number | null;
  trajectory?: number | null;
  pitchFB?: number | null;
  pitch2S?: number | null;
  pitchSL?: number | null;
  pitchCB?: number | null;
  pitchCH?: number | null;
  pitchCT?: number | null;
  pitchSNK?: number | null;
  pitchVSL?: number | null;
  pitchSHU?: number | null;
  pitchSWP?: number | null;
  pitchKN?: number | null;
  scoutingOrder?: string[];
  scoutPct?: number;
  isFullyRevealed?: boolean;
  skinTone?: string;
}

interface RecruitCardProps {
  recruit: RevealRecruit;
  primaryColor: string;
  secondaryColor: string;
  animationDelay?: number;
  disableAnimation?: boolean;
}

function getOvrGlow(ovr: number): string {
  if (ovr >= 600) return "0 0 18px #ff69b4, 0 0 36px #ff1493, 0 0 54px #ff69b490";
  if (ovr >= 500) return "0 0 16px #ef4444, 0 0 32px #dc2626, 0 0 48px #ef444460";
  if (ovr >= 400) return "0 0 14px #eab308, 0 0 28px #ca8a04, 0 0 42px #eab30860";
  if (ovr >= 300) return "0 0 12px #22c55e, 0 0 24px #16a34a, 0 0 36px #22c55e60";
  return "none";
}

function getOvrGlowBorder(ovr: number): string {
  if (ovr >= 600) return "#ff69b4";
  if (ovr >= 500) return "#ef4444";
  if (ovr >= 400) return "#eab308";
  if (ovr >= 300) return "#22c55e";
  return "#2d3d2d";
}


export function getTypeBadge(recruit: RevealRecruit): { label: string; className: string; pulse?: boolean } | null {
  const isGen = recruit.isGenerationalGem && recruit.gemBustRevealed;
  const isBustGen = recruit.isGenerationalBust && recruit.gemBustRevealed;
  if (isGen)    return { label: "GEM ✦",    className: "bg-amber-500 text-black",   pulse: true };
  if (isBustGen) return { label: "BUST ✦",  className: "bg-red-900 text-white",     pulse: true };
  if (recruit.isGem  && !isGen    && recruit.gemBustRevealed)
                return { label: "GEM",       className: "bg-emerald-600 text-white" };
  if (recruit.isBust && !isBustGen && recruit.gemBustRevealed)
                return { label: "BUST",      className: "bg-red-600 text-white" };
  if (recruit.recruitType === "STORYLINE")
                return { label: "STORYLINE", className: "bg-purple-600 text-white" };
  if (recruit.recruitType === "TRANSFER")
                return { label: recruit.fromTeamName ? `TRANSFER · ${recruit.fromTeamName.slice(0, 8)}` : "TRANSFER", className: "bg-purple-600 text-white" };
  if (recruit.recruitType === "JUCO")
                return { label: recruit.fromTeamName ? `JUCO · ${recruit.fromTeamName.slice(0, 9)}` : "JUCO", className: "bg-cyan-700 text-white" };
  return null;
}

function CardFront({ recruit, primaryColor }: { recruit: RevealRecruit; primaryColor: string }) {
  const glowBorder = getOvrGlowBorder(recruit.overall);
  const isGen = recruit.isGenerationalGem && recruit.gemBustRevealed;
  const isBustGen = recruit.isGenerationalBust && recruit.gemBustRevealed;
  const typeBadge = getTypeBadge(recruit);
  const foilTier = (isGen || recruit.starRating >= 5) ? "gold" : recruit.starRating === 4 ? "silver" : null;
  const ovrColor = glowBorder !== "#2d3d2d" ? glowBorder : "#555555";

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative" style={{ borderRadius: "8px" }}>

      {/* Foil shimmer overlay — covers entire card front */}
      {foilTier && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 20, borderRadius: "inherit" }}>
          <div className={foilTier === "gold" ? "card-shimmer-gold" : "card-shimmer-silver"} />
        </div>
      )}

      {/* ── Portrait zone (top ~60%) ── */}
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          flex: "0 0 136px",
          background: `linear-gradient(170deg, ${primaryColor}ee 0%, ${primaryColor}99 55%, #0d1a0d 100%)`,
        }}
      >
        {/* Top row: position badge left, blue chip right */}
        <div className="relative z-10 flex items-center justify-between px-2 pt-1.5">
          <span
            className="font-pixel text-[7px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
            data-testid={`card-position-${recruit.id}`}
          >
            {recruit.position}
          </span>
          {recruit.isBlueChip && !isGen && !isBustGen && (
            <Crown className="w-3.5 h-3.5 text-blue-400 drop-shadow" />
          )}
        </div>

        {/* Avatar centered */}
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <PlayerAvatar
            skinTone={recruit.skinTone ?? "medium"}
            playerId={recruit.id}
            size="lg"
            className="w-28 h-28"
            jerseyColor={primaryColor}
            isRecruit={false}
          />
        </div>

        {/* Type badge — bottom of portrait */}
        {typeBadge ? (
          <div className="relative z-10 flex justify-center pb-1.5">
            <span
              className={`font-pixel text-[7px] px-2 py-0.5 rounded ${typeBadge.className} ${typeBadge.pulse ? "animate-pulse" : ""}`}
              data-testid={`card-type-badge-${recruit.id}`}
            >
              {typeBadge.label}
            </span>
          </div>
        ) : (
          <div className="h-4" />
        )}
      </div>

      {/* ── Team-color accent strip ── */}
      <div style={{ height: "3px", background: primaryColor, flexShrink: 0 }} />

      {/* ── Info zone (cream baseball-card face) ── */}
      <div
        className="flex-1 px-2 pt-1.5 pb-1.5 flex flex-col justify-between"
        style={{ background: "#f5f0e6" }}
      >
        <div>
          <StarRating rating={recruit.starRating} size="sm" />
          <div className="font-pixel text-[7.5px] text-gray-900 leading-snug truncate mt-0.5">
            {recruit.firstName} {recruit.lastName}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-gray-500 leading-none">{recruit.homeState}</span>
            <span className="font-pixel text-[11px] font-bold leading-none" style={{ color: ovrColor }}>
              {recruit.overall}
            </span>
          </div>
          <div className="text-[7px] text-gray-400 mt-0.5">
            B:{recruit.batHand} T:{recruit.throwHand} · #{recruit.classRank}
          </div>
        </div>
      </div>
    </div>
  );
}

// Ability name → common attr key map (matches RevealCardBack in signing-day-reveal.tsx)
const ABILITY_TO_ATTR: Record<string, string> = {
  "Gambler":             "clutch",
  "Lefty Arm Killer":    "vsLHP",
  "Express Baserunning": "running",
  "Lightning Speed":     "stealing",
  "Strike Thrower":      "throwing",
  "Bazooka Arm":         "throwing",
  "The Almanac":         "catcherAbility",
  "Iron Man":            "grit",
  "Big Boy Speed":       "heater",
  "Indomitable Soul":    "poise",
  "Sangfroid":           "wRISP",
  "Lefty Killer":        "vsLefty",
  "Gas Tank":            "recovery",
  "Halting Quickness":   "agile",
  "Grit":                "grit",
};

export function CardBack({ recruit }: { recruit: RevealRecruit }) {
  const pitcher = isPitcher(recruit.position);
  const catcher = isCatcher(recruit.position);

  const recruitAbilities = recruit.abilities ?? [];
  // Build attr key → first matching ability name reverse map
  const attrToAbility: Record<string, string> = {};
  for (const name of recruitAbilities) {
    const k = ABILITY_TO_ATTR[name];
    if (k && !attrToAbility[k]) attrToAbility[k] = name;
  }

  // Primary numeric attributes
  const primaryAttrs: { label: string; val: number }[] = pitcher ? [
    { label: "VEL", val: recruit.velocity ?? 50 },
    { label: "CTL", val: recruit.control ?? 50 },
    { label: "STM", val: recruit.stamina ?? 50 },
    { label: "FLD", val: recruit.fielding ?? 50 },
  ] : [
    { label: "HIT", val: recruit.hitForAvg ?? 50 },
    { label: "PWR", val: recruit.power ?? 50 },
    { label: "SPD", val: recruit.speed ?? 50 },
    { label: "ARM", val: recruit.arm ?? 50 },
    { label: "FLD", val: recruit.fielding ?? 50 },
    { label: "ERR", val: recruit.errorResistance ?? 50 },
  ];

  // Common abilities with attr key for ability-name lookup
  type CA = { label: string; val: number; key: string };
  const commonAbils: CA[] = pitcher ? [
    { label: "RISP", val: recruit.wRISP ?? 50,    key: "wRISP" },
    { label: "LFT",  val: recruit.vsLefty ?? 50,  key: "vsLefty" },
    { label: "PSE",  val: recruit.poise ?? 50,    key: "poise" },
    { label: "GRIT", val: recruit.grit ?? 50,     key: "grit" },
    { label: "HTR",  val: recruit.heater ?? 50,   key: "heater" },
    { label: "AGL",  val: recruit.agile ?? 50,    key: "agile" },
    { label: "RCV",  val: recruit.recovery ?? 50, key: "recovery" },
  ] : [
    { label: "CLU",  val: recruit.clutch ?? 50,         key: "clutch" },
    { label: "LHP",  val: recruit.vsLHP ?? 50,          key: "vsLHP" },
    { label: "GRIT", val: recruit.grit ?? 50,           key: "grit" },
    { label: "STL",  val: recruit.stealing ?? 50,       key: "stealing" },
    { label: "RUN",  val: recruit.running ?? 50,        key: "running" },
    { label: "THW",  val: recruit.throwing ?? 50,       key: "throwing" },
    { label: "RCV",  val: recruit.recovery ?? 50,       key: "recovery" },
    ...(catcher ? [{ label: "CAT", val: recruit.catcherAbility ?? 50, key: "catcherAbility" }] : []),
  ];

  // Special abilities (gold/blue/red named abilities)
  const specialAbilities = recruitAbilities.filter(name => {
    const a = getAbilityByName(name);
    return a && (a.tier === "gold" || a.tier === "blue" || a.tier === "red");
  });

  const potGrade = recruit.potential ? getPotentialGrade(recruit.potential) : "?";
  const isGen     = !!(recruit.isGenerationalGem  && recruit.gemBustRevealed);
  const isGenBust = !!(recruit.isGenerationalBust && recruit.gemBustRevealed);

  // Unified type badge (mirrors RevealCardBack)
  let badgeLabel = "RAW";
  let badgeBg    = "#374151";
  let badgeColor = "#9ca3af";
  let badgePulse = false;
  if (isGen) {
    badgeLabel = "GEN GEM ✦"; badgeBg = "#92400e"; badgeColor = "#fbbf24"; badgePulse = true;
  } else if (isGenBust) {
    badgeLabel = "GEN BUST ✦"; badgeBg = "#7f1d1d"; badgeColor = "#fca5a5"; badgePulse = true;
  } else if (recruit.isGem && recruit.gemBustRevealed) {
    badgeLabel = "GEM"; badgeBg = "#065f46"; badgeColor = "#6ee7b7";
  } else if (recruit.isBust && recruit.gemBustRevealed) {
    badgeLabel = "BUST"; badgeBg = "#7f1d1d"; badgeColor = "#fca5a5";
  } else if (recruit.recruitType === "STORYLINE") {
    badgeLabel = "STORYLINE"; badgeBg = "#5b21b6"; badgeColor = "#ddd6fe";
  } else if (recruit.recruitType === "TRANSFER") {
    badgeLabel = recruit.fromTeamName ? `XFER·${recruit.fromTeamName.slice(0, 7)}` : "TRANSFER";
    badgeBg = "#5b21b6"; badgeColor = "#ddd6fe";
  } else if (recruit.recruitType === "JUCO") {
    badgeLabel = recruit.fromTeamName ? `JUCO·${recruit.fromTeamName.slice(0, 7)}` : "JUCO";
    badgeBg = "#0e7490"; badgeColor = "#a5f3fc";
  }

  const tierColors: Record<string, string> = {
    s: "#fda4d5", a: "#f472b6", b: "#ef4444", c: "#f97316",
    d: "#eab308", f: "#60a5fa", g: "#9ca3af",
  };
  const commonTierColors: Record<string, string> = {
    s: "#f59e0b", a: "#3b82f6", b: "#3b82f6", c: "#38bdf8",
    d: "#38bdf8", f: "#ef4444", g: "#ef4444",
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0d1f0d 0%, #162616 50%, #1a2e1a 100%)", borderRadius: "8px" }}
    >
      {/* Header: name / pos·ovr | stars + potential */}
      <div className="px-2 py-1 border-b border-[#2d3d2d] flex items-center justify-between gap-1 shrink-0">
        <div className="min-w-0">
          <div className="font-pixel text-[6.5px] text-[#C4A35A] truncate leading-tight">
            {recruit.firstName} {recruit.lastName}
          </div>
          <div className="text-[6px] text-gray-500 leading-tight">
            {pitcher
              ? `P · ${recruit.overall} OVR`
              : `${recruit.position} · ${recruit.overall} OVR`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <StarRating rating={recruit.starRating} size="sm" />
          <span className="font-pixel text-[6px] text-[#C4A35A] leading-none">POT {potGrade}</span>
        </div>
      </div>

      {/* Type badge + blue chip */}
      <div className="px-2 pt-1 pb-0.5 flex items-center gap-1 flex-wrap shrink-0">
        <span
          className={`font-pixel text-[5.5px] px-1 py-0.5 rounded leading-none ${badgePulse ? "animate-pulse" : ""}`}
          style={{ background: badgeBg, color: badgeColor }}
        >
          {badgeLabel}
        </span>
        {recruit.isBlueChip && !isGen && !isGenBust && (
          <span className="font-pixel text-[5.5px] text-blue-400 flex items-center gap-0.5 leading-none">
            <Crown className="w-2 h-2" />BLUE CHIP
          </span>
        )}
      </div>

      {/* Primary attributes: label | grade | numeric value */}
      <div className="px-2 pt-1 pb-0.5 border-t border-[#2d3d2d] shrink-0">
        <div className="text-[5px] text-gray-600 uppercase mb-0.5 leading-none tracking-wide">Attributes</div>
        {/* Hitter TRAJ text label — shown before numeric attrs */}
        {!pitcher && recruit.trajectory != null && (
          <div className="flex items-center gap-0.5 mb-0.5">
            <span className="text-[5.5px] text-gray-500 w-[16px] leading-none font-mono shrink-0">TRAJ</span>
            <TrajectoryIcon trajectory={recruit.trajectory as 1|2|3|4} iconSize="w-2 h-2" textSize="text-[7px]" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {primaryAttrs.map(({ label, val }) => {
            const { letter, tier } = getLetterGrade(val);
            return (
              <div key={label} className="flex items-center gap-0.5">
                <span className="text-[5.5px] text-gray-500 w-[16px] leading-none font-mono shrink-0">{label}</span>
                <span className="font-pixel text-[7px] font-bold w-[10px] leading-none shrink-0" style={{ color: tierColors[tier] }}>{letter}</span>
                <span className="text-[6px] text-gray-400 leading-none font-mono">{label === "VEL" ? `${velocityToKMH(val)} KMH` : val}</span>
              </div>
            );
          })}
        </div>
        {/* Pitcher pitch mix mini-section */}
        {pitcher && (() => {
          const pitchFields = [
            ["pitchFB","FB"],["pitch2S","2S"],["pitchSL","SL"],["pitchCB","CB"],
            ["pitchCH","CH"],["pitchCT","CT"],["pitchSNK","SNK"],["pitchVSL","VSL"],
            ["pitchSHU","SHU"],["pitchSWP","SWP"],["pitchCCH","CCH"],["pitchHSL","HSL"],
            ["pitchSFF","SFF"],["pitchFK","FK"],["pitchSCB","SCB"],["pitchPCB","PCB"],
            ["pitchKN","KN"],
          ] as const;
          const BINARY_PITCH_FIELDS = new Set(["pitchFB","pitch2S","pitchCH","pitchFK","pitchSFF","pitchKN"]);
          const cardFullyRevealed = recruit.isFullyRevealed ?? recruit.isBlueChip ?? false;
          const cardScoutPct = recruit.scoutPct ?? 0;
          const revealedPitchFields = computeRevealedPitchFields(recruit.scoutingOrder, cardScoutPct);
          const active = pitchFields.filter(([k]) => {
            const v = (recruit as any)[k];
            return v != null && v > 0 && (cardFullyRevealed || revealedPitchFields.has(k));
          });
          if (!active.length) return null;
          return (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {active.map(([k, label]) => (
                <span key={k} className="text-[5px] font-mono px-0.5 py-0.5 rounded bg-gray-800 text-gray-300 leading-none">
                  {BINARY_PITCH_FIELDS.has(k) ? label : `${label}·${(recruit as any)[k]}`}
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Common abilities: label | ability name (if matched) | grade */}
      <div className="px-2 pt-1 pb-0.5 border-t border-[#1a2e1a] shrink-0">
        <div className="text-[5px] text-gray-600 uppercase mb-0.5 leading-none tracking-wide">Common</div>
        <div className="flex flex-col gap-0.5">
          {commonAbils.map(({ label, val, key }) => {
            const { letter, tier } = getLetterGrade(val);
            const abilName = attrToAbility[key];
            return (
              <div key={label} className="flex items-center gap-0.5">
                <span className="text-[5.5px] text-gray-500 w-[17px] leading-none font-mono shrink-0">{label}</span>
                <span className="font-pixel text-[5px] text-amber-400/80 flex-1 truncate leading-none min-w-0">
                  {abilName ? (abilName.length > 14 ? abilName.slice(0, 14) + "…" : abilName) : ""}
                </span>
                <span className="font-pixel text-[7px] font-bold leading-none shrink-0 ml-0.5" style={{ color: commonTierColors[tier] }}>{letter}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Special abilities */}
      <div className="px-2 pt-1 pb-1 border-t border-[#1a2e1a] flex-1 min-h-0">
        <div className="text-[5px] text-gray-600 uppercase mb-0.5 leading-none tracking-wide flex items-center gap-0.5">
          <Zap className="w-2 h-2" />Special
        </div>
        {specialAbilities.length === 0 ? (
          <div className="text-[5.5px] text-gray-600 italic">None</div>
        ) : (
          <div className="flex flex-wrap gap-0.5">
            {specialAbilities.slice(0, 6).map(name => {
              const a = getAbilityByName(name);
              if (!a) return null;
              if (name === "Bad Ball Hitter") {
                return (
                  <span key={name} className="text-[5px] border rounded overflow-hidden font-pixel leading-tight inline-flex border-blue-500/40 px-0">
                    <span className="text-blue-400 px-0.5">Bad</span>
                    <span className="text-red-400 border-l border-red-500/40 px-0.5">Ball Hitter</span>
                  </span>
                );
              }
              const tierColor = a.tier === "gold"
                ? "text-amber-400 border-amber-500/40"
                : a.tier === "blue"
                ? "text-blue-400 border-blue-500/40"
                : "text-red-400 border-red-500/40";
              return (
                <span key={name} className={`text-[5px] border rounded px-0.5 font-pixel leading-tight ${tierColor}`}>
                  {name.length > 13 ? name.slice(0, 13) + "…" : name}
                </span>
              );
            })}
            {specialAbilities.length > 6 && (
              <span className="text-[5.5px] text-gray-500 leading-none">+{specialAbilities.length - 6} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function RecruitCard({ recruit, primaryColor, secondaryColor, animationDelay = 0, disableAnimation = false }: RecruitCardProps) {
  const [flipped, setFlipped] = useState(false);

  const isGenGem  = !!(recruit.isGenerationalGem  && recruit.gemBustRevealed);
  const isGenBust = !!(recruit.isGenerationalBust && recruit.gemBustRevealed);

  // Distinct visual treatment by card tier:
  // Gen Gem  → bright gold border + gold multi-layer glow (distinct from any OVR-based glow)
  // Gen Bust → deep crimson border + crimson glow
  // 5★       → cream outer frame + red glow (OVR-based)
  // 4★       → cream outer frame + gold glow (OVR-based)
  // ≤3★      → cream outer frame, dark border
  let cardBorder: string;
  let cardGlow: string;
  if (isGenGem) {
    cardBorder = "3px solid #FFD700";
    cardGlow   = "0 0 22px #FFD700, 0 0 44px #FFD70099, 0 0 70px #FFD70033, inset 0 0 8px #FFD70022";
  } else if (isGenBust) {
    cardBorder = "3px solid #7f1d1d";
    cardGlow   = "0 0 16px #7f1d1d, 0 0 32px #7f1d1d88";
  } else {
    const ovrGlow   = getOvrGlow(recruit.overall);
    const ovrBorder = getOvrGlowBorder(recruit.overall);
    // Cream outer frame for ≤3★, star-tier tint for 4★+
    const frameBorder = recruit.starRating >= 5
      ? `2px solid ${ovrBorder}`
      : recruit.starRating >= 4
        ? "2px solid #C4A35A"
        : "2px solid #d4c9a0";
    cardBorder = frameBorder;
    cardGlow   = ovrGlow;
  }

  return (
    // recruit-card-wrapper class is targeted by the prefers-reduced-motion CSS failsafe in index.css
    <div
      className="recruit-card-wrapper"
      style={{
        width: "160px",
        height: "220px",
        perspective: "800px",
        flexShrink: 0,
        animation: disableAnimation ? "none" : `cardSlideIn 0.5s ease-out ${animationDelay}s both`,
        cursor: "pointer",
      }}
      onClick={() => setFlipped(f => !f)}
      data-testid={`recruit-card-${recruit.id}`}
      title={flipped ? "Click to see front" : "Click to flip and see full profile"}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transition: disableAnimation ? "none" : "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          borderRadius: "8px",
          boxShadow: cardGlow,
          border: cardBorder,
        }}
      >
        {/* Front */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <CardFront recruit={recruit} primaryColor={primaryColor} />
        </div>
        {/* Back */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <CardBack recruit={recruit} />
        </div>
      </div>
    </div>
  );
}
