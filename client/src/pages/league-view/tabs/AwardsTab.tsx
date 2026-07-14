import { useQuery } from "@tanstack/react-query";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, Trophy, Award, Zap, Star } from "lucide-react";
import { gradeColorLV } from "../helpers";
import { AllTimeRecruitingLeaderboard } from "./DynastyHistoryTab";

type AwardPlayer = {
  playerName: string;
  position: string;
  overall: number;
  eligibility: string;
  teamName: string;
  abbreviation: string;
  primaryColor: string;
  avg?: string | null;
  hr?: number | null;
  rbi?: number | null;
  era?: string | null;
  strikeouts?: number | null;
} | null;

interface SeasonAwardsData {
  season: number;
  awardsAvailable: boolean;
  currentPhase?: string;
  leagueAwards?: {
    mvp: AwardPlayer;
    pitcherOfYear: AwardPlayer;
    freshmanOfYear: AwardPlayer;
  };
  conferenceChampionshipMVPs?: { conferenceName: string; mvp: AwardPlayer }[];
  cwsMVP?: AwardPlayer;
  allAmericanTeam?: { position: string; player: AwardPlayer }[];
  allFreshmanTeam?: { position: string; player: AwardPlayer }[];
  conferenceAwards?: {
    conferenceName: string;
    mvp: AwardPlayer;
    pitcherOfYear: AwardPlayer;
    allConferenceTeam: { position: string; player: AwardPlayer }[];
  }[];
  statsLeaders?: {
    topHitters: AwardPlayer[];
    topPitchers: AwardPlayer[];
  };
}

interface RecruitingLeaderEntry {
  rank: number;
  coachId: string;
  coachName: string;
  season: number;
  teamId: string | null;
  teamName: string;
  teamAbbr: string;
  primaryColor: string | null;
  recruitingScore: number | null;
  recruitingGrade: string | null;
  recruitingBreakdown: Record<string, number> | null;
  classRank: number | null;
  classStarAvg: number | null;
  totalSigned: number;
  topRecruitName: string | null;
  topRecruitOvr: number | null;
  topRecruitStars: number | null;
  careerRecruitingScore: number | null;
}

function RecruitingLeaderboardCard({ leagueId, season }: { leagueId: string; season: number }) {
  const { data, isLoading } = useQuery<{ season: number | null; leaderboard: RecruitingLeaderEntry[] }>({
    queryKey: ["/api/leagues", leagueId, "recruiting-scores", season],
    queryFn: () => fetch(`/api/leagues/${leagueId}/recruiting-scores?season=${season}`, { credentials: "include" }).then(r => r.json()),
  });

  const BREAKDOWN_LABELS: Record<string, { label: string; weight: string }> = {
    classQuality: { label: "Class Quality", weight: "20%" },
    classRank: { label: "Class Rank", weight: "15%" },
    hitRate: { label: "Hit Rate", weight: "15%" },
    starEfficiency: { label: "Star Efficiency", weight: "15%" },
    positionalBalance: { label: "Positional Balance", weight: "10%" },
    blueChipHaul: { label: "Blue Chip Haul", weight: "10%" },
    actionEfficiency: { label: "Action Efficiency", weight: "10%" },
    gemDetection: { label: "Gem Detection", weight: "5%" },
  };

  return (
    <RetroCard data-testid="recruiting-leaderboard">
      <RetroCardHeader>
        <div className="flex items-center gap-2 w-full">
          <Star className="w-4 h-4 text-gold" />
          <span>Recruiter of the Year Leaderboard</span>
          <Badge variant="outline" className="text-xs ml-auto">Season {season}</Badge>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !data || data.leaderboard.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Recruiting grades are calculated at the end of signing day.
          </p>
        ) : (
          <div className="space-y-1">
            {data.leaderboard.map((entry, i) => (
              <details key={entry.coachId} className="group" data-testid={`recruiting-leader-${i}`}>
                <summary className="flex items-center justify-between py-2 px-1 rounded cursor-pointer hover:bg-muted/20 list-none border-b border-border/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold w-5 ${i === 0 ? "text-gold" : "text-muted-foreground"}`}>
                      {i === 0 ? "★" : `#${entry.rank}`}
                    </span>
                    <span className="text-sm font-medium">{entry.coachName}</span>
                    <Badge variant="outline" className="text-xs">{entry.teamAbbr}</Badge>
                    {entry.classRank != null && (
                      <Badge variant="outline" className={`text-xs ${entry.classRank <= 3 ? "border-gold/50 text-gold" : ""}`}>
                        #{entry.classRank} class
                      </Badge>
                    )}
                    {entry.classStarAvg != null && (
                      <span className="text-xs text-yellow-400">{entry.classStarAvg.toFixed(1)}★ avg</span>
                    )}
                    {entry.topRecruitName && (
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        Top: {entry.topRecruitName}{entry.topRecruitOvr != null ? ` (${entry.topRecruitOvr})` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{entry.totalSigned} signed</span>
                    <span className={`font-bold text-xs font-semibold ${gradeColorLV(entry.recruitingGrade || "F")}`}>
                      {entry.recruitingGrade || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">{entry.recruitingScore?.toFixed(0)}</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground group-open:rotate-180 transition-transform" />
                  </div>
                </summary>
                {entry.recruitingBreakdown && (
                  <div className="px-6 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/10 rounded-b border-b border-border/20">
                    {Object.entries(BREAKDOWN_LABELS).map(([key, { label, weight }]) => (
                      <div key={key} className="text-center">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground/60">{weight}</p>
                        <p className={`text-sm font-bold ${(entry.recruitingBreakdown![key] ?? 0) >= 75 ? "text-gold" : (entry.recruitingBreakdown![key] ?? 0) >= 50 ? "text-green-400" : "text-muted-foreground"}`}>
                          {entry.recruitingBreakdown![key] ?? 0}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

export function AwardsTab({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<SeasonAwardsData>({
    queryKey: ["/api/leagues", leagueId, "season-awards"],
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!data) return null;

  if (!data.awardsAvailable) {
    const phaseLabels: Record<string, string> = {
      preseason: "Spring",
      spring_training: "Spring",
      regular_season: "Regular Season",
      dynasty_setup: "Dynasty Setup",
    };
    return (
      <RetroCard>
        <RetroCardContent>
          <div className="flex flex-col items-center justify-center py-12 gap-3" data-testid="awards-not-available">
            <Award className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-display text-sm font-bold text-muted-foreground">Awards Not Yet Available</p>
            <p className="text-xs text-muted-foreground/70 text-center max-w-md">
              Awards will be revealed after the regular season is complete.
              Current phase: {phaseLabels[data.currentPhase || ""] || data.currentPhase}
            </p>
          </div>
        </RetroCardContent>
      </RetroCard>
    );
  }

  const AwardCard = ({ title, player, icon }: { title: string; player: AwardPlayer; icon: React.ReactNode }) => {
    if (!player) return null;
    return (
      <RetroCard data-testid={`award-${title.toLowerCase().replace(/\s/g, "-")}`}>
        <div className="flex items-center gap-3">
          <div className="text-gold">{icon}</div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="font-medium text-sm">{player.playerName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span>{player.position}</span>
              <span className="text-gold font-bold">{player.overall} OVR</span>
              <Badge variant="outline" className="text-xs">{player.eligibility}</Badge>
              <span>{player.teamName}</span>
            </div>
          </div>
        </div>
      </RetroCard>
    );
  };

  const PositionTeamTable = ({ team, title }: { team: { position: string; player: AwardPlayer }[]; title: string }) => {
    if (!team || team.length === 0) return null;
    return (
      <div data-testid={`position-team-${title.toLowerCase().replace(/\s/g, "-")}`}>
        <p className="text-xs font-semibold text-muted-foreground mb-2">{title.toUpperCase()}</p>
        <div className="space-y-1">
          {team.map((entry, i) => entry.player && (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs min-w-[28px] justify-center">{entry.position}</Badge>
                <span>{entry.player.playerName}</span>
              </div>
              <div className="flex items-center gap-2 text-right">
                {entry.player.era != null && entry.player.strikeouts != null && (
                  <span className="text-xs text-muted-foreground">
                    {entry.player.era} ERA / {entry.player.strikeouts} K
                  </span>
                )}
                {entry.player.avg != null && entry.player.hr != null && entry.player.rbi != null && (
                  <span className="text-xs text-muted-foreground">
                    {entry.player.avg} / {entry.player.hr} HR / {entry.player.rbi} RBI
                  </span>
                )}
                <span className="text-gold font-bold">{entry.player.overall}</span>
                <span className="text-muted-foreground w-10 text-right">{entry.player.abbreviation}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2 w-full">
            <Award className="w-4 h-4 text-gold" />
            <span>Season {data.season} Awards</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="grid sm:grid-cols-3 gap-3">
            <AwardCard title="MVP" player={data.leagueAwards?.mvp || null} icon={<Trophy className="w-6 h-6" />} />
            <AwardCard title="Pitcher of the Year" player={data.leagueAwards?.pitcherOfYear || null} icon={<Zap className="w-6 h-6" />} />
            <AwardCard title="Freshman of the Year" player={data.leagueAwards?.freshmanOfYear || null} icon={<Star className="w-6 h-6" />} />
          </div>
        </RetroCardContent>
      </RetroCard>

      {(data.conferenceChampionshipMVPs && data.conferenceChampionshipMVPs.length > 0) && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Trophy className="w-4 h-4 text-gold" />
              <span>Conference Championship MVPs</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 gap-3">
              {data.conferenceChampionshipMVPs.map(cc => (
                <AwardCard key={cc.conferenceName} title={`${cc.conferenceName} CC MVP`} player={cc.mvp} icon={<Trophy className="w-5 h-5" />} />
              ))}
            </div>
          </RetroCardContent>
        </RetroCard>
      )}

      {data.cwsMVP && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Trophy className="w-4 h-4 text-gold" />
              <span>College World Series MVP</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <AwardCard title="CWS MVP" player={data.cwsMVP} icon={<Trophy className="w-6 h-6" />} />
          </RetroCardContent>
        </RetroCard>
      )}

      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2 w-full">
            <Star className="w-4 h-4 text-gold" />
            <span>All-American Team</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <PositionTeamTable team={data.allAmericanTeam || []} title="All-American First Team" />
        </RetroCardContent>
      </RetroCard>

      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2 w-full">
            <Star className="w-4 h-4 text-gold" />
            <span>All-Freshman Team</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <PositionTeamTable team={data.allFreshmanTeam || []} title="All-Freshman Team" />
        </RetroCardContent>
      </RetroCard>

      {data.conferenceAwards && data.conferenceAwards.length > 0 && data.conferenceAwards.map(conf => (
        <RetroCard key={conf.conferenceName}>
          <RetroCardHeader>{conf.conferenceName} Awards</RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <AwardCard title={`${conf.conferenceName} MVP`} player={conf.mvp} icon={<Trophy className="w-5 h-5" />} />
              <AwardCard title={`${conf.conferenceName} Pitcher`} player={conf.pitcherOfYear} icon={<Zap className="w-5 h-5" />} />
            </div>
            <PositionTeamTable team={conf.allConferenceTeam} title={`All-${conf.conferenceName} Team`} />
          </RetroCardContent>
        </RetroCard>
      ))}

      <div className="grid sm:grid-cols-2 gap-4">
        <RetroCard>
          <RetroCardHeader>Top Hitters</RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-1">
              {data.statsLeaders?.topHitters.map((p: any, i: number) => p && (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{i + 1}.</span>
                    <span>{p.playerName}</span>
                    <Badge variant="outline" className="text-xs">{p.position}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gold font-bold">{p.overall}</span>
                    <span className="text-muted-foreground">{p.abbreviation}</span>
                  </div>
                </div>
              ))}
            </div>
          </RetroCardContent>
        </RetroCard>
        <RetroCard>
          <RetroCardHeader>Top Pitchers</RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-1">
              {data.statsLeaders?.topPitchers.map((p: any, i: number) => p && (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{i + 1}.</span>
                    <span>{p.playerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gold font-bold">{p.overall}</span>
                    <span className="text-muted-foreground">{p.abbreviation}</span>
                  </div>
                </div>
              ))}
            </div>
          </RetroCardContent>
        </RetroCard>
      </div>

      <RecruitingLeaderboardCard leagueId={leagueId} season={data.season} />
      <AllTimeRecruitingLeaderboard leagueId={leagueId} />
    </div>
  );
}
