// Residential electricity prices by utility from EIA Form 861M ("Sales to Ultimate Customers",
// monthly, the larger utilities of every state). EIA computes no utility prices in this file; we
// divide residential revenue by residential sales, the same definition EIA uses for its state
// averages (revenue per kWh, including fixed charges, taxes and fees: not a tariff rate). See
// https://www.eia.gov/tools/faqs/faq.php?id=507&t=3.
//
// Utility rows cover full-service ("bundled") customers. Energy-only and delivery-only service
// (customers who buy supply from a retail supplier in choice states) and the utilities outside the
// monthly sample are folded into EIA's "State Adjustment" row, which we never show as a utility.
import { readFirstSheet } from './xlsx.mjs';

export const UTILITY_SOURCE = 'https://www.eia.gov/electricity/data/eia861m/';
export const utilityUrls = (year) => [
  `https://www.eia.gov/electricity/data/eia861m/xls/sales_ult_cust_${year}.xlsx`,
  `https://www.eia.gov/electricity/data/eia861m/archive/xls/sales_ult_cust_${year}.xlsx`,
];

const OWNERSHIP = {
  'Investor Owned': 'Investor-owned',
  Cooperative: 'Co-op',
  Municipal: 'City-owned',
  'Political Subdivision': 'Public power district',
  State: 'State-owned',
  Federal: 'Federal',
};
const MAX_PER_STATE = 12;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const periodOf = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const shift = (period, months) => {
  const [y, m] = period.split('-').map(Number);
  const n = y * 12 + (m - 1) + months;
  return periodOf(Math.floor(n / 12), (n % 12) + 1);
};

/**
 * Rows of a sales_ult_cust_YYYY.xlsx sheet → residential records. Kinds: 'utility', 'total'
 * (EIA's state total) or 'adjustment'. Withheld values (".") become null.
 */
export function parseUtilitySheet(rows) {
  const header = rows.findIndex((r) => r[0] === 'Year' && r[3] === 'Utility Name');
  if (header < 0) throw new Error('EIA-861M: header row not found');
  if (rows[header - 1]?.[7] !== 'Revenue' || rows[header - 2]?.[7] !== 'RESIDENTIAL')
    throw new Error('EIA-861M: residential columns moved');
  const out = [];
  for (const r of rows.slice(header + 1)) {
    const [year, month, id, name, state, ownership] = r;
    if (typeof year !== 'number' || typeof month !== 'number' || typeof state !== 'string')
      continue;
    const kind =
      name === 'State Total'
        ? 'total'
        : /^State Adjustment/.test(String(name))
          ? 'adjustment'
          : 'utility';
    out.push({
      period: periodOf(year, month),
      id: Number(id),
      name: String(name).trim(),
      state,
      ownership: String(ownership ?? ''),
      kind,
      revenue: num(r[7]),
      sales: num(r[8]),
      customers: num(r[9]),
    });
  }
  return out;
}

const price = (revenue, sales) =>
  revenue !== null && sales !== null && sales > 0 ? (revenue / sales) * 100 : null;
const plausible = (p) => p !== null && p >= 3 && p <= 100;
const round2 = (x) => (x === null ? null : Math.round(x * 100) / 100);

/**
 * Records (from one or more years) → per-state utility prices for the latest month every state
 * reports. For each utility: the latest month's price, the same month a year earlier, and the
 * 12-month price (12 months' revenue over 12 months' sales), each null when a month is missing,
 * withheld or implausible.
 */
export function buildUtilities(records, states, fetchedAt, choice = null) {
  const totals = records.filter((r) => r.kind === 'total');
  const periods = [...new Set(totals.map((r) => r.period))].sort();
  const codes = states.map((s) => s.code);
  const period = periods
    .filter((p) => codes.every((c) => totals.some((t) => t.period === p && t.state === c)))
    .at(-1);
  if (!period) throw new Error('EIA-861M: no month with a total for every state');
  const last12 = Array.from({ length: 12 }, (_, i) => shift(period, -i));
  const byKey = new Map();
  for (const r of records) byKey.set(`${r.state}|${r.id}|${r.kind}|${r.period}`, r);
  const get = (state, id, kind, p) => byKey.get(`${state}|${id}|${kind}|${p}`);

  const result = {};
  for (const code of codes) {
    const total =
      get(code, 88888, 'total', period) ??
      totals.find((t) => t.state === code && t.period === period);
    const rows = records.filter(
      (r) =>
        r.state === code &&
        r.period === period &&
        r.kind === 'utility' &&
        OWNERSHIP[r.ownership] &&
        (r.customers ?? 0) > 0,
    );
    const utilities = [];
    for (const r of rows) {
      const now = price(r.revenue, r.sales);
      if (!plausible(now)) continue;
      const ago = get(code, r.id, 'utility', shift(period, -12));
      const yearAgo = ago ? price(ago.revenue, ago.sales) : null;
      const months = last12.map((p) => get(code, r.id, 'utility', p));
      const complete = months.every((m) => m && m.revenue !== null && (m.sales ?? 0) > 0);
      const avg12 = complete
        ? price(
            months.reduce((s, m) => s + m.revenue, 0),
            months.reduce((s, m) => s + m.sales, 0),
          )
        : null;
      utilities.push({
        id: r.id,
        name: r.name,
        ownership: OWNERSHIP[r.ownership],
        customers: r.customers,
        price: round2(now),
        priceYearAgo: plausible(yearAgo) ? round2(yearAgo) : null,
        price12: plausible(avg12) ? round2(avg12) : null,
      });
    }
    utilities.sort((a, b) => b.customers - a.customers || a.name.localeCompare(b.name));
    const shown = utilities.slice(0, MAX_PER_STATE);
    const totalCustomers = total?.customers ?? 0;
    result[code] = {
      statePrice: round2(price(total?.revenue ?? null, total?.sales ?? null)),
      customers: totalCustomers,
      shownShare:
        totalCustomers > 0
          ? Math.round((shown.reduce((s, u) => s + u.customers, 0) / totalCustomers) * 1000) / 1000
          : 0,
      choiceShare: choice?.states[code]?.choiceShare ?? null,
      utilities: shown,
    };
  }
  return {
    source: UTILITY_SOURCE,
    fetchedAt,
    period,
    priorPeriod: shift(period, -12),
    choice: choice ? { year: choice.year, source: choice.source } : null,
    states: result,
  };
}

/**
 * Refuses a dataset that would mislead: every state needs at least one utility, and when the
 * month matches Table 5.6.A (electricity.json) EIA's 861M state total must equal that price.
 * Never goes backwards in time against the published file.
 */
export function validateUtilities(next, electricity, published) {
  const problems = [];
  for (const [code, s] of Object.entries(next.states)) {
    if (s.utilities.length === 0) problems.push(`${code}: no utility rows`);
    if (next.period === electricity.monthly.period) {
      const table = electricity.states.find((x) => x.code === code)?.price;
      if (table === undefined || s.statePrice === null || Math.abs(table - s.statePrice) > 0.02)
        problems.push(`${code}: 861M total ${s.statePrice}¢ ≠ Table 5.6.A ${table}¢`);
    }
  }
  if (!next.choice) problems.push('no EIA-861 retail-choice shares');
  else
    for (const [code, s] of Object.entries(next.states))
      if (s.choiceShare === null || !(s.choiceShare >= 0 && s.choiceShare < 1))
        problems.push(`${code}: retail-choice share missing or out of range`);
  if (published && next.period < published.period)
    problems.push(`period ${next.period} is older than the published ${published.period}`);
  if (problems.length)
    throw new Error(`EIA-861M data failed validation:\n- ${problems.join('\n- ')}`);
}

export const ANNUAL_SOURCE = 'https://www.eia.gov/electricity/data/eia861/';
export const annualZipUrls = (year) => [
  `https://www.eia.gov/electricity/data/eia861/zip/f861${year}.zip`,
  `https://www.eia.gov/electricity/data/eia861/archive/zip/f861${year}.zip`,
];

/**
 * EIA-861 annual Sales_Ult_Cust sheet → per state, the share of residential customers who buy
 * their electricity supply from someone other than a full-service utility: delivery-only
 * customers (Part C: their supplier is a retail marketer or a community aggregation) plus homes
 * served bundled by retail providers (Part D, the Texas competitive area). Part A is bundled
 * utility service; Part B (energy only) counts the same homes as Part C, so it is left out.
 */
export function parseChoiceShares(rows) {
  const header = rows.findIndex((r) => r[0] === 'Data Year' && r[3] === 'Part');
  if (header < 0) throw new Error('EIA-861 Sales_Ult_Cust: header row not found');
  if (rows[header - 1]?.[11] !== 'Customers' || rows[header - 2]?.[9] !== 'RESIDENTIAL')
    throw new Error('EIA-861 Sales_Ult_Cust: residential columns moved');
  const by = {};
  let year = null;
  for (const r of rows.slice(header + 1)) {
    const [y, , , part, , , state] = r;
    if (typeof y !== 'number' || typeof state !== 'string') continue;
    year = y;
    const n = num(r[11]) ?? 0;
    by[state] ??= { A: 0, C: 0, D: 0 };
    if (part in by[state]) by[state][part] += n;
  }
  const states = {};
  for (const [code, p] of Object.entries(by)) {
    const homes = p.A + p.C + p.D;
    if (homes > 0)
      states[code] = { homes, choiceShare: Math.round(((p.C + p.D) / homes) * 1000) / 1000 };
  }
  return { year, source: ANNUAL_SOURCE, states };
}

export { readFirstSheet };
