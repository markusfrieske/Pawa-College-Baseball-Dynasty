/**
 * Shared server-side box score validation. Returns a typed issue list rather
 * than throwing/returning early so callers can decide which severity levels
 * to enforce (errors block submission; warnings are logged but allowed).
 *
 * Used by:
 *  - POST /games/:gameId/report      (initial coach submission)
 *  - PATCH /games/:gameId/report     (commissioner edit)
 *  - POST /games/:gameId/report/finalize  (commissioner force-finalize)
 */

export interface BoxScoreIssue {
  id: string;
  field?: string;
  severity: "error" | "warning";
  message: string;
}

const IP_RE = /^\d+(\.[012])?$/;

export function validateBoxScore(data: {
  homeScore: number;
  awayScore: number;
  homeHits?: number | null;
  awayHits?: number | null;
  inningScores?: number[][] | null;
  homeBoxData?: {
    batting?: Array<{ r?: number; h?: number }>;
    pitching?: Array<{ ip?: string; name?: string }>;
  } | null;
  awayBoxData?: {
    batting?: Array<{ r?: number; h?: number }>;
    pitching?: Array<{ ip?: string; name?: string }>;
  } | null;
}): BoxScoreIssue[] {
  const issues: BoxScoreIssue[] = [];
  const { homeScore, awayScore, homeHits, awayHits, inningScores, homeBoxData, awayBoxData } = data;

  if (homeScore < 0 || awayScore < 0) {
    issues.push({ id: "neg-score", severity: "error", message: "Scores cannot be negative" });
  }

  if (Array.isArray(inningScores) && inningScores.length > 0) {
    const inningHome = inningScores.reduce((s, inn) => s + (inn[1] ?? 0), 0);
    const inningAway = inningScores.reduce((s, inn) => s + (inn[0] ?? 0), 0);
    if (inningHome !== homeScore) {
      issues.push({
        id: "home-inning-total", field: "inningScores", severity: "error",
        message: `Home inning totals (${inningHome}) must match reported home score (${homeScore})`,
      });
    }
    if (inningAway !== awayScore) {
      issues.push({
        id: "away-inning-total", field: "inningScores", severity: "error",
        message: `Away inning totals (${inningAway}) must match reported away score (${awayScore})`,
      });
    }
  }

  if (Array.isArray(homeBoxData?.batting) && homeBoxData!.batting!.length > 0) {
    const runs = homeBoxData!.batting!.reduce((s, b) => s + (b.r ?? 0), 0);
    if (runs !== homeScore) {
      issues.push({
        id: "home-batting-runs", field: "homeBoxData.batting", severity: "error",
        message: `Home batting runs (${runs}) must match reported home score (${homeScore})`,
      });
    }
    if (homeBoxData!.batting!.length < 9) {
      issues.push({
        id: "home-min-batters", field: "homeBoxData.batting", severity: "error",
        message: `Home team requires at least 9 batters (got ${homeBoxData!.batting!.length})`,
      });
    }
    if (homeHits != null) {
      const h = homeBoxData!.batting!.reduce((s, b) => s + (b.h ?? 0), 0);
      if (h !== homeHits) {
        issues.push({
          id: "home-hits-mismatch", field: "homeBoxData.batting", severity: "warning",
          message: `Home batting hit total (${h}) doesn't match the reported H stat (${homeHits}) — double-check hit entries`,
        });
      }
    }
  }

  if (Array.isArray(awayBoxData?.batting) && awayBoxData!.batting!.length > 0) {
    const runs = awayBoxData!.batting!.reduce((s, b) => s + (b.r ?? 0), 0);
    if (runs !== awayScore) {
      issues.push({
        id: "away-batting-runs", field: "awayBoxData.batting", severity: "error",
        message: `Away batting runs (${runs}) must match reported away score (${awayScore})`,
      });
    }
    if (awayBoxData!.batting!.length < 9) {
      issues.push({
        id: "away-min-batters", field: "awayBoxData.batting", severity: "error",
        message: `Away team requires at least 9 batters (got ${awayBoxData!.batting!.length})`,
      });
    }
    if (awayHits != null) {
      const h = awayBoxData!.batting!.reduce((s, b) => s + (b.h ?? 0), 0);
      if (h !== awayHits) {
        issues.push({
          id: "away-hits-mismatch", field: "awayBoxData.batting", severity: "warning",
          message: `Away batting hit total (${h}) doesn't match the reported H stat (${awayHits}) — double-check hit entries`,
        });
      }
    }
  }

  for (const [side, pArr] of [
    ["home", homeBoxData?.pitching],
    ["away", awayBoxData?.pitching],
  ] as [string, Array<{ ip?: string; name?: string }> | undefined][]) {
    if (!Array.isArray(pArr)) continue;
    for (const p of pArr) {
      if (p.ip && !IP_RE.test(p.ip)) {
        issues.push({
          id: `${side}-ip-${p.name ?? "pitcher"}`, field: `${side}BoxData.pitching`, severity: "error",
          message: `Invalid IP format "${p.ip}" for ${p.name ?? "pitcher"} — use format like "6.0" or "2.1"`,
        });
      }
    }
  }

  return issues;
}
