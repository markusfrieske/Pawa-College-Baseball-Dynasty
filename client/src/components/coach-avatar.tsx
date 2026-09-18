import { cn } from "@/lib/utils";
import { CelCharacter } from "@/components/ui/cel-character";

interface CoachAvatarProps {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  teamPrimaryColor?: string;
}

export function CoachAvatar({
  skinTone = "light",
  hairColor = "brown",
  hairStyle = "short",
  facialHair = "none",
  size = "md",
  className,
  teamPrimaryColor,
}: CoachAvatarProps) {
  const sizes = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32",
  };

  return (
    <div className={cn("relative overflow-hidden rounded-lg", sizes[size], className)}>
      <CelCharacter skinTone={skinTone} hairColor={hairColor} hairStyle={hairStyle} facialHair={facialHair}
        jerseyColor={teamPrimaryColor || "#2563eb"} mouthStyle="smile" coach />
    </div>
  );
}
