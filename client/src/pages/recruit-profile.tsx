import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { StarRating } from "@/components/ui/star-rating";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge } from "@/components/ui/badge";
import { PositionBadge } from "@/components/ui/position-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { LetterGrade } from "@/components/ui/letter-grade";
import { TeamBadge } from "@/components/ui/team-badge";
import { Textarea } from "@/components/ui/textarea";
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
  Lock
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Recruit, RecruitingInterest, Team } from "@shared/schema";
import { isPitcher as checkIsPitcher } from "@shared/positions";
import { getAbilityByName } from "@shared/abilities";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<RecruitData>({
    queryKey: ["/api/leagues", id, "recruits", recruitId],
  });

  const { data: actionsData } = useQuery<{ actions: ActionLog[] }>({
    queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"],
    enabled: !!recruitId && !!id,
  });

  const scoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/scout`);
    },
    onSuccess: () => {
      toast({ title: "Scouted!", description: "Scouting progress increased." });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to scout recruit", variant: "destructive" });
    },
  });

  const phoneMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/phone`);
    },
    onSuccess: () => {
      toast({ title: "Phone Call Made", description: "+5% interest boost" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to make phone call", variant: "destructive" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/email`);
    },
    onSuccess: () => {
      toast({ title: "Email Sent", description: "+3% interest boost" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send email", variant: "destructive" });
    },
  });

  const offerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/leagues/${id}/recruiting/${recruitId}/offer`);
    },
    onSuccess: () => {
      toast({ title: "Scholarship Offered!", description: "+15% interest boost" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruits", recruitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting", recruitId, "actions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to offer scholarship", variant: "destructive" });
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
                headwear={recruit.headwear}
                size="lg"
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
                {isFullyRevealed && recruit.isGem && (
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center justify-center w-6 h-6 bg-green-500/20 rounded-full">
                        <Gem className="w-4 h-4 text-green-400" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Gem - Better than ranking suggests</TooltipContent>
                  </Tooltip>
                )}
                {isFullyRevealed && recruit.isBust && (
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
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
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
            onClick={() => phoneMutation.mutate()}
            disabled={phoneMutation.isPending || !recruit.interest}
          >
            <Phone className="w-4 h-4 mr-2" />
            {phoneMutation.isPending ? "Calling..." : "Phone (+5%)"}
          </RetroButton>
          <RetroButton 
            variant="outline" 
            data-testid="button-email"
            onClick={() => emailMutation.mutate()}
            disabled={emailMutation.isPending || !recruit.interest}
          >
            <Mail className="w-4 h-4 mr-2" />
            {emailMutation.isPending ? "Sending..." : "Email (+3%)"}
          </RetroButton>
          <RetroButton 
            variant="outline" 
            className="border-gold text-gold"
            data-testid="button-offer"
            onClick={() => offerMutation.mutate()}
            disabled={offerMutation.isPending || recruit.interest?.hasOffer || !recruit.interest}
          >
            <Gift className="w-4 h-4 mr-2" />
            {offerMutation.isPending ? "Offering..." : recruit.interest?.hasOffer ? "Offered" : "Offer (+15%)"}
          </RetroButton>
        </div>

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

                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Scouting Progress</span>
                      <span>{scoutPct}%</span>
                    </div>
                    <Progress value={scoutPct} className="h-2" />
                    {recruit.interest?.interestLevel && (
                      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>Interest Level</span>
                        <span className="text-gold font-bold">{recruit.interest.interestLevel}%</span>
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
                        <p className="text-xs text-muted-foreground">{p.label}</p>
                        <Badge variant="outline" className="mt-1">
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
                            style={{ width: `${Math.min(100, school.interestLevel)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold w-10 text-right">{school.interestLevel}%</span>
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
                          <span className="text-green-400">+{action.interestChange}%</span>
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
    </div>
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
  
  const shouldRevealAttribute = (threshold: number) => {
    return isFullyRevealed || scoutPct >= threshold;
  };
  
  const renderAttribute = (label: string, value: number | null | undefined, revealThreshold: number) => {
    const isRevealed = shouldRevealAttribute(revealThreshold);
    const displayValue = isRevealed ? (value ?? 50) : null;
    
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
        <div className="flex items-center gap-1 w-16 justify-end">
          {isRevealed ? (
            <>
              <LetterGrade value={displayValue!} size="sm" />
              <span className="text-sm font-bold w-8 text-right">{displayValue}</span>
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
          {renderAttribute("Velocity", recruit.velocity, 15)}
          {renderAttribute("Control", recruit.control, 30)}
          {renderAttribute("Stamina", recruit.stamina, 50)}
          {renderAttribute("Stuff", recruit.stuff, 75)}
          {renderAttribute("Fielding", recruit.fielding, 100)}
        </>
      ) : (
        <>
          {renderAttribute("Contact", recruit.hitForAvg, 15)}
          {renderAttribute("Power", recruit.power, 30)}
          {renderAttribute("Speed", recruit.speed, 50)}
          {renderAttribute("Arm", recruit.arm, 75)}
          {renderAttribute("Fielding", recruit.fielding, 100)}
        </>
      )}
    </div>
  );
}
