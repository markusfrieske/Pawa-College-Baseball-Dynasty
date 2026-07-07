import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart } from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { PlayerProfileCard } from "@/components/player-profile-card";
import type { Conference, Team, Player } from "@shared/schema";

interface BattingLeader {
  name: string; playerId: string; teamId: string; games: number; ab: number; r: number;
  h: number; doubles: number; triples: number; hr: number; rbi: number; bb: number;
  hbp: number; so: number; sb: number; avg: string; obp: string; slg: string; ops: string;
  war: string; teamAbbr: string; teamColor: string; cs: number; babip: string; wOBA: string;
  wRCplus: number; opsPlus: number; avgExitVelo: string; barrelPct: string; hardHitPct: string;
  oaa: number; drs: number; fldPct: string; fieldingErrors: number;
}

interface PitchingLeader {
  name: string; playerId: string; teamId: string; games: number; ip: number; ipDisplay: string;
  h: number; r: number; er: number; bb: number; so: number; hr: number; wins: number;
  losses: number; era: string; fip: string; whip: string; kPer9: string; bbPer9: string;
  war: string; teamAbbr: string; teamColor: string; kPct: string; bbPct: string;
  whiffRate: string; siera: string; avgSpinRate: number; totalPitches: number;
}

interface TeamStatEntry {
  teamId: string; teamName: string; teamAbbr: string; teamColor: string;
  games: number; runsScored: number; runsAllowed: number; hits: number; hitsAllowed: number;
  totalAB: number; totalBB: number; totalSO: number; totalHR: number; totalDoubles: number;
  totalTriples: number; totalHBP: number; totalSB: number; errors: number;
  battingAvg: string; obp: string; slg: string; ops: string; rpg: string; rapg: string;
}

interface StatsData {
  season: number;
  battingLeaders: BattingLeader[];
  pitchingLeaders: PitchingLeader[];
  teamStats: TeamStatEntry[];
  totalGames: number;
}

export default function StatsPage() {
  const { id } = useParams<{ id: string }>();
  const leagueId = id!;

  const { data: teamsData } = useQuery<Team[]>({
    queryKey: ["/api/leagues", leagueId, "teams"],
  });
  const { data: conferencesData } = useQuery<Conference[]>({
    queryKey: ["/api/leagues", leagueId, "conferences"],
  });
  const { data: leagueData } = useQuery<{ currentSeason: number }>({
    queryKey: ["/api/leagues", leagueId],
  });

  const teams = teamsData ?? [];
  const conferences = conferencesData ?? [];
  const currentSeason = leagueData?.currentSeason ?? 1;

  const [view, setView] = useState<"team" | "batting" | "pitching">("team");
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedStatsPlayerId, setSelectedStatsPlayerId] = useState<string | null>(null);
  const [selectedConference, setSelectedConference] = useState<string>("all");
  const [battingSort, setBattingSort] = useState<"avg" | "ops" | "hr" | "rbi" | "war" | "wOBA" | "wRCplus" | "opsPlus" | "babip" | "exitVelo" | "barrelPct" | "oaa" | "fldPct">("avg");
  const [pitchingSort, setPitchingSort] = useState<"era" | "fip" | "so" | "whip" | "war" | "siera" | "kPct" | "whiffRate" | "spinRate">("era");
  const [battingView, setBattingView] = useState<"traditional" | "advanced" | "statcast" | "defense">("traditional");
  const [pitchingView, setPitchingView] = useState<"traditional" | "advanced">("traditional");

  const { data: statsPlayerData } = useQuery<Player>({
    queryKey: ["/api/leagues", leagueId, "players", selectedStatsPlayerId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/players/${selectedStatsPlayerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!selectedStatsPlayerId,
  });

  const seasonParam = selectedSeason ? `?season=${selectedSeason}` : "";
  const { data, isLoading, isError, error, refetch } = useQuery<StatsData>({
    queryKey: ["/api/leagues", leagueId, "stats", selectedSeason || "latest"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/stats${seasonParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const conferenceTeamIds = selectedConference !== "all"
    ? new Set(teams.filter(t => t.conferenceId === selectedConference).map(t => t.id))
    : null;

  const sortedBatters = data ? [...(data.battingLeaders ?? [])]
    .filter(b => !conferenceTeamIds || conferenceTeamIds.has(b.teamId))
    .sort((a, b) => {
      if (battingSort === "avg") return parseFloat(b.avg) - parseFloat(a.avg);
      if (battingSort === "ops") return parseFloat(b.ops) - parseFloat(a.ops);
      if (battingSort === "hr") return b.hr - a.hr;
      if (battingSort === "rbi") return b.rbi - a.rbi;
      if (battingSort === "war") return parseFloat(b.war) - parseFloat(a.war);
      if (battingSort === "wOBA") return parseFloat(b.wOBA) - parseFloat(a.wOBA);
      if (battingSort === "wRCplus") return b.wRCplus - a.wRCplus;
      if (battingSort === "opsPlus") return b.opsPlus - a.opsPlus;
      if (battingSort === "babip") return parseFloat(b.babip) - parseFloat(a.babip);
      if (battingSort === "exitVelo") return parseFloat(b.avgExitVelo) - parseFloat(a.avgExitVelo);
      if (battingSort === "barrelPct") return parseFloat(b.barrelPct) - parseFloat(a.barrelPct);
      if (battingSort === "oaa") return b.oaa - a.oaa;
      if (battingSort === "fldPct") return parseFloat(b.fldPct) - parseFloat(a.fldPct);
      return 0;
    }).slice(0, 25) : [];

  const sortedPitchers = data ? [...(data.pitchingLeaders ?? [])]
    .filter(p => !conferenceTeamIds || conferenceTeamIds.has(p.teamId))
    .sort((a, b) => {
      if (pitchingSort === "era") return parseFloat(a.era) - parseFloat(b.era);
      if (pitchingSort === "fip") return parseFloat(a.fip) - parseFloat(b.fip);
      if (pitchingSort === "so") return b.so - a.so;
      if (pitchingSort === "whip") return parseFloat(a.whip) - parseFloat(b.whip);
      if (pitchingSort === "war") return parseFloat(b.war) - parseFloat(a.war);
      if (pitchingSort === "siera") return parseFloat(a.siera) - parseFloat(b.siera);
      if (pitchingSort === "kPct") return parseFloat(b.kPct) - parseFloat(a.kPct);
      if (pitchingSort === "whiffRate") return parseFloat(b.whiffRate) - parseFloat(a.whiffRate);
      if (pitchingSort === "spinRate") return b.avgSpinRate - a.avgSpinRate;
      return 0;
    }).slice(0, 25) : [];

  const filteredTeamStats = data
    ? (conferenceTeamIds ? (data.teamStats ?? []).filter(ts => conferenceTeamIds.has(ts.teamId)) : (data.teamStats ?? []))
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/league/${leagueId}`}>
            <RetroButton variant="outline" size="sm" data-testid="button-back">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              League
            </RetroButton>
          </Link>
          <div>
            <h1 className="font-pixel text-gold text-sm sm:text-base">Season Stats</h1>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 bg-card" />
            <Skeleton className="h-64 bg-card" />
          </div>
        )}

        {!isLoading && isError && (
          <QueryError error={error} onRetry={refetch} />
        )}

        {!isLoading && (!data || data.totalGames === 0) && (
          <RetroCard variant="bordered">
            <RetroCardContent className="py-12 text-center">
              <BarChart className="w-8 h-8 text-gold mx-auto mb-3" />
              <p className="font-pixel text-gold text-xs mb-2">No Stats Available</p>
              <p className="text-sm text-muted-foreground">Stats will appear after games have been played.</p>
            </RetroCardContent>
          </RetroCard>
        )}

        {!isLoading && data && data.totalGames > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <BarChart className="w-5 h-5 text-gold" />
              <span className="font-pixel text-gold text-xs">Season {data.season} Stats</span>
              <span className="text-xs text-muted-foreground">({data.totalGames} games played)</span>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                {conferences.length > 1 && (
                  <select
                    value={selectedConference}
                    onChange={e => setSelectedConference(e.target.value)}
                    className="bg-card border border-border text-xs text-foreground px-2 py-1 rounded font-pixel"
                    style={{ fontSize: "9px" }}
                    data-testid="conference-filter"
                  >
                    <option value="all">All Conferences</option>
                    {conferences.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {currentSeason > 1 && (
                  <select
                    value={selectedSeason ?? data.season}
                    onChange={e => setSelectedSeason(parseInt(e.target.value))}
                    className="bg-card border border-border text-xs text-foreground px-2 py-1 rounded font-pixel"
                    style={{ fontSize: "9px" }}
                    data-testid="season-selector"
                  >
                    {Array.from({ length: currentSeason }, (_, i) => currentSeason - i).map(s => (
                      <option key={s} value={s} data-testid={`season-select-${s}`}>Season {s}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {(["team", "batting", "pitching"] as const).map(v => (
                <RetroButton
                  key={v}
                  variant={view === v ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setView(v)}
                  data-testid={`stats-view-${v}`}
                >
                  {v === "team" ? "Team" : v === "batting" ? "Batting" : "Pitching"}
                </RetroButton>
              ))}
            </div>

            {view === "team" && (
              <RetroCard variant="bordered">
                <RetroCardHeader>
                  <span className="font-pixel text-xs text-gold">Team Statistics</span>
                </RetroCardHeader>
                <RetroCardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-team-stats">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="py-2 px-2 font-pixel text-[8px] text-gold">Team</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">G</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">AVG</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">OBP</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">SLG</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">OPS</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">R</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">HR</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">SB</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">RPG</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">RAPG</th>
                          <th className="py-2 px-2 font-pixel text-[8px] text-muted-foreground text-center">E</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTeamStats.map((ts, idx) => (
                          <tr key={ts.teamId} className={`border-b border-border/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`} data-testid={`row-team-stats-${ts.teamAbbr}`}>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: ts.teamColor }} />
                                <span className="font-pixel text-[8px]">{ts.teamAbbr}</span>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center text-xs">{ts.games}</td>
                            <td className="py-2 px-2 text-center text-xs font-medium text-gold">{ts.battingAvg}</td>
                            <td className="py-2 px-2 text-center text-xs">{ts.obp}</td>
                            <td className="py-2 px-2 text-center text-xs">{ts.slg}</td>
                            <td className="py-2 px-2 text-center text-xs font-medium">{ts.ops}</td>
                            <td className="py-2 px-2 text-center text-xs">{ts.runsScored}</td>
                            <td className="py-2 px-2 text-center text-xs">{ts.totalHR}</td>
                            <td className="py-2 px-2 text-center text-xs">{ts.totalSB}</td>
                            <td className="py-2 px-2 text-center text-xs">{ts.rpg}</td>
                            <td className="py-2 px-2 text-center text-xs">{ts.rapg}</td>
                            <td className="py-2 px-2 text-center text-xs">{ts.errors}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </RetroCardContent>
              </RetroCard>
            )}

            {view === "batting" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">View:</span>
                  {(["traditional", "advanced", "statcast", "defense"] as const).map(v => (
                    <RetroButton key={v} variant={battingView === v ? "primary" : "outline"} size="sm" onClick={() => setBattingView(v)} data-testid={`batting-view-${v}`}>
                      {v === "traditional" ? "Traditional" : v === "advanced" ? "Advanced" : v === "statcast" ? "Statcast" : "Defense"}
                    </RetroButton>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Sort by:</span>
                  {battingView === "traditional" && (["avg", "ops", "hr", "rbi", "war"] as const).map(s => (
                    <RetroButton key={s} variant={battingSort === s ? "primary" : "outline"} size="sm" onClick={() => setBattingSort(s)} data-testid={`batting-sort-${s}`}>
                      {s.toUpperCase()}
                    </RetroButton>
                  ))}
                  {battingView === "advanced" && (["wOBA", "wRCplus", "opsPlus", "babip", "war"] as const).map(s => (
                    <RetroButton key={s} variant={battingSort === s ? "primary" : "outline"} size="sm" onClick={() => setBattingSort(s)} data-testid={`batting-sort-${s}`}>
                      {s === "wRCplus" ? "wRC+" : s === "opsPlus" ? "OPS+" : s === "wOBA" ? "wOBA" : s.toUpperCase()}
                    </RetroButton>
                  ))}
                  {battingView === "statcast" && (["exitVelo", "barrelPct", "ops"] as const).map(s => (
                    <RetroButton key={s} variant={battingSort === s ? "primary" : "outline"} size="sm" onClick={() => setBattingSort(s)} data-testid={`batting-sort-${s}`}>
                      {s === "exitVelo" ? "Exit Velo" : s === "barrelPct" ? "Barrel%" : s.toUpperCase()}
                    </RetroButton>
                  ))}
                  {battingView === "defense" && (["oaa", "fldPct"] as const).map(s => (
                    <RetroButton key={s} variant={battingSort === s ? "primary" : "outline"} size="sm" onClick={() => setBattingSort(s)} data-testid={`batting-sort-${s}`}>
                      {s === "oaa" ? "OAA" : "FLD%"}
                    </RetroButton>
                  ))}
                </div>
                <RetroCard variant="bordered">
                  <RetroCardHeader>
                    <span className="font-pixel text-xs text-gold">
                      {battingView === "traditional" ? "Batting Leaders" : battingView === "advanced" ? "Advanced Batting" : battingView === "statcast" ? "Statcast Batting" : "Defensive Leaders"} (min 10 AB)
                    </span>
                  </RetroCardHeader>
                  <RetroCardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="table-batting-leaders">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center w-6">#</th>
                            <th className="py-2 px-1 font-pixel text-[8px] text-gold">Player</th>
                            <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground">Team</th>
                            <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">G</th>
                            {battingView === "traditional" && <>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">AB</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">AVG</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">OBP</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">SLG</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">OPS</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">H</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">HR</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">RBI</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">SB</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">WAR</th>
                            </>}
                            {battingView === "advanced" && <>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">wOBA</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">wRC+</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">OPS+</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">BABIP</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">OPS</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">BB</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">SO</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">WAR</th>
                            </>}
                            {battingView === "statcast" && <>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">Avg EV</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">Barrel%</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">HardHit%</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">AVG</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">SLG</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">HR</th>
                            </>}
                            {battingView === "defense" && <>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">FLD%</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">OAA</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">DRS</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">E</th>
                            </>}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedBatters.map((b, idx) => (
                            <tr key={`${b.name}-${b.teamId}`} className={`border-b border-border/30 ${idx % 2 === 0 ? "" : "bg-muted/10"} ${b.playerId ? "cursor-pointer hover:bg-gold/5" : ""}`} data-testid={`row-batter-${idx}`} onClick={() => b.playerId && setSelectedStatsPlayerId(b.playerId)}>
                              <td className="py-2 px-1 text-center text-xs text-muted-foreground">{idx + 1}</td>
                              <td className="py-2 px-1 text-xs font-medium">{b.name}</td>
                              <td className="py-2 px-1">
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: b.teamColor }} />
                                  <span className="font-pixel text-[7px]">{b.teamAbbr}</span>
                                </div>
                              </td>
                              <td className="py-2 px-1 text-center text-xs">{b.games}</td>
                              {battingView === "traditional" && <>
                                <td className="py-2 px-1 text-center text-xs">{b.ab}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{b.avg}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.obp}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.slg}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium">{b.ops}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.h}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.hr}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.rbi}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.sb}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{b.war}</td>
                              </>}
                              {battingView === "advanced" && <>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{b.wOBA}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium">{b.wRCplus}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium">{b.opsPlus}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.babip}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.ops}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.bb}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.so}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{b.war}</td>
                              </>}
                              {battingView === "statcast" && <>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{b.avgExitVelo}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium">{b.barrelPct}%</td>
                                <td className="py-2 px-1 text-center text-xs">{b.hardHitPct}%</td>
                                <td className="py-2 px-1 text-center text-xs">{b.avg}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.slg}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.hr}</td>
                              </>}
                              {battingView === "defense" && <>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{b.fldPct}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium">{b.oaa}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.drs}</td>
                                <td className="py-2 px-1 text-center text-xs">{b.fieldingErrors || 0}</td>
                              </>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </div>
            )}

            {view === "pitching" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">View:</span>
                  {(["traditional", "advanced"] as const).map(v => (
                    <RetroButton key={v} variant={pitchingView === v ? "primary" : "outline"} size="sm" onClick={() => setPitchingView(v)} data-testid={`pitching-view-${v}`}>
                      {v === "traditional" ? "Traditional" : "Advanced"}
                    </RetroButton>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Sort by:</span>
                  {pitchingView === "traditional" && (["era", "fip", "so", "whip", "war"] as const).map(s => (
                    <RetroButton key={s} variant={pitchingSort === s ? "primary" : "outline"} size="sm" onClick={() => setPitchingSort(s)} data-testid={`pitching-sort-${s}`}>
                      {s.toUpperCase()}
                    </RetroButton>
                  ))}
                  {pitchingView === "advanced" && (["siera", "kPct", "whiffRate", "spinRate", "war"] as const).map(s => (
                    <RetroButton key={s} variant={pitchingSort === s ? "primary" : "outline"} size="sm" onClick={() => setPitchingSort(s)} data-testid={`pitching-sort-${s}`}>
                      {s === "kPct" ? "K%" : s === "whiffRate" ? "Whiff%" : s === "spinRate" ? "Spin Rate" : s.toUpperCase()}
                    </RetroButton>
                  ))}
                </div>
                <RetroCard variant="bordered">
                  <RetroCardHeader>
                    <span className="font-pixel text-xs text-gold">
                      {pitchingView === "traditional" ? "Pitching Leaders" : "Advanced Pitching"} (min 3 IP)
                    </span>
                  </RetroCardHeader>
                  <RetroCardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="table-pitching-leaders">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center w-6">#</th>
                            <th className="py-2 px-1 font-pixel text-[8px] text-gold">Player</th>
                            <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground">Team</th>
                            {pitchingView === "traditional" && <>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">W</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">L</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">ERA</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">FIP</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">IP</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">H</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">BB</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">SO</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">WHIP</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">WAR</th>
                            </>}
                            {pitchingView === "advanced" && <>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">SIERA</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">K%</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">BB%</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">Whiff%</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">Spin</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">ERA</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">FIP</th>
                              <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">WAR</th>
                            </>}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedPitchers.map((p, idx) => (
                            <tr key={`${p.name}-${p.teamId}`} className={`border-b border-border/30 ${idx % 2 === 0 ? "" : "bg-muted/10"} ${p.playerId ? "cursor-pointer hover:bg-gold/5" : ""}`} data-testid={`row-pitcher-${idx}`} onClick={() => p.playerId && setSelectedStatsPlayerId(p.playerId)}>
                              <td className="py-2 px-1 text-center text-xs text-muted-foreground">{idx + 1}</td>
                              <td className="py-2 px-1 text-xs font-medium">{p.name}</td>
                              <td className="py-2 px-1">
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.teamColor }} />
                                  <span className="font-pixel text-[7px]">{p.teamAbbr}</span>
                                </div>
                              </td>
                              {pitchingView === "traditional" && <>
                                <td className="py-2 px-1 text-center text-xs">{p.wins}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.losses}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{p.era}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.fip}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.ipDisplay}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.h}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.bb}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.so}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.whip}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{p.war}</td>
                              </>}
                              {pitchingView === "advanced" && <>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{p.siera}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.kPct}%</td>
                                <td className="py-2 px-1 text-center text-xs">{p.bbPct}%</td>
                                <td className="py-2 px-1 text-center text-xs">{p.whiffRate}%</td>
                                <td className="py-2 px-1 text-center text-xs">{p.avgSpinRate}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.era}</td>
                                <td className="py-2 px-1 text-center text-xs">{p.fip}</td>
                                <td className="py-2 px-1 text-center text-xs font-medium text-gold">{p.war}</td>
                              </>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </div>
            )}
          </div>
        )}

        {statsPlayerData && (
          <PlayerProfileCard
            player={statsPlayerData}
            open={!!selectedStatsPlayerId}
            onClose={() => setSelectedStatsPlayerId(null)}
            leagueId={leagueId}
          />
        )}
      </div>
    </div>
  );
}
