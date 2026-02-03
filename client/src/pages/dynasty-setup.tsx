import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Users,
  Mail,
  FileUp,
  Calendar,
  Play,
  Check,
  Clock,
  User,
  Cpu,
  Settings,
  ChevronRight,
  Send,
  Trash2,
  Eye,
  Edit,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Team, Coach, Conference, League } from "@shared/schema";

interface TeamWithCoach extends Team {
  coach: {
    id: string;
    firstName: string;
    lastName: string;
    userId: string;
  } | null;
  user?: {
    email: string;
  };
}

interface LeagueInvite {
  id: string;
  email: string;
  status: string;
  code: string;
  createdAt: string;
}

interface DynastySetupData {
  league: League;
  teams: TeamWithCoach[];
  conferences: Conference[];
  invites: LeagueInvite[];
  hasRecruits: boolean;
  hasSchedule: boolean;
  isCommissioner: boolean;
}

export default function DynastySetupPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);

  const { data, isLoading, refetch } = useQuery<DynastySetupData>({
    queryKey: ["/api/leagues", id, "dynasty-setup"],
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => apiRequest("POST", `/api/leagues/${id}/invites`, { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "dynasty-setup"] });
      toast({ title: "Invite sent!" });
      setInviteEmail("");
      setShowInviteDialog(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateRecruitsMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${id}/recruiting/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "dynasty-setup"] });
      toast({ title: "Recruiting class generated!" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateScheduleMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${id}/schedule/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "dynasty-setup"] });
      toast({ title: "Schedule generated!" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const startDynastyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${id}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      toast({ title: "Dynasty Started!", description: "Let the games begin!" });
      setLocation(`/league/${id}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <DynastySetupSkeleton />;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-8">
          <h2 className="font-pixel text-gold text-sm mb-4">Dynasty Not Found</h2>
          <Link href="/dashboard">
            <RetroButton data-testid="button-back-dashboard">Back to Dashboard</RetroButton>
          </Link>
        </RetroCard>
      </div>
    );
  }

  const { league, teams, conferences, invites = [], hasRecruits, hasSchedule, isCommissioner } = data;
  
  const humanTeams = teams.filter(t => !t.isCpu);
  const cpuTeams = teams.filter(t => t.isCpu);
  const pendingInvites = invites.filter(i => i.status === "pending");

  const setupComplete = hasRecruits && hasSchedule && humanTeams.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-muted-foreground hover:text-gold transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="font-pixel text-gold text-lg">{league.name}</h1>
                <span className="text-muted-foreground text-sm">Dynasty Setup</span>
              </div>
            </div>
            
            {isCommissioner && (
              <RetroButton
                onClick={() => startDynastyMutation.mutate()}
                disabled={!setupComplete || startDynastyMutation.isPending}
                className="flex items-center gap-2"
                data-testid="button-start-dynasty"
              >
                <Play className="w-4 h-4" />
                {startDynastyMutation.isPending ? "Starting..." : "Start Dynasty"}
              </RetroButton>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <SetupCheckItem
            icon={<Users className="w-5 h-5" />}
            title="Coaches Assigned"
            status={humanTeams.length > 0 ? "complete" : "pending"}
            description={`${humanTeams.length} human coach${humanTeams.length !== 1 ? "es" : ""} joined`}
          />
          <SetupCheckItem
            icon={<FileUp className="w-5 h-5" />}
            title="Recruiting Class"
            status={hasRecruits ? "complete" : "pending"}
            description={hasRecruits ? "Recruiting class ready" : "Generate or import recruits"}
          />
          <SetupCheckItem
            icon={<Calendar className="w-5 h-5" />}
            title="Schedule"
            status={hasSchedule ? "complete" : "pending"}
            description={hasSchedule ? "Season schedule set" : "Generate schedule"}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <RetroCard variant="bordered">
            <RetroCardHeader>
              <div className="flex items-center justify-between">
                <span className="font-pixel text-gold text-xs">Teams & Coaches</span>
                {isCommissioner && (
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => setShowInviteDialog(true)}
                    data-testid="button-invite-coach"
                  >
                    <Mail className="w-3 h-3 mr-2" />
                    Invite Coach
                  </RetroButton>
                )}
              </div>
            </RetroCardHeader>
            <RetroCardContent className="max-h-[400px] overflow-y-auto">
              <div className="space-y-2">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-3 bg-background/50 border border-border rounded"
                  >
                    <div className="flex items-center gap-3">
                      <TeamBadge
                        abbreviation={team.abbreviation}
                        primaryColor={team.primaryColor}
                        secondaryColor={team.secondaryColor}
                        size="sm"
                      />
                      <div>
                        <Link href={`/league/${id}/team/${team.id}`}>
                          <span className="text-foreground text-sm hover:text-gold cursor-pointer" data-testid={`link-team-${team.id}`}>
                            {team.name}
                          </span>
                        </Link>
                        {team.coach ? (
                          <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            <User className="w-3 h-3" />
                            <span>{team.coach.firstName} {team.coach.lastName}</span>
                            {team.user && (
                              <span className="text-gold">({team.user.email.split("@")[0]})</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            <Cpu className="w-3 h-3" />
                            <span>CPU Controlled</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/league/${id}/team/${team.id}`}>
                        <RetroButton variant="ghost" size="sm" data-testid={`button-view-roster-${team.id}`}>
                          <Eye className="w-3 h-3" />
                        </RetroButton>
                      </Link>
                      {isCommissioner && (
                        <Link href={`/league/${id}/team/${team.id}/edit`}>
                          <RetroButton variant="ghost" size="sm" data-testid={`button-edit-team-${team.id}`}>
                            <Edit className="w-3 h-3" />
                          </RetroButton>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>

          <div className="space-y-6">
            {isCommissioner && (
              <>
                <RetroCard variant="bordered">
                  <RetroCardHeader>
                    <span className="font-pixel text-gold text-xs">Recruiting Class</span>
                  </RetroCardHeader>
                  <RetroCardContent>
                    <div className="flex gap-3">
                      <RetroButton
                        variant="outline"
                        onClick={() => generateRecruitsMutation.mutate()}
                        disabled={generateRecruitsMutation.isPending}
                        className="flex-1"
                        data-testid="button-generate-recruits"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${generateRecruitsMutation.isPending ? "animate-spin" : ""}`} />
                        {generateRecruitsMutation.isPending ? "Generating..." : "Generate Class"}
                      </RetroButton>
                      <RetroButton
                        variant="outline"
                        onClick={() => setShowImportDialog(true)}
                        className="flex-1"
                        data-testid="button-import-recruits"
                      >
                        <FileUp className="w-4 h-4 mr-2" />
                        Import CSV
                      </RetroButton>
                    </div>
                    {hasRecruits && (
                      <div className="mt-4 flex items-center gap-2 text-green-400 text-sm">
                        <Check className="w-4 h-4" />
                        <span>Recruiting class loaded</span>
                      </div>
                    )}
                  </RetroCardContent>
                </RetroCard>

                <RetroCard variant="bordered">
                  <RetroCardHeader>
                    <span className="font-pixel text-gold text-xs">Season Schedule</span>
                  </RetroCardHeader>
                  <RetroCardContent>
                    <div className="flex gap-3">
                      <RetroButton
                        variant="outline"
                        onClick={() => generateScheduleMutation.mutate()}
                        disabled={generateScheduleMutation.isPending}
                        className="flex-1"
                        data-testid="button-generate-schedule"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${generateScheduleMutation.isPending ? "animate-spin" : ""}`} />
                        {generateScheduleMutation.isPending ? "Generating..." : "Generate Schedule"}
                      </RetroButton>
                      <Link href={`/league/${id}/schedule/edit`} className="flex-1">
                        <RetroButton variant="outline" className="w-full" data-testid="button-edit-schedule">
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Schedule
                        </RetroButton>
                      </Link>
                    </div>
                    {hasSchedule && (
                      <div className="mt-4 flex items-center gap-2 text-green-400 text-sm">
                        <Check className="w-4 h-4" />
                        <span>Schedule generated</span>
                      </div>
                    )}
                  </RetroCardContent>
                </RetroCard>

                {pendingInvites.length > 0 && (
                  <RetroCard variant="bordered">
                    <RetroCardHeader>
                      <span className="font-pixel text-gold text-xs">Pending Invites</span>
                    </RetroCardHeader>
                    <RetroCardContent>
                      <div className="space-y-2">
                        {pendingInvites.map((invite) => (
                          <div
                            key={invite.id}
                            className="flex items-center justify-between p-2 bg-background/50 border border-border rounded text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span>{invite.email}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">Pending</span>
                          </div>
                        ))}
                      </div>
                    </RetroCardContent>
                  </RetroCard>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Invite Coach</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Send an email invite to another coach to join your league.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RetroInput
              label="Email Address"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="coach@email.com"
              data-testid="input-invite-email"
            />
            <RetroButton
              onClick={() => inviteMutation.mutate(inviteEmail)}
              disabled={!inviteEmail || inviteMutation.isPending}
              className="w-full"
              data-testid="button-send-invite"
            >
              <Send className="w-4 h-4 mr-2" />
              {inviteMutation.isPending ? "Sending..." : "Send Invite"}
            </RetroButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Import Recruiting Class</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Upload a CSV file with recruit data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-background/50 border border-border p-4 rounded text-xs text-muted-foreground">
              <p className="mb-2">CSV Format:</p>
              <code>firstName, lastName, position, overall, starRating, homeState</code>
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-gold file:text-forest-dark file:font-pixel file:text-xs"
              data-testid="input-import-file"
            />
            <RetroButton
              disabled={!importFile}
              className="w-full"
              data-testid="button-upload-csv"
            >
              <FileUp className="w-4 h-4 mr-2" />
              Upload CSV
            </RetroButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetupCheckItem({
  icon,
  title,
  status,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  status: "complete" | "pending";
  description: string;
}) {
  return (
    <div className={`p-4 border-2 rounded ${status === "complete" ? "border-green-500/50 bg-green-500/10" : "border-border bg-card"}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={status === "complete" ? "text-green-400" : "text-muted-foreground"}>
          {icon}
        </div>
        <span className="font-pixel text-[10px] text-foreground">{title}</span>
        {status === "complete" ? (
          <Check className="w-4 h-4 text-green-400 ml-auto" />
        ) : (
          <Clock className="w-4 h-4 text-muted-foreground ml-auto" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function DynastySetupSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto">
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <div className="space-y-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
