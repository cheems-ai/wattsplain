import { useEffect, useState } from 'preact/hooks';

/**
 * Selected state, prefilled from ?state=XX so state pages can deep-link. The page is prerendered
 * with `fallback`, so the island first renders that (hydration must match the HTML) and switches
 * after hydration; `ready` turns true at that point. The layout hides `.tool` content while a
 * ?state= link is still showing the fallback (see Base.astro), so a Texas visitor never reads
 * Pennsylvania numbers.
 */
export function useStateCode(codes: readonly { code: string }[], fallback = 'PA') {
  const [code, setCode] = useState(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('state')?.toUpperCase();
    if (q && codes.some((r) => r.code === q)) setCode(q);
    setReady(true);
  }, [codes]);
  return { code, setCode, ready };
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
