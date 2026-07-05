---
name: League setup flow timing
description: Why e2e tests against dynasty creation (team-selection/start/setup) need long timeouts
---

The league creation flow (`POST .../team-selection`, `POST .../start`, `POST .../setup`) triggers full roster, recruit-class, and schedule generation server-side. Individual calls can legitimately take 20-90 seconds under normal load, and longer if other CPU-heavy workflows (e.g. validate-all) are running concurrently.

**Why:** These endpoints aren't slow due to bugs — they synchronously generate ~3500 players, multiple recruiting classes, and full schedules per new league. A curl/test client with a short default timeout (e.g. 30s) will see a false failure even though the operation completes successfully server-side.

**How to apply:** When writing or running e2e tests / scripts against dynasty creation, use generous timeouts (60-90s+) for `start` and `team-selection`/`setup`, and verify server-side state via a follow-up GET rather than treating a client timeout as a hard failure.
