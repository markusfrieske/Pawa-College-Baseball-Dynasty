import { useState, useMemo } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroSelect } from "@/components/ui/retro-select";
import { RetroCard, RetroCardContent } from "@/components/ui/retro-card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Star, ArrowLeft, TrendingUp, Check } from "lucide-react";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";

const difficultyOptions = [
  { value: "beginner", label: "Beginner - Easy, relaxed pace" },
  { value: "high_school", label: "High School - Moderate competition level" },
  { value: "all_american", label: "All-American - Aggressive, skilled rivals" },
  { value: "elite", label: "Elite - Ruthless, dominant opponents" },
];

const availableConferences = [
  { id: "SEC",            abbr: "SEC",  teams: 16, primaryColor: "#002D72", secondaryColor: "#CFB53B", fullName: "Southeastern Conference" },
  { id: "ACC",            abbr: "ACC",  teams: 17, primaryColor: "#003087", secondaryColor: "#F47920", fullName: "Atlantic Coast Conference" },
  { id: "Big 12",         abbr: "B12",  teams: 14, primaryColor: "#00205B", secondaryColor: "#CC0000", fullName: "Big 12 Conference" },
  { id: "Big Ten",        abbr: "B10",  teams: 18, primaryColor: "#0032A0", secondaryColor: "#E8C84A", fullName: "Big Ten Conference" },
  { id: "Pac-12",         abbr: "P12",  teams: 8,  primaryColor: "#003DA5", secondaryColor: "#C4A962", fullName: "Pac-12 Conference" },
  { id: "AAC",            abbr: "AAC",  teams: 11, primaryColor: "#007A53", secondaryColor: "#003087", fullName: "American Athletic Conference" },
  { id: "WCC",            abbr: "WCC",  teams: 8,  primaryColor: "#6B1D3E", secondaryColor: "#C8A96E", fullName: "West Coast Conference" },
  { id: "Ivy League",     abbr: "IVY",  teams: 8,  primaryColor: "#006438", secondaryColor: "#D4AF37", fullName: "Ivy League" },
  { id: "Sun Belt",       abbr: "SB",   teams: 13, primaryColor: "#003087", secondaryColor: "#FFD100", fullName: "Sun Belt Conference" },
  { id: "Big West",       abbr: "BW",   teams: 10, primaryColor: "#00539C", secondaryColor: "#E87722", fullName: "Big West Conference" },
  { id: "HBCU",           abbr: "HBCU", teams: 16, primaryColor: "#1A1A1A", secondaryColor: "#FFD700", fullName: "HBCU Conferences" },
  { id: "Missouri Valley",abbr: "MVC",  teams: 13, primaryColor: "#5B2C6B", secondaryColor: "#FFD100", fullName: "Missouri Valley Conference" },
];

const seasonLengthOptions = [
  { value: "short", label: "Short Season - 10 Games (5 weeks)" },
  { value: "standard", label: "Standard Season - 20 Games (5 weeks)" },
  { value: "medium", label: "Extended Season - 16 Games (4 weeks)" },
  { value: "long", label: "Long Season - 40 Games (10 weeks)" },
];

const seasonScheduleBreakdown: Record<string, string> = {
  short:    "5 weeks · 1 conf game + 1 OOC game each week · 10 regular season games · 4 spring training games",
  standard: "5 weeks · 5 conf series (3 games each) · 5 OOC midweeks · 20 regular season games · 4 spring training games",
  medium:   "4 weeks · 4 conf series (3 games each) · 4 OOC midweeks · 16 regular season games · 4 spring training games",
  long:     "10 weeks · 10 conf series (3 games each) · 10 OOC midweeks · 40 regular season games · 4 spring training games",
};

export default function LeagueCreatePage() {
  const [name, setName] = useState("");
  const [maxTeams, setMaxTeams] = useState("14");
  const [cpuDifficulty, setCpuDifficulty] = useState("high_school");
  const [selectedConferences, setSelectedConferences] = useState<string[]>(["SEC", "Big Ten", "ACC"]);
  const [seasonLength, setSeasonLength] = useState("standard");
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
        description: parseErrorMessage(error),
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

              {/* Conference Picker — top of form, icon grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gold uppercase tracking-widest">Conferences</label>
                  <span className="text-xs text-muted-foreground">
                    {selectedConferences.length > 0
                      ? `${selectedConferences.length} selected · ${totalAvailableTeams} teams`
                      : "Select at least one"}
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {availableConferences.map(conf => {
                    const isSelected = selectedConferences.includes(conf.id);
                    return (
                      <button
                        key={conf.id}
                        type="button"
                        onClick={() => toggleConference(conf.id)}
                        title={`${conf.fullName} (${conf.teams} teams)`}
                        className={`relative group w-14 h-14 rounded-lg border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? "border-gold bg-gold/10 shadow-[0_0_8px_rgba(212,175,55,0.3)]"
                            : "border-border hover:border-gold/40 bg-card"
                        }`}
                        data-testid={`checkbox-conference-${conf.id.replace(/\s/g, '-')}`}
                      >
                        {/* Conference badge */}
                        <div
                          className="w-10 h-10 rounded-full border-2 flex items-center justify-center font-pixel font-bold text-white shrink-0"
                          style={{
                            backgroundColor: conf.primaryColor,
                            borderColor: conf.secondaryColor,
                            fontSize: conf.abbr.length > 3 ? "6px" : conf.abbr.length === 3 ? "7px" : "9px",
                          }}
                        >
                          {conf.abbr}
                        </div>

                        {/* Gold checkmark badge when selected */}
                        {isSelected && (
                          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gold rounded-full flex items-center justify-center z-10 shadow-sm">
                            <Check className="w-2.5 h-2.5 text-black stroke-[3]" />
                          </div>
                        )}

                        {/* Team count pill — always visible when selected, fades in on hover otherwise */}
                        <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-background border whitespace-nowrap transition-opacity pointer-events-none ${
                          isSelected
                            ? "border-gold text-gold opacity-100"
                            : "border-border text-muted-foreground opacity-0 group-hover:opacity-100"
                        }`}>
                          {conf.teams}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <RetroInput
                id="dynastyName"
                label="Dynasty Name"
                placeholder="e.g., SEC Dynasty 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="input-dynasty-name"
              />

              <div>
                <RetroSelect
                  id="teamCount"
                  label="Number of Teams"
                  options={teamCountOptions.length > 0 ? teamCountOptions : [{ value: "", label: "Select conferences first" }]}
                  value={teamCountOptions.length > 0 ? maxTeams : ""}
                  onChange={(e) => setMaxTeams(e.target.value)}
                  disabled={selectedConferences.length === 0}
                  data-testid="select-team-count"
                />
                {maxTeams === "14" && selectedConferences.length === 3 && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold/60" />
                    6·4·4 split across 3 conferences
                  </p>
                )}
              </div>

              <div>
                <RetroSelect
                  id="seasonLength"
                  label="Season Length"
                  options={seasonLengthOptions}
                  value={seasonLength}
                  onChange={(e) => setSeasonLength(e.target.value)}
                  data-testid="select-season-length"
                />
                {seasonScheduleBreakdown[seasonLength] && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground flex items-start gap-1.5" data-testid="season-schedule-breakdown">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold/60 shrink-0 mt-[3px]" />
                    {seasonScheduleBreakdown[seasonLength]}
                  </p>
                )}
              </div>

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
                  variant="shimmer"
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
