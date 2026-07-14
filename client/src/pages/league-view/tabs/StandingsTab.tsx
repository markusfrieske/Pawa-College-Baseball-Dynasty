import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { User, Cpu, Compass } from "lucide-react";
import type { LeagueDetails, PowerRankingEntry } from "../types";
import { getDisplayName } from "../helpers";

export function StandingsTab({ league }: { league: LeagueDetails }) {
  const { data: rankData } = useQuery<{ rankings: PowerRankingEntry[]; userTeamId: string | null }>({
    queryKey: ["/api/leagues", league.id, "power-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}/power-rankings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const leagueRankMap = new Map((rankData?.rankings ?? []).map(r => [r.teamId, r.rank]));

  // Group teams by conference and sort within each conference
  const standingsByConference = league.conferences?.map(conf => {
    const confTeams = (league.teams || [])
      .filter(t => t.conferenceId === conf.id)
      .sort((a, b) => {
        const aWins = a.standings?.wins || 0;
        const bWins = b.standings?.wins || 0;
        if (bWins !== aWins) return bWins - aWins;
        return (a.standings?.losses || 0) - (b.standings?.losses || 0);
      });
    return { ...conf, teams: confTeams };
  }) || [];

  return (
    <div className="space-y-6">
      {standingsByConference.map((conf) => (
        <RetroCard key={conf.id}>
          <RetroCardHeader>{conf.name} Standings</RetroCardHeader>
          <div className="overflow-x-auto -mx-4 px-0 sm:mx-0 sm:px-0">
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-2 w-8 sticky left-0 bg-card z-10">#</th>
                  <th className="text-left py-3 px-2 min-w-[130px] sticky left-8 bg-card z-10">Team</th>
                  <th className="text-left py-3 px-2 hidden lg:table-cell min-w-[150px]">Coach</th>
                  <th className="text-center py-3 px-2 w-10">W</th>
                  <th className="text-center py-3 px-2 w-10">L</th>
                  <th className="text-center py-3 px-2 w-16 hidden sm:table-cell">Conf</th>
                  <th className="text-center py-3 px-2 w-10 hidden md:table-cell">RS</th>
                  <th className="text-center py-3 px-2 w-10 hidden md:table-cell">RA</th>
                </tr>
              </thead>
              <tbody>
                {conf.teams.map((team, index) => (
                  <tr key={team.id} className="border-b border-border/50 hover:bg-card/50">
                    <td className="py-3 px-2 text-muted-foreground sticky left-0 bg-card z-10">{index + 1}</td>
                    <td className="py-3 px-2 sticky left-8 bg-card z-10">
                      <div className="flex items-center gap-2">
                        <TeamBadge
                          abbreviation={team.abbreviation}
                          primaryColor={team.primaryColor}
                          secondaryColor={team.secondaryColor}
                          name={team.name}
                         
                          size="sm"
                        />
                        <Link href={`/league/${league.id}/team/${team.id}/profile`}>
                          <span className="font-medium hover:text-gold cursor-pointer truncate max-w-[90px] sm:max-w-none block" data-testid={`link-team-standings-${team.id}`}>{team.name}</span>
                        </Link>
                        {leagueRankMap.has(team.id) && (
                          <span className="font-pixel text-xs text-gold/70 flex-shrink-0" data-testid={`badge-league-rank-${team.id}`}>
                            #{leagueRankMap.get(team.id)}
                          </span>
                        )}
                        {!team.isCpu && (
                          <span
                            className="hidden sm:inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gold/20 border border-gold/40 flex-shrink-0"
                            title="Human-controlled team"
                            data-testid={`badge-human-team-${team.id}`}
                          >
                            <User className="w-2 h-2 text-gold" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 hidden lg:table-cell">
                      {team.coach ? (
                        <Link href={`/league/${league.id}/team/${team.id}/profile`}>
                          <div className="flex items-center gap-2 hover:text-gold cursor-pointer">
                            {team.coach.userId ? (
                              <User className="w-3 h-3 text-gold" />
                            ) : (
                              <Cpu className="w-3 h-3 text-orange-400" />
                            )}
                            <div>
                              <span className="text-foreground hover:text-gold">{team.coach.firstName} {team.coach.lastName}</span>
                              {team.coach.userId ? (
                                team.user && (
                                  <span className="text-xs text-muted-foreground ml-1">({getDisplayName(team.user)})</span>
                                )
                              ) : (
                                <span className="text-xs text-orange-400 ml-1">(CPU)</span>
                              )}
                              {(team.coach as any).archetype && (
                                <div className="text-xs text-muted-foreground/60 mt-0.5">{(team.coach as any).archetype}</div>
                              )}
                            </div>
                          </div>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Cpu className="w-3 h-3" />
                          <span>CPU</span>
                        </div>
                      )}
                    </td>
                    <td className="text-center py-3 px-2 font-bold text-green-500">
                      {team.standings?.wins || 0}
                    </td>
                    <td className="text-center py-3 px-2 font-bold text-red-500">
                      {team.standings?.losses || 0}
                    </td>
                    <td className="text-center py-3 px-2 hidden sm:table-cell text-muted-foreground">
                      {team.standings?.conferenceWins || 0}-{team.standings?.conferenceLosses || 0}
                    </td>
                    <td className="text-center py-3 px-2 hidden md:table-cell text-muted-foreground">
                      {team.standings?.runsScored || 0}
                    </td>
                    <td className="text-center py-3 px-2 hidden md:table-cell text-muted-foreground">
                      {team.standings?.runsAllowed || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RetroCard>
      ))}
      {["regular_season", "preseason", "spring_training"].includes(league.currentPhase) && (
        <RetroCard data-testid="postseason-projection">
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Compass className="w-4 h-4 text-gold" />
              <span>Postseason Projection</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <p className="text-xs text-muted-foreground mb-3">Based on current standings, these teams would qualify for the postseason:</p>
            <div className="space-y-3">
              {standingsByConference.map(conf => {
                const topTwo = conf.teams.slice(0, 2);
                return (
                  <div key={conf.id}>
                    <p className="font-pixel text-xs text-muted-foreground mb-1">{conf.name}</p>
                    <div className="flex gap-2">
                      {topTwo.map((team, i) => (
                        <div key={team.id} className="flex items-center gap-2 text-xs">
                          <Badge variant={i === 0 ? "default" : "outline"} className={`text-xs ${i === 0 ? "bg-gold text-forest-dark" : ""}`}>
                            {i === 0 ? "1 Seed" : "2 Seed"}
                          </Badge>
                          <span>{team.name}</span>
                          <span className="text-muted-foreground">({team.standings?.wins || 0}-{team.standings?.losses || 0})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Top 2 teams per conference qualify for Conference Championships. Winners advance to Super Regionals.</p>
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
  );
}
