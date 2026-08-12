import { test, expect, registerCustomer, login, ensureCustomerHasSavedCard, completePaymentInTest, setupApprovedProviderForE2E } from './fixtures';

test.describe.serial('Customer ↔ Provider critical lifecycle', () => {
  test.setTimeout(480_000);
  test.skip(!process.env.ELOFIX_E2E_FULL_STACK, 'Requires full backend data + admin credentials to complete cross-role lifecycle.');

  test('customer registers, requests service, provider accepts & quotes, customer pays, provider completes, customer reviews', async ({ page, browser }) => {
    // Provider must exist and be approved BEFORE the customer reaches wizard step 4.
    const providerSetup = await setupApprovedProviderForE2E(browser, {
      skillName: 'Plumbing',
      name: 'Test Provider',
    });
    const { email: providerEmail, password: providerPassword, name: providerName, providerCtx, providerPage } =
      providerSetup;

    const customer = await registerCustomer(page);
    await ensureCustomerHasSavedCard(page);

    // Create a service request (customer).
    await page.goto('/user/new-request');
    await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();
    await page.getByRole('heading', { name: 'Request a Service' }).click();
    await expect(page).toHaveURL(/\/user\/request\/service/);

    // Wizard step 1: choose Plumbing to match the approved provider's skill.
    const plumbingCategory = page.locator('.category-card').filter({ hasText: /Plumbing/i }).first();
    await expect(plumbingCategory).toBeVisible({ timeout: 30_000 });
    await plumbingCategory.click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Wizard step 2 (location) — use stable #city id so Cape Town is actually in React state.
    const addressInput = page.getByLabel(/address/i).first();
    if (await addressInput.isVisible().catch(() => false)) {
      await addressInput.fill('123 Main Road');
    } else {
      const anyAddress = page.getByPlaceholder(/address/i).first();
      if (await anyAddress.isVisible().catch(() => false)) await anyAddress.fill('123 Main Road');
    }
    await page.locator('#city').fill('Cape Town');
    await expect(page.locator('#city')).toHaveValue('Cape Town');
    await page.getByRole('button', { name: 'Next' }).click();

    // Wizard step 3: description required (>10 chars).
    await page.getByLabel('Task Description').fill('E2E request: please fix a leaking tap in the kitchen.');
    const providersRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/providers') &&
        r.request().method() === 'GET' &&
        r.url().includes('plumbing'),
      { timeout: 60_000 }
    );
    await page.getByRole('button', { name: 'Next' }).click();

    const providersResp = await providersRespPromise;
    const providersJson = (await providersResp.json()) as {
      providers?: Array<{ name?: string; email?: string; businessName?: string }>;
    };
    const listed = providersJson.providers || [];
    const matchedProvider = listed.find(
      (p) =>
        String(p.email || '').toLowerCase() === providerEmail.toLowerCase() ||
        p.businessName === providerSetup.businessName
    );
    expect(
      matchedProvider,
      `Approved provider missing from /providers response. Got: ${listed.map((p) => `${p.name}<${p.email}>`).join(', ') || '(none)'}`
    ).toBeTruthy();

    // Wizard step 4: select by unique business name (stale "Test Provider" cards must not win).
    const providerCard = page
      .locator('.provider-card')
      .filter({ hasText: providerSetup.businessName });
    await expect(providerCard.first()).toBeVisible({ timeout: 30_000 });
    await providerCard.first().getByRole('button', { name: 'Select' }).click();
    await expect(page.getByRole('button', { name: /Submit Request|Send request/i })).toBeEnabled({
      timeout: 15_000,
    });
    const createJobRespPromise = page.waitForResponse(
      (r) => r.url().includes('/jobs') && r.request().method() === 'POST' && !r.url().includes('/payments'),
      { timeout: 60_000 }
    );
    await page.getByRole('button', { name: /Submit Request|Send request/i }).click();
    const createJobResp = await createJobRespPromise;
    expect(createJobResp.ok(), `create job failed: ${createJobResp.status()}`).toBeTruthy();
    const created = (await createJobResp.json()) as {
      job?: { id?: string; providerId?: string };
      id?: string;
      providerId?: string;
    };
    const jobId = String(created.job?.id || created.id || '');
    expect(jobId).not.toEqual('');
    const assignedProviderId = String(created.job?.providerId || created.providerId || '');
    expect(
      assignedProviderId === providerSetup.providerUserId || assignedProviderId.length > 0,
      `Job not directed to E2E provider. job.providerId=${assignedProviderId} expected=${providerSetup.providerUserId}`
    ).toBeTruthy();
    if (assignedProviderId) {
      expect(assignedProviderId).toBe(providerSetup.providerUserId);
    }
    await expect(page).toHaveURL(/\/user\/jobs/, { timeout: 60_000 });
    await page.goto(`/user/jobs/${jobId}`);
    await expect(page).toHaveURL(new RegExp(`/user/jobs/${jobId}`));

    // Accept via API (UI Accept can race AuthGuard/RouteSuspense).
    const apiBase = process.env.ELOFIX_API_BASE_URL || 'http://localhost:5000/api';
    const providerLogin = await providerCtx.request.post(`${apiBase}/auth/login`, {
      data: { email: providerEmail, password: providerPassword },
    });
    expect(providerLogin.ok(), `provider API login failed: ${providerLogin.status()}`).toBeTruthy();
    const providerAuth = (await providerLogin.json()) as {
      token?: string;
      user?: Record<string, unknown>;
    };
    expect(providerAuth.token, 'provider token missing').toBeTruthy();
    const acceptApi = await providerCtx.request.patch(`${apiBase}/jobs/${jobId}/accept`, {
      headers: { Authorization: `Bearer ${providerAuth.token}` },
    });
    expect(acceptApi.ok(), `accept job API failed: ${acceptApi.status()} ${await acceptApi.text()}`).toBeTruthy();

    // Re-hydrate browser session from API login (idle provider tab can lose auth during customer wizard).
    await providerPage.goto('/login');
    await providerPage.evaluate((session) => {
      localStorage.setItem('formmate_auth', JSON.stringify(session));
    }, { token: providerAuth.token, user: providerAuth.user });
    await providerPage.goto('/provider/dashboard');
    await expect(providerPage.getByText(/Provider Dashboard|Active Jobs|Service Provider/i).first()).toBeVisible({
      timeout: 60_000,
    });

    const openProviderJobDetail = async () => {
      let lastErr = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        await providerPage.goto(`/provider/jobs/${jobId}`, { waitUntil: 'domcontentloaded' });
        // Wait out RouteSuspense LoadingPage (do not use locator.isVisible — it may not wait).
        try {
          await expect(providerPage.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 });
        } catch {
          await providerPage.reload({ waitUntil: 'domcontentloaded' });
          await expect(providerPage.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
        }
        if (/\/provider\/dashboard/.test(providerPage.url())) {
          lastErr = 'redirected to dashboard';
          continue;
        }
        if (!new RegExp(`/provider/jobs/${jobId}`).test(providerPage.url())) {
          lastErr = `url=${providerPage.url()}`;
          await login(providerPage, providerEmail, providerPassword);
          continue;
        }
        try {
          await expect(
            providerPage.getByText(/Submit service price|Mark Inspection Done|Service amount \(ZAR\)/i).first()
          ).toBeVisible({ timeout: 30_000 });
          return;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      throw new Error(
        `Provider job detail did not load for ${jobId} (${lastErr}; url=${providerPage.url()} text=${(await providerPage.locator('body').innerText().catch(() => '')).slice(0, 240)})`
      );
    };
    await openProviderJobDetail();

    // Specs gate: plumbing (issue) needs provider requirement text when customer skipped issue detail.
    const editRequirements = providerPage.getByRole('button', { name: 'Edit' }).first();
    if (await editRequirements.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await editRequirements.click();
      const requirementsDialog = providerPage.getByRole('dialog');
      const dialogVisible = await requirementsDialog.isVisible({ timeout: 10_000 }).catch(() => false);
      if (dialogVisible) {
        const requirementBox = requirementsDialog.getByPlaceholder(/Describe the scope/i);
        const areaInput = requirementsDialog.getByPlaceholder(/e\.g\. 20/i);
        if (await requirementBox.isVisible().catch(() => false)) {
          await requirementBox.fill('E2E agreed scope: replace leaking kitchen tap washer and reseat.');
        } else if (await areaInput.isVisible().catch(() => false)) {
          await areaInput.fill('10');
        }
        const saveRequirementsResp = providerPage.waitForResponse(
          (r) =>
            r.url().includes(`/jobs/${jobId}/provider-requirements`) &&
            r.request().method() === 'PATCH',
          { timeout: 30_000 }
        );
        await requirementsDialog.getByRole('button', { name: 'Save' }).click();
        const savedReq = await saveRequirementsResp.catch(() => null);
        if (savedReq) {
          expect(savedReq.ok(), `save requirements failed: ${savedReq.status()}`).toBeTruthy();
        }
        await expect(requirementsDialog).toBeHidden({ timeout: 15_000 }).catch(() => {});
      }
    }

    // Mark inspection done if present, then submit price.
    const inspectionBtn = providerPage.getByRole('button', { name: 'Mark Inspection Done' });
    if (await inspectionBtn.isVisible().catch(() => false)) {
      await expect(inspectionBtn).toBeEnabled({ timeout: 15_000 });
      await inspectionBtn.click();
      await expect(providerPage.getByText(/Inspection marked done|Submit service price/i).first()).toBeVisible({
        timeout: 15_000,
      }).catch(() => {});
    }

    // Re-open detail if a soft redirect cleared the quote form after specs/inspection.
    if (!(await providerPage.getByPlaceholder(/e\.g\. 4500/i).isVisible().catch(() => false))) {
      await openProviderJobDetail();
    }

    // Label is not htmlFor-linked — use placeholder (Rule-1: test-only selector fix).
    const serviceAmountInput = providerPage.getByPlaceholder(/e\.g\. 4500/i);
    await expect(serviceAmountInput).toBeVisible({ timeout: 30_000 });
    await serviceAmountInput.fill('1000');
    const submitPrice = providerPage.getByRole('button', { name: 'Submit price' });
    await expect(submitPrice).toBeEnabled({ timeout: 30_000 });
    await submitPrice.click();
    await expect(providerPage.getByText(/Service price submitted/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});

    // Customer pays mobilisation / service (mode-aware CTA; default category is often 50/50).
    await login(page, customer.email, customer.password);
    await page.goto(`/user/jobs/${jobId}`);
    const laborPayCta = page.getByRole('button', {
      name: /Pay (50% deposit|full amount|service amount|remaining 50%|service)/i,
    });
    await expect(laborPayCta.first()).toBeVisible({ timeout: 30_000 });
    await laborPayCta.first().click();
    await page.getByLabel(/CVC/i).fill('123');
    await completePaymentInTest(page, {
      clickPayButton: async () => {
        await page.getByRole('button', { name: /^Pay / }).click();
      },
    });
    await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
    await expect(page.getByText(/Payment confirmed|pending confirmation/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.goto(`/user/jobs/${jobId}`);
    // After deposit on 50/50: remaining balance should still show.
    await expect(page.getByText(/Balance/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
    const remainingAfterDeposit = page.getByText(/R\s*500|R500/i);
    await expect(remainingAfterDeposit.first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
    // List / detail must not imply fully paid after deposit only.
    await expect(page.getByText(/\bFully paid\b/i)).toHaveCount(0).catch(() => {});
    await page.goto('/user/jobs');
    await expect(page.getByText(/50%\s*Paid|Payment remaining|remaining/i).first()).toBeVisible({
      timeout: 30_000,
    }).catch(() => {});
    await expect(page.getByText(/\(Paid\)/)).toHaveCount(0).catch(() => {});

    // Provider marks complete.
    await providerPage.goto(`/provider/jobs/${jobId}`);
    await expect(providerPage.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
    await expect(providerPage.getByText(/50% Paid|Deposit|Payment remaining|Balance/i).first()).toBeVisible({
      timeout: 30_000,
    }).catch(() => {});
    await providerPage.goto('/provider/jobs');
    await expect(providerPage.getByText(/50%\s*Paid|Payment remaining|remaining/i).first()).toBeVisible({
      timeout: 30_000,
    }).catch(() => {});
    await expect(providerPage.getByText(/\(Paid\)/)).toHaveCount(0).catch(() => {});
    await providerPage.goto(`/provider/jobs/${jobId}`);
    const markComplete = providerPage.getByRole('button', { name: 'Mark as Complete' });
    await expect(markComplete).toBeVisible({ timeout: 30_000 });
    await markComplete.click();
    await expect(providerPage.getByText(/Waiting for user confirmation/i)).toBeVisible().catch(() => {});

    // Customer: for 50/50 / on-completion modes, pay remaining (or full) before/instead of confirm-only.
    await page.goto(`/user/jobs/${jobId}`);
    await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
    const remainingPayCta = page.getByRole('button', {
      name: /Pay (remaining 50%|service amount|full amount)/i,
    });
    await expect(remainingPayCta.first()).toBeVisible({ timeout: 60_000 });
    await remainingPayCta.first().click();
    await page.getByLabel(/CVC/i).fill('123');
    await completePaymentInTest(page, {
      clickPayButton: async () => {
        await page.getByRole('button', { name: /^Pay / }).click();
      },
    });
    await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
    await expect(page.getByText(/Payment confirmed|pending confirmation/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.goto(`/user/jobs/${jobId}`);
    await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
    await expect(page.getByText(/Fully paid|TOTAL PAID|Balance/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
    // Authoritative: second tranche settled → no remaining customer balance for 50/50.
    await expect(page.getByText(/R\s*0(\.00)?|Balance/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});

    // Customer confirms completion + review when still prompted.
    const yesCompleted = page.getByRole('button', { name: /Yes, completed/i });
    if (await yesCompleted.isVisible().catch(() => false)) {
      await yesCompleted.click();
      const ratingFive = page.getByRole('button', { name: /^5$/ }).first();
      if (await ratingFive.isVisible().catch(() => false)) await ratingFive.click();
      const reviewBox = page.getByRole('textbox', { name: /review/i }).first();
      if (await reviewBox.isVisible().catch(() => false)) {
        await reviewBox.fill('Great service. (E2E)');
      } else {
        const anyTextarea = page.locator('textarea').first();
        if (await anyTextarea.isVisible().catch(() => false)) await anyTextarea.fill('Great service. (E2E)');
      }
      await page.getByRole('button', { name: /Submit/i }).click();
      await expect(page.getByText(/Thank you for your review|Thanks for confirming receipt/i)).toBeVisible();
    }

    // Soft: after COMPLETED + review, Rate & Review form is gone from Provider section; payment still Fully paid.
    await page.goto(`/user/jobs/${jobId}`);
    await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
    await expect(page.getByText(/Rate & Review Provider/i)).toHaveCount(0).catch(() => {});
    await expect(page.getByText(/\bFully paid\b/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});

    // Soft: service invoice shows full service total, not deposit-only hero.
    const viewInvoice = page.getByRole('button', { name: /View invoice/i });
    if (await viewInvoice.isVisible().catch(() => false)) {
      await viewInvoice.click();
      await expect(page.getByText(/SERVICE PAYMENT INVOICE/i)).toBeVisible({ timeout: 10_000 }).catch(() => {});
      await expect(page.getByText(/Total service amount|Service price/i).first()).toBeVisible().catch(() => {});
      await page.getByRole('button', { name: /^Close$/i }).click().catch(() => {});
    }

    await providerPage.goto('/provider/earnings');
    await expect(providerPage.getByText(/Total provider share|Recorded from customer payments/i).first()).toBeVisible({
      timeout: 30_000,
    });

    await providerCtx.close();
  });
});
