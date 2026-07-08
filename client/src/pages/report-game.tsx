import { useState, useEffect, Component, type ReactNode, type ErrorInfo } from "react";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, useSearch, Link } from "wouter";
import {
  ArrowLeft, ChevronDown, ChevronUp, Check, AlertTriangle,
  CheckCircle, Clock, XCircle, Plus, Minus, ChevronRight,
  ClipboardCheck,
} from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { RetroInput } from "@/components/ui/retro-input";
import { TeamBadge } from "@/components/ui/team-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GameScreenshotUpload } from "@/components/game-screenshots";
import { OcrReviewScreen, computeReviewIssues, type FieldSource } from "@/components/ocr-review-screen";
import type { Game, Team, Player, ScreenshotCategory } from "@shared/schema";
import {
  type BatterEntry, type OcrBattingPlayer, type BattingMergeResult,
  defaultBatter, playerName, matchRosterPlayer, mergeBattingRows, ocrNumberOrDefault,
} from "@/lib/ocr-batting-merge";

class ReportGameErrorBoundary extends Component<
  { children: ReactNode; leagueId: string | undefined },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode; leagueId: string | undefined }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ReportGamePage] render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
          <p className="font-pixel text-gold text-sm">Report Game Failed to Load</p>
          <p className="text-muted-foreground text-xs text-center max-w-sm">{this.state.message}</p>
          <Link href={this.props.leagueId ? `/league/${this.props.leagueId}/schedule` : "/"} className="text-gold hover:underline text-sm flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> {this.props.leagueId ? "Back to Schedule" : "Go Home"}
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

interface GameWithTeams extends Game {
  homeTeam: Team;
  awayTeam: Team;
}

export type { BatterEntry };

export interface PitcherEntry {
  playerId: string;
  name: string;
  role: "starter" | "reliever" | "closer";
  ip: string;
  h: number; r: number; er: number; bb: number; so: number; hr: number;
  win: boolean; loss: boolean;
}

function defaultPitcher(player: Player): PitcherEntry {
  return {
    playerId: player.id, name: playerName(player), role: "starter",
    ip: "0.0", h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, win: false, loss: false,
  };
}

export function ipToDecimal(ip: string): number {
  const [whole, frac] = ip.split(".");
  return (parseInt(whole) || 0) + (parseInt(frac) || 0) / 3;
}

export function liveEra(er: number, ip: string): string {
  const dec = ipToDecimal(ip);
  if (dec <= 0) return "--";
  return (9 * er / dec).toFixed(2);
}

interface OcrFinalScoreData {
  homeScore?: number | null; awayScore?: number | null;
  homeHits?: number | null; awayHits?: number | null;
  homeErrors?: number | null; awayErrors?: number | null;
  innings?: Array<[number, number]> | null;
}

interface OcrPitchingPlayer {
  name?: string; ip?: string; h?: number; r?: number; er?: number; bb?: number; so?: number; hr?: number;
  decision?: "W" | "L" | "S" | null;
}

function ocrPitchersToEntries(data: Record<string, unknown>, players: Player[]): PitcherEntry[] {
  const raw = (data.players as OcrPitchingPlayer[] | undefined) ?? [];
  return raw
    .filter(p => p.name)
    .map((p, idx) => {
      const match = matchRosterPlayer(p.name!, players);
      const base = match ? defaultPitcher(match) : {
        playerId: `screenshot-${idx}-${p.name}`, name: p.name!, role: "starter" as const,
        ip: "0.0", h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, win: false, loss: false,
      };
      return {
        ...base,
        role: idx === 0 ? "starter" as const : "reliever" as const,
        ip: p.ip ?? base.ip,
        h: ocrNumberOrDefault(p.h), r: ocrNumberOrDefault(p.r), er: ocrNumberOrDefault(p.er),
        bb: ocrNumberOrDefault(p.bb), so: ocrNumberOrDefault(p.so), hr: ocrNumberOrDefault(p.hr),
        win: p.decision === "W", loss: p.decision === "L",
      };
    });
}

function scoreFieldMeta(d: OcrFinalScoreData): Record<string, FieldSource> {
  const meta: Record<string, FieldSource> = {
    "score.homeScore": d.homeScore != null ? "ocr" : "low",
    "score.awayScore": d.awayScore != null ? "ocr" : "low",
    "score.homeErrors": d.homeErrors != null ? "ocr" : "low",
    "score.awayErrors": d.awayErrors != null ? "ocr" : "low",
  };
  if (Array.isArray(d.innings)) {
    d.innings.forEach((pair, i) => {
      meta[`inning.${i}.away`] = pair?.[0] != null ? "ocr" : "low";
      meta[`inning.${i}.home`] = pair?.[1] != null ? "ocr" : "low";
    });
  }
  return meta;
}

const PITCHING_META_FIELDS: (keyof OcrPitchingPlayer)[] = ["h", "r", "er", "bb", "so", "hr"];

function pitchingFieldMeta(side: "home" | "away", data: Record<string, unknown>, entries: PitcherEntry[]): Record<string, FieldSource> {
  const raw = (data.players as OcrPitchingPlayer[] | undefined ?? []).filter(p => p.name);
  const meta: Record<string, FieldSource> = {};
  entries.forEach((entry, idx) => {
    const r = raw[idx];
    meta[`pitching.${side}.${entry.playerId}.name`] = r?.name != null ? "ocr" : "low";
    meta[`pitching.${side}.${entry.playerId}.ip`] = r?.ip != null ? "ocr" : "low";
    PITCHING_META_FIELDS.forEach(f => {
      meta[`pitching.${side}.${entry.playerId}.${f}`] = r?.[f] != null ? "ocr" : "low";
    });
  });
  return meta;
}

export type ReportStatus = "pending" | "confirmed" | "disputed" | "finalized";

const REPORT_STATUS_CONFIG: Record<ReportStatus, { icon: ReactNode; label: string; className: string; testId: string }> = {
  pending: {
    icon: <Clock className="w-2.5 h-2.5" />, label: "PENDING",
    className: "border-yellow-600 text-yellow-400", testId: "badge-pending",
  },
  confirmed: {
    icon: <CheckCircle className="w-2.5 h-2.5" />, label: "CONFIRMED",
    className: "border-green-600 text-green-400", testId: "badge-confirmed",
  },
  disputed: {
    icon: <XCircle className="w-2.5 h-2.5" />, label: "DISPUTED",
    className: "border-red-600 text-red-400", testId: "badge-disputed",
  },
  finalized: {
    icon: <Check className="w-2.5 h-2.5" />, label: "FINALIZED",
    className: "border-blue-400 text-blue-300", testId: "badge-finalized",
  },
};

export function ReportStatusBadge({ status }: { status?: ReportStatus | string | null }) {
  if (!status) return null;
  const cfg = REPORT_STATUS_CONFIG[status as ReportStatus];
  if (!cfg) return null;
  return (
    <Badge variant="outline" className={`text-[8px] ${cfg.className} gap-0.5`} data-testid={cfg.testId}>
      {cfg.icon} {cfg.label}
    </Badge>
  );
}

type Phase = "score" | "review" | "submitted";

function ScoreStepper({
  value,
  onChange,
  label,
  testId,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[9px] font-pixel text-muted-foreground uppercase tracking-wide">{label}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-10 h-10 flex items-center justify-center rounded border border-border bg-muted/30 hover:border-gold hover:text-gold transition-colors active:scale-95"
        data-testid={`${testId}-inc`}
        aria-label={`Increase ${label} score`}
      >
        <Plus className="w-4 h-4" />
      </button>
      <input
        type="number"
        min={0}
        max={99}
        value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-16 h-16 text-center text-3xl font-pixel text-gold bg-muted/40 border-2 border-gold/60 rounded-lg focus:outline-none focus:border-gold"
        data-testid={`${testId}-input`}
        aria-label={`${label} score`}
      />
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-10 h-10 flex items-center justify-center rounded border border-border bg-muted/30 hover:border-gold hover:text-gold transition-colors active:scale-95"
        data-testid={`${testId}-dec`}
        aria-label={`Decrease ${label} score`}
      >
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
}

function CollapsibleSection({
  label,
  open,
  onToggle,
  children,
  testId,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
        onClick={onToggle}
        data-testid={testId ?? `toggle-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className="text-sm font-medium">{label}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function ReportGameInner() {
  const { id, gameId } = useParams<{ id: string; gameId: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const isEditMode = new URLSearchParams(search).get("mode") === "edit";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>("score");

  const [homeScoreDirect, setHomeScoreDirect] = useState(0);
  const [awayScoreDirect, setAwayScoreDirect] = useState(0);

  const [showInnings, setShowInnings] = useState(false);
  const [showHitsErrors, setShowHitsErrors] = useState(false);
  const [showHomeBatting, setShowHomeBatting] = useState(false);
  const [showAwayBatting, setShowAwayBatting] = useState(false);
  const [showPitching, setShowPitching] = useState(false);

  const [numInnings, setNumInnings] = useState(9);
  const [homeInnings, setHomeInnings] = useState<number[]>(Array(9).fill(0));
  const [awayInnings, setAwayInnings] = useState<number[]>(Array(9).fill(0));
  const [homeErrors, setHomeErrors] = useState(0);
  const [awayErrors, setAwayErrors] = useState(0);

  const [homeBatting, setHomeBatting] = useState<BatterEntry[]>([]);
  const [awayBatting, setAwayBatting] = useState<BatterEntry[]>([]);
  // Raw per-screenshot batting extractions, keyed by screenshot image id, so applying a new
  // batting screenshot merges with (rather than replaces) any screenshots already applied
  // for that team/category. See mergeBattingRows().
  const [homeBattingSources, setHomeBattingSources] = useState<Record<string, OcrBattingPlayer[]>>({});
  const [awayBattingSources, setAwayBattingSources] = useState<Record<string, OcrBattingPlayer[]>>({});
  const [homePitching, setHomePitching] = useState<PitcherEntry[]>([]);
  const [awayPitching, setAwayPitching] = useState<PitcherEntry[]>([]);
  const [homePitchersInitialized, setHomePitchersInitialized] = useState(false);
  const [awayPitchersInitialized, setAwayPitchersInitialized] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldMeta, setFieldMeta] = useState<Record<string, FieldSource>>({});
  const [ackReviewWarnings, setAckReviewWarnings] = useState(false);
  // Coach corrections logged during OCR review — keyed by field, capturing the original OCR
  // value (first edit only) and the latest corrected value, for the commissioner audit trail.
  const [corrections, setCorrections] = useState<Record<string, { fieldLabel?: string; ocrValue: string; correctedValue: string }>>({});

  function markFieldCorrected(key: string, oldValue?: unknown, newValue?: unknown, fieldLabel?: string) {
    const hadOcrProvenance = fieldMeta[key] === "ocr" || fieldMeta[key] === "low";
    setFieldMeta(prev => (prev[key] ? { ...prev, [key]: "corrected" } : prev));
    if (!hadOcrProvenance) return;
    setCorrections(prev => ({
      ...prev,
      [key]: {
        fieldLabel: fieldLabel ?? prev[key]?.fieldLabel,
        ocrValue: prev[key] ? prev[key].ocrValue : String(oldValue ?? ""),
        correctedValue: String(newValue ?? ""),
      },
    }));
  }

  const { data: gameData, isLoading: gameLoading, isError: gameError } = useQuery<{ game: GameWithTeams; homeTeam: Team; awayTeam: Team }>({
    queryKey: ["/api/leagues", id, "games", gameId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/games/${gameId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Game not found");
      return res.json();
    },
    retry: 1,
  });

  const { data: homePlayers, isLoading: homePlayersLoading } = useQuery<Player[]>({
    queryKey: [`/api/leagues/${id}/roster`, gameData?.game.homeTeamId],
    enabled: !!gameData?.game.homeTeamId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/roster?teamId=${gameData!.game.homeTeamId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch home roster");
      const d = await res.json();
      return d.players ?? d ?? [];
    },
  });

  const { data: awayPlayers, isLoading: awayPlayersLoading } = useQuery<Player[]>({
    queryKey: [`/api/leagues/${id}/roster`, gameData?.game.awayTeamId],
    enabled: !!gameData?.game.awayTeamId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/roster?teamId=${gameData!.game.awayTeamId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch away roster");
      const d = await res.json();
      return d.players ?? d ?? [];
    },
  });

  const { data: existingReport } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/leagues", id, "games", gameId, "report"],
    enabled: isEditMode,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${id}/games/${gameId}/report`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
  });

  useEffect(() => {
    if (!isEditMode || !existingReport) return;
    const innings = (existingReport.inningScores as number[][] | null) ?? [];
    if (innings.length > 0) {
      setNumInnings(innings.length);
      const away = innings.map((pair: number[]) => pair[0] ?? 0);
      const home = innings.map((pair: number[]) => pair[1] ?? 0);
      setAwayInnings(away);
      setHomeInnings(home);
      setShowInnings(true);
      setAwayScoreDirect(away.reduce((a, b) => a + b, 0));
      setHomeScoreDirect(home.reduce((a, b) => a + b, 0));
    } else {
      if (typeof existingReport.homeScore === "number") setHomeScoreDirect(existingReport.homeScore);
      if (typeof existingReport.awayScore === "number") setAwayScoreDirect(existingReport.awayScore);
    }
    if (typeof existingReport.homeErrors === "number") { setHomeErrors(existingReport.homeErrors); setShowHitsErrors(true); }
    if (typeof existingReport.awayErrors === "number") { setAwayErrors(existingReport.awayErrors); setShowHitsErrors(true); }
    const hb = existingReport.homeBoxData as { batting?: BatterEntry[]; pitching?: PitcherEntry[] } | null;
    const ab = existingReport.awayBoxData as { batting?: BatterEntry[]; pitching?: PitcherEntry[] } | null;
    if (hb?.batting?.length) { setHomeBatting(hb.batting); setShowHomeBatting(true); }
    if (ab?.batting?.length) { setAwayBatting(ab.batting); setShowAwayBatting(true); }
    if (hb?.pitching?.length) { setHomePitching(hb.pitching); setHomePitchersInitialized(true); setShowPitching(true); }
    if (ab?.pitching?.length) { setAwayPitching(ab.pitching); setAwayPitchersInitialized(true); setShowPitching(true); }
  }, [existingReport, isEditMode]);

  const homeScore = showInnings ? homeInnings.reduce((a, b) => a + b, 0) : homeScoreDirect;
  const awayScore = showInnings ? awayInnings.reduce((a, b) => a + b, 0) : awayScoreDirect;
  const homeHits = homeBatting.reduce((a, b) => a + b.h, 0);
  const awayHits = awayBatting.reduce((a, b) => a + b.h, 0);

  function changeInnings(n: number) {
    setNumInnings(n);
    setHomeInnings(prev => { const next = [...prev]; while (next.length < n) next.push(0); return next.slice(0, n); });
    setAwayInnings(prev => { const next = [...prev]; while (next.length < n) next.push(0); return next.slice(0, n); });
  }

  function syncDirectScoresToInnings() {
    const newHome = Array(numInnings).fill(0);
    const newAway = Array(numInnings).fill(0);
    if (homeScoreDirect > 0) newHome[0] = homeScoreDirect;
    if (awayScoreDirect > 0) newAway[0] = awayScoreDirect;
    setHomeInnings(newHome);
    setAwayInnings(newAway);
  }

  function sortByBattingOrder(players: Player[]): Player[] {
    const ordered = players
      .filter(p => (p as Player & { battingOrder?: number | null }).battingOrder != null)
      .sort((a, b) => ((a as Player & { battingOrder?: number }).battingOrder ?? 99) - ((b as Player & { battingOrder?: number }).battingOrder ?? 99));
    if (ordered.length >= 9) return ordered.slice(0, 9);
    const remaining = players.filter(p => (p as Player & { battingOrder?: number | null }).battingOrder == null).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
    return [...ordered, ...remaining].slice(0, 9);
  }

  function initHomeBatting() {
    if (homePlayers && homeBatting.length === 0) setHomeBatting(sortByBattingOrder(homePlayers).map(defaultBatter));
  }
  function initAwayBatting() {
    if (awayPlayers && awayBatting.length === 0) setAwayBatting(sortByBattingOrder(awayPlayers).map(defaultBatter));
  }
  function initPitchers() {
    if (homePlayers && !homePitchersInitialized) {
      setHomePitching(homePlayers.filter(p => p.position === "P").slice(0, 3).map(defaultPitcher));
      setHomePitchersInitialized(true);
    }
    if (awayPlayers && !awayPitchersInitialized) {
      setAwayPitching(awayPlayers.filter(p => p.position === "P").slice(0, 3).map(defaultPitcher));
      setAwayPitchersInitialized(true);
    }
  }

  function handleApplyOcr(category: ScreenshotCategory, data: Record<string, unknown>, imageId?: string) {
    switch (category) {
      case "final_score": {
        const d = data as OcrFinalScoreData;
        if (typeof d.homeScore === "number") setHomeScoreDirect(d.homeScore);
        if (typeof d.awayScore === "number") setAwayScoreDirect(d.awayScore);
        if (typeof d.homeErrors === "number") { setHomeErrors(d.homeErrors); setShowHitsErrors(true); }
        if (typeof d.awayErrors === "number") { setAwayErrors(d.awayErrors); setShowHitsErrors(true); }
        if (Array.isArray(d.innings) && d.innings.length > 0) {
          const away = d.innings.map(pair => ocrNumberOrDefault(pair?.[0]));
          const home = d.innings.map(pair => ocrNumberOrDefault(pair?.[1]));
          setNumInnings(away.length);
          setAwayInnings(away);
          setHomeInnings(home);
          setShowInnings(true);
        }
        setFieldMeta(prev => ({ ...prev, ...scoreFieldMeta(d) }));
        toast({ title: "Applied final score", description: "Review the score fields below before continuing." });
        break;
      }
      case "home_batting": {
        const rows = (data.players as OcrBattingPlayer[] | undefined) ?? [];
        const nextSources = { ...homeBattingSources, [imageId ?? `unkeyed-${Date.now()}`]: rows };
        setHomeBattingSources(nextSources);
        const merged = mergeBattingRows("home", Object.values(nextSources), homePlayers ?? []);
        setHomeBatting(merged.entries);
        setShowHomeBatting(true);
        setFieldMeta(prev => ({ ...prev, ...merged.fieldMeta }));
        const needsNameCount = merged.entries.filter(e => e.needsName).length;
        toast({
          title: "Applied home batting",
          description: merged.screenshotCount > 1
            ? `Merged ${merged.screenshotCount} screenshots into ${merged.entries.length} batter rows.${needsNameCount ? ` ${needsNameCount} row(s) need a name.` : ""}`
            : "Names were auto-matched to the roster where possible — double-check each row.",
        });
        break;
      }
      case "away_batting": {
        const rows = (data.players as OcrBattingPlayer[] | undefined) ?? [];
        const nextSources = { ...awayBattingSources, [imageId ?? `unkeyed-${Date.now()}`]: rows };
        setAwayBattingSources(nextSources);
        const merged = mergeBattingRows("away", Object.values(nextSources), awayPlayers ?? []);
        setAwayBatting(merged.entries);
        setShowAwayBatting(true);
        setFieldMeta(prev => ({ ...prev, ...merged.fieldMeta }));
        const needsNameCount = merged.entries.filter(e => e.needsName).length;
        toast({
          title: "Applied away batting",
          description: merged.screenshotCount > 1
            ? `Merged ${merged.screenshotCount} screenshots into ${merged.entries.length} batter rows.${needsNameCount ? ` ${needsNameCount} row(s) need a name.` : ""}`
            : "Names were auto-matched to the roster where possible — double-check each row.",
        });
        break;
      }
      case "home_pitching": {
        const entries = ocrPitchersToEntries(data, homePlayers ?? []);
        setHomePitching(entries);
        setHomePitchersInitialized(true);
        setShowPitching(true);
        setFieldMeta(prev => ({ ...prev, ...pitchingFieldMeta("home", data, entries) }));
        toast({ title: "Applied home pitching", description: "Review innings pitched and decisions before continuing." });
        break;
      }
      case "away_pitching": {
        const entries = ocrPitchersToEntries(data, awayPlayers ?? []);
        setAwayPitching(entries);
        setAwayPitchersInitialized(true);
        setShowPitching(true);
        setFieldMeta(prev => ({ ...prev, ...pitchingFieldMeta("away", data, entries) }));
        toast({ title: "Applied away pitching", description: "Review innings pitched and decisions before continuing." });
        break;
      }
      case "advanced_stats":
      default:
        toast({ title: "Advanced stats are reference-only", description: "This category isn't applied to the box score form." });
        break;
    }
  }

  interface ReportPayload {
    homeScore: number; awayScore: number; homeHits: number; awayHits: number;
    homeErrors: number; awayErrors: number; inningScores: number[][];
    homeBoxData: { batting: BatterEntry[]; pitching: PitcherEntry[]; totals: Record<string, number> };
    awayBoxData: { batting: BatterEntry[]; pitching: PitcherEntry[]; totals: Record<string, number> };
    corrections?: Array<{ fieldKey: string; fieldLabel?: string; ocrValue: string; correctedValue: string }>;
  }

  function buildPayload(): ReportPayload {
    const hasInningData = homeInnings.some(v => v > 0) || awayInnings.some(v => v > 0);
    const includeInnings = showInnings || (isEditMode && hasInningData);
    const inningScores = includeInnings ? awayInnings.map((a, i) => [a, homeInnings[i] ?? 0]) : [];
    const homeBoxData = {
      batting: homeBatting, pitching: homePitching,
      totals: {
        ab: homeBatting.reduce((a, b) => a + b.ab, 0), r: homeScore, h: homeHits,
        rbi: homeBatting.reduce((a, b) => a + b.rbi, 0), bb: homeBatting.reduce((a, b) => a + b.bb, 0),
        so: homeBatting.reduce((a, b) => a + b.so, 0), sb: homeBatting.reduce((a, b) => a + b.sb, 0),
        doubles: homeBatting.reduce((a, b) => a + b.doubles, 0), triples: homeBatting.reduce((a, b) => a + b.triples, 0),
        hr: homeBatting.reduce((a, b) => a + b.hr, 0),
      },
    };
    const awayBoxData = {
      batting: awayBatting, pitching: awayPitching,
      totals: {
        ab: awayBatting.reduce((a, b) => a + b.ab, 0), r: awayScore, h: awayHits,
        rbi: awayBatting.reduce((a, b) => a + b.rbi, 0), bb: awayBatting.reduce((a, b) => a + b.bb, 0),
        so: awayBatting.reduce((a, b) => a + b.so, 0), sb: awayBatting.reduce((a, b) => a + b.sb, 0),
        doubles: awayBatting.reduce((a, b) => a + b.doubles, 0), triples: awayBatting.reduce((a, b) => a + b.triples, 0),
        hr: awayBatting.reduce((a, b) => a + b.hr, 0),
      },
    };
    const correctionsPayload = Object.entries(corrections).map(([fieldKey, v]) => ({
      fieldKey, fieldLabel: v.fieldLabel, ocrValue: v.ocrValue, correctedValue: v.correctedValue,
    }));
    return {
      homeScore, awayScore, homeHits, awayHits, homeErrors, awayErrors, inningScores, homeBoxData, awayBoxData,
      corrections: correctionsPayload.length > 0 ? correctionsPayload : undefined,
    };
  }

  const submitMutation = useMutation({
    mutationFn: async (payload: ReportPayload) => apiRequest("POST", `/api/leagues/${id}/games/${gameId}/report`, payload),
    onSuccess: () => {
      import("@/lib/sfx").then(({ playScoreSubmitSfx }) => playScoreSubmitSfx());
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "games", gameId] });
      setPhase("submitted");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: ReportPayload) => apiRequest("PATCH", `/api/leagues/${id}/games/${gameId}/report`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", id, "schedule"] });
      toast({ title: "Report Updated", description: "The submitted report has been corrected." });
      setLocation(`/league/${id}/schedule`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  if (gameLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Skeleton className="h-40 w-80" /></div>;
  if (gameError || !gameData) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Game not found or could not be loaded.</p>
      <Link href={`/league/${id}/schedule`} className="text-gold hover:underline text-sm flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Schedule
      </Link>
    </div>
  );

  const { game, homeTeam, awayTeam } = gameData;
  if (!game || !homeTeam || !awayTeam) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Game data is incomplete or missing.</p>
      <Link href={`/league/${id}/schedule`} className="text-gold hover:underline text-sm flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Schedule
      </Link>
    </div>
  );

  const isMutating = submitMutation.isPending || updateMutation.isPending;
  const playersLoading = homePlayersLoading || awayPlayersLoading;

  function validateScores(): string | null {
    if (homeScore < 0 || awayScore < 0) return "Scores cannot be negative";
    if (showInnings) {
      const inningHome = homeInnings.reduce((a, b) => a + b, 0);
      const inningAway = awayInnings.reduce((a, b) => a + b, 0);
      if (homeBatting.length > 0 && homeBatting.reduce((a, b) => a + b.r, 0) !== inningHome) {
        return `Home batting runs don't match linescore (${homeBatting.reduce((a, b) => a + b.r, 0)} vs ${inningHome})`;
      }
      if (awayBatting.length > 0 && awayBatting.reduce((a, b) => a + b.r, 0) !== inningAway) {
        return `Away batting runs don't match linescore (${awayBatting.reduce((a, b) => a + b.r, 0)} vs ${inningAway})`;
      }
    }
    return null;
  }

  function handleContinueToReview() {
    const err = validateScores();
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    setAckReviewWarnings(false);
    setPhase("review");
  }

  function handleSubmit() {
    const err = validateScores();
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    const payload = buildPayload();
    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      submitMutation.mutate(payload);
    }
  }

  const isAutoFinalized = phase === "submitted" && (game.isComplete ?? false);
  const hasBoxScoreDetail = homeBatting.length > 0 || awayBatting.length > 0 || homePitching.length > 0 || awayPitching.length > 0;
  const hasOcrData = Object.keys(fieldMeta).length > 0;
  const lowConfidenceCount = Object.values(fieldMeta).filter(v => v === "low").length;
  const reviewIssues = hasOcrData
    ? computeReviewIssues({
        homeScore, awayScore, showInnings, numInnings, homeInnings, awayInnings,
        homeBatting, awayBatting, homePitching, awayPitching,
        homeTeamName: homeTeam.abbreviation, awayTeamName: awayTeam.abbreviation,
        lowConfidenceCount,
      })
    : [];
  const reviewHardErrors = reviewIssues.filter(i => i.severity === "hard");
  const reviewSoftIssues = reviewIssues.filter(i => i.severity === "soft");
  const submitBlocked = hasOcrData && (reviewHardErrors.length > 0 || (reviewSoftIssues.length > 0 && !ackReviewWarnings));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {phase === "review" ? (
              <button
                type="button"
                onClick={() => { setPhase("score"); setValidationError(null); }}
                className="text-muted-foreground hover:text-gold transition-colors p-1 -ml-1"
                data-testid="button-back-to-score"
                aria-label="Back to score entry"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <Link href={`/league/${id}/schedule`} className="text-muted-foreground hover:text-gold transition-colors p-1 -ml-1">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-pixel text-gold text-xs truncate">
                {isEditMode ? "Edit Game Report" : phase === "submitted" ? "Report Submitted" : "Report Game Result"}
              </h1>
              <p className="text-[10px] text-muted-foreground truncate">
                {awayTeam.abbreviation} @ {homeTeam.abbreviation}
              </p>
            </div>
            {phase !== "submitted" && (
              <div className="flex items-center gap-1 shrink-0">
                <div className={`w-2 h-2 rounded-full ${phase === "score" ? "bg-gold" : "bg-muted"}`} />
                <div className={`w-2 h-2 rounded-full ${phase === "review" ? "bg-gold" : "bg-muted"}`} />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-lg space-y-4 pb-20 md:pb-8">

        {phase === "submitted" && (
          <SubmittedPhase
            leagueId={id!}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeScore={homeScore}
            awayScore={awayScore}
            isAutoFinalized={isAutoFinalized}
          />
        )}

        {phase === "score" && (
          <>
            <ScoreEntryStep
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              homeScore={homeScoreDirect}
              awayScore={awayScoreDirect}
              onChangeHome={v => { setHomeScoreDirect(v); if (showInnings) { const n = [...homeInnings]; n[0] = v; setHomeInnings(n); } }}
              onChangeAway={v => { setAwayScoreDirect(v); if (showInnings) { const n = [...awayInnings]; n[0] = v; setAwayInnings(n); } }}
              showInnings={showInnings}
              onToggleInnings={() => {
                if (!showInnings) syncDirectScoresToInnings();
                setShowInnings(o => !o);
              }}
              numInnings={numInnings}
              homeInnings={homeInnings}
              awayInnings={awayInnings}
              onChangeInnings={changeInnings}
              onChangeHomeInning={(i, v) => setHomeInnings(prev => { const n = [...prev]; n[i] = v; return n; })}
              onChangeAwayInning={(i, v) => setAwayInnings(prev => { const n = [...prev]; n[i] = v; return n; })}
              showHitsErrors={showHitsErrors}
              onToggleHitsErrors={() => setShowHitsErrors(o => !o)}
              homeErrors={homeErrors}
              awayErrors={awayErrors}
              onChangeHomeErrors={setHomeErrors}
              onChangeAwayErrors={setAwayErrors}
              homeHits={homeHits}
              awayHits={awayHits}
            />

            {id && gameId && (
              <GameScreenshotUpload leagueId={id} gameId={gameId} onApply={handleApplyOcr} />
            )}

            <div className="text-[10px] text-muted-foreground px-1">Optional box score detail</div>

            <CollapsibleSection
              label={`${homeTeam.name} Batting`}
              open={showHomeBatting}
              onToggle={() => { setShowHomeBatting(o => !o); if (!showHomeBatting) initHomeBatting(); }}
              testId="toggle-home-batting"
            >
              {playersLoading ? <Skeleton className="h-24 w-full" /> :
                <BattingStep
                  label={homeTeam.name}
                  players={homePlayers ?? []}
                  batting={homeBatting}
                  onChange={setHomeBatting}
                  onInit={initHomeBatting}
                  autoInit
                />
              }
            </CollapsibleSection>

            <CollapsibleSection
              label={`${awayTeam.name} Batting`}
              open={showAwayBatting}
              onToggle={() => { setShowAwayBatting(o => !o); if (!showAwayBatting) initAwayBatting(); }}
              testId="toggle-away-batting"
            >
              {playersLoading ? <Skeleton className="h-24 w-full" /> :
                <BattingStep
                  label={awayTeam.name}
                  players={awayPlayers ?? []}
                  batting={awayBatting}
                  onChange={setAwayBatting}
                  onInit={initAwayBatting}
                  autoInit
                />
              }
            </CollapsibleSection>

            <CollapsibleSection
              label="Pitching"
              open={showPitching}
              onToggle={() => { setShowPitching(o => !o); if (!showPitching) initPitchers(); }}
              testId="toggle-pitching"
            >
              {playersLoading ? <Skeleton className="h-24 w-full" /> :
                <PitchingStep
                  leagueId={id}
                  gameType={game.gameType ?? null}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homePlayers={homePlayers ?? []}
                  awayPlayers={awayPlayers ?? []}
                  homePitching={homePitching}
                  awayPitching={awayPitching}
                  onChangeHome={setHomePitching}
                  onChangeAway={setAwayPitching}
                  onInit={initPitchers}
                />
              }
            </CollapsibleSection>

            {validationError && (
              <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/40 rounded text-xs text-red-300" data-testid="text-validation-error">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <RetroButton
              className="w-full"
              onClick={handleContinueToReview}
              data-testid="button-continue-review"
            >
              Review & Submit <ChevronRight className="w-4 h-4 ml-1" />
            </RetroButton>
          </>
        )}

        {phase === "review" && (
          <>
            {hasOcrData ? (
              <OcrReviewScreen
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homeScore={homeScore}
                awayScore={awayScore}
                onChangeHomeScore={v => { markFieldCorrected("score.homeScore", homeScore, v, "Home Score"); setHomeScoreDirect(v); }}
                onChangeAwayScore={v => { markFieldCorrected("score.awayScore", awayScore, v, "Away Score"); setAwayScoreDirect(v); }}
                homeErrors={homeErrors}
                awayErrors={awayErrors}
                onChangeHomeErrors={v => { markFieldCorrected("score.homeErrors", homeErrors, v, "Home Errors"); setHomeErrors(v); }}
                onChangeAwayErrors={v => { markFieldCorrected("score.awayErrors", awayErrors, v, "Away Errors"); setAwayErrors(v); }}
                homeHits={homeHits}
                awayHits={awayHits}
                showInnings={showInnings}
                numInnings={numInnings}
                homeInnings={homeInnings}
                awayInnings={awayInnings}
                onChangeHomeInning={(i, v) => { markFieldCorrected(`inning.${i}.home`, homeInnings[i], v, `Inning ${i + 1} (Home)`); setHomeInnings(prev => { const n = [...prev]; n[i] = v; return n; }); }}
                onChangeAwayInning={(i, v) => { markFieldCorrected(`inning.${i}.away`, awayInnings[i], v, `Inning ${i + 1} (Away)`); setAwayInnings(prev => { const n = [...prev]; n[i] = v; return n; }); }}
                homeBatting={homeBatting}
                awayBatting={awayBatting}
                onChangeHomeBatting={setHomeBatting}
                onChangeAwayBatting={setAwayBatting}
                homePitching={homePitching}
                awayPitching={awayPitching}
                onChangeHomePitching={setHomePitching}
                onChangeAwayPitching={setAwayPitching}
                fieldMeta={fieldMeta}
                onCorrect={markFieldCorrected}
                issues={reviewIssues}
                ackWarnings={ackReviewWarnings}
                onChangeAckWarnings={setAckReviewWarnings}
              />
            ) : (
              <ReviewStep
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homeScore={homeScore}
                awayScore={awayScore}
                homeHits={homeHits}
                awayHits={awayHits}
                homeErrors={homeErrors}
                awayErrors={awayErrors}
                homeBatting={homeBatting}
                awayBatting={awayBatting}
                homePitching={homePitching}
                awayPitching={awayPitching}
                homeInnings={showInnings ? homeInnings : []}
                awayInnings={showInnings ? awayInnings : []}
                hasBoxScore={hasBoxScoreDetail}
              />
            )}

            {validationError && (
              <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/40 rounded text-xs text-red-300" data-testid="text-validation-error-review">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <RetroButton
                variant="outline"
                onClick={() => { setPhase("score"); setValidationError(null); setAckReviewWarnings(false); }}
                data-testid="button-back-to-score-from-review"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Edit Score
              </RetroButton>
              <RetroButton
                className="flex-1"
                onClick={handleSubmit}
                disabled={isMutating || submitBlocked}
                data-testid="button-submit-report"
              >
                {isMutating
                  ? (isEditMode ? "Updating..." : "Submitting...")
                  : (isEditMode ? "Update Report" : "Submit Report")}
              </RetroButton>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ScoreEntryStep({
  homeTeam, awayTeam,
  homeScore, awayScore,
  onChangeHome, onChangeAway,
  showInnings, onToggleInnings,
  numInnings, homeInnings, awayInnings,
  onChangeInnings, onChangeHomeInning, onChangeAwayInning,
  showHitsErrors, onToggleHitsErrors,
  homeErrors, awayErrors, onChangeHomeErrors, onChangeAwayErrors,
  homeHits, awayHits,
}: {
  homeTeam: Team; awayTeam: Team;
  homeScore: number; awayScore: number;
  onChangeHome: (v: number) => void; onChangeAway: (v: number) => void;
  showInnings: boolean; onToggleInnings: () => void;
  numInnings: number; homeInnings: number[]; awayInnings: number[];
  onChangeInnings: (n: number) => void;
  onChangeHomeInning: (i: number, v: number) => void;
  onChangeAwayInning: (i: number, v: number) => void;
  showHitsErrors: boolean; onToggleHitsErrors: () => void;
  homeErrors: number; awayErrors: number;
  onChangeHomeErrors: (v: number) => void; onChangeAwayErrors: (v: number) => void;
  homeHits: number; awayHits: number;
}) {
  const inningHome = homeInnings.reduce((a, b) => a + b, 0);
  const inningAway = awayInnings.reduce((a, b) => a + b, 0);
  const displayHome = showInnings ? inningHome : homeScore;
  const displayAway = showInnings ? inningAway : awayScore;

  return (
    <div className="space-y-4">
      <RetroCard>
        <RetroCardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col items-center gap-1 flex-1">
              <TeamBadge
                abbreviation={awayTeam.abbreviation}
                primaryColor={awayTeam.primaryColor}
                secondaryColor={awayTeam.secondaryColor}
                name={awayTeam.name}
                size="md"
              />
              <span className="text-xs font-medium text-center leading-tight">{awayTeam.name}</span>
              <span className="text-[9px] text-muted-foreground">Away</span>
            </div>

            <div className="flex items-center gap-3">
              {!showInnings ? (
                <>
                  <ScoreStepper
                    value={awayScore}
                    onChange={onChangeAway}
                    label="Away"
                    testId="score-away"
                  />
                  <span className="font-pixel text-muted-foreground text-lg pb-4">@</span>
                  <ScoreStepper
                    value={homeScore}
                    onChange={onChangeHome}
                    label="Home"
                    testId="score-home"
                  />
                </>
              ) : (
                <div className="text-center">
                  <div className="flex items-center gap-2 font-pixel text-3xl">
                    <span className={displayAway > displayHome ? "text-gold" : "text-muted-foreground"}>{displayAway}</span>
                    <span className="text-muted-foreground text-sm">@</span>
                    <span className={displayHome > displayAway ? "text-gold" : "text-muted-foreground"}>{displayHome}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1">From inning totals</p>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1 flex-1">
              <TeamBadge
                abbreviation={homeTeam.abbreviation}
                primaryColor={homeTeam.primaryColor}
                secondaryColor={homeTeam.secondaryColor}
                name={homeTeam.name}
                size="md"
              />
              <span className="text-xs font-medium text-center leading-tight">{homeTeam.name}</span>
              <span className="text-[9px] text-muted-foreground">Home</span>
            </div>
          </div>
        </RetroCardContent>
      </RetroCard>

      <CollapsibleSection
        label="Inning-by-Inning"
        open={showInnings}
        onToggle={onToggleInnings}
        testId="toggle-innings"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">Innings:</span>
            {[7, 9].map(n => (
              <RetroButton key={n} size="sm" variant={numInnings === n ? "primary" : "outline"} onClick={() => onChangeInnings(n)} data-testid={`button-innings-${n}`}>
                {n}
              </RetroButton>
            ))}
            <RetroButton size="sm" variant="outline" onClick={() => onChangeInnings(numInnings + 1)} data-testid="button-extra-inning">+Extra</RetroButton>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gold/30">
                  <th className="text-left p-2 text-gold/80 min-w-[80px]">Team</th>
                  {Array.from({ length: numInnings }, (_, i) => (
                    <th key={i} className="text-center p-1 text-gold/80 w-9">{i + 1}</th>
                  ))}
                  <th className="text-center p-1 text-gold/80 w-9 border-l border-gold/30">R</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gold/20">
                  <td className="p-2 font-medium text-xs">{awayTeam.abbreviation}</td>
                  {awayInnings.map((v, i) => (
                    <td key={i} className="p-0.5">
                      <input type="number" min={0} max={99} value={v}
                        onChange={e => onChangeAwayInning(i, parseInt(e.target.value) || 0)}
                        className="w-8 h-8 text-center text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                        data-testid={`input-away-inning-${i}`} />
                    </td>
                  ))}
                  <td className="text-center p-1 font-bold text-gold border-l border-gold/30">{inningAway}</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium text-xs">{homeTeam.abbreviation}</td>
                  {homeInnings.map((v, i) => (
                    <td key={i} className="p-0.5">
                      <input type="number" min={0} max={99} value={v}
                        onChange={e => onChangeHomeInning(i, parseInt(e.target.value) || 0)}
                        className="w-8 h-8 text-center text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                        data-testid={`input-home-inning-${i}`} />
                    </td>
                  ))}
                  <td className="text-center p-1 font-bold text-gold border-l border-gold/30">{inningHome}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        label="Hits & Errors"
        open={showHitsErrors}
        onToggle={onToggleHitsErrors}
        testId="toggle-hits-errors"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-gold">{awayTeam.abbreviation}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8">H</span>
              <span className="text-sm font-medium">{awayHits > 0 ? awayHits : <span className="text-muted-foreground">—</span>}</span>
              <span className="text-[9px] text-muted-foreground">(from batting)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8">E</span>
              <input type="number" min={0} value={awayErrors} onChange={e => onChangeAwayErrors(parseInt(e.target.value) || 0)}
                className="w-14 h-8 text-center text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                data-testid="input-away-errors" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gold">{homeTeam.abbreviation}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8">H</span>
              <span className="text-sm font-medium">{homeHits > 0 ? homeHits : <span className="text-muted-foreground">—</span>}</span>
              <span className="text-[9px] text-muted-foreground">(from batting)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8">E</span>
              <input type="number" min={0} value={homeErrors} onChange={e => onChangeHomeErrors(parseInt(e.target.value) || 0)}
                className="w-14 h-8 text-center text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                data-testid="input-home-errors" />
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

interface ScheduleForReadyUp {
  userTeamId: string | null;
  currentWeek: number | null;
  games: Array<{ id: string; isComplete: boolean; homeTeamId: string; awayTeamId: string; week: number | null }>;
  reportsByGameId: Record<string, unknown>;
}

function SubmittedPhase({
  leagueId, homeTeam, awayTeam, homeScore, awayScore, isAutoFinalized,
}: {
  leagueId: string; homeTeam: Team; awayTeam: Team;
  homeScore: number; awayScore: number; isAutoFinalized: boolean;
}) {
  const { data: scheduleData } = useQuery<ScheduleForReadyUp>({
    queryKey: ["/api/leagues", leagueId, "schedule"],
  });

  const allReported = (() => {
    if (!scheduleData?.userTeamId) return false;
    const uid = scheduleData.userTeamId;
    const cw = scheduleData.currentWeek;
    const unreported = scheduleData.games.filter(g =>
      !g.isComplete &&
      (g.homeTeamId === uid || g.awayTeamId === uid) &&
      !scheduleData.reportsByGameId[g.id] &&
      (cw === null || g.week === cw)
    );
    return unreported.length === 0;
  })();

  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isAutoFinalized ? "bg-green-900/40 border-2 border-green-600" : "bg-yellow-900/30 border-2 border-yellow-600/60"}`}>
        {isAutoFinalized
          ? <CheckCircle className="w-8 h-8 text-green-400" />
          : <Clock className="w-8 h-8 text-yellow-400" />
        }
      </div>

      <div>
        <p className="font-pixel text-gold text-sm mb-1">
          {isAutoFinalized ? "Result Finalized" : "Report Submitted"}
        </p>
        <p className="text-xs text-muted-foreground max-w-xs">
          {isAutoFinalized
            ? "The game result has been confirmed and recorded."
            : "Your report has been submitted. The opposing coach must confirm or dispute before the result is finalized."
          }
        </p>
      </div>

      <RetroCard className="w-full max-w-xs">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex flex-col items-center gap-1">
            <TeamBadge abbreviation={awayTeam.abbreviation} primaryColor={awayTeam.primaryColor} secondaryColor={awayTeam.secondaryColor} name={awayTeam.name} size="sm" />
            <span className="text-[9px] text-muted-foreground">{awayTeam.abbreviation}</span>
          </div>
          <div className="flex items-center gap-2 font-pixel text-2xl">
            <span className={awayScore > homeScore ? "text-gold" : "text-muted-foreground"}>{awayScore}</span>
            <span className="text-muted-foreground text-sm">@</span>
            <span className={homeScore > awayScore ? "text-gold" : "text-muted-foreground"}>{homeScore}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <TeamBadge abbreviation={homeTeam.abbreviation} primaryColor={homeTeam.primaryColor} secondaryColor={homeTeam.secondaryColor} name={homeTeam.name} size="sm" />
            <span className="text-[9px] text-muted-foreground">{homeTeam.abbreviation}</span>
          </div>
        </div>
        <div className="flex justify-center pb-3">
          <ReportStatusBadge status={isAutoFinalized ? "finalized" : "pending"} />
        </div>
      </RetroCard>

      {!isAutoFinalized && (
        <div className="flex items-start gap-2 text-left p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg max-w-xs w-full">
          <Clock className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-yellow-300 font-medium">Waiting for confirmation</p>
            <p className="text-[10px] text-yellow-400/70 mt-0.5">The opposing coach will see a confirm/dispute prompt on their schedule page.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 w-full max-w-xs">
        <Link href={`/league/${leagueId}/schedule`}>
          {allReported ? (
            <RetroButton className="w-full" data-testid="button-ready-up">
              <ClipboardCheck className="w-4 h-4 mr-2" /> Ready Up
            </RetroButton>
          ) : (
            <RetroButton variant="outline" className="w-full" data-testid="button-back-to-schedule">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Schedule
            </RetroButton>
          )}
        </Link>
      </div>
    </div>
  );
}

export default function ReportGamePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ReportGameErrorBoundary leagueId={id}>
      <ReportGameInner />
    </ReportGameErrorBoundary>
  );
}

function BattingStep({ label, players, batting, onChange, onInit, autoInit }: {
  label: string; players: Player[]; batting: BatterEntry[];
  onChange: (b: BatterEntry[]) => void; onInit: () => void; autoInit?: boolean;
}) {
  useEffect(() => {
    if (autoInit && batting.length === 0 && players.length > 0) onInit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInit, players.length]);

  function addBatter(player: Player) {
    if (batting.find(b => b.playerId === player.id)) return;
    onChange([...batting, defaultBatter(player)]);
  }
  function removeBatter(idx: number) { onChange(batting.filter((_, i) => i !== idx)); }
  function updateBatter<K extends keyof BatterEntry>(idx: number, field: K, value: BatterEntry[K]) {
    const next = [...batting]; next[idx] = { ...next[idx], [field]: value }; onChange(next);
  }

  const usedIds = new Set(batting.map(b => b.playerId));
  const available = players.filter(p => !usedIds.has(p.id) && p.position !== "P");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gold">{label} Batting</h3>
        <span className="text-[10px] font-pixel text-muted-foreground" data-testid="text-batter-count">{batting.length} batters</span>
      </div>

      {available.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Add batter:</p>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {available.slice(0, 30).map(p => (
              <button key={p.id} onClick={() => addBatter(p)}
                className="text-[9px] px-2 py-1 bg-muted/40 border border-border rounded hover:border-gold hover:text-gold transition-colors"
                data-testid={`button-add-batter-${p.id}`}>
                {p.firstName} {p.lastName} ({p.position})
              </button>
            ))}
          </div>
        </div>
      )}

      {batting.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gold/30">
                <th className="text-left p-1 text-gold/80">Name</th>
                <th className="text-center p-1 text-gold/80 w-8">AB</th>
                <th className="text-center p-1 text-gold/80 w-8">R</th>
                <th className="text-center p-1 text-gold/80 w-8">H</th>
                <th className="text-center p-1 text-gold/80 w-8">2B</th>
                <th className="text-center p-1 text-gold/80 w-8">3B</th>
                <th className="text-center p-1 text-gold/80 w-8">HR</th>
                <th className="text-center p-1 text-gold/80 w-8">RBI</th>
                <th className="text-center p-1 text-gold/80 w-8">BB</th>
                <th className="text-center p-1 text-red-400 w-8">SO</th>
                <th className="text-center p-1 text-gold/80 w-8">SB</th>
                <th className="w-5"></th>
              </tr>
            </thead>
            <tbody>
              {batting.map((b, i) => (
                <tr key={b.playerId} className={`border-b border-gold/10 ${b.needsName ? "bg-yellow-900/20" : ""}`}>
                  <td className="p-1 text-foreground font-medium truncate max-w-[80px]" title={b.needsName ? "OCR couldn't read a name for this row — edit it in the review step" : undefined}>
                    {b.name}
                    {b.needsName && <span className="text-yellow-400 text-[9px] ml-1">(needs name)</span>}
                  </td>
                  {(["ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb"] as (keyof BatterEntry)[]).map(field => (
                    <td key={field} className="p-0.5">
                      <input type="number" min={0} value={b[field] as number}
                        onChange={e => updateBatter(i, field, parseInt(e.target.value) || 0)}
                        className="w-8 h-7 text-center text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                        data-testid={`input-batter-${i}-${field}`} />
                    </td>
                  ))}
                  <td className="p-0.5">
                    <button onClick={() => removeBatter(i)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {batting.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <RetroButton size="sm" variant="outline" onClick={onInit} data-testid="button-load-lineup">
            Load Starting Lineup
          </RetroButton>
        </div>
      )}
    </div>
  );
}

interface PitcherAvailSlot { available: boolean; limited: boolean; daysOfRest: number; suggestedMaxIP: number; }
interface PitcherAvailRow {
  playerId: string; name: string; pitchingRole: string | null;
  slots: Record<string, PitcherAvailSlot>; lastPitchedOuts: number;
  lastPitchedWeek: number | null; lastPitchedDay: string | null; stamina: number;
}

function availPanelOutsToIpStr(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}
function availPanelRestNeeded(outs: number): number {
  if (outs === 0) return 0; if (outs <= 3) return 1; if (outs <= 9) return 2;
  if (outs <= 15) return 3; if (outs <= 21) return 4; if (outs <= 27) return 5; return 6;
}
const AVAIL_DAY_LABEL: Record<string, string> = { WED: "Wednesday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" };
const GAME_TYPE_LABEL: Record<string, string> = { midweek: "WED", friday: "FRI", saturday: "SAT", sunday: "SUN" };

function PitcherAvailTooltip({ p, slot, day }: { p: PitcherAvailRow; slot: PitcherAvailSlot; day: string }) {
  if (slot.daysOfRest === 99 || !p.lastPitchedDay) {
    return (
      <div className="text-[10px] space-y-0.5">
        <div className="font-semibold text-green-400">{day}: Fresh</div>
        <div className="text-muted-foreground">No recent appearances</div>
        <div>Full strength — up to <span className="text-green-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
      </div>
    );
  }
  const ip = availPanelOutsToIpStr(p.lastPitchedOuts);
  const restNeeded = availPanelRestNeeded(p.lastPitchedOuts);
  const restHad = slot.daysOfRest;
  const lastDay = AVAIL_DAY_LABEL[p.lastPitchedDay] ?? p.lastPitchedDay;
  if (!slot.available) {
    return (
      <div className="text-[10px] space-y-0.5">
        <div className="font-semibold text-red-400">{day}: Unavailable</div>
        <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({p.lastPitchedOuts} outs)</div>
        <div>Needs <span className="font-bold">{restNeeded}d</span> rest — only <span className="text-red-400 font-bold">{restHad}d</span> available</div>
      </div>
    );
  }
  if (slot.limited) {
    return (
      <div className="text-[10px] space-y-0.5">
        <div className="font-semibold text-yellow-400">{day}: Limited</div>
        <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({p.lastPitchedOuts} outs)</div>
        <div>{restHad}d rest, {restNeeded}d required — capped at <span className="text-yellow-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
      </div>
    );
  }
  return (
    <div className="text-[10px] space-y-0.5">
      <div className="font-semibold text-green-400">{day}: Full strength</div>
      <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({p.lastPitchedOuts} outs)</div>
      <div>{restHad}d rest — up to <span className="text-green-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
    </div>
  );
}

function PitchingStep({ leagueId, gameType, homeTeam, awayTeam, homePlayers, awayPlayers, homePitching, awayPitching, onChangeHome, onChangeAway, onInit }: {
  leagueId: string | undefined; gameType: string | null;
  homeTeam: Team; awayTeam: Team; homePlayers: Player[]; awayPlayers: Player[];
  homePitching: PitcherEntry[]; awayPitching: PitcherEntry[];
  onChangeHome: (l: PitcherEntry[]) => void; onChangeAway: (l: PitcherEntry[]) => void; onInit: () => void;
}) {
  const [availOpen, setAvailOpen] = useState(false);

  useEffect(() => {
    if (homePitching.length === 0 && awayPitching.length === 0 && (homePlayers.length > 0 || awayPlayers.length > 0)) onInit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homePlayers.length, awayPlayers.length]);

  const gameDay = gameType ? (GAME_TYPE_LABEL[gameType] ?? null) : null;

  const { data: homeAvailData } = useQuery<{ pitchers: PitcherAvailRow[] }>({
    queryKey: ["/api/leagues", leagueId, "pitcher-availability", homeTeam.id],
    enabled: !!leagueId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/pitcher-availability?teamId=${homeTeam.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: awayAvailData } = useQuery<{ pitchers: PitcherAvailRow[] }>({
    queryKey: ["/api/leagues", leagueId, "pitcher-availability", awayTeam.id],
    enabled: !!leagueId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/pitcher-availability?teamId=${awayTeam.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  function updatePitcher<K extends keyof PitcherEntry>(list: PitcherEntry[], setList: (l: PitcherEntry[]) => void, idx: number, field: K, value: PitcherEntry[K]) {
    const next = [...list]; next[idx] = { ...next[idx], [field]: value }; setList(next);
  }
  function addPitcher(list: PitcherEntry[], setList: (l: PitcherEntry[]) => void, players: Player[]) {
    const usedIds = new Set(list.map(p => p.playerId));
    const pitcher = players.find(p => p.position === "P" && !usedIds.has(p.id));
    if (pitcher) setList([...list, defaultPitcher(pitcher)]);
  }
  function removePitcher(list: PitcherEntry[], setList: (l: PitcherEntry[]) => void, idx: number) {
    setList(list.filter((_, i) => i !== idx));
  }

  function PitcherTable({ team, players, pitching, onUpdate, onAdd, onRemove }: {
    team: Team; players: Player[]; pitching: PitcherEntry[];
    onUpdate: <K extends keyof PitcherEntry>(i: number, f: K, v: PitcherEntry[K]) => void;
    onAdd: () => void; onRemove: (i: number) => void;
  }) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-pixel text-gold">{team.name}</h3>
          <RetroButton size="sm" variant="outline" onClick={onAdd} data-testid={`button-add-pitcher-${team.id}`}>+ Pitcher</RetroButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gold/30">
                <th className="text-left p-1 text-gold/80">Pitcher</th>
                <th className="text-center p-1 text-gold/80 w-16">Role</th>
                <th className="text-center p-1 text-gold/80 w-12">IP</th>
                <th className="text-center p-1 text-gold/80 w-8">H</th>
                <th className="text-center p-1 text-gold/80 w-8">R</th>
                <th className="text-center p-1 text-gold/80 w-8">ER</th>
                <th className="text-center p-1 text-gold/80 w-8">BB</th>
                <th className="text-center p-1 text-gold/80 w-8">SO</th>
                <th className="text-center p-1 text-gold/80 w-8">HR</th>
                <th className="text-center p-1 text-gold/80 w-8">W</th>
                <th className="text-center p-1 text-gold/80 w-8">L</th>
                <th className="w-5"></th>
              </tr>
            </thead>
            <tbody>
              {pitching.map((p, i) => (
                <tr key={p.playerId} className="border-b border-gold/10">
                  <td className="p-1">
                    <select value={p.playerId}
                      onChange={e => { const pl = players.find(pl => pl.id === e.target.value); if (pl) { onUpdate(i, "playerId", pl.id); onUpdate(i, "name", `${pl.firstName} ${pl.lastName}`); } }}
                      className="w-32 h-7 text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground px-1"
                      data-testid={`select-pitcher-${i}-player`}>
                      {players.filter(pl => pl.position === "P" || pl.id === p.playerId).map(pl => (
                        <option key={pl.id} value={pl.id}>{pl.firstName} {pl.lastName}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-0.5">
                    <select value={p.role} onChange={e => onUpdate(i, "role", e.target.value as PitcherEntry["role"])}
                      className="w-14 h-7 text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground px-1"
                      data-testid={`select-pitcher-${i}-role`}>
                      <option value="starter">SP</option>
                      <option value="reliever">RP</option>
                      <option value="closer">CL</option>
                    </select>
                  </td>
                  <td className="p-0.5">
                    <input type="text" value={p.ip} onChange={e => onUpdate(i, "ip", e.target.value)}
                      className={`w-12 h-7 text-center text-xs bg-muted/40 border rounded focus:outline-none text-foreground ${/^\d+(\.[012])?$/.test(p.ip) ? "border-border focus:border-gold" : "border-red-500"}`}
                      placeholder="0.0" data-testid={`input-pitcher-${i}-ip`} />
                  </td>
                  {(["h", "r", "er", "bb", "so", "hr"] as (keyof PitcherEntry)[]).map(field => (
                    <td key={field} className="p-0.5">
                      <input type="number" min={0} value={p[field] as number}
                        onChange={e => onUpdate(i, field, parseInt(e.target.value) || 0)}
                        className="w-8 h-7 text-center text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground"
                        data-testid={`input-pitcher-${i}-${field}`} />
                    </td>
                  ))}
                  <td className="p-0.5 text-center">
                    <input type="checkbox" checked={p.win} onChange={e => onUpdate(i, "win", e.target.checked)} className="accent-gold" data-testid={`input-pitcher-${i}-win`} />
                  </td>
                  <td className="p-0.5 text-center">
                    <input type="checkbox" checked={p.loss} onChange={e => onUpdate(i, "loss", e.target.checked)} className="accent-red-500" data-testid={`input-pitcher-${i}-loss`} />
                  </td>
                  <td className="p-0.5">
                    <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function AvailPanel({ label, availData, teamId }: { label: string; availData: { pitchers: PitcherAvailRow[] } | undefined; teamId: string }) {
    if (!availData || !gameDay) return null;
    const pitchers = availData.pitchers.slice().sort((a, b) => {
      const order = ["FRI", "SAT", "SUN", "MID", "LRP", "MR1", "MR2", "MR3", "SU", "CP"];
      return (order.indexOf(a.pitchingRole ?? "") ?? 99) - (order.indexOf(b.pitchingRole ?? "") ?? 99);
    });
    return (
      <div className="space-y-1">
        <div className="text-[10px] font-pixel text-gold/80 mb-1">{label}</div>
        <div className="grid gap-1">
          {pitchers.map(p => {
            const slot = p.slots[gameDay] as PitcherAvailSlot | undefined;
            if (!slot) return null;
            const color = !slot.available ? "border-red-700/50 bg-red-950/30" : slot.limited ? "border-yellow-700/50 bg-yellow-950/30" : "border-green-700/50 bg-green-950/30";
            const statusColor = !slot.available ? "text-red-400" : slot.limited ? "text-yellow-400" : "text-green-400";
            const statusText = !slot.available ? "Unavailable" : slot.limited ? `${slot.suggestedMaxIP} IP max` : `${slot.suggestedMaxIP} IP`;
            return (
              <Tooltip key={p.playerId}>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-2 px-2 py-1 rounded border text-xs cursor-default ${color}`} data-testid={`avail-row-${teamId}-${p.playerId}`}>
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.pitchingRole && <span className="font-pixel text-[8px] text-muted-foreground">{p.pitchingRole}</span>}
                    <span className={`font-pixel text-[9px] ${statusColor}`}>{statusText}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[240px]">
                  <PitcherAvailTooltip p={p} slot={slot} day={gameDay} />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  }

  const hasAvailData = (homeAvailData || awayAvailData) && gameDay;

  return (
    <div className="space-y-4">
      {hasAvailData && (
        <div className="border border-border/60 rounded-lg overflow-hidden">
          <button className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            onClick={() => setAvailOpen(o => !o)} data-testid="toggle-avail-panel">
            <span className="font-pixel text-gold text-[9px]">PITCHING AVAILABILITY — {gameDay}</span>
            <span className="text-muted-foreground text-xs">{availOpen ? "▲" : "▼"}</span>
          </button>
          {availOpen && (
            <div className="p-3 grid gap-4 sm:grid-cols-2">
              <AvailPanel label={homeTeam.name} availData={homeAvailData} teamId={homeTeam.id} />
              <AvailPanel label={awayTeam.name} availData={awayAvailData} teamId={awayTeam.id} />
            </div>
          )}
        </div>
      )}
      <PitcherTable team={homeTeam} players={homePlayers} pitching={homePitching}
        onUpdate={(i, f, v) => updatePitcher(homePitching, onChangeHome, i, f, v)}
        onAdd={() => addPitcher(homePitching, onChangeHome, homePlayers)}
        onRemove={i => removePitcher(homePitching, onChangeHome, i)} />
      <PitcherTable team={awayTeam} players={awayPlayers} pitching={awayPitching}
        onUpdate={(i, f, v) => updatePitcher(awayPitching, onChangeAway, i, f, v)}
        onAdd={() => addPitcher(awayPitching, onChangeAway, awayPlayers)}
        onRemove={i => removePitcher(awayPitching, onChangeAway, i)} />
    </div>
  );
}

function ReviewStep({ homeTeam, awayTeam, homeScore, awayScore, homeHits, awayHits, homeErrors, awayErrors, homeBatting, awayBatting, homePitching, awayPitching, homeInnings, awayInnings, hasBoxScore }: {
  homeTeam: Team; awayTeam: Team; homeScore: number; awayScore: number;
  homeHits: number; awayHits: number; homeErrors: number; awayErrors: number;
  homeBatting: BatterEntry[]; awayBatting: BatterEntry[];
  homePitching: PitcherEntry[]; awayPitching: PitcherEntry[];
  homeInnings: number[]; awayInnings: number[];
  hasBoxScore: boolean;
}) {
  return (
    <div className="space-y-4">
      <RetroCard>
        <RetroCardHeader>
          <span className="font-pixel text-gold text-xs">Final Score</span>
        </RetroCardHeader>
        <RetroCardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TeamBadge abbreviation={awayTeam.abbreviation} primaryColor={awayTeam.primaryColor} secondaryColor={awayTeam.secondaryColor} name={awayTeam.name} size="sm" />
              <span className="text-sm font-medium">{awayTeam.name}</span>
            </div>
            <div className="flex items-center gap-3 font-pixel text-2xl">
              <span className={awayScore > homeScore ? "text-gold" : "text-muted-foreground"}>{awayScore}</span>
              <span className="text-muted-foreground text-sm">@</span>
              <span className={homeScore > awayScore ? "text-gold" : "text-muted-foreground"}>{homeScore}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{homeTeam.name}</span>
              <TeamBadge abbreviation={homeTeam.abbreviation} primaryColor={homeTeam.primaryColor} secondaryColor={homeTeam.secondaryColor} name={homeTeam.name} size="sm" />
            </div>
          </div>

          {(homeHits > 0 || awayHits > 0 || homeErrors > 0 || awayErrors > 0) && (
            <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-3 text-xs text-center">
              <div className="text-muted-foreground">H: {awayHits} / E: {awayErrors}</div>
              <div className="text-muted-foreground/50">H / E</div>
              <div className="text-muted-foreground">H: {homeHits} / E: {homeErrors}</div>
            </div>
          )}

          {awayInnings.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gold/20">
                    <th className="text-left p-1 text-gold/70 min-w-[60px]"></th>
                    {awayInnings.map((_, i) => <th key={i} className="text-center p-1 text-gold/70 w-7">{i + 1}</th>)}
                    <th className="text-center p-1 text-gold/70 w-7 border-l border-gold/20">R</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gold/10">
                    <td className="p-1 text-xs">{awayTeam.abbreviation}</td>
                    {awayInnings.map((v, i) => <td key={i} className="text-center p-1">{v}</td>)}
                    <td className={`text-center p-1 border-l border-gold/20 font-bold ${awayScore > homeScore ? "text-gold" : ""}`}>{awayScore}</td>
                  </tr>
                  <tr>
                    <td className="p-1 text-xs">{homeTeam.abbreviation}</td>
                    {homeInnings.map((v, i) => <td key={i} className="text-center p-1">{v}</td>)}
                    <td className={`text-center p-1 border-l border-gold/20 font-bold ${homeScore > awayScore ? "text-gold" : ""}`}>{homeScore}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </RetroCardContent>
      </RetroCard>

      {!hasBoxScore && (
        <div className="flex items-start gap-2 p-3 bg-muted/20 border border-border/40 rounded-lg text-xs text-muted-foreground">
          <Check className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
          <span>Score-only report. No batting or pitching details included.</span>
        </div>
      )}

      {(homeBatting.length > 0 || awayBatting.length > 0) && (
        <RetroCard>
          <RetroCardHeader><span className="font-pixel text-gold text-xs">Batting</span></RetroCardHeader>
          <RetroCardContent className="space-y-4">
            {[{ team: awayTeam, batting: awayBatting }, { team: homeTeam, batting: homeBatting }].map(({ team, batting }) =>
              batting.length > 0 ? (
                <div key={team.id}>
                  <p className="text-[9px] font-pixel text-gold/80 mb-1">{team.abbreviation}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[9px] border-collapse">
                      <thead>
                        <tr className="border-b border-gold/20">
                          <th className="text-left py-1 pr-2 text-muted-foreground">Name</th>
                          {["AB","R","H","HR","RBI","SO"].map(f => <th key={f} className="text-center px-1 py-1 text-muted-foreground w-6">{f}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {batting.map((b, i) => (
                          <tr key={i} className="border-b border-gold/10">
                            <td className="py-1 pr-2 truncate max-w-[80px]">{b.name}</td>
                            <td className="text-center px-1 py-1">{b.ab}</td>
                            <td className="text-center px-1 py-1">{b.r}</td>
                            <td className="text-center px-1 py-1">{b.h}</td>
                            <td className="text-center px-1 py-1">{b.hr}</td>
                            <td className="text-center px-1 py-1">{b.rbi}</td>
                            <td className="text-center px-1 py-1">{b.so}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null
            )}
          </RetroCardContent>
        </RetroCard>
      )}

      {(homePitching.length > 0 || awayPitching.length > 0) && (
        <RetroCard>
          <RetroCardHeader><span className="font-pixel text-gold text-xs">Pitching</span></RetroCardHeader>
          <RetroCardContent className="space-y-4">
            {[{ team: awayTeam, pitching: awayPitching }, { team: homeTeam, pitching: homePitching }].map(({ team, pitching }) =>
              pitching.length > 0 ? (
                <div key={team.id}>
                  <p className="text-[9px] font-pixel text-gold/80 mb-1">{team.abbreviation}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[9px] border-collapse">
                      <thead>
                        <tr className="border-b border-gold/20">
                          <th className="text-left py-1 pr-2 text-muted-foreground">Name</th>
                          {["IP","ER","SO","BB","ERA"].map(f => <th key={f} className="text-center px-1 py-1 text-muted-foreground w-8">{f}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {pitching.map((p, i) => (
                          <tr key={i} className="border-b border-gold/10">
                            <td className="py-1 pr-2 truncate max-w-[80px]">
                              {p.name}
                              {p.win && <span className="ml-1 text-green-400 font-pixel text-[6px]">W</span>}
                              {p.loss && <span className="ml-1 text-red-400 font-pixel text-[6px]">L</span>}
                            </td>
                            <td className="text-center px-1 py-1">{p.ip}</td>
                            <td className="text-center px-1 py-1">{p.er}</td>
                            <td className="text-center px-1 py-1">{p.so}</td>
                            <td className="text-center px-1 py-1">{p.bb}</td>
                            <td className="text-center px-1 py-1 text-gold/80">{liveEra(p.er, p.ip)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null
            )}
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
  );
}
