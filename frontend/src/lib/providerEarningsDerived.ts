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

/** Net amount provider kept after refund clawback. */
export function getJobNetReleasedAfterRefund(j: ProviderEarningJobRow): number {
  const fromApi = j.netReleasedAfterRefund;
  if (typeof fromApi === 'number' && Number.isFinite(fromApi)) return Math.max(0, fromApi);
  return Math.max(0, getJobReleasedAmount(j) - getJobClawbackAmount(j));
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
  const target = getJobProviderNet(job);
  const releasedAmount = getJobReleasedAmount(job);
  if (target <= 0) return 'Pending';
  if (releasedAmount === 0) return 'Pending';
  if (releasedAmount > 0 && releasedAmount < target) return 'In Progress';
  if (releasedAmount >= target) return 'Completed';
  return 'Pending';
}

/** Sum of API provider share (93%) across jobs — for dashboard / analytics. */
export function sumProviderNetAcrossJobs(jobs: ProviderEarningJobRow[]): number {
  return jobs.reduce((s, j) => s + getJobProviderNet(j), 0);
}

/** Sum of amounts already released to the provider (job-level releasedAmount). */
export function sumReleasedAcrossJobs(jobs: ProviderEarningJobRow[]): number {
  return jobs.reduce((s, j) => s + getJobReleasedAmount(j), 0);
}

/** Sum provider-entitled unreleased share across jobs (excludes courier pre-delivery customer escrow). */
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
