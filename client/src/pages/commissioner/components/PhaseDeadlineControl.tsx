import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, X } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";

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
  const [deadlineInput, setDeadlineInput] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const setDeadlineMutation = useMutation({
    mutationFn: async (deadline: string | null) => {
      return apiRequest("PATCH", `/api/leagues/${leagueId}/deadline`, { deadline });
    },
    onSuccess: (_data, deadline) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "ready-status"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      if (deadline) {
        toast({ title: "Deadline Set" });
        setDeadlineInput("");
      } else {
        toast({ title: "Deadline Cleared" });
      }
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
              onClick={() => setDeadlineMutation.mutate(null)}
              disabled={setDeadlineMutation.isPending}
              data-testid="button-clear-deadline"
            >
              <X className="w-2.5 h-2.5" />
            </RetroButton>
          </div>
        )}

        <div className="flex gap-2">
          <RetroInput
            type="datetime-local"
            value={deadlineInput}
            onChange={(e) => setDeadlineInput(e.target.value)}
            className="flex-1 text-xs"
            data-testid="input-deadline-datetime"
          />
          <RetroButton
            variant="primary"
            onClick={() =>
              setDeadlineMutation.mutate(deadlineInput ? new Date(deadlineInput).toISOString() : null)
            }
            disabled={!deadlineInput || setDeadlineMutation.isPending}
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
