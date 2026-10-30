#!/usr/bin/env node
// Post-build checks on dist/: every page has a title, description, canonical and one h1, and the
// visible text has no words glued to numbers or punctuation (Astro/Prettier can drop the space
// between text and an {expression} on the next line).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.html')) files.push(p);
  }
})('dist');

const GLUED =
  /[a-z]{2,}\$\d|\d¢[a-z]|[,;:][A-Za-z]{2,}|\)[A-Za-z]{2,}|[a-z]—|—[A-Za-z$]|·[A-Za-z]|[A-Za-z]·|[a-z]{2,}[.!?][A-Z][a-z]/;
// Empty elements (colour keys like <i class="key"></i>) carry no text and are skipped.
const EMPTY = /<(i|span)\b[^>]*><\/\1>/g;
const INLINE =
  /[A-Za-z0-9.,;:)]<(?:a|strong|span|em|code|i)\b|<\/(?:a|strong|span|em|code|i)>[A-Za-z0-9(]/;
const problems = [];
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  const need = [
    [/<title>[^<]+<\/title>/, 'title'],
    [/<meta name="description" content="[^"]+"/, 'description'],
    [/<link rel="canonical" href="[^"]+"/, 'canonical'],
    [/<meta property="og:image" content="https:\/\/[^"]+"/, 'og:image'],
  ];
  for (const [rx, what] of need) if (!rx.test(html)) problems.push(`${f}: missing ${what}`);
  // Text running straight into an inline element: Astro drops a line break between the two.
  // Charts are SVG labels, not prose (each chart has a text alternative).
  const raw = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '')
    .replace(EMPTY, '');
  const inline = INLINE.exec(raw);
  if (inline)
    problems.push(
      `${f}: text glued to an inline tag near "${raw.slice(inline.index - 30, inline.index + 30)}"`,
    );
  // JSON-LD must parse, and a Dataset needs the fields Search Console flags when they are missing.
  for (const [, json] of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )) {
    let item;
    try {
      item = JSON.parse(json);
    } catch {
      problems.push(`${f}: JSON-LD does not parse`);
      continue;
    }
    if (item['@type'] === 'Dataset')
      for (const k of ['name', 'description', 'license', 'creator'])
        if (!item[k]) problems.push(`${f}: Dataset JSON-LD missing ${k}`);
  }
  const h1 = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1 !== 1) problems.push(`${f}: ${h1} h1 elements`);
  // Visible text only: drop scripts, islands' serialized props and tags (tags become nothing, so
  // a missing space between two inline elements is caught too).
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<astro-island[^>]*>/g, ' ')
    .replace(
      /<\/?(p|li|td|th|tr|h\d|div|caption|nav|header|footer|main|section|ul|table|tbody|thead|option|label|legend)[^>]*>/g,
      ' ',
    )
    .replace(/<[^>]+>/g, '');
  const m = GLUED.exec(text);
  if (m)
    problems.push(
      `${f}: glued text "${text.slice(Math.max(0, m.index - 20), m.index + 20).trim()}"`,
    );
}
// Every page is in the sitemap and every sitemap URL is a page (404.html is neither).
const sitemap = new Set(
  [
    ...readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>https:\/\/[^/]+(\/[^<]*)<\/loc>/g),
  ].map((m) => m[1]),
);
const pages = new Set(
  files
    .map((f) =>
      f
        .replace(/\\/g, '/')
        .replace(/^dist/, '')
        .replace(/index\.html$/, ''),
    )
    .filter((p) => p !== '/404.html'),
);
for (const p of pages) if (!sitemap.has(p)) problems.push(`${p}: missing from sitemap.xml`);
const undated = (
  readFileSync('dist/sitemap.xml', 'utf8').match(
    /<\/loc>(?!<lastmod>\d{4}-\d\d-\d\d<\/lastmod>)/g,
  ) ?? []
).length;
if (undated) problems.push(`sitemap.xml: ${undated} URL(s) without <lastmod>`);
for (const p of sitemap)
  if (!pages.has(p)) problems.push(`sitemap.xml lists ${p}, which is not a page`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check-dist: ${files.length} pages OK`);
