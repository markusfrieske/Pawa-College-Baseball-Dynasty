import { useState, useCallback } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { pickCampusVisitEvent, pickHeadCoachVisitEvent, type VisitEvent } from "@/lib/visit-events";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { playSuccess, playError as playSfxError } from "@/lib/sfx";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { StarRating } from "@/components/ui/star-rating";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge } from "@/components/ui/badge";
import { PositionBadge } from "@/components/ui/position-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { LetterGrade } from "@/components/ui/letter-grade";
import { TeamBadge } from "@/components/ui/team-badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  MapPin,
  GraduationCap,
  Star,
  Eye,
  Phone,
  Mail,
  Gift,
  Gem,
  XCircle,
  Save,
  StickyNote,
  HelpCircle,
  Lock,
  Edit,
  Pencil,
  Skull,
  Building2,
  Crown,
  CheckCircle,
  Flame,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Zap,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  Target,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Recruit, RecruitingInterest, Team, League } from "@shared/schema";

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
import { isPitcher as checkIsPitcher, isCatcher as checkIsCatcher } from "@shared/positions";
import { getAbilityByName, S_GOLD_COMMON_KEY, S_GOLD_PITCHER_KEY } from "@shared/abilities";
import { getPotentialRangeLabel, getPotentialGrade, getProgressionZone, getProgressionColor } from "@shared/potential";
import { TRAJECTORY_FULL_LABELS } from "@shared/trajectory";
import { TRAJECTORY_REVEAL_THRESHOLD, ARCHETYPE_REVEAL_THRESHOLD, patchScoutingOrder, DEFAULT_PITCHER_SCOUTING_ORDER } from "@shared/recruitThresholds";
import { PITCH_DEFS } from "@shared/pitchDefs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { velocityToKMH } from "@/lib/playerUtils";

interface TopSchool {
  teamId: string;
  teamName: string;
  abbreviation: string;
  primaryColor: string;
  interestLevel: number;
  previousInterestLevel?: number | null;
}

interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
  topSchools?: TopSchool[];
  competingCount?: number | null;
  competingIntensity?: string | null;
  signedTeamName?: string | null;
  signedTeamAbbreviation?: string | null;
  signedTeamPrimaryColor?: string | null;
  signedTeamSecondaryColor?: string | null;
  signingDayLockedFields?: string[] | null;
}

interface RecruitData {
  recruit: RecruitWithInterest;
  team?: Team;
  topSchools?: TopSchool[];
}

interface ActionLog {
  id: string;
  week: number;
  season: number;
  actionType: string;
  interestChange: number;
  notes: string | null;
  isAutoPilot: boolean;
  createdAt: string;
}

export default function RecruitProfilePage() {
  const { id, recruitId } = useParams<{ id: string; recruitId: string }>();
  const [notes, setNotes] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showProfilePhonePicker, setShowProfilePhonePicker] = useState(false);
  const [showProfileEmailPicker, setShowProfileEmailPicker] = useState(false);
  const [profilePhonePitches, setProfilePhonePitches] = useState<string[]>([]);
  const [profileEmailPitch, setProfileEmailPitch] = useState<string | null>(null);
  const [actionResultModal, setActionResultModalRaw] = useState<{
    title: string;
    description: string;
    type: "success" | "error";
    icon?: "check" | "phone" | "email" | "visit" | "coach" | "offer" | "scout";
    eventCard?: VisitEvent;
  } | null>(null);
  const setActionResultModal = useCallback((modal: typeof actionResultModal) => {
    if (modal) {
      if (modal.type === "success") playSuccess();
      else playSfxError();
    }
    setActionResultModalRaw(modal);
  }, []);

  const pitchOptions = [
    { key: "proximity", label: "Proximity" },
    { key: "reputation", label: "Reputation" },
    { key: "playingTime", label: "Playing Time" },
    { key: "academics", label: "Academics" },
    { key: "prestige", label: "Prestige" },
    { key: "facilities", label: "Facilities" },
    { key: "collegeLife", label: "College Life" },
  ];

  const toggleProfilePhonePitch = (key: string) => {
    setProfilePhonePitches(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<RecruitData>({
    queryKey: ["/api/leagues", id, "recruits", recruitId],
  });

  const { data: actionsData } = useQuery<{ actions: ActionLog[] }>({
    queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"],
    enabled: !!recruitId && !!id,
  });

  const { data: authData } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: leagueData } = useQuery<{ league: League }>({
    queryKey: ["/api/leagues", id],
  });

  const { data: recruitingData, isLoading: isRecruitingLoading } = useQuery<any>({
    queryKey: ["/api/leagues", id, "recruiting"],
    enabled: !!id,
  });

  const { data: coachData } = useQuery<{
    firstName: string;
    lastName: string;
    archetype: string;
    level: number;
  }>({
    queryKey: ["/api/leagues", id, "coach"],
    enabled: !!id,
  });

  interface StorylineArcEvent {
    id: string;
    week: number;
    season: number;
    eventText: string;
    archetypeAtEvent: string | null;
    archetypeNameAtEvent: string | null;
    resolvedChoice: string | null;
    resolvedChoiceLabel: string | null;
    resolvedOutcomeText: string | null;
    ovrDelta: number | null;
    resolvedAt: string | null;
  }
  interface StorylineArcData {
    storylineRecruit: {
      id: string;
      archetype: string;
      archetypeName: string;
      archetypeDescription: string;
      tier: string;
      currentArcStage: number;
      isLegendary: boolean;
      resolvedOvrDelta: number;
      imageUrl: string | null;
    } | null;
    events: StorylineArcEvent[];
  }

  const { data: storylineArcData } = useQuery<StorylineArcData>({
    queryKey: ["/api/leagues", id, "recruits", recruitId, "storyline"],
    enabled: !!id && !!recruitId,
  });

  const currentWeek = leagueData?.league?.currentWeek ?? 1;
  const currentSeason = leagueData?.league?.currentSeason ?? 1;
  const phoneUsedThisWeek = actionsData?.actions?.some(
    a => a.actionType === "phone" && a.week === currentWeek && a.season === currentSeason
  ) ?? false;
  const emailUsedThisWeek = actionsData?.actions?.some(
    a => a.actionType === "email" && a.week === currentWeek && a.season === currentSeason
  ) ?? false;

  const isCommissioner = authData?.id && leagueData?.league?.commissionerId === authData.id;

  const visitCost = recruitingData?.recruitPointCosts?.[recruitId!]?.visit ?? 2;
  const headCoachVisitCost = recruitingData?.recruitPointCosts?.[recruitId!]?.headCoachVisit ?? 2;
  const hasVisited = recruitingData?.premiumActionsUsed?.[recruitId!]?.includes("visit") ?? false;
  const hasHeadCoachVisited = recruitingData?.premiumActionsUsed?.[recruitId!]?.includes("head_coach_visit") ?? false;
  const remainingPoints = recruitingData?.remainingPoints ?? 0;

  const updateRecruitMutation = useMutation({
    mutationFn: async (updates: Partial<Recruit>) => {
      return apiRequest("PATCH", `/api/leagues/${id}/recruits/${recruitId}`, updates);
    },
    onSuccess: () => {
      toast({ title: "Recruit Updated", description: "Changes saved successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      setIsEditModalOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update recruit", variant: "destructive" });
    },
  });

  const scoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/scout`);
    },
    onSuccess: () => {
      setActionResultModal({ title: "Scouting Complete", description: "New attributes revealed!", type: "success", icon: "scout" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Scouting Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const phoneMutation = useMutation({
    mutationFn: async (pitchTopics?: string[]) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/phone`, { pitchTopics });
    },
    onSuccess: (data: any) => {
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Phone Call Made", description: changeLabel.label, type: "success", icon: "phone" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Phone Call Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async (pitchTopic?: string) => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/email`, { pitchTopic });
    },
    onSuccess: (data: any) => {
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Email Sent", description: changeLabel.label, type: "success", icon: "email" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Email Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const visitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/visit`, {});
    },
    onSuccess: (responseData: any) => {
      const gain = responseData.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      const currentRecruit = data?.recruit;
      const teamName = recruitingData?.team?.name ?? data?.team?.name ?? "our program";
      const coachLast = coachData?.lastName ?? "Coach";
      const eventCard = currentRecruit
        ? pickCampusVisitEvent(gain, currentRecruit, teamName, coachLast)
        : undefined;
      setActionResultModal({ title: "Campus Visit Scheduled", description: changeLabel.label, type: "success", icon: "visit", eventCard });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Visit Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const headCoachVisitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/head-coach-visit`, {});
    },
    onSuccess: (responseData: any) => {
      const gain = responseData.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      const currentRecruit = data?.recruit;
      const teamName = recruitingData?.team?.name ?? data?.team?.name ?? "our program";
      const coachLast = coachData?.lastName ?? "Coach";
      const archetype = coachData?.archetype ?? "Balanced";
      const eventCard = currentRecruit
        ? pickHeadCoachVisitEvent(gain, currentRecruit, teamName, coachLast, archetype, coachData?.level)
        : undefined;
      setActionResultModal({ title: "Head Coach Visit Complete", description: changeLabel.label, type: "success", icon: "coach", eventCard });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "HC Visit Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const offerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/offer`);
    },
    onSuccess: (data: any) => {
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Scholarship Offered", description: changeLabel.label, type: "success", icon: "offer" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Offer Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const targetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/target`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Target Failed", description: parseErrorMessage(error), type: "error" });
    },
  });

  const notesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/leagues/${id}/recruiting/${recruitId}/notes`, { notes });
    },
    onSuccess: () => {
      toast({ title: "Notes Saved" });
      setIsEditingNotes(false);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save notes", variant: "destructive" });
    },
  });

  if (isLoading) {
    return <RecruitProfileSkeleton />;
  }

  if (!data?.recruit) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard variant="bordered" className="text-center p-8">
          <h2 className="font-pixel text-gold text-sm mb-4">Recruit Not Found</h2>
          <Link href={`/league/${id}/recruiting`}>
            <RetroButton>Back to Recruiting</RetroButton>
          </Link>
        </RetroCard>
      </div>
    );
  }

  const { recruit, topSchools } = data;
  const scoutPct = recruit.interest?.scoutPercentage || 0;
  // Blue chips always show full details; everyone else must wait for the signing-day reveal
  const isFullyRevealed = recruit.isBlueChip || !!recruit.signingDayRevealed;

  const stageBadges: Record<string, { label: string; color: string }> = {
    open: { label: "Open", color: "bg-gray-500" },
    top8: { label: "Top 8", color: "bg-blue-500" },
    top5: { label: "Top 5", color: "bg-green-500" },
    top3: { label: "Top 3", color: "bg-yellow-500" },
    verbal: { label: "Verbal", color: "bg-orange-500" },
    signed: { label: "Signed", color: "bg-red-500" },
  };

  const stage = stageBadges[recruit.stage] || stageBadges.open;
  const verbalSchoolCount = recruit.stage === "verbal" ? (topSchools?.length ?? 0) : 0;
  const stageDisplay = recruit.stage === "verbal"
    ? { label: `Deciding (${verbalSchoolCount} Schools)`, color: "bg-amber-500" }
    : stage;

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

  const priorities = [
    { key: "proximityPriority", label: "Proximity to Home", value: recruit.proximityPriority },
    { key: "reputationPriority", label: "Coach Reputation", value: recruit.reputationPriority },
    { key: "playingTimePriority", label: "Playing Time", value: recruit.playingTimePriority },
    { key: "academicsPriority", label: "Academics", value: recruit.academicsPriority },
    { key: "prestigePriority", label: "School Prestige", value: recruit.prestigePriority },
    { key: "facilitiesPriority", label: "Facilities", value: recruit.facilitiesPriority },
    { key: "collegeLifePriority", label: "College Life", value: (recruit as any).collegeLifePriority || "Somewhat" },
  ];

  const priorityLabels: Record<string, string> = {
    "Extremely": "Extremely Important",
    "Very": "Very Important",
    "Somewhat": "Somewhat Important",
    "Not Important": "Not Important"
  };

  const getPriorityColor = (value: string): string => {
    if (value === "Extremely" || value === "Very") return "bg-green-500/20 text-green-400 border-green-500/40";
    if (value === "Somewhat") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
    if (value === "Not Important") return "bg-red-500/20 text-red-400 border-red-500/40";
    return "";
  };

  const getTeamGradeForPriority = (priorityKey: string, team?: Team): number | null => {
    if (!team) return null;
    // Approximate the server's proximity multiplier (1.0 - 1.5) as a 1-10 grade
    // using the recruit's home state vs team state. Same state = 10, same region = 7, else 4.
    const proximityGrade = (() => {
      if (!recruit?.homeState || !team.state) return null;
      if (recruit.homeState === team.state) return 10;
      const regions: Record<string, string[]> = {
        southeast: ["FL", "GA", "AL", "SC", "NC", "TN", "MS", "LA"],
        southwest: ["TX", "AZ", "NM", "OK"],
        midwest: ["OH", "IN", "IL", "MI", "WI", "MN", "IA", "MO", "NE", "KS"],
        northeast: ["NY", "PA", "NJ", "MA", "CT", "MD", "VA"],
        west: ["CA", "WA", "OR", "CO", "UT", "NV"],
      };
      let rRegion = "", tRegion = "";
      for (const [region, states] of Object.entries(regions)) {
        if (states.includes(recruit.homeState)) rRegion = region;
        if (states.includes(team.state)) tRegion = region;
      }
      return rRegion && rRegion === tRegion ? 7 : 4;
    })();
    const gradeMap: Record<string, number | null | undefined> = {
      proximityPriority: proximityGrade,
      reputationPriority: team.prestige,
      playingTimePriority: undefined,
      academicsPriority: team.academics,
      prestigePriority: team.prestige,
      facilitiesPriority: team.facilities,
      collegeLifePriority: team.collegeLife,
    };
    const v = gradeMap[priorityKey];
    return v ?? null;
  };

  const revealedAbilitiesCount = recruit.interest?.revealedAbilitiesCount || 0;
  const abilities = (recruit.abilities as string[] || []);
  const sdLockedFields = (recruit.signingDayLockedFields as string[]) || [];
  const signingDayLockedAbilityCount = (!isFullyRevealed && sdLockedFields.length > 0)
    ? Math.floor(abilities.length / 2) : 0;
  const effectiveRevealedAbilitiesCount = Math.min(revealedAbilitiesCount, abilities.length - signingDayLockedAbilityCount);

  // Gold ability names surfaced inline in Common Abilities — suppressed from Special Abilities list.
  // A gold is only suppressed when its linked common-ability row is actually revealed (fog-of-war safe).
  const _recruitAbilitySet = new Set(abilities);
  const _isPitcherForGolds = checkIsPitcher(recruit.position);
  // Replicate the reveal logic from RecruitCommonAbilitiesSection to check row visibility.
  const _scoutingOrder = (recruit.scoutingOrder as string[]) || [];
  const _defaultFielderCommonOrder = ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance', 'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility'];
  const _effectiveCommonOrder = _scoutingOrder.length > 0
    ? (_isPitcherForGolds ? patchScoutingOrder(_scoutingOrder) : _scoutingOrder)
    : (_isPitcherForGolds ? DEFAULT_PITCHER_SCOUTING_ORDER : _defaultFielderCommonOrder);
  const _commonRevealCount = Math.ceil((scoutPct / 100) * _effectiveCommonOrder.length);
  const _revealedCommonFields = new Set(_effectiveCommonOrder.slice(0, _commonRevealCount));
  const _isCommonFieldShown = (fieldName: string) => {
    if (!isFullyRevealed && sdLockedFields.includes(fieldName)) return false;
    return isFullyRevealed || _revealedCommonFields.has(fieldName);
  };
  const commonLinkedGoldShown = new Set<string>();
  if (_isPitcherForGolds) {
    for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
      if (!_isCommonFieldShown(linkedKey)) continue;
      const attrVal = (recruit as any)[linkedKey] as number | null | undefined;
      if (_recruitAbilitySet.has(goldName) || (attrVal ?? 0) >= 90) {
        commonLinkedGoldShown.add(goldName);
      }
    }
  } else {
    const _keyToGoldList: Record<string, string[]> = {};
    for (const [gold, key] of Object.entries(S_GOLD_COMMON_KEY)) {
      if (!_keyToGoldList[key]) _keyToGoldList[key] = [];
      _keyToGoldList[key].push(gold);
    }
    for (const [key, goldList] of Object.entries(_keyToGoldList)) {
      if (!_isCommonFieldShown(key)) continue;
      const fromAbilities = goldList.find(g => _recruitAbilitySet.has(g));
      if (fromAbilities) {
        commonLinkedGoldShown.add(fromAbilities);
      } else {
        const attrVal = (recruit as any)[key] as number | null | undefined;
        if ((attrVal ?? 0) >= 90) {
          commonLinkedGoldShown.add(goldList[0]);
        }
      }
    }
  }
  // Pre-compute filtered abilities list for Special Abilities section.
  const displayedAbilities = abilities.filter(name => !commonLinkedGoldShown.has(name));

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6 pb-20 md:pb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/league/${id}/recruiting`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-muted-foreground">Back to Recruiting</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <PlayerAvatar
                skinTone={recruit.skinTone}
                hairColor={recruit.hairColor}
                hairStyle={recruit.hairStyle}
                facialHair={recruit.facialHair || "none"}
                eyeStyle={recruit.eyeStyle || undefined}
                eyebrowStyle={recruit.eyebrowStyle || undefined}
                mouthStyle={recruit.mouthStyle || undefined}
                eyeBlack={recruit.eyeBlack ?? undefined}
                playerId={recruit.id}
                headwear="none"
                size="lg"
                isRecruit={true}
              />
              {recruit.isBlueChip && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full border-2 border-background flex items-center justify-center">
                  <span className="text-[10px] text-white font-bold">B</span>
                </div>
              )}
            </div>
            <div>
              <h1 className="font-pixel text-gold text-xl mb-1">
                {recruit.firstName} {recruit.lastName}
              </h1>
              {/* Row 1: location / position / type / stage */}
              <div className="flex items-center gap-3 flex-wrap text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {recruit.hometown}, {recruit.homeState}
                </span>
                <PositionBadge position={recruit.position} size="md" />
                <Badge variant="outline">
                  {recruit.recruitType === "JUCO" ? `JUCO ${recruit.recruitYear || "FR"}` : recruit.recruitType}
                </Badge>
                {recruit.stage === "verbal" ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className={`${stageDisplay.color} text-white animate-pulse cursor-default`}>{stageDisplay.label}</Badge>
                    </TooltipTrigger>
                    <TooltipContent>This recruit will commit on Decision Day — keep recruiting!</TooltipContent>
                  </Tooltip>
                ) : (
                  <Badge className={`${stageDisplay.color} text-white`}>{stageDisplay.label}</Badge>
                )}
              </div>
              {/* Row 2: discovery / archetype badges */}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {recruit.isBlueChip && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-[9px] bg-blue-500 text-white border-blue-400 no-default-hover-elevate no-default-active-elevate">
                        <Star className="w-3 h-3 mr-0.5 fill-current" />
                        BLUE CHIP
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Blue Chip recruit — top-tier prospect with full details revealed</TooltipContent>
                  </Tooltip>
                )}
                {scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (recruit as any).isGenerationalGem && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-[9px] bg-amber-500 text-black border-amber-400 no-default-hover-elevate no-default-active-elevate">
                        <Star className="w-3.5 h-3.5 mr-0.5 fill-current" />
                        GENERATIONAL GEM
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Generational Talent - Once-in-a-generation player hidden in the recruiting class</TooltipContent>
                  </Tooltip>
                )}
                {scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (recruit as any).isGenerationalBust && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-[9px] bg-red-700 text-white border-red-600 no-default-hover-elevate no-default-active-elevate">
                        <Skull className="w-3.5 h-3.5 mr-0.5" />
                        GENERATIONAL BUST
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Generational Bust - An overhyped recruit who will severely disappoint</TooltipContent>
                  </Tooltip>
                )}
                {scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && recruit.isGem && !(recruit as any).isGenerationalGem && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/40 no-default-hover-elevate no-default-active-elevate">
                        <Gem className="w-3.5 h-3.5 mr-0.5" />
                        GEM
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Gem - Better than ranking suggests</TooltipContent>
                  </Tooltip>
                )}
                {scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && recruit.isBust && !(recruit as any).isGenerationalBust && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-[9px] bg-red-500/15 text-red-400 border-red-500/40 no-default-hover-elevate no-default-active-elevate">
                        <XCircle className="w-3.5 h-3.5 mr-0.5" />
                        BUST
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Bust - Worse than ranking suggests</TooltipContent>
                  </Tooltip>
                )}
                {scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (recruit as any).playerArchetype === "late_bloomer" && !(recruit as any).isGenerationalGem && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/40 no-default-hover-elevate no-default-active-elevate">
                        <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                        LATE BLOOMER
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Late Bloomer — Higher ceiling than current rating suggests</TooltipContent>
                  </Tooltip>
                )}
                {scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (recruit as any).playerArchetype === "overdraft" && !(recruit as any).isGenerationalBust && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-[9px] bg-orange-500/15 text-orange-400 border-orange-500/40 no-default-hover-elevate no-default-active-elevate">
                        <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
                        OVERDRAFT
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Overdraft — Lower ceiling than current rating suggests</TooltipContent>
                  </Tooltip>
                )}
                {scoutPct >= ARCHETYPE_REVEAL_THRESHOLD && (recruit as any).playerArchetype === "raw" && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="text-[9px] bg-yellow-500/15 text-yellow-400 border-yellow-500/40 no-default-hover-elevate no-default-active-elevate">
                        <Zap className="w-3.5 h-3.5 mr-0.5" />
                        RAW
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Raw Prospect — Extreme tool variance, high risk/high reward</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            {isCommissioner && (
              <RetroButton
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setIsEditModalOpen(true)}
                data-testid="button-edit-recruit"
              >
                <Pencil className="w-3 h-3 mr-1" />
                Edit
              </RetroButton>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        {/* Action Buttons — hidden once recruit has committed */}
        {recruit.stage !== "signed" && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          <RetroButton 
            variant="outline" 
            className="border-green-500 text-green-400"
            data-testid="button-scout"
            onClick={() => scoutMutation.mutate()}
            disabled={scoutMutation.isPending || scoutPct >= 100}
          >
            <Eye className="w-4 h-4 mr-2" />
            {scoutMutation.isPending ? "Scouting..." : `Scout (${scoutPct}%)`}
          </RetroButton>
          <RetroButton
            variant={recruit.interest?.isTargeted ? "primary" : "outline"}
            data-testid="button-target"
            onClick={() => targetMutation.mutate()}
            disabled={targetMutation.isPending || !recruit.interest}
          >
            <Target className="w-4 h-4 mr-2" />
            {targetMutation.isPending ? "Updating..." : recruit.interest?.isTargeted ? "Untarget" : "Target"}
          </RetroButton>
          <RetroButton 
            data-testid="button-phone"
            variant={showProfilePhonePicker ? "primary" : "outline"}
            onClick={() => { setShowProfilePhonePicker(!showProfilePhonePicker); setShowProfileEmailPicker(false); setProfilePhonePitches([]); }}
            disabled={phoneMutation.isPending || !recruit.interest || phoneUsedThisWeek}
          >
            <Phone className="w-4 h-4 mr-2" />
            {phoneMutation.isPending ? "Calling..." : phoneUsedThisWeek ? "Called This Week" : "Phone (3 pitches)"}
          </RetroButton>
          <RetroButton 
            variant={showProfileEmailPicker ? "primary" : "outline"}
            data-testid="button-email"
            onClick={() => { setShowProfileEmailPicker(!showProfileEmailPicker); setShowProfilePhonePicker(false); setProfileEmailPitch(null); }}
            disabled={emailMutation.isPending || !recruit.interest || emailUsedThisWeek}
          >
            <Mail className="w-4 h-4 mr-2" />
            {emailMutation.isPending ? "Sending..." : emailUsedThisWeek ? "Emailed This Week" : "Email (1 pitch)"}
          </RetroButton>
          <RetroButton 
            variant="outline" 
            className="border-teal-500 text-teal-400"
            data-testid="button-visit"
            onClick={() => visitMutation.mutate()}
            disabled={visitMutation.isPending || !recruit.interest || hasVisited || remainingPoints < visitCost}
          >
            <Building2 className="w-4 h-4 mr-2" />
            {visitMutation.isPending ? "Visiting..." : hasVisited ? "Visited" : `Visit (${visitCost})`}
          </RetroButton>
          <RetroButton 
            variant="outline" 
            className="border-purple-500 text-purple-400"
            data-testid="button-hc-visit"
            onClick={() => headCoachVisitMutation.mutate()}
            disabled={headCoachVisitMutation.isPending || !recruit.interest || hasHeadCoachVisited || remainingPoints < headCoachVisitCost}
          >
            <Crown className="w-4 h-4 mr-2" />
            {headCoachVisitMutation.isPending ? "Visiting..." : hasHeadCoachVisited ? "HC Visited" : `HC Visit (${headCoachVisitCost})`}
          </RetroButton>
          <RetroButton 
            variant="outline" 
            className="border-gold text-gold"
            data-testid="button-offer"
            onClick={() => offerMutation.mutate()}
            disabled={offerMutation.isPending || recruit.interest?.hasOffer || !recruit.interest}
          >
            <Gift className="w-4 h-4 mr-2" />
            {offerMutation.isPending ? "Offering..." : recruit.interest?.hasOffer ? "Offered" : "Offer"}
          </RetroButton>
        </div>}

        {recruit.stage === "signed" && (
          <div className="mb-6 flex items-center gap-3 p-3 border border-green-600/50 bg-green-900/20">
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <div className="flex-1">
              <p className="font-pixel text-green-400 text-[10px] uppercase">Committed</p>
              <p className="text-xs text-muted-foreground">Recruiting actions are no longer available.</p>
            </div>
            {recruit.signedTeamName && (
              <div className="flex items-center gap-1.5 shrink-0">
                <TeamBadge
                  abbreviation={recruit.signedTeamAbbreviation || recruit.signedTeamName.slice(0, 3).toUpperCase()}
                  primaryColor={recruit.signedTeamPrimaryColor || "#888888"}
                  secondaryColor={recruit.signedTeamSecondaryColor || undefined}
                  name={recruit.signedTeamName || ""}
                  size="sm"
                />
                <span className="text-xs font-medium text-foreground">{recruit.signedTeamName}</span>
              </div>
            )}
          </div>
        )}

        {showProfilePhonePicker && (
          <div className="p-3 bg-muted/30 border border-border rounded" data-testid="profile-pitch-picker-phone">
            <p className="text-[10px] font-pixel text-gold mb-2">SELECT UP TO 3 PITCHES FOR PHONE CALL</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {pitchOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => toggleProfilePhonePitch(opt.key)}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    profilePhonePitches.includes(opt.key)
                      ? "bg-gold/20 border-gold text-gold"
                      : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                  }`}
                  data-testid={`profile-pitch-phone-${opt.key}`}
                >
                  {opt.label}{(() => {
                    const gradeMap: Record<string, number | undefined> = { proximity: undefined, reputation: data.team?.prestige, playingTime: undefined, academics: data.team?.academics, prestige: data.team?.prestige, facilities: data.team?.facilities, collegeLife: data.team?.collegeLife };
                    const grade = gradeMap[opt.key];
                    return grade !== undefined ? ` (${grade})` : '';
                  })()}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <RetroButton
                size="sm"
                onClick={() => {
                  phoneMutation.mutate(profilePhonePitches);
                  setShowProfilePhonePicker(false);
                  setProfilePhonePitches([]);
                }}
                disabled={profilePhonePitches.length === 0 || phoneMutation.isPending}
                data-testid="profile-button-send-phone"
              >
                <Phone className="w-3 h-3 mr-1" />
                Call ({profilePhonePitches.length}/3)
              </RetroButton>
              <RetroButton variant="outline" size="sm" onClick={() => { setShowProfilePhonePicker(false); setProfilePhonePitches([]); }}>
                Cancel
              </RetroButton>
            </div>
          </div>
        )}

        {showProfileEmailPicker && (
          <div className="p-3 bg-muted/30 border border-border rounded" data-testid="profile-pitch-picker-email">
            <p className="text-[10px] font-pixel text-gold mb-2">SELECT 1 PITCH FOR EMAIL</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {pitchOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setProfileEmailPitch(profileEmailPitch === opt.key ? null : opt.key)}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    profileEmailPitch === opt.key
                      ? "bg-gold/20 border-gold text-gold"
                      : "bg-muted/20 border-border text-muted-foreground hover:border-gold/50"
                  }`}
                  data-testid={`profile-pitch-email-${opt.key}`}
                >
                  {opt.label}{(() => {
                    const gradeMap: Record<string, number | undefined> = { proximity: undefined, reputation: data.team?.prestige, playingTime: undefined, academics: data.team?.academics, prestige: data.team?.prestige, facilities: data.team?.facilities, collegeLife: data.team?.collegeLife };
                    const grade = gradeMap[opt.key];
                    return grade !== undefined ? ` (${grade})` : '';
                  })()}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <RetroButton
                size="sm"
                onClick={() => {
                  emailMutation.mutate(profileEmailPitch || undefined);
                  setShowProfileEmailPicker(false);
                  setProfileEmailPitch(null);
                }}
                disabled={!profileEmailPitch || emailMutation.isPending}
                data-testid="profile-button-send-email"
              >
                <Mail className="w-3 h-3 mr-1" />
                Send Email
              </RetroButton>
              <RetroButton variant="outline" size="sm" onClick={() => { setShowProfileEmailPicker(false); setProfileEmailPitch(null); }}>
                Cancel
              </RetroButton>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Recruit Info & Attributes */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <RetroCard>
                <RetroCardHeader>Recruit Info</RetroCardHeader>
                <RetroCardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Class Rank</p>
                      <p className="font-bold text-lg">#{recruit.classRank || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Position Rank</p>
                      <p className="font-bold text-lg">#{recruit.positionRank || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Star className="w-3 h-3 text-gold" /> Rating
                      </p>
                      <p className={`font-bold text-lg ${isFullyRevealed ? "text-gold" : "text-muted-foreground"}`}>
                        {getOverallDisplay()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Star Rank</p>
                      <div className="pt-1">
                        {isFullyRevealed ? (
                          <StarRating rating={recruit.starRating} size="md" />
                        ) : (
                          <span className="text-muted-foreground font-bold">{getStarDisplay()}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Throws</p>
                      <p className="font-bold">{recruit.throwHand || "R"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Bats</p>
                      <p className="font-bold">{recruit.batHand || "R"}</p>
                    </div>
                  </div>
                  {leagueData?.league?.progressionEnabled && recruit.potentialFloor != null && recruit.potentialCeiling != null && scoutPct >= 100 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger>
                              <HelpCircle className="w-3 h-3" />
                            </TooltipTrigger>
                            <TooltipContent>Potential determines how a player's attributes will change each season. Higher potential means improvement, lower means decline.</TooltipContent>
                          </Tooltip>
                          Potential
                        </p>
                        <p className="font-bold text-sm">
                          {getPotentialRangeLabel(recruit.potentialFloor, recruit.potentialCeiling)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Scouting Progress</span>
                      <span>{scoutPct}%</span>
                    </div>
                    <Progress value={scoutPct} className="h-2" />
                    {recruit.interest?.interestLevel && (
                      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>Interest Level</span>
                        <span className={`font-bold ${getInterestLabel(recruit.interest.interestLevel).color}`}>{getInterestLabel(recruit.interest.interestLevel).label}</span>
                      </div>
                    )}
                  </div>
                </RetroCardContent>
              </RetroCard>

              <RetroCard>
                <RetroCardHeader>Attributes</RetroCardHeader>
                <RetroCardContent>
                  <RecruitAttributesSection 
                    recruit={recruit} 
                    scoutPct={scoutPct}
                    isFullyRevealed={isFullyRevealed}
                    signingDayLockedFields={(recruit.signingDayLockedFields as string[]) || []}
                  />
                </RetroCardContent>
              </RetroCard>
            </div>

            {/* Pitch Mix Section (Pitchers Only) */}
            {checkIsPitcher(recruit.position) && (
              <RetroCard>
                <RetroCardHeader>Pitch Mix</RetroCardHeader>
                <RetroCardContent>
                  <RecruitPitchMixSection 
                    recruit={recruit}
                    scoutPct={scoutPct}
                    isFullyRevealed={isFullyRevealed}
                    signingDayLockedFields={(recruit.signingDayLockedFields as string[]) || []}
                  />
                </RetroCardContent>
              </RetroCard>
            )}

            {/* Common Abilities Section */}
            <RetroCard>
              <RetroCardHeader>Common Abilities</RetroCardHeader>
              <RetroCardContent>
                <RecruitCommonAbilitiesSection 
                  recruit={recruit}
                  scoutPct={scoutPct}
                  isFullyRevealed={isFullyRevealed}
                  signingDayLockedFields={(recruit.signingDayLockedFields as string[]) || []}
                />
              </RetroCardContent>
            </RetroCard>

            {/* Abilities Section */}
            <RetroCard>
              <RetroCardHeader>
                Special Abilities ({isFullyRevealed ? displayedAbilities.length : `${Math.min(effectiveRevealedAbilitiesCount, displayedAbilities.length)}/${displayedAbilities.length || "?"}`})
              </RetroCardHeader>
              <RetroCardContent>
                {displayedAbilities.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {displayedAbilities.map((abilityName) => {
                      const ability = getAbilityByName(abilityName);
                      const originalIdx = abilities.indexOf(abilityName);
                      const isAbilityRevealed = isFullyRevealed || effectiveRevealedAbilitiesCount > originalIdx;
                      
                      if (!isAbilityRevealed) {
                        return (
                          <Tooltip key={originalIdx}>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs border-yellow-600/50 text-yellow-500/60 cursor-default flex items-center gap-1 px-1.5">
                                <Lock className="w-2.5 h-2.5" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Revealed at Signing Day</TooltipContent>
                          </Tooltip>
                        );
                      }
                      
                      const tierColors = {
                        gold: "bg-yellow-600/20 border-yellow-500 text-yellow-400",
                        blue: "bg-blue-600/20 border-blue-500 text-blue-400",
                        red: "bg-red-600/20 border-red-500 text-red-400",
                      };
                      
                      return (
                        <Tooltip key={originalIdx}>
                          <TooltipTrigger>
                            <Badge 
                              variant="outline"
                              className={`text-xs ${ability ? tierColors[ability.tier] : ""}`}
                            >
                              {abilityName}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{ability?.description || abilityName}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No special abilities</p>
                )}
              </RetroCardContent>
            </RetroCard>

            {/* Priorities Section */}
            <RetroCard>
              <RetroCardHeader className="flex items-center gap-2">
                Recruiting Priorities
                {scoutPct < TRAJECTORY_REVEAL_THRESHOLD && !isFullyRevealed && <Lock className="w-4 h-4 text-muted-foreground" />}
              </RetroCardHeader>
              <RetroCardContent>
                {(scoutPct >= TRAJECTORY_REVEAL_THRESHOLD || isFullyRevealed) ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {priorities.map((p) => (
                      <div key={p.key}>
                        <p className="text-xs text-muted-foreground">
                          {p.label}
                          {getTeamGradeForPriority(p.key, data.team) !== null && (
                            <span className="ml-1 text-gold font-bold">({getTeamGradeForPriority(p.key, data.team)}/10)</span>
                          )}
                        </p>
                        <Badge variant="outline" className={`mt-1 ${getPriorityColor(p.value as string)}`}>
                          {priorityLabels[p.value as string] || p.value}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Scout to 50% to unlock priorities</p>
                    <p className="text-xs text-muted-foreground mt-1">Current: {scoutPct}%</p>
                  </div>
                )}
              </RetroCardContent>
            </RetroCard>

            {/* Competition Section */}
            {(() => {
              const recruitingRecruit = (recruitingData?.recruits as RecruitWithInterest[] | undefined)?.find((r) => r.id === recruitId);
              const competingCount: number | null = isRecruitingLoading ? null : (recruitingRecruit?.competingCount ?? null);
              const competingIntensity: string | null = isRecruitingLoading ? null : (recruitingRecruit?.competingIntensity ?? null);
              const intensityColor =
                competingIntensity === "Heavy" ? "text-red-400" :
                competingIntensity === "Moderate" ? "text-orange-400" : "text-yellow-400";
              const intensityBg =
                competingIntensity === "Heavy" ? "bg-red-500/10 border-red-500/40" :
                competingIntensity === "Moderate" ? "bg-orange-500/10 border-orange-500/40" : "bg-yellow-500/10 border-yellow-500/40";
              return (
                <RetroCard>
                  <RetroCardHeader className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-400" />
                    Competition
                    {scoutPct < 25 && <Lock className="w-4 h-4 text-muted-foreground ml-auto" />}
                  </RetroCardHeader>
                  <RetroCardContent>
                    {scoutPct < 25 ? (
                      <div className="text-center py-4">
                        <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">Scout to 25% to unlock rivalry signals</p>
                        <p className="text-xs text-muted-foreground mt-1">Current: {scoutPct}%</p>
                      </div>
                    ) : isRecruitingLoading ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground text-sm">Loading competition data...</p>
                      </div>
                    ) : competingCount === null || competingCount === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground text-sm">No known competition</p>
                        <p className="text-xs text-muted-foreground mt-1">No other tracked schools are actively recruiting this player</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className={`flex items-center justify-between p-3 rounded border ${intensityBg}`}>
                          <div className="flex items-center gap-2">
                            <Flame className={`w-5 h-5 ${intensityColor}`} />
                            <div>
                              <p className={`font-bold text-sm ${intensityColor}`}>{competingIntensity} Competition</p>
                              <p className="text-xs text-muted-foreground">
                                {competingCount} {competingCount === 1 ? "school" : "schools"} actively recruiting
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className={`text-sm font-bold ${intensityColor} border-current`}>
                            {competingCount}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Rival schools are counted when their accumulated recruiting interest for this player crosses a meaningful threshold. Only human coaches and competitive CPU programs are tracked.
                        </p>
                      </div>
                    )}
                  </RetroCardContent>
                </RetroCard>
              );
            })()}

            {/* Notes Section */}
            <RetroCard>
              <RetroCardHeader className="flex items-center gap-2">
                <StickyNote className="w-4 h-4" />
                Personal Notes
              </RetroCardHeader>
              <RetroCardContent>
                {isEditingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add notes about this recruit..."
                      className="min-h-20"
                      data-testid="input-notes"
                    />
                    <div className="flex gap-2">
                      <RetroButton 
                        size="sm" 
                        onClick={() => notesMutation.mutate()}
                        disabled={notesMutation.isPending}
                        data-testid="button-save-notes"
                      >
                        <Save className="w-3 h-3 mr-1" />
                        Save
                      </RetroButton>
                      <RetroButton 
                        size="sm" 
                        variant="outline"
                        onClick={() => setIsEditingNotes(false)}
                        data-testid="button-cancel-notes"
                      >
                        Cancel
                      </RetroButton>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="cursor-pointer p-2 bg-muted/30 rounded min-h-16 text-sm"
                    onClick={() => {
                      setNotes(recruit.interest?.notes || "");
                      setIsEditingNotes(true);
                    }}
                    data-testid="notes-display"
                  >
                    {recruit.interest?.notes || (
                      <span className="text-muted-foreground italic">Click to add notes...</span>
                    )}
                  </div>
                )}
              </RetroCardContent>
            </RetroCard>
          </div>

          {/* Right Column - Top Schools & Activity Log */}
          <div className="space-y-6">
            {/* Top Schools Interest — hidden when signed */}
            {recruit.stage !== "signed" ? (
            <RetroCard>
              <RetroCardHeader>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span>Top Schools</span>
                    {(() => {
                      const visibleCount = recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8;
                      const schools = (topSchools || recruit.topSchools) ?? [];
                      const visibleSchools = schools.slice(0, visibleCount);
                      const userIdx = visibleSchools.findIndex(s => s.teamId === data?.team?.id);
                      if (userIdx >= 0) {
                        return (
                          <span className="text-[9px] font-pixel text-gold" data-testid="text-user-school-rank-profile">
                            #{userIdx + 1} of {visibleSchools.length}
                          </span>
                        );
                      }
                      return (
                        <span className="text-[9px] text-muted-foreground/60" data-testid="text-user-school-absent-profile">
                          Not Listed
                        </span>
                      );
                    })()}
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {recruit.stage === "top3" ? "Top 3" : recruit.stage === "top5" ? "Top 5" : recruit.stage === "top8" ? "Top 8" : "Open"}
                  </Badge>
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                {(topSchools || recruit.topSchools)?.length ? (
                  <div className="space-y-2">
                    {(topSchools || recruit.topSchools)?.slice(0, recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8).map((school, i) => {
                    const isUserSchool = data?.team?.id && school.teamId === data.team.id;
                    return (
                      <div key={school.teamId} className={`flex items-center gap-2 ${isUserSchool ? "bg-gold/10 border border-gold/40 -mx-1 px-1 rounded" : ""}`}>
                        <TeamBadge
                          abbreviation={school.abbreviation}
                          primaryColor={school.primaryColor}
                          name={school.teamName}
                          size="sm"
                        />
                        <span className="text-xs flex-1">{school.abbreviation}</span>
                        <div className="relative flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          {(() => {
                            const current = Math.min(100, Math.max(5, school.interestLevel + ((school.teamId.charCodeAt(0) % 11) - 5)));
                            const prev = school.previousInterestLevel != null
                              ? Math.min(100, Math.max(5, school.previousInterestLevel + ((school.teamId.charCodeAt(0) % 11) - 5)))
                              : null;
                            const base = prev !== null ? Math.min(prev, current) : current;
                            const gain = prev !== null ? Math.max(0, current - base) : 0;
                            return (
                              <>
                                <div className="absolute inset-y-0 left-0 rounded-full bg-gold/60" style={{ width: `${base}%` }} />
                                {gain > 0 && (
                                  <div className="absolute inset-y-0 rounded-full bg-gold" style={{ left: `${base}%`, width: `${gain}%` }} />
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <span className={`text-xs font-bold w-16 text-right ${getInterestLabel(school.interestLevel).color}`}>{getInterestLabel(school.interestLevel).label}</span>
                      </div>
                    );
                  })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-4">No top schools yet</p>
                )}
              </RetroCardContent>
            </RetroCard>
            ) : (
            <RetroCard>
              <RetroCardHeader>Decision</RetroCardHeader>
              <RetroCardContent>
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle className="w-10 h-10 text-green-400" />
                  <p className="font-pixel text-green-400 text-[10px] uppercase">Committed</p>
                  {recruit.signedTeamName && (
                    <div className="flex items-center gap-2 mt-1">
                      <TeamBadge
                        abbreviation={recruit.signedTeamAbbreviation || recruit.signedTeamName.slice(0, 3).toUpperCase()}
                        primaryColor={recruit.signedTeamPrimaryColor || "#888888"}
                        secondaryColor={recruit.signedTeamSecondaryColor || undefined}
                        name={recruit.signedTeamName || ""}
                        size="md"
                      />
                      <span className="font-pixel text-xs text-foreground">{recruit.signedTeamName}</span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">This recruit has made their decision and signed with a program.</p>
                </div>
              </RetroCardContent>
            </RetroCard>
            )}

            {/* Activity Log */}
            <RetroCard>
              <RetroCardHeader>Activity Log</RetroCardHeader>
              <RetroCardContent>
                {actionsData?.actions?.length ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {actionsData.actions.map((action) => (
                      <div 
                        key={action.id} 
                        className="flex items-center gap-2 text-xs py-2 px-2 bg-muted/30 rounded"
                        data-testid={`action-log-${action.id}`}
                      >
                        <span className={actionColors[action.actionType] || "text-muted-foreground"}>
                          {actionIcons[action.actionType] || <HelpCircle className="w-3 h-3" />}
                        </span>
                        <span className="capitalize">{action.actionType}</span>
                        {action.isAutoPilot ? (
                          <span className="text-blue-400/80 flex-1">by CPU (Auto-Pilot)</span>
                        ) : (
                          <span className="flex-1" />
                        )}
                        {action.interestChange > 0 && (
                          <span className={getInterestChangeLabel(action.interestChange).color}>↑ {getInterestChangeLabel(action.interestChange).label}</span>
                        )}
                        <span className="text-muted-foreground">Wk {action.week}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-4 italic">No activity yet</p>
                )}
              </RetroCardContent>
            </RetroCard>

            {/* Storyline Arc History */}
            {storylineArcData?.storylineRecruit && (
              <RetroCard data-testid="storyline-arc-card">
                <RetroCardHeader>
                  <div className="flex items-center gap-2 w-full">
                    <BookOpen className="w-4 h-4 text-gold" />
                    <span>Storyline Arc</span>
                    {storylineArcData.storylineRecruit.isLegendary && (
                      <Badge className="ml-auto bg-yellow-500/20 text-yellow-300 border-yellow-500/50 text-[9px] font-pixel flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Legendary
                      </Badge>
                    )}
                  </div>
                </RetroCardHeader>
                <RetroCardContent>
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground">Archetype</p>
                    <p className="text-sm font-bold text-gold" data-testid="text-storyline-archetype">
                      {storylineArcData.storylineRecruit.archetypeName}
                    </p>
                    {storylineArcData.storylineRecruit.archetypeDescription && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">
                        {storylineArcData.storylineRecruit.archetypeDescription}
                      </p>
                    )}
                    {storylineArcData.storylineRecruit.resolvedOvrDelta !== 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {storylineArcData.storylineRecruit.resolvedOvrDelta > 0 ? (
                          <TrendingUp className="w-3 h-3 text-green-400" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-400" />
                        )}
                        <span className={`text-xs font-bold ${storylineArcData.storylineRecruit.resolvedOvrDelta > 0 ? "text-green-400" : "text-red-400"}`} data-testid="text-storyline-ovr-total">
                          {storylineArcData.storylineRecruit.resolvedOvrDelta > 0 ? "+" : ""}{storylineArcData.storylineRecruit.resolvedOvrDelta} OVR total
                        </span>
                      </div>
                    )}
                  </div>

                  {storylineArcData.events.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-2">No chapters resolved yet</p>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto">
                      {storylineArcData.events.map((event, idx) => (
                        <div
                          key={event.id}
                          className="p-2 bg-muted/30 rounded border border-border/50"
                          data-testid={`storyline-event-${event.id}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground">
                              Ch. {idx + 1} — Wk {event.week}
                              {event.archetypeNameAtEvent && event.archetypeAtEvent !== storylineArcData.storylineRecruit?.archetype && (
                                <span className="ml-1 text-gold/70">({event.archetypeNameAtEvent})</span>
                              )}
                            </span>
                            {event.ovrDelta !== null && event.ovrDelta !== 0 && (
                              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${event.ovrDelta > 0 ? "text-green-400" : "text-red-400"}`} data-testid={`text-ovr-delta-${event.id}`}>
                                {event.ovrDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {event.ovrDelta > 0 ? "+" : ""}{event.ovrDelta} OVR
                              </span>
                            )}
                            {(event.ovrDelta === null || event.ovrDelta === 0) && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Minus className="w-3 h-3" /> No change
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground/80 mb-1 line-clamp-2" data-testid={`text-event-snippet-${event.id}`}>
                            {event.eventText}
                          </p>
                          {event.resolvedChoiceLabel && (
                            <div className="flex items-start gap-1 mt-1">
                              <Badge variant="outline" className="text-[9px] text-gold border-gold/40 shrink-0">
                                {event.resolvedChoice}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{event.resolvedChoiceLabel}</span>
                            </div>
                          )}
                          {event.resolvedOutcomeText && (
                            <p className="text-[10px] text-muted-foreground/70 mt-1 italic line-clamp-2" data-testid={`text-outcome-${event.id}`}>
                              {event.resolvedOutcomeText}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </RetroCardContent>
              </RetroCard>
            )}

            {/* Dealbreaker Warning */}
            {recruit.dealbreaker && (
              <RetroCard className="border-red-500/50">
                <RetroCardHeader className="text-red-400">
                  <HelpCircle className="w-4 h-4 inline mr-2" />
                  Dealbreaker
                </RetroCardHeader>
                <RetroCardContent>
                  <p className="text-sm">{recruit.dealbreaker}</p>
                </RetroCardContent>
              </RetroCard>
            )}
          </div>
        </div>
      </main>

      {isEditModalOpen && data?.recruit && (
        <RecruitEditModal
          recruit={data.recruit}
          open={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={(updates) => updateRecruitMutation.mutate(updates)}
          isSaving={updateRecruitMutation.isPending}
        />
      )}

      <Dialog open={!!actionResultModal} onOpenChange={() => setActionResultModal(null)}>
        <DialogContent
          className={`border-2 border-[#1a3a1a] bg-[#0d1f0d] ${actionResultModal?.eventCard ? "max-w-md" : "max-w-sm"}`}
          data-testid="action-result-modal"
        >
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

            {actionResultModal?.eventCard && (
              <div className="w-full rounded border border-[#c8aa6e]/30 bg-[#0a1a0a] px-4 py-3" data-testid="visit-event-card">
                <p className="font-['Press_Start_2P'] text-[10px] leading-relaxed text-[#c8aa6e]" data-testid="visit-event-headline">
                  {actionResultModal.eventCard.headline}
                </p>
                <div className="my-2 h-px bg-[#c8aa6e]/20" />
                <p className="text-xs leading-relaxed text-gray-300" data-testid="visit-event-body">
                  {actionResultModal.eventCard.body}
                </p>
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
    </div>
  );
}

const positionsList = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const skinToneOptions = ["light", "medium", "tan", "olive", "dark", "deep"];
const hairColorOptions = ["black", "brown", "blonde", "red", "gray", "white"];
const hairStyleOptions = ["short", "medium", "long", "fade", "buzz", "bald"];
const headwearOptions = ["cap", "helmet", "batting_helmet", "catchers_mask", "none"];
const priorityOptions = ["Extremely", "Very", "Somewhat", "Not Important"];

interface RecruitEditModalProps {
  recruit: Recruit;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Recruit>) => void;
  isSaving: boolean;
}

function RecruitEditModal({ recruit, open, onClose, onSave, isSaving }: RecruitEditModalProps) {
  const [formData, setFormData] = useState({
    firstName: recruit.firstName,
    lastName: recruit.lastName,
    position: recruit.position,
    hometown: recruit.hometown,
    homeState: recruit.homeState,
    batHand: recruit.batHand,
    throwHand: recruit.throwHand,
    recruitType: recruit.recruitType,
    recruitYear: recruit.recruitYear || "FR",
    skinTone: recruit.skinTone || "light",
    hairColor: recruit.hairColor || "brown",
    hairStyle: recruit.hairStyle || "short",
    headwear: recruit.headwear || "cap",
    overall: recruit.overall,
    starRating: recruit.starRating,
    classRank: recruit.classRank,
    positionRank: recruit.positionRank,
    isBlueChip: recruit.isBlueChip || false,
    isGem: recruit.isGem || false,
    isBust: recruit.isBust || false,
    hitForAvg: recruit.hitForAvg || 50,
    power: recruit.power || 50,
    speed: recruit.speed || 50,
    arm: recruit.arm || 50,
    fielding: recruit.fielding || 50,
    errorResistance: recruit.errorResistance || 50,
    clutch: recruit.clutch || 50,
    vsLHP: recruit.vsLHP || 50,
    grit: recruit.grit || 50,
    stealing: recruit.stealing || 50,
    running: recruit.running || 50,
    throwing: recruit.throwing || 50,
    recovery: recruit.recovery || 50,
    catcherAbility: recruit.catcherAbility || 50,
    velocity: recruit.velocity || 50,
    control: recruit.control || 50,
    stamina: recruit.stamina || 50,
    wRISP: recruit.wRISP || 50,
    vsLefty: recruit.vsLefty || 50,
    poise: recruit.poise || 50,
    heater: recruit.heater || 50,
    agile: recruit.agile || 50,
    pitchFB:  recruit.pitchFB  ?? 1,
    pitch2S:  recruit.pitch2S  ?? 0,
    pitchCH:  recruit.pitchCH  ?? 0,
    pitchFK:  recruit.pitchFK  ?? 0,
    pitchSFF: recruit.pitchSFF ?? 0,
    pitchKN:  recruit.pitchKN  ?? 0,
    pitchSL:  recruit.pitchSL  ?? 0,
    pitchCB:  recruit.pitchCB  ?? 0,
    pitchCT:  recruit.pitchCT  ?? 0,
    pitchSNK: recruit.pitchSNK ?? 0,
    pitchSHU: recruit.pitchSHU ?? 0,
    pitchVSL: recruit.pitchVSL ?? 0,
    pitchHSL: recruit.pitchHSL ?? 0,
    pitchSWP: recruit.pitchSWP ?? 0,
    pitchCCH: recruit.pitchCCH ?? 0,
    pitchSCB: recruit.pitchSCB ?? 0,
    pitchPCB: recruit.pitchPCB ?? 0,
    isGenerationalGem: recruit.isGenerationalGem || false,
    isGenerationalBust: recruit.isGenerationalBust || false,
    abilities: recruit.abilities || [],
    proximityPriority: recruit.proximityPriority || "Somewhat",
    reputationPriority: recruit.reputationPriority || "Somewhat",
    playingTimePriority: recruit.playingTimePriority || "Somewhat",
    academicsPriority: recruit.academicsPriority || "Somewhat",
    prestigePriority: recruit.prestigePriority || "Somewhat",
    facilitiesPriority: recruit.facilitiesPriority || "Somewhat",
    dealbreaker: recruit.dealbreaker || "",
  });

  const [activeTab, setActiveTab] = useState<"info" | "attrs" | "common" | "pitches" | "priorities" | "abilities">("info");
  const isRecruitPitcher = checkIsPitcher(formData.position);
  const isRecruitCatcher = checkIsCatcher(formData.position);

  const availableTabs = isRecruitPitcher
    ? (["info", "attrs", "common", "pitches", "priorities", "abilities"] as const)
    : (["info", "attrs", "common", "priorities", "abilities"] as const);

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-gold text-sm flex items-center gap-2">
            <Edit className="w-4 h-4" />
            Edit Recruit
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-1 mb-4 border-b border-border pb-2 flex-wrap">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-1 text-xs rounded ${
                activeTab === tab ? 'bg-gold text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`recruit-tab-${tab}`}
            >
              {tab === "info" ? "Info" : tab === "attrs" ? "Attributes" : tab === "common" ? "Common" : tab === "priorities" ? "Priorities" : "Abilities"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === "info" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">First Name</label>
                  <RetroInput value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Last Name</label>
                  <RetroInput value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Position</label>
                  <select value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-recruit-position">
                    {positionsList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Type</label>
                  <select value={formData.recruitType} onChange={(e) => setFormData({ ...formData, recruitType: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-recruit-type">
                    <option value="HS">HS</option>
                    <option value="JUCO">JUCO</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Year</label>
                  <select value={formData.recruitYear} onChange={(e) => setFormData({ ...formData, recruitYear: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-recruit-year">
                    <option value="FR">FR</option>
                    <option value="SO">SO</option>
                    <option value="JR">JR</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Hometown</label>
                  <RetroInput value={formData.hometown} onChange={(e) => setFormData({ ...formData, hometown: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">State</label>
                  <RetroInput value={formData.homeState} onChange={(e) => setFormData({ ...formData, homeState: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Bats</label>
                  <select value={formData.batHand} onChange={(e) => setFormData({ ...formData, batHand: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-recruit-bathand">
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                    <option value="S">Switch</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Throws</label>
                  <select value={formData.throwHand} onChange={(e) => setFormData({ ...formData, throwHand: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-recruit-throwhand">
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                  </select>
                </div>
              </div>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Appearance</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Skin Tone</label>
                  <select value={formData.skinTone} onChange={(e) => setFormData({ ...formData, skinTone: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize" data-testid="select-recruit-skintone">
                    {skinToneOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hair Color</label>
                  <select value={formData.hairColor} onChange={(e) => setFormData({ ...formData, hairColor: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize" data-testid="select-recruit-haircolor">
                    {hairColorOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hair Style</label>
                  <select value={formData.hairStyle} onChange={(e) => setFormData({ ...formData, hairStyle: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize" data-testid="select-recruit-hairstyle">
                    {hairStyleOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Headwear</label>
                  <select value={formData.headwear} onChange={(e) => setFormData({ ...formData, headwear: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize" data-testid="select-recruit-headwear">
                    {headwearOptions.map(h => <option key={h} value={h}>{h.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Rankings</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Overall (150-650)</label>
                  <RetroInput type="number" min={150} max={650} value={formData.overall} onChange={(e) => setFormData({ ...formData, overall: parseInt(e.target.value) || 150 })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Star Rating (1-5)</label>
                  <RetroInput type="number" min={1} max={5} value={formData.starRating} onChange={(e) => setFormData({ ...formData, starRating: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Class Rank</label>
                  <RetroInput type="number" min={1} value={formData.classRank} onChange={(e) => setFormData({ ...formData, classRank: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Position Rank</label>
                  <RetroInput type="number" min={1} value={formData.positionRank} onChange={(e) => setFormData({ ...formData, positionRank: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={formData.isBlueChip} onChange={(e) => setFormData({ ...formData, isBlueChip: e.target.checked })} className="accent-gold" data-testid="checkbox-bluechip" />
                  Blue Chip
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={formData.isGem} onChange={(e) => setFormData({ ...formData, isGem: e.target.checked, ...(e.target.checked ? {} : { isGenerationalGem: false }) })} className="accent-green-500" data-testid="checkbox-gem" />
                  Gem
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={formData.isBust} onChange={(e) => setFormData({ ...formData, isBust: e.target.checked, ...(e.target.checked ? {} : { isGenerationalBust: false }) })} className="accent-red-500" data-testid="checkbox-bust" />
                  Bust
                </label>
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className={`flex items-center gap-2 text-xs ${!formData.isGem ? 'opacity-40' : ''}`}>
                  <input type="checkbox" checked={formData.isGenerationalGem} onChange={(e) => setFormData({ ...formData, isGenerationalGem: e.target.checked, ...(e.target.checked ? { isGem: true } : {}) })} className="accent-yellow-400" disabled={!formData.isGem} data-testid="checkbox-generational-gem" />
                  <Crown className="w-3 h-3 text-yellow-400" /> Generational Gem
                </label>
                <label className={`flex items-center gap-2 text-xs ${!formData.isBust ? 'opacity-40' : ''}`}>
                  <input type="checkbox" checked={formData.isGenerationalBust} onChange={(e) => setFormData({ ...formData, isGenerationalBust: e.target.checked, ...(e.target.checked ? { isBust: true } : {}) })} className="accent-red-600" disabled={!formData.isBust} data-testid="checkbox-generational-bust" />
                  <Skull className="w-3 h-3 text-red-500" /> Generational Bust
                </label>
              </div>
            </>
          )}

          {activeTab === "attrs" && (
            <>
              {isRecruitPitcher ? (
                <>
                  <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Pitcher Attributes (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Velocity</label>
                      <RetroInput type="number" min={1} max={99} value={formData.velocity} onChange={(e) => setFormData({ ...formData, velocity: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Control</label>
                      <RetroInput type="number" min={1} max={99} value={formData.control} onChange={(e) => setFormData({ ...formData, control: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Stamina</label>
                      <RetroInput type="number" min={1} max={99} value={formData.stamina} onChange={(e) => setFormData({ ...formData, stamina: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Fielder Attributes (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Contact</label>
                      <RetroInput type="number" min={1} max={99} value={formData.hitForAvg} onChange={(e) => setFormData({ ...formData, hitForAvg: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Power</label>
                      <RetroInput type="number" min={1} max={99} value={formData.power} onChange={(e) => setFormData({ ...formData, power: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Speed</label>
                      <RetroInput type="number" min={1} max={99} value={formData.speed} onChange={(e) => setFormData({ ...formData, speed: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Arm</label>
                      <RetroInput type="number" min={1} max={99} value={formData.arm} onChange={(e) => setFormData({ ...formData, arm: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Fielding</label>
                      <RetroInput type="number" min={1} max={99} value={formData.fielding} onChange={(e) => setFormData({ ...formData, fielding: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Error Resist</label>
                      <RetroInput type="number" min={1} max={99} value={formData.errorResistance} onChange={(e) => setFormData({ ...formData, errorResistance: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "common" && (
            <>
              {isRecruitPitcher ? (
                <>
                  <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Pitcher Common Abilities (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">W/RISP</label><RetroInput type="number" min={1} max={99} value={formData.wRISP} onChange={(e) => setFormData({ ...formData, wRISP: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">vs Lefty</label><RetroInput type="number" min={1} max={99} value={formData.vsLefty} onChange={(e) => setFormData({ ...formData, vsLefty: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Poise</label><RetroInput type="number" min={1} max={99} value={formData.poise} onChange={(e) => setFormData({ ...formData, poise: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Grit</label><RetroInput type="number" min={1} max={99} value={formData.grit} onChange={(e) => setFormData({ ...formData, grit: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Heater</label><RetroInput type="number" min={1} max={99} value={formData.heater} onChange={(e) => setFormData({ ...formData, heater: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Agile</label><RetroInput type="number" min={1} max={99} value={formData.agile} onChange={(e) => setFormData({ ...formData, agile: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Recovery</label><RetroInput type="number" min={1} max={99} value={formData.recovery} onChange={(e) => setFormData({ ...formData, recovery: parseInt(e.target.value) || 50 })} /></div>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Fielder Common Abilities (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">Clutch</label><RetroInput type="number" min={1} max={99} value={formData.clutch} onChange={(e) => setFormData({ ...formData, clutch: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">vs LHP</label><RetroInput type="number" min={1} max={99} value={formData.vsLHP} onChange={(e) => setFormData({ ...formData, vsLHP: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Grit</label><RetroInput type="number" min={1} max={99} value={formData.grit} onChange={(e) => setFormData({ ...formData, grit: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Stealing</label><RetroInput type="number" min={1} max={99} value={formData.stealing} onChange={(e) => setFormData({ ...formData, stealing: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Running</label><RetroInput type="number" min={1} max={99} value={formData.running} onChange={(e) => setFormData({ ...formData, running: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Throwing</label><RetroInput type="number" min={1} max={99} value={formData.throwing} onChange={(e) => setFormData({ ...formData, throwing: parseInt(e.target.value) || 50 })} /></div>
                    <div><label className="text-xs text-muted-foreground">Recovery</label><RetroInput type="number" min={1} max={99} value={formData.recovery} onChange={(e) => setFormData({ ...formData, recovery: parseInt(e.target.value) || 50 })} /></div>
                    {isRecruitCatcher && <div><label className="text-xs text-muted-foreground">Catcher</label><RetroInput type="number" min={1} max={99} value={formData.catcherAbility} onChange={(e) => setFormData({ ...formData, catcherAbility: parseInt(e.target.value) || 50 })} /></div>}
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "pitches" && isRecruitPitcher && (
            <>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Pitch Mix</h4>
              <div className="text-xs text-muted-foreground mb-2">
                Toggles = presence only (0/1). Rated pitches = 0 (none) to 7 (elite).
              </div>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1 mt-1">Presence Toggles</h4>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {PITCH_DEFS.filter(p => p.binary).map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={(formData as unknown as Record<string, number>)[key] > 0}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.checked ? 1 : 0 })}
                        className="accent-gold"
                        data-testid={`checkbox-pitch-${key.replace("pitch", "").toLowerCase()}`}
                      />
                      {label}
                    </label>
                  </div>
                ))}
              </div>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1 mt-3">Rated Pitches (0–7)</h4>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {PITCH_DEFS.filter(p => !p.binary).map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <RetroInput
                      type="number"
                      min={0}
                      max={7}
                      value={(formData as unknown as Record<string, number>)[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: Math.min(7, Math.max(0, parseInt(e.target.value) || 0)) })}
                      data-testid={`input-pitch-${key.replace("pitch", "").toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "priorities" && (
            <>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Recruit Priorities</h4>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Proximity to Home</label>
                  <select value={formData.proximityPriority} onChange={(e) => setFormData({ ...formData, proximityPriority: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-priority-proximity">
                    {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Coach Reputation</label>
                  <select value={formData.reputationPriority} onChange={(e) => setFormData({ ...formData, reputationPriority: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-priority-reputation">
                    {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Playing Time</label>
                  <select value={formData.playingTimePriority} onChange={(e) => setFormData({ ...formData, playingTimePriority: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-priority-playingtime">
                    {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Academics</label>
                  <select value={formData.academicsPriority} onChange={(e) => setFormData({ ...formData, academicsPriority: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-priority-academics">
                    {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">School Prestige</label>
                  <select value={formData.prestigePriority} onChange={(e) => setFormData({ ...formData, prestigePriority: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-priority-prestige">
                    {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Facilities</label>
                  <select value={formData.facilitiesPriority} onChange={(e) => setFormData({ ...formData, facilitiesPriority: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm" data-testid="select-priority-facilities">
                    {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Dealbreaker</label>
                  <RetroInput value={formData.dealbreaker || ""} onChange={(e) => setFormData({ ...formData, dealbreaker: e.target.value })} placeholder="e.g., Must be close to home" data-testid="input-dealbreaker" />
                </div>
              </div>
            </>
          )}

          {activeTab === "abilities" && (
            <>
              <h4 className="font-pixel text-gold text-[10px] border-b border-border pb-1">Special Abilities</h4>
              <div className="text-xs text-muted-foreground mb-2">
                Enter ability IDs separated by commas (e.g., explosive_fb, quick_hands)
              </div>
              <RetroInput
                value={(formData.abilities as string[] || []).join(", ")}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  abilities: e.target.value.split(",").map(a => a.trim()).filter(a => a) 
                })}
                placeholder="explosive_fb, monster_stuff"
                data-testid="input-abilities"
              />
              <div className="text-xs text-muted-foreground mt-2">
                Current: {(formData.abilities as string[] || []).length} abilities
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <RetroButton variant="outline" onClick={onClose} data-testid="button-cancel-recruit-edit">
              Cancel
            </RetroButton>
            <RetroButton onClick={handleSubmit} disabled={isSaving} data-testid="button-save-recruit">
              {isSaving ? "Saving..." : "Save Changes"}
            </RetroButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecruitProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6 pb-20 md:pb-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="flex items-center gap-6">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </main>
    </div>
  );
}

function RecruitAttributesSection({ 
  recruit, 
  scoutPct,
  isFullyRevealed,
  signingDayLockedFields = [],
}: { 
  recruit: RecruitWithInterest; 
  scoutPct: number;
  isFullyRevealed: boolean;
  signingDayLockedFields?: string[];
}) {
  const isPitcher = checkIsPitcher(recruit.position);
  const scoutingOrder = (recruit.scoutingOrder as string[]) || [];
  
  // Default field orders for legacy recruits without scoutingOrder
  const defaultFielderOrder = ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance', 'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery'];

  // Use stored scouting order or fall back to default order.
  // Patch any missing pitch keys so old recruits still surface new fields.
  const effectiveOrder = scoutingOrder.length > 0 
    ? (isPitcher ? patchScoutingOrder(scoutingOrder) : scoutingOrder)
    : (isPitcher ? DEFAULT_PITCHER_SCOUTING_ORDER : defaultFielderOrder);
  
  // Calculate how many attributes should be revealed based on scouting progress
  const revealCount = Math.ceil((scoutPct / 100) * effectiveOrder.length);
  const revealedFields = new Set(effectiveOrder.slice(0, revealCount));
  const lockedSet = new Set(signingDayLockedFields);
  
  const shouldRevealField = (fieldName: string) => {
    return isFullyRevealed || revealedFields.has(fieldName);
  };
  
  const renderAttribute = (label: string, fieldName: string, value: number | null | undefined) => {
    const isLocked = !isFullyRevealed && lockedSet.has(fieldName);
    // Treat null as unrevealed — server already nulls signing-day-locked fields
    const isRevealed = !isLocked && shouldRevealField(fieldName) && value !== null && value !== undefined;
    const displayValue = isRevealed ? value : null;
    const isVelocity = label === "Velocity";
    
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground w-24">{label}</span>
        <div className="flex-1 h-2 bg-background/50 rounded-full overflow-hidden">
          {isRevealed && (
            <div 
              className="h-full rounded-full bg-gold/70"
              style={{ width: `${displayValue}%` }}
            />
          )}
        </div>
        <div className="flex items-center gap-1 w-20 justify-end">
          {isRevealed ? (
            <>
              <LetterGrade value={displayValue!} size="sm" />
              <span className="text-sm font-bold w-14 text-right">
                {isVelocity ? `${velocityToKMH(displayValue!)} KMH` : displayValue}
              </span>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="h-4 w-4 text-gold/70" />
              </TooltipTrigger>
              <TooltipContent>Revealed at Signing Day</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-3">
      {isPitcher ? (
        <>
          {renderAttribute("Velocity", "velocity", recruit.velocity)}
          {renderAttribute("Control", "control", recruit.control)}
          {renderAttribute("Stamina", "stamina", recruit.stamina)}
          {renderAttribute("Fielding", "fielding", recruit.fielding)}
        </>
      ) : (
        <>
          {/* Trajectory — revealed at 50% scouting, right above Contact */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-24 flex items-center gap-1">
              Trajectory
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="w-3 h-3" />
                </TooltipTrigger>
                <TooltipContent>How this hitter tends to make contact — groundball, line drive, gap, or flyball. Revealed at 50% scouting (blue chips always shown).</TooltipContent>
              </Tooltip>
            </span>
            {(scoutPct >= TRAJECTORY_REVEAL_THRESHOLD || isFullyRevealed) ? (
              <div className="flex items-center gap-1.5">
                {recruit.trajectory === 1 && <ArrowDownRight className="w-4 h-4 text-emerald-400" />}
                {recruit.trajectory === 2 && <ArrowRight className="w-4 h-4 text-slate-400" />}
                {recruit.trajectory === 3 && <ArrowUpRight className="w-4 h-4 text-amber-400" />}
                {recruit.trajectory === 4 && <ArrowUp className="w-4 h-4 text-red-400" />}
                <span className={`font-bold text-sm ${
                  recruit.trajectory === 1 ? "text-emerald-400" :
                  recruit.trajectory === 3 ? "text-amber-400" :
                  recruit.trajectory === 4 ? "text-red-400" :
                  "text-slate-400"
                }`}>
                  {TRAJECTORY_FULL_LABELS[recruit.trajectory ?? 2] ?? "Line Drive"}
                </span>
              </div>
            ) : (
              <span className="font-bold text-sm text-muted-foreground/50">???</span>
            )}
          </div>
          {renderAttribute("Contact", "hitForAvg", recruit.hitForAvg)}
          {renderAttribute("Power", "power", recruit.power)}
          {renderAttribute("Speed", "speed", recruit.speed)}
          {renderAttribute("Arm", "arm", recruit.arm)}
          {renderAttribute("Fielding", "fielding", recruit.fielding)}
        </>
      )}
    </div>
  );
}

function RecruitCommonAbilitiesSection({ 
  recruit, 
  scoutPct,
  isFullyRevealed,
  signingDayLockedFields = [],
}: { 
  recruit: RecruitWithInterest; 
  scoutPct: number;
  isFullyRevealed: boolean;
  signingDayLockedFields?: string[];
}) {
  const isPitcher = checkIsPitcher(recruit.position);
  const isCatcher = checkIsCatcher(recruit.position);
  const scoutingOrder = (recruit.scoutingOrder as string[]) || [];
  
  // Default field orders for legacy recruits without scoutingOrder
  const defaultFielderOrder = ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance', 'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility'];

  // Use stored scouting order or fall back to default order.
  // Patch any missing pitch keys so old recruits still surface new fields.
  const effectiveOrder = scoutingOrder.length > 0 
    ? (isPitcher ? patchScoutingOrder(scoutingOrder) : scoutingOrder)
    : (isPitcher ? DEFAULT_PITCHER_SCOUTING_ORDER : defaultFielderOrder);
  
  // Calculate how many attributes should be revealed based on scouting progress
  const revealCount = Math.ceil((scoutPct / 100) * effectiveOrder.length);
  const revealedFields = new Set(effectiveOrder.slice(0, revealCount));
  const lockedSet = new Set(signingDayLockedFields);
  
  const shouldRevealField = (fieldName: string) => {
    return isFullyRevealed || revealedFields.has(fieldName);
  };

  // Gold badge helpers — mirror logic from player-profile-card.tsx
  const recruitAbilitySet = new Set(recruit.abilities as string[] || []);

  // Fielder: multi-map common-ability key → all gold ability names
  const COMMON_KEY_TO_GOLD_LIST: Record<string, string[]> = {};
  for (const [gold, key] of Object.entries(S_GOLD_COMMON_KEY)) {
    if (!COMMON_KEY_TO_GOLD_LIST[key]) COMMON_KEY_TO_GOLD_LIST[key] = [];
    COMMON_KEY_TO_GOLD_LIST[key].push(gold);
  }

  // Priority 1: recruit already has a mapped gold ability → show it.
  // Priority 2: attr is S-grade (≥90) → show the first mapped gold as grade indicator.
  const sGoldBadge = (attrVal: number | null | undefined, commonKey: string): string | undefined => {
    const goldList = COMMON_KEY_TO_GOLD_LIST[commonKey];
    if (!goldList) return undefined;
    const fromAbilities = goldList.find(g => recruitAbilitySet.has(g));
    if (fromAbilities) return fromAbilities;
    if ((attrVal ?? 0) >= 90) return goldList[0];
    return undefined;
  };

  // If recruit has the gold ability, override display value to 90 so the chip renders as "S".
  const sGoldDisplayValue = (attrVal: number | null | undefined, commonKey: string): number | null | undefined => {
    const goldList = COMMON_KEY_TO_GOLD_LIST[commonKey];
    if (!goldList) return attrVal;
    if (goldList.some(g => recruitAbilitySet.has(g))) return 90;
    return attrVal;
  };

  // Pitcher variants
  const sPitcherGoldBadge = (attrKey: string, attrVal?: number | null): string | undefined => {
    for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
      if (linkedKey === attrKey && recruitAbilitySet.has(goldName)) return goldName;
    }
    if ((attrVal ?? 0) >= 90) {
      for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
        if (linkedKey === attrKey) return goldName;
      }
    }
    return undefined;
  };

  const sPitcherGoldDisplayValue = (attrVal: number | null | undefined, attrKey: string): number | null | undefined => {
    for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
      if (linkedKey === attrKey && recruitAbilitySet.has(goldName)) return 90;
    }
    return attrVal;
  };
  
  const renderAbility = (label: string, fieldName: string, value: number | null | undefined, goldAbilityName?: string) => {
    const isLocked = !isFullyRevealed && lockedSet.has(fieldName);
    // Treat null as unrevealed — server already nulls signing-day-locked fields
    const isRevealed = !isLocked && shouldRevealField(fieldName) && value !== null && value !== undefined;
    const displayValue = isRevealed ? value : null;
    
    return (
      <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
        <span className="text-sm text-muted-foreground">{label}</span>
        {isRevealed ? (
          <div className="flex items-center gap-1">
            {goldAbilityName && (
              <span
                className="text-[8px] font-pixel px-1 py-0.5 rounded border text-center max-w-[88px] leading-tight"
                style={{ color: "#c4a35a", borderColor: "rgba(196,163,90,0.5)", background: "rgba(196,163,90,0.12)" }}
                title={goldAbilityName}
              >
                {goldAbilityName}
              </span>
            )}
            <LetterGrade value={displayValue!} size="sm" isCommonAbility={true} />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="h-4 w-4 text-gold/70" />
            </TooltipTrigger>
            <TooltipContent>Revealed at Signing Day</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };
  
  return (
    <div className="grid grid-cols-2 gap-2">
      {isPitcher ? (
        <>
          {renderAbility("W/RISP", "wRISP", sPitcherGoldDisplayValue(recruit.wRISP, "wRISP"), sPitcherGoldBadge("wRISP", recruit.wRISP))}
          {renderAbility("vs Lefty", "vsLefty", sPitcherGoldDisplayValue(recruit.vsLefty, "vsLefty"), sPitcherGoldBadge("vsLefty", recruit.vsLefty))}
          {renderAbility("Poise", "poise", sPitcherGoldDisplayValue(recruit.poise, "poise"), sPitcherGoldBadge("poise", recruit.poise))}
          {renderAbility("Grit", "grit", sPitcherGoldDisplayValue(recruit.grit, "grit"), sPitcherGoldBadge("grit", recruit.grit))}
          {renderAbility("Heater", "heater", sPitcherGoldDisplayValue(recruit.heater, "heater"), sPitcherGoldBadge("heater", recruit.heater))}
          {renderAbility("Agile", "agile", sPitcherGoldDisplayValue(recruit.agile, "agile"), sPitcherGoldBadge("agile", recruit.agile))}
          {renderAbility("Recovery", "recovery", sPitcherGoldDisplayValue(recruit.recovery, "recovery"), sPitcherGoldBadge("recovery", recruit.recovery))}
        </>
      ) : (
        <>
          {renderAbility("Clutch", "clutch", sGoldDisplayValue(recruit.clutch, "clutch"), sGoldBadge(recruit.clutch, "clutch"))}
          {renderAbility("vs LHP", "vsLHP", sGoldDisplayValue(recruit.vsLHP, "vsLHP"), sGoldBadge(recruit.vsLHP, "vsLHP"))}
          {renderAbility("Grit", "grit", sGoldDisplayValue(recruit.grit, "grit"), sGoldBadge(recruit.grit, "grit"))}
          {renderAbility("Stealing", "stealing", sGoldDisplayValue(recruit.stealing, "stealing"), sGoldBadge(recruit.stealing, "stealing"))}
          {renderAbility("Running", "running", sGoldDisplayValue(recruit.running, "running"), sGoldBadge(recruit.running, "running"))}
          {renderAbility("Throwing", "throwing", sGoldDisplayValue(recruit.throwing, "throwing"), sGoldBadge(recruit.throwing, "throwing"))}
          {renderAbility("Recovery", "recovery", recruit.recovery)}
          {isCatcher && renderAbility("Catcher", "catcherAbility", sGoldDisplayValue(recruit.catcherAbility, "catcherAbility"), sGoldBadge(recruit.catcherAbility, "catcherAbility"))}
        </>
      )}
    </div>
  );
}

function RecruitPitchMixSection({ 
  recruit, 
  scoutPct,
  isFullyRevealed,
  signingDayLockedFields = [],
}: { 
  recruit: RecruitWithInterest; 
  scoutPct: number;
  isFullyRevealed: boolean;
  signingDayLockedFields?: string[];
}) {
  const scoutingOrder = (recruit.scoutingOrder as string[]) || [];
  
  // Use stored scouting order or fall back to canonical default.
  // Patch any missing pitch keys so old recruits still surface new fields.
  const effectiveOrder = scoutingOrder.length > 0 ? patchScoutingOrder(scoutingOrder) : DEFAULT_PITCHER_SCOUTING_ORDER;
  
  // Calculate how many attributes should be revealed based on scouting progress
  const revealCount = Math.ceil((scoutPct / 100) * effectiveOrder.length);
  const revealedFields = new Set(effectiveOrder.slice(0, revealCount));
  const lockedSet = new Set(signingDayLockedFields);
  
  const shouldRevealField = (fieldName: string) => {
    return isFullyRevealed || revealedFields.has(fieldName);
  };
  
  const BINARY_PITCH_KEYS = new Set(["pitchFB", "pitch2S"]);

  const pitchTypes = [
    { key: "pitchFB", label: "Fastball (FB)" },
    { key: "pitch2S", label: "2-Seam (2S)" },
    { key: "pitchSL", label: "Slider (SL)" },
    { key: "pitchCB", label: "Curveball (CB)" },
    { key: "pitchCH", label: "Changeup (CH)" },
    { key: "pitchCT", label: "Cutter (CT)" },
    { key: "pitchSNK", label: "Sinker (SNK)" },
    { key: "pitchVSL", label: "Vert. Slider (VSL)" },
    { key: "pitchHSL", label: "Hard Slider (HSL)" },
    { key: "pitchSWP", label: "Sweeper (SWP)" },
    { key: "pitchCCH", label: "Circle Change (CCH)" },
    { key: "pitchSCB", label: "Slow Curve (SCB)" },
    { key: "pitchPCB", label: "Power Curve (PCB)" },
    { key: "pitchFK", label: "Forkball (FK)" },
    { key: "pitchSFF", label: "Split-Finger (SFF)" },
    { key: "pitchSHU", label: "Shuuto (SHU)" },
    { key: "pitchKN", label: "Knuckleball (KN)" },
  ] as const;
  
  const renderPitch = (key: string, label: string) => {
    const value = recruit[key as keyof typeof recruit] as number | null | undefined;
    const isLocked = !isFullyRevealed && lockedSet.has(key);
    // Treat null as unrevealed — server already nulls signing-day-locked fields
    const isRevealed = !isLocked && shouldRevealField(key) && value !== null && value !== undefined;
    const displayValue = isRevealed ? value : null;
    
    if (!isRevealed) {
      return (
        <div key={key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="h-4 w-4 text-gold/70" />
            </TooltipTrigger>
            <TooltipContent>Revealed at Signing Day</TooltipContent>
          </Tooltip>
        </div>
      );
    }
    
    if (displayValue === 0) {
      return (
        <div key={key} className="flex items-center justify-between p-2 bg-muted/30 rounded opacity-50">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground/60 italic cursor-default" data-testid={`text-pitch-none-${key}`}>None</span>
            </TooltipTrigger>
            <TooltipContent>Pitcher does not throw this pitch</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    if (BINARY_PITCH_KEYS.has(key)) {
      return (
        <div key={key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-xs font-bold text-gold px-1.5 py-0.5 bg-gold/10 rounded border border-gold/30" data-testid={`pitch-badge-${key}`}>Yes</span>
        </div>
      );
    }
    
    return (
      <div key={key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
        <span className="text-sm text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5, 6, 7].map(n => (
              <div 
                key={n}
                className={`w-2 h-4 rounded-sm ${n <= (displayValue ?? 0) ? 'bg-gold' : 'bg-muted'}`}
              />
            ))}
          </div>
          <span className="text-sm font-bold text-gold w-4 text-right">{displayValue ?? 0}</span>
        </div>
      </div>
    );
  };
  
  return (
    <div className="grid grid-cols-2 gap-2">
      {pitchTypes.map(({ key, label }) => renderPitch(key, label))}
    </div>
  );
}
