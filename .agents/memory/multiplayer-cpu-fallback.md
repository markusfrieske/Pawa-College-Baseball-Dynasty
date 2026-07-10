---
name: Multiplayer CPU fallback pattern
description: Why leagueTeams.find(t => !t.isCpu) is a critical multiplayer bug and how to fix it
---

## Rule
Never use `leagueTeams.find(t => !t.isCpu)` as a fallback when resolving the current user's team.
Always use `resolveUserTeam(coaches, teams, userId)` from `server/route-helpers.ts`.

**Why:** In a 14-user league all teams are human-controlled. The `!isCpu` pattern returns the
first team alphabetically/by insertion order — routing every unmatched request to Team 1.
This causes: wrong recruiting data, cross-team writes (targeting, notes), and display corruption.

**How to apply:**
1. Any endpoint that needs "the current user's team" must call `resolveUserTeam`.
2. If `userTeam` is undefined, return 400 "No team assigned" — never fall through.
3. Endpoints that previously had NO userId lookup at all (target, notes, actions log) need
   a `Promise.all([getTeams, getCoaches])` added before the `resolveUserTeam` call.
4. The helper is in `server/route-helpers.ts` and uses `coach.teamId` (not `team.coachId`)
   as the authoritative direction.
