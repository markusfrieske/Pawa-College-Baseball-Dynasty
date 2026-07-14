import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Check, History, Pencil, RotateCcw, Save, Star, X } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import { calculateOVR, getStarRatingFromOVR, ALL_ABILITIES, commonGrade, pitcherCommonGrade } from "@shared/abilities";
import { isPitcher as getIsPitcherPos } from "@shared/positions";
import type { Player, AuditLog } from "@shared/schema";

interface LeagueTeam {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  conferenceId: string | null;
}

interface LeagueConference {
  id: string;
  name: string;
}

interface LeagueWithTeams {
  teams: LeagueTeam[];
  conferences: LeagueConference[];
}

type EditMap = Record<string, Partial<Player>>;

function ovrColor(ovr: number): string {
  if (ovr >= 500) return "text-yellow-400 font-bold";
  if (ovr >= 400) return "text-green-400 font-bold";
  if (ovr >= 300) return "text-foreground";
  if (ovr >= 200) return "text-muted-foreground";
  return "text-red-400/70";
}

function StarBadge({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-2.5 h-2.5 ${i <= stars ? "fill-gold text-gold" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function AbilityPill({ name }: { name: string }) {
  const ability = ALL_ABILITIES.find((a) => a.name === name);
  const tier = ability?.tier ?? "blue";
  const cls =
    tier === "gold"
      ? "bg-yellow-600/20 text-yellow-400 border-yellow-600/30"
      : tier === "red"
      ? "bg-red-600/20 text-red-400 border-red-600/30"
      : "bg-blue-600/20 text-blue-400 border-blue-600/30";
  return (
    <Badge variant="outline" className={`text-xs px-1 py-0 ${cls}`}>
      {name}
    </Badge>
  );
}

function InlineStatCell({
  value,
  field,
  playerId,
  onUpdate,
}: {
  value: number;
  field: string;
  playerId: string;
  onUpdate: (field: string, v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const n = Math.max(1, Math.min(99, Number(draft) || value));
    onUpdate(field, n);
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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setEditing(false);
            setDraft(String(value));
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-10 h-6 text-xs text-center bg-muted/60 border border-gold/50 rounded focus:outline-none focus:border-gold text-foreground"
        data-testid={`input-stat-${field}-${playerId}`}
      />
    );
  }

  return (
    <span
      className="cursor-text text-xs text-muted-foreground hover:text-gold hover:underline decoration-dotted underline-offset-2 select-none"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title={`Click to edit ${field}`}
      data-testid={`cell-stat-${field}-${playerId}`}
    >
      {value}
    </span>
  );
}

function AbilitiesToggle({
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

  const available = ALL_ABILITIES;
  const filtered = search
    ? available.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : available;
  const grouped = {
    gold: filtered.filter((a) => a.tier === "gold"),
    blue: filtered.filter((a) => a.tier === "blue"),
    red: filtered.filter((a) => a.tier === "red"),
  };

  const toggle = (name: string) => {
    onChange(abilities.includes(name) ? abilities.filter((a) => a !== name) : [...abilities, name]);
  };

  const tierColor = (tier: string) =>
    tier === "gold" ? "text-yellow-500" : tier === "red" ? "text-red-400" : "text-blue-400";

  return (
    <div className="relative">
      <div
        className="flex items-center gap-1 border border-border rounded px-1.5 py-0.5 cursor-pointer min-h-[24px] bg-background/50 text-xs max-w-[180px]"
        onClick={() => setOpen((v) => !v)}
        data-testid="abilities-toggle-trigger"
      >
        {abilities.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <span className="text-gold truncate">{abilities.length} ability(ies)</span>
        )}
        <X className="w-2.5 h-2.5 ml-auto text-muted-foreground" />
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-hidden flex flex-col">
          <div className="p-1.5 border-b border-border">
            <input
              className="w-full h-6 text-xs px-2 bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              data-testid="abilities-toggle-search"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {(["gold", "blue", "red"] as const).map((tier) => {
              const list = grouped[tier];
              if (!list.length) return null;
              return (
                <div key={tier}>
                  <div
                    className={`px-2 py-0.5 text-xs uppercase sticky top-0 bg-card border-b border-border ${tierColor(tier)}`}
                  >
                    {tier}
                  </div>
                  {list.map((ability) => {
                    const selected = abilities.includes(ability.name);
                    return (
                      <div
                        key={ability.name}
                        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-muted/30 ${selected ? "bg-muted/20" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(ability.name);
                        }}
                        data-testid={`ability-opt-${ability.name.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        <div
                          className={`w-3 h-3 border rounded-sm flex items-center justify-center shrink-0 ${selected ? "bg-gold border-gold" : "border-border"}`}
                        >
                          {selected && <Check className="w-2 h-2 text-background" />}
                        </div>
                        <span className={`${tierColor(tier)} truncate`}>{ability.name}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="p-1 border-t border-border flex justify-end">
            <button
              className="text-xs text-gold hover:text-gold/80 px-2 py-0.5"
              onClick={() => setOpen(false)}
              data-testid="abilities-toggle-done"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RosterEditorTabProps {
  leagueId: string;
  auditLogs?: AuditLog[];
}

export function RosterEditorTab({ leagueId, auditLogs = [] }: RosterEditorTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedConferenceId, setSelectedConferenceId] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [edits, setEdits] = useState<EditMap>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);

  const { data: leagueData } = useQuery<LeagueWithTeams>({
    queryKey: ["/api/leagues", leagueId],
  });

  const { data: rosterData, isLoading: rosterLoading } = useQuery<{
    players: Player[];
    team: LeagueTeam;
  }>({
    queryKey: ["/api/leagues", leagueId, "roster", selectedTeamId],
    queryFn: () =>
      fetch(`/api/leagues/${leagueId}/roster?teamId=${selectedTeamId}`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: !!selectedTeamId,
  });

  const conferences = leagueData?.conferences ?? [];
  const teams = leagueData?.teams ?? [];

  const filteredTeams = selectedConferenceId
    ? teams.filter((t) => t.conferenceId === selectedConferenceId)
    : teams;

  const players = rosterData?.players ?? [];

  const getEffectivePlayer = (p: Player): Player => {
    const e = edits[p.id];
    if (!e) return p;
    const merged = { ...p, ...e };
    const newOvr = calculateOVR(merged as Parameters<typeof calculateOVR>[0]);
    return { ...merged, overall: newOvr, starRating: getStarRatingFromOVR(newOvr) };
  };

  const updateField = (playerId: string, field: string, value: unknown) => {
    setEdits((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? {}), [field]: value },
    }));
  };

  const hasEdits = (playerId: string) =>
    !!edits[playerId] && Object.keys(edits[playerId]!).length > 0;

  const discardEdits = (playerId: string) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  };

  const savePlayer = async (p: Player) => {
    const playerEdits = edits[p.id];
    if (!playerEdits || Object.keys(playerEdits).length === 0) return;
    setSavingId(p.id);
    try {
      await apiRequest("PATCH", `/api/leagues/${leagueId}/players/${p.id}`, playerEdits);
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "roster", selectedTeamId] });
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      discardEdits(p.id);
      toast({ title: "Player Saved", description: `${p.firstName} ${p.lastName} updated.` });
    } catch (err: unknown) {
      toast({
        title: "Save Failed",
        description: parseErrorMessage(err as Error),
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const dirtyPlayers = players.filter((p) => hasEdits(p.id));
  const dirtyCount = dirtyPlayers.length;

  const saveAllPlayers = async () => {
    if (dirtyCount === 0 || savingAll) return;
    setSavingAll(true);
    setSaveProgress({ done: 0, total: dirtyCount });
    let succeeded = 0;
    let failed = 0;
    for (const p of dirtyPlayers) {
      const playerEdits = edits[p.id];
      if (!playerEdits || Object.keys(playerEdits).length === 0) continue;
      try {
        await apiRequest("PATCH", `/api/leagues/${leagueId}/players/${p.id}`, playerEdits);
        discardEdits(p.id);
        succeeded++;
      } catch {
        failed++;
      }
      setSaveProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : null));
    }
    await qc.invalidateQueries({
      queryKey: ["/api/leagues", leagueId, "roster", selectedTeamId],
    });
    await qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
    setSavingAll(false);
    setSaveProgress(null);
    if (failed === 0) {
      toast({
        title: "All Changes Saved",
        description: `${succeeded} player${succeeded !== 1 ? "s" : ""} updated successfully.`,
      });
    } else {
      toast({
        title: "Partial Save",
        description: `${succeeded} saved, ${failed} failed.`,
        variant: "destructive",
      });
    }
  };

  const POSITIONS = ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "OF", "P", "SP", "RP", "CL"];
  const ELIGIBILITIES = ["FR", "SO", "JR", "SR", "RS"];

  const gradeColor = (grade: string) => {
    switch (grade) {
      case "S": return "text-yellow-400";
      case "A": return "text-green-400";
      case "B": return "text-teal-400";
      case "C": return "text-yellow-500";
      case "D": return "text-orange-400";
      case "E": return "text-green-500";
      default: return "text-red-400";
    }
  };

  return (
    <div className="space-y-4">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-gold" />
            Roster Editor
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Select a team to edit their active roster. Changes write directly to the live players
            table and are logged to the audit trail and activity feed.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select
              value={selectedConferenceId}
              onValueChange={(v) => {
                setSelectedConferenceId(v === "__all__" ? "" : v);
                setSelectedTeamId("");
                setEdits({});
              }}
            >
              <SelectTrigger className="w-full sm:w-48" data-testid="select-conference">
                <SelectValue placeholder="All Conferences" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Conferences</SelectItem>
                {conferences.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedTeamId}
              onValueChange={(v) => {
                setSelectedTeamId(v);
                setEdits({});
              }}
            >
              <SelectTrigger className="w-full sm:w-64" data-testid="select-team">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {filteredTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedTeamId && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Select a team above to edit their roster.
            </div>
          )}

          {selectedTeamId && rosterLoading && (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          )}

          {selectedTeamId && !rosterLoading && players.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No active players found for this team.
            </div>
          )}

          {selectedTeamId && !rosterLoading && players.length > 0 && (
            <>
              {dirtyCount > 0 && (
                <div className="flex items-center justify-between gap-3 mb-3 p-2.5 rounded border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center gap-2 text-xs text-yellow-400">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 shrink-0 animate-pulse" />
                    {savingAll && saveProgress
                      ? `Saving… ${saveProgress.done} / ${saveProgress.total}`
                      : `${dirtyCount} unsaved change${dirtyCount !== 1 ? "s" : ""}`}
                  </div>
                  <RetroButton
                    size="sm"
                    variant="primary"
                    className="h-7 px-3 text-xs"
                    onClick={saveAllPlayers}
                    disabled={savingAll}
                    loading={savingAll}
                    data-testid="button-save-all"
                  >
                    <Save className="w-3 h-3 mr-1.5" />
                    Save All Changes
                  </RetroButton>
                </div>
              )}
              <div className="rounded border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase min-w-[160px]">
                          Player
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase">
                          Pos
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase">
                          Elig
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase">
                          OVR
                        </th>
                        <th
                          className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase"
                          colSpan={3}
                        >
                          Primary Attrs
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase min-w-[120px]">
                          Abilities
                        </th>
                        <th className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase min-w-[80px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {players.map((p) => {
                        const ep = getEffectivePlayer(p);
                        const dirty = hasEdits(p.id);
                        const isPit = getIsPitcherPos(ep.position);
                        const expanded = expandedId === p.id;

                        const primaryAttrs = isPit
                          ? [
                              { field: "velocity", label: "VEL", value: ep.velocity ?? 50 },
                              { field: "control", label: "CTL", value: ep.control ?? 50 },
                              { field: "stamina", label: "STM", value: ep.stamina ?? 50 },
                            ]
                          : [
                              { field: "hitForAvg", label: "CON", value: ep.hitForAvg ?? 50 },
                              { field: "power", label: "PWR", value: ep.power ?? 50 },
                              { field: "speed", label: "SPD", value: ep.speed ?? 50 },
                            ];

                        return (
                          <>
                            <tr
                              key={p.id}
                              className={`transition-colors hover:bg-muted/10 cursor-pointer ${dirty ? "bg-yellow-500/5" : ""}`}
                              onClick={() => setExpandedId(expanded ? null : p.id)}
                              data-testid={`row-player-${p.id}`}
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  {dirty && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                                  )}
                                  <span className="font-medium text-foreground truncate">
                                    {p.firstName} {p.lastName}
                                  </span>
                                </div>
                                <StarBadge stars={ep.starRating} />
                              </td>
                              <td
                                className="px-2 py-2 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Select
                                  value={ep.position}
                                  onValueChange={(v) => updateField(p.id, "position", v)}
                                >
                                  <SelectTrigger
                                    className="h-6 text-xs px-1 w-14"
                                    data-testid={`select-pos-${p.id}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {POSITIONS.map((pos) => (
                                      <SelectItem key={pos} value={pos}>
                                        {pos}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td
                                className="px-2 py-2 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Select
                                  value={ep.eligibility}
                                  onValueChange={(v) => updateField(p.id, "eligibility", v)}
                                >
                                  <SelectTrigger
                                    className="h-6 text-xs px-1 w-14"
                                    data-testid={`select-elig-${p.id}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ELIGIBILITIES.map((e) => (
                                      <SelectItem key={e} value={e}>
                                        {e}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-2 py-2 text-center">
                                <span
                                  className={`font-bold ${ovrColor(ep.overall)}`}
                                  data-testid={`text-ovr-${p.id}`}
                                >
                                  {ep.overall}
                                </span>
                              </td>
                              {primaryAttrs.map((attr) => {
                                const grade = isPit
                                  ? pitcherCommonGrade(attr.value)
                                  : commonGrade(attr.value);
                                return (
                                  <td
                                    key={attr.field}
                                    className="px-2 py-2 text-center"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center justify-center gap-0.5">
                                      <InlineStatCell
                                        value={attr.value}
                                        field={attr.field}
                                        playerId={p.id}
                                        onUpdate={(f, v) => updateField(p.id, f, v)}
                                      />
                                      <span
                                        className={`text-xs font-bold ${gradeColor(grade)}`}
                                        data-testid={`grade-primary-${attr.field}-${p.id}`}
                                      >
                                        {grade}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{attr.label}</p>
                                  </td>
                                );
                              })}
                              <td
                                className="px-2 py-2 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex flex-wrap gap-0.5 max-w-[160px]">
                                  {(ep.abilities ?? []).slice(0, 3).map((ab) => (
                                    <AbilityPill key={ab} name={ab} />
                                  ))}
                                  {(ep.abilities ?? []).length > 3 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{(ep.abilities ?? []).length - 3}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td
                                className="px-2 py-2 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-end gap-1">
                                  {dirty && (
                                    <>
                                      <RetroButton
                                        size="sm"
                                        variant="outline"
                                        className="h-6 px-1.5 text-xs"
                                        onClick={() => discardEdits(p.id)}
                                        disabled={savingAll}
                                        data-testid={`button-discard-${p.id}`}
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                      </RetroButton>
                                      <RetroButton
                                        size="sm"
                                        variant="primary"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => savePlayer(p)}
                                        disabled={savingAll || savingId === p.id}
                                        loading={savingId === p.id}
                                        data-testid={`button-save-${p.id}`}
                                      >
                                        <Save className="w-2.5 h-2.5 mr-1" />
                                        Save
                                      </RetroButton>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {expanded && (
                              <tr
                                key={`${p.id}-expanded`}
                                className={`${dirty ? "bg-yellow-500/5" : "bg-muted/10"}`}
                              >
                                <td colSpan={9} className="px-3 py-3">
                                  <div className="space-y-3">
                                    {isPit ? (
                                      <div>
                                        <p className="text-xs font-semibold text-gold uppercase mb-1.5">
                                          Pitcher Attributes
                                        </p>
                                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                                          {[
                                            { field: "velocity", label: "Velocity" },
                                            { field: "control", label: "Control" },
                                            { field: "stamina", label: "Stamina" },
                                            { field: "stuff", label: "Stuff" },
                                            { field: "wRISP", label: "W/RISP" },
                                            { field: "vsLefty", label: "vs Lefty" },
                                            { field: "poise", label: "Poise" },
                                            { field: "grit", label: "Grit" },
                                            { field: "heater", label: "Heater" },
                                            { field: "agile", label: "Agile" },
                                            { field: "recovery", label: "Recovery" },
                                          ].map((attr) => {
                                            const rawVal =
                                              (ep as unknown as Record<string, number | null>)[attr.field] as number ?? 50;
                                            const grade = pitcherCommonGrade(rawVal);
                                            return (
                                              <div key={attr.field} className="text-center">
                                                <div className="flex items-center justify-center gap-0.5">
                                                  <InlineStatCell
                                                    value={rawVal}
                                                    field={attr.field}
                                                    playerId={p.id}
                                                    onUpdate={(f, v) => updateField(p.id, f, v)}
                                                  />
                                                  <span
                                                    className={`text-xs font-bold ${gradeColor(grade)}`}
                                                    data-testid={`grade-${attr.field}-${p.id}`}
                                                  >
                                                    {grade}
                                                  </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                  {attr.label}
                                                </p>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <p className="text-xs font-semibold text-gold uppercase mb-1.5">
                                          Fielder Attributes
                                        </p>
                                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                                          {[
                                            { field: "hitForAvg", label: "Contact" },
                                            { field: "power", label: "Power" },
                                            { field: "speed", label: "Speed" },
                                            { field: "arm", label: "Arm" },
                                            { field: "fielding", label: "Fielding" },
                                            { field: "errorResistance", label: "Error Res" },
                                            { field: "clutch", label: "Clutch" },
                                            { field: "vsLHP", label: "vs LHP" },
                                            { field: "grit", label: "Grit" },
                                            { field: "stealing", label: "Stealing" },
                                            { field: "running", label: "Running" },
                                            { field: "throwing", label: "Throwing" },
                                            { field: "recovery", label: "Recovery" },
                                          ].map((attr) => {
                                            const rawVal =
                                              (ep as unknown as Record<string, number | null>)[attr.field] as number ?? 50;
                                            const grade = commonGrade(rawVal);
                                            return (
                                              <div key={attr.field} className="text-center">
                                                <div className="flex items-center justify-center gap-0.5">
                                                  <InlineStatCell
                                                    value={rawVal}
                                                    field={attr.field}
                                                    playerId={p.id}
                                                    onUpdate={(f, v) => updateField(p.id, f, v)}
                                                  />
                                                  <span
                                                    className={`text-xs font-bold ${gradeColor(grade)}`}
                                                    data-testid={`grade-${attr.field}-${p.id}`}
                                                  >
                                                    {grade}
                                                  </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                  {attr.label}
                                                </p>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    <div>
                                      <p className="text-xs font-semibold text-gold uppercase mb-1.5">
                                        Special Abilities
                                      </p>
                                      <AbilitiesToggle
                                        abilities={ep.abilities ?? []}
                                        position={ep.position}
                                        onChange={(v) => updateField(p.id, "abilities", v)}
                                      />
                                      {(ep.abilities ?? []).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                          {(ep.abilities ?? []).map((ab) => (
                                            <AbilityPill key={ab} name={ab} />
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {(() => {
                                      const playerFullName = `${p.firstName} ${p.lastName}`;
                                      const playerHistory = auditLogs.filter(
                                        (l) =>
                                          l.action === "Roster Edit" &&
                                          l.details?.includes(playerFullName),
                                      );
                                      const histOpen = historyOpenId === p.id;
                                      return (
                                        <div className="border-t border-border/30 pt-2">
                                          <button
                                            className="flex items-center gap-1.5 w-full text-left group"
                                            onClick={() =>
                                              setHistoryOpenId(histOpen ? null : p.id)
                                            }
                                            data-testid={`button-history-toggle-${p.id}`}
                                          >
                                            <History className="w-3 h-3 text-muted-foreground" />
                                            <span className="text-xs font-semibold text-muted-foreground uppercase group-hover:text-foreground transition-colors">
                                              Edit History
                                            </span>
                                            {playerHistory.length > 0 && (
                                              <span className="text-xs bg-muted/50 text-muted-foreground rounded px-1 ml-0.5">
                                                {playerHistory.length}
                                              </span>
                                            )}
                                            {histOpen ? (
                                              <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />
                                            ) : (
                                              <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
                                            )}
                                          </button>

                                          {histOpen && (
                                            <div
                                              className="mt-2 space-y-1.5"
                                              data-testid={`history-panel-${p.id}`}
                                            >
                                              {playerHistory.length === 0 ? (
                                                <p className="text-xs text-muted-foreground/60 pl-5">
                                                  No edit history yet.
                                                </p>
                                              ) : (
                                                playerHistory.map((log) => (
                                                  <div
                                                    key={log.id}
                                                    className="pl-5 text-xs text-muted-foreground"
                                                  >
                                                    <span className="text-foreground/70">
                                                      {log.details}
                                                    </span>
                                                    <span className="ml-2 opacity-50">
                                                      {new Date(
                                                        log.timestamp,
                                                      ).toLocaleDateString()}
                                                    </span>
                                                  </div>
                                                ))
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}
