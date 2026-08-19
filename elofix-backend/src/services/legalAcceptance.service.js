const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
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

function prismaRoleFromUserRole(role) {
  const r = String(role || "").toUpperCase();
  if (r === "PROVIDER") return "PROVIDER";
  if (r === "SUPPLIER") return "SUPPLIER";
  if (r === "BRANCH_STAFF") return "BRANCH_STAFF";
  return "CUSTOMER";
}

function requiredVersionFieldsForRole(role) {
  const r = prismaRoleFromUserRole(role);
  const docs = [
    { key: "terms", field: "termsVersion", current: LEGAL_VERSIONS.terms, label: "Terms of Service" },
    { key: "privacy", field: "privacyVersion", current: LEGAL_VERSIONS.privacy, label: "Privacy Policy" },
  ];
  if (r === "PROVIDER") {
    docs.push({
      key: "providerAgreement",
      field: "providerAgreementVersion",
      current: LEGAL_VERSIONS.providerAgreement,
      label: "Provider Agreement",
    });
    docs.push({
      key: "refundPolicy",
      field: "refundPolicyVersion",
      current: LEGAL_VERSIONS.refundPolicy,
      label: "Refund, Returns & Cancellation Policy",
    });
  }
  if (r === "SUPPLIER" || r === "BRANCH_STAFF") {
    docs.push({
      key: "supplierAgreement",
      field: "supplierAgreementVersion",
      current: LEGAL_VERSIONS.supplierAgreement,
      label: "Supplier Agreement",
    });
    docs.push({
      key: "supplierParticipation",
      field: "supplierParticipationPolicyVersion",
      current: LEGAL_VERSIONS.supplierParticipation,
      label: "Supplier Participation Policy",
    });
  }
  return docs;
}

function computeLegalStatus(snapshot, role) {
  const required = requiredVersionFieldsForRole(role);
  const hasRecordedAcceptance = required.some((d) => Boolean(snapshot?.[d.field]));
  if (!hasRecordedAcceptance) {
    return {
      current: true,
      requiredDocuments: required.map((d) => ({
        key: d.key,
        label: d.label,
        currentVersion: d.current,
        acceptedVersion: null,
        stale: false,
      })),
      staleDocuments: [],
    };
  }
  const stale = required.filter((d) => String(snapshot?.[d.field] || "") !== String(d.current));
  return {
    current: stale.length === 0,
    requiredDocuments: required.map((d) => ({
      key: d.key,
      label: d.label,
      currentVersion: d.current,
      acceptedVersion: snapshot?.[d.field] || null,
      stale: String(snapshot?.[d.field] || "") !== String(d.current),
    })),
    staleDocuments: stale.map((d) => d.key),
  };
}

async function getLegalStatusForUser(userId, role) {
  const r = prismaRoleFromUserRole(role);
  if (r === "BRANCH_STAFF") {
    const bu = await prisma.branchUser.findUnique({
      where: { id: String(userId) },
      select: {
        termsVersion: true,
        privacyVersion: true,
        supplierAgreementVersion: true,
        supplierParticipationPolicyVersion: true,
      },
    });
    return computeLegalStatus(bu || {}, r);
  }
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: {
      termsVersion: true,
      privacyVersion: true,
      providerAgreementVersion: true,
      refundPolicyVersion: true,
      supplierAgreementVersion: true,
      supplierParticipationPolicyVersion: true,
    },
  });
  return computeLegalStatus(user || {}, r);
}

async function recordLegalAcceptanceEvent(userId, role, source, data) {
  try {
    await prisma.legalAcceptanceEvent.create({
      data: {
        userId: String(userId),
        role: prismaRoleFromUserRole(role),
        source: String(source || "ACCEPT"),
        termsVersion: data.termsVersion || null,
        privacyVersion: data.privacyVersion || null,
        providerAgreementVersion: data.providerAgreementVersion || null,
        refundPolicyVersion: data.refundPolicyVersion || null,
        supplierAgreementVersion: data.supplierAgreementVersion || null,
        supplierParticipationPolicyVersion: data.supplierParticipationPolicyVersion || null,
        acceptedAt: data.acceptedAt || new Date(),
      },
    });
  } catch (e) {
    console.error("[legalAcceptance] history write failed", e?.message || e);
  }
}

async function assertLegalCurrent(userId, role) {
  const status = await getLegalStatusForUser(userId, role);
  if (status.current) return status;
  throw new AppError(
    "Updated legal documents must be accepted before starting a new marketplace transaction.",
    403
  );
}

module.exports = {
  validateLegalAcceptance,
  validateBranchUserLegalAcceptance,
  buildLegalAcceptanceData,
  buildBranchUserLegalAcceptanceData,
  getLegalVersions,
  truthy,
  prismaRoleFromUserRole,
  requiredVersionFieldsForRole,
  computeLegalStatus,
  getLegalStatusForUser,
  recordLegalAcceptanceEvent,
  assertLegalCurrent,
};
