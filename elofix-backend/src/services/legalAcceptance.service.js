const AppError = require("../utils/AppError");
const { LEGAL_VERSIONS } = require("../config/legalVersions");

function truthy(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function validateVersion(clientVersion, currentVersion, label) {
  if (!clientVersion || String(clientVersion).trim() !== String(currentVersion)) {
    throw new AppError(`${label} version mismatch. Please refresh and accept the latest documents.`, 400);
  }
}

function validateLegalAcceptance(body, role) {
  const {
    acceptedTerms,
    acceptedPrivacy,
    acceptedProviderAgreement,
    acceptedRefundPolicy,
    termsVersion,
    privacyVersion,
    providerAgreementVersion,
    refundPolicyVersion,
  } = body || {};

  if (!truthy(acceptedTerms) || !truthy(acceptedPrivacy)) {
    throw new AppError("You must accept the Terms of Service and Privacy Policy", 400);
  }

  validateVersion(termsVersion, LEGAL_VERSIONS.terms, "Terms of Service");
  validateVersion(privacyVersion, LEGAL_VERSIONS.privacy, "Privacy Policy");

  if (role === "PROVIDER") {
    if (!truthy(acceptedProviderAgreement) || !truthy(acceptedRefundPolicy)) {
      throw new AppError(
        "Providers must accept the Provider Agreement and Refund and Cancellation Policy",
        400
      );
    }
    validateVersion(providerAgreementVersion, LEGAL_VERSIONS.providerAgreement, "Provider Agreement");
    validateVersion(refundPolicyVersion, LEGAL_VERSIONS.refundPolicy, "Refund and Cancellation Policy");
  }

  return buildLegalAcceptanceData(body, role);
}

function buildLegalAcceptanceData(body, role) {
  const now = new Date();
  const base = {
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedProviderAgreement: role === "PROVIDER",
    acceptedRefundPolicy: role === "PROVIDER",
    acceptedAt: now,
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    providerAgreementVersion: role === "PROVIDER" ? LEGAL_VERSIONS.providerAgreement : null,
    refundPolicyVersion: role === "PROVIDER" ? LEGAL_VERSIONS.refundPolicy : null,
  };

  // Allow explicit flags from OAuth state when validated upstream.
  if (body && role === "PROVIDER") {
    base.acceptedProviderAgreement = truthy(body.acceptedProviderAgreement);
    base.acceptedRefundPolicy = truthy(body.acceptedRefundPolicy);
  }

  return base;
}

function getLegalVersions() {
  return { ...LEGAL_VERSIONS };
}

module.exports = {
  validateLegalAcceptance,
  buildLegalAcceptanceData,
  getLegalVersions,
  truthy,
};
