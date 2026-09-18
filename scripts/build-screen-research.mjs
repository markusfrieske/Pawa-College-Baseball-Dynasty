/** Assemble the review-only research book; fail on any missing screen or source. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='docs/art-direction/2026-09-18';
const original=JSON.parse(fs.readFileSync(root+'/screen-designs.json','utf8'));
const inventory=[...original.screens,...original.overlays];
const packs=['team-recruiting','competition-operations','setup-stories'].map(name=>({name,...JSON.parse(fs.readFileSync(`${root}/research/${name}.json`,'utf8'))}));
const sources=[],screens=[];
for(const pack of packs){
 for(const source of pack.sources){
  assert.ok(/^https:\/\//.test(source.url));
  for(const field of ['id','title','url','observed','adaptation','avoid','evidenceType'])assert.ok(source[field],`${pack.name}: ${field}`);
  sources.push({...source,id:pack.name+'-'+source.id});
 }
 for(const screen of pack.screens){
  const base=inventory.find(s=>s.id===screen.id);assert.ok(base,`Unknown screen ${screen.id}`);
  assert.ok(!screens.some(s=>s.id===screen.id),`Duplicate screen ${screen.id}`);
  for(const field of ['layoutFamily','composition','primaryDecision','keep','remove','interaction','compact','difference','unapprovedDependencies'])assert.ok(screen[field],`${screen.id}: ${field}`);
  assert.ok(screen.referenceIds.length,`${screen.id}: sources required`);
  const referenceIds=screen.referenceIds.map(id=>pack.name+'-'+id);
  for(const id of referenceIds)assert.ok(sources.some(s=>s.id===id),`Missing source ${id}`);
  screens.push({...screen,title:base.title,group:base.group,referenceIds});
 }
}
assert.deepEqual(screens.map(s=>s.id).sort(),inventory.map(s=>s.id).sort(),'Full original screen inventory coverage');
screens.sort((a,b)=>inventory.findIndex(s=>s.id===a.id)-inventory.findIndex(s=>s.id===b.id));
fs.writeFileSync('docs/art-direction/2026-09-17/research-book-data.json',JSON.stringify({status:'research-proposal',sources,screens},null,2)+'\n');
console.log(`Research book: ${screens.length} distinct screen briefs; ${sources.length} source records.`);
