import { LEGAL_VERSIONS } from '@/lib/legal/versions';
import type { PaymentIntentKind, PaymentProvider } from '@/lib/api/payments';

/** Kinds that require Delivery & Collection Policy acknowledgement at checkout. */
export function checkoutRequiresDeliveryPolicy(kind: PaymentIntentKind | string): boolean {
  const k = String(kind || '').toUpperCase();
  return k === 'MATERIAL_ORDER' || k === 'JOB_STORE_ORDER' || k === 'DELIVERY_FEE';
}

export interface CheckoutLegalAcceptancePayload {
  refundPolicyAccepted: boolean;
  refundPolicyVersion: string;
  deliveryPolicyAcknowledged: boolean;
  deliveryPolicyVersion: string | null;
}

/** Build server-validated checkout legal payload from current frontend legal versions. */
export function buildCheckoutLegalAcceptance(
  kind: PaymentIntentKind | string
): CheckoutLegalAcceptancePayload {
  const requiresDelivery = checkoutRequiresDeliveryPolicy(kind);
  return {
    refundPolicyAccepted: true,
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
    deliveryPolicyAcknowledged: requiresDelivery,
    deliveryPolicyVersion: requiresDelivery ? LEGAL_VERSIONS.deliveryPolicy : null,
  };
}

export function checkoutProcessorDisplayName(provider: PaymentProvider | '' | null | undefined): string {
  const p = String(provider || '').toUpperCase();
  if (p === 'PAYSTACK') return 'Paystack';
  if (p === 'PAYFAST') return 'PayFast';
  if (p === 'PAYFLEX') return 'Payflex';
  if (p === 'PAYJUSTNOW') return 'PayJustNow';
  return 'an approved payment service provider';
}

/** Non-checkbox checkout disclosure near the payment CTA. Does not change legalAcceptance payload. */
export function checkoutProcessorDisclosure(provider: PaymentProvider | '' | null | undefined): string {
  return `Payments are securely processed by ${checkoutProcessorDisplayName(provider)}. EloFix does not store your full card number or CVV. Refund and cancellation rules apply.`;
}
