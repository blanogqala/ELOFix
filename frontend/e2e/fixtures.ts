import { test as base, expect, type Page } from '@playwright/test';

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
  await loginIntent;
}

export async function registerCustomer(page: Page, opts?: { name?: string; email?: string; password?: string }) {
  const email = opts?.email ?? uniqueEmail('e2e.user');
  const password = opts?.password ?? 'Password@123';
  await gotoApp(page, '/register');
  await page.getByRole('button', { name: 'I need services' }).click();
  await page.getByLabel('Full Name').fill(opts?.name ?? 'E2E Customer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone Number').fill(uniquePhone());
  await page.getByLabel('Password').fill(password);
  await page.getByLabel(/I agree to the/i).check();
  const regIntent = page.waitForResponse((r) => r.url().includes('/auth/register') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await regIntent;
  await expect(page).toHaveURL(/\/user\/dashboard/);
  return { email, password };
}

export async function registerProvider(page: Page, opts?: { name?: string; email?: string; password?: string }) {
  const email = opts?.email ?? uniqueEmail('e2e.provider');
  const password = opts?.password ?? 'Password@123';
  await gotoApp(page, '/register?role=provider');
  await page.getByRole('button', { name: 'I provide services' }).click();
  await page.getByLabel('Full Name').fill(opts?.name ?? 'E2E Provider');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone Number').fill(uniquePhone('082'));
  await page.getByLabel('Password').fill(password);
  await page.getByLabel(/I agree to the/i).check();
  const regIntent = page.waitForResponse((r) => r.url().includes('/auth/register') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await regIntent;
  // Provider lands on profile onboarding.
  await expect(page).toHaveURL(/\/provider\/profile/);
  return { email, password };
}

export async function ensureCustomerHasSavedCard(page: Page) {
  await gotoApp(page, '/user/payments');
  const addNewCard = page.getByRole('button', { name: 'Add New Card' });
  await addNewCard.click();
  // Labels in this dialog are not guaranteed to be programmatically associated with inputs,
  // so prefer placeholders which are stable in the current UI.
  await page.getByPlaceholder('1234 5678 9012 3456').fill('4242 4242 4242 4242');
  await page.getByPlaceholder('MM').fill('12');
  await page.getByPlaceholder('YYYY').fill('2035');
  await page.locator('input[type="password"][placeholder="123"]').fill('123');
  const addCardIntent = page.waitForResponse((r) => r.url().includes('/payments/cards') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add Card' }).click();
  await addCardIntent;
  await expect(page.getByText(/Card Added/i)).toBeVisible();
}

export async function completePaymentInTest(page: Page, opts: { clickPayButton: () => Promise<void> }) {
  // The UI starts a payment intent then redirects to an external provider.
  // In E2E, we capture the intentId and navigate directly to the in-app return page.
  const intentResponsePromise = page.waitForResponse((r) => r.url().includes('/payments/intents') && r.request().method() === 'POST');
  await opts.clickPayButton();
  const resp = await intentResponsePromise;
  const json = (await resp.json()) as { intentId?: string };
  if (!json.intentId) throw new Error('Missing intentId from /payments/intents response');
  await gotoApp(page, `/payments/return?intentId=${encodeURIComponent(json.intentId)}`);
  // PaymentReturn performs server confirmation; give it a moment to settle.
  await expect(page).toHaveURL(/\/payments\/return\?intentId=/);
}

export const test = base;
export { expect };

