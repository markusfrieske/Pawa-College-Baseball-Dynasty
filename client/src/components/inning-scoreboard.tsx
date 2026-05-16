import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { RetroButton } from "@/components/ui/retro-button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "cbd-scoreboard-disabled";
const HALF_INNING_DELAY_MS = 190;
const FINAL_REVEAL_PAUSE_MS = 700;

function BaseballDiamond({ topHalf, isActive }: { topHalf: boolean; isActive: boolean }) {
  const size = 60;
  const mid = size / 2;
  const r = size * 0.34;
  const top = { cx: mid, cy: mid - r };
  const right = { cx: mid + r, cy: mid };
  const bottom = { cx: mid, cy: mid + r };
  const left = { cx: mid - r, cy: mid };
  const pts = `${top.cx},${top.cy} ${right.cx},${right.cy} ${bottom.cx},${bottom.cy} ${left.cx},${left.cy}`;
  const gold = "#FFD700";
  const dim = "#FFD70044";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <polygon points={pts} fill="none" stroke={gold} strokeWidth={1.5} opacity={0.35} />
      {/* Top vertex — lit on TOP half */}
      <circle
        cx={top.cx}
        cy={top.cy}
        r={isActive && topHalf ? 5.5 : 3}
        fill={isActive && topHalf ? gold : dim}
        style={{ transition: "r 0.15s, fill 0.15s" }}
      />
      {/* Right/left vertices */}
      <circle cx={right.cx} cy={right.cy} r={2.5} fill={dim} />
      <circle cx={left.cx} cy={left.cy} r={2.5} fill={dim} />
      {/* Bottom (home plate) — lit on BOTTOM half */}
      <circle
        cx={bottom.cx}
        cy={bottom.cy}
        r={isActive && !topHalf ? 5.5 : 3}
        fill={isActive && !topHalf ? gold : dim}
        style={{ transition: "r 0.15s, fill 0.15s" }}
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

export function InningScoreboard({ open, onClose, data }: InningScoreboardProps) {
  const [revealedHalves, setRevealedHalves] = useState(0);
  const [showFinal, setShowFinal] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [disabled, setDisabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  const totalInnings = data?.inningScores?.length ?? 9;
  const totalHalves = totalInnings * 2;

  const animationDone = skipped || (revealedHalves >= totalHalves && showFinal);

  // Reset state when dialog opens or closes
  useEffect(() => {
    if (!open) {
      setRevealedHalves(0);
      setShowFinal(false);
      setSkipped(false);
    }
  }, [open]);

  // Reveal one half-inning at a time
  useEffect(() => {
    if (!open || !data || skipped || revealedHalves >= totalHalves) return;
    const timer = setTimeout(() => setRevealedHalves(prev => prev + 1), HALF_INNING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, data, revealedHalves, skipped, totalHalves]);

  // Walk-off / final reveal pause — extra beat before showing R/H/E totals
  useEffect(() => {
    if (!open || !data || skipped || revealedHalves < totalHalves || showFinal) return;
    const timer = setTimeout(() => setShowFinal(true), FINAL_REVEAL_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [open, data, revealedHalves, skipped, totalHalves, showFinal]);

  const handleSkip = useCallback(() => {
    setSkipped(true);
    setRevealedHalves(totalHalves);
    setShowFinal(true);
  }, [totalHalves]);

  const toggleDisabled = useCallback((val: boolean) => {
    setDisabled(val);
    try { localStorage.setItem(STORAGE_KEY, val ? "true" : "false"); } catch {}
  }, []);

  if (!open || !data) return null;

  const innings = data.inningScores;
  const awayWon = data.awayScore > data.homeScore;
  const homeWon = data.homeScore > data.awayScore;
  const userWon = data.isHome ? homeWon : awayWon;

  const resultLabel = userWon ? "WIN" : "LOSS";
  const resultColor = userWon ? "#FFD700" : "#e05252";

  // Which half is currently being revealed
  const isTopHalf = revealedHalves % 2 === 0;
  const currentInningNum = Math.floor(revealedHalves / 2) + 1;
  const isAnimating = !skipped && revealedHalves < totalHalves;

  const homeColor = data.homeColor ?? "#FFD700";
  const awayColor = data.awayColor ?? "#7eb8f7";

  const phaseLabel: Record<string, string> = {
    regular_season: "Regular Season",
    preseason: "Spring Training",
    spring_training: "Spring Training",
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
      // Away (top half) for inning i revealed when revealedHalves > i*2
      getRevealed: (i: number) => skipped || revealedHalves > i * 2,
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
      // Home (bottom half) for inning i revealed when revealedHalves > i*2+1
      getRevealed: (i: number) => skipped || revealedHalves > i * 2 + 1,
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "rgba(5, 18, 6, 0.97)" }}
      data-testid="inning-scoreboard-modal"
    >
      {/* Header bar */}
      <div className="shrink-0 border-b border-gold/30 bg-[#071208] px-6 py-4 flex items-center gap-4">
        <BaseballDiamond topHalf={isTopHalf} isActive={isAnimating} />
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-[12px] text-gold tracking-wider leading-none">
            {isAnimating
              ? `${isTopHalf ? "TOP" : "BOT"} ${currentInningNum}`
              : "FINAL"}
          </p>
          <p className="text-[9px] text-muted-foreground mt-1.5">
            {data.phase ? (phaseLabel[data.phase] ?? data.phase) : "Game Result"}
            {data.season ? ` · Season ${data.season}` : ""}
            {data.week ? ` · Week ${data.week}` : ""}
          </p>
        </div>

        {/* Result badge — appears after animation + final reveal */}
        <div
          className={`text-right shrink-0 transition-opacity duration-300 ${animationDone ? "opacity-100" : "opacity-0"}`}
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

      {/* Scoreboard — fills remaining space, centered */}
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
            style={{ minWidth: "min(100%, 680px)" }}
            data-testid="scoreboard-table"
          >
            <thead>
              <tr>
                <th className="py-2 px-3 text-left font-pixel text-[9px] text-muted-foreground font-normal w-32" />
                {Array.from({ length: totalInnings }, (_, i) => {
                  const inningActive = isAnimating && Math.floor(revealedHalves / 2) === i;
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
                <th className="py-2 px-3 text-center font-pixel text-[9px] text-gold font-normal min-w-[38px] border-l border-border/50">R</th>
                <th className="py-2 px-3 text-center font-pixel text-[9px] text-muted-foreground font-normal min-w-[38px]">H</th>
                <th className="py-2 px-3 text-center font-pixel text-[9px] text-muted-foreground font-normal min-w-[38px]">E</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.rowType}
                  className="border-t border-border/30"
                  style={{
                    backgroundColor: row.isUserSide
                      ? `${row.color}14`
                      : undefined,
                  }}
                  data-testid={`scoreboard-row-${row.rowType}`}
                >
                  {/* Team label + name */}
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
                      <span
                        className="text-[9px] truncate max-w-[110px]"
                        style={{ color: "#ffffff55" }}
                      >
                        {row.teamName}
                      </span>
                    </div>
                  </td>

                  {/* Per-inning cells */}
                  {Array.from({ length: totalInnings }, (_, i) => {
                    const revealed = row.getRevealed(i);
                    const runs = innings[i]?.[row.inningRunsIdx] ?? 0;
                    return (
                      <td
                        key={i}
                        className={`py-3 px-2 text-center font-mono text-sm transition-all duration-100 ${
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

                  {/* R total */}
                  <td
                    className={`py-3 px-3 text-center font-pixel text-base border-l border-border/50 transition-all duration-300 ${
                      showFinal ? "opacity-100" : "opacity-0"
                    }`}
                    style={row.isWinner ? { color: row.color } : { color: "#ffffffaa" }}
                    data-testid={`scoreboard-total-r-${row.rowType}`}
                  >
                    {row.score}
                  </td>
                  {/* H total */}
                  <td
                    className={`py-3 px-3 text-center text-sm transition-all duration-300 ${
                      showFinal ? "opacity-100" : "opacity-0"
                    }`}
                    style={{ color: "#ffffff66" }}
                    data-testid={`scoreboard-total-h-${row.rowType}`}
                  >
                    {row.hits}
                  </td>
                  {/* E total */}
                  <td
                    className={`py-3 px-3 text-center text-sm transition-all duration-300 ${
                      showFinal ? "opacity-100" : "opacity-0"
                    }`}
                    style={{ color: "#ffffff66" }}
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
            <RetroButton
              onClick={onClose}
              data-testid="scoreboard-continue-btn"
            >
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
