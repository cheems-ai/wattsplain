import { describe, expect, it } from 'vitest';

import {
  SYSTEMS,
  adjustHeat,
  costAt,
  effectiveHspf,
  simplePayback,
  totalCost,
  typicalGasHomeArea,
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

describe('heating adjustments', () => {
  it('scales the typical home by floor area and insulation step', () => {
    expect(adjustHeat(50, { typicalSqft: 2000, insulation: 'typical' })).toBe(50);
    expect(adjustHeat(50, { sqft: 1000, typicalSqft: 2000, insulation: 'typical' })).toBe(25);
    expect(adjustHeat(50, { sqft: 2000, typicalSqft: 2000, insulation: 'worse' })).toBeCloseTo(
      60,
      10,
    );
  });

  it('derives the typical gas-heated area from the RECS ratio', () => {
    // New England 1,645 sq ft × 1,837 / 1,614
    expect(typicalGasHomeArea(1645, 1614, 1837)).toBeCloseTo(1872.3, 1);
  });

  it('effective HSPF2: no derate and no backup changes nothing', () => {
    expect(effectiveHspf(7.8, 0, 0)).toBeCloseTo(7.8, 10);
  });

  it('effective HSPF2: all-backup is resistance heat (COP 1)', () => {
    expect(effectiveHspf(9, 0.2, 1)).toBeCloseTo(3.412, 10);
  });

  it('effective HSPF2: 20% of the heat from strips at COP 2.5', () => {
    // COP 2.5 → energy per unit heat = 0.8/2.5 + 0.2 = 0.52 → COP 1.923
    const hspf = 2.5 * 3.412;
    expect(effectiveHspf(hspf, 0, 0.2) / 3.412).toBeCloseTo(1 / 0.52, 10);
  });

  it('a 25% derate raises the heat pump running cost by a third', () => {
    const base = costAt('heat-pump', 60, 18, 7.8);
    const cold = costAt('heat-pump', 60, 18, effectiveHspf(7.8, 0.25, 0));
    expect(cold / base).toBeCloseTo(4 / 3, 10);
  });

  it('total cost of ownership and payback', () => {
    expect(totalCost({ running: 1000, install: 8000, maintenance: 150 }, 15)).toBe(
      8000 + 15 * 1150,
    );
    expect(simplePayback(3000, 600)).toBe(5);
    expect(simplePayback(3000, -10)).toBeUndefined();
  });

  it('price sensitivity scales running cost linearly', () => {
    expect(costAt('gas', 50, 15, 0.95, 20) / costAt('gas', 50, 15, 0.95)).toBeCloseTo(1.2, 10);
  });
});
