import type { Job } from '@/types';
import { getJobPriceDisplay } from '@/lib/jobUtils';
import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import { resolveCustomerRefundDisplay } from '@/lib/refundStatusDisplay';
import {
  getCompletionPaymentDueSummaryLine,
  isAdminRequiredCompletionPayment,
  isCompletionPaymentOverdue,
} from '@/lib/completionPaymentDue';

type Props = {
  job: Job;
  className?: string;
  /** Show created-at under amounts (My Jobs). */
  showDate?: boolean;
  compact?: boolean;
};

/**
 * Compact list/card financial summary from authoritative paymentSummary via getJobPriceDisplay.
 * Never shows bare "(Paid)" for deposit-only jobs.
 */
export function JobPaymentListSummary({ job, className, showDate = false, compact = false }: Props) {
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

  const statusClass = isFullyPaid
    ? 'text-success'
    : isPartialPaid
      ? 'text-foreground'
      : 'text-muted-foreground';

  return (
    <div className={cn('text-right shrink-0', className)}>
      <p className={cn('font-medium tabular-nums', compact ? 'text-sm' : undefined)}>
        {text}
        {processedRefund ? (
          <span className="ml-1 text-xs text-destructive">(Refunded)</span>
        ) : refundInFlight ? (
          <span className="ml-1 text-xs text-amber-700 dark:text-amber-200">({refundUi.label})</span>
        ) : paymentStatusLabel && (isFullyPaid || isPartialPaid) ? (
          <span className={cn('ml-1 text-xs font-medium', statusClass)}>({paymentStatusLabel})</span>
        ) : null}
      </p>

      {(processedRefund || refundInFlight) && refundUi.amount > 0 ? (
        <p className="mt-0.5 text-xs tabular-nums text-destructive">
          {processedRefund ? 'Refunded' : refundUi.label} {formatCurrency(refundUi.amount, { decimals: 2 })}
          {processedRefund ? ' ✓' : ''}
        </p>
      ) : null}

      {!processedRefund && !refundInFlight && isPartialPaid && paidAmount != null && remainingAmount != null ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="tabular-nums">Paid {formatCurrency(paidAmount, { decimals: 2 })}</span>
          <span className="mx-1">·</span>
          <span className="tabular-nums text-primary">
            {formatCurrency(remainingAmount, { decimals: 2 })} remaining
          </span>
        </p>
      ) : null}

      {!processedRefund && !refundInFlight && isPartialPaid ? (
        <p
          className={cn(
            'mt-0.5 text-[11px] font-medium',
            adminPaymentRequired
              ? adminPaymentOverdue
                ? 'text-destructive'
                : 'text-warning'
              : 'text-primary'
          )}
        >
          {adminPaymentRequired ? 'Payment required' : 'Payment remaining'}
        </p>
      ) : null}

      {adminDueSummaryLine ? (
        <p
          className={cn(
            'mt-0.5 text-xs tabular-nums',
            adminPaymentOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}
        >
          {adminDueSummaryLine}
        </p>
      ) : null}

      {underAdminReview ? (
        <p className="text-xs text-amber-700 dark:text-amber-200">Under admin review</p>
      ) : null}

      {showDate ? (
        <p className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</p>
      ) : null}
    </div>
  );
}
