import type pg from "pg";

/** Authenticated engine journeys, including two overlapping live HTTP requests. */
export async function verifyAdvanceReset(context: {
  pool: pg.Pool; primaryId: string;
  equal: (actual: unknown, expected: unknown, label: string) => void;
  invoke: (route: string, method?: string, body?: unknown) => Promise<any>;
  snapshot: () => Promise<unknown>;
}) {
  const { pool, primaryId, equal, invoke, snapshot } = context;
  const seed = async (id: string, mode: string) => {
    await pool.query("INSERT INTO leagues(id,name,commissioner_id,game_mode,current_phase,current_week,is_test_data,email_digests_enabled) VALUES($1,'Reset stage fixture',$2,$3,'regular_season',1,true,false)", [id,primaryId,mode]);
    for (const side of ["home","away"]) {
      const team=id+"-"+side, coach=team+"-coach";
      await pool.query("INSERT INTO teams(id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES($1,$2,$3,'Owls','RST','Test','IA',false)", [team,id,side]);
      await pool.query("INSERT INTO coaches(id,team_id,league_id,first_name,last_name,is_ready,scout_actions_used,recruit_actions_used,xp) VALUES($1,$2,$3,'Reset',$4,true,3,4,137)", [coach,team,id,side]);
      await pool.query("UPDATE teams SET coach_id=$1 WHERE id=$2", [coach,team]);
    }
  };
  const coaches = async (id: string) => (await pool.query("SELECT id,scout_actions_used,recruit_actions_used,is_ready,xp FROM coaches WHERE league_id=$1 ORDER BY id", [id])).rows;
  const phase = async (id: string) => (await pool.query("SELECT current_phase,current_week,current_season FROM leagues WHERE id=$1", [id])).rows[0];
  const operations = async (id: string) => (await pool.query("SELECT * FROM league_advances WHERE league_id=$1 ORDER BY created_at,id", [id])).rows;
  const advance = (id: string) => invoke("/api/leagues/"+id+"/advance","POST",{});

  await seed("reset-foreign","reported"); const foreign = await coaches("reset-foreign");
  for (const mode of ["reported","simulated"]) {
    const id="reset-success-"+mode; await seed(id,mode);
    equal((await advance(id)).response.status,200,mode+": actual regular-season advance commits reset");
    equal((await coaches(id)).map(row=>[row.scout_actions_used,row.recruit_actions_used,row.is_ready,row.xp]),[[0,0,false,137],[0,0,false,137]],mode+": reset is scoped and preserves XP");
    equal((await operations(id))[0].checkpoints.reset_actions.pct,100,mode+": actual owned engine records reset checkpoint");
    equal((await phase(id)).current_week,2,mode+": normal advance reaches next week");
  }

  // Reset commits, then later work fails: inherited reset must not re-run the
  // readiness gate, deadline auto-ready or reset newly spent coach actions.
  await pool.query(`CREATE FUNCTION fail_after_reset() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id LIKE 'reset-retry-%' AND NEW.checkpoints->'game_simulation'->>'pct'='10'
        THEN RAISE EXCEPTION 'synthetic failure after committed reset'; END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER fail_after_reset BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION fail_after_reset()");
  try {
    for (const mode of ["reported","simulated"]) {
      const id="reset-retry-"+mode; await seed(id,mode);
      if (mode==="reported") await pool.query("UPDATE leagues SET phase_deadline=now()-interval '1 minute' WHERE id=$1",[id]);
      equal((await advance(id)).response.status,500,mode+": actual later checkpoint failure propagates");
      equal((await operations(id))[0].checkpoints.reset_actions.pct,100,mode+": failed operation preserves committed reset evidence");
      equal((await coaches(id)).every(row=>row.is_ready===false),true,mode+": committed reset consumed prior readiness");
      equal((await phase(id)).current_week,1,mode+": later failure did not advance calendar");
      await pool.query("UPDATE coaches SET scout_actions_used=2,recruit_actions_used=1 WHERE league_id=$1",[id]);
      const beforeForce=await snapshot();
      const forced=await invoke("/api/leagues/"+id+"/force-advance","POST",{});
      equal(forced.response.status,409,mode+": force advance cannot rewrite interrupted readiness or CPU-fill");
      equal(/normal Advance/.test(forced.data.message),true,mode+": force recovery refusal gives an actionable resume path");
      equal(await snapshot(),beforeForce,mode+": rejected force resume changes no table");
    }
  } finally {
    await pool.query("DROP TRIGGER fail_after_reset ON league_advances");
    await pool.query("DROP FUNCTION fail_after_reset()");
  }
  for (const mode of ["reported","simulated"]) {
    const id="reset-retry-"+mode;
    equal((await advance(id)).response.status,200,mode+": inherited reset permits recovery without re-readiness");
    equal((await coaches(id)).map(row=>[row.scout_actions_used,row.recruit_actions_used,row.is_ready,row.xp]),[[2,1,false,137],[2,1,false,137]],mode+": retry preserves new actions and does not auto-ready coaches again");
    equal((await operations(id)).map(row=>row.status),["failed","complete"],mode+": retry retains predecessor and completes successor");
    equal((await phase(id)).current_week,2,mode+": recovered calendar advances exactly once");
  }

  const id="reset-live-takeover"; await seed(id,"reported");
  const originalCoaches=await coaches(id), originalPhase=await phase(id);
  const barrier=await pool.connect(), lockClass=190009;
  let first: Promise<any>|undefined, second: Promise<any>|undefined;
  const waitFor = async (object: number) => {
    for (let attempt=0;attempt<200;attempt++) {
      const rows=await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=$1 AND objid=$2 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",[lockClass,object]);
      if (rows.rowCount) return rows.rows[0].pid as number;
      await new Promise(resolve=>setTimeout(resolve,15));
    }
    throw new Error("Actual reset worker never reached fixture barrier "+object);
  };
  await barrier.query("SELECT pg_advisory_lock($1,1),pg_advisory_lock($1,2)",[lockClass]);
  await pool.query(`CREATE FUNCTION reset_short_lease() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id='reset-live-takeover' AND (SELECT count(*) FROM league_advances WHERE league_id=NEW.league_id)=1
        AND NEW.checkpoints->'recruit_stages'->>'pct'='100' AND OLD.checkpoints->'recruit_stages' IS NULL THEN
        NEW.lease_expires_at=clock_timestamp()+interval '1500 milliseconds';
        UPDATE league_advance_locks SET lease_expires_at=NEW.lease_expires_at WHERE league_id=NEW.league_id;
      END IF;
      IF NEW.league_id='reset-live-takeover' AND (SELECT count(*) FROM league_advances WHERE league_id=NEW.league_id)=2
        AND NEW.checkpoints->'initializing'->>'pct'='5'
        AND (OLD.checkpoints->'initializing'->>'at') IS DISTINCT FROM (NEW.checkpoints->'initializing'->>'at') THEN
        PERFORM pg_advisory_xact_lock(190009,2);
      END IF;
      RETURN NEW;
    END $fixture$`);
  // The successor initialization timestamp distinguishes its first checkpoint
  // from the inherited predecessor's initializing stage.
  await pool.query(`CREATE FUNCTION reset_pause_coach() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id='reset-live-takeover' AND (SELECT count(*) FROM league_advances WHERE league_id=NEW.league_id)=1
        THEN PERFORM pg_advisory_xact_lock(190009,1); END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query("CREATE TRIGGER reset_short_lease BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION reset_short_lease()");
  await pool.query("CREATE TRIGGER reset_pause_coach BEFORE UPDATE ON coaches FOR EACH ROW EXECUTE FUNCTION reset_pause_coach()");
  try {
    first=advance(id).then(result=>({result}),error=>({error}));
    equal(typeof await waitFor(1),"number","Observed real HTTP worker A blocked inside coach-reset SQL");
    const initialOps=await operations(id);
    equal(initialOps.length,1,"Paused worker owns exactly one actual operation");
    equal(initialOps[0].checkpoints.reset_actions,undefined,"Paused reset has no committed stage evidence");
    equal(await coaches(id),originalCoaches,"Uncommitted coach reset remains invisible");
    const remaining=await pool.query("SELECT extract(epoch FROM lease_expires_at-clock_timestamp())::float AS seconds FROM league_advance_locks WHERE league_id=$1",[id]);
    equal(remaining.rows[0].seconds < 2,true,"Fixture shortened original lease before reset entered its transaction");
    await pool.query("SELECT pg_sleep(greatest(0,$1::float)+0.05)",[remaining.rows[0].seconds]);
    second=advance(id).then(result=>({result}),error=>({error}));
    // Observe successor blocked on the lease row held by A, not a timing guess.
    let blocked=false;
    for(let attempt=0;attempt<100;attempt++){
      const waiting=await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO league_advance_locks%'");
      if(waiting.rowCount){blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,15));
    }
    equal(blocked,true,"Live HTTP worker B waits behind A's stage transaction");
    await barrier.query("SELECT pg_advisory_unlock($1,1)",[lockClass]);
    await waitFor(2);
    equal(await coaches(id),originalCoaches,"Expired stage rolls back every coach field before B begins gameplay");
    equal(await phase(id),originalPhase,"Expired worker performs no later phase mutation");
    const inherited=await operations(id);
    equal(inherited.map(row=>row.status),["failed","running"],"Successor takes over after old transaction rolls back");
    equal(inherited.every(row=>row.checkpoints.reset_actions===undefined),true,"Neither operation falsely claims rolled-back reset");
    await barrier.query("SELECT pg_advisory_unlock($1,2)",[lockClass]);
    const a=await first;
    equal(a.result?.response.status,409,"Expired worker A returns ownership conflict, not success");
    const b=await second;
    equal(b.result?.response.status,200,"Live successor completes the actual reset and advance");
    equal((await coaches(id)).map(row=>[row.scout_actions_used,row.recruit_actions_used,row.is_ready,row.xp]),[[0,0,false,137],[0,0,false,137]],"Only successor commits coach resets");
    equal((await operations(id)).map(row=>row.status),["failed","complete"],"Old worker remains failed and successor complete");
    equal((await operations(id))[1].checkpoints.reset_actions.pct,100,"Successor records its atomic reset evidence");
    equal((await phase(id)).current_week,2,"Overlapping live advances move the calendar once");
  } finally {
    await barrier.query("SELECT pg_advisory_unlock_all()");
    barrier.release();
    await Promise.allSettled([first,second].filter(Boolean) as Promise<any>[]);
    await pool.query("DROP TRIGGER reset_pause_coach ON coaches");
    await pool.query("DROP TRIGGER reset_short_lease ON league_advances");
    await pool.query("DROP FUNCTION reset_pause_coach()");
    await pool.query("DROP FUNCTION reset_short_lease()");
  }
  equal(await coaches("reset-foreign"),foreign,"All actual reset journeys preserve foreign league coach data");
}
