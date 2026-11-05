#!/usr/bin/env node
// Search Console snapshot for sc-domain:wattsplain.com: every Search Analytics cut the SEO review
// needs, saved as CSV files so later weeks can be compared row by row with the same dimensions.
// Read-only (webmasters.readonly scope).
//
//   GSC_KEY_FILE=D:/秘密/faveden-gsc.json npm run gsc:snapshot -- --out <dir> [--start 2026-10-28] [--end 2026-11-03] [--state all|final]
//
// Cuts written to <dir>:
//   totals.csv            no dimension (property aggregation: one impression per search result page)
//   date.csv              by day (property aggregation)
//   page.csv, page-date.csv            by URL (page aggregation: every shown URL counts)
//   query.csv, country.csv, device.csv
//   query-page.csv                     query x URL
//   query-page-country-device.csv      query x URL x country x device
//   page-country-device.csv            URL x country x device (includes anonymized queries)
// Google drops anonymized (rare) queries from any cut that has the query dimension, so sums over
// query cuts are lower than totals.csv; see docs/seo/baseline-*.md in the project folder.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { serviceAccountJwt } from '../lib/gsc.mjs';

const PROPERTY = 'sc-domain:wattsplain.com';
const API = 'https://www.googleapis.com/webmasters/v3';
const day = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    start: { type: 'string', default: day(29) },
    end: { type: 'string', default: day(1) },
    state: { type: 'string', default: 'all' },
  },
});
const keyFile = process.env['GSC_KEY_FILE'];
if (!keyFile || !values.out) {
  console.error(
    'Usage: GSC_KEY_FILE=<key.json> npm run gsc:snapshot -- --out <dir> [--start] [--end]',
  );
  process.exit(2);
}

async function request(url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const key = JSON.parse(readFileSync(keyFile, 'utf8'));
const token = await request(key.token_uri, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: serviceAccountJwt(key, Math.floor(Date.now() / 1000)),
  }),
}).then((r) => r.json());
if (!token.access_token) throw new Error(`token request failed: ${token.error ?? 'no token'}`);

async function rows(dimensions) {
  const out = [];
  for (let startRow = 0; ; startRow += 25000) {
    const res = await request(
      `${API}/sites/${encodeURIComponent(PROPERTY)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          startDate: values.start,
          endDate: values.end,
          dimensions,
          type: 'web',
          dataState: values.state,
          rowLimit: 25000,
          startRow,
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`${dimensions}: HTTP ${res.status} ${data.error?.message ?? ''}`);
    const page = data.rows ?? [];
    out.push(...page);
    if (page.length < 25000) return out;
  }
}

const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
function csv(dimensions, list) {
  const head = [...dimensions, 'clicks', 'impressions', 'ctr', 'position'];
  const body = list.map((r) =>
    [...(r.keys ?? []), r.clicks, r.impressions, r.ctr.toFixed(4), r.position.toFixed(2)]
      .map(cell)
      .join(','),
  );
  return `${[head.join(','), ...body].join('\n')}\n`;
}

const cuts = {
  totals: [],
  date: ['date'],
  page: ['page'],
  'page-date': ['page', 'date'],
  query: ['query'],
  country: ['country'],
  device: ['device'],
  'query-page': ['query', 'page'],
  'query-page-country-device': ['query', 'page', 'country', 'device'],
  'page-country-device': ['page', 'country', 'device'],
};
mkdirSync(values.out, { recursive: true });
const summary = [];
for (const [name, dimensions] of Object.entries(cuts)) {
  const list = await rows(dimensions);
  writeFileSync(join(values.out, `${name}.csv`), csv(dimensions, list));
  const impressions = list.reduce((s, r) => s + r.impressions, 0);
  const clicks = list.reduce((s, r) => s + r.clicks, 0);
  summary.push({ cut: name, rows: list.length, clicks, impressions });
}
writeFileSync(
  join(values.out, 'meta.json'),
  `${JSON.stringify({ property: PROPERTY, start: values.start, end: values.end, dataState: values.state, type: 'web', fetched: new Date().toISOString(), summary }, null, 2)}\n`,
);
console.table(summary);
