import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, RotateCcw, Download, Upload, Trash2 } from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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

interface ConferenceTeams {
  conference: string;
  teams: string[];
}

interface SavedRoster {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  basedOn: string;
  rosterData: unknown;
  createdAt: string | null;
  updatedAt: string | null;
}

function calcOVR(player: RealPlayer): number {
  if (player.position === "P") {
    return Math.round((player.velocity * 2 + player.control * 2 + player.stuff * 2 + player.stamina + player.poise + player.recovery + player.heater) / 10 * 10);
  }
  return Math.round((player.hitForAvg * 2 + player.power * 2 + player.speed + player.fielding + player.arm + player.clutch + player.grit + player.running) / 10 * 10);
}

export default function ManageRostersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedConference, setSelectedConference] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [editedPlayers, setEditedPlayers] = useState<Record<number, Partial<RealPlayer>>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveRosterName, setSaveRosterName] = useState("");
  const [saveRosterDesc, setSaveRosterDesc] = useState("");

  const { data: user } = useQuery<{ id: string; email: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: conferences, isLoading: conferencesLoading } = useQuery<ConferenceTeams[]>({
    queryKey: ["/api/conference-teams"],
  });

  const { data: defaultRoster, isLoading: rosterLoading } = useQuery<RealPlayer[]>({
    queryKey: ["/api/default-roster", encodeURIComponent(selectedTeam)],
    enabled: !!selectedTeam,
  });

  const { data: savedRosters } = useQuery<SavedRoster[]>({
    queryKey: ["/api/saved-rosters"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user,
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
    onError: (err: Error) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/saved-rosters/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-rosters"] });
      toast({ title: "Roster Deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    },
  });

  const teamsForConference = useMemo(() => {
    if (!conferences || !selectedConference) return [];
    const conf = conferences.find(c => c.conference === selectedConference);
    return conf?.teams || [];
  }, [conferences, selectedConference]);

  const currentRoster = useMemo(() => {
    if (!defaultRoster) return [];
    return defaultRoster.map((player, idx) => {
      const edits = editedPlayers[idx];
      if (!edits) return player;
      return { ...player, ...edits };
    });
  }, [defaultRoster, editedPlayers]);

  const hasChanges = Object.keys(editedPlayers).length > 0;

  const updatePlayerField = (idx: number, field: keyof RealPlayer, value: unknown) => {
    setEditedPlayers(prev => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        [field]: value,
      },
    }));
  };

  const handleReset = () => {
    setEditedPlayers({});
    toast({ title: "Reset to Default", description: "All edits have been discarded." });
  };

  const handleSave = () => {
    if (!saveRosterName.trim()) {
      toast({ title: "Name Required", description: "Please enter a name for the roster.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      name: saveRosterName.trim(),
      description: saveRosterDesc.trim(),
      basedOn: selectedTeam || "NCAA 2026",
      rosterData: currentRoster,
    });
  };

  const handleLoadSavedRoster = (rosterId: string) => {
    const roster = savedRosters?.find(r => r.id === rosterId);
    if (!roster) return;
    const data = roster.rosterData as Record<string, RealPlayer[]>;
    const teamName = roster.basedOn;
    if (teamName && data) {
      const players = Array.isArray(data) ? data : [];
      if (players.length > 0) {
        const edits: Record<number, Partial<RealPlayer>> = {};
        players.forEach((p, idx) => {
          edits[idx] = p;
        });
        setEditedPlayers(edits);
        toast({ title: "Roster Loaded", description: `Loaded "${roster.name}"` });
      }
    }
  };

  const handleConferenceChange = (conf: string) => {
    setSelectedConference(conf);
    setSelectedTeam("");
    setEditedPlayers({});
    setExpandedRow(null);
  };

  const handleTeamChange = (team: string) => {
    setSelectedTeam(team);
    setEditedPlayers({});
    setExpandedRow(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <RetroCard className="max-w-md w-full text-center">
          <RetroCardHeader>
            <h1 className="font-pixel text-gold text-lg" data-testid="text-login-gate">MANAGE ROSTERS</h1>
          </RetroCardHeader>
          <RetroCardContent>
            <p className="text-muted-foreground mb-6">
              Sign in to browse, edit, and save custom NCAA 2026 rosters.
            </p>
            <Link href="/login">
              <RetroButton data-testid="link-login">Sign In</RetroButton>
            </Link>
          </RetroCardContent>
        </RetroCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/">
              <RetroButton variant="outline" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Home
              </RetroButton>
            </Link>
            <h1 className="font-pixel text-xl text-gold" data-testid="text-page-title">MANAGE ROSTERS</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasChanges && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500" data-testid="badge-unsaved">
                Unsaved edits
              </Badge>
            )}
            <RetroButton
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges}
              data-testid="button-reset"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Default
            </RetroButton>
            <RetroButton
              size="sm"
              onClick={() => setSaveDialogOpen(true)}
              disabled={!selectedTeam || !defaultRoster}
              data-testid="button-save-roster"
            >
              <Save className="w-4 h-4 mr-2" />
              Save as Custom Roster
            </RetroButton>
          </div>
        </div>

        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <label className="font-pixel text-[10px] text-gold uppercase">Conference</label>
            <Select value={selectedConference} onValueChange={handleConferenceChange}>
              <SelectTrigger className="w-48" data-testid="select-conference">
                <SelectValue placeholder="Select conference" />
              </SelectTrigger>
              <SelectContent>
                {conferencesLoading ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : (
                  conferences?.map(c => (
                    <SelectItem key={c.conference} value={c.conference}>{c.conference}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="font-pixel text-[10px] text-gold uppercase">Team</label>
            <Select value={selectedTeam} onValueChange={handleTeamChange} disabled={!selectedConference}>
              <SelectTrigger className="w-56" data-testid="select-team">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {teamsForConference.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {savedRosters && savedRosters.length > 0 && (
            <div className="space-y-1">
              <label className="font-pixel text-[10px] text-gold uppercase">Load Saved Roster</label>
              <div className="flex items-center gap-2">
                <Select onValueChange={handleLoadSavedRoster}>
                  <SelectTrigger className="w-56" data-testid="select-load-roster">
                    <SelectValue placeholder="Select saved roster" />
                  </SelectTrigger>
                  <SelectContent>
                    {savedRosters.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name} ({r.basedOn})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {savedRosters && savedRosters.length > 0 && (
          <RetroCard>
            <RetroCardHeader>
              <h2 className="font-pixel text-gold text-sm">SAVED ROSTERS</h2>
            </RetroCardHeader>
            <RetroCardContent>
              <div className="flex flex-wrap gap-2">
                {savedRosters.map(r => (
                  <div key={r.id} className="flex items-center gap-2 bg-muted/30 border border-border px-3 py-2 rounded-md" data-testid={`saved-roster-${r.id}`}>
                    <span className="text-sm text-foreground">{r.name}</span>
                    <Badge variant="outline" className="text-muted-foreground text-[10px]">{r.basedOn}</Badge>
                    <RetroButton
                      variant="ghost"
                      size="icon"
                      onClick={() => handleLoadSavedRoster(r.id)}
                      data-testid={`button-load-${r.id}`}
                    >
                      <Download className="w-3 h-3" />
                    </RetroButton>
                    <RetroButton
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(r.id)}
                      data-testid={`button-delete-${r.id}`}
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </RetroButton>
                  </div>
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>
        )}

        {!selectedTeam && (
          <RetroCard className="text-center py-12">
            <p className="text-muted-foreground font-pixel text-xs" data-testid="text-select-team-prompt">
              Select a conference and team to view the roster
            </p>
          </RetroCard>
        )}

        {selectedTeam && rosterLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[500px] w-full" />
          </div>
        )}

        {selectedTeam && !rosterLoading && currentRoster.length > 0 && (
          <RetroCard className="p-0">
            <RetroCardHeader className="p-4">
              <h2 className="font-pixel text-gold" data-testid="text-team-name">{selectedTeam} Roster</h2>
              <span className="text-muted-foreground text-xs ml-2">({currentRoster.length} players)</span>
            </RetroCardHeader>
            <RetroCardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-roster">
                  <thead className="bg-muted/30 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">#</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">NAME</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">POS</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">ELIG</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">OVR</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">CON</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">PWR</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">SPD</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">ARM</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">FLD</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">VELO</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">CTRL</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">STUF</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">STAM</th>
                      <th className="px-2 py-2 text-left text-xs font-pixel text-gold whitespace-nowrap">POT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRoster.map((player, idx) => {
                      const ovr = calcOVR(player);
                      const isPitcher = player.position === "P";
                      const isExpanded = expandedRow === idx;
                      const isEdited = !!editedPlayers[idx];
                      return (
                        <>
                          <tr
                            key={`row-${idx}`}
                            className={`border-b border-border cursor-pointer ${isEdited ? "bg-yellow-500/10" : idx % 2 === 0 ? "bg-muted/10" : ""}`}
                            onClick={() => setExpandedRow(isExpanded ? null : idx)}
                            data-testid={`row-player-${idx}`}
                          >
                            <td className="px-2 py-1.5 text-muted-foreground text-xs">{player.jerseyNumber}</td>
                            <td className="px-2 py-1.5 text-foreground whitespace-nowrap">
                              {player.firstName} {player.lastName}
                            </td>
                            <td className="px-2 py-1.5">
                              <Badge variant="outline" className="text-[10px]">{player.position}</Badge>
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground text-xs">{player.eligibility}</td>
                            <td className="px-2 py-1.5 font-bold text-foreground">{ovr}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{isPitcher ? "-" : player.hitForAvg}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{isPitcher ? "-" : player.power}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{player.speed}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{player.arm}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{player.fielding}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{isPitcher ? player.velocity : "-"}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{isPitcher ? player.control : "-"}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{isPitcher ? player.stuff : "-"}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{isPitcher ? player.stamina : "-"}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">{player.potential}</td>
                          </tr>
                          {isExpanded && (
                            <tr key={`edit-${idx}`} className="bg-card border-b border-border">
                              <td colSpan={15} className="p-4">
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
            </RetroCardContent>
          </RetroCard>
        )}

        {selectedTeam && !rosterLoading && currentRoster.length === 0 && (
          <RetroCard className="text-center py-12">
            <p className="text-muted-foreground" data-testid="text-no-roster">No roster data found for {selectedTeam}</p>
          </RetroCard>
        )}
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-pixel text-gold">Save Custom Roster</DialogTitle>
            <DialogDescription>
              Save the current roster (with your edits) as a custom roster set.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="font-pixel text-[10px] text-foreground uppercase">Roster Name</label>
              <Input
                value={saveRosterName}
                onChange={(e) => setSaveRosterName(e.target.value)}
                placeholder="My Custom Roster"
                data-testid="input-roster-name"
              />
            </div>
            <div className="space-y-1">
              <label className="font-pixel text-[10px] text-foreground uppercase">Description (optional)</label>
              <Input
                value={saveRosterDesc}
                onChange={(e) => setSaveRosterDesc(e.target.value)}
                placeholder="Description of changes..."
                data-testid="input-roster-desc"
              />
            </div>
            <div className="flex justify-end gap-2">
              <RetroButton variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)} data-testid="button-cancel-save">
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-confirm-save"
              >
                <Upload className="w-4 h-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Roster"}
              </RetroButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlayerEditPanel({
  player,
  idx,
  onUpdate,
}: {
  player: RealPlayer;
  idx: number;
  onUpdate: (idx: number, field: keyof RealPlayer, value: unknown) => void;
}) {
  const isPitcher = player.position === "P";

  const NumField = ({ field, label, disabled }: { field: keyof RealPlayer; label: string; disabled?: boolean }) => (
    <div className="space-y-0.5">
      <label className="font-pixel text-[8px] text-gold uppercase">{label}</label>
      <Input
        type="number"
        min={1}
        max={100}
        className="h-7 w-16 text-xs"
        value={(player[field] as number) || ""}
        onChange={(e) => onUpdate(idx, field, parseInt(e.target.value) || 0)}
        disabled={disabled}
        data-testid={`input-${field}-${idx}`}
      />
    </div>
  );

  const TextInput = ({ field, label, className: cls }: { field: keyof RealPlayer; label: string; className?: string }) => (
    <div className="space-y-0.5">
      <label className="font-pixel text-[8px] text-gold uppercase">{label}</label>
      <Input
        className={`h-7 text-xs ${cls || "w-28"}`}
        value={(player[field] as string) || ""}
        onChange={(e) => onUpdate(idx, field, e.target.value)}
        data-testid={`input-${field}-${idx}`}
      />
    </div>
  );

  return (
    <div className="space-y-4" data-testid={`panel-edit-${idx}`}>
      <div className="flex items-center gap-4 flex-wrap">
        <TextInput field="firstName" label="First Name" />
        <TextInput field="lastName" label="Last Name" />
        <div className="space-y-0.5">
          <label className="font-pixel text-[8px] text-gold uppercase">Position</label>
          <Select
            value={player.position}
            onValueChange={(v) => onUpdate(idx, "position", v)}
          >
            <SelectTrigger className="h-7 w-16 text-xs" data-testid={`select-position-${idx}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "DH"].map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-0.5">
          <label className="font-pixel text-[8px] text-gold uppercase">Eligibility</label>
          <Select
            value={player.eligibility}
            onValueChange={(v) => onUpdate(idx, "eligibility", v)}
          >
            <SelectTrigger className="h-7 w-16 text-xs" data-testid={`select-eligibility-${idx}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["FR", "SO", "JR", "SR", "RS"].map(e => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NumField field="jerseyNumber" label="Jersey #" />
        <TextInput field="hometown" label="Hometown" />
        <TextInput field="homeState" label="State" className="w-12" />
      </div>

      {isPitcher ? (
        <>
          <div>
            <p className="font-pixel text-[10px] text-gold mb-2">PITCHING ATTRIBUTES</p>
            <div className="flex items-center gap-3 flex-wrap">
              <NumField field="velocity" label="Velocity" />
              <NumField field="control" label="Control" />
              <NumField field="stuff" label="Stuff" />
              <NumField field="stamina" label="Stamina" />
              <NumField field="poise" label="Poise" />
              <NumField field="recovery" label="Recovery" />
              <NumField field="heater" label="Heater" />
            </div>
          </div>
          <div>
            <p className="font-pixel text-[10px] text-gold mb-2">PITCH MIX</p>
            <div className="flex items-center gap-3 flex-wrap">
              <NumField field="pitchFB" label="FB" />
              <NumField field="pitch2S" label="2S" />
              <NumField field="pitchSL" label="SL" />
              <NumField field="pitchCB" label="CB" />
              <NumField field="pitchCH" label="CH" />
              <NumField field="pitchCT" label="CT" />
              <NumField field="pitchSNK" label="SNK" />
              <NumField field="pitchSPL" label="SPL" />
            </div>
          </div>
        </>
      ) : (
        <div>
          <p className="font-pixel text-[10px] text-gold mb-2">HITTING / FIELDING ATTRIBUTES</p>
          <div className="flex items-center gap-3 flex-wrap">
            <NumField field="hitForAvg" label="Contact" />
            <NumField field="power" label="Power" />
            <NumField field="speed" label="Speed" />
            <NumField field="arm" label="Arm" />
            <NumField field="fielding" label="Fielding" />
            <NumField field="errorResistance" label="Error Res" />
          </div>
        </div>
      )}

      <div>
        <p className="font-pixel text-[10px] text-gold mb-2">SECONDARY ATTRIBUTES</p>
        <div className="flex items-center gap-3 flex-wrap">
          <NumField field="clutch" label="Clutch" />
          <NumField field="grit" label="Grit" />
          <NumField field="vsLHP" label="vs LHP" />
          <NumField field="stealing" label="Stealing" />
          <NumField field="running" label="Running" />
          <NumField field="throwing" label="Throwing" />
          <NumField field="agile" label="Agile" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-muted-foreground text-[10px]">
          OVR: {calcOVR(player)}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground text-[10px]">
          Potential: {player.potential}
        </Badge>
      </div>
    </div>
  );
}
