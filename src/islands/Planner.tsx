import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { track } from '../analytics/client';
import { defaultProfile, type Appliance } from '../data/appliances';
import { validateProfile } from '../lib/appliance';
import { cents, dollars, kwh, signedPct } from '../lib/format';
import { SYSTEMS, adjustHeat, type SystemId } from '../lib/heating';
import { resolveRate } from '../lib/rate';
import {
  compareScenarios,
  overListed,
  savingsRange,
  type Household,
  type Load,
  type Scenario,
} from '../lib/scenario';
import { LIMITS, decodePlan, encodePlan, summaryText, toCsv } from '../lib/share';
import { RateField, useRateInput } from './RateField';
import { useFunnel } from './useFunnel';
import { initial, num, useStateCode } from './useStateRate';

export interface PlannerState {
  code: string;
  name: string;
  /** Electricity, latest month, cents/kWh. */
  price: number;
  avgKwh: number;
  /** Gas $/Mcf, propane and oil $/gal. */
  fuel: { gas: number; propane: number; oil: number };
  /** Typical gas-heated home: heat a year (MMBtu) and its heated floor area. */
  heat: number;
  typicalSqft: number;
}

interface Props {
  states: PlannerState[];
  appliances: Appliance[];
  monthLabel: string;
  /** Where the fuel prices come from, for the assumptions list. */
  fuelNote: string;
}

interface UiLoad {
  kind: string;
  name: string;
  watts: string;
  hours: string;
  duty: string;
  days: string;
  months: string;
  standby: string;
}
interface UiScenario {
  key: number;
  name: string;
  /** Empty = the price chosen at the top. */
  price: string;
  heating: SystemId | '';
  eff: string;
  loads: UiLoad[];
}

const DEFAULT_EFF: Record<SystemId, string> = {
  'heat-pump': '7.8',
  gas: '95',
  propane: '95',
  oil: '85',
  electric: '100',
};
const uiLoad = (a: Appliance): UiLoad => {
  const p = defaultProfile(a);
  return {
    kind: a.id,
    name: a.name,
    watts: String(p.watts),
    hours: String(p.hoursPerDay),
    duty: String(Math.round(p.dutyCycle * 1000) / 10),
    days: String(p.daysPerWeek),
    months: String(p.monthsPerYear),
    standby: '0',
  };
};

const fromLoad = (l: Load): UiLoad => ({
  kind: l.kind,
  name: l.name,
  watts: String(l.watts),
  hours: String(l.hoursPerDay),
  duty: String(Math.round(l.dutyCycle * 1000) / 10),
  days: String(l.daysPerWeek),
  months: String(l.monthsPerYear),
  standby: String(l.standbyWatts),
});

// Keys end up in field ids, so the two starting scenarios use fixed keys: the prerendered HTML
// and the browser must agree on them. Scenarios added later count up from 100.
let nextKey = 100;
const keyed = (s: Omit<UiScenario, 'key'>): UiScenario => ({ ...s, key: nextKey++ });

function startScenarios(appliances: Appliance[], applianceId: string | null): UiScenario[] {
  const a =
    appliances.find((x) => x.id === applianceId) ??
    appliances.find((x) => x.id === 'space-heater')!;
  const now = uiLoad(a);
  const fewer = Math.max(0.5, Number(now.hours) - 3);
  return [
    { key: 1, name: 'Now', price: '', heating: '', eff: '', loads: [now] },
    {
      key: 2,
      name: `${fewer} h a day`,
      price: '',
      heating: '',
      eff: '',
      loads: [{ ...now, hours: String(fewer) }],
    },
  ];
}

/** Converts the form strings; returns an error message instead when something is invalid. */
function toScenario(s: UiScenario, planCents: number | null): Scenario | string {
  const price = s.price.trim() === '' ? planCents : num(s.price);
  if (price === null || !(price >= 1 && price <= 150))
    return `${s.name || 'Scenario'}: enter a price between 1 and 150¢ per kWh.`;
  const loads: Load[] = [];
  for (const l of s.loads) {
    const load: Load = {
      kind: l.kind,
      name: l.name,
      watts: num(l.watts) ?? NaN,
      hoursPerDay: num(l.hours) ?? NaN,
      dutyCycle: (num(l.duty) ?? NaN) / 100,
      daysPerWeek: num(l.days) ?? NaN,
      monthsPerYear: num(l.months) ?? NaN,
      standbyWatts: num(l.standby) ?? 0,
    };
    const bad = validateProfile(load);
    if (bad) return `${s.name || 'Scenario'}, ${l.name}: ${bad}`;
    loads.push(load);
  }
  let heatingEfficiency: number | undefined;
  if (s.heating) {
    const e = num(s.eff || DEFAULT_EFF[s.heating]);
    if (e === null || e <= 0) return `${s.name}: enter the heating efficiency.`;
    heatingEfficiency = s.heating === 'heat-pump' ? e : Math.min(e, 100) / 100;
    if (s.heating === 'heat-pump' && (e < 3 || e > 20))
      return `${s.name}: HSPF2 is usually between 6 and 13.`;
  }
  return {
    name: s.name || 'Scenario',
    cents: price,
    loads,
    heating: s.heating || undefined,
    heatingEfficiency,
  };
}

export default function Planner({ states, appliances, monthLabel, fuelNote }: Props) {
  const { code, setCode, ready } = useStateCode(states);
  const state = states.find((s) => s.code === code) ?? states[0]!;
  const { input: rateInput, set: setRate } = useRateInput('pl-rate');
  const rate = resolveRate(rateInput, state.price, `${state.name} average, ${monthLabel}`);

  const [monthly, setMonthly] = useState(() => initial('pl-kwh', ''));
  const [bill, setBill] = useState(() => initial('pl-bill', ''));
  const [fixed, setFixed] = useState(() => initial('pl-fixed', ''));
  const [heatSys, setHeatSys] = useState<SystemId | ''>('');
  const [sqft, setSqft] = useState(() => initial('pl-sqft', ''));
  const [scenarios, setScenarios] = useState<UiScenario[]>(() => startScenarios(appliances, null));
  const [copied, setCopied] = useState('');
  const [restored, setRestored] = useState<'ok' | 'bad' | ''>('');
  const resultsRef = useRef<HTMLElement>(null);

  // A shared link (?p=) or a link from the appliance calculator (?appliance=) sets the start.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get('p');
    if (p) {
      const plan = decodePlan(
        p,
        states.map((s) => s.code),
      );
      if (!plan) {
        setRestored('bad');
        return;
      }
      setCode(plan.state);
      if (plan.monthlyKwh !== undefined) setMonthly(String(plan.monthlyKwh));
      if (plan.fixedMonthly !== undefined) setFixed(String(plan.fixedMonthly));
      if (plan.heating?.sqft !== undefined) setSqft(String(plan.heating.sqft));
      const first = plan.scenarios[0]!;
      if (plan.heating && first.heating) setHeatSys(first.heating);
      setScenarios(
        plan.scenarios.map((s) =>
          keyed({
            name: s.name,
            price: String(s.cents),
            heating: plan.heating ? (s.heating ?? '') : '',
            eff:
              s.heating && s.heatingEfficiency !== undefined
                ? String(
                    s.heating === 'heat-pump'
                      ? s.heatingEfficiency
                      : Math.round(s.heatingEfficiency * 1000) / 10,
                  )
                : '',
            loads: s.loads.map(fromLoad),
          }),
        ),
      );
      setRestored('ok');
      return;
    }
    const a = q.get('appliance');
    if (a && appliances.some((x) => x.id === a)) setScenarios(startScenarios(appliances, a));
  }, []);

  const planCents = rate.cents;
  const converted = scenarios.map((s) => toScenario(s, planCents));
  const firstError = converted.find((c): c is string => typeof c === 'string');
  const valid = firstError ? null : (converted as Scenario[]);

  const kwhIn = num(monthly);
  const monthlyKwh = kwhIn !== null && kwhIn > 0 ? kwhIn : state.avgKwh;
  const household: Household = {
    monthlyKwh,
    fixedMonthly: num(fixed) ?? 0,
    heatMmbtu: heatSys
      ? adjustHeat(state.heat, {
          sqft: num(sqft) ?? undefined,
          typicalSqft: state.typicalSqft,
          insulation: 'typical',
        })
      : undefined,
    fuelPrices: state.fuel,
  };
  const results = valid ? compareScenarios(household, valid) : null;
  const tooMuch = valid ? overListed(household, valid[0]!) : false;

  const touch = useFunnel(results !== null, Boolean(firstError ?? rate.error));

  const shareUrl = useMemo(() => {
    if (!valid || typeof window === 'undefined') return '';
    const p = encodePlan({
      state: code,
      monthlyKwh: kwhIn !== null && kwhIn > 0 ? kwhIn : undefined,
      fixedMonthly: num(fixed) ?? undefined,
      heating: heatSys ? { sqft: num(sqft) ?? undefined } : undefined,
      scenarios: valid,
    });
    return `${location.origin}${location.pathname}?p=${p}`;
  }, [JSON.stringify(valid), code, monthly, fixed, heatSys, sqft]);

  const update = (key: number, patch: Partial<UiScenario>) =>
    setScenarios((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const updateLoad = (key: number, i: number, patch: Partial<UiLoad>) =>
    setScenarios((all) =>
      all.map((s) =>
        s.key === key
          ? { ...s, loads: s.loads.map((l, j) => (j === i ? { ...l, ...patch } : l)) }
          : s,
      ),
    );
  const add = (from: UiScenario, patch: Partial<UiScenario>) => {
    if (scenarios.length >= LIMITS.scenarios) return;
    setScenarios((all) => [...all, keyed({ ...structuredClone(from), ...patch })]);
    track('compare');
  };
  const current = scenarios[0]!;

  const setHeating = (h: SystemId | '') => {
    setHeatSys(h);
    // The current home keeps the chosen system; other scenarios follow unless already changed.
    setScenarios((all) =>
      all.map((s, i) =>
        i === 0 || s.heating === current.heating ? { ...s, heating: h, eff: '' } : s,
      ),
    );
  };

  const share = async (what: 'link' | 'summary') => {
    if (!results || !valid) return;
    const text = what === 'link' ? shareUrl : summaryText(state.name, results, valid, shareUrl);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what === 'link' ? 'Link copied.' : 'Summary copied.');
    } catch {
      setCopied('Copy did not work in this browser; select the text in the address bar instead.');
    }
    track('share');
  };
  const download = () => {
    if (!results || !valid) return;
    const blob = new Blob([toCsv(results, valid)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wattsplain-${code.toLowerCase()}-scenarios.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    track('share');
  };

  const maxYear = results ? Math.max(...results.map((r) => r.perYear), 1) : 1;
  const billNum = num(bill);
  const priceLabel = (s: UiScenario) =>
    s.price.trim() === ''
      ? `${planCents !== null ? cents(planCents) : '–'} (as above)`
      : `${s.price}¢`;

  return (
    <div class="planner" data-ready={ready ? '' : undefined}>
      {restored === 'bad' && (
        <p class="error" role="alert">
          That shared link is incomplete or damaged, so we started from the example instead.
        </p>
      )}
      {restored === 'ok' && <p class="note">Opened from a shared link. Change anything below.</p>}

      <form class="card step" onSubmit={(e) => e.preventDefault()} onInput={touch}>
        <h2 class="step-h">
          <span class="step-n">1</span> Your home
        </h2>
        <div class="row2">
          <div class="field">
            <label for="pl-state">State</label>
            <select id="pl-state" value={code} onChange={(e) => setCode(e.currentTarget.value)}>
              {states.map((s) => (
                <option value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="pl-kwh">Electricity use (kWh a month)</label>
            <input
              id="pl-kwh"
              inputMode="decimal"
              value={monthly}
              onInput={(e) => setMonthly(e.currentTarget.value)}
              placeholder={`${state.name} average: ${state.avgKwh}`}
            />
          </div>
        </div>
        <RateField
          prefix="pl-rate"
          input={rateInput}
          set={setRate}
          resolved={rate}
          stateName={state.name}
          statePrice={state.price}
        />
        <details>
          <summary>More about your home (optional)</summary>
          <div class="row2">
            <div class="field">
              <label for="pl-bill">Typical electric bill ($ a month)</label>
              <input
                id="pl-bill"
                inputMode="decimal"
                value={bill}
                onInput={(e) => setBill(e.currentTarget.value)}
              />
              <span class="hint">Only compared with our estimate. Never put in a shared link.</span>
            </div>
            <div class="field">
              <label for="pl-fixed">Fixed charge on the bill ($ a month)</label>
              <input
                id="pl-fixed"
                inputMode="decimal"
                value={fixed}
                onInput={(e) => setFixed(e.currentTarget.value)}
              />
            </div>
          </div>
          <div class="row2">
            <div class="field">
              <label for="pl-heat">Main heating</label>
              <select
                id="pl-heat"
                value={heatSys}
                onChange={(e) => setHeating(e.currentTarget.value as SystemId | '')}
              >
                <option value="">Leave heating out</option>
                {SYSTEMS.map((s) => (
                  <option value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label for="pl-sqft">Heated area (sq ft)</label>
              <input
                id="pl-sqft"
                inputMode="numeric"
                value={sqft}
                disabled={!heatSys}
                onInput={(e) => setSqft(e.currentTarget.value)}
                placeholder={`typical: ${Math.round(state.typicalSqft / 50) * 50}`}
              />
            </div>
          </div>
          {heatSys && (
            <p class="hint">
              {`Heat need: the typical gas-heated ${state.name} home (EIA RECS 2020)${num(sqft) ? ', scaled to your floor area' : ''}, about ${Math.round(household.heatMmbtu!)} million Btu a year. Your own fuel bills are more accurate: use the heating calculator for that.`}
            </p>
          )}
        </details>
      </form>

      <section class="card step" aria-labelledby="pl-s2" onInput={touch}>
        <h2 class="step-h" id="pl-s2">
          <span class="step-n">2</span> Scenarios to compare
        </h2>
        <p class="hint">
          The first column is your home today. Change the appliances, hours, price or heating in the
          others. Everything you do not list stays the same in all of them.
        </p>
        <div class="scenarios">
          {scenarios.map((s, si) => (
            <fieldset class="scenario" key={s.key}>
              <legend class="sr-only">{s.name}</legend>
              <div class="scn-head">
                <label class="sr-only" for={`pl-name-${s.key}`}>
                  Scenario name
                </label>
                <input
                  id={`pl-name-${s.key}`}
                  class="scn-name"
                  value={s.name}
                  maxLength={LIMITS.name}
                  onInput={(e) => update(s.key, { name: e.currentTarget.value })}
                />
                {si > 0 && (
                  <button
                    type="button"
                    class="link-btn"
                    onClick={() => setScenarios((all) => all.filter((x) => x.key !== s.key))}
                    aria-label={`Delete ${s.name}`}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div class="field">
                <label for={`pl-price-${s.key}`}>Price (¢/kWh)</label>
                <input
                  id={`pl-price-${s.key}`}
                  inputMode="decimal"
                  value={s.price}
                  placeholder={planCents !== null ? `${planCents.toFixed(2)} (as above)` : ''}
                  onInput={(e) => update(s.key, { price: e.currentTarget.value })}
                />
              </div>
              {heatSys && (
                <div class="row2">
                  <div class="field">
                    <label for={`pl-h-${s.key}`}>Heating</label>
                    <select
                      id={`pl-h-${s.key}`}
                      value={s.heating}
                      onChange={(e) =>
                        update(s.key, { heating: e.currentTarget.value as SystemId, eff: '' })
                      }
                    >
                      {SYSTEMS.map((x) => (
                        <option value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </div>
                  <div class="field">
                    <label for={`pl-e-${s.key}`}>
                      {s.heating === 'heat-pump' ? 'HSPF2' : 'Efficiency (%)'}
                    </label>
                    <input
                      id={`pl-e-${s.key}`}
                      inputMode="decimal"
                      value={s.eff}
                      placeholder={s.heating ? DEFAULT_EFF[s.heating] : ''}
                      disabled={s.heating === 'electric'}
                      onInput={(e) => update(s.key, { eff: e.currentTarget.value })}
                    />
                  </div>
                </div>
              )}
              {s.loads.map((l, i) => (
                <div class="load">
                  <div class="load-head">
                    <strong>{l.name}</strong>
                    <button
                      type="button"
                      class="link-btn"
                      aria-label={`Remove ${l.name} from ${s.name}`}
                      onClick={() => update(s.key, { loads: s.loads.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </div>
                  <div class="load-grid">
                    {(
                      [
                        ['watts', 'Watts'],
                        ['hours', 'Hours/day'],
                        ['duty', 'Running %'],
                        ['days', 'Days/week'],
                        ['months', 'Months/yr'],
                        ['standby', 'Standby W'],
                      ] as const
                    ).map(([k, label]) => (
                      <div class="field">
                        <label for={`pl-${s.key}-${i}-${k}`}>{label}</label>
                        <input
                          id={`pl-${s.key}-${i}-${k}`}
                          inputMode="decimal"
                          value={l[k]}
                          onInput={(e) => updateLoad(s.key, i, { [k]: e.currentTarget.value })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {s.loads.length < LIMITS.loads && (
                <div class="field">
                  <label for={`pl-add-${s.key}`}>Add an appliance</label>
                  <select
                    id={`pl-add-${s.key}`}
                    value=""
                    onChange={(e) => {
                      const a = appliances.find((x) => x.id === e.currentTarget.value);
                      if (a) update(s.key, { loads: [...s.loads, uiLoad(a)] });
                      e.currentTarget.value = '';
                    }}
                  >
                    <option value="">Choose…</option>
                    {appliances.map((a) => (
                      <option value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </fieldset>
          ))}
        </div>
        {scenarios.length < LIMITS.scenarios && (
          <div class="actions">
            <button type="button" class="btn" onClick={() => add(current, { name: 'Copy of Now' })}>
              Copy “{current.name}”
            </button>
            <button
              type="button"
              class="btn"
              onClick={() =>
                add(current, {
                  name: 'Fewer hours',
                  loads: current.loads.map((l) => ({
                    ...l,
                    hours: String(Math.max(0.5, (num(l.hours) ?? 0) - 3)),
                  })),
                })
              }
            >
              3 fewer hours a day
            </button>
            {heatSys && heatSys !== 'heat-pump' && (
              <button
                type="button"
                class="btn"
                onClick={() => add(current, { name: 'Heat pump', heating: 'heat-pump', eff: '' })}
              >
                Heat pump instead
              </button>
            )}
            <button
              type="button"
              class="btn"
              onClick={() =>
                add(current, {
                  name: 'Lower price',
                  price:
                    planCents !== null ? (Math.round((planCents - 2) * 100) / 100).toFixed(2) : '',
                })
              }
            >
              A price 2¢ lower
            </button>
          </div>
        )}
      </section>

      <section class="card step result" aria-labelledby="pl-s3" ref={resultsRef} aria-live="polite">
        <h2 class="step-h" id="pl-s3">
          <span class="step-n">3</span> Results
        </h2>
        {(firstError ??
          (planCents === null ? (rate.error ?? 'Finish the electricity price above.') : null)) && (
          <p class="error">{firstError ?? rate.error ?? 'Finish the electricity price above.'}</p>
        )}
        {results && valid && (
          <>
            <h3>Where your money goes now (estimate)</h3>
            <div class="table-scroll">
              <table class="breakdown">
                <tbody>
                  {[
                    ...results[0]!.loads.map(
                      (l) => [l.name, l.perYear, `${kwh(l.kwhPerYear)} a year`] as const,
                    ),
                    ...(results[0]!.heating
                      ? [
                          [
                            `Heating: ${SYSTEMS.find((x) => x.id === results[0]!.heating!.system)!.name.toLowerCase()}`,
                            results[0]!.heating.perYear,
                            results[0]!.heating.kwhPerYear
                              ? `${kwh(results[0]!.heating.kwhPerYear)} a year`
                              : 'fuel',
                          ] as const,
                        ]
                      : []),
                    [
                      'Everything else',
                      results[0]!.otherPerYear,
                      `${kwh(results[0]!.otherKwhPerYear)} a year`,
                    ] as const,
                    ...(results[0]!.fixedPerYear
                      ? [['Fixed charges', results[0]!.fixedPerYear, ''] as const]
                      : []),
                  ]
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, perYear, note]) => (
                      <tr>
                        <th scope="row">{label}</th>
                        <td>{`${dollars(perYear / 12, 0)}/mo`}</td>
                        <td>{`${dollars(perYear, 0)}/yr`}</td>
                        <td class="hide-sm note">{note}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {tooMuch && (
              <p class="error">
                The appliances and heating listed in “{valid[0]!.name}” use more electricity than
                the {kwh(monthlyKwh)} a month entered above. Enter your real monthly use from a
                bill.
              </p>
            )}
            {billNum !== null && billNum > 0 && (
              <p class="note">
                {`You entered a typical bill of ${dollars(billNum)}; our yearly average for your home is ${dollars(results[0]!.perMonth)} a month. A big gap usually means the kWh, the price or the fixed charge above differ from your bill, or that bill was from a high or low season.`}
              </p>
            )}

            <h3>Scenarios side by side</h3>
            <div class="table-scroll">
              <table class="compare">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Per month</th>
                    <th>Per year</th>
                    <th>vs “{valid[0]!.name}”</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr>
                      <th scope="row">
                        {r.name} <span class="hint">{priceLabel(scenarios[i]!)}</span>
                      </th>
                      <td>{dollars(r.perMonth)}</td>
                      <td>{dollars(r.perYear, 0)}</td>
                      <td
                        class={
                          i === 0 ? '' : r.diffPerYear < 0 ? 'down' : r.diffPerYear > 0 ? 'up' : ''
                        }
                      >
                        {i === 0
                          ? '–'
                          : `${r.diffPerYear < 0 ? '−' : '+'}${dollars(Math.abs(r.diffPerMonth))}/mo · ${r.diffPerYear < 0 ? '−' : '+'}${dollars(Math.abs(r.diffPerYear), 0)}/yr (${signedPct(r.diffPct)})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              class="hbars"
              role="img"
              aria-label={results
                .map((r) => `${r.name}: ${dollars(r.perYear, 0)} a year`)
                .join('; ')}
            >
              {results.map((r, i) => (
                <div class="hbar-row" aria-hidden="true">
                  <span class="hbar-label">{r.name}</span>{' '}
                  <span class="hbar-track">
                    <span
                      class={`hbar ${i === 0 ? 'now' : 'alt'}`}
                      style={{ width: `${Math.max(1, (r.perYear / maxYear) * 100)}%` }}
                    />
                  </span>{' '}
                  <span class="hbar-value">{dollars(r.perYear, 0)}</span>
                </div>
              ))}
            </div>

            {results.length > 1 && (
              <>
                <h3>How sure is this?</h3>
                <ul>
                  {results.slice(1).map((r, k) => {
                    const [lo, hi] = savingsRange(household, valid, k + 1, 20);
                    const word = (x: number) =>
                      x <= 0 ? `saves ${dollars(-x, 0)}` : `costs ${dollars(x, 0)} more`;
                    const same = lo <= 0 === hi <= 0;
                    const range = same
                      ? `${lo <= 0 ? 'saves' : 'costs'} ${dollars(Math.min(Math.abs(lo), Math.abs(hi)), 0)}–${dollars(Math.max(Math.abs(lo), Math.abs(hi)), 0)}${lo <= 0 ? '' : ' more'}`
                      : `anywhere from ${word(lo)} to ${word(hi)}`;
                    return (
                      <li>
                        {`${r.name}: ${word(r.diffPerYear)} a year at today's prices; ${range} if all prices are 20% lower or higher.`}
                      </li>
                    );
                  })}
                </ul>
                <p class="note">
                  These are predicted differences, not guaranteed savings. They are only as good as
                  the watts, hours and running shares entered: for most appliances those matter more
                  than the price.
                </p>
              </>
            )}

            <h3>Assumptions</h3>
            <ul class="note">
              <li>
                {`Electricity: ${rate.mode === 'state' ? `the ${state.name} average for ${monthLabel} (EIA), which includes fixed charges spread over every kWh` : 'the price you entered'}; each scenario can use its own price.`}
              </li>
              <li>
                {`Everything else: your ${kwhIn ? '' : `state's average (EIA, ${kwh(state.avgKwh)} a month) `}monthly use minus the appliances${heatSys ? ' and electric heating' : ''} listed in “${valid[0]!.name}”, the same in every scenario.`}
              </li>
              <li>
                Appliance schedules are what you entered; defaults are examples, not measurements.
              </li>
              {heatSys && (
                <li>{`Heating fuel prices: ${fuelNote}. Installation costs are not included.`}</li>
              )}
              <li>Monthly figures are yearly totals ÷ 12; real bills swing with the seasons.</li>
            </ul>

            <h3>Save or share</h3>
            <div class="actions no-print">
              <button type="button" class="btn" onClick={() => share('link')}>
                Copy link
              </button>
              <button type="button" class="btn" onClick={() => share('summary')}>
                Copy summary
              </button>
              <button type="button" class="btn" onClick={download}>
                Download CSV
              </button>
              <button
                type="button"
                class="btn"
                onClick={() => {
                  track('share');
                  window.print();
                }}
              >
                Print or save as PDF
              </button>
            </div>
            <p class="note no-print" aria-live="polite">
              {copied ||
                'The link stores the state, kWh, prices, appliances and heating choice, not the bill amount. Nothing is saved on our server.'}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
