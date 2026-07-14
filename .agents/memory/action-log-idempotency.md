---
name: Action-log idempotency pattern
description: How recruiting action handlers prevent race conditions (duplicate logs + double-spent points) in multiplayer leagues via a unified service.
---

## Rule
All recruiting actions (phone, email, visit, head_coach_visit, offer) MUST go through `executeRecruitingAction()` in `server/services/recruitingActionService.ts`. This is the ONLY correct way to execute a recruiting action — direct calls to `createRecruitingAction`, `updateRecruitingInterest`, or `atomicSpendRecruitPoints` from a route or simulation loop bypass the ordering contract.

## Correct execution order (enforced by the service)
1. Compute the interest gain first (no DB writes yet).
2. Insert the action log row (ON CONFLICT DO NOTHING — idempotency gate).
3. If insert returns null (conflict) → return early, 0 side-effects.
4. **Atomic spend BEFORE interest** — `atomicSpendRecruitPoints(coachId, cost, max)` runs first.
   If spend fails (concurrent race exhausted budget) → return `spendFailed: true`, no interest written.
5. Only after successful spend: update recruiting interest (create/increment).
6. Update top-school accumulated interest.

## DB enforcement
Two partial unique indexes on `recruiting_actions_log`:
- `uq_action_log_weekly` — `(recruit_id, team_id, season, week, action_type)` WHERE action_type IN ('email', 'phone')
- `uq_action_log_seasonal` — `(recruit_id, team_id, season, action_type)` WHERE action_type IN ('visit', 'head_coach_visit', 'offer')

Both created via startup migration keys `action-log-weekly-unique-v1` and `action-log-seasonal-unique-v1`.

## Atomic point deduction
`storage.atomicSpendRecruitPoints(coachId, cost, max)` runs:
```sql
UPDATE coaches SET recruit_actions_used = recruit_actions_used + $cost
WHERE id = $coachId AND recruit_actions_used + $cost <= $max
```
Returns `true` if a row was updated, `false` if the coach is out of points.

## CPU vs human parity
- Human routes: pass `coachId = userCoach.id`; service performs atomicSpend per action.
- CPU routes: pass `coachId = null`; service skips atomicSpend (CPU enforces budget via local `remaining` variable before calling the service). Interest update and top-school update ordering is still guaranteed.

**Why:** The key ordering bug was: old code updated interest/top-schools BEFORE atomicSpend. If spend failed concurrently, interest was already mutated (partial state). The service guarantees spend-first ordering atomically.

**How to apply:** Any new recruiting action type must be routed through `executeRecruitingAction` and added to the appropriate partial unique index (weekly-cap or seasonal-cap).
