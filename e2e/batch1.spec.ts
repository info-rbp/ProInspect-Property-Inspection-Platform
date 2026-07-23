import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pcr_proinspect_logged_in', 'true'));
});

test('template library exposes versioned administration controls', async ({ page }) => {
  await page.goto('/app/admin/templates');
  await expect(page.getByRole('heading', { name: 'Inspection template library' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create draft from selected' })).toBeVisible();
  await expect(page.getByText(/Immutable published version|published/i).first()).toBeVisible();
  await expect(page.getByText(/areas · .* components/i).first()).toBeVisible();
});

test('inspection booking exposes controlled template, baseline and access fields', async ({ page }) => {
  await page.goto('/app/admin/jobs');
  await expect(page.getByRole('heading', { name: 'Inspection bookings' })).toBeVisible();
  await page.getByRole('button', { name: 'Book inspection' }).click();
  await expect(page.getByText('Immutable template assignment')).toBeVisible();
  await expect(page.getByLabel('Inspection type')).toBeVisible();
  await expect(page.getByLabel('Access method')).toBeVisible();
  await page.getByLabel('Inspection type').selectOption('exit');
  await expect(page.getByLabel('Approved Entry report')).toBeVisible();
  await expect(page.getByLabel('Entry version ID')).toBeVisible();
});

test('service shell exposes the completed inspection-product modules', async ({ page }) => {
  await page.goto('/app/admin/operations');
  await expect(page.getByRole('heading', { name: 'Service operations' })).toBeVisible();
  await page.getByRole('tab', { name: 'Commercial' }).click();
  await expect(page.getByRole('button', { name: /Previous report imports/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Evidence vault/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Operations' }).click();
  await expect(page.getByRole('button', { name: /Maintenance triage/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Entry \/ Exit comparison/ })).toBeVisible();
});
