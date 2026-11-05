#!/usr/bin/env node
// Weekly SEO review: compares two Search Console snapshots (npm run gsc:snapshot) of equal length
// and prints a Markdown section for docs/seo/weekly-review.md. It only reports; it never edits
// pages or titles. Position changes are flagged as readable only with 10+ impressions on both
// sides; smaller samples are listed as "too few to judge".
//
//   npm run seo:weekly -- --before <snapshot dir> --after <snapshot dir> [--out f.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { bands, cohort, compareBy, parseCsv, sum } from '../lib/seo-compare.mjs';

const { values } = parseArgs({
  options: { before: { type: 'string' }, after: { type: 'string' }, out: { type: 'string' } },
});
if (!values.before || !values.after) {
  console.error('Usage: npm run seo:weekly -- --before <dir> --after <dir> [--out f.md]');
  process.exit(2);
}
const load = (dir, cut) => parseCsv(readFileSync(join(dir, `${cut}.csv`), 'utf8'));
const meta = (dir) => JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
const [mb, ma] = [meta(values.before), meta(values.after)];

// Experiments being watched (docs/seo/experiments.md). Cohorts are page paths.
const EXPERIMENTS = [
  { id: 'E1', name: 'Prices by utility on state pages', pages: ['/electricity-rates/*'] },
  { id: 'E2', name: 'Heating cost calculator', pages: ['/tools/heating-cost-calculator/'] },
];

const fmtPos = (p) => (p === null ? '–' : p.toFixed(1));
const line = (label, b, a) =>
  `| ${label} | ${b.impressions} → ${a.impressions} | ${b.clicks} → ${a.clicks} | ${fmtPos(b.position)} → ${fmtPos(a.position)} |`;

const out = [
  `## ${ma.end}: ${mb.start}…${mb.end} vs ${ma.start}…${ma.end}`,
  '',
  '| Cut | Impressions | Clicks | Avg position |',
  '|---|---|---|---|',
  line('Property total', sum(load(values.before, 'totals')), sum(load(values.after, 'totals'))),
];
for (const d of ['DESKTOP', 'MOBILE']) {
  const f = (rows) => rows.filter((r) => r.device === d);
  out.push(
    line(
      d.toLowerCase(),
      sum(f(load(values.before, 'device'))),
      sum(f(load(values.after, 'device'))),
    ),
  );
}
const us = (rows) => rows.filter((r) => r.country === 'usa');
out.push(
  line(
    'United States',
    sum(us(load(values.before, 'country'))),
    sum(us(load(values.after, 'country'))),
  ),
);
for (const e of EXPERIMENTS)
  out.push(
    line(
      `${e.id} ${e.name} (page aggregation)`,
      sum(cohort(load(values.before, 'page'), e.pages)),
      sum(cohort(load(values.after, 'page'), e.pages)),
    ),
  );

const qb = bands(load(values.before, 'query'));
const qa = bands(load(values.after, 'query'));
out.push(
  '',
  'Visible-query impressions by position band (anonymized queries excluded):',
  '',
  '| Band | Before | After |',
  '|---|---|---|',
  ...Object.keys(qa).map((k) => `| ${k} | ${qb[k]} | ${qa[k]} |`),
  '',
);

const pages = compareBy(load(values.before, 'page'), load(values.after, 'page'), 'page');
const readable = pages.filter((p) => p.readable);
out.push('Pages with 10+ impressions in both periods:', '');
out.push(
  ...(readable.length
    ? [
        '| Page | Impressions | Clicks | Position |',
        '|---|---|---|---|',
        ...readable.map((p) =>
          line(p.key.replace('https://wattsplain.com', ''), p.before, p.after),
        ),
      ]
    : ['None yet: too few impressions per page to judge position changes.']),
  '',
);
const fresh = pages.filter((p) => p.before.impressions === 0 && p.after.impressions > 0);
if (fresh.length)
  out.push(
    `New pages with impressions: ${fresh.map((p) => `${p.key.replace('https://wattsplain.com', '')} (${p.after.impressions})`).join(', ')}`,
    '',
  );
const queries = compareBy(load(values.before, 'query'), load(values.after, 'query'), 'query', {
  minImpressions: 5,
});
const newQ = queries.filter((q) => q.before.impressions === 0 && q.after.impressions >= 2);
out.push(
  `New queries with 2+ impressions: ${newQ.length ? newQ.map((q) => `"${q.key}" (${q.after.impressions} @ ${fmtPos(q.after.position)})`).join(', ') : 'none'}`,
  '',
);

const md = out.join('\n');
if (values.out) writeFileSync(values.out, `${md}\n`);
console.log(md);
