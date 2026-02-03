import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Trophy, 
  Users, 
  Target, 
  Calendar, 
  Settings,
  Play,
  ChevronRight 
} from "lucide-react";
import type { League, Team, Conference, Standings } from "@shared/schema";
import { User, Cpu } from "lucide-react";

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
  } | null;
}

interface LeagueDetails extends League {
  teams: TeamWithCoach[];
  conferences: Conference[];
}

export default function LeagueViewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: league, isLoading } = useQuery<LeagueDetails>({
    queryKey: ["/api/leagues", id],
  });

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

  const phaseLabels: Record<string, string> = {
    dynasty_setup: "Dynasty Setup",
    preseason: "Preseason",
    spring_training: "Spring Training",
    regular_season: "Regular Season",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    players_leaving: "Players Leaving",
    offseason_recruiting_1: "Early Recruiting",
    offseason_recruiting_2: "Mid Recruiting",
    offseason_recruiting_3: "Late Recruiting",
    offseason_recruiting_4: "Final Recruiting",
    signing_day: "Signing Day",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/dashboard" className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-lg">{league.name}</h1>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Season {league.currentSeason}, Week {league.currentWeek}</span>
            </div>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              <span>{phaseLabels[league.currentPhase]}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>{league.teams?.length || 0} / {league.maxTeams} Teams</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6 mb-6">
          <QuickActionCard
            href={`/league/${id}/recruiting`}
            icon={<Target className="w-6 h-6" />}
            title="Recruiting"
            subtitle="Scout and recruit players"
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
            href={`/league/${id}/commissioner`}
            icon={<Settings className="w-6 h-6" />}
            title="Commissioner"
            subtitle="Dynasty settings"
          />
        </div>

        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="standings" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Standings
            </TabsTrigger>
            <TabsTrigger value="teams" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Teams
            </TabsTrigger>
            <TabsTrigger value="rankings" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Rankings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standings">
            <StandingsTab league={league} />
          </TabsContent>

          <TabsContent value="teams">
            <TeamsTab league={league} />
          </TabsContent>

          <TabsContent value="rankings">
            <RankingsTab league={league} />
          </TabsContent>
        </Tabs>
      </main>
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
        <div className="flex items-center gap-4">
          <div className="text-gold">{icon}</div>
          <div className="flex-1">
            <h3 className="font-pixel text-[10px] text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
                  <th className="text-left py-3 px-2">#</th>
                  <th className="text-left py-3 px-2">Team</th>
                  <th className="text-left py-3 px-2 hidden lg:table-cell">Coach</th>
                  <th className="text-center py-3 px-2">W</th>
                  <th className="text-center py-3 px-2">L</th>
                  <th className="text-center py-3 px-2 hidden sm:table-cell">Conf</th>
                  <th className="text-center py-3 px-2 hidden md:table-cell">RS</th>
                  <th className="text-center py-3 px-2 hidden md:table-cell">RA</th>
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
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3 text-gold" />
                          <div>
                            <span className="text-foreground">{team.coach.firstName} {team.coach.lastName}</span>
                            {team.user && (
                              <span className="text-xs text-muted-foreground ml-1">({team.user.email.split("@")[0]})</span>
                            )}
                          </div>
                        </div>
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
    </div>
  );
}

function TeamsTab({ league }: { league: LeagueDetails }) {
  const teamsByConference = league.conferences?.map(conf => ({
    ...conf,
    teams: league.teams?.filter(t => t.conferenceId === conf.id) || [],
  })) || [];

  return (
    <div className="space-y-6">
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
        <div className="grid lg:grid-cols-4 gap-6 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </main>
    </div>
  );
}
