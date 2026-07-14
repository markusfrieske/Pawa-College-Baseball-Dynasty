import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";

interface AdvanceProgressData {
  active: boolean;
  stage: string;
  pct: number;
}

const STAGES: { key: string; label: string; pct: number }[] = [
  { key: "initializing", label: "Initializing", pct: 5 },
  { key: "cpu_recruiting", label: "CPU Recruiting", pct: 15 },
  { key: "recruit_stages", label: "Recruiting Stages", pct: 45 },
  { key: "game_sim", label: "Game Simulation", pct: 60 },
  { key: "standings", label: "Standings & Stats", pct: 80 },
  { key: "finalizing", label: "Finalizing", pct: 95 },
];

function stageIndex(key: string): number {
  return STAGES.findIndex((s) => s.key === key);
}

interface AdvanceProgressBarProps {
  leagueId: string;
  isAdvancing: boolean;
}

export function AdvanceProgressBar({ leagueId, isAdvancing }: AdvanceProgressBarProps) {
  const [displayPct, setDisplayPct] = useState(0);
  const [displayStage, setDisplayStage] = useState("initializing");

  const { data } = useQuery<AdvanceProgressData>({
    queryKey: ["/api/leagues", leagueId, "advance-progress"],
    enabled: isAdvancing,
    refetchInterval: isAdvancing ? 300 : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!isAdvancing) {
      setDisplayPct(0);
      setDisplayStage("initializing");
      return;
    }
    if (data?.active) {
      setDisplayPct(data.pct);
      setDisplayStage(data.stage);
    } else if (isAdvancing) {
      setDisplayPct(5);
      setDisplayStage("initializing");
    }
  }, [data, isAdvancing]);

  if (!isAdvancing) return null;

  const currentIdx = stageIndex(displayStage);

  return (
    <div className="mt-3 space-y-2" data-testid="advance-progress-bar">
      <div className="w-full bg-border/40 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full bg-gold transition-all duration-500 ease-out"
          style={{ width: `${Math.max(displayPct, 5)}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;

          return (
            <div
              key={stage.key}
              className={`flex flex-col items-center gap-0.5 py-1 px-0.5 rounded transition-all duration-300 ${
                active
                  ? "bg-gold/10 border border-gold/30"
                  : done
                  ? "opacity-60"
                  : "opacity-25"
              }`}
              data-testid={`advance-stage-${stage.key}`}
            >
              {done ? (
                <CheckCircle2 className="w-2.5 h-2.5 text-gold" />
              ) : active ? (
                <Loader2 className="w-2.5 h-2.5 text-gold animate-spin" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full border border-border/60" />
              )}
              <span
                className={`font-pixel text-xs leading-tight text-center ${
                  active ? "text-gold" : done ? "text-muted-foreground" : "text-muted-foreground/50"
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
