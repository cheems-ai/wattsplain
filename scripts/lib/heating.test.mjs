import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { STATES } from '../../src/data/states.ts';
import { PADD, parseGas, parseRecsArea, parseRecsHeating, parseShopp } from './heating.mjs';

// Saved copies of real EIA API responses (trimmed to the fields we read, no key) and RECS 2020
// Table CE8.15.M. Gas: monthly Aug 2024 – Jul 2026 and annual 2023–2025; SHOPP: Oct 2026 weeks.
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const json = (name) => JSON.parse(fixture(name).toString('utf8'));
const gasPrice = json('eia-api-gas-price-monthly.json');
const gasVolume = json('eia-api-gas-volume-monthly.json');
const gasAnnual = json('eia-api-gas-price-annual.json');
const shopp = json('eia-api-shopp-weekly.json');

describe('PADD', () => {
  it('puts every state in exactly one region', () => {
    const all = Object.values(PADD).flat();
    expect(all).toHaveLength(51);
    expect(new Set(all)).toEqual(new Set(STATES.map((s) => s.code)));
  });
});

describe('parseGas', () => {
  const gas = parseGas(gasPrice, gasVolume, gasAnnual, STATES);

  it('averages the 12 months ending with the latest U.S. month', () => {
    expect(gas.period).toBe('2026-07');
    expect(gas.from).toBe('2025-08');
    expect(gas.us).toEqual({ price: 16.34, months: 12 });
  });

  it('weights each month by the gas sold, so winter prices dominate', () => {
    const rows = (j, code) => j.response.data.filter((r) => r.duoarea === `S${code}`);
    const months = rows(gasPrice, 'PA')
      .filter((r) => r.period >= '2025-08')
      .map((r) => ({
        price: Number(r.value),
        mcf: Number(rows(gasVolume, 'PA').find((v) => v.period === r.period).value),
      }));
    const weighted =
      months.reduce((a, m) => a + m.price * m.mcf, 0) / months.reduce((a, m) => a + m.mcf, 0);
    const simple = months.reduce((a, m) => a + m.price, 0) / months.length;
    expect(gas.byState.PA.price).toBeCloseTo(weighted, 2);
    expect(gas.byState.PA.price).toBeLessThan(simple);
  });

  it('skips withheld months, and falls back to the latest annual price below the minimum', () => {
    expect(gas.byState.ME).toEqual({ price: 20.62, months: 9 });
    // Connecticut: too many withheld months, and EIA withheld its 2025 annual price too.
    expect(gas.byState.CT).toEqual({ price: 16.83, year: 2024 });
    expect(gas.byState.FL).toEqual({ price: 25.48, year: 2025 });
  });

  it('covers every state', () => {
    expect(Object.keys(gas.byState)).toHaveLength(51);
  });

  it('fails when a state has no price at all', () => {
    const strip = (j) => ({
      response: { data: j.response.data.filter((r) => r.duoarea !== 'SPA') },
    });
    expect(() => parseGas(strip(gasPrice), gasVolume, strip(gasAnnual), STATES)).toThrow(/PA/);
  });

  it('rejects an error response', () => {
    expect(() => parseGas({ error: 'x' }, gasVolume, gasAnnual, STATES)).toThrow(/response.data/);
  });
});

describe('parseShopp', () => {
  const propane = parseShopp(shopp, 'EPLLPA', STATES);
  const oil = parseShopp(shopp, 'EPD2F', STATES);

  it('uses the latest week', () => {
    expect(propane.week).toBe('2026-10-26');
    expect(propane.us).toBe(2.73);
    expect(oil.us).toBe(6.233);
  });

  it("uses the state's own price when EIA surveys it", () => {
    expect(propane.byState.PA).toEqual({ price: 3.209, area: 'state' });
    expect(oil.byState.NY).toEqual({ price: 6.441, area: 'state' });
  });

  it('falls back to the PADD region, then the U.S.', () => {
    // EIA surveys D.C. for heating oil but had no price that week.
    expect(oil.byState.DC).toEqual({ price: 6.315, area: 'R1Y' });
    expect(oil.byState.TN).toEqual({ price: 6.222, area: 'R20' });
    expect(propane.byState.CA).toEqual({ price: 2.73, area: 'US' });
  });
});

describe('parseRecsHeating', () => {
  const recs = parseRecsHeating(fixture('recs-2020-ce8-15-m.xlsx'), STATES);

  it('reads the per-state averages', () => {
    expect(recs.us).toBe(44.9);
    expect(recs.byState.PA).toEqual({ mmbtu: 57.2 });
    expect(recs.byState.MI).toEqual({ mmbtu: 72.7 });
    expect(recs.byState.FL).toEqual({ mmbtu: 8.5 });
    expect(Object.keys(recs.byState)).toHaveLength(51);
  });

  it('uses the census division for withheld states', () => {
    expect(recs.byState.HI).toEqual({ mmbtu: 23.6, area: 'Pacific' });
  });
});

describe('parseRecsArea', () => {
  it('reads heated square feet nationally, for gas-heated homes and by division', () => {
    const area = parseRecsArea(fixture('recs-2020-hc10-9.xlsx'));
    expect(area.usAll).toBe(1614);
    expect(area.usGas).toBe(1837);
    expect(area.byDivision['New England']).toBe(1645);
    expect(area.byDivision.Pacific).toBe(1313);
    expect(Object.keys(area.byDivision)).toHaveLength(9);
  });
});
