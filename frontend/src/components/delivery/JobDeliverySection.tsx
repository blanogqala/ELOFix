import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeliveryMap } from '@/components/tracking/DeliveryMap';
import { ProviderCourierQuotePanel } from '@/components/delivery/ProviderCourierQuotePanel';
import { CourierDeliveryFulfillment } from '@/components/delivery/CourierDeliveryFulfillment';
import { formatCurrency } from '@/lib/formatCurrency';
import { acceptDeliveryRequestQuote } from '@/lib/api/deliveryRequests';
import { PaymentModal } from '@/components/payments/PaymentModal';
import type { DeliveryGeoPoint, DeliveryRequestRecord, Job } from '@/types';
import { Package, Truck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/hooks/use-toast';
import { useOrderLocationSocket } from '@/hooks/useOrderLocationSocket';
import { useCourierProviderGeolocation } from '@/hooks/useCourierProviderGeolocation';
import { cn } from '@/lib/utils';
import { getCourierJobDisplayStatusLabel } from '@/lib/courierJobTimeline';
import {
  courierMapShowsDestination,
  getCourierMapRoutePhase,
  getCustomerCourierTrackingBanner,
} from '@/lib/customerCourierTracking';
import { formatDeliveryPointLabel } from '@/lib/formatAddress';
import { ensureSocketAuthAndConnect, socket } from '@/lib/socket';
import { resolveLinkedMaterialOrderId } from '@/lib/resolveLinkedMaterialOrderId';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { guardPaymentCardsForUser } from '@/lib/paymentCardGuard';
import { isCourierCancellationUnderReview } from '@/lib/jobUtils';

function resolveCollectionPoint(job: Job, dr: DeliveryRequestRecord): DeliveryGeoPoint {
  if (dr.collectionPoint?.address?.trim()) return dr.collectionPoint;
  const fromMeasurements = (job.measurements as { collectionPoint?: DeliveryGeoPoint })?.collectionPoint;
  if (fromMeasurements?.address?.trim()) return fromMeasurements;
  const fromLocation = (job.location as { collection?: DeliveryGeoPoint })?.collection;
  if (fromLocation?.address?.trim()) return fromLocation;
  return { address: 'Collection address pending — contact support' };
}

function resolveDestinationPoint(job: Job, dr: DeliveryRequestRecord): DeliveryGeoPoint {
  if (dr.destinationPoint?.address?.trim()) return dr.destinationPoint;
  const fromMeasurements = (job.measurements as { destinationPoint?: DeliveryGeoPoint })?.destinationPoint;
  if (fromMeasurements?.address?.trim()) return fromMeasurements;
  if (job.location?.address?.trim()) {
    return { address: job.location.address, city: job.location.city };
  }
  return { address: '—' };
}

const LIVE_TRACKING_FS = new Set(['COLLECTING', 'COLLECTED', 'OUT_FOR_DELIVERY', 'AT_DESTINATION']);

interface JobDeliverySectionProps {
  job: Job;
  deliveryRequest: DeliveryRequestRecord;
  variant: 'provider' | 'user';
  embedded?: boolean;
  /** Hide accept/pay on user view — use Service price card on job detail instead */
  hideQuotePaymentActions?: boolean;
  onDeliveryUpdated?: (request: DeliveryRequestRecord | null) => void;
  className?: string;
}

export function JobDeliverySection({
  job,
  deliveryRequest,
  variant,
  embedded = false,
  hideQuotePaymentActions = false,
  onDeliveryUpdated,
  className,
}: JobDeliverySectionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [payModalOpen, setPayModalOpen] = useState(false);

  const collection = resolveCollectionPoint(job, deliveryRequest);
  const destination = resolveDestinationPoint(job, deliveryRequest);

  const drStatus = String(deliveryRequest.status || 'pending_quote');
  const fs = String(deliveryRequest.fulfillmentStatus || 'READY').toUpperCase();
  const jobCancelled = String(job.status || '').toUpperCase() === 'CANCELLED';
  const underReview = isCourierCancellationUnderReview(job);
  const deliveryCancelled =
    jobCancelled ||
    underReview ||
    drStatus === 'cancelled' ||
    fs === 'CANCELLED';
  const paid =
    ['paid', 'in_transit', 'completed'].includes(drStatus) ||
    deliveryRequest.payment?.deliveryPaid === true;

  const activeFulfillment = !deliveryCancelled && LIVE_TRACKING_FS.has(fs);
  const customerLiveTracking = variant === 'user' && paid && activeFulfillment;
  const providerLiveTracking = variant === 'provider' && paid && activeFulfillment;

  const { liveLat, liveLng, pollFailed, isSocketReconnecting } = useOrderLocationSocket({
    orderId: deliveryRequest.id,
    enabled: customerLiveTracking,
  });

  const { geoError: providerGeoError } = useCourierProviderGeolocation({
    enabled: providerLiveTracking,
    deliveryRequestId: deliveryRequest.id,
  });

  const customerDriverLat =
    liveLat ??
    (deliveryRequest.driverLocation?.lat != null ? Number(deliveryRequest.driverLocation.lat) : null);
  const customerDriverLng =
    liveLng ??
    (deliveryRequest.driverLocation?.lng != null ? Number(deliveryRequest.driverLocation.lng) : null);

  const fullyComplete =
    job.status === 'COMPLETED' ||
    job.completionConfirmedByUser === true ||
    (deliveryRequest.deliveryConfirmed === true && deliveryRequest.customerRating != null);

  const mapCompletedMode =
    !deliveryCancelled &&
    (fullyComplete || (fs === 'COMPLETED' && deliveryRequest.deliveryConfirmed === true));
  const showCustomerMap = !deliveryCancelled && (activeFulfillment || mapCompletedMode);
  const headingToCustomer = courierMapShowsDestination(fs, mapCompletedMode);

  const mapDestCoords = useMemo(() => {
    const point = headingToCustomer ? destination : collection;
    if (point.coordinates?.lat != null && point.coordinates?.lng != null) {
      return { lat: point.coordinates.lat, lng: point.coordinates.lng };
    }
    return null;
  }, [
    mapCompletedMode,
    headingToCustomer,
    collection.coordinates?.lat,
    collection.coordinates?.lng,
    destination.coordinates?.lat,
    destination.coordinates?.lng,
  ]);

  const mapDestinationLabel = headingToCustomer
    ? formatDeliveryPointLabel(destination)
    : formatDeliveryPointLabel(collection);
  const mapRoutePhase = getCourierMapRoutePhase(fs, deliveryRequest, mapCompletedMode);

  const showQuotePanel =
    variant === 'provider' &&
    job.status !== 'PENDING' &&
    job.status !== 'REJECTED' &&
    !paid &&
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
  const customerBanner = getCustomerCourierTrackingBanner(fs, job, deliveryRequest);
  const linkedMaterialOrderId =
    variant === 'user' ? resolveLinkedMaterialOrderId(job, deliveryRequest) : null;

  const wrapperClass = embedded
    ? cn('card-elevated border border-primary/25 p-4 sm:p-6 space-y-4', className)
    : cn('card-elevated p-4 sm:p-6 space-y-4', className);

  const refresh = useCallback(
    (updated: DeliveryRequestRecord | null) => {
      onDeliveryUpdated?.(updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(job.id) });
      void queryClient.invalidateQueries({ queryKey: ['delivery-request-by-job', job.id] });
    },
    [job.id, onDeliveryUpdated, queryClient]
  );

  useEffect(() => {
    if (variant !== 'user' || !paid || !deliveryRequest.id) return;

    const deliveryRequestId = String(deliveryRequest.id);

    const joinRoom = () => {
      ensureSocketAuthAndConnect();
      if (socket.connected) {
        socket.emit('order:join', deliveryRequestId);
      }
    };

    const onFulfillmentUpdated = (data: { deliveryRequestId?: string }) => {
      if (String(data?.deliveryRequestId || '') !== deliveryRequestId) return;
      refresh(null);
    };

    const onConnect = () => joinRoom();

    ensureSocketAuthAndConnect();
    joinRoom();
    socket.on('connect', onConnect);
    socket.on('delivery-request:updated', onFulfillmentUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('delivery-request:updated', onFulfillmentUpdated);
    };
  }, [variant, paid, deliveryRequest.id, refresh]);

  return (
    <div className={wrapperClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          {embedded ? 'Delivery for this job' : 'Delivery'}
        </h2>
        <Badge variant="outline">{statusLabel}</Badge>
      </div>

      {variant === 'user' && (paid || deliveryCancelled) ? (
        <div className={cn('rounded-lg border p-4 space-y-1', customerBanner.tone)}>
          <p className="font-medium text-sm">{customerBanner.title}</p>
          <p className="text-xs text-muted-foreground">{customerBanner.description}</p>
          {deliveryCancelled && linkedMaterialOrderId ? (
            <Button
              type="button"
              size="sm"
              className="btn-accent mt-2"
              onClick={() =>
                navigate(`/user/material-orders/${encodeURIComponent(linkedMaterialOrderId)}`)
              }
            >
              Choose new delivery option
            </Button>
          ) : null}
        </div>
      ) : null}

      {variant === 'provider' && underReview ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-1">
          <p className="font-medium text-sm">Under investigation</p>
          <p className="text-xs text-muted-foreground">
            This cancellation is under admin review. Collection, navigation, and live location sharing
            are disabled.
          </p>
        </div>
      ) : null}

      {variant === 'provider' && deliveryCancelled && !underReview ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-1">
          <p className="font-medium text-sm text-destructive">Delivery cancelled</p>
          <p className="text-xs text-muted-foreground">
            This courier assignment is cancelled. Collection and delivery actions are disabled.
          </p>
        </div>
      ) : null}

      {variant === 'provider' && !deliveryCancelled ? (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Collection address</p>
            <p className="text-foreground">{formatDeliveryPointLabel(collection)}</p>
          </div>
          <div className="border-t border-border pt-2">
            <p className="text-xs font-medium text-muted-foreground">Delivery address</p>
            <p className="text-foreground">{formatDeliveryPointLabel(destination)}</p>
          </div>
        </div>
      ) : null}

      {variant === 'user' && paid && showCustomerMap ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <DeliveryMap
            className="w-full border-0 shadow-sm"
            mapContainerClassName="h-56 w-full sm:h-72"
            lat={!mapCompletedMode && activeFulfillment ? customerDriverLat : null}
            lng={!mapCompletedMode && activeFulfillment ? customerDriverLng : null}
            destination={mapDestinationLabel}
            destinationCoords={mapDestCoords}
            routePhase={mapRoutePhase}
            completedMode={mapCompletedMode}
            showWaitingBanner={
              !mapCompletedMode &&
              customerLiveTracking &&
              customerDriverLat == null &&
              !pollFailed &&
              !isSocketReconnecting
            }
            trackingEnded={
              !mapCompletedMode && customerLiveTracking && pollFailed && customerDriverLat == null
            }
          />
          {customerLiveTracking && isSocketReconnecting ? (
            <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
              Reconnecting to live tracking…
            </p>
          ) : null}
          {customerLiveTracking && pollFailed && customerDriverLat == null ? (
            <p className="text-xs text-amber-700 dark:text-amber-200 px-3 py-2 border-t border-border">
              Waiting for courier location — it will appear when they start sharing GPS.
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Items
              </CardTitle>
              {variant === 'user' && linkedMaterialOrderId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 whitespace-nowrap"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/user/material-orders/${encodeURIComponent(linkedMaterialOrderId)}`);
                  }}
                >
                  View order details
                </Button>
              ) : null}
            </div>
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

      {variant === 'user' && drStatus === 'quoted' && !hideQuotePaymentActions ? (
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

      {variant === 'user' && drStatus === 'approved' && !paid && deliveryRequest.quotedFee != null && !hideQuotePaymentActions ? (
        <Button
          type="button"
          className="btn-accent w-full sm:w-auto"
          onClick={async () => {
            if (!user) return;
            const canPay = await guardPaymentCardsForUser(user.id, toast);
            if (!canPay) return;
            setPayModalOpen(true);
          }}
        >
          Pay delivery fee
        </Button>
      ) : null}

      {showQuotePanel ? (
        <ProviderCourierQuotePanel
          deliveryRequest={deliveryRequest}
          onUpdated={(updated) => refresh(updated)}
        />
      ) : null}

      {variant === 'provider' && paid && !deliveryCancelled ? (
        <CourierDeliveryFulfillment
          deliveryRequestId={deliveryRequest.id}
          fulfillmentStatus={fs}
          collection={collection}
          destination={destination}
          deliveryConfirmed={deliveryRequest.deliveryConfirmed}
          deliveryConfirmedAt={deliveryRequest.deliveryConfirmedAt}
          customerRating={deliveryRequest.customerRating}
          geoError={providerGeoError}
          onUpdated={(updated) => refresh(updated)}
        />
      ) : null}

      <PaymentModal
        open={payModalOpen}
        onOpenChange={setPayModalOpen}
        title="Pay delivery fee"
        description="Complete payment so your courier can collect materials and deliver to your job site."
        amount={deliveryRequest.quotedFee ?? 0}
        kind="DELIVERY_FEE"
        jobId={deliveryRequest.jobId || job.id}
        materialOrderId={deliveryRequest.materialOrderId}
        metadata={{ deliveryRequestId: deliveryRequest.id }}
        breakdown={[
          { label: 'Delivery fee', amount: deliveryRequest.quotedFee ?? 0 },
          { label: 'Total due', amount: deliveryRequest.quotedFee ?? 0, isBold: true },
        ]}
      />
    </div>
  );
}
