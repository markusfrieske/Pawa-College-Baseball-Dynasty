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
  X
} from "lucide-react";
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
          <QuickActionCard
            href={`/league/${id}/coach`}
            icon={<Award className="w-6 h-6" />}
            title="Coach Profile"
            subtitle="View your career"
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
            <TabsTrigger value="news" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              News
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
                            <User className="w-3 h-3 text-gold" />
                            <div>
                              <span className="text-foreground hover:text-gold">{team.coach.firstName} {team.coach.lastName}</span>
                              {team.user && (
                                <span className="text-xs text-muted-foreground ml-1">({team.user.email.split("@")[0]})</span>
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
