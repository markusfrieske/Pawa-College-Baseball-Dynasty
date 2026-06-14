---
name: Pitcher common attr PP mapping
description: Confirmed Power Pros grade → pitcher common attribute mapping and derivation formulas used in the roster migration.
---

## Confirmed PP → attribute mapping

| PP Japanese name | Meaning | Our attr |
|---|---|---|
| 対ピンチ | vs Pinch / RISP | wRISP |
| 対左打者 | vs Left-Handed Batters | vsLefty |
| 打たれ強さ | Durability / Hard to Hit | poise |
| ケガしにくさ | Injury Resistance | grit |
| ノビ | Hop / Rise | heater |
| クイック | Quick Delivery | agile |
| 回復 | Recovery | recovery |

## Derivation formulas (verified against Glauber + Volantis PP cards)

```
heater   = min(85, gradeVal(vel * 0.6 + stuff * 0.4))
wRISP    = min(85, gradeVal(clutch))
vsLefty  = min(85, gradeVal(vsLHP))
poise    = min(85, gradeVal(stuff))
recovery = min(85, gradeVal((stamina + stuff) / 2))
grit     = keep existing (ケガしにくさ doesn't correlate with pitching attrs)
agile    = keep existing (クイック doesn't correlate with pitching attrs)
```

## Grade → value table

| PP grade | Value |
|---|---|
| S (≥90) | 92 — but cap at 85 (A) unless pitcher has the linked gold ability |
| A (80–89) | 85 |
| B (70–79) | 75 |
| C (60–69) | 65 |
| D (50–59) | 55 |
| E (40–49) | 45 |
| F (30–39) | 35 |
| G (<30) | 20 |

**Why cap at 85:** S grade without the linked gold ability gives 0 pts in PITCHER_COMMON_RAW — worse than A (85 pts). Only set S (92) if pitcher actually has the relevant gold (e.g. "Big Boy Speed" for heater S, "Sangfroid" for wRISP S).

## Impact

- 1413 pitchers updated across 19 roster files via `scripts/migrate-pitcher-common-attrs.ts`
- DB migration key: `pitcher-common-attrs-v8` in `server/index.ts`
- MEAN_MAX bumped 302 → 307 (roster mean rose from 300.5 → 305.2)
- 4★+ share: 14.0% → 17.2% (elite pitchers correctly moved up tiers)
