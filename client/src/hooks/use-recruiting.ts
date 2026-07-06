import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parseErrorMessage } from "@/lib/errorUtils";
import type { Recruit, RecruitingInterest, Team, LastSeasonStats } from "@shared/schema";
import type { RecruitRecommendation, RecruitingRecommendationsData } from "@/lib/recruitingUtils";

export interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
  topSchools?: { teamId: string; teamName: string; abbreviation: string; primaryColor: string; interestLevel: number; previousInterestLevel?: number | null }[];
  signedTeamName?: string | null;
  signedTeamAbbreviation?: string | null;
  signedTeamPrimaryColor?: string | null;
  signedTeamSecondaryColor?: string | null;
  competingCount?: number | null;
  competingIntensity?: string | null;
  teamsIn?: number | null;
  offersOut?: number | null;
  signingDayLockedFields?: string[] | null;
  lastSeasonStats?: LastSeasonStats | null;
}

export interface AutoPilotAlertEntry {
  recruitName: string;
  recruitStars: number;
  action: string;
  interestGain: number;
  week: number;
  season: number;
  isDeadlineForced: boolean;
}

export interface RecruitingData {
  recruits: RecruitWithInterest[];
  team: Team;
  remainingPoints: number;
  maxPoints: number;
  pointsUsed: number;
  remainingScoutPoints: number;
  maxScoutPoints: number;
  scoutPointsUsed: number;
  recruitPointCosts: Record<string, { visit: number; headCoachVisit: number }>;
  targetedCount: number;
  commitsCount: number;
  maxCommits: number;
  rosterDepth: Record<string, number>;
  rosterSize: number;
  nextYearDepth: Record<string, number>;
  nextYearRosterSize: number;
  seniorsGraduating: number;
  premiumActionsUsed: Record<string, string[]>;
  weeklyActionsUsed: Record<string, string[]>;
  weeklyActionsWeek?: number;
  weeklyActionsSeason?: number;
  seasonVisitCount: { total: number; campusVisits: number; hcVisits: number };
  autoPilotPendingAlert: AutoPilotAlertEntry[];
}

export interface PipelineData {
  pipeline: { cold: number; cool: number; warm: number; hot: number; very_hot: number; on_fire: number; committed: number; home_state: number; home_region: number };
  positionNeeds: { position: string; current: number; graduating: number; need: boolean }[];
  totalTargeted: number;
  rosterSize: number;
  teamState: string;
  totalClassSize: number;
  teamCount: number;
}

export interface TrendsData {
  trends: Record<string, { trend: "up" | "down" | "flat"; recentGain: number }>;
}

export interface LeagueData {
  id: string;
  currentWeek: number;
  currentSeason: number;
  currentPhase?: string;
  progressionEnabled?: boolean;
}

export interface ClassRankingSnapshot {
  id: string;
  teamId: string;
  season: number;
  classRank: number;
  classScore: number;
  totalCommits: number;
  fiveStars: number;
  fourStars: number;
  avgOverall: number;
  avgStarRating: number;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  isCpu: boolean;
}

export interface ClassRankingsData {
  season: number;
  snapshots: ClassRankingSnapshot[];
}

export interface StorylinesData {
  storylines: Array<{ recruitId: string }>;
}

export interface RecruitingHistoryAction {
  id: string;
  recruitId: string;
  teamId: string;
  leagueId: string;
  week: number;
  season: number;
  actionType: string;
  interestChange: number;
  notes: string | null;
  isAutoPilot: boolean;
  createdAt: string;
  recruitName: string;
  recruitPosition: string;
  recruitStarRating: number;
}

export interface RecruitingHistoryData {
  actions: RecruitingHistoryAction[];
}

export interface WeekRecapEntry {
  recruitId: string;
  name: string;
  position: string;
  starRating: number;
  otherTeamActionCount: number;
  activityLevel: string;
}

export interface WeekRecapData {
  season: number;
  week: number;
  myRecruits: WeekRecapEntry[];
  hotMissed: WeekRecapEntry[];
}

export interface DecommitAlert {
  id: string;
  description: string;
  week: number;
  season: number;
  metadata?: { recruitId?: string; alertType?: string } | null;
}

export interface AutoPilotLogEntry {
  week: number;
  season: number;
  isForced: boolean;
  read?: boolean;
  summary: {
    emails: number;
    phones: number;
    visits: number;
    hcVisits: number;
    offers: number;
    scoutingDone: number;
    recruitsTargeted: { name: string; position: string; stars: number; action: string }[];
  };
}

export interface AutoPilotLogData {
  log: AutoPilotLogEntry[];
}

export type { RecruitRecommendation, RecruitingRecommendationsData };

export function useRecruitingData(leagueId: string) {
  const dataQuery = useQuery<RecruitingData>({
    queryKey: ["/api/leagues", leagueId, "recruiting"],
  });

  const pipelineQuery = useQuery<PipelineData>({
    queryKey: ["/api/leagues", leagueId, "recruiting", "pipeline"],
    staleTime: 30_000,
  });

  const trendsQuery = useQuery<TrendsData>({
    queryKey: ["/api/leagues", leagueId, "recruiting", "trends"],
    staleTime: 30_000,
  });

  const leagueQuery = useQuery<LeagueData>({
    queryKey: ["/api/leagues", leagueId],
  });

  const recommendationsQuery = useQuery<RecruitingRecommendationsData>({
    queryKey: ["/api/leagues", leagueId, "recruiting", "recommendations", leagueQuery.data?.currentWeek, leagueQuery.data?.currentSeason],
    staleTime: 30_000,
  });

  const isPostSigningDay = ["offseason_walkons", "preseason", "spring_training", "regular_season", "conference_championship", "super_regionals", "cws", "offseason"].includes(leagueQuery.data?.currentPhase ?? "");

  const classRankingsQuery = useQuery<ClassRankingsData>({
    queryKey: [`/api/leagues/${leagueId}/class-rankings?season=${leagueQuery.data?.currentSeason ?? 1}`],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/class-rankings?season=${leagueQuery.data?.currentSeason ?? 1}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!leagueId && !!leagueQuery.data && isPostSigningDay,
    staleTime: 60000,
  });

  const storylinesQuery = useQuery<StorylinesData>({
    queryKey: ["/api/leagues", leagueId, "storylines"],
    staleTime: 60000,
  });

  const historyQuery = useQuery<RecruitingHistoryData>({
    queryKey: ["/api/leagues", leagueId, "recruiting-history"],
    staleTime: 60_000,
  });

  const hasPriorWeek = (leagueQuery.data?.currentWeek ?? 1) > 1;
  const recapWeek = hasPriorWeek ? (leagueQuery.data!.currentWeek - 1) : 0;
  const recapSeason = leagueQuery.data?.currentSeason ?? 1;

  const weekRecapQuery = useQuery<WeekRecapData>({
    queryKey: ["/api/leagues", leagueId, "recruiting", "weekly-recap", recapSeason, recapWeek],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/recruiting/weekly-recap?season=${recapSeason}&week=${recapWeek}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch recap");
      return res.json();
    },
    enabled: !!leagueId && !!leagueQuery.data && hasPriorWeek,
  });

  const decommitAlertsQuery = useQuery<DecommitAlert[]>({
    queryKey: ["/api/leagues", leagueId, "decommit-alerts", dataQuery.data?.team?.id],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/decommit-alerts?teamId=${dataQuery.data?.team?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!leagueId && !!dataQuery.data?.team?.id,
    staleTime: 30000,
  });

  const autoPilotLogQuery = useQuery<AutoPilotLogData>({
    queryKey: ["/api/leagues", leagueId, "my-team/auto-pilot-log"],
    enabled: !!leagueId,
    staleTime: 30000,
  });

  return {
    recruitingData: dataQuery,
    pipelineData: pipelineQuery,
    trendsData: trendsQuery,
    leagueData: leagueQuery,
    recommendationsData: recommendationsQuery,
    classRankingsData: classRankingsQuery,
    storylinesData: storylinesQuery,
    historyData: historyQuery,
    weekRecapData: weekRecapQuery,
    decommitAlertsData: decommitAlertsQuery,
    autoPilotLogData: autoPilotLogQuery,
    isPostSigningDay,
    recapWeek,
    recapSeason,
    hasPriorWeek,
  };
}

export function useRecruitingActions(leagueId: string, currentWeek?: number, currentSeason?: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clearAutoPilotAlert = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leagues/${leagueId}/recruiting/clear-autopilot-alert`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
    },
  });

  const dismissAutoPilotLog = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/my-team/auto-pilot-log/dismiss`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "my-team/auto-pilot-log"] });
    },
  });

  const saveClass = useMutation({
    mutationFn: async ({ name, description, recruitCount, classData }: { name: string; description: string | null; recruitCount: number; classData: any[] }) => {
      return apiRequest("POST", `/api/saved-recruiting-classes`, {
        name,
        description,
        recruitCount,
        classData,
      });
    },
    onSuccess: () => {
      toast({ title: "Class Saved", description: "Recruiting class saved to your dashboard." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save recruiting class.", variant: "destructive" });
    },
  });

  const scout = useMutation({
    mutationFn: async (recruitId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/${recruitId}/scout`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting", "recommendations"] });
    },
  });

  const target = useMutation({
    mutationFn: async (recruitId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/${recruitId}/target`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting", "pipeline"] });
    },
  });

  const saveNotes = useMutation({
    mutationFn: async ({ recruitId, notes }: { recruitId: string; notes: string }) => {
      return apiRequest("PATCH", `/api/leagues/${leagueId}/recruiting/${recruitId}/notes`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      toast({ title: "Notes saved", description: "Your notes have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const setBoardRank = useMutation({
    mutationFn: async ({ recruitId, boardRank }: { recruitId: string; boardRank: number | null }) => {
      return apiRequest("PATCH", `/api/leagues/${leagueId}/recruiting/${recruitId}/board-rank`, { boardRank });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const phone = useMutation({
    mutationFn: async ({ recruitId, pitchTopic }: { recruitId: string; pitchTopic?: string }) => {
      const pitchTopics = pitchTopic ? pitchTopic.split(",") : undefined;
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/${recruitId}/phone`, { pitchTopics });
      return await res.json();
    },
    onSuccess: (_data: any, variables: { recruitId: string; pitchTopic?: string }) => {
      queryClient.setQueryData(["/api/leagues", leagueId, "recruiting"], (old: any) => {
        if (!old) return old;
        const weeklyActionsUsed = { ...old.weeklyActionsUsed };
        if (!weeklyActionsUsed[variables.recruitId]) weeklyActionsUsed[variables.recruitId] = [];
        if (!weeklyActionsUsed[variables.recruitId].includes("phone")) {
          weeklyActionsUsed[variables.recruitId] = [...weeklyActionsUsed[variables.recruitId], "phone"];
        }
        return {
          ...old,
          weeklyActionsUsed,
          weeklyActionsWeek: currentWeek ?? old.weeklyActionsWeek,
          weeklyActionsSeason: currentSeason ?? old.weeklyActionsSeason,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting", "recommendations"] });
    },
  });

  const email = useMutation({
    mutationFn: async ({ recruitId, pitchTopic }: { recruitId: string; pitchTopic?: string }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/${recruitId}/email`, { pitchTopic });
      return await res.json();
    },
    onSuccess: (_data: any, variables: { recruitId: string; pitchTopic?: string }) => {
      queryClient.setQueryData(["/api/leagues", leagueId, "recruiting"], (old: any) => {
        if (!old) return old;
        const weeklyActionsUsed = { ...old.weeklyActionsUsed };
        if (!weeklyActionsUsed[variables.recruitId]) weeklyActionsUsed[variables.recruitId] = [];
        if (!weeklyActionsUsed[variables.recruitId].includes("email")) {
          weeklyActionsUsed[variables.recruitId] = [...weeklyActionsUsed[variables.recruitId], "email"];
        }
        return {
          ...old,
          weeklyActionsUsed,
          weeklyActionsWeek: currentWeek ?? old.weeklyActionsWeek,
          weeklyActionsSeason: currentSeason ?? old.weeklyActionsSeason,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting", "recommendations"] });
    },
  });

  const visit = useMutation({
    mutationFn: async (recruitId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/${recruitId}/visit`, {});
      return await res.json();
    },
    onSuccess: (_data: any, recruitId: string) => {
      queryClient.setQueryData(["/api/leagues", leagueId, "recruiting"], (old: any) => {
        if (!old) return old;
        const premiumActionsUsed = { ...old.premiumActionsUsed };
        if (!premiumActionsUsed[recruitId]) premiumActionsUsed[recruitId] = [];
        if (!premiumActionsUsed[recruitId].includes("visit")) {
          premiumActionsUsed[recruitId] = [...premiumActionsUsed[recruitId], "visit"];
        }
        return {
          ...old,
          premiumActionsUsed,
          seasonVisitCount: {
            ...old.seasonVisitCount,
            total: (old.seasonVisitCount?.total ?? 0) + 1,
            campusVisits: (old.seasonVisitCount?.campusVisits ?? 0) + 1,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting", "recommendations"] });
    },
  });

  const headCoachVisit = useMutation({
    mutationFn: async (recruitId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/${recruitId}/head-coach-visit`, {});
      return await res.json();
    },
    onSuccess: (_data: any, recruitId: string) => {
      queryClient.setQueryData(["/api/leagues", leagueId, "recruiting"], (old: any) => {
        if (!old) return old;
        const premiumActionsUsed = { ...old.premiumActionsUsed };
        if (!premiumActionsUsed[recruitId]) premiumActionsUsed[recruitId] = [];
        if (!premiumActionsUsed[recruitId].includes("head_coach_visit")) {
          premiumActionsUsed[recruitId] = [...premiumActionsUsed[recruitId], "head_coach_visit"];
        }
        return {
          ...old,
          premiumActionsUsed,
          seasonVisitCount: {
            ...old.seasonVisitCount,
            total: (old.seasonVisitCount?.total ?? 0) + 1,
            hcVisits: (old.seasonVisitCount?.hcVisits ?? 0) + 1,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting", "recommendations"] });
    },
  });

  const offer = useMutation({
    mutationFn: async (recruitId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/${recruitId}/offer`, {});
      return await res.json();
    },
    onSuccess: (_data: any, recruitId: string) => {
      queryClient.setQueryData(["/api/leagues", leagueId, "recruiting"], (old: any) => {
        if (!old) return old;
        const recruits = old.recruits.map((r: any) =>
          r.id === recruitId
            ? { ...r, interest: r.interest ? { ...r.interest, hasOffer: true } : { hasOffer: true } }
            : r
        );
        return { ...old, recruits };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting", "recommendations"] });
    },
  });

  return {
    clearAutoPilotAlert,
    dismissAutoPilotLog,
    saveClass,
    scout,
    target,
    saveNotes,
    setBoardRank,
    phone,
    email,
    visit,
    headCoachVisit,
    offer,
  };
}
