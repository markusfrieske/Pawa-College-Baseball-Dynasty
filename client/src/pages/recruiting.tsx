import { useState, useEffect, useCallback, useRef } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroSelect } from "@/components/ui/retro-select";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { PositionBadge } from "@/components/ui/position-badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPotentialRangeLabel, getDevTraitGrade } from "@shared/potential";
import { 
  ArrowLeft, 
  Target, 
  Search, 
  Eye, 
  Phone, 
  Mail, 
  MapPin,
  GraduationCap,
  DollarSign,
  HelpCircle,
  Check,
  Users,
  AlertTriangle,
  CheckCircle,
  StickyNote,
  X,
  Save,
  Bookmark,
  Trash2,
  Gem,
  XCircle,
  CheckSquare,
  Square,
  Gift,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  ChevronDown,
  ChevronUp,
  History,
  Star,
  Skull,
  Crown,
  Building2,
  Flame,
  Telescope,
  Zap,
  Filter,
  MoreHorizontal,
  Trophy,
  Lock,
  BookOpen,
  Scale,
  Wind,
  ShieldCheck,
  Gauge,
  Shuffle,
  AlertOctagon,
  Sprout,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RetroInput } from "@/components/ui/retro-input";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface FilterPreset {
  id: string;
  name: string;
  position: string;
  star: string;
  state?: string;
  type?: string;
  sort: string;
}
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Recruit, RecruitingInterest, Team } from "@shared/schema";
import { getAbilityByName } from "@shared/abilities";
import { TRAJECTORY_LABELS } from "@shared/trajectory";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PitchMixDial } from "@/components/ui/pitch-mix-dial";
import { LetterGrade } from "@/components/ui/letter-grade";
import { velocityToMPH } from "@/lib/playerUtils";

function getInterestLabel(level: number): { label: string; color: string } {
  if (level >= 90) return { label: "On Fire", color: "text-red-400" };
  if (level >= 70) return { label: "Very Hot", color: "text-orange-400" };
  if (level >= 50) return { label: "Hot", color: "text-yellow-400" };
  if (level >= 30) return { label: "Warm", color: "text-green-400" };
  if (level >= 15) return { label: "Cool", color: "text-blue-400" };
  return { label: "Cold", color: "text-blue-300" };
}

function getInterestBarColor(level: number): string {
  if (level >= 90) return "bg-red-400";
  if (level >= 70) return "bg-orange-400";
  if (level >= 50) return "bg-yellow-400";
  if (level >= 30) return "bg-green-400";
  if (level >= 15) return "bg-blue-400";
  return "bg-blue-300";
}

function getInterestChangeLabel(change: number): { label: string; color: string } {
  if (change >= 15) return { label: "Big Boost", color: "text-green-400" };
  if (change >= 8) return { label: "Good Progress", color: "text-green-400" };
  if (change >= 3) return { label: "Some Interest", color: "text-yellow-400" };
  return { label: "Slight Interest", color: "text-blue-400" };
}

interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
  topSchools?: { teamId: string; teamName: string; abbreviation: string; primaryColor: string; interestLevel: number }[];
  signedTeamName?: string | null;
  signedTeamAbbreviation?: string | null;
  signedTeamPrimaryColor?: string | null;
  signedTeamSecondaryColor?: string | null;
  competingCount?: number | null;
  competingIntensity?: string | null;
  teamsIn?: number | null;
  offersOut?: number | null;
  // Fields locked until signing day reveal (last 35% of scoutingOrder)
  signingDayLockedFields?: string[] | null;
}

interface RecruitingData {
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
}

const positionOptions = [
  { value: "all", label: "All Positions" },
  { value: "P", label: "Pitcher" },
  { value: "C", label: "Catcher" },
  { value: "1B", label: "First Base" },
  { value: "2B", label: "Second Base" },
  { value: "SS", label: "Shortstop" },
  { value: "3B", label: "Third Base" },
  { value: "OF", label: "Outfield (OF)" },
];

const starOptions = [
  { value: "all", label: "All Stars" },
  { value: "5", label: "5 Star" },
  { value: "4", label: "4+ Star" },
  { value: "3", label: "3+ Star" },
];

const sortOptions = [
  { value: "boardRank", label: "My Board Rank" },
  { value: "classRank", label: "Class Rank" },
  { value: "positionRank", label: "Position Rank" },
  { value: "overall", label: "Overall (High to Low)" },
  { value: "starRank", label: "Star Rating" },
  { value: "name", label: "Name (A-Z)" },
  { value: "state", label: "Home State" },
  { value: "scoutPriority", label: "Scout Priority (Targeted First)" },
  { value: "interest", label: "Interest Level" },
  { value: "myInterest", label: "Interest in You (High to Low)" },
  { value: "trendUp", label: "Rising Interest First" },
  { value: "competition", label: "Most Contested First" },
];

export default function RecruitingPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedRecruit, setSelectedRecruit] = useState<RecruitWithInterest | null>(null);

  const storedFiltersRef = useRef<Record<string, unknown> | null>(null);
  if (storedFiltersRef.current === null) {
    try {
      const raw = localStorage.getItem(`recruiting-filters-${id}`);
      storedFiltersRef.current = raw ? JSON.parse(raw) : {};
    } catch {
      storedFiltersRef.current = {};
    }
  }
  const sf = storedFiltersRef.current;

  const skipPersistRef = useRef(false);

  const [positionFilter, setPositionFilter] = useState<string>((sf.positionFilter as string) ?? "all");
  const [starFilter, setStarFilter] = useState<string>((sf.starFilter as string) ?? "all");
  const [stateFilter, setStateFilter] = useState<string>((sf.stateFilter as string) ?? "all");
  const [typeFilter, setTypeFilter] = useState<string>((sf.typeFilter as string) ?? "all");
  const [sortBy, setSortBy] = useState<string>((sf.sortBy as string) ?? "classRank");
  const [showTeamNeeds, setShowTeamNeeds] = useState<boolean>((sf.showTeamNeeds as boolean) ?? false);
  const [showPipeline, setShowPipeline] = useState<boolean>((sf.showPipeline as boolean) ?? false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState<boolean>((sf.showWatchlistOnly as boolean) ?? false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
    const saved = localStorage.getItem(`recruiting-presets-${id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [newPresetName, setNewPresetName] = useState("");
  const [compareRecruits, setCompareRecruits] = useState<RecruitWithInterest[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>((sf.searchQuery as string) ?? "");
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showTopAvailable, setShowTopAvailable] = useState<boolean>((sf.showTopAvailable as boolean) ?? false);
  const [showContested, setShowContested] = useState<boolean>((sf.showContested as boolean) ?? false);
  const [showStory, setShowStory] = useState<boolean>((sf.showStory as boolean) ?? false);
  const [showHistory, setShowHistory] = useState(false);
  const [actionResultModal, setActionResultModal] = useState<{
    title: string;
    description: string;
    type: "success" | "error";
    icon?: "check" | "phone" | "email" | "visit" | "coach" | "offer" | "scout";
  } | null>(null);
  const [showSaveClassDialog, setShowSaveClassDialog] = useState(false);
  const [saveClassName, setSaveClassName] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedRecruit(null);
        setShowCompareModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    localStorage.setItem(`recruiting-filters-${id}`, JSON.stringify({
      positionFilter,
      starFilter,
      stateFilter,
      typeFilter,
      sortBy,
      showTeamNeeds,
      showPipeline,
      showWatchlistOnly,
      showTopAvailable,
      showContested,
      showStory,
      searchQuery,
    }));
  }, [id, positionFilter, starFilter, stateFilter, typeFilter, sortBy, showTeamNeeds, showPipeline, showWatchlistOnly, showTopAvailable, showContested, showStory, searchQuery]);

  const toggleCompare = (recruit: RecruitWithInterest) => {
    if (compareRecruits.find(r => r.id === recruit.id)) {
      setCompareRecruits(compareRecruits.filter(r => r.id !== recruit.id));
    } else if (compareRecruits.length < 3) {
      setCompareRecruits([...compareRecruits, recruit]);
    } else {
      toast({ title: "Compare limit", description: "You can only compare up to 3 recruits at a time." });
    }
  };
  const queryClient = useQueryClient();

  const savePreset = () => {
    if (!newPresetName.trim()) return;
    const preset: FilterPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      position: positionFilter,
      star: starFilter,
      state: stateFilter,
      type: typeFilter,
      sort: sortBy,
    };
    const updated = [...filterPresets, preset];
    setFilterPresets(updated);
    localStorage.setItem(`recruiting-presets-${id}`, JSON.stringify(updated));
    setNewPresetName("");
    toast({ title: "Preset saved", description: `"${preset.name}" has been saved.` });
  };

  const loadPreset = (preset: FilterPreset) => {
    setPositionFilter(preset.position);
    setStateFilter(preset.state || "all");
    setTypeFilter(preset.type || "all");
    setStarFilter(preset.star);
    setSortBy(preset.sort);
    toast({ title: "Preset loaded", description: `Applied "${preset.name}" filters.` });
  };

  const deletePreset = (presetId: string) => {
    const updated = filterPresets.filter(p => p.id !== presetId);
    setFilterPresets(updated);
    localStorage.setItem(`recruiting-presets-${id}`, JSON.stringify(updated));
  };

  const { data, isLoading } = useQuery<RecruitingData>({
    queryKey: ["/api/leagues", id, "recruiting"],
  });

  const { data: pipelineData } = useQuery<{
    pipeline: { cold: number; cool: number; warm: number; hot: number; very_hot: number; on_fire: number; committed: number; home_state: number; home_region: number };
    positionNeeds: { position: string; current: number; graduating: number; need: boolean }[];
    totalTargeted: number;
    rosterSize: number;
    teamState: string;
    totalClassSize: number;
    teamCount: number;
  }>({
    queryKey: ["/api/leagues", id, "recruiting", "pipeline"],
  });

  const { data: trendsData } = useQuery<{
    trends: Record<string, { trend: "up" | "down" | "flat"; recentGain: number }>;
  }>({
    queryKey: ["/api/leagues", id, "recruiting", "trends"],
  });

  const { data: leagueData } = useQuery<{ id: string; currentWeek: number; currentSeason: number; currentPhase?: string; progressionEnabled?: boolean }>({
    queryKey: ["/api/leagues", id],
  });

  const isPostSigningDay = ["offseason_walkons", "preseason", "spring_training", "regular_season", "conference_championship", "super_regionals", "cws", "offseason"].includes(leagueData?.currentPhase ?? "");
  const { data: classRankingsData } = useQuery<{
    season: number;
    snapshots: {
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
    }[];
  }>({
    queryKey: [`/api/leagues/${id}/class-rankings?season=${leagueData?.currentSeason ?? 1}`],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/class-rankings?season=${leagueData?.currentSeason ?? 1}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id && !!leagueData && isPostSigningDay,
    staleTime: 60000,
  });

  const [showClassRankings, setShowClassRankings] = useState(true);

  const { data: storylinesData } = useQuery<{ storylines: Array<{ recruitId: string }> }>({
    queryKey: ["/api/leagues", id, "storylines"],
    staleTime: 60000,
  });
  const storylineRecruitIds = new Set((storylinesData?.storylines ?? []).map(s => s.recruitId));

  const { data: historyData } = useQuery<{
    actions: Array<{
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
    }>;
  }>({
    queryKey: ["/api/leagues", id, "recruiting-history"],
  });

  interface WeekRecapEntry {
    recruitId: string;
    name: string;
    position: string;
    starRating: number;
    otherTeamActionCount: number;
    activityLevel: string;
  }
  interface WeekRecapData {
    season: number;
    week: number;
    myRecruits: WeekRecapEntry[];
    hotMissed: WeekRecapEntry[];
  }
  const hasPriorWeek = (leagueData?.currentWeek ?? 1) > 1;
  const recapWeek = hasPriorWeek ? (leagueData!.currentWeek - 1) : 0;
  const recapSeason = leagueData?.currentSeason ?? 1;
  const { data: weekRecapData } = useQuery<WeekRecapData>({
    queryKey: ["/api/leagues", id, "recruiting", "weekly-recap", recapSeason, recapWeek],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/recruiting/weekly-recap?season=${recapSeason}&week=${recapWeek}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch recap");
      return res.json();
    },
    enabled: !!id && !!leagueData && hasPriorWeek,
  });

  const recapDismissKey = leagueData ? `recap-dismissed-${id}-${recapSeason}-${recapWeek}` : null;
  const [recapDismissed, setRecapDismissed] = useState(false);
  useEffect(() => {
    if (!recapDismissKey) return;
    setRecapDismissed(localStorage.getItem(recapDismissKey) === "1");
  }, [recapDismissKey]);
  const [showRecap, setShowRecap] = useState(false);
  const dismissRecap = () => {
    if (!recapDismissKey) return;
    localStorage.setItem(recapDismissKey, "1");
    setRecapDismissed(true);
  };

  const { data: decommitAlerts } = useQuery<{ id: string; description: string; week: number; season: number; metadata?: { recruitId?: string; alertType?: string } | null }[]>({
    queryKey: ["/api/leagues", id, "decommit-alerts", data?.team?.id],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/decommit-alerts?teamId=${data?.team?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id && !!data?.team?.id,
    staleTime: 30000,
  });

  const [dismissedDecommits, setDismissedDecommits] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`decommit-dismissed-${id}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`decommit-dismissed-${id}`);
      setDismissedDecommits(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch { setDismissedDecommits(new Set()); }
  }, [id]);
  const dismissDecommit = (eventId: string) => {
    const updated = new Set([...dismissedDecommits, eventId]);
    setDismissedDecommits(updated);
    localStorage.setItem(`decommit-dismissed-${id}`, JSON.stringify([...updated]));
  };
  const currentWeek = leagueData?.currentWeek ?? 1;
  const visibleDecommits = (decommitAlerts ?? []).filter(e =>
    !dismissedDecommits.has(e.id) && e.week >= currentWeek - 1
  );

  const saveClassMutation = useMutation({
    mutationFn: async (name: string) => {
      const recruits = data?.recruits || [];
      return apiRequest("POST", `/api/saved-recruiting-classes`, {
        name,
        description: data?.team?.name || null,
        recruitCount: recruits.length,
        classData: recruits,
      });
    },
    onSuccess: () => {
      toast({ title: "Class Saved", description: "Recruiting class saved to your dashboard." });
      setShowSaveClassDialog(false);
      setSaveClassName("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save recruiting class.", variant: "destructive" });
    },
  });

  const scoutMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/scout`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      setActionResultModal({ title: "Scouting Complete", description: "New attributes revealed!", type: "success", icon: "scout" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Scouting Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const targetMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/target`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      setActionResultModal({ title: "Recruit Targeted", description: "Added to your target list.", type: "success", icon: "check" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Error", description: parseErrorMessage(error), type: "error" });
    },
  });

  const notesMutation = useMutation({
    mutationFn: async ({ recruitId, notes }: { recruitId: string; notes: string }) => {
      return apiRequest("PATCH", `/api/leagues/${id}/recruiting/${recruitId}/notes`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      toast({ title: "Notes saved", description: "Your notes have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const boardRankMutation = useMutation({
    mutationFn: async ({ recruitId, boardRank }: { recruitId: string; boardRank: number | null }) => {
      return apiRequest("PATCH", `/api/leagues/${id}/recruiting/${recruitId}/board-rank`, { boardRank });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const phoneMutation = useMutation({
    mutationFn: async ({ recruitId, pitchTopic }: { recruitId: string; pitchTopic?: string }) => {
      const pitchTopics = pitchTopic ? pitchTopic.split(",") : undefined;
      const res = await apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/phone`, { pitchTopics });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Phone Call Made", description: changeLabel.label, type: "success", icon: "phone" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Phone Call Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async ({ recruitId, pitchTopic }: { recruitId: string; pitchTopic?: string }) => {
      const res = await apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/email`, { pitchTopic });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Email Sent", description: changeLabel.label, type: "success", icon: "email" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Email Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const visitMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/visit`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Campus Visit Scheduled", description: changeLabel.label, type: "success", icon: "visit" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Visit Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const headCoachVisitMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/head-coach-visit`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Head Coach Visit Complete", description: changeLabel.label, type: "success", icon: "coach" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "HC Visit Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const offerMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      const res = await apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/offer`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Scholarship Offered", description: changeLabel.label, type: "success", icon: "offer" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Offer Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const bulkScoutMutation = useMutation({
    mutationFn: async (recruitIds: string[]) => {
      const results = await Promise.all(
        recruitIds.map(recruitId => 
          apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/scout`, {})
        )
      );
      return results;
    },
    onSuccess: (_, recruitIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      setBulkSelected(new Set());
      setActionResultModal({ title: "Bulk Scouting Complete", description: `Scouted ${recruitIds.length} recruits!`, type: "success", icon: "scout" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Scouting Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const toggleBulkSelect = (recruitId: string) => {
    const newSet = new Set(bulkSelected);
    if (newSet.has(recruitId)) {
      newSet.delete(recruitId);
    } else {
      newSet.add(recruitId);
    }
    setBulkSelected(newSet);
  };

  const filteredRecruits = data?.recruits.filter(r => {
    const searchLower = searchQuery.toLowerCase();
    if (searchQuery && !`${r.firstName} ${r.lastName}`.toLowerCase().includes(searchLower)) return false;
    if (positionFilter !== "all" && r.position !== positionFilter) return false;
    if (starFilter !== "all" && r.starRank < parseInt(starFilter)) return false;
    if (stateFilter !== "all" && r.homeState !== stateFilter) return false;
    if (typeFilter !== "all") {
      const rt = r.recruitType || "HS";
      if (typeFilter === "HS" && rt !== "HS") return false;
      if (typeFilter === "TRANSFER" && rt !== "TRANSFER") return false;
      if (typeFilter === "JUCO" && rt !== "JUCO") return false;
    }
    if (showWatchlistOnly && !r.interest?.isTargeted) return false;
    if (showContested && !(r.teamsIn && r.teamsIn >= 3)) return false;
    if (showStory && !storylineRecruitIds.has(r.id)) return false;
    if (showTopAvailable && pipelineData?.positionNeeds) {
      const needPositions = pipelineData.positionNeeds.filter(p => p.need).map(p => p.position);
      if (!needPositions.includes(r.position)) return false;
      if (r.signedTeamId) return false;
    }
    if (sortBy === "interest" && !(r.interest && (r.interest.interestLevel || 0) > 0)) return false;
    if (sortBy === "myInterest" && !(r.interest && (r.interest.interestLevel || 0) > 0)) return false;
    if (pipelineFilter) {
      if (pipelineFilter !== "committed" && r.signedTeamId) return false;
      const level = r.interest?.interestLevel || 0;
      if (pipelineFilter === "cold" && !(level >= 1 && level <= 14)) return false;
      if (pipelineFilter === "cool" && !(level >= 15 && level <= 29)) return false;
      if (pipelineFilter === "warm" && !(level >= 30 && level <= 49)) return false;
      if (pipelineFilter === "hot" && !(level >= 50 && level <= 69)) return false;
      if (pipelineFilter === "very_hot" && !(level >= 70 && level <= 89)) return false;
      if (pipelineFilter === "on_fire" && !(level >= 90)) return false;
      if (pipelineFilter === "committed" && !r.signedTeamId) return false;
      if (pipelineFilter === "home_state" && r.homeState !== pipelineData?.teamState) return false;
      if (pipelineFilter === "home_region") {
        const ts = pipelineData?.teamState || "";
        const adj: Record<string, string[]> = {
          "AL":["FL","GA","MS","TN"],"AZ":["CA","CO","NM","NV","UT"],"AR":["LA","MO","MS","OK","TN","TX"],
          "CA":["AZ","NV","OR"],"CO":["AZ","KS","NE","NM","OK","UT","WY"],"CT":["MA","NY","RI"],
          "DE":["MD","NJ","PA"],"FL":["AL","GA"],"GA":["AL","FL","NC","SC","TN"],
          "ID":["MT","NV","OR","UT","WA","WY"],"IL":["IA","IN","KY","MO","WI"],"IN":["IL","KY","MI","OH"],
          "IA":["IL","MN","MO","NE","SD","WI"],"KS":["CO","MO","NE","OK"],"KY":["IL","IN","MO","OH","TN","VA","WV"],
          "LA":["AR","MS","TX"],"ME":["NH"],"MD":["DE","PA","VA","WV","DC"],"MA":["CT","NH","NY","RI","VT"],
          "MI":["IN","OH","WI"],"MN":["IA","ND","SD","WI"],"MS":["AL","AR","LA","TN"],
          "MO":["AR","IA","IL","KS","KY","NE","OK","TN"],"MT":["ID","ND","SD","WY"],
          "NE":["CO","IA","KS","MO","SD","WY"],"NV":["AZ","CA","ID","OR","UT"],"NH":["MA","ME","VT"],
          "NJ":["DE","NY","PA"],"NM":["AZ","CO","OK","TX","UT"],"NY":["CT","MA","NJ","PA","VT"],
          "NC":["GA","SC","TN","VA"],"ND":["MN","MT","SD"],"OH":["IN","KY","MI","PA","WV"],
          "OK":["AR","CO","KS","MO","NM","TX"],"OR":["CA","ID","NV","WA"],"PA":["DE","MD","NJ","NY","OH","WV"],
          "RI":["CT","MA"],"SC":["GA","NC"],"SD":["IA","MN","MT","ND","NE","WY"],
          "TN":["AL","AR","GA","KY","MO","MS","NC","VA"],"TX":["AR","LA","NM","OK"],
          "UT":["AZ","CO","ID","NM","NV","WY"],"VT":["MA","NH","NY"],"VA":["KY","MD","NC","TN","WV","DC"],
          "WA":["ID","OR"],"WV":["KY","MD","OH","PA","VA"],"WI":["IA","IL","MI","MN"],
          "WY":["CO","ID","MT","NE","SD","UT"],"DC":["MD","VA"],
        };
        const neighbors = new Set(adj[ts] || []);
        if (r.homeState === ts || !neighbors.has(r.homeState)) return false;
      }
    }
    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case "classRank":
        return (a.classRank || 999) - (b.classRank || 999);
      case "positionRank":
        return (a.positionRank || 999) - (b.positionRank || 999);
      case "overall": {
        const getDisplayOverall = (r: RecruitWithInterest) => {
          if (r.isBlueChip) return r.overall;
          const pct = r.interest?.scoutPercentage || 0;
          if (pct >= 100) return r.overall;
          if (pct === 0) return -1;
          const min = r.interest?.minOverall || 1;
          const max = r.interest?.maxOverall || 999;
          return Math.floor((min + max) / 2);
        };
        return getDisplayOverall(b) - getDisplayOverall(a);
      }
      case "starRank":
        return b.starRank - a.starRank || (a.classRank || 999) - (b.classRank || 999);
      case "name":
        return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
      case "state":
        return (a.homeState || "").localeCompare(b.homeState || "") || (a.classRank || 999) - (b.classRank || 999);
      case "scoutPriority": {
        const aTargeted = a.interest?.isTargeted ? 0 : 1;
        const bTargeted = b.interest?.isTargeted ? 0 : 1;
        if (aTargeted !== bTargeted) return aTargeted - bTargeted;
        return (a.interest?.scoutPercentage || 0) - (b.interest?.scoutPercentage || 0);
      }
      case "interest":
        return (b.interest?.interestLevel || 0) - (a.interest?.interestLevel || 0);
      case "myInterest": {
        const aLevel = a.interest?.interestLevel || 0;
        const bLevel = b.interest?.interestLevel || 0;
        return bLevel - aLevel;
      }
      case "trendUp": {
        const trendScore = (recruitId: string) => {
          const t = trendsData?.trends?.[recruitId]?.trend;
          return t === "up" ? 2 : t === "flat" ? 1 : 0;
        };
        const diff = trendScore(b.id) - trendScore(a.id);
        if (diff !== 0) return diff;
        return (b.interest?.interestLevel || 0) - (a.interest?.interestLevel || 0);
      }
      case "competition": {
        return (b.teamsIn || 0) - (a.teamsIn || 0);
      }
      case "boardRank": {
        const aRank = a.interest?.boardRank ?? 9999;
        const bRank = b.interest?.boardRank ?? 9999;
        if (aRank !== bRank) return aRank - bRank;
        return (a.classRank || 999) - (b.classRank || 999);
      }
      default:
        return (a.classRank || 999) - (b.classRank || 999);
    }
  }) || [];

  const selectAllVisible = () => {
    const scoutableRecruits = filteredRecruits?.filter(r => (r.interest?.scoutPercentage || 0) < 100) || [];
    if (bulkSelected.size === scoutableRecruits.length && scoutableRecruits.length > 0) {
      setBulkSelected(new Set());
    } else {
      setBulkSelected(new Set(scoutableRecruits.map(r => r.id)));
    }
  };

  if (isLoading) {
    return <RecruitingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-[1000]">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex flex-col gap-1 flex-1">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/dashboard" className="text-muted-foreground hover:text-gold text-xs">Leagues</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold text-xs">{data?.team?.name || "Dynasty"}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-gold text-xs">Recruiting</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="flex items-baseline gap-3">
                <h1 className="font-pixel text-gold text-lg">Recruiting</h1>
                {pipelineData?.totalClassSize != null && (
                  <span className="text-xs text-muted-foreground" data-testid="text-class-size">
                    {pipelineData.totalClassSize} Recruits
                    {pipelineData.teamCount > 0 && ` — ${pipelineData.teamCount} Teams`}
                  </span>
                )}
              </div>
            </div>
            {data?.recruits && (
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => {
                  setSaveClassName(`${data.team?.name || "My Team"} Class - Season ${leagueData?.currentSeason ?? 1}`);
                  setShowSaveClassDialog(true);
                }}
                data-testid="button-save-class-file"
              >
                <Save className="w-3 h-3 mr-1" />
                Save Class File
              </RetroButton>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <StatCard icon={<Target className="w-4 h-4" />} label="Targets" value={`${data?.targetedCount || 0}/20`} />
            <StatCard icon={<Check className="w-4 h-4" />} label="Commits" value={`${data?.commitsCount || 0}/${data?.maxCommits ?? 0}`} />
            <StatCard icon={<Phone className="w-4 h-4" />} label="Recruiting Points" value={`${data?.pointsUsed ?? 0}/${data?.maxPoints ?? 0}`} />
            <StatCard icon={<Eye className="w-4 h-4" />} label="Scout Points" value={`${data?.scoutPointsUsed ?? 0}/${data?.maxScoutPoints ?? 0}`} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <RetroCard className="mb-6">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <RetroInput
                placeholder="Search recruits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full"
                data-testid="input-search-recruits"
              />
            </div>

            {/* Mobile: compact filter trigger row */}
            {(() => {
              const activeCount = (positionFilter !== "all" ? 1 : 0) + (starFilter !== "all" ? 1 : 0) + (typeFilter !== "all" ? 1 : 0) + (stateFilter !== "all" ? 1 : 0) + (showWatchlistOnly ? 1 : 0) + (showTopAvailable ? 1 : 0) + (showTeamNeeds ? 1 : 0) + (showPipeline ? 1 : 0) + (showContested ? 1 : 0) + (showStory ? 1 : 0);
              return (
                <div className="flex items-center gap-2 sm:hidden">
                  <RetroSelect
                    options={sortOptions}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1"
                    data-testid="select-sort-mobile"
                  />
                  <RetroButton
                    variant={activeCount > 0 ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setShowFilterSheet(true)}
                    className="shrink-0 relative"
                    data-testid="button-open-filter-sheet"
                  >
                    <Filter className="w-3 h-3 mr-1" />
                    Filters
                    {activeCount > 0 && (
                      <span className="ml-1 bg-background/30 text-[10px] font-bold px-1 rounded">
                        {activeCount}
                      </span>
                    )}
                  </RetroButton>
                </div>
              );
            })()}

            {/* Desktop: full inline filter UI */}
            <div className="hidden sm:block space-y-4">
              <div>
                <p className="font-pixel text-[9px] text-gold mb-2">FILTERS</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <RetroSelect
                    options={positionOptions}
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="w-full"
                    data-testid="select-position-filter"
                  />
                  <RetroSelect
                    options={starOptions}
                    value={starFilter}
                    onChange={(e) => setStarFilter(e.target.value)}
                    className="w-full"
                    data-testid="select-star-filter"
                  />
                  <RetroSelect
                    options={[
                      { label: "All Types", value: "all" },
                      { label: "High School", value: "HS" },
                      { label: "Transfer", value: "TRANSFER" },
                      { label: "JUCO", value: "JUCO" },
                    ]}
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full"
                    data-testid="select-type-filter"
                  />
                  <RetroSelect
                    options={[
                      { label: "All States", value: "all" },
                      ...(data?.recruits ? Array.from(new Set(data.recruits.map(r => r.homeState).filter(Boolean))).sort().map(s => ({ label: s!, value: s! })) : [])
                    ]}
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    className="w-full"
                    data-testid="select-state-filter"
                  />
                </div>
              </div>

              <div>
                <p className="font-pixel text-[9px] text-gold mb-2">SORT</p>
                <RetroSelect
                  options={sortOptions}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full sm:w-56"
                  data-testid="select-sort"
                />
              </div>

              <div>
                <p className="font-pixel text-[9px] text-gold mb-2">VIEWS</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <RetroButton 
                    variant={showWatchlistOnly ? "primary" : "outline"} 
                    size="sm" 
                    onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                    className="w-full justify-center"
                    data-testid="button-watchlist-filter"
                  >
                    <Target className="w-3 h-3 mr-1" />
                    Watchlist {showWatchlistOnly && `(${data?.targetedCount || 0})`}
                  </RetroButton>
                  <RetroButton
                    variant={showTopAvailable ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setShowTopAvailable(!showTopAvailable)}
                    className="w-full justify-center"
                    data-testid="button-top-available"
                  >
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Top Available
                  </RetroButton>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTeamNeeds(!showTeamNeeds)}
                    className="w-full justify-center"
                    data-testid="button-toggle-team-needs"
                  >
                    <Users className="w-3 h-3 mr-1" />
                    Team Needs
                  </RetroButton>
                  <RetroButton
                    variant={showPipeline ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setShowPipeline(!showPipeline)}
                    className="w-full justify-center"
                    data-testid="button-toggle-pipeline"
                  >
                    <BarChart3 className="w-3 h-3 mr-1" />
                    Pipeline
                  </RetroButton>
                  <RetroButton
                    variant={showContested ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setShowContested(!showContested)}
                    className="w-full justify-center"
                    data-testid="button-toggle-contested"
                  >
                    <Flame className="w-3 h-3 mr-1" />
                    Contested
                  </RetroButton>
                  <RetroButton
                    variant={showStory ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setShowStory(!showStory)}
                    className="w-full justify-center"
                    data-testid="button-toggle-story"
                  >
                    <BookOpen className="w-3 h-3 mr-1" />
                    Story
                  </RetroButton>
                </div>
              </div>

              <div>
                <p className="font-pixel text-[9px] text-gold mb-2">TOOLS</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <RetroButton variant="outline" size="sm" className="w-full justify-center" data-testid="button-presets">
                        <Bookmark className="w-3 h-3 mr-1" />
                        Presets
                      </RetroButton>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 bg-card border-border p-3">
                      <div className="space-y-3">
                        <p className="font-pixel text-[10px] text-gold">SAVED PRESETS</p>
                        {filterPresets.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No saved presets</p>
                        ) : (
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {filterPresets.map((preset) => (
                              <div key={preset.id} className="flex items-center gap-2 group">
                                <RetroButton
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 justify-start text-xs"
                                  onClick={() => loadPreset(preset)}
                                  data-testid={`button-load-preset-${preset.id}`}
                                >
                                  {preset.name}
                                </RetroButton>
                                <button
                                  onClick={() => deletePreset(preset.id)}
                                  className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                  data-testid={`button-delete-preset-${preset.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="pt-2 border-t border-border">
                          <p className="font-pixel text-[8px] text-muted-foreground mb-2">SAVE CURRENT</p>
                          <div className="flex gap-2">
                            <RetroInput
                              value={newPresetName}
                              onChange={(e) => setNewPresetName(e.target.value)}
                              placeholder="Preset name"
                              className="flex-1 h-8 text-xs"
                              data-testid="input-preset-name"
                            />
                            <RetroButton
                              size="sm"
                              onClick={savePreset}
                              disabled={!newPresetName.trim()}
                              data-testid="button-save-preset"
                            >
                              <Save className="w-3 h-3" />
                            </RetroButton>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisible}
                    className="w-full justify-center"
                    data-testid="button-select-all"
                  >
                    <CheckSquare className="w-3 h-3 mr-1" />
                    {bulkSelected.size > 0 ? `Deselect (${bulkSelected.size})` : "Select All"}
                  </RetroButton>
                  {bulkSelected.size > 0 && (
                    <RetroButton
                      variant="primary"
                      size="sm"
                      onClick={() => bulkScoutMutation.mutate(Array.from(bulkSelected))}
                      disabled={bulkScoutMutation.isPending}
                      className="w-full justify-center"
                      data-testid="button-bulk-scout"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      {bulkScoutMutation.isPending ? "Scouting..." : `Scout (${bulkSelected.size})`}
                    </RetroButton>
                  )}
                  {(() => {
                    const unscoutedTargets = data?.recruits.filter(r => r.interest?.isTargeted && (r.interest?.scoutPercentage || 0) < 100) || [];
                    return unscoutedTargets.length > 0 ? (
                      <RetroButton
                        variant="outline"
                        size="sm"
                        onClick={() => bulkScoutMutation.mutate(unscoutedTargets.map(r => r.id))}
                        disabled={bulkScoutMutation.isPending || (data?.remainingScoutPoints ?? 0) <= 0}
                        className="w-full justify-center"
                        data-testid="button-quick-scout-targets"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        {bulkScoutMutation.isPending ? "Scouting..." : `Scout Targets (${unscoutedTargets.length})`}
                      </RetroButton>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-sm text-muted-foreground">
                {filteredRecruits.length} recruits found
              </span>
            </div>

            {/* Mobile filter Sheet */}
            <Sheet open={showFilterSheet} onOpenChange={setShowFilterSheet}>
              <SheetContent side="bottom" className="bg-card border-border p-0 max-h-[85vh] overflow-y-auto rounded-t-xl">
                <SheetHeader className="p-4 border-b border-border">
                  <SheetTitle className="font-pixel text-gold text-xs">FILTERS</SheetTitle>
                </SheetHeader>
                <div className="p-4 space-y-5">
                  <div>
                    <p className="font-pixel text-[9px] text-gold mb-2">POSITION</p>
                    <RetroSelect
                      options={positionOptions}
                      value={positionFilter}
                      onChange={(e) => setPositionFilter(e.target.value)}
                      className="w-full"
                      data-testid="select-position-filter-sheet"
                    />
                  </div>
                  <div>
                    <p className="font-pixel text-[9px] text-gold mb-2">STARS</p>
                    <RetroSelect
                      options={starOptions}
                      value={starFilter}
                      onChange={(e) => setStarFilter(e.target.value)}
                      className="w-full"
                      data-testid="select-star-filter-sheet"
                    />
                  </div>
                  <div>
                    <p className="font-pixel text-[9px] text-gold mb-2">TYPE</p>
                    <RetroSelect
                      options={[
                        { label: "All Types", value: "all" },
                        { label: "High School", value: "HS" },
                        { label: "Transfer", value: "TRANSFER" },
                        { label: "JUCO", value: "JUCO" },
                      ]}
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="w-full"
                      data-testid="select-type-filter-sheet"
                    />
                  </div>
                  <div>
                    <p className="font-pixel text-[9px] text-gold mb-2">HOME STATE</p>
                    <RetroSelect
                      options={[
                        { label: "All States", value: "all" },
                        ...(data?.recruits ? Array.from(new Set(data.recruits.map(r => r.homeState).filter(Boolean))).sort().map(s => ({ label: s!, value: s! })) : [])
                      ]}
                      value={stateFilter}
                      onChange={(e) => setStateFilter(e.target.value)}
                      className="w-full"
                      data-testid="select-state-filter-sheet"
                    />
                  </div>
                  <div>
                    <p className="font-pixel text-[9px] text-gold mb-2">VIEWS</p>
                    <div className="grid grid-cols-2 gap-2">
                      <RetroButton
                        variant={showWatchlistOnly ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                        className="w-full justify-center"
                        data-testid="button-watchlist-filter-sheet"
                      >
                        <Target className="w-3 h-3 mr-1" />
                        Watchlist
                      </RetroButton>
                      <RetroButton
                        variant={showTopAvailable ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setShowTopAvailable(!showTopAvailable)}
                        className="w-full justify-center"
                        data-testid="button-top-available-sheet"
                      >
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Top Available
                      </RetroButton>
                      <RetroButton
                        variant={showTeamNeeds ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setShowTeamNeeds(!showTeamNeeds)}
                        className="w-full justify-center"
                        data-testid="button-toggle-team-needs-sheet"
                      >
                        <Users className="w-3 h-3 mr-1" />
                        Team Needs
                      </RetroButton>
                      <RetroButton
                        variant={showPipeline ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setShowPipeline(!showPipeline)}
                        className="w-full justify-center"
                        data-testid="button-toggle-pipeline-sheet"
                      >
                        <BarChart3 className="w-3 h-3 mr-1" />
                        Pipeline
                      </RetroButton>
                      <RetroButton
                        variant={showContested ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setShowContested(!showContested)}
                        className="w-full justify-center"
                        data-testid="button-toggle-contested-sheet"
                      >
                        <Flame className="w-3 h-3 mr-1" />
                        Contested
                      </RetroButton>
                      <RetroButton
                        variant={showStory ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setShowStory(!showStory)}
                        className="w-full justify-center"
                        data-testid="button-toggle-story-sheet"
                      >
                        <BookOpen className="w-3 h-3 mr-1" />
                        Story
                      </RetroButton>
                    </div>
                  </div>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      skipPersistRef.current = true;
                      localStorage.removeItem(`recruiting-filters-${id}`);
                      setPositionFilter("all");
                      setStarFilter("all");
                      setTypeFilter("all");
                      setStateFilter("all");
                      setShowWatchlistOnly(false);
                      setShowTopAvailable(false);
                      setShowTeamNeeds(false);
                      setShowPipeline(false);
                      setShowContested(false);
                      setShowStory(false);
                      setShowFilterSheet(false);
                    }}
                    className="w-full justify-center"
                    data-testid="button-clear-all-filters"
                  >
                    Reset to Defaults
                  </RetroButton>
                  <div>
                    <p className="font-pixel text-[9px] text-gold mb-2">TOOLS</p>
                    <div className="grid grid-cols-2 gap-2">
                      <RetroButton
                        variant="outline"
                        size="sm"
                        onClick={() => { selectAllVisible(); setShowFilterSheet(false); }}
                        className="w-full justify-center"
                        data-testid="button-select-all-sheet"
                      >
                        <CheckSquare className="w-3 h-3 mr-1" />
                        {bulkSelected.size > 0 ? `Deselect (${bulkSelected.size})` : "Select All"}
                      </RetroButton>
                      {bulkSelected.size > 0 && (
                        <RetroButton
                          variant="primary"
                          size="sm"
                          onClick={() => { bulkScoutMutation.mutate(Array.from(bulkSelected)); setShowFilterSheet(false); }}
                          disabled={bulkScoutMutation.isPending}
                          className="w-full justify-center"
                          data-testid="button-bulk-scout-sheet"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Scout ({bulkSelected.size})
                        </RetroButton>
                      )}
                    </div>
                  </div>
                  <RetroButton
                    size="sm"
                    onClick={() => setShowFilterSheet(false)}
                    className="w-full justify-center"
                    data-testid="button-apply-filters"
                  >
                    Show {filteredRecruits.length} Recruits
                  </RetroButton>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          
          {showTeamNeeds && data?.nextYearDepth && (
            <TeamNeedsIndicator 
              nextYearDepth={data.nextYearDepth} 
              nextYearRosterSize={data.nextYearRosterSize} 
              seniorsGraduating={data.seniorsGraduating}
              positionFilter={positionFilter}
              onPositionClick={(pos) => setPositionFilter(positionFilter === pos ? "all" : pos)}
            />
          )}

          {showPipeline && pipelineData && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <p className="font-pixel text-[10px] text-gold">RECRUITING PIPELINE</p>
                {pipelineFilter && (
                  <RetroButton variant="outline" size="sm" onClick={() => setPipelineFilter(null)} data-testid="button-clear-pipeline-filter">
                    <X className="w-3 h-3 mr-1" /> Clear Filter
                  </RetroButton>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
                {[
                  { label: "Cold", key: "cold", count: pipelineData.pipeline.cold, color: "bg-blue-300/20 text-blue-300" },
                  { label: "Cool", key: "cool", count: pipelineData.pipeline.cool, color: "bg-blue-400/20 text-blue-400" },
                  { label: "Warm", key: "warm", count: pipelineData.pipeline.warm, color: "bg-green-400/20 text-green-400" },
                  { label: "Hot", key: "hot", count: pipelineData.pipeline.hot, color: "bg-yellow-400/20 text-yellow-400" },
                  { label: "Very Hot", key: "very_hot", count: pipelineData.pipeline.very_hot, color: "bg-orange-400/20 text-orange-400" },
                  { label: "On Fire", key: "on_fire", count: pipelineData.pipeline.on_fire, color: "bg-red-400/20 text-red-400" },
                  { label: "Committed", key: "committed", count: pipelineData.pipeline.committed, color: "bg-gold/20 text-gold" },
                  { label: "Home State", key: "home_state", count: pipelineData.pipeline.home_state, color: "bg-purple-400/20 text-purple-400" },
                  { label: "Region", key: "home_region", count: pipelineData.pipeline.home_region, color: "bg-teal-400/20 text-teal-400" },
                ].map(stage => (
                  <div
                    key={stage.key}
                    className={`text-center p-2 rounded cursor-pointer transition-all ${stage.color} ${pipelineFilter === stage.key ? "ring-2 ring-gold ring-offset-1 ring-offset-background" : "hover:opacity-80"}`}
                    onClick={() => setPipelineFilter(pipelineFilter === stage.key ? null : stage.key)}
                    data-testid={`pipeline-filter-${stage.key}`}
                  >
                    <p className="font-bold text-lg">{stage.count}</p>
                    <p className="text-[9px]">{stage.label}</p>
                  </div>
                ))}
              </div>
              {pipelineData.positionNeeds.some(p => p.need) && (
                <div className="mt-3">
                  <p className="text-[9px] text-muted-foreground mb-1">POSITION NEEDS (After Graduation)</p>
                  <div className="flex flex-wrap gap-1">
                    {pipelineData.positionNeeds.filter(p => p.need).map(p => (
                      <Badge key={p.position} variant="outline" className="text-[8px] border-red-500/50 text-red-400">
                        {p.position} ({p.current - p.graduating} remaining)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </RetroCard>

        {/* Class Rankings Panel — shown after signing day completes */}
        {isPostSigningDay && classRankingsData?.snapshots && classRankingsData.snapshots.length > 0 && (() => {
          const snaps = classRankingsData.snapshots;
          const total = snaps.length;
          const myTeamId = data?.team?.id;

          function getClassGrade(rank: number): string {
            const pct = rank / total;
            if (pct <= 0.10) return "A+";
            if (pct <= 0.20) return "A";
            if (pct <= 0.30) return "A-";
            if (pct <= 0.40) return "B+";
            if (pct <= 0.55) return "B";
            if (pct <= 0.70) return "B-";
            if (pct <= 0.80) return "C+";
            if (pct <= 0.90) return "C";
            return "D";
          }

          function getGradeColor(grade: string): string {
            if (grade === "A+" || grade === "A") return "text-green-400";
            if (grade === "A-" || grade === "B+") return "text-lime-400";
            if (grade === "B") return "text-yellow-400";
            if (grade === "B-" || grade === "C+") return "text-orange-400";
            return "text-red-400";
          }

          const mySnap = snaps.find(s => s.teamId === myTeamId);
          const myGrade = mySnap ? getClassGrade(mySnap.classRank) : null;

          return (
            <div className="mb-6" data-testid="class-rankings-panel">
              <RetroCard variant="default">
                <button
                  className="w-full flex items-center justify-between gap-2 cursor-pointer"
                  onClick={() => setShowClassRankings(!showClassRankings)}
                  data-testid="button-toggle-class-rankings"
                >
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-gold" />
                    <span className="font-pixel text-gold text-sm uppercase tracking-wider">
                      Class Rankings — Season {classRankingsData.season}
                    </span>
                    {myGrade && (
                      <span className={`font-pixel text-sm ${getGradeColor(myGrade)}`}>
                        ({myGrade})
                      </span>
                    )}
                  </div>
                  {showClassRankings ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {showClassRankings && (
                  <div className="mt-4 space-y-1">
                    <div className="grid grid-cols-[2rem_1fr_2.5rem_3rem_3.5rem_3.5rem] gap-2 text-[9px] font-pixel text-muted-foreground px-1 pb-1 border-b border-border/40">
                      <span>#</span>
                      <span>Team</span>
                      <span className="text-center">Grd</span>
                      <span className="text-center">Commits</span>
                      <span className="text-center">5★</span>
                      <span className="text-center">Avg OVR</span>
                    </div>
                    {snaps.map((snap) => {
                      const grade = getClassGrade(snap.classRank);
                      const isMe = snap.teamId === myTeamId;
                      return (
                        <div
                          key={snap.teamId}
                          className={`grid grid-cols-[2rem_1fr_2.5rem_3rem_3.5rem_3.5rem] gap-2 items-center px-1 py-1 rounded text-xs transition-colors ${isMe ? "bg-gold/10 border border-gold/30" : "hover:bg-card/60"}`}
                          data-testid={`class-rank-row-${snap.teamId}`}
                        >
                          <span className="text-muted-foreground font-mono text-[10px]">{snap.classRank}</span>
                          <span className={`truncate text-[10px] ${isMe ? "text-gold font-semibold" : "text-foreground"}`}>
                            {snap.teamName}
                            {isMe && <span className="ml-1 text-gold text-[8px]">★</span>}
                          </span>
                          <span className={`text-center font-pixel text-sm font-bold ${getGradeColor(grade)}`}>{grade}</span>
                          <span className="text-center text-muted-foreground">{snap.totalCommits}</span>
                          <span className="text-center text-muted-foreground">{snap.fiveStars}</span>
                          <span className="text-center text-muted-foreground">{Math.round(snap.avgOverall)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </RetroCard>
            </div>
          );
        })()}

        {/* Scouting History Panel */}
        {(() => {
          const currentWeek = leagueData?.currentWeek ?? 1;
          const allActions = historyData?.actions ?? [];
          const lastWeekActions = allActions.filter(a => a.week === currentWeek - 1);
          const displayActions = lastWeekActions.length > 0
            ? lastWeekActions
            : (() => {
                const weeks = Array.from(new Set(allActions.map(a => a.week))).filter(w => w < currentWeek).sort((a, b) => b - a);
                return weeks.length > 0 ? allActions.filter(a => a.week === weeks[0]) : [];
              })();
          const displayWeek = displayActions.length > 0 ? displayActions[0].week : currentWeek - 1;
          const groupedByRecruit = displayActions.reduce<Record<string, typeof displayActions>>((acc, action) => {
            const key = action.recruitId;
            if (!acc[key]) acc[key] = [];
            acc[key].push(action);
            return acc;
          }, {});
          const recruitGroups = Object.values(groupedByRecruit);
          const totalActions = displayActions.length;
          const totalRecruits = recruitGroups.length;

          const histActionIcons: Record<string, any> = {
            scout: <Eye className="w-3 h-3" />,
            phone: <Phone className="w-3 h-3" />,
            email: <Mail className="w-3 h-3" />,
            offer: <GraduationCap className="w-3 h-3" />,
            visit: <MapPin className="w-3 h-3" />,
          };
          const histActionColors: Record<string, string> = {
            scout: "text-green-400",
            phone: "text-blue-400",
            email: "text-purple-400",
            offer: "text-gold",
            visit: "text-teal-400",
          };

          return (
            <div className="mb-6" data-testid="scouting-history-panel">
              <RetroCard variant="default">
                <button
                  className="w-full flex items-center justify-between gap-2 cursor-pointer"
                  onClick={() => setShowHistory(!showHistory)}
                  data-testid="button-toggle-history"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-gold" />
                    <span className="font-pixel text-gold text-sm uppercase tracking-wider">Last Week's Activity</span>
                    {totalActions > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        (Week {displayWeek})
                      </span>
                    )}
                  </div>
                  {showHistory ? <ChevronUp className="w-4 h-4 text-gold" /> : <ChevronDown className="w-4 h-4 text-gold" />}
                </button>

                {showHistory && (
                  <div className="mt-4 pt-4 border-t border-border">
                    {totalActions === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No scouting activity last week</p>
                    ) : (
                      <>
                        <p className="text-[10px] text-muted-foreground mb-3">
                          {totalActions} action{totalActions !== 1 ? "s" : ""} taken across {totalRecruits} recruit{totalRecruits !== 1 ? "s" : ""}
                        </p>
                        <div className="space-y-3">
                          {recruitGroups.map((actions) => {
                            const first = actions[0];
                            return (
                              <div key={first.recruitId} className="bg-muted/30 rounded p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-foreground">{first.recruitName}</span>
                                  <PositionBadge position={first.recruitPosition} />
                                  {first.recruitStarRating > 0 && (
                                    <StarRating rating={first.recruitStarRating} size="sm" />
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {actions.map((action) => (
                                    <div
                                      key={action.id}
                                      className="flex items-center gap-1.5 text-xs py-1 px-2 bg-background/50 rounded"
                                      data-testid={`history-action-${action.id}`}
                                    >
                                      <span className={histActionColors[action.actionType] || "text-muted-foreground"}>
                                        {histActionIcons[action.actionType] || <HelpCircle className="w-3 h-3" />}
                                      </span>
                                      <span className="capitalize text-foreground">{action.actionType}</span>
                                      {action.interestChange !== 0 && (
                                        <span className={action.interestChange > 0 ? "text-green-400" : "text-red-400"}>
                                          {action.interestChange > 0 ? `+${action.interestChange}` : action.interestChange}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </RetroCard>
            </div>
          );
        })()}

        {/* Decommit Alert Banners */}
        {visibleDecommits.length > 0 && visibleDecommits.map(alert => {
          const isPositive = alert.metadata?.alertType === "gain";
          const recruitId = alert.metadata?.recruitId ?? null;
          const matchedRecruit = recruitId ? data?.recruits.find(r => r.id === recruitId) : null;
          return (
            <div
              key={alert.id}
              className={`mb-4 rounded border px-4 py-3 flex items-start justify-between gap-3 ${
                isPositive
                  ? "bg-emerald-500/10 border-emerald-500/40"
                  : "bg-amber-500/10 border-amber-500/40"
              }`}
              data-testid={`decommit-alert-${alert.id}`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${isPositive ? "text-emerald-400" : "text-amber-400"}`} />
                <div className="min-w-0">
                  <p className={`font-pixel text-[9px] uppercase tracking-wider mb-1 ${isPositive ? "text-emerald-400" : "text-amber-400"}`}>
                    {isPositive ? "Decommit Opportunity" : "Decommitment Alert"}
                    <span className="ml-2 text-muted-foreground normal-case font-sans text-[10px]">Week {alert.week}</span>
                  </p>
                  <p className="text-sm text-foreground leading-snug">{alert.description}</p>
                  {matchedRecruit && (
                    <button
                      className={`mt-1.5 text-[11px] font-medium underline underline-offset-2 ${isPositive ? "text-emerald-400 hover:text-emerald-300" : "text-amber-400 hover:text-amber-300"}`}
                      onClick={() => setSelectedRecruit(matchedRecruit)}
                      data-testid={`decommit-alert-view-${alert.id}`}
                    >
                      {isPositive ? "View recruit →" : "Re-recruit now →"}
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => dismissDecommit(alert.id)}
                className="text-muted-foreground hover:text-foreground p-1 shrink-0"
                data-testid={`decommit-alert-dismiss-${alert.id}`}
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {/* Class Vintage Banner */}
        {(() => {
          const vintage = data?.recruits?.[0]?.classVintage as string | undefined;
          if (!vintage || isPostSigningDay) return null;
          const vintageConfig: Record<string, { label: string; copy: string; colors: string; Icon: React.ElementType }> = {
            elite:            { label: "ELITE CLASS",           copy: "The stars are obvious this year. The fight is for who lands them.",                         colors: "bg-amber-500/10 border-amber-500/30 text-amber-400",     Icon: Trophy        },
            gem_heavy:        { label: "GEM-HEAVY CLASS",       copy: "The rankings may be missing something special. Scout deep.",                               colors: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", Icon: Gem           },
            strong:           { label: "STRONG CLASS",          copy: "Quality talent is everywhere. Smart programs can build fast.",                              colors: "bg-green-500/10 border-green-500/30 text-green-400",       Icon: TrendingUp    },
            balanced:         { label: "BALANCED CLASS",        copy: "Every position group has options. Build the class your roster needs.",                     colors: "bg-blue-500/10 border-blue-500/30 text-blue-400",          Icon: Scale         },
            pitching_rich:    { label: "PITCHING-RICH CLASS",   copy: "Arms are everywhere this cycle. Rotations could be rebuilt overnight.",                    colors: "bg-sky-500/10 border-sky-500/30 text-sky-400",             Icon: Wind          },
            position_players: { label: "POSITION PLAYER CLASS", copy: "This class is built around everyday players. Bats, gloves, and athletes lead the board.",  colors: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",           Icon: Users         },
            defense_first:    { label: "DEFENSE-FIRST CLASS",   copy: "The gloves are loud this year. Defense could define the class.",                           colors: "bg-teal-500/10 border-teal-500/30 text-teal-400",          Icon: ShieldCheck   },
            power_class:      { label: "POWER CLASS",           copy: "The ball is going to fly. This class is loaded with power bats.",                          colors: "bg-rose-500/10 border-rose-500/30 text-rose-400",          Icon: Zap           },
            speed_class:      { label: "SPEED CLASS",           copy: "This class can run. Speed, range, and chaos are all over the board.",                      colors: "bg-violet-500/10 border-violet-500/30 text-violet-400",    Icon: Gauge         },
            raw_talent:       { label: "RAW TALENT CLASS",      copy: "The tools are obvious. The outcomes are not.",                                              colors: "bg-orange-500/10 border-orange-500/30 text-orange-400",    Icon: Eye           },
            volatile:         { label: "VOLATILE CLASS",        copy: "Nobody agrees on this class. Somebody is going to be very wrong.",                         colors: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",    Icon: Shuffle       },
            bust_year:        { label: "BUST-HEAVY CLASS",      copy: "Big names. Big rankings. Big risk. Scout carefully.",                                       colors: "bg-red-500/10 border-red-500/30 text-red-400",             Icon: AlertOctagon  },
            weak:             { label: "DOWN YEAR",             copy: "Talent is scarce this year. The best programs will find value late.",                      colors: "bg-muted/20 border-border/40 text-muted-foreground",       Icon: TrendingDown  },
            late_bloomer:     { label: "LATE-BLOOMER CLASS",    copy: "The board may look completely different by Signing Day.",                                  colors: "bg-lime-500/10 border-lime-500/30 text-lime-400",          Icon: Sprout        },
            legacy:           { label: "LEGACY CLASS",          copy: "The names are familiar. The expectations are heavy.",                                      colors: "bg-amber-600/10 border-amber-600/30 text-amber-300",       Icon: Crown         },
          };
          const cfg = vintageConfig[vintage];
          if (!cfg) return null;
          const { Icon } = cfg;
          return (
            <div className={`mb-4 rounded border px-5 py-3.5 ${cfg.colors}`} data-testid="class-vintage-banner">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-5 h-5 shrink-0" />
                <span className="font-pixel text-[11px] uppercase tracking-wider">{cfg.label}</span>
              </div>
              <p className="text-[12px] opacity-75 leading-relaxed pl-7">{cfg.copy}</p>
            </div>
          );
        })()}

        {/* Rival Scout Report — Week Recap */}
        {weekRecapData && !recapDismissed && (weekRecapData.myRecruits.length > 0 || weekRecapData.hotMissed.length > 0) && (
          <div className="mb-6" data-testid="week-recap-panel">
            <RetroCard variant="default">
              <div className="flex items-center justify-between gap-2">
                <button
                  className="flex items-center gap-2 cursor-pointer flex-1 text-left"
                  onClick={() => setShowRecap(!showRecap)}
                  data-testid="button-toggle-recap"
                >
                  <Telescope className="w-4 h-4 text-gold" />
                  <span className="font-pixel text-gold text-sm uppercase tracking-wider">Rival Scout Report</span>
                  <span className="text-[10px] text-muted-foreground">(Week {weekRecapData.week})</span>
                  {showRecap ? <ChevronUp className="w-4 h-4 text-gold ml-1" /> : <ChevronDown className="w-4 h-4 text-gold ml-1" />}
                </button>
                <button
                  onClick={dismissRecap}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-dismiss-recap"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {showRecap && (
                <div className="mt-4 pt-4 border-t border-border space-y-5">
                  <p className="text-[10px] text-muted-foreground">
                    Rival activity shown as total actions by other teams — no team identities or pitch details revealed.
                  </p>

                  {weekRecapData.myRecruits.length > 0 && (
                    <div>
                      <p className="font-pixel text-[9px] text-gold mb-2">YOUR TARGETS THIS WEEK</p>
                      <div className="space-y-2">
                        {weekRecapData.myRecruits.map(r => {
                          const levelColor = r.activityLevel === "Hot" ? "text-red-400 bg-red-500/10 border-red-500/30"
                            : r.activityLevel === "Active" ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                            : "text-muted-foreground bg-muted/20 border-border";
                          return (
                            <div key={r.recruitId} className="flex items-center justify-between bg-muted/30 rounded p-2.5" data-testid={`recap-my-recruit-${r.recruitId}`}>
                              <div className="flex items-center gap-2">
                                <PositionBadge position={r.position} />
                                <button
                                  className="text-sm font-medium text-foreground hover:text-gold transition-colors"
                                  onClick={() => {
                                    const found = data?.recruits.find(rec => rec.id === r.recruitId);
                                    if (found) setSelectedRecruit(found);
                                  }}
                                  data-testid={`recap-recruit-link-${r.recruitId}`}
                                >
                                  {r.name}
                                </button>
                                {r.starRating > 0 && <StarRating rating={r.starRating} size="sm" />}
                              </div>
                              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs ${levelColor}`} data-testid={`recap-activity-${r.recruitId}`}>
                                {r.activityLevel === "Hot" && <Zap className="w-3 h-3" />}
                                {r.activityLevel === "Active" && <Flame className="w-3 h-3" />}
                                {r.activityLevel === "Quiet" && <Minus className="w-3 h-3" />}
                                <span>{r.activityLevel}</span>
                                {r.otherTeamActionCount > 0 && (
                                  <span className="opacity-70">({r.otherTeamActionCount} rival {r.otherTeamActionCount === 1 ? "action" : "actions"})</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {weekRecapData.hotMissed.length > 0 && (
                    <div>
                      <p className="font-pixel text-[9px] text-amber-400 mb-2">HOT RECRUITS YOU HAVEN'T CONTACTED</p>
                      <div className="space-y-2">
                        {weekRecapData.hotMissed.map(r => (
                          <div key={r.recruitId} className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded p-2.5" data-testid={`recap-missed-recruit-${r.recruitId}`}>
                            <div className="flex items-center gap-2">
                              <PositionBadge position={r.position} />
                              <button
                                className="text-sm font-medium text-foreground hover:text-gold transition-colors"
                                onClick={() => {
                                  const found = data?.recruits.find(rec => rec.id === r.recruitId);
                                  if (found) setSelectedRecruit(found);
                                }}
                                data-testid={`recap-missed-link-${r.recruitId}`}
                              >
                                {r.name}
                              </button>
                              {r.starRating > 0 && <StarRating rating={r.starRating} size="sm" />}
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs text-amber-400 bg-amber-500/10 border-amber-500/30">
                              <Zap className="w-3 h-3" />
                              <span>{r.otherTeamActionCount} rival {r.otherTeamActionCount === 1 ? "action" : "actions"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </RetroCard>
          </div>
        )}

        <div className="space-y-3">
          {filteredRecruits.map((recruit) => (
            <RecruitRow
              key={recruit.id}
              recruit={recruit}
              leagueId={id!}
              onTarget={() => targetMutation.mutate(recruit.id)}
              onScout={() => scoutMutation.mutate(recruit.id)}
              onPhone={(pitchTopic?: string) => phoneMutation.mutate({ recruitId: recruit.id, pitchTopic })}
              onEmail={(pitchTopic?: string) => emailMutation.mutate({ recruitId: recruit.id, pitchTopic })}
              onVisit={() => visitMutation.mutate(recruit.id)}
              onHeadCoachVisit={() => headCoachVisitMutation.mutate(recruit.id)}
              onOffer={() => offerMutation.mutate(recruit.id)}
              onSaveNotes={(notes) => notesMutation.mutate({ recruitId: recruit.id, notes })}
              onSetBoardRank={(boardRank) => boardRankMutation.mutate({ recruitId: recruit.id, boardRank })}
              onToggleCompare={() => toggleCompare(recruit)}
              isTargeting={targetMutation.isPending}
              isScouting={scoutMutation.isPending}
              isPhoning={phoneMutation.isPending}
              isEmailing={emailMutation.isPending}
              isVisiting={visitMutation.isPending}
              isHeadCoachVisiting={headCoachVisitMutation.isPending}
              isOffering={offerMutation.isPending}
              hasVisited={data?.premiumActionsUsed?.[recruit.id]?.includes("visit") ?? false}
              hasHeadCoachVisited={data?.premiumActionsUsed?.[recruit.id]?.includes("head_coach_visit") ?? false}
              phonedThisWeek={data?.weeklyActionsUsed?.[recruit.id]?.includes("phone") ?? false}
              emailedThisWeek={data?.weeklyActionsUsed?.[recruit.id]?.includes("email") ?? false}
              isSavingNotes={notesMutation.isPending}
              isSavingBoardRank={boardRankMutation.isPending}
              isSelected={compareRecruits.some(r => r.id === recruit.id)}
              isBulkSelected={bulkSelected.has(recruit.id)}
              onBulkSelect={() => toggleBulkSelect(recruit.id)}
              trend={trendsData?.trends?.[recruit.id]}
              userTeamId={data?.team?.id}
              positionNeed={pipelineData?.positionNeeds?.find(p => p.position === recruit.position)?.need}
              isStorylineRecruit={storylineRecruitIds.has(recruit.id)}
              outOfRecruitingActions={(data?.remainingPoints ?? 1) <= 0}
              remainingPoints={data?.remainingPoints ?? 0}
              visitCost={data?.recruitPointCosts?.[recruit.id]?.visit ?? 2}
              headCoachVisitCost={data?.recruitPointCosts?.[recruit.id]?.headCoachVisit ?? 2}
              outOfScoutActions={(data?.remainingScoutPoints ?? 1) <= 0}
              progressionEnabled={leagueData?.progressionEnabled}
            />
          ))}
        </div>

        {filteredRecruits.length === 0 && (
          <RetroCard variant="bordered" className="text-center py-12">
            {showWatchlistOnly ? (
              <>
                <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No recruits on your watchlist</p>
                <p className="text-xs text-muted-foreground">Click the target icon on any recruit to add them</p>
                <RetroButton 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => setShowWatchlistOnly(false)}
                  data-testid="button-clear-watchlist-filter"
                >
                  Show All Recruits
                </RetroButton>
              </>
            ) : (
              <>
                <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No recruits match your filters</p>
              </>
            )}
          </RetroCard>
        )}
      </main>

      <RecruitDetailModal
        recruit={selectedRecruit}
        onClose={() => setSelectedRecruit(null)}
        leagueId={id!}
        onScout={(recruitId) => scoutMutation.mutate(recruitId)}
        isScouting={scoutMutation.isPending}
        onPhone={(recruitId, pitchTopic) => phoneMutation.mutate({ recruitId, pitchTopic })}
        isPhoning={phoneMutation.isPending}
        onEmail={(recruitId, pitchTopic) => emailMutation.mutate({ recruitId, pitchTopic })}
        isEmailing={emailMutation.isPending}
        onVisit={(recruitId) => visitMutation.mutate(recruitId)}
        isVisiting={visitMutation.isPending}
        onHeadCoachVisit={(recruitId) => headCoachVisitMutation.mutate(recruitId)}
        isHeadCoachVisiting={headCoachVisitMutation.isPending}
        onOffer={(recruitId) => offerMutation.mutate(recruitId)}
        isOffering={offerMutation.isPending}
        outOfRecruitingActions={(data?.remainingPoints ?? 1) <= 0}
        remainingPoints={data?.remainingPoints ?? 0}
        visitCost={selectedRecruit ? (data?.recruitPointCosts?.[selectedRecruit.id]?.visit ?? 2) : 2}
        headCoachVisitCost={selectedRecruit ? (data?.recruitPointCosts?.[selectedRecruit.id]?.headCoachVisit ?? 2) : 2}
        hasVisited={selectedRecruit ? (data?.premiumActionsUsed?.[selectedRecruit.id]?.includes("visit") ?? false) : false}
        hasHeadCoachVisited={selectedRecruit ? (data?.premiumActionsUsed?.[selectedRecruit.id]?.includes("head_coach_visit") ?? false) : false}
      />

      <Dialog open={showSaveClassDialog} onOpenChange={(open) => { if (!open) setShowSaveClassDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Save Recruiting Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This saves a snapshot of the current recruiting class ({data?.recruits?.length || 0} recruits) to your dashboard.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">File Name</label>
              <input
                className="w-full bg-card border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold"
                value={saveClassName}
                onChange={(e) => setSaveClassName(e.target.value)}
                placeholder="e.g. My Team Class - Season 1"
                maxLength={80}
                data-testid="input-save-class-name"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <RetroButton variant="outline" size="sm" onClick={() => setShowSaveClassDialog(false)}>
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                onClick={() => saveClassMutation.mutate(saveClassName.trim() || "My Recruiting Class")}
                disabled={saveClassMutation.isPending || !saveClassName.trim()}
                data-testid="button-confirm-save-class"
              >
                {saveClassMutation.isPending ? "Saving..." : "Save"}
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionResultModal} onOpenChange={() => setActionResultModal(null)}>
        <DialogContent className="max-w-sm border-2 border-[#1a3a1a] bg-[#0d1f0d]" data-testid="action-result-modal">
          <div className="flex flex-col items-center gap-4 py-4">
            {actionResultModal?.type === "success" ? (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1a3a1a]">
                {actionResultModal.icon === "phone" && <Phone className="h-7 w-7 text-[#c8aa6e]" />}
                {actionResultModal.icon === "email" && <Mail className="h-7 w-7 text-[#c8aa6e]" />}
                {actionResultModal.icon === "visit" && <Building2 className="h-7 w-7 text-[#c8aa6e]" />}
                {actionResultModal.icon === "coach" && <Crown className="h-7 w-7 text-[#c8aa6e]" />}
                {actionResultModal.icon === "offer" && <GraduationCap className="h-7 w-7 text-[#c8aa6e]" />}
                {actionResultModal.icon === "scout" && <Eye className="h-7 w-7 text-[#c8aa6e]" />}
                {actionResultModal.icon === "check" && <CheckCircle className="h-7 w-7 text-green-400" />}
                {!actionResultModal.icon && <CheckCircle className="h-7 w-7 text-green-400" />}
              </div>
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-900/30">
                <XCircle className="h-7 w-7 text-red-400" />
              </div>
            )}
            <div className="text-center">
              <h3 className="font-['Press_Start_2P'] text-sm text-[#c8aa6e]" data-testid="action-result-title">
                {actionResultModal?.title}
              </h3>
              <p className="mt-2 text-sm text-gray-300" data-testid="action-result-description">
                {actionResultModal?.description}
              </p>
            </div>
            <RetroButton
              onClick={() => setActionResultModal(null)}
              className="mt-2"
              data-testid="action-result-dismiss"
            >
              OK
            </RetroButton>
          </div>
        </DialogContent>
      </Dialog>

      {compareRecruits.length > 0 && (
        <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 bg-card border border-gold rounded-lg shadow-lg p-3 flex items-center gap-4 z-50" data-testid="compare-bar">
          <span className="font-pixel text-[10px] text-gold">COMPARE:</span>
          <div className="flex items-center gap-2">
            {compareRecruits.map((r) => (
              <div key={r.id} className="flex items-center gap-1 bg-background/50 px-2 py-1 rounded">
                <span className="text-xs">{r.firstName} {r.lastName}</span>
                <button
                  onClick={() => toggleCompare(r)}
                  className="text-muted-foreground hover:text-red-400"
                  data-testid={`button-remove-compare-${r.id}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <RetroButton
            size="sm"
            onClick={() => setShowCompareModal(true)}
            disabled={compareRecruits.length < 2}
            data-testid="button-open-compare"
          >
            Compare ({compareRecruits.length}/3)
          </RetroButton>
          <RetroButton
            variant="outline"
            size="sm"
            onClick={() => setCompareRecruits([])}
            data-testid="button-clear-compare"
          >
            Clear
          </RetroButton>
        </div>
      )}

      <CompareModal
        recruits={compareRecruits}
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card border border-border p-3 rounded">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}

const IDEAL_DEPTH: Record<string, number> = {
  P: 12,
  C: 2,
  "1B": 2,
  "2B": 2,
  SS: 2,
  "3B": 2,
  OF: 6,
};

function TeamNeedsIndicator({ 
  nextYearDepth, 
  nextYearRosterSize, 
  seniorsGraduating,
  positionFilter,
  onPositionClick,
}: { 
  nextYearDepth: Record<string, number>; 
  nextYearRosterSize: number;
  seniorsGraduating: number;
  positionFilter?: string;
  onPositionClick?: (pos: string) => void;
}) {
  const positions = ["P", "C", "1B", "2B", "SS", "3B", "OF"];
  
  const getDepthStatus = (pos: string) => {
    const current = nextYearDepth[pos] || 0;
    const ideal = IDEAL_DEPTH[pos] || 2;
    if (current >= ideal) return "full";
    if (current >= ideal * 0.5) return "ok";
    return "need";
  };

  return (
    <div className="mt-4 pt-4 border-t border-border" data-testid="team-needs-indicator">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Users className="w-4 h-4 text-gold" />
        <span className="font-pixel text-[10px] text-gold">NEXT YEAR FORECAST</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {nextYearRosterSize}/25 players
        </span>
        {seniorsGraduating > 0 && (
          <span className="text-xs text-amber-400">
            ({seniorsGraduating} graduating)
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {positions.map((pos) => {
          const current = nextYearDepth[pos] || 0;
          const ideal = IDEAL_DEPTH[pos] || 2;
          const status = getDepthStatus(pos);
          
          const isActive = positionFilter === pos;
          return (
            <div
              key={pos}
              className={`p-2 rounded text-center border cursor-pointer transition-all ${
                isActive
                  ? "border-gold ring-2 ring-gold/50 ring-offset-1 ring-offset-background"
                  : status === "need" 
                    ? "border-red-500/50 bg-red-500/10" 
                    : status === "ok" 
                      ? "border-yellow-500/50 bg-yellow-500/10" 
                      : "border-green-500/50 bg-green-500/10"
              } hover:opacity-80`}
              onClick={() => onPositionClick?.(pos)}
              data-testid={`depth-${pos}`}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                {status === "need" && <AlertTriangle className="w-3 h-3 text-red-500" />}
                {status === "ok" && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                {status === "full" && <CheckCircle className="w-3 h-3 text-green-500" />}
              </div>
              <p className="font-pixel text-[10px] text-foreground">{pos}</p>
              <p className={`text-xs font-bold ${
                status === "need" ? "text-red-400" : status === "ok" ? "text-yellow-400" : "text-green-400"
              }`}>
                {current}/{ideal}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecruitRow({
  recruit,
  leagueId,
  onTarget,
  onScout,
  onPhone,
  onEmail,
  onVisit,
  onHeadCoachVisit,
  onOffer,
  onSaveNotes,
  onSetBoardRank,
  onToggleCompare,
  isTargeting,
  isScouting,
  isPhoning,
  isEmailing,
  isVisiting,
  isHeadCoachVisiting,
  isOffering,
  isSavingNotes,
  isSavingBoardRank,
  isSelected,
  isBulkSelected,
  onBulkSelect,
  trend,
  userTeamId,
  isStorylineRecruit,
  positionNeed,
  outOfRecruitingActions,
  remainingPoints,
  visitCost,
  headCoachVisitCost,
  outOfScoutActions,
  progressionEnabled,
  hasVisited,
  hasHeadCoachVisited,
  phonedThisWeek,
  emailedThisWeek,
}: {
  recruit: RecruitWithInterest;
  leagueId: string;
  onTarget: () => void;
  onScout: () => void;
  onPhone: (pitchTopic?: string) => void;
  onEmail: (pitchTopic?: string) => void;
  onVisit: () => void;
  onHeadCoachVisit: () => void;
  onOffer: () => void;
  onSaveNotes: (notes: string) => void;
  onSetBoardRank: (boardRank: number | null) => void;
  onToggleCompare: () => void;
  isTargeting: boolean;
  isScouting: boolean;
  isPhoning: boolean;
  isEmailing: boolean;
  isVisiting: boolean;
  isHeadCoachVisiting: boolean;
  isOffering: boolean;
  isSavingNotes: boolean;
  isSavingBoardRank: boolean;
  isSelected: boolean;
  isBulkSelected: boolean;
  onBulkSelect: () => void;
  trend?: { trend: "up" | "down" | "flat"; recentGain: number };
  userTeamId?: string;
  positionNeed?: boolean;
  outOfRecruitingActions?: boolean;
  remainingPoints: number;
  visitCost: number;
  headCoachVisitCost: number;
  outOfScoutActions?: boolean;
  progressionEnabled?: boolean;
  hasVisited?: boolean;
  hasHeadCoachVisited?: boolean;
  isStorylineRecruit?: boolean;
  phonedThisWeek?: boolean;
  emailedThisWeek?: boolean;
}) {
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notesValue, setNotesValue] = useState(recruit.interest?.notes || "");
  const [showRankEditor, setShowRankEditor] = useState(false);
  const [rankInputValue, setRankInputValue] = useState(String(recruit.interest?.boardRank ?? ""));
  const rankCommittedRef = useRef(false);
  const [showPhonePicker, setShowPhonePicker] = useState(false);
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [selectedPhonePitches, setSelectedPhonePitches] = useState<string[]>([]);
  const [selectedEmailPitch, setSelectedEmailPitch] = useState<string | null>(null);
  const [showTopSchools, setShowTopSchools] = useState(false);
  const [showMobileMore, setShowMobileMore] = useState(false);

  const pitchOptions = [
    { key: "proximity", label: "Proximity" },
    { key: "reputation", label: "Reputation" },
    { key: "playingTime", label: "Playing Time" },
    { key: "academics", label: "Academics" },
    { key: "prestige", label: "Prestige" },
    { key: "facilities", label: "Facilities" },
  ];

  const togglePhonePitch = (key: string) => {
    setSelectedPhonePitches(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  const stageBadges: Record<string, { label: string; color: string }> = {
    open: { label: "Open", color: "bg-gray-500" },
    top8: { label: "Top 8", color: "bg-blue-500" },
    top5: { label: "Top 5", color: "bg-green-500" },
    top3: { label: "Top 3", color: "bg-yellow-500" },
    verbal: { label: "Verbal", color: "bg-orange-500" },
    signed: { label: "Signed", color: "bg-red-500" },
  };

  const stage = stageBadges[recruit.stage] || stageBadges.open;
  const scoutPct = recruit.interest?.scoutPercentage || 0;
  // Blue chips always show full details; everyone else must wait for the signing-day reveal
  const isFullyRevealed = recruit.isBlueChip || !!recruit.signingDayRevealed;

  // Get display strings for overall and star rating based on scouting progress
  const getOverallDisplay = (): string => {
    if (isFullyRevealed) return recruit.overall.toString();
    if (scoutPct === 0) return "???";
    // Show range based on minOverall/maxOverall from interest
    const minOvr = recruit.interest?.minOverall || 1;
    const maxOvr = recruit.interest?.maxOverall || 999;
    if (maxOvr - minOvr <= 50) return `${minOvr}-${maxOvr}`;
    if (maxOvr - minOvr <= 150) return `${minOvr}-${maxOvr}`;
    return `${minOvr}-${maxOvr}`;
  };

  const getStarDisplay = (): string => {
    if (isFullyRevealed) return `${recruit.starRating}`;
    if (scoutPct === 0) return "?";
    const minStar = recruit.interest?.minStar || 1;
    const maxStar = recruit.interest?.maxStar || 5;
    if (minStar === maxStar) return `${minStar}`;
    return `${minStar}-${maxStar}`;
  };

  // Get number of revealed abilities
  const revealedAbilitiesCount = recruit.interest?.revealedAbilitiesCount || 0;
  const totalAbilities = recruit.abilities?.length || 0;

  const isSigned = recruit.stage === "signed" && !!recruit.signedTeamId;
  const interestMeta = recruit.interest?.interestLevel != null
    ? getInterestLabel(recruit.interest.interestLevel)
    : null;

  const rowStyle = (() => {
    if (isSigned && recruit.signedTeamPrimaryColor) {
      return { borderLeft: `4px solid ${recruit.signedTeamPrimaryColor}` };
    }
    if (isFullyRevealed && recruit.starRating >= 5) {
      return { borderLeft: "3px solid rgba(196,163,90,0.75)", background: "rgba(196,163,90,0.03)" };
    }
    return undefined;
  })();

  return (
    <RetroCard 
      className={`hover:border-gold/30 transition-colors ${isSelected ? "border-gold ring-1 ring-gold/50" : ""}`} 
      data-testid={`card-recruit-${recruit.id}`}
      style={rowStyle}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-4 flex-1">
          {!isSigned && scoutPct < 100 && (
            <button
              onClick={(e) => { e.stopPropagation(); onBulkSelect(); }}
              className={`w-5 h-5 flex items-center justify-center transition-colors ${
                isBulkSelected ? "text-gold" : "text-muted-foreground/50 hover:text-gold"
              }`}
              data-testid={`checkbox-bulk-${recruit.id}`}
            >
              {isBulkSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </button>
          )}
          {!isSigned && (
            <button
              onClick={onToggleCompare}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected ? "bg-gold border-gold text-forest-dark" : "border-muted-foreground/50 hover:border-gold"
              }`}
              data-testid={`checkbox-compare-${recruit.id}`}
            >
              {isSelected && <Check className="w-3 h-3" />}
            </button>
          )}
          <div className="w-12 h-12 relative flex-shrink-0">
            <PlayerPortrait 
              skinTone={recruit.skinTone || "light"}
              hairColor={recruit.hairColor || "brown"}
              hairStyle={recruit.hairStyle || "short"}
              facialHair={recruit.facialHair || "none"}
              eyeStyle={recruit.eyeStyle || undefined}
              eyebrowStyle={recruit.eyebrowStyle || undefined}
              mouthStyle={recruit.mouthStyle || undefined}
              eyeBlack={recruit.eyeBlack ?? undefined}
              playerId={recruit.id}
              className="w-12 h-12"
              isRecruit={true}
            />
            <div className="absolute -bottom-1 -left-1">
              <PositionBadge position={recruit.position} size="sm" />
            </div>
            {recruit.isBlueChip && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-background flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">B</span>
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Link href={`/league/${leagueId}/recruit/${recruit.id}`} className="hover:text-gold">
                <span className="font-medium">{recruit.firstName} {recruit.lastName}</span>
              </Link>
              {recruit.isBlueChip && (
                <Badge className="bg-blue-500 text-white text-[8px]">Blue Chip</Badge>
              )}
              {isSigned && recruit.signedTeamAbbreviation ? (
                <Badge 
                  className="text-white text-[8px]"
                  style={{ backgroundColor: recruit.signedTeamPrimaryColor || "#666" }}
                >
                  Signed: {recruit.signedTeamAbbreviation}
                </Badge>
              ) : (
                <Badge className={`${stage.color} text-white text-[8px]`}>{stage.label}</Badge>
              )}
              {recruit.recruitType === "TRANSFER" ? (
                <Badge className="bg-purple-600/30 text-purple-400 border-purple-600/50 text-[8px] no-default-hover-elevate no-default-active-elevate" data-testid={`badge-transfer-${recruit.id}`}>
                  TRANSFER {recruit.recruitYear || ""} {recruit.fromTeamName ? `(${recruit.fromTeamName})` : ""}
                </Badge>
              ) : recruit.recruitType === "JUCO" ? (
                <Badge className="bg-cyan-600/30 text-cyan-400 border-cyan-600/50 text-[8px] no-default-hover-elevate no-default-active-elevate" data-testid={`badge-juco-${recruit.id}`}>
                  JUCO {recruit.recruitYear || "FR"} {recruit.fromTeamName ? `(${recruit.fromTeamName})` : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[8px]" data-testid={`badge-type-${recruit.id}`}>
                  {recruit.recruitType || "HS"}
                </Badge>
              )}
              {totalAbilities > 0 && (
                <Badge variant="outline" className="text-[8px] border-gold/50 text-gold">
                  {isFullyRevealed ? `${totalAbilities} Abilities` : `${revealedAbilitiesCount}/${totalAbilities > revealedAbilitiesCount ? "?" : totalAbilities}`}
                </Badge>
              )}
              {recruit.position !== "P" && recruit.trajectory != null && (
                <Badge variant="outline" className="text-[8px] border-gold/30 text-gold/70" data-testid={`badge-traj-${recruit.id}`}>
                  {TRAJECTORY_LABELS[recruit.trajectory] ?? "LD"}
                </Badge>
              )}
              {positionNeed && (
                <Badge variant="outline" className="text-[8px] border-red-500/50 text-red-400">
                  NEED
                </Badge>
              )}
              {isStorylineRecruit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[8px] border-purple-500/50 text-purple-400 bg-purple-500/10 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-storyline-${recruit.id}`}>
                      <BookOpen className="w-2.5 h-2.5 mr-0.5" />STORY
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>This recruit has an active storyline arc</TooltipContent>
                </Tooltip>
              )}
              {recruit.teamsIn != null && recruit.teamsIn > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={`text-[8px] no-default-hover-elevate no-default-active-elevate ${
                        recruit.teamsIn >= 5
                          ? "border-red-500/60 text-red-400 bg-red-500/10"
                          : recruit.teamsIn >= 3
                          ? "border-orange-500/60 text-orange-400 bg-orange-500/10"
                          : "border-yellow-500/60 text-yellow-400 bg-yellow-500/10"
                      }`}
                      data-testid={`badge-rivalry-${recruit.id}`}
                    >
                      <Flame className="w-2.5 h-2.5 mr-0.5" />
                      {recruit.teamsIn} {recruit.teamsIn === 1 ? "team" : "teams"} in
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {recruit.teamsIn >= 5 ? "Heavy" : recruit.teamsIn >= 3 ? "Moderate" : "Light"} competition — {recruit.teamsIn} {recruit.teamsIn === 1 ? "rival has" : "rivals have"} {">"} 20% interest or an offer out{recruit.offersOut && recruit.offersOut > 0 ? ` (${recruit.offersOut} with offer)` : ""}
                  </TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isGenerationalGem && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-amber-500 text-black border-amber-400 no-default-hover-elevate no-default-active-elevate">
                      <Star className="w-3 h-3 mr-0.5 fill-current" />
                      GENERATIONAL GEM
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Generational Talent - Once-in-a-generation player hidden in the recruiting class</TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isGenerationalBust && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-red-700 text-white border-red-600 no-default-hover-elevate no-default-active-elevate">
                      <Skull className="w-3 h-3 mr-0.5" />
                      GENERATIONAL BUST
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Generational Bust - An overhyped recruit who will severely disappoint</TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isGem && !recruit.isGenerationalGem && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center justify-center w-5 h-5 bg-green-500/20 rounded-full">
                      <Gem className="w-3 h-3 text-green-400" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Gem - Better than ranking suggests</TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isBust && !recruit.isGenerationalBust && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center justify-center w-5 h-5 bg-red-500/20 rounded-full">
                      <XCircle className="w-3 h-3 text-red-400" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Bust - Worse than ranking suggests</TooltipContent>
                </Tooltip>
              )}
              {scoutPct >= 50 && recruit.playerArchetype === "late_bloomer" && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-emerald-500/15 text-emerald-400 border-emerald-500/40 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-upside-${recruit.id}`}>
                      <TrendingUp className="w-2.5 h-2.5 mr-0.5" />UPSIDE
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Late Bloomer - Higher ceiling than current rating suggests</TooltipContent>
                </Tooltip>
              )}
              {scoutPct >= 75 && recruit.playerArchetype === "overdraft" && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-orange-500/15 text-orange-400 border-orange-500/40 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-ceiling-${recruit.id}`}>
                      <TrendingDown className="w-2.5 h-2.5 mr-0.5" />CEILING
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Overdraft - Lower ceiling than current rating suggests</TooltipContent>
                </Tooltip>
              )}
              {scoutPct >= 50 && recruit.playerArchetype === "raw" && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="text-[8px] bg-yellow-500/15 text-yellow-400 border-yellow-500/40 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-raw-${recruit.id}`}>
                      <Zap className="w-2.5 h-2.5 mr-0.5" />RAW
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Raw Prospect - Extreme tool variance, high risk/high reward</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {recruit.hometown}, {recruit.homeState}
              </span>
              <span className="text-[10px]">
                {recruit.throwHand}/{recruit.batHand === "S" ? "S" : recruit.batHand}
              </span>
              <StarRating rating={recruit.starRank} size="sm" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-center min-w-[70px]">
            <p className={`font-bold ${isFullyRevealed ? "text-lg" : "text-sm"} text-gold`}>
              {getOverallDisplay()}
            </p>
            <p className="text-[10px] text-muted-foreground">OVR</p>
          </div>
          <div className="text-center min-w-[40px]">
            <p className="font-bold text-sm">
              #{recruit.classRank || "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">CLASS</p>
          </div>
          <div className="text-center min-w-[40px]">
            <p className="font-bold text-sm">
              #{recruit.positionRank || "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">{recruit.position}</p>
          </div>
          <div className="text-center min-w-[40px]">
            {showRankEditor ? (
              <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={rankInputValue}
                  onChange={(e) => setRankInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      rankCommittedRef.current = true;
                      const n = parseInt(rankInputValue, 10);
                      onSetBoardRank(isNaN(n) || n < 1 ? null : Math.min(n, 99));
                      setShowRankEditor(false);
                    } else if (e.key === "Escape") {
                      rankCommittedRef.current = true;
                      setRankInputValue(String(recruit.interest?.boardRank ?? ""));
                      setShowRankEditor(false);
                    }
                  }}
                  onBlur={() => {
                    if (rankCommittedRef.current) {
                      rankCommittedRef.current = false;
                      return;
                    }
                    const n = parseInt(rankInputValue, 10);
                    onSetBoardRank(isNaN(n) || n < 1 ? null : Math.min(n, 99));
                    setShowRankEditor(false);
                  }}
                  autoFocus
                  className="w-8 text-center text-xs bg-background border border-gold/50 rounded px-0.5 py-0.5 text-gold focus:outline-none focus:border-gold"
                  data-testid={`input-board-rank-${recruit.id}`}
                />
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSetBoardRank(null); setRankInputValue(""); setShowRankEditor(false); }}
                  className="text-muted-foreground hover:text-red-400 text-[9px] leading-none"
                  title="Clear rank"
                >✕</button>
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRankInputValue(String(recruit.interest?.boardRank ?? "")); setShowRankEditor(true); }}
                    disabled={isSavingBoardRank}
                    className={`font-bold text-sm transition-colors ${recruit.interest?.boardRank != null ? "text-gold hover:text-gold/70" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`}
                    data-testid={`button-board-rank-${recruit.id}`}
                  >
                    {recruit.interest?.boardRank != null ? `#${recruit.interest.boardRank}` : "—"}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {recruit.interest?.boardRank != null ? `Board rank #${recruit.interest.boardRank} — click to edit` : "Click to set your board rank"}
                </TooltipContent>
              </Tooltip>
            )}
            <p className="text-[10px] text-muted-foreground">BOARD</p>
          </div>
          {recruit.potentialFloor != null && recruit.potentialCeiling != null && scoutPct >= 100 && (
            <div className="text-center min-w-[50px]">
              <p className="font-bold text-sm text-amber-400">
                {getPotentialRangeLabel(recruit.potentialFloor, recruit.potentialCeiling)}
              </p>
              <p className="text-[10px] text-muted-foreground">POT</p>
            </div>
          )}
        </div>

        {isSigned ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: `${recruit.signedTeamPrimaryColor}20` || "rgba(100,100,100,0.1)" }}>
              <TeamBadge 
                abbreviation={recruit.signedTeamAbbreviation || "?"} 
                primaryColor={recruit.signedTeamPrimaryColor || "#666"} 
                secondaryColor={recruit.signedTeamSecondaryColor || "#fff"} 
                name={recruit.signedTeamName || ""}
                size="sm" 
              />
              <span className="text-xs font-medium" style={{ color: recruit.signedTeamPrimaryColor || "#ccc" }}>
                {recruit.signedTeamName || "Unknown"}
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/league/${leagueId}/recruit/${recruit.id}`}>
                  <RetroButton size="sm" data-testid={`button-view-${recruit.id}`}>
                    <Eye className="w-3 h-3" />
                  </RetroButton>
                </Link>
              </TooltipTrigger>
              <TooltipContent>View Details</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            {/* Mobile compact quick-actions — Scout + More popover */}
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="text-[9px]">Scout</span>
                  <div className="flex items-center gap-1.5">
                    {trend && trend.trend !== "flat" && (
                      <span className={`text-[9px] ${trend.trend === "up" ? "text-green-400" : "text-red-400"}`} data-testid={`trend-mobile-${recruit.id}`}>
                        {trend.trend === "up" ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                      </span>
                    )}
                    <span className="text-[9px]">{scoutPct}%</span>
                  </div>
                </div>
                <Progress value={scoutPct} className="h-1.5" />
                <div className="flex justify-between items-center">
                  <span className="text-[9px] text-muted-foreground">Interest</span>
                  {interestMeta ? (
                    <div className="flex items-center gap-1" data-testid={`interest-bar-mobile-${recruit.id}`}>
                      <div className="w-16 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getInterestBarColor(recruit.interest!.interestLevel)}`}
                          style={{ width: `${recruit.interest!.interestLevel}%` }}
                        />
                      </div>
                      <span className={`text-[9px] font-bold ${interestMeta.color}`}>{interestMeta.label}</span>
                    </div>
                  ) : (
                    <span className="text-[9px] text-muted-foreground/50">?</span>
                  )}
                </div>
              </div>
              <RetroButton
                variant="outline"
                size="sm"
                onClick={onScout}
                disabled={isScouting || scoutPct >= 100 || outOfScoutActions}
                data-testid={`button-scout-mobile-${recruit.id}`}
              >
                <Search className="w-3 h-3 mr-1" />
                <span className="text-[9px]">Scout</span>
              </RetroButton>
              <Popover open={showMobileMore} onOpenChange={setShowMobileMore}>
                <PopoverTrigger asChild>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    data-testid={`button-more-mobile-${recruit.id}`}
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </RetroButton>
                </PopoverTrigger>
                <PopoverContent className="w-44 bg-card border-border p-1.5" align="end" data-testid={`popover-more-${recruit.id}`}>
                  <div className="flex flex-col gap-0.5">
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${recruit.interest?.isTargeted ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { onTarget(); setShowMobileMore(false); }}
                      disabled={isTargeting}
                      data-testid={`button-target-mobile-${recruit.id}`}
                    >
                      <Target className="w-3 h-3 flex-shrink-0" />
                      {recruit.interest?.isTargeted ? "Untarget" : "Target"}
                    </button>
                    <button
                      className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                      onClick={() => { setShowPhonePicker(true); setShowEmailPicker(false); setSelectedPhonePitches([]); setShowMobileMore(false); }}
                      disabled={isPhoning || !recruit.interest || outOfRecruitingActions || phonedThisWeek || remainingPoints < 2}
                      data-testid={`button-phone-mobile-${recruit.id}`}
                    >
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      {phonedThisWeek ? "Called (limit)" : "Call (2 pts)"}
                    </button>
                    <button
                      className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                      onClick={() => { setShowEmailPicker(true); setShowPhonePicker(false); setSelectedEmailPitch(null); setShowMobileMore(false); }}
                      disabled={isEmailing || !recruit.interest || outOfRecruitingActions || emailedThisWeek}
                      data-testid={`button-email-mobile-${recruit.id}`}
                    >
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      {emailedThisWeek ? "Emailed (limit)" : "Email (1 pt)"}
                    </button>
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${hasVisited ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { onVisit(); setShowMobileMore(false); }}
                      disabled={isVisiting || !recruit.interest || remainingPoints < visitCost || hasVisited}
                      data-testid={`button-visit-mobile-${recruit.id}`}
                    >
                      <Building2 className="w-3 h-3 flex-shrink-0" />
                      {hasVisited ? "Visited" : `Visit (${visitCost} pts)`}
                    </button>
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${hasHeadCoachVisited ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { onHeadCoachVisit(); setShowMobileMore(false); }}
                      disabled={isHeadCoachVisiting || !recruit.interest || remainingPoints < headCoachVisitCost || hasHeadCoachVisited}
                      data-testid={`button-hcvisit-mobile-${recruit.id}`}
                    >
                      <Crown className="w-3 h-3 flex-shrink-0" />
                      {hasHeadCoachVisited ? "HC Visited" : `HC Visit (${headCoachVisitCost} pts)`}
                    </button>
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${recruit.interest?.hasOffer ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { onOffer(); setShowMobileMore(false); }}
                      disabled={isOffering || !recruit.interest || recruit.interest?.hasOffer}
                      data-testid={`button-offer-mobile-${recruit.id}`}
                    >
                      <Gift className="w-3 h-3 flex-shrink-0" />
                      {recruit.interest?.hasOffer ? "Offered" : "Offer Scholarship"}
                    </button>
                    <button
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${recruit.interest?.notes ? "text-gold bg-gold/10" : "text-foreground hover:bg-muted/50"} disabled:opacity-50`}
                      onClick={() => { setShowNotesDialog(true); setShowMobileMore(false); }}
                      disabled={!recruit.interest}
                      data-testid={`button-notes-mobile-${recruit.id}`}
                    >
                      <StickyNote className="w-3 h-3 flex-shrink-0" />
                      Notes
                    </button>
                    <div className="border-t border-border my-0.5" />
                    <Link href={`/league/${leagueId}/recruit/${recruit.id}`}>
                      <button
                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted/50 transition-colors"
                        data-testid={`button-view-mobile-${recruit.id}`}
                      >
                        <Eye className="w-3 h-3 flex-shrink-0" />
                        View Full Profile
                      </button>
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Desktop full actions — hidden on mobile */}
            <div className="hidden lg:flex items-center gap-4 flex-wrap">
              <div className="w-36 space-y-1.5">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
                    <span className="text-[9px]">Scout</span>
                    <div className="flex items-center gap-1">
                      {trend && trend.trend !== "flat" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-[9px] cursor-default ${trend.trend === "up" ? "text-green-400" : "text-red-400"}`} data-testid={`trend-${recruit.id}`}>
                              {trend.trend === "up" ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {trend.trend === "up" ? `Interest rising (+${trend.recentGain} recently)` : `Interest falling (${trend.recentGain} recently)`}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <span className="text-[9px]">{scoutPct}%</span>
                    </div>
                  </div>
                  <Progress value={scoutPct} className="h-1.5" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] text-muted-foreground">Interest</span>
                    {interestMeta ? (
                      <span className={`text-[9px] font-bold ${interestMeta.color}`} data-testid={`interest-label-${recruit.id}`}>
                        {interestMeta.label}
                      </span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground/50">?</span>
                    )}
                  </div>
                  {interestMeta ? (
                    <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden" data-testid={`interest-bar-${recruit.id}`}>
                      <div
                        className={`h-full rounded-full transition-all ${getInterestBarColor(recruit.interest!.interestLevel)}`}
                        style={{ width: `${recruit.interest!.interestLevel}%` }}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-1.5 bg-muted/20 rounded-full" />
                  )}
                </div>
              </div>

              <div className="flex gap-1.5 flex-wrap">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant="outline"
                      size="sm"
                      onClick={onScout}
                      disabled={isScouting || scoutPct >= 100 || outOfScoutActions}
                      data-testid={`button-scout-${recruit.id}`}
                    >
                      <Search className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">Scout</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>Scout (1 scouting point)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={recruit.interest?.isTargeted ? "primary" : "outline"}
                      size="sm"
                      onClick={onTarget}
                      disabled={isTargeting}
                      data-testid={`button-target-${recruit.id}`}
                    >
                      <Target className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">Target</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{recruit.interest?.isTargeted ? "Untarget" : "Target"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={phonedThisWeek ? "primary" : showPhonePicker ? "primary" : "outline"}
                      size="sm"
                      onClick={() => { if (!phonedThisWeek) { setShowPhonePicker(!showPhonePicker); setShowEmailPicker(false); setSelectedPhonePitches([]); } }}
                      disabled={isPhoning || !recruit.interest || outOfRecruitingActions || phonedThisWeek || remainingPoints < 2}
                      data-testid={`button-phone-${recruit.id}`}
                    >
                      <Phone className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{phonedThisWeek ? "Called" : "Call (2)"}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{phonedThisWeek ? "Already called this recruit this week (1 per week max)" : "Phone Call - 2 recruiting points (3 pitches)"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={emailedThisWeek ? "primary" : showEmailPicker ? "primary" : "outline"}
                      size="sm"
                      onClick={() => { if (!emailedThisWeek) { setShowEmailPicker(!showEmailPicker); setShowPhonePicker(false); setSelectedEmailPitch(null); } }}
                      disabled={isEmailing || !recruit.interest || outOfRecruitingActions || emailedThisWeek}
                      data-testid={`button-email-${recruit.id}`}
                    >
                      <Mail className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{emailedThisWeek ? "Emailed" : "Email (1)"}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{emailedThisWeek ? "Already emailed this recruit this week (1 per week max)" : "Send Email - 1 recruiting point (1 pitch)"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={hasVisited ? "primary" : "outline"}
                      size="sm"
                      onClick={onVisit}
                      disabled={isVisiting || !recruit.interest || remainingPoints < visitCost || hasVisited}
                      data-testid={`button-visit-${recruit.id}`}
                    >
                      <Building2 className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{hasVisited ? "Visited" : `Visit (${visitCost})`}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{hasVisited ? "Campus Visit Used" : remainingPoints < visitCost ? `Need ${visitCost} points for Campus Visit` : `Campus Visit - ${visitCost} recruiting points`}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={hasHeadCoachVisited ? "primary" : "outline"}
                      size="sm"
                      onClick={onHeadCoachVisit}
                      disabled={isHeadCoachVisiting || !recruit.interest || remainingPoints < headCoachVisitCost || hasHeadCoachVisited}
                      data-testid={`button-head-coach-visit-${recruit.id}`}
                    >
                      <Crown className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{hasHeadCoachVisited ? "HC Visited" : `HC Visit (${headCoachVisitCost})`}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{hasHeadCoachVisited ? "Head Coach Visit Used" : remainingPoints < headCoachVisitCost ? `Need ${headCoachVisitCost} points for HC Visit` : `Head Coach Visit - ${headCoachVisitCost} recruiting points`}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={recruit.interest?.hasOffer ? "primary" : "outline"}
                      size="sm"
                      onClick={onOffer}
                      disabled={isOffering || !recruit.interest || recruit.interest?.hasOffer}
                      data-testid={`button-offer-${recruit.id}`}
                    >
                      <Gift className="w-3 h-3 mr-1" />
                      <span className="text-[9px]">{recruit.interest?.hasOffer ? "Offered" : "Offer"}</span>
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>{recruit.interest?.hasOffer ? "Scholarship Offered" : "Offer Scholarship (1 recruiting point)"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={`/league/${leagueId}/recruit/${recruit.id}`}>
                      <RetroButton
                        size="sm"
                        data-testid={`button-view-${recruit.id}`}
                      >
                        <Eye className="w-3 h-3" />
                      </RetroButton>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>View Details</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RetroButton
                      variant={recruit.interest?.notes ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setShowNotesDialog(true)}
                      disabled={!recruit.interest}
                      data-testid={`button-notes-${recruit.id}`}
                    >
                      <StickyNote className="w-3 h-3" />
                    </RetroButton>
                  </TooltipTrigger>
                  <TooltipContent>Notes</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </>
        )}
      </div>

      {showPhonePicker && (
        <div className="mt-3 p-3 bg-muted/30 border border-border rounded" data-testid={`pitch-picker-phone-${recruit.id}`}>
          <p className="text-[10px] font-pixel text-gold mb-2">SELECT UP TO 3 PITCHES FOR PHONE CALL</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pitchOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => togglePhonePitch(opt.key)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  selectedPhonePitches.includes(opt.key)
                    ? "bg-gold/20 border-gold text-gold"
                    : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                }`}
                data-testid={`pitch-option-phone-${opt.key}-${recruit.id}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <RetroButton
              size="sm"
              onClick={() => {
                onPhone(selectedPhonePitches.length > 0 ? selectedPhonePitches.join(",") : undefined);
                setShowPhonePicker(false);
                setSelectedPhonePitches([]);
              }}
              disabled={selectedPhonePitches.length === 0 || isPhoning}
              data-testid={`button-send-phone-${recruit.id}`}
            >
              <Phone className="w-3 h-3 mr-1" />
              Call ({selectedPhonePitches.length}/3)
            </RetroButton>
            <RetroButton variant="outline" size="sm" onClick={() => { setShowPhonePicker(false); setSelectedPhonePitches([]); }}>
              Cancel
            </RetroButton>
          </div>
        </div>
      )}

      {showEmailPicker && (
        <div className="mt-3 p-3 bg-muted/30 border border-border rounded" data-testid={`pitch-picker-email-${recruit.id}`}>
          <p className="text-[10px] font-pixel text-gold mb-2">SELECT 1 PITCH FOR EMAIL</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pitchOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSelectedEmailPitch(selectedEmailPitch === opt.key ? null : opt.key)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  selectedEmailPitch === opt.key
                    ? "bg-gold/20 border-gold text-gold"
                    : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                }`}
                data-testid={`pitch-option-email-${opt.key}-${recruit.id}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <RetroButton
              size="sm"
              onClick={() => {
                onEmail(selectedEmailPitch || undefined);
                setShowEmailPicker(false);
                setSelectedEmailPitch(null);
              }}
              disabled={!selectedEmailPitch || isEmailing}
              data-testid={`button-send-email-${recruit.id}`}
            >
              <Mail className="w-3 h-3 mr-1" />
              Send Email
            </RetroButton>
            <RetroButton variant="outline" size="sm" onClick={() => { setShowEmailPicker(false); setSelectedEmailPitch(null); }}>
              Cancel
            </RetroButton>
          </div>
        </div>
      )}

      {recruit.interest?.notes && (
        <div className="mt-2 px-4 py-2 bg-gold/10 border border-gold/20 rounded text-sm text-muted-foreground">
          <span className="text-gold font-pixel text-[8px]">NOTE: </span>
          {recruit.interest.notes}
        </div>
      )}

      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">
              Notes for {recruit.firstName} {recruit.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Add your personal notes about this recruit..."
              className="min-h-[100px] bg-background border-border"
              data-testid="textarea-notes"
            />
            <div className="flex gap-2 justify-end">
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setShowNotesDialog(false)}
                data-testid="button-cancel-notes"
              >
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                onClick={() => {
                  onSaveNotes(notesValue);
                  setShowNotesDialog(false);
                }}
                disabled={isSavingNotes}
                data-testid="button-save-notes"
              >
                Save Notes
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {recruit.topSchools && recruit.topSchools.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <button
            onClick={() => setShowTopSchools(!showTopSchools)}
            className="flex items-center justify-between w-full mb-2 group"
            data-testid={`button-toggle-top-schools-${recruit.id}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Your Rank</span>
              {(() => {
                const visibleCount = recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8;
                const visibleSchools = recruit.topSchools!.slice(0, visibleCount);
                const userIdx = visibleSchools.findIndex(s => s.teamId === userTeamId);
                if (userIdx >= 0) {
                  return (
                    <span className="text-[9px] font-pixel text-gold" data-testid={`text-user-school-rank-${recruit.id}`}>
                      #{userIdx + 1} of {visibleSchools.length}
                    </span>
                  );
                }
                return (
                  <span className="text-[9px] text-muted-foreground/60" data-testid={`text-user-school-absent-${recruit.id}`}>
                    Not Listed
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[8px]">
                {recruit.stage === "open" ? "8 Schools" : recruit.stage === "top8" ? "Top 8" : recruit.stage === "top5" ? "Top 5" : recruit.stage === "top3" ? "Top 3" : recruit.stage}
              </Badge>
              {showTopSchools ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
            </div>
          </button>
          {showTopSchools && (
            <div className="space-y-1.5">
              {recruit.topSchools.slice(0, recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8).map((school, i) => {
                const isUserSchool = userTeamId && school.teamId === userTeamId;
                const schoolTrend = isUserSchool ? trend : undefined;
                return (
                  <div key={school.teamId} className={`flex items-center gap-2 ${isUserSchool ? "bg-gold/5 -mx-1 px-1 rounded" : ""}`}>
                    <TeamBadge
                      abbreviation={school.abbreviation}
                      primaryColor={school.primaryColor}
                      name={school.teamName}
                      size="sm"
                    />
                    <span className="text-[10px] text-muted-foreground w-8">{school.abbreviation}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all"
                        style={{ 
                          width: `${Math.min(100, Math.round(school.interestLevel / 20) * 20)}%`,
                          backgroundColor: isUserSchool ? school.primaryColor : school.primaryColor
                        }}
                      />
                    </div>
                    {schoolTrend && schoolTrend.trend !== "flat" && (
                      <div className={`flex items-center gap-0.5 text-[10px] min-w-[40px] ${schoolTrend.trend === "up" ? "text-green-400" : "text-red-400"}`}>
                        {schoolTrend.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        <span>{schoolTrend.trend === "up" ? "+" : ""}{schoolTrend.recentGain}</span>
                      </div>
                    )}
                    <span className={`text-[10px] w-16 text-right flex-shrink-0 ${getInterestLabel(school.interestLevel).color}`}>{getInterestLabel(school.interestLevel).label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </RetroCard>
  );
}

function RecruitDetailModal({
  recruit,
  onClose,
  leagueId,
  onScout,
  isScouting,
  onPhone,
  isPhoning,
  onEmail,
  isEmailing,
  onVisit,
  isVisiting,
  onHeadCoachVisit,
  isHeadCoachVisiting,
  onOffer,
  isOffering,
  outOfRecruitingActions,
  remainingPoints,
  visitCost,
  headCoachVisitCost,
  hasVisited,
  hasHeadCoachVisited,
}: {
  recruit: RecruitWithInterest | null;
  onClose: () => void;
  leagueId: string;
  onScout: (recruitId: string) => void;
  isScouting: boolean;
  onPhone: (recruitId: string, pitchTopic?: string) => void;
  isPhoning: boolean;
  onEmail: (recruitId: string, pitchTopic?: string) => void;
  isEmailing: boolean;
  onVisit: (recruitId: string) => void;
  isVisiting: boolean;
  onHeadCoachVisit: (recruitId: string) => void;
  isHeadCoachVisiting: boolean;
  onOffer: (recruitId: string) => void;
  isOffering: boolean;
  outOfRecruitingActions?: boolean;
  remainingPoints: number;
  visitCost: number;
  headCoachVisitCost: number;
  hasVisited?: boolean;
  hasHeadCoachVisited?: boolean;
}) {
  const isMobile = useIsMobile();
  const [modalPhonePitches, setModalPhonePitches] = useState<string[]>([]);
  const [modalEmailPitch, setModalEmailPitch] = useState<string | null>(null);
  const [showModalPhonePicker, setShowModalPhonePicker] = useState(false);
  const [showModalEmailPicker, setShowModalEmailPicker] = useState(false);

  const modalPitchOptions = [
    { key: "proximity", label: "Proximity" },
    { key: "reputation", label: "Reputation" },
    { key: "playingTime", label: "Playing Time" },
    { key: "academics", label: "Academics" },
    { key: "prestige", label: "Prestige" },
    { key: "facilities", label: "Facilities" },
  ];

  const toggleModalPhonePitch = (key: string) => {
    setModalPhonePitches(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  if (!recruit) return null;

  const scoutPct = recruit.interest?.scoutPercentage || 0;
  // Set of fields locked until signing day reveal (server has already nulled their values)
  const sdLocked = new Set<string>(recruit.signingDayLockedFields || []);
  // Blue chips always show everything; all others unlock only at the signing-day cinematic.
  const isFullyRevealed = recruit.isBlueChip || !!recruit.signingDayRevealed;
  const revealedAttrs = recruit.isBlueChip 
    ? ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "velocity", "control", "stamina"]
    : (recruit.interest?.revealedAttributes || []);

  // Progressive reveal display functions for modal
  const getOverallDisplay = (): string => {
    if (isFullyRevealed) return recruit.overall.toString();
    if (scoutPct === 0) return "???";
    const minOvr = recruit.interest?.minOverall || 1;
    const maxOvr = recruit.interest?.maxOverall || 999;
    return `${minOvr}-${maxOvr}`;
  };

  const getStarDisplay = (): string => {
    if (isFullyRevealed) return `${recruit.starRating}`;
    if (scoutPct === 0) return "?";
    const minStar = recruit.interest?.minStar || 1;
    const maxStar = recruit.interest?.maxStar || 5;
    if (minStar === maxStar) return `${minStar}`;
    return `${minStar}-${maxStar}`;
  };

  const revealedAbilitiesCount = recruit.interest?.revealedAbilitiesCount || 0;

  const fielderAttrs = [
    { key: "hitForAvg", label: "Hit for Avg", value: recruit.hitForAvg },
    { key: "power", label: "Power", value: recruit.power },
    { key: "speed", label: "Speed", value: recruit.speed },
    { key: "arm", label: "Arm", value: recruit.arm },
    { key: "fielding", label: "Fielding", value: recruit.fielding },
    { key: "errorResistance", label: "Error Res", value: recruit.errorResistance },
  ];

  const pitcherAttrs = [
    { key: "velocity", label: "Velocity", value: recruit.velocity },
    { key: "control", label: "Control", value: recruit.control },
    { key: "stamina", label: "Stamina", value: recruit.stamina },
  ];

  const attrs = recruit.position === "P" ? pitcherAttrs : fielderAttrs;

  const priorities = [
    { key: "proximityPriority", label: "Proximity to Home", value: recruit.proximityPriority },
    { key: "reputationPriority", label: "Coach Reputation", value: recruit.reputationPriority },
    { key: "playingTimePriority", label: "Playing Time", value: recruit.playingTimePriority },
    { key: "academicsPriority", label: "Academics", value: recruit.academicsPriority },
    { key: "prestigePriority", label: "School Prestige", value: recruit.prestigePriority },
    { key: "facilitiesPriority", label: "Facilities", value: recruit.facilitiesPriority },
  ];

  const generatePitchMix = () => {
    if (recruit.position !== "P") return [];
    const basePitches = [
      { name: "FB", rating: isFullyRevealed || revealedAttrs.includes("velocity") ? Math.min(99, (recruit.velocity || 50) + 20) : 0 },
      { name: "SL", rating: isFullyRevealed || revealedAttrs.includes("control") ? Math.floor((recruit.control || 0) * 0.8) : 0 },
      { name: "CB", rating: isFullyRevealed || revealedAttrs.includes("control") ? Math.floor((recruit.control || 0) * 0.7) : 0 },
      { name: "CH", rating: isFullyRevealed || revealedAttrs.includes("control") ? Math.floor((recruit.control || 0) * 0.6) : 0 },
      { name: "CT", rating: 0 },
      { name: "SNK", rating: 0 },
    ];
    return basePitches;
  };

  const headerContent = (
    <div className="flex items-start gap-4">
      <PlayerPortrait 
        skinTone={recruit.skinTone || "light"}
        hairColor={recruit.hairColor || "brown"}
        hairStyle={recruit.hairStyle || "short"}
        facialHair={recruit.facialHair || "none"}
        eyeStyle={recruit.eyeStyle || undefined}
        eyebrowStyle={recruit.eyebrowStyle || undefined}
        mouthStyle={recruit.mouthStyle || undefined}
        eyeBlack={recruit.eyeBlack ?? undefined}
        playerId={recruit.id}
        className="w-16 h-16 flex-shrink-0"
        isRecruit={true}
      />
      <div className="flex-1">
        <div className="font-pixel text-gold flex items-center gap-3 flex-wrap text-sm">
          <PositionBadge position={recruit.position} size="lg" />
          <span>{recruit.firstName} {recruit.lastName}</span>
          <StarRating rating={recruit.starRank} />
          {recruit.isBlueChip && (
            <Badge className="bg-blue-500 text-white">Blue Chip</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span>{recruit.hometown}, {recruit.homeState}</span>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={!!recruit} onOpenChange={() => onClose()}>
        <SheetContent
          side="bottom"
          className="h-dvh overflow-y-auto p-0 border-t border-gold bg-card"
          data-testid="recruit-detail-sheet-mobile"
        >
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle asChild>{headerContent}</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded">
              <p className={`font-bold text-gold ${isFullyRevealed ? "text-2xl" : "text-lg"}`}>
                {getOverallDisplay()}
              </p>
              <p className="text-xs text-muted-foreground">Overall (1-999)</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className={`font-bold ${isFullyRevealed ? "text-2xl" : "text-lg"}`}>
                {getStarDisplay()}
              </p>
              <p className="text-xs text-muted-foreground">Star Rating</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className="text-lg font-bold">{recruit.classRank}</p>
              <p className="text-xs text-muted-foreground">Class Rank</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className="text-lg font-bold">{recruit.positionRank}</p>
              <p className="text-xs text-muted-foreground">Pos Rank</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span className="truncate">{recruit.recruitType === "TRANSFER" ? `Transfer from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "SO"})` : recruit.recruitType === "JUCO" ? `JUCO from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "FR"})` : "High School"}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span>Bats {recruit.batHand || "R"} / Throws {recruit.throwHand || "R"}</span>
              {recruit.position !== "P" && recruit.trajectory != null && (
                <Badge variant="outline" className="text-[9px] border-gold/40 text-gold/80" data-testid="badge-detail-traj">
                  Traj: {TRAJECTORY_LABELS[recruit.trajectory] ?? "LD"}
                </Badge>
              )}
            </div>
          </div>

          {sdLocked.size > 0 && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gold/10 border border-gold/30 rounded" data-testid="signing-day-locked-banner">
              <Lock className="w-3 h-3 text-gold/70 shrink-0" />
              <span className="text-[9px] text-gold/80 font-pixel">{sdLocked.size} attribute{sdLocked.size !== 1 ? "s" : ""} revealed at Signing Day Reveal</span>
            </div>
          )}

          {recruit.position === "P" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
                <div className="grid grid-cols-2 gap-3">
                  {attrs.map((attr) => {
                    const isSigningDayLocked = sdLocked.has(attr.key);
                    const revealed = !isSigningDayLocked && (isFullyRevealed || revealedAttrs.includes(attr.key));
                    const isVelocity = attr.key === "velocity";
                    const displayValue = isVelocity && revealed 
                      ? `${velocityToMPH(attr.value)} MPH`
                      : (revealed ? attr.value : "??");
                    return (
                      <div key={attr.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm text-muted-foreground">{attr.label}</span>
                        {isSigningDayLocked || !revealed ? (
                          <SeeUponSigningBadge />
                        ) : (
                          <span className="font-bold text-foreground">
                            {displayValue}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Pitch Mix</h4>
                <PitchMixDial pitches={generatePitchMix()} className="w-32 h-32 mx-auto" />
              </div>
            </div>
          ) : (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
              <div className="grid grid-cols-2 gap-3">
                {attrs.map((attr) => {
                  const isSigningDayLocked = sdLocked.has(attr.key);
                  const revealed = !isSigningDayLocked && (isFullyRevealed || revealedAttrs.includes(attr.key));
                  return (
                    <div key={attr.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span className="text-sm text-muted-foreground">{attr.label}</span>
                      {isSigningDayLocked || !revealed ? (
                        <SeeUponSigningBadge />
                      ) : (
                        <span className="font-bold text-foreground">
                          {attr.value}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Common Abilities Section */}
          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Common Abilities</h4>
            <div className="grid grid-cols-2 gap-2">
              {recruit.position === "P" ? (
                <>
                  <CommonAbilityRow label="W/RISP" value={recruit.wRISP} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("wRISP")} />
                  <CommonAbilityRow label="vs Lefty" value={recruit.vsLefty} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("vsLefty")} />
                  <CommonAbilityRow label="Poise" value={recruit.poise} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("poise")} />
                  <CommonAbilityRow label="Grit" value={recruit.grit} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("grit")} />
                  <CommonAbilityRow label="Heater" value={recruit.heater} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("heater")} />
                  <CommonAbilityRow label="Agile" value={recruit.agile} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("agile")} />
                  <CommonAbilityRow label="Recovery" value={recruit.recovery} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("recovery")} />
                </>
              ) : (
                <>
                  <CommonAbilityRow label="Clutch" value={recruit.clutch} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("clutch")} />
                  <CommonAbilityRow label="vs LHP" value={recruit.vsLHP} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("vsLHP")} />
                  <CommonAbilityRow label="Grit" value={recruit.grit} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("grit")} />
                  <CommonAbilityRow label="Stealing" value={recruit.stealing} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("stealing")} />
                  <CommonAbilityRow label="Running" value={recruit.running} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("running")} />
                  <CommonAbilityRow label="Throwing" value={recruit.throwing} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("throwing")} />
                  <CommonAbilityRow label="Recovery" value={recruit.recovery} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("recovery")} />
                  {recruit.position === "C" && (
                    <CommonAbilityRow label="Catcher" value={recruit.catcherAbility} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("catcherAbility")} />
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Priorities</h4>
            <div className="grid grid-cols-2 gap-3">
              {priorities.map((p) => {
                const priorityLabels: Record<string, string> = {
                  "Extremely": "Extremely Important",
                  "Very": "Very Important",
                  "Somewhat": "Somewhat Important",
                  "Not Important": "Not Important"
                };
                return (
                  <div key={p.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm text-muted-foreground">{p.label}</span>
                    {scoutPct >= 50 ? (
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {priorityLabels[p.value as string] || p.value}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs whitespace-nowrap text-muted-foreground">
                        ???
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
            {scoutPct < 50 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Scout to 50% to unlock priorities
              </p>
            )}
          </div>

          {/* Abilities Section */}
          {(recruit.abilities as string[] || []).length > 0 && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">
                Special Abilities ({isFullyRevealed ? (recruit.abilities as string[]).length : `${revealedAbilitiesCount}/?`})
              </h4>
              <div className="flex flex-wrap gap-2">
                {(recruit.abilities as string[] || []).map((abilityName, idx) => {
                  const ability = getAbilityByName(abilityName);
                  const isAbilityRevealed = isFullyRevealed || revealedAbilitiesCount > idx;
                  
                  if (!isAbilityRevealed) {
                    return (
                      <SeeUponSigningBadge key={idx} />
                    );
                  }
                  
                  const tierColors = {
                    gold: "bg-yellow-600/20 border-yellow-500 text-yellow-400",
                    blue: "bg-blue-600/20 border-blue-500 text-blue-400",
                    red: "bg-red-600/20 border-red-500 text-red-400",
                  };
                  
                  return (
                    <Badge 
                      key={idx}
                      variant="outline"
                      className={`text-xs ${ability ? tierColors[ability.tier] : ""}`}
                      title={ability?.description}
                    >
                      {abilityName}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intangibles / Dev Traits */}
          {(recruit.personality || recruit.workEthic || recruit.gemBustRevealed || scoutPct >= 50) && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Intangibles</h4>
              <div className="grid grid-cols-2 gap-3">
                {recruit.personality && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Personality</span>
                    <span className="text-sm font-medium text-foreground capitalize">{(recruit.personality as string).replace(/_/g, " ")}</span>
                  </div>
                )}
                {recruit.workEthic && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Work Ethic</span>
                    <span className="text-sm font-medium text-foreground capitalize">{recruit.workEthic as string}</span>
                  </div>
                )}
                {recruit.workEthicScore != null && scoutPct >= 75 && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Work Ethic</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-pixel text-sm font-bold ${
                        recruit.workEthicScore >= 90 ? "text-emerald-400" :
                        recruit.workEthicScore >= 82 ? "text-green-400" :
                        recruit.workEthicScore >= 70 ? "text-foreground" :
                        recruit.workEthicScore >= 58 ? "text-orange-400" : "text-red-400"
                      }`}>{getDevTraitGrade(recruit.workEthicScore)}</span>
                    </span>
                  </div>
                )}
                {recruit.coachability != null && scoutPct >= 75 && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Coachability</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-pixel text-sm font-bold ${
                        recruit.coachability >= 90 ? "text-emerald-400" :
                        recruit.coachability >= 82 ? "text-green-400" :
                        recruit.coachability >= 70 ? "text-foreground" :
                        recruit.coachability >= 58 ? "text-orange-400" : "text-red-400"
                      }`}>{getDevTraitGrade(recruit.coachability)}</span>
                    </span>
                  </div>
                )}
                {recruit.playerArchetype && recruit.playerArchetype !== "normal" && (
                  recruit.playerArchetype === "overdraft" ? scoutPct >= 75 : scoutPct >= 50
                ) && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50 col-span-2">
                    <span className="text-[10px] text-muted-foreground block mb-1">Development Profile</span>
                    <span className={`text-sm font-medium ${
                      recruit.playerArchetype === "late_bloomer" ? "text-emerald-400" :
                      recruit.playerArchetype === "overdraft" ? "text-orange-400" :
                      "text-yellow-400"
                    }`}>
                      {recruit.playerArchetype === "late_bloomer"
                        ? "Late Bloomer — ceiling higher than current rating implies"
                        : recruit.playerArchetype === "overdraft"
                        ? "Overdraft — ceiling lower than current rating implies"
                        : "Raw Prospect — extreme tool variance, high risk/high reward"}
                    </span>
                  </div>
                )}
                {recruit.gemBustRevealed && (
                  <div className={`rounded p-2.5 border col-span-2 ${
                    recruit.isGenerationalGem ? "bg-amber-500/15 border-amber-500/40" :
                    recruit.isGenerationalBust ? "bg-red-700/15 border-red-700/40" :
                    recruit.isGem ? "bg-green-500/10 border-green-500/30" : 
                    recruit.isBust ? "bg-red-500/10 border-red-500/30" : "bg-muted/30 border-border/50"
                  }`}>
                    <span className="text-[10px] text-muted-foreground block mb-1">Scout Assessment</span>
                    <span className={`text-sm font-medium ${
                      recruit.isGenerationalGem ? "text-amber-400" :
                      recruit.isGenerationalBust ? "text-red-400" :
                      recruit.isGem ? "text-green-400" : recruit.isBust ? "text-red-400" : "text-foreground"
                    }`}>
                      {recruit.isGenerationalGem 
                        ? "GENERATIONAL TALENT - Once-in-a-generation player. Elite in every way."
                        : recruit.isGenerationalBust 
                        ? "GENERATIONAL BUST - Severely overrated. A major disappointment waiting to happen."
                        : recruit.isGem ? "Hidden Gem - Better than rating suggests" 
                        : recruit.isBust ? "Potential Bust - May be overrated" 
                        : "Accurate Rating - What you see is what you get"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {scoutPct < 50 && !recruit.personality && !recruit.workEthic && !recruit.gemBustRevealed && (
            <div className="bg-muted/20 rounded p-3 border border-dashed border-border/40">
              <h4 className="font-pixel text-[10px] text-muted-foreground mb-1">Intangibles</h4>
              <p className="text-xs text-muted-foreground italic">Unknown — scout to 50% to begin revealing work ethic and development traits.</p>
            </div>
          )}

          {recruit.dealbreaker && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
              <div className="flex items-center gap-2 text-red-400 mb-1">
                <HelpCircle className="w-4 h-4" />
                <span className="font-pixel text-[10px]">Dealbreaker</span>
              </div>
              <p className="text-sm text-foreground">{recruit.dealbreaker}</p>
            </div>
          )}

          {recruit.stage === "signed" && recruit.signedTeamId ? (
            <div className="p-4 rounded text-center" style={{ backgroundColor: `${(recruit as RecruitWithInterest).signedTeamPrimaryColor}15` || "rgba(100,100,100,0.1)", border: `1px solid ${(recruit as RecruitWithInterest).signedTeamPrimaryColor}40` }}>
              <p className="font-pixel text-xs mb-1" style={{ color: (recruit as RecruitWithInterest).signedTeamPrimaryColor || "#ccc" }}>
                Signed with {(recruit as RecruitWithInterest).signedTeamName || "Unknown"}
              </p>
              <p className="text-[10px] text-muted-foreground">This recruit is no longer available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <RetroButton 
                variant="outline" 
                className="border-green-500 text-green-400 hover:bg-green-500/10"
                data-testid="button-scout-modal"
                onClick={() => onScout(recruit.id)}
                disabled={isScouting || scoutPct >= 100}
              >
                <Eye className="w-4 h-4 mr-2" />
                {isScouting ? "Scouting..." : `Scout (${scoutPct}%)`}
              </RetroButton>
              <RetroButton 
                className="flex-1" 
                data-testid="button-phone"
                variant={showModalPhonePicker ? "primary" : "outline"}
                onClick={() => { setShowModalPhonePicker(!showModalPhonePicker); setShowModalEmailPicker(false); setModalPhonePitches([]); }}
                disabled={isPhoning}
              >
                <Phone className="w-4 h-4 mr-2" />
                {isPhoning ? "Calling..." : "Phone (3 pitches)"}
              </RetroButton>
              <RetroButton 
                variant={showModalEmailPicker ? "primary" : "outline"}
                className="flex-1" 
                data-testid="button-email"
                onClick={() => { setShowModalEmailPicker(!showModalEmailPicker); setShowModalPhonePicker(false); setModalEmailPitch(null); }}
                disabled={isEmailing}
              >
                <Mail className="w-4 h-4 mr-2" />
                {isEmailing ? "Sending..." : "Email (1 pitch)"}
              </RetroButton>
              <RetroButton 
                variant={hasVisited ? "primary" : "outline"}
                className="flex-1" 
                data-testid="button-visit"
                onClick={() => onVisit(recruit.id)}
                disabled={isVisiting || remainingPoints < visitCost || hasVisited}
              >
                <Building2 className="w-4 h-4 mr-2" />
                {hasVisited ? "Visited" : isVisiting ? "Scheduling..." : `Campus Visit (${visitCost})`}
              </RetroButton>
              <RetroButton 
                variant={hasHeadCoachVisited ? "primary" : "outline"}
                className="flex-1" 
                data-testid="button-head-coach-visit"
                onClick={() => onHeadCoachVisit(recruit.id)}
                disabled={isHeadCoachVisiting || remainingPoints < headCoachVisitCost || hasHeadCoachVisited}
              >
                <Crown className="w-4 h-4 mr-2" />
                {hasHeadCoachVisited ? "HC Visited" : isHeadCoachVisiting ? "Visiting..." : `HC Visit (${headCoachVisitCost})`}
              </RetroButton>
              <RetroButton 
                variant="outline" 
                className="border-gold text-gold"
                data-testid="button-offer-scholarship"
                onClick={() => onOffer(recruit.id)}
                disabled={isOffering || recruit.interest?.hasOffer}
              >
                <GraduationCap className="w-4 h-4 mr-2" />
                {isOffering ? "Offering..." : recruit.interest?.hasOffer ? "Offered" : "Offer Scholarship"}
              </RetroButton>
            </div>
          )}

          {showModalPhonePicker && recruit && (
            <div className="p-3 bg-muted/30 border border-border rounded" data-testid="modal-pitch-picker-phone">
              <p className="text-[10px] font-pixel text-gold mb-2">SELECT UP TO 3 PITCHES FOR PHONE CALL</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {modalPitchOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => toggleModalPhonePitch(opt.key)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      modalPhonePitches.includes(opt.key)
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`modal-pitch-phone-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <RetroButton
                  size="sm"
                  onClick={() => {
                    onPhone(recruit.id, modalPhonePitches.join(","));
                    setShowModalPhonePicker(false);
                    setModalPhonePitches([]);
                  }}
                  disabled={modalPhonePitches.length === 0 || isPhoning}
                  data-testid="modal-button-send-phone"
                >
                  <Phone className="w-3 h-3 mr-1" />
                  Call ({modalPhonePitches.length}/3)
                </RetroButton>
                <RetroButton variant="outline" size="sm" onClick={() => { setShowModalPhonePicker(false); setModalPhonePitches([]); }}>
                  Cancel
                </RetroButton>
              </div>
            </div>
          )}

          {showModalEmailPicker && recruit && (
            <div className="p-3 bg-muted/30 border border-border rounded" data-testid="modal-pitch-picker-email">
              <p className="text-[10px] font-pixel text-gold mb-2">SELECT 1 PITCH FOR EMAIL</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {modalPitchOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setModalEmailPitch(modalEmailPitch === opt.key ? null : opt.key)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      modalEmailPitch === opt.key
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`modal-pitch-email-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <RetroButton
                  size="sm"
                  onClick={() => {
                    onEmail(recruit.id, modalEmailPitch || undefined);
                    setShowModalEmailPicker(false);
                    setModalEmailPitch(null);
                  }}
                  disabled={!modalEmailPitch || isEmailing}
                  data-testid="modal-button-send-email"
                >
                  <Mail className="w-3 h-3 mr-1" />
                  Send Email
                </RetroButton>
                <RetroButton variant="outline" size="sm" onClick={() => { setShowModalEmailPicker(false); setModalEmailPitch(null); }}>
                  Cancel
                </RetroButton>
              </div>
            </div>
          )}

          {/* Actions Log */}
          <RecruitActionsLog recruitId={recruit.id} leagueId={leagueId} />
        </div>
      </SheetContent>
    </Sheet>
    );
  }

  return (
    <Dialog open={!!recruit} onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-gold max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="recruit-detail-dialog-desktop">
        <DialogHeader>
          <DialogTitle asChild>{headerContent}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded">
              <p className={`font-bold text-gold ${isFullyRevealed ? "text-2xl" : "text-lg"}`}>
                {getOverallDisplay()}
              </p>
              <p className="text-xs text-muted-foreground">Overall (1-999)</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className={`font-bold ${isFullyRevealed ? "text-2xl" : "text-lg"}`}>
                {getStarDisplay()}
              </p>
              <p className="text-xs text-muted-foreground">Star Rating</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className="text-lg font-bold">{recruit.classRank}</p>
              <p className="text-xs text-muted-foreground">Class Rank</p>
            </div>
            <div className="text-center p-3 bg-muted rounded">
              <p className="text-lg font-bold">{recruit.positionRank}</p>
              <p className="text-xs text-muted-foreground">Pos Rank</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span className="truncate">{recruit.recruitType === "TRANSFER" ? `Transfer from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "SO"})` : recruit.recruitType === "JUCO" ? `JUCO from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "FR"})` : "High School"}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span>Bats {recruit.batHand || "R"} / Throws {recruit.throwHand || "R"}</span>
              {recruit.position !== "P" && recruit.trajectory != null && (
                <Badge variant="outline" className="text-[9px] border-gold/40 text-gold/80" data-testid="badge-detail-traj">
                  Traj: {TRAJECTORY_LABELS[recruit.trajectory] ?? "LD"}
                </Badge>
              )}
            </div>
          </div>

          {sdLocked.size > 0 && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gold/10 border border-gold/30 rounded" data-testid="signing-day-locked-banner">
              <Lock className="w-3 h-3 text-gold/70 shrink-0" />
              <span className="text-[9px] text-gold/80 font-pixel">{sdLocked.size} attribute{sdLocked.size !== 1 ? "s" : ""} revealed at Signing Day Reveal</span>
            </div>
          )}

          {recruit.position === "P" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
                <div className="grid grid-cols-2 gap-3">
                  {attrs.map((attr) => {
                    const isSigningDayLocked = sdLocked.has(attr.key);
                    const revealed = !isSigningDayLocked && (isFullyRevealed || revealedAttrs.includes(attr.key));
                    const isVelocity = attr.key === "velocity";
                    const displayValue = isVelocity && revealed 
                      ? `${velocityToMPH(attr.value)} MPH`
                      : (revealed ? attr.value : "??");
                    return (
                      <div key={attr.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm text-muted-foreground">{attr.label}</span>
                        {isSigningDayLocked || !revealed ? (
                          <SeeUponSigningBadge />
                        ) : (
                          <span className="font-bold text-foreground">
                            {displayValue}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Pitch Mix</h4>
                <PitchMixDial pitches={generatePitchMix()} className="w-32 h-32 mx-auto" />
              </div>
            </div>
          ) : (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
              <div className="grid grid-cols-2 gap-3">
                {attrs.map((attr) => {
                  const isSigningDayLocked = sdLocked.has(attr.key);
                  const revealed = !isSigningDayLocked && (isFullyRevealed || revealedAttrs.includes(attr.key));
                  return (
                    <div key={attr.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span className="text-sm text-muted-foreground">{attr.label}</span>
                      {isSigningDayLocked || !revealed ? (
                        <SeeUponSigningBadge />
                      ) : (
                        <span className="font-bold text-foreground">
                          {attr.value}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Common Abilities Section */}
          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Common Abilities</h4>
            <div className="grid grid-cols-2 gap-2">
              {recruit.position === "P" ? (
                <>
                  <CommonAbilityRow label="W/RISP" value={recruit.wRISP} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("wRISP")} />
                  <CommonAbilityRow label="vs Lefty" value={recruit.vsLefty} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("vsLefty")} />
                  <CommonAbilityRow label="Poise" value={recruit.poise} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("poise")} />
                  <CommonAbilityRow label="Grit" value={recruit.grit} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("grit")} />
                  <CommonAbilityRow label="Heater" value={recruit.heater} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("heater")} />
                  <CommonAbilityRow label="Agile" value={recruit.agile} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("agile")} />
                  <CommonAbilityRow label="Recovery" value={recruit.recovery} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("recovery")} />
                </>
              ) : (
                <>
                  <CommonAbilityRow label="Clutch" value={recruit.clutch} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("clutch")} />
                  <CommonAbilityRow label="vs LHP" value={recruit.vsLHP} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("vsLHP")} />
                  <CommonAbilityRow label="Grit" value={recruit.grit} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("grit")} />
                  <CommonAbilityRow label="Stealing" value={recruit.stealing} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("stealing")} />
                  <CommonAbilityRow label="Running" value={recruit.running} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("running")} />
                  <CommonAbilityRow label="Throwing" value={recruit.throwing} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("throwing")} />
                  <CommonAbilityRow label="Recovery" value={recruit.recovery} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("recovery")} />
                  {recruit.position === "C" && (
                    <CommonAbilityRow label="Catcher" value={recruit.catcherAbility} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} isSigningDayLocked={sdLocked.has("catcherAbility")} />
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Priorities</h4>
            <div className="grid grid-cols-2 gap-3">
              {priorities.map((p) => {
                const priorityLabels: Record<string, string> = {
                  "Extremely": "Extremely Important",
                  "Very": "Very Important",
                  "Somewhat": "Somewhat Important",
                  "Not Important": "Not Important"
                };
                return (
                  <div key={p.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm text-muted-foreground">{p.label}</span>
                    {scoutPct >= 50 ? (
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {priorityLabels[p.value as string] || p.value}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs whitespace-nowrap text-muted-foreground">
                        ???
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
            {scoutPct < 50 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Scout to 50% to unlock priorities
              </p>
            )}
          </div>

          {/* Abilities Section */}
          {(recruit.abilities as string[] || []).length > 0 && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">
                Special Abilities ({isFullyRevealed ? (recruit.abilities as string[]).length : `${revealedAbilitiesCount}/?`})
              </h4>
              <div className="flex flex-wrap gap-2">
                {(recruit.abilities as string[] || []).map((abilityName, idx) => {
                  const ability = getAbilityByName(abilityName);
                  const isAbilityRevealed = isFullyRevealed || revealedAbilitiesCount > idx;
                  
                  if (!isAbilityRevealed) {
                    return (
                      <SeeUponSigningBadge key={idx} />
                    );
                  }
                  
                  const tierColors = {
                    gold: "bg-yellow-600/20 border-yellow-500 text-yellow-400",
                    blue: "bg-blue-600/20 border-blue-500 text-blue-400",
                    red: "bg-red-600/20 border-red-500 text-red-400",
                  };
                  
                  return (
                    <Badge 
                      key={idx}
                      variant="outline"
                      className={`text-xs ${ability ? tierColors[ability.tier] : ""}`}
                      title={ability?.description}
                    >
                      {abilityName}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intangibles / Dev Traits */}
          {(recruit.personality || recruit.workEthic || recruit.gemBustRevealed || scoutPct >= 50) && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Intangibles</h4>
              <div className="grid grid-cols-2 gap-3">
                {recruit.personality && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Personality</span>
                    <span className="text-sm font-medium text-foreground capitalize">{(recruit.personality as string).replace(/_/g, " ")}</span>
                  </div>
                )}
                {recruit.workEthic && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Work Ethic</span>
                    <span className="text-sm font-medium text-foreground capitalize">{recruit.workEthic as string}</span>
                  </div>
                )}
                {recruit.workEthicScore != null && scoutPct >= 75 && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Work Ethic</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-pixel text-sm font-bold ${
                        recruit.workEthicScore >= 90 ? "text-emerald-400" :
                        recruit.workEthicScore >= 82 ? "text-green-400" :
                        recruit.workEthicScore >= 70 ? "text-foreground" :
                        recruit.workEthicScore >= 58 ? "text-orange-400" : "text-red-400"
                      }`}>{getDevTraitGrade(recruit.workEthicScore)}</span>
                    </span>
                  </div>
                )}
                {recruit.coachability != null && scoutPct >= 75 && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block mb-1">Coachability</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-pixel text-sm font-bold ${
                        recruit.coachability >= 90 ? "text-emerald-400" :
                        recruit.coachability >= 82 ? "text-green-400" :
                        recruit.coachability >= 70 ? "text-foreground" :
                        recruit.coachability >= 58 ? "text-orange-400" : "text-red-400"
                      }`}>{getDevTraitGrade(recruit.coachability)}</span>
                    </span>
                  </div>
                )}
                {recruit.playerArchetype && recruit.playerArchetype !== "normal" && (
                  recruit.playerArchetype === "overdraft" ? scoutPct >= 75 : scoutPct >= 50
                ) && (
                  <div className="bg-muted/30 rounded p-2.5 border border-border/50 col-span-2">
                    <span className="text-[10px] text-muted-foreground block mb-1">Development Profile</span>
                    <span className={`text-sm font-medium ${
                      recruit.playerArchetype === "late_bloomer" ? "text-emerald-400" :
                      recruit.playerArchetype === "overdraft" ? "text-orange-400" :
                      "text-yellow-400"
                    }`}>
                      {recruit.playerArchetype === "late_bloomer"
                        ? "Late Bloomer — ceiling higher than current rating implies"
                        : recruit.playerArchetype === "overdraft"
                        ? "Overdraft — ceiling lower than current rating implies"
                        : "Raw Prospect — extreme tool variance, high risk/high reward"}
                    </span>
                  </div>
                )}
                {recruit.gemBustRevealed && (
                  <div className={`rounded p-2.5 border col-span-2 ${
                    recruit.isGenerationalGem ? "bg-amber-500/15 border-amber-500/40" :
                    recruit.isGenerationalBust ? "bg-red-700/15 border-red-700/40" :
                    recruit.isGem ? "bg-green-500/10 border-green-500/30" : 
                    recruit.isBust ? "bg-red-500/10 border-red-500/30" : "bg-muted/30 border-border/50"
                  }`}>
                    <span className="text-[10px] text-muted-foreground block mb-1">Scout Assessment</span>
                    <span className={`text-sm font-medium ${
                      recruit.isGenerationalGem ? "text-amber-400" :
                      recruit.isGenerationalBust ? "text-red-400" :
                      recruit.isGem ? "text-green-400" : recruit.isBust ? "text-red-400" : "text-foreground"
                    }`}>
                      {recruit.isGenerationalGem 
                        ? "GENERATIONAL TALENT - Once-in-a-generation player. Elite in every way."
                        : recruit.isGenerationalBust 
                        ? "GENERATIONAL BUST - Severely overrated. A major disappointment waiting to happen."
                        : recruit.isGem ? "Hidden Gem - Better than rating suggests" 
                        : recruit.isBust ? "Potential Bust - May be overrated" 
                        : "Accurate Rating - What you see is what you get"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {scoutPct < 50 && !recruit.personality && !recruit.workEthic && !recruit.gemBustRevealed && (
            <div className="bg-muted/20 rounded p-3 border border-dashed border-border/40">
              <h4 className="font-pixel text-[10px] text-muted-foreground mb-1">Intangibles</h4>
              <p className="text-xs text-muted-foreground italic">Unknown — scout to 50% to begin revealing work ethic and development traits.</p>
            </div>
          )}

          {recruit.dealbreaker && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
              <div className="flex items-center gap-2 text-red-400 mb-1">
                <HelpCircle className="w-4 h-4" />
                <span className="font-pixel text-[10px]">Dealbreaker</span>
              </div>
              <p className="text-sm text-foreground">{recruit.dealbreaker}</p>
            </div>
          )}

          {recruit.stage === "signed" && recruit.signedTeamId ? (
            <div className="p-4 rounded text-center" style={{ backgroundColor: `${(recruit as RecruitWithInterest).signedTeamPrimaryColor}15` || "rgba(100,100,100,0.1)", border: `1px solid ${(recruit as RecruitWithInterest).signedTeamPrimaryColor}40` }}>
              <p className="font-pixel text-xs mb-1" style={{ color: (recruit as RecruitWithInterest).signedTeamPrimaryColor || "#ccc" }}>
                Signed with {(recruit as RecruitWithInterest).signedTeamName || "Unknown"}
              </p>
              <p className="text-[10px] text-muted-foreground">This recruit is no longer available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <RetroButton 
                variant="outline" 
                className="border-green-500 text-green-400 hover:bg-green-500/10"
                data-testid="button-scout-modal"
                onClick={() => onScout(recruit.id)}
                disabled={isScouting || scoutPct >= 100}
              >
                <Eye className="w-4 h-4 mr-2" />
                {isScouting ? "Scouting..." : `Scout (${scoutPct}%)`}
              </RetroButton>
              <RetroButton 
                className="flex-1" 
                data-testid="button-phone"
                variant={showModalPhonePicker ? "primary" : "outline"}
                onClick={() => { setShowModalPhonePicker(!showModalPhonePicker); setShowModalEmailPicker(false); setModalPhonePitches([]); }}
                disabled={isPhoning}
              >
                <Phone className="w-4 h-4 mr-2" />
                {isPhoning ? "Calling..." : "Phone (3 pitches)"}
              </RetroButton>
              <RetroButton 
                variant={showModalEmailPicker ? "primary" : "outline"}
                className="flex-1" 
                data-testid="button-email"
                onClick={() => { setShowModalEmailPicker(!showModalEmailPicker); setShowModalPhonePicker(false); setModalEmailPitch(null); }}
                disabled={isEmailing}
              >
                <Mail className="w-4 h-4 mr-2" />
                {isEmailing ? "Sending..." : "Email (1 pitch)"}
              </RetroButton>
              <RetroButton 
                variant={hasVisited ? "primary" : "outline"}
                className="flex-1" 
                data-testid="button-visit"
                onClick={() => onVisit(recruit.id)}
                disabled={isVisiting || remainingPoints < visitCost || hasVisited}
              >
                <Building2 className="w-4 h-4 mr-2" />
                {hasVisited ? "Visited" : isVisiting ? "Scheduling..." : `Campus Visit (${visitCost})`}
              </RetroButton>
              <RetroButton 
                variant={hasHeadCoachVisited ? "primary" : "outline"}
                className="flex-1" 
                data-testid="button-head-coach-visit"
                onClick={() => onHeadCoachVisit(recruit.id)}
                disabled={isHeadCoachVisiting || remainingPoints < headCoachVisitCost || hasHeadCoachVisited}
              >
                <Crown className="w-4 h-4 mr-2" />
                {hasHeadCoachVisited ? "HC Visited" : isHeadCoachVisiting ? "Visiting..." : `HC Visit (${headCoachVisitCost})`}
              </RetroButton>
              <RetroButton 
                variant="outline" 
                className="border-gold text-gold"
                data-testid="button-offer-scholarship"
                onClick={() => onOffer(recruit.id)}
                disabled={isOffering || recruit.interest?.hasOffer}
              >
                <GraduationCap className="w-4 h-4 mr-2" />
                {isOffering ? "Offering..." : recruit.interest?.hasOffer ? "Offered" : "Offer Scholarship"}
              </RetroButton>
            </div>
          )}

          {showModalPhonePicker && recruit && (
            <div className="p-3 bg-muted/30 border border-border rounded" data-testid="modal-pitch-picker-phone">
              <p className="text-[10px] font-pixel text-gold mb-2">SELECT UP TO 3 PITCHES FOR PHONE CALL</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {modalPitchOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => toggleModalPhonePitch(opt.key)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      modalPhonePitches.includes(opt.key)
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`modal-pitch-phone-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <RetroButton
                  size="sm"
                  onClick={() => {
                    onPhone(recruit.id, modalPhonePitches.join(","));
                    setShowModalPhonePicker(false);
                    setModalPhonePitches([]);
                  }}
                  disabled={modalPhonePitches.length === 0 || isPhoning}
                  data-testid="modal-button-send-phone"
                >
                  <Phone className="w-3 h-3 mr-1" />
                  Call ({modalPhonePitches.length}/3)
                </RetroButton>
                <RetroButton variant="outline" size="sm" onClick={() => { setShowModalPhonePicker(false); setModalPhonePitches([]); }}>
                  Cancel
                </RetroButton>
              </div>
            </div>
          )}

          {showModalEmailPicker && recruit && (
            <div className="p-3 bg-muted/30 border border-border rounded" data-testid="modal-pitch-picker-email">
              <p className="text-[10px] font-pixel text-gold mb-2">SELECT 1 PITCH FOR EMAIL</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {modalPitchOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setModalEmailPitch(modalEmailPitch === opt.key ? null : opt.key)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      modalEmailPitch === opt.key
                        ? "bg-gold/20 border-gold text-gold"
                        : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                    }`}
                    data-testid={`modal-pitch-email-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <RetroButton
                  size="sm"
                  onClick={() => {
                    onEmail(recruit.id, modalEmailPitch || undefined);
                    setShowModalEmailPicker(false);
                    setModalEmailPitch(null);
                  }}
                  disabled={!modalEmailPitch || isEmailing}
                  data-testid="modal-button-send-email"
                >
                  <Mail className="w-3 h-3 mr-1" />
                  Send Email
                </RetroButton>
                <RetroButton variant="outline" size="sm" onClick={() => { setShowModalEmailPicker(false); setModalEmailPitch(null); }}>
                  Cancel
                </RetroButton>
              </div>
            </div>
          )}

          {/* Actions Log */}
          <RecruitActionsLog recruitId={recruit.id} leagueId={leagueId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompareModal({
  recruits,
  isOpen,
  onClose,
}: {
  recruits: RecruitWithInterest[];
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen || recruits.length < 2) return null;

  const getOverallDisplay = (recruit: RecruitWithInterest) => {
    const scoutPct = recruit.interest?.scoutPercentage || 0;
    if (recruit.isBlueChip) return recruit.overall.toString();
    if (scoutPct === 0) return "???";
    if (scoutPct < 100) {
      const min = recruit.interest?.minOverall || 1;
      const max = recruit.interest?.maxOverall || 999;
      return `${min}-${max}`;
    }
    return recruit.overall.toString();
  };

  const getStarDisplay = (recruit: RecruitWithInterest) => {
    const scoutPct = recruit.interest?.scoutPercentage || 0;
    if (recruit.isBlueChip) return recruit.starRank.toString();
    if (scoutPct === 0) return "?";
    if (scoutPct < 100) {
      const min = recruit.interest?.minStar || 1;
      const max = recruit.interest?.maxStar || 5;
      if (min === max) return min.toString();
      return `${min}-${max}`;
    }
    return recruit.starRank.toString();
  };

  const getRevealedAbilities = (recruit: RecruitWithInterest) => {
    if (recruit.isBlueChip) return recruit.abilities || [];
    const revealedCount = recruit.interest?.revealedAbilitiesCount || 0;
    return (recruit.abilities || []).slice(0, revealedCount);
  };

  const isFullyScouted = (recruit: RecruitWithInterest) => {
    return recruit.isBlueChip || (recruit.interest?.scoutPercentage || 0) >= 100;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-3xl" data-testid="compare-modal">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm">
            Compare Recruits
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {recruits.map((recruit) => {
            const scoutPct = recruit.interest?.scoutPercentage || 0;
            const overallDisplay = getOverallDisplay(recruit);
            const starDisplay = getStarDisplay(recruit);
            const revealedAbilities = getRevealedAbilities(recruit);
            const fullyKnown = isFullyScouted(recruit);
            
            return (
              <div key={recruit.id} className="bg-background/50 rounded-lg p-4 border border-border" data-testid={`compare-card-${recruit.id}`}>
                <div className="flex items-center gap-3 mb-4">
                  <PlayerPortrait
                    skinTone={recruit.skinTone || "light"}
                    hairColor={recruit.hairColor || "brown"}
                    hairStyle={recruit.hairStyle || "short"}
                    facialHair={recruit.facialHair || "none"}
                    eyeStyle={recruit.eyeStyle || undefined}
                    eyebrowStyle={recruit.eyebrowStyle || undefined}
                    mouthStyle={recruit.mouthStyle || undefined}
                    eyeBlack={recruit.eyeBlack ?? undefined}
                    playerId={recruit.id}
                    className="w-12 h-12"
                    isRecruit={true}
                  />
                  <div>
                    <p className="font-medium">{recruit.firstName} {recruit.lastName}</p>
                    <p className="text-xs text-muted-foreground">{recruit.position} - {recruit.hometown}, {recruit.homeState}</p>
                    <p className="text-xs text-muted-foreground">Scouted: {scoutPct}%</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Overall</span>
                      <span className={fullyKnown ? "" : "text-muted-foreground italic"}>
                        {overallDisplay}
                      </span>
                    </div>
                    {fullyKnown && (
                      <div className="h-2 bg-background rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all bg-gold"
                          style={{ width: `${Math.min(100, (recruit.overall / 650) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Star Rating</span>
                      <span className={fullyKnown ? "" : "text-muted-foreground italic"}>
                        {starDisplay} {fullyKnown ? "★" : ""}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Class Rank</span>
                      <span>#{recruit.classRank || "—"}</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Position Rank</span>
                      <span>#{recruit.positionRank || "—"}</span>
                    </div>
                  </div>
                  {recruit.position !== "P" && recruit.trajectory != null && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Trajectory</span>
                        <span className="text-gold">{TRAJECTORY_LABELS[recruit.trajectory] ?? "LD"}</span>
                      </div>
                    </div>
                  )}
                </div>
                {revealedAbilities.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">
                      Abilities {!fullyKnown && recruit.abilities && recruit.abilities.length > revealedAbilities.length && `(${revealedAbilities.length}/${recruit.abilities.length} revealed)`}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {revealedAbilities.map((ability, i) => {
                        const abilityData = getAbilityByName(ability);
                        const tierColor = abilityData?.tier === "gold" ? "text-gold" : abilityData?.tier === "blue" ? "text-blue-400" : "text-red-400";
                        return (
                          <Badge key={i} variant="outline" className={`text-[8px] ${tierColor}`}>
                            {ability}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
                {scoutPct === 0 && !recruit.isBlueChip && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground italic">Not yet scouted</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end pt-4">
          <RetroButton variant="outline" onClick={onClose} data-testid="button-close-compare">
            Close
          </RetroButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SeeUponSigningBadge() {
  return (
    <span className="flex items-center gap-1 text-[9px] text-amber-400 font-pixel border border-amber-400/40 bg-amber-400/10 rounded px-1.5 py-0.5 whitespace-nowrap">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      See Upon Signing
    </span>
  );
}

function CommonAbilityRow({ 
  label, 
  value, 
  scoutPct, 
  isFullyRevealed,
  isSigningDayLocked = false,
}: { 
  label: string; 
  value?: number | null; 
  scoutPct: number;
  isFullyRevealed: boolean;
  isSigningDayLocked?: boolean;
}) {
  const revealed = isFullyRevealed || scoutPct >= 75;
  const displayValue = value ?? 50;

  // Signing-day lock always wins — even at 100% scouting, locked fields stay hidden
  if (isSigningDayLocked) {
    return (
      <div className="flex items-center justify-between p-2 bg-muted/50 rounded" data-testid={`common-ability-${label.toLowerCase().replace(/\s/g, "-")}`}>
        <span className="text-sm text-muted-foreground">{label}</span>
        <SeeUponSigningBadge />
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-between p-2 bg-muted/50 rounded" data-testid={`common-ability-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      {revealed ? (
        <LetterGrade value={displayValue} size="sm" isCommonAbility={true} />
      ) : (
        <span className="text-sm text-muted-foreground">??</span>
      )}
    </div>
  );
}

function RecruitActionsLog({ recruitId, leagueId }: { recruitId: string; leagueId: string }) {
  const { data: actionsData, isLoading } = useQuery<{ actions: Array<{
    id: string;
    week: number;
    season: number;
    actionType: string;
    interestChange: number;
    notes: string | null;
    isAutoPilot: boolean;
    createdAt: string;
  }> }>({
    queryKey: ["/api/leagues", leagueId, "recruiting", recruitId, "actions"],
    enabled: !!recruitId && !!leagueId,
  });

  const actionIcons: Record<string, any> = {
    scout: <Eye className="w-3 h-3" />,
    phone: <Phone className="w-3 h-3" />,
    email: <Mail className="w-3 h-3" />,
    offer: <GraduationCap className="w-3 h-3" />,
    visit: <MapPin className="w-3 h-3" />,
  };

  const actionColors: Record<string, string> = {
    scout: "text-green-400",
    phone: "text-blue-400",
    email: "text-purple-400",
    offer: "text-gold",
    visit: "text-teal-400",
  };

  if (isLoading) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <h4 className="font-pixel text-[10px] text-gold mb-2">Activity Log</h4>
        <Skeleton className="h-20" />
      </div>
    );
  }

  if (!actionsData?.actions?.length) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <h4 className="font-pixel text-[10px] text-gold mb-2">Activity Log</h4>
        <p className="text-xs text-muted-foreground italic">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <h4 className="font-pixel text-[10px] text-gold mb-2">Activity Log</h4>
      <div className="max-h-32 overflow-y-auto space-y-1">
        {actionsData.actions.slice(0, 10).map((action) => (
          <div 
            key={action.id} 
            className="flex items-center gap-2 text-xs py-1 px-2 bg-muted/30 rounded"
            data-testid={`action-log-${action.id}`}
          >
            <span className={actionColors[action.actionType] || "text-muted-foreground"}>
              {actionIcons[action.actionType] || <HelpCircle className="w-3 h-3" />}
            </span>
            <span className="text-muted-foreground">
              Wk {action.week}, S{action.season}
            </span>
            <span className="text-foreground capitalize">{action.actionType}</span>
            {action.isAutoPilot ? (
              <span className="text-blue-400/80 flex-1">by CPU (Auto-Pilot)</span>
            ) : (
              action.notes && (
                <span className="text-muted-foreground truncate flex-1">{action.notes}</span>
              )
            )}
            {action.interestChange !== 0 && (
              <span className={action.interestChange > 0 ? getInterestChangeLabel(action.interestChange).color : "text-red-400"}>
                {action.interestChange > 0 ? `↑ ${getInterestChangeLabel(action.interestChange).label}` : "↓ Interest dropped"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecruitingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-md border border-border/50 bg-card/30">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-md border border-border/50 bg-card/30">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-5 w-8" />
              <div className="flex-1">
                <Skeleton className="h-4 w-36 mb-1" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
