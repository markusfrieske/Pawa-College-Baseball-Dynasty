import { useState } from "react";
import { StarRating } from "@/components/ui/star-rating";
import { getLetterGrade } from "@/components/ui/letter-grade";
import { PlayerAvatar } from "@/components/player-avatar";
import { isPitcher, isCatcher } from "@shared/positions";
import { getAbilityByName } from "@shared/abilities";
import { getPotentialGrade } from "@shared/potential";
import { Gem, Skull, Crown, Zap } from "lucide-react";

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

function getTierColor(tier: string): string {
  const map: Record<string, string> = {
    s: "#fda4d5",
    a: "#f472b6",
    b: "#ef4444",
    c: "#f97316",
    d: "#eab308",
    f: "#60a5fa",
    g: "#9ca3af",
  };
  return map[tier] ?? "#9ca3af";
}

function getCommonAbilityTierColor(tier: string): string {
  const map: Record<string, string> = {
    s: "#f59e0b",
    a: "#3b82f6",
    b: "#3b82f6",
    c: "#38bdf8",
    d: "#38bdf8",
    f: "#ef4444",
    g: "#ef4444",
  };
  return map[tier] ?? "#9ca3af";
}

function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  if (hex.length < 6) return false;
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function getTypeBadge(recruit: RevealRecruit): { label: string; className: string; pulse?: boolean } | null {
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
                return { label: recruit.fromTeamName ? `XFER · ${recruit.fromTeamName.slice(0, 9)}` : "TRANSFER", className: "bg-purple-600 text-white" };
  if (recruit.recruitType === "JUCO")
                return { label: recruit.fromTeamName ? `JUCO · ${recruit.fromTeamName.slice(0, 9)}` : "JUCO", className: "bg-cyan-700 text-white" };
  return null;
}

function CardFront({ recruit, primaryColor }: { recruit: RevealRecruit; primaryColor: string; secondaryColor: string }) {
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

function AttrPill({ label, value, isCommon = false }: { label: string; value: number; isCommon?: boolean }) {
  const { letter, tier } = getLetterGrade(value);
  const color = isCommon ? getCommonAbilityTierColor(tier) : getTierColor(tier);
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-[6px] text-gray-500 w-[18px] leading-none">{label}</span>
      <span className="font-pixel text-[8px] font-bold leading-none" style={{ color }}>{letter}</span>
    </div>
  );
}

function CardBack({ recruit }: { recruit: RevealRecruit }) {
  const pitcher = isPitcher(recruit.position);
  const catcher = isCatcher(recruit.position);

  // Primary numeric attributes
  const primaryAttrs: { label: string; val: number }[] = pitcher ? [
    { label: "VEL", val: recruit.velocity ?? 50 },
    { label: "CTL", val: recruit.control ?? 50 },
    { label: "STM", val: recruit.stamina ?? 50 },
    { label: "STF", val: recruit.stuff ?? 50 },
    { label: "ARM", val: recruit.arm ?? 50 },
    { label: "ERR", val: recruit.errorResistance ?? 50 },
  ] : [
    { label: "HIT", val: recruit.hitForAvg ?? 50 },
    { label: "PWR", val: recruit.power ?? 50 },
    { label: "SPD", val: recruit.speed ?? 50 },
    { label: "FLD", val: recruit.fielding ?? 50 },
    { label: "ARM", val: recruit.arm ?? 50 },
    { label: "ERR", val: recruit.errorResistance ?? 50 },
  ];

  // Common abilities (secondary skills displayed with common ability coloring)
  const commonAbils: { label: string; val: number }[] = pitcher ? [
    { label: "RISP", val: recruit.wRISP ?? 50 },
    { label: "LFT", val: recruit.vsLefty ?? 50 },
    { label: "PSE", val: recruit.poise ?? 50 },
    { label: "GRIT", val: recruit.grit ?? 50 },
    { label: "HTR", val: recruit.heater ?? 50 },
    { label: "AGL", val: recruit.agile ?? 50 },
    { label: "RCV", val: recruit.recovery ?? 50 },
  ] : [
    { label: "CLT", val: recruit.clutch ?? 50 },
    { label: "LHP", val: recruit.vsLHP ?? 50 },
    { label: "GRIT", val: recruit.grit ?? 50 },
    { label: "STL", val: recruit.stealing ?? 50 },
    { label: "RUN", val: recruit.running ?? 50 },
    { label: "THW", val: recruit.throwing ?? 50 },
    { label: "RCV", val: recruit.recovery ?? 50 },
    ...(catcher ? [{ label: "CAT", val: recruit.catcherAbility ?? 50 }] : []),
  ];

  // Special abilities (gold/blue/red named abilities)
  const abilities: string[] = recruit.abilities ?? [];
  const specialAbilities = abilities.filter(name => {
    const a = getAbilityByName(name);
    return a && (a.tier === "gold" || a.tier === "blue" || a.tier === "red");
  });

  const potGrade = recruit.potential ? getPotentialGrade(recruit.potential) : "?";
  const isGen = recruit.isGenerationalGem && recruit.gemBustRevealed;
  const isBustGen = recruit.isGenerationalBust && recruit.gemBustRevealed;

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0d1f0d 0%, #162616 50%, #1a2e1a 100%)", borderRadius: "8px" }}
    >
      {/* Back header */}
      <div className="px-2 py-1 border-b border-[#2d3d2d] flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="font-pixel text-[7px] text-[#C4A35A] truncate leading-tight">
            {recruit.firstName} {recruit.lastName}
          </div>
          <div className="text-[7px] text-gray-500">{recruit.position} · {recruit.overall} OVR</div>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <StarRating rating={recruit.starRating} size="sm" />
          <span className="font-pixel text-[7px] text-[#C4A35A]">POT: {potGrade}</span>
        </div>
      </div>

      {/* Gem/bust/bluechip badges */}
      {(isGen || isBustGen || (recruit.isGem && recruit.gemBustRevealed) || (recruit.isBust && recruit.gemBustRevealed) || recruit.isBlueChip) && (
        <div className="px-2 pt-1 flex gap-1 flex-wrap">
          {isGen && <span className="text-[6px] text-amber-400 font-pixel flex items-center gap-0.5"><Gem className="w-2.5 h-2.5" />GEN GEM</span>}
          {isBustGen && <span className="text-[6px] text-red-400 font-pixel flex items-center gap-0.5"><Skull className="w-2.5 h-2.5" />GEN BUST</span>}
          {recruit.isGem && !isGen && recruit.gemBustRevealed && <span className="text-[6px] text-emerald-400 font-pixel flex items-center gap-0.5"><Gem className="w-2.5 h-2.5" />GEM</span>}
          {recruit.isBust && !isBustGen && recruit.gemBustRevealed && <span className="text-[6px] text-orange-400 font-pixel flex items-center gap-0.5"><Skull className="w-2.5 h-2.5" />BUST</span>}
          {recruit.isBlueChip && !isGen && !isBustGen && <span className="text-[6px] text-blue-400 font-pixel flex items-center gap-0.5"><Crown className="w-2.5 h-2.5" />BLUE CHIP</span>}
        </div>
      )}

      {/* Primary numeric attributes */}
      <div className="px-2 pt-1.5 pb-0.5">
        <div className="text-[6px] text-gray-600 uppercase mb-0.5">Attributes</div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
          {primaryAttrs.map(({ label, val }) => (
            <AttrPill key={label} label={label} value={val} isCommon={false} />
          ))}
        </div>
      </div>

      {/* Common abilities */}
      <div className="px-2 py-0.5 border-t border-[#1a2e1a]">
        <div className="text-[6px] text-gray-600 uppercase mb-0.5">Common</div>
        <div className="grid grid-cols-4 gap-x-1 gap-y-0.5">
          {commonAbils.map(({ label, val }) => (
            <AttrPill key={label} label={label} value={val} isCommon={true} />
          ))}
        </div>
      </div>

      {/* Special abilities */}
      <div className="px-2 py-0.5 border-t border-[#1a2e1a] flex-1">
        <div className="text-[6px] text-gray-600 uppercase mb-0.5 flex items-center gap-0.5">
          <Zap className="w-2 h-2" />Special
        </div>
        {specialAbilities.length === 0 ? (
          <div className="text-[6px] text-gray-600 italic">None</div>
        ) : (
          <div className="flex flex-wrap gap-0.5">
            {specialAbilities.slice(0, 5).map(name => {
              const a = getAbilityByName(name);
              if (!a) return null;
              const tierColor = a.tier === "gold"
                ? "text-amber-400 border-amber-500/40"
                : a.tier === "blue"
                ? "text-blue-400 border-blue-500/40"
                : "text-red-400 border-red-500/40";
              return (
                <span key={name} className={`text-[5.5px] border rounded px-0.5 font-pixel leading-tight ${tierColor}`}>
                  {name.length > 12 ? name.slice(0, 12) + "…" : name}
                </span>
              );
            })}
            {specialAbilities.length > 5 && (
              <span className="text-[6px] text-gray-500">+{specialAbilities.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function RecruitCard({ recruit, primaryColor, secondaryColor, animationDelay = 0, disableAnimation = false }: RecruitCardProps) {
  const [flipped, setFlipped] = useState(false);
  const glow = getOvrGlow(recruit.overall);
  const glowBorder = getOvrGlowBorder(recruit.overall);

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
          boxShadow: glow,
          border: `2px solid ${glowBorder}`,
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
          <CardFront recruit={recruit} primaryColor={primaryColor} secondaryColor={secondaryColor} />
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
