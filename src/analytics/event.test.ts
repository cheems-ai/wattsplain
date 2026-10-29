import { describe, expect, it } from 'vitest';

import { classifyReferrer, parseEvent } from './event';

describe('classifyReferrer', () => {
  const c = (r: string) => classifyReferrer(r, 'wattsplain.com');

  it('groups referrers into coarse sources', () => {
    expect(c('')).toBe('direct');
    expect(c('https://wattsplain.com/electricity-rates/')).toBe('internal');
    expect(c('https://www.google.com/')).toBe('search');
    expect(c('https://www.bing.com/search?q=x')).toBe('search');
    expect(c('https://duckduckgo.com/')).toBe('search');
    expect(c('https://chatgpt.com/')).toBe('ai');
    expect(c('https://www.perplexity.ai/search/abc')).toBe('ai');
    expect(c('https://gemini.google.com/app')).toBe('ai');
    expect(c('https://www.reddit.com/r/energy/')).toBe('social');
    expect(c('https://t.co/abc')).toBe('social');
    expect(c('https://someblog.example/post')).toBe('other');
    expect(c('not a url')).toBe('other');
  });

  it('does not mistake look-alike hosts for search engines', () => {
    expect(c('https://google.evil.example/')).toBe('other');
  });
});

describe('parseEvent', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36';

  it('accepts a page view from a real browser', () => {
    expect(parseEvent({ e: 'view', p: '/electricity-rates/ohio/', s: 'search', a: 0 }, ua)).toEqual(
      {
        event: 'view',
        path: '/electricity-rates/ohio/',
        source: 'search',
        segment: 'real',
      },
    );
  });

  it('separates automated browsers and bots', () => {
    expect(parseEvent({ e: 'view', p: '/', s: 'direct', a: 1 }, ua)?.segment).toBe('automation');
    expect(parseEvent({ e: 'view', p: '/', s: 'direct', a: 0 }, 'Googlebot/2.1')?.segment).toBe(
      'bot',
    );
  });

  it('rejects anything outside the allowed shape', () => {
    expect(parseEvent(null, ua)).toBeNull();
    expect(parseEvent({ e: 'click', p: '/', s: 'direct' }, ua)).toBeNull();
    expect(parseEvent({ e: 'view', p: '/', s: 'https://google.com/' }, ua)).toBeNull();
    expect(parseEvent({ e: 'view', p: '/Admin', s: 'direct' }, ua)).toBeNull();
    expect(parseEvent({ e: 'view', p: '/a?q=1', s: 'direct' }, ua)).toBeNull();
    expect(parseEvent({ e: 'view', p: 'https://x.com/', s: 'direct' }, ua)).toBeNull();
    expect(parseEvent({ e: 'view', p: `/${'a'.repeat(120)}/`, s: 'direct' }, ua)).toBeNull();
  });
});
