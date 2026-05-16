import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/star-rating";
import { LetterGrade, getLetterGrade } from "@/components/ui/letter-grade";
import { BatterFigure, PitcherFigure } from "@/components/pixel-player-figure";
import { isPitcher, isCatcher } from "@shared/positions";
import { getAbilityByName } from "@shared/abilities";
import { getPotentialGrade } from "@shared/potential";
import { Gem, Skull, Crown, Zap } from "lucide-react";

interface RevealRecruit {
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

function getRecruitTypeBadge(type: string) {
  if (type === "TRANSFER") return { label: "TRANSFER", className: "bg-purple-600 text-white text-[8px] px-1.5 py-0.5" };
  if (type === "JUCO") return { label: "JUCO", className: "bg-cyan-600 text-white text-[8px] px-1.5 py-0.5" };
  return null;
}

function CardFront({ recruit, primaryColor, secondaryColor }: { recruit: RevealRecruit; primaryColor: string; secondaryColor: string }) {
  const glow = getOvrGlow(recruit.overall);
  const glowBorder = getOvrGlowBorder(recruit.overall);
  const typeBadge = getRecruitTypeBadge(recruit.recruitType);
  const usePitcher = isPitcher(recruit.position) || isCatcher(recruit.position);

  const isGen = recruit.isGenerationalGem && recruit.gemBustRevealed;
  const isBustGen = recruit.isGenerationalBust && recruit.gemBustRevealed;

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        background: `linear-gradient(160deg, #0d1f0d 0%, #162616 50%, #1a2e1a 100%)`,
        borderRadius: "8px",
      }}
    >
      {/* Header band in team primary color */}
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{ background: primaryColor, minHeight: "28px" }}
      >
        <span className="font-pixel text-[7px] font-bold" style={{ color: secondaryColor === "#ffffff" || isLightColor(secondaryColor) ? "#1a1a1a" : "#ffffff" }}>
          {recruit.position}
        </span>
        <StarRating rating={recruit.starRating} size="sm" />
        {typeBadge && (
          <span className={`rounded font-pixel ${typeBadge.className}`}>{typeBadge.label}</span>
        )}
      </div>

      {/* Player figure area */}
      <div
        className="flex-1 flex items-center justify-center relative"
        style={{
          background: `radial-gradient(ellipse at center, ${primaryColor}22 0%, transparent 70%)`,
        }}
      >
        {usePitcher ? (
          <PitcherFigure
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            skinTone={recruit.skinTone ?? "medium"}
            size={96}
          />
        ) : (
          <BatterFigure
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            skinTone={recruit.skinTone ?? "medium"}
            size={96}
          />
        )}

        {/* Generational badges */}
        {isGen && (
          <div className="absolute top-1 right-1">
            <Gem className="w-4 h-4 text-amber-400 drop-shadow-lg" />
          </div>
        )}
        {isBustGen && (
          <div className="absolute top-1 right-1">
            <Skull className="w-4 h-4 text-red-400 drop-shadow-lg" />
          </div>
        )}
        {recruit.isBlueChip && !isGen && (
          <div className="absolute top-1 right-1">
            <Crown className="w-4 h-4 text-blue-400 drop-shadow-lg" />
          </div>
        )}
      </div>

      {/* Name / info footer */}
      <div className="px-2 pb-2 pt-1 space-y-0.5">
        <div className="font-pixel text-[8px] text-white leading-tight truncate">
          {recruit.firstName} {recruit.lastName}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-gray-400">{recruit.homeState}</span>
          <span
            className="font-pixel text-[10px] font-bold"
            style={{ color: glowBorder !== "#2d3d2d" ? glowBorder : "#C4A35A" }}
          >
            {recruit.overall}
          </span>
        </div>
        <div className="text-[8px] text-gray-500">
          {isPitcher(recruit.position) ? `${recruit.throwHand}HP` : `${recruit.batHand}/${recruit.throwHand}`}
          {" · "}{recruit.recruitYear}
        </div>
        <div className="text-[8px] text-gray-600">#{recruit.classRank} Natl</div>
      </div>
    </div>
  );
}

function CardBack({ recruit }: { recruit: RevealRecruit }) {
  const pitcher = isPitcher(recruit.position);
  const catcher = isCatcher(recruit.position);

  const hitterAttrs: { label: string; key: keyof RevealRecruit }[] = [
    { label: "HIT", key: "hitForAvg" },
    { label: "PWR", key: "power" },
    { label: "SPD", key: "speed" },
    { label: "FLD", key: "fielding" },
    { label: "ARM", key: "arm" },
    { label: "CLT", key: "clutch" },
  ];

  const pitcherAttrs: { label: string; key: keyof RevealRecruit }[] = [
    { label: "VEL", key: "velocity" },
    { label: "CTL", key: "control" },
    { label: "STM", key: "stamina" },
    { label: "STF", key: "stuff" },
    { label: "PSE", key: "poise" },
    { label: "RCP", key: "recovery" },
  ];

  const attrs = pitcher ? pitcherAttrs : hitterAttrs;
  const abilities: string[] = recruit.abilities ?? [];
  const specialAbilities = abilities.filter(name => {
    const a = getAbilityByName(name);
    return a && (a.tier === "gold" || a.tier === "blue" || a.tier === "red");
  });
  const potGrade = recruit.potential ? getPotentialGrade(recruit.potential) : "?";

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        background: `linear-gradient(160deg, #0d1f0d 0%, #162616 50%, #1a2e1a 100%)`,
        borderRadius: "8px",
      }}
    >
      {/* Back header */}
      <div className="px-2 py-1.5 border-b border-[#2d3d2d]">
        <div className="font-pixel text-[7px] text-[#C4A35A] truncate">
          {recruit.firstName} {recruit.lastName}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-gray-400">{recruit.position}</span>
          <span className="font-pixel text-[9px] text-white">{recruit.overall} OVR</span>
        </div>
      </div>

      {/* Attributes */}
      <div className="px-2 pt-1.5 pb-1 grid grid-cols-3 gap-x-1 gap-y-0.5">
        {attrs.map(({ label, key }) => {
          const val = (recruit[key] as number | null | undefined) ?? 50;
          const { letter, tier } = getLetterGrade(val);
          const tierColorMap: Record<string, string> = {
            s: "#fda4d5",
            a: "#f472b6",
            b: "#ef4444",
            c: "#f97316",
            d: "#eab308",
            f: "#60a5fa",
            g: "#9ca3af",
          };
          return (
            <div key={label} className="flex items-center gap-0.5">
              <span className="text-[7px] text-gray-500 w-5">{label}</span>
              <span
                className="font-pixel text-[9px] font-bold"
                style={{ color: tierColorMap[tier] ?? "#9ca3af" }}
              >
                {letter}
              </span>
            </div>
          );
        })}
      </div>

      {/* Potential */}
      <div className="px-2 py-1 border-t border-[#2d3d2d]">
        <div className="flex items-center justify-between">
          <span className="text-[7px] text-gray-500">Potential</span>
          <span className="font-pixel text-[9px] text-[#C4A35A]">{potGrade}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <StarRating rating={recruit.starRating} size="sm" />
          {recruit.isBlueChip && <span className="text-[7px] text-blue-400 font-pixel">BLUE CHIP</span>}
          {(recruit.isGenerationalGem && recruit.gemBustRevealed) && <span className="text-[7px] text-amber-400 font-pixel flex items-center gap-0.5"><Gem className="w-2.5 h-2.5" />GEM</span>}
          {(recruit.isGenerationalBust && recruit.gemBustRevealed) && <span className="text-[7px] text-red-400 font-pixel flex items-center gap-0.5"><Skull className="w-2.5 h-2.5" />BUST</span>}
        </div>
      </div>

      {/* Special abilities */}
      {specialAbilities.length > 0 && (
        <div className="px-2 pb-2 flex-1">
          <div className="text-[7px] text-gray-500 mb-0.5 flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" /> Abilities
          </div>
          <div className="flex flex-wrap gap-0.5">
            {specialAbilities.slice(0, 4).map(name => {
              const a = getAbilityByName(name);
              if (!a) return null;
              const tierColor = a.tier === "gold" ? "text-amber-400 border-amber-500/40" : a.tier === "blue" ? "text-blue-400 border-blue-500/40" : "text-red-400 border-red-500/40";
              return (
                <span
                  key={name}
                  className={`text-[6px] border rounded px-0.5 py-0 font-pixel leading-tight ${tierColor}`}
                >
                  {name}
                </span>
              );
            })}
            {specialAbilities.length > 4 && (
              <span className="text-[6px] text-gray-500">+{specialAbilities.length - 4}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RecruitCard({ recruit, primaryColor, secondaryColor, animationDelay = 0 }: RecruitCardProps) {
  const [flipped, setFlipped] = useState(false);
  const glow = getOvrGlow(recruit.overall);
  const glowBorder = getOvrGlowBorder(recruit.overall);

  return (
    <div
      className="recruit-card-wrapper"
      style={{
        width: "160px",
        height: "220px",
        perspective: "800px",
        flexShrink: 0,
        animation: `cardSlideIn 0.5s ease-out ${animationDelay}s both`,
        cursor: "pointer",
      }}
      onClick={() => setFlipped(f => !f)}
      data-testid={`recruit-card-${recruit.id}`}
      title={flipped ? "Click to see front" : "Click to see full profile"}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transition: "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
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

function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  if (hex.length < 6) return false;
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
