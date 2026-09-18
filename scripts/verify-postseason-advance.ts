import type pg from "pg";

/** Real authenticated routes and their own checkpoints; no seeded advance rows. */
export async function verifyPostseasonAdvance(context: {
  pool: pg.Pool; primaryId: string;
  equal: (actual: unknown, expected: unknown, label: string) => void;
  snapshot: () => Promise<unknown>;
  invoke: (route: string, method?: string, body?: unknown) => Promise<any>;
  restart: () => Promise<void>;
}) {
  const { pool, primaryId, equal, snapshot, invoke, restart } = context;
  const count = async (query: string, args: unknown[] = []) => Number((await pool.query(query, args)).rows[0].count);
  await pool.query("INSERT INTO leagues (id,name,commissioner_id,is_test_data) VALUES ('advance-foreign-fixture','Foreign fixture',$1,true)", [primaryId]);
  await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ('advance-foreign-team','advance-foreign-fixture','Foreign team','Owls','FOR','Test','IA',true)");
  for (const phase of ["conference_championship", "super_regionals", "cws"]) {
    const leagueId = `advance-reported-${phase}`;
    const gameId = `${leagueId}-game`;
    await pool.query("INSERT INTO leagues (id,name,commissioner_id,game_mode,current_phase,current_week,is_test_data) VALUES ($1,'Reported postseason gate',$2,'reported',$3,10,true)", [leagueId, primaryId, phase]);
    for (const side of ["home", "away"]) {
      await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ($1,$2,$3,'Owls','PST','Test','IA',false)", [`${leagueId}-${side}`, leagueId, `Postseason ${side}`]);
    }
    await pool.query("INSERT INTO games (id,league_id,season,week,home_team_id,away_team_id,phase) VALUES ($1,$2,1,0,$3,$4,$5)", [gameId, leagueId, `${leagueId}-home`, `${leagueId}-away`, phase]);
    const advanceRoute = `/api/leagues/${leagueId}/advance`;
    const preflightRoute = `/api/leagues/${leagueId}/advance/preflight`;
    const reportRoute = `/api/leagues/${leagueId}/games/${gameId}/report`;
    const beforeBlocked = await snapshot();
    const blocked = await invoke(advanceRoute, "POST", {});
    equal(blocked.response.status, 409, `${phase}: generated week-zero human fixture blocks real advance at league week ten`);
    equal(blocked.data.blockers.map((row: any) => [row.gameId, row.status]), [[gameId, "unreported"]], `${phase}: blocker identifies the external result that still needs reporting`);
    equal(await snapshot(), beforeBlocked, `${phase}: blocked advance writes no game, reward, lock, operation, save or checkpoint`);
    const forced = await invoke(`/api/leagues/${leagueId}/force-advance`, "POST", {});
    equal(forced.response.status, 409, `${phase}: commissioner force-advance cannot bypass the week-zero report gate`);
    equal(forced.data.blockers.map((row: any) => row.gameId), [gameId], `${phase}: force-advance identifies the unresolved postseason fixture`);
    equal(await snapshot(), beforeBlocked, `${phase}: blocked force-advance writes no readiness, audit, lock or game changes`);
    if (phase === "conference_championship") {
      for (const shortcut of ["sim-to-offseason", "sim-to-signing-day", "sim-full-season", "sim-to-postseason", "sim-to-cws"]) {
        equal((await invoke(`/api/leagues/${leagueId}/${shortcut}`, "POST", {})).response.status, 409, `${shortcut}: quick simulation remains disabled for reported leagues`);
        equal(await snapshot(), beforeBlocked, `${shortcut}: rejected quick simulation preserves every persistent table`);
      }
    }

    const submitted = await invoke(reportRoute, "POST", { homeScore: 2, awayScore: 1, overrideReason: "Synthetic commissioner postseason result" });
    equal(submitted.response.status, 200, `${phase}: real score-only report submission succeeds`);
    const beforePending = await snapshot();
    const pending = await invoke(advanceRoute, "POST", {});
    equal(pending.response.status, 409, `${phase}: an unaccepted report still blocks advancement`);
    equal(pending.data.blockers.map((row: any) => row.status), ["pending_confirmation"], `${phase}: pending result is not mistaken for a finalized game`);
    equal(await snapshot(), beforePending, `${phase}: pending report rejection preserves all tables`);
    // Deliberately inconsistent imported state: confirmed label and valid final
    // score, but no actual accepted-report receipt. Restore it before continuing
    // through the genuine report finalizer.
    await pool.query("UPDATE game_reports SET status='confirmed' WHERE game_id=$1", [gameId]);
    await pool.query("UPDATE games SET is_complete=true,home_score=2,away_score=1 WHERE id=$1", [gameId]);
    equal(await count("SELECT count(*) FROM game_finalizations WHERE game_id=$1", [gameId]), 0, `${phase}: corrupt-label fixture has no acceptance receipt`);
    const beforeMissingReceipt = await snapshot();
    const missingReceipt = await invoke(advanceRoute, "POST", {});
    equal(missingReceipt.response.status, 409, `${phase}: confirmed label plus final score cannot bypass missing acceptance evidence`);
    equal(missingReceipt.data.blockers.map((row: any) => row.status), ["invalid_or_orphaned"], `${phase}: missing acceptance receipt is an explicit invalid blocker`);
    equal(await snapshot(), beforeMissingReceipt, `${phase}: missing-receipt rejection makes no writes`);
    await pool.query("UPDATE game_reports SET status='pending' WHERE game_id=$1", [gameId]);
    await pool.query("UPDATE games SET is_complete=false,home_score=NULL,away_score=NULL,home_team_id='advance-foreign-team' WHERE id=$1", [gameId]);
    const beforeOrphan = await snapshot();
    const orphan = await invoke(advanceRoute, "POST", {});
    equal(orphan.response.status, 409, `${phase}: foreign team reference cannot disappear from the human-game gate`);
    equal(orphan.data.blockers.map((row: any) => row.status), ["invalid_or_orphaned"], `${phase}: foreign league team is identified as an orphaned fixture`);
    equal(await snapshot(), beforeOrphan, `${phase}: orphaned fixture rejection preserves every table`);
    await pool.query("UPDATE games SET home_team_id=$1 WHERE id=$2", [`${leagueId}-home`, gameId]);
    equal((await invoke(`${reportRoute}/finalize`, "POST", { expectedEditVersion: submitted.data.editVersion })).response.status, 200, `${phase}: commissioner accepts the external result through the actual finalizer`);
    equal((await invoke(preflightRoute)).data.canAdvance, true, `${phase}: completed result and its acceptance receipt clear preflight`);

    await pool.query("UPDATE games SET is_complete=false WHERE id=$1", [gameId]);
    const inconsistent = await invoke(preflightRoute);
    equal(inconsistent.data.canAdvance, false, `${phase}: confirmed report alone cannot certify an incomplete game`);
    equal(inconsistent.data.blockers.map((row: any) => row.status), ["invalid_or_orphaned"], `${phase}: inconsistent completion is exposed as an invalid blocker`);
    await pool.query("UPDATE games SET is_complete=true WHERE id=$1", [gameId]);
  }

  // A narrow, completed-SR starting state exercises the actual advance engine,
  // bracket transition, coach awards and checkpoint writer. It does not pretend
  // to play a full season or test simulation with generated player rosters.
  const leagueId = "advance-sr-award-retry";
  const teamId = (seed: number) => `${leagueId}-team-${String(seed).padStart(2, "0")}`;
  await pool.query("INSERT INTO leagues (id,name,commissioner_id,game_mode,dynasty_preset,current_phase,current_week,is_test_data) VALUES ($1,'SR advance retry',$2,'simulated','full_season','super_regionals',10,true)", [leagueId, primaryId]);
  for (let seed = 1; seed <= 16; seed++) {
    await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ($1,$2,$3,'Owls','SRA','Test','IA',true)", [teamId(seed), leagueId, `Seed ${seed}`]);
    await pool.query("INSERT INTO postseason_entries (league_id,season,team_id,national_seed) VALUES ($1,1,$2,$3)", [leagueId, teamId(seed), seed]);
    if (seed <= 8) {
      const coachId = `${leagueId}-coach-${seed}`;
      const userId = `${leagueId}-user-${seed}`;
      await pool.query("INSERT INTO users (id,email,password,email_opt_out) VALUES ($1,$2,'synthetic-no-login',true)", [userId, `${userId}@example.test`]);
      await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name,xp,level) VALUES ($1,$2,$3,$4,'Postseason',$5,100,1)", [coachId, userId, teamId(seed), leagueId, String(seed)]);
      await pool.query("UPDATE teams SET coach_id=$1 WHERE id=$2", [coachId, teamId(seed)]);
    }
  }
  for (let slot = 1; slot <= 8; slot++) {
    const high = teamId(slot), low = teamId(17 - slot);
    await pool.query("INSERT INTO postseason_series (league_id,season,stage,bracket_slot,round,home_team_id,away_team_id,best_of) VALUES ($1,1,'super_regionals',$2,$3,$4,$5,3)", [leagueId, `SR${slot}`, slot, high, low]);
    for (const game of [{ side: "G1", home: high, away: low, hs: 3, as: 1 }, { side: "G2", home: low, away: high, hs: 1, as: 3 }]) {
      await pool.query("INSERT INTO games (id,league_id,season,week,home_team_id,away_team_id,home_score,away_score,is_complete,phase,bracket_type,bracket_round,bracket_side) VALUES ($1,$2,1,0,$3,$4,$5,$6,true,'super_regionals','bof3',$7,$8)", [`${leagueId}-${slot}-${game.side}`, leagueId, game.home, game.away, game.hs, game.as, slot, game.side]);
    }
  }
  const phase = async () => (await pool.query("SELECT current_phase,current_week FROM leagues WHERE id=$1", [leagueId])).rows[0];
  const receipts = async () => (await pool.query("SELECT * FROM postseason_coach_awards WHERE league_id=$1 ORDER BY team_id", [leagueId])).rows;
  const gameRows = async () => (await pool.query("SELECT id,home_team_id,away_team_id,home_score,away_score,is_complete FROM games WHERE league_id=$1 AND phase='super_regionals' ORDER BY id", [leagueId])).rows;
  const beforeGames = await gameRows();
  await pool.query(`CREATE FUNCTION reject_advance_game_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id = 'advance-sr-award-retry'
        AND COALESCE((NEW.checkpoints->'game_simulation'->>'pct')::integer,0) = 100
        AND COALESCE((OLD.checkpoints->'game_simulation'->>'pct')::integer,0) < 100 THEN
        RAISE EXCEPTION 'synthetic required checkpoint failure';
      END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER reject_advance_game_checkpoint BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION reject_advance_game_checkpoint()");
  try {
    const failedCheckpoint = await invoke(`/api/leagues/${leagueId}/advance`, "POST", {});
    equal(failedCheckpoint.response.status, 500, "Actual advance fails when its required game-completion checkpoint cannot persist");
    equal(failedCheckpoint.data, { message: "Failed to advance week" }, "Checkpoint failure response exposes no database or trigger details");
    equal(await phase(), { current_phase: "super_regionals", current_week: 10 }, "Checkpoint failure retains the previous phase and week");
    equal(await gameRows(), beforeGames, "Rejected checkpoint does not rewrite completed bracket input");
    equal(await receipts(), [], "Game-stage checkpoint failure stops the engine before any postseason award");
    equal(await count("SELECT count(*) FROM games WHERE league_id=$1 AND phase='cws'", [leagueId]), 0, "Rejected checkpoint prevents downstream CWS bracket creation");
    const checkpointOps = (await pool.query("SELECT status,checkpoints FROM league_advances WHERE league_id=$1", [leagueId])).rows;
    equal(checkpointOps.length, 1, "Checkpoint fault creates one actual operation record");
    equal(checkpointOps[0].status, "failed", "Checkpoint write failure durably marks the operation failed before responding");
    equal(checkpointOps[0].checkpoints.game_simulation?.pct, 10, "Rejected completion leaves the actual prior game-stage checkpoint intact");
    equal(checkpointOps[0].checkpoints.phase_transition?.pct === 100, false, "Checkpoint fault cannot claim phase-transition completion");
    equal(await count("SELECT count(*) FROM league_advance_locks WHERE league_id=$1", [leagueId]), 0, "Checkpoint failure releases its actual owned lease");
  } finally {
    await pool.query("DROP TRIGGER reject_advance_game_checkpoint ON league_advances");
    await pool.query("DROP FUNCTION reject_advance_game_checkpoint()");
  }
  await pool.query(`CREATE FUNCTION reject_second_advance_award() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id = 'advance-sr-award-retry' AND EXISTS (SELECT 1 FROM postseason_coach_awards WHERE league_id=NEW.league_id) THEN
        RAISE EXCEPTION 'synthetic second advance award failure';
      END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER reject_second_advance_award BEFORE INSERT ON postseason_coach_awards FOR EACH ROW EXECUTE FUNCTION reject_second_advance_award()");
  let firstReceipt: any;
  try {
    const failed = await invoke(`/api/leagues/${leagueId}/advance`, "POST", {});
    equal(failed.response.status, 500, "Actual advance fails when its second required postseason receipt cannot persist");
    equal(failed.data, { message: "Failed to advance week" }, "Required award failure returns no internal trigger or database detail");
    equal(await phase(), { current_phase: "super_regionals", current_week: 10 }, "Failed required award retains the previous phase and week");
    equal(await gameRows(), beforeGames, "Required award failure does not rewrite the completed external bracket input");
    const partial = await receipts();
    equal(partial.length, 1, "First milestone remains durably committed while second rolls back");
    firstReceipt = partial[0];
    equal([firstReceipt.milestone, firstReceipt.xp_delta, firstReceipt.milestone_delta], ["cws_appearance", 300, 1], "Partially completed advance holds a real appearance contribution");
    const coaches = (await pool.query("SELECT xp,cws_appearances FROM coaches WHERE league_id=$1 ORDER BY xp DESC", [leagueId])).rows;
    equal(coaches, [{ xp: 400, cws_appearances: 1 }, ...Array.from({ length: 7 }, () => ({ xp: 100, cws_appearances: 0 }))], "Failure preserves first coach reward and rolls back every field of the failed reward");
    // Terminal operation status must already be durable when HTTP responds.
    // These are engine-written checkpoints, never synthetic recovery rows.
    const ops = (await pool.query("SELECT status,checkpoints FROM league_advances WHERE league_id=$1 ORDER BY created_at DESC", [leagueId])).rows;
    equal(ops.length, 2, "Award attempt creates its own operation after the earlier failed checkpoint attempt");
    equal(ops[0].status, "failed", "Required milestone failure records failed operation status");
    equal(ops[0].checkpoints.game_simulation?.pct, 100, "Real engine completed its game stage before reaching the injected milestone failure");
    equal(ops[0].checkpoints.phase_transition?.pct === 100, false, "Required award failure never certifies the phase transition complete");
    equal(await count("SELECT count(*) FROM league_advance_locks WHERE league_id=$1", [leagueId]), 0, "Failed request releases its actual advance lease");
    equal(await count("SELECT count(*) FROM games WHERE league_id=$1 AND phase='cws'", [leagueId]), 4, "First attempt created exactly four CWS opening fixtures before award failure");
  } finally {
    await pool.query("DROP TRIGGER reject_second_advance_award ON postseason_coach_awards");
    await pool.query("DROP FUNCTION reject_second_advance_award()");
  }
  await restart();
  const retried = await invoke(`/api/leagues/${leagueId}/advance`, "POST", {});
  equal(retried.response.status, 200, "A fresh server process retries the real interrupted postseason advance successfully");
  equal(await phase(), { current_phase: "cws", current_week: 11 }, "Recovered advance transitions exactly one week to CWS");
  equal(await gameRows(), beforeGames, "Restart retry preserves all completed Super Regional games");
  const recovered = await receipts();
  equal(recovered.length, 8, "All eight CWS appearances have durable receipts after retry");
  equal(recovered.find(row => row.id === firstReceipt.id), firstReceipt, "First receipt is unchanged across the actual advance retry and process restart");
  equal(recovered.map(row => row.team_id), Array.from({ length: 8 }, (_, i) => teamId(i + 1)), "Venue-reversed G2 winners receive the eight appearance awards");
  equal((await pool.query("SELECT xp,cws_appearances FROM coaches WHERE league_id=$1 ORDER BY id", [leagueId])).rows, Array.from({ length: 8 }, () => ({ xp: 400, cws_appearances: 1 })), "Every qualifying coach receives exactly one appearance and 300 XP");
  equal(await count("SELECT count(*) FROM games WHERE league_id=$1 AND phase='cws'", [leagueId]), 4, "Retry does not duplicate CWS opening fixtures");
  equal((await pool.query("SELECT status FROM league_advances WHERE league_id=$1 ORDER BY created_at", [leagueId])).rows.map(row => row.status), ["failed", "failed", "complete"], "Real operation history retains checkpoint failure, award failure and completed retry");
  const complete = (await pool.query("SELECT checkpoints FROM league_advances WHERE league_id=$1 AND status='complete'", [leagueId])).rows[0];
  equal(complete.checkpoints.phase_transition?.pct, 100, "Only successful recovered advance records the completed transition checkpoint");
  equal(await count("SELECT count(*) FROM league_advance_locks WHERE league_id=$1", [leagueId]), 0, "Successful retry releases its advance lease");
}
