import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  Copy
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id] });
      toast({ title: "Week Advanced", description: "The league has moved to the next week." });
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

  const importRecruitingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${id}/recruiting/import`, {});
      return res.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "commissioner"] });
      toast({ 
        title: "Recruiting Class Imported", 
        description: `Generated ${data.count} new recruits for the recruiting class.` 
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
    preseason: "Preseason",
    spring_training: "Spring Training",
    recruiting: "Recruiting Phase",
    regular: "Regular Season",
    super_regionals: "Super Regionals",
    cws: "College World Series",
    offseason: "Offseason",
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
              onImportRecruiting={() => importRecruitingMutation.mutate()}
              isImporting={importRecruitingMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab
              league={data?.league}
              onToggleAuditLog={(isPublic) => toggleAuditLogMutation.mutate(isPublic)}
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
  onImportRecruiting,
  isImporting,
}: {
  league?: League;
  onAdvanceWeek: () => void;
  isAdvancing: boolean;
  onImportRecruiting: () => void;
  isImporting: boolean;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <RetroCard>
        <RetroCardHeader>Advance Week</RetroCardHeader>
        <RetroCardContent>
          <p className="text-muted-foreground mb-4">
            Move the league forward to the next week. This will process recruiting updates,
            trigger story events, and update standings.
          </p>
          <RetroButton
            onClick={onAdvanceWeek}
            disabled={isAdvancing}
            className="w-full"
            data-testid="button-advance-week"
          >
            <Play className="w-4 h-4 mr-2" />
            {isAdvancing ? "Advancing..." : "Advance Week"}
          </RetroButton>
        </RetroCardContent>
      </RetroCard>

      <RetroCard>
        <RetroCardHeader>Quick Actions</RetroCardHeader>
        <RetroCardContent>
          <div className="space-y-3">
            <ActionButton 
              label={isImporting ? "Importing..." : "Import Recruiting Class"}
              description="Generate new recruits for the season" 
              onClick={onImportRecruiting}
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
              description="Modify team attributes" 
              href={`/league/${league?.id}`}
              dataTestId="button-edit-teams"
            />
            <ActionButton 
              label="View Roster" 
              description="View your team roster" 
              href={`/league/${league?.id}/roster`}
              dataTestId="button-view-roster"
            />
            <ActionButton 
              label="Reset Season" 
              description="Start the season over" 
              variant="destructive"
              dataTestId="button-reset-season"
            />
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
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

function SettingsTab({
  league,
  onToggleAuditLog,
}: {
  league?: League;
  onToggleAuditLog: (isPublic: boolean) => void;
}) {
  return (
    <RetroCard>
      <RetroCardHeader>League Settings</RetroCardHeader>
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
            <div className="flex items-center gap-3 mb-4">
              <Settings className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">League Name</p>
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
            Invite a friend to join your league. They will receive a unique link to select an available CPU team.
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
              <p className="text-sm mt-2">Use the form above to invite friends to your league</p>
            </div>
          )}
        </div>
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
