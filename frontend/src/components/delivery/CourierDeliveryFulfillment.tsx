import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  patchDirectDeliveryFulfillment,
  type CourierFulfillmentStatus,
} from '@/lib/api/deliveryRequests';
import type { DeliveryGeoPoint, DeliveryRequestRecord } from '@/types';
import { Navigation, Package, MapPin } from 'lucide-react';
import { socket } from '@/lib/socket';
import { getCurrentSession } from '@/lib/api/auth';
import { createLocationSendState, markLocationSent, shouldSendLocation } from '@/lib/geolocationSendGate';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ApiHttpError } from '@/api/client';

function mapsUrl(lat?: number, lng?: number, address?: string) {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (address?.trim()) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return null;
}

const LIVE_GPS_STATUSES = new Set(['COLLECTING', 'COLLECTED', 'OUT_FOR_DELIVERY', 'AT_DESTINATION']);

interface CourierDeliveryFulfillmentProps {
  deliveryRequestId: string;
  fulfillmentStatus: string;
  collection: DeliveryGeoPoint;
  destination: DeliveryGeoPoint;
  onUpdated: (request: DeliveryRequestRecord | null) => void;
}

export function CourierDeliveryFulfillment({
  deliveryRequestId,
  fulfillmentStatus,
  collection,
  destination,
  onUpdated,
}: CourierDeliveryFulfillmentProps) {
  const { toast } = useToast();
  const fs = String(fulfillmentStatus || 'READY').toUpperCase();
  const [geoNote, setGeoNote] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (status: CourierFulfillmentStatus) =>
      patchDirectDeliveryFulfillment(deliveryRequestId, status),
    onSuccess: (updated) => {
      onUpdated(updated);
      toast({ title: 'Status updated' });
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

  useEffect(() => {
    if (!LIVE_GPS_STATUSES.has(fs) || !deliveryRequestId) return;

    if (!navigator.geolocation) {
      setGeoNote('Enable location in your browser so the customer can follow your trip.');
      return;
    }

    const session = getCurrentSession();
    if (session?.token) socket.auth = { token: session.token };
    if (!socket.connected) socket.connect();

    const sendState = createLocationSendState();
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!shouldSendLocation(now, lat, lng, sendState)) return;
        markLocationSent(now, lat, lng, sendState);
        socket.emit('update_location', { orderId: deliveryRequestId, lat, lng });
        setGeoNote(null);
      },
      () => {
        setGeoNote('Allow location access to share live position with the customer.');
      },
      { enableHighAccuracy: true, maximumAge: 8000 }
    );

    return () => navigator.geolocation.clearWatch(wid);
  }, [fs, deliveryRequestId]);

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

  return (
    <div className="space-y-4">
      {(fs === 'READY' || fs === 'COLLECTING' || fs === 'COLLECTED') && (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Collection
          </p>
          <p className="text-sm flex items-start gap-2">
            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <span>{collection.address || '—'}</span>
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
              {geoNote ? (
                <p className="text-xs text-amber-700 dark:text-amber-200">{geoNote}</p>
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

      {(fs === 'COLLECTED' || fs === 'OUT_FOR_DELIVERY' || fs === 'AT_DESTINATION') && (
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
            <span>{destination.address || '—'}</span>
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
              {geoNote ? (
                <p className="text-xs text-amber-700 dark:text-amber-200">{geoNote}</p>
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

      {fs === 'COMPLETED' ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 p-3">
          Delivery completed — waiting for the customer to confirm.
        </p>
      ) : null}
    </div>
  );
}
