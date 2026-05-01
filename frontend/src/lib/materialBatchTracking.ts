import type { JobMaterialOrderSnapshot, MaterialBatch, MaterialBatchStatus } from '@/types';

const BATCH_ORDER: MaterialBatchStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
];

export function fulfillmentDbToBatchStatus(fs: string | undefined): MaterialBatchStatus {
  const u = String(fs || 'PENDING').toUpperCase();
  const map: Record<string, MaterialBatchStatus> = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    PREPARING: 'preparing',
    READY: 'ready',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    COMPLETED: 'delivered',
  };
  return map[u] || 'pending';
}

export function resolveMaterialBatchFromSnapshot(
  mo: JobMaterialOrderSnapshot | null | undefined
): MaterialBatch | null {
  if (!mo) return null;
  if (mo.materialBatch && typeof mo.materialBatch === 'object' && 'status' in mo.materialBatch) {
    return mo.materialBatch as MaterialBatch;
  }
  return {
    id: mo.id,
    supplierId: String(mo.supplierId || ''),
    items: [],
    status: fulfillmentDbToBatchStatus(String(mo.fulfillmentStatus)),
    deliveryType: 'pickup',
    pickupAddress: '',
    deliveryAddress: '',
    timestamps: {},
  };
}

export function batchStatusStepIndex(st: MaterialBatchStatus): number {
  const i = BATCH_ORDER.indexOf(st);
  return i < 0 ? 0 : i;
}

/** Five UI steps (Accepted → Delivered). `pending` yields no completed steps. */
export function materialTrackingChecks(batch: MaterialBatch | null): boolean[] {
  const idx = batch ? batchStatusStepIndex(batch.status) : 0;
  const checks = [false, false, false, false, false];
  if (idx <= 0) return checks;
  const n = Math.min(5, idx);
  for (let i = 0; i < n; i++) checks[i] = true;
  return checks;
}

export function trackingLabelsForBatch(batch: MaterialBatch | null): string[] {
  const pickup = batch?.deliveryType === 'pickup';
  return [
    'Accepted',
    'Preparing',
    'Ready',
    pickup ? 'Ready for collection' : 'Out for delivery',
    pickup ? 'Collected' : 'Delivered',
  ];
}

export function fulfillmentStatusBadgeLabel(fs: string | undefined): string {
  const u = String(fs || 'PENDING').toUpperCase();
  if (u === 'PENDING') return 'Awaiting supplier';
  if (u === 'ACCEPTED') return 'Accepted';
  if (u === 'PREPARING') return 'Preparing';
  if (u === 'READY') return 'Ready';
  if (u === 'OUT_FOR_DELIVERY') return 'Out for delivery';
  if (u === 'COMPLETED') return 'Delivered';
  return u.replace(/_/g, ' ');
}
