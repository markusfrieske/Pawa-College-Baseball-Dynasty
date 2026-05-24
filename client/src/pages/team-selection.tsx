import { useState, useMemo, useEffect } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Star, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { Link } from "wouter";
import type { Conference, League } from "@shared/schema";
import { TeamScoutingPanel, type TeamScoutingInfo } from "@/components/team-scouting-panel";

const TOTAL_NATIONAL_TEAMS = 142;

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
  teamsAlreadySelected?: boolean;
}

function TeamTile({
  team,
  isSelected,
  isFocused,
  onClick,
  nationalRank,
  totalTeams,
}: {
  team: TeamTemplate;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
  nationalRank?: number;
  totalTeams?: number;
}) {
  const active = isFocused || isSelected;
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all focus:outline-none ${
        isFocused
          ? "border-gold ring-1 ring-gold/40 bg-gold/10"
          : isSelected
          ? "border-gold bg-gold/5"
          : "border-border hover:border-gold/40 bg-background/40"
      }`}
      title={team.name}
      data-testid={`button-team-${team.abbreviation}`}
    >
      {/* Circle badge */}
      <div className="relative">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
            active ? "border-gold shadow-[0_0_8px_rgba(212,175,55,0.4)]" : "border-border/60"
          }`}
          style={{ backgroundColor: team.primaryColor }}
        >
          <span
            className="font-pixel text-[8px] leading-none text-center px-0.5"
            style={{ color: team.secondaryColor || "#ffffff" }}
          >
            {team.abbreviation}
          </span>
        </div>
        {isSelected && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-gold rounded-full flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-forest-dark" strokeWidth={3} />
          </div>
        )}
      </div>
      {nationalRank !== undefined && (
        <span
          className="text-[8px] leading-none font-pixel text-muted-foreground"
          data-testid={`text-rank-${team.abbreviation}`}
        >
          #{nationalRank}<span className="opacity-50">/{totalTeams ?? 142}</span>
        </span>
      )}
    </button>
  );
}

export default function TeamSelectionPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedTeamNames, setSelectedTeamNames] = useState<Set<string>>(new Set());
  const [teamSort, setTeamSort] = useState("name");
  const [focusedTeam, setFocusedTeam] = useState<string | null>(null);

  const { data, isLoading } = useQuery<TeamSelectionData>({
    queryKey: ["/api/leagues", id, "team-selection"],
  });

  const { data: scoutingMap } = useQuery<Record<string, TeamScoutingInfo>>({
    queryKey: ["/api/team-templates/scouting"],
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
        case "rank": {
          const aRank = scoutingMap?.[a.name]?.nationalRank ?? 9999;
          const bRank = scoutingMap?.[b.name]?.nationalRank ?? 9999;
          return aRank - bRank;
        }
        default: return a.name.localeCompare(b.name);
      }
    });
  }, [allTeams, teamSort, scoutingMap]);

  const toggleTeam = (teamName: string) => {
    setFocusedTeam(teamName);
    setSelectedTeamNames(prev => {
      const next = new Set(prev);
      if (next.has(teamName)) {
        next.delete(teamName);
      } else {
        if (data && next.size >= data.league.maxTeams) {
          toast({
            title: "Limit Reached",
            description: `You can only select ${data.league.maxTeams} teams.`,
            variant: "destructive",
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
        variant: "destructive",
      });
      return;
    }

    const teamsPayload: { conferenceId: string; teamNames: string[] }[] = data.conferenceTeamPools
      .map(({ conference, teams: poolTeams }) => ({
        conferenceId: conference.id,
        teamNames: poolTeams
          .filter(t => selectedTeamNames.has(t.name))
          .map(t => t.name),
      }))
      .filter(entry => entry.teamNames.length > 0);

    saveMutation.mutate(teamsPayload);
  };

  useEffect(() => {
    if (data?.teamsAlreadySelected) {
      setLocation(`/league/${id}/dynasty-setup`);
    }
  }, [data?.teamsAlreadySelected, id, setLocation]);

  if (isLoading || data?.teamsAlreadySelected) {
    return <SetupSkeleton />;
  }

  if (!data) {
    return <div className="p-8 text-center text-muted-foreground">League not found</div>;
  }

  const focusedInfo = focusedTeam && scoutingMap ? scoutingMap[focusedTeam] : null;

  return (
    <div className={`min-h-screen bg-background p-4 ${focusedInfo ? "pb-52" : ""}`}>
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
            Choose {data.league.maxTeams} teams for your dynasty across {data.conferences.length} conferences.
          </p>
          <div className="flex justify-center gap-1 mt-4">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <Star className="w-5 h-5 text-gold fill-gold" />
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-muted-foreground">
            <span className="text-gold font-bold" data-testid="text-selected-count">{selectedTeamNames.size}</span> / {data.league.maxTeams} selected
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
            { value: "rank", label: "Rank" },
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

        <div className="space-y-6">
          {data.conferenceTeamPools.map(({ conference, teams: poolTeams }) => {
            const sortedPoolTeams = sortedTeams.filter(t => t.sourceConferenceId === conference.id);
            const confSelectedCount = sortedPoolTeams.filter(t => selectedTeamNames.has(t.name)).length;
            return (
              <RetroCard key={conference.id}>
                <RetroCardHeader>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm">{conference.name}</span>
                    {confSelectedCount > 0 && (
                      <span className="text-xs text-gold font-pixel">
                        {confSelectedCount} selected
                      </span>
                    )}
                  </div>
                </RetroCardHeader>
                <RetroCardContent>
                  <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {sortedPoolTeams.map((team) => (
                      <TeamTile
                        key={team.name}
                        team={team}
                        isSelected={selectedTeamNames.has(team.name)}
                        isFocused={focusedTeam === team.name}
                        onClick={() => toggleTeam(team.name)}
                        nationalRank={scoutingMap?.[team.name]?.nationalRank}
                        totalTeams={TOTAL_NATIONAL_TEAMS}
                      />
                    ))}
                  </div>
                </RetroCardContent>
              </RetroCard>
            );
          })}
        </div>
      </div>

      {/* Fixed scouting panel at bottom */}
      {focusedInfo && focusedTeam && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-4 duration-200">
          <TeamScoutingPanel
            teamName={focusedTeam}
            info={focusedInfo}
            onClose={() => setFocusedTeam(null)}
            variant="fixed"
          />
        </div>
      )}
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
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                  <Skeleton key={j} className="h-20" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
