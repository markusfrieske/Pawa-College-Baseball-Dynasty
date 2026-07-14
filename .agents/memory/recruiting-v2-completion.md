---
name: Recruiting V2 completion
description: Canonical V2 recruiting economy: shared/recruitingBalance.ts as source of truth, unified action service, CPU/human parity.
---

## What V2 means

All recruiting caps come from `shared/recruitingBalance.ts`. No cap may be hard-coded in a route
or React component. Human coaches, CPU coaches, auto-pilot teams, and deadline-filled teams all
use the same budget formulas AND the same action execution service.

## Key facts

- **Pool size formula**: `Math.max(30, Math.ceil(numTeams * 7.25))` — 14 teams → 102, 149 → 1,081.
  Full Season uses `computeFullSeasonRecruitPoolSize` (demand-driven).
- **Contact/scout turn caps**: `getTurnContactCap` / `getTurnScoutCap` from `shared/recruitingBalance`.
  CPU recruiter (`runCpuRecruiting` in simulation.ts) calls these DIRECTLY — no intermediate helper.
- **Action costs**: proximity-based via `getActionPointCost` from `@shared/stateDistance` for actual
  spending (same state/region discounts for visits/HCV). `V2_ACTION_COSTS` in recruitingBalance.ts
  lists the maximum/canonical cost per action type.
- **Unified action service**: `server/services/recruitingActionService.ts` — `executeRecruitingAction()`
  is the single execution path for ALL recruiting actions (human routes + CPU simulation).
  Enforces: idempotency log → atomic spend → interest update → top-schools. See action-log-idempotency.md.
- **Economy object**: `computeRecruitingEconomyWithLedger` in `server/services/recruitingEconomyService.ts`
  returns the full economy (targets, commits, contactPoints, scoutPoints, visits, nil) consumed by the
  recruiting-state endpoint and React via the `economy` field. Reads team.nilSpent/nilRecruitingAlloc/nilRecruitingSpent.
- **Ledger**: `team_recruiting_ledgers` table tracks contactSpent/Cap, scoutSpent/Cap per turn.
  Auto-pilot and deadline-fill teams write their CPU actions to the ledger before returning control.

## Dead code removed

Module-level `ARCHETYPE_RECRUITING_ACTION_BONUS` (old dict) and `getMaxRecruitingActions(coach, seasonLength?)`
(V1 formula) were removed from simulation.ts. CPU recruiting calls `getTurnContactCap` directly.
CPU `pendingTopSchoolGains` batch block removed — `executeRecruitingAction` now updates top-schools per-action.

**Why:** V1 per-turn cap was `base=15 + skill + archetype_bonus` with season-length scale. V2 uses
seasonal budget divided across turns. Both helpers existing caused confusion about which was authoritative.
