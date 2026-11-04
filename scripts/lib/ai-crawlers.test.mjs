import { describe, expect, it } from 'vitest';

import { crawlerOf, summarize } from './ai-crawlers.mjs';

const row = (userAgent, clientRequestPath, count = 1, edgeResponseStatus = 200) => ({
  count,
  dimensions: { userAgent, clientRequestPath, edgeResponseStatus },
});

describe('crawlerOf', () => {
  it('recognises AI and search crawlers by their published user agents', () => {
    expect(
      crawlerOf(
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
      )?.kind,
    ).toBe('user');
    expect(
      crawlerOf('Mozilla/5.0 (compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot)')?.name,
    ).toBe('OAI-SearchBot');
    expect(
      crawlerOf('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')?.kind,
    ).toBe('search');
    expect(
      crawlerOf('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)')?.kind,
    ).toBe('training');
  });

  it('ignores ordinary browsers', () => {
    expect(
      crawlerOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36'),
    ).toBeUndefined();
    expect(crawlerOf(undefined)).toBeUndefined();
  });
});

describe('summarize', () => {
  it('groups by crawler, user fetches first, and counts pages but not assets', () => {
    const out = summarize([
      row('GPTBot/1.2', '/electricity-rates/ohio/', 5),
      row('ChatGPT-User/1.0', '/tools/heating-cost-calculator/', 2),
      row('ChatGPT-User/1.0', '/tools/heating-cost-calculator/', 1, 301),
      row('ChatGPT-User/1.0', '/_astro/heating.js', 4),
      row('OAI-SearchBot/1.3', '/robots.txt', 3),
      row('OAI-SearchBot/1.3', '/llms.txt', 1),
      row('Mozilla/5.0 Chrome/140.0', '/', 50),
    ]);
    expect(out.map((s) => s.name)).toEqual(['ChatGPT-User', 'OAI-SearchBot', 'GPTBot']);
    const user = out[0];
    expect(user.requests).toBe(7);
    expect(user.statuses).toEqual({ 200: 6, 301: 1 });
    expect([...user.pages]).toEqual([['/tools/heating-cost-calculator/', 3]]);
    expect([...out[1].pages.keys()]).toEqual(['/llms.txt']);
    expect('re' in user).toBe(false);
  });
});
