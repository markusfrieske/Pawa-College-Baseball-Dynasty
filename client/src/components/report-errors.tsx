import { useId } from "react";
import { parseReportError, type ReportErrorTarget } from "../lib/report-errors";

export interface ReportErrorsProps {
  error: Error | string | null;
  onNavigate?: (target: ReportErrorTarget) => void;
}

/** Persistent feedback: the parent retains the error until a retry or correction. */
export function ReportErrors({ error, onNavigate }: ReportErrorsProps) {
  const headingId = useId();
  const details = parseReportError(error);
  if (!details) return null;
  return (
    <section role="alert" aria-labelledby={headingId} aria-atomic="true" data-testid="report-errors"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <h3 id={headingId} className="font-semibold">Report could not be saved</h3>
      <p className="mt-1">{details.summary}</p>
      {details.issues.length > 0 && (
        <ul className="mt-3 space-y-3" aria-label="Report issues">
          {details.issues.map((issue, index) => (
            <li key={`${issue.id}-${index}`}>
              <span className="font-semibold">{issue.severity === "warning" ? "Warning: " : ""}{issue.label}: </span>
              <span>{issue.message}</span>
              {onNavigate && issue.target && (
                <button type="button" className="ml-2 inline-flex min-h-11 items-center underline underline-offset-2 focus-visible:outline focus-visible:outline-2"
                  onClick={() => onNavigate(issue.target!)} aria-label={`Review ${issue.label.toLowerCase()}`}>
                  Review
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
