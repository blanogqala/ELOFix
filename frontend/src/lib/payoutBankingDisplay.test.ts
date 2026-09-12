import { describe, expect, it } from 'vitest';
import {
  gatewaySettlementLabel,
  isPaystackDestinationConnected,
  needsPayoutGatewayConnect,
  payoutVerificationLabel,
  postSaveVerificationMessage,
  removeBlockedMessage,
} from '@/lib/payoutBankingDisplay';

describe('payoutBankingDisplay', () => {
  it('maps verification statuses', () => {
    expect(payoutVerificationLabel('PENDING_VERIFICATION')).toBe('Pending verification');
    expect(payoutVerificationLabel('VERIFIED')).toBe('Verified');
    expect(payoutVerificationLabel(null)).toBe('Not configured');
  });

  it('describes gateway settlement honestly when unsupported', () => {
    expect(gatewaySettlementLabel(false, null)).toBe('Gateway settlement not yet enabled');
    expect(gatewaySettlementLabel(true, { recipientConfigured: false, status: 'GATEWAY_NOT_CONFIGURED' })).toBe(
      'Not yet enabled'
    );
  });

  it('distinguishes Paystack destination connection from bank verification', () => {
    expect(
      isPaystackDestinationConnected({
        recipientConfigured: true,
        provider: 'PAYSTACK',
        status: 'PENDING',
      })
    ).toBe(true);
    expect(
      isPaystackDestinationConnected({
        recipientConfigured: true,
        provider: 'PAYFAST',
        status: 'VERIFIED',
      })
    ).toBe(false);
    expect(
      gatewaySettlementLabel(true, {
        recipientConfigured: true,
        provider: 'PAYSTACK',
        status: 'PENDING',
      })
    ).toBe('Paystack payout destination connected');
    expect(
      gatewaySettlementLabel(true, {
        recipientConfigured: true,
        provider: 'PAYSTACK',
        status: 'VERIFIED',
      })
    ).toBe('Paystack payout destination connected');
    expect(needsPayoutGatewayConnect(true, { recipientConfigured: false })).toBe(true);
    expect(
      needsPayoutGatewayConnect(true, { recipientConfigured: true, provider: 'PAYSTACK' })
    ).toBe(false);
    expect(
      needsPayoutGatewayConnect(true, { recipientConfigured: true, provider: 'PAYFAST' })
    ).toBe(true);
    expect(needsPayoutGatewayConnect(false, { recipientConfigured: false })).toBe(false);
  });

  it('formats remove-blocked and post-save copy', () => {
    expect(removeBlockedMessage('Pending settlements')).toBe('Pending settlements');
    expect(removeBlockedMessage()).toContain('cannot be removed');
    expect(postSaveVerificationMessage()).toMatch(/verification pending/i);
  });
});
