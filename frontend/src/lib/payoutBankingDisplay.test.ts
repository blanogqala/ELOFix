import { describe, expect, it } from 'vitest';
import {
  gatewaySettlementLabel,
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

  it('formats remove-blocked and post-save copy', () => {
    expect(removeBlockedMessage('Pending settlements')).toBe('Pending settlements');
    expect(removeBlockedMessage()).toContain('cannot be removed');
    expect(postSaveVerificationMessage()).toMatch(/verification pending/i);
  });
});
