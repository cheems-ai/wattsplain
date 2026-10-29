import { describe, expect, it } from 'vitest';

import {
  applianceEnergy,
  cost,
  fromYearlyKwh,
  validateProfile,
  wattsFromBtu,
  type UsageProfile,
} from './appliance';
import { runningCost } from './energy';

const always: UsageProfile = {
  watts: 1500,
  hoursPerDay: 8,
  dutyCycle: 1,
  daysPerWeek: 7,
  monthsPerYear: 12,
  standbyWatts: 0,
};

describe('applianceEnergy', () => {
  it('reduces to watts × hours when used every day all year with no standby', () => {
    const e = applianceEnergy(always);
    expect(e.kwhPerUseDay).toBeCloseTo(12, 10);
    expect(e.kwhPerYear).toBeCloseTo(12 * 365, 10);
    expect(e.kwhPerMonthInUse).toBeCloseTo(360, 10);
    // Agrees with the simple calculator used on the state pages.
    expect(cost(e.kwhPerMonthInUse, 20)).toBeCloseTo(runningCost(1500, 8, 20).perMonth, 10);
  });

  it('applies the duty cycle: a 725 W fridge running a third of the time (DOE)', () => {
    const e = applianceEnergy({ ...always, watts: 725, hoursPerDay: 24, dutyCycle: 1 / 3 });
    expect(e.kwhPerUseDay).toBeCloseTo(5.8, 10);
  });

  it('counts only the days and months it is used', () => {
    // 5 months a year, 5 days a week: 365 × 5/7 × 5/12 = 108.63 days
    const e = applianceEnergy({ ...always, daysPerWeek: 5, monthsPerYear: 5 });
    expect(e.daysPerYear).toBeCloseTo((365 * 5 * 5) / (7 * 12), 10);
    expect(e.kwhPerYear).toBeCloseTo(12 * e.daysPerYear, 10);
    // A month in season: 30 × 5/7 days × 12 kWh
    expect(e.kwhPerMonthInUse).toBeCloseTo(12 * 30 * (5 / 7), 10);
  });

  it('adds standby for every hour the appliance is not running', () => {
    // 2 h a day every day + 5 W standby for the other 22 h: 5 × 22 × 365 / 1000 = 40.15 kWh
    const e = applianceEnergy({ ...always, watts: 100, hoursPerDay: 2, standbyWatts: 5 });
    expect(e.standbyKwhPerYear).toBeCloseTo(40.15, 10);
    expect(e.kwhPerYear).toBeCloseTo(0.2 * 365 + 40.15, 10);
  });

  it('a seasonal appliance still draws standby all year', () => {
    const e = applianceEnergy({ ...always, monthsPerYear: 0, standbyWatts: 1 });
    expect(e.runningKwhPerYear).toBe(0);
    expect(e.standbyKwhPerYear).toBeCloseTo(8.76, 10);
  });
});

describe('validateProfile', () => {
  it('accepts a normal profile and rejects impossible ones', () => {
    expect(validateProfile(always)).toBeNull();
    expect(validateProfile({ ...always, hoursPerDay: 25 })).toMatch(/0–24/);
    expect(validateProfile({ ...always, dutyCycle: 0 })).toMatch(/Running share/);
    expect(validateProfile({ ...always, daysPerWeek: 8 })).toMatch(/Days/);
    expect(validateProfile({ ...always, monthsPerYear: 13 })).toMatch(/Months/);
    expect(validateProfile({ ...always, standbyWatts: 2000 })).toMatch(/Standby/);
    expect(validateProfile({ ...always, watts: 0 })).toMatch(/watts/);
  });
});

describe('label figures', () => {
  it('spreads an EnergyGuide kWh/year evenly', () => {
    const e = fromYearlyKwh(365);
    expect(e.kwhPerUseDay).toBe(1);
    expect(e.kwhPerMonthInUse).toBe(30);
  });

  it('converts air conditioner capacity and EER to watts', () => {
    // 10,000 Btu/h at EER 10 = 1,000 W
    expect(wattsFromBtu(10_000, 10)).toBe(1000);
  });
});
