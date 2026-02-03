interface PlayerPortraitProps {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
  eyeStyle?: string;
  eyebrowStyle?: string;
  mouthStyle?: string;
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

export function PlayerPortrait({ 
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  facialHair = "none",
  eyeStyle = "default",
  eyebrowStyle = "default",
  mouthStyle = "happy",
  className = ""
}: PlayerPortraitProps) {
  const skinColorHex = SKIN_TONE_COLORS[skinTone] || SKIN_TONE_COLORS.light;
  const hairColorHex = HAIR_COLOR_COLORS[hairColor] || HAIR_COLOR_COLORS.brown;

  const renderHair = () => {
    switch (hairStyle) {
      case "bald":
        return null;
      case "short":
        return (
          <>
            <ellipse cx="32" cy="18" rx="14" ry="8" fill={hairColorHex} />
            <path d="M18 20 Q18 14, 32 12 Q46 14, 46 20" fill={hairColorHex} />
          </>
        );
      case "medium":
        return (
          <>
            <ellipse cx="32" cy="16" rx="15" ry="10" fill={hairColorHex} />
            <path d="M17 22 Q17 12, 32 10 Q47 12, 47 22" fill={hairColorHex} />
            <ellipse cx="18" cy="28" rx="4" ry="6" fill={hairColorHex} />
            <ellipse cx="46" cy="28" rx="4" ry="6" fill={hairColorHex} />
          </>
        );
      case "long":
        return (
          <>
            <ellipse cx="32" cy="14" rx="16" ry="10" fill={hairColorHex} />
            <path d="M16 20 Q16 10, 32 8 Q48 10, 48 20" fill={hairColorHex} />
            <ellipse cx="16" cy="34" rx="5" ry="12" fill={hairColorHex} />
            <ellipse cx="48" cy="34" rx="5" ry="12" fill={hairColorHex} />
          </>
        );
      case "fade":
        return (
          <>
            <ellipse cx="32" cy="18" rx="13" ry="7" fill={hairColorHex} />
            <path d="M19 22 Q19 16, 32 14 Q45 16, 45 22" fill={hairColorHex} />
            <rect x="18" y="22" width="3" height="6" fill={hairColorHex} opacity="0.5" />
            <rect x="43" y="22" width="3" height="6" fill={hairColorHex} opacity="0.5" />
          </>
        );
      case "buzz":
        return (
          <>
            <ellipse cx="32" cy="20" rx="12" ry="5" fill={hairColorHex} opacity="0.7" />
            <path d="M20 22 Q20 18, 32 16 Q44 18, 44 22" fill={hairColorHex} opacity="0.7" />
          </>
        );
      default:
        return (
          <>
            <ellipse cx="32" cy="18" rx="14" ry="8" fill={hairColorHex} />
            <path d="M18 20 Q18 14, 32 12 Q46 14, 46 20" fill={hairColorHex} />
          </>
        );
    }
  };

  const renderFacialHair = () => {
    switch (facialHair) {
      case "stubble":
        return (
          <ellipse cx="32" cy="42" rx="8" ry="4" fill={hairColorHex} opacity="0.3" />
        );
      case "goatee":
        return (
          <>
            <ellipse cx="32" cy="44" rx="5" ry="4" fill={hairColorHex} />
            <path d="M29 40 L32 38 L35 40" stroke={hairColorHex} strokeWidth="2" fill="none" />
          </>
        );
      case "beard":
        return (
          <>
            <path d="M22 36 Q22 48, 32 50 Q42 48, 42 36" fill={hairColorHex} />
            <path d="M29 40 L32 38 L35 40" stroke={hairColorHex} strokeWidth="2" fill="none" />
          </>
        );
      case "mustache":
        return (
          <path d="M26 38 Q29 40, 32 38 Q35 40, 38 38" stroke={hairColorHex} strokeWidth="2" fill="none" />
        );
      default:
        return null;
    }
  };

  const renderEyes = () => {
    switch (eyeStyle) {
      case "wide":
        return (
          <>
            <ellipse cx="27" cy="30" rx="3" ry="3.5" fill="#1a1a1a" />
            <ellipse cx="37" cy="30" rx="3" ry="3.5" fill="#1a1a1a" />
            <circle cx="27.5" cy="29" r="1" fill="white" />
            <circle cx="37.5" cy="29" r="1" fill="white" />
          </>
        );
      case "narrow":
        return (
          <>
            <ellipse cx="27" cy="30" rx="2" ry="1.5" fill="#1a1a1a" />
            <ellipse cx="37" cy="30" rx="2" ry="1.5" fill="#1a1a1a" />
            <circle cx="27" cy="29.5" r="0.5" fill="white" />
            <circle cx="37" cy="29.5" r="0.5" fill="white" />
          </>
        );
      default:
        return (
          <>
            <ellipse cx="27" cy="30" rx="2" ry="2.5" fill="#1a1a1a" />
            <ellipse cx="37" cy="30" rx="2" ry="2.5" fill="#1a1a1a" />
            <circle cx="27.5" cy="29.5" r="0.8" fill="white" />
            <circle cx="37.5" cy="29.5" r="0.8" fill="white" />
          </>
        );
    }
  };

  const renderEyebrows = () => {
    switch (eyebrowStyle) {
      case "thick":
        return (
          <>
            <path d="M23 25 Q27 22, 31 25" stroke={hairColorHex} strokeWidth="2.5" fill="none" />
            <path d="M33 25 Q37 22, 41 25" stroke={hairColorHex} strokeWidth="2.5" fill="none" />
          </>
        );
      case "thin":
        return (
          <>
            <path d="M24 26 Q27 24.5, 30 26" stroke={hairColorHex} strokeWidth="1" fill="none" />
            <path d="M34 26 Q37 24.5, 40 26" stroke={hairColorHex} strokeWidth="1" fill="none" />
          </>
        );
      case "angry":
        return (
          <>
            <path d="M24 24 L30 27" stroke={hairColorHex} strokeWidth="1.5" fill="none" />
            <path d="M40 24 L34 27" stroke={hairColorHex} strokeWidth="1.5" fill="none" />
          </>
        );
      default:
        return (
          <>
            <path d="M24 26 Q27 24, 30 26" stroke={hairColorHex} strokeWidth="1.5" fill="none" />
            <path d="M34 26 Q37 24, 40 26" stroke={hairColorHex} strokeWidth="1.5" fill="none" />
          </>
        );
    }
  };

  const renderMouth = () => {
    switch (mouthStyle) {
      case "happy":
        return <path d="M27 40 Q32 44, 37 40" stroke="#8B4513" strokeWidth="1.5" fill="none" />;
      case "neutral":
        return <path d="M28 41 L36 41" stroke="#8B4513" strokeWidth="1.5" fill="none" />;
      case "serious":
        return <path d="M27 42 Q32 40, 37 42" stroke="#8B4513" strokeWidth="1.5" fill="none" />;
      case "open":
        return (
          <>
            <ellipse cx="32" cy="42" rx="4" ry="3" fill="#4a2020" />
            <path d="M28 41 Q32 38, 36 41" stroke="#8B4513" strokeWidth="1" fill="none" />
          </>
        );
      default:
        return <path d="M28 40 Q32 42, 36 40" stroke="#8B4513" strokeWidth="1" fill="none" />;
    }
  };

  return (
    <div className={`relative ${className}`} data-testid="player-portrait">
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <circle cx="32" cy="32" r="30" fill="#1a2b1a" stroke="#2d3d2d" strokeWidth="2" />
        
        <ellipse cx="17" cy="32" rx="3" ry="4" fill={skinColorHex} />
        <ellipse cx="47" cy="32" rx="3" ry="4" fill={skinColorHex} />
        
        <ellipse cx="32" cy="32" rx="14" ry="16" fill={skinColorHex} />
        
        {renderHair()}
        
        {renderEyes()}
        
        {renderEyebrows()}
        
        <path d="M32 30 L30 36 L32 37 L34 36 L32 30" fill={`${skinColorHex}DD`} />
        
        {renderMouth()}
        
        {renderFacialHair()}
      </svg>
    </div>
  );
}
