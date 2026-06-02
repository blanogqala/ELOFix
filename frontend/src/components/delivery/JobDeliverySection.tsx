import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeliveryMap } from '@/components/tracking/DeliveryMap';
import { ProviderCourierQuotePanel } from '@/components/delivery/ProviderCourierQuotePanel';
import { CourierDeliveryFulfillment } from '@/components/delivery/CourierDeliveryFulfillment';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  acceptDeliveryRequestQuote,
  payDeliveryRequest,
} from '@/lib/api/deliveryRequests';
import type { DeliveryGeoPoint, DeliveryRequestRecord, Job } from '@/types';
import { Package, Truck, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/hooks/use-toast';
import { useOrderLocationSocket } from '@/hooks/useOrderLocationSocket';
import { cn } from '@/lib/utils';
import { getCourierJobDisplayStatusLabel } from '@/lib/courierJobTimeline';

function resolveCollectionPoint(job: Job, dr: DeliveryRequestRecord): DeliveryGeoPoint {
  return (
    dr.collectionPoint ||
    (job.measurements as { collectionPoint?: DeliveryGeoPoint })?.collectionPoint ||
    (job.location as { collection?: DeliveryGeoPoint })?.collection ||
    { address: '—' }
  );
}

function resolveDestinationPoint(job: Job, dr: DeliveryRequestRecord): DeliveryGeoPoint {
  return (
    dr.destinationPoint ||
    (job.measurements as { destinationPoint?: DeliveryGeoPoint })?.destinationPoint ||
    (job.location as DeliveryGeoPoint) ||
    { address: job.location?.address || '—' }
  );
}

const LIVE_TRACKING_FS = new Set(['COLLECTING', 'COLLECTED', 'OUT_FOR_DELIVERY', 'AT_DESTINATION']);

function customerTrackingHeadline(fs: string): { title: string; description: string; tone: string } {
  if (fs === 'COLLECTING' || fs === 'COLLECTED') {
    return {
      title: 'Courier is collecting your items',
      description: 'Your provider is at or heading to the pickup location. Live location updates below.',
      tone: 'border-primary/30 bg-primary/5',
    };
  }
  if (fs === 'OUT_FOR_DELIVERY' || fs === 'AT_DESTINATION') {
    return {
      title: 'On the way to you',
      description:
        fs === 'AT_DESTINATION'
          ? 'Your courier has arrived — they will complete delivery shortly.'
          : 'Follow live movement on the map as your delivery approaches.',
      tone: 'border-accent/40 bg-accent/10',
    };
  }
  if (fs === 'COMPLETED') {
    return {
      title: 'Delivered — please confirm',
      description: 'Confirm receipt when everything looks good to close this job.',
      tone: 'border-success/30 bg-success/5',
    };
  }
  return {
    title: 'Delivery',
    description: 'Live tracking starts once your courier begins the trip.',
    tone: 'border-border bg-muted/20',
  };
}

interface JobDeliverySectionProps {
  job: Job;
  deliveryRequest: DeliveryRequestRecord;
  variant: 'provider' | 'user';
  embedded?: boolean;
  onDeliveryUpdated?: (request: DeliveryRequestRecord | null) => void;
  className?: string;
}

export function JobDeliverySection({
  job,
  deliveryRequest,
  variant,
  embedded = false,
  onDeliveryUpdated,
  className,
}: JobDeliverySectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);

  const collection = resolveCollectionPoint(job, deliveryRequest);
  const destination = resolveDestinationPoint(job, deliveryRequest);

  const drStatus = String(deliveryRequest.status || 'pending_quote');
  const fs = String(deliveryRequest.fulfillmentStatus || 'READY').toUpperCase();
  const paid = drStatus === 'paid' || deliveryRequest.payment?.deliveryPaid === true;

  const liveTrackingEnabled =
    variant === 'user' && paid && LIVE_TRACKING_FS.has(fs);

  const { liveLat, liveLng, pollFailed, isSocketReconnecting } = useOrderLocationSocket({
    orderId: deliveryRequest.id,
    enabled: liveTrackingEnabled,
  });

  const driverLat =
    liveLat ??
    (deliveryRequest.driverLocation?.lat != null ? Number(deliveryRequest.driverLocation.lat) : null);
  const driverLng =
    liveLng ??
    (deliveryRequest.driverLocation?.lng != null ? Number(deliveryRequest.driverLocation.lng) : null);

  const mapDestCoords = useMemo(() => {
    const headingToCustomer = fs === 'OUT_FOR_DELIVERY' || fs === 'AT_DESTINATION';
    const point = headingToCustomer ? destination : collection;
    if (point.coordinates?.lat != null && point.coordinates?.lng != null) {
      return { lat: point.coordinates.lat, lng: point.coordinates.lng };
    }
    return null;
  }, [fs, collection.coordinates?.lat, collection.coordinates?.lng, destination.coordinates?.lat, destination.coordinates?.lng]);

  const headingToCustomer = fs === 'OUT_FOR_DELIVERY' || fs === 'AT_DESTINATION';
  const mapDestinationLabel = headingToCustomer ? destination.address : collection.address;
  const mapRoutePhase = headingToCustomer ? ('to_destination' as const) : ('to_collection' as const);

  const showQuotePanel =
    variant === 'provider' &&
    job.status !== 'PENDING' &&
    job.status !== 'REJECTED' &&
    ['pending_quote', 'quoted', 'approved'].includes(drStatus);

  const items =
    deliveryRequest.items?.length > 0
      ? deliveryRequest.items
      : job.measurements?.deliveryItems?.map((i) => ({
          name: i.name,
          qty: i.qty,
          weightKg: i.weightKg,
        })) ||
        job.measurements?.movingItems?.map((i) => ({ name: i.name, qty: i.qty })) ||
        [];

  const statusLabel = getCourierJobDisplayStatusLabel(job, deliveryRequest);
  const customerBanner = customerTrackingHeadline(fs);

  const wrapperClass = embedded
    ? cn('card-elevated border border-primary/25 p-4 sm:p-6 space-y-4', className)
    : cn('card-elevated p-4 sm:p-6 space-y-4', className);

  const refresh = (updated: DeliveryRequestRecord | null) => {
    onDeliveryUpdated?.(updated);
    void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(job.id) });
    void queryClient.invalidateQueries({ queryKey: ['delivery-request-by-job', job.id] });
  };

  return (
    <div className={wrapperClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          {embedded ? 'Delivery for this job' : 'Delivery'}
        </h2>
        <Badge variant="outline">{statusLabel}</Badge>
      </div>

      {variant === 'user' && paid ? (
        <div className={cn('rounded-lg border p-4 space-y-1', customerBanner.tone)}>
          <p className="font-medium text-sm">{customerBanner.title}</p>
          <p className="text-xs text-muted-foreground">{customerBanner.description}</p>
        </div>
      ) : null}

      {(variant === 'user' && paid) || variant === 'provider' ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <DeliveryMap
            className="w-full border-0 shadow-sm"
            mapContainerClassName="h-56 w-full sm:h-72"
            lat={liveTrackingEnabled ? driverLat : null}
            lng={liveTrackingEnabled ? driverLng : null}
            destination={mapDestinationLabel}
            destinationCoords={mapDestCoords}
            routePhase={mapRoutePhase}
            showWaitingBanner={
              liveTrackingEnabled && driverLat == null && !pollFailed && !isSocketReconnecting
            }
            trackingEnded={pollFailed && driverLat == null}
          />
          {variant === 'user' && liveTrackingEnabled && isSocketReconnecting ? (
            <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
              Reconnecting to live tracking…
            </p>
          ) : null}
          {variant === 'user' && liveTrackingEnabled && pollFailed && driverLat == null ? (
            <p className="text-xs text-amber-700 dark:text-amber-200 px-3 py-2 border-t border-border">
              Waiting for courier location — it will appear when they start sharing GPS.
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Items
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {items.map((item, i) => (
              <p key={`${item.name}-${i}`}>
                {item.name} × {item.qty}
                {'weightKg' in item && item.weightKg != null ? ` (${item.weightKg} kg)` : ''}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {variant === 'user' && deliveryRequest.quotedFee != null && drStatus !== 'pending_quote' ? (
        <p className="text-sm rounded-lg border border-border bg-muted/30 px-3 py-2">
          Delivery fee: <strong>{formatCurrency(deliveryRequest.quotedFee)}</strong>
        </p>
      ) : null}

      {variant === 'user' && drStatus === 'quoted' ? (
        <Button
          type="button"
          className="btn-accent w-full sm:w-auto"
          onClick={async () => {
            try {
              const updated = await acceptDeliveryRequestQuote(deliveryRequest.id);
              refresh(updated);
              toast({ title: 'Quote accepted', description: 'You can pay for delivery below.' });
            } catch {
              toast({ title: 'Error', description: 'Could not accept quote.', variant: 'destructive' });
            }
          }}
        >
          Accept delivery quote
        </Button>
      ) : null}

      {variant === 'user' && drStatus === 'approved' && deliveryRequest.quotedFee != null ? (
        <Button
          type="button"
          className="btn-accent w-full sm:w-auto"
          disabled={paying}
          onClick={async () => {
            setPaying(true);
            try {
              const updated = await payDeliveryRequest(deliveryRequest.id, deliveryRequest.quotedFee!);
              refresh(updated);
              toast({ title: 'Payment recorded', description: 'Your courier can collect and deliver.' });
            } catch {
              toast({ title: 'Error', description: 'Payment failed.', variant: 'destructive' });
            } finally {
              setPaying(false);
            }
          }}
        >
          {paying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            'Pay delivery fee'
          )}
        </Button>
      ) : null}

      {showQuotePanel ? (
        <ProviderCourierQuotePanel
          deliveryRequest={deliveryRequest}
          onUpdated={(updated) => refresh(updated)}
        />
      ) : null}

      {variant === 'provider' && paid ? (
        <CourierDeliveryFulfillment
          deliveryRequestId={deliveryRequest.id}
          fulfillmentStatus={fs}
          collection={collection}
          destination={destination}
          onUpdated={(updated) => refresh(updated)}
        />
      ) : null}
    </div>
  );
}
