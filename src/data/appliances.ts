// Nameplate wattage ranges from the U.S. Department of Energy's "Estimating Appliance and Home
// Electronic Energy Use", as reprinted by Virginia Cooperative Extension (BSE-301NP, 2020).
// `watts` is the default we prefill: the top of the range for heating loads (most portable heaters
// are sold at their 1,500 W maximum), otherwise the middle. `dutyCycle` < 1 means the appliance
// cycles on and off; DOE: divide a refrigerator's plugged-in time by three.
export const APPLIANCE_SOURCE = {
  title:
    'Estimating Appliance and Home Electronic Energy Use (U.S. DOE, reprinted by Virginia Cooperative Extension, 2020)',
  url: 'https://spes.vt.edu/content/dam/pubs_ext_vt_edu/2901/2901-9014/BSE-301.pdf',
};

export interface Appliance {
  id: string;
  name: string;
  min: number;
  max: number;
  watts: number;
  hours: number;
  dutyCycle?: number;
  note?: string;
}

export const APPLIANCES: readonly Appliance[] = [
  { id: 'space-heater', name: 'Portable space heater', min: 750, max: 1500, watts: 1500, hours: 8 },
  {
    id: 'electric-blanket',
    name: 'Electric blanket (double)',
    min: 60,
    max: 100,
    watts: 100,
    hours: 8,
  },
  { id: 'dehumidifier', name: 'Dehumidifier', min: 785, max: 785, watts: 785, hours: 12 },
  {
    id: 'refrigerator',
    name: 'Refrigerator (older frost-free, 16 cu ft)',
    min: 725,
    max: 725,
    watts: 725,
    hours: 24,
    dutyCycle: 1 / 3,
    note: 'Runs about a third of the time (DOE). Newer models use much less: the yellow EnergyGuide label gives kWh per year.',
  },
  { id: 'clothes-dryer', name: 'Clothes dryer', min: 1800, max: 5000, watts: 3400, hours: 1 },
  { id: 'clothes-washer', name: 'Clothes washer', min: 350, max: 500, watts: 425, hours: 1 },
  {
    id: 'dishwasher',
    name: 'Dishwasher',
    min: 1200,
    max: 2400,
    watts: 1800,
    hours: 1,
    note: 'Heated drying uses much more energy (DOE).',
  },
  {
    id: 'water-heater',
    name: 'Electric water heater (40 gal)',
    min: 4500,
    max: 5500,
    watts: 5000,
    hours: 3,
    note: 'Enter the hours the elements actually heat, not the hours it is switched on.',
  },
  { id: 'microwave', name: 'Microwave oven', min: 750, max: 1100, watts: 925, hours: 0.5 },
  { id: 'toaster-oven', name: 'Toaster oven', min: 1225, max: 1225, watts: 1225, hours: 0.5 },
  { id: 'coffee-maker', name: 'Coffee maker', min: 900, max: 1200, watts: 1050, hours: 0.5 },
  { id: 'ceiling-fan', name: 'Ceiling fan', min: 65, max: 175, watts: 120, hours: 8 },
  { id: 'window-fan', name: 'Window fan', min: 55, max: 250, watts: 150, hours: 8 },
  { id: 'whole-house-fan', name: 'Whole-house fan', min: 240, max: 750, watts: 495, hours: 6 },
  { id: 'tv', name: 'Flat-screen TV', min: 120, max: 120, watts: 120, hours: 5 },
  {
    id: 'desktop',
    name: 'Desktop computer + monitor (older)',
    min: 270,
    max: 270,
    watts: 270,
    hours: 6,
    note: 'Modern computers and monitors often draw less; check the power supply label.',
  },
  { id: 'laptop', name: 'Laptop', min: 50, max: 50, watts: 50, hours: 6 },
  { id: 'hair-dryer', name: 'Hair dryer', min: 1200, max: 1875, watts: 1500, hours: 0.25 },
  { id: 'vacuum', name: 'Vacuum cleaner', min: 1000, max: 1440, watts: 1220, hours: 0.5 },
  { id: 'aquarium', name: 'Aquarium', min: 50, max: 1210, watts: 200, hours: 24 },
  { id: 'well-pump', name: 'Deep-well water pump', min: 250, max: 1100, watts: 675, hours: 2 },
];

export const applianceById = (id: string): Appliance | undefined =>
  APPLIANCES.find((a) => a.id === id);
