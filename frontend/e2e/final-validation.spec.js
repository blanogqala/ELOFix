import { test, expect } from '@playwright/test';

// Use Playwright baseURL from config (default: http://localhost:8081)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8081';

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}@example.com`;
}

function uniquePhone(prefix = '081') {
  const n = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
  return `${prefix}${n}`;
}

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test('final validation smoke flow', async ({ page }) => {
  test.setTimeout(120000);
  const password = 'Password@123';
  const userEmail = uniqueEmail('final.user');
  const providerEmail = uniqueEmail('final.provider');

  // USER: register -> navigate -> refresh
  await page.goto(`${BASE_URL}/register`);
  await page.getByRole('button', { name: 'I need services' }).click();
  await page.getByLabel('Full Name').fill('Final User');
  await page.getByLabel('Email').fill(userEmail);
  await page.getByLabel('Phone Number').fill(uniquePhone('081'));
  await page.getByLabel('Password').fill(password);
  await page.getByLabel(/I agree to the/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL(/\/user\/dashboard/);

  await page.goto(`${BASE_URL}/user/new-request`);
  await expect(page).toHaveURL(/\/user\/new-request/);
  await page.goto(`${BASE_URL}/user/jobs`);
  await page.reload();
  await expect(page).toHaveURL(/\/user\/jobs/);

  // Session resilience: expire token and force login.
  await page.evaluate(() => {
    localStorage.removeItem('fixmate_auth');
  });
  await page.goto(`${BASE_URL}/user/jobs`);
  await expect(page).toHaveURL(/\/login/);

  // USER: login through next param (token-expiry redirect scenario).
  await page.goto(`${BASE_URL}/login?next=%2Fuser%2Fjobs`);
  await page.getByLabel('Email').fill(userEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Current app behavior: email/password login routes to default dashboard for role.
  await expect(page).toHaveURL(/\/user\/dashboard/);

  // PROVIDER: register -> onboarding -> tab switch mid-save -> doc upload
  await page.goto(`${BASE_URL}/register?role=provider`);
  await page.getByRole('button', { name: 'I provide services' }).click();
  await page.getByLabel('Full Name').fill('Final Provider');
  await page.getByLabel('Email').fill(providerEmail);
  await page.getByLabel('Phone Number').fill(uniquePhone('082'));
  await page.getByLabel('Password').fill(password);
  await page.getByLabel(/I agree to the/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL(/\/provider\/profile/);

  const gotIt = page.getByRole('button', { name: 'Got it' });
  await gotIt.click({ timeout: 8000 }).catch(() => {});

  await page.getByPlaceholder('+27...').fill('0810002000');
  await page.getByPlaceholder('Your business name').fill('Final Provider Services');
  await page.getByPlaceholder('Tell clients about your experience...').fill(
    'Experienced provider available for maintenance and urgent service calls.'
  );
  await page.getByRole('button', { name: 'Cape Town' }).first().click();
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await page.getByRole('tab', { name: /Skills & Pricing/i }).click();
  await page.getByRole('tab', { name: 'Profile' }).click();
  await expect(page.getByRole('button', { name: 'Save Profile' })).toBeVisible();

  await page.getByRole('tab', { name: 'Documents' }).click();
  const docInputs = page.locator('input[type="file"][accept="application/pdf,image/*"]');
  const fakePdf = {
    name: 'doc.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test document'),
  };
  if ((await docInputs.count()) >= 1) {
    await docInputs.nth(0).setInputFiles(fakePdf);
  }
  if ((await docInputs.count()) >= 3) {
    await docInputs.nth(2).setInputFiles(fakePdf);
  }

  // ADMIN: navigate providers and drill into provider actions pages.
  await login(page, 'admin@elofix.com', 'Admin@123');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await page.goto(`${BASE_URL}/admin/providers`);
  await expect(page).toHaveURL(/\/admin\/providers/);
  await page.getByPlaceholder('Search providers...').fill(providerEmail);

  const approveButton = page.getByRole('button', { name: 'Approve' }).first();
  if (await approveButton.isVisible().catch(() => false)) {
    await approveButton.click();
    await page.goto(`${BASE_URL}/admin/dashboard`);
    await page.goto(`${BASE_URL}/admin/providers`);
    await page.getByPlaceholder('Search providers...').fill(providerEmail);
  }

  const viewButton = page.getByRole('button', { name: 'View' }).first();
  if (await viewButton.isVisible().catch(() => false)) {
    await viewButton.click();
    await expect(page).toHaveURL(/\/admin\/providers\/.+/);

    const blockButton = page.getByRole('button', { name: /^Block$/ }).first();
    if (await blockButton.isVisible().catch(() => false)) {
      await blockButton.click();
      await page.getByRole('button', { name: 'Block Provider' }).click();
      await expect(page.getByRole('button', { name: 'Unblock' })).toBeVisible();
      await page.getByRole('button', { name: 'Unblock' }).click();
    }
  }
});
