# W01 batch 05 — direct-session revocation and honest static failures

Completed September 14, 2026 on `codex/pawa-quality-overhaul`. Implementation commit: `0b6dadee60aef1e1a2af90ec4b91f17a8559e163`.

**Result:** A deleted account cannot keep using protected routes through a retained session before visiting `/api/auth/me`. Missing production resources now return real errors instead of a successful HTML fallback. Independent technical/security QA accepted both bounded changes.

## Delivered behavior

- Consolidated three authentication helpers into one live-account check, including the formerly separate storyline helper. The league GET/HEAD boundary checks identity before membership and cached responses. Protected evidence-image requests outside `/api` use the same check.
- Successful validation is reused only within the current request. A missing account causes 401, cookie expiration and SID removal. A transient lookup failure preserves a legitimate SID and returns a generic, uncached 500. Failed deletion of a stale SID also denies the operation and expires the cookie; a later retry revalidates it.
- Public catalog, presence, login and health routes do not acquire a new dependency on authenticated-actor lookup. The regression exercises catalog, presence and liveness during a lookup fault.
- Production static serving preserves actual file bytes/content types and GET/HEAD page navigation. Missing resources, unmatched API/object namespaces and unsupported methods return sanitized 404 responses; malformed paths return 400. Encoded namespace variations cannot reach the SPA fallback.
- Added `test:static-serving` to the release gate. Expanded the existing real-session gate rather than substituting mocked identities.

## Verification

| Check | Observed result |
| --- | --- |
| Independent real-session regression | 114 assertions passed, including separate signed sessions for eight protected route boundaries, deleted guest/flag-only sessions, lookup and SID-deletion failures, recovery and unchanged fixture records. |
| Static HTTP regression | 86 assertions passed for the implementation agent and an independent parent rerun, using synthetic static files and the real public error handler. |
| Actual production startup | Existing 33-assertion entry-point gate passed after integration. Synthetic HTML remains explicit. |
| Private league access | Existing 1,312-assertion gate passed; most assertions inspect DTO fields. It uses test-only authentication, separately from the real-session gate. |
| Unit tests | All 73 passed. |
| TypeScript | Full project plus the changed session harness and new static harness passed. |
| Independent audit | [W01 batch 05 audit](audits/W01_BATCH_05_AUDIT.md), no remaining blocker in this scope. |
| Cleanup | Parent verified no owned session/startup fixture databases remained, stopped the local test cluster and confirmed its port had no listener. Static harnesses removed their own temporary fixtures. |
| Whitespace | `git diff --check` passed. |

The revocation test preserves a league owned by a different live account, with the deleted actor retained only in its co-commissioner ID list. It compares leagues, teams, league events and saved rosters before/after denied requests without disabling foreign keys. This is not a mature-game or recovery fixture. One initial test attempt used a nonexistent `/teams` endpoint; it was corrected to the actual league endpoint before both passing final runs.

## Open dependencies and next work

The complete client/media build remains open: this source checkout lacks the [69 required tracked media files](BUILD_PREREQUISITES.md), approximately 78.66 MiB. CommandCenter instructions prohibit large game-asset downloads without an explicit request, and no suitable complete checkout or device handoff has been established. No media was fetched, no browser milestone is claimed, and no device was dispatched.

W01-AUTH-01 is verified against its direct-request acceptance; all three previously recorded auth/save follow-ups are now verified. The static defect is recorded as W01-WEB-01 in the same tracker. Original TI-12/13 and the full release gate remain open. Request-level revocation does not cancel already executing operations or queued jobs. Nothing was merged or deployed.

**Next continuation:** advance dependency-ready W02/TI-03 strict reported-result validation using the existing policy/schema and adversarial fixtures. Inventory every report/edit/finalization entry point and implement generic correctness checks shared across them. Do not invent Power Pros edition, platform, innings/ties/mercy, required-stat completeness or roster policies; preserve those as unresolved contract inputs. Keep the media/build dependency visible, but do not repeat inventory or passing W01 gates instead of implementing ready work. A suitable build-device handoff must go through the Cross-Device Command Queue with this canonical Git evidence.
