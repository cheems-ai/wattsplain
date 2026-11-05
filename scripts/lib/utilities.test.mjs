import { describe, expect, it } from 'vitest';

import {
  buildUtilities,
  parseChoiceShares,
  parseUtilitySheet,
  validateUtilities,
} from './utilities.mjs';

// The three header rows of EIA's sales_ult_cust_YYYY.xlsx (2025 and 2026 files), then data rows.
const HEAD = [
  ['UTILITY CHARATERISTICS', null, null, null, null, null, null, 'RESIDENTIAL', null, null],
  ['', null, null, null, null, null, null, 'Revenue', 'Sales', 'Customers'],
  [
    'Year',
    'Month',
    'Utility Number',
    'Utility Name',
    'State',
    'Ownership',
    'Data Status',
    'Thousands Dollars',
    'Megawatthours',
    'Count',
  ],
];
const row = (y, m, id, name, state, own, rev, mwh, n) => [
  y,
  m,
  id,
  name,
  state,
  own,
  'Final',
  rev,
  mwh,
  n,
];

// Two states, 13 months (2025-08 … 2026-08). Utility 1 costs 15¢ every month except the latest
// (16¢); utility 2 costs 12¢; a behind-the-meter seller and the adjustment row must be ignored.
function sheet({ skipMonth } = {}) {
  const rows = [...HEAD];
  for (let i = 0; i < 13; i++) {
    const y = i < 5 ? 2025 : 2026;
    const m = i < 5 ? 8 + i : i - 4;
    const latest = i === 12;
    if (!(skipMonth && y === skipMonth[0] && m === skipMonth[1]))
      rows.push(
        row(y, m, 1, 'Big Power Co', 'KS', 'Investor Owned', latest ? 160 : 150, 1000, 900),
      );
    rows.push(row(y, m, 2, 'City of Smallville - (KS)', 'KS', 'Municipal', 60, 500, 100));
    rows.push(row(y, m, 3, 'Sunny LLC', 'KS', 'Behind the Meter', 1, 100, 5000));
    rows.push(row(y, m, 0, `State Adjustment ${y}`, 'KS', '', 30, 200, 100));
    rows.push(row(y, m, 88888, 'State Total', 'KS', '', 250, 1700, 1100));
    rows.push(row(y, m, 4, 'Delta Coop', 'DE', 'Cooperative', 140, 1000, 50));
    rows.push(row(y, m, 88888, 'State Total', 'DE', '', 140, 1000, 50));
  }
  rows.push(['Ownership code Behind the Meter - footnote', null]);
  return rows;
}
const STATES = [{ code: 'KS' }, { code: 'DE' }];

describe('parseUtilitySheet', () => {
  it('reads residential rows and tells utilities, totals and adjustments apart', () => {
    const recs = parseUtilitySheet(sheet());
    const latest = recs.filter((r) => r.period === '2026-08' && r.state === 'KS');
    expect(latest.map((r) => r.kind)).toEqual([
      'utility',
      'utility',
      'utility',
      'adjustment',
      'total',
    ]);
    expect(latest[0]).toMatchObject({
      name: 'Big Power Co',
      revenue: 160,
      sales: 1000,
      customers: 900,
    });
  });

  it('turns withheld values (".") into null', () => {
    const rows = [...HEAD, [2026, 8, 5, 'Hidden Co', 'KS', 'Cooperative', 'Final', '.', '.', '.']];
    expect(parseUtilitySheet(rows)[0]).toMatchObject({
      revenue: null,
      sales: null,
      customers: null,
    });
  });

  it('refuses a sheet whose residential columns moved', () => {
    const moved = [HEAD[0], ['', null, null, null, null, null, null, 'Sales'], HEAD[2]];
    expect(() => parseUtilitySheet(moved)).toThrow(/columns moved/);
    expect(() => parseUtilitySheet([['nothing']])).toThrow(/header/);
  });
});

describe('buildUtilities', () => {
  const choice = {
    year: 2025,
    source: 'x',
    states: { KS: { choiceShare: 0 }, DE: { choiceShare: 0.05 } },
  };
  const data = buildUtilities(parseUtilitySheet(sheet()), STATES, '2026-11-05', choice);

  it('uses the latest month every state reports', () => {
    expect(data.period).toBe('2026-08');
    expect(data.priorPeriod).toBe('2025-08');
  });

  it('prices each utility as revenue over kWh: month, year-ago month and 12 months', () => {
    const [big, city] = data.states.KS.utilities;
    expect(big).toMatchObject({
      name: 'Big Power Co',
      ownership: 'Investor-owned',
      price: 16,
      priceYearAgo: 15,
    });
    // (11 × 150 + 160) / (12 × 1000) × 100
    expect(big.price12).toBeCloseTo(15.08, 2);
    expect(city).toMatchObject({ ownership: 'City-owned', price: 12, price12: 12 });
  });

  it('leaves out behind-the-meter sellers and the state adjustment, and reports coverage', () => {
    expect(data.states.KS.utilities.map((u) => u.id)).toEqual([1, 2]);
    expect(data.states.KS.shownShare).toBeCloseTo(1000 / 1100, 3);
    expect(data.states.KS.statePrice).toBeCloseTo(14.71, 2);
    expect(data.states.DE.choiceShare).toBe(0.05);
  });

  it('has no 12-month price when a month is missing', () => {
    const gap = buildUtilities(
      parseUtilitySheet(sheet({ skipMonth: [2026, 2] })),
      STATES,
      'x',
      choice,
    );
    expect(gap.states.KS.utilities[0].price12).toBeNull();
  });
});

describe('validateUtilities', () => {
  const choice = {
    year: 2025,
    source: 'x',
    states: { KS: { choiceShare: 0 }, DE: { choiceShare: 0 } },
  };
  const data = buildUtilities(parseUtilitySheet(sheet()), STATES, 'x', choice);
  const elec = (ks) => ({
    monthly: { period: '2026-08' },
    states: [
      { code: 'KS', price: ks },
      { code: 'DE', price: 14 },
    ],
  });

  it('accepts totals that match Table 5.6.A', () => {
    expect(() => validateUtilities(data, elec(14.71), null)).not.toThrow();
  });

  it('refuses totals that disagree with Table 5.6.A, older data, or missing choice shares', () => {
    expect(() => validateUtilities(data, elec(15.5), null)).toThrow(/KS: 861M total/);
    expect(() => validateUtilities(data, elec(14.71), { period: '2026-09' })).toThrow(/older/);
    expect(() => validateUtilities({ ...data, choice: null }, elec(14.71), null)).toThrow(
      /retail-choice/,
    );
  });
});

describe('parseChoiceShares', () => {
  const head = [
    [
      'Utility Characteristics',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'RESIDENTIAL',
      null,
      null,
    ],
    ['', null, null, null, null, null, null, null, null, 'Revenues', 'Sales', 'Customers'],
    [
      'Data Year',
      'Utility Number',
      'Utility Name',
      'Part',
      'Service Type',
      'Data Type',
      'State',
      'Ownership',
      'BA Code',
      'Thousand Dollars',
      'Megawatthours',
      'Count',
    ],
  ];
  const r = (part, state, n) => [
    2025,
    1,
    'U',
    part,
    'x',
    'O',
    state,
    'Investor Owned',
    'X',
    1,
    1,
    n,
  ];

  it('counts delivery-only and retail-provider homes against all homes, never Part B twice', () => {
    const rows = [
      ...head,
      r('A', 'MA', 400),
      r('B', 'MA', 600),
      r('C', 'MA', 600),
      r('A', 'TX', 450),
      r('D', 'TX', 550),
      r('A', 'KS', 100),
    ];
    const out = parseChoiceShares(rows);
    expect(out.year).toBe(2025);
    expect(out.states.MA).toEqual({ homes: 1000, choiceShare: 0.6 });
    expect(out.states.TX.choiceShare).toBe(0.55);
    expect(out.states.KS.choiceShare).toBe(0);
  });
});
