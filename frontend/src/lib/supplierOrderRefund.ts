import type { SupplierMaterialOrderLine } from '@/lib/api/supplierPortal';

type RefundOrderFields = Pick<
  SupplierMaterialOrderLine,
  'fulfillmentStatus' | 'refundAmount' | 'refundStatus' | 'paymentStatus'
>;

export function supplierOrderHasRefund(order: RefundOrderFields): boolean {
  if (String(order.fulfillmentStatus || '').toUpperCase() !== 'CANCELLED') return false;
  const amt = Number(order.refundAmount ?? 0);
  if (Number.isFinite(amt) && amt > 0) return true;
  const rs = String(order.refundStatus || '').toLowerCase();
  if (rs === 'processed' || rs === 'partial' || rs === 'gateway_failed' || rs === 'recorded') {
    return true;
  }
  return String(order.paymentStatus || '').toLowerCase() === 'refunded';
}

export function getSupplierOrderRefundAmount(order: Pick<SupplierMaterialOrderLine, 'refundAmount'>): number {
  const amt = Number(order.refundAmount ?? 0);
  return Number.isFinite(amt) && amt > 0 ? amt : 0;
}

export function supplierOrderRefundLabel(order: Pick<SupplierMaterialOrderLine, 'refundStatus'>): string {
  const rs = String(order.refundStatus || '').toLowerCase();
  if (rs === 'gateway_failed') return 'Refund recorded';
  if (rs === 'partial') return 'Partial refund issued';
  if (rs === 'processed') return 'Refund issued to customer';
  if (rs === 'recorded' || rs === 'pending') return 'Refund pending';
  return 'Refund issued to customer';
}
