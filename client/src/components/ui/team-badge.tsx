import { cn } from "@/lib/utils";
import { getMascotAvatar } from "@/lib/mascot-avatar";

interface TeamBadgeProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor?: string;
  size?: "sm" | "md" | "lg";
  name?: string;
  mascot?: string;
  className?: string;
}

export function TeamBadge({
  abbreviation,
  primaryColor,
  secondaryColor,
  size = "md",
  name,
  mascot,
  className,
}: TeamBadgeProps) {
  const sizes = {
    sm: "w-8 h-8 text-[8px]",
    md: "w-12 h-12 text-xs",
    lg: "w-16 h-16 text-sm",
  };

  const avatar = getMascotAvatar(mascot ?? name, primaryColor, secondaryColor);

  if (avatar) {
    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center border-2 overflow-hidden shrink-0",
          sizes[size],
          className,
        )}
        style={{
          backgroundColor: primaryColor,
          borderColor: secondaryColor || primaryColor,
        }}
        aria-label={name ?? abbreviation}
        data-testid="team-badge-avatar"
      >
        {avatar}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-pixel font-bold border-2 shrink-0",
        sizes[size],
        className,
      )}
      style={{
        backgroundColor: primaryColor,
        borderColor: secondaryColor || primaryColor,
        color: isLightColor(primaryColor) ? "#1a2b1a" : "#ffffff",
      }}
      data-testid="team-badge-letter"
    >
      {abbreviation}
    </div>
  );
}

function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}
