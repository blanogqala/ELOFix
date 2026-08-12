import type { ProviderEarningJobRow } from '@/lib/api/providerAccount';

export type EarningsJobDisplayStatus = 'Pending' | 'In Progress' | 'Completed' | 'Held' | 'Cancelled' | 'Refunded';

/** Customer gross (what the user paid for labor) — from API, not recalculated. */
export function getJobTotalPrice(j: ProviderEarningJobRow): number {
  const n = Number(j.totalPrice ?? j.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Provider net share (93%) from API. */
export function getJobProviderNet(j: ProviderEarningJobRow): number {
  const n = Number(j.providerAmount);
  if (Number.isFinite(n) && n >= 0) return n;
  return 0;
}

/**
 * Amount already released to the provider (not customer gross).
 * Uses API `releasedAmount` when present; no fallback to full gross.
 */
export function getJobReleasedAmount(j: ProviderEarningJobRow): number {
  const explicit = j.releasedAmount;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return Math.max(0, explicit);
  }
  return 0;
}

/**
 * Unreleased provider share. Prefers API `remainingAmount`, else net − released.
 */
export function getJobRemainingAmount(j: ProviderEarningJobRow): number {
  const apiRem = j.remainingAmount;
  if (typeof apiRem === 'number' && Number.isFinite(apiRem)) {
    return Math.max(0, apiRem);
  }
  const net = getJobProviderNet(j);
  const rel = getJobReleasedAmount(j);
  return Math.max(0, net - rel);
}

/** Progress within the provider tranche: released / provider share. */
export function getJobProviderReleaseProgress(j: ProviderEarningJobRow): number {
  const net = getJobProviderNet(j);
  if (net <= 0) return 0;
  return Math.min(1, getJobReleasedAmount(j) / net);
}

/** Clawback from released balance due to customer refund. */
export function getJobClawbackAmount(j: ProviderEarningJobRow): number {
  const fromApi = j.clawbackFromReleased;
  if (typeof fromApi === 'number' && Number.isFinite(fromApi)) return Math.max(0, fromApi);
  const fromMeta = j.refundDetails?.clawbackApplied;
  if (typeof fromMeta === 'number' && Number.isFinite(fromMeta)) return Math.max(0, fromMeta);
  return 0;
}

/** Escrow returned to customer from held provider share. */
export function getJobEscrowReversedAmount(j: ProviderEarningJobRow): number {
  const fromApi = j.escrowReversed;
  if (typeof fromApi === 'number' && Number.isFinite(fromApi)) return Math.max(0, fromApi);
  const fromMeta = j.refundDetails?.escrowApplied;
  if (typeof fromMeta === 'number' && Number.isFinite(fromMeta)) return Math.max(0, fromMeta);
  return 0;
}

/** Provider debt from refunds when released funds were already withdrawn. */
export function getJobProviderDebtAdded(j: ProviderEarningJobRow): number {
  const fromMeta = j.refundDetails?.providerDebtAdded;
  if (typeof fromMeta === 'number' && Number.isFinite(fromMeta)) return Math.max(0, fromMeta);
  const fromApi = j.providerRefundDebt;
  if (typeof fromApi === 'number' && Number.isFinite(fromApi)) return Math.max(0, fromApi);
  return 0;
}

/** Net labor refunded to customer (escrow + clawback + provider debt). */
export function getJobNetLaborRefunded(j: ProviderEarningJobRow): number {
  const cumulative = j.refundDetails?.cumulativeCustomerNet;
  if (typeof cumulative === 'number' && Number.isFinite(cumulative) && cumulative > 0) {
    return cumulative;
  }
  const customerNet = j.refundDetails?.customerNet;
  if (typeof customerNet === 'number' && Number.isFinite(customerNet) && customerNet > 0) {
    return customerNet;
  }
  const refundAmt = Number(j.refundAmount);
  if (Number.isFinite(refundAmt) && refundAmt > 0) return refundAmt;
  return (
    getJobEscrowReversedAmount(j) + getJobClawbackAmount(j) + getJobProviderDebtAdded(j)
  );
}

/** Provider net kept after refunds (full net labor refund deducted from share). */
export function getJobNetProviderKept(j: ProviderEarningJobRow): number {
  const providerNet = getJobProviderNet(j);
  const netLaborRefunded = getJobNetLaborRefunded(j);
  return Math.max(0, providerNet - netLaborRefunded);
}

/** Net amount provider kept from released funds after clawback and debt. */
export function getJobNetReleasedAfterRefund(j: ProviderEarningJobRow): number {
  return Math.max(
    0,
    getJobReleasedAmount(j) - getJobClawbackAmount(j) - getJobProviderDebtAdded(j)
  );
}

export function jobHasRefundImpact(j: ProviderEarningJobRow): boolean {
  const status = getJobStatus(j);
  return status === 'Refunded' || getJobClawbackAmount(j) > 0 || (Number(j.refundAmount) || 0) > 0;
}

export function getJobStatus(job: ProviderEarningJobRow): EarningsJobDisplayStatus {
  const refundStatus = String(job.refundStatus || '').toLowerCase();
  if (refundStatus === 'processed' || refundStatus === 'partial') return 'Refunded';
  if (job.workflowStatus === 'CANCELLED') return 'Cancelled';
  if (job.workflowStatus === 'DISPUTED') return 'Held';
  if (job.workflowStatus === 'COMPLETED') return 'Completed';
  if (job.workflowStatus === 'IN_PROGRESS' || job.workflowStatus === 'AWAITING_CONFIRMATION') {
    return 'In Progress';
  }
  if (String(job.paymentProgress) === 'FIRST_PAID') return 'In Progress';
  if (String(job.paymentProgress) === 'FULLY_PAID' && job.workflowStatus === 'COMPLETED') {
    return 'Completed';
  }
  const target = getJobProviderNet(job);
  const releasedAmount = getJobReleasedAmount(job);
  if (target <= 0) return 'Pending';
  if (releasedAmount === 0) return 'Pending';
  // Do not treat deposit-only (released == current providerAmount) as Completed for 50/50.
  if (String(job.paymentProgress) === 'FIRST_PAID') return 'In Progress';
  if (job.legacyEscrowV2 && releasedAmount > 0 && releasedAmount < target) return 'In Progress';
  if (job.legacyEscrowV2 && releasedAmount >= target) return 'Completed';
  if (String(job.paymentProgress) === 'FULLY_PAID') return 'Completed';
  return 'Pending';
}

export function getJobCustomerPaid(j: ProviderEarningJobRow): number {
  const n = Number(j.customerPaidTotal);
  if (Number.isFinite(n) && n >= 0) return n;
  return 0;
}

export function getJobCustomerRemaining(j: ProviderEarningJobRow): number {
  const n = Number(j.customerRemaining);
  if (Number.isFinite(n) && n >= 0) return n;
  return Math.max(0, getJobTotalPrice(j) - getJobCustomerPaid(j));
}

export function getJobProviderShareRecorded(j: ProviderEarningJobRow): number {
  const n = Number(j.providerShareRecorded);
  if (Number.isFinite(n) && n >= 0) return n;
  return getJobProviderNet(j);
}

export function getJobProviderShareRemaining(j: ProviderEarningJobRow): number {
  const n = Number(j.providerShareRemaining);
  if (Number.isFinite(n) && n >= 0) return n;
  return 0;
}

export function sumProviderShareRemainingAcrossJobs(jobs: ProviderEarningJobRow[]): number {
  return jobs.reduce((s, j) => s + getJobProviderShareRemaining(j), 0);
}

/** Sum of API provider share (93%) across jobs — for dashboard / analytics. */
export function sumProviderNetAcrossJobs(jobs: ProviderEarningJobRow[]): number {
  return jobs.reduce((s, j) => s + getJobProviderNet(j), 0);
}

/** Sum of amounts already released to the provider (job-level releasedAmount). */
export function sumReleasedAcrossJobs(jobs: ProviderEarningJobRow[]): number {
  return jobs.reduce((s, j) => s + getJobReleasedAmount(j), 0);
}

/** Sum provider net kept after refunds across jobs. */
export function sumNetProviderKeptAcrossJobs(jobs: ProviderEarningJobRow[]): number {
  return jobs.reduce((s, j) => s + getJobNetProviderKept(j), 0);
}

/** Sum net released to provider after clawback across jobs. */
export function sumNetReleasedAcrossJobs(jobs: ProviderEarningJobRow[]): number {
  return jobs.reduce((s, j) => s + getJobNetReleasedAfterRefund(j), 0);
}

/** Sum provider-entitled unreleased share across jobs (includes delivery/moving held escrow). */
export function sumProviderEscrowRemaining(jobs: ProviderEarningJobRow[]): number {
  return jobs.reduce((s, j) => s + getJobRemainingAmount(j), 0);
}

export function getStatusColor(status: EarningsJobDisplayStatus): string {
  switch (status) {
    case 'Pending':
      return 'text-yellow-500';
    case 'In Progress':
      return 'text-blue-500';
    case 'Completed':
      return 'text-green-500';
    case 'Held':
      return 'text-warning';
    case 'Cancelled':
      return 'text-destructive';
    case 'Refunded':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}
