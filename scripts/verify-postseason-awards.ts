import type pg from "pg";

/** Runs inside verify-reported-results' owned database and real server process. */
export async function verifyPostseasonAwards(context: {
  pool: pg.Pool; primaryId: string; awayId: string;
  equal: (actual: unknown, expected: unknown, label: string) => void;
  snapshot: () => Promise<unknown>;
  invoke: (route: string, method?: string, body?: unknown) => Promise<any>;
  awardCall: (requests: unknown[]) => Promise<any[]>;
  effectsCall: (games: Array<{ gameId: string }>) => Promise<any>;
  restart: () => Promise<void>;
}) {
  const { pool, primaryId, awayId, equal, snapshot, invoke, awardCall, effectsCall, restart } = context;
  const identity = { leagueId: "award-league", season: 1, teamId: "award-home", milestone: "conf_champ", sourceKey: "conference-game:synthetic" };
  const call = async (patch: Record<string, unknown> = {}) => (await awardCall([{ ...identity, ...patch }]))[0];
  await pool.query("INSERT INTO leagues (id,name,commissioner_id,game_mode,current_phase,is_test_data) VALUES ('award-league','Postseason awards',$1,'simulated','conference_championship',true)", [primaryId]);
  for (const [side, actor] of [["home", primaryId], ["away", awayId]]) {
    await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state) VALUES ($1,'award-league',$2,'Owls','AWD','Test','IA')", ["award-" + side, "Award " + side]);
    await pool.query("INSERT INTO coaches (id,user_id,team_id,league_id,first_name,last_name,xp,level,skill_points,perks) VALUES ($1,$2,$3,'award-league','Award',$4,850,1,2,$5)", ["award-coach-" + side, actor, "award-" + side, side, JSON.stringify({ gm_playoff_poise: true, gm_legendary: true })]);
    await pool.query("UPDATE teams SET coach_id=$1 WHERE id=$2", ["award-coach-" + side, "award-" + side]);
  }
  const coach = async (side = "home") => (await pool.query("SELECT xp,level,skill_points,conf_championships,cws_appearances,national_championships,legacy_score FROM coaches WHERE id=$1", ["award-coach-" + side])).rows[0];
  const beforeCoach = await coach();
  const pair = await awardCall([identity, identity]);
  equal(pair.map(row => row.error), [null, null], "Concurrent identical postseason awards both resolve");
  equal(pair.map(row => row.alreadyAwarded).sort(), [false, true], "Concurrent identical milestone commits once and replays once");
  equal(pair[0].receipt.id, pair[1].receipt.id, "Duplicate callers receive the same durable receipt");
  const receipt = pair[0].receipt;
  equal([receipt.xpDelta, receipt.skillPointsDelta, receipt.milestoneDelta], [350, 2, 1], "Conference award includes playoff poise, level skill point and legendary free point");
  equal([receipt.beforeState.xp, receipt.afterState.xp, receipt.afterState.confChampionships], [beforeCoach.xp, 1200, 1], "Receipt preserves real before and after projection observations");
  equal(await coach(), { xp: 1200, level: 2, skill_points: 4, conf_championships: 1, cws_appearances: 0, national_championships: 0, legacy_score: 5 }, "Conference counter, XP, level, skill points and legacy score commit together");

  for (const patch of [{ sourceKey: "different-source" }, { season: 2 }, { season: 0 }, { season: 1.5 }, { milestone: "toString" }, { teamId: "home" }, { leagueId: "missing" }, { sourceKey: " " }]) {
    const before = await snapshot();
    equal((await call(patch)).error, "PostseasonAwardConflict", "Invalid or conflicting milestone rejects: " + JSON.stringify(patch));
    equal(await snapshot(), before, "Rejected milestone makes zero persisted writes");
  }
  const others = [
    { ...identity, milestone: "cws_appearance", sourceKey: "super-regionals:1" },
    { ...identity, milestone: "cws_win", sourceKey: "cws:1" },
  ];
  equal((await awardCall(others)).map(row => row.error), [null, null], "Concurrent distinct milestones for one coach both commit");
  equal(await coach(), { xp: 2900, level: 3, skill_points: 5, conf_championships: 1, cws_appearances: 1, national_championships: 1, legacy_score: 35 }, "Concurrent milestones lose no perk-adjusted XP, counters, level points or legacy score");
  await restart();
  const beforeRestartReplay = await snapshot();
  const replay = await call();
  equal(replay.alreadyAwarded, true, "New process recognizes persisted milestone");
  equal(replay.receipt, receipt, "New process returns exact original attribution and observations");
  equal(await snapshot(), beforeRestartReplay, "Restart replay changes no persistent table");
  await pool.query("INSERT INTO postseason_award_legacy_seasons (league_id,season,reason) VALUES ('award-league',1,'Synthetic replay precedence')");
  const beforeFencedReplay = await snapshot();
  equal((await call()).receipt, receipt, "Known durable receipt replays before an ambiguous legacy-season fence");
  equal(await snapshot(), beforeFencedReplay, "Fenced receipt replay does not alter the fence or projections");
  await pool.query("DELETE FROM postseason_award_legacy_seasons WHERE league_id='award-league'");

  // Neither the current coach assignment nor current season changes an old receipt.
  await pool.query("UPDATE teams SET coach_id='award-coach-away' WHERE id='award-home'");
  await pool.query("UPDATE leagues SET current_season=2 WHERE id='award-league'");
  const beforeReassignment = await snapshot();
  equal((await call()).receipt, receipt, "Reassignment and rollover cannot move a historical reward to a new coach");
  equal(await snapshot(), beforeReassignment, "Historical replay does not reward the replacement coach");
  equal((await call({ season: 2 })).error, "PostseasonAwardConflict", "New award refuses an assigned coach belonging to another team");
  await pool.query("UPDATE teams SET coach_id='award-coach-home' WHERE id='award-home'");
  await pool.query("UPDATE leagues SET current_season=1 WHERE id='award-league'");

  await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state) VALUES ('award-no-coach','award-league','No coach','Owls','NOC','Test','IA')");
  const empty = await call({ teamId: "award-no-coach" });
  equal([empty.error, empty.receipt.disposition, empty.receipt.coachId, empty.receipt.xpDelta, empty.receipt.milestoneDelta], [null, "no_coach", null, 0, 0], "Uncoached team persists an explicit zero-contribution receipt");
  await pool.query("UPDATE teams SET coach_id='award-coach-home' WHERE id='award-no-coach'");
  const beforeLateCoach = await snapshot();
  equal((await call({ teamId: "award-no-coach" })).receipt, empty.receipt, "Later coach assignment cannot create a retroactive contribution");
  equal(await snapshot(), beforeLateCoach, "No-coach replay writes nothing");
  await pool.query("UPDATE coaches SET xp=1850,level=1 WHERE id='award-coach-away'");

  await pool.query("CREATE FUNCTION reject_fixture_postseason() RETURNS trigger LANGUAGE plpgsql AS $fixture$ BEGIN RAISE EXCEPTION 'synthetic postseason receipt failure'; END $fixture$");
  await pool.query("CREATE TRIGGER reject_fixture_postseason BEFORE INSERT ON postseason_coach_awards FOR EACH ROW EXECUTE FUNCTION reject_fixture_postseason()");
  try {
    const beforeFailure = await snapshot();
    equal(typeof (await call({ teamId: "award-away" })).error, "string", "Required receipt insertion failure propagates");
    equal(await snapshot(), beforeFailure, "Receipt failure rolls back XP, counters, levels, points and every other persisted table");
  } finally {
    await pool.query("DROP TRIGGER reject_fixture_postseason ON postseason_coach_awards");
    await pool.query("DROP FUNCTION reject_fixture_postseason()");
  }
  // A game and a milestone concurrently touch the same coach projection.
  await pool.query("INSERT INTO games (id,league_id,season,week,home_team_id,away_team_id,phase) VALUES ('award-concurrent-game','award-league',1,1,'award-away','award-home','regular')");
  const mixed = await Promise.all([call({ teamId: "award-away" }), effectsCall([{ gameId: "award-concurrent-game" }])]);
  equal(mixed.map(row => row.error), [null, null], "Game award and recovered postseason award both commit concurrently");
  const gameEffect = (await pool.query("SELECT xp_delta FROM game_coach_effects WHERE game_id='award-concurrent-game' AND coach_id='award-coach-away'")).rows[0];
  const mixedCoach = await coach("away");
  equal([mixedCoach.xp, mixedCoach.conf_championships, mixedCoach.legacy_score], [2200 + gameEffect.xp_delta, 1, 6], "Game and milestone serialization preserves both XP deltas, championship and career win");
  equal([mixedCoach.level, mixedCoach.skill_points], [3, 5], "Every gained level grants its skill point alongside the legendary bonus, regardless of game/award order");

  const beforeLegacy = await snapshot();
  equal((await call({ leagueId: "legacy-award-league", teamId: "legacy-award-team" })).error, "PostseasonAwardReconciliationRequired", "Legacy ambiguity requires explicit reconciliation instead of claiming success");
  equal(await snapshot(), beforeLegacy, "Legacy rejection preserves old counters and XP and invents no receipt");
  {
    const leagueId = "legacy-award-league";
    const saved = await invoke(`/api/leagues/${leagueId}/save-states`, "POST", { label: "Legacy fence restore fixture" });
    equal(saved.response.status, 200, "Legacy-only league can capture a save");
    const before = await snapshot();
    equal((await invoke(`/api/leagues/${leagueId}/save-states/${saved.data.id}/restore`, "POST", {})).response.status, 409, "Legacy fence alone blocks destructive restore without game evidence");
    equal(await snapshot(), before, "Legacy-only restore rejection writes no backup or state");
  }
  await pool.query("INSERT INTO leagues (id,name,commissioner_id,current_phase,is_test_data) VALUES ('award-only-league','Award-only restore',$1,'regular_season',true)", [primaryId]);
  await pool.query("INSERT INTO teams (id,league_id,name,mascot,abbreviation,city,state) VALUES ('award-only-team','award-only-league','Award-only','Owls','AWR','Test','IA')");
  equal((await call({ leagueId: "award-only-league", teamId: "award-only-team" })).error, null, "Receipt-only restore fixture persists a real no-coach receipt");
  const saved = await invoke("/api/leagues/award-only-league/save-states", "POST", { label: "Award receipt restore fixture" });
  equal(saved.response.status, 200, "Receipt-only league can capture a save");
  const beforeAwardRestore = await snapshot();
  equal((await invoke(`/api/leagues/award-only-league/save-states/${saved.data.id}/restore`, "POST", {})).response.status, 409, "Postseason receipt alone blocks unsupported history restoration");
  equal(await snapshot(), beforeAwardRestore, "Receipt-only restore rejection makes no persistent changes");
}
