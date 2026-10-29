import { test } from '@playwright/test';

// Not a check: writes screenshots of the main pages to ../screenshots for review.
test.skip(!process.env['SHOTS'], 'set SHOTS=1 to capture screenshots');

test('capture', async ({ page }, info) => {
  const dir = `../screenshots/${info.project.name}`;
  await page.goto('/');
  await page.screenshot({ path: `${dir}-home.png`, fullPage: true });
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
});
