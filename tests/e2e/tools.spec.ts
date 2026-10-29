import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

// Expected values come from the data the site was built with, so the tests keep passing when the
// daily job brings in a new EIA month (or new weekly heating fuel prices).
const data = JSON.parse(
  readFileSync(new URL('../../src/data/electricity.json', import.meta.url), 'utf8'),
) as {
  states: { code: string; price: number; pricePrior: number }[];
  history: { periods: string[] };
};
const price = (code: string) => data.states.find((s) => s.code === code)!;
const cents = (n: number) => `${n.toFixed(2)}¢`;
const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (p: string) =>
  new Date(`${p}-01T00:00:00Z`).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

test('bill checker splits a bill increase into price and usage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tools/why-is-my-electric-bill-high/?state=PA');
  await expect(page.getByLabel('Your state')).toHaveValue('PA');
  await page.locator('#bc-pk').fill('800');
  await page.locator('#bc-pd').fill('140');
  await page.locator('#bc-nk').fill('950');
  await page.locator('#bc-nd').fill('200');
  const result = page.locator('.result');
  await expect(result).toContainText('+$60.00 (+42.9%)');
  await expect(result.locator('tr', { hasText: 'Energy price per kWh' })).toContainText('+$31.09');
  await expect(result.locator('tr', { hasText: 'Using more or fewer kWh' })).toContainText(
    '+$28.91',
  );
  await expect(result).toContainText(
    `Pennsylvania: the average residential price was ${cents(price('PA').price)}`,
  );
  expect(errors).toEqual([]);
});

test('bill checker rejects zero kWh', async ({ page }) => {
  await page.goto('/tools/why-is-my-electric-bill-high/');
  await page.locator('#bc-pk').fill('0');
  await page.locator('#bc-pd').fill('10');
  await page.locator('#bc-nk').fill('500');
  await page.locator('#bc-nd').fill('90');
  await expect(page.locator('.result')).toContainText('kWh must be more than 0');
});

test('appliance calculator uses the state price and a custom rate', async ({ page }) => {
  await page.goto('/tools/appliance-electricity-cost/?state=HI');
  await page.getByLabel('Appliance', { exact: true }).selectOption('space-heater');
  await page.getByLabel('Hours per day').fill('8');
  // 1,500 W × 8 h × 30 days = 360 kWh at the Hawaii price
  await expect(page.locator('.result .big')).toHaveText(
    `${money((360 * price('HI').price) / 100)} / month`,
  );
  await page.getByLabel('Price to use').selectOption('custom');
  await page.locator('#ac-rate-custom').fill('10');
  await expect(page.locator('.result .big')).toHaveText('$36.00 / month');
  // A bill price in dollars typed in cents mode is read as dollars, and the page says so.
  await page.locator('#ac-rate-custom').fill('0.10');
  await expect(page.locator('.result .big')).toHaveText('$36.00 / month');
  await expect(page.locator('#ac-rate-msg')).toContainText('Read as $0.1 per kWh');
});

test('space heater page offers wattage presets', async ({ page }) => {
  await page.goto('/tools/space-heater-cost/?state=TX');
  // A button does nothing until the island hydrates (inputs keep what was typed; clicks are lost),
  // which on production can come after the load event.
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.getByRole('button', { name: '750 W' }).click();
  await expect(page.getByRole('button', { name: '750 W' })).toHaveAttribute('aria-pressed', 'true');
  // 750 W × 8 h × 30 = 180 kWh at the Texas price
  await expect(page.locator('.result .big')).toHaveText(
    `${money((180 * price('TX').price) / 100)} / month`,
  );
});

test('state page shows its own numbers and links the tools with the state', async ({ page }) => {
  await page.goto('/electricity-rates/pennsylvania/');
  await expect(page.locator('h1')).toHaveText('Pennsylvania electricity rates and average bill');
  await expect(page.locator('.lede')).toContainText(`${cents(price('PA').price)} per kWh`);
  await expect(page.locator('.lede')).toContainText(
    `a year earlier (${cents(price('PA').pricePrior)}).`,
  );
  await expect(page.getByRole('link', { name: /Enter two of your bills/ })).toHaveAttribute(
    'href',
    '/tools/why-is-my-electric-bill-high/?state=PA',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://wattsplain.com/electricity-rates/pennsylvania/',
  );
});

test('pages fit the screen without horizontal scrolling', async ({ page }) => {
  for (const path of [
    '/',
    '/electricity-rates/pennsylvania/',
    '/tools/why-is-my-electric-bill-high/',
    '/tools/heating-cost-calculator/',
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('state page shows the 24-month trend with a hover tooltip and a data table', async ({
  page,
}, info) => {
  await page.goto('/electricity-rates/pennsylvania/');
  const chart = page.locator('.trend');
  const { periods } = data.history;
  await expect(chart.locator('figcaption')).toContainText(
    `${monthLabel(periods[0]!)} – ${monthLabel(periods.at(-1)!)}`,
  );
  await expect(chart.locator('svg:visible path.line')).toHaveCount(2);
  const year = periods.at(-1)!.slice(0, 4);
  const months = periods.filter((p) => p.startsWith(year)).length;
  await expect(page.locator('main')).toContainText(
    `So far in ${year} (${months} months), Pennsylvania has averaged`,
  );
  await expect(
    page.locator('h2', { hasText: 'Why is my electric bill so high in Pennsylvania?' }),
  ).toBeVisible();
  await chart.locator('summary').click();
  await expect(chart.locator('tbody tr')).toHaveCount(24);
  if (info.project.name === 'desktop') {
    const box = (await chart.locator('svg:visible').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const tip = chart.locator('.trend-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Pennsylvania');
    await expect(tip).toContainText('U.S. average');
  }
});

test('state page tables fit a phone screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout only');
  await page.goto('/electricity-rates/pennsylvania/');
  for (const scroller of await page.locator('main > .table-scroll').all()) {
    const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test('sends a cookieless page view and one tool event, with no visitor details', async ({
  page,
  context,
}) => {
  const events: Record<string, unknown>[] = [];
  await page.route('**/api/e', async (route) => {
    events.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ status: 204 });
  });
  await page.goto('/tools/why-is-my-electric-bill-high/?state=PA');
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toEqual({
    e: 'view',
    p: '/tools/why-is-my-electric-bill-high/',
    s: 'direct',
    a: 1,
  });
  await page.locator('#bc-pk').fill('800');
  await page.locator('#bc-pd').fill('140');
  await page.locator('#bc-nk').fill('950');
  await page.locator('#bc-nd').fill('200');
  await page.locator('#bc-nd').fill('210');
  await expect.poll(() => events.filter((x) => x['e'] === 'tool').length).toBe(1);
  await page.waitForTimeout(300);
  expect(events.filter((x) => x['e'] === 'tool')).toHaveLength(1);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('keeps what the visitor typed before the calculator finished loading', async ({ page }) => {
  // Hold the island scripts back, type into the server-rendered inputs, then let them load.
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/_astro/*.js', async (route) => {
    await gate;
    await route.continue();
  });
  // Module scripts hold back DOMContentLoaded, so wait only for the server-rendered input.
  await page.goto('/tools/why-is-my-electric-bill-high/?state=PA', { waitUntil: 'commit' });
  await page.locator('#bc-pk').waitFor();
  await page.locator('#bc-pk').fill('800');
  await page.locator('#bc-pd').fill('140');
  await page.locator('#bc-nk').fill('950');
  await page.locator('#bc-nd').fill('200');
  release();
  await expect(page.locator('.result')).toContainText('+$60.00 (+42.9%)');
  await expect(page.locator('#bc-nd')).toHaveValue('200');
});

test('heating calculator compares systems for your own fuel use and prices', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const heating = JSON.parse(
    readFileSync(new URL('../../src/data/heating.json', import.meta.url), 'utf8'),
  ) as { gas: { byState: Record<string, { price: number }> } };
  await page.goto('/tools/heating-cost-calculator/?state=PA');
  await expect(page.getByLabel('Your state')).toHaveValue('PA');
  await expect(page.locator('.result table.systems tbody tr')).toHaveCount(5);
  await page.getByLabel('How much heat?').selectOption('therms');
  await page.locator('#hc-amount').fill('600');
  // 600 therms in an 85% furnace = 51 million Btu of heat. A 95% furnace burns 536.84 therms.
  const perTherm = heating.gas.byState['PA']!.price / 10.36;
  const gasRow = page.locator('.result table.systems tr', { hasText: 'Natural gas furnace' });
  await expect(gasRow).toContainText('537 therms');
  await expect(gasRow).toContainText(`$${Math.round(536.842 * perTherm).toLocaleString('en-US')}`);
  // Heat pump, HSPF2 7.8: 51e6 Btu ÷ 7,800 Btu per kWh = 6,538 kWh, at 8¢ = $523.
  await page.locator('summary', { hasText: 'Your prices' }).click();
  await page.getByLabel('Electricity (¢ or $ per kWh)').fill('8');
  await expect(page.locator('.result .big')).toHaveText('Heat pump: $523/yr');
  // Bills print dollars too: $0.08 is the same 8¢.
  await page.getByLabel('Electricity (¢ or $ per kWh)').fill('$0.08');
  await expect(page.locator('.result .big')).toHaveText('Heat pump: $523/yr');
  await expect(page.locator('.result .verdict')).toContainText(
    'the heat pump is cheaper to run than the gas furnace',
  );
  expect(errors).toEqual([]);
});

test('state page compares heating costs and links the calculator with the state', async ({
  page,
}) => {
  await page.goto('/electricity-rates/michigan/');
  const section = page.locator('h2', { hasText: 'Heating costs in Michigan' });
  await expect(section).toBeVisible();
  await expect(page.getByRole('link', { name: /Compare with your own fuel use/ })).toHaveAttribute(
    'href',
    '/tools/heating-cost-calculator/?state=MI',
  );
});

test('heating page table fits a phone screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout only');
  await page.goto('/tools/heating-cost-calculator/');
  for (const scroller of await page.locator('main .table-scroll').all()) {
    const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test('home page: picking a state shows its price and carries it into the tools', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.getByLabel('Start with your state').selectOption('texas');
  await expect(page.locator('.start-answer')).toContainText(
    `Texas: ${cents(price('TX').price)} per kWh`,
  );
  await expect(page.locator('main').getByRole('link', { name: 'Bill checker' })).toHaveAttribute(
    'href',
    '/tools/why-is-my-electric-bill-high/?state=TX',
  );
  await page.getByRole('button', { name: 'See Texas prices' }).click();
  await expect(page).toHaveURL(/\/electricity-rates\/texas\/$/);
});

test('appliance sliders move the result and the rate can go back to the state average', async ({
  page,
}) => {
  await page.goto('/tools/space-heater-cost/?state=TX');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await expect(page.getByLabel('Your state')).toHaveValue('TX');
  await page.getByLabel('Drag to set the daily use').fill('4');
  await expect(page.locator('#ac-hours')).toHaveValue('4');
  // 1,500 W × 4 h × 30 days = 180 kWh
  await expect(page.locator('.result .big')).toHaveText(
    `${money((180 * price('TX').price) / 100)} / month`,
  );
  await page.getByLabel('Drag to try a different price').fill('20');
  await expect(page.locator('#ac-rate-custom')).toHaveValue('20.00');
  await expect(page.locator('.result .big')).toHaveText('$36.00 / month');
  await page.getByRole('button', { name: /Back to the Texas average/ }).click();
  await expect(page.locator('#ac-rate-mode')).toHaveValue('state');
  await expect(page.locator('.result .big')).toHaveText(
    `${money((180 * price('TX').price) / 100)} / month`,
  );
});

test('a ?state= link never shows the default state before the calculator switches', async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/_astro/*.js', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/tools/appliance-electricity-cost/?state=TX', { waitUntil: 'commit' });
  await page.locator('.tool').waitFor({ state: 'attached' });
  // Prerendered with Pennsylvania: hidden until the island has switched to Texas.
  await expect(page.locator('.tool')).toBeHidden();
  release();
  await expect(page.locator('.tool')).toBeVisible();
  await expect(page.getByLabel('Your state')).toHaveValue('TX');
  await expect(page.locator('.result .note').first()).toContainText('Texas average');
});

test('state page, links and calculators use the same price', async ({ page }) => {
  await page.goto('/electricity-rates/texas/');
  await expect(page.locator('.lede')).toContainText(`${cents(price('TX').price)} per kWh`);
  await page.getByRole('link', { name: 'Calculate any appliance' }).click();
  await expect(page).toHaveURL(/\/tools\/appliance-electricity-cost\/\?state=TX$/);
  await expect(page.getByLabel('Your state')).toHaveValue('TX');
  await expect(page.getByLabel('Price to use')).toHaveValue('state');
  await expect(page.locator('.result .note').first()).toContainText(
    `at ${cents(price('TX').price)} per kWh (Texas average`,
  );
});

test('state page lists the states that share a border', async ({ page }) => {
  await page.goto('/electricity-rates/texas/');
  await expect(page.locator('h2', { hasText: 'States that border Texas' })).toBeVisible();
  const table = page.locator('h2:has-text("States that border Texas") + .table-scroll tbody');
  await expect(table.locator('tr')).toHaveCount(4);
  for (const name of ['Arkansas', 'Louisiana', 'New Mexico', 'Oklahoma'])
    await expect(table).toContainText(name);
  // The bill estimate is labelled as an estimate, with both periods named.
  await expect(page.locator('main')).toContainText('Same use at recent prices (estimate)');
  await expect(page.locator('main')).toContainText('is not an actual bill');
});

test('bill checker separates fixed charges and billing days from the price per kWh', async ({
  page,
}) => {
  await page.goto('/tools/why-is-my-electric-bill-high/?state=PA');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  // 30 × 30 kWh → 35 × 30 kWh at 15¢ energy; customer charge $10 → $25.
  await page.locator('#bc-pk').fill('900');
  await page.locator('#bc-pd').fill('145');
  await page.locator('#bc-nk').fill('1050');
  await page.locator('#bc-nd').fill('182.50');
  await page.locator('summary', { hasText: 'More lines from the bills' }).click();
  await page.locator('#bc-p-days').fill('30');
  await page.locator('#bc-n-days').fill('35');
  await page.locator('#bc-p-fixed').fill('10');
  // Half-filled pairs are refused rather than misread.
  await expect(page.locator('.result .error')).toContainText('fixed charges on both bills');
  await page.locator('#bc-n-fixed').fill('25');
  const result = page.locator('.result');
  await expect(result.locator('tr', { hasText: 'Longer or shorter billing period' })).toContainText(
    '+$22.50',
  );
  await expect(result.locator('tr', { hasText: 'Fixed charges' })).toContainText('+$15.00');
  await expect(result.locator('tr', { hasText: 'Energy price per kWh' })).toHaveCount(0);
  await expect(result).toContainText('15.00¢ → 15.00¢');
  await expect(result).toContainText('Daily use: 30.0 → 30.0 kWh a day');
});

test('rate from a bill removes the fixed charge', async ({ page }) => {
  await page.goto('/tools/appliance-electricity-cost/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.getByLabel('Price to use').selectOption('bill');
  await page.getByLabel('Bill total ($)').fill('152.40');
  await page.getByLabel('kWh on that bill').fill('900');
  await page.getByLabel('Fixed monthly charges ($, optional)').fill('12');
  await expect(page.locator('#ac-rate-msg')).toContainText('Using 15.60¢ per kWh');
  // Space heater default: 1,500 W × 8 h × 30 days = 360 kWh × 15.6¢
  await expect(page.locator('.result .big')).toHaveText('$56.16 / month');
});

test('heating calculator: cold weather, backup heat and price sensitivity', async ({ page }) => {
  await page.goto('/tools/heating-cost-calculator/?state=MN');
  await expect(page.getByLabel('Your state')).toHaveValue('MN');
  await page.locator('summary', { hasText: 'Your prices' }).click();
  await page.getByLabel('Electricity (¢ or $ per kWh)').fill('10');
  const hpRow = page.locator('.result table.systems tr', { hasText: 'Heat pump' });
  const before = await hpRow.innerText();
  // HSPF2 7.8 × 0.7 = 5.46
  await page.getByLabel('Cold-weather performance').selectOption('severe');
  await expect(page.locator('.result .verdict')).toContainText('effective HSPF2 of 5.5');
  await expect(hpRow).not.toHaveText(before);
  await expect(page.locator('table.sens tbody tr')).toHaveCount(3);
  // Heated area scales the typical home's heat.
  await page.getByLabel('Heated area (sq ft)').fill('1000');
  await expect(page.locator('.result > .note').first()).toContainText('million Btu of heat a year');
});

test('savings planner compares scenarios and restores a shared link', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tools/home-energy-savings-planner/?state=TX');
  await expect(page.getByLabel('State', { exact: true })).toHaveValue('TX');
  const tx = price('TX').price;
  const rows = page.locator('table.compare tbody tr');
  await expect(rows).toHaveCount(2);
  // Example: 1,500 W, 8 h vs 5 h, 5 months a year → 3 h × 1.5 kW × 365 × 5/12 days saved.
  const saved = (3 * 1.5 * 365 * (5 / 12) * tx) / 100;
  await expect(rows.nth(1)).toContainText(`−${money(saved / 12)}/mo`);
  // Add a scenario with a lower price; the comparison updates live.
  await page.getByRole('button', { name: 'A price 2¢ lower' }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('Lower price');
  // Delete it again.
  await page.getByRole('button', { name: 'Delete Lower price' }).click();
  await expect(rows).toHaveCount(2);
  // Edit hours in the second scenario.
  await page.locator('fieldset.scenario').nth(1).getByLabel('Hours/day').fill('4');
  const saved4 = (4 * 1.5 * 365 * (5 / 12) * tx) / 100;
  await expect(rows.nth(1)).toContainText(`−${money(saved4 / 12)}/mo`);
  // The bill amount is never put in the share link.
  await page.locator('summary', { hasText: 'More about your home' }).click();
  await page.getByLabel('Typical electric bill ($ a month)').fill('187.65');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('.planner')).toContainText('Link copied.');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('/tools/home-energy-savings-planner/?p=');
  const decoded = Buffer.from(
    new URL(link).searchParams.get('p')!.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf8');
  expect(decoded).not.toContain('187.65');
  // Opening the link restores the scenarios.
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page.locator('.planner')).toContainText('Opened from a shared link');
  await expect(page.locator('table.compare tbody tr').nth(1)).toContainText(
    `−${money(saved4 / 12)}/mo`,
  );
  expect(errors).toEqual([]);
});

test('savings planner: a damaged link falls back to the example', async ({ page }) => {
  await page.goto('/tools/home-energy-savings-planner/?p=garbage');
  await expect(page.getByRole('alert')).toContainText('incomplete or damaged');
  await expect(page.locator('table.compare tbody tr')).toHaveCount(2);
});

test('savings planner: heat pump scenario and CSV download', async ({ page }) => {
  await page.goto('/tools/home-energy-savings-planner/?state=PA');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('summary', { hasText: 'More about your home' }).click();
  await page.getByLabel('Main heating').selectOption('gas');
  await page.getByRole('button', { name: 'Heat pump instead' }).click();
  const rows = page.locator('table.compare tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('table.breakdown')).toContainText('Heating: natural gas furnace');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('wattsplain-pa-scenarios.csv');
});

test('savings planner opens from the appliance calculator with that appliance', async ({
  page,
}) => {
  await page.goto('/tools/appliance-electricity-cost/?state=OH');
  await page.getByLabel('Appliance', { exact: true }).selectOption('dehumidifier');
  await page.getByRole('link', { name: /savings planner/ }).click();
  await expect(page).toHaveURL(/state=OH&appliance=dehumidifier/);
  await expect(page.getByLabel('State', { exact: true })).toHaveValue('OH');
  await expect(page.locator('fieldset.scenario').first()).toContainText('Dehumidifier');
});

test('bill diagnosis walks through four steps to evidence-sorted causes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tools/electric-bill-diagnosis/?state=OH');
  await expect(page.getByLabel('Your state')).toHaveValue('OH');
  await page.locator('#dx-prev-kwh').fill('900');
  await page.locator('#dx-prev-total').fill('135');
  await page.locator('#dx-prev-days').fill('30');
  await page.locator('#dx-now-kwh').fill('1050');
  await page.locator('#dx-now-total').fill('157.50');
  await page.locator('#dx-now-days').fill('35');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Step 2 of 4: Season' })).toBeFocused();
  await page.getByLabel('The month before').check();
  await page.getByLabel('Colder').check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Started using a space heater').check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Yes', { exact: true }).first().check();
  await page.getByRole('button', { name: 'See possible causes' }).click();
  const result = page.locator('.result');
  const shown = result.locator('.causes.numbers');
  await expect(shown).toContainText('The billing period was longer');
  await expect(shown).not.toContainText('You used more electricity');
  await expect(result.locator('.causes.likely')).toContainText('An estimated meter reading');
  // kWh per day did not change, so the heater is only something to check.
  await expect(result.locator('.causes.check')).toContainText('A space heater');
  await expect(result).toContainText('Possible causes, not confirmed ones');
  expect(errors).toEqual([]);
});

test('no Content-Security-Policy violations or console errors on the main pages', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    // Cloudflare's edge injects its Web Analytics beacon on production; the policy blocks it on
    // purpose (the privacy page promises no third-party scripts). Anything else is a failure.
    if (m.type() === 'error' && !m.text().includes('static.cloudflareinsights.com/beacon'))
      problems.push(`${page.url()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${page.url()}: ${e.message}`));
  // Analytics beacons have no backend under `astro preview`.
  await page.route('**/api/e', (route) => route.fulfill({ status: 204 }));
  for (const path of [
    '/',
    '/tools/',
    '/electricity-rates/',
    '/electricity-rates/texas/',
    '/tools/appliance-electricity-cost/?state=TX',
    '/tools/space-heater-cost/',
    '/tools/heating-cost-calculator/?state=MN',
    '/tools/why-is-my-electric-bill-high/',
    '/tools/electric-bill-diagnosis/',
    '/tools/home-energy-savings-planner/?state=TX',
    '/methodology/',
  ]) {
    await page.goto(path);
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  }
  // The pre-hydration guard (an inline script) must have run under the policy.
  await page.goto('/tools/appliance-electricity-cost/?state=TX');
  await expect(page.locator('html')).toHaveAttribute('data-qs', '');
  expect(problems).toEqual([]);
});

test('input mistakes show an error instead of a wrong result', async ({ page }) => {
  // Heating: AFUE typed as a fraction, a price with a comma, an implausible HSPF2.
  await page.goto('/tools/heating-cost-calculator/?state=PA');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('summary', { hasText: 'Your prices' }).click();
  await page.getByLabel('Gas or propane furnace AFUE (%)').fill('0.95');
  await expect(page.locator('.result .error')).toContainText('AFUE as a percentage');
  await expect(page.locator('.result table.systems')).toHaveCount(0);
  await page.getByLabel('Gas or propane furnace AFUE (%)').fill('95');
  await page.getByLabel('Electricity (¢ or $ per kWh)').fill('185');
  await expect(page.locator('.result .error')).toContainText('outside the range');
  await page.getByLabel('Electricity (¢ or $ per kWh)').fill('');
  await page.getByLabel('HSPF2 rating').fill('78');
  await expect(page.locator('.result .error')).toContainText('HSPF2');
  // Payback needs both quotes.
  await page.getByLabel('HSPF2 rating').fill('7.8');
  await page.locator('summary', { hasText: 'Installation and upkeep' }).click();
  await page.getByLabel('Heat pump: install ($)').fill('12000');
  await expect(page.locator('.result')).toContainText('Enter both the heat pump and the gas');
  await expect(page.locator('.result')).not.toContainText('Simple payback');

  // Bill checker: an unreadable optional line.
  await page.goto('/tools/why-is-my-electric-bill-high/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('#bc-pk').fill('800');
  await page.locator('#bc-pd').fill('140');
  await page.locator('#bc-nk').fill('950');
  await page.locator('#bc-nd').fill('200');
  await page.locator('summary', { hasText: 'More lines from the bills' }).click();
  await page.locator('#bc-p-fixed').fill('12 dollars');
  await page.locator('#bc-n-fixed').fill('12');
  await expect(page.locator('.result .error')).toContainText('fixed charges as a number');

  // Planner: a value the share link could not carry.
  await page.goto('/tools/home-energy-savings-planner/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.getByLabel('Electricity use (kWh a month)').fill('0.5');
  await expect(page.locator('.planner .error')).toContainText('between 1 and 20,000 kWh');
});

test('bill diagnosis: start over clears every answer', async ({ page }) => {
  await page.goto('/tools/electric-bill-diagnosis/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Colder').check();
  await page.getByLabel('Electric heat (heat pump, baseboard, electric furnace)').check();
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: i === 2 ? 'See possible causes' : 'Next' }).click();
  await expect(page.locator('.result')).toContainText('Colder weather and electric heating');
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('Not sure')).toBeChecked();
  await expect(
    page.getByLabel('Electric heat (heat pump, baseboard, electric furnace)'),
  ).not.toBeChecked();
});
