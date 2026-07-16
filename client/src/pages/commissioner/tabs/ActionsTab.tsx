import { useState, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  FastForward,
  FileSpreadsheet,
  GraduationCap,
  Megaphone,
  Play,
  Swords,
  Target,
  Timer,
  Trophy,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AdvanceProgressBar } from "@/components/advance-progress-bar";
import { RecruitingWizard } from "@/components/recruiting-wizard";
import { useToast } from "@/hooks/use-toast";
import { ActionButton } from "../components/ActionButton";
import { ReadyStatusSection } from "../components/ReadyStatusSection";
import { PostseasonBracket } from "../components/PostseasonBracket";
import { PhaseDeadlineControl } from "../components/PhaseDeadlineControl";
import type { League } from "@shared/schema";

interface PreflightResult {
  canAdvance: boolean;
  checks: Array<{ id: string; status: string; count: number }>;
}

interface ActionsTabProps {
  leagueId?: string;
  onSwitchToCommandCenter?: () => void;
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
}

export function ActionsTab({
  leagueId,
  onSwitchToCommandCenter,
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
}: ActionsTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const preflight = leagueId
    ? qc.getQueryData<PreflightResult>(["/api/leagues", leagueId, "commissioner", "preflight"])
    : undefined;
  const preflightFail = preflight && !preflight.canAdvance
    ? preflight.checks.filter(c => c.status === "fail").length
    : 0;
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showEditTeamsDialog, setShowEditTeamsDialog] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");

  const broadcastMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/leagues/${league?.id}/messages/broadcast`, {
        category: "commissioner",
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
      }),
    onSuccess: () => {
      toast({ title: "Broadcast sent", description: "All coaches received your message." });
      setBroadcastTitle("");
      setBroadcastBody("");
      setShowBroadcast(false);
      if (league?.id) qc.invalidateQueries({ queryKey: ["/api/leagues", league.id, "messages"] });
    },
    onError: () => toast({ title: "Broadcast failed", description: "Could not send message.", variant: "destructive" }),
  });
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

  const isPostseason = ["conference_championship", "super_regionals", "cws"].includes(
    league?.currentPhase || "",
  );
  const offseasonPhaseList = [
    "offseason",
    "offseason_departures",
    "offseason_recruiting_1",
    "offseason_recruiting_2",
    "offseason_recruiting_3",
    "offseason_recruiting_4",
    "offseason_signing_day",
    "offseason_walkons",
  ];
  const isOffseason = offseasonPhaseList.includes(league?.currentPhase || "");
  const anySim =
    isAdvancing ||
    isAdvancingSeason ||
    isSimToOffseason ||
    isSimToSigningDay ||
    isSimToPostseason ||
    isSimToCws ||
    isSimFullSeason;

  const advanceLabel = (() => {
    if (isAdvancing) return "Processing...";
    switch (league?.currentPhase) {
      case "conference_championship":
        return "Play Conference Championships";
      case "super_regionals":
        return "Play Super Regional Round";
      case "cws":
        return "Play CWS Game";
      case "offseason_departures":
        return "Process Player Departures";
      case "offseason_recruiting_1":
        return "Advance Recruiting (Week 1)";
      case "offseason_recruiting_2":
        return "Advance Recruiting (Week 2)";
      case "offseason_recruiting_3":
        return "Advance Recruiting (Week 3)";
      case "offseason_recruiting_4":
        return "Advance Recruiting (Week 4)";
      case "offseason_signing_day":
        return "Advance to Cuts & Walk-Ons";
      case "offseason_walkons":
        return "Finalize Walk-Ons - Start New Season";
      case "offseason":
        return "Begin Offseason";
      default:
        return "Advance Week";
    }
  })();

  const advanceDescription = (() => {
    switch (league?.currentPhase) {
      case "conference_championship":
        return "Simulate conference championship matchups between top teams.";
      case "super_regionals":
        return "Simulate the next round of the Super Regional bracket tournament.";
      case "cws":
        return "Play the next game of the College World Series best-of-3 championship.";
      case "offseason_departures":
        return "All coaches must submit their departures before advancing. Once all coaches are ready, advancing will process graduates, draft declarations, and transfer portal entries.";
      case "offseason_recruiting_1":
      case "offseason_recruiting_2":
      case "offseason_recruiting_3":
      case "offseason_recruiting_4":
        return "Continue recruiting unsigned recruits and transfer portal players. CPU teams are also actively recruiting during this period.";
      case "offseason_signing_day":
        return "Decision Day! Finalize all commits, add signed recruits to rosters, and advance eligibility. Teams will then manage roster cuts and walk-on signings.";
      case "offseason_walkons":
        return "All teams must finalize their roster cuts and walk-on signings before advancing. Once all teams are ready, rosters will be locked and the new season begins.";
      case "offseason":
        return "Begin the offseason process. Players will be leaving, recruiting continues, and a new season awaits.";
      default:
        return "Move the league forward to the next week. This will process recruiting updates, trigger story events, and update standings.";
    }
  })();

  const advanceIcon = (() => {
    switch (league?.currentPhase) {
      case "conference_championship":
        return <Swords className="w-4 h-4 mr-2" />;
      case "super_regionals":
        return <Swords className="w-4 h-4 mr-2" />;
      case "cws":
        return <Trophy className="w-4 h-4 mr-2" />;
      case "offseason_departures":
        return <UserMinus className="w-4 h-4 mr-2" />;
      case "offseason_recruiting_1":
      case "offseason_recruiting_2":
      case "offseason_recruiting_3":
      case "offseason_recruiting_4":
        return <Target className="w-4 h-4 mr-2" />;
      case "offseason_signing_day":
        return <GraduationCap className="w-4 h-4 mr-2" />;
      case "offseason_walkons":
        return <UserPlus className="w-4 h-4 mr-2" />;
      case "offseason":
        return <GraduationCap className="w-4 h-4 mr-2" />;
      default:
        return <Play className="w-4 h-4 mr-2" />;
    }
  })();

  return (
    <div className="space-y-6">
      <ReadyStatusSection
        leagueId={league?.id || ""}
        commissionerUserId={league?.commissionerId}
        coCommissionerIds={
          Array.isArray(league?.coCommissionerIds)
            ? (league!.coCommissionerIds as string[])
            : []
        }
        onAdvanceWeek={onAdvanceWeek}
        isAdvancing={isAdvancing}
      />

      {isPostseason && (
        <PostseasonBracket
          leagueId={league?.id || ""}
          phase={league?.currentPhase || ""}
          dynastyPreset={league?.dynastyPreset ?? undefined}
        />
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <RetroCard>
          <RetroCardHeader>
            {isPostseason ? "Postseason" : isOffseason ? "Offseason" : "Advance Week"}
          </RetroCardHeader>
          <RetroCardContent>
            <p className="text-muted-foreground mb-4">{advanceDescription}</p>
            {league?.phaseDeadline && new Date(league.phaseDeadline) <= new Date() && (
              <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/40 text-red-400 text-xs flex items-center gap-2">
                <Timer className="w-3.5 h-3.5 shrink-0" />
                Deadline passed — non-ready coaches will be auto-marked ready when you advance.
              </div>
            )}
            {preflight === undefined ? (
              <button
                onClick={onSwitchToCommandCenter}
                className="w-full mb-3 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-muted/40 bg-muted/10 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="badge-preflight-not-run"
              >
                Preflight not run — click to check
              </button>
            ) : preflight.canAdvance ? (
              <div className="mb-3 flex items-center gap-1.5 px-3 py-1.5 rounded border border-green-500/40 bg-green-500/10 text-xs text-green-400" data-testid="badge-preflight-clear">
                Preflight: All clear
              </div>
            ) : (
              <button
                onClick={onSwitchToCommandCenter}
                className="w-full mb-3 flex items-center gap-1.5 px-3 py-1.5 rounded border border-orange-500/50 bg-orange-500/10 text-xs text-orange-400 hover:bg-orange-500/20 transition-colors"
                data-testid="badge-preflight-blockers"
              >
                Preflight: {preflightFail} blocker(s) — click to review
              </button>
            )}
            <RetroButton
              variant="shimmer"
              onClick={() => onAdvanceWeek()}
              disabled={anySim || (!!preflight && !preflight.canAdvance)}
              className="w-full"
              data-testid="button-advance-week"
              title={preflight && !preflight.canAdvance ? `${preflightFail} preflight blocker(s) must be resolved before advancing` : undefined}
            >
              {advanceIcon}
              {advanceLabel}
            </RetroButton>

            <AdvanceProgressBar leagueId={league?.id || ""} isAdvancing={isAdvancing} />

            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-gold uppercase mb-3">Quick Sim</p>
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
                          <AlertDialogTitle className="text-gold text-sm">
                            Sim to Postseason?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will simulate the entire regular season. You won't be able to play
                            individual weeks or make mid-season changes. This action cannot be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onSimToPostseason}
                            className="bg-gold text-forest-dark"
                            data-testid="button-confirm-sim-postseason"
                          >
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
                          <AlertDialogTitle className="text-gold text-sm">
                            Sim to College World Series?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will simulate through to the College World Series. All remaining
                            games will be auto-played. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onSimToCws}
                            className="bg-gold text-forest-dark"
                            data-testid="button-confirm-sim-cws"
                          >
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
                          <AlertDialogTitle className="text-gold text-sm">
                            Sim to Offseason?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will simulate the entire remaining season including postseason. All
                            games will be auto-played. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onSimToOffseason}
                            className="bg-gold text-forest-dark"
                            data-testid="button-confirm-sim-offseason"
                          >
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
                            <AlertDialogTitle className="text-gold text-sm">
                              Sim to College World Series?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will simulate through to the College World Series. All remaining
                              games will be auto-played. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-background border-border">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={onSimToCws}
                              className="bg-gold text-forest-dark"
                              data-testid="button-confirm-sim-cws"
                            >
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
                          <AlertDialogTitle className="text-gold text-sm">
                            Sim to Offseason?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will simulate the entire remaining season including postseason. All
                            games will be auto-played. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onSimToOffseason}
                            className="bg-gold text-forest-dark"
                            data-testid="button-confirm-sim-offseason"
                          >
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
                        <AlertDialogTitle className="text-gold text-sm">
                          Sim to Next Season?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will simulate the entire offseason including recruiting, decision day,
                          and walk-ons. Your recruiting actions won't be applied. This action cannot
                          be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-background border-border">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={onSimToSigningDay}
                          className="bg-gold text-forest-dark"
                          data-testid="button-confirm-sim-next-season"
                        >
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

              {[
                "preseason",
                "spring_training",
                "regular_season",
                "conference_championship",
                "super_regionals",
                "cws",
                "offseason_departures",
                "offseason_recruiting_1",
                "offseason_recruiting_2",
                "offseason_recruiting_3",
                "offseason_recruiting_4",
                "offseason_signing_day",
                "offseason_walkons",
              ].includes(league?.currentPhase || "") && (
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
                        <AlertDialogTitle className="text-gold text-sm">
                          Simulate Full Season?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will simulate the entire current season — all games, postseason,
                          recruiting, and signing day — advancing to the next preseason. Your
                          recruiting actions won't be applied. This action is irreversible.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-background border-border">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={onSimFullSeason}
                          className="bg-gold text-forest-dark"
                          data-testid="button-confirm-sim-full-season"
                        >
                          Sim Full Season
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <p className="text-xs text-muted-foreground/60 mt-1.5 text-center">
                    Skips all game phases + recruiting
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-Advance</p>
                <p className="text-xs text-muted-foreground">
                  Auto-advance through regular season weeks
                </p>
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
              {(league?.currentPhase === "dynasty_setup" ||
                league?.currentPhase === "preseason") && (
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
              {(league?.currentPhase === "offseason_signing_day" ||
                league?.currentPhase === "offseason_walkons") && (
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
                    <AlertDialogTitle className="text-gold text-sm">
                      Dedup All Rosters?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will scan every team for players sharing the same name and remove the
                      duplicate. The earlier-added player is kept. This action cannot be undone.
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
                    <AlertDialogTitle className="text-gold text-sm">
                      Reset Season?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset all games, standings, and stats for the current season. This
                      action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground"
                      onClick={() =>
                        toast({
                          title: "Coming Soon",
                          description: "Season reset will be available in a future update.",
                        })
                      }
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
      </div>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gold text-sm">
              Import Recruiting Class
            </DialogTitle>
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
              <p className="text-sm text-muted-foreground">Click to upload CSV file</p>
              <p className="text-xs text-muted-foreground mt-1 text-left">
                <span className="text-gold">Required:</span> firstName, lastName, position,
                overall, homeState
                <br />
                <span className="text-gold">Basic:</span> hometown, starRating, recruitType,
                throwHand, batHand
                <br />
                <span className="text-gold">Fielder Attrs:</span> contact, power, speed, arm,
                fielding, errorResistance
                <br />
                <span className="text-gold">Fielder Abilities:</span> clutch, vsLHP, grit,
                stealing, running, throwing, recovery, catcherAbility
                <br />
                <span className="text-gold">Pitcher Attrs:</span> velocity, control, stamina
                <br />
                <span className="text-gold">Pitcher Abilities:</span> wRISP, vsLefty, poise,
                heater, agile, recovery
                <br />
                <span className="text-gold">Priorities:</span> proximity, reputation, playingTime,
                academics, prestige, facilities (Not/Somewhat/Very/Extremely)
                <br />
                <span className="text-gold">Special:</span> abilities (comma-separated),
                isBlueChip, isGem, isBust
                <br />
                <span className="text-gold">Appearance:</span> skinTone, hairColor, hairStyle
                <br />
                <span className="text-muted-foreground italic">
                  Letter grades S-G accepted for numeric fields
                </span>
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
                  {csvData.split("\n").length - 1} recruits detected
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
            <DialogTitle className="text-gold text-sm">Edit Teams</DialogTitle>
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

      <PhaseDeadlineControl
        leagueId={league?.id || ""}
        currentDeadline={league?.phaseDeadline ? String(league.phaseDeadline) : null}
        currentPhase={league?.currentPhase || ""}
      />

      {/* Broadcast to all coaches */}
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-gold" />
            <span className="text-xs font-semibold text-gold">COMMISSIONER BROADCAST</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Send a message to every coach's inbox in this league.
          </p>
          {showBroadcast ? (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Title (max 120 chars)"
                value={broadcastTitle}
                onChange={e => setBroadcastTitle(e.target.value.slice(0, 120))}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold"
                maxLength={120}
                data-testid="input-broadcast-title"
              />
              <textarea
                placeholder="Message body (max 1000 chars)"
                value={broadcastBody}
                onChange={e => setBroadcastBody(e.target.value.slice(0, 1000))}
                rows={4}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-gold"
                maxLength={1000}
                data-testid="input-broadcast-body"
              />
              <div className="flex gap-2">
                <RetroButton
                  variant="primary"
                  size="sm"
                  onClick={() => broadcastMut.mutate()}
                  disabled={!broadcastTitle.trim() || !broadcastBody.trim() || broadcastMut.isPending}
                  data-testid="btn-broadcast-send"
                >
                  <Megaphone className="w-3.5 h-3.5 mr-1.5" />
                  {broadcastMut.isPending ? "Sending..." : "Send to All Coaches"}
                </RetroButton>
                <RetroButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBroadcast(false)}
                  data-testid="btn-broadcast-cancel"
                >
                  Cancel
                </RetroButton>
              </div>
            </div>
          ) : (
            <RetroButton
              variant="outline"
              size="sm"
              onClick={() => setShowBroadcast(true)}
              data-testid="btn-broadcast-compose"
            >
              <Megaphone className="w-3.5 h-3.5 mr-1.5" />
              Compose Broadcast
            </RetroButton>
          )}
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}
