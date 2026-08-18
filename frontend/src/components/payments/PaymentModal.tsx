import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  PaymentIntentKind,
  PaymentProvider,
  createPaymentIntent,
  getPaymentProviders,
  getSavedCards,
} from '@/lib/api/payments';
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector';
import { submitCheckout } from '@/lib/paymentCheckout';
import { LoadingOverlay } from '@/components/common/loading';
import { useAuth } from '@/contexts/AuthContext';
import { SavedCard } from '@/types';
import { Lock, AlertCircle, Loader2, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import type { CategoryPaymentMode, LaborPaymentType } from '@/types';

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
  initialCardId?: string;
  initialCvv?: string;
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
    return 'You will be redirected to complete payment securely. This service uses two separate transactions: a deposit and a completion payment.';
  }
  return 'You will be redirected to complete payment securely.';
}

function isValidCvc(value: string): boolean {
  return /^\d{3,4}$/.test(value);
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
  initialCardId,
  initialCvv,
  onCancel,
}: PaymentModalProps) {
  const { user } = useAuth();
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | ''>('');
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SavedCard | null>(null);
  const [cvc, setCvc] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIsProcessing(false);
    setCvc(initialCvv || '');

    getPaymentProviders()
      .then((list) => {
        setProviders(list);
        setSelectedProvider(list[0] || '');
      })
      .catch(() => setProviders([]));

    if (!user) {
      setSavedCards([]);
      setSelectedCard(null);
      return;
    }

    setCardsLoading(true);
    getSavedCards(user.id)
      .then((cards) => {
        setSavedCards(cards);
        const preferred =
          cards.find((c) => c.id === initialCardId) ||
          cards.find((c) => c.isDefault) ||
          cards[0] ||
          null;
        setSelectedCard(preferred);
      })
      .catch(() => {
        setSavedCards([]);
        setSelectedCard(null);
      })
      .finally(() => setCardsLoading(false));
  }, [open, user, initialCardId, initialCvv]);

  const hasSavedCard = savedCards.length > 0 && selectedCard != null;
  const cvcValid = isValidCvc(cvc);
  const canPay =
    hasSavedCard && cvcValid && Boolean(selectedProvider) && !isProcessing && !cardsLoading;

  const handlePayment = async () => {
    setError(null);
    if (!selectedProvider) {
      setError('Please select a payment method');
      return;
    }
    if (!selectedCard) {
      setError('You need to add a payment card before paying.');
      return;
    }
    if (!cvcValid) {
      setError('Enter the 3 or 4 digit CVC code on your card.');
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
        cardId: selectedCard.id,
        cvv: cvc,
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
            </div>

            {cardsLoading ? (
              <p className="text-sm text-muted-foreground">Loading saved cards…</p>
            ) : !hasSavedCard ? (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg space-y-3 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>You need to add a payment card before paying.</p>
                </div>
                <Button variant="outline" size="sm" asChild className="border-destructive/30">
                  <Link to="/user/payments">Go to Payments</Link>
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <Label className="mb-2 block">Saved card</Label>
                  <div className="flex items-center gap-2 p-3 border border-border rounded-lg bg-muted/30">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="capitalize text-sm">{selectedCard.brand}</span>
                    <span className="text-sm">•••• {selectedCard.last4}</span>
                    {selectedCard.isDefault && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        Default
                      </Badge>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="payment-modal-cvc" className="mb-2 block">
                    CVC / Security Code
                  </Label>
                  <Input
                    id="payment-modal-cvc"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="123"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                    className="max-w-[120px]"
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter the 3 or 4 digit code on your card
                  </p>
                </div>
              </>
            )}

            <div>
              <Label className="mb-2 block">Payment provider</Label>
              <PaymentMethodSelector
                value={selectedProvider}
                onChange={setSelectedProvider}
                availableProviders={providers}
                disabled={isProcessing || !hasSavedCard}
              />
            </div>

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
                : 'You will be redirected to complete payment securely.'}
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
              {isProcessing ? 'Redirecting…' : `Pay ${formatCurrency(amount, { decimals: 2 })}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoadingOverlay open={isProcessing} message="Securing payment…" />
    </>
  );
}
