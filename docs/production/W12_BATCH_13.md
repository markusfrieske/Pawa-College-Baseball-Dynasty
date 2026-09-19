# W12 batch 13 — Clubhouse sound and keepsake polish

Frisk authorized all three proposed items: audio, sharing polish, and game-dev audit. Manual development; automation remains paused.

## Implemented

Original procedural welcome motif, soft nameplate tap and short filtered room ambience. Playback is deliberate, bounded to1.5seconds, and uses existing game mute/volume and effects preferences. No audio starts on page load. Arrival exposes game mute/volume and explicit sound preview. Reduced-motion ceremonies show the card quietly; explicit sound preview still works. Mute, skip, close, route/context change, hidden document and unmount stop playback. Pending resume expires; denied audio does not block the card. These are synthesized sounds, not recorded clubhouse ambience or licensed music.

Flat branded player and class PNGs include the approved gateway/wordmark, original team/season identity and provenance. Large classes use12-player sheets with range, sheet number, filter/matching counts and distinct sheet filenames. Export is one labeled sheet at a time; all class members remain reachable. Page/filter identity participates in async export cancellation. Original per-record portraits/colors remain intact. Export-only padding fixes clipped names/grade chips and SVG rasterization preserves the gateway in downloaded PNGs.

## Evidence

- TypeScript and production build pass.
- verify-arrival-scrapbook.ts:387 checks. Includes inherited real PostgreSQL/HTTP/disclosure/history tests, actual built-browser PNG downloads, five PC sizes, keyboard sheet activation/focus return,150% scaling, initial/dynamic reduced motion, native AudioContext instrumentation, no autoplay, mute/volume persistence, denied audio and expired delayed resume.
-0/1/12/13/25-player presentation fixtures use explicitly intercepted archive responses; this does not certify25-player recruiting balance. Runtime tests use disposable synthetic data.
- Downloaded individual PNG and second class sheet visually inspected; rendering defects corrected. No claim of human listening/enjoyment approval.
- Independent creative/audio and player-experience source reviews: [audit](audits/W12_BATCH_13_AUDIT.md). Source review is separate from parent runtime verification.

W12/UX-06 remains implementing. Next: Frisk listening and keepsake review, then interrupted-season recovery (W03). No production data, main merge, deployment or automated publishing.
