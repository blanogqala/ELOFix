import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, Store, FileText, CreditCard, RefreshCw, XCircle, Phone, Mail } from 'lucide-react';
import { UnifiedTrackingSection, type UnifiedDeliveryMode } from '@/components/tracking/UnifiedTrackingSection';
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
  /** Courier profile (provider delivery only) */
  providerPhone?: string;
  providerEmail?: string;
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
  /** Branch public contact / delivery (material orders API) */
  branchContactEmail?: string;
  branchCity?: string;
  branchArea?: string;
  branchHasDelivery?: boolean;
  branchDeliveryFee?: number;
  cancelledBy?: string;
  cancellationReason?: string;
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
  onCancelOrder?: () => void;
  onPayDelivery?: () => void;
  onSimulateApproval?: () => void;
  onSimulateRejection?: () => void;
  onViewMaterialInvoice?: (invoiceId: string) => void;
  onViewDeliveryInvoice?: (invoiceId: string) => void;
  onConfirmReceipt?: () => void;
  confirmReceiptPending?: boolean;
  /** Brief highlight after successful customer confirmation */
  highlightDeliveryComplete?: boolean;
  onDismissDeliveryHighlight?: () => void;
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
  if (order.deliveryType === 'SELF') return 'Pickup';
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
  onCancelOrder,
  onPayDelivery,
  onSimulateApproval,
  onSimulateRejection,
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

  const showStoreContactBlock =
    Boolean(
      order.supplierAddress ||
        order.branchCity ||
        order.branchArea ||
        order.supplierPhone ||
        order.branchContactEmail ||
        order.branchHasDelivery === true
    );

  /** Independent courier — not shown for self-collect or store delivery */
  const showCourierContactCard =
    order.deliveryType === 'PROVIDER' &&
    Boolean(order.providerName || order.providerPhone || order.providerEmail);

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
                <span>{formatCurrency(item.qty * item.unitPrice, { decimals: 2 })}</span>
              </div>
            ))}
            {showStoreContactBlock && (
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm space-y-2">
                <p className="font-medium text-foreground">Store contact and pickup</p>
                {order.supplierAddress && (
                  <p className="text-muted-foreground">
                    <span className="text-foreground/80">Address: </span>
                    {order.supplierAddress}
                    {(order.branchCity || order.branchArea) && (
                      <span>
                        {order.branchCity ? ` · ${order.branchCity}` : ''}
                        {order.branchArea ? ` · ${order.branchArea}` : ''}
                      </span>
                    )}
                  </p>
                )}
                {!order.supplierAddress && (order.branchCity || order.branchArea) && (
                  <p className="text-muted-foreground">
                    {[order.branchCity, order.branchArea].filter(Boolean).join(' · ')}
                  </p>
                )}
                {order.supplierPhone && (
                  <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-foreground/70" aria-hidden />
                    <span className="text-foreground/80">Cell: </span>
                    <a href={`tel:${order.supplierPhone}`} className="text-primary underline-offset-4 hover:underline">
                      {order.supplierPhone}
                    </a>
                  </p>
                )}
                {order.branchContactEmail && (
                  <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-foreground/70" aria-hidden />
                    <span className="text-foreground/80">Email: </span>
                    <a
                      href={`mailto:${order.branchContactEmail}`}
                      className="text-primary underline-offset-4 hover:underline break-all"
                    >
                      {order.branchContactEmail}
                    </a>
                  </p>
                )}
                {order.branchHasDelivery === true && order.branchDeliveryFee != null && (
                  <p className="text-muted-foreground">
                    <span className="text-foreground/80">Store delivery: </span>
                    available from {formatCurrency(order.branchDeliveryFee, { decimals: 2 })} (branch rate; your order may differ)
                  </p>
                )}
              </div>
            )}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <span>Delivery</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            {canonicalDeliveryLabel(canonical)} · {deliveryTrackingSourceLabel(order)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCourierContactCard && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-2">
              <p className="font-semibold text-foreground flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary shrink-0" />
                Delivery provider contact
              </p>
              <p className="text-xs text-muted-foreground">
                Independent courier for this job — use these details for delivery-related questions.
              </p>
              {order.providerName && (
                <p className="text-muted-foreground">
                  <span className="text-foreground/80 font-medium">Name: </span>
                  {order.providerName}
                </p>
              )}
              {order.providerVehicle ? (
                <p className="text-muted-foreground">
                  <span className="text-foreground/80 font-medium">Vehicle: </span>
                  {order.providerVehicle}
                </p>
              ) : null}
              {order.providerPhone && (
                <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="text-foreground/80 font-medium">Cell: </span>
                  <a href={`tel:${order.providerPhone}`} className="text-primary underline-offset-4 hover:underline">
                    {order.providerPhone}
                  </a>
                </p>
              )}
              {order.providerEmail && (
                <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="text-foreground/80 font-medium">Email: </span>
                  <a
                    href={`mailto:${order.providerEmail}`}
                    className="text-primary underline-offset-4 hover:underline break-all"
                  >
                    {order.providerEmail}
                  </a>
                </p>
              )}
            </div>
          )}
          {onCancelOrder && (
            <div className="space-y-2 ">
              <Button size="sm" variant="destructive" onClick={onCancelOrder}>
                Cancel Order
              </Button>
            </div>
          )}
          {String(order.fulfillmentStatus || '').toUpperCase() === 'CANCELLED' && (
            <div className=" p-3 text-sm">
              <p className="font-medium">Order cancelled</p>
              {cancellationReason && <p className="text-muted-foreground mt-1">Reason: {cancellationReason}</p>}
            </div>
          )}
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
                  {order.deliveryFee > 0 && (
                    <p>Delivery price: {formatCurrency(order.deliveryFee, { decimals: 2 })}</p>
                  )}
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
            <div className="space-y-3 p-4 bg-primary/5 border border-primary rounded-lg">
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

          {showUnified ? (
            <>
              {unifiedMode !== 'self_pickup' &&
              !['OUT_FOR_DELIVERY', 'COMPLETED', 'FAILED', 'CANCELLED', 'DELAYED'].includes(fulfillmentU) ? (
                <p className="text-sm text-muted-foreground rounded-md border border-primary bg-muted/20 px-3 py-2">
                  Waiting for the supplier to prepare your order. Live tracking will be available once dispatch starts.
                </p>
              ) : null}
              <UnifiedTrackingSection
              mode={unifiedMode}
              fulfillmentStatus={order.fulfillmentStatus}
              materialBatch={order.materialBatch ?? null}
              showLiveMap={unifiedMapActive}
              mapLat={mapLat}
              mapLng={mapLng}
              destination={order.materialBatch?.deliveryAddress || undefined}
              destinationCoords={order.destinationCoords ?? null}
              lastDriverPingMs={lastDriverPingMs ?? null}
              locationPollFailed={locationPollFailed}
              socketReconnecting={socketReconnecting}
              activeTrackingId={fulfillmentU === 'OUT_FOR_DELIVERY' ? order.activeTrackingId ?? null : null}
              activeTrackingToken={fulfillmentU === 'OUT_FOR_DELIVERY' ? order.activeTrackingToken ?? null : null}
              supplierDisplayName={order.supplierDisplayName || order.storeName}
              supplierPhone={order.supplierPhone}
              supplierAddress={order.supplierAddress}
              courierName={order.providerName ?? null}
              courierVehicle={order.providerVehicle ?? null}
              trackingLocked={trackingLocked}
              showDeliverySuccessHighlight={Boolean(highlightDeliveryComplete)}
              onDismissDeliverySuccess={onDismissDeliveryHighlight}
              showConfirmDelivery={showConfirmReceipt}
              onConfirmDelivery={onConfirmReceipt}
              confirmDeliveryPending={confirmReceiptPending}
              confirmDeliveryLabel={confirmLabel}
            />
            </>
          ) : null}

          {!noDeliverySelected &&
            order.deliveryInvoiceId &&
            onViewDeliveryInvoice &&
            (showTracking || isInProgressOrDelivered) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onViewDeliveryInvoice(order.deliveryInvoiceId!)}
              >
                <FileText className="h-4 w-4 mr-2" />
                View Delivery Invoice
              </Button>
            )}

          {!noDeliverySelected &&
            deliveryState !== 'SelfCollect' &&
            !isPendingApproval &&
            !isApproved &&
            !isRejected &&
            !showUnified && (
              <p className="text-sm text-muted-foreground">
                Delivery details will appear here once your order is processed.
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

