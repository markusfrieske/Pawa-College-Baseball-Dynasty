import type pg from "pg";

/** Route recovery checks. Seeded corruption and actual process death are distinct. */
export async function verifyAdvanceRecovery(context: {
  pool: pg.Pool; primaryId: string;
  equal: (actual: unknown, expected: unknown, label: string) => void;
  snapshot: () => Promise<unknown>;
  invoke: (route: string, method?: string, body?: unknown) => Promise<any>;
  hardStop: () => Promise<void>; start: () => Promise<void>; restart: () => Promise<void>;
  handoff: (leagueId: string, operationId: string) => Promise<{ error: string | null }>;
}) {
  const { pool, primaryId, equal, snapshot, invoke, hardStop, start, restart, handoff } = context;
  const count = async (sql: string, values: unknown[] = []) => Number((await pool.query(sql, values)).rows[0].count);
  const phase = async (id: string) => (await pool.query("SELECT current_phase,current_week,current_season FROM leagues WHERE id=$1", [id])).rows[0];
  const operations = async (id: string) => (await pool.query("SELECT * FROM league_advances WHERE league_id=$1 ORDER BY created_at,id", [id])).rows;
  const expireFixtureLeases = async (id: string) => {
    // Explicit test-clock substitute: do not spend fifteen real minutes waiting.
    // Only the synthetic fixture league's leases are changed.
    await pool.query("UPDATE league_advances SET lease_expires_at=now()-interval '1 second' WHERE league_id=$1 AND status='running'", [id]);
    await pool.query("UPDATE league_advance_locks SET lease_expires_at=now()-interval '1 second' WHERE league_id=$1", [id]);
  };
  const newLeague = async (id: string) => pool.query("INSERT INTO leagues (id,name,commissioner_id,game_mode,current_phase,current_week,email_digests_enabled,is_test_data) VALUES ($1,'Advance recovery fixture',$2,'simulated','super_regionals',10,false,true)", [id, primaryId]);
  const seedOperation = async (id: string, from: { phase?: string; week?: number; season?: number }, checkpoints: unknown, future = false) => {
    await pool.query("INSERT INTO league_advances (id,league_id,status,from_phase,from_week,from_season,checkpoints,locked_by,lease_expires_at) VALUES ($1,$2,'running',$3,$4,$5,$6::jsonb,'synthetic-abandoned-owner',now()+($7::integer * interval '1 minute'))",
      [`${id}-op`, id, from.phase ?? "super_regionals", from.week ?? 10, from.season ?? 1, JSON.stringify(checkpoints), future ? 15 : -1]);
  };
  const assertRecoveryBlock = async (id: string, suffix: string, label: string) => {
    const before = await snapshot();
    const blocked = await invoke(`/api/leagues/${id}/${suffix}`, "POST", {});
    equal(blocked.response.status, 409, `${label}: reconciliation blocks ${suffix}`);
    equal(blocked.data.recoveryRequired, true, `${label}: ${suffix} exposes durable recovery requirement`);
    equal(typeof blocked.data.operationId, "string", `${label}: ${suffix} identifies the interrupted operation`);
    equal(/reconcil/i.test(blocked.data.message), true, `${label}: ${suffix} explains the reconciliation requirement`);
    equal(await snapshot(), before, `${label}: ${suffix} preserves every table including operation evidence and locks`);
  };

  // Synthetic stale identities exercise independent phase, week and season
  // mismatches. They are not presented as process-crash evidence.
  for (const [label, from] of [
    ["phase", { phase: "conference_championship" }],
    ["week", { week: 9 }],
    ["season", { season: 2 }],
  ] as const) {
    const id = `recovery-stale-${label}`;
    await newLeague(id);
    await seedOperation(id, from, { game_simulation: { pct: 100 }, phase_transition: { pct: 100 } });
    await assertRecoveryBlock(id, "advance", `Seeded ${label} mismatch`);
  }
  const bypassId = "recovery-stale-phase";
  for (const suffix of ["force-advance", "advance/clear-stuck", "sim-to-offseason", "sim-full-season", "sim-to-cws"]) {
    await assertRecoveryBlock(bypassId, suffix, "Seeded mismatched source cannot be bypassed");
  }
  for (const [label, checkpoints] of [
    ["unknown", { invented_stage: { pct: 100 } }],
    ["string", { game_simulation: { pct: "100" } }],
    ["overflow", { game_simulation: { pct: 101 } }],
    ["shape", []],
    ["transition", { phase_transition: { pct: 100 } }],
  ] as const) {
    const id = `recovery-checkpoints-${label}`;
    await newLeague(id);
    await seedOperation(id, {}, checkpoints);
    await assertRecoveryBlock(id, "advance", `Seeded invalid checkpoint ${label}`);
  }

  const busyId = "recovery-running-conflict";
  const regressedId = "recovery-legacy-regression";
  await newLeague(regressedId);
  await seedOperation(regressedId, {}, { storylines: { pct: 100 } });
  await pool.query("UPDATE league_advances SET status='failed',created_at=now()-interval '1 minute' WHERE league_id=$1", [regressedId]);
  await pool.query("INSERT INTO league_advances(id,league_id,status,from_phase,from_week,from_season,checkpoints,locked_by,lease_expires_at) VALUES($1,$2,'failed','super_regionals',10,1,'{}','synthetic-owner',now())", [`${regressedId}-newer`,regressedId]);
  await assertRecoveryBlock(regressedId, "advance", "Legacy failed retries with lost completed-stage evidence");

  await newLeague(busyId);
  await seedOperation(busyId, {}, {}, true);
  const beforeBusy = await snapshot();
  const busy = await invoke(`/api/leagues/${busyId}/advance`, "POST", {});
  equal(busy.response.status, 409, "A live running operation without a lock cannot be treated as completed on unique conflict");
  equal(busy.data.idempotent === true, false, "Running operation never returns idempotent success");
  equal(await snapshot(), beforeBusy, "Live operation conflict preserves the league and the original operation");
  const saved = await invoke(`/api/leagues/${busyId}/save-states`, "POST", { label: "Game-free interrupted operation" });
  equal(saved.response.status, 200, "Game-free operation fixture can capture a save for inspection");
  const beforeRestore = await snapshot();
  equal((await invoke(`/api/leagues/${busyId}/save-states/${saved.data.id}/restore`, "POST", {})).response.status, 409, "Restore cannot erase interrupted operation evidence even without games or report history");
  equal(await snapshot(), beforeRestore, "Rejected operation-history restore changes no table or backup");

  // Explicit helper/IPC evidence, separate from the real route and process-death
  // fixtures below. Test seeded checkpoint inheritance across two handoffs.
  const handoffId = "recovery-handoff-atomic";
  await newLeague(handoffId);
  await pool.query("UPDATE leagues SET current_phase='regular_season' WHERE id=$1", [handoffId]);
  const inherited = {
    cpu_recruiting: { pct: 100, at: "2026-09-18T00:00:00.000Z" },
    storylines: { pct: 100, at: "2026-09-18T00:00:01.000Z" },
    game_simulation: { pct: 10, at: "2026-09-18T00:00:02.000Z" },
  };
  await seedOperation(handoffId, { phase: "regular_season" }, inherited);
  await pool.query(`CREATE FUNCTION reject_recovery_successor() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id='recovery-handoff-atomic' THEN RAISE EXCEPTION 'synthetic successor insertion failure'; END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER reject_recovery_successor BEFORE INSERT ON league_advances FOR EACH ROW EXECUTE FUNCTION reject_recovery_successor()");
  try {
    const beforeHandoffFailure = await snapshot();
    equal(typeof (await handoff(handoffId, `${handoffId}-first`)).error, "string", "Seeded helper handoff propagates successor insertion failure");
    equal(await snapshot(), beforeHandoffFailure, "Successor insertion failure rolls back predecessor retirement and preserves all checkpoint evidence");
    equal((await operations(handoffId)).map(row => row.status), ["running"], "Failed handoff leaves the predecessor recoverable");
  } finally {
    await pool.query("DROP TRIGGER reject_recovery_successor ON league_advances");
    await pool.query("DROP FUNCTION reject_recovery_successor()");
  }
  equal((await handoff(handoffId, `${handoffId}-first`)).error, null, "Seeded helper handoff atomically creates a successor");
  const firstHandoff = await operations(handoffId);
  equal(firstHandoff.map(row => row.status), ["failed", "running"], "Successful handoff retires predecessor and records successor together");
  equal(firstHandoff.find(row => row.id === `${handoffId}-first`).checkpoints, inherited, "Successor durably inherits validated complete and partial checkpoints before engine work");
  await expireFixtureLeases(handoffId);
  equal((await handoff(handoffId, `${handoffId}-second`)).error, null, "Second seeded handoff recovers the interrupted successor");
  const secondHandoff = await operations(handoffId);
  equal(secondHandoff.map(row => row.status), ["failed", "failed", "running"], "Repeated handoff preserves both predecessor operation records");
  equal(secondHandoff.find(row => row.id === `${handoffId}-second`).checkpoints, inherited, "Repeated interruption cannot erase already-completed CPU and storyline stage flags");
  await pool.query("UPDATE league_advances SET status='failed',error_message='Synthetic failed successor evidence' WHERE id=$1", [`${handoffId}-second`]);
  equal((await handoff(handoffId, `${handoffId}-third`)).error, null, "Seeded helper can resume the latest same-source failed attempt");
  const thirdHandoff = await operations(handoffId);
  equal(thirdHandoff.find(row => row.id === `${handoffId}-third`).checkpoints, inherited, "Failed-attempt recovery inherits every validated durable checkpoint");
  equal(thirdHandoff.find(row => row.id === `${handoffId}-second`).error_message, "Synthetic failed successor evidence", "Failed-attempt handoff preserves the predecessor's original failure evidence");

  const seedCompletedSR = async (id: string) => {
    await newLeague(id);
    await pool.query("UPDATE leagues SET dynasty_preset='full_season' WHERE id=$1", [id]);
    const team = (seed: number) => `${id}-t${String(seed).padStart(2, "0")}`;
    for (let seed = 1; seed <= 16; seed++) {
      await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ($1,$2,$3,'Owls','REC','Test','IA',true)", [team(seed), id, `Seed ${seed}`]);
      await pool.query("INSERT INTO postseason_entries (league_id,season,team_id,national_seed) VALUES ($1,1,$2,$3)", [id, team(seed), seed]);
      if (seed <= 8) {
        const user = `${id}-u${seed}`, coach = `${id}-c${seed}`;
        await pool.query("INSERT INTO users (id,email,password,email_opt_out) VALUES ($1,$2,'synthetic-no-login',true)", [user, `${user}@example.test`]);
        await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name,xp,level) VALUES ($1,$2,$3,$4,'Recovery',$5,100,1)", [coach, user, team(seed), id, String(seed)]);
        await pool.query("UPDATE teams SET coach_id=$1 WHERE id=$2", [coach, team(seed)]);
      }
    }
    for (let slot = 1; slot <= 8; slot++) {
      const high = team(slot), low = team(17 - slot);
      await pool.query("INSERT INTO postseason_series (league_id,season,stage,bracket_slot,round,home_team_id,away_team_id,best_of) VALUES ($1,1,'super_regionals',$2,$3,$4,$5,3)", [id, `SR${slot}`, slot, high, low]);
      for (const g of [{ side: "G1", home: high, away: low, hs: 3, as: 1 }, { side: "G2", home: low, away: high, hs: 1, as: 3 }]) {
        await pool.query("INSERT INTO games (id,league_id,season,week,home_team_id,away_team_id,home_score,away_score,is_complete,phase,bracket_type,bracket_round,bracket_side) VALUES ($1,$2,1,0,$3,$4,$5,$6,true,'super_regionals','bof3',$7,$8)", [`${id}-${slot}-${g.side}`, id, g.home, g.away, g.hs, g.as, slot, g.side]);
      }
    }
  };

  const preservedId = "recovery-complete-game-stage";
  await seedCompletedSR(preservedId);
  // This seeded resume state tests the actual route's use of inherited progress.
  // The trigger catches a regression even if later work would write 100 again.
  await seedOperation(preservedId, {}, { game_simulation: { pct: 100, at: "2026-09-18T00:00:00.000Z" } });
  await pool.query(`CREATE FUNCTION reject_recovery_checkpoint_regression() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id='recovery-complete-game-stage'
        AND COALESCE((OLD.checkpoints->'game_simulation'->>'pct')::integer,0)=100
        AND COALESCE((NEW.checkpoints->'game_simulation'->>'pct')::integer,0)<100 THEN
        RAISE EXCEPTION 'synthetic completed checkpoint regression';
      END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER reject_recovery_checkpoint_regression BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION reject_recovery_checkpoint_regression()");
  try {
    equal((await invoke(`/api/leagues/${preservedId}/advance`, "POST", {})).response.status, 200, "Real route resumes a completed game stage without rewriting its progress to ten percent");
    equal(await phase(preservedId), { current_phase: "cws", current_week: 11, current_season: 1 }, "Inherited game completion still allows the intended postseason transition");
    const preservedOps = await operations(preservedId);
    equal(preservedOps.map(row => row.status), ["failed", "complete"], "Inherited-stage route records the recovered and completed operations");
    equal(preservedOps.map(row => row.checkpoints.game_simulation?.pct), [100, 100], "Predecessor and successor preserve completed game-stage evidence");
  } finally {
    await pool.query("DROP TRIGGER reject_recovery_checkpoint_regression ON league_advances");
    await pool.query("DROP FUNCTION reject_recovery_checkpoint_regression()");
  }

  // Actual route failure whose terminal-status write also fails. Its operation
  // and lease must remain paired; later exact-source recovery uses real progress.
  const failedId = "recovery-failed-status";
  await seedCompletedSR(failedId);
  await pool.query(`CREATE FUNCTION reject_recovery_terminal_status() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id='recovery-failed-status' AND
        (NEW.status='failed' OR COALESCE((NEW.checkpoints->'game_simulation'->>'pct')::integer,0)=100) THEN
        RAISE EXCEPTION 'synthetic checkpoint and terminal-status failure';
      END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER reject_recovery_terminal_status BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION reject_recovery_terminal_status()");
  try {
    equal((await invoke(`/api/leagues/${failedId}/advance`, "POST", {})).response.status, 500, "Terminal-status failure returns an error instead of successful advancement");
    equal(await phase(failedId), { current_phase: "super_regionals", current_week: 10, current_season: 1 }, "Failed terminal write preserves the source phase");
    const ops = await operations(failedId);
    equal(ops.length, 1, "Faulted actual route creates exactly one operation");
    equal(ops[0].status, "running", "Failed terminal-status write retains its unresolved running operation");
    const locks = (await pool.query("SELECT locked_by FROM league_advance_locks WHERE league_id=$1", [failedId])).rows;
    equal(locks.map(row => row.locked_by), [ops[0].locked_by], "Failed terminal-status write retains the matching owned lease");
    equal(ops[0].checkpoints.game_simulation?.pct, 10, "Retained operation contains its real incomplete game checkpoint");
    const beforeRetry = await snapshot();
    equal((await invoke(`/api/leagues/${failedId}/advance`, "POST", {})).response.status, 409, "Immediate retry sees unresolved live ownership and fails promptly");
    equal(await snapshot(), beforeRetry, "Immediate retry cannot erase or replace unresolved ownership");
  } finally {
    await pool.query("DROP TRIGGER reject_recovery_terminal_status ON league_advances");
    await pool.query("DROP FUNCTION reject_recovery_terminal_status()");
  }
  await restart();
  await expireFixtureLeases(failedId);
  equal((await invoke(`/api/leagues/${failedId}/advance`, "POST", {})).response.status, 200, "Fresh process safely resumes a real expired operation at the exact same source state");
  equal(await phase(failedId), { current_phase: "cws", current_week: 11, current_season: 1 }, "Exact-source recovery finishes one intended phase transition");
  equal((await operations(failedId)).map(row => row.status), ["failed", "complete"], "Exact-source recovery preserves old operation and records a new completed attempt");
  equal(await count("SELECT count(*) FROM postseason_coach_awards WHERE league_id=$1", [failedId]), 8, "Exact-source recovery awards all eight qualifying coaches once");
  equal(await count("SELECT count(*) FROM league_advance_locks WHERE league_id=$1", [failedId]), 0, "Recovered operation releases its lease after durable completion");

  const completionId = "recovery-completion-write";
  await seedCompletedSR(completionId);
  await pool.query(`CREATE FUNCTION reject_recovery_completion() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id='recovery-completion-write' AND NEW.status='complete' THEN
        RAISE EXCEPTION 'synthetic operation completion failure';
      END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER reject_recovery_completion BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION reject_recovery_completion()");
  try {
    equal((await invoke(`/api/leagues/${completionId}/advance`, "POST", {})).response.status, 500, "Real completion-status write failure cannot return successful advancement");
    equal(await phase(completionId), { current_phase: "cws", current_week: 11, current_season: 1 }, "Completion-status failure occurs after the actual phase flip");
    const completionOps = await operations(completionId);
    equal(completionOps.map(row => row.status), ["failed"], "Clean error handling durably records the rejected operation completion");
    equal(completionOps[0].checkpoints.phase_transition?.pct, 100, "Actual completed phase checkpoint survives failed terminal-status write");
    equal(await count("SELECT count(*) FROM league_advance_locks WHERE league_id=$1", [completionId]), 0, "Durably failed completion releases its owned lease");
  } finally {
    await pool.query("DROP TRIGGER reject_recovery_completion ON league_advances");
    await pool.query("DROP FUNCTION reject_recovery_completion()");
  }
  await assertRecoveryBlock(completionId, "advance", "Actual completion-write failure after phase flip");
  await assertRecoveryBlock(completionId, "advance/clear-stuck", "Actual completion-write failure after phase flip");

  // Actual process death between committed phase flip and its checkpoint. The
  // trigger does not fabricate progress: it pauses the engine's real UPDATE.
  const crashId = "recovery-phase-flip-kill";
  await seedCompletedSR(crashId);
  const barrier = await pool.connect();
  const lockClass = 190007, lockObject = 7;
  let waitingPid: number | undefined, stopped = false, started = false;
  await barrier.query("SELECT pg_advisory_lock($1,$2)", [lockClass, lockObject]);
  await pool.query(`CREATE FUNCTION pause_recovery_phase_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id='recovery-phase-flip-kill' AND COALESCE((NEW.checkpoints->'phase_transition'->>'pct')::integer,0)=100 THEN
        PERFORM pg_advisory_xact_lock(190007,7);
      END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER pause_recovery_phase_checkpoint BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION pause_recovery_phase_checkpoint()");
  const inFlight = invoke(`/api/leagues/${crashId}/advance`, "POST", {}).then(value => ({ value, interrupted: false }), () => ({ interrupted: true }));
  try {
    for (let attempt = 0; attempt < 160; attempt++) {
      const waiter = await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=$1 AND objid=$2 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())", [lockClass, lockObject]);
      if (waiter.rows.length) { waitingPid = waiter.rows[0].pid; break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    equal(typeof waitingPid, "number", "Real advance reaches the held phase-transition checkpoint query");
    equal(await phase(crashId), { current_phase: "cws", current_week: 11, current_season: 1 }, "Live phase flip committed before the held checkpoint");
    const running = (await operations(crashId))[0];
    equal([running.status, running.from_phase, running.from_week], ["running", "super_regionals", 10], "Paused operation retains the true earlier source identity");
    equal(running.checkpoints.phase_transition?.pct === 100, false, "Held checkpoint is not persisted before the crash");
    equal(await count("SELECT count(*) FROM postseason_coach_awards WHERE league_id=$1", [crashId]), 8, "All required awards committed before the paused phase checkpoint");
    await hardStop(); stopped = true;
    // A disconnected client can leave a PostgreSQL query running until its next
    // interrupt. Terminate only our identified blocked backend before unblocking
    // the fixture, so the deliberately held transaction cannot commit afterward.
    equal((await pool.query("SELECT pg_terminate_backend($1) AS terminated", [waitingPid])).rows[0].terminated, true, "Cleanup terminates only the owned interrupted checkpoint backend");
    await barrier.query("SELECT pg_advisory_unlock($1,$2)", [lockClass, lockObject]);
    equal((await inFlight).interrupted, true, "Hard-killed HTTP child cannot return a successful advance response");
    await start(); started = true;
  } finally {
    if (waitingPid && !stopped) { await hardStop(); stopped = true; }
    if (waitingPid) await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid=$1 AND datname=current_database()", [waitingPid]);
    await barrier.query("SELECT pg_advisory_unlock($1,$2)", [lockClass, lockObject]);
    barrier.release();
    await pool.query("DROP TRIGGER pause_recovery_phase_checkpoint ON league_advances");
    await pool.query("DROP FUNCTION pause_recovery_phase_checkpoint()");
    if (stopped && !started) await start();
  }
  await expireFixtureLeases(crashId);
  const beforeStatus = await snapshot();
  const crashStatus = await invoke(`/api/leagues/${crashId}/advance/status`);
  equal(crashStatus.response.status, 200, "Status endpoint remains readable after actual interrupted phase flip");
  equal(crashStatus.data.recoveryRequired, true, "Status endpoint exposes the durable post-crash recovery requirement");
  equal(await snapshot(), beforeStatus, "Reading post-crash status does not erase operation or checkpoint evidence");
  for (const suffix of ["advance", "force-advance", "advance/clear-stuck", "sim-to-offseason", "sim-full-season"]) {
    await assertRecoveryBlock(crashId, suffix, "Actual post-flip process interruption");
  }
  equal(await phase(crashId), { current_phase: "cws", current_week: 11, current_season: 1 }, "Recovery containment never advances the new CWS phase or rewinds the old one");
  equal((await operations(crashId)).map(row => row.status), ["running"], "Recovery containment preserves the actual unfinished operation for reconciliation");
  equal((await pool.query("SELECT xp,cws_appearances FROM coaches WHERE league_id=$1 ORDER BY id", [crashId])).rows, Array.from({ length: 8 }, () => ({ xp: 400, cws_appearances: 1 })), "Repeated blocked requests preserve each already-committed reward exactly once");
  equal(await count("SELECT count(*) FROM games WHERE league_id=$1 AND phase='cws'", [crashId]), 4, "Post-crash requests do not duplicate or simulate CWS opening fixtures");
}
