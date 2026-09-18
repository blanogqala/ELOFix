import type { Job } from '@/types';
import { cn } from '@/lib/utils';
import { getJobPaymentListSummaryModel } from '@/lib/jobPaymentListSummaryModel';

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
 * Mobile compact omits the redundant "Paid Rxx" line and the extra "Payment remaining" cue.
 */
export function JobPaymentListSummary({ job, className, showDate = false, compact = false }: Props) {
  const model = getJobPaymentListSummaryModel(job);
  const {
    amountText,
    paymentStatusLabel,
    compactStatusLabel,
    paidAmountText,
    remainingAmountText,
    isFullyPaid,
    isPartialPaid,
    showPaidAmountLine,
    showRemainingLine,
    showPaymentRemainingCue,
    refundLine,
    refundLabel,
    refundInFlight,
    processedRefund,
    adminDueSummaryLine,
    adminPaymentRequired,
    adminPaymentOverdue,
    underAdminReview,
  } = model;

  const statusClass = isFullyPaid
    ? 'text-success'
    : isPartialPaid
      ? 'text-foreground'
      : 'text-muted-foreground';

  return (
    <div
      data-testid="job-payment-list-summary"
      className={cn('min-w-0 max-w-full text-left sm:text-right', className)}
    >
      <p className={cn('break-words font-medium tabular-nums', compact ? 'text-sm' : undefined)}>
        <span>{amountText}</span>
        {processedRefund ? (
          <span className="ml-1 hidden text-xs text-destructive sm:inline">(Refunded)</span>
        ) : refundInFlight ? (
          <span className="ml-1 hidden text-xs text-amber-700 dark:text-amber-200 sm:inline">
            ({refundLabel})
          </span>
        ) : paymentStatusLabel && (isFullyPaid || isPartialPaid) ? (
          <span className={cn('ml-1 hidden text-xs font-medium sm:inline', statusClass)}>
            ({paymentStatusLabel})
          </span>
        ) : null}
      </p>

      {!processedRefund && !refundInFlight && compactStatusLabel && (isFullyPaid || isPartialPaid) ? (
        <p className={cn('mt-0.5 text-xs font-medium sm:hidden', statusClass)}>{compactStatusLabel}</p>
      ) : null}

      {refundLine ? (
        <p className="mt-0.5 break-words text-xs tabular-nums text-destructive">{refundLine}</p>
      ) : null}

      {showPaidAmountLine && paidAmountText ? (
        <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
          <span className="tabular-nums">Paid {paidAmountText}</span>
          {showRemainingLine && remainingAmountText ? (
            <>
              <span className="mx-1">·</span>
              <span className="tabular-nums text-primary">{remainingAmountText} remaining</span>
            </>
          ) : null}
        </p>
      ) : null}

      {showRemainingLine && remainingAmountText ? (
        <p className="mt-0.5 text-xs tabular-nums text-primary sm:hidden">{remainingAmountText} remaining</p>
      ) : null}

      {showPaymentRemainingCue ? (
        <p
          className={cn(
            'mt-0.5 hidden text-[11px] font-medium sm:block',
            adminPaymentRequired ? (adminPaymentOverdue ? 'text-destructive' : 'text-warning') : 'text-primary'
          )}
        >
          {adminPaymentRequired ? 'Payment required' : 'Payment remaining'}
        </p>
      ) : null}

      {adminDueSummaryLine ? (
        <p
          className={cn(
            'mt-0.5 break-words text-xs tabular-nums',
            adminPaymentOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}
        >
          {adminDueSummaryLine}
        </p>
      ) : null}

      {underAdminReview ? (
        <p className="break-words text-xs text-amber-700 dark:text-amber-200">Under admin review</p>
      ) : null}

      {showDate ? (
        <p className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</p>
      ) : null}
    </div>
  );
}
