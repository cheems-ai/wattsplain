#!/usr/bin/env node
// Monthly growth review: one Markdown file with the production audit, Search Console (clicks,
// impressions, queries, index status of every sitemap URL) and first-party analytics for the last
// 28 days, plus the questions to answer each month. Sections whose credentials are missing say
// BLOCKED instead of guessing.
//
//   GSC_KEY_FILE=D:/秘密/faveden-gsc.json CLOUDFLARE_ACCOUNT_ID=<id> npm run review -- [--out f.md]
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { out: { type: 'string' }, days: { type: 'string', default: '28' } },
});
const today = new Date().toISOString().slice(0, 10);
const out = values.out ?? `review-${today}.md`;
const script = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

function run(name, args, needs) {
  const missing = needs.filter((v) => !process.env[v]);
  if (missing.length) return `BLOCKED: set ${missing.join(' and ')} to include this section.`;
  const r = spawnSync(process.execPath, [script(name), ...args], {
    encoding: 'utf8',
    timeout: 30 * 60_000,
  });
  const text = (r.stdout || '').trim();
  return r.status === 0 ? text : `${text}\n\nFAILED (exit ${r.status}): ${(r.stderr || '').trim()}`;
}

const sections = [
  `# Wattsplain monthly review ${today}`,
  '',
  'Fill in the conclusions at the end. Where a number is missing or the sample is tiny, write',
  '"not enough data" rather than reading a trend into it.',
  '',
  '## 1. Production audit',
  '',
  run('site-audit.mjs', [], []).replace(/^#/gm, '###'),
  '',
  '## 2. Search Console',
  '',
  run('gsc-report.mjs', ['--days', values.days, '--inspect'], ['GSC_KEY_FILE']).replace(
    /^#/gm,
    '###',
  ),
  '',
  `## 3. First-party analytics, last ${values.days} days`,
  '',
  'Events: view = page view; tool = first input on a calculator; result = first valid result after',
  'input; error = a form error shown; compare = planner scenario added; share = link, summary, CSV',
  'or print; home-tool = tool opened from the home page. Completion rate = result ÷ tool for',
  'segment "real". Automation (our tests) and bots are counted separately.',
  '',
  '```',
  run('metrics-report.mjs', [values.days], ['CLOUDFLARE_ACCOUNT_ID']),
  '```',
  '',
  '## 4. Conclusions (fill in)',
  '',
  '- Newly indexed pages since last month:',
  '- Pages and queries that gained or lost impressions:',
  '- Queries at positions 8–20 worth a better title or section:',
  '- Tool completion (result ÷ tool) by tool; any tool with many errors:',
  '- Feedback received (GitHub issues, email):',
  '- Technical problems (monitor issues, failed data jobs):',
  '- Content experiments and what happened to them:',
  '- Next month: P0 / P1 / P2:',
  '',
];
writeFileSync(out, sections.join('\n'));
console.log(`review written to ${out}`);
