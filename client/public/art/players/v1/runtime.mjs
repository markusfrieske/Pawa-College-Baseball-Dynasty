/** Versioned portrait rendering. Only authored magenta fabric is recolored.
 * Natural face/hair/eye pixels are retained; never apply a whole-image hue filter. */
export const DEFAULT_TEAM_COLOR = '#24523d';
export function normalizeTeamColor(value) {
  if (typeof value !== 'string') return DEFAULT_TEAM_COLOR;
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value)) return '#'+[...value.slice(1)].map(c=>c+c).join('').toLowerCase();
  return DEFAULT_TEAM_COLOR;
}
export function isFabricKey(r,g,b) {
  return Math.min(r,b)-g>12 && r>b*.55 && b>r*.55;
}
export function recolorFabric(data, color) {
  const hex=normalizeTeamColor(color).slice(1), rgb=[0,2,4].map(n=>parseInt(hex.slice(n,n+2),16));
  for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(!isFabricKey(r,g,b))continue;
    const shade=(Math.max(r,b)-g)/255;
    for(let c=0;c<3;c++)data[i+c]=Math.min(255,Math.round(rgb[c]*shade+g));
  }
  return data;
}
const images=new Map(), jobs=new WeakMap();
function getImage(src){if(!images.has(src)){const promise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Portrait image unavailable'));img.src=src;});images.set(src,promise);promise.catch(()=>images.delete(src));}return images.get(src);}
export async function renderPortrait(canvas,{id,teamColor=DEFAULT_TEAM_COLOR,size=384,baseUrl='/art/players/v1'}={}){
  if(!/^c9-face-(0[1-9]|[12]\d|30)$/.test(id||''))throw new Error('Unknown portrait identity');
  const token={};jobs.set(canvas,token);const image=await getImage(baseUrl+'/'+id+'.png');
  if(jobs.get(canvas)!==token)return false;
  const edge=Math.max(40,Math.min(1024,Math.round(size)||384));canvas.width=edge;canvas.height=edge;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas is unavailable');
  ctx.drawImage(image,0,0,edge,edge);const frame=ctx.getImageData(0,0,edge,edge);
  recolorFabric(frame.data,teamColor);ctx.putImageData(frame,0,0);canvas.dataset.portraitId=id;canvas.dataset.teamColor=normalizeTeamColor(teamColor);return true;
}
export function cancelPortrait(canvas){jobs.delete(canvas);}
