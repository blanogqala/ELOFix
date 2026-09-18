import type { Job } from '@/types';
import { getJobPriceDisplay } from '@/lib/jobUtils';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveCustomerRefundDisplay } from '@/lib/refundStatusDisplay';
import {
  getCompletionPaymentDueSummaryLine,
  isAdminRequiredCompletionPayment,
  isCompletionPaymentOverdue,
} from '@/lib/completionPaymentDue';

export type JobPaymentListSummaryModel = {
  amountText: string;
  paymentStatusLabel?: string;
  compactStatusLabel?: string;
  paidAmountText?: string;
  remainingAmountText?: string;
  isFullyPaid: boolean;
  isPartialPaid: boolean;
  showPaidAmountLine: boolean;
  showRemainingLine: boolean;
  showPaymentRemainingCue: boolean;
  refundLine?: string;
  refundLabel?: string;
  refundInFlight: boolean;
  processedRefund: boolean;
  adminDueSummaryLine?: string | null;
  adminPaymentRequired: boolean;
  adminPaymentOverdue: boolean;
  underAdminReview: boolean;
};

function compactStatusFromLabel(label?: string): string | undefined {
  if (!label) return undefined;
  return label.replace(/\bPaid\b/g, 'paid');
}

/**
 * Presentation model from authoritative getJobPriceDisplay / refund helpers.
 * Amounts are not recalculated here.
 */
export function getJobPaymentListSummaryModel(job: Job): JobPaymentListSummaryModel {
  const display = getJobPriceDisplay(job);
  const {
    text,
    paymentStatusLabel,
    paidAmount,
    remainingAmount,
    isFullyPaid,
    isPartialPaid,
    underAdminReview,
  } = display;
  const refundUi = resolveCustomerRefundDisplay(job);
  const processedRefund = refundUi.mode === 'completed';
  const refundInFlight =
    refundUi.mode === 'pending' || refundUi.mode === 'processing' || refundUi.mode === 'failed';
  const adminPaymentRequired = isAdminRequiredCompletionPayment(job);
  const adminPaymentOverdue = adminPaymentRequired && isCompletionPaymentOverdue(job);
  const adminDueSummaryLine = getCompletionPaymentDueSummaryLine(job);

  const refundLine =
    (processedRefund || refundInFlight) && refundUi.amount > 0
      ? `${processedRefund ? 'Refunded' : refundUi.label} ${formatCurrency(refundUi.amount, { decimals: 2 })}${
          processedRefund ? ' ✓' : ''
        }`
      : processedRefund
        ? 'Refunded'
        : refundInFlight
          ? refundUi.label
          : undefined;

  return {
    amountText: text,
    paymentStatusLabel,
    compactStatusLabel: compactStatusFromLabel(paymentStatusLabel),
    paidAmountText:
      isPartialPaid && paidAmount != null ? formatCurrency(paidAmount, { decimals: 2 }) : undefined,
    remainingAmountText:
      isPartialPaid && remainingAmount != null
        ? formatCurrency(remainingAmount, { decimals: 2 })
        : undefined,
    isFullyPaid: Boolean(isFullyPaid),
    isPartialPaid: Boolean(isPartialPaid),
    showPaidAmountLine: Boolean(!processedRefund && !refundInFlight && isPartialPaid && paidAmount != null),
    showRemainingLine: Boolean(
      !processedRefund && !refundInFlight && isPartialPaid && remainingAmount != null
    ),
    showPaymentRemainingCue: Boolean(!processedRefund && !refundInFlight && isPartialPaid),
    refundLine,
    refundLabel: refundUi.label,
    refundInFlight,
    processedRefund,
    adminDueSummaryLine,
    adminPaymentRequired,
    adminPaymentOverdue,
    underAdminReview: Boolean(underAdminReview),
  };
}
