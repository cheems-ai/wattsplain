import { describe, expect, it } from 'vitest';

import { DEFAULT_RATE_INPUT, billRate, blend, parsePrice, resolveRate, touRate } from './rate';

const input = (over: Partial<typeof DEFAULT_RATE_INPUT>) => ({ ...DEFAULT_RATE_INPUT, ...over });

describe('parsePrice', () => {
  it('reads cents in cents mode and dollars in dollar mode', () => {
    expect(parsePrice('18.2', 'cents').cents).toBeCloseTo(18.2, 10);
    expect(parsePrice('0.182', 'dollars').cents).toBeCloseTo(18.2, 10);
    expect(parsePrice('$0.182', 'cents').cents).toBeCloseTo(18.2, 10);
  });

  it('reads a value under 1 in cents mode as dollars and says so', () => {
    const p = parsePrice('0.18', 'cents');
    expect(p.cents).toBeCloseTo(18, 10);
    expect(p.note).toContain('$0.18');
  });

  it('reads 18 in dollar mode as 18 cents and says so', () => {
    const p = parsePrice('18', 'dollars');
    expect(p.cents).toBe(18);
    expect(p.note).toContain('18¢');
  });

  it('rejects prices no U.S. home pays', () => {
    expect(parsePrice('400', 'cents').cents).toBeNull();
    expect(parsePrice('400', 'cents').error).toMatch(/outside/);
    expect(parsePrice('0', 'cents').error).toBeDefined();
  });

  it('treats an empty field as not entered, not as an error', () => {
    expect(parsePrice('', 'cents')).toEqual({ cents: null });
    expect(parsePrice('  ', 'dollars')).toEqual({ cents: null });
  });
});

describe('billRate', () => {
  it('removes the fixed charge before dividing by kWh', () => {
    // ($152.40 − $12.00) ÷ 900 kWh = 15.6¢
    expect(billRate({ billTotal: '152.40', billKwh: '900', billFixed: '12' }).cents).toBeCloseTo(
      15.6,
      10,
    );
  });

  it('without a fixed charge gives the all-in average and a note', () => {
    const r = billRate({ billTotal: '150', billKwh: '1000', billFixed: '' });
    expect(r.cents).toBeCloseTo(15, 10);
    expect(r.note).toMatch(/all-in average/);
  });

  it('rejects impossible bills', () => {
    expect(billRate({ billTotal: '100', billKwh: '0', billFixed: '' }).error).toBeDefined();
    expect(billRate({ billTotal: '20', billKwh: '500', billFixed: '25' }).error).toBeDefined();
    expect(billRate({ billTotal: '1500', billKwh: '50', billFixed: '' }).error).toMatch(/wrong/);
  });
});

describe('touRate', () => {
  it('blends the two prices by the peak share of kWh', () => {
    // 30% at 32¢ and 70% at 12¢ = 18¢
    expect(
      touRate({ peak: '32', offPeak: '12', peakShare: '30', unit: 'cents' }).cents,
    ).toBeCloseTo(18, 10);
    expect(blend(40, 10, 0.5)).toBe(25);
  });

  it('rejects a share outside 0–100%', () => {
    expect(
      touRate({ peak: '32', offPeak: '12', peakShare: '120', unit: 'cents' }).error,
    ).toBeDefined();
  });
});

describe('resolveRate', () => {
  it('uses the state average by default and marks it as an average', () => {
    const r = resolveRate(input({}), 17.4, 'Texas average');
    expect(r).toMatchObject({ cents: 17.4, marginal: false, label: 'Texas average' });
  });

  it('uses the chosen basis', () => {
    expect(resolveRate(input({ mode: 'custom', custom: '0.21' }), 17, '').cents).toBeCloseTo(
      21,
      10,
    );
    expect(
      resolveRate(
        input({ mode: 'bill', billTotal: '110', billKwh: '500', billFixed: '10' }),
        17,
        '',
      ).cents,
    ).toBeCloseTo(20, 10);
    expect(
      resolveRate(input({ mode: 'tou', peak: '30', offPeak: '10', peakShare: '50' }), 17, '').cents,
    ).toBeCloseTo(20, 10);
  });

  it('gives no price while the chosen basis is incomplete', () => {
    expect(resolveRate(input({ mode: 'custom' }), 17, '').cents).toBeNull();
    expect(resolveRate(input({ mode: 'bill', billTotal: '100' }), 17, '').cents).toBeNull();
  });
});
