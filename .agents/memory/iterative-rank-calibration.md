---
name: Iterative rank calibration
description: How recalibrate-rosters.ts achieves maxGap ≤ 8 for all 149 teams — binary search with H-P override simulation is mandatory.
---

## The rule

`findScaleFactor()` must pass `pitcherMult` and `hitterMult` matching the H-P balance
overrides for that team into `computeActualAvgOVR()`. If the binary search calibrates
WITHOUT the overrides, the overrides shift actual avg OVR after the fact, causing large
rank gaps (e.g., Louisiana: +21, Virginia Tech: +15 before the fix).

**Why:** The OVR formula has a nonlinear response due to the 89-attr cap. Linear
`targetNominalOVR / rawAvgOVR` formulas systematically understate scale factors for
high-attribute teams, causing them to compute 15–24% above their expected rank.
Additionally, H-P overrides (pitcherMult > 1, hitterMult < 1) typically NET negative
on avg OVR because ~15 hitters × reduced attrs > ~10 pitchers × boosted attrs, and
pitcher boosts are partially absorbed by the 89 cap. Including overrides in the binary
search compensates for both effects.

**How to apply:** In `recalibrate-rosters.ts`:
1. Define `HP_PITCHER_OVERRIDES` and `HP_HITTER_OVERRIDES` maps (6 H-P balance teams:
   Louisiana, Clemson, Virginia Tech, Southern Miss, Georgia, Georgia Tech).
2. `computeActualAvgOVR(players, scale, pitcherMult, hitterMult)` applies `pitcherMult`
   to pitcher-only attrs and `hitterMult` to hitter-only attrs during simulation.
3. `findScaleFactor(players, target, pitcherMult, hitterMult)` binary-searches (60
   iterations) passing the overrides through — finds base scale s.t. actual OVR =
   target AFTER overrides.
4. In the calibration loop: look up team overrides before calling `findScaleFactor`.

Result: maxGap = 8 (Tennessee, whose raw attrs hit the 89-cap more than neighbors),
all 149 teams within ±8 of NATIONAL_RANK.

**Verification command:** `npx tsx scripts/check-rank-gaps.ts`
(check-rank-gaps.ts is a temp script; can be recreated from recalibrate-rosters.ts
logic — compute actual avg OVR post-scale per team, rank them, diff vs NR).
