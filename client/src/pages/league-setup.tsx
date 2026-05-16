import { useState } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroSelect } from "@/components/ui/retro-select";
import { TeamBadge } from "@/components/ui/team-badge";
import { CoachAvatar } from "@/components/coach-avatar";
import { AttributeSlider } from "@/components/ui/attribute-slider";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Star, ArrowRight, ArrowLeft, Search, Target, GraduationCap, Building2, User, Cpu, Eye, Zap } from "lucide-react";
import type { Team, Coach, Conference, League } from "@shared/schema";

interface TeamCoachInfo {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
}

interface TeamWithCoach extends Team {
  coach: TeamCoachInfo | null;
}

interface SetupData {
  teams: TeamWithCoach[];
  conferences: Conference[];
  league: League;
  selectedTeam?: Team;
  coach?: Coach;
}

interface ArchetypeSkills {
  scouting: number;
  evaluation: number;
  pitchers: number;
  hitters: number;
}

const archetypeSkillTrees: Record<string, ArchetypeSkills> = {
  "Balanced": { scouting: 2, evaluation: 2, pitchers: 2, hitters: 2 },
  "Pure CEO": { scouting: 1, evaluation: 1, pitchers: 4, hitters: 2 },
  "Player's Coach": { scouting: 2, evaluation: 3, pitchers: 2, hitters: 1 },
  "Tactician": { scouting: 4, evaluation: 2, pitchers: 1, hitters: 1 },
  "Old School": { scouting: 1, evaluation: 4, pitchers: 2, hitters: 1 },
  "Scout Master": { scouting: 4, evaluation: 3, pitchers: 0, hitters: 1 },
  "Academic Dean": { scouting: 2, evaluation: 3, pitchers: 1, hitters: 2 },
  "Dealmaker": { scouting: 1, evaluation: 2, pitchers: 2, hitters: 3 },
};

const archetypeOptions = [
  { value: "Balanced", label: "Balanced" },
  { value: "Pure CEO", label: "Pure CEO" },
  { value: "Player's Coach", label: "Player's Coach" },
  { value: "Tactician", label: "Tactician" },
  { value: "Old School", label: "Old School" },
  { value: "Scout Master", label: "Scout Master" },
  { value: "Academic Dean", label: "Academic Dean" },
  { value: "Dealmaker", label: "Dealmaker" },
];

const skinToneOptions = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "tan", label: "Tan" },
  { value: "dark", label: "Dark" },
  { value: "deep", label: "Deep" },
];

const hairColorOptions = [
  { value: "black", label: "Black" },
  { value: "brown", label: "Brown" },
  { value: "blonde", label: "Blonde" },
  { value: "red", label: "Red" },
  { value: "gray", label: "Gray" },
  { value: "white", label: "White" },
];

const hairStyleOptions = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
  { value: "bald", label: "Bald" },
];

export default function LeagueSetupPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"team" | "coach">("team");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [coachData, setCoachData] = useState({
    firstName: "",
    lastName: "",
    archetype: "Balanced",
    skinTone: "light",
    hairColor: "brown",
    hairStyle: "short",
  });

  const { data, isLoading } = useQuery<SetupData>({
    queryKey: ["/api/leagues", id, "setup"],
  });

  const setupMutation = useMutation({
    mutationFn: async (payload: { teamId: string; coach: typeof coachData }) => {
      return apiRequest("POST", `/api/leagues/${id}/setup`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      toast({ title: "Setup Complete!", description: "Welcome to your dynasty!" });
      setLocation(`/league/${id}/dynasty-setup`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  if (isLoading) {
    return <SetupSkeleton />;
  }

  const selectedTeam = data?.teams.find(t => t.id === selectedTeamId);

  const handleComplete = () => {
    if (!selectedTeamId || !coachData.firstName || !coachData.lastName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    setupMutation.mutate({ teamId: selectedTeamId, coach: coachData });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex justify-center gap-1 mb-4">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <Star className="w-5 h-5 text-gold fill-gold" />
          </div>
          <h1 className="font-pixel text-gold text-xl mb-2">
            {step === "team" ? "Select Your Team" : "Create Your Coach"}
          </h1>
          <div className="flex justify-center gap-1 mt-4">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <Star className="w-5 h-5 text-gold fill-gold" />
          </div>
        </div>

        <div className="flex items-center justify-between mb-8">
          {step === "coach" ? (
            <RetroButton variant="outline" onClick={() => setStep("team")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </RetroButton>
          ) : (
            <div />
          )}
          
          <div className="flex items-center gap-4">
            <StepIndicator step={1} label="Team" active={step === "team"} completed={step === "coach"} />
            <div className="w-8 h-0.5 bg-border" />
            <StepIndicator step={2} label="Coach" active={step === "coach"} completed={false} />
          </div>

          {step === "team" ? (
            <RetroButton
              onClick={() => {
                if (selectedTeamId) setStep("coach");
                else toast({ title: "Select a team", variant: "destructive" });
              }}
              disabled={!selectedTeamId}
              data-testid="button-next-step"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </RetroButton>
          ) : (
            <RetroButton
              onClick={handleComplete}
              loading={setupMutation.isPending}
              disabled={!coachData.firstName || !coachData.lastName}
              data-testid="button-complete-setup"
            >
              Start Dynasty
              <ArrowRight className="w-4 h-4 ml-2" />
            </RetroButton>
          )}
        </div>

        {step === "team" ? (
          <TeamSelectionStep
            teams={data?.teams || []}
            conferences={data?.conferences || []}
            selectedTeamId={selectedTeamId}
            onSelect={setSelectedTeamId}
          />
        ) : (
          <CoachCreationStep
            selectedTeam={selectedTeam!}
            coachData={coachData}
            setCoachData={setCoachData}
          />
        )}
      </div>
    </div>
  );
}

function StepIndicator({ 
  step, 
  label, 
  active, 
  completed 
}: { 
  step: number; 
  label: string; 
  active: boolean; 
  completed: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center font-pixel text-xs
          ${active ? "bg-gold text-forest-dark" : completed ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}
      >
        {step}
      </div>
      <span className={`font-pixel text-[10px] ${active ? "text-gold" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

function TeamSelectionStep({
  teams,
  conferences,
  selectedTeamId,
  onSelect,
}: {
  teams: TeamWithCoach[];
  conferences: Conference[];
  selectedTeamId: string | null;
  onSelect: (id: string) => void;
}) {
  const [teamSort, setTeamSort] = useState("name");
  
  const sortTeams = (teamList: TeamWithCoach[]) => {
    return [...teamList].sort((a, b) => {
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
  };

  // Group teams by conference
  const teamsByConference = conferences.map(conf => ({
    conference: conf,
    teams: sortTeams(teams.filter(t => t.conferenceId === conf.id)),
  }));

  // Teams without a conference (unassigned)
  const unassignedTeams = teams.filter(t => !t.conferenceId);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-muted-foreground">Sort by:</span>
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
      {teamsByConference.map(({ conference, teams: confTeams }) => (
        <div key={conference.id}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-pixel text-sm text-gold">{conference.name}</h3>
            <span className="text-xs text-muted-foreground">{confTeams.length} teams</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {confTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                isSelected={selectedTeamId === team.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}

      {unassignedTeams.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-pixel text-sm text-muted-foreground">Unassigned</h3>
            <span className="text-xs text-muted-foreground">{unassignedTeams.length} teams</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unassignedTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                isSelected={selectedTeamId === team.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 && (
        <RetroCard variant="bordered" className="text-center py-12">
          <p className="text-muted-foreground">No teams in this dynasty</p>
        </RetroCard>
      )}
    </div>
  );
}

function TeamCard({
  team,
  isSelected,
  onSelect,
}: {
  team: TeamWithCoach;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const hasCoach = !!team.coach;
  const isHuman = hasCoach && !!team.coach?.userId;
  const isCpu = hasCoach && !team.coach?.userId;
  const isAvailable = !hasCoach;

  return (
    <div
      className={`text-left p-4 rounded border-2 transition-all ${
        isSelected
          ? "border-gold bg-gold/10"
          : isAvailable
          ? "border-border hover:border-gold/50 cursor-pointer"
          : "border-border/50 opacity-60"
      }`}
      onClick={() => isAvailable && !isSelected && onSelect(team.id)}
      data-testid={`button-team-${team.id}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <TeamBadge
          abbreviation={team.abbreviation}
          primaryColor={team.primaryColor}
          secondaryColor={team.secondaryColor}
          name={team.name}
          mascot={team.mascot}
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{team.name}</p>
          <p className="text-sm text-muted-foreground truncate">{team.mascot}</p>
        </div>
        {hasCoach && (
          <div
            className={`px-2 py-1 rounded text-[8px] font-pixel flex items-center gap-1 ${
              isHuman ? "bg-blue-500/20 text-blue-400" : "bg-orange-500/20 text-orange-400"
            }`}
            data-testid={`badge-${isHuman ? "human" : "cpu"}-${team.id}`}
          >
            {isHuman ? <User className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
            {isHuman ? "Human" : "CPU"}
          </div>
        )}
      </div>
      
      {hasCoach && team.coach && (
        <p className="text-xs text-muted-foreground mb-2 truncate">
          HC {team.coach.firstName} {team.coach.lastName}
        </p>
      )}
      
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
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
    </div>
  );
}

function CoachCreationStep({
  selectedTeam,
  coachData,
  setCoachData,
}: {
  selectedTeam: Team;
  coachData: {
    firstName: string;
    lastName: string;
    archetype: string;
    skinTone: string;
    hairColor: string;
    hairStyle: string;
  };
  setCoachData: React.Dispatch<React.SetStateAction<typeof coachData>>;
}) {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <RetroCard>
          <RetroCardHeader>Coach Details</RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <RetroInput
                label="First Name"
                value={coachData.firstName}
                onChange={(e) => setCoachData(prev => ({ ...prev, firstName: e.target.value }))}
                placeholder="Enter first name"
                maxLength={20}
                data-testid="input-first-name"
              />
              <RetroInput
                label="Last Name"
                value={coachData.lastName}
                onChange={(e) => setCoachData(prev => ({ ...prev, lastName: e.target.value }))}
                placeholder="Enter last name"
                maxLength={20}
                data-testid="input-last-name"
              />
            </div>

            <RetroSelect
              label="Coach Archetype"
              options={archetypeOptions}
              value={coachData.archetype}
              onChange={(e) => setCoachData(prev => ({ ...prev, archetype: e.target.value }))}
              data-testid="select-archetype"
            />

            <SkillTreeDisplay archetype={coachData.archetype} />
          </RetroCardContent>
        </RetroCard>

        <RetroCard>
          <RetroCardHeader>Appearance</RetroCardHeader>
          <RetroCardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              <RetroSelect
                label="Skin Tone"
                options={skinToneOptions}
                value={coachData.skinTone}
                onChange={(e) => setCoachData(prev => ({ ...prev, skinTone: e.target.value }))}
                data-testid="select-skin-tone"
              />
              <RetroSelect
                label="Hair Color"
                options={hairColorOptions}
                value={coachData.hairColor}
                onChange={(e) => setCoachData(prev => ({ ...prev, hairColor: e.target.value }))}
                data-testid="select-hair-color"
              />
              <RetroSelect
                label="Hair Style"
                options={hairStyleOptions}
                value={coachData.hairStyle}
                onChange={(e) => setCoachData(prev => ({ ...prev, hairStyle: e.target.value }))}
                data-testid="select-hair-style"
              />
            </div>
          </RetroCardContent>
        </RetroCard>
      </div>

      <div className="space-y-6">
        <RetroCard className="text-center">
          <RetroCardHeader>Preview</RetroCardHeader>
          <CoachAvatar
            skinTone={coachData.skinTone}
            hairColor={coachData.hairColor}
            hairStyle={coachData.hairStyle}
            size="lg"
            className="mx-auto mb-4"
            teamPrimaryColor={selectedTeam?.primaryColor}
          />
          <p className="font-medium text-foreground mb-1">
            HC {coachData.firstName || "First"} {coachData.lastName || "Last"}
          </p>
          <p className="text-sm text-muted-foreground mb-3">{coachData.archetype}</p>
          <div className="flex items-center justify-center gap-2">
            <TeamBadge
              abbreviation={selectedTeam.abbreviation}
              primaryColor={selectedTeam.primaryColor}
              secondaryColor={selectedTeam.secondaryColor}
              name={selectedTeam.name}
              mascot={selectedTeam.mascot}
              size="sm"
            />
            <span className="text-sm">{selectedTeam.name}</span>
          </div>
        </RetroCard>

      </div>
    </div>
  );
}

function SetupSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl">
        <Skeleton className="h-8 w-48 mx-auto mb-8" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    </div>
  );
}

function SkillTreeDisplay({ archetype }: { archetype: string }) {
  const skills = archetypeSkillTrees[archetype] || archetypeSkillTrees["Balanced"];
  
  const skillItems = [
    { key: "scouting", label: "Scouting", icon: Search, color: "text-blue-400", value: skills.scouting, maxValue: 4 },
    { key: "evaluation", label: "Evaluation", icon: Eye, color: "text-purple-400", value: skills.evaluation, maxValue: 4 },
    { key: "pitchers", label: "Pitchers", icon: Target, color: "text-green-400", value: skills.pitchers, maxValue: 4 },
    { key: "hitters", label: "Hitters", icon: Zap, color: "text-orange-400", value: skills.hitters, maxValue: 4 },
  ];

  return (
    <div className="mt-6 p-4 bg-background/50 border border-border rounded">
      <h4 className="font-pixel text-[10px] text-muted-foreground uppercase mb-2">Archetype Skill Boosts</h4>
      <p className="text-[10px] text-muted-foreground mb-4">Higher bars mean faster progress in that skill tree. Scouting reveals recruit attributes faster. Evaluation improves accuracy of player ratings. Pitchers/Hitters boost recruiting effectiveness for those positions.</p>
      <div className="grid grid-cols-4 gap-3">
        {skillItems.map((skill) => (
          <div key={skill.key} className="flex flex-col items-center gap-2" data-testid={`skill-${skill.key}`}>
            <div className={`p-2 bg-card border border-border rounded ${skill.color}`}>
              <skill.icon className="w-4 h-4" />
            </div>
            <span className="text-[8px] text-muted-foreground font-pixel">{skill.label}</span>
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className={`w-2 h-4 rounded-sm transition-all ${
                      n <= skill.value ? "bg-gold" : "bg-border"
                    }`}
                  />
                ))}
              </div>
              <span className="font-pixel text-[10px] text-gold w-4">+{skill.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
