import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
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
  CheckCircle
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
import { getAbilityByName } from "@shared/abilities";
import { getPotentialRangeLabel, getPotentialGrade, getProgressionZone, getProgressionColor } from "@shared/potential";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { velocityToMPH } from "@/lib/playerUtils";

interface TopSchool {
  teamId: string;
  teamName: string;
  abbreviation: string;
  primaryColor: string;
  interestLevel: number;
}

interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
  topSchools?: TopSchool[];
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
  const [actionResultModal, setActionResultModal] = useState<{
    title: string;
    description: string;
    type: "success" | "error";
    icon?: "check" | "phone" | "email" | "visit" | "coach" | "offer" | "scout";
  } | null>(null);

  const pitchOptions = [
    { key: "proximity", label: "Proximity" },
    { key: "reputation", label: "Reputation" },
    { key: "playingTime", label: "Playing Time" },
    { key: "academics", label: "Academics" },
    { key: "prestige", label: "Prestige" },
    { key: "facilities", label: "Facilities" },
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

  const { data: recruitingData } = useQuery<any>({
    queryKey: ["/api/leagues", id, "recruiting"],
    enabled: !!id,
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
      setActionResultModal({ title: "Scouting Failed", description: error.message, type: "error" });
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
      setActionResultModal({ title: "Phone Call Failed", description: error.message, type: "error" });
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
      setActionResultModal({ title: "Email Failed", description: error.message, type: "error" });
    },
  });

  const visitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/visit`, {});
    },
    onSuccess: (data: any) => {
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Campus Visit Scheduled", description: changeLabel.label, type: "success", icon: "visit" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "Visit Failed", description: error.message, type: "error" });
    },
  });

  const headCoachVisitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/head-coach-visit`, {});
    },
    onSuccess: (data: any) => {
      const gain = data.interestGain || 0;
      const changeLabel = getInterestChangeLabel(gain);
      setActionResultModal({ title: "Head Coach Visit Complete", description: changeLabel.label, type: "success", icon: "coach" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: (error: Error) => {
      setActionResultModal({ title: "HC Visit Failed", description: error.message, type: "error" });
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
      setActionResultModal({ title: "Offer Failed", description: error.message, type: "error" });
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
  const isFullyRevealed = recruit.isBlueChip || scoutPct >= 100;

  const stageBadges: Record<string, { label: string; color: string }> = {
    open: { label: "Open", color: "bg-gray-500" },
    top8: { label: "Top 8", color: "bg-blue-500" },
    top5: { label: "Top 5", color: "bg-green-500" },
    top3: { label: "Top 3", color: "bg-yellow-500" },
    verbal: { label: "Verbal", color: "bg-orange-500" },
    signed: { label: "Signed", color: "bg-red-500" },
  };

  const stage = stageBadges[recruit.stage] || stageBadges.open;

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
    const gradeMap: Record<string, number | undefined> = {
      proximityPriority: undefined,
      reputationPriority: team.prestige,
      playingTimePriority: undefined,
      academicsPriority: team.academics,
      prestigePriority: team.prestige,
      facilitiesPriority: team.facilities,
    };
    return gradeMap[priorityKey] ?? null;
  };

  const revealedAbilitiesCount = recruit.interest?.revealedAbilitiesCount || 0;
  const abilities = (recruit.abilities as string[] || []);

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
        <div className="container mx-auto px-4 py-6">
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
              <div className="flex items-center gap-3 flex-wrap text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {recruit.hometown}, {recruit.homeState}
                </span>
                <PositionBadge position={recruit.position} size="md" />
                <Badge variant="outline">
                  {recruit.recruitType === "JUCO" ? `JUCO ${recruit.recruitYear || "FR"}` : recruit.recruitType}
                </Badge>
                <Badge className={`${stage.color} text-white`}>{stage.label}</Badge>
                {isFullyRevealed && (recruit as any).isGenerationalGem && (
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
                {isFullyRevealed && (recruit as any).isGenerationalBust && (
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
                {isFullyRevealed && recruit.isGem && !(recruit as any).isGenerationalGem && (
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center justify-center w-6 h-6 bg-green-500/20 rounded-full">
                        <Gem className="w-4 h-4 text-green-400" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Gem - Better than ranking suggests</TooltipContent>
                  </Tooltip>
                )}
                {isFullyRevealed && recruit.isBust && !(recruit as any).isGenerationalBust && (
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center justify-center w-6 h-6 bg-red-500/20 rounded-full">
                        <XCircle className="w-4 h-4 text-red-400" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Bust - Worse than ranking suggests</TooltipContent>
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

      <main className="container mx-auto px-4 py-6">
        {/* Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
        </div>

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
                    const gradeMap: Record<string, number | undefined> = { proximity: undefined, reputation: data.team?.prestige, playingTime: undefined, academics: data.team?.academics, prestige: data.team?.prestige, facilities: data.team?.facilities };
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
                    const gradeMap: Record<string, number | undefined> = { proximity: undefined, reputation: data.team?.prestige, playingTime: undefined, academics: data.team?.academics, prestige: data.team?.prestige, facilities: data.team?.facilities };
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
                />
              </RetroCardContent>
            </RetroCard>

            {/* Abilities Section */}
            <RetroCard>
              <RetroCardHeader>
                Special Abilities ({isFullyRevealed ? abilities.length : `${revealedAbilitiesCount}/${abilities.length || "?"}`})
              </RetroCardHeader>
              <RetroCardContent>
                {abilities.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {abilities.map((abilityName, idx) => {
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
                        <Tooltip key={idx}>
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
                {scoutPct < 50 && <Lock className="w-4 h-4 text-muted-foreground" />}
              </RetroCardHeader>
              <RetroCardContent>
                {scoutPct >= 50 ? (
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
            {/* Top Schools Interest */}
            <RetroCard>
              <RetroCardHeader>
                <div className="flex items-center justify-between w-full">
                  <span>Top Schools Interest</span>
                  <Badge variant="outline" className="text-[10px]">
                    {recruit.stage === "top3" ? "Top 3" : recruit.stage === "top5" ? "Top 5" : recruit.stage === "top8" ? "Top 8" : "Open"}
                  </Badge>
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                {(topSchools || recruit.topSchools)?.length ? (
                  <div className="space-y-2">
                    {(topSchools || recruit.topSchools)?.slice(0, recruit.stage === "top3" ? 3 : recruit.stage === "top5" ? 5 : 8).map((school, i) => (
                      <div key={school.teamId} className="flex items-center gap-2">
                        <TeamBadge
                          abbreviation={school.abbreviation}
                          primaryColor={school.primaryColor}
                          size="sm"
                        />
                        <span className="text-xs flex-1">{school.abbreviation}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gold/70 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(5, school.interestLevel + ((school.teamId.charCodeAt(0) % 11) - 5)))}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold w-16 text-right ${getInterestLabel(school.interestLevel).color}`}>{getInterestLabel(school.interestLevel).label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-4">No top schools yet</p>
                )}
              </RetroCardContent>
            </RetroCard>

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
                        <span className="capitalize flex-1">{action.actionType}</span>
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
    abilities: recruit.abilities || [],
    proximityPriority: recruit.proximityPriority || "Somewhat",
    reputationPriority: recruit.reputationPriority || "Somewhat",
    playingTimePriority: recruit.playingTimePriority || "Somewhat",
    academicsPriority: recruit.academicsPriority || "Somewhat",
    prestigePriority: recruit.prestigePriority || "Somewhat",
    facilitiesPriority: recruit.facilitiesPriority || "Somewhat",
    dealbreaker: recruit.dealbreaker || "",
  });

  const [activeTab, setActiveTab] = useState<"info" | "attrs" | "common" | "priorities" | "abilities">("info");
  const isRecruitPitcher = checkIsPitcher(formData.position);
  const isRecruitCatcher = checkIsCatcher(formData.position);

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
          {(["info", "attrs", "common", "priorities", "abilities"] as const).map((tab) => (
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
                  <label className="text-xs text-muted-foreground">Overall (1-999)</label>
                  <RetroInput type="number" min={1} max={999} value={formData.overall} onChange={(e) => setFormData({ ...formData, overall: parseInt(e.target.value) || 1 })} />
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
                  <input type="checkbox" checked={formData.isGem} onChange={(e) => setFormData({ ...formData, isGem: e.target.checked })} className="accent-green-500" data-testid="checkbox-gem" />
                  Gem
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={formData.isBust} onChange={(e) => setFormData({ ...formData, isBust: e.target.checked })} className="accent-red-500" data-testid="checkbox-bust" />
                  Bust
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
        <div className="container mx-auto px-4 py-6">
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
      <main className="container mx-auto px-4 py-6">
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
  isFullyRevealed 
}: { 
  recruit: RecruitWithInterest; 
  scoutPct: number;
  isFullyRevealed: boolean;
}) {
  const isPitcher = checkIsPitcher(recruit.position);
  const scoutingOrder = (recruit.scoutingOrder as string[]) || [];
  
  // Default field orders for legacy recruits without scoutingOrder
  const defaultFielderOrder = ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance', 'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery'];
  const defaultPitcherOrder = ['velocity', 'control', 'stamina', 'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL', 'wRISP', 'vsLefty', 'poise', 'grit', 'heater', 'agile', 'recovery'];
  
  // Use stored scouting order or fall back to default order
  const effectiveOrder = scoutingOrder.length > 0 
    ? scoutingOrder 
    : (isPitcher ? defaultPitcherOrder : defaultFielderOrder);
  
  // Calculate how many attributes should be revealed based on scouting progress
  const revealCount = Math.ceil((scoutPct / 100) * effectiveOrder.length);
  const revealedFields = new Set(effectiveOrder.slice(0, revealCount));
  
  const shouldRevealField = (fieldName: string) => {
    return isFullyRevealed || revealedFields.has(fieldName);
  };
  
  const renderAttribute = (label: string, fieldName: string, value: number | null | undefined) => {
    const isRevealed = shouldRevealField(fieldName);
    const displayValue = isRevealed ? (value ?? 50) : null;
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
                {isVelocity ? `${velocityToMPH(displayValue!)} MPH` : displayValue}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">???</span>
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
  isFullyRevealed 
}: { 
  recruit: RecruitWithInterest; 
  scoutPct: number;
  isFullyRevealed: boolean;
}) {
  const isPitcher = checkIsPitcher(recruit.position);
  const isCatcher = checkIsCatcher(recruit.position);
  const scoutingOrder = (recruit.scoutingOrder as string[]) || [];
  
  // Default field orders for legacy recruits without scoutingOrder
  const defaultFielderOrder = ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance', 'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'catcherAbility'];
  const defaultPitcherOrder = ['velocity', 'control', 'stamina', 'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL', 'wRISP', 'vsLefty', 'poise', 'grit', 'heater', 'agile', 'recovery'];
  
  // Use stored scouting order or fall back to default order
  const effectiveOrder = scoutingOrder.length > 0 
    ? scoutingOrder 
    : (isPitcher ? defaultPitcherOrder : defaultFielderOrder);
  
  // Calculate how many attributes should be revealed based on scouting progress
  const revealCount = Math.ceil((scoutPct / 100) * effectiveOrder.length);
  const revealedFields = new Set(effectiveOrder.slice(0, revealCount));
  
  const shouldRevealField = (fieldName: string) => {
    return isFullyRevealed || revealedFields.has(fieldName);
  };
  
  const renderAbility = (label: string, fieldName: string, value: number | null | undefined) => {
    const isRevealed = shouldRevealField(fieldName);
    const displayValue = isRevealed ? (value ?? 50) : null;
    
    return (
      <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
        <span className="text-sm text-muted-foreground">{label}</span>
        {isRevealed ? (
          <LetterGrade value={displayValue!} size="sm" isCommonAbility={true} />
        ) : (
          <span className="text-sm text-muted-foreground">???</span>
        )}
      </div>
    );
  };
  
  return (
    <div className="grid grid-cols-2 gap-2">
      {isPitcher ? (
        <>
          {renderAbility("W/RISP", "wRISP", recruit.wRISP)}
          {renderAbility("vs Lefty", "vsLefty", recruit.vsLefty)}
          {renderAbility("Poise", "poise", recruit.poise)}
          {renderAbility("Grit", "grit", recruit.grit)}
          {renderAbility("Heater", "heater", recruit.heater)}
          {renderAbility("Agile", "agile", recruit.agile)}
          {renderAbility("Recovery", "recovery", recruit.recovery)}
        </>
      ) : (
        <>
          {renderAbility("Clutch", "clutch", recruit.clutch)}
          {renderAbility("vs LHP", "vsLHP", recruit.vsLHP)}
          {renderAbility("Grit", "grit", recruit.grit)}
          {renderAbility("Stealing", "stealing", recruit.stealing)}
          {renderAbility("Running", "running", recruit.running)}
          {renderAbility("Throwing", "throwing", recruit.throwing)}
          {renderAbility("Recovery", "recovery", recruit.recovery)}
          {isCatcher && renderAbility("Catcher", "catcherAbility", recruit.catcherAbility)}
        </>
      )}
    </div>
  );
}

function RecruitPitchMixSection({ 
  recruit, 
  scoutPct,
  isFullyRevealed 
}: { 
  recruit: RecruitWithInterest; 
  scoutPct: number;
  isFullyRevealed: boolean;
}) {
  const scoutingOrder = (recruit.scoutingOrder as string[]) || [];
  
  // Default pitcher order for legacy recruits without scoutingOrder
  const defaultPitcherOrder = ['velocity', 'control', 'stamina', 'pitchFB', 'pitch2S', 'pitchSL', 'pitchCB', 'pitchCH', 'pitchCT', 'pitchSNK', 'pitchSPL', 'wRISP', 'vsLefty', 'poise', 'grit', 'heater', 'agile', 'recovery'];
  
  // Use stored scouting order or fall back to default order
  const effectiveOrder = scoutingOrder.length > 0 ? scoutingOrder : defaultPitcherOrder;
  
  // Calculate how many attributes should be revealed based on scouting progress
  const revealCount = Math.ceil((scoutPct / 100) * effectiveOrder.length);
  const revealedFields = new Set(effectiveOrder.slice(0, revealCount));
  
  const shouldRevealField = (fieldName: string) => {
    return isFullyRevealed || revealedFields.has(fieldName);
  };
  
  const pitchTypes = [
    { key: "pitchFB", label: "Fastball (FB)" },
    { key: "pitch2S", label: "2-Seam (2S)" },
    { key: "pitchSL", label: "Slider (SL)" },
    { key: "pitchCB", label: "Curveball (CB)" },
    { key: "pitchCH", label: "Changeup (CH)" },
    { key: "pitchCT", label: "Cutter (CT)" },
    { key: "pitchSNK", label: "Sinker (SNK)" },
    { key: "pitchSPL", label: "Splitter (SPL)" },
  ] as const;
  
  const renderPitch = (key: string, label: string) => {
    const isRevealed = shouldRevealField(key);
    const value = recruit[key as keyof typeof recruit] as number | null | undefined;
    const displayValue = isRevealed ? (value || 0) : null;
    
    if (!isRevealed) {
      return (
        <div key={key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-sm text-muted-foreground">???</span>
        </div>
      );
    }
    
    if (displayValue === 0) {
      return (
        <div key={key} className="flex items-center justify-between p-2 bg-muted/30 rounded opacity-50">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-sm text-muted-foreground">-</span>
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
