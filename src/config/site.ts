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
