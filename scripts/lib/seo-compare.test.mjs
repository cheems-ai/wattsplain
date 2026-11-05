import { describe, expect, it } from 'vitest';

import { bands, cohort, compareBy, parseCsv, sum } from './seo-compare.mjs';

describe('parseCsv', () => {
  it('reads quoted cells with commas, quotes and newlines, and numbers the metrics', () => {
    const rows = parseCsv(
      'query,page,clicks,impressions,ctr,position\n"a, ""b""\nc",https://wattsplain.com/x/,0,2,0.0000,7.50\n',
    );
    expect(rows).toEqual([
      {
        query: 'a, "b"\nc',
        page: 'https://wattsplain.com/x/',
        clicks: 0,
        impressions: 2,
        ctr: 0,
        position: 7.5,
      },
    ]);
  });
});

describe('sum', () => {
  it('weights position by impressions and handles no rows', () => {
    expect(
      sum([
        { clicks: 1, impressions: 1, position: 10 },
        { clicks: 0, impressions: 3, position: 50 },
      ]),
    ).toEqual({
      clicks: 1,
      impressions: 4,
      position: 40,
    });
    expect(sum([]).position).toBeNull();
  });
});

describe('compareBy', () => {
  const r = (page, impressions, position) => ({ page, clicks: 0, impressions, position });
  it('matches rows by key and marks small samples as not readable', () => {
    const out = compareBy(
      [r('/a/', 12, 30), r('/b/', 3, 50)],
      [r('/a/', 20, 20), r('/c/', 4, 9)],
      'page',
    );
    expect(out.map((x) => [x.key, x.before.impressions, x.after.impressions, x.readable])).toEqual([
      ['/a/', 12, 20, true],
      ['/c/', 0, 4, false],
      ['/b/', 3, 0, false],
    ]);
  });
});

describe('bands and cohort', () => {
  it('buckets impressions by position', () => {
    const rows = [5, 15, 30, 80].map((position) => ({ impressions: 2, position }));
    expect(bands(rows)).toEqual({ '1-10': 2, '11-20': 2, '21-50': 2, '51+': 2 });
  });
  it('selects pages by exact path or prefix', () => {
    const rows = ['/electricity-rates/kansas/', '/tools/', '/tools/heating-cost-calculator/'].map(
      (p) => ({
        page: `https://wattsplain.com${p}`,
      }),
    );
    expect(cohort(rows, ['/electricity-rates/*']).length).toBe(1);
    expect(cohort(rows, ['/tools/']).length).toBe(1);
  });
});
