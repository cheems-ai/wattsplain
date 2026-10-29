#!/usr/bin/env node
// Prints `changed=true|false` (for $GITHUB_OUTPUT): whether src/data/electricity.json differs from
// the committed version in anything but fetchedAt. Used by .github/workflows/monthly-data.yml.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { dataChanged } from '../lib/eia.mjs';

const path = 'src/data/electricity.json';
const committed = JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }));
const current = JSON.parse(readFileSync(path, 'utf8'));
const changed = dataChanged(committed, current);
console.log(`changed=${changed}`);
console.error(
  changed
    ? `EIA data changed: ${committed.monthly.period} → ${current.monthly.period}`
    : `EIA data unchanged (${current.monthly.period})`,
);
