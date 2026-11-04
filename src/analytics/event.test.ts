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

  it('recognises more AI assistants by referrer', () => {
    expect(c('https://copilot.microsoft.com/')).toBe('ai');
    expect(c('https://grok.com/c/abc')).toBe('ai');
    expect(c('https://chat.deepseek.com/')).toBe('ai');
    expect(c('https://chat.mistral.ai/chat')).toBe('ai');
  });
});

describe('classifyReferrer with an AI utm_source', () => {
  const c = (r: string, q: string) => classifyReferrer(r, 'wattsplain.com', q);

  it('counts a tagged visit without a referrer as AI, not direct', () => {
    expect(c('', '?utm_source=chatgpt.com')).toBe('ai');
    expect(c('', '?state=TX&utm_source=perplexity')).toBe('ai');
    expect(c('', '?utm_source=ChatGPT.com')).toBe('ai');
    expect(c('', '?utm_source=copilot.com')).toBe('ai');
  });

  it('lets the tag win over a search or other referrer', () => {
    expect(c('https://www.bing.com/', '?utm_source=chatgpt.com')).toBe('ai');
    expect(c('https://someblog.example/', '?utm_source=chatgpt.com')).toBe('ai');
  });

  it('keeps links on this site internal', () => {
    expect(c('https://wattsplain.com/tools/', '?utm_source=chatgpt.com')).toBe('internal');
  });

  it('ignores other or partial tags', () => {
    expect(c('', '?utm_source=newsletter')).toBe('direct');
    expect(c('', '?utm_source=notchatgpt.com')).toBe('direct');
    expect(c('', '?utm_medium=chatgpt.com')).toBe('direct');
    expect(c('https://www.google.com/', '?utm_source=')).toBe('search');
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
