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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { SavedCard } from '@/types';
import { CreditCard, Lock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  savedCards: SavedCard[];
  onPaySuccess: (cardId: string, cvc: string) => Promise<void>;
  onCancel?: () => void;
}

export function PaymentModal({
  open,
  onOpenChange,
  title,
  description,
  amount,
  breakdown,
  savedCards,
  onPaySuccess,
  onCancel,
}: PaymentModalProps) {
  const defaultCard = savedCards.find(c => c.isDefault) || savedCards[0];
  const [selectedCardId, setSelectedCardId] = useState(defaultCard?.id || '');
  const [cvc, setCvc] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedCardId(defaultCard?.id || '');
      setCvc('');
      setError(null);
      setIsProcessing(false);
    }
  }, [open, defaultCard?.id]);

  const validateCvc = (value: string): boolean => {
    return /^\d{3,4}$/.test(value);
  };

  const handlePayment = async () => {
    setError(null);

    // Validate card selected
    if (!selectedCardId) {
      setError('Please select a payment card');
      return;
    }

    // Validate CVC
    if (!validateCvc(cvc)) {
      setError('Please enter a valid CVC (3-4 digits)');
      return;
    }

    setIsProcessing(true);
    try {
      await onPaySuccess(selectedCardId, cvc);
      onOpenChange(false);
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  if (savedCards.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No payment cards found. Please add a card in your Payments settings first.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Payment Breakdown */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            {breakdown.map((item, idx) => (
              <div 
                key={idx}
                className={cn(
                  "flex justify-between text-sm",
                  item.isBold && "font-bold text-base pt-2 border-t border-border"
                )}
              >
                <span className={item.isBold ? "" : "text-muted-foreground"}>
                  {item.label}
                </span>
                <span>${item.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Card Selection */}
          <div>
            <Label className="mb-2 block">Payment Method</Label>
            <RadioGroup value={selectedCardId} onValueChange={setSelectedCardId}>
              {savedCards.map(card => (
                <div 
                  key={card.id} 
                  className={cn(
                    "flex items-center space-x-3 p-3 border rounded-lg transition-colors",
                    selectedCardId === card.id 
                      ? "border-primary bg-primary/5" 
                      : "border-border"
                  )}
                >
                  <RadioGroupItem value={card.id} id={`card-${card.id}`} />
                  <Label htmlFor={`card-${card.id}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="capitalize">{card.brand}</span>
                      <span>•••• {card.last4}</span>
                      {card.isDefault && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* CVC Input */}
          <div>
            <Label htmlFor="cvc" className="mb-2 block">CVC / Security Code</Label>
            <Input
              id="cvc"
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="123"
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
              className="max-w-[120px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter the 3 or 4 digit code on your card
            </p>
          </div>

          {/* Error Message */}
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
          <Button 
            onClick={handlePayment}
            disabled={isProcessing || !selectedCardId}
            className="btn-accent"
          >
            {isProcessing ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
