import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroSelect } from "@/components/ui/retro-select";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Star, ArrowLeft, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";

const difficultyOptions = [
  { value: "beginner", label: "Beginner - Easy, relaxed pace" },
  { value: "high_school", label: "High School - Moderate competition level" },
  { value: "all_american", label: "All-American - Aggressive, skilled rivals" },
  { value: "elite", label: "Elite - Ruthless, dominant opponents" },
];

const availableConferences = [
  { id: "SEC", name: "SEC", teams: 16, description: "Southeastern Conference" },
  { id: "ACC", name: "ACC", teams: 17, description: "Atlantic Coast Conference" },
  { id: "Big 12", name: "Big 12", teams: 14, description: "Big 12 Conference" },
  { id: "Big Ten", name: "Big Ten", teams: 18, description: "Big Ten Conference" },
  { id: "Pac-12", name: "Pac-12", teams: 2, description: "Pacific-12 Conference" },
  { id: "AAC", name: "AAC", teams: 11, description: "American Athletic Conference" },
  { id: "WCC", name: "WCC", teams: 8, description: "West Coast Conference" },
  { id: "Mountain West", name: "Mountain West", teams: 6, description: "Mountain West Conference" },
  { id: "Ivy League", name: "Ivy League", teams: 8, description: "Ivy League" },
  { id: "Sun Belt", name: "Sun Belt", teams: 13, description: "Sun Belt Conference" },
  { id: "Big West", name: "Big West", teams: 10, description: "Big West Conference" },
  { id: "HBCU", name: "HBCU", teams: 16, description: "Historically Black Colleges & Universities" },
  { id: "Missouri Valley", name: "Missouri Valley", teams: 13, description: "Missouri Valley Conference" },
];

const seasonLengthOptions = [
  { value: "short", label: "Short Season - 10 Games (5 weeks)" },
  { value: "medium", label: "Standard Season - 20 Games (5 weeks)" },
  { value: "long", label: "Long Season - 40 Games (10 weeks)" },
];

export default function LeagueCreatePage() {
  const [name, setName] = useState("");
  const [maxTeams, setMaxTeams] = useState("8");
  const [cpuDifficulty, setCpuDifficulty] = useState("high_school");
  const [selectedConferences, setSelectedConferences] = useState<string[]>(["SEC", "ACC"]);
  const [seasonLength, setSeasonLength] = useState("medium");
  const [progressionEnabled, setProgressionEnabled] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const totalAvailableTeams = useMemo(() => {
    return selectedConferences.reduce((sum, confId) => {
      const conf = availableConferences.find(c => c.id === confId);
      return sum + (conf?.teams || 0);
    }, 0);
  }, [selectedConferences]);

  const teamCountOptions = useMemo(() => {
    const counts = [6, 8, 10, 12, 14, 16, 18];
    const options = counts
      .filter(n => n < totalAvailableTeams)
      .map(n => ({ value: String(n), label: `${n} Teams` }));
    if (totalAvailableTeams > 0) {
      options.push({ value: String(totalAvailableTeams), label: `All Teams (${totalAvailableTeams})` });
    }
    return options;
  }, [totalAvailableTeams]);

  const toggleConference = (confId: string) => {
    setSelectedConferences(prev => {
      const next = prev.includes(confId) 
        ? prev.filter(c => c !== confId)
        : [...prev, confId];
      const newTotal = next.reduce((sum, id) => {
        const conf = availableConferences.find(c => c.id === id);
        return sum + (conf?.teams || 0);
      }, 0);
      const currentTeamCount = parseInt(maxTeams);
      if (currentTeamCount > newTotal && newTotal > 0) {
        const validCounts = [6, 8, 10, 12, 14, 16, 18].filter(n => n <= newTotal);
        if (validCounts.length > 0) {
          setMaxTeams(String(validCounts[validCounts.length - 1]));
        } else {
          setMaxTeams(String(newTotal));
        }
      }
      return next;
    });
  };

  const createLeagueMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      maxTeams: number;
      cpuDifficulty: string;
      selectedConferences: string[];
      seasonLength: string;
      progressionEnabled: boolean;
    }) => {
      return apiRequest("POST", "/api/leagues", data);
    },
    onSuccess: async (response) => {
      const league = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      toast({
        title: "Dynasty Created!",
        description: `${name} has been created. Now select your teams!`,
      });
      setLocation(`/league/${league.id}/team-selection`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create dynasty. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: "Dynasty name required",
        description: "Please enter a name for your dynasty.",
        variant: "destructive",
      });
      return;
    }
    if (selectedConferences.length < 1) {
      toast({
        title: "Select at least one conference",
        description: "Please select at least one conference for your dynasty.",
        variant: "destructive",
      });
      return;
    }
    createLeagueMutation.mutate({
      name: name.trim(),
      maxTeams: parseInt(maxTeams),
      cpuDifficulty,
      selectedConferences,
      seasonLength,
      progressionEnabled,
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-lg">
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
          <h1 className="font-pixel text-gold text-xl">New Dynasty</h1>
          <div className="flex justify-center gap-1 mt-4">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <Star className="w-5 h-5 text-gold fill-gold" />
          </div>
        </div>

        <RetroCard variant="bordered">
          <RetroCardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <RetroInput
                id="dynastyName"
                label="Dynasty Name"
                placeholder="e.g., SEC Dynasty 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="input-dynasty-name"
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-gold">Select Conferences</label>
                <div className="grid grid-cols-2 gap-2">
                  {availableConferences.map(conf => (
                    <button
                      key={conf.id}
                      type="button"
                      onClick={() => toggleConference(conf.id)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        selectedConferences.includes(conf.id)
                          ? "bg-gold/20 border-gold text-gold"
                          : "bg-card border-border text-muted-foreground hover:border-gold/50"
                      }`}
                      data-testid={`checkbox-conference-${conf.id.replace(/\s/g, '-')}`}
                    >
                      <div className="font-medium text-sm">{conf.name}</div>
                      <div className="text-xs opacity-70">{conf.teams} teams</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedConferences.length} conference{selectedConferences.length !== 1 ? 's' : ''} selected
                  {selectedConferences.length > 0 && ` \u00B7 ${totalAvailableTeams} teams available`}
                </p>
              </div>

              <RetroSelect
                id="teamCount"
                label="Number of Teams"
                options={teamCountOptions.length > 0 ? teamCountOptions : [{ value: "", label: "Select conferences first" }]}
                value={teamCountOptions.length > 0 ? maxTeams : ""}
                onChange={(e) => setMaxTeams(e.target.value)}
                disabled={selectedConferences.length === 0}
                data-testid="select-team-count"
              />

              <RetroSelect
                id="seasonLength"
                label="Season Length"
                options={seasonLengthOptions}
                value={seasonLength}
                onChange={(e) => setSeasonLength(e.target.value)}
                data-testid="select-season-length"
              />

              <RetroSelect
                id="difficulty"
                label="CPU Difficulty"
                options={difficultyOptions}
                value={cpuDifficulty}
                onChange={(e) => setCpuDifficulty(e.target.value)}
                data-testid="select-difficulty"
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded border border-border bg-background/50">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-4 h-4 text-gold" />
                    <div>
                      <label htmlFor="progression-toggle" className="text-sm font-medium text-foreground cursor-pointer">
                        Player Progression
                      </label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Players gain or lose attributes each season based on their potential grade
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="progression-toggle"
                    checked={progressionEnabled}
                    onCheckedChange={setProgressionEnabled}
                    data-testid="switch-progression"
                  />
                </div>
                {progressionEnabled && (
                  <div className="p-3 rounded border border-gold/20 bg-gold/5 text-xs text-muted-foreground space-y-1">
                    <p className="text-gold font-medium">Potential Grades: F to A+</p>
                    <p>B- and above: Players improve each season</p>
                    <p>C- to C+: Players stay stable</p>
                    <p>D+ and below: Players decline each season</p>
                    <p className="mt-1">Recruit potential is scouted as a 2-grade range. The exact grade is revealed when they join your roster.</p>
                  </div>
                )}
              </div>

              <div className="pt-4">
                <RetroButton
                  type="submit"
                  className="w-full"
                  loading={createLeagueMutation.isPending}
                  data-testid="button-create-dynasty"
                >
                  Start Dynasty
                </RetroButton>
              </div>
            </form>
          </RetroCardContent>
        </RetroCard>

        <div className="mt-6 text-center text-muted-foreground text-sm">
          <p>Select conferences first, then choose how many teams to include.</p>
          <p className="mt-1">Maximum dynasty length: 20 seasons.</p>
        </div>
      </div>
    </div>
  );
}
