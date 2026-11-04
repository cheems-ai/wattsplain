// The "cheapest way to heat a home in each state" table on /tools/heating-cost-calculator/ as CSV,
// for reporters and anyone who wants to reuse or check it (research report 2026-11-04: winter
// heating data by state is what local newsrooms pick up). Same numbers as the page.
import type { APIRoute } from 'astro';

import { ELECTRIC_BASIS, HEATING, HEATING_ROWS } from '../../data/heating';
import type { SystemId } from '../../lib/heating';

const SYSTEMS: SystemId[] = ['heat-pump', 'gas', 'propane', 'oil', 'electric'];
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export const GET: APIRoute = () => {
  const header = [
    'state',
    'code',
    'heat_needed_mmbtu_per_year',
    'typical_home_sqft',
    'electricity_cents_per_kwh',
    'natural_gas_usd_per_mcf',
    'propane_usd_per_gallon',
    'heating_oil_usd_per_gallon',
    ...SYSTEMS.map((id) => `cost_${id.replace('-', '_')}_usd_per_year`),
    'cheapest',
    'price_notes',
  ];
  const rows = [...HEATING_ROWS]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => {
      const cost = (id: SystemId) => r.costs.find((c) => c.system.id === id)!.perYear;
      const notes = Object.entries(r.notes)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      return [
        q(r.name),
        r.code,
        r.heat.toFixed(1),
        Math.round(r.typicalSqft),
        r.prices.electric.toFixed(2),
        r.prices.gas.toFixed(2),
        r.prices.propane.toFixed(3),
        r.prices.oil.toFixed(3),
        ...SYSTEMS.map((id) => cost(id).toFixed(0)),
        q(r.cheapest.system.name),
        q(notes),
      ].join(',');
    });
  const notes = [
    `# Yearly running cost of heating the typical gas-heated home in each state (heat need: EIA RECS ${HEATING.recs.survey}), new heat pump HSPF2 7.8, 95% gas or propane furnace, 85% oil furnace, electric baseboard 100%.`,
    `# Prices: EIA. Propane and heating oil: week of ${HEATING.propane.week} (state, else regional, else U.S. average as noted). Natural gas: 12 months to ${HEATING.gas.period}. Electricity: ${ELECTRIC_BASIS.label} ${ELECTRIC_BASIS.from} to ${ELECTRIC_BASIS.to}.`,
    `# Compiled by Wattsplain (https://wattsplain.com/tools/heating-cost-calculator/), checked ${HEATING.fetchedAt}. Method: https://wattsplain.com/methodology/`,
  ];
  return new Response(`${[...notes, header.join(','), ...rows].join('\n')}\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
