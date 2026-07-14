import { TrendingUp, TrendingDown, Timer, Eye, Globe, Zap, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type DramaTag =
  | "Rising"
  | "Cooling"
  | "Decision Soon"
  | "Commitment Watch"
  | "Wide Open"
  | "Visit Buzz"
  | "Rivalry";

interface DramaChipConfig {
  icon: React.ReactNode;
  bg: string;
  text: string;
  border: string;
  label: string;
}

const DRAMA_CONFIG: Record<DramaTag, DramaChipConfig> = {
  Rising:            { icon: <TrendingUp className="w-2.5 h-2.5" />,  bg: "bg-emerald-950/60", text: "text-emerald-400", border: "border-emerald-600/40", label: "Rising" },
  Cooling:           { icon: <TrendingDown className="w-2.5 h-2.5" />, bg: "bg-red-950/60",     text: "text-red-400",     border: "border-red-600/40",     label: "Cooling" },
  "Decision Soon":   { icon: <Timer className="w-2.5 h-2.5" />,       bg: "bg-amber-950/60",   text: "text-amber-400",   border: "border-amber-600/40",   label: "Decision Soon" },
  "Commitment Watch":{ icon: <Eye className="w-2.5 h-2.5" />,         bg: "bg-amber-950/80",   text: "text-amber-300",   border: "border-amber-500/50",   label: "Commitment Watch" },
  "Wide Open":       { icon: <Globe className="w-2.5 h-2.5" />,       bg: "bg-blue-950/60",    text: "text-blue-400",    border: "border-blue-600/40",    label: "Wide Open" },
  "Visit Buzz":      { icon: <Zap className="w-2.5 h-2.5" />,         bg: "bg-violet-950/60",  text: "text-violet-400",  border: "border-violet-600/40",  label: "Visit Buzz" },
  Rivalry:           { icon: <Flame className="w-2.5 h-2.5" />,       bg: "bg-orange-950/60",  text: "text-orange-400",  border: "border-orange-600/40",  label: "Rivalry" },
};

const TAG_PRIORITY: DramaTag[] = [
  "Rivalry",
  "Commitment Watch",
  "Decision Soon",
  "Rising",
  "Cooling",
  "Visit Buzz",
  "Wide Open",
];

interface DramaChipsProps {
  dramaTags?: string[] | null;
  maxVisible?: number;
  size?: "xs" | "sm";
  className?: string;
  testIdPrefix?: string;
}

export function DramaChips({
  dramaTags,
  maxVisible = 3,
  size = "xs",
  className = "",
  testIdPrefix = "",
}: DramaChipsProps) {
  if (!dramaTags || dramaTags.length === 0) return null;

  const sorted = TAG_PRIORITY.filter(t => dramaTags.includes(t));
  const extra = TAG_PRIORITY.filter(t => !sorted.includes(t) && dramaTags.includes(t));
  const ordered = [...sorted, ...extra];
  const visible = ordered.slice(0, maxVisible);

  const textCls = size === "xs" ? "text-xs" : "text-xs";
  const paddingCls = size === "xs" ? "px-1 py-0.5" : "px-1.5 py-0.5";
  const gapCls = size === "xs" ? "gap-0.5" : "gap-1";

  return (
    <div className={`flex flex-wrap ${gapCls} ${className}`} data-testid={`${testIdPrefix}drama-chips`}>
      {visible.map(tag => {
        const cfg = DRAMA_CONFIG[tag as DramaTag];
        if (!cfg) return null;
        return (
          <span
            key={tag}
            className={`inline-flex items-center gap-0.5 ${paddingCls} rounded border ${cfg.bg} ${cfg.text} ${cfg.border} ${textCls} font-medium leading-none`}
            data-testid={`${testIdPrefix}drama-chip-${tag.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {cfg.icon}
            {cfg.label}
          </span>
        );
      })}
    </div>
  );
}

interface RivalryAlertBadgeProps {
  humanRivalCount?: number;
  className?: string;
}

export function RivalryAlertBadge({ humanRivalCount = 0, className = "" }: RivalryAlertBadgeProps) {
  if (humanRivalCount < 1) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded border bg-orange-950/60 text-orange-400 border-orange-600/40 text-xs font-medium leading-none ${className}`}
      data-testid="rivalry-alert-badge"
    >
      <Flame className="w-2.5 h-2.5" />
      {humanRivalCount === 1 ? "1 rival" : `${humanRivalCount} rivals`}
    </span>
  );
}

interface MovementIndicatorProps {
  delta?: number | null;
  className?: string;
}

export function MovementIndicator({ delta, className = "" }: MovementIndicatorProps) {
  if (delta == null) return null;
  if (Math.abs(delta) < 3) return null;
  const isUp = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-mono ${isUp ? "text-emerald-400" : "text-red-400"} ${className}`}
      data-testid="movement-indicator"
    >
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? "+" : ""}{delta}%
    </span>
  );
}
