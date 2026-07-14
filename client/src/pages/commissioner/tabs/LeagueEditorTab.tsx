import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ChevronRight, Copy, Check, RotateCcw, Save, X, AlertTriangle, Clock, User, Building2, Users } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { calculateOVR, getStarRatingFromOVR, ALL_ABILITIES } from "@shared/abilities";

// ── Types ────────────────────────────────────────────────────────────────────

interface EditorTeam {
  id: string; leagueId: string; conferenceId: string | null; conferenceName: string | null;
  name: string; mascot: string; abbreviation: string; city: string; state: string;
  primaryColor: string; secondaryColor: string;
  prestige: number; stadium: number; facilities: number; collegeLife: number;
  marketing: number; academics: number; fanbasePassion: string; fanbaseType: string;
  enrollment: number; nilBudget: number; nilSpent: number;
  isCpu: boolean; nationalRank: number; editorVersion: number;
}

interface EditorPlayer {
  id: string; teamId: string; teamName: string; teamAbbr: string;
  firstName: string; lastName: string; position: string; eligibility: string;
  jerseyNumber: number; homeState: string; hometown: string;
  overall: number; starRating: number; potential: number | null;
  throwHand: string; batHand: string;
  hitForAvg: number; power: number; speed: number; arm: number; fielding: number;
  errorResistance: number; clutch: number; vsLHP: number; grit: number;
  stealing: number; running: number; throwing: number; recovery: number; catcherAbility: number;
  velocity: number; control: number; stamina: number; stuff: number; wRISP: number;
  vsLefty: number; poise: number; heater: number; agile: number;
  pitchFB: number; pitch2S: number; pitchSL: number; pitchCB: number; pitchCH: number;
  pitchCT: number; pitchSNK: number; pitchSPL: number; pitchSHU: number; pitchCCH: number;
  pitchHSL: number; pitchSWP: number; pitchKN: number; pitchVSL: number; pitchSFF: number;
  pitchFK: number; pitchSCB: number; pitchPCB: number;
  abilities: string[]; editorVersion: number;
  skinTone: string; hairColor: string; hairStyle: string; facialHair: string;
}

interface EditChange {
  id: string; fieldName: string; beforeJson: unknown; afterJson: unknown;
}

interface EditBatch {
  id: string; leagueId: string; actorId: string; actorEmail: string | null;
  entityType: "team" | "player"; entityId: string; entityLabel: string | null;
  reason: string; effectiveSeason: number | null;
  isReversed: boolean; reversedByBatchId: string | null;
  createdAt: string; changes: EditChange[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ovrColor(ovr: number): string {
  if (ovr >= 500) return "text-yellow-400 font-bold";
  if (ovr >= 400) return "text-green-400";
  if (ovr >= 300) return "text-foreground";
  if (ovr >= 200) return "text-muted-foreground";
  return "text-red-400/70";
}

function starBadge(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(Math.max(0, 5 - stars));
}

function fieldLabel(f: string): string {
  const MAP: Record<string, string> = {
    name: "Name", mascot: "Mascot", abbreviation: "Abbrev", city: "City", state: "State",
    primaryColor: "Primary Color", secondaryColor: "Secondary Color",
    prestige: "Prestige", facilities: "Facilities", academics: "Academics",
    stadium: "Stadium", collegeLife: "College Life", marketing: "Marketing",
    nilBudget: "NIL Budget", enrollment: "Enrollment",
    fanbasePassion: "Fanbase Passion", fanbaseType: "Fanbase Type",
    firstName: "First Name", lastName: "Last Name", jerseyNumber: "Jersey #",
    homeState: "Home State", hometown: "Hometown", position: "Position",
    eligibility: "Eligibility", overall: "OVR", starRating: "Stars",
    potential: "Potential", hitForAvg: "Contact", power: "Power",
    speed: "Speed", arm: "Arm", fielding: "Fielding", clutch: "Clutch",
    velocity: "Velocity", control: "Control", stamina: "Stamina", stuff: "Stuff",
    abilities: "Abilities",
  };
  return MAP[f] ?? f;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.length === 0 ? "(none)" : (v as string[]).join(", ");
  if (typeof v === "number" && (v > 10000)) return `$${v.toLocaleString()}`;
  return String(v);
}

// Minimal OVR preview compute on client using the shared lib
function previewOvr(base: EditorPlayer, changes: Record<string, unknown>): number {
  return calculateOVR({ ...base, ...changes } as any);
}

// ── Sub-component: AttributeInput ────────────────────────────────────────────
function AttrInput({ label, field, value, onChange }: {
  label: string; field: string; value: number; onChange: (f: string, v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-muted-foreground w-20 shrink-0">{label}</span>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(field, parseInt(e.target.value))}
        className="flex-1 h-1 accent-gold"
        data-testid={`slider-${field}`}
      />
      <input
        type="number" min={0} max={100} value={value}
        onChange={e => onChange(field, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
        className="w-10 text-[10px] bg-card border border-border rounded px-1 py-0.5 text-center"
        data-testid={`input-${field}`}
      />
    </div>
  );
}

// ── Sub-component: ReasonModal ────────────────────────────────────────────────
function ReasonModal({ open, onClose, onConfirm, isPending, competitive }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string, season: number | undefined) => void;
  isPending: boolean; competitive?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [season, setSeason] = useState<string>("");
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-pixel text-[11px] text-gold">Confirm Edit</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {competitive ? "This edit affects game-balance fields and will be logged publicly." : "This edit will be logged in the Change Log."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Reason *</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Briefly describe why this edit is needed..."
              className="w-full bg-background border border-border rounded p-2 text-xs resize-none h-20"
              data-testid="input-reason"
            />
          </div>
          {competitive && (
            <div>
              <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Effective Season (optional)</label>
              <input
                type="number" min={1} value={season}
                onChange={e => setSeason(e.target.value)}
                placeholder="e.g. 3"
                className="w-full bg-background border border-border rounded p-2 text-xs"
                data-testid="input-effective-season"
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 mt-2">
          <RetroButton variant="secondary" size="sm" onClick={onClose} disabled={isPending}>Cancel</RetroButton>
          <RetroButton
            size="sm" onClick={() => onConfirm(reason, season ? parseInt(season) : undefined)}
            disabled={!reason.trim() || isPending}
            data-testid="btn-confirm-edit"
          >
            {isPending ? "Saving..." : "Save Edit"}
          </RetroButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHOOLS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function SchoolsTab({ leagueId }: { leagueId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [reasonOpen, setReasonOpen] = useState(false);
  const [pendingCompetitive, setPendingCompetitive] = useState(false);

  const { data, isLoading } = useQuery<{ teams: EditorTeam[]; competitiveEditsEnabled: boolean }>({
    queryKey: ["/api/leagues", leagueId, "editor", "schools"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/editor/schools`, { credentials: "include" }).then(r => r.json()),
  });

  const selected = data?.teams.find(t => t.id === selectedId) ?? null;
  const competitiveEnabled = data?.competitiveEditsEnabled ?? true;

  const conferences = useMemo(() => {
    const names = new Set<string>();
    data?.teams.forEach(t => { if (t.conferenceName) names.add(t.conferenceName); });
    return Array.from(names).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.teams) return [];
    return data.teams.filter(t => {
      const matchConf = confFilter === "all" || t.conferenceName === confFilter;
      const matchSearch = !search || `${t.name} ${t.abbreviation} ${t.city}`.toLowerCase().includes(search.toLowerCase());
      return matchConf && matchSearch;
    });
  }, [data, search, confFilter]);

  const patchMutation = useMutation({
    mutationFn: async ({ reason, season }: { reason: string; season?: number }) => {
      const key = `school-${selectedId}-${Date.now()}`;
      const res = await apiRequest("PATCH", `/api/leagues/${leagueId}/editor/schools/${selectedId}`, {
        expectedVersion: selected!.editorVersion,
        changes: edits,
        reason,
        effectiveSeason: season,
        idempotencyKey: key,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "School updated", description: "Changes saved and logged." });
      setEdits({});
      setReasonOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "editor", "schools"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "editor", "history"] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  function handleSave() {
    if (!selected || Object.keys(edits).length === 0) return;
    const hasCompetitive = Object.keys(edits).some(k => COMPETITIVE_SCHOOL_FIELDS.has(k));
    if (hasCompetitive && !competitiveEnabled) {
      toast({ title: "Competitive edits disabled", description: "Enable in league settings.", variant: "destructive" });
      return;
    }
    setPendingCompetitive(hasCompetitive);
    setReasonOpen(true);
  }

  function setEdit(field: string, value: unknown) {
    setEdits(prev => ({ ...prev, [field]: value }));
  }

  function getVal<T>(field: string, fallback: T): T {
    return (field in edits ? edits[field] : selected?.[field as keyof EditorTeam]) as T ?? fallback;
  }

  const COMPETITIVE_SCHOOL_FIELDS = new Set(["prestige","facilities","academics","stadium","collegeLife","marketing","nilBudget","enrollment","fanbasePassion","fanbaseType"]);

  const primaryColor = getVal("primaryColor", selected?.primaryColor ?? "#003300");
  const secondaryColor = getVal("secondaryColor", selected?.secondaryColor ?? "#FFD700");
  const abbrev = getVal("abbreviation", selected?.abbreviation ?? "");

  const hasChanges = Object.keys(edits).length > 0;

  if (isLoading) return <div className="h-64 flex items-center justify-center"><Skeleton className="w-48 h-8" /></div>;

  return (
    <div className="flex gap-4 h-[70vh]">
      {/* Left: Team List */}
      <div className="w-64 flex flex-col gap-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search schools..."
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-card border border-border rounded"
            data-testid="input-school-search"
          />
        </div>
        <Select value={confFilter} onValueChange={setConfFilter}>
          <SelectTrigger className="h-7 text-[10px]" data-testid="select-conf-filter">
            <SelectValue placeholder="All Conferences" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conferences</SelectItem>
            {conferences.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
          {filtered.map(t => (
            <button
              key={t.id}
              onClick={() => { setSelectedId(t.id); setEdits({}); }}
              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                t.id === selectedId ? "bg-gold/20 border border-gold/40" : "hover:bg-card/80"
              }`}
              data-testid={`btn-team-${t.id}`}
            >
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: t.primaryColor }} />
              <span className="truncate font-medium">{t.name}</span>
              <ChevronRight className="w-3 h-3 ml-auto text-muted-foreground shrink-0" />
            </button>
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No schools found</p>}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a school to edit
          </div>
        ) : (
          <div className="space-y-4">
            {/* Brand Preview */}
            <RetroCard className="p-4">
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded flex items-center justify-center font-pixel text-sm font-bold border-2"
                  style={{ backgroundColor: primaryColor, borderColor: secondaryColor, color: secondaryColor }}
                >
                  {abbrev}
                </div>
                <div>
                  <p className="font-pixel text-[10px] text-gold">{getVal("name", selected.name)}</p>
                  <p className="text-xs text-muted-foreground">{getVal("city", selected.city)}, {getVal("state", selected.state)}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">v{selected.editorVersion}</p>
                </div>
                <div className="ml-auto flex gap-2">
                  {hasChanges && (
                    <RetroButton variant="secondary" size="sm" onClick={() => setEdits({})} data-testid="btn-discard-school">
                      <X className="w-3 h-3 mr-1" />Discard
                    </RetroButton>
                  )}
                  <RetroButton size="sm" onClick={handleSave} disabled={!hasChanges || patchMutation.isPending} data-testid="btn-save-school">
                    <Save className="w-3 h-3 mr-1" />{patchMutation.isPending ? "Saving..." : "Save"}
                  </RetroButton>
                </div>
              </div>
            </RetroCard>

            {/* Identity Fields */}
            <RetroCard>
              <RetroCardHeader className="pb-2">
                <p className="font-pixel text-[9px] text-muted-foreground uppercase">Identity</p>
              </RetroCardHeader>
              <RetroCardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Name", field: "name", maxLen: 100 },
                    { label: "Mascot", field: "mascot", maxLen: 100 },
                    { label: "Abbreviation", field: "abbreviation", maxLen: 8 },
                    { label: "City", field: "city", maxLen: 100 },
                    { label: "State", field: "state", maxLen: 30 },
                  ].map(({ label, field, maxLen }) => (
                    <div key={field}>
                      <label className="text-[9px] font-pixel text-muted-foreground block mb-1">{label}</label>
                      <input
                        value={getVal(field, "") as string}
                        onChange={e => setEdit(field, e.target.value)}
                        maxLength={maxLen}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                        data-testid={`input-school-${field}`}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor as string}
                        onChange={e => setEdit("primaryColor", e.target.value)}
                        className="w-8 h-7 rounded border border-border cursor-pointer"
                        data-testid="input-school-primaryColor"
                      />
                      <input
                        value={primaryColor as string}
                        onChange={e => setEdit("primaryColor", e.target.value)}
                        className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Secondary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={secondaryColor as string}
                        onChange={e => setEdit("secondaryColor", e.target.value)}
                        className="w-8 h-7 rounded border border-border cursor-pointer"
                        data-testid="input-school-secondaryColor"
                      />
                      <input
                        value={secondaryColor as string}
                        onChange={e => setEdit("secondaryColor", e.target.value)}
                        className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </RetroCardContent>
            </RetroCard>

            {/* Competitive Fields */}
            <RetroCard>
              <RetroCardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <p className="font-pixel text-[9px] text-muted-foreground uppercase">Competitive Attributes</p>
                  {!competitiveEnabled && (
                    <Badge variant="outline" className="text-[8px] border-yellow-500/40 text-yellow-400">Disabled</Badge>
                  )}
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                {!competitiveEnabled && (
                  <p className="text-xs text-yellow-400/80 mb-3 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Enable competitive edits in League Settings to modify these fields.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    { label: "Prestige", field: "prestige", min: 1, max: 10 },
                    { label: "Facilities", field: "facilities", min: 1, max: 10 },
                    { label: "Academics", field: "academics", min: 1, max: 10 },
                    { label: "Stadium", field: "stadium", min: 1, max: 10 },
                    { label: "College Life", field: "collegeLife", min: 1, max: 10 },
                    { label: "Marketing", field: "marketing", min: 1, max: 10 },
                  ].map(({ label, field, min, max }) => (
                    <div key={field} className="flex items-center gap-2">
                      <label className="text-[9px] text-muted-foreground w-20 shrink-0">{label}</label>
                      <input
                        type="range" min={min} max={max} value={getVal(field, 5) as number}
                        onChange={e => setEdit(field, parseInt(e.target.value))}
                        disabled={!competitiveEnabled}
                        className="flex-1 h-1 accent-gold disabled:opacity-40"
                      />
                      <span className="text-xs w-4 text-right">{getVal(field, 5) as number}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="text-[9px] font-pixel text-muted-foreground block mb-1">NIL Budget</label>
                    <input
                      type="number" min={0} value={getVal("nilBudget", selected.nilBudget) as number}
                      onChange={e => setEdit("nilBudget", parseInt(e.target.value) || 0)}
                      disabled={!competitiveEnabled}
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs disabled:opacity-40"
                      data-testid="input-school-nilBudget"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Enrollment</label>
                    <input
                      type="number" min={0} value={getVal("enrollment", selected.enrollment) as number}
                      onChange={e => setEdit("enrollment", parseInt(e.target.value) || 0)}
                      disabled={!competitiveEnabled}
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs disabled:opacity-40"
                      data-testid="input-school-enrollment"
                    />
                  </div>
                </div>
              </RetroCardContent>
            </RetroCard>
          </div>
        )}
      </div>

      <ReasonModal
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        onConfirm={(reason, season) => patchMutation.mutate({ reason, season })}
        isPending={patchMutation.isPending}
        competitive={pendingCompetitive}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYERS TAB
// ═══════════════════════════════════════════════════════════════════════════════

const PITCHER_POSITIONS = new Set(["P","SP","RP","CP","CL","LHP","RHP"]);

const SKIN_TONES = ["light","fair","medium","tan","dark","deep"];
const HAIR_COLORS = ["black","brown","blonde","red","gray","white","auburn"];
const HAIR_STYLES = ["short","medium","long","buzz","bald","curly","wavy","spiky"];
const FACIAL_HAIR_OPTS = ["none","stubble","beard","mustache","goatee","full_beard"];

const HITTER_ATTRS = [
  { label: "Contact", field: "hitForAvg" }, { label: "Power", field: "power" },
  { label: "Speed", field: "speed" }, { label: "Arm", field: "arm" },
  { label: "Fielding", field: "fielding" }, { label: "Error Res", field: "errorResistance" },
  { label: "Clutch", field: "clutch" }, { label: "vs LHP", field: "vsLHP" },
  { label: "Grit", field: "grit" }, { label: "Stealing", field: "stealing" },
] as const;

const PITCHER_ATTRS = [
  { label: "Velocity", field: "velocity" }, { label: "Control", field: "control" },
  { label: "Stamina", field: "stamina" }, { label: "Stuff", field: "stuff" },
  { label: "W/RISP", field: "wRISP" }, { label: "vs Lefty", field: "vsLefty" },
  { label: "Poise", field: "poise" }, { label: "Heater", field: "heater" },
  { label: "Agile", field: "agile" },
] as const;

function PlayersTab({ leagueId }: { leagueId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [teamId, setTeamId] = useState<string>("all");
  const [posFilter, setPosFilter] = useState<string>("all");
  const [eligFilter, setEligFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [panelTab, setPanelTab] = useState("identity");
  const [reasonOpen, setReasonOpen] = useState(false);

  const { data: schoolsData } = useQuery<{ teams: EditorTeam[] }>({
    queryKey: ["/api/leagues", leagueId, "editor", "schools"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/editor/schools`, { credentials: "include" }).then(r => r.json()),
  });

  const [playerPage, setPlayerPage] = useState(1);

  const { data: playersData, isLoading } = useQuery<{ players: EditorPlayer[]; total: number; page: number; pageSize: number }>({
    queryKey: ["/api/leagues", leagueId, "editor", "players", teamId, posFilter, eligFilter, search, playerPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(playerPage), pageSize: "50" });
      if (teamId !== "all") params.set("teamId", teamId);
      if (posFilter !== "all") params.set("position", posFilter);
      if (eligFilter !== "all") params.set("eligibility", eligFilter);
      if (search) params.set("search", search);
      return fetch(`/api/leagues/${leagueId}/editor/players?${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const selected = playersData?.players.find(p => p.id === selectedId) ?? null;
  const isPitcher = selected ? PITCHER_POSITIONS.has(selected.position) : false;
  const hasChanges = Object.keys(edits).length > 0;

  function setEdit(field: string, value: unknown) {
    setEdits(prev => ({ ...prev, [field]: value }));
  }

  function getVal<T>(field: string, fallback: T): T {
    return (field in edits ? edits[field] : selected?.[field as keyof EditorPlayer]) as T ?? fallback;
  }

  const liveOvr = selected ? previewOvr(selected, edits) : 0;
  const liveStar = getStarRatingFromOVR(liveOvr);

  const patchMutation = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      const key = `player-${selectedId}-${Date.now()}`;
      const res = await apiRequest("PATCH", `/api/leagues/${leagueId}/editor/players/${selectedId}`, {
        expectedVersion: selected!.editorVersion,
        changes: edits,
        reason,
        idempotencyKey: key,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Player updated", description: "Changes saved and logged." });
      setEdits({});
      setReasonOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "editor", "players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "editor", "history"] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const teams = schoolsData?.teams ?? [];

  return (
    <div className="flex gap-4 h-[70vh]">
      {/* Left: Filters + Player List */}
      <div className="w-64 flex flex-col gap-2 shrink-0">
        {/* Filters */}
        <Select value={teamId} onValueChange={v => { setTeamId(v); setSelectedId(null); setEdits({}); }}>
          <SelectTrigger className="h-7 text-[10px]" data-testid="select-player-team">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          <Select value={posFilter} onValueChange={setPosFilter}>
            <SelectTrigger className="h-7 text-[10px] flex-1" data-testid="select-player-pos">
              <SelectValue placeholder="Pos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pos</SelectItem>
              {["C","1B","2B","SS","3B","OF","LF","CF","RF","P","SP","RP","CP"].map(p =>
                <SelectItem key={p} value={p}>{p}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Select value={eligFilter} onValueChange={setEligFilter}>
            <SelectTrigger className="h-7 text-[10px] flex-1" data-testid="select-player-elig">
              <SelectValue placeholder="Yr" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Yr</SelectItem>
              {["FR","SO","JR","SR"].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-card border border-border rounded"
            data-testid="input-player-search"
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
          {isLoading && <Skeleton className="h-40 w-full" />}
          {playersData?.players.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedId(p.id); setEdits({}); setPanelTab("identity"); }}
              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                p.id === selectedId ? "bg-gold/20 border border-gold/40" : "hover:bg-card/80"
              }`}
              data-testid={`btn-player-${p.id}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.firstName} {p.lastName}</p>
                <p className="text-[9px] text-muted-foreground">{p.position} · {p.eligibility} · {p.teamAbbr}</p>
              </div>
              <span className={`text-[10px] shrink-0 ${ovrColor(p.overall)}`}>{p.overall}</span>
            </button>
          ))}
          {!isLoading && playersData?.players.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No players found</p>
          )}
        </div>
        {/* Pagination */}
        {playersData && playersData.total > playersData.pageSize && (
          <div className="flex items-center justify-between gap-1 pt-1 border-t border-border shrink-0">
            <button
              onClick={() => setPlayerPage(p => Math.max(1, p - 1))}
              disabled={playerPage <= 1}
              className="text-[9px] text-muted-foreground disabled:opacity-30 hover:text-foreground px-1"
            >
              Prev
            </button>
            <span className="text-[9px] text-muted-foreground">
              {playerPage}/{Math.ceil(playersData.total / playersData.pageSize)}
            </span>
            <button
              onClick={() => setPlayerPage(p => Math.min(Math.ceil(playersData.total / playersData.pageSize), p + 1))}
              disabled={playerPage >= Math.ceil(playersData.total / playersData.pageSize)}
              className="text-[9px] text-muted-foreground disabled:opacity-30 hover:text-foreground px-1"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Right: Player Editor */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a player to edit
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header bar */}
            <RetroCard className="p-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-pixel text-[10px] text-gold">{selected.firstName} {selected.lastName}</p>
                  <p className="text-xs text-muted-foreground">{selected.position} · {selected.eligibility} · {selected.teamName}</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {hasChanges && (
                    <div className="text-[9px] text-muted-foreground">
                      OVR preview:{" "}
                      <span className={ovrColor(selected.overall)}>{selected.overall}</span>
                      {" → "}
                      <span className={ovrColor(liveOvr)}>{liveOvr}</span>
                    </div>
                  )}
                  {hasChanges && (
                    <RetroButton variant="secondary" size="sm" onClick={() => setEdits({})} data-testid="btn-discard-player">
                      <X className="w-3 h-3 mr-1" />Discard
                    </RetroButton>
                  )}
                  <RetroButton size="sm" onClick={() => setReasonOpen(true)} disabled={!hasChanges || patchMutation.isPending} data-testid="btn-save-player">
                    <Save className="w-3 h-3 mr-1" />{patchMutation.isPending ? "Saving..." : "Save"}
                  </RetroButton>
                </div>
              </div>
            </RetroCard>

            <Tabs value={panelTab} onValueChange={setPanelTab}>
              <TabsList className="bg-card border border-border">
                {["identity","ratings","pitching","abilities","appearance"].map(t => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark capitalize"
                  >
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Identity Panel */}
              <TabsContent value="identity">
                <RetroCard>
                  <RetroCardContent className="pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "First Name", field: "firstName", type: "text" },
                        { label: "Last Name", field: "lastName", type: "text" },
                        { label: "Home State", field: "homeState", type: "text" },
                        { label: "Hometown", field: "hometown", type: "text" },
                        { label: "Jersey #", field: "jerseyNumber", type: "number" },
                      ].map(({ label, field, type }) => (
                        <div key={field}>
                          <label className="text-[9px] font-pixel text-muted-foreground block mb-1">{label}</label>
                          <input
                            type={type} value={getVal(field, "") as string | number}
                            onChange={e => setEdit(field, type === "number" ? parseInt(e.target.value) || 0 : e.target.value)}
                            className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                            data-testid={`input-player-${field}`}
                          />
                        </div>
                      ))}
                      <div>
                        <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Position</label>
                        <Select value={getVal("position", selected.position) as string} onValueChange={v => setEdit("position", v)}>
                          <SelectTrigger className="h-7 text-[10px]" data-testid="select-player-position">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["C","1B","2B","SS","3B","OF","LF","CF","RF","P","SP","RP","CP"].map(p =>
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Eligibility</label>
                        <Select value={getVal("eligibility", selected.eligibility) as string} onValueChange={v => setEdit("eligibility", v)}>
                          <SelectTrigger className="h-7 text-[10px]" data-testid="select-player-eligibility">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["FR","SO","JR","SR"].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </TabsContent>

              {/* Ratings Panel */}
              <TabsContent value="ratings">
                <RetroCard>
                  <RetroCardContent className="pt-3 space-y-1.5">
                    {!isPitcher && HITTER_ATTRS.map(({ label, field }) => (
                      <AttrInput key={field} label={label} field={field}
                        value={getVal(field, 50) as number}
                        onChange={(f, v) => setEdit(f, v)} />
                    ))}
                    {isPitcher && PITCHER_ATTRS.map(({ label, field }) => (
                      <AttrInput key={field} label={label} field={field}
                        value={getVal(field, 50) as number}
                        onChange={(f, v) => setEdit(f, v)} />
                    ))}
                    <div className="flex items-center gap-2 pt-1 border-t border-border mt-2">
                      <span className="text-[9px] text-muted-foreground w-20 shrink-0">Potential</span>
                      <input
                        type="range" min={0} max={100} value={getVal("potential", selected.potential ?? 71) as number}
                        onChange={e => setEdit("potential", parseInt(e.target.value))}
                        className="flex-1 h-1 accent-gold"
                      />
                      <input
                        type="number" min={0} max={100} value={getVal("potential", selected.potential ?? 71) as number}
                        onChange={e => setEdit("potential", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-10 text-[10px] bg-card border border-border rounded px-1 py-0.5 text-center"
                      />
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </TabsContent>

              {/* Abilities Panel */}
              <TabsContent value="abilities">
                <RetroCard>
                  <RetroCardContent className="pt-3">
                    <p className="text-[9px] text-muted-foreground mb-2">Select abilities (0-7 total)</p>
                    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                      {ALL_ABILITIES.map(a => {
                        const current = getVal("abilities", selected.abilities) as string[];
                        const checked = current.includes(a.name);
                        const tierClass = a.tier === "gold"
                          ? "border-yellow-600/40 text-yellow-400"
                          : a.tier === "red"
                          ? "border-red-600/40 text-red-400"
                          : "border-blue-600/40 text-blue-400";
                        return (
                          <label
                            key={a.name}
                            className={`flex items-center gap-2 px-2 py-1 rounded border cursor-pointer text-xs transition-colors ${
                              checked ? tierClass + " bg-card/80" : "border-transparent text-muted-foreground hover:bg-card/50"
                            }`}
                            data-testid={`ability-${a.name}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const arr = [...current];
                                if (checked) {
                                  setEdit("abilities", arr.filter(x => x !== a.name));
                                } else if (arr.length < 7) {
                                  setEdit("abilities", [...arr, a.name]);
                                }
                              }}
                              className="accent-gold"
                            />
                            <span className="font-medium">{a.name}</span>
                            <span className="ml-auto text-[9px] opacity-60">{a.tier}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-2">
                      Selected: {(getVal("abilities", selected.abilities) as string[]).length} / 7
                    </p>
                  </RetroCardContent>
                </RetroCard>
              </TabsContent>

              {/* Pitching Panel */}
              <TabsContent value="pitching">
                <RetroCard>
                  <RetroCardContent className="pt-3">
                    <p className="text-[9px] text-muted-foreground mb-3">Pitch mix levels (0 = does not throw). Levels 1-7 indicate proficiency.</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {([
                        ["FB","pitchFB"], ["2S","pitch2S"], ["SL","pitchSL"], ["CB","pitchCB"],
                        ["CH","pitchCH"], ["CT","pitchCT"], ["SNK","pitchSNK"], ["SPL","pitchSPL"],
                        ["SHU","pitchSHU"], ["CCH","pitchCCH"], ["HSL","pitchHSL"], ["SWP","pitchSWP"],
                        ["KN","pitchKN"], ["VSL","pitchVSL"], ["SFF","pitchSFF"], ["FK","pitchFK"],
                        ["SCB","pitchSCB"], ["PCB","pitchPCB"],
                      ] as [string, string][]).map(([label, field]) => (
                        <div key={field} className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground w-8 shrink-0 font-mono">{label}</span>
                          <input
                            type="range" min={0} max={7}
                            value={getVal(field, 0) as number}
                            onChange={e => setEdit(field, parseInt(e.target.value))}
                            className="flex-1 h-1 accent-gold"
                            data-testid={`slider-${field}`}
                          />
                          <span className="text-[10px] w-4 text-right shrink-0">
                            {getVal(field, 0) as number}
                          </span>
                        </div>
                      ))}
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </TabsContent>

              {/* Appearance Panel */}
              <TabsContent value="appearance">
                <RetroCard>
                  <RetroCardContent className="pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Skin Tone</label>
                        <Select value={getVal("skinTone", selected.skinTone ?? "light") as string} onValueChange={v => setEdit("skinTone", v)}>
                          <SelectTrigger className="h-7 text-[10px]" data-testid="select-player-skinTone">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SKIN_TONES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Hair Color</label>
                        <Select value={getVal("hairColor", selected.hairColor ?? "brown") as string} onValueChange={v => setEdit("hairColor", v)}>
                          <SelectTrigger className="h-7 text-[10px]" data-testid="select-player-hairColor">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HAIR_COLORS.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Hair Style</label>
                        <Select value={getVal("hairStyle", selected.hairStyle ?? "short") as string} onValueChange={v => setEdit("hairStyle", v)}>
                          <SelectTrigger className="h-7 text-[10px]" data-testid="select-player-hairStyle">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HAIR_STYLES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Facial Hair</label>
                        <Select value={getVal("facialHair", selected.facialHair ?? "none") as string} onValueChange={v => setEdit("facialHair", v)}>
                          <SelectTrigger className="h-7 text-[10px]" data-testid="select-player-facialHair">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FACIAL_HAIR_OPTS.map(f => <SelectItem key={f} value={f} className="capitalize">{f.replace("_", " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </RetroCardContent>
                </RetroCard>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <ReasonModal
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        onConfirm={(reason) => patchMutation.mutate({ reason })}
        isPending={patchMutation.isPending}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE LOG TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ChangeLogTab({ leagueId }: { leagueId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reverseTarget, setReverseTarget] = useState<EditBatch | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const { data, isLoading } = useQuery<{ batches: EditBatch[]; total: number; page: number; pageSize: number }>({
    queryKey: ["/api/leagues", leagueId, "editor", "history", page, entityType],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (entityType !== "all") params.set("entityType", entityType);
      return fetch(`/api/leagues/${leagueId}/editor/history?${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async ({ batchId, reason }: { batchId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/editor/batches/${batchId}/reverse`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reversed", description: "The batch was successfully reversed." });
      setReverseTarget(null);
      setReverseReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "editor", "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "editor", "schools"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "editor", "players"] });
    },
    onError: (err: any) => {
      toast({ title: "Reversal failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  function copyId(id: string) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={entityType} onValueChange={v => { setEntityType(v); setPage(1); }}>
          <SelectTrigger className="w-36 h-7 text-[10px]" data-testid="select-log-type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="team">Schools</SelectItem>
            <SelectItem value="player">Players</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {data?.total ?? 0} total edits
        </span>
      </div>

      {isLoading && <Skeleton className="h-48 w-full" />}

      {/* Batches */}
      <div className="space-y-2">
        {data?.batches.map(batch => (
          <RetroCard key={batch.id} className={batch.isReversed ? "opacity-60" : ""}>
            <RetroCardContent className="py-2 px-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[8px] ${batch.entityType === "team" ? "border-blue-500/40 text-blue-400" : "border-green-500/40 text-green-400"}`}
                    >
                      {batch.entityType === "team" ? "School" : "Player"}
                    </Badge>
                    <span className="text-xs font-medium truncate max-w-[180px]">{batch.entityLabel ?? batch.entityId.slice(0, 8)}</span>
                    {batch.isReversed && <Badge variant="outline" className="text-[8px] border-red-500/40 text-red-400">Reversed</Badge>}
                    {batch.effectiveSeason && (
                      <span className="text-[9px] text-muted-foreground">Season {batch.effectiveSeason}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">"{batch.reason}"</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(batch.createdAt).toLocaleString()}
                    </span>
                    <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                      <User className="w-2.5 h-2.5" />
                      {batch.actorEmail ?? batch.actorId.slice(0, 8)}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {batch.changes.length} field{batch.changes.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => copyId(batch.id)}
                    className="p-1 rounded hover:bg-card/80 text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy audit ID"
                    data-testid={`btn-copy-batch-${batch.id}`}
                  >
                    {copiedId === batch.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === batch.id ? null : batch.id)}
                    className="p-1 rounded hover:bg-card/80 text-muted-foreground transition-colors"
                    data-testid={`btn-expand-batch-${batch.id}`}
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform ${expandedId === batch.id ? "rotate-90" : ""}`} />
                  </button>
                  {!batch.isReversed && (
                    <button
                      onClick={() => setReverseTarget(batch)}
                      className="p-1 rounded hover:bg-red-900/20 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Reverse this batch"
                      data-testid={`btn-reverse-batch-${batch.id}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded change rows */}
              {expandedId === batch.id && batch.changes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border space-y-1">
                  {batch.changes.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground w-28 shrink-0">{fieldLabel(c.fieldName)}</span>
                      <span className="text-red-400/80 line-through truncate max-w-[120px]">{fmtVal(c.beforeJson)}</span>
                      <ChevronRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      <span className="text-green-400 truncate max-w-[120px]">{fmtVal(c.afterJson)}</span>
                    </div>
                  ))}
                </div>
              )}
            </RetroCardContent>
          </RetroCard>
        ))}
        {data?.batches.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">No edits found</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <RetroButton variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
            Prev
          </RetroButton>
          <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
          <RetroButton variant="secondary" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
          </RetroButton>
        </div>
      )}

      {/* Reverse Confirmation Modal */}
      <Dialog open={!!reverseTarget} onOpenChange={v => !v && setReverseTarget(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-pixel text-[11px] text-red-400">Reverse Batch</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This will restore the previous values for {reverseTarget?.changes.length} field(s) on {reverseTarget?.entityLabel}.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-[9px] font-pixel text-muted-foreground block mb-1">Reason for reversal *</label>
            <textarea
              value={reverseReason}
              onChange={e => setReverseReason(e.target.value)}
              placeholder="Why is this being reversed?"
              className="w-full bg-background border border-border rounded p-2 text-xs resize-none h-16"
              data-testid="input-reverse-reason"
            />
          </div>
          <DialogFooter className="gap-2 mt-2">
            <RetroButton variant="secondary" size="sm" onClick={() => setReverseTarget(null)}>Cancel</RetroButton>
            <RetroButton
              size="sm"
              onClick={() => reverseTarget && reverseMutation.mutate({ batchId: reverseTarget.id, reason: reverseReason })}
              disabled={!reverseReason.trim() || reverseMutation.isPending}
              className="border-red-500/40 text-red-400 hover:bg-red-900/20"
              data-testid="btn-confirm-reverse"
            >
              {reverseMutation.isPending ? "Reversing..." : "Confirm Reverse"}
            </RetroButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LEAGUE EDITOR TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function LeagueEditorTab({ leagueId }: { leagueId: string }) {
  const [activeTab, setActiveTab] = useState("schools");

  return (
    <div className="space-y-4">
      <div>
        <p className="font-pixel text-[10px] text-gold mb-1">League Editor</p>
        <p className="text-xs text-muted-foreground">
          Edit school identity, player attributes, and abilities. All changes are versioned and logged.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger
            value="schools"
            className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
            data-testid="tab-editor-schools"
          >
            <Building2 className="w-3 h-3 mr-1" />Schools
          </TabsTrigger>
          <TabsTrigger
            value="players"
            className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
            data-testid="tab-editor-players"
          >
            <Users className="w-3 h-3 mr-1" />Players
          </TabsTrigger>
          <TabsTrigger
            value="changelog"
            className="font-pixel text-[8px] data-[state=active]:bg-gold data-[state=active]:text-forest-dark"
            data-testid="tab-editor-changelog"
          >
            <Clock className="w-3 h-3 mr-1" />Change Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schools">
          <SchoolsTab leagueId={leagueId} />
        </TabsContent>
        <TabsContent value="players">
          <PlayersTab leagueId={leagueId} />
        </TabsContent>
        <TabsContent value="changelog">
          <ChangeLogTab leagueId={leagueId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
