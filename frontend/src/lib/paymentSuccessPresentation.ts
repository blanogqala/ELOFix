/**
 * Presentation-only copy and routes for the payment-return success screen.
 * Does not calculate amounts or infer payment state — callers pass verified intent fields.
 */

export type PaymentSuccessCopy = {
  title: string;
  description: string;
  paymentLabel: string;
  isProviderRefundRepayment: boolean;
};

function norm(value: unknown): string {
  return value == null ? '' : String(value).trim().toUpperCase();
}

export function paymentSuccessCopy(input: {
  kind?: string | null;
  paymentType?: string | null;
}): PaymentSuccessCopy {
  const kind = norm(input.kind);
  const paymentType = norm(input.paymentType);
  const stage = paymentType || kind;

  if (kind === 'PROVIDER_REFUND_REPAYMENT' || paymentType === 'PROVIDER_REFUND_REPAYMENT') {
    return {
      title: 'Refund repayment successful',
      description: 'Your refund repayment to EloFix has been completed successfully.',
      paymentLabel: 'Refund repayment',
      isProviderRefundRepayment: true,
    };
  }

  if (kind === 'MATERIAL_ORDER' || stage === 'MATERIAL_ORDER') {
    return {
      title: 'Materials payment successful',
      description: 'Your materials order payment has been completed successfully.',
      paymentLabel: 'Materials',
      isProviderRefundRepayment: false,
    };
  }

  if (kind === 'JOB_STORE_ORDER' || stage === 'JOB_STORE_ORDER') {
    return {
      title: 'Materials payment successful',
      description: 'Your job materials payment has been completed successfully.',
      paymentLabel: 'Materials',
      isProviderRefundRepayment: false,
    };
  }

  if (kind === 'DELIVERY_FEE' || stage === 'DELIVERY_FEE') {
    return {
      title: 'Delivery payment successful',
      description: 'Your delivery payment has been completed successfully.',
      paymentLabel: 'Delivery',
      isProviderRefundRepayment: false,
    };
  }

  if (stage === 'DEPOSIT') {
    return {
      title: 'Deposit payment successful',
      description: 'Your deposit payment has been completed successfully.',
      paymentLabel: 'Deposit · 50%',
      isProviderRefundRepayment: false,
    };
  }

  if (stage === 'COMPLETION') {
    return {
      title: 'Completion payment successful',
      description: 'Your final job payment has been completed successfully.',
      paymentLabel: 'Completion · 50%',
      isProviderRefundRepayment: false,
    };
  }

  if (stage === 'FULL_UPFRONT') {
    return {
      title: 'Payment successful',
      description: 'Your full upfront payment has been completed successfully.',
      paymentLabel: 'Full payment',
      isProviderRefundRepayment: false,
    };
  }

  if (stage === 'FULL_COMPLETION') {
    return {
      title: 'Payment successful',
      description: 'Your job payment has been completed successfully.',
      paymentLabel: 'Job payment',
      isProviderRefundRepayment: false,
    };
  }

  return {
    title: 'Payment successful',
    description: 'Your payment has been completed successfully.',
    paymentLabel: 'Payment',
    isProviderRefundRepayment: false,
  };
}

function isProviderRole(role?: string | null): boolean {
  return String(role || '').toLowerCase() === 'provider';
}

export function paymentSuccessDonePath(input: {
  jobId?: string | null;
  materialOrderId?: string | null;
  kind?: string | null;
  paymentType?: string | null;
  role?: string | null;
}): string {
  const copy = paymentSuccessCopy(input);
  const jobId = input.jobId != null ? String(input.jobId).trim() : '';
  const providerFacing = isProviderRole(input.role) || copy.isProviderRefundRepayment;

  if (jobId) {
    return providerFacing ? `/provider/jobs/${jobId}` : `/user/jobs/${jobId}`;
  }

  const materialOrderId = input.materialOrderId != null ? String(input.materialOrderId).trim() : '';
  if (materialOrderId) {
    return `/user/material-orders/${encodeURIComponent(materialOrderId)}`;
  }

  return providerFacing ? '/provider/earnings' : '/user/payments';
}

export function paymentSuccessReceiptPath(input: {
  paymentIntentId: string;
  jobId?: string | null;
  kind?: string | null;
  paymentType?: string | null;
  role?: string | null;
}): string {
  const copy = paymentSuccessCopy(input);
  const id = encodeURIComponent(String(input.paymentIntentId || '').trim());
  const jobId = input.jobId != null ? String(input.jobId).trim() : '';
  const providerFacing = isProviderRole(input.role) || copy.isProviderRefundRepayment;

  if (providerFacing) {
    if (jobId) return `/provider/jobs/${jobId}/refund?payment=${id}`;
    return `/provider/earnings?payment=${id}`;
  }

  return `/user/payments?payment=${id}`;
}

export function paymentProviderDisplayName(provider?: string | null): string | null {
  const p = norm(provider);
  if (!p) return null;
  switch (p) {
    case 'PAYSTACK':
      return 'Paystack';
    case 'PAYFAST':
      return 'PayFast';
    case 'PAYFLEX':
      return 'Payflex';
    case 'PAYJUSTNOW':
      return 'PayJustNow';
    default:
      return String(provider);
  }
}
