import type { DeliveryRequestRecord, Job } from '@/types';

export function resolveLinkedMaterialOrderId(
  job: Job | null | undefined,
  deliveryRequest: DeliveryRequestRecord | null | undefined
): string | null {
  const direct = String(deliveryRequest?.materialOrderId || '').trim();
  if (direct) return direct;

  const moId = String(job?.jobMaterialOrders?.[0]?.id || '').trim();
  if (moId) return moId;

  const storeOrderId = String(job?.storeOrders?.[0]?.orderId || '').trim();
  if (storeOrderId) return storeOrderId;

  return null;
}

