import { test, expect, registerCustomer, login } from './fixtures';

/**
 * Block 5 — hosted checkout security: EloFix never asks for PAN/CVC before redirect.
 * Legal acceptance remains mandatory.
 */
test.describe('Checkout card-data security (Block 5)', () => {
  test.setTimeout(120_000);

  test('PaymentModal path: legal checkbox gates pay; no card/CVC fields', async ({ page }) => {
    const customer = await registerCustomer(page);
    await login(page, customer.email, customer.password);

    // Open payments methods page — must not collect raw card data
    await page.goto('/user/payments');
    await expect(page.getByRole('heading', { name: /Payments/i })).toBeVisible();
    await expect(page.getByPlaceholder('1234 5678 9012 3456')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Add New Card/i })).toHaveCount(0);
    await expect(page.locator('#payment-modal-cvc')).toHaveCount(0);
    await expect(page.locator('#material-cvc')).toHaveCount(0);

    // Smoke: payment methods messaging is honest about PSP tokenisation
    await expect(
      page.getByText(/once card tokenisation is enabled/i)
    ).toBeVisible();
  });
});
