import type { Job } from '@/types';
import { formatCurrency } from './formatCurrency';

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

export function getJobPriceDisplay(job: Job): { text: string; isPaid?: boolean } {
  const settled = job.totalPrice != null && Number.isFinite(Number(job.totalPrice)) ? Number(job.totalPrice) : null;
  if (settled != null && settled > 0) {
    return {
      text: formatCurrency(settled, { decimals: 2 }),
      isPaid: job.laborPaid ?? false,
    };
  }
  if (job.servicePrice?.amount != null) {
    return {
      text: formatCurrency(job.servicePrice.amount, { decimals: 2 }),
      isPaid: job.laborPaid ?? false,
    };
  }
  return { text: 'Price pending inspection' };
}
