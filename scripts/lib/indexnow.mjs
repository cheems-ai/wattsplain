// Pure helpers for scripts/ops/indexnow.mjs (protocol: https://www.indexnow.org/documentation).
// No I/O, so they are unit-tested.
import { createHash } from 'node:crypto';

/** Public by design: the protocol proves ownership with this key served at /<key>.txt. */
export const INDEXNOW_KEY = 'bda5058b447a6cd47bd06bb814b680db';

/** `<loc>` values of a `<urlset>` sitemap, in order. */
export function sitemapUrls(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

export const contentHash = (html) => createHash('sha256').update(html).digest('hex').slice(0, 16);

/** URLs that are new or whose page hash differs from the last submission, sorted. */
export function changedUrls(before, after) {
  return Object.keys(after)
    .filter((url) => before[url] !== after[url])
    .sort();
}

/**
 * The IndexNow JSON body for one host. Throws on URLs from another host (the protocol rejects the
 * whole batch) and on more than 10,000 URLs (its per-request limit).
 */
export function indexNowBody(urls, { host, key }) {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key))
    throw new Error('IndexNow key must be 8–128 of a-z, A-Z, 0-9, -');
  if (urls.length > 10000)
    throw new Error(`IndexNow takes at most 10,000 URLs, got ${urls.length}`);
  for (const u of urls) {
    if (new URL(u).host !== host) throw new Error(`${u} is not on ${host}`);
  }
  return { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls };
}
