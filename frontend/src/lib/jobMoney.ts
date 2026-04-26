import type { Job } from '@/types';

/** Non-negative numeric fallback for job money fields. */
export function safeMoney(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function sumReleasedAmountJobs(jobs: Job[]): number {
  return jobs.reduce((s, j) => s + safeMoney(j.releasedAmount), 0);
}

export function sumProviderAmountJobs(jobs: Job[]): number {
  return jobs.reduce((s, j) => s + safeMoney(j.providerAmount), 0);
}
