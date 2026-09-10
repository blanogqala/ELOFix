/**
 * Hosted two-browser Customer A ↔ Provider A chat on an existing paid job.
 * Does not mark complete, dispute, or settle payment.
 *
 * Required:
 *   ELOFIX_HOSTED_SMOKE=1
 *   PLAYWRIGHT_BASE_URL=https://elofix.co.za
 *   E2E_REALTIME_JOB_ID
 *   staging customer/provider credentials (or STAGING_SEED_PASSWORD)
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

test.describe('Hosted two-browser Customer A ↔ Provider A realtime', () => {
  test.skip(!hosted, 'Set ELOFIX_HOSTED_SMOKE=1');
  test.skip(!JOB_ID || !CUSTOMER_PASSWORD || !PROVIDER_PASSWORD, 'Job id and staging passwords required');
  test.setTimeout(120_000);

  let providerCtx: BrowserContext;
  let customerCtx: BrowserContext;
  let providerPage: Page;
  let customerPage: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    providerCtx = await browser.newContext();
    customerCtx = await browser.newContext();
    providerPage = await providerCtx.newPage();
    customerPage = await customerCtx.newPage();
    await login(providerPage, PROVIDER_EMAIL, PROVIDER_PASSWORD);
    await login(customerPage, CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  });

  test.afterAll(async () => {
    await providerCtx.close().catch(() => {});
    await customerCtx.close().catch(() => {});
  });

  test('customer chat appears on provider job page without reload', async () => {
    const ping = `PhaseB two-browser ${Date.now()}`;
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
  });
});
