import { Clock } from 'lucide-react';
import type { Job } from '@/types';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  formatCompletionPaymentDueDate,
  getProviderAdminPaymentWaitingDescription,
  getProviderAdminPaymentWaitingTitle,
  isCompletionPaymentOverdue,
} from '@/lib/completionPaymentDue';
import { cn } from '@/lib/utils';

type Props = {
  job: Job;
};

export function ProviderAdminPaymentWaitingCard({ job }: Props) {
  const due = job.completionPaymentDue;
  if (!due) return null;

  const overdue = isCompletionPaymentOverdue(job);
  const dueDateLabel = formatCompletionPaymentDueDate(job);
  const amountDue = Number(due.amountDue);

  return (
    <div className="card-elevated p-6 space-y-4">
      <div
        className={cn(
          'rounded-lg border p-4 space-y-3',
          overdue ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5'
        )}
      >
        <div className="flex items-start gap-3">
          <Clock
            className={cn('h-12 w-12 shrink-0', overdue ? 'text-destructive' : 'text-amber-600')}
            aria-hidden
          />
          <div className="min-w-0 space-y-2 text-sm">
            <h3 className="font-semibold text-base">{getProviderAdminPaymentWaitingTitle()}</h3>
            <p className="text-muted-foreground">{getProviderAdminPaymentWaitingDescription()}</p>
            {Number.isFinite(amountDue) && amountDue > 0 ? (
              <p>
                Amount due:{' '}
                <span className="font-semibold tabular-nums">
                  {formatCurrency(amountDue, { decimals: 2 })}
                </span>
              </p>
            ) : null}
            {dueDateLabel ? (
              <p className="text-muted-foreground">Due date: {dueDateLabel}</p>
            ) : null}
            {overdue ? (
              <p className="text-destructive font-medium">
                This payment is overdue. The customer must settle the balance before this job can
                proceed.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
