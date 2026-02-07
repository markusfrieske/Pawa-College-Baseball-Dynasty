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
  Swords
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, AuditLog, LeagueInvite } from "@shared/schema";

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
          offseason: "The College World Series is complete! Preparing for next season.",
        };
        toast({ 
          title: phaseMessages[phase] ? "Postseason Update" : "Week Advanced", 
          description: phaseMessages[phase] || "The dynasty has moved to the next week.",
        });
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

  const simulateWeekMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/simulate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
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
    preseason: "Preseason",
    spring_training: "Spring Training",
    regular_season: "Regular Season",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    players_leaving: "Players Leaving",
    offseason_recruiting_1: "Early Recruiting",
    offseason_recruiting_2: "Mid Recruiting",
    offseason_recruiting_3: "Late Recruiting",
    offseason_recruiting_4: "Final Recruiting",
    signing_day: "Signing Day",
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
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
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
  const isOffseason = league?.currentPhase === "offseason";
  
  const advanceLabel = (() => {
    if (isAdvancing) return "Processing...";
    switch (league?.currentPhase) {
      case "conference_championship": return "Play Conference Championships";
      case "super_regionals": return "Play Super Regional Round";
      case "cws": return "Play CWS Game";
      case "offseason": return "Start Next Season";
      default: return "Advance Week";
    }
  })();

  const advanceDescription = (() => {
    switch (league?.currentPhase) {
      case "conference_championship": return "Simulate conference championship matchups between top teams.";
      case "super_regionals": return "Simulate the next round of the Super Regional bracket tournament.";
      case "cws": return "Play the next game of the College World Series best-of-3 championship.";
      case "offseason": return "Graduate seniors, advance eligibility, add signed recruits, and generate a new recruiting class.";
      default: return "Move the league forward to the next week. This will process recruiting updates, trigger story events, and update standings.";
    }
  })();

  const advanceIcon = (() => {
    switch (league?.currentPhase) {
      case "conference_championship": return <Swords className="w-4 h-4 mr-2" />;
      case "super_regionals": return <Swords className="w-4 h-4 mr-2" />;
      case "cws": return <Trophy className="w-4 h-4 mr-2" />;
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
            <RetroButton
              onClick={onAdvanceWeek}
              disabled={isAdvancing || isAdvancingSeason}
              className="w-full"
              data-testid="button-advance-week"
            >
              {advanceIcon}
              {advanceLabel}
            </RetroButton>
            {isOffseason && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-muted-foreground text-xs mb-2">
                  End the current season: graduates seniors, advances eligibility,
                  adds signed recruits to rosters, and generates a new recruiting class.
                </p>
                <RetroButton
                  onClick={onAdvanceSeason}
                  disabled={isAdvancingSeason || isAdvancing}
                  variant="outline"
                  className="w-full"
                  data-testid="button-advance-season"
                >
                  <GraduationCap className="w-4 h-4 mr-2" />
                  {isAdvancingSeason ? "Processing..." : "Advance to Next Season"}
                </RetroButton>
              </div>
            )}
          </RetroCardContent>
        </RetroCard>

        <RetroCard>
          <RetroCardHeader>Quick Actions</RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-3">
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
    </div>
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
    scoutActionsUsed: number;
    recruitActionsUsed: number;
    hasReportedScores: boolean;
  }>;
  allHumansReady: boolean;
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

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center justify-between w-full">
          <span>Ready Status</span>
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
                      {team.isReady ? (
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
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const sendInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/invites`, { email });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      setEmail("");
      toast({ title: "Invite Created", description: "Invite link generated successfully." });
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
        return <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">Pending</Badge>;
      case "accepted":
        return <Badge variant="outline" className="text-green-400 border-green-400/50">Accepted</Badge>;
      case "expired":
        return <Badge variant="outline" className="text-red-400 border-red-400/50">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-gold" />
            <span>Send New Invite</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-muted-foreground mb-4">
            Invite a friend to join your dynasty. They will receive a unique link to select an available CPU team.
          </p>
          <div className="flex gap-3">
            <RetroInput
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
              data-testid="input-invite-email"
            />
            <RetroButton
              onClick={() => sendInviteMutation.mutate(email)}
              disabled={!email || sendInviteMutation.isPending}
              data-testid="button-send-invite"
            >
              <Mail className="w-4 h-4 mr-2" />
              {sendInviteMutation.isPending ? "Sending..." : "Send Invite"}
            </RetroButton>
          </div>
        </RetroCardContent>
      </RetroCard>

      <RetroCard>
        <RetroCardHeader className="flex items-center justify-between gap-4">
          <span>Sent Invites</span>
          <Badge variant="outline" className="text-[8px]">{invites.length} invites</Badge>
        </RetroCardHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {invites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded">
              <div className="flex items-center gap-3 flex-1">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm">{invite.email}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Code: {invite.inviteCode} | Created: {new Date(invite.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {statusBadge(invite.status)}
                {invite.status === "pending" && (
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
                )}
              </div>
            </div>
          ))}

          {invites.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No invites sent yet</p>
              <p className="text-sm mt-2">Use the form above to invite friends to your dynasty</p>
            </div>
          )}
        </div>
      </RetroCard>
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

function CommissionerSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </main>
    </div>
  );
}
