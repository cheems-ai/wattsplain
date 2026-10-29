import { describe, expect, it } from 'vitest';

import { monthsBehind, weeksOld } from './freshness.mjs';

describe('monthsBehind', () => {
  it('counts calendar months across years', () => {
    expect(monthsBehind('2026-08', new Date('2026-10-29T00:00:00Z'))).toBe(2);
    expect(monthsBehind('2025-11', new Date('2026-02-01T00:00:00Z'))).toBe(3);
  });

  it('rejects other formats', () => {
    expect(() => monthsBehind('Aug 2026', new Date())).toThrow();
  });
});

describe('weeksOld', () => {
  it('counts whole weeks', () => {
    expect(weeksOld('2026-10-26', new Date('2026-10-29T00:00:00Z'))).toBe(0);
    expect(weeksOld('2026-10-05', new Date('2026-10-29T00:00:00Z'))).toBe(3);
  });
});
