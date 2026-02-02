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
        
        {hairStyle !== "bald" && (
          <ellipse cx="50" cy="35" rx="25" ry="18" fill={hair} />
        )}
        
        <circle cx="40" cy="52" r="3" fill="#1a1a1a" />
        <circle cx="60" cy="52" r="3" fill="#1a1a1a" />
        
        <ellipse cx="50" cy="62" rx="4" ry="2" fill="#d4a574" />
        
        <path
          d="M 42 70 Q 50 75 58 70"
          stroke="#1a1a1a"
          strokeWidth="2"
          fill="none"
        />
        
        <rect x="30" y="80" width="40" height="20" fill="#2563eb" rx="3" />
      </svg>
    </div>
  );
}
