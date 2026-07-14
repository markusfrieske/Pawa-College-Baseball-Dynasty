import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Bot,
  Play,
  RefreshCw,
  Save,
  RotateCcw,
  History,
  ChevronRight,
  Clock,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RetroCard } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import type { AuditLog, League } from "@shared/schema";
import type { HumanCoach } from "../types";

interface PreflightCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  count: number;
  items: string[];
}

interface PreflightResult {
  canAdvance: boolean;
  checks: PreflightCheck[];
  runAt: string;
}

interface SaveStateMeta {
  id: string;
  season: number;
  week: number;
  phase: string;
  label: string;
  trigger: string;
  createdAt: string;
}

const PHASE_LABELS: Record<string, string> = {
  preseason: "Preseason",
  spring_training: "Spring Training",
  regular_season: "Regular Season",
  conference_championship: "Conf. Champs",
  super_regionals: "Super Regionals",
  cws: "CWS",
  offseason_departures: "Departures",
  offseason_recruiting_1: "Recruiting 1",
  offseason_recruiting_2: "Recruiting 2",
  offseason_recruiting_3: "Recruiting 3",
  offseason_recruiting_4: "Recruiting 4",
  offseason_signing_day: "Signing Day",
  offseason_walkons: "Walk-Ons",
  recruiting: "Recruiting",
};

const BLOCKER_TAB_MAP: Record<string, string> = {
  pending_reports: "reports",
  disputed_reports: "reports",
  unreported_games: "reports",
  roster_limits: "roster-editor",
  orphan_teams: "settings",
  duplicate_games: "schedule-health",
  recruiting_class: "actions",
};

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface CommandCenterTabProps {
  leagueId: string;
  league: League;
  readyCoaches: string[];
  totalCoaches: number;
  humanCoaches: HumanCoach[];
  auditLogs: AuditLog[];
  onSwitchTab: (tab: string) => void;
}

export function CommandCenterTab({
  leagueId,
  league,
  readyCoaches,
  totalCoaches,
  humanCoaches,
  auditLogs,
  onSwitchTab,
}: CommandCenterTabProps) {
  const [labelInput, setLabelInput] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [hasRunPreflight, setHasRunPreflight] = useState(false);
  const readySet = new Set(readyCoaches);
  const readyCount = humanCoaches.filter(c => readySet.has(c.coachId) || c.isAutoPilot).length;

  const {
    data: preflight,
    isFetching: isRunning,
    refetch: _refetchPreflight,
    dataUpdatedAt,
  } = useQuery<PreflightResult>({
    queryKey: ["/api/leagues", leagueId, "commissioner", "preflight"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/commissioner/preflight`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: hasRunPreflight,
    staleTime: 0,
    refetchOnWindowFocus: hasRunPreflight,
  });

  const runPreflight = async () => {
    setHasRunPreflight(true);
    await _refetchPreflight();
  };

  const { data: saveStates } = useQuery<SaveStateMeta[]>({
    queryKey: ["/api/leagues", leagueId, "save-states"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leagues/${leagueId}/save-states`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const createSaveMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/save-states`, { label });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "save-states"] });
      setLabelInput("");
      setShowSaveForm(false);
    },
  });

  const failCount = preflight?.checks.filter(c => c.status === "fail").length ?? 0;
  const ageMs = dataUpdatedAt ? Date.now() - dataUpdatedAt : null;
  const isStale = ageMs !== null && ageMs > 2 * 60 * 1000;
  const recentSaves = (saveStates ?? []).slice(0, 3);
  const recentAudit = auditLogs.slice(0, 5);

  return (
    <div className="space-y-4">

      {/* ── A. Advance Readiness ── */}
      <RetroCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="font-pixel text-xs text-gold">ADVANCE READINESS</p>
          <Badge
            variant="outline"
            className={`text-xs font-pixel ${readyCount >= totalCoaches ? "border-green-500/50 text-green-400" : "border-yellow-500/50 text-yellow-400"}`}
            data-testid="badge-readiness-count"
          >
            {readyCount}/{totalCoaches} ready
          </Badge>
        </div>
        {humanCoaches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No human coaches in this league.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {humanCoaches.map(coach => {
              const isReady = readySet.has(coach.coachId);
              const isAuto = coach.isAutoPilot;
              return (
                <div
                  key={coach.coachId}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded border text-xs min-h-[44px] ${
                    isAuto
                      ? "border-muted/40 bg-muted/10 text-muted-foreground"
                      : isReady
                      ? "border-green-500/40 bg-green-500/10 text-green-300"
                      : "border-red-500/40 bg-red-500/10 text-red-300"
                  }`}
                  data-testid={`chip-coach-${coach.coachId}`}
                  title={`${coach.firstName} ${coach.lastName} – ${coach.teamName ?? "No team"}`}
                >
                  {isAuto ? (
                    <Bot className="w-3 h-3 shrink-0" />
                  ) : isReady ? (
                    <CheckCircle className="w-3 h-3 shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 shrink-0" />
                  )}
                  <span className="font-pixel text-xs whitespace-nowrap">
                    {coach.abbreviation ?? coach.teamName ?? "?"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </RetroCard>

      {/* ── B. Advance Preflight ── */}
      <RetroCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="font-pixel text-xs text-gold">ADVANCE PREFLIGHT</p>
          {preflight && (
            <div className="flex items-center gap-2">
              {isStale && (
                <span className="font-pixel text-xs text-yellow-500">STALE</span>
              )}
              <span className="text-xs text-muted-foreground">
                {formatAge(preflight.runAt)}
              </span>
            </div>
          )}
        </div>

        <RetroButton
          size="sm"
          variant={preflight && !preflight.canAdvance ? "destructive" : "shimmer"}
          onClick={() => runPreflight()}
          disabled={isRunning}
          className="w-full mb-4 min-h-[44px]"
          data-testid="button-run-preflight"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isRunning ? "animate-spin" : ""}`} />
          {isRunning ? "Running checks..." : preflight ? "Re-run Preflight" : "Run Preflight Check"}
        </RetroButton>

        {preflight && (
          <>
            <div
              className={`mb-3 px-3 py-2 rounded border text-xs flex items-center gap-2 ${
                preflight.canAdvance
                  ? "border-green-500/40 bg-green-500/10 text-green-300"
                  : "border-red-500/40 bg-red-500/10 text-red-400"
              }`}
              data-testid="banner-preflight-result"
            >
              {preflight.canAdvance ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="font-pixel text-xs">
                {preflight.canAdvance
                  ? "League is ready to advance"
                  : `${failCount} blocker(s) found — review below`}
              </span>
            </div>

            <div className="space-y-1.5">
              {preflight.checks.map(check => (
                <div
                  key={check.id}
                  className="flex items-start gap-2.5 py-1.5"
                  data-testid={`check-row-${check.id}`}
                >
                  {check.status === "pass" ? (
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  ) : check.status === "warn" ? (
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{check.label}</span>
                      {check.count > 0 && (
                        <span className="font-pixel text-xs px-1 py-0.5 rounded bg-muted/30 text-muted-foreground">
                          {check.count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                    {check.items.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {check.items.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground pl-2 border-l border-border">
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </RetroCard>

      {/* ── C. Active Blockers Summary ── */}
      {preflight && !preflight.canAdvance && (
        <RetroCard className="border-red-500/30">
          <p className="font-pixel text-xs text-red-400 mb-3">BLOCKERS — QUICK LINKS</p>
          <div className="space-y-1.5">
            {preflight.checks
              .filter(c => c.status === "fail")
              .map(c => {
                const targetTab = BLOCKER_TAB_MAP[c.id];
                return (
                  <button
                    key={c.id}
                    onClick={() => targetTab && onSwitchTab(targetTab)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded border border-red-500/30 bg-red-500/5 text-left min-h-[44px] hover:bg-red-500/10 transition-colors"
                    data-testid={`link-blocker-${c.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="text-xs text-red-300">{c.label}</span>
                      <span className="font-pixel text-xs px-1 py-0.5 rounded bg-red-500/20 text-red-400">
                        {c.count}
                      </span>
                    </div>
                    {targetTab && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </button>
                );
              })}
          </div>
        </RetroCard>
      )}

      {/* ── D. Save State Quick Access ── */}
      <RetroCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="font-pixel text-xs text-gold">SAVE STATES</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSwitchTab("save-states")}
              className="text-xs text-muted-foreground hover:text-gold transition-colors flex items-center gap-1"
              data-testid="link-view-all-saves"
            >
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {!showSaveForm ? (
          <RetroButton
            size="sm"
            variant="secondary"
            onClick={() => setShowSaveForm(true)}
            className="w-full mb-3 min-h-[44px]"
            data-testid="button-save-now-quick"
          >
            <Save className="w-3.5 h-3.5 mr-2" />
            Save Now
          </RetroButton>
        ) : (
          <div className="flex gap-2 items-center mb-3">
            <input
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gold"
              placeholder="Label (e.g. Before signing day)"
              value={labelInput}
              maxLength={100}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && labelInput.trim() && createSaveMutation.mutate(labelInput.trim())}
              autoFocus
              data-testid="input-quick-save-label"
            />
            <RetroButton
              size="sm"
              onClick={() => createSaveMutation.mutate(labelInput.trim())}
              disabled={!labelInput.trim() || createSaveMutation.isPending}
              data-testid="button-confirm-quick-save"
            >
              {createSaveMutation.isPending ? "Saving..." : "Save"}
            </RetroButton>
            <RetroButton
              size="sm"
              variant="secondary"
              onClick={() => { setShowSaveForm(false); setLabelInput(""); }}
            >
              Cancel
            </RetroButton>
          </div>
        )}

        {recentSaves.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No save states yet.</p>
        ) : (
          <div className="space-y-1.5">
            {recentSaves.map(ss => (
              <div
                key={ss.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/20"
                data-testid={`save-state-quick-${ss.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{ss.label}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    S{ss.season} W{ss.week} · {PHASE_LABELS[ss.phase] ?? ss.phase} · {formatDate(ss.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </RetroCard>

      {/* ── E. Recent Audit Log ── */}
      <RetroCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="font-pixel text-xs text-gold">RECENT AUDIT LOG</p>
          <button
            onClick={() => onSwitchTab("audit")}
            className="text-xs text-muted-foreground hover:text-gold transition-colors flex items-center gap-1"
            data-testid="link-view-full-audit"
          >
            View Full Log <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {recentAudit.length === 0 ? (
          <p className="text-xs text-muted-foreground">No audit log entries yet.</p>
        ) : (
          <div className="space-y-2">
            {recentAudit.map(log => (
              <div key={log.id} className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
                <History className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs">{log.action}</p>
                  {log.details && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(new Date(log.timestamp).toISOString())}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </RetroCard>
    </div>
  );
}
