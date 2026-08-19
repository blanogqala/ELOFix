import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';

type Props = {
  refundAmount?: number;
  refundStatus?: string;
  variant?: 'inline' | 'stacked';
  className?: string;
};

function isProcessedRefund(status?: string): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'processed' || s === 'partial' || s === 'partial_pending_recovery';
}

function refundLabel(status?: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'gateway_failed') return 'Refund recorded';
  if (s === 'partial_pending_recovery') return 'Refund in progress';
  if (s === 'partial') return 'Partial refund';
  if (s === 'processed') return 'Refund completed';
  if (s === 'recorded' || s === 'pending') return 'Refund pending';
  return 'Refund';
}

export function RefundSummaryLine({ refundAmount, refundStatus, variant = 'stacked', className }: Props) {
  const amount = Number(refundAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const processed = isProcessedRefund(refundStatus);
  const label = refundLabel(refundStatus);

  if (variant === 'inline') {
    return (
      <span className={cn('text-xs text-destructive tabular-nums', className)}>
        −{formatCurrency(amount)} {label.toLowerCase()}
      </span>
    );
  }

  return (
    <div className={cn('flex items-center justify-between gap-2 text-sm', className)}>
      <span className={cn('text-muted-foreground', processed && 'text-destructive/80')}>{label}</span>
      <span className="font-medium tabular-nums text-destructive">−{formatCurrency(amount)}</span>
    </div>
  );
}

export function hasRefundDisplay(job: { refundAmount?: number; refundStatus?: string }): boolean {
  const amount = Number(job.refundAmount);
  if (Number.isFinite(amount) && amount > 0) return true;
  const s = String(job.refundStatus || '').toLowerCase();
  return (
    s === 'processed' ||
    s === 'partial' ||
    s === 'partial_pending_recovery' ||
    s === 'gateway_failed' ||
    s === 'recorded'
  );
}

export function isJobRefunded(job: { refundAmount?: number; refundStatus?: string }): boolean {
  return isProcessedRefund(job.refundStatus) && Number(job.refundAmount) > 0;
}

type StagedProps = {
  immediateRefund?: number;
  pendingRefund?: number;
  /** When repayment is already verified, do not imply the provider still owes. */
  customerRefundStatus?: string | null;
  className?: string;
};

const PROCESSING_CUSTOMER_REFUND = new Set([
  'READY',
  'REFUND_READY',
  'REFUND_REQUESTED',
  'REFUND_PROCESSING',
  'REFUND_MANUAL_ACTION_REQUIRED',
]);

/** Shows refunded-now vs pending-recovery breakdown for staged dispute refunds. */
export function StagedRefundBreakdown({
  immediateRefund,
  pendingRefund,
  customerRefundStatus,
  className,
}: StagedProps) {
  const immediate = Number(immediateRefund) || 0;
  const pending = Number(pendingRefund) || 0;
  if (pending <= 0 && immediate <= 0) return null;
  const processing = PROCESSING_CUSTOMER_REFUND.has(String(customerRefundStatus || '').trim().toUpperCase());
  return (
    <div className={cn('space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs', className)}>
      {immediate > 0 && (
        <p className="text-muted-foreground">
          Refund approved for original payment method:{' '}
          <span className="font-semibold text-success tabular-nums">{formatCurrency(immediate)}</span>
        </p>
      )}
      {pending > 0 && (
        <p className="text-muted-foreground">
          {processing
            ? 'Provider repaid EloFix — sending to your original payment method:'
            : 'Pending (recovered from provider, up to ~30 days):'}{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
            {formatCurrency(pending)}
          </span>
        </p>
      )}
    </div>
  );
}
