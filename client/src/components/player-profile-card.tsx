import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { LetterGrade, getLetterGrade } from "@/components/ui/letter-grade";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PitchMixDial, generatePitchMixForDial } from "@/components/ui/pitch-mix-dial";
import { MapPin, Star, Edit, Trophy, ArrowUp, ArrowDown } from "lucide-react";
import { getAbilityByName } from "@shared/abilities";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { velocityToMPH } from "@/lib/playerUtils";
import { getPotentialGrade, getProgressionZone, getProgressionColor } from "@shared/potential";
import { useIsMobile } from "@/hooks/use-mobile";

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
  potential?: number | null;
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
  declaredForDraft?: boolean;
  progressionDeltas?: Record<string, number> | null;
}

function DeltaArrow({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUp className="w-3 h-3 text-green-400 inline-block" />;
  if (delta < 0) return <ArrowDown className="w-3 h-3 text-red-400 inline-block" />;
  return null;
}

interface PlayerProfileCardProps {
  player: Player;
  open: boolean;
  onClose: () => void;
  isCommissioner?: boolean;
  onEdit?: () => void;
  teamPrimaryColor?: string;
  canDeclareDraft?: boolean;
  onDeclareDraft?: () => void;
  isDeclaringDraft?: boolean;
  leagueId?: string;
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


export function PlayerProfileCard({ player, open, onClose, isCommissioner, onEdit, teamPrimaryColor, canDeclareDraft, onDeclareDraft, isDeclaringDraft, leagueId }: PlayerProfileCardProps) {
  const isMobile = useIsMobile();
  const isPitcher = player.position === "P";
  const isCatcher = player.position === "C";
  const posColor = positionColors[player.position] || "#666";
  const bats = player.bats || player.batHand || "R";
  const throws = player.throws || player.throwHand || "R";
  const pitchMix = generatePitchMixForDial(player);

  const eligibilityLabel: Record<string, string> = {
    FR: "Freshman",
    SO: "Sophomore", 
    JR: "Junior",
    SR: "Senior",
    RS: "Redshirt",
  };

  const deltas = player.progressionDeltas;

  // Fielder attributes
  const fielderAttrs = [
    { label: "Contact", value: player.hitForAvg, delta: deltas?.hitForAvg },
    { label: "Power", value: player.power, delta: deltas?.power },
    { label: "Speed", value: player.speed, delta: deltas?.speed },
    { label: "Arm", value: player.arm, delta: deltas?.arm },
    { label: "Fielding", value: player.fielding, delta: deltas?.fielding },
    { label: "Error Resist", value: player.errorResistance, delta: deltas?.errorResistance },
  ];

  // Pitcher attributes
  const pitcherAttrs = [
    { label: "Velocity", value: player.velocity, delta: deltas?.velocity },
    { label: "Control", value: player.control, delta: deltas?.control },
    { label: "Stamina", value: player.stamina, delta: deltas?.stamina },
  ];

  // Common abilities for fielders (displayed as letter grades G-A)
  const fielderCommonAbilities: Array<{ label: string; value?: number | null; delta?: number }> = [
    { label: "Clutch", value: player.clutch, delta: deltas?.clutch },
    { label: "vs LHP", value: player.vsLHP, delta: deltas?.vsLHP },
    { label: "Grit", value: player.grit, delta: deltas?.grit },
    { label: "Stealing", value: player.stealing, delta: deltas?.stealing },
    { label: "Running", value: player.running, delta: deltas?.running },
    { label: "Throwing", value: player.throwing, delta: deltas?.throwing },
    { label: "Recovery", value: player.recovery, delta: deltas?.recovery },
  ];
  
  // Add catcher ability only for catchers
  if (isCatcher) {
    fielderCommonAbilities.push({ label: "Catcher", value: player.catcherAbility, delta: deltas?.catcherAbility });
  }

  // Common abilities for pitchers (displayed as letter grades G-A)
  const pitcherCommonAbilities = [
    { label: "W/RISP", value: player.wRISP, delta: deltas?.wRISP },
    { label: "vs Lefty", value: player.vsLefty, delta: deltas?.vsLefty },
    { label: "Poise", value: player.poise, delta: deltas?.poise },
    { label: "Grit", value: player.grit, delta: deltas?.grit },
    { label: "Heater", value: player.heater, delta: deltas?.heater },
    { label: "Agile", value: player.agile, delta: deltas?.agile },
    { label: "Recovery", value: player.recovery, delta: deltas?.recovery },
  ];

  const attrs = isPitcher ? pitcherAttrs : fielderAttrs;
  const commonAbilities = isPitcher ? pitcherCommonAbilities : fielderCommonAbilities;

  const cardContent = (
    <>
        {/* Name, Bio & Details Section */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <PlayerPortrait
              skinTone={player.skinTone || "light"}
              hairColor={player.hairColor || "brown"}
              hairStyle={player.hairStyle || "short"}
              className="w-14 h-14 flex-shrink-0"
              jerseyColor={teamPrimaryColor}
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
            <div className="flex items-center gap-3 ml-auto">
              <div className="flex items-center gap-1">
                <span className="font-pixel text-gold text-lg" data-testid="text-overall">{player.overall}</span>
                <span className="text-xs">OVR</span>
                {player.progressionDeltas?.overall != null && player.progressionDeltas.overall !== 0 && (
                  <span className={`flex items-center text-xs font-bold ${player.progressionDeltas.overall > 0 ? "text-green-400" : "text-red-400"}`} data-testid="text-ovr-delta">
                    <DeltaArrow delta={player.progressionDeltas.overall} />
                    {player.progressionDeltas.overall > 0 ? "+" : ""}{player.progressionDeltas.overall}
                  </span>
                )}
              </div>
              {player.potential != null && (
                <div className="flex items-center gap-1" data-testid="text-potential">
                  <span className={`font-pixel text-lg ${getProgressionColor(getProgressionZone(player.potential))}`}>
                    {getPotentialGrade(player.potential)}
                  </span>
                  <span className="text-xs">POT</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Attributes Section */}
        <div className="p-4 border-b border-border">
          <h3 className="font-pixel text-gold text-xs mb-3">ATTRIBUTES</h3>
          <div className="grid grid-cols-2 gap-2">
            {attrs.map((attr) => (
              <AttributeRow key={attr.label} label={attr.label} value={attr.value} delta={attr.delta} />
            ))}
          </div>
          
          {/* Pitch Mix for Pitchers */}
          {isPitcher && pitchMix.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="font-pixel text-gold text-xs mb-2">PITCH MIX</h4>
              <PitchMixDial pitches={pitchMix} />
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
                delta={ability.delta}
              />
            ))}
          </div>
        </div>

        {/* Special Abilities Section */}
        <div className="p-4 border-b border-border">
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

        {leagueId && (
          <CareerStatsSection playerId={player.id} leagueId={leagueId} isPitcher={isPitcher} />
        )}

        {/* Draft Declaration Status */}
        {player.declaredForDraft && (
          <div className="px-4 py-2 bg-yellow-500/20 border-t border-border">
            <div className="flex items-center gap-2 text-yellow-500">
              <Trophy className="w-4 h-4" />
              <span className="font-pixel text-xs">DECLARED FOR MLB DRAFT</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-4 space-y-2">
          {/* Draft Declaration Button */}
          {canDeclareDraft && onDeclareDraft && !player.declaredForDraft && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <RetroButton
                  variant="outline"
                  className="w-full border-yellow-500 text-yellow-500 hover:bg-yellow-500/10"
                  disabled={isDeclaringDraft}
                  data-testid="button-declare-draft"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  {isDeclaringDraft ? "Declaring..." : "Declare for MLB Draft"}
                </RetroButton>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-pixel text-gold text-sm">
                    Declare for MLB Draft?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {player.firstName} {player.lastName} will declare for the MLB Draft. 
                    This action is irreversible - the player will be removed from your roster 
                    and will no longer be available for your team.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-yellow-500 text-black hover:bg-yellow-400"
                    onClick={onDeclareDraft}
                    data-testid="button-confirm-declare-draft"
                  >
                    Declare for Draft
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Edit Button (Commissioner Only) */}
          {isCommissioner && onEdit && (
            <RetroButton
              variant="outline"
              onClick={onEdit}
              className="w-full"
              data-testid="button-edit-player"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Player
            </RetroButton>
          )}
        </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent
          side="bottom"
          className="bg-card border-border p-0 gap-0 h-dvh overflow-y-auto"
          data-testid="sheet-player-profile"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Player Profile</SheetTitle>
            <SheetDescription>View player attributes and abilities</SheetDescription>
          </SheetHeader>
          {cardContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-lg p-0 gap-0 sm:max-h-[90vh] overflow-y-auto w-full sm:w-auto" data-testid="dialog-player-profile">
        <DialogHeader className="sr-only">
          <DialogTitle>Player Profile</DialogTitle>
          <DialogDescription>View player attributes and abilities</DialogDescription>
        </DialogHeader>
        {cardContent}
      </DialogContent>
    </Dialog>
  );
}

function CareerStatsSection({ playerId, leagueId, isPitcher }: { playerId: string; leagueId: string; isPitcher: boolean }) {
  const { data, isLoading } = useQuery<{
    playerId: string;
    leagueId: string;
    seasons: Array<{
      season: number;
      games: number;
      ab: number; r: number; h: number; doubles: number; triples: number;
      hr: number; rbi: number; bb: number; so: number; sb: number;
      avg: string; obp: string; slg: string; ops: string;
      babip: string; wOBA: string; avgExitVelo: string; barrelPct: string; hardHitPct: string; fldPct: string;
      pitchingGames: number; wins: number; losses: number;
      ipDisplay: string; pHits: number; pEr: number; pBb: number; pSo: number; pHr: number;
      era: string; fip: string; whip: string; kPct: string; whiffRate: string; avgSpinRate: number;
    }>;
  }>({
    queryKey: ["/api/leagues", leagueId, "players", playerId, "career-stats"],
    enabled: !!leagueId && !!playerId,
  });

  if (isLoading) {
    return (
      <div className="p-4 border-b border-border">
        <h3 className="font-pixel text-gold text-xs mb-3">CAREER STATS</h3>
        <div className="text-xs text-muted-foreground">Loading stats...</div>
      </div>
    );
  }

  if (!data || !data.seasons || data.seasons.length === 0) {
    return (
      <div className="p-4 border-b border-border">
        <h3 className="font-pixel text-gold text-xs mb-3">CAREER STATS</h3>
        <p className="text-xs text-muted-foreground">No game stats recorded yet</p>
      </div>
    );
  }

  if (isPitcher) {
    return (
      <div className="p-4 border-b border-border">
        <h3 className="font-pixel text-gold text-xs mb-3">CAREER STATS</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="table-career-pitching">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground">SZN</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">G</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">W</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">L</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">ERA</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">IP</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">SO</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">FIP</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">WHIP</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">K%</th>
                <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">Whiff%</th>
              </tr>
            </thead>
            <tbody>
              {data.seasons.map((s) => (
                <tr key={s.season} className="border-b border-border/30" data-testid={`row-career-season-${s.season}`}>
                  <td className="py-1 px-1 font-pixel text-[7px] text-gold">S{s.season}</td>
                  <td className="py-1 px-1 text-center">{s.pitchingGames}</td>
                  <td className="py-1 px-1 text-center">{s.wins}</td>
                  <td className="py-1 px-1 text-center">{s.losses}</td>
                  <td className="py-1 px-1 text-center font-medium text-gold">{s.era}</td>
                  <td className="py-1 px-1 text-center">{s.ipDisplay}</td>
                  <td className="py-1 px-1 text-center">{s.pSo}</td>
                  <td className="py-1 px-1 text-center">{s.fip}</td>
                  <td className="py-1 px-1 text-center">{s.whip}</td>
                  <td className="py-1 px-1 text-center">{s.kPct}%</td>
                  <td className="py-1 px-1 text-center">{s.whiffRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-border">
      <h3 className="font-pixel text-gold text-xs mb-3">CAREER STATS</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="table-career-batting">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground">SZN</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">G</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">AB</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">AVG</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">OPS</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">HR</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">RBI</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">SB</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">wOBA</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">EV</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">Brl%</th>
            </tr>
          </thead>
          <tbody>
            {data.seasons.map((s) => (
              <tr key={s.season} className="border-b border-border/30" data-testid={`row-career-season-${s.season}`}>
                <td className="py-1 px-1 font-pixel text-[7px] text-gold">S{s.season}</td>
                <td className="py-1 px-1 text-center">{s.games}</td>
                <td className="py-1 px-1 text-center">{s.ab}</td>
                <td className="py-1 px-1 text-center font-medium text-gold">{s.avg}</td>
                <td className="py-1 px-1 text-center font-medium">{s.ops}</td>
                <td className="py-1 px-1 text-center">{s.hr}</td>
                <td className="py-1 px-1 text-center">{s.rbi}</td>
                <td className="py-1 px-1 text-center">{s.sb}</td>
                <td className="py-1 px-1 text-center">{s.wOBA}</td>
                <td className="py-1 px-1 text-center">{s.avgExitVelo}</td>
                <td className="py-1 px-1 text-center">{s.barrelPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttributeRow({ label, value, delta }: { label: string; value?: number | null; delta?: number }) {
  const displayValue = value ?? 50;
  const isVelocity = label === "Velocity";
  
  return (
    <div className="flex items-center justify-between p-2 bg-background/50 rounded" data-testid={`attr-row-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <LetterGrade value={displayValue} size="sm" />
        <span 
          className="text-sm font-bold w-14 text-right"
          data-testid={`text-attr-${label.toLowerCase().replace(/\s/g, "-")}`}
        >
          {isVelocity ? `${velocityToMPH(displayValue)} MPH` : displayValue}
        </span>
        {delta != null && delta !== 0 && (
          <DeltaArrow delta={delta} />
        )}
      </div>
    </div>
  );
}

function CommonAbilityRow({ label, value, delta }: { label: string; value?: number | null; delta?: number }) {
  const displayValue = value ?? 50;
  
  return (
    <div className="flex items-center justify-between p-2 bg-background/50 rounded" data-testid={`common-ability-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <LetterGrade value={displayValue} size="sm" isCommonAbility={true} />
        {delta != null && delta !== 0 && (
          <DeltaArrow delta={delta} />
        )}
      </div>
    </div>
  );
}

export function PlayerProfileCardTrigger({ 
  player, 
  children,
  isCommissioner,
  onEdit,
  canDeclareDraft,
  onDeclareDraft,
  isDeclaringDraft,
  leagueId,
}: { 
  player: Player; 
  children: React.ReactNode;
  isCommissioner?: boolean;
  onEdit?: () => void;
  canDeclareDraft?: boolean;
  onDeclareDraft?: () => void;
  isDeclaringDraft?: boolean;
  leagueId?: string;
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
        canDeclareDraft={canDeclareDraft}
        onDeclareDraft={onDeclareDraft}
        isDeclaringDraft={isDeclaringDraft}
        leagueId={leagueId}
      />
    </>
  );
}
