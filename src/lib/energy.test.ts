import { describe, expect, it } from 'vitest';

import {
  analyzeBills,
  compareBills,
  energyCharges,
  parseRate,
  pctChange,
  runningCost,
} from './energy';

describe('runningCost', () => {
  it('matches the DOE worked example (window fan, 200 W, 4 h/day, 8.5 ¢/kWh)', () => {
    // DOE / Virginia Cooperative Extension: 200 W × 4 h × 120 days = 96 kWh × 8.5 ¢ = $8.16.
    const c = runningCost(200, 4, 8.5);
    expect(c.kwhPerDay).toBeCloseTo(0.8, 10);
    expect(c.perDay * 120).toBeCloseTo(8.16, 10);
  });

  it('gives per-hour, per-month and per-year costs for a 1,500 W heater', () => {
    const c = runningCost(1500, 8, 20);
    expect(c.perHour).toBeCloseTo(0.3, 10);
    expect(c.perDay).toBeCloseTo(2.4, 10);
    expect(c.perMonth).toBeCloseTo(72, 10);
    expect(c.perYear).toBeCloseTo(876, 10);
  });
});

describe('compareBills', () => {
  it('splits a change into rate and usage parts that add up exactly', () => {
    const r = compareBills({ kwh: 800, dollars: 140 }, { kwh: 950, dollars: 200 });
    expect(r.change).toBe(60);
    expect(r.rateEffect + r.usageEffect).toBeCloseTo(60, 10);
    expect(r.ratePrev).toBeCloseTo(17.5, 10);
    expect(r.rateNow).toBeCloseTo(21.0526, 3);
    expect(r.driver).toBe('both');
  });

  it('is symmetric: swapping the bills flips the signs only', () => {
    const a = compareBills({ kwh: 700, dollars: 120 }, { kwh: 760, dollars: 165 });
    const b = compareBills({ kwh: 760, dollars: 165 }, { kwh: 700, dollars: 120 });
    expect(b.rateEffect).toBeCloseTo(-a.rateEffect, 10);
    expect(b.usageEffect).toBeCloseTo(-a.usageEffect, 10);
  });

  it('blames the rate when usage did not change', () => {
    const r = compareBills({ kwh: 900, dollars: 150 }, { kwh: 900, dollars: 180 });
    expect(r.usageEffect).toBe(0);
    expect(r.rateEffect).toBeCloseTo(30, 10);
    expect(r.driver).toBe('rate');
  });

  it('blames usage when the rate did not change', () => {
    const r = compareBills({ kwh: 500, dollars: 100 }, { kwh: 750, dollars: 150 });
    expect(r.rateEffect).toBeCloseTo(0, 10);
    expect(r.driver).toBe('usage');
  });

  it('reports no change for an unchanged bill', () => {
    expect(compareBills({ kwh: 600, dollars: 100 }, { kwh: 600, dollars: 100 }).driver).toBe(
      'none',
    );
  });

  it('rejects zero kWh', () => {
    expect(() => compareBills({ kwh: 0, dollars: 20 }, { kwh: 600, dollars: 100 })).toThrow(
      RangeError,
    );
  });
});

describe('pctChange', () => {
  it('computes the year-over-year change', () => {
    expect(pctChange(21.77, 19.93)).toBeCloseTo(9.232, 3);
  });
});

describe('parseRate', () => {
  it('reads cents and dollars the way bills print them', () => {
    expect(parseRate('18.2')).toBeCloseTo(18.2, 10);
    expect(parseRate('18.2¢')).toBeCloseTo(18.2, 10);
    expect(parseRate('18 cents per kWh')).toBeCloseTo(18, 10);
    expect(parseRate('0.182')).toBeCloseTo(18.2, 10);
    expect(parseRate('$0.182/kWh')).toBeCloseTo(18.2, 10);
    expect(parseRate('$.18')).toBeCloseTo(18, 10);
  });

  it('ignores empty or unusable input', () => {
    expect(parseRate('')).toBeNull();
    expect(parseRate('  ')).toBeNull();
    expect(parseRate('abc')).toBeNull();
    expect(parseRate('0')).toBeNull();
  });
});

describe('analyzeBills', () => {
  const sum = (parts: { amount: number }[]) => parts.reduce((s, p) => s + p.amount, 0);

  it('with only kWh and totals, matches the simple two-part split', () => {
    const a = analyzeBills({ kwh: 800, total: 140 }, { kwh: 950, total: 200 });
    const b = compareBills({ kwh: 800, dollars: 140 }, { kwh: 950, dollars: 200 });
    expect(a.parts.find((p) => p.id === 'usage')!.amount).toBeCloseTo(b.usageEffect, 10);
    expect(a.parts.find((p) => p.id === 'price')!.amount).toBeCloseTo(b.rateEffect, 10);
    expect(sum(a.parts)).toBeCloseTo(60, 10);
  });

  it('a higher fixed charge is not reported as a higher price per kWh', () => {
    // Same 900 kWh at 15¢; the customer charge went from $10 to $25.
    const a = analyzeBills(
      { kwh: 900, total: 145, fixed: 10 },
      { kwh: 900, total: 160, fixed: 25 },
    );
    expect(a.energyPrev).toBeCloseTo(15, 10);
    expect(a.energyNow).toBeCloseTo(15, 10);
    expect(a.parts).toEqual([{ id: 'fixed', amount: 15 }]);
    expect(a.main).toBe('fixed');
    // The all-in average did rise, which is what misleads people.
    expect(a.allInNow).toBeGreaterThan(a.allInPrev);
  });

  it('separates a longer billing period from higher daily use', () => {
    // 30 days × 30 kWh = 900 kWh → 35 days × 30 kWh = 1,050 kWh, both at 15¢ with no other lines.
    const a = analyzeBills(
      { kwh: 900, total: 135, days: 30 },
      { kwh: 1050, total: 157.5, days: 35 },
    );
    expect(a.dailyPrev).toBeCloseTo(30, 10);
    expect(a.dailyNow).toBeCloseTo(30, 10);
    expect(a.parts).toEqual([{ id: 'days', amount: expect.closeTo(22.5, 10) }]);
    expect(a.main).toBe('days');
  });

  it('every part adds up exactly to the change, whatever changed', () => {
    const prev = { kwh: 720, total: 131.4, days: 29, fixed: 11, taxes: 7.2, credits: 4 };
    const now = { kwh: 1010, total: 214.9, days: 33, fixed: 14, taxes: 11.6, credits: 0 };
    const a = analyzeBills(prev, now);
    expect(sum(a.parts)).toBeCloseTo(now.total - prev.total, 10);
    // A lost credit raises the bill.
    expect(a.parts.find((p) => p.id === 'credits')!.amount).toBe(4);
    expect(a.energyPrev).toBeCloseTo((energyCharges(prev) / prev.kwh) * 100, 10);
  });

  it('rejects bills whose fixed lines exceed the total', () => {
    expect(() => analyzeBills({ kwh: 10, total: 20, fixed: 25 }, { kwh: 500, total: 90 })).toThrow(
      RangeError,
    );
    expect(() => analyzeBills({ kwh: 500, total: 90, days: 90 }, { kwh: 500, total: 90 })).toThrow(
      /billing period/,
    );
  });
});
