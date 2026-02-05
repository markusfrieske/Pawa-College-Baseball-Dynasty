import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Player, Team } from "@shared/schema";

interface LeagueData {
  teams: (Team & { coach?: { firstName: string; lastName: string } })[];
}

type SortField = "lastName" | "position" | "eligibility" | "overall" | "starRating";
type SortDir = "asc" | "desc";

const positions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "DH"];
const eligibilities = ["FR", "SO", "JR", "SR", "RS"];
const hands = ["R", "L", "S"];
const letterGrades = ["G", "F", "D", "C", "B", "A", "S"];
const letterGradeValues: Record<string, number> = { G: 20, F: 40, D: 55, C: 65, B: 75, A: 85, S: 95 };
const valueToGrade = (v: number): string => {
  if (v >= 90) return "S";
  if (v >= 80) return "A";
  if (v >= 70) return "B";
  if (v >= 60) return "C";
  if (v >= 50) return "D";
  if (v >= 30) return "F";
  return "G";
};
const priorityOptions = ["Not Important", "Somewhat", "Very", "Extremely"];
const skinTones = ["light", "medium", "tan", "dark", "deep"];
const hairColors = ["black", "brown", "blonde", "red", "gray"];
const hairStyles = ["short", "buzzcut", "curly", "mullet", "bald"];

export default function EditRostersPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, Partial<Player>>>({});
  const [sortField, setSortField] = useState<SortField>("lastName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: leagueData, isLoading: leagueLoading } = useQuery<LeagueData>({
    queryKey: ["/api/leagues", id],
  });

  const { data: rosterData, isLoading: rosterLoading } = useQuery<{ players: Player[] }>({
    queryKey: ["/api/leagues", id, "roster", selectedTeamId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/roster?teamId=${selectedTeamId}`);
      if (!res.ok) throw new Error("Failed to fetch roster");
      return res.json();
    },
    enabled: !!selectedTeamId,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: { id: string; changes: Partial<Player> }[]) => {
      return apiRequest("PATCH", `/api/leagues/${id}/players/batch`, { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === "/api/leagues" && key[1] === id && key[2] === "roster";
        }
      });
      setChanges({});
      toast({ title: "Roster Saved", description: "All changes have been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const teams = leagueData?.teams || [];
  
  // Set first team as default when data loads
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [selectedTeamId, teams]);

  // Get players from fetched data (already filtered by teamId in API)
  const teamPlayers = rosterData?.players || [];

  // Sort players
  const sortedPlayers = useMemo(() => {
    return [...teamPlayers].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [teamPlayers, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const updatePlayer = (playerId: string, field: keyof Player, value: unknown) => {
    setChanges(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [field]: value,
      },
    }));
  };

  const getPlayerValue = <K extends keyof Player>(player: Player, field: K): Player[K] => {
    if (changes[player.id]?.[field] !== undefined) {
      return changes[player.id][field] as Player[K];
    }
    return player[field];
  };

  const handleSave = () => {
    const updates = Object.entries(changes).map(([id, playerChanges]) => ({
      id,
      changes: playerChanges,
    }));
    if (updates.length > 0) {
      saveMutation.mutate(updates);
    }
  };

  const handleReset = () => {
    setChanges({});
    toast({ title: "Changes Reset", description: "All unsaved changes have been discarded." });
  };

  const hasChanges = Object.keys(changes).length > 0;

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-2 py-2 text-left cursor-pointer hover:bg-muted/50 whitespace-nowrap"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        <span className="text-xs font-pixel text-gold">{label}</span>
        {sortField === field && (
          sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );

  if (leagueLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/league/${id}/commissioner`}>
              <RetroButton variant="outline" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Commissioner
              </RetroButton>
            </Link>
            <h1 className="font-pixel text-xl text-gold">EDIT ROSTERS</h1>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                {Object.keys(changes).length} unsaved changes
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
              Reset
            </RetroButton>
            <RetroButton 
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
              data-testid="button-save"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save All"}
            </RetroButton>
          </div>
        </div>

        {/* Team Tabs */}
        <Tabs value={selectedTeamId || ""} onValueChange={setSelectedTeamId}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-card p-2">
            {teams.map(team => (
              <TabsTrigger 
                key={team.id} 
                value={team.id}
                className="text-xs font-pixel"
                data-testid={`tab-team-${team.id}`}
              >
                {team.abbreviation}
              </TabsTrigger>
            ))}
          </TabsList>

          {teams.map(team => (
            <TabsContent key={team.id} value={team.id}>
              <RetroCard>
                <RetroCardHeader>
                  <h2 className="font-pixel text-gold">{team.name} Roster</h2>
                </RetroCardHeader>
                <RetroCardContent className="p-0">
                  {rosterLoading ? (
                    <div className="p-4">
                      <Skeleton className="h-[400px] w-full" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 sticky top-0">
                          <tr>
                            <SortHeader field="lastName" label="NAME" />
                            <SortHeader field="position" label="POS" />
                            <SortHeader field="eligibility" label="ELIG" />
                            <SortHeader field="overall" label="OVR" />
                            <SortHeader field="starRating" label="STARS" />
                            <th className="px-2 py-2 text-xs font-pixel text-gold">BATS</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">THROWS</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">HOMETOWN</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">STATE</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">CONTACT</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">POWER</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">SPEED</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">ARM</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">FIELD</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">VELO</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">CTRL</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">STAM</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">FB</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">2S</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">SL</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">CB</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">CH</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">CT</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">SNK</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">SPL</th>
                            {/* Common Abilities */}
                            <th className="px-2 py-2 text-xs font-pixel text-gold">CLCH</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">GRIT</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">vsL</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">RCVY</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">STLN</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">RUN</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">THRW</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">POIS</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">HEAT</th>
                            <th className="px-2 py-2 text-xs font-pixel text-gold">AGIL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedPlayers.map((player, idx) => {
                            const isPitcher = player.position === "P";
                            const isChanged = !!changes[player.id];
                            return (
                              <tr 
                                key={player.id} 
                                className={`border-b border-border ${isChanged ? "bg-yellow-500/10" : idx % 2 === 0 ? "bg-muted/10" : ""}`}
                              >
                                {/* Name */}
                                <td className="px-2 py-1">
                                  <div className="flex gap-1">
                                    <Input
                                      className="h-7 w-24 text-xs"
                                      value={getPlayerValue(player, "firstName")}
                                      onChange={(e) => updatePlayer(player.id, "firstName", e.target.value)}
                                      data-testid={`input-firstname-${player.id}`}
                                    />
                                    <Input
                                      className="h-7 w-28 text-xs"
                                      value={getPlayerValue(player, "lastName")}
                                      onChange={(e) => updatePlayer(player.id, "lastName", e.target.value)}
                                      data-testid={`input-lastname-${player.id}`}
                                    />
                                  </div>
                                </td>
                                {/* Position */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={getPlayerValue(player, "position")}
                                    onValueChange={(v) => updatePlayer(player.id, "position", v)}
                                  >
                                    <SelectTrigger className="h-7 w-16 text-xs" data-testid={`select-position-${player.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {positions.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Eligibility */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={getPlayerValue(player, "eligibility")}
                                    onValueChange={(v) => updatePlayer(player.id, "eligibility", v)}
                                  >
                                    <SelectTrigger className="h-7 w-14 text-xs" data-testid={`select-eligibility-${player.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {eligibilities.map(e => (
                                        <SelectItem key={e} value={e}>{e}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Overall */}
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={999}
                                    className="h-7 w-16 text-xs"
                                    value={getPlayerValue(player, "overall")}
                                    onChange={(e) => updatePlayer(player.id, "overall", parseInt(e.target.value) || 1)}
                                    data-testid={`input-overall-${player.id}`}
                                  />
                                </td>
                                {/* Star Rating */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "starRating"))}
                                    onValueChange={(v) => updatePlayer(player.id, "starRating", parseInt(v))}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs" data-testid={`select-stars-${player.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[1, 2, 3, 4, 5].map(s => (
                                        <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Bats */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={getPlayerValue(player, "batHand")}
                                    onValueChange={(v) => updatePlayer(player.id, "batHand", v)}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {hands.map(h => (
                                        <SelectItem key={h} value={h}>{h}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Throws */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={getPlayerValue(player, "throwHand")}
                                    onValueChange={(v) => updatePlayer(player.id, "throwHand", v)}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {hands.map(h => (
                                        <SelectItem key={h} value={h}>{h}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Hometown */}
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-7 w-28 text-xs"
                                    value={getPlayerValue(player, "hometown")}
                                    onChange={(e) => updatePlayer(player.id, "hometown", e.target.value)}
                                  />
                                </td>
                                {/* State */}
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-7 w-12 text-xs"
                                    maxLength={2}
                                    value={getPlayerValue(player, "homeState")}
                                    onChange={(e) => updatePlayer(player.id, "homeState", e.target.value.toUpperCase())}
                                  />
                                </td>
                                {/* Fielder Attributes (1-100 scale) */}
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="h-7 w-12 text-xs"
                                    value={getPlayerValue(player, "hitForAvg") || ""}
                                    onChange={(e) => updatePlayer(player.id, "hitForAvg", parseInt(e.target.value) || null)}
                                    disabled={isPitcher}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="h-7 w-12 text-xs"
                                    value={getPlayerValue(player, "power") || ""}
                                    onChange={(e) => updatePlayer(player.id, "power", parseInt(e.target.value) || null)}
                                    disabled={isPitcher}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="h-7 w-12 text-xs"
                                    value={getPlayerValue(player, "speed") || ""}
                                    onChange={(e) => updatePlayer(player.id, "speed", parseInt(e.target.value) || null)}
                                    disabled={isPitcher}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="h-7 w-12 text-xs"
                                    value={getPlayerValue(player, "arm") || ""}
                                    onChange={(e) => updatePlayer(player.id, "arm", parseInt(e.target.value) || null)}
                                    disabled={isPitcher}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="h-7 w-12 text-xs"
                                    value={getPlayerValue(player, "fielding") || ""}
                                    onChange={(e) => updatePlayer(player.id, "fielding", parseInt(e.target.value) || null)}
                                    disabled={isPitcher}
                                  />
                                </td>
                                {/* Pitcher Attributes (Velocity: 82-102 MPH, Control/Stamina: 1-100) */}
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={82}
                                    max={102}
                                    className="h-7 w-12 text-xs"
                                    value={getPlayerValue(player, "velocity") || ""}
                                    onChange={(e) => updatePlayer(player.id, "velocity", parseInt(e.target.value) || null)}
                                    disabled={!isPitcher}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="h-7 w-12 text-xs"
                                    value={getPlayerValue(player, "control") || ""}
                                    onChange={(e) => updatePlayer(player.id, "control", parseInt(e.target.value) || null)}
                                    disabled={!isPitcher}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="h-7 w-12 text-xs"
                                    value={getPlayerValue(player, "stamina") || ""}
                                    onChange={(e) => updatePlayer(player.id, "stamina", parseInt(e.target.value) || null)}
                                    disabled={!isPitcher}
                                  />
                                </td>
                                {/* Pitch Mix - FB (0-7 dropdown) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "pitchFB") || 0)}
                                    onValueChange={(v) => updatePlayer(player.id, "pitchFB", parseInt(v))}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Pitch Mix - 2S (0-7 dropdown) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "pitch2S") || 0)}
                                    onValueChange={(v) => updatePlayer(player.id, "pitch2S", parseInt(v))}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Pitch Mix - SL (0-7 dropdown) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "pitchSL") || 0)}
                                    onValueChange={(v) => updatePlayer(player.id, "pitchSL", parseInt(v))}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Pitch Mix - CB */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "pitchCB") || 0)}
                                    onValueChange={(v) => updatePlayer(player.id, "pitchCB", parseInt(v))}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Pitch Mix - CH */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "pitchCH") || 0)}
                                    onValueChange={(v) => updatePlayer(player.id, "pitchCH", parseInt(v))}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Pitch Mix - CT */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "pitchCT") || 0)}
                                    onValueChange={(v) => updatePlayer(player.id, "pitchCT", parseInt(v))}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Pitch Mix - SNK */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "pitchSNK") || 0)}
                                    onValueChange={(v) => updatePlayer(player.id, "pitchSNK", parseInt(v))}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Pitch Mix - SPL */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={String(getPlayerValue(player, "pitchSPL") || 0)}
                                    onValueChange={(v) => updatePlayer(player.id, "pitchSPL", parseInt(v))}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Clutch */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "clutch") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "clutch", letterGradeValues[v])}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Grit */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "grit") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "grit", letterGradeValues[v])}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - vsL (vsLHP for fielders, vsLefty for pitchers) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, isPitcher ? "vsLefty" : "vsLHP") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, isPitcher ? "vsLefty" : "vsLHP", letterGradeValues[v])}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Recovery */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "recovery") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "recovery", letterGradeValues[v])}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Stealing (fielders only) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "stealing") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "stealing", letterGradeValues[v])}
                                    disabled={isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Running (fielders only) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "running") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "running", letterGradeValues[v])}
                                    disabled={isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Throwing (fielders only) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "throwing") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "throwing", letterGradeValues[v])}
                                    disabled={isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Poise (pitchers only) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "poise") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "poise", letterGradeValues[v])}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Heater (pitchers only) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "heater") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "heater", letterGradeValues[v])}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {/* Common Abilities - Agile (pitchers only) */}
                                <td className="px-2 py-1">
                                  <Select
                                    value={valueToGrade(getPlayerValue(player, "agile") || 50)}
                                    onValueChange={(v) => updatePlayer(player.id, "agile", letterGradeValues[v])}
                                    disabled={!isPitcher}
                                  >
                                    <SelectTrigger className="h-7 w-12 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {letterGrades.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </RetroCardContent>
              </RetroCard>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
