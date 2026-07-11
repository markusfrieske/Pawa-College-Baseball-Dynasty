---
name: Action-log idempotency pattern
description: How recruiting action handlers prevent race conditions (duplicate logs + double-spent points) in multiplayer leagues.
---

## Rule
Each recruiting action handler (phone, email, visit, head_coach_visit, offer) must:
1. Compute the interest gain first (no DB writes yet).
2. Insert the action log row with `ON CONFLICT DO NOTHING`.
3. If the insert returns `undefined` (conflict), return an idempotent 200 — do NOT update interest or charge points.
4. Only after a successful insert: update recruiting interest, update top schools, then call `atomicSpendRecruitPoints`.

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
This replaces the read-then-write `updateCoach({ recruitActionsUsed: used + cost })` pattern.

**Why:** In a 14-human multiplayer league two concurrent HTTP requests can both pass the points pre-check, both insert an action log row, and both charge points — resulting in duplicate interest gains and double-spent weekly budget. The action log unique constraint is the atomic gate; only one request wins the insert.

**How to apply:** Any new recruiting action type added in the future must follow this same gate pattern and be added to the appropriate partial index (weekly-cap or seasonal-cap).
