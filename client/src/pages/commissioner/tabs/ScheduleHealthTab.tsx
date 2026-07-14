import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Users,
  Calendar,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface TeamStat {
  teamId: string;
  teamName: string;
  conferenceName: string;
  isHuman: boolean;
  totalGames: number;
  confGames: number;
  oocGames: number;
  byeWeeks: number[];
  overloadedWeeks: Array<{ week: number; count: number }>;
  repeatOpponents: Array<{ opponentId: string; opponentName: string; count: number }>;
  humanMatchups: number;
}

interface WeekStat {
  week: number;
  totalGames: number;
  confGames: number;
  oocGames: number;
  teamsWithGames: number;
  teamsOnBye: number;
}

interface ScheduleWarning {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

interface ScheduleHealthData {
  season: number;
  seasonLength: string;
  numWeeks: number;
  numTeams: number;
  expectedGamesPerTeam: number;
  maxGamesPerWeek: number;
  teamStats: TeamStat[];
  weekStats: WeekStat[];
  humanMatchupMatrix: Record<string, Record<string, number>>;
  humanTeamNames: Record<string, string>;
  warnings: ScheduleWarning[];
  summary: {
    minGames: number;
    maxGames: number;
    avgGames: number;
    teamsUnderTarget: number;
    teamsOverTarget: number;
    totalByes: number;
    teamsWithRepeats: number;
    humanVsHumanGames: number;
    hasErrors: boolean;
    hasWarnings: boolean;
  };
}

interface Props {
  leagueId: string;
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "error") return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />;
  return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "error"
      ? "bg-red-900/40 text-red-300 border-red-700/50"
      : severity === "warning"
      ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/50"
      : "bg-blue-900/40 text-blue-300 border-blue-700/50";
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${cls} uppercase`}>
      {severity}
    </span>
  );
}

function GameCountBar({
  value,
  expected,
  max,
}: {
  value: number;
  expected: number;
  max: number;
}) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  const isLow = value < expected * 0.85;
  const isHigh = value > expected * 1.15;
  const barColor = isLow ? "bg-yellow-500" : isHigh ? "bg-red-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-muted/30 rounded-full h-1.5 min-w-[60px]">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-xs font-semibold shrink-0 ${
          isLow ? "text-yellow-400" : isHigh ? "text-red-400" : "text-green-400"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function ScheduleHealthTab({ leagueId }: Props) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [activeView, setActiveView] = useState<"overview" | "teams" | "weeks" | "human">(
    "overview"
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ScheduleHealthData>({
    queryKey: ["/api/leagues", leagueId, "schedule", "health"],
    queryFn: () =>
      fetch(`/api/leagues/${leagueId}/schedule/health`).then((r) => {
        if (!r.ok) throw new Error("Failed to load schedule health");
        return r.json();
      }),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4 rounded border border-red-500/40 bg-red-900/20 text-sm text-red-300">
        Failed to load schedule health data.
      </div>
    );
  }

  const { summary, warnings, teamStats, weekStats, humanMatchupMatrix, humanTeamNames } = data;

  const humanTeamIds = Object.keys(humanTeamNames);
  const displayedTeams = showAllTeams ? teamStats : teamStats.slice(0, 12);

  const tabBtnClass = (view: typeof activeView) =>
    `text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
      activeView === view
        ? "bg-gold text-forest-dark"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <RetroCard className="p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">GAME COUNT RANGE</p>
          <p className="text-lg font-bold">
            {summary.minGames}–{summary.maxGames}
          </p>
          <p className="text-xs text-muted-foreground">target: {data.expectedGamesPerTeam}</p>
        </RetroCard>
        <RetroCard className="p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">TOTAL BYE WEEKS</p>
          <p className={`text-lg font-bold ${summary.totalByes > data.numTeams ? "text-yellow-400" : ""}`}>
            {summary.totalByes}
          </p>
          <p className="text-xs text-muted-foreground">across {data.numTeams} teams</p>
        </RetroCard>
        <RetroCard className="p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">HUMAN vs HUMAN</p>
          <p className="text-lg font-bold">{summary.humanVsHumanGames}</p>
          <p className="text-xs text-muted-foreground">
            {humanTeamIds.length} human teams
          </p>
        </RetroCard>
        <RetroCard className="p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">HEALTH STATUS</p>
          {summary.hasErrors ? (
            <p className="text-base font-bold text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Issues
            </p>
          ) : summary.hasWarnings ? (
            <p className="text-base font-bold text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Warnings
            </p>
          ) : (
            <p className="text-base font-bold text-green-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Healthy
            </p>
          )}
          <p className="text-xs text-muted-foreground">{warnings.length} issue(s)</p>
        </RetroCard>
      </div>

      {/* Warnings list */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 p-2.5 rounded border text-xs ${
                w.severity === "error"
                  ? "border-red-500/40 bg-red-900/20"
                  : w.severity === "warning"
                  ? "border-yellow-500/40 bg-yellow-900/20"
                  : "border-blue-500/40 bg-blue-900/20"
              }`}
            >
              <SeverityIcon severity={w.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <SeverityBadge severity={w.severity} />
                  <span className="text-xs font-semibold text-muted-foreground">{w.code}</span>
                </div>
                <p className="text-xs text-foreground/90">{w.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {warnings.length === 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded border border-green-500/30 bg-green-900/10 text-xs">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          <span className="text-green-300">
            No schedule issues detected. Season {data.season} looks good to go.
          </span>
        </div>
      )}

      {/* Sub-views */}
      <div className="flex items-center gap-1 border-b border-border pb-2 overflow-x-auto">
        <button className={tabBtnClass("overview")} onClick={() => setActiveView("overview")}
          data-testid="sched-health-tab-overview">
          <BarChart3 className="w-3 h-3 inline mr-1" />Overview
        </button>
        <button className={tabBtnClass("teams")} onClick={() => setActiveView("teams")}
          data-testid="sched-health-tab-teams">
          <Users className="w-3 h-3 inline mr-1" />Teams
        </button>
        <button className={tabBtnClass("weeks")} onClick={() => setActiveView("weeks")}
          data-testid="sched-health-tab-weeks">
          <Calendar className="w-3 h-3 inline mr-1" />By Week
        </button>
        {humanTeamIds.length > 1 && (
          <button className={tabBtnClass("human")} onClick={() => setActiveView("human")}
            data-testid="sched-health-tab-human">
            <Users className="w-3 h-3 inline mr-1" />Human Matchups
          </button>
        )}
        <button
          className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="sched-health-refresh"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Overview sub-view */}
      {activeView === "overview" && (
        <div className="space-y-3">
          <RetroCard>
            <RetroCardHeader>
              <span className="text-xs font-semibold text-gold">Schedule Configuration</span>
            </RetroCardHeader>
            <RetroCardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground text-xs">Season Length</p>
                <p className="font-semibold capitalize">{data.seasonLength}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Weeks</p>
                <p className="font-semibold">{data.numWeeks}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Max Games/Week</p>
                <p className="font-semibold">{data.maxGamesPerWeek}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Target Games/Team</p>
                <p className="font-semibold">{data.expectedGamesPerTeam}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Teams</p>
                <p className="font-semibold">{data.numTeams}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Season</p>
                <p className="font-semibold">{data.season}</p>
              </div>
            </RetroCardContent>
          </RetroCard>

          <RetroCard>
            <RetroCardHeader>
              <span className="text-xs font-semibold text-gold">Game Count Distribution</span>
            </RetroCardHeader>
            <RetroCardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-3 text-center text-xs mb-3">
                <div className="p-2 bg-muted/20 rounded">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">MIN</p>
                  <p className={`text-lg font-bold ${summary.minGames < data.expectedGamesPerTeam * 0.85 ? "text-yellow-400" : ""}`}>
                    {summary.minGames}
                  </p>
                </div>
                <div className="p-2 bg-muted/20 rounded">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">AVG</p>
                  <p className="text-lg font-bold">{summary.avgGames}</p>
                </div>
                <div className="p-2 bg-muted/20 rounded">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">MAX</p>
                  <p className={`text-lg font-bold ${summary.maxGames > data.expectedGamesPerTeam * 1.15 ? "text-red-400" : ""}`}>
                    {summary.maxGames}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {teamStats
                  .slice()
                  .sort((a, b) => a.totalGames - b.totalGames)
                  .map(t => (
                    <div key={t.teamId} className="flex items-center gap-2 text-xs">
                      <span className="w-32 truncate shrink-0 text-muted-foreground">{t.teamName}</span>
                      <GameCountBar
                        value={t.totalGames}
                        expected={data.expectedGamesPerTeam}
                        max={summary.maxGames}
                      />
                      {t.byeWeeks.length > 1 && (
                        <Badge variant="outline" className="text-xs font-semibold px-1 py-0 shrink-0 text-yellow-400 border-yellow-600/50">
                          {t.byeWeeks.length} byes
                        </Badge>
                      )}
                    </div>
                  ))}
              </div>
            </RetroCardContent>
          </RetroCard>
        </div>
      )}

      {/* Teams sub-view */}
      {activeView === "teams" && (
        <div className="space-y-2">
          {displayedTeams.map(t => {
            const isExpanded = expandedTeam === t.teamId;
            const hasIssues =
              t.byeWeeks.length > 1 ||
              t.overloadedWeeks.length > 0 ||
              t.repeatOpponents.length > 0 ||
              t.totalGames < data.expectedGamesPerTeam * 0.85 ||
              t.totalGames > data.expectedGamesPerTeam * 1.15;

            return (
              <div
                key={t.teamId}
                className={`rounded border transition-colors ${
                  hasIssues ? "border-yellow-700/40 bg-yellow-900/10" : "border-border bg-card/50"
                }`}
              >
                <button
                  className="w-full flex items-center gap-2 p-3 text-left"
                  onClick={() => setExpandedTeam(isExpanded ? null : t.teamId)}
                  data-testid={`sched-team-row-${t.teamId}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-semibold text-sm flex-1 truncate">{t.teamName}</span>
                  {t.isHuman && (
                    <Badge variant="outline" className="text-xs font-semibold px-1.5 py-0 shrink-0 text-blue-400 border-blue-600/50">
                      HUMAN
                    </Badge>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                    <span>{t.totalGames} games</span>
                    <span className="text-blue-400/70">{t.confGames}C</span>
                    <span className="text-muted-foreground/60">{t.oocGames}OOC</span>
                    {t.byeWeeks.length > 0 && (
                      <span className="text-yellow-400">{t.byeWeeks.length} bye</span>
                    )}
                    {hasIssues && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 space-y-2 border-t border-border/50 pt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-muted/20 rounded p-2">
                        <p className="text-muted-foreground mb-0.5">Total Games</p>
                        <p className={`font-bold ${
                          t.totalGames < data.expectedGamesPerTeam * 0.85 ? "text-yellow-400" :
                          t.totalGames > data.expectedGamesPerTeam * 1.15 ? "text-red-400" : ""
                        }`}>{t.totalGames} / {data.expectedGamesPerTeam}</p>
                      </div>
                      <div className="bg-muted/20 rounded p-2">
                        <p className="text-muted-foreground mb-0.5">Conf / OOC</p>
                        <p className="font-bold">{t.confGames} / {t.oocGames}</p>
                      </div>
                      <div className="bg-muted/20 rounded p-2">
                        <p className="text-muted-foreground mb-0.5">Bye Weeks</p>
                        <p className={`font-bold ${t.byeWeeks.length > 1 ? "text-yellow-400" : ""}`}>
                          {t.byeWeeks.length > 0 ? t.byeWeeks.join(", ") : "None"}
                        </p>
                      </div>
                      <div className="bg-muted/20 rounded p-2">
                        <p className="text-muted-foreground mb-0.5">vs. Humans</p>
                        <p className="font-bold">{t.humanMatchups}</p>
                      </div>
                    </div>

                    {t.overloadedWeeks.length > 0 && (
                      <div className="p-2 rounded border border-red-500/30 bg-red-900/20 text-xs">
                        <span className="text-xs font-semibold text-red-400 mr-1">OVERLOADED:</span>
                        {t.overloadedWeeks.map(ow => (
                          <span key={ow.week} className="mr-2 text-red-300">
                            Wk {ow.week} ({ow.count} games)
                          </span>
                        ))}
                      </div>
                    )}

                    {t.repeatOpponents.length > 0 && (
                      <div className="p-2 rounded border border-yellow-500/30 bg-yellow-900/20 text-xs">
                        <span className="text-xs font-semibold text-yellow-400 block mb-1">REPEAT OPPONENTS:</span>
                        {t.repeatOpponents.map(ro => (
                          <span key={ro.opponentId} className="mr-3 text-yellow-300">
                            {ro.opponentName} × {ro.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {teamStats.length > 12 && (
            <button
              className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground py-2"
              onClick={() => setShowAllTeams(v => !v)}
            >
              {showAllTeams ? "Show fewer" : `Show all ${teamStats.length} teams`}
            </button>
          )}
        </div>
      )}

      {/* By Week sub-view */}
      {activeView === "weeks" && (
        <RetroCard>
          <RetroCardHeader>
            <span className="text-xs font-semibold text-gold">Week-by-Week Breakdown</span>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 pr-3 text-xs font-semibold">WEEK</th>
                    <th className="text-right py-1.5 px-2 text-xs font-semibold">GAMES</th>
                    <th className="text-right py-1.5 px-2 text-xs font-semibold">CONF</th>
                    <th className="text-right py-1.5 px-2 text-xs font-semibold">OOC</th>
                    <th className="text-right py-1.5 px-2 text-xs font-semibold">ACTIVE</th>
                    <th className="text-right py-1.5 pl-2 text-xs font-semibold">BYES</th>
                  </tr>
                </thead>
                <tbody>
                  {weekStats.map(w => (
                    <tr key={w.week} className="border-b border-border/40 hover:bg-muted/10">
                      <td className="py-1.5 pr-3 font-semibold">Week {w.week}</td>
                      <td className="text-right py-1.5 px-2">{w.totalGames}</td>
                      <td className="text-right py-1.5 px-2 text-blue-400/80">{w.confGames}</td>
                      <td className="text-right py-1.5 px-2 text-muted-foreground">{w.oocGames}</td>
                      <td className="text-right py-1.5 px-2 text-green-400/80">{w.teamsWithGames}</td>
                      <td className={`text-right py-1.5 pl-2 ${w.teamsOnBye > data.numTeams * 0.3 ? "text-yellow-400" : "text-muted-foreground"}`}>
                        {w.teamsOnBye}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border text-muted-foreground">
                    <td className="py-1.5 pr-3 text-xs font-semibold">TOTAL</td>
                    <td className="text-right py-1.5 px-2 font-bold text-foreground">
                      {weekStats.reduce((a, w) => a + w.totalGames, 0)}
                    </td>
                    <td className="text-right py-1.5 px-2 text-blue-400">
                      {weekStats.reduce((a, w) => a + w.confGames, 0)}
                    </td>
                    <td className="text-right py-1.5 px-2">
                      {weekStats.reduce((a, w) => a + w.oocGames, 0)}
                    </td>
                    <td className="text-right py-1.5 px-2" />
                    <td className="text-right py-1.5 pl-2">
                      {weekStats.reduce((a, w) => a + w.teamsOnBye, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </RetroCardContent>
        </RetroCard>
      )}

      {/* Human matchups sub-view */}
      {activeView === "human" && humanTeamIds.length > 1 && (
        <RetroCard>
          <RetroCardHeader>
            <span className="text-xs font-semibold text-gold">Human vs. Human Matchup Matrix</span>
          </RetroCardHeader>
          <RetroCardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Number of times each pair of human-controlled teams face each other this season.
              Balanced schedules have similar counts across all pairs.
            </p>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1 pr-3 text-xs font-semibold text-muted-foreground" />
                    {humanTeamIds.map(tid => (
                      <th
                        key={tid}
                        className="text-center py-1 px-2 text-xs font-semibold text-muted-foreground max-w-[60px] truncate"
                        title={humanTeamNames[tid]}
                      >
                        {humanTeamNames[tid]?.split(" ").slice(-1)[0] ?? tid.slice(0, 6)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {humanTeamIds.map(rowId => (
                    <tr key={rowId} className="border-t border-border/30">
                      <td
                        className="py-1.5 pr-3 font-semibold max-w-[100px] truncate"
                        title={humanTeamNames[rowId]}
                      >
                        {humanTeamNames[rowId]?.split(" ").slice(-1)[0] ?? rowId.slice(0, 6)}
                      </td>
                      {humanTeamIds.map(colId => {
                        if (rowId === colId) {
                          return (
                            <td key={colId} className="text-center py-1.5 px-2 text-muted-foreground/30">
                              —
                            </td>
                          );
                        }
                        const count = humanMatchupMatrix[rowId]?.[colId] ?? 0;
                        return (
                          <td
                            key={colId}
                            className={`text-center py-1.5 px-2 font-bold ${
                              count === 0
                                ? "text-muted-foreground/40"
                                : count >= 4
                                ? "text-red-400"
                                : count >= 2
                                ? "text-green-400"
                                : "text-foreground"
                            }`}
                          >
                            {count}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />
                0 — no matchups
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-foreground inline-block" />
                1 — single matchup
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                2–3 — normal
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                4+ — overrepresented
              </span>
            </div>
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
  );
}
