import { ArrowDownRight, ArrowRight, ArrowUpRight, ArrowUp } from "lucide-react";

interface TrajectoryIconProps {
  trajectory: 1 | 2 | 3 | 4;
  iconSize?: string;
  textSize?: string;
}

export function TrajectoryIcon({
  trajectory,
  iconSize = "w-3 h-3",
  textSize = "text-[9px]",
}: TrajectoryIconProps) {
  const color =
    trajectory === 1 ? "text-emerald-400" :
    trajectory === 3 ? "text-amber-400" :
    trajectory === 4 ? "text-red-400" :
    "text-slate-400";

  const Icon =
    trajectory === 1 ? ArrowDownRight :
    trajectory === 2 ? ArrowRight :
    trajectory === 3 ? ArrowUpRight :
    ArrowUp;

  return (
    <span className={`flex items-center gap-0.5 ${color}`}>
      <Icon className={iconSize} />
      <span className={`font-mono leading-none ${textSize}`}>{trajectory}</span>
    </span>
  );
}
