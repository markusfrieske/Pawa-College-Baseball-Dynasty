import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
let checks=0;
try{
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:49746/pc-sports/players.html');
  for(const name of ['Eli Price','Andre Walker','Kenji Sato','Jalen Brooks']){
   await page.getByRole('button',{name:new RegExp(name)}).click();
   await expect(page.locator('#name')).toHaveText(name);
   await expect(page.locator('#portrait')).toHaveAttribute('aria-label',name+' — revised cel portrait');
   await expect(page.locator('#mini-name')).toHaveText(name);checks++;
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal fit');checks++;
 }
 const response=await page.request.get('http://127.0.0.1:49746/pc-sports/assets/cel-roster-v2.png');assert.equal(response.status(),200);checks++;
 await page.getByRole('button',{name:/Eli Price/}).focus();await page.keyboard.press('Tab');await page.keyboard.press('Enter');await expect(page.locator('#name')).toHaveText('Andre Walker');checks++;
 assert.deepEqual(errors,[]);checks++;
 console.log(`${checks} player art checks passed: four identities, five PC widths, keyboard selection, asset and runtime.`);
}finally{await browser.close()}
