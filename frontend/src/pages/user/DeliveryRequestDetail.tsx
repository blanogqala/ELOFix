import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { acceptDeliveryRequestQuote, getDeliveryRequestById } from '@/lib/api/deliveryRequests';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { formatCurrency } from '@/lib/formatCurrency';
import { ArrowLeft, MapPin, Package, Truck } from 'lucide-react';

export default function DeliveryRequestDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [payModalOpen, setPayModalOpen] = useState(false);

  const { data: request, isLoading } = useQuery({
    queryKey: ['delivery-request', id],
    queryFn: () => getDeliveryRequestById(id),
    enabled: Boolean(id),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['delivery-request', id] });

  const handleAcceptQuote = async () => {
    try {
      await acceptDeliveryRequestQuote(id);
      toast({ title: 'Quote accepted', description: 'You can now pay for delivery.' });
      refresh();
    } catch {
      toast({ title: 'Error', description: 'Could not accept quote.', variant: 'destructive' });
    }
  };


  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="p-8 text-center text-muted-foreground">Loading…</p>
      </DashboardLayout>
    );
  }

  if (!request) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground mb-4">Delivery request not found.</p>
          <Button variant="outline" onClick={() => navigate('/user/new-request')}>
            New request
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const status = String(request.status || 'pending_quote');

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl py-6 sm:py-8 space-y-5 animate-fade-in">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
            <Truck className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Delivery request</h1>
            <Badge variant="outline" className="mt-2 capitalize">
              {status.replace(/_/g, ' ')}
            </Badge>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Route
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              <span className="font-medium">Collect:</span> {request.collectionPoint?.address || '—'}
            </p>
            <p>
              <span className="font-medium">Deliver:</span> {request.destinationPoint?.address || '—'}
            </p>
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
            <ul className="text-sm divide-y divide-border">
              {(request.items || []).map((item, i) => (
                <li key={i} className="py-2 flex justify-between gap-2">
                  <span>
                    {item.name} × {item.qty}
                    {item.weightKg != null ? ` (${item.weightKg} kg)` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {status === 'pending_quote' && (
          <p className="text-sm text-muted-foreground rounded-lg border p-3">
            Waiting for your courier to send a delivery price…
          </p>
        )}

        {status === 'quoted' && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="font-medium">
              Courier quoted {formatCurrency(request.quotedFee || 0)}
            </p>
            {request.quoteNote ? <p className="text-sm text-muted-foreground">{request.quoteNote}</p> : null}
            <Button className="btn-accent" onClick={() => void handleAcceptQuote()}>
              Accept quote
            </Button>
          </div>
        )}

        {status === 'approved' && !request.payment?.deliveryPaid && (
          <div className="rounded-lg border border-primary/30 p-4 space-y-3">
            <p className="font-medium">Pay {formatCurrency(request.quotedFee || 0)} to start delivery</p>
            <Button className="btn-accent" onClick={() => setPayModalOpen(true)}>
              Pay delivery fee
            </Button>
          </div>
        )}

        {['paid', 'in_transit', 'completed'].includes(status) && (
          <p className="text-sm text-success rounded-lg border border-success/30 bg-success/5 p-3">
            Delivery fee paid — your courier will update progress here.
            {request.fulfillmentStatus === 'OUT_FOR_DELIVERY' ? ' Courier is on the way.' : ''}
          </p>
        )}
        <PaymentModal
          open={payModalOpen}
          onOpenChange={setPayModalOpen}
          title="Pay delivery fee"
          description="You will be redirected to complete payment securely."
          amount={request.quotedFee ?? 0}
          kind="DELIVERY_FEE"
          jobId={request.jobId}
          materialOrderId={request.materialOrderId}
          metadata={{ deliveryRequestId: request.id }}
          breakdown={[
            { label: 'Delivery fee', amount: request.quotedFee ?? 0 },
            { label: 'Total due', amount: request.quotedFee ?? 0, isBold: true },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
