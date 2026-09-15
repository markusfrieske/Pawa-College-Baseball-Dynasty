/** Real report HTTP/storage regression. Owns a random loopback test database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { reassignReportRosterPlayer } from "../client/src/lib/report-roster-identity";
import { buildScoreOnlyReport } from "../shared/reporting";
import { checkMigrationVersion, runMigrations } from "../server/lib/runMigrations";

const connection = process.env.PAWA_TEST_DATABASE_URL;
assert(connection, "PAWA_TEST_DATABASE_URL required; refusing DATABASE_URL fallback");
const target = new URL(connection);
assert(["postgres:", "postgresql:"].includes(target.protocol));
assert(!target.search, "Connection URL overrides forbidden");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Loopback only");
assert(/^\/pawa_(?:test_[a-z0-9_]+|w\d+_test)$/i.test(target.pathname), "Named test database required");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv.includes("--http-child")) {
  process.env.DATABASE_URL = connection;
  process.env.NODE_ENV = "production";
  process.env.OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "synthetic-disabled";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "http://127.0.0.1:1";
  const { default: express } = await import("express");
  const { createServer } = await import("node:http");
  const { registerRoutes } = await import("../server/routes");
  const { storage } = await import("../server/storage");
  const { finalizeReportedGame } = await import("../server/game-finalizer");
  const { publicErrorHandler } = await import("../server/lib/httpErrors");
  const app = express(); app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  app.use(publicErrorHandler);
  process.on("message", async (message: any) => {
    if (message?.kind !== "direct-finalize") return;
    try {
      const game = await storage.getGame(message.gameId);
      const report = await storage.getGameReport(message.gameId);
      assert(game && report);
      await finalizeReportedGame(report, game, game.leagueId);
      process.send?.({ kind: "direct-result", error: null });
    } catch (error) {
      process.send?.({ kind: "direct-result", error: error instanceof Error ? error.name : "UnknownError" });
    }
  });
  process.on("disconnect", () => process.exit(0));
  server.listen(0, "127.0.0.1", () => {
    const address = server.address(); assert(address && typeof address === "object");
    process.send?.({ kind: "ready", port: address.port });
  });
} else {
  const admin = new pg.Pool({ connectionString: connection });
  const name = `pawa_test_reports_${randomUUID().replaceAll("-", "")}`;
  assert(/^pawa_test_reports_[a-f0-9]{32}$/.test(name));
  const url = new URL(connection); url.pathname = `/${name}`;
  let created = false, child: ChildProcess | undefined, pool: pg.Pool | undefined;
  let origin = "", cookie = "", checks = 0;
  const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
  const invoke = async (route: string, method = "GET", body?: unknown) => {
    const response = await fetch(origin + route, { method, signal: AbortSignal.timeout(15000),
      headers: { "X-Forwarded-Proto": "https", Cookie: cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, data: await response.json() };
  };
  async function waitForMessage(kind: string, action: () => void) {
    return new Promise<any>((done, reject) => {
      const current = child!;
      const timer = setTimeout(() => { current.off("message", receive); reject(new Error(`${kind} timeout`)); }, 30000);
      function receive(message: any) { if (message?.kind === kind) { clearTimeout(timer); current.off("message", receive); done(message); } }
      current.on("message", receive); action();
    });
  }
  const box = (side: string, score: number, allowed: number) => ({
    batting: Array.from({ length: 9 }, (_, i) => ({ playerId: `${side}-${i}`, name: `Fixture ${i}`, position: "CF", ab: 3, r: i === 0 ? score : 0, h: i === 0 ? score : 0, doubles: 0, triples: 0, hr: 0, rbi: i === 0 ? score : 0, bb: 0, so: 0, sb: 0 })),
    pitching: [{ playerId: `${side}-0`, name: "Fixture 0", role: "SP", ip: side === "home" ? "9.0" : "8.0", h: allowed, r: allowed, er: allowed, bb: 0, so: 0, hr: 0 }],
  });
  const valid = () => ({ homeScore: 1, awayScore: 0, homeHits: 1, awayHits: 0, homeErrors: 0, awayErrors: 0,
    inningScores: Array.from({ length: 9 }, (_, i) => [0, i === 0 ? 1 : 0]), homeBoxData: box("home", 1, 0), awayBoxData: box("away", 0, 1), overrideReason: "Synthetic commissioner fixture" });
  try {
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    pool = new pg.Pool({ connectionString: url.toString() });
    const bootstrapExit = await new Promise<number | null>((done, reject) => {
      const boot = spawn(process.execPath, ["--import", "tsx", "scripts/bootstrap-test-db.ts"], { cwd: root, windowsHide: true, stdio: "ignore", env: { ...process.env, PAWA_TEST_DATABASE_URL: url.toString() } });
      const timer = setTimeout(() => { boot.kill(); reject(new Error("Bootstrap timeout")); }, 60000);
      boot.once("error", error => { clearTimeout(timer); reject(error); });
      boot.once("exit", code => { clearTimeout(timer); done(code); });
    });
    equal(bootstrapExit, 0, "Owned report DB bootstrap");
    child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--http-child"], { cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"], env: { ...process.env, PAWA_TEST_DATABASE_URL: url.toString(), SESSION_SECRET: randomUUID() + randomUUID() } });
    const ready = await waitForMessage("ready", () => {}); origin = `http://127.0.0.1:${ready.port}`;
    const registration = await invoke("/api/auth/register", "POST", { email: "reports@example.test", password: "synthetic-reports-password" });
    equal(registration.response.status, 200, "Real commissioner registration");
    cookie = registration.response.headers.get("set-cookie")!.split(";")[0];
    await pool.query("INSERT INTO leagues (id,name,commissioner_id,game_mode,current_phase,is_test_data) VALUES ('report-league','Report fixture',$1,'reported','regular_season',true)", [registration.data.id]);
    for (const side of ["home", "away"]) {
      await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ($1,'report-league',$2,'Owls','TST','Test','IA',false)", [side, `Fixture ${side}`]);
      for (let i = 0; i < 9; i++) await pool.query("INSERT INTO players (id,team_id,first_name,last_name,position,home_state,hometown,jersey_number) VALUES ($1,$2,'Fixture',$3,'CF','IA','Test',$4)", [`${side}-${i}`, side, String(i), i]);
    }
    const newGame = async (id: string) => pool!.query("INSERT INTO games (id,league_id,season,week,home_team_id,away_team_id,phase) VALUES ($1,'report-league',1,1,'home','away','regular')", [id]);
    const tableNames = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'session' ORDER BY tablename")).rows.map(row => row.tablename as string);
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of tableNames) {
        assert(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table));
        result[table] = (await pool!.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows;
      }
      return result;
    };
    await newGame("submit");
    const endpoint = (id: string) => `/api/leagues/report-league/games/${id}/report`;
    const mutations: Array<[string, (data: any) => void]> = [
      ["negative AB", d => d.homeBoxData.batting[0].ab = -7],
      ["impossible HR", d => d.homeBoxData.batting[0].hr = 999],
      ["missing player", d => delete d.homeBoxData.batting[0].playerId],
      ["foreign player", d => d.homeBoxData.batting[0].playerId = "away-0"],
      ["duplicate player", d => d.homeBoxData.batting[1].playerId = "home-0"],
      ["malformed innings", d => d.inningScores = [null]],
      ["fractional counter", d => d.awayBoxData.pitching[0].er = 0.5],
      ["missing core counter", d => delete d.homeBoxData.batting[0].ab],
      ["string rows", d => d.homeBoxData.batting = "not an array"],
      ["wrong total", d => d.homeHits = 2],
      ["missing summary hits", d => delete d.homeHits],
      ["partial commissioner foreign row", d => { d.inningScores = null; d.awayBoxData = null; d.homeBoxData.pitching = []; d.homeBoxData.batting[0].playerId = "away-0"; }],
    ];
    for (const [label, mutate] of mutations) {
      const data = valid(); mutate(data); const before = await snapshot();
      equal((await invoke(endpoint("submit"), "POST", data)).response.status, 422, `Submission rejects ${label}`);
      equal(await snapshot(), before, `Rejected ${label} performs no persisted writes`);
    }
    const extracted = valid();
    extracted.homeBoxData.batting[0].playerId = "screenshot-unmatched";
    extracted.homeBoxData.batting[0].name = "Unmatched OCR name";
    const actualRoster = (await pool.query('SELECT id,first_name AS "firstName",last_name AS "lastName",position FROM players WHERE team_id=$1', ["home"])).rows;
    const remapped = reassignReportRosterPlayer({ rows: extracted.homeBoxData.batting, rowIndex: 0, selectedPlayerId: "home-0", roster: actualRoster, fieldMeta: {}, side: "home", section: "batting" });
    assert(remapped.ok);
    equal(remapped.rows[0].playerId, "home-0", "OCR roster selection updates the submitted ID");
    equal([remapped.rows[0].ab, remapped.rows[0].r, remapped.rows[0].h], [3, 1, 1], "OCR roster selection retains extracted counting stats");
    extracted.homeBoxData.batting = remapped.rows;
    equal((await invoke(endpoint("submit"), "POST", extracted)).response.status, 200, "Remapped full report passes actual roster validation with two-way IDs");
    const pending = (await pool.query("SELECT * FROM game_reports WHERE game_id='submit'")).rows[0];
    equal(pending.status, "pending", "Commissioner full report remains pending");
    for (const [label, mutate] of mutations.filter(([label]) => !["string rows", "partial commissioner foreign row"].includes(label))) {
      const data = { ...valid(), expectedEditVersion: pending.edit_version }; mutate(data); const before = await snapshot();
      equal((await invoke(endpoint("submit"), "PATCH", data)).response.status, 422, `Edit rejects ${label}`);
      equal(await snapshot(), before, `Rejected edit ${label} preserves report and game`);
    }
    equal(pending.edit_version, 1, "New report starts at edit version one");
    const edited = await invoke(endpoint("submit"), "PATCH", { ...valid(), expectedEditVersion: pending.edit_version });
    equal(edited.response.status, 200, "Valid full edit accepted");
    equal(edited.data.editVersion, 2, "Successful edit returns the incremented version");
    for (const scores of [[1, 1], [-1, 0], [1.5, 0], [31, 0], [1, undefined]]) {
      const before = await snapshot();
      equal((await invoke(endpoint("submit") + "/dispute", "POST", { reason: "Synthetic correction", correctedHomeScore: scores[0], correctedAwayScore: scores[1] })).response.status, 422, "Invalid corrected score rejected before dispute write");
      equal(await snapshot(), before, "Invalid dispute changes no persistent state");
    }
    equal((await invoke(endpoint("submit") + "/dispute", "POST", { reason: "Synthetic correction", correctedHomeScore: 2, correctedAwayScore: 0 })).response.status, 200, "Valid correction proposal recorded");
    let before = await snapshot();
    equal((await invoke(endpoint("submit") + "/finalize", "POST", { useCorrectedScore: true })).response.status, 422, "Correction inconsistent with innings/batting cannot finalize");
    equal(await snapshot(), before, "Inconsistent correction changes no persistent state");
    const invalidBox = valid().homeBoxData; invalidBox.batting[0].playerId = "away-0";
    await pool.query("UPDATE game_reports SET status='pending',home_box_data=$1 WHERE game_id='submit'", [JSON.stringify(invalidBox)]);
    for (const suffix of ["/confirm", "/finalize"]) {
      before = await snapshot();
      equal((await invoke(endpoint("submit") + suffix, "POST", {})).response.status, 422, `Persisted foreign player blocked at ${suffix}`);
      equal(await snapshot(), before, "Invalid persisted report performs no finalization writes");
    }
    before = await snapshot();
    const direct = await waitForMessage("direct-result", () => child!.send({ kind: "direct-finalize", gameId: "submit" }));
    equal(direct.error, "ReportValidationError", "Direct service invocation also revalidates");
    equal(await snapshot(), before, "Direct service rejection changes no persistent state");
    await pool.query("UPDATE games SET is_complete=true WHERE id='submit'");
    before = await snapshot();
    equal((await invoke(endpoint("submit") + "/confirm", "POST", {})).response.status, 422, "Already-complete confirmation branch also revalidates");
    equal(await snapshot(), before, "Invalid already-complete report stays unconfirmed");
    await newGame("valid-finalize");
    equal((await invoke(endpoint("valid-finalize"), "POST", valid())).response.status, 200, "Separate valid finalization report accepted");
    equal((await invoke(endpoint("valid-finalize") + "/confirm", "POST", {})).response.status, 200, "Valid full report reaches finalization");
    equal((await pool.query("SELECT is_complete,home_score,away_score FROM games WHERE id='valid-finalize'")).rows[0], { is_complete: true, home_score: 1, away_score: 0 }, "Official game stores validated scores");
    const stats = (await pool.query("SELECT player_id,games,ab,r,h,ip_outs FROM player_season_stats ORDER BY player_id")).rows;
    equal(stats.length, 18, "Exactly one season row per participating player, including two-way players");
    equal(stats.map(row => row.player_id), [...Array.from({ length: 9 }, (_, i) => `away-${i}`), ...Array.from({ length: 9 }, (_, i) => `home-${i}`)], "All and only mapped roster IDs reach season stats");
    equal(stats.reduce((sum, row) => sum + row.r, 0), 1, "Basic reported runs preserved");
    equal(stats.reduce((sum, row) => sum + row.h, 0), 1, "Basic reported hits preserved");
    equal(stats.filter(row => row.ip_outs > 0).map(row => [row.player_id, row.ip_outs]), [["away-0", 24], ["home-0", 27]], "Reported pitching outs reach matched players");
    await newGame("score-only");
    equal((await invoke(endpoint("score-only"), "POST", { homeScore: 1, awayScore: 0, overrideReason: "Synthetic score-only exception" })).response.status, 200, "Existing commissioner score-only submission preserved");
    const beforeScoreOnlyStats = (await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows;
    equal((await invoke(endpoint("score-only") + "/finalize", "POST", {})).response.status, 200, "Commissioner score-only result still finalizes");
    equal((await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows, beforeScoreOnlyStats, "Score-only finalization adds no fabricated player lines");

    // Summary-only legacy reports contain real observations even without
    // per-player data. The explicit-unknown path must not erase those totals.
    await newGame("known-summaries");
    equal((await invoke(endpoint("known-summaries"), "POST", { homeScore: 2, awayScore: 1,
      homeHits: 3, awayHits: 1, homeErrors: 0, awayErrors: 2, overrideReason: "Synthetic known team summaries" })).response.status, 200, "Commissioner report accepts known team totals without player data");
    equal((await invoke(endpoint("known-summaries") + "/finalize", "POST", {})).response.status, 200, "Known team summaries finalize successfully");
    const knownSummaryBox = JSON.parse((await pool.query("SELECT box_score FROM games WHERE id='known-summaries'")).rows[0].box_score);
    equal([knownSummaryBox.home.totals.r, knownSummaryBox.home.totals.h, knownSummaryBox.home.errors,
      knownSummaryBox.away.totals.r, knownSummaryBox.away.totals.h, knownSummaryBox.away.errors], [2, 3, 0, 1, 1, 2], "Finalization preserves supplied runs, hits and errors instead of discarding the box");
    equal((await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows, beforeScoreOnlyStats, "Known team summaries still fabricate no player stat lines");

    // Exercise the real upgrade from the original required summary columns,
    // with existing reports present, rather than relying only on a fresh schema.
    const reportDataBeforeUpgrade = (await pool.query("SELECT to_jsonb(r) - 'edit_version' AS data FROM game_reports r ORDER BY id")).rows;
    for (const column of ["home_hits", "away_hits", "home_errors", "away_errors"]) {
      await pool.query(`ALTER TABLE game_reports ALTER COLUMN ${column} SET NOT NULL`);
    }
    await pool.query("ALTER TABLE game_reports DROP COLUMN edit_version");
    await pool.query("DELETE FROM db_schema_migrations WHERE migration_key IN ('0050_report_unknown_summaries','0051_report_edit_version')");
    equal(await checkMigrationVersion(pool), false, "Schema readiness fails before the required unknown-summary migration");
    const upgraded = await runMigrations(pool);
    equal(upgraded.applied, ["0050_report_unknown_summaries", "0051_report_edit_version"], "Populated database upgrades both missing report migrations in order");
    equal(upgraded.version, "0051_report_edit_version", "Edit-version migration is the recorded schema head");
    equal(await checkMigrationVersion(pool), true, "Schema readiness succeeds after the required migration is recorded");
    equal((await pool.query("SELECT to_jsonb(r) - 'edit_version' AS data FROM game_reports r ORDER BY id")).rows, reportDataBeforeUpgrade, "Report upgrades preserve all existing report data intact");
    equal((await pool.query("SELECT DISTINCT edit_version FROM game_reports")).rows, [{ edit_version: 1 }], "Edit-version migration backfills existing reports to version one");
    equal((await pool.query("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='game_reports' AND column_name IN ('home_hits','away_hits','home_errors','away_errors') ORDER BY column_name")).rows.map(row => row.is_nullable), ["YES", "YES", "YES", "YES"], "All four report summary columns allow explicit unknown values after upgrade");

    await newGame("mixed-summaries");
    equal((await invoke(endpoint("mixed-summaries"), "POST", { homeScore: 2, awayScore: 1,
      homeHits: 3, awayHits: null, homeErrors: null, awayErrors: 2, overrideReason: "Synthetic partially known team summaries" })).response.status, 200, "Commissioner can retain a mix of known and unknown team summaries");
    equal((await invoke(endpoint("mixed-summaries") + "/finalize", "POST", {})).response.status, 200, "Mixed known and unknown summaries finalize");
    const mixedSummaryBox = JSON.parse((await pool.query("SELECT box_score FROM games WHERE id='mixed-summaries'")).rows[0].box_score);
    equal([mixedSummaryBox.home.totals, mixedSummaryBox.home.errors], [{ r: 2, h: 3 }, null], "Finalized home summary preserves known hits and unknown errors without inventing other counters");
    equal([mixedSummaryBox.away.totals, mixedSummaryBox.away.errors], [{ r: 1, h: null }, 2], "Finalized away summary preserves unknown hits and known errors without inventing other counters");
    equal((await pool.query("SELECT home_hits,away_hits,home_errors,away_errors FROM game_reports WHERE game_id='mixed-summaries'")).rows[0], { home_hits: 3, away_hits: null, home_errors: null, away_errors: 2 }, "Finalization also preserves the mixed summary observations in the report");
    equal((await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows, beforeScoreOnlyStats, "Mixed team summaries fabricate no player statistics");

    // Optimistic edit versions prevent a stale commissioner tab from silently
    // replacing a newer result. All rejection snapshots include every public
    // table except session expiry bookkeeping.
    await newGame("edit-version");
    equal((await invoke(endpoint("edit-version"), "POST", valid())).response.status, 200, "Version fixture submission accepted");
    equal((await invoke(endpoint("edit-version"))).data.editVersion, 1, "Initial report fetch exposes the edit version to clients");
    const versionPayload = (expectedEditVersion: unknown) => ({ ...valid(), expectedEditVersion });
    for (const version of [undefined, null, 0, -1, 1.5, "1", true, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
      const beforeVersion = await snapshot();
      const rejected = await invoke(endpoint("edit-version"), "PATCH", versionPayload(version));
      equal(rejected.response.status, 422, "Missing or malformed expected edit version rejected");
      equal(rejected.data.validationErrors?.some((issue: any) => issue.field === "expectedEditVersion"), true, "Invalid version identifies the actionable field");
      equal(await snapshot(), beforeVersion, "Malformed version changes no persisted state");
    }
    const auditCount = async () => Number((await pool!.query("SELECT count(*) FROM audit_logs WHERE action='Game Report Edited'")).rows[0].count);
    const auditsBeforeRace = await auditCount();
    const contenders = [versionPayload(1), { ...versionPayload(1), homeErrors: 1 }];
    const edits = await Promise.all(contenders.map(data => invoke(endpoint("edit-version"), "PATCH", data)));
    equal(edits.map(result => result.response.status).sort(), [200, 409], "Two concurrent edits from one version yield exactly one success and one conflict");
    const winningIndex = edits.findIndex(result => result.response.status === 200);
    const winningEdit = edits[winningIndex];
    equal(winningEdit.data.editVersion, 2, "Concurrent winner returns exactly one version increment");
    equal((await invoke(endpoint("edit-version"))).data.editVersion, 2, "Refetch after a conflict exposes the winning current version");
    equal((await pool.query("SELECT edit_version,home_errors FROM game_reports WHERE game_id='edit-version'")).rows[0],
      { edit_version: 2, home_errors: contenders[winningIndex].homeErrors }, "Stored report contains only the winning edit");
    equal(await auditCount(), auditsBeforeRace + 1, "Concurrent edit pair writes exactly one edit audit");
    const winnerAudit = (await pool.query("SELECT user_id,details FROM audit_logs WHERE action='Game Report Edited' ORDER BY timestamp DESC LIMIT 1")).rows[0];
    equal(winnerAudit.user_id, registration.data.id, "Winning edit audit identifies the authenticated actor");
    equal(JSON.parse(winnerAudit.details), { gameId: "edit-version", reportId: winningEdit.data.id,
      previousEditVersion: 1, editVersion: 2, awayScore: 0, homeScore: 1 }, "Winning edit audit binds game, report, both versions, and accepted scores");
    const beforeStale = await snapshot();
    equal((await invoke(endpoint("edit-version"), "PATCH", versionPayload(1))).response.status, 409, "Already-used edit version conflicts");
    equal(await snapshot(), beforeStale, "Stale edit preserves every persisted table");
    equal((await invoke(endpoint("edit-version"), "PATCH", versionPayload(2))).response.status, 200, "Reloaded current version can be edited");
    equal((await pool.query("SELECT edit_version FROM game_reports WHERE game_id='edit-version'")).rows[0].edit_version, 3, "Subsequent accepted edit advances to version three");

    // Force the audit insert to fail inside this owned fixture. The report
    // itself must roll back with it; a successful edit without evidence is unsafe.
    await pool.query("CREATE FUNCTION reject_fixture_edit_audit() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN IF NEW.action = 'Game Report Edited' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $fixture$");
    await pool.query("CREATE TRIGGER reject_fixture_edit_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fixture_edit_audit()");
    try {
      const beforeAuditFailure = await snapshot();
      equal((await invoke(endpoint("edit-version"), "PATCH", { ...versionPayload(3), homeErrors: 2 })).response.status, 500, "Failed audit insert rejects the edit");
      equal(await snapshot(), beforeAuditFailure, "Audit failure rolls back report changes and version increment atomically");
    } finally {
      await pool.query("DROP TRIGGER reject_fixture_edit_audit ON audit_logs");
      await pool.query("DROP FUNCTION reject_fixture_edit_audit()");
    }
    for (const state of ["complete", "receipt", "confirmed", "rejected"]) {
      const gameId = 'edit-locked-' + state;
      await newGame(gameId);
      equal((await invoke(endpoint(gameId), "POST", valid())).response.status, 200, "Closed-state edit fixture submitted");
      if (state === "complete") await pool.query("UPDATE games SET is_complete=true WHERE id=$1", [gameId]);
      else if (state === "receipt") await pool.query("INSERT INTO game_finalizations (game_id,finalizer) VALUES ($1,'synthetic-receipt')", [gameId]);
      else await pool.query("UPDATE game_reports SET status=$1 WHERE game_id=$2", [state, gameId]);
      const beforeClosedEdit = await snapshot();
      equal((await invoke(endpoint(gameId), "PATCH", versionPayload(1))).response.status, 409, state + " report cannot be edited");
      equal(await snapshot(), beforeClosedEdit, state + " edit rejection preserves all persisted tables");
    }
    await newGame("edit-disputed");
    equal((await invoke(endpoint("edit-disputed"), "POST", valid())).response.status, 200, "Disputed edit fixture submitted");
    await pool.query("UPDATE game_reports SET status='disputed' WHERE game_id='edit-disputed'");
    equal((await invoke(endpoint("edit-disputed"), "PATCH", versionPayload(1))).response.status, 200, "Disputed unfinalized report remains editable with current version");

    // Commissioner metadata and on-behalf reporting use real sessions, not client role hints.
    // Keep this matrix after the original finalization assertions so extra pending reports
    // cannot change that fixture's participant/stat expectations.
    const primary = { id: registration.data.id as string, cookie };
    const actors: Record<string, { id: string; cookie: string }> = { primary };
    for (const role of ["co", "involved", "away", "unrelated", "outsider"]) {
      cookie = "";
      const registered = await invoke("/api/auth/register", "POST", { email: `reports-${role}@example.test`, password: "synthetic-reports-password" });
      equal(registered.response.status, 200, `Real ${role} actor registration`);
      actors[role] = { id: registered.data.id, cookie: registered.response.headers.get("set-cookie")!.split(";")[0] };
    }
    await pool.query("UPDATE leagues SET co_commissioner_ids=$1 WHERE id='report-league'", [JSON.stringify([actors.co.id])]);
    await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ('unrelated-team','report-league','Other fixture','Owls','OTH','Test','IA',false)");
    for (const [role, teamId] of [["involved", "home"], ["away", "away"], ["unrelated", "unrelated-team"]]) {
      await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name) VALUES ($1,$2,$3,'report-league','Synthetic',$4)", [`coach-${role}`, actors[role].id, teamId, role]);
    }
    await newGame("role-matrix");
    for (const [role, expected] of [
      ["primary", { isCommissioner: true, isInvolvedCoach: false, requiresOverrideReason: true }],
      ["co", { isCommissioner: true, isInvolvedCoach: false, requiresOverrideReason: true }],
      ["involved", { isCommissioner: false, isInvolvedCoach: true, requiresOverrideReason: false }],
      ["unrelated", { isCommissioner: false, isInvolvedCoach: false, requiresOverrideReason: false }],
    ] as const) {
      cookie = actors[role].cookie;
      const result = await invoke("/api/leagues/report-league/games/role-matrix");
      equal(result.response.status, 200, `${role} can read member game metadata`);
      equal(result.response.headers.get("cache-control"), "private, no-store", `${role} personalized reporting metadata cannot enter shared caches`);
      equal(result.data.reporting, expected, `${role} metadata contains only server-derived permission booleans`);
    }
    cookie = actors.outsider.cookie;
    const outsiderGame = await invoke("/api/leagues/report-league/games/role-matrix");
    equal(outsiderGame.response.status, 403, "Outsider cannot read league game metadata");
    equal(outsiderGame.data.reporting, undefined, "Outsider receives no reporting metadata or identity data");
    await pool.query("INSERT INTO leagues (id,name,commissioner_id,game_mode,current_phase,is_test_data) VALUES ('other-report-league','Other report fixture',$1,'reported','regular_season',true)", [primary.id]);
    cookie = primary.cookie;
    const crossLeagueGame = await invoke("/api/leagues/other-report-league/games/role-matrix");
    equal(crossLeagueGame.response.status, 404, "Commissioner cannot read a game through the wrong league route");
    equal(crossLeagueGame.data.reporting, undefined, "Wrong-league game response exposes no reporting metadata");

    const invalidReasons: Array<[string, (data: any) => void]> = [
      ["missing", d => delete d.overrideReason],
      ["blank", d => d.overrideReason = " \n\t "],
      ["number", d => d.overrideReason = 123],
      ["object", d => d.overrideReason = { reason: "client supplied object" }],
      ["array", d => d.overrideReason = ["client supplied array"]],
      ["over limit", d => d.overrideReason = "x".repeat(2001)],
      ["forged reason exemption", d => { delete d.overrideReason; d.requiresOverrideReason = false; d.isInvolvedCoach = true; d.reporting = { requiresOverrideReason: false, isInvolvedCoach: true }; }],
    ];
    for (const role of ["primary", "co"]) {
      cookie = actors[role].cookie;
      for (const [label, mutate] of invalidReasons) {
        const data = valid(); mutate(data);
        const before = await snapshot();
        const rejected = await invoke(endpoint("role-matrix"), "POST", data);
        equal(rejected.response.status, 422, `${role} rejects ${label} on-behalf reason`);
        equal(rejected.data.validationErrors?.some((issue: any) => issue.field === "overrideReason" && issue.severity === "error"), true, `${role} ${label} reason has actionable field feedback`);
        equal(await snapshot(), before, `${role} ${label} reason rejection performs no persisted writes`);
      }
    }
    for (const role of ["unrelated", "outsider"]) {
      cookie = actors[role].cookie;
      const before = await snapshot();
      const forged = { ...valid(), isCommissioner: true, isInvolvedCoach: true, requiresOverrideReason: false,
        reporting: { isCommissioner: true, isInvolvedCoach: true, requiresOverrideReason: false },
        reporterUserId: primary.id, reporterTeamId: "home", role: "commissioner" };
      equal((await invoke(endpoint("role-matrix"), "POST", forged)).response.status, 403, `${role} cannot forge commissioner or involved-coach authority`);
      equal(await snapshot(), before, `Forged ${role} authority performs no persisted writes`);
    }
    cookie = actors.involved.cookie;
    const beforeCoachForgery = await snapshot();
    equal((await invoke(endpoint("role-matrix"), "POST", { homeScore: 1, awayScore: 0, isCommissioner: true,
      reporting: { isCommissioner: true }, overrideReason: "Forged commissioner exception" })).response.status, 422, "Involved coach cannot forge the commissioner score-only exception");
    equal(await snapshot(), beforeCoachForgery, "Forged coach exception performs no persisted writes");

    // Coaching an unrelated team does not make a co-commissioner involved in this game.
    await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ('co-unrelated-team','report-league','Commissioner other fixture','Owls','COO','Test','IA',false)");
    await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name) VALUES ('coach-co-unrelated',$1,'co-unrelated-team','report-league','Synthetic','Co')", [actors.co.id]);
    cookie = actors.co.cookie;
    equal((await invoke("/api/leagues/report-league/games/role-matrix")).data.reporting,
      { isCommissioner: true, isInvolvedCoach: false, requiresOverrideReason: true }, "Commissioner coaching another team still needs on-behalf reason");
    const noReason: any = valid(); delete noReason.overrideReason;
    const beforeUnrelatedCommissioner = await snapshot();
    equal((await invoke(endpoint("role-matrix"), "POST", noReason)).response.status, 422, "Unrelated-team co-commissioner cannot omit reason");
    equal(await snapshot(), beforeUnrelatedCommissioner, "Unrelated-team commissioner missing reason performs no persisted writes");

    for (const role of ["primary", "co"]) {
      const gameId = `on-behalf-${role}`;
      await newGame(gameId);
      cookie = actors[role].cookie;
      const reason = `${role}: recording the coaches' agreed synthetic result`;
      const accepted = await invoke(endpoint(gameId), "POST", { ...valid(), overrideReason: `  ${reason}\n ` });
      equal(accepted.response.status, 200, `${role} on-behalf report with reason accepted`);
      const stored = (await pool.query("SELECT id,status,reporter_user_id,reporter_team_id FROM game_reports WHERE game_id=$1", [gameId])).rows[0];
      equal([stored.status, stored.reporter_user_id, stored.reporter_team_id], ["pending", actors[role].id, null], `${role} on-behalf report stays pending with genuine actor and no invented coaching team`);
      equal((await pool.query("SELECT is_complete FROM games WHERE id=$1", [gameId])).rows[0].is_complete, false, `${role} on-behalf submission does not finalize game`);
      const audit = (await pool.query("SELECT details FROM audit_logs WHERE user_id=$1 AND action='Game Report Submitted' ORDER BY timestamp DESC LIMIT 1", [actors[role].id])).rows[0]?.details as string;
      equal(typeof audit, "string", `${role} submission writes audit evidence`);
      equal(audit.includes(gameId) && audit.includes(stored.id), true, `${role} audit binds game and report IDs`);
      equal(audit.includes(reason) && !audit.includes(`  ${reason}`) && !audit.includes(`${reason}\n `), true, `${role} audit preserves trimmed on-behalf reason`);
      const notifications = (await pool.query("SELECT user_id,title,body,cta_url FROM coach_messages WHERE league_id='report-league' AND metadata->>'gameId'=$1 ORDER BY user_id,title", [gameId])).rows;
      equal(notifications.filter(row => row.title === "Report awaiting confirmation").map(row => row.user_id).sort(), [actors.involved.id, actors.away.id].sort(), `${role} on-behalf report notifies exactly both participating coaches`);
      equal(notifications.filter(row => row.title === "Game report submitted").map(row => row.user_id), [actors[role].id], `${role} gets exactly one submitted receipt and no self-pending notification`);
      equal(notifications.filter(row => row.title === "Report awaiting confirmation").every(row => row.body.includes("a commissioner reported this result on behalf") && row.cta_url === "/league/report-league/schedule"), true, `${role} pending notices truthfully identify on-behalf reporting and link to the schedule`);
    }

    const scoreOnlyPayload = () => buildScoreOnlyReport({ homeScore: 2, awayScore: 1, overrideReason: "Synthetic explicit score-only exception" });
    for (const role of ["primary", "co"]) {
      const gameId = `explicit-score-only-${role}`;
      await newGame(gameId); cookie = actors[role].cookie;
      const missingReason: any = scoreOnlyPayload(); delete missingReason.overrideReason;
      const beforeMissingReason = await snapshot();
      equal((await invoke(endpoint(gameId), "POST", missingReason)).response.status, 422, `${role} explicit score-only still requires the on-behalf reason`);
      equal(await snapshot(), beforeMissingReason, `${role} missing score-only reason performs no writes`);
      const submitted = await invoke(endpoint(gameId), "POST", scoreOnlyPayload());
      equal(submitted.response.status, 200, `${role} explicit score-only report succeeds`);
      equal(submitted.data.status, "pending", `${role} explicit score-only report awaits confirmation`);
      const reportBeforeFinalization = (await pool.query("SELECT home_hits,away_hits,home_errors,away_errors,inning_scores,home_box_data,away_box_data FROM game_reports WHERE game_id=$1", [gameId])).rows[0];
      equal(Object.values(reportBeforeFinalization), [null, null, null, null, null, null, null], `${role} unknown summaries and absent box data remain null in storage`);
      const notices = (await pool.query("SELECT user_id FROM coach_messages WHERE metadata->>'gameId'=$1 AND title='Report awaiting confirmation' ORDER BY user_id", [gameId])).rows;
      equal(notices.map(row => row.user_id), [actors.involved.id, actors.away.id].sort(), `${role} score-only report notifies both affected coaches`);
      const beforeStats = (await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows;
      const finalizationPath = role === "primary" ? "/confirm" : "/finalize";
      equal((await invoke(endpoint(gameId) + finalizationPath, "POST", {})).response.status, 200, `${role} score-only result finalizes through the real ${finalizationPath} route`);
      equal((await pool.query("SELECT is_complete,home_score,away_score,box_score FROM games WHERE id=$1", [gameId])).rows[0], { is_complete: true, home_score: 2, away_score: 1, box_score: null }, `${role} finalized score-only game stores scores without a fabricated box score`);
      equal((await pool.query("SELECT home_hits,away_hits,home_errors,away_errors,inning_scores,home_box_data,away_box_data FROM game_reports WHERE game_id=$1", [gameId])).rows[0], reportBeforeFinalization, `${role} finalization preserves unknown report summaries`);
      equal((await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows, beforeStats, `${role} explicit score-only finalization fabricates no player statistics`);
      if (role === "primary") {
        const confirmedMessages = async () => (await pool!.query("SELECT user_id,body FROM coach_messages WHERE metadata->>'gameId'=$1 AND title='Report confirmed' ORDER BY user_id", [gameId])).rows;
        let messages = await confirmedMessages();
        for (let attempt = 0; messages.length < 2 && attempt < 40; attempt++) {
          await new Promise(done => setTimeout(done, 25));
          messages = await confirmedMessages();
        }
        equal(messages.map(row => row.user_id), [actors.involved.id, actors.away.id].sort(), "Score-only confirmation reaches both coaches");
        equal(messages.map(row => row.body), Array(2).fill("Fixture away 1 @ Fixture home 2 — final. Result recorded."), "Score-only confirmation does not falsely claim player statistics were updated");
      }
    }
    await newGame("score-only-forged");
    cookie = actors.involved.cookie;
    const beforeExplicitForgery = await snapshot();
    equal((await invoke(endpoint("score-only-forged"), "POST", { ...scoreOnlyPayload(), isCommissioner: true, reporting: { isCommissioner: true } })).response.status, 422, "Coach cannot submit explicit-null score-only by forging client permissions");
    equal(await snapshot(), beforeExplicitForgery, "Explicit-null score-only forgery performs no writes");
    // Maximum accepted reason must be stored intact, rather than silently truncated.
    await newGame("reason-limit");
    cookie = primary.cookie;
    const limitReason = "b".repeat(2000);
    equal((await invoke(endpoint("reason-limit"), "POST", { ...valid(), overrideReason: `  ${limitReason}\n ` })).response.status, 200, "Exactly 2000 trimmed reason characters are accepted");
    equal((await pool.query("SELECT details FROM audit_logs WHERE user_id=$1 AND action='Game Report Submitted' ORDER BY timestamp DESC LIMIT 1", [primary.id])).rows[0].details.includes(limitReason), true, "Maximum reason is retained intact in audit");

    for (const role of ["involved", "primary"]) {
      if (role === "primary") {
        await pool.query("UPDATE coaches SET team_id=NULL WHERE id='coach-away'");
        await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name) VALUES ('coach-primary',$1,'away','report-league','Synthetic','Primary')", [primary.id]);
      }
      const gameId = `as-coach-${role}`;
      await newGame(gameId);
      cookie = actors[role].cookie;
      const metadata = await invoke(`/api/leagues/report-league/games/${gameId}`);
      equal(metadata.data.reporting, { isCommissioner: role === "primary", isInvolvedCoach: true, requiresOverrideReason: false }, `${role} acting as involved coach needs no override reason`);
      const data: any = valid(); delete data.overrideReason;
      const accepted = await invoke(endpoint(gameId), "POST", data);
      equal(accepted.response.status, 200, `${role} involved-coach report succeeds without reason`);
      equal(accepted.data.status, "pending", `${role} involved-coach report against human opponent remains pending`);
      equal(accepted.data.reporterTeamId, role === "primary" ? "away" : "home", `${role} coaching report retains actual coaching team`);
      const audit = (await pool.query("SELECT details FROM audit_logs WHERE user_id=$1 AND action='Game Report Submitted' ORDER BY timestamp DESC LIMIT 1", [actors[role].id])).rows[0].details as string;
      equal(audit.includes("commissioner override:"), false, `${role} normal coaching submission has no invented override reason`);
      const pendingMessages = (await pool.query("SELECT user_id,body FROM coach_messages WHERE metadata->>'gameId'=$1 AND title='Report awaiting confirmation'", [gameId])).rows;
      equal(pendingMessages.map(row => row.user_id), [role === "primary" ? actors.involved.id : actors.away.id], `${role} normal coaching report notifies only the opponent`);
      equal(pendingMessages.every(row => row.body.includes("the other coach submitted a score")), true, `${role} normal coaching report keeps truthful coach wording`);
    }
    console.log(`[reported-result-test] PASS ${checks} assertions: real HTTP, shared validation, and no-write rejection snapshots`);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("Owned HTTP child stop timeout")), 10000);
      child!.once("exit", () => { clearTimeout(timer); done(); }); child!.kill();
    });
    await pool?.end();
    try { if (created) await admin.query(`DROP DATABASE "${name}"`); } finally { await admin.end(); }
  }
}
