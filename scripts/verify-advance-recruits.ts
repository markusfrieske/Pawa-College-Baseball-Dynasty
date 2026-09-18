import type pg from "pg";

/** Populated recruiting journeys through the real authenticated advance engine. */
export async function verifyAdvanceRecruits(context: {
  pool: pg.Pool; primaryId: string;
  equal: (actual: unknown, expected: unknown, label: string) => void;
  invoke: (route: string, method?: string, body?: unknown) => Promise<any>;
  snapshot: () => Promise<unknown>;
}) {
  const { pool, primaryId, equal, invoke } = context;
  const seed = async (id: string, mode: string, offseason=false) => {
    await pool.query("INSERT INTO leagues(id,name,commissioner_id,game_mode,current_phase,current_week,is_test_data,email_digests_enabled,season_length) VALUES($1,'Recruit stage fixture',$2,$3,$4,$5,true,false,'standard')", [id,primaryId,mode,offseason?"offseason_recruiting_1":"regular_season",offseason?6:1]);
    for (const side of ["home","away"]) {
      const team=id+"-"+side, coach=team+"-coach";
      await pool.query("INSERT INTO teams(id,league_id,name,mascot,abbreviation,city,state,is_cpu,prestige,college_life,nil_budget,nil_recruiting_alloc,nil_spent,nil_recruiting_spent) VALUES($1,$2,$3,'Owls','RCT','Test','IA',false,$4,$4,1000,1000,50,10)", [team,id,side,side==="home"?9:5]);
      await pool.query("INSERT INTO coaches(id,team_id,league_id,first_name,last_name,is_ready,scout_actions_used,recruit_actions_used,xp) VALUES($1,$2,$3,'Recruit',$4,true,3,4,137)", [coach,team,id,side]);
      await pool.query("UPDATE teams SET coach_id=$1 WHERE id=$2",[coach,team]);
    }
    for (const kind of ["buzz","sign","story"]) {
      await pool.query("INSERT INTO recruits(id,league_id,first_name,last_name,position,home_state,hometown,class_rank,position_rank,stage,signed_team_id,nil_cost) VALUES($1,$2,'Synthetic',$3,'CF','IA','Test',1,1,$4,$5,$6)",
        [id+"-"+kind,id,kind,kind==="sign"?"verbal":kind==="story"?"signed":"open",kind==="story"?id+"-home":null,kind==="sign"?123:0]);
      if(kind!=="story") await pool.query("INSERT INTO recruiting_interests(id,recruit_id,team_id,interest_level,has_offer) VALUES($1,$2,$3,$4,$5)",
        [id+"-interest-"+kind,id+"-"+kind,id+"-home",kind==="sign"?95:40,kind==="sign"]);
    }
    // A valid, already initialized storyline with a future slot avoids random
    // self-healing of the recruiting pool during this stage-isolation fixture.
    await pool.query("INSERT INTO storyline_recruits(id,league_id,recruit_id,season,archetype,tier,hidden_vars,story_slot) VALUES($1,$2,$3,1,'late_bloomer','standard','{}',9)",[id+"-storyline",id,id+"-story"]);
  };
  const data = async (id: string) => ({
    recruits:(await pool.query("SELECT to_jsonb(r) AS row FROM recruits r WHERE league_id=$1 ORDER BY id",[id])).rows,
    interests:(await pool.query("SELECT to_jsonb(i) AS row FROM recruiting_interests i JOIN recruits r ON r.id=i.recruit_id WHERE r.league_id=$1 ORDER BY i.id",[id])).rows,
    nil:(await pool.query("SELECT id,nil_budget,nil_recruiting_alloc,nil_spent,nil_recruiting_spent FROM teams WHERE league_id=$1 ORDER BY id",[id])).rows,
    events:(await pool.query("SELECT to_jsonb(e) AS row FROM league_events e WHERE league_id=$1 ORDER BY id",[id])).rows,
  });
  const phase = async (id: string) => (await pool.query("SELECT current_phase,current_week,current_season FROM leagues WHERE id=$1",[id])).rows[0];
  const operations = async (id: string) => (await pool.query("SELECT * FROM league_advances WHERE league_id=$1 ORDER BY created_at,id",[id])).rows;
  const advance = (id: string) => invoke("/api/leagues/"+id+"/advance","POST",{});
  const assertProgress = async (id: string, buzz=42) => {
    equal((await pool.query("SELECT stage,signed_team_id FROM recruits WHERE id=$1",[id+"-buzz"])).rows[0],{stage:"top5",signed_team_id:null},id+": ordinary recruit advances stage");
    equal((await pool.query("SELECT interest_level FROM recruiting_interests WHERE id=$1",[id+"-interest-buzz"])).rows[0].interest_level,buzz,id+": weekly brand buzz applies exactly the expected number of times");
    equal((await pool.query("SELECT stage,signed_team_id FROM recruits WHERE id=$1",[id+"-sign"])).rows[0],{stage:"signed",signed_team_id:id+"-home"},id+": eligible verbal recruit signs");
    equal((await pool.query("SELECT nil_spent,nil_recruiting_spent FROM teams WHERE id=$1",[id+"-home"])).rows[0],{nil_spent:173,nil_recruiting_spent:133},id+": signing charges both NIL counters exactly once");
  };
  await seed("recruits-foreign","reported"); const foreign=await data("recruits-foreign");
  for(const mode of ["reported","simulated"]){
    const id="recruits-success-"+mode; await seed(id,mode);
    equal(Number((await pool.query("SELECT count(*) FROM games WHERE league_id=$1",[id])).rows[0].count),0,mode+": no-games fixture still contains real recruiting work");
    equal((await advance(id)).response.status,200,mode+": populated recruiting advance succeeds");
    await assertProgress(id);
    equal((await operations(id))[0].checkpoints.recruit_stages.pct,100,mode+": committed recruiting writes include their checkpoint");
    equal((await phase(id)).current_week,2,mode+": populated advance reaches next week");
  }

  await pool.query(`CREATE FUNCTION recruits_fail_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN IF NEW.league_id LIKE 'recruits-rollback-%' AND NEW.checkpoints->'recruit_stages'->>'pct'='100'
      THEN RAISE EXCEPTION 'synthetic recruiting checkpoint failure'; END IF; RETURN NEW; END $fixture$`);
  await pool.query("CREATE TRIGGER recruits_fail_checkpoint BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION recruits_fail_checkpoint()");
  try {
    for(const mode of ["reported","simulated"]){
      const id="recruits-rollback-"+mode; await seed(id,mode); const before=await data(id);
      equal((await advance(id)).response.status,500,mode+": recruiting checkpoint failure propagates");
      equal(await data(id),before,mode+": rejected checkpoint rolls back recruits, interest, NIL and events together");
      equal((await operations(id))[0].checkpoints.recruit_stages,undefined,mode+": rolled-back stage has no checkpoint evidence");
      equal((await phase(id)).current_week,1,mode+": rejected recruiting stage leaves calendar unchanged");
    }
  } finally {
    await pool.query("DROP TRIGGER recruits_fail_checkpoint ON league_advances");
    await pool.query("DROP FUNCTION recruits_fail_checkpoint()");
  }
  for(const mode of ["reported","simulated"]){
    const id="recruits-rollback-"+mode;
    equal((await advance(id)).response.status,200,mode+": failed recruiting stage can retry");
    await assertProgress(id);
    equal((await operations(id)).map(row=>row.status),["failed","complete"],mode+": retry keeps failed predecessor and completes successor");
  }

  await pool.query(`CREATE FUNCTION recruits_fail_reset() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN IF NEW.league_id LIKE 'recruits-inherited-%' AND NEW.checkpoints->'reset_actions'->>'pct'='100'
      THEN RAISE EXCEPTION 'synthetic reset checkpoint failure'; END IF; RETURN NEW; END $fixture$`);
  await pool.query("CREATE TRIGGER recruits_fail_reset BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION recruits_fail_reset()");
  const committed=new Map<string,unknown>();
  try {
    for(const mode of ["reported","simulated"]){
      const id="recruits-inherited-"+mode; await seed(id,mode);
      equal((await advance(id)).response.status,500,mode+": later reset failure interrupts after recruiting commit");
      await assertProgress(id);
      equal((await operations(id))[0].checkpoints.recruit_stages.pct,100,mode+": interrupted operation retains recruiting evidence");
      await pool.query("UPDATE recruiting_interests SET interest_level=47 WHERE id=$1",[id+"-interest-buzz"]);
      await pool.query("UPDATE recruits SET stage='top3' WHERE id=$1",[id+"-buzz"]);
      committed.set(id,await data(id));
    }
  } finally {
    await pool.query("DROP TRIGGER recruits_fail_reset ON league_advances");
    await pool.query("DROP FUNCTION recruits_fail_reset()");
  }
  for(const mode of ["reported","simulated"]){
    const id="recruits-inherited-"+mode;
    equal((await advance(id)).response.status,200,mode+": inherited recruiting checkpoint permits recovery");
    const after=await data(id), expected=committed.get(id) as Awaited<ReturnType<typeof data>>;
    equal({recruits:after.recruits,interests:after.interests,nil:after.nil},{recruits:expected.recruits,interests:expected.interests,nil:expected.nil},mode+": retry does not rebuzz, recharge NIL or overwrite subsequent recruit edits");
    equal((await phase(id)).current_week,2,mode+": recovered advance moves calendar exactly once");
  }

  // The offseason's second progression call has independent evidence: rollback
  // only that pass, then resume without repeating the already committed pass.
  await pool.query(`CREATE FUNCTION recruits_fail_offseason() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN IF NEW.league_id='recruits-offseason' AND NEW.checkpoints->'offseason_recruit_stages'->>'pct'='100'
      THEN RAISE EXCEPTION 'synthetic offseason recruiting checkpoint failure'; END IF; RETURN NEW; END $fixture$`);
  await pool.query("CREATE TRIGGER recruits_fail_offseason BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION recruits_fail_offseason()");
  await seed("recruits-offseason","reported",true);
  try {
    equal((await advance("recruits-offseason")).response.status,500,"Second offseason recruit checkpoint failure propagates");
    await assertProgress("recruits-offseason",42);
    const op=(await operations("recruits-offseason"))[0];
    equal(op.checkpoints.recruit_stages.pct,100,"Offseason first pass remains committed");
    equal(op.checkpoints.offseason_recruit_stages,undefined,"Offseason rolled-back second pass has no false checkpoint");
    equal((await phase("recruits-offseason")).current_phase,"offseason_recruiting_1","Failed offseason second pass leaves phase unchanged");
  } finally {
    await pool.query("DROP TRIGGER recruits_fail_offseason ON league_advances");
    await pool.query("DROP FUNCTION recruits_fail_offseason()");
  }
  equal((await advance("recruits-offseason")).response.status,200,"Offseason second pass retries successfully");
  await assertProgress("recruits-offseason",44);
  equal((await operations("recruits-offseason"))[1].checkpoints.offseason_recruit_stages.pct,100,"Recovered offseason second pass commits its own evidence");
  equal((await phase("recruits-offseason")).current_phase,"offseason_recruiting_2","Offseason recovery advances phase once");

  const id="recruits-live-takeover"; await seed(id,"reported");
  const original=await data(id), originalPhase=await phase(id);
  const barrier=await pool.connect(), lockClass=190010;
  let first:Promise<any>|undefined,second:Promise<any>|undefined;
  const waitFor=async(object:number)=>{
    for(let attempt=0;attempt<200;attempt++){
      const rows=await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=$1 AND objid=$2 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",[lockClass,object]);
      if(rows.rowCount)return rows.rows[0].pid as number;
      await new Promise(resolve=>setTimeout(resolve,15));
    }
    throw new Error("Actual recruiting worker never reached fixture barrier "+object);
  };
  await barrier.query("SELECT pg_advisory_lock($1,1),pg_advisory_lock($1,2)",[lockClass]);
  await pool.query(`CREATE FUNCTION recruits_short_lease() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF NEW.league_id='recruits-live-takeover' AND (SELECT count(*) FROM league_advances WHERE league_id=NEW.league_id)=1
        AND NEW.checkpoints->'storylines'->>'pct'='100' AND OLD.checkpoints->'storylines' IS NULL THEN
        NEW.lease_expires_at=clock_timestamp()+interval '1500 milliseconds';
        UPDATE league_advance_locks SET lease_expires_at=NEW.lease_expires_at WHERE league_id=NEW.league_id;
      END IF;
      IF NEW.league_id='recruits-live-takeover' AND (SELECT count(*) FROM league_advances WHERE league_id=NEW.league_id)=2
        AND NEW.checkpoints->'initializing'->>'pct'='5'
        AND (OLD.checkpoints->'initializing'->>'at') IS DISTINCT FROM (NEW.checkpoints->'initializing'->>'at') THEN
        PERFORM pg_advisory_xact_lock(190010,2);
      END IF;
      RETURN NEW;
    END $fixture$`);
  await pool.query(`CREATE FUNCTION recruits_pause_write() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN IF NEW.id='recruits-live-takeover-buzz' AND (SELECT count(*) FROM league_advances WHERE league_id=NEW.league_id)=1
      THEN PERFORM pg_advisory_xact_lock(190010,1); END IF; RETURN NEW; END $fixture$`);
  await pool.query("CREATE TRIGGER recruits_short_lease BEFORE UPDATE ON league_advances FOR EACH ROW EXECUTE FUNCTION recruits_short_lease()");
  await pool.query("CREATE TRIGGER recruits_pause_write BEFORE UPDATE ON recruits FOR EACH ROW EXECUTE FUNCTION recruits_pause_write()");
  try {
    first=advance(id).then(result=>({result}),error=>({error}));
    equal(typeof await waitFor(1),"number","Observed live HTTP worker A inside recruit-update SQL");
    equal(await data(id),original,"Paused recruit transaction exposes no partial buzz, signing, NIL or event writes");
    equal((await operations(id))[0].checkpoints.recruit_stages,undefined,"Paused recruit stage has no committed evidence");
    const remaining=await pool.query("SELECT extract(epoch FROM lease_expires_at-clock_timestamp())::float AS seconds FROM league_advance_locks WHERE league_id=$1",[id]);
    equal(remaining.rows[0].seconds<2,true,"Fixture shortened original lease before recruiting transaction");
    await pool.query("SELECT pg_sleep(greatest(0,$1::float)+0.05)",[remaining.rows[0].seconds]);
    second=advance(id).then(result=>({result}),error=>({error}));
    let blocked=false;
    for(let attempt=0;attempt<100;attempt++){
      const waiting=await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO league_advance_locks%'");
      if(waiting.rowCount){blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,15));
    }
    equal(blocked,true,"Live worker B waits for A's owned recruiting transaction");
    await barrier.query("SELECT pg_advisory_unlock($1,1)",[lockClass]);
    await waitFor(2);
    equal(await data(id),original,"Expired recruiting transaction rolls back recruits, interests, NIL and events before successor runs");
    equal(await phase(id),originalPhase,"Expired recruit worker does not mutate later phase");
    const inherited=await operations(id);
    equal(inherited.map(row=>row.status),["failed","running"],"Successor takes ownership only after stale recruitment rollback");
    equal(inherited.every(row=>row.checkpoints.recruit_stages===undefined),true,"Neither operation falsely records expired recruit stage");
    await barrier.query("SELECT pg_advisory_unlock($1,2)",[lockClass]);
    equal((await first).result?.response.status,409,"Expired recruit worker returns ownership conflict");
    equal((await second).result?.response.status,200,"Live successor completes actual recruitment and advance");
    await assertProgress(id);
    equal((await operations(id)).map(row=>row.status),["failed","complete"],"Recruit takeover preserves failed predecessor and successful successor");
    equal((await operations(id))[1].checkpoints.recruit_stages.pct,100,"Successor commits recruiting checkpoint with its writes");
    equal((await phase(id)).current_week,2,"Overlapping recruiting advances move the calendar once");
  } finally {
    await barrier.query("SELECT pg_advisory_unlock_all()"); barrier.release();
    await Promise.allSettled([first,second].filter(Boolean) as Promise<any>[]);
    await pool.query("DROP TRIGGER recruits_pause_write ON recruits");
    await pool.query("DROP TRIGGER recruits_short_lease ON league_advances");
    await pool.query("DROP FUNCTION recruits_pause_write()");
    await pool.query("DROP FUNCTION recruits_short_lease()");
  }
  equal(await data("recruits-foreign"),foreign,"All recruiting journeys preserve populated foreign league data");
}
