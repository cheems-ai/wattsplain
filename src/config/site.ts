// Site identity. Domain registered by the owner 2026-10-29. `indexable` stays false until the
// site is deployed and checked, so every page carries noindex and robots.txt disallows everything.
export const SITE = {
  name: 'Wattsplain',
  origin: 'https://wattsplain.com',
  indexable: false,
  contactEmail: 'cayetanoqt@proton.me',
  description:
    'What electricity really costs in your state: monthly EIA prices, a bill checker that shows why your bill went up, and appliance cost calculators.',
} as const;
