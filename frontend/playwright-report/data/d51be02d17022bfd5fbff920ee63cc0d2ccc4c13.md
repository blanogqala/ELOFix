# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer.provider.lifecycle.spec.ts >> Customer ↔ Provider critical lifecycle >> customer registers, requests service, provider accepts & quotes, customer pays, provider completes, customer reviews
- Location: e2e\customer.provider.lifecycle.spec.ts:7:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Payment confirmed|pending confirmation/i).first()
Expected: visible
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for getByText(/Payment confirmed|pending confirmation/i).first()

```

```yaml
- region "Notifications (F8)":
  - list
- region "Notifications alt+T"
- status:
  - text: Loading
  - img "EloFix"
  - progressbar "Loading progress"
  - paragraph: Securing payment...
```

# Test source

```ts
  181 |             r.url().includes(`/jobs/${jobId}/provider-requirements`) &&
  182 |             r.request().method() === 'PATCH',
  183 |           { timeout: 30_000 }
  184 |         );
  185 |         await requirementsDialog.getByRole('button', { name: 'Save' }).click();
  186 |         const savedReq = await saveRequirementsResp.catch(() => null);
  187 |         if (savedReq) {
  188 |           expect(savedReq.ok(), `save requirements failed: ${savedReq.status()}`).toBeTruthy();
  189 |         }
  190 |         await expect(requirementsDialog).toBeHidden({ timeout: 15_000 }).catch(() => {});
  191 |       }
  192 |     }
  193 | 
  194 |     // Mark inspection done if present, then submit price.
  195 |     const inspectionBtn = providerPage.getByRole('button', { name: 'Mark Inspection Done' });
  196 |     if (await inspectionBtn.isVisible().catch(() => false)) {
  197 |       await expect(inspectionBtn).toBeEnabled({ timeout: 15_000 });
  198 |       await inspectionBtn.click();
  199 |       await expect(providerPage.getByText(/Inspection marked done|Submit service price/i).first()).toBeVisible({
  200 |         timeout: 15_000,
  201 |       }).catch(() => {});
  202 |     }
  203 | 
  204 |     // Re-open detail if a soft redirect cleared the quote form after specs/inspection.
  205 |     if (!(await providerPage.getByPlaceholder(/e\.g\. 4500/i).isVisible().catch(() => false))) {
  206 |       await openProviderJobDetail();
  207 |     }
  208 | 
  209 |     // Label is not htmlFor-linked — use placeholder (Rule-1: test-only selector fix).
  210 |     const serviceAmountInput = providerPage.getByPlaceholder(/e\.g\. 4500/i);
  211 |     await expect(serviceAmountInput).toBeVisible({ timeout: 30_000 });
  212 |     await serviceAmountInput.fill('1000');
  213 |     const submitPrice = providerPage.getByRole('button', { name: 'Submit price' });
  214 |     await expect(submitPrice).toBeEnabled({ timeout: 30_000 });
  215 |     await submitPrice.click();
  216 |     await expect(providerPage.getByText(/Service price submitted/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  217 | 
  218 |     // Customer pays mobilisation / service (mode-aware CTA; default category is often 50/50).
  219 |     await login(page, customer.email, customer.password);
  220 |     await page.goto(`/user/jobs/${jobId}`);
  221 |     const laborPayCta = page.getByRole('button', {
  222 |       name: /Pay (50% deposit|full amount|service amount|remaining 50%|service)/i,
  223 |     });
  224 |     await expect(laborPayCta.first()).toBeVisible({ timeout: 30_000 });
  225 |     await laborPayCta.first().click();
  226 |     await page.getByLabel(/CVC/i).fill('123');
  227 |     await completePaymentInTest(page, {
  228 |       clickPayButton: async () => {
  229 |         await page.getByRole('button', { name: /^Pay / }).click();
  230 |       },
  231 |     });
  232 |     await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
  233 |     await expect(page.getByText(/Payment confirmed|pending confirmation/i).first()).toBeVisible({
  234 |       timeout: 60_000,
  235 |     });
  236 |     await page.goto(`/user/jobs/${jobId}`);
  237 |     // After deposit on 50/50: remaining balance should still show.
  238 |     await expect(page.getByText(/Balance/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  239 |     const remainingAfterDeposit = page.getByText(/R\s*500|R500/i);
  240 |     await expect(remainingAfterDeposit.first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  241 |     // List / detail must not imply fully paid after deposit only.
  242 |     await expect(page.getByText(/\bFully paid\b/i)).toHaveCount(0).catch(() => {});
  243 |     await page.goto('/user/jobs');
  244 |     await expect(page.getByText(/50%\s*Paid|Payment remaining|remaining/i).first()).toBeVisible({
  245 |       timeout: 30_000,
  246 |     }).catch(() => {});
  247 |     await expect(page.getByText(/\(Paid\)/)).toHaveCount(0).catch(() => {});
  248 | 
  249 |     // Provider marks complete.
  250 |     await providerPage.goto(`/provider/jobs/${jobId}`);
  251 |     await expect(providerPage.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
  252 |     await expect(providerPage.getByText(/50% Paid|Deposit|Payment remaining|Balance/i).first()).toBeVisible({
  253 |       timeout: 30_000,
  254 |     }).catch(() => {});
  255 |     await providerPage.goto('/provider/jobs');
  256 |     await expect(providerPage.getByText(/50%\s*Paid|Payment remaining|remaining/i).first()).toBeVisible({
  257 |       timeout: 30_000,
  258 |     }).catch(() => {});
  259 |     await expect(providerPage.getByText(/\(Paid\)/)).toHaveCount(0).catch(() => {});
  260 |     await providerPage.goto(`/provider/jobs/${jobId}`);
  261 |     const markComplete = providerPage.getByRole('button', { name: 'Mark as Complete' });
  262 |     await expect(markComplete).toBeVisible({ timeout: 30_000 });
  263 |     await markComplete.click();
  264 |     await expect(providerPage.getByText(/Waiting for user confirmation/i)).toBeVisible().catch(() => {});
  265 | 
  266 |     // Customer: for 50/50 / on-completion modes, pay remaining (or full) before/instead of confirm-only.
  267 |     await page.goto(`/user/jobs/${jobId}`);
  268 |     await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
  269 |     const remainingPayCta = page.getByRole('button', {
  270 |       name: /Pay (remaining 50%|service amount|full amount)/i,
  271 |     });
  272 |     await expect(remainingPayCta.first()).toBeVisible({ timeout: 60_000 });
  273 |     await remainingPayCta.first().click();
  274 |     await page.getByLabel(/CVC/i).fill('123');
  275 |     await completePaymentInTest(page, {
  276 |       clickPayButton: async () => {
  277 |         await page.getByRole('button', { name: /^Pay / }).click();
  278 |       },
  279 |     });
  280 |     await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
> 281 |     await expect(page.getByText(/Payment confirmed|pending confirmation/i).first()).toBeVisible({
      |                                                                                     ^ Error: expect(locator).toBeVisible() failed
  282 |       timeout: 60_000,
  283 |     });
  284 |     await page.goto(`/user/jobs/${jobId}`);
  285 |     await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
  286 |     await expect(page.getByText(/Fully paid|TOTAL PAID|Balance/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  287 |     // Authoritative: second tranche settled → no remaining customer balance for 50/50.
  288 |     await expect(page.getByText(/R\s*0(\.00)?|Balance/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  289 | 
  290 |     // Customer confirms completion + review when still prompted.
  291 |     const yesCompleted = page.getByRole('button', { name: /Yes, completed/i });
  292 |     if (await yesCompleted.isVisible().catch(() => false)) {
  293 |       await yesCompleted.click();
  294 |       const ratingFive = page.getByRole('button', { name: /^5$/ }).first();
  295 |       if (await ratingFive.isVisible().catch(() => false)) await ratingFive.click();
  296 |       const reviewBox = page.getByRole('textbox', { name: /review/i }).first();
  297 |       if (await reviewBox.isVisible().catch(() => false)) {
  298 |         await reviewBox.fill('Great service. (E2E)');
  299 |       } else {
  300 |         const anyTextarea = page.locator('textarea').first();
  301 |         if (await anyTextarea.isVisible().catch(() => false)) await anyTextarea.fill('Great service. (E2E)');
  302 |       }
  303 |       await page.getByRole('button', { name: /Submit/i }).click();
  304 |       await expect(page.getByText(/Thank you for your review|Thanks for confirming receipt/i)).toBeVisible();
  305 |     }
  306 | 
  307 |     // Soft: after COMPLETED + review, Rate & Review form is gone from Provider section; payment still Fully paid.
  308 |     await page.goto(`/user/jobs/${jobId}`);
  309 |     await expect(page.getByText('Verifying information...')).toBeHidden({ timeout: 60_000 }).catch(() => {});
  310 |     await expect(page.getByText(/Rate & Review Provider/i)).toHaveCount(0).catch(() => {});
  311 |     await expect(page.getByText(/\bFully paid\b/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  312 | 
  313 |     // Soft: service invoice shows full service total, not deposit-only hero.
  314 |     const viewInvoice = page.getByRole('button', { name: /View invoice/i });
  315 |     if (await viewInvoice.isVisible().catch(() => false)) {
  316 |       await viewInvoice.click();
  317 |       await expect(page.getByText(/SERVICE PAYMENT INVOICE/i)).toBeVisible({ timeout: 10_000 }).catch(() => {});
  318 |       await expect(page.getByText(/Total service amount|Service price/i).first()).toBeVisible().catch(() => {});
  319 |       await page.getByRole('button', { name: /^Close$/i }).click().catch(() => {});
  320 |     }
  321 | 
  322 |     await providerPage.goto('/provider/earnings');
  323 |     await expect(providerPage.getByText(/Total provider share|Recorded from customer payments/i).first()).toBeVisible({
  324 |       timeout: 30_000,
  325 |     });
  326 | 
  327 |     await providerCtx.close();
  328 |   });
  329 | });
  330 | 
```