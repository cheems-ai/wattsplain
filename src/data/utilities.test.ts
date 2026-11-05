import { describe, expect, it } from 'vitest';

import { ELECTRICITY, STATE_ROWS } from './electricity';
import { UTILITIES, stateUtilities, utilityName } from './utilities';

describe('utilities.json', () => {
  it('has utilities for every state, largest first, with plausible prices', () => {
    for (const s of STATE_ROWS) {
      const u = stateUtilities(s.code)!;
      expect(u.utilities.length, s.code).toBeGreaterThan(0);
      expect(u.shownShare, s.code).toBeGreaterThan(0);
      expect(u.shownShare, s.code).toBeLessThanOrEqual(1);
      for (let i = 1; i < u.utilities.length; i++)
        expect(u.utilities[i]!.customers).toBeLessThanOrEqual(u.utilities[i - 1]!.customers);
      for (const x of u.utilities) {
        expect(x.price, x.name).toBeGreaterThanOrEqual(3);
        expect(x.price, x.name).toBeLessThanOrEqual(100);
      }
      expect(u.choiceShare, s.code).not.toBeNull();
    }
  });

  it('agrees with Table 5.6.A when both are for the same month', () => {
    if (UTILITIES.period !== ELECTRICITY.monthly.period) return;
    for (const s of STATE_ROWS)
      expect(Math.abs(stateUtilities(s.code)!.statePrice! - s.price), s.code).toBeLessThanOrEqual(
        0.02,
      );
  });

  it('shortens EIA state suffixes in names', () => {
    expect(utilityName('City of Kansas City - (KS)')).toBe('City of Kansas City (KS)');
    expect(utilityName('Evergy Metro')).toBe('Evergy Metro');
  });
});
