import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, registerCustomer, login, uniqueEmail, setupApprovedProviderForE2E } from './fixtures';
import type { APIRequestContext, Page } from '@playwright/test';

const E2E_CATEGORY_NAME = 'E2E Timber validation';

function ensureMarketplaceFixtures() {
  const script = path.resolve(process.cwd(), '../elofix-backend/scripts/seed-e2e-marketplace.js');
  execFileSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
}

test.beforeEach(async ({ request }) => {
  ensureMarketplaceFixtures();
  const apiBase = process.env.ELOFIX_API_BASE_URL || 'http://localhost:5000/api';
  const response = await request.get(`${apiBase}/marketplace-material-categories`);
  expect(response.ok(), `GET ${apiBase}/marketplace-material-categories returned ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { categories?: Array<{ name?: string }> };
  const names = (body.categories || []).map((category) => category.name);
  expect(names, 'marketplace E2E fixtures were not created').toEqual(
    expect.arrayContaining(['Paint', 'Tiles & Flooring'])
  );
});

async function adminApi(request: APIRequestContext) {
  const apiBase = process.env.ELOFIX_API_BASE_URL || 'http://localhost:5000/api';
  const response = await request.post(`${apiBase}/auth/login`, {
    data: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@elofix.com',
      password: process.env.E2E_ADMIN_PASSWORD || 'Admin@123',
    },
  });
  expect(response.ok(), `admin login for category cleanup failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { token?: string };
  expect(body.token).toBeTruthy();
  return { apiBase, token: body.token as string };
}

async function deleteDeterministicCategory(request: APIRequestContext) {
  const { apiBase, token } = await adminApi(request);
  const list = await request.get(`${apiBase}/admin/marketplace-material-categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!list.ok()) return;
  const body = (await list.json()) as { categories?: Array<{ id?: string; name?: string }> };
  const row = (body.categories || []).find((category) => category.name === E2E_CATEGORY_NAME);
  if (!row?.id) return;
  const removed = await request.delete(
    `${apiBase}/admin/marketplace-material-categories/${encodeURIComponent(row.id)}?confirm=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(removed.ok(), `delete ${E2E_CATEGORY_NAME} failed: ${removed.status()}`).toBeTruthy();
}

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
    await expect(page.getByRole('button', { name: /BUCO - Brackenfell/ })).toBeVisible();
    await expect(page.getByText(/Subtotal/)).toHaveCount(0);
  });
});

test.describe('Marketplace admin and supplier assignment', () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ request }) => {
    await deleteDeterministicCategory(request);
  });

  test('admin manages categories and sees branch assignment', async ({ page, request }) => {
    await deleteDeterministicCategory(request);
    const email = process.env.E2E_ADMIN_EMAIL || 'admin@elofix.com';
    const password = process.env.E2E_ADMIN_PASSWORD || 'Admin@123';
    await login(page, email, password);
    await page.goto('/admin/material-categories');
    await expect(page.getByRole('heading', { name: 'Material categories' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('cell', { name: /^Paint/ })).toBeVisible();

    await page.goto('/admin/suppliers');
    await page.getByPlaceholder('Search by store, business, or email…').fill('BUCO');
    await page.getByRole('row', { name: /BUCO/ }).getByRole('button', { name: 'View details' }).click();
    const section = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Marketplace categories' }),
    });
    await expect(section.getByRole('heading', { name: 'Marketplace categories' })).toBeVisible({ timeout: 20_000 });
    await expect(section.getByText('These categories apply to every current and future branch for this supplier.')).toBeVisible();
    await section.getByRole('checkbox', { name: 'All categories' }).click();
    await section.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Categories saved', { exact: true })).toBeVisible({ timeout: 20_000 });

    await section.getByRole('button', { name: 'Create category' }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Name').fill(E2E_CATEGORY_NAME);
    await createDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Category created', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(section.getByRole('checkbox', { name: E2E_CATEGORY_NAME })).toBeVisible();

    const apiBase = process.env.ELOFIX_API_BASE_URL || 'http://localhost:5000/api';
    const listed = await request.get(`${apiBase}/marketplace-material-categories`);
    const listedBody = (await listed.json()) as { categories?: Array<{ id?: string; name?: string }> };
    const created = (listedBody.categories || []).find((category) => category.name === E2E_CATEGORY_NAME);
    expect(created?.id).toBeTruthy();
    const nearby = await request.get(`${apiBase}/branches/nearby`, {
      params: { city: 'Cape Town', area: 'Bellville', categoryId: created?.id },
    });
    expect(nearby.ok()).toBeTruthy();
    const nearbyBody = (await nearby.json()) as { branches?: Array<{ displayName?: string; name?: string }> };
    const labels = (nearbyBody.branches || []).map((branch) => branch.displayName || branch.name || '');
    expect(labels.some((label) => label.includes('BUCO - Bellville'))).toBeTruthy();

    await page.goto('/admin/material-categories');
    const row = page.getByRole('row', { name: new RegExp(E2E_CATEGORY_NAME) });
    await expect(row).toBeVisible({ timeout: 20_000 });
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
  });

  test('supplier sets a branch website without marketplace category controls', async ({ page }) => {
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
    await expect(branchDialog.getByRole('checkbox', { name: 'Paint' })).toHaveCount(0);
    await expect(branchDialog.getByText('Marketplace categories are managed by EloFix.')).toBeVisible();
    await branchDialog.getByRole('button', { name: 'Create branch' }).click();
    await expect(page.getByRole('heading', { name: /E2E Yard/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Website')).toHaveValue(/https:\/\/e2e-yard\.example\/?/);
    await expect(page.getByText('Marketplace categories are managed by EloFix.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Paint' })).toHaveCount(0);
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
