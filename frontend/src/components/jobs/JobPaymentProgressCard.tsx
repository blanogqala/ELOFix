import type { ReactNode } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { Job, JobPaymentSummary } from '@/types';
import { formatZar } from '@/lib/paymentSchedule';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

function summaryFromJob(job: Job): JobPaymentSummary | null {
  if (job.paymentSummary) return job.paymentSummary;
  return null;
}

function nearlyZero(n: number): boolean {
  return Math.abs(Number(n) || 0) < 0.005;
}

/** Paid percent from authoritative summary amounts (0–100). */
export function paymentPaidPercentFromSummary(
  summary: JobPaymentSummary | null | undefined
): number | null {
  if (!summary) return null;
  const total = Number(summary.totalAmount);
  if (!Number.isFinite(total) || total <= 0) return null;
  const paid = Math.max(0, Number(summary.totalPaidByCustomer) || 0);
  return Math.min(100, Math.round((100 * paid) / total));
}

/**
 * Human label from backend paymentSummary.
 * Prefer amount-derived percentage when totals exist (works for all modes).
 */
export function paymentStatusLabelFromSummary(
  summary: JobPaymentSummary | null | undefined,
  fallbackProgress?: string | null
): string {
  if (summary) {
    const remaining = Number(summary.totalRemainingByCustomer) || 0;
    const paid = Number(summary.totalPaidByCustomer) || 0;
    const label = String(summary.label || '');

    if (label === 'FULLY_PAID' || (paid > 0 && nearlyZero(remaining))) {
      return 'Fully paid';
    }

    const pct = paymentPaidPercentFromSummary(summary);
    if (pct != null && paid > 0 && remaining > 0) {
      return `${pct}% Paid`;
    }

    if (
      label === 'DEPOSIT_DUE' ||
      label === 'FULL_UPFRONT_DUE' ||
      label === 'FULL_COMPLETION_DUE' ||
      label === 'NONE' ||
      paid <= 0
    ) {
      return 'Awaiting payment';
    }

    if (label === 'DEPOSIT_PAID' || label === 'COMPLETION_DUE') {
      return pct != null ? `${pct}% Paid` : 'Deposit paid';
    }
  }

  const progress = String(fallbackProgress || '');
  if (progress === 'FULLY_PAID') return 'Fully paid';
  if (progress === 'FIRST_PAID') {
    const pct = paymentPaidPercentFromSummary(summary);
    return pct != null ? `${pct}% Paid` : 'Deposit paid';
  }
  return 'Awaiting payment';
}

type Props = {
  job: Job;
  variant?: 'customer' | 'provider';
  className?: string;
  /** Optional CTA rendered under remaining balance (customer). */
  action?: ReactNode;
};

/**
 * Visual payment progress from authoritative job.paymentSummary.
 */
export function JobPaymentProgressCard({ job, variant = 'customer', className, action }: Props) {
  const summary = summaryFromJob(job);
  if (!summary || job.legacyEscrowV2) return null;

  const mode = String(summary.mode || '');
  const isFiftyFifty = mode === 'TWO_PAYMENT_50_50';
  const statusLabel = paymentStatusLabelFromSummary(summary, job.paymentProgress);
  const remaining = Number(summary.totalRemainingByCustomer) || 0;
  const isFullyPaid = nearlyZero(remaining) && Number(summary.totalPaidByCustomer) > 0;
  const showAction = Boolean(action) && remaining > 0;

  return (
    <div className={cn('rounded-lg border border-border bg-muted/30 p-4 space-y-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Service price
          </p>
          <p className="text-xl font-bold tabular-nums">{formatZar(summary.totalAmount)}</p>
        </div>
        <Badge
          variant={isFullyPaid ? 'default' : remaining > 0 && Number(summary.totalPaidByCustomer) > 0 ? 'secondary' : 'outline'}
          className={cn(
            'shrink-0',
            isFullyPaid && 'bg-success text-success-foreground hover:bg-success'
          )}
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Payment progress
        </p>

        {isFiftyFifty && summary.deposit ? (
          <TrancheRow
            label={summary.deposit.status === 'PAID' ? 'Deposit paid' : 'Deposit'}
            amount={summary.deposit.amount}
            paid={summary.deposit.status === 'PAID'}
          />
        ) : null}

        {isFiftyFifty && summary.completion ? (
          <TrancheRow
            label={
              summary.completion.status === 'PAID' ? 'Completion paid' : 'Remaining'
            }
            amount={summary.completion.amount}
            paid={summary.completion.status === 'PAID'}
            emphasize={summary.completion.status !== 'PAID'}
          />
        ) : null}

        {!isFiftyFifty && summary.deposit ? (
          <TrancheRow
            label={summary.deposit.status === 'PAID' ? 'Paid in full' : 'Payment due'}
            amount={summary.deposit.amount}
            paid={summary.deposit.status === 'PAID'}
          />
        ) : null}

        {!isFiftyFifty && summary.completion ? (
          <TrancheRow
            label={summary.completion.status === 'PAID' ? 'Paid in full' : 'Payment due'}
            amount={summary.completion.amount}
            paid={summary.completion.status === 'PAID'}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border pt-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Total paid</p>
          <p className="font-semibold tabular-nums">{formatZar(summary.totalPaidByCustomer)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p
            className={cn(
              'font-semibold tabular-nums',
              remaining > 0 ? 'text-primary' : 'text-success'
            )}
          >
            {formatZar(summary.totalRemainingByCustomer)}
          </p>
        </div>
      </div>

      {isFullyPaid ? (
        <p className="text-sm font-medium text-success inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Fully paid
        </p>
      ) : null}

      {variant === 'provider' ? (
        <div className="grid grid-cols-1 gap-2 border-t border-border pt-2 text-sm sm:grid-cols-2 sm:gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Provider share recorded</p>
            <p className="font-medium tabular-nums">{formatZar(summary.providerShareRecorded)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-muted-foreground">Provider share remaining</p>
            <p className="font-medium tabular-nums">{formatZar(summary.providerShareRemaining)}</p>
          </div>
        </div>
      ) : null}

      {showAction ? action : null}
    </div>
  );
}

function TrancheRow({
  label,
  amount,
  paid,
  emphasize,
}: {
  label: string;
  amount: number;
  paid: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex min-w-0 items-center gap-2">
        {paid ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
        ) : (
          <Circle
            className={cn('h-4 w-4 shrink-0', emphasize ? 'text-primary' : 'text-muted-foreground')}
            aria-hidden
          />
        )}
        <span
          className={cn(
            paid ? 'text-foreground' : emphasize ? 'font-medium text-foreground' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
      </span>
      <span className="shrink-0 font-medium tabular-nums">{formatZar(amount)}</span>
    </div>
  );
}
