import { describe, expect, it } from 'vitest';

import { blanketNights, setbackShare, validateZone, zoneHeating, type ZoneInput } from './zone';

const base: ZoneInput = {
  homeHeat: 48,
  homeSqft: 1920,
  homeCost: 1000,
  roomSqft: 192,
  hoursPerDay: 8,
  setbackF: 6,
  centsPerKwh: 20,
  heaterWatts: 1500,
  seasonDays: 150,
};

describe('setbackShare', () => {
  it('is 1% per °F for 8 hours a day and scales with the hours', () => {
    expect(setbackShare(6, 8)).toBeCloseTo(0.06, 10);
    expect(setbackShare(6, 16)).toBeCloseTo(0.12, 10);
  });

  it('never claims more than half the heating bill', () => {
    expect(setbackShare(20, 24)).toBe(0.5);
  });
});

describe('zoneHeating', () => {
  it('heats the room with its share of the home heat plus the loss to cooler rooms', () => {
    const r = zoneHeating(base);
    // 48 MMBtu × 10% of the floor × 8/24 of the day × 1.25 = 2 MMBtu → 586.2 kWh → $117.23.
    expect(r.roomHeat).toBeCloseTo(2, 10);
    expect(r.heaterKwh).toBeCloseTo(2e6 / 3412, 6);
    expect(r.heaterCost).toBeCloseTo((2e6 / 3412) * 0.2, 6);
    expect(r.homeSaving).toBeCloseTo(60, 10);
    expect(r.net).toBeCloseTo(r.heaterCost - 60, 10);
  });

  it('saves money when central heat is expensive enough', () => {
    expect(zoneHeating({ ...base, homeCost: 3000 }).net).toBeLessThan(0);
  });

  it('uses the visitor’s own saving estimate when given', () => {
    expect(zoneHeating({ ...base, savingShare: 0.2 }).homeSaving).toBeCloseTo(200, 10);
  });

  it('flags a heater too small for the coldest days', () => {
    // 586 kWh over 1,200 heater hours ≈ 489 W on average, ≈ 977 W on the coldest days.
    expect(zoneHeating(base).undersized).toBe(false);
    expect(zoneHeating({ ...base, heaterWatts: 750 }).undersized).toBe(true);
  });
});

describe('validateZone', () => {
  it('accepts the example and rejects impossible input', () => {
    expect(validateZone(base)).toBeNull();
    expect(validateZone({ ...base, roomSqft: 2000 })).toMatch(/smaller/);
    expect(validateZone({ ...base, hoursPerDay: 25 })).toMatch(/1–24/);
    expect(validateZone({ ...base, savingShare: 1.5 })).toMatch(/0–100%/);
  });
});

describe('blanketNights', () => {
  it('compares a blanket at full power with the night setback', () => {
    const r = blanketNights({
      homeCost: 1000,
      setbackF: 6,
      hours: 8,
      watts: 100,
      nights: 150,
      centsPerKwh: 20,
    });
    // 100 W × 8 h × 150 nights = 120 kWh = $24; 6% of $1,000 = $60 saved.
    expect(r.kwh).toBe(120);
    expect(r.cost).toBeCloseTo(24, 10);
    expect(r.net).toBeCloseTo(-36, 10);
  });
});
