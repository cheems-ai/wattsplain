// Parsers for the heating-fuel prices behind the heating cost calculator (EIA, public domain):
// - Natural gas: monthly residential price ($/Mcf) and residential consumption (MMcf) by state,
//   EIA Natural Gas Monthly via the Open Data API. We use the consumption-weighted average of the
//   last 12 months, which is dominated by the heating season, like a real gas bill.
// - Propane and No. 2 heating oil: weekly residential prices from EIA's State Heating Oil and
//   Propane Program (SHOPP; published October–March, so off-season the latest week is from March).
//   Not every state is surveyed: we fall back to the PADD region, then the U.S. average.
// - Space heating need: RECS 2020 Table CE8.15.M, average natural gas used for space heating per
//   gas-heated household, by state (million Btu).
// - Heated floor area: RECS 2020 Table HC10.9, average heated square footage by census division
//   and for gas-heated homes nationally, used to scale the typical home to the visitor's size.
import { readFirstSheet } from './xlsx.mjs';

export const GAS_SOURCE = 'https://www.eia.gov/naturalgas/monthly/';
export const SHOPP_SOURCE = 'https://www.eia.gov/petroleum/heatingoilpropane/';
export const RECS_URL =
  'https://www.eia.gov/consumption/residential/data/2020/c&e/xls/CE8.15.M.2020.AverageSpaceHeatingNaturalGasConsumption.xlsx';
export const RECS_AREA_URL =
  'https://www.eia.gov/consumption/residential/data/2020/hc/xls/HC%2010.9.xlsx';

/** Petroleum Administration for Defense Districts used by SHOPP, by state. */
export const PADD = {
  R1X: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'],
  R1Y: ['DE', 'DC', 'MD', 'NJ', 'NY', 'PA'],
  R1Z: ['FL', 'GA', 'NC', 'SC', 'VA', 'WV'],
  R20: ['IL', 'IN', 'IA', 'KS', 'KY', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'OK', 'SD', 'TN', 'WI'],
  R30: ['AL', 'AR', 'LA', 'MS', 'NM', 'TX'],
  R40: ['CO', 'ID', 'MT', 'UT', 'WY'],
  R50: ['AK', 'AZ', 'CA', 'HI', 'NV', 'OR', 'WA'],
};
const paddOf = (code) => Object.keys(PADD).find((r) => PADD[r].includes(code));

const api = (route, apiKey, params) =>
  `https://api.eia.gov/v2/${route}/data/?${new URLSearchParams({
    api_key: apiKey,
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'asc',
    length: '5000',
    ...params,
  })}`;

/** Never log these URLs: they contain the key. */
export const gasPriceUrl = (apiKey, start) =>
  api('natural-gas/pri/sum', apiKey, {
    frequency: 'monthly',
    'facets[process][]': 'PRS',
    start,
  });
export const gasVolumeUrl = (apiKey, start) =>
  api('natural-gas/cons/sum', apiKey, {
    frequency: 'monthly',
    'facets[process][]': 'VRS',
    start,
  });
export const gasAnnualUrl = (apiKey, startYear) =>
  api('natural-gas/pri/sum', apiKey, {
    frequency: 'annual',
    'facets[process][]': 'PRS',
    start: String(startYear),
  });
export const shoppUrl = (apiKey, start) =>
  api('petroleum/pri/wfr', apiKey, {
    frequency: 'weekly',
    'facets[process][]': 'PRS',
    start,
  });

const rowsOf = (json, label) => {
  const rows = json?.response?.data;
  if (!Array.isArray(rows)) throw new Error(`EIA API (${label}): response.data missing`);
  return rows;
};
const value = (r) => (r.value === null || r.value === undefined ? NaN : Number(r.value));
/** 'SPA' → 'PA', 'NUS' → 'US' */
const areaCode = (duoarea) => (duoarea === 'NUS' ? 'US' : duoarea.slice(1));
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

const addMonths = (period, n) => {
  const d = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Residential natural gas price per state ($/Mcf): the consumption-weighted average of the 12
 * months ending with the latest month the U.S. total is published, over the months EIA did not
 * withhold. A state with fewer than `minMonths` such months falls back to its latest annual price.
 */
export function parseGas(priceJson, volumeJson, annualJson, states, minMonths = 9) {
  const price = new Map();
  for (const r of rowsOf(priceJson, 'gas price')) {
    if (r.process === 'PRS' && Number.isFinite(value(r)))
      price.set(`${areaCode(r.duoarea)} ${r.period}`, value(r));
  }
  const volume = new Map();
  for (const r of rowsOf(volumeJson, 'gas volume')) {
    if (r.process === 'VRS' && Number.isFinite(value(r)) && value(r) > 0)
      volume.set(`${areaCode(r.duoarea)} ${r.period}`, value(r));
  }
  const latest = [...price.keys()]
    .filter((k) => k.startsWith('US ') && volume.has(k))
    .map((k) => k.slice(3))
    .sort()
    .at(-1);
  if (!latest) throw new Error('EIA API (gas): no U.S. month with price and volume');
  const window = Array.from({ length: 12 }, (_, i) => addMonths(latest, i - 11));

  const annual = new Map();
  for (const r of rowsOf(annualJson, 'gas annual')) {
    const code = areaCode(r.duoarea);
    const year = Number(r.period);
    if (r.process === 'PRS' && Number.isFinite(value(r)) && year > (annual.get(code)?.year ?? 0))
      annual.set(code, { year, price: value(r) });
  }

  const pick = (code) => {
    let money = 0;
    let mcf = 0;
    let months = 0;
    for (const p of window) {
      const k = `${code} ${p}`;
      if (!price.has(k) || !volume.has(k)) continue;
      money += price.get(k) * volume.get(k);
      mcf += volume.get(k);
      months++;
    }
    if (months >= minMonths) return { price: round(money / mcf), months };
    const a = annual.get(code);
    if (!a) throw new Error(`EIA gas price missing for ${code}`);
    return { price: a.price, year: a.year };
  };
  return {
    period: latest,
    from: window[0],
    us: pick('US'),
    byState: Object.fromEntries(states.map((s) => [s.code, pick(s.code)])),
  };
}

/**
 * Latest weekly SHOPP residential price ($/gal) of one product ('EPLLPA' propane, 'EPD2F' heating
 * oil) for every state: the state's own price, else its PADD region's, else the U.S. average.
 */
export function parseShopp(json, product, states) {
  const rows = rowsOf(json, `SHOPP ${product}`).filter(
    (r) => r.product === product && r.process === 'PRS' && Number.isFinite(value(r)),
  );
  const week = rows
    .filter((r) => r.duoarea === 'NUS')
    .map((r) => r.period)
    .sort()
    .at(-1);
  if (!week) throw new Error(`EIA API (SHOPP ${product}): no U.S. price`);
  const at = new Map(rows.filter((r) => r.period === week).map((r) => [r.duoarea, value(r)]));
  const pick = (code) => {
    if (at.has(`S${code}`)) return { price: at.get(`S${code}`), area: 'state' };
    const padd = paddOf(code);
    if (padd && at.has(padd)) return { price: at.get(padd), area: padd };
    return { price: at.get('NUS'), area: 'US' };
  };
  return {
    week,
    us: at.get('NUS'),
    byState: Object.fromEntries(states.map((s) => [s.code, pick(s.code)])),
  };
}

/**
 * RECS 2020 CE8.15.M → average gas used for space heating per gas-heated home (million Btu), by
 * state. Withheld states ('Q', e.g. Hawaii) take their census division's value.
 */
export function parseRecsHeating(buf, states) {
  const rows = readFirstSheet(buf);
  const annual = new Map();
  for (const r of rows) {
    if (typeof r[0] === 'string' && typeof r[2] === 'number') annual.set(r[0], r[2]);
  }
  if (!annual.has('All homes')) throw new Error('RECS CE8.15.M: "All homes" row not found');
  const pick = (s) => {
    if (annual.has(s.name)) return { mmbtu: annual.get(s.name) };
    if (annual.has(s.division)) return { mmbtu: annual.get(s.division), area: s.division };
    throw new Error(`RECS CE8.15.M: no value for ${s.name} or ${s.division}`);
  };
  return {
    survey: 2020,
    source: RECS_URL,
    us: annual.get('All homes'),
    byState: Object.fromEntries(states.map((s) => [s.code, pick(s)])),
  };
}

const DIVISIONS = [
  'New England',
  'Middle Atlantic',
  'East North Central',
  'West North Central',
  'South Atlantic',
  'East South Central',
  'West South Central',
  'Mountain',
  'Pacific',
];

/**
 * RECS 2020 HC10.9 → average heated square feet per home: all homes nationally, gas-heated homes
 * nationally (the "Main space heating fuel: Natural gas" row) and all homes by census division.
 */
export function parseRecsArea(buf) {
  const rows = readFirstSheet(buf);
  // Columns: label, housing units, total sq ft, heated sq ft, cooled sq ft, …
  const heated = (r) => (typeof r[3] === 'number' ? r[3] : undefined);
  const all = rows.find((r) => r[0] === 'All homes');
  const fuelAt = rows.findIndex((r) => r[0] === 'Main space heating fuel');
  const gas = fuelAt >= 0 ? rows.slice(fuelAt + 1).find((r) => r[0] === 'Natural gas') : undefined;
  if (!all || !heated(all) || !gas || !heated(gas))
    throw new Error('RECS HC10.9: "All homes" or gas-heated row not found');
  const byDivision = {};
  for (const d of DIVISIONS) {
    const r = rows.find((x) => x[0] === d);
    if (!r || !heated(r)) throw new Error(`RECS HC10.9: no heated area for ${d}`);
    byDivision[d] = heated(r);
  }
  return { source: RECS_AREA_URL, usAll: heated(all), usGas: heated(gas), byDivision };
}

/**
 * Sanity checks before new fuel prices replace the published ones: never older periods, and
 * every state's price inside a plausible range. Throws, so nothing is written.
 */
export function validateHeating(next, published) {
  const problems = [];
  if (published?.gas?.period && next.gas.period < published.gas.period)
    problems.push(
      `gas data ${next.gas.period} is older than the published ${published.gas.period}`,
    );
  for (const fuel of ['propane', 'oil'])
    if (published?.[fuel]?.week && next[fuel].week < published[fuel].week)
      problems.push(`${fuel} week ${next[fuel].week} is older than ${published[fuel].week}`);
  const ranges = { gas: [3, 80], propane: [0.5, 10], oil: [1, 10] };
  for (const [fuel, [lo, hi]] of Object.entries(ranges))
    for (const [code, v] of Object.entries(next[fuel].byState))
      if (!(v.price >= lo && v.price <= hi))
        problems.push(`${fuel} ${code} ${v.price} out of range`);
  if (problems.length)
    throw new Error(`Heating data failed validation:\n- ${problems.join('\n- ')}`);
}
