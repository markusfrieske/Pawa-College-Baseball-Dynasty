---
name: Recruiting V2 completion
description: What is canonical (shared/recruitingBalance.ts) in the V2 recruiting economy and where CPU/human parity is enforced.
---

## What V2 means

All recruiting caps come from `shared/recruitingBalance.ts`. No cap may be hard-coded in a route
or React component. Human coaches, CPU coaches, auto-pilot teams, and deadline-filled teams all
use the same budget formulas.

## Key facts

- **Pool size formula**: `Math.max(30, Math.ceil(numTeams * 7.25))` — 14 teams → 102, 149 → 1,081.
  Full Season uses `computeFullSeasonRecruitPoolSize` (demand-driven).
- **Contact/scout turn caps**: `getTurnContactCap` / `getTurnScoutCap` from `shared/recruitingBalance`.
  CPU recruiter (`runCpuRecruiting` in simulation.ts) calls these DIRECTLY — no intermediate helper.
- **Action costs**: V2_ACTION_COSTS in recruitingBalance.ts (email=1, phone=2, offer=2, visit=4, hcv=5).
- **Economy object**: `computeRecruitingEconomyWithLedger` in `server/services/recruitingEconomyService.ts`
  returns the full economy (targets, commits, contactPoints, scoutPoints, visits, nil) consumed by the
  recruiting-state endpoint and React via the `economy` field.
- **Ledger**: `team_recruiting_ledgers` table tracks contactSpent/Cap, scoutSpent/Cap per turn.
  Auto-pilot and deadline-fill teams write their CPU actions to the ledger before returning control.
- **UI labels**: "Contact Pts" and "Scout Pts" in command-center.tsx, mobile-board.tsx, recruiting.tsx.

## Dead code removed

Module-level `ARCHETYPE_RECRUITING_ACTION_BONUS` (old dict) and `getMaxRecruitingActions(coach, seasonLength?)`
(V1 formula) were removed from simulation.ts. They were superseded when CPU recruiting began calling
`getTurnContactCap` directly.

**Why:** The V1 per-turn cap was `base=15 + skill + archetype_bonus` with a season-length scale. The V2
cap uses seasonal budget (contactSeasonBase + archetype + skill) divided across total turns, which gives
a different (and correct) per-turn number. Both functions existing caused confusion.
