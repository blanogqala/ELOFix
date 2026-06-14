import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeliveryMap } from '@/components/tracking/DeliveryMap';
import type { DriverProximityPayload } from '@/components/tracking/DeliveryMap';
import { FulfillmentPhaseTimeline } from '@/components/tracking/FulfillmentPhaseTimeline';
import { buildPublicTrackingUrl } from '@/lib/publicTrackingUrl';
import { useToast } from '@/hooks/use-toast';
import {
  Bike,
  CircleCheck,
  ClipboardList,
  ExternalLink,
  Link2,
  Lock,
  MapPin,
  Navigation,
  Package,
  Phone,
  Shield,
  Truck,
  X,
  AlertTriangle,
} from 'lucide-react';
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

function deliveryIssueReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    items_missing: 'Items missing',
    items_broken: 'Items broken or damaged',
    wrong_items: 'Wrong items delivered',
    not_received: 'Delivery not received',
    other: 'Other',
  };
  return map[reason] || reason;
}

interface StatusBannerSpec {
  className: string;
  title: string;
  description?: string;
}

function fulfillmentStatusIconKey(u: string) {
  if (['FAILED', 'CANCELLED'].includes(u)) return 'error';
  if (u === 'DELAYED') return 'delayed';
  if (u === 'COMPLETED') return 'done';
  if (u === 'OUT_FOR_DELIVERY') return 'out';
  if (u === 'READY') return 'ready';
  if (['ACCEPTED', 'PREPARING'].includes(u)) return 'prep';
  return 'default';
}

function StatusGlyph({ u }: { u: string }) {
  const k = fulfillmentStatusIconKey(u);
  if (k === 'done') return <CircleCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
  if (k === 'out') return <Navigation className="h-3.5 w-3.5 text-sky-600" aria-hidden />;
  if (k === 'ready') return <Package className="h-3.5 w-3.5 text-primary" aria-hidden />;
  if (k === 'prep') return <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
  if (k === 'delayed') return <Bike className="h-3.5 w-3.5 text-amber-600" aria-hidden />;
  if (k === 'error') return <Shield className="h-3.5 w-3.5 text-destructive" aria-hidden />;
  return <Package className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
}

function embeddedPhaseIndex(fulfillmentStatus: string | undefined): number {
  const u = fulfillmentUpper(fulfillmentStatus);
  if (['FAILED', 'CANCELLED'].includes(u)) return -1;
  if (u === 'COMPLETED') return 3;
  if (u === 'OUT_FOR_DELIVERY' || u === 'DELAYED') return 2;
  if (u === 'READY') return 1;
  return 0;
}

function EmbeddedProgressStrip({
  fulfillmentStatus,
  mode,
}: {
  fulfillmentStatus?: string;
  mode: UnifiedDeliveryMode;
}) {
  const u = fulfillmentUpper(fulfillmentStatus);
  if (['FAILED', 'CANCELLED'].includes(u)) return null;
  const idx = embeddedPhaseIndex(fulfillmentStatus);
  const stages =
    mode === 'self_pickup'
      ? (['Preparing', 'Ready for collection', 'Picked up'] as const)
      : (['Preparing', 'Ready for dispatch', 'Out for delivery', 'Delivered'] as const);
  const dots = stages.length;

  const activeIdx =
    mode === 'self_pickup'
      ? u === 'COMPLETED'
        ? 2
        : idx >= 2
          ? 2
          : idx === 1
            ? 1
            : 0
      : Math.min(Math.max(idx, 0), dots - 1);

  return (
    <div className="rounded-md border border-border/80 bg-background/60 px-3 py-2.5 space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: dots }).map((_, i) => (
          <div key={i} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                'h-2 w-full rounded-full transition-colors',
                i <= activeIdx ? 'bg-primary' : 'bg-muted-foreground/20'
              )}
            />
            {i < dots - 1 ? <span className="w-1 shrink-0" /> : null}
          </div>
        ))}
      </div>
      <p className="text-xs font-medium text-foreground leading-snug">
        {mode === 'self_pickup'
          ? u === 'COMPLETED'
            ? 'Pickup complete'
            : u === 'READY'
              ? 'Ready for collection'
              : ['OUT_FOR_DELIVERY'].includes(u)
                ? 'Collection in progress'
                : 'Preparing'
          : u === 'COMPLETED'
            ? 'Delivered'
            : u === 'OUT_FOR_DELIVERY' || u === 'DELAYED'
              ? 'Out for delivery'
              : u === 'READY'
                ? 'Ready — driver next'
                : 'Preparing'}
      </p>
    </div>
  );
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
  if (u === 'READY' && mode === 'self_pickup' && awaitingCustomerConfirmation) {
    return {
      className: 'border-primary/40 bg-primary/10 text-primary',
      title: 'Go collect your order',
      description: 'Your materials are ready. Confirm collection once staff has handed everything to you.',
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
        mode === 'self_pickup' ? 'Pickup complete — thanks for confirming.' : 'Thanks for using live tracking.',
    };
  }
  if (u === 'OUT_FOR_DELIVERY' && proximity?.arriving) {
    return {
      className: 'border-primary/35 bg-primary/12 text-primary',
      title: 'Driver arriving soon',
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

function actionCueLine(
  mode: UnifiedDeliveryMode,
  fulfillmentStatus: string | undefined,
  proximity: { near: boolean; arriving: boolean } | null,
  awaitingCustomerConfirmation: boolean
): string | null {
  const u = fulfillmentUpper(fulfillmentStatus);
  if (awaitingCustomerConfirmation && u === 'READY' && mode === 'self_pickup') {
    return 'Next: head to the supplier, then confirm collection below.';
  }
  if (awaitingCustomerConfirmation && u === 'COMPLETED') {
    return 'Next: confirm below to close this delivery.';
  }
  if (u === 'OUT_FOR_DELIVERY' && proximity?.arriving) return 'Driver arriving soon — be ready at the drop-off.';
  if (u === 'OUT_FOR_DELIVERY') return 'Driver is on the way — live map updates when GPS is active.';
  if (u === 'READY' && mode === 'self_pickup' && !awaitingCustomerConfirmation) {
    return 'You’ll be able to collect once the supplier marks this ready.';
  }
  return null;
}

export type UnifiedTrackingSectionArea = 'all' | 'order' | 'delivery';

export interface UnifiedTrackingSectionProps {
  variant?: 'full' | 'embedded';
  /** Split UI: supplier timeline in order summary; map + live courier in delivery card. */
  section?: UnifiedTrackingSectionArea;
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

  onReportDeliveryIssue?: () => void;
  reportIssuePending?: boolean;
  showReportDeliveryIssue?: boolean;
  showDeliveryIssueReported?: boolean;
  customerDeliveryIssue?: {
    reason: string;
    details?: string;
    reportedAt: string;
    status: string;
  };
  highlightConfirmSection?: boolean;

  fullTrackingHref?: string;

  /** After customer confirms — hide live map & block further actions. */
  trackingLocked?: boolean;
  showDeliverySuccessHighlight?: boolean;
  onDismissDeliverySuccess?: () => void;
}

export function UnifiedTrackingSection({
  variant = 'full',
  section = 'all',
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
  onReportDeliveryIssue,
  reportIssuePending,
  showReportDeliveryIssue,
  showDeliveryIssueReported,
  customerDeliveryIssue,
  highlightConfirmSection = false,
  fullTrackingHref,
  trackingLocked = false,
  showDeliverySuccessHighlight = false,
  onDismissDeliverySuccess,
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

  const locked = Boolean(trackingLocked) && fulfillmentU === 'COMPLETED';
  const mapActive = Boolean(showLiveMap) && !locked && variant !== 'embedded';

  const banner = deriveStatusBanner(mode, fulfillmentStatus, proximity, showConfirmDelivery);
  const cue = !locked ? actionCueLine(mode, fulfillmentStatus, proximity, showConfirmDelivery) : null;

  const hasLiveCoords =
    mapLat != null && mapLng != null && Number.isFinite(Number(mapLat)) && Number.isFinite(Number(mapLng));

  const OFFLINE_MS = 30_000;
  const driverOffline =
    Boolean(mapActive) && lastDriverPingMs != null && Date.now() - lastDriverPingMs > OFFLINE_MS;
  const offlineSeconds =
    driverOffline && lastDriverPingMs != null
      ? Math.max(0, Math.floor((Date.now() - lastDriverPingMs) / 1000))
      : 0;

  const trackingUrl =
    activeTrackingId && mode === 'store_delivery' && fulfillmentU === 'OUT_FOR_DELIVERY'
      ? buildPublicTrackingUrl(activeTrackingId, activeTrackingToken)
      : '';

  const embed = variant === 'embedded';
  const orderArea = section === 'all' || section === 'order';
  const deliveryArea = section === 'all' || section === 'delivery';

  const supplierPhaseBanner =
    banner &&
    !['OUT_FOR_DELIVERY', 'DELAYED'].includes(fulfillmentU) &&
    !(fulfillmentU === 'COMPLETED' && mode !== 'self_pickup');

  const courierPhaseBanner =
    banner &&
    (['OUT_FOR_DELIVERY', 'DELAYED'].includes(fulfillmentU) ||
      (fulfillmentU === 'COMPLETED' && mode !== 'self_pickup'));

  const storeDriverVisible =
    mode === 'store_delivery' &&
    !['FAILED', 'CANCELLED', 'COMPLETED'].includes(fulfillmentU) &&
    Boolean(assignedDriverName || supplierPhone || courierVehicle);

  if (section !== 'all' && !orderArea && !deliveryArea) return null;

  return (
    <div className={cn('space-y-4', embed && 'space-y-3')}>
      {deliveryArea && showDeliverySuccessHighlight ? (
        <div className="relative rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 pr-10 text-sm text-emerald-950 dark:text-emerald-50">
          <p className="font-semibold">Delivery completed successfully</p>
          <p className="mt-1 text-xs opacity-90">Thanks — you can rate the experience in the dialog.</p>
          {onDismissDeliverySuccess ? (
            <button
              type="button"
              className="absolute right-2 top-2 rounded-md p-1 text-emerald-900/70 hover:bg-emerald-500/20 dark:text-emerald-100/80"
              aria-label="Dismiss"
              onClick={onDismissDeliverySuccess}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {deliveryArea && locked ? (
        <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 flex gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0 text-foreground mt-0.5" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Tracking closed</p>
            <p className="text-xs mt-0.5 leading-relaxed">This delivery is confirmed. Live updates are no longer shown.</p>
          </div>
        </div>
      ) : null}

      {orderArea ? (
      <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-3">
        {embed ? <EmbeddedProgressStrip fulfillmentStatus={fulfillmentStatus} mode={mode} /> : null}

        {(section === 'all' || section === 'order') ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section === 'order' ? 'Supplier order status' : 'Order from supplier'}
          </p>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Package className="h-3 w-3" aria-hidden />
            {modeHeadline(mode)}
          </Badge>
          {fulfillmentStatus ? (
            <Badge variant="secondary" className="text-[10px] capitalize gap-1">
              <StatusGlyph u={fulfillmentU} />
              {fulfillmentStatusBadgeLabel(fulfillmentStatus)}
            </Badge>
          ) : null}
        </div>
        ) : null}

        {orderArea && cue && !['OUT_FOR_DELIVERY', 'DELAYED'].includes(fulfillmentU) ? (
          <p className="text-xs font-medium text-primary border-l-2 border-primary pl-2 py-0.5">{cue}</p>
        ) : null}

        {orderArea && supplierPhaseBanner ? (
          <div className={cn('rounded-lg border px-4 py-3 text-sm shadow-sm', banner!.className)}>
            <p className="font-semibold leading-snug">{banner!.title}</p>
            {banner!.description ? (
              <p className={cn('mt-1 text-xs leading-relaxed opacity-95', banner!.title && 'opacity-90')}>
                {banner!.description}
              </p>
            ) : null}
          </div>
        ) : null}

        {orderArea && mode === 'store_delivery' && ['READY', 'PREPARING', 'ACCEPTED', 'PENDING'].includes(fulfillmentU) ? (
          <div className="rounded-lg border border-border bg-background/70 px-3 py-2.5 space-y-2 text-xs">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Delivered by Store
            </p>
              <p className="text-muted-foreground leading-relaxed">Store delivery in progress — live map activates when the driver heads out.</p>
          </div>
        ) : null}

        {(supplierDisplayName || supplierPhone || supplierAddress) && mode !== 'self_pickup' && mode !== 'store_delivery' ? (
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
            {fulfillmentU === 'READY' && showConfirmDelivery ? (
              <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
                Tap <span className="font-medium text-foreground">Confirm collection</span> once you have all items.
              </p>
            ) : null}
          </div>
        ) : null}

        {fullTrackingHref && section === 'all' ? (
          <Button variant="secondary" size="sm" className="w-full hover:bg-accent/80 border-primary border" asChild>
            <Link to={fullTrackingHref}>Full tracking view</Link>
          </Button>
        ) : null}
      </div>
      ) : null}

      {orderArea && !embed ? <FulfillmentPhaseTimeline fulfillmentStatus={fulfillmentStatus} /> : null}

      {orderArea && showConfirmDelivery && !locked && mode === 'self_pickup' ? (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/8 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-sm ring-1 ring-emerald-500/15">
          <p className="text-sm text-muted-foreground">
            {mode === 'self_pickup'
              ? fulfillmentU === 'READY'
                ? 'Materials are ready at the supplier. Confirm once staff has handed you everything.'
                : 'Confirm you picked up everything.'
              : 'Your courier or store marked delivery. Confirm you received everything.'}
          </p>
          <Button className="btn-accent shrink-0 font-semibold" onClick={onConfirmDelivery} disabled={confirmDeliveryPending}>
            {confirmDeliveryPending
              ? 'Confirming…'
              : confirmDeliveryLabel ||
                (mode === 'self_pickup' ? 'Confirm collection' : 'Confirm delivery')}
          </Button>
        </div>
      ) : null}

      {deliveryArea && courierPhaseBanner ? (
        <div className={cn('rounded-lg border px-4 py-3 text-sm shadow-sm', banner!.className)}>
          <p className="font-semibold leading-snug">{banner!.title}</p>
          {banner!.description ? (
            <p className="mt-1 text-xs leading-relaxed opacity-90">{banner!.description}</p>
          ) : null}
        </div>
      ) : null}

      {deliveryArea && cue && ['OUT_FOR_DELIVERY', 'DELAYED'].includes(fulfillmentU) ? (
        <p className="text-xs font-medium text-primary border-l-2 border-primary pl-2 py-0.5">{cue}</p>
      ) : null}

      {deliveryArea && mode === 'store_delivery' && (fulfillmentU === 'OUT_FOR_DELIVERY' || fulfillmentU === 'DELAYED') ? (
        <div className="rounded-lg border border-border bg-background/70 px-3 py-2.5 space-y-2 text-xs">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Store driver
          </p>
          {storeDriverVisible ? (
            <ul className="space-y-1 text-muted-foreground">
              {assignedDriverName ? (
                <li className="flex gap-2 text-foreground">
                  <span className="text-muted-foreground shrink-0">Driver</span>
                  {assignedDriverName}
                </li>
              ) : null}
              {supplierPhone ? (
                <li className="flex gap-2 items-center">
                  <Phone className="h-3 w-3 shrink-0" aria-hidden />
                  <a className="underline-offset-2 hover:underline" href={`tel:${supplierPhone.replace(/\s/g, '')}`}>
                    {supplierPhone}
                  </a>
                </li>
              ) : null}
              {courierVehicle ? (
                <li>
                  <span className="text-muted-foreground">Vehicle </span>
                  {courierVehicle}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-muted-foreground leading-relaxed">Driver details will appear when the store dispatches.</p>
          )}
        </div>
      ) : null}

      {deliveryArea && mode === 'store_delivery' && trackingUrl ? (
        <div className="rounded-md border border-border p-3 space-y-2">
          <p className="text-xs font-medium flex items-center gap-1">
            <Link2 className="h-3.5 w-3.5" /> Driver GPS link
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
        </div>
      ) : null}

      {deliveryArea && showDeliveryIssueReported && !locked && mode !== 'self_pickup' ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/8 px-4 py-4 flex flex-col gap-2 shadow-sm ring-1 ring-amber-500/15">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" aria-hidden />
            <div>
              <p className="font-medium text-sm text-foreground">Issue reported — the branch has been notified</p>
              {customerDeliveryIssue ? (
                <p className="text-sm text-muted-foreground mt-1">
                  {deliveryIssueReasonLabel(customerDeliveryIssue.reason)}
                  {customerDeliveryIssue.details ? ` — ${customerDeliveryIssue.details}` : ''}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground mt-2">
                The store will follow up. You cannot confirm delivery until this is resolved.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {deliveryArea && showConfirmDelivery && !locked && mode !== 'self_pickup' ? (
        <div
          className={cn(
            'rounded-lg border border-emerald-500/35 bg-emerald-500/8 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-sm ring-1 ring-emerald-500/15',
            highlightConfirmSection && 'ring-2 ring-primary/40 animate-pulse'
          )}
        >
          <p className="text-sm text-muted-foreground">
            Your courier or store marked delivery. Confirm you received everything.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
            {showReportDeliveryIssue && onReportDeliveryIssue ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0 font-semibold border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={onReportDeliveryIssue}
                disabled={reportIssuePending || confirmDeliveryPending}
              >
                {reportIssuePending ? 'Submitting…' : 'Report issue'}
              </Button>
            ) : null}
            <Button className="btn-accent shrink-0 font-semibold" onClick={onConfirmDelivery} disabled={confirmDeliveryPending || reportIssuePending}>
              {confirmDeliveryPending ? 'Confirming…' : confirmDeliveryLabel || 'Confirm delivery'}
            </Button>
          </div>
        </div>
      ) : null}

      {deliveryArea &&
      !embed &&
      !mapActive &&
      mode !== 'self_pickup' &&
      !['FAILED', 'CANCELLED', 'COMPLETED', 'DELAYED'].includes(fulfillmentU) &&
      !locked ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center space-y-2">
          <Package className="h-8 w-8 mx-auto text-muted-foreground opacity-60" aria-hidden />
          <p className="text-sm font-medium text-foreground">Waiting to go out for delivery</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            The map turns on when the driver is dispatched. Drop-off —{' '}
            {destination || materialBatch?.deliveryAddress || 'your job address'}.
          </p>
        </div>
      ) : null}

      {deliveryArea && mapActive ? (
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
            showWaitingBanner={mapActive && !hasLiveCoords}
            onProximityChange={onProximity}
          />
        </div>
      ) : null}
    </div>
  );
}
