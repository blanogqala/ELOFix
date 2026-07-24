import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { JobMaterialOrderSnapshot, JobStoreOrder, MaterialBatch } from '@/types';
import {
  fulfillmentStatusBadgeLabel,
  isMaterialOrderRefunded,
} from '@/lib/materialBatchTracking';
import { isMaterialOrderDeliveryPaymentPending } from '@/lib/jobQuoteDisplay';
import { resolveMaterialOrderDeliveryTrackingBadge } from '@/lib/materialOrderDeliveryTracking';
import {
  resolveDeliveryModeBadgeLabel,
  resolveDisplayDeliveryType,
} from '@/lib/providerMaterialOrderHelpers';

export interface MaterialOrderDeliveryModeBadgeProps {
  storeOrder: JobStoreOrder;
  mo: JobMaterialOrderSnapshot | null | undefined;
  className?: string;
}

export function MaterialOrderDeliveryModeBadge({
  storeOrder,
  mo,
  className,
}: MaterialOrderDeliveryModeBadgeProps) {
  return (
    <Badge variant="outline" className={cn('text-xs shrink-0', className)}>
      {resolveDeliveryModeBadgeLabel(storeOrder, mo)}
    </Badge>
  );
}

export interface MaterialOrderStatusSummaryProps {
  storeOrder: JobStoreOrder;
  mo: JobMaterialOrderSnapshot | null | undefined;
  batch: MaterialBatch | null;
  /** When true, show supplier name line (user view). Provider card already shows name in header. */
  showSupplierLine?: boolean;
  className?: string;
}

export function MaterialOrderStatusSummary({
  storeOrder,
  mo,
  batch,
  showSupplierLine = false,
  className,
}: MaterialOrderStatusSummaryProps) {
  const isRefunded = isMaterialOrderRefunded(mo);
  const deliveryPayPending = isMaterialOrderDeliveryPaymentPending(storeOrder, mo);
  const fulfillmentStatus = String(mo?.fulfillmentStatus || 'PENDING').toUpperCase();
  const displayDeliveryType = resolveDisplayDeliveryType(storeOrder, mo);
  const isDelivery = displayDeliveryType != null && displayDeliveryType !== 'SELF';
  const secondaryBadge = resolveMaterialOrderDeliveryTrackingBadge({
    deliveryPayPending,
    isRefunded,
    displayDeliveryType,
    mo,
    batch,
  });
  const showTrackingBadge = Boolean(secondaryBadge && !deliveryPayPending);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex flex-wrap gap-2 items-center">
        <Badge
          variant="secondary"
          className={cn(
            'text-xs',
            isRefunded && 'bg-destructive/10 text-destructive border-destructive/30'
          )}
        >
          {isRefunded ? 'Cancelled · Refunded' : fulfillmentStatusBadgeLabel(mo?.fulfillmentStatus)}
        </Badge>
        {secondaryBadge ? (
          deliveryPayPending ? (
            <Badge className="text-xs bg-amber-500/15 text-amber-900 border-amber-500/40 dark:text-amber-100">
              {secondaryBadge}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              {secondaryBadge}
            </Badge>
          )
        ) : null}
      </div>
      {showSupplierLine ? (
        <p className="text-xs text-muted-foreground">
          Supplier:{' '}
          <span className="text-foreground font-medium">
            {mo?.supplierName || storeOrder.storeName || storeOrder.storeId}
          </span>
        </p>
      ) : null}
      {isDelivery &&
      !isRefunded &&
      !showTrackingBadge &&
      ['READY', 'OUT_FOR_DELIVERY'].includes(fulfillmentStatus) ? (
        <p className="text-xs text-foreground">Delivery in progress — updates at each step.</p>
      ) : null}
    </div>
  );
}
