/** Real PostgreSQL metadata fencing. Does not certify in-flight gameplay effects. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";
import { createAdvanceProgress, getAdvanceProgress } from "../server/lib/advance-progress";

const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "Explicit PAWA_TEST_DATABASE_URL required");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol));
assert(!target.search, "Connection overrides forbidden");
assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Loopback only");
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname), "Named test database required");
const name = "pawa_test_execution_" + randomUUID().replaceAll("-", "");
const url = new URL(connection); url.pathname = "/" + name;
const admin = new pg.Pool({ connectionString: connection });
let created = false, testPool: pg.Pool | undefined, checks = 0;
const check = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  const exit = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/bootstrap-test-db.ts"], {
      windowsHide: true, stdio: "ignore", env: { ...process.env, PAWA_TEST_DATABASE_URL: url.toString() },
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Bootstrap timeout")); }, 60000);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("exit", code => { clearTimeout(timeout); resolve(code); });
  });
  check(exit, 0, "Fresh numbered bootstrap");
  process.env.DATABASE_URL = url.toString();
  const { pool } = await import("../server/db"); testPool = pool;
  const { createAdvanceExecution, AdvanceExecutionLost } = await import("../server/lib/advance-execution");
  const { beginAdvanceOperation, inspectAdvanceRecovery } = await import("../server/lib/advance-recovery");
  await pool.query("INSERT INTO users(id,email,password) VALUES('execution-user','execution@example.test','synthetic-disabled')");
  const source = (id: string) => ({ id, currentPhase: "regular_season", currentWeek: 1, currentSeason: 1 });
  const seed = async (id: string) => {
    await pool.query("INSERT INTO leagues(id,name,commissioner_id,current_phase,current_week,is_test_data,email_digests_enabled) VALUES($1,'Execution fixture','execution-user','regular_season',1,true,false)", [id]);
    await pool.query("INSERT INTO league_advance_locks(league_id,locked_by,locked_at,lease_expires_at) VALUES($1,'owner-a',now(),now()+interval '15 minutes')", [id]);
    await beginAdvanceOperation(source(id), id+"-a", "owner-a", undefined);
    return createAdvanceExecution({ leagueId: id, operationId: id+"-a", token: "owner-a" });
  };
  const snapshot = async (id: string) => ({
    locks: (await pool.query("SELECT * FROM league_advance_locks WHERE league_id=$1", [id])).rows,
    operations: (await pool.query("SELECT * FROM league_advances WHERE league_id=$1 ORDER BY id", [id])).rows,
  });
  const lost = async (action: () => Promise<unknown>, label: string) => {
    await assert.rejects(action, AdvanceExecutionLost, label); checks++;
  };
  const a = await seed("takeover");
  await a.checkpoint("game_simulation", 10);
  await a.heartbeat();
  const oldProgress = createAdvanceProgress("takeover", a.checkpoint);
  await oldProgress.update("game_simulation", 10);
  let releaseOld!: () => void;
  const paused = new Promise<void>(resolve => { releaseOld = resolve; });
  // A's live async execution resumes AFTER B has registered its own progress.
  const oldAttempt = paused.then(() => oldProgress.update("game_simulation", 100));
  await pool.query("UPDATE league_advance_locks SET lease_expires_at=now()-interval '1 second' WHERE league_id='takeover'");
  await pool.query("UPDATE league_advances SET lease_expires_at=now()-interval '1 second' WHERE league_id='takeover'");
  const resumed = await inspectAdvanceRecovery(source("takeover"));
  await pool.query("UPDATE league_advance_locks SET locked_by='owner-b',lease_expires_at=now()+interval '15 minutes' WHERE league_id='takeover'");
  await beginAdvanceOperation(source("takeover"), "takeover-b", "owner-b", resumed);
  const b = createAdvanceExecution({ leagueId: "takeover", operationId: "takeover-b", token: "owner-b" });
  const newProgress = createAdvanceProgress("takeover", b.checkpoint);
  await newProgress.update("game_simulation", 20);
  const beforeOld = await snapshot("takeover"), uiBeforeOld = getAdvanceProgress("takeover");
  const oldRejected = lost(() => oldAttempt, "Old async callback cannot invoke successor's checkpoint writer");
  releaseOld(); await oldRejected;
  for (const action of [a.heartbeat, a.complete, () => a.fail("stale failure")]) await lost(action, "Superseded execution metadata rejected");
  oldProgress.clear();
  check(getAdvanceProgress("takeover"), uiBeforeOld, "Stale cleanup preserves successor UI");
  check(await snapshot("takeover"), beforeOld, "Every stale operation preserves both DB rows and inherited checkpoints");
  // Identity is copied: caller mutation cannot retarget a writer.
  const identity = { leagueId: "takeover", operationId: "takeover-a", token: "owner-a" };
  const immutable = createAdvanceExecution(identity); identity.operationId="takeover-b"; identity.token="owner-b";
  await lost(immutable.complete, "Caller cannot mutate execution identity");
  await b.checkpoint("game_simulation", 100); await b.complete(); newProgress.clear();
  check(getAdvanceProgress("takeover"), undefined, "Current owner can clear its own UI");
  check((await snapshot("takeover")).operations.find(row => row.id==="takeover-b").status, "complete", "Successor completes normally");

  for (const table of ["league_advance_locks","league_advances"]) {
    const id = table==="league_advances"?"expired-operation":"expired-lock", execution = await seed(id);
    await pool.query(`UPDATE ${table} SET lease_expires_at=now()-interval '1 second' WHERE league_id=$1`, [id]);
    const before = await snapshot(id);
    for (const action of [() => execution.checkpoint("storylines",100), execution.heartbeat, execution.complete, () => execution.fail("expired")]) {
      await lost(action, "Expired ownership without successor is rejected");
    }
    check(await snapshot(id), before, "Expired execution never resurrects either lease or changes history");
    await lost(() => beginAdvanceOperation(source(id),id+"-unauthorized","wrong-owner",undefined), "Handoff refuses foreign owner");
  }

  // Test SQL that remains inside a trigger until either original deadline passes.
  await pool.query(`CREATE FUNCTION execution_delay() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id LIKE 'slow-%' THEN PERFORM pg_sleep(0.4); END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER execution_delay BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION execution_delay()");
  for (const scope of ["lock","operation"]) {
    for (const action of ["checkpoint","heartbeat","complete","fail"] as const) {
      const id = "slow-"+scope+"-"+action, execution = await seed(id);
      const table = scope==="lock"?"league_advance_locks":"league_advances";
      // Operation deadline setup bypasses the test delay so the clock starts now.
      await pool.query("ALTER TABLE league_advances DISABLE TRIGGER execution_delay");
      await pool.query(`UPDATE ${table} SET lease_expires_at=clock_timestamp()+interval '250 milliseconds' WHERE league_id=$1`, [id]);
      await pool.query("ALTER TABLE league_advances ENABLE TRIGGER execution_delay");
      const before = await snapshot(id);
      await lost(() => action==="checkpoint"?execution.checkpoint("cpu_recruiting",100):action==="fail"?execution.fail("slow"):execution[action](), "Slow "+scope+" "+action+" cannot cross original deadline");
      check(await snapshot(id), before, "Slow action rollback preserves checkpoint/status AND both expiries");
    }
  }
  const inFlight = await seed("slow-takeover");
  await pool.query("ALTER TABLE league_advances DISABLE TRIGGER execution_delay");
  await pool.query("UPDATE league_advances SET lease_expires_at=clock_timestamp()+interval '250 milliseconds' WHERE league_id='slow-takeover'");
  await pool.query("UPDATE league_advance_locks SET lease_expires_at=clock_timestamp()+interval '250 milliseconds' WHERE league_id='slow-takeover'");
  await pool.query("ALTER TABLE league_advances ENABLE TRIGGER execution_delay");
  const beforeInFlight = await snapshot("slow-takeover");
  const oldSql = lost(() => inFlight.checkpoint("game_simulation",100), "In-flight old SQL rolls back while takeover waits");
  let observedInFlight = false;
  for (let poll = 0; poll < 100; poll++) {
    const state = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND query LIKE 'UPDATE league_advances SET checkpoints=%' AND wait_event='PgSleep'");
    if (state.rowCount) { observedInFlight=true; break; }
    await pool.query("SELECT pg_sleep(0.005)");
  }
  check(observedInFlight,true,"Observed the actual old checkpoint SQL blocked inside the test trigger");
  await pool.query("SELECT pg_sleep(0.3)");
  const claimed = await pool.query("UPDATE league_advance_locks SET locked_by='owner-b',lease_expires_at=clock_timestamp()+interval '15 minutes' WHERE league_id='slow-takeover' AND lease_expires_at < clock_timestamp() RETURNING league_id");
  await oldSql;
  check(claimed.rowCount,1,"Successor acquires the expired row after the old SQL releases it");
  check((await snapshot("slow-takeover")).operations,beforeInFlight.operations,"Old in-flight checkpoint never commits to predecessor history");
  const liveResume = await inspectAdvanceRecovery(source("slow-takeover"));
  await beginAdvanceOperation(source("slow-takeover"),"slow-takeover-b","owner-b",liveResume);
  const afterTakeover = await snapshot("slow-takeover");
  await lost(inFlight.complete,"Old SQL owner cannot complete after successor handoff");
  check(await snapshot("slow-takeover"),afterTakeover,"Stale completion preserves successor operation and lease");
  await pool.query("DROP TRIGGER execution_delay ON league_advances");
  await pool.query("DROP FUNCTION execution_delay()");

  // A row-lock wait with no changed values must still recheck the real clock.
  const waiting = await seed("wait-expiry");
  await pool.query("UPDATE league_advance_locks SET lease_expires_at=clock_timestamp()+interval '250 milliseconds' WHERE league_id='wait-expiry'");
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN"); await blocker.query("SELECT * FROM league_advance_locks WHERE league_id='wait-expiry' FOR UPDATE");
    const before = await snapshot("wait-expiry");
    const attempt = lost(() => waiting.checkpoint("storylines",100), "Time rechecked after unchanged row-lock wait");
    await blocker.query("SELECT pg_sleep(0.4)"); await blocker.query("COMMIT");
    await attempt; check(await snapshot("wait-expiry"),before,"Blocked old execution leaves no checkpoint");
  } finally { await blocker.query("ROLLBACK"); blocker.release(); }

  // Even a successful old writer returning late cannot replace successor UI.
  let unblock!: () => void;
  const late = createAdvanceProgress("late-ui", () => new Promise<void>(resolve => { unblock=resolve; }));
  const lateWrite = late.update("storylines",100);
  const fresh = createAdvanceProgress("late-ui", async () => {});
  await fresh.update("game_simulation",10); const freshBefore=getAdvanceProgress("late-ui");
  unblock(); await lateWrite; late.clear();
  check(getAdvanceProgress("late-ui"),freshBefore,"Late committed callback cannot overwrite new UI");
  fresh.clear();
  console.log(`Advance execution metadata: ${checks} assertions passed; gameplay-stage fencing remains outside this test.`);
} finally {
  if (testPool) await testPool.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
