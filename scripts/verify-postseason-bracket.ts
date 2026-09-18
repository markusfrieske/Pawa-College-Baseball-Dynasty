import type pg from "pg";

export async function verifyPostseasonBracket({ pool, primaryId, equal, snapshot, advance }: {
  pool: pg.Pool; primaryId: string;
  equal: (actual: unknown, expected: unknown, label: string) => void;
  snapshot: () => Promise<unknown>; advance: (leagueId: string) => Promise<any>;
}) {
  async function fixture(id: string) {
    await pool.query("INSERT INTO leagues(id,name,commissioner_id,current_phase,dynasty_preset,is_test_data) VALUES($1,'Series fixture',$2,'super_regionals','full_season',true)", [id, primaryId]);
    await pool.query("INSERT INTO teams(id,league_id,name,mascot,abbreviation,city,state) SELECT $1||'-team-'||n,$1,'Team '||n,'Owls','SR','Test','IA' FROM generate_series(1,16) n", [id]);
    await pool.query("INSERT INTO postseason_series(id,league_id,season,stage,bracket_slot,round,home_team_id,away_team_id,best_of,home_wins,away_wins,series_status,is_complete) SELECT $1||'-series-'||n,$1,1,'super_regionals','SR'||n,n,$1||'-team-'||n,$1||'-team-'||(17-n),3,0,0,'pending',false FROM generate_series(1,8) n", [id]);
  }
  async function game(id: string, series: number, num: number, highWins: boolean) {
    const hi = `${id}-team-${series}`, lo = `${id}-team-${17-series}`;
    const home = num === 2 ? lo : hi, away = num === 2 ? hi : lo;
    const homeWins = num === 2 ? !highWins : highWins;
    await pool.query("INSERT INTO games(id,league_id,season,week,home_team_id,away_team_id,phase,bracket_type,bracket_round,bracket_side,is_complete,home_score,away_score) VALUES($1,$2,1,0,$3,$4,'super_regionals','bof3',$5,$6,true,$7,$8)", [`${id}-${series}-G${num}`,id,home,away,series,`G${num}`,homeWins?3:1,homeWins?1:3]);
  }
  const id = "bracket-truth";
  await fixture(id);
  const outcomes = [[true,true],[false,false],[true,false,true],[false,true,false],[true],[false],[],[true,false]];
  for (const [index, results] of outcomes.entries()) for (const [num, highWins] of results.entries()) await game(id,index+1,num+1,highWins);
  const first = await advance(id);
  equal([first.error,first.done], [null,false], "Mixed eight-series bracket advances without declaring incomplete series finished");
  equal([...first.winners].sort(), [1,15,3,13].map(n=>`${id}-team-${n}`).sort(), "Sweeps and three-game winners follow team identity when Game2 reverses home");
  const rows = (await pool.query("SELECT round,home_wins,away_wins,winner_id FROM postseason_series WHERE league_id=$1 ORDER BY round", [id])).rows;
  equal(rows.map(r=>[r.home_wins,r.away_wins]), [[2,0],[0,2],[2,1],[1,2],[1,0],[0,1],[0,0],[1,1]], "Series counters measure each original participant, not home/away wins");
  const pending = (await pool.query("SELECT bracket_round,bracket_side,home_team_id,away_team_id FROM games WHERE league_id=$1 AND NOT is_complete ORDER BY bracket_round", [id])).rows;
  equal(pending.map(r=>[r.bracket_round,r.bracket_side]), [[5,"G2"],[6,"G2"],[7,"G1"],[8,"G3"]], "Only necessary next games exist; sweeps never create Game3");
  equal(pending.map(r=>[r.home_team_id,r.away_team_id]), [[12,5],[11,6],[7,10],[8,9]].map(pair=>pair.map(n=>`${id}-team-${n}`)), "Next fixture home assignments preserve the high/low hosting schedule");
  const beforeRetry = await snapshot();
  equal(await advance(id), first, "Unchanged bracket retry returns the same result");
  equal(await snapshot(), beforeRetry, "Bracket retry creates no duplicate games or series updates");
  // Complete all pending rounds legally, then verify all eight actual winners.
  await pool.query("UPDATE games SET is_complete=true,home_score=1,away_score=3 WHERE league_id=$1 AND bracket_round=5 AND bracket_side='G2'", [id]);
  await pool.query("UPDATE games SET is_complete=true,home_score=3,away_score=1 WHERE league_id=$1 AND bracket_round IN (6,7,8) AND NOT is_complete", [id]);
  equal((await advance(id)).done, false, "Seven finished series cannot complete the full bracket");
  await pool.query("UPDATE games SET is_complete=true,home_score=1,away_score=3 WHERE league_id=$1 AND bracket_round=7 AND bracket_side='G2'", [id]);
  const final = await advance(id);
  equal(final.done, true, "All eight complete series produce a final bracket");
  equal([...final.winners].sort(), [1,15,3,13,5,11,7,8].map(n=>`${id}-team-${n}`).sort(), "Final CWS entrants preserve every identity-based winner");
  const beforeFinalRetry = await snapshot();
  equal(await advance(id), final, "Terminal bracket replay preserves winner identities");
  equal(await snapshot(), beforeFinalRetry, "Terminal replay changes no persisted rows");

  const invalid = "bracket-invalid";
  await fixture(invalid);
  for(let n=1;n<=8;n++) await game(invalid,n,1,true);
  const gameId = `${invalid}-8-G1`, seriesId = `${invalid}-series-8`;
  const mutations: Array<[string,string,string]> = [
    ["tied score", "UPDATE games SET away_score=home_score WHERE id=$1", "UPDATE games SET away_score=1 WHERE id=$1"],
    ["missing score", "UPDATE games SET home_score=NULL WHERE id=$1", "UPDATE games SET home_score=3 WHERE id=$1"],
    ["negative score", "UPDATE games SET away_score=-1 WHERE id=$1", "UPDATE games SET away_score=1 WHERE id=$1"],
    ["wrong participants", "UPDATE games SET away_team_id=home_team_id WHERE id=$1", "UPDATE games SET away_team_id='bracket-invalid-team-9' WHERE id=$1"],
    ["noncontiguous slot", "UPDATE games SET bracket_side='G3' WHERE id=$1", "UPDATE games SET bracket_side='G1' WHERE id=$1"],
    ["unsupported bracket type", "UPDATE games SET bracket_type='foreign' WHERE id=$1", "UPDATE games SET bracket_type='bof3' WHERE id=$1"],
    ["unknown series index", "UPDATE games SET bracket_round=9 WHERE id=$1", "UPDATE games SET bracket_round=8 WHERE id=$1"],
  ];
  for (const [label, mutate, undo] of mutations) {
    await pool.query(mutate,[gameId]);
    const before = await snapshot();
    equal((await advance(invalid)).error,"SuperRegionalReconciliationRequired", label+" blocks bracket advancement");
    equal(await snapshot(),before,label+" in last series prevents earlier series updates too");
    await pool.query(undo,[gameId]);
  }
  for (const [label, mutate, undo] of [
    ["contradictory terminal history", "UPDATE postseason_series SET series_status='complete',is_complete=true,winner_id=away_team_id,away_wins=2 WHERE id=$1", "UPDATE postseason_series SET series_status='pending',is_complete=false,winner_id=NULL,away_wins=0 WHERE id=$1"],
    ["duplicate series index", "UPDATE postseason_series SET round=1 WHERE id=$1", "UPDATE postseason_series SET round=8 WHERE id=$1"],
    ["foreign-league participants", "UPDATE postseason_series SET home_team_id='bracket-truth-team-8' WHERE id=$1", "UPDATE postseason_series SET home_team_id='bracket-invalid-team-8' WHERE id=$1"],
  ]) {
    await pool.query(mutate,[seriesId]);
    if (label === "foreign-league participants") await pool.query("UPDATE games SET home_team_id='bracket-truth-team-8' WHERE id=$1", [gameId]);
    const before=await snapshot();
    equal((await advance(invalid)).error,"SuperRegionalReconciliationRequired",label+" requires reconciliation");
    equal(await snapshot(),before,label+" is never silently repaired");
    await pool.query(undo,[seriesId]);
    if (label === "foreign-league participants") await pool.query("UPDATE games SET home_team_id='bracket-invalid-team-8' WHERE id=$1", [gameId]);
  }
  await pool.query("INSERT INTO games(id,league_id,season,week,home_team_id,away_team_id,phase,bracket_type,bracket_round,bracket_side,is_complete,home_score,away_score) SELECT 'duplicate-sr-game',league_id,season,week,home_team_id,away_team_id,phase,bracket_type,bracket_round,bracket_side,is_complete,home_score,away_score FROM games WHERE id=$1",[gameId]);
  const beforeDuplicate=await snapshot();
  equal((await advance(invalid)).error,"SuperRegionalReconciliationRequired","Duplicate game slots cannot add a phantom series win");
  equal(await snapshot(),beforeDuplicate,"Duplicate slot rejection writes nothing");
  await pool.query("DELETE FROM games WHERE id='duplicate-sr-game'");
  await game(invalid,8,2,false);
  await pool.query("UPDATE games SET is_complete=false WHERE id=$1", [gameId]);
  const beforeOutOfOrder = await snapshot();
  equal((await advance(invalid)).error,"SuperRegionalReconciliationRequired","Completed Game2 cannot bypass an unplayed Game1");
  equal(await snapshot(),beforeOutOfOrder,"Out-of-order completion rejects before any series update");
  await pool.query("UPDATE games SET is_complete=true WHERE id=$1", [gameId]);
  await game(id,1,3,false);
  const beforeExtra=await snapshot();
  equal((await advance(id)).error,"SuperRegionalReconciliationRequired","An extra game after a clinch cannot rewrite a completed outcome");
  equal(await snapshot(),beforeExtra,"Post-clinch ambiguity preserves historical state pending repair");
}
