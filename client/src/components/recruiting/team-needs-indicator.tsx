import { Users, AlertTriangle, CheckCircle } from "lucide-react";

const IDEAL_DEPTH: Record<string, number> = {
  P: 12,
  C: 2,
  "1B": 2,
  "2B": 2,
  SS: 2,
  "3B": 2,
  OF: 6,
};

interface TeamNeedsIndicatorProps {
  nextYearDepth: Record<string, number>;
  nextYearRosterSize: number;
  seniorsGraduating: number;
  positionFilter?: string;
  onPositionClick?: (pos: string) => void;
}

export function TeamNeedsIndicator({
  nextYearDepth,
  nextYearRosterSize,
  seniorsGraduating,
  positionFilter,
  onPositionClick,
}: TeamNeedsIndicatorProps) {
  const positions = ["P", "C", "1B", "2B", "SS", "3B", "OF"];

  const getDepthStatus = (pos: string) => {
    const current = nextYearDepth[pos] || 0;
    const ideal = IDEAL_DEPTH[pos] || 2;
    if (current >= ideal) return "full";
    if (current >= ideal * 0.5) return "ok";
    return "need";
  };

  return (
    <div className="mt-4 pt-4 border-t border-border" data-testid="team-needs-indicator">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Users className="w-4 h-4 text-gold" />
        <span className="text-xs font-semibold text-gold">NEXT YEAR FORECAST</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {nextYearRosterSize}/25 players
        </span>
        {seniorsGraduating > 0 && (
          <span className="text-xs text-amber-400">
            ({seniorsGraduating} graduating)
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {positions.map((pos) => {
          const current = nextYearDepth[pos] || 0;
          const ideal = IDEAL_DEPTH[pos] || 2;
          const status = getDepthStatus(pos);

          const isActive = positionFilter === pos;
          return (
            <div
              key={pos}
              className={`p-2 rounded text-center border cursor-pointer transition-all ${
                isActive
                  ? "border-gold ring-2 ring-gold/50 ring-offset-1 ring-offset-background"
                  : status === "need"
                    ? "border-red-500/50 bg-red-500/10"
                    : status === "ok"
                      ? "border-yellow-500/50 bg-yellow-500/10"
                      : "border-green-500/50 bg-green-500/10"
              } hover:opacity-80`}
              onClick={() => onPositionClick?.(pos)}
              data-testid={`depth-${pos}`}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                {status === "need" && <AlertTriangle className="w-3 h-3 text-red-500" />}
                {status === "ok" && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                {status === "full" && <CheckCircle className="w-3 h-3 text-green-500" />}
              </div>
              <p className="text-xs font-semibold text-foreground">{pos}</p>
              <p className={`text-xs font-bold ${
                status === "need" ? "text-red-400" : status === "ok" ? "text-yellow-400" : "text-green-400"
              }`}>
                {current}/{ideal}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
