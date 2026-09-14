# W02 batch 02 — repair OCR roster identity

Date: September 14, 2026. Branch: `codex/pawa-quality-overhaul`.
Implementation: `6276509ee21f905e4afe9b2b13e806389afd7fc1`.

**Outcome:** selecting a roster player now replaces the actual report identity while preserving extracted statistics. UX-12 passes its bounded acceptance after an [independent milestone audit](audits/W02_BATCH_02_AUDIT.md). This is a verified reporting repair, not completion of W02 or release certification.

## Delivered behavior

- Batting and pitching review rows have canonical roster selectors. Reassignment updates ID/name together, preserves statistics and pitching decisions, clears unresolved identity, and migrates field provenance. The score-step pitching selector uses the same atomic identity operation.
- Ambiguous name matches stay unresolved. Unmatched rows remain separate instead of silently combining different players. Unnamed pitchers retain their innings, counters and extraction metadata for deliberate assignment.
- Missing, foreign, unresolved and duplicate IDs block review submission against the actual team roster. Duplicate identities are excluded within each section; two-way players can appear in both batting and pitching. Coaches can remove extra screenshot rows.
- Repeated corrections in OCR review retain the original observation and latest value. Identity changes move correction keys, and review removals prune unused keys. Legacy duplicate rows retain metadata still owned by a remaining row.
- Failed roster loading is visible and blocks submission. POST and PATCH failures persist in the form while preserving entered state. The submit handler enforces hard errors directly.

The shared [identity helper](../../client/src/lib/report-roster-identity.ts), [pitching extraction helper](../../client/src/lib/report-pitching.ts), [review component](../../client/src/components/ocr-review-screen.tsx) and [report page](../../client/src/pages/report-game.tsx) implement this slice.

## Verification and audit

| Gate | Result | Scope |
| --- | --- | --- |
| Complete configured unit suite | 101 passed | Parent run, including new identity and pitching suites. |
| Independent affected pure suites | 19 passed | Eight merge, nine identity and two pitching tests. |
| Real review component in headless Edge | 45 assertions passed | Implementer and independent reviewer runs; final portable launcher rerun also passed. |
| Real report HTTP/PostgreSQL gate | 83 assertions passed | Parent and independent reviewer runs; a client-remapped payload passes actual database roster validation and finalization. |
| TypeScript | Passed | Full project plus affected helper tests/HTTP harness; browser fixture and harness also checked. |
| Git whitespace check | Passed | Source and documentation checked before checkpoint. |

The reviewer caught a surname-only ambiguity (`Smith` with Alex Smith and Sam Smith); the matcher now requires a separate given-name token before initial disambiguation. A regression test covers it. Pitching extraction and metadata preserve the same row order even when an OCR name is absent.

The browser gate uses the actual component with synthetic host callbacks, a fresh browser context and loopback requests. It checks keyboard selection and focus, stat preservation, duplicate exclusion, two-way use, metadata movement, hard-error clearance and removal. It does not execute the complete report-page callbacks; those received source review plus separate helper/HTTP verification. Its 375-pixel viewport and lack of production CSS/media do not certify mobile layout or visual quality.

Browser bundles, HTTP children and randomly named report databases were cleaned up. No report fixture databases remained, and the owned PostgreSQL cluster was stopped. Existing local baseline data was preserved.

## Remaining work and next slice

1. **UX-01/UX-03:** display all structured server issues with useful section/field labels and accurate entry requirements. Persisting the first message is partial progress, not complete feedback acceptance.
2. **W02-OCR-01:** route generic score-step stat edits and removals through correction tracking. Editing a corrected row after returning from review can leave its submitted correction metadata stale. Add regression coverage for edit-back, repeated changes and removal; immutable server revision history remains W03.
3. Complete the full report-page browser journey on the [complete-media build](BUILD_PREREQUISITES.md), including roster failures/recovery, step transitions and submitted payloads. This checkout's media prerequisite remains open.
4. Keep [Power Pros contract inputs](POWER_PROS_CONTRACT_INPUTS.md) explicit. This batch retains current application validation and does not invent edition, innings, tie, mercy or workload rules.

Continue the next dependency-ready reporting slice during the existing hourly development cadence. No merge, deployment or production-data operation occurred.
