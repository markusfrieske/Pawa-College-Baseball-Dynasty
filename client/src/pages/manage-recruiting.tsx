import { useState, useMemo, useRef, useEffect } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Wand2, Upload, Trash2, Download, ChevronDown, Check, X, LogIn, Share2 } from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { ALL_ABILITIES, getAbilitiesForPosition } from "@shared/abilities";
import { RecruitingWizard } from "@/components/recruiting-wizard";
import { ShareClassDialog } from "@/components/share-class-dialog";

interface PlayerAppearance {
  skinTone: string;
  hairColor: string;
  hairStyle: string;
}

interface RecruitData {
  firstName: string;
  lastName: string;
  position: string;
  starRating: number;
  overall: number;
  homeState: string;
  hometown: string;
  potential: string;
  abilities: string[];
  jerseyNumber?: number;
  rank?: number;
  appearance?: PlayerAppearance;
  hitForAvg?: number;
  power?: number;
  speed?: number;
  arm?: number;
  fielding?: number;
  errorResistance?: number;
  velocity?: number;
  control?: number;
  stamina?: number;
  stuff?: number;
  clutch?: number;
  vsLHP?: number;
  grit?: number;
  stealing?: number;
  running?: number;
  throwing?: number;
  recovery?: number;
  wRISP?: number;
  vsLefty?: number;
  poise?: number;
  heater?: number;
  agile?: number;
  pitchFB?: number;
  pitch2S?: number;
  pitchSL?: number;
  pitchCB?: number;
  pitchCH?: number;
  pitchCT?: number;
  pitchSNK?: number;
  pitchSPL?: number;
}

const WIZARD_THEME_LABELS: Record<string, string> = {
  balanced: "Balanced",
  high_velocity: "High Velocity",
  sluggers: "Sluggers",
  top_heavy: "Top Heavy",
  hidden_gems: "Hidden Gems",
  bust_heavy: "Bust Heavy",
  elite_pitching: "Elite Pitching",
  raw_talent: "Raw Talent",
  position_players: "Position Players",
  defense_first: "Defense First",
  power_class: "Power Class",
};

interface ClassSummary {
  recruitCount: number;
  starDist: Record<number, number>;
  posDist: Record<string, number>;
  blueChips: number;
  gems: number;
  busts: number;
  genGems: number;
  genBusts: number;
  avgOvr: number;
  theme: string | null;
}

interface VersionedClassData {
  version: 1;
  source: "wizard" | "import" | "manual";
  config?: Record<string, unknown>;
  summary: ClassSummary;
  recruits: RecruitData[];
}

interface SavedClass {
  id: number | string;
  name: string;
  description: string;
  recruitCount: number;
  classData: RecruitData[] | { theme?: string; recruits: RecruitData[] } | VersionedClassData;
  createdAt?: string;
  isLocal?: boolean;
}

function getClassRecruits(classData: SavedClass["classData"]): RecruitData[] {
  if (Array.isArray(classData)) return classData;
  const obj = classData as Record<string, unknown>;
  return Array.isArray(obj.recruits) ? (obj.recruits as RecruitData[]) : [];
}

function getClassTheme(classData: SavedClass["classData"]): string | null {
  if (Array.isArray(classData)) return null;
  const obj = classData as Record<string, unknown>;
  // versioned format: theme lives in summary
  if (obj.version === 1) {
    const summary = obj.summary as Record<string, unknown> | undefined;
    return typeof summary?.theme === "string" ? summary.theme : null;
  }
  return typeof obj.theme === "string" ? obj.theme : null;
}

function getClassSummary(classData: SavedClass["classData"]): ClassSummary | null {
  if (Array.isArray(classData)) return null;
  const obj = classData as Record<string, unknown>;
  if (obj.version === 1 && obj.summary && typeof obj.summary === "object") {
    return obj.summary as ClassSummary;
  }
  return null;
}

type SortField = "lastName" | "position" | "overall" | "starRating";
type SortDir = "asc" | "desc";

const POSITIONS = ["P", "C", "1B", "2B", "SS", "3B", "OF"];
const POTENTIAL_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];

const SKIN_TONES = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "tan", label: "Tan" },
  { value: "dark", label: "Dark" },
  { value: "deep", label: "Deep" },
];

const HAIR_COLORS = [
  { value: "black", label: "Black" },
  { value: "brown", label: "Brown" },
  { value: "blonde", label: "Blonde" },
  { value: "red", label: "Red" },
  { value: "gray", label: "Gray" },
  { value: "white", label: "White" },
];

const HAIR_STYLES = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
  { value: "bald", label: "Bald" },
];


const HOMETOWNS = [
  "Springfield", "Franklin", "Clinton", "Madison", "Georgetown",
  "Salem", "Bristol", "Fairview", "Oxford", "Manchester",
  "Burlington", "Milton", "Greenville", "Newport", "Riverside",
  "Chester", "Hudson", "Arlington", "Ashland", "Clayton",
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseCSV(text: string): RecruitData[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const recruits: RecruitData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    if (cols.length < 6) continue;
    const [firstName, lastName, position, overallStr, starStr, homeState] = cols;
    const overall = parseInt(overallStr) || 200;
    const starRating = Math.max(1, Math.min(5, parseInt(starStr) || 3));
    recruits.push({
      firstName: firstName || "Unknown",
      lastName: lastName || "Player",
      position: POSITIONS.includes(position) ? position : "OF",
      starRating,
      overall: Math.max(150, Math.min(650, overall)),
      homeState: (homeState || "TX").substring(0, 2).toUpperCase(),
      hometown: pickRandom(HOMETOWNS),
      potential: pickRandom(POTENTIAL_GRADES.slice(3, 7)),
      abilities: [],
      jerseyNumber: randInt(1, 99),
      rank: 0,
    });
  }
  return recruits;
}

function exportCSV(recruits: RecruitData[]): string {
  const header = "firstName,lastName,position,overall,starRating,homeState";
  const rows = recruits.map(r =>
    `${r.firstName},${r.lastName},${r.position},${r.overall},${r.starRating},${r.homeState}`
  );
  return [header, ...rows].join("\n");
}

function AbilitiesDropdown({
  selectedAbilities,
  position,
  onChange,
  testIdPrefix,
}: {
  selectedAbilities: string[];
  position: string;
  onChange: (abilities: string[]) => void;
  testIdPrefix: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const availableAbilities = useMemo(() => {
    return getAbilitiesForPosition(position);
  }, [position]);

  const filteredAbilities = useMemo(() => {
    if (!searchTerm) return availableAbilities;
    return availableAbilities.filter(a =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [availableAbilities, searchTerm]);

  const groupedAbilities = useMemo(() => {
    const gold = filteredAbilities.filter(a => a.tier === "gold");
    const blue = filteredAbilities.filter(a => a.tier === "blue");
    const red = filteredAbilities.filter(a => a.tier === "red");
    return { gold, blue, red };
  }, [filteredAbilities]);

  const toggleAbility = (name: string) => {
    if (selectedAbilities.includes(name)) {
      onChange(selectedAbilities.filter(a => a !== name));
    } else {
      onChange([...selectedAbilities, name]);
    }
  };

  const tierColor = (tier: string) => {
    if (tier === "gold") return "text-yellow-500";
    if (tier === "blue") return "text-blue-400";
    if (tier === "red") return "text-red-400";
    return "text-muted-foreground";
  };

  const tierBadgeVariant = (tier: string): "default" | "secondary" | "outline" | "destructive" => {
    if (tier === "red") return "destructive";
    return "secondary";
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className="flex items-center gap-1 border border-border rounded-md px-2 py-1 cursor-pointer min-h-[28px] bg-background"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`${testIdPrefix}-abilities-trigger`}
      >
        {selectedAbilities.length === 0 ? (
          <span className="text-muted-foreground text-xs">Select...</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedAbilities.map(ab => {
              const ability = ALL_ABILITIES.find(a => a.name === ab);
              return (
                <Badge
                  key={ab}
                  variant={tierBadgeVariant(ability?.tier || "blue")}
                  className={`text-xs ${ability?.tier === "gold" ? "bg-yellow-600/20 text-yellow-500 border-yellow-600/30" : ability?.tier === "red" ? "" : "bg-blue-600/20 text-blue-400 border-blue-600/30"}`}
                >
                  {ab}
                  <button
                    className="ml-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAbility(ab);
                    }}
                  >
                    <X className="w-2 h-2" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
        <ChevronDown className="w-3 h-3 ml-auto shrink-0 text-muted-foreground" />
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 w-80 bg-card border border-border rounded-md shadow-lg max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border">
            <Input
              className="h-7 text-xs"
              placeholder="Search abilities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              data-testid={`${testIdPrefix}-abilities-search`}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {(["gold", "blue", "red"] as const).map(tier => {
              const abilities = groupedAbilities[tier];
              if (abilities.length === 0) return null;
              return (
                <div key={tier}>
                  <div className={`px-2 py-1 text-xs uppercase sticky top-0 bg-card border-b border-border ${tierColor(tier)}`}>
                    {tier} Abilities ({abilities.length})
                  </div>
                  {abilities.map(ability => {
                    const isSelected = selectedAbilities.includes(ability.name);
                    return (
                      <div
                        key={ability.name}
                        className={`flex items-center gap-2 px-2 py-1 cursor-pointer text-xs hover:bg-muted/30 ${isSelected ? "bg-muted/20" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAbility(ability.name);
                        }}
                        data-testid={`${testIdPrefix}-ability-${ability.name.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        <div className={`w-4 h-4 border rounded-sm flex items-center justify-center shrink-0 ${isSelected ? "bg-gold border-gold" : "border-border"}`}>
                          {isSelected && <Check className="w-3 h-3 text-background" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`${tierColor(tier)} font-medium`}>{ability.name}</span>
                          <p className="text-muted-foreground text-xs truncate">{ability.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-border flex justify-end">
            <RetroButton size="sm" variant="outline" onClick={() => setIsOpen(false)} data-testid={`${testIdPrefix}-abilities-close`}>
              Done
            </RetroButton>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManageRecruitingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [currentClass, setCurrentClass] = useState<RecruitData[]>([]);
  const [className, setClassName] = useState("");
  const [classDescription, setClassDescription] = useState("");
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [sortField, setSortField] = useState<SortField>("starRating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [positionFilter, setPositionFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [expandedRecruit, setExpandedRecruit] = useState<number | null>(null);
  const [showGuestBanner, setShowGuestBanner] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTargetId, setShareTargetId] = useState<string | null>(null);

  const { data: user } = useQuery<{ id: string; email: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: savedClasses, isLoading: classesLoading } = useQuery<SavedClass[]>({
    queryKey: ["/api/saved-recruiting-classes"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string; recruitCount: number; classData: RecruitData[] }) => {
      if (editingId) {
        return apiRequest("PATCH", `/api/saved-recruiting-classes/${editingId}`, payload);
      }
      return apiRequest("POST", "/api/saved-recruiting-classes", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
      toast({ title: "Class Saved", description: `Recruiting class "${className}" has been saved.` });
      setSaveDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error Saving", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number | string) => {
      return apiRequest("DELETE", `/api/saved-recruiting-classes/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
      toast({ title: "Class Deleted", description: "The recruiting class has been removed." });
      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
      if (editingId === deleteTargetId) {
        setCurrentClass([]);
        setClassName("");
        setClassDescription("");
        setEditingId(null);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error Deleting", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const { data: leagues, isLoading: leaguesLoading } = useQuery<Array<{ id: string; name: string; commissionerId: string; currentPhase: string }>>({
    queryKey: ["/api/leagues"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user,
  });

  const [wizardLeagueId, setWizardLeagueId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [leaguePickerOpen, setLeaguePickerOpen] = useState(false);
  const [loadIntoLeagueOpen, setLoadIntoLeagueOpen] = useState(false);
  const [loadTargetClassId, setLoadTargetClassId] = useState<string | null>(null);
  const [loadTargetLeagueId, setLoadTargetLeagueId] = useState<string>("");
  const [localSavedClasses, setLocalSavedClasses] = useState<SavedClass[]>([]);

  const commissionerLeagues = (leagues ?? []).filter(l => l.commissionerId === user?.id);

  // Load localStorage classes for guests
  useEffect(() => {
    if (!user) {
      try {
        const stored = JSON.parse(localStorage.getItem("local-saved-classes") || "[]");
        setLocalSavedClasses(stored);
      } catch {
        setLocalSavedClasses([]);
      }
    }
  }, [user]);

  // Auto-open wizard if leagueId is passed as a URL search param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leagueId = params.get("leagueId");
    if (leagueId) {
      setWizardLeagueId(leagueId);
      setWizardOpen(true);
    }
  }, []);

  const handleOpenWizard = () => {
    if (!user) {
      // Guest mode: open standalone wizard without a league
      setWizardLeagueId(null);
      setWizardOpen(true);
      return;
    }
    if (commissionerLeagues.length === 0) {
      // Logged in but no commissioner leagues: open standalone mode
      setWizardLeagueId(null);
      setWizardOpen(true);
      return;
    }
    if (commissionerLeagues.length === 1) {
      setWizardLeagueId(commissionerLeagues[0].id);
      setWizardOpen(true);
    } else {
      setLeaguePickerOpen(true);
    }
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setWizardLeagueId(null);
  };

  const handleWizardSavedToLibrary = () => {
    qc.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes"] });
    // Refresh local classes for guests
    if (!user) {
      try {
        const stored = JSON.parse(localStorage.getItem("local-saved-classes") || "[]");
        setLocalSavedClasses(stored);
      } catch {
        setLocalSavedClasses([]);
      }
    }
  };

  const loadIntoLeagueMutation = useMutation({
    mutationFn: async ({ leagueId, classId }: { leagueId: string; classId: string }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/recruiting/load-saved-class`, { savedClassId: classId });
      return res.json();
    },
    onSuccess: (data: { count: number; className: string }) => {
      toast({ title: "Class Loaded into League", description: `"${data.className}" (${data.count} recruits) is now the active recruiting class.` });
      setLoadIntoLeagueOpen(false);
      setLoadTargetClassId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: parseErrorMessage(err), variant: "destructive" });
    },
  });

  const handleLoadIntoLeague = (cls: SavedClass) => {
    if (commissionerLeagues.length === 0) {
      toast({ title: "No Commissioner Leagues", description: "You are not a commissioner of any active league.", variant: "destructive" });
      return;
    }
    const classId = String(cls.id);
    if (commissionerLeagues.length === 1) {
      loadIntoLeagueMutation.mutate({ leagueId: commissionerLeagues[0].id, classId });
    } else {
      setLoadTargetClassId(classId);
      setLoadTargetLeagueId(commissionerLeagues[0].id);
      setLoadIntoLeagueOpen(true);
    }
  };

  const handleLoadClass = (cls: SavedClass) => {
    setCurrentClass(getClassRecruits(cls.classData));
    setClassName(cls.name);
    setClassDescription(cls.description || "");
    setEditingId(cls.id);
    toast({ title: "Class Loaded", description: `Loaded "${cls.name}" with ${cls.recruitCount} recruits.` });
  };

  const handleDeleteLocalClass = (id: string) => {
    try {
      const stored: any[] = JSON.parse(localStorage.getItem("local-saved-classes") || "[]");
      const updated = stored.filter((c: any) => c.id !== id);
      localStorage.setItem("local-saved-classes", JSON.stringify(updated));
      setLocalSavedClasses(updated);
      toast({ title: "Class Deleted", description: "Local class removed from browser storage." });
    } catch {
      toast({ title: "Error", description: "Could not delete local class.", variant: "destructive" });
    }
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const recruits = parseCSV(text);
      if (recruits.length === 0) {
        toast({ title: "Import Failed", description: "No valid recruit data found in CSV.", variant: "destructive" });
        return;
      }
      setCurrentClass(recruits);
      setEditingId(null);
      setClassName("");
      setClassDescription("");
      toast({ title: "CSV Imported", description: `Imported ${recruits.length} recruits from CSV.` });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCSVExport = () => {
    if (currentClass.length === 0) return;
    const csv = exportCSV(currentClass);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${className || "recruiting-class"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    if (!className.trim()) {
      toast({ title: "Name Required", description: "Please enter a name for the class.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      name: className.trim(),
      description: classDescription.trim(),
      recruitCount: currentClass.length,
      classData: currentClass,
    });
  };

  const handleDeleteConfirm = () => {
    if (deleteTargetId !== null) {
      deleteMutation.mutate(deleteTargetId);
    }
  };

  const updateRecruit = (index: number, field: keyof RecruitData, value: string | number | string[] | PlayerAppearance) => {
    setCurrentClass(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeRecruit = (index: number) => {
    setCurrentClass(prev => prev.filter((_, i) => i !== index));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filteredRecruits = useMemo(() => {
    if (positionFilter === "all") return currentClass;
    return currentClass.filter(r => r.position === positionFilter);
  }, [currentClass, positionFilter]);

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

  const starCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    currentClass.forEach(r => { counts[r.starRating] = (counts[r.starRating] || 0) + 1; });
    return counts;
  }, [currentClass]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/dashboard">
              <RetroButton variant="outline" size="sm" data-testid="button-back-dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Dashboard
              </RetroButton>
            </Link>
            <h1 className="font-display text-xl font-bold text-gold">MANAGE RECRUITING CLASSES</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <RetroButton
              size="sm"
              onClick={handleOpenWizard}
              disabled={user ? leaguesLoading : false}
              data-testid="button-open-wizard"
            >
              {user && leaguesLoading ? (
                <div className="w-4 h-4 mr-2 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Create with Wizard
            </RetroButton>
            <label>
              <RetroButton variant="outline" size="sm" data-testid="button-import-csv" onClick={() => document.getElementById("csv-import")?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </RetroButton>
            </label>
            <input
              id="csv-import"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCSVImport}
              data-testid="input-csv-file"
            />
          </div>
        </div>

        {classesLoading ? (
          <div className="space-y-2" data-testid="loading-classes">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : savedClasses && savedClasses.length > 0 ? (
          <RetroCard data-testid="section-saved-classes">
            <RetroCardHeader>
              <h2 className="text-gold">SAVED CLASSES ({savedClasses.length})</h2>
            </RetroCardHeader>
            <RetroCardContent className="p-0">
              <div className="grid gap-2">
                {savedClasses.map((cls) => {
                  const summary = getClassSummary(cls.classData);
                  const recruits = summary ? [] : getClassRecruits(cls.classData);
                  const theme = summary ? summary.theme : getClassTheme(cls.classData);
                  const themeLabel = theme ? (WIZARD_THEME_LABELS[theme] ?? theme) : null;
                  // Use stored starDist from summary when available, fall back to computing from recruits
                  const starCounts = summary
                    ? [5, 4, 3, 2, 1]
                        .filter(s => (summary.starDist[s] ?? 0) > 0)
                        .map(s => ({ star: s, count: summary.starDist[s] }))
                    : [5, 4, 3, 2, 1]
                        .map(s => ({ star: s, count: recruits.filter(r => r.starRating === s).length }))
                        .filter(x => x.count > 0);
                  const savedDate = cls.createdAt ? new Date(cls.createdAt).toLocaleDateString() : null;
                  const clsObj = cls.classData as Record<string, unknown>;
                  const source: string | null = (!Array.isArray(cls.classData) && clsObj.version === 1)
                    ? (clsObj.source as string) : null;
                  return (
                  <div
                    key={cls.id}
                    className={`p-3 border border-border ${editingId === cls.id ? "border-gold bg-gold/5" : ""}`}
                    data-testid={`saved-class-${cls.id}`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-foreground" data-testid={`class-name-${cls.id}`}>{cls.name}</span>
                          <Badge variant="secondary" className="text-xs" data-testid={`class-count-${cls.id}`}>
                            {cls.recruitCount} recruits
                          </Badge>
                          {themeLabel && (
                            <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/40" data-testid={`class-theme-${cls.id}`}>{themeLabel}</Badge>
                          )}
                          {source === "import" && (
                            <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/40" data-testid={`class-source-${cls.id}`}>Imported</Badge>
                          )}
                          {clsObj.ai_assisted === true && (
                            <Badge variant="outline" className="text-xs text-purple-400 border-purple-400/40" data-testid={`class-ai-assisted-${cls.id}`}>AI-Assisted</Badge>
                          )}
                          {editingId === cls.id && (
                            <Badge variant="outline" className="text-xs text-gold border-gold">Active</Badge>
                          )}
                        </div>
                        {cls.description && (
                          <p className="text-muted-foreground text-xs mt-1 truncate" data-testid={`class-desc-${cls.id}`}>{cls.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {starCounts.map(({ star, count }) => (
                            <span key={star} className="text-xs text-muted-foreground" data-testid={`class-stars-${cls.id}-${star}`}>
                              {"★".repeat(star)} {count}
                            </span>
                          ))}
                          {summary && summary.avgOvr > 0 && (
                            <span className="text-xs text-muted-foreground" data-testid={`class-avgovr-${cls.id}`}>
                              Avg {summary.avgOvr} OVR
                            </span>
                          )}
                          {summary && summary.blueChips > 0 && (
                            <span className="text-xs text-amber-400" data-testid={`class-bluechips-${cls.id}`}>
                              {summary.blueChips} BC
                            </span>
                          )}
                          {summary && summary.genGems > 0 && (
                            <span className="text-xs text-purple-400" data-testid={`class-gengems-${cls.id}`}>
                              {summary.genGems} GG
                            </span>
                          )}
                          {summary && summary.genBusts > 0 && (
                            <span className="text-xs text-red-400" data-testid={`class-genbusts-${cls.id}`}>
                              {summary.genBusts} GB
                            </span>
                          )}
                          {savedDate && (
                            <span className="text-xs text-muted-foreground/60" data-testid={`class-date-${cls.id}`}>
                              Saved {savedDate}
                            </span>
                          )}
                        </div>
                      </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {commissionerLeagues.length > 0 && (
                        <RetroButton
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadIntoLeague(cls)}
                          disabled={loadIntoLeagueMutation.isPending}
                          data-testid={`button-load-into-league-${cls.id}`}
                        >
                          Load into League
                        </RetroButton>
                      )}
                      <RetroButton
                        variant="outline"
                        size="sm"
                        onClick={() => { setShareTargetId(String(cls.id)); setShareDialogOpen(true); }}
                        data-testid={`button-share-class-${cls.id}`}
                      >
                        <Share2 className="w-3 h-3" />
                      </RetroButton>
                      <RetroButton variant="outline" size="sm" onClick={() => handleLoadClass(cls)} data-testid={`button-load-class-${cls.id}`}>
                        Edit
                      </RetroButton>
                      <RetroButton variant="destructive" size="sm" onClick={() => { setDeleteTargetId(cls.id); setDeleteDialogOpen(true); }} data-testid={`button-delete-class-${cls.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </RetroButton>
                    </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </RetroCardContent>
          </RetroCard>
        ) : !user && localSavedClasses.length > 0 ? (
          <RetroCard data-testid="section-local-saved-classes">
            <RetroCardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-gold">LOCAL CLASSES ({localSavedClasses.length})</h2>
                <Link href="/login">
                  <RetroButton variant="outline" size="sm" data-testid="button-signin-from-local">
                    <LogIn className="w-3 h-3 mr-1" />
                    Sign in to save permanently
                  </RetroButton>
                </Link>
              </div>
            </RetroCardHeader>
            <RetroCardContent className="p-0">
              <div className="grid gap-2">
                {localSavedClasses.map((cls) => (
                  <div
                    key={cls.id}
                    className={`flex items-center justify-between gap-4 p-3 border border-border ${editingId === cls.id ? "border-gold bg-gold/5" : ""}`}
                    data-testid={`local-class-${cls.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{cls.name}</span>
                        <Badge variant="secondary" className="text-xs">{cls.recruitCount} recruits</Badge>
                        <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">Local</Badge>
                        {(() => { const d = cls.classData as Record<string, unknown>; return !Array.isArray(cls.classData) && d.ai_assisted === true; })() && (
                          <Badge variant="outline" className="text-xs text-purple-400 border-purple-400/40">AI-Assisted</Badge>
                        )}
                      </div>
                      {cls.description && (
                        <p className="text-muted-foreground text-xs mt-1 truncate">{cls.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <RetroButton variant="outline" size="sm" onClick={() => handleLoadClass(cls)} data-testid={`button-load-local-${cls.id}`}>
                        Load
                      </RetroButton>
                      <RetroButton variant="destructive" size="sm" onClick={() => handleDeleteLocalClass(String(cls.id))} data-testid={`button-delete-local-${cls.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </RetroButton>
                    </div>
                  </div>
                ))}
              </div>
            </RetroCardContent>
          </RetroCard>
        ) : !user ? (
          <RetroCard data-testid="section-signin-prompt">
            <RetroCardContent className="py-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <LogIn className="w-8 h-8 text-gold" />
                <p className="text-xs font-semibold text-gold">SIGN IN TO SAVE YOUR RECRUITING CLASSES</p>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Create an account or sign in to save, load, and manage your recruiting classes across sessions. Guests can still use the wizard and save locally.
                </p>
                <div className="flex gap-2 flex-wrap justify-center">
                  <Link href="/login">
                    <RetroButton size="sm" data-testid="button-signin-prompt">
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In
                    </RetroButton>
                  </Link>
                  <RetroButton variant="outline" size="sm" onClick={handleOpenWizard} data-testid="button-try-wizard-guest">
                    <Wand2 className="w-4 h-4 mr-2" />
                    Try Wizard
                  </RetroButton>
                </div>
              </div>
            </RetroCardContent>
          </RetroCard>
        ) : (
          <RetroCard data-testid="section-no-classes">
            <RetroCardContent>
              <p className="text-muted-foreground text-center text-sm">
                No saved recruiting classes yet. Use 'Create with Wizard' or import a CSV to get started.
              </p>
            </RetroCardContent>
          </RetroCard>
        )}

        {currentClass.length > 0 && (
          <>
            <RetroCard data-testid="section-class-summary">
              <RetroCardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <h2 className="text-gold">
                    {editingId ? `EDITING: ${className}` : "NEW RECRUITING CLASS"} ({currentClass.length} recruits)
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    {currentClass.length > 0 && (
                      <RetroButton variant="outline" size="sm" onClick={handleCSVExport} data-testid="button-export-csv">
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                      </RetroButton>
                    )}
                    <RetroButton
                      size="sm"
                      onClick={() => setSaveDialogOpen(true)}
                      disabled={!user}
                      title={!user ? "Sign in to save classes" : undefined}
                      data-testid="button-save-class"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {user ? "Save Class" : "Sign in to Save"}
                    </RetroButton>
                  </div>
                </div>
              </RetroCardHeader>
              <RetroCardContent>
                <div className="flex items-center gap-4 flex-wrap">
                  {[5, 4, 3, 2, 1].map(star => (
                    <div key={star} className="flex items-center gap-1" data-testid={`star-count-${star}`}>
                      <span className="text-xs font-semibold text-gold">{star}-Star:</span>
                      <span className="text-foreground text-sm">{starCounts[star] || 0}</span>
                    </div>
                  ))}
                </div>
              </RetroCardContent>
            </RetroCard>

            <RetroCard data-testid="section-recruit-table">
              <RetroCardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-gold">RECRUITS</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Filter:</span>
                    <Select value={positionFilter} onValueChange={setPositionFilter}>
                      <SelectTrigger className="h-8 w-24 text-xs" data-testid="select-position-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {POSITIONS.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </RetroCardHeader>
              <RetroCardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-recruits">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs text-gold">#</th>
                        <SortHeader field="lastName" label="NAME" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader field="position" label="POS" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader field="overall" label="OVR" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader field="starRating" label="STARS" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <th className="px-2 py-2 text-left text-xs text-gold">JERSEY</th>
                        <th className="px-2 py-2 text-left text-xs text-gold">STATE</th>
                        <th className="px-2 py-2 text-left text-xs text-gold">HOMETOWN</th>
                        <th className="px-2 py-2 text-left text-xs text-gold">POTENTIAL</th>
                        <th className="px-2 py-2 text-left text-xs text-gold">ABILITIES</th>
                        <th className="px-2 py-2 text-left text-xs text-gold">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecruits.map((recruit, idx) => {
                        const originalIndex = currentClass.indexOf(recruit);
                        const isExpanded = expandedRecruit === originalIndex;
                        return (
                          <>
                            <tr
                              key={idx}
                              className={`border-b border-border cursor-pointer ${isExpanded ? "bg-gold/10" : idx % 2 === 0 ? "bg-muted/10" : ""}`}
                              onClick={() => setExpandedRecruit(isExpanded ? null : originalIndex)}
                              data-testid={`recruit-row-${idx}`}
                            >
                              <td className="px-2 py-1 text-muted-foreground text-xs">{idx + 1}</td>
                              <td className="px-2 py-1">
                                <div className="flex items-center gap-2">
                                  <PlayerPortrait
                                    skinTone={recruit.appearance?.skinTone || "light"}
                                    hairColor={recruit.appearance?.hairColor || "brown"}
                                    hairStyle={recruit.appearance?.hairStyle || "short"}
                                    isRecruit={true}
                                    className="w-6 h-6 flex-shrink-0"
                                  />
                                  <span className="text-foreground text-xs whitespace-nowrap">
                                    {recruit.firstName} {recruit.lastName}
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-1">
                                <Badge variant="outline" className="text-xs">{recruit.position}</Badge>
                              </td>
                              <td className="px-2 py-1 font-bold text-foreground text-xs">{recruit.overall}</td>
                              <td className="px-2 py-1">
                                <span className="text-gold text-xs font-semibold">{"*".repeat(recruit.starRating)}</span>
                              </td>
                              <td className="px-2 py-1 text-muted-foreground text-xs">{recruit.jerseyNumber || "--"}</td>
                              <td className="px-2 py-1 text-muted-foreground text-xs">{recruit.homeState}</td>
                              <td className="px-2 py-1 text-muted-foreground text-xs">{recruit.hometown}</td>
                              <td className="px-2 py-1 text-muted-foreground text-xs">{recruit.potential}</td>
                              <td className="px-2 py-1">
                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                  {recruit.abilities.length > 0 ? recruit.abilities.map((ab, ai) => (
                                    <Badge key={ai} variant="secondary" className="text-xs" data-testid={`badge-ability-${idx}-${ai}`}>
                                      {ab}
                                    </Badge>
                                  )) : (
                                    <span className="text-muted-foreground text-xs">--</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-1">
                                <RetroButton
                                  variant="destructive"
                                  size="sm"
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); removeRecruit(originalIndex); }}
                                  data-testid={`button-remove-recruit-${idx}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </RetroButton>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`edit-${idx}`} className="bg-card border-b border-border">
                                <td colSpan={11} className="p-4">
                                  <RecruitEditPanel
                                    recruit={recruit}
                                    originalIndex={originalIndex}
                                    onUpdate={updateRecruit}
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

            {showGuestBanner && !user && (
              <div
                className="flex items-center justify-between gap-4 rounded border border-gold/40 bg-gold/10 px-4 py-3"
                data-testid="banner-guest-save"
              >
                <div className="flex items-center gap-2">
                  <LogIn className="w-4 h-4 text-gold shrink-0" />
                  <span className="text-sm text-foreground">
                    Sign in to save this class before it's gone
                  </span>
                </div>
                <Link href="/login" className="text-xs font-semibold text-gold hover:underline whitespace-nowrap" data-testid="link-guest-signin">
                  Sign In
                </Link>
              </div>
            )}
          </>
        )}

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent data-testid="dialog-save-class">
            <DialogHeader>
              <DialogTitle className="text-gold">Save Recruiting Class</DialogTitle>
              <DialogDescription>
                Enter a name and optional description for this recruiting class.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">Class Name</label>
                <Input
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. 2026 Recruiting Class"
                  data-testid="input-class-name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">Description (optional)</label>
                <Input
                  value={classDescription}
                  onChange={(e) => setClassDescription(e.target.value)}
                  placeholder="Optional description..."
                  data-testid="input-class-description"
                />
              </div>
              <div className="flex justify-end gap-2">
                <RetroButton variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)} data-testid="button-cancel-save">
                  Cancel
                </RetroButton>
                <RetroButton
                  size="sm"
                  onClick={handleSave}
                  loading={saveMutation.isPending}
                  data-testid="button-confirm-save"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingId ? "Update" : "Save"}
                </RetroButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Share Class Dialog */}
        <ShareClassDialog
          classId={shareTargetId}
          open={shareDialogOpen}
          onClose={() => { setShareDialogOpen(false); setShareTargetId(null); }}
        />

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent data-testid="dialog-delete-class">
            <DialogHeader>
              <DialogTitle className="text-gold">Delete Recruiting Class</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this recruiting class? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-4">
              <RetroButton variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
                Cancel
              </RetroButton>
              <RetroButton
                variant="destructive"
                size="sm"
                onClick={handleDeleteConfirm}
                loading={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </RetroButton>
            </div>
          </DialogContent>
        </Dialog>

        {/* League picker for multi-commissioner leagues */}
        <Dialog open={leaguePickerOpen} onOpenChange={setLeaguePickerOpen}>
          <DialogContent data-testid="dialog-league-picker">
            <DialogHeader>
              <DialogTitle className="text-gold text-sm">Select League</DialogTitle>
              <DialogDescription>
                Choose which league to create a recruiting class for.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              {commissionerLeagues.map(l => (
                <button
                  key={l.id}
                  className="w-full text-left p-3 rounded border border-border hover:border-gold/50 hover:bg-gold/5 transition-colors"
                  onClick={() => { setLeaguePickerOpen(false); setWizardLeagueId(l.id); setWizardOpen(true); }}
                  data-testid={`button-pick-league-${l.id}`}
                >
                  <div className="text-xs font-semibold text-gold">{l.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 capitalize">{l.currentPhase?.replace(/_/g, " ")}</div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Load into League picker for multi-league commissioners */}
        <Dialog open={loadIntoLeagueOpen} onOpenChange={setLoadIntoLeagueOpen}>
          <DialogContent data-testid="dialog-load-into-league">
            <DialogHeader>
              <DialogTitle className="text-gold text-sm">Load into League</DialogTitle>
              <DialogDescription>
                Choose which league to load this recruiting class into. This will replace the current recruit pool.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Select value={loadTargetLeagueId} onValueChange={setLoadTargetLeagueId}>
                <SelectTrigger data-testid="select-load-target-league">
                  <SelectValue placeholder="Select league" />
                </SelectTrigger>
                <SelectContent>
                  {commissionerLeagues.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} — {l.currentPhase?.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-2">
                <RetroButton variant="outline" size="sm" onClick={() => setLoadIntoLeagueOpen(false)} data-testid="button-cancel-load-league">
                  Cancel
                </RetroButton>
                <RetroButton
                  size="sm"
                  onClick={() => {
                    if (loadTargetClassId && loadTargetLeagueId) {
                      loadIntoLeagueMutation.mutate({ leagueId: loadTargetLeagueId, classId: loadTargetClassId });
                    }
                  }}
                  loading={loadIntoLeagueMutation.isPending}
                  disabled={!loadTargetLeagueId || !loadTargetClassId}
                  data-testid="button-confirm-load-league"
                >
                  Load Class
                </RetroButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <RecruitingWizard
        open={wizardOpen}
        leagueId={wizardLeagueId ?? undefined}
        onClose={handleWizardClose}
        onSaved={handleWizardClose}
        onSavedToLibrary={handleWizardSavedToLibrary}
        user={user}
      />
    </div>
  );
}

function RecruitEditPanel({
  recruit,
  originalIndex,
  onUpdate,
}: {
  recruit: RecruitData;
  originalIndex: number;
  onUpdate: (index: number, field: keyof RecruitData, value: string | number | string[] | PlayerAppearance) => void;
}) {
  const appearance = recruit.appearance || { skinTone: "light", hairColor: "brown", hairStyle: "short" };

  const updateAppearance = (field: keyof PlayerAppearance, value: string) => {
    const updated = { ...appearance, [field]: value };
    onUpdate(originalIndex, "appearance", updated);
  };

  return (
    <div className="space-y-4" data-testid={`panel-edit-recruit-${originalIndex}`}>
      <div className="flex items-start gap-6 flex-wrap">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gold mb-1">RECRUIT AVATAR</p>
          <div className="flex items-center gap-4">
            <PlayerPortrait
              skinTone={appearance.skinTone}
              hairColor={appearance.hairColor}
              hairStyle={appearance.hairStyle}
              isRecruit={true}
              className="w-20 h-20"
            />
            <div className="space-y-2">
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">Skin Tone</label>
                <Select value={appearance.skinTone} onValueChange={(v) => updateAppearance("skinTone", v)}>
                  <SelectTrigger className="h-7 w-24 text-xs" data-testid={`select-skinTone-recruit-${originalIndex}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SKIN_TONES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">Hair Color</label>
                <Select value={appearance.hairColor} onValueChange={(v) => updateAppearance("hairColor", v)}>
                  <SelectTrigger className="h-7 w-24 text-xs" data-testid={`select-hairColor-recruit-${originalIndex}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HAIR_COLORS.map(h => (
                      <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">Hair Style</label>
                <Select value={appearance.hairStyle} onValueChange={(v) => updateAppearance("hairStyle", v)}>
                  <SelectTrigger className="h-7 w-24 text-xs" data-testid={`select-hairStyle-recruit-${originalIndex}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HAIR_STYLES.map(h => (
                      <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">First Name</label>
              <Input
                className="h-7 w-28 text-xs"
                value={recruit.firstName}
                onChange={(e) => onUpdate(originalIndex, "firstName", e.target.value)}
                data-testid={`input-firstName-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Last Name</label>
              <Input
                className="h-7 w-28 text-xs"
                value={recruit.lastName}
                onChange={(e) => onUpdate(originalIndex, "lastName", e.target.value)}
                data-testid={`input-lastName-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Position</label>
              <Select value={recruit.position} onValueChange={(v) => onUpdate(originalIndex, "position", v)}>
                <SelectTrigger className="h-7 w-16 text-xs" data-testid={`select-position-recruit-${originalIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Stars</label>
              <Select value={String(recruit.starRating)} onValueChange={(v) => onUpdate(originalIndex, "starRating", parseInt(v))}>
                <SelectTrigger className="h-7 w-14 text-xs" data-testid={`select-stars-recruit-${originalIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(s => (
                    <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Jersey #</label>
              <Input
                type="number"
                min={1}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.jerseyNumber || ""}
                onChange={(e) => onUpdate(originalIndex, "jerseyNumber", parseInt(e.target.value) || 1)}
                data-testid={`input-jersey-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Overall</label>
              <Input
                type="number"
                min={1}
                max={999}
                className="h-7 w-16 text-xs"
                value={recruit.overall}
                onChange={(e) => onUpdate(originalIndex, "overall", parseInt(e.target.value) || 1)}
                data-testid={`input-overall-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Rank</label>
              <Input
                type="number"
                min={0}
                max={999}
                className="h-7 w-16 text-xs"
                value={recruit.rank || ""}
                onChange={(e) => onUpdate(originalIndex, "rank", parseInt(e.target.value) || 0)}
                data-testid={`input-rank-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Home City</label>
              <Input
                className="h-7 w-28 text-xs"
                value={recruit.hometown}
                onChange={(e) => onUpdate(originalIndex, "hometown", e.target.value)}
                data-testid={`input-hometown-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Home State</label>
              <Input
                className="h-7 w-16 text-xs"
                maxLength={2}
                value={recruit.homeState}
                onChange={(e) => onUpdate(originalIndex, "homeState", e.target.value.toUpperCase())}
                data-testid={`input-state-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Potential</label>
              <Select value={recruit.potential} onValueChange={(v) => onUpdate(originalIndex, "potential", v)}>
                <SelectTrigger className="h-7 w-16 text-xs" data-testid={`select-potential-recruit-${originalIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POTENTIAL_GRADES.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gold mb-2">ATTRIBUTES</p>
        {recruit.position === "P" ? (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Velocity</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.velocity ?? ""}
                onChange={(e) => onUpdate(originalIndex, "velocity", parseInt(e.target.value) || 0)}
                data-testid={`input-velocity-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Control</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.control ?? ""}
                onChange={(e) => onUpdate(originalIndex, "control", parseInt(e.target.value) || 0)}
                data-testid={`input-control-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Stuff</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.stuff ?? ""}
                onChange={(e) => onUpdate(originalIndex, "stuff", parseInt(e.target.value) || 0)}
                data-testid={`input-stuff-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Stamina</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.stamina ?? ""}
                onChange={(e) => onUpdate(originalIndex, "stamina", parseInt(e.target.value) || 0)}
                data-testid={`input-stamina-recruit-${originalIndex}`}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Hit for Avg</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.hitForAvg ?? ""}
                onChange={(e) => onUpdate(originalIndex, "hitForAvg", parseInt(e.target.value) || 0)}
                data-testid={`input-hitForAvg-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Power</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.power ?? ""}
                onChange={(e) => onUpdate(originalIndex, "power", parseInt(e.target.value) || 0)}
                data-testid={`input-power-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Speed</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.speed ?? ""}
                onChange={(e) => onUpdate(originalIndex, "speed", parseInt(e.target.value) || 0)}
                data-testid={`input-speed-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Arm</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.arm ?? ""}
                onChange={(e) => onUpdate(originalIndex, "arm", parseInt(e.target.value) || 0)}
                data-testid={`input-arm-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Fielding</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.fielding ?? ""}
                onChange={(e) => onUpdate(originalIndex, "fielding", parseInt(e.target.value) || 0)}
                data-testid={`input-fielding-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">Error Res</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.errorResistance ?? ""}
                onChange={(e) => onUpdate(originalIndex, "errorResistance", parseInt(e.target.value) || 0)}
                data-testid={`input-errorResistance-recruit-${originalIndex}`}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gold mb-2">COMMON ABILITIES</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="space-y-0.5">
            <label className="text-xs font-semibold text-gold uppercase">Clutch</label>
            <Input
              type="number"
              min={0}
              max={99}
              className="h-7 w-16 text-xs"
              value={recruit.clutch ?? ""}
              onChange={(e) => onUpdate(originalIndex, "clutch", parseInt(e.target.value) || 0)}
              data-testid={`input-clutch-recruit-${originalIndex}`}
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-xs font-semibold text-gold uppercase">Grit</label>
            <Input
              type="number"
              min={0}
              max={99}
              className="h-7 w-16 text-xs"
              value={recruit.grit ?? ""}
              onChange={(e) => onUpdate(originalIndex, "grit", parseInt(e.target.value) || 0)}
              data-testid={`input-grit-recruit-${originalIndex}`}
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-xs font-semibold text-gold uppercase">Running</label>
            <Input
              type="number"
              min={0}
              max={99}
              className="h-7 w-16 text-xs"
              value={recruit.running ?? ""}
              onChange={(e) => onUpdate(originalIndex, "running", parseInt(e.target.value) || 0)}
              data-testid={`input-running-recruit-${originalIndex}`}
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-xs font-semibold text-gold uppercase">Agile</label>
            <Input
              type="number"
              min={0}
              max={99}
              className="h-7 w-16 text-xs"
              value={recruit.agile ?? ""}
              onChange={(e) => onUpdate(originalIndex, "agile", parseInt(e.target.value) || 0)}
              data-testid={`input-agile-recruit-${originalIndex}`}
            />
          </div>
          {recruit.position === "P" ? (
            <>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">Poise</label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  className="h-7 w-16 text-xs"
                  value={recruit.poise ?? ""}
                  onChange={(e) => onUpdate(originalIndex, "poise", parseInt(e.target.value) || 0)}
                  data-testid={`input-poise-recruit-${originalIndex}`}
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">Heater</label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  className="h-7 w-16 text-xs"
                  value={recruit.heater ?? ""}
                  onChange={(e) => onUpdate(originalIndex, "heater", parseInt(e.target.value) || 0)}
                  data-testid={`input-heater-recruit-${originalIndex}`}
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">Recovery</label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  className="h-7 w-16 text-xs"
                  value={recruit.recovery ?? ""}
                  onChange={(e) => onUpdate(originalIndex, "recovery", parseInt(e.target.value) || 0)}
                  data-testid={`input-recovery-recruit-${originalIndex}`}
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">vs Lefty</label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  className="h-7 w-16 text-xs"
                  value={recruit.vsLefty ?? ""}
                  onChange={(e) => onUpdate(originalIndex, "vsLefty", parseInt(e.target.value) || 0)}
                  data-testid={`input-vsLefty-recruit-${originalIndex}`}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">vs LHP</label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  className="h-7 w-16 text-xs"
                  value={recruit.vsLHP ?? ""}
                  onChange={(e) => onUpdate(originalIndex, "vsLHP", parseInt(e.target.value) || 0)}
                  data-testid={`input-vsLHP-recruit-${originalIndex}`}
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">w/ RISP</label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  className="h-7 w-16 text-xs"
                  value={recruit.wRISP ?? ""}
                  onChange={(e) => onUpdate(originalIndex, "wRISP", parseInt(e.target.value) || 0)}
                  data-testid={`input-wRISP-recruit-${originalIndex}`}
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">Stealing</label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  className="h-7 w-16 text-xs"
                  value={recruit.stealing ?? ""}
                  onChange={(e) => onUpdate(originalIndex, "stealing", parseInt(e.target.value) || 0)}
                  data-testid={`input-stealing-recruit-${originalIndex}`}
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-gold uppercase">Throwing</label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  className="h-7 w-16 text-xs"
                  value={recruit.throwing ?? ""}
                  onChange={(e) => onUpdate(originalIndex, "throwing", parseInt(e.target.value) || 0)}
                  data-testid={`input-throwing-recruit-${originalIndex}`}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {recruit.position === "P" && (
        <div>
          <p className="text-xs font-semibold text-gold mb-2">PITCH MIX</p>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">FB</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.pitchFB ?? ""}
                onChange={(e) => onUpdate(originalIndex, "pitchFB", parseInt(e.target.value) || 0)}
                data-testid={`input-pitchFB-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">2S</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.pitch2S ?? ""}
                onChange={(e) => onUpdate(originalIndex, "pitch2S", parseInt(e.target.value) || 0)}
                data-testid={`input-pitch2S-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">SL</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.pitchSL ?? ""}
                onChange={(e) => onUpdate(originalIndex, "pitchSL", parseInt(e.target.value) || 0)}
                data-testid={`input-pitchSL-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">CB</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.pitchCB ?? ""}
                onChange={(e) => onUpdate(originalIndex, "pitchCB", parseInt(e.target.value) || 0)}
                data-testid={`input-pitchCB-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">CH</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.pitchCH ?? ""}
                onChange={(e) => onUpdate(originalIndex, "pitchCH", parseInt(e.target.value) || 0)}
                data-testid={`input-pitchCH-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">CT</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.pitchCT ?? ""}
                onChange={(e) => onUpdate(originalIndex, "pitchCT", parseInt(e.target.value) || 0)}
                data-testid={`input-pitchCT-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">SNK</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.pitchSNK ?? ""}
                onChange={(e) => onUpdate(originalIndex, "pitchSNK", parseInt(e.target.value) || 0)}
                data-testid={`input-pitchSNK-recruit-${originalIndex}`}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-gold uppercase">SPL</label>
              <Input
                type="number"
                min={0}
                max={99}
                className="h-7 w-16 text-xs"
                value={recruit.pitchSPL ?? ""}
                onChange={(e) => onUpdate(originalIndex, "pitchSPL", parseInt(e.target.value) || 0)}
                data-testid={`input-pitchSPL-recruit-${originalIndex}`}
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gold mb-2">SPECIAL ABILITIES</p>
        <AbilitiesDropdown
          selectedAbilities={recruit.abilities || []}
          position={recruit.position}
          onChange={(abilities) => onUpdate(originalIndex, "abilities", abilities)}
          testIdPrefix={`recruit-${originalIndex}`}
        />
      </div>
    </div>
  );
}

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  return (
    <th
      className="px-2 py-2 text-left cursor-pointer hover:bg-muted/50 whitespace-nowrap"
      onClick={() => onSort(field)}
      data-testid={`sort-${field}`}
    >
      <div className="flex items-center gap-1">
        <span className="text-xs text-gold">{label}</span>
        {sortField === field && (
          <span className="text-xs">{sortDir === "asc" ? "^" : "v"}</span>
        )}
      </div>
    </th>
  );
}
