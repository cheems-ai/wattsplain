// Pure helpers for scripts/ops/site-audit.mjs: what a crawler can read from one page of HTML, and
// which of those facts are problems. No I/O, so they are unit-tested.

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");

/** Value of `attr` in the first tag matching `tagPattern` (attributes in any order). */
function attrOf(html, tagPattern, attr) {
  for (const m of html.matchAll(tagPattern)) {
    const v = new RegExp(`\\s${attr}=(?:"([^"]*)"|'([^']*)')`, 'i').exec(m[0]);
    if (v) return decode(v[1] ?? v[2] ?? '');
  }
  return null;
}

/** Visible text of the body without scripts, styles and tags, whitespace collapsed. */
export function visibleText(html) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return decode(
    body
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** The SEO-relevant facts of one HTML page. */
export function parsePage(html) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const jsonLd = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => {
    try {
      const data = JSON.parse(m[1]);
      return { ok: true, type: [].concat(data['@type'] ?? []).join(',') };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  const links = [
    ...new Set(
      [...html.matchAll(/<a\s[^>]*href="([^"#]*)(?:#[^"]*)?"/gi)].map((m) => decode(m[1])),
    ),
  ].filter(Boolean);
  const assets = [
    ...new Set(
      [
        ...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/gi),
        ...html.matchAll(/<link[^>]*\shref="([^"]+\.(?:css|js|svg|png|webp|ico|woff2))"/gi),
        ...html.matchAll(/<astro-island[^>]*?\scomponent-url="([^"]+)"/gi),
        ...html.matchAll(/<astro-island[^>]*?\srenderer-url="([^"]+)"/gi),
      ].map((m) => decode(m[1])),
    ),
  ];
  const text = visibleText(html);
  return {
    title: title === undefined ? null : decode(title.trim()),
    description: attrOf(html, /<meta\s[^>]*name="description"[^>]*>/gi, 'content'),
    canonical: attrOf(html, /<link\s[^>]*rel="canonical"[^>]*>/gi, 'href'),
    robots: attrOf(html, /<meta\s[^>]*name="robots"[^>]*>/gi, 'content'),
    h1: [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/gi)].length,
    jsonLd,
    links,
    assets,
    words: text ? text.split(' ').length : 0,
  };
}

/**
 * Problems with one sitemap page as `{ level: 'critical' | 'warn', message }`. `url` is the
 * sitemap URL, `res` the response facts `{ status, location, xRobotsTag, contentType }`.
 */
export function pageProblems(url, res, page) {
  const out = [];
  const critical = (message) => out.push({ level: 'critical', message });
  const warn = (message) => out.push({ level: 'warn', message });
  if (res.status !== 200) {
    critical(`HTTP ${res.status}${res.location ? ` -> ${res.location}` : ''}`);
    return out;
  }
  if (!/text\/html/i.test(res.contentType ?? '')) critical(`content-type ${res.contentType}`);
  if (/noindex/i.test(res.xRobotsTag ?? '')) critical(`X-Robots-Tag: ${res.xRobotsTag}`);
  if (/noindex/i.test(page.robots ?? '')) critical(`meta robots: ${page.robots}`);
  if (page.canonical !== url) critical(`canonical is ${page.canonical ?? 'missing'}`);
  if (!page.title) critical('no <title>');
  else if (page.title.length > 70) warn(`title is ${page.title.length} characters`);
  if (!page.description) warn('no meta description');
  else if (page.description.length > 165)
    warn(`description is ${page.description.length} characters`);
  if (page.h1 !== 1) warn(`${page.h1} <h1> elements`);
  for (const ld of page.jsonLd) if (!ld.ok) critical(`JSON-LD does not parse: ${ld.error}`);
  if (page.words < 150) warn(`only ${page.words} words of server-rendered text`);
  return out;
}

/** Internal links of a page as absolute same-origin URLs without query or hash. */
export function internalLinks(links, pageUrl, origin) {
  const out = new Set();
  for (const href of links) {
    if (/^(mailto|tel|javascript|data):/i.test(href)) continue;
    let u;
    try {
      u = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue;
    out.add(`${u.origin}${u.pathname}`);
  }
  return [...out];
}

/**
 * The HTML the deploy should serve, normalised for comparison with production: Cloudflare may
 * inject its Web Analytics beacon and rewrite email links at the edge, and Astro gives each island a
 * random uid on every build.
 */
export function normaliseForCompare(html) {
  return String(html)
    .replace(/<script[^>]*static\.cloudflareinsights\.com[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*email-decode[\s\S]*?<\/script>/gi, '')
    .replace(/(<astro-island[^>]*?\s)uid="[^"]*"/gi, '$1uid=""')
    .replace(/\s+/g, ' ')
    .trim();
}
