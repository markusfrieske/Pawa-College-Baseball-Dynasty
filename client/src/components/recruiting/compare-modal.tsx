import { 
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { RetroButton } from "@/components/ui/retro-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RecruitWithInterest } from "@/lib/recruitingUtils";
import { getAbilityByName } from "@shared/abilities";
import { 
  TRAJECTORY_REVEAL_THRESHOLD, 
} from "@shared/recruitThresholds";
import { TrajectoryIcon } from "@/components/ui/trajectory-icon";

export 
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
                  {recruit.position !== "P" && (scoutPct >= TRAJECTORY_REVEAL_THRESHOLD || recruit.isBlueChip) && recruit.trajectory != null && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Trajectory</span>
                        <TrajectoryIcon trajectory={recruit.trajectory as 1|2|3|4} iconSize="w-3 h-3" />
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
                      {revealedAbilities.map((ability: string, i: number) => {
                        const abilityData = getAbilityByName(ability);
                        const tierColor = abilityData?.tier === "gold" ? "text-gold" : abilityData?.tier === "blue" ? "text-blue-400" : "text-red-400";
                        return (
                          <Badge key={i} variant="outline" className={`text-xs ${tierColor}`}>
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
