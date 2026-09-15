/** Current reporting UI contract; server authorization remains authoritative. */
export interface ReportRole {
  isCommissioner: boolean;
  isInvolvedCoach: boolean;
  requiresOverrideReason: boolean;
}

export const REPORT_OVERRIDE_REASON_MAX_LENGTH = 2000;

/** Explicit omission prevents a retained full-report draft leaking into score-only submission. */
export function buildScoreOnlyReport(input: { homeScore: number; awayScore: number; overrideReason?: string }) {
  return {
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    homeHits: null, awayHits: null, homeErrors: null, awayErrors: null,
    inningScores: null, homeBoxData: null, awayBoxData: null,
    ...(input.overrideReason !== undefined ? { overrideReason: input.overrideReason.trim() } : {}),
  };
}

export function reportOverrideReasonError(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Enter a reason for reporting on behalf of these teams.";
  if (value.trim().length > REPORT_OVERRIDE_REASON_MAX_LENGTH) return `Keep the commissioner reason to ${REPORT_OVERRIDE_REASON_MAX_LENGTH} characters or fewer.`;
  return null;
}

/** Version carried by the draft being edited, bounded by the PostgreSQL integer column. */
export function isReportEditVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
}
