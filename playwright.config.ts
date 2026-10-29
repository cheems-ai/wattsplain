import { defineConfig, devices } from '@playwright/test';

// Runs against the built site served by `astro preview` (run `npm run build` first).
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 3,
  use: { baseURL: 'http://127.0.0.1:4331' },
  webServer: {
    command: 'npx astro preview --host 127.0.0.1 --port 4331',
    url: 'http://127.0.0.1:4331/',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
