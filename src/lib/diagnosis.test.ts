import { describe, expect, it } from 'vitest';

import { diagnose, type DiagnosisInput } from './diagnosis';

const base: DiagnosisInput = {
  compare: 'last-year',
  weather: 'similar',
  electricHeat: false,
  electricCooling: false,
  changes: [],
  estimated: 'no',
  planChange: 'no',
  stateChangePct: 5,
  stateName: 'Ohio',
};

describe('diagnose', () => {
  it('with no bills and no answers, finds nothing to blame', () => {
    expect(diagnose(base).causes).toEqual([]);
  });

  it('a longer period is shown by the numbers, not blamed on usage', () => {
    const d = diagnose({
      ...base,
      bills: {
        prev: { kwh: 900, total: 135, days: 30 },
        now: { kwh: 1050, total: 157.5, days: 35 },
      },
    });
    expect(d.causes.map((c) => c.id)).toEqual(['days']);
    expect(d.causes[0]!.evidence).toBe('numbers');
  });

  it('a fixed-charge increase is not called a higher price per kWh', () => {
    const d = diagnose({
      ...base,
      bills: {
        prev: { kwh: 900, total: 145, fixed: 10 },
        now: { kwh: 900, total: 160, fixed: 25 },
      },
    });
    expect(d.causes.map((c) => c.id)).toEqual(['fixed']);
  });

  it('price per kWh up: mentions the state trend and tiers when use also rose', () => {
    const d = diagnose({
      ...base,
      bills: { prev: { kwh: 800, total: 120 }, now: { kwh: 950, total: 190 } },
    });
    const price = d.causes.find((c) => c.id === 'price')!;
    expect(price.why).toContain("Ohio's average price is up 5.0%");
    expect(price.why).toContain('tiered rates');
    expect(
      d.causes
        .map((c) => c.id)
        .slice(0, 2)
        .sort(),
    ).toEqual(['price', 'usage']);
  });

  it('season is likely when compared with last month, weather turned, and heat is electric', () => {
    const d = diagnose({
      ...base,
      compare: 'last-month',
      weather: 'colder',
      electricHeat: true,
      bills: { prev: { kwh: 700, total: 105 }, now: { kwh: 1400, total: 210 } },
    });
    expect(d.causes.find((c) => c.id === 'season')).toMatchObject({ evidence: 'likely' });
    expect(d.causes[0]!.id).toBe('usage');
  });

  it('answers without bills are likely, never shown-by-numbers', () => {
    const d = diagnose({
      ...base,
      changes: ['space-heater'],
      estimated: 'yes',
      planChange: 'unsure',
    });
    expect(d.causes.every((c) => c.evidence !== 'numbers')).toBe(true);
    expect(d.causes.find((c) => c.id === 'space-heater')!.link!.href).toContain(
      'appliance=space-heater',
    );
    expect(d.causes.find((c) => c.id === 'plan')!.evidence).toBe('check');
  });

  it('a new appliance is only something to check when kWh did not rise', () => {
    const d = diagnose({
      ...base,
      changes: ['ev'],
      bills: { prev: { kwh: 900, total: 150 }, now: { kwh: 905, total: 151 } },
    });
    expect(d.causes.find((c) => c.id === 'ev')).toMatchObject({ evidence: 'check' });
  });

  it('reports unusable bill numbers instead of throwing', () => {
    const d = diagnose({
      ...base,
      bills: { prev: { kwh: 0, total: 50 }, now: { kwh: 500, total: 80 } },
    });
    expect(d.billError).toMatch(/kWh/);
  });
});
