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
        deliveryPolicyVersion: data.deliveryPolicyVersion || null,
        paymentIntentId: data.paymentIntentId || null,
        merchantReference: data.merchantReference || null,
        jobId: data.jobId || null,
        materialOrderId: data.materialOrderId || null,
        paymentIntentKind: data.paymentIntentKind || null,
        paymentType: data.paymentType || null,
        acceptedAt: data.acceptedAt || new Date(),
      },
    });
  } catch (e) {
    console.error("[legalAcceptance] history write failed", e?.message || e);
  }
}

/** Customer eCommerce payment kinds that require transaction-level checkout acceptance. */
const CUSTOMER_CHECKOUT_KINDS = new Set([
  "LABOR",
  "MATERIAL_ORDER",
  "JOB_STORE_ORDER",
  "DELIVERY_FEE",
]);

/**
 * Materials / delivery-fee intents relate to physical goods movement and must
 * acknowledge Delivery & Collection Policy in addition to Refund Policy.
 * All current DELIVERY_FEE customer checkouts are materials courier / store delivery.
 */
function checkoutRequiresDeliveryPolicy(kind) {
  const k = String(kind || "").toUpperCase();
  return k === "MATERIAL_ORDER" || k === "JOB_STORE_ORDER" || k === "DELIVERY_FEE";
}

function isCustomerCheckoutPaymentKind(kind) {
  return CUSTOMER_CHECKOUT_KINDS.has(String(kind || "").toUpperCase());
}

/**
 * Validate transaction-specific checkout legal acceptance.
 * Backend is authoritative for current policy versions — client versions must match.
 * @returns {{ refundPolicyVersion: string, deliveryPolicyVersion: string|null, requiresDelivery: boolean }}
 */
function validateCheckoutLegalAcceptance(legalAcceptance, kind) {
  const kindNorm = String(kind || "").toUpperCase();
  if (!isCustomerCheckoutPaymentKind(kindNorm)) {
    return null;
  }

  const la = legalAcceptance && typeof legalAcceptance === "object" ? legalAcceptance : null;
  if (!la || !truthy(la.refundPolicyAccepted)) {
    throw new AppError(
      "You must accept the Refund, Returns & Cancellation Policy before payment.",
      400,
      "CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED"
    );
  }

  if (
    !la.refundPolicyVersion ||
    String(la.refundPolicyVersion).trim() !== String(LEGAL_VERSIONS.refundPolicy)
  ) {
    throw new AppError(
      "Our Refund, Returns & Cancellation Policy has been updated. Please review the latest version and accept it before continuing.",
      409,
      "LEGAL_POLICY_VERSION_STALE"
    );
  }

  const requiresDelivery = checkoutRequiresDeliveryPolicy(kindNorm);
  if (requiresDelivery) {
    if (!truthy(la.deliveryPolicyAcknowledged)) {
      throw new AppError(
        "You must acknowledge the Delivery & Collection Policy before payment.",
        400,
        "CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED"
      );
    }
    if (
      !la.deliveryPolicyVersion ||
      String(la.deliveryPolicyVersion).trim() !== String(LEGAL_VERSIONS.deliveryPolicy)
    ) {
      throw new AppError(
        "Our Delivery & Collection Policy has been updated. Please review the latest version and acknowledge it before continuing.",
        409,
        "LEGAL_POLICY_VERSION_STALE"
      );
    }
  }

  return {
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
    deliveryPolicyVersion: requiresDelivery ? LEGAL_VERSIONS.deliveryPolicy : null,
    requiresDelivery,
  };
}

/**
 * Persist checkout legal acceptance linked to a PaymentIntent.
 * Idempotent for the same intent + policy versions (safe on intent reuse / double-submit).
 * @param {object} [db] prisma client or transaction client
 */
async function recordCheckoutLegalAcceptance(db, {
  userId,
  paymentIntentId,
  merchantReference,
  jobId,
  materialOrderId,
  paymentIntentKind,
  paymentType,
  refundPolicyVersion,
  deliveryPolicyVersion,
}) {
  const client = db || prisma;
  const where = {
    paymentIntentId: String(paymentIntentId),
    source: "PAYMENT_CHECKOUT",
    refundPolicyVersion: String(refundPolicyVersion),
  };
  if (deliveryPolicyVersion) {
    where.deliveryPolicyVersion = String(deliveryPolicyVersion);
  } else {
    where.deliveryPolicyVersion = null;
  }

  const existing = await client.legalAcceptanceEvent.findFirst({ where });
  if (existing) {
    const nextRef = merchantReference ? String(merchantReference) : null;
    if (nextRef && existing.merchantReference !== nextRef) {
      return client.legalAcceptanceEvent.update({
        where: { id: existing.id },
        data: {
          merchantReference: nextRef,
          jobId: jobId ? String(jobId) : existing.jobId,
          materialOrderId: materialOrderId ? String(materialOrderId) : existing.materialOrderId,
          paymentType: paymentType ? String(paymentType) : existing.paymentType,
          acceptedAt: new Date(),
        },
      });
    }
    return existing;
  }

  return client.legalAcceptanceEvent.create({
    data: {
      userId: String(userId),
      role: "CUSTOMER",
      source: "PAYMENT_CHECKOUT",
      refundPolicyVersion: String(refundPolicyVersion),
      deliveryPolicyVersion: deliveryPolicyVersion ? String(deliveryPolicyVersion) : null,
      paymentIntentId: String(paymentIntentId),
      merchantReference: merchantReference ? String(merchantReference) : null,
      jobId: jobId ? String(jobId) : null,
      materialOrderId: materialOrderId ? String(materialOrderId) : null,
      paymentIntentKind: paymentIntentKind ? String(paymentIntentKind) : null,
      paymentType: paymentType ? String(paymentType) : null,
      acceptedAt: new Date(),
    },
  });
}

/** Admin-safe lookup: latest checkout acceptance for a PaymentIntent. */
async function getCheckoutLegalAcceptanceForPaymentIntent(paymentIntentId) {
  if (!paymentIntentId) return null;
  return prisma.legalAcceptanceEvent.findFirst({
    where: {
      paymentIntentId: String(paymentIntentId),
      source: "PAYMENT_CHECKOUT",
    },
    orderBy: { acceptedAt: "desc" },
    select: {
      id: true,
      userId: true,
      role: true,
      source: true,
      refundPolicyVersion: true,
      deliveryPolicyVersion: true,
      paymentIntentId: true,
      merchantReference: true,
      jobId: true,
      materialOrderId: true,
      paymentIntentKind: true,
      paymentType: true,
      acceptedAt: true,
    },
  });
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
  validateCheckoutLegalAcceptance,
  recordCheckoutLegalAcceptance,
  getCheckoutLegalAcceptanceForPaymentIntent,
  checkoutRequiresDeliveryPolicy,
  isCustomerCheckoutPaymentKind,
  CUSTOMER_CHECKOUT_KINDS,
};
