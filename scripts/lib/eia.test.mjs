import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { STATES } from '../../src/data/states.ts';
import { buildDataset, parseAnnualTable, parseHistory, parseMonthlyTable } from './eia.mjs';

// Saved copies of the real EIA files (public domain): Table 5.6.A for August 2026 and Table 5A for 2024.
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const monthly = parseMonthlyTable(fixture('eia-table-5-6-a-2026-08.html').toString('utf8'));
const annual = parseAnnualTable(fixture('eia-table-5a-2024.xlsx'));

describe('parseMonthlyTable', () => {
  it('reads the periods from the header', () => {
    expect(monthly.period).toBe('2026-08');
    expect(monthly.priorPeriod).toBe('2025-08');
  });

  it('reads residential prices for states, divisions and the U.S. total', () => {
    expect(monthly.rows.get('Pennsylvania')).toEqual({ price: 21.77, pricePrior: 19.93 });
    expect(monthly.rows.get('Hawaii')).toEqual({ price: 47.18, pricePrior: 38.53 });
    expect(monthly.rows.get('U.S. Total')).toEqual({ price: 18.16, pricePrior: 17.57 });
    expect(monthly.rows.get('New England')).toEqual({ price: 28.31, pricePrior: 29.01 });
  });

  it('rejects a page without the table header', () => {
    expect(() => parseMonthlyTable('<html><table><tr><td>x</td></tr></table></html>')).toThrow(
      /header/,
    );
  });
});

describe('parseAnnualTable', () => {
  it('reads the year and the per-state averages', () => {
    expect(annual.year).toBe(2024);
    const ct = annual.rows.get('Connecticut');
    expect(ct?.customers).toBe(1552746);
    expect(ct?.avgKwh).toBeCloseTo(694.57, 2);
    expect(ct?.avgBill).toBeCloseTo(199.66, 2);
  });
});

describe('buildDataset', () => {
  it('covers all 51 states with both tables', () => {
    const data = buildDataset(monthly, annual, STATES, '2026-10-29');
    expect(data.states).toHaveLength(51);
    expect(data.monthly).toMatchObject({ period: '2026-08', priorPeriod: '2025-08' });
    expect(data.us.price).toBe(18.16);
    const pa = data.states.find((s) => s.code === 'PA');
    expect(pa).toMatchObject({ price: 21.77, pricePrior: 19.93 });
    expect(pa?.avgKwh).toBeGreaterThan(500);
  });

  it('fails when a state is missing instead of publishing partial data', () => {
    expect(() =>
      buildDataset(monthly, annual, [{ code: 'XX', name: 'Atlantis' }], '2026-10-29'),
    ).toThrow(/Atlantis/);
  });
});

describe('parseHistory', () => {
  // Shaped like EIA API v2 /electricity/retail-sales/data rows (prices may arrive as strings).
  const periods = Array.from({ length: 16 }, (_, i) => {
    const d = new Date(Date.UTC(2025, i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const rows = (skip = () => false) =>
    ['US', ...STATES.map((s) => s.code)].flatMap((code, si) =>
      periods
        .filter((p) => !skip(code, p))
        .map((p, i) => ({
          period: p,
          stateid: code,
          sectorid: 'RES',
          price: String(10 + si / 10 + i / 100),
        })),
    );

  it('keeps the last N months that are complete for every state, in order', () => {
    const h = parseHistory({ response: { data: rows().reverse() } }, STATES, 12);
    expect(h.periods).toHaveLength(12);
    expect(h.periods.at(-1)).toBe('2026-04');
    expect(h.us[0]).toBeCloseTo(10.04, 10);
    expect(h.byState.PA).toHaveLength(12);
    expect(typeof h.byState.PA[0]).toBe('number');
  });

  it('drops a month that is missing for one state', () => {
    const h = parseHistory(
      { response: { data: rows((c, p) => c === 'HI' && p === '2026-04') } },
      STATES,
      24,
    );
    expect(h.periods.at(-1)).toBe('2026-03');
  });

  it('ignores other sectors and empty prices', () => {
    const data = [
      ...rows(),
      { period: '2026-05', stateid: 'PA', sectorid: 'COM', price: '12' },
      { period: '2026-05', stateid: 'US', sectorid: 'RES', price: null },
    ];
    expect(parseHistory({ response: { data } }, STATES).periods.at(-1)).toBe('2026-04');
  });

  it('rejects an error response', () => {
    expect(() => parseHistory({ error: { code: 'API_KEY_INVALID' } }, STATES)).toThrow(
      /response.data/,
    );
  });
});

describe('parseHistory on a real EIA API response (residential, Jun 2025 – Aug 2026)', () => {
  const real = JSON.parse(fixture('eia-api-retail-sales-res.json').toString('utf8'));

  it('matches Table 5.6.A for the latest month', () => {
    const h = parseHistory(real, STATES, 12);
    expect(h.periods.at(-1)).toBe('2026-08');
    expect(h.byState.PA.at(-1)).toBe(21.77);
    expect(h.us.at(-1)).toBe(18.16);
    expect(h.byState.HI.at(-1)).toBe(monthly.rows.get('Hawaii').price);
  });
});
