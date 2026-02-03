import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  headwear?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const skinTones: Record<string, string> = {
  light: "#fcd5b5",
  medium: "#d4a574",
  tan: "#c69c6d",
  dark: "#8d5524",
  deep: "#4a2c17",
};

const skinShadows: Record<string, string> = {
  light: "#e8c4a0",
  medium: "#b8906a",
  tan: "#a88558",
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
  headwear = "cap",
  size = "md",
  className,
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
  const hasHeadwear = headwear !== "none";
  const teamColor = "#1a4a1a";
  const teamColorDark = "#0f2f0f";

  return (
    <div
      className={cn(
        "relative overflow-hidden",
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
        {/* Background */}
        <rect x="0" y="0" width="32" height="32" fill="#3366cc" />
        
        {/* Neck / Jersey */}
        <rect x="11" y="26" width="10" height="6" fill={skin} />
        <rect x="8" y="28" width="16" height="4" fill="#008080" />
        <rect x="14" y="28" width="4" height="4" fill={skin} />
        
        {/* Face - main shape (pixelated oval) */}
        <rect x="10" y="12" width="12" height="14" fill={skin} />
        <rect x="9" y="14" width="1" height="10" fill={skin} />
        <rect x="22" y="14" width="1" height="10" fill={skin} />
        <rect x="11" y="11" width="10" height="1" fill={skin} />
        <rect x="11" y="26" width="10" height="1" fill={skin} />
        
        {/* Face shadow/depth */}
        <rect x="9" y="18" width="1" height="4" fill={skinShade} />
        <rect x="10" y="24" width="12" height="2" fill={skinShade} />
        
        {/* Eyes */}
        <rect x="12" y="17" width="2" height="2" fill="#1a1a1a" />
        <rect x="18" y="17" width="2" height="2" fill="#1a1a1a" />
        <rect x="12" y="17" width="1" height="1" fill="#ffffff" />
        <rect x="18" y="17" width="1" height="1" fill="#ffffff" />
        
        {/* Nose */}
        <rect x="15" y="19" width="2" height="2" fill={skinShade} />
        
        {/* Mouth */}
        <rect x="14" y="22" width="4" height="1" fill="#333333" />
        
        {/* Ears */}
        <rect x="8" y="16" width="2" height="3" fill={skin} />
        <rect x="22" y="16" width="2" height="3" fill={skin} />
        
        {/* Hair based on style */}
        {hairStyle === "short" && !hasHeadwear && (
          <>
            <rect x="10" y="9" width="12" height="4" fill={hair} />
            <rect x="9" y="10" width="1" height="5" fill={hair} />
            <rect x="22" y="10" width="1" height="5" fill={hair} />
            <rect x="11" y="8" width="10" height="1" fill={hair} />
          </>
        )}
        
        {hairStyle === "buzzcut" && !hasHeadwear && (
          <>
            <rect x="10" y="10" width="12" height="3" fill={hair} />
            <rect x="9" y="11" width="1" height="4" fill={hair} />
            <rect x="22" y="11" width="1" height="4" fill={hair} />
          </>
        )}
        
        {hairStyle === "curly" && !hasHeadwear && (
          <>
            <rect x="9" y="7" width="14" height="6" fill={hair} />
            <rect x="8" y="8" width="2" height="10" fill={hair} />
            <rect x="22" y="8" width="2" height="10" fill={hair} />
            <rect x="10" y="6" width="3" height="2" fill={hair} />
            <rect x="14" y="5" width="4" height="2" fill={hair} />
            <rect x="19" y="6" width="3" height="2" fill={hair} />
          </>
        )}
        
        {hairStyle === "mullet" && !hasHeadwear && (
          <>
            <rect x="10" y="8" width="12" height="4" fill={hair} />
            <rect x="9" y="9" width="1" height="6" fill={hair} />
            <rect x="22" y="9" width="1" height="6" fill={hair} />
            <rect x="8" y="14" width="2" height="10" fill={hair} />
            <rect x="22" y="14" width="2" height="10" fill={hair} />
            <rect x="10" y="24" width="12" height="4" fill={hair} />
          </>
        )}
        
        {/* Side hair visible under cap */}
        {hasHeadwear && hairStyle !== "bald" && (
          <>
            <rect x="8" y="14" width="2" height="6" fill={hair} />
            <rect x="22" y="14" width="2" height="6" fill={hair} />
          </>
        )}
        
        {/* Headwear */}
        {headwear === "cap" && (
          <>
            <rect x="8" y="7" width="16" height="6" fill={teamColor} />
            <rect x="7" y="8" width="1" height="4" fill={teamColor} />
            <rect x="24" y="8" width="1" height="4" fill={teamColor} />
            <rect x="10" y="6" width="12" height="1" fill={teamColor} />
            {/* Cap bill */}
            <rect x="6" y="12" width="6" height="2" fill={teamColor} />
            <rect x="5" y="13" width="2" height="1" fill={teamColorDark} />
            {/* Cap shadow */}
            <rect x="8" y="12" width="16" height="1" fill={teamColorDark} />
          </>
        )}
        
        {headwear === "helmet" && (
          <>
            <rect x="7" y="6" width="18" height="8" fill={teamColor} />
            <rect x="6" y="7" width="1" height="6" fill={teamColor} />
            <rect x="25" y="7" width="1" height="6" fill={teamColor} />
            <rect x="9" y="5" width="14" height="1" fill={teamColor} />
            {/* Earflap */}
            <rect x="6" y="12" width="2" height="6" fill={teamColor} />
            <rect x="24" y="12" width="2" height="6" fill={teamColor} />
            {/* Face guard */}
            <rect x="23" y="16" width="2" height="6" fill="#666666" />
            {/* Shadow */}
            <rect x="7" y="13" width="18" height="1" fill={teamColorDark} />
          </>
        )}
        
        {headwear === "batting_helmet" && (
          <>
            <rect x="7" y="5" width="18" height="9" fill={teamColor} />
            <rect x="6" y="6" width="1" height="7" fill={teamColor} />
            <rect x="25" y="6" width="1" height="7" fill={teamColor} />
            <rect x="9" y="4" width="14" height="1" fill={teamColor} />
            {/* Large earflap */}
            <rect x="5" y="12" width="3" height="8" fill={teamColor} />
            <rect x="24" y="12" width="3" height="4" fill={teamColor} />
            {/* Shadow */}
            <rect x="7" y="13" width="18" height="1" fill={teamColorDark} />
          </>
        )}
        
        {headwear === "catchers_mask" && (
          <>
            <rect x="8" y="7" width="16" height="6" fill={teamColor} />
            <rect x="7" y="8" width="1" height="4" fill={teamColor} />
            <rect x="24" y="8" width="1" height="4" fill={teamColor} />
            <rect x="10" y="6" width="12" height="1" fill={teamColor} />
            {/* Mask bars */}
            <rect x="11" y="16" width="1" height="8" fill="#555555" />
            <rect x="16" y="16" width="1" height="9" fill="#555555" />
            <rect x="20" y="16" width="1" height="8" fill="#555555" />
            <rect x="10" y="18" width="12" height="1" fill="#555555" />
            <rect x="10" y="22" width="12" height="1" fill="#555555" />
          </>
        )}
      </svg>
    </div>
  );
}
