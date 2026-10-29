// Share and export for the planner. A share link carries only energy parameters (state, kWh,
// prices, appliance schedules, heating choice), never the bill amount the visitor typed. The
// state goes in a compact JSON, base64url-encoded in ?p=; anything malformed is dropped.
import { type SystemId } from './heating';
import type { Load, Scenario, ScenarioResult } from './scenario';

export interface PlanState {
  state: string;
  /** Household kWh per month; undefined = the state average. */
  monthlyKwh?: number | undefined;
  fixedMonthly?: number | undefined;
  /** Heating included, and heated area if given. */
  heating?: { sqft?: number | undefined } | undefined;
  scenarios: Scenario[];
}

const SYSTEM_IDS: readonly SystemId[] = ['heat-pump', 'gas', 'propane', 'oil', 'electric'];
export const LIMITS = { scenarios: 4, loads: 12, name: 40 } as const;

type Packed = {
  v: 1;
  s: string;
  k?: number;
  f?: number;
  h?: { a?: number };
  c: { n: string; p: number; h?: string; e?: number; l: (string | number)[][] }[];
};

const toBase64Url = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (s: string): string => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function encodePlan(p: PlanState): string {
  const packed: Packed = {
    v: 1,
    s: p.state,
    c: p.scenarios.slice(0, LIMITS.scenarios).map((s) => ({
      n: s.name.slice(0, LIMITS.name),
      p: r4(s.cents),
      ...(s.heating ? { h: s.heating } : {}),
      ...(s.heatingEfficiency !== undefined ? { e: r4(s.heatingEfficiency) } : {}),
      l: s.loads
        .slice(0, LIMITS.loads)
        .map((l) => [
          l.kind,
          l.name.slice(0, LIMITS.name),
          r4(l.watts),
          r4(l.hoursPerDay),
          r4(l.dutyCycle),
          r4(l.daysPerWeek),
          r4(l.monthsPerYear),
          r4(l.standbyWatts),
        ]),
    })),
  };
  if (p.monthlyKwh !== undefined) packed.k = r4(p.monthlyKwh);
  if (p.fixedMonthly !== undefined) packed.f = r4(p.fixedMonthly);
  if (p.heating) packed.h = p.heating.sqft !== undefined ? { a: r4(p.heating.sqft) } : {};
  return toBase64Url(JSON.stringify(packed));
}

const inRange = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const text = (x: unknown): x is string => typeof x === 'string' && x.length <= LIMITS.name;

/** Parses a ?p= value; null when it is not a valid plan. `states` lists the valid state codes. */
export function decodePlan(s: string, states: readonly string[]): PlanState | null {
  // Any shape we did not write (null entries, wrong types) must give null, never throw.
  try {
    return decodeChecked(s, states);
  } catch {
    return null;
  }
}

function decodeChecked(s: string, states: readonly string[]): PlanState | null {
  let raw: Packed;
  try {
    raw = JSON.parse(fromBase64Url(s)) as Packed;
  } catch {
    return null;
  }
  if (!raw || raw.v !== 1 || !states.includes(raw.s) || !Array.isArray(raw.c)) return null;
  if (raw.c.length < 1 || raw.c.length > LIMITS.scenarios) return null;
  const scenarios: Scenario[] = [];
  for (const c of raw.c) {
    if (!text(c.n) || !inRange(c.p, 1, 150) || !Array.isArray(c.l) || c.l.length > LIMITS.loads)
      return null;
    if (c.h !== undefined && !SYSTEM_IDS.includes(c.h as SystemId)) return null;
    if (c.e !== undefined && !inRange(c.e, 0.3, 30)) return null;
    const loads: Load[] = [];
    for (const l of c.l) {
      const [kind, name, watts, hours, duty, days, months, standby] = l;
      if (!text(kind) || !text(name)) return null;
      if (
        !inRange(watts, 0.1, 100_000) ||
        !inRange(hours, 0, 24) ||
        !inRange(duty, 0.001, 1) ||
        !inRange(days, 0, 7) ||
        !inRange(months, 0, 12) ||
        !inRange(standby, 0, 10_000)
      )
        return null;
      loads.push({
        kind,
        name,
        watts,
        hoursPerDay: hours,
        dutyCycle: duty,
        daysPerWeek: days,
        monthsPerYear: months,
        standbyWatts: standby,
      });
    }
    scenarios.push({
      name: c.n,
      cents: c.p,
      loads,
      heating: c.h as SystemId | undefined,
      heatingEfficiency: c.e,
    });
  }
  if (raw.k !== undefined && !inRange(raw.k, 1, 20_000)) return null;
  if (raw.f !== undefined && !inRange(raw.f, 0, 500)) return null;
  if (raw.h !== undefined && raw.h.a !== undefined && !inRange(raw.h.a, 100, 20_000)) return null;
  return {
    state: raw.s,
    monthlyKwh: raw.k,
    fixedMonthly: raw.f,
    heating: raw.h ? { sqft: raw.h.a } : undefined,
    scenarios,
  };
}

const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Plain-text summary for the clipboard. */
export function summaryText(
  stateName: string,
  results: ScenarioResult[],
  scenarios: Scenario[],
  url: string,
): string {
  const lines = [`Home energy cost estimate, ${stateName} (Wattsplain)`];
  results.forEach((r, i) => {
    const s = scenarios[i]!;
    lines.push(
      `${r.name}: ${money(r.perMonth)}/month, ${money(r.perYear)}/year at ${s.cents.toFixed(2)}¢/kWh` +
        (i === 0
          ? ''
          : ` (${r.diffPerYear <= 0 ? 'saves' : 'costs'} ${money(Math.abs(r.diffPerYear))}/year, ${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(1)}%)`),
    );
  });
  lines.push('Estimates from typical values and the inputs above, not a guaranteed saving.');
  lines.push(url);
  return lines.join('\n');
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote everything that could break a row; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(results: ScenarioResult[], scenarios: Scenario[]): string {
  const rows: (string | number)[][] = [
    ['Scenario', 'Item', 'Price (cents/kWh)', 'kWh per year', 'Cost per year ($)'],
  ];
  results.forEach((r, i) => {
    const c = scenarios[i]!.cents.toFixed(2);
    const name = scenarios[i]!.name;
    for (const l of r.loads)
      rows.push([name, l.name, c, l.kwhPerYear.toFixed(0), l.perYear.toFixed(2)]);
    if (r.heating)
      rows.push([
        name,
        `Heating: ${r.heating.system}`,
        c,
        r.heating.kwhPerYear.toFixed(0),
        r.heating.perYear.toFixed(2),
      ]);
    rows.push([
      name,
      'Everything else',
      c,
      r.otherKwhPerYear.toFixed(0),
      r.otherPerYear.toFixed(2),
    ]);
    if (r.fixedPerYear) rows.push([name, 'Fixed charges', '', '', r.fixedPerYear.toFixed(2)]);
    rows.push([name, 'Total', c, r.kwhPerYear.toFixed(0), r.perYear.toFixed(2)]);
  });
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
