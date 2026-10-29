import { test } from '@playwright/test';

// Not a check: writes screenshots of the main pages to ../screenshots for review.
test.skip(!process.env['SHOTS'], 'set SHOTS=1 to capture screenshots');

test('capture', async ({ page }, info) => {
  const dir = `${process.env['SHOTS_DIR'] ?? '../screenshots'}/${info.project.name}`;
  await page.goto('/');
  await page.screenshot({ path: `${dir}-home.png`, fullPage: true });
  await page.getByLabel('Start with your state').selectOption('texas');
  await page.screenshot({ path: `${dir}-home-picked.png` });
  await page.goto('/tools/space-heater-cost/?state=TX');
  await page.getByLabel('Drag to try a different price').fill('24');
  await page.screenshot({ path: `${dir}-space-heater-sliders.png`, fullPage: true });
  await page.getByLabel('Drag to set the daily use').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}-space-heater-dragging.png` });
  await page.goto('/electricity-rates/pennsylvania/');
  await page.screenshot({ path: `${dir}-state-pennsylvania.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/electricity-rates/pennsylvania/');
  await page.screenshot({ path: `${dir}-state-pennsylvania-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/tools/why-is-my-electric-bill-high/?state=PA');
  await page.locator('#bc-pk').fill('800');
  await page.locator('#bc-pd').fill('140');
  await page.locator('#bc-nk').fill('950');
  await page.locator('#bc-nd').fill('200');
  await page.screenshot({ path: `${dir}-bill-checker.png`, fullPage: true });
  await page.goto('/tools/heating-cost-calculator/?state=MI');
  await page.screenshot({ path: `${dir}-heating.png`, fullPage: true });
  await page.locator('summary', { hasText: 'Your prices' }).click();
  await page.screenshot({ path: `${dir}-heating-open.png` });
  await page.goto('/tools/home-energy-savings-planner/?state=TX');
  await page.screenshot({ path: `${dir}-planner.png`, fullPage: true });
});
