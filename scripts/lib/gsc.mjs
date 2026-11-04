// Helpers for scripts/ops/gsc-report.mjs: a service-account
// sign-in for the Search Console API and pure summaries of its answers. Only the read-only scope is
// ever requested, whatever permission the account has on the property.
import { createSign } from 'node:crypto';

export const READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

/**
 * A signed JWT for the OAuth 2.0 service-account flow (RFC 7523). `key` is the downloaded JSON key
 * (`client_email`, `private_key`, `private_key_id`, `token_uri`); `now` is in seconds.
 */
export function serviceAccountJwt(key, now) {
  for (const field of ['client_email', 'private_key', 'token_uri'])
    if (typeof key?.[field] !== 'string') throw new Error(`service account key has no ${field}`);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT', kid: key.private_key_id })}.${b64({
    iss: key.client_email,
    scope: READONLY_SCOPE,
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  return `${unsigned}.${signature.toString('base64url')}`;
}

/** Counts URL Inspection results by coverage state, most common first. */
export function coverageCounts(results) {
  const counts = new Map();
  for (const r of results) {
    const state = r.coverageState ?? 'No answer';
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Clicks, impressions, CTR and impression-weighted position over Search Analytics rows. */
export function analyticsTotals(rows) {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    weighted += r.position * r.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weighted / impressions : null,
  };
}

/**
 * Queries worth work: ranking 8–20
 * ("near page one") or shown often but rarely clicked. Rows are `{ keys: [query], clicks,
 * impressions, ctr, position }`.
 */
export function opportunities(rows, { minImpressions = 10 } = {}) {
  return rows
    .filter((r) => r.impressions >= minImpressions)
    .flatMap((r) => {
      const reasons = [];
      if (r.position >= 8 && r.position <= 20) reasons.push('near page one');
      if (r.position < 8 && r.ctr < 0.02) reasons.push('shown but rarely clicked');
      return reasons.length ? [{ query: r.keys[0], ...r, reasons }] : [];
    })
    .sort((a, b) => b.impressions - a.impressions);
}

/**
 * Impressions and clicks grouped by average position (2026-11-04 traffic report, step 1 of the
 * diagnosis): 1–10 with no clicks points at titles, snippets or AI answers; 11–20 is "near page
 * one"; beyond 20 is a ranking problem (content depth, links, time), not a snippet problem.
 * Rows are query (or query+page) rows from the Search Analytics API.
 */
export function positionBuckets(rows) {
  const buckets = [
    {
      label: '1–10',
      max: 10,
      why: 'on page one: work on title, description, answer in the first lines',
    },
    { label: '11–20', max: 20, why: 'near page one: add depth and internal links to these pages' },
    { label: '21–50', max: 50, why: 'ranking problem: content, links and time' },
    { label: '51+', max: Infinity, why: 'too far to judge yet' },
  ].map((b) => ({ ...b, queries: 0, impressions: 0, clicks: 0 }));
  for (const r of rows) {
    const b = buckets.find((x) => r.position <= x.max);
    b.queries += 1;
    b.impressions += r.impressions;
    b.clicks += r.clicks;
  }
  return buckets.map(({ max: _max, ...b }) => ({
    ...b,
    ctr: b.impressions ? b.clicks / b.impressions : 0,
  }));
}
