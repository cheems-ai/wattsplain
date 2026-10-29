import { useEffect, useState } from 'preact/hooks';

import type { RateOption } from '../data/electricity';
import { parseRate } from '../lib/energy';

/**
 * Selected state (prefilled from ?state=XX so state pages can deep-link) plus an optional
 * user-entered rate in cents/kWh that overrides the state average.
 */
export function useStateRate(rates: readonly RateOption[], fallback = 'PA') {
  const [code, setCode] = useState(fallback);
  const [custom, setCustom] = useState(() => initial('ac-rate', ''));
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('state')?.toUpperCase();
    if (q && rates.some((r) => r.code === q)) setCode(q);
  }, [rates]);
  const state = rates.find((r) => r.code === code) ?? rates[0]!;
  const customNum = parseRate(custom);
  const useCustom = customNum !== null;
  return {
    code,
    setCode,
    custom,
    setCustom,
    state,
    rate: customNum ?? state.price,
    useCustom,
  };
}

/**
 * Initial value for a controlled field: what is already in the server-rendered input when the
 * island hydrates (a visitor on a slow connection may type before the JavaScript arrives), else
 * the default. Without this, hydration would reset the field and lose what they typed.
 */
export function initial(id: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el && el.value !== '' && el.value !== fallback ? el.value : fallback;
}

export const num = (s: string): number | null => {
  const n = Number(s.replace(/[$,\s]/g, ''));
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};
