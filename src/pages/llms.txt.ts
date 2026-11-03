// /llms.txt (https://llmstxt.org): a plain-text map of the site for AI assistants and agents, with
// the current headline numbers. Built from the same data as the pages, so the monthly EIA refresh
// updates it too. Linked from the footer: agents mostly find these files through links.
import type { APIRoute } from 'astro';

import { SITE } from '../config/site';
import { ELECTRICITY, STATE_ROWS } from '../data/electricity';
import { TOOL_GROUPS } from '../data/tools';
import { cents, monthLabel, signedPct } from '../lib/format';

const url = (path: string) => new URL(path, SITE.origin).href;

export const GET: APIRoute = () => {
  const month = monthLabel(ELECTRICITY.monthly.period);
  const prior = monthLabel(ELECTRICITY.monthly.priorPeriod);
  const us = ELECTRICITY.us;
  const byName = [...STATE_ROWS].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description} Free, no sign-up, no sales offers. Every number names its source and date.`,
    '',
    `Latest data: ${month} residential electricity prices from the U.S. Energy Information Administration (EIA Electric Power Monthly Table 5.6.A, preliminary), released ${ELECTRICITY.monthly.released}, checked ${ELECTRICITY.fetchedAt}. The next EIA release is expected ${ELECTRICITY.monthly.nextRelease}; the site updates itself after it.`,
    '',
    `U.S. average residential price: ${cents(us.price)} per kWh in ${month}, ${signedPct(us.change)} from ${prior}. Typical U.S. home: ${us.avgKwh} kWh a month (EIA, ${ELECTRICITY.annual.year}).`,
    '',
    '## Data',
    '',
    `- [Electricity rates by state](${url('/electricity-rates/')}): price per kWh in every state and DC, year-over-year change, rank, average use and bill`,
    `- [Price changes over 12 months](${url('/electricity-rates/price-changes/')}): how much each state's price rose, and what that adds to a typical bill`,
    `- [Price changes as CSV](${url('/data/electricity-price-changes.csv')}): the same table for reuse`,
    `- [Data & methodology](${url('/methodology/')}): sources, formulas and assumptions behind every calculator`,
    '',
    '## Tools',
    '',
    ...TOOL_GROUPS.flatMap((g) => g.tools.map((t) => `- [${t.title}](${url(t.href)}): ${t.text}`)),
    `- [All tools](${url('/tools/')})`,
    '',
    '## Guides',
    '',
    `- [Why is my electric bill so high in winter?](${url('/guides/why-is-my-electric-bill-so-high-in-winter/')}): heating load, heat pump backup heat, shorter days and seasonal prices`,
    `- [How much propane does it take to heat a house?](${url('/guides/how-much-propane-to-heat-a-house/')}): gallons a year and month by house size and state`,
    '',
    `## Electricity rates by state (${month})`,
    '',
    ...byName.map(
      (s) =>
        `- [${s.name}](${url(`/electricity-rates/${s.slug}/`)}): ${cents(s.price)} per kWh, ${signedPct(s.change)} vs ${prior}`,
    ),
    '',
    '## About',
    '',
    `- [About](${url('/about/')})`,
    `- [Terms of use](${url('/terms/')}): reuse of the data and text`,
    `- [Contact](${url('/contact/')}): ${SITE.contactEmail}`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
