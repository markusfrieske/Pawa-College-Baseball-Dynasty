import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Star, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { Link } from "wouter";
import type { Conference, League } from "@shared/schema";

interface TeamTemplate {
  name: string;
  mascot: string;
  abbreviation: string;
  city: string;
  state: string;
  primaryColor: string;
  secondaryColor: string;
  prestige: number;
  facilities: number;
  academics: number;
}

interface ConferenceTeamPool {
  conference: Conference;
  teams: TeamTemplate[];
}

interface TeamSelectionData {
  league: League;
  conferences: Conference[];
  conferenceTeamPools: ConferenceTeamPool[];
}

export default function TeamSelectionPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedTeams, setSelectedTeams] = useState<Record<string, string[]>>({});

  const { data, isLoading } = useQuery<TeamSelectionData>({
    queryKey: ["/api/leagues", id, "team-selection"],
  });

  const saveMutation = useMutation({
    mutationFn: async (teams: { conferenceId: string; teamNames: string[] }[]) => {
      return apiRequest("POST", `/api/leagues/${id}/team-selection`, { selectedTeams: teams });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      toast({ title: "Teams Selected!", description: "Now select your team and create your coach." });
      setLocation(`/league/${id}/setup`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const teamsPerConference = useMemo(() => {
    if (!data) return 0;
    const numConferences = data.conferences.length;
    if (numConferences === 0) return 0;
    return Math.ceil(data.league.maxTeams / numConferences);
  }, [data]);

  const toggleTeam = (conferenceId: string, teamName: string) => {
    const current = selectedTeams[conferenceId] || [];
    
    if (current.includes(teamName)) {
      setSelectedTeams(prev => ({ 
        ...prev, 
        [conferenceId]: (prev[conferenceId] || []).filter(t => t !== teamName) 
      }));
      return;
    }
    
    if (current.length >= teamsPerConference) {
      toast({ 
        title: "Limit Reached", 
        description: `You can only select ${teamsPerConference} teams per conference.`,
        variant: "destructive" 
      });
      return;
    }
    
    setSelectedTeams(prev => ({ 
      ...prev, 
      [conferenceId]: [...(prev[conferenceId] || []), teamName] 
    }));
  };

  const totalSelected = useMemo(() => {
    return Object.values(selectedTeams).flat().length;
  }, [selectedTeams]);

  const handleContinue = () => {
    if (!data) return;
    
    if (totalSelected !== data.league.maxTeams) {
      toast({ 
        title: "Select More Teams", 
        description: `Please select exactly ${data.league.maxTeams} teams total.`,
        variant: "destructive" 
      });
      return;
    }

    const teamsArray = Object.entries(selectedTeams).map(([conferenceId, teamNames]) => ({
      conferenceId,
      teamNames,
    }));

    saveMutation.mutate(teamsArray);
  };

  if (isLoading) {
    return <SetupSkeleton />;
  }

  if (!data) {
    return <div className="p-8 text-center text-muted-foreground">League not found</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-gold transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </Link>
        </div>

        <div className="text-center mb-8">
          <div className="flex justify-center gap-1 mb-4">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <Star className="w-5 h-5 text-gold fill-gold" />
          </div>
          <h1 className="font-pixel text-gold text-xl mb-2">Select Teams</h1>
          <p className="text-muted-foreground text-sm">
            Choose {data.league.maxTeams} teams for your dynasty ({teamsPerConference} per conference)
          </p>
          <div className="flex justify-center gap-1 mt-4">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <Star className="w-5 h-5 text-gold fill-gold" />
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div className="text-sm text-muted-foreground">
            <span className="text-gold font-bold">{totalSelected}</span> / {data.league.maxTeams} teams selected
          </div>
          <RetroButton
            onClick={handleContinue}
            loading={saveMutation.isPending}
            disabled={totalSelected !== data.league.maxTeams}
            data-testid="button-continue-setup"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </RetroButton>
        </div>

        <div className="space-y-8">
          {data.conferenceTeamPools.map(({ conference, teams }) => {
            const confSelected = selectedTeams[conference.id] || [];
            return (
              <RetroCard key={conference.id}>
                <RetroCardHeader>
                  <div className="flex justify-between items-center">
                    <span>{conference.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {confSelected.length} / {teamsPerConference} selected
                    </span>
                  </div>
                </RetroCardHeader>
                <RetroCardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {teams.map((team) => {
                      const isSelected = confSelected.includes(team.name);
                      return (
                        <button
                          key={team.name}
                          onClick={() => toggleTeam(conference.id, team.name)}
                          className={`p-3 rounded border-2 text-left transition-all ${
                            isSelected
                              ? "border-gold bg-gold/20"
                              : "border-border hover:border-gold/50"
                          }`}
                          data-testid={`button-team-${team.abbreviation}`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <TeamBadge
                              abbreviation={team.abbreviation}
                              primaryColor={team.primaryColor}
                              secondaryColor={team.secondaryColor}
                              size="sm"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{team.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{team.mascot}</p>
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 text-gold flex-shrink-0" />
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                            <div>
                              <p className="text-gold font-bold">{team.prestige}</p>
                              <p className="text-muted-foreground">Prestige</p>
                            </div>
                            <div>
                              <p className="font-bold">{team.facilities}</p>
                              <p className="text-muted-foreground">Facilities</p>
                            </div>
                            <div>
                              <p className="font-bold">{team.academics}</p>
                              <p className="text-muted-foreground">Academics</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </RetroCardContent>
              </RetroCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SetupSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-5xl">
        <Skeleton className="h-8 w-48 mx-auto mb-8" />
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <Skeleton key={j} className="h-24" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
