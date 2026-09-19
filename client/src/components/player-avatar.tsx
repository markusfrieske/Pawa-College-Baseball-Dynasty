import { IllustratedPlayerPortrait } from "@/components/ui/illustrated-player-portrait";
import { cn } from "@/lib/utils";
import { resolvePortraitId } from "@/lib/portrait-selection";

interface PlayerAvatarProps {
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
  size?: "sm" | "md" | "lg";
  className?: string;
  jerseyColor?: string;
  isRecruit?: boolean;
}

export function PlayerAvatar({
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
  size = "md",
  className,
  jerseyColor,
  isRecruit = false,
}: PlayerAvatarProps) {
  const sizes = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  return (
    <div className={cn("relative overflow-hidden rounded-lg", sizes[size], className)}>
      <IllustratedPlayerPortrait portraitId={resolvePortraitId(portraitId, skinTone, hairColor)} teamColor={isRecruit ? "#707983" : jerseyColor} alt="Player portrait" className="h-full w-full" />
    </div>
  );
}
