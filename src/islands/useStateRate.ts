import { useEffect, useState } from 'preact/hooks';

import type { RateOption } from '../data/electricity';

/**
 * Selected state (prefilled from ?state=XX so state pages can deep-link) plus an optional
 * user-entered rate in cents/kWh that overrides the state average.
 */
export function useStateRate(rates: readonly RateOption[], fallback = 'PA') {
  const [code, setCode] = useState(fallback);
  const [custom, setCustom] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('state')?.toUpperCase();
    if (q && rates.some((r) => r.code === q)) setCode(q);
  }, [rates]);
  const state = rates.find((r) => r.code === code) ?? rates[0]!;
  const customNum = Number(custom);
  const useCustom = custom.trim() !== '' && Number.isFinite(customNum) && customNum > 0;
  return {
    code,
    setCode,
    custom,
    setCustom,
    state,
    rate: useCustom ? customNum : state.price,
    useCustom,
  };
}

export const num = (s: string): number | null => {
  const n = Number(s.replace(/[$,\s]/g, ''));
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};
