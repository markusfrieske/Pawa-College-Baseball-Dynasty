import { cn } from "@/lib/utils";

interface TeamBadgeProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor?: string;
  size?: "xs" | "sm" | "md" | "lg";
  name?: string;
  className?: string;
}

function abbrFontSize(abbreviation: string, size: "xs" | "sm" | "md" | "lg"): string {
  const len = abbreviation?.length ?? 0;
  if (size === "xs") {
    if (len <= 2) return "text-[7px]";
    return "text-[5px]";
  }
  if (size === "sm") {
    if (len <= 2) return "text-[9px]";
    if (len === 3) return "text-[7px]";
    return "text-[5px]";
  }
  if (size === "md") {
    if (len <= 2) return "text-xs";
    if (len === 3) return "text-[9px]";
    return "text-[7px]";
  }
  // lg
  if (len <= 2) return "text-sm";
  if (len === 3) return "text-xs";
  return "text-[9px]";
}

export function TeamBadge({
  abbreviation,
  primaryColor,
  secondaryColor,
  size = "md",
  name,
  className,
}: TeamBadgeProps) {
  const sizes = {
    xs: "w-6 h-6",
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

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
      aria-label={name ?? abbreviation}
      data-testid="team-badge-letter"
    >
      <span className={cn("leading-none text-center", abbrFontSize(abbreviation, size))}>
        {abbreviation}
      </span>
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
