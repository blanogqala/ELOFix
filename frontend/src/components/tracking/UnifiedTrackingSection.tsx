import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeliveryMap } from '@/components/tracking/DeliveryMap';
import type { DriverProximityPayload } from '@/components/tracking/DeliveryMap';
import { FulfillmentPhaseTimeline } from '@/components/tracking/FulfillmentPhaseTimeline';
import { buildPublicTrackingUrl } from '@/lib/publicTrackingUrl';
import { useToast } from '@/hooks/use-toast';
import { ExternalLink, Link2, MapPin, Truck } from 'lucide-react';
import type { MaterialBatch } from '@/types';
import { cn } from '@/lib/utils';
import { fulfillmentStatusBadgeLabel } from '@/lib/materialBatchTracking';

export type UnifiedDeliveryMode = 'self_pickup' | 'store_delivery' | 'provider_delivery';

function modeHeadline(mode: UnifiedDeliveryMode): string {
  if (mode === 'self_pickup') return 'Self pickup';
  if (mode === 'store_delivery') return 'Delivered by Store';
  return 'Delivered by Provider';
}

function fulfillmentUpper(s: string | undefined): string {
  return String(s || '').toUpperCase();
}

interface StatusBannerSpec {
  className: string;
  title: string;
  description?: string;
}

function deriveStatusBanner(
  mode: UnifiedDeliveryMode,
  fulfillmentStatus: string | undefined,
  proximity: { near: boolean; arriving: boolean } | null,
  awaitingCustomerConfirmation: boolean
): StatusBannerSpec | null {
  const u = fulfillmentUpper(fulfillmentStatus);
  if (u === 'FAILED' || u === 'CANCELLED') {
    return {
      className: 'border-destructive/40 bg-destructive/10 text-destructive',
      title:
        u === 'CANCELLED' ? 'This order was cancelled.' : 'Delivery could not be completed.',
      description: 'Tracking is closed. Contact support if you still need assistance.',
    };
  }
  if (u === 'DELAYED') {
    return {
      className: 'border-amber-500/40 bg-amber-500/12 text-amber-950 dark:text-amber-100',
      title: 'Running a little late',
      description: 'The driver is still on the way. Thanks for your patience.',
    };
  }
  if (u === 'COMPLETED' && awaitingCustomerConfirmation) {
    return {
      className: 'border-amber-500/35 bg-amber-500/8 text-amber-950 dark:text-amber-100',
      title: 'Delivered',
      description:
        mode === 'self_pickup'
          ? 'Please confirm you collected everything using the button below.'
          : 'Please confirm receipt using the button below.',
    };
  }
  if (u === 'COMPLETED') {
    return {
      className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
      title: 'Order delivered',
      description:
        mode === 'self_pickup' ? 'Pickup complete — thanks for confirming when prompted.' : 'Thanks for using live tracking.',
    };
  }
  if (u === 'OUT_FOR_DELIVERY' && proximity?.arriving) {
    return {
      className: 'border-primary/35 bg-primary/12 text-primary',
      title: 'Driver arriving',
      description:
        mode === 'store_delivery'
          ? 'Store driver is almost at your drop-off.'
          : 'Your courier is almost at the job site.',
    };
  }
  if (u === 'OUT_FOR_DELIVERY' && proximity?.near && !proximity.arriving) {
    return {
      className: 'border-primary/30 bg-primary/10 text-primary',
      title: 'Driver is near',
      description: 'They are within about 500m of the destination.',
    };
  }
  if (u === 'OUT_FOR_DELIVERY') {
    return {
      className: 'border-sky-500/35 bg-sky-500/10 text-sky-950 dark:text-sky-100',
      title: 'Driver is on the way',
      description:
        mode === 'provider_delivery'
          ? 'Follow your courier in real time on the map.'
          : 'Track the store delivery on the map when GPS is active.',
    };
  }
  if (['ACCEPTED', 'PREPARING'].includes(u)) {
    return {
      className: 'border-border bg-muted/40 text-foreground',
      title: 'Your order is being prepared',
      description: mode === 'self_pickup' ? 'We’ll let you know when it’s ready to collect.' : 'Hang tight — dispatch comes next.',
    };
  }
  if (u === 'READY') {
    if (mode === 'self_pickup') return null;
    return {
      className: 'border-primary/30 bg-primary/8 text-foreground',
      title: 'Order ready',
      description:
        mode === 'store_delivery'
          ? 'Tracking link and live map activate when the driver goes out.'
          : 'Your provider will begin GPS tracking once they’re dispatched.',
    };
  }
  return null;
}

export interface UnifiedTrackingSectionProps {
  variant?: 'full' | 'embedded';
  mode: UnifiedDeliveryMode;
  fulfillmentStatus?: string;
  materialBatch?: MaterialBatch | null;

  /** When true, live map reflects driver + destination rules for this viewer. */
  showLiveMap: boolean;

  mapLat: number | null;
  mapLng: number | null;
  destination?: string;
  destinationCoords?: { lat: number; lng: number } | null;

  lastDriverPingMs?: number | null;
  locationPollFailed?: boolean;
  socketReconnecting?: boolean;

  activeTrackingId?: string | null;
  activeTrackingToken?: string | null;

  supplierDisplayName?: string;
  supplierPhone?: string;
  supplierAddress?: string;

  assignedDriverName?: string | null;

  courierName?: string | null;
  courierVehicle?: string | null;

  onConfirmDelivery?: () => void;
  confirmDeliveryPending?: boolean;
  showConfirmDelivery: boolean;
  confirmDeliveryLabel?: string;

  fullTrackingHref?: string;
}

export function UnifiedTrackingSection({
  variant = 'full',
  mode,
  fulfillmentStatus,
  materialBatch,
  showLiveMap,
  mapLat,
  mapLng,
  destination,
  destinationCoords,
  lastDriverPingMs,
  locationPollFailed,
  socketReconnecting = false,
  activeTrackingId,
  activeTrackingToken,
  supplierDisplayName,
  supplierPhone,
  supplierAddress,
  assignedDriverName,
  courierName,
  courierVehicle,
  onConfirmDelivery,
  confirmDeliveryPending,
  showConfirmDelivery,
  confirmDeliveryLabel,
  fullTrackingHref,
}: UnifiedTrackingSectionProps) {
  const { toast } = useToast();
  const fulfillmentU = fulfillmentUpper(fulfillmentStatus);
  const [proximity, setProximity] = useState<{ near: boolean; arriving: boolean } | null>(null);

  const onProximity = useCallback((v: DriverProximityPayload) => {
    setProximity({ near: v.near, arriving: v.arriving });
  }, []);

  useEffect(() => {
    setProximity(null);
  }, [fulfillmentU]);

  useEffect(() => {
    if (!proximity?.arriving || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification('EloFix', { body: 'Your driver is arriving.' });
    } catch {
      /* ignore */
    }
  }, [proximity?.arriving]);

  const banner = deriveStatusBanner(mode, fulfillmentStatus, proximity, showConfirmDelivery);

  const hasLiveCoords =
    mapLat != null && mapLng != null && Number.isFinite(Number(mapLat)) && Number.isFinite(Number(mapLng));

  const OFFLINE_MS = 30_000;
  const driverOffline =
    Boolean(showLiveMap) && lastDriverPingMs != null && Date.now() - lastDriverPingMs > OFFLINE_MS;
  const offlineSeconds =
    driverOffline && lastDriverPingMs != null
      ? Math.max(0, Math.floor((Date.now() - lastDriverPingMs) / 1000))
      : 0;

  const trackingUrl =
    activeTrackingId && mode === 'store_delivery' && fulfillmentU === 'OUT_FOR_DELIVERY'
      ? buildPublicTrackingUrl(activeTrackingId, activeTrackingToken)
      : '';

  const embed = variant === 'embedded';

  return (
    <div className={cn('space-y-4', embed && 'space-y-3')}>
      <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live delivery</p>
          <Badge variant="outline" className="text-[10px]">
            {modeHeadline(mode)}
          </Badge>
          {fulfillmentStatus ? (
            <Badge variant="secondary" className="text-[10px] capitalize">
              {fulfillmentStatusBadgeLabel(fulfillmentStatus)}
            </Badge>
          ) : null}
        </div>

        {banner ? (
          <div className={cn('rounded-lg border px-4 py-3 text-sm shadow-sm', banner.className)}>
            <p className="font-semibold leading-snug">{banner.title}</p>
            {banner.description ? (
              <p className={cn('mt-1 text-xs leading-relaxed opacity-95', banner.title && 'opacity-90')}>
                {banner.description}
              </p>
            ) : null}
          </div>
        ) : null}

        {(supplierDisplayName || supplierPhone || supplierAddress) && mode !== 'self_pickup' ? (
          <div className="text-xs border-t border-border pt-3 space-y-1">
            <p className="uppercase text-muted-foreground">Supplier</p>
            {supplierDisplayName ? <p className="font-medium text-foreground">{supplierDisplayName}</p> : null}
            {supplierPhone ? <p className="text-muted-foreground">{supplierPhone}</p> : null}
            {supplierAddress ? <p className="text-muted-foreground">{supplierAddress}</p> : null}
          </div>
        ) : null}

        {mode === 'self_pickup' && (supplierAddress || supplierDisplayName) ? (
          <div className="rounded-lg border border-dashed border-primary/25 bg-primary/5 px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Ready for collection</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Head to the supplier when your timeline shows ready. Bring your order reference.
                </p>
              </div>
            </div>
            {supplierDisplayName ? (
              <p className="text-sm font-medium text-foreground">{supplierDisplayName}</p>
            ) : null}
            {supplierAddress ? <p className="text-sm text-muted-foreground">{supplierAddress}</p> : null}
            {supplierPhone ? (
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                <a href={`tel:${supplierPhone.replace(/\s/g, '')}`}>Call supplier</a>
              </Button>
            ) : null}
            {fulfillmentU === 'READY' ? (
              <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
                After staff hand you your materials they mark the order complete; you&apos;ll tap{' '}
                <span className="font-medium text-foreground">Confirm delivery</span> here when prompted.
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === 'provider_delivery' && (courierName || courierVehicle) && fulfillmentU === 'OUT_FOR_DELIVERY' ? (
          <div className="rounded-md border border-border bg-background/80 px-3 py-2 text-xs">
            <p className="font-semibold text-foreground mb-1">Courier</p>
            {courierName ? <p>{courierName}</p> : null}
            {courierVehicle ? <p className="text-muted-foreground">{courierVehicle}</p> : null}
          </div>
        ) : null}

        {mode === 'store_delivery' &&
        fulfillmentU === 'OUT_FOR_DELIVERY' &&
        (assignedDriverName || trackingUrl) ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-2">
            <p className="font-semibold flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" /> Store driver assigned
            </p>
            {assignedDriverName ? <p>Driver session: {assignedDriverName}</p> : null}
            {!assignedDriverName && trackingUrl ? (
              <p className="text-muted-foreground">Shareable session is active — open the tracking link.</p>
            ) : null}
          </div>
        ) : null}

        {mode === 'store_delivery' && trackingUrl ? (
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" /> Driver GPS link (store delivery)
            </p>
            <p className="text-[11px] text-muted-foreground break-all">{trackingUrl}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(trackingUrl);
                  toast({ title: 'Copied', description: 'Tracking link copied to clipboard.' });
                }}
              >
                Copy link
              </Button>
              <Button type="button" variant="ghost" size="sm" className="gap-1" asChild>
                <a href={trackingUrl} target="_blank" rel="noreferrer">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
            {embed ? (
              <p className="text-[11px] text-muted-foreground">
                Share this with whoever is driving. Your live map syncs once their phone sends GPS.
              </p>
            ) : null}
          </div>
        ) : null}

        {fullTrackingHref && embed ? (
          <Button variant="secondary" size="sm" className="w-full" asChild>
            <a href={fullTrackingHref}>Full tracking view</a>
          </Button>
        ) : null}
      </div>

      <FulfillmentPhaseTimeline fulfillmentStatus={fulfillmentStatus} />

      {showConfirmDelivery ? (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/8 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {mode === 'self_pickup'
              ? 'The store marked this complete. Confirm you picked up everything.'
              : 'Your courier marked delivery. Confirm you received everything.'}
          </p>
          <Button className="btn-accent shrink-0" onClick={onConfirmDelivery} disabled={confirmDeliveryPending}>
            {confirmDeliveryPending
              ? 'Confirming…'
              : confirmDeliveryLabel ||
                (mode === 'self_pickup' ? 'Mark as collected' : 'Confirm Delivery')}
          </Button>
        </div>
      ) : null}

      {!showLiveMap &&
      mode !== 'self_pickup' &&
      !['FAILED', 'CANCELLED', 'COMPLETED', 'DELAYED'].includes(fulfillmentU) ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center space-y-1">
          <p className="text-sm font-medium text-foreground">Order is being prepared</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Tracking will start when delivery begins · Drop-off for this order —{' '}
            {destination || materialBatch?.deliveryAddress || 'your job address'}.
          </p>
        </div>
      ) : null}

      {showLiveMap ? (
        <div className="space-y-2">
          {socketReconnecting ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              Reconnecting to live tracking…
            </p>
          ) : null}
          {locationPollFailed ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              Unable to refresh location. Check your connection; the tracking session may have ended.
            </p>
          ) : null}
          {driverOffline ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Driver offline{offlineSeconds > 0 ? ` · Last update ${offlineSeconds}s ago` : ''}
            </p>
          ) : null}
          <DeliveryMap
            lat={mapLat}
            lng={mapLng}
            destination={destination || materialBatch?.deliveryAddress || undefined}
            destinationCoords={destinationCoords ?? undefined}
            showWaitingBanner={showLiveMap && !hasLiveCoords}
            onProximityChange={onProximity}
          />
        </div>
      ) : null}
    </div>
  );
}
