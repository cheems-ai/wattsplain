import { useEffect, useState } from 'preact/hooks';

import { track } from '../analytics/client';
import type { RateOption } from '../data/electricity';
import { compareBills } from '../lib/energy';
import { cents, dollars, kwh, signedPct } from '../lib/format';
import { initial, num, useStateRate } from './useStateRate';

interface Props {
  rates: RateOption[];
  /** State price change over the year, keyed by state code, in percent. */
  stateChange: Record<string, number>;
  monthLabel: string;
  priorLabel: string;
  annualYear: number;
}

export default function BillChecker({
  rates,
  stateChange,
  monthLabel,
  priorLabel,
  annualYear,
}: Props) {
  const { code, setCode, state } = useStateRate(rates);
  const [prevKwh, setPrevKwh] = useState(() => initial('bc-pk', ''));
  const [prevDollars, setPrevDollars] = useState(() => initial('bc-pd', ''));
  const [nowKwh, setNowKwh] = useState(() => initial('bc-nk', ''));
  const [nowDollars, setNowDollars] = useState(() => initial('bc-nd', ''));

  const values = [prevKwh, prevDollars, nowKwh, nowDollars].map(num);
  const complete = values.every((v) => v !== null);
  const [pk, pd, nk, nd] = values as number[];
  const invalid = complete && (pk === 0 || nk === 0);
  const r =
    complete && !invalid
      ? compareBills({ kwh: pk!, dollars: pd! }, { kwh: nk!, dollars: nd! })
      : null;
  const change = stateChange[code] ?? 0;
  // Count the tool as used once the visitor has entered two complete bills.
  const hasResult = r !== null;
  useEffect(() => {
    if (hasResult) track('tool');
  }, [hasResult]);

  const total = r ? Math.abs(r.rateEffect) + Math.abs(r.usageEffect) : 0;
  const share = (x: number) => (total > 0 ? (Math.abs(x) / total) * 100 : 0);

  return (
    <div class="tool">
      <form class="card" onSubmit={(e) => e.preventDefault()} aria-label="Your two bills">
        <div class="field">
          <label for="bc-state">Your state</label>
          <select id="bc-state" value={code} onChange={(e) => setCode(e.currentTarget.value)}>
            {rates.map((o) => (
              <option value={o.code}>{o.name}</option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend>Earlier bill</legend>
          <p class="hint">Best: the same month last year, so the season is the same.</p>
          <div class="row2">
            <div class="field">
              <label for="bc-pk">kWh used</label>
              <input
                id="bc-pk"
                inputMode="decimal"
                value={prevKwh}
                onInput={(e) => setPrevKwh(e.currentTarget.value)}
                placeholder="e.g. 820"
              />
            </div>
            <div class="field">
              <label for="bc-pd">Total bill ($)</label>
              <input
                id="bc-pd"
                inputMode="decimal"
                value={prevDollars}
                onInput={(e) => setPrevDollars(e.currentTarget.value)}
                placeholder="e.g. 145.20"
              />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Latest bill</legend>
          <div class="row2">
            <div class="field">
              <label for="bc-nk">kWh used</label>
              <input
                id="bc-nk"
                inputMode="decimal"
                value={nowKwh}
                onInput={(e) => setNowKwh(e.currentTarget.value)}
                placeholder="e.g. 910"
              />
            </div>
            <div class="field">
              <label for="bc-nd">Total bill ($)</label>
              <input
                id="bc-nd"
                inputMode="decimal"
                value={nowDollars}
                onInput={(e) => setNowDollars(e.currentTarget.value)}
                placeholder="e.g. 198.40"
              />
            </div>
          </div>
        </fieldset>
        <p class="note">
          Both numbers are printed on your bill. Nothing you type leaves this page.
        </p>
      </form>

      <section class="result" aria-live="polite">
        {!r && !invalid && (
          <p>
            Enter the kWh and the total from two bills. We will split the difference into the part
            caused by a higher <strong>price per kWh</strong> and the part caused by{' '}
            <strong>using more electricity</strong>.
          </p>
        )}
        {invalid && <p class="error">kWh must be more than 0 on both bills.</p>}
        {r && (
          <>
            <p class="note">Your bill changed by</p>
            <p class={`big ${r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}`}>
              {r.change >= 0 ? '+' : ''}
              {dollars(r.change)} ({signedPct(r.changePct)})
            </p>
            <div
              class="bar"
              role="img"
              aria-label={`Price part ${dollars(r.rateEffect)}, usage part ${dollars(r.usageEffect)}`}
            >
              <span class="rate" style={{ width: `${share(r.rateEffect)}%` }} />
              <span class="usage" style={{ width: `${share(r.usageEffect)}%` }} />
            </div>
            <div class="legend">
              <span>
                <i style={{ background: '#d97706' }} />
                Price per kWh: {r.rateEffect >= 0 ? '+' : ''}
                {dollars(r.rateEffect)}
              </span>
              <span>
                <i style={{ background: '#2563eb' }} />
                Usage: {r.usageEffect >= 0 ? '+' : ''}
                {dollars(r.usageEffect)}
              </span>
            </div>
            <p class="verdict">
              {r.driver === 'none' && 'Your two bills are essentially the same.'}
              {r.driver === 'rate' &&
                `Mostly the price. You paid ${cents(r.rateNow)} per kWh on the latest bill, up from ${cents(r.ratePrev)}.`}
              {r.driver === 'usage' &&
                `Mostly usage. You used ${kwh(Math.abs(nk! - pk!))} ${nk! > pk! ? 'more' : 'less'} than on the earlier bill.`}
              {r.driver === 'both' &&
                `Both: a ${r.rateNow > r.ratePrev ? 'higher' : 'lower'} price per kWh (${cents(r.ratePrev)} → ${cents(r.rateNow)}) and ${nk! > pk! ? 'more' : 'less'} electricity (${kwh(pk!)} → ${kwh(nk!)}).`}
            </p>
            <h3>How you compare with {state.name}</h3>
            <ul>
              <li>
                Average residential price in {state.name}: <strong>{cents(state.price)}</strong> in{' '}
                {monthLabel}, <span class={change > 0 ? 'up' : 'down'}>{signedPct(change)}</span>{' '}
                from {priorLabel}. Your latest bill works out to {cents(r.rateNow)} per kWh
                including fixed charges and taxes.
              </li>
              <li>
                A typical {state.name} home used about <strong>{kwh(state.avgKwh)}</strong> a month
                in {annualYear}. You used {kwh(nk!)} on the latest bill (
                {signedPct(((nk! - state.avgKwh) / state.avgKwh) * 100, 0)}).
              </li>
            </ul>
            <p class="note">
              Your price per kWh here is the whole bill divided by kWh, so fixed monthly charges
              count too: it looks higher in months when you use little electricity. Billing periods
              of different lengths also change the kWh.
            </p>
            {(r.driver === 'usage' || r.driver === 'both') && nk! > pk! && (
              <p>
                Find what is using it:{' '}
                <a href="/tools/appliance-electricity-cost/">appliance cost calculator</a> ·{' '}
                <a href="/tools/space-heater-cost/">space heater cost</a>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
