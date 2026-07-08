import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Sparkles, Pencil, AlertTriangle, AlertCircle } from "lucide-react";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { TeamBadge } from "@/components/ui/team-badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Team } from "@shared/schema";
import { ipToDecimal, liveEra, type BatterEntry, type PitcherEntry } from "@/pages/report-game";

/**
 * Per-field provenance used to distinguish raw OCR values from coach-corrected
 * ones, and to flag values the OCR model couldn't confidently read (returned
 * as null upstream). Keys are freeform dotted paths, e.g. "score.homeScore"
 * or "batting.home.<playerId>.ab". Fields never touched by OCR simply have
 * no entry and render with no badge.
 */
export type FieldSource = "ocr" | "low" | "corrected";

export interface ReviewIssue {
  id: string;
  section: "score" | "home_batting" | "away_batting" | "home_pitching" | "away_pitching" | "decisions";
  severity: "hard" | "soft";
  message: string;
}

const SECTION_LABEL: Record<ReviewIssue["section"], string> = {
  score: "Final Score / Line Score",
  home_batting: "Home Batting",
  away_batting: "Away Batting",
  home_pitching: "Home Pitching",
  away_pitching: "Away Pitching",
  decisions: "Pitcher Decisions",
};

/** Cross-field consistency checks. Hard errors block submission; soft ones can be acknowledged. */
export function computeReviewIssues(input: {
  homeScore: number; awayScore: number;
  showInnings: boolean; numInnings: number; homeInnings: number[]; awayInnings: number[];
  homeBatting: BatterEntry[]; awayBatting: BatterEntry[];
  homePitching: PitcherEntry[]; awayPitching: PitcherEntry[];
  homeTeamName: string; awayTeamName: string;
  lowConfidenceCount: number;
}): ReviewIssue[] {
  const {
    homeScore, awayScore, showInnings, numInnings, homeInnings, awayInnings,
    homeBatting, awayBatting, homePitching, awayPitching, homeTeamName, awayTeamName, lowConfidenceCount,
  } = input;
  const issues: ReviewIssue[] = [];

  if (homeScore < 0 || awayScore < 0) {
    issues.push({ id: "neg-score", section: "score", severity: "hard", message: "Scores cannot be negative." });
  }

  if (showInnings) {
    const inningHome = homeInnings.reduce((a, b) => a + b, 0);
    const inningAway = awayInnings.reduce((a, b) => a + b, 0);
    if (homeBatting.length > 0) {
      const runs = homeBatting.reduce((a, b) => a + b.r, 0);
      if (runs !== inningHome) {
        issues.push({ id: "home-runs-mismatch", section: "score", severity: "hard", message: `${homeTeamName} batting runs (${runs}) don't match the line score total (${inningHome}).` });
      }
    }
    if (awayBatting.length > 0) {
      const runs = awayBatting.reduce((a, b) => a + b.r, 0);
      if (runs !== inningAway) {
        issues.push({ id: "away-runs-mismatch", section: "score", severity: "hard", message: `${awayTeamName} batting runs (${runs}) don't match the line score total (${inningAway}).` });
      }
    }
  }

  if (homeBatting.length > 0) {
    const runs = homeBatting.reduce((a, b) => a + b.r, 0);
    if (runs !== homeScore) {
      issues.push({ id: "home-runs-vs-score", section: "home_batting", severity: "hard", message: `${homeTeamName} batting runs (${runs}) must match the reported home score (${homeScore}).` });
    }
    if (homeBatting.length < 9) {
      issues.push({ id: "home-min-batters", section: "home_batting", severity: "hard", message: `${homeTeamName} needs at least 9 batters (currently ${homeBatting.length}).` });
    }
  }
  if (awayBatting.length > 0) {
    const runs = awayBatting.reduce((a, b) => a + b.r, 0);
    if (runs !== awayScore) {
      issues.push({ id: "away-runs-vs-score", section: "away_batting", severity: "hard", message: `${awayTeamName} batting runs (${runs}) must match the reported away score (${awayScore}).` });
    }
    if (awayBatting.length < 9) {
      issues.push({ id: "away-min-batters", section: "away_batting", severity: "hard", message: `${awayTeamName} needs at least 9 batters (currently ${awayBatting.length}).` });
    }
  }

  const homeNeedsName = homeBatting.filter(b => b.needsName);
  if (homeNeedsName.length > 0) {
    issues.push({
      id: "home-needs-name",
      section: "home_batting",
      severity: "soft",
      message: `${homeNeedsName.length} ${homeTeamName} batting row(s) are missing a readable name — assign a player before submitting.`,
    });
  }
  const awayNeedsName = awayBatting.filter(b => b.needsName);
  if (awayNeedsName.length > 0) {
    issues.push({
      id: "away-needs-name",
      section: "away_batting",
      severity: "soft",
      message: `${awayNeedsName.length} ${awayTeamName} batting row(s) are missing a readable name — assign a player before submitting.`,
    });
  }

  const ipRe = /^\d+(\.[012])?$/;
  for (const p of homePitching) {
    if (p.ip && !ipRe.test(p.ip)) {
      issues.push({ id: `home-ip-${p.playerId}`, section: "home_pitching", severity: "hard", message: `Invalid IP format "${p.ip}" for ${p.name}. Use a format like "6.0" or "2.1".` });
    }
  }
  for (const p of awayPitching) {
    if (p.ip && !ipRe.test(p.ip)) {
      issues.push({ id: `away-ip-${p.playerId}`, section: "away_pitching", severity: "hard", message: `Invalid IP format "${p.ip}" for ${p.name}. Use a format like "6.0" or "2.1".` });
    }
  }

  const gameInnings = showInnings ? numInnings : 0;
  if (gameInnings > 0 && homePitching.length > 0) {
    const totalIp = homePitching.reduce((a, p) => a + ipToDecimal(p.ip), 0);
    if (Math.abs(totalIp - gameInnings) > 1.01) {
      issues.push({ id: "home-ip-total", section: "home_pitching", severity: "soft", message: `${homeTeamName} pitching innings (${totalIp.toFixed(1)}) don't line up with the ${gameInnings}-inning line score — double-check IP entries.` });
    }
  }
  if (gameInnings > 0 && awayPitching.length > 0) {
    const totalIp = awayPitching.reduce((a, p) => a + ipToDecimal(p.ip), 0);
    if (Math.abs(totalIp - gameInnings) > 1.01) {
      issues.push({ id: "away-ip-total", section: "away_pitching", severity: "soft", message: `${awayTeamName} pitching innings (${totalIp.toFixed(1)}) don't line up with the ${gameInnings}-inning line score — double-check IP entries.` });
    }
  }

  if (homePitching.length > 0 || awayPitching.length > 0) {
    const allPitchers = [...homePitching, ...awayPitching];
    const winners = allPitchers.filter(p => p.win);
    const losers = allPitchers.filter(p => p.loss);
    if (winners.length === 0) {
      issues.push({ id: "no-winner", section: "decisions", severity: "soft", message: "No pitcher has been credited with the win yet." });
    } else if (winners.length > 1) {
      issues.push({ id: "dup-winner", section: "decisions", severity: "soft", message: `Multiple pitchers (${winners.map(p => p.name).join(", ")}) are marked as the winning pitcher — only one should be.` });
    }
    if (losers.length === 0) {
      issues.push({ id: "no-loser", section: "decisions", severity: "soft", message: "No pitcher has been credited with the loss yet." });
    } else if (losers.length > 1) {
      issues.push({ id: "dup-loser", section: "decisions", severity: "soft", message: `Multiple pitchers (${losers.map(p => p.name).join(", ")}) are marked as the losing pitcher — only one should be.` });
    }
  }

  if (lowConfidenceCount > 0) {
    issues.push({
      id: "low-confidence-summary",
      section: "score",
      severity: "soft",
      message: `${lowConfidenceCount} field${lowConfidenceCount === 1 ? "" : "s"} could not be confidently read from the screenshot${lowConfidenceCount === 1 ? "" : "s"} — check the highlighted fields below.`,
    });
  }

  return issues;
}

function FieldWrapper({ badge, low, children }: { badge?: FieldSource; low?: boolean; children: ReactNode }) {
  const ring = low ? "ring-1 ring-yellow-500/70 bg-yellow-950/20" : badge === "corrected" ? "ring-1 ring-blue-500/40" : "";
  return (
    <div className={`relative rounded ${ring}`}>
      {children}
      {badge === "ocr" && !low && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 px-1 py-[1px] rounded-full bg-gold/20 border border-gold/50 text-gold text-[7px] leading-none" title="From OCR — not yet edited">
          <Sparkles className="w-2 h-2" />
        </span>
      )}
      {low && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 px-1 py-[1px] rounded-full bg-yellow-900/60 border border-yellow-500 text-yellow-300 text-[7px] leading-none" title="OCR could not confidently read this field — double-check it">
          <AlertTriangle className="w-2 h-2" />
        </span>
      )}
      {badge === "corrected" && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 px-1 py-[1px] rounded-full bg-blue-900/60 border border-blue-500 text-blue-300 text-[7px] leading-none" title="Corrected by coach">
          <Pencil className="w-2 h-2" />
        </span>
      )}
    </div>
  );
}

function NumberField({ value, onChange, testId, source, width = "w-9" }: {
  value: number; onChange: (v: number) => void; testId: string; source?: FieldSource; width?: string;
}) {
  return (
    <FieldWrapper badge={source} low={source === "low"}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={e => onChange(parseInt(e.target.value) || 0)}
        className={`${width} h-9 text-center text-sm bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground`}
        data-testid={testId}
      />
    </FieldWrapper>
  );
}

function TextField({ value, onChange, testId, source, placeholder, width = "w-24" }: {
  value: string; onChange: (v: string) => void; testId: string; source?: FieldSource; placeholder?: string; width?: string;
}) {
  return (
    <FieldWrapper badge={source} low={source === "low"}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={`${width} h-9 text-sm bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground px-2`}
        data-testid={testId}
      />
    </FieldWrapper>
  );
}

function IpField({ value, onChange, testId, source }: { value: string; onChange: (v: string) => void; testId: string; source?: FieldSource }) {
  const valid = /^\d+(\.[012])?$/.test(value);
  return (
    <FieldWrapper badge={source} low={source === "low"}>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder="0.0"
        onChange={e => onChange(e.target.value)}
        className={`w-14 h-9 text-center text-sm bg-muted/40 border rounded focus:outline-none text-foreground ${valid ? "border-border focus:border-gold" : "border-red-500"}`}
        data-testid={testId}
      />
    </FieldWrapper>
  );
}

function Section({ label, open, onToggle, testId, badge, children }: {
  label: string; open: boolean; onToggle: () => void; testId: string; badge?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="border border-border/60 rounded-lg overflow-hidden" data-testid={`section-${testId}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3.5 bg-muted/20 hover:bg-muted/40 transition-colors text-left min-h-[48px]"
        onClick={onToggle}
        data-testid={`toggle-${testId}`}
      >
        <span className="flex items-center gap-2 text-sm font-medium">{label}{badge}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
}

function IssueBanner({ issues, section }: { issues: ReviewIssue[]; section: ReviewIssue["section"] }) {
  const scoped = issues.filter(i => i.section === section);
  if (scoped.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {scoped.map(issue => (
        <div
          key={issue.id}
          className={`flex items-start gap-2 p-2 rounded text-[10px] leading-snug ${
            issue.severity === "hard"
              ? "bg-red-900/20 border border-red-700/40 text-red-300"
              : "bg-yellow-900/20 border border-yellow-700/40 text-yellow-300"
          }`}
          data-testid={`issue-${issue.id}`}
        >
          {issue.severity === "hard" ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

function BattingReviewTable({ side, team, batting, onChange, fieldMeta, onCorrect }: {
  side: "home" | "away"; team: Team; batting: BatterEntry[];
  onChange: (b: BatterEntry[]) => void;
  fieldMeta: Record<string, FieldSource>; onCorrect: (key: string) => void;
}) {
  function update<K extends keyof BatterEntry>(idx: number, field: K, value: BatterEntry[K], key: string) {
    const next = [...batting];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
    onCorrect(key);
  }
  const fields: (keyof BatterEntry)[] = ["ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb"];
  const fieldLabels: Record<string, string> = { ab: "AB", r: "R", h: "H", doubles: "2B", triples: "3B", hr: "HR", rbi: "RBI", bb: "BB", so: "SO", sb: "SB" };

  if (batting.length === 0) {
    return <p className="text-[10px] text-muted-foreground">No batting data. Go back to score entry to load a lineup.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-pixel text-gold/80">{team.abbreviation} • {batting.length} batters</span>
      </div>
      {batting.map((b, i) => (
        <div
          key={b.playerId}
          className={`border rounded-lg p-2.5 space-y-2 ${b.needsName ? "border-yellow-600/60 bg-yellow-900/10" : "border-border/40"}`}
          data-testid={`row-review-batter-${side}-${i}`}
        >
          {b.needsName && (
            <div className="flex items-center gap-1 text-[9px] text-yellow-400" data-testid={`badge-needs-name-${side}-${i}`}>
              <AlertTriangle className="w-3 h-3" /> Needs a name — OCR couldn't read this row
            </div>
          )}
          <TextField
            value={b.name}
            onChange={v => update(i, "name", v, `batting.${side}.${b.playerId}.name`)}
            testId={`review-batter-${side}-${i}-name`}
            source={fieldMeta[`batting.${side}.${b.playerId}.name`]}
            width="w-full"
          />
          <div className="grid grid-cols-5 gap-1.5">
            {fields.map(field => (
              <div key={field} className="flex flex-col items-center gap-1">
                <span className="text-[8px] text-muted-foreground uppercase">{fieldLabels[field]}</span>
                <NumberField
                  value={b[field] as number}
                  onChange={v => update(i, field, v as BatterEntry[typeof field], `batting.${side}.${b.playerId}.${field}`)}
                  testId={`review-batter-${side}-${i}-${field}`}
                  source={fieldMeta[`batting.${side}.${b.playerId}.${field}`]}
                  width="w-full"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PitchingReviewTable({ side, team, pitching, onChange, fieldMeta, onCorrect }: {
  side: "home" | "away"; team: Team; pitching: PitcherEntry[];
  onChange: (p: PitcherEntry[]) => void;
  fieldMeta: Record<string, FieldSource>; onCorrect: (key: string) => void;
}) {
  function update<K extends keyof PitcherEntry>(idx: number, field: K, value: PitcherEntry[K], key: string) {
    const next = [...pitching];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
    onCorrect(key);
  }
  const fields: (keyof PitcherEntry)[] = ["h", "r", "er", "bb", "so", "hr"];
  const fieldLabels: Record<string, string> = { h: "H", r: "R", er: "ER", bb: "BB", so: "SO", hr: "HR" };

  if (pitching.length === 0) {
    return <p className="text-[10px] text-muted-foreground">No pitching data. Go back to score entry to add pitchers.</p>;
  }

  return (
    <div className="space-y-3">
      <span className="text-[10px] font-pixel text-gold/80">{team.abbreviation} • {pitching.length} pitchers</span>
      {pitching.map((p, i) => (
        <div key={p.playerId} className="border border-border/40 rounded-lg p-2.5 space-y-2" data-testid={`row-review-pitcher-${side}-${i}`}>
          <div className="flex items-center gap-2">
            <TextField
              value={p.name}
              onChange={v => update(i, "name", v, `pitching.${side}.${p.playerId}.name`)}
              testId={`review-pitcher-${side}-${i}-name`}
              source={fieldMeta[`pitching.${side}.${p.playerId}.name`]}
              width="flex-1"
            />
            <div className="flex flex-col items-center gap-1">
              <span className="text-[8px] text-muted-foreground uppercase">IP</span>
              <IpField
                value={p.ip}
                onChange={v => update(i, "ip", v, `pitching.${side}.${p.playerId}.ip`)}
                testId={`review-pitcher-${side}-${i}-ip`}
                source={fieldMeta[`pitching.${side}.${p.playerId}.ip`]}
              />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {fields.map(field => (
              <div key={field} className="flex flex-col items-center gap-1">
                <span className="text-[8px] text-muted-foreground uppercase">{fieldLabels[field]}</span>
                <NumberField
                  value={p[field] as number}
                  onChange={v => update(i, field, v as PitcherEntry[typeof field], `pitching.${side}.${p.playerId}.${field}`)}
                  testId={`review-pitcher-${side}-${i}-${field}`}
                  source={fieldMeta[`pitching.${side}.${p.playerId}.${field}`]}
                  width="w-full"
                />
              </div>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground text-right">Live ERA: <span className="text-gold/80">{liveEra(p.er, p.ip)}</span></p>
        </div>
      ))}
    </div>
  );
}

function DecisionsSection({ homeTeam, awayTeam, homePitching, awayPitching, onChangeHome, onChangeAway }: {
  homeTeam: Team; awayTeam: Team; homePitching: PitcherEntry[]; awayPitching: PitcherEntry[];
  onChangeHome: (p: PitcherEntry[]) => void; onChangeAway: (p: PitcherEntry[]) => void;
}) {
  function decisionOf(p: PitcherEntry): "none" | "win" | "loss" {
    if (p.win) return "win";
    if (p.loss) return "loss";
    return "none";
  }

  function setDecision(side: "home" | "away", idx: number, decision: "none" | "win" | "loss") {
    const isHome = side === "home";
    const own = isHome ? homePitching : awayPitching;
    const other = isHome ? awayPitching : homePitching;
    const setOwn = isHome ? onChangeHome : onChangeAway;
    const setOther = isHome ? onChangeAway : onChangeHome;

    const nextOwn = own.map((p, i) => {
      if (i !== idx) {
        if (decision === "win" && p.win) return { ...p, win: false };
        if (decision === "loss" && p.loss) return { ...p, loss: false };
        return p;
      }
      return { ...p, win: decision === "win", loss: decision === "loss" };
    });
    setOwn(nextOwn);

    if (decision === "win" && other.some(p => p.win)) {
      setOther(other.map(p => (p.win ? { ...p, win: false } : p)));
    }
    if (decision === "loss" && other.some(p => p.loss)) {
      setOther(other.map(p => (p.loss ? { ...p, loss: false } : p)));
    }
  }

  const rows: Array<{ side: "home" | "away"; team: Team; p: PitcherEntry; idx: number }> = [
    ...awayPitching.map((p, idx) => ({ side: "away" as const, team: awayTeam, p, idx })),
    ...homePitching.map((p, idx) => ({ side: "home" as const, team: homeTeam, p, idx })),
  ];

  if (rows.length === 0) {
    return <p className="text-[10px] text-muted-foreground">No pitchers entered yet.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map(({ side, team, p, idx }) => (
        <div key={`${side}-${p.playerId}`} className="flex items-center gap-2 p-2 border border-border/40 rounded-lg" data-testid={`row-decision-${side}-${idx}`}>
          <TeamBadge abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} name={team.name} size="sm" />
          <span className="text-xs flex-1 truncate">{p.name}</span>
          <select
            value={decisionOf(p)}
            onChange={e => setDecision(side, idx, e.target.value as "none" | "win" | "loss")}
            className="h-9 text-xs bg-muted/40 border border-border rounded focus:outline-none focus:border-gold text-foreground px-2"
            data-testid={`select-decision-${side}-${idx}`}
          >
            <option value="none">No Decision</option>
            <option value="win">Win (W)</option>
            <option value="loss">Loss (L)</option>
          </select>
        </div>
      ))}
    </div>
  );
}

/**
 * Mobile-first, single scrollable OCR review screen. Consumes the box-score
 * form state already populated by "Apply to form" in the score-entry phase
 * (client/src/components/game-screenshots.tsx) plus the per-field provenance
 * map (`fieldMeta`) that tracks which values came from OCR, which OCR
 * couldn't confidently read, and which the coach has since corrected.
 *
 * This screen does not talk to the OCR pipeline itself — it is purely a
 * review/edit/validate surface over structured data that's already in the
 * report-game form state.
 */
export function OcrReviewScreen({
  homeTeam, awayTeam,
  homeScore, awayScore, onChangeHomeScore, onChangeAwayScore,
  homeErrors, awayErrors, onChangeHomeErrors, onChangeAwayErrors,
  homeHits, awayHits,
  showInnings, numInnings, homeInnings, awayInnings, onChangeHomeInning, onChangeAwayInning,
  homeBatting, awayBatting, onChangeHomeBatting, onChangeAwayBatting,
  homePitching, awayPitching, onChangeHomePitching, onChangeAwayPitching,
  fieldMeta, onCorrect,
  issues, ackWarnings, onChangeAckWarnings,
}: {
  homeTeam: Team; awayTeam: Team;
  homeScore: number; awayScore: number;
  onChangeHomeScore: (v: number) => void; onChangeAwayScore: (v: number) => void;
  homeErrors: number; awayErrors: number;
  onChangeHomeErrors: (v: number) => void; onChangeAwayErrors: (v: number) => void;
  homeHits: number; awayHits: number;
  showInnings: boolean; numInnings: number; homeInnings: number[]; awayInnings: number[];
  onChangeHomeInning: (i: number, v: number) => void; onChangeAwayInning: (i: number, v: number) => void;
  homeBatting: BatterEntry[]; awayBatting: BatterEntry[];
  onChangeHomeBatting: (b: BatterEntry[]) => void; onChangeAwayBatting: (b: BatterEntry[]) => void;
  homePitching: PitcherEntry[]; awayPitching: PitcherEntry[];
  onChangeHomePitching: (p: PitcherEntry[]) => void; onChangeAwayPitching: (p: PitcherEntry[]) => void;
  fieldMeta: Record<string, FieldSource>;
  onCorrect: (key: string) => void;
  issues: ReviewIssue[];
  ackWarnings: boolean; onChangeAckWarnings: (v: boolean) => void;
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    score: true, line: showInnings, home_batting: true, away_batting: true,
    home_pitching: homePitching.length > 0, away_pitching: awayPitching.length > 0,
    decisions: homePitching.length > 0 || awayPitching.length > 0,
  });
  const toggle = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  function sectionIssueCount(section: ReviewIssue["section"]) {
    return issues.filter(i => i.section === section).length;
  }
  function sectionBadge(section: ReviewIssue["section"]) {
    const hard = issues.filter(i => i.section === section && i.severity === "hard").length;
    const soft = issues.filter(i => i.section === section && i.severity === "soft").length;
    if (hard > 0) return <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-900/50 border border-red-600 text-red-300">{hard} error{hard > 1 ? "s" : ""}</span>;
    if (soft > 0) return <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-yellow-900/50 border border-yellow-600 text-yellow-300">{soft} warning{soft > 1 ? "s" : ""}</span>;
    return null;
  }

  const hardErrors = issues.filter(i => i.severity === "hard");
  const softIssues = issues.filter(i => i.severity === "soft" && i.id !== "low-confidence-summary");
  const lowConfSummary = issues.find(i => i.id === "low-confidence-summary");

  return (
    <div className="space-y-3" data-testid="ocr-review-screen">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="w-3.5 h-3.5 text-gold" />
        <span className="text-[10px] font-pixel text-gold">Review Extracted Box Score</span>
      </div>
      <p className="text-[9px] text-muted-foreground px-1">
        Tap any field to edit it. <span className="text-gold">Gold sparkle</span> = OCR value, <span className="text-yellow-400">yellow warning</span> = low-confidence read, <span className="text-blue-300">blue pencil</span> = you corrected it.
      </p>

      <Section label="Final Score" open={openSections.score} onToggle={() => toggle("score")} testId="score" badge={sectionBadge("score")}>
        <IssueBanner issues={issues} section="score" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col items-center gap-1 flex-1">
            <TeamBadge abbreviation={awayTeam.abbreviation} primaryColor={awayTeam.primaryColor} secondaryColor={awayTeam.secondaryColor} name={awayTeam.name} size="sm" />
            <span className="text-[10px] text-muted-foreground">{awayTeam.abbreviation}</span>
            {showInnings ? (
              <span className="font-pixel text-xl text-gold" data-testid="review-away-score">{awayScore}</span>
            ) : (
              <NumberField value={awayScore} onChange={v => onChangeAwayScore(v)} testId="review-away-score" source={fieldMeta["score.awayScore"]} width="w-12" />
            )}
          </div>
          <span className="font-pixel text-muted-foreground text-sm">@</span>
          <div className="flex flex-col items-center gap-1 flex-1">
            <TeamBadge abbreviation={homeTeam.abbreviation} primaryColor={homeTeam.primaryColor} secondaryColor={homeTeam.secondaryColor} name={homeTeam.name} size="sm" />
            <span className="text-[10px] text-muted-foreground">{homeTeam.abbreviation}</span>
            {showInnings ? (
              <span className="font-pixel text-xl text-gold" data-testid="review-home-score">{homeScore}</span>
            ) : (
              <NumberField value={homeScore} onChange={v => onChangeHomeScore(v)} testId="review-home-score" source={fieldMeta["score.homeScore"]} width="w-12" />
            )}
          </div>
        </div>
        {showInnings && <p className="text-[9px] text-muted-foreground text-center">Score is computed from the Line Score section below.</p>}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16">{awayTeam.abbreviation} Errors</span>
            <NumberField value={awayErrors} onChange={onChangeAwayErrors} testId="review-away-errors" source={fieldMeta["score.awayErrors"]} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16">{homeTeam.abbreviation} Errors</span>
            <NumberField value={homeErrors} onChange={onChangeHomeErrors} testId="review-home-errors" source={fieldMeta["score.homeErrors"]} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16">{awayTeam.abbreviation} Hits</span>
            <span className="text-sm font-medium text-foreground" data-testid="review-away-hits">{awayHits}</span>
            <span className="text-[8px] text-muted-foreground">(from batting)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16">{homeTeam.abbreviation} Hits</span>
            <span className="text-sm font-medium text-foreground" data-testid="review-home-hits">{homeHits}</span>
            <span className="text-[8px] text-muted-foreground">(from batting)</span>
          </div>
        </div>
      </Section>

      {showInnings && (
        <Section label="Line Score" open={openSections.line} onToggle={() => toggle("line")} testId="line-score">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gold/30">
                  <th className="text-left p-1 text-gold/80 min-w-[50px]">Team</th>
                  {Array.from({ length: numInnings }, (_, i) => <th key={i} className="text-center p-1 text-gold/80 w-9">{i + 1}</th>)}
                  <th className="text-center p-1 text-gold/80 w-9 border-l border-gold/30">R</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gold/20">
                  <td className="p-1 font-medium text-xs">{awayTeam.abbreviation}</td>
                  {awayInnings.map((v, i) => (
                    <td key={i} className="p-0.5">
                      <NumberField value={v} onChange={val => onChangeAwayInning(i, val)} testId={`review-away-inning-${i}`} source={fieldMeta[`inning.${i}.away`]} width="w-8" />
                    </td>
                  ))}
                  <td className="text-center p-1 font-bold text-gold border-l border-gold/30">{awayScore}</td>
                </tr>
                <tr>
                  <td className="p-1 font-medium text-xs">{homeTeam.abbreviation}</td>
                  {homeInnings.map((v, i) => (
                    <td key={i} className="p-0.5">
                      <NumberField value={v} onChange={val => onChangeHomeInning(i, val)} testId={`review-home-inning-${i}`} source={fieldMeta[`inning.${i}.home`]} width="w-8" />
                    </td>
                  ))}
                  <td className="text-center p-1 font-bold text-gold border-l border-gold/30">{homeScore}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section label={`${homeTeam.name} Batting`} open={openSections.home_batting} onToggle={() => toggle("home_batting")} testId="home-batting" badge={sectionBadge("home_batting")}>
        <IssueBanner issues={issues} section="home_batting" />
        <BattingReviewTable side="home" team={homeTeam} batting={homeBatting} onChange={onChangeHomeBatting} fieldMeta={fieldMeta} onCorrect={onCorrect} />
      </Section>

      <Section label={`${awayTeam.name} Batting`} open={openSections.away_batting} onToggle={() => toggle("away_batting")} testId="away-batting" badge={sectionBadge("away_batting")}>
        <IssueBanner issues={issues} section="away_batting" />
        <BattingReviewTable side="away" team={awayTeam} batting={awayBatting} onChange={onChangeAwayBatting} fieldMeta={fieldMeta} onCorrect={onCorrect} />
      </Section>

      <Section label={`${homeTeam.name} Pitching`} open={openSections.home_pitching} onToggle={() => toggle("home_pitching")} testId="home-pitching" badge={sectionBadge("home_pitching")}>
        <IssueBanner issues={issues} section="home_pitching" />
        <PitchingReviewTable side="home" team={homeTeam} pitching={homePitching} onChange={onChangeHomePitching} fieldMeta={fieldMeta} onCorrect={onCorrect} />
      </Section>

      <Section label={`${awayTeam.name} Pitching`} open={openSections.away_pitching} onToggle={() => toggle("away_pitching")} testId="away-pitching" badge={sectionBadge("away_pitching")}>
        <IssueBanner issues={issues} section="away_pitching" />
        <PitchingReviewTable side="away" team={awayTeam} pitching={awayPitching} onChange={onChangeAwayPitching} fieldMeta={fieldMeta} onCorrect={onCorrect} />
      </Section>

      <Section label="Pitcher Decisions" open={openSections.decisions} onToggle={() => toggle("decisions")} testId="decisions" badge={sectionBadge("decisions")}>
        <IssueBanner issues={issues} section="decisions" />
        <DecisionsSection
          homeTeam={homeTeam} awayTeam={awayTeam}
          homePitching={homePitching} awayPitching={awayPitching}
          onChangeHome={onChangeHomePitching} onChangeAway={onChangeAwayPitching}
        />
      </Section>

      {lowConfSummary && (
        <div className="flex items-start gap-2 p-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg text-xs text-yellow-300" data-testid="text-low-confidence-summary">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{lowConfSummary.message}</span>
        </div>
      )}

      {hardErrors.length > 0 && (
        <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg space-y-1.5" data-testid="text-hard-errors-summary">
          <p className="text-xs text-red-300 font-medium flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Fix these before submitting:</p>
          <ul className="text-[10px] text-red-300/90 list-disc list-inside space-y-0.5">
            {hardErrors.map(e => <li key={e.id}>{e.message}</li>)}
          </ul>
        </div>
      )}

      {hardErrors.length === 0 && (softIssues.length > 0 || lowConfSummary) && (
        <label className="flex items-start gap-2 p-3 bg-yellow-900/10 border border-yellow-700/30 rounded-lg cursor-pointer" data-testid="label-ack-warnings">
          <Checkbox checked={ackWarnings} onCheckedChange={v => onChangeAckWarnings(v === true)} data-testid="checkbox-ack-warnings" className="mt-0.5" />
          <span className="text-[10px] text-yellow-300">
            I've reviewed the {softIssues.length + (lowConfSummary ? 1 : 0)} flagged item{(softIssues.length + (lowConfSummary ? 1 : 0)) > 1 ? "s" : ""} above and want to submit anyway.
          </span>
        </label>
      )}
    </div>
  );
}
