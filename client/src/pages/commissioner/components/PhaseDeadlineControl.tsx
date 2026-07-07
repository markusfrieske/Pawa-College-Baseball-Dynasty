import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, X } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";

const DEADLINE_OPTIONS = [
  { value: "", label: "No deadline" },
  { value: "24h", label: "24 hours" },
  { value: "48h", label: "48 hours" },
  { value: "72h", label: "72 hours" },
  { value: "1w", label: "1 week" },
];

interface PhaseDeadlineControlProps {
  leagueId: string;
  currentDeadline: string | null;
  currentPhase: string;
}

export function PhaseDeadlineControl({
  leagueId,
  currentDeadline,
  currentPhase,
}: PhaseDeadlineControlProps) {
  const [selected, setSelected] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const setDeadlineMutation = useMutation({
    mutationFn: async (duration: string) => {
      return apiRequest("POST", `/api/leagues/${leagueId}/phase-deadline`, { duration: duration || null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      toast({ title: "Deadline Updated" });
      setSelected("");
    },
    onError: (err: unknown) => {
      toast({ title: "Error", description: parseErrorMessage(err as Error), variant: "destructive" });
    },
  });

  const clearDeadlineMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${leagueId}/phase-deadline`, { duration: null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      toast({ title: "Deadline Cleared" });
    },
    onError: (err: unknown) => {
      toast({ title: "Error", description: parseErrorMessage(err as Error), variant: "destructive" });
    },
  });

  const formattedDeadline = currentDeadline
    ? new Date(currentDeadline).toLocaleString()
    : null;

  return (
    <RetroCard>
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gold" />
          Phase Deadline
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Set a deadline for the current phase ({currentPhase}). When the deadline passes, the phase
          advances automatically.
        </p>

        {formattedDeadline && (
          <div className="flex items-center justify-between mb-3 p-2.5 rounded border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <Clock className="w-3 h-3 shrink-0" />
              Deadline: {formattedDeadline}
            </div>
            <RetroButton
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[9px]"
              onClick={() => clearDeadlineMutation.mutate()}
              disabled={clearDeadlineMutation.isPending}
              data-testid="button-clear-deadline"
            >
              <X className="w-2.5 h-2.5" />
            </RetroButton>
          </div>
        )}

        <div className="flex gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="flex-1" data-testid="select-deadline-duration">
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              {DEADLINE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RetroButton
            variant="primary"
            onClick={() => setDeadlineMutation.mutate(selected)}
            disabled={!selected || setDeadlineMutation.isPending}
            loading={setDeadlineMutation.isPending}
            data-testid="button-set-deadline"
          >
            Set
          </RetroButton>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}
