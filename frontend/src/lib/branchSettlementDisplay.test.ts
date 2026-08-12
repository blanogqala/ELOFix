import { describe, expect, it } from 'vitest';
import {
  payoutVerificationLabel,
  settlementStatusLabel,
  shouldShowBankOnboarding,
  bankOnboardingDismissKey,
} from '@/lib/branchSettlementDisplay';

describe('branchSettlementDisplay', () => {
  it('maps verification statuses without withdrawal language', () => {
    expect(payoutVerificationLabel('VERIFIED')).toBe('Verified');
    expect(payoutVerificationLabel('NOT_CONFIGURED')).toBe('Not configured');
    expect(settlementStatusLabel('NOT_SUPPORTED')).toBe('Automatic settlement unavailable');
    expect(settlementStatusLabel('SETTLED')).toBe('Settled');
  });

  it('shows onboarding only when profile incomplete', () => {
    expect(
      shouldShowBankOnboarding({ verificationStatus: 'NOT_CONFIGURED', profile: null })
    ).toBe(true);
    expect(
      shouldShowBankOnboarding({
        verificationStatus: 'PENDING_VERIFICATION',
        profile: { bankName: 'FNB', accountHolder: 'Branch' },
      })
    ).toBe(false);
    expect(
      shouldShowBankOnboarding({
        verificationStatus: 'VERIFIED',
        profile: { bankName: 'FNB', accountHolder: 'Branch' },
      })
    ).toBe(false);
  });

  it('scopes dismiss key to branch', () => {
    expect(bankOnboardingDismissKey('abc')).toContain('abc');
  });
});
