import type { DeliveryRequestRecord, Job, JobMaterialOrderSnapshot, JobStoreOrder } from '@/types';
import { formatCurrency } from '@/lib/formatCurrency';
import { getQuoteMaterialsTotal, getUserLaborGross } from '@/lib/jobUtils';

export interface QuoteLaborLine {
  label: string;
  amountText: string;
  hint?: string;
  isEstimate: boolean;
  pendingAcceptance: boolean;
}

function deliveryFeePaid(dr?: DeliveryRequestRecord | null): boolean {
  if (!dr) return false;
  const status = String(dr.status || '').toLowerCase();
  return (
    ['paid', 'in_transit', 'completed'].includes(status) || dr.payment?.deliveryPaid === true
  );
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
    return {
      label: 'Labor / Service',
      amountText: formatCurrency(getUserLaborGross(job), { decimals: 2 }),
      hint: 'Paid',
      isEstimate: false,
      pendingAcceptance: false,
    };
  }
  if (job.proposedLaborPrice?.amount != null) {
    return {
      label: 'Labor / Service',
      amountText: formatCurrency(job.proposedLaborPrice.amount, { decimals: 2 }),
      hint: 'Revised quote — accept above to pay this amount',
      isEstimate: false,
      pendingAcceptance: true,
    };
  }
  if (job.servicePrice?.amount != null) {
    return {
      label: 'Labor / Service',
      amountText: formatCurrency(job.servicePrice.amount, { decimals: 2 }),
      hint: job.servicePrice.note?.trim() || 'Provider quotation',
      isEstimate: false,
      pendingAcceptance: false,
    };
  }
  if (job.courierFlow) {
    return null;
  }
  const min = Number(job.laborEstimateRange?.min);
  const max = Number(job.laborEstimateRange?.max);
  if (Number.isFinite(min) && Number.isFinite(max) && (min > 0 || max > 0)) {
    return {
      label: 'Labor / Service',
      amountText: `${formatCurrency(min, { decimals: 2 })} – ${formatCurrency(max, { decimals: 2 })}`,
      hint: 'Estimate until your provider submits a quote',
      isEstimate: true,
      pendingAcceptance: false,
    };
  }
  return {
    label: 'Labor / Service',
    amountText: '—',
    hint: 'Waiting for provider quote',
    isEstimate: true,
    pendingAcceptance: false,
  };
}

export function getQuoteDeliveryLine(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null
): { label: string; amountText: string; hint?: string } | null {
  if (!job.courierFlow && !deliveryRequest) return null;
  const dr = deliveryRequest;
  if (!dr) return null;
  const status = String(dr.status || '').toLowerCase();
  const paid =
    ['paid', 'in_transit', 'completed'].includes(status) || dr.payment?.deliveryPaid === true;
  if (dr.quotedFee == null && status === 'pending_quote') {
    return {
      label: 'Delivery fee',
      amountText: '—',
      hint: 'Waiting for courier quote',
    };
  }
  if (dr.quotedFee == null) return null;
  return {
    label: 'Delivery fee',
    amountText: formatCurrency(dr.quotedFee, { decimals: 2 }),
    hint: paid ? 'Paid' : status === 'quoted' ? 'Accept quote to pay' : 'Quoted',
  };
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

/** Delivery row for job material store-order cards (paid / pending). */
export function getStoreOrderDeliveryLine(
  storeOrder: JobStoreOrder,
  mo?: JobMaterialOrderSnapshot | null
): StoreOrderDeliveryLine | null {
  if (storeOrder.deliveryType === 'SELF') return null;

  const statusRaw =
    storeOrder.deliveryStatus ||
    storeOrder.delivery?.status ||
    '';
  const status = String(statusRaw);
  const isCancelled =
    status === 'Cancelled' ||
    status === 'Rejected' ||
    status.toLowerCase() === 'cancelled';

  const moQuoteFee = (mo as { deliveryQuote?: { fee?: number } } | null | undefined)?.deliveryQuote?.fee;
  const amount =
    typeof storeOrder.deliveryFee === 'number' && Number.isFinite(storeOrder.deliveryFee) && storeOrder.deliveryFee > 0
      ? storeOrder.deliveryFee
      : typeof moQuoteFee === 'number' && Number.isFinite(moQuoteFee)
        ? moQuoteFee
        : typeof storeOrder.delivery?.fee === 'number' && Number.isFinite(storeOrder.delivery.fee)
          ? storeOrder.delivery.fee
          : 0;

  if (amount <= 0 && !isCancelled) return null;

  const deliveryPaid = storeOrder.payment?.deliveryPaid === true;

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
    includeInSubtotal: false,
  };
}
