// Heating cost comparison: what the same amount of heat costs with each system. Heat in million
// Btu (MMBtu) delivered to the home; fuel prices in dollars per unit (electricity in cents/kWh).

/** Heat content per unit of fuel, Btu (EIA, "Energy units and calculators explained"). */
export const BTU = {
  kwh: 3412,
  /** 1,000 cubic feet of natural gas at 1,036 Btu per cubic foot. */
  mcf: 1_036_000,
  therm: 100_000,
  propaneGal: 91_452,
  oilGal: 138_500,
} as const;

/** Assumed efficiency of the gas furnace in the typical home RECS measured (see heatNeed). */
export const STOCK_GAS_EFFICIENCY = 0.85;

export type SystemId = 'heat-pump' | 'gas' | 'propane' | 'oil' | 'electric';
export type FuelUnit = 'kwh' | 'mcf' | 'propaneGal' | 'oilGal';

export interface HeatingSystem {
  id: SystemId;
  name: string;
  fuel: FuelUnit;
  /** Default efficiency of a new system: AFUE as a fraction, or HSPF2 for the heat pump. */
  efficiency: number;
}

export const SYSTEMS: readonly HeatingSystem[] = [
  { id: 'heat-pump', name: 'Heat pump', fuel: 'kwh', efficiency: 7.8 },
  { id: 'gas', name: 'Natural gas furnace', fuel: 'mcf', efficiency: 0.95 },
  { id: 'propane', name: 'Propane furnace', fuel: 'propaneGal', efficiency: 0.95 },
  { id: 'oil', name: 'Heating oil furnace', fuel: 'oilGal', efficiency: 0.85 },
  { id: 'electric', name: 'Electric furnace or baseboard', fuel: 'kwh', efficiency: 1 },
];

/**
 * Seasonal heat out per unit of energy in. HSPF2 is Btu of heat per watt-hour of electricity over
 * a rated heating season, so dividing by 3.412 gives the seasonal coefficient of performance.
 */
export const heatPumpCop = (hspf2: number): number => hspf2 / 3.412;

const usefulFraction = (id: SystemId, efficiency: number) =>
  id === 'heat-pump' ? heatPumpCop(efficiency) : efficiency;

/** Unit price in dollars: electricity is quoted in cents per kWh, the rest in dollars. */
const dollarsPerUnit = (fuel: FuelUnit, price: number) => (fuel === 'kwh' ? price / 100 : price);

/** Dollars per million Btu of heat delivered. */
export function costPerMmbtu(system: HeatingSystem, price: number, efficiency: number): number {
  const btuPerUnit = BTU[system.fuel] * usefulFraction(system.id, efficiency);
  return (dollarsPerUnit(system.fuel, price) / btuPerUnit) * 1e6;
}

/** Units of fuel needed for `mmbtu` of delivered heat. */
export function fuelUnits(system: HeatingSystem, mmbtu: number, efficiency: number): number {
  return (mmbtu * 1e6) / (BTU[system.fuel] * usefulFraction(system.id, efficiency));
}

/**
 * Delivered heat of a typical gas-heated home: RECS measures the gas burned for space heating;
 * the house received that times the furnace efficiency.
 */
export const heatNeed = (gasMmbtuBurned: number): number => gasMmbtuBurned * STOCK_GAS_EFFICIENCY;

/**
 * Electricity price (cents/kWh) at which a heat pump costs the same as a gas furnace, given the
 * gas price ($/Mcf) and both efficiencies. Below it, the heat pump is cheaper to run.
 */
export function breakEvenElectricity(gasPerMcf: number, afue: number, hspf2: number): number {
  const gasPerMmbtu = gasPerMcf / ((BTU.mcf * afue) / 1e6);
  return ((gasPerMmbtu * BTU.kwh * heatPumpCop(hspf2)) / 1e6) * 100;
}

export interface SystemCost {
  system: HeatingSystem;
  price: number;
  efficiency: number;
  perMmbtu: number;
  perYear: number;
  units: number;
}

/** Yearly cost of `mmbtu` of heat with every system, cheapest first. */
export function compareSystems(
  mmbtu: number,
  prices: Record<SystemId, number>,
  efficiencies: Record<SystemId, number> = defaultEfficiencies(),
): SystemCost[] {
  return SYSTEMS.map((system) => {
    const price = prices[system.id];
    const efficiency = efficiencies[system.id];
    const perMmbtu = costPerMmbtu(system, price, efficiency);
    return {
      system,
      price,
      efficiency,
      perMmbtu,
      perYear: perMmbtu * mmbtu,
      units: fuelUnits(system, mmbtu, efficiency),
    };
  }).sort((a, b) => a.perYear - b.perYear);
}

/**
 * First of `costs` (sorted cheapest first) whose system is not in `excluded`: a fuel priced at
 * the U.S. average is too uncertain to call it the cheapest in a state.
 */
export const cheapestOf = (costs: SystemCost[], excluded: readonly SystemId[]): SystemCost =>
  costs.find((c) => !excluded.includes(c.system.id)) ?? costs[0]!;

export const defaultEfficiencies = (): Record<SystemId, number> =>
  Object.fromEntries(SYSTEMS.map((s) => [s.id, s.efficiency])) as Record<SystemId, number>;

/** Natural gas $/Mcf → $/therm (what most gas bills show). */
export const perTherm = (perMcf: number): number => perMcf / (BTU.mcf / BTU.therm);

// --- Adjustments the visitor can make to the typical home -------------------------------------

/**
 * Floor area of the typical gas-heated home in a census division. RECS 2020 publishes heated
 * area for all homes by division and for gas-heated homes only nationally, so we scale the
 * division figure by the national gas-heated / all-homes ratio (1,837 / 1,614 sq ft in 2020).
 */
export const typicalGasHomeArea = (
  divisionHeatedSqft: number,
  usAllSqft: number,
  usGasSqft: number,
): number => divisionHeatedSqft * (usGasSqft / usAllSqft);

/**
 * Insulation steps. RECS does not measure how much heat insulation saves in a given house, so
 * these are labelled sensitivity steps (±20%), not measured factors.
 */
export const INSULATION = {
  better: { label: 'Better than typical (−20%)', factor: 0.8 },
  typical: { label: 'Typical', factor: 1 },
  worse: { label: 'Worse than typical (+20%)', factor: 1.2 },
} as const;
export type Insulation = keyof typeof INSULATION;

/**
 * Heat a home needs, scaled from the typical home: by floor area (heat need roughly follows the
 * heated area) and by the insulation step.
 */
export function adjustHeat(
  typicalMmbtu: number,
  opts: { sqft?: number | undefined; typicalSqft: number; insulation: Insulation },
): number {
  const area = opts.sqft && opts.sqft > 0 ? opts.sqft / opts.typicalSqft : 1;
  return typicalMmbtu * area * INSULATION[opts.insulation].factor;
}

/**
 * HSPF2-equivalent of a heat pump once cold weather and backup heat are counted.
 * `derate`: fraction by which the seasonal efficiency falls short of the rating (HSPF2 is rated
 * for a moderate climate). `backupShare`: fraction of the season's heat supplied by electric
 * resistance strips (COP 1). Energy per unit of heat is the weighted sum of both.
 */
export function effectiveHspf(hspf2: number, derate: number, backupShare: number): number {
  const cop = heatPumpCop(hspf2) * (1 - derate);
  const effectiveCop = 1 / ((1 - backupShare) / cop + backupShare);
  return effectiveCop * 3.412;
}

export interface Ownership {
  /** Running cost per year, dollars. */
  running: number;
  install?: number | undefined;
  maintenance?: number | undefined;
  /** Other fixed costs per year that go with the system (gas customer charge, tank rental). */
  fixed?: number | undefined;
}

/** Undiscounted total cost over `years`: installation plus yearly running, upkeep and fixed costs. */
export const totalCost = (o: Ownership, years: number): number =>
  (o.install ?? 0) + years * (o.running + (o.maintenance ?? 0) + (o.fixed ?? 0));

/**
 * Years until a system that costs `extraInstall` more pays it back from `yearlySavings`.
 * Undefined when it never does.
 */
export const simplePayback = (extraInstall: number, yearlySavings: number): number | undefined =>
  yearlySavings > 0 && extraInstall >= 0 ? extraInstall / yearlySavings : undefined;

/** Running cost per year of one system after changing its price by `pricePct` percent. */
export function costAt(
  system: SystemId,
  mmbtu: number,
  price: number,
  efficiency: number,
  pricePct = 0,
): number {
  const s = SYSTEMS.find((x) => x.id === system)!;
  return costPerMmbtu(s, price * (1 + pricePct / 100), efficiency) * mmbtu;
}
