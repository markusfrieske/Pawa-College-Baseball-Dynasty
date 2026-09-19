import { useEffect, useRef, useState } from "react";
import { useMusic } from "./music-context";
import { isSfxEnabled } from "./sfx";

// Original procedural motif; no borrowed music or recordings. One bounded cue per user action.
export function useArrivalAudio() {
  const music = useMusic();
  const [status, setStatus] = useState("");
  const active = useRef<AudioContext | null>(null);
  const generation = useRef(0);
  const stop = () => { generation.current++; const ctx=active.current; active.current=null; if(ctx && ctx.state!=="closed") void ctx.close().catch(()=>{}); };
  useEffect(() => { stop(); }, [music.muted, music.volume]);
  useEffect(() => { const hide=()=>{if(document.hidden)stop();}; document.addEventListener("visibilitychange",hide); const settings=()=>{if(!isSfxEnabled())stop();};window.addEventListener("c9-sfx-change",settings); return ()=>{document.removeEventListener("visibilitychange",hide);window.removeEventListener("c9-sfx-change",settings);stop();}; }, []);
  async function play() {
    stop();setStatus("");
    if(music.muted || music.volume<=0)return;
    if(!isSfxEnabled()){setStatus("Sound effects are disabled in game settings.");return;}
    const ticket=generation.current;
    try {
      const ctx=new AudioContext();active.current=ctx;
      window.setTimeout(()=>{if(active.current===ctx)stop();},1500);
      await ctx.resume();
      if(ticket!==generation.current || !isSfxEnabled() || ctx.state!=="running"){if(ctx.state!=="closed")void ctx.close();return;}
      const master=ctx.createGain();master.gain.value=Math.min(1,Math.max(0,music.volume))*.18;master.connect(ctx.destination);
      const now=ctx.currentTime;
      // Warm fifth / major-sixth welcome; soft wooden nameplate tap at 200ms.
      for(const [hz,delay,length,level] of [[196,0,.65,.6],[293.66,.16,.65,.45],[329.63,.4,.9,.4],[130,.2,.07,.3]]) {
        const osc=ctx.createOscillator(), gain=ctx.createGain();osc.type="sine";osc.frequency.value=hz;
        gain.gain.setValueAtTime(0,now+delay);gain.gain.linearRampToValueAtTime(level,now+delay+.012);gain.gain.exponentialRampToValueAtTime(.001,now+delay+length);
        osc.connect(gain);gain.connect(master);osc.start(now+delay);osc.stop(now+delay+length);
      }
      // Low, filtered room air under the short motif, never a looping background track.
      const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*1.4),ctx.sampleRate), samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.08*Math.sin(Math.PI*i/samples.length);
      const room=ctx.createBufferSource(), filter=ctx.createBiquadFilter();room.buffer=buffer;filter.type="lowpass";filter.frequency.value=450;room.connect(filter);filter.connect(master);
      room.onended=()=>{if(active.current===ctx)stop();};room.start();
    } catch { if(ticket===generation.current){stop();setStatus("Audio unavailable. The complete reveal is still available.");} }
  }
  return { ...music, play, stop, status };
}
