import type { Page } from '@playwright/test';
import { expect, test, registerCustomer, registerProvider } from './fixtures';

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('installable PWA', () => {
  test('manifest launches standalone and offline page is a static file', async ({ request }) => {
    const manifestResponse = await request.get('/site.webmanifest');
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.background_color).toBe('#0A2540');
    expect(manifest.theme_color).toBe('#0A2540');
    const sizes = (manifest.icons as Array<{ sizes: string; purpose: string }>).map(
      (icon) => `${icon.purpose}:${icon.sizes}`,
    );
    expect(sizes).toEqual(expect.arrayContaining(['any:192x192', 'any:512x512', 'maskable:512x512']));

    const offline = await request.get('/offline.html');
    expect(offline.ok()).toBeTruthy();
    expect(offline.headers()['content-type'] || '').toContain('text/html');
    const html = await offline.text();
    expect(html).toContain('You are offline');
    expect(html).not.toContain('id="root"');
  });
});

test.describe('iPhone install guidance', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });

  test('explains Add to Home Screen once, then stays dismissed', async ({ page }) => {
    await page.goto('/');
    const guidance = page.getByRole('region', { name: 'Install EloFix' });
    await expect(guidance).toBeVisible();
    await expect(guidance).toContainText('Add to Home Screen');
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(guidance).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Install EloFix' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('mobile customer booking and provider jobs', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('customer booking entry and service step fit the screen', async ({ page }) => {
    await registerCustomer(page);
    await page.goto('/user/new-request');
    await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('heading', { name: 'Request a Service' }).click();
    await expect(page).toHaveURL(/\/user\/request\/service/);
    await expect(page.getByRole('heading', { name: /What service do you need/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Service Location' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('provider jobs list fits the screen', async ({ page }) => {
    await registerProvider(page);
    await page.goto('/provider/jobs');
    await expect(page.getByRole('heading', { name: 'Active Jobs' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('link', { name: 'Requests' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
