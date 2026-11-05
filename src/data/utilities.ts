// Typed access to src/data/utilities.json (refreshed by `npm run data:utilities`): residential
// electricity prices by utility from EIA Form 861M, and the share of homes on retail choice from
// EIA-861. See scripts/lib/utilities.mjs for the definitions.
import raw from './utilities.json';

export interface UtilityPrice {
  id: number;
  /** EIA's name for the utility, e.g. "Public Service Elec & Gas Co". */
  name: string;
  ownership: string;
  /** Full-service residential customers in the latest month. */
  customers: number;
  /** Revenue ÷ kWh sold in the latest month, cents/kWh. */
  price: number;
  /** The same month a year earlier, when EIA has it. */
  priceYearAgo: number | null;
  /** 12 months of revenue ÷ 12 months of kWh, when all 12 months are there. */
  price12: number | null;
}

export interface StateUtilities {
  statePrice: number | null;
  customers: number;
  /** Share of the state's residential customers served by the utilities listed. */
  shownShare: number;
  /** Share of homes buying supply from a retail supplier or community program (EIA-861). */
  choiceShare: number | null;
  utilities: UtilityPrice[];
}

export const UTILITIES = {
  source: raw.source,
  fetchedAt: raw.fetchedAt,
  period: raw.period,
  priorPeriod: raw.priorPeriod,
  choice: raw.choice,
};

const states = raw.states as Record<string, StateUtilities>;

export const stateUtilities = (code: string): StateUtilities | undefined => states[code];

/** "City of Kansas City - (KS)" → "City of Kansas City (KS)" */
export const utilityName = (name: string): string => name.replace(/ - \(([A-Z]{2})\)$/, ' ($1)');
