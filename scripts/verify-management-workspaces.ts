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
const name = "pawa_test_workspace_" + randomUUID().replaceAll("-", "");
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
      req.session.save(error => error ? res.sendStatus(500) : res.redirect("/league/roster-context/recruiting"));
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
  for (const mode of ['simulated','reported']) {
    await pool.query("UPDATE leagues SET game_mode=$1 WHERE id='roster-context'",[mode]);invalidateLeague('roster-context');
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    try {
      await context.request.post(origin+'/__test/session',{data:{role:'member'}});
      const page=await context.newPage(); const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      // Malformed local preferences must not prevent entering the board.
      await page.addInitScript(()=>localStorage.setItem('recruiting-presets-roster-context','invalid-json'));
      await page.goto(origin+'/league/roster-context/recruiting');
      await expect(page.getByTestId('recruiting-ledger')).toBeVisible();checks++;
      await expect(page.locator('.c9-recruit-summary')).toHaveCount(24);checks++;
      for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]) {
        await page.setViewportSize({width,height});
        await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);checks++;
      }
      await page.setViewportSize({width:1366,height:768});
      for(const action of ['scout','phone','email','visit','head-coach-visit','offer']) {await expect(page.getByTestId('button-'+action+'-r1')).toBeInViewport();checks++;}
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('navigation',{name:'Recruit board pages'}).getByRole('button',{name:'Next',exact:true}).focus(); await page.keyboard.press('Enter');
      await expect(page.locator('.c9-recruit-summary')).toHaveCount(6);checks++;
      let spendRequests=0;page.on('request',r=>{if(r.method()==='POST' && /recruits/.test(r.url()))spendRequests++;});
      await page.getByTestId('inspect-recruit-r26').focus();await page.keyboard.press('ArrowDown');
      await expect(page.getByTestId('inspect-recruit-r27')).toBeFocused();checks++;
      await expect(page.getByTestId('inspect-recruit-r27')).toHaveAttribute('aria-pressed','true');checks++;
      check(spendRequests===0,'Keyboard selection spends nothing');
      const rid=mode==='simulated'?'r29':'r30';
      await page.getByTestId('manage-recruit-'+rid).click();
      await expect(page.getByTestId('card-recruit-'+rid)).toHaveClass(/c9-board-selected/);checks++;
      const row=page.getByRole('complementary',{name:'Selected prospect'});
      const targetResponse=page.waitForResponse(r=>r.url().endsWith('/'+rid+'/target')&&r.request().method()==='POST');
      await row.getByTestId('button-target-'+rid).click();check((await targetResponse).ok(),'Target persisted');
      const before=(await context.request.get(api+'/recruiting')).json();
      const beforeData=await before;
      await row.getByTestId('checkbox-compare-'+rid).click();
      await page.getByTestId('manage-recruit-r25').click();await page.getByTestId('checkbox-compare-r25').click();
      await page.getByTestId('manage-recruit-r26').click();await page.getByTestId('checkbox-compare-r26').click();
      await page.getByTestId('inspect-recruit-'+rid).click();
      const modal=page.getByRole('complementary',{name:'Selected prospect'});await expect(modal).toBeVisible();
      await page.route('**/'+rid+'/scout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic scouting interruption'})}),{times:1});
      await page.getByTestId('button-scout-'+rid).click();
      await expect(page.getByTestId('action-result-modal')).toHaveAttribute('role','alert');checks++;
      await expect(page.getByTestId('inspect-recruit-'+rid)).toHaveAttribute('aria-pressed','true');checks++;
      check((await (await context.request.get(api+'/recruiting')).json()).remainingScoutPoints===beforeData.remainingScoutPoints,'Failed scouting keeps budget');
      const scoutResponse=page.waitForResponse(r=>r.url().endsWith('/'+rid+'/scout')&&r.request().method()==='POST');
      await page.getByTestId('button-scout-'+rid).click();check((await scoutResponse).ok(),'Scout saved');
      await expect(page.getByTestId('button-scout-'+rid)).toBeEnabled();
      const afterData=await (await context.request.get(api+'/recruiting')).json();
      check(afterData.remainingScoutPoints===beforeData.remainingScoutPoints-1,'One scout point spent');
      const knowledge=afterData.recruits.find((r:any)=>r.id===rid).interest.scoutPercentage;
      check(knowledge>0,'Scouting changes knowledge');
      await expect(modal).toContainText(knowledge+'%');checks++;
      await expect(page.getByRole('dialog')).toHaveCount(0);checks++;
      await page.getByTestId('button-open-compare').click();await expect(page.getByTestId('compare-card-'+rid)).toContainText('Scouted: '+knowledge+'%');checks++;
      await page.setViewportSize({width:1280,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Comparison fits PC window');
      check((await page.getByTestId('compare-modal').boundingBox())!.height<=900,'Compare dialog vertically bounded');
      await page.getByTestId('compare-card-r26').scrollIntoViewIfNeeded();await expect(page.getByTestId('compare-card-r26')).toBeInViewport();checks++;
      await page.getByTestId('button-close-compare').click();
      await expect(page.getByTestId('compare-modal')).toHaveCount(0);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Three-name compare tray fits PC window');await page.setViewportSize({width:1440,height:1000});
      await row.getByTestId('button-notes-'+rid).click();
      await page.getByTestId('textarea-notes').fill('Keep this scouting note '+mode);
      await page.route('**/'+rid+'/notes',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic notes interruption'})}),{times:1});
      await page.getByTestId('button-save-notes').click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();checks++;
      await expect(page.getByTestId('textarea-notes')).toHaveValue('Keep this scouting note '+mode);checks++;
      await page.getByTestId('button-save-notes').click();await expect(page.getByRole('dialog')).toHaveCount(0);
      check((await pool.query("SELECT notes FROM recruiting_interests WHERE recruit_id=$1 AND team_id='member-team'",[rid])).rows[0].notes==='Keep this scouting note '+mode,'Notes persisted after retry');
      await page.reload();await page.getByTestId('input-search-recruits').fill(mode==='simulated'?'Prospect29':'Prospect30');
      await expect(page.locator('.c9-recruit-summary')).toHaveCount(1);checks++;
      await expect(page.getByTestId('card-recruit-'+rid)).toContainText(knowledge+'% scouted');checks++;
      for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]) {await page.setViewportSize({width,height});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Recruit board fits '+width);}
      // Presentation-only adversarial DTO fixtures: hidden values deliberately remain in the payload.
      await page.getByTestId('input-search-recruits').fill('');
      const dto=await (await context.request.get(api+'/recruiting')).json();
      const original=dto.recruits[0];
      for(const pct of [0,25,49,50,99,100]) {
        const recruit={...original,id:'r1',position:'P',overall:987,potential:99,velocity:91,control:83,stamina:77,fielding:61,pitchFB:1,pitchSL:5,pitchCCH:3,pitchHSL:4,isBlueChip:false,signingDayRevealed:false,signingDayLockedFields:['control'],scoutingOrder:['pitchFB','pitchSL','pitchCCH','pitchHSL'],abilities:[],interest:{...original.interest,scoutPercentage:pct,revealedAttributes:pct>0?['velocity','control']:[],revealedAbilitiesCount:0,minOverall:pct>0?250:null,maxOverall:pct>0?400:null}};
        await page.route('**/api/leagues/roster-context/recruiting',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...dto,recruits:[recruit]})}));
        await page.reload();await page.getByRole('button',{name:'Evaluation',exact:true}).click();await page.getByTestId('scouting-sheet-r1').waitFor();
        const sheet=page.getByTestId('scouting-sheet-r1');
        await expect(sheet.getByTestId('scout-rating-control')).toHaveAttribute('data-knowledge','arrival');checks++;
        await expect(sheet.getByTestId('scout-rating-stamina')).toHaveAttribute('data-knowledge','unknown');checks++;
        await expect(sheet.getByTestId('scout-rating-velocity')).toHaveAttribute('data-knowledge',pct>0?'known':'unknown');checks++;
        await expect(sheet.getByTestId('scout-overall-range')).toHaveText(pct>0?'250–400':'Unknown');checks++;
        check(!(await sheet.innerText()).includes('987'),'Unscouted exact OVR absent at '+pct);
        if(pct===0) {await expect(sheet.locator('[data-testid^="scout-pitch-"]')).toHaveCount(0);checks++;}
        if(pct===49) {await expect(sheet.getByTestId('scout-pitch-SL')).toContainText('break unknown');checks++;}
        if(pct>=50) {await expect(sheet.getByTestId('scout-pitch-SL').getByRole('img')).toHaveAttribute('aria-label','Slider: break level 5 of 7');checks++;await expect(sheet.getByTestId('scout-pitch-CCH')).toBeAttached();checks++;await expect(sheet.getByTestId('scout-pitch-HSL')).toBeAttached();checks++;}
        await page.unroute('**/api/leagues/roster-context/recruiting');
      }
      for(const arrivalLocked of [true,false]) {
        const recruit={...original,id:'r1',position:'C',catcherAbility:83,isBlueChip:false,signingDayRevealed:false,signingDayLockedFields:arrivalLocked?['catcherAbility']:[],abilities:['Power Hitter'],interest:{...original.interest,scoutPercentage:100,revealedAttributes:['catcherAbility'],revealedAbilitiesCount:1}};
        await page.route('**/api/leagues/roster-context/recruiting',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...dto,recruits:[recruit]})}));
        await page.reload();await page.getByRole('button',{name:'Evaluation',exact:true}).click();const sheet=page.getByTestId('scouting-sheet-r1');await sheet.waitFor();
        await expect(sheet.getByTestId('scout-rating-catcherAbility')).toHaveAttribute('data-knowledge',arrivalLocked?'arrival':'known');checks++;
        if(!arrivalLocked){await expect(sheet.getByTestId('scout-rating-catcherAbility')).toContainText('83');checks++;}
        const ability=sheet.locator('summary').filter({hasText:'Power Hitter'});await ability.focus();await page.keyboard.press('Enter');
        await expect(sheet.getByText('Hitting a homerun with power swing becomes easier')).toBeVisible();checks++;
        await page.unroute('**/api/leagues/roster-context/recruiting');
      }
      check(errors.length===0,'Recruit runtime errors: '+errors.join(';'));
      await page.close();
    } finally {await context.close();}
  }
  await pool.query("UPDATE leagues SET game_mode='reported' WHERE id='roster-context'");invalidateLeague('roster-context');
  const reports=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  try {
    await reports.request.post(origin+'/__test/session',{data:{role:'commissioner'}});
    const page=await reports.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/league/roster-context/report-game/score-only');
    await expect(page.getByTestId('report-workspace')).toBeVisible();checks++;
    await expect(page.getByTestId('step-upload')).toHaveText('1 Enter');checks++;
    check((await page.locator('.c9-report-editor').boundingBox())!.width>650,'Desktop scorebook uses available width');
    await page.getByRole('radio',{name:'Score only (commissioner)',exact:true}).click();
    await page.getByTestId('score-home-input').fill('2');await page.getByTestId('score-away-input').fill('1');
    await page.getByLabel(/reason/i).fill('Synthetic agreed result');
    await page.getByTestId('button-continue-review').click();await expect(page.getByTestId('score-only-review')).toBeVisible();checks++;
    let release!:()=>void;const hold=new Promise<void>(resolve=>release=resolve);let intercepted!:()=>void;const started=new Promise<void>(resolve=>intercepted=resolve);
    await page.route('**/games/score-only/report',async route=>{if(route.request().method()!=='POST')return route.continue();intercepted();await hold;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic report interruption'})});},{times:1});
    await page.getByTestId('button-submit-report').click();await started;
    await expect(page.getByTestId('button-back-to-score-from-review')).toBeDisabled();checks++;
    await expect(page.getByTestId('button-back-to-score')).toBeDisabled();checks++;
    await expect(page.getByRole('navigation',{name:'Scorebook sections'}).getByRole('button',{name:'Score & sources',exact:true})).toBeDisabled();checks++;
    release();await expect(page.getByTestId('button-submit-report')).toBeEnabled();
    await expect(page.getByTestId('score-only-review')).toContainText('2');checks++;
    const saved=page.waitForResponse(r=>r.url().endsWith('/score-only/report')&&r.request().method()==='POST');
    await page.getByTestId('button-submit-report').click();check((await saved).status()===200,'Real report retry succeeds');
    const record=(await pool.query("SELECT status,home_score,away_score,home_hits,home_box_data FROM game_reports WHERE game_id='score-only'")).rows[0];
    check(record.status==='pending'&&record.home_score===2&&record.away_score===1&&record.home_hits===null&&record.home_box_data===null,'Pending score-only receipt preserves unknown statistics');
    await expect(page.getByTestId('report-workspace-state')).toContainText('Submission received');checks++;
    check(!(await pool.query("SELECT is_complete FROM games WHERE id='score-only'")).rows[0].is_complete,'Submission did not declare an official game');
    await reports.request.post(origin+'/__test/session',{data:{role:'member'}});
    await page.goto(origin+'/league/roster-context/report-game/full-entry');
    await expect(page.getByRole('radio',{name:'Score only (commissioner)',exact:true})).toHaveCount(0);checks++;
    await page.getByTestId('toggle-home-batting').click();
    await page.locator('tbody tr').first().getByRole('button').click();
    const rowPrompt=page.waitForEvent('dialog');const rowNav=page.getByRole('link',{name:'Schedule',exact:true}).click();const rowLeave=await rowPrompt;check(rowLeave.message().includes('unsubmitted changes'),'Button-only row removal warns before any score metadata exists');await rowLeave.dismiss();await rowNav;
    await expect(page.getByTestId('text-batter-count')).toHaveText('8 batters');checks++;await page.getByTestId('button-add-batter-member-h1').click();
    await page.getByRole('navigation',{name:'Scorebook sections'}).getByRole('button',{name:'Pitching',exact:true}).click();
    await expect(page.locator('[data-testid="select-pitcher-0-player"]')).toHaveCount(2);checks++;
    await expect(page.locator('[data-testid="select-pitcher-1-player"]')).toHaveCount(2);checks++;
    await page.getByTestId('input-pitcher-0-ip').first().fill('1.3');
    await page.getByTestId('toggle-innings').click();
    await page.getByTestId('button-extra-inning').click();
    const prompt=page.waitForEvent('dialog');const navigation=page.getByRole('link',{name:'Schedule',exact:true}).click();
    const leave=await prompt;check(leave.message().includes('unsubmitted changes'),'Manual draft warns on navigation');await leave.dismiss();await navigation;
    await expect(page.getByTestId('input-home-inning-9')).toBeVisible();checks++;
    await page.getByTestId('input-home-inning-0').fill('1');
    const typedPrompt=page.waitForEvent('dialog');const typedNav=page.getByRole('link',{name:'Schedule',exact:true}).click();const typedLeave=await typedPrompt;check(typedLeave.message().includes('unsubmitted changes'),'Typed draft warns');await typedLeave.dismiss();await typedNav;
    await page.getByTestId('toggle-home-batting').click();await page.getByTestId('toggle-away-batting').click();
    await expect(page.getByTestId('text-batter-count')).toHaveText(['9 batters','9 batters']);checks++;
    await page.getByTestId('input-batter-0-r').first().fill('1');
    await page.getByTestId('button-continue-review').click();
    await expect(page.getByTestId('banner-review-before-submit')).toBeVisible();checks++;
    await expect(page.getByText(/Invalid IP format/).first()).toBeVisible();checks++;
    await expect(page.getByTestId('button-submit-report')).toBeDisabled();checks++;
    // Failed OCR is a local transport fixture; never invokes upload, OCR or object storage.
    await page.route('**/games/full-entry/report-images',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'failed-image',gameId:'full-entry',category:'final_score',ocrStatus:'failed',ocrResult:null,ocrError:'Synthetic unreadable image',objectPath:'/synthetic-disabled'}])}));
    page.on('dialog',dialog=>dialog.accept());await page.reload();
    await expect(page.getByTestId('banner-ocr-failed')).toBeVisible();checks++;
    await expect(page.getByTestId('banner-ocr-complete')).toHaveCount(0);checks++;
    for(const width of [1440,768,390]) {await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Report fits '+width);}
    check(errors.length===0,'Report runtime errors: '+errors.join(';'));
  } finally {await reports.close();}
  console.log(`Workspaces: ${checks} checks passed against built UI and real HTTP/PostgreSQL.`);
  if (process.env.PAWA_WORKSPACE_REVIEW === '1') {
    console.log(`C9_WORKSPACE_REVIEW ${origin}/__test/review`);
    console.log(`C9_REPORT_REVIEW ${origin}/__test/report-review`);
    await new Promise<void>(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  }

} finally {
  await browser?.close();
  if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await pool?.end();
  if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}

