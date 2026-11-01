import { describe, expect, it } from 'vitest';

import { SYSTEMS, fuelUnits } from '../lib/heating';
import { HEATING_OPTIONS, HEATING_ROWS, US_TYPICAL, heatForSqft, heatingRow } from './heating';

describe('HEATING_ROWS', () => {
  it('has every state with positive prices and heat', () => {
    expect(HEATING_ROWS).toHaveLength(51);
    for (const r of HEATING_ROWS) {
      expect(r.heat).toBeGreaterThan(0);
      for (const p of Object.values(r.prices)) expect(p).toBeGreaterThan(0);
      expect(r.costs).toHaveLength(5);
    }
  });

  it('labels prices that are not the state’s own', () => {
    const ca = heatingRow('CA')!;
    expect(ca.national).toContain('propane');
    expect(ca.notes.propane).toBe('U.S. average');
    expect(heatingRow('TN')!.notes.oil).toBe('Midwest average');
    expect(heatingRow('PA')!.notes).toEqual({});
  });

  it('never calls a fuel priced at the U.S. average the cheapest', () => {
    for (const r of HEATING_ROWS) expect(r.national).not.toContain(r.cheapest.system.id);
  });

  it('passes the national list to the calculator', () => {
    expect(HEATING_OPTIONS.find((o) => o.code === 'HI')!.national.length).toBeGreaterThan(0);
  });
});

describe('heatForSqft', () => {
  it('scales the typical home by floor area', () => {
    expect(heatForSqft(US_TYPICAL, US_TYPICAL.typicalSqft)).toBeCloseTo(US_TYPICAL.heat);
    expect(heatForSqft(US_TYPICAL, 2 * US_TYPICAL.typicalSqft)).toBeCloseTo(2 * US_TYPICAL.heat);
  });

  it('puts a 2,000 sq ft U.S. home in a plausible propane range', () => {
    // RECS 2020: 44.9 MMBtu of gas burned at 85% for 1,837 sq ft; a 95% propane furnace.
    const propane = SYSTEMS.find((s) => s.id === 'propane')!;
    const gallons = fuelUnits(propane, heatForSqft(US_TYPICAL, 2000), 0.95);
    expect(gallons).toBeGreaterThan(400);
    expect(gallons).toBeLessThan(550);
  });
});
