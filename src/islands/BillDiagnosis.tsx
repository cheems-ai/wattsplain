import { useEffect, useRef, useState } from 'preact/hooks';

import type { RateOption } from '../data/electricity';
import { diagnose, type Change, type Evidence } from '../lib/diagnosis';
import type { BillDetail } from '../lib/energy';
import { dollars, signedPct } from '../lib/format';
import { useFunnel } from './useFunnel';
import { num, useStateCode } from './useStateRate';

interface Props {
  rates: RateOption[];
  stateChange: Record<string, number>;
}

const STEPS = ['Your bills', 'Season', 'Changes at home', 'The bill itself'] as const;

const CHANGES: [Change, string][] = [
  ['space-heater', 'Started using a space heater'],
  ['new-appliance', 'A new or extra appliance (freezer, dehumidifier, hot tub…)'],
  ['more-home', 'More time at home (working from home, school break)'],
  ['ev', 'Charging an electric car at home'],
  ['pool', 'Pool pump or hot tub season'],
  ['guests', 'More people living in or visiting the home'],
];

const EVIDENCE: Record<Evidence, { heading: string; note: string }> = {
  numbers: {
    heading: 'Shown by your bill numbers',
    note: 'The arithmetic of your two bills shows these changed.',
  },
  likely: {
    heading: 'Likely, from your answers',
    note: 'They fit what you told us, but the bills alone cannot prove them.',
  },
  check: {
    heading: 'Worth checking',
    note: 'Possible; a quick check will rule them in or out.',
  },
};

type Bill = { kwh: string; total: string; days: string };
const emptyBill: Bill = { kwh: '', total: '', days: '' };

const toBill = (b: Bill): BillDetail | null => {
  const k = num(b.kwh);
  const t = num(b.total);
  if (k === null || t === null) return null;
  const d = num(b.days);
  return d !== null && d > 0 ? { kwh: k, total: t, days: d } : { kwh: k, total: t };
};

export default function BillDiagnosis({ rates, stateChange }: Props) {
  const { code, setCode, ready } = useStateCode(rates);
  const state = rates.find((r) => r.code === code) ?? rates[0]!;
  const [step, setStep] = useState(0);
  const [prev, setPrev] = useState<Bill>(emptyBill);
  const [now, setNow] = useState<Bill>(emptyBill);
  const [compare, setCompare] = useState<'last-year' | 'last-month' | 'other'>('last-month');
  const [weather, setWeather] = useState<'colder' | 'hotter' | 'similar' | 'unsure'>('unsure');
  const [heat, setHeat] = useState(false);
  const [cool, setCool] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const [estimated, setEstimated] = useState<'yes' | 'no' | 'unsure'>('unsure');
  const [plan, setPlan] = useState<'yes' | 'no' | 'unsure'>('unsure');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const done = step >= STEPS.length;

  const p = toBill(prev);
  const n = toBill(now);
  // Days only count when given for both bills.
  if (p && n && (p.days === undefined || n.days === undefined)) {
    delete p.days;
    delete n.days;
  }
  const result = diagnose({
    bills: p && n ? { prev: p, now: n } : undefined,
    compare,
    weather,
    electricHeat: heat,
    electricCooling: cool,
    changes,
    estimated,
    planChange: plan,
    stateChangePct: stateChange[code] ?? 0,
    stateName: state.name,
  });
  const touch = useFunnel(done, Boolean(result.billError));

  useEffect(() => {
    // Move focus to the new step's heading so keyboard and screen reader users follow along.
    if (ready) headingRef.current?.focus();
  }, [step]);

  const radio = <T extends string>(
    name: string,
    value: T,
    set: (v: T) => void,
    options: [T, string][],
  ) => (
    <div class="choices">
      {options.map(([v, label]) => (
        <label class="choice">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => set(v)} />
          {label}
        </label>
      ))}
    </div>
  );

  const billRow = (which: 'prev' | 'now', b: Bill, set: (b: Bill) => void) => (
    <div class="row3">
      {(
        [
          ['kwh', 'kWh used'],
          ['total', 'Total ($)'],
          ['days', 'Days'],
        ] as const
      ).map(([k, label]) => (
        <div class="field">
          <label for={`dx-${which}-${k}`}>{label}</label>
          <input
            id={`dx-${which}-${k}`}
            inputMode="decimal"
            value={b[k]}
            onInput={(e) => set({ ...b, [k]: e.currentTarget.value })}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div class="tool wizard" data-ready={ready ? '' : undefined}>
      <form class="card" onSubmit={(e) => e.preventDefault()} onInput={touch} onChange={touch}>
        <ol class="progress" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li aria-current={i === step ? 'step' : undefined} class={i < step ? 'done' : ''}>
              {s}
            </li>
          ))}
        </ol>
        {!done && (
          <h2 tabIndex={-1} ref={headingRef} class="step-title">
            {`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
          </h2>
        )}

        {step === 0 && (
          <>
            <div class="field">
              <label for="dx-state">Your state</label>
              <select id="dx-state" value={code} onChange={(e) => setCode(e.currentTarget.value)}>
                {rates.map((o) => (
                  <option value={o.code}>{o.name}</option>
                ))}
              </select>
            </div>
            <p class="hint">
              From two bills: the earlier one and the latest. Days in the billing period are
              optional but help. No bills to hand? Skip ahead; the answers still help.
            </p>
            <fieldset>
              <legend>Earlier bill</legend>
              {billRow('prev', prev, setPrev)}
            </fieldset>
            <fieldset>
              <legend>Latest bill</legend>
              {billRow('now', now, setNow)}
            </fieldset>
            {result.billError && <p class="error">{result.billError}</p>}
          </>
        )}

        {step === 1 && (
          <>
            <fieldset>
              <legend>The earlier bill is from…</legend>
              {radio('dx-compare', compare, setCompare, [
                ['last-month', 'The month before'],
                ['last-year', 'The same month last year'],
                ['other', 'Another time'],
              ])}
            </fieldset>
            <fieldset>
              <legend>Compared with then, the weather was…</legend>
              {radio('dx-weather', weather, setWeather, [
                ['colder', 'Colder'],
                ['hotter', 'Hotter'],
                ['similar', 'About the same'],
                ['unsure', 'Not sure'],
              ])}
            </fieldset>
            <fieldset>
              <legend>Electric heating or cooling in your home</legend>
              <div class="choices">
                <label class="choice">
                  <input
                    type="checkbox"
                    checked={heat}
                    onChange={(e) => setHeat(e.currentTarget.checked)}
                  />
                  Electric heat (heat pump, baseboard, electric furnace)
                </label>
                <label class="choice">
                  <input
                    type="checkbox"
                    checked={cool}
                    onChange={(e) => setCool(e.currentTarget.checked)}
                  />
                  Air conditioning
                </label>
              </div>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <fieldset>
            <legend>
              Since the earlier bill, did any of these start or grow? (any that apply)
            </legend>
            <div class="choices">
              {CHANGES.map(([id, label]) => (
                <label class="choice">
                  <input
                    type="checkbox"
                    checked={changes.includes(id)}
                    onChange={(e) =>
                      setChanges(
                        e.currentTarget.checked
                          ? [...changes, id]
                          : changes.filter((c) => c !== id),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <>
            <fieldset>
              <legend>Does the latest bill say the meter reading was estimated?</legend>
              {radio('dx-est', estimated, setEstimated, [
                ['yes', 'Yes'],
                ['no', 'No, it was an actual reading'],
                ['unsure', 'Not sure'],
              ])}
            </fieldset>
            <fieldset>
              <legend>Did your plan, supplier or a promotional rate change?</legend>
              {radio('dx-plan', plan, setPlan, [
                ['yes', 'Yes'],
                ['no', 'No'],
                ['unsure', 'Not sure'],
              ])}
            </fieldset>
          </>
        )}

        <div class="actions wizard-nav">
          {step > 0 && (
            <button type="button" class="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {!done ? (
            <button type="button" class="go" onClick={() => setStep(step + 1)}>
              {step === STEPS.length - 1 ? 'See possible causes' : 'Next'}
            </button>
          ) : (
            <button
              type="button"
              class="btn"
              onClick={() => {
                setStep(0);
                setPrev(emptyBill);
                setNow(emptyBill);
                setChanges([]);
                setCompare('last-month');
                setWeather('unsure');
                setHeat(false);
                setCool(false);
                setEstimated('unsure');
                setPlan('unsure');
              }}
            >
              Start over
            </button>
          )}
        </div>
      </form>

      <section class="result" aria-live="polite">
        {!done && (
          <p>
            Four short steps. At the end you get the possible causes, sorted by how strong the
            evidence is, and how to check each one. Nothing you type leaves this page.
          </p>
        )}
        {done && (
          <>
            <h2 tabIndex={-1} ref={headingRef} class="step-title">
              Possible causes
            </h2>
            {result.analysis && (
              <p class="note">
                {`Your bill changed by ${result.analysis.change >= 0 ? '+' : ''}${dollars(result.analysis.change)} (${signedPct(result.analysis.changePct)}). ${state.name}'s average residential price changed ${signedPct(stateChange[code] ?? 0)} over the last year (EIA).`}
              </p>
            )}
            {result.causes.length === 0 && (
              <p>
                Nothing in your answers points to a cause. Enter the kWh and totals from two bills
                in step 1 for a breakdown, or use the{' '}
                <a href={`/tools/why-is-my-electric-bill-high/?state=${code}`}>bill checker</a>.
              </p>
            )}
            {(['numbers', 'likely', 'check'] as const).map((ev) => {
              const list = result.causes.filter((c) => c.evidence === ev);
              if (!list.length) return null;
              return (
                <div class={`causes ${ev}`}>
                  <h3>{EVIDENCE[ev].heading}</h3>
                  <p class="note">{EVIDENCE[ev].note}</p>
                  <ul>
                    {list.map((c) => (
                      <li>
                        <strong>{c.title}</strong>
                        {c.amount !== undefined && (
                          <span class="amt">{` +${dollars(c.amount)}`}</span>
                        )}
                        <p>{c.why}</p>
                        <p class="note">
                          {`How to check: ${c.check}`}
                          {c.link && (
                            <>
                              {' '}
                              <a href={c.link.href}>{c.link.label}</a>
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p class="note">
              Possible causes, not confirmed ones. Your utility can explain any line on the bill and
              can check the meter.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
