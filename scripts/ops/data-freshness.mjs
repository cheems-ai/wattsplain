#!/usr/bin/env node
// Fails when the committed EIA data is older than the daily data job should ever let it get, which
// means that job has been failing or EIA changed something. Run by .github/workflows/prod-monitor.yml.
//
// Limits: EIA publishes a month's electricity prices about eight weeks after it ends, so in late
// October the newest month is August; four months behind means at least one release was missed.
// Natural gas runs a month behind electricity. Propane and heating oil are weekly from October to
// March only, so they are checked in that season.
import { readFileSync } from 'node:fs';

import { monthsBehind, weeksOld } from '../lib/freshness.mjs';

const read = (f) =>
  JSON.parse(readFileSync(new URL(`../../src/data/${f}`, import.meta.url), 'utf8'));
const electricity = read('electricity.json');
const heating = read('heating.json');
const now = new Date();
const problems = [];

const elec = monthsBehind(electricity.monthly.period, now);
if (elec > 4)
  problems.push(`electricity prices are for ${electricity.monthly.period} (${elec} months behind)`);
const gas = monthsBehind(heating.gas.period, now);
if (gas > 5)
  problems.push(`natural gas prices are for ${heating.gas.period} (${gas} months behind)`);
const month = now.getUTCMonth() + 1;
// From mid-October: EIA's first heating-season week is the first Monday of October.
if (month >= 11 || month <= 3 || (month === 10 && now.getUTCDate() >= 15)) {
  for (const fuel of ['propane', 'oil']) {
    const w = weeksOld(heating[fuel].week, now);
    if (w > 3)
      problems.push(`${fuel} prices are for the week of ${heating[fuel].week} (${w} weeks old)`);
  }
}

console.log(
  `data: electricity ${electricity.monthly.period}, gas ${heating.gas.period}, propane ${heating.propane.week}, oil ${heating.oil.week}`,
);
if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}
