import { describe, expect, it } from 'vitest';

import { mainText, nextLastmods, textHash, withLastmod } from './lastmod.mjs';

describe('sitemap lastmod helpers', () => {
  it('reads only the visible text of <main>', () => {
    const html =
      '<head><title>T</title></head><nav>Menu</nav><main id="main"><h1>Ohio</h1>\n<p>19.38¢ <script>x()</script>per kWh</p></main><footer>F</footer>';
    expect(mainText(html)).toBe('Ohio 19.38¢ per kWh');
  });

  it('ignores template changes outside <main> and markup-only changes', () => {
    const a = '<head></head><main><p>Same text</p></main><footer>v1</footer>';
    const b =
      '<head><meta property="og:image"></head><main><p class="x">Same text</p></main><footer>v2</footer>';
    expect(textHash(a)).toBe(textHash(b));
    expect(textHash(a)).not.toBe(textHash('<main><p>New text</p></main>'));
  });

  it('dates new and changed pages today and keeps the rest', () => {
    const before = {
      '/': { hash: 'aaa', lastmod: '2026-10-01' },
      '/a/': { hash: 'bbb', lastmod: '2026-10-01' },
      '/gone/': { hash: 'ccc', lastmod: '2026-10-01' },
    };
    expect(
      nextLastmods(before, { '/': 'aaa', '/a/': 'xxx', '/new/': 'ddd' }, '2026-10-30'),
    ).toEqual({
      '/': { hash: 'aaa', lastmod: '2026-10-01' },
      '/a/': { hash: 'xxx', lastmod: '2026-10-30' },
      '/new/': { hash: 'ddd', lastmod: '2026-10-30' },
    });
  });

  it('adds <lastmod> after each dated <loc>, once', () => {
    const xml =
      '<urlset>\n  <url><loc>https://wattsplain.com/</loc></url>\n  <url><loc>https://wattsplain.com/a/</loc></url>\n</urlset>\n';
    const state = { '/': { hash: 'h', lastmod: '2026-10-30' } };
    const out = withLastmod(xml, state);
    expect(out).toContain('<loc>https://wattsplain.com/</loc><lastmod>2026-10-30</lastmod></url>');
    expect(out).toContain('<loc>https://wattsplain.com/a/</loc></url>');
    expect(withLastmod(out, state)).toBe(out);
  });
});
