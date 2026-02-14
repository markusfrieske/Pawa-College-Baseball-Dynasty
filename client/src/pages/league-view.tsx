import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useUpdateMusicPhase } from "@/lib/music-context";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Trophy, 
  Users, 
  Target, 
  Calendar, 
  Settings,
  Play,
  ChevronRight,
  Newspaper,
  Plus,
  Pin,
  Award,
  Image as ImageIcon,
  X,
  Building2,
  Check,
  Clock,
  Bell,
  TrendingUp,
  Star,
  Zap,
  History,
  BarChart,
  ScrollText,
  Compass,
  UserMinus,
  UserPlus
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { League, Team, Conference, Standings, DynastyNews } from "@shared/schema";
import { User, Cpu } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import addieFriskImg from "@/assets/images/addie-frisk.png";
import sullyPumpImg from "@/assets/images/sully-pump.png";
import { StoryEngineHub } from "@/components/story-engine-hub";

interface TeamWithCoach extends Team {
  standings?: Standings;
  coach?: {
    id: string;
    firstName: string;
    lastName: string;
    userId: string;
  } | null;
  user?: {
    email: string;
    username?: string | null;
  } | null;
}

// Helper to get display name from user email/username
function getDisplayName(user?: { email: string; username?: string | null } | null): string {
  if (!user) return "";
  if (user.username) return user.username;
  const emailPrefix = user.email.split("@")[0];
  // For guest accounts, show shortened version
  if (emailPrefix.startsWith("guest-")) {
    return "Guest";
  }
  return emailPrefix;
}

interface LeagueDetails extends League {
  teams: TeamWithCoach[];
  conferences: Conference[];
}

export default function LeagueViewPage() {
  const { id } = useParams<{ id: string }>();
  const updateMusicPhase = useUpdateMusicPhase();
  const [showRecap, setShowRecap] = useState(false);
  const [recapSeason, setRecapSeason] = useState(1);

  const { data: league, isLoading } = useQuery<LeagueDetails>({
    queryKey: ["/api/leagues", id],
  });

  useEffect(() => {
    if (league?.currentPhase) {
      updateMusicPhase(league.currentPhase);
    }
  }, [league?.currentPhase, updateMusicPhase]);

  if (isLoading) {
    return <LeagueViewSkeleton />;
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-8">
          <h2 className="font-pixel text-gold text-sm mb-4">Dynasty Not Found</h2>
          <Link href="/dashboard">
            <RetroButton>Back to Dashboard</RetroButton>
          </Link>
        </RetroCard>
      </div>
    );
  }

  const userTeam = league.teams?.find(t => !t.isCpu);

  if (league.currentPhase === "dynasty_setup" || (!league.teams || league.teams.length === 0)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-8 max-w-md">
          <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
          <h2 className="font-pixel text-gold text-sm mb-2">Dynasty Setup Incomplete</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This dynasty still needs teams selected. Continue setup to pick your team and add CPU opponents.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href={`/league/${id}/team-selection`}>
              <RetroButton data-testid="button-resume-setup">Resume Setup</RetroButton>
            </Link>
            <Link href="/dashboard">
              <RetroButton variant="outline" data-testid="button-back-dashboard">Back to Dashboard</RetroButton>
            </Link>
          </div>
        </RetroCard>
      </div>
    );
  }

  const phaseLabels: Record<string, string> = {
    dynasty_setup: "Dynasty Setup",
    preseason: "Spring Training",
    spring_training: "Spring Training",
    regular_season: "Regular Season",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason: "Offseason",
    offseason_departures: "Players Leaving",
    offseason_recruiting_1: "Offseason Recruiting (Week 1)",
    offseason_recruiting_2: "Offseason Recruiting (Week 2)",
    offseason_recruiting_3: "Offseason Recruiting (Week 3)",
    offseason_recruiting_4: "Offseason Recruiting (Week 4)",
    offseason_signing_day: "Signing Day",
    offseason_walkons: "Cuts & Walk-Ons",
  };

  const canShowRecap = league.currentSeason >= 1;
  const isOffseason = league.currentPhase.startsWith("offseason");
  const recapSeasonNum = isOffseason && league.currentSeason > 1 ? league.currentSeason - 1 : league.currentSeason;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3 min-w-0">
            <Link href="/dashboard" className="text-muted-foreground hover:text-gold transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-base sm:text-lg truncate">{league.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 shrink-0">
              <Calendar className="w-3.5 h-3.5" />
              <span>S{league.currentSeason} W{league.currentWeek}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0" data-testid="text-current-phase">
              <Trophy className="w-3.5 h-3.5 text-gold" />
              <Badge variant="outline" className="font-pixel text-[7px] sm:text-[8px] text-gold border-gold/40 bg-gold/10 whitespace-nowrap">
                {phaseLabels[league.currentPhase]}
              </Badge>
            </div>
            {userTeam?.standings && (
              <div className="flex items-center gap-1.5 shrink-0" data-testid="text-user-team-record">
                <span className="text-gold font-medium">
                  {userTeam.name}: {userTeam.standings.wins ?? 0}-{userTeam.standings.losses ?? 0}
                </span>
              </div>
            )}
            {canShowRecap && (
              <button
                onClick={() => { setRecapSeason(recapSeasonNum); setShowRecap(true); }}
                className="flex items-center gap-1 text-gold/70 hover:text-gold transition-colors shrink-0"
                data-testid="button-season-recap"
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span className="text-[10px]">Recap</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <Users className="w-3.5 h-3.5" />
              <span>{league.teams?.length || 0}/{league.maxTeams} Teams</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-2">
            <NotificationCenter leagueId={id!} />
            <ReadyButton leagueId={id} />
          </div>
          
          <SeasonProgressBar phase={league.currentPhase} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <PhaseGuidanceBanner phase={league.currentPhase} leagueId={id!} />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-6">
          <QuickActionCard
            href={`/league/${id}/coach`}
            icon={<Award className="w-6 h-6" />}
            title="Coach"
            subtitle="View your career"
          />
          <QuickActionCard
            href={`/league/${id}/team/${userTeam?.id || ''}`}
            icon={<Building2 className="w-6 h-6" />}
            title="School"
            subtitle="Your program"
          />
          <QuickActionCard
            href={`/league/${id}/roster`}
            icon={<Users className="w-6 h-6" />}
            title="Roster"
            subtitle="Manage your team"
          />
          <QuickActionCard
            href={`/league/${id}/schedule`}
            icon={<Calendar className="w-6 h-6" />}
            title="Schedule"
            subtitle="View games"
          />
          <QuickActionCard
            href={`/league/${id}/recruiting`}
            icon={<Target className="w-6 h-6" />}
            title="Recruiting"
            subtitle="Scout players"
          />
          <QuickActionCard
            href={`/league/${id}/commits`}
            icon={<Trophy className="w-6 h-6" />}
            title="Commits"
            subtitle="Class leaderboard"
          />
          <QuickActionCard
            href={`/league/${id}/commissioner`}
            icon={<Settings className="w-6 h-6" />}
            title="Commissioner"
            subtitle="Dynasty settings"
          />
        </div>

        <OffseasonSummary league={league} />

        <Tabs defaultValue="news" className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
            <TabsList className="bg-card border border-border inline-flex w-auto gap-0">
              <TabsTrigger value="news" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-news">
                News
              </TabsTrigger>
              <TabsTrigger value="standings" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-standings">
                Stand
              </TabsTrigger>
              <TabsTrigger value="teams" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-teams">
                Teams
              </TabsTrigger>
              <TabsTrigger value="rankings" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-rankings">
                Rank
              </TabsTrigger>
              <TabsTrigger value="stats" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-stats">
                Stats
              </TabsTrigger>
              <TabsTrigger value="postseason" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-postseason">
                Post
              </TabsTrigger>
              <TabsTrigger value="awards" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-awards">
                Award
              </TabsTrigger>
              <TabsTrigger value="history" className="font-pixel text-[8px] whitespace-nowrap px-2.5 sm:px-3 data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-history">
                Hist
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="standings">
            <StandingsTab league={league} />
          </TabsContent>

          <TabsContent value="teams">
            <TeamsTab league={league} />
          </TabsContent>

          <TabsContent value="rankings">
            <RankingsTab league={league} />
          </TabsContent>

          <TabsContent value="news">
            <StoryEngineHub leagueId={league.id} teamId={userTeam?.id} />
          </TabsContent>

          <TabsContent value="stats">
            <StatsTab leagueId={league.id} currentSeason={league.currentSeason} />
          </TabsContent>

          <TabsContent value="postseason">
            <PostseasonTab leagueId={league.id} />
          </TabsContent>

          <TabsContent value="awards">
            <AwardsTab leagueId={league.id} />
          </TabsContent>

          <TabsContent value="history">
            <DynastyHistoryTab leagueId={league.id} />
          </TabsContent>
        </Tabs>
      </main>

      <SeasonRecapDialog
        leagueId={league.id}
        season={recapSeason}
        open={showRecap}
        onClose={() => setShowRecap(false)}
      />
    </div>
  );
}

function QuickActionCard({ 
  href, 
  icon, 
  title, 
  subtitle 
}: { 
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href}>
      <RetroCard className="hover:border-gold/50 transition-colors cursor-pointer h-full" data-testid={`card-action-${title.toLowerCase()}`}>
        <div className="flex flex-col items-center text-center gap-1 py-1">
          <div className="text-gold">{icon}</div>
          <h3 className="font-pixel text-[9px] text-foreground leading-tight">{title}</h3>
          <p className="text-[8px] text-muted-foreground leading-tight hidden sm:block">{subtitle}</p>
        </div>
      </RetroCard>
    </Link>
  );
}

function StandingsTab({ league }: { league: LeagueDetails }) {
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-2 w-10">#</th>
                  <th className="text-left py-3 px-2 min-w-[150px]">Team</th>
                  <th className="text-left py-3 px-2 hidden lg:table-cell min-w-[150px]">Coach</th>
                  <th className="text-center py-3 px-2 w-12">W</th>
                  <th className="text-center py-3 px-2 w-12">L</th>
                  <th className="text-center py-3 px-2 w-16 hidden sm:table-cell">Conf</th>
                  <th className="text-center py-3 px-2 w-12 hidden md:table-cell">RS</th>
                  <th className="text-center py-3 px-2 w-12 hidden md:table-cell">RA</th>
                </tr>
              </thead>
              <tbody>
                {conf.teams.map((team, index) => (
                  <tr key={team.id} className="border-b border-border/50 hover:bg-card/50">
                    <td className="py-3 px-2 text-muted-foreground">{index + 1}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-3">
                        <TeamBadge
                          abbreviation={team.abbreviation}
                          primaryColor={team.primaryColor}
                          secondaryColor={team.secondaryColor}
                          size="sm"
                        />
                        <Link href={`/league/${league.id}/team/${team.id}`}>
                          <span className="font-medium hover:text-gold cursor-pointer" data-testid={`link-team-standings-${team.id}`}>{team.name}</span>
                        </Link>
                      </div>
                    </td>
                    <td className="py-3 px-2 hidden lg:table-cell">
                      {team.coach ? (
                        <Link href={`/league/${league.id}/coach/${team.coach.id}`}>
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
                    <p className="font-pixel text-[9px] text-muted-foreground mb-1">{conf.name}</p>
                    <div className="flex gap-2">
                      {topTwo.map((team, i) => (
                        <div key={team.id} className="flex items-center gap-2 text-xs">
                          <Badge variant={i === 0 ? "default" : "outline"} className={`text-[8px] ${i === 0 ? "bg-gold text-forest-dark" : ""}`}>
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
            <p className="text-[9px] text-muted-foreground mt-3">Top 2 teams per conference qualify for Conference Championships. Winners advance to Super Regionals.</p>
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
  );
}

function TeamsTab({ league }: { league: LeagueDetails }) {
  const [compareTeamA, setCompareTeamA] = useState("");
  const [compareTeamB, setCompareTeamB] = useState("");
  const [showCompare, setShowCompare] = useState(false);

  const teamsByConference = league.conferences?.map(conf => ({
    ...conf,
    teams: league.teams?.filter(t => t.conferenceId === conf.id) || [],
  })) || [];

  const allTeams = league.teams || [];

  return (
    <div className="space-y-6">
      <RetroCard>
        <RetroCardHeader className="flex items-center justify-between gap-4">
          <span>Compare Teams</span>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Team A</label>
              <select
                value={compareTeamA}
                onChange={(e) => setCompareTeamA(e.target.value)}
                className="bg-muted border border-border rounded px-3 py-2 text-sm"
                data-testid="select-compare-team-a"
              >
                <option value="">Select team...</option>
                {allTeams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <span className="text-muted-foreground text-sm pb-2">vs</span>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Team B</label>
              <select
                value={compareTeamB}
                onChange={(e) => setCompareTeamB(e.target.value)}
                className="bg-muted border border-border rounded px-3 py-2 text-sm"
                data-testid="select-compare-team-b"
              >
                <option value="">Select team...</option>
                {allTeams.filter(t => t.id !== compareTeamA).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <RetroButton
              size="sm"
              disabled={!compareTeamA || !compareTeamB}
              onClick={() => setShowCompare(true)}
              data-testid="button-compare-teams"
            >
              Compare
            </RetroButton>
          </div>
        </RetroCardContent>
      </RetroCard>

      <TeamCompareDialog
        leagueId={league.id}
        teamAId={compareTeamA}
        teamBId={compareTeamB}
        open={showCompare}
        onClose={() => setShowCompare(false)}
      />

      {teamsByConference.map((conf) => (
        <RetroCard key={conf.id}>
          <RetroCardHeader>{conf.name}</RetroCardHeader>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {conf.teams.map((team) => (
              <Link key={team.id} href={`/league/${league.id}/team/${team.id}`}>
                <div className="bg-muted/30 p-4 rounded hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`card-team-${team.id}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <TeamBadge
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      secondaryColor={team.secondaryColor}
                    />
                    <div>
                      <p className="font-medium text-foreground">{team.name}</p>
                      <p className="text-xs text-muted-foreground">{team.mascot}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs mb-2">
                    {team.coach ? (
                      <>
                        <User className="w-3 h-3 text-gold" />
                        <span className="text-foreground">{team.coach.firstName} {team.coach.lastName}</span>
                        {team.user && (
                          <span className="text-muted-foreground">({team.user.email.split("@")[0]})</span>
                        )}
                      </>
                    ) : (
                      <>
                        <Cpu className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">CPU Controlled</span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Prestige</span>
                    <StarRating rating={Math.ceil(team.prestige / 2)} size="sm" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </RetroCard>
      ))}
    </div>
  );
}

function RankingsTab({ league }: { league: LeagueDetails }) {
  // Calculate team ratings based on attributes (F to A+)
  const getLetterGrade = (value: number): string => {
    if (value >= 9) return "A+";
    if (value >= 8) return "A";
    if (value >= 7) return "B+";
    if (value >= 6) return "B";
    if (value >= 5) return "C+";
    if (value >= 4) return "C";
    if (value >= 3) return "D+";
    if (value >= 2) return "D";
    return "F";
  };

  const getGradeColor = (grade: string): string => {
    if (grade.startsWith("A")) return "text-green-400";
    if (grade.startsWith("B")) return "text-blue-400";
    if (grade.startsWith("C")) return "text-yellow-400";
    if (grade.startsWith("D")) return "text-orange-400";
    return "text-red-400";
  };

  const teamsWithRatings = [...(league.teams || [])].map(team => {
    const overall = Math.round((team.prestige + team.facilities + (team.stadium || 5)) / 3);
    const fielding = Math.round((team.facilities + (team.stadium || 5)) / 2);
    const pitching = Math.round((team.prestige + team.facilities) / 2);
    return {
      ...team,
      overallGrade: getLetterGrade(overall),
      fieldingGrade: getLetterGrade(fielding),
      pitchingGrade: getLetterGrade(pitching),
      sortValue: overall,
    };
  }).sort((a, b) => b.sortValue - a.sortValue);

  return (
    <RetroCard>
      <RetroCardHeader>Team Power Rankings</RetroCardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-3 px-2">#</th>
              <th className="text-left py-3 px-2">Team</th>
              <th className="text-center py-3 px-2">OVR</th>
              <th className="text-center py-3 px-2">FIELD</th>
              <th className="text-center py-3 px-2">PITCH</th>
              <th className="text-center py-3 px-2 hidden sm:table-cell">Prestige</th>
            </tr>
          </thead>
          <tbody>
            {teamsWithRatings.map((team, index) => (
              <tr key={team.id} className="border-b border-border/50 hover:bg-card/50">
                <td className="py-3 px-2">
                  <span className="font-pixel text-gold text-sm">#{index + 1}</span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-3">
                    <TeamBadge
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      secondaryColor={team.secondaryColor}
                      size="sm"
                    />
                    <div>
                      <Link href={`/league/${league.id}/team/${team.id}`}>
                        <span className="font-medium hover:text-gold cursor-pointer" data-testid={`link-team-rankings-${team.id}`}>{team.name}</span>
                      </Link>
                      <p className="text-xs text-muted-foreground hidden sm:block">{team.mascot}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-2 text-center">
                  <span className={`font-bold ${getGradeColor(team.overallGrade)}`}>
                    {team.overallGrade}
                  </span>
                </td>
                <td className="py-3 px-2 text-center">
                  <span className={`font-bold ${getGradeColor(team.fieldingGrade)}`}>
                    {team.fieldingGrade}
                  </span>
                </td>
                <td className="py-3 px-2 text-center">
                  <span className={`font-bold ${getGradeColor(team.pitchingGrade)}`}>
                    {team.pitchingGrade}
                  </span>
                </td>
                <td className="py-3 px-2 text-center hidden sm:table-cell">
                  <StarRating rating={Math.ceil(team.prestige / 2)} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RetroCard>
  );
}

function NewsTab({ leagueId }: { leagueId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [filterJournalist, setFilterJournalist] = useState<string>("all");

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const { data: news, isLoading } = useQuery<DynastyNews[]>({
    queryKey: ["/api/leagues", leagueId, "news"],
  });

  const createNewsMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; category: string; imageUrl?: string | null }) => {
      return await apiRequest("POST", `/api/leagues/${leagueId}/news`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] });
      setShowForm(false);
      setTitle("");
      setContent("");
      setCategory("general");
      setImageUrl(null);
    },
  });

  const categoryLabels: Record<string, string> = {
    general: "General",
    recruiting: "Recruiting",
    game: "Game Result",
    postseason: "Postseason",
    conference: "Conference",
    recap: "Weekly Recap",
    trade: "Trade",
    announcement: "Announcement",
  };

  const categoryColors: Record<string, string> = {
    general: "bg-muted text-muted-foreground",
    recruiting: "bg-blue-500/20 text-blue-400",
    game: "bg-green-500/20 text-green-400",
    postseason: "bg-amber-500/20 text-amber-400",
    conference: "bg-cyan-500/20 text-cyan-400",
    recap: "bg-indigo-500/20 text-indigo-400",
    trade: "bg-purple-500/20 text-purple-400",
    announcement: "bg-yellow-500/20 text-yellow-400",
  };

  const journalistInfo: Record<string, { name: string; avatar: string; title: string }> = {
    addie: { name: "Addie Frisk", avatar: addieFriskImg, title: "Game & Conference Reporter" },
    sully: { name: "Sully Pump", avatar: sullyPumpImg, title: "Recruiting Analyst" },
  };

  const filteredNews = news?.filter(item => {
    if (filterJournalist === "all") return true;
    if (filterJournalist === "user") return !item.journalist;
    return item.journalist === filterJournalist;
  });

  if (isLoading) {
    return (
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-gold" />
            <span>Dynasty News</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 mb-3" />
          ))}
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <RetroCard variant="bordered">
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-gold" />
          <span>Dynasty News</span>
        </div>
        <RetroButton 
          size="sm" 
          onClick={() => setShowForm(!showForm)}
          data-testid="button-create-news"
        >
          <Plus className="w-4 h-4 mr-1" />
          Post
        </RetroButton>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="news-filters">
          <button
            onClick={() => setFilterJournalist("all")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "all" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-all"
          >
            All
          </button>
          <button
            onClick={() => setFilterJournalist("addie")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "addie" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-addie"
          >
            <img src={addieFriskImg} alt="" className="w-4 h-4 rounded-sm" style={{ imageRendering: "pixelated" }} />
            Addie
          </button>
          <button
            onClick={() => setFilterJournalist("sully")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "sully" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-sully"
          >
            <img src={sullyPumpImg} alt="" className="w-4 h-4 rounded-sm" style={{ imageRendering: "pixelated" }} />
            Sully
          </button>
          <button
            onClick={() => setFilterJournalist("user")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "user" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-user"
          >
            Commissioner
          </button>
        </div>

        {showForm && (
          <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-3">
            <RetroInput
              placeholder="News title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-news-title"
            />
            <textarea
              placeholder="Write your news post..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-background border border-border rounded p-2 text-sm min-h-[100px] resize-none focus:outline-none focus:border-gold"
              data-testid="input-news-content"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-background border border-border rounded px-2 py-1 text-sm hover:border-gold transition-colors">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Add Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  data-testid="input-news-image"
                />
              </label>
              {imageUrl && (
                <div className="flex items-center gap-2">
                  <img src={imageUrl} alt="Preview" className="w-10 h-10 object-cover rounded" />
                  <button
                    onClick={() => setImageUrl(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-background border border-border rounded px-2 py-1 text-sm"
                data-testid="select-news-category"
              >
                <option value="general">General</option>
                <option value="recruiting">Recruiting</option>
                <option value="game">Game Result</option>
                <option value="trade">Trade</option>
                <option value="announcement">Announcement</option>
              </select>
              <div className="flex-1" />
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setShowForm(false)}
                data-testid="button-cancel-news"
              >
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                onClick={() => createNewsMutation.mutate({ title, content, category, imageUrl })}
                disabled={!title.trim() || !content.trim() || createNewsMutation.isPending}
                data-testid="button-submit-news"
              >
                {createNewsMutation.isPending ? "Posting..." : "Post"}
              </RetroButton>
            </div>
          </div>
        )}

        {(!filteredNews || filteredNews.length === 0) ? (
          <div className="text-center py-8 text-muted-foreground">
            <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{filterJournalist !== "all" ? "No stories from this reporter yet." : "No news yet. Be the first to post!"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNews.map((item) => {
              const journalist = item.journalist ? journalistInfo[item.journalist] : null;
              return (
                <div 
                  key={item.id} 
                  className="bg-muted/30 rounded-lg p-4 border border-border/50"
                  data-testid={`card-news-${item.id}`}
                >
                  <div className="flex items-start gap-3 mb-2">
                    {journalist ? (
                      <img 
                        src={journalist.avatar} 
                        alt={journalist.name}
                        className="w-10 h-10 rounded-md flex-shrink-0 border border-gold/30"
                        style={{ imageRendering: "pixelated" }}
                        data-testid={`avatar-journalist-${item.journalist}`}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md flex-shrink-0 bg-muted border border-border flex items-center justify-center">
                        <Newspaper className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.isSticky && (
                          <Pin className="w-3 h-3 text-gold flex-shrink-0" />
                        )}
                        <h4 className="font-medium text-gold text-sm leading-tight">{item.title}</h4>
                        <Badge className={`text-[9px] no-default-hover-elevate no-default-active-elevate ${categoryColors[item.category] || "bg-muted"}`}>
                          {categoryLabels[item.category] || item.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {journalist ? (
                          <>
                            <span className="text-foreground/80">{journalist.name}</span>
                            <span className="mx-1 opacity-50">|</span>
                            <span className="italic">{journalist.title}</span>
                          </>
                        ) : (
                          <span>{item.authorName}</span>
                        )}
                        {item.season && (
                          <>
                            <span className="mx-1 opacity-50">|</span>
                            Season {item.season}{item.week ? `, Week ${item.week}` : ""}
                          </>
                        )}
                        {!item.season && (
                          <>
                            <span className="mx-1 opacity-50">|</span>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  {item.imageUrl && (
                    <div className="my-3 pl-[52px]">
                      <img 
                        src={item.imageUrl} 
                        alt={item.title}
                        className="max-w-full max-h-64 rounded-lg object-cover"
                      />
                    </div>
                  )}
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap pl-[52px] leading-relaxed">{item.content}</p>
                </div>
              );
            })}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function LeagueViewSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-4 w-64" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </main>
    </div>
  );
}

interface ReadyStatusData {
  readyStatus: Array<{
    teamId: string;
    teamName: string;
    abbreviation: string;
    isHumanControlled: boolean;
    userId: string | null;
    coachName: string;
    isReady: boolean;
    scoutActionsUsed: number;
    recruitActionsUsed: number;
    hasReportedScores: boolean;
  }>;
  allHumansReady: boolean;
  humanCount: number;
  readyCount: number;
  currentUserId?: string;
}

function ReadyButton({ leagueId }: { leagueId: string }) {
  const queryClient = useQueryClient();
  
  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: readyData, isLoading } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
  });

  const toggleReady = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/ready`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
    },
  });

  if (isLoading || !readyData || !user) {
    return <Skeleton className="h-9 w-24" />;
  }

  const myTeamStatus = readyData.readyStatus.find(s => s.userId === user.id);
  const isReady = myTeamStatus?.isReady ?? false;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground">
        {readyData.readyCount}/{readyData.humanCount} Ready
      </span>
      <RetroButton
        size="sm"
        variant={isReady ? "outline" : "primary"}
        onClick={() => toggleReady.mutate()}
        disabled={toggleReady.isPending}
        className={isReady ? "border-green-500 text-green-500" : ""}
        data-testid="button-ready"
      >
        {isReady ? (
          <>
            <Check className="w-4 h-4 mr-1" />
            Ready
          </>
        ) : (
          <>
            <Clock className="w-4 h-4 mr-1" />
            Mark Ready
          </>
        )}
      </RetroButton>
    </div>
  );
}

function PhaseGuidanceBanner({ phase, leagueId }: { phase: string; leagueId: string }) {
  const getGuidance = (): { text: string; action?: { label: string; href: string } } | null => {
    switch (phase) {
      case "preseason":
      case "spring_training":
        return { text: "Spring training is underway. Head to the Commissioner page to advance to the regular season.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "regular_season":
        return { text: "The regular season is in progress. Advance weeks from the Commissioner page or sim ahead.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "conference_championship":
      case "super_regionals":
        return { text: "Postseason is underway. Advance from the Commissioner page to continue the bracket.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "cws":
        return { text: "The College World Series is here. Sim the championship from the Commissioner page.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "offseason_departures":
        return { text: "Review your departing players and make retention offers before the commissioner advances.", action: { label: "Departures", href: `/league/${leagueId}/departures` } };
      case "offseason_recruiting_1":
      case "offseason_recruiting_2":
      case "offseason_recruiting_3":
      case "offseason_recruiting_4":
        return { text: "Recruiting is open. Scout, contact, and offer scholarships to build your next class.", action: { label: "Recruiting", href: `/league/${leagueId}/recruiting` } };
      case "offseason_signing_day":
        return { text: "Signing Day is here. Finalize your recruiting class from the Commissioner page.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "offseason_walkons":
        return { text: "Time to finalize your roster. Cut players to get to 25 and sign walk-ons to fill gaps.", action: { label: "Walk-Ons", href: `/league/${leagueId}/walkons` } };
      default:
        return null;
    }
  };

  const guidance = getGuidance();
  if (!guidance) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-md bg-gold/5 border border-gold/20 px-4 py-2" data-testid="phase-guidance-banner">
      <ChevronRight className="w-4 h-4 text-gold shrink-0" />
      <span className="text-xs text-muted-foreground flex-1">{guidance.text}</span>
      {guidance.action && (
        <Link href={guidance.action.href}>
          <RetroButton variant="outline" size="sm" data-testid="button-phase-guidance-action">
            {guidance.action.label}
          </RetroButton>
        </Link>
      )}
    </div>
  );
}

function SeasonProgressBar({ phase }: { phase: string }) {
  const phases = [
    { key: "spring", label: "SPR" },
    { key: "regular_season", label: "REG" },
    { key: "conference_championship", label: "CONF" },
    { key: "super_regionals", label: "SUPR" },
    { key: "cws", label: "CWS" },
    { key: "offseason", label: "OFF" },
  ];

  const offseasonPhases = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", 
    "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
  
  const springPhases = ["preseason", "spring_training"];
  
  const currentPhaseNormalized = offseasonPhases.includes(phase) ? "offseason" 
    : springPhases.includes(phase) ? "spring" 
    : phase;
  const currentIndex = phases.findIndex(p => p.key === currentPhaseNormalized);

  return (
    <div className="mt-4" data-testid="season-progress-bar">
      <div className="flex items-center gap-1 sm:gap-2">
        {phases.map((p, i) => (
          <div
            key={p.key}
            className={`flex-1 flex flex-col items-center gap-1 min-w-0 ${
              i < currentIndex ? "opacity-50" : i === currentIndex ? "" : "opacity-30"
            }`}
          >
            <div
              className={`w-full h-2 rounded-full ${
                i < currentIndex
                  ? "bg-green-500"
                  : i === currentIndex
                    ? "bg-gold"
                    : "bg-muted"
              }`}
            />
            <span className={`text-[7px] sm:text-[8px] font-pixel text-center ${i === currentIndex ? "text-gold" : "text-muted-foreground"}`}>
              {p.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PostseasonGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  phase: string;
  homeTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
  homeSeed?: number;
  awaySeed?: number;
  bracketSide?: string;
  bracketRound?: number;
  bracketType?: string;
}

interface PostseasonData {
  phase: string;
  conferenceChampionships: PostseasonGame[];
  superRegionals: PostseasonGame[];
  cws: PostseasonGame[];
}

interface BattingLeader {
  name: string;
  teamId: string;
  games: number;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
  avg: string;
  obp: string;
  slg: string;
  ops: string;
  war: string;
  teamAbbr: string;
  teamColor: string;
  cs: number;
  babip: string;
  wOBA: string;
  wRCplus: number;
  opsPlus: number;
  avgExitVelo: string;
  barrelPct: string;
  hardHitPct: string;
  oaa: number;
  drs: number;
  fldPct: string;
  fieldingErrors: number;
}

interface PitchingLeader {
  name: string;
  teamId: string;
  games: number;
  ip: number;
  ipDisplay: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
  hr: number;
  wins: number;
  losses: number;
  era: string;
  fip: string;
  whip: string;
  kPer9: string;
  bbPer9: string;
  war: string;
  teamAbbr: string;
  teamColor: string;
  kPct: string;
  bbPct: string;
  whiffRate: string;
  siera: string;
  avgSpinRate: number;
  totalPitches: number;
}

interface TeamStatEntry {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  games: number;
  runsScored: number;
  runsAllowed: number;
  hits: number;
  hitsAllowed: number;
  totalAB: number;
  totalBB: number;
  totalSO: number;
  totalHR: number;
  totalDoubles: number;
  totalTriples: number;
  totalHBP: number;
  totalSB: number;
  errors: number;
  battingAvg: string;
  obp: string;
  slg: string;
  ops: string;
  rpg: string;
  rapg: string;
}

interface StatsData {
  season: number;
  battingLeaders: BattingLeader[];
  pitchingLeaders: PitchingLeader[];
  teamStats: TeamStatEntry[];
  totalGames: number;
}

function StatsTab({ leagueId, currentSeason }: { leagueId: string; currentSeason: number }) {
  const [view, setView] = useState<"team" | "batting" | "pitching">("team");
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [battingSort, setBattingSort] = useState<"avg" | "ops" | "hr" | "rbi" | "war" | "wOBA" | "wRCplus" | "opsPlus" | "babip" | "exitVelo" | "barrelPct" | "oaa" | "fldPct">("avg");
  const [pitchingSort, setPitchingSort] = useState<"era" | "fip" | "so" | "whip" | "war" | "siera" | "kPct" | "whiffRate" | "spinRate">("era");
  const [battingView, setBattingView] = useState<"traditional" | "advanced" | "statcast" | "defense">("traditional");
  const [pitchingView, setPitchingView] = useState<"traditional" | "advanced">("traditional");

  const seasonParam = selectedSeason ? `?season=${selectedSeason}` : "";
  const { data, isLoading } = useQuery<StatsData>({
    queryKey: ["/api/leagues", leagueId, "stats", selectedSeason || "latest"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/stats${seasonParam}`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 bg-card" />
        <Skeleton className="h-64 bg-card" />
      </div>
    );
  }

  if (!data || data.totalGames === 0) {
    return (
      <RetroCard variant="bordered">
        <RetroCardContent className="py-12 text-center">
          <BarChart className="w-8 h-8 text-gold mx-auto mb-3" />
          <p className="font-pixel text-gold text-xs mb-2">No Stats Available</p>
          <p className="text-sm text-muted-foreground">
            Stats will appear after games have been played.
          </p>
        </RetroCardContent>
      </RetroCard>
    );
  }

  const sortedBatters = [...data.battingLeaders].sort((a, b) => {
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
  }).slice(0, 25);

  const sortedPitchers = [...data.pitchingLeaders].sort((a, b) => {
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
  }).slice(0, 25);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BarChart className="w-5 h-5 text-gold" />
        <span className="font-pixel text-gold text-xs">Season {data.season} Stats</span>
        <span className="text-xs text-muted-foreground">({data.totalGames} games played)</span>
        {currentSeason > 1 && (
          <div className="flex gap-1 ml-auto" data-testid="season-selector">
            {Array.from({ length: currentSeason }, (_, i) => i + 1).map(s => (
              <RetroButton
                key={s}
                variant={(selectedSeason === s || (!selectedSeason && data.season === s)) ? "primary" : "outline"}
                size="sm"
                onClick={() => setSelectedSeason(s)}
                data-testid={`season-select-${s}`}
              >
                S{s}
              </RetroButton>
            ))}
          </div>
        )}
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
                  {data.teamStats.map((ts, idx) => (
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
              <RetroButton
                key={v}
                variant={battingView === v ? "primary" : "outline"}
                size="sm"
                onClick={() => setBattingView(v)}
                data-testid={`batting-view-${v}`}
              >
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
                      <tr key={`${b.name}-${b.teamId}`} className={`border-b border-border/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`} data-testid={`row-batter-${idx}`}>
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
              <RetroButton
                key={v}
                variant={pitchingView === v ? "primary" : "outline"}
                size="sm"
                onClick={() => setPitchingView(v)}
                data-testid={`pitching-view-${v}`}
              >
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
                        <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">WHIP</th>
                        <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">IP</th>
                        <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">SO</th>
                        <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">K/9</th>
                        <th className="py-2 px-1 font-pixel text-[8px] text-muted-foreground text-center">BB/9</th>
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
                      <tr key={`${p.name}-${p.teamId}`} className={`border-b border-border/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`} data-testid={`row-pitcher-${idx}`}>
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
                          <td className="py-2 px-1 text-center text-xs">{p.whip}</td>
                          <td className="py-2 px-1 text-center text-xs">{p.ipDisplay}</td>
                          <td className="py-2 px-1 text-center text-xs">{p.so}</td>
                          <td className="py-2 px-1 text-center text-xs">{p.kPer9}</td>
                          <td className="py-2 px-1 text-center text-xs">{p.bbPer9}</td>
                          <td className="py-2 px-1 text-center text-xs font-medium text-gold">{p.war}</td>
                        </>}
                        {pitchingView === "advanced" && <>
                          <td className="py-2 px-1 text-center text-xs font-medium text-gold">{p.siera}</td>
                          <td className="py-2 px-1 text-center text-xs font-medium">{p.kPct}%</td>
                          <td className="py-2 px-1 text-center text-xs">{p.bbPct}%</td>
                          <td className="py-2 px-1 text-center text-xs font-medium">{p.whiffRate}%</td>
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
  );
}

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
                        <span className="text-[8px] text-muted-foreground">S{s.season}</span>
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
                <p className="font-pixel text-[8px] text-gold">S{s.season}</p>
                <p className="text-sm font-mono">{s.wins}-{s.losses}</p>
                <p className="text-[10px] text-muted-foreground">OVR: {s.avgOverall}</p>
              </div>
            ))}
          </div>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

function DynastyHistoryTab({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<{
    seasons: {
      season: number;
      cwsChampion: { name: string; abbreviation: string; primaryColor: string } | null;
      cwsRunnerUp: { name: string; abbreviation: string; primaryColor: string } | null;
      conferenceChampions: { name: string; abbreviation: string }[];
      teamRecords: { name: string; abbreviation: string; teamId: string; wins: number; losses: number; conferenceWins: number; conferenceLosses: number }[];
      hasCWSData: boolean;
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
                  <p className="font-pixel text-gold text-[10px]">SEASON {season.season}</p>
                  {season.season === data.currentSeason && (
                    <Badge variant="outline" className="text-[8px]">Current</Badge>
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
                      <Badge key={i} variant="outline" className="text-[8px]">{champ.abbreviation} Conf Champ</Badge>
                    ))}
                  </div>
                )}
                {season.teamRecords.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs">
                    {season.teamRecords.slice(0, 8).map(team => (
                      <div key={team.teamId} className="flex items-center justify-between px-2 py-0.5">
                        <span className="text-muted-foreground">{team.abbreviation}</span>
                        <span>{team.wins || 0}-{team.losses || 0}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

type AwardPlayer = {
  playerName: string;
  position: string;
  overall: number;
  eligibility: string;
  teamName: string;
  abbreviation: string;
  primaryColor: string;
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

function AwardsTab({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<SeasonAwardsData>({
    queryKey: ["/api/leagues", leagueId, "season-awards"],
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!data) return null;

  if (!data.awardsAvailable) {
    const phaseLabels: Record<string, string> = {
      preseason: "Spring Training",
      spring_training: "Spring Training",
      regular_season: "Regular Season",
      dynasty_setup: "Dynasty Setup",
    };
    return (
      <RetroCard>
        <RetroCardContent>
          <div className="flex flex-col items-center justify-center py-12 gap-3" data-testid="awards-not-available">
            <Award className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-pixel text-sm text-muted-foreground">Awards Not Yet Available</p>
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
            <p className="text-[9px] text-muted-foreground font-pixel">{title}</p>
            <p className="font-medium text-sm">{player.playerName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span>{player.position}</span>
              <span className="text-gold font-bold">{player.overall} OVR</span>
              <Badge variant="outline" className="text-[8px]">{player.eligibility}</Badge>
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
        <p className="font-pixel text-[9px] text-muted-foreground mb-2">{title.toUpperCase()}</p>
        <div className="space-y-1">
          {team.map((entry, i) => entry.player && (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[7px] min-w-[28px] justify-center">{entry.position}</Badge>
                <span>{entry.player.playerName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gold font-bold">{entry.player.overall}</span>
                <span className="text-muted-foreground">{entry.player.abbreviation}</span>
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
                    <Badge variant="outline" className="text-[7px]">{p.position}</Badge>
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
    </div>
  );
}

function PostseasonTab({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<PostseasonData>({
    queryKey: ["/api/leagues", leagueId, "postseason"],
    enabled: !!leagueId,
  });

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  const hasData = data && (
    data.conferenceChampionships.length > 0 || 
    data.superRegionals.length > 0 || 
    data.cws.length > 0
  );

  if (!hasData) {
    return (
      <RetroCard>
        <RetroCardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-pixel text-xs text-gold mb-2">No Postseason Yet</p>
            <p className="text-sm">The postseason will begin after the regular season ends.</p>
          </div>
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <div className="space-y-4">
      {data!.conferenceChampionships.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Trophy className="w-4 h-4 text-gold" />
              <span>Conference Championships</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 gap-3">
              {data!.conferenceChampionships.map(game => (
                <PostseasonGameCard key={game.id} game={game} />
              ))}
            </div>
          </RetroCardContent>
        </RetroCard>
      )}

      {data!.superRegionals.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Trophy className="w-4 h-4 text-gold" />
              <span>Super Regionals</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <PostseasonBracketView games={data!.superRegionals} />
          </RetroCardContent>
        </RetroCard>
      )}

      {data!.cws.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2 w-full">
              <Trophy className="w-4 h-4 text-gold" />
              <span>College World Series</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="space-y-3">
              {data!.cws.map((game, i) => (
                <div key={game.id}>
                  <p className="text-[9px] text-muted-foreground font-pixel mb-1">Game {i + 1}</p>
                  <PostseasonGameCard game={game} />
                </div>
              ))}
              <CWSSeriesDisplay games={data!.cws} />
            </div>
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
  );
}

function PostseasonGameCard({ game }: { game: PostseasonGame }) {
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div className="bg-muted/30 rounded p-3 border border-border" data-testid={`postseason-game-${game.id}`}>
      <div className={`flex items-center justify-between gap-2 py-1 ${homeWon ? "text-gold font-medium" : awayWon ? "text-muted-foreground" : ""}`}>
        <div className="flex items-center gap-2">
          {game.homeSeed && <span className="text-[9px] font-pixel text-gold w-4">{game.homeSeed}</span>}
          <span className="text-xs">{game.homeTeam?.name || "TBD"}</span>
          <Badge variant="outline" className="text-[8px]">{game.homeTeam?.abbreviation}</Badge>
        </div>
        <span className="text-sm font-pixel">{game.isComplete ? game.homeScore : "-"}</span>
      </div>
      <div className="border-t border-border/50 my-1" />
      <div className={`flex items-center justify-between gap-2 py-1 ${awayWon ? "text-gold font-medium" : homeWon ? "text-muted-foreground" : ""}`}>
        <div className="flex items-center gap-2">
          {game.awaySeed && <span className="text-[9px] font-pixel text-gold w-4">{game.awaySeed}</span>}
          <span className="text-xs">{game.awayTeam?.name || "TBD"}</span>
          <Badge variant="outline" className="text-[8px]">{game.awayTeam?.abbreviation}</Badge>
        </div>
        <span className="text-sm font-pixel">{game.isComplete ? game.awayScore : "-"}</span>
      </div>
      {!game.isComplete && (
        <div className="text-center mt-2">
          <Badge variant="outline" className="text-[8px]">Upcoming</Badge>
        </div>
      )}
      {game.isComplete && (
        <div className="text-center mt-2">
          <Badge className="text-[8px] bg-green-500/20 text-green-400 border-green-500/30">Final</Badge>
        </div>
      )}
    </div>
  );
}

function BracketMatchup({ game, label }: { game: PostseasonGame | null; label?: string }) {
  if (!game) {
    return (
      <div data-testid="bracket-matchup-tbd">
        {label && <p className="text-[7px] font-pixel text-muted-foreground/50 mb-0.5">{label}</p>}
        <div className="bg-muted/20 border border-border/50 rounded w-full">
          <div className="flex items-center justify-between px-2 py-1.5 text-muted-foreground">
            <span className="text-[10px]">TBD</span>
            <span className="text-[10px] font-pixel">-</span>
          </div>
          <div className="border-t border-border/30" />
          <div className="flex items-center justify-between px-2 py-1.5 text-muted-foreground">
            <span className="text-[10px]">TBD</span>
            <span className="text-[10px] font-pixel">-</span>
          </div>
        </div>
      </div>
    );
  }

  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div data-testid={`bracket-game-${game.id}`}>
      {label && <p className="text-[7px] font-pixel text-muted-foreground/50 mb-0.5">{label}</p>}
      <div className={`border rounded ${game.isComplete ? "border-border" : "border-gold/30"} bg-muted/30 w-full`}>
        <div className={`flex items-center justify-between gap-1 px-2 py-1.5 ${homeWon ? "bg-gold/10 text-gold font-medium" : awayWon ? "text-muted-foreground" : ""}`}>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {game.homeSeed && <span className="text-[9px] font-pixel text-gold flex-shrink-0 w-3">{game.homeSeed}</span>}
            <span className="text-[10px] truncate">{game.homeTeam?.abbreviation || "TBD"}</span>
          </div>
          <span className="text-[10px] font-pixel flex-shrink-0">{game.isComplete ? game.homeScore : "-"}</span>
        </div>
        <div className="border-t border-border/30" />
        <div className={`flex items-center justify-between gap-1 px-2 py-1.5 ${awayWon ? "bg-gold/10 text-gold font-medium" : homeWon ? "text-muted-foreground" : ""}`}>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {game.awaySeed && <span className="text-[9px] font-pixel text-gold flex-shrink-0 w-3">{game.awaySeed}</span>}
            <span className="text-[10px] truncate">{game.awayTeam?.abbreviation || "TBD"}</span>
          </div>
          <span className="text-[10px] font-pixel flex-shrink-0">{game.isComplete ? game.awayScore : "-"}</span>
        </div>
      </div>
      {!game.isComplete && (
        <p className="text-[7px] text-center text-muted-foreground/50 mt-0.5">Upcoming</p>
      )}
    </div>
  );
}

function DoubleEliminationBracketSide({ games, side, sideLabel }: { games: PostseasonGame[]; side: string; sideLabel: string }) {
  const sideGames = games.filter(g => g.bracketSide === side);

  const winnersR1 = sideGames.filter(g => g.bracketRound === 1 && g.bracketType === "winners");
  const winnersR2 = sideGames.filter(g => g.bracketRound === 2 && g.bracketType === "winners");
  const losersR1 = sideGames.filter(g => g.bracketRound === 1 && g.bracketType === "losers");
  const losersR2 = sideGames.filter(g => g.bracketRound === 2 && g.bracketType === "losers");
  const bracketFinal = sideGames.filter(g => g.bracketType === "bracket_final");
  const ifNecessary = sideGames.filter(g => g.bracketType === "if_necessary");

  const getWinnerInfo = (game: PostseasonGame) => {
    if (!game.isComplete) return null;
    const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0);
    return homeWon
      ? { abbreviation: game.homeTeam?.abbreviation || "TBD", seed: game.homeSeed }
      : { abbreviation: game.awayTeam?.abbreviation || "TBD", seed: game.awaySeed };
  };

  const bracketChampion = ifNecessary.length > 0 && ifNecessary[0].isComplete
    ? getWinnerInfo(ifNecessary[0])
    : bracketFinal.length > 0 && bracketFinal[0].isComplete
      ? (() => {
          const w = getWinnerInfo(bracketFinal[0]);
          const wbChamp = winnersR2.length > 0 && winnersR2[0].isComplete ? getWinnerInfo(winnersR2[0]) : null;
          if (w && wbChamp && w.abbreviation === wbChamp.abbreviation) return w;
          return null;
        })()
      : null;

  return (
    <div className="flex-1 min-w-0" data-testid={`bracket-side-${side}`}>
      <p className="text-[9px] font-pixel text-gold text-center mb-2 uppercase">{sideLabel}</p>

      <div className="space-y-1 mb-3">
        <p className="text-[7px] font-pixel text-muted-foreground uppercase">Winners Bracket</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            {winnersR1.length > 0 ? winnersR1.map(g => (
              <BracketMatchup key={g.id} game={g} />
            )) : (
              <>
                <BracketMatchup game={null} />
                <BracketMatchup game={null} />
              </>
            )}
          </div>
          <div className="flex items-center">
            <BracketMatchup game={winnersR2[0] || null} label="WB Final" />
          </div>
        </div>
      </div>

      <div className="border-t border-border/30 my-2" />

      <div className="space-y-1 mb-3">
        <p className="text-[7px] font-pixel text-muted-foreground uppercase">Losers Bracket</p>
        <div className="grid grid-cols-2 gap-2">
          <BracketMatchup game={losersR1[0] || null} label="Elimination" />
          <BracketMatchup game={losersR2[0] || null} label="LB Final" />
        </div>
      </div>

      <div className="border-t border-border/30 my-2" />

      <div className="space-y-1">
        <p className="text-[7px] font-pixel text-gold uppercase">Bracket Championship</p>
        <div className="grid grid-cols-2 gap-2">
          <BracketMatchup game={bracketFinal[0] || null} label="Championship" />
          {ifNecessary.length > 0 ? (
            <BracketMatchup game={ifNecessary[0]} label="If Necessary" />
          ) : (
            <div className="flex items-center justify-center">
              {bracketChampion ? (
                <div className="bg-gold/10 border border-gold/30 rounded px-3 py-2 text-center w-full">
                  <p className="text-[7px] font-pixel text-muted-foreground mb-1">CWS BOUND</p>
                  <p className="text-gold font-pixel text-xs">
                    {bracketChampion.seed && <span className="mr-1">{bracketChampion.seed}</span>}
                    {bracketChampion.abbreviation}
                  </p>
                </div>
              ) : (
                <div className="bg-muted/20 border border-border/50 rounded px-3 py-2 text-center w-full">
                  <p className="text-[7px] font-pixel text-muted-foreground mb-1">CWS BOUND</p>
                  <p className="text-muted-foreground font-pixel text-[10px]">TBD</p>
                </div>
              )}
            </div>
          )}
        </div>
        {ifNecessary.length > 0 && ifNecessary[0].isComplete && (
          <div className="mt-2">
            {(() => {
              const champ = getWinnerInfo(ifNecessary[0]);
              return champ ? (
                <div className="bg-gold/10 border border-gold/30 rounded px-3 py-2 text-center">
                  <p className="text-[7px] font-pixel text-muted-foreground mb-1">CWS BOUND</p>
                  <p className="text-gold font-pixel text-xs">
                    {champ.seed && <span className="mr-1">{champ.seed}</span>}
                    {champ.abbreviation}
                  </p>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function PostseasonBracketView({ games }: { games: PostseasonGame[] }) {
  const hasDoubleElim = games.some(g => g.bracketSide);

  if (!hasDoubleElim) {
    return (
      <div className="space-y-3" data-testid="bracket-view">
        <div className="grid sm:grid-cols-2 gap-3">
          {games.map(game => (
            <PostseasonGameCard key={game.id} game={game} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="bracket-view">
      <div className="flex gap-4">
        <DoubleEliminationBracketSide games={games} side="A" sideLabel="Bracket A" />
        <div className="w-px bg-border/50 flex-shrink-0" />
        <DoubleEliminationBracketSide games={games} side="B" sideLabel="Bracket B" />
      </div>

      <div className="border-t border-border/30 pt-3">
        <p className="text-[8px] font-pixel text-muted-foreground uppercase mb-2">All Games</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {games.map(game => (
            <PostseasonGameCard key={game.id} game={game} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CWSSeriesDisplay({ games }: { games: PostseasonGame[] }) {
  const completedGames = games.filter(g => g.isComplete);
  if (completedGames.length === 0) return null;

  const winsMap: Record<string, { name: string; wins: number }> = {};
  for (const g of completedGames) {
    const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    const winnerTeam = winnerId === g.homeTeamId ? g.homeTeam : g.awayTeam;
    if (!winsMap[winnerId]) winsMap[winnerId] = { name: winnerTeam?.name || "TBD", wins: 0 };
    winsMap[winnerId].wins++;
  }

  const entries = Object.values(winsMap);
  const champion = entries.find(e => e.wins >= 2);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      {champion ? (
        <div className="text-center bg-gold/10 rounded p-4 border border-gold/20">
          <Trophy className="w-8 h-8 text-gold mx-auto mb-2" />
          <p className="font-pixel text-gold text-sm" data-testid="text-league-cws-champion">
            {champion.name} Wins the College World Series!
          </p>
        </div>
      ) : (
        <div className="text-center">
          <p className="font-pixel text-xs text-muted-foreground mb-2">Series Status</p>
          <div className="flex items-center justify-center gap-6 text-sm">
            {entries.map(e => (
              <span key={e.name} className="font-pixel text-gold">
                {e.name}: {e.wins}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface SigningDayData {
  teamSignings: {
    teamId: string;
    teamName: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    mascot: string;
    recruits: { id: string; firstName: string; lastName: string; position: string; starRating: number; overall: number; homeState: string; isBlueChip: boolean }[];
    totalRecruits: number;
    avgRating: number;
    totalStars: number;
  }[];
  totalSigned: number;
  totalUnsigned: number;
  totalRecruits: number;
  transferPortal?: {
    departed: number;
    stillAvailable: number;
  };
}

interface CompareTeamData {
  id: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string;
  prestige: number; facilities: number;
  wins: number; losses: number; confWins: number; confLosses: number;
  runsScored: number; runsAllowed: number;
  rosterSize: number; avgOverall: number; avgPitcher: number; avgHitter: number;
  positionCounts: Record<string, number>;
  topPlayers: { name: string; position: string; overall: number; year: number }[];
  freshmen: number; sophomores: number; juniors: number; seniors: number;
}

function CompareStatRow({ label, valueA, valueB, highlight }: { label: string; valueA: string | number; valueB: string | number; highlight?: boolean }) {
  const numA = typeof valueA === "number" ? valueA : parseFloat(valueA);
  const numB = typeof valueB === "number" ? valueB : parseFloat(valueB);
  const aWins = !isNaN(numA) && !isNaN(numB) && numA > numB;
  const bWins = !isNaN(numA) && !isNaN(numB) && numB > numA;

  return (
    <div className={`grid grid-cols-3 gap-2 py-1.5 text-sm ${highlight ? "bg-gold/5" : ""}`}>
      <span className={`text-right font-mono ${aWins ? "text-green-400 font-semibold" : ""}`}>{valueA}</span>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono ${bWins ? "text-green-400 font-semibold" : ""}`}>{valueB}</span>
    </div>
  );
}

function TeamCompareDialog({ leagueId, teamAId, teamBId, open, onClose }: { leagueId: string; teamAId: string; teamBId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ teamA: CompareTeamData; teamB: CompareTeamData }>({
    queryKey: [`/api/leagues/${leagueId}/team-compare?teamA=${teamAId}&teamB=${teamBId}`],
    enabled: open && !!teamAId && !!teamBId,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background border-gold/30 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm">Team Comparison</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center justify-end gap-2">
                <span className="font-pixel text-xs text-right">{data.teamA.name}</span>
                <TeamBadge name={data.teamA.name} abbreviation={data.teamA.abbreviation} primaryColor={data.teamA.primaryColor} size="md" />
              </div>
              <div className="text-center text-muted-foreground text-xs pt-2">VS</div>
              <div className="flex items-center gap-2">
                <TeamBadge name={data.teamB.name} abbreviation={data.teamB.abbreviation} primaryColor={data.teamB.primaryColor} size="md" />
                <span className="font-pixel text-xs">{data.teamB.name}</span>
              </div>
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">RECORD</p>
              <CompareStatRow label="W-L" valueA={`${data.teamA.wins}-${data.teamA.losses}`} valueB={`${data.teamB.wins}-${data.teamB.losses}`} highlight />
              <CompareStatRow label="Conf W-L" valueA={`${data.teamA.confWins}-${data.teamA.confLosses}`} valueB={`${data.teamB.confWins}-${data.teamB.confLosses}`} />
              <CompareStatRow label="Runs Scored" valueA={data.teamA.runsScored} valueB={data.teamB.runsScored} />
              <CompareStatRow label="Runs Allowed" valueA={data.teamA.runsAllowed} valueB={data.teamB.runsAllowed} />
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">ROSTER</p>
              <CompareStatRow label="Roster Size" valueA={data.teamA.rosterSize} valueB={data.teamB.rosterSize} />
              <CompareStatRow label="Avg Overall" valueA={data.teamA.avgOverall} valueB={data.teamB.avgOverall} highlight />
              <CompareStatRow label="Avg Pitcher" valueA={data.teamA.avgPitcher} valueB={data.teamB.avgPitcher} />
              <CompareStatRow label="Avg Hitter" valueA={data.teamA.avgHitter} valueB={data.teamB.avgHitter} />
              <CompareStatRow label="Freshmen" valueA={data.teamA.freshmen} valueB={data.teamB.freshmen} />
              <CompareStatRow label="Sophomores" valueA={data.teamA.sophomores} valueB={data.teamB.sophomores} />
              <CompareStatRow label="Juniors" valueA={data.teamA.juniors} valueB={data.teamB.juniors} />
              <CompareStatRow label="Seniors" valueA={data.teamA.seniors} valueB={data.teamB.seniors} />
            </div>

            <div className="border border-border/50 rounded-md p-3 space-y-1">
              <p className="font-pixel text-gold text-[10px] mb-2 text-center">PROGRAM</p>
              <CompareStatRow label="Prestige" valueA={data.teamA.prestige} valueB={data.teamB.prestige} highlight />
              <CompareStatRow label="Facilities" valueA={data.teamA.facilities} valueB={data.teamB.facilities} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[data.teamA, data.teamB].map((team, idx) => (
                <div key={idx} className="border border-border/50 rounded-md p-3">
                  <p className="font-pixel text-[10px] text-gold mb-2">TOP 5 PLAYERS - {team.abbreviation}</p>
                  {team.topPlayers.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span className="truncate">{p.name} <span className="text-muted-foreground">({p.position}, Yr {p.year})</span></span>
                      <span className="font-mono">{p.overall}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SeasonRecapDialog({ leagueId, season, open, onClose }: { leagueId: string; season: number; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<{
    season: number;
    teams: { id: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string; wins: number; losses: number; confWins: number; confLosses: number; runsScored: number; runsAllowed: number }[];
    cwsChampion: { name: string; abbreviation: string; primaryColor: string } | null;
    cwsRunnerUp: { name: string; abbreviation: string } | null;
    totalGames: number;
    bestRecord: string | null;
  }>({
    queryKey: ["/api/leagues", leagueId, "season-recap", season],
    enabled: open && season > 0,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background border-gold/30 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Season {season} Recap
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            {data.cwsChampion && (
              <div className="text-center p-4 border border-gold/30 rounded-md bg-gold/5">
                <p className="text-xs text-muted-foreground mb-1">CWS CHAMPION</p>
                <div className="flex items-center justify-center gap-2">
                  <TeamBadge
                    name={data.cwsChampion.name}
                    abbreviation={data.cwsChampion.abbreviation}
                    primaryColor={data.cwsChampion.primaryColor}
                    size="md"
                  />
                  <span className="font-pixel text-gold text-sm">{data.cwsChampion.name}</span>
                </div>
                {data.cwsRunnerUp && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Runner-up: {data.cwsRunnerUp.name}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-2">
              <span>{data.totalGames} games played</span>
              {data.bestRecord && <span>Best: {data.bestRecord}</span>}
            </div>

            <div>
              <p className="font-pixel text-gold text-[10px] mb-2">TOP 10 TEAMS</p>
              <div className="space-y-1">
                {data.teams.map((team, i) => (
                  <div
                    key={team.id}
                    className="flex items-center gap-2 p-2 rounded text-sm"
                    data-testid={`recap-team-${i}`}
                  >
                    <span className="text-muted-foreground w-5 text-right text-xs">{i + 1}.</span>
                    <TeamBadge
                      name={team.name}
                      abbreviation={team.abbreviation}
                      primaryColor={team.primaryColor}
                      size="sm"
                    />
                    <span className="flex-1 truncate">{team.name}</span>
                    <span className="font-mono text-xs">
                      {team.wins}-{team.losses}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({team.confWins}-{team.confLosses} conf)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No recap data available</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OffseasonSummary({ league }: { league: LeagueDetails }) {
  const isOffseasonPhase = ["offseason", "offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"].includes(league.currentPhase);
  
  if (!isOffseasonPhase) return null;
  
  const userTeam = league.teams?.find(t => !t.isCpu);
  if (!userTeam) return null;

  const { data: historyData } = useQuery<{
    history: { departureType: string; teamId: string; position: string; firstName: string; lastName: string; overall: number; departedSeason: number }[];
  }>({
    queryKey: ["/api/leagues", league.id, "player-history"],
    enabled: league.currentPhase !== "offseason_departures",
  });

  const { data: pendingData } = useQuery<{
    teams: Record<string, { graduates: any[]; draftDeclarations: any[]; transfers: any[]; totalLeaving: number }>;
  }>({
    queryKey: ["/api/leagues", league.id, "players-leaving"],
    enabled: league.currentPhase === "offseason_departures",
  });

  const { data: signingDayData } = useQuery<SigningDayData>({
    queryKey: ["/api/leagues", league.id, "signing-day"],
    enabled: league.currentPhase === "offseason_signing_day",
  });

  let graduated: any[] = [];
  let drafted: any[] = [];
  let transferred: any[] = [];
  let currentSeasonDepartures: any[] = [];

  if (league.currentPhase === "offseason_departures" && pendingData?.teams) {
    const teamData = Object.values(pendingData.teams).find((t: any) => t.teamId === userTeam.id) as any;
    if (teamData) {
      graduated = (teamData.graduates || []).map((p: any) => ({ ...p, departureType: "graduated" }));
      drafted = (teamData.draftDeclarations || []).map((p: any) => ({ ...p, departureType: "draft" }));
      transferred = (teamData.transfers || []).map((p: any) => ({ ...p, departureType: "transfer_portal" }));
      currentSeasonDepartures = [...graduated, ...drafted, ...transferred];
    }
  } else {
    currentSeasonDepartures = historyData?.history?.filter(
      h => h.teamId === userTeam.id && h.departedSeason === league.currentSeason
    ) || [];
    graduated = currentSeasonDepartures.filter(h => h.departureType === "graduated");
    drafted = currentSeasonDepartures.filter(h => h.departureType === "draft");
    transferred = currentSeasonDepartures.filter(h => h.departureType === "transfer_portal");
  }

  const phaseTitle = league.currentPhase === "offseason_departures" ? "PLAYERS LEAVING" 
    : league.currentPhase === "offseason_signing_day" ? "SIGNING DAY"
    : league.currentPhase === "offseason_walkons" ? "CUTS & WALK-ONS"
    : league.currentPhase?.startsWith("offseason_recruiting") ? "OFFSEASON RECRUITING"
    : "OFFSEASON";

  const phaseIcon = league.currentPhase === "offseason_departures" ? <UserMinus className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
    : league.currentPhase === "offseason_signing_day" ? <Award className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
    : league.currentPhase === "offseason_walkons" ? <UserPlus className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
    : <ScrollText className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />;
  
  return (
    <RetroCard className="border-gold/30 mb-4" data-testid="offseason-summary">
      <div className="flex items-start gap-3">
        {phaseIcon}
        <div className="flex-1">
          <p className="font-pixel text-gold text-[10px] mb-2">{phaseTitle}</p>
          
          {/* Departures phase or any phase with departure data */}
          {(league.currentPhase === "offseason_departures" || (currentSeasonDepartures.length > 0 && league.currentPhase !== "offseason_signing_day")) && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{graduated.length}</p>
                  <p className="text-[9px] text-muted-foreground">Graduated</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{drafted.length}</p>
                  <p className="text-[9px] text-muted-foreground">MLB Draft</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{transferred.length}</p>
                  <p className="text-[9px] text-muted-foreground">Transfer Portal</p>
                </div>
              </div>
              {currentSeasonDepartures.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">DEPARTING PLAYERS</p>
                  <div className="flex flex-wrap gap-1">
                    {currentSeasonDepartures.map((p, i) => (
                      <Badge key={i} variant="outline" className="text-[8px]">
                        {p.firstName[0]}. {p.lastName} ({p.position}, {p.overall} OVR) - {p.departureType === "graduated" ? "Grad" : p.departureType === "draft" ? "MLB" : "Portal"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {league.currentPhase === "offseason_departures" && (
                <div className="mt-3">
                  <Link href={`/league/${league.id}/departures`}>
                    <RetroButton
                      variant="primary"
                      size="sm"
                      data-testid="button-view-departures"
                    >
                      Review Departures
                    </RetroButton>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Recruiting phase message */}
          {league.currentPhase?.startsWith("offseason_recruiting") && currentSeasonDepartures.length === 0 && (
            <p className="text-sm text-muted-foreground">
              The offseason recruiting period is underway. Visit the Recruiting Board to recruit unsigned players and check the Transfer Portal for available transfers.
            </p>
          )}

          {league.currentPhase === "offseason_walkons" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Finalize your roster by cutting players and signing walk-ons. All teams must be ready before advancing to the new season.
              </p>
              <Link href={`/league/${league.id}/walkons`}>
                <RetroButton variant="primary" size="sm" data-testid="button-walkons-page">
                  <UserPlus className="w-3 h-3 mr-1" />
                  Manage Walk-Ons
                </RetroButton>
              </Link>
            </div>
          )}

          {league.currentPhase === "offseason_signing_day" && signingDayData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gold/10 rounded p-2 text-center">
                  <p className="font-bold text-lg text-gold">{signingDayData.totalSigned}</p>
                  <p className="text-[9px] text-muted-foreground">Recruits Signed</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{signingDayData.totalUnsigned}</p>
                  <p className="text-[9px] text-muted-foreground">Unsigned</p>
                </div>
                <div className="bg-muted/30 rounded p-2 text-center">
                  <p className="font-bold text-lg text-foreground">{signingDayData.totalRecruits}</p>
                  <p className="text-[9px] text-muted-foreground">Total Class</p>
                </div>
                {signingDayData.transferPortal && (
                  <div className="bg-blue-500/10 rounded p-2 text-center">
                    <p className="font-bold text-lg text-blue-400">{signingDayData.transferPortal.departed}</p>
                    <p className="text-[9px] text-muted-foreground">Portal Transfers</p>
                  </div>
                )}
              </div>
              
              <p className="text-[9px] text-muted-foreground mb-1">RECRUITING CLASS RANKINGS</p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {signingDayData.teamSignings.map((team, rank) => (
                  <div key={team.teamId} className="flex items-center gap-2 p-2 rounded bg-muted/20" data-testid={`signing-day-team-${team.abbreviation}`}>
                    <span className="font-pixel text-gold text-xs w-6 text-center">#{rank + 1}</span>
                    <TeamBadge abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{team.teamName}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {team.recruits.map(r => (
                          <Badge key={r.id} variant="outline" className="text-[8px]">
                            {r.firstName[0]}. {r.lastName} ({r.position}) {"*".repeat(r.starRating || 3)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold">{team.totalRecruits}</p>
                      <p className="text-[8px] text-muted-foreground">Avg {team.avgRating}*</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/league/${league.id}/roster`}>
              <RetroButton variant="outline" size="sm" data-testid="button-offseason-roster">
                <Users className="w-3 h-3 mr-1" />
                View Roster
              </RetroButton>
            </Link>
            {league.currentPhase !== "offseason_signing_day" && league.currentPhase !== "offseason_walkons" && (
              <Link href={`/league/${league.id}/recruiting`}>
                <RetroButton variant="outline" size="sm" data-testid="button-offseason-recruiting">
                  <Target className="w-3 h-3 mr-1" />
                  Recruiting Board
                </RetroButton>
              </Link>
            )}
          </div>
        </div>
      </div>
    </RetroCard>
  );
}

function NotificationCenter({ leagueId }: { leagueId: string }) {
  const { data: news } = useQuery<{ news: { id: string; headline: string; body: string; createdAt: string; newsType: string }[] }>({
    queryKey: ["/api/leagues", leagueId, "news"],
  });

  const recentNews = news?.news?.slice(0, 5) || [];
  const unreadCount = recentNews.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded hover:bg-gold/10 transition-colors" data-testid="button-notifications">
          <Bell className="w-5 h-5 text-muted-foreground hover:text-gold" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-card border-border p-0" align="end">
        <div className="p-3 border-b border-border">
          <span className="font-pixel text-gold text-xs">NOTIFICATIONS</span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {recentNews.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No recent notifications
            </div>
          ) : (
            recentNews.map((item) => (
              <div key={item.id} className="p-3 border-b border-border/50 hover:bg-gold/5">
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${
                    item.newsType === "commit" ? "bg-green-500" :
                    item.newsType === "decommit" ? "bg-red-500" :
                    item.newsType === "transfer" ? "bg-blue-500" :
                    "bg-gold"
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.headline}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {recentNews.length > 0 && (
          <div className="p-2 border-t border-border">
            <Link href={`/league/${leagueId}`}>
              <button className="w-full text-center text-xs text-gold hover:underline">
                View all news
              </button>
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
