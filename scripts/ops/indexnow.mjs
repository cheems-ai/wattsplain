#!/usr/bin/env node
// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver…) which wattsplain.com pages changed,
// so they are recrawled without waiting. Run after a deploy: it hashes every page of dist/ listed
// in dist/sitemap.xml, sends the URLs whose hash differs from scripts/ops/indexnow-state.json, and
// on success updates that file (commit it). DRY_RUN=1 prints the request instead of sending it.
// Never fails a release: a submission problem is reported and the exit code stays 0.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import {
  INDEXNOW_KEY,
  changedUrls,
  contentHash,
  indexNowBody,
  sitemapUrls,
} from '../lib/indexnow.mjs';

const HOST = 'wattsplain.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const STATE = new URL('./indexnow-state.json', import.meta.url);
const dist = new URL('../../dist/', import.meta.url);

try {
  const urls = sitemapUrls(readFileSync(new URL('sitemap.xml', dist), 'utf8'));
  if (urls.length === 0) throw new Error('dist/sitemap.xml lists no URLs');
  const after = Object.fromEntries(
    urls.map((u) => {
      const path = new URL(u).pathname.replace(/^\//, '');
      return [u, contentHash(readFileSync(new URL(`${path}index.html`, dist)))];
    }),
  );
  const before = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
  const changed = changedUrls(before, after);
  if (changed.length === 0) {
    console.log('indexnow: no page changed; nothing sent');
  } else {
    const body = indexNowBody(changed, { host: HOST, key: INDEXNOW_KEY });
    if (process.env['DRY_RUN'] === '1') {
      console.log(`DRY_RUN: POST ${ENDPOINT} (${changed.length} URLs)`);
      for (const u of changed) console.log(`  ${u}`);
    } else {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      // 200 and 202 both mean accepted; 202 while the key is still being validated.
      console.log(`indexnow: sent ${changed.length} URL(s), HTTP ${res.status}`);
      if (res.status === 200 || res.status === 202) {
        writeFileSync(STATE, `${JSON.stringify(after, null, 2)}\n`);
      } else {
        console.log(`indexnow: not recorded; response: ${(await res.text()).slice(0, 200)}`);
      }
    }
  }
} catch (e) {
  console.log(`indexnow: not sent (${e instanceof Error ? e.message : e})`);
}
