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
import { CreditCard } from 'lucide-react';
import { formatZar } from '@/lib/paymentSchedule';
import type { InvoiceHistoryEntry } from '@/lib/servicePaymentInvoice';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: InvoiceHistoryEntry | null;
};

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

/**
 * Receipt for ONE payment transaction (deposit or completion).
 * Not the full service invoice.
 */
export function PaymentReceiptDialog({ open, onOpenChange, entry }: Props) {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment Receipt</DialogTitle>
          <DialogDescription>
            Receipt for a single payment transaction. This is not the full service invoice.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Payment type</span>
            <span className="font-medium text-right">{entry.title}</span>
          </div>
          <div className="flex justify-between gap-4 rounded-lg bg-muted/50 p-3">
            <span className="text-muted-foreground">Amount</span>
            <span className="text-lg font-bold tabular-nums">{formatZar(entry.amount)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Payment status</span>
            <Badge className="bg-success text-success-foreground">PAID</Badge>
          </div>
          {entry.paymentRef ? (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Payment reference</span>
              <span className="font-mono text-xs text-right break-all">{entry.paymentRef}</span>
            </div>
          ) : null}
          {entry.maskedPaymentMethod ? (
            <div className="flex justify-between gap-4 items-center">
              <span className="text-muted-foreground">Payment method</span>
              <span className="inline-flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
                {entry.maskedPaymentMethod}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Paid at</span>
            <span className="text-right">{formatPaidAt(entry.paidAt)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
