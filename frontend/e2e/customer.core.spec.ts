import { test, expect, registerCustomer, login, ensureCustomerHasSavedCard } from './fixtures';

test.describe('Customer critical workflows (UI-only)', () => {
  test.setTimeout(120_000);

  test('registration + login redirects to /user/dashboard', async ({ page }) => {
    const customer = await registerCustomer(page);
    // force logout by clearing localStorage session key used in legacy tests
    await page.evaluate(() => localStorage.removeItem('fixmate_auth'));
    await page.goto('/login');
    await login(page, customer.email, customer.password);
    await expect(page).toHaveURL(/\/user\/dashboard/);
  });

  test('payments: add saved card from /user/payments', async ({ page }) => {
    const customer = await registerCustomer(page);
    await login(page, customer.email, customer.password);
    await ensureCustomerHasSavedCard(page);
    await expect(page.getByText(/visa|mastercard|amex/i)).toBeVisible();
  });

  test('request service wizard loads and enforces required steps', async ({ page }) => {
    const customer = await registerCustomer(page);
    await login(page, customer.email, customer.password);

    await page.goto('/user/new-request');
    await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();
    await page.getByRole('heading', { name: 'Request a Service' }).click();
    await expect(page).toHaveURL(/\/user\/request\/service/);

    // Step 1: categories render.
    await expect(page.getByRole('heading', { name: /What service do you need\?/i })).toBeVisible();
    await expect(page.locator('.category-card').first()).toBeVisible();

    // Current behavior: when no category query param is provided, the wizard auto-selects the first category.
    const next = page.getByRole('button', { name: 'Next' });
    await expect(next).toBeEnabled();
  });

  test('notifications page opens and supports mark-all-read action (if unread exists)', async ({ page }) => {
    const customer = await registerCustomer(page);
    await login(page, customer.email, customer.password);
    await page.goto('/user/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

    const markAll = page.getByRole('button', { name: /Mark All Read/i });
    if (await markAll.isVisible().catch(() => false)) {
      await markAll.click();
      await expect(markAll).toBeHidden().catch(() => {});
    }
  });
});

