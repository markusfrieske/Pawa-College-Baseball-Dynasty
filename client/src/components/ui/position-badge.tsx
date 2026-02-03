import { cn } from "@/lib/utils";
import { getPositionColor } from "@/lib/playerUtils";

interface PositionBadgeProps {
  position: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

export function PositionBadge({ position, size = "md", className }: PositionBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold rounded",
        getPositionColor(position),
        sizeClasses[size],
        className
      )}
      data-testid={`position-badge-${position?.toLowerCase()}`}
    >
      {position}
    </span>
  );
}

