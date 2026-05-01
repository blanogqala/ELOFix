import type { Job, JobStoreOrder } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { MaterialCard } from '@/components/materials/MaterialCard';
import { MaterialTrackingMini } from '@/components/materials/MaterialTrackingMini';
import {
  fulfillmentStatusBadgeLabel,
  resolveMaterialBatchFromSnapshot,
} from '@/lib/materialBatchTracking';
import { resolveMaterialOrderForStoreOrder } from '@/lib/providerMaterialOrderHelpers';

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paidBatches.map((card) => {
            const total = card.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
            const mo = resolveMaterialOrderForStoreOrder(job, card);
            const batch = resolveMaterialBatchFromSnapshot(mo);
            const batchMeta = card.materialRequestId
              ? materialRequests.find((r) => r.id === card.materialRequestId)
              : null;

            return (
              <MaterialCard
                key={card.orderId}
                status="paid"
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
                  <div className="mt-3 pt-3 border-t border-green-600/20 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplier</p>
                    <p className="text-sm font-medium">{mo?.supplierName || card.storeName || card.storeId}</p>
                    <p className="text-xs text-muted-foreground">
                      {card.deliveryType === 'SELF' && 'Pickup'}
                      {card.deliveryType === 'STORE' && 'Store delivery'}
                      {card.deliveryType === 'PROVIDER' && 'Courier'}{batch?.pickupAddress ? ` · ${batch.pickupAddress}` : ''}
                    </p>
                    {batch?.deliveryAddress ? (
                      <p className="text-xs text-muted-foreground">Deliver to: {batch.deliveryAddress}</p>
                    ) : null}
                    <MaterialTrackingMini batch={batch} />
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
