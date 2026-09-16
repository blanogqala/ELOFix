export type PayoutSettlementStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_SUPPORTED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SETTLED'
  | 'FAILED'
  | 'REVERSED';

export type PayoutBreakdownAmounts = {
  customerAmount: number;
  commissionAmount: number;
  recipientGrossShare: number;
  processorFeeAmount?: number | null;
  expectedBankSettlementAmount?: number | null;
  payoutSettlementStatus?: string | null;
  payoutSettledAt?: string | null;
  paymentState?: string | null;
};

export function normalizePayoutStatus(
  status: string | null | undefined
): PayoutSettlementStatus | string {
  const s = String(status || '').trim().toUpperCase();
  if (!s) return 'NOT_APPLICABLE';
  return s;
}

export function paymentConfirmedLabel(paymentState?: string | null): string {
  const s = String(paymentState || '').toUpperCase();
  if (s === 'PAID') return 'Payment confirmed';
  if (s === 'PENDING' || s === 'PROCESSING') return 'Payment pending';
  if (s === 'FAILED') return 'Payment failed';
  if (s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED') return 'Payment refunded';
  if (s === 'CANCELLED') return 'Payment cancelled';
  return 'Payment confirmed';
}

export function settlementStatusLabel(status: string | null | undefined): string {
  switch (normalizePayoutStatus(status)) {
    case 'SETTLED':
      return 'Settled by Paystack';
    case 'PROCESSING':
      return 'Processing';
    case 'PENDING':
      return 'Pending';
    case 'FAILED':
      return 'Failed';
    case 'REVERSED':
      return 'Reversed';
    case 'NOT_SUPPORTED':
      return 'Not available';
    case 'NOT_APPLICABLE':
      return 'Not applicable';
    default:
      return 'Not applicable';
  }
}

export function settlementStatusDescription(
  status: string | null | undefined,
  settledAt?: string | null
): string {
  switch (normalizePayoutStatus(status)) {
    case 'PROCESSING':
      return 'Paystack is processing this settlement. Your bank may reflect the credit after Paystack completes settlement.';
    case 'SETTLED': {
      const when = settledAt ? new Date(settledAt) : null;
      const dateLabel =
        when && !Number.isNaN(when.getTime())
          ? when.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
          : null;
      return dateLabel
        ? `Paystack completed this settlement on ${dateLabel}. Bank reflection time can vary.`
        : 'Paystack completed this settlement. Bank reflection time can vary.';
    }
    case 'PENDING':
      return 'This payout has not started processing yet.';
    case 'FAILED':
      return 'This payout could not be completed. EloFix is checking the settlement.';
    case 'REVERSED':
      return 'This payout was reversed by Paystack.';
    case 'NOT_SUPPORTED':
      return 'Automatic Paystack settlement status is not available for this payment.';
    default:
      return 'Payout settlement status is not applicable for this payment.';
  }
}

export function settlementStatusBadgeClass(status: string | null | undefined): string {
  switch (normalizePayoutStatus(status)) {
    case 'SETTLED':
      return 'bg-success text-success-foreground';
    case 'PROCESSING':
    case 'PENDING':
      return 'bg-amber-600 text-white';
    case 'FAILED':
    case 'REVERSED':
      return 'bg-destructive text-destructive-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function feeIsKnown(amount: number | null | undefined): boolean {
  return amount != null && Number.isFinite(Number(amount));
}

export function providerGrossShareDisclaimer(customerPaid: string, grossShare: string): string {
  return (
    `After the 7% EloFix commission, your gross marketplace share is ${grossShare} (93%). ` +
    `This is not the final bank amount. Paystack processing fees may reduce the amount credited to your bank. ` +
    `Customer paid ${customerPaid}.`
  );
}
