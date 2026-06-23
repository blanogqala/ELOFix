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
  return s === 'processed' || s === 'partial';
}

function refundLabel(status?: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'gateway_failed') return 'Refund recorded';
  if (s === 'partial') return 'Partial refund';
  if (s === 'processed') return 'Refunded';
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
  return s === 'processed' || s === 'partial' || s === 'gateway_failed' || s === 'recorded';
}

export function isJobRefunded(job: { refundAmount?: number; refundStatus?: string }): boolean {
  return isProcessedRefund(job.refundStatus) && Number(job.refundAmount) > 0;
}
