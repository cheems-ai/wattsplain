const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** '2026-08' → 'August 2026' */
export const monthLabel = (period: string): string => {
  const [y, m] = period.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

export const dollars = (n: number, digits = 2): string =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** Cents per kWh, e.g. 21.77 → '21.77¢' */
export const cents = (n: number): string => `${n.toFixed(2)}¢`;

export const signedPct = (n: number, digits = 1): string =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`;

export const kwh = (n: number): string => `${Math.round(n).toLocaleString('en-US')} kWh`;
