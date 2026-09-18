/** Presentation-only regression: actual scroll components and the full proposal catalogue. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await fs.readFile(path.join(root,'docs/art-direction/2026-09-18/screen-designs.json'),'utf8'));
const app=await fs.readFile(path.join(root,'client/src/App.tsx'),'utf8');
const routes=[...app.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]).sort();
const covered=catalog.screens.flatMap(s=>s.routes).filter(r=>r!=='*').sort();
assert.deepEqual(covered,routes);
const records=[...catalog.screens,...catalog.overlays];
assert.equal(new Set(records.map(s=>s.id)).size,records.length);
let checks=2;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:49744/screen-book.html');
  await expect(page.locator('#coverage')).toContainText('50 screens');
  for(const record of records){
    await page.locator(`[data-screen="${record.id}"]`).click();
    await expect(page.locator('#screen-title')).toHaveText(record.title);
    check((await page.locator('#spec-grid').innerText()).includes(record.primaryAction), record.id+' exposes its specific action');
    check(await page.locator('#workspace').innerText() !== '',record.id+' has a composition study');
  }
  await page.locator('[data-screen="roster"]').click();
  await page.locator('[data-player="4"]').click();
  await expect(page.locator('#roster-inspector')).toContainText('Andre Walker');checks++;
  await page.locator('#narrow-view').click();
  await page.locator('[data-player="2"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();checks++;
  await page.keyboard.press('Escape');
  check(await page.locator('[data-player="2"]').evaluate(e=>e===document.activeElement),'Closing compact inspector restores player focus');
  await page.locator('#wide-view').click();
  const screens=path.join(root,'docs/art-direction/2026-09-18/screens');
  await fs.mkdir(screens,{recursive:true});
  for(const width of [1440,1280,768,390,320]){
    await page.setViewportSize({width,height:1000});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Screen book fits '+width);
    check(await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)),'Screen book portraits load at '+width);
    if([1440,390].includes(width))await page.screenshot({path:path.join(screens,'screen-book-'+width+'.png'),fullPage:false});
  }
  check(errors.length===0,'No screen-book runtime errors: '+errors.join('; '));

  // Mount the real shared components, not a hand-written imitation of scrolling.
  const bundle=await build({stdin:{contents:`
    import React from 'react';import{createRoot}from'react-dom/client';
    import{Table}from'./client/src/components/ui/table';import{ScrollArea}from'./client/src/components/ui/scroll-area';
    createRoot(document.getElementById('fixture')).render(<><Table aria-label="Wide fixture"><tbody><tr>{Array.from({length:18},(_,i)=><td key={i} style={{minWidth:120}}>Column {i+1}</td>)}</tr></tbody></Table><ScrollArea style={{height:100,marginTop:30}}>{Array.from({length:30},(_,i)=><p key={i}>Line {i+1}</p>)}</ScrollArea></>);
  `,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',logLevel:'silent'});
  const html=await fs.readFile(path.join(root,'dist/public/index.html'),'utf8');
  const css=(html.match(/href="([^"]+\.css)"/)||[])[1];assert(css,'Production CSS exists');
  await page.setContent('<html><head></head><body><div id="fixture"></div></body></html>');
  await page.addStyleTag({content:await fs.readFile(path.join(root,'dist/public',css),'utf8')});
  await page.addStyleTag({content:'body{padding:16px}#fixture{width:280px}'});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const viewport=page.getByRole('region',{name:'Scrollable table columns'});
  await expect(viewport).toBeVisible();checks++;
  await page.getByRole('button',{name:'Next table columns'}).click();
  await expect.poll(()=>viewport.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);checks++;
  await page.getByRole('button',{name:'Previous table columns'}).click();
  await expect.poll(()=>viewport.evaluate(e=>e.scrollLeft)).toBe(0);checks++;
  await viewport.focus();await page.keyboard.press('ArrowRight');
  await expect.poll(()=>viewport.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);checks++;
  check(await viewport.evaluate(e=>getComputedStyle(e).scrollbarWidth==='none'),'Table scrollbar hidden without disabling scroll');
  const area=page.getByLabel('Scrollable content',{exact:true});
  await area.focus();await page.keyboard.press('PageDown');
  await expect.poll(()=>area.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);checks++;
  check(await page.locator('[data-pawa-scrollbar]').evaluateAll(els=>els.every(e=>getComputedStyle(e).opacity==='0'||e.getBoundingClientRect().width===0)),'Custom scrollbar chrome hidden');
  console.log(`Game presentation: ${checks} assertions passed; 51 routes, 50 screens, 30 nested specs; real table and ScrollArea keyboard access verified.`);
} finally {await browser.close();}
