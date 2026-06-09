---
name: Pitcher gem/bust/blueChip OVR convergence
description: How to ensure generateRecruit pitcher special cases always produce calculateOVR() == stored OVR within band, with no post-hoc clamps.
---

# Pitcher gem/bust/blueChip OVR convergence

## The rules

**Bust pitcher stamina must be capped by star rank:**
- Bust 3★ (target 150–199): stam band [1, 29]. Starter stam (80+) contributes ~82 pts; G-grade common only subtracts ~97 pts; vel=1+ctrl=1 (~2 pts) can't offset it.
- Bust 4★ (target 200–299): stam band [1, 49].
- Bust 5★ (target 300–399): stam band [30, 79].

**Gem 2★ pitchers must use blue-only abilities (no gold):**
- Gem 2★ targets [400–499]. The gold gate fires when OVR < 500 and strips gold → blue.
- If gold abilities were assigned first and then stripped, OVR drops below 400. Use blue-only from the start for gem pitchers with starRank ≤ 2.

**Gem 3★+ and blueChip pitchers must use preferGold=true:**
- These target OVR ≥ 500 so the gold gate won't fire.
- Without preferGold, red abilities can cap the OVR ceiling below 500/540 making convergence impossible.

**Ability injection fallback (after pitch rerolls, gem/blueChip only):**
- Add blue abilities one at a time (up to 7-ability cap) if OVR still below retryLo.
- Each blue ability contributes ~6.96 pts.

**Ability upgrade fallback (after injection, gem/blueChip only):**
- If OVR still below retryLo after injection (ability list full), swap a blue ability for a gold one.
- Only accept swaps that land within [retryLo, retryHi]; use "closer to bandMid" accept for partial progress.
- Gold gate won't fire for gem 3★+ or blueChip since target ≥ 500.

## Why

Post-hoc clamps (Math.max(lo, Math.min(hi, ovr))) were masking all these issues.
Removing clamps exposed that stam/ability constraints must be correct UP FRONT so
the vel/ctrl/commonLevel retry loop can actually converge.

## How to apply

Any future change to PITCHER_COMMON_RAW pts, ability tier pts, or stam formula
should re-run `npx tsx scripts/validate-recruits.ts` (exit 0 required) across
multiple seeds. The retry loop is in `server/recruit-generator.ts` ~L1295–1465.
