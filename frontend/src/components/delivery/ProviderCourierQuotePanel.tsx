import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  submitDirectDeliveryQuote,
  rejectDirectDeliveryRequest,
} from '@/lib/api/deliveryRequests';
import type { DeliveryRequestRecord } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface ProviderCourierQuotePanelProps {
  deliveryRequest: DeliveryRequestRecord;
  onUpdated: (request: DeliveryRequestRecord | null) => void;
}

export function ProviderCourierQuotePanel({ deliveryRequest, onUpdated }: ProviderCourierQuotePanelProps) {
  const { toast } = useToast();
  const [feeInput, setFeeInput] = useState(
    deliveryRequest.quotedFee != null ? String(deliveryRequest.quotedFee) : ''
  );
  const [noteInput, setNoteInput] = useState(deliveryRequest.quoteNote || '');
  const [busy, setBusy] = useState(false);

  const status = String(deliveryRequest.status || 'pending_quote');
  const deliveryPaid =
    ['paid', 'in_transit', 'completed'].includes(status) ||
    deliveryRequest.payment?.deliveryPaid === true;

  const handleSubmitQuote = async () => {
    const fee = Number(feeInput);
    if (!Number.isFinite(fee) || fee < 0) {
      toast({ title: 'Enter a valid fee', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const updated = await submitDirectDeliveryQuote(deliveryRequest.id, {
        fee,
        note: noteInput.trim() || undefined,
      });
      onUpdated(updated);
      toast({ title: 'Quote sent', description: 'The customer can review and pay your delivery fee.' });
    } catch {
      toast({ title: 'Error', description: 'Could not submit quote.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!window.confirm('Decline this delivery request?')) return;
    setBusy(true);
    try {
      const updated = await rejectDirectDeliveryRequest(deliveryRequest.id);
      onUpdated(updated);
      toast({ title: 'Declined', description: 'Delivery request declined.' });
    } catch {
      toast({ title: 'Error', description: 'Could not decline request.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (status === 'rejected') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        You declined this delivery request.
      </div>
    );
  }

  if (deliveryPaid) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm space-y-1">
        <Badge variant="secondary" className="capitalize">
          {status.replace(/_/g, ' ')}
        </Badge>
        <p>Delivery fee paid — use the collection and delivery actions below to start the trip.</p>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="rounded-lg border border-border p-4 text-sm">
        <p className="font-medium">Quote accepted — waiting for customer payment</p>
        <p className="text-muted-foreground mt-1">
          Your fee: {formatCurrency(deliveryRequest.quotedFee || 0)}
        </p>
      </div>
    );
  }

  if (status === 'quoted') {
    return (
      <div className="card-elevated border border-primary/25 p-4 sm:p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-lg">Delivery quote</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Quote sent — waiting for customer acceptance.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm space-y-1">
          <p>
            Your fee: <strong>{formatCurrency(deliveryRequest.quotedFee || 0)}</strong>
          </p>
          {deliveryRequest.quoteNote ? (
            <p className="text-muted-foreground text-xs">{deliveryRequest.quoteNote}</p>
          ) : null}
        </div>
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive"
          disabled={busy}
          onClick={() => void handleDecline()}
        >
          Decline
        </Button>
      </div>
    );
  }

  return (
    <div className="card-elevated border border-primary/25 p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Delivery quote</h2>
        <p className="text-sm text-muted-foreground">
          Submit your delivery fee. The customer pays after accepting your quote.
        </p>
        {deliveryRequest.quotedFee != null ? (
          <p className="text-sm mt-2">
            Current quote: <strong>{formatCurrency(deliveryRequest.quotedFee)}</strong>
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="courier-quote-fee">Fee (ZAR)</Label>
          <Input
            id="courier-quote-fee"
            type="number"
            min={0}
            step="0.01"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            placeholder="e.g. 250"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="courier-quote-note">Note (optional)</Label>
          <Textarea
            id="courier-quote-note"
            rows={2}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Vehicle, timing, access notes…"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="btn-accent" disabled={busy || !feeInput.trim()} onClick={() => void handleSubmitQuote()}>
          Send quote
        </Button>
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive"
          disabled={busy}
          onClick={() => void handleDecline()}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
