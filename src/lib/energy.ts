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
 * Two-factor Shapley split of the change in a product a·b: the part due to a and the part due to b
 * always add up exactly to a1·b1 − a0·b0 and do not depend on which value is taken as the base.
 */
export const shapley = (a0: number, a1: number, b0: number, b1: number): [number, number] => [
  ((a1 - a0) * (b0 + b1)) / 2,
  ((b1 - b0) * (a0 + a1)) / 2,
];

/**
 * Splits the change between two bills into a rate part and a usage part. Uses the symmetric
 * (Shapley) split, so the two parts always add up exactly to the change and do not depend on
 * which bill is taken as the base.
 */
export function compareBills(prev: Bill, now: Bill): BillChange {
  if (prev.kwh <= 0 || now.kwh <= 0) throw new RangeError('kWh must be greater than 0');
  const r0 = prev.dollars / prev.kwh;
  const r1 = now.dollars / now.kwh;
  const [rateEffect, usageEffect] = shapley(r0, r1, prev.kwh, now.kwh);
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

/** One bill with the optional lines most US bills print. Money in dollars. */
export interface BillDetail {
  kwh: number;
  total: number;
  /** Days in the billing period. */
  days?: number;
  /** Fixed monthly charges (customer, service or basic charge), paid even at 0 kWh. */
  fixed?: number;
  /** Taxes, fees and surcharges shown as separate lines. */
  taxes?: number;
  /** Credits, discounts and other adjustments that lowered the bill, as a positive amount. */
  credits?: number;
}

export type BillPartId = 'daily-use' | 'days' | 'usage' | 'price' | 'fixed' | 'taxes' | 'credits';

export interface BillPart {
  id: BillPartId;
  amount: number;
}

export interface BillAnalysis {
  change: number;
  changePct: number;
  /** Contributions to the change; they add up exactly to `change`. Zero parts are left out. */
  parts: BillPart[];
  /** Total ÷ kWh, ¢/kWh: includes fixed charges, taxes and credits. */
  allInPrev: number;
  allInNow: number;
  /** Energy charges ÷ kWh, ¢/kWh: what each kWh cost before fixed charges, taxes and credits. */
  energyPrev: number;
  energyNow: number;
  /** kWh per day, when both billing periods were entered. */
  dailyPrev?: number;
  dailyNow?: number;
  /** The largest part, or undefined when the bills are within $1. */
  main?: BillPartId;
}

/** Energy charges: the part of the bill that scales with kWh. */
export const energyCharges = (b: BillDetail): number =>
  b.total - (b.fixed ?? 0) - (b.taxes ?? 0) + (b.credits ?? 0);

export function validateBill(b: BillDetail): string | null {
  if (!(b.kwh > 0)) return 'kWh must be more than 0 on both bills.';
  if (!(b.total >= 0)) return 'Enter the bill total.';
  if (b.days !== undefined && !(b.days >= 1 && b.days <= 62))
    return 'A billing period is usually 25–35 days; enter 1–62.';
  if (!(energyCharges(b) > 0))
    return 'Fixed charges and taxes are larger than the bill total. Check the numbers.';
  return null;
}

/**
 * Splits the change between two bills into exact contributions: usage (split further into
 * kWh per day and the number of days when both periods are known), the energy price per kWh,
 * fixed charges, taxes and fees, and credits. The usage/price split uses the Shapley rule, so
 * the parts always sum to the change in the total.
 */
export function analyzeBills(prev: BillDetail, now: BillDetail): BillAnalysis {
  const bad = validateBill(prev) ?? validateBill(now);
  if (bad) throw new RangeError(bad);
  const e0 = energyCharges(prev);
  const e1 = energyCharges(now);
  const p0 = e0 / prev.kwh;
  const p1 = e1 / now.kwh;
  const [price, usage] = shapley(p0, p1, prev.kwh, now.kwh);
  const parts: BillPart[] = [];
  let dailyPrev: number | undefined;
  let dailyNow: number | undefined;
  if (prev.days && now.days) {
    dailyPrev = prev.kwh / prev.days;
    dailyNow = now.kwh / now.days;
    // kWh = days × kWh per day; split the change in kWh the same way and price it at the
    // average energy price, so the two usage parts add up to `usage`.
    const [byDays, byDaily] = shapley(prev.days, now.days, dailyPrev, dailyNow);
    const avg = (p0 + p1) / 2;
    parts.push({ id: 'daily-use', amount: byDaily * avg }, { id: 'days', amount: byDays * avg });
  } else {
    parts.push({ id: 'usage', amount: usage });
  }
  parts.push(
    { id: 'price', amount: price },
    { id: 'fixed', amount: (now.fixed ?? 0) - (prev.fixed ?? 0) },
    { id: 'taxes', amount: (now.taxes ?? 0) - (prev.taxes ?? 0) },
    { id: 'credits', amount: -((now.credits ?? 0) - (prev.credits ?? 0)) },
  );
  const kept = parts.filter((p) => Math.abs(p.amount) >= 0.005);
  const change = now.total - prev.total;
  const main =
    Math.abs(change) < 1
      ? undefined
      : [...kept].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0]?.id;
  return {
    change,
    changePct: prev.total > 0 ? (change / prev.total) * 100 : 0,
    parts: kept,
    allInPrev: (prev.total / prev.kwh) * 100,
    allInNow: (now.total / now.kwh) * 100,
    energyPrev: p0 * 100,
    energyNow: p1 * 100,
    ...(dailyPrev !== undefined && dailyNow !== undefined ? { dailyPrev, dailyNow } : {}),
    ...(main ? { main } : {}),
  };
}

export const pctChange = (now: number, prev: number): number => ((now - prev) / prev) * 100;
