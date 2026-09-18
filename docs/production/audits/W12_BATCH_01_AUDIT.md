# Independent roster integration audit

September 18, 2026. Reviewer: game-shell UX subagent, read-only ownership. Modal implementation was delegated to a separate agent; parent owned DTO/hook integration and the real browser/API harness.

| Severity | Reproduction / finding | Acceptance / result |
| --- | --- | --- |
| P1 | Load roster against actual flat league GET: nested reads fail; commissioner hidden, phase missed, week/season default to one | Root-typed DTO and current values propagated. Real role/mode/browser checks pass. |
| P1 | Enable commissioner editor and save: strict PATCH rejects full form including derived/appearance fields and ID | Only changed allowed fields; ID URL-only. Real commissioner/co-commissioner saves succeed; forbidden fields still rejected. |
| P1 | Edit identity with zero/null ratings or RS eligibility: full-form defaults alter or reject unchanged values | Real database retains zero, null, RS and SP on identity-only save. Changed zero rating also saves. |
| P2 | Select own team explicitly: selector state falsely classifies it as opponent | Authenticated coach/returned-team match retains own controls. Opponent controls remain distinct. |
| P2 | Inspect eligible opponent as ordinary coach: draft button appears despite server denial | Only owner or commissioner/co-commissioner sees eligible action; server authorization unchanged. Mutation itself remains a separate gate. |

Final source review: no remaining blocking findings for the bounded repair. Coverage review confirms the final log's 170 checks and their stated scope. Reviewer did not independently execute the gate. Test-only sessions are not login evidence. The 390px injected-503 case proves draft preservation/retry in reported mode for a co-commissioner, not transaction rollback, mode-wide mobile coverage or captain/draft execution. No full inspector, controller, Steam, human enjoyment or release certification.

Sources: [roster hook](../../../client/src/pages/roster/hooks/useRosterData.ts), [DTO](../../../client/src/pages/roster/types.ts), [editor](../../../client/src/pages/roster/components/PlayerEditModal.tsx), [actual routes](../../../server/routes/roster.ts), [real regression](../../../scripts/verify-roster-context.ts), [batch evidence](../W12_BATCH_01.md).
