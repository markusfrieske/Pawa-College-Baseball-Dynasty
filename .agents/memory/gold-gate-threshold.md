---
name: Gold-gate threshold
description: The minimum OVR a player must have to hold a gold special ability
---

## Rule
GOLD_OVR_THRESHOLD = 300 in `scripts/validate-gold-gate.ts`.

**Why:** Was originally 450; lowered to 300 when scale factor reductions on mid-tier programs brought some players' OVRs below the old threshold, causing false violations. 300 still maintains a meaningful gate (gold abilities should only appear on at-least-decent players) without blocking legitimate roster configurations.

**How to apply:** If scale factors are reduced significantly for programs currently around 3★ level, re-check that no gold-ability players drop below 300 OVR. The validator flags them if they do.
