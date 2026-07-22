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

function normalizeDeliveryStatusToken(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

/** True when delivery was cancelled / cleared and the customer must choose again. */
export function isDeliverySelectionCleared(
  storeOrder: JobStoreOrder,
  mo?: JobMaterialOrderSnapshot | null
): boolean {
  const moStatus = normalizeDeliveryStatusToken(mo?.delivery?.status ?? mo?.deliveryStatus);
  const storeStatus = normalizeDeliveryStatusToken(storeOrder.deliveryStatus ?? storeOrder.delivery?.status);
  if (moStatus === 'cancelled' || storeStatus === 'cancelled') return true;
  const fromMo =
    canonicalStoreDeliveryType(mo?.deliveryType) ??
    canonicalStoreDeliveryType(mo?.delivery?.type);
  if (!fromMo && !storeOrder.deliveryType) return true;
  return false;
}

/** Prefer material-order snapshot delivery type when job meta storeOrders is stale or overwritten. */
export function resolveDisplayDeliveryType(
  storeOrder: JobStoreOrder,
  mo: JobMaterialOrderSnapshot | null | undefined
): JobStoreOrder['deliveryType'] | null {
  if (isDeliverySelectionCleared(storeOrder, mo)) return null;
  const fromMo =
    canonicalStoreDeliveryType(mo?.deliveryType) ??
    canonicalStoreDeliveryType(mo?.delivery?.type);
  if (fromMo) return fromMo;
  return storeOrder.deliveryType;
}

export function deliveryModeLabel(deliveryType: JobStoreOrder['deliveryType'] | null | undefined): string {
  if (!deliveryType) return 'Not selected';
  if (deliveryType === 'SELF') return 'Pickup';
  if (deliveryType === 'STORE') return 'Store delivery';
  if (deliveryType === 'PROVIDER') return 'Courier delivery';
  return 'Delivery';
}

export function resolveDeliveryModeBadgeLabel(
  storeOrder: JobStoreOrder,
  mo?: JobMaterialOrderSnapshot | null
): string {
  if (isDeliverySelectionCleared(storeOrder, mo)) return 'Not selected';
  return deliveryModeLabel(resolveDisplayDeliveryType(storeOrder, mo));
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
