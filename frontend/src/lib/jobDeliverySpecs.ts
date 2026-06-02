import type { DeliveryGeoPoint, DeliveryRequestItem, DeliveryRequestRecord, Job } from '@/types';

export interface JobDeliverySpecItem {
  name: string;
  qty: number;
  weightKg?: number;
}

export interface JobDeliverySpecs {
  collection: DeliveryGeoPoint;
  destination: DeliveryGeoPoint;
  items: JobDeliverySpecItem[];
}

export function formatGeoPointLabel(point?: DeliveryGeoPoint | null): string {
  if (!point) return '—';
  const parts = [point.label, point.address, point.suburb, point.area, point.city].filter(
    (p) => typeof p === 'string' && p.trim().length > 0
  ) as string[];
  return parts.length > 0 ? parts.join(', ') : '—';
}

function resolveCollectionPoint(job: Job, dr?: DeliveryRequestRecord | null): DeliveryGeoPoint {
  return (
    dr?.collectionPoint ||
    job.measurements?.collectionPoint ||
    (job.location as { collection?: DeliveryGeoPoint })?.collection ||
    { address: '—' }
  );
}

function resolveDestinationPoint(job: Job, dr?: DeliveryRequestRecord | null): DeliveryGeoPoint {
  return (
    dr?.destinationPoint ||
    job.measurements?.destinationPoint ||
    (job.location as DeliveryGeoPoint) ||
    { address: job.location?.address || '—' }
  );
}

function resolveItems(job: Job, dr?: DeliveryRequestRecord | null): JobDeliverySpecItem[] {
  if (dr?.items?.length) {
    return dr.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      weightKg: i.weightKg,
    }));
  }
  const fromDelivery = job.measurements?.deliveryItems;
  if (fromDelivery?.length) {
    return fromDelivery.map((i) => ({
      name: i.name,
      qty: i.qty,
      weightKg: i.weightKg,
    }));
  }
  const fromMoving = job.measurements?.movingItems;
  if (fromMoving?.length) {
    return fromMoving.map((i) => ({ name: i.name, qty: i.qty }));
  }
  return [];
}

/** Collection, destination, and item list for delivery / moving jobs (API + job measurements). */
export function getJobDeliverySpecs(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null
): JobDeliverySpecs {
  return {
    collection: resolveCollectionPoint(job, deliveryRequest),
    destination: resolveDestinationPoint(job, deliveryRequest),
    items: resolveItems(job, deliveryRequest),
  };
}

/** True when job has explicit courier pickup/drop data (not generic job site location). */
export function jobHasExplicitDeliverySpecs(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null
): boolean {
  if (deliveryRequest?.collectionPoint?.address?.trim()) return true;
  if (deliveryRequest?.destinationPoint?.address?.trim()) return true;
  if (deliveryRequest?.items?.length) return true;
  if (job.measurements?.collectionPoint?.address?.trim()) return true;
  if (job.measurements?.destinationPoint?.address?.trim()) return true;
  if (job.measurements?.deliveryItems?.length) return true;
  return false;
}
