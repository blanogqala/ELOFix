/**
 * Hosted staging smoke. Skips unless ELOFIX_HOSTED_SMOKE=1.
 * Reuses seeded accounts (does not register) so production auth rate limits stay intact.
 *
 * Required for role tests:
 *   STAGING_CUSTOMER_A_EMAIL / STAGING_CUSTOMER_A_PASSWORD
 *   STAGING_PROVIDER_A_EMAIL / STAGING_PROVIDER_A_PASSWORD
 *   STAGING_SUPPLIER_EMAIL / STAGING_SUPPLIER_PASSWORD
 *   ADMIN_EMAIL / ADMIN_PASSWORD
 * Optional:
 *   ELOFIX_API_BASE_URL — anonymous/authorization HTTP checks
 *   STAGING_PRIVATE_FILE_ID — anonymous private-file ACL check
 *   PLAYWRIGHT_BASE_URL — Netlify HTTPS origin (never hardcoded)
 */
import { test, expect, type Page } from '@playwright/test';
import { login, gotoApp } from './fixtures';

const hosted = process.env.ELOFIX_HOSTED_SMOKE === '1';
const apiBase = (process.env.ELOFIX_API_BASE_URL || '').replace(/\/$/, '');

function cred(emailKey: string, passwordKey: string) {
  const email = String(process.env[emailKey] || '').trim();
  const password = String(process.env[passwordKey] || '').trim();
  return email && password ? { email, password } : null;
}

const customerA = cred('STAGING_CUSTOMER_A_EMAIL', 'STAGING_CUSTOMER_A_PASSWORD');
const providerA = cred('STAGING_PROVIDER_A_EMAIL', 'STAGING_PROVIDER_A_PASSWORD');
const supplier = cred('STAGING_SUPPLIER_EMAIL', 'STAGING_SUPPLIER_PASSWORD');
const admin = cred('ADMIN_EMAIL', 'ADMIN_PASSWORD');
const privateFileId = String(process.env.STAGING_PRIVATE_FILE_ID || '').trim();

async function sessionToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('fixmate_auth');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { token?: string };
      return parsed.token || null;
    } catch {
      return null;
    }
  });
}

test.describe('Hosted staging smoke', () => {
  test.skip(!hosted, 'Set ELOFIX_HOSTED_SMOKE=1 to run against hosted staging');
  test.setTimeout(90_000);

  test('landing loads over HTTPS without localhost API calls', async ({ page }) => {
    const localhostHits: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/localhost|127\.0\.0\.1/i.test(url) && !url.startsWith('blob:') && !url.startsWith('data:')) {
        localhostHits.push(url);
      }
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await gotoApp(page, '/');
    await expect(page.locator('#root')).toBeVisible();
    await expect(page).toHaveTitle(/EloFix/);
    expect(localhostHits, `localhost requests: ${localhostHits.join(', ')}`).toEqual([]);
    expect(pageErrors.filter((m) => !/ResizeObserver|favicon/i.test(m))).toEqual([]);
  });

  test('390x844 landing remains usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/');
    await expect(page.locator('#root')).toBeVisible();
    const loginLink = page.getByRole('link', { name: /log in|sign in|login/i }).first();
    const loginBtn = page.getByRole('button', { name: /log in|sign in|login/i }).first();
    const hasLogin =
      (await loginLink.isVisible().catch(() => false)) || (await loginBtn.isVisible().catch(() => false));
    expect(hasLogin, 'login control should be reachable at 390px').toBeTruthy();
  });

  test('customer A can login to dashboard', async ({ page }) => {
    test.skip(!customerA, 'STAGING_CUSTOMER_A_EMAIL/PASSWORD not set');
    await login(page, customerA!.email, customerA!.password);
    await expect(page).toHaveURL(/\/user\/dashboard/);
  });

  test('provider A can login to dashboard', async ({ page }) => {
    test.skip(!providerA, 'STAGING_PROVIDER_A_EMAIL/PASSWORD not set');
    await login(page, providerA!.email, providerA!.password);
    await expect(page).toHaveURL(/\/provider\/(dashboard|profile)/);
  });

  test('supplier can login to dashboard', async ({ page }) => {
    test.skip(!supplier, 'STAGING_SUPPLIER_EMAIL/PASSWORD not set');
    await login(page, supplier!.email, supplier!.password);
    await expect(page).toHaveURL(/\/supplier\/dashboard/);
  });

  test('admin can login to dashboard', async ({ page }) => {
    test.skip(!admin, 'ADMIN_EMAIL/PASSWORD not set');
    await login(page, admin!.email, admin!.password);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('payments page does not collect PAN/CVC', async ({ page }) => {
    test.skip(!customerA, 'STAGING_CUSTOMER_A_EMAIL/PASSWORD not set');
    await login(page, customerA!.email, customerA!.password);
    await page.goto('/user/payments');
    await expect(page.getByPlaceholder('1234 5678 9012 3456')).toHaveCount(0);
    await expect(page.locator('#payment-modal-cvc')).toHaveCount(0);
  });

  test('anonymous admin API is denied', async ({ request }) => {
    test.skip(!apiBase, 'ELOFIX_API_BASE_URL not set');
    const res = await request.get(`${apiBase}/admin/analytics`);
    expect([401, 403]).toContain(res.status());
  });

  test('customer token cannot call admin API', async ({ page, request }) => {
    test.skip(!apiBase || !customerA, 'ELOFIX_API_BASE_URL and STAGING_CUSTOMER_A credentials required');
    await login(page, customerA!.email, customerA!.password);
    const token = await sessionToken(page);
    expect(token).toBeTruthy();
    const res = await request.get(`${apiBase}/admin/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('anonymous private file is denied', async ({ request }) => {
    test.skip(!apiBase || !privateFileId, 'ELOFIX_API_BASE_URL and STAGING_PRIVATE_FILE_ID required');
    const res = await request.get(`${apiBase}/files/${privateFileId}`);
    expect([401, 403, 404]).toContain(res.status());
  });
});
