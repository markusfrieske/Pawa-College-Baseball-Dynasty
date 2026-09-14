# Complete-media build prerequisite

September 14, 2026 inventory for the next W01 build/browser milestone. This is a read-only source and GitHub tree-metadata inventory, not a completed download or build. The source-only CommandCenter checkout lacks required tracked media. Use a suitable build device and preserve single-writer ownership; any device handoff must use the Cross-Device Command Queue and link this document and the exact starting commit.

## Required tracked inputs

| Set | Files | Bytes | Purpose |
| --- | ---: | ---: | --- |
| Direct `@assets` imports | 22 | 42,618,208 | Compile-time assets: 21 imports in `client/src/lib/art-assets.ts` and `gold_speech_bubble.png` in `client/src/components/dynasty-logo.tsx`. |
| Entire `client/public` | 47 | 39,857,881 | Runtime fonts, hub/story imagery, music, landing screenshots, icons and other static files. |
| Combined practical restore | 69 | 82,476,089 | Approximately 78.66 MiB before transfer/compression differences. |

The inventory found 1,045 files totaling 424,254,599 bytes under the entire `attached_assets` directory. Restoring all of it is unnecessary. Two existing images under `client/src/assets/images` were already present. Recompute the direct-import list at the selected build commit if source imports change.

Select the 22 exact `attached_assets` paths from the import statements and include `client/public`. A selective Git restore can use `git restore --source=HEAD --worktree --ignore-skip-worktree-bits -- <explicit tracked paths>` after verifying no user changes occupy those paths. Keep sparse-checkout configuration consistent if it must survive later pulls; never broaden it to bulk media as a convenience. No assets were downloaded during batch 04.

## Acceptance for the next continuation

1. Verify the exact branch/commit and active writer. Obtain the missing media on a suitable device without overwriting local work.
2. Run the complete production build with the documented locked runtime. Record build errors, warnings, bundle sizes and exact SHA; a server-only bundle with synthetic HTML does not satisfy this gate.
3. Start the built app against an owned disposable database. Exercise landing, register/login/guest, refresh and a coach workflow in a real browser; inspect console/network failures and narrow-screen behavior.
4. Verify actual static media content types and nonempty bytes. A 200 response can be the SPA's HTML fallback for a missing image, audio or font file.
5. Obtain independent technical and player-experience review, repair blocking findings, and update the existing tracker with evidence. Continue to the remaining release checks; one successful build does not certify TI-11/12 or gameplay quality.

One existing source mismatch to inspect in this browser milestone: `notification-center.tsx` requests `/favicon.ico`, while the tracked public favicon is `/favicon.png`. This is an inventory observation, not a verified browser failure or a separate backlog.
