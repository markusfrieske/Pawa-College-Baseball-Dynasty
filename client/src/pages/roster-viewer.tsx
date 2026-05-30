import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, RotateCcw, Star, Search, LogIn, ChevronLeft, X, GitCompare } from "lucide-react";
import { TeamScoutingPanel, type TeamScoutingInfo } from "@/components/team-scouting-panel";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { calculateOVR } from "@shared/abilities";
import { parseErrorMessage } from "@/lib/errorUtils";
import { TeamBadge } from "@/components/ui/team-badge";
import { PlayerProfileCard, type Player } from "@/components/player-profile-card";
import { ALL_ABILITIES } from "@shared/abilities";
import { useIsMobile } from "@/hooks/use-mobile";

interface RealPlayer {
  firstName: string;
  lastName: string;
  position: string;
  eligibility: string;
  homeState: string;
  hometown: string;
  jerseyNumber: number;
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
  clutch: number;
  vsLHP: number;
  grit: number;
  stealing: number;
  running: number;
  throwing: number;
  recovery: number;
  wRISP: number;
  vsLefty: number;
  poise: number;
  heater: number;
  agile: number;
  abilities: string[];
  potential: string;
  catcherAbility: number | null;
  pitchFB: number;
  pitch2S: number;
  pitchSL: number;
  pitchCB: number;
  pitchCH: number;
  pitchCT: number;
  pitchSNK: number;
  pitchSPL: number;
  bats?: string;
  throws?: string;
  batHand?: string;
  throwHand?: string;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
  trajectory?: number;
  overall?: number;
  starRating?: number;
}

interface TeamMeta {
  name: string;
  mascot: string;
  abbreviation: string;
  prestige: number;
  nationalRank: number;
  conference: string;
  primaryColor: string;
  secondaryColor: string;
}

interface ConferenceGroup {
  conference: string;
  teams: TeamMeta[];
}

interface TeamRosterResponse {
  name: string;
  conference: string;
  prestige: number;
  nationalRank: number;
  primaryColor: string;
  secondaryColor: string;
  players: RealPlayer[];
}

const CONF_META: Record<string, { primaryColor: string; secondaryColor: string; abbr: string }> = {
  "SEC":             { primaryColor: "#004B8D", secondaryColor: "#F1B82D", abbr: "SEC" },
  "ACC":             { primaryColor: "#003087", secondaryColor: "#A7C4E0", abbr: "ACC" },
  "Big 12":          { primaryColor: "#003366", secondaryColor: "#FF6600", abbr: "B12" },
  "Big Ten":         { primaryColor: "#0052A2", secondaryColor: "#E8000D", abbr: "B10" },
  "Pac-12":          { primaryColor: "#1A3A6A", secondaryColor: "#78BE21", abbr: "P12" },
  "AAC":             { primaryColor: "#00285E", secondaryColor: "#F7941D", abbr: "AAC" },
  "Sun Belt":        { primaryColor: "#00396B", secondaryColor: "#C8102E", abbr: "SUN" },
  "WCC":             { primaryColor: "#002147", secondaryColor: "#B5985A", abbr: "WCC" },
  "Big West":        { primaryColor: "#002B5C", secondaryColor: "#FF6600", abbr: "BW"  },
  "Missouri Valley": { primaryColor: "#003087", secondaryColor: "#D4AF37", abbr: "MVC" },
  "Ivy League":      { primaryColor: "#006747", secondaryColor: "#C89211", abbr: "IVY" },
  "HBCU":            { primaryColor: "#800020", secondaryColor: "#FFD700", abbr: "HBCU"},
};

const PITCHER_POS = new Set(["P", "SP", "RP", "CP", "CL"]);
function isPitcher(pos: string) { return PITCHER_POS.has(pos); }

function ovrToStars(ovr: number): number {
  if (ovr >= 500) return 5;
  if (ovr >= 400) return 4;
  if (ovr >= 300) return 3;
  if (ovr >= 200) return 2;
  return 1;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-2.5 h-2.5 ${i <= stars ? "fill-gold text-gold" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function ovrColor(ovr: number): string {
  if (ovr >= 500) return "text-yellow-400 font-bold";
  if (ovr >= 400) return "text-green-400 font-bold";
  if (ovr >= 300) return "text-foreground";
  if (ovr >= 200) return "text-muted-foreground";
  return "text-red-400/70";
}

function AbilityBadge({ name }: { name: string }) {
  const ability = ALL_ABILITIES.find(a => a.name === name);
  const tier = ability?.tier ?? "blue";
  const cls = tier === "gold"
    ? "bg-yellow-600/20 text-yellow-400 border-yellow-600/30"
    : tier === "red"
    ? "bg-red-600/20 text-red-400 border-red-600/30"
    : "bg-blue-600/20 text-blue-400 border-blue-600/30";
  return (
    <Badge variant="outline" className={`text-[8px] px-1 py-0 ${cls}`}>{name}</Badge>
  );
}

function EditableStatCell({
  value,
  playerIdx,
  field,
  onUpdate,
}: {
  value: number;
  playerIdx: number;
  field: keyof RealPlayer;
  onUpdate: (idx: number, field: keyof RealPlayer, v: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const n = Math.max(1, Math.min(99, Number(draft) || value));
    onUpdate(playerIdx, field, n);
    setEditing(false);
  };

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={1}
        max={99}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setDraft(String(value)); }
        }}
        onClick={e => e.stopPropagation()}
        className="w-10 h-6 text-[11px] text-center bg-muted/60 border border-gold/50 rounded focus:outline-none focus:border-gold text-foreground"
        data-testid={`input-stat-${field}-${playerIdx}`}
      />
    );
  }

  return (
    <span
      className="cursor-text text-xs text-muted-foreground hover:text-gold hover:underline decoration-dotted underline-offset-2 select-none"
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      title={`Click to edit ${String(field)}`}
      data-testid={`cell-stat-${String(field)}-${playerIdx}`}
    >
      {value}
    </span>
  );
}

function realPlayerToPlayer(player: RealPlayer, idx: number, teamName: string): Player {
  const ovr = player.overall ?? calculateOVR(player);
  return {
    id: `${teamName}-${player.firstName}-${player.lastName}-${idx}`,
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position,
    jerseyNumber: player.jerseyNumber,
    eligibility: player.eligibility,
    hometown: player.hometown,
    homeState: player.homeState,
    overall: ovr,
    starRating: player.starRating ?? ovrToStars(ovr),
    potential: null,
    hitForAvg: player.hitForAvg,
    power: player.power,
    speed: player.speed,
    arm: player.arm,
    fielding: player.fielding,
    errorResistance: player.errorResistance,
    velocity: player.velocity,
    control: player.control,
    stamina: player.stamina,
    clutch: player.clutch,
    vsLHP: player.vsLHP,
    grit: player.grit,
    stealing: player.stealing,
    running: player.running,
    throwing: player.throwing,
    recovery: player.recovery,
    catcherAbility: player.catcherAbility,
    wRISP: player.wRISP,
    vsLefty: player.vsLefty,
    poise: player.poise,
    heater: player.heater,
    agile: player.agile,
    trajectory: player.trajectory,
    pitchFB: player.pitchFB,
    pitch2S: player.pitch2S,
    pitchSL: player.pitchSL,
    pitchCB: player.pitchCB,
    pitchCH: player.pitchCH,
    pitchCT: player.pitchCT,
    pitchSNK: player.pitchSNK,
    pitchSPL: player.pitchSPL,
    bats: player.bats || player.batHand,
    throws: player.throws || player.throwHand,
    abilities: player.abilities,
    skinTone: player.skinTone,
    hairColor: player.hairColor,
    hairStyle: player.hairStyle,
    facialHair: player.facialHair,
  } as Player;
}

// ── Mobile Compare Sheet ──────────────────────────────────────────────────────

const PITCHER_COMPARE_STATS: { key: keyof RealPlayer; label: string }[] = [
  { key: "velocity", label: "Velo" },
  { key: "control", label: "Ctrl" },
  { key: "stamina", label: "Stam" },
  { key: "poise", label: "Poise" },
];

const FIELDER_COMPARE_STATS: { key: keyof RealPlayer; label: string }[] = [
  { key: "hitForAvg", label: "Hit" },
  { key: "power", label: "Pwr" },
  { key: "speed", label: "Spd" },
  { key: "arm", label: "Arm" },
  { key: "fielding", label: "Fld" },
];

const COMMON_COMPARE_STATS: { key: keyof RealPlayer; label: string }[] = [
  { key: "clutch", label: "Clutch" },
  { key: "grit", label: "Grit" },
];

function CompareStatRow({
  label,
  valA,
  valB,
}: {
  label: string;
  valA: number | null | undefined;
  valB: number | null | undefined;
}) {
  const a = valA ?? 0;
  const b = valB ?? 0;
  const aBetter = a > b;
  const bBetter = b > a;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 py-1">
      <span className={`text-xs text-right font-medium tabular-nums ${aBetter ? "text-green-400" : bBetter ? "text-muted-foreground" : "text-foreground"}`}>
        {valA ?? "—"}
      </span>
      <span className="text-[9px] text-muted-foreground text-center w-14 uppercase tracking-wider">{label}</span>
      <span className={`text-xs text-left font-medium tabular-nums ${bBetter ? "text-green-400" : aBetter ? "text-muted-foreground" : "text-foreground"}`}>
        {valB ?? "—"}
      </span>
    </div>
  );
}

function MobileCompareSheet({
  playerA,
  playerB,
  idxA,
  idxB,
  open,
  onClose,
}: {
  playerA: RealPlayer;
  playerB: RealPlayer;
  idxA: number;
  idxB: number;
  open: boolean;
  onClose: () => void;
}) {
  const ovrA = playerA.overall ?? calculateOVR(playerA);
  const ovrB = playerB.overall ?? calculateOVR(playerB);
  const starsA = playerA.starRating ?? ovrToStars(ovrA);
  const starsB = playerB.starRating ?? ovrToStars(ovrB);

  const positionStats = (isPitcher(playerA.position) || isPitcher(playerB.position))
    ? PITCHER_COMPARE_STATS
    : FIELDER_COMPARE_STATS;

  const abilitiesA = playerA.abilities ?? [];
  const abilitiesB = playerB.abilities ?? [];
  const allAbilities = Array.from(new Set([...abilitiesA, ...abilitiesB]));

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[80vh] overflow-y-auto rounded-t-xl border-gold/30 bg-background p-0"
        data-testid="sheet-player-compare"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Player Comparison</SheetTitle>
          <SheetDescription>Side-by-side stats for two selected players</SheetDescription>
        </SheetHeader>

        {/* Header bar */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCompare className="w-3.5 h-3.5 text-gold" />
            <span className="font-pixel text-gold text-[10px] uppercase tracking-wider">Compare</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-gold p-1" data-testid="button-close-compare">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Player name headers */}
        <div className="grid grid-cols-2 border-b border-border">
          <div className="px-4 py-3 border-r border-border/50" data-testid={`compare-player-a-${idxA}`}>
            <p className="text-sm font-semibold text-foreground leading-tight truncate">{playerA.firstName} {playerA.lastName}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge variant="outline" className="text-[8px] px-1 py-0">{playerA.position}</Badge>
              <span className="text-[9px] text-muted-foreground">{playerA.eligibility}</span>
            </div>
            <StarRating stars={starsA} />
          </div>
          <div className="px-4 py-3" data-testid={`compare-player-b-${idxB}`}>
            <p className="text-sm font-semibold text-foreground leading-tight truncate">{playerB.firstName} {playerB.lastName}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge variant="outline" className="text-[8px] px-1 py-0">{playerB.position}</Badge>
              <span className="text-[9px] text-muted-foreground">{playerB.eligibility}</span>
            </div>
            <StarRating stars={starsB} />
          </div>
        </div>

        <div className="px-4 py-3 space-y-1">
          {/* OVR */}
          <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-wider mb-2">Overall</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 pb-2 border-b border-border/30">
            <span className={`text-lg font-bold text-right tabular-nums ${ovrColor(ovrA)} ${ovrA > ovrB ? "text-green-400" : ""}`}>{ovrA}</span>
            <span className="text-[9px] text-muted-foreground text-center w-14 uppercase tracking-wider">OVR</span>
            <span className={`text-lg font-bold text-left tabular-nums ${ovrColor(ovrB)} ${ovrB > ovrA ? "text-green-400" : ""}`}>{ovrB}</span>
          </div>

          {/* Position-specific stats */}
          <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-wider mt-3 mb-1">
            {isPitcher(playerA.position) || isPitcher(playerB.position) ? "Pitching" : "Batting & Defense"}
          </p>
          {positionStats.map(({ key, label }) => (
            <CompareStatRow
              key={key}
              label={label}
              valA={(playerA as Record<string, unknown>)[key] as number | null}
              valB={(playerB as Record<string, unknown>)[key] as number | null}
            />
          ))}

          {/* Common stats */}
          <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-wider mt-3 mb-1">Mental</p>
          {COMMON_COMPARE_STATS.map(({ key, label }) => (
            <CompareStatRow
              key={key}
              label={label}
              valA={(playerA as Record<string, unknown>)[key] as number | null}
              valB={(playerB as Record<string, unknown>)[key] as number | null}
            />
          ))}

          {/* Abilities */}
          {allAbilities.length > 0 && (
            <>
              <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-wider mt-3 mb-2">Special Abilities</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {allAbilities.map(name => {
                  const hasA = abilitiesA.includes(name);
                  const hasB = abilitiesB.includes(name);
                  return (
                    <div key={name} className="contents">
                      <div className={`flex justify-end ${hasA ? "" : "opacity-20"}`}>
                        <AbilityBadge name={name} />
                      </div>
                      <div className={`flex justify-start ${hasB ? "" : "opacity-20"}`}>
                        <AbilityBadge name={name} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Action footer */}
        <div className="px-4 pb-6 pt-2 flex gap-2">
          <RetroButton variant="outline" size="sm" className="flex-1" onClick={onClose} data-testid="button-compare-done">
            Done
          </RetroButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const PENDING_SAVE_KEY = "roster-viewer-pending-save";

interface PendingSave {
  teamName: string;
  edits: Record<number, Partial<RealPlayer>>;
  timestamp: number;
}

type MobileStep = "conference" | "team" | "roster";

export default function RosterViewerPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const swipeTouchStart = useRef<{ x: number; y: number } | null>(null);

  const [search, setSearch] = useState("");
  const [selectedConference, setSelectedConference] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedPlayerIdx, setSelectedPlayerIdx] = useState<number | null>(null);
  const [mobileStep, setMobileStep] = useState<MobileStep>("conference");

  const [editedPlayers, setEditedPlayers] = useState<Record<number, Partial<RealPlayer>>>({});

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveRosterName, setSaveRosterName] = useState("");
  const [saveRosterDesc, setSaveRosterDesc] = useState("");
  const [navGuardOpen, setNavGuardOpen] = useState(false);
  const [pendingNavTarget, setPendingNavTarget] = useState<string | null>(null);
  const [autoSavePending, setAutoSavePending] = useState(false);

  // Compare mode state
  const [comparePlayerIdx, setComparePlayerIdx] = useState<number | null>(null);
  const [compareSheetOpen, setCompareSheetOpen] = useState(false);
  const [compareSecondIdx, setCompareSecondIdx] = useState<number | null>(null);

  const hasChanges = Object.keys(editedPlayers).length > 0;

  const { data: user } = useQuery<{ id: string; email: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: conferences, isLoading: confsLoading } = useQuery<ConferenceGroup[]>({
    queryKey: ["/api/ncaa-rosters"],
  });

  const { data: teamData, isLoading: rosterLoading } = useQuery<TeamRosterResponse>({
    queryKey: ["/api/ncaa-rosters", encodeURIComponent(selectedTeam)],
    enabled: !!selectedTeam,
  });

  const { data: scoutingMap } = useQuery<Record<string, TeamScoutingInfo>>({
    queryKey: ["/api/team-templates/scouting"],
    enabled: !!selectedTeam,
  });

  const scoutingInfo = selectedTeam && scoutingMap ? scoutingMap[selectedTeam] ?? null : null;

  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string; basedOn: string; rosterData: RealPlayer[] }) => {
      const res = await apiRequest("POST", "/api/saved-rosters", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-rosters"] });
      setSaveDialogOpen(false);
      setSaveRosterName("");
      setSaveRosterDesc("");
      setEditedPlayers({});
      setAutoSavePending(false);
      localStorage.removeItem(PENDING_SAVE_KEY);
      toast({ title: "Roster Saved", description: "Custom roster saved to your account." });
    },
    onError: (err: Error) => toast({ title: "Save Failed", description: parseErrorMessage(err), variant: "destructive" }),
  });

  useEffect(() => {
    if (user === undefined || !user) return;
    const raw = localStorage.getItem(PENDING_SAVE_KEY);
    if (!raw) return;
    try {
      const pending: PendingSave = JSON.parse(raw);
      if (Date.now() - pending.timestamp > 60 * 60 * 1000) {
        localStorage.removeItem(PENDING_SAVE_KEY);
        return;
      }
      setSelectedTeam(pending.teamName);
      setEditedPlayers(pending.edits);
      setAutoSavePending(true);
    } catch {
      localStorage.removeItem(PENDING_SAVE_KEY);
    }
  }, [user]);

  useEffect(() => {
    if (autoSavePending && teamData && user) setSaveDialogOpen(true);
  }, [autoSavePending, teamData, user]);

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  const currentRoster = useMemo(() => {
    if (!teamData?.players) return [];
    return teamData.players.map((p, idx) => {
      const edits = editedPlayers[idx];
      if (!edits) return p;
      // Clear server-cached overall/starRating so the client recalculates OVR
      // from the edited attributes instead of showing a stale server value.
      const { overall: _o, starRating: _s, ...rest } = { ...p, ...edits };
      return rest as typeof p;
    });
  }, [teamData, editedPlayers]);

  const filteredConferences = useMemo(() => {
    if (!conferences) return [];
    if (!search) return conferences;
    const q = search.toLowerCase();
    return conferences
      .map(g => ({ ...g, teams: g.teams.filter(t => t.name.toLowerCase().includes(q) || t.abbreviation.toLowerCase().includes(q)) }))
      .filter(g => g.teams.length > 0);
  }, [conferences, search]);

  const selectedConfTeams = useMemo(() => {
    if (!selectedConference) return [];
    return filteredConferences.find(g => g.conference === selectedConference)?.teams ?? [];
  }, [selectedConference, filteredConferences]);

  const selectedTeamMeta = useMemo(() => {
    if (!conferences) return null;
    for (const g of conferences) {
      const found = g.teams.find(t => t.name === selectedTeam);
      if (found) return found;
    }
    return null;
  }, [conferences, selectedTeam]);

  const updatePlayerField = (idx: number, field: keyof RealPlayer, value: unknown) => {
    setEditedPlayers(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
  };

  const handleReset = () => setEditedPlayers({});

  const handleConfSelect = (conf: string) => {
    if (conf === selectedConference) {
      if (isMobile) setMobileStep("team");
      return;
    }
    if (hasChanges) {
      setPendingNavTarget(`__conf__${conf}`);
      setNavGuardOpen(true);
      return;
    }
    setSelectedConference(conf);
    setSelectedTeam("");
    setSelectedPlayerIdx(null);
    if (isMobile) setMobileStep("team");
  };

  const resetCompareState = () => {
    setComparePlayerIdx(null);
    setCompareSecondIdx(null);
    setCompareSheetOpen(false);
  };

  const handleTeamSelect = (conf: string, teamName: string) => {
    if (hasChanges && teamName !== selectedTeam) {
      setPendingNavTarget(`__team__${conf}|||${teamName}`);
      setNavGuardOpen(true);
      return;
    }
    setSelectedConference(conf);
    setSelectedTeam(teamName);
    setEditedPlayers({});
    setSelectedPlayerIdx(null);
    resetCompareState();
    if (isMobile) setMobileStep("roster");
  };

  const handleBackToConfs = () => {
    if (hasChanges) {
      setPendingNavTarget("__back__");
      setNavGuardOpen(true);
      return;
    }
    setSelectedConference("");
    setSelectedTeam("");
    setSelectedPlayerIdx(null);
    resetCompareState();
    if (isMobile) setMobileStep("conference");
  };

  const handleMobileBackToTeams = () => {
    if (hasChanges) {
      setPendingNavTarget("__mobile_back_team__");
      setNavGuardOpen(true);
      return;
    }
    setSelectedTeam("");
    setSelectedPlayerIdx(null);
    resetCompareState();
    setMobileStep("team");
  };

  const confirmNavigation = () => {
    setNavGuardOpen(false);
    setEditedPlayers({});
    resetCompareState();
    if (!pendingNavTarget) return;
    if (pendingNavTarget.startsWith("__conf__")) {
      const conf = pendingNavTarget.slice(8);
      setSelectedConference(conf);
      setSelectedTeam("");
      setSelectedPlayerIdx(null);
      if (isMobile) setMobileStep("team");
    } else if (pendingNavTarget.startsWith("__team__")) {
      const [conf, teamName] = pendingNavTarget.slice(8).split("|||");
      setSelectedConference(conf);
      setSelectedTeam(teamName);
      setSelectedPlayerIdx(null);
      if (isMobile) setMobileStep("roster");
    } else if (pendingNavTarget === "__back__") {
      setSelectedConference("");
      setSelectedTeam("");
      setSelectedPlayerIdx(null);
      if (isMobile) setMobileStep("conference");
    } else if (pendingNavTarget === "__mobile_back_team__") {
      setSelectedTeam("");
      setSelectedPlayerIdx(null);
      setMobileStep("team");
    } else {
      setLocation(pendingNavTarget);
    }
    setPendingNavTarget(null);
  };

  const redirectToLoginWithPendingEdits = () => {
    if (selectedTeam) {
      localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify({
        teamName: selectedTeam,
        edits: editedPlayers,
        timestamp: Date.now(),
      } as PendingSave));
    }
    setLocation("/login?redirect=/roster-viewer");
  };

  const handleSave = () => {
    if (!user) { redirectToLoginWithPendingEdits(); return; }
    if (!saveRosterName.trim()) {
      toast({ title: "Name Required", description: "Please enter a name for the roster.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      name: saveRosterName.trim(),
      description: saveRosterDesc.trim(),
      basedOn: selectedTeam,
      rosterData: currentRoster,
    });
  };

  const selectedPlayer = selectedPlayerIdx !== null && currentRoster[selectedPlayerIdx]
    ? realPlayerToPlayer(currentRoster[selectedPlayerIdx], selectedPlayerIdx, selectedTeam)
    : null;

  // Mobile breadcrumb text for header
  const mobileBreadcrumb = useMemo(() => {
    if (mobileStep === "team" && selectedConference) return selectedConference;
    if (mobileStep === "roster" && selectedTeamMeta) return `${selectedConference} › ${selectedTeamMeta.name}`;
    return null;
  }, [mobileStep, selectedConference, selectedTeamMeta]);

  // Conference picker grid (shared between mobile and desktop sidebar)
  function ConferenceGrid({ cols = 3 }: { cols?: number }) {
    const colClass = cols === 4 ? "grid-cols-4" : "grid-cols-3";
    return (
      <div className={`grid ${colClass} gap-2`}>
        {(conferences ?? []).map(group => {
          const meta = CONF_META[group.conference];
          const isSelected = selectedConference === group.conference;
          return (
            <button
              key={group.conference}
              onClick={() => handleConfSelect(group.conference)}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all focus:outline-none ${isSelected ? "border-gold bg-gold/10 ring-1 ring-gold/40" : "border-border/40 hover:border-gold/40 bg-background/30"}`}
              data-testid={`button-conf-${group.conference.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${isSelected ? "border-gold shadow-[0_0_8px_rgba(212,175,55,0.4)]" : "border-border/50"}`}
                style={{ backgroundColor: meta?.primaryColor ?? "#333" }}
              >
                <span className="font-pixel text-[7px] leading-none text-center px-0.5" style={{ color: meta?.secondaryColor ?? "#fff" }}>
                  {meta?.abbr ?? group.conference}
                </span>
              </div>
              <span className={`font-pixel text-[7px] text-center leading-tight truncate w-full ${isSelected ? "text-gold" : "text-muted-foreground"}`}>
                {meta?.abbr ?? group.conference}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Team picker grid (shared between mobile and desktop sidebar)
  function TeamGrid({ teams, conferenceName }: { teams: TeamMeta[]; conferenceName: string }) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 gap-2">
        {teams.map(team => {
          const isSel = selectedTeam === team.name;
          return (
            <button
              key={team.name}
              onClick={() => handleTeamSelect(conferenceName, team.name)}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all focus:outline-none ${isSel ? "border-gold bg-gold/10 ring-1 ring-gold/40" : "border-border/40 hover:border-gold/40 bg-background/30"}`}
              data-testid={`button-team-${team.name.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <div className="relative">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${isSel ? "border-gold shadow-[0_0_8px_rgba(212,175,55,0.4)]" : "border-border/50"}`}
                  style={{ backgroundColor: team.primaryColor || "#333" }}
                >
                  <span className="font-pixel text-[7px] leading-none text-center px-0.5" style={{ color: team.secondaryColor || "#fff" }}>
                    {team.abbreviation}
                  </span>
                </div>
                {team.nationalRank > 0 && (
                  <span className="absolute bottom-0 left-0 font-pixel text-[6px] leading-none px-0.5 py-px rounded-sm bg-black/75 text-gold pointer-events-none">
                    #{team.nationalRank}
                  </span>
                )}
              </div>
              <span className={`font-pixel text-[7px] text-center leading-tight truncate w-full ${isSel ? "text-gold" : "text-muted-foreground"}`}>
                {team.name.length > 10 ? team.abbreviation : team.name}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Search result list (sidebar / mobile search)
  function SearchResultList({ results }: { results: TeamMeta[] }) {
    return (
      <div className="space-y-0.5">
        {results.map(team => {
          const isSel = selectedTeam === team.name;
          return (
            <button
              key={team.name}
              onClick={() => handleTeamSelect(team.conference, team.name)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${isSel ? "bg-gold/10 text-gold" : "hover:bg-muted/20 text-foreground/80"}`}
              data-testid={`button-team-${team.name.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <TeamBadge abbreviation={team.abbreviation} primaryColor={team.primaryColor || "#333"} secondaryColor={team.secondaryColor || "#fff"} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">{team.name}</p>
                <p className="text-[9px] text-muted-foreground">{team.conference}</p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // Position-aware stat columns shown on each mobile row
  function MobileStatCols({ player, idx }: { player: RealPlayer; idx: number }) {
    const pitching = isPitcher(player.position);
    const cols = pitching
      ? [
          { field: "velocity" as keyof RealPlayer, label: "VELO", value: player.velocity },
          { field: "control" as keyof RealPlayer, label: "CTRL", value: player.control },
          { field: "stuff" as keyof RealPlayer, label: "STUF", value: player.stuff },
        ]
      : [
          { field: "hitForAvg" as keyof RealPlayer, label: "CON", value: player.hitForAvg },
          { field: "power" as keyof RealPlayer, label: "PWR", value: player.power },
          { field: "speed" as keyof RealPlayer, label: "SPD", value: player.speed },
        ];
    return (
      <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
        {cols.map(col => (
          <div key={col.label} className="text-center min-w-[28px]">
            <EditableStatCell value={col.value as number} playerIdx={idx} field={col.field} onUpdate={updatePlayerField} />
            <p className="text-[8px] text-muted-foreground mt-0.5">{col.label}</p>
          </div>
        ))}
      </div>
    );
  }

  // Mobile roster list (card rows, no wide table)
  function MobileRosterList() {
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTriggeredRef = useRef(false);

    function handleRowTouchStart(idx: number) {
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        // Enter compare mode with this player as the first selection
        setComparePlayerIdx(idx);
        setCompareSecondIdx(null);
        setCompareSheetOpen(false);
      }, 500);
    }

    function handleRowTouchEnd() {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    function handleRowClick(idx: number) {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      if (comparePlayerIdx !== null) {
        if (idx === comparePlayerIdx) {
          // Tapping the already-selected compare player cancels compare mode
          setComparePlayerIdx(null);
          setCompareSecondIdx(null);
        } else {
          // Tapping a second player opens the comparison sheet
          setCompareSecondIdx(idx);
          setCompareSheetOpen(true);
        }
        return;
      }
      setSelectedPlayerIdx(idx);
    }

    if (rosterLoading) {
      return (
        <div className="p-4 space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      );
    }
    if (!teamData) return null;

    const inCompareMode = comparePlayerIdx !== null;

    return (
      <>
        {/* Compare mode banner */}
        {inCompareMode && (
          <div className="sticky top-0 z-10 bg-gold/10 border-b border-gold/30 px-4 py-2 flex items-center justify-between gap-2" data-testid="banner-compare-mode">
            <div className="flex items-center gap-2">
              <GitCompare className="w-3 h-3 text-gold shrink-0" />
              <span className="text-[10px] font-pixel text-gold">
                {comparePlayerIdx !== null && currentRoster[comparePlayerIdx]
                  ? `${currentRoster[comparePlayerIdx].firstName} ${currentRoster[comparePlayerIdx].lastName} selected — tap another player to compare`
                  : "Tap a player to compare"}
              </span>
            </div>
            <button
              onClick={() => { setComparePlayerIdx(null); setCompareSecondIdx(null); }}
              className="text-muted-foreground hover:text-gold p-1"
              data-testid="button-cancel-compare"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="divide-y divide-border/50">
          {currentRoster.map((player, idx) => {
            const ovr = player.overall ?? calculateOVR(player);
            const stars = player.starRating ?? ovrToStars(ovr);
            const isEdited = !!editedPlayers[idx];
            const isCompareSelected = idx === comparePlayerIdx;
            const isCompareHighlight = inCompareMode && !isCompareSelected;

            return (
              <div
                key={`mrow-${idx}`}
                className={`flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors
                  ${isCompareSelected ? "bg-gold/15 ring-1 ring-inset ring-gold/40" : ""}
                  ${isCompareHighlight ? "active:bg-gold/10" : "active:bg-gold/5"}
                  ${isEdited && !isCompareSelected ? "bg-yellow-500/5" : ""}
                `}
                onClick={() => handleRowClick(idx)}
                onTouchStart={() => handleRowTouchStart(idx)}
                onTouchEnd={handleRowTouchEnd}
                onTouchCancel={handleRowTouchEnd}
                data-testid={`row-player-mobile-${idx}`}
              >
                {/* Jersey # */}
                <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">{player.jerseyNumber}</span>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isEdited && !isCompareSelected && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />}
                    {isCompareSelected && <GitCompare className="w-3 h-3 text-gold shrink-0" />}
                    <span className={`text-sm font-medium truncate ${isCompareSelected ? "text-gold" : "text-foreground"}`}>
                      {player.firstName} {player.lastName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[8px] px-1 py-0">{player.position}</Badge>
                    <span className="text-[9px] text-muted-foreground">{player.eligibility}</span>
                    <StarRating stars={stars} />
                  </div>
                </div>

                {/* OVR */}
                <div className="text-center shrink-0">
                  <span className={`text-sm ${ovrColor(ovr)}`} data-testid={`text-ovr-mobile-${idx}`}>{ovr}</span>
                  <p className="text-[9px] text-muted-foreground">OVR</p>
                </div>

                {/* 3 position-aware editable stats */}
                <MobileStatCols player={player} idx={idx} />
              </div>
            );
          })}
          {currentRoster.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-12" data-testid="text-no-roster">No roster data found for {selectedTeam}</p>
          )}
        </div>

        {/* Compare bottom sheet */}
        {compareSheetOpen && comparePlayerIdx !== null && compareSecondIdx !== null
          && currentRoster[comparePlayerIdx] && currentRoster[compareSecondIdx] && (
          <MobileCompareSheet
            playerA={currentRoster[comparePlayerIdx]}
            playerB={currentRoster[compareSecondIdx]}
            idxA={comparePlayerIdx}
            idxB={compareSecondIdx}
            open={compareSheetOpen}
            onClose={() => {
              setCompareSheetOpen(false);
              setComparePlayerIdx(null);
              setCompareSecondIdx(null);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back button — on mobile goes back a step, on desktop goes home */}
            <button
              onClick={() => {
                if (isMobile && mobileStep === "roster") {
                  handleMobileBackToTeams();
                } else if (isMobile && mobileStep === "team") {
                  handleBackToConfs();
                } else {
                  if (hasChanges) { setPendingNavTarget("/"); setNavGuardOpen(true); }
                  else setLocation("/");
                }
              }}
              className="text-muted-foreground hover:text-gold transition-colors shrink-0"
              data-testid="button-back-home"
            >
              {isMobile && mobileStep !== "conference" ? (
                <ChevronLeft className="w-5 h-5" />
              ) : (
                <ArrowLeft className="w-5 h-5" />
              )}
            </button>

            {/* Title / breadcrumb */}
            {isMobile && mobileBreadcrumb ? (
              <span className="font-pixel text-gold text-xs truncate" data-testid="text-mobile-breadcrumb">
                {mobileBreadcrumb}
              </span>
            ) : (
              <h1 className="font-pixel text-gold text-xs sm:text-sm truncate" data-testid="text-page-title">
                NCAA 2026 ROSTER VIEWER
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasChanges && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500 hidden sm:flex" data-testid="badge-unsaved">
                Unsaved edits
              </Badge>
            )}
            {hasChanges && (
              <RetroButton variant="outline" size="sm" onClick={handleReset} data-testid="button-reset">
                <RotateCcw className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Reset</span>
              </RetroButton>
            )}
            <RetroButton
              size="sm"
              onClick={() => {
                if (!user) { redirectToLoginWithPendingEdits(); return; }
                setSaveDialogOpen(true);
              }}
              disabled={!selectedTeam || !teamData}
              data-testid="button-save-roster"
            >
              {user
                ? <><Save className="w-3 h-3 mr-1" />Save</>
                : <><LogIn className="w-3 h-3 mr-1" />Sign In</>
              }
            </RetroButton>
          </div>
        </div>
      </header>

      {/* ── MOBILE LAYOUT (< md) ── */}
      <div
        className="flex-1 md:hidden overflow-auto"
        onTouchStart={e => {
          const t = e.touches[0];
          swipeTouchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={e => {
          if (!swipeTouchStart.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - swipeTouchStart.current.x;
          const dy = Math.abs(t.clientY - swipeTouchStart.current.y);
          swipeTouchStart.current = null;
          if (dx >= 70 && dy <= 40) {
            if (mobileStep === "roster") {
              handleMobileBackToTeams();
            } else if (mobileStep === "team") {
              handleBackToConfs();
            }
          }
        }}
      >
        {/* Step: Conference */}
        {mobileStep === "conference" && (
          <div className="animate-in fade-in slide-in-from-left-4 duration-200 p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search teams..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  if (e.target.value) setSelectedConference("");
                }}
                data-testid="input-team-search-mobile"
              />
            </div>

            {confsLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : search ? (
              <>
                <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-wider">Results</p>
                <SearchResultList results={filteredConferences.flatMap(g => g.teams)} />
              </>
            ) : (
              <>
                <p className="font-pixel text-[9px] text-muted-foreground uppercase tracking-wider">Select a Conference</p>
                <ConferenceGrid cols={4} />
              </>
            )}
          </div>
        )}

        {/* Step: Team */}
        {mobileStep === "team" && selectedConference && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-200 p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={`Search ${selectedConference} teams...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-team-search-mobile-team"
              />
            </div>
            <p className="font-pixel text-[9px] text-gold uppercase tracking-wider">Choose a Team</p>
            {confsLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : search ? (
              <SearchResultList results={selectedConfTeams.filter(t =>
                t.name.toLowerCase().includes(search.toLowerCase()) ||
                t.abbreviation.toLowerCase().includes(search.toLowerCase())
              )} />
            ) : (
              <TeamGrid teams={selectedConfTeams} conferenceName={selectedConference} />
            )}
          </div>
        )}

        {/* Step: Roster */}
        {mobileStep === "roster" && selectedTeam && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-200">
            {/* Team header */}
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                {selectedTeamMeta && teamData && (
                  <TeamBadge
                    abbreviation={selectedTeamMeta.abbreviation}
                    primaryColor={teamData.primaryColor || selectedTeamMeta.primaryColor}
                    secondaryColor={teamData.secondaryColor || selectedTeamMeta.secondaryColor}
                    size="md"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {teamData ? (
                    <>
                      <h2 className="font-pixel text-gold text-sm truncate" data-testid="text-team-header">{teamData.name}</h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">{teamData.conference}</span>
                        <span className="text-[10px] text-muted-foreground">Rank #{teamData.nationalRank}</span>
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5,6,7,8,9,10].map(i => (
                            <div key={i} className={`w-2 h-2 rounded-sm ${i <= teamData.prestige ? "bg-gold" : "bg-muted/30"}`} />
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <Skeleton className="h-5 w-40" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{currentRoster.length} players</span>
              </div>
              {!rosterLoading && teamData && (
                <p className="text-[9px] text-muted-foreground mt-2">Tap for profile · long-press to compare · tap stat to edit</p>
              )}
            </div>

            {scoutingInfo && (
              <div className="px-4 py-3 border-b border-border/40 animate-in fade-in duration-200">
                <TeamScoutingPanel teamName={selectedTeam} info={scoutingInfo} />
              </div>
            )}

            <MobileRosterList />
          </div>
        )}
      </div>

      {/* ── DESKTOP LAYOUT (≥ md) ── */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 shrink-0 border-r border-border overflow-y-auto bg-background/50 flex flex-col" data-testid="sidebar-teams">
          <div className="p-3 border-b border-border sticky top-0 bg-background z-10">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="h-7 pl-7 text-xs"
                placeholder="Search teams..."
                value={search}
                onChange={e => { setSearch(e.target.value); if (e.target.value) setSelectedConference(""); }}
                data-testid="input-team-search"
              />
            </div>
          </div>

          {confsLoading ? (
            <div className="p-3 space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Conference grid (not searching) */}
              {!search && (
                <div className="p-3 border-b border-border/50">
                  <p className="font-pixel text-[9px] text-muted-foreground uppercase mb-2 tracking-wider">Conferences</p>
                  <ConferenceGrid cols={3} />
                </div>
              )}

              {/* Team picker */}
              {(selectedConference || search) && (
                <div className="p-3">
                  {selectedConference && !search && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <button onClick={handleBackToConfs} className="text-muted-foreground hover:text-gold transition-colors" data-testid="button-back-to-confs">
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <p className="font-pixel text-[9px] text-gold uppercase tracking-wider">{selectedConference}</p>
                    </div>
                  )}
                  {search && <p className="font-pixel text-[9px] text-muted-foreground uppercase mb-2 tracking-wider">Results</p>}

                  {search ? (
                    <SearchResultList results={filteredConferences.flatMap(g => g.teams)} />
                  ) : (
                    <TeamGrid teams={selectedConfTeams} conferenceName={selectedConference} />
                  )}
                </div>
              )}

              {!selectedConference && !search && (
                <div className="p-4 text-center">
                  <p className="text-[10px] text-muted-foreground">Select a conference above</p>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {!selectedTeam && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 p-8">
                <div className="text-4xl">⚾</div>
                <p className="font-pixel text-gold text-sm">SELECT A TEAM</p>
                <p className="text-muted-foreground text-sm">Choose a conference, then a team to view their 2026 roster</p>
              </div>
            </div>
          )}

          {selectedTeam && rosterLoading && (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-64 mb-4" />
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          )}

          {selectedTeam && !rosterLoading && teamData && (
            <div>
              {/* Team Header */}
              <div className="border-b border-border px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  {selectedTeamMeta && (
                    <TeamBadge
                      abbreviation={selectedTeamMeta.abbreviation}
                      primaryColor={teamData.primaryColor || selectedTeamMeta.primaryColor}
                      secondaryColor={teamData.secondaryColor || selectedTeamMeta.secondaryColor}
                      size="md"
                    />
                  )}
                  <div>
                    <h2 className="font-pixel text-gold text-base" data-testid="text-team-header">{teamData.name}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{teamData.conference}</span>
                      <span className="text-xs text-muted-foreground">Rank #{teamData.nationalRank}</span>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5,6,7,8,9,10].map(i => (
                          <div key={i} className={`w-2.5 h-2.5 rounded-sm ${i <= teamData.prestige ? "bg-gold" : "bg-muted/30"}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{currentRoster.length} players</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground hidden sm:block">Click row for full profile · click a stat to edit inline</p>
              </div>

              {/* Scouting Panel */}
              {scoutingInfo && (
                <div className="px-6 py-3 border-b border-border/40 animate-in fade-in duration-200">
                  <TeamScoutingPanel teamName={selectedTeam} info={scoutingInfo} />
                </div>
              )}

              {/* Roster Table — horizontally scrollable */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-roster">
                  <thead className="bg-muted/30 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">#</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">NAME</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">POS</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">ELIG</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">STARS</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">OVR</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">CON</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">PWR</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">SPD</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">ARM</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">FLD</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">VELO</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">CTRL</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">STUF</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap">STAM</th>
                      <th className="px-2 py-2 text-left text-[10px] font-pixel text-gold whitespace-nowrap min-w-[120px]">ABILITIES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRoster.map((player, idx) => {
                      const ovr = player.overall ?? calculateOVR(player);
                      const stars = player.starRating ?? ovrToStars(ovr);
                      const pitching = isPitcher(player.position);
                      const isEdited = !!editedPlayers[idx];
                      return (
                        <tr
                          key={`row-${idx}`}
                          className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-gold/5 ${isEdited ? "bg-yellow-500/5" : idx % 2 === 0 ? "" : "bg-muted/5"}`}
                          onClick={() => setSelectedPlayerIdx(idx)}
                          data-testid={`row-player-${idx}`}
                        >
                          <td className="px-2 py-1.5 text-muted-foreground text-xs">{player.jerseyNumber}</td>
                          <td className="px-2 py-1.5 text-foreground whitespace-nowrap text-xs">
                            <div className="flex items-center gap-1.5">
                              {isEdited && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />}
                              {player.firstName} {player.lastName}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className="text-[9px] px-1">{player.position}</Badge>
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground text-xs">{player.eligibility}</td>
                          <td className="px-2 py-1.5"><StarRating stars={stars} /></td>
                          <td className={`px-2 py-1.5 text-xs ${ovrColor(ovr)}`} data-testid={`text-ovr-${idx}`}>{ovr}</td>

                          <td className="px-2 py-1.5">
                            {pitching ? <span className="text-xs text-muted-foreground/40">—</span> : (
                              <EditableStatCell value={player.hitForAvg} playerIdx={idx} field="hitForAvg" onUpdate={updatePlayerField} />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {pitching ? <span className="text-xs text-muted-foreground/40">—</span> : (
                              <EditableStatCell value={player.power} playerIdx={idx} field="power" onUpdate={updatePlayerField} />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableStatCell value={player.speed} playerIdx={idx} field="speed" onUpdate={updatePlayerField} />
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableStatCell value={player.arm} playerIdx={idx} field="arm" onUpdate={updatePlayerField} />
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableStatCell value={player.fielding} playerIdx={idx} field="fielding" onUpdate={updatePlayerField} />
                          </td>
                          <td className="px-2 py-1.5">
                            {!pitching ? <span className="text-xs text-muted-foreground/40">—</span> : (
                              <EditableStatCell value={player.velocity} playerIdx={idx} field="velocity" onUpdate={updatePlayerField} />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {!pitching ? <span className="text-xs text-muted-foreground/40">—</span> : (
                              <EditableStatCell value={player.control} playerIdx={idx} field="control" onUpdate={updatePlayerField} />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {!pitching ? <span className="text-xs text-muted-foreground/40">—</span> : (
                              <EditableStatCell value={player.stuff} playerIdx={idx} field="stuff" onUpdate={updatePlayerField} />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {!pitching ? <span className="text-xs text-muted-foreground/40">—</span> : (
                              <EditableStatCell value={player.stamina} playerIdx={idx} field="stamina" onUpdate={updatePlayerField} />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-wrap gap-0.5 max-w-[180px]">
                              {(player.abilities || []).slice(0, 3).map(ab => <AbilityBadge key={ab} name={ab} />)}
                              {(player.abilities || []).length > 3 && (
                                <Badge variant="outline" className="text-[8px] px-1 text-muted-foreground">
                                  +{player.abilities.length - 3}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {currentRoster.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <p className="text-muted-foreground text-sm" data-testid="text-no-roster">No roster data found for {selectedTeam}</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Player Profile Card */}
      {selectedPlayer && (
        <PlayerProfileCard
          player={selectedPlayer}
          open={selectedPlayerIdx !== null}
          onClose={() => setSelectedPlayerIdx(null)}
          teamPrimaryColor={teamData?.primaryColor || selectedTeamMeta?.primaryColor}
          onUpdate={(field, value) => {
            if (selectedPlayerIdx !== null) {
              updatePlayerField(selectedPlayerIdx, field as keyof RealPlayer, value);
            }
          }}
        />
      )}

      {/* Save Roster Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Save Custom Roster</DialogTitle>
            <DialogDescription>
              Save the current {selectedTeam} roster (with any stat edits) to your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="font-pixel text-[10px] text-foreground uppercase">Roster Name</label>
              <Input
                value={saveRosterName}
                onChange={e => setSaveRosterName(e.target.value)}
                placeholder={`${selectedTeam} Custom Roster`}
                data-testid="input-roster-name"
              />
            </div>
            <div className="space-y-1">
              <label className="font-pixel text-[10px] text-foreground uppercase">Description (optional)</label>
              <Input
                value={saveRosterDesc}
                onChange={e => setSaveRosterDesc(e.target.value)}
                placeholder="Description of changes..."
                data-testid="input-roster-desc"
              />
            </div>
            <div className="flex justify-end gap-2">
              <RetroButton variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)} data-testid="button-cancel-save">Cancel</RetroButton>
              <RetroButton size="sm" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-confirm-save">
                <Save className="w-3 h-3 mr-1" />
                {saveMutation.isPending ? "Saving..." : "Save"}
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nav Guard Dialog */}
      <Dialog open={navGuardOpen} onOpenChange={setNavGuardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Unsaved Changes</DialogTitle>
            <DialogDescription>You have unsaved roster edits. Do you want to save them before leaving?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {user ? (
              <RetroButton onClick={() => { setNavGuardOpen(false); setSaveDialogOpen(true); }} data-testid="button-navguard-save">
                <Save className="w-3 h-3 mr-2" />Save Changes
              </RetroButton>
            ) : (
              <RetroButton onClick={() => { setNavGuardOpen(false); redirectToLoginWithPendingEdits(); }} data-testid="button-navguard-login">
                <LogIn className="w-3 h-3 mr-2" />Sign In to Save
              </RetroButton>
            )}
            <RetroButton variant="outline" onClick={confirmNavigation} data-testid="button-navguard-discard">Discard Changes</RetroButton>
            <RetroButton variant="ghost" onClick={() => { setNavGuardOpen(false); setPendingNavTarget(null); }} data-testid="button-navguard-cancel">Cancel</RetroButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
