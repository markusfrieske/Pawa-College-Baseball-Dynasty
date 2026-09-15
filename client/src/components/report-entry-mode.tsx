import { useId } from "react";

export type ReportEntryModeValue = "full" | "score-only";

export interface ReportEntryModeProps {
  value: ReportEntryModeValue;
  onChange: (value: ReportEntryModeValue) => void;
}

/** Commissioner-only visibility and draft ownership are controlled by the report page. */
export function ReportEntryMode({ value, onChange }: ReportEntryModeProps) {
  const id = useId();
  return (
    <fieldset className="rounded-lg border border-border bg-card p-4" aria-describedby={`${id}-description`}>
      <legend className="px-1 font-semibold">Report detail</legend>
      <div className="space-y-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input p-3">
          <input type="radio" name={`${id}-mode`} value="full" checked={value === "full"}
            onChange={() => onChange("full")} className="h-4 w-4 accent-primary" />
          <span>Full report</span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input p-3">
          <input type="radio" name={`${id}-mode`} value="score-only" checked={value === "score-only"}
            onChange={() => onChange("score-only")} className="h-4 w-4 accent-primary" />
          <span>Score only (commissioner)</span>
        </label>
      </div>
      <p id={`${id}-description`} className="mt-3 text-sm text-muted-foreground">
        {value === "score-only"
          ? "Submit only the final score. Innings, hits, errors and player stats remain unknown; no player lines are included. Your full report draft is retained if you switch back."
          : "Include inning scores and complete batting and pitching lines for both teams. Score-only entry lets a commissioner record a final result when those details are unavailable."}
      </p>
    </fieldset>
  );
}
