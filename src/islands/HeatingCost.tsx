import { useEffect, useState } from 'preact/hooks';

import { track } from '../analytics/client';
import type { HeatingOption } from '../data/heating';
import { parseRate } from '../lib/energy';
import { cents, dollars } from '../lib/format';
import {
  BTU,
  STOCK_GAS_EFFICIENCY,
  breakEvenElectricity,
  cheapestOf,
  compareSystems,
  defaultEfficiencies,
  perTherm,
  type SystemId,
} from '../lib/heating';
import { initial, num } from './useStateRate';

interface Props {
  options: HeatingOption[];
  /** e.g. "12-month average, Sep 2025 – Aug 2026" */
  electricLabel: string;
  propaneWeek: string;
  gasLabel: string;
}

/** What the visitor can base the heat on: the state's typical home, or their own fuel use. */
const BASES = {
  typical: { label: 'Typical home in my state', unit: '' },
  therms: { label: 'My gas use (therms/yr)', unit: 'therms' },
  propane: { label: 'My propane use (gal/yr)', unit: 'gallons' },
  oil: { label: 'My heating oil use (gal/yr)', unit: 'gallons' },
} as const;
type Basis = keyof typeof BASES;
/** Delivered million Btu per unit of fuel an existing system burns (older equipment). */
const EXISTING = {
  therms: (BTU.therm * STOCK_GAS_EFFICIENCY) / 1e6,
  propane: (BTU.propaneGal * 0.85) / 1e6,
  oil: (BTU.oilGal * 0.8) / 1e6,
};

const unitLabel: Record<SystemId, string> = {
  'heat-pump': 'kWh',
  electric: 'kWh',
  gas: 'therms',
  propane: 'gal',
  oil: 'gal',
};

export default function HeatingCost({ options, electricLabel, propaneWeek, gasLabel }: Props) {
  const [code, setCode] = useState('PA');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('state')?.toUpperCase();
    if (q && options.some((o) => o.code === q)) setCode(q);
  }, [options]);
  const state = options.find((o) => o.code === code) ?? options[0]!;

  const [basis, setBasis] = useState<Basis>(() => initial('hc-basis', 'typical') as Basis);
  const [amount, setAmount] = useState(() => initial('hc-amount', ''));
  // Optional overrides; empty means the state value.
  const [elec, setElec] = useState(() => initial('hc-elec', ''));
  const [gas, setGas] = useState(() => initial('hc-gas', ''));
  const [propane, setPropane] = useState(() => initial('hc-propane', ''));
  const [oil, setOil] = useState(() => initial('hc-oil', ''));
  const [hspf, setHspf] = useState(() => initial('hc-hspf', '7.8'));
  const [afue, setAfue] = useState(() => initial('hc-afue', '95'));

  const or = (s: string, fallback: number) => {
    const n = num(s);
    return n !== null && n > 0 ? n : fallback;
  };
  const prices: Record<SystemId, number> = {
    'heat-pump': parseRate(elec) ?? state.prices['heat-pump'],
    electric: parseRate(elec) ?? state.prices.electric,
    // Gas is entered per therm (like the bill) and stored per Mcf.
    gas: num(gas) ? num(gas)! * (BTU.mcf / BTU.therm) : state.prices.gas,
    propane: or(propane, state.prices.propane),
    oil: or(oil, state.prices.oil),
  };
  const eff = defaultEfficiencies();
  eff['heat-pump'] = or(hspf, 7.8);
  const furnace = Math.min(or(afue, 95), 100) / 100;
  eff.gas = furnace;
  eff.propane = furnace;

  const used = num(amount);
  const heat =
    basis === 'typical' ? state.heat : used !== null && used > 0 ? used * EXISTING[basis] : null;
  const custom = (id: SystemId) =>
    ({ 'heat-pump': elec, electric: elec, gas, propane, oil })[id].trim() !== '';
  const costs = heat ? compareSystems(heat, prices, eff) : [];
  // A fuel priced at the U.S. average is not called the cheapest, unless the visitor entered a price.
  const best = costs.length
    ? cheapestOf(
        costs,
        state.national.filter((id) => !custom(id)),
      )
    : undefined;
  const be = breakEvenElectricity(prices.gas, eff.gas, eff['heat-pump']);

  const priceText = (id: SystemId, price: number) =>
    id === 'heat-pump' || id === 'electric'
      ? `${cents(price)}/kWh`
      : id === 'gas'
        ? `${dollars(perTherm(price))}/therm`
        : `${dollars(price)}/gal`;
  const unitsText = (id: SystemId, units: number) =>
    `${Math.round(id === 'gas' ? units * (BTU.mcf / BTU.therm) : units).toLocaleString('en-US')} ${unitLabel[id]}`;

  return (
    <div class="tool">
      <form
        class="card"
        onSubmit={(e) => e.preventDefault()}
        onInput={() => track('tool')}
        aria-label="Your home and fuel prices"
      >
        <div class="field">
          <label for="hc-state">Your state</label>
          <select id="hc-state" value={code} onChange={(e) => setCode(e.currentTarget.value)}>
            {options.map((o) => (
              <option value={o.code}>{o.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="hc-basis">How much heat?</label>
          <select
            id="hc-basis"
            value={basis}
            onChange={(e) => setBasis(e.currentTarget.value as Basis)}
          >
            {(Object.keys(BASES) as Basis[]).map((b) => (
              <option value={b}>{BASES[b].label}</option>
            ))}
          </select>
          {basis === 'typical' ? (
            <span class="hint">
              {`The typical gas-heated ${state.name} home: about ${Math.round(state.heat)} million Btu of heat a year (EIA RECS 2020).`}
            </span>
          ) : (
            <>
              <label for="hc-amount" class="sr-only">
                {BASES[basis].label}
              </label>
              <input
                id="hc-amount"
                inputMode="decimal"
                value={amount}
                onInput={(e) => setAmount(e.currentTarget.value)}
                placeholder={`${BASES[basis].unit} used for heat in a year`}
              />
              <span class="hint">
                Add up your winter bills, or ask your supplier for last year's total.
              </span>
            </>
          )}
        </div>
        <details>
          <summary>Your prices and equipment (optional)</summary>
          <div class="field">
            <label for="hc-elec">Electricity (¢ or $ per kWh)</label>
            <input
              id="hc-elec"
              inputMode="decimal"
              value={elec}
              onInput={(e) => setElec(e.currentTarget.value)}
              placeholder={`${state.name}: ${state.prices.electric.toFixed(2)}`}
            />
          </div>
          <div class="field">
            <label for="hc-gas">Natural gas ($ per therm)</label>
            <input
              id="hc-gas"
              inputMode="decimal"
              value={gas}
              onInput={(e) => setGas(e.currentTarget.value)}
              placeholder={`${state.name}: ${perTherm(state.prices.gas).toFixed(2)}`}
            />
          </div>
          <div class="row2">
            <div class="field">
              <label for="hc-propane">Propane ($/gal)</label>
              <input
                id="hc-propane"
                inputMode="decimal"
                value={propane}
                onInput={(e) => setPropane(e.currentTarget.value)}
                placeholder={state.prices.propane.toFixed(2)}
              />
            </div>
            <div class="field">
              <label for="hc-oil">Heating oil ($/gal)</label>
              <input
                id="hc-oil"
                inputMode="decimal"
                value={oil}
                onInput={(e) => setOil(e.currentTarget.value)}
                placeholder={state.prices.oil.toFixed(2)}
              />
            </div>
          </div>
          <div class="row2">
            <div class="field">
              <label for="hc-hspf">Heat pump HSPF2</label>
              <input
                id="hc-hspf"
                inputMode="decimal"
                value={hspf}
                onInput={(e) => setHspf(e.currentTarget.value)}
              />
            </div>
            <div class="field">
              <label for="hc-afue">Furnace AFUE (%)</label>
              <input
                id="hc-afue"
                inputMode="decimal"
                value={afue}
                onInput={(e) => setAfue(e.currentTarget.value)}
              />
            </div>
          </div>
          <p class="hint">
            HSPF2 and AFUE are on the yellow EnergyGuide label. 7.8 is the ENERGY STAR minimum for a
            split heat pump; 95% is a condensing furnace (older ones are about 80%). The oil furnace
            is counted at 85%.
          </p>
        </details>
      </form>

      <section class="result" aria-live="polite">
        {!heat && <p class="error">Enter how much fuel you used for heating in a year.</p>}
        {heat && best && (
          <>
            <p class="note">{`${state.name}, ${Math.round(heat)} million Btu of heat a year`}</p>
            <p class="big">{`${best.system.name}: ${dollars(best.perYear, 0)}/yr`}</p>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>System</th>
                    <th>Price</th>
                    <th class="hide-sm">Fuel a year</th>
                    <th>Cost a year</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr>
                      <td>{c.system.name}</td>
                      <td>
                        {priceText(c.system.id, c.price)}
                        {!custom(c.system.id) && state.notes[c.system.id] && (
                          <span class="hint">{` (${state.notes[c.system.id]})`}</span>
                        )}
                      </td>
                      <td class="hide-sm">{unitsText(c.system.id, c.units)}</td>
                      <td>{dollars(c.perYear, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="verdict">
              {prices['heat-pump'] < be
                ? `At ${cents(prices['heat-pump'])} per kWh, the heat pump is cheaper to run than the gas furnace. It stays cheaper up to ${cents(be)} per kWh.`
                : `At ${cents(prices['heat-pump'])} per kWh, the gas furnace is cheaper to run than the heat pump. The heat pump would win below ${cents(be)} per kWh.`}
            </p>
            <p class="note">
              {`Prices: electricity ${electricLabel}; natural gas ${gasLabel}; propane and heating oil week of ${propaneWeek} (EIA). Running costs only: not the price of the equipment, and not fixed monthly charges for a gas connection or tank rental.`}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
