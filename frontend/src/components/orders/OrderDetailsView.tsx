import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, Store, FileText, CreditCard, RefreshCw, XCircle } from 'lucide-react';
import { DeliveryMap } from '@/components/tracking/DeliveryMap';
import { FulfillmentPhaseTimeline } from '@/components/tracking/FulfillmentPhaseTimeline';
import { canonicalDeliveryLabel } from '@/lib/deliveryTypes';
import { fulfillmentStatusBadgeLabel } from '@/lib/materialBatchTracking';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';

import type { MaterialBatch } from '@/types';
import type { CanonicalDeliveryType } from '@/lib/deliveryTypes';

export type NormalizedOrderDeliveryType = 'SELF' | 'STORE' | 'PROVIDER';

export type NormalizedDeliveryState =
  | 'SelfCollect'
  | 'PendingApproval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'InProgress'
  | 'Processing'
  | 'OnTheWay'
  | 'Delivered';

export interface NormalizedOrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface NormalizedOrder {
  id: string;
  storeName: string;
  items: NormalizedOrderItem[];
  deliveryType: NormalizedOrderDeliveryType;
  deliveryFee: number;
  totalPaid: number;
  createdAt: string;
  deliveryStatus: 'processing' | 'out_for_delivery' | 'delivered';
  deliveryState?: NormalizedDeliveryState;
  deliveryPaid?: boolean;
  materialsPaid?: boolean;
  invoiceId: string;
  deliveryInvoiceId?: string;
  providerName?: string;
  providerVehicle?: string;
  providerContact?: string;
  estimatedArrival?: string;
  jobId?: string;
  storeId?: string;
  /** Enriched when material order API / job snapshot is available */
  fulfillmentStatus?: string;
  materialBatch?: MaterialBatch | null;
  canonicalDelivery?: CanonicalDeliveryType;
  supplierDisplayName?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  activeTrackingId?: string | null;
  activeTrackingToken?: string | null;
  /** Canonical material order id for tracking room / poll */
  materialOrderId?: string;
  destinationCoords?: { lat: number; lng: number } | null;
  driverLocation?: { lat: number; lng: number; updatedAt?: string } | null;
  deliveryConfirmed?: boolean;
}

interface OrderDetailsViewProps {
  order: NormalizedOrder;
  liveDriverLat?: number | null;
  liveDriverLng?: number | null;
  mapDisplayLat?: number | null;
  mapDisplayLng?: number | null;
  lastDriverPingMs?: number | null;
  locationPollFailed?: boolean;
  /** When true, socket disconnected after a prior connect while live tracking is active */
  socketReconnecting?: boolean;
  onStatusChange?: (status: NormalizedOrder['deliveryStatus']) => void;
  onCancelDelivery?: () => void;
  onChangeDelivery?: () => void;
  onChooseDelivery?: () => void;
  onPayDelivery?: () => void;
  onSimulateApproval?: () => void;
  onSimulateRejection?: () => void;
  onViewMaterialInvoice?: (invoiceId: string) => void;
  onViewDeliveryInvoice?: (invoiceId: string) => void;
  onConfirmReceipt?: () => void;
  confirmReceiptPending?: boolean;
}

const DELIVERY_STATE_BADGES: Record<
  NormalizedDeliveryState,
  { label: string; className: string }
> = {
  SelfCollect: { label: 'Self-collect', className: 'bg-muted text-muted-foreground' },
  PendingApproval: { label: 'Waiting for approval', className: 'bg-warning/20 text-warning' },
  Approved: { label: 'Approved', className: 'bg-primary/20 text-primary' },
  Rejected: { label: 'Rejected', className: 'bg-destructive/20 text-destructive' },
  Cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  InProgress: { label: 'In progress', className: 'bg-primary/20 text-primary' },
  Processing: { label: 'Processing', className: 'bg-warning/20 text-warning' },
  OnTheWay: { label: 'On the way', className: 'bg-primary/20 text-primary' },
  Delivered: { label: 'Delivered', className: 'bg-success/20 text-success' },
};

function deliveryTrackingSourceLabel(order: NormalizedOrder): string {
  if (order.deliveryType === 'SELF') return 'Pickup by You';
  if (order.deliveryType === 'STORE') return 'Delivered by Store';
  if (order.deliveryType === 'PROVIDER') return 'Delivered by Provider';
  return '—';
}

function fulfillmentMaterialBadgeClass(fs: string | undefined): string {
  const u = String(fs || '').toUpperCase();
  if (u === 'FAILED') return 'bg-destructive/15 text-destructive border border-destructive/30';
  if (u === 'DELAYED') return 'bg-amber-500/15 text-amber-900 dark:text-amber-100 border border-amber-500/35';
  if (u === 'CANCELLED') return 'bg-muted text-muted-foreground border border-border';
  if (u === 'COMPLETED') return 'bg-success/20 text-success border border-success/25';
  return 'bg-secondary text-secondary-foreground border border-border';
}

export function OrderDetailsView({
  order,
  liveDriverLat,
  liveDriverLng,
  mapDisplayLat,
  mapDisplayLng,
  lastDriverPingMs,
  locationPollFailed,
  socketReconnecting = false,
  onCancelDelivery,
  onChangeDelivery,
  onChooseDelivery,
  onPayDelivery,
  onSimulateApproval,
  onSimulateRejection,
  onViewMaterialInvoice,
  onViewDeliveryInvoice,
  onConfirmReceipt,
  confirmReceiptPending,
}: OrderDetailsViewProps) {
  const canonical: CanonicalDeliveryType =
    order.canonicalDelivery ||
    (order.deliveryType === 'SELF'
      ? 'pickup'
      : order.deliveryType === 'PROVIDER'
        ? 'provider_delivery'
        : 'supplier_delivery');

  const fulfillmentU = String(order.fulfillmentStatus || '').toUpperCase();
  const showLiveMap =
    fulfillmentU === 'OUT_FOR_DELIVERY' &&
    canonical !== 'pickup' &&
    !['FAILED', 'CANCELLED'].includes(fulfillmentU);

  const mapLat = mapDisplayLat ?? liveDriverLat;
  const mapLng = mapDisplayLng ?? liveDriverLng;

  const [driverNearby, setDriverNearby] = useState(false);
  const onDriverProximity = useCallback((v: { near: boolean }) => {
    setDriverNearby(v.near);
  }, []);

  useEffect(() => {
    if (!showLiveMap) setDriverNearby(false);
  }, [showLiveMap]);

  useEffect(() => {
    if (!driverNearby) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification('EloFix', { body: 'Your driver is nearby.' });
    } catch {
      /* ignore */
    }
  }, [driverNearby]);

  const hasLiveCoords =
    (mapLat != null &&
      mapLng != null &&
      Number.isFinite(Number(mapLat)) &&
      Number.isFinite(Number(mapLng))) ||
    (liveDriverLat != null &&
      liveDriverLng != null &&
      Number.isFinite(Number(liveDriverLat)) &&
      Number.isFinite(Number(liveDriverLng))) ||
    (order.driverLocation?.lat != null &&
      order.driverLocation?.lng != null &&
      Number.isFinite(Number(order.driverLocation.lat)) &&
      Number.isFinite(Number(order.driverLocation.lng)));

  const OFFLINE_MS = 30_000;
  const driverOffline =
    showLiveMap && lastDriverPingMs != null && Date.now() - lastDriverPingMs > OFFLINE_MS;
  const offlineSeconds =
    driverOffline && lastDriverPingMs != null
      ? Math.max(0, Math.floor((Date.now() - lastDriverPingMs) / 1000))
      : 0;

  const showConfirmReceipt =
    fulfillmentU === 'COMPLETED' && order.deliveryConfirmed !== true && Boolean(onConfirmReceipt);

  const deliveryState = order.deliveryState || 'Processing';
  const stateBadge = DELIVERY_STATE_BADGES[deliveryState] || DELIVERY_STATE_BADGES.Processing;
  const showTracking = order.deliveryType !== 'SELF' && order.deliveryPaid;

  let trackingHint: string | null = null;
  if (canonical !== 'pickup' && showTracking) {
    if (fulfillmentU === 'READY' && order.deliveryType === 'PROVIDER') {
      trackingHint = 'Waiting for driver to start delivery.';
    } else if (['ACCEPTED', 'PREPARING'].includes(fulfillmentU)) {
      trackingHint = 'Driver is preparing your order.';
    } else if (fulfillmentU === 'COMPLETED') {
      trackingHint = 'Delivery completed.';
    }
  }

  const isPendingApproval = deliveryState === 'PendingApproval';
  const isApproved = deliveryState === 'Approved' && !order.deliveryPaid;
  const isRejected = deliveryState === 'Rejected';
  const isCancelled = deliveryState === 'Cancelled';
  const noDeliverySelected = isCancelled || !order.deliveryType;
  const isInProgressOrDelivered = deliveryState === 'InProgress' || deliveryState === 'Delivered' || deliveryState === 'OnTheWay';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <span>Order Summary</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium">{order.storeName}</p>
              <p className="text-sm text-muted-foreground">
                Order #{order.id.slice(-8)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{canonicalDeliveryLabel(canonical)}</Badge>
              <Badge className={stateBadge.className}>{stateBadge.label}</Badge>
              {order.deliveryStatus && (
                <Badge
                  className={cn(
                    order.deliveryStatus === 'delivered'
                      ? 'bg-success/20 text-success'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {order.deliveryStatus === 'processing' && 'Processing'}
                  {order.deliveryStatus === 'out_for_delivery' && 'On the Way'}
                  {order.deliveryStatus === 'delivered' && 'Delivered'}
                </Badge>
              )}
              {order.fulfillmentStatus ? (
                <Badge className={cn('text-xs', fulfillmentMaterialBadgeClass(order.fulfillmentStatus))}>
                  {fulfillmentStatusBadgeLabel(order.fulfillmentStatus)}
                </Badge>
              ) : null}
            </div>
            {trackingHint ? <p className="text-xs text-muted-foreground mt-2">{trackingHint}</p> : null}
          </div>

          <div className="space-y-2">
            {order.items.map(item => (
              <div
                key={item.productId}
                className="flex justify-between text-sm text-muted-foreground"
              >
                <span>
                  {item.name} × {item.qty}
                </span>
                <span>${(item.qty * item.unitPrice).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Material Total</span>
                <span>
                  {formatCurrency(
                    order.items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0),
                    { decimals: 2 }
                  )}
                </span>
              </div>
            </div>
          </div>

          {onViewMaterialInvoice && (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => onViewMaterialInvoice(order.invoiceId)}
            >
              <FileText className="h-4 w-4 mr-2" />
              View Invoice
            </Button>
          )}
        </CardContent>
      </Card>

      {showConfirmReceipt ? (
        <Card>
          <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Your order was marked delivered. Please confirm you received the materials.
            </p>
            <Button className="btn-accent shrink-0" onClick={onConfirmReceipt} disabled={confirmReceiptPending}>
              {confirmReceiptPending ? 'Confirming…' : 'Confirm receipt'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <span>Delivery</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery status</p>
            <p className="text-sm font-medium">{deliveryTrackingSourceLabel(order)}</p>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline" className="font-mono text-xs">
                {order.deliveryType}
              </Badge>
              {order.fulfillmentStatus ? (
                <Badge className={cn('text-xs', fulfillmentMaterialBadgeClass(order.fulfillmentStatus))}>
                  {fulfillmentStatusBadgeLabel(order.fulfillmentStatus)}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Awaiting fulfillment update
                </Badge>
              )}
            </div>
            {order.deliveryType !== 'SELF' ? (
              <p className="text-xs text-muted-foreground">
                Tracking source:{' '}
                <span className="font-medium text-foreground">
                  {order.deliveryType === 'PROVIDER' ? 'Provider' : 'Supplier'}
                </span>
              </p>
            ) : null}
            {(order.supplierDisplayName || order.supplierPhone || order.supplierAddress) && (
              <div className="text-xs border-t border-border pt-3 space-y-1">
                <p className="uppercase text-muted-foreground">Supplier</p>
                {order.supplierDisplayName ? (
                  <p className="font-medium text-foreground">{order.supplierDisplayName}</p>
                ) : null}
                {order.supplierPhone ? <p className="text-muted-foreground">{order.supplierPhone}</p> : null}
                {order.supplierAddress ? <p className="text-muted-foreground">{order.supplierAddress}</p> : null}
              </div>
            )}
          </div>

          <FulfillmentPhaseTimeline fulfillmentStatus={order.fulfillmentStatus} />

          {noDeliverySelected && (
            <div className="space-y-3 p-4 bg-muted/50 border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">No delivery selected.</p>
              <Button size="sm" className="btn-accent" onClick={onChooseDelivery}>
                <Truck className="h-3 w-3 mr-1" />
                Choose Delivery Option
              </Button>
            </div>
          )}

          {!noDeliverySelected && isPendingApproval && (
            <div className="space-y-3 p-4 bg-warning/10 border border-warning/30 rounded-lg">
              <Badge className={stateBadge.className}>Pending Approval</Badge>
              <p className="text-sm font-medium">Waiting for delivery approval</p>
              {order.deliveryType === 'PROVIDER' && (order.providerName || order.providerVehicle || order.deliveryFee > 0) && (
                <div className="text-sm text-muted-foreground space-y-1">
                  {order.providerName && <p>Driver: {order.providerName}</p>}
                  {order.providerVehicle && <p>Vehicle: {order.providerVehicle}</p>}
                  {order.deliveryFee > 0 && <p>Delivery price: ${order.deliveryFee.toFixed(2)}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onCancelDelivery}>
                  <XCircle className="h-3 w-3 mr-1" />
                  Cancel Delivery Request
                </Button>
                <Button size="sm" className="btn-accent" onClick={onChangeDelivery}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Change Delivery Provider
                </Button>
                {onSimulateApproval && (
                  <Button size="sm" variant="secondary" onClick={onSimulateApproval}>
                    Simulate Driver Approval
                  </Button>
                )}
                {onSimulateRejection && (
                  <Button size="sm" variant="secondary" onClick={onSimulateRejection}>
                    Simulate Driver Rejection
                  </Button>
                )}
              </div>
            </div>
          )}

          {!noDeliverySelected && isApproved && order.deliveryFee > 0 && (
            <div className="space-y-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div>
                <p className="font-medium">Delivery Information</p>
                <p className="text-sm text-muted-foreground">
                  Delivery approved — pay {formatCurrency(order.deliveryFee, { decimals: 2 })} to start delivery
                </p>
                {order.deliveryType === 'PROVIDER' && (order.providerName || order.providerVehicle) && (
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {order.providerName && <p>Driver: {order.providerName}</p>}
                    {order.providerVehicle && <p>Vehicle: {order.providerVehicle}</p>}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="btn-accent" onClick={onPayDelivery}>
                  <CreditCard className="h-3 w-3 mr-1" />
                  Pay Delivery
                </Button>
                <Button size="sm" variant="outline" onClick={onChangeDelivery}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Change Delivery Option
                </Button>
                <Button size="sm" variant="outline" onClick={onCancelDelivery}>
                  <XCircle className="h-3 w-3 mr-1" />
                  Cancel Delivery
                </Button>
              </div>
            </div>
          )}

          {!noDeliverySelected && isRejected && (
            <div className="space-y-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <Badge className={stateBadge.className}>Rejected</Badge>
              <p className="text-sm font-medium">Delivery request was rejected</p>
              <Button size="sm" className="btn-accent" onClick={onChooseDelivery}>
                <Truck className="h-3 w-3 mr-1" />
                Choose Delivery Option
              </Button>
            </div>
          )}

          {!noDeliverySelected && deliveryState === 'SelfCollect' && (
            <p className="text-sm text-muted-foreground">
              Collect your items at the store when ready.
            </p>
          )}

          {!noDeliverySelected && (showTracking || isInProgressOrDelivered) && (
            <>
              {order.deliveryInvoiceId && onViewDeliveryInvoice && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-3"
                  onClick={() => onViewDeliveryInvoice(order.deliveryInvoiceId!)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Delivery Invoice
                </Button>
              )}
              {showTracking ? (
                <>
                  {showLiveMap ? (
                    <div className="mt-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">Live location</p>
                        {driverNearby ? (
                          <Badge className="bg-primary/15 text-primary border-primary/30">Driver is near</Badge>
                        ) : null}
                      </div>
                      {socketReconnecting ? (
                        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                          Reconnecting…
                        </p>
                      ) : null}
                      {locationPollFailed ? (
                        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                          Unable to fetch live location. Check your connection or try again; tracking session may have
                          expired.
                        </p>
                      ) : null}
                      {driverOffline ? (
                        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          Driver offline
                          {offlineSeconds > 0 ? ` · Last update ${offlineSeconds}s ago` : ''}
                        </p>
                      ) : null}
                      <DeliveryMap
                        className="mt-1"
                        lat={mapLat ?? order.driverLocation?.lat ?? null}
                        lng={mapLng ?? order.driverLocation?.lng ?? null}
                        destination={order.materialBatch?.deliveryAddress || undefined}
                        destinationCoords={order.destinationCoords ?? undefined}
                        showWaitingBanner={showLiveMap && !hasLiveCoords}
                        onProximityChange={onDriverProximity}
                      />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6">
                      <p className="text-sm text-muted-foreground text-center max-w-md mx-auto">
                        {fulfillmentU === 'COMPLETED'
                          ? 'Tracking has ended for this delivery.'
                          : fulfillmentU === 'DELAYED'
                            ? 'This delivery was reported delayed. Live map tracking is paused for now.'
                            : order.deliveryType === 'SELF'
                              ? 'Live map is not used for self-pickup orders.'
                              : 'Tracking will begin once the order is out for delivery.'}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Delivery is in progress or completed. Contact support if you need assistance.
                </p>
              )}
            </>
          )}

          {!noDeliverySelected && !isPendingApproval && !isApproved && !isRejected && deliveryState !== 'SelfCollect' && !showTracking && !isInProgressOrDelivered && (
            <p className="text-sm text-muted-foreground">
              Delivery details will appear here once your order is processed.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

