// Parsers for the two EIA tables the site is built on (public domain, U.S. government data):
// - Electric Power Monthly Table 5.6.A: average residential price by state, latest month vs the
//   same month a year earlier (cents/kWh, latest year preliminary).
// - Electric Sales, Revenue, and Price Table 5A: annual residential average monthly consumption,
//   price and bill by state.
import { readFirstSheet } from './xlsx.mjs';

export const MONTHLY_URL =
  'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a';
export const ANNUAL_URL = 'https://www.eia.gov/electricity/sales_revenue_price/xls/table_5A.xlsx';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const cellText = (html) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

const toNumber = (s) => {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Table 5.6.A → { period: 'YYYY-MM', priorPeriod, rows: Map<label, { price, pricePrior }> } */
export function parseMonthlyTable(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => cellText(c[1])),
  );
  const header = rows.find((r) => /State/.test(r[0] ?? '') && r.length >= 3);
  if (!header) throw new Error('Table 5.6.A: header row not found');
  const period = (label) => {
    const m = /^(\w+) (\d{4})$/.exec(label ?? '');
    const month = m ? MONTHS.indexOf(m[1]) + 1 : 0;
    if (!m || month === 0) throw new Error(`Table 5.6.A: unexpected period "${label}"`);
    return `${m[2]}-${String(month).padStart(2, '0')}`;
  };
  // Columns: label, Residential latest, Residential prior, Commercial..., so residential is 1–2.
  const result = { period: period(header[1]), priorPeriod: period(header[2]), rows: new Map() };
  for (const r of rows) {
    const price = toNumber(r[1]);
    const pricePrior = toNumber(r[2]);
    if (r.length >= 3 && price !== null && pricePrior !== null) {
      result.rows.set(r[0], { price, pricePrior });
    }
  }
  return result;
}

/** Table 5A → { year, rows: Map<label, { customers, avgKwh, avgPrice, avgBill }> } */
export function parseAnnualTable(buf) {
  const rows = readFirstSheet(buf);
  const year = Number(/^(\d{4})/.exec(String(rows[0]?.[0] ?? ''))?.[1]);
  if (!year) throw new Error('Table 5A: year not found in title');
  const result = { year, rows: new Map() };
  for (const r of rows) {
    const [label, customers, avgKwh, avgPrice, avgBill] = r;
    if (
      typeof label === 'string' &&
      [customers, avgKwh, avgPrice, avgBill].every((v) => typeof v === 'number')
    ) {
      result.rows.set(label, { customers, avgKwh, avgPrice, avgBill });
    }
  }
  return result;
}

/**
 * EIA API v2 query for monthly residential prices of every state since `start` ('YYYY-MM').
 * The key comes from the EIA_API_KEY environment variable (site/.env); never log this URL.
 */
export function historyUrl(apiKey, start) {
  const q = new URLSearchParams({
    api_key: apiKey,
    frequency: 'monthly',
    'data[0]': 'price',
    'facets[sectorid][]': 'RES',
    start,
    'sort[0][column]': 'period',
    'sort[0][direction]': 'asc',
    length: '5000',
  });
  return `https://api.eia.gov/v2/electricity/retail-sales/data/?${q}`;
}
export const HISTORY_SOURCE = 'https://www.eia.gov/opendata/browser/electricity/retail-sales';

/**
 * API response → { periods, us, byState } holding the last `months` months that have a price for
 * every state and the U.S. ('US'). Throws if a state is missing, like buildDataset.
 */
export function parseHistory(json, states, months = 24) {
  const rows = json?.response?.data;
  if (!Array.isArray(rows)) throw new Error('EIA API: response.data missing');
  const prices = new Map();
  for (const r of rows) {
    const price = r.price === null || r.price === undefined ? NaN : Number(r.price);
    if (r.sectorid !== 'RES' || !Number.isFinite(price)) continue;
    prices.set(`${r.stateid} ${r.period}`, price);
  }
  const codes = ['US', ...states.map((s) => s.code)];
  const complete = [...new Set(rows.map((r) => r.period))]
    .filter((p) => /^\d{4}-\d{2}$/.test(p) && codes.every((c) => prices.has(`${c} ${p}`)))
    .sort();
  if (complete.length < 13) throw new Error(`EIA API: only ${complete.length} complete months`);
  const periods = complete.slice(-months);
  const series = (code) => periods.map((p) => prices.get(`${code} ${p}`));
  return {
    periods,
    us: series('US'),
    byState: Object.fromEntries(states.map((s) => [s.code, series(s.code)])),
  };
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Combines both tables for the given state list ({ code, name }[]). Throws if any state is
 * missing, so a changed EIA layout fails the update instead of publishing a partial dataset.
 */
export function buildDataset(monthly, annual, states, fetchedAt, history = null) {
  const pick = (label) => {
    const m = monthly.rows.get(label);
    const a = annual.rows.get(label);
    if (!m || !a) throw new Error(`EIA data missing for "${label}"`);
    return {
      price: m.price,
      pricePrior: m.pricePrior,
      avgKwh: round(a.avgKwh, 0),
      avgPriceAnnual: round(a.avgPrice),
      avgBillAnnual: round(a.avgBill),
    };
  };
  return {
    fetchedAt,
    monthly: { period: monthly.period, priorPeriod: monthly.priorPeriod, source: MONTHLY_URL },
    annual: { year: annual.year, source: ANNUAL_URL },
    us: pick('U.S. Total'),
    states: states.map((s) => ({ code: s.code, ...pick(s.name) })),
    ...(history ? { history: { ...history, source: HISTORY_SOURCE } } : {}),
  };
}

/** True when two datasets differ in anything but the date they were fetched. */
export function dataChanged(before, after) {
  const strip = (d) => JSON.stringify({ ...d, fetchedAt: undefined });
  return strip(before) !== strip(after);
}
