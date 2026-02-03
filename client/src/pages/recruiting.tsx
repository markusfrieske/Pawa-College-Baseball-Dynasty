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
  Gift
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
  sort: string;
}
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Recruit, RecruitingInterest, Team } from "@shared/schema";
import { getAbilityByName } from "@shared/abilities";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PitchMixDial } from "@/components/ui/pitch-mix-dial";
import { LetterGrade } from "@/components/ui/letter-grade";
import { velocityToMPH } from "@/lib/playerUtils";

interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
  topSchools?: { teamId: string; teamName: string; abbreviation: string; primaryColor: string; interestLevel: number }[];
}

interface RecruitingData {
  recruits: RecruitWithInterest[];
  team: Team;
  remainingActions: number;
  maxActions: number;
  remainingScoutActions: number;
  maxScoutActions: number;
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
];

export default function RecruitingPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedRecruit, setSelectedRecruit] = useState<RecruitWithInterest | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");
  const [starFilter, setStarFilter] = useState("all");
  const [sortBy, setSortBy] = useState("classRank");
  const [showTeamNeeds, setShowTeamNeeds] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
    const saved = localStorage.getItem(`recruiting-presets-${id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [newPresetName, setNewPresetName] = useState("");
  const [compareRecruits, setCompareRecruits] = useState<RecruitWithInterest[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
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
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/phone`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      toast({ title: "Phone Call Made", description: "Interest level increased!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/email`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      toast({ title: "Email Sent", description: "Interest level increased!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const offerMutation = useMutation({
    mutationFn: async (recruitId: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/offer`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      toast({ title: "Scholarship Offered", description: "Major interest boost!" });
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
    if (showWatchlistOnly && !r.interest?.isTargeted) return false;
    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case "classRank":
        return (a.classRank || 999) - (b.classRank || 999);
      case "positionRank":
        return (a.positionRank || 999) - (b.positionRank || 999);
      case "overall":
        return b.overall - a.overall;
      case "starRank":
        return b.starRank - a.starRank || b.overall - a.overall;
      case "name":
        return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
      case "state":
        return (a.homeState || "").localeCompare(b.homeState || "") || (a.classRank || 999) - (b.classRank || 999);
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
            <StatCard icon={<Target className="w-4 h-4" />} label="Targets" value={`${data?.targetedCount || 0}/30`} />
            <StatCard icon={<Check className="w-4 h-4" />} label="Commits" value={`${data?.commitsCount || 0}/${data?.maxCommits ?? 0}`} />
            <StatCard icon={<Phone className="w-4 h-4" />} label="Recruiting Actions" value={`${data?.remainingActions ?? 0}/${data?.maxActions ?? 0}`} />
            <StatCard icon={<Eye className="w-4 h-4" />} label="Scout Actions" value={`${data?.remainingScoutActions ?? 0}/${data?.maxScoutActions ?? 0}`} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <RetroCard className="mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <RetroInput
                placeholder="Search recruits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-48"
                data-testid="input-search-recruits"
              />
            </div>
            <RetroSelect
              options={positionOptions}
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-40"
              data-testid="select-position-filter"
            />
            <RetroSelect
              options={starOptions}
              value={starFilter}
              onChange={(e) => setStarFilter(e.target.value)}
              className="w-40"
              data-testid="select-star-filter"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <RetroSelect
                options={sortOptions}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-44"
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
              Watchlist {showWatchlistOnly && `(${data?.targetedCount || 0})`}
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
            <div className="flex items-center gap-2 ml-auto">
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
            />
          )}
        </RetroCard>

        <div className="space-y-3">
          {filteredRecruits.map((recruit) => (
            <RecruitRow
              key={recruit.id}
              recruit={recruit}
              leagueId={id!}
              onTarget={() => targetMutation.mutate(recruit.id)}
              onScout={() => scoutMutation.mutate(recruit.id)}
              onPhone={() => phoneMutation.mutate(recruit.id)}
              onEmail={() => emailMutation.mutate(recruit.id)}
              onOffer={() => offerMutation.mutate(recruit.id)}
              onSaveNotes={(notes) => notesMutation.mutate({ recruitId: recruit.id, notes })}
              onToggleCompare={() => toggleCompare(recruit)}
              isTargeting={targetMutation.isPending}
              isScouting={scoutMutation.isPending}
              isPhoning={phoneMutation.isPending}
              isEmailing={emailMutation.isPending}
              isOffering={offerMutation.isPending}
              isSavingNotes={notesMutation.isPending}
              isSelected={compareRecruits.some(r => r.id === recruit.id)}
              isBulkSelected={bulkSelected.has(recruit.id)}
              onBulkSelect={() => toggleBulkSelect(recruit.id)}
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
        onPhone={(recruitId) => phoneMutation.mutate(recruitId)}
        isPhoning={phoneMutation.isPending}
        onEmail={(recruitId) => emailMutation.mutate(recruitId)}
        isEmailing={emailMutation.isPending}
        onOffer={(recruitId) => offerMutation.mutate(recruitId)}
        isOffering={offerMutation.isPending}
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
  seniorsGraduating 
}: { 
  nextYearDepth: Record<string, number>; 
  nextYearRosterSize: number;
  seniorsGraduating: number;
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
          
          return (
            <div
              key={pos}
              className={`p-2 rounded text-center border ${
                status === "need" 
                  ? "border-red-500/50 bg-red-500/10" 
                  : status === "ok" 
                    ? "border-yellow-500/50 bg-yellow-500/10" 
                    : "border-green-500/50 bg-green-500/10"
              }`}
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
  onOffer,
  onSaveNotes,
  onToggleCompare,
  isTargeting,
  isScouting,
  isPhoning,
  isEmailing,
  isOffering,
  isSavingNotes,
  isSelected,
  isBulkSelected,
  onBulkSelect,
}: {
  recruit: RecruitWithInterest;
  leagueId: string;
  onTarget: () => void;
  onScout: () => void;
  onPhone: () => void;
  onEmail: () => void;
  onOffer: () => void;
  onSaveNotes: (notes: string) => void;
  onToggleCompare: () => void;
  isTargeting: boolean;
  isScouting: boolean;
  isPhoning: boolean;
  isEmailing: boolean;
  isOffering: boolean;
  isSavingNotes: boolean;
  isSelected: boolean;
  isBulkSelected: boolean;
  onBulkSelect: () => void;
}) {
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notesValue, setNotesValue] = useState(recruit.interest?.notes || "");

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

  return (
    <RetroCard className={`hover:border-gold/30 transition-colors ${isSelected ? "border-gold ring-1 ring-gold/50" : ""}`} data-testid={`card-recruit-${recruit.id}`}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-4 flex-1">
          {scoutPct < 100 && (
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
          <button
            onClick={onToggleCompare}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected ? "bg-gold border-gold text-forest-dark" : "border-muted-foreground/50 hover:border-gold"
            }`}
            data-testid={`checkbox-compare-${recruit.id}`}
          >
            {isSelected && <Check className="w-3 h-3" />}
          </button>
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
              <Badge className={`${stage.color} text-white text-[8px]`}>{stage.label}</Badge>
              <Badge variant="outline" className="text-[8px]">
                  {recruit.recruitType === "JUCO" ? `JUCO ${recruit.recruitYear || "FR"}` : recruit.recruitType}
                </Badge>
              {totalAbilities > 0 && (
                <Badge variant="outline" className="text-[8px] border-gold/50 text-gold">
                  {isFullyRevealed ? `${totalAbilities} Abilities` : `${revealedAbilitiesCount}/${totalAbilities > revealedAbilitiesCount ? "?" : totalAbilities}`}
                </Badge>
              )}
              {isFullyRevealed && recruit.isGem && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center justify-center w-5 h-5 bg-green-500/20 rounded-full">
                      <Gem className="w-3 h-3 text-green-400" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Gem - Better than ranking suggests</TooltipContent>
                </Tooltip>
              )}
              {isFullyRevealed && recruit.isBust && (
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
        </div>

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
                  disabled={isScouting || scoutPct >= 100}
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
                  variant="outline"
                  size="sm"
                  onClick={onPhone}
                  disabled={isPhoning || !recruit.interest}
                  data-testid={`button-phone-${recruit.id}`}
                >
                  <Phone className="w-3 h-3" />
                </RetroButton>
              </TooltipTrigger>
              <TooltipContent>Phone Call (+5% interest)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <RetroButton
                  variant="outline"
                  size="sm"
                  onClick={onEmail}
                  disabled={isEmailing || !recruit.interest}
                  data-testid={`button-email-${recruit.id}`}
                >
                  <Mail className="w-3 h-3" />
                </RetroButton>
              </TooltipTrigger>
              <TooltipContent>Send Email (+3% interest)</TooltipContent>
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
              <TooltipContent>{recruit.interest?.hasOffer ? "Scholarship Offered" : "Offer Scholarship (+15% interest)"}</TooltipContent>
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
      </div>

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
            {recruit.topSchools.slice(0, recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8).map((school, i) => (
              <div key={school.teamId} className="flex items-center gap-2">
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
                      width: `${Math.min(100, school.interestLevel)}%`,
                      backgroundColor: school.primaryColor 
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-6 text-right">{school.interestLevel}%</span>
              </div>
            ))}
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
  onOffer,
  isOffering,
}: {
  recruit: RecruitWithInterest | null;
  onClose: () => void;
  leagueId: string;
  onScout: (recruitId: string) => void;
  isScouting: boolean;
  onPhone: (recruitId: string) => void;
  isPhoning: boolean;
  onEmail: (recruitId: string) => void;
  isEmailing: boolean;
  onOffer: (recruitId: string) => void;
  isOffering: boolean;
}) {
  if (!recruit) return null;

  const scoutPct = recruit.interest?.scoutPercentage || 0;
  // Blue chips have all ratings revealed automatically
  const isFullyRevealed = recruit.isBlueChip || scoutPct >= 100;
  const revealedAttrs = recruit.isBlueChip 
    ? ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "velocity", "control", "stamina", "stuff"]
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
    { key: "stuff", label: "Stuff", value: recruit.stuff },
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
      { name: "SL", rating: isFullyRevealed || revealedAttrs.includes("stuff") ? Math.floor((recruit.stuff || 0) * 0.8) : 0 },
      { name: "CB", rating: isFullyRevealed || revealedAttrs.includes("control") ? Math.floor((recruit.control || 0) * 0.7) : 0 },
      { name: "CH", rating: isFullyRevealed || revealedAttrs.includes("stuff") ? Math.floor((recruit.stuff || 0) * 0.6) : 0 },
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
              <span>{recruit.recruitType === "HS" ? "High School" : `JUCO ${recruit.recruitYear || "FR"} Transfer`}</span>
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

          {recruit.dealbreaker && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
              <div className="flex items-center gap-2 text-red-400 mb-1">
                <HelpCircle className="w-4 h-4" />
                <span className="font-pixel text-[10px]">Dealbreaker</span>
              </div>
              <p className="text-sm text-foreground">{recruit.dealbreaker}</p>
            </div>
          )}

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
              onClick={() => onPhone(recruit.id)}
              disabled={isPhoning}
            >
              <Phone className="w-4 h-4 mr-2" />
              {isPhoning ? "Calling..." : "Phone Call"}
            </RetroButton>
            <RetroButton 
              variant="outline" 
              className="flex-1" 
              data-testid="button-email"
              onClick={() => onEmail(recruit.id)}
              disabled={isEmailing}
            >
              <Mail className="w-4 h-4 mr-2" />
              {isEmailing ? "Sending..." : "Email"}
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
              <span className={action.interestChange > 0 ? "text-green-400" : "text-red-400"}>
                {action.interestChange > 0 ? "+" : ""}{action.interestChange}%
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
