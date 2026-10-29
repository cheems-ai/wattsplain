// Pure calculations behind every tool. All money in US dollars, prices in cents per kWh.

export const DAYS_PER_MONTH = 30;

export interface RunningCost {
  kwhPerDay: number;
  perHour: number;
  perDay: number;
  perMonth: number;
  perYear: number;
}

/** Cost of running a load of `watts` for `hoursPerDay` at `centsPerKwh`. */
export function runningCost(watts: number, hoursPerDay: number, centsPerKwh: number): RunningCost {
  const dollarsPerKwh = centsPerKwh / 100;
  const kwhPerHour = watts / 1000;
  const kwhPerDay = kwhPerHour * hoursPerDay;
  const perDay = kwhPerDay * dollarsPerKwh;
  return {
    kwhPerDay,
    perHour: kwhPerHour * dollarsPerKwh,
    perDay,
    perMonth: perDay * DAYS_PER_MONTH,
    perYear: perDay * 365,
  };
}

/**
 * A price per kWh as a visitor types it, in cents. Bills print it either way (18.2¢ or $0.182), so
 * a "$" or a value under 1 is read as dollars: no US home pays less than 1¢ per kWh. Null when
 * nothing usable was typed.
 */
export function parseRate(s: string): number | null {
  const n = Number(s.replace(/[^0-9.]/g, ''));
  if (s.trim() === '' || !Number.isFinite(n) || n <= 0) return null;
  return s.includes('$') || n < 1 ? n * 100 : n;
}

export interface Bill {
  kwh: number;
  dollars: number;
}

export interface BillChange {
  change: number;
  changePct: number;
  /** Effective rate (total bill ÷ kWh, so it includes fixed charges and taxes), cents/kWh. */
  ratePrev: number;
  rateNow: number;
  /** Part of the change caused by the higher or lower effective rate. */
  rateEffect: number;
  /** Part of the change caused by using more or fewer kWh. */
  usageEffect: number;
  driver: 'rate' | 'usage' | 'both' | 'none';
}

/**
 * Splits the change between two bills into a rate part and a usage part. Uses the symmetric
 * (Shapley) split, so the two parts always add up exactly to the change and do not depend on
 * which bill is taken as the base.
 */
export function compareBills(prev: Bill, now: Bill): BillChange {
  if (prev.kwh <= 0 || now.kwh <= 0) throw new RangeError('kWh must be greater than 0');
  const r0 = prev.dollars / prev.kwh;
  const r1 = now.dollars / now.kwh;
  const rateEffect = ((r1 - r0) * (prev.kwh + now.kwh)) / 2;
  const usageEffect = ((now.kwh - prev.kwh) * (r0 + r1)) / 2;
  const change = now.dollars - prev.dollars;
  const small = Math.max(1, Math.abs(change) * 0.25);
  let driver: BillChange['driver'];
  if (Math.abs(change) < 1) driver = 'none';
  else if (Math.abs(rateEffect) < small) driver = 'usage';
  else if (Math.abs(usageEffect) < small) driver = 'rate';
  else
    driver =
      Math.sign(rateEffect) === Math.sign(usageEffect)
        ? 'both'
        : Math.abs(rateEffect) > Math.abs(usageEffect)
          ? 'rate'
          : 'usage';
  return {
    change,
    changePct: prev.dollars > 0 ? (change / prev.dollars) * 100 : 0,
    ratePrev: r0 * 100,
    rateNow: r1 * 100,
    rateEffect,
    usageEffect,
    driver,
  };
}

export const pctChange = (now: number, prev: number): number => ((now - prev) / prev) * 100;
