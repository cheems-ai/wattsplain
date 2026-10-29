#!/usr/bin/env node
// Refreshes src/data/electricity.json from the EIA (run monthly, after EIA publishes the Electric
// Power Monthly). Fails without writing if any state is missing, so a layout change at EIA never
// publishes a partial dataset. With EIA_API_KEY (site/.env) it also stores 24 months of monthly
// prices per state for the trend charts.
//
//   npm run data:eia
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { STATES } from '../../src/data/states.ts';
import {
  ANNUAL_URL,
  MONTHLY_URL,
  buildDataset,
  historyUrl,
  parseAnnualTable,
  parseHistory,
  parseMonthlyTable,
} from '../lib/eia.mjs';

async function download(url, label = url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const monthly = parseMonthlyTable((await download(MONTHLY_URL)).toString('utf8'));
const annual = parseAnnualTable(await download(ANNUAL_URL));

let history = null;
const key = process.env['EIA_API_KEY'];
if (key) {
  const start = `${Number(monthly.period.slice(0, 4)) - 3}-01`;
  // The label keeps the key out of error messages.
  const body = await download(historyUrl(key, start), 'EIA API retail-sales');
  history = parseHistory(JSON.parse(body.toString('utf8')), STATES);
} else {
  // Never drop a history we already publish: that would silently remove every trend chart.
  const out = new URL('../../src/data/electricity.json', import.meta.url);
  const existing = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
  if (existing.history) {
    throw new Error('EIA_API_KEY is not set; refusing to drop the published price history');
  }
  console.warn('EIA_API_KEY not set: skipping the monthly price history (trend charts)');
}

const dataset = buildDataset(
  monthly,
  annual,
  STATES,
  new Date().toISOString().slice(0, 10),
  history,
);
const out = new URL('../../src/data/electricity.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(
  `electricity.json: ${dataset.states.length} states, monthly ${dataset.monthly.period} vs ${dataset.monthly.priorPeriod}, annual ${dataset.annual.year}` +
    (history ? `, history ${history.periods[0]}–${history.periods.at(-1)}` : ''),
);
