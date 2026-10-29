#!/usr/bin/env node
// Search Console report for sc-domain:wattsplain.com: sitemap status, clicks and impressions, top
// queries and pages, query opportunities and, with --inspect, the index status of every sitemap
// URL. Read-only: it asks Google only for the webmasters.readonly scope.
//
//   GSC_KEY_FILE=D:/秘密/faveden-gsc.json npm run gsc -- [--days 28] [--inspect] [--out f.md] [--json f.json]
//
// The key file stays outside the repository and its private key is never printed. The window ends
// yesterday and includes Google's not-yet-final "fresh" data, so a new site sees its first
// impressions early; the last two days can still change.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { analyticsTotals, coverageCounts, opportunities, serviceAccountJwt } from '../lib/gsc.mjs';
import { sitemapUrls } from '../lib/indexnow.mjs';

const ORIGIN = 'https://wattsplain.com';
const PROPERTY = 'sc-domain:wattsplain.com';
const API = 'https://www.googleapis.com/webmasters/v3';
const { values } = parseArgs({
  options: {
    days: { type: 'string', default: '28' },
    inspect: { type: 'boolean', default: false },
    out: { type: 'string' },
    json: { type: 'string' },
  },
});

const keyFile = process.env['GSC_KEY_FILE'];
if (!keyFile) {
  console.error('Set GSC_KEY_FILE to the service account JSON key (kept outside the repository).');
  process.exit(2);
}

// The local network to Google sometimes drops connections; retry those, never HTTP errors.
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
const auth = { authorization: `Bearer ${token.access_token}` };

async function api(url, body) {
  const res = await request(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { ...auth, 'content-type': 'application/json' } : auth,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${data.error?.message ?? ''}`);
  return data;
}

const site = encodeURIComponent(PROPERTY);
const day = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
const endDate = day(1);
const startDate = day(Number(values.days));
const query = (dimensions, rowLimit) =>
  api(`${API}/sites/${site}/searchAnalytics/query`, {
    startDate,
    endDate,
    dimensions,
    rowLimit,
    dataState: 'all',
  }).then((d) => d.rows ?? []);

const lines = [`# Search Console report ${day(0)}, ${PROPERTY}`, ''];

// 1. Sitemaps.
const { sitemap = [] } = await api(`${API}/sites/${site}/sitemaps`);
lines.push(
  '## Sitemaps',
  '',
  '| Path | Last submitted | Last read by Google | Errors | Warnings | Submitted | Indexed* |',
  '|---|---|---|---|---|---|---|',
);
for (const s of sitemap) {
  const web = (s.contents ?? []).find((c) => c.type === 'web') ?? {};
  lines.push(
    `| ${s.path} | ${s.lastSubmitted?.slice(0, 10) ?? '-'} | ${s.lastDownloaded?.slice(0, 10) ?? '-'} | ${s.errors} | ${s.warnings} | ${web.submitted ?? '-'} | ${web.indexed ?? '-'} |`,
  );
}
lines.push(
  '',
  '\\* The sitemap "indexed" count lags; the URL Inspection section is the current state.',
  '',
);

// 2. Search performance.
const byQuery = await query(['query'], 250);
const byPage = await query(['page'], 250);
const totals = analyticsTotals(byPage);
lines.push(`## Search performance ${startDate} to ${endDate}`, '');
lines.push(
  `Clicks **${totals.clicks}**, impressions **${totals.impressions}**, CTR ${(totals.ctr * 100).toFixed(1)}%, average position ${totals.position === null ? '-' : totals.position.toFixed(1)}.`,
  '',
);
const table = (rows, label) => {
  if (rows.length === 0) return [`No ${label.toLowerCase()} with impressions yet.`, ''];
  return [
    `| ${label.slice(0, -1)} | Clicks | Impressions | CTR | Position |`,
    '|---|---|---|---|---|',
    ...rows
      .slice(0, 25)
      .map(
        (r) =>
          `| ${r.keys[0].replace(ORIGIN, '')} | ${r.clicks} | ${r.impressions} | ${(r.ctr * 100).toFixed(1)}% | ${r.position.toFixed(1)} |`,
      ),
    '',
  ];
};
lines.push('### Top queries', '', ...table(byQuery, 'Queries'));
lines.push('### Top pages', '', ...table(byPage, 'Pages'));
const opp = opportunities(byQuery);
lines.push('### Opportunities (10+ impressions)', '');
lines.push(
  ...(opp.length
    ? opp.map(
        (o) =>
          `- "${o.query}": ${o.reasons.join(', ')} (position ${o.position.toFixed(1)}, ${o.impressions} impressions)`,
      )
    : ['None yet.']),
  '',
);

// 3. Index status of every sitemap URL (URL Inspection API; a few seconds per URL).
let inspected = [];
if (values.inspect) {
  const xml = await request(`${ORIGIN}/sitemap.xml`).then((r) => r.text());
  for (const url of sitemapUrls(xml)) {
    const data = await api('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      inspectionUrl: url,
      siteUrl: PROPERTY,
    });
    inspected.push({ url, ...data.inspectionResult?.indexStatusResult });
  }
  lines.push('## Index status (URL Inspection)', '');
  for (const [state, n] of coverageCounts(inspected)) lines.push(`- ${state}: **${n}**`);
  lines.push('', '| URL | Coverage | Last crawl | Google canonical |', '|---|---|---|---|');
  for (const r of inspected)
    lines.push(
      `| ${r.url.replace(ORIGIN, '')} | ${r.coverageState ?? '-'} | ${r.lastCrawlTime?.slice(0, 10) ?? '-'} | ${r.googleCanonical === r.url ? 'same' : (r.googleCanonical ?? '-')} |`,
    );
  lines.push('');
}

const report = lines.join('\n');
if (values.out) writeFileSync(values.out, report);
if (values.json)
  writeFileSync(
    values.json,
    `${JSON.stringify({ date: day(0), startDate, endDate, sitemap, totals, byQuery, byPage, inspected }, null, 2)}\n`,
  );
console.log(report);
