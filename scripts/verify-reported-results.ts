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
  const { finalizeReportedGame, finalizeGameAtomic, flushCoachXp } = await import("../server/game-finalizer");
  const { publicErrorHandler } = await import("../server/lib/httpErrors");
  const app = express(); app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  app.use(publicErrorHandler);
  const effectsAccum = new Map();
  process.on("message", async (message: any) => {
    if (message?.kind === "effects-finalize" || message?.kind === "effects-flush") {
      try {
        if (message.kind === "effects-flush") await flushCoachXp(effectsAccum);
        else await Promise.all(message.games.map(async (request: any) => {
          const game = await storage.getGame(request.gameId); assert(game);
          await finalizeGameAtomic(game, request.homeScore ?? 2, request.awayScore ?? 1, request.box ?? null, game.leagueId, {
            skipPlayerStats: !request.box, skipPitcherRest: true, finalizer: "synthetic-coach-effects",
            ...(request.accumulate ? { coachXpAccum: effectsAccum } : {}),
            ...(request.skipCoachXp ? { skipCoachXp: true } : {}),
          });
        }));
        process.send?.({ kind: "effects-result", error: null, accumulator: [...effectsAccum] });
      } catch (error) {
        process.send?.({ kind: "effects-result", error: error instanceof Error ? error.constructor.name : "UnknownError", accumulator: [...effectsAccum] });
      }
      return;
    }
    if (!["direct-finalize", "generic-finalize"].includes(message?.kind)) return;
    try {
      const game = await storage.getGame(message.gameId);
      const report = await storage.getGameReport(message.gameId);
      assert(game && report);
      if (message.kind === "generic-finalize") await finalizeGameAtomic(game, 2, 1, null, game.leagueId, { skipPlayerStats: true, skipPitcherRest: true, finalizer: "synthetic-generic" });
      else await finalizeReportedGame(report, game, game.leagueId);
      process.send?.({ kind: "direct-result", error: null });
    } catch (error) {
      process.send?.({ kind: "direct-result", error: error instanceof Error ? error.constructor.name : "UnknownError" });
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
  let childErrors = "";
  const sessionSecret = randomUUID() + randomUUID();
  const equal = (actual: unknown, expected: unknown, label: string) => { try { assert.deepEqual(actual, expected, label); checks++; } catch (error) { console.error(childErrors); throw error; } };
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
    const startHttp = async () => {
      childErrors = "";
      child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--http-child"], { cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"], env: { ...process.env, PAWA_TEST_DATABASE_URL: url.toString(), SESSION_SECRET: sessionSecret } });
      child.stderr!.on("data", data => { childErrors = (childErrors + data.toString()).slice(-12000); });
      const ready = await waitForMessage("ready", () => {}); origin = `http://127.0.0.1:${ready.port}`;
    };
    const stopHttp = async () => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>((done, reject) => {
        const timer = setTimeout(() => reject(new Error("Owned HTTP child restart timeout")), 10000);
        child!.once("exit", () => { clearTimeout(timer); done(); }); child!.kill();
      });
    };
    await startHttp();
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
      equal((await invoke(endpoint("submit") + "/dispute", "POST", { expectedEditVersion: 2, reason: "Synthetic correction", correctedHomeScore: scores[0], correctedAwayScore: scores[1] })).response.status, 422, "Invalid corrected score rejected before dispute write");
      equal(await snapshot(), before, "Invalid dispute changes no persistent state");
    }
    equal((await invoke(endpoint("submit") + "/dispute", "POST", { expectedEditVersion: 2, reason: "Synthetic correction", correctedHomeScore: 2, correctedAwayScore: 0 })).response.status, 200, "Valid correction proposal recorded");
    let before = await snapshot();
    equal((await invoke(endpoint("submit") + "/finalize", "POST", { useCorrectedScore: true, expectedEditVersion: 3 })).response.status, 422, "Correction inconsistent with innings/batting cannot finalize");
    equal(await snapshot(), before, "Inconsistent correction changes no persistent state");
    const invalidBox = valid().homeBoxData; invalidBox.batting[0].playerId = "away-0";
    await pool.query("UPDATE game_reports SET status='pending',home_box_data=$1 WHERE game_id='submit'", [JSON.stringify(invalidBox)]);
    for (const suffix of ["/confirm", "/finalize"]) {
      before = await snapshot();
      equal((await invoke(endpoint("submit") + suffix, "POST", { expectedEditVersion: 3 })).response.status, 422, `Persisted foreign player blocked at ${suffix}`);
      equal(await snapshot(), before, "Invalid persisted report performs no finalization writes");
    }
    before = await snapshot();
    const direct = await waitForMessage("direct-result", () => child!.send({ kind: "direct-finalize", gameId: "submit" }));
    equal(direct.error, "ReportValidationError", "Direct service invocation also revalidates");
    equal(await snapshot(), before, "Direct service rejection changes no persistent state");
    await pool.query("UPDATE games SET is_complete=true WHERE id='submit'");
    before = await snapshot();
    equal((await invoke(endpoint("submit") + "/confirm", "POST", { expectedEditVersion: 3 })).response.status, 422, "Already-complete confirmation branch also revalidates");
    equal(await snapshot(), before, "Invalid already-complete report stays unconfirmed");
    await newGame("valid-finalize");
    equal((await invoke(endpoint("valid-finalize"), "POST", valid())).response.status, 200, "Separate valid finalization report accepted");
    equal((await invoke(endpoint("valid-finalize") + "/confirm", "POST", { expectedEditVersion: 1 })).response.status, 200, "Valid full report reaches finalization");
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
    equal((await invoke(endpoint("score-only") + "/finalize", "POST", { expectedEditVersion: 1 })).response.status, 200, "Commissioner score-only result still finalizes");
    equal((await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows, beforeScoreOnlyStats, "Score-only finalization adds no fabricated player lines");

    // Summary-only legacy reports contain real observations even without
    // per-player data. The explicit-unknown path must not erase those totals.
    await newGame("known-summaries");
    equal((await invoke(endpoint("known-summaries"), "POST", { homeScore: 2, awayScore: 1,
      homeHits: 3, awayHits: 1, homeErrors: 0, awayErrors: 2, overrideReason: "Synthetic known team summaries" })).response.status, 200, "Commissioner report accepts known team totals without player data");
    equal((await invoke(endpoint("known-summaries") + "/finalize", "POST", { expectedEditVersion: 1 })).response.status, 200, "Known team summaries finalize successfully");
    const knownSummaryBox = JSON.parse((await pool.query("SELECT box_score FROM games WHERE id='known-summaries'")).rows[0].box_score);
    equal([knownSummaryBox.home.totals.r, knownSummaryBox.home.totals.h, knownSummaryBox.home.errors,
      knownSummaryBox.away.totals.r, knownSummaryBox.away.totals.h, knownSummaryBox.away.errors], [2, 3, 0, 1, 1, 2], "Finalization preserves supplied runs, hits and errors instead of discarding the box");
    equal((await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows, beforeScoreOnlyStats, "Known team summaries still fabricate no player stat lines");

    // Exercise the real upgrade from the original required summary columns,
    // with existing reports present, rather than relying only on a fresh schema.
    const reportDataBeforeUpgrade = (await pool.query("SELECT to_jsonb(r) - 'edit_version' AS data FROM game_reports r ORDER BY id")).rows;
    await pool.query("DROP TABLE game_coach_effects");
    await pool.query("DROP TABLE game_report_revisions CASCADE");
    for (const column of ["report_revision_id", "report_id", "requested_edit_version", "accepted_by_user_id", "report_action", "report_resolution"]) {
      await pool.query(`ALTER TABLE game_finalizations DROP COLUMN ${column}`);
    }
    for (const column of ["home_hits", "away_hits", "home_errors", "away_errors"]) {
      await pool.query(`ALTER TABLE game_reports ALTER COLUMN ${column} SET NOT NULL`);
    }
    await pool.query("ALTER TABLE game_reports DROP COLUMN edit_version");
    await pool.query("DELETE FROM db_schema_migrations WHERE migration_key IN ('0050_report_unknown_summaries','0051_report_edit_version','0052_report_history','0053_game_coach_effects')");
    equal(await checkMigrationVersion(pool), false, "Schema readiness fails before the required unknown-summary migration");
    const upgraded = await runMigrations(pool);
    equal(upgraded.applied, ["0050_report_unknown_summaries", "0051_report_edit_version", "0052_report_history", "0053_game_coach_effects"], "Populated database upgrades all missing report migrations in order");
    equal(upgraded.version, "0053_game_coach_effects", "Coach-effects migration is the recorded schema head");
    equal((await pool.query("SELECT * FROM game_coach_effects")).rows, [], "Migration does not invent coach-effect attribution for legacy finalizations");
    equal(await checkMigrationVersion(pool), true, "Schema readiness succeeds after the required migration is recorded");
    equal((await pool.query("SELECT to_jsonb(r) - 'edit_version' AS data FROM game_reports r ORDER BY id")).rows, reportDataBeforeUpgrade, "Report upgrades preserve all existing report data intact");
    equal((await pool.query("SELECT DISTINCT edit_version FROM game_reports")).rows, [{ edit_version: 1 }], "Edit-version migration backfills existing reports to version one");
    equal((await pool.query("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='game_reports' AND column_name IN ('home_hits','away_hits','home_errors','away_errors') ORDER BY column_name")).rows.map(row => row.is_nullable), ["YES", "YES", "YES", "YES"], "All four report summary columns allow explicit unknown values after upgrade");
    const legacyHistory = (await pool.query("SELECT report_id,edit_version,event,actor_user_id,snapshot FROM game_report_revisions ORDER BY report_id")).rows;
    equal(legacyHistory.length, reportDataBeforeUpgrade.length, "Migration records exactly one observed snapshot per legacy report, without inventing lost revisions");
    equal(legacyHistory.every(row => row.event === "legacy-observed" && row.actor_user_id === null && row.edit_version === 1), true, "Legacy baseline marks observation explicitly and does not infer a historical actor");
    equal(legacyHistory.every(row => row.snapshot.id === row.report_id && row.snapshot.editVersion === 1), true, "Legacy baseline binds the current report and version");
    equal(legacyHistory.every(row => row.snapshot.legacyTimestampTimezone === "unspecified" && !row.snapshot.createdAt.endsWith("Z")), true, "Legacy timestamps retain unknown timezone instead of inventing UTC provenance");
    equal((await pool.query("SELECT report_revision_id,report_id,requested_edit_version,accepted_by_user_id,report_action,report_resolution FROM game_finalizations")).rows.every(row => Object.values(row).every(value => value === null)), true, "Existing receipts retain unknown acceptance identity instead of being falsely attributed to a baseline");
    equal((await runMigrations(pool)).applied, [], "History migration is safely skipped on subsequent startup");

    await newGame("mixed-summaries");
    equal((await invoke(endpoint("mixed-summaries"), "POST", { homeScore: 2, awayScore: 1,
      homeHits: 3, awayHits: null, homeErrors: null, awayErrors: 2, overrideReason: "Synthetic partially known team summaries" })).response.status, 200, "Commissioner can retain a mix of known and unknown team summaries");
    equal((await invoke(endpoint("mixed-summaries") + "/finalize", "POST", { expectedEditVersion: 1 })).response.status, 200, "Mixed known and unknown summaries finalize");
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


    // Transition tokens describe both the report data and the decision state.
    // Invalid/stale requests must not touch any persistent table.
    await newGame("transition-version");
    equal((await invoke(endpoint("transition-version"), "POST", valid())).response.status, 200, "Transition token fixture submitted");
    for (const suffix of ["/confirm", "/dispute", "/finalize"]) {
      for (const version of [undefined, null, 0, -1, 1.5, "1", true, {}, [], 2147483648]) {
        const beforeInvalidToken = await snapshot();
        const rejected = await invoke(endpoint("transition-version") + suffix, "POST", { expectedEditVersion: version, reason: "Synthetic dispute" });
        equal(rejected.response.status, 422, suffix + " rejects missing or malformed decision token");
        equal(rejected.data.validationErrors?.some((issue: any) => issue.field === "expectedEditVersion"), true, suffix + " identifies the invalid version field");
        equal(await snapshot(), beforeInvalidToken, suffix + " invalid token preserves all tables");
      }
    }
    equal((await invoke(endpoint("transition-version"), "PATCH", versionPayload(1))).response.status, 200, "Edit advances transition fixture token");
    for (const suffix of ["/confirm", "/dispute", "/finalize"]) {
      const beforeStaleTransition = await snapshot();
      equal((await invoke(endpoint("transition-version") + suffix, "POST", { expectedEditVersion: 1, reason: "Stale synthetic dispute" })).response.status, 409, suffix + " rejects a previously edited snapshot");
      equal(await snapshot(), beforeStaleTransition, suffix + " stale token preserves all tables");
    }
    equal((await invoke(endpoint("transition-version") + "/dispute", "POST", { expectedEditVersion: 2, reason: "Review this observed result" })).response.status, 200, "Current version may be disputed");
    const disputedVersion = (await pool.query("SELECT id,status,edit_version,disputed_by_user_id FROM game_reports WHERE game_id='transition-version'")).rows[0];
    equal({ status: disputedVersion.status, version: disputedVersion.edit_version, actor: disputedVersion.disputed_by_user_id },
      { status: "disputed", version: 3, actor: registration.data.id }, "Dispute atomically advances decision token and records actor");
    const disputeAudit = (await pool.query("SELECT user_id,details FROM audit_logs WHERE action='Game Report Disputed' ORDER BY timestamp DESC LIMIT 1")).rows[0];
    equal(disputeAudit.user_id, registration.data.id, "Dispute audit identifies authenticated actor");
    const disputeEvidence = JSON.parse(disputeAudit.details);
    equal([disputeEvidence.gameId, disputeEvidence.reportId, disputeEvidence.previousEditVersion, disputeEvidence.editVersion],
      ["transition-version", disputedVersion.id, 2, 3], "Dispute audit identifies exactly the accepted report transition");
    for (const [method, suffix, payload] of [
      ["PATCH", "", versionPayload(2)],
      ["POST", "/confirm", { expectedEditVersion: 2 }],
      ["POST", "/finalize", { expectedEditVersion: 2 }],
      ["POST", "/dispute", { expectedEditVersion: 2, reason: "Duplicate dispute" }],
    ] as const) {
      const beforeDisputedStale = await snapshot();
      equal((await invoke(endpoint("transition-version") + suffix, method, payload)).response.status, 409, "Dispute invalidates stale " + method + suffix + " decision");
      equal(await snapshot(), beforeDisputedStale, "Stale post-dispute decision preserves all tables");
    }
    equal((await invoke(endpoint("transition-version") + "/finalize", "POST", { expectedEditVersion: 3 })).response.status, 200, "Commissioner may resolve current disputed version");
    equal((await pool.query("SELECT status,edit_version,confirmed_by_user_id FROM game_reports WHERE game_id='transition-version'")).rows[0],
      { status: "confirmed", edit_version: 4, confirmed_by_user_id: registration.data.id }, "Finalization and confirmation accept one new decision version");


    const reportedResolutionAudit = (await pool.query("SELECT details FROM audit_logs WHERE action='Game Report Force-Finalized' AND details::jsonb->>'gameId'='transition-version'")).rows;
    equal(reportedResolutionAudit.length, 1, "Reported-score resolution has exactly one acceptance audit");
    const reportedResolution = JSON.parse(reportedResolutionAudit[0].details);
    equal([reportedResolution.previousHomeScore, reportedResolution.previousAwayScore, reportedResolution.homeScore, reportedResolution.awayScore, reportedResolution.resolution],
      [1, 0, 1, 0, "reported"], "Default resolution audit preserves original and accepted reported scores");
    await newGame("corrected-resolution");
    const submittedCorrection = await invoke(endpoint("corrected-resolution"), "POST", { homeScore: 2, awayScore: 1, overrideReason: "Synthetic score-only correction review" });
    equal(submittedCorrection.response.status, 200, "Score-only correction fixture submitted");
    equal((await invoke(endpoint("corrected-resolution") + "/dispute", "POST", { expectedEditVersion: 1, reason: "Observed home total was three", correctedHomeScore: 3, correctedAwayScore: 1 })).response.status, 200, "Corrected-score proposal advances review version");
    equal((await invoke(endpoint("corrected-resolution") + "/finalize", "POST", { expectedEditVersion: 2, useCorrectedScore: true })).response.status, 200, "Commissioner accepts corrected score-only result");
    equal((await pool.query("SELECT home_score,away_score,status,edit_version FROM game_reports WHERE game_id='corrected-resolution'")).rows[0],
      { home_score: 3, away_score: 1, status: "confirmed", edit_version: 3 }, "Accepted correction and report confirmation commit together");
    equal((await pool.query("SELECT home_score,away_score,is_complete FROM games WHERE id='corrected-resolution'")).rows[0],
      { home_score: 3, away_score: 1, is_complete: true }, "Official result matches the accepted correction");
    const correctedResolutionAudits = (await pool.query("SELECT user_id,details FROM audit_logs WHERE action='Game Report Force-Finalized' AND details::jsonb->>'gameId'='corrected-resolution'")).rows;
    equal(correctedResolutionAudits.length, 1, "Corrected-score resolution has exactly one acceptance audit");
    equal(correctedResolutionAudits[0].user_id, registration.data.id, "Corrected-score acceptance audit binds authenticated commissioner");
    const correctedResolution = JSON.parse(correctedResolutionAudits[0].details);
    equal(correctedResolution, { gameId: "corrected-resolution", reportId: submittedCorrection.data.id, previousEditVersion: 2, editVersion: 3,
      homeScore: 3, awayScore: 1, previousHomeScore: 2, previousAwayScore: 1, resolution: "corrected" },
      "Atomic acceptance audit retains original scores, corrected scores, resolution choice and accepted versions");
    const correctedHistory = (await pool.query("SELECT id,event,snapshot FROM game_report_revisions WHERE game_id='corrected-resolution' ORDER BY edit_version")).rows;
    equal(correctedHistory.map(row => [row.snapshot.homeScore, row.snapshot.awayScore]), [[2, 1], [2, 1], [3, 1]], "Corrected acceptance retains submitted, disputed and accepted score observations separately");
    equal(correctedHistory[1].snapshot.disputeCorrectedHomeScore, 3, "Dispute revision preserves the proposed correction without rewriting original score observations");
    equal((await pool.query("SELECT report_revision_id,report_resolution FROM game_finalizations WHERE game_id='corrected-resolution'")).rows[0], { report_revision_id: correctedHistory[2].id, report_resolution: "corrected" }, "Corrected official result points to the exact accepted corrected snapshot");

    for (const state of ["complete", "receipt", "confirmed", "rejected"]) {
      const gameId = "transition-locked-" + state;
      await newGame(gameId);
      equal((await invoke(endpoint(gameId), "POST", valid())).response.status, 200, "Closed transition fixture submitted");
      if (state === "complete") await pool.query("UPDATE games SET is_complete=true WHERE id=$1", [gameId]);
      else if (state === "receipt") await pool.query("INSERT INTO game_finalizations (game_id,finalizer) VALUES ($1,'synthetic-receipt')", [gameId]);
      else await pool.query("UPDATE game_reports SET status=$1 WHERE game_id=$2", [state, gameId]);
      for (const suffix of ["/confirm", "/dispute", "/finalize"]) {
        const beforeClosedTransition = await snapshot();
        equal((await invoke(endpoint(gameId) + suffix, "POST", { expectedEditVersion: 1, reason: "Synthetic closed-state dispute" })).response.status, 409, state + " rejects " + suffix);
        equal(await snapshot(), beforeClosedTransition, state + " " + suffix + " preserves all tables");
      }
    }

    // Hold the real game row lock, queue both HTTP requests, then release it.
    // Waiting for each database lock makes the losing request read the old
    // report before the winner commits, reproducing the former TOCTOU window.
    const queuedRace = async (gameId: string, first: () => ReturnType<typeof invoke>, second: () => ReturnType<typeof invoke>) => {
      const blocker = await pool!.connect();
      let requests: Array<ReturnType<typeof invoke>> = [];
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT id FROM games WHERE id=$1 FOR UPDATE", [gameId]);
        const waitForBlockedRequests = async (count: number) => {
          const deadline = Date.now() + 8000;
          while (Date.now() < deadline) {
            const blocked = await pool!.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query ILIKE '%FOR UPDATE%'", [name]);
            if (blocked.rows[0].count >= count) return;
            await new Promise(done => setTimeout(done, 25));
          }
          throw new Error("Expected " + count + " report operations queued on the game lock");
        };
        requests.push(first()); await waitForBlockedRequests(1);
        requests.push(second()); await waitForBlockedRequests(2);
        await blocker.query("COMMIT");
        return await Promise.all(requests);
      } finally {
        await blocker.query("ROLLBACK"); blocker.release();
        await Promise.allSettled(requests);
      }
    };
    for (const first of ["submit", "quick-score"]) {
      const gameId = "race-create-" + first;
      await newGame(gameId);
      const create = () => invoke(endpoint(gameId), "POST", valid());
      const quickScore = () => invoke(`/api/leagues/report-league/games/${gameId}`, "PATCH", { homeScore: 2, awayScore: 1 });
      const race = await queuedRace(gameId, first === "submit" ? create : quickScore, first === "submit" ? quickScore : create);
      equal(race.map(result => result.response.status), [200, 409], first + " wins against competing initial submission/finalization through the common game lock");
      equal((await pool.query("SELECT is_complete FROM games WHERE id=$1", [gameId])).rows[0].is_complete, first === "quick-score", "Creation race completion belongs only to the winning operation");
      equal(Number((await pool.query("SELECT count(*) FROM game_reports WHERE game_id=$1", [gameId])).rows[0].count), first === "submit" ? 1 : 0, "Creation race cannot leave a pending report attached after quick-score completion");
      equal(Number((await pool.query("SELECT count(*) FROM game_report_revisions WHERE game_id=$1", [gameId])).rows[0].count), first === "submit" ? 1 : 0, "Creation race writes history only for the committed report");
    }
    for (const [first, second] of [
      ["edit", "confirm"], ["confirm", "edit"],
      ["dispute", "confirm"], ["confirm", "dispute"],
      ["edit", "finalize"], ["finalize", "edit"],
      ["confirm", "confirm"],
    ]) {
      const gameId = "race-" + first + "-" + second;
      await newGame(gameId);
      equal((await invoke(endpoint(gameId), "POST", valid())).response.status, 200, "Queued race fixture submitted");
      const submitDecision = (action: string) => action === "edit"
        ? invoke(endpoint(gameId), "PATCH", { ...versionPayload(1), homeErrors: 2 })
        : invoke(endpoint(gameId) + "/" + action, "POST", { expectedEditVersion: 1, reason: "Queued fixture dispute" });
      const race = await queuedRace(gameId, () => submitDecision(first), () => submitDecision(second));
      equal(race.map(result => result.response.status), first === second ? [200, 200] : [200, 409], first + " wins its queued race with " + second + "; identical acceptance replays while other stale decisions conflict");
      if (first === second) {
        equal(race.map(result => result.data.alreadyFinalized), [false, true], "Duplicate queued confirmation identifies exactly one durable replay");
        equal(race[1].data.receipt, race[0].data.receipt, "Concurrent duplicate confirmation returns the identical accepted-result receipt");
      }
      const storedRace = (await pool.query("SELECT status,edit_version,home_errors FROM game_reports WHERE game_id=$1", [gameId])).rows[0];
      const finalizes = ["confirm", "finalize"].includes(first);
      equal(storedRace, { status: finalizes ? "confirmed" : first === "dispute" ? "disputed" : "pending", edit_version: 2, home_errors: first === "edit" ? 2 : 0 }, "Only winning " + first + " mutation is persisted");
      equal((await pool.query("SELECT is_complete FROM games WHERE id=$1", [gameId])).rows[0].is_complete, finalizes, "Official completion matches the winning decision");
      equal(Number((await pool.query("SELECT count(*) FROM game_finalizations WHERE game_id=$1", [gameId])).rows[0].count), finalizes ? 1 : 0, "Race writes only the permitted finalization receipt");
      const raceAudits = (await pool.query("SELECT action,user_id,details FROM audit_logs WHERE action IN ('Game Report Edited','Game Report Confirmed','Game Report Force-Finalized','Game Report Disputed')")).rows
        .filter(row => JSON.parse(row.details).gameId === gameId);
      equal(raceAudits.length, 1, "Queued race writes exactly one mutation audit");
      equal(raceAudits[0].user_id, registration.data.id, "Winning race audit binds authenticated actor");
      const evidence = JSON.parse(raceAudits[0].details);
      equal([evidence.previousEditVersion, evidence.editVersion], [1, 2], "Winning race audit binds accepted version transition");
    }

    // Failure injection is confined to triggers in this owned random database.
    // An unavailable audit/correction store must roll back all core state.
    for (const suffix of ["confirm", "finalize", "dispute"]) {
      const gameId = "rollback-" + suffix;
      await newGame(gameId);
      equal((await invoke(endpoint(gameId), "POST", valid())).response.status, 200, "Atomic transition fixture submitted");
      await pool.query("CREATE FUNCTION reject_fixture_transition_audit() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN IF NEW.action IN ('Game Report Confirmed','Game Report Force-Finalized','Game Report Disputed') THEN RAISE EXCEPTION 'synthetic transition audit failure'; END IF; RETURN NEW; END $fixture$");
      await pool.query("CREATE TRIGGER reject_fixture_transition_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fixture_transition_audit()");
      try {
        const beforeAtomicFailure = await snapshot();
        equal((await invoke(endpoint(gameId) + "/" + suffix, "POST", { expectedEditVersion: 1, reason: "Rollback this dispute" })).response.status, 500, suffix + " audit failure rejects operation");
        equal(await snapshot(), beforeAtomicFailure, suffix + " audit failure rolls back report, official stats, standings, receipt and all other tables");
      } finally {
        await pool.query("DROP TRIGGER reject_fixture_transition_audit ON audit_logs");
        await pool.query("DROP FUNCTION reject_fixture_transition_audit()");
      }
      equal((await invoke(endpoint(gameId) + "/" + suffix, "POST", { expectedEditVersion: 1, reason: "Retry after transient audit failure" })).response.status, 200, suffix + " accepts the same token after rollback");
    }
    await newGame("correction-atomic");
    equal((await invoke(endpoint("correction-atomic"), "POST", valid())).response.status, 200, "Correction transaction fixture submitted");
    const correctionEdit = { ...versionPayload(1), homeErrors: 2, corrections: [{ fieldKey: "home.errors", fieldLabel: "Home errors", ocrValue: "0", correctedValue: "2" }] };
    await pool.query("CREATE FUNCTION reject_fixture_correction() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN RAISE EXCEPTION 'synthetic correction failure'; END $fixture$");
    await pool.query("CREATE TRIGGER reject_fixture_correction BEFORE INSERT ON game_report_corrections FOR EACH ROW EXECUTE FUNCTION reject_fixture_correction()");
    try {
      const beforeCorrectionFailure = await snapshot();
      equal((await invoke(endpoint("correction-atomic"), "PATCH", correctionEdit)).response.status, 500, "Correction insertion failure rejects edit");
      equal(await snapshot(), beforeCorrectionFailure, "Correction failure rolls back body, version, audit and correction rows together");
    } finally {
      await pool.query("DROP TRIGGER reject_fixture_correction ON game_report_corrections");
      await pool.query("DROP FUNCTION reject_fixture_correction()");
    }
    equal((await invoke(endpoint("correction-atomic"), "PATCH", correctionEdit)).response.status, 200, "Correction retry succeeds with unchanged token after rollback");
    equal((await pool.query("SELECT home_errors,edit_version FROM game_reports WHERE game_id='correction-atomic'")).rows[0], { home_errors: 2, edit_version: 2 }, "Correction commit advances report exactly once");
    equal((await pool.query("SELECT field_key,ocr_value,corrected_value,corrected_by_user_id FROM game_report_corrections WHERE game_id='correction-atomic'")).rows,
      [{ field_key: "home.errors", ocr_value: "0", corrected_value: "2", corrected_by_user_id: registration.data.id }], "Committed correction retains values and actor exactly once");
    const beforeGenericOverwrite = await snapshot();
    const genericOverwrite = await waitForMessage("direct-result", () => child!.send({ kind: "generic-finalize", gameId: "correction-atomic" }));
    equal(genericOverwrite.error, "ReportTransitionConflict", "Generic simulator finalization refuses a game reserved for report review");
    equal(await snapshot(), beforeGenericOverwrite, "Generic finalization cannot bypass pending report history or write official effects");

    // Initial body, submitted audit, corrections and immutable revision share
    // the creation transaction. Inject each failure independently, before CPU
    // auto-acceptance or best-effort presentation effects can run.
    for (const failure of ["audit", "correction", "revision"]) {
      const gameId = "submission-rollback-" + failure;
      await newGame(gameId);
      const table = failure === "audit" ? "audit_logs" : failure === "correction" ? "game_report_corrections" : "game_report_revisions";
      await pool.query("CREATE FUNCTION reject_fixture_submission() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN RAISE EXCEPTION 'synthetic initial report persistence failure'; END $fixture$");
      await pool.query(`CREATE TRIGGER reject_fixture_submission BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_fixture_submission()`);
      const payload = { ...valid(), corrections: [{ fieldKey: "home.errors", fieldLabel: "Home errors", ocrValue: "2", correctedValue: "0" }] };
      try {
        const beforeSubmissionFailure = await snapshot();
        equal((await invoke(endpoint(gameId), "POST", payload)).response.status, 500, "Initial " + failure + " failure rejects submission");
        equal(await snapshot(), beforeSubmissionFailure, "Initial " + failure + " failure rolls back report, history, audit, corrections and all dependent state");
      } finally {
        await pool.query(`DROP TRIGGER reject_fixture_submission ON ${table}`);
        await pool.query("DROP FUNCTION reject_fixture_submission()");
      }
      equal((await invoke(endpoint(gameId), "POST", payload)).response.status, 200, "Initial submission can retry after " + failure + " rollback");
      equal(Number((await pool.query("SELECT count(*) FROM game_report_revisions WHERE game_id=$1", [gameId])).rows[0].count), 1, "Retry stores exactly one initial revision after " + failure + " rollback");
    }

    for (const action of ["edit", "dispute", "confirm", "finalize"]) {
      const gameId = "revision-rollback-" + action;
      await newGame(gameId);
      equal((await invoke(endpoint(gameId), "POST", valid())).response.status, 200, "History rollback fixture created for " + action);
      await pool.query("CREATE FUNCTION reject_fixture_revision() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN RAISE EXCEPTION 'synthetic revision failure'; END $fixture$");
      await pool.query("CREATE TRIGGER reject_fixture_revision BEFORE INSERT ON game_report_revisions FOR EACH ROW EXECUTE FUNCTION reject_fixture_revision()");
      const mutate = () => action === "edit" ? invoke(endpoint(gameId), "PATCH", versionPayload(1)) : invoke(endpoint(gameId) + "/" + action, "POST", { expectedEditVersion: 1, reason: "Synthetic rejected revision" });
      try {
        const beforeRevisionFailure = await snapshot();
        equal((await mutate()).response.status, 500, action + " cannot commit without an immutable revision");
        equal(await snapshot(), beforeRevisionFailure, action + " revision failure rolls back the whole transaction including receipt, stats and audit");
      } finally {
        await pool.query("DROP TRIGGER reject_fixture_revision ON game_report_revisions");
        await pool.query("DROP FUNCTION reject_fixture_revision()");
      }
      equal((await mutate()).response.status, 200, action + " retries successfully with the unchanged version after rollback");
    }

    await newGame("history-lifecycle");
    const originalHistoryReport = await invoke(endpoint("history-lifecycle"), "POST", valid());
    equal(originalHistoryReport.response.status, 200, "Revision lifecycle begins with an actual submitted report");
    const initialRevision = (await pool.query("SELECT * FROM game_report_revisions WHERE game_id='history-lifecycle'")).rows[0];
    equal([initialRevision.event, initialRevision.edit_version, initialRevision.actor_user_id], ["submitted", 1, registration.data.id], "Initial revision records actual submission event, version and actor");
    equal(initialRevision.snapshot.homeBoxData, valid().homeBoxData, "Initial immutable snapshot preserves every submitted batting and pitching field");
    const historyEdit = { ...versionPayload(1), homeErrors: 2, corrections: [{ fieldKey: "home.errors", fieldLabel: "Home errors", ocrValue: "0", correctedValue: "2" }] };
    equal((await invoke(endpoint("history-lifecycle"), "PATCH", historyEdit)).response.status, 200, "Lifecycle edit accepted");
    equal((await pool.query("SELECT * FROM game_report_revisions WHERE id=$1", [initialRevision.id])).rows[0], initialRevision, "Editing preserves the entire original revision byte-for-byte as decoded by PostgreSQL");
    equal((await invoke(endpoint("history-lifecycle") + "/dispute", "POST", { expectedEditVersion: 2, reason: "Please review the recorded errors" })).response.status, 200, "Lifecycle dispute accepted");
    const acceptedHistory = await invoke(endpoint("history-lifecycle") + "/finalize", "POST", { expectedEditVersion: 3 });
    equal(acceptedHistory.response.status, 200, "Lifecycle acceptance succeeds");
    equal(acceptedHistory.data.alreadyFinalized, false, "First successful acceptance is not labeled a replay");
    const historyRows = (await pool.query("SELECT * FROM game_report_revisions WHERE game_id='history-lifecycle' ORDER BY edit_version")).rows;
    equal(historyRows.map(row => [row.edit_version, row.event, row.snapshot.status]), [[1, "submitted", "pending"], [2, "edited", "pending"], [3, "disputed", "disputed"], [4, "force-finalized", "confirmed"]], "Revision ledger retains all four observed lifecycle states in order");
    equal(historyRows.map(row => row.snapshot.homeErrors), [0, 2, 2, 2], "Historical score observations survive subsequent edits and decisions");
    equal(historyRows.every(row => row.actor_user_id === registration.data.id && row.snapshot.editVersion === row.edit_version), true, "Each lifecycle snapshot binds the authenticated actor and stored version");
    equal(historyRows[1].corrections.some((row: any) => row.fieldKey === "home.errors" && row.ocrValue === "0" && row.correctedValue === "2"), true, "Edited revision captures its correction provenance");
    const acceptedReceipt = (await pool.query("SELECT * FROM game_finalizations WHERE game_id='history-lifecycle'")).rows[0];
    equal([acceptedReceipt.report_revision_id, acceptedReceipt.report_id, acceptedReceipt.requested_edit_version, acceptedReceipt.accepted_by_user_id, acceptedReceipt.report_action, acceptedReceipt.report_resolution], [historyRows[3].id, originalHistoryReport.data.id, 3, registration.data.id, "Game Report Force-Finalized", "reported"], "Official receipt identifies exactly the accepted revision, actor, request version, action and resolution");
    equal(acceptedHistory.data.receipt.reportRevisionId, historyRows[3].id, "Acceptance HTTP response exposes the persisted revision identity");
    const historyResponse = await invoke(endpoint("history-lifecycle") + "/history");
    equal(historyResponse.response.status, 200, "Commissioner can read immutable report history");
    equal(historyResponse.data.revisions.map((row: any) => row.id), historyRows.map(row => row.id), "History endpoint returns the complete ordered revision sequence");
    equal(historyResponse.data.receipt, acceptedHistory.data.receipt, "History and acceptance responses expose the same durable receipt");
    equal(historyResponse.response.headers.get("cache-control"), "private, no-store", "History with actor and correction provenance cannot enter a shared cache");
    for (const mutation of ["UPDATE game_report_revisions SET snapshot='{}'::jsonb WHERE id=$1", "DELETE FROM game_report_revisions WHERE id=$1"]) {
      const beforeTampering = await snapshot();
      let rejected = false;
      try { await pool.query(mutation, [historyRows[3].id]); } catch { rejected = true; }
      equal(rejected, true, "Active report revision rejects direct " + mutation.split(" ")[0]);
      equal(await snapshot(), beforeTampering, "Rejected historical tampering preserves history, receipt and all live state");
    }
    const deletion = await pool.connect();
    try {
      await deletion.query("BEGIN");
      await deletion.query("DELETE FROM game_report_corrections WHERE game_report_id=$1", [originalHistoryReport.data.id]);
      await deletion.query("DELETE FROM game_reports WHERE id=$1", [originalHistoryReport.data.id]);
      equal(Number((await deletion.query("SELECT count(*) FROM game_report_revisions WHERE game_id='history-lifecycle'")).rows[0].count), 0, "Explicit parent report deletion can cascade owned history");
      equal(Number((await deletion.query("SELECT count(*) FROM game_finalizations WHERE game_id='history-lifecycle'")).rows[0].count), 0, "Explicit parent report deletion does not leave a dangling acceptance receipt");
    } finally { await deletion.query("ROLLBACK"); deletion.release(); }

    // Replay survives loss of the accepting HTTP process. Full-table snapshots
    // include statistics, standings, audit, corrections and notification rows.
    await stopHttp(); await startHttp();
    const beforeReplay = await snapshot();
    const replay = await invoke(endpoint("history-lifecycle") + "/finalize", "POST", { expectedEditVersion: 3 });
    equal(replay.response.status, 200, "Exact acceptance retry succeeds after a fresh HTTP process starts");
    equal(replay.data.alreadyFinalized, true, "Restarted acceptance identifies the persisted replay");
    equal(replay.data.receipt, acceptedHistory.data.receipt, "Restarted acceptance returns exactly the original receipt");
    equal(await snapshot(), beforeReplay, "Restarted acceptance replay performs zero persistent writes including secondary notifications");
    for (const [suffix, body] of [["finalize", { expectedEditVersion: 4 }], ["confirm", { expectedEditVersion: 3 }], ["finalize", { expectedEditVersion: 3, useCorrectedScore: true }]] as const) {
      const beforeConflict = await snapshot();
      equal((await invoke(endpoint("history-lifecycle") + "/" + suffix, "POST", body)).response.status, 409, "Different acceptance version, action or resolution conflicts with the committed receipt");
      equal(await snapshot(), beforeConflict, "A different acceptance identity cannot mutate an already accepted result");
    }


    // A nonessential activity-feed write must not turn a committed decision
    // into a failed HTTP response that invites a conflicting retry.
    await pool.query("CREATE FUNCTION reject_fixture_report_event() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN IF NEW.event_type = 'GAME_REPORT' THEN RAISE EXCEPTION 'synthetic secondary event failure'; END IF; RETURN NEW; END $fixture$");
    await pool.query("CREATE TRIGGER reject_fixture_report_event BEFORE INSERT ON league_events FOR EACH ROW EXECUTE FUNCTION reject_fixture_report_event()");
    try {
      for (const suffix of ["confirm", "dispute", "finalize"]) {
        const gameId = "secondary-event-" + suffix;
        await newGame(gameId);
        // Submission itself also emits GAME_REPORT, so install a pending
        // fixture directly without disabling the fault under test.
        const source = (await pool.query("SELECT * FROM game_reports WHERE game_id='edit-disputed'")).rows[0];
        await pool.query("INSERT INTO game_reports (id,game_id,league_id,reporter_user_id,reporter_team_id,home_score,away_score,home_hits,away_hits,home_errors,away_errors,inning_scores,home_box_data,away_box_data,status,edit_version) VALUES ($1,$2,'report-league',$3,$4,1,0,1,0,0,0,$5,$6,$7,'pending',1)",
          [randomUUID(), gameId, registration.data.id, source.reporter_team_id, JSON.stringify(valid().inningScores), JSON.stringify(valid().homeBoxData), JSON.stringify(valid().awayBoxData)]);
        equal((await invoke(endpoint(gameId) + "/" + suffix, "POST", { expectedEditVersion: 1, reason: "Synthetic feed failure" })).response.status, 200, suffix + " returns success after nonessential report-event failure");
        equal((await pool.query("SELECT status,edit_version FROM game_reports WHERE game_id=$1", [gameId])).rows[0],
          { status: suffix === "dispute" ? "disputed" : "confirmed", edit_version: 2 }, suffix + " decision remains committed despite feed failure");
        equal(Number((await pool.query("SELECT count(*) FROM game_finalizations WHERE game_id=$1", [gameId])).rows[0].count), suffix === "dispute" ? 0 : 1, suffix + " retains exactly the appropriate finalization receipt");
      }
    } finally {
      await pool.query("DROP TRIGGER reject_fixture_report_event ON league_events");
      await pool.query("DROP FUNCTION reject_fixture_report_event()");
    }

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
    for (const [role, status] of [["primary", 200], ["co", 200], ["involved", 200], ["away", 200], ["unrelated", 403], ["outsider", 403]] as const) {
      cookie = actors[role].cookie;
      const historyRead = await invoke(endpoint("history-lifecycle") + "/history");
      equal(historyRead.response.status, status, role + " history access follows involved-coach or commissioner authority");
      if (status === 200) equal(historyRead.data.receipt, acceptedHistory.data.receipt, role + " sees the same durable accepted-result receipt");
      else equal([historyRead.data.revisions, historyRead.data.receipt], [undefined, undefined], role + " rejection exposes neither historical identities nor acceptance receipt");
    }
    cookie = "";
    equal((await invoke(endpoint("history-lifecycle") + "/history")).response.status, 401, "Anonymous caller cannot read report history");
    cookie = actors.co.cookie;
    let beforeDifferentActor = await snapshot();
    equal((await invoke(endpoint("history-lifecycle") + "/finalize", "POST", { expectedEditVersion: 3 })).response.status, 409, "A different authorized commissioner cannot replay another actor's acceptance identity");
    equal(await snapshot(), beforeDifferentActor, "Different-actor receipt conflict changes no state");
    await pool.query("UPDATE leagues SET co_commissioner_ids='[]' WHERE id='report-league'");
    beforeDifferentActor = await snapshot();
    const revokedReceipt = await invoke(endpoint("history-lifecycle") + "/finalize", "POST", { expectedEditVersion: 3 });
    equal(revokedReceipt.response.status, 403, "Revoked commissioner cannot retrieve acceptance by retrying an old decision");
    equal(revokedReceipt.data.receipt, undefined, "Authorization failure discloses no accepted receipt");
    equal(await snapshot(), beforeDifferentActor, "Revoked acceptance retry performs no writes");
    await pool.query("UPDATE leagues SET co_commissioner_ids=$1 WHERE id='report-league'", [JSON.stringify([actors.co.id])]);
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
    const crossLeagueHistory = await invoke("/api/leagues/other-report-league/games/history-lifecycle/report/history");
    equal(crossLeagueHistory.response.status, 404, "History rejects cross-league game identifiers even for a commissioner of both leagues");
    equal([crossLeagueHistory.data.revisions, crossLeagueHistory.data.receipt], [undefined, undefined], "Cross-league history rejection reveals no private evidence");

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
      equal((await invoke(endpoint(gameId) + finalizationPath, "POST", { expectedEditVersion: submitted.data.editVersion })).response.status, 200, `${role} score-only result finalizes through the real ${finalizationPath} route`);
      equal((await pool.query("SELECT is_complete,home_score,away_score,box_score FROM games WHERE id=$1", [gameId])).rows[0], { is_complete: true, home_score: 2, away_score: 1, box_score: null }, `${role} finalized score-only game stores scores without a fabricated box score`);
      equal((await pool.query("SELECT home_hits,away_hits,home_errors,away_errors,inning_scores,home_box_data,away_box_data FROM game_reports WHERE game_id=$1", [gameId])).rows[0], reportBeforeFinalization, `${role} finalization preserves unknown report summaries`);
      equal((await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows, beforeStats, `${role} explicit score-only finalization fabricates no player statistics`);
      const unknownHistory = (await pool.query("SELECT event,snapshot FROM game_report_revisions WHERE game_id=$1 ORDER BY edit_version", [gameId])).rows;
      equal(unknownHistory.length, 2, role + " score-only history retains submitted and accepted snapshots");
      equal(unknownHistory.every(row => ["homeHits", "awayHits", "homeErrors", "awayErrors", "inningScores", "homeBoxData", "awayBoxData"].every(field => row.snapshot[field] === null)), true, role + " immutable history preserves unknown observations instead of synthesizing zero statistics");
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

    // CPU opponents use the same atomic acceptance path. Report submission
    // may survive a later auto-confirmation failure, but cannot look confirmed.
    cookie = primary.cookie;
    await pool.query("UPDATE teams SET is_cpu=true WHERE id='home'");
    try {
      await newGame("cpu-auto-success");
      equal((await invoke(endpoint("cpu-auto-success"), "POST", valid())).response.status, 200, "CPU opponent submission auto-confirms successfully");
      equal((await pool.query("SELECT status,edit_version FROM game_reports WHERE game_id='cpu-auto-success'")).rows[0], { status: "confirmed", edit_version: 2 }, "CPU auto-confirm accepts exactly one report transition");
      equal(Number((await pool.query("SELECT count(*) FROM game_finalizations WHERE game_id='cpu-auto-success'")).rows[0].count), 1, "CPU auto-confirm creates one receipt");
      await newGame("cpu-auto-failure");
      const beforeCpuStats = (await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows;
      await pool.query("CREATE FUNCTION reject_fixture_cpu_audit() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN IF NEW.action = 'Game Report Confirmed' THEN RAISE EXCEPTION 'synthetic CPU confirmation audit failure'; END IF; RETURN NEW; END $fixture$");
      await pool.query("CREATE TRIGGER reject_fixture_cpu_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fixture_cpu_audit()");
      try {
        equal((await invoke(endpoint("cpu-auto-failure"), "POST", valid())).response.status, 500, "CPU auto-confirm audit failure reports failure");
        equal((await pool.query("SELECT status,edit_version FROM game_reports WHERE game_id='cpu-auto-failure'")).rows[0], { status: "pending", edit_version: 1 }, "Failed CPU confirmation preserves submitted report as pending");
        equal((await pool.query("SELECT is_complete,home_score,away_score FROM games WHERE id='cpu-auto-failure'")).rows[0], { is_complete: false, home_score: null, away_score: null }, "Failed CPU confirmation leaves official game unplayed");
        equal(Number((await pool.query("SELECT count(*) FROM game_finalizations WHERE game_id='cpu-auto-failure'")).rows[0].count), 0, "Failed CPU confirmation creates no receipt");
        equal((await pool.query("SELECT * FROM player_season_stats ORDER BY player_id")).rows, beforeCpuStats, "Failed CPU confirmation adds no official player stats");
        const cpuSubmissionAudit = (await pool.query("SELECT details FROM audit_logs WHERE action='Game Report Submitted' AND details LIKE '%cpu-auto-failure%' ORDER BY timestamp DESC LIMIT 1")).rows[0]?.details;
        equal(typeof cpuSubmissionAudit === "string" && cpuSubmissionAudit.includes("automatic confirmation requested"), true, "CPU submission audit describes requested rather than completed confirmation");
      } finally {
        await pool.query("DROP TRIGGER reject_fixture_cpu_audit ON audit_logs");
        await pool.query("DROP FUNCTION reject_fixture_cpu_audit()");
      }
      equal((await invoke(endpoint("cpu-auto-failure") + "/confirm", "POST", { expectedEditVersion: 1 })).response.status, 200, "Pending CPU submission can be recovered after audit failure");
    } finally {
      await pool.query("UPDATE teams SET is_cpu=false WHERE id='home'");
    }
    cookie = primary.cookie;
    // Atomic simulation and reported acceptance must persist coach effects with
    // their result receipt, including callers that still pass a batch map.
    for (const [side, coachId] of [["home", "coach-effects-a"], ["away", "coach-effects-b"]]) {
      const actorId = "effects-user-" + side;
      await pool.query("INSERT INTO users (id,email,password) VALUES ($1,$2,'synthetic-disabled')", [actorId, actorId + "@example.test"]);
      await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ($1,'report-league',$2,'Owls','EFF','Test','IA',false)", ["effects-" + side, "Effects " + side]);
      await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name) VALUES ($1,$2,$3,'report-league','Effects',$4)", [coachId, actorId, "effects-" + side, side]);
      await pool.query("UPDATE teams SET coach_id=$1 WHERE id=$2", [coachId, "effects-" + side]);
    }
    await pool.query("UPDATE coaches SET xp=2980,level=1,skill_points=2,perks='{\"gm_tactician\":true}' WHERE id='coach-effects-a'");
    const effectsGame = async (id: string, reversed = false, exhibition = false) => pool!.query(
      "INSERT INTO games (id,league_id,season,week,home_team_id,away_team_id,phase,is_conference,game_type) VALUES ($1,'report-league',1,1,$2,$3,'regular',true,$4)",
      [id, reversed ? "effects-away" : "effects-home", reversed ? "effects-home" : "effects-away", exhibition ? "exhibition" : "regular"]);
    const effectsCall = (games: Array<{ gameId: string; accumulate?: boolean; skipCoachXp?: boolean; homeScore?: number; awayScore?: number; box?: unknown }>) => waitForMessage("effects-result", () => child!.send({ kind: "effects-finalize", games }));
    const effectCoaches = async () => (await pool!.query("SELECT id,xp,level,skill_points,career_wins,career_losses,conf_wins,conf_losses FROM coaches WHERE id IN ('coach-effects-a','coach-effects-b') ORDER BY id")).rows;
    await effectsGame("effects-accumulator");
    const accumulatorResult = await effectsCall([{ gameId: "effects-accumulator", accumulate: true }]);
    equal(accumulatorResult.error, null, "Atomic result succeeds while the caller supplies a batch accumulator");
    equal(accumulatorResult.accumulator, [], "Atomic result leaves no unpersisted or duplicate coach deltas in the batch map");
    equal(await effectCoaches(), [
      { id: "coach-effects-a", xp: 3110, level: 4, skill_points: 5, career_wins: 1, career_losses: 0, conf_wins: 1, conf_losses: 0 },
      { id: "coach-effects-b", xp: 20, level: 1, skill_points: 0, career_wins: 0, career_losses: 1, conf_wins: 0, conf_losses: 1 },
    ], "Coach XP, conference tactician bonuses and every crossed skill-point level persist before any flush");
    const firstEffects = (await pool.query("SELECT coach_id,xp_delta,wins_delta,losses_delta,conf_wins_delta,conf_losses_delta,skill_points_delta,before_state,after_state FROM game_coach_effects WHERE game_id='effects-accumulator' ORDER BY coach_id")).rows;
    equal(firstEffects.map(row => [row.coach_id, row.xp_delta, row.wins_delta, row.losses_delta, row.conf_wins_delta, row.conf_losses_delta, row.skill_points_delta]), [
      ["coach-effects-a", 130, 1, 0, 1, 0, 3], ["coach-effects-b", 20, 0, 1, 0, 1, 0],
    ], "One durable effect per coach records actual awarded deltas including perk and skill gains");
    equal(firstEffects.map(row => [row.before_state.xp, row.after_state.xp, row.before_state.level, row.after_state.level]), [[2980, 3110, 1, 4], [0, 20, 1, 1]], "Durable effects retain the actual before/after coaching observations");
    const beforeEmptyFlush = await snapshot();
    equal((await waitForMessage("effects-result", () => child!.send({ kind: "effects-flush" }))).error, null, "Compatibility batch flush remains safe after atomic finalization");
    equal(await snapshot(), beforeEmptyFlush, "Flushing the atomic caller's accumulator cannot award the same effects twice");
    await stopHttp(); await startHttp();
    equal(await snapshot(), beforeEmptyFlush, "Coach effects and receipts survive loss of the accepting process without a flush");
    equal((await effectsCall([{ gameId: "effects-accumulator", accumulate: true }])).error, null, "Atomic same-game replay succeeds after process restart");
    equal(await snapshot(), beforeEmptyFlush, "Restarted result replay performs no writes to coaches, standings, rivalry or effects");

    for (const id of ["effects-concurrent-a", "effects-concurrent-b"]) await effectsGame(id);
    equal((await effectsCall([{ gameId: "effects-concurrent-a", accumulate: true }, { gameId: "effects-concurrent-b" }])).error, null, "Concurrent games for the same coaches both commit");
    equal((await effectCoaches()).map(row => [row.xp, row.career_wins, row.career_losses]), [[3370, 3, 0], [60, 0, 3]], "Different-game concurrent wins and XP accumulate without a lost update");
    await effectsGame("effects-reversed-a"); await effectsGame("effects-reversed-b", true);
    equal((await effectsCall([{ gameId: "effects-reversed-a" }, { gameId: "effects-reversed-b", accumulate: true }])).error, null, "Opposite home/away ordering completes concurrently without deadlock");
    equal((await effectCoaches()).map(row => [row.xp, row.career_wins, row.career_losses, row.conf_wins, row.conf_losses]), [[3520, 4, 1, 4, 1], [160, 1, 4, 1, 4]], "Reversed-home games retain both win and loss effects for each coach");
    equal((await pool.query("SELECT team_id,wins,losses,conference_wins,conference_losses,runs_scored,runs_allowed FROM standings WHERE team_id IN ('effects-home','effects-away') ORDER BY team_id")).rows, [
      { team_id: "effects-away", wins: 1, losses: 4, conference_wins: 1, conference_losses: 4, runs_scored: 6, runs_allowed: 9 },
      { team_id: "effects-home", wins: 4, losses: 1, conference_wins: 4, conference_losses: 1, runs_scored: 9, runs_allowed: 6 },
    ], "Cross-game transaction serialization preserves complete team standings");
    equal((await pool.query("SELECT games_played,coach_a_wins,coach_b_wins,coach_a_runs_scored,coach_b_runs_scored FROM coach_rivalries WHERE coach_a_id='coach-effects-a' AND coach_b_id='coach-effects-b'")).rows, [
      { games_played: 5, coach_a_wins: 4, coach_b_wins: 1, coach_a_runs_scored: 9, coach_b_runs_scored: 6 },
    ], "Concurrent and accumulator results retain one coherent human-coach rivalry record");
    equal(Number((await pool.query("SELECT count(*) FROM game_coach_effects WHERE coach_id IN ('coach-effects-a','coach-effects-b')")).rows[0].count), 10, "Five games produce exactly ten durable coach effects");

    await effectsGame("effects-rivalry-record");
    equal((await effectsCall([{ gameId: "effects-rivalry-record", homeScore: 8, awayScore: 1 }])).error, null, "A later result commits updated rivalry observations");
    equal((await pool.query("SELECT games_played,coach_a_runs_scored,coach_b_runs_scored,last_meeting_coach_a_score,last_meeting_coach_b_score,biggest_win_margin,biggest_win_coach_id,last_meeting_winner_id FROM coach_rivalries WHERE coach_a_id='coach-effects-a' AND coach_b_id='coach-effects-b'")).rows[0], {
      games_played: 6, coach_a_runs_scored: 17, coach_b_runs_scored: 7, last_meeting_coach_a_score: 8, last_meeting_coach_b_score: 1,
      biggest_win_margin: 7, biggest_win_coach_id: "coach-effects-a", last_meeting_winner_id: "coach-effects-a",
    }, "Rivalry history accumulates runs and refreshes the last meeting and biggest victory");
    await effectsGame("effects-rivalry-rollback");
    await pool.query("CREATE FUNCTION reject_fixture_rivalry() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN IF NEW.coach_a_id='coach-effects-a' THEN RAISE EXCEPTION 'synthetic rivalry update failure'; END IF; RETURN NEW; END $fixture$");
    await pool.query("CREATE TRIGGER reject_fixture_rivalry BEFORE UPDATE ON coach_rivalries FOR EACH ROW EXECUTE FUNCTION reject_fixture_rivalry()");
    try {
      const beforeRivalryFailure = await snapshot();
      equal(typeof (await effectsCall([{ gameId: "effects-rivalry-rollback", accumulate: true }])).error, "string", "Rivalry persistence failure rejects completion");
      equal(await snapshot(), beforeRivalryFailure, "Rivalry failure rolls back coaching effects, receipt, standings, game and all related projections");
    } finally {
      await pool.query("DROP TRIGGER reject_fixture_rivalry ON coach_rivalries");
      await pool.query("DROP FUNCTION reject_fixture_rivalry()");
    }

    for (const mode of ["skip", "exhibition"]) {
      const gameId = "effects-" + mode; await effectsGame(gameId, false, mode === "exhibition");
      const beforeSkippedCoaches = await effectCoaches();
      const beforeSkippedRivalry = (await pool.query("SELECT * FROM coach_rivalries WHERE coach_a_id='coach-effects-a'")).rows;
      equal((await effectsCall([{ gameId, accumulate: true, skipCoachXp: mode === "skip" }])).error, null, mode + " result still commits its game receipt");
      equal(await effectCoaches(), beforeSkippedCoaches, mode + " result awards no coaching progression");
      equal((await pool.query("SELECT * FROM coach_rivalries WHERE coach_a_id='coach-effects-a'")).rows, beforeSkippedRivalry, mode + " result changes no coach rivalry");
      equal(Number((await pool.query("SELECT count(*) FROM game_coach_effects WHERE game_id=$1", [gameId])).rows[0].count), 0, mode + " result creates no invented coach-effect rows");
      equal(Number((await pool.query("SELECT count(*) FROM game_finalizations WHERE game_id=$1", [gameId])).rows[0].count), 1, mode + " result retains exactly one finalization receipt");
    }
    await effectsGame("effects-rollback"); await effectsGame("effects-report-rollback");
    const effectsReportEndpoint = endpoint("effects-report-rollback");
    equal((await invoke(effectsReportEndpoint, "POST", scoreOnlyPayload())).response.status, 200, "Reported companion fixture creates a real score-only submission for effect rollback");
    await pool.query("CREATE FUNCTION reject_fixture_coach_effect() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN IF NEW.game_id IN ('effects-rollback','effects-report-rollback') THEN RAISE EXCEPTION 'synthetic coach-effect insertion failure'; END IF; RETURN NEW; END $fixture$");
    await pool.query("CREATE TRIGGER reject_fixture_coach_effect BEFORE INSERT ON game_coach_effects FOR EACH ROW EXECUTE FUNCTION reject_fixture_coach_effect()");
    try {
      const beforeEffectFailure = await snapshot();
      const effectFailure = await effectsCall([{ gameId: "effects-rollback", accumulate: true }]);
      equal(typeof effectFailure.error, "string", "An effect ledger failure rejects atomic simulation completion");
      equal(effectFailure.accumulator, [], "Failed effect persistence leaves no deferred batch progression");
      equal(await snapshot(), beforeEffectFailure, "Effect insert failure rolls back game, receipt, coaching, standings, rivalry and every dependent table");
      equal((await invoke(effectsReportEndpoint + "/finalize", "POST", { expectedEditVersion: 1 })).response.status, 500, "Reported acceptance fails when its coaching effects cannot commit");
      equal(await snapshot(), beforeEffectFailure, "Reported effect failure rolls back accepted revision, decision audit, receipt and all official effects");
    } finally {
      await pool.query("DROP TRIGGER reject_fixture_coach_effect ON game_coach_effects");
      await pool.query("DROP FUNCTION reject_fixture_coach_effect()");
    }
    equal((await effectsCall([{ gameId: "effects-rollback", accumulate: true }])).error, null, "Simulation can recover by retry after effect storage recovers");
    const recoveredEffectsReport = await invoke(effectsReportEndpoint + "/finalize", "POST", { expectedEditVersion: 1 });
    if (recoveredEffectsReport.response.status !== 200) console.error(childErrors);
    equal(recoveredEffectsReport.response.status, 200, "Reported acceptance can recover with its original reviewed version after effect rollback");
    equal(Number((await pool.query("SELECT count(*) FROM game_coach_effects WHERE game_id IN ('effects-rollback','effects-report-rollback')")).rows[0].count), 4, "Recovered simulation and reported acceptance each award exactly one effect per coach");

    // First-ever projection rows exercise both insertion and additive updates
    // under concurrent finalizations; existing standings cannot mask insert races.
    for (const side of ["home", "away"]) await pool.query("INSERT INTO players (id,team_id,first_name,last_name,position,home_state,hometown,jersey_number) VALUES ($1,$2,'Effects','Stats','CF','IA','Test',80)", ["effects-player-" + side, "effects-" + side]);
    for (const id of ["effects-stats-a", "effects-stats-b"]) {
      await effectsGame(id); await pool.query("UPDATE games SET season=42 WHERE id=$1", [id]);
    }
    equal(Number((await pool.query("SELECT count(*) FROM standings WHERE league_id='report-league' AND season=42")).rows[0].count), 0, "Concurrent projection fixture starts with no standings rows");
    equal(Number((await pool.query("SELECT count(*) FROM player_season_stats WHERE league_id='report-league' AND season=42")).rows[0].count), 0, "Concurrent projection fixture starts with no season-stat rows");
    const statBox = {
      home: { batting: [{ playerId: "effects-player-home", name: "Effects Stats", position: "CF", ab: 4, h: 2, r: 2, rbi: 2 }], pitching: [] },
      away: { batting: [{ playerId: "effects-player-away", name: "Effects Stats", position: "CF", ab: 3, h: 1, r: 1, rbi: 1 }], pitching: [] },
    };
    equal((await effectsCall([{ gameId: "effects-stats-a", box: statBox }, { gameId: "effects-stats-b", box: statBox }])).error, null, "Concurrent atomic games safely insert their first standings and same-player season-stat rows");
    equal((await pool.query("SELECT team_id,wins,losses,runs_scored,runs_allowed FROM standings WHERE league_id='report-league' AND season=42 ORDER BY team_id")).rows, [
      { team_id: "effects-away", wins: 0, losses: 2, runs_scored: 2, runs_allowed: 4 }, { team_id: "effects-home", wins: 2, losses: 0, runs_scored: 4, runs_allowed: 2 },
    ], "Concurrent first-season standings retain both games without duplicate rows");
    equal((await pool.query("SELECT player_id,games,ab,h,r,rbi FROM player_season_stats WHERE league_id='report-league' AND season=42 ORDER BY player_id")).rows, [
      { player_id: "effects-player-away", games: 2, ab: 6, h: 2, r: 2, rbi: 2 }, { player_id: "effects-player-home", games: 2, ab: 8, h: 4, r: 4, rbi: 4 },
    ], "Concurrent same-player projections retain both contributions to every checked batting counter");

    const savedHistory = await invoke("/api/leagues/report-league/save-states", "POST", { label: "Synthetic reported-history restore boundary" });
    equal(savedHistory.response.status, 200, "League save capture remains available with accepted report history");
    const beforeUnsafeRestore = await snapshot();
    const unsafeRestore = await invoke(`/api/leagues/report-league/save-states/${savedHistory.data.id}/restore`, "POST", {});
    equal(unsafeRestore.response.status, 409, "Restore refuses a snapshot that cannot preserve report history and acceptance identity");
    equal(/history/i.test(unsafeRestore.data.message), true, "Blocked restore gives the history-preservation reason");
    equal(await snapshot(), beforeUnsafeRestore, "Blocked restore preserves all current rows, history, receipts and save state without making a pre-restore backup");
    const targetOnlySave = await invoke("/api/leagues/other-report-league/save-states", "POST", { label: "Synthetic historical reports only" });
    equal(targetOnlySave.response.status, 200, "Empty-current-league restore fixture captures an actual save");
    await pool.query("UPDATE league_save_states SET snapshot_data=jsonb_set(snapshot_data,'{gameReports}',$1::jsonb) WHERE id=$2", [JSON.stringify([{ id: "historical-report-observation" }]), targetOnlySave.data.id]);
    equal(Number((await pool.query("SELECT count(*) FROM game_reports WHERE league_id='other-report-league'")).rows[0].count), 0, "Target-only restore fixture has no current reports to trigger the current-state guard");
    const beforeTargetOnlyRestore = await snapshot();
    equal((await invoke(`/api/leagues/other-report-league/save-states/${targetOnlySave.data.id}/restore`, "POST", {})).response.status, 409, "A historical snapshot containing reports is blocked even when the current league has no reports");
    equal(await snapshot(), beforeTargetOnlyRestore, "Target-only history restore guard preserves every table and creates no backup or restore audit");

    await pool.query("INSERT INTO leagues (id,name,commissioner_id,game_mode,current_phase,is_test_data) VALUES ('effects-restore-league','Simulated restore fixture',$1,'simulated','regular_season',true)", [primary.id]);
    for (const side of ["home", "away"]) await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ($1,'effects-restore-league',$2,'Owls','RST','Test','IA',false)", ["restore-" + side, "Restore " + side]);
    const simulatedSave = await invoke("/api/leagues/effects-restore-league/save-states", "POST", { label: "Synthetic pre-simulation snapshot" });
    equal(simulatedSave.response.status, 200, "Simulated league captures a pre-result save with no reports");
    await pool.query("INSERT INTO games (id,league_id,season,week,home_team_id,away_team_id,phase) VALUES ('effects-restore-game','effects-restore-league',1,1,'restore-home','restore-away','regular')");
    equal((await effectsCall([{ gameId: "effects-restore-game" }])).error, null, "Simulated restore fixture finalizes through the real atomic service");
    equal(Number((await pool.query("SELECT count(*) FROM game_reports WHERE league_id='effects-restore-league'")).rows[0].count), 0, "Simulated restore guard fixture contains no reports");
    const beforeSimulatedRestore = await snapshot();
    equal((await invoke(`/api/leagues/effects-restore-league/save-states/${simulatedSave.data.id}/restore`, "POST", {})).response.status, 409, "Restore refuses to erase current simulated finalization receipts even without report history");
    equal(await snapshot(), beforeSimulatedRestore, "Blocked simulated restore preserves every row and creates no pre-restore backup");
    await pool.query("UPDATE league_save_states SET snapshot_data=jsonb_set(jsonb_set(snapshot_data,'{gameReports}','[]'::jsonb),'{games}',$1::jsonb) WHERE id=$2", [JSON.stringify([{ id: "historic-simulated-game", is_complete: true }]), targetOnlySave.data.id]);
    const beforeTargetSimulatedRestore = await snapshot();
    equal((await invoke(`/api/leagues/other-report-league/save-states/${targetOnlySave.data.id}/restore`, "POST", {})).response.status, 409, "Restore refuses a target containing completed simulated games without reconstructible receipts");
    equal(await snapshot(), beforeTargetSimulatedRestore, "Target-only simulated restore rejection writes no league or backup state");

    await pool.query("UPDATE games SET is_complete=false WHERE id='effects-restore-game'");
    const beforeReceiptOnlyRestore = await snapshot();
    equal((await invoke(`/api/leagues/effects-restore-league/save-states/${simulatedSave.data.id}/restore`, "POST", {})).response.status, 409, "Receipt-only current state still blocks destructive restore when completion flags are inconsistent");
    equal(await snapshot(), beforeReceiptOnlyRestore, "Receipt-only restore rejection preserves all data and backups");
    for (const evidenceField of ["gameFinalizations", "gameCoachEffects"]) {
      await pool.query("UPDATE league_save_states SET snapshot_data=jsonb_set(jsonb_set(snapshot_data,'{games}','[]'::jsonb),$1::text[],$2::jsonb) WHERE id=$3", [[evidenceField], JSON.stringify([{ game_id: "historical-result" }]), targetOnlySave.data.id]);
      const beforeTargetReceiptRestore = await snapshot();
      equal((await invoke(`/api/leagues/other-report-league/save-states/${targetOnlySave.data.id}/restore`, "POST", {})).response.status, 409, evidenceField + " target evidence blocks restore without a complete recovery protocol");
      equal(await snapshot(), beforeTargetReceiptRestore, evidenceField + " target restore rejection preserves all current rows");
      await pool.query("UPDATE league_save_states SET snapshot_data=snapshot_data - $1 WHERE id=$2", [evidenceField, targetOnlySave.data.id]);
    }

    const beforeOwnedLeague = await snapshot();
    await pool.query("INSERT INTO leagues (id,name,commissioner_id,game_mode,current_phase,is_test_data) VALUES ('history-delete-league','Owned deletion fixture',$1,'reported','regular_season',true)", [primary.id]);
    for (const side of ["home", "away"]) await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state,is_cpu) VALUES ($1,'history-delete-league',$2,'Owls','DEL','Test','IA',false)", ["delete-" + side, "Delete " + side]);
    for (const [side, actorId] of [["home", primary.id], ["away", actors.away.id]]) {
      await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name) VALUES ($1,$2,$3,'history-delete-league','Delete',$4)", ["delete-coach-" + side, actorId, "delete-" + side, side]);
      await pool.query("UPDATE teams SET coach_id=$1 WHERE id=$2", ["delete-coach-" + side, "delete-" + side]);
    }
    await pool.query("INSERT INTO games (id,league_id,season,week,home_team_id,away_team_id,phase) VALUES ('delete-history-game','history-delete-league',1,1,'delete-home','delete-away','regular')");
    const deleteEndpoint = "/api/leagues/history-delete-league/games/delete-history-game/report";
    equal((await invoke(deleteEndpoint, "POST", scoreOnlyPayload())).response.status, 200, "Owned deletion fixture records an initial immutable report");
    equal((await invoke(deleteEndpoint + "/finalize", "POST", { expectedEditVersion: 1 })).response.status, 200, "Owned deletion fixture has a real accepted revision and receipt");
    equal(Number((await pool.query("SELECT count(*) FROM game_report_revisions WHERE game_id='delete-history-game'")).rows[0].count), 2, "Owned deletion fixture contains both initial and accepted history");
    equal(Number((await pool.query("SELECT count(*) FROM game_coach_effects WHERE game_id='delete-history-game'")).rows[0].count), 2, "Owned deletion fixture includes real durable effects for both coaches");
    const ownedDeletion = await invoke("/api/leagues/history-delete-league", "DELETE");
    if (ownedDeletion.response.status !== 200) console.error(childErrors);
    equal(ownedDeletion.response.status, 200, "Explicit commissioner league deletion remains compatible with immutable-history cascade rules");
    equal(await snapshot(), beforeOwnedLeague, "Deleting the owned league removes its history and receipt while preserving every unrelated league row");
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
