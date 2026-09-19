import { ALL_PITCH_SCOUTING_KEYS, computeRevealedPitchFields, patchScoutingOrder, DEFAULT_PITCHER_SCOUTING_ORDER } from "@shared/recruitThresholds";
import { getAbilityByName } from "@shared/abilities";
import { isPitcher } from "@shared/positions";

const core = ['hitForAvg','power','speed','arm','fielding','errorResistance','velocity','control','stamina','stuff'];
const common = ['clutch','vsLHP','grit','stealing','running','throwing','recovery','catcherAbility','wRISP','vsLefty','poise','heater','agile'];
const pitches = [...ALL_PITCH_SCOUTING_KEYS,'pitchSPL'];
export const arrivalPhase = (phase: string) => ['offseason_signing_day','offseason_walkons'].includes(phase);
/** Copy only disclosed values into the transport view. Never mutate the stored recruit. */
export function discloseRecruit<T extends Record<string, any>>(source:T, interest:Record<string,any>|null|undefined=source.interest, commissionerEditAccess=false):T {
  const result:Record<string,any>={...source};
  const full=commissionerEditAccess || source.isBlueChip===true || source.signingDayRevealed===true;
  const pct=Math.max(0,Math.min(100,interest?.scoutPercentage ?? 0));
  const known=new Set<string>(interest?.revealedAttributes ?? []);
  const attrKeys=isPitcher(source.position)?['velocity','control','stamina','fielding','stuff',...pitches]:core.slice(0,6);
  const commonKeys=isPitcher(source.position)?['wRISP','vsLefty','poise','grit','heater','agile','recovery']:common.slice(0,8);
  const order=(source.scoutingOrder ?? []) as string[];
  const ordered=(keys:string[])=>[...order.filter((k,i)=>keys.includes(k)&&order.indexOf(k)===i),...keys.filter(k=>!order.includes(k))];
  const locks=full || (source.isGenerationalGem && source.gemBustRevealed) ? [] : [ordered(attrKeys),ordered(commonKeys)].flatMap(keys=>keys.slice(Math.floor(keys.length/2)));
  const locked=new Set(locks);result.signingDayLockedFields=locks;
  for(const key of core) if(!full && (!known.has(key)||locked.has(key)))result[key]=null;
  const effectiveOrder=order.length ? (isPitcher(source.position)?patchScoutingOrder(order):order) : (isPitcher(source.position)?DEFAULT_PITCHER_SCOUTING_ORDER:[...core.slice(0,6),...common.slice(0,8)]);
  const commonKnown=new Set(effectiveOrder.slice(0,Math.ceil(pct/100*effectiveOrder.length)));
  for(const key of common) if(!full && (!commonKnown.has(key)||locked.has(key)))result[key]=null;
  const pitchKnown=computeRevealedPitchFields(order,pct);
  for(const key of pitches) {
    if(!full && (!isPitcher(source.position)||key==='pitchSPL'||!pitchKnown.has(key)||locked.has(key)))result[key]=null;
    else if(!full && pct<50 && typeof source[key]==='number')result[key]=source[key]>0?1:0; // type known; strength withheld
  }
  if(!full){result.overall=null;result.starRating=null;result.potential=null;result.storyLockedAbilities=[];result.tools=[];result.commitmentThreshold=null;
    const specials=(source.abilities ?? []).filter((name:string)=>['gold','blue','red'].includes(getAbilityByName(name)?.tier ?? ''));
    result.abilities=specials.slice(0,Math.max(0,interest?.revealedAbilitiesCount ?? 0));
    if(pct<100){result.potentialFloor=null;result.potentialCeiling=null;}
    if(pct<50)result.trajectory=null;
    if(pct<75){result.playerArchetype=null;result.workEthicScore=null;result.coachability=null;result.personality=null;result.workEthic=null;}
    if(!source.gemBustRevealed)for(const key of ['isGem','isBust','isGenerationalGem','isGenerationalBust'])result[key]=null;
  }
  return result as T;
}
export function publicRecruitStars(recruit:Record<string,any>):number {return recruit.starRank ?? 0;}
