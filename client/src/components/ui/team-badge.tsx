import { cn } from "@/lib/utils";

interface TeamBadgeProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor?: string;
  size?: "xs" | "sm" | "md" | "lg";
  name?: string;
  className?: string;
}

function abbrFontSize(len: number, size: "xs" | "sm" | "md" | "lg"): string {
  if (size === "xs") return "text-[0.5rem]";
  if (size === "sm") {
    if (len <= 2) return "text-sm";
    if (len === 3) return "text-xs";
    return "text-[0.625rem]";
  }
  if (size === "md") {
    if (len <= 2) return "text-base";
    if (len === 3) return "text-sm";
    return "text-xs";
  }
  // lg
  if (len <= 2) return "text-xl";
  if (len === 3) return "text-base";
  return "text-sm";
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

  // Truncate to fit the circle at each size
  const displayAbbr = size === "xs"
    ? (abbreviation?.slice(0, 2) ?? "")
    : size === "sm"
    ? (abbreviation?.slice(0, 3) ?? "")
    : abbreviation;

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-sans font-bold border-2 shrink-0 overflow-hidden",
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
      <span className={cn("leading-none text-center", abbrFontSize(displayAbbr?.length ?? 0, size))}>
        {displayAbbr}
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
