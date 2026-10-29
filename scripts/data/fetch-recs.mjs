#!/usr/bin/env node
// Writes src/data/heat-need.json from RECS 2020 Table CE8.15.M (average natural gas used for space
// heating per gas-heated home, by state). RECS is a survey run every few years, so this only needs
// running again when EIA publishes a new one (then update RECS_URL in scripts/lib/heating.mjs).
//
//   npm run data:recs
import { writeFileSync } from 'node:fs';

import { STATES } from '../../src/data/states.ts';
import { RECS_URL, parseRecsHeating } from '../lib/heating.mjs';

const res = await fetch(RECS_URL, { signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`RECS CE8.15.M: HTTP ${res.status}`);
const need = parseRecsHeating(Buffer.from(await res.arrayBuffer()), STATES);
writeFileSync(
  new URL('../../src/data/heat-need.json', import.meta.url),
  `${JSON.stringify(need, null, 2)}\n`,
);
console.log(
  `heat-need.json: U.S. ${need.us} million Btu, ${Object.keys(need.byState).length} states`,
);
