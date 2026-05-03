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

export function supplierFacingStatus(mo: JobMaterialOrderSnapshot | null): string {
  if (!mo) return 'Awaiting payment';
  return fulfillmentStatusBadgeLabel(String(mo.fulfillmentStatus));
}

/** @deprecated Prefer `materialTrackingChecks(resolveMaterialBatchFromSnapshot(mo))` */
export function supplierTrackingStepDone(mo: JobMaterialOrderSnapshot | null, step: number): boolean {
  const checks = materialTrackingChecks(resolveMaterialBatchFromSnapshot(mo));
  return Boolean(checks[step]);
}
