import type { Job } from '@/types';

export type CancellationTrancheStage = {
  label: string;
  amount: number;
  status: 'PAID' | 'UNPAID';
};

export type JobCancellationFinancials = {
  servicePrice: number;
  paidToDate: number;
  unpaidRemaining: number;
  amountUnderReview: number;
  commissionOnPaid: number;
  providerShareOnPaid: number;
  depositStage: CancellationTrancheStage | null;
  completionStage: CancellationTrancheStage | null;
  hasPartialPayment: boolean;
};

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function alreadyRefundedFromJob(job: Job): number {
  const details = job.refundDetails;
  if (details?.cumulativeCustomerNet != null && Number.isFinite(Number(details.cumulativeCustomerNet))) {
    return Math.max(0, Number(details.cumulativeCustomerNet));
  }
  if (
    job.refundStatus === 'processed' ||
    job.refundStatus === 'partial' ||
    job.refundStatus === 'recorded'
  ) {
    return Math.max(0, Number(job.refundAmount) || 0);
  }
  return 0;
}

function legacyPaidAmount(job: Job): number {
  if (!job.laborPaid) return 0;
  const sp = job.servicePayment;
  if (sp && String(sp.status || '').toLowerCase() === 'paid') {
    return Number(sp.amount) || 0;
  }
  return 0;
}

function trancheStage(
  label: string,
  tranche: { amount: number; status: string } | null | undefined
): CancellationTrancheStage | null {
  if (!tranche) return null;
  return {
    label,
    amount: Number(tranche.amount) || 0,
    status: tranche.status === 'PAID' ? 'PAID' : 'UNPAID',
  };
}

/**
 * Authoritative cancellation amounts from job.paymentSummary (settled tranches only).
 */
export function buildJobCancellationFinancials(job: Job): JobCancellationFinancials {
  const summary = !job.legacyEscrowV2 ? job.paymentSummary : null;
  const alreadyRefunded = alreadyRefundedFromJob(job);

  if (summary) {
    const paidToDate = Number(summary.totalPaidByCustomer) || 0;
    const servicePrice = Number(summary.totalAmount) || 0;
    const unpaidRemaining = Number(summary.totalRemainingByCustomer) || 0;
    const amountUnderReview = Math.max(0, roundMoney(paidToDate - alreadyRefunded));

    return {
      servicePrice,
      paidToDate,
      unpaidRemaining,
      amountUnderReview,
      commissionOnPaid: Number(summary.commissionRecorded) || 0,
      providerShareOnPaid: Number(summary.providerShareRecorded) || 0,
      depositStage: trancheStage('Deposit (50%)', summary.deposit),
      completionStage: trancheStage('Completion (50%)', summary.completion),
      hasPartialPayment: paidToDate > 0 && unpaidRemaining > 0,
    };
  }

  const legacyPaid = legacyPaidAmount(job);
  const servicePrice =
    Number(job.totalPrice) ||
    Number(job.servicePrice?.amount) ||
    Number(job.laborEstimateRange?.max) ||
    0;

  return {
    servicePrice,
    paidToDate: legacyPaid,
    unpaidRemaining: Math.max(0, roundMoney(servicePrice - legacyPaid)),
    amountUnderReview: Math.max(0, roundMoney(legacyPaid - alreadyRefunded)),
    commissionOnPaid: Number(job.commissionAmount) || 0,
    providerShareOnPaid: Number(job.providerAmount) || 0,
    depositStage: null,
    completionStage: null,
    hasPartialPayment: legacyPaid > 0 && servicePrice > 0 && legacyPaid < servicePrice,
  };
}
