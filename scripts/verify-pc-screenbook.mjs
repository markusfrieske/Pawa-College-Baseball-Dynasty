/** Review-artifact checks only: not production gameplay or controller certification. */
import { chromium, expect } from '@playwright/test';import fs from 'node:fs';import assert from 'node:assert/strict';
const base='http://127.0.0.1:49746/pc-sports/index.html';
const data=JSON.parse(fs.readFileSync('docs/art-direction/pc-sports/screens.json','utf8'));
const studies=['dashboard','digests','archive','recruit-profile','hub','roster','recruiting','roster-depth','schedule','prep','report','score-review','box-score','postseason','storylines','commits','program','inbox','player-profile','coach','stats','commissioner','title'];
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});let checks=0;const errors=[];
const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
function check(condition,msg){assert.ok(condition,msg);checks++;}
try{
 for(const s of data.screens){
  await page.goto(base+'#'+s.id);await expect(page.locator('#scene-status')).toContainText(s.originalTitle);checks++;
  check(await page.locator('#stage h1').count()===1,s.id+' one focused title');
  await page.getByRole('button',{name:'Design notes F1',exact:true}).click();
  await expect(page.locator('#spec-content')).toContainText(s.primaryDecision);checks++;
  check(await page.locator('#spec-content a').count()===s.referenceIds.length,s.id+' all source references');
  await page.keyboard.press('Escape');await expect(page.locator('#spec-dialog')).not.toBeVisible();checks++;
 }
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]){
  await page.setViewportSize({width,height});
  for(const id of studies){
   await page.goto(base+'#'+id);await expect(page.locator('#scene-status')).toContainText('COMPOSITION STUDY');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight),id+' no outer page scroll '+width);
   check(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),id+' images load');
   check(await page.locator('#stage').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.children].every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.bottom<=r.bottom+1;});}),id+' composition within stage');
  }
 }
 await page.setViewportSize({width:1280,height:720});await page.goto(base+'#roster');
 await page.getByRole('button',{name:'Andre Walker',exact:true}).click();await expect(page.locator('.scout-panel h2')).toHaveText('Andre Walker');checks++;
 await page.keyboard.press('F2');await page.locator('#screen-search').fill('schedule');check((await page.locator('#screen-list button').count())===2,'Atlas search is scoped');
 await page.locator('[data-index-go="schedule"]').click();await expect(page.locator('#scene-status')).toContainText('Season schedule');checks++;
 await page.getByRole('button',{name:/Bay State/}).click();await expect(page.locator('#notice')).toContainText('Bay State');checks++;
 check((await page.url()).endsWith('#schedule'),'Unsupported fixture does not silently open wrong prep');
 await page.goto(base+'#box-score');await expect(page.getByRole('table')).toContainText('RBI');checks++;check(!(await page.getByRole('table').innerText()).includes('OVR'),'Box score uses game stats');
 await page.goto(base+'#stats');await expect(page.getByRole('table').locator('tbody tr').first()).toContainText('Kenji Sato');checks++;
 await page.goto(base+'#hub');await page.keyboard.press('PageDown');await expect(page.locator('#scene-status')).toContainText('Roster command');checks++;
 check(errors.length===0,'No page runtime errors: '+errors.join(';'));
 console.log('PC atlas: '+checks+' checks passed;80briefs,23compositionstudies,57authoredschematics; five PC viewports. No production/UI-scale/controller/enjoyment claim.');
}finally{await browser.close();}
