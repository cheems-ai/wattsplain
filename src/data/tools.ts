// The site's tools, grouped by the three jobs a visitor comes with. Used by the home page and the
// /tools/ hub so both list the same thing.
export interface Tool {
  href: string;
  title: string;
  text: string;
}

export interface ToolGroup {
  id: 'bill' | 'cost' | 'save';
  title: string;
  intro: string;
  tools: Tool[];
}

export const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    id: 'bill',
    title: 'Understand my bill',
    intro: 'Why it went up, and how your price compares with your state.',
    tools: [
      {
        href: '/tools/why-is-my-electric-bill-high/',
        title: 'Bill checker',
        text: 'Two bills in, the change split into usage, price per kWh, fixed charges, taxes and billing days.',
      },
      {
        href: '/tools/electric-bill-diagnosis/',
        title: 'Bill diagnosis',
        text: 'Four short questions; possible causes sorted by evidence, with how to check each.',
      },
    ],
  },
  {
    id: 'cost',
    title: 'Calculate energy cost',
    intro: 'What one appliance or your heating costs at your state’s price.',
    tools: [
      {
        href: '/tools/appliance-electricity-cost/',
        title: 'Appliance cost',
        text: 'Watts, hours, running share and season, or the EnergyGuide kWh figure.',
      },
      {
        href: '/tools/space-heater-cost/',
        title: 'Space heater cost',
        text: 'Per hour, day and month for a 750 W or 1,500 W heater.',
      },
      {
        href: '/tools/heating-cost-calculator/',
        title: 'Heating cost: heat pump vs gas',
        text: 'Heat pump, gas, propane, oil or electric heat, with cold-weather what-ifs.',
      },
    ],
  },
  {
    id: 'save',
    title: 'Compare & save',
    intro: 'Try changes side by side before you spend money.',
    tools: [
      {
        href: '/tools/home-energy-savings-planner/',
        title: 'Home energy savings planner',
        text: 'Up to four scenarios: fewer hours, another appliance, another price or a heat pump.',
      },
    ],
  },
];
