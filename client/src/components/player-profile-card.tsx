import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";
import { AttributeSlider } from "@/components/ui/attribute-slider";
import { Badge } from "@/components/ui/badge";
import { LetterGrade } from "@/components/ui/letter-grade";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { MapPin, ChevronRight, Star } from "lucide-react";
import { getAbilityByName } from "@shared/abilities";

interface PlayerStats {
  gamesPlayed?: number;
  atBats?: number;
  hits?: number;
  homeRuns?: number;
  rbis?: number;
  battingAvg?: number;
  era?: number;
  wins?: number;
  losses?: number;
  strikeouts?: number;
  innings?: number;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  jerseyNumber: number;
  eligibility: string;
  hometown: string;
  homeState: string;
  overall: number;
  starRating: number;
  potential?: string;
  hitForAvg: number;
  power: number;
  speed: number;
  arm: number;
  fielding: number;
  errorResistance: number;
  velocity: number;
  control: number;
  stamina: number;
  stuff: number;
  bats?: string;
  throws?: string;
  abilities?: string[];
  careerStats?: PlayerStats[];
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
}

interface PlayerProfileCardProps {
  player: Player;
  open: boolean;
  onClose: () => void;
}

const positionColors: Record<string, string> = {
  P: "#4a90a4",
  C: "#7b68ee",
  "1B": "#2e8b57",
  "2B": "#daa520",
  SS: "#cd5c5c",
  "3B": "#4682b4",
  LF: "#9370db",
  CF: "#20b2aa",
  RF: "#f4a460",
};

export function PlayerProfileCard({ player, open, onClose }: PlayerProfileCardProps) {
  const [activeTab, setActiveTab] = useState<"attributes" | "career">("attributes");
  
  const isPitcher = player.position === "P";
  const posColor = positionColors[player.position] || "#666";

  const eligibilityLabel: Record<string, string> = {
    FR: "Freshman",
    SO: "Sophomore", 
    JR: "Junior",
    SR: "Senior",
    RS: "Redshirt",
  };

  const getAttributeColor = (value: number) => {
    if (value >= 80) return "#22c55e";
    if (value >= 60) return "#eab308";
    return "#f97316";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Player Profile</DialogTitle>
          <DialogDescription>View player attributes and career statistics</DialogDescription>
        </DialogHeader>
        
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <PlayerPortrait
              position={player.position}
              skinTone={player.skinTone || "light"}
              hairColor={player.hairColor || "brown"}
              hairStyle={player.hairStyle || "short"}
              className="w-14 h-14 flex-shrink-0"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge 
                  className="text-[10px] text-white"
                  style={{ backgroundColor: posColor }}
                  data-testid="badge-position"
                >
                  {player.position}
                </Badge>
              </div>
              <h2 className="font-pixel text-gold text-sm mt-1" data-testid="text-player-name">
                #{player.jerseyNumber} {player.firstName} {player.lastName}
              </h2>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-4 border-b border-border">
          <div className="bg-background/50 rounded p-3 text-center">
            <p className="font-pixel text-gold text-lg" data-testid="text-overall">{player.overall}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Star className="w-3 h-3 text-gold" fill="currentColor" /> Rating
            </p>
          </div>
          <div className="bg-background/50 rounded p-3 text-center">
            <div className="flex items-center justify-center gap-0.5" data-testid="text-star-rating">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${i < player.starRating ? "text-gold" : "text-muted-foreground/30"}`}
                  fill={i < player.starRating ? "currentColor" : "none"}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Rank</p>
          </div>
          <div className="bg-background/50 rounded p-3 text-center">
            <p className="font-pixel text-lg" data-testid="text-eligibility">
              {player.eligibility.substring(0, 2)}
            </p>
            <p className="text-xs text-muted-foreground">Year</p>
          </div>
        </div>

        <div className="p-4 border-b border-border flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            <span data-testid="text-hometown">{player.hometown}, {player.homeState}</span>
          </div>
          <div className="flex items-center gap-2">
            <span data-testid="text-handedness">
              Bats {player.bats || "R"} / Throws {player.throws || "R"}
            </span>
          </div>
        </div>

        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("attributes")}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
              activeTab === "attributes"
                ? "text-gold border-b-2 border-gold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-attributes"
          >
            Attributes
          </button>
          <button
            onClick={() => setActiveTab("career")}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
              activeTab === "career"
                ? "text-gold border-b-2 border-gold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-career"
          >
            Career Stats
          </button>
        </div>

        <div className="p-4 max-h-[300px] overflow-y-auto">
          {activeTab === "attributes" ? (
            <div className="space-y-3">
              <h3 className="font-pixel text-gold text-xs mb-3">Attributes</h3>
              
              {isPitcher ? (
                <>
                  <AttributeRow label="Velocity" value={player.velocity} />
                  <AttributeRow label="Control" value={player.control} />
                  <AttributeRow label="Stamina" value={player.stamina} />
                  <AttributeRow label="Stuff" value={player.stuff} />
                  <AttributeRow label="Fielding" value={player.fielding} />
                </>
              ) : (
                <>
                  <AttributeRow label="Contact" value={player.hitForAvg} />
                  <AttributeRow label="Power" value={player.power} />
                  <AttributeRow label="Speed" value={player.speed} />
                  <AttributeRow label="Arm" value={player.arm} />
                  <AttributeRow label="Fielding" value={player.fielding} />
                  <AttributeRow label="Error Resist" value={player.errorResistance} />
                </>
              )}

              {player.abilities && player.abilities.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h3 className="font-pixel text-gold text-xs mb-3">Special Abilities</h3>
                  <div className="flex flex-wrap gap-2">
                    {player.abilities.map((abilityName, idx) => {
                      const ability = getAbilityByName(abilityName);
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
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-pixel text-gold text-xs mb-3">Career Statistics</h3>
              
              {player.careerStats && player.careerStats.length > 0 ? (
                <div className="space-y-4">
                  {player.careerStats.map((season, idx) => (
                    <div key={idx} className="bg-background/30 rounded p-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        Season {idx + 1}
                      </p>
                      {isPitcher ? (
                        <div className="grid grid-cols-3 gap-2 text-center text-sm">
                          <div>
                            <p className="font-bold">{season.wins || 0}-{season.losses || 0}</p>
                            <p className="text-xs text-muted-foreground">W-L</p>
                          </div>
                          <div>
                            <p className="font-bold">{season.era?.toFixed(2) || "0.00"}</p>
                            <p className="text-xs text-muted-foreground">ERA</p>
                          </div>
                          <div>
                            <p className="font-bold">{season.strikeouts || 0}</p>
                            <p className="text-xs text-muted-foreground">K</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2 text-center text-sm">
                          <div>
                            <p className="font-bold">{season.gamesPlayed || 0}</p>
                            <p className="text-xs text-muted-foreground">G</p>
                          </div>
                          <div>
                            <p className="font-bold">.{Math.round((season.battingAvg || 0) * 1000)}</p>
                            <p className="text-xs text-muted-foreground">AVG</p>
                          </div>
                          <div>
                            <p className="font-bold">{season.homeRuns || 0}</p>
                            <p className="text-xs text-muted-foreground">HR</p>
                          </div>
                          <div>
                            <p className="font-bold">{season.rbis || 0}</p>
                            <p className="text-xs text-muted-foreground">RBI</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No career statistics yet</p>
                  <p className="text-xs mt-1">Stats will appear after games are played</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttributeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3" data-testid={`attr-row-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground w-24">{label}</span>
      <div className="flex-1 h-2 bg-background/50 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="flex items-center gap-1">
        <LetterGrade value={value} size="sm" />
        <span 
          className="text-sm font-bold w-8 text-right"
          data-testid={`text-attr-${label.toLowerCase().replace(/\s/g, "-")}`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function PlayerProfileCardTrigger({ 
  player, 
  children 
}: { 
  player: Player; 
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {children}
      </div>
      <PlayerProfileCard player={player} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
