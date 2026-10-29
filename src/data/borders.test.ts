import { describe, expect, it } from 'vitest';

import { BORDERS } from './borders';
import { STATES } from './states';

describe('BORDERS', () => {
  it('covers every state and DC, and nothing else', () => {
    expect(Object.keys(BORDERS).sort()).toEqual(STATES.map((s) => s.code).sort());
  });

  it('is symmetric: if A borders B, B borders A', () => {
    for (const [a, list] of Object.entries(BORDERS))
      for (const b of list) expect(BORDERS[b], `${b} should list ${a}`).toContain(a);
  });

  it('has no self-references or duplicates', () => {
    for (const [a, list] of Object.entries(BORDERS)) {
      expect(list).not.toContain(a);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('matches known cases', () => {
    expect([...BORDERS.TX!].sort()).toEqual(['AR', 'LA', 'NM', 'OK']);
    expect(BORDERS.TN).toHaveLength(8);
    expect(BORDERS.MO).toHaveLength(8);
    expect(BORDERS.ME).toEqual(['NH']);
    expect(BORDERS.AK).toEqual([]);
    // Four Corners point contacts are not borders.
    expect(BORDERS.AZ).not.toContain('CO');
    expect(BORDERS.UT).not.toContain('NM');
  });
});
