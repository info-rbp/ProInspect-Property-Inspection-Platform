import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  '/app/dashboard',
  '/app/admin/properties',
  '/app/admin/jobs',
  '/app/admin/reports',
  '/app/admin/users',
  '/app/admin/templates',
  '/app/admin/settings',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pcr_proinspect_logged_in', 'true'));
});

for (const route of routes) {
  test(`${route} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole('main')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  });
}

test('property creation panel has no serious or critical automated accessibility violations', async ({ page }) => {
  await page.goto('/app/admin/properties');
  await page.getByRole('button', { name: 'Add Property' }).click();
  const results = await new AxeBuilder({ page }).include('#create-property-detailed-submit-btn').analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
});
