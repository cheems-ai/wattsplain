#!/usr/bin/env node
// Writes src/data/heat-need.json from RECS 2020 Table CE8.15.M (average natural gas used for space
// heating per gas-heated home, by state) and Table HC10.9 (average heated floor area). RECS is a survey run every few years, so this only needs
// running again when EIA publishes a new one (then update RECS_URL in scripts/lib/heating.mjs).
//
//   npm run data:recs
import { writeFileSync } from 'node:fs';

import { STATES } from '../../src/data/states.ts';
import { RECS_AREA_URL, RECS_URL, parseRecsArea, parseRecsHeating } from '../lib/heating.mjs';

const res = await fetch(RECS_URL, { signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`RECS CE8.15.M: HTTP ${res.status}`);
const need = parseRecsHeating(Buffer.from(await res.arrayBuffer()), STATES);
const areaRes = await fetch(RECS_AREA_URL, { signal: AbortSignal.timeout(60_000) });
if (!areaRes.ok) throw new Error(`RECS HC10.9: HTTP ${areaRes.status}`);
need.area = parseRecsArea(Buffer.from(await areaRes.arrayBuffer()));
writeFileSync(
  new URL('../../src/data/heat-need.json', import.meta.url),
  `${JSON.stringify(need, null, 2)}\n`,
);
console.log(
  `heat-need.json: U.S. ${need.us} million Btu, ${Object.keys(need.byState).length} states`,
);
