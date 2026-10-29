import { useState } from 'preact/hooks';

import type { HeatingOption } from '../data/heating';
import { parsePrice } from '../lib/rate';
import { cents, dollars, signedPct } from '../lib/format';
import {
  BTU,
  INSULATION,
  STOCK_GAS_EFFICIENCY,
  SYSTEMS,
  adjustHeat,
  breakEvenElectricity,
  cheapestOf,
  compareSystems,
  costAt,
  defaultEfficiencies,
  effectiveHspf,
  perTherm,
  simplePayback,
  totalCost,
  type Insulation,
  type SystemId,
} from '../lib/heating';
import { useFunnel } from './useFunnel';
import { initial, num, useStateCode } from './useStateRate';

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

/**
 * Cold-weather steps for the heat pump. HSPF2 is rated for a moderate climate; in a cold one the
 * season's efficiency is lower. We have no per-model data, so these are labelled what-if steps.
 */
const COLD = {
  rated: { label: 'As rated (moderate climate)', derate: 0 },
  cold: { label: 'Cold winters: 15% below rating', derate: 0.15 },
  severe: { label: 'Very cold winters: 30% below rating', derate: 0.3 },
} as const;
type Cold = keyof typeof COLD;

const unitLabel: Record<SystemId, string> = {
  'heat-pump': 'kWh',
  electric: 'kWh',
  gas: 'therms',
  propane: 'gal',
  oil: 'gal',
};

export default function HeatingCost({ options, electricLabel, propaneWeek, gasLabel }: Props) {
  const { code, setCode, ready } = useStateCode(options);
  const state = options.find((o) => o.code === code) ?? options[0]!;

  const [basis, setBasis] = useState<Basis>(() => initial('hc-basis', 'typical') as Basis);
  const [amount, setAmount] = useState(() => initial('hc-amount', ''));
  const [sqft, setSqft] = useState(() => initial('hc-sqft', ''));
  const [insulation, setInsulation] = useState<Insulation>(
    () => initial('hc-insulation', 'typical') as Insulation,
  );
  // Optional overrides; empty means the state value.
  const [elec, setElec] = useState(() => initial('hc-elec', ''));
  const [gas, setGas] = useState(() => initial('hc-gas', ''));
  const [propane, setPropane] = useState(() => initial('hc-propane', ''));
  const [oil, setOil] = useState(() => initial('hc-oil', ''));
  const [hspf, setHspf] = useState(() => initial('hc-hspf', '7.8'));
  const [cold, setCold] = useState<Cold>(() => initial('hc-cold', 'rated') as Cold);
  const [backup, setBackup] = useState(() => initial('hc-backup', '0'));
  const [afue, setAfue] = useState(() => initial('hc-afue', '95'));
  // Ownership (all optional).
  const [years, setYears] = useState(() => initial('hc-years', '15'));
  const [install, setInstall] = useState<Partial<Record<SystemId, string>>>({});
  const [upkeep, setUpkeep] = useState<Partial<Record<SystemId, string>>>({});
  const [gasFixed, setGasFixed] = useState(() => initial('hc-gasfixed', ''));

  const or = (s: string, fallback: number) => {
    const n = num(s);
    return n !== null && n > 0 ? n : fallback;
  };
  // Same price parsing and plausibility checks as the other calculators.
  const elecPrice = parsePrice(elec, 'cents');
  const hspfIn = num(hspf);
  const afueIn = num(afue);
  const backupIn = num(backup);
  const inputError =
    elecPrice.error ??
    (hspf.trim() !== '' && (hspfIn === null || hspfIn < 3 || hspfIn > 20)
      ? 'HSPF2 is usually between 6 and 13. Enter a value between 3 and 20.'
      : afue.trim() !== '' && (afueIn === null || afueIn < 50 || afueIn > 100)
        ? 'Enter the furnace AFUE as a percentage between 50 and 100, e.g. 95.'
        : backup.trim() !== '' && (backupIn === null || backupIn > 100)
          ? 'Backup strip heat must be 0–100% of the heat.'
          : null);
  const prices: Record<SystemId, number> = {
    'heat-pump': elecPrice.cents ?? state.prices['heat-pump'],
    electric: elecPrice.cents ?? state.prices.electric,
    // Gas is entered per therm (like the bill) and stored per Mcf.
    gas: num(gas) ? num(gas)! * (BTU.mcf / BTU.therm) : state.prices.gas,
    propane: or(propane, state.prices.propane),
    oil: or(oil, state.prices.oil),
  };
  const backupShare = Math.min(Math.max((num(backup) ?? 0) / 100, 0), 1);
  const ratedHspf = or(hspf, 7.8);
  const eff = defaultEfficiencies();
  eff['heat-pump'] = effectiveHspf(ratedHspf, COLD[cold].derate, backupShare);
  const furnace = Math.min(or(afue, 95), 100) / 100;
  eff.gas = furnace;
  eff.propane = furnace;

  const used = num(amount);
  const area = num(sqft);
  const heat =
    basis === 'typical'
      ? adjustHeat(state.heat, {
          sqft: area ?? undefined,
          typicalSqft: state.typicalSqft,
          insulation,
        })
      : used !== null && used > 0
        ? used * EXISTING[basis]
        : null;
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

  const n = Math.max(1, Math.min(40, Math.round(or(years, 15))));
  const fixedPerYear = (num(gasFixed) ?? 0) * 12;
  const owning = SYSTEMS.some((s) => num(install[s.id] ?? '') !== null);
  const ownership = (id: SystemId, running: number) =>
    totalCost(
      {
        running,
        install: num(install[id] ?? '') ?? undefined,
        maintenance: num(upkeep[id] ?? '') ?? undefined,
        fixed: id === 'gas' ? fixedPerYear : 0,
      },
      n,
    );
  const hpCost = costs.find((c) => c.system.id === 'heat-pump');
  const gasCost = costs.find((c) => c.system.id === 'gas');
  // Payback needs both quotes: a missing gas quote is not a free furnace.
  const bothQuotes = num(install['heat-pump'] ?? '') !== null && num(install.gas ?? '') !== null;
  const payback =
    hpCost && gasCost && bothQuotes
      ? simplePayback(
          (num(install['heat-pump'] ?? '') ?? 0) - (num(install.gas ?? '') ?? 0),
          gasCost.perYear +
            fixedPerYear +
            (num(upkeep.gas ?? '') ?? 0) -
            hpCost.perYear -
            (num(upkeep['heat-pump'] ?? '') ?? 0),
        )
      : undefined;

  // Sensitivity: heat pump minus gas furnace running cost when each price moves ±20%.
  const steps = [-20, 0, 20];
  const diff = (e: number, g: number) =>
    heat
      ? costAt('heat-pump', heat, prices['heat-pump'], eff['heat-pump'], e) -
        costAt('gas', heat, prices.gas, eff.gas, g)
      : 0;

  const touch = useFunnel(Boolean(heat && best && !inputError), !heat || Boolean(inputError));

  const priceText = (id: SystemId, price: number) =>
    id === 'heat-pump' || id === 'electric'
      ? `${cents(price)}/kWh`
      : id === 'gas'
        ? `${dollars(perTherm(price))}/therm`
        : `${dollars(price)}/gal`;
  const unitsText = (id: SystemId, units: number) =>
    `${Math.round(id === 'gas' ? units * (BTU.mcf / BTU.therm) : units).toLocaleString('en-US')} ${unitLabel[id]}`;

  return (
    <div class="tool" data-ready={ready ? '' : undefined}>
      <form
        class="card"
        onSubmit={(e) => e.preventDefault()}
        onInput={touch}
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
              {`The typical gas-heated ${state.name} home: about ${Math.round(state.heat)} million Btu of heat a year (EIA RECS 2020), about ${roundTo(state.typicalSqft, 50).toLocaleString('en-US')} heated sq ft.`}
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
                Add up your winter bills, or ask your supplier for last year's total. This is the
                most accurate option.
              </span>
            </>
          )}
        </div>
        {basis === 'typical' && (
          <div class="row2">
            <div class="field">
              <label for="hc-sqft">Heated area (sq ft)</label>
              <input
                id="hc-sqft"
                inputMode="numeric"
                value={sqft}
                onInput={(e) => setSqft(e.currentTarget.value)}
                placeholder="optional"
              />
            </div>
            <div class="field">
              <label for="hc-insulation">Insulation and drafts</label>
              <select
                id="hc-insulation"
                value={insulation}
                onChange={(e) => setInsulation(e.currentTarget.value as Insulation)}
              >
                {(Object.keys(INSULATION) as Insulation[]).map((k) => (
                  <option value={k}>{INSULATION[k].label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        <fieldset>
          <legend>Heat pump</legend>
          <div class="row2">
            <div class="field">
              <label for="hc-hspf">HSPF2 rating</label>
              <input
                id="hc-hspf"
                inputMode="decimal"
                value={hspf}
                onInput={(e) => setHspf(e.currentTarget.value)}
              />
            </div>
            <div class="field">
              <label for="hc-backup">Backup strip heat (% of heat)</label>
              <input
                id="hc-backup"
                inputMode="decimal"
                value={backup}
                onInput={(e) => setBackup(e.currentTarget.value)}
              />
            </div>
          </div>
          <div class="field">
            <label for="hc-cold">Cold-weather performance</label>
            <select
              id="hc-cold"
              value={cold}
              onChange={(e) => setCold(e.currentTarget.value as Cold)}
            >
              {(Object.keys(COLD) as Cold[]).map((k) => (
                <option value={k}>{COLD[k].label}</option>
              ))}
            </select>
            <span class="hint">
              HSPF2 is rated for a moderate climate. Heat pumps deliver less heat per kWh in cold
              weather, and some homes need electric backup strips on the coldest days. Cold-climate
              models hold up better. These steps are what-ifs, not measurements of your model.
            </span>
          </div>
        </fieldset>
        <details>
          <summary>Your prices and furnace (optional)</summary>
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
          <div class="field">
            <label for="hc-afue">Gas or propane furnace AFUE (%)</label>
            <input
              id="hc-afue"
              inputMode="decimal"
              value={afue}
              onInput={(e) => setAfue(e.currentTarget.value)}
            />
          </div>
          <p class="hint">
            HSPF2 and AFUE are on the yellow EnergyGuide label. 7.8 is the ENERGY STAR minimum for a
            split heat pump; 95% is a condensing furnace (older ones are about 80%). The oil furnace
            is counted at 85%.
          </p>
        </details>
        <details>
          <summary>Installation and upkeep (optional, for the long-term total)</summary>
          <p class="hint">
            Enter quotes you have. We do not guess installation prices: they vary too much by home
            and contractor.
          </p>
          <div class="field">
            <label for="hc-years">Years to compare</label>
            <input
              id="hc-years"
              inputMode="numeric"
              value={years}
              onInput={(e) => setYears(e.currentTarget.value)}
            />
          </div>
          {(['heat-pump', 'gas'] as SystemId[]).map((id) => (
            <div class="row2">
              <div class="field">
                <label for={`hc-install-${id}`}>
                  {`${SYSTEMS.find((s) => s.id === id)!.name}: install ($)`}
                </label>
                <input
                  id={`hc-install-${id}`}
                  inputMode="decimal"
                  value={install[id] ?? ''}
                  onInput={(e) => setInstall({ ...install, [id]: e.currentTarget.value })}
                />
              </div>
              <div class="field">
                <label for={`hc-upkeep-${id}`}>Upkeep ($/yr)</label>
                <input
                  id={`hc-upkeep-${id}`}
                  inputMode="decimal"
                  value={upkeep[id] ?? ''}
                  onInput={(e) => setUpkeep({ ...upkeep, [id]: e.currentTarget.value })}
                />
              </div>
            </div>
          ))}
          <div class="field">
            <label for="hc-gasfixed">Gas customer charge ($/month)</label>
            <input
              id="hc-gasfixed"
              inputMode="decimal"
              value={gasFixed}
              onInput={(e) => setGasFixed(e.currentTarget.value)}
              placeholder="saved if you drop gas entirely"
            />
          </div>
        </details>
      </form>

      <section class="result" aria-live="polite">
        {inputError && <p class="error">{inputError}</p>}
        {!inputError && !heat && (
          <p class="error">Enter how much fuel you used for heating in a year.</p>
        )}
        {!inputError && heat && best && (
          <>
            <p class="note">{`${state.name}, ${Math.round(heat)} million Btu of heat a year`}</p>
            <p class="big">{`${best.system.name}: ${dollars(best.perYear, 0)}/yr`}</p>
            <p class="note">Cheapest to run. Running costs only, before installation.</p>
            <div class="table-scroll">
              <table class="systems">
                <thead>
                  <tr>
                    <th>System</th>
                    <th>Price</th>
                    <th class="hide-sm">Fuel a year</th>
                    <th>Running a year</th>
                    {owning && <th>{`${n}-year total`}</th>}
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
                      {owning && (
                        <td>
                          {num(install[c.system.id] ?? '') !== null
                            ? dollars(ownership(c.system.id, c.perYear), 0)
                            : '–'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="verdict">
              {prices['heat-pump'] < be
                ? `At ${cents(prices['heat-pump'])} per kWh, the heat pump is cheaper to run than the gas furnace. It stays cheaper up to ${cents(be)} per kWh.`
                : `At ${cents(prices['heat-pump'])} per kWh, the gas furnace is cheaper to run than the heat pump. The heat pump would win below ${cents(be)} per kWh.`}
              {(COLD[cold].derate > 0 || backupShare > 0) &&
                ` This counts the heat pump at an effective HSPF2 of ${eff['heat-pump'].toFixed(1)} after cold weather and backup heat.`}
            </p>
            {owning && !bothQuotes && (
              <p class="note">
                Enter both the heat pump and the gas furnace quotes to see a payback period.
              </p>
            )}
            {owning && payback !== undefined && (
              <p>{`Simple payback of the heat pump over the gas furnace: about ${payback.toFixed(1)} years (no interest, rebates or price changes counted).`}</p>
            )}

            <h2 class="sub">How sure is this?</h2>
            <p class="note">
              Heat pump minus gas furnace, running cost per year, if prices move. Negative means the
              heat pump is cheaper.
            </p>
            <div class="table-scroll">
              <table class="sens">
                <caption>Rows: electricity price. Columns: gas price.</caption>
                <thead>
                  <tr>
                    <th scope="col">Electricity</th>
                    {steps.map((g) => (
                      <th scope="col">{g === 0 ? 'Gas now' : `Gas ${signedPct(g, 0)}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {steps.map((e) => (
                    <tr>
                      <th scope="row">{e === 0 ? 'Now' : signedPct(e, 0)}</th>
                      {steps.map((g) => {
                        const d = diff(e, g);
                        return (
                          <td class={d < 0 ? 'down' : 'up'}>
                            {`${d >= 0 ? '+' : ''}${dollars(d, 0)}`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="note">
              {`Prices: electricity ${electricLabel}; natural gas ${gasLabel}; propane and heating oil week of ${propaneWeek} (EIA). Not counted unless you enter them: installation, upkeep, and fixed monthly charges for a gas connection or tank rental. Heat need is ${basis === 'typical' ? 'scaled from the typical home (RECS 2020), so treat it as a rough estimate' : 'based on your own fuel use'}.`}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
