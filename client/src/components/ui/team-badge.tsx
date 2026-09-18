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

  // Compact athletic lettermarks; the complete team name stays available to assistive technology.
  const displayAbbr = size === "xs"
    ? (abbreviation?.slice(0, 2) ?? "")
    : size === "sm"
    ? (abbreviation?.slice(0, 3) ?? "")
    : abbreviation;

  return (
    <div
      className={cn(
        "varsity-monogram flex items-center justify-center font-extrabold border-2 shrink-0 overflow-hidden",
        sizes[size],
        className,
      )}
      style={{
        backgroundColor: primaryColor,
        borderColor: secondaryColor || primaryColor,
        color: isLightColor(primaryColor) ? "#10231c" : "#ffffff",
      }}
      aria-label={name ?? abbreviation}
      role="img"
      title={name ?? abbreviation}
      data-testid="team-badge-letter"
    >
      <span className={cn("leading-none text-center", abbrFontSize(displayAbbr?.length ?? 0, size))}>
        {displayAbbr}
      </span>
    </div>
  );
}

function isLightColor(color: string): boolean {
  const value = color.replace("#", "");
  const hex = value.length === 3 ? [...value].map(c => c + c).join("") : value;
  if (!/^[\da-f]{6}$/i.test(hex)) return false;
  const channels = [0, 2, 4].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  // Choose the stronger of white and the approved dark-forest ink.
  const forestLuminance = 0.014;
  return (luminance + 0.05) / (forestLuminance + 0.05) > 1.05 / (luminance + 0.05);
}
