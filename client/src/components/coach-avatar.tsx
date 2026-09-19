import { cn } from "@/lib/utils";


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
      <span role="img" aria-label="Coach" className="flex h-full w-full items-center justify-center font-bold text-amber-100" style={{backgroundColor:teamPrimaryColor || "#234734"}}>COACH</span>
    </div>
  );
}
