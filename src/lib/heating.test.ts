import { describe, expect, it } from 'vitest';

import {
  SYSTEMS,
  breakEvenElectricity,
  cheapestOf,
  compareSystems,
  costPerMmbtu,
  fuelUnits,
  heatNeed,
  heatPumpCop,
  perTherm,
  type SystemId,
} from './heating';

const system = (id: SystemId) => SYSTEMS.find((s) => s.id === id)!;

describe('costPerMmbtu', () => {
  it('electric resistance: 1 MMBtu is 293 kWh', () => {
    // 1e6 / 3412 = 293.08 kWh at 20¢
    expect(costPerMmbtu(system('electric'), 20, 1)).toBeCloseTo(58.62, 2);
  });

  it('natural gas: $15/Mcf in a 95% furnace', () => {
    // 15 / (1.036 × 0.95)
    expect(costPerMmbtu(system('gas'), 15, 0.95)).toBeCloseTo(15.24, 2);
  });

  it('propane and heating oil per gallon', () => {
    expect(costPerMmbtu(system('propane'), 3, 0.95)).toBeCloseTo(34.53, 2);
    expect(costPerMmbtu(system('oil'), 6, 0.85)).toBeCloseTo(50.97, 2);
  });

  it('heat pump: HSPF2 7.8 is a seasonal COP of about 2.29', () => {
    expect(heatPumpCop(7.8)).toBeCloseTo(2.286, 3);
    expect(costPerMmbtu(system('heat-pump'), 20, 7.8)).toBeCloseTo(58.62 / 2.286, 1);
  });
});

describe('fuelUnits', () => {
  it('converts heat back to fuel', () => {
    expect(fuelUnits(system('gas'), 48.62, 0.95)).toBeCloseTo(49.4, 1);
    expect(fuelUnits(system('electric'), 1, 1)).toBeCloseTo(293.08, 2);
  });
});

describe('heatNeed', () => {
  it('is the gas burned times the assumed 85% furnace efficiency', () => {
    expect(heatNeed(57.2)).toBeCloseTo(48.62, 2);
  });
});

describe('breakEvenElectricity', () => {
  it('is where the heat pump and the gas furnace cost the same', () => {
    const cents = breakEvenElectricity(15, 0.95, 7.8);
    expect(costPerMmbtu(system('heat-pump'), cents, 7.8)).toBeCloseTo(
      costPerMmbtu(system('gas'), 15, 0.95),
      8,
    );
    expect(cents).toBeCloseTo(11.89, 2);
  });
});

describe('compareSystems', () => {
  const prices = { 'heat-pump': 20, electric: 20, gas: 15, propane: 3, oil: 6 };

  it('sorts cheapest first and scales with the heat needed', () => {
    const c = compareSystems(50, prices);
    expect(c.map((x) => x.system.id)).toEqual(['gas', 'heat-pump', 'propane', 'oil', 'electric']);
    expect(c[0]!.perYear).toBeCloseTo(15.24 * 50, 0);
    expect(compareSystems(100, prices)[0]!.perYear).toBeCloseTo(c[0]!.perYear * 2, 8);
  });

  it('uses the efficiencies it is given', () => {
    const old = compareSystems(50, prices, {
      'heat-pump': 7.8,
      electric: 1,
      gas: 0.8,
      propane: 0.8,
      oil: 0.8,
    });
    const gas = old.find((x) => x.system.id === 'gas')!;
    expect(gas.perMmbtu).toBeCloseTo(15 / (1.036 * 0.8), 6);
  });
});

describe('perTherm', () => {
  it('divides $/Mcf by 10.36 therms', () => {
    expect(perTherm(15.97)).toBeCloseTo(1.5415, 4);
  });
});

describe('cheapestOf', () => {
  it('skips excluded systems', () => {
    const c = compareSystems(50, { 'heat-pump': 20, electric: 20, gas: 15, propane: 1, oil: 6 });
    expect(c[0]!.system.id).toBe('propane');
    expect(cheapestOf(c, ['propane']).system.id).toBe('gas');
    expect(cheapestOf(c, []).system.id).toBe('propane');
  });
});
