/** Admin category ids that use collection/destination + courier quote flow (DeliveryRequest API). */
export const COURIER_CATEGORIES = new Set(['delivery', 'moving']);

export function isCourierCategory(categoryId: string): boolean {
  return COURIER_CATEGORIES.has(String(categoryId || '').trim().toLowerCase());
}

/** Delivery / moving jobs use collection, destination, and item lists — not generic site requirements. */
export function isDeliveryOrMovingJob(job: {
  category?: string;
  courierFlow?: boolean;
}): boolean {
  return Boolean(job.courierFlow) || isCourierCategory(job.category ?? '');
}
