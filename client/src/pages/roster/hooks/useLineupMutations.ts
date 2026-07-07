import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useLineupMutations(leagueId: string | undefined, rosterUrl: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateRoster = () => {
    if (rosterUrl) queryClient.invalidateQueries({ queryKey: [rosterUrl] });
  };

  const depthOrderMutation = useMutation({
    mutationFn: async (orders: { playerId: string; depthOrder: number }[]) => {
      return apiRequest("PUT", `/api/leagues/${leagueId}/depth-chart`, { orders });
    },
    onSuccess: invalidateRoster,
    onError: () => {
      toast({ title: "Error", description: "Failed to save depth chart order", variant: "destructive" });
    },
  });

  const battingOrderMutation = useMutation({
    mutationFn: async (orders: { playerId: string; battingOrder: number | null }[]) => {
      return apiRequest("PUT", `/api/leagues/${leagueId}/batting-order`, { orders });
    },
    onSuccess: invalidateRoster,
    onError: () => {
      toast({ title: "Error", description: "Failed to save batting order", variant: "destructive" });
    },
  });

  const pitchingRoleMutation = useMutation({
    mutationFn: async (assignments: { playerId: string; pitchingRole: string | null }[]) => {
      return apiRequest("PUT", `/api/leagues/${leagueId}/pitching-roles`, { assignments });
    },
    onSuccess: invalidateRoster,
    onError: () => {
      toast({ title: "Error", description: "Failed to save pitching roles", variant: "destructive" });
    },
  });

  const autoLineupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${leagueId}/auto-lineup`);
    },
    onSuccess: () => {
      invalidateRoster();
      toast({ title: "Lineup Set", description: "Batting order, rotation, and bullpen have been automatically assigned." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to auto-set lineup", variant: "destructive" });
    },
  });

  const lineupPositionMutation = useMutation({
    mutationFn: async (assignments: { playerId: string; lineupPosition: string | null }[]) => {
      return apiRequest("PUT", `/api/leagues/${leagueId}/lineup-position`, { assignments });
    },
    onSuccess: invalidateRoster,
    onError: () => {
      toast({ title: "Error", description: "Failed to save defensive position", variant: "destructive" });
    },
  });

  return {
    depthOrderMutation,
    battingOrderMutation,
    pitchingRoleMutation,
    autoLineupMutation,
    lineupPositionMutation,
  };
}
