export interface ReportErrorTarget {
  section: "score" | "errors" | "innings" | "batting" | "pitching";
  side?: "home" | "away";
  rowIndex?: number;
}

export interface ReportErrorIssue {
  id: string;
  field?: string;
  label: string;
  message: string;
  severity: "error" | "warning";
  target?: ReportErrorTarget;
}

export interface ReportErrorDetails {
  summary: string;
  issues: ReportErrorIssue[];
}

const FALLBACK = "The report could not be saved. Please try again.";
const FIELD_LABELS: Record<string, string> = {
  playerId: "Roster player", name: "Player name", ab: "At-bats", r: "Runs", h: "Hits",
  doubles: "Doubles", triples: "Triples", hr: "Home runs", rbi: "Runs batted in", bb: "Walks",
  so: "Strikeouts", sb: "Stolen bases", hbp: "Hit by pitch", cs: "Caught stealing",
  barrels: "Barrels", ballsInPlay: "Balls in play", hardHits: "Hard hits", putouts: "Putouts",
  assists: "Assists", fieldingErrors: "Fielding errors", totalChances: "Fielding chances",
  er: "Earned runs", ip: "Innings pitched", totalPitches: "Pitch count", whiffs: "Whiffs",
  exitVelo: "Exit velocity", spinRate: "Spin rate", win: "Winning pitcher", loss: "Losing pitcher",
};

function plainText(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const text = value.trim();
  // Do not turn HTML error pages or malformed JSON bodies into player feedback.
  if (!text || /^[{[<]/.test(text)) return;
  return text;
}

/** Server field paths use zero-based row indexes; labels are one-based for coaches. */
export function describeReportField(field?: string): { label: string; target?: ReportErrorTarget } {
  if (!field) return { label: "Report" };
  const teamField = /^(home|away)(Score|Hits|Errors)$/.exec(field);
  if (teamField) {
    const side = teamField[1] as "home" | "away";
    const section = teamField[2] === "Hits" ? "batting" : teamField[2] === "Errors" ? "errors" : "score";
    return { label: `${side === "home" ? "Home" : "Away"} ${teamField[2].toLowerCase()}`, target: { section, side } };
  }
  if (field === "score") return { label: "Final score", target: { section: "score" } };
  const inning = /^inningScores(?:\.(\d+))?$/.exec(field);
  if (inning) {
    const index = inning[1] === undefined ? undefined : Number(inning[1]);
    if (index !== undefined && !Number.isSafeInteger(index)) return { label: "Inning scores" };
    return { label: index === undefined ? "Inning scores" : `Inning ${index + 1}`, target: { section: "innings", ...(index === undefined ? {} : { rowIndex: index }) } };
  }
  const box = /^(home|away)BoxData(?:\.(batting|pitching|totals)(?:\.(\d+))?(?:\.([a-zA-Z]+))?)?$/.exec(field);
  if (box) {
    const side = box[1] as "home" | "away";
    const team = side === "home" ? "Home" : "Away";
    const section = box[2];
    if (!section) return { label: `${team} box score` };
    const rowIndex = box[3] === undefined ? undefined : Number(box[3]);
    const row = rowIndex === undefined ? "" : Number.isSafeInteger(rowIndex) ? `, row ${rowIndex + 1}` : "";
    const stat = box[4] && FIELD_LABELS[box[4]];
    return {
      label: `${team} ${section === "totals" ? "batting totals" : section}${row}${stat ? ` — ${stat}` : ""}`,
      ...(section !== "totals" && (rowIndex === undefined || Number.isSafeInteger(rowIndex))
        ? { target: { section: section as "batting" | "pitching", side, ...(rowIndex === undefined ? {} : { rowIndex }) } }
        : {}),
    };
  }
  if (field === "overrideReason") return { label: "Commissioner override reason" };
  if (field === "boxData") return { label: "Full box score" };
  // Unknown paths are diagnostic data, not coach-facing labels or navigation IDs.
  return { label: "Report" };
}

/** Decode apiRequest's `status: body` Error without discarding field issues. */
export function parseReportError(error: Error | string | null): ReportErrorDetails | null {
  if (error === null) return null;
  const raw = typeof error === "string" ? error : error.message;
  const body = raw.replace(/^\s*\d{3}:\s*/, "").trim();
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return { summary: plainText(body) ?? FALLBACK, issues: [] }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { summary: FALLBACK, issues: [] };
  const payload = parsed as Record<string, unknown>;
  const issues: ReportErrorIssue[] = [];
  if (Array.isArray(payload.validationErrors)) {
    for (const [index, value] of payload.validationErrors.entries()) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const issue = value as Record<string, unknown>;
      const message = plainText(issue.message);
      if (!message) continue;
      const field = typeof issue.field === "string" ? issue.field : undefined;
      issues.push({
        id: typeof issue.id === "string" ? issue.id : `report-issue-${index}`,
        ...(field ? { field } : {}),
        ...describeReportField(field), message,
        severity: issue.severity === "warning" ? "warning" : "error",
      });
    }
  }
  return { summary: plainText(payload.message) ?? issues.find(issue => issue.severity === "error")?.message ?? FALLBACK, issues };
}
