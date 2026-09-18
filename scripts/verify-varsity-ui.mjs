/** Production UI visual checks against an isolated read-only fictional league. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screens = path.join(repo, 'docs/art-direction/2026-09-18/screens');
await fs.mkdir(screens, { recursive: true });
process.env.PAWA_PREVIEW_PORT = '0';
const { server } = await import('./preview-varsity.mjs');
if (!server.listening) await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const [name, route] of [['hub', '/league/varsity-demo'], ['roster', '/league/varsity-demo/roster'], ['team', '/league/varsity-demo/team/home'], ['schedule', '/league/varsity-demo/schedule'], ['report', '/league/varsity-demo/report-game/game-demo'], ['recruiting', '/league/varsity-demo/recruiting'], ['dashboard', '/dashboard']]) {
      await page.goto(origin + route);
      await page.waitForTimeout(500);
      await page.evaluate(() => document.fonts.ready);
      check(!await page.getByText('Something Went Wrong', { exact: true }).count(), `${name} ${width}: no error boundary`);
      check(!await page.getByText('Try Again', { exact: true }).count(), `${name} ${width}: primary data loaded`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${width}: no page overflow`);
      check(await page.evaluate(() => [...document.images].filter(i => i.getBoundingClientRect().height > 0).every(i => i.complete && i.naturalWidth > 0)), `${name} ${width}: visible images loaded`);
      check(await page.evaluate(() => document.fonts.check('600 16px Sora') && document.fonts.check('400 14px Inter')), `${name} ${width}: local fonts loaded`);
      if (name === 'hub') {
        check(await page.getByTestId('matchday-brief').isVisible(), 'Brief visible');
        const details = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Explore your program' }) });
        check(!await details.evaluate(e => e.open), 'Secondary navigation collapsed');
        await details.locator('summary').focus(); await page.keyboard.press('Enter');
        check(await details.evaluate(e => e.open), 'Navigation opens by keyboard');
        await page.keyboard.press('Enter');
        check(await page.getByTestId('button-mute-toggle').getAttribute('aria-pressed') === 'false', 'New user sound is opt-in');
        check(await page.getByTestId('button-primary-phase-cta').getAttribute('disabled') === null, 'Next action available');
      }
      if (name === 'roster') {
        check(await page.getByTestId('roster-manifest').count() === 1, 'Roster uses one comparison surface');
        check(await page.getByTestId('roster-manifest').locator('thead').count() === 1, 'Roster has one column header');
        await page.getByTestId(width === 390 ? 'card-player-mobile-p0' : 'link-player-p0').click();
        const dialog = page.getByRole('dialog');
        check(await dialog.isVisible(), 'Player profile opens');
        check(await dialog.locator('[data-art-style="cel"]').count() > 0, 'Profile uses cel identity');
        await expect.poll(async () => { const b = await dialog.boundingBox(); return b && b.y >= -1 && b.y + b.height <= 951; }).toBe(true);
        const box = await dialog.boundingBox(); check(box && box.x >= -1 && box.x + box.width <= width + 1, 'Profile fits viewport');
        check(await dialog.evaluate(e => getComputedStyle(e).animationName === 'none'), 'Profile respects reduced motion');
        if (width === 390) check(await dialog.evaluate(e => e.contains(document.elementFromPoint(innerWidth / 2, innerHeight - 20))), 'Mobile navigation does not cover the profile');
        await page.screenshot({ path: path.join(screens, 'profile-' + width + '.png') });
        await page.keyboard.press('Escape'); await page.evaluate(() => scrollTo(0, 0));
      }
      if (name === 'recruiting' && width >= 768) {
        const grid = page.getByTestId('recruiting-command-grid');
        check(await grid.evaluate(e=>e.scrollWidth<=e.clientWidth), 'Recruiting summaries reflow without horizontal scrolling');
      }
      check(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollbarWidth==='none'), 'Browser scrollbar chrome hidden');
      check(await page.getByTestId('mobile-nav').count()===0, 'Footer navigation removed');
      if (name === 'report') {
        await page.getByRole('radio', { name: 'Score only (commissioner)', exact: true }).click();
        check(await page.getByText(/Innings, hits, errors and player stats remain unknown/).count() > 0, 'Score-only preserves unknown statistics');
      }
      await page.screenshot({ path: path.join(screens, `${name}-${width}.png`), fullPage: name !== 'roster' });
    }
    check(errors.length === 0, `No runtime errors at ${width}: ${errors.join('; ')}`);
    await context.close();
  }
  const responsive = await browser.newPage();
  responsive.setDefaultTimeout(8000);
  for (const width of [768, 1024, 1280]) {
    await responsive.setViewportSize({ width, height: 900 });
    await responsive.goto(origin + '/league/varsity-demo');
    await responsive.getByTestId('matchday-brief').waitFor();
    check(await responsive.getByTestId('game-menu-trigger').isVisible(), 'Top game navigation available at ' + width);
    check(await responsive.getByTestId('mobile-nav').count() === 0, 'No footer menu at ' + width);
    await responsive.getByTestId('game-menu-trigger').click();
    const menu = responsive.getByTestId('game-menu');
    for (const destination of ['Coach profile','Settings','League ticker','Standings','News','Commissioner']) check(await menu.getByRole('link', {name:destination,exact:true}).count() === 1, destination + ' preserved at ' + width);
    await responsive.keyboard.press('Escape');
    await expect.poll(() => responsive.getByTestId('game-menu-trigger').evaluate(e=>e===document.activeElement)).toBe(true);
    check(await responsive.getByTestId('game-menu-trigger').evaluate(e=>e===document.activeElement), 'Escape restores menu trigger focus at '+width);
    check(await responsive.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No overflow at ' + width);
  }
  await responsive.route('**/api/leagues/varsity-demo', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.currentPhase = 'offseason'; data.teams.forEach(t => { t.coach = null; });
    await route.fulfill({ json: data });
  });
  await responsive.goto(origin + '/league/varsity-demo');
  await responsive.getByTestId('matchday-brief').waitFor();
  check(await responsive.getByTestId('matchday-brief').getByRole('button', { name: 'League operations' }).isVisible(), 'Offseason commissioner without team has action');
  await responsive.close();
  const edgeCases = await browser.newPage();
  await edgeCases.route('**/api/leagues/varsity-demo/roster*', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.players[0].firstName = 'Alexanderthegreat'; data.players[0].lastName = 'Montgomery-Washington';
    await route.fulfill({ json: data });
  });
  for (const width of [640, 768, 900]) {
    await edgeCases.setViewportSize({ width, height: 800 });
    await edgeCases.goto(origin + '/league/varsity-demo/roster');
    await edgeCases.getByTestId('link-player-p0').waitFor();
    check(await edgeCases.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long roster names fit page at ' + width);
    const manifest = edgeCases.getByTestId('roster-manifest');
    const scroll = manifest.getByRole('region', {name:'Scrollable table columns'});
    if (await scroll.count()) {
      await manifest.getByRole('button', {name:'Next table columns'}).click();
      check(await scroll.evaluate(e => e.scrollLeft > 0), 'Roster overflow has working column controls at ' + width);
    }
  }
  for (const coCommissioner of [false, true]) {
    await edgeCases.route('**/api/leagues/varsity-demo', async route => {
      const response = await route.fetch(); const data = await response.json();
      data.commissionerId = 'other'; data.coCommissionerIds = coCommissioner ? ['demo'] : [];
      await route.fulfill({json:data});
    });
    await edgeCases.goto(origin + '/league/varsity-demo');
    await edgeCases.getByTestId('matchday-brief').waitFor();
    await edgeCases.getByTestId('game-menu-trigger').click();
    const menu = edgeCases.getByTestId('game-menu');
    check(await menu.getByRole('link', {name:'Commissioner', exact:true}).count() === (coCommissioner ? 1 : 0), 'Menu respects commissioner role ' + coCommissioner);
    await edgeCases.keyboard.press('Escape');
    await edgeCases.unroute('**/api/leagues/varsity-demo');
  }
  await edgeCases.goto(origin + '/league/varsity-demo/coach?tab=settings');
  await edgeCases.getByTestId('game-menu-trigger').click();
  const settingsMenu = edgeCases.getByTestId('game-menu');
  check(await settingsMenu.getByRole('link', {name:'Settings',exact:true}).getAttribute('aria-current') === 'page', 'Settings is current destination');
  check(await settingsMenu.getByRole('link', {name:'Coach profile',exact:true}).getAttribute('aria-current') === null, 'Coach profile is not also current');
  await edgeCases.close();
  const rejected = await fetch(origin + '/api/leagues/varsity-demo/ready', { method: 'POST' });
  check(rejected.status === 405, 'Visual fixture cannot write league data');

  // Render the real shared portraits and verify that uniform changes preserve faces.
  const out = path.join(repo, '.local-db/varsity-portraits.cjs');
  await build({ stdin: { contents: `
    import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
    import { PlayerAvatar } from './client/src/components/player-avatar';
    import { PlayerPortrait } from './client/src/components/ui/player-portrait';
    export function portrait(props) { return renderToStaticMarkup(<PlayerPortrait {...props}/>); }
    export function gallery() { return renderToStaticMarkup(<main style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:16,padding:24}}>{Array.from({length:24},(_,i)=>{const hair=['short','medium','long','fade','buzzcut','bald','curly','mullet'][i%8];const props={playerId:'identity-'+i,skinTone:['light','medium','tan','olive','dark','deep'][i%6],hairStyle:hair,hairColor:['black','brown','blonde','red','gray','white'][i%6],facialHair:['none','stubble','goatee','beard','mustache'][i%5],headwear:i>15?'cap':'none',jerseyColor:'#254c3b'};return <article key={i} style={{background:'#16372e',padding:12,borderRadius:12}}><div style={{width:160,height:160}}><PlayerPortrait {...props}/></div><div style={{display:'flex',alignItems:'end',gap:12,marginTop:10}}><PlayerAvatar {...props} size="sm"/><PlayerAvatar {...props} size="md"/></div><p>{i+1} · {hair}</p></article>})}</main>); }
  `, resolveDir: repo, loader: 'tsx' }, outfile: out, bundle: true, packages: 'external', platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent' });
  const { portrait, gallery } = createRequire(import.meta.url)(out);
  const props = { playerId: 'persistent-player', hairStyle: 'curly', skinTone: 'deep', eyeBlack: false };
  const first = portrait({ ...props, jerseyColor: '#254c3b' });
  const transfer = portrait({ ...props, jerseyColor: '#314964' });
  check(first.replaceAll('#254c3b', 'KIT') === transfer.replaceAll('#314964', 'KIT'), 'Transfer changes kit only');
  check(first === portrait({ ...props, jerseyColor: '#254c3b' }), 'Identity stable on replay');
  check(!first.includes(' id='), 'Portrait has no duplicate SVG IDs');
  check(new Set(['short', 'medium', 'long', 'fade', 'buzzcut', 'bald', 'curly', 'mullet'].map(hairStyle => portrait({ ...props, hairStyle }))).size === 8, 'Eight distinct hair silhouettes');
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto(origin + '/dashboard');
  await page.evaluate(html => { document.body.innerHTML = '<h1 style="padding:24px">Cel identity kit · 24 fictional players · three sizes</h1>' + html; }, gallery());
  await page.screenshot({ path: path.join(screens, 'cel-contact-sheet.png'), fullPage: true });
  console.log(`Varsity UI: ${checks} checks passed across 14 production page/viewport combinations and portrait identity checks.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
