/** Raster exports of the approved code-native SVG. Run on a machine with Georgia installed. */
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await fs.readFile('client/public/brand/gateway.svg', 'utf8');
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [64, 180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#10291f}body{display:grid;place-items:center}svg{width:72%;height:72%}</style>${svg}`);
    await page.screenshot({ path: `client/public/brand/icon-${size}.png` });
  }
} finally {
  await browser.close();
}
