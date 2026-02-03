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
  light: "#fcd5b5",
  medium: "#d4a574",
  tan: "#c69c6d",
  olive: "#b8956a",
  dark: "#8d5524",
  deep: "#4a2c17",
};

const SKIN_SHADOW_COLORS: Record<string, string> = {
  light: "#e8c4a0",
  medium: "#b8906a",
  tan: "#a88558",
  olive: "#a08050",
  dark: "#6d4018",
  deep: "#3a2210",
};

const HAIR_COLOR_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  brown: "#4a3728",
  blonde: "#d4a534",
  red: "#8b3a3a",
  gray: "#808080",
  white: "#e0e0e0",
};

export function PlayerPortrait({ 
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  facialHair = "none",
  className = ""
}: PlayerPortraitProps) {
  const skin = SKIN_TONE_COLORS[skinTone] || SKIN_TONE_COLORS.light;
  const skinShade = SKIN_SHADOW_COLORS[skinTone] || SKIN_SHADOW_COLORS.light;
  const hair = HAIR_COLOR_COLORS[hairColor] || HAIR_COLOR_COLORS.brown;

  return (
    <div 
      className={`relative ${className}`} 
      data-testid="player-portrait"
      style={{ imageRendering: "pixelated" }}
    >
      <svg 
        viewBox="0 0 32 32" 
        className="w-full h-full"
        style={{ imageRendering: "pixelated" }}
        shapeRendering="crispEdges"
      >
        {/* Background circle */}
        <rect x="0" y="0" width="32" height="32" rx="16" fill="#1a2b1a" />
        <rect x="1" y="1" width="30" height="30" rx="15" fill="#243524" />
        
        {/* Neck */}
        <rect x="13" y="24" width="6" height="4" fill={skin} />
        
        {/* Face - pixelated oval */}
        <rect x="10" y="10" width="12" height="14" fill={skin} />
        <rect x="9" y="12" width="1" height="10" fill={skin} />
        <rect x="22" y="12" width="1" height="10" fill={skin} />
        <rect x="11" y="9" width="10" height="1" fill={skin} />
        <rect x="11" y="24" width="10" height="1" fill={skin} />
        
        {/* Face shadow */}
        <rect x="9" y="16" width="1" height="4" fill={skinShade} />
        <rect x="10" y="22" width="12" height="2" fill={skinShade} />
        
        {/* Ears */}
        <rect x="8" y="14" width="2" height="4" fill={skin} />
        <rect x="22" y="14" width="2" height="4" fill={skin} />
        
        {/* Eyes */}
        <rect x="12" y="14" width="2" height="3" fill="#1a1a1a" />
        <rect x="18" y="14" width="2" height="3" fill="#1a1a1a" />
        <rect x="12" y="14" width="1" height="1" fill="#ffffff" />
        <rect x="18" y="14" width="1" height="1" fill="#ffffff" />
        
        {/* Nose */}
        <rect x="15" y="17" width="2" height="2" fill={skinShade} />
        
        {/* Mouth */}
        <rect x="14" y="20" width="4" height="1" fill="#333333" />
        
        {/* Hair styles */}
        {hairStyle === "short" && (
          <>
            <rect x="10" y="7" width="12" height="4" fill={hair} />
            <rect x="9" y="8" width="1" height="5" fill={hair} />
            <rect x="22" y="8" width="1" height="5" fill={hair} />
            <rect x="11" y="6" width="10" height="1" fill={hair} />
          </>
        )}
        
        {hairStyle === "medium" && (
          <>
            <rect x="9" y="6" width="14" height="5" fill={hair} />
            <rect x="8" y="7" width="1" height="7" fill={hair} />
            <rect x="23" y="7" width="1" height="7" fill={hair} />
            <rect x="10" y="5" width="12" height="1" fill={hair} />
            <rect x="7" y="12" width="2" height="8" fill={hair} />
            <rect x="23" y="12" width="2" height="8" fill={hair} />
          </>
        )}
        
        {hairStyle === "long" && (
          <>
            <rect x="8" y="5" width="16" height="6" fill={hair} />
            <rect x="7" y="6" width="1" height="8" fill={hair} />
            <rect x="24" y="6" width="1" height="8" fill={hair} />
            <rect x="10" y="4" width="12" height="1" fill={hair} />
            <rect x="6" y="10" width="3" height="14" fill={hair} />
            <rect x="23" y="10" width="3" height="14" fill={hair} />
          </>
        )}
        
        {hairStyle === "fade" && (
          <>
            <rect x="10" y="8" width="12" height="3" fill={hair} />
            <rect x="9" y="9" width="1" height="4" fill={hair} opacity="0.6" />
            <rect x="22" y="9" width="1" height="4" fill={hair} opacity="0.6" />
            <rect x="11" y="7" width="10" height="1" fill={hair} />
          </>
        )}
        
        {hairStyle === "buzz" && (
          <>
            <rect x="10" y="8" width="12" height="3" fill={hair} opacity="0.7" />
            <rect x="9" y="9" width="1" height="3" fill={hair} opacity="0.5" />
            <rect x="22" y="9" width="1" height="3" fill={hair} opacity="0.5" />
          </>
        )}
        
        {/* Facial hair */}
        {facialHair === "stubble" && (
          <rect x="13" y="19" width="6" height="3" fill={hair} opacity="0.3" />
        )}
        
        {facialHair === "goatee" && (
          <>
            <rect x="14" y="20" width="4" height="3" fill={hair} />
            <rect x="15" y="19" width="2" height="1" fill={hair} />
          </>
        )}
        
        {facialHair === "beard" && (
          <>
            <rect x="11" y="18" width="10" height="5" fill={hair} />
            <rect x="10" y="16" width="1" height="4" fill={hair} />
            <rect x="21" y="16" width="1" height="4" fill={hair} />
          </>
        )}
        
        {facialHair === "mustache" && (
          <rect x="13" y="18" width="6" height="2" fill={hair} />
        )}
      </svg>
    </div>
  );
}
