---
name: Scale factor calibration approach
description: How to align ROSTER_SCALE_FACTORS with NATIONAL_RANKS efficiently
---

## Rule
Iterative ratio passes: for each divergent team, compute `newSF = curSF × (targetAvg / curAvg)` where targetAvg = the OVR avg that the team at natRank position currently has.

**Why:** OVR isn't perfectly linear with scale factor (attribute clamping at [20,99]), so a single pass overshoots/undershoots by ~30-50% of the gap. Three or four passes converge to within ±7 natRank for all 149 teams.

**How to apply:**
1. Run the calc script (inline tsx -e) to compute curAvg and ovrAtRank[natRank-1].
2. Apply sed changes to `server/rosterScaleFactors.ts`.
3. Re-check alignment; repeat for any remaining |Δ| ≥ 8 teams.
4. HITTER_SCALE_OVERRIDES and PITCHER_SCALE_OVERRIDES modify on top of the base; the base ROSTER_SCALE_FACTOR affects everyone proportionally so no special handling needed.
5. Run validate-all after to confirm gold-gate, ovr-bands, ovr-dist, pitch-ovr-cap still pass.

**Target:** Every team within ±7 of natRank; most top-30 within ±5.
