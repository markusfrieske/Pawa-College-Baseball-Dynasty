import { useState } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
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
  Link as LinkIcon,
  FileUp,
  Calendar,
  Play,
  Check,
  Clock,
  User,
  Cpu,
  Settings,
  ChevronRight,
  Trash2,
  Eye,
  Edit,
  Plus,
  Copy,
  X,
  Database,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Team, Coach, Conference, League, LeagueInvite, SavedRoster, SavedRecruitingClass } from "@shared/schema";

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
  const [selectedRosterId, setSelectedRosterId] = useState<string>("default");
  const [selectedClassId, setSelectedClassId] = useState<string>("auto");
  const [perTeamRosters, setPerTeamRosters] = useState<Record<string, string>>({});
  const [inviteLabel, setInviteLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<DynastySetupData>({
    queryKey: ["/api/leagues", id, "dynasty-setup"],
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/invites`, { label: inviteLabel || undefined });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "dynasty-setup"] });
      const inviteCode = data?.inviteCode || data?.invite?.inviteCode;
      if (inviteCode) {
        const link = `${window.location.origin}/invite/${inviteCode}`;
        setGeneratedLink(link);
        navigator.clipboard?.writeText(link).catch(() => {});
      }
      setInviteLabel("");
    },
    onError: (err: Error) => toast({ title: "Error", description: parseErrorMessage(err), variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", `/api/invites/${code}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "dynasty-setup"] });
      toast({ title: "Invite Revoked", description: "The invite link has been disabled." });
    },
    onError: (err: Error) => toast({ title: "Error", description: parseErrorMessage(err), variant: "destructive" }),
  });

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/invite/${code}`;
    navigator.clipboard?.writeText(link).then(() => {
      toast({ title: "Link Copied", description: "Invite link copied to clipboard." });
    }).catch(() => {
      toast({ title: "Copy Failed", description: "Could not copy — please copy the link manually.", variant: "destructive" });
    });
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const { data: savedRosters } = useQuery<SavedRoster[]>({
    queryKey: ["/api/saved-rosters"],
    enabled: !!data?.isCommissioner,
  });

  const { data: savedClasses } = useQuery<SavedRecruitingClass[]>({
    queryKey: ["/api/saved-recruiting-classes"],
    enabled: !!data?.isCommissioner,
  });

  const loadClassMutation = useMutation({
    mutationFn: async (savedRecruitingClassId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${id}/load-recruiting-class`, { savedRecruitingClassId });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "dynasty-setup"] });
      toast({ title: "Recruiting Class Loaded", description: `Loaded ${data.count} recruits from "${data.className}".` });
    },
    onError: (err: Error) => toast({ title: "Error", description: parseErrorMessage(err), variant: "destructive" }),
  });

  const startDynastyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${id}/start`, {
      rosterId: selectedRosterId !== "default" ? selectedRosterId : undefined,
      recruitingClassId: selectedClassId !== "auto" ? selectedClassId : undefined,
      perTeamRosters: Object.keys(perTeamRosters).length > 0 ? perTeamRosters : undefined,
    }),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/leagues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      toast({ title: "Dynasty Started!", description: "Let the games begin!" });
      setLocation(`/league/${id}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: parseErrorMessage(err), variant: "destructive" }),
  });

  if (isLoading) {
    return <DynastySetupSkeleton />;
  }

  if (startDynastyMutation.isPending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-10 max-w-sm w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
            <div>
              <h2 className="font-pixel text-gold text-xs mb-3">Starting Dynasty...</h2>
              <p className="text-muted-foreground text-sm">Generating rosters, schedules, and recruiting class. This may take a moment.</p>
            </div>
          </div>
        </RetroCard>
      </div>
    );
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

  const setupComplete = humanTeams.length > 0;

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
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">Dynasty Setup</span>
                  {teams.length > 0 && (
                    <span className="text-muted-foreground text-xs" data-testid="text-setup-summary">
                      &mdash; {teams.length} teams &mdash; first recruiting class: {Math.max(40, teams.length * 5)} prospects
                    </span>
                  )}
                </div>
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
            description={hasRecruits ? "Recruiting class ready" : "Auto-generated on start"}
          />
          <SetupCheckItem
            icon={<Calendar className="w-5 h-5" />}
            title="Schedule"
            status={hasSchedule ? "complete" : "pending"}
            description={hasSchedule ? "Season schedule set" : "Auto-generated on start"}
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
                    <LinkIcon className="w-3 h-3 mr-2" />
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
                        name={team.name}
                       
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
                    <span className="font-pixel text-gold text-xs">Roster Source</span>
                  </RetroCardHeader>
                  <RetroCardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Use default NCAA 2026 rosters, or apply saved custom rosters. Per-team rosters override individual teams.
                    </p>
                    <Select value={selectedRosterId} onValueChange={setSelectedRosterId}>
                      <SelectTrigger data-testid="select-roster-source" className="w-full">
                        <SelectValue placeholder="Select roster source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">NCAA 2026 (Default)</SelectItem>
                        {savedRosters?.map((roster) => (
                          <SelectItem key={roster.id} value={String(roster.id)}>
                            {roster.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
                      <Database className="w-4 h-4" />
                      <span>{selectedRosterId === "default" ? "Using default NCAA 2026 rosters" : "Using custom saved roster"}</span>
                    </div>

                    {/* Per-team roster overrides */}
                    {savedRosters && savedRosters.filter(r => r.basedOn && teams.some(t => t.name === r.basedOn)).length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs text-muted-foreground font-pixel uppercase">Per-Team Custom Rosters</p>
                        <div className="space-y-1.5">
                          {teams.filter(t => savedRosters.some(r => r.basedOn === t.name)).map(team => {
                            const matchingRosters = savedRosters.filter(r => r.basedOn === team.name);
                            const currentVal = perTeamRosters[team.name] || "none";
                            return (
                              <div key={team.id} className="flex items-center gap-3">
                                <span className="text-xs text-foreground w-32 truncate" data-testid={`text-per-team-${team.id}`}>{team.name}</span>
                                <Select
                                  value={currentVal}
                                  onValueChange={val => setPerTeamRosters(prev => {
                                    const next = { ...prev };
                                    if (val === "none") delete next[team.name];
                                    else next[team.name] = val;
                                    return next;
                                  })}
                                >
                                  <SelectTrigger className="h-7 text-xs flex-1" data-testid={`select-per-team-roster-${team.id}`}>
                                    <SelectValue placeholder="Default" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Default</SelectItem>
                                    {matchingRosters.map(r => (
                                      <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <Link href={`/roster-viewer?returnTo=/league/${id}/dynasty-setup`}>
                        <RetroButton variant="ghost" size="sm" className="text-xs" data-testid="button-roster-viewer-link">
                          View NCAA 2026 Rosters
                        </RetroButton>
                      </Link>
                      <Link href={`/manage-rosters?returnTo=/league/${id}/dynasty-setup`}>
                        <RetroButton variant="ghost" size="sm" className="text-xs" data-testid="button-manage-rosters-link">
                          Manage Saved Rosters
                        </RetroButton>
                      </Link>
                    </div>
                  </RetroCardContent>
                </RetroCard>

                <RetroCard variant="bordered">
                  <RetroCardHeader>
                    <span className="font-pixel text-gold text-xs">Recruiting Class</span>
                  </RetroCardHeader>
                  <RetroCardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      {hasRecruits
                        ? "Recruiting class is ready. Select a different class and load again to replace it."
                        : "Pick a saved class to load now, or leave on Auto-Generate to create one when the dynasty starts."}
                    </p>
                    <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                      <SelectTrigger data-testid="select-recruiting-class" className="w-full mb-3">
                        <SelectValue placeholder="Select recruiting class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-Generate</SelectItem>
                        {savedClasses?.map((cls) => (
                          <SelectItem key={cls.id} value={String(cls.id)}>
                            {cls.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-3">
                      <RetroButton
                        variant="outline"
                        onClick={() => loadClassMutation.mutate(selectedClassId)}
                        disabled={selectedClassId === "auto" || loadClassMutation.isPending}
                        className="flex-1"
                        data-testid="button-load-saved-class"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {loadClassMutation.isPending ? "Loading..." : "Load Saved Class"}
                      </RetroButton>
                      {hasRecruits && (
                        <Link href={`/league/${id}/edit-recruits?returnTo=/league/${id}/dynasty-setup`} className="flex-1">
                          <RetroButton variant="outline" className="w-full" data-testid="button-edit-recruits">
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Recruits
                          </RetroButton>
                        </Link>
                      )}
                    </div>
                    {hasRecruits && (
                      <div className="mt-4 flex items-center gap-2 text-green-400 text-sm">
                        <Check className="w-4 h-4" />
                        <span>Recruiting class loaded</span>
                      </div>
                    )}
                    <Link href="/manage-recruiting">
                      <RetroButton variant="ghost" size="sm" className="mt-2 text-xs" data-testid="button-manage-recruiting-link">
                        Manage Saved Recruiting Classes
                      </RetroButton>
                    </Link>
                  </RetroCardContent>
                </RetroCard>

                <RetroCard variant="bordered">
                  <RetroCardHeader>
                    <span className="font-pixel text-gold text-xs">Season Schedule</span>
                  </RetroCardHeader>
                  <RetroCardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      {hasSchedule 
                        ? "Schedule is set. You can view or edit it below."
                        : "A schedule will be auto-generated when the dynasty starts."}
                    </p>
                    <div className="flex gap-3">
                      {hasSchedule && (
                        <Link href={`/league/${id}/schedule`} className="flex-1">
                          <RetroButton variant="outline" className="w-full" data-testid="button-edit-schedule">
                            <Edit className="w-4 h-4 mr-2" />
                            View Schedule
                          </RetroButton>
                        </Link>
                      )}
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
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-pixel text-gold text-xs">Active Invite Links</span>
                        <Badge variant="outline" className="text-xs">{pendingInvites.length} active</Badge>
                      </div>
                    </RetroCardHeader>
                    <RetroCardContent>
                      <div className="space-y-2">
                        {pendingInvites.map((invite) => (
                          <div
                            key={invite.id}
                            className="p-2 bg-background/50 border border-border rounded text-sm space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <LinkIcon className="w-3.5 h-3.5 text-gold shrink-0" />
                                <span className="text-xs truncate text-muted-foreground">
                                  {invite.label || `Invite ${invite.inviteCode.substring(0, 6)}...`}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {new Date(invite.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                readOnly
                                value={`${window.location.origin}/invite/${invite.inviteCode}`}
                                className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs text-foreground font-mono select-all"
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
                    </RetroCardContent>
                  </RetroCard>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <Dialog open={showInviteDialog} onOpenChange={(open) => { setShowInviteDialog(open); if (!open) setGeneratedLink(null); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Invite Coach</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Generate a shareable link that anyone can use to join your dynasty and claim an available CPU team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!generatedLink ? (
              <div className="flex gap-3">
                <RetroInput
                  type="text"
                  placeholder="Label (optional, e.g. 'For Mike')"
                  value={inviteLabel}
                  onChange={(e) => setInviteLabel(e.target.value)}
                  className="flex-1"
                  data-testid="input-invite-label"
                />
                <RetroButton
                  onClick={() => inviteMutation.mutate()}
                  disabled={inviteMutation.isPending}
                  data-testid="button-generate-invite"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  {inviteMutation.isPending ? "Generating..." : "Generate Link"}
                </RetroButton>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-green-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Invite link created — share this URL:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={generatedLink}
                    className="flex-1 bg-background border border-border rounded px-3 py-2 text-xs text-foreground font-mono select-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    data-testid="input-generated-link"
                  />
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(generatedLink).then(() => {
                        setCopied("modal");
                        setTimeout(() => setCopied(null), 2000);
                      }).catch(() => {
                        toast({ title: "Copy Failed", description: "Could not copy — please select and copy the link manually.", variant: "destructive" });
                      });
                    }}
                    data-testid="button-copy-generated-link"
                  >
                    {copied === "modal" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </RetroButton>
                </div>
                <RetroButton
                  variant="ghost"
                  size="sm"
                  className="text-xs w-full"
                  onClick={() => { setGeneratedLink(null); }}
                  data-testid="button-generate-another"
                >
                  Generate another link
                </RetroButton>
              </div>
            )}
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
        <span className="font-pixel text-xs text-foreground">{title}</span>
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
