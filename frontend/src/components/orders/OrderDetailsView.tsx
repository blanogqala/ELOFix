import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Truck,
  Store,
  FileText,
  CreditCard,
  RefreshCw,
  XCircle,
  Phone,
  Mail,
  MapPin,
  Package,
  User,
} from 'lucide-react';
import { UnifiedTrackingSection, type UnifiedDeliveryMode } from '@/components/tracking/UnifiedTrackingSection';
import { canonicalDeliveryLabel } from '@/lib/deliveryTypes';
import { fulfillmentStatusBadgeLabel } from '@/lib/materialBatchTracking';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { format, parseISO } from 'date-fns';

import type { MaterialBatch } from '@/types';
import type { CanonicalDeliveryType } from '@/lib/deliveryTypes';

export type NormalizedOrderDeliveryType = 'SELF' | 'STORE' | 'PROVIDER';

export type NormalizedDeliveryState =
  | 'SelfCollect'
  | 'PendingApproval'
  | 'Quoted'
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
  providerPhone?: string;
  providerEmail?: string;
  providerContact?: string;
  estimatedArrival?: string;
  jobId?: string;
  storeId?: string;
  fulfillmentStatus?: string;
  materialBatch?: MaterialBatch | null;
  canonicalDelivery?: CanonicalDeliveryType;
  supplierDisplayName?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  branchContactEmail?: string;
  branchCity?: string;
  branchArea?: string;
  branchHasDelivery?: boolean;
  branchDeliveryFee?: number;
  cancelledBy?: string;
  cancellationReason?: string;
  activeTrackingId?: string | null;
  activeTrackingToken?: string | null;
  materialOrderId?: string;
  destinationCoords?: { lat: number; lng: number } | null;
  collectionAddress?: string;
  destinationAddress?: string;
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
  socketReconnecting?: boolean;
  onCancelDelivery?: () => void;
  onChangeDelivery?: () => void;
  onChooseDelivery?: () => void;
  onCancelOrder?: () => void;
  onPayDelivery?: () => void;
  onAcceptQuote?: () => void;
  onViewMaterialInvoice?: (invoiceId: string) => void;
  onViewDeliveryInvoice?: (invoiceId: string) => void;
  onConfirmReceipt?: () => void;
  confirmReceiptPending?: boolean;
  highlightDeliveryComplete?: boolean;
  onDismissDeliveryHighlight?: () => void;
}

const DELIVERY_STATE_BADGES: Record<
  NormalizedDeliveryState,
  { label: string; className: string }
> = {
  SelfCollect: { label: 'Self-collect', className: 'bg-muted text-muted-foreground' },
  PendingApproval: { label: 'Awaiting courier quote', className: 'bg-warning/20 text-warning' },
  Quoted: { label: 'Quote received', className: 'bg-primary/20 text-primary' },
  Approved: { label: 'Approved — pay to start', className: 'bg-primary/20 text-primary' },
  Rejected: { label: 'Rejected', className: 'bg-destructive/20 text-destructive' },
  Cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  InProgress: { label: 'In progress', className: 'bg-primary/20 text-primary' },
  Processing: { label: 'Processing', className: 'bg-warning/20 text-warning' },
  OnTheWay: { label: 'On the way', className: 'bg-primary/20 text-primary' },
  Delivered: { label: 'Delivered', className: 'bg-success/20 text-success' },
};

function fulfillmentMaterialBadgeClass(fs: string | undefined): string {
  const u = String(fs || '').toUpperCase();
  if (u === 'FAILED') return 'bg-destructive/15 text-destructive border border-destructive/30';
  if (u === 'DELAYED') return 'bg-amber-500/15 text-amber-900 dark:text-amber-100 border border-amber-500/35';
  if (u === 'CANCELLED') return 'bg-muted text-muted-foreground border border-border';
  if (u === 'COMPLETED') return 'bg-success/20 text-success border border-success/25';
  return 'bg-secondary text-secondary-foreground border border-border';
}

function CourierContactCard({ order }: { order: NormalizedOrder }) {
  if (order.deliveryType !== 'PROVIDER') return null;
  if (!order.providerName && !order.providerPhone && !order.providerEmail && !order.providerVehicle) {
    return null;
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/8 to-background p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Truck className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Delivery provider</p>
          <p className="text-xs text-muted-foreground mt-0.5">Your assigned courier for this delivery</p>
        </div>
      </div>
      <dl className="grid gap-2 text-sm">
        {order.providerName ? (
          <div className="flex gap-2">
            <User className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</dt>
              <dd className="font-medium text-foreground">{order.providerName}</dd>
            </div>
          </div>
        ) : null}
        {order.providerVehicle ? (
          <div className="flex gap-2 pl-6 text-muted-foreground">
            <dd>{order.providerVehicle}</dd>
          </div>
        ) : null}
        {order.providerPhone ? (
          <div className="flex gap-2">
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</dt>
              <dd>
                <a href={`tel:${order.providerPhone}`} className="font-medium text-primary hover:underline">
                  {order.providerPhone}
                </a>
              </dd>
            </div>
          </div>
        ) : null}
        {order.providerEmail ? (
          <div className="flex gap-2">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</dt>
              <dd>
                <a
                  href={`mailto:${order.providerEmail}`}
                  className="font-medium text-primary hover:underline break-all"
                >
                  {order.providerEmail}
                </a>
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function DeliveryRouteSummary({ order }: { order: NormalizedOrder }) {
  if (order.deliveryType !== 'PROVIDER') return null;
  if (!order.collectionAddress && !order.destinationAddress) return null;

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3 text-sm space-y-2">
      <p className="font-medium text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wide">
        <MapPin className="h-3.5 w-3.5" aria-hidden />
        Route
      </p>
      {order.collectionAddress ? (
        <p className="text-muted-foreground leading-snug">
          <span className="text-foreground font-medium">Collect </span>
          {order.collectionAddress}
        </p>
      ) : null}
      {order.destinationAddress ? (
        <p className="text-muted-foreground leading-snug">
          <span className="text-foreground font-medium">Deliver </span>
          {order.destinationAddress}
        </p>
      ) : null}
    </div>
  );
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
  onCancelOrder,
  onPayDelivery,
  onAcceptQuote,
  onViewMaterialInvoice,
  onViewDeliveryInvoice,
  onConfirmReceipt,
  confirmReceiptPending,
  highlightDeliveryComplete,
  onDismissDeliveryHighlight,
}: OrderDetailsViewProps) {
  const canonical: CanonicalDeliveryType =
    order.canonicalDelivery ||
    (order.deliveryType === 'SELF'
      ? 'pickup'
      : order.deliveryType === 'PROVIDER'
        ? 'provider_delivery'
        : 'supplier_delivery');

  const fulfillmentU = String(order.fulfillmentStatus || '').toUpperCase();
  const fulfillmentAllowsLiveMap =
    fulfillmentU === 'OUT_FOR_DELIVERY' &&
    canonical !== 'pickup' &&
    !['FAILED', 'CANCELLED', 'DELAYED'].includes(fulfillmentU);

  const mapLatRaw = mapDisplayLat ?? liveDriverLat ?? order.driverLocation?.lat ?? null;
  const mapLngRaw = mapDisplayLng ?? liveDriverLng ?? order.driverLocation?.lng ?? null;
  const mapLat = mapLatRaw != null && Number.isFinite(Number(mapLatRaw)) ? Number(mapLatRaw) : null;
  const mapLng = mapLngRaw != null && Number.isFinite(Number(mapLngRaw)) ? Number(mapLngRaw) : null;

  const isPickupCanonical = canonical === 'pickup';
  const showConfirmReceipt =
    Boolean(onConfirmReceipt) &&
    order.deliveryConfirmed !== true &&
    ((fulfillmentU === 'READY' && isPickupCanonical) || fulfillmentU === 'COMPLETED');

  const confirmLabel = isPickupCanonical ? 'Confirm collection' : 'Confirm delivery';
  const trackingLocked = fulfillmentU === 'COMPLETED' && order.deliveryConfirmed === true;

  const deliveryState = order.deliveryState || 'Processing';
  const stateBadge = DELIVERY_STATE_BADGES[deliveryState] || DELIVERY_STATE_BADGES.Processing;
  const showTracking = order.deliveryType !== 'SELF' && order.deliveryPaid;

  const unifiedMode: UnifiedDeliveryMode =
    canonical === 'pickup' ? 'self_pickup' : canonical === 'supplier_delivery' ? 'store_delivery' : 'provider_delivery';

  const isPendingApproval = deliveryState === 'PendingApproval';
  const isQuoted = deliveryState === 'Quoted';
  const isApproved = deliveryState === 'Approved' && !order.deliveryPaid;
  const isRejected = deliveryState === 'Rejected';
  const isCancelled = deliveryState === 'Cancelled';
  const noDeliverySelected = isCancelled || !order.deliveryType;
  const isInProgressOrDelivered =
    deliveryState === 'InProgress' || deliveryState === 'Delivered' || deliveryState === 'OnTheWay';
  const materialsOk = order.materialsPaid !== false;
  const showUnified = !noDeliverySelected && materialsOk;
  const unifiedMapActive = Boolean(showTracking && fulfillmentAllowsLiveMap);
  const cancellationReason = order.cancellationReason || undefined;

  const materialsSubtotal = order.items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  const showStoreContactBlock = Boolean(
    order.supplierAddress ||
      order.branchCity ||
      order.branchArea ||
      order.supplierPhone ||
      order.branchContactEmail
  );

  const trackingSharedProps = {
    mode: unifiedMode,
    fulfillmentStatus: order.fulfillmentStatus,
    materialBatch: order.materialBatch ?? null,
    showLiveMap: unifiedMapActive,
    mapLat,
    mapLng,
    destination: order.materialBatch?.deliveryAddress || order.destinationAddress || undefined,
    destinationCoords: order.destinationCoords ?? null,
    lastDriverPingMs: lastDriverPingMs ?? null,
    locationPollFailed,
    socketReconnecting,
    activeTrackingId: fulfillmentU === 'OUT_FOR_DELIVERY' ? order.activeTrackingId ?? null : null,
    activeTrackingToken: fulfillmentU === 'OUT_FOR_DELIVERY' ? order.activeTrackingToken ?? null : null,
    supplierDisplayName: order.supplierDisplayName || order.storeName,
    supplierPhone: order.supplierPhone,
    supplierAddress: order.supplierAddress,
    courierName: order.providerName ?? null,
    courierVehicle: order.providerVehicle ?? null,
    trackingLocked,
    showDeliverySuccessHighlight: Boolean(highlightDeliveryComplete),
    onDismissDeliverySuccess: onDismissDeliveryHighlight,
    showConfirmDelivery: showConfirmReceipt,
    onConfirmDelivery: onConfirmReceipt,
    confirmDeliveryPending: confirmReceiptPending,
    confirmDeliveryLabel: confirmLabel,
  };

  let orderDateLabel = '';
  try {
    orderDateLabel = format(parseISO(order.createdAt), 'd MMM yyyy');
  } catch {
    orderDateLabel = '';
  }

  return (
    <div className="space-y-6">
      {/* —— Order summary —— */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 bg-muted/20 border-b border-border/60">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Store className="h-5 w-5 text-primary shrink-0" />
            Order summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground">{order.storeName}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Order #{order.id.slice(-8)}
                {orderDateLabel ? ` · Placed ${orderDateLabel}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {order.fulfillmentStatus ? (
                <Badge className={cn('text-xs', fulfillmentMaterialBadgeClass(order.fulfillmentStatus))}>
                  {fulfillmentStatusBadgeLabel(order.fulfillmentStatus)}
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-xs">
                {canonicalDeliveryLabel(canonical)}
              </Badge>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 divide-y divide-border/80 overflow-hidden">
            {order.items.map((item) => (
              <div
                key={item.productId}
                className="flex justify-between gap-4 px-3 py-2.5 text-sm bg-background/50"
              >
                <span className="text-foreground min-w-0">
                  {item.name}
                  <span className="text-muted-foreground"> × {item.qty}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatCurrency(item.qty * item.unitPrice, { decimals: 2 })}
                </span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2.5 text-sm font-medium bg-muted/30">
              <span>Materials total</span>
              <span className="tabular-nums">{formatCurrency(materialsSubtotal, { decimals: 2 })}</span>
            </div>
          </div>

          {showStoreContactBlock ? (
            <div className="rounded-lg border border-border/60 bg-muted/25 p-3 text-sm space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Store / pickup</p>
              {order.supplierAddress ? (
                <p className="text-muted-foreground leading-snug">
                  <MapPin className="inline h-3.5 w-3.5 mr-1 -mt-0.5" aria-hidden />
                  {order.supplierAddress}
                  {(order.branchCity || order.branchArea) && (
                    <span className="block sm:inline sm:ml-1">
                      {[order.branchCity, order.branchArea].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {order.supplierPhone ? (
                  <a href={`tel:${order.supplierPhone}`} className="inline-flex items-center gap-1 text-primary text-sm hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {order.supplierPhone}
                  </a>
                ) : null}
                {order.branchContactEmail ? (
                  <a
                    href={`mailto:${order.branchContactEmail}`}
                    className="inline-flex items-center gap-1 text-primary text-sm hover:underline break-all"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    {order.branchContactEmail}
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {showUnified ? (
            <>
              <Separator />
              <UnifiedTrackingSection {...trackingSharedProps} section="order" />
            </>
          ) : null}

          {String(order.fulfillmentStatus || '').toUpperCase() === 'CANCELLED' ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
              <p className="font-medium text-destructive">Order cancelled</p>
              {cancellationReason ? (
                <p className="text-muted-foreground mt-1 text-xs">Reason: {cancellationReason}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {onViewMaterialInvoice ? (
              <Button variant="outline" size="sm" onClick={() => onViewMaterialInvoice(order.invoiceId)}>
                <FileText className="h-4 w-4 mr-2" />
                View invoice
              </Button>
            ) : null}
            {onCancelOrder ? (
              <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={onCancelOrder}>
                <XCircle className="h-4 w-4 mr-2" />
                Cancel order
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* —— Delivery —— */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 bg-muted/20 border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Truck className="h-5 w-5 text-primary shrink-0" />
              Delivery
            </CardTitle>
            {!noDeliverySelected ? (
              <Badge className={cn('text-xs', stateBadge.className)}>{stateBadge.label}</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground pt-1">{canonicalDeliveryLabel(canonical)}</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <CourierContactCard order={order} />
          <DeliveryRouteSummary order={order} />

          {noDeliverySelected ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center space-y-3">
              <Package className="h-8 w-8 mx-auto text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">No delivery option selected yet.</p>
              <Button size="sm" className="btn-accent" onClick={onChooseDelivery}>
                <Truck className="h-3.5 w-3.5 mr-1.5" />
                Choose delivery
              </Button>
            </div>
          ) : null}

          {!noDeliverySelected && isPendingApproval ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-4 space-y-3">
              <p className="text-sm font-medium leading-snug">
                {order.deliveryType === 'PROVIDER'
                  ? 'Your courier will review this request and send a delivery price.'
                  : 'Waiting for the store to approve delivery.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onCancelDelivery}>
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Cancel delivery request
                </Button>
                {onChangeDelivery ? (
                  <Button size="sm" variant="secondary" onClick={onChangeDelivery}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Change provider
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!noDeliverySelected && isQuoted ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-medium">
                Delivery quote:{' '}
                <span className="text-primary">{formatCurrency(order.deliveryFee, { decimals: 2 })}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {onAcceptQuote ? (
                  <Button size="sm" className="btn-accent" onClick={onAcceptQuote}>
                    Accept quote & pay
                  </Button>
                ) : null}
                {onChangeDelivery ? (
                  <Button size="sm" variant="outline" onClick={onChangeDelivery}>
                    Choose another courier
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!noDeliverySelected && isApproved && order.deliveryFee > 0 ? (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-3">
              <p className="text-sm">
                Delivery approved — pay{' '}
                <strong>{formatCurrency(order.deliveryFee, { decimals: 2 })}</strong> to start.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="btn-accent" onClick={onPayDelivery}>
                  <CreditCard className="h-3.5 w-3.5 mr-1" />
                  Pay delivery
                </Button>
                {onChangeDelivery ? (
                  <Button size="sm" variant="outline" onClick={onChangeDelivery}>
                    Change option
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={onCancelDelivery}>
                  Cancel delivery
                </Button>
              </div>
            </div>
          ) : null}

          {!noDeliverySelected && isRejected ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-medium">Delivery request was rejected.</p>
              <Button size="sm" className="btn-accent" onClick={onChooseDelivery}>
                Choose delivery option
              </Button>
            </div>
          ) : null}

          {showUnified && order.deliveryType !== 'SELF' ? (
            <>
              {unifiedMode !== 'self_pickup' &&
              !['OUT_FOR_DELIVERY', 'COMPLETED', 'FAILED', 'CANCELLED', 'DELAYED'].includes(fulfillmentU) ? (
                <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/25 px-3 py-2">
                  Live map appears here once the supplier dispatches your order.
                </p>
              ) : null}
              <UnifiedTrackingSection {...trackingSharedProps} section="delivery" />
            </>
          ) : null}

          {!noDeliverySelected &&
            order.deliveryInvoiceId &&
            onViewDeliveryInvoice &&
            (showTracking || isInProgressOrDelivered) ? (
              <Button variant="outline" size="sm" onClick={() => onViewDeliveryInvoice(order.deliveryInvoiceId!)}>
                <FileText className="h-4 w-4 mr-2" />
                View delivery invoice
              </Button>
            ) : null}

          {!noDeliverySelected &&
            deliveryState !== 'SelfCollect' &&
            !isPendingApproval &&
            !isApproved &&
            !isRejected &&
            !showUnified && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Delivery details will appear once your order is processed.
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
