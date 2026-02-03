import { cn } from "@/lib/utils";

interface CoachAvatarProps {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  teamPrimaryColor?: string;
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

// Darken a hex color by a percentage
function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)));
  const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

export function CoachAvatar({
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  size = "md",
  className,
  teamPrimaryColor,
}: CoachAvatarProps) {
  const sizes = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32",
  };

  const skin = skinTones[skinTone] || skinTones.light;
  const skinShade = skinShadows[skinTone] || skinShadows.light;
  const hair = hairColors[hairColor] || hairColors.brown;
  
  // Use team primary color for shirt, fallback to blue
  const shirtColor = teamPrimaryColor || "#2563eb";
  const collarColor = darkenColor(shirtColor, 0.2);

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
        {/* Off-white background */}
        <rect x="0" y="0" width="32" height="32" fill="#f5f0e6" />
        
        {/* Neck / Polo shirt - larger face means shirt is lower */}
        <rect x="11" y="27" width="10" height="5" fill={skin} />
        <rect x="6" y="29" width="20" height="4" fill={shirtColor} />
        <rect x="13" y="29" width="6" height="4" fill={skin} />
        {/* Collar */}
        <rect x="11" y="29" width="2" height="2" fill={collarColor} />
        <rect x="19" y="29" width="2" height="2" fill={collarColor} />
        
        {/* Face - larger, fills more of the square */}
        <rect x="8" y="8" width="16" height="19" fill={skin} />
        <rect x="7" y="10" width="1" height="15" fill={skin} />
        <rect x="24" y="10" width="1" height="15" fill={skin} />
        <rect x="9" y="7" width="14" height="1" fill={skin} />
        <rect x="9" y="27" width="14" height="1" fill={skin} />
        
        {/* Face shadow/depth */}
        <rect x="7" y="14" width="1" height="6" fill={skinShade} />
        <rect x="8" y="24" width="16" height="3" fill={skinShade} />
        
        {/* Eyes - positioned for larger face */}
        <rect x="10" y="14" width="3" height="3" fill="#1a1a1a" />
        <rect x="19" y="14" width="3" height="3" fill="#1a1a1a" />
        <rect x="10" y="14" width="1" height="1" fill="#ffffff" />
        <rect x="19" y="14" width="1" height="1" fill="#ffffff" />
        
        {/* Eyebrows */}
        <rect x="10" y="12" width="4" height="1" fill={hair} />
        <rect x="18" y="12" width="4" height="1" fill={hair} />
        
        {/* Nose */}
        <rect x="14" y="17" width="4" height="3" fill={skinShade} />
        
        {/* Mouth/Smile */}
        <rect x="12" y="22" width="8" height="1" fill="#333333" />
        <rect x="11" y="21" width="1" height="1" fill={skinShade} />
        <rect x="20" y="21" width="1" height="1" fill={skinShade} />
        
        {/* Ears */}
        <rect x="5" y="13" width="3" height="5" fill={skin} />
        <rect x="24" y="13" width="3" height="5" fill={skin} />
        <rect x="6" y="14" width="1" height="3" fill={skinShade} />
        <rect x="25" y="14" width="1" height="3" fill={skinShade} />
        
        {/* Hair based on style - adjusted for larger face */}
        {hairStyle === "short" && (
          <>
            <rect x="8" y="5" width="16" height="5" fill={hair} />
            <rect x="7" y="6" width="1" height="6" fill={hair} />
            <rect x="24" y="6" width="1" height="6" fill={hair} />
            <rect x="9" y="4" width="14" height="1" fill={hair} />
          </>
        )}
        
        {hairStyle === "medium" && (
          <>
            <rect x="7" y="4" width="18" height="6" fill={hair} />
            <rect x="6" y="5" width="1" height="8" fill={hair} />
            <rect x="25" y="5" width="1" height="8" fill={hair} />
            <rect x="8" y="3" width="16" height="1" fill={hair} />
            {/* Side hair */}
            <rect x="5" y="11" width="2" height="10" fill={hair} />
            <rect x="25" y="11" width="2" height="10" fill={hair} />
          </>
        )}
        
        {hairStyle === "long" && (
          <>
            <rect x="6" y="3" width="20" height="7" fill={hair} />
            <rect x="5" y="4" width="1" height="10" fill={hair} />
            <rect x="26" y="4" width="1" height="10" fill={hair} />
            <rect x="7" y="2" width="18" height="1" fill={hair} />
            {/* Long side hair */}
            <rect x="4" y="9" width="3" height="18" fill={hair} />
            <rect x="25" y="9" width="3" height="18" fill={hair} />
          </>
        )}
        
        {/* Bald = no hair rendered */}
      </svg>
    </div>
  );
}
