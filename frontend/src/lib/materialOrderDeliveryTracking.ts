import type { JobMaterialOrderSnapshot, JobStoreOrder, MaterialBatch } from '@/types';

function normalizeStatus(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

export function courierDeliveryTrackingBadgeLabel(status?: string | null): string | null {
  switch (normalizeStatus(status)) {
    case 'READY':
      return 'Courier preparing';
    case 'COLLECTING':
      return 'Heading to collection';
    case 'COLLECTED':
      return 'Items collected';
    case 'OUT_FOR_DELIVERY':
      return 'On the way';
    case 'AT_DESTINATION':
      return 'Arrived';
    case 'COMPLETED':
      return 'Delivered';
    default:
      return null;
  }
}

export function storeDeliveryTrackingBadgeLabel(status?: string | null): string | null {
  switch (normalizeStatus(status)) {
    case 'PROCESSING':
      return 'Delivery scheduled';
    case 'INPROGRESS':
    case 'IN_PROGRESS':
    case 'ONTHEWAY':
    case 'ON_THE_WAY':
      return 'Out for delivery';
    case 'DELIVERED':
      return 'Delivered';
    default:
      return null;
  }
}

export function resolveMaterialOrderDeliveryTrackingBadge(params: {
  deliveryPayPending: boolean;
  isRefunded: boolean;
  displayDeliveryType: JobStoreOrder['deliveryType'];
  mo: JobMaterialOrderSnapshot | null | undefined;
  batch: MaterialBatch | null;
}): string | null {
  if (params.isRefunded) return null;
  if (params.deliveryPayPending) return 'Delivery unpaid';

  if (params.displayDeliveryType === 'PROVIDER') {
    return courierDeliveryTrackingBadgeLabel(params.mo?.courierFulfillmentStatus);
  }

  if (params.displayDeliveryType === 'STORE') {
    return storeDeliveryTrackingBadgeLabel(
      params.mo?.delivery?.status ?? params.mo?.deliveryStatus
    );
  }

  if (params.displayDeliveryType === 'SELF') {
    return null;
  }

  return null;
}
