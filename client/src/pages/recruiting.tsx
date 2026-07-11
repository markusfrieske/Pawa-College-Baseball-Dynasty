import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { parseErrorMessage } from "@/lib/errorUtils";
import { ArtworkBackground } from "@/components/artwork-background";
import { artBackgrounds } from "@/lib/art-assets";
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
import { QueryError } from "@/components/ui/query-error";
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
  ClipboardList,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RetroInput } from "@/components/ui/retro-input";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useRecruitingData, useRecruitingActions } from "@/hooks/use-recruiting";
import { MobileFilterSheet } from "@/components/recruiting/mobile-filter-sheet";
import { MobileRecruitingBoard } from "@/components/recruiting/mobile-board";
import { RecruitRow } from "@/components/recruiting/recruit-row";
import { RecruitDetailModal } from "@/components/recruiting/recruit-detail-modal";
import { CompareModal } from "@/components/recruiting/compare-modal";
import { StatCard } from "@/components/recruiting/stat-card";
import { TeamNeedsIndicator } from "@/components/recruiting/team-needs-indicator";
import { RecruitActionsLog } from "@/components/recruiting/recruit-actions-log";
import { CompetingSchoolsList, SeeUponSigningBadge, CommonAbilityRow } from "@/components/recruiting/recruiting-shared";

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
import type { Recruit, RecruitingInterest, Team, LastSeasonStats } from "@shared/schema";
import { getAbilityByName, S_GOLD_COMMON_KEY, S_GOLD_PITCHER_KEY } from "@shared/abilities";
import { TRAJECTORY_REVEAL_THRESHOLD, ARCHETYPE_REVEAL_THRESHOLD, computeRevealedPitchFields } from "@shared/recruitThresholds";
import { TrajectoryIcon } from "@/components/ui/trajectory-icon";
import { TRAJECTORY_FULL_LABELS } from "@shared/trajectory";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PitchMixDial } from "@/components/ui/pitch-mix-dial";
import { LetterGrade, getLetterGrade } from "@/components/ui/letter-grade";
import { velocityToKMH } from "@/lib/playerUtils";
import { playScoutSfx, playEmailSfx, playPhoneSfx, playVisitSfx, playOfferSfx } from "@/lib/sfx";
import { FlipReveal } from "@/components/ui/flip-reveal";

interface AutoPilotAlertEntry {
  recruitName: string;
  recruitStars: number;
  action: string;
  interestGain: number;
  week: number;
  season: number;
  isDeadlineForced: boolean;
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
  weeklyActionsWeek?: number;
  weeklyActionsSeason?: number;
  seasonVisitCount: { total: number; campusVisits: number; hcVisits: number };
  autoPilotPendingAlert: AutoPilotAlertEntry[];
}

import { 
  formatNilRange, 
  getInterestLabel, 
  getInterestBarColor, 
  quantizeInterestWidth, 
  qualifyTrend, 
  getInterestChangeLabel, 
  NIL_SCOUT_THRESHOLD, 
  positionOptions, 
  starOptions, 
  sortOptions,
  COMMON_KEY_TO_GOLD_LIST,
  recruitSGoldBadge,
  recruitSGoldDisplayValue,
  recruitPitcherSGoldBadge,
  recruitPitcherSGoldDisplayValue,
  filterRecruits,
  sortRecruits,
  RECOMMENDED_ACTION_META,
  type RecruitWithInterest,
  type RecruitRecommendation,
  type RecruitingRecommendationsData
} from "@/lib/recruitingUtils";

/** Auto-flipping icon for scout/scouting reveal in the action result modal. */
function ActionResultFlipIcon({ back }: { back: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 280);
    return () => clearTimeout(t);
  }, []);
  return (
    <FlipReveal
      revealed={revealed}
      duration={400}
      front={
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0d2a0d] border-2 border-[#c8aa6e]/25">
          <span className="font-pixel text-[#c8aa6e]/40 text-base select-none">?</span>
        </div>
      }
      back={
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1a3a1a] tap-pulse">
          {back}
        </div>
      }
    />
  );
}

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
  const [showWeeklyPlan, setShowWeeklyPlan] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(`recruiting-weekly-plan-collapsed-${id}`) !== "1";
    } catch {
      return true;
    }
  });
  const toggleWeeklyPlan = () => {
    setShowWeeklyPlan(prev => {
      const next = !prev;
      try {
        sessionStorage.setItem(`recruiting-weekly-plan-collapsed-${id}`, next ? "0" : "1");
      } catch { /* ignore */ }
      return next;
    });
  };
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
  const [modalRevealKey, setModalRevealKey] = useState(0);
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
  const isMobile = useIsMobile();

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

  const {
    recruitingData: { data, isLoading, isError, error, refetch },
    pipelineData: { data: pipelineData },
    trendsData: { data: trendsData },
    leagueData: { data: leagueData },
    recommendationsData: { data: recommendationsData },
    classRankingsData: { data: classRankingsData },
    storylinesData: { data: storylinesData },
    historyData: { data: historyData },
    weekRecapData: { data: weekRecapData },
    decommitAlertsData: { data: decommitAlerts },
    autoPilotLogData: { data: autoPilotLogData, refetch: refetchAutoPilotLog },
    battlesData: { data: battlesData },
    isPostSigningDay,
    recapWeek,
    recapSeason,
    hasPriorWeek,
  } = useRecruitingData(id!);

  const recommendationsByRecruit = useMemo(() => {
    const map = new Map<string, RecruitRecommendation>();
    for (const r of recommendationsData?.recommendations ?? []) map.set(r.recruitId, r);
    return map;
  }, [recommendationsData]);
  const currentWeek = leagueData?.currentWeek ?? 1;
  const currentSeason = leagueData?.currentSeason ?? 1;

  const {
    clearAutoPilotAlert: clearAutoPilotAlertMutation,
    dismissAutoPilotLog: dismissAutoPilotLogMutation,
    saveClass: saveClassMutation,
    scout: scoutMutation,
    target: targetMutation,
    saveNotes: notesMutation,
    setBoardRank: boardRankMutation,
    phone: phoneMutation,
    email: emailMutation,
    visit: visitMutation,
    headCoachVisit: headCoachVisitMutation,
    offer: offerMutation,
  } = useRecruitingActions(id!, currentWeek, currentSeason);

  const scoutCallbacks = {
    onSuccess: () => {
      playScoutSfx();
      setModalRevealKey(k => k + 1);
      setActionResultModal({ title: "Scouting Complete", description: "Scouting progress updated.", type: "success", icon: "scout" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Scouting Failed", description: parseErrorMessage(error), type: "error" });
    },
  };
  const targetCallbacks = {
    onSuccess: () => {
      playScoutSfx();
      setActionResultModal({ title: "Recruit Targeted", description: "Added to your target list.", type: "success", icon: "check" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Error", description: parseErrorMessage(error), type: "error" });
    },
  };
  const phoneCallbacks = {
    onSuccess: (data: any) => {
      playPhoneSfx();
      const gain = data?.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Phone Call Made", description: changeLabel.label, type: "success", icon: "phone" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Phone Call Failed", description: parseErrorMessage(error), type: "error" });
    },
  };
  const emailCallbacks = {
    onSuccess: (data: any) => {
      playEmailSfx();
      const gain = data?.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Email Sent", description: changeLabel.label, type: "success", icon: "email" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Email Failed", description: parseErrorMessage(error), type: "error" });
    },
  };
  const visitCallbacks = {
    onSuccess: (data: any) => {
      playVisitSfx();
      const gain = data?.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Campus Visit Scheduled", description: changeLabel.label, type: "success", icon: "visit" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Visit Failed", description: parseErrorMessage(error), type: "error" });
    },
  };
  const headCoachVisitCallbacks = {
    onSuccess: (data: any) => {
      playVisitSfx();
      const gain = data?.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Head Coach Visit Complete", description: changeLabel.label, type: "success", icon: "coach" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "HC Visit Failed", description: parseErrorMessage(error), type: "error" });
    },
  };
  const offerCallbacks = {
    onSuccess: (data: any) => {
      playOfferSfx();
      const gain = data?.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Scholarship Offered", description: changeLabel.label, type: "success", icon: "offer" });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Offer Failed", description: parseErrorMessage(error), type: "error" });
    },
  };

  const [showClassRankings, setShowClassRankings] = useState(true);
  const storylineRecruitIds = new Set((storylinesData?.storylines ?? []).map(s => s.recruitId));

  const recapDismissKey = leagueData ? `recap-dismissed-${id}-${recapSeason}-${recapWeek}` : null;
  const [recapDismissed, setRecapDismissed] = useState(false);
  useEffect(() => {
    if (!recapDismissKey) return;
    setRecapDismissed(localStorage.getItem(recapDismissKey) === "1");
  }, [recapDismissKey]);

  const scrollToRecruitRef = useRef<(id: string) => void>(() => {});
  const scrollToRecruit = (recruitId: string) => scrollToRecruitRef.current(recruitId);

  // Auto-pilot alert modal
  const [showAutoPilotAlert, setShowAutoPilotAlert] = useState(false);
  const autoPilotAlertShownRef = useRef(false);
  useEffect(() => {
    if (!autoPilotAlertShownRef.current && data?.autoPilotPendingAlert && data.autoPilotPendingAlert.length > 0) {
      setShowAutoPilotAlert(true);
      autoPilotAlertShownRef.current = true;
    }
  }, [data?.autoPilotPendingAlert]);

  const [showRecap, setShowRecap] = useState(false);
  const dismissRecap = () => {
    if (!recapDismissKey) return;
    localStorage.setItem(recapDismissKey, "1");
    setRecapDismissed(true);
  };

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

  const weekDataFresh =
    data?.weeklyActionsWeek === currentWeek &&
    data?.weeklyActionsSeason === currentSeason;
  const visibleDecommits = (decommitAlerts ?? []).filter(e =>
    !dismissedDecommits.has(e.id) && e.week >= currentWeek - 1
  );

  // Auto-pilot / CPU fill-in action log — shown when user returns after absence
  const [showAutoPilotLog, setShowAutoPilotLog] = useState(false);
  const unreadAutoPilotLog = (autoPilotLogData?.log ?? []).filter(e => !e.read);
  const [showCpuHistory, setShowCpuHistory] = useState(false);

  useEffect(() => {
    if (unreadAutoPilotLog.length > 0) {
      setShowAutoPilotLog(true);
    }
  }, [unreadAutoPilotLog.length]);

  const filteredRecruits = sortRecruits(
    filterRecruits(data?.recruits || [], {
      searchQuery,
      positionFilter,
      starFilter,
      stateFilter,
      typeFilter,
      showWatchlistOnly,
      showContested,
      showStory,
      storylineRecruitIds,
      showTopAvailable,
      positionNeeds: pipelineData?.positionNeeds,
      sortBy,
      pipelineFilter,
      teamState: pipelineData?.teamState,
    }),
    sortBy,
    trendsData,
    data?.team?.id
  );

  const recruitListRef = useRef<HTMLDivElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: filteredRecruits.length,
    estimateSize: () => 108,
    overscan: 8,
    scrollMargin: recruitListRef.current?.offsetTop ?? 0,
  });

  scrollToRecruitRef.current = (recruitId: string) => {
    const idx = filteredRecruits.findIndex((r) => r.id === recruitId);
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: "center" });
      setTimeout(() => {
        const el = document.getElementById(`recruit-card-${recruitId}`);
        if (el) {
          el.classList.add("ring-2", "ring-gold");
          setTimeout(() => el.classList.remove("ring-2", "ring-gold"), 1500);
        }
      }, 300);
    }
  };

  if (isLoading) {
    return <RecruitingSkeleton />;
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <QueryError error={error} onRetry={refetch} />
      </div>
    );
  }

  const actionLabel: Record<string, string> = {
    email: "Email", phone: "Phone Call", visit: "Campus Visit",
    head_coach_visit: "HC Visit", offer: "Offer",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Auto-Pilot / Deadline-Forced CPU Activity Alert ── */}
      {showAutoPilotAlert && data?.autoPilotPendingAlert && data.autoPilotPendingAlert.length > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => clearAutoPilotAlertMutation.mutate()} />
          <div className="relative w-full max-w-lg mx-4 bg-[#0d1f0d] border-2 border-gold rounded-none shadow-2xl p-0 font-mono">
            <div className="bg-gold/10 border-b border-gold/40 px-6 py-3 flex items-center gap-3">
              <span className="text-gold text-xs font-bold tracking-widest uppercase" style={{ fontFamily: "'Press Start 2P', monospace" }}>
                CPU Auto-Pilot Report
              </span>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-amber-200 mb-4 leading-relaxed">
                {data.autoPilotPendingAlert.some(e => e.isDeadlineForced)
                  ? "The phase deadline passed while you were away. Your CPU stepped in and completed the following recruiting actions on your behalf:"
                  : "Your team is on auto-pilot. The CPU completed the following recruiting actions this week:"}
              </p>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {data.autoPilotPendingAlert.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-black/30 border border-white/10 rounded px-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gold text-xs shrink-0">
                        {"★".repeat(Math.min(5, entry.recruitStars))}
                      </span>
                      <span className="text-white text-xs truncate">{entry.recruitName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-amber-300">{actionLabel[entry.action] ?? entry.action}</span>
                      <span className="text-xs text-green-400">+{entry.interestGain}%</span>
                      {entry.isDeadlineForced && (
                        <span className="text-[9px] text-orange-400 border border-orange-400/50 px-1 rounded">DEADLINE</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  data-testid="button-dismiss-autopilot-alert"
                  onClick={() => clearAutoPilotAlertMutation.mutate()}
                  disabled={clearAutoPilotAlertMutation.isPending}
                  className="bg-gold text-black text-xs font-bold px-5 py-2 hover:bg-yellow-400 transition-colors disabled:opacity-50"
                  style={{ fontFamily: "'Press Start 2P', monospace" }}
                >
                  {clearAutoPilotAlertMutation.isPending ? "..." : "Got It"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-border sticky top-0 bg-background z-[1000]">
        <div className="h-[2px] w-full" style={{ background: "rgb(var(--atm-accent) / 0.55)" }} aria-hidden="true" />
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

          <div className="grid grid-cols-6 gap-1">
            <StatCard icon={<Target className="w-4 h-4" />} label="Targets" value={`${data?.targetedCount || 0}/20`} />
            <StatCard icon={<Check className="w-4 h-4" />} label="Commits" value={`${data?.commitsCount || 0}/${data?.maxCommits ?? 0}`} />
            <StatCard icon={<Phone className="w-4 h-4" />} label="Calls" value={`${data?.pointsUsed ?? 0}/${data?.maxPoints ?? 0}`} />
            <StatCard icon={<Eye className="w-4 h-4" />} label="Scouts" value={`${data?.scoutPointsUsed ?? 0}/${data?.maxScoutPoints ?? 0}`} />
            <StatCard
              icon={<Building2 className="w-4 h-4" />}
              label="Visits"
              value={`${data?.seasonVisitCount?.total ?? 0}/20`}
              highlight={(data?.seasonVisitCount?.total ?? 0) >= 20}
              tooltip={`${data?.seasonVisitCount?.campusVisits ?? 0} campus visit${(data?.seasonVisitCount?.campusVisits ?? 0) !== 1 ? "s" : ""}, ${data?.seasonVisitCount?.hcVisits ?? 0} HC visit${(data?.seasonVisitCount?.hcVisits ?? 0) !== 1 ? "s" : ""} — 20 total cap per season`}
            />
            {data?.team && (
              <StatCard
                icon={<DollarSign className="w-4 h-4" />}
                label="NIL"
                value={(() => {
                  const rem = (data.team.nilBudget || 0) - (data.team.nilSpent || 0);
                  return rem >= 1000000
                    ? `$${(rem / 1000000).toFixed(1)}M`
                    : rem >= 1000
                    ? `$${Math.round(rem / 1000)}K`
                    : `$${rem}`;
                })()}
              />
            )}
          </div>
          {data?.team && (data.team as any).recruitingRankBoost > 0 && (() => {
            const boost = (data.team as any).recruitingRankBoost as number;
            const prev = (data.team as any).prevNationalRank as number | null;
            const curr = (data.team as any).nationalRank as number;
            const improvement = prev != null ? prev - curr : 0;
            const boostPct = Math.round(boost * 100);
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center gap-2 px-3 py-2 mt-2 rounded border border-emerald-500/40 bg-emerald-500/10 cursor-default w-fit"
                    data-testid="badge-rising-program"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-pixel text-[9px] text-emerald-400 uppercase tracking-wider">Rising Program</span>
                    <span className="text-[9px] text-emerald-300/80 font-mono">+{boostPct}% School Bonus</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
                  Your program climbed {improvement} spots in the national rankings last season. Recruits notice momentum — your school bonus is boosted by +{boostPct}% this recruiting cycle. Keep winning to maintain it.
                </TooltipContent>
              </Tooltip>
            );
          })()}
        </div>
      </header>

      <ArtworkBackground
        desktopSrc={artBackgrounds.recruiting.desktop}
        mobileSrc={artBackgrounds.recruiting.mobile}
        focalPoint="center center"
        overlayStrength="heavy"
        className="h-28 sm:h-40"
      />

      {isMobile ? (
        <>
          <div className="pb-20">
            <MobileRecruitingBoard
              filteredRecruits={filteredRecruits}
              allRecruits={data?.recruits ?? []}
              pipelineData={pipelineData}
              trendsData={trendsData}
              weekRecapData={weekRecapData}
              visibleDecommits={visibleDecommits}
              historyData={historyData}
              recommendationsByRecruit={recommendationsByRecruit}
              storylineRecruitIds={storylineRecruitIds}
              currentWeek={currentWeek}
              onSelectRecruit={setSelectedRecruit}
              onOpenFilterSheet={() => setShowFilterSheet(true)}
              onDismissDecommit={dismissDecommit}
              onPhone={(recruitId, pitchTopic) => phoneMutation.mutate({ recruitId, pitchTopic }, phoneCallbacks)}
              onEmail={(recruitId, pitchTopic) => emailMutation.mutate({ recruitId, pitchTopic }, emailCallbacks)}
              isPhoning={phoneMutation.isPending}
              isEmailing={emailMutation.isPending}
              weeklyActionsUsed={data?.weeklyActionsUsed ?? {}}
              remainingPoints={data?.remainingPoints ?? 1}
              leagueId={id!}
              battlesData={battlesData}
            />
          </div>
          <MobileFilterSheet
            isOpen={showFilterSheet}
            onOpenChange={setShowFilterSheet}
            positionFilter={positionFilter}
            setPositionFilter={setPositionFilter}
            starFilter={starFilter}
            setStarFilter={setStarFilter}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            stateFilter={stateFilter}
            setStateFilter={setStateFilter}
            showWatchlistOnly={showWatchlistOnly}
            setShowWatchlistOnly={setShowWatchlistOnly}
            showTopAvailable={showTopAvailable}
            setShowTopAvailable={setShowTopAvailable}
            showTeamNeeds={showTeamNeeds}
            setShowTeamNeeds={setShowTeamNeeds}
            showPipeline={showPipeline}
            setShowPipeline={setShowPipeline}
            showContested={showContested}
            setShowContested={setShowContested}
            showStory={showStory}
            setShowStory={setShowStory}
            filteredRecruitsCount={filteredRecruits.length}
            positionOptions={positionOptions}
            starOptions={starOptions}
            stateOptions={[
              { label: "All States", value: "all" },
              ...(data?.recruits ? Array.from(new Set(data.recruits.map(r => r.homeState).filter(Boolean))).sort().map(s => ({ label: s!, value: s! })) : [])
            ]}
            onReset={() => {
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
          />
        </>
      ) : (
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        {recommendationsData && (
          <RetroCard className="mb-6">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 py-1"
              onClick={toggleWeeklyPlan}
              data-testid="button-toggle-weekly-plan"
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-gold" />
                <span className="font-pixel text-[10px] text-gold">WEEKLY RECRUITING PLAN</span>
                {recommendationsData.weeklyPlan.highRisk.length > 0 && (
                  <span className="text-[9px] text-red-400 border border-red-500/40 rounded px-1.5 py-0.5">
                    {recommendationsData.weeklyPlan.highRisk.length} at risk
                  </span>
                )}
              </div>
              {showWeeklyPlan ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showWeeklyPlan && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <WeeklyPlanSection
                  title="Top Actions"
                  icon={<Target className="w-3.5 h-3.5 text-gold" />}
                  items={recommendationsData.weeklyPlan.topActions}
                  emptyLabel="No priority actions this week"
                  onItemClick={scrollToRecruit}
                />
                <WeeklyPlanSection
                  title="High-Risk Recruits"
                  icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                  items={recommendationsData.weeklyPlan.highRisk}
                  emptyLabel="No recruits currently at risk"
                  onItemClick={scrollToRecruit}
                />
                <WeeklyPlanSection
                  title="Soon to Commit"
                  icon={<CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                  items={recommendationsData.weeklyPlan.soonToCommit}
                  emptyLabel="No recruits close to committing"
                  onItemClick={scrollToRecruit}
                />
                <WeeklyPlanSection
                  title="Slipping Away"
                  icon={<TrendingDown className="w-3.5 h-3.5 text-orange-400" />}
                  items={recommendationsData.weeklyPlan.slippingAway}
                  emptyLabel="No recruits slipping away"
                  onItemClick={scrollToRecruit}
                />
                {recommendationsData.weeklyPlan.uncoveredNeeds.length > 0 && (
                  <div className="md:col-span-2 border-t border-border pt-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Uncovered Position Needs</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recommendationsData.weeklyPlan.uncoveredNeeds.map((pos) => (
                        <Badge key={pos} variant="outline" className="text-[9px] border-red-500/50 text-red-400" data-testid={`badge-uncovered-need-${pos}`}>
                          {pos}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </RetroCard>
        )}
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
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-sm text-muted-foreground">
                {filteredRecruits.length} recruits found
              </span>
            </div>

            <MobileFilterSheet
              isOpen={showFilterSheet}
              onOpenChange={setShowFilterSheet}
              positionFilter={positionFilter}
              setPositionFilter={setPositionFilter}
              starFilter={starFilter}
              setStarFilter={setStarFilter}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              stateFilter={stateFilter}
              setStateFilter={setStateFilter}
              showWatchlistOnly={showWatchlistOnly}
              setShowWatchlistOnly={setShowWatchlistOnly}
              showTopAvailable={showTopAvailable}
              setShowTopAvailable={setShowTopAvailable}
              showTeamNeeds={showTeamNeeds}
              setShowTeamNeeds={setShowTeamNeeds}
              showPipeline={showPipeline}
              setShowPipeline={setShowPipeline}
              showContested={showContested}
              setShowContested={setShowContested}
              showStory={showStory}
              setShowStory={setShowStory}
              filteredRecruitsCount={filteredRecruits.length}
              positionOptions={positionOptions}
              starOptions={starOptions}
              stateOptions={[
                { label: "All States", value: "all" },
                ...(data?.recruits ? Array.from(new Set(data.recruits.map(r => r.homeState).filter(Boolean))).sort().map(s => ({ label: s!, value: s! })) : [])
              ]}
              onReset={() => {
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
            />
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

        {/* CPU Autopilot History — persistent log of all past CPU-managed weeks */}
        {(autoPilotLogData?.log ?? []).length > 0 && (
          <div className="mb-6" data-testid="cpu-history-panel">
            <RetroCard variant="default">
              <button
                className="flex items-center gap-2 w-full text-left cursor-pointer"
                onClick={() => setShowCpuHistory(prev => !prev)}
                data-testid="button-toggle-cpu-history"
              >
                <History className="w-4 h-4 text-gold" />
                <span className="font-pixel text-gold text-sm uppercase tracking-wider">CPU History</span>
                <span className="text-[10px] text-muted-foreground ml-1">
                  ({(autoPilotLogData?.log ?? []).length} week{(autoPilotLogData?.log ?? []).length !== 1 ? "s" : ""})
                </span>
                {unreadAutoPilotLog.length > 0 && (
                  <span className="ml-1 text-[9px] font-pixel px-1.5 py-0.5 rounded border border-blue-400/40 text-blue-400">
                    {unreadAutoPilotLog.length} new
                  </span>
                )}
                {showCpuHistory ? <ChevronUp className="w-4 h-4 text-gold ml-auto" /> : <ChevronDown className="w-4 h-4 text-gold ml-auto" />}
              </button>

              {showCpuHistory && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  <p className="text-[10px] text-muted-foreground">
                    Complete record of all weeks the CPU managed your recruiting — auto-pilot sessions and force-advanced weeks, newest first.
                  </p>
                  {[...(autoPilotLogData?.log ?? [])].reverse().map((entry, idx) => {
                    const { summary } = entry;
                    const totalActions = summary.emails + summary.phones + summary.visits + summary.hcVisits + summary.offers;
                    return (
                      <div
                        key={idx}
                        className={`rounded border p-3 space-y-2 ${entry.read ? "border-border bg-muted/10" : "border-[#1a3a1a] bg-[#0a1a0a]"}`}
                        data-testid={`cpu-history-entry-${idx}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-pixel text-[10px] text-gold">
                            Season {entry.season} · Week {entry.week}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {!entry.read && (
                              <span className="text-[9px] font-pixel px-1 py-0.5 rounded border border-blue-400/40 text-blue-400">NEW</span>
                            )}
                            <span className={`text-[9px] font-pixel px-1.5 py-0.5 rounded border ${entry.isForced ? "border-orange-500/40 text-orange-400" : "border-blue-400/40 text-blue-400"}`}>
                              {entry.isForced ? "FILL-IN" : "AUTO-PILOT"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {summary.emails > 0 && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-gold" />{summary.emails} email{summary.emails !== 1 ? "s" : ""}</span>}
                          {summary.phones > 0 && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gold" />{summary.phones} call{summary.phones !== 1 ? "s" : ""}</span>}
                          {summary.visits > 0 && <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-gold" />{summary.visits} visit{summary.visits !== 1 ? "s" : ""}</span>}
                          {summary.hcVisits > 0 && <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-gold" />{summary.hcVisits} HC visit{summary.hcVisits !== 1 ? "s" : ""}</span>}
                          {summary.offers > 0 && <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3 text-gold" />{summary.offers} offer{summary.offers !== 1 ? "s" : ""}</span>}
                          {totalActions === 0 && <span className="text-muted-foreground italic">No actions recorded</span>}
                        </div>
                        {summary.recruitsTargeted.length > 0 && (
                          <div className="space-y-1 border-t border-border pt-2">
                            <p className="text-[10px] font-pixel text-muted-foreground mb-1">Recruits contacted ({totalActions} action{totalActions !== 1 ? "s" : ""}):</p>
                            <div className="space-y-0.5 max-h-36 overflow-y-auto">
                              {summary.recruitsTargeted.map((r, ri) => (
                                <div key={ri} className="flex items-center justify-between text-xs">
                                  <span className="text-foreground">{r.name} <span className="text-muted-foreground">({r.position})</span></span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-yellow-400 text-[10px]">{"★".repeat(Math.min(r.stars, 5))}</span>
                                    <span className="text-gold text-[10px] capitalize">{r.action}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </RetroCard>
          </div>
        )}

        <div ref={recruitListRef}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const recruit = filteredRecruits[virtualItem.index];
              if (!recruit) return null;
              return (
                <div
                  key={recruit.id}
                  id={`recruit-card-${recruit.id}`}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
                    paddingBottom: "12px",
                  }}
                >
                  <RecruitRow
                    recruit={recruit}
                    leagueId={id!}
                    onTarget={() => targetMutation.mutate(recruit.id, targetCallbacks)}
                    onScout={() => scoutMutation.mutate(recruit.id, scoutCallbacks)}
                    onPhone={(pitchTopic?: string) => phoneMutation.mutate({ recruitId: recruit.id, pitchTopic }, phoneCallbacks)}
                    onEmail={(pitchTopic?: string) => emailMutation.mutate({ recruitId: recruit.id, pitchTopic }, emailCallbacks)}
                    onVisit={() => visitMutation.mutate(recruit.id, visitCallbacks)}
                    onHeadCoachVisit={() => headCoachVisitMutation.mutate(recruit.id, headCoachVisitCallbacks)}
                    onOffer={() => offerMutation.mutate(recruit.id, offerCallbacks)}
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
                    phonedThisWeek={weekDataFresh && (data?.weeklyActionsUsed?.[recruit.id]?.includes("phone") ?? false)}
                    emailedThisWeek={weekDataFresh && (data?.weeklyActionsUsed?.[recruit.id]?.includes("email") ?? false)}
                    isSavingNotes={notesMutation.isPending}
                    isSavingBoardRank={boardRankMutation.isPending}
                    isSelected={compareRecruits.some(r => r.id === recruit.id)}
                    trend={trendsData?.trends?.[recruit.id]}
                    userTeamId={data?.team?.id}
                    recommendation={recommendationsByRecruit.get(recruit.id)}
                    positionNeed={pipelineData?.positionNeeds?.find(p => p.position === recruit.position)?.need}
                    isStorylineRecruit={storylineRecruitIds.has(recruit.id)}
                    outOfRecruitingActions={(data?.remainingPoints ?? 1) <= 0}
                    remainingPoints={data?.remainingPoints ?? 0}
                    visitCost={data?.recruitPointCosts?.[recruit.id]?.visit ?? 2}
                    headCoachVisitCost={data?.recruitPointCosts?.[recruit.id]?.headCoachVisit ?? 2}
                    outOfScoutActions={(data?.remainingScoutPoints ?? 1) <= 0}
                    progressionEnabled={leagueData?.progressionEnabled}
                    nilRemaining={data?.team ? (data.team.nilBudget || 0) - (data.team.nilSpent || 0) : undefined}
                    seasonVisitCapReached={(data?.seasonVisitCount?.total ?? 0) >= 20}
                  />
                </div>
              );
            })}
          </div>
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
      )}

      <RecruitDetailModal
        recruit={selectedRecruit}
        onClose={() => setSelectedRecruit(null)}
        leagueId={id!}
        onScout={(recruitId) => scoutMutation.mutate(recruitId, scoutCallbacks)}
        isScouting={scoutMutation.isPending}
        onPhone={(recruitId, pitchTopic) => phoneMutation.mutate({ recruitId, pitchTopic }, phoneCallbacks)}
        isPhoning={phoneMutation.isPending}
        onEmail={(recruitId, pitchTopic) => emailMutation.mutate({ recruitId, pitchTopic }, emailCallbacks)}
        isEmailing={emailMutation.isPending}
        onVisit={(recruitId) => visitMutation.mutate(recruitId, visitCallbacks)}
        isVisiting={visitMutation.isPending}
        onHeadCoachVisit={(recruitId) => headCoachVisitMutation.mutate(recruitId, headCoachVisitCallbacks)}
        isHeadCoachVisiting={headCoachVisitMutation.isPending}
        onOffer={(recruitId) => offerMutation.mutate(recruitId, offerCallbacks)}
        isOffering={offerMutation.isPending}
        outOfRecruitingActions={(data?.remainingPoints ?? 1) <= 0}
        remainingPoints={data?.remainingPoints ?? 0}
        visitCost={selectedRecruit ? (data?.recruitPointCosts?.[selectedRecruit.id]?.visit ?? 2) : 2}
        headCoachVisitCost={selectedRecruit ? (data?.recruitPointCosts?.[selectedRecruit.id]?.headCoachVisit ?? 2) : 2}
        hasVisited={selectedRecruit ? (data?.premiumActionsUsed?.[selectedRecruit.id]?.includes("visit") ?? false) : false}
        hasHeadCoachVisited={selectedRecruit ? (data?.premiumActionsUsed?.[selectedRecruit.id]?.includes("head_coach_visit") ?? false) : false}
        nilRemaining={data?.team ? (data.team.nilBudget || 0) - (data.team.nilSpent || 0) : undefined}
        seasonVisitCapReached={(data?.seasonVisitCount?.total ?? 0) >= 20}
        userTeamId={data?.team?.id}
        trend={selectedRecruit ? (trendsData?.trends?.[selectedRecruit.id] ?? null) : null}
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
                onClick={() => saveClassMutation.mutate({
                  name: saveClassName.trim() || "My Recruiting Class",
                  description: null,
                  recruitCount: data?.recruits?.length || 80,
                  classData: data?.recruits ?? [],
                })}
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
              actionResultModal.icon === "scout" ? (
                <ActionResultFlipIcon
                  back={<Eye className="h-7 w-7 text-[#c8aa6e]" />}
                  key={modalRevealKey}
                />
              ) : (
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1a3a1a] tap-pulse"
                  key={actionResultModal.title}
                  data-haptic={
                    actionResultModal.icon === "offer" ? "success" :
                    actionResultModal.icon === "visit" || actionResultModal.icon === "coach" ? "success" : "light"
                  }
                >
                  {actionResultModal.icon === "phone" && <Phone className="h-7 w-7 text-[#c8aa6e]" />}
                  {actionResultModal.icon === "email" && <Mail className="h-7 w-7 text-[#c8aa6e]" />}
                  {actionResultModal.icon === "visit" && <Building2 className="h-7 w-7 text-[#c8aa6e]" />}
                  {actionResultModal.icon === "coach" && <Crown className="h-7 w-7 text-[#c8aa6e]" />}
                  {actionResultModal.icon === "offer" && <GraduationCap className="h-7 w-7 text-[#c8aa6e]" />}
                  {actionResultModal.icon === "check" && <CheckCircle className="h-7 w-7 text-green-400" />}
                  {!actionResultModal.icon && <CheckCircle className="h-7 w-7 text-green-400" />}
                </div>
              )
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
              data-haptic="light"
              data-testid="action-result-dismiss"
            >
              OK
            </RetroButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-Pilot / CPU Fill-In Return Alert — unread entries only */}
      <Dialog open={showAutoPilotLog} onOpenChange={(open) => { if (!open) dismissAutoPilotLogMutation.mutate(); }}>
        <DialogContent className="max-w-lg border-2 border-[#1a3a1a] bg-[#0d1f0d] max-h-[80vh] overflow-y-auto" data-testid="auto-pilot-log-modal">
          <DialogHeader>
            <DialogTitle className="font-['Press_Start_2P'] text-[#c8aa6e] text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" />
              CPU Activity Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-300">
              While you were away, the CPU managed your recruiting at <span className="text-[#c8aa6e]">All-American</span> level. Here's what happened:
            </p>
            {unreadAutoPilotLog.map((entry, idx) => {
              const { summary } = entry;
              const totalActions = summary.emails + summary.phones + summary.visits + summary.hcVisits + summary.offers;
              return (
                <div key={idx} className="rounded border border-[#1a3a1a] bg-[#0a1a0a] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-pixel text-[10px] text-[#c8aa6e]">
                      Season {entry.season} · Week {entry.week}
                    </span>
                    <span className={`text-[9px] font-pixel px-1.5 py-0.5 rounded border ${entry.isForced ? "border-orange-500/40 text-orange-400" : "border-blue-400/40 text-blue-400"}`}>
                      {entry.isForced ? "FILL-IN" : "AUTO-PILOT"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-300">
                    {summary.emails > 0 && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-[#c8aa6e]" />{summary.emails} email{summary.emails !== 1 ? "s" : ""}</span>}
                    {summary.phones > 0 && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-[#c8aa6e]" />{summary.phones} call{summary.phones !== 1 ? "s" : ""}</span>}
                    {summary.visits > 0 && <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-[#c8aa6e]" />{summary.visits} visit{summary.visits !== 1 ? "s" : ""}</span>}
                    {summary.hcVisits > 0 && <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-[#c8aa6e]" />{summary.hcVisits} HC visit{summary.hcVisits !== 1 ? "s" : ""}</span>}
                    {summary.offers > 0 && <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3 text-[#c8aa6e]" />{summary.offers} offer{summary.offers !== 1 ? "s" : ""}</span>}
                  </div>
                  {summary.recruitsTargeted.length > 0 && (
                    <div className="space-y-1 border-t border-[#1a3a1a] pt-2 mt-1">
                      <p className="text-[10px] font-pixel text-gray-400 mb-1">Recruits Contacted ({totalActions} actions):</p>
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {summary.recruitsTargeted.map((r, ri) => (
                          <div key={ri} className="flex items-center justify-between text-xs">
                            <span className="text-gray-300">{r.name} <span className="text-gray-500">({r.position})</span></span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-yellow-400 text-[10px]">{"★".repeat(Math.min(r.stars, 5))}</span>
                              <span className="text-[#c8aa6e] text-[10px] capitalize">{r.action}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <RetroButton
              onClick={() => dismissAutoPilotLogMutation.mutate()}
              disabled={dismissAutoPilotLogMutation.isPending}
              className="w-full"
              data-testid="auto-pilot-log-dismiss"
            >
              {dismissAutoPilotLogMutation.isPending ? "Marking as read..." : "Got It"}
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

function WeeklyPlanSection({
  title,
  icon,
  items,
  emptyLabel,
  onItemClick,
}: {
  title: string;
  icon: ReactNode;
  items: RecruitRecommendation[];
  emptyLabel: string;
  onItemClick: (recruitId: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/70 italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 5).map((item) => (
            <li key={item.recruitId}>
              <button
                type="button"
                className="w-full text-left flex items-center justify-between gap-2 rounded px-1.5 py-1 hover-elevate active-elevate-2"
                onClick={() => onItemClick(item.recruitId)}
                data-testid={`link-weekly-plan-${item.recruitId}`}
              >
                <span className="text-[10px] truncate">
                  {item.firstName} {item.lastName}{" "}
                  <span className="text-muted-foreground">({item.position})</span>
                </span>
                <Badge
                  variant="outline"
                  className={`text-[8px] shrink-0 ${RECOMMENDED_ACTION_META[item.action].color}`}
                >
                  {RECOMMENDED_ACTION_META[item.action].label}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
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
