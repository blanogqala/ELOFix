import type { Job, JobMaterialOrderSnapshot, MaterialLine } from '@/types';
import { isMaterialOrderRefunded } from '@/lib/materialBatchTracking';
import { paymentStatusLabelFromSummary } from '@/components/jobs/JobPaymentProgressCard';
import { formatCurrency } from './formatCurrency';

/** Courier job cancellation that opened an admin refund investigation (not a normal cancel). */
export function isCourierCancellationUnderReview(
  job: Pick<Job, 'status' | 'cancellationSource'> | null | undefined
): boolean {
  if (!job) return false;
  return (
    String(job.status || '').toUpperCase() === 'DISPUTED' &&
    (job.cancellationSource === 'customer_cancel' || job.cancellationSource === 'provider_cancel')
  );
}

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

function sumMaterialLines(lines: MaterialLine[]): number {
  return lines.reduce((s, m) => s + Number(m.qty) * Number(m.unitPrice), 0);
}

function snapshotQuoteAmount(o: JobMaterialOrderSnapshot): number {
  const sub = Number(o.materialsSubtotal);
  if (Number.isFinite(sub) && sub >= 0) return sub;
  const total = Number(o.total);
  if (Number.isFinite(total) && total >= 0) return total;
  const items = o.items ?? [];
  return items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0);
}

/** Paid material orders that still count toward what the customer committed (excludes cancelled). */
function isSnapshotActivePaidForQuote(o: JobMaterialOrderSnapshot): boolean {
  const fs = String(o.fulfillmentStatus ?? '').toUpperCase();
  if (fs === 'CANCELLED') return false;
  const ps = String(o.paymentStatus ?? '').toLowerCase();
  return ps === 'paid';
}

function sumPaidStoreOrderMaterials(job: Job): number {
  const rows = job.storeOrders ?? [];
  let sum = 0;
  for (const so of rows) {
    if (!so.payment?.materialsPaid) continue;
    const items = so.items ?? [];
    sum += items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0);
  }
  return sum;
}

/**
 * Materials line on the job quote: cumulative amount for **paid** store purchases on this job,
 * excluding **cancelled** material orders (customer / supplier / branch cancel).
 * Falls back to provider line items (`job.materials`) when nothing was paid yet.
 */
export function getQuoteMaterialsTotal(job: Job): number {
  const orders = job.jobMaterialOrders ?? [];
  const activePaid = orders.filter(isSnapshotActivePaidForQuote);
  if (activePaid.length > 0) {
    return round2(activePaid.reduce((s, o) => s + snapshotQuoteAmount(o), 0));
  }
  const fromStores = sumPaidStoreOrderMaterials(job);
  if (fromStores > 0) return round2(fromStores);
  return round2(sumMaterialLines(job.materials ?? []));
}

/** Sum of net refunds (93%) from cancelled material orders on this job. */
export function getQuoteMaterialsRefundTotal(job: Job): number {
  const orders = job.jobMaterialOrders ?? [];
  return round2(
    orders.reduce((s, o) => {
      if (!isMaterialOrderRefunded(o)) return s;
      const amt = Number(o.refundAmount ?? 0);
      return s + (Number.isFinite(amt) ? amt : 0);
    }, 0)
  );
}

export function jobHasRefundedMaterials(job: Job): boolean {
  return getQuoteMaterialsRefundTotal(job) > 0;
}

/**
 * Gross labor amount for the customer (what they pay). Uses settled `totalPrice` when present.
 * Does not expose commission or provider split.
 */
export function getUserLaborGross(job: Job): number {
  const tp = Number(job.totalPrice);
  if (Number.isFinite(tp) && tp > 0) return tp;
  if (job.servicePrice?.amount != null) {
    const a = Number(job.servicePrice.amount);
    return Number.isFinite(a) ? a : 0;
  }
  const max = Number(job.laborEstimateRange?.max);
  return Number.isFinite(max) ? max : 0;
}

/** Provider job list / cards — full customer-facing gross price (not net after commission). */
export function getProviderJobPriceDisplay(job: Job): ReturnType<typeof getJobPriceDisplay> {
  return getJobPriceDisplay(job);
}

export type JobPriceDisplay = {
  text: string;
  /** Fully paid only (never true for deposit-only when paymentSummary exists). */
  isPaid?: boolean;
  isFullyPaid?: boolean;
  isPartialPaid?: boolean;
  paymentStatusLabel?: string;
  paidAmount?: number;
  remainingAmount?: number;
  refundAmount?: number;
  refundStatus?: string;
  refundLabel?: string;
  underAdminReview?: boolean;
};

function withPaymentSummaryFields(
  job: Job,
  base: Omit<JobPriceDisplay, 'isPaid' | 'isFullyPaid' | 'isPartialPaid' | 'paymentStatusLabel' | 'paidAmount' | 'remainingAmount'> & {
    isPaid?: boolean;
  }
): JobPriceDisplay {
  const summary = !job.legacyEscrowV2 ? job.paymentSummary : null;
  if (!summary) {
    const legacyPaid = Boolean(base.isPaid);
    return {
      ...base,
      isPaid: legacyPaid,
      isFullyPaid: legacyPaid,
      isPartialPaid: false,
      paymentStatusLabel: legacyPaid ? 'Fully paid' : undefined,
    };
  }

  const paidAmount = Number(summary.totalPaidByCustomer) || 0;
  const remainingAmount = Number(summary.totalRemainingByCustomer) || 0;
  const isFullyPaid = paidAmount > 0 && remainingAmount < 0.005;
  const isPartialPaid = paidAmount > 0 && remainingAmount >= 0.005;
  const paymentStatusLabel = paymentStatusLabelFromSummary(summary, job.paymentProgress);

  return {
    ...base,
    paidAmount,
    remainingAmount,
    isFullyPaid,
    isPartialPaid,
    paymentStatusLabel,
    // Backward-compatible: lists that still check isPaid must not treat deposit as full.
    isPaid: isFullyPaid,
  };
}

export function getJobPriceDisplay(job: Job): JobPriceDisplay {
  const isDisputed = job.status === 'DISPUTED';
  const refundAmount =
    !isDisputed && job.refundAmount != null && Number.isFinite(Number(job.refundAmount))
      ? Number(job.refundAmount)
      : undefined;
  const refundStatus = isDisputed ? undefined : job.refundStatus;
  const underAdminReview = isCourierCancellationUnderReview(job);
  const refundLabel = refundAmount && refundAmount > 0 ? 'Refunded' : undefined;

  const settled = job.totalPrice != null && Number.isFinite(Number(job.totalPrice)) ? Number(job.totalPrice) : null;
  if (settled != null && settled > 0) {
    return withPaymentSummaryFields(job, {
      text: formatCurrency(settled, { decimals: 2 }),
      isPaid: job.laborPaid ?? false,
      refundAmount,
      refundStatus,
      refundLabel,
      underAdminReview,
    });
  }
  if (job.servicePrice?.amount != null) {
    return withPaymentSummaryFields(job, {
      text: formatCurrency(job.servicePrice.amount, { decimals: 2 }),
      isPaid: job.laborPaid ?? false,
      refundAmount,
      refundStatus,
      refundLabel,
      underAdminReview,
    });
  }
  if (job.courierFlow && job.deliverySummary?.quotedFee != null) {
    const fee = Number(job.deliverySummary.quotedFee);
    if (Number.isFinite(fee) && fee >= 0) {
      return {
        text: formatCurrency(fee, { decimals: 2 }),
        isPaid: Boolean(job.deliverySummary.deliveryPaid),
        isFullyPaid: Boolean(job.deliverySummary.deliveryPaid),
        isPartialPaid: false,
        paymentStatusLabel: job.deliverySummary.deliveryPaid ? 'Fully paid' : undefined,
        refundAmount,
        refundStatus,
        underAdminReview,
      };
    }
  }
  return { text: 'Price pending inspection', refundAmount, refundStatus, underAdminReview };
}
