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
  await expect(result).toContainText('Price per kWh: +$31.09');
  await expect(result).toContainText('Usage: +$28.91');
  await expect(result).toContainText(
    `Average residential price in Pennsylvania: ${cents(price('PA').price)}`,
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
  await page.getByLabel('Or your own rate').fill('10');
  await expect(page.locator('.result .big')).toHaveText('$36.00 / month');
});

test('space heater page offers wattage presets', async ({ page }) => {
  await page.goto('/tools/space-heater-cost/?state=TX');
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
  await expect(page.locator('.result tbody tr')).toHaveCount(5);
  await page.getByLabel('How much heat?').selectOption('therms');
  await page.locator('#hc-amount').fill('600');
  // 600 therms in an 85% furnace = 51 million Btu of heat. A 95% furnace burns 536.84 therms.
  const perTherm = heating.gas.byState['PA']!.price / 10.36;
  const gasRow = page.locator('.result tbody tr', { hasText: 'Natural gas furnace' });
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
