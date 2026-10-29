// Electric bill diagnosis: turns two bills (optional) and a few answers into possible causes,
// each labelled by how strong the evidence is. Bill arithmetic can *show* that usage, the
// period length, the price per kWh, fixed charges, taxes or credits changed; answers can only
// make a cause *likely*. Nothing here is a confirmed cause, and the wording says so.
import { analyzeBills, type BillAnalysis, type BillDetail } from './energy';

export type Evidence = 'numbers' | 'likely' | 'check';

export type Change = 'space-heater' | 'new-appliance' | 'more-home' | 'ev' | 'pool' | 'guests';

export interface DiagnosisInput {
  bills?: { prev: BillDetail; now: BillDetail } | undefined;
  /** Which earlier bill: same month last year, the previous month, or another. */
  compare: 'last-year' | 'last-month' | 'other';
  weather: 'colder' | 'hotter' | 'similar' | 'unsure';
  electricHeat: boolean;
  electricCooling: boolean;
  changes: readonly Change[];
  estimated: 'yes' | 'no' | 'unsure';
  planChange: 'yes' | 'no' | 'unsure';
  /** The state's average price change over the last year, percent (EIA). */
  stateChangePct: number;
  stateName: string;
}

export interface Cause {
  id: string;
  title: string;
  evidence: Evidence;
  /** What supports it, in plain words. */
  why: string;
  /** What the visitor can do to confirm or rule it out. */
  check: string;
  link?: { href: string; label: string };
  /** Dollars of the change it explains, when the bill numbers show it. */
  amount?: number;
}

const CHANGE_TEXT: Record<Change, [string, string]> = {
  'space-heater': ['A space heater', 'A 1,500 W heater running 8 hours a day uses 12 kWh a day.'],
  'new-appliance': [
    'A new or extra appliance',
    'A second fridge, freezer, dehumidifier or hot tub runs every day.',
  ],
  'more-home': [
    'More time at home',
    'Working or studying from home adds heating, cooling, lighting and electronics in the day.',
  ],
  ev: [
    'An electric car charging at home',
    'Charging at home adds the car’s kWh to the house bill.',
  ],
  pool: ['A pool pump or hot tub', 'Pumps and heaters run for hours every day in season.'],
  guests: [
    'More people in the home',
    'More showers, laundry and cooking, especially with an electric water heater.',
  ],
};

const $ = (n: number) =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface Diagnosis {
  analysis?: BillAnalysis | undefined;
  /** Bill numbers were entered but are not usable. */
  billError?: string | undefined;
  causes: Cause[];
}

export function diagnose(input: DiagnosisInput): Diagnosis {
  const causes: Cause[] = [];
  let analysis: BillAnalysis | undefined;
  let billError: string | undefined;
  if (input.bills) {
    try {
      analysis = analyzeBills(input.bills.prev, input.bills.now);
    } catch (e) {
      billError = (e as Error).message;
    }
  }
  const part = (id: string) => analysis?.parts.find((p) => p.id === id)?.amount ?? 0;
  const usageUp = part('usage') + part('daily-use');
  const meaningful = (x: number) => x >= Math.max(2, Math.abs(analysis?.change ?? 0) * 0.15);

  // --- What the bill numbers show -----------------------------------------------------------
  if (analysis) {
    const b = input.bills!;
    if (meaningful(usageUp))
      causes.push({
        id: 'usage',
        title: 'You used more electricity',
        evidence: 'numbers',
        amount: usageUp,
        why:
          analysis.dailyPrev !== undefined
            ? `Daily use went from ${analysis.dailyPrev.toFixed(1)} to ${analysis.dailyNow!.toFixed(1)} kWh a day, adding about ${$(usageUp)}.`
            : `${Math.round(b.now.kwh - b.prev.kwh).toLocaleString('en-US')} kWh more than the earlier bill, about ${$(usageUp)}.`,
        check:
          'Read the meter on two mornings in a row to see your daily use now; switch suspect appliances off for a day and compare.',
        link: { href: '/tools/appliance-electricity-cost/', label: 'What an appliance costs' },
      });
    if (meaningful(part('days')))
      causes.push({
        id: 'days',
        title: 'The billing period was longer',
        evidence: 'numbers',
        amount: part('days'),
        why: `${b.now.days} days instead of ${b.prev.days}: about ${$(part('days'))} of the change, with no change in daily use.`,
        check: 'Compare the service dates printed on both bills. The next bill is often shorter.',
      });
    if (meaningful(part('price')))
      causes.push({
        id: 'price',
        title: 'Each kWh cost more',
        evidence: 'numbers',
        amount: part('price'),
        why: `Energy charges per kWh went from ${analysis.energyPrev.toFixed(2)}¢ to ${analysis.energyNow.toFixed(2)}¢. ${
          input.stateChangePct > 0
            ? `${input.stateName}'s average price is up ${input.stateChangePct.toFixed(1)}% on a year earlier (EIA), so a rate increase is plausible.`
            : `${input.stateName}'s average price is not up on a year earlier (EIA), so look at your own plan first.`
        }${meaningful(usageUp) ? ' With higher use, tiered rates can also raise the price of the extra kWh.' : ''}`,
        check:
          'Compare the supply and delivery rate lines on the two bills, and any fuel or power cost adjustment line.',
      });
    if (meaningful(part('fixed')))
      causes.push({
        id: 'fixed',
        title: 'Fixed charges went up',
        evidence: 'numbers',
        amount: part('fixed'),
        why: `The fixed lines rose by ${$(part('fixed'))}; they are paid whatever you use.`,
        check:
          'Look for a new customer, service or connection charge in the bill details or the utility’s rate notice.',
      });
    if (meaningful(part('taxes')))
      causes.push({
        id: 'taxes',
        title: 'Taxes, fees or surcharges went up',
        evidence: 'numbers',
        amount: part('taxes'),
        why: `Taxes and fees rose by ${$(part('taxes'))}.`,
        check:
          'Some are a percentage of the bill and rise with it; others are new riders listed separately.',
      });
    if (meaningful(part('credits')))
      causes.push({
        id: 'credits',
        title: 'A credit or discount ended or shrank',
        evidence: 'numbers',
        amount: part('credits'),
        why: `Credits were ${$(part('credits'))} smaller on the latest bill.`,
        check:
          'Check whether a promotion, budget-billing true-up, solar credit or assistance program ended.',
      });
  }

  // --- What the answers make likely ----------------------------------------------------------
  const seasonal =
    input.compare !== 'last-year' &&
    ((input.weather === 'colder' && input.electricHeat) ||
      (input.weather === 'hotter' && input.electricCooling));
  if (seasonal)
    causes.push({
      id: 'season',
      title:
        input.weather === 'colder'
          ? 'Colder weather and electric heating'
          : 'Hotter weather and air conditioning',
      evidence: analysis && meaningful(usageUp) ? 'likely' : 'check',
      why: `You compared with ${input.compare === 'last-month' ? 'the previous month' : 'a different season'} and the weather was ${input.weather}. Heating and cooling are the biggest loads in most homes.`,
      check:
        'Compare with the same month last year instead: most bills print a 12-month usage chart.',
      link: { href: '/tools/heating-cost-calculator/', label: 'Heating cost calculator' },
    });
  else if (input.compare === 'last-month' && input.weather === 'unsure')
    causes.push({
      id: 'season-check',
      title: 'A change of season',
      evidence: 'check',
      why: 'Month-to-month bills often differ because of the season alone.',
      check: 'Compare with the same month last year instead.',
    });

  for (const c of input.changes) {
    const [title, why] = CHANGE_TEXT[c];
    causes.push({
      id: c,
      title,
      evidence: analysis ? (meaningful(usageUp) ? 'likely' : 'check') : 'likely',
      why: `${why}${analysis && !meaningful(usageUp) ? ' Your kWh did not rise much, though.' : ''}`,
      check: 'Work out what it uses with its watts and hours.',
      link: {
        href: `/tools/appliance-electricity-cost/${c === 'space-heater' ? '?appliance=space-heater' : ''}`,
        label: 'Appliance cost calculator',
      },
    });
  }

  if (input.estimated !== 'no')
    causes.push({
      id: 'estimated',
      title: 'An estimated meter reading',
      evidence: input.estimated === 'yes' ? 'likely' : 'check',
      why:
        input.estimated === 'yes'
          ? 'The bill says the reading was estimated; the next actual reading corrects any over- or under-estimate.'
          : 'Look for "estimated" or "E" next to the meter reading.',
      check: 'Read the meter yourself and compare it with the reading on the bill.',
    });

  if (input.planChange !== 'no')
    causes.push({
      id: 'plan',
      title: 'A plan, supplier or promotion change',
      evidence: input.planChange === 'yes' ? 'likely' : 'check',
      why:
        input.planChange === 'yes'
          ? 'A new plan or supplier, or the end of a fixed-price period, changes the price per kWh.'
          : 'Fixed-price contracts and introductory rates often end without much notice.',
      check: 'Check the supplier name and the rate on both bills, and any renewal letter.',
    });

  const order: Record<Evidence, number> = { numbers: 0, likely: 1, check: 2 };
  causes.sort((a, b) => order[a.evidence] - order[b.evidence] || (b.amount ?? 0) - (a.amount ?? 0));
  return { analysis, billError, causes };
}
