import type { Job, JobMaterialOrderSnapshot, JobStoreOrder } from '@/types';
import {
  materialTrackingChecks,
  resolveMaterialBatchFromSnapshot,
  fulfillmentStatusBadgeLabel,
} from '@/lib/materialBatchTracking';

export function resolveMaterialOrderForStoreOrder(
  job: Job,
  storeOrder: JobStoreOrder
): JobMaterialOrderSnapshot | null {
  const mos = job.jobMaterialOrders || [];
  const byLink = mos.find(
    (m) => m.jobStoreOrderId && String(m.jobStoreOrderId) === String(storeOrder.orderId)
  );
  if (byLink) return byLink;
  const byId = mos.find((m) => String(m.id) === String(storeOrder.orderId));
  if (byId) return byId;
  return null;
}

function canonicalStoreDeliveryType(raw?: string): JobStoreOrder['deliveryType'] | null {
  const u = String(raw || '').toUpperCase();
  if (u === 'SELF') return 'SELF';
  if (u === 'STORE' || u === 'STORE_DELIVERY') return 'STORE';
  if (u === 'PROVIDER' || u === 'DELIVERY_PROVIDER') return 'PROVIDER';
  return null;
}

/** Prefer material-order snapshot delivery type when job meta storeOrders is stale or overwritten. */
export function resolveDisplayDeliveryType(
  storeOrder: JobStoreOrder,
  mo: JobMaterialOrderSnapshot | null | undefined
): JobStoreOrder['deliveryType'] {
  const fromMo =
    canonicalStoreDeliveryType(mo?.deliveryType) ??
    canonicalStoreDeliveryType(mo?.delivery?.type);
  if (fromMo) return fromMo;
  return storeOrder.deliveryType;
}

export function deliveryModeLabel(deliveryType: JobStoreOrder['deliveryType']): string {
  if (deliveryType === 'SELF') return 'Pickup';
  if (deliveryType === 'STORE') return 'Store delivery';
  if (deliveryType === 'PROVIDER') return 'Courier delivery';
  return 'Delivery';
}

export function supplierFacingStatus(mo: JobMaterialOrderSnapshot | null): string {
  if (!mo) return 'Awaiting payment';
  return fulfillmentStatusBadgeLabel(String(mo.fulfillmentStatus));
}

/** @deprecated Prefer `materialTrackingChecks(resolveMaterialBatchFromSnapshot(mo))` */
export function supplierTrackingStepDone(mo: JobMaterialOrderSnapshot | null, step: number): boolean {
  const checks = materialTrackingChecks(resolveMaterialBatchFromSnapshot(mo));
  return Boolean(checks[step]);
}
