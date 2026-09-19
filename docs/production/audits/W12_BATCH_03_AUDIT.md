# W12 batch 03 independent game-dev audit

September 18, 2026. Read-only recruiting/player-experience and reporting/integrity agents reviewed the implementation and tests. Parent alone edited and executed runtime checks. Source review, runtime evidence and human enjoyment are distinct.

| Finding | Severity and reproduction | Acceptance / disposition |
| --- | --- | --- |
| Stale knowledge | P1: keep dossier open or select comparison, then scout; old objects retain old information. | Derive displayed records from current query. Fixed; both modes verify refreshed percentages in dossier and comparison. |
| Divergent action eligibility | P2: mobile or already-open pitch chooser enables action after budget/weekly limit changes. | Shared rows and current send/offer/dossier guards. Source verified; server remains authoritative. |
| Lost notes | P2: reject notes write; dialog closes before response. | Await success, retain failed draft, retry and block pending close/edit. Real retry and SQL persistence pass. |
| Compare clipping | P2: select three names at narrow width. | Wrapped inline tray, one-column narrow cards, bounded vertical dialog. Width, third-card and footer-close checks pass. |
| Keyboard page/section reach | P2: new page or section leaves focus far from content. | Focus and scroll after render; source verified. Score navigation targets inning control once line scoring is active. |
| False OCR success | P1: all images failed but old settled flag says all read. | Distinguish done/failed/pending; failed fixture shows alert without success banner. Pass. |
| Pending report edits | P1: change phase/input while request is pending and confuse receipt with new draft. | Disabled editor plus Back/context controls; held 503 request followed by real successful retry. Pass. |
| Unprotected manual edits | P2: remove a row with no OCR/score metadata or type/change innings, then navigate away. | Dirty state in row/identity/inning mutations and input capture; cancel navigation preserves draft. Pass. Durable recovery remains UX-02. |
| Missing SP/RP | P2: initialize pitching when players have SP/RP positions. | Shared pitcher predicate; both sides initialize two pitchers. Pass. |
| Approval failure discarded | P2: Schedule confirm/dispute write fails after dialog already closes; failed report fetch becomes null. | W12-SCHEDULE-01 remains planned: await successful mutation, retain draft/error, distinguish absent report from fetch error, test 503 retry and no false success. Outside this batch. |

The final source reviews confirmed the fixes and identified two late closure items: bound the stacked comparison dialog and focus the inning control when direct scores are absent. Both were applied before the passing gate. Runtime evidence is **77 parent-executed checks**, TypeScript, production build and desktop visual inspection; independent agents did not claim separate runtime execution. No unfamiliar-player playtest, real OCR, native touch or controller certification occurred.
