import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { StarRating } from "@/components/ui/star-rating";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, 
  MapPin,
  GraduationCap,
  Star,
  Target,
  User
} from "lucide-react";
import type { Recruit, RecruitingInterest } from "@shared/schema";

interface RecruitWithInterest extends Recruit {
  interest?: RecruitingInterest;
}

interface RecruitData {
  recruit: RecruitWithInterest;
}

export default function RecruitProfilePage() {
  const { id, recruitId } = useParams<{ id: string; recruitId: string }>();

  const { data, isLoading } = useQuery<RecruitData>({
    queryKey: ["/api/leagues", id, "recruits", recruitId],
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

  const { recruit } = data;
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
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {recruit.hometown}, {recruit.homeState}
                </span>
                <Badge variant="outline">{recruit.position}</Badge>
                <Badge variant="outline">{recruit.recruitType}</Badge>
                <Badge className={`${stage.color} text-white`}>{stage.label}</Badge>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
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
                  <p className="text-xs text-muted-foreground">Overall</p>
                  <p className="font-bold text-lg text-gold">
                    {isFullyRevealed ? recruit.overall : "???"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Star Rating</p>
                  <div className="pt-1">
                    {isFullyRevealed ? (
                      <StarRating rating={recruit.starRating} size="md" />
                    ) : (
                      <span className="text-muted-foreground">?</span>
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
              </div>
            </RetroCardContent>
          </RetroCard>

          <RetroCard>
            <RetroCardHeader>Abilities</RetroCardHeader>
            <RetroCardContent>
              {recruit.abilities && recruit.abilities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recruit.abilities.map((ability, idx) => (
                    <Badge 
                      key={idx} 
                      variant="outline" 
                      className="border-gold/50 text-gold"
                    >
                      {ability}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No special abilities</p>
              )}
            </RetroCardContent>
          </RetroCard>

          <RetroCard className="md:col-span-2">
            <RetroCardHeader>Recruiting Priorities</RetroCardHeader>
            <RetroCardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Proximity</p>
                  <p className="font-medium">{recruit.proximityPriority}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reputation</p>
                  <p className="font-medium">{recruit.reputationPriority}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Playing Time</p>
                  <p className="font-medium">{recruit.playingTimePriority}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Academics</p>
                  <p className="font-medium">{recruit.academicsPriority}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prestige</p>
                  <p className="font-medium">{recruit.prestigePriority}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Facilities</p>
                  <p className="font-medium">{recruit.facilitiesPriority}</p>
                </div>
              </div>
            </RetroCardContent>
          </RetroCard>
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
