import { IllustratedPlayerPortrait } from "@/components/ui/illustrated-player-portrait";
import { CelCharacter } from "./cel-character";

interface PlayerPortraitProps {
  portraitId?: string | null;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
  eyeStyle?: string;
  eyebrowStyle?: string;
  mouthStyle?: string;
  eyeBlack?: boolean;
  headwear?: string;
  playerId?: string;
  className?: string;
  jerseyColor?: string;
  isRecruit?: boolean;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

export function PlayerPortrait({ 
  portraitId,
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  facialHair = "none",
  eyeStyle,
  eyebrowStyle,
  mouthStyle,
  eyeBlack,
  headwear = "none",
  playerId,
  className = "",
  jerseyColor,
  isRecruit = false,
}: PlayerPortraitProps) {
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
    <div className={`relative overflow-hidden rounded-lg ${className}`} data-testid="player-portrait">
      {portraitId ? <IllustratedPlayerPortrait portraitId={portraitId} teamColor={isRecruit ? "#707983" : jerseyColor} alt="Player portrait" className="h-full w-full" /> : <CelCharacter
        skinTone={skinTone} hairColor={hairColor} hairStyle={normHairStyle} facialHair={facialHair}
        eyeStyle={resolvedEyeStyle} eyebrowStyle={resolvedEyebrowStyle} mouthStyle={resolvedMouthStyle}
        eyeBlack={resolvedEyeBlack} headwear={headwear} jerseyColor={jerseyColor} isRecruit={isRecruit}
      />}
    </div>
  );
}
