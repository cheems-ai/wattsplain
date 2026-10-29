import { expect, test } from '@playwright/test';

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
  await expect(result).toContainText('Average residential price in Pennsylvania: 21.77¢');
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
  // 1,500 W × 8 h × 30 days = 360 kWh × 47.18¢ = $169.85
  await expect(page.locator('.result .big')).toHaveText('$169.85 / month');
  await page.getByLabel('Or your own rate').fill('10');
  await expect(page.locator('.result .big')).toHaveText('$36.00 / month');
});

test('space heater page offers wattage presets', async ({ page }) => {
  await page.goto('/tools/space-heater-cost/?state=TX');
  await page.getByRole('button', { name: '750 W' }).click();
  await expect(page.getByRole('button', { name: '750 W' })).toHaveAttribute('aria-pressed', 'true');
  // 750 W × 8 h × 30 = 180 kWh × 15.91¢ = $28.64
  await expect(page.locator('.result .big')).toHaveText('$28.64 / month');
});

test('state page shows its own numbers and links the tools with the state', async ({ page }) => {
  await page.goto('/electricity-rates/pennsylvania/');
  await expect(page.locator('h1')).toHaveText('Pennsylvania electricity rates and average bill');
  await expect(page.locator('.lede')).toContainText(
    '21.77¢ per kWh, higher than a year earlier (19.93¢).',
  );
  await expect(page.getByRole('link', { name: /Enter two of your bills/ })).toHaveAttribute(
    'href',
    '/tools/why-is-my-electric-bill-high/?state=PA',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('pages fit the screen without horizontal scrolling', async ({ page }) => {
  for (const path of [
    '/',
    '/electricity-rates/pennsylvania/',
    '/tools/why-is-my-electric-bill-high/',
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
  await expect(chart.locator('figcaption')).toContainText('September 2024 – August 2026');
  await expect(chart.locator('svg:visible path.line')).toHaveCount(2);
  await expect(page.locator('main')).toContainText(
    'So far in 2026 (8 months), Pennsylvania has averaged',
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
