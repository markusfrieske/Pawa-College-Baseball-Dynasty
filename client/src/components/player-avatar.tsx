import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  headwear?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  jerseyColor?: string;
  isRecruit?: boolean;
}

const skinTones: Record<string, string> = {
  light: "#fcd5b5",
  medium: "#d4a574",
  tan: "#c69c6d",
  olive: "#b8976a",
  dark: "#8d5524",
  deep: "#4a2c17",
};

const skinShadows: Record<string, string> = {
  light: "#e8c4a0",
  medium: "#b8906a",
  tan: "#a88558",
  olive: "#9a7d5a",
  dark: "#6d4018",
  deep: "#3a2210",
};

const hairColors: Record<string, string> = {
  black: "#1a1a1a",
  brown: "#4a3728",
  blonde: "#d4a534",
  red: "#8b3a3a",
  gray: "#808080",
  white: "#e0e0e0",
};

const hairShadows: Record<string, string> = {
  black: "#0a0a0a",
  brown: "#2a1f18",
  blonde: "#a47a20",
  red: "#5b2020",
  gray: "#505050",
  white: "#b0b0b0",
};

export function PlayerAvatar({
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  headwear = "none",
  size = "md",
  className,
  jerseyColor,
  isRecruit = false,
}: PlayerAvatarProps) {
  const sizes = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  const skin = skinTones[skinTone] || skinTones.light;
  const skinShade = skinShadows[skinTone] || skinShadows.light;
  const hair = hairColors[hairColor] || hairColors.brown;
  const hairShade = hairShadows[hairColor] || hairShadows.brown;
  
  const recruitGray = "#6b7280";
  const recruitGrayDark = "#4b5563";
  const defaultTeamColor = "#1a4a1a";
  const defaultTeamColorDark = "#0f2f0f";
  
  const jersey = isRecruit ? recruitGray : (jerseyColor || defaultTeamColor);
  const jerseyDark = isRecruit ? recruitGrayDark : (jerseyColor ? darkenColor(jerseyColor) : defaultTeamColorDark);
  
  const bgColor = "#f5f0e6";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded",
        sizes[size],
        className
      )}
      style={{ imageRendering: "pixelated" }}
    >
      <svg 
        viewBox="0 0 32 32" 
        className="w-full h-full"
        style={{ imageRendering: "pixelated" }}
        shapeRendering="crispEdges"
      >
        {/* Off-white/tan background */}
        <rect x="0" y="0" width="32" height="32" fill={bgColor} />
        
        {/* Jersey - connected across, looks like a proper jersey */}
        <rect x="6" y="25" width="20" height="7" fill={jersey} />
        <rect x="8" y="24" width="16" height="1" fill={jersey} />
        <rect x="10" y="23" width="12" height="1" fill={jersey} />
        {/* Jersey collar line */}
        <rect x="12" y="24" width="8" height="1" fill={jerseyDark} />
        
        {/* Neck */}
        <rect x="13" y="22" width="6" height="3" fill={skin} />
        
        {/* Face - larger, more prominent */}
        <rect x="9" y="8" width="14" height="14" fill={skin} />
        <rect x="8" y="10" width="1" height="10" fill={skin} />
        <rect x="23" y="10" width="1" height="10" fill={skin} />
        <rect x="10" y="7" width="12" height="1" fill={skin} />
        <rect x="10" y="22" width="12" height="1" fill={skin} />
        
        {/* Face shadow/depth - chin area */}
        <rect x="8" y="14" width="1" height="4" fill={skinShade} />
        <rect x="9" y="20" width="14" height="2" fill={skinShade} />
        
        {/* Eyes - positioned higher for larger face */}
        <rect x="11" y="13" width="3" height="3" fill="#1a1a1a" />
        <rect x="18" y="13" width="3" height="3" fill="#1a1a1a" />
        <rect x="11" y="13" width="1" height="1" fill="#ffffff" />
        <rect x="18" y="13" width="1" height="1" fill="#ffffff" />
        
        {/* Eyebrows */}
        <rect x="11" y="11" width="4" height="1" fill={hairShade} />
        <rect x="17" y="11" width="4" height="1" fill={hairShade} />
        
        {/* Nose */}
        <rect x="15" y="15" width="2" height="3" fill={skinShade} />
        
        {/* Mouth */}
        <rect x="13" y="19" width="6" height="1" fill="#444444" />
        
        {/* Ears */}
        <rect x="7" y="12" width="2" height="4" fill={skin} />
        <rect x="23" y="12" width="2" height="4" fill={skin} />
        
        {/* Hair based on style - always show hair, no hats */}
        {hairStyle === "short" && (
          <>
            <rect x="9" y="5" width="14" height="4" fill={hair} />
            <rect x="8" y="6" width="1" height="5" fill={hair} />
            <rect x="23" y="6" width="1" height="5" fill={hair} />
            <rect x="10" y="4" width="12" height="1" fill={hair} />
            <rect x="9" y="8" width="14" height="1" fill={hairShade} />
          </>
        )}
        
        {hairStyle === "medium" && (
          <>
            <rect x="8" y="4" width="16" height="5" fill={hair} />
            <rect x="7" y="5" width="1" height="7" fill={hair} />
            <rect x="24" y="5" width="1" height="7" fill={hair} />
            <rect x="10" y="3" width="12" height="1" fill={hair} />
            <rect x="8" y="8" width="16" height="1" fill={hairShade} />
          </>
        )}
        
        {hairStyle === "long" && (
          <>
            <rect x="7" y="3" width="18" height="6" fill={hair} />
            <rect x="6" y="4" width="1" height="10" fill={hair} />
            <rect x="25" y="4" width="1" height="10" fill={hair} />
            <rect x="6" y="14" width="2" height="10" fill={hair} />
            <rect x="24" y="14" width="2" height="10" fill={hair} />
            <rect x="9" y="2" width="14" height="1" fill={hair} />
          </>
        )}
        
        {hairStyle === "fade" && (
          <>
            <rect x="10" y="5" width="12" height="3" fill={hair} />
            <rect x="9" y="6" width="1" height="4" fill={hair} />
            <rect x="22" y="6" width="1" height="4" fill={hair} />
            <rect x="8" y="8" width="1" height="4" fill={hairShade} />
            <rect x="23" y="8" width="1" height="4" fill={hairShade} />
            <rect x="11" y="4" width="10" height="1" fill={hair} />
          </>
        )}
        
        {hairStyle === "buzz" && (
          <>
            <rect x="9" y="6" width="14" height="2" fill={hair} />
            <rect x="8" y="7" width="1" height="4" fill={hair} />
            <rect x="23" y="7" width="1" height="4" fill={hair} />
            <rect x="10" y="5" width="12" height="1" fill={hair} />
          </>
        )}
        
        {hairStyle === "bald" && (
          <>
            {/* Just show the top of head, no hair */}
            <rect x="10" y="6" width="12" height="2" fill={skin} />
            <rect x="9" y="7" width="1" height="2" fill={skinShade} />
            <rect x="22" y="7" width="1" height="2" fill={skinShade} />
          </>
        )}
        
        {/* Default to short if unknown style */}
        {!["short", "medium", "long", "fade", "buzz", "bald"].includes(hairStyle) && (
          <>
            <rect x="9" y="5" width="14" height="4" fill={hair} />
            <rect x="8" y="6" width="1" height="5" fill={hair} />
            <rect x="23" y="6" width="1" height="5" fill={hair} />
            <rect x="10" y="4" width="12" height="1" fill={hair} />
            <rect x="9" y="8" width="14" height="1" fill={hairShade} />
          </>
        )}
      </svg>
    </div>
  );
}

function darkenColor(hex: string): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
