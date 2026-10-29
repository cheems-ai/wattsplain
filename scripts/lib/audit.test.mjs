import { describe, expect, it } from 'vitest';

import {
  internalLinks,
  normaliseForCompare,
  pageProblems,
  parsePage,
  visibleText,
} from './audit.mjs';

const URL_ = 'https://wattsplain.com/electricity-rates/ohio/';
const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const html = ({ head = '', body = '' } = {}) =>
  `<!doctype html><html><head><title>Ohio electricity rates &amp; costs</title>
<meta name="description" content="Ohio rates.">
<link rel="canonical" href="${URL_}">${head}</head><body><h1>Ohio</h1><p>${words(200)}</p>${body}</body></html>`;
const ok = { status: 200, contentType: 'text/html; charset=utf-8', xRobotsTag: null };

describe('parsePage', () => {
  it('reads title, description, canonical, robots, h1 and words', () => {
    const p = parsePage(html({ head: '<meta content="noindex" name="robots">' }));
    expect(p.title).toBe('Ohio electricity rates & costs');
    expect(p.description).toBe('Ohio rates.');
    expect(p.canonical).toBe(URL_);
    expect(p.robots).toBe('noindex');
    expect(p.h1).toBe(1);
    expect(p.words).toBe(201);
  });

  it('checks every JSON-LD block', () => {
    const p = parsePage(
      html({
        head: '<script type="application/ld+json">{"@type":"Dataset"}</script><script type="application/ld+json">{bad</script>',
      }),
    );
    expect(p.jsonLd[0]).toEqual({ ok: true, type: 'Dataset' });
    expect(p.jsonLd[1]?.ok).toBe(false);
  });

  it('collects links without fragments and assets from scripts, styles and islands', () => {
    const p = parsePage(
      html({
        head: '<link rel="stylesheet" href="/_astro/a.css"><script type="module" src="/_astro/p.js"></script>',
        body: '<a href="/tools/#x">t</a><a href="/tools/">t</a><a href="#top">top</a><astro-island uid="1" component-url="/_astro/I.js" renderer-url="/_astro/c.js"></astro-island>',
      }),
    );
    expect(p.links).toEqual(['/tools/']);
    expect(p.assets.sort()).toEqual([
      '/_astro/I.js',
      '/_astro/a.css',
      '/_astro/c.js',
      '/_astro/p.js',
    ]);
  });
});

describe('visibleText', () => {
  it('drops scripts, styles and svg', () => {
    expect(
      visibleText('<body><script>x()</script><p>a  <b>b</b></p><svg><text>c</text></svg></body>'),
    ).toBe('a b');
  });
});

describe('pageProblems', () => {
  it('passes a good page', () => {
    expect(pageProblems(URL_, ok, parsePage(html()))).toEqual([]);
  });

  it('flags noindex, a wrong canonical and redirects as critical', () => {
    const levels = (res, h) =>
      pageProblems(URL_, res, parsePage(h)).map((p) => `${p.level}: ${p.message}`);
    expect(levels(ok, html({ head: '<meta name="robots" content="noindex, nofollow">' }))).toEqual([
      'critical: meta robots: noindex, nofollow',
    ]);
    expect(levels({ ...ok, xRobotsTag: 'noindex' }, html())).toEqual([
      'critical: X-Robots-Tag: noindex',
    ]);
    expect(levels(ok, html().replace(`href="${URL_}"`, 'href="https://wattsplain.com/"'))).toEqual([
      'critical: canonical is https://wattsplain.com/',
    ]);
    expect(pageProblems(URL_, { status: 307, location: '/x/' }, {})).toEqual([
      { level: 'critical', message: 'HTTP 307 -> /x/' },
    ]);
  });

  it('warns about thin pages and long titles', () => {
    const thin = html().replace(words(200), 'short');
    expect(pageProblems(URL_, ok, parsePage(thin))[0]?.message).toMatch(/only \d+ words/);
    const long = html().replace('Ohio electricity rates &amp; costs', 'x'.repeat(75));
    expect(pageProblems(URL_, ok, parsePage(long))).toEqual([
      { level: 'warn', message: 'title is 75 characters' },
    ]);
  });
});

describe('internalLinks', () => {
  it('keeps same-origin paths only', () => {
    expect(
      internalLinks(
        [
          '/tools/?state=TX',
          'https://www.eia.gov/',
          'mailto:a@b.c',
          '../texas/',
          'https://wattsplain.com/',
        ],
        URL_,
        'https://wattsplain.com',
      ),
    ).toEqual([
      'https://wattsplain.com/tools/',
      'https://wattsplain.com/electricity-rates/texas/',
      'https://wattsplain.com/',
    ]);
  });
});

describe('normaliseForCompare', () => {
  it('ignores the edge-injected beacon and island uids', () => {
    const built = '<body><astro-island uid="Z1" x="1"></astro-island></body>';
    const served =
      '<body><astro-island uid="AB9" x="1"></astro-island><script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script></body>';
    expect(normaliseForCompare(served)).toBe(normaliseForCompare(built));
  });
});
