import { expect, test } from '@playwright/test';

const signIn = async (page: import('@playwright/test').Page) => {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill('info@proinspect.systems');
  await page.getByLabel('Password').fill('Foxtrot19!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/u);
};

test('application shell exposes agency, role and accessible landmarks', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('ProInspect Administration')).toBeVisible();
  await expect(page.getByText('Active role: proinspect admin')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByText(/Saved on this device|Cloud synchronised|Changes pending/u)).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('mobile drawer traps focus, closes with Escape and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const menuButton = page.getByRole('button', { name: 'Open navigation' });
  await menuButton.click();
  const dialog = page.getByRole('dialog', { name: 'Application navigation' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByText('Internal ProInspect workspace')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(menuButton).toBeFocused();
});

test('editable records warn before navigation and successful persistence clears dirty state', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Properties' }).click();
  await page.getByRole('button', { name: 'Add Property' }).click();
  await page.getByLabel('Street Address *').fill('1 Test Street');
  await expect(page.getByText('Changes pending')).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('unsaved changes');
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/properties$/u);

  await page.getByLabel('Suburb').fill('Perth');
  await page.getByLabel('Postcode').fill('6000');
  await page.getByRole('button', { name: 'Save Property' }).click();
  await expect(page.getByText('Saved on this device')).toBeVisible();
});
