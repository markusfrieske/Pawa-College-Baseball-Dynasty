import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import { GameScreenshotGallery } from "@/components/game-screenshots";

interface ScheduleGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam?: { name: string; abbreviation: string };
  awayTeam?: { name: string; abbreviation: string };
  isComplete: boolean;
}

interface GameReport {
  id: string;
  gameId: string;
  leagueId: string;
  reporterUserId: string;
  reporterTeamId: string | null;
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  status: string;
  disputeReason: string | null;
  inningScores: number[][] | string | null;
  createdAt: string;
}

interface GameReportsTabProps {
  leagueId: string;
}

export function GameReportsTab({ leagueId }: GameReportsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reports, isLoading } = useQuery<GameReport[]>({
    queryKey: ["/api/leagues", leagueId, "game-reports", "pending"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/game-reports/pending`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
  });

  const { data: scheduleData } = useQuery<{ games: ScheduleGame[]; humanTeamIds: string[] }>({
    queryKey: ["/api/leagues", leagueId, "schedule"],
  });

  const { data: commissionerData } = useQuery<{
    readyStatus: Array<{ userId: string | null; coachName: string }>;
  }>({
    queryKey: ["/api/leagues", leagueId, "commissioner"],
  });
  const coachNameByUserId = new Map<string, string>(
    (commissionerData?.readyStatus ?? [])
      .filter((s) => s.userId)
      .map((s) => [s.userId!, s.coachName]),
  );

  const finalizeMutation = useMutation({
    mutationFn: async (gameId: string) => {
      return apiRequest("POST", `/api/leagues/${leagueId}/games/${gameId}/report/finalize`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/leagues", leagueId, "game-reports", "pending"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
      toast({ title: "Game Finalized", description: "The reported score has been accepted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const pending = reports?.filter((r) => r.status === "pending") ?? [];
  const disputed = reports?.filter((r) => r.status === "disputed") ?? [];

  const getGameInfo = (report: GameReport): ScheduleGame | undefined => {
    return scheduleData?.games?.find((g) => g.id === report.gameId);
  };

  function ReportCard({ report }: { report: GameReport }) {
    const game = getGameInfo(report);
    const isDisputed = report.status === "disputed";
    const isPending = report.status === "pending";

    const reporterTeamName = report.reporterTeamId
      ? (game?.homeTeamId === report.reporterTeamId
          ? game?.homeTeam?.name
          : game?.awayTeam?.name) ?? "Unknown team"
      : "Commissioner";
    const reporterCoachName = coachNameByUserId.get(report.reporterUserId) ?? null;
    const reporterLabel = reporterCoachName
      ? `${reporterCoachName} (${reporterTeamName})`
      : reporterTeamName;

    const parsedInnings: Array<[number, number]> | null = (() => {
      if (!report.inningScores) return null;
      try {
        const raw =
          typeof report.inningScores === "string"
            ? JSON.parse(report.inningScores)
            : report.inningScores;
        if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]))
          return raw as Array<[number, number]>;
        return null;
      } catch {
        return null;
      }
    })();

    return (
      <div
        className={`p-4 rounded border ${
          isDisputed
            ? "bg-red-900/20 border-red-800/40"
            : isPending
            ? "bg-yellow-900/10 border-yellow-700/30"
            : "bg-green-900/10 border-green-800/30"
        }`}
        data-testid={`report-card-${report.id}`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[9px] ${
                  isDisputed
                    ? "border-red-600 text-red-400"
                    : isPending
                    ? "border-yellow-600 text-yellow-400"
                    : "border-green-600 text-green-400"
                }`}
              >
                {report.status.toUpperCase()}
              </Badge>
              {game && (
                <span className="text-sm font-medium">
                  {game.awayTeam?.name ?? "Away"} @ {game.homeTeam?.name ?? "Home"}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground font-bold">
              Score: {report.awayScore} - {report.homeScore}
            </p>
            <p className="text-xs text-muted-foreground">
              {report.awayHits}H / {report.homeHits}H &nbsp;|&nbsp; {report.awayErrors}E /{" "}
              {report.homeErrors}E
            </p>
            <p className="text-xs text-muted-foreground">
              Reported by: <span className="text-foreground">{reporterLabel}</span>
            </p>
            {parsedInnings && parsedInnings.length > 0 && (
              <div className="text-[9px] font-mono text-muted-foreground overflow-x-auto">
                <div className="flex gap-1">
                  <span className="w-14 shrink-0 text-right pr-1">Away</span>
                  {parsedInnings.map(([away], i) => (
                    <span key={i} className="w-5 text-center">
                      {away}
                    </span>
                  ))}
                  <span className="w-6 text-center font-bold text-foreground">
                    {report.awayScore}
                  </span>
                </div>
                <div className="flex gap-1">
                  <span className="w-14 shrink-0 text-right pr-1">Home</span>
                  {parsedInnings.map(([, home], i) => (
                    <span key={i} className="w-5 text-center">
                      {home}
                    </span>
                  ))}
                  <span className="w-6 text-center font-bold text-foreground">
                    {report.homeScore}
                  </span>
                </div>
              </div>
            )}
            {report.disputeReason && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {report.disputeReason}
              </p>
            )}
            <p className="text-[9px] text-muted-foreground">
              Submitted {new Date(report.createdAt).toLocaleDateString()}
            </p>
            <GameScreenshotGallery leagueId={leagueId} gameId={report.gameId} />
          </div>
          {(isPending || isDisputed) && (
            <RetroButton
              size="sm"
              variant="primary"
              onClick={() => finalizeMutation.mutate(report.gameId)}
              disabled={finalizeMutation.isPending}
              data-testid={`button-finalize-${report.id}`}
            >
              <Check className="w-3 h-3 mr-1" /> Force Finalize
            </RetroButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {disputed.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-red-400">Disputed Reports ({disputed.length})</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent className="space-y-3">
            {disputed.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </RetroCardContent>
        </RetroCard>
      )}

      {pending.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <span className="text-yellow-400">Pending Reports ({pending.length})</span>
          </RetroCardHeader>
          <RetroCardContent className="space-y-3">
            {pending.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </RetroCardContent>
        </RetroCard>
      )}

      {(reports?.length ?? 0) === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No pending or disputed reports. Reports appear here when human coaches submit game results.
        </div>
      )}
    </div>
  );
}
