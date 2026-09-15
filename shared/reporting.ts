/** Current reporting UI contract; server authorization remains authoritative. */
export interface ReportRole {
  isCommissioner: boolean;
  isInvolvedCoach: boolean;
  requiresOverrideReason: boolean;
}

export const REPORT_OVERRIDE_REASON_MAX_LENGTH = 2000;

export function reportOverrideReasonError(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Enter a reason for reporting on behalf of these teams.";
  if (value.trim().length > REPORT_OVERRIDE_REASON_MAX_LENGTH) return `Keep the commissioner reason to ${REPORT_OVERRIDE_REASON_MAX_LENGTH} characters or fewer.`;
  return null;
}
