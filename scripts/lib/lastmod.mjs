// Pure helpers for scripts/sitemap-lastmod.mjs: a page's <lastmod> is the day its visible <main>
// text last changed, so a template change (head tags, nav, footer, script hashes) does not make
// every page look updated. No I/O, so they are unit-tested.
import { createHash } from 'node:crypto';

/** The visible text of a page's <main> element (the whole page if it has none), whitespace collapsed. */
export function mainText(html) {
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? html;
  return main
    .replace(
      /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<template[\s\S]*?<\/template>/g,
      ' ',
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const textHash = (html) =>
  createHash('sha256').update(mainText(html)).digest('hex').slice(0, 16);

/**
 * The state after this build: a page keeps its recorded date while its hash is unchanged, and a
 * new or changed page gets `today`. Pages no longer in the sitemap drop out.
 */
export function nextLastmods(before, hashes, today) {
  return Object.fromEntries(
    Object.entries(hashes).map(([path, hash]) => [
      path,
      before[path]?.hash === hash ? before[path] : { hash, lastmod: today },
    ]),
  );
}

/** The sitemap with a <lastmod> after each <loc> whose path has a date. */
export function withLastmod(xml, state) {
  return xml.replace(
    /<loc>(https?:\/\/[^/<]+)(\/[^<]*)<\/loc>(?!<lastmod>)/g,
    (m, _origin, path) => (state[path] ? `${m}<lastmod>${state[path].lastmod}</lastmod>` : m),
  );
}
