import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import type { SimSummary } from "@/components/sim-progress-overlay";
import type { InningScoreboardData } from "@/components/inning-scoreboard";

interface UseCommissionerSimActionsOptions {
  leagueId: string;
  onSeasonComplete: (season: number) => void;
  onShowScoreboard?: (data: InningScoreboardData) => void;
}

export function useCommissionerSimActions({
  leagueId,
  onSeasonComplete,
  onShowScoreboard,
}: UseCommissionerSimActionsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [simSummary, setSimSummary] = useState<SimSummary | null>(null);
  const [showSimOverlay, setShowSimOverlay] = useState(false);
  const [pendingSeasonSummary, setPendingSeasonSummary] = useState<number | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
    queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
    queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
    queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "postseason"] });
    window.dispatchEvent(new CustomEvent("league-phase-changed"));
  };

  const simulateWeekMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/simulate`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "postseason"] });
      window.dispatchEvent(new CustomEvent("league-phase-changed"));
      toast({ title: "Week Simulated", description: "All games have been auto-resolved." });
      if (data?.userTeamGame && onShowScoreboard) {
        onShowScoreboard(data.userTeamGame as InningScoreboardData);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const simToOffseasonMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/sim-to-offseason`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      invalidateAll();
      const hasSimData =
        data?.simSummary &&
        (data.simSummary.weekResults?.length > 0 || data.simSummary.postseasonResults?.length > 0);
      const isOffseasonTransition =
        data?.currentPhase === "offseason_departures" || data?.currentPhase === "offseason";
      if (hasSimData) {
        setSimSummary(data.simSummary);
        setShowSimOverlay(true);
        if (isOffseasonTransition) {
          setPendingSeasonSummary(data?.currentSeason || 1);
        }
      } else {
        toast({
          title: "Season Simulated!",
          description: "The entire season has been simulated. Review player departures before continuing.",
        });
        if (isOffseasonTransition) {
          onSeasonComplete(data?.currentSeason || 1);
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const simToPostseasonMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/sim-to-postseason`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateAll();
      if (
        data?.simSummary &&
        (data.simSummary.weekResults?.length > 0 || data.simSummary.postseasonResults?.length > 0)
      ) {
        setSimSummary(data.simSummary);
        setShowSimOverlay(true);
      } else {
        toast({
          title: "Regular Season Complete!",
          description: "Conference Championships are set. Time for postseason baseball!",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const simToCwsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/sim-to-cws`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateAll();
      if (
        data?.simSummary &&
        (data.simSummary.weekResults?.length > 0 || data.simSummary.postseasonResults?.length > 0)
      ) {
        setSimSummary(data.simSummary);
        setShowSimOverlay(true);
      } else {
        toast({
          title: "College World Series!",
          description: "The final two teams are set for the CWS championship series.",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const simFullSeasonMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/sim-full-season`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/roster`] });
      invalidateAll();
      if (data?.seasonTransition) {
        const t = data.seasonTransition;
        toast({
          title: "Full Season Complete!",
          description: `Season simulated end-to-end. ${t.recruitsAdded ?? 0} recruits signed, ${t.newRecruits ?? 0} new class generated. Welcome to Season ${data.currentSeason}!`,
        });
      } else {
        toast({
          title: "Full Season Simulated",
          description: "The entire season has been simulated through to the next preseason.",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const simToSigningDayMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${leagueId}/sim-to-signing-day`, {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      invalidateAll();
      if (response?.seasonTransition) {
        const t = response.seasonTransition;
        toast({
          title: "Offseason Complete!",
          description: `${t.recruitsAdded} recruits signed, ${t.newRecruits} new class generated. Welcome to Season ${response.currentSeason}!`,
        });
      } else {
        toast({ title: "Offseason Simulated", description: "Fast-forwarded through the offseason." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const backfillScoresMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/backfill-recruiting-scores`, {});
      return res.json() as Promise<{ updated: number; message: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting-scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "dynasty-history"] });
      toast({ title: "Backfill Complete", description: data?.message ?? "Recruiting scores updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Backfill Failed", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const dedupRostersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/admin/dedup-rosters`, {});
      return res.json() as Promise<{ removed: number; log: string[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      const msg =
        data.removed === 0
          ? "No duplicate players found — rosters are clean."
          : `Removed ${data.removed} duplicate player row(s).`;
      toast({ title: "Dedup Complete", description: msg });
    },
    onError: (error: Error) => {
      toast({ title: "Dedup Failed", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const handleSimOverlayClosed = () => {
    setShowSimOverlay(false);
    if (pendingSeasonSummary !== null) {
      onSeasonComplete(pendingSeasonSummary);
      setPendingSeasonSummary(null);
    }
  };

  return {
    simulateWeek: () => simulateWeekMutation.mutate(),
    isSimulating: simulateWeekMutation.isPending,

    simToOffseason: () => simToOffseasonMutation.mutate(),
    isSimToOffseason: simToOffseasonMutation.isPending,

    simToPostseason: () => simToPostseasonMutation.mutate(),
    isSimToPostseason: simToPostseasonMutation.isPending,

    simToCws: () => simToCwsMutation.mutate(),
    isSimToCws: simToCwsMutation.isPending,

    simFullSeason: () => simFullSeasonMutation.mutate(),
    isSimFullSeason: simFullSeasonMutation.isPending,

    simToSigningDay: () => simToSigningDayMutation.mutate(),
    isSimToSigningDay: simToSigningDayMutation.isPending,

    backfillScores: () => backfillScoresMutation.mutate(),
    isBackfilling: backfillScoresMutation.isPending,

    dedupRosters: () => dedupRostersMutation.mutate(),
    isDedupingRosters: dedupRostersMutation.isPending,

    simSummary,
    showSimOverlay,
    handleSimOverlayClosed,
  };
}
