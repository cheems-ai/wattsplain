#!/usr/bin/env node
// Production crawl audit: what a search engine sees on wattsplain.com. Checks robots.txt, the
// sitemap, every sitemap page (status without redirects, canonical, noindex, title, description,
// H1, JSON-LD, server-rendered text, page weight), every internal link and asset, the HTTPS / www /
// trailing-slash redirects, the 404 page, the analytics endpoint and, with --dist, that production
// serves this build.
//
//   node scripts/ops/site-audit.mjs [--base https://wattsplain.com] [--dist dist] [--out f.md] [--json f.json]
//
// Exit 1 when a critical problem is found. A request that fails at the network level is retried
// and then reported as "unreachable": that is a problem of the network path, not proof that the
// server is down, so it fails the run only when most requests fail.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { internalLinks, normaliseForCompare, pageProblems, parsePage } from '../lib/audit.mjs';
import { sitemapUrls } from '../lib/indexnow.mjs';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'https://wattsplain.com' },
    dist: { type: 'string' },
    out: { type: 'string' },
    json: { type: 'string' },
    'min-pages': { type: 'string', default: '60' },
  },
});
const ORIGIN = new URL(values.base).origin;
const HOST = new URL(ORIGIN).host;
// Page weight budget (bytes, uncompressed): HTML of one page, and its scripts together.
const HTML_BUDGET = 200_000;
const JS_BUDGET = 150_000;
const UA = 'Mozilla/5.0 (compatible; WattsplainAudit/1.0; +https://wattsplain.com/contact/)';

const problems = [];
const add = (level, where, message) => problems.push({ level, where, message });
let requests = 0;
let unreachable = 0;

/** fetch without following redirects; network failures retried, then `{ status: 0 }`. */
async function get(url, { method = 'GET', body } = {}) {
  requests++;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        redirect: 'manual',
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(30_000),
      });
      return {
        status: res.status,
        location: res.headers.get('location'),
        xRobotsTag: res.headers.get('x-robots-tag'),
        contentType: res.headers.get('content-type'),
        body: await res.text(),
      };
    } catch (e) {
      if (attempt >= 4) {
        unreachable++;
        return { status: 0, error: e instanceof Error ? (e.cause?.code ?? e.message) : String(e) };
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

/** Runs `fn` over `items` with at most `n` in flight. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// 1. robots.txt
const robots = await get(`${ORIGIN}/robots.txt`);
if (robots.status === 0) add('unreachable', '/robots.txt', robots.error);
else if (robots.status !== 200) add('critical', '/robots.txt', `HTTP ${robots.status}`);
else {
  const lines = robots.body.split(/\r?\n/).map((l) => l.trim());
  if (lines.some((l) => /^disallow:\s*\/\s*$/i.test(l)))
    add('critical', '/robots.txt', 'Disallow: / blocks the whole site');
  if (!lines.some((l) => l.toLowerCase() === `sitemap: ${ORIGIN}/sitemap.xml`))
    add('warn', '/robots.txt', 'no Sitemap line for /sitemap.xml');
}

// 2. Sitemap
const sm = await get(`${ORIGIN}/sitemap.xml`);
let urls = [];
if (sm.status === 0) add('unreachable', '/sitemap.xml', sm.error);
else if (sm.status !== 200) add('critical', '/sitemap.xml', `HTTP ${sm.status}`);
else {
  urls = sitemapUrls(sm.body);
  if (urls.length < Number(values['min-pages']))
    add(
      'critical',
      '/sitemap.xml',
      `${urls.length} URLs, expected at least ${values['min-pages']}`,
    );
  for (const u of urls)
    if (!u.startsWith(`${ORIGIN}/`)) add('critical', '/sitemap.xml', `foreign URL ${u}`);
  if (new Set(urls).size !== urls.length) add('warn', '/sitemap.xml', 'duplicate URLs');
}

// 3. Sitemap pages
const pages = await pool(urls, 6, async (url) => {
  const res = await get(url);
  const path = url.slice(ORIGIN.length);
  if (res.status === 0) {
    add('unreachable', path, res.error);
    return { url, path, status: 0 };
  }
  const page = res.status === 200 ? parsePage(res.body) : null;
  for (const p of pageProblems(url, res, page ?? {})) add(p.level, path, p.message);
  if (res.body.length > HTML_BUDGET) add('warn', path, `HTML is ${res.body.length} bytes`);
  return { url, path, status: res.status, html: res.body, page };
});

// 4. Internal links and assets found on those pages
const sitemapSet = new Set(urls);
const linkedFrom = new Map();
const assets = new Map();
for (const p of pages) {
  if (!p.page) continue;
  for (const l of internalLinks(p.page.links, p.url, ORIGIN)) {
    if (!linkedFrom.has(l)) linkedFrom.set(l, p.path);
  }
  for (const a of p.page.assets) {
    const u = new URL(a, p.url);
    if (u.origin === ORIGIN && !assets.has(u.href)) assets.set(u.href, p.path);
  }
}
const extraLinks = [...linkedFrom.keys()].filter((l) => !sitemapSet.has(l));
await pool(extraLinks, 6, async (l) => {
  const res = await get(l);
  const path = l.slice(ORIGIN.length);
  if (res.status === 0) add('unreachable', path, res.error);
  else if (res.status >= 400)
    add('critical', path, `broken link (HTTP ${res.status}) from ${linkedFrom.get(l)}`);
  else if (res.status >= 300)
    add('warn', path, `linked from ${linkedFrom.get(l)} but redirects to ${res.location}`);
  else if (!/\.(xml|txt|json|csv)$/.test(path))
    add('warn', path, `linked from ${linkedFrom.get(l)} but not in the sitemap`);
});
const assetSize = new Map();
await pool([...assets.keys()], 6, async (a) => {
  const res = await get(a);
  const path = a.slice(ORIGIN.length);
  if (res.status === 0) add('unreachable', path, res.error);
  else if (res.status !== 200)
    add('critical', path, `asset HTTP ${res.status} (used on ${assets.get(a)})`);
  else assetSize.set(a, res.body.length);
});
for (const p of pages) {
  if (!p.page) continue;
  const js = p.page.assets
    .map((a) => new URL(a, p.url).href)
    .filter((a) => /\.m?js$/.test(a))
    .reduce((sum, a) => sum + (assetSize.get(a) ?? 0), 0);
  p.jsBytes = js;
  if (js > JS_BUDGET) add('warn', p.path, `scripts total ${js} bytes`);
}

// 5. Redirects and the 404 page
const expectRedirect = async (from, to) => {
  const res = await get(from);
  if (res.status === 0) return add('unreachable', from, res.error);
  if (
    ![301, 308].includes(res.status) ||
    res.location?.replace(ORIGIN, '') !== to.replace(ORIGIN, '')
  )
    add(
      'critical',
      from,
      `expected a permanent redirect to ${to}, got HTTP ${res.status} ${res.location ?? ''}`,
    );
};
if (HOST === 'wattsplain.com') {
  await expectRedirect('http://wattsplain.com/', 'https://wattsplain.com/');
  await expectRedirect('https://www.wattsplain.com/tools/', 'https://wattsplain.com/tools/');
}
{
  const res = await get(`${ORIGIN}/electricity-rates/ohio`);
  if (res.status === 0) add('unreachable', '/electricity-rates/ohio', res.error);
  else if (
    res.status < 300 ||
    res.status >= 400 ||
    !res.location?.endsWith('/electricity-rates/ohio/')
  )
    add(
      'warn',
      '/electricity-rates/ohio',
      `no redirect to the trailing-slash URL (HTTP ${res.status})`,
    );
  else if (res.status !== 301 && res.status !== 308)
    add(
      'warn',
      '/electricity-rates/ohio',
      `trailing-slash redirect is HTTP ${res.status}, not permanent`,
    );
}
{
  const res = await get(`${ORIGIN}/no-such-page-audit/`);
  if (res.status === 0) add('unreachable', '/no-such-page-audit/', res.error);
  else if (res.status !== 404)
    add('critical', '/no-such-page-audit/', `missing page returns HTTP ${res.status}`);
}
{
  // The analytics Worker answers; an invalid event is rejected (400) and nothing is stored.
  const res = await get(`${ORIGIN}/api/e`, { method: 'POST', body: '{}' });
  if (res.status === 0) add('unreachable', '/api/e', res.error);
  else if (res.status !== 400)
    add('critical', '/api/e', `analytics endpoint answers HTTP ${res.status} to an invalid event`);
}

// 6. Production serves this build
let parity = null;
if (values.dist) {
  parity = { same: 0, different: [] };
  for (const p of pages) {
    if (!p.html || p.status !== 200) continue;
    const file = join(values.dist, decodeURI(p.path), 'index.html');
    if (!existsSync(file)) {
      parity.different.push(`${p.path} (not in this build)`);
      continue;
    }
    if (normaliseForCompare(readFileSync(file, 'utf8')) === normaliseForCompare(p.html))
      parity.same++;
    else parity.different.push(p.path);
  }
  for (const d of parity.different) add('warn', d, 'production HTML differs from this build');
}

// Report
const critical = problems.filter((p) => p.level === 'critical');
const networkDown = requests > 0 && unreachable / requests > 0.5;
const lines = [
  `# Site audit ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, ${ORIGIN}`,
  '',
  `- Sitemap URLs: **${urls.length}**; pages fetched with HTTP 200: **${pages.filter((p) => p.status === 200).length}**`,
  `- Internal links outside the sitemap checked: ${extraLinks.length}; assets checked: ${assets.size}`,
  `- Requests: ${requests}; unreachable after retries: ${unreachable}`,
  `- Critical: **${critical.length}**; warnings: ${problems.filter((p) => p.level === 'warn').length}`,
];
if (parity)
  lines.push(
    `- Same HTML as the local build: **${parity.same}** pages; different: ${parity.different.length}`,
  );
lines.push('', '## Problems', '');
if (problems.length === 0) lines.push('None.');
else {
  lines.push('| Level | Where | Problem |', '|---|---|---|');
  const order = { critical: 0, unreachable: 1, warn: 2 };
  for (const p of problems.sort(
    (a, b) => order[a.level] - order[b.level] || a.where.localeCompare(b.where),
  ))
    lines.push(`| ${p.level} | ${p.where} | ${p.message.replace(/\|/g, '\\|')} |`);
}
lines.push(
  '',
  '## Pages',
  '',
  '| URL | HTTP | Words | H1 | JSON-LD | HTML bytes | JS bytes | Title |',
  '|---|---|---|---|---|---|---|---|',
);
for (const p of pages)
  lines.push(
    `| ${p.path} | ${p.status} | ${p.page?.words ?? '-'} | ${p.page?.h1 ?? '-'} | ${p.page?.jsonLd.map((j) => (j.ok ? j.type : 'ERROR')).join(' ') || '-'} | ${p.html?.length ?? '-'} | ${p.jsBytes ?? '-'} | ${(p.page?.title ?? '-').replace(/\|/g, '\\|')} |`,
  );
lines.push('');
const report = lines.join('\n');
if (values.out) writeFileSync(values.out, report);
if (values.json)
  writeFileSync(
    values.json,
    `${JSON.stringify({ origin: ORIGIN, requests, unreachable, problems, parity, pages: pages.map(({ html, ...p }) => ({ ...p, page: p.page && { ...p.page, links: p.page.links.length, assets: p.page.assets.length } })) }, null, 2)}\n`,
  );
console.log(report);
if (critical.length > 0 || networkDown) {
  console.error(
    networkDown
      ? `site-audit: ${unreachable} of ${requests} requests unreachable; check the network path before blaming the site`
      : `site-audit: ${critical.length} critical problem(s)`,
  );
  process.exit(1);
}
