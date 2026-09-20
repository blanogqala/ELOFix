export type SupplierSettlementUiStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS';

export function normalizeSupplierSettlementStatus(
  status?: string | null
): SupplierSettlementUiStatus {
  const s = String(status || 'PENDING').trim().toUpperCase();
  if (s === 'SUCCESS' || s === 'SETTLED') return 'SUCCESS';
  if (s === 'PROCESSING') return 'PROCESSING';
  return 'PENDING';
}

export function formatSupplierSettlementLabel(status?: string | null): string {
  const s = normalizeSupplierSettlementStatus(status);
  if (s === 'SUCCESS') return 'Success';
  if (s === 'PROCESSING') return 'Processing';
  return 'Pending';
}

export function supplierSettlementBadgeClass(status?: string | null): string {
  const s = normalizeSupplierSettlementStatus(status);
  if (s === 'SUCCESS') {
    return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200';
  }
  if (s === 'PROCESSING') {
    return 'border-sky-500/30 bg-sky-500/15 text-sky-900 dark:text-sky-100';
  }
  return 'border-amber-500/30 bg-amber-500/15 text-amber-900 dark:text-amber-100';
}
