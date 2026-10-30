// Site identity. Domain registered by the owner 2026-10-29; live and indexable since 2026-10-29.
// Setting `indexable` to false puts noindex on every page (also change public/robots.txt).
export const SITE = {
  name: 'Wattsplain',
  origin: 'https://wattsplain.com',
  indexable: true,
  contactEmail: 'cayetanoqt@proton.me',
  description:
    'What electricity really costs in your state: monthly EIA prices, a bill checker that shows why your bill went up, and appliance cost calculators.',
} as const;

// Share card for every page (social previews, Article JSON-LD). Made by `npm run og-image`; it has
// no prices on it, so it never goes stale.
export const OG_IMAGE = {
  url: `${SITE.origin}/og.png`,
  width: 1200,
  height: 630,
  alt: 'Wattsplain: what electricity costs in your state, with bill and appliance cost calculators',
} as const;
