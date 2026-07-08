import type { DeliveryRequestRecord, Job } from '@/types';
import { getUserLaborGross, getQuoteMaterialsTotal } from '@/lib/jobUtils';

const EN_ROUTE_COURIER = new Set(['COLLECTING', 'COLLECTED', 'OUT_FOR_DELIVERY', 'AT_DESTINATION']);
const CANCEL_COMMISSION_RATE = 0.07;

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Mirrors backend netCourierCancelRefundFromGross — 7% commission kept on paid cancel. */
export function netCourierCancelRefundFromGross(gross: number): number {
  const commission = computeCancelCommission(gross);
  return roundMoney(gross - commission);
}

export function computeCancelCommission(gross: number): number {
  return roundMoney(gross * CANCEL_COMMISSION_RATE);
}

export function computeEstimatedNetRefund(gross: number): number {
  return netCourierCancelRefundFromGross(gross);
}

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

export function getCustomerCancelFreeWarningMessage(job: Job): string {
  return job.courierFlow
    ? 'You can cancel freely before your provider heads out to collect.'
    : 'You can cancel freely before you pay for the service.';
}

export function getCustomerCancelForfeitWarningMessage(job: Job): string {
  return job.courierFlow
    ? 'Your provider is already collecting or delivering. Cancelling now forfeits your service payment. Unordered materials can still be refunded.'
    : 'Your provider has already started work. Cancelling will open a dispute so EloFix can review your refund request.';
}

export function getCustomerCancelPaidDisputeWarningMessage(job: Job): string {
  return job.courierFlow
    ? 'You have paid for delivery. Cancelling will open a dispute so EloFix can review your refund request before any funds are released.'
    : 'You have paid for this service. Cancelling will open a dispute so EloFix can review your refund request before any funds are released.';
}

export function getProviderCancelPaidDisputeWarningMessage(): string {
  return 'The customer has paid for this job. Cancelling will open a dispute so EloFix can review how funds should be released.';
}

export function getCustomerCancelForfeitToastMessage(job: Job): string {
  return job.courierFlow
    ? 'Your job was cancelled. Service payment is non-refundable because collection or delivery was already underway.'
    : 'Cancellation submitted. EloFix will review your refund request.';
}

export function getCancelDisputeSubmittedToastMessage(): string {
  return 'Cancellation submitted. An admin will investigate before any funds are released.';
}

export interface CustomerCancelPreview {
  providerEnRoute: boolean;
  refundAmount: number;
  laborRefund: number;
  laborGross?: number;
  commissionAmount?: number;
  estimatedNetRefund?: number;
  materialsRefundable: boolean;
  customerForfeits: boolean;
  opensDisputeReview?: boolean;
  warning?: string;
}

export type ProviderCancelPreview = CustomerCancelPreview;

export const EMPTY_CUSTOMER_CANCEL_PREVIEW: CustomerCancelPreview = {
  providerEnRoute: false,
  refundAmount: 0,
  laborRefund: 0,
  materialsRefundable: true,
  customerForfeits: false,
};

function buildPaidLaborDisputePreview(
  laborGross: number,
  materialsTotal: number,
  materialsRefundable: boolean,
  warning: string,
  providerEnRoute = false
): CustomerCancelPreview {
  const commissionAmount = computeCancelCommission(laborGross);
  const estimatedNetRefund = computeEstimatedNetRefund(laborGross);
  const materialsRefund = materialsRefundable ? materialsTotal : 0;
  return {
    providerEnRoute,
    laborGross,
    commissionAmount,
    estimatedNetRefund,
    laborRefund: estimatedNetRefund,
    refundAmount: estimatedNetRefund + materialsRefund,
    materialsRefundable,
    customerForfeits: false,
    opensDisputeReview: true,
    warning,
  };
}

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

  if (providerEnRoute && laborPaid && job.courierFlow) {
    return {
      providerEnRoute: true,
      refundAmount: materialsRefundable ? materialsTotal : 0,
      laborRefund: 0,
      materialsRefundable,
      customerForfeits: true,
      warning: getCustomerCancelForfeitWarningMessage(job),
    };
  }

  if (laborPaid && laborGross > 0) {
    return buildPaidLaborDisputePreview(
      laborGross,
      materialsTotal,
      materialsRefundable,
      getCustomerCancelPaidDisputeWarningMessage(job),
      providerEnRoute
    );
  }

  const materialsRefund = materialsRefundable ? materialsTotal : 0;
  return {
    providerEnRoute: false,
    refundAmount: materialsRefund,
    laborRefund: 0,
    materialsRefundable,
    customerForfeits: false,
    warning: getCustomerCancelFreeWarningMessage(job),
  };
}

/** Preview refund rules for the provider cancellation dialog (mirrors backend policy). */
export function getProviderCancelPreview(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null,
  hasMaterialsPaid?: boolean
): ProviderCancelPreview {
  const providerEnRoute = isProviderEnRouteToService(job, deliveryRequest);
  const laborPaid = Boolean(job.laborPaid);
  const laborGross = laborPaid ? getUserLaborGross(job) : 0;
  const materialsTotal = getQuoteMaterialsTotal(job);
  const materialsRefundable = !hasMaterialsPaid;

  if (laborPaid && laborGross > 0) {
    return buildPaidLaborDisputePreview(
      laborGross,
      materialsTotal,
      materialsRefundable,
      getProviderCancelPaidDisputeWarningMessage(),
      providerEnRoute
    );
  }

  const materialsRefund = materialsRefundable ? materialsTotal : 0;
  return {
    providerEnRoute: false,
    refundAmount: materialsRefund,
    laborRefund: 0,
    materialsRefundable,
    customerForfeits: false,
    warning: undefined,
  };
}
