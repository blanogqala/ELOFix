export type CustomerRefundPayoutStatus =
  | 'NONE'
  | 'REFUND_COMPLETED'
  | 'REFUND_FAILED'
  | 'REFUND_MANUAL_ACTION_REQUIRED'
  | 'UNKNOWN'
  | string;

export function canRetryCustomerRefund(customerRefundStatus: string | null | undefined): boolean {
  return ['REFUND_FAILED', 'REFUND_MANUAL_ACTION_REQUIRED'].includes(
    String(customerRefundStatus || '')
  );
}

export function confirmCustomerRefundToast(status: CustomerRefundPayoutStatus | undefined): {
  title: string;
  description: string;
} {
  if (status === 'REFUND_COMPLETED') {
    return {
      title: 'Confirmed',
      description: 'Repayment confirmed and the customer refund was completed.',
    };
  }
  if (status === 'REFUND_MANUAL_ACTION_REQUIRED') {
    return {
      title: 'Confirmed',
      description:
        'Repayment confirmed. The customer refund needs a gateway retry from History.',
    };
  }
  if (status === 'REFUND_FAILED') {
    return {
      title: 'Confirmed',
      description:
        'Repayment confirmed, but the customer refund failed. Use Retry customer refund on History.',
    };
  }
  return {
    title: 'Confirmed',
    description: 'Repayment verified. EloFix attempted the customer refund with this confirmation.',
  };
}
