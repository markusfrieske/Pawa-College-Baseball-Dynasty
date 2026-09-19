import type { RecruitWithInterest } from "@/lib/recruitingUtils";
import { LetterGrade } from "@/components/ui/letter-grade";
import { getAbilityByName } from "@shared/abilities";
import { computeRevealedPitchFields } from "@shared/recruitThresholds";
import { allPitchKeys, pitchLabels } from "@/components/ui/pitch-mix-dial";
import { velocityToKMH } from "@/lib/playerUtils";
import { ClipboardList, Lock, Sparkles } from "lucide-react";
import "./scouting-sheet.css";

type Attribute = {key: string; label: string; val: number | null | undefined};
const labels: Record<string,string> = {hitForAvg:"Contact",power:"Power",speed:"Speed",arm:"Arm",fielding:"Fielding",errorResistance:"Error resistance",velocity:"Velocity",control:"Control",stamina:"Stamina",wRISP:"With RISP",vsLefty:"vs lefties",poise:"Poise",grit:"Grit",heater:"Heater",agile:"Agility",recovery:"Recovery",clutch:"Clutch",vsLHP:"vs LHP",stealing:"Stealing",running:"Running",throwing:"Throwing",catcherAbility:"Catching"};

export function ScoutingSheet({recruit,primary,common,known,fullyRevealed,pitching}: {
  recruit: RecruitWithInterest; primary: Attribute[]; common: Attribute[];
  known: (key:string)=>boolean; fullyRevealed:boolean; pitching:boolean;
}) {
  const pct = recruit.interest?.scoutPercentage ?? 0;
  const locked = new Set(recruit.signingDayLockedFields ?? []);
  const isKnown = (a: Attribute) => !locked.has(a.key) && known(a.key) && a.val != null && Number.isFinite(a.val);
  const attributes = [...primary,...common];
  const range = recruit.interest;
  const overall = fullyRevealed && Number.isFinite(recruit.overall) ? String(recruit.overall) : pct>0 && range?.minOverall != null && range?.maxOverall != null ? range.minOverall+'–'+range.maxOverall : 'Unknown';
  const specials = (recruit.abilities ?? []).filter(name=>['gold','blue','red'].includes(getAbilityByName(name)?.tier ?? ''));
  const visibleAbilities = fullyRevealed ? specials : specials.slice(0,recruit.interest?.revealedAbilitiesCount ?? 0);
  const pitchKnowledge = computeRevealedPitchFields(recruit.scoutingOrder as string[],pct);
  const pitches = [...allPitchKeys,'SPL'].flatMap(key=>{
    const field=('pitch'+key) as keyof RecruitWithInterest;
    const value=recruit[field];
    return !locked.has(field) && (fullyRevealed || pitchKnowledge.has(field)) && typeof value==='number' && value>0 ? [{key,value}] : [];
  });
  const renderRatings = (fields: Attribute[], commonAbility=false) => <dl className="c9-scout-ratings">{fields.map(a=><div key={a.key} data-testid={'scout-rating-'+a.key} data-knowledge={isKnown(a)?'known':locked.has(a.key)?'arrival':'unknown'}><dt>{labels[a.key] ?? a.label}</dt><dd>{isKnown(a)?<><LetterGrade value={a.val!} isCommonAbility={commonAbility} size="sm"/><b>{a.key==='velocity'?velocityToKMH(a.val!)+' km/h':a.val}</b></>:<span>{locked.has(a.key)?<><Lock size={12} aria-hidden="true"/>Arrival</>:'—'}</span>}</dd><small>{isKnown(a)?'Known':locked.has(a.key)?'Revealed on arrival':'Not yet scouted'}</small></div>)}</dl>;
  return <section className="c9-scout-sheet" aria-label="Scouting evaluation" data-testid={'scouting-sheet-'+recruit.id}>
    <h2>{recruit.firstName} {recruit.lastName}</h2><p>{recruit.position} · {recruit.hometown}, {recruit.homeState}</p>
    <header><ClipboardList size={18} aria-hidden="true"/><strong>SCOUTING REPORT</strong><span>{pct}% scouted</span></header>
    <div className="c9-scout-overview"><div><small>Overall · {fullyRevealed?'known':'scouted range'}</small><strong data-testid="scout-overall-range">{overall}</strong></div><p>{attributes.filter(isKnown).length} / {attributes.length} ratings known<br/>Unknown ratings are not zero.</p></div>
    <h3>Core ratings</h3>{renderRatings(primary)}
    <h3>Common abilities</h3>{renderRatings(common,true)}
    {pitching && <section className="c9-scout-pitches"><h3>Identified pitches</h3><div>{pitches.map(({key,value})=><div key={key} data-testid={'scout-pitch-'+key}><strong>{pitchLabels[key] ?? 'Splitter'}</strong>{key==='FB'||key==='2S'?<span className="c9-scout-segments binary" role="img" aria-label={(pitchLabels[key]??key)+': equipped'}><i className="filled"/></span>:fullyRevealed||pct>=50?<span className="c9-scout-segments" role="img" aria-label={(pitchLabels[key]??key)+': break level '+value+' of 7'}>{Array.from({length:7},(_,i)=><i key={i} className={i<value?'filled':''} aria-hidden="true"/>)}</span>:<small>Identified · break unknown</small>}</div>)}</div><p>{fullyRevealed?'Only equipped pitches are shown.':'Only identified pitches are shown. The rest of the repertoire is unknown.'}</p></section>}
    <h3><Sparkles size={14} aria-hidden="true"/> Revealed special abilities</h3>
    <div className="c9-scout-abilities">{visibleAbilities.map((name,i)=>{const ability=getAbilityByName(name);return <details key={name+i} className={'tier-'+(ability?.tier??'unknown')}><summary>{name}</summary><p>{ability?.description??'No description available.'}</p></details>})}</div>
    {!visibleAbilities.length&&<p>{fullyRevealed?'No special abilities recorded.':'No special abilities revealed yet.'}</p>}
    {!fullyRevealed&&<p className="c9-scout-knowledge">Scouting may reveal individual ratings and overall ranges. Arrival reveals any remaining locked information.</p>}
  </section>;
}
