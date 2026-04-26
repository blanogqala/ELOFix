import type { Job } from '@/types';

function num(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/**
 * Admin-only display: partitions provider `releasedAmount` into first/second 50% tranches.
 * Commission and provider share come from the job API — not recalculated.
 */
export function getAdminEscrowV2Breakdown(job: Job) {
  const totalPrice =
    num(job.totalPrice) || num(job.totalEstimateRange?.min) || num(job.servicePrice?.amount);
  const commission = num(job.commissionAmount);
  const provider = num(job.providerAmount);
  const released = num(job.releasedAmount);
  const remaining =
    job.remainingAmount != null && Number.isFinite(Number(job.remainingAmount))
      ? Math.max(0, num(job.remainingAmount))
      : Math.max(0, provider - released);
  const half = provider > 0 ? provider / 2 : 0;
  const firstRelease = provider > 0 && half > 0 ? Math.min(released, half) : 0;
  const secondRelease =
    provider > 0 && half > 0 ? Math.max(0, Math.min(Math.max(0, released - half), half)) : 0;
  return {
    totalPrice,
    commission,
    provider,
    released,
    remaining,
    firstRelease,
    secondRelease,
  };
}
