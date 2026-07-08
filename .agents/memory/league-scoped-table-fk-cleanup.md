---
name: New league-scoped tables need cascade cleanup
description: storage.ts deleteLeague() manually deletes dependent rows in FK order; new tables must be added there.
---

`deleteLeague()` in `server/storage.ts` does not rely on `ON DELETE CASCADE` at the DB level — it manually deletes rows from every dependent table inside a transaction, in FK-safe order, before deleting the `teams`/`games`/`leagues` rows themselves.

**Why:** Any new table referencing `leagueId` or a table that itself gets deleted (like `gameId` referencing `games`) will cause `deleteLeague()` to throw a Postgres FK violation (`update or delete on table "X" violates foreign key constraint`) once that new table has rows, even though the table and its routes work fine otherwise. This is easy to miss because normal CRUD testing never exercises league deletion.

**How to apply:** Whenever you add a new table with a `leagueId` FK or an FK to a table that `deleteLeague()` deletes (e.g. `games`, `teams`, `recruits`), add a corresponding `await tx.delete(newTable).where(...)` call in `deleteLeague()` before the row it depends on is deleted. Verify by actually calling the league-delete endpoint in a test flow, not just by inspecting the code.
