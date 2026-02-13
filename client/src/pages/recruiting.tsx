import { useState, useEffect, useCallback } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPotentialRangeLabel } from "@shared/potential";
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
  Skull
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
  sort: string;
}
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Recruit, RecruitingInterest, Team } from "@shared/schema";

function getInterestLabel(level: number): { label: string; color: string } {
  if (level >= 90) return { label: "On Fire", color: "text-red-400" };
  if (level >= 70) return { label: "Very Hot", color: "text-orange-400" };
  if (level >= 50) return { label: "Hot", color: "text-yellow-400" };
  if (level >= 30) return { label: "Warm", color: "text-green-400" };
  if (level >= 15) return { label: "Cool", color: "text-blue-400" };
  return { label: "Cold", color: "text-blue-300" };
}

function getInterestChangeLabel(change: number): { label: string; color: string } {
  if (change >= 15) return { label: "Big Boost", color: "text-green-400" };
  if (change >= 8) return { label: "Good Progress", color: "text-green-400" };
  if (change >= 3) return { label: "Some Interest", color: "text-yellow-400" };
  return { label: "Slight Interest", color: "text-blue-400" };
}
import { getAbilityByName } from "@shared/abilities";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PitchMixDial } from "@/components/ui/pitch-mix-dial";
import { LetterGrade } from "@/components/ui/letter-grade";
import { velocityToMPH } from "@/lib/playerUtils";

interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
  topSchools?: { teamId: string; teamName: string; abbreviation: string; primaryColor: string; interestLevel: number }[];
  signedTeamName?: string | null;
  signedTeamAbbreviation?: string | null;
  signedTeamPrimaryColor?: string | null;
  signedTeamSecondaryColor?: string | null;
}

interface RecruitingData {
  recruits: RecruitWithInterest[];
  team: Team;
  remainingActions: number;
  maxActions: number;
  actionsUsed: number;
  remainingScoutActions: number;
  maxScoutActions: number;
  scoutActionsUsed: number;
  targetedCount: number;
  commitsCount: number;
  maxCommits: number;
  rosterDepth: Record<string, number>;
  rosterSize: number;
  nextYearDepth: Record<string, number>;
  nextYearRosterSize: number;
  seniorsGraduating: number;
}

const positionOptions = [
  { value: "all", label: "All Positions" },
  { value: "P", label: "Pitcher" },
  { value: "C", label: "Catcher" },
  { value: "1B", label: "First Base" },
  { value: "2B", label: "Second Base" },
  { value: "SS", label: "Shortstop" },
  { value: "3B", label: "Third Base" },
  { value: "LF", label: "Left Field" },
  { value: "CF", label: "Center Field" },
  { value: "RF", label: "Right Field" },
];

const starOptions = [
  { value: "all", label: "All Stars" },
  { value: "5", label: "5 Star" },
  { value: "4", label: "4+ Star" },
  { value: "3", label: "3+ Star" },
];

const sortOptions = [
  { value: "classRank", label: "Class Rank" },
  { value: "positionRank", label: "Position Rank" },
  { value: "overall", label: "Overall (High to Low)" },
  { value: "starRank", label: "Star Rating" },
  { value: "name", label: "Name (A-Z)" },
  { value: "state", label: "Home State" },
  { value: "scoutPriority", label: "Scout Priority (Targeted First)" },
  { value: "interest", label: "Interest Level" },
  { value: "myInterest", label: "Interest in You (High to Low)" },
];

export default function RecruitingPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedRecruit, setSelectedRecruit] = useState<RecruitWithInterest | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");
  const [starFilter, setStarFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("classRank");
  const [showTeamNeeds, setShowTeamNeeds] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
    const saved = localStorage.getItem(`recruiting-presets-${id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [newPresetName, setNewPresetName] = useState("");
  const [compareRecruits, setCompareRecruits] = useState<RecruitWithInterest[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showTopAvailable, setShowTopAvailable] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
    pipeline: { cold: number; cool: number; warm: number; hot: number; very_hot: number; on_fire: number; committed: number };
    positionNeeds: { position: string; current: number; graduating: number; need: boolean }[];
    totalTargeted: number;
    rosterSize: number;
  }>({
    queryKey: ["/api/leagues", id, "recruiting", "pipeline"],
  });

  const { data: trendsData } = useQuery<{
    trends: Record<string, { trend: "up" | "down" | "flat"; recentGain: number }>;
  }>({
    queryKey: ["/api/leagues", id, "recruiting", "trends"],
  });

  const { data: leagueData } = useQuery<{ id: string; currentWeek: number; currentSeason: number; progressionEnabled?: boolean }>({
    queryKey: ["/api/leagues", id],
  });

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
      createdAt: string;
      recruitName: string;
      recruitPosition: string;
      recruitStarRating: number;
    }>;
  }>({
    queryKey: ["/api/leagues", id, "recruiting-history"],
  });

  const scoutMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/scout`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      toast({ title: "Scouting complete", description: "New attributes revealed!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const targetMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/target`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      toast({ title: "Recruit targeted", description: "Added to your target list." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const phoneMutation = useMutation({
    mutationFn: async ({ recruitId, pitchTopic }: { recruitId: string; pitchTopic?: string }) => {
      const pitchTopics = pitchTopic ? pitchTopic.split(",") : undefined;
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/phone`, { pitchTopics });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      toast({ 
        title: "Phone Call Made", 
        description: `${changeLabel.label}` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async ({ recruitId, pitchTopic }: { recruitId: string; pitchTopic?: string }) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/email`, { pitchTopic });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      toast({ 
        title: "Email Sent", 
        description: `${changeLabel.label}` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const visitMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/visit`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      toast({ 
        title: "Campus Visit Scheduled", 
        description: `${changeLabel.label}` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const offerMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/offer`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      toast({ title: "Scholarship Offered", description: `${changeLabel.label}` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Bulk Scouting Complete", description: `Scouted ${recruitIds.length} recruits!` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
    if (showWatchlistOnly && !r.interest?.isTargeted) return false;
    if (showTopAvailable && pipelineData?.positionNeeds) {
      const needPositions = pipelineData.positionNeeds.filter(p => p.need).map(p => p.position);
      if (!needPositions.includes(r.position)) return false;
      if (r.signedTeamId) return false;
    }
    if (sortBy === "interest" && !(r.interest && (r.interest.interestLevel || 0) > 0)) return false;
    if (sortBy === "myInterest" && !(r.interest && (r.interest.interestLevel || 0) > 0)) return false;
    if (pipelineFilter) {
      const level = r.interest?.interestLevel || 0;
      if (pipelineFilter === "cold" && !(level >= 1 && level <= 15)) return false;
      if (pipelineFilter === "cool" && !(level >= 15 && level <= 29)) return false;
      if (pipelineFilter === "warm" && !(level >= 30 && level <= 49)) return false;
      if (pipelineFilter === "hot" && !(level >= 50 && level <= 69)) return false;
      if (pipelineFilter === "very_hot" && !(level >= 70 && level <= 89)) return false;
      if (pipelineFilter === "on_fire" && !(level >= 90)) return false;
      if (pipelineFilter === "committed" && !r.signedTeamId) return false;
      if (pipelineFilter === "home_state" && r.homeState !== data?.team?.state) return false;
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
            <div className="flex flex-col gap-1">
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
              <h1 className="font-pixel text-gold text-lg">Recruiting</h1>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <StatCard icon={<Target className="w-4 h-4" />} label="Targets" value={`${data?.targetedCount || 0}/20`} />
            <StatCard icon={<Check className="w-4 h-4" />} label="Commits" value={`${data?.commitsCount || 0}/${data?.maxCommits ?? 0}`} />
            <StatCard icon={<Phone className="w-4 h-4" />} label="Recruiting Actions" value={`${data?.actionsUsed ?? 0}/${data?.maxActions ?? 0}`} />
            <StatCard icon={<Eye className="w-4 h-4" />} label="Scout Actions" value={`${data?.scoutActionsUsed ?? 0}/${data?.maxScoutActions ?? 0}`} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <RetroCard className="mb-6">
          <div className="flex flex-wrap gap-2 sm:gap-4 items-center">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <RetroInput
                placeholder="Search recruits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full sm:w-48"
                data-testid="input-search-recruits"
              />
            </div>
            <RetroSelect
              options={positionOptions}
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-[calc(50%-0.25rem)] sm:w-40"
              data-testid="select-position-filter"
            />
            <RetroSelect
              options={starOptions}
              value={starFilter}
              onChange={(e) => setStarFilter(e.target.value)}
              className="w-[calc(50%-0.25rem)] sm:w-40"
              data-testid="select-star-filter"
            />
            <RetroSelect
              options={[
                { label: "All States", value: "all" },
                ...(data?.recruits ? Array.from(new Set(data.recruits.map(r => r.homeState).filter(Boolean))).sort().map(s => ({ label: s!, value: s! })) : [])
              ]}
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-[calc(50%-0.25rem)] sm:w-32"
              data-testid="select-state-filter"
            />
            <div className="flex items-center gap-2 w-[calc(50%-0.25rem)] sm:w-auto">
              <span className="text-xs text-muted-foreground shrink-0">Sort:</span>
              <RetroSelect
                options={sortOptions}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full sm:w-44"
                data-testid="select-sort"
              />
            </div>
            <RetroButton 
              variant={showWatchlistOnly ? "primary" : "outline"} 
              size="sm" 
              onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
              data-testid="button-watchlist-filter"
            >
              <Target className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Watchlist</span><span className="sm:hidden">Watch</span> {showWatchlistOnly && `(${data?.targetedCount || 0})`}
            </RetroButton>
            <RetroButton
              variant={showTopAvailable ? "primary" : "outline"}
              size="sm"
              onClick={() => setShowTopAvailable(!showTopAvailable)}
              data-testid="button-top-available"
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Top Available</span><span className="sm:hidden">Top</span>
            </RetroButton>
            <Popover>
              <PopoverTrigger asChild>
                <RetroButton variant="outline" size="sm" data-testid="button-presets">
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
            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
              {(() => {
                const unscoutedTargets = data?.recruits.filter(r => r.interest?.isTargeted && (r.interest?.scoutPercentage || 0) < 100) || [];
                return unscoutedTargets.length > 0 ? (
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => bulkScoutMutation.mutate(unscoutedTargets.map(r => r.id))}
                    disabled={bulkScoutMutation.isPending || (data?.remainingScoutActions ?? 0) <= 0}
                    data-testid="button-quick-scout-targets"
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    {bulkScoutMutation.isPending ? "Scouting..." : `Scout Targets (${unscoutedTargets.length})`}
                  </RetroButton>
                ) : null;
              })()}
              <RetroButton
                variant="outline"
                size="sm"
                onClick={selectAllVisible}
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
                  data-testid="button-bulk-scout"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  {bulkScoutMutation.isPending ? "Scouting..." : `Scout Selected (${bulkSelected.size})`}
                </RetroButton>
              )}
              <RetroButton
                variant="outline"
                size="sm"
                onClick={() => setShowTeamNeeds(!showTeamNeeds)}
                data-testid="button-toggle-team-needs"
              >
                <Users className="w-3 h-3 mr-1" />
                Team Needs
              </RetroButton>
              <RetroButton
                variant={showPipeline ? "primary" : "outline"}
                size="sm"
                onClick={() => setShowPipeline(!showPipeline)}
                data-testid="button-toggle-pipeline"
              >
                <BarChart3 className="w-3 h-3 mr-1" />
                Pipeline
              </RetroButton>
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredRecruits.length} recruits found
            </span>
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
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[
                  { label: "Cold", key: "cold", count: pipelineData.pipeline.cold, color: "bg-blue-300/20 text-blue-300" },
                  { label: "Cool", key: "cool", count: pipelineData.pipeline.cool, color: "bg-blue-400/20 text-blue-400" },
                  { label: "Warm", key: "warm", count: pipelineData.pipeline.warm, color: "bg-green-400/20 text-green-400" },
                  { label: "Hot", key: "hot", count: pipelineData.pipeline.hot, color: "bg-yellow-400/20 text-yellow-400" },
                  { label: "Very Hot", key: "very_hot", count: pipelineData.pipeline.very_hot, color: "bg-orange-400/20 text-orange-400" },
                  { label: "On Fire", key: "on_fire", count: pipelineData.pipeline.on_fire, color: "bg-red-400/20 text-red-400" },
                  { label: "Committed", key: "committed", count: pipelineData.pipeline.committed, color: "bg-gold/20 text-gold" },
                  { label: "Home State", key: "home_state", count: data?.recruits.filter(r => r.homeState === data?.team?.state).length || 0, color: "bg-purple-400/20 text-purple-400" },
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
              onOffer={() => offerMutation.mutate(recruit.id)}
              onSaveNotes={(notes) => notesMutation.mutate({ recruitId: recruit.id, notes })}
              onToggleCompare={() => toggleCompare(recruit)}
              isTargeting={targetMutation.isPending}
              isScouting={scoutMutation.isPending}
              isPhoning={phoneMutation.isPending}
              isEmailing={emailMutation.isPending}
              isVisiting={visitMutation.isPending}
              isOffering={offerMutation.isPending}
              isSavingNotes={notesMutation.isPending}
              isSelected={compareRecruits.some(r => r.id === recruit.id)}
              isBulkSelected={bulkSelected.has(recruit.id)}
              onBulkSelect={() => toggleBulkSelect(recruit.id)}
              trend={trendsData?.trends?.[recruit.id]}
              userTeamId={data?.team?.id}
              positionNeed={pipelineData?.positionNeeds?.find(p => p.position === recruit.position)?.need}
              outOfRecruitingActions={(data?.remainingActions ?? 1) <= 0}
              outOfScoutActions={(data?.remainingScoutActions ?? 1) <= 0}
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
        onOffer={(recruitId) => offerMutation.mutate(recruitId)}
        isOffering={offerMutation.isPending}
        outOfRecruitingActions={(data?.remainingActions ?? 1) <= 0}
      />

      {compareRecruits.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-card border border-gold rounded-lg shadow-lg p-3 flex items-center gap-4 z-50" data-testid="compare-bar">
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
  LF: 2,
  CF: 2,
  RF: 2,
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
  const positions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  
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
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
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
  onOffer,
  onSaveNotes,
  onToggleCompare,
  isTargeting,
  isScouting,
  isPhoning,
  isEmailing,
  isVisiting,
  isOffering,
  isSavingNotes,
  isSelected,
  isBulkSelected,
  onBulkSelect,
  trend,
  userTeamId,
  positionNeed,
  outOfRecruitingActions,
  outOfScoutActions,
  progressionEnabled,
}: {
  recruit: RecruitWithInterest;
  leagueId: string;
  onTarget: () => void;
  onScout: () => void;
  onPhone: (pitchTopic?: string) => void;
  onEmail: (pitchTopic?: string) => void;
  onVisit: () => void;
  onOffer: () => void;
  onSaveNotes: (notes: string) => void;
  onToggleCompare: () => void;
  isTargeting: boolean;
  isScouting: boolean;
  isPhoning: boolean;
  isEmailing: boolean;
  isVisiting: boolean;
  isOffering: boolean;
  isSavingNotes: boolean;
  isSelected: boolean;
  isBulkSelected: boolean;
  onBulkSelect: () => void;
  trend?: { trend: "up" | "down" | "flat"; recentGain: number };
  userTeamId?: string;
  positionNeed?: boolean;
  outOfRecruitingActions?: boolean;
  outOfScoutActions?: boolean;
  progressionEnabled?: boolean;
}) {
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notesValue, setNotesValue] = useState(recruit.interest?.notes || "");
  const [showPhonePicker, setShowPhonePicker] = useState(false);
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [selectedPhonePitches, setSelectedPhonePitches] = useState<string[]>([]);
  const [selectedEmailPitch, setSelectedEmailPitch] = useState<string | null>(null);

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
  // Blue chips always have ratings revealed
  const isFullyRevealed = recruit.isBlueChip || scoutPct >= 100;

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

  return (
    <RetroCard 
      className={`hover:border-gold/30 transition-colors ${isSelected ? "border-gold ring-1 ring-gold/50" : ""}`} 
      data-testid={`card-recruit-${recruit.id}`}
      style={isSigned && recruit.signedTeamPrimaryColor ? { borderLeft: `4px solid ${recruit.signedTeamPrimaryColor}` } : undefined}
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
              {positionNeed && (
                <Badge variant="outline" className="text-[8px] border-red-500/50 text-red-400">
                  NEED
                </Badge>
              )}
              {isFullyRevealed && (recruit as any).isGenerationalGem && (
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
              {isFullyRevealed && (recruit as any).isGenerationalBust && (
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
              {isFullyRevealed && recruit.isGem && !(recruit as any).isGenerationalGem && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center justify-center w-5 h-5 bg-green-500/20 rounded-full">
                      <Gem className="w-3 h-3 text-green-400" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Gem - Better than ranking suggests</TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isBust && !(recruit as any).isGenerationalBust && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center justify-center w-5 h-5 bg-red-500/20 rounded-full">
                      <XCircle className="w-3 h-3 text-red-400" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Bust - Worse than ranking suggests</TooltipContent>
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
          {progressionEnabled && recruit.potentialFloor != null && recruit.potentialCeiling != null && scoutPct >= 100 && (
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
          <div className="flex items-center gap-4">
            <div className="w-32">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Scout</span>
                <span>{scoutPct}%</span>
              </div>
              <Progress value={scoutPct} className="h-2" />
            </div>

            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={onScout}
                    disabled={isScouting || scoutPct >= 100 || outOfScoutActions}
                    data-testid={`button-scout-${recruit.id}`}
                  >
                    <Search className="w-3 h-3" />
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>Scout</TooltipContent>
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
                    <Target className="w-3 h-3" />
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>Target</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <RetroButton
                    variant={showPhonePicker ? "primary" : "outline"}
                    size="sm"
                    onClick={() => { setShowPhonePicker(!showPhonePicker); setShowEmailPicker(false); setSelectedPhonePitches([]); }}
                    disabled={isPhoning || !recruit.interest || outOfRecruitingActions}
                    data-testid={`button-phone-${recruit.id}`}
                  >
                    <Phone className="w-3 h-3" />
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>Phone Call (3 pitches)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <RetroButton
                    variant={showEmailPicker ? "primary" : "outline"}
                    size="sm"
                    onClick={() => { setShowEmailPicker(!showEmailPicker); setShowPhonePicker(false); setSelectedEmailPitch(null); }}
                    disabled={isEmailing || !recruit.interest || outOfRecruitingActions}
                    data-testid={`button-email-${recruit.id}`}
                  >
                    <Mail className="w-3 h-3" />
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>Send Email (1 pitch)</TooltipContent>
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
                    <Gift className="w-3 h-3" />
                  </RetroButton>
                </TooltipTrigger>
                <TooltipContent>{recruit.interest?.hasOffer ? "Scholarship Offered" : "Offer Scholarship"}</TooltipContent>
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
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Top Schools Interest</span>
            <Badge variant="outline" className="text-[8px]">
              {recruit.stage === "open" ? "8 Schools" : recruit.stage === "top8" ? "Top 8" : recruit.stage === "top5" ? "Top 5" : recruit.stage === "top3" ? "Top 3" : recruit.stage}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {recruit.topSchools.slice(0, recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8).map((school, i) => {
              const isUserSchool = userTeamId && school.teamId === userTeamId;
              const schoolTrend = isUserSchool ? trend : undefined;
              return (
                <div key={school.teamId} className={`flex items-center gap-2 ${isUserSchool ? "bg-gold/5 -mx-1 px-1 rounded" : ""}`}>
                  <TeamBadge
                    abbreviation={school.abbreviation}
                    primaryColor={school.primaryColor}
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
  onOffer,
  isOffering,
  outOfRecruitingActions,
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
  onOffer: (recruitId: string) => void;
  isOffering: boolean;
  outOfRecruitingActions?: boolean;
}) {
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
  const isFullyRevealed = recruit.isBlueChip || scoutPct >= 100;
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

  return (
    <Dialog open={!!recruit} onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-gold max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <PlayerPortrait 
              skinTone={recruit.skinTone || "light"}
              hairColor={recruit.hairColor || "brown"}
              hairStyle={recruit.hairStyle || "short"}
              className="w-16 h-16 flex-shrink-0"
              isRecruit={true}
            />
            <div className="flex-1">
              <DialogTitle className="font-pixel text-gold flex items-center gap-3 flex-wrap">
                <PositionBadge position={recruit.position} size="lg" />
                <span>{recruit.firstName} {recruit.lastName}</span>
                <StarRating rating={recruit.starRank} />
                {recruit.isBlueChip && (
                  <Badge className="bg-blue-500 text-white">Blue Chip</Badge>
                )}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span>{recruit.hometown}, {recruit.homeState}</span>
              </div>
            </div>
          </div>
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

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              <span>{recruit.recruitType === "TRANSFER" ? `Transfer from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "SO"})` : recruit.recruitType === "JUCO" ? `JUCO Transfer from ${recruit.fromTeamName || "Unknown"} (${recruit.recruitYear || "FR"})` : "High School"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Bats {recruit.batHand || "R"} / Throws {recruit.throwHand || "R"}</span>
            </div>
          </div>

          {recruit.position === "P" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Attributes</h4>
                <div className="grid grid-cols-2 gap-3">
                  {attrs.map((attr) => {
                    const revealed = isFullyRevealed || revealedAttrs.includes(attr.key);
                    const isVelocity = attr.key === "velocity";
                    const displayValue = isVelocity && revealed 
                      ? `${velocityToMPH(attr.value)} MPH`
                      : (revealed ? attr.value : "??");
                    return (
                      <div key={attr.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm text-muted-foreground">{attr.label}</span>
                        <span className={`font-bold ${revealed ? "text-foreground" : "text-muted-foreground"}`}>
                          {displayValue}
                        </span>
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
                  const revealed = isFullyRevealed || revealedAttrs.includes(attr.key);
                  return (
                    <div key={attr.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span className="text-sm text-muted-foreground">{attr.label}</span>
                      <span className={`font-bold ${revealed ? "text-foreground" : "text-muted-foreground"}`}>
                        {revealed ? attr.value : "??"}
                      </span>
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
                  <CommonAbilityRow label="W/RISP" value={recruit.wRISP} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="vs Lefty" value={recruit.vsLefty} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Poise" value={recruit.poise} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Grit" value={recruit.grit} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Heater" value={recruit.heater} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Agile" value={recruit.agile} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Recovery" value={recruit.recovery} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                </>
              ) : (
                <>
                  <CommonAbilityRow label="Clutch" value={recruit.clutch} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="vs LHP" value={recruit.vsLHP} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Grit" value={recruit.grit} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Stealing" value={recruit.stealing} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Running" value={recruit.running} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Throwing" value={recruit.throwing} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  <CommonAbilityRow label="Recovery" value={recruit.recovery} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
                  {recruit.position === "C" && (
                    <CommonAbilityRow label="Catcher" value={recruit.catcherAbility} scoutPct={scoutPct} isFullyRevealed={isFullyRevealed} />
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
                      <Badge key={idx} variant="outline" className="text-xs border-muted-foreground/50 text-muted-foreground">
                        ???
                      </Badge>
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

          {/* Story-Revealed Traits */}
          {(recruit.personality || recruit.workEthic || recruit.gemBustRevealed) && (
            <div>
              <h4 className="font-pixel text-[10px] text-gold mb-3">Intangibles (Story Revealed)</h4>
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
                {recruit.gemBustRevealed && (
                  <div className={`rounded p-2.5 border col-span-2 ${
                    (recruit as any).isGenerationalGem ? "bg-amber-500/15 border-amber-500/40" :
                    (recruit as any).isGenerationalBust ? "bg-red-700/15 border-red-700/40" :
                    recruit.isGem ? "bg-green-500/10 border-green-500/30" : 
                    recruit.isBust ? "bg-red-500/10 border-red-500/30" : "bg-muted/30 border-border/50"
                  }`}>
                    <span className="text-[10px] text-muted-foreground block mb-1">Scout Assessment</span>
                    <span className={`text-sm font-medium ${
                      (recruit as any).isGenerationalGem ? "text-amber-400" :
                      (recruit as any).isGenerationalBust ? "text-red-400" :
                      recruit.isGem ? "text-green-400" : recruit.isBust ? "text-red-400" : "text-foreground"
                    }`}>
                      {(recruit as any).isGenerationalGem 
                        ? "GENERATIONAL TALENT - Once-in-a-generation player. Elite in every way."
                        : (recruit as any).isGenerationalBust 
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

          {!recruit.personality && !recruit.workEthic && !recruit.gemBustRevealed && (
            <div className="bg-muted/20 rounded p-3 border border-dashed border-border/40">
              <h4 className="font-pixel text-[10px] text-muted-foreground mb-1">Intangibles</h4>
              <p className="text-xs text-muted-foreground italic">Unknown - Follow this recruit's story arc to reveal personality, work ethic, and true potential.</p>
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
                variant="outline" 
                className="flex-1" 
                data-testid="button-visit"
                onClick={() => onVisit(recruit.id)}
                disabled={isVisiting || outOfRecruitingActions}
              >
                <MapPin className="w-4 h-4 mr-2" />
                {isVisiting ? "Scheduling..." : "Campus Visit"}
              </RetroButton>
              <RetroButton 
                variant="outline" 
                className="border-gold text-gold hover:bg-gold/10"
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
                          style={{ width: `${Math.min(100, (recruit.overall / 999) * 100)}%` }}
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

function CommonAbilityRow({ 
  label, 
  value, 
  scoutPct, 
  isFullyRevealed 
}: { 
  label: string; 
  value?: number | null; 
  scoutPct: number;
  isFullyRevealed: boolean;
}) {
  const revealed = isFullyRevealed || scoutPct >= 75;
  const displayValue = value ?? 50;
  
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
            {action.notes && (
              <span className="text-muted-foreground truncate flex-1">{action.notes}</span>
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
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Skeleton className="h-16 mb-6" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-32 mb-3" />
        ))}
      </main>
    </div>
  );
}
