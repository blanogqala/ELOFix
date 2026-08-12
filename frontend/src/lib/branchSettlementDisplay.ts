export {
  payoutVerificationLabel,
  type PayoutVerificationStatus as BranchPayoutVerificationStatus,
} from '@/lib/payoutBankingDisplay';

export type BranchSettlementStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_SUPPORTED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SETTLED'
  | 'FAILED'
  | 'REVERSED';

export function settlementStatusLabel(status: BranchSettlementStatus | string | null | undefined): string {
  switch (status) {
    case 'SETTLED':
      return 'Settled';
    case 'PROCESSING':
      return 'Processing';
    case 'PENDING':
      return 'Pending settlement';
    case 'NOT_SUPPORTED':
      return 'Automatic settlement unavailable';
    case 'FAILED':
      return 'Settlement failed';
    case 'REVERSED':
      return 'Reversed';
    default:
      return 'Not applicable';
  }
}

export function isBankProfileComplete(profile: {
  bankName?: string;
  accountHolder?: string;
} | null | undefined): boolean {
  return Boolean(profile?.bankName?.trim() && profile?.accountHolder?.trim());
}

export function shouldShowBankOnboarding(input: {
  verificationStatus?: string | null;
  bankProfileComplete?: boolean;
  profile?: { bankName?: string; accountHolder?: string } | null;
}): boolean {
  const status = input.verificationStatus || 'NOT_CONFIGURED';
  if (status === 'VERIFIED' || status === 'PENDING_VERIFICATION') {
    return false;
  }
  if (input.bankProfileComplete === true) return false;
  return !isBankProfileComplete(input.profile);
}

export function bankOnboardingDismissKey(branchId: string): string {
  return `elofix:branch-bank-onboarding-dismissed:${branchId}`;
}
