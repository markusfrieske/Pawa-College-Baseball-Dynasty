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

const hairColors: Record<string, string> = {
  black: "#1a1a1a",
  brown: "#4a3728",
  blonde: "#d4a534",
  red: "#8b3a3a",
  gray: "#808080",
  white: "#e0e0e0",
};

function HairStyle({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "short":
      return (
        <>
          <ellipse cx="50" cy="30" rx="24" ry="12" fill={color} />
          <path d="M 26 35 Q 26 28 32 25 L 50 22 L 68 25 Q 74 28 74 35 L 74 40 Q 50 38 26 40 Z" fill={color} />
        </>
      );
    case "medium":
      return (
        <>
          <ellipse cx="50" cy="28" rx="26" ry="14" fill={color} />
          <path d="M 24 35 Q 24 26 32 22 L 50 18 L 68 22 Q 76 26 76 35 L 76 45 Q 50 42 24 45 Z" fill={color} />
          <ellipse cx="28" cy="50" rx="6" ry="10" fill={color} />
          <ellipse cx="72" cy="50" rx="6" ry="10" fill={color} />
        </>
      );
    case "long":
      return (
        <>
          <ellipse cx="50" cy="26" rx="28" ry="16" fill={color} />
          <path d="M 22 35 Q 22 24 32 20 L 50 16 L 68 20 Q 78 24 78 35 L 78 50 Q 50 46 22 50 Z" fill={color} />
          <ellipse cx="25" cy="55" rx="8" ry="18" fill={color} />
          <ellipse cx="75" cy="55" rx="8" ry="18" fill={color} />
        </>
      );
    case "bald":
    default:
      return null;
  }
}

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
  const hair = hairColors[hairColor] || hairColors.brown;

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
        
        <HairStyle style={hairStyle} color={hair} />
        
        <circle cx="40" cy="55" r="3" fill="#1a1a1a" />
        <circle cx="60" cy="55" r="3" fill="#1a1a1a" />
        
        <ellipse cx="50" cy="65" rx="4" ry="2" fill="#d4a574" />
        
        <path
          d="M 42 72 Q 50 77 58 72"
          stroke="#1a1a1a"
          strokeWidth="2"
          fill="none"
        />
        
        <rect x="30" y="82" width="40" height="18" fill="#2563eb" rx="3" />
      </svg>
    </div>
  );
}
