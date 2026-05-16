import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "cbd-scoreboard-disabled";
const REVEAL_DELAY_MS = 380;

function BaseballDiamond({ small }: { small?: boolean }) {
  const size = small ? 32 : 48;
  const mid = size / 2;
  const r = size * 0.36;
  const pts = [
    `${mid},${mid - r}`,
    `${mid + r},${mid}`,
    `${mid},${mid + r}`,
    `${mid - r},${mid}`,
  ].join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <polygon points={pts} fill="none" stroke="#FFD700" strokeWidth={small ? 1.5 : 2} opacity={0.6} />
      <circle cx={mid} cy={mid + r} r={small ? 2 : 3} fill="#FFD700" opacity={0.8} />
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
  const [revealedCount, setRevealedCount] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [disabled, setDisabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  const totalInnings = data?.inningScores?.length ?? 9;
  const animationDone = skipped || revealedCount >= totalInnings;

  useEffect(() => {
    if (!open) {
      setRevealedCount(0);
      setSkipped(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !data || skipped || animationDone) return;
    const timer = setTimeout(() => setRevealedCount(prev => prev + 1), REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, data, revealedCount, skipped, animationDone]);

  const handleSkip = useCallback(() => {
    setSkipped(true);
    setRevealedCount(totalInnings);
  }, [totalInnings]);

  const toggleDisabled = useCallback((val: boolean) => {
    setDisabled(val);
    try { localStorage.setItem(STORAGE_KEY, val ? "true" : "false"); } catch {}
  }, []);

  if (!data) return null;

  const displayCount = skipped ? totalInnings : revealedCount;
  const innings = data.inningScores;

  const awayWon = data.awayScore > data.homeScore;
  const homeWon = data.homeScore > data.awayScore;
  const userWon = data.isHome ? homeWon : awayWon;

  const resultLabel = userWon ? "WIN" : "LOSS";
  const resultColor = userWon ? "#FFD700" : "#e05252";

  const phaseLabel: Record<string, string> = {
    regular_season: "Regular Season",
    preseason: "Spring Training",
    spring_training: "Spring Training",
    conference_championship: "Conference Championship",
    super_regionals: "Super Regionals",
    cws: "College World Series",
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-[640px] w-full bg-card border-2 border-gold/60 p-0 gap-0 overflow-hidden"
        data-testid="inning-scoreboard-modal"
      >
        <div
          className="p-4 pb-2 border-b border-border bg-[#0d2010] flex items-center justify-between gap-3 cursor-pointer select-none"
          onClick={!animationDone ? handleSkip : undefined}
          title={!animationDone ? "Click to skip animation" : undefined}
        >
          <div className="flex items-center gap-3 min-w-0">
            <BaseballDiamond />
            <div className="min-w-0">
              <p className="font-pixel text-[10px] text-gold tracking-wider">FINAL SCORE</p>
              {data.phase && (
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {phaseLabel[data.phase] ?? data.phase}
                  {data.season ? ` · S${data.season}` : ""}
                  {data.week ? ` W${data.week}` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p
              className="font-pixel text-xl leading-none"
              style={{ color: resultColor }}
              data-testid="scoreboard-result-label"
            >
              {animationDone ? resultLabel : "…"}
            </p>
            {animationDone && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {data.isHome ? data.homeAbbr : data.awayAbbr}
              </p>
            )}
          </div>
        </div>

        <div
          className="overflow-x-auto px-4 py-3 cursor-pointer select-none"
          onClick={!animationDone ? handleSkip : undefined}
        >
          {!animationDone && (
            <p className="text-[9px] text-muted-foreground font-pixel text-center animate-pulse mb-2">
              Click to skip…
            </p>
          )}

          <table className="w-full border-collapse text-xs" data-testid="scoreboard-table">
            <thead>
              <tr>
                <th className="py-1 px-2 text-left text-[9px] font-normal text-muted-foreground w-16 font-pixel">TEAM</th>
                {Array.from({ length: totalInnings }, (_, i) => (
                  <th
                    key={i}
                    className="py-1 px-1.5 text-center text-[9px] font-normal text-muted-foreground min-w-[26px]"
                    data-testid={`scoreboard-inning-header-${i + 1}`}
                  >
                    {i + 1}
                  </th>
                ))}
                <th className="py-1 px-2 text-center text-[9px] font-normal text-gold font-pixel min-w-[28px] border-l border-border/60">R</th>
                <th className="py-1 px-2 text-center text-[9px] font-normal text-muted-foreground font-pixel min-w-[28px]">H</th>
                <th className="py-1 px-2 text-center text-[9px] font-normal text-muted-foreground font-pixel min-w-[28px]">E</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: data.awayAbbr,
                  teamName: data.awayTeam,
                  score: data.awayScore,
                  hits: data.awayHits,
                  errors: data.awayErrors,
                  isWinner: awayWon,
                  isUserSide: !data.isHome,
                  inningIdx: 0,
                },
                {
                  label: data.homeAbbr,
                  teamName: data.homeTeam,
                  score: data.homeScore,
                  hits: data.homeHits,
                  errors: data.homeErrors,
                  isWinner: homeWon,
                  isUserSide: data.isHome,
                  inningIdx: 1,
                },
              ].map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`border-t border-border/40 ${row.isUserSide ? "bg-gold/5" : ""}`}
                  data-testid={`scoreboard-row-${rowIdx === 0 ? "away" : "home"}`}
                >
                  <td className="py-2 px-2">
                    <div className="flex flex-col">
                      <span
                        className={`font-pixel text-[9px] ${row.isWinner && animationDone ? "text-gold" : row.isUserSide ? "text-foreground" : "text-muted-foreground"}`}
                        data-testid={`scoreboard-abbr-${rowIdx === 0 ? "away" : "home"}`}
                      >
                        {row.label}
                      </span>
                    </div>
                  </td>
                  {Array.from({ length: totalInnings }, (_, i) => {
                    const revealed = i < displayCount;
                    const runs = innings[i]?.[row.inningIdx] ?? 0;
                    return (
                      <td
                        key={i}
                        className={`py-2 px-1.5 text-center font-mono transition-all duration-200 ${
                          revealed
                            ? runs > 0
                              ? "text-gold font-semibold"
                              : "text-muted-foreground"
                            : "text-transparent"
                        }`}
                        data-testid={`scoreboard-cell-${rowIdx === 0 ? "away" : "home"}-${i + 1}`}
                      >
                        {revealed ? runs : "—"}
                      </td>
                    );
                  })}
                  <td
                    className={`py-2 px-2 text-center font-pixel border-l border-border/60 transition-all duration-200 ${
                      animationDone
                        ? row.isWinner
                          ? "text-gold text-sm font-bold"
                          : "text-muted-foreground text-sm"
                        : "text-transparent"
                    }`}
                    data-testid={`scoreboard-total-r-${rowIdx === 0 ? "away" : "home"}`}
                  >
                    {animationDone ? row.score : "—"}
                  </td>
                  <td
                    className={`py-2 px-2 text-center text-muted-foreground transition-all duration-200 ${animationDone ? "opacity-100" : "opacity-0"}`}
                    data-testid={`scoreboard-total-h-${rowIdx === 0 ? "away" : "home"}`}
                  >
                    {row.hits}
                  </td>
                  <td
                    className={`py-2 px-2 text-center text-muted-foreground transition-all duration-200 ${animationDone ? "opacity-100" : "opacity-0"}`}
                    data-testid={`scoreboard-total-e-${rowIdx === 0 ? "away" : "home"}`}
                  >
                    {row.errors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border bg-[#0a1a0a] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="scoreboard-toggle"
              checked={!disabled}
              onCheckedChange={val => toggleDisabled(!val)}
              data-testid="scoreboard-disable-toggle"
            />
            <Label htmlFor="scoreboard-toggle" className="text-[10px] text-muted-foreground cursor-pointer select-none">
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
      </DialogContent>
    </Dialog>
  );
}

export function useScoreboardEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "true"; } catch { return true; }
}
