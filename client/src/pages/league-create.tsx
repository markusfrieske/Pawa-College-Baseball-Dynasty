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

const conferenceOptions = [
  { value: "2", label: "2 Conferences" },
  { value: "4", label: "4 Conferences" },
];

export default function LeagueCreatePage() {
  const [name, setName] = useState("");
  const [maxTeams, setMaxTeams] = useState("8");
  const [cpuDifficulty, setCpuDifficulty] = useState("normal");
  const [conferences, setConferences] = useState("2");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createLeagueMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      maxTeams: number;
      cpuDifficulty: string;
      conferenceCount: number;
    }) => {
      return apiRequest("POST", "/api/leagues", data);
    },
    onSuccess: async (response) => {
      const league = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      toast({
        title: "League Created!",
        description: `${name} has been created. Time to set up your team!`,
      });
      setLocation(`/league/${league.id}/setup`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create league. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: "League name required",
        description: "Please enter a name for your league.",
        variant: "destructive",
      });
      return;
    }
    createLeagueMutation.mutate({
      name: name.trim(),
      maxTeams: parseInt(maxTeams),
      cpuDifficulty,
      conferenceCount: parseInt(conferences),
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
          <h1 className="font-pixel text-gold text-xl">New League</h1>
          <div className="flex justify-center gap-1 mt-4">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <Star className="w-5 h-5 text-gold fill-gold" />
          </div>
        </div>

        <RetroCard variant="bordered">
          <RetroCardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <RetroInput
                id="leagueName"
                label="League Name"
                placeholder="e.g., College World Series Sim"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="input-league-name"
              />

              <RetroSelect
                id="teamCount"
                label="Number of Teams"
                options={teamCountOptions}
                value={maxTeams}
                onChange={(e) => setMaxTeams(e.target.value)}
                data-testid="select-team-count"
              />

              <RetroSelect
                id="conferences"
                label="Conferences"
                options={conferenceOptions}
                value={conferences}
                onChange={(e) => setConferences(e.target.value)}
                data-testid="select-conferences"
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
                  data-testid="button-create-league"
                >
                  {createLeagueMutation.isPending ? "Creating..." : "Start League"}
                </RetroButton>
              </div>
            </form>
          </RetroCardContent>
        </RetroCard>

        <div className="mt-6 text-center text-muted-foreground text-sm">
          <p>Leagues can have 1-16 teams with human or CPU coaches.</p>
          <p className="mt-1">Maximum dynasty length: 20 seasons.</p>
        </div>
      </div>
    </div>
  );
}
