---
name: V3 development engine wiring
description: How the V3 archetype-aware development engine is wired into the progression pipeline
---

# V3 Engine Wiring Pattern

## Rule
New players (signed recruits + walk-ons) receive `developmentModelVersion: 3` and `playArchetypeId` via `assignArchetype()` when created in `finalizeSigningDay` and `finalizeWalkonsPhase`. Existing dynasty players retain `developmentModelVersion: 1` (DB default).

## How applyPlayerProgression routes them
1. V1 loop: skips players where `developmentModelVersion === 3`
2. After V1 loop: `runV3SeasonDevelopment(storage, leagueId, season, teams, allPlayersLeague)` handles V3 players
3. V3 engine lazily assigns archetype on first run if `playArchetypeId` is null

**Why:** Existing dynasty data must not be disrupted; only new signing-day classes use V3. V3 engine is additive.

## Key files
- `server/services/playerDevelopment/runSeasonDevelopment.ts` — V3 orchestrator
- `server/services/playerDevelopment/assignArchetype.ts` — signature: `(position, playerMinAttrs, playerId?, leagueId?) => string|null`
- `server/routes/simulation.ts` — applyPlayerProgression + finalizeSigningDay + finalizeWalkonsPhase

## DB migration
`v3-development-columns-v1` in the sequential startup runner adds 5 columns (play_archetype_id, development_caps, development_seed, development_model_version, last_development_season) with `IF NOT EXISTS`.
