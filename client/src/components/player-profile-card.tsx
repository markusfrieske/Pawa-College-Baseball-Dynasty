import { useState, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LetterGrade, getLetterGrade } from "@/components/ui/letter-grade";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { allPitchKeys, pitchLabels } from "@/components/ui/pitch-mix-dial";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, Star, Edit, Trophy, ArrowUp, ArrowDown, ArrowUpRight, ArrowRight, ArrowDownRight, ChevronDown, ChevronUp, Check, X, Sparkles } from "lucide-react";
import { getAbilityByName, getAbilitiesForPosition, ALL_ABILITIES, S_GOLD_COMMON_KEY, S_GOLD_PITCHER_KEY } from "@shared/abilities";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { velocityToKMH } from "@/lib/playerUtils";
import { getPotentialGrade, getProgressionZone, getProgressionColor } from "@shared/potential";
import { TRAJECTORY_LABELS, TRAJECTORY_FULL_LABELS, assignTrajectory } from "@shared/trajectory";
import { isPitcher as getIsPitcher } from "@shared/positions";
import { useIsMobile } from "@/hooks/use-mobile";

export interface Player {
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
  stuff?: number | null;
  // Pitch mix fields
  pitchFB?: number | null;
  pitch2S?: number | null;
  pitchSL?: number | null;
  pitchCB?: number | null;
  pitchCH?: number | null;
  pitchCT?: number | null;
  pitchSNK?: number | null;
  pitchSPL?: number | null;
  pitchSHU?: number | null;
  pitchCCH?: number | null;
  pitchHSL?: number | null;
  pitchSWP?: number | null;
  pitchKN?: number | null;
  pitchVSL?: number | null;
  pitchSFF?: number | null;
  pitchFK?: number | null;
  pitchSCB?: number | null;
  pitchPCB?: number | null;
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
  trajectory?: number | null;
  // Other
  bats?: string;
  throws?: string;
  batHand?: string;
  throwHand?: string;
  abilities?: string[] | null;
  storyLockedAbilities?: string[] | null;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string | null;
  eyeStyle?: string | null;
  eyebrowStyle?: string | null;
  mouthStyle?: string | null;
  eyeBlack?: boolean | null;
  declaredForDraft?: boolean;
  progressionDeltas?: Record<string, number> | null;
  originalPosition?: string | null;
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
  onUpdate?: (field: string, value: unknown) => void;
}

function AbilitiesEditor({
  abilities,
  position,
  onChange,
}: {
  abilities: string[];
  position: string;
  onChange: (abilities: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const available = useMemo(() => getAbilitiesForPosition(position), [position]);
  const filtered = useMemo(() =>
    search ? available.filter(a => a.name.toLowerCase().includes(search.toLowerCase())) : available,
    [available, search]
  );
  const grouped = useMemo(() => ({
    gold: filtered.filter(a => a.tier === "gold"),
    blue: filtered.filter(a => a.tier === "blue"),
    red: filtered.filter(a => a.tier === "red"),
  }), [filtered]);

  const toggle = (name: string) => {
    onChange(abilities.includes(name) ? abilities.filter(a => a !== name) : [...abilities, name]);
  };

  const tierColor = (tier: string) =>
    tier === "gold" ? "text-yellow-500" : tier === "red" ? "text-red-400" : "text-blue-400";

  return (
    <div className="relative" ref={ref}>
      <div
        className="flex items-center gap-1 border border-border rounded-md px-2 py-1 cursor-pointer min-h-[30px] bg-background/50"
        onClick={() => setOpen(v => !v)}
        data-testid="abilities-editor-trigger"
      >
        {abilities.length === 0 ? (
          <span className="text-muted-foreground text-xs">Add abilities...</span>
        ) : (
          <div className="flex flex-wrap gap-1 flex-1">
            {abilities.map(ab => {
              const ability = ALL_ABILITIES.find(a => a.name === ab);
              const cls = ability?.tier === "gold"
                ? "bg-yellow-600/20 text-yellow-500 border-yellow-600/30"
                : ability?.tier === "red"
                ? "bg-red-600/20 text-red-400 border-red-600/30"
                : "bg-blue-600/20 text-blue-400 border-blue-600/30";
              return (
                <Badge key={ab} variant="outline" className={`text-[8px] ${cls}`}>
                  {ab}
                  <button className="ml-1" onClick={e => { e.stopPropagation(); toggle(ab); }} data-testid={`remove-ability-${ab}`}>
                    <X className="w-2 h-2" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
        <ChevronDown className="w-3 h-3 ml-auto shrink-0 text-muted-foreground" />
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-52 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border">
            <Input
              className="h-7 text-xs"
              placeholder="Search abilities..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              data-testid="abilities-editor-search"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {(["gold", "blue", "red"] as const).map(tier => {
              const list = grouped[tier];
              if (!list.length) return null;
              return (
                <div key={tier}>
                  <div className={`px-2 py-0.5 text-[9px] font-pixel uppercase sticky top-0 bg-card border-b border-border ${tierColor(tier)}`}>
                    {tier} ({list.length})
                  </div>
                  {list.map(ability => {
                    const selected = abilities.includes(ability.name);
                    return (
                      <div
                        key={ability.name}
                        className={`flex items-center gap-2 px-2 py-1 cursor-pointer text-xs hover:bg-muted/30 ${selected ? "bg-muted/20" : ""}`}
                        onClick={e => { e.stopPropagation(); toggle(ability.name); }}
                        data-testid={`ability-option-${ability.name.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        <div className={`w-4 h-4 border rounded-sm flex items-center justify-center shrink-0 ${selected ? "bg-gold border-gold" : "border-border"}`}>
                          {selected && <Check className="w-3 h-3 text-background" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`${tierColor(tier)} font-medium`}>{ability.name}</span>
                          <p className="text-muted-foreground text-[9px] truncate">{ability.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="p-1.5 border-t border-border flex justify-end">
            <RetroButton size="sm" variant="outline" onClick={() => setOpen(false)} data-testid="abilities-editor-done">Done</RetroButton>
          </div>
        </div>
      )}
    </div>
  );
}

const positionColors: Record<string, string> = {
  P: "#4a90a4",
  C: "#7b68ee",
  "1B": "#2e8b57",
  "2B": "#daa520",
  SS: "#cd5c5c",
  "3B": "#4682b4",
  OF: "#22c55e",
  LF: "#9370db",
  CF: "#20b2aa",
  RF: "#f4a460",
};


export function PlayerProfileCard({ player, open, onClose, isCommissioner, onEdit, teamPrimaryColor, canDeclareDraft, onDeclareDraft, isDeclaringDraft, leagueId, onUpdate }: PlayerProfileCardProps) {
  const isMobile = useIsMobile();
  const [editOpen, setEditOpen] = useState(false);
  const isPitcher = getIsPitcher(player.position);
  const isCatcher = player.position === "C";
  const posColor = positionColors[player.position] || "#666";
  const bats = player.bats || player.batHand || "R";
  const throws = player.throws || player.throwHand || "R";
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
    { label: "Error", value: player.errorResistance, delta: deltas?.errorResistance },
  ];

  // Pitcher attributes
  const pitcherAttrs = [
    { label: "Velocity", value: player.velocity, delta: deltas?.velocity },
    { label: "Control", value: player.control, delta: deltas?.control },
    { label: "Stamina", value: player.stamina, delta: deltas?.stamina },
  ];

  // Multi-map: common-ability key → all gold ability names that link to it.
  // Using a list handles keys like "throwing" which has Strike Thrower, High-Speed Laser, and Bazooka Arm.
  const COMMON_KEY_TO_GOLD_LIST: Record<string, string[]> = {};
  for (const [gold, key] of Object.entries(S_GOLD_COMMON_KEY)) {
    if (!COMMON_KEY_TO_GOLD_LIST[key]) COMMON_KEY_TO_GOLD_LIST[key] = [];
    COMMON_KEY_TO_GOLD_LIST[key].push(gold);
  }

  // Build the player ability set early so sGoldBadge can use it.
  const playerAbilitySet = new Set(player.abilities ?? []);

  // Helper: return the gold ability name to badge inline next to a common-ability row.
  // Priority 1: the player actually has one of the mapped gold abilities → show it regardless of grade.
  // Priority 2: the attribute is S-grade (≥90) → show the first mapped gold as a grade indicator.
  const sGoldBadge = (attrVal: number | null | undefined, commonKey: string): string | undefined => {
    const goldList = COMMON_KEY_TO_GOLD_LIST[commonKey];
    if (!goldList) return undefined;
    const fromAbilities = goldList.find(g => playerAbilitySet.has(g));
    if (fromAbilities) return fromAbilities;
    if ((attrVal ?? 0) >= 90) return goldList[0];
    return undefined;
  };

  // Helper: when a gold ability is present in the player's ability list, return 90 so
  // the grade chip renders as "S" — otherwise return the actual attribute value unchanged.
  const sGoldDisplayValue = (attrVal: number | null | undefined, commonKey: string): number | null | undefined => {
    const goldList = COMMON_KEY_TO_GOLD_LIST[commonKey];
    if (!goldList) return attrVal;
    if (goldList.some(g => playerAbilitySet.has(g))) return 90;
    return attrVal;
  };

  // Common abilities for fielders (displayed as letter grades G-A)
  const fielderCommonAbilities: Array<{ label: string; value?: number | null; delta?: number; goldAbilityName?: string }> = [
    { label: "Clutch", value: sGoldDisplayValue(player.clutch, "clutch"), delta: deltas?.clutch, goldAbilityName: sGoldBadge(player.clutch, "clutch") },
    { label: "vs LHP", value: sGoldDisplayValue(player.vsLHP, "vsLHP"), delta: deltas?.vsLHP, goldAbilityName: sGoldBadge(player.vsLHP, "vsLHP") },
    { label: "Grit", value: sGoldDisplayValue(player.grit, "grit"), delta: deltas?.grit, goldAbilityName: sGoldBadge(player.grit, "grit") },
    { label: "Stealing", value: sGoldDisplayValue(player.stealing, "stealing"), delta: deltas?.stealing, goldAbilityName: sGoldBadge(player.stealing, "stealing") },
    { label: "Running", value: sGoldDisplayValue(player.running, "running"), delta: deltas?.running, goldAbilityName: sGoldBadge(player.running, "running") },
    { label: "Throwing", value: sGoldDisplayValue(player.throwing, "throwing"), delta: deltas?.throwing, goldAbilityName: sGoldBadge(player.throwing, "throwing") },
  ];
  
  // Add catcher ability only for catchers
  if (isCatcher) {
    fielderCommonAbilities.push({ label: "Catcher", value: sGoldDisplayValue(player.catcherAbility, "catcherAbility"), delta: deltas?.catcherAbility, goldAbilityName: sGoldBadge(player.catcherAbility, "catcherAbility") });
  }

  // Returns the first gold ability name that links to this pitcher common attr key.
  // Priority 1: player actually has the gold ability in their list.
  // Priority 2: the attribute is S-grade (≥90) → show the first mapped gold as a grade indicator.
  // Uses S_GOLD_PITCHER_KEY directly to handle multiple golds per attr (e.g.
  // "Sangfroid" and — after this fix — only "Sangfroid" links to "wRISP";
  // "Indomitable Soul" links to "poise", "Grit" links to "grit").
  const sPitcherGoldBadge = (attrKey: string, attrVal?: number | null): string | undefined => {
    for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
      if (linkedKey === attrKey && playerAbilitySet.has(goldName)) return goldName;
    }
    if ((attrVal ?? 0) >= 90) {
      for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
        if (linkedKey === attrKey) return goldName;
      }
    }
    return undefined;
  };

  // When a pitcher gold ability is present in the player's ability list, return 90 so
  // the grade chip renders as "S" — otherwise return the actual attribute value unchanged.
  const sPitcherGoldDisplayValue = (attrVal: number | null | undefined, attrKey: string): number | null | undefined => {
    for (const [goldName, linkedKey] of Object.entries(S_GOLD_PITCHER_KEY)) {
      if (linkedKey === attrKey && playerAbilitySet.has(goldName)) return 90;
    }
    return attrVal;
  };

  // Common abilities for pitchers (displayed as letter grades G-A)
  const pitcherCommonAbilities = [
    { label: "W/RISP", value: sPitcherGoldDisplayValue(player.wRISP, "wRISP"), delta: deltas?.wRISP, goldAbilityName: sPitcherGoldBadge("wRISP", player.wRISP) },
    { label: "vs Lefty", value: sPitcherGoldDisplayValue(player.vsLefty, "vsLefty"), delta: deltas?.vsLefty, goldAbilityName: sPitcherGoldBadge("vsLefty", player.vsLefty) },
    { label: "Poise", value: sPitcherGoldDisplayValue(player.poise, "poise"), delta: deltas?.poise, goldAbilityName: sPitcherGoldBadge("poise", player.poise) },
    { label: "Grit", value: sPitcherGoldDisplayValue(player.grit, "grit"), delta: deltas?.grit, goldAbilityName: sPitcherGoldBadge("grit", player.grit) },
    { label: "Heater", value: sPitcherGoldDisplayValue(player.heater, "heater"), delta: deltas?.heater, goldAbilityName: sPitcherGoldBadge("heater", player.heater) },
    { label: "Agile", value: sPitcherGoldDisplayValue(player.agile, "agile"), delta: deltas?.agile, goldAbilityName: sPitcherGoldBadge("agile", player.agile) },
    { label: "Recovery", value: sPitcherGoldDisplayValue(player.recovery, "recovery"), delta: deltas?.recovery, goldAbilityName: sPitcherGoldBadge("recovery", player.recovery) },
  ];

  const attrs = isPitcher ? pitcherAttrs : fielderAttrs;
  const commonAbilities = isPitcher ? pitcherCommonAbilities : fielderCommonAbilities;

  // Gold abilities that are already displayed in the Common Abilities section (via sGoldBadge)
  // should NOT also appear in the Special Abilities badge list.
  const commonLinkedGoldShown = new Set(
    commonAbilities
      .map(a => (a as { goldAbilityName?: string }).goldAbilityName)
      .filter((n): n is string => !!n)
  );

  // Derive trajectory for hitters — fall back to computing from attrs when the
  // stored value is absent (players created before the trajectory migration).
  const effectiveTrajectory: 1 | 2 | 3 | 4 =
    !isPitcher && player.trajectory != null && player.trajectory >= 1 && player.trajectory <= 4
      ? (player.trajectory as 1 | 2 | 3 | 4)
      : assignTrajectory(player.power ?? 50, player.speed ?? 50, player.hitForAvg ?? 50);

  const cardContent = (
    <>
        {/* Name, Bio & Details Section */}
        <div
          className="p-4 border-b border-border relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(120 22% 16%) 0%, hsl(120 20% 13%) 100%)" }}
        >
          {/* 5-star animated shimmer stripe across top edge */}
          {player.starRating >= 5 && (
            <span
              className="pointer-events-none absolute top-0 h-[2px] left-0 right-0 overflow-hidden"
            >
              <span
                className="absolute top-0 h-full"
                style={{
                  width: "40%",
                  background: "linear-gradient(90deg, transparent, rgba(196,163,90,0.9), transparent)",
                  animation: "btn-shimmer 3s ease-in-out infinite",
                }}
              />
            </span>
          )}
          <div className="flex items-center gap-3">
            <PlayerPortrait
              skinTone={player.skinTone || "light"}
              hairColor={player.hairColor || "brown"}
              hairStyle={player.hairStyle || "short"}
              facialHair={player.facialHair || "none"}
              eyeStyle={player.eyeStyle || undefined}
              eyebrowStyle={player.eyebrowStyle || undefined}
              mouthStyle={player.mouthStyle || undefined}
              eyeBlack={player.eyeBlack ?? undefined}
              playerId={player.id}
              className="w-14 h-14 flex-shrink-0"
              jerseyColor={teamPrimaryColor}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge 
                  className="text-[10px] text-white"
                  style={{ backgroundColor: posColor }}
                  data-testid="badge-position"
                >
                  {player.position}
                </Badge>
                {player.originalPosition && player.originalPosition !== player.position && (
                  <Badge
                    variant="outline"
                    className="text-[9px] border-orange-500 text-orange-400"
                    data-testid="badge-converted-position"
                    title={`Originally played ${player.originalPosition}`}
                  >
                    conv. from {player.originalPosition}
                  </Badge>
                )}
                {isPitcher ? (
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${throws === "L" ? "border-blue-500/60 text-blue-400 bg-blue-500/10" : "border-border text-muted-foreground"}`}
                    data-testid="badge-handedness"
                  >
                    {throws}HP
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${bats === "L" ? "border-blue-500/60 text-blue-400 bg-blue-500/10" : bats === "S" ? "border-purple-500/60 text-purple-400 bg-purple-500/10" : "border-border text-muted-foreground"}`}
                    data-testid="badge-handedness"
                  >
                    Bats {bats}
                  </Badge>
                )}
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
                {!isPitcher && <span className="text-[10px]">Throws {throws}</span>}
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
                <span
                  className="font-pixel text-gold text-lg"
                  data-testid="text-overall"
                  style={{
                    textShadow: player.starRating >= 5
                      ? "0 0 10px rgba(196,163,90,0.9), 0 0 24px rgba(196,163,90,0.5)"
                      : player.starRating >= 4
                      ? "0 0 8px rgba(196,163,90,0.65), 0 0 18px rgba(196,163,90,0.30)"
                      : player.starRating >= 3
                      ? "0 0 5px rgba(196,163,90,0.40)"
                      : undefined,
                  }}
                >{player.overall}</span>
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

          {/* Trajectory row — hitters only, above the attribute grid */}
          {!isPitcher && (
            <TrajectoryRow trajectory={effectiveTrajectory} />
          )}

          <div className="grid grid-cols-2 gap-2">
            {attrs.map((attr) => (
              <AttributeRow key={attr.label} label={attr.label} value={attr.value} delta={attr.delta} />
            ))}
          </div>

          {/* Pitch Mix for Pitchers */}
          {isPitcher && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="font-pixel text-gold text-xs mb-2">PITCH MIX</h4>
              <div className="grid grid-cols-2 gap-1">
                {allPitchKeys.map(key => {
                  const val = (player as Record<string, unknown>)[`pitch${key}`] as number | null | undefined;
                  const rating = val ?? 0;
                  const isBinary = ["FB", "2S", "FK", "SFF", "KN"].includes(key);
                  if (rating > 0) {
                    return (
                      <div key={key} className="flex items-center justify-between px-1.5 py-0.5 bg-muted/20 rounded">
                        <span className="text-xs text-foreground">{pitchLabels[key] || key}</span>
                        {isBinary ? (
                          <span className="text-[10px] font-bold text-gold px-1 py-0.5 bg-gold/10 rounded border border-gold/30" data-testid={`pitch-rating-${key}`}>Yes</span>
                        ) : (
                          <span className="text-xs font-bold text-gold" data-testid={`pitch-rating-${key}`}>{rating}</span>
                        )}
                      </div>
                    );
                  }
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-between px-1.5 py-0.5 rounded opacity-40 cursor-default">
                          <span className="text-xs text-muted-foreground">{pitchLabels[key] || key}</span>
                          <span className="text-xs text-muted-foreground/60 italic" data-testid={`text-pitch-none-player-${key}`}>None</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Pitcher does not throw this pitch</TooltipContent>
                    </Tooltip>
                  );
                })}
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
                delta={ability.delta}
                goldAbilityName={(ability as { goldAbilityName?: string }).goldAbilityName}
              />
            ))}
          </div>
        </div>

        {/* Special Abilities Section */}
        <div className="p-4 border-b border-border">
          <h3 className="font-pixel text-gold text-xs mb-3">SPECIAL ABILITIES</h3>
          {player.abilities && player.abilities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {player.abilities.filter(name => !commonLinkedGoldShown.has(name)).map((abilityName, idx) => {
                const ability = getAbilityByName(abilityName);
                const isStoryAcquired = (player.storyLockedAbilities ?? []).includes(abilityName);
                const tierStyles: Record<string, { className: string; style: React.CSSProperties }> = {
                  gold: {
                    className: "bg-yellow-600/20 border-yellow-500 text-yellow-400",
                    style: { textShadow: "0 0 8px rgba(196,163,90,0.70)", boxShadow: "0 0 6px rgba(196,163,90,0.25)" },
                  },
                  blue: {
                    className: "bg-blue-600/20 border-blue-500 text-blue-400",
                    style: { textShadow: "0 0 8px rgba(59,130,246,0.70)", boxShadow: "0 0 6px rgba(59,130,246,0.22)" },
                  },
                  red: {
                    className: "bg-red-600/20 border-red-500 text-red-400",
                    style: { textShadow: "0 0 8px rgba(239,68,68,0.70)", boxShadow: "0 0 6px rgba(239,68,68,0.22)" },
                  },
                };
                const tier = ability?.tier;
                const tierStyle = tier ? tierStyles[tier] : null;
                const storyBadgeColor = tier === "gold"
                  ? "text-yellow-400"
                  : tier === "blue"
                  ? "text-blue-400"
                  : tier === "red"
                  ? "text-red-400"
                  : "text-amber-400";

                if (abilityName === "Bad Ball Hitter") {
                  return (
                    <span key={idx} className="relative inline-flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="text-xs px-0 overflow-hidden border-blue-500"
                        style={{ boxShadow: "0 0 6px rgba(59,130,246,0.22)" }}
                        title={ability?.description}
                      >
                        <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5" style={{ textShadow: "0 0 8px rgba(59,130,246,0.70)" }}>Bad</span>
                        <span className="bg-red-600/20 text-red-400 px-2 py-0.5" style={{ textShadow: "0 0 8px rgba(239,68,68,0.70)" }}>Ball Hitter</span>
                      </Badge>
                      {isStoryAcquired && (
                        <span className={`text-[9px] font-pixel ${storyBadgeColor} flex items-center gap-0.5`} title="Acquired through a storyline arc">
                          <Sparkles className="w-2.5 h-2.5" />STORY
                        </span>
                      )}
                    </span>
                  );
                }
                
                return (
                  <span key={idx} className="inline-flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className={`text-xs ${tierStyle ? tierStyle.className : ""}`}
                      style={tierStyle ? tierStyle.style : undefined}
                      title={ability?.description}
                    >
                      {abilityName}
                    </Badge>
                    {isStoryAcquired && (
                      <span className={`text-[9px] font-pixel ${storyBadgeColor} flex items-center gap-0.5`} title="Acquired through a storyline arc">
                        <Sparkles className="w-2.5 h-2.5" />STORY
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No special abilities</p>
          )}
        </div>

        {leagueId && (
          <CareerStatsSection playerId={player.id} leagueId={leagueId} />
        )}

        {/* Edit Stats Panel (roster-viewer custom roster editing) */}
        {onUpdate && (
          <div className="border-b border-border">
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
              onClick={() => setEditOpen(v => !v)}
              data-testid="button-toggle-edit-stats"
            >
              <span className="font-pixel text-gold text-xs flex items-center gap-2">
                <Edit className="w-3 h-3" />
                EDIT STATS
              </span>
              {editOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {editOpen && (
              <div className="px-4 pb-4 space-y-4">
                {/* Numeric Attributes */}
                <div>
                  <p className="font-pixel text-[10px] text-muted-foreground uppercase mb-2">
                    {isPitcher ? "Pitching Attributes" : "Hitting Attributes"}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {isPitcher ? (
                      <>
                        {([
                          { field: "velocity", label: "VELO" },
                          { field: "control", label: "CTRL" },
                          { field: "stamina", label: "STAM" },
                          { field: "stuff", label: "STUF" },
                        ] as const).map(({ field, label }) => (
                          <div key={field} className="space-y-0.5">
                            <label className="font-pixel text-[8px] text-gold block">{label}</label>
                            <Input
                              type="number"
                              min={1}
                              max={99}
                              className="h-7 text-xs text-center"
                              value={(player[field as keyof Player] as number) ?? ""}
                              onChange={e => onUpdate(field, Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                              data-testid={`input-edit-${field}`}
                            />
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        {([
                          { field: "hitForAvg", label: "CON" },
                          { field: "power", label: "PWR" },
                          { field: "speed", label: "SPD" },
                          { field: "arm", label: "ARM" },
                          { field: "fielding", label: "FLD" },
                          { field: "errorResistance", label: "ERR" },
                        ] as const).map(({ field, label }) => (
                          <div key={field} className="space-y-0.5">
                            <label className="font-pixel text-[8px] text-gold block">{label}</label>
                            <Input
                              type="number"
                              min={1}
                              max={99}
                              className="h-7 text-xs text-center"
                              value={(player[field as keyof Player] as number) ?? ""}
                              onChange={e => onUpdate(field, Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                              data-testid={`input-edit-${field}`}
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Trajectory (hitters only) */}
                {!isPitcher && (
                  <div>
                    <p className="font-pixel text-[10px] text-muted-foreground uppercase mb-2">Trajectory</p>
                    <Select
                      value={String(player.trajectory ?? 2)}
                      onValueChange={val => onUpdate("trajectory", parseInt(val))}
                    >
                      <SelectTrigger className="h-7 text-xs" data-testid="select-edit-trajectory">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(TRAJECTORY_LABELS).map(Number).sort((a, b) => a - b).map(t => (
                          <SelectItem key={t} value={String(t)}>
                            {t} · {TRAJECTORY_LABELS[t]} · {TRAJECTORY_FULL_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Common Abilities */}
                <div>
                  <p className="font-pixel text-[10px] text-muted-foreground uppercase mb-2">Common Abilities</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(isPitcher ? (
                      [
                        { field: "wRISP",    label: "W/RISP"  },
                        { field: "vsLefty",  label: "VSLEFTY" },
                        { field: "poise",    label: "POISE"   },
                        { field: "grit",     label: "GRIT"    },
                        { field: "heater",   label: "HEATER"  },
                        { field: "agile",    label: "AGILE"   },
                        { field: "recovery", label: "RECOV"   },
                      ] as const
                    ) : (
                      [
                        { field: "clutch",   label: "CLUTCH"  },
                        { field: "vsLHP",    label: "VSLHP"   },
                        { field: "grit",     label: "GRIT"    },
                        { field: "stealing", label: "STEAL"   },
                        { field: "running",  label: "RUN"     },
                        { field: "throwing", label: "THROW"   },
                        { field: "recovery", label: "RECOV"   },
                        ...(isCatcher ? [{ field: "catcherAbility" as const, label: "CATCH" }] : []),
                      ] as const
                    )).map(({ field, label }) => (
                      <div key={field} className="space-y-0.5">
                        <label className="font-pixel text-[8px] text-gold block">{label}</label>
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          className="h-7 text-xs text-center"
                          value={(player[field as keyof Player] as number) ?? ""}
                          onChange={e => onUpdate(field, Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                          data-testid={`input-edit-${field}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Special Abilities */}
                <div>
                  <p className="font-pixel text-[10px] text-muted-foreground uppercase mb-2">Special Abilities</p>
                  <AbilitiesEditor
                    abilities={player.abilities ?? []}
                    position={player.position}
                    onChange={abilities => onUpdate("abilities", abilities)}
                  />
                </div>
              </div>
            )}
          </div>
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

type CareerSeasonRow = {
  season: number;
  position: string;
  endSeasonOvr: number | null;
  games: number;
  ab: number; r: number; h: number; doubles: number; triples: number;
  hr: number; rbi: number; bb: number; so: number; sb: number;
  avg: string; obp: string; slg: string; ops: string;
  babip: string; wOBA: string; avgExitVelo: string; barrelPct: string; hardHitPct: string; fldPct: string;
  pitchingGames: number; wins: number; losses: number;
  ipDisplay: string; pHits: number; pEr: number; pBb: number; pSo: number; pHr: number;
  era: string; fip: string; whip: string; kPct: string; whiffRate: string; avgSpinRate: number;
};

function OvrCell({ seasons, idx }: { seasons: CareerSeasonRow[]; idx: number }) {
  const s = seasons[idx];
  if (s.endSeasonOvr == null) return <td className="py-1 px-1 text-center text-muted-foreground/40">—</td>;
  const prev = idx > 0 ? seasons[idx - 1].endSeasonOvr : null;
  const delta = prev != null ? s.endSeasonOvr - prev : null;
  return (
    <td className="py-1 px-1 text-center" data-testid={`text-career-ovr-${s.season}`}>
      <span className="font-bold text-gold">{s.endSeasonOvr}</span>
      {delta != null && delta !== 0 && (
        <span className={`ml-0.5 text-[9px] font-bold ${delta > 0 ? "text-green-400" : "text-red-400"}`}>
          {delta > 0 ? "+" : ""}{delta}
        </span>
      )}
    </td>
  );
}

function PitchingStatsTable({ seasons, label }: { seasons: CareerSeasonRow[]; label?: string }) {
  return (
    <div>
      {label && <p className="font-pixel text-[8px] text-muted-foreground mb-1">{label}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="table-career-pitching">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground">SZN</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">OVR</th>
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
            {seasons.map((s, idx) => (
              <tr key={s.season} className="border-b border-border/30" data-testid={`row-career-season-${s.season}`}>
                <td className="py-1 px-1 font-pixel text-[7px] text-gold">S{s.season}</td>
                <OvrCell seasons={seasons} idx={idx} />
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

function BattingStatsTable({ seasons, label }: { seasons: CareerSeasonRow[]; label?: string }) {
  return (
    <div>
      {label && <p className="font-pixel text-[8px] text-muted-foreground mb-1">{label}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="table-career-batting">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground">SZN</th>
              <th className="py-1 px-1 font-pixel text-[7px] text-muted-foreground text-center">OVR</th>
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
            {seasons.map((s, idx) => (
              <tr key={s.season} className="border-b border-border/30" data-testid={`row-career-season-${s.season}`}>
                <td className="py-1 px-1 font-pixel text-[7px] text-gold">S{s.season}</td>
                <OvrCell seasons={seasons} idx={idx} />
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

function CareerStatsSection({ playerId, leagueId }: { playerId: string; leagueId: string }) {
  const { data, isLoading } = useQuery<{
    playerId: string;
    leagueId: string;
    seasons: CareerSeasonRow[];
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

  // Route each season row to the correct table using its stored position.
  // A position-converted player may have rows under both position types;
  // both tables are shown so no stats are hidden.
  const pitchingSeasons = data.seasons.filter(s => s.position === "P");
  const battingSeasons = data.seasons.filter(s => s.position !== "P");
  const isConverted = pitchingSeasons.length > 0 && battingSeasons.length > 0;

  return (
    <div className="p-4 border-b border-border">
      <h3 className="font-pixel text-gold text-xs mb-3">CAREER STATS</h3>
      <div className="space-y-4">
        {pitchingSeasons.length > 0 && (
          <PitchingStatsTable
            seasons={pitchingSeasons}
            label={isConverted ? "PITCHING" : undefined}
          />
        )}
        {battingSeasons.length > 0 && (
          <BattingStatsTable
            seasons={battingSeasons}
            label={isConverted ? "BATTING" : undefined}
          />
        )}
      </div>
    </div>
  );
}

const TRAJECTORY_ARROW_CONFIG: Record<number, { Icon: React.ElementType; color: string; label: string }> = {
  4: { Icon: ArrowUp,          color: "text-pink-400",  label: "Flyball"    },
  3: { Icon: ArrowUpRight,     color: "text-red-400",   label: "Gap"        },
  2: { Icon: ArrowRight,       color: "text-blue-400",  label: "Line Drive" },
  1: { Icon: ArrowDownRight,   color: "text-green-400", label: "Groundball" },
};

function TrajectoryRow({ trajectory }: { trajectory: number }) {
  const { Icon, color, label } = TRAJECTORY_ARROW_CONFIG[trajectory] ?? TRAJECTORY_ARROW_CONFIG[2];
  return (
    <div
      className="flex items-center justify-between p-2 bg-background/50 rounded mb-2"
      data-testid="attr-row-trajectory"
    >
      <span className="text-sm text-muted-foreground">Trajectory</span>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm font-bold w-14 text-right" data-testid="text-attr-trajectory">
          {trajectory}
        </span>
      </div>
    </div>
  );
}

function AttributeRow({ label, value, delta }: { label: string; value?: number | null; delta?: number }) {
  const displayValue = value ?? 50;
  const isVelocity = label === "Velocity";
  
  return (
    <div className="flex items-center justify-between gap-1 p-2 bg-background/50 rounded" data-testid={`attr-row-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground min-w-0 truncate">{label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <LetterGrade value={displayValue} size="sm" />
        <span 
          className="text-sm font-bold w-10 text-right tabular-nums"
          data-testid={`text-attr-${label.toLowerCase().replace(/\s/g, "-")}`}
        >
          {isVelocity ? `${velocityToKMH(displayValue)} KMH` : displayValue}
        </span>
        {delta != null && delta !== 0 && (
          <DeltaArrow delta={delta} />
        )}
      </div>
    </div>
  );
}

function CommonAbilityRow({ label, value, delta, goldAbilityName }: { label: string; value?: number | null; delta?: number; goldAbilityName?: string }) {
  const displayValue = value ?? 50;
  
  return (
    <div className="flex items-center justify-between p-2 bg-background/50 rounded" data-testid={`common-ability-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {goldAbilityName && (
          <span
            className="text-[8px] font-pixel px-1 py-0.5 rounded border text-center max-w-[88px] leading-tight"
            style={{ color: "#c4a35a", borderColor: "rgba(196,163,90,0.5)", background: "rgba(196,163,90,0.12)" }}
            title={goldAbilityName}
            data-testid={`common-ability-gold-badge-${label.toLowerCase().replace(/\s/g, "-")}`}
          >
            {goldAbilityName}
          </span>
        )}
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
