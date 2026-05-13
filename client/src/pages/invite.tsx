import { useState } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { AlertTriangle, Check, Users, Trophy, LogIn } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, Team, LeagueInvite, User } from "@shared/schema";

interface InviteData {
  invite: LeagueInvite;
  league: League;
  availableTeams: Team[];
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // Check if user is authenticated
  const { data: user, isLoading: userLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 0,
  });

  const { data, isLoading, error } = useQuery<InviteData>({
    queryKey: ["/api/invites", code],
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTeamId) throw new Error("Please select a team");
      const res = await apiRequest("POST", `/api/invites/${code}/accept`, { teamId: selectedTeamId });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to accept invite");
      }
      return res.json() as Promise<{ success: boolean; leagueId: string; teamId: string }>;
    },
    onSuccess: (result) => {
      toast({ title: "Welcome to the Dynasty!", description: "You have successfully joined the dynasty." });
      setLocation(`/league/${result.leagueId}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const isAuthenticated = !!user;

  if (isLoading || userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    const errorMessage = error instanceof Error
      ? parseErrorMessage(error)
      : "This invite link is invalid, expired, or has already been used.";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <RetroCard className="w-full max-w-md text-center">
          <RetroCardContent>
            <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="font-pixel text-gold text-lg mb-2">Invalid Invite</h2>
            <p className="text-muted-foreground mb-6" data-testid="text-invite-error">
              {errorMessage}
            </p>
            <RetroButton onClick={() => setLocation("/")} data-testid="button-go-home">
              Go Home
            </RetroButton>
          </RetroCardContent>
        </RetroCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6 text-center">
          <h1 className="font-pixel text-gold text-xl mb-2">You're Invited!</h1>
          <p className="text-muted-foreground">
            Join <span className="text-gold">{data.league.name}</span>
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <RetroCard className="mb-6">
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-gold" />
              <span>Dynasty Details</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Dynasty Name</p>
                <p className="font-semibold">{data.league.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Season</p>
                <p className="font-semibold">Season {data.league.currentSeason}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Max Teams</p>
                <p className="font-semibold">{data.league.maxTeams} teams</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phase</p>
                <p className="font-semibold">{data.league.currentPhase}</p>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>

        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gold" />
              <span>Select Your Team</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent>
            {!isAuthenticated ? (
              <div className="text-center py-8">
                <LogIn className="w-12 h-12 text-gold mx-auto mb-4" />
                <p className="text-lg font-semibold mb-2">Sign In Required</p>
                <p className="text-muted-foreground mb-6">
                  Sign in or create an account to join this dynasty.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Link href={`/login?redirect=/invite/${code}`}>
                    <RetroButton data-testid="button-login-to-accept">
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In
                    </RetroButton>
                  </Link>
                  <Link href={`/register?redirect=/invite/${code}`}>
                    <RetroButton variant="outline" data-testid="button-register-to-accept">
                      Create Account
                    </RetroButton>
                  </Link>
                </div>
              </div>
            ) : data.availableTeams.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                <p className="text-muted-foreground">No teams available</p>
                <p className="text-sm text-muted-foreground mt-2">
                  All teams in this league have been claimed by other coaches.
                </p>
              </div>
            ) : (
              <>
                <p className="text-muted-foreground mb-4">
                  Choose an available team to control in this league. This cannot be changed later.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.availableTeams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`
                        flex items-center gap-3 p-4 rounded border transition-all text-left
                        ${selectedTeamId === team.id
                          ? "border-gold bg-gold/10"
                          : "border-border hover:border-gold/50 hover:bg-muted/50"
                        }
                      `}
                      data-testid={`button-select-team-${team.id}`}
                    >
                      <TeamBadge
                        abbreviation={team.abbreviation}
                        primaryColor={team.primaryColor}
                        secondaryColor={team.secondaryColor || undefined}
                        size="md"
                      />
                      <div className="flex-1">
                        <p className="font-semibold">{team.name}</p>
                        <p className="text-xs text-muted-foreground">{team.mascot}</p>
                      </div>
                      {selectedTeamId === team.id && (
                        <Check className="w-5 h-5 text-gold" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex justify-center">
                  <RetroButton
                    onClick={() => acceptMutation.mutate()}
                    disabled={!selectedTeamId || acceptMutation.isPending}
                    className="min-w-48"
                    data-testid="button-accept-invite"
                  >
                    {acceptMutation.isPending ? "Joining..." : "Join Dynasty"}
                  </RetroButton>
                </div>
              </>
            )}
          </RetroCardContent>
        </RetroCard>
      </main>
    </div>
  );
}
