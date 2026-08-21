import { expect, test } from '@playwright/test';

test.describe('Block 6 production metadata', () => {
  test('homepage document head is EloFix-branded with no Lovable traces', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    await expect(page).toHaveTitle(/EloFix/);
    await expect(page).not.toHaveTitle(/Lovable|Vite App|React App/i);

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      'content',
      /LITI Holdings \(Pty\) Ltd.*independent service providers.*material suppliers/i,
    );

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.elofix.co.za/',
    );

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      /EloFix/,
    );
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      /LITI Holdings \(Pty\) Ltd/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://www.elofix.co.za/hero-background.png',
    );
    await expect(page.locator('meta[property="og:image"]')).not.toHaveAttribute(
      'content',
      /lovable\.dev/i,
    );

    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
      'content',
      /EloFix/,
    );
    await expect(page.locator('meta[name="twitter:site"]')).toHaveCount(0);
    await expect(page.locator('meta[name="twitter:creator"]')).toHaveCount(0);

    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.ico');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#0A2540',
    );

    expect(consoleErrors.filter((m) => !/ResizeObserver|favicon/i.test(m))).toEqual([]);
  });

  test('desktop and mobile viewports load without layout crash', async ({ page }) => {
    for (const size of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await page.goto('/');
      await expect(page.locator('#root')).toBeVisible();
      await expect(page).toHaveTitle(/EloFix/);
    }
  });
});
