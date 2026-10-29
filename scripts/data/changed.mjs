#!/usr/bin/env node
// Prints `changed=true|false` (for $GITHUB_OUTPUT): whether src/data/electricity.json or
// src/data/heating.json differs from the committed version in anything but fetchedAt. Used by
// .github/workflows/monthly-data.yml.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { dataChanged } from '../lib/eia.mjs';

const read = (path) => ({
  committed: JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' })),
  current: JSON.parse(readFileSync(path, 'utf8')),
});
const elec = read('src/data/electricity.json');
const heat = read('src/data/heating.json');
const elecChanged = dataChanged(elec.committed, elec.current);
const heatChanged = dataChanged(heat.committed, heat.current);
console.log(`changed=${elecChanged || heatChanged}`);
console.error(
  elecChanged
    ? `EIA electricity data changed: ${elec.committed.monthly.period} → ${elec.current.monthly.period}`
    : `EIA electricity data unchanged (${elec.current.monthly.period})`,
);
console.error(
  heatChanged
    ? `EIA heating fuel prices changed: propane week ${heat.committed.propane.week} → ${heat.current.propane.week}`
    : `EIA heating fuel prices unchanged (propane week ${heat.current.propane.week})`,
);
