import preact from '@astrojs/preact';
import { defineConfig } from 'astro/config';

import { SITE } from './src/config/site.ts';

// Static site: every page is prerendered; calculators run in the browser as Preact islands.
export default defineConfig({
  site: SITE.origin,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  integrations: [preact()],
  // Content-Security-Policy as a <meta> tag with hashes of every script Astro emits, so only
  // our own scripts run. Inline style attributes (chart bar widths) need 'unsafe-inline' styles.
  security: {
    csp: {
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
});
