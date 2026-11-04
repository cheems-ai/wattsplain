#!/usr/bin/env node
// AI visibility from Cloudflare request logs (read-only): which AI assistants and search crawlers
// fetched the site in the last N days (default 7, the most the Free plan keeps), and which pages
// assistants opened because a person asked them something (ChatGPT-User, Perplexity-User, …).
// Pair it with `npm run metrics` (real visitors arriving from AI assistants) and the
// fortnightly AI question check in the project notes (kept outside this repository).
//
//   npm run ai-visibility [-- 7]
//
// Needs CLOUDFLARE_API_TOKEN with Zone Analytics: Read; the token is read from the environment
// and never printed.
import { summarize } from '../lib/ai-crawlers.mjs';

const HOST = 'wattsplain.com';
const API = 'https://api.cloudflare.com/client/v4';
const days = Math.min(Math.max(Number(process.argv[2] ?? 7), 1), 7);
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('Set CLOUDFLARE_API_TOKEN (Zone Analytics: Read).');
  process.exit(1);
}

// The office network to Cloudflare drops now and then ("fetch failed"), so retry.
async function api(path, init, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const j = await r.json();
      if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join('; '));
      return j;
    } catch (err) {
      if (i >= attempts) throw err;
      console.error(`(attempt ${i} failed: ${err.message}; retrying)`);
      await new Promise((ok) => setTimeout(ok, 3000));
    }
  }
}

const zone = (await api(`/zones?name=${HOST}`)).result?.[0]?.id;
if (!zone) throw new Error(`zone ${HOST} not visible to this token`);

const QUERY = `query($zone: String!, $from: Time!, $to: Time!) { viewer { zones(filter: {zoneTag: $zone}) {
  httpRequestsAdaptiveGroups(limit: 10000, filter: {datetime_geq: $from, datetime_lt: $to, requestSource: "eyeball"}) {
    count dimensions { userAgent edgeResponseStatus clientRequestPath } } } } }`;

// One query per day keeps each answer well under the row limit.
const now = Date.now();
const rows = [];
for (let d = days; d >= 1; d--) {
  const from = new Date(now - d * 864e5).toISOString();
  const to = new Date(now - (d - 1) * 864e5).toISOString();
  const j = await api('/graphql', {
    method: 'POST',
    body: JSON.stringify({ query: QUERY, variables: { zone, from, to } }),
  });
  const day = j.data.viewer.zones[0].httpRequestsAdaptiveGroups;
  if (day.length >= 10000) console.error(`(day ending ${to}: row limit reached, counts are low)`);
  rows.push(...day);
}

const summary = summarize(rows);
const KIND = {
  user: 'opened for a person',
  search: 'search index',
  training: 'model training',
};
console.log(
  `${HOST}: crawler requests in the last ${days} days (Cloudflare, all edge responses)\n`,
);
console.table(
  summary.map((s) => ({
    crawler: s.name,
    owner: s.owner,
    purpose: KIND[s.kind],
    requests: s.requests,
    pages: s.pages.size,
    statuses: Object.entries(s.statuses)
      .map(([k, v]) => `${k}:${v}`)
      .join(' '),
  })),
);

const user = summary.filter((s) => s.kind === 'user');
const pages = new Map();
for (const s of user) for (const [p, n] of s.pages) pages.set(p, (pages.get(p) ?? 0) + n);
console.log('Pages AI assistants opened for people (ChatGPT-User, Perplexity-User, Claude-User…):');
if (pages.size === 0) console.log('  none');
else
  console.table(
    [...pages]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([path, requests]) => ({ path, requests })),
  );

const bing = summary.find((s) => s.name === 'Bingbot');
if (!bing || bing.pages.size < 5)
  console.log(
    '\nNote: Bingbot fetched few or no pages. ChatGPT search leans on the Bing index, so check Bing Webmaster Tools.',
  );
