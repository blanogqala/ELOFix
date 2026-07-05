import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import type { JobMaterialOrderSnapshot, JobStoreOrder, MaterialBatch } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { MaterialTrackingMini } from '@/components/materials/MaterialTrackingMini';
import { Button } from '@/components/ui/button';
import {
  fulfillmentStatusBadgeLabel,
  isMaterialOrderRefunded,
} from '@/lib/materialBatchTracking';
import { cn } from '@/lib/utils';
import { resolveDisplayDeliveryType } from '@/lib/providerMaterialOrderHelpers';

export interface MaterialOrderExpandedDetailsProps {
  storeOrder: JobStoreOrder;
  mo: JobMaterialOrderSnapshot | null | undefined;
  batch: MaterialBatch | null;
  summaryIsPickup: boolean;
  variant: 'provider' | 'user';
  batchMeta?: MaterialRequestDto | null;
  driverLabel?: string | null;
  fullTrackingHref?: string;
  courierJobId?: string | null;
  onViewDelivery?: (courierJobId: string) => void;
  storeDisplayName?: string;
}

export function MaterialOrderExpandedDetails({
  storeOrder,
  mo,
  batch,
  summaryIsPickup,
  variant,
  batchMeta,
  driverLabel,
  fullTrackingHref,
  courierJobId,
  onViewDelivery,
  storeDisplayName,
}: MaterialOrderExpandedDetailsProps) {
  const isRefunded = isMaterialOrderRefunded(mo);
  const supplierName = mo?.supplierName || storeDisplayName || storeOrder.storeName || storeOrder.storeId;
  const fulfillmentStatus = String(mo?.fulfillmentStatus || 'PENDING').toUpperCase();
  const displayDeliveryType = resolveDisplayDeliveryType(storeOrder, mo);
  const isDelivery = batch?.deliveryType === 'delivery' || displayDeliveryType !== 'SELF';

  return (
    <div className="space-y-3 border-t border-green-600/25 pt-3">
      <div className="space-y-2">
        {variant === 'provider' && batchMeta ? (
          <p className="text-xs text-muted-foreground">
            Request{' '}
            {batchMeta.status === 'paid'
              ? 'paid'
              : batchMeta.status === 'submitted'
                ? 'awaiting payment'
                : batchMeta.status}{' '}
            · {new Date(batchMeta.createdAt).toLocaleString()}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Tracking:{' '}
          <span
            className={cn('font-medium', isRefunded ? 'text-destructive' : 'text-foreground')}
          >
            {isRefunded ? 'Cancelled' : fulfillmentStatusBadgeLabel(mo?.fulfillmentStatus)}
          </span>
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Supplier</p>
        <p className="text-sm font-medium">{supplierName}</p>
        <p className="text-xs text-muted-foreground">
          {displayDeliveryType === 'SELF' && 'Pickup'}
          {displayDeliveryType === 'STORE' && 'Store delivery'}
          {displayDeliveryType === 'PROVIDER' && 'Courier'}
          {!(summaryIsPickup && batch?.pickupAddress) && batch?.pickupAddress
            ? ` · ${batch.pickupAddress}`
            : ''}
        </p>
        {!(summaryIsPickup && batch?.pickupAddress) && batch?.pickupAddress ? (
          <p className="text-xs text-muted-foreground">Pickup: {batch.pickupAddress}</p>
        ) : null}
        {!(!summaryIsPickup && batch?.deliveryAddress) && batch?.deliveryAddress ? (
          <p className="text-xs text-muted-foreground">Deliver to: {batch.deliveryAddress}</p>
        ) : null}
      </div>

      <MaterialTrackingMini batch={batch} />

      {variant === 'user' ? (
        <div className="space-y-2">
          {batch?.deliveryType === 'pickup' && (
            <p className="text-xs text-muted-foreground">
              Collect your order at the supplier address above.
            </p>
          )}
          {driverLabel ? (
            <p className="text-xs text-muted-foreground">Courier: {driverLabel}</p>
          ) : null}
          {isDelivery &&
          !isRefunded &&
          ['READY', 'OUT_FOR_DELIVERY'].includes(fulfillmentStatus) ? (
            <p className="text-xs text-foreground">
              Delivery in progress — you will be notified at each step.
            </p>
          ) : null}
          {displayDeliveryType !== 'SELF' && fullTrackingHref ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-full hover:bg-accent/80 border-primary border"
              asChild
            >
              <Link to={fullTrackingHref}>Full tracking view</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {variant === 'provider' && displayDeliveryType === 'PROVIDER' ? (
        <div className="space-y-2 rounded-md border border-primary/25 bg-primary/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Courier (you)</p>
          {courierJobId && onViewDelivery ? (
            <Button
              type="button"
              size="sm"
              className="btn-accent w-full sm:w-auto"
              onClick={() => onViewDelivery(courierJobId)}
            >
              <Truck className="mr-2 h-4 w-4" aria-hidden />
              View Delivery
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Delivery job will appear once the courier request is set up.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
