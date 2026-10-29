import { useState } from 'preact/hooks';

import { cents } from '../lib/format';
import {
  DEFAULT_RATE_INPUT,
  RATE_MODES,
  type RateInput,
  type RateMode,
  type ResolvedRate,
} from '../lib/rate';
import { initial } from './useStateRate';

/** Rate-basis state for a calculator; `prefix` keeps field ids unique on the page. */
export function useRateInput(prefix: string, start: Partial<RateInput> = {}) {
  const [input, setInput] = useState<RateInput>(() => {
    const base = { ...DEFAULT_RATE_INPUT, ...start };
    // Keep anything typed before the island hydrated (see `initial`).
    const keys = [
      'custom',
      'billTotal',
      'billKwh',
      'billFixed',
      'peak',
      'offPeak',
      'peakShare',
    ] as const;
    for (const k of keys) base[k] = initial(`${prefix}-${k}`, base[k]);
    base.mode = initial(`${prefix}-mode`, base.mode) as RateMode;
    return base;
  });
  const set = (patch: Partial<RateInput>) => setInput((prev) => ({ ...prev, ...patch }));
  return { input, set };
}

interface Props {
  prefix: string;
  input: RateInput;
  set: (patch: Partial<RateInput>) => void;
  resolved: ResolvedRate;
  /** The selected state's average, shown in the state option. */
  stateName: string;
  statePrice: number;
}

/**
 * Lets the visitor choose which electricity price to use: the EIA state average, their own price,
 * one worked out from a bill (fixed charges removed), or a time-of-use blend.
 */
export function RateField({ prefix, input, set, resolved, stateName, statePrice }: Props) {
  const id = (k: string) => `${prefix}-${k}`;
  const unit = input.unit === 'cents' ? '¢/kWh' : '$/kWh';
  const unitToggle = (
    <div class="segmented" role="group" aria-label="Price unit">
      {(['cents', 'dollars'] as const).map((u) => (
        <button type="button" aria-pressed={input.unit === u} onClick={() => set({ unit: u })}>
          {u === 'cents' ? '¢ per kWh' : '$ per kWh'}
        </button>
      ))}
    </div>
  );
  return (
    <fieldset class="rate-field">
      <legend>Electricity price</legend>
      <div class="field">
        <label for={id('mode')}>Price to use</label>
        <select
          id={id('mode')}
          value={input.mode}
          onChange={(e) => set({ mode: e.currentTarget.value as RateMode })}
        >
          {RATE_MODES.map((m) => (
            <option value={m.id}>
              {m.id === 'state' ? `${stateName} average: ${cents(statePrice)}` : m.label}
            </option>
          ))}
        </select>
        {input.mode === 'state' && (
          <span class="hint">
            EIA's average: total bills ÷ kWh, so fixed charges are spread over every kWh. The price
            of an extra kWh on your plan can differ.
          </span>
        )}
      </div>

      {input.mode === 'custom' && (
        <div class="field">
          <label for={id('custom')}>Your price ({unit})</label>
          {unitToggle}
          <input
            id={id('custom')}
            inputMode="decimal"
            autoComplete="off"
            value={input.custom}
            onInput={(e) => set({ custom: e.currentTarget.value })}
            placeholder={input.unit === 'cents' ? 'e.g. 18.5' : 'e.g. 0.185'}
            aria-invalid={resolved.error ? true : undefined}
            aria-describedby={id('msg')}
          />
        </div>
      )}

      {input.mode === 'bill' && (
        <>
          <div class="row2">
            <div class="field">
              <label for={id('billTotal')}>Bill total ($)</label>
              <input
                id={id('billTotal')}
                inputMode="decimal"
                value={input.billTotal}
                onInput={(e) => set({ billTotal: e.currentTarget.value })}
                placeholder="e.g. 152.40"
              />
            </div>
            <div class="field">
              <label for={id('billKwh')}>kWh on that bill</label>
              <input
                id={id('billKwh')}
                inputMode="decimal"
                value={input.billKwh}
                onInput={(e) => set({ billKwh: e.currentTarget.value })}
                placeholder="e.g. 900"
              />
            </div>
          </div>
          <div class="field">
            <label for={id('billFixed')}>Fixed monthly charges ($, optional)</label>
            <input
              id={id('billFixed')}
              inputMode="decimal"
              value={input.billFixed}
              onInput={(e) => set({ billFixed: e.currentTarget.value })}
              placeholder="customer or service charge, e.g. 12.00"
              aria-describedby={id('msg')}
            />
            <span class="hint">
              The charge you pay even at 0 kWh. We work out (total − fixed) ÷ kWh.
            </span>
          </div>
        </>
      )}

      {input.mode === 'tou' && (
        <>
          {unitToggle}
          <div class="row2">
            <div class="field">
              <label for={id('peak')}>Peak price ({unit})</label>
              <input
                id={id('peak')}
                inputMode="decimal"
                value={input.peak}
                onInput={(e) => set({ peak: e.currentTarget.value })}
              />
            </div>
            <div class="field">
              <label for={id('offPeak')}>Off-peak price ({unit})</label>
              <input
                id={id('offPeak')}
                inputMode="decimal"
                value={input.offPeak}
                onInput={(e) => set({ offPeak: e.currentTarget.value })}
              />
            </div>
          </div>
          <div class="field">
            <label for={id('peakShare')}>Share of this use in peak hours (%)</label>
            <input
              id={id('peakShare')}
              inputMode="numeric"
              value={input.peakShare}
              onInput={(e) => set({ peakShare: e.currentTarget.value })}
              aria-describedby={id('msg')}
            />
            <span class="hint">
              Your plan's peak hours are on the bill or the utility's rate page. Shift use out of
              them and this share falls.
            </span>
          </div>
        </>
      )}

      <p id={id('msg')} class={resolved.error ? 'error' : 'hint'} aria-live="polite">
        {resolved.error ??
          (resolved.cents !== null && input.mode !== 'state'
            ? `Using ${cents(resolved.cents)} per kWh. ${resolved.note ?? ''}`.trim()
            : '')}
      </p>
    </fieldset>
  );
}
