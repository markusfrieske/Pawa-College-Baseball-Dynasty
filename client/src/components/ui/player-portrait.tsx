interface PlayerPortraitProps {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
  eyeStyle?: string;
  eyebrowStyle?: string;
  mouthStyle?: string;
  eyeBlack?: boolean;
  playerId?: string;
  className?: string;
  jerseyColor?: string;
  isRecruit?: boolean;
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

const HAIR_SHADOW_COLORS: Record<string, string> = {
  black: "#0a0a0a",
  brown: "#2a1f18",
  blonde: "#a47a20",
  red: "#5b2020",
  gray: "#505050",
  white: "#b0b0b0",
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

function darkenColor(hex: string): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function PlayerPortrait({ 
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  facialHair = "none",
  eyeStyle,
  eyebrowStyle,
  mouthStyle,
  eyeBlack,
  playerId,
  className = "",
  jerseyColor,
  isRecruit = false,
}: PlayerPortraitProps) {
  const skin = SKIN_TONE_COLORS[skinTone] || SKIN_TONE_COLORS.light;
  const skinShade = SKIN_SHADOW_COLORS[skinTone] || SKIN_SHADOW_COLORS.light;
  const hair = HAIR_COLOR_COLORS[hairColor] || HAIR_COLOR_COLORS.brown;
  const hairShade = HAIR_SHADOW_COLORS[hairColor] || HAIR_SHADOW_COLORS.brown;

  const recruitGray = "#6b7280";
  const recruitGrayDark = "#4b5563";
  const defaultTeamColor = "#1a4a1a";
  const defaultTeamColorDark = "#0f2f0f";

  const jersey = isRecruit ? recruitGray : (jerseyColor || defaultTeamColor);
  const jerseyDark = isRecruit ? recruitGrayDark : (jerseyColor ? darkenColor(jerseyColor) : defaultTeamColorDark);

  const bgColor = "#f5f0e6";

  // DB-stored values are passed directly as props.
  // Fallback to hash-based derivation only when DB value is absent (legacy rows).
  const seed = playerId ? hashStr(playerId) : 0;
  const EYE_STYLES     = ["standard", "narrow", "wide", "heavy"] as const;
  const EYEBROW_STYLES = ["flat", "arched", "thick", "furrowed"] as const;
  const MOUTH_STYLES   = ["neutral", "smile", "smirk"] as const;

  const resolvedEyeStyle     = eyeStyle     || (playerId ? EYE_STYLES[seed % 4]            : "standard");
  const resolvedEyebrowStyle = eyebrowStyle || (playerId ? EYEBROW_STYLES[(seed >> 3) % 4]  : "flat");
  const resolvedMouthStyle   = mouthStyle   || (playerId ? MOUTH_STYLES[(seed >> 6) % 3]    : "neutral");
  const resolvedEyeBlack     = eyeBlack     !== undefined ? eyeBlack
                                             : (playerId  ? ((seed >> 9) % 10) < 3
                                                          : false);

  const normHairStyle = hairStyle === "buzzcut" ? "buzz" : hairStyle;

  return (
    <div
      className={`relative rounded ${className}`}
      data-testid="player-portrait"
      style={{ imageRendering: "pixelated" }}
    >
      <svg
        viewBox="0 0 32 32"
        className="w-full h-full"
        style={{ imageRendering: "pixelated" }}
        shapeRendering="crispEdges"
      >
        {/* Background */}
        <rect x="0" y="0" width="32" height="32" fill={bgColor} />

        {/* Jersey */}
        <rect x="6" y="25" width="20" height="7" fill={jersey} />
        <rect x="8" y="24" width="16" height="1" fill={jersey} />
        <rect x="10" y="23" width="12" height="1" fill={jersey} />
        <rect x="12" y="24" width="8" height="1" fill={jerseyDark} />

        {/* Neck */}
        <rect x="13" y="22" width="6" height="3" fill={skin} />

        {/* Face */}
        <rect x="9" y="8" width="14" height="14" fill={skin} />
        <rect x="8" y="10" width="1" height="10" fill={skin} />
        <rect x="23" y="10" width="1" height="10" fill={skin} />
        <rect x="10" y="7" width="12" height="1" fill={skin} />
        <rect x="10" y="22" width="12" height="1" fill={skin} />

        {/* Face shadow */}
        <rect x="8" y="14" width="1" height="4" fill={skinShade} />
        <rect x="9" y="20" width="14" height="2" fill={skinShade} />

        {/* Ears */}
        <rect x="7" y="12" width="2" height="4" fill={skin} />
        <rect x="23" y="12" width="2" height="4" fill={skin} />

        {/* ── Eyebrows ── */}
        {resolvedEyebrowStyle === "flat" && (
          <>
            <rect x="11" y="11" width="4" height="1" fill={hairShade} />
            <rect x="17" y="11" width="4" height="1" fill={hairShade} />
          </>
        )}
        {resolvedEyebrowStyle === "arched" && (
          <>
            <rect x="11" y="12" width="2" height="1" fill={hairShade} />
            <rect x="13" y="11" width="2" height="1" fill={hairShade} />
            <rect x="17" y="12" width="2" height="1" fill={hairShade} />
            <rect x="19" y="11" width="2" height="1" fill={hairShade} />
          </>
        )}
        {resolvedEyebrowStyle === "thick" && (
          <>
            <rect x="11" y="10" width="4" height="2" fill={hairShade} />
            <rect x="17" y="10" width="4" height="2" fill={hairShade} />
          </>
        )}
        {resolvedEyebrowStyle === "furrowed" && (
          <>
            <rect x="11" y="11" width="3" height="1" fill={hairShade} />
            <rect x="14" y="10" width="1" height="1" fill={hairShade} />
            <rect x="17" y="10" width="1" height="1" fill={hairShade} />
            <rect x="18" y="11" width="3" height="1" fill={hairShade} />
          </>
        )}

        {/* ── Eyes ── */}
        {resolvedEyeStyle === "standard" && (
          <>
            <rect x="11" y="13" width="3" height="3" fill="#1a1a1a" />
            <rect x="18" y="13" width="3" height="3" fill="#1a1a1a" />
            <rect x="11" y="13" width="1" height="1" fill="#ffffff" />
            <rect x="18" y="13" width="1" height="1" fill="#ffffff" />
          </>
        )}
        {resolvedEyeStyle === "narrow" && (
          <>
            <rect x="11" y="13" width="3" height="2" fill="#1a1a1a" />
            <rect x="18" y="13" width="3" height="2" fill="#1a1a1a" />
            <rect x="11" y="13" width="1" height="1" fill="#ffffff" />
            <rect x="18" y="13" width="1" height="1" fill="#ffffff" />
          </>
        )}
        {resolvedEyeStyle === "wide" && (
          <>
            <rect x="10" y="13" width="4" height="3" fill="#1a1a1a" />
            <rect x="18" y="13" width="4" height="3" fill="#1a1a1a" />
            <rect x="10" y="13" width="1" height="1" fill="#ffffff" />
            <rect x="18" y="13" width="1" height="1" fill="#ffffff" />
          </>
        )}
        {resolvedEyeStyle === "heavy" && (
          <>
            <rect x="11" y="12" width="3" height="1" fill={skinShade} opacity="0.7" />
            <rect x="18" y="12" width="3" height="1" fill={skinShade} opacity="0.7" />
            <rect x="11" y="13" width="3" height="3" fill="#1a1a1a" />
            <rect x="18" y="13" width="3" height="3" fill="#1a1a1a" />
            <rect x="11" y="13" width="1" height="1" fill="#ffffff" />
            <rect x="18" y="13" width="1" height="1" fill="#ffffff" />
          </>
        )}

        {/* Eye black */}
        {resolvedEyeBlack && (
          <>
            <rect x="11" y="16" width="3" height="1" fill="#111111" opacity="0.75" />
            <rect x="18" y="16" width="3" height="1" fill="#111111" opacity="0.75" />
          </>
        )}

        {/* Nose */}
        <rect x="15" y="15" width="2" height="3" fill={skinShade} />

        {/* ── Mouth ── */}
        {resolvedMouthStyle === "neutral" && (
          <rect x="13" y="19" width="6" height="1" fill="#444444" />
        )}
        {resolvedMouthStyle === "smile" && (
          <>
            <rect x="14" y="19" width="4" height="1" fill="#444444" />
            <rect x="13" y="18" width="2" height="1" fill="#444444" />
            <rect x="17" y="18" width="2" height="1" fill="#444444" />
          </>
        )}
        {resolvedMouthStyle === "smirk" && (
          <>
            <rect x="13" y="20" width="4" height="1" fill="#444444" />
            <rect x="17" y="19" width="2" height="1" fill="#444444" />
          </>
        )}

        {/* ── Hair ── */}
        {normHairStyle === "short" && (
          <>
            <rect x="9" y="5" width="14" height="4" fill={hair} />
            <rect x="8" y="6" width="1" height="5" fill={hair} />
            <rect x="23" y="6" width="1" height="5" fill={hair} />
            <rect x="10" y="4" width="12" height="1" fill={hair} />
            <rect x="9" y="8" width="14" height="1" fill={hairShade} />
          </>
        )}
        {normHairStyle === "medium" && (
          <>
            <rect x="8" y="4" width="16" height="5" fill={hair} />
            <rect x="7" y="5" width="1" height="7" fill={hair} />
            <rect x="24" y="5" width="1" height="7" fill={hair} />
            <rect x="10" y="3" width="12" height="1" fill={hair} />
            <rect x="8" y="8" width="16" height="1" fill={hairShade} />
          </>
        )}
        {normHairStyle === "long" && (
          <>
            <rect x="7" y="3" width="18" height="6" fill={hair} />
            <rect x="6" y="4" width="1" height="10" fill={hair} />
            <rect x="25" y="4" width="1" height="10" fill={hair} />
            <rect x="6" y="14" width="2" height="10" fill={hair} />
            <rect x="24" y="14" width="2" height="10" fill={hair} />
            <rect x="9" y="2" width="14" height="1" fill={hair} />
          </>
        )}
        {normHairStyle === "fade" && (
          <>
            <rect x="10" y="5" width="12" height="3" fill={hair} />
            <rect x="9" y="6" width="1" height="4" fill={hair} />
            <rect x="22" y="6" width="1" height="4" fill={hair} />
            <rect x="8" y="8" width="1" height="4" fill={hairShade} />
            <rect x="23" y="8" width="1" height="4" fill={hairShade} />
            <rect x="11" y="4" width="10" height="1" fill={hair} />
          </>
        )}
        {normHairStyle === "buzz" && (
          <>
            <rect x="9" y="6" width="14" height="2" fill={hair} />
            <rect x="8" y="7" width="1" height="4" fill={hair} />
            <rect x="23" y="7" width="1" height="4" fill={hair} />
            <rect x="10" y="5" width="12" height="1" fill={hair} />
          </>
        )}
        {normHairStyle === "bald" && (
          <>
            <rect x="10" y="6" width="12" height="2" fill={skin} />
            <rect x="9" y="7" width="1" height="2" fill={skinShade} />
            <rect x="22" y="7" width="1" height="2" fill={skinShade} />
          </>
        )}
        {normHairStyle === "curly" && (
          <>
            <rect x="9" y="4" width="14" height="5" fill={hair} />
            <rect x="8" y="5" width="1" height="6" fill={hair} />
            <rect x="23" y="5" width="1" height="6" fill={hair} />
            <rect x="9"  y="3" width="2" height="2" fill={hair} />
            <rect x="12" y="2" width="2" height="2" fill={hair} />
            <rect x="15" y="3" width="2" height="2" fill={hair} />
            <rect x="18" y="2" width="2" height="2" fill={hair} />
            <rect x="21" y="3" width="2" height="2" fill={hair} />
            <rect x="7"  y="6"  width="2" height="2" fill={hair} />
            <rect x="7"  y="10" width="2" height="2" fill={hair} />
            <rect x="23" y="6"  width="2" height="2" fill={hair} />
            <rect x="23" y="10" width="2" height="2" fill={hair} />
            <rect x="9" y="8" width="14" height="1" fill={hairShade} />
          </>
        )}
        {normHairStyle === "mullet" && (
          <>
            <rect x="9"  y="5" width="14" height="3" fill={hair} />
            <rect x="10" y="4" width="12" height="1" fill={hair} />
            <rect x="7"  y="7" width="3" height="15" fill={hair} />
            <rect x="22" y="7" width="3" height="15" fill={hair} />
            <rect x="9"  y="8" width="14" height="1" fill={hairShade} />
            <rect x="9"  y="8" width="1" height="14" fill={hairShade} />
            <rect x="22" y="8" width="1" height="14" fill={hairShade} />
          </>
        )}
        {!["short","medium","long","fade","buzz","bald","curly","mullet"].includes(normHairStyle) && (
          <>
            <rect x="9" y="5" width="14" height="4" fill={hair} />
            <rect x="8" y="6" width="1" height="5" fill={hair} />
            <rect x="23" y="6" width="1" height="5" fill={hair} />
            <rect x="10" y="4" width="12" height="1" fill={hair} />
            <rect x="9" y="8" width="14" height="1" fill={hairShade} />
          </>
        )}

        {/* ── Facial hair ── */}
        {facialHair === "stubble" && (
          <rect x="13" y="18" width="6" height="3" fill={hair} opacity="0.3" />
        )}
        {facialHair === "goatee" && (
          <>
            <rect x="14" y="19" width="4" height="3" fill={hair} />
            <rect x="15" y="18" width="2" height="1" fill={hair} />
          </>
        )}
        {facialHair === "beard" && (
          <>
            <rect x="11" y="17" width="10" height="5" fill={hair} />
            <rect x="10" y="15" width="1" height="4" fill={hair} />
            <rect x="21" y="15" width="1" height="4" fill={hair} />
          </>
        )}
        {facialHair === "mustache" && (
          <rect x="13" y="17" width="6" height="2" fill={hair} />
        )}
      </svg>
    </div>
  );
}
