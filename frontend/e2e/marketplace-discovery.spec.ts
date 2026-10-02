import { expect, test, registerCustomer, login, uniqueEmail, setupApprovedProviderForE2E } from './fixtures';
import type { Page } from '@playwright/test';

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('Marketplace material discovery', () => {
  test.setTimeout(180_000);

  test('customer Paint branches, storefront, cart, then Tiles clears the cart', async ({ page }) => {
    await registerCustomer(page);
    await page.goto('/user/order-materials');
    await expect(page.getByRole('heading', { name: 'Order Materials' })).toBeVisible();

    await page.getByLabel('City').fill('Cape Town');
    await page.getByLabel('Area / suburb (optional)').fill('Bellville');
    await page.getByRole('button', { name: 'Paint', exact: true }).click();

    const bellville = page.getByRole('button', { name: /BUCO - Bellville/ });
    await expect(bellville).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Specialist Tile Store/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /BUCO - Brackenfell/ })).toBeVisible();

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: `test-results/marketplace-customer-branches-${width}.png`,
      });
      const overflow = await horizontalOverflow(page);
      expect(overflow, `customer branch list overflow at ${width}px`).toBeLessThanOrEqual(8);
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    await bellville.click();
    await expect(page.getByRole('heading', { name: 'BUCO - Bellville' })).toBeVisible();
    await expect(page.getByRole('link', { name: /0215551001/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /bellville@buco.example/ })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: 'test-results/marketplace-customer-storefront-390.png' });
    expect(await horizontalOverflow(page), 'storefront overflow at 390px').toBeLessThanOrEqual(8);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.getByRole('button', { name: /Interior paint, 1 product/i }).click();
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(/Subtotal/)).toBeVisible();
    await page.screenshot({ path: 'test-results/marketplace-customer-cart-1280.png' });

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nearby branches' })).toBeVisible();
    await page.getByRole('button', { name: 'Tiles & Flooring', exact: true }).click();
    await expect(page.getByText('Cart cleared', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Specialist Tile Store/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /BUCO - Brackenfell/ })).toHaveCount(0);
    await expect(page.getByText(/Subtotal/)).toHaveCount(0);
  });
});

test.describe('Marketplace admin and supplier assignment', () => {
  test.setTimeout(180_000);

  test('admin manages categories and sees branch assignment', async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL || 'admin@elofix.com';
    const password = process.env.E2E_ADMIN_PASSWORD || 'Admin@123';
    await login(page, email, password);
    await page.goto('/admin/material-categories');
    await expect(page.getByRole('heading', { name: 'Material categories' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('cell', { name: /^Paint/ })).toBeVisible();

    const createdName = `E2E Timber ${Date.now().toString(36)}`;
    await page.getByRole('button', { name: 'Add category' }).click();
    await page.getByLabel('Name').fill(createdName);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('cell', { name: new RegExp(`^${createdName}`) })).toBeVisible({ timeout: 20_000 });

    const row = page.getByRole('row', { name: new RegExp(createdName) });
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Description').fill('Validation edit');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Category updated', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.reload();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Description')).toHaveValue('Validation edit');
    await page.keyboard.press('Escape');

    await page.goto('/admin/suppliers');
    await page.getByPlaceholder('Search by store, business, or email…').fill('BUCO');
    await page.getByRole('row', { name: /BUCO/ }).getByRole('button', { name: 'View details' }).click();
    await expect(page.getByRole('heading', { name: 'Marketplace categories' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('BUCO - Bellville').first()).toBeVisible();
    await expect(page.getByText('Paint').first()).toBeVisible();
  });

  test('supplier sets website and an active marketplace category on a branch', async ({ page }) => {
    const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@elofix.com';
    const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'Admin@123';
    const supplierEmail = uniqueEmail('e2e.supplier');
    const supplierPassword = 'Password@123';
    await login(page, adminEmail, adminPassword);
    await page.goto('/admin/suppliers');
    await page.getByRole('button', { name: 'Create supplier' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Acme Plumbing Supply').fill('E2E Hardware');
    await dialog.locator('input[type="email"]').fill(supplierEmail);
    await dialog.locator('input[type="password"]').fill(supplierPassword);
    await dialog.getByRole('button', { name: 'Create supplier' }).click();
    await expect(page.getByText(supplierEmail)).toBeVisible({ timeout: 20_000 });

    await page.evaluate(() => localStorage.removeItem('formmate_auth'));
    await login(page, supplierEmail, supplierPassword);
    await page.goto('/supplier/branches');
    await expect(page.getByRole('heading', { name: 'My branches' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'New branch' }).click();
    const branchDialog = page.getByRole('dialog');
    await branchDialog.getByLabel('Branch name').fill('E2E Yard');
    await branchDialog.getByLabel('City').fill('Cape Town');
    await branchDialog.getByLabel('Website').fill('https://e2e-yard.example');
    await branchDialog.getByRole('checkbox', { name: 'Paint' }).click();
    await branchDialog.getByRole('button', { name: 'Create branch' }).click();
    await expect(page.getByRole('heading', { name: /E2E Yard/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Website')).toHaveValue(/https:\/\/e2e-yard\.example\/?/);
    await expect(page.getByRole('checkbox', { name: 'Paint' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Tiles & Flooring' })).not.toBeChecked();
  });
});

test.describe('Provider marketplace draft', () => {
  test.setTimeout(480_000);

  test('provider browses a category, adds a product, and saves a draft', async ({ page, browser }) => {
    const providerSetup = await setupApprovedProviderForE2E(browser, {
      skillName: 'Plumbing',
      name: 'Market Provider',
    });
    const customer = await registerCustomer(page);
    await login(page, customer.email, customer.password);
    await page.goto('/user/new-request');
    await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();
    await page.getByRole('heading', { name: 'Request a Service' }).click();
    const plumbingCategory = page.locator('.category-card').filter({ hasText: /Plumbing/i }).first();
    await expect(plumbingCategory).toBeVisible({ timeout: 30_000 });
    await plumbingCategory.click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByPlaceholder(/123 Main Street/i).fill('123 Main Road');
    await page.locator('#city').fill('Cape Town');
    await page.getByPlaceholder(/Claremont/i).fill('Bellville');
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Task Description').fill('E2E marketplace: please fix a leaking kitchen tap.');
    await page.getByRole('button', { name: 'Next' }).click();
    const providerCard = page.locator('.provider-card').filter({ hasText: providerSetup.businessName });
    await expect(providerCard.first()).toBeVisible({ timeout: 30_000 });
    await providerCard.first().getByRole('button', { name: 'Select' }).click();
    const createJobRespPromise = page.waitForResponse(
      (r) => r.url().includes('/jobs') && r.request().method() === 'POST' && !r.url().includes('/payments'),
      { timeout: 60_000 }
    );
    await page.getByRole('button', { name: /Submit Request|Send request/i }).click();
    const createJobResp = await createJobRespPromise;
    expect(createJobResp.ok(), `create job failed: ${createJobResp.status()}`).toBeTruthy();
    const created = (await createJobResp.json()) as { job?: { id?: string }; id?: string };
    const jobId = String(created.job?.id || created.id || '');
    expect(jobId).not.toEqual('');

    const apiBase = process.env.ELOFIX_API_BASE_URL || 'http://localhost:5000/api';
    const providerLogin = await providerSetup.providerCtx.request.post(`${apiBase}/auth/login`, {
      data: { email: providerSetup.email, password: providerSetup.password },
    });
    expect(providerLogin.ok()).toBeTruthy();
    const providerAuth = (await providerLogin.json()) as { token?: string; user?: Record<string, unknown> };
    const acceptApi = await providerSetup.providerCtx.request.patch(`${apiBase}/jobs/${jobId}/accept`, {
      headers: { Authorization: `Bearer ${providerAuth.token}` },
    });
    expect(acceptApi.ok(), `accept job failed: ${acceptApi.status()} ${await acceptApi.text()}`).toBeTruthy();

    const providerPage = providerSetup.providerPage;
    await providerPage.goto('/login');
    await providerPage.evaluate((session) => {
      localStorage.setItem('formmate_auth', JSON.stringify(session));
    }, { token: providerAuth.token, user: providerAuth.user });
    await providerPage.goto(`/provider/jobs/${jobId}/materials/browse`);
    await expect(providerPage.getByRole('button', { name: 'Paint', exact: true })).toBeVisible({ timeout: 30_000 });
    await providerPage.getByRole('button', { name: 'Paint', exact: true }).click();
    await expect(providerPage.getByRole('button', { name: /BUCO - Bellville/ })).toBeVisible({ timeout: 20_000 });
    await expect(providerPage.getByRole('button', { name: /Specialist Tile Store/ })).toHaveCount(0);
    await providerPage.getByRole('button', { name: /BUCO - Bellville/ }).click();
    await expect(providerPage.getByRole('heading', { level: 2, name: 'BUCO - Bellville' })).toBeVisible();
    await providerPage.getByRole('button', { name: /Interior paint/i }).click();
    await providerPage.getByRole('button', { name: 'Add' }).click();
    const saveResp = providerPage.waitForResponse(
      (r) => r.url().includes('/materials') && (r.request().method() === 'PUT' || r.request().method() === 'POST' || r.request().method() === 'PATCH'),
      { timeout: 30_000 }
    );
    await providerPage.getByRole('button', { name: 'Save to job' }).click();
    const saved = await saveResp;
    expect(saved.ok(), `save draft failed: ${saved.status()} ${await saved.text()}`).toBeTruthy();
    const draftBody = saved.request().postDataJSON() as {
      items?: Array<{
        branchId?: string;
        supplierId?: string;
        supplierName?: string;
        productId?: string;
        qty?: number;
        unitPrice?: number;
      }>;
    };
    const line = draftBody.items?.[0];
    expect(line?.branchId, 'draft line branchId').toBeTruthy();
    expect(line?.supplierId).toBe(line?.branchId);
    expect(line?.supplierName).toMatch(/BUCO - Bellville/);
    expect(line?.productId).toBeTruthy();
    expect(line?.qty).toBe(1);
    expect(line?.unitPrice).toBeGreaterThan(0);

    await providerPage.goto(`/provider/jobs/${jobId}/materials/browse`);
    await expect(providerPage.getByText(/1 items/)).toBeVisible({ timeout: 20_000 });
    await providerSetup.providerCtx.close();
  });
});
