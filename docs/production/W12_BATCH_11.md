# W12 batch 11 — Recruiting disclosure and Clubhouse Arrival

Frisk manually authorized fixing the disclosure leak, then implementing the approved cinematic arrival. Scheduling remains paused. Branch: codex/pawa-quality-overhaul.

## Delivered

One server disclosure projection now protects ordinary-coach recruiting list/detail/manual-sign and storyline recruit responses. It withholds unearned core values, exact overall/true stars/potential, undisclosed special/story abilities and tools; common attributes follow scouting order; pitch type is separated from strength below50%. Arrival holdbacks cover every current pitch alias and legacy SPL remains full-reveal-only. Public starRank drives recommendations and public class summaries/ranks, so changing hidden ratings does not change those responses. Storyline events also omit internal archetypes, templates, probability weights/outcomes and hidden variables. Commissioner/co-commissioner detail access explicitly retains full values for their authorized editor; normal board disclosure remains intact.

Policy: the existing blue-chip full-disclosure exception remains. A generational gem loses holdbacks only once its gem status is public; previously its empty lock list gave away hidden status. Eligible own-team arrivals open on Signing Day or walkons; commissioners can open other teams. Early completion and opponent completion are rejected. Previously opened classes replay outside that phase. Completion and interest-range/ability unlocks are one transaction; replay has no mutation. Finalization publishes active roster players regardless of whether a coach watches the ceremony. Converted recruits are marked public after successful player creation; class snapshots, coach history and dependent national ranking publication now follow roster conversion, preventing earlier snapshot publication on a conversion failure. This is the public roster boundary, not a permanent secret attached to an animation.

Arrival replaces rarity packs, flips and fireworks with the approved flat Varsity Club gallery, miniature campus/diamond art, nameplate slide and complete front card. Coach chooses a player; the1.5-second cut supports immediate skip, Escape, replay and reduced motion. Persistent portrait identity/team color is preserved. No invented jersey or recruit-ID career-stat request. Missing college statistics remain unrecorded. Save failures have retry and refreshed server confirmation. Full-card and filtered class PNG exports show a review preview before download. Export layout received a separate visual correction for clipped labels.

## Evidence

- TypeScript and production build pass.
- verify-recruit-disclosure.ts: **331 real HTTP/PostgreSQL/built-browser checks** against a fresh owned disposable database.0/25/49/50/99/100% scouting, HSL/CCH/legacy SPL, special counts, public rank and hidden aggregate invariance, real manual sign, storyline list/detail/events with non-null internal event metadata, commissioner/co-commissioner editor access, phase/ownership/idempotence, injected database rollback, replay, full disclosure, and a real Signing Day advance.
- Browser gate covers failed completion/retry, reduced motion, Skip/Escape/replay without POST, no invalid statistics query, five PC sizes1280×720 through3440×1440, real PNG download, class export and no page errors. Five synthetic approved portraits were inspected in the gallery and PNG.
- Existing verify-management-workspaces.ts: **209 checks passed** for recruiting/report workflows in simulated and reported modes.
- Independent game-dev source audit and fixes: [audit](audits/W12_BATCH_11_AUDIT.md). Source review, runtime verification and Frisk's enjoyment are separate evidence.

Synthetic small rosters intentionally trigger expected25-player structure warnings during finalization. This does not verify CPU class balance or complete season-recovery safety. Broader W03 advance recovery remains open. No real saves, production data, deployment or main merge.

## Remaining scope

This is a playable arrival slice, not W12 or release completion. Clubhouse audio, a durable historical scrapbook with stable season/player-event identity, large-class curation, controller support and human enjoyment remain future gates. PNGs are local keepsakes, not a database archive or automatic social publishing. Existing saved classes without durable season identity are not relabeled as a permanent multi-year archive. Next: Frisk review of the live arrival, then durable arrival history/roster linkage and audio polish; continue the separately tracked integrity plan manually.
