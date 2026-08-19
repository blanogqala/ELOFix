import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import type { Job } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatCurrency';
import { buildJobCancellationFinancials } from '@/lib/jobCancellationFinancials';
import { laborPayButtonLabel } from '@/lib/paymentSchedule';
import {
  isCompletionPaymentOverdue,
} from '@/lib/completionPaymentDue';
import { cn } from '@/lib/utils';

type Props = {
  job: Job;
  providerName: string;
  paymentProgress: string;
  showPayCta: boolean;
  paymentBlocked: boolean;
  disabled?: boolean;
  onPay: () => void;
};

export function AdminRequiredCompletionPaymentBlock({
  job,
  providerName,
  paymentProgress,
  showPayCta,
  paymentBlocked,
  disabled = false,
  onPay,
}: Props) {
  const due = job.completionPaymentDue;
  if (!due) return null;

  const overdue = isCompletionPaymentOverdue(job);
  const fin = buildJobCancellationFinancials(job);
  const showProgress = fin.depositStage != null || fin.completionStage != null;
  const dueDateLabel = due.dueAt
    ? new Date(due.dueAt).toLocaleDateString('en-ZA', { dateStyle: 'medium' })
    : null;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-4',
        overdue ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5'
      )}
    >
      <div className="flex items-start gap-3">
        <Clock
          className={cn('h-5 w-5 shrink-0 mt-0.5', overdue ? 'text-destructive' : 'text-warning')}
          aria-hidden
        />
        <div className="min-w-0 space-y-2 text-sm flex-1">
          <div>
            <p className="font-semibold">
              {overdue ? 'Payment overdue — case resolved' : 'Payment required — case resolved'}
            </p>
            <p className="text-muted-foreground mt-1">
              EloFix reviewed your dispute or cancellation and determined the remaining balance must
              be paid to {providerName} before this job can be finalized.
            </p>
          </div>
          <p>
            Amount:{' '}
            <span className="font-semibold tabular-nums">
              {formatCurrency(due.amountDue, { decimals: 2 })}
            </span>
          </p>
          {dueDateLabel ? (
            <p className="text-muted-foreground">Due date: {dueDateLabel}</p>
          ) : null}
          {overdue ? (
            <p className="text-destructive">
              This payment is overdue. Your account has restricted marketplace access until the
              outstanding amount is settled.
            </p>
          ) : dueDateLabel ? (
            <p className="text-muted-foreground">
              This amount must be paid by {dueDateLabel}.
            </p>
          ) : (
            <p className="text-muted-foreground">This amount must be paid by the due date shown.</p>
          )}
        </div>
      </div>

      {showProgress || paymentProgress === 'FIRST_PAID' ? (
        <div className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payment progress
          </p>
          {fin.depositStage ? (
            <p className="flex justify-between gap-2">
              <span>
                {fin.depositStage.status === 'PAID' ? '✓ ' : '○ '}
                Deposit paid
              </span>
              <span className="tabular-nums font-medium">
                {formatCurrency(fin.depositStage.amount, { decimals: 2 })}
              </span>
            </p>
          ) : paymentProgress === 'FIRST_PAID' || paymentProgress === 'FULLY_PAID' ? (
            <Badge className="bg-success text-success-foreground">50% Deposit Paid</Badge>
          ) : null}
          {fin.completionStage ? (
            <p className="flex justify-between gap-2 text-muted-foreground">
              <span>
                {fin.completionStage.status === 'PAID' ? '✓ ' : '○ '}
                Final payment
              </span>
              <span className="tabular-nums font-medium text-foreground">
                {formatCurrency(fin.completionStage.amount, { decimals: 2 })}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {showPayCta ? (
        <Button
          type="button"
          className="btn-accent w-full"
          disabled={paymentBlocked || disabled}
          onClick={onPay}
        >
          {laborPayButtonLabel(job)}
        </Button>
      ) : null}

      <p>
        <Link to="/escrow-policy" className="text-xs font-medium text-primary hover:underline">
          View payment terms
        </Link>
      </p>
    </div>
  );
}
