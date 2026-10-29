import { describe, expect, it } from 'vitest';

import { computeTrend } from './electricity';

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
