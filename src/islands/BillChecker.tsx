import { useState } from 'preact/hooks';

import type { RateOption } from '../data/electricity';
import { analyzeBills, validateBill, type BillDetail, type BillPartId } from '../lib/energy';
import { cents, dollars, kwh, signedPct } from '../lib/format';
import { useFunnel } from './useFunnel';
import { initial, num, useStateCode } from './useStateRate';

interface Props {
  rates: RateOption[];
  /** State price change over the year, keyed by state code, in percent. */
  stateChange: Record<string, number>;
  monthLabel: string;
  priorLabel: string;
  annualYear: number;
}

/** Bill lines the visitor can fill in; the first two are required. */
const LINES = [
  ['kwh', 'kWh used', 'e.g. 820'],
  ['total', 'Total bill ($)', 'e.g. 145.20'],
  ['days', 'Days in billing period', 'e.g. 30'],
  ['fixed', 'Fixed charges ($)', 'customer charge'],
  ['taxes', 'Taxes and fees ($)', 'taxes, surcharges'],
  ['credits', 'Credits and discounts ($)', 'enter as a positive number'],
] as const;
type Line = (typeof LINES)[number][0];
type Fields = Record<Line, string>;

export const PART_LABEL: Record<BillPartId, string> = {
  'daily-use': 'Using more or less each day',
  days: 'Longer or shorter billing period',
  usage: 'Using more or fewer kWh',
  price: 'Energy price per kWh',
  fixed: 'Fixed charges',
  taxes: 'Taxes and fees',
  credits: 'Credits and discounts',
};

/** Field ids keep the old names (bc-pk, bc-pd, bc-nk, bc-nd) for the first two lines. */
const fieldId = (which: 'p' | 'n', k: Line) =>
  `bc-${which}${k === 'kwh' ? 'k' : k === 'total' ? 'd' : `-${k}`}`;

const OPTIONAL_NAME = {
  days: 'the days in the billing period',
  fixed: 'fixed charges',
  taxes: 'taxes and fees',
  credits: 'credits',
} as const;

const blank = (which: 'p' | 'n'): Fields =>
  Object.fromEntries(LINES.map(([k]) => [k, initial(fieldId(which, k), '')])) as Fields;

const toBill = (f: Fields): BillDetail | null => {
  const k = num(f.kwh);
  const t = num(f.total);
  if (k === null || t === null) return null;
  const opt = (s: string) => num(s) ?? undefined;
  const b: BillDetail = { kwh: k, total: t };
  for (const key of ['days', 'fixed', 'taxes', 'credits'] as const) {
    const v = opt(f[key]);
    if (v !== undefined) b[key] = v;
  }
  return b;
};

export default function BillChecker({
  rates,
  stateChange,
  monthLabel,
  priorLabel,
  annualYear,
}: Props) {
  const { code, setCode, ready } = useStateCode(rates);
  const state = rates.find((r) => r.code === code) ?? rates[0]!;
  const [prev, setPrev] = useState<Fields>(() => blank('p'));
  const [now, setNow] = useState<Fields>(() => blank('n'));

  const b0 = toBill(prev);
  const b1 = toBill(now);
  // Optional lines count only when filled on both bills, so a half-filled pair is not misread.
  const pair = (key: 'days' | 'fixed' | 'taxes' | 'credits') =>
    b0 && b1 && (b0[key] === undefined) !== (b1[key] === undefined)
      ? `Enter ${OPTIONAL_NAME[key]} on both bills, or on neither.`
      : null;
  const pairError = (['days', 'fixed', 'taxes', 'credits'] as const).map(pair).find(Boolean);
  // An optional line that does not read as a number must not silently count as empty.
  const unreadable = (['days', 'fixed', 'taxes', 'credits'] as const).find((k) =>
    [prev, now].some((f) => f[k].trim() !== '' && num(f[k]) === null),
  );
  const error =
    b0 && b1
      ? unreadable
        ? `Enter ${OPTIONAL_NAME[unreadable]} as a number, e.g. ${unreadable === 'days' ? '30' : '12.50'}.`
        : (validateBill(b0) ?? validateBill(b1) ?? pairError ?? null)
      : null;
  const r = b0 && b1 && !error ? analyzeBills(b0, b1) : null;
  const change = stateChange[code] ?? 0;
  const touch = useFunnel(r !== null, error !== null);

  const maxPart = r ? Math.max(...r.parts.map((p) => Math.abs(p.amount)), 0.01) : 1;
  const detailed = r && r.parts.some((p) => p.id !== 'usage' && p.id !== 'price');

  const billFields = (
    which: 'p' | 'n',
    values: Fields,
    set: (f: Fields) => void,
    lines: readonly (typeof LINES)[number][],
  ) => (
    <div class="row2">
      {lines.map(([k, label, ph]) => (
        <div class="field">
          <label for={fieldId(which, k)}>{label}</label>
          <input
            id={fieldId(which, k)}
            inputMode="decimal"
            value={values[k]}
            onInput={(e) => set({ ...values, [k]: e.currentTarget.value })}
            placeholder={ph}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div class="tool" data-ready={ready ? '' : undefined}>
      <form
        class="card"
        onSubmit={(e) => e.preventDefault()}
        onInput={touch}
        aria-label="Your two bills"
      >
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
          {billFields('p', prev, setPrev, LINES.slice(0, 2))}
        </fieldset>
        <fieldset>
          <legend>Latest bill</legend>
          {billFields('n', now, setNow, LINES.slice(0, 2))}
        </fieldset>
        <details>
          <summary>More lines from the bills (optional, more accurate)</summary>
          <p class="hint">
            Fill a line on both bills to separate it out. Fixed charges are paid even at 0 kWh;
            credits include solar, low-income or budget-billing adjustments.
          </p>
          <fieldset>
            <legend>Earlier bill</legend>
            {billFields('p', prev, setPrev, LINES.slice(2))}
          </fieldset>
          <fieldset>
            <legend>Latest bill</legend>
            {billFields('n', now, setNow, LINES.slice(2))}
          </fieldset>
        </details>
        <p class="note">Nothing you type leaves this page.</p>
      </form>

      <section class="result" aria-live="polite">
        {!r && !error && (
          <p>
            Enter the kWh and the total from two bills. We split the difference into the part caused
            by <strong>using more electricity</strong> and the part caused by a higher{' '}
            <strong>price per kWh</strong>, and, if you add them, fixed charges, taxes and the
            length of the billing period.
          </p>
        )}
        {error && <p class="error">{error}</p>}
        {r && (
          <>
            <p class="note">Your bill changed by</p>
            <p class={`big ${r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}`}>
              {`${r.change >= 0 ? '+' : ''}${dollars(r.change)} (${signedPct(r.changePct)})`}
            </p>
            <table class="parts">
              <caption class="sr-only">What changed, in dollars</caption>
              <tbody>
                {r.parts.map((p) => (
                  <tr>
                    <th scope="row">{PART_LABEL[p.id]}</th>
                    <td class="bar-cell" aria-hidden="true">
                      <span
                        class={`pbar ${p.amount >= 0 ? 'pos' : 'neg'}`}
                        style={{ width: `${(Math.abs(p.amount) / maxPart) * 100}%` }}
                      />
                    </td>
                    <td>{`${p.amount >= 0 ? '+' : ''}${dollars(p.amount)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="verdict">{verdict(r, b0!, b1!)}</p>
            <h2 class="sub">What this does and does not tell you</h2>
            <ul>
              <li>
                {`Energy price per kWh: ${cents(r.energyPrev)} → ${cents(r.energyNow)}${detailed ? ' (energy charges only)' : ' (whole bill ÷ kWh, so fixed charges and taxes are mixed in)'}. A change can be a rate increase, but also a higher usage tier, more use in peak hours, or a fuel or supply adjustment. The rate lines on the bill show which.`}
              </li>
              {r.dailyPrev !== undefined && (
                <li>
                  {`Daily use: ${r.dailyPrev.toFixed(1)} → ${r.dailyNow!.toFixed(1)} kWh a day. Comparing per day removes the effect of a ${b0!.days}-day vs ${b1!.days}-day billing period.`}
                </li>
              )}
              <li>
                {`${state.name}: the average residential price was ${cents(state.price)} in ${monthLabel}, `}
                <span class={change > 0 ? 'up' : 'down'}>{signedPct(change)}</span>
                {` from ${priorLabel} (EIA). A typical ${state.name} home used about ${kwh(state.avgKwh)} a month in ${annualYear}; your latest bill shows ${kwh(b1!.kwh)}.`}
              </li>
            </ul>
            <p class="note">
              These are the arithmetic parts of the change, not confirmed causes. Season, a new
              appliance, an estimated meter reading or a plan change can each sit behind them.
            </p>
            <p>
              <a href="/tools/electric-bill-diagnosis/">Step-by-step bill diagnosis</a> ·{' '}
              <a href={`/tools/appliance-electricity-cost/?state=${code}`}>
                What an appliance costs
              </a>
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function verdict(r: ReturnType<typeof analyzeBills>, b0: BillDetail, b1: BillDetail): string {
  if (!r.main) return 'Your two bills are essentially the same.';
  const part = r.parts.find((p) => p.id === r.main)!;
  const share = Math.abs(r.change) > 0 ? Math.round((part.amount / r.change) * 100) : 0;
  const lead =
    share > 0 && share <= 100
      ? `${PART_LABEL[r.main]}: about ${share}% of the change.`
      : `Largest part: ${PART_LABEL[r.main]}.`;
  switch (r.main) {
    case 'usage':
    case 'daily-use':
      return `${lead} You used ${kwh(Math.abs(b1.kwh - b0.kwh))} ${b1.kwh > b0.kwh ? 'more' : 'less'} than on the earlier bill.`;
    case 'days':
      return `${lead} The latest bill covers ${b1.days} days instead of ${b0.days}; your daily use barely changed.`;
    case 'price':
      return `${lead} Each kWh cost ${cents(r.energyPrev)} before and ${cents(r.energyNow)} now.`;
    case 'fixed':
      return `${lead} Fixed charges went from ${dollars(b0.fixed ?? 0)} to ${dollars(b1.fixed ?? 0)}.`;
    case 'taxes':
      return `${lead} Taxes and fees went from ${dollars(b0.taxes ?? 0)} to ${dollars(b1.taxes ?? 0)}.`;
    case 'credits':
      return `${lead} Credits went from ${dollars(b0.credits ?? 0)} to ${dollars(b1.credits ?? 0)}.`;
  }
}
