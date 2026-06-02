import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PaymentIntentKind, PaymentProvider, createPaymentIntent, getPaymentProviders } from '@/lib/api/payments';
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector';
import { submitCheckout } from '@/lib/paymentCheckout';
import { Lock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';

interface PaymentBreakdownItem {
  label: string;
  amount: number;
  isBold?: boolean;
}

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  amount: number;
  breakdown: PaymentBreakdownItem[];
  kind: PaymentIntentKind;
  jobId?: string;
  materialOrderId?: string;
  metadata?: Record<string, unknown>;
  onCancel?: () => void;
}

export function PaymentModal({
  open,
  onOpenChange,
  title,
  description,
  amount,
  breakdown,
  kind,
  jobId,
  materialOrderId,
  metadata,
  onCancel,
}: PaymentModalProps) {
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | ''>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getPaymentProviders()
      .then((list) => {
        setProviders(list);
        setSelectedProvider(list[0] || '');
      })
      .catch(() => setProviders([]));
    setError(null);
    setIsProcessing(false);
  }, [open]);

  const handlePayment = async () => {
    setError(null);
    if (!selectedProvider) {
      setError('Please select a payment method');
      return;
    }
    setIsProcessing(true);
    try {
      const { checkout } = await createPaymentIntent({
        kind,
        provider: selectedProvider,
        amount,
        jobId,
        materialOrderId,
        metadata,
      });
      submitCheckout(checkout);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start payment. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            {breakdown.map((item, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex justify-between text-sm',
                  item.isBold && 'font-bold text-base pt-2 border-t border-border'
                )}
              >
                <span className={item.isBold ? '' : 'text-muted-foreground'}>{item.label}</span>
                <span className="tabular-nums">{formatCurrency(item.amount, { decimals: 2 })}</span>
              </div>
            ))}
          </div>

          <div>
            <Label className="mb-2 block">Payment method</Label>
            <PaymentMethodSelector
              value={selectedProvider}
              onChange={setSelectedProvider}
              availableProviders={providers}
              disabled={isProcessing}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            You will be redirected to complete payment securely. Funds are held in escrow until job
            completion.
          </p>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handlePayment} disabled={isProcessing || !selectedProvider} className="btn-accent">
            {isProcessing ? 'Redirecting…' : `Pay ${formatCurrency(amount, { decimals: 2 })}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
