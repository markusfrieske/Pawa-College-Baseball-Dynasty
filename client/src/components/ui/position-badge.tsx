import { cn } from "@/lib/utils";

interface PositionBadgeProps {
  position: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getPositionColor(position: string): string {
  const pos = position?.toUpperCase() || "";
  
  if (pos === "SP" || pos === "P") {
    return "bg-red-500 text-white";
  }
  if (pos === "RP" || pos === "CP" || pos === "CL") {
    return "bg-pink-400 text-white";
  }
  if (["C", "CATCHER"].includes(pos)) {
    return "bg-blue-500 text-white";
  }
  if (["1B", "2B", "3B", "SS", "IF"].includes(pos)) {
    return "bg-yellow-500 text-black";
  }
  if (["LF", "CF", "RF", "OF"].includes(pos)) {
    return "bg-green-500 text-white";
  }
  if (pos === "DH" || pos === "UTIL") {
    return "bg-gray-500 text-white";
  }
  
  return "bg-muted text-muted-foreground";
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

export { getPositionColor };
