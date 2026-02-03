import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { LetterGrade, getLetterGrade } from "@/components/ui/letter-grade";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PitchMixWheel } from "@/components/ui/pitch-mix-wheel";
import { MapPin, Star, Edit } from "lucide-react";
import { getAbilityByName } from "@shared/abilities";

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
  // Fielder attributes
  hitForAvg?: number | null;
  power?: number | null;
  speed?: number | null;
  arm?: number | null;
  fielding?: number | null;
  errorResistance?: number | null;
  // Pitcher attributes
  velocity?: number | null;
  control?: number | null;
  stamina?: number | null;
  stuff?: number | null;
  // Common abilities (letter grade based)
  clutch?: number | null;
  vsLHP?: number | null;
  grit?: number | null;
  stealing?: number | null;
  running?: number | null;
  throwing?: number | null;
  recovery?: number | null;
  catcherAbility?: number | null;
  wRISP?: number | null;
  vsLefty?: number | null;
  poise?: number | null;
  heater?: number | null;
  agile?: number | null;
  // Other
  bats?: string;
  throws?: string;
  batHand?: string;
  throwHand?: string;
  abilities?: string[] | null;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
}

interface PlayerProfileCardProps {
  player: Player;
  open: boolean;
  onClose: () => void;
  isCommissioner?: boolean;
  onEdit?: () => void;
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

// Generate pitch mix based on pitcher stats
function generatePitchMix(player: Player): { name: string; rating: number }[] {
  if (player.position !== "P") return [];
  const pitchCount = Math.min(7, Math.max(1, Math.floor((player.stuff || 50) / 15) + 1));
  const basePitches = [
    { name: "FB", rating: Math.min(99, (player.velocity || 50) + 20) },
    { name: "SL", rating: Math.floor((player.stuff || 50) * 0.9) },
    { name: "CB", rating: Math.floor((player.control || 50) * 0.85) },
    { name: "CH", rating: Math.floor((player.stuff || 50) * 0.75) },
    { name: "CT", rating: Math.floor((player.control || 50) * 0.6) },
    { name: "SNK", rating: Math.floor((player.velocity || 50) * 0.7) },
    { name: "SPL", rating: Math.floor((player.stuff || 50) * 0.5) },
  ];
  return basePitches.slice(0, pitchCount).filter(p => p.rating > 30);
}

export function PlayerProfileCard({ player, open, onClose, isCommissioner, onEdit }: PlayerProfileCardProps) {
  const isPitcher = player.position === "P";
  const isCatcher = player.position === "C";
  const posColor = positionColors[player.position] || "#666";
  const bats = player.bats || player.batHand || "R";
  const throws = player.throws || player.throwHand || "R";
  const pitchMix = generatePitchMix(player);

  const eligibilityLabel: Record<string, string> = {
    FR: "Freshman",
    SO: "Sophomore", 
    JR: "Junior",
    SR: "Senior",
    RS: "Redshirt",
  };

  // Fielder attributes
  const fielderAttrs = [
    { label: "Contact", value: player.hitForAvg },
    { label: "Power", value: player.power },
    { label: "Speed", value: player.speed },
    { label: "Arm", value: player.arm },
    { label: "Fielding", value: player.fielding },
    { label: "Error Resist", value: player.errorResistance },
  ];

  // Pitcher attributes
  const pitcherAttrs = [
    { label: "Velocity", value: player.velocity },
    { label: "Control", value: player.control },
    { label: "Stamina", value: player.stamina },
    { label: "Stuff", value: player.stuff },
  ];

  // Common abilities for fielders (displayed as letter grades G-A)
  const fielderCommonAbilities = [
    { label: "Clutch", value: player.clutch },
    { label: "vs LHP", value: player.vsLHP },
    { label: "Grit", value: player.grit },
    { label: "Stealing", value: player.stealing },
    { label: "Running", value: player.running },
    { label: "Throwing", value: player.throwing },
    { label: "Recovery", value: player.recovery },
  ];
  
  // Add catcher ability only for catchers
  if (isCatcher) {
    fielderCommonAbilities.push({ label: "Catcher", value: player.catcherAbility });
  }

  // Common abilities for pitchers (displayed as letter grades G-A)
  const pitcherCommonAbilities = [
    { label: "W/RISP", value: player.wRISP },
    { label: "vs Lefty", value: player.vsLefty },
    { label: "Poise", value: player.poise },
    { label: "Grit", value: player.grit },
    { label: "Heater", value: player.heater },
    { label: "Agile", value: player.agile },
    { label: "Recovery", value: player.recovery },
  ];

  const attrs = isPitcher ? pitcherAttrs : fielderAttrs;
  const commonAbilities = isPitcher ? pitcherCommonAbilities : fielderCommonAbilities;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg p-0 gap-0 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Player Profile</DialogTitle>
          <DialogDescription>View player attributes and abilities</DialogDescription>
        </DialogHeader>
        
        {/* Name, Bio & Details Section */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <PlayerPortrait
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
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3 h-3 ${i < player.starRating ? "text-gold" : "text-muted-foreground/30"}`}
                      fill={i < player.starRating ? "currentColor" : "none"}
                    />
                  ))}
                </div>
                {isCommissioner && onEdit && (
                  <RetroButton
                    size="sm"
                    variant="outline"
                    onClick={onEdit}
                    className="ml-auto"
                    data-testid="button-edit-player"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </RetroButton>
                )}
              </div>
              <h2 className="font-pixel text-gold text-sm mt-1" data-testid="text-player-name">
                #{player.jerseyNumber} {player.firstName} {player.lastName}
              </h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span>{eligibilityLabel[player.eligibility] || player.eligibility}</span>
                <span>Bats {bats} / Throws {throws}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span data-testid="text-hometown">{player.hometown}, {player.homeState}</span>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <span className="font-pixel text-gold text-lg" data-testid="text-overall">{player.overall}</span>
              <span className="text-xs">OVR</span>
            </div>
          </div>
        </div>

        {/* Attributes Section */}
        <div className="p-4 border-b border-border">
          <h3 className="font-pixel text-gold text-xs mb-3">ATTRIBUTES</h3>
          <div className="grid grid-cols-2 gap-2">
            {attrs.map((attr) => (
              <AttributeRow key={attr.label} label={attr.label} value={attr.value} />
            ))}
          </div>
          
          {/* Pitch Mix for Pitchers */}
          {isPitcher && pitchMix.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground">Pitch Mix</span>
                <span className="font-pixel text-gold text-sm">{pitchMix.length}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {pitchMix.map((pitch) => (
                  <div key={pitch.name} className="bg-background/50 px-2 py-1 rounded text-center">
                    <span className="text-xs text-muted-foreground">{pitch.name}</span>
                    <p className="font-bold text-sm">{pitch.rating}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Common Abilities Section (Letter Grades) */}
        <div className="p-4 border-b border-border">
          <h3 className="font-pixel text-gold text-xs mb-3">COMMON ABILITIES</h3>
          <div className="grid grid-cols-2 gap-2">
            {commonAbilities.map((ability) => (
              <CommonAbilityRow 
                key={ability.label} 
                label={ability.label} 
                value={ability.value} 
              />
            ))}
          </div>
        </div>

        {/* Special Abilities Section */}
        <div className="p-4">
          <h3 className="font-pixel text-gold text-xs mb-3">SPECIAL ABILITIES</h3>
          {player.abilities && player.abilities.length > 0 ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">No special abilities</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttributeRow({ label, value }: { label: string; value?: number | null }) {
  const displayValue = value ?? 50;
  return (
    <div className="flex items-center justify-between p-2 bg-background/50 rounded" data-testid={`attr-row-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <LetterGrade value={displayValue} size="sm" />
        <span 
          className="text-sm font-bold w-8 text-right"
          data-testid={`text-attr-${label.toLowerCase().replace(/\s/g, "-")}`}
        >
          {displayValue}
        </span>
      </div>
    </div>
  );
}

function CommonAbilityRow({ label, value }: { label: string; value?: number | null }) {
  const displayValue = value ?? 50;
  const { letter } = getLetterGrade(displayValue);
  
  return (
    <div className="flex items-center justify-between p-2 bg-background/50 rounded" data-testid={`common-ability-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <LetterGrade value={displayValue} size="sm" />
    </div>
  );
}

export function PlayerProfileCardTrigger({ 
  player, 
  children,
  isCommissioner,
  onEdit
}: { 
  player: Player; 
  children: React.ReactNode;
  isCommissioner?: boolean;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {children}
      </div>
      <PlayerProfileCard 
        player={player} 
        open={open} 
        onClose={() => setOpen(false)} 
        isCommissioner={isCommissioner}
        onEdit={onEdit}
      />
    </>
  );
}
