/** Legal document versions — must match elofix-backend/src/config/legalVersions.js */
export const LEGAL_VERSIONS = {
  terms: '2026-06-24',
  privacy: '2026-06-24',
  providerAgreement: '2026-06-29',
  refundPolicy: '2026-06-29',
  jobCompletionVerification: '2026-06-24',
  escrowPolicy: '2026-06-29',
  disputeResolution: '2026-06-29',
  adminInvestigation: '2026-06-24',
  correctiveWork: '2026-06-24',
  portfolioContentRights: '2026-06-24',
  providerVerification: '2026-06-24',
  fraudPrevention: '2026-06-24',
  deviceSecurity: '2026-06-24',
  providerReputation: '2026-06-24',
  supplierAgreement: '2026-06-24',
  supplierParticipation: '2026-06-24',
  dataProcessing: '2026-06-24',
  communityStandards: '2026-06-24',
  cookiePolicy: '2026-06-24',
  platformActivityRecords: '2026-06-24',
} as const;

export type LegalDocumentId =
  | 'terms'
  | 'privacy'
  | 'provider-agreement'
  | 'refund-policy'
  | 'job-completion-verification'
  | 'escrow-policy'
  | 'dispute-resolution'
  | 'admin-investigation'
  | 'corrective-work'
  | 'portfolio-content-rights'
  | 'provider-verification'
  | 'fraud-prevention'
  | 'device-security'
  | 'provider-reputation'
  | 'supplier-agreement'
  | 'supplier-participation'
  | 'data-processing'
  | 'community-standards'
  | 'cookie-policy'
  | 'platform-activity-records';

export const LEGAL_ROUTES: Record<LegalDocumentId, string> = {
  terms: '/terms',
  privacy: '/privacy',
  'provider-agreement': '/provider-agreement',
  'refund-policy': '/refund-policy',
  'job-completion-verification': '/job-completion-verification',
  'escrow-policy': '/escrow-policy',
  'dispute-resolution': '/dispute-resolution',
  'admin-investigation': '/admin-investigation',
  'corrective-work': '/corrective-work',
  'portfolio-content-rights': '/portfolio-content-rights',
  'provider-verification': '/provider-verification',
  'fraud-prevention': '/fraud-prevention',
  'device-security': '/device-security',
  'provider-reputation': '/provider-reputation',
  'supplier-agreement': '/supplier-agreement',
  'supplier-participation': '/supplier-participation',
  'data-processing': '/data-processing',
  'community-standards': '/community-standards',
  'cookie-policy': '/cookie-policy',
  'platform-activity-records': '/platform-activity-records',
};

export const LEGAL_LABELS: Record<LegalDocumentId, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  'provider-agreement': 'Provider Agreement',
  'refund-policy': 'Refund and Cancellation Policy',
  'job-completion-verification': 'Job Completion Verification Policy',
  'escrow-policy': 'Escrow and Payment Protection Policy',
  'dispute-resolution': 'Dispute Resolution Policy',
  'admin-investigation': 'Admin Review and Investigation Policy',
  'corrective-work': 'Corrective Work Policy',
  'portfolio-content-rights': 'Portfolio Content Rights',
  'provider-verification': 'Provider Verification Policy',
  'fraud-prevention': 'Fraud Prevention Policy',
  'device-security': 'Device Security Policy',
  'provider-reputation': 'Provider Reputation Policy',
  'supplier-agreement': 'Supplier Agreement',
  'supplier-participation': 'Supplier Participation Policy',
  'data-processing': 'Data Processing Policy',
  'community-standards': 'Community Standards',
  'cookie-policy': 'Cookie Policy',
  'platform-activity-records': 'Platform Activity Records Policy',
};

export type LegalDocumentCategory =
  | 'marketplace'
  | 'payments'
  | 'privacy'
  | 'providers'
  | 'suppliers'
  | 'safety';

export const LEGAL_CATEGORIES: Record<LegalDocumentCategory, { label: string; documents: LegalDocumentId[] }> = {
  marketplace: {
    label: 'Marketplace',
    documents: ['terms', 'community-standards', 'refund-policy'],
  },
  payments: {
    label: 'Payments & Disputes',
    documents: ['escrow-policy', 'job-completion-verification', 'dispute-resolution', 'corrective-work'],
  },
  privacy: {
    label: 'Privacy & Data',
    documents: ['privacy', 'data-processing', 'cookie-policy', 'device-security', 'platform-activity-records'],
  },
  providers: {
    label: 'Providers',
    documents: [
      'provider-agreement',
      'provider-verification',
      'provider-reputation',
      'portfolio-content-rights',
    ],
  },
  suppliers: {
    label: 'Suppliers',
    documents: ['supplier-agreement', 'supplier-participation'],
  },
  safety: {
    label: 'Safety & Compliance',
    documents: ['fraud-prevention', 'admin-investigation'],
  },
};

/** Documents required at registration by role */
export type LegalAcceptanceRole = 'user' | 'provider' | 'supplier';

export interface LegalAcceptancePayload {
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedProviderAgreement: boolean;
  acceptedRefundPolicy: boolean;
  acceptedSupplierAgreement: boolean;
  acceptedSupplierParticipationPolicy: boolean;
  termsVersion: string;
  privacyVersion: string;
  providerAgreementVersion: string;
  refundPolicyVersion: string;
  supplierAgreementVersion: string;
  supplierParticipationPolicyVersion: string;
}

export function buildLegalAcceptancePayload(role: LegalAcceptanceRole): LegalAcceptancePayload {
  return {
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedProviderAgreement: role === 'provider',
    acceptedRefundPolicy: role === 'provider',
    acceptedSupplierAgreement: role === 'supplier',
    acceptedSupplierParticipationPolicy: role === 'supplier',
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    providerAgreementVersion: LEGAL_VERSIONS.providerAgreement,
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
    supplierAgreementVersion: LEGAL_VERSIONS.supplierAgreement,
    supplierParticipationPolicyVersion: LEGAL_VERSIONS.supplierParticipation,
  };
}

export function getRequiredDocuments(role: LegalAcceptanceRole): LegalDocumentId[] {
  if (role === 'provider') {
    return ['terms', 'privacy', 'provider-agreement', 'refund-policy'];
  }
  if (role === 'supplier') {
    return ['terms', 'privacy', 'supplier-agreement', 'supplier-participation'];
  }
  return ['terms', 'privacy'];
}
