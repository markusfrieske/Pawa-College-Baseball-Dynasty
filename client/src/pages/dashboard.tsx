import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Plus, Trophy, Users, Calendar, Settings, LogOut } from "lucide-react";
import type { League, Team, Coach } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

interface LeagueWithDetails extends League {
  teams?: Team[];
  userCoach?: Coach;
  userTeam?: Team;
}

export default function DashboardPage() {
  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: leagues, isLoading } = useQuery<LeagueWithDetails[]>({
    queryKey: ["/api/leagues"],
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold rounded-full flex items-center justify-center">
              <span className="text-forest-dark font-pixel text-xs">CBD</span>
            </div>
            <span className="font-pixel text-gold text-sm hidden sm:block">
              パワプロ College Baseball Dynasty
            </span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-muted-foreground text-sm hidden sm:block">
                {user.email}
              </span>
            )}
            <Link href="/">
              <RetroButton variant="outline" size="sm" data-testid="button-logout">
                <LogOut className="w-4 h-4" />
              </RetroButton>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-pixel text-gold text-xl mb-2">Your Dynasties</h1>
            <p className="text-muted-foreground text-sm">
              Manage your dynasties and join new ones
            </p>
          </div>
          <Link href="/league/create">
            <RetroButton data-testid="button-create-dynasty">
              <Plus className="w-4 h-4 mr-2" />
              New Dynasty
            </RetroButton>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <RetroCard key={i}>
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-20 w-full" />
              </RetroCard>
            ))}
          </div>
        ) : leagues && leagues.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {leagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function LeagueCard({ league }: { league: LeagueWithDetails }) {
  const phaseLabels: Record<string, string> = {
    preseason: "Preseason",
    spring_training: "Spring Training",
    recruiting: "Recruiting",
    regular: "Regular Season",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason: "Offseason",
  };

  return (
    <Link href={`/league/${league.id}`}>
      <RetroCard className="hover:border-gold/50 transition-colors cursor-pointer" data-testid={`card-league-${league.id}`}>
        <RetroCardHeader className="flex items-center justify-between gap-4">
          <span className="truncate">{league.name}</span>
          <span className="text-[8px] text-muted-foreground whitespace-nowrap">
            Season {league.currentSeason}
          </span>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="flex items-center gap-4 mb-4">
            {league.userTeam ? (
              <>
                <TeamBadge
                  abbreviation={league.userTeam.abbreviation}
                  primaryColor={league.userTeam.primaryColor}
                  secondaryColor={league.userTeam.secondaryColor}
                />
                <div>
                  <p className="font-medium text-foreground">
                    {league.userTeam.name} {league.userTeam.mascot}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {league.userTeam.city}, {league.userTeam.state}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                No team selected yet
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <Users className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">
                {league.teams?.length || 0}/{league.maxTeams}
              </p>
            </div>
            <div>
              <Calendar className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">
                Week {league.currentWeek}
              </p>
            </div>
            <div>
              <Trophy className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">
                {phaseLabels[league.currentPhase] || league.currentPhase}
              </p>
            </div>
          </div>
        </RetroCardContent>
      </RetroCard>
    </Link>
  );
}

function EmptyState() {
  return (
    <RetroCard variant="bordered" className="text-center py-12">
      <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
      <h2 className="font-pixel text-gold text-sm mb-2">No Dynasties Yet</h2>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Create your first dynasty to start building your college baseball program.
        Compete against other coaches or CPU opponents.
      </p>
      <Link href="/league/create">
        <RetroButton data-testid="button-create-first-dynasty">
          <Plus className="w-4 h-4 mr-2" />
          Create Your First Dynasty
        </RetroButton>
      </Link>
    </RetroCard>
  );
}
