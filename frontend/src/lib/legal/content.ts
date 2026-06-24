import type { LegalDocumentId } from './versions';

export interface LegalSection {
  id: string;
  title: string;
  content: string[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  subtitle: string;
  effectiveDate: string;
  version: string;
  sections: LegalSection[];
}

export { termsOfService } from './documents/terms';
export { privacyPolicy } from './documents/privacy';
export { providerAgreement, refundPolicy } from './documents/core-agreements';
export { jobCompletionVerification, escrowPolicy } from './documents/payment-policies';
export { disputeResolution, adminInvestigation, correctiveWork } from './documents/dispute-policies';
export {
  portfolioContentRights,
  providerVerification,
  fraudPrevention,
  deviceSecurity,
  providerReputation,
  platformActivityRecords,
} from './documents/trust-policies';
export { supplierAgreement, supplierParticipation } from './documents/supplier-policies';
export { dataProcessing, communityStandards, cookiePolicy } from './documents/privacy-ext';

import { termsOfService } from './documents/terms';
import { privacyPolicy } from './documents/privacy';
import { providerAgreement, refundPolicy } from './documents/core-agreements';
import { jobCompletionVerification, escrowPolicy } from './documents/payment-policies';
import { disputeResolution, adminInvestigation, correctiveWork } from './documents/dispute-policies';
import {
  portfolioContentRights,
  providerVerification,
  fraudPrevention,
  deviceSecurity,
  providerReputation,
  platformActivityRecords,
} from './documents/trust-policies';
import { supplierAgreement, supplierParticipation } from './documents/supplier-policies';
import { dataProcessing, communityStandards, cookiePolicy } from './documents/privacy-ext';

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: termsOfService,
  privacy: privacyPolicy,
  'provider-agreement': providerAgreement,
  'refund-policy': refundPolicy,
  'job-completion-verification': jobCompletionVerification,
  'escrow-policy': escrowPolicy,
  'dispute-resolution': disputeResolution,
  'admin-investigation': adminInvestigation,
  'corrective-work': correctiveWork,
  'portfolio-content-rights': portfolioContentRights,
  'provider-verification': providerVerification,
  'fraud-prevention': fraudPrevention,
  'device-security': deviceSecurity,
  'provider-reputation': providerReputation,
  'supplier-agreement': supplierAgreement,
  'supplier-participation': supplierParticipation,
  'data-processing': dataProcessing,
  'community-standards': communityStandards,
  'cookie-policy': cookiePolicy,
  'platform-activity-records': platformActivityRecords,
};

export function getLegalDocument(id: LegalDocumentId): LegalDocument {
  return LEGAL_DOCUMENTS[id];
}

export function getAllLegalDocuments(): LegalDocument[] {
  return Object.values(LEGAL_DOCUMENTS);
}
