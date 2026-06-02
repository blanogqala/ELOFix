import type { DeliveryRequestRecord, Job } from '@/types';
import { getUserLaborGross, getQuoteMaterialsTotal } from '@/lib/jobUtils';

const EN_ROUTE_COURIER = new Set(['COLLECTING', 'COLLECTED', 'OUT_FOR_DELIVERY', 'AT_DESTINATION']);

export function isProviderEnRouteToService(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null
): boolean {
  if (job.courierFlow) {
    const fs = String(deliveryRequest?.fulfillmentStatus || '').toUpperCase();
    return EN_ROUTE_COURIER.has(fs);
  }
  return job.status === 'IN_PROGRESS' || job.status === 'AWAITING_CONFIRMATION';
}

export interface CustomerCancelPreview {
  providerEnRoute: boolean;
  refundAmount: number;
  laborRefund: number;
  materialsRefundable: boolean;
  customerForfeits: boolean;
  warning?: string;
}

export const EMPTY_CUSTOMER_CANCEL_PREVIEW: CustomerCancelPreview = {
  providerEnRoute: false,
  refundAmount: 0,
  laborRefund: 0,
  materialsRefundable: true,
  customerForfeits: false,
};

/** Preview refund rules for the customer cancellation dialog (mirrors backend policy). */
export function getCustomerCancelPreview(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null,
  hasMaterialsPaid?: boolean
): CustomerCancelPreview {
  const providerEnRoute = isProviderEnRouteToService(job, deliveryRequest);
  const laborPaid = Boolean(job.laborPaid);
  const laborGross = laborPaid ? getUserLaborGross(job) : 0;
  const materialsTotal = getQuoteMaterialsTotal(job);
  const materialsRefundable = !hasMaterialsPaid;

  if (providerEnRoute && laborPaid) {
    return {
      providerEnRoute: true,
      refundAmount: materialsRefundable ? materialsTotal : 0,
      laborRefund: 0,
      materialsRefundable,
      customerForfeits: true,
      warning:
        'Your provider is already collecting or delivering. Cancelling now forfeits your service payment. Unordered materials can still be refunded.',
    };
  }

  const laborRefund = laborPaid ? laborGross : 0;
  const materialsRefund = materialsRefundable ? materialsTotal : 0;

  return {
    providerEnRoute: false,
    refundAmount: laborRefund + materialsRefund,
    laborRefund,
    materialsRefundable,
    customerForfeits: false,
    warning: providerEnRoute
      ? undefined
      : laborPaid
        ? undefined
        : 'You can cancel freely before your provider heads out to collect.',
  };
}
