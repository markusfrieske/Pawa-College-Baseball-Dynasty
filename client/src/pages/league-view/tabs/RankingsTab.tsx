import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroCard, RetroCardHeader } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Swords, ChevronUp, ChevronDown } from "lucide-react";
import type { LeagueDetails, PowerRankingEntry } from "../types";
import { percentileToGrade, gradeColor, percentileLabel } from "../helpers";

type RankSortKey = "avgOvr" | "hitter" | "pitcher" | "recruiting";

export function RankingsTab({ league }: { league: LeagueDetails }) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<RankSortKey>("avgOvr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: rankData, isLoading } = useQuery<{ rankings: PowerRankingEntry[]; userTeamId: string | null }>({
    queryKey: ["/api/leagues", league.id, "power-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/power-rankings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const userTeamId = rankData?.userTeamId ?? null;
  const rawRankings = rankData?.rankings ?? [];
  const rankings = [...rawRankings].sort((a, b) => {
    const val = (e: PowerRankingEntry) => {
      if (sortBy === "avgOvr") return e.avgOvr;
      if (sortBy === "hitter") return e.hitterAvgOvr;
      if (sortBy === "pitcher") return e.pitcherAvgOvr;
      return e.recruitingScore;
    };
    return sortDir === "desc" ? val(b) - val(a) : val(a) - val(b);
  });
  const userEntry = rankings.find(r => r.teamId === userTeamId);

  const handleSort = (key: RankSortKey) => {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };
  const sortArrow = (key: RankSortKey) => sortBy === key ? (sortDir === "desc" ? " ▾" : " ▴") : "";

  const toggleExpand = (teamId: string) => {
    setExpandedTeam(prev => prev === teamId ? null : teamId);
  };

  if (isLoading) {
    return (
      <RetroCard>
        <RetroCardHeader>Power Rankings</RetroCardHeader>
        <div className="space-y-2 mt-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </RetroCard>
    );
  }

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-gold" />
          Power Rankings
        </div>
      </RetroCardHeader>
      <p className="text-xs text-muted-foreground mb-4">
        Avg OVR of full roster (150–650 scale). Hitters and Pitchers show position-group avg OVR. Click a rival to compare.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs font-semibold">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Team</th>
              <th className="text-center py-2 px-1">
                <button className="cursor-pointer hover:text-gold select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded" onClick={() => handleSort("avgOvr")} aria-label={`Sort by Avg OVR${sortBy === "avgOvr" ? `, currently ${sortDir}ending` : ""}`} aria-sort={sortBy === "avgOvr" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>Avg OVR{sortArrow("avgOvr")}</button>
              </th>
              <th className="text-center py-2 px-1">
                <button className="cursor-pointer hover:text-gold select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded" onClick={() => handleSort("hitter")} aria-label={`Sort by Hitters${sortBy === "hitter" ? `, currently ${sortDir}ending` : ""}`} aria-sort={sortBy === "hitter" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>Hitters{sortArrow("hitter")}</button>
              </th>
              <th className="text-center py-2 px-1">
                <button className="cursor-pointer hover:text-gold select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded" onClick={() => handleSort("pitcher")} aria-label={`Sort by Pitchers${sortBy === "pitcher" ? `, currently ${sortDir}ending` : ""}`} aria-sort={sortBy === "pitcher" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>Pitchers{sortArrow("pitcher")}</button>
              </th>
              <th className="text-center py-2 px-1 hidden sm:table-cell">
                <button className="cursor-pointer hover:text-gold select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded" onClick={() => handleSort("recruiting")} aria-label={`Sort by Recruiting${sortBy === "recruiting" ? `, currently ${sortDir}ending` : ""}`} aria-sort={sortBy === "recruiting" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>Recruiting{sortArrow("recruiting")}</button>
              </th>
              <th className="py-2 px-1 w-6" />
            </tr>
          </thead>
          <tbody>
            {rankings.map((entry) => {
              const isUser = entry.teamId === userTeamId;
              const isExpanded = expandedTeam === entry.teamId;
              const ovrGrade = percentileToGrade(entry.ovrPercentile);
              const hitGrade = percentileToGrade(entry.hitterPercentile);
              const pitchGrade = percentileToGrade(entry.pitcherPercentile);
              const recruGrade = percentileToGrade(entry.recruitingPercentile);

              return (
                <Fragment key={entry.teamId}>
                  <tr
                    className={`border-b border-border/50 cursor-pointer transition-colors ${isUser ? "bg-gold/10 hover:bg-gold/15" : "hover:bg-card/50"}`}
                    onClick={() => !isUser && toggleExpand(entry.teamId)}
                    data-testid={`row-power-ranking-${entry.teamId}`}
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-semibold ${isUser ? "text-gold" : "text-muted-foreground"}`}>
                          #{entry.rank}
                        </span>
                        {entry.rankDelta != null && entry.rankDelta !== 0 && (
                          <span
                            className={`text-xs font-semibold leading-none ${entry.rankDelta > 0 ? "text-green-400" : "text-red-400"}`}
                            title={`${entry.rankDelta > 0 ? "+" : ""}${entry.rankDelta} since last week`}
                            data-testid={`rank-delta-${entry.teamId}`}
                          >
                            {entry.rankDelta > 0 ? "▲" : "▼"}{Math.abs(entry.rankDelta)}
                          </span>
                        )}
                        {entry.rankDelta === 0 && (
                          <span className="text-xs font-semibold text-muted-foreground/50" title="No change">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <TeamBadge
                          abbreviation={entry.abbreviation}
                          primaryColor={entry.primaryColor}
                          secondaryColor={entry.secondaryColor}
                          name={entry.teamName}
                         
                          size="sm"
                        />
                        <div>
                          <Link href={`/league/${league.id}/team/${entry.teamId}/profile`}>
                            <span className={`font-medium text-xs hover:text-gold transition-colors cursor-pointer ${isUser ? "text-gold font-semibold" : ""}`} data-testid={`link-profile-powerrank-${entry.teamId}`}>
                              {entry.teamName}
                            </span>
                          </Link>
                          {isUser && (
                            <span className="ml-1.5 text-xs text-gold/70">YOU</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center cursor-default">
                            <span className={`font-bold text-sm ${gradeColor(ovrGrade)}`}>{ovrGrade}</span>
                            <span className="text-xs text-muted-foreground">{entry.avgOvr}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{percentileLabel(entry.ovrPercentile)} overall (avg OVR)</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center cursor-default">
                            <span className={`font-bold text-xs ${gradeColor(hitGrade)}`}>{hitGrade}</span>
                            <span className="text-xs text-muted-foreground">{entry.hitterAvgOvr}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{percentileLabel(entry.hitterPercentile)} in Hitters (avg OVR of position players)</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center cursor-default">
                            <span className={`font-bold text-xs ${gradeColor(pitchGrade)}`}>{pitchGrade}</span>
                            <span className="text-xs text-muted-foreground">{entry.pitcherAvgOvr}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{percentileLabel(entry.pitcherPercentile)} in Pitchers (avg OVR of pitching staff)</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center hidden sm:table-cell">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center cursor-default">
                            <span className={`font-bold text-xs ${gradeColor(recruGrade)}`}>{entry.hasSignedRecruits ? recruGrade : "—"}</span>
                            <span className="text-xs text-muted-foreground">{entry.hasSignedRecruits ? entry.recruitingScore : "—"}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{entry.hasSignedRecruits ? `${percentileLabel(entry.recruitingPercentile)} in Recruiting (avg OVR of signed class)` : "No signed recruits yet"}</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center">
                      {!isUser && (
                        isExpanded
                          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </td>
                  </tr>

                  {isExpanded && userEntry && (
                    <tr className="border-b border-gold/20">
                      <td colSpan={7} className="px-2 py-3 bg-card/40">
                        <PowerComparePanel userEntry={userEntry} rivalEntry={entry} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </RetroCard>
  );
}

function PowerComparePanel({ userEntry, rivalEntry }: { userEntry: PowerRankingEntry; rivalEntry: PowerRankingEntry }) {
  const components = [
    { label: "Avg OVR", userVal: userEntry.avgOvr, rivalVal: rivalEntry.avgOvr },
    { label: "Hitters Avg OVR", userVal: userEntry.hitterAvgOvr, rivalVal: rivalEntry.hitterAvgOvr },
    { label: "Pitchers Avg OVR", userVal: userEntry.pitcherAvgOvr, rivalVal: rivalEntry.pitcherAvgOvr },
    { label: "Recruiting Avg OVR", userVal: userEntry.recruitingScore, rivalVal: rivalEntry.recruitingScore },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TeamBadge abbreviation={userEntry.abbreviation} primaryColor={userEntry.primaryColor} secondaryColor={userEntry.secondaryColor} name={userEntry.teamName} size="sm" />
          <span className="text-gold text-xs">YOU</span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">HEAD-TO-HEAD</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{rivalEntry.teamName}</span>
          <TeamBadge abbreviation={rivalEntry.abbreviation} primaryColor={rivalEntry.primaryColor} secondaryColor={rivalEntry.secondaryColor} name={rivalEntry.teamName} size="sm" />
        </div>
      </div>

      {components.map(({ label, userVal, rivalVal }) => {
        const delta = userVal - rivalVal;
        const maxVal = Math.max(userVal, rivalVal, 1);
        const userPct = Math.round((userVal / maxVal) * 100);
        const rivalPct = Math.round((rivalVal / maxVal) * 100);
        const userWins = userVal > rivalVal;
        const rivalWins = rivalVal > userVal;

        return (
          <div key={label} className="space-y-1" data-testid={`compare-row-${label.replace(/\s/g, "-").toLowerCase()}`}>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className={userWins ? "text-green-400 font-semibold" : ""}>{userVal}</span>
              <span>{label}</span>
              <span className={rivalWins ? "text-green-400 font-semibold" : ""}>{rivalVal}</span>
            </div>
            <div className="flex gap-1 items-center h-2">
              <div className="flex-1 flex justify-end">
                <div
                  className={`h-2 rounded-sm transition-all ${userWins ? "bg-gold" : "bg-muted-foreground/30"}`}
                  style={{ width: `${userPct}%` }}
                />
              </div>
              <div className="w-px h-3 bg-border shrink-0" />
              <div className="flex-1">
                <div
                  className={`h-2 rounded-sm transition-all ${rivalWins ? "bg-blue-400" : "bg-muted-foreground/30"}`}
                  style={{ width: `${rivalPct}%` }}
                />
              </div>
            </div>
            {delta !== 0 && (
              <p className="text-xs text-center">
                <span className={delta > 0 ? "text-green-400" : "text-red-400"}>
                  {delta > 0 ? `+${delta}` : delta} advantage for {delta > 0 ? "you" : rivalEntry.teamName}
                </span>
              </p>
            )}
          </div>
        );
      })}

      <div className="pt-2 border-t border-border/50">
        <div className="flex justify-between text-xs">
          <span className={userEntry.avgOvr >= rivalEntry.avgOvr ? "text-gold font-semibold" : "text-muted-foreground"}>
            Avg OVR: {userEntry.avgOvr} (#{userEntry.rank})
          </span>
          <span className={rivalEntry.avgOvr >= userEntry.avgOvr ? "text-gold font-semibold" : "text-muted-foreground"}>
            Avg OVR: {rivalEntry.avgOvr} (#{rivalEntry.rank})
          </span>
        </div>
      </div>
    </div>
  );
}
