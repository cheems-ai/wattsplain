import { defineConfig, devices } from '@playwright/test';

// Runs against the built site served by `astro preview` (run `npm run build` first).
// BASE_URL=https://wattsplain.com runs the same tests against production (no local server).
const remote = process.env['BASE_URL'];

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 3,
  use: { baseURL: remote ?? 'http://127.0.0.1:4331' },
  ...(remote
    ? {}
    : {
        webServer: {
          command: 'npx astro preview --host 127.0.0.1 --port 4331',
          url: 'http://127.0.0.1:4331/',
          reuseExistingServer: false,
        },
      }),
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
