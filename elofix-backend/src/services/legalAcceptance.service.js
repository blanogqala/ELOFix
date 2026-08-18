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
    acceptedSupplierAgreement,
    acceptedSupplierParticipationPolicy,
    termsVersion,
    privacyVersion,
    providerAgreementVersion,
    refundPolicyVersion,
    supplierAgreementVersion,
    supplierParticipationPolicyVersion,
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
    validateVersion(refundPolicyVersion, LEGAL_VERSIONS.refundPolicy, "Refund, Returns & Cancellation Policy");
  }

  if (role === "SUPPLIER") {
    if (!truthy(acceptedSupplierAgreement) || !truthy(acceptedSupplierParticipationPolicy)) {
      throw new AppError(
        "Suppliers must accept the Supplier Agreement and Supplier Participation Policy",
        400
      );
    }
    validateVersion(supplierAgreementVersion, LEGAL_VERSIONS.supplierAgreement, "Supplier Agreement");
    validateVersion(
      supplierParticipationPolicyVersion,
      LEGAL_VERSIONS.supplierParticipation,
      "Supplier Participation Policy"
    );
  }

  return buildLegalAcceptanceData(body, role);
}

function validateBranchUserLegalAcceptance(body) {
  const {
    acceptedTerms,
    acceptedPrivacy,
    acceptedSupplierAgreement,
    acceptedSupplierParticipationPolicy,
    termsVersion,
    privacyVersion,
    supplierAgreementVersion,
    supplierParticipationPolicyVersion,
  } = body || {};

  if (!truthy(acceptedTerms) || !truthy(acceptedPrivacy)) {
    throw new AppError("You must accept the Terms of Service and Privacy Policy", 400);
  }
  if (!truthy(acceptedSupplierAgreement) || !truthy(acceptedSupplierParticipationPolicy)) {
    throw new AppError(
      "Branch staff must accept the Supplier Agreement and Supplier Participation Policy",
      400
    );
  }

  validateVersion(termsVersion, LEGAL_VERSIONS.terms, "Terms of Service");
  validateVersion(privacyVersion, LEGAL_VERSIONS.privacy, "Privacy Policy");
  validateVersion(supplierAgreementVersion, LEGAL_VERSIONS.supplierAgreement, "Supplier Agreement");
  validateVersion(
    supplierParticipationPolicyVersion,
    LEGAL_VERSIONS.supplierParticipation,
    "Supplier Participation Policy"
  );

  return buildBranchUserLegalAcceptanceData();
}

function buildLegalAcceptanceData(body, role) {
  const now = new Date();
  const base = {
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedProviderAgreement: role === "PROVIDER",
    acceptedRefundPolicy: role === "PROVIDER",
    acceptedSupplierAgreement: role === "SUPPLIER",
    acceptedSupplierParticipationPolicy: role === "SUPPLIER",
    acceptedAt: now,
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    providerAgreementVersion: role === "PROVIDER" ? LEGAL_VERSIONS.providerAgreement : null,
    refundPolicyVersion: role === "PROVIDER" ? LEGAL_VERSIONS.refundPolicy : null,
    supplierAgreementVersion: role === "SUPPLIER" ? LEGAL_VERSIONS.supplierAgreement : null,
    supplierParticipationPolicyVersion:
      role === "SUPPLIER" ? LEGAL_VERSIONS.supplierParticipation : null,
  };

  if (body && role === "PROVIDER") {
    base.acceptedProviderAgreement = truthy(body.acceptedProviderAgreement);
    base.acceptedRefundPolicy = truthy(body.acceptedRefundPolicy);
  }
  if (body && role === "SUPPLIER") {
    base.acceptedSupplierAgreement = truthy(body.acceptedSupplierAgreement);
    base.acceptedSupplierParticipationPolicy = truthy(body.acceptedSupplierParticipationPolicy);
  }

  return base;
}

function buildBranchUserLegalAcceptanceData() {
  const now = new Date();
  return {
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedSupplierAgreement: true,
    acceptedSupplierParticipationPolicy: true,
    acceptedAt: now,
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    supplierAgreementVersion: LEGAL_VERSIONS.supplierAgreement,
    supplierParticipationPolicyVersion: LEGAL_VERSIONS.supplierParticipation,
  };
}

function getLegalVersions() {
  return { ...LEGAL_VERSIONS };
}

module.exports = {
  validateLegalAcceptance,
  validateBranchUserLegalAcceptance,
  buildLegalAcceptanceData,
  buildBranchUserLegalAcceptanceData,
  getLegalVersions,
  truthy,
};
