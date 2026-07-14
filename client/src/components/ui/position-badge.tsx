import { cn } from "@/lib/utils";
import { getPositionColor } from "@/lib/playerUtils";

interface PositionBadgeProps {
  position: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

function getPositionGlow(position: string): string {
  const pos = position?.toUpperCase() || "";
  if (pos === "SP" || pos === "P") return "0 0 6px rgba(239,68,68,0.55)";
  if (pos === "RP" || pos === "CP" || pos === "CL") return "0 0 6px rgba(236,72,153,0.55)";
  if (["C", "CATCHER"].includes(pos)) return "0 0 6px rgba(59,130,246,0.55)";
  if (["1B", "2B", "3B", "SS", "IF"].includes(pos)) return "0 0 6px rgba(234,179,8,0.55)";
  if (["LF", "CF", "RF", "OF"].includes(pos)) return "0 0 6px rgba(34,197,94,0.55)";
  return "none";
}

export function PositionBadge({ position, size = "md", className }: PositionBadgeProps) {
  const glow = getPositionGlow(position);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold rounded",
        getPositionColor(position),
        sizeClasses[size],
        className
      )}
      style={{ boxShadow: glow !== "none" ? glow : undefined }}
      data-testid={`position-badge-${position?.toLowerCase()}`}
    >
      {position}
    </span>
  );
}
