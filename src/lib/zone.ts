// Space heater vs central heat: does warming one room with a space heater, while the rest of the
// home is turned down, cost less than heating the whole home? And the same question at night for
// an electric blanket. Heat in million Btu (MMBtu) delivered; electricity in cents/kWh.
import { BTU } from './heating.ts';

/**
 * DOE: turning the thermostat back 7–10°F for 8 hours a day can save up to 10% a year on heating
 * (energy.gov, "Thermostats"), so about 1% of the year's heating per °F per 8 hours.
 */
export const SAVING_PER_DEGREE_PER_8H = 0.01;
/** A single rule of thumb should not be stretched to claim more than this share. */
export const MAX_SAVING_SHARE = 0.5;
/**
 * The warm room also loses heat through inside walls and doors to the cooler rooms around it, so
 * it needs more than its floor-area share of the home's heat. An assumption, shown to visitors.
 */
export const ROOM_EXTRA_LOSS = 0.25;
/** The coldest days need about twice the season's average heat (sizing check only). */
const PEAK_TO_AVERAGE = 2;

/** Share of the home's yearly heating cost saved by turning it down `degreesF` for `hours` a day. */
export const setbackShare = (degreesF: number, hoursPerDay: number): number =>
  Math.min(SAVING_PER_DEGREE_PER_8H * degreesF * (hoursPerDay / 8), MAX_SAVING_SHARE);

export interface ZoneInput {
  /** Heat the whole home receives in a year, MMBtu. */
  homeHeat: number;
  homeSqft: number;
  /** What that heat costs a year with the home's own system, dollars. */
  homeCost: number;
  roomSqft: number;
  /** Hours a day the heater runs while the rest of the home is turned down. */
  hoursPerDay: number;
  setbackF: number;
  centsPerKwh: number;
  heaterWatts: number;
  /** Days in the heating season, for the sizing check. */
  seasonDays: number;
  /** The visitor's own estimate of the share saved (0–1), instead of the DOE rule. */
  savingShare?: number | undefined;
}

export interface ZoneResult {
  savingShare: number;
  homeSaving: number;
  roomHeat: number;
  heaterKwh: number;
  heaterCost: number;
  /** Heater cost minus central heating saved: below zero the heater saves money. */
  net: number;
  /** Average heater output while it runs, watts. */
  averageWatts: number;
  /** The heater is too small to keep the room warm on the coldest days. */
  undersized: boolean;
}

export function validateZone(i: ZoneInput): string | null {
  if (!(i.homeSqft > 0)) return 'Enter the heated area of your home in square feet.';
  if (!(i.roomSqft > 0) || i.roomSqft >= i.homeSqft)
    return 'The room must be smaller than the whole home.';
  if (!(i.hoursPerDay > 0 && i.hoursPerDay <= 24)) return 'Hours a day must be 1–24.';
  if (!(i.setbackF >= 0 && i.setbackF <= 20)) return 'Turn the home down by 0–20°F.';
  if (!(i.heaterWatts > 0)) return 'Enter the heater wattage, e.g. 1500.';
  if (i.savingShare !== undefined && !(i.savingShare >= 0 && i.savingShare <= 1))
    return 'The share saved must be 0–100%.';
  return null;
}

export function zoneHeating(i: ZoneInput): ZoneResult {
  const savingShare = i.savingShare ?? setbackShare(i.setbackF, i.hoursPerDay);
  const homeSaving = i.homeCost * savingShare;
  const roomHeat =
    i.homeHeat * (i.roomSqft / i.homeSqft) * (i.hoursPerDay / 24) * (1 + ROOM_EXTRA_LOSS);
  // A space heater turns every kWh into 3,412 Btu of heat in the room.
  const heaterKwh = (roomHeat * 1e6) / BTU.kwh;
  const heaterCost = (heaterKwh * i.centsPerKwh) / 100;
  const runHours = i.hoursPerDay * i.seasonDays;
  const averageWatts = runHours > 0 ? (heaterKwh * 1000) / runHours : 0;
  return {
    savingShare,
    homeSaving,
    roomHeat,
    heaterKwh,
    heaterCost,
    net: heaterCost - homeSaving,
    averageWatts,
    undersized: averageWatts * PEAK_TO_AVERAGE > i.heaterWatts,
  };
}

export interface BlanketInput {
  homeCost: number;
  /** °F the home is turned down at night and hours a night. */
  setbackF: number;
  hours: number;
  watts: number;
  nights: number;
  centsPerKwh: number;
  savingShare?: number | undefined;
}

/** Electric blanket at its rated wattage all night (an upper bound) vs the night setback saved. */
export function blanketNights(i: BlanketInput) {
  const savingShare = i.savingShare ?? setbackShare(i.setbackF, i.hours);
  const homeSaving = i.homeCost * savingShare;
  const kwh = (i.watts * i.hours * i.nights) / 1000;
  const cost = (kwh * i.centsPerKwh) / 100;
  return { savingShare, homeSaving, kwh, cost, net: cost - homeSaving };
}
