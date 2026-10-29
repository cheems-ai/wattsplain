// First-party, cookieless page analytics. The browser sends {e, p, s, a}; the Worker validates it
// with parseEvent and adds 1 to a daily aggregate row. Nothing identifies a visitor: no IP, no
// user agent, no full referrer, no cookie or local storage.

export const EVENTS = ['view', 'tool'] as const;
export const SOURCES = ['search', 'ai', 'social', 'direct', 'internal', 'other'] as const;
export type EventName = (typeof EVENTS)[number];
export type Source = (typeof SOURCES)[number];
export type Segment = 'real' | 'automation' | 'bot';

// The engine name must be followed by its public suffix (google.com, google.co.uk, bing.com…), so
// look-alikes such as google.evil.example are not counted as search.
const SEARCH =
  /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|yandex|baidu|startpage|qwant|kagi)\.(com|org|net|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;
const AI =
  /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|copilot\.microsoft\.com|gemini\.google\.com|you\.com|phind\.com|meta\.ai)$/;
const SOCIAL =
  /(^|\.)(reddit\.com|facebook\.com|instagram\.com|x\.com|t\.co|twitter\.com|linkedin\.com|lnkd\.in|pinterest\.com|youtube\.com|tiktok\.com|threads\.net|bsky\.app|news\.ycombinator\.com|quora\.com|nextdoor\.com)$/;

/** Referrer → a coarse category; the referrer itself is never sent or stored. */
export function classifyReferrer(referrer: string, ownHost: string): Source {
  if (!referrer) return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (host === ownHost || host === `www.${ownHost}`) return 'internal';
  if (AI.test(host)) return 'ai';
  if (SEARCH.test(host)) return 'search';
  if (SOCIAL.test(host)) return 'social';
  return 'other';
}

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|python|node-fetch|axios/i;

export interface ParsedEvent {
  event: EventName;
  path: string;
  source: Source;
  segment: Segment;
}

/** Validates an incoming beacon. Returns null for anything malformed. */
export function parseEvent(body: unknown, userAgent: string): ParsedEvent | null {
  if (typeof body !== 'object' || body === null) return null;
  const { e, p, s, a } = body as Record<string, unknown>;
  if (typeof e !== 'string' || !(EVENTS as readonly string[]).includes(e)) return null;
  if (typeof s !== 'string' || !(SOURCES as readonly string[]).includes(s)) return null;
  // Site paths only: lowercase slugs ending in "/" (the site uses trailing slashes everywhere).
  if (typeof p !== 'string' || p.length > 100 || !/^\/([a-z0-9-]+\/)*$/.test(p)) return null;
  const segment: Segment = BOT_UA.test(userAgent) ? 'bot' : a === 1 ? 'automation' : 'real';
  return { event: e as EventName, path: p, source: s as Source, segment };
}
