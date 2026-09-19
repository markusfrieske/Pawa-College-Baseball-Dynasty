# W12 batch 11 — independent game-dev audit

Scope: actual recruit transport privacy and approved arrival integration. Reviewers: pc_roster_audit (technical/integrity source review), art_slice_review (approved art/UX implementation and self-review), parent (real HTTP/database/browser tests and exported-image inspection). Art self-review is not independent enjoyment evidence.

| Finding | Severity / reproduction | Acceptance and disposition |
|---|---|---|
| TI-15 raw recruit disclosure | P1:0%-scouted list/detail/manual-sign contain exact values; storyline list/detail/events bypass the board | Shared projection in server/recruit-disclosure.ts used by all identified paths; real HTTP sentinel regressions pass. Verified for bounded contract. |
| Hidden gem via lock list | P1: hidden generational flag null but locks empty | Use ordinary locks until status publicly revealed; HTTP regression passes. |
| Common fields overmasked | P1 regression found in first fix: scouting interests only enumerate core attributes | Common fields use canonical order/percentage; earned common values and remaining locks verified through real HTTP. Fixed. |
| Storyline event metadata | P1: populated archetypeAtEvent/templateId discloses hidden internal type | Shared public event projection maps labels and removes internal probabilities/outcomes/template keys; non-null list/detail/events fixture passes. Fixed. |
| Snapshot ordering | P2: exact class history published before conversion may fail | Move snapshots/history/dependent rank publication after successful conversion; source ordering reviewed; successful real advance exercised. Interrupted whole-season recovery remains W03. |
| Arrival save/replay | P1 prior page marked local completion before confirming server save and phase | Explicit authorized completion with phase/ownership checks and database transaction; injected interest-update failure rolls back flag, failed UI response retries; replay sends no POST. Fixed. |
| Export label clipping | P2: downloaded card headings/badges clipped despite correct screen | Clone-only spacing correction, regenerated real PNG visually inspected. Fixed. |

Relevant implementation: server/routes/recruiting.ts, server/routes/league-mgmt.ts, server/routes/stats.ts, server/routes/postseason.ts, server/storyline-routes.ts, server/routes/simulation.ts, client/src/pages/signing-day-reveal.tsx and its CSS, scripts/verify-recruit-disclosure.ts.

Preserved explicit exceptions: commissioner editing authority, existing public blue-chip disclosure, and public active rosters after finalization. Signing forecast winner/interest remains an intentional gameplay signal; this change does not redesign the signing resolver. No claim that the complete game has passed a security audit or that animation alone establishes a disclosure boundary.
