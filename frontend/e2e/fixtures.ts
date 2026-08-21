import { test as base, expect, type Browser, type Page } from '@playwright/test';

export type Role = 'user' | 'provider' | 'admin' | 'supplier';

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
}

export function uniquePhone(prefix: string = '081') {
  // SA-style mobile format used across the UI; keep deterministic length.
  const n = Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, '0');
  return `${prefix}${n}`;
}

/** Build a checksum-valid 13-digit SA ID for E2E (not a real identity). */
export function uniqueValidSaId(): string {
  const yy = String(80 + (Date.now() % 15)).padStart(2, '0');
  const mm = String(1 + (Date.now() % 12)).padStart(2, '0');
  const dd = String(1 + (Date.now() % 28)).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  const first12 = `${yy}${mm}${dd}${seq}`.slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = parseInt(first12[i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${first12}${check}`;
}

export async function gotoApp(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

export async function logoutViaSidebar(page: Page) {
  // Works for DashboardLayout-based roles (user/provider/supplier/admin)
  const logoutButton = page.getByRole('button', { name: 'Logout' });
  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
    return;
  }
}

export async function login(page: Page, email: string, password: string) {
  await gotoApp(page, '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  const loginIntent = page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign In' }).click();
  const loginResp = await loginIntent;
  expect(loginResp.ok(), `login failed: ${loginResp.status()}`).toBeTruthy();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 });
  // RouteSuspense shows LoadingPage (aria-busy) — wait it out before callers navigate.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 }).catch(() => {});
}

export async function registerCustomer(page: Page, opts?: { name?: string; email?: string; password?: string }) {
  const email = opts?.email ?? uniqueEmail('e2e.user');
  const password = opts?.password ?? 'Password@123';
  await gotoApp(page, '/register');
  await page.getByRole('button', { name: 'I need services' }).click();
  await page.getByLabel('Full Name').fill(opts?.name ?? 'Test Customer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone Number').fill(uniquePhone());
  await page.getByLabel('Password').fill(password);
  await page.getByLabel(/I agree to the/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL(/\/user\/dashboard/, { timeout: 60_000 });
  return { email, password };
}

export async function registerProvider(page: Page, opts?: { name?: string; email?: string; password?: string }) {
  const email = opts?.email ?? uniqueEmail('e2e.provider');
  const password = opts?.password ?? 'Password@123';
  const name = opts?.name ?? 'Test Provider';
  await gotoApp(page, '/register?role=provider');
  await page.getByRole('button', { name: 'I provide services' }).click();
  await page.getByLabel('Full Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone Number').fill(uniquePhone('082'));
  await page.getByLabel('Password').fill(password);
  await page.getByLabel(/I agree to the/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();
  // Wait for profile redirect; fail fast on real validation toast only.
  try {
    await page.waitForURL(/\/provider\/profile/, { timeout: 60_000 });
  } catch {
    const toast = page.locator('[data-sonner-toast], [role="status"], .destructive').first();
    const msg = (await toast.textContent().catch(() => null)) || (await page.locator('body').innerText()).slice(0, 400);
    throw new Error(`Provider registration did not reach /provider/profile. Page hint: ${msg}`);
  }
  return { email, password, name };
}

/**
 * Register, complete profile (Cape Town + Plumbing skill + docs), admin-approve docs + account.
 * Must run before the customer wizard so the provider appears in discovery.
 */
export async function setupApprovedProviderForE2E(
  browser: Browser,
  opts?: { skillName?: string; name?: string }
) {
  const apiBase = process.env.ELOFIX_API_BASE_URL || 'http://localhost:5000/api';
  const skillName = opts?.skillName ?? 'Plumbing';
  // Names must be letters-only (registration validation rejects digits).
  const name = opts?.name ?? 'Test Provider';
  // Unique per run so wizard Select cannot pick a stale "Test Provider" from prior E2E jobs.
  const businessName = `${name} ${Date.now().toString(36)}`;
  const providerCtx = await browser.newContext();
  const providerPage = await providerCtx.newPage();
  const provider = await registerProvider(providerPage, { name });

  const gotIt = providerPage.getByRole('button', { name: 'Got it' });
  await gotIt.click({ timeout: 8_000 }).catch(() => {});

  // Profile info — use a unique phone (hardcoded numbers collide across E2E runs).
  const profilePhone = uniquePhone('083');
  await providerPage.getByPlaceholder('+27...').fill(profilePhone);
  await providerPage.getByPlaceholder(/Your business name/i).fill(businessName);
  await providerPage.getByPlaceholder('13-digit South African ID').fill(uniqueValidSaId());
  await providerPage.getByPlaceholder('CIPC registration number').fill(`CIPC-${Date.now()}`);
  await providerPage.getByPlaceholder('Tell clients about your experience...').fill(
    'Experienced provider available for maintenance and urgent service calls in Cape Town metro.'
  );
  await providerPage.getByRole('button', { name: 'Cape Town' }).first().click();
  // Confirm a service-area chip appeared; if not, type/add Cape Town manually.
  const capeChip = providerPage.getByText('Cape Town').first();
  if (!(await capeChip.isVisible().catch(() => false))) {
    await providerPage.getByPlaceholder(/Sandton|service area/i).fill('Cape Town');
    await providerPage.getByRole('button', { name: 'Add area' }).click();
  }
  const profileSave = providerPage.waitForResponse(
    (r) =>
      r.url().includes('/providers/') &&
      (r.request().method() === 'PUT' || r.request().method() === 'PATCH'),
    { timeout: 30_000 }
  );
  await providerPage.getByRole('button', { name: 'Save Profile' }).click();
  const saved = await profileSave;
  expect(saved.ok(), `Save Profile failed: ${saved.status()} ${await saved.text()}`).toBeTruthy();
  await expect(providerPage.getByText('Profile saved', { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });

  // Skills & Pricing — select Plumbing (or requested skill)
  await providerPage.getByRole('tab', { name: /Skills/i }).click();
  await providerPage.getByRole('button', { name: skillName }).click();
  const skillsSave = providerPage.waitForResponse(
    (r) => r.url().includes('/providers/') && (r.request().method() === 'PUT' || r.request().method() === 'PATCH'),
    { timeout: 30_000 }
  ).catch(() => null);
  await providerPage.getByRole('button', { name: /Save Skills/i }).click();
  await skillsSave;

  // Documents — unique PDF bytes per upload (fraud hash rejects identical verified docs).
  await providerPage.getByRole('tab', { name: /Documents/i }).click();
  const docInputs = providerPage.locator(
    'input[type="file"][accept*="application/pdf"], input[type="file"][accept*="image"]'
  );
  const count = await docInputs.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < 3; i++) {
    const uniquePdf = {
      name: `doc-${Date.now()}-${i}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(
        `%PDF-1.4\n% e2e verification document ${Date.now()}-${Math.random()}-${i}\n%%EOF\n`
      ),
    };
    const uploadResp = providerPage.waitForResponse(
      (r) => r.url().includes('/documents') && r.request().method() === 'POST',
      { timeout: 60_000 }
    );
    await docInputs.nth(i).setInputFiles(uniquePdf);
    const resp = await uploadResp;
    expect(resp.ok(), `document upload ${i} failed: ${resp.status()} ${await resp.text()}`).toBeTruthy();
  }
  await expect(providerPage.getByText(/Pending review/i).first()).toBeVisible({ timeout: 30_000 });

  // Payout & Banking — required for profileCompleted (ProviderWithdrawalProfile row).
  await providerPage.getByRole('button', { name: /Save Documents & Continue/i }).click();
  await providerPage.getByRole('tab', { name: /Payout/i }).click();
  await expect(providerPage.locator('#payout-holder')).toBeVisible({ timeout: 30_000 });
  const uniqueAccountTail = String(Date.now()).slice(-8).padStart(8, '0');
  await providerPage.locator('#payout-holder').fill(name);
  await providerPage.locator('#payout-bank').fill('First National Bank');
  await providerPage.locator('#payout-account').fill(`62${uniqueAccountTail}`);
  await providerPage.locator('#payout-branch').fill('250655');
  await providerPage.getByRole('combobox').click();
  await providerPage.getByRole('option', { name: 'Savings' }).click();
  const payoutSave = providerPage.waitForResponse(
    (r) => r.url().includes('/withdrawal-profile') && r.request().method() === 'PUT',
    { timeout: 30_000 }
  );
  await providerPage.getByRole('button', { name: /Save & Continue/i }).click();
  const payoutResp = await payoutSave;
  expect(
    payoutResp.ok(),
    `Save payout banking failed: ${payoutResp.status()} ${await payoutResp.text()}`
  ).toBeTruthy();
  // Save & Continue advances to Work Posts; toast may already be gone — assert completion mark.
  await expect(providerPage.getByRole('tab', { name: /Payout.*✅/i })).toBeVisible({
    timeout: 15_000,
  });

  // Settings — business hours must be persisted (default Mon–Fri enabled in UI).
  await providerPage.getByRole('tab', { name: /^Settings/i }).click();
  const settingsSave = providerPage.waitForResponse(
    (r) =>
      r.url().includes('/providers/') &&
      (r.request().method() === 'PUT' || r.request().method() === 'PATCH'),
    { timeout: 30_000 }
  );
  await providerPage.getByRole('button', { name: /Save Settings/i }).click();
  const settingsResp = await settingsSave;
  expect(
    settingsResp.ok(),
    `Save Settings failed: ${settingsResp.status()} ${await settingsResp.text()}`
  ).toBeTruthy();
  await expect(
    providerPage.getByText(/Profile complete|Settings saved/i).first()
  ).toBeVisible({ timeout: 15_000 });

  // Submit for review (enabled once backend profileCompleted is true)
  const submitReview = providerPage.getByRole('button', { name: /Submit for review/i });
  await expect(submitReview).toBeVisible({ timeout: 60_000 });
  await expect(submitReview).toBeEnabled({ timeout: 60_000 });
  await submitReview.click();
  await expect(providerPage.getByText('Submitted for review', { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  // Admin API: find provider by email, approve docs + account
  const adminLogin = await providerCtx.request.post(`${apiBase}/auth/login`, {
    data: { email: 'admin@elofix.com', password: 'Admin@123' },
  });
  expect(adminLogin.ok(), `admin login failed: ${adminLogin.status()}`).toBeTruthy();
  const adminBody = (await adminLogin.json()) as { token?: string };
  expect(adminBody.token, 'admin token missing').toBeTruthy();
  const authHeaders = { Authorization: `Bearer ${adminBody.token}` };

  const listRes = await providerCtx.request.get(`${apiBase}/admin/providers`, { headers: authHeaders });
  expect(listRes.ok(), `list providers failed: ${listRes.status()}`).toBeTruthy();
  const listBody = (await listRes.json()) as {
    providers?: Array<{ id?: string; userId?: string; email?: string; user?: { id?: string; email?: string } }>;
  };
  const match = (listBody.providers || []).find((p) => {
    const email = String(p.email || p.user?.email || '').toLowerCase();
    return email === provider.email.toLowerCase();
  });
  const providerUserId = String(match?.userId || match?.user?.id || match?.id || '');
  if (!providerUserId) {
    throw new Error(`Approved-setup: provider ${provider.email} not found in admin list`);
  }

  for (const docType of ['idDoc', 'companyReg', 'proofOfAddress']) {
    const docRes = await providerCtx.request.patch(
      `${apiBase}/admin/providers/${providerUserId}/documents/${docType}/approve`,
      { headers: authHeaders }
    );
    expect(docRes.ok(), `approve ${docType} failed: ${docRes.status()} ${await docRes.text()}`).toBeTruthy();
  }

  const approveRes = await providerCtx.request.patch(
    `${apiBase}/admin/providers/${providerUserId}/approve`,
    { headers: authHeaders }
  );
  expect(approveRes.ok(), `approve provider failed: ${approveRes.status()} ${await approveRes.text()}`).toBeTruthy();
  const approvedBody = (await approveRes.json()) as { provider?: { approved?: boolean; profileCompleted?: boolean } };
  expect(approvedBody.provider?.approved).toBe(true);
  expect(approvedBody.provider?.profileCompleted).toBe(true);

  // Prove the provider is discoverable for Plumbing + Cape Town before the customer wizard runs.
  const discover = await providerCtx.request.get(
    `${apiBase}/providers?category=plumbing&city=${encodeURIComponent('Cape Town')}`
  );
  expect(discover.ok()).toBeTruthy();
  const discoverBody = (await discover.json()) as { providers?: Array<{ email?: string; name?: string }> };
  const found = (discoverBody.providers || []).some(
    (p) => String(p.email || '').toLowerCase() === provider.email.toLowerCase()
  );
  expect(
    found,
    `Provider ${provider.email} approved but not returned by /providers?category=plumbing&city=Cape Town`
  ).toBeTruthy();

  return {
    email: provider.email,
    password: provider.password,
    name,
    businessName,
    providerUserId,
    providerCtx,
    providerPage,
  };
}

export async function ensureCustomerHasSavedCard(page: Page) {
  // Block 5: EloFix no longer collects raw card data. Tokenisation is not active yet.
  await gotoApp(page, '/user/payments');
  await expect(page.getByRole('heading', { name: /Payments/i })).toBeVisible();
  await expect(
    page.getByText(/Saved payment methods will be managed securely through our payment service provider/i)
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Add New Card/i })).toHaveCount(0);
  await expect(page.getByPlaceholder('1234 5678 9012 3456')).toHaveCount(0);
}

export async function completePaymentInTest(page: Page, opts: { clickPayButton: () => Promise<void> }) {
  // The UI starts a payment intent then redirects to an external provider (form POST).
  // In E2E, block that navigation, capture intentId, and land on the in-app return page.
  await page.evaluate(() => {
    HTMLFormElement.prototype.submit = function () {
      /* no-op: prevent PayFast/checkout navigation during E2E */
    };
  });

  let intentId: string | undefined;
  await page.route('**/payments/intents', async (route) => {
    if (route.request().method() !== 'POST' || route.request().url().includes('/confirm')) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as { intentId?: string };
      intentId = parsed.intentId || intentId;
    } catch {
      /* ignore parse errors; waitForResponse path below may still work */
    }
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body,
    });
  });

  try {
    const intentResponsePromise = page.waitForResponse(
      (r) =>
        r.url().includes('/payments/intents') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/confirm')
    );

    // Block 5: EloFix must not collect PAN/CVC before hosted redirect.
    await expect(page.locator('#payment-modal-cvc')).toHaveCount(0);
    await expect(page.getByPlaceholder('1234 5678 9012 3456')).toHaveCount(0);
    await expect(page.getByLabel(/CVC|CVV|Security Code/i)).toHaveCount(0);

    // Block 4: legal checkbox starts unchecked and must be accepted.
    const legalCheckbox = page.getByRole('checkbox').first();
    await expect(legalCheckbox).toBeVisible({ timeout: 15_000 });
    await expect(legalCheckbox).toHaveAttribute('aria-checked', 'false');
    const payBefore = page.getByRole('button', { name: /Pay .+ securely|^Pay /i }).last();
    await expect(payBefore).toBeDisabled();
    await legalCheckbox.click();
    await expect(legalCheckbox).toHaveAttribute('aria-checked', 'true');
    await expect(payBefore).toBeEnabled();

    await opts.clickPayButton();
    const resp = await intentResponsePromise;
    if (!intentId) {
      try {
        const json = (await resp.json()) as { intentId?: string };
        intentId = json.intentId;
      } catch {
        /* body may be unavailable if a navigation still raced; rely on route capture */
      }
    }
    if (!intentId) throw new Error('Missing intentId from /payments/intents response');
    await gotoApp(page, `/payments/return?intentId=${encodeURIComponent(intentId)}`);
    await expect(page).toHaveURL(/\/payments\/return\?intentId=/);
  } finally {
    await page.unroute('**/payments/intents').catch(() => {});
  }
}

export const test = base;
export { expect };
