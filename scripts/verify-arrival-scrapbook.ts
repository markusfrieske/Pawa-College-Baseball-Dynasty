/** Built recruiting/reporting UI + real route/storage contract in an owned disposable database.
 * Authentication is injected into test-only sessions; login itself is not tested. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import session from "express-session";
import pg from "pg";
import { chromium, expect } from "@playwright/test";

const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "Explicit PAWA_TEST_DATABASE_URL required");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol) && !target.search);
assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname));
const name = "pawa_test_scrapbook_" + randomUUID().replaceAll("-", "");
const url = new URL(connection); url.pathname = "/" + name;
const admin = new pg.Pool({ connectionString: connection });
let created = false, pool: pg.Pool | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const app = express(), server = createServer(app);
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  const exit = await new Promise<number | null>((resolve,reject) => {
    const child = spawn(process.execPath,["--import","tsx","scripts/bootstrap-test-db.ts"], {windowsHide:true,stdio:"ignore",env:{...process.env,PAWA_TEST_DATABASE_URL:url.toString()}});
    const timeout = setTimeout(()=>{child.kill();reject(new Error("Bootstrap timeout"));},60000);
    child.once("error",error=>{clearTimeout(timeout);reject(error);});
    child.once("exit",code=>{clearTimeout(timeout);resolve(code);});
  });
  check(exit === 0, "Fresh numbered database bootstrap");
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = randomUUID()+randomUUID();
  process.env.OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "local-test-disabled";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "http://127.0.0.1:1";
  ({pool} = await import("../server/db"));
  const {registerRoutes} = await import("../server/routes");
  const {invalidateLeague} = await import("../server/cache");
  const roles = ["commissioner","co","member","opponent","outsider"];
  for (const role of roles) await pool.query("INSERT INTO users(id,email,password) VALUES($1,$2,'synthetic-no-login')",[role,role+"@example.test"]);
  await pool.query("INSERT INTO leagues(id,name,commissioner_id,co_commissioner_ids,current_phase,current_week,current_season,progression_enabled,is_test_data,email_digests_enabled) VALUES('roster-context','Roster context','commissioner','[\"co\"]','offseason_departures',8,7,true,true,false),('foreign','Other league','outsider','[]','regular_season',1,1,false,true,false)");
  for (const role of roles) {
    const league = role === "outsider" ? "foreign" : "roster-context";
    await pool.query("INSERT INTO teams(id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES($1,$2,$3,'Owls','TST','Test','IA',false)",[role+"-team",league,role+" College"]);
    await pool.query("INSERT INTO coaches(id,user_id,team_id,league_id,first_name,last_name) VALUES($1,$2,$3,$4,'Test','Coach')",[role+"-coach",role,role+"-team",league]);
    await pool.query("INSERT INTO players(id,team_id,first_name,last_name,position,eligibility,home_state,hometown,jersey_number,overall,star_rating,power,grit,stamina,last_pitched_week,last_pitched_day,last_pitched_outs,pitching_role) VALUES($1,$2,'Test','Pitcher','SP','RS','IA','Test',12,550,4,0,NULL,60,7,'SUN',21,'SP1')",[role+"-player",role+"-team"]);
  }
  app.use(express.json());
  app.use(session({secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false}));
  app.post("/__test/session",(req,res)=>{
    if (!roles.includes(req.body.role)) {res.sendStatus(400);return;}
    req.session.userId=req.body.role;
    req.session.save(error=>error?res.sendStatus(500):res.sendStatus(204));
  });
  await registerRoutes(server,app);
  if (process.env.PAWA_WORKSPACE_REVIEW === "1") {
    app.get("/__test/review", (req, res) => {
      req.session.userId = "member";
      req.session.save(error => error ? res.sendStatus(500) : res.redirect("/league/roster-context/signing-day-reveal?season=1"));
    });
    app.get("/__test/report-review", (req,res) => { req.session.userId="commissioner"; req.session.save(error => error ? res.sendStatus(500) : res.redirect("/league/roster-context/report-game/review-game")); });
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/") || path.extname(req.path)) return next();
      const html = fs.readFileSync(path.resolve("dist/public/index.html"), "utf8");
      res.type("html").send(html.replace('<div id="root">', '<div style="background:#d6b777;color:#10291f;text-align:center;padding:6px;font:12px system-ui">LOCAL PLAYTEST · Synthetic test league · Changes affect only this disposable database</div><div id="root">'));
    });
  }
  app.use(express.static(path.resolve("dist/public")));
  // The managed checkout may have a dot-prefixed ancestor; serve this exact built file.
  app.get("/{*path}",(_req,res)=>res.sendFile(path.resolve("dist/public/index.html"),{dotfiles:"allow"}));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address(); assert(address&&typeof address==="object");
  const origin=`http://127.0.0.1:${address.port}`;
  if(process.env.PAWA_WORKSPACE_REVIEW === "1") console.log(`C9_WORKSPACE_BOOT ${origin}/__test/review`);
  browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true});
  await pool.query("UPDATE leagues SET current_phase='regular_season', current_week=1,current_season=1,season_length='standard',dynasty_preset='custom' WHERE id='roster-context'");
  await pool.query("UPDATE coaches SET archetype='Balanced',pitching_recruiting_skill=5,hitting_recruiting_skill=5,scouting_skill=5,evaluation_skill=5,recruit_actions_used=0,scout_actions_used=0,perks='{}' WHERE id='member-coach'");
  for (let i=1;i<=30;i++) await pool.query("INSERT INTO recruits(id,league_id,first_name,last_name,position,home_state,hometown,class_rank,position_rank,potential,stage,is_blue_chip,signing_day_revealed,overall,star_rank,star_rating,nil_cost) VALUES($1,'roster-context','Ledger',$2,'SS','IA','Test',$3,$3,75,'open',false,false,300,3,3,0)",['r'+i,'Prospect'+String(i).padStart(2,'0'),i]);
  for (const team of ['member','opponent']) {
    for (let i=1;i<=9;i++) await pool.query("INSERT INTO players(id,team_id,first_name,last_name,position,home_state,hometown,jersey_number,batting_order) VALUES($1,$2,'Fixture',$3,$4,'IA','Test',$5,$5)",[team+'-h'+i,team+'-team','Hitter'+i,['C','1B','2B','3B','SS','LF','CF','RF','DH'][i-1],i]);
    await pool.query("INSERT INTO players(id,team_id,first_name,last_name,position,home_state,hometown,jersey_number) VALUES($1,$2,'Relief','Pitcher','RP','IA','Test',29)",[team+'-rp',team+'-team']);
  }
  for (const game of ['full-entry','score-only','review-game']) await pool.query("INSERT INTO games(id,league_id,season,week,home_team_id,away_team_id,phase) VALUES($1,'roster-context',1,1,'member-team','opponent-team','regular')",[game]);
  const api=origin+'/api/leagues/roster-context';

  const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  await context.request.post(origin+'/__test/session',{data:{role:'member'}});
  const get=async(route:string)=>{const r=await context.request.get(api+route);check(r.ok(),route+' HTTP '+r.status());return r.json();};
  const hidden=['overall','starRating','potential','power','control','stamina','stuff','pitchHSL','pitchCCH'];
  await pool.query("UPDATE recruits SET overall=677,star_rating=5,potential=93,power=87,control=81,stamina=79,stuff=82,pitch_hsl=7,pitch_cch=6,abilities='[\"Power Hitter\",\"Contact Hitter\"]',story_locked_abilities='[\"Power Hitter\"]',tools='[\"Power\"]' WHERE id='r1'");
  await pool.query("INSERT INTO recruiting_interests(id,recruit_id,team_id,scout_percentage,min_overall,max_overall,revealed_attributes,revealed_abilities_count) VALUES('i1','r1','member-team',0,300,800,'[]',0)");
  for(const pct of [0,25,49,50,99,100]) {
    await pool.query("UPDATE recruiting_interests SET scout_percentage=$1,revealed_attributes='[\"hitForAvg\"]' WHERE id='i1'",[pct]);invalidateLeague('roster-context');
    const list=await get('/recruiting'); const detail=(await get('/recruits/r1')).recruit;const r=list.recruits.find((r:any)=>r.id==='r1');
    for(const value of [r,detail]) {
      for(const key of hidden)check(value[key]===null,pct+' hidden '+key);
      check(value.hitForAvg===50,pct+' earned contact');check(value.abilities.length===0,pct+' undisclosed specials');check(value.storyLockedAbilities.length===0,pct+' hidden story abilities');check(value.tools.length===0,pct+' hidden tools');
      check(value.starRank===3,pct+' public ranking retained');
      check(value.clutch===(pct>=49?50:null),pct+' common order reveal without core interest keys');
      if(pct<100)check(value.potentialFloor===null&&value.potentialCeiling===null,pct+' potential range withheld');
      check(value.signingDayLockedFields.includes('arm'),pct+' arrival holdback preserved');
    }
  }

  await pool.query("UPDATE recruits SET position='SP',pitch_hsl=7,pitch_cch=6,pitch_spl=5,velocity=88,scouting_order='[\"pitchHSL\",\"pitchCCH\",\"velocity\"]',abilities='[\"Power Hitter\",\"Contact Hitter\"]' WHERE id='r3'");
  await pool.query("INSERT INTO recruiting_interests(id,recruit_id,team_id,scout_percentage,revealed_attributes,revealed_abilities_count) VALUES('i3','r3','member-team',0,'[\"velocity\"]',1)");
  for(const pct of [0,25,49,50,99,100]) {
    await pool.query("UPDATE recruiting_interests SET scout_percentage=$1 WHERE id='i3'",[pct]);invalidateLeague('roster-context');
    const r=(await get('/recruits/r3')).recruit;
    check(r.pitchHSL===(pct===0?null:pct<50?1:7),'Pitch HSL type/strength threshold '+pct);
    check(r.pitchCCH===(pct===0?null:pct<50?1:6),'Pitch CCH type/strength threshold '+pct);
    check(r.pitchSPL===null,'Legacy SPL remains arrival only '+pct);
    check(r.abilities.length===1,'Only earned special count '+pct);
    check(r.velocity===88,'Earned pitcher core '+pct);
  }
  await pool.query("UPDATE recruits SET is_blue_chip=true,overall=788,potential=99 WHERE id='r4'");invalidateLeague('roster-context');
  const blue=(await get('/recruits/r4')).recruit;check(blue.overall===788&&blue.potential===99&&blue.signingDayLockedFields.length===0,'Existing blue-chip full-disclosure exception');
  await pool.query("UPDATE recruits SET is_generational_gem=true WHERE id='r3'");invalidateLeague('roster-context');
  const gem=(await get('/recruits/r3')).recruit;check(gem.signingDayLockedFields.length>0&&gem.overall===null&&gem.isGenerationalGem===null,'Hidden gem uses normal locks and does not disclose exact overall or flag');
  await pool.query("UPDATE recruits SET stage='verbal',overall=644,potential=92 WHERE id='r5'");
  await pool.query("INSERT INTO recruiting_interests(id,recruit_id,team_id,interest_level,has_offer,scout_percentage) VALUES('i5','r5','member-team',1000,true,0)");invalidateLeague('roster-context');
  const signed=await context.request.post(api+'/recruiting/r5/sign');check(signed.ok(),'Real manual sign '+signed.status());const signedDto=await signed.json();check(signedDto.overall===null&&signedDto.potential===null&&signedDto.power===null,'Manual sign response protected');
  // Leave the later phase tests with exactly one own recruit to complete.
  await pool.query("UPDATE recruits SET signed_team_id=NULL,stage='open' WHERE id='r5'");invalidateLeague('roster-context');
  const recs=await get('/recruiting/recommendations');const recBefore=JSON.stringify(recs);
  await pool.query("UPDATE recruits SET star_rating=5,overall=900 WHERE id='r6'");invalidateLeague('roster-context');check(JSON.stringify(await get('/recruiting/recommendations'))===recBefore,'Recommendations invariant under undisclosed star/OVR change');

  await pool.query("INSERT INTO storyline_recruits(id,league_id,recruit_id,season,archetype,tier,hidden_vars) VALUES('story1','roster-context','r6',1,'late_bloomer','normal','{}')");

  await pool.query("INSERT INTO storyline_events(id,league_id,storyline_recruit_id,event_text,choice_a,choice_a_outcome,choice_a_weights,choice_b,choice_b_outcome,choice_b_weights,choice_c,choice_c_outcome,choice_c_weights,archetype_at_event,template_id) VALUES('event1','roster-context','story1','Synthetic event','A','A result','{}','B','B result','{}','C','C result','{}','late_bloomer','private_template')");
  for(const route of ['/storylines','/storylines/story1','/storylines/events']) {const dto=await get(route);const body=JSON.stringify(dto);check(!body.includes('private_template')&&!body.includes('late_bloomer')&&!body.includes('choiceAWeights')&&!body.includes('hiddenVars'),'Story event metadata protected '+route);}
  for(const role of ['commissioner','co']){await context.request.post(origin+'/__test/session',{data:{role}});const dto=await get('/recruits/r6');check(dto.recruit.overall===900&&dto.recruit.power===50,'Authorized commissioner edit detail '+role);}
  await context.request.post(origin+'/__test/session',{data:{role:'member'}});
  for(const route of ['/storylines','/storylines/story1']) {const dto=await get(route);const r=dto.recruit??dto.storylines[0].recruit;check(r.overall===null&&r.potential===null&&r.power===null&&r.abilities.length===0,'Storyline payload protected '+route);}
  // True-star changes must not alter public class ranks or recommendation hints.
  await pool.query("UPDATE recruits SET signed_team_id='member-team',stage='signed' WHERE id='r1'");invalidateLeague('roster-context');
  const commits=await get('/commits');const own=commits.commitsByTeam.find((t:any)=>t.team.id==='member-team');
  check(own.commits[0].overall===null&&own.commits[0].starRating===3&&own.avgOverall===null,'Commit summary protected');
  const summary=await get('/signing-day');
  check(summary.teamSignings.find((t:any)=>t.teamId==='member-team')?.totalStars===3,'Public summary stars use public rank');
  const before=JSON.stringify(summary);
  await pool.query("UPDATE recruits SET star_rating=1,overall=211 WHERE id='r1'");invalidateLeague('roster-context');
  check(JSON.stringify(await get('/signing-day'))===before,'Public summary invariant under hidden rating changes');
  const changed=await get('/commits');check(changed.commitsByTeam.find((t:any)=>t.team.id==='member-team').classScore===own.classScore,'Class score invariant under hidden OVR');
  check((await context.request.get(api+'/signing-day-reveal')).status()===409,'Early GET blocked');
  check((await context.request.post(api+'/signing-day-reveal/complete')).status()===409,'Early completion blocked');
  check(!(await pool.query("SELECT signing_day_revealed FROM recruits WHERE id='r1'")).rows[0].signing_day_revealed,'Early attempt leaves storage unchanged');
  await pool.query("UPDATE recruits SET signed_team_id='opponent-team',stage='signed',overall=833 WHERE id='r2'");
  await pool.query("UPDATE leagues SET current_phase='offseason_signing_day' WHERE id='roster-context'");invalidateLeague('roster-context');
  let reveal=await get('/signing-day-reveal');check(reveal.teamData.find((t:any)=>t.team.id==='member-team').recruits[0].overall===211,'Authorized full arrival payload');
  check(reveal.teamData.find((t:any)=>t.team.id==='opponent-team').recruits.length===0,'Opponent unviewed class withheld');
  check((await context.request.post(api+'/signing-day-reveal/complete?teamId=opponent-team')).status()===403,'Cannot unlock opponent');

  await pool.query("CREATE FUNCTION fail_reveal_interest() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic reveal rollback'; END $$");
  await pool.query("CREATE TRIGGER fail_reveal_interest BEFORE UPDATE ON recruiting_interests FOR EACH ROW EXECUTE FUNCTION fail_reveal_interest()");
  check((await context.request.post(api+'/signing-day-reveal/complete?teamId=member-team')).status()===500,'Injected persistence failure propagates');
  check(!(await pool.query("SELECT signing_day_revealed FROM recruits WHERE id='r1'")).rows[0].signing_day_revealed,'Reveal flag rolls back with failed interest unlock');
  await pool.query("DROP TRIGGER fail_reveal_interest ON recruiting_interests");

  await pool.query("CREATE FUNCTION fail_arrival_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic archive failure'; END $$");
  await pool.query("CREATE TRIGGER fail_arrival_capture BEFORE INSERT ON arrival_records FOR EACH ROW EXECUTE FUNCTION fail_arrival_capture()");
  check((await context.request.post(api+'/signing-day-reveal/complete?teamId=member-team')).status()===500,'Capture failure propagates');
  check(!(await pool.query("SELECT signing_day_revealed FROM recruits WHERE id='r1'")).rows[0].signing_day_revealed,'Failed capture rolls back reveal flag');
  check((await pool.query("SELECT count(*)::int AS n FROM arrival_records")).rows[0].n===0,'No partial failed snapshot');
  await pool.query("DROP TRIGGER fail_arrival_capture ON arrival_records");
  const completion=await context.request.post(api+'/signing-day-reveal/complete?teamId=member-team');check(completion.ok(),'Own completion HTTP '+completion.status());check((await completion.json()).revealed===1,'One newly revealed recruit');
  check((await (await context.request.post(api+'/signing-day-reveal/complete?teamId=member-team')).json()).revealed===0,'Completion idempotent');

  const archivedBeforeConversion=(await get('/arrival-scrapbook?season=1')).teamData.find((t:any)=>t.team.id==='member-team').recruits[0];
  check(archivedBeforeConversion.rosterPlayerId===null,'No invented player link before conversion');
  check(archivedBeforeConversion.overall===211&&archivedBeforeConversion.potential===93&&archivedBeforeConversion.pitchHSL===7,'Complete original values archived');
  check((await pool.query("SELECT count(*)::int AS n FROM arrival_records WHERE source_recruit_id='r1'")).rows[0].n===1,'Repeated completion does not duplicate snapshot');
  const interest=(await pool.query("SELECT min_overall,max_overall,revealed_abilities_count FROM recruiting_interests WHERE id='i1'")).rows[0];check(interest.min_overall===211&&interest.max_overall===211&&interest.revealed_abilities_count===2,'Completion atomically unlocks ranges and counts');
  for(const route of ['/recruiting','/recruits/r1']){const v=await get(route);const r=v.recruit??v.recruits.find((r:any)=>r.id==='r1');check(r.power===87&&r.potential===93&&r.pitchHSL===7&&r.pitchCCH===6&&r.abilities.length===2,'Revealed payload preserved '+route);}
  await pool.query("UPDATE leagues SET current_phase='regular_season' WHERE id='roster-context'");invalidateLeague('roster-context');
  reveal=await get('/signing-day-reveal');check(reveal.teamData.find((t:any)=>t.team.id==='member-team').recruits[0].signingDayRevealed,'Replay permitted outside arrival phase');
  await context.request.post(origin+'/__test/session',{data:{role:'outsider'}});
  check((await context.request.get(api+'/signing-day-reveal')).status()===403,'Outsider blocked');
  check((await context.request.get(api+'/arrival-scrapbook')).status()===403,'Scrapbook rejects outsider');

  await context.request.post(origin+'/__test/session',{data:{role:'member'}});
  await pool.query("UPDATE leagues SET current_phase='offseason_signing_day' WHERE id='roster-context'");
  await pool.query("UPDATE recruits SET signing_day_revealed=false WHERE id='r1'");invalidateLeague('roster-context');
  await pool.query("UPDATE teams SET primary_color='#234734',secondary_color='#dfc58f' WHERE id='member-team'");
  for(const [id,first,last,pos,portrait] of [['r1','Eli','Price','SS','c9-face-01'],['r7','Andre','Walker','2B','c9-face-08'],['r8','Kenji','Sato','SP','c9-face-15'],['r9','Mateo','Cruz','C','c9-face-22'],['r10','Owen','Brooks','CF','c9-face-30']]) await pool.query("UPDATE recruits SET first_name=$2,last_name=$3,position=$4,portrait_id=$5,signed_team_id='member-team',stage='signed',signing_day_revealed=false WHERE id=$1",[id,first,last,pos,portrait]);invalidateLeague('roster-context');
  const page=await context.newPage();const errors:string[]=[];const badStats:string[]=[];let completions=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('career-stats'))badStats.push(r.url());if(r.method()==='POST'&&r.url().includes('signing-day-reveal/complete'))completions++;});
  await page.goto(origin+'/league/roster-context/signing-day-reveal');
  await expect(page.getByRole('button',{name:'Meet this player'}).first()).toBeDisabled();checks++;
  await expect(page.getByTestId('complete-player-card')).toHaveCount(0);checks++;
  await page.route('**/signing-day-reveal/complete?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic save unavailable'})}));
  await page.getByRole('button',{name:'Open class record',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Synthetic save unavailable');checks++;
  check(!(await pool.query("SELECT signing_day_revealed FROM recruits WHERE id='r1'")).rows[0].signing_day_revealed,'UI failed completion does not persist');
  await page.unroute('**/signing-day-reveal/complete?*');await page.getByRole('button',{name:'Retry opening class'}).click();
  await expect(page.getByRole('button',{name:'Meet this player'}).first()).toBeEnabled();checks++;
  const afterOpen=completions;
  await page.getByRole('button',{name:'Meet this player'}).first().click();await expect(page.getByTestId('complete-player-card')).toBeVisible();checks++;
  await expect(page.locator('.c9-arrival-stage')).toHaveCount(0);checks++;
  for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]) {
    await page.setViewportSize({width,height});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Arrival horizontal fit '+width);
    check(await page.locator('.c9-arrival-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),'Arrival modal inside '+width);
  }
  await page.setViewportSize({width:1366,height:768});
  await page.getByRole('button',{name:'Preview full card PNG'}).click();await expect(page.locator('.c9-arrival-export')).toBeVisible({timeout:20000});checks++;
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download PNG'}).click();const png=await download;check(png.suggestedFilename().endsWith('.png'),'Real PNG download');await png.saveAs(path.resolve('.local-db/arrival-player.png'));
  await page.getByRole('button',{name:'Close preview'}).click();await page.keyboard.press('Escape');await expect(page.locator('.c9-arrival-dialog')).not.toBeVisible();checks++;
  await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:'Replay spotlight'}).first().click();await expect(page.getByRole('button',{name:'Skip to complete profile'})).toBeVisible();checks++;
  await page.keyboard.press('Escape');await expect(page.getByTestId('complete-player-card')).toBeVisible();checks++;
  check(completions===afterOpen,'Replay/skip never mutate completion');check(badStats.length===0,'No recruit-id career statistics request');check(errors.length===0,'Arrival runtime errors: '+errors.join(';'));
  await page.screenshot({path:path.resolve('.local-db/arrival-profile.png')});await page.getByRole('button',{name:'Back to class'}).click();await page.screenshot({path:path.resolve('.local-db/arrival-gallery.png')});
  await page.getByRole('button',{name:'Preview class keepsake PNG'}).click();await expect(page.locator('.c9-arrival-export')).toBeVisible({timeout:20000});checks++;
  await page.getByRole('button',{name:'Close preview'}).click();

  // Real finalization publishes active rosters; the ceremony is optional, not a data access prerequisite.
  await context.request.post(origin+'/__test/session',{data:{role:'commissioner'}});
  await pool.query("UPDATE coaches SET is_ready=true WHERE league_id='roster-context'");invalidateLeague('roster-context');
  await pool.query("UPDATE recruits SET first_name='Same',last_name='Name',signed_team_id='member-team',stage='signed' WHERE id IN ('r11','r12')");
  if(process.env.PAWA_TEST_ARCHIVE_FAILURE==='1'){
  await pool.query("UPDATE players SET eligibility='FR' WHERE team_id='opponent-team'");
  await pool.query("CREATE FUNCTION fail_conversion_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_recruit_id='r2' THEN RAISE EXCEPTION 'synthetic conversion archive failure'; END IF; RETURN NEW; END $$");
  await pool.query("CREATE TRIGGER fail_conversion_capture BEFORE INSERT ON arrival_records FOR EACH ROW EXECUTE FUNCTION fail_conversion_capture()");
  const failedAdvance=await context.request.post(api+'/advance',{data:{},timeout:90000});check(failedAdvance.status()===500,'Archive failure stops finalization');
  const partial=(await pool.query("SELECT id,eligibility FROM players WHERE arrival_source_recruit_id='r2'")).rows[0];check(partial?.eligibility==='FR','Partial conversion retains incoming freshman');
  await pool.query("DROP TRIGGER fail_conversion_capture ON arrival_records");
  const beforeRetry=JSON.stringify((await pool.query("SELECT id,eligibility FROM players ORDER BY id")).rows);
  const retry=await context.request.post(api+'/advance',{data:{},timeout:90000});check(retry.status()===409&&(await retry.json()).recoveryRequired,'Partial finalization retry requires reconciliation');
  const shortcut=await context.request.post(api+'/advance-season',{data:{}});check(shortcut.status()===409,'Legacy season shortcut cannot bypass interrupted finalization');
  check(JSON.stringify((await pool.query("SELECT id,eligibility FROM players ORDER BY id")).rows)===beforeRetry,'Blocked retry leaves returning players and newcomers unchanged');
  console.log('Archive failure containment: '+checks+' checks passed.');
  } else {
  const advanced=await context.request.post(api+'/advance',{data:{},timeout:90000});check(advanced.ok(),'Signing Day finalization HTTP '+advanced.status()+' '+(await advanced.text()).slice(0,180));
  check((await pool.query("SELECT signing_day_revealed FROM recruits WHERE id='r2'")).rows[0].signing_day_revealed,'Converted opponent joins public arrival record');
  check((await pool.query("SELECT count(*)::int AS n FROM recruiting_class_snapshots WHERE league_id='roster-context'")).rows[0].n>0,'Class snapshots published after successful conversion');

  check((await pool.query("SELECT count(*)::int AS n FROM players WHERE arrival_source_recruit_id IN ('r11','r12')")).rows[0].n===2,'Same-name signings convert as separate identities');
  const history1=await get('/arrival-scrapbook?season=1');
  const original=history1.teamData.find((t:any)=>t.team.id==='member-team').recruits.find((r:any)=>r.id==='r1');
  check(!!original.rosterPlayerId&&original.rosterTeamId==='member-team','Conversion links correct roster ID');
  check(original.firstName==='Ledger'&&original.overall===211,'First reveal remains immutable after source edits');
  const memberRecords=history1.teamData.find((t:any)=>t.team.id==='member-team').recruits;
  check(original.arrivalTeam.primaryColor!==memberRecords.find((r:any)=>r.id==='r7').arrivalTeam.primaryColor,'Each record retains its own capture-time team colors');
  const {captureLeagueSaveState,restoreLeagueSaveState}=await import('../server/lib/leagueSaveState');
  const saveId=await captureLeagueSaveState('roster-context','manual','Archive preservation test');
  check((await pool.query("SELECT jsonb_array_length(snapshot_data->'arrivalRecords') AS n FROM league_save_states WHERE id=$1",[saveId])).rows[0].n>0,'Save snapshot contains arrival records');
  let restoreBlocked=false;try{await restoreLeagueSaveState(saveId,'roster-context');}catch(e){restoreBlocked=String(e).includes('arrival scrapbooks');}check(restoreBlocked,'History-unsafe restore explicitly blocked');
  const originalTeam=history1.teamData.find((t:any)=>t.team.id==='member-team').team;
  await pool.query("UPDATE players SET overall=999,team_id='opponent-team' WHERE id=$1",[original.rosterPlayerId]);
  await pool.query("UPDATE teams SET name='Changed College',primary_color='#ff0000' WHERE id='member-team'");
  await pool.query("UPDATE leagues SET current_season=2,current_phase='regular_season' WHERE id='roster-context'");invalidateLeague('roster-context');
  const {storage}=await import('../server/storage');await storage.deleteRecruitsByLeague('roster-context');
  const later=await get('/arrival-scrapbook?season=1');const oldTeam=later.teamData.find((t:any)=>t.team.id==='member-team');const old=oldTeam.recruits.find((r:any)=>r.id==='r1');
  check(later.recordSeason===1&&later.league.currentSeason===2,'Original season preserved across rollover');
  check(old.overall===211&&old.firstName==='Ledger'&&oldTeam.team.name===originalTeam.name&&oldTeam.team.primaryColor===originalTeam.primaryColor,'Snapshots survive source deletion, development and team rebrand');
  check(old.rosterPlayerId===original.rosterPlayerId&&old.rosterTeamId==='opponent-team','Transferred player link tracks actual same ID');
  check((await get('/arrival-scrapbook?season=2')).teamData.length===0,'No fabricated future class');
  check((await context.request.get(api+'/arrival-scrapbook?season=nope')).status()===400,'Invalid archive season rejected');
  await page.goto(origin+'/league/roster-context/signing-day-reveal');await page.getByLabel('Class season').selectOption('1');
  await expect(page.getByTestId('arrival-class-gallery')).toBeVisible();checks++;
  await page.getByLabel('Program').selectOption('member-team');await page.getByLabel('Find player').fill('Ledger Prospect01');
  await page.getByRole('button',{name:'Meet this player'}).click();await expect(page.getByTestId('complete-player-card')).toBeVisible();checks++;
  await expect(page.getByRole('link',{name:'View current roster record'})).toBeVisible();checks++;
  await page.screenshot({path:path.resolve('.local-db/scrapbook-profile.png')});
  await page.getByRole('link',{name:'View current roster record'}).click();await expect(page.getByTestId('complete-player-card')).toBeVisible();checks++;
  await expect(page.getByTestId('complete-player-card')).toContainText('999');checks++;
  await pool.query("UPDATE players SET team_id='outsider-team' WHERE id=$1",[original.rosterPlayerId]);
  const crossLeague=(await get('/arrival-scrapbook?season=1')).teamData.find((t:any)=>t.team.id==='member-team').recruits.find((r:any)=>r.id==='r1');check(crossLeague.rosterPlayerId===null,'No link across league boundary');
  await pool.query("DELETE FROM players WHERE id=$1",[original.rosterPlayerId]);
  const deleted=(await get('/arrival-scrapbook?season=1')).teamData.find((t:any)=>t.team.id==='member-team').recruits.find((r:any)=>r.id==='r1');check(deleted.rosterPlayerId===null&&deleted.overall===211,'Departed player retains original card without dead roster link');
  }
  // Retained preview opens directly into recorded Season1 while live Season2 has no fabricated class.
  await context.close();
  console.log('Scrapbook + disclosure + Arrival: '+checks+' real HTTP/PostgreSQL/browser checks passed.');
  if(process.env.PAWA_WORKSPACE_REVIEW==='1'){console.log('C9_ARRIVAL_REVIEW '+origin+'/__test/review');await new Promise<void>(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});}
} finally {
  await browser?.close();
  if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await pool?.end();
  if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}


// Finalization schedules background housekeeping; owned database/server cleanup above is complete.
process.exit(0);
