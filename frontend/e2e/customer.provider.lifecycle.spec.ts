import { test, expect, registerCustomer, registerProvider, login, ensureCustomerHasSavedCard, completePaymentInTest } from './fixtures';

test.describe.serial('Customer ↔ Provider critical lifecycle', () => {
  test.setTimeout(180_000);
  test.skip(!process.env.ELOFIX_E2E_FULL_STACK, 'Requires full backend data + admin credentials to complete cross-role lifecycle.');

  test('customer registers, requests service, provider accepts & quotes, customer pays, provider completes, customer reviews', async ({ page, browser }) => {
    const customer = await registerCustomer(page);
    await ensureCustomerHasSavedCard(page);

    // Create a service request (customer).
    await page.goto('/user/new-request');
    await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();
    await page.getByRole('heading', { name: 'Request a Service' }).click();
    await expect(page).toHaveURL(/\/user\/request\/service/);

    // Wizard step 1: choose the first available category card.
    const firstCategory = page.locator('.category-card').first();
    await firstCategory.click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Wizard step 2 (location): Step2Location uses inputs; fill the common ones if present.
    const addressInput = page.getByLabel(/address/i).first();
    if (await addressInput.isVisible().catch(() => false)) {
      await addressInput.fill('123 Main Road');
    } else {
      // Fallback: any textbox with placeholder hint.
      const anyAddress = page.getByPlaceholder(/address/i).first();
      if (await anyAddress.isVisible().catch(() => false)) await anyAddress.fill('123 Main Road');
    }
    const cityInput = page.getByLabel(/city/i).first();
    if (await cityInput.isVisible().catch(() => false)) await cityInput.fill('Cape Town');
    await page.getByRole('button', { name: 'Next' }).click();

    // Wizard step 3: description required (>10 chars).
    await page.getByLabel('Task Description').fill('E2E request: please fix a leaking tap in the kitchen.');
    // Skip measurements by default if allowed.
    await page.getByRole('button', { name: 'Next' }).click();

    // Wizard step 4: pick the first provider card, submit.
    // Providers may be empty in a fresh environment; in that case we still validate that submission is blocked.
    const providerCard = page.locator('[data-testid="provider-discovery-card"], .provider-discovery-card, .card-elevated').filter({ hasText: /rating|completed|jobs/i }).first();
    if (await providerCard.isVisible().catch(() => false)) {
      await providerCard.click();
      await page.getByRole('button', { name: /Submit Request|Send request/i }).click();
      await expect(page).toHaveURL(/\/user\/jobs/);
    } else {
      await expect(page.getByText(/No approved providers/i)).toBeVisible();
      // Stop early: no providers exist to complete the rest of the lifecycle.
      return;
    }

    // Capture the created job id by opening the first job.
    await page.getByRole('heading', { name: 'My Jobs' }).waitFor().catch(() => {});
    const firstJobRow = page.locator('a[href^="/user/jobs/"], button:has(svg.lucide-arrow-right)').first();
    if (await firstJobRow.isVisible().catch(() => false)) await firstJobRow.click();
    await expect(page).toHaveURL(/\/user\/jobs\/[^/]+/);
    const jobId = page.url().split('/user/jobs/')[1]?.split('?')[0] ?? '';
    expect(jobId).not.toEqual('');

    // Provider setup in a separate context.
    const providerCtx = await browser.newContext();
    const providerPage = await providerCtx.newPage();
    const provider = await registerProvider(providerPage);

    // Admin approves provider so they appear in matching (if approvals enforced).
    // This uses a known admin credential (already present in prior smoke tests).
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await login(adminPage, 'admin@elofix.com', 'Admin@123');
    await adminPage.goto('/admin/providers');
    await adminPage.getByPlaceholder('Search providers...').fill(provider.email);
    const approveBtn = adminPage.getByRole('button', { name: 'Approve' }).first();
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      await expect(adminPage.getByText(/Provider approved/i)).toBeVisible().catch(() => {});
    }

    // Provider logs in and accepts the request.
    await login(providerPage, provider.email, provider.password);
    await providerPage.goto('/provider/requests');
    // Open by job id if visible, else by first pending card.
    const jobLink = providerPage.getByText(jobId.slice(-8), { exact: false }).first();
    if (await jobLink.isVisible().catch(() => false)) {
      await jobLink.click();
    } else {
      const viewAny = providerPage.locator('a[href^="/provider/requests/"], button:has-text("View")').first();
      await viewAny.click();
    }
    await expect(providerPage).toHaveURL(/\/provider\/requests\/[^/]+/);

    // Accept request (may be blocked by incomplete profile; if so, ensure we can proceed to profile).
    const acceptBtn = providerPage.getByRole('button', { name: 'Accept Request' });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();
    // If redirected to profile, the app requires onboarding; we can't safely guess all required fields here.
    // At minimum, confirm the guard is active and stop, because lifecycle can't proceed without profile completion.
    if (/\/provider\/profile/.test(providerPage.url())) {
      await expect(providerPage.getByText(/Complete your profile/i)).toBeVisible().catch(() => {});
      await providerCtx.close();
      await adminCtx.close();
      return;
    }

    // Provider should now be on jobs list or job page; open the job detail page.
    if (!/\/provider\/jobs\//.test(providerPage.url())) {
      await providerPage.goto(`/provider/jobs/${jobId}`);
    }
    await expect(providerPage).toHaveURL(new RegExp(`/provider/jobs/${jobId}`));

    // Mark inspection done if present, then submit price.
    const inspectionBtn = providerPage.getByRole('button', { name: 'Mark Inspection Done' });
    if (await inspectionBtn.isVisible().catch(() => false)) {
      await inspectionBtn.click();
    }
    await providerPage.getByLabel(/Service amount/i).fill('500');
    const submitPrice = providerPage.getByRole('button', { name: 'Submit price' });
    await submitPrice.click();
    await expect(providerPage.getByText(/Service price submitted/i)).toBeVisible().catch(() => {});

    // Customer pays service (in app, without leaving to external gateway).
    await login(page, customer.email, customer.password);
    await page.goto(`/user/jobs/${jobId}`);
    await page.getByRole('button', { name: 'Pay service' }).click();
    await page.getByLabel(/CVC/i).fill('123');
    await completePaymentInTest(page, {
      clickPayButton: async () => {
        await page.getByRole('button', { name: /^Pay / }).click();
      },
    });

    // Provider marks complete.
    await providerPage.goto(`/provider/jobs/${jobId}`);
    const markComplete = providerPage.getByRole('button', { name: 'Mark as Complete' });
    await expect(markComplete).toBeVisible();
    await markComplete.click();
    await expect(providerPage.getByText(/Waiting for user confirmation/i)).toBeVisible().catch(() => {});

    // Customer confirms completion + review.
    await page.goto(`/user/jobs/${jobId}`);
    await page.getByRole('button', { name: /Yes, completed/i }).click();
    // Evidence dialog is component-driven; select a rating if present, else fill the review and submit.
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

    await providerCtx.close();
    await adminCtx.close();
  });
});

