import { useQuery } from "@tanstack/react-query";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { BarChart, History, Trophy, Star, Crown } from "lucide-react";
import { gradeColorLV } from "../helpers";

function DynastyTrendsCard({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<{
    teamName: string;
    teamAbbreviation: string;
    prestige: number;
    facilities: number;
    seasons: { season: number; wins: number; losses: number; runsScored: number; runsAllowed: number; avgOverall: number; rosterSize: number }[];
  }>({
    queryKey: ["/api/leagues", leagueId, "dynasty-trends"],
  });

  if (isLoading) return <Skeleton className="h-48" />;
  if (!data || data.seasons.length <= 0) return null;

  const maxWins = Math.max(...data.seasons.map(s => s.wins), 1);

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-2 w-full">
          <BarChart className="w-4 h-4 text-gold" />
          <span>{data.teamName} Season Trends</span>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Win-Loss by Season</p>
            <div className="flex items-end gap-2 h-24">
              {data.seasons.map((s) => {
                const winPct = maxWins > 0 ? (s.wins / maxWins) * 100 : 0;
                return (
                  <Tooltip key={s.season}>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center flex-1 gap-1" data-testid={`trend-season-${s.season}`}>
                        <div className="w-full flex flex-col items-center justify-end h-20">
                          <div
                            className="w-full rounded-t bg-gold/70"
                            style={{ height: `${Math.max(winPct, 5)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">S{s.season}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-card border-border">
                      <p className="text-xs font-medium">Season {s.season}</p>
                      <p className="text-xs">Record: {s.wins}-{s.losses}</p>
                      <p className="text-xs">RS: {s.runsScored} | RA: {s.runsAllowed}</p>
                      <p className="text-xs">Avg OVR: {s.avgOverall}</p>
                      <p className="text-xs">Roster: {s.rosterSize}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.seasons.map(s => (
              <div key={s.season} className="text-center">
                <p className="font-pixel text-xs text-gold">S{s.season}</p>
                <p className="text-sm font-mono">{s.wins}-{s.losses}</p>
                <p className="text-xs text-muted-foreground">OVR: {s.avgOverall}</p>
              </div>
            ))}
          </div>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

interface CareerLeaderEntry {
  rank: number;
  coachId: string;
  coachName: string;
  teamId: string | null;
  teamName: string;
  teamAbbr: string;
  primaryColor: string | null;
  careerRecruitingScore: number | null;
  seasonCount: number;
  bestScore: number;
  bestGrade: string;
}

export function AllTimeRecruitingLeaderboard({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<{ careerLeaderboard: CareerLeaderEntry[] }>({
    queryKey: ["/api/leagues", leagueId, "recruiting-scores"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/recruiting-scores`, { credentials: "include" }).then(r => r.json()),
  });

  const leaders = data?.careerLeaderboard ?? [];

  return (
    <RetroCard data-testid="all-time-recruiting-leaderboard">
      <RetroCardHeader>
        <div className="flex items-center gap-2 w-full">
          <Crown className="w-4 h-4 text-gold" />
          <span>All-Time Recruiting Leaders</span>
          <Badge variant="outline" className="text-xs ml-auto">Career</Badge>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : leaders.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Career grades appear after the first signing day completes.
          </p>
        ) : (
          <div className="space-y-1">
            {leaders.map((entry, i) => (
              <div key={entry.coachId} className="flex items-center justify-between py-2 px-1 border-b border-border/20" data-testid={`all-time-leader-${i}`}>
                <div className="flex items-center gap-2">
                  <span className={`font-pixel text-xs w-5 ${i === 0 ? "text-gold" : "text-muted-foreground"}`}>
                    {i === 0 ? "★" : `#${entry.rank}`}
                  </span>
                  <span className="text-sm font-medium">{entry.coachName}</span>
                  <Badge variant="outline" className="text-xs">{entry.teamAbbr}</Badge>
                  <span className="text-xs text-muted-foreground">{entry.seasonCount} season{entry.seasonCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold font-pixel text-xs ${gradeColorLV(entry.bestGrade)}`}>
                    Best: {entry.bestGrade}
                  </span>
                  <span className="text-xs text-muted-foreground">{entry.careerRecruitingScore?.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

export function DynastyHistoryTab({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<{
    seasons: {
      season: number;
      cwsChampion: { name: string; abbreviation: string; primaryColor: string } | null;
      cwsRunnerUp: { name: string; abbreviation: string; primaryColor: string } | null;
      conferenceChampions: { name: string; abbreviation: string }[];
      teamRecords: { name: string; abbreviation: string; teamId: string; wins: number; losses: number; conferenceWins: number; conferenceLosses: number; classRank: number | null }[];
      hasCWSData: boolean;
      topClassRankings: { classRank: number; teamId: string; teamAbbr: string; teamName: string; totalCommits: number; fiveStars: number }[];
      recruiterOfYear: { coachName: string; teamName: string; teamAbbr: string; recruitingScore: number; recruitingGrade: string } | null;
    }[];
    currentSeason: number;
  }>({
    queryKey: ["/api/leagues", leagueId, "dynasty-history"],
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!data || data.seasons.length === 0) {
    return (
      <RetroCard>
        <RetroCardContent>
          <div className="text-center py-12 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-pixel text-xs text-gold mb-2">No History Yet</p>
            <p className="text-sm">Complete your first season to start building your dynasty history.</p>
          </div>
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <div className="space-y-4">
      <DynastyTrendsCard leagueId={leagueId} />

      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2 w-full">
            <History className="w-4 h-4 text-gold" />
            <span>Dynasty Timeline</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-4">
            {data.seasons.map(season => (
              <div key={season.season} className="border-b border-border/50 pb-4 last:border-0" data-testid={`history-season-${season.season}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-pixel text-gold text-xs">SEASON {season.season}</p>
                  {season.season === data.currentSeason && (
                    <Badge variant="outline" className="text-xs">Current</Badge>
                  )}
                </div>
                {season.cwsChampion && (
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-4 h-4 text-gold" />
                    <span className="text-sm font-medium">{season.cwsChampion.name}</span>
                    <span className="text-xs text-muted-foreground">CWS Champion</span>
                    {season.cwsRunnerUp && (
                      <span className="text-xs text-muted-foreground">over {season.cwsRunnerUp.name}</span>
                    )}
                  </div>
                )}
                {!season.cwsChampion && season.hasCWSData && (
                  <p className="text-xs text-muted-foreground mb-2">CWS in progress...</p>
                )}
                {season.conferenceChampions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {season.conferenceChampions.map((champ, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{champ.abbreviation} Conf Champ</Badge>
                    ))}
                  </div>
                )}
                {season.teamRecords.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs">
                    {season.teamRecords.slice(0, 8).map(team => (
                      <div key={team.teamId} className="flex items-center justify-between px-2 py-0.5">
                        <span className="text-muted-foreground">{team.abbreviation}</span>
                        <div className="flex items-center gap-1">
                          <span>{team.wins || 0}-{team.losses || 0}</span>
                          {team.classRank && team.classRank <= 3 && (
                            <Badge variant="outline" className="text-xs px-1 py-0 h-3 border-gold/50 text-gold">#{team.classRank} class</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {season.topClassRankings && season.topClassRankings.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <p className="font-pixel text-xs text-muted-foreground mb-1">TOP RECRUITING CLASSES</p>
                    <div className="flex flex-wrap gap-1">
                      {season.topClassRankings.map(cls => (
                        <div key={cls.teamId} className="flex items-center gap-1 text-xs">
                          <span className={`font-pixel text-xs ${cls.classRank === 1 ? "text-gold" : "text-muted-foreground"}`}>#{cls.classRank}</span>
                          <span className="text-foreground">{cls.teamAbbr}</span>
                          <span className="text-muted-foreground">({cls.totalCommits} commits{cls.fiveStars > 0 ? `, ${cls.fiveStars}x5★` : ""})</span>
                          {cls.classRank < season.topClassRankings.length && <span className="text-border">·</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {season.recruiterOfYear && (
                  <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2">
                    <Star className="w-3 h-3 text-gold flex-shrink-0" />
                    <span className="font-pixel text-xs text-gold">RECRUITER OF THE YEAR</span>
                    <span className="text-xs font-medium">{season.recruiterOfYear.coachName}</span>
                    <Badge variant="outline" className="text-xs">{season.recruiterOfYear.teamAbbr}</Badge>
                    <span className={`font-pixel text-xs font-bold ml-auto ${
                      season.recruiterOfYear.recruitingGrade.startsWith("A") ? "text-gold" :
                      season.recruiterOfYear.recruitingGrade.startsWith("B") ? "text-green-400" : "text-yellow-400"
                    }`}>{season.recruiterOfYear.recruitingGrade}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </RetroCardContent>
      </RetroCard>

      <AllTimeRecruitingLeaderboard leagueId={leagueId} />
    </div>
  );
}
