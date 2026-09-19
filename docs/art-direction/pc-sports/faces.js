import {renderPortrait,normalizeTeamColor} from '/art/players/v1/runtime.mjs';
const gallery=document.querySelector('#gallery'),input=document.querySelector('#color'),status=document.querySelector('#status'),dialog=document.querySelector('#detail');
let manifest,selection,revision=0;
const entries=[];
for(const [name,color] of [['Forest','#24523d'],['Navy','#183358'],['Scarlet','#bd2737'],['Royal','#235ec1'],['Gold','#d8aa29'],['Purple','#6e398c'],['Black','#24242a'],['White','#deded8']]){
 const button=document.createElement('button');button.style.setProperty('--color',color);button.setAttribute('aria-label',name+' team color');button.title=name;button.addEventListener('click',()=>{input.value=color;refresh()});document.querySelector('#presets').append(button);
}
async function refresh(){const ticket=++revision,color=normalizeTeamColor(input.value);status.textContent='Applying team color…';
 const results=await Promise.allSettled(entries.map(({canvas,face})=>renderPortrait(canvas,{id:face.id,teamColor:color,size:256})));
 if(ticket!==revision)return;const failures=results.filter(r=>r.status==='rejected').length;
 status.textContent=failures?`${failures} portraits unavailable. Change color to retry.`:`${entries.length} portraits ready · ${color.toUpperCase()}`;
 if(dialog.open&&selection)await inspect(selection,false);
}
async function inspect(face,open=true){selection=face;document.querySelector('#detail-title').textContent=face.id.toUpperCase();document.querySelector('#traits').textContent=`${face.skin} skin · ${face.hairColor} ${face.hairStyle} · ${face.eyes} eyes. ${face.features}.`;
 const canvas=document.querySelector('#large');canvas.setAttribute('aria-label',face.id+' enlarged portrait');document.querySelector('#sizes').replaceChildren();
 if(open)dialog.showModal();
 const download=document.querySelector('#download');download.removeAttribute('href');download.textContent='Preparing portrait…';
 try{await renderPortrait(canvas,{id:face.id,teamColor:input.value,size:768});
  for(const size of [40,80,160]){const div=document.createElement('div'),small=document.createElement('canvas'),label=document.createElement('small');small.style.width=size+'px';small.style.height=size+'px';small.setAttribute('role','img');small.setAttribute('aria-label',face.id+' at '+size+' pixels');label.textContent=size+' px';div.append(small,label);document.querySelector('#sizes').append(div);await renderPortrait(small,{id:face.id,teamColor:input.value,size:size*2});}
  if(selection!==face)return;download.href=canvas.toDataURL('image/png');download.download=face.id+'-'+input.value.slice(1)+'.png';download.textContent='Download team-colored portrait';
 }catch{download.textContent='Portrait unavailable; close and retry.'}
}
input.addEventListener('input',refresh);document.querySelector('#close').addEventListener('click',()=>dialog.close());
try{const response=await fetch('/art/players/v1/manifest.json');if(!response.ok)throw new Error('Manifest unavailable');manifest=await response.json();
 for(const face of manifest.faces){const button=document.createElement('button'),canvas=document.createElement('canvas'),title=document.createElement('strong'),desc=document.createElement('span');button.className='face';button.setAttribute('aria-label','Inspect '+face.id);canvas.setAttribute('role','img');canvas.setAttribute('aria-label',face.id+' cel player portrait');title.textContent=face.id.toUpperCase();desc.textContent=face.hairColor+' hair · '+face.eyes+' eyes';button.append(canvas,title,desc);button.addEventListener('click',()=>inspect(face));gallery.append(button);entries.push({canvas,face});}
 await refresh();
}catch(error){status.textContent='Player library unavailable. Reload to retry.';console.error(error);}
