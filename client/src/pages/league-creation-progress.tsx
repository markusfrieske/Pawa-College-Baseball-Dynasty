import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

const STAGES = [
  { label: "Creating conferences", pct: 5 },
  { label: "Creating teams", pct: 10 },
  { label: "Building rosters", pct: 20 },
  { label: "Assigning lineups", pct: 48 },
  { label: "Setting up coaches", pct: 52 },
  { label: "Generating recruiting class", pct: 58 },
  { label: "Creating schedule", pct: 65 },
  { label: "Validating universe", pct: 88 },
  { label: "Done", pct: 100 },
];

function stageLabel(progress: number, metaStage?: string): string {
  if (metaStage && metaStage !== "Done") return metaStage;
  const match = [...STAGES].reverse().find(s => progress >= s.pct);
  return match?.label ?? "Initializing";
}

export default function LeagueCreationProgressPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: job, error } = useQuery({
    queryKey: ["/api/leagues", id, "job"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/job`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch job status");
      return res.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "complete" || status === "failed") return false;
      return 4000;
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (job?.status === "complete") {
      setTimeout(() => setLocation(`/league/${id}/setup`), 800);
    }
  }, [job?.status, id, setLocation]);

  const progress = job?.progress ?? 0;
  const status = job?.status ?? "pending";
  const stage = stageLabel(progress, job?.metadata?.stage);
  const isFailed = status === "failed";
  const isComplete = status === "complete";

  return (
    <div className="min-h-screen bg-[#0a1a0a] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-gold text-lg">Building Your Universe</h1>
          <p className="text-muted-foreground text-sm">
            149 teams · 3,725 players · 4,172 games
          </p>
        </div>

        <div className="bg-[#111] border border-[#2a3a2a] rounded-lg p-6 space-y-6">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{isFailed ? "Failed" : isComplete ? "Complete" : stage}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-[#1a2a1a] rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  background: isFailed
                    ? "rgb(239 68 68)"
                    : isComplete
                    ? "rgb(34 197 94)"
                    : "rgb(234 179 8)",
                }}
              />
            </div>
          </div>

          {/* Stage checklist */}
          <div className="space-y-2">
            {STAGES.filter(s => s.label !== "Done").map(s => {
              const done = progress > s.pct;
              const active = !done && progress >= s.pct - 10 && !isFailed;
              return (
                <div
                  key={s.label}
                  className={`flex items-center gap-2 text-xs transition-colors ${
                    done ? "text-green-400" : active ? "text-gold" : "text-[#3a4a3a]"
                  }`}
                >
                  <span className="w-4 text-center">
                    {done ? "✓" : active ? "›" : "·"}
                  </span>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* Error message */}
          {isFailed && (
            <div className="bg-red-950/40 border border-red-800 rounded p-3 text-xs text-red-400 space-y-2">
              <p className="font-semibold">Bootstrap failed</p>
              <p className="text-red-500/80 break-all">{job?.errorMessage ?? "Unknown error"}</p>
              <button
                className="mt-2 text-red-400 underline underline-offset-2"
                onClick={() => setLocation("/league/create")}
              >
                Return to league creation
              </button>
            </div>
          )}

          {/* Success */}
          {isComplete && (
            <p className="text-center text-green-400 text-xs animate-pulse">
              Redirecting to team selection…
            </p>
          )}

          {/* Spinner for pending/running */}
          {!isFailed && !isComplete && (
            <p className="text-center text-muted-foreground text-xs">
              This takes 1–2 minutes. You can leave this page and come back.
            </p>
          )}
        </div>

        {/* Error fallback link */}
        {!isFailed && !isComplete && (
          <p className="text-center text-xs text-[#2a3a2a]">
            <button
              className="underline underline-offset-2 text-[#3a5a3a]"
              onClick={() => setLocation("/dashboard")}
            >
              Go to dashboard (building continues in background)
            </button>
          </p>
        )}

        {error && (
          <p className="text-center text-xs text-red-500">
            Could not load progress. Check back from your dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
