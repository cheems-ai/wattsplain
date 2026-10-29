import { useState } from 'preact/hooks';

import { track } from '../analytics/client';
import { KIND_HINT, defaultProfile, type Appliance } from '../data/appliances';
import type { RateOption } from '../data/electricity';
import {
  applianceEnergy,
  cost,
  fromYearlyKwh,
  validateProfile,
  wattsFromBtu,
  type UsageProfile,
} from '../lib/appliance';
import { cents, dollars } from '../lib/format';
import { resolveRate } from '../lib/rate';
import { RateField, useRateInput } from './RateField';
import { initial, num, useStateCode } from './useStateRate';

interface Props {
  rates: RateOption[];
  appliances: Appliance[];
  /** Fix the appliance (e.g. the space heater page) and offer these wattage presets instead. */
  fixed?: { id: string; presets: number[] };
  monthLabel: string;
}

type Basis = 'watts' | 'label';

export default function ApplianceCost({ rates, appliances, fixed, monthLabel }: Props) {
  const { code, setCode, ready } = useStateCode(rates);
  const state = rates.find((r) => r.code === code) ?? rates[0]!;
  const { input: rateInput, set: setRate } = useRateInput('ac-rate');
  const rate = resolveRate(rateInput, state.price, `${state.name} average, ${monthLabel}`);

  const first = appliances.find((a) => a.id === (fixed?.id ?? 'space-heater')) ?? appliances[0]!;
  const start = defaultProfile(first);
  const [applianceId, setApplianceId] = useState(first.id);
  const [basis, setBasis] = useState<Basis>('watts');
  const [watts, setWatts] = useState(() => initial('ac-watts', String(start.watts)));
  const [hours, setHours] = useState(() => initial('ac-hours', String(start.hoursPerDay)));
  const [duty, setDuty] = useState(() => initial('ac-duty', pct(start.dutyCycle)));
  const [days, setDays] = useState(() => initial('ac-days', String(start.daysPerWeek)));
  const [months, setMonths] = useState(() => initial('ac-months', String(start.monthsPerYear)));
  const [standby, setStandby] = useState(() => initial('ac-standby', '0'));
  const [labelKwh, setLabelKwh] = useState(() => initial('ac-label', ''));
  const [btu, setBtu] = useState('');
  const [eer, setEer] = useState('');
  const appliance = appliances.find((a) => a.id === applianceId) ?? first;

  const pick = (id: string) => {
    const a = appliances.find((x) => x.id === id);
    if (!a) return;
    const p = defaultProfile(a);
    setApplianceId(id);
    setWatts(String(p.watts));
    setHours(String(p.hoursPerDay));
    setDuty(pct(p.dutyCycle));
    setDays(String(p.daysPerWeek));
    setMonths(String(p.monthsPerYear));
    setStandby('0');
    if (!a.energyGuide) setBasis('watts');
  };

  const profile: UsageProfile = {
    watts: num(watts) ?? NaN,
    hoursPerDay: num(hours) ?? NaN,
    dutyCycle: (num(duty) ?? NaN) / 100,
    daysPerWeek: num(days) ?? NaN,
    monthsPerYear: num(months) ?? NaN,
    standbyWatts: num(standby) ?? 0,
  };
  const yearly = num(labelKwh);
  const useLabel = basis === 'label' && Boolean(appliance.energyGuide);
  const inputError = useLabel
    ? yearly === null || yearly <= 0
      ? 'Enter the kWh per year from the EnergyGuide label.'
      : null
    : validateProfile(profile);
  const energy = inputError ? null : useLabel ? fromYearlyKwh(yearly!) : applianceEnergy(profile);
  const price = rate.cents;
  const sorted = [...rates].sort((a, b) => a.price - b.price);
  const cheapest = sorted[0]!;
  const priciest = sorted[sorted.length - 1]!;
  const wattStep = appliance.max - appliance.min > 2000 ? 50 : 10;
  const rateMax = Math.max(50, Math.ceil(priciest.price / 5) * 5 + 5);
  const btuWatts = num(btu) && num(eer) ? wattsFromBtu(num(btu)!, num(eer)!) : null;

  const perMonth = energy && price !== null ? cost(energy.kwhPerMonthInUse, price) : null;
  const seasonal = !useLabel && profile.monthsPerYear < 12;

  return (
    <div class="tool" data-ready={ready ? '' : undefined}>
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

        {appliance.energyGuide && (
          <div class="segmented" role="group" aria-label="What you know about it">
            <button
              type="button"
              aria-pressed={basis === 'watts'}
              onClick={() => setBasis('watts')}
            >
              Watts and hours
            </button>
            <button
              type="button"
              aria-pressed={basis === 'label'}
              onClick={() => setBasis('label')}
            >
              kWh/year from the label
            </button>
          </div>
        )}

        {useLabel ? (
          <div class="field">
            <label for="ac-label">kWh per year (EnergyGuide label)</label>
            <input
              id="ac-label"
              inputMode="decimal"
              value={labelKwh}
              onInput={(e) => setLabelKwh(e.currentTarget.value)}
              placeholder="the large number on the yellow label"
            />
            <span class="hint">
              The label figure comes from a standard test, so it is usually closer than watts ×
              hours. Your own use can differ.
            </span>
          </div>
        ) : (
          <>
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
                  value={num(watts) ?? appliance.watts}
                  onInput={(v) => setWatts(String(v))}
                  format={(v) => `${v.toLocaleString('en-US')} W`}
                />
              )}
              <span class="hint">
                {`Check the label on the appliance. Typical range (DOE): ${appliance.min.toLocaleString('en-US')}${appliance.max !== appliance.min ? `–${appliance.max.toLocaleString('en-US')}` : ''} W.${appliance.note ? ` ${appliance.note}` : ''}`}
              </span>
              {!fixed && (
                <details class="inline">
                  <summary>Only know Btu/h and EER? (air conditioners)</summary>
                  <div class="row2">
                    <div class="field">
                      <label for="ac-btu">Capacity (Btu/h)</label>
                      <input
                        id="ac-btu"
                        inputMode="decimal"
                        value={btu}
                        onInput={(e) => setBtu(e.currentTarget.value)}
                      />
                    </div>
                    <div class="field">
                      <label for="ac-eer">EER or CEER</label>
                      <input
                        id="ac-eer"
                        inputMode="decimal"
                        value={eer}
                        onInput={(e) => setEer(e.currentTarget.value)}
                      />
                    </div>
                  </div>
                  {btuWatts !== null && (
                    <button
                      type="button"
                      class="preset"
                      onClick={() => setWatts(String(Math.round(btuWatts)))}
                    >
                      {`Use ${Math.round(btuWatts).toLocaleString('en-US')} W (Btu/h ÷ EER)`}
                    </button>
                  )}
                </details>
              )}
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
                value={num(hours) ?? 0}
                onInput={(v) => setHours(String(v))}
                format={(v) => `${v} h`}
              />
            </div>
            <div class="field">
              <label for="ac-duty">Running share of those hours (%)</label>
              <input
                id="ac-duty"
                inputMode="decimal"
                value={duty}
                onInput={(e) => setDuty(e.currentTarget.value)}
              />
              <span class="hint">{KIND_HINT[appliance.kind]}</span>
            </div>
            <div class="row2">
              <div class="field">
                <label for="ac-days">Days per week</label>
                <input
                  id="ac-days"
                  inputMode="decimal"
                  value={days}
                  onInput={(e) => setDays(e.currentTarget.value)}
                />
              </div>
              <div class="field">
                <label for="ac-months">Months per year</label>
                <input
                  id="ac-months"
                  inputMode="decimal"
                  value={months}
                  onInput={(e) => setMonths(e.currentTarget.value)}
                />
              </div>
            </div>
            <p class="hint">
              The schedule is an example to start from, not a measurement. Set your own.
            </p>
            <div class="field">
              <label for="ac-standby">Standby power when off (watts, optional)</label>
              <input
                id="ac-standby"
                inputMode="decimal"
                value={standby}
                onInput={(e) => setStandby(e.currentTarget.value)}
              />
              <span class="hint">
                Counted for every hour of the year it is not running. A plug-in power meter shows
                it.
              </span>
            </div>
          </>
        )}

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
        <RateField
          prefix="ac-rate"
          input={rateInput}
          set={setRate}
          resolved={rate}
          stateName={state.name}
          statePrice={state.price}
        />
        <Slider
          label="Drag to try a different price"
          min={5}
          max={rateMax}
          step={0.01}
          value={price ?? state.price}
          onInput={(v) => setRate({ mode: 'custom', unit: 'cents', custom: v.toFixed(2) })}
          format={(v) => `${v}¢`}
        />
        {rateInput.mode !== 'state' && (
          <button type="button" class="preset reset" onClick={() => setRate({ mode: 'state' })}>
            Back to the {state.name} average ({cents(state.price)})
          </button>
        )}
        {/* Phones show the result below the form; this keeps the total in view while dragging. */}
        {perMonth !== null && (
          <p class="live" aria-hidden="true">
            {dollars(perMonth)} / month <span>at {cents(price!)}</span>
          </p>
        )}
      </form>

      <section class="result" aria-live="polite">
        {inputError && <p class="error">{inputError}</p>}
        {!inputError && price === null && (
          <p class="error">
            {rate.error ?? 'Finish the electricity price, or use the state average.'}
          </p>
        )}
        {energy && price !== null && perMonth !== null && (
          <>
            <p class="note">
              {`${
                useLabel
                  ? `${appliance.name}, ${Math.round(yearly!).toLocaleString('en-US')} kWh a year (label)`
                  : `${appliance.name}, ${profile.watts.toLocaleString('en-US')} W, ${profile.hoursPerDay} h/day`
              } at ${cents(price)} per kWh (${rate.label})`}
            </p>
            <p class="big">{dollars(perMonth)} / month</p>
            <p class="note">
              {seasonal ? 'In a month it is used (30 days).' : 'For a 30-day month.'}
            </p>
            <div class="table-scroll">
              <table>
                <tbody>
                  {!useLabel && (
                    <tr>
                      <td>Per hour running</td>
                      <td>{dollars(cost(profile.watts / 1000, price), 3)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>{useLabel ? 'Per day (average)' : 'Per day it is used'}</td>
                    <td>{dollars(cost(energy.kwhPerUseDay, price))}</td>
                  </tr>
                  <tr>
                    <td>{seasonal ? 'Per month in season' : 'Per month (30 days)'}</td>
                    <td>{dollars(perMonth)}</td>
                  </tr>
                  <tr>
                    <td>Per year</td>
                    <td>{dollars(cost(energy.kwhPerYear, price), 0)}</td>
                  </tr>
                  <tr>
                    <td>Electricity per year</td>
                    <td>{`${Math.round(energy.kwhPerYear).toLocaleString('en-US')} kWh`}</td>
                  </tr>
                  {energy.standbyKwhPerYear > 0 && (
                    <tr>
                      <td>of which standby</td>
                      <td>
                        {`${Math.round(energy.standbyKwhPerYear).toLocaleString('en-US')} kWh (${dollars(cost(energy.standbyKwhPerYear, price), 0)})`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!useLabel && appliance.kind === 'thermostat' && profile.dutyCycle === 1 && (
              <p class="note">
                {`Upper bound: it is counted as running every hour it is on. If the thermostat keeps it off half the time, it costs ${dollars(perMonth / 2)} a month.`}
              </p>
            )}
            <p class="note">
              {`Same use in the cheapest state (${cheapest.name}, ${cents(cheapest.price)}): ${dollars(cost(energy.kwhPerMonthInUse, cheapest.price))}/month · most expensive (${priciest.name}, ${cents(priciest.price)}): ${dollars(cost(energy.kwhPerMonthInUse, priciest.price))}/month.`}
            </p>
            {!rate.marginal && (
              <p class="note">
                State averages are total revenue ÷ kWh sold, so fixed charges are spread over every
                kWh; the price of an extra kWh on your plan can differ (tiers, time-of-use). Choose
                “Work it out from my bill” for your own figure.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

const pct = (f: number) => String(Math.round(f * 1000) / 10);

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
export function Slider({ label, min, max, step, value, onInput, format }: SliderProps) {
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
