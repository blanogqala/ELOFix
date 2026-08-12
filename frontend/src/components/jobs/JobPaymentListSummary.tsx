import type { Job } from '@/types';
import { getJobPriceDisplay } from '@/lib/jobUtils';
import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import { resolveCustomerRefundDisplay } from '@/lib/refundStatusDisplay';

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
  const pendingRefund = refundUi.mode === 'pending';

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
        ) : pendingRefund ? (
          <span className="ml-1 text-xs text-amber-700 dark:text-amber-200">(Refund pending)</span>
        ) : paymentStatusLabel && (isFullyPaid || isPartialPaid) ? (
          <span className={cn('ml-1 text-xs font-medium', statusClass)}>({paymentStatusLabel})</span>
        ) : null}
      </p>

      {(processedRefund || pendingRefund) && refundUi.amount > 0 ? (
        <p className="mt-0.5 text-xs tabular-nums text-destructive">
          {pendingRefund ? 'Refund pending' : 'Refunded'} {formatCurrency(refundUi.amount, { decimals: 2 })}
          {processedRefund ? ' ✓' : ''}
        </p>
      ) : null}

      {!processedRefund && !pendingRefund && isPartialPaid && paidAmount != null && remainingAmount != null ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="tabular-nums">Paid {formatCurrency(paidAmount, { decimals: 2 })}</span>
          <span className="mx-1">·</span>
          <span className="tabular-nums text-primary">
            {formatCurrency(remainingAmount, { decimals: 2 })} remaining
          </span>
        </p>
      ) : null}

      {!processedRefund && !pendingRefund && isPartialPaid ? (
        <p className="mt-0.5 text-[11px] font-medium text-primary">Payment remaining</p>
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
