import type { Job, JobStoreOrder } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { useNavigate } from 'react-router-dom';
import { MapPin, Truck } from 'lucide-react';
import { MaterialCard } from '@/components/materials/MaterialCard';
import { MaterialTrackingMini } from '@/components/materials/MaterialTrackingMini';
import { Button } from '@/components/ui/button';
import {
  fulfillmentStatusBadgeLabel,
  isMaterialOrderRefunded,
  resolveMaterialBatchFromSnapshot,
} from '@/lib/materialBatchTracking';
import { resolveMaterialOrderForStoreOrder } from '@/lib/providerMaterialOrderHelpers';
import { getStoreOrderDeliveryLine, isStoreDeliveryPaymentPending } from '@/lib/jobQuoteDisplay';
import { cn } from '@/lib/utils';

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
  const navigate = useNavigate();
  const hasRefundedMaterial = paidBatches.some((card) =>
    isMaterialOrderRefunded(resolveMaterialOrderForStoreOrder(job, card))
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">
        {hasRefundedMaterial ? 'Material orders' : 'Material purchases'}
      </h3>
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
            const isRefunded = isMaterialOrderRefunded(mo);
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

            const deliveryLine = getStoreOrderDeliveryLine(card, mo);
            const deliveryPayPending = isStoreDeliveryPaymentPending(card, mo);
            const cardSubtotal =
              total + (deliveryLine?.includeInSubtotal && !deliveryLine.struck ? deliveryLine.amount : 0);
            const extraLines =
              deliveryLine && !deliveryLine.struck
                ? [{ label: deliveryLine.label, amount: deliveryLine.amount, muted: deliveryLine.muted, hint: deliveryLine.hint }]
                : undefined;

            return (
              <MaterialCard
                key={card.orderId}
                status={isRefunded ? 'refunded' : 'paid'}
                collapsible
                refundAmount={isRefunded ? mo?.refundAmount : undefined}
                refundStatus={isRefunded ? mo?.refundStatus : undefined}
                cancellationNote={
                  isRefunded
                    ? mo?.cancellationReason
                      ? `Cancelled before delivery — ${mo.cancellationReason}`
                      : 'Cancelled before delivery — customer received a refund (93% net).'
                    : undefined
                }
                deliveryLocation={deliveryLocation}
                supplierName={card.storeName || card.storeId}
                subtotal={cardSubtotal}
                extraLines={extraLines}
                deliveryPaymentReminder={
                  deliveryPayPending
                    ? 'Customer must pay the delivery fee before this order can be dispatched.'
                    : undefined
                }
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
                      <span
                        className={cn(
                          'font-medium',
                          isRefunded ? 'text-destructive' : 'text-foreground'
                        )}
                      >
                        {isRefunded
                          ? 'Cancelled'
                          : fulfillmentStatusBadgeLabel(mo?.fulfillmentStatus)}
                      </span>
                    </p>
                  </div>
                }
                footer={
                  isRefunded ? undefined : (
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
                      {card.deliveryType === 'PROVIDER' ? (
                        <div className="mt-3 space-y-2 rounded-md border border-primary/25 bg-primary/5 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Courier (you)</p>
                          {(() => {
                            const courierJobId = mo?.courierJobId ?? card.courierJobId;
                            if (courierJobId) {
                              return (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="btn-accent w-full sm:w-auto"
                                  onClick={() => navigate(`/provider/jobs/${courierJobId}`)}
                                >
                                  <Truck className="mr-2 h-4 w-4" aria-hidden />
                                  View Delivery
                                </Button>
                              );
                            }
                            return (
                              <p className="text-xs text-muted-foreground">
                                Delivery job will appear once the courier request is set up.
                              </p>
                            );
                          })()}
                        </div>
                      ) : null}
                    </div>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
