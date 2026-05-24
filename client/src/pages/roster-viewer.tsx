import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, RotateCcw, Star, Search, LogIn, ChevronLeft } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { calculateOVR, ALL_ABILITIES } from "@shared/abilities";
import { parseErrorMessage } from "@/lib/errorUtils";
import { TeamBadge } from "@/components/ui/team-badge";
import { PlayerProfileCard, type Player } from "@/components/player-profile-card";

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

const PITCHER_POS = new Set(["P", "SP", "RP", "CP", "CL"]);
function isPitcher(pos: string) { return PITCHER_POS.has(pos); }

function realPlayerToPlayer(player: RealPlayer, idx: number, teamName: string): Player {
  const ovr = calculateOVR(player);
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
    starRating: ovrToStars(ovr),
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
    bats: player.bats || player.batHand,
    throws: player.throws || player.throwHand,
    abilities: player.abilities,
    skinTone: player.skinTone,
    hairColor: player.hairColor,
    hairStyle: player.hairStyle,
    facialHair: player.facialHair,
    pitchFB: player.pitchFB,
    pitchSL: player.pitchSL,
    pitchCB: player.pitchCB,
    pitchCH: player.pitchCH,
    pitchCT: player.pitchCT,
    pitch2S: player.pitch2S,
    pitchSNK: player.pitchSNK,
    pitchSPL: player.pitchSPL,
  } as Player;
}

const PENDING_SAVE_KEY = "roster-viewer-pending-save";

interface PendingSave {
  teamName: string;
  timestamp: number;
}

export default function RosterViewerPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedConference, setSelectedConference] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedPlayerIdx, setSelectedPlayerIdx] = useState<number | null>(null);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveRosterName, setSaveRosterName] = useState("");
  const [saveRosterDesc, setSaveRosterDesc] = useState("");
  const [autoSavePending, setAutoSavePending] = useState(false);

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
      setAutoSavePending(false);
      localStorage.removeItem(PENDING_SAVE_KEY);
      toast({ title: "Roster Saved", description: "Custom roster saved to your account." });
    },
    onError: (err: Error) => toast({ title: "Save Failed", description: parseErrorMessage(err), variant: "destructive" }),
  });

  useEffect(() => {
    if (user === undefined) return;
    if (!user) return;
    const raw = localStorage.getItem(PENDING_SAVE_KEY);
    if (!raw) return;
    try {
      const pending: PendingSave = JSON.parse(raw);
      const ONE_HOUR = 60 * 60 * 1000;
      if (Date.now() - pending.timestamp > ONE_HOUR) {
        localStorage.removeItem(PENDING_SAVE_KEY);
        return;
      }
      setSelectedTeam(pending.teamName);
      setAutoSavePending(true);
    } catch {
      localStorage.removeItem(PENDING_SAVE_KEY);
    }
  }, [user]);

  useEffect(() => {
    if (autoSavePending && teamData && user) {
      setSaveDialogOpen(true);
    }
  }, [autoSavePending, teamData, user]);

  const currentRoster = useMemo(() => {
    return teamData?.players ?? [];
  }, [teamData]);

  const filteredConferences = useMemo(() => {
    if (!conferences) return [];
    if (!search) return conferences;
    const q = search.toLowerCase();
    return conferences.map(g => ({
      ...g,
      teams: g.teams.filter(t => t.name.toLowerCase().includes(q) || t.abbreviation.toLowerCase().includes(q)),
    })).filter(g => g.teams.length > 0);
  }, [conferences, search]);

  const selectedConfTeams = useMemo(() => {
    if (!selectedConference) return [];
    const group = filteredConferences.find(g => g.conference === selectedConference);
    return group?.teams ?? [];
  }, [selectedConference, filteredConferences]);

  const selectedTeamMeta = useMemo(() => {
    return selectedConfTeams.find(t => t.name === selectedTeam) ?? null;
  }, [selectedConfTeams, selectedTeam]);

  const handleConfSelect = (conf: string) => {
    if (conf === selectedConference) return;
    setSelectedConference(conf);
    setSelectedTeam("");
    setSelectedPlayerIdx(null);
  };

  const handleTeamSelect = (teamName: string) => {
    setSelectedTeam(teamName);
    setSelectedPlayerIdx(null);
  };

  const redirectToLoginWithPendingEdits = () => {
    if (selectedTeam) {
      localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify({
        teamName: selectedTeam,
        timestamp: Date.now(),
      } as PendingSave));
    }
    setLocation(`/login?redirect=/roster-viewer`);
  };

  const handleSave = () => {
    if (!user) {
      redirectToLoginWithPendingEdits();
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

  const selectedPlayer = selectedPlayerIdx !== null && currentRoster[selectedPlayerIdx]
    ? realPlayerToPlayer(currentRoster[selectedPlayerIdx], selectedPlayerIdx, selectedTeam)
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setLocation("/")} className="text-muted-foreground hover:text-gold transition-colors" data-testid="button-back-home">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-pixel text-gold text-sm" data-testid="text-page-title">NCAA 2026 ROSTER VIEWER</h1>
          </div>
          <div className="flex items-center gap-2">
            <RetroButton
              size="sm"
              onClick={() => {
                if (!user) {
                  redirectToLoginWithPendingEdits();
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
        {/* Left Sidebar: Conference + Team Picker */}
        <aside className="w-64 shrink-0 border-r border-border overflow-y-auto bg-background/50 flex flex-col" data-testid="sidebar-teams">
          {/* Search */}
          <div className="p-3 border-b border-border sticky top-0 bg-background z-10">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="h-7 pl-7 text-xs"
                placeholder="Search teams..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  if (selectedConference) setSelectedConference("");
                  setSelectedTeam("");
                }}
                data-testid="input-team-search"
              />
            </div>
          </div>

          {confsLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Conference picker */}
              {!search && (
                <div className="p-3 border-b border-border/50">
                  <p className="font-pixel text-[9px] text-muted-foreground uppercase mb-2 tracking-wider">Conferences</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(conferences ?? []).map(group => {
                      const meta = CONF_META[group.conference];
                      const isSelected = selectedConference === group.conference;
                      return (
                        <button
                          key={group.conference}
                          onClick={() => handleConfSelect(group.conference)}
                          className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all focus:outline-none ${
                            isSelected
                              ? "border-gold bg-gold/10 ring-1 ring-gold/40"
                              : "border-border/40 hover:border-gold/40 bg-background/30"
                          }`}
                          data-testid={`button-conf-${group.conference.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                              isSelected ? "border-gold shadow-[0_0_8px_rgba(212,175,55,0.4)]" : "border-border/50"
                            }`}
                            style={{ backgroundColor: meta?.primaryColor ?? "#333" }}
                          >
                            <span
                              className="font-pixel text-[7px] leading-none text-center px-0.5"
                              style={{ color: meta?.secondaryColor ?? "#fff" }}
                            >
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
                </div>
              )}

              {/* Team picker — shown when conference is selected or search active */}
              {(selectedConference || search) && (
                <div className="p-3">
                  {selectedConference && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <button
                        onClick={() => { setSelectedConference(""); setSelectedTeam(""); }}
                        className="text-muted-foreground hover:text-gold transition-colors"
                        data-testid="button-back-to-confs"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <p className="font-pixel text-[9px] text-gold uppercase tracking-wider">{selectedConference}</p>
                    </div>
                  )}
                  {search && (
                    <p className="font-pixel text-[9px] text-muted-foreground uppercase mb-2 tracking-wider">Results</p>
                  )}

                  {search ? (
                    /* Search results: flat team list */
                    <div className="space-y-0.5">
                      {filteredConferences.flatMap(g => g.teams).map(team => {
                        const isSelected = selectedTeam === team.name;
                        return (
                          <button
                            key={team.name}
                            onClick={() => { setSelectedConference(team.conference); handleTeamSelect(team.name); }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                              isSelected ? "bg-gold/10 text-gold" : "hover:bg-muted/20 text-foreground/80"
                            }`}
                            data-testid={`button-team-${team.name.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            <TeamBadge
                              abbreviation={team.abbreviation}
                              primaryColor={team.primaryColor || "#333"}
                              secondaryColor={team.secondaryColor || "#fff"}
                              size="sm"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs truncate">{team.name}</p>
                              <p className="text-[9px] text-muted-foreground">{team.conference}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    /* Conference team grid */
                    <div className="grid grid-cols-3 gap-2">
                      {selectedConfTeams.map(team => {
                        const isSelected = selectedTeam === team.name;
                        return (
                          <button
                            key={team.name}
                            onClick={() => handleTeamSelect(team.name)}
                            className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all focus:outline-none ${
                              isSelected
                                ? "border-gold bg-gold/10 ring-1 ring-gold/40"
                                : "border-border/40 hover:border-gold/40 bg-background/30"
                            }`}
                            data-testid={`button-team-${team.name.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                                isSelected ? "border-gold shadow-[0_0_8px_rgba(212,175,55,0.4)]" : "border-border/50"
                              }`}
                              style={{ backgroundColor: team.primaryColor || "#333" }}
                            >
                              <span
                                className="font-pixel text-[7px] leading-none text-center px-0.5"
                                style={{ color: team.secondaryColor || "#fff" }}
                              >
                                {team.abbreviation}
                              </span>
                            </div>
                            <span className={`font-pixel text-[7px] text-center leading-tight truncate w-full ${isSelected ? "text-gold" : "text-muted-foreground"}`}>
                              {team.name.length > 10 ? team.abbreviation : team.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state when no conf or search */}
              {!selectedConference && !search && (
                <div className="p-4 text-center">
                  <p className="text-[10px] text-muted-foreground">Select a conference above</p>
                </div>
              )}
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
                      primaryColor={selectedTeamMeta.primaryColor}
                      secondaryColor={selectedTeamMeta.secondaryColor}
                      size="md"
                    />
                  )}
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
                </div>
                <p className="text-[10px] text-muted-foreground hidden sm:block">Click a player to view their full profile</p>
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
                      return (
                        <tr
                          key={`row-${idx}`}
                          className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-gold/5 ${idx % 2 === 0 ? "" : "bg-muted/5"}`}
                          onClick={() => setSelectedPlayerIdx(idx)}
                          data-testid={`row-player-${idx}`}
                        >
                          <td className="px-2 py-1.5 text-muted-foreground text-xs">{player.jerseyNumber}</td>
                          <td className="px-2 py-1.5 text-foreground whitespace-nowrap text-xs">
                            {player.firstName} {player.lastName}
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
          teamPrimaryColor={selectedTeamMeta?.primaryColor}
        />
      )}

      {/* Save Roster Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold text-sm">Save Custom Roster</DialogTitle>
            <DialogDescription>
              Save the current {selectedTeam} roster to your account.
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
    </div>
  );
}
