import type { APIRoute } from 'astro';

import { SITE } from '../config/site';
import { STATE_ROWS } from '../data/electricity';

const paths = [
  '/',
  '/electricity-rates/',
  '/electricity-rates/price-changes/',
  ...STATE_ROWS.map((s) => `/electricity-rates/${s.slug}/`),
  '/tools/',
  '/tools/home-energy-savings-planner/',
  '/tools/why-is-my-electric-bill-high/',
  '/tools/electric-bill-diagnosis/',
  '/tools/appliance-electricity-cost/',
  '/tools/space-heater-cost/',
  '/tools/heating-cost-calculator/',
  '/about/',
  '/methodology/',
  '/privacy/',
  '/terms/',
  '/contact/',
];

export const GET: APIRoute = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
      .map((p) => `  <url><loc>${new URL(p, SITE.origin).href}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
