import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Plus, Trophy, Users, Calendar, LogOut, Trash2, UserCheck, BookOpen, FolderOpen, GraduationCap } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { League, Team, Coach } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LeagueWithDetails extends League {
  teams?: Team[];
  userCoach?: Coach;
  userTeam?: Team;
}

interface SavedRoster {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  basedOn: string;
  rosterData: any[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface SavedRecruitingClass {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  recruitCount: number;
  classData: any[];
  createdAt: string | null;
  updatedAt: string | null;
}

export default function DashboardPage() {
  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: leagues, isLoading } = useQuery<LeagueWithDetails[]>({
    queryKey: ["/api/leagues"],
  });

  const { data: savedRosters = [], isLoading: rostersLoading } = useQuery<SavedRoster[]>({
    queryKey: ["/api/saved-rosters"],
  });

  const { data: savedRecruitingClasses = [], isLoading: classesLoading } = useQuery<SavedRecruitingClass[]>({
    queryKey: ["/api/saved-recruiting-classes"],
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 cursor-pointer" data-testid="link-home-logo">
            <div className="w-10 h-10 bg-gold rounded-full flex items-center justify-center">
              <span className="text-forest-dark font-pixel text-xs">CBD</span>
            </div>
            <span className="font-pixel text-gold text-sm hidden sm:block">
              パワプロ College Baseball Dynasty
            </span>
          </Link>
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
        {/* Dynasties */}
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

        {/* Saved Rosters */}
        <div className="mt-10">
          <h2 className="font-pixel text-gold text-lg mb-4" data-testid="section-rosters">Your Rosters</h2>
          {rostersLoading ? (
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <RetroCard key={i}>
                  <Skeleton className="h-6 w-48 mb-4" />
                  <Skeleton className="h-16 w-full" />
                </RetroCard>
              ))}
            </div>
          ) : savedRosters.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {savedRosters.map((roster) => (
                <SavedRosterCard key={roster.id} roster={roster} />
              ))}
            </div>
          ) : (
            <RosterEmptyState />
          )}
        </div>

        {/* Saved Recruiting Classes */}
        <div className="mt-10">
          <h2 className="font-pixel text-gold text-lg mb-4" data-testid="section-recruiting">Your Recruiting Classes</h2>
          {classesLoading ? (
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <RetroCard key={i}>
                  <Skeleton className="h-6 w-48 mb-4" />
                  <Skeleton className="h-16 w-full" />
                </RetroCard>
              ))}
            </div>
          ) : savedRecruitingClasses.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {savedRecruitingClasses.map((rc) => (
                <SavedRecruitingClassCard key={rc.id} rc={rc} />
              ))}
            </div>
          ) : (
            <RecruitingEmptyState />
          )}
        </div>
      </main>
    </div>
  );
}

function SavedRosterCard({ roster }: { roster: SavedRoster }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/saved-rosters/${roster.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-rosters"] });
      toast({ title: "Roster Deleted", description: `"${roster.name}" has been deleted.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete roster.", variant: "destructive" });
    },
  });

  const players = Array.isArray(roster.rosterData) ? roster.rosterData : [];
  const playerCount = players.length;
  const avgOvr = playerCount > 0
    ? Math.round(players.reduce((s: number, p: any) => s + (p.overall || 0), 0) / playerCount)
    : 0;
  const savedDate = roster.createdAt ? new Date(roster.createdAt).toLocaleDateString() : "";

  return (
    <RetroCard className="hover:border-gold/50 transition-colors" data-testid={`card-saved-roster-${roster.id}`}>
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-gold shrink-0" />
          <span className="font-pixel text-sm text-gold truncate">{roster.name}</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <RetroButton variant="ghost" size="sm" data-testid={`button-delete-roster-${roster.id}`}>
              <Trash2 className="w-3 h-3 text-red-400" />
            </RetroButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Roster File</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{roster.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-red-600 hover:bg-red-700"
                data-testid={`button-confirm-delete-roster-${roster.id}`}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <span>{roster.basedOn}</span>
          {savedDate && <><span>·</span><span>{savedDate}</span></>}
        </div>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <Users className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">{playerCount} Players</p>
          </div>
          <div>
            <Trophy className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">{avgOvr > 0 ? `${avgOvr} Avg OVR` : "—"}</p>
          </div>
        </div>
        {roster.description && (
          <p className="text-xs text-muted-foreground mt-3 italic">{roster.description}</p>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function SavedRecruitingClassCard({ rc }: { rc: SavedRecruitingClass }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/saved-recruiting-classes/${rc.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
      toast({ title: "Recruiting Class Deleted", description: `"${rc.name}" has been deleted.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete recruiting class.", variant: "destructive" });
    },
  });

  const recruits = Array.isArray(rc.classData) ? rc.classData : [];
  const classSize = recruits.length || rc.recruitCount;
  const committed = recruits.filter((r: any) => r.signedTeamId || r.stage === "signed").length;
  const savedDate = rc.createdAt ? new Date(rc.createdAt).toLocaleDateString() : "";

  return (
    <RetroCard className="hover:border-gold/50 transition-colors" data-testid={`card-saved-class-${rc.id}`}>
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <GraduationCap className="w-4 h-4 text-gold shrink-0" />
          <span className="font-pixel text-sm text-gold truncate">{rc.name}</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <RetroButton variant="ghost" size="sm" data-testid={`button-delete-class-${rc.id}`}>
              <Trash2 className="w-3 h-3 text-red-400" />
            </RetroButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Recruiting Class</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{rc.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-red-600 hover:bg-red-700"
                data-testid={`button-confirm-delete-class-${rc.id}`}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </RetroCardHeader>
      <RetroCardContent>
        {savedDate && (
          <div className="text-xs text-muted-foreground mb-3">{savedDate}</div>
        )}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <BookOpen className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">{classSize} Recruits</p>
          </div>
          <div>
            <UserCheck className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">{committed} Signed</p>
          </div>
        </div>
        {rc.description && (
          <p className="text-xs text-muted-foreground mt-3 italic">{rc.description}</p>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function LeagueCard({ league }: { league: LeagueWithDetails }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/leagues/${league.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      toast({ title: "League Deleted", description: `"${league.name}" has been deleted.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const phaseLabels: Record<string, string> = {
    dynasty_setup: "Dynasty Setup",
    preseason: "Spring Training",
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
    <RetroCard className="hover:border-gold/50 transition-colors" data-testid={`card-league-${league.id}`}>
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <Link href={league.currentPhase === "dynasty_setup" ? `/league/${league.id}/dynasty-setup` : `/league/${league.id}`} className="truncate cursor-pointer hover:text-gold transition-colors">
          <span>{league.name}</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-muted-foreground whitespace-nowrap">
            Season {league.currentSeason}
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <RetroButton
                variant="ghost"
                size="sm"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                data-testid={`button-delete-league-${league.id}`}
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </RetroButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Dynasty</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{league.name}"? This will permanently remove all teams, players, games, and other data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid={`button-confirm-delete-league-${league.id}`}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete Dynasty"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </RetroCardHeader>
      <Link href={`/league/${league.id}`} className="cursor-pointer">
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
      </Link>
    </RetroCard>
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

function RosterEmptyState() {
  return (
    <RetroCard variant="bordered" className="text-center py-8">
      <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="font-pixel text-muted-foreground text-xs mb-2">No Saved Rosters</p>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">
        Open your dynasty's roster page and use "Save Roster File" to create a snapshot here.
      </p>
    </RetroCard>
  );
}

function RecruitingEmptyState() {
  return (
    <RetroCard variant="bordered" className="text-center py-8">
      <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="font-pixel text-muted-foreground text-xs mb-2">No Saved Recruiting Classes</p>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">
        Open your dynasty's recruiting page and use "Save Class File" to create a snapshot here.
      </p>
    </RetroCard>
  );
}
