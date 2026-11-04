// Known crawler user agents, grouped by what a visit means for AI visibility. Used by
// scripts/ops/ai-visibility.mjs on Cloudflare request logs (user agents are never stored).
//
// - user: an assistant opened the page because a person asked it something (the closest signal
//   to "an AI answer used this page").
// - search: builds the index an assistant searches (ChatGPT search, Perplexity, Claude, Bing).
// - training: collects pages for model training.
export const CRAWLERS = [
  { name: 'ChatGPT-User', owner: 'OpenAI', kind: 'user', re: /ChatGPT-User/i },
  { name: 'Perplexity-User', owner: 'Perplexity', kind: 'user', re: /Perplexity-User/i },
  { name: 'Claude-User', owner: 'Anthropic', kind: 'user', re: /Claude-User/i },
  { name: 'MistralAI-User', owner: 'Mistral', kind: 'user', re: /MistralAI-User/i },
  { name: 'OAI-SearchBot', owner: 'OpenAI', kind: 'search', re: /OAI-SearchBot/i },
  { name: 'PerplexityBot', owner: 'Perplexity', kind: 'search', re: /PerplexityBot/i },
  { name: 'Claude-SearchBot', owner: 'Anthropic', kind: 'search', re: /Claude-SearchBot/i },
  { name: 'Bingbot', owner: 'Microsoft', kind: 'search', re: /bingbot/i },
  { name: 'Googlebot', owner: 'Google', kind: 'search', re: /Googlebot/i },
  { name: 'Applebot', owner: 'Apple', kind: 'search', re: /Applebot/i },
  { name: 'DuckAssistBot', owner: 'DuckDuckGo', kind: 'search', re: /DuckAssistBot/i },
  { name: 'GPTBot', owner: 'OpenAI', kind: 'training', re: /GPTBot/i },
  { name: 'ClaudeBot', owner: 'Anthropic', kind: 'training', re: /ClaudeBot/i },
  { name: 'meta-externalagent', owner: 'Meta', kind: 'training', re: /meta-externalagent/i },
  { name: 'Amazonbot', owner: 'Amazon', kind: 'training', re: /Amazonbot/i },
  { name: 'CCBot', owner: 'Common Crawl', kind: 'training', re: /CCBot/i },
  { name: 'Bytespider', owner: 'ByteDance', kind: 'training', re: /Bytespider/i },
];

/** The crawler a user agent belongs to, or undefined for browsers and unknown bots. */
export const crawlerOf = (userAgent) => CRAWLERS.find((c) => c.re.test(userAgent ?? ''));

/** Static files that say nothing about which content a crawler wanted (llms.txt does). */
const ASSET =
  /^\/(_astro\/|favicon|og\/|fonts\/)|\.(js|css|png|jpe?g|svg|webp|ico|woff2?|txt|xml)$/;
const isPage = (path) => path === '/llms.txt' || !ASSET.test(path);

/**
 * Aggregates Cloudflare `httpRequestsAdaptiveGroups` rows ({count, dimensions: {userAgent,
 * edgeResponseStatus, clientRequestPath}}) by crawler: requests, status codes, and page counts.
 */
export function summarize(rows) {
  const out = new Map();
  for (const { count, dimensions: d } of rows) {
    const c = crawlerOf(d.userAgent);
    if (!c) continue;
    let s = out.get(c.name);
    if (!s) {
      s = { ...c, requests: 0, statuses: {}, pages: new Map() };
      delete s.re;
      out.set(c.name, s);
    }
    s.requests += count;
    s.statuses[d.edgeResponseStatus] = (s.statuses[d.edgeResponseStatus] ?? 0) + count;
    if (isPage(d.clientRequestPath))
      s.pages.set(d.clientRequestPath, (s.pages.get(d.clientRequestPath) ?? 0) + count);
  }
  const order = { user: 0, search: 1, training: 2 };
  return [...out.values()].sort((a, b) => order[a.kind] - order[b.kind] || b.requests - a.requests);
}
