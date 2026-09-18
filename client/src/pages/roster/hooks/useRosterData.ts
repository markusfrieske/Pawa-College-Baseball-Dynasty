import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseErrorMessage } from "@/lib/errorUtils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Player } from "@shared/schema";
import type { RosterData, LeagueQueryData } from "../types";

const DEVELOPMENT_PHASES = new Set([
  "offseason",
  "offseason_departures",
  "offseason_walkons",
  "signing_day",
]);

export function canPlayerDeclareDraft(player: Player): boolean {
  // Match the existing server rule: RS + 4+ stars OR 500+ overall, not already declared.
  const isRedshirt = player.eligibility === "RS";
  const isHighSkill = player.starRating >= 4 || player.overall >= 500;
  const notDeclared = !player.declaredForDraft;
  return isRedshirt && isHighSkill && notDeclared;
}

export interface UseRosterDataOptions {
  onPlayerUpdated?: () => void;
  onDraftDeclared?: () => void;
}

export function useRosterData(
  leagueId: string | undefined,
  viewingTeamId: string | null,
  options: UseRosterDataOptions = {}
) {
  const { onPlayerUpdated, onDraftDeclared } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const rosterUrl = viewingTeamId
    ? `/api/leagues/${leagueId}/roster?teamId=${viewingTeamId}`
    : `/api/leagues/${leagueId}/roster`;

  const { data, isLoading, isError, error, refetch } = useQuery<RosterData>({
    queryKey: [rosterUrl],
  });

  const { data: leagueData } = useQuery<LeagueQueryData>({
    queryKey: ["/api/leagues", leagueId],
  });

  const { data: authData } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const isCommissioner = Boolean(authData?.id && leagueData && (
    leagueData.commissionerId === authData.id ||
    (Array.isArray(leagueData.coCommissionerIds) && leagueData.coCommissionerIds.includes(authData.id))
  ));
  const isOwnTeam = Boolean(authData?.id && data?.team?.id &&
    leagueData?.teams.some(team => team.id === data.team.id && team.coach?.userId === authData.id));

  const hasAnyProgressionData = (data?.players || []).some(
    p => p.progressionDeltas != null && (p.progressionDeltas as any).overall != null
  );
  const canViewDevelopment =
    isOwnTeam &&
    !!leagueData?.progressionEnabled &&
    (DEVELOPMENT_PHASES.has(leagueData?.currentPhase ?? "") || hasAnyProgressionData);

  const updatePlayerMutation = useMutation({
    mutationFn: async (updates: Partial<Player> & { id: string }) => {
      const { id, ...patch } = updates;
      return apiRequest("PATCH", `/api/leagues/${leagueId}/players/${id}`, patch);
    },
    onSuccess: () => {
      toast({ title: "Player updated", description: "Player data has been saved." });
      queryClient.invalidateQueries({ queryKey: [rosterUrl] });
      onPlayerUpdated?.();
    },
    onError: (error: Error) => {
      toast({ title: "Player not saved", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const saveRosterMutation = useMutation({
    mutationFn: async (name: string) => {
      const team = data?.team;
      const players = data?.players || [];
      return apiRequest("POST", `/api/saved-rosters`, {
        name,
        basedOn: team ? `${team.name} (Season ${leagueData?.currentSeason ?? 1})` : "NCAA 2026",
        rosterData: players,
      });
    },
    onSuccess: () => {
      toast({ title: "Roster Saved", description: `Roster file saved to your dashboard.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save roster file.", variant: "destructive" });
    },
  });

  const setCaptainMutation = useMutation({
    mutationFn: async ({ playerId, action }: { playerId: string; action: "set" | "clear" }) => {
      const teamId = data?.team?.id;
      if (!teamId) throw new Error("No team");
      return apiRequest("POST", `/api/leagues/${leagueId}/teams/${teamId}/captain`, { playerId, action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [rosterUrl] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update captain.", variant: "destructive" });
    },
  });

  const declareDraftMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await apiRequest("POST", `/api/leagues/${leagueId}/players/${playerId}/declare-draft`, {});
      return response.json() as Promise<{ message: string }>;
    },
    onSuccess: (result) => {
      toast({ title: "Draft Declaration", description: result.message });
      queryClient.invalidateQueries({ queryKey: [rosterUrl] });
      onDraftDeclared?.();
    },
    onError: (error: Error) => {
      toast({ title: "Cannot Declare", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  return {
    rosterUrl,
    data,
    isLoading,
    isError,
    error,
    refetch,
    leagueData,
    authData,
    isCommissioner,
    isOwnTeam,
    canViewDevelopment,
    updatePlayerMutation,
    saveRosterMutation,
    setCaptainMutation,
    declareDraftMutation,
  };
}
