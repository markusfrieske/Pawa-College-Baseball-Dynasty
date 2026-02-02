import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
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
  Clock
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, AuditLog } from "@shared/schema";

interface CommissionerData {
  league: League;
  auditLogs: AuditLog[];
  readyCoaches: string[];
  totalCoaches: number;
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
          </TabsList>

          <TabsContent value="actions">
            <ActionsTab
              league={data?.league}
              onAdvanceWeek={() => advanceWeekMutation.mutate()}
              isAdvancing={advanceWeekMutation.isPending}
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
        </Tabs>
      </main>
    </div>
  );
}

function ActionsTab({
  league,
  onAdvanceWeek,
  isAdvancing,
}: {
  league?: League;
  onAdvanceWeek: () => void;
  isAdvancing: boolean;
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
            <ActionButton label="Edit Schedule" description="Modify upcoming games" />
            <ActionButton label="Edit Teams" description="Modify team attributes" />
            <ActionButton label="Edit Recruits" description="Modify recruit pool" />
            <ActionButton label="Reset Season" description="Start the season over" variant="destructive" />
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
}: {
  label: string;
  description: string;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      className={`w-full flex items-center justify-between p-3 rounded border transition-colors ${
        variant === "destructive"
          ? "border-red-500/30 hover:bg-red-500/10 text-red-400"
          : "border-border hover:bg-muted/50"
      }`}
    >
      <div className="text-left">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4" />
    </button>
  );
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
