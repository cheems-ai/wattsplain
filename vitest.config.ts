import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
    // Fail when a filter accidentally matches nothing, so "0 tests" can never look like a pass.
    passWithNoTests: false,
  },
});
