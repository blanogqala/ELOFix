import { LEGAL_VERSIONS } from '@/lib/legal/versions';
import type { PaymentIntentKind } from '@/lib/api/payments';

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
