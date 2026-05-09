import type { Job, JobStoreOrder } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { MapPin } from 'lucide-react';
import { MaterialCard } from '@/components/materials/MaterialCard';
import { MaterialTrackingMini } from '@/components/materials/MaterialTrackingMini';
import {
  fulfillmentStatusBadgeLabel,
  resolveMaterialBatchFromSnapshot,
} from '@/lib/materialBatchTracking';
import { resolveMaterialOrderForStoreOrder } from '@/lib/providerMaterialOrderHelpers';
import { ProviderCourierActions } from '@/components/tracking/ProviderCourierActions';

export interface MaterialBatchesProps {
  job: Job;
  paidBatches: JobStoreOrder[];
  materialRequests: MaterialRequestDto[];
  hasSubmittedMaterialRequests: boolean;
}

export function MaterialBatches({
  job,
  paidBatches,
  materialRequests,
  hasSubmittedMaterialRequests,
}: MaterialBatchesProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">Material purchases</h3>
      {hasSubmittedMaterialRequests && (
        <p className="text-xs text-muted-foreground">
          Paid batches unlock supplier tracking. Pending batches await customer payment.
        </p>
      )}
      {paidBatches.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-6 text-center">
          No paid material purchases yet. Paid orders appear here after the customer checks out.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {paidBatches.map((card) => {
            const total = card.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
            const mo = resolveMaterialOrderForStoreOrder(job, card);
            const batch = resolveMaterialBatchFromSnapshot(mo);
            const batchMeta = card.materialRequestId
              ? materialRequests.find((r) => r.id === card.materialRequestId)
              : null;
            const summaryIsPickup = card.deliveryType === 'SELF' || batch?.deliveryType === 'pickup';

            const deliveryLocation =
              summaryIsPickup ? (
                batch?.pickupAddress ? (
                  <span className="flex gap-2.5">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide block">
                        Collect at
                      </span>
                      <span className="break-words">{batch.pickupAddress}</span>
                    </span>
                  </span>
                ) : (
                  <span className="flex gap-2.5 items-start">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                    <span className="text-muted-foreground text-[13px] leading-snug">
                      Pickup location — shown when the supplier confirms the batch.
                    </span>
                  </span>
                )
              ) : batch?.deliveryAddress ? (
                <span className="flex gap-2.5">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide block">
                      Deliver to
                    </span>
                    <span className="break-words">{batch.deliveryAddress}</span>
                  </span>
                </span>
              ) : (
                <span className="flex gap-2.5 items-start">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                  <span className="text-muted-foreground text-[13px] leading-snug">
                    Delivery address appears when dispatch details are set.
                  </span>
                </span>
              );

            return (
              <MaterialCard
                key={card.orderId}
                status="paid"
                collapsible
                deliveryLocation={deliveryLocation}
                supplierName={card.storeName || card.storeId}
                subtotal={total}
                items={card.items.map((item) => ({
                  rowKey: `${card.orderId}-${item.productId}`,
                  name: item.name,
                  qty: item.qty,
                  lineTotal: item.qty * item.unitPrice,
                }))}
                meta={
                  <div className="space-y-2 w-full">
                    {batchMeta ? (
                      <p className="text-xs text-muted-foreground">
                        Request {batchMeta.status === 'paid' ? 'paid' : batchMeta.status === 'submitted' ? 'awaiting payment' : batchMeta.status}{' '}
                        · {new Date(batchMeta.createdAt).toLocaleString()}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Tracking:{' '}
                      <span className="font-medium text-foreground">
                        {fulfillmentStatusBadgeLabel(mo?.fulfillmentStatus)}
                      </span>
                    </p>
                  </div>
                }
                footer={
                  <div className="space-y-3 border-t border-green-600/25 pt-3">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Supplier</p>
                      <p className="text-sm font-medium">{mo?.supplierName || card.storeName || card.storeId}</p>
                      <p className="text-xs text-muted-foreground">
                        {card.deliveryType === 'SELF' && 'Pickup'}
                        {card.deliveryType === 'STORE' && 'Store delivery'}
                        {card.deliveryType === 'PROVIDER' && 'Courier'}
                        {!(summaryIsPickup && batch?.pickupAddress) && batch?.pickupAddress
                          ? ` · ${batch.pickupAddress}`
                          : ''}
                      </p>
                      {!(!summaryIsPickup && batch?.deliveryAddress) && batch?.deliveryAddress ? (
                        <p className="text-xs text-muted-foreground">Deliver to: {batch.deliveryAddress}</p>
                      ) : null}
                    </div>
                    <MaterialTrackingMini batch={batch} />
                    <ProviderCourierActions
                      jobId={job.id}
                      orderId={mo?.id || card.orderId}
                      fulfillmentStatus={mo?.fulfillmentStatus}
                      deliveryType={card.deliveryType}
                    />
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
