# W12 batch 02 — Class of Nine roster and lineup slice

September 18, 2026. Implementation: `f7b27fb`. Manually authorized by Frisk after approving the refined B gateway identity. Scheduled development remains paused. This batch is a playable roster milestone, not completion of W12 or the full screen redesign.

## Delivered

- Approved Class of Nine gateway, C9 plate and italic wordmark in the shared shell and landing identity. Browser title, metadata, manifest, favicon and PNG app icons use the new identity. Source SVG lockups are in `client/public/brand`; raster regeneration is `node scripts/export-brand-icons.mjs` on a machine with Georgia installed. The live SVG lettering still depends on Georgia; final outlined cross-platform wordmarks remain a release asset task.
- One searchable, sortable roster manifest with correct pitcher/outfielder/DH/redshirt filters, compact player cards, profile access and captain controls. List filters disappear in the lineup workspace instead of implying that they filter the field.
- Saved defensive positions on a baseball diamond, with explicit missing/conflicting assignments; separate batting order and pitching views, reserve lists and pitcher availability. Natural position is never silently presented as saved defense. Slot dialogs support keyboard selection, swaps, clearing, retained failure choices and pending-state protection. Profile close restores focus. The field uses growing grid rows rather than clipping cards to its curved edge.
- Four manual assignment APIs now authorize every player inside the requested league and perform the complete update in one PostgreSQL transaction. They reject unknown fields, duplicate IDs, invalid slots and new assignment collisions. Existing duplicate conflicts can be repaired one slot at a time when the change strictly reduces conflicts without introducing another.

## Verification

The complete `node --import tsx scripts/verify-roster-context.ts` gate passes **241 checks** against the built React UI, registered HTTP routes and a fresh numbered-migration PostgreSQL database. It retains the 170-check batch-01 coverage and adds real defensive/batting/pitching saves, reload persistence, keyboard profile/assignment access, focus return, nested draft-confirmation cancellation, failure/retry, corrected filters and opponent controls in both simulated and reported modes.

Integrity cases include mixed valid/foreign-player requests on all four APIs with unchanged database snapshots; member/opponent refusal; duplicate IDs and malformed fields; an injected SQL failure after the first write with full rollback; retry and sibling-field preservation; repair of two pre-existing conflicts; and simultaneous claims on one free batting slot returning one success and one conflict. The logged synthetic SQL exception is an intentional rollback test. Width checks cover 1440, 768 and 390 CSS pixels; they are not native touch or browser-zoom certification.

TypeScript and the production client/server build pass. The final field repair receives an additional 68-check focused assignment/browser regression and visual review at desktop and 390px. The [independent audit](audits/W12_BATCH_02_AUDIT.md) separates source review from parent-executed runtime evidence. An early test trigger had incorrect PostgreSQL dollar quoting; corrected before the successful run. Profile Escape testing now waits for focus to enter the dialog before closing it; a subsequent intermittent close failure was fixed with explicit Escape dismissal in the profile dialog/sheet, then the affected regression was rerun.

## Local review and boundaries

Set `PAWA_ROSTER_REVIEW=1` alongside the explicit loopback `PAWA_TEST_DATABASE_URL` when running the gate to retain its successfully tested disposable league. It prints a local `/__test/review` URL that creates a test-only member session. A visible banner distinguishes it from real saves. The server binds only to loopback; this mode is inside the verification harness, never the production server. Ctrl+C/SIGTERM closes the harness and drops its random database. Failed/default verification runs clean up automatically. Current review process and owned local PostgreSQL are deliberately left running for Frisk; local connection information remains ignored, never committed.

Manual-vs-manual locking is verified. Auto-lineup, advancement and other roster writers are not covered by that concurrency claim. Batting membership can temporarily leave defense missing or conflicted; the field shows that draft state and permits repair. This batch does not establish a game-start legality gate or change external baseball rules. Legacy SP1-style roles remain visible as other pitchers instead of being silently converted to rotation days.

The existing player sports-profile overlay is retained, with accessible entry/return; a persistent comparison inspector is not delivered here. Native controller/touch testing, zoom, unfamiliar-player enjoyment, final Steam packaging, complete brand-copy migration and other screen redesigns remain open. The arrival reveal remains proposed, not approved. No production data, deployment or merge was involved.

## Next manual decision

Frisk reviews the roster/profile/lineup loop before extending the same screen-specific work to recruiting and game reporting. UX-06 remains implementing. Backend W03 ownership work is unchanged and must not restart from a stale scheduled heartbeat.
