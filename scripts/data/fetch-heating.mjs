#!/usr/bin/env node
// Refreshes src/data/heating.json: natural gas, propane and heating oil prices by state from the
// EIA Open Data API (needs EIA_API_KEY in site/.env). Propane and heating oil prices are weekly
// from October to March, so in the heating season this changes every week. Fails without writing
// if any state is missing.
//
//   npm run data:heating
import { writeFileSync } from 'node:fs';

import { STATES } from '../../src/data/states.ts';
import {
  GAS_SOURCE,
  SHOPP_SOURCE,
  gasAnnualUrl,
  gasPriceUrl,
  gasVolumeUrl,
  parseGas,
  parseShopp,
  shoppUrl,
} from '../lib/heating.mjs';

const key = process.env['EIA_API_KEY'];
if (!key) throw new Error('EIA_API_KEY is not set (site/.env)');

// The label keeps the key out of error messages.
async function download(url, label) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.json();
}

const now = new Date();
const year = now.getUTCFullYear();
const monthsAgo = (n) =>
  new Date(Date.UTC(year, now.getUTCMonth() - n, 1)).toISOString().slice(0, 7);

const gas = parseGas(
  await download(gasPriceUrl(key, monthsAgo(24)), 'EIA API gas price'),
  await download(gasVolumeUrl(key, monthsAgo(24)), 'EIA API gas volume'),
  await download(gasAnnualUrl(key, year - 3), 'EIA API gas annual'),
  STATES,
);
// 13 months back always includes the latest heating season, even in September.
const shopp = await download(shoppUrl(key, `${monthsAgo(13)}-01`), 'EIA API SHOPP');
const propane = parseShopp(shopp, 'EPLLPA', STATES);
const oil = parseShopp(shopp, 'EPD2F', STATES);

const dataset = {
  fetchedAt: now.toISOString().slice(0, 10),
  gas: { ...gas, unit: '$/Mcf', source: GAS_SOURCE },
  propane: { ...propane, unit: '$/gal', source: SHOPP_SOURCE },
  oil: { ...oil, unit: '$/gal', source: SHOPP_SOURCE },
};
writeFileSync(
  new URL('../../src/data/heating.json', import.meta.url),
  `${JSON.stringify(dataset, null, 2)}\n`,
);
console.log(
  `heating.json: gas ${gas.from}–${gas.period} (U.S. $${gas.us.price}/Mcf), propane week ${propane.week} ($${propane.us}/gal), heating oil week ${oil.week} ($${oil.us}/gal)`,
);
