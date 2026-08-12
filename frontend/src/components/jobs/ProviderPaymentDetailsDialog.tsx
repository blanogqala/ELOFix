import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Lock } from 'lucide-react';
import type { Job } from '@/types';
import { formatZar } from '@/lib/paymentSchedule';
import { cn } from '@/lib/utils';
import {
  buildProviderPaymentDetailsModel,
  type InvoicePaymentStatus,
} from '@/lib/servicePaymentInvoice';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
};

function statusBadgeClass(status: InvoicePaymentStatus): string {
  switch (status) {
    case 'FULLY_PAID':
      return 'bg-success text-success-foreground';
    case 'PARTIALLY_PAID':
      return 'bg-amber-600 text-white';
    case 'REFUNDED':
      return 'bg-blue-600 text-white';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatPaidAt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AmountRow({
  label,
  amount,
  emphasize,
  className,
}: {
  label: string;
  amount: number;
  emphasize?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums shrink-0', emphasize && 'font-semibold', className)}>
        {formatZar(amount)}
      </span>
    </div>
  );
}

export function ProviderPaymentDetailsDialog({ open, onOpenChange, job }: Props) {
  const model = useMemo(() => buildProviderPaymentDetailsModel(job), [job]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
            Payment Details
          </DialogTitle>
          <DialogDescription>
            Customer payment status and your provider share. Sensitive details are masked.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-2 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{model.categoryName}</p>
                <p className="text-muted-foreground">Job ID: #{model.jobShortId}</p>
              </div>
              <Badge className={statusBadgeClass(model.status)}>{model.statusLabel}</Badge>
            </div>
            <AmountRow label="Service price" amount={model.serviceTotal} emphasize />
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Payment model</span>
              <span className="font-medium text-right">{model.paymentModeLabel}</span>
            </div>
          </section>

          <section className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Customer payments
            </p>
            {model.breakdown.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-muted-foreground">
                  {row.status === 'PAID' ? `${row.label.replace(/ \(50%\)$/, '')} paid` : row.label}
                </span>
                <span className="inline-flex items-center gap-2 tabular-nums shrink-0">
                  {formatZar(row.amount)}
                  <span className="text-xs text-muted-foreground">
                    {row.status === 'PAID' ? 'Paid' : 'Pending'}
                  </span>
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-3 space-y-2">
              <AmountRow label="Total customer paid" amount={model.customerTotalPaid} emphasize />
              <AmountRow label="Balance" amount={model.customerBalance} />
            </div>
          </section>

          <section className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your earnings
            </p>
            <AmountRow label="EloFix commission (7%)" amount={model.commissionRecorded} />
            <AmountRow
              label="Your provider share (93%)"
              amount={model.providerShareRecorded}
              emphasize
              className="text-primary"
            />
            <div className="border-t border-border pt-3 space-y-2">
              <AmountRow label="Provider share recorded" amount={model.providerShareRecorded} />
              <AmountRow label="Provider share remaining" amount={model.providerShareRemaining} />
            </div>
            <div className="space-y-1 pt-1">
              {model.isFullyPaid ? (
                <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  FULLY PAID
                </p>
              ) : null}
              {model.hasProviderShareRecorded ? (
                <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  PROVIDER SHARE RECORDED
                </p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Customer paid {formatZar(model.customerTotalPaid)}. Your share is{' '}
              {formatZar(model.providerShareRecorded)} after EloFix commission — not the full
              service price. Bank payout is handled outside EloFix.
            </p>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Payment transactions
            </p>
            {model.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customer payments recorded yet.</p>
            ) : (
              model.history.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{entry.title.replace(/ payment$/i, '')}</p>
                      {entry.paymentRef ? (
                        <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                          {entry.paymentRef}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{formatPaidAt(entry.paidAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold tabular-nums">{formatZar(entry.amount)}</p>
                      <Badge className="mt-1 bg-success text-success-foreground">Paid</Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
