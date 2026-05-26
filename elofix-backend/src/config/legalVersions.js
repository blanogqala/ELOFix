/** Current published legal document versions — bump when documents change. */
const LEGAL_VERSIONS = {
  terms: process.env.LEGAL_TERMS_VERSION || "2026-05-01",
  privacy: process.env.LEGAL_PRIVACY_VERSION || "2026-05-01",
  providerAgreement: process.env.LEGAL_PROVIDER_AGREEMENT_VERSION || "2026-05-01",
  refundPolicy: process.env.LEGAL_REFUND_POLICY_VERSION || "2026-05-01",
};

module.exports = { LEGAL_VERSIONS };
