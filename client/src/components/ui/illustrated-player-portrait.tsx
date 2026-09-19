import { useEffect, useRef, useState } from 'react';
import { cancelPortrait, renderPortrait } from '../../../public/art/players/v1/runtime.mjs';

/** Opt-in asset identity. Persist portraitId separately from team color.
 * Existing saved appearances are never silently assigned or replaced here. */
export function IllustratedPlayerPortrait({portraitId,teamColor,alt,className='',size=384}:{portraitId:string;teamColor?:string;alt:string;className?:string;size?:number}) {
  const ref=useRef<HTMLCanvasElement>(null);
  const [failed,setFailed]=useState(false);
  const key=`${portraitId}:${teamColor}:${size}`;
  const [renderedKey,setRenderedKey]=useState('');
  useEffect(()=>{const canvas=ref.current;if(!canvas)return;let active=true;setFailed(false);
    renderPortrait(canvas,{id:portraitId,teamColor,size}).then(done=>{if(active&&done)setRenderedKey(key);}).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;cancelPortrait(canvas);};
  },[portraitId,teamColor,size,key]);
  return <span className={`relative inline-block aspect-square overflow-hidden ${className}`}>
    <canvas ref={ref} role="img" aria-label={alt} className={`h-full w-full ${failed||renderedKey!==key?'invisible':''}`} />
    {failed&&<span role="img" aria-label={`${alt} — portrait unavailable`} className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">Portrait unavailable</span>}
  </span>;
}
