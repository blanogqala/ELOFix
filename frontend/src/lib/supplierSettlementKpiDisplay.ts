export const SUPPLIER_GROSS_SHARE_LABEL = 'Gross supplier earnings (93%)';
export const SUPPLIER_PENDING_SETTLEMENT_LABEL = 'Pending settlement';
export const SUPPLIER_SETTLED_LABEL = 'Settled by Paystack';
export const SUPPLIER_PENDING_SETTLEMENT_HINT = 'Paystack payouts pending or processing';
export const SUPPLIER_SETTLED_HINT = 'Completed Paystack settlements';
export const SUPPLIER_GROSS_SHARE_HINT =
  '93% marketplace share before Paystack fees. Not the final bank credit.';
export const SUPPLIER_PENDING_GROSS_FALLBACK_HINT =
  'Includes gross supplier share where the Paystack fee is not yet confirmed. This is not the final bank amount.';
export const SETTLEMENT_KPI_DATE_HINT =
  'Settlement totals follow payment date (paidAt, or createdAt if unpaid timestamp is missing), not the later Paystack settlement day.';

export function pendingSettlementHelperText(pendingUsesGrossFallback?: boolean): string {
  if (pendingUsesGrossFallback) {
    return `${SUPPLIER_PENDING_SETTLEMENT_HINT}. ${SUPPLIER_PENDING_GROSS_FALLBACK_HINT}`;
  }
  return SUPPLIER_PENDING_SETTLEMENT_HINT;
}
