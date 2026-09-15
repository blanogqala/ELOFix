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
    expect(settlementStatusLabel('NOT_SUPPORTED')).toBe('Not available');
    expect(settlementStatusLabel('SETTLED')).toBe('Settled by Paystack');
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
    expect(shouldShowBankOnboarding({ bankProfileComplete: true })).toBe(false);
  });

  it('does not show onboarding before the payout profile has loaded', () => {
    expect(shouldShowBankOnboarding({})).toBe(false);
    expect(
      shouldShowBankOnboarding({
        verificationStatus: undefined,
        bankProfileComplete: undefined,
        profile: undefined,
      })
    ).toBe(false);
  });

  it('scopes dismiss key to branch', () => {
    expect(bankOnboardingDismissKey('abc')).toContain('abc');
  });
});
