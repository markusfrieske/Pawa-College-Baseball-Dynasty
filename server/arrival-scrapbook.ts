import type { PoolClient } from "pg";
import { pool } from "./db";
import { resolvePortraitId } from "../client/src/lib/portrait-selection";

// Version 1 captures the public arrival card, never live scouting interests or engine metadata.
const fields = ['id','firstName','lastName','position','throwHand','batHand','homeState','hometown','recruitType','recruitYear','overall','starRating','potential','hitForAvg','power','speed','arm','fielding','errorResistance','velocity','control','stamina','stuff','clutch','vsLHP','grit','stealing','running','throwing','recovery','catcherAbility','wRISP','vsLefty','poise','heater','agile','trajectory','abilities','storyLockedAbilities','portraitId','skinTone','hairColor','hairStyle','facialHair','eyeStyle','eyebrowStyle','mouthStyle','eyeBlack','pitchFB','pitch2S','pitchSL','pitchCB','pitchCH','pitchCT','pitchSNK','pitchSPL','pitchSHU','pitchCCH','pitchHSL','pitchSWP','pitchKN','pitchVSL','pitchSFF','pitchFK','pitchSCB','pitchPCB'];
// Acronym columns use the schema's canonical spellings.
const column = (key:string) => key.startsWith('pitch') ? 'pitch_'+key.slice(5).toLowerCase() : key==='vsLHP'?'vs_lhp':key==='wRISP'?'w_risp':key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
export async function captureArrival(connection: Pick<PoolClient,'query'>, leagueId:string, season:number, recruitId:string) {
 const result=await connection.query('SELECT r.*,t.name AS team_name,t.abbreviation,t.primary_color,t.secondary_color FROM recruits r JOIN teams t ON t.id=r.signed_team_id AND t.league_id=r.league_id WHERE r.id=$1 AND r.league_id=$2 AND r.signing_day_revealed=true',[recruitId,leagueId]);
 const row=result.rows[0];if(!row)throw new Error('Only an authorized revealed signing can be archived');
 const player=Object.fromEntries(fields.map(key=>[key,row[column(key)]]));
 player.portraitId=resolvePortraitId(row.portrait_id,row.skin_tone,row.hair_color);
 player.portraitAssetVersion=1;player.signingDayRevealed=true;
 const team={id:row.signed_team_id,name:row.team_name,abbreviation:row.abbreviation,primaryColor:row.primary_color,secondaryColor:row.secondary_color};
 await connection.query('INSERT INTO arrival_records(league_id,source_recruit_id,team_id,season,player_snapshot,team_snapshot) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(league_id,source_recruit_id) DO NOTHING',[leagueId,recruitId,row.signed_team_id,season,JSON.stringify(player),JSON.stringify(team)]);
}
export async function publishConvertedArrival(leagueId:string,season:number,recruitId:string) {
 const connection=await pool.connect();try{await connection.query('BEGIN');await connection.query('UPDATE recruits SET signing_day_revealed=true WHERE id=$1 AND league_id=$2',[recruitId,leagueId]);await captureArrival(connection,leagueId,season,recruitId);await connection.query('COMMIT');}catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
}
export async function readScrapbook(leagueId:string,season?:number) {
 const {rows}=await pool.query('SELECT a.*,p.id AS player_id,t.id AS roster_team_id FROM arrival_records a LEFT JOIN players p ON p.arrival_source_recruit_id=a.source_recruit_id LEFT JOIN teams t ON t.id=p.team_id AND t.league_id=a.league_id WHERE a.league_id=$1 ORDER BY a.season DESC,a.created_at,a.id',[leagueId]);
 const seasons=[...new Set<number>(rows.map(r=>r.season))];const selectedSeason=season??seasons[0]??null;
 const teamData: any[]=[];
 for(const row of rows.filter(r=>r.season===selectedSeason)){
  let entry=teamData.find(t=>t.team.id===row.team_id);if(!entry){entry={team:row.team_snapshot,recruits:[],canCompleteReveal:false};teamData.push(entry);}
  entry.recruits.push({...row.player_snapshot,arrivalRecordId:row.id,arrivalTeam:row.team_snapshot,rosterPlayerId:row.roster_team_id?row.player_id:null,rosterTeamId:row.roster_team_id??null});
 }
 return {seasons,recordSeason:selectedSeason,teamData};
}
