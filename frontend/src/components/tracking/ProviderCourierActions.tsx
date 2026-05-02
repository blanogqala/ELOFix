import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { patchProviderMaterialOrderFulfillment, type ProviderFulfillmentStatus } from '@/lib/api/materialOrders';
import { socket } from '@/lib/socket';
import { getCurrentSession } from '@/lib/api/auth';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/hooks/use-toast';
import { createLocationSendState, markLocationSent, shouldSendLocation } from '@/lib/geolocationSendGate';

interface ProviderCourierActionsProps {
  jobId: string;
  orderId: string;
  fulfillmentStatus?: string;
  /** Job store order delivery type */
  deliveryType: 'SELF' | 'STORE' | 'PROVIDER';
}

export function ProviderCourierActions({ jobId, orderId, fulfillmentStatus, deliveryType }: ProviderCourierActionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const st = String(fulfillmentStatus || 'PENDING').toUpperCase();
  const [geoNote, setGeoNote] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (status: ProviderFulfillmentStatus) => patchProviderMaterialOrderFulfillment(orderId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      toast({ title: 'Updated', description: 'Delivery status saved.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not update delivery.', variant: 'destructive' });
    },
  });

  // Live GPS only while courier is officially out for delivery (not DELAYED / COMPLETED).
  useEffect(() => {
    if (deliveryType !== 'PROVIDER' || st !== 'OUT_FOR_DELIVERY' || !orderId) return;

    if (!navigator.geolocation) {
      setGeoNote('Location services are not available in this browser.');
      return;
    }

    const session = getCurrentSession();
    if (session?.token) {
      socket.auth = { token: session.token };
    }
    if (!socket.connected) {
      socket.connect();
    }

    const sendState = createLocationSendState();
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!shouldSendLocation(now, lat, lng, sendState)) return;
        markLocationSent(now, lat, lng, sendState);
        socket.emit('update_location', {
          orderId,
          lat,
          lng,
        });
      },
      () => {
        setGeoNote('Allow location access to share live position with the customer.');
      },
      { enableHighAccuracy: true, maximumAge: 8000 }
    );

    return () => {
      navigator.geolocation.clearWatch(wid);
    };
  }, [deliveryType, st, orderId]);

  if (deliveryType !== 'PROVIDER') return null;

  return (
    <div className="mt-3 space-y-2 rounded-md border border-primary/25 bg-primary/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Courier (you)</p>
      {st === 'READY' && (
        <Button
          type="button"
          size="sm"
          className="btn-accent w-full sm:w-auto"
          disabled={mut.isPending}
          onClick={() => mut.mutate('OUT_FOR_DELIVERY')}
        >
          Start delivery / picked up
        </Button>
      )}
      {st === 'OUT_FOR_DELIVERY' && (
        <>
          {geoNote ? <p className="text-xs text-amber-700 dark:text-amber-200">{geoNote}</p> : (
            <p className="text-xs text-muted-foreground">Sharing your live location with the customer.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={mut.isPending}
              onClick={() => mut.mutate('COMPLETED')}
            >
              Mark delivered
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto border-amber-500/50 text-amber-800 dark:text-amber-200"
              disabled={mut.isPending}
              onClick={() => mut.mutate('DELAYED')}
            >
              Report delay
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto border-destructive/50 text-destructive"
              disabled={mut.isPending}
              onClick={() => {
                if (!window.confirm('Mark this delivery as failed?')) return;
                mut.mutate('FAILED');
              }}
            >
              Mark failed
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
