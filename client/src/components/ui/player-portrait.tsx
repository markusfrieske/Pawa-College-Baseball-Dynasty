import { IllustratedPlayerPortrait } from "@/components/ui/illustrated-player-portrait";
import { resolvePortraitId } from "@/lib/portrait-selection";

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
  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`} data-testid="player-portrait">
      <IllustratedPlayerPortrait portraitId={resolvePortraitId(portraitId, skinTone, hairColor)} teamColor={isRecruit ? "#707983" : jerseyColor} alt="Player portrait" className="h-full w-full" />
    </div>
  );
}
