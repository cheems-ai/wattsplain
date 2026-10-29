import { useState } from 'preact/hooks';

import type { HeatingOption } from '../data/heating';
import { cents, dollars, kwh } from '../lib/format';
import { SYSTEMS, adjustHeat, compareSystems, type SystemId } from '../lib/heating';
import { parsePrice } from '../lib/rate';
import { ROOM_EXTRA_LOSS, blanketNights, validateZone, zoneHeating } from '../lib/zone';
import { useFunnel } from './useFunnel';
import { initial, num, useStateCode } from './useStateRate';

interface Props {
  options: HeatingOption[];
  /** e.g. "12-month average, Sep 2025 – Aug 2026" */
  electricLabel: string;
}

/** Days of the heating season (November to March). */
const SEASON_DAYS = 150;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export default function ZoneHeating({ options, electricLabel }: Props) {
  const { code, setCode, ready } = useStateCode(options);
  const state = options.find((o) => o.code === code) ?? options[0]!;

  const [system, setSystem] = useState<SystemId>(() => initial('zh-system', 'gas') as SystemId);
  const [homeSqft, setHomeSqft] = useState(() => initial('zh-home', ''));
  const [roomSqft, setRoomSqft] = useState(() => initial('zh-room', '200'));
  const [hours, setHours] = useState(() => initial('zh-hours', '8'));
  const [setback, setSetback] = useState(() => initial('zh-setback', '6'));
  const [watts, setWatts] = useState(() => initial('zh-watts', '1500'));
  const [yearly, setYearly] = useState(() => initial('zh-yearly', ''));
  const [elec, setElec] = useState(() => initial('zh-elec', ''));
  const [share, setShare] = useState(() => initial('zh-share', ''));
  const [nightSetback, setNightSetback] = useState(() => initial('zh-night', '6'));

  const elecPrice = parsePrice(elec, 'cents');
  const price = elecPrice.cents ?? state.prices.electric;
  const typicalSqft = roundTo(state.typicalSqft, 50);
  const home = num(homeSqft) ?? typicalSqft;
  // The typical home's heat, scaled to the visitor's floor area; or, from their own yearly cost,
  // the heat that cost buys with their system.
  const typicalHeat = adjustHeat(state.heat, {
    sqft: home,
    typicalSqft: state.typicalSqft,
    insulation: 'typical',
  });
  const prices = { ...state.prices, 'heat-pump': price, electric: price };
  const cost = compareSystems(typicalHeat, prices).find((c) => c.system.id === system)!;
  const own = num(yearly);
  const homeCost = own !== null && own > 0 ? own : cost.perYear;
  const homeHeat = own !== null && own > 0 ? own / cost.perMmbtu : typicalHeat;
  const shareIn = share.trim() === '' ? undefined : num(share);
  const input = {
    homeHeat,
    homeSqft: home,
    homeCost,
    roomSqft: num(roomSqft) ?? 0,
    hoursPerDay: num(hours) ?? 0,
    setbackF: num(setback) ?? -1,
    centsPerKwh: price,
    heaterWatts: num(watts) ?? 0,
    seasonDays: SEASON_DAYS,
    savingShare: shareIn === undefined ? undefined : shareIn === null ? -1 : shareIn / 100,
  };
  const error = elecPrice.error ?? validateZone(input);
  const r = error ? undefined : zoneHeating(input);
  const nightF = num(nightSetback);
  const blanket =
    !error && nightF !== null && nightF <= 20
      ? blanketNights({
          homeCost,
          setbackF: nightF,
          hours: 8,
          watts: 100,
          nights: SEASON_DAYS,
          centsPerKwh: price,
        })
      : undefined;
  const touch = useFunnel(Boolean(r), Boolean(error));
  const systemName = SYSTEMS.find((s) => s.id === system)!.name.toLowerCase();

  return (
    <div class="tool" data-ready={ready ? '' : undefined}>
      <form
        class="card"
        onSubmit={(e) => e.preventDefault()}
        onInput={touch}
        aria-label="Your home, the room and the heater"
      >
        <div class="row2">
          <div class="field">
            <label for="zh-state">Your state</label>
            <select id="zh-state" value={code} onChange={(e) => setCode(e.currentTarget.value)}>
              {options.map((o) => (
                <option value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="zh-system">Your central heat</label>
            <select
              id="zh-system"
              value={system}
              onChange={(e) => setSystem(e.currentTarget.value as SystemId)}
            >
              {SYSTEMS.map((s) => (
                <option value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label for="zh-home">Heated area of the home (sq ft)</label>
            <input
              id="zh-home"
              inputMode="numeric"
              value={homeSqft}
              onInput={(e) => setHomeSqft(e.currentTarget.value)}
              placeholder={`typical: ${typicalSqft.toLocaleString('en-US')}`}
            />
          </div>
          <div class="field">
            <label for="zh-room">The room you heat (sq ft)</label>
            <input
              id="zh-room"
              inputMode="numeric"
              value={roomSqft}
              onInput={(e) => setRoomSqft(e.currentTarget.value)}
            />
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label for="zh-hours">Hours a day in that room</label>
            <input
              id="zh-hours"
              inputMode="decimal"
              value={hours}
              onInput={(e) => setHours(e.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label for="zh-setback">Rest of the home turned down by (°F)</label>
            <input
              id="zh-setback"
              inputMode="decimal"
              value={setback}
              onInput={(e) => setSetback(e.currentTarget.value)}
            />
          </div>
        </div>
        <div class="field">
          <label for="zh-watts">Space heater (watts)</label>
          <input
            id="zh-watts"
            inputMode="numeric"
            value={watts}
            onInput={(e) => setWatts(e.currentTarget.value)}
          />
          <span class="hint">Most plug-in heaters are 1,500 W on high and 750 W on low.</span>
        </div>
        <details>
          <summary>Your own numbers (optional)</summary>
          <div class="field">
            <label for="zh-yearly">What your central heat costs a year ($)</label>
            <input
              id="zh-yearly"
              inputMode="decimal"
              value={yearly}
              onInput={(e) => setYearly(e.currentTarget.value)}
              placeholder={`typical home: ${dollars(cost.perYear, 0)}`}
            />
            <span class="hint">
              Add up last winter's heating bills. This replaces the typical home in your state.
            </span>
          </div>
          <div class="field">
            <label for="zh-elec">Electricity (¢ or $ per kWh)</label>
            <input
              id="zh-elec"
              inputMode="decimal"
              value={elec}
              onInput={(e) => setElec(e.currentTarget.value)}
              placeholder={`${state.name}: ${state.prices.electric.toFixed(2)} (${electricLabel})`}
            />
          </div>
          <div class="field">
            <label for="zh-share">Share of your heating cost the turn-down saves (%)</label>
            <input
              id="zh-share"
              inputMode="decimal"
              value={share}
              onInput={(e) => setShare(e.currentTarget.value)}
              placeholder="DOE rule of thumb"
            />
          </div>
        </details>
      </form>

      <section class="result" aria-live="polite">
        {error && <p class="error">{error}</p>}
        {r && (
          <>
            <p class="note">{`${state.name}, ${systemName}, ${home.toLocaleString('en-US')} sq ft home`}</p>
            <p class="big">
              {r.net < 0
                ? `The space heater saves about ${dollars(-r.net, 0)} a winter`
                : `The space heater costs about ${dollars(r.net, 0)} more a winter`}
            </p>
            <table class="breakdown">
              <tbody>
                <tr>
                  <th scope="row">Central heat saved</th>
                  <td>{`${dollars(r.homeSaving, 0)} (${(r.savingShare * 100).toFixed(0)}% of ${dollars(homeCost, 0)} a year)`}</td>
                </tr>
                <tr>
                  <th scope="row">Space heater</th>
                  <td>{`${dollars(r.heaterCost, 0)} (${kwh(r.heaterKwh)} at ${cents(price)})`}</td>
                </tr>
              </tbody>
            </table>
            {r.undersized && (
              <p class="error">
                {`On the coldest days this room needs about ${roundTo(r.averageWatts * 2, 50).toLocaleString('en-US')} W of heat, more than a ${num(watts)!.toLocaleString('en-US')} W heater gives. Expect the room to run cool, or use a smaller room.`}
              </p>
            )}
            {system === 'heat-pump' && (
              <p class="note">
                A heat pump makes 2 to 3 units of heat per unit of electricity; a space heater makes
                one, so it rarely saves money next to a heat pump. Big turn-downs can also bring on
                a heat pump's backup strips when it warms up again.
              </p>
            )}
            <h3>At night: an electric blanket instead</h3>
            <div class="field">
              <label for="zh-night">Turn the home down at night by (°F, 8 hours)</label>
              <input
                id="zh-night"
                inputMode="decimal"
                value={nightSetback}
                onInput={(e) => setNightSetback(e.currentTarget.value)}
              />
            </div>
            {!blanket && <p class="error">Turn the home down by 0–20°F.</p>}
            {blanket && (
              <p>
                {`A 100 W blanket on all night for ${SEASON_DAYS} nights costs ${dollars(blanket.cost, 0)}; the night turn-down saves ${dollars(blanket.homeSaving, 0)} of central heat. `}
                <strong>
                  {blanket.net < 0
                    ? `Net: about ${dollars(-blanket.net, 0)} saved a winter.`
                    : `Net: about ${dollars(blanket.net, 0)} more a winter.`}
                </strong>
              </p>
            )}
            <p class="note">
              {`Estimates for planning. The room's heat is its share of the home's floor area and hours, plus ${ROOM_EXTRA_LOSS * 100}% for heat lost to the cooler rooms around it.`}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
