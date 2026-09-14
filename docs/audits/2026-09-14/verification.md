# Verification and evidence ledger

Audit date: 2026-09-14. Source main: `8a1e113070c1e809da83cc66fc7eb84ffb9bec21`. Platform: Windows CommandCenter, Node v24.19.0. The source was fetched fresh into an isolated sparse checkout, pulled up to date, and placed on `codex/pawa-full-audit-20260914` before audit artifacts were written.

## Executed checks

| Check | Result | Interpretation |
| --- | --- | --- |
| Fresh locked install | Two attempts failed; lock contains 116 `package-firewall.replit.local` tarball URLs | Reproducible portability problem. npm's internal error mechanism itself was not diagnosed. |
| Controlled install workaround | Replaced only that URL prefix with official registry temporarily; 724 packages installed in 10 seconds | Same package versions and integrity hashes. Original lockfile restored byte-for-byte. Install used `--ignore-scripts`; native/runtime integrations were not certified. |
| `node node_modules/typescript/bin/tsc --noEmit` after complete install | PASS, exit 0 | Previous missing-module errors came from incomplete installation and are not reported as code defects. |
| Playwright pure suite using `playwright.unit.config.ts` | 68 passed | Existing helper/data behavior, not browser or HTTP coverage. |
| `scripts/validate-all.ts` through tsx | All 17 validators passed | Included Power Pros header mapping (134 assertions). Some intentional/nonfatal roster warnings remain. Random generation checks are a single executed campaign, not multi-season balance proof. |
| `scripts/verify-pitcher-rest.ts --unit-only` | 28/28 passed | Correct helper behavior for recognized day labels. Does not cover actual Full Season scheduler's `weekend` integration. |
| Production build | BLOCKED by intentionally omitted `attached_assets/Recruiting_Desktop_1783727759422.png` | Build roster/recruit checks passed, Vite reached asset loading. This is a sparse-audit limitation, not a missing file in Git. Complete production bundle was not verified. See [build log](evidence/build-attempt.log). |
| Adversarial box validator | Actual validator returned `[]` for invalid counters/missing IDs/zero-out payload | See [script](evidence/validate-box-score-repro.mjs) and [output](evidence/validate-box-score-repro-output.json). No HTTP or DB involved. |
| Seeded simulation and schedule probes | Accounting failures; calendar/rest contract mismatch | See [script](evidence/systems-baseball-probes.cjs), [output](evidence/systems-baseball-probes.json) and systems report. Parent independently reran both probe scripts successfully. |
| Middleware and endpoint trace | Outsider/PBP findings confirmed by independent code inspection | See [route-order evidence](evidence/authorization-route-order.md). No production exploit attempted. |
| Report UI/API cross-check | Confirmed tie-correction and OCR identity-mapping paths; narrowed missing-ID claim | Ordinary unmatched OCR IDs are rejected; crafted absent IDs are skipped. Fractional DB persistence is not claimed. |
| Historical screenshot | Inspected `screenshots/homepage_full.jpg` | Historical landing-page composition only, not current authenticated UI or mobile evidence. |

The restricted shell initially prevented tsx's Windows user lookup (`uv_os_get_passwd ENOMEM`). Re-running the pure validators in the permitted unrestricted runtime succeeded. That environment error is not evidence of an application memory defect.

## Probe scope and limitations

The engine probe executes extracted actual pure source with Node's TypeScript stripping, synthetic players and a documented LCG replacing `Math.random`. It records source hashes. There are no storage imports, network calls or league mutations. The observed mismatch frequencies demonstrate accounting defects in that fixture; they do not estimate how frequently users encounter an incident.

The batting-order reversal probe uses equal-rated hitters, so its identical score alone does not prove general lineup irrelevance. The substantive evidence is the inspected scoring branch averaging the entire non-pitcher roster and not consuming batting order. Follow-on implementation tests must use unequal active/bench players and varied lineups.

The rest probe's expected scoring starter is inferred from the inspected selection branch; the box starter is directly observed. The 27-outs check follows the existing generator's fixed-nine-full-innings structure. A corrected simulator must also correctly handle games with fewer defensive outs and extra innings.

The schedule probe uses the actual 149-team catalog and seed 0. It generated 4,172 games and zero existing-validator errors while finding 2,086 repeated team/week/gameType groups, including four-game midweek groups. This exposes a calendar contract failure; it is not a claim that every multiple-game day is illegal under every supported league rule.

## Not executed or not established

- No live application, production database, actual coach accounts or private storage were accessed. No production mutations or messages were sent.
- No disposable PostgreSQL service/tooling was available in the checked environment. API integration, concurrency, fault injection, migrations, mature-state restore, full 14-human rehearsal and end-to-end season tests remain required. Source-traced race/recovery scenarios are not represented as observed live incidents.
- No complete frontend build or authenticated browser/phone playtest. Large media folders were excluded in accordance with the CommandCenter role. Responsive/accessibility findings identify concrete code patterns; visual risks still need runtime measurement.
- No OCR service execution, model-cost/latency measurement or edition-specific screenshot accuracy benchmark. Header-mapping tests cannot establish OCR quality.
- No load test, long-season performance profile, current deployment-health inspection, full dependency vulnerability assessment, real roster factual audit, or rights/asset-provenance certification.
- No 10–20-season economic balance campaign or unfamiliar-player retention study. Proposed strategies, parity rules and timing targets remain hypotheses until measured.

## Evidence hygiene

Only audit documents, sanitized build evidence and small reproducible probes belong in the audit change. Application source and lockfile remain unchanged. Device paths in captured build output are replaced with `<audit-checkout>`; no credentials, private browser state or local device-path mappings are included.

The audit is thorough across product and source architecture, but it is not release certification. A production decision requires the exact release revision to pass the missing deployment, database, browser and player gates in the [implementation plan](implementation-plan.md).
