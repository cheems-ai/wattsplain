import { describe, expect, it } from 'vitest';

import { HEATING_OPTIONS, HEATING_ROWS, heatingRow } from './heating';

describe('HEATING_ROWS', () => {
  it('has every state with positive prices and heat', () => {
    expect(HEATING_ROWS).toHaveLength(51);
    for (const r of HEATING_ROWS) {
      expect(r.heat).toBeGreaterThan(0);
      for (const p of Object.values(r.prices)) expect(p).toBeGreaterThan(0);
      expect(r.costs).toHaveLength(5);
    }
  });

  it('labels prices that are not the state’s own', () => {
    const ca = heatingRow('CA')!;
    expect(ca.national).toContain('propane');
    expect(ca.notes.propane).toBe('U.S. average');
    expect(heatingRow('TN')!.notes.oil).toBe('Midwest average');
    expect(heatingRow('PA')!.notes).toEqual({});
  });

  it('never calls a fuel priced at the U.S. average the cheapest', () => {
    for (const r of HEATING_ROWS) expect(r.national).not.toContain(r.cheapest.system.id);
  });

  it('passes the national list to the calculator', () => {
    expect(HEATING_OPTIONS.find((o) => o.code === 'HI')!.national.length).toBeGreaterThan(0);
  });
});
