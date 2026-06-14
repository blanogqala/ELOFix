import type { Job } from '@/types';

function num(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/** Paid labor including courier delivery fees (mirrors backend jobPaidAmount.util). */
export function getAdminJobLaborPaid(job: Job): number {
  const sp = job.servicePayment;
  if (sp && sp.status === 'paid' && sp.amount != null) {
    return num(sp.amount);
  }
  if (job.laborPaid) {
    return (
      num(job.totalPrice) ||
      num(job.servicePrice?.amount) ||
      num(job.totalEstimateRange?.min)
    );
  }
  return 0;
}

/** Paid material batches on the job. */
export function getAdminJobMaterialsPaid(job: Job): number {
  const mps = Array.isArray(job.materialPayments) ? job.materialPayments : [];
  return mps.reduce((sum, p) => {
    if (p && p.status === 'paid' && p.amount != null) {
      return sum + num(p.amount);
    }
    return sum;
  }, 0);
}

/** Total customer-paid amount (labor + materials). Prefer API field when present. */
export function getAdminJobCustomerPaidTotal(job: Job): number {
  const fromApi = num(job.customerPaidTotal);
  if (fromApi > 0) return fromApi;
  return getAdminJobLaborPaid(job) + getAdminJobMaterialsPaid(job);
}

/** List/table display: paid total when known, otherwise quoted labor estimate. */
export function getAdminJobDisplayTotal(job: Job): number {
  const paid = getAdminJobCustomerPaidTotal(job);
  if (paid > 0) return paid;
  return getAdminEscrowV2Breakdown(job).totalPrice || num(job.totalEstimateRange?.min);
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

export type AdminJobTransactionRow = {
  type: string;
  amount: number;
  date: string;
  by: string;
};

/** Transaction history rows for admin payment detail. */
export function buildAdminJobTransactionHistory(job: Job): AdminJobTransactionRow[] {
  const rows: AdminJobTransactionRow[] = [];
  const labor = getAdminJobLaborPaid(job);
  if (labor > 0) {
    rows.push({
      type: job.courierFlow ? 'Delivery fee payment' : 'Labor payment',
      amount: labor,
      date: job.servicePayment?.paidAt || job.updatedAt || job.createdAt,
      by: job.servicePayment?.paidBy || job.userId || 'Customer',
    });
  }
  const mps = Array.isArray(job.materialPayments) ? job.materialPayments : [];
  mps.forEach((p) => {
    if (p && p.status === 'paid' && p.amount != null) {
      rows.push({
        type: 'Materials payment',
        amount: num(p.amount),
        date: p.paidAt || job.updatedAt || job.createdAt,
        by: p.paidBy || job.userId || 'Customer',
      });
    }
  });
  const released = num(job.releasedAmount) || num(job.escrow?.releasedAmount);
  if (released > 0) {
    rows.push({
      type: 'Escrow release',
      amount: released,
      date: job.updatedAt || job.createdAt,
      by: 'Platform',
    });
  }
  return rows;
}
