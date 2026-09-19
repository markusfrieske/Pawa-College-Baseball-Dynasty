/** Assemble every authored PC screen brief; never silently drop an old route. */
import fs from 'node:fs';import assert from 'node:assert/strict';
const root='docs/art-direction/pc-sports';
const inventory=JSON.parse(fs.readFileSync('docs/art-direction/2026-09-18/screen-designs.json','utf8'));
const originals=[...inventory.screens,...inventory.overlays];
const sources=[],screens=[];
for(const name of ['team','competition','experience']){
 const pack=JSON.parse(fs.readFileSync(root+'/research/'+name+'.json','utf8'));
 const layoutFile=JSON.parse(fs.readFileSync(root+'/research/'+name+'-layouts.json','utf8'));const layouts=Array.isArray(layoutFile)?layoutFile:layoutFile.screens;
 for(const source of pack.sources){for(const field of ['id','title','url','observed','adaptation','evidenceType'])assert.ok(source[field],name+' source missing '+field);sources.push({...source,id:name+'-'+source.id});}
 for(const screen of pack.screens){
  const original=originals.find(x=>x.id===screen.id);assert.ok(original,'Unknown screen '+screen.id);
  for(const field of ['composition','primaryDecision','spatialHierarchy','pcInteraction','artTreatment','removeWebsitePatterns','emptyErrorState','acceptance'])assert.ok(screen[field],screen.id+' missing '+field);
  assert.ok(screen.spatialHierarchy.length>=3 && screen.spatialHierarchy.length<=5);
  const refs=screen.referenceIds.map(id=>name+'-'+id);refs.forEach(id=>assert.ok(sources.some(x=>x.id===id),'Missing source '+id));
  const zones=layouts.find(x=>x.id===screen.id)?.zones;assert.ok(zones&&zones.length===screen.spatialHierarchy.length,screen.id+' authored map required');
  zones.forEach((z,i)=>{assert.ok(z.label&&[z.x,z.y,z.w,z.h].every(Number.isFinite)&&z.x>=0&&z.y>=0&&z.w>0&&z.h>0&&z.x+z.w<=100&&z.y+z.h<=100,screen.id+' bounds');zones.slice(i+1).forEach(b=>assert.ok(z.x+z.w<=b.x||b.x+b.w<=z.x||z.y+z.h<=b.y||b.y+b.h<=z.y,screen.id+' non-overlapping zones'));});
  screens.push({...screen,zones,referenceIds:refs,originalTitle:original.title,group:original.group,routes:original.routes||[]});
 }
}
assert.deepEqual(screens.map(x=>x.id).sort(),originals.map(x=>x.id).sort(),'All 80 original screens and overlays covered exactly once');
screens.sort((a,b)=>originals.findIndex(x=>x.id===a.id)-originals.findIndex(x=>x.id===b.id));
fs.writeFileSync(root+'/screens.json',JSON.stringify({status:'PC design proposals, not production functionality',sources,screens},null,2)+'\n');
console.log(screens.length+' individual PC briefs; '+sources.length+' evidence records.');
