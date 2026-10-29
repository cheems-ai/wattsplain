// Typed access to src/data/electricity.json (refreshed by `npm run data:eia`).
import { pctChange } from '../lib/energy.ts';
import raw from './electricity.json';
import { STATES, type State } from './states.ts';

export interface StatePrices {
  /** Residential price in the latest EIA month, cents/kWh (preliminary). */
  price: number;
  /** Same month a year earlier, cents/kWh. */
  pricePrior: number;
  /** Annual averages for `ELECTRICITY.annual.year`. */
  avgKwh: number;
  avgPriceAnnual: number;
  avgBillAnnual: number;
}

export interface StateRow extends State, StatePrices {
  change: number;
  rank: number;
}

export const ELECTRICITY = {
  fetchedAt: raw.fetchedAt,
  monthly: raw.monthly,
  annual: raw.annual,
  us: { ...raw.us, change: pctChange(raw.us.price, raw.us.pricePrior) },
};

const byPrice = [...raw.states].sort((a, b) => b.price - a.price);

/** All states, with the year-over-year change and the rank by price (1 = most expensive). */
export const STATE_ROWS: readonly StateRow[] = STATES.map((s) => {
  const d = raw.states.find((x) => x.code === s.code);
  if (!d) throw new Error(`electricity.json has no row for ${s.code}`);
  return {
    ...s,
    ...d,
    change: pctChange(d.price, d.pricePrior),
    rank: byPrice.findIndex((x) => x.code === s.code) + 1,
  };
});

export const stateRow = (code: string): StateRow | undefined =>
  STATE_ROWS.find((s) => s.code === code);

export interface History {
  periods: string[];
  us: number[];
  byState: Record<string, number[]>;
  source: string;
}

/** 24 months of monthly prices (present when the data was fetched with an EIA API key). */
export const HISTORY: History | undefined = (raw as { history?: History }).history;

export interface StateTrend {
  periods: string[];
  values: number[];
  us: number[];
  /** Simple average of this year's months so far vs the same months last year (cents/kWh). */
  ytd: { year: string; months: number; avg: number; avgPrior: number; change: number };
  /** Highest and lowest monthly price in the last 12 months. */
  high: { period: string; price: number };
  low: { period: string; price: number };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const stateTrend = (code: string): StateTrend | undefined =>
  HISTORY ? computeTrend(HISTORY, code) : undefined;

export function computeTrend(
  history: Omit<History, 'source'>,
  code: string,
): StateTrend | undefined {
  const values = history.byState[code];
  if (!values) return undefined;
  const { periods } = history;
  const year = periods.at(-1)!.slice(0, 4);
  const priorYear = String(Number(year) - 1);
  const now: number[] = [];
  const before: number[] = [];
  periods.forEach((p, i) => {
    if (!p.startsWith(year)) return;
    const j = periods.indexOf(`${priorYear}${p.slice(4)}`);
    if (j < 0) return;
    now.push(values[i]!);
    before.push(values[j]!);
  });
  const last12 = periods
    .slice(-12)
    .map((period, k) => ({ period, price: values[periods.length - 12 + k]! }));
  const sorted = [...last12].sort((a, b) => a.price - b.price);
  return {
    periods,
    values,
    us: history.us,
    ytd: {
      year,
      months: now.length,
      avg: mean(now),
      avgPrior: mean(before),
      change: pctChange(mean(now), mean(before)),
    },
    high: sorted.at(-1)!,
    low: sorted[0]!,
  };
}

/** Minimal shape passed to the calculators in the browser. */
export const RATE_OPTIONS = STATE_ROWS.map((s) => ({
  code: s.code,
  name: s.name,
  price: s.price,
  avgKwh: s.avgKwh,
})).sort((a, b) => a.name.localeCompare(b.name));
export type RateOption = (typeof RATE_OPTIONS)[number];

export interface PriceChange {
  code: string;
  /** Average of the last 12 monthly prices and of the 12 before them, cents/kWh. */
  avg12: number;
  avgPrior12: number;
  change12: number;
  /** Latest month vs the same month a year earlier, percent. */
  changeMonth: number;
  /** What the 12-month change means for a month of `avgKwh` use, dollars. */
  billEffect: number;
}

/**
 * Twelve-month average price vs the twelve months before, per state: steadier than one month
 * against the same month a year earlier, which swings with fuel costs and billing adjustments.
 * Needs 24 months of history; sorted from the largest rise to the largest fall.
 */
export function computeChanges(
  history: Omit<History, 'source'>,
  avgKwh: Record<string, number>,
): PriceChange[] {
  const n = history.periods.length;
  if (n < 24) throw new Error(`price changes need 24 months of history, got ${n}`);
  const row = (code: string, values: number[]): PriceChange => {
    const avg12 = mean(values.slice(n - 12));
    const avgPrior12 = mean(values.slice(n - 24, n - 12));
    return {
      code,
      avg12,
      avgPrior12,
      change12: pctChange(avg12, avgPrior12),
      changeMonth: pctChange(values[n - 1]!, values[n - 13]!),
      billEffect: ((avg12 - avgPrior12) * (avgKwh[code] ?? 0)) / 100,
    };
  };
  return Object.entries(history.byState)
    .map(([code, values]) => row(code, values))
    .sort((a, b) => b.change12 - a.change12);
}

/** Every state's 12-month price change (empty without the 24-month history). */
export const PRICE_CHANGES: readonly PriceChange[] = HISTORY
  ? computeChanges(HISTORY, Object.fromEntries(STATE_ROWS.map((s) => [s.code, s.avgKwh])))
  : [];

/** The same comparison for the U.S. average, at U.S. average use. */
export const US_PRICE_CHANGE: PriceChange | undefined = HISTORY
  ? computeChanges({ ...HISTORY, byState: { US: HISTORY.us } }, { US: raw.us.avgKwh })[0]
  : undefined;

/**
 * States served wholly or partly by PJM Interconnection, the grid operator for 13 states and DC
 * (https://www.pjm.com/about-pjm/who-we-are/territory-served).
 */
export const PJM_STATES: ReadonlySet<string> = new Set([
  'DE',
  'IL',
  'IN',
  'KY',
  'MD',
  'MI',
  'NJ',
  'NC',
  'OH',
  'PA',
  'TN',
  'VA',
  'WV',
  'DC',
]);
