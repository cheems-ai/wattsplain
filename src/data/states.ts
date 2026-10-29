// The 50 states plus the District of Columbia, with the census division EIA groups them under.
// `name` must match the row labels in the EIA tables (scripts/lib/eia.mjs).
export interface State {
  code: string;
  name: string;
  slug: string;
  division: string;
}

const rows: [string, string, string][] = [
  ['CT', 'Connecticut', 'New England'],
  ['ME', 'Maine', 'New England'],
  ['MA', 'Massachusetts', 'New England'],
  ['NH', 'New Hampshire', 'New England'],
  ['RI', 'Rhode Island', 'New England'],
  ['VT', 'Vermont', 'New England'],
  ['NJ', 'New Jersey', 'Middle Atlantic'],
  ['NY', 'New York', 'Middle Atlantic'],
  ['PA', 'Pennsylvania', 'Middle Atlantic'],
  ['IL', 'Illinois', 'East North Central'],
  ['IN', 'Indiana', 'East North Central'],
  ['MI', 'Michigan', 'East North Central'],
  ['OH', 'Ohio', 'East North Central'],
  ['WI', 'Wisconsin', 'East North Central'],
  ['IA', 'Iowa', 'West North Central'],
  ['KS', 'Kansas', 'West North Central'],
  ['MN', 'Minnesota', 'West North Central'],
  ['MO', 'Missouri', 'West North Central'],
  ['NE', 'Nebraska', 'West North Central'],
  ['ND', 'North Dakota', 'West North Central'],
  ['SD', 'South Dakota', 'West North Central'],
  ['DE', 'Delaware', 'South Atlantic'],
  ['DC', 'District of Columbia', 'South Atlantic'],
  ['FL', 'Florida', 'South Atlantic'],
  ['GA', 'Georgia', 'South Atlantic'],
  ['MD', 'Maryland', 'South Atlantic'],
  ['NC', 'North Carolina', 'South Atlantic'],
  ['SC', 'South Carolina', 'South Atlantic'],
  ['VA', 'Virginia', 'South Atlantic'],
  ['WV', 'West Virginia', 'South Atlantic'],
  ['AL', 'Alabama', 'East South Central'],
  ['KY', 'Kentucky', 'East South Central'],
  ['MS', 'Mississippi', 'East South Central'],
  ['TN', 'Tennessee', 'East South Central'],
  ['AR', 'Arkansas', 'West South Central'],
  ['LA', 'Louisiana', 'West South Central'],
  ['OK', 'Oklahoma', 'West South Central'],
  ['TX', 'Texas', 'West South Central'],
  ['AZ', 'Arizona', 'Mountain'],
  ['CO', 'Colorado', 'Mountain'],
  ['ID', 'Idaho', 'Mountain'],
  ['MT', 'Montana', 'Mountain'],
  ['NV', 'Nevada', 'Mountain'],
  ['NM', 'New Mexico', 'Mountain'],
  ['UT', 'Utah', 'Mountain'],
  ['WY', 'Wyoming', 'Mountain'],
  ['CA', 'California', 'Pacific'],
  ['OR', 'Oregon', 'Pacific'],
  ['WA', 'Washington', 'Pacific'],
  ['AK', 'Alaska', 'Pacific'],
  ['HI', 'Hawaii', 'Pacific'],
];

export const STATES: readonly State[] = rows.map(([code, name, division]) => ({
  code,
  name,
  division,
  slug: name.toLowerCase().replace(/ /g, '-'),
}));

export const stateByCode = (code: string): State | undefined => STATES.find((s) => s.code === code);
