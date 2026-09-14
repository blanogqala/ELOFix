import { describe, it, expect } from 'vitest';
import {
  buildCheckoutLegalAcceptance,
  checkoutProcessorDisclosure,
  checkoutRequiresDeliveryPolicy,
} from '@/lib/legal/checkoutAcceptance';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

describe('checkoutAcceptance helpers', () => {
  it('classifies kinds for delivery policy', () => {
    expect(checkoutRequiresDeliveryPolicy('LABOR')).toBe(false);
    expect(checkoutRequiresDeliveryPolicy('MATERIAL_ORDER')).toBe(true);
    expect(checkoutRequiresDeliveryPolicy('JOB_STORE_ORDER')).toBe(true);
    expect(checkoutRequiresDeliveryPolicy('DELIVERY_FEE')).toBe(true);
  });

  it('builds service payload without delivery version', () => {
    expect(buildCheckoutLegalAcceptance('LABOR')).toEqual({
      refundPolicyAccepted: true,
      refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
      deliveryPolicyAcknowledged: false,
      deliveryPolicyVersion: null,
    });
  });

  it('builds material payload with delivery version', () => {
    expect(buildCheckoutLegalAcceptance('MATERIAL_ORDER')).toEqual({
      refundPolicyAccepted: true,
      refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
      deliveryPolicyAcknowledged: true,
      deliveryPolicyVersion: LEGAL_VERSIONS.deliveryPolicy,
    });
  });

  it('names the selected checkout processor without changing the acceptance payload', () => {
    expect(checkoutProcessorDisclosure('PAYSTACK')).toContain('Paystack');
    expect(checkoutProcessorDisclosure('PAYSTACK')).toContain('does not store your full card number or CVV');
    expect(buildCheckoutLegalAcceptance('LABOR')).toEqual({
      refundPolicyAccepted: true,
      refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
      deliveryPolicyAcknowledged: false,
      deliveryPolicyVersion: null,
    });
  });
});
