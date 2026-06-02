import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getMaterialOrderById } from '@/lib/api/materialOrders';
import {
  rejectCourierDeliveryRequest,
  submitCourierDeliveryQuote,
} from '@/lib/api/deliveryInbox';
import { ProviderCourierActions } from '@/components/tracking/ProviderCourierActions';
import { formatCurrency } from '@/lib/formatCurrency';
import { ArrowLeft, MapPin, Navigation, Package, Truck } from 'lucide-react';

function mapsDirectionsUrl(lat?: number, lng?: number, address?: string) {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  if (address?.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
  }
  return null;
}

export default function ProviderDeliveryDetail() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [feeInput, setFeeInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['courier', 'delivery', orderId],
    queryFn: () => getMaterialOrderById(orderId),
    enabled: Boolean(orderId),
  });

  const quoteMut = useMutation({
    mutationFn: () =>
      submitCourierDeliveryQuote(orderId, {
        fee: Number(feeInput),
        note: noteInput.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['courier', 'delivery', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['courier', 'delivery-inbox'] });
      toast({ title: 'Quote sent', description: 'The customer can review and pay your delivery fee.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not submit quote.', variant: 'destructive' });
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectCourierDeliveryRequest(orderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['courier', 'delivery-inbox'] });
      toast({ title: 'Declined', description: 'Delivery request declined.' });
      navigate('/provider/deliveries');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not decline request.', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="p-8 text-center text-muted-foreground">Loading delivery…</p>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground mb-4">Delivery not found or not assigned to you.</p>
          <Button variant="outline" onClick={() => navigate('/provider/deliveries')}>
            Back to deliveries
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const deliveryStatus = String(order.delivery?.status || 'PendingApproval');
  const fs = String(order.fulfillmentStatus || 'PENDING').toUpperCase();
  const collection = order.collectionPoint;
  const destination = order.destinationPoint;
  const collectUrl = mapsDirectionsUrl(collection?.coordinates?.lat, collection?.coordinates?.lng, collection?.address);
  const destUrl = mapsDirectionsUrl(destination?.coordinates?.lat, destination?.coordinates?.lng, destination?.address);
  const canQuote = ['PendingApproval', 'Quoted'].includes(deliveryStatus);
  const showCourierActions = order.payment?.deliveryPaid && fs !== 'COMPLETED';

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl animate-fade-in py-6 sm:py-8 space-y-5">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => navigate('/provider/deliveries')}>
          <ArrowLeft className="h-4 w-4" />
          Deliveries
        </Button>

        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-800">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{order.storeName || 'Delivery run'}</h1>
            <p className="text-sm text-muted-foreground">Order #{order.id.slice(0, 8)}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline">{deliveryStatus}</Badge>
              <Badge variant="secondary">{fs.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
        </div>

        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Route
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Collection</p>
              <p>{collection?.address || order.materialBatch?.pickupAddress || '—'}</p>
              {collectUrl ? (
                <Button asChild size="sm" variant="outline" className="mt-2 gap-1">
                  <a href={collectUrl} target="_blank" rel="noopener noreferrer">
                    <Navigation className="h-3.5 w-3.5" />
                    Navigate to collection
                  </a>
                </Button>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">Destination</p>
              <p>{destination?.address || order.materialBatch?.deliveryAddress || order.customerAddress || '—'}</p>
              {destUrl ? (
                <Button asChild size="sm" variant="outline" className="mt-2 gap-1">
                  <a href={destUrl} target="_blank" rel="noopener noreferrer">
                    <Navigation className="h-3.5 w-3.5" />
                    Navigate to destination
                  </a>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {(order.items || []).map((item) => (
                <li key={item.productId} className="flex justify-between py-2 gap-2">
                  <span>
                    {item.name} × {item.qty}
                  </span>
                  <span className="text-muted-foreground shrink-0">{formatCurrency(item.unitPrice * item.qty)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {canQuote ? (
          <Card className="border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your delivery quote</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.deliveryQuote?.fee != null ? (
                <p className="text-sm">
                  Current quote: <strong>{formatCurrency(order.deliveryQuote.fee)}</strong>
                  {order.deliveryQuote.note ? ` — ${order.deliveryQuote.note}` : ''}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Submit how much you will charge for this delivery. The customer pays after accepting your quote.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="quote-fee">Fee (ZAR)</Label>
                  <Input
                    id="quote-fee"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 250"
                    value={feeInput}
                    onChange={(e) => setFeeInput(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="quote-note">Note (optional)</Label>
                  <Textarea
                    id="quote-note"
                    rows={2}
                    placeholder="Vehicle size, timing, access notes…"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="btn-accent"
                  disabled={quoteMut.isPending || !feeInput.trim() || Number(feeInput) < 0}
                  onClick={() => quoteMut.mutate()}
                >
                  Send quote
                </Button>
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive"
                  disabled={rejectMut.isPending}
                  onClick={() => {
                    if (!window.confirm('Decline this delivery request?')) return;
                    rejectMut.mutate();
                  }}
                >
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {deliveryStatus === 'Approved' && !order.payment?.deliveryPaid ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-border p-3">
            Waiting for the customer to pay your approved delivery fee of{' '}
            {formatCurrency(order.deliveryFee || order.deliveryQuote?.fee || 0)}.
          </p>
        ) : null}

        {showCourierActions && order.jobId ? (
          <ProviderCourierActions
            jobId={order.jobId}
            orderId={order.id}
            fulfillmentStatus={order.fulfillmentStatus}
            deliveryType="PROVIDER"
          />
        ) : null}

        {showCourierActions && !order.jobId ? (
          <ProviderCourierActions
            jobId=""
            orderId={order.id}
            fulfillmentStatus={order.fulfillmentStatus}
            deliveryType="PROVIDER"
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}
