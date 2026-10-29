// Which electricity price a calculation uses. The EIA state figure is an *average* (total revenue ÷
// kWh sold), so fixed monthly charges are spread over every kWh; the price of one more kWh on a
// visitor's own bill can be higher or lower. Every tool lets the visitor choose the basis.

export type RateMode = 'state' | 'custom' | 'bill' | 'tou';
export type RateUnit = 'cents' | 'dollars';

export const RATE_MODES: readonly { id: RateMode; label: string }[] = [
  { id: 'state', label: 'State average (EIA)' },
  { id: 'custom', label: 'My own price per kWh' },
  { id: 'bill', label: 'Work it out from my bill' },
  { id: 'tou', label: 'Time-of-use (peak / off-peak)' },
];

/** What the visitor typed for each rate basis. Strings, as in the form fields. */
export interface RateInput {
  mode: RateMode;
  unit: RateUnit;
  custom: string;
  /** From a bill: total amount, kWh, and the fixed monthly charges printed on it. */
  billTotal: string;
  billKwh: string;
  billFixed: string;
  /** Time-of-use: the two prices and the share of kWh used in peak hours (percent). */
  peak: string;
  offPeak: string;
  peakShare: string;
}

export const DEFAULT_RATE_INPUT: RateInput = {
  mode: 'state',
  unit: 'cents',
  custom: '',
  billTotal: '',
  billKwh: '',
  billFixed: '',
  peak: '',
  offPeak: '',
  peakShare: '30',
};

/** Prices outside this band are almost certainly typos (a cents value typed as dollars or the reverse). */
export const PLAUSIBLE_CENTS = { min: 1, max: 150 } as const;

const toNumber = (s: string): number | null => {
  const t = s.replace(/[$,¢\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export interface ParsedPrice {
  cents: number | null;
  /** Set when we read the number differently from the selected unit, so the page can say so. */
  note?: string;
  error?: string;
}

/**
 * A price per kWh typed in the selected unit, in cents. Bills print it either way (18.2¢ or
 * $0.182): a "$" sign, or a value under 1 in cents mode, is read as dollars and the note says so.
 */
export function parsePrice(s: string, unit: RateUnit): ParsedPrice {
  const n = toNumber(s);
  if (n === null) return { cents: null };
  if (n <= 0) return { cents: null, error: 'Enter a price above zero.' };
  let cents = unit === 'dollars' || s.includes('$') ? n * 100 : n;
  let note: string | undefined;
  if (unit === 'cents' && !s.includes('$') && n < 1) {
    cents = n * 100;
    note = `Read as $${n} per kWh = ${round2(cents)}¢.`;
  } else if (unit === 'dollars' && n >= 1) {
    // "18" in dollar mode is far more likely to be 18¢ than $18 per kWh.
    cents = n;
    note = `Read as ${round2(n)}¢ per kWh ($${(n / 100).toFixed(4)}).`;
  }
  if (cents < PLAUSIBLE_CENTS.min || cents > PLAUSIBLE_CENTS.max)
    return {
      cents: null,
      error: `${round2(cents)}¢ per kWh is outside the range of U.S. home prices (about ${PLAUSIBLE_CENTS.min}–${PLAUSIBLE_CENTS.max}¢). Check the unit.`,
    };
  return note ? { cents, note } : { cents };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ResolvedRate {
  /** Price in cents per kWh, or null while the chosen basis is incomplete or invalid. */
  cents: number | null;
  mode: RateMode;
  /** Short description for results, e.g. "your bill: (total − fixed) ÷ kWh". */
  label: string;
  /** True when the number is the price of an extra kWh rather than an all-in average. */
  marginal: boolean;
  note?: string;
  error?: string;
}

/**
 * The price per kWh for the chosen basis. `statePrice` (cents) is the EIA average for the
 * selected state; `stateLabel` describes it ("Texas average, August 2026").
 */
export function resolveRate(
  input: RateInput,
  statePrice: number,
  stateLabel: string,
): ResolvedRate {
  switch (input.mode) {
    case 'state':
      return { cents: statePrice, mode: 'state', label: stateLabel, marginal: false };
    case 'custom': {
      const p = parsePrice(input.custom, input.unit);
      return { ...p, mode: 'custom', label: 'your price', marginal: true };
    }
    case 'bill': {
      const r = billRate(input);
      return { ...r, mode: 'bill', label: 'your bill, excluding fixed charges', marginal: true };
    }
    case 'tou': {
      const r = touRate(input);
      return { ...r, mode: 'tou', label: 'your time-of-use blend', marginal: true };
    }
  }
}

/**
 * Price of an extra kWh estimated from one bill: (total − fixed monthly charges) ÷ kWh. Taxes
 * and per-kWh riders stay in, because they grow with use. Without the fixed charge this is the
 * all-in average, which overstates the cost of extra use.
 */
export function billRate(input: Pick<RateInput, 'billTotal' | 'billKwh' | 'billFixed'>): {
  cents: number | null;
  error?: string;
  note?: string;
} {
  const total = toNumber(input.billTotal);
  const kwh = toNumber(input.billKwh);
  const fixed = toNumber(input.billFixed) ?? 0;
  if (total === null || kwh === null) return { cents: null };
  if (input.billFixed.trim() !== '' && toNumber(input.billFixed) === null)
    return { cents: null, error: 'Enter the fixed charge as a number of dollars, e.g. 12.50.' };
  if (kwh <= 0) return { cents: null, error: 'kWh must be more than 0.' };
  if (total <= 0) return { cents: null, error: 'Enter the bill total in dollars.' };
  if (fixed < 0 || fixed >= total)
    return { cents: null, error: 'Fixed charges must be less than the bill total.' };
  const cents = ((total - fixed) / kwh) * 100;
  if (cents < PLAUSIBLE_CENTS.min || cents > PLAUSIBLE_CENTS.max)
    return {
      cents: null,
      error: `That works out to ${round2(cents)}¢ per kWh, which looks wrong. Check the kWh and the total.`,
    };
  return input.billFixed.trim() === ''
    ? {
        cents,
        note: 'No fixed charge entered, so this is your all-in average. Add the monthly customer or service charge for the price of an extra kWh.',
      }
    : { cents };
}

/** Blended price when `peakShare` percent of the kWh are used at the peak price. */
export function touRate(input: Pick<RateInput, 'peak' | 'offPeak' | 'peakShare' | 'unit'>): {
  cents: number | null;
  error?: string;
  note?: string;
} {
  const peak = parsePrice(input.peak, input.unit);
  const off = parsePrice(input.offPeak, input.unit);
  const share = toNumber(input.peakShare);
  const bad = peak.error ?? off.error;
  if (bad) return { cents: null, error: bad };
  if (peak.cents === null || off.cents === null) return { cents: null };
  if (share === null || share < 0 || share > 100)
    return { cents: null, error: 'Peak share must be between 0 and 100%.' };
  return { cents: blend(peak.cents, off.cents, share / 100) };
}

export const blend = (peak: number, offPeak: number, peakFraction: number): number =>
  peak * peakFraction + offPeak * (1 - peakFraction);
