#!/usr/bin/env node
// Prints the first-party analytics for the last N days (default 7) from the production D1 database:
// totals by segment, real visitors by source, and the top pages. Read-only.
//
//   CLOUDFLARE_ACCOUNT_ID=<id> npm run metrics [-- 28]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const days = Number(process.argv[2] ?? 7);
const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);

// Run wrangler's own entry with node (no shell), so the SQL stays one argument on Windows too.
const WRANGLER = fileURLToPath(
  new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url),
);

// Retries: the connection to Cloudflare from the office network drops now and then ("fetch failed").
function query(sql, attempts = 6) {
  for (let i = 1; ; i++) {
    const r = spawnSync(
      process.execPath,
      [WRANGLER, 'd1', 'execute', 'wattsplain-db', '--remote', '--json', '--command', sql],
      { encoding: 'utf8' },
    );
    if (r.status === 0) return JSON.parse(r.stdout.slice(r.stdout.search(/^\[/m)))[0].results;
    const why = /"text":\s*"([^"]+)"/.exec(r.stdout)?.[1] ?? r.stderr.trim().split('\n')[0];
    if (i >= attempts) throw new Error(`D1 query failed after ${attempts} attempts: ${why}`);
    console.error(`(attempt ${i} failed: ${why}; retrying)`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }
}

const table = (rows) => console.table(rows);
console.log(`Wattsplain analytics since ${since} (UTC days)\n`);
console.log('By segment (real visitors vs automation vs bots):');
table(
  query(
    `SELECT segment, event, SUM(count) AS count FROM daily_events WHERE day >= '${since}' GROUP BY segment, event ORDER BY segment, event`,
  ),
);
console.log('Real visitors by source:');
table(
  query(
    `SELECT source, SUM(CASE WHEN event = 'view' THEN count END) AS views, SUM(CASE WHEN event = 'tool' THEN count END) AS tool_uses FROM daily_events WHERE day >= '${since}' AND segment = 'real' GROUP BY source ORDER BY views DESC`,
  ),
);
console.log('Top pages (real visitors):');
table(
  query(
    `SELECT path, SUM(CASE WHEN event = 'view' THEN count END) AS views, SUM(CASE WHEN event = 'tool' THEN count END) AS tool_uses FROM daily_events WHERE day >= '${since}' AND segment = 'real' GROUP BY path ORDER BY views DESC LIMIT 20`,
  ),
);
