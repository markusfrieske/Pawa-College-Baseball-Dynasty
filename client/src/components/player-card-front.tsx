import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Player } from "./player-profile-card";
import { PlayerPortrait } from "./ui/player-portrait";
import { LetterGrade } from "./ui/letter-grade";
import { allPitchKeys, pitchLabels } from "./ui/pitch-mix-dial";
import { getPotentialGrade } from "@shared/potential";
import { getAbilityByName, S_GOLD_COMMON_KEY, S_GOLD_PITCHER_KEY } from "@shared/abilities";
import { isPitcher } from "@shared/positions";
import "./player-card-front.css";

type Season = { season: number; teamId?: string; [key: string]: string | number | null | undefined };
type Row = readonly [string, string];
const core: Row[] = [["Contact","hitForAvg"],["Power","power"],["Speed","speed"],["Arm","arm"],["Fielding","fielding"],["Error resistance","errorResistance"]];
const pitcherCore: Row[] = [["Velocity","velocity"],["Control","control"],["Stamina","stamina"],["Stuff","stuff"]];
const common: Row[] = [["Clutch","clutch"],["vs LHP","vsLHP"],["Grit","grit"],["Stealing","stealing"],["Running","running"],["Throwing","throwing"],["Recovery","recovery"]];
const pitcherCommon: Row[] = [["W/RISP","wRISP"],["vs Lefty","vsLefty"],["Poise","poise"],["Grit","grit"],["Heater","heater"],["Agile","agile"],["Recovery","recovery"]];
const statGroups: { name: string; rows: Row[] }[] = [
 {name:"Batting",rows:[["G","games"],["PA",""],["AB","ab"],["H","h"],["R","r"],["2B","doubles"],["3B","triples"],["HR","hr"],["RBI","rbi"],["BB","bb"],["HBP",""],["SF",""],["SO","so"],["SB","sb"],["CS",""],["AVG","avg"],["OBP*","obp"],["SLG","slg"],["OPS*","ops"]]},
 {name:"Pitching",rows:[["G","pitchingGames"],["W","wins"],["L","losses"],["IP","ipDisplay"],["H","pHits"],["R","pRuns"],["ER","pEr"],["BB","pBb"],["SO","pSo"],["HR","pHr"],["ERA","era"],["WHIP","whip"]]},
 {name:"Fielding",rows:[["PO",""],["A",""],["E",""],["TC",""],["FLD%",""]]},
 {name:"Advanced",rows:[["WPA",""],["Exit velocity",""],["Launch angle",""],["Barrels",""],["Hard-hit rate",""],["Whiffs",""],["Spin rate",""]]}
];
// Solid icons are supplementary; every icon retains a visible text label.
function Icon({kind}:{kind:string}) { const d = kind === "home" ? "M12 2 1 11h3v11h6v-7h4v7h6V11h3Z" : kind === "class" ? "M1 7 12 2 23 7 12 12ZM5 11v7l7 4 7-4v-7l-7 4Z" : kind === "person" ? "M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 22v-5a8 6 0 0 1 16 0v5Z" : "M3 12h4v9H3zM10 3h4v18h-4zM17 8h4v13h-4z";return <svg className="c9-card-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>; }
function Ratings({player,rows,common=false}:{player:Player;rows:Row[];common?:boolean}) { return <dl className="c9-card-values">{rows.map(([label,key])=>{const value=player[key as keyof Player];const gold=common?Object.entries(isPitcher(player.position)?S_GOLD_PITCHER_KEY:S_GOLD_COMMON_KEY).find(([name,field])=>field===key&&player.abilities?.includes(name))?.[0]:undefined;return <div key={key}><dt>{label}{key==='velocity'?' · rating':''}</dt><dd data-testid={`card-rating-${key}`}>{typeof value === 'number' && Number.isFinite(value)?<><LetterGrade value={value} size="sm" isCommonAbility={common}/><span>{value}</span>{gold&&<small title={gold} aria-label={`${gold}: S gold effect`}>S effect</small>}</>:<span title="Not recorded">—</span>}</dd></div>})}</dl>; }
export function PlayerCardFront({player,leagueId,teamColor}:{player:Player;leagueId?:string;teamColor?:string}) {
 const [abilityNote,setAbilityNote]=useState<string|null>(null);
 const pitching=isPitcher(player.position),[selectedSeason,setSelectedSeason]=useState<string>('latest');
 const query=useQuery<{seasons:Season[]}>({queryKey:["/api/leagues",leagueId,"players",player.id,"career-stats"],enabled:!!leagueId,retry:false,staleTime:30000});
 const seasons=query.data?.seasons??[];
 const latest=Math.max(...seasons.map(s=>s.season));
 const season=selectedSeason==='latest'?[...seasons].reverse().find(s=>s.season===latest):seasons[Number(selectedSeason)];
 const equippedPitches=[...allPitchKeys,'SPL'].flatMap(key=>{const value=player[('pitch'+key) as keyof Player];return typeof value==='number'&&Number.isFinite(value)&&value>0?[{key,value}]:[];});
 const commonRows=pitching?pitcherCommon:[...common,...(player.position==='C'?[["Catcher","catcherAbility"] as Row]:[])];
 const hometown=[player.hometown,player.homeState].filter(Boolean).join(', ')||'Not recorded';
 return <article className="c9-card-front" data-testid="complete-player-card">
  <header><div><span className="c9-card-kicker">CLASS OF NINE · PLAYER RECORD</span><h2>{player.firstName} {player.lastName}</h2></div><div className="c9-card-summary"><span><b>{player.overall ?? '—'}</b> Overall</span><span><b>{player.potential==null?'—':getPotentialGrade(player.potential)}</b> Potential {player.potential??''}</span></div></header>
  <div className="c9-card-bio"><span><Icon kind="person"/><b>Position / hand</b> #{player.jerseyNumber} · {player.position} · Bats {player.bats||player.batHand||'—'} / Throws {player.throws||player.throwHand||'—'}</span><span><Icon kind="class"/><b>Class</b> {player.eligibility||'Not recorded'}</span><span><Icon kind="home"/><b>Hometown</b> {hometown}</span></div>
  <div className="c9-card-upper"><div className="c9-card-portrait"><PlayerPortrait portraitId={player.portraitId} playerId={player.id} skinTone={player.skinTone} hairColor={player.hairColor} hairStyle={player.hairStyle} facialHair={player.facialHair??undefined} eyeStyle={player.eyeStyle??undefined} eyebrowStyle={player.eyebrowStyle??undefined} mouthStyle={player.mouthStyle??undefined} eyeBlack={player.eyeBlack??undefined} jerseyColor={teamColor} className="w-full h-full"/><strong>{player.position}</strong></div><section><h3><Icon kind="ratings"/>Core ratings · 0–100</h3><Ratings player={player} rows={pitching?pitcherCore:core}/>{!pitching&&<div className="c9-card-trajectory">Trajectory <b>{player.trajectory??'—'}{player.trajectory!=null?' / 4':''}</b></div>}</section><section><h3><Icon kind="ratings"/>Stored common attributes</h3><Ratings player={player} rows={commonRows} common/></section></div>
  {pitching&&<section className="c9-card-pitches"><h3>Pitch repertoire</h3>{equippedPitches.length?<dl>{equippedPitches.map(({key,value})=>{const name=pitchLabels[key]||'Splitter',fastball=key==='FB'||key==='2S';return <div key={key} data-testid={'card-pitch-'+key}><dt>{name}</dt><dd>{fastball?<span className="c9-pitch-segments c9-pitch-binary" role="img" aria-label={name+': equipped'}><i className="filled" aria-hidden="true"/></span>:<span className="c9-pitch-segments" role="img" aria-label={name+': break level '+value+' of 7'}>{Array.from({length:7},(_,i)=><i key={i} aria-hidden="true" className={i<value?'filled':''}/>)}</span>}</dd></div>})}</dl>:<p>No equipped pitches recorded.</p>}</section>}
  <section className="c9-card-abilities"><h3>Abilities</h3>{player.abilities==null?<span>Not recorded</span>:player.abilities.length?player.abilities.map((name,i)=>{const ability=getAbilityByName(name);return <button type="button" key={`${name}-${i}`} aria-expanded={abilityNote===name} onClick={()=>setAbilityNote(abilityNote===name?null:name)} className={`c9-ability c9-ability-${ability?.tier||'unknown'}`}>{name}{player.storyLockedAbilities?.includes(name)?' · Story':''}</button>}):<span>No special abilities</span>}</section>
  {abilityNote&&<p className="c9-card-ability-note" role="status"><b>{abilityNote}</b> · {getAbilityByName(abilityNote)?.description||"No description recorded."}</p>}
  <section className="c9-card-record"><div className="c9-card-record-heading"><h3>Season record</h3>{seasons.length>0&&<label>Season <select aria-label="Player record season" value={selectedSeason} onChange={e=>setSelectedSeason(e.target.value)}><option value="latest">Latest recorded · {latest}</option>{seasons.map((s,i)=><option key={i} value={i}>Season {s.season} · {s.position||'Player'} · record {i+1}</option>)}</select></label>}<span>— = unavailable · Recorded totals</span></div>
   {!leagueId?<p>No league statistics linked.</p>:query.isPending?<p role="status">Loading season record…</p>:query.isError?<p role="alert">Season record could not load. <button onClick={()=>query.refetch()}>Retry statistics</button></p>:!season?<p>No season record available.</p>:null}
   <div className="c9-card-stat-groups">{statGroups.map(group=><section key={group.name}><h4><Icon kind="ratings"/>{group.name}</h4><dl>{group.rows.map(([label,key])=>{let value=season?.[key];if(query.isError||!key)value=null;if((['avg','slg','ops'].includes(key)&&!Number(season?.ab))||(key==='obp'&&!Number(season?.ab)&&!Number(season?.bb)&&!Number(season?.hbp))||(['era','whip'].includes(key)&&(!season?.ipDisplay||season.ipDisplay==='0.0')))value=null;return <div key={label}><dt>{label}</dt><dd data-testid={`card-stat-${group.name}-${label}`}>{value??'—'}</dd></div>})}</dl></section>)}</div>
   <p className="c9-card-provenance">* OBP/OPS omit sacrifice flies. PA/SF, fielding and advanced data are unavailable here; HBP/CS lack reporting provenance. Totals cover recorded games, not necessarily the full schedule. S effect marks a linked gold ability; the number remains the stored rating.</p>
  </section>
 </article>;
}
