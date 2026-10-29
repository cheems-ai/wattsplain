// The table on /electricity-rates/price-changes/ as CSV, for anyone who wants to reuse or check it.
import type { APIRoute } from 'astro';

import {
  ELECTRICITY,
  HISTORY,
  PJM_STATES,
  PRICE_CHANGES,
  STATE_ROWS,
  US_PRICE_CHANGE,
} from '../../data/electricity';

export const GET: APIRoute = () => {
  if (!HISTORY || !US_PRICE_CHANGE) throw new Error('price changes need the EIA history');
  const p = HISTORY.periods;
  const header = [
    'state',
    'code',
    `avg_cents_per_kwh_${p.at(-12)}_to_${p.at(-1)}`,
    `avg_cents_per_kwh_${p[0]}_to_${p[11]}`,
    'change_12m_pct',
    'bill_effect_usd_per_month',
    'typical_kwh_per_month',
    `change_${p.at(-1)}_vs_${p.at(-13)}_pct`,
    'pjm',
  ];
  const line = (name: string, code: string, kwh: number, c: typeof US_PRICE_CHANGE, pjm: string) =>
    [
      `"${name}"`,
      code,
      c.avg12.toFixed(3),
      c.avgPrior12.toFixed(3),
      c.change12.toFixed(2),
      c.billEffect.toFixed(2),
      kwh,
      c.changeMonth.toFixed(2),
      pjm,
    ].join(',');
  const rows = PRICE_CHANGES.map((c) => {
    const s = STATE_ROWS.find((x) => x.code === c.code)!;
    return line(s.name, c.code, s.avgKwh, c, PJM_STATES.has(c.code) ? 'yes' : 'no');
  });
  rows.push(line('United States', 'US', ELECTRICITY.us.avgKwh, US_PRICE_CHANGE, ''));
  const notes = [
    `# Source: U.S. Energy Information Administration, monthly average residential price (${HISTORY.source}); typical use: EIA ${ELECTRICITY.annual.year}. Compiled by Wattsplain (https://wattsplain.com/electricity-rates/price-changes/), checked ${ELECTRICITY.fetchedAt}.`,
  ];
  return new Response(`${[...notes, header.join(','), ...rows].join('\n')}\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
