import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, RotateCcw, Star, Search, ChevronDown, ChevronRight, Check, X, LogIn } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { calculateOVR, ALL_ABILITIES, getAbilitiesForPosition } from "@shared/abilities";
import { parseErrorMessage } from "@/lib/errorUtils";

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
}

interface TeamMeta {
  name: string;
  mascot: string;
  abbreviation: string;
  prestige: number;
  nationalRank: number;
  conference: string;
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
  players: RealPlayer[];
}

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

const POSITIONS = ["P", "SP", "RP", "CP", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"];
const PITCHER_POS = new Set(["P", "SP", "RP", "CP", "CL"]);

function isPitcher(pos: string) { return PITCHER_POS.has(pos); }

function PlayerEditPanel({ player, idx, onUpdate }: {
  player: RealPlayer;
  idx: number;
  onUpdate: (idx: number, field: keyof RealPlayer, value: unknown) => void;
}) {
  const isPitch = isPitcher(player.position);

  const numField = (label: string, field: keyof RealPlayer) => (
    <div className="space-y-0.5">
      <label className="text-[10px] text-muted-foreground uppercase font-pixel">{label}</label>
      <Input
        type="number"
        min={1}
        max={99}
        className="h-7 text-xs w-20"
        value={String(player[field] ?? "")}
        onChange={e => onUpdate(idx, field, Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
        data-testid={`input-${field}-${idx}`}
      />
    </div>
  );

  const abilities = player.abilities || [];
  const availableAbilities = getAbilitiesForPosition(player.position);

  const toggleAbility = (name: string) => {
    const updated = abilities.includes(name)
      ? abilities.filter(a => a !== name)
      : [...abilities, name];
    onUpdate(idx, "abilities", updated);
  };

  return (
    <div className="bg-muted/20 rounded p-4 space-y-4">
      <div className="flex flex-wrap gap-4">
        {!isPitch && (
          <>
            {numField("CON", "hitForAvg")}
            {numField("PWR", "power")}
            {numField("SPD", "speed")}
            {numField("ARM", "arm")}
            {numField("FLD", "fielding")}
            {numField("ERR", "errorResistance")}
          </>
        )}
        {isPitch && (
          <>
            {numField("VELO", "velocity")}
            {numField("CTRL", "control")}
            {numField("STUF", "stuff")}
            {numField("STAM", "stamina")}
            {numField("SPD", "speed")}
            {numField("FLD", "fielding")}
          </>
        )}
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground uppercase font-pixel mb-2 block">Abilities</label>
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {availableAbilities.map(ab => {
            const isSelected = abilities.includes(ab.name);
            const tierCls = ab.tier === "gold"
              ? "text-yellow-400 border-yellow-600/40"
              : ab.tier === "red"
              ? "text-red-400 border-red-600/40"
              : "text-blue-400 border-blue-600/40";
            return (
              <button
                key={ab.name}
                onClick={() => toggleAbility(ab.name)}
                className={`text-[9px] border rounded px-1.5 py-0.5 transition-colors ${tierCls} ${isSelected ? "opacity-100 ring-1 ring-offset-0" : "opacity-50 hover:opacity-80"}`}
                data-testid={`toggle-ability-${ab.name.replace(/\s+/g, "-").toLowerCase()}-${idx}`}
              >
                {isSelected && <Check className="inline w-2 h-2 mr-0.5" />}
                {ab.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function RosterViewerPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [expandedConfs, setExpandedConfs] = useState<Set<string>>(new Set(["SEC"]));
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [editedPlayers, setEditedPlayers] = useState<Record<number, Partial<RealPlayer>>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveRosterName, setSaveRosterName] = useState("");
  const [saveRosterDesc, setSaveRosterDesc] = useState("");

  const [navGuardOpen, setNavGuardOpen] = useState(false);
  const [pendingNavTarget, setPendingNavTarget] = useState<string | null>(null);

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
      toast({ title: "Roster Saved", description: "Custom roster saved to your account." });
    },
    onError: (err: Error) => toast({ title: "Save Failed", description: parseErrorMessage(err), variant: "destructive" }),
  });

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  const currentRoster = useMemo(() => {
    if (!teamData?.players) return [];
    return teamData.players.map((player, idx) => {
      const edits = editedPlayers[idx];
      return edits ? { ...player, ...edits } : player;
    });
  }, [teamData, editedPlayers]);

  const filteredConferences = useMemo(() => {
    if (!conferences) return [];
    if (!search) return conferences;
    const q = search.toLowerCase();
    return conferences.map(g => ({
      ...g,
      teams: g.teams.filter(t => t.name.toLowerCase().includes(q) || t.abbreviation.toLowerCase().includes(q)),
    })).filter(g => g.teams.length > 0);
  }, [conferences, search]);

  const updatePlayerField = (idx: number, field: keyof RealPlayer, value: unknown) => {
    setEditedPlayers(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
  };

  const handleReset = () => {
    setEditedPlayers({});
    setExpandedRow(null);
  };

  const handleTeamSelect = (teamName: string) => {
    if (hasChanges) {
      setPendingNavTarget(`__team__${teamName}`);
      setNavGuardOpen(true);
      return;
    }
    setSelectedTeam(teamName);
    setEditedPlayers({});
    setExpandedRow(null);
  };

  const safeNavigate = (path: string) => {
    if (hasChanges) {
      setPendingNavTarget(path);
      setNavGuardOpen(true);
    } else {
      setLocation(path);
    }
  };

  const confirmNavigation = () => {
    setNavGuardOpen(false);
    if (!pendingNavTarget) return;
    if (pendingNavTarget.startsWith("__team__")) {
      const teamName = pendingNavTarget.slice(8);
      setSelectedTeam(teamName);
      setEditedPlayers({});
      setExpandedRow(null);
    } else {
      setLocation(pendingNavTarget);
    }
    setPendingNavTarget(null);
  };

  const handleSave = () => {
    if (!user) {
      setLocation(`/login?redirect=/roster-viewer`);
      return;
    }
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

  const toggleConf = (conf: string) => {
    setExpandedConfs(prev => {
      const next = new Set(prev);
      if (next.has(conf)) next.delete(conf);
      else next.add(conf);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => safeNavigate("/")} className="text-muted-foreground hover:text-gold transition-colors" data-testid="button-back-home">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-pixel text-gold text-sm" data-testid="text-page-title">NCAA 2026 ROSTER VIEWER</h1>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500 hidden sm:flex" data-testid="badge-unsaved">
                Unsaved edits
              </Badge>
            )}
            {hasChanges && (
              <RetroButton variant="outline" size="sm" onClick={handleReset} data-testid="button-reset">
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </RetroButton>
            )}
            <RetroButton
              size="sm"
              onClick={() => {
                if (!user) {
                  setLocation(`/login?redirect=/roster-viewer`);
                  return;
                }
                setSaveDialogOpen(true);
              }}
              disabled={!selectedTeam || !teamData}
              data-testid="button-save-roster"
            >
              {user ? (
                <><Save className="w-3 h-3 mr-1" />Save Roster</>
              ) : (
                <><LogIn className="w-3 h-3 mr-1" />Sign In to Save</>
              )}
            </RetroButton>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Team Browser */}
        <aside className="w-56 shrink-0 border-r border-border overflow-y-auto bg-background/50" data-testid="sidebar-teams">
          <div className="p-3 border-b border-border sticky top-0 bg-background z-10">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="h-7 pl-7 text-xs"
                placeholder="Search teams..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-team-search"
              />
            </div>
          </div>

          {confsLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : (
            <div>
              {filteredConferences.map(group => (
                <div key={group.conference}>
                  <button
                    onClick={() => toggleConf(group.conference)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/20 text-left"
                    data-testid={`conf-toggle-${group.conference}`}
                  >
                    <span className="font-pixel text-[9px] text-gold uppercase">{group.conference}</span>
                    {expandedConfs.has(group.conference)
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  </button>
                  {expandedConfs.has(group.conference) && (
                    <div>
                      {group.teams.map(team => (
                        <button
                          key={team.name}
                          onClick={() => handleTeamSelect(team.name)}
                          className={`w-full text-left px-4 py-1.5 text-xs transition-colors hover:bg-muted/30 ${selectedTeam === team.name ? "bg-gold/10 text-gold border-r-2 border-gold" : "text-foreground/80"}`}
                          data-testid={`button-team-${team.name.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          <span className="block truncate">{team.name}</span>
                          <span className="text-[9px] text-muted-foreground">#{team.nationalRank}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Main Content: Roster Table */}
        <main className="flex-1 overflow-auto">
          {!selectedTeam && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 p-8">
                <div className="text-4xl">⚾</div>
                <p className="font-pixel text-gold text-sm">SELECT A TEAM</p>
                <p className="text-muted-foreground text-sm">Choose a team from the sidebar to view their 2026 roster</p>
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
                <div>
                  <h2 className="font-pixel text-gold text-base" data-testid="text-team-header">{teamData.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">{teamData.conference}</span>
                    <span className="text-xs text-muted-foreground">Rank #{teamData.nationalRank}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                        <div key={i} className={`w-2.5 h-2.5 rounded-sm ${i <= teamData.prestige ? "bg-gold" : "bg-muted/30"}`} />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">{currentRoster.length} players</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!user && (
                    <Link href={`/login?redirect=/roster-viewer`}>
                      <RetroButton variant="outline" size="sm" data-testid="button-login-to-save">
                        <LogIn className="w-3 h-3 mr-1" /> Sign In to Save
                      </RetroButton>
                    </Link>
                  )}
                </div>
              </div>

              {/* Roster Table */}
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
                      const ovr = calculateOVR(player);
                      const stars = ovrToStars(ovr);
                      const pitching = isPitcher(player.position);
                      const isExpanded = expandedRow === idx;
                      const isEdited = !!editedPlayers[idx];
                      return (
                        <>
                          <tr
                            key={`row-${idx}`}
                            className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/20 ${isEdited ? "bg-yellow-500/5" : idx % 2 === 0 ? "" : "bg-muted/5"}`}
                            onClick={() => setExpandedRow(isExpanded ? null : idx)}
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
                            <td className="px-2 py-1.5">
                              <StarRating stars={stars} />
                            </td>
                            <td className={`px-2 py-1.5 text-xs ${ovrColor(ovr)}`} data-testid={`text-ovr-${idx}`}>{ovr}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{pitching ? "—" : player.hitForAvg}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{pitching ? "—" : player.power}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{player.speed}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{player.arm}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{player.fielding}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{pitching ? player.velocity : "—"}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{pitching ? player.control : "—"}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{pitching ? player.stuff : "—"}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{pitching ? player.stamina : "—"}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex flex-wrap gap-0.5 max-w-[180px]">
                                {(player.abilities || []).slice(0, 3).map(ab => (
                                  <AbilityBadge key={ab} name={ab} />
                                ))}
                                {(player.abilities || []).length > 3 && (
                                  <Badge variant="outline" className="text-[8px] px-1 text-muted-foreground">
                                    +{player.abilities.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`edit-${idx}`} className="bg-card/80 border-b border-border">
                              <td colSpan={16} className="p-4">
                                <PlayerEditPanel
                                  player={player}
                                  idx={idx}
                                  onUpdate={updatePlayerField}
                                />
                              </td>
                            </tr>
                          )}
                        </>
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

      {/* Save Roster Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Save Custom Roster</DialogTitle>
            <DialogDescription>
              Save the current {selectedTeam} roster (with your edits) to your account.
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
              <RetroButton variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)} data-testid="button-cancel-save">
                Cancel
              </RetroButton>
              <RetroButton size="sm" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-confirm-save">
                <Save className="w-3 h-3 mr-1" />
                {saveMutation.isPending ? "Saving..." : "Save"}
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Navigation Guard Dialog */}
      <Dialog open={navGuardOpen} onOpenChange={setNavGuardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved roster edits. Do you want to save them before leaving?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {user ? (
              <RetroButton
                onClick={() => {
                  setNavGuardOpen(false);
                  setSaveDialogOpen(true);
                }}
                data-testid="button-navguard-save"
              >
                <Save className="w-3 h-3 mr-2" />
                Save Changes
              </RetroButton>
            ) : (
              <RetroButton
                onClick={() => {
                  setNavGuardOpen(false);
                  setLocation("/login?redirect=/roster-viewer");
                }}
                data-testid="button-navguard-login"
              >
                <LogIn className="w-3 h-3 mr-2" />
                Sign In to Save
              </RetroButton>
            )}
            <RetroButton
              variant="outline"
              onClick={confirmNavigation}
              data-testid="button-navguard-discard"
            >
              Discard Changes
            </RetroButton>
            <RetroButton
              variant="ghost"
              onClick={() => { setNavGuardOpen(false); setPendingNavTarget(null); }}
              data-testid="button-navguard-cancel"
            >
              Cancel
            </RetroButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
