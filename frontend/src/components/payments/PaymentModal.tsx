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
import {
  PaymentIntentKind,
  PaymentProvider,
  createPaymentIntent,
  getPaymentProviders,
} from '@/lib/api/payments';
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector';
import { CheckoutLegalAcceptanceCheckbox } from '@/components/payments/CheckoutLegalAcceptanceCheckbox';
import { buildCheckoutLegalAcceptance } from '@/lib/legal/checkoutAcceptance';
import { submitCheckout } from '@/lib/paymentCheckout';
import { LoadingOverlay } from '@/components/common/loading';
import { Lock, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import type { CategoryPaymentMode, LaborPaymentType } from '@/types';
import { ApiHttpError } from '@/api/client';

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
  /** Labor tranche / schedule context for schedule-aware copy */
  paymentType?: LaborPaymentType | null;
  paymentMode?: CategoryPaymentMode | string | null;
  onCancel?: () => void;
}

function laborSecurePaymentHint(
  paymentType?: LaborPaymentType | null,
  paymentMode?: CategoryPaymentMode | string | null
): string {
  const type = String(paymentType || '');
  const mode = String(paymentMode || '');
  const isDepositFlow =
    type === 'DEPOSIT' ||
    type === 'COMPLETION' ||
    mode === 'TWO_PAYMENT_50_50';
  if (isDepositFlow) {
    return 'Secure payment is completed with our payment service provider. This service uses two separate transactions: a deposit and a completion payment.';
  }
  return 'Secure payment is completed with our payment service provider.';
}

function checkoutLegalErrorMessage(err: unknown): string | null {
  if (!(err instanceof ApiHttpError)) return null;
  const code = String((err.data as { code?: string } | undefined)?.code || '');
  if (code === 'LEGAL_POLICY_VERSION_STALE') {
    return 'Our Refund, Returns & Cancellation Policy has been updated. Please review the latest version and accept it before continuing.';
  }
  if (code === 'CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED') {
    return err.message || 'You must accept the Refund, Returns & Cancellation Policy before payment.';
  }
  return null;
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
  paymentType,
  paymentMode,
  onCancel,
}: PaymentModalProps) {
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | ''>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Transaction-specific acceptance — reset every open; never carry across deposits/completions. */
  const [checkoutLegalAccepted, setCheckoutLegalAccepted] = useState(false);

  useEffect(() => {
    if (!open) {
      setCheckoutLegalAccepted(false);
      return;
    }
    setError(null);
    setIsProcessing(false);
    setCheckoutLegalAccepted(false);

    getPaymentProviders()
      .then((list) => {
        setProviders(list);
        setSelectedProvider(list[0] || '');
      })
      .catch(() => setProviders([]));
  }, [open]);

  const canPay =
    Boolean(selectedProvider) && !isProcessing && checkoutLegalAccepted;

  const handlePayment = async () => {
    setError(null);
    if (!checkoutLegalAccepted) {
      setError('You must accept the Refund, Returns & Cancellation Policy before payment.');
      return;
    }
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
        legalAcceptance: buildCheckoutLegalAcceptance(kind),
      });
      submitCheckout(checkout);
      onOpenChange(false);
    } catch (err) {
      const legalMsg = checkoutLegalErrorMessage(err);
      if (legalMsg) {
        setCheckoutLegalAccepted(false);
        setError(legalMsg);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to start payment. Please try again.');
      }
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md sm:max-h-[min(90vh,720px)] md:max-h-[min(85vh,720px)] max-h-[min(85vh,720px)] flex flex-col overflow-hidden gap-0 p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pr-12">
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              {title}
            </DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
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
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Currency</span>
                <span>ZAR</span>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Payment provider</Label>
              <PaymentMethodSelector
                value={selectedProvider}
                onChange={setSelectedProvider}
                availableProviders={providers}
                disabled={isProcessing}
              />
            </div>

            <CheckoutLegalAcceptanceCheckbox
              kind={kind}
              checked={checkoutLegalAccepted}
              onCheckedChange={setCheckoutLegalAccepted}
              disabled={isProcessing}
            />

            <p className="text-xs text-muted-foreground">
              {kind === 'LABOR'
                ? laborSecurePaymentHint(
                    paymentType ??
                      (typeof metadata?.paymentType === 'string'
                        ? (metadata.paymentType as LaborPaymentType)
                        : null),
                    paymentMode ??
                      (typeof metadata?.paymentMode === 'string'
                        ? (metadata.paymentMode as CategoryPaymentMode)
                        : null)
                  )
                : 'Secure payment is completed with our payment service provider. Card details are entered only on the provider checkout page.'}
            </p>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:gap-0 border-t border-border px-6 py-4">
            <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handlePayment} disabled={!canPay} className="btn-accent">
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isProcessing
                ? 'Redirecting…'
                : `Pay ${formatCurrency(amount, { decimals: 2 })} securely`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoadingOverlay open={isProcessing} message="Securing payment…" />
    </>
  );
}
