import { cn } from "@/lib/utils";

interface CoachAvatarProps {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
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

export function CoachAvatar({
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  size = "md",
  className,
}: CoachAvatarProps) {
  const sizes = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32",
  };

  const skin = skinTones[skinTone] || skinTones.light;
  const skinShade = skinShadows[skinTone] || skinShadows.light;
  const hair = hairColors[hairColor] || hairColors.brown;

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
        
        {/* Neck / Polo shirt */}
        <rect x="11" y="26" width="10" height="6" fill={skin} />
        <rect x="8" y="28" width="16" height="4" fill="#2563eb" />
        <rect x="14" y="28" width="4" height="4" fill={skin} />
        {/* Collar */}
        <rect x="12" y="28" width="2" height="2" fill="#1e4fc9" />
        <rect x="18" y="28" width="2" height="2" fill="#1e4fc9" />
        
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
        
        {/* Mouth/Smile */}
        <rect x="13" y="22" width="6" height="1" fill="#333333" />
        <rect x="12" y="22" width="1" height="1" fill={skinShade} />
        <rect x="19" y="22" width="1" height="1" fill={skinShade} />
        
        {/* Ears */}
        <rect x="8" y="16" width="2" height="3" fill={skin} />
        <rect x="22" y="16" width="2" height="3" fill={skin} />
        
        {/* Hair based on style */}
        {hairStyle === "short" && (
          <>
            <rect x="10" y="9" width="12" height="4" fill={hair} />
            <rect x="9" y="10" width="1" height="5" fill={hair} />
            <rect x="22" y="10" width="1" height="5" fill={hair} />
            <rect x="11" y="8" width="10" height="1" fill={hair} />
          </>
        )}
        
        {hairStyle === "medium" && (
          <>
            <rect x="9" y="8" width="14" height="5" fill={hair} />
            <rect x="8" y="9" width="1" height="7" fill={hair} />
            <rect x="23" y="9" width="1" height="7" fill={hair} />
            <rect x="10" y="7" width="12" height="1" fill={hair} />
            {/* Side hair */}
            <rect x="7" y="14" width="2" height="8" fill={hair} />
            <rect x="23" y="14" width="2" height="8" fill={hair} />
          </>
        )}
        
        {hairStyle === "long" && (
          <>
            <rect x="8" y="7" width="16" height="6" fill={hair} />
            <rect x="7" y="8" width="1" height="8" fill={hair} />
            <rect x="24" y="8" width="1" height="8" fill={hair} />
            <rect x="10" y="6" width="12" height="1" fill={hair} />
            {/* Long side hair */}
            <rect x="6" y="12" width="3" height="14" fill={hair} />
            <rect x="23" y="12" width="3" height="14" fill={hair} />
          </>
        )}
        
        {/* Bald = no hair rendered */}
      </svg>
    </div>
  );
}
