import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2 } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import type { HumanCoach, CommissionerData } from "../types";

interface TransferCommissionerSectionProps {
  leagueId: string;
}

export function TransferCommissionerSection({ leagueId }: TransferCommissionerSectionProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: commData } = useQuery<CommissionerData>({
    queryKey: ["/api/leagues", leagueId, "commissioner"],
  });

  const { data: currentUser } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const transferMutation = useMutation({
    mutationFn: async (newUserId: string) => {
      const res = await apiRequest("PATCH", `/api/leagues/${leagueId}/commissioner`, { newUserId });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      toast({
        title: "Commissioner Role Transferred",
        description: "The selected coach is now the commissioner of this dynasty.",
      });
      setSelectedUserId("");
      setConfirmOpen(false);
    },
    onError: (err: unknown) => {
      toast({ title: "Transfer Failed", description: parseErrorMessage(err as Error), variant: "destructive" });
      setConfirmOpen(false);
    },
  });

  const isPrimary = !!currentUser && currentUser.id === commData?.league?.commissionerId;

  const eligibleCoaches: HumanCoach[] = (commData?.humanCoaches ?? []).filter(
    (c) => c.userId !== commData?.league?.commissionerId,
  );

  const selectedCoach = eligibleCoaches.find((c) => c.userId === selectedUserId);

  if (!isPrimary) return null;

  return (
    <>
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-gold" />
            Transfer Commissioner Role
          </div>
        </RetroCardHeader>
        <RetroCardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Permanently transfer commissioner authority to another coach in the dynasty. This action cannot be undone.
          </p>

          {eligibleCoaches.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No other human coaches are available to receive the commissioner role.
            </p>
          ) : (
            <div className="flex gap-2">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="flex-1" data-testid="select-transfer-commissioner-target">
                  <SelectValue placeholder="Select a coach" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleCoaches.map((c) => (
                    <SelectItem key={c.userId} value={c.userId}>
                      {c.firstName} {c.lastName}
                      {c.teamName ? ` (${c.teamName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RetroButton
                variant="destructive"
                disabled={!selectedUserId || transferMutation.isPending}
                loading={transferMutation.isPending}
                onClick={() => setConfirmOpen(true)}
                data-testid="button-transfer-commissioner-open"
              >
                Transfer
              </RetroButton>
            </div>
          )}
        </RetroCardContent>
      </RetroCard>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-gold text-sm">
              Transfer Commissioner Role?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to make{" "}
              <strong>
                {selectedCoach?.firstName} {selectedCoach?.lastName}
              </strong>{" "}
              the new commissioner. You will lose all commissioner privileges. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUserId && transferMutation.mutate(selectedUserId)}
              disabled={transferMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-confirm-transfer-commissioner"
            >
              {transferMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Confirm Transfer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
