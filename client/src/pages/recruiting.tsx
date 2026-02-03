import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroSelect } from "@/components/ui/retro-select";
import { TeamBadge } from "@/components/ui/team-badge";
import { StarRating } from "@/components/ui/star-rating";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Check
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Recruit, RecruitingInterest, Team } from "@shared/schema";
import { getAbilityByName } from "@shared/abilities";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PitchMixWheel } from "@/components/ui/pitch-mix-wheel";

interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
  topSchools?: { teamId: string; teamName: string; abbreviation: string; primaryColor: string; interestLevel: number }[];
}

interface RecruitingData {
  recruits: RecruitWithInterest[];
  team: Team;
  remainingActions: number;
  targetedCount: number;
  commitsCount: number;
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

export default function RecruitingPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedRecruit, setSelectedRecruit] = useState<RecruitWithInterest | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");
  const [starFilter, setStarFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const filteredRecruits = data?.recruits.filter(r => {
    if (positionFilter !== "all" && r.position !== positionFilter) return false;
    if (starFilter !== "all" && r.starRank < parseInt(starFilter)) return false;
    return true;
  }) || [];

  if (isLoading) {
    return <RecruitingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/league/${id}`} className="text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-pixel text-gold text-lg">Recruiting</h1>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-pixel text-[10px] text-muted-foreground">Actions:</span>
              <span className="font-pixel text-gold">{data?.remainingActions || 0}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<Target className="w-4 h-4" />} label="Targets" value={`${data?.targetedCount || 0}/40`} />
            <StatCard icon={<Check className="w-4 h-4" />} label="Commits" value={`${data?.commitsCount || 0}/25`} />
            <StatCard icon={<DollarSign className="w-4 h-4" />} label="NIL Budget" value={`$${((data?.team?.nilBudget || 0) / 1000000).toFixed(1)}M`} />
            <StatCard icon={<Search className="w-4 h-4" />} label="Scouts" value="10/10" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <RetroCard className="mb-6">
          <div className="flex flex-wrap gap-4 items-center">
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
            <span className="text-sm text-muted-foreground ml-auto">
              {filteredRecruits.length} recruits found
            </span>
          </div>
        </RetroCard>

        <div className="space-y-3">
          {filteredRecruits.map((recruit) => (
            <RecruitRow
              key={recruit.id}
              recruit={recruit}
              onViewDetails={() => setSelectedRecruit(recruit)}
              onTarget={() => targetMutation.mutate(recruit.id)}
              onScout={() => scoutMutation.mutate(recruit.id)}
              isTargeting={targetMutation.isPending}
              isScouting={scoutMutation.isPending}
            />
          ))}
        </div>

        {filteredRecruits.length === 0 && (
          <RetroCard variant="bordered" className="text-center py-12">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No recruits match your filters</p>
          </RetroCard>
        )}
      </main>

      <RecruitDetailModal
        recruit={selectedRecruit}
        onClose={() => setSelectedRecruit(null)}
        leagueId={id!}
        onScout={(recruitId) => scoutMutation.mutate(recruitId)}
        isScouting={scoutMutation.isPending}
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

function RecruitRow({
  recruit,
  onViewDetails,
  onTarget,
  onScout,
  isTargeting,
  isScouting,
}: {
  recruit: RecruitWithInterest;
  onViewDetails: () => void;
  onTarget: () => void;
  onScout: () => void;
  isTargeting: boolean;
  isScouting: boolean;
}) {
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
    <RetroCard className="hover:border-gold/30 transition-colors" data-testid={`card-recruit-${recruit.id}`}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center relative">
            <span className="font-pixel text-[10px] text-gold">{recruit.position}</span>
            {recruit.isBlueChip && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-background flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">B</span>
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium">{recruit.firstName} {recruit.lastName}</span>
              {recruit.isBlueChip && (
                <Badge className="bg-blue-500 text-white text-[8px]">Blue Chip</Badge>
              )}
              <Badge className={`${stage.color} text-white text-[8px]`}>{stage.label}</Badge>
              <Badge variant="outline" className="text-[8px]">{recruit.recruitType}</Badge>
              {totalAbilities > 0 && (
                <Badge variant="outline" className="text-[8px] border-gold/50 text-gold">
                  {isFullyRevealed ? `${totalAbilities} Abilities` : `${revealedAbilitiesCount}/${totalAbilities > revealedAbilitiesCount ? "?" : totalAbilities}`}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {recruit.hometown}, {recruit.homeState}
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
            <p className={`font-bold ${isFullyRevealed ? "text-lg" : "text-sm"}`}>
              {getStarDisplay()}
            </p>
            <p className="text-[10px] text-muted-foreground">STAR</p>
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
            <RetroButton
              variant="outline"
              size="sm"
              onClick={onScout}
              disabled={isScouting || scoutPct >= 100}
              data-testid={`button-scout-${recruit.id}`}
            >
              <Search className="w-3 h-3" />
            </RetroButton>
            <RetroButton
              variant={recruit.interest?.isTargeted ? "primary" : "outline"}
              size="sm"
              onClick={onTarget}
              disabled={isTargeting}
              data-testid={`button-target-${recruit.id}`}
            >
              <Target className="w-3 h-3" />
            </RetroButton>
            <RetroButton
              size="sm"
              onClick={onViewDetails}
              data-testid={`button-view-${recruit.id}`}
            >
              <Eye className="w-3 h-3" />
            </RetroButton>
          </div>
        </div>
      </div>

      {recruit.topSchools && recruit.topSchools.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Top Schools:</span>
            {recruit.topSchools.slice(0, 5).map((school, i) => (
              <TeamBadge
                key={school.teamId}
                abbreviation={school.abbreviation}
                primaryColor={school.primaryColor}
                size="sm"
              />
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
}: {
  recruit: RecruitWithInterest | null;
  onClose: () => void;
  leagueId: string;
  onScout: (recruitId: string) => void;
  isScouting: boolean;
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
              position={recruit.position} 
              skinTone={recruit.skinTone || "light"}
              hairColor={recruit.hairColor || "brown"}
              hairStyle={recruit.hairStyle || "short"}
              className="w-16 h-16 flex-shrink-0"
            />
            <div className="flex-1">
              <DialogTitle className="font-pixel text-gold flex items-center gap-3 flex-wrap">
                <span className="text-lg">{recruit.position}</span>
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
              <span>{recruit.recruitType === "HS" ? "High School" : "JUCO Transfer"}</span>
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
              <div>
                <h4 className="font-pixel text-[10px] text-gold mb-3">Pitch Mix</h4>
                <PitchMixWheel pitches={generatePitchMix()} className="w-32 h-32 mx-auto" />
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

          <div>
            <h4 className="font-pixel text-[10px] text-gold mb-3">Priorities</h4>
            {scoutPct >= 50 ? (
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
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {priorityLabels[p.value as string] || p.value}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-muted/30 border border-border rounded text-center">
                <HelpCircle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Scout to 50% to reveal recruit priorities
                </p>
              </div>
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
            <RetroButton className="flex-1" data-testid="button-pitch">
              <Phone className="w-4 h-4 mr-2" />
              Phone Call
            </RetroButton>
            <RetroButton variant="outline" className="flex-1" data-testid="button-email">
              <Mail className="w-4 h-4 mr-2" />
              Email
            </RetroButton>
            <RetroButton 
              variant="outline" 
              className="border-gold text-gold hover:bg-gold/10"
              data-testid="button-offer-scholarship"
            >
              <GraduationCap className="w-4 h-4 mr-2" />
              Offer Scholarship
            </RetroButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
