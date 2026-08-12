import { useMemo, useState } from 'react';
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
import { CheckCircle2, Download, CreditCard } from 'lucide-react';
import { EloFixLogo } from '@/components/EloFixLogo';
import { PaymentReceiptDialog } from '@/components/jobs/PaymentReceiptDialog';
import type { Job } from '@/types';
import { formatZar } from '@/lib/paymentSchedule';
import { cn } from '@/lib/utils';
import {
  buildServicePaymentInvoiceModel,
  printServicePaymentInvoice,
  type InvoiceHistoryEntry,
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
    case 'FAILED':
      return 'bg-destructive text-destructive-foreground';
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
  muted,
}: {
  label: string;
  amount: number;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className={cn(muted ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
      <span className={cn('tabular-nums shrink-0', emphasize && 'font-semibold')}>
        {formatZar(amount)}
      </span>
    </div>
  );
}

export function ServicePaymentInvoiceDialog({ open, onOpenChange, job }: Props) {
  const model = useMemo(() => buildServicePaymentInvoiceModel(job), [job]);
  const [receiptEntry, setReceiptEntry] = useState<InvoiceHistoryEntry | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-3 border-b border-border px-6 py-4 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <EloFixLogo variant="dark" clickable={false} className="h-8" />
                <DialogTitle className="text-lg tracking-wide">SERVICE PAYMENT INVOICE</DialogTitle>
                <DialogDescription className="text-sm">
                  Invoice #: {model.invoiceNumber}
                </DialogDescription>
              </div>
              <Badge className={cn('shrink-0', statusBadgeClass(model.status))}>
                {model.statusLabel}
              </Badge>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <section className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Job
                </p>
                <p className="font-medium">{model.categoryName}</p>
                <p className="text-muted-foreground">Job ID: #{model.jobShortId}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment model
                </p>
                <p className="font-medium">{model.paymentModeLabel}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer
                </p>
                <p className="font-medium">{model.customerName}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Service provider
                </p>
                <p className="font-medium">{model.providerName}</p>
              </div>
            </section>

            <section className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Service summary
              </p>
              <AmountRow label="Service price" amount={model.serviceTotal} emphasize />
            </section>

            <section className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payment breakdown
              </p>
              {model.breakdown.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="inline-flex items-center gap-2 tabular-nums shrink-0">
                    {formatZar(row.amount)}
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px]',
                        row.status === 'PAID' && 'bg-success/15 text-success'
                      )}
                    >
                      {row.status === 'PAID' ? 'Paid' : 'Pending'}
                    </Badge>
                  </span>
                </div>
              ))}
              <div className="border-t border-border pt-3 space-y-2">
                <AmountRow label="Total service amount" amount={model.serviceTotal} emphasize />
                <AmountRow label="Total paid" amount={model.totalPaid} emphasize />
                <AmountRow label="Outstanding balance" amount={model.balance} />
              </div>
              {model.status === 'FULLY_PAID' || model.status === 'PARTIALLY_PAID' ? (
                <p
                  className={cn(
                    'inline-flex items-center gap-1.5 text-sm font-medium',
                    model.status === 'FULLY_PAID' ? 'text-success' : 'text-amber-700'
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {model.status === 'FULLY_PAID'
                    ? 'FULLY PAID'
                    : `${formatZar(model.totalPaid)} of ${formatZar(model.serviceTotal)} paid`}
                </p>
              ) : null}
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payment history
              </p>
              {model.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                model.history.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="w-full rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/40"
                    onClick={() => setReceiptEntry(entry)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{entry.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.paymentRef
                            ? `Payment reference: ${entry.paymentRef}`
                            : 'Payment reference: —'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Date: {formatPaidAt(entry.paidAt)}
                        </p>
                        {entry.maskedPaymentMethod ? (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CreditCard className="h-3 w-3" aria-hidden />
                            {entry.maskedPaymentMethod}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold tabular-nums">{formatZar(entry.amount)}</p>
                        <Badge className="mt-1 bg-success text-success-foreground">Paid</Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-primary">View receipt →</p>
                  </button>
                ))
              )}
            </section>

            <section className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
              <span className="text-base font-semibold">TOTAL PAID</span>
              <span className="text-xl font-bold tabular-nums">{formatZar(model.totalPaid)}</span>
            </section>

            <p className="text-sm text-muted-foreground">Thank you for using EloFix.</p>
          </div>

          <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border px-6 py-4 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => printServicePaymentInvoice(model)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Invoice
            </Button>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentReceiptDialog
        open={Boolean(receiptEntry)}
        onOpenChange={(next) => {
          if (!next) setReceiptEntry(null);
        }}
        entry={receiptEntry}
      />
    </>
  );
}
