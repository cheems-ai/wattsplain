// Home Energy Savings Planner: a household and a set of scenarios, each costed for a year.
//
// A household uses `monthlyKwh` in total. The appliances listed in the *first* scenario (the
// visitor's current situation) and its electric heating are part of that; the rest is
// "everything else" and stays the same in every scenario, so totals look like a real yearly bill
// and differences come only from what the visitor changed.
import { applianceEnergy, type UsageProfile } from './appliance';
import { SYSTEMS, costAt, fuelUnits, type SystemId } from './heating';

export interface Load extends UsageProfile {
  /** Appliance id from data/appliances, or 'custom'. */
  kind: string;
  name: string;
}

export interface Scenario {
  name: string;
  /** Electricity price for this scenario, cents per kWh. */
  cents: number;
  loads: Load[];
  /** Heating system, when the household's heating is included. */
  heating?: SystemId | undefined;
  /** Seasonal efficiency of that system: AFUE as a fraction, or HSPF2 for a heat pump. */
  heatingEfficiency?: number | undefined;
}

export interface Household {
  monthlyKwh: number;
  /** Fixed monthly charges on the electric bill, dollars; the same in every scenario. */
  fixedMonthly: number;
  /** Heat the home needs a year, million Btu; undefined when heating is left out. */
  heatMmbtu?: number | undefined;
  /** Fuel prices for gas ($/Mcf), propane and oil ($/gal); electricity comes from the scenario. */
  fuelPrices: Record<'gas' | 'propane' | 'oil', number>;
}

export interface LoadCost {
  name: string;
  kwhPerYear: number;
  perYear: number;
}

export interface ScenarioResult {
  name: string;
  loads: LoadCost[];
  heating?: { system: SystemId; perYear: number; kwhPerYear: number } | undefined;
  otherKwhPerYear: number;
  otherPerYear: number;
  fixedPerYear: number;
  kwhPerYear: number;
  perYear: number;
  perMonth: number;
  /** Against the first scenario; zero for the first. Positive = costs more. */
  diffPerYear: number;
  diffPerMonth: number;
  diffPct: number;
}

const ELECTRIC: readonly SystemId[] = ['heat-pump', 'electric'];

function heatingCost(
  h: Household,
  s: Scenario,
): { system: SystemId; perYear: number; kwhPerYear: number } | undefined {
  if (h.heatMmbtu === undefined || !s.heating) return undefined;
  const system = SYSTEMS.find((x) => x.id === s.heating)!;
  const eff = s.heatingEfficiency ?? system.efficiency;
  const electric = ELECTRIC.includes(s.heating);
  const price = electric ? s.cents : h.fuelPrices[s.heating as 'gas' | 'propane' | 'oil'];
  return {
    system: s.heating,
    perYear: costAt(s.heating, h.heatMmbtu, price, eff),
    kwhPerYear: electric ? fuelUnits(system, h.heatMmbtu, eff) : 0,
  };
}

/** kWh a year of the listed loads and electric heating in a scenario. */
export function listedKwh(h: Household, s: Scenario): number {
  const loads = s.loads.reduce((sum, l) => sum + applianceEnergy(l).kwhPerYear, 0);
  return loads + (heatingCost(h, s)?.kwhPerYear ?? 0);
}

/**
 * Costs every scenario for a year. "Everything else" is the household's yearly kWh minus what the
 * first scenario lists (never below zero; see `overListed`).
 */
export function compareScenarios(h: Household, scenarios: Scenario[]): ScenarioResult[] {
  if (scenarios.length === 0) return [];
  const otherKwh = Math.max(0, h.monthlyKwh * 12 - listedKwh(h, scenarios[0]!));
  const fixedPerYear = h.fixedMonthly * 12;
  const results = scenarios.map((s) => {
    const loads = s.loads.map((l) => {
      const kwh = applianceEnergy(l).kwhPerYear;
      return { name: l.name, kwhPerYear: kwh, perYear: (kwh * s.cents) / 100 };
    });
    const heating = heatingCost(h, s);
    const otherPerYear = (otherKwh * s.cents) / 100;
    const perYear =
      loads.reduce((a, l) => a + l.perYear, 0) +
      (heating?.perYear ?? 0) +
      otherPerYear +
      fixedPerYear;
    return {
      name: s.name,
      loads,
      heating,
      otherKwhPerYear: otherKwh,
      otherPerYear,
      fixedPerYear,
      kwhPerYear:
        loads.reduce((a, l) => a + l.kwhPerYear, 0) + (heating?.kwhPerYear ?? 0) + otherKwh,
      perYear,
      perMonth: perYear / 12,
      diffPerYear: 0,
      diffPerMonth: 0,
      diffPct: 0,
    };
  });
  const base = results[0]!.perYear;
  for (const r of results) {
    r.diffPerYear = r.perYear - base;
    r.diffPerMonth = r.diffPerYear / 12;
    r.diffPct = base > 0 ? (r.diffPerYear / base) * 100 : 0;
  }
  return results;
}

/** True when the current scenario lists more electricity than the household uses in total. */
export const overListed = (h: Household, current: Scenario): boolean =>
  listedKwh(h, current) > h.monthlyKwh * 12 + 1e-9;

/**
 * Range of a scenario's yearly difference if every price is `pct` percent lower or higher.
 * Differences that come from using less scale with the price; this shows how much they move.
 */
export function savingsRange(
  h: Household,
  scenarios: Scenario[],
  index: number,
  pct = 20,
): [number, number] {
  const scale = (f: number) =>
    compareScenarios(
      {
        ...h,
        fixedMonthly: h.fixedMonthly,
        fuelPrices: {
          gas: h.fuelPrices.gas * f,
          propane: h.fuelPrices.propane * f,
          oil: h.fuelPrices.oil * f,
        },
      },
      scenarios.map((s) => ({ ...s, cents: s.cents * f })),
    )[index]!.diffPerYear;
  const a = scale(1 - pct / 100);
  const b = scale(1 + pct / 100);
  return [Math.min(a, b), Math.max(a, b)];
}
