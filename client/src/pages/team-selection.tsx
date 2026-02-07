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
  stadium?: number;
  marketing?: number;
  collegeLife?: number;
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
  
  const [selectedTeamNames, setSelectedTeamNames] = useState<Set<string>>(new Set());
  const [teamSort, setTeamSort] = useState("name");

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

  const allTeams = useMemo(() => {
    if (!data) return [];
    const teams: (TeamTemplate & { sourceConference: string; sourceConferenceId: string })[] = [];
    for (const pool of data.conferenceTeamPools) {
      for (const team of pool.teams) {
        teams.push({ ...team, sourceConference: pool.conference.name, sourceConferenceId: pool.conference.id });
      }
    }
    return teams;
  }, [data]);

  const sortedTeams = useMemo(() => {
    return [...allTeams].sort((a, b) => {
      switch (teamSort) {
        case "prestige": return (b.prestige || 0) - (a.prestige || 0);
        case "facilities": return (b.facilities || 0) - (a.facilities || 0);
        case "academics": return (b.academics || 0) - (a.academics || 0);
        case "overall": {
          const aAvg = ((a.prestige || 0) + (a.facilities || 0) + (a.academics || 0) + (a.stadium || 0) + (a.marketing || 0) + (a.collegeLife || 0)) / 6;
          const bAvg = ((b.prestige || 0) + (b.facilities || 0) + (b.academics || 0) + (b.stadium || 0) + (b.marketing || 0) + (b.collegeLife || 0)) / 6;
          return bAvg - aAvg;
        }
        default: return a.name.localeCompare(b.name);
      }
    });
  }, [allTeams, teamSort]);

  const toggleTeam = (teamName: string) => {
    setSelectedTeamNames(prev => {
      const next = new Set(prev);
      if (next.has(teamName)) {
        next.delete(teamName);
      } else {
        if (data && next.size >= data.league.maxTeams) {
          toast({ 
            title: "Limit Reached", 
            description: `You can only select ${data.league.maxTeams} teams.`,
            variant: "destructive" 
          });
          return prev;
        }
        next.add(teamName);
      }
      return next;
    });
  };

  const handleContinue = () => {
    if (!data) return;
    
    if (selectedTeamNames.size !== data.league.maxTeams) {
      toast({ 
        title: "Select More Teams", 
        description: `Please select exactly ${data.league.maxTeams} teams.`,
        variant: "destructive" 
      });
      return;
    }

    const selectedArray = Array.from(selectedTeamNames);
    const conferences = data.conferences;
    const numConferences = conferences.length;
    const teamsPerConf = Math.floor(selectedArray.length / numConferences);
    const remainder = selectedArray.length % numConferences;

    const teamsPayload: { conferenceId: string; teamNames: string[] }[] = conferences.map((conf, idx) => ({
      conferenceId: conf.id,
      teamNames: [] as string[],
    }));

    selectedArray.forEach((teamName, idx) => {
      const confIdx = idx % numConferences;
      teamsPayload[confIdx].teamNames.push(teamName);
    });

    saveMutation.mutate(teamsPayload);
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
          <h1 className="font-pixel text-gold text-xl mb-2" data-testid="text-select-teams-title">Select Teams</h1>
          <p className="text-muted-foreground text-sm">
            Choose {data.league.maxTeams} teams for your dynasty. Teams will be auto-distributed across {data.conferences.length} conferences.
          </p>
          <div className="flex justify-center gap-1 mt-4">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <Star className="w-5 h-5 text-gold fill-gold" />
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-muted-foreground">
            <span className="text-gold font-bold" data-testid="text-selected-count">{selectedTeamNames.size}</span> / {data.league.maxTeams} teams selected
          </div>
          <RetroButton
            onClick={handleContinue}
            loading={saveMutation.isPending}
            disabled={selectedTeamNames.size !== data.league.maxTeams}
            data-testid="button-continue-setup"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </RetroButton>
        </div>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {[
            { value: "name", label: "Name" },
            { value: "prestige", label: "Prestige" },
            { value: "facilities", label: "Facilities" },
            { value: "academics", label: "Academics" },
            { value: "overall", label: "Overall" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTeamSort(opt.value)}
              className={`px-2 py-1 text-[10px] font-pixel rounded border transition-colors ${
                teamSort === opt.value ? "bg-gold text-forest-dark border-gold" : "border-border text-muted-foreground hover:border-gold/50"
              }`}
              data-testid={`button-sort-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-8">
          {data.conferenceTeamPools.map(({ conference, teams: poolTeams }) => {
            const sortedPoolTeams = sortedTeams.filter(t => t.sourceConferenceId === conference.id);
            const confSelectedCount = sortedPoolTeams.filter(t => selectedTeamNames.has(t.name)).length;
            return (
              <RetroCard key={conference.id}>
                <RetroCardHeader>
                  <div className="flex justify-between items-center gap-2">
                    <span>{conference.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {confSelectedCount} selected
                    </span>
                  </div>
                </RetroCardHeader>
                <RetroCardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {sortedPoolTeams.map((team) => {
                      const isSelected = selectedTeamNames.has(team.name);
                      return (
                        <button
                          key={team.name}
                          onClick={() => toggleTeam(team.name)}
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
