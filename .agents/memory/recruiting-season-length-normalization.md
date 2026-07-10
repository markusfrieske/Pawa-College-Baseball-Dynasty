---
name: Recruiting balance across season lengths
description: How verbalWeek, action budgets, and passive buzz must scale with seasonLength to keep recruiting balanced in short/standard/medium/long leagues.
---

## The Rule

`verbalWeek` must be computed as `seasonMaxWeeks + verbalOffset`, NOT a fixed number. The offset is relative to the end of the regular season so all recruits commit during the 4-week offseason recruiting window regardless of season length.

**Offsets (from season end):**
- 3★: +1 (commit possible in offseason week 1)
- 4★: +2 (commit possible in offseason week 2)
- 5★: +3 (commit possible in offseason week 3)
- BC: +4 (commit possible in offseason week 4 — last week before signing day)

**seasonMaxWeeks:** short/standard=5, medium=10, long=15

**Why:** The old fixed values (6, 8, 10, 11) caused catastrophic imbalance:
- medium/long seasons: verbalWeek=6 fired at regular season week 6, meaning 3★ recruits committed mid-gameplay with 8+ weeks still remaining
- short seasons: 5★ verbalWeek=10 and BC verbalWeek=11 fell AFTER the 4-week offseason recruiting window, so those recruits could NEVER commit

## How to Apply

In `server/routes/league-mgmt.ts` → `updateRecruitStages`:
```ts
const seasonLength = league?.seasonLength || "standard";
const seasonMaxWeeks = seasonLength === "long" ? 15 : seasonLength === "medium" ? 10 : 5;
const verbalOffset = isBlueChip ? 4 : starRating >= 5 ? 3 : starRating >= 4 ? 2 : 1;
const verbalWeek = seasonMaxWeeks + verbalOffset + storylineWeekBonus;
```

The `top3` and `top5` gate weeks (`verbalWeek - 4` and `verbalWeek - 6`) scale automatically since they reference `verbalWeek`.

## Weekly Action Budget Scaling

`getMaxRecruitingActions` accepts an optional `seasonLength` parameter and applies a scale factor:
- short/standard: 1.0 → 15 pts/wk (9 total weeks = 135 pts)
- medium: 0.87 → ~13 pts/wk (14 total weeks = 182 pts)
- long: 0.73 → ~11 pts/wk (19 total weeks = 209 pts)

All call sites in `recruiting.ts` and `simulation.ts` pass `league?.seasonLength`.

## Passive Buzz Scaling

`maxBuzzGain` is capped at 1%/week for medium/long seasons (vs 1-2% for short/standard). Without this, elite programs gain compounding buzz over 15 in-season weeks, creating a >30% interest advantage from passive brand alone.
