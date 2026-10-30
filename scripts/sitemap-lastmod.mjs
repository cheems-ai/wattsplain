#!/usr/bin/env node
// Post-build step (part of `npm run build`): adds <lastmod> to dist/sitemap.xml. A page keeps the
// date recorded in scripts/ops/lastmod-state.json while the visible text of its <main> is
// unchanged; a new or changed page gets today's date (UTC).
//
//   node scripts/sitemap-lastmod.mjs          rewrite dist/sitemap.xml only
//   node scripts/sitemap-lastmod.mjs --save   also record the dates (after a deploy; commit it)
//
// Saving only after a deploy keeps a branch build from recording a date for a page that never
// went live.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { sitemapUrls } from './lib/indexnow.mjs';
import { nextLastmods, textHash, withLastmod } from './lib/lastmod.mjs';

const STATE = new URL('./ops/lastmod-state.json', import.meta.url);
const SITEMAP = new URL('../dist/sitemap.xml', import.meta.url);

const xml = readFileSync(SITEMAP, 'utf8');
const hashes = Object.fromEntries(
  sitemapUrls(xml).map((u) => {
    const path = new URL(u).pathname;
    const file = new URL(`../dist${path}index.html`, import.meta.url);
    return [path, textHash(readFileSync(file, 'utf8'))];
  }),
);
const before = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const state = nextLastmods(before, hashes, new Date().toISOString().slice(0, 10));
writeFileSync(SITEMAP, withLastmod(xml, state));
const changed = Object.keys(state).filter((p) => before[p]?.hash !== state[p].hash);
if (process.argv.includes('--save')) {
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`sitemap-lastmod: recorded ${changed.length} changed page(s)`);
} else {
  console.log(
    `sitemap-lastmod: ${Object.keys(state).length} URLs, ${changed.length} changed since the last deploy`,
  );
}
