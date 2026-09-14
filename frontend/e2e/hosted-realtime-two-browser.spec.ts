/**
 * Hosted two-browser Customer A ↔ Provider A realtime.
 * Detects the previous hosted failure mode: /socket.io 502 (often reported as CORS).
 * Does not mark complete, dispute, or settle payment.
 *
 * Required:
 *   ELOFIX_HOSTED_SMOKE=1
 *   PLAYWRIGHT_BASE_URL=https://elofix.co.za
 *   E2E_REALTIME_JOB_ID
 *   ELOFIX_SOCKET_BASE_URL or VITE_API_ORIGIN or ELOFIX_API_BASE_URL (Render API origin)
 *   staging customer/provider credentials (or STAGING_SEED_PASSWORD)
 *
 * Run:
 *   npm run e2e:hosted-realtime
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { login } from './fixtures';

const hosted = process.env.ELOFIX_HOSTED_SMOKE === '1';
const JOB_ID = String(process.env.E2E_REALTIME_JOB_ID || '').trim();
const CUSTOMER_EMAIL = String(process.env.STAGING_CUSTOMER_A_EMAIL || 'staging.customer.a@elofix.test').trim();
const PROVIDER_EMAIL = String(process.env.STAGING_PROVIDER_A_EMAIL || 'staging.provider.a@elofix.test').trim();
const CUSTOMER_PASSWORD = String(
  process.env.STAGING_CUSTOMER_A_PASSWORD || process.env.STAGING_SEED_PASSWORD || '',
).trim();
const PROVIDER_PASSWORD = String(
  process.env.STAGING_PROVIDER_A_PASSWORD || process.env.STAGING_SEED_PASSWORD || '',
).trim();

function socketApiOrigin(): string {
  const raw = String(
    process.env.ELOFIX_SOCKET_BASE_URL ||
      process.env.VITE_API_ORIGIN ||
      process.env.ELOFIX_API_BASE_URL ||
      '',
  ).trim();
  return raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
}

function attachSocketIoFailureWatcher(page: Page, bucket: { url: string; status: number }[]) {
  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/socket.io')) return;
    const status = res.status();
    if (status >= 500 || status === 0) {
      bucket.push({ url: url.split('?')[0], status });
    }
  });
}

test.describe('Hosted two-browser Customer A ↔ Provider A realtime', () => {
  test.skip(!hosted, 'Set ELOFIX_HOSTED_SMOKE=1');
  test.skip(!JOB_ID || !CUSTOMER_PASSWORD || !PROVIDER_PASSWORD, 'Job id and staging passwords required');
  test.setTimeout(120_000);

  let providerCtx: BrowserContext;
  let customerCtx: BrowserContext;
  let providerPage: Page;
  let customerPage: Page;
  const socketFailures: { url: string; status: number }[] = [];

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    providerCtx = await browser.newContext();
    customerCtx = await browser.newContext();
    providerPage = await providerCtx.newPage();
    customerPage = await customerCtx.newPage();
    attachSocketIoFailureWatcher(providerPage, socketFailures);
    attachSocketIoFailureWatcher(customerPage, socketFailures);
    await login(providerPage, PROVIDER_EMAIL, PROVIDER_PASSWORD);
    await login(customerPage, CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  });

  test.afterAll(async () => {
    await providerCtx.close().catch(() => {});
    await customerCtx.close().catch(() => {});
  });

  test('Socket.IO handshake is not 5xx/502', async ({ request }) => {
    const origin = socketApiOrigin();
    test.skip(!origin, 'Set ELOFIX_SOCKET_BASE_URL or VITE_API_ORIGIN to the Render API origin');
    const res = await request.get(`${origin}/socket.io/?EIO=4&transport=polling`, {
      timeout: 20_000,
    });
    expect(res.status(), `Socket.IO handshake HTTP ${res.status()} (502 is the prior hosted failure)`).toBeLessThan(
      500,
    );
    expect(res.status(), 'Socket.IO must not return 502 Bad Gateway').not.toBe(502);
  });

  test('customer chat appears on provider job page without reload', async () => {
    const ping = `PhaseE2 two-browser ${Date.now()}`;
    await providerPage.goto(`/provider/jobs/${JOB_ID}`, { waitUntil: 'domcontentloaded' });
    await customerPage.goto(`/user/jobs/${JOB_ID}?tab=messages`, { waitUntil: 'domcontentloaded' });
    await expect(providerPage).toHaveURL(new RegExp(`/provider/jobs/${JOB_ID}`), { timeout: 30_000 });
    await expect(customerPage).toHaveURL(new RegExp(`/user/jobs/${JOB_ID}`), { timeout: 30_000 });
    await expect(providerPage.getByRole('heading', { name: /plumbing/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(customerPage.getByRole('heading', { name: /plumbing/i }).first()).toBeVisible({
      timeout: 60_000,
    });

    await customerPage.evaluate(() => {
      (window as unknown as Record<string, boolean>).__elofix_no_reload_marker = true;
    });
    await providerPage.evaluate(() => {
      (window as unknown as Record<string, boolean>).__elofix_no_reload_marker = true;
    });

    const composer = customerPage.getByPlaceholder('Type a message...');
    await expect(composer).toBeVisible({ timeout: 20_000 });
    await composer.fill(ping);
    await composer.locator('xpath=following-sibling::button[1]').click();
    await expect(customerPage.getByText(ping).first()).toBeVisible({ timeout: 20_000 });

    await expect(providerPage.getByText(ping).first()).toBeVisible({ timeout: 20_000 });

    const customerKept = await customerPage.evaluate(
      () => (window as unknown as Record<string, boolean>).__elofix_no_reload_marker === true,
    );
    const providerKept = await providerPage.evaluate(
      () => (window as unknown as Record<string, boolean>).__elofix_no_reload_marker === true,
    );
    expect(customerKept, 'customer page reloaded').toBe(true);
    expect(providerKept, 'provider page reloaded').toBe(true);

    const socket502 = socketFailures.filter((f) => f.status === 502);
    expect(socket502, `socket.io 502 responses: ${JSON.stringify(socket502)}`).toEqual([]);
    const socket5xx = socketFailures.filter((f) => f.status >= 500);
    expect(socket5xx, `socket.io 5xx responses: ${JSON.stringify(socket5xx)}`).toEqual([]);

    await providerPage.context().setOffline(true);
    await providerPage.waitForTimeout(800);
    await providerPage.context().setOffline(false);

    const ping2 = `PhaseE2 reconnect ${Date.now()}`;
    await composer.fill(ping2);
    await composer.locator('xpath=following-sibling::button[1]').click();
    await expect(providerPage.getByText(ping2).first()).toBeVisible({ timeout: 25_000 });

    const providerKeptAfterReconnect = await providerPage.evaluate(
      () => (window as unknown as Record<string, boolean>).__elofix_no_reload_marker === true,
    );
    expect(providerKeptAfterReconnect, 'provider page reloaded after reconnect').toBe(true);
  });
});
