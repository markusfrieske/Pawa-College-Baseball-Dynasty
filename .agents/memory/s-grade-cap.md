---
name: S-grade cap quirk in scalePlayer
description: raw common attr > 90 bypasses the 89 ceiling, allowing 99 (S-grade) after scaling
---

## Rule
In `server/realRosters.ts`, `scalePlayer` uses:
```
const sGradeCap = (val <= 90 || effectiveFactor < 1) ? 89 : 99;
```
Any raw common attribute **> 90** (i.e., ≥ 91) with a team scale factor ≥ 1.0 gets
a cap of 99 instead of 89 — meaning it can scale to S-grade regardless of OVR.

**Why:** The intent is to allow truly elite raw values to scale to S-grade, but
the validator `validate-s-grade-common-abilities` enforces that S-grade common
attributes are only valid on players with OVR ≥ 550 (or generational gems).

**How to apply:** When editing real roster files, keep any common attribute raw
value at ≤ 90 for players with OVR < 550. Setting raw val = 90 still scales to 89
(A+ grade), which is fine. Only intentional elite players (generational gems,
OVR ≥ 550) should have raw common attrs > 90.
