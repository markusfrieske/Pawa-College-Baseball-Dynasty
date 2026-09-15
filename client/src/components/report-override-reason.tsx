import { REPORT_OVERRIDE_REASON_MAX_LENGTH } from "../../../shared/reporting";

export interface ReportOverrideReasonProps {
  value: string;
  onChange: (value: string) => void;
}

/** Parent-owned draft survives switching between score entry and OCR review. */
export function ReportOverrideReason({ value, onChange }: ReportOverrideReasonProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="report-override-heading">
      <h3 id="report-override-heading" className="font-semibold">Report on behalf of a coach</h3>
      <p id="report-override-description" className="mt-1 text-sm text-muted-foreground">
        Explain why you are submitting this game as commissioner. Your reason is recorded with the report.
        This does not approve the result: the report remains pending review.
      </p>
      <label htmlFor="report-override-reason" className="mt-3 block text-sm font-medium">
        Commissioner reason (required)
      </label>
      <textarea id="report-override-reason" name="overrideReason" required maxLength={REPORT_OVERRIDE_REASON_MAX_LENGTH} rows={3}
        value={value} onChange={event => onChange(event.target.value)}
        aria-describedby="report-override-description report-override-count"
        className="mt-1 block min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
      <p id="report-override-count" className="mt-1 text-xs text-muted-foreground">{value.length} / {REPORT_OVERRIDE_REASON_MAX_LENGTH} characters</p>
    </section>
  );
}
