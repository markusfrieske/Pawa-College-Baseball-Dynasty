import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { RetroButton } from "@/components/ui/retro-button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "cbd-scoreboard-disabled";
const INNING_REVEAL_MS = 350;
const FINAL_PAUSE_MS = 650;
const WALKOFF_EXTRA_PAUSE_MS = 900;
const DIAMOND_TICK_MS = 175;

/**
 * Diamond graphic that cycles TOP / BOT visually during animation.
 * topHalf: whether the top-half indicator (away batting) should light up.
 */
function BaseballDiamond({
  topHalf,
  isActive,
}: {
  topHalf: boolean;
  isActive: boolean;
}) {
  const size = 60;
  const mid = size / 2;
  const r = size * 0.34;
  const top = { cx: mid, cy: mid - r };
  const right = { cx: mid + r, cy: mid };
  const bottom = { cx: mid, cy: mid + r };
  const left = { cx: mid - r, cy: mid };
  const pts = `${top.cx},${top.cy} ${right.cx},${right.cy} ${bottom.cx},${bottom.cy} ${left.cx},${left.cy}`;
  const gold = "#FFD700";
  const dim = "#FFD70040";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <polygon points={pts} fill="none" stroke={gold} strokeWidth={1.5} opacity={0.35} />
      {/* Top vertex — lit when away is batting (top half) */}
      <circle
        cx={top.cx}
        cy={top.cy}
        r={isActive && topHalf ? 5.5 : 3}
        fill={isActive && topHalf ? gold : dim}
      />
      <circle cx={right.cx} cy={right.cy} r={2.5} fill={dim} />
      <circle cx={left.cx} cy={left.cy} r={2.5} fill={dim} />
      {/* Bottom vertex (home plate) — lit when home is batting (bottom half) */}
      <circle
        cx={bottom.cx}
        cy={bottom.cy}
        r={isActive && !topHalf ? 5.5 : 3}
        fill={isActive && !topHalf ? gold : dim}
      />
    </svg>
  );
}

export interface InningScoreboardData {
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  /** Each entry is [awayRuns, homeRuns] for that inning */
  inningScores: number[][];
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  isHome: boolean;
  homeColor?: string;
  awayColor?: string;
  phase?: string;
  season?: number;
  week?: number;
}

interface InningScoreboardProps {
  open: boolean;
  onClose: () => void;
  data: InningScoreboardData | null;
}

/** Detect walk-off: home wins and was tied-or-behind before the bottom of the last inning */
function detectWalkoff(innings: number[][], homeScore: number, awayScore: number): boolean {
  if (homeScore <= awayScore || innings.length === 0) return false;
  // Home score accumulated through all bottom-halfs *except* the last
  const homeBeforeLast = innings.slice(0, -1).reduce((s, inn) => s + (inn[1] ?? 0), 0);
  // Total away score
  const totalAway = innings.reduce((s, inn) => s + (inn[0] ?? 0), 0);
  return homeBeforeLast <= totalAway;
}

export function InningScoreboard({ open, onClose, data }: InningScoreboardProps) {
  // How many complete innings have been revealed (both rows revealed together per inning)
  const [revealedCount, setRevealedCount] = useState(0);
  // Cosmetic diamond tick: alternates TOP/BOT within each inning while animating
  const [diamondTop, setDiamondTop] = useState(true);
  // Whether the final R/H/E totals are showing (after walk-off / final pause)
  const [showFinal, setShowFinal] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [disabled, setDisabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  const innings = data?.inningScores ?? [];
  const totalInnings = innings.length || 9;
  const isWalkoff = data ? detectWalkoff(innings, data.homeScore, data.awayScore) : false;
  const finalPause = FINAL_PAUSE_MS + (isWalkoff ? WALKOFF_EXTRA_PAUSE_MS : 0);

  const inningsComplete = skipped || revealedCount >= totalInnings;
  const animationDone = inningsComplete && showFinal;

  // Reset when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setRevealedCount(0);
      setDiamondTop(true);
      setShowFinal(false);
      setSkipped(false);
    }
  }, [open]);

  // Per-inning reveal: both rows (away + home) revealed together each step
  useEffect(() => {
    if (!open || !data || skipped || revealedCount >= totalInnings) return;
    const t = setTimeout(() => setRevealedCount(prev => prev + 1), INNING_REVEAL_MS);
    return () => clearTimeout(t);
  }, [open, data, revealedCount, skipped, totalInnings]);

  // Cosmetic diamond tick — cycles TOP/BOT faster than inning reveal
  useEffect(() => {
    if (!open || !data || skipped || revealedCount >= totalInnings) return;
    const t = setInterval(() => setDiamondTop(prev => !prev), DIAMOND_TICK_MS);
    return () => clearInterval(t);
  }, [open, data, revealedCount, skipped, totalInnings]);

  // Walk-off / final-reveal pause before showing R/H/E totals and result badge
  useEffect(() => {
    if (!open || !data || !inningsComplete || showFinal) return;
    const t = setTimeout(() => setShowFinal(true), finalPause);
    return () => clearTimeout(t);
  }, [open, data, inningsComplete, showFinal, finalPause]);

  const handleSkip = useCallback(() => {
    setSkipped(true);
    setRevealedCount(totalInnings);
    setDiamondTop(false);
    setShowFinal(true);
  }, [totalInnings]);

  const toggleDisabled = useCallback((val: boolean) => {
    setDisabled(val);
    try { localStorage.setItem(STORAGE_KEY, val ? "true" : "false"); } catch {}
  }, []);

  if (!open || !data) return null;

  const awayWon = data.awayScore > data.homeScore;
  const homeWon = data.homeScore > data.awayScore;
  const userWon = data.isHome ? homeWon : awayWon;
  const resultLabel = userWon ? "WIN" : "LOSS";
  const resultColor = userWon ? "#FFD700" : "#e05252";

  const isAnimating = !skipped && revealedCount < totalInnings;
  const currentInningNum = Math.min(revealedCount + 1, totalInnings);

  const homeColor = data.homeColor ?? "#FFD700";
  const awayColor = data.awayColor ?? "#7eb8f7";

  const phaseLabel: Record<string, string> = {
    regular_season: "Regular Season",
    preseason: "Spring",
    spring_training: "Spring",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
  };

  const rows = [
    {
      label: data.awayAbbr,
      teamName: data.awayTeam,
      score: data.awayScore,
      hits: data.awayHits,
      errors: data.awayErrors,
      isWinner: awayWon,
      isUserSide: !data.isHome,
      rowType: "away" as const,
      color: awayColor,
      inningRunsIdx: 0,
    },
    {
      label: data.homeAbbr,
      teamName: data.homeTeam,
      score: data.homeScore,
      hits: data.homeHits,
      errors: data.homeErrors,
      isWinner: homeWon,
      isUserSide: data.isHome,
      rowType: "home" as const,
      color: homeColor,
      inningRunsIdx: 1,
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "rgba(5, 18, 6, 0.97)" }}
      data-testid="inning-scoreboard-modal"
    >
      {/* Header */}
      <div className="shrink-0 border-b border-gold/30 bg-[#071208] px-6 py-4 flex items-center gap-4">
        <BaseballDiamond topHalf={diamondTop} isActive={isAnimating} />
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-[12px] text-gold tracking-wider leading-none">
            {isAnimating ? `INNING ${currentInningNum}` : isWalkoff && !skipped ? "WALK-OFF!" : "FINAL"}
          </p>
          <p className="text-[9px] text-muted-foreground mt-1.5">
            {data.phase ? (phaseLabel[data.phase] ?? data.phase) : "Game Result"}
            {data.season ? ` · Season ${data.season}` : ""}
            {data.week ? ` · Week ${data.week}` : ""}
          </p>
        </div>

        {/* WIN / LOSS badge — fades in after final pause */}
        <div
          className="text-right shrink-0 transition-opacity duration-300"
          style={{ opacity: animationDone ? 1 : 0 }}
        >
          <p
            className="font-pixel text-2xl leading-none"
            style={{ color: resultColor }}
            data-testid="scoreboard-result-label"
          >
            {resultLabel}
          </p>
          <p className="text-[9px] text-muted-foreground mt-1">
            {data.isHome ? data.homeAbbr : data.awayAbbr}
          </p>
        </div>

        {isAnimating && (
          <span className="font-pixel text-[9px] text-muted-foreground animate-pulse ml-2 shrink-0">
            SIMULATING…
          </span>
        )}
      </div>

      {/* Scoreboard table */}
      <div
        className="flex-1 flex flex-col justify-center overflow-x-auto px-4 sm:px-8 py-6 cursor-pointer select-none"
        onClick={!animationDone ? handleSkip : undefined}
        title={!animationDone ? "Click to skip animation" : undefined}
      >
        {isAnimating && (
          <p className="font-pixel text-[9px] text-muted-foreground text-center animate-pulse mb-5">
            Tap anywhere to skip…
          </p>
        )}

        <div className="overflow-x-auto">
          <table
            className="mx-auto border-collapse"
            style={{ minWidth: "min(100%, 700px)" }}
            data-testid="scoreboard-table"
          >
            <thead>
              <tr>
                <th className="py-2 px-3 text-left font-pixel text-[9px] text-muted-foreground font-normal w-32" />
                {Array.from({ length: totalInnings }, (_, i) => {
                  const inningActive = isAnimating && i === revealedCount;
                  return (
                    <th
                      key={i}
                      className={`py-2 px-2 text-center font-normal text-[10px] min-w-[34px] transition-colors duration-150 ${
                        inningActive ? "text-gold font-pixel" : "text-muted-foreground/60"
                      }`}
                      data-testid={`scoreboard-inning-header-${i + 1}`}
                    >
                      {i + 1}
                    </th>
                  );
                })}
                <th className="py-2 px-3 text-center font-pixel text-[9px] text-gold font-normal min-w-[38px] border-l border-border/50">
                  R
                </th>
                <th className="py-2 px-3 text-center font-pixel text-[9px] text-muted-foreground font-normal min-w-[38px]">
                  H
                </th>
                <th className="py-2 px-3 text-center font-pixel text-[9px] text-muted-foreground font-normal min-w-[38px]">
                  E
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.rowType}
                  className="border-t border-border/30"
                  style={{ backgroundColor: row.isUserSide ? `${row.color}14` : undefined }}
                  data-testid={`scoreboard-row-${row.rowType}`}
                >
                  <td className="py-3 px-3">
                    <div className="flex flex-col gap-0.5">
                      <span
                        className="font-pixel text-[10px] leading-none"
                        style={{
                          color: animationDone && row.isWinner ? row.color : "#ffffffcc",
                        }}
                        data-testid={`scoreboard-abbr-${row.rowType}`}
                      >
                        {row.label}
                      </span>
                      <span className="text-[9px] truncate max-w-[110px]" style={{ color: "#ffffff55" }}>
                        {row.teamName}
                      </span>
                    </div>
                  </td>

                  {/* Per-inning cells — both rows revealed together per inning */}
                  {Array.from({ length: totalInnings }, (_, i) => {
                    const revealed = skipped || revealedCount > i;
                    const runs = innings[i]?.[row.inningRunsIdx] ?? 0;
                    return (
                      <td
                        key={i}
                        className={`py-3 px-2 text-center font-mono text-sm transition-all duration-150 ${
                          revealed
                            ? runs > 0
                              ? "font-semibold"
                              : "opacity-40 text-white"
                            : "opacity-0"
                        }`}
                        style={revealed && runs > 0 ? { color: row.color } : undefined}
                        data-testid={`scoreboard-cell-${row.rowType}-${i + 1}`}
                      >
                        {revealed ? runs : 0}
                      </td>
                    );
                  })}

                  {/* R total — shown after final pause */}
                  <td
                    className="py-3 px-3 text-center font-pixel text-base border-l border-border/50 transition-opacity duration-300"
                    style={{
                      opacity: showFinal ? 1 : 0,
                      color: row.isWinner ? row.color : "#ffffffaa",
                    }}
                    data-testid={`scoreboard-total-r-${row.rowType}`}
                  >
                    {row.score}
                  </td>
                  <td
                    className="py-3 px-3 text-center text-sm transition-opacity duration-300"
                    style={{ opacity: showFinal ? 1 : 0, color: "#ffffff66" }}
                    data-testid={`scoreboard-total-h-${row.rowType}`}
                  >
                    {row.hits}
                  </td>
                  <td
                    className="py-3 px-3 text-center text-sm transition-opacity duration-300"
                    style={{ opacity: showFinal ? 1 : 0, color: "#ffffff66" }}
                    data-testid={`scoreboard-total-e-${row.rowType}`}
                  >
                    {row.errors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer controls */}
      <div className="shrink-0 border-t border-border/30 bg-[#071208] px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="scoreboard-toggle"
            checked={!disabled}
            onCheckedChange={val => toggleDisabled(!val)}
            data-testid="scoreboard-disable-toggle"
          />
          <Label
            htmlFor="scoreboard-toggle"
            className="text-[10px] text-muted-foreground cursor-pointer select-none"
          >
            Show scoreboard after advance
          </Label>
        </div>
        <div className="flex items-center gap-2">
          {!animationDone && (
            <RetroButton
              variant="outline"
              size="sm"
              onClick={handleSkip}
              data-testid="scoreboard-skip-btn"
            >
              Skip
            </RetroButton>
          )}
          {animationDone && (
            <RetroButton onClick={onClose} data-testid="scoreboard-continue-btn">
              Continue
            </RetroButton>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function useScoreboardEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "true"; } catch { return true; }
}
