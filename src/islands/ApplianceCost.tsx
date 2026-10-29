import { useState } from 'preact/hooks';

import { track } from '../analytics/client';
import type { Appliance } from '../data/appliances';
import type { RateOption } from '../data/electricity';
import { runningCost } from '../lib/energy';
import { cents, dollars } from '../lib/format';
import { initial, num, useStateRate } from './useStateRate';

interface Props {
  rates: RateOption[];
  appliances: Appliance[];
  /** Fix the appliance (e.g. the space heater page) and offer these wattage presets instead. */
  fixed?: { id: string; presets: number[] };
  monthLabel: string;
}

export default function ApplianceCost({ rates, appliances, fixed, monthLabel }: Props) {
  const { code, setCode, custom, setCustom, state, rate, useCustom } = useStateRate(rates);
  const first = appliances.find((a) => a.id === (fixed?.id ?? 'space-heater')) ?? appliances[0]!;
  const [applianceId, setApplianceId] = useState(first.id);
  const [watts, setWatts] = useState(() => initial('ac-watts', String(first.watts)));
  const [hours, setHours] = useState(() => initial('ac-hours', String(first.hours)));
  const appliance = appliances.find((a) => a.id === applianceId) ?? first;

  const pick = (id: string) => {
    const a = appliances.find((x) => x.id === id);
    if (!a) return;
    setApplianceId(id);
    setWatts(String(a.watts));
    setHours(String(a.hours));
  };

  const w = num(watts);
  const h = num(hours);
  const valid = w !== null && h !== null && h <= 24;
  const duty = appliance.dutyCycle ?? 1;
  const c = valid ? runningCost(w! * duty, h!, rate) : null;
  const sorted = [...rates].sort((a, b) => a.price - b.price);
  const cheapest = sorted[0]!;
  const priciest = sorted[sorted.length - 1]!;
  const wattStep = appliance.max - appliance.min > 2000 ? 50 : 10;
  const rateMax = Math.max(50, Math.ceil(priciest.price / 5) * 5 + 5);

  return (
    <div class="tool">
      <form
        class="card"
        onSubmit={(e) => e.preventDefault()}
        // Any change by the visitor counts as using the tool (once per page view).
        onInput={() => track('tool')}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) track('tool');
        }}
        aria-label="Appliance and usage"
      >
        {!fixed && (
          <div class="field">
            <label for="ac-appliance">Appliance</label>
            <select
              id="ac-appliance"
              value={applianceId}
              onChange={(e) => pick(e.currentTarget.value)}
            >
              {appliances.map((a) => (
                <option value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
        <div class="field">
          <label for="ac-watts">Power (watts)</label>
          {fixed && (
            <div class="legend" role="group" aria-label="Common settings">
              {fixed.presets.map((p) => (
                <button
                  type="button"
                  class="preset"
                  aria-pressed={watts === String(p)}
                  onClick={() => setWatts(String(p))}
                >
                  {p.toLocaleString('en-US')} W
                </button>
              ))}
            </div>
          )}
          <input
            id="ac-watts"
            inputMode="decimal"
            value={watts}
            onInput={(e) => setWatts(e.currentTarget.value)}
          />
          {appliance.max > appliance.min && (
            <Slider
              label="Drag to set the power"
              min={appliance.min}
              max={appliance.max}
              step={wattStep}
              value={w ?? appliance.watts}
              onInput={(v) => setWatts(String(v))}
              format={(v) => `${v.toLocaleString('en-US')} W`}
            />
          )}
          <span class="hint">
            Check the label on the appliance. Typical range (DOE):{' '}
            {appliance.min.toLocaleString('en-US')}
            {appliance.max !== appliance.min ? `–${appliance.max.toLocaleString('en-US')}` : ''} W.
            {appliance.note ? ` ${appliance.note}` : ''}
          </span>
        </div>
        <div class="field">
          <label for="ac-hours">Hours per day</label>
          <input
            id="ac-hours"
            inputMode="decimal"
            value={hours}
            onInput={(e) => setHours(e.currentTarget.value)}
          />
          <Slider
            label="Drag to set the daily use"
            min={0}
            max={24}
            step={0.5}
            value={h ?? 0}
            onInput={(v) => setHours(String(v))}
            format={(v) => `${v} h`}
          />
        </div>
        <div class="field">
          <label for="ac-state">Your state</label>
          <select id="ac-state" value={code} onChange={(e) => setCode(e.currentTarget.value)}>
            {rates.map((o) => (
              <option value={o.code}>
                {o.name}: {cents(o.price)}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="ac-rate">Or your own rate (¢ or $ per kWh)</label>
          <input
            id="ac-rate"
            inputMode="decimal"
            value={custom}
            onInput={(e) => setCustom(e.currentTarget.value)}
            placeholder="optional, from your bill"
          />
          <Slider
            label="Drag to try a different price"
            min={5}
            max={rateMax}
            step={0.01}
            value={rate}
            onInput={(v) => setCustom(v.toFixed(2))}
            format={(v) => `${v}¢`}
          />
          {useCustom && (
            <button type="button" class="preset reset" onClick={() => setCustom('')}>
              Back to the {state.name} average ({cents(state.price)})
            </button>
          )}
        </div>
        {/* Phones show the result below the form; this keeps the total in view while dragging. */}
        {c && (
          <p class="live" aria-hidden="true">
            {dollars(c.perMonth)} / month <span>at {cents(rate)}</span>
          </p>
        )}
      </form>

      <section class="result" aria-live="polite">
        {!valid && <p class="error">Enter the watts and 0–24 hours per day.</p>}
        {c && (
          <>
            <p class="note">
              {appliance.name}, {w!.toLocaleString('en-US')} W, {h} h/day at {cents(rate)} per kWh
              {useCustom ? ' (your rate)' : ` (${state.name} average, ${monthLabel})`}
            </p>
            <p class="big">{dollars(c.perMonth)} / month</p>
            <div class="table-scroll">
              <table>
                <tbody>
                  <tr>
                    <td>Per hour of use</td>
                    <td>{dollars(c.perHour, 3)}</td>
                  </tr>
                  <tr>
                    <td>Per day</td>
                    <td>{dollars(c.perDay)}</td>
                  </tr>
                  <tr>
                    <td>Per month (30 days)</td>
                    <td>{dollars(c.perMonth)}</td>
                  </tr>
                  <tr>
                    <td>Per year</td>
                    <td>{dollars(c.perYear, 0)}</td>
                  </tr>
                  <tr>
                    <td>Electricity per day</td>
                    <td>{c.kwhPerDay.toFixed(2)} kWh</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="note">
              Same use in the cheapest state ({cheapest.name}, {cents(cheapest.price)}):{' '}
              {dollars(runningCost(w! * duty, h!, cheapest.price).perMonth)}/month · most expensive
              ({priciest.name}, {cents(priciest.price)}):{' '}
              {dollars(runningCost(w! * duty, h!, priciest.price).perMonth)}/month.
            </p>
            {duty < 1 && (
              <p class="note">
                Counted as running {Math.round(duty * 100)}% of the time because it cycles on and
                off.
              </p>
            )}
            <p class="note">
              State averages are total revenue ÷ kWh sold, so fixed charges are spread over every
              kWh; your utility's price for extra kWh can be a little different (tiers,
              time-of-use). Heaters with a thermostat may run fewer hours than entered.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onInput: (v: number) => void;
  format: (v: number) => string;
}

/** A range control under a text field; both edit the same value. */
function Slider({ label, min, max, step, value, onInput, format }: SliderProps) {
  return (
    <div class="slider">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onInput={(e) => onInput(Number(e.currentTarget.value))}
      />
      <span class="hint" aria-hidden="true">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </span>
    </div>
  );
}
