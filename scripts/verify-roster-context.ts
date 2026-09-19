/** Built roster UI + real route/storage contract in an owned disposable database.
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
const name = "pawa_test_roster_" + randomUUID().replaceAll("-", "");
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
  await pool.query("INSERT INTO player_season_stats(id,player_id,player_name,team_id,league_id,season,position,games,ab,h,hbp,cs) VALUES('card-record','member-player','Test Pitcher','member-team','roster-context',7,'P',4,10,0,9,2)");
  await pool.query("UPDATE players SET w_risp=50,pitch_sl=4,pitch_ch=7,pitch_2s=1,pitch_cb=2,pitch_ct=5,abilities=$1 WHERE id='member-player'",[JSON.stringify(['Sangfroid'])]);
  app.use(express.json());
  app.use(session({secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false}));
  app.post("/__test/session",(req,res)=>{
    if (!roles.includes(req.body.role)) {res.sendStatus(400);return;}
    req.session.userId=req.body.role;
    req.session.save(error=>error?res.sendStatus(500):res.sendStatus(204));
  });
  await registerRoutes(server,app);
  if (process.env.PAWA_ROSTER_REVIEW === "1") {
    app.get("/__test/review", (req, res) => {
      req.session.userId = "member";
      req.session.save(error => error ? res.sendStatus(500) : res.redirect("/league/roster-context/roster"));
    });
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/") || path.extname(req.path)) return next();
      const html = fs.readFileSync(path.resolve("dist/public/index.html"), "utf8");
      res.type("html").send(html.replace('<div id="root">', '<div style="position:fixed;bottom:0;right:0;z-index:10000;pointer-events:none;background:#d6b777;color:#10291f;text-align:center;padding:2px 6px;font:10px system-ui">LOCAL PLAYTEST · Synthetic test league · Changes affect only this disposable database</div><div id="root">'));
    });
  }
  app.use(express.static(path.resolve("dist/public")));
  // The managed checkout may have a dot-prefixed ancestor; serve this exact built file.
  app.get("/{*path}",(_req,res)=>res.sendFile(path.resolve("dist/public/index.html"),{dotfiles:"allow"}));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address(); assert(address&&typeof address==="object");
  const origin=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true});
  {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.request.post(origin+'/__test/session',{data:{role:'commissioner'}});
    const page=await context.newPage();await page.goto(origin+'/league/roster-context/edit-rosters');
    await page.getByTestId('tab-team-commissioner-team').click();
    await page.getByTestId('button-appearance-commissioner-player').click();
    await page.locator('#portrait-commissioner-player').selectOption('c9-face-05');
    await expect(page.locator('canvas[data-portrait-id="c9-face-05"]:visible').first()).toBeVisible();checks++;
    await page.keyboard.press('Escape');
    const saved=page.waitForResponse(r=>r.url().endsWith('/players/batch')&&r.request().method()==='PATCH');
    await page.getByTestId('button-save').click();check((await saved).ok(),'Portrait saved through commissioner UI');
    const unchanged=(await pool.query("SELECT overall,star_rating,power,grit FROM players WHERE id='commissioner-player'")).rows[0];
    check(unchanged.overall===550&&unchanged.star_rating===4&&unchanged.power===0&&unchanged.grit===null,'Portrait-only UI save preserves rating and stats');
    await pool.query("UPDATE teams SET primary_color='#bd2737' WHERE id='commissioner-team'");invalidateLeague('roster-context');
    await page.reload();await page.getByTestId('tab-team-commissioner-team').click();await page.getByTestId('button-appearance-commissioner-player').click();
    await expect(page.locator('canvas[data-portrait-id="c9-face-05"][data-team-color="#bd2737"]:visible').first()).toBeVisible();checks++;
    await expect(page.locator('#portrait-commissioner-player')).toHaveValue('c9-face-05');checks++;
    await page.locator('#portrait-commissioner-player').selectOption('legacy');await page.keyboard.press('Escape');
    const cleared=page.waitForResponse(r=>r.url().endsWith('/players/batch')&&r.request().method()==='PATCH');await page.getByTestId('button-save').click();check((await cleared).ok(),'Legacy portrait restored through UI');
    check((await pool.query("SELECT portrait_id FROM players WHERE id='commissioner-player'")).rows[0].portrait_id===null,'Null identity persisted');
    const expectedVersion=(await pool.query("SELECT coalesce(editor_version,1) AS version FROM players WHERE id='commissioner-player'")).rows[0].version;
    const edit=await context.request.patch(origin+'/api/leagues/roster-context/editor/players/commissioner-player',{data:{expectedVersion,changes:{portraitId:'c9-face-08'},reason:'Portrait identity test',idempotencyKey:randomUUID()}});
    check(edit.status()===200,'Audited editor portrait assignment');const batch=await edit.json();
    const reversed=await context.request.post(origin+'/api/leagues/roster-context/editor/batches/'+batch.batchId+'/reverse',{data:{reason:'Restore original portrait'}});check(reversed.status()===200,'Audited portrait reversal');
    const restored=(await pool.query("SELECT portrait_id,overall,star_rating FROM players WHERE id='commissioner-player'")).rows[0];check(restored.portrait_id===null&&restored.overall===550&&restored.star_rating===4,'Portrait reversal preserves ratings');
    await context.close();
  }
  for (const mode of ["simulated","reported"]) {
    await pool.query("UPDATE leagues SET game_mode=$1 WHERE id='roster-context'",[mode]); invalidateLeague("roster-context");
    // Identity saves deliberately recalculate ratings server-side. Reset only this
    // owned fixture's eligibility inputs before the independent mode rehearsal.
    await pool.query("UPDATE players SET overall=550,star_rating=4");
    for (const role of roles) {
      const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:"reduce"});
      try {
        const sessionResponse=await context.request.post(origin+"/__test/session",{data:{role}});
        check(sessionResponse.status()===204,"Test session "+role);
        const api=origin+"/api/leagues/roster-context";
        const canAssign=role==='commissioner'||role==='co';
        if(canAssign){
          const invalid=await context.request.patch(api+'/players/batch',{data:{updates:[{id:role+'-player',changes:{portraitId:'c9-face-99'}}]}});
          check(invalid.status()===400,'Unknown portrait rejected');
          const assigned=await context.request.patch(api+'/players/batch',{data:{updates:[{id:role+'-player',changes:{portraitId:'c9-face-02'}}]}});
          check(assigned.status()===200,'Commissioner portrait assignment');
          check((await pool!.query('SELECT portrait_id FROM players WHERE id=$1',[role+'-player'])).rows[0].portrait_id==='c9-face-02','Portrait persisted');
          invalidateLeague('roster-context');
        }else{
          check((await context.request.patch(api+'/players/batch',{data:{updates:[{id:role+'-player',changes:{portraitId:'c9-face-02'}}]}})).status()===403,'Noncommissioner portrait denied');
        }
        const dtoResponse=await context.request.get(api);
        if(role==="outsider") {
          check(dtoResponse.status()===403,"Outsider league denied");
          check((await context.request.get(api+"/roster?teamId=member-team")).status()===403,"Outsider roster denied");
          check((await context.request.patch(api+"/players/member-player",{data:{firstName:"Denied"}})).status()===403,"Outsider edit denied");
          continue;
        }
        check(dtoResponse.status()===200,"Member league DTO");
        const dto=await dtoResponse.json();
        check(!("league" in dto)&&dto.currentSeason===7&&dto.currentWeek===8&&dto.currentPhase==="offseason_departures","Actual flat DTO carries current context");
        const page=await context.newPage(); const errors:string[]=[];
        page.on("pageerror",error=>errors.push(error.message));
        await page.goto(origin+"/league/roster-context/roster");
        await expect(page.getByTestId("button-development-view")).toBeVisible(); checks++;
        if(canAssign){await expect(page.locator('canvas[data-portrait-id="c9-face-02"]:visible').first()).toBeVisible();checks++;}
        await page.getByTestId("button-save-roster-file").click();
        await expect(page.getByTestId("input-save-roster-name")).toHaveValue(role+" College - Season 7"); checks++;
        const savedResponse=page.waitForResponse(r=>r.url().endsWith("/api/saved-rosters")&&r.request().method()==="POST");
        await page.getByTestId("button-confirm-save-roster").click();
        const saved=await savedResponse;check(saved.ok(),"Roster export succeeds");
        check(saved.request().postDataJSON().basedOn===role+" College (Season 7)","Roster export has actual season provenance");
        await page.getByTestId("select-view-roster").selectOption(role+"-team");
        await expect(page.getByTestId("button-development-view")).toBeVisible(); checks++;
        await page.getByTestId("link-player-"+role+"-player").click();
        if(canAssign){await expect(page.getByTestId('dialog-player-profile').locator('canvas[data-portrait-id="c9-face-02"]')).toBeVisible();checks++;}
        await expect(page.getByTestId('complete-player-card')).toBeVisible(); checks++;
        await expect(page.getByTestId('card-rating-grit')).toHaveText('—'); checks++;
        await expect(page.locator('.c9-card-pitches dt')).toHaveCount(role==='member'?6:1); checks++;
        await expect(page.locator('.c9-card-stat-groups dt')).toHaveCount(43); checks++;
        await expect(page.locator('.c9-card-bio')).toContainText('Test, IA'); checks++;
        if(role==='member') {
          await expect(page.getByTestId('card-stat-Batting-AB')).toHaveText('10'); checks++;
          await expect(page.getByTestId('card-pitch-SL').locator('.c9-pitch-segments i')).toHaveCount(7); checks++;
          await expect(page.getByTestId('card-pitch-SL').locator('.filled')).toHaveCount(4); checks++;
          await expect(page.getByTestId('card-pitch-CH').locator('.filled')).toHaveCount(7); checks++;
          await expect(page.getByTestId('card-pitch-SL').getByRole('img')).toHaveAttribute('aria-label','Slider: break level 4 of 7'); checks++;
          await expect(page.getByTestId('card-pitch-FB').locator('i')).toHaveCount(1); checks++;
          await expect(page.getByTestId('card-pitch-FB').getByRole('img')).toHaveAttribute('aria-label','Fastball: equipped'); checks++;
          await expect(page.getByTestId('card-pitch-2S').locator('.filled')).toHaveCount(1); checks++;
          await expect(page.getByTestId('card-pitch-CB').locator('.filled')).toHaveCount(2); checks++;
          await expect(page.getByTestId('card-pitch-CT').locator('.filled')).toHaveCount(5); checks++;
          await expect(page.getByTestId('card-rating-wRISP')).toContainText('50'); checks++;
          await expect(page.getByTestId('card-rating-wRISP')).toContainText('S effect'); checks++;
          await page.getByRole('button',{name:'Sangfroid',exact:true}).focus(); await page.keyboard.press('Enter');
          await expect(page.locator('.c9-card-ability-note')).toContainText('Sangfroid'); checks++;
          await page.keyboard.press('Enter');
          await expect(page.getByTestId('card-stat-Batting-AVG')).toHaveText('0.000'); checks++;
          await expect(page.getByTestId('card-stat-Batting-HBP')).toHaveText('—'); checks++;
          await expect(page.getByTestId('card-stat-Pitching-ERA')).toHaveText('—'); checks++;
          for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]) {
            await page.setViewportSize({width,height});
            const bounds=await page.getByTestId('complete-player-card').boundingBox();
            check(!!bounds&&bounds.y>=0&&bounds.y+bounds.height<=height,'Complete card front fits '+width+'x'+height);
          }
          await page.screenshot({path:'.local-db/flat-card-runtime.png'});
          await page.setViewportSize({width:1280,height:900});
          await page.keyboard.press('Escape');
          await page.route('**/players/member-player/career-stats',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic unavailable'})}));
          await page.reload();await page.getByTestId('link-player-member-player').click();
          await expect(page.getByRole('alert')).toContainText('Season record could not load');checks++;
          await expect(page.getByTestId('card-stat-Batting-AB')).toHaveText('—');checks++;
          await page.unroute('**/players/member-player/career-stats');
          await page.getByRole('button',{name:'Retry statistics',exact:true}).click();
          await expect(page.getByTestId('card-stat-Batting-AB')).toHaveText('10');checks++;
        }
        const commissioner=role==='commissioner'||role==='co';
        check(await page.getByTestId("button-edit-player").count()===(commissioner?1:0),"Edit matches server role "+role);
        check(await page.getByTestId("button-declare-draft").count()===1,"Own eligible draft control "+mode+" "+role);
        if(commissioner) {
          await page.getByTestId("button-edit-player").click();
          await page.getByTestId("input-first-name").fill("Edited"+mode);
          const response=page.waitForResponse(r=>r.url().endsWith("/players/"+role+"-player")&&r.request().method()==="PATCH");
          await page.getByTestId("button-save-player").click();
          const edited=await response;check(edited.status()===200,"Real editor saves for "+role);
          assert.deepEqual(edited.request().postDataJSON(),{firstName:"Edited"+mode});checks++;
          const row=(await pool.query("SELECT first_name,power,grit,eligibility,position FROM players WHERE id=$1",[role+"-player"])).rows[0];
          check(row.first_name==="Edited"+mode&&row.power===0&&row.grit===null&&row.eligibility==="RS"&&row.position==="SP","Identity-only save preserves zero/null/RS/SP");
        } else {
          check((await context.request.patch(api+"/players/"+role+"-player",{data:{firstName:"Denied"}})).status()===403,"Ordinary owner cannot edit attributes");
          if (role === "member") {
            await page.getByTestId("button-declare-draft").click();
            await expect(page.getByRole("alertdialog")).toBeVisible();
            await expect.poll(() => page.getByRole("alertdialog").evaluate(el => el.contains(document.activeElement))).toBe(true);
            await page.keyboard.press("Escape");
            await expect(page.getByRole("alertdialog")).toHaveCount(0);
            await expect(page.getByTestId("dialog-player-profile")).toBeVisible(); checks++;
            await expect(page.getByTestId("button-declare-draft")).toBeFocused(); checks++;
          }
          await page.keyboard.press("Escape");
        }
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page.getByTestId("select-view-roster").selectOption(role==="member"?"opponent-team":"member-team");
        const otherPlayer=role==="member"?"opponent-player":"member-player";
        await page.getByTestId("link-player-"+otherPlayer).waitFor();
        check(await page.getByTestId("button-development-view").count()===0,"Opponent development hidden");
        check(await page.getByTestId("button-save-roster-file").count()===0,"Opponent does not inherit own-team controls");
        await page.getByTestId("link-player-"+otherPlayer).click();
        check(await page.getByTestId("button-declare-draft").count()===(commissioner?1:0),"Opponent draft role distinction");
        check(await page.getByTestId("button-edit-player").count()===(commissioner?1:0),"Opponent edit role distinction");
        await page.keyboard.press("Escape");
        if(commissioner) {
          check((await context.request.patch(api+"/players/outsider-player",{data:{firstName:"Denied"}})).status()===403,"Foreign player edit denied");
          check((await context.request.patch(api+"/players/"+role+"-player",{data:{overall:999}})).status()===400,"Derived fields remain forbidden");
        }
        await page.goto(origin+"/league/roster-context/roster?view=depth&sub=pitching");
        await expect(page.getByTestId("avail-strip-"+role+"-player-FRI")).toContainText("IP"); checks++;
        await page.goto(origin+'/league/roster-context/team/'+role+'-team');
        await page.getByRole('tab',{name:'Roster',exact:true}).click();
        const teamPlayer=page.getByTestId('row-player-'+role+'-player').getByRole('button');
        await teamPlayer.focus();await page.keyboard.press('Enter');
        await expect(page.getByTestId('complete-player-card')).toBeVisible();checks++;
        await expect(page.locator('.c9-card-pitches dt')).toHaveCount(role==='member'?6:1);checks++;
        await page.keyboard.press('Escape');await expect(teamPlayer).toBeFocused();checks++;
        check(errors.length===0,"No page runtime errors: "+errors.join("; "));
      } finally { await context.close(); }
    }
  }
  await pool.query("UPDATE leagues SET current_phase='regular_season' WHERE id='roster-context'"); invalidateLeague("roster-context");
  const faultContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});
  try {
    await faultContext.request.post(origin+"/__test/session",{data:{role:"co"}});
    const page=await faultContext.newPage();
    await page.goto(origin+"/league/roster-context/roster");
    await page.getByTestId("card-player-mobile-co-player").waitFor();
    check(await page.getByTestId("button-development-view").count()===0,"Regular season without deltas hides development");
    await page.getByTestId("card-player-mobile-co-player").click();
    await page.getByTestId("button-edit-player").click();
    await page.getByTestId("input-jersey").fill("100");
    await page.getByTestId("button-save-player").click();
    await expect(page.getByTestId("player-edit-errors")).toBeVisible();checks++;
    check((await pool.query("SELECT jersey_number FROM players WHERE id='co-player'")).rows[0].jersey_number===12,"Invalid numeric edit does not write");
    await page.getByTestId("input-jersey").fill("97");
    await page.getByTestId("tab-attrs").click();
    await page.getByTestId("input-velocity").fill("0");
    // One deliberately failed transport response proves draft preservation;
    // the subsequent retry goes through the actual route and database.
    await page.route("**/api/leagues/roster-context/players/co-player",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Synthetic save interruption"})}),{times:1});
    const failed=page.waitForResponse(r=>r.request().method()==="PATCH");
    await page.getByTestId("button-save-player").click();
    check((await failed).status()===503,"Injected save interruption");
    await expect(page.getByTestId("button-save-player")).toBeEnabled();
    await expect(page.getByTestId("input-velocity")).toHaveValue("0");checks++;
    await page.getByTestId("tab-info").click();
    await expect(page.getByTestId("input-jersey")).toHaveValue("97");checks++;
    const retry=page.waitForResponse(r=>r.request().method()==="PATCH");
    await page.getByTestId("button-save-player").click();
    check((await retry).status()===200,"Retry reaches real API successfully");
    const saved=(await pool.query("SELECT jersey_number,velocity,grit,power FROM players WHERE id='co-player'")).rows[0];
    check(saved.jersey_number===97&&saved.velocity===0&&saved.grit===null&&saved.power===0,"Zero edit saves without changing untouched attributes");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Compact roster fits after editing");
  } finally {await faultContext.close();}
  // New workspace and atomic assignment gates, using only this harness's random database.
  for (let i=1;i<=11;i++) await pool.query("INSERT INTO players(id,team_id,first_name,last_name,position,eligibility,home_state,hometown,jersey_number,overall,star_rating,batting_order,lineup_position) VALUES($1,'member-team','Roster',$2,$3,$4,'IA','Test',$5,300,3,$6,$7)",[`h${i}`,`Player${i}`,['C','1B','2B','3B','SS','LF','CF','RF','DH','OF','LF'][i-1],i===10?'RS':'FR',i,i<=9?i:null,i<=9?['C','1B','2B','3B','SS','LF','CF','RF','DH'][i-1]:null]);
  await pool.query("INSERT INTO players(id,team_id,first_name,last_name,position,eligibility,home_state,hometown,jersey_number,overall,star_rating,pitching_role) VALUES('pitch2','member-team','Second','Pitcher','RP','FR','IA','Test',22,300,3,'SAT')");
  await pool.query("UPDATE players SET pitching_role='FRI' WHERE id='member-player'");
  const writes=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  try {
    await writes.request.post(origin+'/__test/session',{data:{role:'commissioner'}});
    const api=origin+'/api/leagues/roster-context';
    const put=async(route:string,data:unknown,status:number)=>{const r=await writes.request.put(api+'/'+route,{data});check(r.status()===status,route+' expected '+status+' got '+r.status());return r;};
    for(const [route,key,field,valid,foreign] of [
      ['depth-chart','orders','depthOrder','member-player','outsider-player'],
      ['batting-order','orders','battingOrder','h1','outsider-player'],
      ['pitching-roles','assignments','pitchingRole','member-player','outsider-player'],
      ['lineup-position','assignments','lineupPosition','h1','outsider-player'],
    ]) {
      const value=field==='depthOrder'?2:field==='battingOrder'?4:field==='pitchingRole'?'SUN':'RF';
      const snapshot=(await pool.query("SELECT id,depth_order,batting_order,pitching_role,lineup_position FROM players ORDER BY id")).rows;
      await put(route,{[key]:[{playerId:valid,[field]:value},{playerId:foreign,[field]:value}]},404);
      assert.deepEqual((await pool.query("SELECT id,depth_order,batting_order,pitching_role,lineup_position FROM players ORDER BY id")).rows,snapshot);checks++;
      await put(route,{[key]:[{playerId:valid,[field]:value},{playerId:valid,[field]:value}]},400);
      await put(route,{[key]:[{playerId:valid,[field]:value,overall:999}]},400);
    }
    await put('batting-order',{orders:[{playerId:'h1',battingOrder:1.5}]},400);
    await put('batting-order',{orders:[{playerId:'h1',battingOrder:'2'}]},400);
    await put('batting-order',{orders:[{playerId:'h1',battingOrder:2}]},409);
    await put('pitching-roles',{assignments:[{playerId:'h1',pitchingRole:'FRI'}]},400);
    await writes.request.post(origin+'/__test/session',{data:{role:'member'}});
    await put('depth-chart',{orders:[{playerId:'opponent-player',depthOrder:2}]},403);
    // DB failure after one update rolls the entire transaction back.
    await pool.query("CREATE FUNCTION fail_c9_swap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='h2' AND NEW.batting_order=1 THEN RAISE EXCEPTION 'synthetic C9 failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_c9_swap BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION fail_c9_swap()");
    await put('batting-order',{orders:[{playerId:'h1',battingOrder:2},{playerId:'h2',battingOrder:1}]},500);
    check((await pool.query("SELECT batting_order FROM players WHERE id='h1'")).rows[0].batting_order===1,'First write rolled back');
    await pool.query('DROP TRIGGER fail_c9_swap ON players; DROP FUNCTION fail_c9_swap()');
    await put('batting-order',{orders:[{playerId:'h1',battingOrder:2},{playerId:'h2',battingOrder:1}]},200);
    check((await pool.query("SELECT lineup_position FROM players WHERE id='h1'")).rows[0].lineup_position==='C','Batting swap preserves defense');
    // Two pre-existing collisions are repaired one at a time without wiping others.
    await pool.query("UPDATE players SET batting_order=CASE WHEN id='h10' THEN 1 ELSE 2 END WHERE id IN ('h10','h11')");
    await put('batting-order',{orders:[{playerId:'h10',battingOrder:null}]},200);
    await put('batting-order',{orders:[{playerId:'h11',battingOrder:null}]},200);
    // Concurrent assignments to one free slot cannot both become occupants.
    await pool.query("UPDATE players SET batting_order=NULL WHERE id='h9'");
    const results=await Promise.all(['h9','h10'].map(playerId=>writes.request.put(api+'/batting-order',{data:{orders:[{playerId,battingOrder:9}]}})));
    assert.deepEqual(results.map(r=>r.status()).sort(),[200,409]);checks++;
    check((await pool.query("SELECT count(*)::int AS n FROM players WHERE team_id='member-team' AND batting_order=9")).rows[0].n===1,'Concurrent slot stays unique');
    await pool.query("UPDATE players SET batting_order=CASE WHEN id='h9' THEN 9 ELSE NULL END WHERE id IN ('h9','h10')");
    await pool.query("UPDATE players SET fielding=NULL WHERE id='member-player'");
    // Built UI: both game modes use the same real assignment contract.
    for(const mode of ['simulated','reported']) {
      await pool.query("UPDATE leagues SET game_mode=$1 WHERE id='roster-context'",[mode]);invalidateLeague('roster-context');
      const page=await writes.newPage();const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));
      await page.goto(origin+'/league/roster-context/roster');
      await expect(page.getByTestId('roster-manifest')).toBeVisible();checks++;
      await expect(page).toHaveTitle('Class of Nine — College Baseball Dynasty');checks++;
      // PC frame + selected-athlete scene: real roster, keyboard paging and viewport fit.
      await expect(page.locator('.varsity-sidebar')).toHaveCount(0);checks++;
      await expect(page.getByTestId('selected-athlete')).toBeVisible();checks++;
      for (const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]) {
        await page.setViewportSize({width,height});
        await expect(page.locator('[data-testid^="row-player-desktop-"]')).toHaveCount(height >= 1000 ? 12 : 8);
        check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight+1),'PC roster fits '+width+'x'+height);
      }
      await page.getByRole('button',{name:'Batting ratings',exact:true}).click();
      await expect(page.getByTestId('rating-member-player-power')).toHaveText('0');checks++;
      await page.getByRole('button',{name:'Sort by Power',exact:true}).click();
      await expect(page.getByTestId('selected-athlete')).toContainText('Test');checks++;
      await expect(page.getByTestId('link-player-member-player')).toBeVisible();checks++;
      await page.locator('#roster-sort').selectOption('name');
      await expect(page.getByTestId('selected-athlete')).toContainText('Test');checks++;
      await expect(page.getByTestId('link-player-member-player')).toBeVisible();checks++;
      await page.locator('#roster-sort').selectOption('overall');
      await expect(page.getByTestId('selected-athlete')).toContainText('Test');checks++;
      await page.getByTestId('roster-search').fill('Test Pitcher');
      await expect(page.getByRole('button',{name:'Batting ratings',exact:true})).toHaveAttribute('aria-pressed','true');checks++;
      await expect(page.getByTestId('rating-member-player-power')).toHaveText('0');checks++;
      await page.getByTestId('roster-search').fill('');
      await page.getByRole('button',{name:'Pitching ratings',exact:true}).click();
      await expect(page.getByTestId('selected-athlete')).toContainText('Test');checks++;
      await page.getByTestId('select-position-filter').selectOption('P');
      await expect(page.getByRole('button',{name:'Pitching ratings',exact:true})).toHaveAttribute('aria-pressed','true');checks++;
      await expect(page.getByTestId('rating-member-player-control')).toBeVisible();checks++;
      await page.getByTestId('select-position-filter').selectOption('all');
      await expect(page.getByTestId('rating-h1-control')).toHaveText('—');checks++;
      await page.getByRole('button',{name:'Fielding ratings',exact:true}).click();
      await expect(page.getByTestId('rating-member-player-errorResistance')).toBeVisible();checks++;
      await expect(page.getByTestId('rating-member-player-fielding')).toHaveText('—');checks++;
      for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]) {
        await page.setViewportSize({width,height});
        check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight+1),'Metric view fits '+width+'x'+height);
      }
      await page.getByRole('button',{name:'Overview',exact:true}).click();
      await page.getByTestId('link-player-member-player').focus();await page.keyboard.press('/');
      await expect(page.getByTestId('roster-search')).toBeFocused();checks++;
      await page.keyboard.press('/');await expect(page.getByTestId('roster-search')).toHaveValue('/');checks++;
      await page.getByTestId('roster-search').fill('');
      await page.setViewportSize({width:1366,height:768});
      await page.locator('[data-testid^="link-player-"]').first().focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByTestId('selected-athlete')).toContainText('Second');checks++;
      await page.keyboard.press('PageDown');
      await expect(page.locator('[data-testid^="link-player-"]').first()).toBeFocused();checks++;
      await page.keyboard.press('ArrowDown');
      const boundaryName = await page.getByTestId('selected-athlete').innerText();
      await page.keyboard.press('PageDown');
      await expect(page.getByTestId('selected-athlete')).toHaveText(boundaryName, {useInnerText:true});checks++;
      await expect(page.locator('[data-testid^="link-player-"]').nth(1)).toBeFocused();checks++;
      await page.keyboard.press('PageUp');
      await expect(page.locator('[data-testid^="link-player-"]').first()).toBeFocused();checks++;
      await page.keyboard.press('Enter');await expect(page.getByTestId('dialog-player-profile')).toBeVisible();
      await page.keyboard.press('Escape');await expect(page.locator('[data-testid^="link-player-"]').first()).toBeFocused();checks++;
      await page.setViewportSize({width:1440,height:1000});
      await page.getByTestId('select-position-filter').selectOption('P');
      await expect(page.locator('[data-testid^="row-player-desktop-"]')).toHaveCount(2);checks++;
      await page.getByTestId('select-position-filter').selectOption('OF');
      await expect(page.locator('[data-testid^="row-player-desktop-"]')).toHaveCount(5);checks++;
      await page.getByTestId('select-position-filter').selectOption('all');await page.getByTestId('select-eligibility-filter').selectOption('RS');
      await expect(page.getByTestId('link-player-h10')).toBeVisible();checks++;
      await page.getByTestId('select-eligibility-filter').selectOption('all');
      await page.getByTestId('roster-search').fill('Roster Player11');
      await expect(page.locator('[data-testid^="row-player-desktop-"]')).toHaveCount(1);checks++;
      await page.getByTestId('button-depth-view').click();
      check(await page.getByTestId('roster-search').count()===0,'List filters absent from lineup');
      await page.getByTestId('assign-defense-RF').focus();await page.keyboard.press('Enter');
      await page.getByTestId('select-lineup-player').selectOption('h6');
      await page.getByTestId('save-lineup-assignment').focus();await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('field-slot-RF')).toContainText('Roster Player6');checks++;
      await expect(page.getByTestId('assign-defense-RF')).toBeFocused();checks++;
      await page.getByTestId('slot-profile-defense-h6').focus();await page.keyboard.press('Enter');
      await expect(page.getByTestId('dialog-player-profile')).toBeVisible();
      await expect.poll(() => page.getByTestId('dialog-player-profile').evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('slot-profile-defense-h6')).toBeFocused();checks++;
      await page.getByTestId('tab-lineup').click();await page.getByTestId('assign-batting-1').click();
      await page.getByTestId('select-lineup-player').selectOption('h11');
      await page.route('**/batting-order',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic interruption'})}),{times:1});
      await page.getByTestId('save-lineup-assignment').click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
      await expect(page.getByTestId('select-lineup-player')).toHaveValue('h11');checks++;
      await page.getByTestId('save-lineup-assignment').click();await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('slot-batting-1')).toContainText('Roster Player11');checks++;
      await page.reload();await page.getByTestId('button-depth-view').click();await page.getByTestId('tab-lineup').click();
      await expect(page.getByTestId('slot-batting-1')).toContainText('Roster Player11');checks++;
      await page.getByTestId('tab-pitching').click();await page.getByTestId('assign-pitching-FRI').click();await page.getByTestId('select-lineup-player').selectOption('pitch2');await page.getByTestId('save-lineup-assignment').click();await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('slot-pitching-FRI')).toContainText('Second Pitcher');checks++;
      await page.getByTestId('select-view-roster').selectOption('opponent-team');await page.getByTestId('depth-chart-view').waitFor();
      check(await page.locator('[data-testid^="assign-"]').count()===0,'Opponent lineup read only');
      await page.getByTestId('select-view-roster').selectOption('member-team');await page.getByTestId('tab-field').click();
      for(const width of [1440,768,390]) {await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Field fits '+width);}
      check(pageErrors.length===0,'Workspace no runtime errors '+pageErrors.join(';'));
      await page.close();
      await pool.query("UPDATE players SET batting_order=CASE WHEN id='h2' THEN 1 ELSE NULL END WHERE id IN ('h2','h11'); UPDATE players SET lineup_position=CASE WHEN id='h6' THEN 'LF' ELSE 'RF' END WHERE id IN ('h6','h8'); UPDATE players SET pitching_role=CASE WHEN id='member-player' THEN 'FRI' ELSE 'SAT' END WHERE id IN ('member-player','pitch2')");
    }
  } finally {await writes.close();}

  console.log(`Roster context: ${checks} checks passed against built UI and real HTTP/PostgreSQL in both modes.`);
  if (process.env.PAWA_ROSTER_REVIEW === "1") {
    await pool.query("WITH numbered AS (SELECT p.id, row_number() OVER (ORDER BY p.id) AS n FROM players p JOIN teams t ON p.team_id=t.id WHERE t.league_id='roster-context') UPDATE players SET portrait_id='c9-face-' || lpad((((numbered.n-1)%30)+1)::text,2,'0') FROM numbered WHERE players.id=numbered.id");
    invalidateLeague('roster-context');
    const reviewPage=await browser.newPage();await reviewPage.goto(origin+'/__test/review');
    await expect(reviewPage.locator('canvas[data-portrait-id]:visible').first()).toBeVisible();await reviewPage.close();
    console.log(`C9_ROSTER_REVIEW ${origin}/__test/review`);
    console.log("Disposable review server retained. Ctrl+C stops it and removes its test database.");
    await new Promise<void>(resolve => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await browser?.close();
  if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await pool?.end();
  if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
