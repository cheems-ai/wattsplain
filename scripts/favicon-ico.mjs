#!/usr/bin/env node
// Renders public/favicon.ico (16, 32 and 48 px) from public/favicon.svg. Pages link the SVG, but
// some browsers, feed readers and crawlers still ask for /favicon.ico and logged 404s for it. Run
// it after a change to favicon.svg and commit the .ico. Needs Playwright's Chromium.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const svg = await readFile(
  fileURLToPath(new URL('../public/favicon.svg', import.meta.url)),
  'utf8',
);
const sizes = [16, 32, 48];

const browser = await chromium.launch();
const pngs = [];
for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>*{margin:0}html,body{background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  pngs.push(await page.screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();

// ICO container with PNG-encoded images (supported by every current browser).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + 16 * sizes.length;
sizes.forEach((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0);
  e.writeUInt8(size, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
});
const out = fileURLToPath(new URL('../public/favicon.ico', import.meta.url));
await writeFile(out, Buffer.concat([header, ...entries, ...pngs]));
console.log(`wrote ${out}`);
