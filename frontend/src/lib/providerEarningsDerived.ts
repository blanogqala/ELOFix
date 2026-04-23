import type { ProviderEarningJobRow } from '@/lib/api/providerAccount';

export type EarningsJobDisplayStatus = 'Pending' | 'In Progress' | 'Completed';

export function getJobTotalPrice(j: ProviderEarningJobRow): number {
  const n = Number(j.totalPrice ?? j.amount);
  return Number.isFinite(n) ? n : 0;
}

export function getJobReleasedAmount(j: ProviderEarningJobRow): number {
  const explicit = j.releasedAmount;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return Math.max(0, explicit);
  }
  return j.paymentReleased ? getJobTotalPrice(j) : 0;
}

export function getJobRemainingAmount(j: ProviderEarningJobRow): number {
  return Math.max(0, getJobTotalPrice(j) - getJobReleasedAmount(j));
}

/** Frontend-only payment/release status from job totals and released amounts (API fields unchanged). */
export function getJobStatus(job: ProviderEarningJobRow): EarningsJobDisplayStatus {
  const totalPrice = getJobTotalPrice(job);
  const releasedAmount = getJobReleasedAmount(job);
  if (releasedAmount === 0) return 'Pending';
  if (releasedAmount > 0 && releasedAmount < totalPrice) return 'In Progress';
  if (releasedAmount >= totalPrice) return 'Completed';
  return 'Pending';
}

export function getStatusColor(status: EarningsJobDisplayStatus): string {
  switch (status) {
    case 'Pending':
      return 'text-yellow-500';
    case 'In Progress':
      return 'text-blue-500';
    case 'Completed':
      return 'text-green-500';
    default:
      return 'text-muted-foreground';
  }
}
