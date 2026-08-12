import type { DeliveryRequestRecord, Job } from '@/types';
import { getQuoteMaterialsTotal } from '@/lib/jobUtils';
import {
  buildJobCancellationFinancials,
  type CancellationTrancheStage,
  type JobCancellationFinancials,
} from '@/lib/jobCancellationFinancials';

const EN_ROUTE_COURIER = new Set(['COLLECTING', 'COLLECTED', 'OUT_FOR_DELIVERY', 'AT_DESTINATION']);
const COURIER_POST_PICKUP = new Set(['COLLECTED', 'OUT_FOR_DELIVERY', 'AT_DESTINATION', 'COMPLETED']);
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

export function getCourierCancellationBlockedMessage(actor: 'customer' | 'provider'): string {
  if (actor === 'provider') {
    return 'You cannot cancel after picking up items.';
  }
  return 'This delivery cannot be cancelled after items have been collected.';
}

export function isCourierJobCancellationBlocked(
  job: Job,
  deliveryRequest?: DeliveryRequestRecord | null,
  actor: 'customer' | 'provider' = 'customer'
): boolean {
  if (!job.courierFlow) return false;

  const status = String(job.status || '').toUpperCase();
  if (status === 'AWAITING_CONFIRMATION') return true;

  const fs = String(deliveryRequest?.fulfillmentStatus || '').toUpperCase();
  if (COURIER_POST_PICKUP.has(fs)) return true;

  return false;
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

export function getCustomerCancelPaidDisputeWarningMessage(
  job: Job,
  financials?: JobCancellationFinancials
): string {
  if (job.courierFlow) {
    return 'You have paid for delivery. Cancelling will open a dispute so EloFix can review your refund request before any funds are released.';
  }
  const fin = financials ?? buildJobCancellationFinancials(job);
  if (fin.hasPartialPayment && fin.unpaidRemaining > 0) {
    return 'Because you have already paid the deposit, this cancellation will be submitted to EloFix for refund review. The unpaid completion payment will not be charged.';
  }
  return 'You have paid for this service. Cancelling will open a dispute so EloFix can review your refund request before any funds are released.';
}

export function getProviderCancelPaidDisputeWarningMessage(
  financials?: JobCancellationFinancials
): string {
  if (financials?.hasPartialPayment && financials.unpaidRemaining > 0) {
    return 'The customer has paid the deposit only. The completion payment has not been charged. Cancelling this job will open a dispute so EloFix can review how the paid deposit should be handled.';
  }
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
  /** @deprecated use paidToDate */
  laborGross?: number;
  /** @deprecated use commissionOnPaid */
  commissionAmount?: number;
  estimatedNetRefund?: number;
  servicePrice?: number;
  paidToDate?: number;
  unpaidRemaining?: number;
  amountUnderReview?: number;
  commissionOnPaid?: number;
  providerShareOnPaid?: number;
  depositStage?: CancellationTrancheStage | null;
  completionStage?: CancellationTrancheStage | null;
  materialsRefundable: boolean;
  customerForfeits: boolean;
  opensDisputeReview?: boolean;
  cancellationBlocked?: boolean;
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
  job: Job,
  financials: JobCancellationFinancials,
  materialsTotal: number,
  materialsRefundable: boolean,
  warning: string,
  providerEnRoute = false
): CustomerCancelPreview {
  const amountUnderReview = financials.amountUnderReview;
  const materialsRefund = materialsRefundable ? materialsTotal : 0;
  return {
    providerEnRoute,
    servicePrice: financials.servicePrice,
    paidToDate: financials.paidToDate,
    unpaidRemaining: financials.unpaidRemaining,
    amountUnderReview,
    commissionOnPaid: financials.commissionOnPaid,
    providerShareOnPaid: financials.providerShareOnPaid,
    depositStage: financials.depositStage,
    completionStage: financials.completionStage,
    laborGross: financials.paidToDate,
    commissionAmount: financials.commissionOnPaid,
    estimatedNetRefund: amountUnderReview,
    laborRefund: amountUnderReview,
    refundAmount: amountUnderReview + materialsRefund,
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
  if (isCourierJobCancellationBlocked(job, deliveryRequest, 'customer')) {
    return {
      ...EMPTY_CUSTOMER_CANCEL_PREVIEW,
      cancellationBlocked: true,
      warning: getCourierCancellationBlockedMessage('customer'),
    };
  }

  const providerEnRoute = isProviderEnRouteToService(job, deliveryRequest);
  const laborPaid = Boolean(job.laborPaid);
  const financials = buildJobCancellationFinancials(job);
  const paidToDate = laborPaid ? financials.paidToDate : 0;
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

  if (laborPaid && paidToDate > 0) {
    return buildPaidLaborDisputePreview(
      job,
      financials,
      materialsTotal,
      materialsRefundable,
      getCustomerCancelPaidDisputeWarningMessage(job, financials),
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
  if (isCourierJobCancellationBlocked(job, deliveryRequest, 'provider')) {
    return {
      ...EMPTY_CUSTOMER_CANCEL_PREVIEW,
      cancellationBlocked: true,
      warning: getCourierCancellationBlockedMessage('provider'),
    };
  }

  const providerEnRoute = isProviderEnRouteToService(job, deliveryRequest);
  const laborPaid = Boolean(job.laborPaid);
  const financials = buildJobCancellationFinancials(job);
  const paidToDate = laborPaid ? financials.paidToDate : 0;
  const materialsTotal = getQuoteMaterialsTotal(job);
  const materialsRefundable = !hasMaterialsPaid;

  if (laborPaid && paidToDate > 0) {
    return buildPaidLaborDisputePreview(
      job,
      financials,
      materialsTotal,
      materialsRefundable,
      getProviderCancelPaidDisputeWarningMessage(financials),
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
