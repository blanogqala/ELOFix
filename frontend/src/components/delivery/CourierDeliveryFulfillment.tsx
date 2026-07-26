import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  patchDirectDeliveryFulfillment,
  type CourierFulfillmentStatus,
} from '@/lib/api/deliveryRequests';
import type { DeliveryGeoPoint, DeliveryRequestRecord } from '@/types';
import { Navigation, Package, MapPin, Star, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ApiHttpError } from '@/api/client';
import { formatDeliveryPointLabel } from '@/lib/formatAddress';

import { buildExternalDirectionsUrl } from '@/lib/map/externalNavigationUrl';
import { ensureSocketAuthAndConnect, socket } from '@/lib/socket';
import { COURIER_LIVE_GPS_STATUSES } from '@/hooks/useCourierProviderGeolocation';

function mapsUrl(lat?: number, lng?: number, address?: string) {
  return buildExternalDirectionsUrl({ lat, lng, address });
}

/** Push an immediate GPS sample when the courier enters a live-tracking status. */
function pushImmediateCourierLocation(deliveryRequestId: string) {
  if (!navigator.geolocation || !deliveryRequestId) return;
  ensureSocketAuthAndConnect();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const emit = () => socket.emit('update_location', { orderId: deliveryRequestId, lat, lng });
      if (socket.connected) emit();
      else socket.once('connect', emit);
    },
    () => {
      /* geoError is surfaced by useCourierProviderGeolocation on the job page */
    },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 }
  );
}

interface CourierDeliveryFulfillmentProps {
  deliveryRequestId: string;
  fulfillmentStatus: string;
  collection: DeliveryGeoPoint;
  destination: DeliveryGeoPoint;
  deliveryConfirmed?: boolean;
  deliveryConfirmedAt?: string;
  customerRating?: DeliveryRequestRecord['customerRating'];
  geoError?: string | null;
  /** When true, hide Navigate / Arrived actions (cancellation under admin review). */
  underReview?: boolean;
  onUpdated: (request: DeliveryRequestRecord | null) => void;
}

function formatCompletionDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function CourierDeliveryFulfillment({
  deliveryRequestId,
  fulfillmentStatus,
  collection,
  destination,
  deliveryConfirmed = false,
  deliveryConfirmedAt,
  customerRating,
  geoError = null,
  underReview = false,
  onUpdated,
}: CourierDeliveryFulfillmentProps) {
  const { toast } = useToast();
  const fs = String(fulfillmentStatus || 'READY').toUpperCase();

  const mut = useMutation({
    mutationFn: (status: CourierFulfillmentStatus) =>
      patchDirectDeliveryFulfillment(deliveryRequestId, status),
    onSuccess: (updated, status) => {
      onUpdated(updated);
      toast({ title: 'Status updated' });
      if (COURIER_LIVE_GPS_STATUSES.has(String(status || '').toUpperCase())) {
        pushImmediateCourierLocation(deliveryRequestId);
      }
    },
    onError: (err) => {
      const msg =
        err instanceof ApiHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not update delivery.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const collectUrl = mapsUrl(
    collection.coordinates?.lat,
    collection.coordinates?.lng,
    collection.address
  );
  const destUrl = mapsUrl(
    destination.coordinates?.lat,
    destination.coordinates?.lng,
    destination.address
  );

  const collectionLabel = collection.label?.trim();
  const fullyComplete = deliveryConfirmed && customerRating != null;
  const actionsDisabled = underReview || fs === 'CANCELLED';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {underReview ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">Under investigation</p>
          <p className="text-xs text-muted-foreground">
            Cancellation is under admin review. Navigate and fulfillment actions are disabled.
          </p>
        </div>
      ) : null}
      {!underReview && fs === 'CANCELLED' ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-2 sm:col-span-2">
          <p className="text-sm font-medium text-destructive">Delivery cancelled</p>
          <p className="text-xs text-muted-foreground">
            Collection and delivery actions are disabled for this cancelled assignment.
          </p>
        </div>
      ) : null}
      {!actionsDisabled && (fs === 'READY' || fs === 'COLLECTING' || fs === 'COLLECTED') && (
        <div className=" rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Collection
          </p>
          {collectionLabel ? (
            <p className="text-xs font-medium text-foreground">{collectionLabel}</p>
          ) : null}
          <p className="text-sm flex items-start gap-2">
            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <span>{formatDeliveryPointLabel(collection)}</span>
          </p>
          {collectUrl ? (
            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
              <a href={collectUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-3 w-3 mr-1" />
                Navigate to collection
              </a>
            </Button>
          ) : null}
          {fs === 'READY' ? (
            <Button
              type="button"
              className="btn-accent w-full sm:w-auto"
              disabled={mut.isPending}
              onClick={() => mut.mutate('COLLECTING')}
            >
              Start heading to collection
            </Button>
          ) : null}
          {fs === 'COLLECTING' ? (
            <>
              {geoError ? (
                <p className="text-xs text-amber-700 dark:text-amber-200">{geoError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sharing live location with the customer.</p>
              )}
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={mut.isPending}
                onClick={() => mut.mutate('COLLECTED')}
              >
                Arrived at collection — items collected
              </Button>
            </>
          ) : null}
          {fs === 'COLLECTED' ? (
            <p className="text-xs text-muted-foreground">Pickup complete. Start delivery to the customer below.</p>
          ) : null}
        </div>
      )}

      {!actionsDisabled && (fs === 'COLLECTED' || fs === 'OUT_FOR_DELIVERY' || fs === 'AT_DESTINATION') && (
        <div
          className={cn(
            'rounded-lg border p-4 space-y-3',
            fs === 'OUT_FOR_DELIVERY' || fs === 'AT_DESTINATION'
              ? 'border-accent/40 bg-accent/10'
              : 'border-border bg-muted/20'
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-accent flex items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5" />
            Delivery to customer
          </p>
          <p className="text-sm flex items-start gap-2">
            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <span>{formatDeliveryPointLabel(destination)}</span>
          </p>
          {destUrl ? (
            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
              <a href={destUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-3 w-3 mr-1" />
                Navigate to destination
              </a>
            </Button>
          ) : null}
          {fs === 'COLLECTED' ? (
            <Button
              type="button"
              className="btn-accent w-full sm:w-auto"
              disabled={mut.isPending}
              onClick={() => mut.mutate('OUT_FOR_DELIVERY')}
            >
              Start delivery to customer
            </Button>
          ) : null}
          {fs === 'OUT_FOR_DELIVERY' ? (
            <>
              {geoError ? (
                <p className="text-xs text-amber-700 dark:text-amber-200">{geoError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Customer can see you on the way.</p>
              )}
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={mut.isPending}
                onClick={() => mut.mutate('AT_DESTINATION')}
              >
                Arrived at destination
              </Button>
            </>
          ) : null}
          {fs === 'AT_DESTINATION' ? (
            <Button
              type="button"
              className="btn-accent w-full sm:w-auto"
              disabled={mut.isPending}
              onClick={() => mut.mutate('COMPLETED')}
            >
              Complete delivery
            </Button>
          ) : null}
        </div>
      )}

      {fs === 'COMPLETED' && fullyComplete ? (
        <div className="sm:col-span-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="font-semibold text-sm">Delivery completed</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Customer confirmed receipt on {formatCompletionDate(deliveryConfirmedAt)}.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5" aria-label={`${customerRating.rating} out of 5 stars`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'h-4 w-4',
                    i < customerRating.rating ? 'fill-accent text-accent' : 'text-muted-foreground/40'
                  )}
                />
              ))}
            </div>
            <span className="text-sm font-medium">{customerRating.rating}/5</span>
          </div>
          {customerRating.comment ? (
            <p className="text-sm text-muted-foreground italic">&ldquo;{customerRating.comment}&rdquo;</p>
          ) : null}
          {customerRating.createdAt ? (
            <p className="text-xs text-muted-foreground">
              Rated {formatCompletionDate(customerRating.createdAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {fs === 'COMPLETED' && deliveryConfirmed && !customerRating ? (
        <p className="sm:col-span-2 text-sm text-muted-foreground rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          Customer confirmed receipt — waiting for delivery feedback.
        </p>
      ) : null}

      {fs === 'COMPLETED' && !deliveryConfirmed ? (
        <p className="sm:col-span-2 text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 p-3">
          Delivery completed — waiting for the customer to confirm receipt.
        </p>
      ) : null}
    </div>
  );
}
