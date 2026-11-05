#!/usr/bin/env node
// Refreshes src/data/utilities.json: residential electricity prices by utility from EIA Form 861M
// (this year's and last year's monthly files) plus the share of homes on retail choice from the
// latest EIA-861 annual file. No API key needed. Fails without writing if any
// state has no utility, or if EIA's 861M state totals disagree with Table 5.6.A for the same month.
//
//   npm run data:utilities
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { STATES } from '../../src/data/states.ts';
import { readZip } from '../lib/xlsx.mjs';
import {
  annualZipUrls,
  buildUtilities,
  parseChoiceShares,
  parseUtilitySheet,
  readFirstSheet,
  utilityUrls,
  validateUtilities,
} from '../lib/utilities.mjs';

async function download(urls, type) {
  for (const url of urls) {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    // EIA answers a missing file by redirecting to an HTML page with status 200.
    if (res.ok && type.test(res.headers.get('content-type') ?? ''))
      return Buffer.from(await res.arrayBuffer());
    if (!res.ok && res.status !== 404) throw new Error(`${url}: HTTP ${res.status}`);
  }
  return null;
}

// The newest file can lag into January (no file for the new year yet): fall back a year.
const year = new Date().getUTCFullYear();
const records = [];
for (const y of [year, year - 1, year - 2]) {
  const buf = await download(utilityUrls(y), /spreadsheetml/);
  if (buf) records.push(...parseUtilitySheet(readFirstSheet(buf)));
  // Two years of files always cover the latest month plus the 12 months before it.
  if (new Set(records.map((r) => r.period.slice(0, 4))).size >= 2) break;
}

// Retail-choice shares from the newest EIA-861 annual file (published each October).
let choice = null;
for (const y of [year - 1, year - 2]) {
  const zip = await download(annualZipUrls(y), /zip/);
  if (!zip) continue;
  const sheet = readZip(zip).get(`Sales_Ult_Cust_${y}.xlsx`);
  if (!sheet) throw new Error(`f861${y}.zip has no Sales_Ult_Cust_${y}.xlsx`);
  choice = parseChoiceShares(readFirstSheet(sheet));
  break;
}

const out = new URL('../../src/data/utilities.json', import.meta.url);
const electricity = JSON.parse(
  readFileSync(new URL('../../src/data/electricity.json', import.meta.url), 'utf8'),
);
const dataset = buildUtilities(records, STATES, new Date().toISOString().slice(0, 10), choice);
validateUtilities(
  dataset,
  electricity,
  existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null,
);
writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`);
const n = Object.values(dataset.states).reduce((s, x) => s + x.utilities.length, 0);
console.log(
  `utilities.json: ${n} utilities in ${Object.keys(dataset.states).length} states, ${dataset.period}`,
);
