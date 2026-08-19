/** Current published legal document versions — bump when documents change. */
const LEGAL_VERSIONS = {
  terms: process.env.LEGAL_TERMS_VERSION || "2026-08-18-r2",
  privacy: process.env.LEGAL_PRIVACY_VERSION || "2026-08-18",
  providerAgreement: process.env.LEGAL_PROVIDER_AGREEMENT_VERSION || "2026-08-18-r2",
  refundPolicy: process.env.LEGAL_REFUND_POLICY_VERSION || "2026-08-18-r2",
  jobCompletionVerification: process.env.LEGAL_JOB_COMPLETION_VERSION || "2026-08-18",
  escrowPolicy: process.env.LEGAL_ESCROW_POLICY_VERSION || "2026-08-18-r2",
  disputeResolution: process.env.LEGAL_DISPUTE_RESOLUTION_VERSION || "2026-08-18-r2",
  adminInvestigation: process.env.LEGAL_ADMIN_INVESTIGATION_VERSION || "2026-08-18-r2",
  correctiveWork: process.env.LEGAL_CORRECTIVE_WORK_VERSION || "2026-08-18",
  portfolioContentRights: process.env.LEGAL_PORTFOLIO_RIGHTS_VERSION || "2026-08-18",
  providerVerification: process.env.LEGAL_PROVIDER_VERIFICATION_VERSION || "2026-08-18",
  fraudPrevention: process.env.LEGAL_FRAUD_PREVENTION_VERSION || "2026-08-18",
  deviceSecurity: process.env.LEGAL_DEVICE_SECURITY_VERSION || "2026-08-18",
  providerReputation: process.env.LEGAL_PROVIDER_REPUTATION_VERSION || "2026-08-18",
  supplierAgreement: process.env.LEGAL_SUPPLIER_AGREEMENT_VERSION || "2026-08-18",
  supplierParticipation: process.env.LEGAL_SUPPLIER_PARTICIPATION_VERSION || "2026-08-18",
  dataProcessing: process.env.LEGAL_DATA_PROCESSING_VERSION || "2026-08-18",
  communityStandards: process.env.LEGAL_COMMUNITY_STANDARDS_VERSION || "2026-08-18",
  cookiePolicy: process.env.LEGAL_COOKIE_POLICY_VERSION || "2026-08-18",
  platformActivityRecords: process.env.LEGAL_PLATFORM_ACTIVITY_VERSION || "2026-08-18",
  deliveryPolicy: process.env.LEGAL_DELIVERY_POLICY_VERSION || "2026-08-18-r2",
};

module.exports = { LEGAL_VERSIONS };
