import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  ArrowLeft, 
  Settings, 
  Play, 
  History, 
  Users, 
  AlertTriangle,
  ChevronRight,
  Clock,
  Mail,
  UserPlus,
  Check,
  Copy,
  Upload,
  FileSpreadsheet,
  X,
  GraduationCap,
  Trophy,
  Swords,
  UserMinus,
  Target,
  Link as LinkIcon,
  FastForward,
  Timer
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, AuditLog, LeagueInvite } from "@shared/schema";
import { SimProgressOverlay, type SimSummary } from "@/components/sim-progress-overlay";
import { SeasonSummaryModal } from "@/components/season-summary-modal";

interface CommissionerData {
  league: League;
  auditLogs: AuditLog[];
  readyCoaches: string[];
  totalCoaches: number;
  invites: LeagueInvite[];
}

export default function CommissionerPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [autoAdvance, setAutoAdvance] = useState(() => {
    return localStorage.getItem(`auto-advance-${id}`) === "true";
  });
  const [simSummary, setSimSummary] = useState<SimSummary | null>(null);
  const [showSimOverlay, setShowSimOverlay] = useState(false);
  const [showSeasonSummary, setShowSeasonSummary] = useState(false);
  const [summaryCompletedSeason, setSummaryCompletedSeason] = useState(1);
  const [pendingSeasonSummary, setPendingSeasonSummary] = useState<number | null>(null);

  const toggleAutoAdvance = (val: boolean) => {
    setAutoAdvance(val);
    localStorage.setItem(`auto-advance-${id}`, val ? "true" : "false");
  };

  const { data, isLoading } = useQuery<CommissionerData>({
    queryKey: ["/api/leagues", id, "commissioner"],
  });

  const advanceWeekMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/advance`, {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "postseason"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", "pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", "trends"] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/roster`] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "roster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "walkons"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      if (response?.seasonTransition) {
        const t = response.seasonTransition;
        toast({ 
          title: "Season Complete!", 
          description: `${t.graduated} graduated, ${t.recruitsAdded} recruits joined rosters, ${t.newRecruits} new recruits generated. Welcome to Season ${response.currentSeason}!`,
        });
      } else if (response?.cwsChampion) {
        toast({ title: "CWS Champion Crowned!", description: "A champion has been decided in the College World Series!" });
      } else {
        const phase = response?.currentPhase;
        const phaseMessages: Record<string, string> = {
          conference_championship: "The regular season is over! Conference Championships begin.",
          super_regionals: "Conference Championships are complete! Super Regionals bracket is set.",
          cws: "The final two teams advance to the College World Series!",
          offseason_departures: "The season is over. Processing player departures...",
          offseason_recruiting_1: "Departures processed. Offseason recruiting begins!",
          offseason_recruiting_2: "Offseason recruiting week 2 underway.",
          offseason_recruiting_3: "Offseason recruiting week 3 underway.",
          offseason_recruiting_4: "Final week of offseason recruiting.",
          offseason_signing_day: "Recruiting is over! Signing Day results are in.",
          offseason_walkons: "Teams are finalizing roster cuts and walk-on signings.",
        };
        const phaseTitle: Record<string, string> = {
          conference_championship: "Postseason Update",
          super_regionals: "Postseason Update",
          cws: "Postseason Update",
          offseason_departures: "Offseason",
          offseason_recruiting_1: "Offseason Recruiting",
          offseason_recruiting_2: "Offseason Recruiting",
          offseason_recruiting_3: "Offseason Recruiting",
          offseason_recruiting_4: "Offseason Recruiting",
          offseason_signing_day: "Signing Day",
          offseason_walkons: "Walk-Ons",
        };
        toast({ 
          title: phaseTitle[phase] || (phaseMessages[phase] ? "Update" : "Week Advanced"), 
          description: phaseMessages[phase] || "The dynasty has moved to the next week.",
        });

        if (phase === "offseason_departures") {
          setSummaryCompletedSeason(response?.currentSeason || 1);
          setShowSeasonSummary(true);
        }

        const autoAdvanceEnabled = localStorage.getItem(`auto-advance-${id}`) === "true";
        const autoAdvancePhases = ["regular_season", "preseason", "spring_training"];
        if (autoAdvanceEnabled && phase && autoAdvancePhases.includes(phase) && !advanceWeekMutation.isPending) {
          setTimeout(() => {
            if (!advanceWeekMutation.isPending) {
              advanceWeekMutation.mutate();
            }
          }, 600);
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const advanceSeasonMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/advance-season`, {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      const t = response?.seasonTransition;
      toast({ 
        title: "Season Complete!", 
        description: t 
          ? `${t.graduated} graduated, ${t.recruitsAdded} recruits joined rosters, ${t.newRecruits} new recruits generated.`
          : "The dynasty has advanced to the next season.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleAuditLogMutation = useMutation({
    mutationFn: async (isPublic: boolean) => {
      return apiRequest("PATCH", `/api/leagues/${id}/settings`, { auditLogPublic: isPublic });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      toast({ title: "Settings Updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateDifficultyMutation = useMutation({
    mutationFn: async (cpuDifficulty: string) => {
      return apiRequest("PATCH", `/api/leagues/${id}/settings`, { cpuDifficulty });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      toast({ title: "Difficulty Updated", description: "CPU difficulty has been changed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const simToSigningDayMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/sim-to-signing-day`, {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      if (response?.seasonTransition) {
        const t = response.seasonTransition;
        toast({ 
          title: "Offseason Complete!", 
          description: `${t.recruitsAdded} recruits signed, ${t.newRecruits} new class generated. Welcome to Season ${response.currentSeason}!`,
        });
      } else {
        toast({ title: "Offseason Simulated", description: "Fast-forwarded through the offseason." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const simToOffseasonMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/sim-to-offseason`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "postseason"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      const hasSimData = data?.simSummary && (data.simSummary.weekResults?.length > 0 || data.simSummary.postseasonResults?.length > 0);
      const isOffseasonTransition = data?.currentPhase === "offseason_departures" || data?.currentPhase === "offseason";
      if (hasSimData) {
        setSimSummary(data.simSummary);
        setShowSimOverlay(true);
        if (isOffseasonTransition) {
          setPendingSeasonSummary(data?.currentSeason || 1);
        }
      } else {
        toast({ 
          title: "Season Simulated!", 
          description: "The entire season has been simulated. Review player departures before continuing.",
        });
        if (isOffseasonTransition) {
          setSummaryCompletedSeason(data?.currentSeason || 1);
          setShowSeasonSummary(true);
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const simToPostseasonMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/sim-to-postseason`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "postseason"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      if (data?.simSummary && (data.simSummary.weekResults?.length > 0 || data.simSummary.postseasonResults?.length > 0)) {
        setSimSummary(data.simSummary);
        setShowSimOverlay(true);
      } else {
        toast({ 
          title: "Regular Season Complete!", 
          description: "Conference Championships are set. Time for postseason baseball!",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const simToCwsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/sim-to-cws`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "postseason"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      if (data?.simSummary && (data.simSummary.weekResults?.length > 0 || data.simSummary.postseasonResults?.length > 0)) {
        setSimSummary(data.simSummary);
        setShowSimOverlay(true);
      } else {
        toast({ 
          title: "College World Series!", 
          description: "The final two teams are set for the CWS championship series.",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const simulateWeekMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/simulate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      toast({ title: "Week Simulated", description: "All games have been auto-resolved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const importRecruitingMutation = useMutation({
    mutationFn: async (csvData?: string) => {
      const res = await apiRequest("POST", `/api/leagues/${id}/recruiting/import`, { csvData });
      return res.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      toast({ 
        title: "Recruiting Class Imported", 
        description: `${data.count > 0 ? `Imported ${data.count} recruits` : 'Generated new recruiting class'} successfully.` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <CommissionerSkeleton />;
  }

  const phaseLabels: Record<string, string> = {
    dynasty_setup: "Dynasty Setup",
    preseason: "Spring Training",
    spring_training: "Spring Training",
    regular_season: "Regular Season",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason: "Offseason",
    offseason_departures: "Player Departures",
    offseason_recruiting_1: "Offseason Recruiting (Wk 1)",
    offseason_recruiting_2: "Offseason Recruiting (Wk 2)",
    offseason_recruiting_3: "Offseason Recruiting (Wk 3)",
    offseason_recruiting_4: "Offseason Recruiting (Wk 4)",
    offseason_signing_day: "Signing Day",
    offseason_walkons: "Walk-Ons",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-lg">Commissioner</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6">
          <RetroCard>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gold/20 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-gold" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Week</p>
                <p className="text-xl font-bold">{data?.league.currentWeek}</p>
              </div>
            </div>
          </RetroCard>

          <RetroCard>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Play className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phase</p>
                <p className="text-lg font-bold">{phaseLabels[data?.league.currentPhase || "preseason"]}</p>
              </div>
            </div>
          </RetroCard>

          <RetroCard>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ready Coaches</p>
                <p className="text-xl font-bold">
                  {data?.readyCoaches.length || 0}/{data?.totalCoaches || 0}
                </p>
              </div>
            </div>
          </RetroCard>
        </div>

        <Tabs defaultValue="actions" className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="actions" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Actions
            </TabsTrigger>
            <TabsTrigger value="settings" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Settings
            </TabsTrigger>
            <TabsTrigger value="audit" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Audit Log
            </TabsTrigger>
            <TabsTrigger value="invites" className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
              Invites
            </TabsTrigger>
          </TabsList>

          <TabsContent value="actions">
            <ActionsTab
              league={data?.league}
              onAdvanceWeek={() => advanceWeekMutation.mutate()}
              isAdvancing={advanceWeekMutation.isPending}
              onAdvanceSeason={() => advanceSeasonMutation.mutate()}
              isAdvancingSeason={advanceSeasonMutation.isPending}
              onImportRecruiting={(csvData?: string) => importRecruitingMutation.mutate(csvData)}
              isImporting={importRecruitingMutation.isPending}
              onSimulateWeek={() => simulateWeekMutation.mutate()}
              isSimulating={simulateWeekMutation.isPending}
              onSimToOffseason={() => simToOffseasonMutation.mutate()}
              isSimToOffseason={simToOffseasonMutation.isPending}
              onSimToSigningDay={() => simToSigningDayMutation.mutate()}
              isSimToSigningDay={simToSigningDayMutation.isPending}
              onSimToPostseason={() => simToPostseasonMutation.mutate()}
              isSimToPostseason={simToPostseasonMutation.isPending}
              onSimToCws={() => simToCwsMutation.mutate()}
              isSimToCws={simToCwsMutation.isPending}
              autoAdvance={autoAdvance}
              toggleAutoAdvance={toggleAutoAdvance}
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab
              league={data?.league}
              onToggleAuditLog={(isPublic) => toggleAuditLogMutation.mutate(isPublic)}
              onChangeDifficulty={(difficulty) => updateDifficultyMutation.mutate(difficulty)}
            />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogTab logs={data?.auditLogs || []} />
          </TabsContent>

          <TabsContent value="invites">
            <InvitesTab leagueId={id!} invites={data?.invites || []} />
          </TabsContent>
        </Tabs>
      </main>

      <SeasonSummaryModal
        open={showSeasonSummary}
        onClose={() => setShowSeasonSummary(false)}
        leagueId={id!}
        season={summaryCompletedSeason}
      />
    </div>
  );
}

function ActionsTab({
  league,
  onAdvanceWeek,
  isAdvancing,
  onAdvanceSeason,
  isAdvancingSeason,
  onImportRecruiting,
  isImporting,
  onSimulateWeek,
  isSimulating,
  onSimToOffseason,
  isSimToOffseason,
  onSimToSigningDay,
  isSimToSigningDay,
  onSimToPostseason,
  isSimToPostseason,
  onSimToCws,
  isSimToCws,
  autoAdvance,
  toggleAutoAdvance,
}: {
  league?: League;
  onAdvanceWeek: () => void;
  isAdvancing: boolean;
  onAdvanceSeason: () => void;
  isAdvancingSeason: boolean;
  onImportRecruiting: (csvData?: string) => void;
  isImporting: boolean;
  onSimulateWeek: () => void;
  isSimulating: boolean;
  onSimToOffseason: () => void;
  isSimToOffseason: boolean;
  onSimToSigningDay: () => void;
  isSimToSigningDay: boolean;
  onSimToPostseason: () => void;
  isSimToPostseason: boolean;
  onSimToCws: () => void;
  isSimToCws: boolean;
  autoAdvance: boolean;
  toggleAutoAdvance: (val: boolean) => void;
}) {
  const { toast } = useToast();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showEditTeamsDialog, setShowEditTeamsDialog] = useState(false);
  const [csvData, setCsvData] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvData(content);
    };
    reader.readAsText(file);
  };

  const handleImport = (useCSV: boolean) => {
    onImportRecruiting(useCSV ? csvData : undefined);
    setShowImportDialog(false);
    setCsvData("");
  };

  const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(league?.currentPhase || "");
  const offseasonPhaseList = ["offseason", "offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
  const isOffseason = offseasonPhaseList.includes(league?.currentPhase || "");
  const anySim = isAdvancing || isAdvancingSeason || isSimToOffseason || isSimToSigningDay || isSimToPostseason || isSimToCws;
  
  const advanceLabel = (() => {
    if (isAdvancing) return "Processing...";
    switch (league?.currentPhase) {
      case "conference_championship": return "Play Conference Championships";
      case "super_regionals": return "Play Super Regional Round";
      case "cws": return "Play CWS Game";
      case "offseason_departures": return "Process Player Departures";
      case "offseason_recruiting_1": return "Advance Recruiting (Week 1)";
      case "offseason_recruiting_2": return "Advance Recruiting (Week 2)";
      case "offseason_recruiting_3": return "Advance Recruiting (Week 3)";
      case "offseason_recruiting_4": return "Advance Recruiting (Week 4)";
      case "offseason_signing_day": return "Advance to Cuts & Walk-Ons";
      case "offseason_walkons": return "Finalize Walk-Ons - Start New Season";
      case "offseason": return "Begin Offseason";
      default: return "Advance Week";
    }
  })();

  const advanceDescription = (() => {
    switch (league?.currentPhase) {
      case "conference_championship": return "Simulate conference championship matchups between top teams.";
      case "super_regionals": return "Simulate the next round of the Super Regional bracket tournament.";
      case "cws": return "Play the next game of the College World Series best-of-3 championship.";
      case "offseason_departures": return "All coaches must submit their departures before advancing. Once all coaches are ready, advancing will process graduates, draft declarations, and transfer portal entries.";
      case "offseason_recruiting_1":
      case "offseason_recruiting_2":
      case "offseason_recruiting_3":
      case "offseason_recruiting_4":
        return "Continue recruiting unsigned recruits and transfer portal players. CPU teams are also actively recruiting during this period.";
      case "offseason_signing_day": return "Signing Day! Finalize all commits, add signed recruits to rosters, and advance eligibility. Teams will then manage roster cuts and walk-on signings.";
      case "offseason_walkons": return "All teams must finalize their roster cuts and walk-on signings before advancing. Once all teams are ready, rosters will be locked and the new season begins.";
      case "offseason": return "Begin the offseason process. Players will be leaving, recruiting continues, and a new season awaits.";
      default: return "Move the league forward to the next week. This will process recruiting updates, trigger story events, and update standings.";
    }
  })();

  const advanceIcon = (() => {
    switch (league?.currentPhase) {
      case "conference_championship": return <Swords className="w-4 h-4 mr-2" />;
      case "super_regionals": return <Swords className="w-4 h-4 mr-2" />;
      case "cws": return <Trophy className="w-4 h-4 mr-2" />;
      case "offseason_departures": return <UserMinus className="w-4 h-4 mr-2" />;
      case "offseason_recruiting_1":
      case "offseason_recruiting_2":
      case "offseason_recruiting_3":
      case "offseason_recruiting_4":
        return <Target className="w-4 h-4 mr-2" />;
      case "offseason_signing_day": return <GraduationCap className="w-4 h-4 mr-2" />;
      case "offseason_walkons": return <UserPlus className="w-4 h-4 mr-2" />;
      case "offseason": return <GraduationCap className="w-4 h-4 mr-2" />;
      default: return <Play className="w-4 h-4 mr-2" />;
    }
  })();

  return (
    <div className="space-y-6">
      <ReadyStatusSection leagueId={league?.id || ""} />
      
      {isPostseason && <PostseasonBracket leagueId={league?.id || ""} phase={league?.currentPhase || ""} />}
      
      <div className="grid md:grid-cols-2 gap-6">
        <RetroCard>
          <RetroCardHeader>{isPostseason ? "Postseason" : isOffseason ? "Offseason" : "Advance Week"}</RetroCardHeader>
          <RetroCardContent>
            <p className="text-muted-foreground mb-4">
              {advanceDescription}
            </p>
            {league?.phaseDeadline && new Date(league.phaseDeadline) <= new Date() && (
              <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/40 text-red-400 text-xs flex items-center gap-2">
                <Timer className="w-3.5 h-3.5 shrink-0" />
                Deadline passed — non-ready coaches will be auto-marked ready when you advance.
              </div>
            )}
            <RetroButton
              onClick={onAdvanceWeek}
              disabled={anySim}
              className="w-full"
              data-testid="button-advance-week"
            >
              {advanceIcon}
              {advanceLabel}
            </RetroButton>

            <div className="mt-4 pt-4 border-t border-border">
              <p className="font-pixel text-[8px] text-gold uppercase mb-3">Quick Sim</p>
              <div className="space-y-2">
                {!isPostseason && !isOffseason && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <RetroButton
                          variant="outline"
                          disabled={anySim}
                          className="w-full"
                          data-testid="button-sim-to-postseason"
                        >
                          <FastForward className="w-4 h-4 mr-2" />
                          {isSimToPostseason ? "Simulating..." : "Sim to Postseason"}
                        </RetroButton>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-pixel text-gold text-sm">Sim to Postseason?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will simulate the entire regular season. You won't be able to play individual weeks or make mid-season changes. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={onSimToPostseason} className="bg-gold text-forest-dark" data-testid="button-confirm-sim-postseason">
                            Sim to Postseason
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <RetroButton
                          variant="outline"
                          disabled={anySim}
                          className="w-full"
                          data-testid="button-sim-to-cws"
                        >
                          <FastForward className="w-4 h-4 mr-2" />
                          {isSimToCws ? "Simulating..." : "Sim to College World Series"}
                        </RetroButton>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-pixel text-gold text-sm">Sim to College World Series?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will simulate through to the College World Series. All remaining games will be auto-played. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={onSimToCws} className="bg-gold text-forest-dark" data-testid="button-confirm-sim-cws">
                            Sim to CWS
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <RetroButton
                          variant="outline"
                          disabled={anySim}
                          className="w-full"
                          data-testid="button-sim-to-offseason"
                        >
                          <FastForward className="w-4 h-4 mr-2" />
                          {isSimToOffseason ? "Simulating..." : "Sim to Offseason"}
                        </RetroButton>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-pixel text-gold text-sm">Sim to Offseason?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will simulate the entire remaining season including postseason. All games will be auto-played. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={onSimToOffseason} className="bg-gold text-forest-dark" data-testid="button-confirm-sim-offseason">
                            Sim to Offseason
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
                {isPostseason && (
                  <>
                    {league?.currentPhase !== "cws" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <RetroButton
                            variant="outline"
                            disabled={anySim}
                            className="w-full"
                            data-testid="button-sim-to-cws"
                          >
                            <FastForward className="w-4 h-4 mr-2" />
                            {isSimToCws ? "Simulating..." : "Sim to College World Series"}
                          </RetroButton>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-pixel text-gold text-sm">Sim to College World Series?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will simulate through to the College World Series. All remaining games will be auto-played. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onSimToCws} className="bg-gold text-forest-dark" data-testid="button-confirm-sim-cws">
                              Sim to CWS
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <RetroButton
                          variant="outline"
                          disabled={anySim}
                          className="w-full"
                          data-testid="button-sim-to-offseason"
                        >
                          <FastForward className="w-4 h-4 mr-2" />
                          {isSimToOffseason ? "Simulating..." : "Sim to Offseason"}
                        </RetroButton>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-pixel text-gold text-sm">Sim to Offseason?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will simulate the entire remaining season including postseason. All games will be auto-played. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={onSimToOffseason} className="bg-gold text-forest-dark" data-testid="button-confirm-sim-offseason">
                            Sim to Offseason
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
                {isOffseason && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <RetroButton
                        variant="outline"
                        disabled={anySim}
                        className="w-full"
                        data-testid="button-sim-to-next-season"
                      >
                        <FastForward className="w-4 h-4 mr-2" />
                        {isSimToSigningDay ? "Simulating..." : "Sim to Next Season"}
                      </RetroButton>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-card border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-pixel text-gold text-sm">Sim to Next Season?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will simulate the entire offseason including recruiting, signing day, and walk-ons. Your recruiting actions won't be applied. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onSimToSigningDay} className="bg-gold text-forest-dark" data-testid="button-confirm-sim-next-season">
                          Sim to Next Season
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              {isOffseason && (
                <p className="text-muted-foreground text-xs mt-3 pt-2 border-t border-border">
                  {league?.currentPhase === "offseason_departures" 
                    ? "Review your departing players before advancing, or sim through the entire offseason."
                    : league?.currentPhase?.startsWith("offseason_recruiting")
                    ? "Use the Recruiting Board, or sim to skip remaining offseason weeks."
                    : "Fast-forward through recruiting, signing day, and start the next season."}
                </p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-Advance</p>
                <p className="text-xs text-muted-foreground">Auto-advance through regular season weeks</p>
              </div>
              <Switch
                checked={autoAdvance}
                onCheckedChange={toggleAutoAdvance}
                data-testid="switch-auto-advance"
              />
            </div>
          </RetroCardContent>
        </RetroCard>

        <RetroCard>
          <RetroCardHeader>Quick Actions</RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-3">
            {(league?.currentPhase === "dynasty_setup" || league?.currentPhase === "preseason") && (
              <>
                <ActionButton 
                  label={isImporting ? "Importing..." : "Import Recruiting Class"}
                  description="Import recruits from CSV file" 
                  onClick={() => setShowImportDialog(true)}
                  disabled={isImporting}
                  dataTestId="button-import-recruiting"
                />
                <ActionButton 
                  label="Edit Schedule" 
                  description="Modify upcoming games" 
                  href={`/league/${league?.id}/schedule`}
                  dataTestId="button-edit-schedule"
                />
              </>
            )}
            <ActionButton 
              label="Edit Teams" 
              description="Swap teams in or out of dynasty" 
              onClick={() => setShowEditTeamsDialog(true)}
              dataTestId="button-edit-teams"
            />
            <ActionButton 
              label="View Roster" 
              description="View your team roster" 
              href={`/league/${league?.id}/roster`}
              dataTestId="button-view-roster"
            />
            <ActionButton 
              label="Edit All Rosters" 
              description="Bulk edit all team rosters" 
              href={`/league/${league?.id}/edit-rosters`}
              dataTestId="button-edit-rosters"
            />
            <ActionButton 
              label="Edit Recruiting Class" 
              description="Bulk edit all recruits" 
              href={`/league/${league?.id}/edit-recruits`}
              dataTestId="button-edit-recruits"
            />
            <ActionButton 
              label={isSimulating ? "Simulating..." : "Simulate Week"}
              description="Auto-resolve all games for this week" 
              onClick={onSimulateWeek}
              disabled={isSimulating}
              dataTestId="button-simulate-week"
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div>
                  <ActionButton 
                    label="Reset Season" 
                    description="Start the season over" 
                    variant="destructive"
                    dataTestId="button-reset-season"
                  />
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-pixel text-gold text-sm">Reset Season?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset all games, standings, and stats for the current season. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    className="bg-destructive text-destructive-foreground"
                    onClick={() => toast({ title: "Coming Soon", description: "Season reset will be available in a future update." })}
                    data-testid="button-confirm-reset-season"
                  >
                    Reset Season
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </RetroCardContent>
      </RetroCard>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Import Recruiting Class</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Upload a CSV file with recruit data, or generate a new class automatically.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div 
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-gold transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="input-import-file"
              />
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to upload CSV file
              </p>
              <p className="text-xs text-muted-foreground mt-1 text-left">
                <span className="text-gold">Required:</span> firstName, lastName, position, overall, homeState<br/>
                <span className="text-gold">Basic:</span> hometown, starRating, recruitType, throwHand, batHand<br/>
                <span className="text-gold">Fielder Attrs:</span> contact, power, speed, arm, fielding, errorResistance<br/>
                <span className="text-gold">Fielder Abilities:</span> clutch, vsLHP, grit, stealing, running, throwing, recovery, catcherAbility<br/>
                <span className="text-gold">Pitcher Attrs:</span> velocity, control, stamina<br/>
                <span className="text-gold">Pitcher Abilities:</span> wRISP, vsLefty, poise, heater, agile, recovery<br/>
                <span className="text-gold">Priorities:</span> proximity, reputation, playingTime, academics, prestige, facilities (Not/Somewhat/Very/Extremely)<br/>
                <span className="text-gold">Special:</span> abilities (comma-separated), isBlueChip, isGem, isBust<br/>
                <span className="text-gold">Appearance:</span> skinTone, hairColor, hairStyle<br/>
                <span className="text-muted-foreground italic">Letter grades S-G accepted for numeric fields</span>
              </p>
            </div>

            {csvData && (
              <div className="bg-background/50 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gold">File loaded</span>
                  <button 
                    onClick={() => setCsvData("")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {csvData.split('\n').length - 1} recruits detected
                </p>
                <RetroButton
                  onClick={() => handleImport(true)}
                  disabled={isImporting}
                  className="w-full"
                  data-testid="button-import-csv"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isImporting ? "Importing..." : "Import CSV Data"}
                </RetroButton>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Or generate a new class automatically:
              </p>
              <RetroButton
                variant="outline"
                onClick={() => handleImport(false)}
                disabled={isImporting}
                className="w-full"
                data-testid="button-generate-class"
              >
                <Upload className="w-4 h-4 mr-2" />
                {isImporting ? "Generating..." : "Generate New Class"}
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditTeamsDialog} onOpenChange={setShowEditTeamsDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Edit Teams</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Swap teams in or out of the dynasty.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select teams to add or remove from the dynasty. Changes will take effect immediately.
            </p>
            
            <div className="bg-background/50 rounded p-4 text-center">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Team editing is available in the Team View screen.
              </p>
              <Link href={`/league/${league?.id}`}>
                <RetroButton variant="outline" className="mt-3" data-testid="button-go-to-teams">
                  Go to Teams
                </RetroButton>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
      <PhaseDeadlineControl leagueId={league?.id || ""} currentDeadline={league?.phaseDeadline ?? null} />
    </div>
  );
}

function PhaseDeadlineControl({ leagueId, currentDeadline }: { leagueId: string; currentDeadline: Date | string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [deadlineInput, setDeadlineInput] = useState(() => {
    if (!currentDeadline) return "";
    const d = new Date(currentDeadline);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const deadlineMutation = useMutation({
    mutationFn: async (deadline: string | null) => {
      const res = await apiRequest("PATCH", `/api/leagues/${leagueId}/deadline`, { deadline });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      toast({ title: "Deadline Updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSet = () => {
    if (!deadlineInput) return;
    deadlineMutation.mutate(new Date(deadlineInput).toISOString());
  };

  const handleClear = () => {
    setDeadlineInput("");
    deadlineMutation.mutate(null);
  };

  const deadlinePassed = currentDeadline ? new Date(currentDeadline) <= new Date() : false;

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-gold" />
          <span>Phase Deadline</span>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <p className="text-muted-foreground text-sm mb-4">
          Set an optional deadline for coaches to complete their actions. When the deadline passes, all non-ready coaches are automatically marked ready on the next advance.
        </p>
        {currentDeadline && (
          <div className={`mb-3 p-2 rounded border text-xs flex items-center gap-2 ${
            deadlinePassed
              ? "bg-red-500/10 border-red-500/40 text-red-400"
              : "bg-gold/10 border-gold/40 text-gold"
          }`}>
            <Timer className="w-3.5 h-3.5 shrink-0" />
            {deadlinePassed
              ? `Deadline passed: ${new Date(currentDeadline).toLocaleString()}`
              : `Active deadline: ${new Date(currentDeadline).toLocaleString()}`
            }
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Set deadline (your local time)</p>
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={(e) => setDeadlineInput(e.target.value)}
              className="w-full h-9 rounded border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-gold"
              data-testid="input-phase-deadline"
            />
          </div>
          <RetroButton
            onClick={handleSet}
            disabled={!deadlineInput || deadlineMutation.isPending}
            data-testid="button-set-deadline"
          >
            Set
          </RetroButton>
          {currentDeadline && (
            <RetroButton
              variant="outline"
              onClick={handleClear}
              disabled={deadlineMutation.isPending}
              data-testid="button-clear-deadline"
            >
              Clear
            </RetroButton>
          )}
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

interface ReadyStatusData {
  readyStatus: Array<{
    teamId: string;
    teamName: string;
    abbreviation: string;
    isHumanControlled: boolean;
    userId: string | null;
    coachName: string;
    isReady: boolean;
    departuresFinalized: boolean;
    walkonReady: boolean;
    scoutActionsUsed: number;
    recruitActionsUsed: number;
    hasReportedScores: boolean;
  }>;
  allHumansReady: boolean;
  currentPhase: string;
  humanCount: number;
  readyCount: number;
}

function ReadyStatusSection({ leagueId }: { leagueId: string }) {
  const { data, isLoading } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
    enabled: !!leagueId,
  });

  if (isLoading || !data) {
    return (
      <RetroCard>
        <RetroCardHeader>Ready Status</RetroCardHeader>
        <RetroCardContent>
          <Skeleton className="h-32" />
        </RetroCardContent>
      </RetroCard>
    );
  }

  const humanTeams = data.readyStatus.filter(s => s.isHumanControlled);
  const isDeparturesPhase = data.currentPhase === "offseason_departures";
  const isWalkonsPhase = data.currentPhase === "offseason_walkons";
  const getTeamReady = (team: typeof humanTeams[0]) => {
    if (isDeparturesPhase) return team.departuresFinalized;
    if (isWalkonsPhase) return team.walkonReady;
    return team.isReady;
  };

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center justify-between w-full">
          <span>{isDeparturesPhase ? "Departure Readiness" : "Ready Status"}</span>
          <Badge 
            variant="outline" 
            className={data.allHumansReady ? "border-green-500 text-green-500" : "border-gold text-gold"}
          >
            {data.readyCount}/{data.humanCount} Ready
          </Badge>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {humanTeams.length === 0 ? (
          <p className="text-muted-foreground text-sm">No human coaches in this dynasty.</p>
        ) : isDeparturesPhase ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Coach</th>
                  <th className="pb-2 font-medium text-center">Departures Submitted</th>
                </tr>
              </thead>
              <tbody>
                {humanTeams.map((team) => (
                  <tr key={team.teamId} className="border-b border-border/50">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{team.abbreviation}</span>
                        <span className="text-muted-foreground">{team.coachName}</span>
                      </div>
                    </td>
                    <td className="py-2 text-center">
                      {team.departuresFinalized ? (
                        <Check className="w-4 h-4 text-green-500 mx-auto" data-testid={`status-departures-ready-${team.teamId}`} />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground mx-auto" data-testid={`status-departures-waiting-${team.teamId}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.allHumansReady && (
              <p className="text-xs text-muted-foreground mt-3">
                All coaches must submit their departures before the league can advance.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Coach</th>
                  <th className="pb-2 font-medium text-center">Ready</th>
                  <th className="pb-2 font-medium text-center">Scout</th>
                  <th className="pb-2 font-medium text-center">Recruit</th>
                  <th className="pb-2 font-medium text-center">Scores</th>
                </tr>
              </thead>
              <tbody>
                {humanTeams.map((team) => (
                  <tr key={team.teamId} className="border-b border-border/50">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{team.abbreviation}</span>
                        <span className="text-muted-foreground">{team.coachName}</span>
                      </div>
                    </td>
                    <td className="py-2 text-center">
                      {getTeamReady(team) ? (
                        <Check className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="py-2 text-center text-muted-foreground">
                      {team.scoutActionsUsed}
                    </td>
                    <td className="py-2 text-center text-muted-foreground">
                      {team.recruitActionsUsed}
                    </td>
                    <td className="py-2 text-center">
                      {team.hasReportedScores ? (
                        <Check className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-red-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function ActionButton({
  label,
  description,
  variant = "default",
  href,
  dataTestId,
  onClick,
  disabled,
}: {
  label: string;
  description: string;
  variant?: "default" | "destructive";
  href?: string;
  dataTestId?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const baseClasses = `w-full flex items-center justify-between p-3 rounded border transition-colors ${
    disabled 
      ? "opacity-50 cursor-not-allowed"
      : "cursor-pointer"
  } ${
    variant === "destructive"
      ? "border-red-500/30 hover:bg-red-500/10 text-red-400"
      : "border-border hover:bg-muted/50"
  }`;

  if (onClick) {
    return (
      <button
        className={baseClasses}
        onClick={onClick}
        disabled={disabled}
        data-testid={dataTestId}
      >
        <div className="text-left">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronRight className="w-4 h-4" />
      </button>
    );
  }

  const content = (
    <div className={baseClasses} data-testid={dataTestId}>
      <div className="text-left">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4" />
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

const difficultyOptions = [
  { value: "beginner", label: "Beginner", description: "CPU recruits poorly, fewer actions" },
  { value: "high_school", label: "High School", description: "Balanced recruiting, standard pace" },
  { value: "all_american", label: "All-American", description: "Aggressive CPU recruiting" },
  { value: "elite", label: "Elite", description: "Maximum CPU recruiting power" },
];

function SettingsTab({
  league,
  onToggleAuditLog,
  onChangeDifficulty,
}: {
  league?: League;
  onToggleAuditLog: (isPublic: boolean) => void;
  onChangeDifficulty: (difficulty: string) => void;
}) {
  return (
    <RetroCard>
      <RetroCardHeader>Dynasty Settings</RetroCardHeader>
      <RetroCardContent>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Public Audit Log</p>
              <p className="text-sm text-muted-foreground">
                Allow all coaches to view the audit log
              </p>
            </div>
            <Switch
              checked={league?.auditLogPublic || false}
              onCheckedChange={onToggleAuditLog}
              data-testid="switch-audit-log-public"
            />
          </div>

          <div className="border-t border-border pt-6">
            <div className="mb-4">
              <p className="font-medium mb-2">CPU Difficulty</p>
              <p className="text-sm text-muted-foreground mb-3">
                Controls how aggressively CPU teams recruit
              </p>
              <div className="grid grid-cols-2 gap-2">
                {difficultyOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangeDifficulty(opt.value)}
                    className={`p-3 rounded-md border text-left transition-all ${
                      league?.cpuDifficulty === opt.value
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-card border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`button-difficulty-${opt.value}`}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs opacity-70 mt-1">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Settings className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Dynasty Name</p>
                <p className="text-sm text-muted-foreground">{league?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Max Teams</p>
                <p className="text-sm text-muted-foreground">{league?.maxTeams}</p>
              </div>
            </div>
          </div>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

function AuditLogTab({ logs }: { logs: AuditLog[] }) {
  return (
    <RetroCard>
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <span>Audit Log</span>
        <Badge variant="outline" className="text-[8px]">{logs.length} entries</Badge>
      </RetroCardHeader>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded">
            <History className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm">{log.action}</p>
              {log.details && (
                <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">
                {new Date(log.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No audit log entries yet</p>
          </div>
        )}
      </div>
    </RetroCard>
  );
}

function InvitesTab({ leagueId, invites }: { leagueId: string; invites: LeagueInvite[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/invites`, { label: label || undefined });
      return res.json();
    },
    onSuccess: (data: LeagueInvite) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      setLabel("");
      const link = `${window.location.origin}/invite/${data.inviteCode}`;
      navigator.clipboard.writeText(link);
      toast({ title: "Invite Link Created", description: "Link copied to clipboard." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", `/api/invites/${code}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      toast({ title: "Invite Revoked", description: "The invite link has been disabled." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(link);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Link Copied", description: "Invite link copied to clipboard." });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">Active</Badge>;
      case "accepted":
        return <Badge variant="outline" className="text-green-400 border-green-400/50">Accepted</Badge>;
      case "revoked":
        return <Badge variant="outline" className="text-red-400 border-red-400/50">Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingInvites = invites.filter(i => i.status === "pending");
  const pastInvites = invites.filter(i => i.status !== "pending");

  return (
    <div className="space-y-6">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-gold" />
            <span>Generate Invite Link</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-muted-foreground mb-4">
            Generate a shareable link that anyone can use to join your dynasty and claim an available CPU team.
          </p>
          <div className="flex gap-3">
            <RetroInput
              type="text"
              placeholder="Label (optional, e.g. 'For Mike')"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1"
              data-testid="input-invite-label"
            />
            <RetroButton
              onClick={() => generateLinkMutation.mutate()}
              disabled={generateLinkMutation.isPending}
              data-testid="button-generate-invite"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              {generateLinkMutation.isPending ? "Generating..." : "Generate Link"}
            </RetroButton>
          </div>
        </RetroCardContent>
      </RetroCard>

      {pendingInvites.length > 0 && (
        <RetroCard>
          <RetroCardHeader className="flex items-center justify-between gap-4">
            <span>Active Links</span>
            <Badge variant="outline" className="text-[8px]">{pendingInvites.length} active</Badge>
          </RetroCardHeader>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <LinkIcon className="w-4 h-4 text-gold shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {invite.label || `Invite ${invite.inviteCode.substring(0, 6)}...`}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Created: {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(invite.status)}
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => copyInviteLink(invite.inviteCode)}
                    data-testid={`button-copy-invite-${invite.inviteCode}`}
                  >
                    {copied === invite.inviteCode ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </RetroButton>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => revokeMutation.mutate(invite.inviteCode)}
                    disabled={revokeMutation.isPending}
                    data-testid={`button-revoke-invite-${invite.inviteCode}`}
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </RetroButton>
                </div>
              </div>
            ))}
          </div>
        </RetroCard>
      )}

      {pastInvites.length > 0 && (
        <RetroCard>
          <RetroCardHeader className="flex items-center justify-between gap-4">
            <span>Past Invites</span>
            <Badge variant="outline" className="text-[8px]">{pastInvites.length} total</Badge>
          </RetroCardHeader>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {pastInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded opacity-60">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {invite.label || `Invite ${invite.inviteCode.substring(0, 6)}...`}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Created: {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {statusBadge(invite.status)}
              </div>
            ))}
          </div>
        </RetroCard>
      )}

      {invites.length === 0 && (
        <RetroCard>
          <RetroCardContent>
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No invite links yet</p>
              <p className="text-sm mt-2">Generate a link above and share it with friends to invite them to your dynasty</p>
            </div>
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
  );
}

interface PostseasonGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  phase: string;
  homeTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { name: string; abbreviation: string; primaryColor: string; secondaryColor: string };
}

interface PostseasonData {
  phase: string;
  conferenceChampionships: PostseasonGame[];
  superRegionals: PostseasonGame[];
  cws: PostseasonGame[];
}

function PostseasonBracket({ leagueId, phase }: { leagueId: string; phase: string }) {
  const { data } = useQuery<PostseasonData>({
    queryKey: ["/api/leagues", leagueId, "postseason"],
    enabled: !!leagueId,
    refetchInterval: 5000,
  });

  if (!data) return null;

  const phaseLabels: Record<string, string> = {
    conference_championship: "Conference Championships",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason: "Postseason Complete",
  };

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-3 w-full">
          <Trophy className="w-5 h-5 text-gold" />
          <span>{phaseLabels[phase] || "Postseason"}</span>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {data.conferenceChampionships.length > 0 && (
          <div className="mb-4">
            <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">Conference Championships</h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {data.conferenceChampionships.map(game => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        )}

        {data.superRegionals.length > 0 && (
          <div className="mb-4">
            <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">Super Regionals Bracket</h4>
            <BracketDisplay games={data.superRegionals} />
          </div>
        )}

        {data.cws.length > 0 && (
          <div>
            <h4 className="font-pixel text-gold text-[10px] mb-2 uppercase">College World Series (Best of 3)</h4>
            <div className="space-y-2">
              {data.cws.map((game, i) => (
                <div key={game.id}>
                  <p className="text-[9px] text-muted-foreground font-pixel mb-1">Game {i + 1}</p>
                  <GameCard game={game} />
                </div>
              ))}
            </div>
            <CWSSeriesStatus games={data.cws} />
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function GameCard({ game }: { game: PostseasonGame }) {
  const homeWon = game.isComplete && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.isComplete && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div className="bg-muted/30 rounded p-2 border border-border" data-testid={`game-card-${game.id}`}>
      <div className={`flex items-center justify-between gap-2 py-1 ${homeWon ? "text-gold" : awayWon ? "text-muted-foreground" : ""}`}>
        <span className="text-xs font-medium truncate">{game.homeTeam?.abbreviation || "TBD"}</span>
        <span className="text-xs font-pixel">{game.isComplete ? game.homeScore : "-"}</span>
      </div>
      <div className="border-t border-border/50 my-0.5" />
      <div className={`flex items-center justify-between gap-2 py-1 ${awayWon ? "text-gold" : homeWon ? "text-muted-foreground" : ""}`}>
        <span className="text-xs font-medium truncate">{game.awayTeam?.abbreviation || "TBD"}</span>
        <span className="text-xs font-pixel">{game.isComplete ? game.awayScore : "-"}</span>
      </div>
      {!game.isComplete && (
        <div className="text-center mt-1">
          <Badge variant="outline" className="text-[8px]">Upcoming</Badge>
        </div>
      )}
    </div>
  );
}

function BracketDisplay({ games }: { games: PostseasonGame[] }) {
  const completedGames = games.filter(g => g.isComplete);
  const upcomingGames = games.filter(g => !g.isComplete);
  
  return (
    <div className="space-y-3">
      {completedGames.length > 0 && (
        <div>
          <p className="text-[9px] text-muted-foreground font-pixel mb-1">Completed</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {completedGames.map(game => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      )}
      {upcomingGames.length > 0 && (
        <div>
          <p className="text-[9px] text-muted-foreground font-pixel mb-1">Next Round</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {upcomingGames.map(game => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CWSSeriesStatus({ games }: { games: PostseasonGame[] }) {
  const completedGames = games.filter(g => g.isComplete);
  if (completedGames.length === 0) return null;

  const winsMap: Record<string, { name: string; wins: number }> = {};
  for (const g of completedGames) {
    const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    const winnerTeam = winnerId === g.homeTeamId ? g.homeTeam : g.awayTeam;
    if (!winsMap[winnerId]) winsMap[winnerId] = { name: winnerTeam?.abbreviation || "TBD", wins: 0 };
    winsMap[winnerId].wins++;
  }

  const entries = Object.values(winsMap);
  const champion = entries.find(e => e.wins >= 2);

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {champion ? (
        <div className="text-center">
          <Trophy className="w-6 h-6 text-gold mx-auto mb-1" />
          <p className="font-pixel text-gold text-xs" data-testid="text-cws-champion">
            {champion.name} Wins the CWS!
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 text-xs">
          {entries.map(e => (
            <span key={e.name} className="font-pixel">
              {e.name}: {e.wins} {e.wins === 1 ? "win" : "wins"}
            </span>
          ))}
        </div>
      )}

      <SimProgressOverlay
        open={showSimOverlay}
        onClose={() => {
          setShowSimOverlay(false);
          if (pendingSeasonSummary !== null) {
            setSummaryCompletedSeason(pendingSeasonSummary);
            setShowSeasonSummary(true);
            setPendingSeasonSummary(null);
          }
        }}
        simSummary={simSummary}
        data-testid="sim-progress-overlay"
      />
    </div>
  );
}

function CommissionerSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </main>
    </div>
  );
}
