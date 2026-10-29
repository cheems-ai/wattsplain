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
