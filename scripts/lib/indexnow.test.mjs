import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { INDEXNOW_KEY, changedUrls, contentHash, indexNowBody, sitemapUrls } from './indexnow.mjs';

describe('IndexNow helpers', () => {
  it('reads the URLs of a sitemap', () => {
    const xml =
      '<urlset><url><loc>https://wattsplain.com/</loc></url><url><loc>https://wattsplain.com/a/</loc></url></urlset>';
    expect(sitemapUrls(xml)).toEqual(['https://wattsplain.com/', 'https://wattsplain.com/a/']);
  });

  it('sends only new and changed pages', () => {
    const before = { 'https://wattsplain.com/': 'aaa', 'https://wattsplain.com/a/': 'bbb' };
    const after = {
      'https://wattsplain.com/': 'aaa',
      'https://wattsplain.com/a/': 'ccc',
      'https://wattsplain.com/new/': 'ddd',
    };
    expect(changedUrls(before, after)).toEqual([
      'https://wattsplain.com/a/',
      'https://wattsplain.com/new/',
    ]);
    expect(changedUrls(after, after)).toEqual([]);
  });

  it('hashes page content stably', () => {
    expect(contentHash('<p>x</p>')).toBe(contentHash('<p>x</p>'));
    expect(contentHash('<p>x</p>')).not.toBe(contentHash('<p>y</p>'));
  });

  it('builds the request body and rejects other hosts', () => {
    const body = indexNowBody(['https://wattsplain.com/'], {
      host: 'wattsplain.com',
      key: INDEXNOW_KEY,
    });
    expect(body.keyLocation).toBe(`https://wattsplain.com/${INDEXNOW_KEY}.txt`);
    expect(() =>
      indexNowBody(['https://example.com/'], { host: 'wattsplain.com', key: INDEXNOW_KEY }),
    ).toThrow(/not on/);
  });

  it('serves the key file the protocol checks', () => {
    const file = new URL(`../../public/${INDEXNOW_KEY}.txt`, import.meta.url);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8').trim()).toBe(INDEXNOW_KEY);
  });
});
