---
name: Scale factor OVR inflation in real rosters
description: team-level scale factors multiply ALL players; large boosts can push individuals above the 545 hard ceiling
---

## Rule
`server/rosterScaleFactors.ts` applies per-team multipliers to every player's
attributes. A high-prestige team (e.g., UCLA ≈ 1.24×, Georgia ≈ 1.10×) will
inflate every player on that roster. If any individual player already has
moderately-high raw attrs, they can exceed the 545 OVR hard ceiling after scaling.

**Why:** The `validate-ovr-dist` and related validators enforce that no player
exceeds 545 OVR (except generational gems at 600–650). The OVR formula is
non-linear so even modest raw reductions can push scaled OVR well below the ceiling.

**How to apply:** After changing a team's scale factor, or when adding high-attr
players to a high-SF team, check the top-N players by running `validate-all`.
For any player above 545 OVR, reduce their raw core attrs proportionally
(roughly target_ovr / current_ovr ratio, applied to each attr). A 2–3 point
reduction on multiple attrs is usually sufficient to drop 10–15 OVR points.
Be mindful of the S-grade cap quirk — also check that no raw common attr > 90.
