import type { Job } from '@/types';
import { formatCurrency } from './formatCurrency';

export function getJobPriceDisplay(job: Job): { text: string; isPaid?: boolean } {
  if (job.servicePrice?.amount != null) {
    return {
      text: formatCurrency(job.servicePrice.amount, { decimals: 2 }),
      isPaid: job.laborPaid ?? false,
    };
  }
  return { text: 'Price pending inspection' };
}
