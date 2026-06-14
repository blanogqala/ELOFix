/** Legal document versions — must match elofix-backend/src/config/legalVersions.js */
export const LEGAL_VERSIONS = {
  terms: '2026-05-01',
  privacy: '2026-05-01',
  providerAgreement: '2026-05-01',
  refundPolicy: '2026-05-01',
} as const;

export type LegalDocumentId = 'terms' | 'privacy' | 'provider-agreement' | 'refund-policy';

export const LEGAL_ROUTES: Record<LegalDocumentId, string> = {
  terms: '/terms',
  privacy: '/privacy',
  'provider-agreement': '/provider-agreement',
  'refund-policy': '/refund-policy',
};

export const LEGAL_LABELS: Record<LegalDocumentId, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  'provider-agreement': 'Provider Agreement',
  'refund-policy': 'Refund and Cancellation Policy',
};

export interface LegalAcceptancePayload {
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedProviderAgreement: boolean;
  acceptedRefundPolicy: boolean;
  termsVersion: string;
  privacyVersion: string;
  providerAgreementVersion: string;
  refundPolicyVersion: string;
}

export function buildLegalAcceptancePayload(role: 'user' | 'provider'): LegalAcceptancePayload {
  return {
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedProviderAgreement: role === 'provider',
    acceptedRefundPolicy: role === 'provider',
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    providerAgreementVersion: LEGAL_VERSIONS.providerAgreement,
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
  };
}

export function getRequiredDocuments(role: 'user' | 'provider'): LegalDocumentId[] {
  if (role === 'provider') {
    return ['terms', 'privacy', 'provider-agreement', 'refund-policy'];
  }
  return ['terms', 'privacy'];
}
