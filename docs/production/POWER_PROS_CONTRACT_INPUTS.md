# Power Pros league contract inputs

Status: unresolved inputs as of September 14, 2026. These are required for W02 result-contract completion and release acceptance. No edition-specific rules are approved by the production schedule alone.

| Decision | Current evidence / required input |
| --- | --- |
| Power Pros edition and platform | Frisk's edition/platform needed. |
| Regulation innings | Frisk's league setting needed; no blanket nine-inning assumption may be introduced. |
| Extra innings, ties and mercy endings | League limits, allowed final ties, mercy thresholds and eligible innings needed. Suspended/abandoned/forfeit handling also remains open. |
| External roster | Capacity, player identity mapping, roster update method and revision ownership needed. |
| Reporting completeness | Decide mandatory counting/decision/workload/evidence fields, explicit score-only eligibility, and how unknown observations are represented. Existing defaults must not be treated as observed zeros. |
| Confirmation/disputes | Authority, deadlines and correction approval policy needed; implementation must preserve versioned provenance. |
| Progression and parity | Decide how simulator progression maps to external Power Pros rosters and whether league modes differ. |

The current application rejects ties and scores above 30 and requires at least nine batters when batting rows are supplied. W02 batch 01 preserves those restrictions pending a declared league policy; it does not endorse them as universally correct baseball behavior. Pitching notation records outs as `.0`, `.1` or `.2`, not decimal fractions of an inning.

The active task asked Frisk for edition/platform and regulation/extra-inning/tie/mercy settings on September 14. No answer was available when this document was written. Record the answer here before dependent validator changes. Other ready work, including roster remapping, generic numerical consistency, error feedback and revision design, can continue without guessing these decisions.
