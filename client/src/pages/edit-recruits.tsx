import { useState, useMemo, useCallback, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, RotateCcw, ChevronUp, ChevronDown, Filter } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Recruit } from "@shared/schema";
import { ALL_PITCHER_ABILITIES, ALL_FIELDER_ABILITIES, getAbilityByName, type Ability } from "@shared/abilities";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface RecruitingData {
  recruits: Recruit[];
}

interface LeagueData {
  commissionerId: string;
}

type SortField = "lastName" | "position" | "overall" | "starRating" | "classRank";
type SortDir = "asc" | "desc";

const positions = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "DH"];
const hands = ["R", "L", "S"];
const recruitTypes = ["HS", "JUCO"];
const recruitYears = ["FR", "SO", "JR"];
const priorityOptions = ["Not Important", "Somewhat", "Very", "Extremely"];
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

export default function EditRecruitsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [changes, setChanges] = useState<Record<string, Partial<Recruit>>>({});
  const [sortField, setSortField] = useState<SortField>("classRank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [positionFilter, setPositionFilter] = useState<string>("all");

  const { data: leagueData, isLoading: leagueLoading } = useQuery<LeagueData>({
    queryKey: ["/api/leagues", id],
  });

  const { data: authData, isLoading: authLoading } = useQuery<{ id: string; email: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const isCommissioner = !!(authData?.id && leagueData?.commissionerId && authData.id === leagueData.commissionerId);
  const isGuest = authData?.email === "guest@guest.com";

  const { data: recruitingData, isLoading } = useQuery<RecruitingData>({
    queryKey: ["/api/leagues", id, "recruiting"],
    enabled: isCommissioner,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: { id: string; changes: Partial<Recruit> }[]) => {
      return apiRequest("PATCH", `/api/leagues/${id}/recruits/batch`, { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "recruiting"] });
      setChanges({});
      toast({ title: "Recruits Saved", description: "All changes have been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const recruits = recruitingData?.recruits || [];

  // Filter by position
  const filteredRecruits = useMemo(() => {
    if (positionFilter === "all") return recruits;
    return recruits.filter(r => r.position === positionFilter);
  }, [recruits, positionFilter]);

  // Sort recruits
  const sortedRecruits = useMemo(() => {
    return [...filteredRecruits].sort((a, b) => {
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
  }, [filteredRecruits, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const updateRecruit = (recruitId: string, field: keyof Recruit, value: unknown) => {
    setChanges(prev => ({
      ...prev,
      [recruitId]: {
        ...prev[recruitId],
        [field]: value,
      },
    }));
  };

  const getRecruitValue = <K extends keyof Recruit>(recruit: Recruit, field: K): Recruit[K] => {
    if (changes[recruit.id]?.[field] !== undefined) {
      return changes[recruit.id][field] as Recruit[K];
    }
    return recruit[field];
  };

  // Handle Enter key to save and move to next row
  const handleKeyDown = useCallback((
    e: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      // Use requestAnimationFrame for more deterministic timing after React render
      requestAnimationFrame(() => {
        // Try to find next enabled input, skipping disabled ones
        for (let i = 1; i <= 5; i++) {
          const nextRow = rowIndex + i;
          const selector = `input[data-row="${nextRow}"][data-field="${field}"]:not(:disabled)`;
          const nextInput = document.querySelector(selector) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
            nextInput.select();
            break;
          }
        }
      });
    }
  }, []);

  const handleSave = () => {
    const updates = Object.entries(changes).map(([id, recruitChanges]) => ({
      id,
      changes: recruitChanges,
    }));
    if (updates.length > 0) {
      saveMutation.mutate(updates);
    }
  };

  const isRankSorted = sortField === "classRank";

  const moveRecruit = useCallback((recruitId: string, direction: "up" | "down") => {
    if (!isRankSorted) return;
    const sorted = [...sortedRecruits];
    const currentIdx = sorted.findIndex(r => r.id === recruitId);
    if (currentIdx < 0) return;
    const targetIdx = direction === "up" 
      ? (sortDir === "asc" ? currentIdx - 1 : currentIdx + 1)
      : (sortDir === "asc" ? currentIdx + 1 : currentIdx - 1);
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    
    const currentRank = getRecruitValue(sorted[currentIdx], "classRank");
    const targetRank = getRecruitValue(sorted[targetIdx], "classRank");
    
    if (currentRank === targetRank) {
      const newRank = direction === "up" 
        ? Math.max(1, currentRank - 1) 
        : currentRank + 1;
      updateRecruit(sorted[currentIdx].id, "classRank", newRank);
    } else {
      updateRecruit(sorted[currentIdx].id, "classRank", targetRank);
      updateRecruit(sorted[targetIdx].id, "classRank", currentRank);
    }
  }, [sortedRecruits, changes, isRankSorted, sortDir]);

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

  if (isLoading || leagueLoading || authLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!isCommissioner) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="font-pixel text-2xl text-red-500">ACCESS DENIED</h1>
          <p className="text-muted-foreground text-sm">
            {isGuest
              ? "Guests cannot edit recruiting classes. Only the league commissioner has access to this page."
              : "Only the league commissioner can access recruiting class editing."}
          </p>
          <Link href={`/league/${id}/commissioner`}>
            <RetroButton variant="outline" data-testid="button-back-denied">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Commissioner
            </RetroButton>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1800px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/league/${id}/commissioner`}>
              <RetroButton variant="outline" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Commissioner
              </RetroButton>
            </Link>
            <h1 className="font-pixel text-xl text-gold">EDIT RECRUITING CLASS</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Position Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {positions.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

        {/* Recruits Table */}
        <RetroCard>
          <RetroCardHeader>
            <h2 className="font-pixel text-gold">Recruiting Class ({sortedRecruits.length} recruits)</h2>
          </RetroCardHeader>
          <RetroCardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <SortHeader field="classRank" label="RNK" />
                    <SortHeader field="lastName" label="NAME" />
                    <SortHeader field="position" label="POS" />
                    <SortHeader field="overall" label="OVR" />
                    <SortHeader field="starRating" label="STARS" />
                    <th className="px-2 py-2 text-xs font-pixel text-gold whitespace-nowrap" title="Blue Chip">BC</th>
                    <th className="px-2 py-2 text-xs font-pixel text-green-400 whitespace-nowrap" title="Gem">GEM</th>
                    <th className="px-2 py-2 text-xs font-pixel text-red-400 whitespace-nowrap" title="Bust">BUST</th>
                    <th className="px-2 py-2 text-xs font-pixel text-yellow-400 whitespace-nowrap" title="Generational Gem">G.GEM</th>
                    <th className="px-2 py-2 text-xs font-pixel text-red-600 whitespace-nowrap" title="Generational Bust">G.BUST</th>
                    <th className="px-2 py-2 text-xs font-pixel text-gold">TYPE</th>
                    <th className="px-2 py-2 text-xs font-pixel text-gold">YEAR</th>
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
                    <th className="px-2 py-2 text-xs font-pixel text-gold">PROX</th>
                    <th className="px-2 py-2 text-xs font-pixel text-gold">REP</th>
                    <th className="px-2 py-2 text-xs font-pixel text-gold">PT</th>
                    <th className="px-2 py-2 text-xs font-pixel text-gold">ACAD</th>
                    <th className="px-2 py-2 text-xs font-pixel text-gold">PRES</th>
                    <th className="px-2 py-2 text-xs font-pixel text-gold">FAC</th>
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
                    <th className="px-2 py-2 text-xs font-pixel text-gold">ABILITIES</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecruits.map((recruit, idx) => {
                    const isPitcher = recruit.position === "P";
                    const isChanged = !!changes[recruit.id];
                    return (
                      <tr 
                        key={recruit.id} 
                        className={`border-b border-border ${isChanged ? "bg-yellow-500/10" : idx % 2 === 0 ? "bg-muted/10" : ""}`}
                      >
                        {/* Class Rank */}
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-0.5">
                            <span className="text-xs text-muted-foreground w-6 text-right" data-testid={`text-rank-${recruit.id}`}>
                              {getRecruitValue(recruit, "classRank")}
                            </span>
                            {isRankSorted && (
                              <div className="flex flex-col">
                                <button
                                  className="text-muted-foreground hover:text-gold p-0 h-3 leading-none"
                                  onClick={() => moveRecruit(recruit.id, "up")}
                                  disabled={idx === 0}
                                  data-testid={`button-rank-up-${recruit.id}`}
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  className="text-muted-foreground hover:text-gold p-0 h-3 leading-none"
                                  onClick={() => moveRecruit(recruit.id, "down")}
                                  disabled={idx === sortedRecruits.length - 1}
                                  data-testid={`button-rank-down-${recruit.id}`}
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        {/* Name */}
                        <td className="px-2 py-1">
                          <div className="flex gap-1">
                            <Input
                              className="h-7 w-20 text-xs"
                              value={getRecruitValue(recruit, "firstName")}
                              onChange={(e) => updateRecruit(recruit.id, "firstName", e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, "firstName")}
                              data-row={idx}
                              data-field="firstName"
                            />
                            <Input
                              className="h-7 w-24 text-xs"
                              value={getRecruitValue(recruit, "lastName")}
                              onChange={(e) => updateRecruit(recruit.id, "lastName", e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, "lastName")}
                              data-row={idx}
                              data-field="lastName"
                            />
                          </div>
                        </td>
                        {/* Position */}
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "position")}
                            onValueChange={(v) => updateRecruit(recruit.id, "position", v)}
                          >
                            <SelectTrigger className="h-7 w-14 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {positions.map(p => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* Overall */}
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={150}
                            max={650}
                            className="h-7 w-14 text-xs no-spinner"
                            value={getRecruitValue(recruit, "overall")}
                            onChange={(e) => updateRecruit(recruit.id, "overall", parseInt(e.target.value) || 150)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "overall")}
                            data-row={idx}
                            data-field="overall"
                          />
                        </td>
                        {/* Star Rating */}
                        <td className="px-2 py-1">
                          <Select
                            value={String(getRecruitValue(recruit, "starRating"))}
                            onValueChange={(v) => updateRecruit(recruit.id, "starRating", parseInt(v))}
                          >
                            <SelectTrigger className="h-7 w-12 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map(s => (
                                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* Blue Chip */}
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={!!getRecruitValue(recruit, "isBlueChip")}
                            onCheckedChange={(v) => updateRecruit(recruit.id, "isBlueChip", !!v)}
                            className="accent-gold"
                            data-testid={`checkbox-bc-${recruit.id}`}
                          />
                        </td>
                        {/* Gem */}
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={!!getRecruitValue(recruit, "isGem")}
                            onCheckedChange={(v) => {
                              updateRecruit(recruit.id, "isGem", !!v);
                              if (!v) updateRecruit(recruit.id, "isGenerationalGem", false);
                            }}
                            className="accent-green-500"
                            data-testid={`checkbox-gem-${recruit.id}`}
                          />
                        </td>
                        {/* Bust */}
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={!!getRecruitValue(recruit, "isBust")}
                            onCheckedChange={(v) => {
                              updateRecruit(recruit.id, "isBust", !!v);
                              if (!v) updateRecruit(recruit.id, "isGenerationalBust", false);
                            }}
                            className="accent-red-500"
                            data-testid={`checkbox-bust-${recruit.id}`}
                          />
                        </td>
                        {/* Generational Gem */}
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={!!getRecruitValue(recruit, "isGenerationalGem")}
                            onCheckedChange={(v) => {
                              updateRecruit(recruit.id, "isGenerationalGem", !!v);
                              if (v) updateRecruit(recruit.id, "isGem", true);
                            }}
                            className="accent-yellow-400"
                            data-testid={`checkbox-ggem-${recruit.id}`}
                          />
                        </td>
                        {/* Generational Bust */}
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={!!getRecruitValue(recruit, "isGenerationalBust")}
                            onCheckedChange={(v) => {
                              updateRecruit(recruit.id, "isGenerationalBust", !!v);
                              if (v) updateRecruit(recruit.id, "isBust", true);
                            }}
                            className="accent-red-600"
                            data-testid={`checkbox-gbust-${recruit.id}`}
                          />
                        </td>
                        {/* Type */}
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "recruitType")}
                            onValueChange={(v) => updateRecruit(recruit.id, "recruitType", v)}
                          >
                            <SelectTrigger className="h-7 w-16 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {recruitTypes.map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* Year */}
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "recruitYear")}
                            onValueChange={(v) => updateRecruit(recruit.id, "recruitYear", v)}
                          >
                            <SelectTrigger className="h-7 w-12 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {recruitYears.map(y => (
                                <SelectItem key={y} value={y}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* Bats */}
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "batHand")}
                            onValueChange={(v) => updateRecruit(recruit.id, "batHand", v)}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
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
                            value={getRecruitValue(recruit, "throwHand")}
                            onValueChange={(v) => updateRecruit(recruit.id, "throwHand", v)}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
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
                            className="h-7 w-24 text-xs"
                            value={getRecruitValue(recruit, "hometown")}
                            onChange={(e) => updateRecruit(recruit.id, "hometown", e.target.value)}
                          />
                        </td>
                        {/* State */}
                        <td className="px-2 py-1">
                          <Input
                            className="h-7 w-10 text-xs"
                            maxLength={2}
                            value={getRecruitValue(recruit, "homeState")}
                            onChange={(e) => updateRecruit(recruit.id, "homeState", e.target.value.toUpperCase())}
                          />
                        </td>
                        {/* Fielder Attributes (1-100 scale) */}
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            className="h-7 w-10 text-xs no-spinner"
                            value={getRecruitValue(recruit, "hitForAvg") || ""}
                            onChange={(e) => updateRecruit(recruit.id, "hitForAvg", parseInt(e.target.value) || null)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "hitForAvg")}
                            data-row={idx}
                            data-field="hitForAvg"
                            disabled={isPitcher}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            className="h-7 w-10 text-xs no-spinner"
                            value={getRecruitValue(recruit, "power") || ""}
                            onChange={(e) => updateRecruit(recruit.id, "power", parseInt(e.target.value) || null)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "power")}
                            data-row={idx}
                            data-field="power"
                            disabled={isPitcher}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            className="h-7 w-10 text-xs no-spinner"
                            value={getRecruitValue(recruit, "speed") || ""}
                            onChange={(e) => updateRecruit(recruit.id, "speed", parseInt(e.target.value) || null)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "speed")}
                            data-row={idx}
                            data-field="speed"
                            disabled={isPitcher}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            className="h-7 w-10 text-xs no-spinner"
                            value={getRecruitValue(recruit, "arm") || ""}
                            onChange={(e) => updateRecruit(recruit.id, "arm", parseInt(e.target.value) || null)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "arm")}
                            data-row={idx}
                            data-field="arm"
                            disabled={isPitcher}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            className="h-7 w-10 text-xs no-spinner"
                            value={getRecruitValue(recruit, "fielding") || ""}
                            onChange={(e) => updateRecruit(recruit.id, "fielding", parseInt(e.target.value) || null)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "fielding")}
                            data-row={idx}
                            data-field="fielding"
                            disabled={isPitcher}
                          />
                        </td>
                        {/* Pitcher Attributes (Velocity: 82-102 MPH, Control/Stamina: 1-100) */}
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={82}
                            max={102}
                            className="h-7 w-10 text-xs no-spinner"
                            value={getRecruitValue(recruit, "velocity") || ""}
                            onChange={(e) => updateRecruit(recruit.id, "velocity", parseInt(e.target.value) || null)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "velocity")}
                            data-row={idx}
                            data-field="velocity"
                            disabled={!isPitcher}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            className="h-7 w-10 text-xs no-spinner"
                            value={getRecruitValue(recruit, "control") || ""}
                            onChange={(e) => updateRecruit(recruit.id, "control", parseInt(e.target.value) || null)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "control")}
                            data-row={idx}
                            data-field="control"
                            disabled={!isPitcher}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            className="h-7 w-10 text-xs no-spinner"
                            value={getRecruitValue(recruit, "stamina") || ""}
                            onChange={(e) => updateRecruit(recruit.id, "stamina", parseInt(e.target.value) || null)}
                            onKeyDown={(e) => handleKeyDown(e, idx, "stamina")}
                            data-row={idx}
                            data-field="stamina"
                            disabled={!isPitcher}
                          />
                        </td>
                        {/* Pitch Mix - FB (0-1 checkbox style - presence only) */}
                        <td className="px-2 py-1">
                          <Select
                            value={String(Math.min(1, getRecruitValue(recruit, "pitchFB") || 0))}
                            onValueChange={(v) => updateRecruit(recruit.id, "pitchFB", parseInt(v))}
                            disabled={!isPitcher}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1].map(n => (
                                <SelectItem key={n} value={String(n)}>{n === 1 ? "✓" : "-"}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* Pitch Mix - 2S (0-1 checkbox style - presence only) */}
                        <td className="px-2 py-1">
                          <Select
                            value={String(Math.min(1, getRecruitValue(recruit, "pitch2S") || 0))}
                            onValueChange={(v) => updateRecruit(recruit.id, "pitch2S", parseInt(v))}
                            disabled={!isPitcher}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1].map(n => (
                                <SelectItem key={n} value={String(n)}>{n === 1 ? "✓" : "-"}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={String(getRecruitValue(recruit, "pitchSL") || 0)}
                            onValueChange={(v) => updateRecruit(recruit.id, "pitchSL", parseInt(v))}
                            disabled={!isPitcher}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={String(getRecruitValue(recruit, "pitchCB") || 0)}
                            onValueChange={(v) => updateRecruit(recruit.id, "pitchCB", parseInt(v))}
                            disabled={!isPitcher}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={String(getRecruitValue(recruit, "pitchCH") || 0)}
                            onValueChange={(v) => updateRecruit(recruit.id, "pitchCH", parseInt(v))}
                            disabled={!isPitcher}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={String(getRecruitValue(recruit, "pitchCT") || 0)}
                            onValueChange={(v) => updateRecruit(recruit.id, "pitchCT", parseInt(v))}
                            disabled={!isPitcher}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={String(getRecruitValue(recruit, "pitchSNK") || 0)}
                            onValueChange={(v) => updateRecruit(recruit.id, "pitchSNK", parseInt(v))}
                            disabled={!isPitcher}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={String(getRecruitValue(recruit, "pitchSPL") || 0)}
                            onValueChange={(v) => updateRecruit(recruit.id, "pitchSPL", parseInt(v))}
                            disabled={!isPitcher}
                          >
                            <SelectTrigger className="h-7 w-10 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* Priorities */}
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "proximityPriority")}
                            onValueChange={(v) => updateRecruit(recruit.id, "proximityPriority", v)}
                          >
                            <SelectTrigger className="h-7 w-16 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {priorityOptions.map(p => (
                                <SelectItem key={p} value={p}>{p.substring(0, 4)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "reputationPriority")}
                            onValueChange={(v) => updateRecruit(recruit.id, "reputationPriority", v)}
                          >
                            <SelectTrigger className="h-7 w-16 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {priorityOptions.map(p => (
                                <SelectItem key={p} value={p}>{p.substring(0, 4)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "playingTimePriority")}
                            onValueChange={(v) => updateRecruit(recruit.id, "playingTimePriority", v)}
                          >
                            <SelectTrigger className="h-7 w-16 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {priorityOptions.map(p => (
                                <SelectItem key={p} value={p}>{p.substring(0, 4)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "academicsPriority")}
                            onValueChange={(v) => updateRecruit(recruit.id, "academicsPriority", v)}
                          >
                            <SelectTrigger className="h-7 w-16 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {priorityOptions.map(p => (
                                <SelectItem key={p} value={p}>{p.substring(0, 4)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "prestigePriority")}
                            onValueChange={(v) => updateRecruit(recruit.id, "prestigePriority", v)}
                          >
                            <SelectTrigger className="h-7 w-16 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {priorityOptions.map(p => (
                                <SelectItem key={p} value={p}>{p.substring(0, 4)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            value={getRecruitValue(recruit, "facilitiesPriority")}
                            onValueChange={(v) => updateRecruit(recruit.id, "facilitiesPriority", v)}
                          >
                            <SelectTrigger className="h-7 w-16 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {priorityOptions.map(p => (
                                <SelectItem key={p} value={p}>{p.substring(0, 4)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* Common Abilities - Clutch */}
                        <td className="px-2 py-1">
                          <Select
                            value={valueToGrade(getRecruitValue(recruit, "clutch") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "clutch", letterGradeValues[v])}
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
                            value={valueToGrade(getRecruitValue(recruit, "grit") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "grit", letterGradeValues[v])}
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
                        {/* Common Abilities - vsL */}
                        <td className="px-2 py-1">
                          <Select
                            value={valueToGrade(getRecruitValue(recruit, isPitcher ? "vsLefty" : "vsLHP") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, isPitcher ? "vsLefty" : "vsLHP", letterGradeValues[v])}
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
                            value={valueToGrade(getRecruitValue(recruit, "recovery") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "recovery", letterGradeValues[v])}
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
                            value={valueToGrade(getRecruitValue(recruit, "stealing") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "stealing", letterGradeValues[v])}
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
                            value={valueToGrade(getRecruitValue(recruit, "running") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "running", letterGradeValues[v])}
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
                            value={valueToGrade(getRecruitValue(recruit, "throwing") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "throwing", letterGradeValues[v])}
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
                            value={valueToGrade(getRecruitValue(recruit, "poise") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "poise", letterGradeValues[v])}
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
                            value={valueToGrade(getRecruitValue(recruit, "heater") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "heater", letterGradeValues[v])}
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
                            value={valueToGrade(getRecruitValue(recruit, "agile") || 50)}
                            onValueChange={(v) => updateRecruit(recruit.id, "agile", letterGradeValues[v])}
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
                        {/* Special Abilities */}
                        <td className="px-2 py-1">
                          <AbilityEditor
                            abilities={(getRecruitValue(recruit, "abilities") as string[]) || []}
                            onChange={(newAbilities) => updateRecruit(recruit.id, "abilities", newAbilities)}
                            isPitcher={isPitcher}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </RetroCardContent>
        </RetroCard>
      </div>
    </div>
  );
}

function AbilityEditor({
  abilities,
  onChange,
  isPitcher,
}: {
  abilities: string[];
  onChange: (abilities: string[]) => void;
  isPitcher: boolean;
}) {
  const availableAbilities = isPitcher ? ALL_PITCHER_ABILITIES : ALL_FIELDER_ABILITIES;
  
  const toggleAbility = (abilityName: string) => {
    if (abilities.includes(abilityName)) {
      onChange(abilities.filter(a => a !== abilityName));
    } else {
      onChange([...abilities, abilityName]);
    }
  };
  
  const getTierColor = (tier: string) => {
    switch (tier) {
      case "gold": return "text-yellow-500";
      case "blue": return "text-blue-400";
      case "red": return "text-red-400";
      default: return "text-muted-foreground";
    }
  };
  
  const currentAbilities = abilities.map(name => getAbilityByName(name)).filter(Boolean) as Ability[];
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="h-7 min-w-[100px] px-2 text-left text-xs bg-background border border-border rounded flex items-center gap-1 hover:bg-muted/50">
          {abilities.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <div className="flex gap-0.5 flex-wrap">
              {currentAbilities.slice(0, 2).map((ability) => (
                <span 
                  key={ability.name}
                  className={`text-[9px] px-1 rounded ${getTierColor(ability.tier)}`}
                >
                  {ability.name.split(" ")[0]}
                </span>
              ))}
              {abilities.length > 2 && (
                <span className="text-[9px] text-muted-foreground">+{abilities.length - 2}</span>
              )}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-96 overflow-y-auto p-2" align="start">
        <div className="space-y-2">
          <div className="font-pixel text-gold text-xs mb-2">SPECIAL ABILITIES</div>
          {["gold", "blue", "red"].map(tier => {
            const tierAbilities = availableAbilities.filter(a => a.tier === tier);
            if (tierAbilities.length === 0) return null;
            return (
              <div key={tier} className="space-y-1">
                <div className={`text-[10px] font-semibold uppercase ${getTierColor(tier)}`}>
                  {tier} Tier
                </div>
                {tierAbilities.map(ability => (
                  <label 
                    key={ability.name}
                    className="flex items-start gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
                  >
                    <Checkbox
                      checked={abilities.includes(ability.name)}
                      onCheckedChange={() => toggleAbility(ability.name)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className={`text-xs ${getTierColor(ability.tier)}`}>{ability.name}</div>
                      <div className="text-[9px] text-muted-foreground">{ability.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
