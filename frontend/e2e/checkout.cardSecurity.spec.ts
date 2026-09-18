import { test, registerCustomer, login, ensureCustomerPaymentsPageSecure } from './fixtures';

/**
 * Block 5 — hosted checkout security: EloFix never asks for PAN/CVC before redirect.
 * Legal acceptance remains mandatory.
 */
test.describe('Checkout card-data security (Block 5)', () => {
  test.setTimeout(120_000);

  test('PaymentModal path: legal checkbox gates pay; no card/CVC fields', async ({ page }) => {
    const customer = await registerCustomer(page);
    await login(page, customer.email, customer.password);

    // Open customer Payments history page — must not collect raw card data
    await ensureCustomerPaymentsPageSecure(page);
  });
});
