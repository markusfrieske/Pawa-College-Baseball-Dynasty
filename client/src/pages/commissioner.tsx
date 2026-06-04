import { useState, useRef, useEffect } from "react";
import { AdvanceProgressBar } from "@/components/advance-progress-bar";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
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
  ChevronDown,
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
  Timer,
  Bell,
  BellRing,
  Bot,
  UserX,
  Crown,
  Loader2,
  DollarSign,
  Zap,
  User,
  Pencil,
  Save,
  RotateCcw,
  Star,
} from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { League, AuditLog, LeagueInvite, SavedRecruitingClass, Player } from "@shared/schema";
import { calculateOVR, getStarRatingFromOVR, ALL_ABILITIES, commonGrade, pitcherCommonGrade } from "@shared/abilities";
import { isPitcher as getIsPitcherPos } from "@shared/positions";
import { SimProgressOverlay, type SimSummary } from "@/components/sim-progress-overlay";
import { SeasonSummaryModal } from "@/components/season-summary-modal";
import { InningScoreboard, useScoreboardEnabled, type InningScoreboardData } from "@/components/inning-scoreboard";
import { RecruitingWizard } from "@/components/recruiting-wizard";

interface HumanCoach {
  coachId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  teamId: string | null;
  teamName: string | null;
  abbreviation: string | null;
  isAutoPilot: boolean;
}

interface CommissionerData {
  league: League;
  auditLogs: AuditLog[];
  readyCoaches: string[];
  totalCoaches: number;
  invites: LeagueInvite[];
  humanCoaches: HumanCoach[];
  oversizedTeams: string[];
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
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [scoreboardData, setScoreboardData] = useState<InningScoreboardData | null>(null);
  const scoreboardEnabled = useScoreboardEnabled();
  const [classSelectionOpen, setClassSelectionOpen] = useState(false);
  const [classSelectionOptions, setClassSelectionOptions] = useState<Array<{ id: string; name: string; recruitCount: number }>>([]);
  const [selectedClassForAdvance, setSelectedClassForAdvance] = useState<string>("auto");
  const [pendingAdvanceSeason, setPendingAdvanceSeason] = useState<number | null>(null);

  const toggleAutoAdvance = (val: boolean) => {
    setAutoAdvance(val);
    localStorage.setItem(`auto-advance-${id}`, val ? "true" : "false");
  };

  const { data, isLoading } = useQuery<CommissionerData>({
    queryKey: ["/api/leagues", id, "commissioner"],
  });

  const advanceWeekMutation = useMutation({
    mutationFn: async (opts?: { savedRecruitingClassId?: string }) => {
      const res = await apiRequest("POST", `/api/leagues/${id}/advance`, opts ?? {});
      return res.json();
    },
    onSuccess: (response: any) => {
      // Two-step class selection: if backend needs the commissioner to pick a recruiting class
      if (response?.needs_class_selection) {
        setClassSelectionOptions(response.savedClasses ?? []);
        setSelectedClassForAdvance("auto");
        setPendingAdvanceSeason(response.currentSeason ?? null);
        setClassSelectionOpen(true);
        return;
      }

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
      if (response?.userTeamGame && scoreboardEnabled) {
        setScoreboardData(response.userTeamGame as InningScoreboardData);
        setShowScoreboard(true);
      }
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
          offseason_signing_day: "Recruiting is over! Decision Day results are in.",
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
          offseason_signing_day: "Decision Day",
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
              advanceWeekMutation.mutate(undefined);
            }
          }, 600);
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const toggleShowReadyNamesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PATCH", `/api/leagues/${id}/settings`, { showReadyNamesToAll: enabled });
    },
    onSuccess: (_r, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      toast({ title: enabled ? "Ready names visible to all coaches" : "Ready names hidden from coaches" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const toggleEmailDigestsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PATCH", `/api/leagues/${id}/settings`, { emailDigestsEnabled: enabled });
    },
    onSuccess: (_r, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      toast({ title: enabled ? "Email Digests Enabled" : "Email Digests Disabled" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const updateAggressionMutation = useMutation({
    mutationFn: async (cpuRecruitingAggression: number) => {
      return apiRequest("PATCH", `/api/leagues/${id}/settings`, { cpuRecruitingAggression });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      const duringRecruiting = (RECRUITING_PHASES as readonly string[]).includes(data?.league?.currentPhase || "");
      toast({
        title: duringRecruiting ? "Aggression Saved (Next Cycle)" : "Aggression Updated",
        description: duringRecruiting
          ? "Change saved — takes effect next recruiting cycle. Current recruiting is already underway."
          : "CPU recruiting aggressiveness has been changed.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const { data: currentUser } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });
  const isPrimaryCommissioner = !!currentUser && currentUser.id === data?.league?.commissionerId;

  const delegateMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: "add" | "remove" }) => {
      return apiRequest("PATCH", `/api/leagues/${id}/co-commissioners`, { userId, action });
    },
    onSuccess: (_response, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      toast({
        title: vars.action === "add" ? "Delegate Added" : "Delegate Removed",
        description: vars.action === "add"
          ? "Coach can now perform commissioner actions."
          : "Co-commissioner access has been revoked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const simFullSeasonMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/sim-full-season`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "postseason"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/roster`] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      if (data?.seasonTransition) {
        const t = data.seasonTransition;
        toast({
          title: "Full Season Complete!",
          description: `Season simulated end-to-end. ${t.recruitsAdded ?? 0} recruits signed, ${t.newRecruits ?? 0} new class generated. Welcome to Season ${data.currentSeason}!`,
        });
      } else {
        toast({ title: "Full Season Simulated", description: "The entire season has been simulated through to the next preseason." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const simulateWeekMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/simulate`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "postseason"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      toast({ title: "Week Simulated", description: "All games have been auto-resolved." });
      if (data?.userTeamGame && scoreboardEnabled) {
        setScoreboardData(data.userTeamGame as InningScoreboardData);
        setShowScoreboard(true);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const backfillScoresMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/backfill-recruiting-scores`, {});
      return res.json() as Promise<{ updated: number; message: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting-scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "dynasty-history"] });
      toast({ title: "Backfill Complete", description: data?.message ?? "Recruiting scores updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Backfill Failed", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const dedupRostersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/admin/dedup-rosters`, {});
      return res.json() as Promise<{ removed: number; log: string[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      const msg = data.removed === 0
        ? "No duplicate players found — rosters are clean."
        : `Removed ${data.removed} duplicate player row(s).`;
      toast({ title: "Dedup Complete", description: msg });
    },
    onError: (error: Error) => {
      toast({ title: "Dedup Failed", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
    offseason_signing_day: "Decision Day",
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

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
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

        {data?.oversizedTeams && data.oversizedTeams.length > 0 && (
          <div className="mb-4 p-3 rounded border border-red-500/50 bg-red-900/20 flex items-start gap-3" data-testid="banner-roster-oversize">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-pixel text-[9px] text-red-400 mb-1">ROSTER OVERSIZE DETECTED</p>
              <p className="text-xs text-muted-foreground">
                The following teams have more than 35 players — this indicates duplicate players may have been created during the last season transition: {data.oversizedTeams.join(", ")}. Use the <span className="text-gold">Dedup Rosters</span> tool in the Actions tab to clean up.
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="actions" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
            <TabsList className="bg-card border border-border inline-flex w-auto">
              <TabsTrigger value="actions" className="font-pixel text-[8px] whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
                Actions
              </TabsTrigger>
              <TabsTrigger value="settings" className="font-pixel text-[8px] whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
                Settings
              </TabsTrigger>
              <TabsTrigger value="audit" className="font-pixel text-[8px] whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
                Audit Log
              </TabsTrigger>
              <TabsTrigger value="invites" className="font-pixel text-[8px] whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
                Invites
              </TabsTrigger>
              <TabsTrigger value="reports" className="font-pixel text-[8px] whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark">
                Reports
              </TabsTrigger>
              <TabsTrigger value="nil" className="font-pixel text-[8px] whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-nil">
                NIL
              </TabsTrigger>
              {isPrimaryCommissioner && (
                <TabsTrigger value="roster-editor" className="font-pixel text-[8px] whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark" data-testid="tab-roster-editor">
                  Roster Editor
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="actions">
            <ActionsTab
              league={data?.league}
              onAdvanceWeek={() => advanceWeekMutation.mutate(undefined)}
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
              onSimFullSeason={() => simFullSeasonMutation.mutate()}
              isSimFullSeason={simFullSeasonMutation.isPending}
              onBackfillScores={() => backfillScoresMutation.mutate()}
              isBackfilling={backfillScoresMutation.isPending}
              onDedupRosters={() => dedupRostersMutation.mutate()}
              isDedupingRosters={dedupRostersMutation.isPending}
              autoAdvance={autoAdvance}
              toggleAutoAdvance={toggleAutoAdvance}
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab
              league={data?.league}
              humanCoaches={data?.humanCoaches ?? []}
              isPrimaryCommissioner={isPrimaryCommissioner}
              onToggleAuditLog={(isPublic) => toggleAuditLogMutation.mutate(isPublic)}
              onChangeDifficulty={(difficulty) => updateDifficultyMutation.mutate(difficulty)}
              onChangeAggression={(aggression) => updateAggressionMutation.mutate(aggression)}
              onToggleDelegate={(userId, isDelegate) =>
                delegateMutation.mutate({ userId, action: isDelegate ? "remove" : "add" })
              }
              isDelegating={delegateMutation.isPending}
              onToggleEmailDigests={(enabled) => toggleEmailDigestsMutation.mutate(enabled)}
              onToggleShowReadyNames={(enabled) => toggleShowReadyNamesMutation.mutate(enabled)}
            />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogTab logs={data?.auditLogs || []} />
          </TabsContent>

          <TabsContent value="invites">
            <InvitesTab leagueId={id!} invites={data?.invites || []} />
          </TabsContent>

          <TabsContent value="reports">
            <GameReportsTab leagueId={id!} />
          </TabsContent>

          <TabsContent value="nil">
            <NilOverviewTab leagueId={id!} />
          </TabsContent>

          {isPrimaryCommissioner && (
            <TabsContent value="roster-editor">
              <RosterEditorTab leagueId={id!} auditLogs={data?.auditLogs || []} />
            </TabsContent>
          )}
        </Tabs>
      </main>

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
      <SeasonSummaryModal
        open={showSeasonSummary}
        onClose={() => setShowSeasonSummary(false)}
        leagueId={id!}
        season={summaryCompletedSeason}
      />
      <InningScoreboard
        open={showScoreboard}
        onClose={() => { setShowScoreboard(false); setScoreboardData(null); }}
        data={scoreboardData}
      />

      {/* Class selection modal — shown when advancing from walkons phase */}
      <Dialog open={classSelectionOpen} onOpenChange={(open) => { if (!open) setClassSelectionOpen(false); }}>
        <DialogContent className="bg-card border-border max-w-md" data-testid="dialog-class-selection">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Choose Recruiting Class</DialogTitle>
            <DialogDescription>
              Season {pendingAdvanceSeason} is ending. Select a saved recruiting class for Season {(pendingAdvanceSeason ?? 0) + 1}, or let the game auto-generate one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Select value={selectedClassForAdvance} onValueChange={setSelectedClassForAdvance}>
              <SelectTrigger className="w-full" data-testid="select-class-for-advance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-Generate Fresh Class</SelectItem>
                {classSelectionOptions.map(cls => (
                  <SelectItem key={cls.id} value={String(cls.id)}>
                    {cls.name} ({cls.recruitCount} recruits)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedClassForAdvance !== "auto" && (
              <p className="text-[10px] text-muted-foreground">
                The selected saved class will replace the auto-generated recruit pool for the upcoming season.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setClassSelectionOpen(false)}
                data-testid="button-cancel-class-selection"
              >
                Cancel
              </RetroButton>
              <RetroButton
                variant="shimmer"
                size="sm"
                onClick={() => {
                  setClassSelectionOpen(false);
                  advanceWeekMutation.mutate({ savedRecruitingClassId: selectedClassForAdvance });
                }}
                loading={advanceWeekMutation.isPending}
                data-testid="button-confirm-class-advance"
              >
                Advance Season
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
  onSimFullSeason,
  isSimFullSeason,
  onBackfillScores,
  isBackfilling,
  onDedupRosters,
  isDedupingRosters,
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
  onSimFullSeason: () => void;
  isSimFullSeason: boolean;
  onBackfillScores: () => void;
  isBackfilling: boolean;
  onDedupRosters: () => void;
  isDedupingRosters: boolean;
  autoAdvance: boolean;
  toggleAutoAdvance: (val: boolean) => void;
}) {
  const { toast } = useToast();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showEditTeamsDialog, setShowEditTeamsDialog] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
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
  const anySim = isAdvancing || isAdvancingSeason || isSimToOffseason || isSimToSigningDay || isSimToPostseason || isSimToCws || isSimFullSeason;
  
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
      case "offseason_signing_day": return "Decision Day! Finalize all commits, add signed recruits to rosters, and advance eligibility. Teams will then manage roster cuts and walk-on signings.";
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
      <ReadyStatusSection
        leagueId={league?.id || ""}
        commissionerUserId={league?.commissionerId}
        coCommissionerIds={Array.isArray(league?.coCommissionerIds) ? (league!.coCommissionerIds as string[]) : []}
        onAdvanceWeek={onAdvanceWeek}
        isAdvancing={isAdvancing}
      />
      
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
              variant="shimmer"
              onClick={() => onAdvanceWeek()}
              disabled={anySim}
              className="w-full"
              data-testid="button-advance-week"
            >
              {advanceIcon}
              {advanceLabel}
            </RetroButton>

            <AdvanceProgressBar leagueId={league?.id || ""} isAdvancing={isAdvancing} />

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
                          This will simulate the entire offseason including recruiting, decision day, and walk-ons. Your recruiting actions won't be applied. This action cannot be undone.
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
                    : "Fast-forward through recruiting, decision day, and start the next season."}
                </p>
              )}
              {/* Sim Full Season — always visible from any active phase */}
              {(["preseason","spring_training","regular_season","conference_championship","super_regionals","cws","offseason_departures","offseason_recruiting_1","offseason_recruiting_2","offseason_recruiting_3","offseason_recruiting_4","offseason_signing_day","offseason_walkons"].includes(league?.currentPhase || "")) && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <RetroButton
                        variant="secondary"
                        disabled={anySim}
                        className="w-full"
                        data-testid="button-sim-full-season"
                      >
                        <FastForward className="w-4 h-4 mr-2" />
                        {isSimFullSeason ? "Simulating Full Season..." : "Sim Full Season"}
                      </RetroButton>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-card border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-pixel text-gold text-sm">Simulate Full Season?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will simulate the entire current season — all games, postseason, recruiting, and signing day — advancing to the next preseason. Your recruiting actions won't be applied. This action is irreversible.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onSimFullSeason} className="bg-gold text-forest-dark" data-testid="button-confirm-sim-full-season">
                          Sim Full Season
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <p className="text-xs text-muted-foreground/60 mt-1.5 text-center">Skips all game phases + recruiting</p>
                </div>
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
                  label="Create Recruiting Class"
                  description="7-step wizard to generate and customize a new recruiting class"
                  onClick={() => setShowWizard(true)}
                  dataTestId="button-open-wizard"
                />
                <ActionButton 
                  label={isImporting ? "Importing..." : "Import Recruiting Class (CSV)"}
                  description="Import recruits from CSV file or generate automatically" 
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
            {(league?.currentPhase === "offseason_signing_day" || league?.currentPhase === "offseason_walkons") && (
              <ActionButton
                label="View Class Reveal"
                description="See all signed recruits as flippable baseball cards"
                href={`/league/${league?.id}/signing-day-reveal`}
                dataTestId="button-view-class-reveal"
              />
            )}
            <ActionButton 
              label="Edit Recruiting Class" 
              description="Bulk edit all recruits" 
              href={`/league/${league?.id}/edit-recruits`}
              dataTestId="button-edit-recruits"
            />
            <ActionButton
              label={isBackfilling ? "Backfilling..." : "Backfill Recruiting Grades"}
              description="Scores seasons with no recruiting grade yet. Class quality, rank, star efficiency, blue chip haul, positional balance, and action efficiency use historical data. Hit rate and gem detection default to conservative estimates."
              onClick={onBackfillScores}
              disabled={isBackfilling}
              dataTestId="button-backfill-recruiting-scores"
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div>
                  <ActionButton
                    label={isDedupingRosters ? "Scanning..." : "Dedup Rosters"}
                    description="Scan all team rosters for duplicate players and remove extras. Safe to run anytime — idempotent."
                    variant="destructive"
                    disabled={isDedupingRosters}
                    dataTestId="button-dedup-rosters"
                  />
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-pixel text-gold text-sm">Dedup All Rosters?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will scan every team for players sharing the same name and remove the duplicate. The earlier-added player is kept. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    onClick={onDedupRosters}
                    data-testid="button-confirm-dedup-rosters"
                  >
                    Run Dedup
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

      {league?.id && (
        <RecruitingWizard
          open={showWizard}
          onClose={() => setShowWizard(false)}
          leagueId={league.id}
          onSaved={() => setShowWizard(false)}
        />
      )}
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
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
          <div className="flex gap-2">
            <RetroButton
              onClick={handleSet}
              disabled={!deadlineInput || deadlineMutation.isPending}
              data-testid="button-set-deadline"
              className="flex-1 sm:flex-none"
            >
              Set
            </RetroButton>
            {currentDeadline && (
              <RetroButton
                variant="outline"
                onClick={handleClear}
                disabled={deadlineMutation.isPending}
                data-testid="button-clear-deadline"
                className="flex-1 sm:flex-none"
              >
                Clear
              </RetroButton>
            )}
          </div>
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
    coachId: string | null;
    coachName: string;
    isReady: boolean;
    isAutoPilot: boolean;
    departuresFinalized: boolean;
    walkonReady: boolean;
    scoutActionsUsed: number;
    recruitActionsUsed: number;
    currentWeekActionCount: number;
    lastActivityAt: string | null;
    hasReportedScores: boolean;
  }>;
  allHumansReady: boolean;
  currentPhase: string;
  phaseDeadline: string | null;
  humanCount: number;
  readyCount: number;
}

function formatLastActivity(lastActivityAt: string | null): string {
  if (!lastActivityAt) return "No activity";
  const diff = Date.now() - new Date(lastActivityAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function ReadyStatusSection({ leagueId, commissionerUserId, coCommissionerIds, onAdvanceWeek, isAdvancing }: { leagueId: string; commissionerUserId?: string; coCommissionerIds?: string[]; onAdvanceWeek?: () => void; isAdvancing?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForceAdvanceConfirm, setShowForceAdvanceConfirm] = useState(false);
  const [autoPilotConfirmTeam, setAutoPilotConfirmTeam] = useState<{ teamId: string; coachName: string; teamName: string } | null>(null);

  const { data: currentUser } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const isCommissioner = !!currentUser && (
    currentUser.id === commissionerUserId ||
    (coCommissionerIds ?? []).includes(currentUser.id)
  );

  const removeCoachMutation = useMutation({
    mutationFn: async (coachId: string) => {
      const res = await apiRequest("DELETE", `/api/leagues/${leagueId}/coaches/${coachId}/remove`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      toast({ title: "Coach Removed", description: "The coach has been removed. Their team is now CPU-controlled." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const autoPilotMutation = useMutation<{ success: boolean; isAutoPilot: boolean; teamId: string }, Error, string>({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest("PATCH", `/api/leagues/${leagueId}/teams/${teamId}/autopilot`, {});
      return res.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      toast({
        title: result.isAutoPilot ? "Auto-Pilot Enabled" : "Auto-Pilot Disabled",
        description: result.isAutoPilot
          ? "The CPU will now manage this team automatically."
          : "The coach has regained full control of their team.",
      });
      setAutoPilotConfirmTeam(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setAutoPilotConfirmTeam(null);
    },
  });

  type ForceAdvanceResponse = {
    currentSeason?: number;
    seasonTransition?: { graduated: number; recruitsAdded: number };
    [key: string]: unknown;
  };

  const forceAdvanceMutation = useMutation<ForceAdvanceResponse, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/force-advance`, {});
      return res.json();
    },
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
      qc.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/roster`] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "walkons"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      setShowForceAdvanceConfirm(false);
      toast({ title: "Phase Force-Advanced", description: "All non-ready coaches were bypassed and the phase has advanced." });
      if (response?.seasonTransition) {
        const t = response.seasonTransition;
        toast({ title: "Season Complete!", description: `${t.graduated} graduated, ${t.recruitsAdded} recruits joined. Welcome to Season ${response.currentSeason}!` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setShowForceAdvanceConfirm(false);
    },
  });

  const { data, isLoading } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
    enabled: !!leagueId,
    refetchInterval: 30000,
  });

  const nudgeMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/teams/${teamId}/nudge`);
      return res.json();
    },
    onSuccess: (_data, teamId) => {
      const team = data?.readyStatus.find(s => s.teamId === teamId);
      toast({ title: "Nudge Sent", description: `Reminder logged for ${team?.coachName ?? "coach"}.` });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
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
  const cpuTeams = data.readyStatus.filter(s => !s.isHumanControlled);
  const isDeparturesPhase = data.currentPhase === "offseason_departures";
  const isWalkonsPhase = data.currentPhase === "offseason_walkons";
  const isRecruitingPhase = ["offseason_recruiting_1","offseason_recruiting_2","offseason_recruiting_3","offseason_recruiting_4"].includes(data.currentPhase);

  const getTeamReady = (team: typeof humanTeams[0]) => {
    // Auto-pilot teams are always treated as ready — CPU manages them
    if (team.isAutoPilot) return true;
    if (isDeparturesPhase) return team.departuresFinalized;
    if (isWalkonsPhase) return team.walkonReady;
    return team.isReady;
  };

  const stalledTeams = humanTeams.filter(t => !getTeamReady(t));
  const readyTeams = humanTeams.filter(t => getTeamReady(t));

  const sectionTitle = isDeparturesPhase
    ? "Departure Readiness"
    : isWalkonsPhase
    ? "Walk-On Readiness"
    : stalledTeams.length > 0
    ? "Who's Stalling?"
    : "Ready Status";

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2">
            {stalledTeams.length > 0 && !data.allHumansReady ? (
              <BellRing className="w-4 h-4 text-amber-400" />
            ) : (
              <Bell className="w-4 h-4 text-green-500" />
            )}
            <span>{sectionTitle}</span>
            <Badge
              variant="outline"
              className={data.allHumansReady ? "border-green-500 text-green-500" : "border-amber-400 text-amber-400"}
            >
              {data.readyCount}/{data.humanCount} Ready
            </Badge>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isCommissioner && onAdvanceWeek && data.allHumansReady && humanTeams.length > 0 && (
              <RetroButton
                variant="shimmer"
                size="sm"
                onClick={onAdvanceWeek}
                disabled={isAdvancing || forceAdvanceMutation.isPending}
                className="shrink-0"
                data-testid="button-advance-now-ready-section"
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                {isAdvancing ? "Advancing..." : "Advance Now"}
              </RetroButton>
            )}
            {isCommissioner && stalledTeams.filter(t => !t.isAutoPilot).length > 0 && (
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setShowForceAdvanceConfirm(true)}
                disabled={isAdvancing || forceAdvanceMutation.isPending}
                className="shrink-0 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                data-testid="button-force-advance"
              >
                <Zap className="w-3.5 h-3.5 mr-1" />
                Force Advance
              </RetroButton>
            )}
          </div>
        </div>
      </RetroCardHeader>

      {/* Force Advance Confirmation Dialog */}
      <AlertDialog open={showForceAdvanceConfirm} onOpenChange={setShowForceAdvanceConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-orange-400 text-sm">Force Advance Phase?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>This will bypass all coaches who haven't marked ready and immediately advance the phase.</p>
                {stalledTeams.filter(t => !t.isAutoPilot).length > 0 && (
                  <div className="rounded border border-orange-500/30 bg-orange-950/20 p-2 text-xs">
                    <p className="font-medium text-orange-400 mb-1">Coaches being bypassed:</p>
                    <ul className="space-y-0.5">
                      {stalledTeams.filter(t => !t.isAutoPilot).map(t => (
                        <li key={t.teamId} className="text-muted-foreground">· {t.coachName} ({t.abbreviation})</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => forceAdvanceMutation.mutate()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-confirm-force-advance"
            >
              {forceAdvanceMutation.isPending ? "Advancing..." : "Force Advance"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-Pilot Enable Confirmation Dialog */}
      <AlertDialog open={!!autoPilotConfirmTeam} onOpenChange={(open) => { if (!open) setAutoPilotConfirmTeam(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-gold text-sm">Enable Auto-Pilot?</AlertDialogTitle>
            <AlertDialogDescription>
              Put <strong>{autoPilotConfirmTeam?.coachName}</strong>'s team ({autoPilotConfirmTeam?.teamName}) on auto-pilot? The CPU will manage their recruiting, readiness, and phase actions until you disable it. The coach account remains intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => autoPilotConfirmTeam && autoPilotMutation.mutate(autoPilotConfirmTeam.teamId)}
              className="bg-gold text-forest-dark hover:bg-gold/90"
              data-testid="button-confirm-autopilot-enable"
            >
              {autoPilotMutation.isPending ? "Enabling..." : "Enable Auto-Pilot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RetroCardContent>
        {humanTeams.length === 0 ? (
          <p className="text-muted-foreground text-sm">No human coaches in this dynasty.</p>
        ) : (
          <div className="space-y-4">
            {/* Stalled coaches - shown prominently when any are waiting */}
            {stalledTeams.length > 0 && (
              <div>
                <p className="font-pixel text-[9px] text-amber-400 uppercase mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Waiting ({stalledTeams.length})
                </p>
                <div className="space-y-2">
                  {stalledTeams.map((team) => {
                    const deadline = data.phaseDeadline ? new Date(data.phaseDeadline) : null;
                    const deadlineDiffMs = deadline ? deadline.getTime() - Date.now() : null;
                    const timeLeft = deadlineDiffMs !== null && deadlineDiffMs <= 0
                      ? "Deadline passed"
                      : deadlineDiffMs !== null && deadlineDiffMs < 3600000
                      ? `${Math.ceil(deadlineDiffMs / 60000)}m left`
                      : deadlineDiffMs !== null
                      ? `${Math.ceil(deadlineDiffMs / 3600000)}h left`
                      : null;
                    const canRemove = isCommissioner && team.userId !== commissionerUserId;
                    const canAutoPilot = isCommissioner && team.userId !== commissionerUserId;

                    return (
                      <div
                        key={team.teamId}
                        className={`flex items-center justify-between gap-3 p-2.5 rounded border ${team.isAutoPilot ? "border-blue-400/30 bg-blue-950/20" : "border-amber-400/30 bg-amber-950/20"}`}
                        data-testid={`stall-row-${team.teamId}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-pixel text-[10px] text-gold">{team.abbreviation}</span>
                            <span className="text-sm">{team.coachName}</span>
                            {team.isAutoPilot ? (
                              <span className="text-[9px] font-pixel text-blue-400 border border-blue-400/40 px-1 py-0.5 rounded flex items-center gap-0.5">
                                <Bot className="w-2.5 h-2.5" /> AUTO-PILOT
                              </span>
                            ) : (
                              <span className="text-[9px] font-pixel text-amber-400 border border-amber-400/40 px-1 py-0.5 rounded">WAITING</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                            {team.isAutoPilot ? (
                              isRecruitingPhase ? (
                                <span className="text-blue-400/70">CPU took {team.currentWeekActionCount} action{team.currentWeekActionCount !== 1 ? "s" : ""} this week</span>
                              ) : (
                                <span className="text-blue-400/70">CPU is managing this team</span>
                              )
                            ) : isDeparturesPhase ? (
                              <span>Departures not submitted</span>
                            ) : isWalkonsPhase ? (
                              <span>Roster not finalized</span>
                            ) : isRecruitingPhase ? (
                              <>
                                <span>{team.currentWeekActionCount} action{team.currentWeekActionCount !== 1 ? "s" : ""} this week</span>
                                <span>·</span>
                                <span>Scout: {team.scoutActionsUsed} · Recruit: {team.recruitActionsUsed}</span>
                              </>
                            ) : (
                              <span>Not marked ready</span>
                            )}
                            {!team.isAutoPilot && team.lastActivityAt && (
                              <>
                                <span>·</span>
                                <span className="text-muted-foreground/70">Last active: {formatLastActivity(team.lastActivityAt)}</span>
                              </>
                            )}
                            {!team.isAutoPilot && !team.lastActivityAt && (
                              <span className="text-muted-foreground/50">No activity yet this week</span>
                            )}
                          </div>
                          {!team.isAutoPilot && timeLeft && (
                            <div className="flex items-center gap-1 mt-1">
                              <Timer className="w-3 h-3 text-amber-400" />
                              <span className="text-[10px] text-amber-400">{timeLeft}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!team.isAutoPilot && (
                            <RetroButton
                              variant="outline"
                              size="sm"
                              onClick={() => nudgeMutation.mutate(team.teamId)}
                              disabled={nudgeMutation.isPending}
                              data-testid={`button-nudge-${team.teamId}`}
                              className="border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
                            >
                              <BellRing className="w-3 h-3 mr-1" />
                              Nudge
                            </RetroButton>
                          )}
                          {canAutoPilot && (
                            <RetroButton
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (team.isAutoPilot) {
                                  autoPilotMutation.mutate(team.teamId);
                                } else {
                                  setAutoPilotConfirmTeam({ teamId: team.teamId, coachName: team.coachName, teamName: team.teamName });
                                }
                              }}
                              disabled={autoPilotMutation.isPending}
                              data-testid={`button-autopilot-${team.teamId}`}
                              className={team.isAutoPilot
                                ? "border-blue-400/40 text-blue-400 hover:bg-blue-400/10"
                                : "border-blue-500/40 text-blue-400/70 hover:bg-blue-500/10 hover:text-blue-400"
                              }
                              title={team.isAutoPilot ? "Disable Auto-Pilot" : "Enable Auto-Pilot"}
                            >
                              <Bot className="w-3 h-3" />
                            </RetroButton>
                          )}
                          {canRemove && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <RetroButton
                                  variant="outline"
                                  size="sm"
                                  data-testid={`button-remove-coach-stall-${team.teamId}`}
                                  className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                                >
                                  <UserX className="w-3 h-3" />
                                </RetroButton>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-card border-border">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="font-pixel text-gold text-sm">Remove Coach?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove <strong>{team.coachName}</strong> from the dynasty? Their team ({team.teamName}) will become CPU-controlled. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => removeCoachMutation.mutate(team.coachId!)}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    data-testid={`button-confirm-remove-coach-${team.teamId}`}
                                  >
                                    Remove Coach
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ready coaches */}
            {readyTeams.length > 0 && (
              <div>
                {stalledTeams.length > 0 && (
                  <p className="font-pixel text-[9px] text-green-500 uppercase mb-2 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Ready ({readyTeams.length})
                  </p>
                )}
                <div className="space-y-1">
                  {readyTeams.map((team) => {
                    const canRemove = isCommissioner && team.userId !== commissionerUserId;
                    const canAutoPilot = isCommissioner && team.userId !== commissionerUserId;
                    return (
                    <div
                      key={team.teamId}
                      className={`flex items-center justify-between gap-2 py-1.5 px-2 rounded border ${team.isAutoPilot ? "border-blue-400/20 bg-blue-950/10" : "border-green-500/20 bg-green-950/20"}`}
                      data-testid={`ready-row-${team.teamId}`}
                    >
                      <div className="flex items-center gap-2">
                        {team.isAutoPilot ? (
                          <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        )}
                        <span className="font-pixel text-[10px] text-gold">{team.abbreviation}</span>
                        <span className="text-sm text-muted-foreground">{team.coachName}</span>
                        {team.isAutoPilot && (
                          <span className="text-[9px] font-pixel text-blue-400 border border-blue-400/40 px-1 py-0.5 rounded">AUTO-PILOT</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {isRecruitingPhase && !team.isAutoPilot && (
                          <span>{team.currentWeekActionCount} action{team.currentWeekActionCount !== 1 ? "s" : ""}</span>
                        )}
                        {isRecruitingPhase && team.isAutoPilot && (
                          <span className="text-blue-400/70">{team.currentWeekActionCount} CPU action{team.currentWeekActionCount !== 1 ? "s" : ""}</span>
                        )}
                        {!team.isAutoPilot && team.lastActivityAt && (
                          <span className="opacity-60">{formatLastActivity(team.lastActivityAt)}</span>
                        )}
                        {canAutoPilot && (
                          <button
                            type="button"
                            onClick={() => {
                              if (team.isAutoPilot) {
                                autoPilotMutation.mutate(team.teamId);
                              } else {
                                setAutoPilotConfirmTeam({ teamId: team.teamId, coachName: team.coachName, teamName: team.teamName });
                              }
                            }}
                            disabled={autoPilotMutation.isPending}
                            title={team.isAutoPilot ? "Disable Auto-Pilot" : "Enable Auto-Pilot"}
                            data-testid={`button-autopilot-${team.teamId}`}
                            className={`transition-colors ${team.isAutoPilot ? "text-blue-400 hover:text-blue-300" : "text-muted-foreground/40 hover:text-blue-400"}`}
                          >
                            <Bot className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canRemove && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="text-red-400/60 hover:text-red-400 transition-colors ml-1"
                                title="Remove coach"
                                data-testid={`button-remove-coach-ready-${team.teamId}`}
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-card border-border">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="font-pixel text-gold text-sm">Remove Coach?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remove <strong>{team.coachName}</strong> from the dynasty? Their team ({team.teamName}) will become CPU-controlled. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeCoachMutation.mutate(team.coachId!)}
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                  data-testid={`button-confirm-remove-coach-ready-${team.teamId}`}
                                >
                                  Remove Coach
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CPU teams summary */}
            {cpuTeams.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bot className="w-3.5 h-3.5" />
                  <span>{cpuTeams.length} CPU team{cpuTeams.length !== 1 ? "s" : ""} — auto-managed</span>
                </div>
              </div>
            )}

            {data.allHumansReady && humanTeams.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded bg-green-950/30 border border-green-500/30">
                <Check className="w-4 h-4 text-green-500 shrink-0" />
                <span className="text-sm text-green-400">All coaches are ready — use the button above to advance.</span>
              </div>
            )}
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

function TransferCommissionerSection({ leagueId, commissionerId }: { leagueId: string; commissionerId?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: currentUser } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: readyData } = useQuery<ReadyStatusData>({
    queryKey: ["/api/leagues", leagueId, "ready-status"],
    enabled: !!leagueId,
  });

  const humanCoaches = (readyData?.readyStatus ?? []).filter(
    s => s.isHumanControlled && s.userId !== commissionerId
  );

  const transferMutation = useMutation({
    mutationFn: async (newUserId: string) => {
      const res = await apiRequest("PATCH", `/api/leagues/${leagueId}/commissioner`, { newUserId });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      toast({ title: "Commissioner Role Transferred", description: "The role has been handed off. You are now a regular coach." });
      setShowConfirm(false);
      navigate(`/league/${leagueId}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setShowConfirm(false);
    },
  });

  const selectedCoach = humanCoaches.find(c => c.userId === selectedUserId);

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-gold" />
          <span>Transfer Commissioner Role</span>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <p className="text-muted-foreground text-sm mb-4">
          Hand off commissioner duties to another human coach in the league. You will become a regular coach — this takes effect immediately.
        </p>
        {humanCoaches.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">No other human coaches in the league to transfer to.</p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="flex-1 h-9 rounded border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-gold"
              data-testid="select-transfer-commissioner"
            >
              <option value="">Select a coach...</option>
              {humanCoaches.map(c => (
                <option key={c.userId!} value={c.userId!}>
                  {c.coachName} ({c.teamName})
                </option>
              ))}
            </select>
            <RetroButton
              onClick={() => setShowConfirm(true)}
              disabled={!selectedUserId || transferMutation.isPending}
              data-testid="button-transfer-commissioner"
            >
              <Crown className="w-4 h-4 mr-2" />
              Transfer
            </RetroButton>
          </div>
        )}
      </RetroCardContent>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-gold text-sm">Transfer Commissioner Role?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to transfer the commissioner role to <strong>{selectedCoach?.coachName}</strong> ({selectedCoach?.teamName}). This is immediate — you will become a regular coach and lose all commissioner controls.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => transferMutation.mutate(selectedUserId)}
              className="bg-gold text-forest-dark hover:bg-gold/90"
              data-testid="button-confirm-transfer-commissioner"
            >
              {transferMutation.isPending ? "Transferring..." : "Transfer Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RetroCard>
  );
}

const RECRUITING_PHASES = ["offseason_recruiting_1", "offseason_recruiting_2", "offseason_recruiting_3", "offseason_recruiting_4"] as const;

const aggressionOptions = [
  { value: 1, label: "Conservative", description: "CPU offers late, easy to out-recruit" },
  { value: 2, label: "Cautious", description: "CPU moves carefully, slightly slower" },
  { value: 3, label: "Standard", description: "Default CPU recruiting pace" },
  { value: 4, label: "Aggressive", description: "CPU offers earlier, harder to sign recruits" },
  { value: 5, label: "Ultra", description: "CPU offers immediately, maximum competition" },
];

function SettingsTab({
  league,
  humanCoaches,
  isPrimaryCommissioner,
  onToggleAuditLog,
  onChangeDifficulty,
  onChangeAggression,
  onToggleDelegate,
  isDelegating,
  onToggleEmailDigests,
  onToggleShowReadyNames,
}: {
  league?: League;
  humanCoaches: HumanCoach[];
  isPrimaryCommissioner: boolean;
  onToggleAuditLog: (isPublic: boolean) => void;
  onChangeDifficulty: (difficulty: string) => void;
  onChangeAggression: (aggression: number) => void;
  onToggleDelegate: (userId: string, isDelegate: boolean) => void;
  isDelegating: boolean;
  onToggleEmailDigests: (enabled: boolean) => void;
  onToggleShowReadyNames: (enabled: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const currentAggression = league?.cpuRecruitingAggression ?? 3;
  const [autoPilotConfirmCoach, setAutoPilotConfirmCoach] = useState<{ teamId: string; coachName: string; teamName: string } | null>(null);

  const autoPilotMutation = useMutation<{ success: boolean; isAutoPilot: boolean; teamId: string }, Error, string>({
    mutationFn: async (teamId: string) => {
      const res = await apiRequest("PATCH", `/api/leagues/${league?.id}/teams/${teamId}/autopilot`, {});
      return res.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", league?.id, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", league?.id, "commissioner"] });
      toast({
        title: result.isAutoPilot ? "Auto-Pilot Enabled" : "Auto-Pilot Disabled",
        description: result.isAutoPilot
          ? "CPU will manage this team's actions going forward."
          : "Coach has regained full control of their team.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const nonCommissionerHumanCoaches = humanCoaches.filter(c => c.userId !== league?.commissionerId && c.teamId);

  return (
    <div className="space-y-6">
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

          <div className="flex items-center justify-between border-t border-border pt-6">
            <div>
              <p className="font-medium">Weekly Email Digests</p>
              <p className="text-sm text-muted-foreground">
                Send coaches a recap email after each phase advance
              </p>
            </div>
            <Switch
              checked={league?.emailDigestsEnabled ?? true}
              onCheckedChange={onToggleEmailDigests}
              data-testid="switch-email-digests"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-6">
            <div>
              <p className="font-medium">Show Ready Status to All Coaches</p>
              <p className="text-sm text-muted-foreground">
                Let coaches see which teams have and haven't marked ready (off = coaches see only the count)
              </p>
            </div>
            <Switch
              checked={league?.showReadyNamesToAll ?? false}
              onCheckedChange={onToggleShowReadyNames}
              data-testid="switch-show-ready-names"
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
            <div className="mb-4">
              <p className="font-medium mb-2">CPU Recruiting Aggressiveness</p>
              <p className="text-sm text-muted-foreground mb-3">
                Fine-tunes how early CPU teams extend offers within the 4-week recruiting window. Stacks on top of the difficulty tier.
              </p>
              {(RECRUITING_PHASES as readonly string[]).includes(league?.currentPhase || "") && (
                <div className="flex items-start gap-2 mb-3 p-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Recruiting is currently active — any change will take effect at the start of the next recruiting cycle.</span>
                </div>
              )}
              <div className="grid grid-cols-5 gap-1.5">
                {aggressionOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangeAggression(opt.value)}
                    className={`p-2 rounded-md border text-center transition-all ${
                      currentAggression === opt.value
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-card border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`button-aggression-${opt.value}`}
                    title={opt.description}
                  >
                    <div className="font-medium text-xs">{opt.label}</div>
                    <div className="text-[10px] opacity-60 mt-0.5 leading-tight hidden sm:block">{opt.description}</div>
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

    {nonCommissionerHumanCoaches.length > 0 && (
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gold" />
            <span>Coach Management</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Enable auto-pilot for inactive coaches. The CPU will manage their team's recruiting, readiness, and phase actions until disabled.
          </p>
          <div className="space-y-2">
            {nonCommissionerHumanCoaches.map(coach => {
              const coachName = `${coach.firstName} ${coach.lastName}`;
              return (
                <div
                  key={coach.coachId}
                  className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                    coach.isAutoPilot
                      ? "bg-blue-950/20 border-blue-400/30"
                      : "bg-muted/30 border-border"
                  }`}
                  data-testid={`row-coach-mgmt-${coach.coachId}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {coach.isAutoPilot ? (
                      <Bot className="w-4 h-4 text-blue-400 shrink-0" />
                    ) : (
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{coachName}</p>
                        {coach.abbreviation && (
                          <span className="font-pixel text-[9px] text-gold shrink-0">{coach.abbreviation}</span>
                        )}
                        {coach.isAutoPilot && (
                          <Badge className="text-[8px] bg-blue-500/20 text-blue-400 border-blue-500/40 shrink-0 px-1">AUTO-PILOT</Badge>
                        )}
                      </div>
                      {coach.teamName && (
                        <p className="text-xs text-muted-foreground truncate">{coach.teamName}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={autoPilotMutation.isPending}
                    onClick={() => {
                      if (coach.isAutoPilot) {
                        autoPilotMutation.mutate(coach.teamId!);
                      } else {
                        setAutoPilotConfirmCoach({ teamId: coach.teamId!, coachName, teamName: coach.teamName ?? "" });
                      }
                    }}
                    className={`ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-all disabled:opacity-50 ${
                      coach.isAutoPilot
                        ? "bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30"
                        : "bg-muted/50 border-border text-muted-foreground hover:border-blue-400/50 hover:text-blue-400"
                    }`}
                    data-testid={`button-autopilot-settings-${coach.coachId}`}
                    title={coach.isAutoPilot ? "Disable Auto-Pilot" : "Enable Auto-Pilot"}
                  >
                    <Bot className="w-3 h-3" />
                    <span>{coach.isAutoPilot ? "Disable" : "Enable"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </RetroCardContent>
      </RetroCard>
    )}

    <AlertDialog open={!!autoPilotConfirmCoach} onOpenChange={(open) => { if (!open) setAutoPilotConfirmCoach(null); }}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-pixel text-gold text-sm">Enable Auto-Pilot?</AlertDialogTitle>
          <AlertDialogDescription>
            Put <strong>{autoPilotConfirmCoach?.coachName}</strong>'s team ({autoPilotConfirmCoach?.teamName}) on auto-pilot? The CPU will manage their recruiting, readiness, and phase actions until you disable it. The coach account remains intact.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => autoPilotConfirmCoach && autoPilotMutation.mutate(autoPilotConfirmCoach.teamId)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="button-confirm-autopilot-settings"
          >
            {autoPilotMutation.isPending ? "Enabling..." : "Enable Auto-Pilot"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {isPrimaryCommissioner && humanCoaches.length > 0 && (
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-gold" />
            <span>Co-Commissioner Delegates</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Delegates can perform all commissioner actions — advance, simulate, manage settings, and more. Only the primary commissioner can manage delegates or invite links.
          </p>
          <div className="space-y-2">
            {humanCoaches.map(coach => {
              const coIds: string[] = Array.isArray(league?.coCommissionerIds) ? (league!.coCommissionerIds as string[]) : [];
              const isDelegate = coIds.includes(coach.userId);
              const isPrimary = coach.userId === league?.commissionerId;
              return (
                <div
                  key={coach.userId}
                  className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border"
                  data-testid={`row-delegate-${coach.coachId}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {coach.firstName} {coach.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{coach.email}</p>
                    </div>
                    {isPrimary && (
                      <Badge className="text-[8px] bg-gold/20 text-gold border-gold/40 shrink-0">COMMISSIONER</Badge>
                    )}
                    {isDelegate && !isPrimary && (
                      <Badge className="text-[8px] bg-blue-500/20 text-blue-400 border-blue-500/40 shrink-0">DELEGATE</Badge>
                    )}
                  </div>
                  {!isPrimary && (
                    <button
                      type="button"
                      disabled={isDelegating}
                      onClick={() => onToggleDelegate(coach.userId, isDelegate)}
                      className={`ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                        isDelegate
                          ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                          : "bg-gold/20 border-gold/40 text-gold hover:bg-gold/30 disabled:opacity-50"
                      }`}
                      data-testid={`button-delegate-${isDelegate ? "remove" : "add"}-${coach.coachId}`}
                    >
                      {isDelegating ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /><span>...</span></>
                      ) : (
                        isDelegate ? "Revoke" : "Grant"
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </RetroCardContent>
      </RetroCard>
    )}

    {league?.id && (
      <TransferCommissionerSection leagueId={league.id} commissionerId={league.commissionerId ?? undefined} />
    )}
    </div>
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

const EXPIRY_OPTIONS = [
  { value: "", label: "No expiry" },
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
];

function InvitesTab({ leagueId, invites }: { leagueId: string; invites: LeagueInvite[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [expiresIn, setExpiresIn] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/invites`, {
        label: label || undefined,
        expiresIn: expiresIn || undefined,
      });
      return res.json();
    },
    onSuccess: (data: LeagueInvite) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      setLabel("");
      setExpiresIn("");
      const link = `${window.location.origin}/invite/${data.inviteCode}`;
      navigator.clipboard.writeText(link);
      toast({ title: "Invite Link Created", description: "Link copied to clipboard." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <RetroInput
              type="text"
              placeholder="Label (optional, e.g. 'For Mike')"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1 min-w-0"
              data-testid="input-invite-label"
            />
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-gold shrink-0"
              data-testid="select-invite-expiry"
            >
              {EXPIRY_OPTIONS.map(o => (
                <option key={o.value} value={o.value} className="bg-forest-card">{o.label}</option>
              ))}
            </select>
            <RetroButton
              onClick={() => generateLinkMutation.mutate()}
              disabled={generateLinkMutation.isPending}
              data-testid="button-generate-invite"
              className="shrink-0"
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
              <div key={invite.id} className="flex flex-col gap-2 p-3 bg-muted/30 rounded">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <LinkIcon className="w-3.5 h-3.5 text-gold shrink-0" />
                    <span className="text-xs truncate text-muted-foreground">
                      {invite.label || `Invite ${invite.inviteCode.substring(0, 6)}...`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {statusBadge(invite.status)}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(invite.createdAt).toLocaleDateString()}
                      {invite.expiresAt && (
                        <span className={new Date(invite.expiresAt) <= new Date() ? " text-red-400" : " text-yellow-400/80"}>
                          {" · "}Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/invite/${invite.inviteCode}`}
                    className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground font-mono select-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    data-testid={`input-invite-url-${invite.inviteCode}`}
                  />
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => copyInviteLink(invite.inviteCode)}
                    data-testid={`button-copy-invite-${invite.inviteCode}`}
                  >
                    {copied === invite.inviteCode ? (
                      <Check className="w-3 h-3 text-green-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </RetroButton>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => revokeMutation.mutate(invite.inviteCode)}
                    disabled={revokeMutation.isPending}
                    data-testid={`button-revoke-invite-${invite.inviteCode}`}
                  >
                    <X className="w-3 h-3 text-red-400" />
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

    </div>
  );
}

interface ScheduleGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam?: { name: string; abbreviation: string };
  awayTeam?: { name: string; abbreviation: string };
  isComplete: boolean;
}

interface GameReport {
  id: string;
  gameId: string;
  leagueId: string;
  reporterUserId: string;
  reporterTeamId: string | null;
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  status: string;
  disputeReason: string | null;
  inningScores: number[][] | string | null;
  createdAt: string;
}

function GameReportsTab({ leagueId }: { leagueId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reports, isLoading } = useQuery<GameReport[]>({
    queryKey: ["/api/leagues", leagueId, "game-reports", "pending"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/game-reports/pending`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
  });

  const { data: scheduleData } = useQuery<{ games: ScheduleGame[]; humanTeamIds: string[] }>({
    queryKey: ["/api/leagues", leagueId, "schedule"],
  });

  // Reuse the already-cached commissioner data to build a userId → coachName lookup.
  const { data: commissionerData } = useQuery<{ readyStatus: Array<{ userId: string | null; coachName: string }> }>({
    queryKey: ["/api/leagues", leagueId, "commissioner"],
  });
  const coachNameByUserId = new Map<string, string>(
    (commissionerData?.readyStatus ?? [])
      .filter(s => s.userId)
      .map(s => [s.userId!, s.coachName])
  );

  const finalizeMutation = useMutation({
    mutationFn: async (gameId: string) => {
      return apiRequest("POST", `/api/leagues/${leagueId}/games/${gameId}/report/finalize`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "game-reports", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
      toast({ title: "Game Finalized", description: "The reported score has been accepted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  const pending = reports?.filter(r => r.status === "pending") ?? [];
  const disputed = reports?.filter(r => r.status === "disputed") ?? [];

  const getGameInfo = (report: GameReport): ScheduleGame | undefined => {
    return scheduleData?.games?.find(g => g.id === report.gameId);
  };

  function ReportCard({ report }: { report: GameReport }) {
    const game = getGameInfo(report);
    const isDisputed = report.status === "disputed";
    const isPending = report.status === "pending";

    const reporterTeamName = report.reporterTeamId
      ? (game?.homeTeamId === report.reporterTeamId ? game?.homeTeam?.name : game?.awayTeam?.name) ?? "Unknown team"
      : "Commissioner";
    const reporterCoachName = coachNameByUserId.get(report.reporterUserId) ?? null;
    const reporterLabel = reporterCoachName
      ? `${reporterCoachName} (${reporterTeamName})`
      : reporterTeamName;

    const parsedInnings: Array<[number, number]> | null = (() => {
      if (!report.inningScores) return null;
      try {
        // DB JSON column returns a parsed array; legacy text columns return a string
        const raw = typeof report.inningScores === "string"
          ? JSON.parse(report.inningScores)
          : report.inningScores;
        if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) return raw as Array<[number, number]>;
        return null;
      } catch { return null; }
    })();

    return (
      <div className={`p-4 rounded border ${isDisputed ? "bg-red-900/20 border-red-800/40" : isPending ? "bg-yellow-900/10 border-yellow-700/30" : "bg-green-900/10 border-green-800/30"}`} data-testid={`report-card-${report.id}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-[9px] ${isDisputed ? "border-red-600 text-red-400" : isPending ? "border-yellow-600 text-yellow-400" : "border-green-600 text-green-400"}`}>
                {report.status.toUpperCase()}
              </Badge>
              {game && (
                <span className="text-sm font-medium">
                  {game.awayTeam?.name ?? "Away"} @ {game.homeTeam?.name ?? "Home"}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground font-bold">
              Score: {report.awayScore} - {report.homeScore}
            </p>
            <p className="text-xs text-muted-foreground">
              {report.awayHits}H / {report.homeHits}H &nbsp;|&nbsp; {report.awayErrors}E / {report.homeErrors}E
            </p>
            <p className="text-xs text-muted-foreground">
              Reported by: <span className="text-foreground">{reporterLabel}</span>
            </p>
            {parsedInnings && parsedInnings.length > 0 && (
              <div className="text-[9px] font-mono text-muted-foreground overflow-x-auto">
                <div className="flex gap-1">
                  <span className="w-14 shrink-0 text-right pr-1">Away</span>
                  {parsedInnings.map(([away], i) => (
                    <span key={i} className="w-5 text-center">{away}</span>
                  ))}
                  <span className="w-6 text-center font-bold text-foreground">{report.awayScore}</span>
                </div>
                <div className="flex gap-1">
                  <span className="w-14 shrink-0 text-right pr-1">Home</span>
                  {parsedInnings.map(([, home], i) => (
                    <span key={i} className="w-5 text-center">{home}</span>
                  ))}
                  <span className="w-6 text-center font-bold text-foreground">{report.homeScore}</span>
                </div>
              </div>
            )}
            {report.disputeReason && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {report.disputeReason}
              </p>
            )}
            <p className="text-[9px] text-muted-foreground">
              Submitted {new Date(report.createdAt).toLocaleDateString()}
            </p>
          </div>
          {(isPending || isDisputed) && (
            <RetroButton
              size="sm"
              variant="primary"
              onClick={() => finalizeMutation.mutate(report.gameId)}
              disabled={finalizeMutation.isPending}
              data-testid={`button-finalize-${report.id}`}
            >
              <Check className="w-3 h-3 mr-1" /> Force Finalize
            </RetroButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {disputed.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-red-400">Disputed Reports ({disputed.length})</span>
            </div>
          </RetroCardHeader>
          <RetroCardContent className="space-y-3">
            {disputed.map(r => <ReportCard key={r.id} report={r} />)}
          </RetroCardContent>
        </RetroCard>
      )}

      {pending.length > 0 && (
        <RetroCard>
          <RetroCardHeader>
            <span className="text-yellow-400">Pending Reports ({pending.length})</span>
          </RetroCardHeader>
          <RetroCardContent className="space-y-3">
            {pending.map(r => <ReportCard key={r.id} report={r} />)}
          </RetroCardContent>
        </RetroCard>
      )}

      {(reports?.length ?? 0) === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No pending or disputed reports. Reports appear here when human coaches submit game results.
        </div>
      )}
    </div>
  );
}

interface NilTeamOverview {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  primaryColor: string;
  isCpu: boolean;
  conferenceName: string;
  nilBudget: number;
  nilSpent: number;
  nilRemaining: number;
  baseAllocation: number;
  bonusTotal: number;
  earnings: Array<{ id: string; category: string; amount: number; description: string }>;
}

interface NilOverviewResponse {
  season: number;
  overview: NilTeamOverview[];
}

function NilOverviewTab({ leagueId }: { leagueId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<NilOverviewResponse>({
    queryKey: ["/api/leagues", leagueId, "nil-earnings"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/nil-earnings`).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1,2,3,4].map(i => <div key={i} className="h-14 bg-card border border-border rounded animate-pulse" />)}
      </div>
    );
  }

  const overview = data?.overview ?? [];

  if (overview.length === 0) {
    return (
      <div className="text-center py-16">
        <DollarSign className="w-12 h-12 text-gold/30 mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">NIL budget data will appear here after the first season transition.</p>
      </div>
    );
  }

  const maxBudget = Math.max(...overview.map(t => t.nilBudget), 1);

  return (
    <div className="space-y-4">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gold" />
            <span>NIL Budget Rankings — Season {data?.season}</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-2">
            {overview.map((team, idx) => {
              const spentPct = team.nilBudget > 0 ? Math.min(100, Math.round((team.nilSpent / team.nilBudget) * 100)) : 0;
              const budgetBarPct = Math.round((team.nilBudget / maxBudget) * 100);
              const isOpen = expanded === team.teamId;

              return (
                <div key={team.teamId} data-testid={`nil-row-${team.teamId}`}>
                  <button
                    className="w-full text-left p-3 rounded border border-border/50 hover:border-gold/40 bg-card/50 hover:bg-card transition-colors"
                    onClick={() => setExpanded(isOpen ? null : team.teamId)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-muted-foreground w-5 text-right shrink-0 font-pixel">#{idx + 1}</span>
                      <div
                        className="w-6 h-6 rounded shrink-0 flex items-center justify-center text-[8px] font-pixel font-bold"
                        style={{ backgroundColor: team.primaryColor, color: "#fff" }}
                      >
                        {team.teamAbbr.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{team.teamName}</span>
                          <span className="text-gold font-bold text-xs shrink-0">${(team.nilBudget / 1_000_000).toFixed(2)}M</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-muted-foreground truncate">{team.conferenceName}</span>
                          {team.bonusTotal > 0 && (
                            <Badge className="text-[7px] px-1 py-0 bg-gold/20 text-gold border-gold/40 h-3.5">
                              <Zap className="w-2 h-2 mr-0.5" />+${(team.bonusTotal / 1_000).toFixed(0)}K bonus
                            </Badge>
                          )}
                          {!team.isCpu && (
                            <Badge className="text-[7px] px-1 py-0 bg-blue-500/20 text-blue-400 border-blue-500/40 h-3.5">Human</Badge>
                          )}
                        </div>
                        <div className="mt-1.5 w-full bg-muted/30 rounded h-1">
                          <div className="bg-gold/50 h-1 rounded" style={{ width: `${budgetBarPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border border-t-0 border-border/50 rounded-b p-3 bg-card/20 space-y-1.5">
                      <div className="grid grid-cols-3 gap-2 text-center mb-3">
                        <div className="p-1.5 bg-gold/10 rounded">
                          <p className="text-gold font-bold text-xs">${(team.nilBudget / 1_000_000).toFixed(2)}M</p>
                          <p className="text-[8px] text-muted-foreground">Total</p>
                        </div>
                        <div className="p-1.5 bg-red-500/10 rounded">
                          <p className="text-red-400 font-bold text-xs">${(team.nilSpent / 1_000_000).toFixed(2)}M</p>
                          <p className="text-[8px] text-muted-foreground">Spent ({spentPct}%)</p>
                        </div>
                        <div className="p-1.5 bg-green-500/10 rounded">
                          <p className="text-green-400 font-bold text-xs">${(team.nilRemaining / 1_000_000).toFixed(2)}M</p>
                          <p className="text-[8px] text-muted-foreground">Remaining</p>
                        </div>
                      </div>
                      {team.earnings.map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            {e.category === "base" ? (
                              <DollarSign className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <Zap className="w-2.5 h-2.5 text-gold flex-shrink-0" />
                            )}
                            {e.description}
                          </span>
                          <span className={e.category === "base" ? "text-foreground font-medium" : "text-gold font-medium"}>
                            {e.category === "base" ? "" : "+"} ${(e.amount / 1_000_000).toFixed(2)}M
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

// ── Roster Editor ────────────────────────────────────────────────────────────

interface LeagueTeam {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  conferenceId: string | null;
}

interface LeagueConference {
  id: string;
  name: string;
}

interface LeagueWithTeams {
  teams: LeagueTeam[];
  conferences: LeagueConference[];
}

function ovrColor(ovr: number): string {
  if (ovr >= 500) return "text-yellow-400 font-bold";
  if (ovr >= 400) return "text-green-400 font-bold";
  if (ovr >= 300) return "text-foreground";
  if (ovr >= 200) return "text-muted-foreground";
  return "text-red-400/70";
}

function StarBadge({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-2.5 h-2.5 ${i <= stars ? "fill-gold text-gold" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function AbilityPill({ name }: { name: string }) {
  const ability = ALL_ABILITIES.find(a => a.name === name);
  const tier = ability?.tier ?? "blue";
  const cls = tier === "gold"
    ? "bg-yellow-600/20 text-yellow-400 border-yellow-600/30"
    : tier === "red"
    ? "bg-red-600/20 text-red-400 border-red-600/30"
    : "bg-blue-600/20 text-blue-400 border-blue-600/30";
  return (
    <Badge variant="outline" className={`text-[8px] px-1 py-0 ${cls}`}>{name}</Badge>
  );
}

function InlineStatCell({
  value,
  field,
  playerId,
  onUpdate,
}: {
  value: number;
  field: string;
  playerId: string;
  onUpdate: (field: string, v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const n = Math.max(1, Math.min(99, Number(draft) || value));
    onUpdate(field, n);
    setEditing(false);
  };

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={1}
        max={99}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setDraft(String(value)); }
        }}
        onClick={e => e.stopPropagation()}
        className="w-10 h-6 text-[11px] text-center bg-muted/60 border border-gold/50 rounded focus:outline-none focus:border-gold text-foreground"
        data-testid={`input-stat-${field}-${playerId}`}
      />
    );
  }

  return (
    <span
      className="cursor-text text-xs text-muted-foreground hover:text-gold hover:underline decoration-dotted underline-offset-2 select-none"
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      title={`Click to edit ${field}`}
      data-testid={`cell-stat-${field}-${playerId}`}
    >
      {value}
    </span>
  );
}

function AbilitiesToggle({
  abilities,
  position,
  onChange,
}: {
  abilities: string[];
  position: string;
  onChange: (abilities: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const available = ALL_ABILITIES;
  const filtered = search
    ? available.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : available;
  const grouped = {
    gold: filtered.filter(a => a.tier === "gold"),
    blue: filtered.filter(a => a.tier === "blue"),
    red: filtered.filter(a => a.tier === "red"),
  };

  const toggle = (name: string) => {
    onChange(abilities.includes(name) ? abilities.filter(a => a !== name) : [...abilities, name]);
  };

  const tierColor = (tier: string) =>
    tier === "gold" ? "text-yellow-500" : tier === "red" ? "text-red-400" : "text-blue-400";

  return (
    <div className="relative">
      <div
        className="flex items-center gap-1 border border-border rounded px-1.5 py-0.5 cursor-pointer min-h-[24px] bg-background/50 text-[9px] max-w-[180px]"
        onClick={() => setOpen(v => !v)}
        data-testid="abilities-toggle-trigger"
      >
        {abilities.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <span className="text-gold truncate">{abilities.length} ability(ies)</span>
        )}
        <X className="w-2.5 h-2.5 ml-auto text-muted-foreground" />
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-hidden flex flex-col">
          <div className="p-1.5 border-b border-border">
            <input
              className="w-full h-6 text-[10px] px-2 bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              data-testid="abilities-toggle-search"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {(["gold", "blue", "red"] as const).map(tier => {
              const list = grouped[tier];
              if (!list.length) return null;
              return (
                <div key={tier}>
                  <div className={`px-2 py-0.5 text-[8px] font-pixel uppercase sticky top-0 bg-card border-b border-border ${tierColor(tier)}`}>
                    {tier}
                  </div>
                  {list.map(ability => {
                    const selected = abilities.includes(ability.name);
                    return (
                      <div
                        key={ability.name}
                        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[10px] hover:bg-muted/30 ${selected ? "bg-muted/20" : ""}`}
                        onClick={e => { e.stopPropagation(); toggle(ability.name); }}
                        data-testid={`ability-opt-${ability.name.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        <div className={`w-3 h-3 border rounded-sm flex items-center justify-center shrink-0 ${selected ? "bg-gold border-gold" : "border-border"}`}>
                          {selected && <Check className="w-2 h-2 text-background" />}
                        </div>
                        <span className={`${tierColor(tier)} truncate`}>{ability.name}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="p-1 border-t border-border flex justify-end">
            <button
              className="text-[9px] text-gold hover:text-gold/80 px-2 py-0.5"
              onClick={() => setOpen(false)}
              data-testid="abilities-toggle-done"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type EditMap = Record<string, Partial<Player>>;

function RosterEditorTab({ leagueId, auditLogs = [] }: { leagueId: string; auditLogs?: AuditLog[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedConferenceId, setSelectedConferenceId] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [edits, setEdits] = useState<EditMap>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);

  const { data: leagueData } = useQuery<LeagueWithTeams>({
    queryKey: ["/api/leagues", leagueId],
  });

  const { data: rosterData, isLoading: rosterLoading } = useQuery<{ players: Player[]; team: LeagueTeam }>({
    queryKey: ["/api/leagues", leagueId, "roster", selectedTeamId],
    queryFn: () => fetch(`/api/leagues/${leagueId}/roster?teamId=${selectedTeamId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedTeamId,
  });

  const conferences = leagueData?.conferences ?? [];
  const teams = leagueData?.teams ?? [];

  const filteredTeams = selectedConferenceId
    ? teams.filter(t => t.conferenceId === selectedConferenceId)
    : teams;

  const players = rosterData?.players ?? [];

  const getEffectivePlayer = (p: Player): Player => {
    const e = edits[p.id];
    if (!e) return p;
    const merged = { ...p, ...e };
    const newOvr = calculateOVR(merged as Parameters<typeof calculateOVR>[0]);
    return { ...merged, overall: newOvr, starRating: getStarRatingFromOVR(newOvr) };
  };

  const updateField = (playerId: string, field: string, value: unknown) => {
    setEdits(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? {}), [field]: value },
    }));
  };

  const hasEdits = (playerId: string) => !!edits[playerId] && Object.keys(edits[playerId]!).length > 0;

  const discardEdits = (playerId: string) => {
    setEdits(prev => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  };

  const savePlayer = async (p: Player) => {
    const playerEdits = edits[p.id];
    if (!playerEdits || Object.keys(playerEdits).length === 0) return;
    setSavingId(p.id);
    try {
      await apiRequest("PATCH", `/api/leagues/${leagueId}/players/${p.id}`, playerEdits);
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "roster", selectedTeamId] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      discardEdits(p.id);
      toast({ title: "Player Saved", description: `${p.firstName} ${p.lastName} updated.` });
    } catch (err: unknown) {
      toast({ title: "Save Failed", description: parseErrorMessage(err as Error), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const dirtyPlayers = players.filter(p => hasEdits(p.id));
  const dirtyCount = dirtyPlayers.length;

  const saveAllPlayers = async () => {
    if (dirtyCount === 0 || savingAll) return;
    setSavingAll(true);
    setSaveProgress({ done: 0, total: dirtyCount });
    let succeeded = 0;
    let failed = 0;
    for (const p of dirtyPlayers) {
      const playerEdits = edits[p.id];
      if (!playerEdits || Object.keys(playerEdits).length === 0) continue;
      try {
        await apiRequest("PATCH", `/api/leagues/${leagueId}/players/${p.id}`, playerEdits);
        discardEdits(p.id);
        succeeded++;
      } catch {
        failed++;
      }
      setSaveProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
    }
    await qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "roster", selectedTeamId] });
    await qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
    setSavingAll(false);
    setSaveProgress(null);
    if (failed === 0) {
      toast({ title: "All Changes Saved", description: `${succeeded} player${succeeded !== 1 ? "s" : ""} updated successfully.` });
    } else {
      toast({ title: "Partial Save", description: `${succeeded} saved, ${failed} failed.`, variant: "destructive" });
    }
  };

  const POSITIONS = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "OF", "P", "SP", "RP", "CL"];
  const ELIGIBILITIES = ["FR", "SO", "JR", "SR", "RS"];

  return (
    <div className="space-y-4">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-gold" />
            Roster Editor
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Select a team to edit their active roster. Changes write directly to the live players table and are logged to the audit trail and activity feed.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select value={selectedConferenceId} onValueChange={v => { setSelectedConferenceId(v === "__all__" ? "" : v); setSelectedTeamId(""); setEdits({}); }}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-conference">
                <SelectValue placeholder="All Conferences" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Conferences</SelectItem>
                {conferences.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTeamId} onValueChange={v => { setSelectedTeamId(v); setEdits({}); }}>
              <SelectTrigger className="w-full sm:w-64" data-testid="select-team">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {filteredTeams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedTeamId && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Select a team above to edit their roster.
            </div>
          )}

          {selectedTeamId && rosterLoading && (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
            </div>
          )}

          {selectedTeamId && !rosterLoading && players.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No active players found for this team.
            </div>
          )}

          {selectedTeamId && !rosterLoading && players.length > 0 && (
            <>
              {dirtyCount > 0 && (
                <div className="flex items-center justify-between gap-3 mb-3 p-2.5 rounded border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center gap-2 text-xs text-yellow-400">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 shrink-0 animate-pulse" />
                    {savingAll && saveProgress
                      ? `Saving… ${saveProgress.done} / ${saveProgress.total}`
                      : `${dirtyCount} unsaved change${dirtyCount !== 1 ? "s" : ""}`}
                  </div>
                  <RetroButton
                    size="sm"
                    variant="primary"
                    className="h-7 px-3 text-[10px]"
                    onClick={saveAllPlayers}
                    disabled={savingAll}
                    loading={savingAll}
                    data-testid="button-save-all"
                  >
                    <Save className="w-3 h-3 mr-1.5" />
                    Save All Changes
                  </RetroButton>
                </div>
              )}
            <div className="rounded border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 font-pixel text-[8px] text-muted-foreground uppercase min-w-[160px]">Player</th>
                      <th className="px-2 py-2 font-pixel text-[8px] text-muted-foreground uppercase">Pos</th>
                      <th className="px-2 py-2 font-pixel text-[8px] text-muted-foreground uppercase">Elig</th>
                      <th className="px-2 py-2 font-pixel text-[8px] text-muted-foreground uppercase">OVR</th>
                      <th className="px-2 py-2 font-pixel text-[8px] text-muted-foreground uppercase" colSpan={3}>Primary Attrs</th>
                      <th className="px-2 py-2 font-pixel text-[8px] text-muted-foreground uppercase min-w-[120px]">Abilities</th>
                      <th className="px-2 py-2 font-pixel text-[8px] text-muted-foreground uppercase min-w-[80px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {players.map(p => {
                      const ep = getEffectivePlayer(p);
                      const dirty = hasEdits(p.id);
                      const isPit = getIsPitcherPos(ep.position);
                      const expanded = expandedId === p.id;

                      const primaryAttrs = isPit
                        ? [
                            { field: "velocity", label: "VEL", value: ep.velocity ?? 50 },
                            { field: "control", label: "CTL", value: ep.control ?? 50 },
                            { field: "stamina", label: "STM", value: ep.stamina ?? 50 },
                          ]
                        : [
                            { field: "hitForAvg", label: "CON", value: ep.hitForAvg ?? 50 },
                            { field: "power", label: "PWR", value: ep.power ?? 50 },
                            { field: "speed", label: "SPD", value: ep.speed ?? 50 },
                          ];

                      return (
                        <>
                          <tr
                            key={p.id}
                            className={`transition-colors hover:bg-muted/10 cursor-pointer ${dirty ? "bg-yellow-500/5" : ""}`}
                            onClick={() => setExpandedId(expanded ? null : p.id)}
                            data-testid={`row-player-${p.id}`}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {dirty && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />}
                                <span className="font-medium text-foreground truncate">{p.firstName} {p.lastName}</span>
                              </div>
                              <StarBadge stars={ep.starRating} />
                            </td>
                            <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                              <Select
                                value={ep.position}
                                onValueChange={v => updateField(p.id, "position", v)}
                              >
                                <SelectTrigger className="h-6 text-[10px] px-1 w-14" data-testid={`select-pos-${p.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {POSITIONS.map(pos => (
                                    <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                              <Select
                                value={ep.eligibility}
                                onValueChange={v => updateField(p.id, "eligibility", v)}
                              >
                                <SelectTrigger className="h-6 text-[10px] px-1 w-14" data-testid={`select-elig-${p.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ELIGIBILITIES.map(e => (
                                    <SelectItem key={e} value={e}>{e}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <span className={`font-bold ${ovrColor(ep.overall)}`} data-testid={`text-ovr-${p.id}`}>{ep.overall}</span>
                            </td>
                            {primaryAttrs.map(attr => {
                              const grade = isPit ? pitcherCommonGrade(attr.value) : commonGrade(attr.value);
                              const gradeColor =
                                grade === "S" ? "text-yellow-400" :
                                grade === "A" ? "text-green-400" :
                                grade === "B" ? "text-teal-400" :
                                grade === "C" ? "text-yellow-500" :
                                grade === "D" ? "text-orange-400" :
                                grade === "E" ? "text-green-500" :
                                "text-red-400";
                              return (
                                <td key={attr.field} className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-0.5">
                                    <InlineStatCell
                                      value={attr.value}
                                      field={attr.field}
                                      playerId={p.id}
                                      onUpdate={(f, v) => updateField(p.id, f, v)}
                                    />
                                    <span className={`text-[9px] font-bold ${gradeColor}`} data-testid={`grade-primary-${attr.field}-${p.id}`}>{grade}</span>
                                  </div>
                                  <p className="text-[8px] text-muted-foreground">{attr.label}</p>
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex flex-wrap gap-0.5 max-w-[160px]">
                                {(ep.abilities ?? []).slice(0, 3).map(ab => (
                                  <AbilityPill key={ab} name={ab} />
                                ))}
                                {(ep.abilities ?? []).length > 3 && (
                                  <span className="text-[8px] text-muted-foreground">+{(ep.abilities ?? []).length - 3}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {dirty && (
                                  <>
                                    <RetroButton
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-1.5 text-[9px]"
                                      onClick={() => discardEdits(p.id)}
                                      disabled={savingAll}
                                      data-testid={`button-discard-${p.id}`}
                                    >
                                      <RotateCcw className="w-2.5 h-2.5" />
                                    </RetroButton>
                                    <RetroButton
                                      size="sm"
                                      variant="primary"
                                      className="h-6 px-2 text-[9px]"
                                      onClick={() => savePlayer(p)}
                                      disabled={savingAll || savingId === p.id}
                                      loading={savingId === p.id}
                                      data-testid={`button-save-${p.id}`}
                                    >
                                      <Save className="w-2.5 h-2.5 mr-1" />
                                      Save
                                    </RetroButton>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {expanded && (
                            <tr key={`${p.id}-expanded`} className={`${dirty ? "bg-yellow-500/5" : "bg-muted/10"}`}>
                              <td colSpan={9} className="px-3 py-3">
                                <div className="space-y-3">
                                  {isPit ? (
                                    <div>
                                      <p className="font-pixel text-[8px] text-gold uppercase mb-1.5">Pitcher Attributes</p>
                                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                                        {[
                                          { field: "velocity", label: "Velocity" },
                                          { field: "control", label: "Control" },
                                          { field: "stamina", label: "Stamina" },
                                          { field: "stuff", label: "Stuff" },
                                          { field: "wRISP", label: "W/RISP" },
                                          { field: "vsLefty", label: "vs Lefty" },
                                          { field: "poise", label: "Poise" },
                                          { field: "grit", label: "Grit" },
                                          { field: "heater", label: "Heater" },
                                          { field: "agile", label: "Agile" },
                                          { field: "recovery", label: "Recovery" },
                                        ].map(attr => {
                                          const rawVal = (ep as Record<string, number | null>)[attr.field] as number ?? 50;
                                          const grade = pitcherCommonGrade(rawVal);
                                          const gradeColor =
                                            grade === "S" ? "text-yellow-400" :
                                            grade === "A" ? "text-green-400" :
                                            grade === "B" ? "text-teal-400" :
                                            grade === "C" ? "text-yellow-500" :
                                            grade === "D" ? "text-orange-400" :
                                            grade === "E" ? "text-green-500" :
                                            "text-red-400";
                                          return (
                                            <div key={attr.field} className="text-center">
                                              <div className="flex items-center justify-center gap-0.5">
                                                <InlineStatCell
                                                  value={rawVal}
                                                  field={attr.field}
                                                  playerId={p.id}
                                                  onUpdate={(f, v) => updateField(p.id, f, v)}
                                                />
                                                <span className={`text-[9px] font-bold ${gradeColor}`} data-testid={`grade-${attr.field}-${p.id}`}>{grade}</span>
                                              </div>
                                              <p className="text-[8px] text-muted-foreground mt-0.5">{attr.label}</p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <p className="font-pixel text-[8px] text-gold uppercase mb-1.5">Fielder Attributes</p>
                                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                                        {[
                                          { field: "hitForAvg", label: "Contact" },
                                          { field: "power", label: "Power" },
                                          { field: "speed", label: "Speed" },
                                          { field: "arm", label: "Arm" },
                                          { field: "fielding", label: "Fielding" },
                                          { field: "errorResistance", label: "Error Res" },
                                          { field: "clutch", label: "Clutch" },
                                          { field: "vsLHP", label: "vs LHP" },
                                          { field: "grit", label: "Grit" },
                                          { field: "stealing", label: "Stealing" },
                                          { field: "running", label: "Running" },
                                          { field: "throwing", label: "Throwing" },
                                          { field: "recovery", label: "Recovery" },
                                        ].map(attr => {
                                          const rawVal = (ep as Record<string, number | null>)[attr.field] as number ?? 50;
                                          const grade = commonGrade(rawVal);
                                          const gradeColor =
                                            grade === "S" ? "text-yellow-400" :
                                            grade === "A" ? "text-green-400" :
                                            grade === "B" ? "text-teal-400" :
                                            grade === "C" ? "text-yellow-500" :
                                            grade === "D" ? "text-orange-400" :
                                            grade === "E" ? "text-green-500" :
                                            "text-red-400";
                                          return (
                                            <div key={attr.field} className="text-center">
                                              <div className="flex items-center justify-center gap-0.5">
                                                <InlineStatCell
                                                  value={rawVal}
                                                  field={attr.field}
                                                  playerId={p.id}
                                                  onUpdate={(f, v) => updateField(p.id, f, v)}
                                                />
                                                <span className={`text-[9px] font-bold ${gradeColor}`} data-testid={`grade-${attr.field}-${p.id}`}>{grade}</span>
                                              </div>
                                              <p className="text-[8px] text-muted-foreground mt-0.5">{attr.label}</p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <div>
                                    <p className="font-pixel text-[8px] text-gold uppercase mb-1.5">Special Abilities</p>
                                    <AbilitiesToggle
                                      abilities={ep.abilities ?? []}
                                      position={ep.position}
                                      onChange={v => updateField(p.id, "abilities", v)}
                                    />
                                    {(ep.abilities ?? []).length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {(ep.abilities ?? []).map(ab => (
                                          <AbilityPill key={ab} name={ab} />
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {(() => {
                                    const playerFullName = `${p.firstName} ${p.lastName}`;
                                    const playerHistory = auditLogs.filter(
                                      l => l.action === "Roster Edit" && l.details?.includes(playerFullName)
                                    );
                                    const histOpen = historyOpenId === p.id;
                                    return (
                                      <div className="border-t border-border/30 pt-2">
                                        <button
                                          className="flex items-center gap-1.5 w-full text-left group"
                                          onClick={() => setHistoryOpenId(histOpen ? null : p.id)}
                                          data-testid={`button-history-toggle-${p.id}`}
                                        >
                                          <History className="w-3 h-3 text-muted-foreground" />
                                          <span className="font-pixel text-[8px] text-muted-foreground uppercase group-hover:text-foreground transition-colors">
                                            Edit History
                                          </span>
                                          {playerHistory.length > 0 && (
                                            <span className="text-[8px] bg-muted/50 text-muted-foreground rounded px-1 ml-0.5">
                                              {playerHistory.length}
                                            </span>
                                          )}
                                          {histOpen
                                            ? <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />
                                            : <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
                                          }
                                        </button>

                                        {histOpen && (
                                          <div className="mt-2 space-y-1.5" data-testid={`history-panel-${p.id}`}>
                                            {playerHistory.length === 0 ? (
                                              <p className="text-[10px] text-muted-foreground italic pl-1">No edits recorded yet.</p>
                                            ) : (
                                              playerHistory.map(log => {
                                                const detailMatch = log.details?.match(/:\s*(.+)$/);
                                                const changes = detailMatch ? detailMatch[1] : log.details ?? "";
                                                return (
                                                  <div
                                                    key={log.id}
                                                    className="bg-muted/20 rounded px-2 py-1.5 text-[10px]"
                                                    data-testid={`history-entry-${log.id}`}
                                                  >
                                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                                      <span className="text-muted-foreground">
                                                        {new Date(log.timestamp).toLocaleString(undefined, {
                                                          month: "short",
                                                          day: "numeric",
                                                          year: "numeric",
                                                          hour: "numeric",
                                                          minute: "2-digit",
                                                        })}
                                                      </span>
                                                      <span className="text-[8px] font-pixel text-gold/70 uppercase">Commissioner</span>
                                                    </div>
                                                    <p className="text-foreground/80 break-words">{changes}</p>
                                                  </div>
                                                );
                                              })
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {dirty && (
                                    <div className="flex justify-end gap-2 pt-1 border-t border-border/30">
                                      <RetroButton
                                        size="sm"
                                        variant="outline"
                                        onClick={() => discardEdits(p.id)}
                                        disabled={savingAll}
                                        data-testid={`button-discard-expanded-${p.id}`}
                                      >
                                        <RotateCcw className="w-3 h-3 mr-1" /> Discard
                                      </RetroButton>
                                      <RetroButton
                                        size="sm"
                                        variant="primary"
                                        onClick={() => savePlayer(p)}
                                        disabled={savingAll || savingId === p.id}
                                        loading={savingId === p.id}
                                        data-testid={`button-save-expanded-${p.id}`}
                                      >
                                        <Save className="w-3 h-3 mr-1" /> Save Changes
                                      </RetroButton>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </RetroCardContent>
      </RetroCard>
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
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
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
