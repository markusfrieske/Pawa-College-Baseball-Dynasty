import { useState } from "react";
import { useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroSelect } from "@/components/ui/retro-select";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Star, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const difficultyOptions = [
  { value: "easy", label: "Easy - CPU makes more mistakes" },
  { value: "normal", label: "Normal - Balanced gameplay" },
  { value: "hard", label: "Hard - CPU plays optimally" },
  { value: "elite", label: "Elite - Minimal CPU mistakes" },
];

const teamCountOptions = [
  { value: "4", label: "4 Teams" },
  { value: "8", label: "8 Teams" },
  { value: "12", label: "12 Teams" },
  { value: "16", label: "16 Teams" },
];

const availableConferences = [
  { id: "SEC", name: "SEC", teams: 16, description: "Southeastern Conference" },
  { id: "ACC", name: "ACC", teams: 16, description: "Atlantic Coast Conference" },
  { id: "Big 12", name: "Big 12", teams: 14, description: "Big 12 Conference" },
  { id: "Big Ten", name: "Big Ten", teams: 18, description: "Big Ten Conference" },
];

const seasonLengthOptions = [
  { value: "short", label: "Short Season - 8 Games" },
  { value: "medium", label: "Medium Season - 14 Games" },
  { value: "long", label: "Long Season - 32 Games" },
];

export default function LeagueCreatePage() {
  const [name, setName] = useState("");
  const [maxTeams, setMaxTeams] = useState("8");
  const [cpuDifficulty, setCpuDifficulty] = useState("normal");
  const [selectedConferences, setSelectedConferences] = useState<string[]>(["SEC", "ACC"]);
  const [seasonLength, setSeasonLength] = useState("medium");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleConference = (confId: string) => {
    setSelectedConferences(prev => 
      prev.includes(confId) 
        ? prev.filter(c => c !== confId)
        : [...prev, confId]
    );
  };

  const createLeagueMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      maxTeams: number;
      cpuDifficulty: string;
      selectedConferences: string[];
      seasonLength: string;
    }) => {
      return apiRequest("POST", "/api/leagues", data);
    },
    onSuccess: async (response) => {
      const league = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      toast({
        title: "Dynasty Created!",
        description: `${name} has been created. Time to set up your team!`,
      });
      setLocation(`/league/${league.id}/setup`);
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

              <RetroSelect
                id="teamCount"
                label="Number of Teams"
                options={teamCountOptions}
                value={maxTeams}
                onChange={(e) => setMaxTeams(e.target.value)}
                data-testid="select-team-count"
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
                </p>
              </div>

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

              <div className="pt-4">
                <RetroButton
                  type="submit"
                  className="w-full"
                  disabled={createLeagueMutation.isPending}
                  data-testid="button-create-dynasty"
                >
                  {createLeagueMutation.isPending ? "Creating..." : "Start Dynasty"}
                </RetroButton>
              </div>
            </form>
          </RetroCardContent>
        </RetroCard>

        <div className="mt-6 text-center text-muted-foreground text-sm">
          <p>Dynasties can have 4-16 teams with human or CPU coaches.</p>
          <p className="mt-1">Maximum dynasty length: 20 seasons.</p>
        </div>
      </div>
    </div>
  );
}
