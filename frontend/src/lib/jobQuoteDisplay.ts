import type {
  DeliveryRequestRecord,
  Job,
  JobMaterialOrderSnapshot,
  JobStoreOrder,
  StoreOrderDeliveryType,
} from '@/types';
import { formatCurrency } from '@/lib/formatCurrency';
import { getQuoteMaterialsTotal, getUserLaborGross } from '@/lib/jobUtils';
import {
  isDeliverySelectionCleared,
  resolveDisplayDeliveryType,
} from '@/lib/providerMaterialOrderHelpers';
import { isMaterialOrderRefunded } from '@/lib/materialBatchTracking';

export interface QuoteLine {
  label: string;
  amountText: string;
}

export interface QuoteLaborLine extends QuoteLine {
  hint?: string;
  pendingAcceptance?: boolean;
}

function deliveryFeePaid(dr?: DeliveryRequestRecord | null): boolean {
  if (!dr) return false;
  const status = String(dr.status || '').toLowerCase();
  return status === 'paid' || dr.payment?.deliveryPaid === true;
}

export function getQuoteLaborLine(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null
): QuoteLaborLine | null {
  if (
    job.courierFlow &&
    deliveryFeePaid(deliveryRequest) &&
    job.servicePrice?.amount == null &&
    job.proposedLaborPrice?.amount == null
  ) {
    return null;
  }
  if (job.laborPaid) {
    const amount = getUserLaborGross(job);
    return {
      label: 'Service',
      amountText: formatCurrency(amount, { decimals: 2 }),
    };
  }
  if (job.proposedLaborPrice?.amount != null) {
    return {
      label: 'Service (proposed)',
      amountText: formatCurrency(Number(job.proposedLaborPrice.amount), { decimals: 2 }),
      pendingAcceptance: true,
      hint: 'Awaiting your acceptance',
    };
  }
  if (job.servicePrice?.amount != null) {
    return {
      label: 'Service',
      amountText: formatCurrency(Number(job.servicePrice.amount), { decimals: 2 }),
      pendingAcceptance: !job.laborPaid,
      hint: !job.laborPaid ? 'Pay service to proceed' : undefined,
    };
  }
  if (!job.courierFlow && job.laborEstimateRange?.max != null) {
    const est = Number(job.laborEstimateRange.max);
    if (Number.isFinite(est) && est > 0) {
      return {
        label: 'Service (estimate)',
        amountText: formatCurrency(est, { decimals: 2 }),
        hint: 'Final price after inspection',
      };
    }
  }
  return null;
}

export function getQuoteDeliveryLine(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null
): QuoteLine | null {
  if (job.courierFlow || job.deliverySummary) {
    const drStatus = String(deliveryRequest?.status || job.deliverySummary?.status || '').toLowerCase();
    const deliveryPaid =
      deliveryFeePaid(deliveryRequest) || job.deliverySummary?.deliveryPaid === true;
    const quoted =
      deliveryRequest?.quotedFee != null
        ? Number(deliveryRequest.quotedFee)
        : job.deliverySummary?.quotedFee != null
          ? Number(job.deliverySummary.quotedFee)
          : null;
    if (quoted == null || !Number.isFinite(quoted)) return null;
    if (drStatus === 'pending_quote' && !deliveryPaid) return null;
    return {
      label: deliveryPaid ? 'Delivery (paid)' : 'Delivery',
      amountText: formatCurrency(quoted, { decimals: 2 }),
    };
  }
  return null;
}

/** Customer-facing total for the quote card (materials + active labor quote + delivery when applicable). */
export function getCustomerQuoteTotal(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null
): number {
  const materials = getQuoteMaterialsTotal(job);
  const drStatus = String(deliveryRequest?.status || '').toLowerCase();
  const deliveryQuoted =
    deliveryRequest?.quotedFee != null && drStatus !== 'pending_quote';
  const deliveryFee = deliveryQuoted ? Number(deliveryRequest!.quotedFee) : 0;

  let service = 0;
  if (job.laborPaid) {
    service = getUserLaborGross(job);
  } else if (job.proposedLaborPrice?.amount != null) {
    service = Number(job.proposedLaborPrice.amount);
  } else if (job.servicePrice?.amount != null) {
    service = Number(job.servicePrice.amount);
  } else if (!job.courierFlow) {
    service = Number(job.laborEstimateRange?.max) || 0;
  }

  if (job.courierFlow) {
    if (deliveryQuoted) return materials + deliveryFee;
    return materials + service;
  }

  return materials + service;
}

export interface StoreOrderDeliveryLine {
  label: string;
  amount: number;
  hint?: string;
  muted?: boolean;
  struck?: boolean;
  includeInSubtotal: boolean;
}

function mapSnapshotDeliveryType(mo?: JobMaterialOrderSnapshot | null): StoreOrderDeliveryType | undefined {
  const raw = String(mo?.deliveryType || '').toUpperCase();
  if (raw === 'STORE_DELIVERY' || raw === 'STORE') return 'STORE';
  if (raw === 'DELIVERY_PROVIDER' || raw === 'PROVIDER') return 'PROVIDER';
  if (raw === 'SELF') return 'SELF';
  return undefined;
}

/** Merge job meta store order with DB material-order snapshot (snapshot wins when fresher). */
function resolveStoreOrderDeliveryContext(
  storeOrder: JobStoreOrder,
  mo?: JobMaterialOrderSnapshot | null
): {
  deliveryType: StoreOrderDeliveryType;
  status: string;
  amount: number;
  deliveryPaid: boolean;
} {
  const deliveryType = mapSnapshotDeliveryType(mo) ?? storeOrder.deliveryType;
  const status = String(
    mo?.delivery?.status ??
      mo?.deliveryStatus ??
      storeOrder.deliveryStatus ??
      storeOrder.delivery?.status ??
      ''
  );
  const amount = Math.max(
    0,
    Number(
      mo?.deliveryQuote?.fee ??
        mo?.deliveryFee ??
        mo?.delivery?.fee ??
        (storeOrder.deliveryFee > 0 ? storeOrder.deliveryFee : undefined) ??
        storeOrder.delivery?.fee ??
        0
    ) || 0
  );
  const deliveryPaid =
    mo?.payment?.deliveryPaid === true || storeOrder.payment?.deliveryPaid === true;
  return { deliveryType, status, amount, deliveryPaid };
}

/** Delivery row for job material store-order cards (paid / pending). */
export function getStoreOrderDeliveryLine(
  storeOrder: JobStoreOrder,
  mo?: JobMaterialOrderSnapshot | null
): StoreOrderDeliveryLine | null {
  const { deliveryType, status, amount, deliveryPaid } = resolveStoreOrderDeliveryContext(
    storeOrder,
    mo
  );

  if (deliveryType === 'SELF') return null;

  const isCancelled =
    status === 'Cancelled' ||
    status === 'Rejected' ||
    status.toLowerCase() === 'cancelled';

  if (amount <= 0 && !isCancelled) return null;

  if (isCancelled) {
    return {
      label: 'Delivery',
      amount,
      hint: 'Cancelled',
      muted: true,
      struck: true,
      includeInSubtotal: false,
    };
  }

  if (deliveryType === 'STORE') {
    if (status === 'PendingApproval' || amount <= 0) return null;
    if (status === 'Rejected') return null;
    return {
      label: 'Delivery',
      amount,
      hint: deliveryPaid ? 'Paid' : 'Approved',
      muted: !deliveryPaid,
      includeInSubtotal: true,
    };
  }

  if (deliveryPaid) {
    return {
      label: 'Delivery',
      amount,
      hint: 'Paid',
      includeInSubtotal: true,
    };
  }

  if (status === 'Approved') {
    return {
      label: 'Delivery',
      amount,
      hint: 'Pay later',
      includeInSubtotal: false,
    };
  }

  if (status === 'Quoted' || status === 'PendingApproval') {
    return {
      label: 'Delivery',
      amount,
      hint: status === 'Quoted' ? 'Quoted' : 'Awaiting approval',
      includeInSubtotal: false,
    };
  }

  return {
    label: 'Delivery',
    amount,
    includeInSubtotal: amount > 0,
  };
}

/** @deprecated Prefer `isMaterialOrderDeliveryPaymentPending` for store and courier cards. */
export function isStoreDeliveryPaymentPending(
  storeOrder: JobStoreOrder,
  mo?: JobMaterialOrderSnapshot | null
): boolean {
  return isMaterialOrderDeliveryPaymentPending(storeOrder, mo);
}

/** Delivery fee visible on a paid material card but still awaiting customer payment. */
export function isMaterialOrderDeliveryPaymentPending(
  storeOrder: JobStoreOrder,
  mo?: JobMaterialOrderSnapshot | null
): boolean {
  const line = getStoreOrderDeliveryLine(storeOrder, mo);
  const { deliveryPaid } = resolveStoreOrderDeliveryContext(storeOrder, mo);
  return Boolean(
    line &&
      !line.struck &&
      line.amount > 0 &&
      !deliveryPaid &&
      ['Approved', 'Quoted', 'Pay later'].includes(line.hint || '')
  );
}

function isStoreOrderMaterialsPaid(
  storeOrder: JobStoreOrder,
  mo?: JobMaterialOrderSnapshot | null
): boolean {
  if (mo?.payment?.materialsPaid === true) return true;
  if (storeOrder.payment?.materialsPaid === true) return true;
  return String(mo?.paymentStatus || '').toLowerCase() === 'paid';
}

/**
 * Amber strip on paid material cards: cancelled/missing delivery option, or unpaid delivery fee.
 */
export function getMaterialOrderDeliveryPaymentReminder(
  storeOrder: JobStoreOrder,
  mo: JobMaterialOrderSnapshot | null | undefined,
  role: 'user' | 'provider'
): string | undefined {
  if (isMaterialOrderRefunded(mo)) return undefined;
  if (!isStoreOrderMaterialsPaid(storeOrder, mo)) return undefined;

  if (isDeliverySelectionCleared(storeOrder, mo)) {
    const moStatus = String(mo?.delivery?.status ?? mo?.deliveryStatus ?? '')
      .trim()
      .toLowerCase();
    const storeStatus = String(storeOrder.deliveryStatus ?? storeOrder.delivery?.status ?? '')
      .trim()
      .toLowerCase();
    const wasCancelled = moStatus === 'cancelled' || storeStatus === 'cancelled';
    const underReview = mo?.deliveryCancellationReview?.open === true;

    if (underReview) {
      return role === 'provider'
        ? 'Previous courier cancelled — under refund review. Customer can choose another delivery option.'
        : 'Previous courier cancelled — under refund review. You can choose a new delivery option (new fee is separate).';
    }

    if (wasCancelled) {
      return role === 'provider'
        ? 'Customer must choose another delivery option so these paid materials can be delivered.'
        : 'Choose another delivery option so your paid materials can be delivered. Open order details to select.';
    }

    return role === 'provider'
      ? 'Customer must select a delivery option for this paid material order.'
      : 'Select a delivery option for this paid order. Open order details to choose.';
  }

  if (!isMaterialOrderDeliveryPaymentPending(storeOrder, mo)) return undefined;

  const deliveryType = resolveDisplayDeliveryType(storeOrder, mo);
  if (deliveryType === 'PROVIDER') {
    return role === 'provider'
      ? 'Customer must pay the delivery fee to accept the courier quote before delivery can proceed.'
      : 'Pay the delivery fee to accept the courier quote. Open Full tracking view to pay.';
  }

  return role === 'provider'
    ? 'Customer must pay the delivery fee before this order can be dispatched.'
    : 'Pay the delivery fee so this order can leave the store. Open order details to pay.';
}
