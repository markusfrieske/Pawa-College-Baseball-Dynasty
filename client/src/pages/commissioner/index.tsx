import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  Clock,
  Play,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RetroCard } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimProgressOverlay } from "@/components/sim-progress-overlay";
import { SeasonSummaryModal } from "@/components/season-summary-modal";
import { InningScoreboard, useScoreboardEnabled, type InningScoreboardData } from "@/components/inning-scoreboard";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import { ReadyStatusSection } from "./components/ReadyStatusSection";
import { useCommissionerSimActions } from "./hooks/useCommissionerSimActions";
import { ActionsTab } from "./tabs/ActionsTab";
import { CommandCenterTab } from "./tabs/CommandCenterTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { AuditLogTab } from "./tabs/AuditLogTab";
import { InvitesTab } from "./tabs/InvitesTab";
import { GameReportsTab } from "./tabs/GameReportsTab";
import { NilOverviewTab } from "./tabs/NilOverviewTab";
import { LeagueEditorTab } from "./tabs/LeagueEditorTab";
import { SaveStatesTab } from "./tabs/SaveStatesTab";
import { ScheduleHealthTab } from "./tabs/ScheduleHealthTab";
import { phaseLabels } from "./helpers/phaseHelpers";
import type { League, AuditLog, LeagueInvite } from "@shared/schema";
import type { HumanCoach } from "./types";
import { ArtworkBackground } from "@/components/artwork-background";
import { artBackgrounds } from "@/lib/art-assets";

interface CommissionerData {
  league: League;
  auditLogs: AuditLog[];
  readyCoaches: string[];
  totalCoaches: number;
  invites: LeagueInvite[];
  humanCoaches: HumanCoach[];
  oversizedTeams: string[];
}

function CommissionerSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <div className="w-5 h-5 bg-muted/30 rounded animate-pulse" />
            <div className="h-6 w-32 bg-muted/30 rounded animate-pulse" />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-card border border-border rounded animate-pulse" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    </div>
  );
}

export default function CommissionerPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [autoAdvance, setAutoAdvance] = useState(() => {
    return localStorage.getItem(`auto-advance-${id}`) === "true";
  });
  const [showSeasonSummary, setShowSeasonSummary] = useState(false);
  const [summaryCompletedSeason, setSummaryCompletedSeason] = useState(1);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [scoreboardData, setScoreboardData] = useState<InningScoreboardData | null>(null);
  const scoreboardEnabled = useScoreboardEnabled();
  const [activeTab, setActiveTab] = useState("command-center");
  const [classSelectionOpen, setClassSelectionOpen] = useState(false);
  const [classSelectionOptions, setClassSelectionOptions] = useState<
    Array<{ id: string; name: string; recruitCount: number }>
  >([]);
  const [selectedClassForAdvance, setSelectedClassForAdvance] = useState<string>("auto");
  const [pendingAdvanceSeason, setPendingAdvanceSeason] = useState<number | null>(null);

  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("showSummary") === "1") {
      const seasonParam = params.get("season");
      const s = seasonParam ? parseInt(seasonParam) : 1;
      setSummaryCompletedSeason(s);
      setShowSeasonSummary(true);
    }
  }, [search]);

  const toggleAutoAdvance = (val: boolean) => {
    setAutoAdvance(val);
    localStorage.setItem(`auto-advance-${id}`, val ? "true" : "false");
  };

  const simActions = useCommissionerSimActions({
    leagueId: id!,
    onSeasonComplete: (season) => {
      setSummaryCompletedSeason(season);
      setShowSeasonSummary(true);
    },
    onShowScoreboard: scoreboardEnabled
      ? (data) => {
          setScoreboardData(data);
          setShowScoreboard(true);
        }
      : undefined,
  });

  const { data, isLoading, isError, error } = useQuery<CommissionerData>({
    queryKey: ["/api/leagues", id, "commissioner"],
    retry: false,
  });

  const isPreseason = data?.league?.currentPhase === "preseason";
  const { data: scheduleHealth } = useQuery<{
    warnings: Array<{ severity: string; code: string; message: string }>;
    summary: { hasErrors: boolean; hasWarnings: boolean };
  }>({
    queryKey: ["/api/leagues", id, "schedule", "health"],
    queryFn: () =>
      fetch(`/api/leagues/${id}/schedule/health`).then((r) => {
        if (!r.ok) return null;
        return r.json();
      }),
    enabled: isPreseason,
    staleTime: 60_000,
  });
  const isForbidden =
    isError && error instanceof Error && error.message.startsWith("403");

  const advanceWeekMutation = useMutation({
    mutationFn: async (opts?: { savedRecruitingClassId?: string }) => {
      const res = await apiRequest("POST", `/api/leagues/${id}/advance`, opts ?? {});
      return res.json();
    },
    onSuccess: (response: any) => {
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
        const champSeason = response?.currentSeason ?? 1;
        navigate(`/league/${id}/championship/${champSeason}`);
        return;
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

        const isFullSeason = data?.league?.dynastyPreset === "full_season";
        if (isFullSeason && phase) {
          const phaseRedirects: Record<string, string> = {
            offseason_recruiting_1: `/league/${id}/recruiting`,
            offseason_recruiting_2: `/league/${id}/recruiting`,
            offseason_recruiting_3: `/league/${id}/recruiting`,
            offseason_recruiting_4: `/league/${id}/recruiting`,
            conference_championship: `/league/${id}/postseason`,
            super_regionals: `/league/${id}/postseason`,
            cws: `/league/${id}/postseason`,
            offseason_signing_day: `/league/${id}/commits`,
            offseason_walkons: `/league/${id}/walkons`,
          };
          const redirect = phaseRedirects[phase];
          if (redirect) {
            navigate(redirect);
            return;
          }
        }

        const autoAdvanceEnabled = localStorage.getItem(`auto-advance-${id}`) === "true";
        const autoAdvancePhases = ["regular_season", "preseason", "spring_training"];
        if (
          autoAdvanceEnabled &&
          phase &&
          autoAdvancePhases.includes(phase) &&
          !advanceWeekMutation.isPending
        ) {
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
      toast({
        title: enabled
          ? "Ready names visible to all coaches"
          : "Ready names hidden from coaches",
      });
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

  const toggleGameModeMutation = useMutation({
    mutationFn: async (gameMode: "simulated" | "reported") => {
      return apiRequest("PATCH", `/api/leagues/${id}/settings`, { gameMode });
    },
    onSuccess: (_r, gameMode) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      toast({
        title: gameMode === "reported" ? "Reported Mode Enabled" : "Simulated Mode Enabled",
        description:
          gameMode === "reported"
            ? "Games will no longer auto-simulate. Coaches will upload screenshots for OCR box score import."
            : "Games will auto-simulate as usual.",
      });
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
      const RECRUITING_PHASES = [
        "offseason_recruiting_1",
        "offseason_recruiting_2",
        "offseason_recruiting_3",
        "offseason_recruiting_4",
      ];
      const duringRecruiting = RECRUITING_PHASES.includes(data?.league?.currentPhase || "");
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
  const isPrimaryCommissioner =
    !!currentUser && currentUser.id === data?.league?.commissionerId;

  const delegateMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: "add" | "remove" }) => {
      return apiRequest("PATCH", `/api/leagues/${id}/co-commissioners`, { userId, action });
    },
    onSuccess: (_response, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      toast({
        title: vars.action === "add" ? "Delegate Added" : "Delegate Removed",
        description:
          vars.action === "add"
            ? "Coach can now perform commissioner actions."
            : "Co-commissioner access has been revoked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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
        description: `${data.count > 0 ? `Imported ${data.count} recruits` : "Generated new recruiting class"} successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  if (isLoading) {
    return <CommissionerSkeleton />;
  }

  if (isForbidden) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Link
                href={`/league/${id}`}
                className="text-muted-foreground hover:text-gold transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-gold text-lg">Commissioner</h1>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-2xl">
          <div
            className="mb-4 p-3 rounded border border-border bg-card/50 text-xs text-muted-foreground"
            data-testid="text-commissioner-restricted"
          >
            Only the commissioner can access commissioner tools (nudge, force advance, deadline
            settings). Here's the shared status everyone can see.
          </div>
          <ReadyStatusSection leagueId={id!} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/league/${id}`}
              className="text-muted-foreground hover:text-gold transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-gold text-lg">Commissioner</h1>
          </div>
        </div>
      </header>

      <ArtworkBackground
        desktopSrc={artBackgrounds.commissioner.desktop}
        mobileSrc={artBackgrounds.commissioner.mobile}
        focalPoint="center center"
        overlayStrength="heavy"
        className="h-32 sm:h-44"
      />

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
                <p className="text-lg font-bold">
                  {phaseLabels[data?.league.currentPhase || "preseason"]}
                </p>
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
          <div
            className="mb-4 p-3 rounded border border-red-500/50 bg-red-900/20 flex items-start gap-3"
            data-testid="banner-roster-oversize"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1">ROSTER OVERSIZE DETECTED</p>
              <p className="text-xs text-muted-foreground">
                The following teams have more than 35 players — this indicates duplicate players may
                have been created during the last season transition:{" "}
                {data.oversizedTeams.join(", ")}. Use the{" "}
                <span className="text-gold">Dedup Rosters</span> tool in the Actions tab to clean
                up.
              </p>
            </div>
          </div>
        )}

        {isPreseason && scheduleHealth?.summary?.hasErrors && (
          <div
            className="mb-4 p-3 rounded border border-red-500/50 bg-red-900/20 flex items-start gap-3"
            data-testid="banner-schedule-health-error"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1">SCHEDULE ISSUES DETECTED</p>
              <p className="text-xs text-muted-foreground">
                The generated schedule has critical issues (e.g. overloaded weeks). Review the{" "}
                <span className="text-gold">Schedule Health</span> tab before starting the season.
                You can regenerate the schedule from the Actions tab.
              </p>
            </div>
          </div>
        )}

        {isPreseason && !scheduleHealth?.summary?.hasErrors && scheduleHealth?.summary?.hasWarnings && (
          <div
            className="mb-4 p-3 rounded border border-yellow-500/40 bg-yellow-900/20 flex items-start gap-3"
            data-testid="banner-schedule-health-warning"
          >
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-yellow-400 mb-1">SCHEDULE WARNINGS</p>
              <p className="text-xs text-muted-foreground">
                The schedule has minor balance warnings. Check the{" "}
                <span className="text-gold">Schedule Health</span> tab for details before starting
                the season.
              </p>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
            <TabsList className="bg-card border border-border inline-flex w-auto">
              <TabsTrigger
                value="command-center"
                className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
                data-testid="tab-command-center"
              >
                Command
              </TabsTrigger>
              <TabsTrigger
                value="actions"
                className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
              >
                Actions
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
              >
                Settings
              </TabsTrigger>
              <TabsTrigger
                value="audit"
                className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
              >
                Audit Log
              </TabsTrigger>
              <TabsTrigger
                value="invites"
                className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
              >
                Invites
              </TabsTrigger>
              {data?.league?.dynastyPreset !== "full_season" && (
                <TabsTrigger
                  value="reports"
                  className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
                >
                  Reports
                </TabsTrigger>
              )}
              <TabsTrigger
                value="nil"
                className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
                data-testid="tab-nil"
              >
                NIL
              </TabsTrigger>
              <TabsTrigger
                value="schedule-health"
                className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
                data-testid="tab-schedule-health"
              >
                Schedule
              </TabsTrigger>
              <TabsTrigger
                value="league-editor"
                className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
                data-testid="tab-league-editor"
              >
                League Editor
              </TabsTrigger>
              {isPrimaryCommissioner && (
                <TabsTrigger
                  value="save-states"
                  className="text-xs font-semibold whitespace-nowrap data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
                  data-testid="tab-save-states"
                >
                  Save States
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="command-center">
            {data && (
              <CommandCenterTab
                leagueId={id!}
                league={data.league}
                readyCoaches={data.readyCoaches}
                totalCoaches={data.totalCoaches}
                humanCoaches={data.humanCoaches}
                auditLogs={data.auditLogs}
                onSwitchTab={setActiveTab}
              />
            )}
          </TabsContent>

          <TabsContent value="actions">
            <ActionsTab
              leagueId={id!}
              onSwitchToCommandCenter={() => setActiveTab("command-center")}
              league={data?.league}
              onAdvanceWeek={() => advanceWeekMutation.mutate(undefined)}
              isAdvancing={advanceWeekMutation.isPending}
              onAdvanceSeason={() => advanceSeasonMutation.mutate()}
              isAdvancingSeason={advanceSeasonMutation.isPending}
              onImportRecruiting={(csvData?: string) => importRecruitingMutation.mutate(csvData)}
              isImporting={importRecruitingMutation.isPending}
              onSimulateWeek={simActions.simulateWeek}
              isSimulating={simActions.isSimulating}
              onSimToOffseason={simActions.simToOffseason}
              isSimToOffseason={simActions.isSimToOffseason}
              onSimToSigningDay={simActions.simToSigningDay}
              isSimToSigningDay={simActions.isSimToSigningDay}
              onSimToPostseason={simActions.simToPostseason}
              isSimToPostseason={simActions.isSimToPostseason}
              onSimToCws={simActions.simToCws}
              isSimToCws={simActions.isSimToCws}
              onSimFullSeason={simActions.simFullSeason}
              isSimFullSeason={simActions.isSimFullSeason}
              onBackfillScores={simActions.backfillScores}
              isBackfilling={simActions.isBackfilling}
              onDedupRosters={simActions.dedupRosters}
              isDedupingRosters={simActions.isDedupingRosters}
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
              onChangeGameMode={(gameMode) => toggleGameModeMutation.mutate(gameMode)}
            />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogTab logs={data?.auditLogs || []} />
          </TabsContent>

          <TabsContent value="invites">
            <InvitesTab leagueId={id!} invites={data?.invites || []} />
          </TabsContent>

          {data?.league?.dynastyPreset !== "full_season" && (
            <TabsContent value="reports">
              <GameReportsTab leagueId={id!} />
            </TabsContent>
          )}

          <TabsContent value="nil">
            <NilOverviewTab leagueId={id!} />
          </TabsContent>

          <TabsContent value="schedule-health">
            <ScheduleHealthTab leagueId={id!} />
          </TabsContent>

          <TabsContent value="league-editor">
            <LeagueEditorTab leagueId={id!} isPrimaryCommissioner={isPrimaryCommissioner} />
          </TabsContent>

          {isPrimaryCommissioner && (
            <TabsContent value="save-states">
              <SaveStatesTab leagueId={id!} />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <SimProgressOverlay
        open={simActions.showSimOverlay}
        onClose={simActions.handleSimOverlayClosed}
        simSummary={simActions.simSummary}
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
        onClose={() => {
          setShowScoreboard(false);
          setScoreboardData(null);
        }}
        data={scoreboardData}
      />

      <Dialog
        open={classSelectionOpen}
        onOpenChange={(open) => {
          if (!open) setClassSelectionOpen(false);
        }}
      >
        <DialogContent
          className="bg-card border-border max-w-md"
          data-testid="dialog-class-selection"
        >
          <DialogHeader>
            <DialogTitle className="text-gold text-sm">
              Choose Recruiting Class
            </DialogTitle>
            <DialogDescription>
              Season {pendingAdvanceSeason} is ending. Select a saved recruiting class for Season{" "}
              {(pendingAdvanceSeason ?? 0) + 1}, or let the game auto-generate one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Select
              value={selectedClassForAdvance}
              onValueChange={setSelectedClassForAdvance}
            >
              <SelectTrigger className="w-full" data-testid="select-class-for-advance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-Generate Fresh Class</SelectItem>
                {classSelectionOptions.map((cls) => (
                  <SelectItem key={cls.id} value={String(cls.id)}>
                    {cls.name} ({cls.recruitCount} recruits)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedClassForAdvance !== "auto" && (
              <p className="text-xs text-muted-foreground">
                The selected saved class will replace the auto-generated recruit pool for the
                upcoming season.
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
                  advanceWeekMutation.mutate({
                    savedRecruitingClassId: selectedClassForAdvance,
                  });
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
