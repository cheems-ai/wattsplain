// Pure helpers for scripts/ops/seo-weekly.mjs: compare two `npm run gsc:snapshot` folders with the
// same dimensions, so a week-over-week review never mixes aggregation types (property vs page vs
// query, see docs/seo/baseline-*.md in the project folder).

/** Parses the snapshot CSVs written by gsc-snapshot.mjs (quoted cells allowed). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) rows.push([...row, cell]);
  const [head, ...body] = rows;
  return body.map((r) =>
    Object.fromEntries(
      head.map((h, i) => [
        h,
        ['clicks', 'impressions', 'ctr', 'position'].includes(h) ? Number(r[i]) : r[i],
      ]),
    ),
  );
}

/** Clicks, impressions and impression-weighted position of rows. */
export function sum(rows) {
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const position = impressions
    ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
    : null;
  return { clicks, impressions, position };
}

/**
 * Row-by-row comparison on `key` (e.g. 'page'). Each entry: before/after sums and whether the
 * sample is big enough to read anything into a position change (both sides ≥ minImpressions).
 */
export function compareBy(before, after, key, { minImpressions = 10 } = {}) {
  const keys = new Set([...before, ...after].map((r) => r[key]));
  return [...keys]
    .map((k) => {
      const b = sum(before.filter((r) => r[key] === k));
      const a = sum(after.filter((r) => r[key] === k));
      return {
        key: k,
        before: b,
        after: a,
        readable: b.impressions >= minImpressions && a.impressions >= minImpressions,
      };
    })
    .sort((x, y) => y.after.impressions - x.after.impressions || x.key.localeCompare(y.key));
}

/** Impressions of query rows by position band (query aggregation, visible queries only). */
export function bands(rows) {
  const out = { '1-10': 0, '11-20': 0, '21-50': 0, '51+': 0 };
  for (const r of rows) {
    const b =
      r.position <= 10 ? '1-10' : r.position <= 20 ? '11-20' : r.position <= 50 ? '21-50' : '51+';
    out[b] += r.impressions;
  }
  return out;
}

/** Rows whose `page` falls in an experiment cohort (prefix or exact paths). */
export const cohort = (rows, paths) =>
  rows.filter((r) =>
    paths.some((p) => {
      const path = r.page.replace(/^https:\/\/wattsplain\.com/, '');
      return p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p;
    }),
  );
