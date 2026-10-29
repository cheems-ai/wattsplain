import { describe, expect, it } from 'vitest';

import { costAt, fuelUnits, SYSTEMS } from './heating';
import {
  compareScenarios,
  listedKwh,
  overListed,
  savingsRange,
  type Household,
  type Load,
  type Scenario,
} from './scenario';
import { decodePlan, encodePlan, summaryText, toCsv } from './share';

const heater: Load = {
  kind: 'space-heater',
  name: 'Portable space heater',
  watts: 1500,
  hoursPerDay: 8,
  dutyCycle: 1,
  daysPerWeek: 7,
  monthsPerYear: 5,
  standbyWatts: 0,
};
const home: Household = {
  monthlyKwh: 900,
  fixedMonthly: 10,
  fuelPrices: { gas: 15.54, propane: 2.5, oil: 4 },
};
const current: Scenario = { name: 'Now', cents: 20, loads: [heater] };
const fewer: Scenario = { name: '5 hours', cents: 20, loads: [{ ...heater, hoursPerDay: 5 }] };

describe('compareScenarios', () => {
  it('the current scenario adds up to the household bill', () => {
    const [r] = compareScenarios(home, [current]);
    // 900 kWh a month × 12 at 20¢ + $10 × 12 fixed
    expect(r!.kwhPerYear).toBeCloseTo(10_800, 6);
    expect(r!.perYear).toBeCloseTo(10_800 * 0.2 + 120, 6);
    expect(r!.perMonth).toBeCloseTo(r!.perYear / 12, 10);
  });

  it('8 hours vs 5 hours of a 1,500 W heater over a 5-month season', () => {
    const [, b] = compareScenarios(home, [current, fewer]);
    // 1.5 kW × 3 h × 365 × 5/12 days × 20¢
    const saved = 1.5 * 3 * 365 * (5 / 12) * 0.2;
    expect(b!.diffPerYear).toBeCloseTo(-saved, 6);
    expect(b!.diffPerMonth).toBeCloseTo(-saved / 12, 6);
    expect(b!.diffPct).toBeCloseTo((-saved / (10_800 * 0.2 + 120)) * 100, 6);
  });

  it('a different price changes the whole bill except fixed charges', () => {
    const [, b] = compareScenarios(home, [current, { ...current, name: 'Cheaper', cents: 15 }]);
    expect(b!.diffPerYear).toBeCloseTo(-10_800 * 0.05, 6);
  });

  it('switching gas heat to a heat pump moves cost from gas to electricity', () => {
    const h = { ...home, heatMmbtu: 50 };
    const gas: Scenario = { ...current, loads: [], heating: 'gas', heatingEfficiency: 0.95 };
    const hp: Scenario = {
      ...gas,
      name: 'Heat pump',
      heating: 'heat-pump',
      heatingEfficiency: 7.8,
    };
    const [a, b] = compareScenarios(h, [gas, hp]);
    expect(a!.heating!.perYear).toBeCloseTo(costAt('gas', 50, 15.54, 0.95), 6);
    expect(a!.heating!.kwhPerYear).toBe(0);
    const hpKwh = fuelUnits(SYSTEMS[0]!, 50, 7.8);
    expect(b!.heating!.kwhPerYear).toBeCloseTo(hpKwh, 6);
    expect(b!.diffPerYear).toBeCloseTo(hpKwh * 0.2 - costAt('gas', 50, 15.54, 0.95), 6);
  });

  it('flags a current scenario that lists more kWh than the home uses', () => {
    expect(overListed({ ...home, monthlyKwh: 100 }, current)).toBe(true);
    expect(overListed(home, current)).toBe(false);
    expect(listedKwh(home, current)).toBeCloseTo(1.5 * 8 * 365 * (5 / 12), 6);
  });

  it('price sensitivity brackets the saving', () => {
    const [lo, hi] = savingsRange(home, [current, fewer], 1, 20);
    const mid = compareScenarios(home, [current, fewer])[1]!.diffPerYear;
    expect(lo).toBeCloseTo(mid * 1.2, 6);
    expect(hi).toBeCloseTo(mid * 0.8, 6);
  });
});

describe('share link', () => {
  const plan = {
    state: 'TX',
    monthlyKwh: 1100,
    fixedMonthly: 9.95,
    heating: { sqft: 1800 },
    scenarios: [current, { ...fewer, heating: 'heat-pump' as const, heatingEfficiency: 9 }],
  };

  it('round-trips the plan', () => {
    const back = decodePlan(encodePlan(plan), ['TX', 'PA']);
    expect(back).toEqual({
      ...plan,
      scenarios: [
        { ...current, heating: undefined, heatingEfficiency: undefined },
        { ...plan.scenarios[1] },
      ],
    });
  });

  it('is URL-safe', () => {
    expect(encodePlan(plan)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects tampered or impossible plans', () => {
    expect(decodePlan('not-base64!', ['TX'])).toBeNull();
    expect(decodePlan(encodePlan(plan), ['PA'])).toBeNull();
    const bad = { ...plan, scenarios: [{ ...current, cents: 900 }] };
    expect(decodePlan(encodePlan(bad), ['TX'])).toBeNull();
    const hours = { ...plan, scenarios: [{ ...current, loads: [{ ...heater, hoursPerDay: 30 }] }] };
    expect(decodePlan(encodePlan(hours), ['TX'])).toBeNull();
  });
});

describe('exports', () => {
  const results = compareScenarios(home, [current, fewer]);

  it('summary says saves and is an estimate', () => {
    const t = summaryText('Texas', results, [current, fewer], 'https://wattsplain.com/x');
    expect(t).toContain('5 hours:');
    expect(t).toContain('saves $');
    expect(t).toContain('not a guaranteed saving');
  });

  it('CSV totals match and formulas are neutralised', () => {
    const csv = toCsv(results, [{ ...current, name: '=HYPERLINK()' }, fewer]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Scenario,Item,Price (cents/kWh),kWh per year,Cost per year ($)');
    expect(csv).toContain(`'=HYPERLINK()`);
    expect(csv).toContain(`Total,20.00,10800,${results[0]!.perYear.toFixed(2)}`);
  });
});
