interface PlayerPortraitProps {
  position: string;
  skinTone?: string | number;
  hairColor?: string;
  hairStyle?: string | number;
  className?: string;
}

const SKIN_TONE_COLORS: Record<string, string> = {
  light: "#F5D0B8",
  medium: "#D4A574",
  tan: "#C4956A",
  olive: "#B8956A",
  dark: "#8B6914",
  deep: "#4A3728",
};

const HAIR_COLOR_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  brown: "#4A3728",
  blonde: "#D4A574",
  red: "#8B4513",
  gray: "#888888",
};

const HAIR_STYLES = ["short", "medium", "long", "fade", "buzz"];

export function PlayerPortrait({ 
  position, 
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  className = ""
}: PlayerPortraitProps) {
  const skinColorHex = typeof skinTone === "number" 
    ? Object.values(SKIN_TONE_COLORS)[skinTone % Object.keys(SKIN_TONE_COLORS).length]
    : SKIN_TONE_COLORS[skinTone] || SKIN_TONE_COLORS.light;
  
  const hairColorHex = typeof hairColor === "string" && HAIR_COLOR_COLORS[hairColor]
    ? HAIR_COLOR_COLORS[hairColor]
    : HAIR_COLOR_COLORS.brown;
  
  const isCatcher = position === "C";

  return (
    <div className={`relative ${className}`} data-testid="player-portrait">
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <linearGradient id="capGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#0d1f33" />
          </linearGradient>
          <linearGradient id="jerseyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#152a47" />
          </linearGradient>
        </defs>
        
        {/* Background circle */}
        <circle cx="32" cy="32" r="30" fill="#1a2b1a" stroke="#2d3d2d" strokeWidth="2" />
        
        {/* Neck */}
        <rect x="26" y="44" width="12" height="8" fill={skinColorHex} />
        
        {/* Jersey/Shoulders */}
        <path 
          d="M16 52 L24 48 L40 48 L48 52 L48 64 L16 64 Z" 
          fill="url(#jerseyGradient)"
        />
        <path d="M26 48 L38 48 L38 54 L26 54 Z" fill="url(#jerseyGradient)" />
        
        {/* Jersey stripe */}
        <rect x="20" y="52" width="24" height="2" fill="#C4A35A" opacity="0.8" />
        
        {/* Face */}
        <ellipse cx="32" cy="32" rx="14" ry="16" fill={skinColorHex} />
        
        {/* Eyes */}
        <ellipse cx="27" cy="30" rx="2" ry="2.5" fill="#1a1a1a" />
        <ellipse cx="37" cy="30" rx="2" ry="2.5" fill="#1a1a1a" />
        <circle cx="27.5" cy="29.5" r="0.8" fill="white" />
        <circle cx="37.5" cy="29.5" r="0.8" fill="white" />
        
        {/* Eyebrows */}
        <path d="M24 26 Q27 24, 30 26" stroke={hairColorHex} strokeWidth="1.5" fill="none" />
        <path d="M34 26 Q37 24, 40 26" stroke={hairColorHex} strokeWidth="1.5" fill="none" />
        
        {/* Nose */}
        <path d="M32 30 L30 36 L32 37 L34 36 L32 30" fill={`${skinColorHex}DD`} />
        
        {/* Mouth */}
        <path d="M28 40 Q32 42, 36 40" stroke="#8B4513" strokeWidth="1" fill="none" />
        
        {/* Ears */}
        <ellipse cx="17" cy="32" rx="3" ry="4" fill={skinColorHex} />
        <ellipse cx="47" cy="32" rx="3" ry="4" fill={skinColorHex} />
        
        {/* Baseball cap */}
        <ellipse cx="32" cy="18" rx="16" ry="6" fill="url(#capGradient)" />
        <path d="M16 18 Q16 10, 32 8 Q48 10, 48 18" fill="url(#capGradient)" />
        {/* Cap brim */}
        <path 
          d="M14 20 Q20 28, 32 30 Q44 28, 50 20 Q46 22, 32 24 Q18 22, 14 20" 
          fill="#0d1f33" 
        />
        {/* Cap logo */}
        <circle cx="32" cy="14" r="3" fill="#C4A35A" />
        
        {/* Hair showing under cap */}
        <path 
          d="M18 22 Q18 24, 17 26 L17 30 Q17 32, 18 32" 
          fill={hairColorHex} 
        />
        <path 
          d="M46 22 Q46 24, 47 26 L47 30 Q47 32, 46 32" 
          fill={hairColorHex} 
        />
        
        {/* Catcher's mask for catchers */}
        {isCatcher && (
          <>
            <rect x="20" y="26" width="24" height="2" fill="#555" rx="1" />
            <rect x="20" y="32" width="24" height="2" fill="#555" rx="1" />
            <rect x="20" y="38" width="24" height="2" fill="#555" rx="1" />
            <rect x="22" y="26" width="2" height="14" fill="#555" rx="1" />
            <rect x="40" y="26" width="2" height="14" fill="#555" rx="1" />
          </>
        )}
      </svg>
    </div>
  );
}
