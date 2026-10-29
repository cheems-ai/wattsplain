import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Automated WCAG 2.2 A/AA checks (axe-core) on every kind of page, in the state a visitor sees
// after using the tool. Automated checks catch only part of WCAG; keyboard and screen reader
// behaviour is covered by the focused tests in tools.spec.ts.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function check(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map(
    (v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/e', (route) => route.fulfill({ status: 204 }));
});

for (const path of [
  '/',
  '/tools/',
  '/electricity-rates/',
  '/electricity-rates/pennsylvania/',
  '/electricity-rates/price-changes/',
  '/tools/space-heater-vs-central-heat/',
  '/guides/why-is-my-electric-bill-so-high-in-winter/',
  '/tools/appliance-electricity-cost/',
  '/tools/space-heater-cost/',
  '/tools/heating-cost-calculator/',
  '/tools/home-energy-savings-planner/',
  '/methodology/',
  '/privacy/',
  '/404.html',
]) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await check(page, path);
  });
}

test('axe: bill checker with a result and all optional lines open', async ({ page }) => {
  await page.goto('/tools/why-is-my-electric-bill-high/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('#bc-pk').fill('800');
  await page.locator('#bc-pd').fill('140');
  await page.locator('#bc-nk').fill('950');
  await page.locator('#bc-nd').fill('200');
  await page.locator('summary', { hasText: 'More lines from the bills' }).click();
  await expect(page.locator('.result table.parts')).toBeVisible();
  await check(page, 'bill checker');
});

test('axe: bill diagnosis, each step and the results', async ({ page }) => {
  await page.goto('/tools/electric-bill-diagnosis/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  for (let i = 0; i < 4; i++) {
    await check(page, `diagnosis step ${i + 1}`);
    await page.getByRole('button', { name: i === 3 ? 'See possible causes' : 'Next' }).click();
  }
  await check(page, 'diagnosis results');
});

test('axe: heating calculator with every option open', async ({ page }) => {
  await page.goto('/tools/heating-cost-calculator/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  for (const s of await page.locator('.tool summary').all()) await s.click();
  await check(page, 'heating open');
});

test('axe: dark mode contrast on the planner and a state page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const path of ['/tools/home-energy-savings-planner/', '/electricity-rates/texas/', '/']) {
    await page.goto(path);
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await check(page, `dark ${path}`);
  }
});
