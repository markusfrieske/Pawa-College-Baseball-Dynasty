---
name: Recruit gem/bust OVR band escapes
description: Two ways a gem/bust hitter's retry-calibrated OVR can escape its band post-retry, and their fixes.
---

## Root Cause 1: late_bloomer/overdraft archetype applied to gem/bust hitters

`playerArchetype` is set at line 833 BEFORE `isGem`/`isBust` are known (they come from the gemBust roll later). Only `isGenerationalGem || isGenerationalBust || isBlueChip` are forced to "normal"; regular gems/busts can get "late_bloomer" or "overdraft" from `playerArchetypes[i]`.

The late_bloomer/overdraft branches fired for ALL hitters (including gems/busts), overwriting the retry-calibrated OVR with an archetype-distorted value.

**Fix:** Added `!isGem && !isBust` guards to both the `late_bloomer` and `overdraft` branches in the OVR clamp section (`server/recruit-generator.ts`). Gems/busts are exempt because their OVR band is set by the gem/bust mechanic.

## Root Cause 2: Gold gate recalculation can increase bust/gem hitter OVR

`enforceGoldOvrGate` fires when `ovr < 500`, replacing all gold abilities with blue. The hitter path recalculates `overall = calculateOVR({ ...recruitOvrData, abilities: gated })`. This can INCREASE `overall` if a gold ability had a low `HITTER_NAMED_PTS` value and was replaced by a blue with a higher named pts value — pushing OVR above the bust/gem band ceiling.

**Fix:** After the gold-gate recalculation for hitter gem/bust/blueChip, apply a narrow post-gate re-clamp via `getRecruitOvrBand`. Normal hitters (no isGem/isBust/isBlueChip) remain unclamped. This is not an "independent" band enforcer — it only corrects the gold-gate-induced deviation.

**Why:** The retry loop converges with the original abilities; if gold gate swaps abilities with different named pts contributions, the formula result can fall outside the retry target band. The post-gate clamp restores correctness.

**How to apply:** These two guards are in `server/recruit-generator.ts` in the OVR band clamp section (after `calculateOVR(recruitOvrData)`).
