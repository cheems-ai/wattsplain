#!/usr/bin/env node
// Renders public/og.png, the 1200×630 share card every page points og:image at. Run it after a
// change to the card below and commit the PNG. The card carries no prices, so the monthly data
// job never needs to redraw it. Needs Playwright's Chromium (`npx playwright install chromium`).
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { OG_IMAGE } from '../src/config/site.ts';

const bolt = '<path d="M18 4 8 18h7l-2 10 11-15h-7z" fill="#fff"/>';
// Abstract bars in the corner, not real data.
const bars = [38, 52, 46, 64, 58, 76, 70, 88]
  .map((h, i) => `<rect x="${i * 34}" y="${100 - h}" width="22" height="${h}" rx="4"/>`)
  .join('');
const html = `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: ${OG_IMAGE.width}px; height: ${OG_IMAGE.height}px; background: #f7f7f4; color: #1c1f23;
    font-family: 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif; padding: 72px 80px;
    display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .brand { display: flex; align-items: center; gap: 20px; font-size: 44px; font-weight: 700; }
  .brand svg { width: 72px; height: 72px; }
  h1 { margin-top: 64px; font-size: 76px; line-height: 1.08; letter-spacing: -1px; max-width: 900px; }
  p { margin-top: 28px; font-size: 32px; color: #5b6370; max-width: 820px; line-height: 1.35; }
  .foot { margin-top: auto; font-size: 28px; font-weight: 600; color: #0b6e4f; }
  .bars { position: absolute; right: 80px; bottom: 72px; width: 260px; height: 100px; fill: #0b6e4f; opacity: .18; }
  .rule { position: absolute; left: 0; top: 0; width: 100%; height: 12px; background: #0b6e4f; }
</style>
<div class="rule"></div>
<div class="brand"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b6e4f"/>${bolt}</svg>Wattsplain</div>
<h1>What electricity really costs in your state</h1>
<p>Monthly EIA prices for all 50 states and DC, a bill checker and home energy cost calculators.</p>
<div class="foot">wattsplain.com</div>
<svg class="bars" viewBox="0 0 260 100">${bars}</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: OG_IMAGE.width, height: OG_IMAGE.height },
});
await page.setContent(html);
await page.screenshot({ path: fileURLToPath(new URL('../public/og.png', import.meta.url)) });
await browser.close();
console.log(`og-image: wrote public/og.png (${OG_IMAGE.width}×${OG_IMAGE.height})`);
