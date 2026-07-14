import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RetroCard } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Save, RotateCcw, AlertTriangle, Clock, Info } from "lucide-react";

interface SaveStateMeta {
  id: string;
  leagueId: string;
  season: number;
  week: number;
  phase: string;
  label: string;
  trigger: string;
  createdByUserId: string | null;
  restoredAt: string | null;
  restoredByUserId: string | null;
  createdAt: string;
  rowCounts: Record<string, number>;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual",
  pre_advance: "Pre-Advance",
  pre_force_advance: "Pre-Force-Advance",
  pre_restore: "Pre-Restore Backup",
};

const PHASE_LABELS: Record<string, string> = {
  preseason: "Preseason",
  spring_training: "Spring Training",
  regular_season: "Regular Season",
  conference_championship: "Conf. Championships",
  super_regionals: "Super Regionals",
  cws: "CWS",
  offseason_departures: "Offseason – Departures",
  offseason_recruiting_1: "Offseason – Recruiting 1",
  offseason_recruiting_2: "Offseason – Recruiting 2",
  offseason_recruiting_3: "Offseason – Recruiting 3",
  offseason_recruiting_4: "Offseason – Recruiting 4",
  offseason_signing_day: "Signing Day",
  offseason_walkons: "Walk-Ons",
  recruiting: "Recruiting",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function totalRows(counts: Record<string, number>): number {
  return Object.values(counts).reduce((s, n) => s + n, 0);
}

interface Props {
  leagueId: string;
}

export function SaveStatesTab({ leagueId }: Props) {
  const [labelInput, setLabelInput] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<SaveStateMeta | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: saveStates, isLoading } = useQuery<SaveStateMeta[]>({
    queryKey: ["/api/leagues", leagueId, "save-states"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leagues/${leagueId}/save-states`);
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/save-states`, { label });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "save-states"] });
      setLabelInput("");
      setShowCreateForm(false);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (saveStateId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/leagues/${leagueId}/save-states/${saveStateId}/restore`,
        {}
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "save-states"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
      setConfirmRestore(null);
    },
    onError: (err: Error) => {
      console.error("Restore failed:", err);
    },
  });

  const handleCreate = () => {
    const trimmed = labelInput.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  const handleRestoreConfirm = () => {
    if (confirmRestore && restoreConfirmText === "RESTORE") {
      restoreMutation.mutate(confirmRestore.id);
    }
  };

  const openConfirmRestore = (ss: SaveStateMeta) => {
    setConfirmRestore(ss);
    setRestoreConfirmText("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gold mb-1">SAVE STATES</p>
          <p className="text-xs text-muted-foreground">
            Snapshot the full league state and roll back if something goes wrong. Auto-saves before
            every advance and restore. Max 10 per league (oldest pruned automatically).
          </p>
        </div>
        {!showCreateForm && (
          <RetroButton
            size="sm"
            onClick={() => setShowCreateForm(true)}
            data-testid="button-create-save-state"
          >
            <Save className="w-3 h-3 mr-1" />
            Save Now
          </RetroButton>
        )}
      </div>

      {showCreateForm && (
        <RetroCard className="border-gold/40">
          <p className="text-xs font-semibold text-gold mb-3">CREATE SAVE STATE</p>
          <div className="flex gap-2 items-center">
            <input
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gold"
              placeholder="Label (e.g. Before signing day)"
              value={labelInput}
              maxLength={100}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              data-testid="input-save-state-label"
              autoFocus
            />
            <RetroButton
              size="sm"
              onClick={handleCreate}
              disabled={!labelInput.trim() || createMutation.isPending}
              data-testid="button-confirm-create-save-state"
            >
              {createMutation.isPending ? "Saving..." : "Create"}
            </RetroButton>
            <RetroButton
              size="sm"
              variant="secondary"
              onClick={() => { setShowCreateForm(false); setLabelInput(""); }}
            >
              Cancel
            </RetroButton>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-400 mt-2">
              {(createMutation.error as Error)?.message ?? "Failed to create save state"}
            </p>
          )}
        </RetroCard>
      )}

      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <RetroCard className="max-w-md w-full border-red-500/60">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-400 mb-3">CONFIRM RESTORE</p>
                <div className="rounded border border-border bg-muted/20 p-3 mb-3 space-y-1.5">
                  <p className="text-sm font-semibold text-gold truncate">"{confirmRestore.label}"</p>
                  <p className="text-xs text-muted-foreground">
                    S{confirmRestore.season} W{confirmRestore.week} · {PHASE_LABELS[confirmRestore.phase] ?? confirmRestore.phase}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {TRIGGER_LABELS[confirmRestore.trigger] ?? confirmRestore.trigger}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(confirmRestore.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {totalRows(confirmRestore.rowCounts).toLocaleString()} total rows
                  </p>
                </div>
                <p className="text-xs text-foreground mb-1">
                  This will replace <strong>ALL</strong> current league data with this snapshot. A pre-restore backup will be created first.
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  Type <span className="font-mono font-bold text-red-400">RESTORE</span> to confirm:
                </p>
                <input
                  className="w-full bg-background border border-red-500/50 rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-400 font-mono"
                  placeholder="RESTORE"
                  value={restoreConfirmText}
                  onChange={e => setRestoreConfirmText(e.target.value)}
                  autoFocus
                  data-testid="input-restore-confirm-text"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <RetroButton
                size="sm"
                variant="secondary"
                onClick={() => { setConfirmRestore(null); setRestoreConfirmText(""); }}
                disabled={restoreMutation.isPending}
              >
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                variant="destructive"
                onClick={handleRestoreConfirm}
                disabled={restoreMutation.isPending || restoreConfirmText !== "RESTORE"}
                data-testid="button-confirm-restore"
              >
                {restoreMutation.isPending ? "Restoring..." : "Restore"}
              </RetroButton>
            </div>
            {restoreMutation.isError && (
              <p className="text-xs text-red-400 mt-2">
                {(restoreMutation.error as Error)?.message ?? "Restore failed"}
              </p>
            )}
          </RetroCard>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8">
          <p className="text-xs text-muted-foreground">Loading save states...</p>
        </div>
      )}

      {!isLoading && (!saveStates || saveStates.length === 0) && (
        <RetroCard className="text-center py-8">
          <Save className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No save states yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Auto-saves are created before each advance. Use "Save Now" for a manual checkpoint.
          </p>
        </RetroCard>
      )}

      {saveStates && saveStates.length > 0 && (
        <div className="space-y-2">
          {saveStates.map((ss) => {
            const isExpanded = expandedId === ss.id;
            const triggerLabel = TRIGGER_LABELS[ss.trigger] ?? ss.trigger;
            const phaseLabel = PHASE_LABELS[ss.phase] ?? ss.phase;
            const rows = totalRows(ss.rowCounts);

            return (
              <RetroCard
                key={ss.id}
                className={
                  ss.trigger === "pre_restore"
                    ? "border-blue-500/30"
                    : ss.trigger === "manual"
                    ? "border-gold/30"
                    : "border-border/50"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          ss.trigger === "manual"
                            ? "bg-gold/20 text-gold"
                            : ss.trigger === "pre_restore"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        {triggerLabel}
                      </span>
                      {ss.restoredAt && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                          RESTORED
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-foreground truncate">{ss.label}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        S{ss.season} W{ss.week} · {phaseLabel}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(ss.createdAt)}
                      </span>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => setExpandedId(isExpanded ? null : ss.id)}
                        data-testid={`button-expand-save-state-${ss.id}`}
                      >
                        <Info className="w-3 h-3" />
                        {rows.toLocaleString()} rows
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                        {Object.entries(ss.rowCounts)
                          .filter(([, n]) => n > 0)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([key, count]) => (
                            <div key={key} className="flex items-center justify-between gap-2">
                              <span className="text-xs text-muted-foreground truncate">{key}</span>
                              <span className="text-xs font-mono text-foreground">{count}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    <RetroButton
                      size="sm"
                      variant="secondary"
                      onClick={() => openConfirmRestore(ss)}
                      disabled={restoreMutation.isPending}
                      data-testid={`button-restore-${ss.id}`}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Restore
                    </RetroButton>
                  </div>
                </div>
              </RetroCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
