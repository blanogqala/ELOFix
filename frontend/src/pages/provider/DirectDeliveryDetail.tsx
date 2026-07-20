import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  getDeliveryRequestById,
  patchDirectDeliveryFulfillment,
  submitDirectDeliveryQuote,
} from '@/lib/api/deliveryRequests';
import { formatCurrency } from '@/lib/formatCurrency';
import { ArrowLeft, MapPin, Navigation, Package } from 'lucide-react';

import { buildExternalDirectionsUrl } from '@/lib/map/externalNavigationUrl';

function mapsUrl(lat?: number, lng?: number, address?: string) {
  return buildExternalDirectionsUrl({ lat, lng, address });
}

export default function ProviderDirectDeliveryDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [feeInput, setFeeInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const { data: request, isLoading } = useQuery({
    queryKey: ['provider', 'direct-delivery', id],
    queryFn: () => getDeliveryRequestById(id),
    enabled: Boolean(id),
  });

  const quoteMut = useMutation({
    mutationFn: () => submitDirectDeliveryQuote(id, { fee: Number(feeInput), note: noteInput.trim() || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['provider', 'direct-delivery', id] });
      toast({ title: 'Quote sent' });
    },
    onError: () => toast({ title: 'Error', variant: 'destructive' }),
  });

  const fulfillMut = useMutation({
    mutationFn: (status: 'OUT_FOR_DELIVERY' | 'COMPLETED') => patchDirectDeliveryFulfillment(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['provider', 'direct-delivery', id] });
      toast({ title: 'Updated' });
    },
  });

  if (isLoading || !request) {
    return (
      <DashboardLayout>
        <p className="p-8 text-center text-muted-foreground">{isLoading ? 'Loading…' : 'Not found'}</p>
      </DashboardLayout>
    );
  }

  const canQuote = ['pending_quote', 'quoted'].includes(request.status);
  const canDeliver = request.status === 'paid' || request.fulfillmentStatus === 'OUT_FOR_DELIVERY';
  const collectUrl = mapsUrl(
    request.collectionPoint?.coordinates?.lat,
    request.collectionPoint?.coordinates?.lng,
    request.collectionPoint?.address
  );
  const destUrl = mapsUrl(
    request.destinationPoint?.coordinates?.lat,
    request.destinationPoint?.coordinates?.lng,
    request.destinationPoint?.address
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl py-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/provider/deliveries')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Deliveries
        </Button>
        <h1 className="text-xl font-semibold">Direct delivery</h1>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Route</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <p>Collect: {request.collectionPoint?.address}</p>
            {collectUrl ? (
              <Button asChild size="sm" variant="outline">
                <a href={collectUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="h-3 w-3 mr-1" />
                  Navigate to collection
                </a>
              </Button>
            ) : null}
            <p>Deliver: {request.destinationPoint?.address}</p>
            {destUrl ? (
              <Button asChild size="sm" variant="outline">
                <a href={destUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="h-3 w-3 mr-1" />
                  Navigate to destination
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Items
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {(request.items || []).map((item, i) => (
              <p key={i}>
                {item.name} × {item.qty}
                {item.weightKg != null ? ` (${item.weightKg} kg)` : ''}
              </p>
            ))}
          </CardContent>
        </Card>

        {canQuote ? (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Label>Quote fee (ZAR)</Label>
              <Input type="number" min={0} value={feeInput} onChange={(e) => setFeeInput(e.target.value)} />
              <Textarea rows={2} placeholder="Note" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} />
              <Button className="btn-accent" disabled={quoteMut.isPending} onClick={() => quoteMut.mutate()}>
                Send quote
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canDeliver ? (
          <div className="flex flex-wrap gap-2">
            {request.fulfillmentStatus !== 'OUT_FOR_DELIVERY' && request.fulfillmentStatus !== 'COMPLETED' ? (
              <Button onClick={() => fulfillMut.mutate('OUT_FOR_DELIVERY')}>Start delivery</Button>
            ) : null}
            {request.fulfillmentStatus === 'OUT_FOR_DELIVERY' ? (
              <Button onClick={() => fulfillMut.mutate('COMPLETED')}>Mark delivered</Button>
            ) : null}
          </div>
        ) : null}

        {request.quotedFee != null && request.status !== 'pending_quote' ? (
          <p className="text-sm text-muted-foreground">Quoted: {formatCurrency(request.quotedFee)}</p>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
