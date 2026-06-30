/** Current published legal document versions — bump when documents change. */
const LEGAL_VERSIONS = {
  terms: process.env.LEGAL_TERMS_VERSION || "2026-06-24",
  privacy: process.env.LEGAL_PRIVACY_VERSION || "2026-06-24",
  providerAgreement: process.env.LEGAL_PROVIDER_AGREEMENT_VERSION || "2026-06-29",
  refundPolicy: process.env.LEGAL_REFUND_POLICY_VERSION || "2026-06-29",
  jobCompletionVerification: process.env.LEGAL_JOB_COMPLETION_VERSION || "2026-06-24",
  escrowPolicy: process.env.LEGAL_ESCROW_POLICY_VERSION || "2026-06-29",
  disputeResolution: process.env.LEGAL_DISPUTE_RESOLUTION_VERSION || "2026-06-29",
  adminInvestigation: process.env.LEGAL_ADMIN_INVESTIGATION_VERSION || "2026-06-24",
  correctiveWork: process.env.LEGAL_CORRECTIVE_WORK_VERSION || "2026-06-24",
  portfolioContentRights: process.env.LEGAL_PORTFOLIO_RIGHTS_VERSION || "2026-06-24",
  providerVerification: process.env.LEGAL_PROVIDER_VERIFICATION_VERSION || "2026-06-24",
  fraudPrevention: process.env.LEGAL_FRAUD_PREVENTION_VERSION || "2026-06-24",
  deviceSecurity: process.env.LEGAL_DEVICE_SECURITY_VERSION || "2026-06-24",
  providerReputation: process.env.LEGAL_PROVIDER_REPUTATION_VERSION || "2026-06-24",
  supplierAgreement: process.env.LEGAL_SUPPLIER_AGREEMENT_VERSION || "2026-06-24",
  supplierParticipation: process.env.LEGAL_SUPPLIER_PARTICIPATION_VERSION || "2026-06-24",
  dataProcessing: process.env.LEGAL_DATA_PROCESSING_VERSION || "2026-06-24",
  communityStandards: process.env.LEGAL_COMMUNITY_STANDARDS_VERSION || "2026-06-24",
  cookiePolicy: process.env.LEGAL_COOKIE_POLICY_VERSION || "2026-06-24",
  platformActivityRecords: process.env.LEGAL_PLATFORM_ACTIVITY_VERSION || "2026-06-24",
};

module.exports = { LEGAL_VERSIONS };
