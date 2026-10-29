import { describe, expect, it } from 'vitest';

import { computeChanges, computeTrend } from './electricity';

// 24 months, Nov 2024 – Oct 2026; PA rises 0.1¢ a month from 18¢, the U.S. stays at 17¢.
const periods = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(Date.UTC(2024, 10 + i, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
});
const pa = periods.map((_, i) => 18 + i / 10);
const history = { periods, us: periods.map(() => 17), byState: { PA: pa } };

describe('computeTrend', () => {
  it('compares this year so far with the same months last year', () => {
    const t = computeTrend(history, 'PA')!;
    expect(t.ytd.year).toBe('2026');
    expect(t.ytd.months).toBe(10);
    // Jan–Oct 2026 = months 14..23 → 19.4..20.3, mean 19.85; Jan–Oct 2025 = 18.2..19.1, mean 18.65.
    expect(t.ytd.avg).toBeCloseTo(19.85, 10);
    expect(t.ytd.avgPrior).toBeCloseTo(18.65, 10);
    expect(t.ytd.change).toBeCloseTo(((19.85 - 18.65) / 18.65) * 100, 10);
  });

  it('finds the highest and lowest month of the last 12', () => {
    const t = computeTrend(history, 'PA')!;
    expect(t.high).toEqual({ period: '2026-10', price: pa[23] });
    expect(t.low).toEqual({ period: '2025-11', price: pa[12] });
  });

  it('returns undefined for an unknown state', () => {
    expect(computeTrend(history, 'XX')).toBeUndefined();
  });
});

describe('computeChanges', () => {
  const flat = periods.map(() => 20);
  const h = { periods, us: flat, byState: { PA: pa, OH: flat } };

  it('compares the last 12 months with the 12 before and sorts by the change', () => {
    const [first, second] = computeChanges(h, { PA: 800, OH: 900 });
    // PA: months 12..23 average 18 + 1.75 = 19.75; months 0..11 average 18.55.
    expect(first?.code).toBe('PA');
    expect(first?.avg12).toBeCloseTo(19.75, 10);
    expect(first?.avgPrior12).toBeCloseTo(18.55, 10);
    expect(first?.change12).toBeCloseTo(((19.75 - 18.55) / 18.55) * 100, 10);
    expect(first?.changeMonth).toBeCloseTo(((pa[23]! - pa[11]!) / pa[11]!) * 100, 10);
    // 1.2 cents more on 800 kWh = $9.60 a month.
    expect(first?.billEffect).toBeCloseTo(9.6, 10);
    expect(second).toMatchObject({ code: 'OH', change12: 0, billEffect: 0 });
  });

  it('refuses a history shorter than 24 months', () => {
    expect(() => computeChanges({ ...h, periods: periods.slice(1) }, {})).toThrow(/24 months/);
  });
});
