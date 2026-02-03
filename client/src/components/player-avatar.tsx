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

const hairColors: Record<string, string> = {
  black: "#1a1a1a",
  brown: "#4a3728",
  blonde: "#d4a534",
  red: "#8b3a3a",
  gray: "#808080",
  white: "#e0e0e0",
};

function PlayerHairStyle({ style, color, hasHeadwear }: { style: string; color: string; hasHeadwear: boolean }) {
  if (hasHeadwear && style !== "bald") {
    return (
      <>
        <ellipse cx="28" cy="52" rx="5" ry="8" fill={color} />
        <ellipse cx="72" cy="52" rx="5" ry="8" fill={color} />
      </>
    );
  }
  
  switch (style) {
    case "short":
      return (
        <>
          <ellipse cx="50" cy="30" rx="24" ry="12" fill={color} />
          <path d="M 26 35 Q 26 28 32 25 L 50 22 L 68 25 Q 74 28 74 35 L 74 40 Q 50 38 26 40 Z" fill={color} />
        </>
      );
    case "buzzcut":
      return (
        <>
          <ellipse cx="50" cy="32" rx="22" ry="10" fill={color} />
          <path d="M 28 35 Q 28 30 34 27 L 50 25 L 66 27 Q 72 30 72 35 L 72 38 Q 50 36 28 38 Z" fill={color} />
        </>
      );
    case "curly":
      return (
        <>
          <circle cx="35" cy="28" r="8" fill={color} />
          <circle cx="50" cy="25" r="9" fill={color} />
          <circle cx="65" cy="28" r="8" fill={color} />
          <circle cx="28" cy="38" r="6" fill={color} />
          <circle cx="72" cy="38" r="6" fill={color} />
          <ellipse cx="28" cy="50" rx="5" ry="8" fill={color} />
          <ellipse cx="72" cy="50" rx="5" ry="8" fill={color} />
        </>
      );
    case "mullet":
      return (
        <>
          <ellipse cx="50" cy="28" rx="26" ry="14" fill={color} />
          <path d="M 24 35 Q 24 26 32 22 L 50 18 L 68 22 Q 76 26 76 35 L 76 45 Q 50 42 24 45 Z" fill={color} />
          <ellipse cx="25" cy="60" rx="6" ry="14" fill={color} />
          <ellipse cx="75" cy="60" rx="6" ry="14" fill={color} />
          <path d="M 35 75 Q 35 85 40 90 L 50 95 L 60 90 Q 65 85 65 75 Z" fill={color} />
        </>
      );
    case "bald":
    default:
      return null;
  }
}

function Headwear({ type, teamColor = "#1a4a1a" }: { type: string; teamColor?: string }) {
  switch (type) {
    case "cap":
      return (
        <>
          <ellipse cx="50" cy="30" rx="28" ry="14" fill={teamColor} />
          <path d="M 22 32 Q 22 24 35 20 L 50 18 L 65 20 Q 78 24 78 32 L 78 38 Q 50 35 22 38 Z" fill={teamColor} />
          <path d="M 22 32 L 15 35 L 25 38 Q 22 35 22 32" fill={teamColor} />
        </>
      );
    case "helmet":
      return (
        <>
          <ellipse cx="50" cy="28" rx="30" ry="16" fill={teamColor} />
          <path d="M 20 32 Q 20 22 35 18 L 50 15 L 65 18 Q 80 22 80 32 L 80 50 Q 75 52 70 50 L 70 40 Q 70 35 65 32 L 35 32 Q 30 35 30 40 L 30 50 Q 25 52 20 50 Z" fill={teamColor} />
          <path d="M 70 40 L 72 55 L 68 55 L 66 42" fill="#888888" />
        </>
      );
    case "batting_helmet":
      return (
        <>
          <ellipse cx="50" cy="26" rx="32" ry="18" fill={teamColor} />
          <path d="M 18 32 Q 18 20 35 16 L 50 13 L 65 16 Q 82 20 82 32 L 82 52 Q 78 55 72 52 L 72 42 Q 72 36 66 32 L 34 32 Q 28 36 28 42 L 28 52 Q 22 55 18 52 Z" fill={teamColor} />
          <ellipse cx="25" cy="48" rx="10" ry="12" fill={teamColor} />
          <circle cx="70" cy="50" r="5" fill="#333333" opacity="0.3" />
        </>
      );
    case "catchers_mask":
      return (
        <>
          <ellipse cx="50" cy="28" rx="28" ry="14" fill={teamColor} />
          <path d="M 22 32 Q 22 24 35 20 L 50 18 L 65 20 Q 78 24 78 32 L 78 42 Q 50 38 22 42 Z" fill={teamColor} />
          <line x1="35" y1="50" x2="35" y2="75" stroke="#555" strokeWidth="2" />
          <line x1="50" y1="50" x2="50" y2="78" stroke="#555" strokeWidth="2" />
          <line x1="65" y1="50" x2="65" y2="75" stroke="#555" strokeWidth="2" />
          <line x1="28" y1="58" x2="72" y2="58" stroke="#555" strokeWidth="2" />
          <line x1="30" y1="68" x2="70" y2="68" stroke="#555" strokeWidth="2" />
        </>
      );
    default:
      return null;
  }
}

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
  const hair = hairColors[hairColor] || hairColors.brown;
  const hasHeadwear = headwear !== "none";

  return (
    <div
      className={cn(
        "relative rounded-full overflow-hidden bg-gradient-to-b from-muted to-accent",
        sizes[size],
        className
      )}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <circle cx="50" cy="55" r="28" fill={skin} />
        
        <PlayerHairStyle style={hairStyle} color={hair} hasHeadwear={hasHeadwear} />
        
        {hasHeadwear && <Headwear type={headwear} />}
        
        <circle cx="40" cy="55" r="3" fill="#1a1a1a" />
        <circle cx="60" cy="55" r="3" fill="#1a1a1a" />
        
        <ellipse cx="50" cy="65" rx="4" ry="2" fill="#d4a574" />
        
        <path
          d="M 42 72 Q 50 76 58 72"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          fill="none"
        />
        
        <rect x="32" y="82" width="36" height="18" fill="#ffffff" rx="2" />
        <line x1="50" y1="82" x2="50" y2="100" stroke="#cccccc" strokeWidth="1" />
      </svg>
    </div>
  );
}
