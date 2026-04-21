const zar = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
});

/**
 * Format amount as South African Rand (ZAR) for display.
 * Uses Intl — amounts are plain numbers from the API (same currency as stored).
 */
export function formatCurrency(amount: number, options?: { decimals?: number }): string {
  if (!Number.isFinite(amount)) {
    return zar.format(0);
  }
  if (options?.decimals != null) {
    const rounded = Number(amount.toFixed(options.decimals));
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: options.decimals,
      maximumFractionDigits: options.decimals,
    }).format(rounded);
  }
  return zar.format(amount);
}
