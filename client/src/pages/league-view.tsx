import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
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
  UserMinus
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { League, Team, Conference, Standings, DynastyNews } from "@shared/schema";
import { User, Cpu } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
    preseason: "Preseason",
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
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
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
            <div className="flex items-center gap-2 ml-auto">
              <NotificationCenter leagueId={id!} />
              <ReadyButton leagueId={id} />
            </div>
          </div>
          
          <SeasonProgressBar phase={league.currentPhase} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-6 gap-4 mb-6">
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
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="news" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              News
            </TabsTrigger>
            <TabsTrigger value="standings" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Standings
            </TabsTrigger>
            <TabsTrigger value="teams" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Teams
            </TabsTrigger>
            <TabsTrigger value="rankings" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Rankings
            </TabsTrigger>
            <TabsTrigger value="postseason" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Postseason
            </TabsTrigger>
            <TabsTrigger value="awards" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Awards
            </TabsTrigger>
            <TabsTrigger value="history" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              History
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

          <TabsContent value="news">
            <NewsTab leagueId={league.id} />
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

function NewsTab({ leagueId }: { leagueId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

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
    trade: "Trade",
    announcement: "Announcement",
  };

  const categoryColors: Record<string, string> = {
    general: "bg-muted",
    recruiting: "bg-blue-500/20 text-blue-400",
    game: "bg-green-500/20 text-green-400",
    trade: "bg-purple-500/20 text-purple-400",
    announcement: "bg-yellow-500/20 text-yellow-400",
  };

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

        {(!news || news.length === 0) ? (
          <div className="text-center py-8 text-muted-foreground">
            <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No news yet. Be the first to post!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {news.map((item) => (
              <div 
                key={item.id} 
                className="bg-muted/30 rounded-lg p-4 border border-border/50"
                data-testid={`card-news-${item.id}`}
              >
                <div className="flex items-start gap-2 mb-2">
                  {item.isSticky && (
                    <Pin className="w-3 h-3 text-gold flex-shrink-0 mt-1" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-gold">{item.title}</h4>
                      <Badge className={`text-[9px] ${categoryColors[item.category] || ""}`}>
                        {categoryLabels[item.category] || item.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Posted by {item.authorName} - {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {item.imageUrl && (
                  <div className="my-3">
                    <img 
                      src={item.imageUrl} 
                      alt={item.title}
                      className="max-w-full max-h-64 rounded-lg object-cover"
                    />
                  </div>
                )}
                <p className="text-sm text-foreground whitespace-pre-wrap">{item.content}</p>
              </div>
            ))}
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

function SeasonProgressBar({ phase }: { phase: string }) {
  const phases = [
    { key: "preseason", label: "Preseason" },
    { key: "spring_training", label: "Spring" },
    { key: "regular_season", label: "Reg Season" },
    { key: "conference_championship", label: "Conf Champs" },
    { key: "super_regionals", label: "Super Region" },
    { key: "cws", label: "CWS" },
    { key: "offseason", label: "Offseason" },
  ];

  const offseasonPhases = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", 
    "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day"];
  
  const currentPhaseNormalized = offseasonPhases.includes(phase) ? "offseason" : phase;
  const currentIndex = phases.findIndex(p => p.key === currentPhaseNormalized);

  return (
    <div className="mt-4" data-testid="season-progress-bar">
      <div className="flex items-center justify-between gap-1">
        {phases.map((p, i) => (
          <div
            key={p.key}
            className={`flex-1 flex flex-col items-center gap-1 ${
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
            <span className={`text-[8px] font-pixel ${i === currentIndex ? "text-gold" : "text-muted-foreground"}`}>
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
}

interface PostseasonData {
  phase: string;
  conferenceChampionships: PostseasonGame[];
  superRegionals: PostseasonGame[];
  cws: PostseasonGame[];
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
      preseason: "Preseason",
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
          <span className="text-xs">{game.homeTeam?.name || "TBD"}</span>
          <Badge variant="outline" className="text-[8px]">{game.homeTeam?.abbreviation}</Badge>
        </div>
        <span className="text-sm font-pixel">{game.isComplete ? game.homeScore : "-"}</span>
      </div>
      <div className="border-t border-border/50 my-1" />
      <div className={`flex items-center justify-between gap-2 py-1 ${awayWon ? "text-gold font-medium" : homeWon ? "text-muted-foreground" : ""}`}>
        <div className="flex items-center gap-2">
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

function PostseasonBracketView({ games }: { games: PostseasonGame[] }) {
  const completedGames = games.filter(g => g.isComplete);
  const upcomingGames = games.filter(g => !g.isComplete);

  return (
    <div className="space-y-4">
      {completedGames.length > 0 && (
        <div>
          <p className="text-[9px] text-muted-foreground font-pixel mb-2 uppercase">Completed Rounds</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {completedGames.map(game => (
              <PostseasonGameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      )}
      {upcomingGames.length > 0 && (
        <div>
          <p className="text-[9px] text-muted-foreground font-pixel mb-2 uppercase">Next Round</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {upcomingGames.map(game => (
              <PostseasonGameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      )}
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

function OffseasonSummary({ league }: { league: LeagueDetails }) {
  const isOffseasonPhase = ["offseason", "offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day"].includes(league.currentPhase);
  
  if (!isOffseasonPhase) return null;
  
  const userTeam = league.teams?.find(t => !t.isCpu);
  if (!userTeam) return null;

  const { data: historyData } = useQuery<{
    history: { departureType: string; teamId: string; position: string; firstName: string; lastName: string; overall: number; departedSeason: number }[];
  }>({
    queryKey: ["/api/leagues", league.id, "player-history"],
  });

  const { data: signingDayData } = useQuery<SigningDayData>({
    queryKey: ["/api/leagues", league.id, "signing-day"],
    enabled: league.currentPhase === "offseason_signing_day",
  });

  const currentSeasonDepartures = historyData?.history?.filter(
    h => h.teamId === userTeam.id && h.departedSeason === league.currentSeason
  ) || [];

  const graduated = currentSeasonDepartures.filter(h => h.departureType === "graduated");
  const drafted = currentSeasonDepartures.filter(h => h.departureType === "draft");
  const transferred = currentSeasonDepartures.filter(h => h.departureType === "transfer_portal");

  const phaseTitle = league.currentPhase === "offseason_departures" ? "PLAYERS LEAVING" 
    : league.currentPhase === "offseason_signing_day" ? "SIGNING DAY"
    : league.currentPhase?.startsWith("offseason_recruiting") ? "OFFSEASON RECRUITING"
    : "OFFSEASON";

  const phaseIcon = league.currentPhase === "offseason_departures" ? <UserMinus className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
    : league.currentPhase === "offseason_signing_day" ? <Award className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
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

          {/* Signing Day phase */}
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
            {league.currentPhase !== "offseason_signing_day" && (
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
