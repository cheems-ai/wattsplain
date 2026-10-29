// Energy use of one appliance over a year. Nameplate watts × hours overstates anything with a
// thermostat or compressor, and many loads are seasonal, so the profile separates:
//   on-time (hours per day, days per week, months per year),
//   the share of on-time the appliance actually draws its power (duty cycle),
//   standby draw for the rest of the year.

export const HOURS_PER_YEAR = 8760;
/** "Per month" figures are for a 30-day month (a typical billing period). */
export const DAYS_PER_MONTH = 30;

export interface UsageProfile {
  /** Power while running, watts (label or measured). */
  watts: number;
  /** Hours a day it is switched on, on the days it is used. */
  hoursPerDay: number;
  /** Fraction of those hours it draws `watts` (1 = always; a fridge compressor ≈ 1/3). */
  dutyCycle: number;
  daysPerWeek: number;
  monthsPerYear: number;
  /** Draw while plugged in but not running, watts. Counted for every other hour of the year. */
  standbyWatts: number;
}

export interface ApplianceEnergy {
  /** kWh on a day it is used (running part only). */
  kwhPerUseDay: number;
  daysPerYear: number;
  runningKwhPerYear: number;
  standbyKwhPerYear: number;
  kwhPerYear: number;
  /** A 30-day month in the season it is used, including standby. */
  kwhPerMonthInUse: number;
}

export function validateProfile(p: UsageProfile): string | null {
  if (!(p.watts > 0)) return 'Enter the power in watts.';
  if (!(p.hoursPerDay >= 0 && p.hoursPerDay <= 24)) return 'Hours per day must be 0–24.';
  if (!(p.dutyCycle > 0 && p.dutyCycle <= 1)) return 'Running share must be 1–100%.';
  if (!(p.daysPerWeek >= 0 && p.daysPerWeek <= 7)) return 'Days per week must be 0–7.';
  if (!(p.monthsPerYear >= 0 && p.monthsPerYear <= 12)) return 'Months per year must be 0–12.';
  if (!(p.standbyWatts >= 0 && p.standbyWatts < p.watts))
    return 'Standby must be below the running power.';
  return null;
}

export function applianceEnergy(p: UsageProfile): ApplianceEnergy {
  const kwhPerUseDay = (p.watts * p.dutyCycle * p.hoursPerDay) / 1000;
  const daysPerYear = 365 * (p.daysPerWeek / 7) * (p.monthsPerYear / 12);
  const runningKwhPerYear = kwhPerUseDay * daysPerYear;
  const onHours = p.hoursPerDay * daysPerYear;
  const standbyKwhPerYear = (p.standbyWatts * (HOURS_PER_YEAR - onHours)) / 1000;
  const useDaysPerMonth = DAYS_PER_MONTH * (p.daysPerWeek / 7);
  const kwhPerMonthInUse =
    kwhPerUseDay * useDaysPerMonth +
    (p.standbyWatts * (DAYS_PER_MONTH * 24 - p.hoursPerDay * useDaysPerMonth)) / 1000;
  return {
    kwhPerUseDay,
    daysPerYear,
    runningKwhPerYear,
    standbyKwhPerYear,
    kwhPerYear: runningKwhPerYear + standbyKwhPerYear,
    kwhPerMonthInUse,
  };
}

/** Same shape from a label figure (EnergyGuide kWh per year), spread evenly over the year. */
export function fromYearlyKwh(kwhPerYear: number): ApplianceEnergy {
  return {
    kwhPerUseDay: kwhPerYear / 365,
    daysPerYear: 365,
    runningKwhPerYear: kwhPerYear,
    standbyKwhPerYear: 0,
    kwhPerYear,
    kwhPerMonthInUse: (kwhPerYear / 365) * DAYS_PER_MONTH,
  };
}

/** Room air conditioner power from its label: capacity (Btu/h) ÷ EER or CEER (Btu/h per watt). */
export const wattsFromBtu = (btuPerHour: number, eer: number): number => btuPerHour / eer;

export const cost = (kwh: number, centsPerKwh: number): number => (kwh * centsPerKwh) / 100;
