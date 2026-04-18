/**
 * Format amount as South African Rand (R).
 * Display only - no database or calculation changes.
 */
export function formatCurrency(amount: number, options?: { decimals?: number }): string {
  const n =
    options?.decimals != null ? amount.toFixed(options.decimals) : amount.toLocaleString();
  return `R${n}`;
}
