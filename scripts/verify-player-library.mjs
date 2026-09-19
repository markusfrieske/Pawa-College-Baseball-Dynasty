import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import crypto from 'node:crypto';
import {recolorFabric,normalizeTeamColor} from '../client/public/art/players/v1/runtime.mjs';
const root='client/public/art/players/v1/',manifest=JSON.parse(fs.readFileSync(root+'manifest.json','utf8'));
assert.equal(manifest.faces.length,30);assert.equal(new Set(manifest.faces.map(f=>f.id)).size,30);
assert.equal(new Set(manifest.faces.map(f=>crypto.createHash('sha256').update(fs.readFileSync(root+f.id+'.png')).digest('hex'))).size,30);
assert.equal(normalizeTeamColor('#abc'),'#aabbcc');assert.equal(normalizeTeamColor('bad'),'#24523d');
const natural=new Uint8ClampedArray([200,130,90,255,40,110,70,255,30,60,110,255,230,225,220,128]);
assert.deepEqual(recolorFabric(natural.slice(),'#ee1111'),natural);
assert.deepEqual([...recolorFabric(new Uint8ClampedArray([255,0,255,255]),'#123456')],[18,52,86,255]);
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:49748/pc-sports/faces.html');await expect(page.locator('#status')).toContainText('30 portraits ready');
 const results=await page.evaluate(async()=>{
  const {renderPortrait,isFabricKey}=await import('/art/players/v1/runtime.mjs');const {faces}=await (await fetch('/art/players/v1/manifest.json')).json();let checked=0;
  for(const face of faces){const img=new Image();img.src='/art/players/v1/'+face.id+'.png';await img.decode();if(img.naturalWidth!==img.naturalHeight)throw Error(face.id+' nonsquare');
   const raw=document.createElement('canvas');raw.width=raw.height=128;const ctx=raw.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,128,128);const before=ctx.getImageData(0,0,128,128).data;
   for(const color of ['#bd2737','#235ec1','#d8aa29']){const c=document.createElement('canvas');await renderPortrait(c,{id:face.id,teamColor:color,size:128});const after=c.getContext('2d').getImageData(0,0,128,128).data;let changed=0;
    for(let i=0;i<before.length;i+=4){const key=isFabricKey(before[i],before[i+1],before[i+2]);if(!key&&(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2]))throw Error(face.id+' natural pixel changed');if(key&&before[i]!==after[i])changed++;if(before[i+3]!==after[i+3])throw Error('alpha changed');}
    if(changed<200)throw Error(face.id+' missing fabric key');checked++;
   }
  }return checked;
 });assert.equal(results,90);
 await page.getByRole('button',{name:'Royal team color',exact:true}).click();await expect(page.locator('#status')).toContainText('#235EC1');
 await page.getByRole('button',{name:'Inspect c9-face-01',exact:true}).click();await expect(page.locator('#download')).toHaveAttribute('href',/^data:image\/png/);
 await page.keyboard.press('Escape');await expect(page.locator('#detail')).not.toBeVisible();
 for(const width of [1280,1920,3440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log('PASS: 30 unique assets; 90 actual-image recolor/identity invariance cases; preset, modal, export, Escape, 3 PC widths; no runtime errors.');
}finally{await browser.close()}
