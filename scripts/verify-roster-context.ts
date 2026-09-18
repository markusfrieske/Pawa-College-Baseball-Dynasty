/** Built roster UI + real route/storage contract in an owned disposable database.
 * Authentication is injected into test-only sessions; login itself is not tested. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
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
  app.use(express.json());
  app.use(session({secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false}));
  app.post("/__test/session",(req,res)=>{
    if (!roles.includes(req.body.role)) {res.sendStatus(400);return;}
    req.session.userId=req.body.role;
    req.session.save(error=>error?res.sendStatus(500):res.sendStatus(204));
  });
  await registerRoutes(server,app);
  app.use(express.static(path.resolve("dist/public")));
  // The managed checkout may have a dot-prefixed ancestor; serve this exact built file.
  app.get("/{*path}",(_req,res)=>res.sendFile(path.resolve("dist/public/index.html"),{dotfiles:"allow"}));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address(); assert(address&&typeof address==="object");
  const origin=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true});
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
        await page.getByTestId("button-save-roster-file").click();
        await expect(page.getByTestId("input-save-roster-name")).toHaveValue(role+" College - Season 7"); checks++;
        const savedResponse=page.waitForResponse(r=>r.url().endsWith("/api/saved-rosters")&&r.request().method()==="POST");
        await page.getByTestId("button-confirm-save-roster").click();
        const saved=await savedResponse;check(saved.ok(),"Roster export succeeds");
        check(saved.request().postDataJSON().basedOn===role+" College (Season 7)","Roster export has actual season provenance");
        await page.getByTestId("select-view-roster").selectOption(role+"-team");
        await expect(page.getByTestId("button-development-view")).toBeVisible(); checks++;
        await page.getByTestId("link-player-"+role+"-player").click();
        const commissioner=role==="commissioner"||role==="co";
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
  console.log(`Roster context: ${checks} checks passed against built UI and real HTTP/PostgreSQL in both modes.`);
} finally {
  await browser?.close();
  if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await pool?.end();
  if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
