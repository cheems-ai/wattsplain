// Typed access to src/data/heating.json (fuel prices, `npm run data:heating`) and
// src/data/heat-need.json (RECS 2020, `npm run data:recs`), combined with electricity prices.
import {
  cheapestOf,
  compareSystems,
  heatNeed,
  typicalGasHomeArea,
  type SystemCost,
  type SystemId,
} from '../lib/heating.ts';
import { ELECTRICITY, HISTORY, STATE_ROWS } from './electricity.ts';
import raw from './heating.json';
import need from './heat-need.json';
import type { State } from './states.ts';

interface FuelPrice {
  price: number;
  /** Where a state's price came from when EIA does not survey the state itself. */
  area?: string;
  /** Natural gas: number of the last 12 months averaged, or the year of the annual fallback. */
  months?: number;
  year?: number;
}

export const HEATING = {
  fetchedAt: raw.fetchedAt,
  gas: raw.gas,
  propane: raw.propane,
  oil: raw.oil,
  recs: { survey: need.survey, source: need.source, us: need.us },
  area: need.area,
};

/** SHOPP regions (PADDs and the PADD 1 subdistricts) a state's price may fall back to. */
const PADD_NAMES: Record<string, string> = {
  R1X: 'New England',
  R1Y: 'Central Atlantic',
  R1Z: 'Lower Atlantic',
  R20: 'Midwest',
  R30: 'Gulf Coast',
  R40: 'Rocky Mountain',
  R50: 'West Coast',
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Electricity price for a whole heating season: the simple average of the last 12 months when
 * the history is available (prices move with the seasons), else the latest month.
 */
export const ELECTRIC_BASIS = HISTORY
  ? { label: '12-month average', from: HISTORY.periods.at(-12)!, to: HISTORY.periods.at(-1)! }
  : { label: 'latest month', from: ELECTRICITY.monthly.period, to: ELECTRICITY.monthly.period };

/** Human description of where a fallback price came from, e.g. "Midwest average". */
export const areaLabel = (area: string | undefined): string | undefined =>
  !area || area === 'state'
    ? undefined
    : area === 'US'
      ? 'U.S. average'
      : `${PADD_NAMES[area] ?? 'regional'} average`;

export interface HeatingRow extends State {
  prices: Record<SystemId, number>;
  /** Fallback labels for prices that are not the state's own. */
  notes: Partial<Record<SystemId, string>>;
  gas: FuelPrice;
  /** Delivered heat of a typical gas-heated home, million Btu a year. */
  heat: number;
  /** RECS value came from the census division (Hawaii). */
  heatFromDivision: boolean;
  /** Heated floor area of the typical gas-heated home it is based on, sq ft (see typicalGasHomeArea). */
  typicalSqft: number;
  costs: SystemCost[];
  /** Systems priced at the U.S. average because EIA has no state or regional price. */
  national: SystemId[];
  /** Cheapest system among those with a state or regional price. */
  cheapest: SystemCost;
}

export const HEATING_ROWS: readonly HeatingRow[] = STATE_ROWS.map((s) => {
  const gas = raw.gas.byState[s.code as keyof typeof raw.gas.byState] as FuelPrice;
  const propane = raw.propane.byState[s.code as keyof typeof raw.propane.byState] as FuelPrice;
  const oil = raw.oil.byState[s.code as keyof typeof raw.oil.byState] as FuelPrice;
  const recs = need.byState[s.code as keyof typeof need.byState] as {
    mmbtu: number;
    area?: string;
  };
  if (!gas || !propane || !oil || !recs) throw new Error(`heating data missing for ${s.code}`);
  const electric = HISTORY ? mean(HISTORY.byState[s.code]!.slice(-12)) : s.price;
  const prices: Record<SystemId, number> = {
    'heat-pump': electric,
    electric,
    gas: gas.price,
    propane: propane.price,
    oil: oil.price,
  };
  const notes: HeatingRow['notes'] = {};
  const p = areaLabel(propane.area);
  const o = areaLabel(oil.area);
  if (p) notes.propane = p;
  if (o) notes.oil = o;
  if (gas.year) notes.gas = `${gas.year} average`;
  const heat = heatNeed(recs.mmbtu);
  const national = (['propane', 'oil'] as const).filter(
    (id) => ({ propane, oil })[id].area === 'US',
  );
  const costs = compareSystems(heat, prices);
  return {
    code: s.code,
    name: s.name,
    slug: s.slug,
    division: s.division,
    prices,
    notes,
    gas,
    heat,
    heatFromDivision: Boolean(recs.area),
    typicalSqft: typicalGasHomeArea(
      need.area.byDivision[s.division as keyof typeof need.area.byDivision],
      need.area.usAll,
      need.area.usGas,
    ),
    costs,
    national,
    cheapest: cheapestOf(costs, national),
  };
});

export const heatingRow = (code: string): HeatingRow | undefined =>
  HEATING_ROWS.find((r) => r.code === code);

/** Minimal shape passed to the calculator in the browser. */
export const HEATING_OPTIONS = HEATING_ROWS.map((r) => ({
  code: r.code,
  name: r.name,
  prices: r.prices,
  notes: r.notes,
  national: r.national,
  heat: r.heat,
  typicalSqft: r.typicalSqft,
  division: r.division,
})).sort((a, b) => a.name.localeCompare(b.name));
export type HeatingOption = (typeof HEATING_OPTIONS)[number];
