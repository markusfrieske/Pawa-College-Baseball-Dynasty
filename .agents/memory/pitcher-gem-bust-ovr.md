---
name: Pitcher gem/bust/blueChip OVR convergence
description: Why pitcher gems can't reach 540 without gold, and the full fix pattern including gold cap interaction and bust band clamps.
---

# Pitcher gem/bust/blueChip OVR convergence

## The S-grade = 0 OVR problem
Pitcher common attrs at S-grade score **0 OVR** in `PITCHER_COMMON_RAW`
(`heater S: 0`, `wRISP S: 0`, etc.). This means:
- S-grade commons contribute nothing to OVR (unlike hitters where S=elite)
- Escalating `commonLevel` past A-grade (84) **reduces** OVR by ~90 pts
- Gold special abilities are the primary path to high OVR for pitcher gems

For a 4★ gem pitcher targeting [540, 599]:
- vel=ctrl=stam=99 + A-grade commons + 4 blue abilities = max ~535-538 for narrow-archetype pitchers
- 1 gold ability contributes 40-52 pts → reliably reaches 540+

## Class Gold Cap Interaction
The class gold cap (10/class) was stripping pitcher gem gold, producing OVR=495-535.
No retry (vel/ctrl bumps, pitch rerolls) could recover without gold.

## Fix Pattern (in recruit-generator.ts)

### 1. OVR-aware gold cap filter (~line 1552)
Before removing a gold from a pitcher gem/blueChip, check:
```ts
const testAbilities = abilities.filter(n => n !== goldName);
calculateOVR({ ...recruitOvrData, abilities: testAbilities }) >= gemFloor
```
Only remove the gold if its removal won't push OVR below the band floor.

### 2. Last-resort gold injection (inside floor clamp, ~line 1514)
After vel=ctrl=stam=99 + pitch rerolls still leave OVR < retryLo with 0 gold:
- Force-inject best gold by replacing worst blue
- Gold cap OVR-aware filter then protects this gold

### 3. Validator gold cap (scripts/validate-recruits.ts)
Raised from 10 → 20 per class. Pitcher gems legitimately add 1-2 extra gold per
class when protected; 20 catches genuine bugs without false-positives.

## Bust Band Clamps (post-hoc safety nets)
Regular busts: use full `[bustLo, bustHi]` clamp from `getRecruitOvrBand`
(floor AND ceiling). Floor-only caused Bust 3★ hitter OVR=202 > 199 ceiling.

GenBust clamp extended to hitter genBusts (was pitcher-only previously).

**Why:** Step-size convergence misses band by 1-2 pts in either direction; clamps handle edge cases without forcing extra retry complexity.

## Stamina bands for bust pitchers
- Bust 3★ (target 150–199): stam band [1, 19]. Starter stam (80+) contributes ~82 pts alone.
- Bust 4★ (target 200–299): stam band [1, 34].
- Bust 5★ (target 300–399): stam band [20, 54].

## Gem 2★ pitchers: blue-only abilities
- Target [400–499]; gold gate fires when OVR < 500 → strip gold → OVR drops below 400.
- Assign blue-only from the start for gem pitchers with starRank ≤ 2.

## Gem 3★+ and blueChip: preferGold=true
- Targets OVR ≥ 500 so gold gate won't fire.
- Without preferGold, red abilities can cap OVR ceiling below 500/540.

## Do NOT
- Escalate `commonLevel` past A-grade (89) for pitcher gems — OVR drops ~90 pts
- Assume "more retries" can close a gold-sized OVR gap (~40-52 pts) without gold
- Set class gold cap below 20 in the validator — pitcher gem protection is legitimate
